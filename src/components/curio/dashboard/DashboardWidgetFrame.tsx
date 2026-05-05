import React, { useCallback, useRef } from "react";
import { LayoutGrid } from "lucide-react";
import type {
  DashboardWidget,
  DashboardWidgetConfig,
  DashboardWidgetType,
} from "../../../services/dashboardTypes";
import type { SpeakerIdentityModality } from "../../../services/speakerIdentity";
import type { DashboardGridMetrics, PackedDashboardItem } from "./dashboardLayout";
import { estimateGridSpan, shouldFloatWidgetInGrid } from "./dashboardLayout";
import {
  getDashboardGlassVariables,
  supportsDashboardWidgetGlassEffects,
} from "./dashboardBoardUtils";
import { getDashboardWidgetAccentVariables, getDashboardWidgetGlowLayerStyle } from "./dashboardWidgetAppearance";
import { getDashboardRuntimePropsForWidget } from "../../../services/dashboardRuntimeProps";
import type { DashboardWidgetFrameInfo } from "../../../hooks/useWidgetSize";
import type { WeatherData, AqiData } from "../../../services/weatherService";
import type { DashboardRobotFaceStyle } from "../../../services/dashboardTypes";
import type { DashboardWidgetComponentProps } from "./dashboardRegistry";
import { WIDGET_COMPONENTS } from "./dashboardRegistry";
import { DashboardWidgetBody } from "./DashboardWidgetBody";
import { DashboardWidgetGlowContext } from "./WidgetShell";
import type { DashboardRobotBubble } from "./dashboardRobotBubbles";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardCreateWidgetOptions {
  afterWidgetId?: string;
}

export interface DashboardWidgetFrameProps {
  widget: DashboardWidget;
  packedItem?: PackedDashboardItem;
  freeformRect?: { x: number; y: number; w: number; h: number; z?: number };

  // Board-level state (scalar / primitive, cheap to compare)
  editMode: boolean;
  effectiveMode: "grid" | "freeform";
  isDefaultDarkWallpaper: boolean;
  isDark: boolean;
  reduceMotion: boolean;
  widgetGlowEnabled: boolean;
  glassEffectEnabled: boolean;
  glassEffectIntensity: number;

  // Per-widget flags derived from board state
  isActiveDrag: boolean;
  activeGestureKind: string | null;
  activeGestureOriginRect?: { left: number; top: number; width: number; height: number } | { x: number; y: number; w: number; h: number; z?: number };
  activeGesturePreviewSize?: { w: number; h: number };
  activeGesturePreviewRect?: { x: number; y: number; w: number; h: number; z?: number };
  resizeIntentActive: boolean;
  isSearchHighlighted: boolean;
  isFocused: boolean;
  isMenuOpen: boolean;

  // Grid metrics (structural)
  metrics: DashboardGridMetrics;

  // Data for runtime widget props
  weather: WeatherData | null;
  aqi: AqiData | null;
  faceSlot?: React.ReactNode | ((faceStyle?: DashboardRobotFaceStyle) => React.ReactNode);
  activeProfileName: string | null;
  activeProfileId: string | null;
  recognizedBy: SpeakerIdentityModality | null;
  speakerUpdatedAt: number;
  robotBubble?: DashboardRobotBubble | null;

