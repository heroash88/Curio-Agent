import React, { useEffect, useMemo, useState } from "react";
import {
  Gauge,
  Gem,
  LayoutGrid,
  Magnet,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  SunMedium,
  WandSparkles,
} from "lucide-react";

import SettingsSection from "../SettingsSection";
import SettingsToggle from "../SettingsToggle";
import ICalCalendarSettings from "../dashboard/ICalCalendarSettings";
import PortfolioHoldingsSettings from "../dashboard/PortfolioHoldingsSettings";
import StockSymbolSettings from "../dashboard/StockSymbolSettings";
import DashboardInteractivitySettings from "./DashboardInteractivitySettings";
import type { IdleMode } from "../../../utils/settingsStorage";
import { useGenericMcpServers } from "../../../utils/settingsStorage";
import { useMcpServerTools } from "../../../hooks/useMcpServerTools";
import {
  clampWidgetDimensions,
  createDashboardWidget,
  DASHBOARD_CLOCK_DESIGN_OPTIONS,
  DASHBOARD_MUSIC_DESIGN_OPTIONS,
  DASHBOARD_MUSIC_SOURCE_OPTIONS,
  DEFAULT_DASHBOARD_PREFERENCES,
  DEFAULT_DASHBOARD_WIDGETS,
  getDashboardCatalogItem,
  getWidgetDefaultGridSize,
  MAX_DASHBOARD_WIDGETS,
  WIDGET_CATALOG,
  type DashboardAccentPreset,
  type DashboardBoardPreferences,
  type DashboardCalendarProvider,
  type DashboardDateInfoImportantDate,
  type DashboardDateInfoMetric,
  type DashboardMailProvider,
  type DashboardMapTarget,
  type DashboardMessagesProvider,
  type DashboardMusicDesign,
  type DashboardMusicSource,
  type DashboardNewsProvider,
  type DashboardNotesProvider,
  type DashboardTaskProvider,
  type DashboardTravelMode,
  type DashboardWidget,
  type DashboardWidgetSize,
  type DashboardWidgetType,
} from "../../../services/dashboardTypes";
import {
  NEWS_FEED_CATEGORIES,
  NEWS_FEED_PROVIDER_OPTIONS,
} from "../../../services/newsFeedService";
import {
  DASHBOARD_ACCENT_ORDER,
  DASHBOARD_ACCENT_PRESETS,
} from "../../../services/dashboardVisualPresets";
import {
  generateAndApplyDashboardTheme,
  applyDashboardThemeAppearanceToActivePage,
  isDashboardThemeResetPrompt,
  resetDashboardThemeOnActivePage,
} from "../../../services/dashboardThemeGenerator";
import {
  DASHBOARD_ANIMATED_BACKGROUND_OPTIONS,
  buildDashboardAnimatedBackgroundAppearance,
  type DashboardAnimatedBackgroundOption,
} from "../../../services/dashboardAnimatedBackgroundPresets";
import ColorWheelInput from "../ColorWheelInput";
import {
  getDashboardLayoutPresets,
  saveDashboardLayoutPreset,
  deleteDashboardLayoutPreset,
  exportDashboardLayoutPreset,
  importDashboardLayoutPreset,
  type DashboardLayoutPreset,
} from "../../../services/dashboardLayoutPresets";
import { dashboardToastBus } from "../../../services/dashboardToastBus";

interface DashboardSectionProps {
  idleMode: IdleMode;
  setIdleMode: (mode: IdleMode) => void;
  dashboardWidgets: DashboardWidget[];
  setDashboardWidgets: (widgets: DashboardWidget[]) => void;
  dashboardPreferences: DashboardBoardPreferences;
  setDashboardPreferences: (preferences: DashboardBoardPreferences) => void;
}

interface BlurInputProps {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}

interface BlurTextareaProps extends BlurInputProps {
  rows?: number;
}

interface NumberInputProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
}

const sizeOptions: DashboardWidgetSize[] = [
  "small",
  "medium",
  "large",
  "xlarge",
];
const commuteTargets = ["work", "home", "custom"] as const;
const travelModes: DashboardTravelMode[] = [
  "driving",
  "walking",
  "bicycling",
  "transit",
];
const newsProviderOptions: Array<{
  id: DashboardNewsProvider;
  label: string;
  description: string;
}> = [
  {
    id: "grounded",
    label: "AI Search",
    description: "Uses Curio search grounding for a topic-based briefing.",
  },
  ...NEWS_FEED_PROVIDER_OPTIONS,
];
const categoryOrder = [
  "Personal",
  "Productivity",
  "Communication",
  "Context",
  "Media",
  "Smart Home",
  "System",
] as const;

const accentOptions: Array<{
  value: DashboardAccentPreset;
  label: string;
  color: string;
  glow: string;
}> = DASHBOARD_ACCENT_ORDER.map((value) => {
  const preset = DASHBOARD_ACCENT_PRESETS[value];
  return {
    value,
    label: preset.label,
    color: preset.accent,
    glow: preset.glow,
  };
});

const cloneWidget = (widget: DashboardWidget): DashboardWidget => ({
  ...widget,
  config: { ...widget.config },
  layout: widget.layout
    ? {
        ...widget.layout,
        freeform: widget.layout.freeform
          ? { ...widget.layout.freeform }
          : undefined,
      }
    : undefined,
});

const cloneDefaultWidgets = () => DEFAULT_DASHBOARD_WIDGETS.map(cloneWidget);

const deriveSizeFromGrid = (w: number, h: number): DashboardWidgetSize => {
  const area = w * h;
  if (area >= 12) return "xlarge";
  if (area >= 8) return "large";
  if (area >= 4) return "medium";
  return "small";
};

const toggleCardClass = (active: boolean) =>
  `w-full min-w-0 rounded-2xl border px-4 py-3 text-left transition [touch-action:manipulation] ${
    active
      ? "border-sky-300 bg-sky-50 text-sky-600 shadow-sm"
      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
  }`;

const chipClass = (active: boolean) =>
  `rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] transition ${
    active
      ? "bg-slate-900 text-white shadow-sm"
      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
  }`;

const actionClass =
  "rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50";

const widgetToggleClass = (active: boolean, disabled: boolean) =>
  `flex w-full min-w-0 items-center gap-2 rounded-2xl border px-3 py-2 text-left transition [touch-action:manipulation] ${
    disabled
      ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
      : active
        ? "border-sky-200 bg-sky-50 text-sky-700 shadow-sm"
        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
  }`;

const BlurInput: React.FC<BlurInputProps> = ({
  label,
  value,
  placeholder,
  onCommit,
}) => {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft.trim())}
        className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
      />
    </label>
  );
};

const BlurTextarea: React.FC<BlurTextareaProps> = ({
  label,
  value,
  placeholder,
  rows = 4,
  onCommit,
}) => {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <textarea
        value={draft}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft.trim())}
        className="resize-none rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
      />
    </label>
  );
};

const DATE_INFO_METRIC_OPTIONS: Array<{ id: DashboardDateInfoMetric; label: string }> = [
  { id: "dayOfYear", label: "Day" },
  { id: "daysLeft", label: "Days left" },
  { id: "calendarWeek", label: "Calendar week" },
  { id: "isoWeek", label: "ISO week" },
  { id: "yearProgress", label: "Year %" },
  { id: "monthProgress", label: "Month %" },
  { id: "quarter", label: "Quarter" },
  { id: "daysInMonth", label: "Month days" },
  { id: "fiscalYear", label: "Fiscal year" },
  { id: "fiscalQuarter", label: "Fiscal quarter" },
  { id: "fiscalWeek", label: "Fiscal week" },
  { id: "fiscalDaysLeft", label: "Fiscal left" },
];

