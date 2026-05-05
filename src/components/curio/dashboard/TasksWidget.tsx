import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Edit3,
  ExternalLink,
  Plus,
  RotateCcw,
  Trash2,
  CheckCircle2,
  RefreshCcw,
  SprayCan,
} from "lucide-react";
import { useCardTheme } from "../../../hooks/useCardTheme";
import { useDashboardRefresh } from "../../../hooks/useDashboardRefresh";
import { useOptimisticAction } from "../../../hooks/useOptimisticAction";
import { useWidgetSize } from "../../../hooks/useWidgetSize";
import type { ChoreItem } from "../../../services/cardTypes";
import type {
  DashboardTaskProvider,
  DashboardWidget,
} from "../../../services/dashboardTypes";
import { resolveTaskProvider } from "../../../services/dashboardProviderUtils";
import type { GoogleTask } from "../../../services/googleTasksAPI";
import type { NotionWidgetDetail, NotionWidgetItem } from "../../../services/notionMcpWidgetService";
import type { ZapierWidgetDetail, ZapierWidgetItem } from "../../../services/zapierMcpWidgetService";
import {
  addChore,
  addTask,
  completeChore,
  completeTask,
  deleteChore,
  deleteTask,
  getChores,
  getTasks,
  reopenChore,
  reopenTask,
  resetCompletedChores,
  resetCompletedTasks,
  setChores,
  setTasks,
  updateChore,
  updateTask,
} from "../../../services/chorePersistence";
import {
  useGoogleAccessToken,
  useGoogleTasksAccessToken,
  useSettingsStorageValue,
} from "../../../utils/settingsStorage";
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from "../../../utils/settings/dashboardSettings";
import { useDragReorder } from "../../../hooks/useDragReorder";
import { useSwipeableRowActions } from "../../../hooks/useSwipeableRowActions";
import { useWidgetAriaAnnouncer } from "../../../hooks/useWidgetAriaAnnouncer";
import { dashboardToastBus } from "../../../services/dashboardToastBus";
import {
  dispatchHover,
  setDashboardDragPayload,
} from "../../../services/dashboardIntents";
import { parseTaskQuickAdd } from "../../../services/quickAddParsers/taskParser";
import WidgetShell from "./WidgetShell";
import { DragReorderHandle, InlineQuickAdd, WidgetCounter, WidgetSkeleton, WidgetText } from "./widgetPrimitives";

const TasksFocusedLazy = React.lazy(() => import('./tasks/TasksFocused'));

type TaskPriority = NonNullable<ChoreItem["priority"]>;

const PRIORITY_OPTIONS: TaskPriority[] = ["low", "medium", "high"];

const normalizePriority = (value: string): TaskPriority =>
  PRIORITY_OPTIONS.includes(value as TaskPriority) ? (value as TaskPriority) : "medium";

const formatTimeOptionLabel = (minutesFromMidnight: number) => {
  const hours24 = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
};