  // Stable callbacks (must be useCallback in parent)
  onUpdateWidgetConfig: (widgetId: string, patch: Partial<DashboardWidgetConfig>) => void;
  onOpenWidgetSettings: (widgetId: string) => void;
  onRegisterWidgetMenuButton: (widgetId: string, node: HTMLButtonElement | null) => void;
  onToggleWidgetMenu: (widgetId: string) => void;
  onCreateWidget?: (
    type: DashboardWidgetType,
    configPatch?: Partial<DashboardWidgetConfig>,
    options?: DashboardCreateWidgetOptions,
  ) => void;
  onBeginGridDrag: (widgetId: string, event: React.PointerEvent<HTMLDivElement>, rect: PackedDashboardItem) => void;
  onBeginFreeformDrag: (widgetId: string, event: React.PointerEvent<HTMLDivElement>) => void;
  onBeginGridResize: (widgetId: string, axis: "x" | "y" | "both", event: React.PointerEvent<HTMLElement>) => void;
  onBeginFreeformResize: (widgetId: string, axis: "x" | "y" | "both", event: React.PointerEvent<HTMLElement>) => void;
  onBeginGridResizeAt: (widgetId: string, axis: "x" | "y" | "both", clientX: number, clientY: number) => void;
  onBeginFreeformResizeAt: (widgetId: string, axis: "x" | "y" | "both", clientX: number, clientY: number) => void;
  onRaiseFreeformWidget: (widgetId: string) => void;
  onSetResizeIntentWidgetId: (widgetId: string | null) => void;
  onClearPendingResizeHold: () => void;
  pendingResizeHoldRef: React.MutableRefObject<PendingResizeHold | null>;
  dragElementRef: React.MutableRefObject<HTMLDivElement | null>;

  // The widget action menu render callback. NOTE: action menu is now rendered
  // in Dashboard.tsx alongside the frame rather than inside it.
  // renderWidgetActionMenu has been removed from this component's props.
}

export interface PendingResizeHold {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  timerId: number;
}

const TOUCH_RESIZE_HOLD_MS = 1000;

type DashboardCssVariables = React.CSSProperties & Record<`--${string}`, string>;

const MOVING_WIDGET_GLASS_PARENT_VARIABLES: DashboardCssVariables = {
  "--dashboard-active-drag-glass-bg":
    "color-mix(in srgb, var(--ether-glass-bg) 55%, var(--ether-surface) 45%)",
  "--dashboard-active-drag-overlay-panel":
    "color-mix(in srgb, var(--ether-overlay-panel) 70%, var(--ether-surface) 30%)",
};

const MOVING_WIDGET_GLASS_SURFACE_VARIABLES: DashboardCssVariables = {
  "--ether-glass-bg": "var(--dashboard-active-drag-glass-bg)",
  "--ether-overlay-panel": "var(--dashboard-active-drag-overlay-panel)",
};

const shouldDelayResizeForPointer = (
  event: React.PointerEvent<HTMLElement>,
) => event.pointerType === "touch" || (!event.pointerType && usesCoarsePointerInput());

const usesCoarsePointerInput = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return (
    window.matchMedia("(hover: none) and (pointer: coarse)").matches ||
    window.matchMedia("(pointer: coarse)").matches
  );
};

