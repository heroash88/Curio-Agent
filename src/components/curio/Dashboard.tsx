import React, {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  setTempUnit,
  setUserAvatarDataUrl,
  setDashboardTitle,
  setUserName,
  buildAppBackgroundCss,
  useHaMcpEnabled,
  useHaMcpUrl,
  useAppBackgroundColor,
  useAppBackgroundStyle,
  useProfileDashboardLayout,
  useProfileActiveDashboardPageId,
  useProfileDashboardPages,
  useProfileDashboardPreferences,
  useProactiveConfig,
  useNotificationSystemStatus,
  useRoutines,
  useTempUnit,
  useThemeMode,
  useUserAvatarDataUrl,
  useUserName,
  useDashboardTitle,
  clearWidgetPersistentState,
} from "../../utils/settingsStorage";
import {
  useNotificationCenterEntries,
  useUnreadNotificationCount,
} from "../../services/notificationCenterStore";
import { useSpeakerSessionState } from "../../services/speakerSessionStore";
import type { AqiData, WeatherData } from "../../services/weatherService";
import {
  clampWidgetDimensions,
  createDashboardWidget,
  DEFAULT_DASHBOARD_PREFERENCES,
  DEFAULT_DASHBOARD_WIDGETS,
  getDashboardCatalogItem,
  type DashboardLayoutMode,
  type DashboardRobotFaceStyle,
  type DashboardWidget,
  type DashboardWidgetConfig,
  type DashboardWidgetType,
  WIDGET_CATALOG,
} from "../../services/dashboardTypes";
import {
  trackDashboardActivityEvent,
  useDashboardActivityTracking,
} from "../../services/screenTimePersistence";
import {
  getDashboardRefreshEventName,
  isLiveDashboardWidget,
} from "../../services/dashboardRefresh";
import {
  getDashboardAccentVariables,
  getDashboardCustomAccentVariables,
} from "../../services/dashboardVisualPresets";
import {
  buildDefaultFreeformRect,
  buildFreeformRectFromPackedItem,
  clamp,
  getPackedBoardHeight,
  packDashboardGrid,
  shouldFloatWidgetInGrid,
  snapValue,
  type DashboardGridMetrics,
  type PackedDashboardItem,
} from "./dashboard/dashboardLayout";
import {
  DASHBOARD_TOUCH_KEYBOARD_DISMISS_DELAY_MS,
  WIDGET_ACTION_MENU_MARGIN,
  WIDGET_ACTION_MENU_WIDTH,
  avatarFileToDataUrl,
  blurActiveDashboardInput,
  captureDashboardPointer,
  cloneDashboardWidget,
  getActiveGestureOriginRect,
  getActiveGesturePreviewRect,
  getActiveGesturePreviewSize,
  getClampedWidgetActionMenuPosition,
  getDashboardAnimatedGlassVariables,
  getDashboardGlassVariables,
  getVisibleWidgets,
  insertVisibleWidget,
  isDashboardEditableElement,
  matchesWidgetSearch,
  mergeVisibleOrder,
  normalizeWidgets,
  preventDashboardPointerDefault,
  resolveColumns,
  resolveGridCanvasWidth,
  usesCoarsePointerInput,
  type ActiveGesture,
  type DashboardCreateWidgetOptions,
  type FloatingWidgetPosition,
  type WidgetActionMenuPosition,
} from "./dashboard/dashboardBoardUtils";
import { useDashboardPersistentState } from "./dashboard/useDashboardPersistentState";
import { useDashboardWidgetIntents } from "./dashboard/useDashboardWidgetIntents";
import { setCardThemeOverride } from "../../hooks/useCardTheme";

import { preloadDashboardWidgetComponents } from "./dashboard/dashboardRegistry";
import {
  getDayPartGreeting,
} from "../../services/dashboardProviderUtils";

import { buildDashboardSearchResults } from "../../services/dashboardSearch";

import { type PendingResizeHold } from "./dashboard/DashboardWidgetFrame";
import { DashboardWidgetTile } from "./dashboard/DashboardWidgetTile";
import { DashboardDeleteConfirmationModal } from "./dashboard/DashboardDeleteConfirmationModal";
import { DashboardWidgetActionMenu } from "./dashboard/DashboardWidgetActionMenu";
import DashboardToolbar from "./dashboard/DashboardToolbar";
import { FloatingRobotOverlay } from "./dashboard/FloatingRobotOverlay";
import { getDashboardRobotBubble } from "./dashboard/dashboardRobotBubbles";
import { WidgetSummaryBubble } from "./dashboard/WidgetSummaryBubble";
import DashboardToastHost from "./dashboard/DashboardToastHost";
import { setActivePageWidgetsGetter } from "../../services/dashboardCommandPaletteSources";
import { MotionConfig } from "framer-motion";
import { useMotionProfile } from "../../hooks/useMotionProfile";

const BoardControlsPanel = React.lazy(
  () => import("./dashboard/BoardControlsPanel"),
);
const NotificationSidePanel = React.lazy(
  () => import("./dashboard/NotificationSidePanel"),
);
const WidgetSettingsModal = React.lazy(
  () => import("./dashboard/WidgetSettingsModal"),
);
const DashboardAvatarPanel = React.lazy(
  () => import("./dashboard/DashboardAvatarPanel"),
);
const AnimatedBackgroundRenderer = React.lazy(
  () => import("./dashboard/AnimatedBackgroundRenderer"),
);
const DashboardWidgetPickerPanel = React.lazy(
  () => import("./dashboard/DashboardWidgetPickerPanel"),
);
const DashboardFocusedWidgetOverlay = React.lazy(
  () => import("./dashboard/DashboardFocusedWidgetOverlay"),
);

const DashboardCommandPalette = React.lazy(
  () => import("./dashboard/DashboardCommandPalette"),
);

export { getClampedWidgetActionMenuPosition };

interface DashboardProps {
  weather: WeatherData | null;
  aqi: AqiData | null;
  faceSlot?:
    | React.ReactNode
    | ((faceStyle?: DashboardRobotFaceStyle) => React.ReactNode);
  connectionLabel?: string;
  connectionActive?: boolean;
  connectionBusy?: boolean;
  onToggleConnection?: () => void;
  cameraEnabled?: boolean;
  canFlipCamera?: boolean;
  onToggleCamera?: () => void;
  onFlipCamera?: () => void | Promise<unknown>;
  isMuted?: boolean;
  onToggleMute?: () => void;
  onOpenSettings?: () => void;
  textInputVisible?: boolean;
  onToggleTextInput?: () => void;
}

const isFloatingRobotWidget = (widget: DashboardWidget) =>
  widget.type === "robot_face" && widget.config.robotFloatingEnabled === true;

const useElementWidth = (ref: React.RefObject<HTMLElement | null>) => {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

  useEffect(() => {
    if (!ref.current) return;
    let frameId = 0;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nextWidth = Math.round(entry.contentRect.width);
        if (nextWidth === widthRef.current) continue;
        widthRef.current = nextWidth;
        if (frameId) {
          window.cancelAnimationFrame(frameId);
        }
        frameId = window.requestAnimationFrame(() => {
          frameId = 0;
          setWidth((current) => (current === nextWidth ? current : nextWidth));
        });
      }
    });

    observer.observe(ref.current);
    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      observer.disconnect();
    };
  }, [ref]);

  return width;
};

// PendingResizeHold type is imported from DashboardWidgetFrame

// WidgetMenuButton, DashboardWidgetBodyProps, and DashboardWidgetBody are now
// defined in ./dashboard/DashboardWidgetBody.tsx and used by DashboardWidgetFrame.

// estimateGridSpan is imported from dashboardLayout