const DATE_INFO_DEFAULT_METRICS: DashboardDateInfoMetric[] = [
  "dayOfYear",
  "daysLeft",
  "calendarWeek",
  "isoWeek",
  "yearProgress",
  "fiscalWeek",
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const getDateInfoMetrics = (value: unknown): DashboardDateInfoMetric[] =>
  Array.isArray(value) && value.length > 0
    ? value.filter((item): item is DashboardDateInfoMetric => typeof item === "string")
    : DATE_INFO_DEFAULT_METRICS;

const serializeDateInfoImportantDates = (items: unknown) =>
  Array.isArray(items)
    ? items
        .map((item) => {
          const entry = item as Partial<DashboardDateInfoImportantDate>;
          if (!entry?.label || !entry?.date) return "";
          return `${entry.date}${entry.recurringAnnual ? " yearly" : ""} | ${entry.label}`;
        })
        .filter(Boolean)
        .join("\n")
    : "";

const parseDateInfoImportantDates = (value: string): DashboardDateInfoImportantDate[] =>
  value
    .split(/\n+/)
    .map((line, index): DashboardDateInfoImportantDate | null => {
      const [rawDate, ...labelParts] = line.split("|");
      const dateToken = (rawDate || "").trim();
      const label = labelParts.join("|").trim();
      if (!dateToken || !label) return null;
      const recurringAnnual = /\byearly\b|\bannual\b/i.test(dateToken) || /^\d{2}-\d{2}$/.test(dateToken);
      const date = dateToken.replace(/\byearly\b|\bannual\b/gi, "").trim();
      return {
        id: `date_${index}_${date.replace(/[^a-z0-9]/gi, "")}`,
        label,
        date,
        recurringAnnual,
      };
    })
    .filter((entry): entry is DashboardDateInfoImportantDate => Boolean(entry));

const NumberInput: React.FC<NumberInputProps> = ({
  label,
  value,
  min = 1,
  max = 12,
  onCommit,
}) => {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <input
        value={draft}
        inputMode="numeric"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const parsed = Number.parseInt(draft, 10);
          onCommit(
            Number.isFinite(parsed)
              ? Math.max(min, Math.min(max, parsed))
              : value,
          );
        }}
        className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
      />
    </label>
  );
};