const captureDashboardPointer = (event: React.PointerEvent<HTMLElement>) => {
  if (typeof event.currentTarget.setPointerCapture !== "function") return;
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture can fail if the browser has already canceled the pointer.
  }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DashboardWidgetFrameImpl: React.FC<DashboardWidgetFrameProps> = (props) => {
  const {
    widget,
    packedItem,
    freeformRect,
    editMode,
    effectiveMode,
    isDefaultDarkWallpaper,
    isDark,
    reduceMotion,
    widgetGlowEnabled,
    glassEffectEnabled,
    glassEffectIntensity,
    isActiveDrag,
    activeGestureKind,
    activeGestureOriginRect,
    activeGesturePreviewSize,
    activeGesturePreviewRect,
    resizeIntentActive,
    isSearchHighlighted,
    isFocused,
    isMenuOpen,
    metrics,
    weather,
    aqi,
    faceSlot,
    activeProfileName,
    activeProfileId,
    recognizedBy,
    speakerUpdatedAt,
    robotBubble,
    onUpdateWidgetConfig,
    onOpenWidgetSettings,
    onRegisterWidgetMenuButton,
    onToggleWidgetMenu,
    onCreateWidget,
    onBeginGridDrag,
    onBeginFreeformDrag,
    onBeginGridResize,
    onBeginFreeformResize,
    onBeginGridResizeAt,
    onBeginFreeformResizeAt,
    onRaiseFreeformWidget,
    onSetResizeIntentWidgetId,
    onClearPendingResizeHold,
    pendingResizeHoldRef,
    dragElementRef,
  } = props;

  const Component = WIDGET_COMPONENTS[widget.type];

  if (!Component) {
    return null;
  }

  const packed = packedItem;
  const freeform = freeformRect;
  const floatsInGrid = effectiveMode === "grid" && shouldFloatWidgetInGrid(widget);

  const widgetFaceSlot =
    widget.type === "robot_face"
      ? typeof faceSlot === "function"
        ? faceSlot(widget.config.robotFaceStyle)
        : faceSlot
      : undefined;

  const widgetMotionClass = reduceMotion ? "" : "ether-widget-enter";

  const runtimeProps = getDashboardRuntimePropsForWidget(widget.type, {
    weather,
    aqi,
    activeProfileName,
    activeProfileId,
    recognizedBy,
    updatedAt: speakerUpdatedAt,
  });

  const baseProps: DashboardWidgetComponentProps = {
    widget,
    weather: runtimeProps.weather,
    aqi: runtimeProps.aqi,
    faceSlot: widgetFaceSlot,
    config: widget.config,
    activeProfileName: runtimeProps.activeProfileName,
    activeProfileId: runtimeProps.activeProfileId,
    recognizedBy: runtimeProps.recognizedBy,
    updatedAt: runtimeProps.updatedAt,
    focused: isFocused,
    robotBubble: widget.type === "robot_face" ? robotBubble : null,
    onUpdateWidgetConfig,
    onOpenWidgetSettings,
  };

  // -- Positioning styles ---------------------------------------------------

  let style: React.CSSProperties = {};
  if (effectiveMode === "grid" && packed && !floatsInGrid) {
    if (isActiveDrag && activeGestureKind === "drag-grid" && activeGestureOriginRect) {
      const origin = activeGestureOriginRect as { left: number; top: number; width: number; height: number };
      style = {
        left: origin.left,
        top: origin.top,
        width: origin.width,
        height: origin.height,
        zIndex: 30,
      };
    } else if (isActiveDrag && activeGestureKind === "resize-grid" && activeGesturePreviewSize) {
      style = {
        left: packed.left,
        top: packed.top,
        width:
          activeGesturePreviewSize.w * metrics.columnWidth +
          Math.max(0, activeGesturePreviewSize.w - 1) * metrics.gap,
        height:
          activeGesturePreviewSize.h * metrics.rowHeight +
          Math.max(0, activeGesturePreviewSize.h - 1) * metrics.gap,
        zIndex: 30,
      };
    } else {
      style = {
        left: packed.left,
        top: packed.top,
        width: packed.width,
        height: packed.height,
      };
    }
  } else if (freeform) {
    if (isActiveDrag && activeGestureKind === "drag-freeform" && activeGestureOriginRect) {
      const origin = activeGestureOriginRect as { x: number; y: number; w: number; h: number; z?: number };
      style = {
        left: origin.x,
        top: origin.y,
        width: origin.w,
        height: origin.h,
        zIndex: Math.max(30, Number(origin.z ?? 1)),
      };
    } else if (isActiveDrag && activeGestureKind === "resize-freeform" && activeGesturePreviewRect) {
      style = {
        left: activeGesturePreviewRect.x,
        top: activeGesturePreviewRect.y,
        width: activeGesturePreviewRect.w,
        height: activeGesturePreviewRect.h,
        zIndex: Math.max(30, Number(activeGesturePreviewRect.z ?? 1)),
      };
    } else {
      style = {
        left: freeform.x,
        top: freeform.y,
        width: freeform.w,
        height: freeform.h,
        zIndex: isMenuOpen ? 50 : freeform.z || 1,
      };
    }
  }

  if (isMenuOpen && effectiveMode === "grid" && !floatsInGrid) {
    style.zIndex = 50;
  }

  // -- Derived layout flags -------------------------------------------------

  const showOverlay = editMode;
  const isResizeGesture =
    isActiveDrag &&
    (activeGestureKind === "resize-grid" || activeGestureKind === "resize-freeform");
  const resizeHandleActive = resizeIntentActive || isResizeGesture;
  const showFrameInfo = showOverlay || isResizeGesture;
  const widgetFrameOverflowClass =
    showOverlay && !isActiveDrag
      ? "overflow-hidden rounded-[var(--ether-card-radius)]"
      : widget.type === "robot_face" || widget.type === "rich_note"
      ? "overflow-visible rounded-[inherit]"
      : isDefaultDarkWallpaper
        ? "overflow-visible rounded-[var(--ether-card-radius)]"
        : "overflow-hidden rounded-[var(--ether-card-radius)]";

  const pixelWidth = Math.max(
    0,
    typeof style.width === "number"
      ? style.width
      : (freeform?.w ?? packed?.width ?? 0),
  );
  const pixelHeight = Math.max(
    0,
    typeof style.height === "number"
      ? style.height
      : (freeform?.h ?? packed?.height ?? 0),
  );
  const gridWidth =
    isActiveDrag && activeGestureKind === "resize-grid" && activeGesturePreviewSize
      ? activeGesturePreviewSize.w
      : (packed?.w ?? estimateGridSpan(pixelWidth, metrics.columnWidth, metrics.gap));
  const gridHeight =
    isActiveDrag && activeGestureKind === "resize-grid" && activeGesturePreviewSize
      ? activeGesturePreviewSize.h
      : (packed?.h ?? estimateGridSpan(pixelHeight, metrics.rowHeight, metrics.gap));

  // Stable frameInfo (1C fix), only changes when pixel/grid values change
  const frameInfoRef = useRef<DashboardWidgetFrameInfo>({ pixelWidth: 0, pixelHeight: 0 });
  const prevFrameInfo = frameInfoRef.current;
  const frameInfo: DashboardWidgetFrameInfo =
    prevFrameInfo.pixelWidth === pixelWidth &&
    prevFrameInfo.pixelHeight === pixelHeight &&
    prevFrameInfo.gridWidth === gridWidth &&
    prevFrameInfo.gridHeight === gridHeight
      ? prevFrameInfo
      : { pixelWidth, pixelHeight, gridWidth, gridHeight };
  frameInfoRef.current = frameInfo;

  // -- Gesture handlers (1B fix), internalized per-widget --------------------

  const beginWidgetGesture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (effectiveMode === "grid" && packed && !floatsInGrid) {
        onBeginGridDrag(widget.id, event, packed);
      } else {
        onBeginFreeformDrag(widget.id, event);
      }
    },
    [effectiveMode, floatsInGrid, onBeginFreeformDrag, onBeginGridDrag, packed, widget.id],
  );

  const beginWidgetResizeGesture = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      onSetResizeIntentWidgetId(widget.id);
      if (shouldDelayResizeForPointer(event)) {
        event.preventDefault();
        event.stopPropagation();
        captureDashboardPointer(event);
        onClearPendingResizeHold();

        const pointerId = event.pointerId;
        const startClientX = event.clientX;
        const startClientY = event.clientY;
        const timerId = window.setTimeout(() => {
          const pending = pendingResizeHoldRef.current;
          if (!pending || pending.pointerId !== pointerId) return;
          pendingResizeHoldRef.current = null;
          if (effectiveMode === "grid" && !floatsInGrid) {
            onBeginGridResizeAt(widget.id, "both", pending.startClientX, pending.startClientY);
          } else {
            onBeginFreeformResizeAt(widget.id, "both", pending.startClientX, pending.startClientY);
          }
        }, TOUCH_RESIZE_HOLD_MS);

        pendingResizeHoldRef.current = {
          pointerId,
          startClientX,
          startClientY,
          timerId,
        };
        return;
      }

      onClearPendingResizeHold();
      if (effectiveMode === "grid" && !floatsInGrid) {
        onBeginGridResize(widget.id, "both", event);
      } else {
        onBeginFreeformResize(widget.id, "both", event);
      }
    },
    [
      effectiveMode,
      floatsInGrid,
      onBeginFreeformResize,
      onBeginFreeformResizeAt,
      onBeginGridResize,
      onBeginGridResizeAt,
      onClearPendingResizeHold,
      onSetResizeIntentWidgetId,
      pendingResizeHoldRef,
      widget.id,
    ],
  );

  const handleResizeHoldPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const pending = pendingResizeHoldRef.current;
      if (!pending || pending.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      pending.startClientX = event.clientX;
      pending.startClientY = event.clientY;
    },
    [pendingResizeHoldRef],
  );

  const handleResizeHoldPointerEnd = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const pending = pendingResizeHoldRef.current;
      if (!pending || pending.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      onClearPendingResizeHold();
      onSetResizeIntentWidgetId(null);
    },
    [onClearPendingResizeHold, onSetResizeIntentWidgetId, pendingResizeHoldRef],
  );

  // -- Derived classes ------------------------------------------------------

  const isDragGesture = isActiveDrag && (activeGestureKind === "drag-grid" || activeGestureKind === "drag-freeform");
  const isFreeformPlacement = effectiveMode === "freeform" || floatsInGrid;
  const glassEffectsSupported = supportsDashboardWidgetGlassEffects(widget.type);
  const effectiveWidgetGlowEnabled =
    widgetGlowEnabled &&
    widget.config.glowEnabled !== false;
  const effectiveWidgetGlassEnabled =
    glassEffectsSupported &&
    glassEffectEnabled &&
    widget.config.glassEnabled !== false;
  const widgetGlassState = glassEffectsSupported
    ? effectiveWidgetGlassEnabled
      ? "on"
      : "off"
    : "unsupported";
  const widgetGlassVariables =
    effectiveWidgetGlassEnabled
      ? undefined
      : getDashboardGlassVariables(isDark ? "dark" : "light", false, glassEffectIntensity);
  const shouldRelaxPaintContainment =
    isDefaultDarkWallpaper ||
    isActiveDrag ||
    isMenuOpen ||
    isSearchHighlighted;
  const placementTransitionClass =
    isActiveDrag || floatsInGrid
      ? ""
      : `transition-[left,top,width,height,opacity,transform,box-shadow] ${
          reduceMotion ? "duration-0" : "duration-300"
        }`;

  return (
    <div
      key={widget.id}
      ref={isDragGesture ? dragElementRef : undefined}
      data-dashboard-widget-id={widget.id}
      data-dashboard-placement={effectiveMode === "grid" && !floatsInGrid ? "grid" : "freeform"}
      data-dashboard-resize-intent={resizeHandleActive ? "true" : undefined}
      className={`absolute ${placementTransitionClass} ${isActiveDrag ? "pointer-events-none" : ""}`}
      onPointerDownCapture={(event) => {
        if (!isFreeformPlacement || event.button > 0) return;
        onRaiseFreeformWidget(widget.id);
      }}
      style={{
        ...style,
        ...(isDragGesture && effectiveWidgetGlassEnabled
          ? MOVING_WIDGET_GLASS_PARENT_VARIABLES
          : undefined),
        contain: shouldRelaxPaintContainment
          ? "layout style"
          : "layout paint style",
        willChange: isActiveDrag ? "transform" : undefined,
        backfaceVisibility: "hidden",
      }}
    >
      <div
        data-dashboard-moving-widget={isDragGesture ? "true" : undefined}
        data-dashboard-widget-glass={widgetGlassState}
        className={`${isActiveDrag ? "" : widgetMotionClass} group relative isolate h-full ${widgetFrameOverflowClass} ${
          isSearchHighlighted
            ? "dashboard-widget-search-highlight"
            : ""
        } ${
          isResizeGesture
            ? "dashboard-widget-resize-viewport rounded-[var(--ether-card-radius)]"
            : ""
        } ${isActiveDrag ? "scale-[1.02]" : ""}`}
        style={{
          padding: 0,
          ...getDashboardWidgetAccentVariables(widget.config),
          ...widgetGlassVariables,
          ...(isDragGesture && effectiveWidgetGlassEnabled
            ? MOVING_WIDGET_GLASS_SURFACE_VARIABLES
            : undefined),
        }}
      >
        {effectiveWidgetGlowEnabled && (
          <div
            aria-hidden
            data-dashboard-widget-glow="true"
            className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] opacity-100"
            style={getDashboardWidgetGlowLayerStyle(widget.config, isDark)}
          />
        )}

        <div
          className="absolute left-1/2 top-0 z-[40] -translate-x-1/2 flex flex-col items-center group/handle"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            beginWidgetGesture(e);
          }}
          style={{ touchAction: "none" }}
          aria-hidden
        >
          <div className="flex h-8 w-16 cursor-grab items-center justify-center rounded-b-xl active:cursor-grabbing hover:bg-white/[0.08] transition-colors duration-300">
            <div className={`flex gap-1 transition-opacity duration-300 ${
              editMode || isActiveDrag ? "opacity-40 group-hover/handle:opacity-100" : "opacity-0 group-hover:opacity-30 group-hover/handle:opacity-50"
            }`}>
              <div className="h-1 w-1 rounded-full bg-[var(--ether-on-surface)]" />
              <div className="h-1 w-1 rounded-full bg-[var(--ether-on-surface)]" />
              <div className="h-1 w-1 rounded-full bg-[var(--ether-on-surface)]" />
            </div>
          </div>
          <div className="pointer-events-none absolute top-full mt-1 whitespace-nowrap rounded-lg bg-black/80 px-2 py-1 text-[10px] font-bold text-white opacity-0 shadow-xl backdrop-blur-md transition-opacity duration-300 group-hover/handle:opacity-100">
            Hold to move
          </div>
        </div>

        {showFrameInfo && (
          <div className="pointer-events-none absolute top-2 left-2 z-50 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/70 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg backdrop-blur-md">
            <LayoutGrid size={10} className="text-white/50" />
            <span className="tracking-[0.1em]">
              {gridWidth} x {gridHeight}
            </span>
          </div>
        )}

        <button
          type="button"
          data-testid={`dashboard-resize-handle-${widget.id}`}
          data-dashboard-resize-handle="true"
          data-resize-active={resizeHandleActive ? "true" : "false"}
          onPointerDown={beginWidgetResizeGesture}
          onPointerMove={handleResizeHoldPointerMove}
          onPointerUp={handleResizeHoldPointerEnd}
          onPointerCancel={handleResizeHoldPointerEnd}
          onClick={(event) => event.stopPropagation()}
          className={`dashboard-widget-resize-handle group/resize absolute bottom-0 right-0 z-[45] flex h-8 w-8 cursor-nwse-resize items-end justify-end rounded-br-[inherit] p-1.5 outline-none transition-[opacity,transform] duration-200 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--dashboard-accent)]/35 ${
            showOverlay || resizeHandleActive
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100"
          }`}
          style={{ touchAction: "none" }}
          aria-label="Resize widget"
        >
          <span
            aria-hidden
            data-dashboard-resize-corner="true"
            className={`pointer-events-none block h-4 w-4 rounded-br-[0.75rem] border-b-[1.5px] border-r-[1.5px] transition-[border-color,box-shadow,opacity,transform] duration-200 ${
              resizeHandleActive
                ? "border-[var(--dashboard-accent)]/65 opacity-100 shadow-[0_0_10px_color-mix(in_srgb,var(--dashboard-accent)_20%,transparent)]"
                : showOverlay
                  ? "border-transparent opacity-0 group-hover/resize:border-[var(--dashboard-accent)]/42 group-hover/resize:opacity-90 group-focus-visible/resize:border-[var(--dashboard-accent)]/55 group-focus-visible/resize:opacity-100"
                  : "border-[var(--ether-on-surface)]/24 opacity-80 group-hover:border-[var(--dashboard-accent)]/42 group-hover:opacity-95"
            }`}
          />
        </button>

        <div className="relative z-10 h-full min-h-0 min-w-0 rounded-[inherit]">
          <DashboardWidgetGlowContext.Provider value={effectiveWidgetGlowEnabled}>
            <DashboardWidgetBody
              {...baseProps}
              Component={Component}
              frameInfo={frameInfo}
              menuOpen={isMenuOpen}
              onWidgetMenuButtonRef={onRegisterWidgetMenuButton}
              onToggleWidgetMenu={onToggleWidgetMenu}
              editMode={editMode}
              onCreateWidget={onCreateWidget}
            />
          </DashboardWidgetGlowContext.Provider>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Memo comparator: only re-render when visually or structurally relevant