const Dashboard: React.FC<DashboardProps> = ({
  weather,
  aqi,
  faceSlot,
  connectionLabel,
  connectionActive = false,
  connectionBusy = false,
  onToggleConnection,
  cameraEnabled = false,
  canFlipCamera = false,
  onToggleCamera,
  onFlipCamera,
  isMuted = false,
  onToggleMute,
  onOpenSettings,
  textInputVisible = false,
  onToggleTextInput,
}) => {
  const speakerSession = useSpeakerSessionState();
  const activeProfileId = speakerSession.activeProfileId ?? null;
  const activeProfileName = speakerSession.activeProfileName;
  const recognizedBy = speakerSession.recognizedBy;
  const globalThemeMode = useThemeMode();
  const globalAppBackgroundStyle = useAppBackgroundStyle();
  const globalAppBackgroundColor = useAppBackgroundColor();
  const haEnabled = useHaMcpEnabled();
  const haUrl = useHaMcpUrl();
  const configuredUserName = useUserName();
  const avatarDataUrl = useUserAvatarDataUrl();
  const proactiveConfig = useProactiveConfig();
  const notificationSystemStatus = useNotificationSystemStatus();
  const routines = useRoutines();
  const tempUnit = useTempUnit();
  const notificationEntries = useNotificationCenterEntries();
  const unreadNotificationCount = useUnreadNotificationCount();
  const effectiveNotificationEntries = notificationSystemStatus.enabled
    ? notificationEntries
    : [];
  const effectiveUnreadNotificationCount = notificationSystemStatus.enabled
    ? unreadNotificationCount
    : 0;

  const savedDashboardPages = useProfileDashboardPages(activeProfileId);
  const savedActiveDashboardPageId = useProfileActiveDashboardPageId(activeProfileId);
  const savedLayoutWidgets = useProfileDashboardLayout(activeProfileId);
  const savedPreferences = useProfileDashboardPreferences(activeProfileId);
  useDashboardActivityTracking(true);
  const [editMode, setEditMode] = useState(false);
  const [showBoardPanel, setShowBoardPanel] = useState(false);
  const [showAvatarPanel, setShowAvatarPanel] = useState(false);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [showActionsPanel, setShowActionsPanel] = useState(false);
  const [showDashboardSearch, setShowDashboardSearch] = useState(false);
  const [notificationFilter, setNotificationFilter] =
    useState<"all" | "unread" | "high">("all");
  const [notificationPanelView, setNotificationPanelView] =
    useState<"activity" | "rules" | "routines">("activity");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [dashboardSearchQuery, setDashboardSearchQuery] = useState("");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [focusedWidgetId, setFocusedWidgetId] = useState<string | null>(null);
  const [highlightedWidgetId, setHighlightedWidgetId] = useState<string | null>(null);
  const [configuringWidgetId, setConfiguringWidgetId] = useState<string | null>(
    null,
  );
  const [widgetToDeleteId, setWidgetToDeleteId] = useState<string | null>(null);
  const [openWidgetMenuId, setOpenWidgetMenuId] = useState<string | null>(null);
  const [activeGesture, setActiveGesture] = useState<ActiveGesture | null>(
    null,
  );
  const [dashboardUserTyping, setDashboardUserTyping] = useState(false);
  const [resizeIntentWidgetId, setResizeIntentWidgetId] = useState<
    string | null
  >(null);
  const [widgetMenuPosition, setWidgetMenuPosition] =
    useState<WidgetActionMenuPosition | null>(null);
  const activeGestureRef = useRef<ActiveGesture | null>(activeGesture);

  const handlePersistentPageSelected = useCallback(() => {
    setFocusedWidgetId(null);
    setHighlightedWidgetId(null);
    setConfiguringWidgetId(null);
    setWidgetToDeleteId(null);
    setShowPicker(false);
    setShowDashboardSearch(false);
    setOpenWidgetMenuId(null);
    setWidgetMenuPosition(null);
  }, []);

  const {
    dashboardPages,
    activeDashboardPageId,
    activePageAppearance,
    themeMode,
    isDark,
    appBackgroundStyle,
    appBackgroundColor,
    widgets,
    preferences,
    widgetsRef,
    dashboardPagesRef,
    persistDashboardPages,
    persistActivePageAppearance,
    resetActivePageAppearance,
    persistWidgets,
    persistPreferences,
    selectDashboardPage,
    renameDashboardPage,
    moveDashboardPage,
    addDashboardPage,
    deleteDashboardPage,
  } = useDashboardPersistentState({
    activeProfileId,
    activeGestureRef,
    savedDashboardPages,
    savedActiveDashboardPageId,
    savedLayoutWidgets,
    savedPreferences,
    globalThemeMode,
    globalAppBackgroundStyle,
    globalAppBackgroundColor,
    onPageSelected: handlePersistentPageSelected,
  });
  useDashboardWidgetIntents({ widgetsRef, persistWidgets });

  // Cards render in a fixed-position stack outside this subtree, so they
  // don't inherit the dashboard's scoped `data-theme`. Broadcast the active
  // dashboard page theme globally while the dashboard is mounted so
  // response cards track whichever light/dark mode the user is viewing.
  useEffect(() => {
    setCardThemeOverride(themeMode);
    return () => setCardThemeOverride(null);
  }, [themeMode]);

  // Provide the active page widgets to the command palette service so it
  // can search on-board widgets without importing React context.
  useEffect(() => {
    setActivePageWidgetsGetter(() => widgetsRef.current);
    return () => setActivePageWidgetsGetter(null);
  }, [widgetsRef]);

  // Cmd+K / Ctrl+K listener for the command palette.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'k') return;

      // Ignore when commandPaletteEnabled is false
      if (!preferences.interactivity.commandPaletteEnabled) return;

      // Ignore when focus is inside a text-editable element
      const active = document.activeElement;
      if (active) {
        const tag = active.tagName.toLowerCase();
        if (
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          (active as HTMLElement).isContentEditable
        ) {
          return;
        }
      }

      event.preventDefault();
      setCommandPaletteOpen(true);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [preferences.interactivity.commandPaletteEnabled]);

  // Handle curio:dashboard-scroll-to-widget events.
  useEffect(() => {
    const handleScrollToWidget = (event: Event) => {
      const detail = (event as CustomEvent<{ widgetId: string }>).detail;
      if (!detail?.widgetId) return;

      const element = document.querySelector<HTMLElement>(
        `[data-dashboard-widget-id="${detail.widgetId}"]`,
      );
      if (!element) return;

      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Apply a temporary highlight ring for 1200ms
      element.classList.add('ring-2', 'ring-[var(--ether-primary)]');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-[var(--ether-primary)]');
      }, 1200);
    };

    window.addEventListener('curio:dashboard-scroll-to-widget', handleScrollToWidget);
    return () => window.removeEventListener('curio:dashboard-scroll-to-widget', handleScrollToWidget);
  }, []);

  const deferredPickerQuery = useDeferredValue(pickerQuery);
  const deferredDashboardSearchQuery = useDeferredValue(dashboardSearchQuery);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const boardCanvasRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const pickerSearchInputRef = useRef<HTMLInputElement>(null);
  const dashboardSearchInputRef = useRef<HTMLInputElement>(null);
  const dragElementRef = useRef<HTMLDivElement | null>(null);
  const widgetMenuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>(
    {},
  );
  const widgetMenuRef = useRef<HTMLDivElement | null>(null);
  const highlightedWidgetTimerRef = useRef<number | null>(null);
  const pendingTouchKeyboardDismissTimerRef = useRef<number | null>(null);
  const pendingAddWidgetTimerRef = useRef<number | null>(null);
  const pendingAddWidgetFrameRef = useRef<number | null>(null);
  const pendingResizeHoldRef = useRef<PendingResizeHold | null>(null);
  const typingCommentTimerRef = useRef<number | null>(null);
  const resizeIntentWidgetIdRef = useRef<string | null>(resizeIntentWidgetId);
  const pickerPointerAddHandledRef = useRef(false);
  const pickerPointerAddHandledTimerRef = useRef<number | null>(null);
  const openWidgetSettings = useCallback((widgetId: string) => {
    trackDashboardActivityEvent("settingsOpen");
    setOpenWidgetMenuId(null);
    setWidgetMenuPosition(null);
    setConfiguringWidgetId(widgetId);
  }, []);
  const handleDashboardActivityClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target instanceof Element ? event.target : null;
      const widgetNode = target?.closest<HTMLElement>("[data-dashboard-widget-id]");
      if (!widgetNode) return;
      const widgetId = widgetNode.dataset.dashboardWidgetId || "";
      const clickedWidget = widgets.find((widget) => widget.id === widgetId);
      if (!clickedWidget) return;
      trackDashboardActivityEvent("widgetInteraction", {
        widgetId,
        widgetType: clickedWidget.type,
        widgetLabel:
          getDashboardCatalogItem(clickedWidget.type)?.label || clickedWidget.type,
      });
    },
    [widgets],
  );
  const boardWidth = useElementWidth(boardContainerRef);
  const dashboardOwnerName = activeProfileName || configuredUserName || "";
  const customDashboardTitle = useDashboardTitle();
  const dashboardLabel =
    customDashboardTitle ||
    (dashboardOwnerName
      ? `${dashboardOwnerName}'s Dashboard`
      : "Shared Dashboard");
  const toolbarGreeting = dashboardOwnerName
    ? `${getDayPartGreeting()}, ${dashboardOwnerName}`
    : getDayPartGreeting();
  const enabledRoutineCount = routines.filter(
    (routine) => routine.enabled,
  ).length;
  const highPriorityNotificationCount = effectiveNotificationEntries.filter(
    (entry) => entry.priority === "high",
  ).length;
  const visibleNotificationEntries = effectiveNotificationEntries.filter((entry) => {
    if (notificationFilter === "unread") return entry.unread;
    if (notificationFilter === "high") return entry.priority === "high";
    return true;
  });
  const activeAccentPreset =
    activePageAppearance.accentPreset || preferences.accentPreset;
  const activeAccentColor =
    activePageAppearance.accentColor ||
    (activePageAppearance.accentPreset ? undefined : preferences.accentColor);
  const activeGlassEffectEnabled =
    activePageAppearance.glassEffectEnabled ?? preferences.glassEffectEnabled;
  const glassEffectIntensity = preferences.glassEffectIntensity;
  const widgetGlowEnabled = preferences.widgetGlowEnabled === true;
  const pageSwitcherPreferenceEnabled = preferences.showPageSwitcher !== false;
  const pageKeyboardShortcutsEnabled =
    preferences.pageKeyboardShortcutsEnabled !== false;
  const showPageSwitcher = pageSwitcherPreferenceEnabled && dashboardPages.length > 1;
  const hasOverlayPanel =
    showBoardPanel || showAvatarPanel || showNotificationsPanel || showActionsPanel;
  const floatingRobotSource = useMemo(() => {
    const activeWidgetSource = widgets.find(
      (widget) => widget.enabled && isFloatingRobotWidget(widget),
    );
    if (activeWidgetSource) {
      return { pageId: activeDashboardPageId, widget: activeWidgetSource };
    }

    const sources = dashboardPages.flatMap((page) =>
      page.widgets
        .filter((widget) => widget.enabled && isFloatingRobotWidget(widget))
        .map((widget) => ({ pageId: page.id, widget })),
    );
    if (sources.length === 0) return null;
    return (
      sources.find((source) => source.pageId === activeDashboardPageId) ||
      sources[0] ||
      null
    );
  }, [activeDashboardPageId, dashboardPages, widgets]);

  const clearPendingResizeHold = useCallback(() => {
    const pending = pendingResizeHoldRef.current;
    if (pending) {
      window.clearTimeout(pending.timerId);
    }
    pendingResizeHoldRef.current = null;
  }, []);

  useEffect(
    () => () => {
      if (typingCommentTimerRef.current !== null) {
        window.clearTimeout(typingCommentTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const root = boardContainerRef.current;
    if (!root) return;

    const noteTyping = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !root.contains(target) || !isDashboardEditableElement(target)) {
        return;
      }
      setDashboardUserTyping(true);
      if (typingCommentTimerRef.current !== null) {
        window.clearTimeout(typingCommentTimerRef.current);
      }
      typingCommentTimerRef.current = window.setTimeout(() => {
        typingCommentTimerRef.current = null;
        setDashboardUserTyping(false);
      }, 4500);
    };

    root.addEventListener("input", noteTyping, true);
    root.addEventListener("focusin", noteTyping, true);
    return () => {
      root.removeEventListener("input", noteTyping, true);
      root.removeEventListener("focusin", noteTyping, true);
    };
  }, []);

  useEffect(() => {
    activeGestureRef.current = activeGesture;
  }, [activeGesture]);

  useEffect(() => {
    resizeIntentWidgetIdRef.current = resizeIntentWidgetId;
  }, [resizeIntentWidgetId]);

  useEffect(() => {
    const preventGestureScroll = (event: TouchEvent) => {
      if (
        (!activeGestureRef.current && !pendingResizeHoldRef.current) ||
        !event.cancelable
      ) {
        return;
      }
      event.preventDefault();
    };

    window.addEventListener("touchmove", preventGestureScroll, {
      passive: false,
    });
    return () => {
      window.removeEventListener("touchmove", preventGestureScroll);
    };
  }, []);

  useEffect(() => clearPendingResizeHold, [clearPendingResizeHold]);

  useEffect(() => {
    const clearResizeIntent = (event: PointerEvent) => {
      const resizeIntentWidgetId = resizeIntentWidgetIdRef.current;
      if (!resizeIntentWidgetId) return;
      const target =
        event.target instanceof Element ? event.target : null;
      const widgetNode = target?.closest<HTMLElement>(
        "[data-dashboard-widget-id]",
      );
      if (widgetNode?.dataset.dashboardWidgetId === resizeIntentWidgetId) {
        return;
      }
      setResizeIntentWidgetId(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && resizeIntentWidgetIdRef.current) {
        setResizeIntentWidgetId(null);
      }
    };

    window.addEventListener("pointerdown", clearResizeIntent, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", clearResizeIntent, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const registerWidgetMenuButton = useCallback(
    (widgetId: string, node: HTMLButtonElement | null) => {
      if (node) {
        widgetMenuButtonRefs.current[widgetId] = node;
        return;
      }
      delete widgetMenuButtonRefs.current[widgetId];
    },
    [],
  );

  const updateWidgetMenuPosition = useCallback(() => {
    if (!openWidgetMenuId || typeof window === "undefined") return;
    const anchor = widgetMenuButtonRefs.current[openWidgetMenuId];
    if (!anchor) return;

    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = widgetMenuRef.current?.getBoundingClientRect();
    const menuWidth =
      menuRect?.width ||
      Math.min(
        WIDGET_ACTION_MENU_WIDTH,
        Math.max(1, window.innerWidth - WIDGET_ACTION_MENU_MARGIN * 2),
      );
    const menuHeight = Math.min(
      menuRect?.height || 280,
      Math.max(1, window.innerHeight - WIDGET_ACTION_MENU_MARGIN * 2),
    );
    const nextPosition = getClampedWidgetActionMenuPosition({
      anchorRect,
      menuWidth,
      menuHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });

    setWidgetMenuPosition((current) =>
      current &&
      Math.abs(current.left - nextPosition.left) < 0.5 &&
      Math.abs(current.top - nextPosition.top) < 0.5
        ? current
        : nextPosition,
    );
  }, [openWidgetMenuId]);

  useLayoutEffect(() => {
    if (!openWidgetMenuId) {
      setWidgetMenuPosition(null);
      return;
    }
    updateWidgetMenuPosition();
  }, [openWidgetMenuId, updateWidgetMenuPosition]);

  useEffect(() => {
    if (!openWidgetMenuId) return;

    const closeMenu = () => {
      setOpenWidgetMenuId(null);
      setWidgetMenuPosition(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openWidgetMenuId]);

  useEffect(() => {
    if (!openWidgetMenuId) return;

    window.addEventListener("resize", updateWidgetMenuPosition);
    window.addEventListener("scroll", updateWidgetMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateWidgetMenuPosition);
      window.removeEventListener("scroll", updateWidgetMenuPosition, true);
    };
  }, [openWidgetMenuId, updateWidgetMenuPosition]);

  const resetDashboardBoard = useCallback(() => {
    persistWidgets(DEFAULT_DASHBOARD_WIDGETS.map(cloneDashboardWidget));
    persistPreferences(DEFAULT_DASHBOARD_PREFERENCES);
    setEditMode(false);
    setShowPicker(false);
    setShowDashboardSearch(false);
  }, [persistPreferences, persistWidgets]);

  const closeToolbarPanels = useCallback(() => {
    setShowBoardPanel(false);
    setShowAvatarPanel(false);
    setShowNotificationsPanel(false);
    setShowActionsPanel(false);
    setOpenWidgetMenuId(null);
  }, []);

  const toggleDashboardEditMode = useCallback(() => {
    setEditMode((current) => !current);
    setShowPicker(false);
  }, []);

  const openWidgetPicker = useCallback(() => {
    setEditMode(true);
    setShowPicker(true);
    setPickerQuery("");
    setShowDashboardSearch(false);
    closeToolbarPanels();
  }, [closeToolbarPanels]);

  const openDashboardSearch = useCallback(() => {
    setShowDashboardSearch((current) => {
      const next = !current;
      if (next) {
        setDashboardSearchQuery("");
      }
      return next;
    });
    setShowPicker(false);
    closeToolbarPanels();
  }, [closeToolbarPanels]);

  useEffect(() => {
    if (!showPicker) return;
    if (usesCoarsePointerInput()) return;
    const frame = window.requestAnimationFrame(() => {
      pickerSearchInputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showPicker]);

  useEffect(() => {
    if (!showDashboardSearch) return;
    const frame = window.requestAnimationFrame(() => {
      dashboardSearchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showDashboardSearch]);

  useEffect(() => () => {
    if (highlightedWidgetTimerRef.current) {
      window.clearTimeout(highlightedWidgetTimerRef.current);
    }
    if (pendingTouchKeyboardDismissTimerRef.current !== null) {
      window.clearTimeout(pendingTouchKeyboardDismissTimerRef.current);
    }
    if (pendingAddWidgetTimerRef.current !== null) {
      window.clearTimeout(pendingAddWidgetTimerRef.current);
    }
    if (pendingAddWidgetFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingAddWidgetFrameRef.current);
    }
    if (pickerPointerAddHandledTimerRef.current !== null) {
      window.clearTimeout(pickerPointerAddHandledTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const handleFocusWidget = (event: Event) => {
      const widgetId = (event as CustomEvent).detail?.widgetId;
      if (widgetId) {
        setFocusedWidgetId(widgetId);
        setOpenWidgetMenuId(null);
      }
    };
    window.addEventListener('curio-focus-widget', handleFocusWidget);
    return () => window.removeEventListener('curio-focus-widget', handleFocusWidget);
  }, []);

  const openDashboardSearchResult = useCallback((widgetId: string) => {
    setFocusedWidgetId(null);
    setHighlightedWidgetId(widgetId);
    setShowDashboardSearch(false);
    setDashboardSearchQuery("");
    if (highlightedWidgetTimerRef.current) {
      window.clearTimeout(highlightedWidgetTimerRef.current);
    }
    highlightedWidgetTimerRef.current = window.setTimeout(() => {
      setHighlightedWidgetId((current) => (current === widgetId ? null : current));
      highlightedWidgetTimerRef.current = null;
    }, 2600);
    window.requestAnimationFrame(() => {
      const node = document.querySelector<HTMLElement>(`[data-dashboard-widget-id="${widgetId}"]`);
      const boardContainer = boardContainerRef.current;
      const behavior = preferences.reduceMotion ? "auto" : "smooth";

      if (node && boardContainer) {
        const targetTop = Math.max(
          0,
          node.offsetTop - Math.max(96, boardContainer.clientHeight * 0.28),
        );
        boardContainer.scrollTo({
          top: targetTop,
          left: 0,
          behavior,
        });
        return;
      }

      node?.scrollIntoView({
        behavior,
        block: "center",
        inline: "nearest",
      });
    });
  }, [preferences.reduceMotion]);

  const handleAvatarFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    try {
      const nextAvatar = await avatarFileToDataUrl(file);
      setUserAvatarDataUrl(nextAvatar);
      setShowAvatarPanel(false);
    } catch (error) {
      console.warn("[Dashboard] Failed to update avatar:", error);
    } finally {
      setAvatarBusy(false);
    }
  };

  const boardHorizontalPadding = boardWidth < 640 ? 24 : 48;
  const rawBoardCanvasWidth = Math.max(0, boardWidth - boardHorizontalPadding - 2);
  const columns = resolveColumns(rawBoardCanvasWidth);
  const mobileStack = columns === 1;
  const gap = mobileStack ? 12 : 18;
  const effectiveMode: DashboardLayoutMode = mobileStack
    ? "grid"
    : preferences.mode;
  const boardCanvasWidth = resolveGridCanvasWidth(
    rawBoardCanvasWidth,
    columns,
    gap,
  );
  const rowHeight = mobileStack
    ? clamp(Math.round(boardWidth * 0.23), 88, 106)
    : 92;
  const metrics = useMemo<DashboardGridMetrics>(() => {
    const width = boardCanvasWidth;
    const columnWidth =
      columns > 0 ? (width - Math.max(0, columns - 1) * gap) / columns : 0;
    return {
      columns,
      columnWidth,
      rowHeight,
      gap,
    };
  }, [boardCanvasWidth, columns, gap, rowHeight]);

  const visibleWidgets = useMemo(
    () => getVisibleWidgets(widgets).filter((widget) => !isFloatingRobotWidget(widget)),
    [widgets],
  );
  const robotBubbleSourceWidget =
    floatingRobotSource?.widget ||
    widgets.find((widget) => widget.enabled && widget.type === "robot_face") ||
    null;
  const robotBubbleUserTyping =
    dashboardUserTyping ||
    Boolean(deferredPickerQuery.trim()) ||
    Boolean(deferredDashboardSearchQuery.trim()) ||
    textInputVisible;
  const robotBubble = useMemo(
    () =>
      robotBubbleSourceWidget
        ? getDashboardRobotBubble({
            widget: robotBubbleSourceWidget,
            notificationEntries: effectiveNotificationEntries,
            widgets,
            editMode,
            userTyping: robotBubbleUserTyping,
            weather,
            aqi,
            enabledRoutineCount,
          })
        : null,
    [
      aqi,
      dashboardUserTyping,
      deferredDashboardSearchQuery,
      deferredPickerQuery,
      editMode,
      effectiveNotificationEntries,
      enabledRoutineCount,
      robotBubbleSourceWidget,
      robotBubbleUserTyping,
      textInputVisible,
      weather,
      widgets,
    ],
  );
  useEffect(() => {
    const visibleWidgetIds = new Set(visibleWidgets.map((widget) => widget.id));
    Object.keys(widgetMenuButtonRefs.current).forEach((widgetId) => {
      if (!visibleWidgetIds.has(widgetId)) {
        delete widgetMenuButtonRefs.current[widgetId];
      }
    });
  }, [visibleWidgets]);
  const visibleWidgetTypesKey = useMemo(
    () =>
      Array.from(new Set(visibleWidgets.map((widget) => widget.type)))
        .sort()
        .join("|"),
    [visibleWidgets],
  );

  useEffect(() => {
    const widgetTypes = visibleWidgetTypesKey
      .split("|")
      .filter(Boolean) as DashboardWidgetType[];
    if (widgetTypes.length === 0 || typeof window === "undefined") return;

    const preload = () => preloadDashboardWidgetComponents(widgetTypes);
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof idleWindow.requestIdleCallback === "function") {
      const idleId = idleWindow.requestIdleCallback(preload, { timeout: 1200 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = globalThis.setTimeout(preload, 250);
    return () => globalThis.clearTimeout(timeoutId);
  }, [visibleWidgetTypesKey]);

  const previewVisibleWidgets = useMemo(() => {
    if (activeGesture?.kind !== "drag-grid") {
      return visibleWidgets;
    }
    return insertVisibleWidget(
      widgets,
      activeGesture.widgetId,
      activeGesture.targetIndex,
    );
  }, [activeGesture, visibleWidgets, widgets]);

  const gridPreviewWidgets = useMemo(
    () =>
      effectiveMode === "grid"
        ? previewVisibleWidgets.filter((widget) => !shouldFloatWidgetInGrid(widget))
        : previewVisibleWidgets,
    [effectiveMode, previewVisibleWidgets],
  );
  const floatingGridWidgets = useMemo(
    () =>
      effectiveMode === "grid"
        ? visibleWidgets.filter((widget) => shouldFloatWidgetInGrid(widget))
        : [],
    [effectiveMode, visibleWidgets],
  );
  const gridRenderWidgets = useMemo(() => {
    if (effectiveMode !== "grid") return [];
    const gridIds = new Set(gridPreviewWidgets.map((widget) => widget.id));
    return [
      ...gridPreviewWidgets,
      ...floatingGridWidgets.filter((widget) => !gridIds.has(widget.id)),
    ];
  }, [effectiveMode, floatingGridWidgets, gridPreviewWidgets]);
  const packedItems = useMemo(
    () => packDashboardGrid(gridPreviewWidgets, metrics),
    [gridPreviewWidgets, metrics],
  );
  const packedById = useMemo(
    () => new Map(packedItems.map((item) => [item.widget.id, item])),
    [packedItems],
  );

  // Stable reference layout excluding the dragged widget -- used for
  // targetIndex calculation so other widgets don't jump around.
  const dragRefLayout = useMemo(() => {
    if (activeGesture?.kind !== "drag-grid") return null;
    const others = visibleWidgets.filter(
      (w) => w.id !== activeGesture.widgetId && !shouldFloatWidgetInGrid(w),
    );
    return packDashboardGrid(others, metrics);
  }, [
    activeGesture?.kind === "drag-grid" ? activeGesture.widgetId : null,
    visibleWidgets,
    metrics,
  ]);
  const dragRefLayoutRef = useRef(dragRefLayout);
  useEffect(() => {
    dragRefLayoutRef.current = dragRefLayout;
  }, [dragRefLayout]);

  const freeformRects = useMemo(() => {
    const rects = new Map<
      string,
      { x: number; y: number; w: number; h: number; z?: number }
    >();
    visibleWidgets.forEach((widget, index) => {
      const packed = packedById.get(widget.id);
      rects.set(
        widget.id,
        widget.layout?.freeform ||
          (packed
            ? buildFreeformRectFromPackedItem(packed)
            : buildDefaultFreeformRect(widget, index, metrics)),
      );
    });
    return rects;
  }, [metrics, packedById, visibleWidgets]);

  const gridBoardHeight = useMemo(
    () => getPackedBoardHeight(packedItems, metrics),
    [metrics, packedItems],
  );
  const freeformBoardHeight = useMemo(() => {
    const maxBottom = Array.from(freeformRects.values()).reduce(
      (highest, rect) => Math.max(highest, rect.y + rect.h),
      0,
    );
    return Math.max(gridBoardHeight, maxBottom + 80);
  }, [freeformRects, gridBoardHeight]);
  const freeformBoardWidth = useMemo(() => {
    const maxRight = Array.from(freeformRects.values()).reduce(
      (widest, rect) => Math.max(widest, rect.x + rect.w),
      0,
    );
    return Math.max(boardCanvasWidth, maxRight + (maxRight > 0 ? 80 : 0));
  }, [boardCanvasWidth, freeformRects]);
  const gridBoardHeightWithFloating = useMemo(() => {
    const maxFloatingBottom = floatingGridWidgets.reduce((highest, widget) => {
      const rect = freeformRects.get(widget.id);
      return rect ? Math.max(highest, rect.y + rect.h) : highest;
    }, gridBoardHeight);
    return Math.max(gridBoardHeight, maxFloatingBottom + 80);
  }, [floatingGridWidgets, freeformRects, gridBoardHeight]);
  const boardHeight =
    effectiveMode === "grid" ? gridBoardHeightWithFloating : freeformBoardHeight;
  const renderBoardCanvasWidth =
    effectiveMode === "freeform" ? freeformBoardWidth : boardCanvasWidth;

  useEffect(() => {
    if (effectiveMode !== "grid") return;
    const container = boardContainerRef.current;
    if (!container) return;

    const frame = window.requestAnimationFrame(() => {
      container.scrollLeft = 0;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [boardWidth, effectiveMode]);

  const glassEffectEnabled = activeGlassEffectEnabled !== false;
  const animatedBackgroundActive =
    activePageAppearance.backgroundStyle === "animated" &&
    !preferences.reduceMotion;
  const dashboardGlassVariables = animatedBackgroundActive
    ? getDashboardAnimatedGlassVariables(themeMode, glassEffectEnabled, glassEffectIntensity)
    : getDashboardGlassVariables(themeMode, glassEffectEnabled, glassEffectIntensity);
  const backgroundStyle = {
    ...getDashboardAccentVariables(activeAccentPreset),
    ...getDashboardCustomAccentVariables(activeAccentColor),
    ...dashboardGlassVariables,
    "--dashboard-surface": "var(--ether-glass-bg)",
    "--dashboard-surface-strong": "var(--ether-surface-container-high)",
    "--dashboard-border": "var(--ether-glass-border)",
    "--dashboard-text": "var(--ether-on-surface)",
    "--dashboard-muted": "var(--ether-on-surface-variant)",
    "--dashboard-shadow": "var(--ether-glass-shadow)",
    color: "var(--ether-on-surface)",
  } as React.CSSProperties;
  const appBackgroundCss = buildAppBackgroundCss(
    appBackgroundStyle,
    appBackgroundColor,
    themeMode,
  ) as React.CSSProperties | undefined;
  const isDefaultDarkWallpaper = isDark && appBackgroundStyle === "default";

  const availableCatalog = useMemo(
    () =>
      WIDGET_CATALOG.filter((item) =>
        matchesWidgetSearch(item.type, deferredPickerQuery),
      ),
    [deferredPickerQuery],
  );
  const dashboardSearchResults = useMemo(
    () =>
      buildDashboardSearchResults(visibleWidgets, deferredDashboardSearchQuery, {
        weather,
        aqi,
        tempUnit,
      }),
    [aqi, deferredDashboardSearchQuery, tempUnit, visibleWidgets, weather],
  );
  const dashboardSearchHasQuery = dashboardSearchQuery.trim().length > 0;

  const focusedWidget =
    visibleWidgets.find((widget) => widget.id === focusedWidgetId) || null;
  const configuringWidget =
    widgets.find((widget) => widget.id === configuringWidgetId) ||
    dashboardPages
      .flatMap((page) => page.widgets)
      .find((widget) => widget.id === configuringWidgetId) ||
    null;

  useEffect(() => {
    if (!focusedWidget?.config.refreshOnFocus) return;
    if (!isLiveDashboardWidget(focusedWidget.type)) return;
    window.dispatchEvent(
      new Event(getDashboardRefreshEventName(focusedWidget.id)),
    );
  }, [focusedWidget?.config.refreshOnFocus, focusedWidget?.id, focusedWidget?.type]);

  const ensureFreeformLayouts = useCallback(() => {
    const nextWidgets = widgetsRef.current.map((widget, index) => {
      if (!widget.enabled) {
        return widget;
      }
      const packed = packedById.get(widget.id);
      const freeform =
        widget.layout?.freeform ||
        (packed
          ? buildFreeformRectFromPackedItem(packed)
          : buildDefaultFreeformRect(widget, index, metrics));
      return {
        ...widget,
        layout: { ...widget.layout, freeform },
      };
    });
    persistWidgets(nextWidgets);
  }, [metrics, packedById, persistWidgets]);

  useEffect(() => {
    if (effectiveMode !== "freeform") return;
    if (!visibleWidgets.some((widget) => !widget.layout?.freeform)) return;
    ensureFreeformLayouts();
  }, [effectiveMode, ensureFreeformLayouts, visibleWidgets]);

  const updateWidgetConfig = useCallback(
    (widgetId: string, patch: Partial<DashboardWidgetConfig>) => {
      persistWidgets(
        widgetsRef.current.map((widget) =>
          widget.id === widgetId
            ? { ...widget, config: { ...widget.config, ...patch } }
            : widget,
        ),
      );
    },
    [persistWidgets],
  );

  const updateWidgetConfigAcrossPages = useCallback(
    (widgetId: string, patch: Partial<DashboardWidgetConfig>) => {
      if (widgetsRef.current.some((widget) => widget.id === widgetId)) {
        updateWidgetConfig(widgetId, patch);
        return;
      }

      let changed = false;
      const nextPages = dashboardPagesRef.current.map((page) => {
        let pageChanged = false;
        const nextWidgets = page.widgets.map((widget) => {
          if (widget.id !== widgetId) return widget;
          pageChanged = true;
          changed = true;
          return {
            ...widget,
            config: {
              ...widget.config,
              ...patch,
            },
          };
        });
        return pageChanged ? { ...page, widgets: nextWidgets } : page;
      });

      if (changed) {
        persistDashboardPages(nextPages);
      }
    },
    [dashboardPagesRef, persistDashboardPages, updateWidgetConfig, widgetsRef],
  );

  const handleFloatingRobotPositionChange = useCallback(
    (widgetId: string, position: FloatingWidgetPosition, size: number) => {
      updateWidgetConfigAcrossPages(widgetId, {
        robotFloatingX: Math.round(position.x),
        robotFloatingY: Math.round(position.y),
        robotFloatingSize: Math.round(size),
      });
    },
    [updateWidgetConfigAcrossPages],
  );

  const handleRemoveWidget = useCallback(
    (widgetId: string) => {
      persistWidgets(
        widgetsRef.current.filter((widget) => widget.id !== widgetId),
      );
      // Sweep any `useWidgetPersistentState` entries belonging to the
      // deleted widget so orphaned keys do not accumulate in
      // localStorage (Requirement 14.4).
      clearWidgetPersistentState(widgetId);
    },
    [persistWidgets],
  );

  const handleWidgetMenuToggle = useCallback((widgetId: string) => {
    setShowBoardPanel(false);
    setShowAvatarPanel(false);
    setShowNotificationsPanel(false);
    setWidgetMenuPosition(null);
    setOpenWidgetMenuId((current) => (current === widgetId ? null : widgetId));
  }, []);

  const renderWidgetActionMenu = (widget: DashboardWidget) => {
    if (openWidgetMenuId !== widget.id) return null;

    return (
      <DashboardWidgetActionMenu
        widget={widget}
        menuRef={widgetMenuRef}
        position={widgetMenuPosition}
        tempUnit={tempUnit}
        editMode={editMode}
        widgetGlowEnabled={widgetGlowEnabled}
        glassEffectEnabled={glassEffectEnabled}
        themeMode={themeMode}
        appearanceStyle={backgroundStyle}
        onFocusWidget={(widgetId) => {
          setFocusedWidgetId(widgetId);
          setOpenWidgetMenuId(null);
        }}
        onOpenWidgetSettings={(widgetId) => {
          setConfiguringWidgetId(widgetId);
          setOpenWidgetMenuId(null);
        }}
        onEnableEditMode={() => {
          setEditMode(true);
          setOpenWidgetMenuId(null);
        }}
        onUpdateWidgetConfig={(widgetId, patch) => {
          updateWidgetConfigAcrossPages(widgetId, patch);
          setOpenWidgetMenuId(null);
        }}
        onSetTempUnit={(unit) => setTempUnit(unit)}
        onRequestDelete={(widgetId) => {
          setWidgetToDeleteId(widgetId);
          setOpenWidgetMenuId(null);
        }}
      />
    );
  };
  const handleCreateWidgetFromWidget = useCallback(
    (
      type: DashboardWidgetType,
      configPatch: Partial<DashboardWidgetConfig> = {},
      options: DashboardCreateWidgetOptions = {},
    ) => {
      const currentWidgets = normalizeWidgets(widgetsRef.current);
      const lastPosition = currentWidgets.reduce(
        (highest, widget) => Math.max(highest, widget.position),
        -1,
      );
      const createdWidget = createDashboardWidget(type, lastPosition + 1, {
        config: configPatch,
      });
      const shouldUseFreeform =
        effectiveMode === "freeform" || shouldFloatWidgetInGrid(createdWidget);
      const sourceWidget = options.afterWidgetId
        ? currentWidgets.find((widget) => widget.id === options.afterWidgetId)
        : undefined;
      const sourceRect = sourceWidget
        ? sourceWidget.layout?.freeform || freeformRects.get(sourceWidget.id)
        : undefined;
      const siblingCount = currentWidgets.filter((widget) => widget.type === type).length;
      const offset = 34 + (siblingCount % 4) * 18;
      const defaultRect = buildDefaultFreeformRect(
        createdWidget,
        currentWidgets.length,
        metrics,
      );
      const freeformRect = sourceRect
        ? {
            x: clamp(
              sourceRect.x + offset,
              0,
              Math.max(0, boardCanvasWidth - sourceRect.w),
            ),
            y: Math.max(0, sourceRect.y + offset),
            w: sourceRect.w,
            h: sourceRect.h,
            z: (sourceRect.z || 1) + 1,
          }
        : defaultRect;
      const nextCreatedWidget = shouldUseFreeform
        ? {
            ...createdWidget,
            layout: {
              ...createdWidget.layout,
              freeform: freeformRect,
            },
          }
        : createdWidget;

      persistWidgets([...currentWidgets, nextCreatedWidget]);
    },
    [boardCanvasWidth, effectiveMode, freeformRects, metrics, persistWidgets],
  );

  const addWidgetToBoard = useCallback((type: DashboardWidgetType) => {
    const currentWidgets = normalizeWidgets(widgetsRef.current);
    const lastPosition = currentWidgets.reduce(
      (highest, widget) => Math.max(highest, widget.position),
      -1,
    );
    const createdWidget = createDashboardWidget(type, lastPosition + 1);

    const nextCreatedWidget =
      effectiveMode === "freeform"
        ? {
            ...createdWidget,
            layout: {
              ...createdWidget.layout,
              freeform: buildDefaultFreeformRect(
                createdWidget,
                currentWidgets.length,
                metrics,
              ),
            },
          }
        : createdWidget;

    const nextWidgets = [...currentWidgets, nextCreatedWidget];

    persistWidgets(nextWidgets);
  }, [effectiveMode, metrics, persistWidgets]);

  const cancelPendingAddWidget = useCallback(() => {
    if (pendingTouchKeyboardDismissTimerRef.current !== null) {
      window.clearTimeout(pendingTouchKeyboardDismissTimerRef.current);
      pendingTouchKeyboardDismissTimerRef.current = null;
    }
    if (pendingAddWidgetTimerRef.current !== null) {
      window.clearTimeout(pendingAddWidgetTimerRef.current);
      pendingAddWidgetTimerRef.current = null;
    }
    if (pendingAddWidgetFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingAddWidgetFrameRef.current);
      pendingAddWidgetFrameRef.current = null;
    }
  }, []);

  const scheduleAddWidget = useCallback(
    (type: DashboardWidgetType) => {
      cancelPendingAddWidget();
      pendingAddWidgetTimerRef.current = window.setTimeout(() => {
        pendingAddWidgetTimerRef.current = null;
        pendingAddWidgetFrameRef.current = window.requestAnimationFrame(() => {
          pendingAddWidgetFrameRef.current = null;
          startTransition(() => addWidgetToBoard(type));
        });
      }, 0);
    },
    [addWidgetToBoard, cancelPendingAddWidget],
  );

  const closePickerAndScheduleAddWidget = useCallback((type: DashboardWidgetType) => {
    flushSync(() => {
      setShowPicker(false);
      setShowDashboardSearch(false);
      setPickerQuery("");
      setOpenWidgetMenuId(null);
      setWidgetMenuPosition(null);
      clearPendingResizeHold();
      activeGestureRef.current = null;
      setActiveGesture(null);
    });
    dragElementRef.current = null;
    scheduleAddWidget(type);
  }, [clearPendingResizeHold, scheduleAddWidget]);

  const handleAddWidget = useCallback((type: DashboardWidgetType) => {
    const activeElement =
      typeof document === "undefined" ? null : document.activeElement;
    const shouldWaitForTouchKeyboard =
      usesCoarsePointerInput() && isDashboardEditableElement(activeElement);

    blurActiveDashboardInput();

    if (shouldWaitForTouchKeyboard) {
      cancelPendingAddWidget();
      pendingTouchKeyboardDismissTimerRef.current = window.setTimeout(() => {
        pendingTouchKeyboardDismissTimerRef.current = null;
        closePickerAndScheduleAddWidget(type);
      }, DASHBOARD_TOUCH_KEYBOARD_DISMISS_DELAY_MS);
      return;
    }

    closePickerAndScheduleAddWidget(type);
  }, [cancelPendingAddWidget, closePickerAndScheduleAddWidget]);

  const handlePickerCatalogPointerDown = useCallback(
    (
      event: React.PointerEvent<HTMLButtonElement>,
      type: DashboardWidgetType,
    ) => {
      const activeElement =
        typeof document === "undefined" ? null : document.activeElement;
      if (
        !usesCoarsePointerInput() ||
        !isDashboardEditableElement(activeElement)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      pickerPointerAddHandledRef.current = true;
      if (pickerPointerAddHandledTimerRef.current !== null) {
        window.clearTimeout(pickerPointerAddHandledTimerRef.current);
      }
      pickerPointerAddHandledTimerRef.current = window.setTimeout(() => {
        pickerPointerAddHandledRef.current = false;
        pickerPointerAddHandledTimerRef.current = null;
      }, 0);
      handleAddWidget(type);
    },
    [handleAddWidget],
  );

  const handlePickerCatalogClick = useCallback(
    (type: DashboardWidgetType) => {
      if (pickerPointerAddHandledRef.current) {
        pickerPointerAddHandledRef.current = false;
        if (pickerPointerAddHandledTimerRef.current !== null) {
          window.clearTimeout(pickerPointerAddHandledTimerRef.current);
          pickerPointerAddHandledTimerRef.current = null;
        }
        return;
      }

      handleAddWidget(type);
    },
    [handleAddWidget],
  );

  const handleModeToggle = (mode: DashboardLayoutMode) => {
    if (mode === "freeform") {
      ensureFreeformLayouts();
    }
    persistPreferences({ ...preferences, mode });
  };

  const freeformRectsRef = useRef(freeformRects);
  freeformRectsRef.current = freeformRects;
  const visibleWidgetsRef = useRef(visibleWidgets);
  visibleWidgetsRef.current = visibleWidgets;

  const raiseFreeformWidget = useCallback(
    (widgetId: string) => {
      const currentWidgets = widgetsRef.current;
      const widget = currentWidgets.find((item) => item.id === widgetId);
      if (!widget) return;

      const currentRect =
        widget.layout?.freeform || freeformRectsRef.current.get(widgetId);
      if (!currentRect) return;

      const highestOtherZ = currentWidgets.reduce((highest, item) => {
        if (item.id === widgetId) return highest;
        const rect =
          item.layout?.freeform || freeformRectsRef.current.get(item.id);
        return Math.max(highest, Number(rect?.z ?? 1));
      }, 0);
      const currentZ = Number(currentRect.z ?? 1);
      if (currentZ > highestOtherZ) return;

      const nextZ = highestOtherZ + 1;
      persistWidgets(
        currentWidgets.map((item) =>
          item.id === widgetId
            ? {
                ...item,
                layout: {
                  ...item.layout,
                  freeform: {
                    ...currentRect,
                    z: nextZ,
                  },
                },
              }
            : item,
        ),
      );
    },
    [persistWidgets],
  );

  const beginGridDrag = useCallback((
    widgetId: string,
    event: React.PointerEvent<HTMLDivElement>,
    rect: PackedDashboardItem,
  ) => {
    event.preventDefault();
    captureDashboardPointer(event);
    const nextGesture: ActiveGesture = {
      kind: "drag-grid",
      widgetId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      originRect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      targetIndex: visibleWidgetsRef.current.findIndex((widget) => widget.id === widgetId),
    };
    activeGestureRef.current = nextGesture;
    setActiveGesture(nextGesture);
  }, []);

  const beginGridResizeAt = useCallback((
    widgetId: string,
    axis: "x" | "y" | "both",
    clientX: number,
    clientY: number,
  ) => {
    const widget = widgetsRef.current.find((item) => item.id === widgetId);
    if (!widget) return;
    const nextGesture: ActiveGesture = {
      kind: "resize-grid",
      widgetId,
      axis,
      startClientX: clientX,
      startClientY: clientY,
      currentClientX: clientX,
      currentClientY: clientY,
      originSize: {
        w: Number(widget.config.w || 2),
        h: Number(widget.config.h || 2),
      },
      previewSize: {
        w: Number(widget.config.w || 2),
        h: Number(widget.config.h || 2),
      },
    };
    activeGestureRef.current = nextGesture;
    setActiveGesture(nextGesture);
  }, []);

  const beginGridResize = useCallback((
    widgetId: string,
    axis: "x" | "y" | "both",
    event: React.PointerEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    captureDashboardPointer(event);
    beginGridResizeAt(widgetId, axis, event.clientX, event.clientY);
  }, [beginGridResizeAt]);

  const beginFreeformDrag = useCallback((
    widgetId: string,
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    captureDashboardPointer(event);
    const widget = widgetsRef.current.find((item) => item.id === widgetId);
    const rect = widget?.layout?.freeform || freeformRectsRef.current.get(widgetId);
    if (!rect) return;
    const nextGesture: ActiveGesture = {
      kind: "drag-freeform",
      widgetId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      originRect: rect,
      previewRect: rect,
    };
    activeGestureRef.current = nextGesture;
    setActiveGesture(nextGesture);
  }, []);

  const beginFreeformResizeAt = useCallback((
    widgetId: string,
    axis: "x" | "y" | "both",
    clientX: number,
    clientY: number,
  ) => {
    const widget = widgetsRef.current.find((item) => item.id === widgetId);
    const rect = widget?.layout?.freeform || freeformRectsRef.current.get(widgetId);
    if (!rect) return;
    const nextGesture: ActiveGesture = {
      kind: "resize-freeform",
      widgetId,
      axis,
      startClientX: clientX,
      startClientY: clientY,
      currentClientX: clientX,
      currentClientY: clientY,
      originRect: rect,
      previewRect: rect,
    };
    activeGestureRef.current = nextGesture;
    setActiveGesture(nextGesture);
  }, []);

  const beginFreeformResize = useCallback((
    widgetId: string,
    axis: "x" | "y" | "both",
    event: React.PointerEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    captureDashboardPointer(event);
    beginFreeformResizeAt(widgetId, axis, event.clientX, event.clientY);
  }, [beginFreeformResizeAt]);

  useEffect(() => {
    if (!activeGesture) return;

    let frameId = 0;
    let nextPointer: { clientX: number; clientY: number } | null = null;

    const processPointerMove = (clientX: number, clientY: number) => {
      const gesture = activeGestureRef.current;
      if (!gesture) return;

      if (gesture.kind === "drag-grid") {
        const deltaX = clientX - gesture.startClientX;
        const deltaY = clientY - gesture.startClientY;

        // Update DOM transform directly -- no React re-render needed
        const el = dragElementRef.current;
        if (el) {
          el.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
          el.style.transitionDuration = "0ms";
        }

        // Calculate targetIndex against the stable reference layout (widgets
        // packed WITHOUT the dragged widget). This prevents the feedback loop
        // where changing targetIndex shifts other widgets, which changes the
        // nearest-center calculation, which changes targetIndex again.
        const refItems = dragRefLayoutRef.current;
        if (!refItems) return;

        const relativeX =
          gesture.originRect.left + gesture.originRect.width / 2 + deltaX;
        const relativeY =
          gesture.originRect.top + gesture.originRect.height / 2 + deltaY;

        let nextIndex = refItems.length;
        let smallestDistance = Number.POSITIVE_INFINITY;

        refItems.forEach((item, index) => {
          const centerX = item.left + item.width / 2;
          const centerY = item.top + item.height / 2;
          const distance =
            (centerX - relativeX) ** 2 + (centerY - relativeY) ** 2;
          if (distance < smallestDistance) {
            smallestDistance = distance;
            nextIndex =
              index +
              (relativeY > centerY ||
              (Math.abs(relativeY - centerY) < item.height / 3 &&
                relativeX > centerX)
                ? 1
                : 0);
          }
        });

        // Update ref for pointer up, but only trigger re-render when index changes
        gesture.currentClientX = clientX;
        gesture.currentClientY = clientY;
        if (gesture.targetIndex !== nextIndex) {
          gesture.targetIndex = nextIndex;
          startTransition(() => {
            setActiveGesture({ ...gesture });
          });
        }
        return;
      }

      if (gesture.kind === "resize-grid") {
        const deltaColumns = Math.round(
          (clientX - gesture.startClientX) /
            Math.max(1, metrics.columnWidth + metrics.gap),
        );
        const deltaRows = Math.round(
          (clientY - gesture.startClientY) /
            Math.max(1, metrics.rowHeight + metrics.gap),
        );
        const widget = widgetsRef.current.find(
          (item) => item.id === gesture.widgetId,
        );
        if (!widget) return;
        const nextWidth =
          gesture.axis === "x" || gesture.axis === "both"
            ? gesture.originSize.w + deltaColumns
            : gesture.originSize.w;
        const nextHeight =
          gesture.axis === "y" || gesture.axis === "both"
            ? gesture.originSize.h + deltaRows
            : gesture.originSize.h;
        const nextSize = clampWidgetDimensions(
          widget.type,
          nextWidth,
          nextHeight,
          metrics.columns,
        );
        if (
          gesture.previewSize.w === nextSize.w &&
          gesture.previewSize.h === nextSize.h
        ) {
          return;
        }
        gesture.currentClientX = clientX;
        gesture.currentClientY = clientY;
        gesture.previewSize = nextSize;
        startTransition(() => {
          setActiveGesture({ ...gesture });
        });
        return;
      }

      if (
        gesture.kind === "drag-freeform" ||
        gesture.kind === "resize-freeform"
      ) {
        const deltaX = clientX - gesture.startClientX;
        const deltaY = clientY - gesture.startClientY;

        // For freeform drag, update DOM directly
        if (gesture.kind === "drag-freeform") {
          const el = dragElementRef.current;
          if (el) {
            el.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
            el.style.transitionDuration = "0ms";
          }
          gesture.currentClientX = clientX;
          gesture.currentClientY = clientY;

          const snapX = preferences.snapToGrid
            ? Math.max(1, Math.round(metrics.columnWidth + metrics.gap))
            : 1;
          const snapY = preferences.snapToGrid
            ? Math.max(1, Math.round(metrics.rowHeight + metrics.gap))
            : 1;
          const origin = gesture.originRect;
          let nextX = origin.x + deltaX;
          let nextY = origin.y + deltaY;
          if (preferences.snapToGrid) {
            nextX = snapValue(nextX, snapX);
            nextY = snapValue(nextY, snapY);
          }
          gesture.previewRect = {
            x: Math.max(0, nextX),
            y: Math.max(0, nextY),
            w: origin.w,
            h: origin.h,
            z: origin.z ?? 1,
          };
          return;
        }

        // resize-freeform needs React state for visual size changes
        const snapX = preferences.snapToGrid
          ? Math.max(1, Math.round(metrics.columnWidth + metrics.gap))
          : 1;
        const snapY = preferences.snapToGrid
          ? Math.max(1, Math.round(metrics.rowHeight + metrics.gap))
          : 1;

        const origin = gesture.originRect;
        let nextW = origin.w;
        let nextH = origin.h;

        if (gesture.axis === "x" || gesture.axis === "both") {
          nextW = origin.w + deltaX;
        }
        if (gesture.axis === "y" || gesture.axis === "both") {
          nextH = origin.h + deltaY;
        }

        if (preferences.snapToGrid) {
          nextW = snapValue(nextW, snapX);
          nextH = snapValue(nextH, snapY);
        }

        const previewRect = {
          x: origin.x,
          y: origin.y,
          w: Math.max(180, nextW),
          h: Math.max(140, nextH),
          z: origin.z ?? 1,
        };

        if (
          gesture.previewRect.w === previewRect.w &&
          gesture.previewRect.h === previewRect.h
        ) {
          return;
        }

        gesture.currentClientX = clientX;
        gesture.currentClientY = clientY;
        gesture.previewRect = previewRect;
        startTransition(() => {
          setActiveGesture({ ...gesture });
        });
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      // Update DOM transform synchronously for smooth visual tracking
      const gesture = activeGestureRef.current;
      if (gesture) {
        preventDashboardPointerDefault(event);
      }
      if (gesture && (gesture.kind === "drag-grid" || gesture.kind === "drag-freeform")) {
        const el = dragElementRef.current;
        if (el) {
          const dx = event.clientX - gesture.startClientX;
          const dy = event.clientY - gesture.startClientY;
          el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        }
      }

      // Defer heavier work (index calculation, state updates) to RAF
      nextPointer = { clientX: event.clientX, clientY: event.clientY };
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        const pending = nextPointer;
        nextPointer = null;
        if (!pending) return;
        processPointerMove(pending.clientX, pending.clientY);
      });
    };

    const handlePointerUp = () => {
      const gesture = activeGestureRef.current;
      if (!gesture) return;

      // Clean up direct DOM manipulation
      const el = dragElementRef.current;
      if (el) {
        el.style.transform = "";
        el.style.transitionDuration = "";
      }
      dragElementRef.current = null;

      if (gesture.kind === "drag-grid") {
        const orderedVisible = insertVisibleWidget(
          widgetsRef.current,
          gesture.widgetId,
          gesture.targetIndex,
        );
        persistWidgets(mergeVisibleOrder(widgetsRef.current, orderedVisible));
      } else if (gesture.kind === "resize-grid") {
        persistWidgets(
          widgetsRef.current.map((widget) =>
            widget.id === gesture.widgetId
              ? {
                  ...widget,
                  config: {
                    ...widget.config,
                    w: gesture.previewSize.w,
                    h: gesture.previewSize.h,
                  },
                }
              : widget,
          ),
        );
      } else if (
        gesture.kind === "drag-freeform" ||
        gesture.kind === "resize-freeform"
      ) {
        persistWidgets(
          widgetsRef.current.map((widget) => {
            if (widget.id !== gesture.widgetId) return widget;

            const widthCells = Math.max(
              1,
              Math.round(
                (gesture.previewRect.w + metrics.gap) /
                  Math.max(1, metrics.columnWidth + metrics.gap),
              ),
            );
            const heightCells = Math.max(
              1,
              Math.round(
                (gesture.previewRect.h + metrics.gap) /
                  Math.max(1, metrics.rowHeight + metrics.gap),
              ),
            );
            const nextSize = clampWidgetDimensions(
              widget.type,
              widthCells,
              heightCells,
              metrics.columns,
            );

            return {
              ...widget,
              config: {
                ...widget.config,
                w: nextSize.w,
                h: nextSize.h,
              },
              layout: {
                ...widget.layout,
                freeform: gesture.previewRect,
              },
            };
          }),
        );
      } else {
        persistWidgets(widgetsRef.current);
      }

      activeGestureRef.current = null;
      setActiveGesture(null);
      setResizeIntentWidgetId((current) =>
        current === gesture.widgetId ? null : current,
      );
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [
    Boolean(activeGesture),
    metrics,
    preferences.snapToGrid,
    persistWidgets,
  ]);


  // renderWidget has been replaced by the memoized <DashboardWidgetFrame> component.


  const motionProfile = useMotionProfile();
  const motionConfigProps = useMemo(
    () => ({
      reducedMotion: (motionProfile.mode === 'off'
        ? 'always'
        : motionProfile.mode === 'subtle'
        ? 'user'
        : 'never') as 'always' | 'user' | 'never',
      transition: { duration: motionProfile.durationMs(350) / 1000 },
    }),
    [motionProfile],
  );

  return (
    <MotionConfig {...motionConfigProps}>
    <div
      data-testid="dashboard-root"
      data-dashboard-glass={glassEffectEnabled ? "on" : "off"}
      data-dashboard-animated-background={animatedBackgroundActive ? "true" : undefined}
      data-theme={themeMode}
      onClickCapture={handleDashboardActivityClick}
      className={`dashboard-pwa-root relative h-full w-full overflow-hidden ${isDark ? "" : "light-mode"}`}
      style={{
        ...backgroundStyle,
        ...(appBackgroundCss ?? {
          background: isDark ? "var(--ether-surface)" : "var(--ether-surface)",
        }),
      }}
    >
      {/* Background atmospheric glow */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-[-16%]"
          style={{
            opacity: isDark ? 0.58 : 0.28,
            background: `radial-gradient(circle at 10% 10%, var(--dashboard-glow-a), transparent 34%), radial-gradient(circle at 82% 12%, var(--dashboard-glow-b), transparent 28%), radial-gradient(circle at 48% 110%, var(--dashboard-accent-soft), transparent 34%)`,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            opacity: isDark ? 0.16 : 0.08,
            backgroundImage: isDark
              ? "linear-gradient(rgba(255,244,225,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(255,244,225,0.10) 1px, transparent 1px)"
              : "linear-gradient(rgba(54,49,42,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(54,49,42,0.08) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>
      <React.Suspense fallback={null}>
        <AnimatedBackgroundRenderer
          appearance={activePageAppearance}
          reduceMotion={preferences.reduceMotion}
        />
      </React.Suspense>

      <div className="dashboard-pwa-content relative z-10 flex h-full w-full flex-col overflow-hidden">
        <DashboardToolbar
          isDark={isDark}
          avatarDataUrl={avatarDataUrl}
          dashboardOwnerName={dashboardOwnerName}
          toolbarGreeting={toolbarGreeting}
          dashboardLabel={dashboardLabel}
          avatarInputRef={avatarInputRef}
          onAvatarFileChange={(event) => {
            void handleAvatarFileChange(event);
          }}
          onToggleAvatarPanel={() => {
            setShowAvatarPanel((current) => !current);
            setShowBoardPanel(false);
            setShowNotificationsPanel(false);
            setShowActionsPanel(false);
          }}
          connectionLabel={connectionLabel}
          connectionActive={connectionActive}
          connectionBusy={connectionBusy}
          onToggleConnection={onToggleConnection}
          textInputVisible={textInputVisible}
          onToggleTextInput={onToggleTextInput}
          editMode={editMode}
          showDashboardSearch={showDashboardSearch}
          showPicker={showPicker}
          showActionsPanel={showActionsPanel}
          onToggleEditMode={() => {
            const nextEditMode = !editMode;
            setEditMode(nextEditMode);
            if (!nextEditMode) {
              setShowPicker(false);
              setShowDashboardSearch(false);
              closeToolbarPanels();
            }
          }}
          onOpenDashboardSearch={openDashboardSearch}
          onToggleWidgetPicker={() => {
            if (showPicker) {
              setShowPicker(false);
            } else {
              openWidgetPicker();
            }
          }}
          onToggleActionsPanel={() => {
            setShowActionsPanel((current) => !current);
            setShowAvatarPanel(false);
            setShowBoardPanel(false);
            setShowNotificationsPanel(false);
          }}
          cameraEnabled={cameraEnabled}
          canFlipCamera={canFlipCamera}
          onToggleCamera={
            onToggleCamera
              ? () => {
                  onToggleCamera();
                  setShowActionsPanel(false);
                }
              : undefined
          }
          onFlipCamera={
            onFlipCamera
              ? () => {
                  setShowActionsPanel(false);
                  return onFlipCamera();
                }
              : undefined
          }
          connectionActiveForMute={connectionActive}
          isMuted={isMuted}
          onToggleMute={
            onToggleMute
              ? () => {
                  onToggleMute();
                  setShowActionsPanel(false);
                }
              : undefined
          }
          showNotificationsPanel={showNotificationsPanel}
          effectiveUnreadNotificationCount={effectiveUnreadNotificationCount}
          onToggleNotificationsPanel={() => {
            const nextOpen = !showNotificationsPanel;
            setShowNotificationsPanel(nextOpen);
            if (nextOpen) setNotificationPanelView("activity");
            setShowBoardPanel(false);
            setShowAvatarPanel(false);
            setShowActionsPanel(false);
          }}
          onOpenSettings={
            onOpenSettings
              ? () => {
                  onOpenSettings();
                  setShowActionsPanel(false);
                }
              : undefined
          }
          onToggleTheme={() => {
            persistActivePageAppearance({
              themeMode: isDark ? "light" : "dark",
            });
            setShowActionsPanel(false);
          }}
          showBoardPanel={showBoardPanel}
          onToggleBoardPanel={() => {
            setShowBoardPanel((current) => !current);
            setShowActionsPanel(false);
            setShowAvatarPanel(false);
            setShowNotificationsPanel(false);
          }}
          showPageSwitcher={showPageSwitcher}
          dashboardPages={dashboardPages}
          activeDashboardPageId={activeDashboardPageId}
          onSelectDashboardPage={selectDashboardPage}
          onHidePageSwitcher={() =>
            persistPreferences({
              ...preferences,
              showPageSwitcher: false,
            })
          }
          dashboardSearchInputRef={dashboardSearchInputRef}
          dashboardSearchQuery={dashboardSearchQuery}
          dashboardSearchHasQuery={dashboardSearchHasQuery}
          dashboardSearchResults={dashboardSearchResults}
          onDashboardSearchQueryChange={setDashboardSearchQuery}
          onOpenDashboardSearchResult={openDashboardSearchResult}
          onCloseDashboardSearch={() => setShowDashboardSearch(false)}
        />
        {hasOverlayPanel && !showNotificationsPanel && (
          <button
            onClick={closeToolbarPanels}
            className="absolute inset-0 z-[32] cursor-default"
            aria-label="Close dashboard panels"
          />
        )}

        {showAvatarPanel && (
          <React.Suspense fallback={null}>
            <DashboardAvatarPanel
              avatarDataUrl={avatarDataUrl}
              dashboardOwnerName={dashboardOwnerName}
              configuredUserName={configuredUserName || ""}
              customDashboardTitle={customDashboardTitle || ""}
              avatarBusy={avatarBusy}
              onUserNameChange={setUserName}
              onDashboardTitleChange={setDashboardTitle}
              onChoosePhoto={() => avatarInputRef.current?.click()}
              onRemovePhoto={() => {
                setUserAvatarDataUrl("");
                setShowAvatarPanel(false);
              }}
            />
          </React.Suspense>
        )}

        {showBoardPanel && (
          <React.Suspense fallback={null}>
            <BoardControlsPanel
              dashboardPages={dashboardPages}
              activeDashboardPageId={activeDashboardPageId}
              preferences={preferences}
              pageSwitcherPreferenceEnabled={pageSwitcherPreferenceEnabled}
              pageKeyboardShortcutsEnabled={pageKeyboardShortcutsEnabled}
              widgetGlowEnabled={widgetGlowEnabled}
              glassEffectIntensity={glassEffectIntensity}
              isDark={isDark}
              effectiveMode={effectiveMode}
              glassEffectEnabled={glassEffectEnabled}
              activeAccentPreset={activeAccentPreset}
              activeAccentColor={activeAccentColor}
              activeAnimationPreset={activePageAppearance.animationPreset}
              appBackgroundStyle={appBackgroundStyle}
              appBackgroundColor={appBackgroundColor}
              editMode={editMode}
              onAddDashboardPage={addDashboardPage}
              onSelectDashboardPage={selectDashboardPage}
              onRenameDashboardPage={renameDashboardPage}
              onMoveDashboardPage={moveDashboardPage}
              onDeleteDashboardPage={deleteDashboardPage}
              onPersistPreferences={persistPreferences}
              onPersistActivePageAppearance={persistActivePageAppearance}
              onResetActivePageAppearance={resetActivePageAppearance}
              onModeToggle={handleModeToggle}
              onToggleEditMode={toggleDashboardEditMode}
              onOpenDashboardSearch={openDashboardSearch}
              onResetDashboardBoard={resetDashboardBoard}
            />
          </React.Suspense>
        )}
        {showNotificationsPanel && (
          <React.Suspense fallback={null}>
            <NotificationSidePanel
              notificationPanelView={notificationPanelView}
              notificationFilter={notificationFilter}
              effectiveUnreadNotificationCount={effectiveUnreadNotificationCount}
              highPriorityNotificationCount={highPriorityNotificationCount}
              enabledRoutineCount={enabledRoutineCount}
              notificationSystemStatus={notificationSystemStatus}
              effectiveNotificationEntries={effectiveNotificationEntries}
              visibleNotificationEntries={visibleNotificationEntries}
              proactiveConfig={proactiveConfig}
              routines={routines}
              onClose={() => setShowNotificationsPanel(false)}
              onPanelViewChange={setNotificationPanelView}
              onNotificationFilterChange={setNotificationFilter}
            />
          </React.Suspense>
        )}
        <div
          ref={boardContainerRef}
          data-testid="dashboard-board-scroller"
          className="dashboard-pwa-scroll relative flex-1 overflow-auto px-3 pt-4 sm:px-6"
        >
          <div
            ref={boardCanvasRef}
            className="relative z-10 mx-auto"
            style={{
              width: renderBoardCanvasWidth > 0 ? renderBoardCanvasWidth : "100%",
              minHeight: boardHeight,
              height: boardHeight,
            }}
          >
            {effectiveMode === "grid"
              ? gridRenderWidgets.map((widget) => {
                  const packed = packedById.get(widget.id);
                  const isActiveWidget = activeGesture?.widgetId === widget.id;
                  const activeWidgetGesture = isActiveWidget ? activeGesture : null;
                  return (
                    <DashboardWidgetTile
                      key={widget.id}
                      actionMenu={renderWidgetActionMenu(widget)}
                      widget={widget}
                      packedItem={packed}
                      freeformRect={freeformRects.get(widget.id)}
                      editMode={editMode}
                      effectiveMode={effectiveMode}
                      isDefaultDarkWallpaper={isDefaultDarkWallpaper}
                      isDark={isDark}
                      reduceMotion={preferences.reduceMotion}
                      widgetGlowEnabled={widgetGlowEnabled}
                      glassEffectEnabled={glassEffectEnabled}
                      glassEffectIntensity={glassEffectIntensity}
                      isActiveDrag={isActiveWidget}
                      activeGestureKind={isActiveWidget ? activeGesture?.kind ?? null : null}
                      activeGestureOriginRect={getActiveGestureOriginRect(activeWidgetGesture)}
                      activeGesturePreviewSize={getActiveGesturePreviewSize(activeWidgetGesture)}
                      activeGesturePreviewRect={getActiveGesturePreviewRect(activeWidgetGesture)}
                      resizeIntentActive={resizeIntentWidgetId === widget.id}
                      isSearchHighlighted={highlightedWidgetId === widget.id}
                      isFocused={focusedWidgetId === widget.id}
                      isMenuOpen={openWidgetMenuId === widget.id}
                      metrics={metrics}
                      weather={weather}
                      aqi={aqi}
                      faceSlot={faceSlot}
                      activeProfileName={activeProfileName}
                      activeProfileId={activeProfileId}
                      recognizedBy={recognizedBy}
                      speakerUpdatedAt={speakerSession.updatedAt}
                      robotBubble={
                        widget.id === robotBubbleSourceWidget?.id ? robotBubble : null
                      }
                      onUpdateWidgetConfig={updateWidgetConfig}
                      onOpenWidgetSettings={openWidgetSettings}
                      onRegisterWidgetMenuButton={registerWidgetMenuButton}
                      onToggleWidgetMenu={handleWidgetMenuToggle}
                      onCreateWidget={handleCreateWidgetFromWidget}
                      onBeginGridDrag={beginGridDrag}
                      onBeginFreeformDrag={beginFreeformDrag}
                      onBeginGridResize={beginGridResize}
                      onBeginFreeformResize={beginFreeformResize}
                      onBeginGridResizeAt={beginGridResizeAt}
                      onBeginFreeformResizeAt={beginFreeformResizeAt}
                      onRaiseFreeformWidget={raiseFreeformWidget}
                      onSetResizeIntentWidgetId={setResizeIntentWidgetId}
                      onClearPendingResizeHold={clearPendingResizeHold}
                      pendingResizeHoldRef={pendingResizeHoldRef}
                      dragElementRef={dragElementRef}
                    />
                  );
                })
              : visibleWidgets.map((widget) => {
                  const isActiveWidget = activeGesture?.widgetId === widget.id;
                  const activeWidgetGesture = isActiveWidget ? activeGesture : null;
                  return (
                    <DashboardWidgetTile
                      key={widget.id}
                      actionMenu={renderWidgetActionMenu(widget)}
                      widget={widget}
                      freeformRect={freeformRects.get(widget.id)}
                      editMode={editMode}
                      effectiveMode={effectiveMode}
                      isDefaultDarkWallpaper={isDefaultDarkWallpaper}
                      isDark={isDark}
                      reduceMotion={preferences.reduceMotion}
                      widgetGlowEnabled={widgetGlowEnabled}
                      glassEffectEnabled={glassEffectEnabled}
                      glassEffectIntensity={glassEffectIntensity}
                      isActiveDrag={isActiveWidget}
                      activeGestureKind={isActiveWidget ? activeGesture?.kind ?? null : null}
                      activeGestureOriginRect={getActiveGestureOriginRect(activeWidgetGesture)}
                      activeGesturePreviewSize={getActiveGesturePreviewSize(activeWidgetGesture)}
                      activeGesturePreviewRect={getActiveGesturePreviewRect(activeWidgetGesture)}
                      resizeIntentActive={resizeIntentWidgetId === widget.id}
                      isSearchHighlighted={highlightedWidgetId === widget.id}
                      isFocused={focusedWidgetId === widget.id}
                      isMenuOpen={openWidgetMenuId === widget.id}
                      metrics={metrics}
                      weather={weather}
                      aqi={aqi}
                      faceSlot={faceSlot}
                      activeProfileName={activeProfileName}
                      activeProfileId={activeProfileId}
                      recognizedBy={recognizedBy}
                      speakerUpdatedAt={speakerSession.updatedAt}
                      robotBubble={
                        widget.id === robotBubbleSourceWidget?.id ? robotBubble : null
                      }
                      onUpdateWidgetConfig={updateWidgetConfig}
                      onOpenWidgetSettings={openWidgetSettings}
                      onRegisterWidgetMenuButton={registerWidgetMenuButton}
                      onToggleWidgetMenu={handleWidgetMenuToggle}
                      onCreateWidget={handleCreateWidgetFromWidget}
                      onBeginGridDrag={beginGridDrag}
                      onBeginFreeformDrag={beginFreeformDrag}
                      onBeginGridResize={beginGridResize}
                      onBeginFreeformResize={beginFreeformResize}
                      onBeginGridResizeAt={beginGridResizeAt}
                      onBeginFreeformResizeAt={beginFreeformResizeAt}
                      onRaiseFreeformWidget={raiseFreeformWidget}
                      onSetResizeIntentWidgetId={setResizeIntentWidgetId}
                      onClearPendingResizeHold={clearPendingResizeHold}
                      pendingResizeHoldRef={pendingResizeHoldRef}
                      dragElementRef={dragElementRef}
                    />
                  );
                })}
          </div>
        </div>
      </div>

      {floatingRobotSource && faceSlot && (
        <FloatingRobotOverlay
          widget={floatingRobotSource.widget}
          faceSlot={faceSlot}
          onToggleConnection={onToggleConnection}
          onRegisterWidgetMenuButton={registerWidgetMenuButton}
          onToggleWidgetMenu={handleWidgetMenuToggle}
          onPositionChange={handleFloatingRobotPositionChange}
          bubble={robotBubble}
          reduceMotion={preferences.reduceMotion}
        />
      )}
      {floatingRobotSource && renderWidgetActionMenu(floatingRobotSource.widget)}

      {editMode && showPicker && (
        <React.Suspense fallback={null}>
          <DashboardWidgetPickerPanel
            availableCatalog={availableCatalog}
            pickerQuery={pickerQuery}
            pickerSearchInputRef={pickerSearchInputRef}
            onPickerQueryChange={setPickerQuery}
            onClose={() => setShowPicker(false)}
            onCatalogPointerDown={handlePickerCatalogPointerDown}
            onCatalogClick={handlePickerCatalogClick}
          />
        </React.Suspense>
      )}

      {focusedWidget && (
        <React.Suspense fallback={null}>
          <DashboardFocusedWidgetOverlay
            focusedWidget={focusedWidget}
            boardWidth={boardWidth}
            weather={weather}
            aqi={aqi}
            faceSlot={faceSlot}
            activeProfileName={activeProfileName}
            activeProfileId={activeProfileId}
            recognizedBy={recognizedBy}
            speakerUpdatedAt={speakerSession.updatedAt}
            onClose={() => setFocusedWidgetId(null)}
            onUpdateWidgetConfig={updateWidgetConfig}
            onOpenWidgetSettings={openWidgetSettings}
          />
        </React.Suspense>
      )}

      {widgetToDeleteId && (
        <DashboardDeleteConfirmationModal
          onConfirm={() => {
            handleRemoveWidget(widgetToDeleteId);
            setWidgetToDeleteId(null);
          }}
          onCancel={() => setWidgetToDeleteId(null)}
        />
      )}

      {configuringWidget && (
        <React.Suspense fallback={null}>
          <WidgetSettingsModal
            widget={configuringWidget}
            onClose={() => setConfiguringWidgetId(null)}
            onSave={(configPatch) => {
              updateWidgetConfigAcrossPages(configuringWidget.id, configPatch);
              setConfiguringWidgetId(null);
            }}
            haEnabled={haEnabled}
            haUrl={haUrl}
            widgetGlowEnabled={widgetGlowEnabled}
            glassEffectEnabled={glassEffectEnabled}
          />
        </React.Suspense>
      )}

      <WidgetSummaryBubble />
      {commandPaletteOpen && (
        <React.Suspense fallback={null}>
          <DashboardCommandPalette onClose={() => setCommandPaletteOpen(false)} />
        </React.Suspense>
      )}
      <DashboardToastHost />
    </div>
    </MotionConfig>
  );
};

export default Dashboard;