const McpProviderExtras: React.FC<{
  widget: DashboardWidget;
  updateWidget: (
    widgetId: string,
    updater: (current: DashboardWidget) => DashboardWidget,
  ) => void;
  queryField?: "mcpQuery" | "mcpChannelQuery";
  queryPlaceholder?: string;
  showSendPicker?: boolean;
}> = ({
  widget,
  updateWidget,
  queryField = "mcpQuery",
  queryPlaceholder,
  showSendPicker = false,
}) => {
  const enabledServers = useGenericMcpServers().filter(
    (server) => server.enabled && server.kind !== "search",
  );
  const currentValue = String(
    (widget.config as Record<string, unknown>)[queryField] || "",
  );

  return (
    <div className="mt-3 space-y-2">
      {enabledServers.length === 0 ? (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          Connect and enable a general MCP server in Accounts & Keys to use this provider.
        </div>
      ) : (
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            MCP server
          </span>
          <select
            value={widget.config.mcpServerId || ""}
            onChange={(event) =>
              updateWidget(widget.id, (current) => ({
                ...current,
                config: { ...current.config, mcpServerId: event.target.value || undefined },
              }))
            }
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
          >
            <option value="">Auto (first enabled)</option>
            {enabledServers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <input
        value={currentValue}
        onChange={(event) =>
          updateWidget(widget.id, (current) => ({
            ...current,
            config: { ...current.config, [queryField]: event.target.value },
          }))
        }
        placeholder={queryPlaceholder}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
      />

      <input
        value={String(widget.config.mcpToolName || "")}
        onChange={(event) =>
          updateWidget(widget.id, (current) => ({
            ...current,
            config: { ...current.config, mcpToolName: event.target.value.trim() || undefined },
          }))
        }
        placeholder="Exact MCP tool name (optional, e.g. outlook_list_events)"
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-slate-400"
      />

      <McpToolPicker
        serverId={widget.config.mcpServerId}
        selectedTool={String(widget.config.mcpToolName || "")}
        onSelect={(toolName) =>
          updateWidget(widget.id, (current) => ({
            ...current,
            config: { ...current.config, mcpToolName: toolName || undefined },
          }))
        }
      />
      {showSendPicker && (
        <>
          <input
            value={String(widget.config.mcpSendToolName || "")}
            onChange={(event) =>
              updateWidget(widget.id, (current) => ({
                ...current,
                config: { ...current.config, mcpSendToolName: event.target.value.trim() || undefined },
              }))
            }
            placeholder="Exact send tool name (optional, e.g. email_send)"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-slate-400"
          />
          <McpToolPicker
            serverId={widget.config.mcpServerId}
            selectedTool={String(widget.config.mcpSendToolName || "")}
            onSelect={(toolName) =>
              updateWidget(widget.id, (current) => ({
                ...current,
                config: { ...current.config, mcpSendToolName: toolName || undefined },
              }))
            }
          />
          <input
            value={String(widget.config.mcpReplyToolName || "")}
            onChange={(event) =>
              updateWidget(widget.id, (current) => ({
                ...current,
                config: { ...current.config, mcpReplyToolName: event.target.value.trim() || undefined },
              }))
            }
            placeholder="Exact reply tool name (optional, e.g. email_reply)"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-slate-400"
          />
          <McpToolPicker
            serverId={widget.config.mcpServerId}
            selectedTool={String(widget.config.mcpReplyToolName || "")}
            onSelect={(toolName) =>
              updateWidget(widget.id, (current) => ({
                ...current,
                config: { ...current.config, mcpReplyToolName: toolName || undefined },
              }))
            }
          />
        </>
      )}
    </div>
  );
};

const McpToolPicker: React.FC<{
  serverId?: string;
  selectedTool: string;
  onSelect: (toolName: string) => void;
}> = ({ serverId, selectedTool, onSelect }) => {
  const { server, tools, loading, error, reload } = useMcpServerTools(serverId);
  const [open, setOpen] = useState(false);

  if (!server) return null;

  const label = loading
    ? "Loading tools..."
    : error
      ? "Could not load tools"
      : `${tools.length} ${tools.length === 1 ? "tool" : "tools"} available`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-0 items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-800"
          aria-expanded={open}
        >
          <span
            className={`inline-block text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
          >
            ▸
          </span>
          <span className="truncate">{server.name} · {label}</span>
        </button>
        <button
          type="button"
          onClick={reload}
          className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 hover:text-slate-700"
        >
          Reload
        </button>
      </div>
      {open && (
        <div className="max-h-56 overflow-y-auto border-t border-slate-100 p-1.5">
          {error ? (
            <div className="px-2 py-1.5 text-[11px] text-rose-600">{error}</div>
          ) : tools.length === 0 ? (
            <div className="px-2 py-1.5 text-[11px] text-slate-400">No tools reported.</div>
          ) : (
            <ul className="space-y-1">
              {tools.map((tool) => {
                const isSelected = selectedTool === tool.name;
                return (
                  <li key={tool.name}>
                    <button
                      type="button"
                      onClick={() => onSelect(isSelected ? "" : tool.name)}
                      className={`block w-full rounded px-2 py-1 text-left text-[11px] transition ${
                        isSelected ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-50"
                      }`}
                    >
                      <code className="block break-all font-semibold text-slate-700">
                        {tool.name}
                      </code>
                      {tool.description && (
                        <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-500">
                          {tool.description}
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

const DashboardSection: React.FC<DashboardSectionProps> = ({
  idleMode,
  setIdleMode,
  dashboardWidgets,
  setDashboardWidgets,
  dashboardPreferences,
  setDashboardPreferences,
}) => {
  const widgets =
    dashboardWidgets.length > 0 ? dashboardWidgets : cloneDefaultWidgets();
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [themePrompt, setThemePrompt] = useState("");
  const [themeGeneratorStatus, setThemeGeneratorStatus] = useState<string | null>(null);

  const activeWidgets = useMemo(
    () =>
      widgets
        .filter((widget) => widget.enabled)
        .sort((left, right) => left.position - right.position),
    [widgets],
  );
  const activeTypes = useMemo(
    () => new Set(activeWidgets.map((widget) => widget.type)),
    [activeWidgets],
  );
  const widgetGroups = useMemo(
    () =>
      categoryOrder.map((category) => ({
        category,
        items: WIDGET_CATALOG.filter((item) => item.category === category),
      })),
    [],
  );
  const hasRobotWidget = activeTypes.has("robot_face");
  const dashboardCustomAccentValue =
    dashboardPreferences.accentColor ||
    DASHBOARD_ACCENT_PRESETS[dashboardPreferences.accentPreset]?.accent ||
    "#7dd3fc";

  useEffect(() => {
    setExpandedIds((current) =>
      current.filter((id) =>
        widgets.some((widget) => widget.id === id && widget.enabled),
      ),
    );
  }, [widgets]);

  const updateWidgets = (nextWidgets: DashboardWidget[]) => {
    setDashboardWidgets(nextWidgets.map(cloneWidget));
  };

  const updatePreferences = (patch: Partial<DashboardBoardPreferences>) => {
    setDashboardPreferences({ ...dashboardPreferences, ...patch });
  };

  const toggleExpanded = (widgetId: string) => {
    setExpandedIds((current) =>
      current.includes(widgetId)
        ? current.filter((id) => id !== widgetId)
        : [...current, widgetId],
    );
  };

  const toggleWidget = (type: DashboardWidgetType) => {
    const existing = widgets.find((widget) => widget.type === type);
    if (existing) {
      updateWidgets(
        widgets.map((widget) =>
          widget.type === type
            ? { ...widget, enabled: !widget.enabled }
            : widget,
        ),
      );
      setExpandedIds((current) =>
        existing.enabled
          ? current.filter((id) => id !== existing.id)
          : [...new Set([...current, existing.id])],
      );
      return;
    }

    if (widgets.length >= MAX_DASHBOARD_WIDGETS) {
      return;
    }

    const nextWidget = createDashboardWidget(type, widgets.length);
    updateWidgets([...widgets, nextWidget]);
    setExpandedIds((current) => [...new Set([...current, nextWidget.id])]);
  };

  const hideWidget = (widgetId: string) => {
    updateWidgets(
      widgets.map((widget) =>
        widget.id === widgetId ? { ...widget, enabled: false } : widget,
      ),
    );
    setExpandedIds((current) => current.filter((id) => id !== widgetId));
  };

  const updateWidget = (
    widgetId: string,
    updater: (widget: DashboardWidget) => DashboardWidget,
  ) => {
    updateWidgets(
      widgets.map((widget) =>
        widget.id === widgetId ? updater(widget) : widget,
      ),
    );
  };

  const moveWidget = (widgetId: string, direction: -1 | 1) => {
    const ordered = activeWidgets.slice();
    const index = ordered.findIndex((widget) => widget.id === widgetId);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) {
      return;
    }

    const current = ordered[index];
    const target = ordered[swapIndex];

    updateWidgets(
      widgets.map((widget) => {
        if (widget.id === current.id) {
          return { ...widget, position: target.position };
        }
        if (widget.id === target.id) {
          return { ...widget, position: current.position };
        }
        return widget;
      }),
    );
  };

  const getWidgetSpan = (widget: DashboardWidget) =>
    clampWidgetDimensions(
      widget.type,
      Number(widget.config.w ?? 2),
      Number(widget.config.h ?? 2),
      8,
    );

  const applyWidgetSizePreset = (
    widget: DashboardWidget,
    size: DashboardWidgetSize,
  ) => {
    const dims = getWidgetDefaultGridSize(widget.type, size);
    updateWidget(widget.id, (current) => ({
      ...current,
      size,
      config: {
        ...current.config,
        w: dims.w,
        h: dims.h,
      },
    }));
  };

  const updateWidgetSpan = (
    widget: DashboardWidget,
    axis: "w" | "h",
    nextValue: number,
  ) => {
    const currentSpan = getWidgetSpan(widget);
    const nextDims = clampWidgetDimensions(
      widget.type,
      axis === "w" ? nextValue : currentSpan.w,
      axis === "h" ? nextValue : currentSpan.h,
      8,
    );

    updateWidget(widget.id, (current) => ({
      ...current,
      size: deriveSizeFromGrid(nextDims.w, nextDims.h),
      config: {
        ...current.config,
        w: nextDims.w,
        h: nextDims.h,
      },
    }));
  };

  const resetDashboard = () => {
    updateWidgets(cloneDefaultWidgets());
    setDashboardPreferences(DEFAULT_DASHBOARD_PREFERENCES);
    setExpandedIds([]);
  };

  const handleGenerateTheme = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = themePrompt.trim();
    if (!prompt) return;
    if (isDashboardThemeResetPrompt(prompt)) {
      handleResetTheme();
      setThemePrompt("");
      return;
    }
    const result = generateAndApplyDashboardTheme({ prompt });
    if (result.success) {
      setThemeGeneratorStatus("Applied to the active dashboard page.");
      setThemePrompt("");
      return;
    }
    setThemeGeneratorStatus(result.error || "Could not apply that dashboard theme.");
  };

  const handleResetTheme = () => {
    const result = resetDashboardThemeOnActivePage();
    setThemeGeneratorStatus(
      result.success
        ? "Reset the active dashboard page theme."
        : result.error || "Could not reset that dashboard theme.",
    );
  };

  const handleAnimatedBackgroundPreset = (
    preset: DashboardAnimatedBackgroundOption,
  ) => {
    const result = applyDashboardThemeAppearanceToActivePage(
      buildDashboardAnimatedBackgroundAppearance(preset),
    );
    setThemeGeneratorStatus(
      result.success
        ? `Applied ${preset.label} to the active dashboard page.`
        : result.error || "Could not apply that animated background.",
    );
  };

  const renderChoiceButtons = <T extends string>(
    options: readonly T[],
    currentValue: T,
    onSelect: (value: T) => void,
  ) => (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onSelect(option)}
          className={chipClass(currentValue === option)}
        >
          {option.replace(/_/g, " ")}
        </button>
      ))}
    </div>
  );

  const renderWidgetSpecificControls = (widget: DashboardWidget) => {
    const currentSpan = getWidgetSpan(widget);

    return (
      <div className="grid gap-4">
        <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Layout
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-800">
                Resize the actual dashboard surface
              </div>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              {currentSpan.w} x {currentSpan.h} grid span
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_0.8fr]">
            <div className="space-y-3">
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Size Preset
                </div>
                <div className="flex flex-wrap gap-2">
                  {sizeOptions.map((size) => (
                    <button
                      key={size}
                      onClick={() => applyWidgetSizePreset(widget, size)}
                      className={chipClass(widget.size === size)}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberInput
                  label="Columns"
                  value={currentSpan.w}
                  max={8}
                  onCommit={(value) => updateWidgetSpan(widget, "w", value)}
                />
                <NumberInput
                  label="Rows"
                  value={currentSpan.h}
                  max={8}
                  onCommit={(value) => updateWidgetSpan(widget, "h", value)}
                />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Order
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => moveWidget(widget.id, -1)}
                    className={actionClass}
                  >
                    Move Up
                  </button>
                  <button
                    onClick={() => moveWidget(widget.id, 1)}
                    className={actionClass}
                  >
                    Move Down
                  </button>
                </div>
              </div>
              <p className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
                Use the dashboard itself for exact placement. These controls set
                the default grid span for the surface.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Appearance
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-800">
                Glow treatment and per-widget accent
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Palette size={14} />
              Visual polish
            </div>
          </div>
          <div className="mt-4 grid gap-4">
            <SettingsToggle
              label="Glow bleed"
              description="Allow the global widget glow on this widget."
              enabled={widget.config.glowEnabled !== false}
              onToggle={() =>
                updateWidget(widget.id, (current) => ({
                  ...current,
                  config: {
                    ...current.config,
                    glowEnabled: current.config.glowEnabled === false,
                  },
                }))
              }
              color="bg-sky-500"
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: { ...current.config, accentOverride: undefined },
                  }))
                }
                className={`flex items-center gap-2 rounded-full border px-3 py-2 transition ${
                  widget.config.accentOverride == null
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
                  Default
                </span>
              </button>
              {accentOptions.map((accent) => (
                <button
                  key={accent.value}
                  type="button"
                  onClick={() =>
                    updateWidget(widget.id, (current) => ({
                      ...current,
                      config: {
                        ...current.config,
                        accentOverride: accent.glow,
                      },
                    }))
                  }
                  className={`flex items-center gap-2 rounded-full border px-3 py-2 transition ${
                    widget.config.accentOverride === accent.glow
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: accent.color }}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
                    {accent.label}
                  </span>
                </button>
              ))}
              <ColorWheelInput
                value={
                  widget.config.accentOverride &&
                  !accentOptions.some((accent) => accent.glow === widget.config.accentOverride)
                    ? widget.config.accentOverride
                    : "#38bdf8"
                }
                onChange={(accentOverride) =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      accentOverride,
                    },
                  }))
                }
                ariaLabel={`Custom ${getDashboardCatalogItem(widget.type)?.label || widget.type} accent color`}
                title="Custom widget accent color"
                active={
                  Boolean(widget.config.accentOverride) &&
                  !accentOptions.some((accent) => accent.glow === widget.config.accentOverride)
                }
                inactiveClassName="border-slate-200 hover:border-slate-300"
                activeClassName="scale-105 border-slate-900 shadow-md"
              />
            </div>
          </div>
        </div>

        {(widget.type === "weather" ||
          widget.type === "air_quality" ||
          widget.type === "astronomy") && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-slate-800">
              Location override
            </div>
            <BlurInput
              label="City"
              value={String(widget.config.city || "")}
              placeholder="Leave blank to use the active location"
              onCommit={(value) =>
                updateWidget(widget.id, (current) => ({
                  ...current,
                  config: { ...current.config, city: value },
                }))
              }
            />
          </div>
        )}

        {widget.type === "forecast" && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-slate-800">
              Weather outlook cities
            </div>
            <BlurInput
              label="Tracked cities"
              value={
                Array.isArray(widget.config.forecastCities)
                  ? widget.config.forecastCities.join(", ")
                  : String(widget.config.city || "")
              }
              placeholder="San Francisco, Paris, Tokyo"
              onCommit={(value) => {
                const cities = value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean);
                updateWidget(widget.id, (current) => ({
                  ...current,
                  config: {
                    ...current.config,
                    forecastCities: cities,
                    city: cities[0] || "",
                  },
                }));
              }}
            />
          </div>
        )}

        {widget.type === "date_info" && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-slate-800">
              Date info display
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {DATE_INFO_METRIC_OPTIONS.map((option) => {
                const activeMetrics = getDateInfoMetrics(widget.config.dateInfoMetrics);
                const active = activeMetrics.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() =>
                      updateWidget(widget.id, (current) => {
                        const currentMetrics = getDateInfoMetrics(current.config.dateInfoMetrics);
                        const nextMetrics = currentMetrics.includes(option.id)
                          ? currentMetrics.filter((item) => item !== option.id)
                          : [...currentMetrics, option.id];
                        return {
                          ...current,
                          config: {
                            ...current.config,
                            dateInfoMetrics: nextMetrics.length > 0 ? nextMetrics : [option.id],
                          },
                        };
                      })
                    }
                    className={chipClass(active)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <label className="mb-4 grid gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Fiscal year starts
              </span>
              <select
                value={Number(widget.config.dateInfoFiscalYearStartMonth || 1)}
                onChange={(event) =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      dateInfoFiscalYearStartMonth: Number(event.target.value),
                    },
                  }))
                }
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              >
                {MONTH_NAMES.map((month, index) => (
                  <option key={month} value={index + 1}>
                    {month}
                  </option>
                ))}
              </select>
            </label>
            <BlurTextarea
              label="Important dates"
              value={serializeDateInfoImportantDates(widget.config.dateInfoImportantDates)}
              placeholder={"2026-06-15 | Project review\n07-04 yearly | Birthday"}
              onCommit={(value) =>
                updateWidget(widget.id, (current) => ({
                  ...current,
                  config: {
                    ...current.config,
                    dateInfoImportantDates: parseDateInfoImportantDates(value),
                  },
                }))
              }
            />
          </div>
        )}

        {[
          "calendar",
          "google_calendar",
          "outlook_calendar",
          "ical_calendar",
          "reminders",
          "notes",
          "obsidian_notes",
          "ha_entities",
          "tasks",
          "google_tasks",
          "chores",
          "mail",
          "gmail",
          "outlook_mail",
          "messages",
          "slack",
          "bookmarks",
          "habits",
          "news",
          "youtube_video",
        ].includes(widget.type) && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-slate-800">
              Density
            </div>
            <NumberInput
              label="Maximum items"
              value={Number(widget.config.maxItems || (widget.type === "news" ? 10 : 4))}
              max={widget.type === "news" ? 20 : 50}
              onCommit={(value) =>
                updateWidget(widget.id, (current) => ({
                  ...current,
                  config: { ...current.config, maxItems: value },
                }))
              }
            />
          </div>
        )}

        {["greeting", "clock", "daily_summary"].includes(widget.type) && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <SettingsToggle
              label="Show date"
              description="Keep the date visible inside this widget."
              enabled={widget.config.showDate !== false}
              onToggle={() =>
                updateWidget(widget.id, (current) => ({
                  ...current,
                  config: {
                    ...current.config,
                    showDate: current.config.showDate === false,
                  },
                }))
              }
              color="bg-sky-500"
            />
          </div>
        )}

        {widget.type === "commute" && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-4">
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Destination
                </div>
                {renderChoiceButtons(
                  commuteTargets,
                  (widget.config.commuteTarget ||
                    "work") as (typeof commuteTargets)[number],
                  (target) => {
                    updateWidget(widget.id, (current) => ({
                      ...current,
                      config: { ...current.config, commuteTarget: target },
                    }));
                  },
                )}
              </div>
              {(widget.config.commuteTarget || "work") === "custom" && (
                <BlurInput
                  label="Custom destination"
                  value={String(widget.config.customDestination || "")}
                  placeholder="123 Main Street, Seattle"
                  onCommit={(value) =>
                    updateWidget(widget.id, (current) => ({
                      ...current,
                      config: { ...current.config, customDestination: value },
                    }))
                  }
                />
              )}
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Travel mode
                </div>
                {renderChoiceButtons(
                  travelModes,
                  (widget.config.travelMode ||
                    "driving") as DashboardTravelMode,
                  (mode) => {
                    updateWidget(widget.id, (current) => ({
                      ...current,
                      config: { ...current.config, travelMode: mode },
                    }));
                  },
                )}
              </div>
              <SettingsToggle
                label="Show map preview"
                description="Render the route path directly inside the commute widget."
                enabled={widget.config.showMapPreview === true}
                onToggle={() =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      showMapPreview: current.config.showMapPreview !== true,
                    },
                  }))
                }
                color="bg-teal-500"
              />
            </div>
          </div>
        )}

        {widget.type === "world_clock" && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-slate-800">
              Clock stack
            </div>
            <BlurInput
              label="Time zones"
              value={
                Array.isArray(widget.config.timezones)
                  ? widget.config.timezones.join(", ")
                  : ""
              }
              placeholder="America/Los_Angeles, Europe/London"
              onCommit={(value) => {
                const timezones = value
                  ? value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean)
                  : [];
                updateWidget(widget.id, (current) => ({
                  ...current,
                  config: {
                    ...current.config,
                    timezones,
                    worldClockCities: timezones.map((timeZone) => ({
                      label: (timeZone.split("/").pop() || timeZone).replace(/_/g, " "),
                      timeZone,
                    })),
                  },
                }));
              }}
            />
          </div>
        )}

        {widget.type === "map" && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-4">
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Map target
                </div>
                {renderChoiceButtons(
                  ["current", "home", "work", "custom"] as DashboardMapTarget[],
                  (widget.config.mapTarget || "current") as DashboardMapTarget,
                  (target) => {
                    updateWidget(widget.id, (current) => ({
                      ...current,
                      config: { ...current.config, mapTarget: target },
                    }));
                  },
                )}
              </div>
              {(widget.config.mapTarget || "current") === "custom" && (
                <BlurInput
                  label="Custom location"
                  value={String(widget.config.customLocation || "")}
                  placeholder="123 Main Street, Seattle"
                  onCommit={(value) =>
                    updateWidget(widget.id, (current) => ({
                      ...current,
                      config: { ...current.config, customLocation: value },
                    }))
                  }
                />
              )}
            </div>
          </div>
        )}

        {widget.type === "mail" && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Mail provider
            </div>
            {renderChoiceButtons(
              ["auto", "gmail", "outlook", "zapier", "mcp"] as DashboardMailProvider[],
              (widget.config.mailProvider || "auto") as DashboardMailProvider,
              (provider) => {
                updateWidget(widget.id, (current) => ({
                  ...current,
                  config: { ...current.config, mailProvider: provider },
                }));
              },
            )}
            {widget.config.mailProvider === "zapier" && (
              <input
                value={String(widget.config.zapierQuery || "")}
                onChange={(event) =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      zapierQuery: event.target.value,
                    },
                  }))
                }
                placeholder="Zapier email query"
                className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
            )}
            {widget.config.mailProvider === "mcp" && (
              <McpProviderExtras
                widget={widget}
                updateWidget={updateWidget}
                queryPlaceholder="MCP email query (e.g. inbox)"
                showSendPicker
              />
            )}
          </div>
        )}

        {widget.type === "messages" && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-4">
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Messages provider
                </div>
                {renderChoiceButtons(
                  ["slack", "mock", "mcp"] as DashboardMessagesProvider[],
                  (widget.config.messagesProvider ||
                    "slack") as DashboardMessagesProvider,
                  (provider) => {
                    updateWidget(widget.id, (current) => ({
                      ...current,
                      config: { ...current.config, messagesProvider: provider },
                    }));
                  },
                )}
                {widget.config.messagesProvider === "mcp" && (
                  <McpProviderExtras
                    widget={widget}
                    updateWidget={updateWidget}
                    queryField="mcpChannelQuery"
                    queryPlaceholder="Slack channel or keyword"
                  />
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <BlurInput
                  label="Channel id"
                  value={String(widget.config.channelId || "")}
                  placeholder="#general"
                  onCommit={(value) =>
                    updateWidget(widget.id, (current) => ({
                      ...current,
                      config: { ...current.config, channelId: value },
                    }))
                  }
                />
                <BlurInput
                  label="Channel label"
                  value={String(widget.config.channelName || "")}
                  placeholder="general"
                  onCommit={(value) =>
                    updateWidget(widget.id, (current) => ({
                      ...current,
                      config: { ...current.config, channelName: value },
                    }))
                  }
                />
              </div>
            </div>
          </div>
        )}

        {widget.type === "calendar" && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Calendar provider
            </div>
            {renderChoiceButtons(
              ["auto", "google", "outlook", "ical", "zapier", "mcp"] as DashboardCalendarProvider[],
              (widget.config.calendarProvider ||
                "auto") as DashboardCalendarProvider,
              (provider) => {
                updateWidget(widget.id, (current) => ({
                  ...current,
                  config: { ...current.config, calendarProvider: provider },
                }));
              },
            )}
            {widget.config.calendarProvider === "zapier" && (
              <input
                value={String(widget.config.zapierQuery || "")}
                onChange={(event) =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      zapierQuery: event.target.value,
                    },
                  }))
                }
                placeholder="Zapier calendar query"
                className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
            )}
            {widget.config.calendarProvider === "mcp" && (
              <McpProviderExtras
                widget={widget}
                updateWidget={updateWidget}
                queryPlaceholder="MCP calendar query (e.g. today)"
              />
            )}
          </div>
        )}

        {(widget.type === "calendar" ||
          widget.type === "ical_calendar" ||
          widget.config.calendarProvider === "ical") && (
          <ICalCalendarSettings
            selectedSourceId={String(widget.config.calendarSourceId || "all")}
            onSelectedSourceIdChange={(sourceId) =>
              updateWidget(widget.id, (current) => ({
                ...current,
                config: {
                  ...current.config,
                  calendarProvider: "ical",
                  calendarSourceId: sourceId,
                },
              }))
            }
            variant="light"
          />
        )}

        {(widget.type === "notes" || widget.type === "notion_notes") && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Notes provider
            </div>
            {renderChoiceButtons(
              ["internal", "obsidian", "notion", "zapier", "mcp"] as DashboardNotesProvider[],
              (widget.config.notesProvider ||
                "internal") as DashboardNotesProvider,
              (provider) => {
                updateWidget(widget.id, (current) => ({
                  ...current,
                  config: { ...current.config, notesProvider: provider },
                }));
              },
            )}
            {widget.config.notesProvider === "notion" && (
              <input
                value={String(widget.config.notionQuery || "")}
                onChange={(event) =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      notionQuery: event.target.value,
                    },
                  }))
                }
                placeholder="Notion search query, page, or database"
                className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
            )}
            {widget.config.notesProvider === "zapier" && (
              <input
                value={String(widget.config.zapierQuery || "")}
                onChange={(event) =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      zapierQuery: event.target.value,
                    },
                  }))
                }
                placeholder="Zapier notes query"
                className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
            )}
            {widget.config.notesProvider === "mcp" && (
              <McpProviderExtras
                widget={widget}
                updateWidget={updateWidget}
                queryPlaceholder="MCP notes query (e.g. meeting notes)"
              />
            )}
          </div>
        )}

        {(widget.type === "tasks" || widget.type === "notion_projects") && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Task provider
            </div>
            {renderChoiceButtons(
              ["internal", "google", "notion", "zapier", "mcp"] as DashboardTaskProvider[],
              (widget.config.taskProvider ||
                "internal") as DashboardTaskProvider,
              (provider) => {
                updateWidget(widget.id, (current) => ({
                  ...current,
                  config: { ...current.config, taskProvider: provider },
                }));
              },
            )}
            {widget.config.taskProvider === "notion" && (
              <input
                value={String(widget.config.notionQuery || "")}
                onChange={(event) =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      notionQuery: event.target.value,
                    },
                  }))
                }
                placeholder="Notion project/task search query"
                className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
            )}
            {widget.config.taskProvider === "zapier" && (
              <input
                value={String(widget.config.zapierQuery || "")}
                onChange={(event) =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      zapierQuery: event.target.value,
                    },
                  }))
                }
                placeholder="Zapier task/project query"
                className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
            )}
            {widget.config.taskProvider === "mcp" && (
              <McpProviderExtras
                widget={widget}
                updateWidget={updateWidget}
                queryPlaceholder="MCP task/project query (e.g. open tasks)"
              />
            )}
          </div>
        )}

        {widget.type === "stock" && (
          <StockSymbolSettings
            symbols={widget.config.symbols}
            onSymbolsChange={(symbols) =>
              updateWidget(widget.id, (current) => ({
                ...current,
                config: { ...current.config, symbols },
              }))
            }
            variant="light"
          />
        )}

        {widget.type === "portfolio" && (
          <PortfolioHoldingsSettings
            holdings={widget.config.portfolioHoldings}
            onHoldingsChange={(portfolioHoldings) =>
              updateWidget(widget.id, (current) => ({
                ...current,
                config: { ...current.config, portfolioHoldings },
              }))
            }
            variant="light"
          />
        )}

        {widget.type === "news" && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-4">
              <div>
                <div className="mb-3 text-sm font-semibold text-slate-800">
                  News source
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {newsProviderOptions.map((provider) => {
                    const active =
                      (widget.config.newsProvider || "grounded") === provider.id;
                    return (
                      <button
                        key={provider.id}
                        onClick={() =>
                          updateWidget(widget.id, (current) => ({
                            ...current,
                            config: {
                              ...current.config,
                              newsProvider: provider.id,
                            },
                          }))
                        }
                        className={`rounded-[1.15rem] border p-3 text-left transition ${
                          active
                            ? "border-sky-300 bg-sky-50 text-sky-900 shadow-sm"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em]">
                          {provider.label}
                        </div>
                        <div className="mt-1 text-xs leading-5 opacity-75">
                          {provider.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {(widget.config.newsProvider || "grounded") === "grounded" && (
                <BlurInput
                  label="Topic"
                  value={String(widget.config.newsTopic || "")}
                  placeholder="Technology, AI, Sports"
                  onCommit={(value) =>
                    updateWidget(widget.id, (current) => ({
                      ...current,
                      config: { ...current.config, newsTopic: value },
                    }))
                  }
                />
              )}

              {(widget.config.newsProvider || "grounded") === "nytimes" && (
                <div>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    Category
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {NEWS_FEED_CATEGORIES.nytimes.map((category) => (
                      <button
                        key={category.id}
                        onClick={() =>
                          updateWidget(widget.id, (current) => ({
                            ...current,
                            config: {
                              ...current.config,
                              newsCategory: category.id,
                            },
                          }))
                        }
                        className={chipClass(
                          (widget.config.newsCategory || "top") === category.id,
                        )}
                      >
                        {category.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(widget.config.newsProvider || "grounded") === "custom_rss" && (
                <BlurInput
                  label="RSS URL"
                  value={String(widget.config.newsCustomFeedUrl || "")}
                  placeholder="https://example.com/feed.xml"
                  onCommit={(value) =>
                    updateWidget(widget.id, (current) => ({
                      ...current,
                      config: {
                        ...current.config,
                        newsProvider: "custom_rss",
                        newsCustomFeedUrl: value,
                      },
                    }))
                  }
                />
              )}
            </div>
          </div>
        )}

        {widget.type === "music" && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-4">
              <div className="mb-1 text-sm font-semibold text-slate-800">
                Music player
              </div>
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Source
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DASHBOARD_MUSIC_SOURCE_OPTIONS.map((source) => {
                    const active =
                      ((widget.config.musicSource || "youtube") as DashboardMusicSource) === source.value;
                    return (
                      <button
                        key={source.value}
                        onClick={() =>
                          updateWidget(widget.id, (current) => ({
                            ...current,
                            config: {
                              ...current.config,
                              musicSource: source.value,
                            },
                          }))
                        }
                        className={`rounded-[1.15rem] border p-3 text-left transition ${
                          active
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em]">
                          {source.label}
                        </div>
                        <div className="mt-1 text-xs leading-5 opacity-75">
                          {source.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Design
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DASHBOARD_MUSIC_DESIGN_OPTIONS.map((design) => {
                    const active =
                      ((widget.config.musicDesign || "curio") as DashboardMusicDesign) === design.value;
                    return (
                      <button
                        key={design.value}
                        onClick={() =>
                          updateWidget(widget.id, (current) => ({
                            ...current,
                            config: {
                              ...current.config,
                              musicDesign: design.value,
                            },
                          }))
                        }
                        className={`rounded-[1.15rem] border p-3 text-left transition ${
                          active
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em]">
                          {design.label}
                        </div>
                        <div className="mt-1 text-xs leading-5 opacity-75">
                          {design.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {widget.type === "youtube_video" && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-4">
              <div className="mb-1 text-sm font-semibold text-slate-800">
                YouTube defaults
              </div>
              <BlurInput
                label="Default search"
                value={String(widget.config.youtubeQuery || "")}
                placeholder="Live coding, lo-fi mix, travel vlog"
                onCommit={(value) =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: { ...current.config, youtubeQuery: value },
                  }))
                }
              />
              <SettingsToggle
                label="Autoplay on AI open"
                description="When AI routes a video request to this widget, start playback automatically."
                enabled={widget.config.youtubeAutoplay !== false}
                onToggle={() =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      youtubeAutoplay: current.config.youtubeAutoplay === false,
                    },
                  }))
                }
                color="bg-rose-500"
              />
            </div>
          </div>
        )}

        {widget.type === "analog_clock" && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-4">
              <div className="mb-1 text-sm font-semibold text-slate-800">
                Clock face
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {DASHBOARD_CLOCK_DESIGN_OPTIONS.map((design) => {
                  const active =
                    (widget.config.clockDesign || "modern") === design.value;
                  return (
                    <button
                      key={design.value}
                      onClick={() =>
                        updateWidget(widget.id, (current) => ({
                          ...current,
                          config: {
                            ...current.config,
                            clockDesign: design.value,
                          },
                        }))
                      }
                      className={`rounded-[1.15rem] border p-3 text-left transition ${
                        active
                          ? "border-sky-300 bg-sky-50 text-sky-900 shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em]">
                        {design.label}
                      </div>
                      <div className="mt-1 text-xs leading-5 opacity-75">
                        {design.description}
                      </div>
                    </button>
                  );
                })}
              </div>
              <SettingsToggle
                label="Show seconds hand"
                description="Keeps the second hand visible for a more active dial."
                enabled={widget.config.showSecondsHand === true}
                onToggle={() =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      showSecondsHand: current.config.showSecondsHand !== true,
                    },
                  }))
                }
                color="bg-indigo-500"
              />
            </div>
          </div>
        )}

        {widget.type === "pomodoro" && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberInput
                label="Work mins"
                value={Number(widget.config.workMins || 25)}
                max={60}
                onCommit={(value) =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: { ...current.config, workMins: value },
                  }))
                }
              />
              <NumberInput
                label="Break mins"
                value={Number(widget.config.breakMins || 5)}
                max={30}
                onCommit={(value) =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: { ...current.config, breakMins: value },
                  }))
                }
              />
            </div>
          </div>
        )}

        {widget.type === "health" && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberInput
                label="Step goal"
                value={Number(widget.config.stepGoal || 8500)}
                max={50000}
                onCommit={(value) =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: { ...current.config, stepGoal: value },
                  }))
                }
              />
              <NumberInput
                label="Move goal"
                value={Number(widget.config.moveGoal || 650)}
                max={2000}
                onCommit={(value) =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: { ...current.config, moveGoal: value },
                  }))
                }
              />
              <NumberInput
                label="Exercise goal"
                value={Number(widget.config.exerciseGoal || 45)}
                max={240}
                onCommit={(value) =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: { ...current.config, exerciseGoal: value },
                  }))
                }
              />
              <NumberInput
                label="Stand goal"
                value={Number(widget.config.standGoal || 12)}
                max={24}
                onCommit={(value) =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: { ...current.config, standGoal: value },
                  }))
                }
              />
            </div>
          </div>
        )}

        {widget.type === "ha_entities" && (
          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <BlurInput
                label="Domain filter"
                value={String(widget.config.domain || "")}
                placeholder="light, sensor, lock"
                onCommit={(value) =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: { ...current.config, domain: value },
                  }))
                }
              />
              <BlurInput
                label="Entity ids"
                value={
                  Array.isArray(widget.config.entityIds)
                    ? widget.config.entityIds.join(", ")
                    : ""
                }
                placeholder="light.kitchen, lock.front_door"
                onCommit={(value) =>
                  updateWidget(widget.id, (current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      entityIds: value
                        ? value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean)
                        : [],
                    },
                  }))
                }
              />
            </div>
          </div>
        )}

        {widget.type === "robot_face" && (
          <div className="rounded-[1.25rem] border border-emerald-200 bg-emerald-50/70 p-4 text-sm leading-relaxed text-emerald-900 shadow-sm">
            Face preview is enabled on the board. Hide it here when you do not
            need that surface.
          </div>
        )}
      </div>
    );
  };

  return (
    <SettingsSection
      title="Dashboard"
      icon={<LayoutGrid size={18} className="text-emerald-500" />}
    >
      <div className="settings-consistency-scope space-y-4">
        <div className="settings-unified-card rounded-[1.5rem] border p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-900">
                Board mode
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Choose what stays on screen.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
                <span>{activeWidgets.length} active</span>
                <span>{dashboardPreferences.mode === "grid" ? "Grid" : "Freeform"}</span>
                <span>Snap {dashboardPreferences.snapToGrid ? "on" : "off"}</span>
                <span>Glass {dashboardPreferences.glassEffectEnabled ? "on" : "off"}</span>
                <span>Feel {Math.round(dashboardPreferences.glassEffectIntensity)}%</span>
                <span>Glow {dashboardPreferences.widgetGlowEnabled ? "on" : "off"}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-1.5">
              {(["face", "dashboard"] as IdleMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setIdleMode(mode)}
                  className={toggleCardClass(idleMode === mode)}
                >
                  <div className="text-sm font-semibold">
                    {mode === "face" ? "Face" : "Dashboard"}
                  </div>
                  <div className="mt-0.5 text-xs opacity-70">
                    {mode === "face" ? "Full screen" : "On board"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.95fr]">
          <div className="settings-unified-card rounded-[1.5rem] border p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <LayoutGrid size={16} className="text-slate-500" />
              <div className="text-sm font-semibold text-slate-900">
                Board controls
              </div>
            </div>
            <div className="mt-4 grid gap-4">
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Layout mode
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["grid", "freeform"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => updatePreferences({ mode })}
                      className={toggleCardClass(
                        dashboardPreferences.mode === mode,
                      )}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-70">
                        {mode}
                      </div>
                      <div className="mt-1 text-sm font-semibold">
                        {mode === "grid"
                          ? "Structured packing"
                          : "Freeform canvas"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <SettingsToggle
                label="Snap widgets to the grid"
                description="Keeps drag and resize interactions feeling cleaner and more predictable."
                enabled={dashboardPreferences.snapToGrid}
                onToggle={() =>
                  updatePreferences({
                    snapToGrid: !dashboardPreferences.snapToGrid,
                  })
                }
                color="bg-sky-500"
                icon={<Magnet size={14} />}
              />
              <SettingsToggle
                label="Widget glow"
                description="Adds a soft accent glow around dashboard widgets."
                enabled={dashboardPreferences.widgetGlowEnabled}
                onToggle={() =>
                  updatePreferences({
                    widgetGlowEnabled: !dashboardPreferences.widgetGlowEnabled,
                  })
                }
                color="bg-amber-500"
                icon={<SunMedium size={14} />}
              />
              <SettingsToggle
                label="Reduce dashboard motion"
                description="Disables entrance animation and long layout transitions for a calmer board."
                enabled={dashboardPreferences.reduceMotion}
                onToggle={() =>
                  updatePreferences({
                    reduceMotion: !dashboardPreferences.reduceMotion,
                  })
                }
                color="bg-slate-700"
                icon={<Gauge size={14} />}
              />
              <SettingsToggle
                label="Dashboard glass effect"
                description="Uses translucent blurred cards and panels instead of solid surfaces."
                enabled={dashboardPreferences.glassEffectEnabled}
                onToggle={() =>
                  updatePreferences({
                    glassEffectEnabled: !dashboardPreferences.glassEffectEnabled,
                  })
                }
                color="bg-cyan-500"
                icon={<Gem size={14} />}
              />
              <label className="rounded-[1.25rem] border border-slate-200 bg-white/70 p-4">
                <span className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-start gap-2">
                    <SlidersHorizontal
                      size={14}
                      className="mt-0.5 shrink-0 text-slate-500"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">
                        Glassy feel
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">
                        Adjusts transparency, blur, and card shine while glass is on.
                      </span>
                    </span>
                  </span>
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                    {Math.round(dashboardPreferences.glassEffectIntensity)}%
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={dashboardPreferences.glassEffectIntensity}
                  onChange={(event) =>
                    updatePreferences({
                      glassEffectIntensity: Number(event.currentTarget.value),
                    })
                  }
                  className="mt-3 h-2 w-full accent-cyan-500"
                  aria-label="Adjust dashboard glassy feel"
                />
              </label>
            </div>
          </div>

          <div className="settings-unified-card rounded-[1.5rem] border p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={16} className="text-slate-500" />
              <div className="text-sm font-semibold text-slate-900">
                Interactivity
              </div>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              Toggle dashboard-wide interactivity. Each toggle can be
              overridden per widget from the widget settings sheet.
            </p>
            <div className="mt-4">
              <DashboardInteractivitySettings />
            </div>
          </div>

          <DashboardPresetsSection dashboardWidgets={widgets} setDashboardWidgets={updateWidgets} />

          <div className="settings-unified-card rounded-[1.5rem] border p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Palette size={16} className="text-slate-500" />
              <div className="text-sm font-semibold text-slate-900">
                Visual system
              </div>
            </div>
            <div className="mt-4 grid gap-4">
              <div className="settings-unified-subpanel rounded-[1.25rem] border p-4">
                <div className="flex items-center gap-2">
                  <WandSparkles size={15} className="text-violet-500" />
                  <div className="text-sm font-semibold text-slate-900">
                    AI Theme Generator
                  </div>
                </div>
                <form onSubmit={handleGenerateTheme} className="mt-3 grid gap-2">
                  <input
                    value={themePrompt}
                    onChange={(event) => setThemePrompt(event.currentTarget.value)}
                    placeholder="Describe a theme..."
                    aria-label="Describe dashboard theme"
                    className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                  />
                  <button
                    type="submit"
                    disabled={!themePrompt.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <WandSparkles size={14} />
                    Generate Theme
                  </button>
                </form>
                <button
                  type="button"
                  onClick={handleResetTheme}
                  className="mt-2 inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  <RotateCcw size={14} />
                  Reset Theme
                </button>
                {themeGeneratorStatus && (
                  <div className="mt-2 text-xs font-medium text-slate-500">
                    {themeGeneratorStatus}
                  </div>
                )}
              </div>
              <div className="settings-unified-subpanel rounded-[1.25rem] border p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Animated backgrounds
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {DASHBOARD_ANIMATED_BACKGROUND_OPTIONS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleAnimatedBackgroundPreset(preset)}
                      aria-label={`Use ${preset.label} animated background`}
                      className="group relative min-h-20 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <span
                        className="absolute inset-0"
                        style={{ background: preset.backgroundColor }}
                      />
                      <span className="absolute inset-0 bg-black/15" />
                      <span className="relative z-10 flex h-full min-h-20 flex-col justify-end gap-1 p-3">
                        <span className="text-sm font-semibold text-white">
                          {preset.label}
                        </span>
                        <span className="text-[11px] leading-snug text-white/75">
                          {preset.description}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Accent preset
                </div>
                <div className="flex flex-wrap gap-2">
                  {accentOptions.map((accent) => (
                    <button
                      key={accent.value}
                      onClick={() =>
                        updatePreferences({
                          accentPreset: accent.value,
                          accentColor: undefined,
                        })
                      }
                      className={`flex items-center gap-2 rounded-full border px-3 py-2 transition ${
                        !dashboardPreferences.accentColor &&
                        dashboardPreferences.accentPreset === accent.value
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: accent.color }}
                      />
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
                        {accent.label}
                      </span>
                    </button>
                  ))}
                  <ColorWheelInput
                    value={dashboardCustomAccentValue}
                    onChange={(accentColor) => updatePreferences({ accentColor })}
                    ariaLabel="Custom dashboard settings accent color"
                    title="Custom dashboard accent color"
                    active={Boolean(dashboardPreferences.accentColor)}
                    inactiveClassName="border-slate-200 hover:border-slate-300"
                    activeClassName="scale-105 border-slate-900 shadow-md"
                  />
                </div>
              </div>

              <div className="settings-unified-subpanel rounded-[1.25rem] border p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Quick actions
                </div>
                <div className="mt-3 grid gap-2">
                  <button
                    onClick={() => toggleWidget("robot_face")}
                    className={`${actionClass} justify-start text-left`}
                  >
                    {hasRobotWidget ? "Hide face widget" : "Add face widget"}
                  </button>
                  <button
                    onClick={resetDashboard}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    <RotateCcw size={14} />
                    Restore starter dashboard
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-unified-card rounded-[1.5rem] border p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Widget Library
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                Add or remove surfaces by category
              </div>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              {activeWidgets.length} / {MAX_DASHBOARD_WIDGETS} active
            </div>
          </div>
          <div className="mt-4 grid gap-4">
            {widgetGroups.map(({ category, items }) => (
              <div
                key={category}
                className="rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-4"
              >
                <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  {category}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => {
                    const enabled = activeTypes.has(item.type);
                    const disabled =
                      !enabled && widgets.length >= MAX_DASHBOARD_WIDGETS;
                    return (
                      <button
                        key={item.type}
                        onClick={() => toggleWidget(item.type)}
                        disabled={disabled}
                        className={widgetToggleClass(enabled, disabled)}
                      >
                        <span className="text-lg">{item.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {item.label}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                            {enabled ? "On the board" : item.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-unified-card rounded-[1.5rem] border p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Active Widgets
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                Configure the surfaces that are actually live on the dashboard
              </div>
            </div>
            <div className="text-xs text-slate-500">
              Click a widget card to reveal detailed settings.
            </div>
          </div>

          {activeWidgets.length === 0 ? (
            <div className="mt-4 rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-500">
              No widgets are active yet. Add a few from the library above.
            </div>
          ) : (
            <div className="mt-4 grid gap-4">
              {activeWidgets.map((widget, index) => {
                const catalog = getDashboardCatalogItem(widget.type);
                const currentSpan = getWidgetSpan(widget);
                const expanded = expandedIds.includes(widget.id);

                return (
                  <div
                    key={widget.id}
                    className="overflow-hidden rounded-[1.35rem] border border-slate-200 bg-slate-50/80 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
                      <button
                        onClick={() => toggleExpanded(widget.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg">
                            {catalog?.icon || "🧩"}
                          </span>
                          <span className="text-sm font-semibold text-slate-900">
                            {catalog?.label || widget.type}
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 shadow-sm">
                            #{index + 1}
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 shadow-sm">
                            {currentSpan.w} x {currentSpan.h}
                          </span>
                        </div>
                        <p className="mt-2 max-w-2xl text-[12px] leading-5 text-slate-500">
                          {catalog?.description}
                        </p>
                      </button>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => toggleExpanded(widget.id)}
                          className={actionClass}
                        >
                          {expanded ? "Hide details" : "Customize"}
                        </button>
                        <button
                          onClick={() => hideWidget(widget.id)}
                          className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                        >
                          Hide widget
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t border-slate-200 px-4 py-4">
                        {renderWidgetSpecificControls(widget)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </SettingsSection>
  );
};

// ---------------------------------------------------------------------------
// DashboardPresetsSection — Saved layout presets management
// ---------------------------------------------------------------------------

interface DashboardPresetsSectionProps {
  dashboardWidgets: DashboardWidget[];
  setDashboardWidgets: (widgets: DashboardWidget[]) => void;
}

const DashboardPresetsSection: React.FC<DashboardPresetsSectionProps> = ({
  dashboardWidgets,
  setDashboardWidgets,
}) => {
  const [presets, setPresets] = useState<DashboardLayoutPreset[]>(() =>
    getDashboardLayoutPresets(),
  );
  const [importError, setImportError] = useState<string | null>(null);

  // Re-read presets on settings-changed
  useEffect(() => {
    const refresh = () => setPresets(getDashboardLayoutPresets());
    window.addEventListener('curio:settings-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('curio:settings-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const handleSaveCurrentAsPreset = () => {
    const id = `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const name = `Page preset ${presets.length + 1}`;
    const preset: DashboardLayoutPreset = {
      id,
      name,
      schemaVersion: 1,
      widgets: dashboardWidgets,
      category: 'custom',
      createdAt: Date.now(),
    };
    saveDashboardLayoutPreset(preset);
    setPresets(getDashboardLayoutPresets());
  };

  const handleApplyPreset = (preset: DashboardLayoutPreset) => {
    const previousWidgets = [...dashboardWidgets];
    setDashboardWidgets(preset.widgets);
    dashboardToastBus.show({
      id: `preset-apply-${preset.id}`,
      label: `Applied preset "${preset.name}"`,
      onUndo: () => setDashboardWidgets(previousWidgets),
      durationMs: 5000,
    });
  };

  const handleDeletePreset = (presetId: string) => {
    deleteDashboardLayoutPreset(presetId);
    setPresets(getDashboardLayoutPresets());
  };

  const handleExportPreset = (preset: DashboardLayoutPreset) => {
    try {
      const json = exportDashboardLayoutPreset(preset);
      // Always download as a file for a proper export
      downloadPresetJson(json, preset.name);
      // Also copy to clipboard as a convenience
      if (navigator.clipboard) {
        navigator.clipboard.writeText(json).catch(() => {
          // Clipboard copy is best-effort
        });
      }
      dashboardToastBus.show({
        id: 'preset-export',
        label: `Exported "${preset.name}" as JSON file`,
        durationMs: 3000,
      });
    } catch {
      dashboardToastBus.show({
        id: 'preset-export-error',
        label: 'Export failed',
        tone: 'danger',
        durationMs: 3000,
      });
    }
  };

  const handleImport = () => {
    setImportError(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const preset = importDashboardLayoutPreset(reader.result as string);
          saveDashboardLayoutPreset(preset);
          setPresets(getDashboardLayoutPresets());
          setImportError(null);
          dashboardToastBus.show({
            id: 'preset-import',
            label: `Imported preset "${preset.name}"`,
            durationMs: 3000,
          });
        } catch (error) {
          setImportError(
            error instanceof Error ? error.message : 'Import failed',
          );
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Group presets by category
  const grouped = useMemo(() => {
    const groups: Record<string, DashboardLayoutPreset[]> = {};
    for (const preset of presets) {
      const cat = preset.category || 'custom';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(preset);
    }
    return groups;
  }, [presets]);

  return (
    <div className="settings-unified-card rounded-[1.5rem] border p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <LayoutGrid size={16} className="text-slate-500" />
        <div className="text-sm font-semibold text-slate-900">
          Layout Presets
        </div>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">
        Save, apply, export, and import dashboard page layouts.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleSaveCurrentAsPreset}
          className="rounded-xl bg-[var(--ether-control-bg)] px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-[var(--ether-control-hover)]"
        >
          Save current page
        </button>
        <button
          type="button"
          onClick={handleImport}
          className="rounded-xl bg-[var(--ether-control-bg)] px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-[var(--ether-control-hover)]"
        >
          Import
        </button>
      </div>

      {importError && (
        <p className="mt-2 text-xs text-rose-500">{importError}</p>
      )}

      {presets.length === 0 && (
        <p className="mt-3 text-xs text-slate-400">
          No saved presets yet. Save the current page layout to create one.
        </p>
      )}

      {Object.entries(grouped).map(([category, categoryPresets]) => (
        <div key={category} className="mt-3">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            {category}
          </div>
          <div className="grid gap-1.5">
            {categoryPresets.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-slate-700">
                    {preset.name}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {preset.widgets.length} widget{preset.widgets.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="rounded-lg px-2 py-1 text-[10px] font-bold text-blue-600 transition hover:bg-blue-50"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportPreset(preset)}
                    className="rounded-lg px-2 py-1 text-[10px] font-bold text-slate-500 transition hover:bg-slate-100"
                  >
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePreset(preset.id)}
                    className="rounded-lg px-2 py-1 text-[10px] font-bold text-rose-500 transition hover:bg-rose-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

function downloadPresetJson(json: string, name: string) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default React.memo(DashboardSection);