// props change.
// ---------------------------------------------------------------------------

const getComparableRuntimeProps = (props: DashboardWidgetFrameProps) =>
  getDashboardRuntimePropsForWidget(props.widget.type, {
    weather: props.weather,
    aqi: props.aqi,
    activeProfileName: props.activeProfileName,
    activeProfileId: props.activeProfileId,
    recognizedBy: props.recognizedBy,
    updatedAt: props.speakerUpdatedAt,
  });

const areRuntimePropsEqual = (
  prev: DashboardWidgetFrameProps,
  next: DashboardWidgetFrameProps,
) => {
  const prevRuntime = getComparableRuntimeProps(prev);
  const nextRuntime = getComparableRuntimeProps(next);

  return (
    prevRuntime.weather === nextRuntime.weather &&
    prevRuntime.aqi === nextRuntime.aqi &&
    prevRuntime.activeProfileName === nextRuntime.activeProfileName &&
    prevRuntime.activeProfileId === nextRuntime.activeProfileId &&
    prevRuntime.recognizedBy === nextRuntime.recognizedBy &&
    prevRuntime.updatedAt === nextRuntime.updatedAt
  );
};

export const areDashboardWidgetFramePropsEqual = (
  prev: DashboardWidgetFrameProps,
  next: DashboardWidgetFrameProps,
): boolean =>
  prev.widget === next.widget &&
  prev.packedItem === next.packedItem &&
  prev.freeformRect === next.freeformRect &&
  prev.editMode === next.editMode &&
  prev.effectiveMode === next.effectiveMode &&
  prev.isDefaultDarkWallpaper === next.isDefaultDarkWallpaper &&
  prev.isDark === next.isDark &&
  prev.reduceMotion === next.reduceMotion &&
  prev.widgetGlowEnabled === next.widgetGlowEnabled &&
  prev.glassEffectEnabled === next.glassEffectEnabled &&
  prev.glassEffectIntensity === next.glassEffectIntensity &&
  prev.isActiveDrag === next.isActiveDrag &&
  prev.activeGestureKind === next.activeGestureKind &&
  prev.activeGestureOriginRect === next.activeGestureOriginRect &&
  prev.activeGesturePreviewSize === next.activeGesturePreviewSize &&
  prev.activeGesturePreviewRect === next.activeGesturePreviewRect &&
  prev.resizeIntentActive === next.resizeIntentActive &&
  prev.isSearchHighlighted === next.isSearchHighlighted &&
  prev.isFocused === next.isFocused &&
  prev.isMenuOpen === next.isMenuOpen &&
  prev.metrics === next.metrics &&
  areRuntimePropsEqual(prev, next) &&
  (prev.widget.type !== "robot_face" || prev.faceSlot === next.faceSlot) &&
  (prev.widget.type !== "robot_face" || prev.robotBubble === next.robotBubble) &&
  prev.onUpdateWidgetConfig === next.onUpdateWidgetConfig &&
  prev.onOpenWidgetSettings === next.onOpenWidgetSettings &&
  prev.onRegisterWidgetMenuButton === next.onRegisterWidgetMenuButton &&
  prev.onToggleWidgetMenu === next.onToggleWidgetMenu &&
  prev.onCreateWidget === next.onCreateWidget &&
  prev.onBeginGridDrag === next.onBeginGridDrag &&
  prev.onBeginFreeformDrag === next.onBeginFreeformDrag &&
  prev.onBeginGridResize === next.onBeginGridResize &&
  prev.onBeginFreeformResize === next.onBeginFreeformResize &&
  prev.onBeginGridResizeAt === next.onBeginGridResizeAt &&
  prev.onBeginFreeformResizeAt === next.onBeginFreeformResizeAt &&
  prev.onRaiseFreeformWidget === next.onRaiseFreeformWidget &&
  prev.onSetResizeIntentWidgetId === next.onSetResizeIntentWidgetId &&
  prev.onClearPendingResizeHold === next.onClearPendingResizeHold &&
  prev.pendingResizeHoldRef === next.pendingResizeHoldRef &&
  prev.dragElementRef === next.dragElementRef;

export const DashboardWidgetFrame = React.memo(
  DashboardWidgetFrameImpl,
  areDashboardWidgetFramePropsEqual,
);