const CHORE_TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const minutes = index * 15;
  const hours = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return {
    value: `${hours.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
    label: formatTimeOptionLabel(minutes),
  };
});

const choreControlClass =
  "rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-[11px] font-bold text-[var(--ether-on-surface)] opacity-100 outline-none focus:border-[var(--ether-primary)]/50 focus:bg-[var(--ether-control-hover)]";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const simpleMarkdownToHtml = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      const heading = trimmed.match(/^(#{1,3})\s+(.+)/);
      if (heading) {
        const level = heading[1].length + 1;
        return `<h${level}>${escapeHtml(heading[2] || "")}</h${level}>`;
      }
      return `<p>${escapeHtml(trimmed.replace(/^[-*]\s+/, ""))}</p>`;
    })
    .filter(Boolean)
    .join("");

const TASK_ROW_TOAST_ID_PREFIX = 'tasks-widget-row-';

/**
 * `TaskRow` — a thin wrapper that adds horizontal swipe + keyboard
 * commit handling to a single task list row. Keeping this as its own
 * component means `useSwipeableRowActions` is called in a stable scope
 * (once per row) instead of inside a `.map()` loop, which would violate
 * the rules of hooks.
 *
 * Consumers pass the existing row markup as `children`. The wrapper
 * adds:
 *   - `touch-action: pan-y` so vertical scrolling still works.
 *   - pointer handlers from `useSwipeGesture` (only when
 *     `swipeEnabled` is `true`).
 *   - `Shift+Enter` / `Backspace` keyboard shortcuts that fire the
 *     primary / secondary commit.
 *   - an absolutely positioned accent wash that follows the swipe
 *     progress.
 */
interface TaskRowProps {
  children: React.ReactNode;
  className: string;
  swipeEnabled: boolean;
  onPrimaryCommit: () => void;
  onSecondaryCommit: () => void;
  'data-dragging'?: 'true';
  ariaLabel: string;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
  onMouseEnter?: (event: React.MouseEvent) => void;
  onMouseLeave?: (event: React.MouseEvent) => void;
}

const TaskRow: React.FC<TaskRowProps> = ({
  children,
  className,
  swipeEnabled,
  onPrimaryCommit,
  onSecondaryCommit,
  'data-dragging': dataDragging,
  ariaLabel,
  draggable,
  onDragStart,
  onMouseEnter,
  onMouseLeave,
}) => {
  const { rowProps, visuals } = useSwipeableRowActions({
    onPrimaryCommit,
    onSecondaryCommit,
    swipeEnabled,
  });

  const translated = visuals.isSwiping && visuals.translateX !== 0;

  return (
    <div
      {...rowProps}
      role="group"
      aria-label={ariaLabel}
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      data-dragging={dataDragging}
      data-swipe-committed={
        visuals.isPastCommitThreshold ? 'true' : undefined
      }
      className={`relative ${className}`}
      style={{
        ...rowProps.style,
        transform: translated
          ? `translate3d(${visuals.translateX}px, 0, 0)`
          : undefined,
        transition:
          visuals.isSwiping || !visuals.motionProfile.shouldAnimate
            ? 'none'
            : 'transform 180ms ease-out',
      }}
    >
      {visuals.washOpacity > 0 ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            background:
              visuals.direction >= 0
                ? 'rgba(16, 185, 129, 0.55)'
                : 'rgba(239, 68, 68, 0.55)',
            opacity: visuals.washOpacity,
          }}
        />
      ) : null}
      <div className="relative flex min-w-0 flex-1 items-center gap-3">
        {children}
      </div>
    </div>
  );
};

const TasksWidget: React.FC<{ widget: DashboardWidget; focused?: boolean }> = ({ widget, focused }) => {
  if (focused) {
    return (
      <React.Suspense fallback={<WidgetSkeleton variant="list" />}>
        <TasksFocusedLazy widget={widget} focused />
      </React.Suspense>
    );
  }

  return <TasksWidgetCompact widget={widget} />;
};

const TasksWidgetCompact: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const isChoresWidget = widget.type === "chores";
  const googleAccessToken = useGoogleAccessToken();
  const googleTasksToken = useGoogleTasksAccessToken();
  const internalTasks = useSettingsStorageValue<ChoreItem[]>(
    isChoresWidget ? getChores : getTasks,
    [],
  );

  const [draft, setDraft] = useState("");
  const [draftPriority, setDraftPriority] = useState<TaskPriority>("medium");
  const [choreCategory, setChoreCategory] = useState("General");
  const [choreDueDate, setChoreDueDate] = useState("");
  const [choreDueTime, setChoreDueTime] = useState("");
  const [googleTasks, setGoogleTasks] = useState<GoogleTask[]>([]);
  const [notionTasks, setNotionTasks] = useState<NotionWidgetItem[]>([]);
  const [zapierTasks, setZapierTasks] = useState<ZapierWidgetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [notionDetail, setNotionDetail] = useState<NotionWidgetDetail | null>(null);
  const [notionDetailLoading, setNotionDetailLoading] = useState(false);
  const [zapierDetail, setZapierDetail] = useState<ZapierWidgetDetail | null>(null);
  const [zapierDetailLoading, setZapierDetailLoading] = useState(false);
  const mountedRef = useRef(true);
  const requestSeqRef = useRef(0);

  const preferredProvider = (widget.config.taskProvider ||
    "internal") as DashboardTaskProvider;
  const hasGoogleTaskAuthPath = Boolean(
    googleTasksToken || googleAccessToken,
  );
  const provider = resolveTaskProvider(
    preferredProvider,
    googleTasksToken,
    hasGoogleTaskAuthPath,
  );
  // `zapier` and `mcp` both render the same way in this widget (both go
  // through the server-aware Zapier/MCP helper which returns the same
  // item shape). Keep the UI branches unified with this alias so
  // condition checks do not multiply.
  const isZapierLike = provider === "zapier" || provider === "mcp";
  const maxItems = useMemo(() => {
    const layoutMaxItems = size.pixelHeight < 340 ? 2 : size.pixelHeight < 500 ? 4 : size.isTall ? 8 : 5;
    return Math.max(1, Math.min(Number(widget.config.maxItems || layoutMaxItems), layoutMaxItems));
  }, [size.isTall, size.pixelHeight, widget.config.maxItems]);

  const loadGoogleTasks = useCallback(async (background = false) => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;

    if (provider !== "google") {
      setGoogleTasks([]);
      return;
    }

    if (!background) setLoading(true);
    setSyncError(null);
    try {
      const { listGoogleTasks } =
        await import("../../../services/googleTasksAPI");
      const nextTasks = await listGoogleTasks(100);
      if (!mountedRef.current || requestSeqRef.current !== requestSeq) return;
      setGoogleTasks(nextTasks);
    } catch (error) {
      if (!mountedRef.current || requestSeqRef.current !== requestSeq) return;
      setSyncError((error as Error).message || "Could not load Google Tasks.");
      setGoogleTasks([]);
    } finally {
      if (mountedRef.current && requestSeqRef.current === requestSeq) {
        setLoading(false);
      }
    }
  }, [maxItems, provider]);

  const loadNotionTasks = useCallback(async (background = false) => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;

    if (provider !== "notion") {
      setNotionTasks([]);
      return;
    }

    if (!background) setLoading(true);
    setSyncError(null);
    try {
      const { listNotionWidgetItems } =
        await import("../../../services/notionMcpWidgetService");
      const nextTasks = await listNotionWidgetItems({
        kind: "projects",
        query: String(widget.config.notionQuery || "projects tasks"),
        maxItems: Number(widget.config.maxItems || 50),
      });
      if (!mountedRef.current || requestSeqRef.current !== requestSeq) return;
      setNotionTasks(nextTasks);
    } catch (error) {
      if (!mountedRef.current || requestSeqRef.current !== requestSeq) return;
      setSyncError((error as Error).message || "Could not load Notion projects.");
      setNotionTasks([]);
    } finally {
      if (mountedRef.current && requestSeqRef.current === requestSeq) {
        setLoading(false);
      }
    }
  }, [provider, widget.config.maxItems, widget.config.notionQuery]);

  const loadZapierTasks = useCallback(async (background = false) => {
    // Serves both the `zapier` and `mcp` task providers: `mcp` is routed
    // through the server-aware helper so any enabled general MCP server
    // (including an internal amzn-mcp) can feed the tasks list.
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;

    if (provider !== "zapier" && provider !== "mcp") {
      setZapierTasks([]);
      return;
    }

    if (!background) setLoading(true);
    setSyncError(null);
    try {
      const zapierMcpService = await import("../../../services/zapierMcpWidgetService");
      const nextTasks = provider === "mcp"
        ? await zapierMcpService.listMcpWidgetItems({
            serverId: widget.config.mcpServerId,
            toolName: widget.config.mcpToolName,
            kind: "tasks",
            query: String(widget.config.mcpQuery || widget.config.zapierQuery || "open tasks"),
            maxItems: Number(widget.config.maxItems || 50),
          })
        : await zapierMcpService.listZapierWidgetItems({
            kind: "tasks",
            query: String(widget.config.zapierQuery || "open tasks"),
            maxItems: Number(widget.config.maxItems || 50),
          });
      if (!mountedRef.current || requestSeqRef.current !== requestSeq) return;
      setZapierTasks(nextTasks);
    } catch (error) {
      if (!mountedRef.current || requestSeqRef.current !== requestSeq) return;
      setSyncError((error as Error).message || "Could not load tasks.");
      setZapierTasks([]);
    } finally {
      if (mountedRef.current && requestSeqRef.current === requestSeq) {
        setLoading(false);
      }
    }
  }, [
    provider,
    widget.config.maxItems,
    widget.config.zapierQuery,
    widget.config.mcpQuery,
    widget.config.mcpServerId,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestSeqRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (provider !== "google") {
      setGoogleTasks([]);
    }
    if (provider !== "notion") {
      setNotionTasks([]);
      setNotionDetail(null);
    }
    if (!isZapierLike) {
      setZapierTasks([]);
      setZapierDetail(null);
    }
  }, [provider, isZapierLike]);

  useEffect(() => {
    if (provider === "notion") {
      void loadNotionTasks();
    }
    if (isZapierLike) {
      void loadZapierTasks();
    }
  }, [loadNotionTasks, loadZapierTasks, provider, isZapierLike]);

  const { refreshNow } = useDashboardRefresh({
    widget,
    enabled: provider === "google" || provider === "notion" || isZapierLike,
    onRefresh: (background) => {
      if (provider === "notion") return loadNotionTasks(background);
      if (isZapierLike) return loadZapierTasks(background);
      return loadGoogleTasks(background);
    },
  });

  const activeInternalTasks = useMemo(() => {
    return [...internalTasks]
      .filter((task) => !task.completed)
      .sort((left, right) => {
        const priorityScore = { high: 3, medium: 2, low: 1, undefined: 0 };
        return (
          (priorityScore[right.priority || "medium"] || 0) -
          (priorityScore[left.priority || "medium"] || 0)
        );
      });
  }, [internalTasks]);

  const completedInternalTasks = useMemo(() => {
    return [...internalTasks]
      .filter((task) => task.completed)
      .sort((left, right) => {
        const leftCompleted = Date.parse(left.lastCompleted || "");
        const rightCompleted = Date.parse(right.lastCompleted || "");
        if (Number.isFinite(leftCompleted) && Number.isFinite(rightCompleted))
          return rightCompleted - leftCompleted;
        if (Number.isFinite(leftCompleted)) return -1;
        if (Number.isFinite(rightCompleted)) return 1;
        return left.name.localeCompare(right.name);
      });
  }, [internalTasks]);

  const activeGoogleTasks = useMemo(() => {
    return [...googleTasks]
      .filter((task) => task.status !== "completed")
      .sort((left, right) => {
        const leftDue = Date.parse(left.due || "");
        const rightDue = Date.parse(right.due || "");
        if (Number.isFinite(leftDue) && Number.isFinite(rightDue))
          return leftDue - rightDue;
        if (Number.isFinite(leftDue)) return -1;
        if (Number.isFinite(rightDue)) return 1;
        return left.title.localeCompare(right.title);
      });
  }, [googleTasks]);

  const completedGoogleTasks = useMemo(() => {
    return [...googleTasks]
      .filter((task) => task.status === "completed")
      .sort((left, right) => left.title.localeCompare(right.title));
  }, [googleTasks]);

  const isCompletedNotionItem = (task: NotionWidgetItem) =>
    /done|complete|completed|shipped|closed/i.test(task.status || "");

  const activeNotionTasks = useMemo(() => (
    [...notionTasks]
      .filter((task) => !isCompletedNotionItem(task))
      .sort((left, right) => {
        const leftDue = Date.parse(left.dueDate || "");
        const rightDue = Date.parse(right.dueDate || "");
        if (Number.isFinite(leftDue) && Number.isFinite(rightDue))
          return leftDue - rightDue;
        if (Number.isFinite(leftDue)) return -1;
        if (Number.isFinite(rightDue)) return 1;
        return left.title.localeCompare(right.title);
      })
  ), [notionTasks]);

  const isCompletedZapierItem = (task: ZapierWidgetItem) =>
    /done|complete|completed|shipped|closed/i.test(task.status || "");

  const activeZapierTasks = useMemo(() => (
    [...zapierTasks]
      .filter((task) => !isCompletedZapierItem(task))
      .sort((left, right) => {
        const leftDue = Date.parse(left.dueDate || "");
        const rightDue = Date.parse(right.dueDate || "");
        if (Number.isFinite(leftDue) && Number.isFinite(rightDue))
          return leftDue - rightDue;
        if (Number.isFinite(leftDue)) return -1;
        if (Number.isFinite(rightDue)) return 1;
        return left.title.localeCompare(right.title);
      })
  ), [zapierTasks]);

  const completedNotionTasks = useMemo(() => (
    [...notionTasks]
      .filter((task) => isCompletedNotionItem(task))
      .sort((left, right) => left.title.localeCompare(right.title))
  ), [notionTasks]);

  const completedZapierTasks = useMemo(() => (
    [...zapierTasks]
      .filter((task) => isCompletedZapierItem(task))
      .sort((left, right) => left.title.localeCompare(right.title))
  ), [zapierTasks]);

  const activeTasks =
    isZapierLike ? activeZapierTasks : provider === "notion" ? activeNotionTasks : provider === "google" ? activeGoogleTasks : activeInternalTasks;
  const completedTasks =
    isZapierLike ? completedZapierTasks : provider === "notion" ? completedNotionTasks : provider === "google" ? completedGoogleTasks : completedInternalTasks;
  const displayedTasks = showCompleted ? completedTasks : activeTasks;
  const completedCount =
    isZapierLike
      ? completedZapierTasks.length
      : provider === "notion"
      ? completedNotionTasks.length
      : provider === "google"
      ? googleTasks.filter((task) => task.status === "completed").length
      : internalTasks.filter((task) => task.completed).length;
  const totalCount =
    isZapierLike ? zapierTasks.length : provider === "notion" ? notionTasks.length : provider === "google" ? googleTasks.length : internalTasks.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const usesTwoColumnTallLayout = size.w <= 2 && size.h >= 3;
  const usesCompactCreateRow =
    usesTwoColumnTallLayout || size.w <= 2 || size.pixelWidth < 360;
  const usesNarrowChrome = usesTwoColumnTallLayout || size.pixelWidth < 280;
  const usesStackedCreateRow =
    usesTwoColumnTallLayout || size.pixelWidth < 260;
  const widgetTitle = provider === "mcp" || preferredProvider === "mcp"
    ? "MCP Tasks"
    : provider === "zapier" || preferredProvider === "zapier"
    ? "Zapier Tasks"
    : provider === "notion" || preferredProvider === "notion"
    ? "Notion Projects"
    : provider === "google" || preferredProvider === "google"
    ? "Google Tasks"
    : isChoresWidget
      ? "Chores"
      : usesNarrowChrome
      ? "Tasks"
      : "Tasks & Routines";
  const widgetIcon = isChoresWidget
    ? <SprayCan size={14} />
    : <CheckCircle2 size={14} />;

  const boardInteractivity = useDashboardInteractivitySettings();
  const rollingEnabled = effectiveToggle(
    'rollingNumbersEnabled',
    boardInteractivity,
    widget.config,
  );
  const dragReorderEnabled = effectiveToggle(
    'dragReorderEnabled',
    boardInteractivity,
    widget.config,
  );
  // Drag-reorder only applies to the internal provider: Google /
  // Notion / Zapier / MCP item order is server-defined.
  const internalDragReorderActive = dragReorderEnabled && provider === 'internal';
  const handleReorderInternal = useCallback(
    (nextVisible: ChoreItem[]) => {
      // The displayed list is a filtered subset of `internalTasks`
      // (either "active" or "completed"). Preserve the hidden subset's
      // position by rewriting only the slots the visible subset occupies
      // in the full stored list.
      const visibleIds = new Set(nextVisible.map((t) => t.id));
      const queue = [...nextVisible];
      const nextStored = internalTasks.map((t) =>
        visibleIds.has(t.id) ? (queue.shift() || t) : t,
      );
      (isChoresWidget ? setChores : setTasks)(nextStored);
    },
    [internalTasks, isChoresWidget],
  );
  const displayedInternalTasks = showCompleted
    ? completedInternalTasks
    : activeInternalTasks;
  const {
    getRowBindings: getRowBindingsInternal,
    announcement: dragAnnouncement,
  } = useDragReorder<ChoreItem>(
    displayedInternalTasks,
    handleReorderInternal,
    {
      keyExtractor: (item) => item.id,
      enabled: internalDragReorderActive,
    },
  );

  useWidgetAriaAnnouncer(
    widget.id,
    `${activeTasks.length} open ${isChoresWidget ? 'chore' : 'task'}${activeTasks.length === 1 ? '' : 's'}`,
  );

  const openNotionDetail = async (item: NotionWidgetItem) => {
    setNotionDetail({
      ...item,
      content: item.preview || item.title,
    });
    setNotionDetailLoading(true);
    setSyncError(null);
    try {
      const { fetchNotionWidgetItem } =
        await import("../../../services/notionMcpWidgetService");
      const detail = await fetchNotionWidgetItem(item);
      if (!mountedRef.current) return;
      setNotionDetail(detail);
    } catch (error) {
      if (!mountedRef.current) return;
      setSyncError((error as Error).message || "Could not read Notion project.");
    } finally {
      if (mountedRef.current) {
        setNotionDetailLoading(false);
      }
    }
  };

  const renderNotionDetail = (item: NotionWidgetDetail) => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-start gap-3">
        <button
          type="button"
          onClick={() => setNotionDetail(null)}
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)]"
          aria-label="Back to Notion projects"
        >
          <ArrowLeft size={14} />
        </button>
        <div className="min-w-0 flex-1">
          <WidgetText variant="label" tone="faint">
            {[item.status, item.dueDate].filter(Boolean).join(" - ") || "Notion"}
          </WidgetText>
          <h3 className="mt-1 truncate text-lg font-semibold text-[var(--ether-on-surface)]">
            {item.title}
          </h3>
        </div>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)]"
            aria-label="Open in Notion"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>
      {notionDetailLoading ? (
        <div className="flex flex-1 items-center justify-center opacity-60">Loading Notion project...</div>
      ) : (
        <div
          className="dashboard-widget-touch-scroll min-h-0 flex-1 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] p-4 text-sm leading-6 text-[var(--ether-on-surface)]"
          dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(item.content || item.preview || item.title) }}
        />
      )}
    </div>
  );

  const openZapierDetail = async (item: ZapierWidgetItem) => {
    setZapierDetail({
      ...item,
      content: item.preview || item.title,
    });
    setZapierDetailLoading(true);
    setSyncError(null);
    try {
      const svc = await import("../../../services/zapierMcpWidgetService");
      const detail = provider === "mcp"
        ? await svc.fetchMcpWidgetItem(item, {
            serverId: widget.config.mcpServerId,
            toolName: widget.config.mcpToolName,
            kind: "tasks",
          })
        : await svc.fetchZapierWidgetItem(item);
      if (!mountedRef.current) return;
      setZapierDetail(detail);
    } catch (error) {
      if (!mountedRef.current) return;
      setSyncError((error as Error).message || (provider === "mcp" ? "Could not read MCP task." : "Could not read Zapier task."));
    } finally {
      if (mountedRef.current) {
        setZapierDetailLoading(false);
      }
    }
  };

  const renderZapierDetail = (item: ZapierWidgetDetail) => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-start gap-3">
        <button
          type="button"
          onClick={() => setZapierDetail(null)}
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)]"
          aria-label={provider === "mcp" ? "Back to MCP tasks" : "Back to Zapier tasks"}
        >
          <ArrowLeft size={14} />
        </button>
        <div className="min-w-0 flex-1">
          <WidgetText variant="label" tone="faint">
            {[item.status, item.dueDate].filter(Boolean).join(" - ") || (provider === "mcp" ? "MCP" : "Zapier")}
          </WidgetText>
          <h3 className="mt-1 truncate text-lg font-semibold text-[var(--ether-on-surface)]">
            {item.title}
          </h3>
        </div>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)]"
            aria-label="Open Zapier source"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>
      {zapierDetailLoading ? (
        <div className="flex flex-1 items-center justify-center opacity-60">Loading Zapier task...</div>
      ) : (
        <div
          className="dashboard-widget-touch-scroll min-h-0 flex-1 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] p-4 text-sm leading-6 text-[var(--ether-on-surface)]"
          dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(item.content || item.preview || item.title) }}
        />
      )}
    </div>
  );

  const renderHeaderActions = (compact = false) => (
    <div
      data-testid="tasks-widget-header-actions"
      className={`flex items-center ${compact ? "gap-1" : "gap-3"}`}
    >
      <span
        className={`${compact ? "text-[9px]" : "text-[10px]"} font-bold tabular-nums ${theme.onSurfaceVariant}`}
      >
        {completedCount}/{totalCount}
      </span>
      <button
        type="button"
        onClick={() => setShowCompleted((value) => !value)}
        className={`dashboard-widget-control-button ${
          showCompleted ? "dashboard-widget-control-button-active" : ""
        }`}
        aria-label={showCompleted ? "Show active tasks" : "Show completed tasks"}
      >
        <CheckCircle2 size={compact ? 12 : 13} />
      </button>
      <button
        type="button"
        onClick={handleSecondaryAction}
        className="dashboard-widget-control-button"
        aria-label={
        provider === "google" || provider === "notion"
          || isZapierLike
            ? "Refresh tasks"
            : isChoresWidget
              ? "Reset completed chores"
              : "Reset completed tasks"
        }
      >
        {provider === "google" || provider === "notion" || isZapierLike ? (
          <RefreshCcw
            size={compact ? 12 : 13}
            className={loading ? "animate-spin" : ""}
          />
        ) : (
          <RotateCcw size={compact ? 12 : 13} />
        )}
      </button>
    </div>
  );

  const handleCreate = async () => {
    const value = draft.trim();
    if (!value) return;

    if (provider === "google") {
      try {
        const { createGoogleTask } =
          await import("../../../services/googleTasksAPI");
        await createGoogleTask(googleTasksToken, value);
        setDraft("");
        await loadGoogleTasks();
      } catch (error) {
        setSyncError(
          (error as Error).message || "Could not create Google Task.",
        );
      }
      return;
    }

    if (provider === "notion") {
      setSyncError("Creating Notion tasks from widgets needs a Notion database source. Add items in Notion, then refresh here.");
      return;
    }

    if (provider === "zapier") {
      setSyncError("Create Zapier-backed tasks in the connected app, then refresh here.");
      return;
    }

    if (provider === "mcp") {
      setSyncError("Create these tasks in the MCP's source app, then refresh here.");
      return;
    }

    const addLocalItem = isChoresWidget ? addChore : addTask;
    const updateLocalItem = isChoresWidget ? updateChore : updateTask;
    const chore = addLocalItem(value, undefined, draftPriority);
    if (isChoresWidget) {
      const dueDateTime = choreDueDate && choreDueTime ? `${choreDueDate}T${choreDueTime}` : undefined;
      updateLocalItem(chore.id, {
        category: choreCategory.trim() || "General",
        dueDate: choreDueDate || undefined,
        dueDateTime,
      });
      setChoreDueDate("");
      setChoreDueTime("");
    }
    setDraft("");
  };

  // Ref to hold the Google Task being toggled for the optimistic action.
  const googleCompleteTargetRef = useRef<{ taskId: string; completed: boolean } | null>(null);

  const optimisticGoogleComplete = useOptimisticAction<GoogleTask[]>(
    googleTasks,
    setGoogleTasks,
    {
      apply: (prev) => {
        const target = googleCompleteTargetRef.current;
        if (!target) return prev;
        const nextStatus = target.completed ? "needsAction" : "completed";
        return prev.map((t) =>
          t.id === target.taskId ? { ...t, status: nextStatus } : t,
        );
      },
      commit: async () => {
        const target = googleCompleteTargetRef.current;
        if (!target) throw new Error("No target task");
        const { updateGoogleTask } =
          await import("../../../services/googleTasksAPI");
        await updateGoogleTask(target.taskId, {
          status: target.completed ? "needsAction" : "completed",
        });
        await loadGoogleTasks();
      },
      retryLabel: "Could not update task. Tap to retry.",
      errorToastId: `tasks-google-complete-${widget.id}`,
    },
  );

  const handleComplete = async (taskId: string, completed: boolean) => {
    if (provider === "google") {
      googleCompleteTargetRef.current = { taskId, completed };
      await optimisticGoogleComplete.run();
      return;
    }

    if (provider === "notion") {
      setSyncError("Notion project updates are read-only in this widget for now.");
      return;
    }

    if (provider === "zapier") {
      setSyncError("Zapier task updates are read-only in this widget for now.");
      return;
    }

    if (provider === "mcp") {
      setSyncError("MCP task updates are read-only in this widget for now.");
      return;
    }

    if (completed) {
      (isChoresWidget ? reopenChore : reopenTask)(taskId);
    } else {
      (isChoresWidget ? completeChore : completeTask)(taskId);
    }
  };

  const beginEdit = (task: ChoreItem | GoogleTask | NotionWidgetItem | ZapierWidgetItem) => {
    setEditingTaskId(task.id);
    setEditingTitle("name" in task ? task.name : task.title);
  };

  const cancelEdit = () => {
    setEditingTaskId(null);
    setEditingTitle("");
  };

  const saveEdit = async (taskId: string) => {
    const nextTitle = editingTitle.trim();
    if (!nextTitle) {
      cancelEdit();
      return;
    }

    if (provider === "google") {
      try {
        const { updateGoogleTask } =
          await import("../../../services/googleTasksAPI");
        await updateGoogleTask(taskId, { title: nextTitle });
        cancelEdit();
        await loadGoogleTasks();
      } catch (error) {
        setSyncError((error as Error).message || "Could not update Google Task.");
      }
      return;
    }

    if (provider === "notion") {
      setSyncError("Edit this Notion item in Notion, then refresh the widget.");
      cancelEdit();
      return;
    }

    if (provider === "zapier") {
      setSyncError("Edit this Zapier item in its source app, then refresh the widget.");
      cancelEdit();
      return;
    }

    if (provider === "mcp") {
      setSyncError("Edit this item in the MCP's source app, then refresh the widget.");
      cancelEdit();
      return;
    }

    (isChoresWidget ? updateChore : updateTask)(taskId, { name: nextTitle });
    cancelEdit();
  };

  const handleDelete = async (taskId: string) => {
    if (provider === "google") {
      try {
        const { deleteGoogleTask } =
          await import("../../../services/googleTasksAPI");
        await deleteGoogleTask(taskId);
        await loadGoogleTasks();
      } catch (error) {
        setSyncError(
          (error as Error).message || "Could not delete Google Task.",
        );
      }
      return;
    }

    if (provider === "notion") {
      setSyncError("Delete this Notion item in Notion, then refresh the widget.");
      return;
    }

    if (provider === "zapier") {
      setSyncError("Delete this Zapier item in its source app, then refresh the widget.");
      return;
    }

    if (provider === "mcp") {
      setSyncError("Delete this item in the MCP's source app, then refresh the widget.");
      return;
    }

    (isChoresWidget ? deleteChore : deleteTask)(taskId);
  };

  const handleSecondaryAction = () => {
    if (provider === "google" || provider === "notion" || isZapierLike) {
      refreshNow(false);
      return;
    }
    (isChoresWidget ? resetCompletedChores : resetCompletedTasks)();
  };

  const handlePriorityChange = (taskId: string, priority: TaskPriority) => {
    (isChoresWidget ? updateChore : updateTask)(taskId, { priority });
  };

  const swipeGesturesEnabled = effectiveToggle(
    'swipeGesturesEnabled',
    boardInteractivity,
    widget.config,
  );
  const undoToastsEnabled = boardInteractivity.undoToastsEnabled;
  const hoverBusEnabled = effectiveToggle(
    'hoverSelectionBusEnabled',
    boardInteractivity,
    widget.config,
  );
  const inlineQuickAddEnabled = effectiveToggle(
    'inlineQuickAddEnabled',
    boardInteractivity,
    widget.config,
  );
  // Inline quick-add is only wired for the internal provider. Google
  // still supports the full add flow (title-only), but routing it
  // through InlineQuickAdd would require collapsing the verbose form
  // below into parser-only output and losing the per-item date/time
  // picker that chores need. Keep the fallback path for everything
  // else.
  const quickAddActive = inlineQuickAddEnabled && provider === 'internal';
  const handleQuickAddSubmit = useCallback(
    (parsed: { title: string; dueAt?: number; priority?: 'low' | 'medium' | 'high' }) => {
      const addLocal = isChoresWidget ? addChore : addTask;
      const updateLocal = isChoresWidget ? updateChore : updateTask;
      const item = addLocal(
        parsed.title,
        undefined,
        parsed.priority || draftPriority,
      );
      const patch: Partial<Omit<ChoreItem, 'id'>> = {};
      if (parsed.dueAt !== undefined) {
        const due = new Date(parsed.dueAt);
        patch.dueDate = due.toISOString().slice(0, 10);
        patch.dueDateTime = due.toISOString();
      }
      if (isChoresWidget) {
        patch.category = choreCategory.trim() || 'General';
        if (!patch.dueDate && choreDueDate) patch.dueDate = choreDueDate;
        if (!patch.dueDateTime && choreDueDate && choreDueTime) {
          patch.dueDateTime = `${choreDueDate}T${choreDueTime}`;
        }
      }
      if (Object.keys(patch).length > 0) {
        updateLocal(item.id, patch);
      }
      if (isChoresWidget) {
        setChoreDueDate('');
        setChoreDueTime('');
      }
    },
    [choreCategory, choreDueDate, choreDueTime, draftPriority, isChoresWidget],
  );
  // Swipe commits only apply to the internal provider; Google supports
  // writes but goes through the async network path (the existing
  // `handleComplete` / `handleDelete` handle errors with a syncError
  // surface). Notion / Zapier / MCP are read-only in this widget. To
  // keep the contract simple and the undo restoration deterministic,
  // we only enable row-level swipe commits on the internal provider.
  const rowSwipeEnabled = swipeGesturesEnabled && provider === 'internal';

  const commitInternalComplete = useCallback(
    (taskId: string, isCompleted: boolean) => {
      if (provider !== 'internal') return;
      if (isCompleted) {
        // Already completed — swipe-right is a no-op to avoid reopening
        // just because a user glanced at the row. Only open rows can be
        // "completed via swipe".
        return;
      }
      (isChoresWidget ? completeChore : completeTask)(taskId);
      if (!undoToastsEnabled) return;
      dashboardToastBus.show({
        id: `${TASK_ROW_TOAST_ID_PREFIX}complete-${taskId}`,
        label: isChoresWidget ? 'Chore completed' : 'Task completed',
        tone: 'success',
        onUndo: () => {
          (isChoresWidget ? reopenChore : reopenTask)(taskId);
        },
      });
    },
    [isChoresWidget, provider, undoToastsEnabled],
  );

  const commitInternalRemove = useCallback(
    (task: ChoreItem) => {
      if (provider !== 'internal') return;
      // Snapshot the task and its position in the full stored list so
      // the undo can restore it verbatim.
      const snapshot = { ...task };
      const allItems = isChoresWidget ? getChores() : getTasks();
      const index = allItems.findIndex((item) => item.id === task.id);
      (isChoresWidget ? deleteChore : deleteTask)(task.id);
      if (!undoToastsEnabled) return;
      dashboardToastBus.show({
        id: `${TASK_ROW_TOAST_ID_PREFIX}remove-${task.id}`,
        label: isChoresWidget ? 'Chore removed' : 'Task removed',
        tone: 'danger',
        onUndo: () => {
          const current = isChoresWidget ? getChores() : getTasks();
          if (current.some((item) => item.id === snapshot.id)) {
            // Already restored (e.g. double-click on Undo) — nothing to
            // do.
            return;
          }
          const restored = [...current];
          const insertAt =
            index >= 0 && index <= restored.length ? index : restored.length;
          restored.splice(insertAt, 0, snapshot);
          (isChoresWidget ? setChores : setTasks)(restored);
        },
      });
    },
    [isChoresWidget, provider, undoToastsEnabled],
  );

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case "high":
        return "text-[var(--ether-error)] bg-[var(--ether-error)]/10";
      case "medium":
        return "text-[var(--ether-warning)] bg-[var(--ether-warning)]/10";
      case "low":
        return "text-[var(--ether-info)] bg-[var(--ether-info)]/10";
      default:
        return "text-[var(--ether-on-surface-variant)] bg-[var(--ether-surface-container)]";
    }
  };

  if (size.sizeClass === "tiny") {
    return (
      <WidgetShell bare accent="teal" widget={widget}>
        <div className="flex flex-1 flex-col items-center justify-center">
          <span
            className={`text-4xl font-bold tabular-nums ${theme.onSurface} ${theme.headline}`}
          >
            {rollingEnabled ? (
              <WidgetCounter
                value={activeTasks.length}
                ariaLabel={`${activeTasks.length} pending tasks`}
              />
            ) : (
              activeTasks.length
            )}
          </span>
          <WidgetText variant="label" tone="muted" align="center">
            {provider === "mcp" ? "MCP" : provider === "zapier" ? "Zapier" : provider === "notion" ? "Notion" : provider === "google" ? "Google" : "Pending"}
          </WidgetText>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      widget={widget}
      title={widgetTitle}
      icon={widgetIcon}
      accent="teal"
      glowEnabled
      rightSlot={renderHeaderActions(usesNarrowChrome)}
    >
      <div
        data-testid="tasks-widget-layout"
        className="flex h-full flex-col"
      >
        {quickAddActive ? (
          <div
            data-testid="tasks-widget-create-row"
            className={`${usesTwoColumnTallLayout ? 'mb-2' : 'mb-3'}`}
          >
            <InlineQuickAdd
              placeholder={
                isChoresWidget
                  ? 'Add a chore (e.g. "Water plants tomorrow 9am")'
                  : 'Add a task (e.g. "Email Sam in 30m !!")'
              }
              parser={(input) => parseTaskQuickAdd(input)}
              onSubmit={handleQuickAddSubmit}
              ariaLabel={isChoresWidget ? 'Add chore' : 'Add task'}
              compact={usesCompactCreateRow}
            />
          </div>
        ) : (
        <div
          data-testid="tasks-widget-create-row"
          className={`${
            usesTwoColumnTallLayout ? "mb-2" : "mb-3"
          } grid gap-2 ${
            usesStackedCreateRow
              ? "grid-cols-[minmax(0,1fr)_auto]"
              : "grid-cols-[minmax(0,1fr)_auto_auto]"
          }`}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleCreate();
            }}
            placeholder={
              provider === "google"
                ? "Add to Google Tasks..."
                : provider === "notion"
                  ? "Add in Notion, refresh here"
                : provider === "zapier"
                  ? "Add in Zapier source, refresh here"
                : provider === "mcp"
                  ? "Add in the MCP's source app, refresh here"
                : isChoresWidget
                  ? "Add a chore..."
                  : "What needs doing?"
            }
            className={`min-w-0 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/50 py-2.5 outline-none focus:border-[var(--ether-primary)]/50 transition-all ${usesStackedCreateRow ? "order-1 px-3 text-[12px]" : usesCompactCreateRow ? "px-3 text-[13px]" : "px-4 text-sm"
              } ${theme.onSurface}`}
          />
          {provider !== "google" && provider !== "notion" && provider !== "zapier" && (
            <select
              value={draftPriority}
              onChange={(event) => setDraftPriority(normalizePriority(event.target.value))}
              className={`${usesStackedCreateRow ? "order-3 col-span-2 w-full px-3" : usesCompactCreateRow ? "w-20 px-2" : "w-24 px-3"} shrink-0 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/50 py-2 text-[11px] font-bold capitalize outline-none focus:border-[var(--ether-primary)]/50 ${theme.onSurface}`}
              style={{ colorScheme: theme.dark ? "dark" : "light" }}
              aria-label={isChoresWidget ? "Chore priority" : "Task priority"}
            >
              {PRIORITY_OPTIONS.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => void handleCreate()}
            disabled={provider === null || provider === "notion" || isZapierLike || loading}
            className={`${usesStackedCreateRow ? "order-2" : ""} flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--ether-primary)] text-[var(--ether-control-active-text)] shadow-lg shadow-[var(--ether-primary)]/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:scale-100`}
            aria-label={provider === "google" ? "Add Google task" : isChoresWidget ? "Add chore" : "Add task"}
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
        )}

        {isChoresWidget && provider !== "google" && provider !== "notion" && !isZapierLike && (
          <div className={`mb-3 grid gap-2 ${usesCompactCreateRow ? "grid-cols-1" : "grid-cols-[1fr_auto_auto]"}`}>
            <select
              value={choreCategory}
              onChange={(event) => setChoreCategory(event.target.value)}
              className={`min-w-0 ${choreControlClass}`}
              aria-label="Chore category"
            >
              <option>General</option>
              <option>Kitchen</option>
              <option>Cleaning</option>
              <option>Laundry</option>
              <option>Errands</option>
              <option>Pets</option>
            </select>
            <input
              type="date"
              value={choreDueDate}
              onChange={(event) => setChoreDueDate(event.target.value)}
              className={`${usesCompactCreateRow ? "w-full" : "w-36"} ${choreControlClass}`}
              style={{ colorScheme: theme.dark ? "dark" : "light" }}
              aria-label="Chore date"
            />
            <select
              value={choreDueTime}
              onChange={(event) => setChoreDueTime(event.target.value)}
              className={`${usesCompactCreateRow ? "w-full" : "w-28"} ${choreControlClass}`}
              aria-label="Chore time"
            >
              <option value="">No time</option>
              {CHORE_TIME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {isZapierLike && zapierDetail ? (
          renderZapierDetail(zapierDetail)
        ) : provider === "notion" && notionDetail ? (
          renderNotionDetail(notionDetail)
        ) : provider === null ? (
          <div className={`flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/55 px-3 py-5 text-center ${theme.onSurfaceVariant}`}>
            <Check size={32} className="mb-2 opacity-75" />
            <WidgetText variant="label" tone="muted" align="center" className="px-4">
              Connect Google Tasks to sync here
            </WidgetText>
          </div>
        ) : displayedTasks.length === 0 && !loading ? (
          <div className={`flex flex-1 flex-col items-center justify-center rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/55 px-3 py-5 text-center shadow-sm ${theme.onSurfaceVariant}`}>
            <Check size={32} className="mb-2 opacity-75" />
            <WidgetText variant="label" tone="muted" align="center" className="px-4">
              {showCompleted ? "No completed tasks." : "All caught up!"}
            </WidgetText>
          </div>
        ) : (
          <div data-testid="tasks-widget-list" className="dashboard-widget-touch-scroll min-h-0 flex-1 space-y-2 pr-1">
            <div role="status" aria-live="polite" className="sr-only">
              {dragAnnouncement}
            </div>
            {displayedTasks.map((task, index) => {
              const taskId = task.id;
              const title = "name" in task ? task.name : task.title;
              const rowBindings = internalDragReorderActive
                ? getRowBindingsInternal(index)
                : null;
              const isCompleted =
                "name" in task
                  ? Boolean(task.completed)
                  : isZapierLike
                    ? isCompletedZapierItem(task as ZapierWidgetItem)
                    : provider === "notion"
                    ? isCompletedNotionItem(task as NotionWidgetItem)
                    : task.status === "completed";
              let subtitle: string;
              if ("name" in task) {
                subtitle = [
                    task.category,
                    task.recurring,
                    task.dueDateTime
                      ? new Date(task.dueDateTime).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                      : task.dueDate
                        ? new Date(task.dueDate).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })
                        : undefined,
                  ].filter(Boolean).join(" - ");
              } else if (isZapierLike) {
                const zapierTask = task as ZapierWidgetItem;
                subtitle = [
                      zapierTask.status,
                      zapierTask.dueDate
                        ? new Date(zapierTask.dueDate).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })
                        : undefined,
                      zapierTask.preview,
                    ].filter(Boolean).join(" - ") || (provider === "mcp" ? "Synced from MCP" : "Synced with Zapier");
              } else if (provider === "notion") {
                const notionTask = task as NotionWidgetItem;
                subtitle = [
                      notionTask.status,
                      notionTask.dueDate
                        ? new Date(notionTask.dueDate).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })
                        : undefined,
                      notionTask.preview,
                    ].filter(Boolean).join(" - ") || "Synced with Notion";
              } else {
                const googleTask = task as GoogleTask;
                subtitle = googleTask.notes ||
                  (googleTask.due
                    ? new Date(googleTask.due).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })
                    : "Synced with Google");
              }

              // Only internal tasks are draggable as a drop source
              // (Google / Notion / Zapier / MCP are server-owned and
              // have no stable dashboard-side task id users expect to
              // drop onto other widgets).
              const dragSourceEnabled = provider === 'internal' && 'name' in task;

              // Resolve a YYYY-MM-DD due-date string from whichever
              // task shape we have so the hover bus can match against
              // a Calendar day cell (design Requirement 12.3). Only
              // emit hover events for rows with a resolved due date —
              // a taskless hover has nothing to correlate against.
              let hoverDueDate: string | null = null;
              if ("name" in task) {
                if (task.dueDate) hoverDueDate = task.dueDate.slice(0, 10);
                else if (task.dueDateTime)
                  hoverDueDate = task.dueDateTime.slice(0, 10);
              } else if (isZapierLike) {
                const zt = task as ZapierWidgetItem;
                if (zt.dueDate) hoverDueDate = zt.dueDate.slice(0, 10);
              } else if (provider === "notion") {
                const nt = task as NotionWidgetItem;
                if (nt.dueDate) hoverDueDate = nt.dueDate.slice(0, 10);
              } else {
                const gt = task as GoogleTask;
                if (gt.due) hoverDueDate = gt.due.slice(0, 10);
              }

              const hoverActive = hoverBusEnabled && hoverDueDate !== null;
              const handleRowMouseEnter = hoverActive
                ? () => {
                    dispatchHover({
                      widgetId: widget.id,
                      itemKind: "task",
                      itemId: taskId,
                      meta: hoverDueDate ? { dueDate: hoverDueDate } : undefined,
                    });
                  }
                : undefined;
              const handleRowMouseLeave = hoverActive
                ? () => {
                    dispatchHover({
                      widgetId: widget.id,
                      itemKind: null,
                      itemId: null,
                    });
                  }
                : undefined;

              return (
                <TaskRow
                  key={taskId}
                  className="group flex items-center gap-3 rounded-2xl p-3 border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] hover:bg-[var(--ether-surface-container-high)] transition-all data-[dragging=true]:border-[var(--ether-primary)]/50 data-[dragging=true]:shadow-lg"
                  data-dragging={rowBindings?.isDragging ? 'true' : undefined}
                  swipeEnabled={
                    rowSwipeEnabled && "name" in task && editingTaskId !== taskId
                  }
                  ariaLabel={`${isChoresWidget ? 'Chore' : 'Task'}: ${title}`}
                  onMouseEnter={handleRowMouseEnter}
                  onMouseLeave={handleRowMouseLeave}
                  draggable={dragSourceEnabled}
                  onDragStart={
                    dragSourceEnabled
                      ? (event) => {
                          const taskDueDateTime = 'dueDateTime' in task ? (task as any).dueDateTime : undefined;
                          setDashboardDragPayload(event.dataTransfer, {
                            kind: 'task',
                            sourceWidgetId: widget.id,
                            sourceWidgetType: 'tasks',
                            data: { taskId, title, dueDateTime: taskDueDateTime },
                          });
                        }
                      : undefined
                  }
                  onPrimaryCommit={() => {
                    if ("name" in task) {
                      commitInternalComplete(taskId, isCompleted);
                    }
                  }}
                  onSecondaryCommit={() => {
                    if ("name" in task) {
                      commitInternalRemove(task as ChoreItem);
                    }
                  }}
                >
                  {rowBindings && (
                    <DragReorderHandle
                      bindings={rowBindings}
                      ariaLabel={`Reorder ${title}`}
                      compact
                    />
                  )}
                  <button
                    onClick={() => void handleComplete(taskId, isCompleted)}
                    disabled={provider === "notion" || isZapierLike}
                    data-pending={provider === "google" && optimisticGoogleComplete.isPending && googleCompleteTargetRef.current?.taskId === taskId ? 'true' : undefined}
                    className="relative grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[var(--ether-primary)]/65 text-[var(--ether-primary)] transition-colors hover:bg-[var(--ether-primary)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ether-primary)]/35"
                    aria-label={`${isCompleted ? "Reopen" : "Complete"} task ${title}`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full transition-colors ${isCompleted ? "bg-[var(--ether-primary)]/65" : "bg-transparent group-hover:bg-[var(--ether-primary)]/18"}`} />
                    <Check size={14} className={`absolute transition ${isCompleted ? "scale-100 opacity-100" : "scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-100"}`} />
                  </button>

                  <div className="min-w-0 flex-1">
                    {editingTaskId === taskId ? (
                      <input
                        aria-label="Task title"
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onBlur={() => void saveEdit(taskId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void saveEdit(taskId);
                          if (event.key === "Escape") cancelEdit();
                        }}
                        className={`w-full rounded-lg border border-[var(--ether-primary)]/35 bg-[var(--ether-surface-container-low)] px-2 py-1 text-[13px] font-semibold outline-none ${theme.onSurface}`}
                        autoFocus
                      />
                    ) : (
                      provider === "zapier" || provider === "mcp" ? (
                        <button
                          type="button"
                          onClick={() => void openZapierDetail(task as ZapierWidgetItem)}
                          className={`block max-w-full truncate text-left text-[13px] font-semibold ${isCompleted ? "line-through opacity-60" : theme.onSurface}`}
                          aria-label={`Open ${provider === "mcp" ? "MCP" : "Zapier"} item ${title}`}
                        >
                          {title}
                        </button>
                      ) : provider === "notion" ? (
                        <button
                          type="button"
                          onClick={() => void openNotionDetail(task as NotionWidgetItem)}
                          className={`block max-w-full truncate text-left text-[13px] font-semibold ${isCompleted ? "line-through opacity-60" : theme.onSurface}`}
                          aria-label={`Open Notion item ${title}`}
                        >
                          {title}
                        </button>
                      ) : (
                        <div
                          className={`text-[13px] font-semibold truncate ${isCompleted ? "line-through opacity-60" : theme.onSurface}`}
                        >
                          {title}
                        </div>
                      )
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      {"priority" in task ? (
                        <select
                          value={task.priority || "medium"}
                          onChange={(event) =>
                            handlePriorityChange(taskId, normalizePriority(event.target.value))
                          }
                          className={`rounded border border-transparent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider outline-none ${getPriorityColor(task.priority)}`}
                          style={{ colorScheme: theme.dark ? "dark" : "light" }}
                          aria-label={`Priority for ${title}`}
                        >
                          {PRIORITY_OPTIONS.map((priority) => (
                            <option key={priority} value={priority}>
                              {priority}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-[var(--ether-primary)] bg-[var(--ether-primary)]/10">
                          {provider === "mcp" ? "MCP" : provider === "zapier" ? "Zapier" : provider === "notion" ? "Notion" : "Google"}
                        </span>
                      )}
                      <span className="truncate text-[9px] font-medium text-[var(--ether-on-surface-variant)] opacity-70">
                        {subtitle}
                      </span>
                    </div>
                  </div>

                  {editingTaskId !== taskId && (
                    <button
                      onClick={() => beginEdit(task)}
                      className={`rounded-lg p-1.5 opacity-0 transition-all hover:bg-[var(--ether-control-hover)] group-hover:opacity-100 ${theme.onSurfaceVariant}`}
                      aria-label={`Edit task ${title}`}
                    >
                      <Edit3 size={13} />
                    </button>
                  )}

                  <button
                    onClick={() => void handleDelete(taskId)}
                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-[var(--ether-error)] hover:bg-[var(--ether-error)]/10 transition-all"
                    aria-label={`Delete task ${title}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </TaskRow>
              );
            })}
          </div>
        )}

        {syncError && (
          <div className="mt-3 rounded-2xl border border-[var(--ether-error)]/20 bg-[var(--ether-error)]/10 px-3 py-2 text-[11px] text-[var(--ether-error)]">
            {syncError}
          </div>
        )}

        <div
          className={`${
            usesTwoColumnTallLayout ? "mt-3 pt-3" : "mt-4 pt-4"
          } shrink-0 border-t border-[var(--ether-glass-border)]`}
        >
          <div className={`mb-1.5 flex justify-between ${theme.onSurfaceVariant}`}>
            <WidgetText variant="label" tone="muted">
              {provider === "google" || provider === "notion" || isZapierLike ? "Sync Completion" : "Daily Completion"}
            </WidgetText>
            <WidgetText variant="label" tone="muted">{Math.round(progress)}%</WidgetText>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ether-control-bg)]">
            <div
              className="h-full bg-[var(--ether-primary)] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </WidgetShell>
  );
};

export default React.memo(TasksWidget);
