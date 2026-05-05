import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type {
  DashboardRobotFaceStyle,
  DashboardRobotWanderMode,
  DashboardWidget,
} from "../../../services/dashboardTypes";
import { DashboardWidgetFrameContext } from "../../../hooks/useWidgetSize";
import {
  clampFloatingWidgetPosition,
  type FloatingWidgetPosition,
  type FloatingWidgetSize,
} from "./dashboardBoardUtils";
import type { DashboardRobotBubble } from "./dashboardRobotBubbles";

const FloatingRobotFaceWidget = React.lazy(() =>
  import("./RobotFaceWidget").then((module) => ({
    default: module.RobotFaceWidget,
  })),
);

interface FloatingRobotOverlayProps {
  widget: DashboardWidget;
  faceSlot?:
    | React.ReactNode
    | ((faceStyle?: DashboardRobotFaceStyle) => React.ReactNode);
  onToggleConnection?: () => void;
  onRegisterWidgetMenuButton: (
    widgetId: string,
    node: HTMLButtonElement | null,
  ) => void;
  onToggleWidgetMenu: (widgetId: string) => void;
  onPositionChange: (
    widgetId: string,
    position: FloatingWidgetPosition,
    size: number,
  ) => void;
  bubble?: DashboardRobotBubble | null;
  reduceMotion?: boolean;
}

const FLOATING_ROBOT_SIZE = 190;
const FLOATING_ROBOT_MIN_SIZE = 136;
const FLOATING_ROBOT_MARGIN = 16;
const FLOATING_ROBOT_DRAG_THRESHOLD = 6;
const FLOATING_ROBOT_BUBBLE_MIN_SIDE_SPACE = 156;
const FLOATING_ROBOT_FULL_WANDER_DELAY_MS = 24000;
const FLOATING_ROBOT_IDLE_WANDER_DELAY_MS = 45000;
const FLOATING_ROBOT_RETURN_MS = 2400;
const FLOATING_ROBOT_SCAN_MS = 2500;
const FLOATING_ROBOT_FLOAT_MS = 3500;
const DEFAULT_VIEWPORT: FloatingWidgetSize = { width: 1024, height: 768 };
type FloatingRobotAutopilotPhase =
  | "home"
  | "inspect"
  | "perch"
  | "peek"
  | "dash"
  | "scan"
  | "float"
  | "hide"
  | "rotate"
  | "tumble"
  | "fall"
  | "pulse"
  | "glitch"
  | "warp"
  | "return";
type FloatingRobotAutopilotStyle =
  | "home"
  | "inspect"
  | "perch"
  | "peek"
  | "dash"
  | "scan"
  | "float"
  | "hide"
  | "rotate"
  | "tumble"
  | "fall"
  | "pulse"
  | "glitch"
  | "warp"
  | "return";

interface FloatingRobotAutopilotState {
  phase: Exclude<FloatingRobotAutopilotPhase, "home">;
  style: Exclude<FloatingRobotAutopilotStyle, "home">;
  position: FloatingWidgetPosition;
}

const getViewportSize = (): FloatingWidgetSize => {
  if (typeof window === "undefined") return DEFAULT_VIEWPORT;
  return {
    width: window.innerWidth || DEFAULT_VIEWPORT.width,
    height: window.innerHeight || DEFAULT_VIEWPORT.height,
  };
};

const getMaxFloatingRobotSize = (viewport: FloatingWidgetSize) =>
  Math.max(
    FLOATING_ROBOT_MIN_SIZE,
    Math.min(
      viewport.width - FLOATING_ROBOT_MARGIN * 2,
      viewport.height - FLOATING_ROBOT_MARGIN * 2,
    ),
  );

const getStoredRobotSize = (
  widget: DashboardWidget,
  viewport: FloatingWidgetSize,
) => {
  const rawSize = Number(widget.config.robotFloatingSize);
  const maxViewportSize = getMaxFloatingRobotSize(viewport);
  const requested = Number.isFinite(rawSize) ? rawSize : FLOATING_ROBOT_SIZE;
  return Math.max(
    FLOATING_ROBOT_MIN_SIZE,
    Math.min(maxViewportSize, requested),
  );
};

const getStoredRobotPosition = (
  widget: DashboardWidget,
  viewport: FloatingWidgetSize,
  size: number,
) => {
  const rawX = Number(widget.config.robotFloatingX);
  const rawY = Number(widget.config.robotFloatingY);
  const hasStoredPosition = Number.isFinite(rawX) && Number.isFinite(rawY);
  const fallback = {
    x: viewport.width - size - FLOATING_ROBOT_MARGIN,
    y: viewport.height - size - FLOATING_ROBOT_MARGIN,
  };
  return clampFloatingWidgetPosition(
    hasStoredPosition ? { x: rawX, y: rawY } : fallback,
    viewport,
    { width: size, height: size },
    FLOATING_ROBOT_MARGIN,
  );
};

const getRobotWanderMode = (
  mode: DashboardRobotWanderMode | undefined,
): DashboardRobotWanderMode => mode || "idle";

const getAutopilotDelay = (mode: DashboardRobotWanderMode) =>
  mode === "full" ? FLOATING_ROBOT_FULL_WANDER_DELAY_MS : FLOATING_ROBOT_IDLE_WANDER_DELAY_MS;

const roundFloatingRobotPosition = (
  position: FloatingWidgetPosition,
): FloatingWidgetPosition => ({
  x: Math.round(position.x),
  y: Math.round(position.y),
});

export const FloatingRobotOverlay: React.FC<FloatingRobotOverlayProps> = ({
  widget,
  faceSlot,
  onToggleConnection,
  onRegisterWidgetMenuButton,
  onToggleWidgetMenu,
  onPositionChange,
  bubble,
  reduceMotion = false,
}) => {
  const [viewport, setViewport] = useState(getViewportSize);
  const [size, setSize] = useState(() => getStoredRobotSize(widget, viewport));
  const [position, setPosition] = useState(() =>
    getStoredRobotPosition(widget, viewport, size),
  );
  const [autopilot, setAutopilot] =
    useState<FloatingRobotAutopilotState | null>(null);
  const [autopilotCycle, setAutopilotCycle] = useState(0);
  const [interactionToken, setInteractionToken] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const positionRef = useRef(position);
  const sizeRef = useRef(size);
  const autopilotTimersRef = useRef<number[]>([]);
  const autopilotSequenceRef = useRef(0);
  const autopilotTargetIndexRef = useRef(0);
  const autopilotPatternIndexRef = useRef(0);
  const lastContextualMoveRef = useRef(0);
  const gestureRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    origin: FloatingWidgetPosition;
    dragged: boolean;
  } | null>(null);
  const resizeGestureRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originSize: number;
    originPosition: FloatingWidgetPosition;
  } | null>(null);

  positionRef.current = position;
  sizeRef.current = size;
  const wanderMode = getRobotWanderMode(widget.config.robotWanderMode);
  const autopilotPhase: FloatingRobotAutopilotPhase =
    autopilot?.phase || "home";
  const autopilotStyle: FloatingRobotAutopilotStyle =
    autopilot?.style || "home";
  const visualPosition = autopilot?.position || position;

  const widgetSize = useMemo(
    () => ({ width: size, height: size }),
    [size],
  );
  const glowEnabled = widget.config.glowEnabled !== false;
  const frameInfo = useMemo(
    () => ({
      pixelWidth: size,
      pixelHeight: size,
      gridWidth: Math.max(1, Math.round(size / 95)),
      gridHeight: Math.max(1, Math.round(size / 95)),
    }),
    [size],
  );
  const bubblePlacementClass = useMemo(() => {
    const rightSpace = viewport.width - (position.x + size) - FLOATING_ROBOT_MARGIN;
    const leftSpace = position.x - FLOATING_ROBOT_MARGIN;

    if (
      rightSpace >= FLOATING_ROBOT_BUBBLE_MIN_SIDE_SPACE &&
      rightSpace >= leftSpace
    ) {
      return "left-[calc(100%+0.5rem)] top-2";
    }

    if (leftSpace >= FLOATING_ROBOT_BUBBLE_MIN_SIDE_SPACE) {
      return "right-[calc(100%+0.5rem)] top-2";
    }

    if (rightSpace >= FLOATING_ROBOT_BUBBLE_MIN_SIDE_SPACE) {
      return "left-[calc(100%+0.5rem)] top-2";
    }

    return position.y >= 84
      ? "bottom-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2"
      : "left-1/2 top-[calc(100%+0.5rem)] -translate-x-1/2";
  }, [position.x, position.y, size, viewport.width]);

  const clearAutopilotTimers = useCallback(() => {
    autopilotTimersRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    autopilotTimersRef.current = [];
  }, []);

  const cancelAutopilotForUser = useCallback(() => {
    autopilotSequenceRef.current += 1;
    clearAutopilotTimers();
    setAutopilot(null);
    setInteractionToken((current) => current + 1);
  }, [clearAutopilotTimers]);

  const scheduleAutopilotTimer = useCallback((callback: () => void, delay: number) => {
    const timerId = window.setTimeout(callback, delay);
    autopilotTimersRef.current.push(timerId);
  }, []);

  const getAutopilotTargetForRect = useCallback((rect: DOMRect) => {
    const canInspectRight =
      rect.right + size + FLOATING_ROBOT_MARGIN <= viewport.width;
    const inspectX = canInspectRight
      ? rect.right + 8
      : rect.left - size - 8;
    const inspectY = rect.top - 5;
    const perchX = rect.right - size + 5;
    const perchY = rect.top - size * 0.77;
    const peekX = canInspectRight
      ? rect.right - size * 0.18
      : rect.left - size * 0.82;
    const peekY = rect.top + rect.height * 0.48 - size * 0.48;

    return {
      inspect: clampFloatingWidgetPosition(
        roundFloatingRobotPosition({ x: inspectX, y: inspectY }),
        viewport,
        { width: size, height: size },
        FLOATING_ROBOT_MARGIN,
      ),
      perch: clampFloatingWidgetPosition(
        roundFloatingRobotPosition({ x: perchX, y: perchY }),
        viewport,
        { width: size, height: size },
        FLOATING_ROBOT_MARGIN,
      ),
      peek: clampFloatingWidgetPosition(
        roundFloatingRobotPosition({ x: peekX, y: peekY }),
        viewport,
        { width: size, height: size },
        FLOATING_ROBOT_MARGIN,
      ),
    };
  }, [size, viewport]);

  const getAutopilotTarget = useCallback(() => {
    if (typeof document === "undefined") return null;
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>("[data-dashboard-widget-id]"),
    )
      .filter((element) => element.getAttribute("data-dashboard-widget-id") !== widget.id)
      .map((element) => element.getBoundingClientRect())
      .filter(
        (rect) =>
          rect.width >= 80 &&
          rect.height >= 80 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < viewport.height &&
          rect.left < viewport.width,
      );

    if (candidates.length === 0) return null;

    const rect =
      candidates[autopilotTargetIndexRef.current % candidates.length];
    autopilotTargetIndexRef.current += 1;

    return getAutopilotTargetForRect(rect);
  }, [getAutopilotTargetForRect, viewport.height, viewport.width, widget.id]);

  const runAutopilotSequence = useCallback(() => {
    const target = getAutopilotTarget();
    if (!target) {
      setAutopilotCycle((current) => current + 1);
      return;
    }

    const sequence = autopilotSequenceRef.current + 1;
    autopilotSequenceRef.current = sequence;
    const patternIndex = autopilotPatternIndexRef.current % 3;
    autopilotPatternIndexRef.current += 1;
    const steps: Array<{
      phase: Exclude<FloatingRobotAutopilotPhase, "home" | "return">;
      style: Exclude<FloatingRobotAutopilotStyle, "home" | "return">;
      position: FloatingWidgetPosition;
      duration: number;
    }> =
      patternIndex === 0
        ? [
            {
              phase: "inspect",
              style: "float",
              position: target.inspect,
              duration: FLOATING_ROBOT_FLOAT_MS,
            },
            {
              phase: "scan",
              style: "scan",
              position: target.perch,
              duration: FLOATING_ROBOT_SCAN_MS,
            },
          ]
        : patternIndex === 1
          ? [
              {
                phase: "peek",
                style: "float",
                position: target.peek,
                duration: FLOATING_ROBOT_FLOAT_MS,
              },
              {
                phase: "hide",
                style: "hide",
                position: target.peek,
                duration: 6000,
              },
            ]
          : patternIndex === 2
            ? [
                {
                  phase: "perch",
                  style: "tumble",
                  position: target.perch,
                  duration: 4500,
                },
                {
                  phase: "pulse",
                  style: "pulse",
                  position: target.perch,
                  duration: 4400,
                },
              ]
            : patternIndex === 3
              ? [
                  {
                    phase: "float",
                    style: "float",
                    position: { x: target.perch.x, y: target.perch.y - 120 },
                    duration: FLOATING_ROBOT_FLOAT_MS,
                  },
                  {
                    phase: "fall",
                    style: "fall",
                    position: target.perch,
                    duration: 1800,
                  },
                ]
              : patternIndex === 4
                ? [
                    {
                      phase: "glitch",
                      style: "glitch",
                      position: positionRef.current,
                      duration: 800,
                    },
                    {
                      phase: "inspect",
                      style: "float",
                      position: target.inspect,
                      duration: 4000,
                    },
                  ]
                : [
                    {
                      phase: "float",
                      style: "warp",
                      position: target.perch,
                      duration: 2200,
                    },
                    {
                      phase: "scan",
                      style: "pulse",
                      position: target.perch,
                      duration: 4500,
                    },
                  ];

    const [firstStep, ...remainingSteps] = steps;
    setAutopilot(firstStep);

    let elapsed = firstStep.duration;
    remainingSteps.forEach((step) => {
      scheduleAutopilotTimer(() => {
        if (autopilotSequenceRef.current !== sequence) return;
        setAutopilot(step);
      }, elapsed);
      elapsed += step.duration;
    });

    scheduleAutopilotTimer(() => {
      if (autopilotSequenceRef.current !== sequence) return;
      setAutopilot({
        phase: "return",
        style: "return",
        position: positionRef.current,
      });
    }, elapsed);

    scheduleAutopilotTimer(() => {
      if (autopilotSequenceRef.current !== sequence) return;
      setAutopilot(null);
      setAutopilotCycle((current) => current + 1);
    }, elapsed + FLOATING_ROBOT_RETURN_MS);
  }, [getAutopilotTarget, scheduleAutopilotTimer]);

  const runContextualSequence = useCallback((targetWidgetId: string) => {
    if (reduceMotion || wanderMode === "off" || bubble || isDragging || isResizing) return;
    if (targetWidgetId === widget.id) return;

    const now = Date.now();
    if (now - lastContextualMoveRef.current < 8000) return;

    const element = document.querySelector<HTMLElement>(`[data-dashboard-widget-id="${targetWidgetId}"]`);
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const target = getAutopilotTargetForRect(rect);

    lastContextualMoveRef.current = now;

    clearAutopilotTimers();
    const sequence = autopilotSequenceRef.current + 1;
    autopilotSequenceRef.current = sequence;

    const steps: Array<{
      phase: Exclude<FloatingRobotAutopilotPhase, "home" | "return">;
      style: Exclude<FloatingRobotAutopilotStyle, "home" | "return">;
      position: FloatingWidgetPosition;
      duration: number;
    }> = [
      {
        phase: "dash",
        style: "float",
        position: target.inspect,
        duration: FLOATING_ROBOT_FLOAT_MS,
      },
      {
        phase: "scan",
        style: "scan",
        position: target.perch,
        duration: FLOATING_ROBOT_SCAN_MS,
      },
      {
        phase: "perch",
        style: "perch",
        position: target.perch,
        duration: 14000,
      },
    ];

    const [firstStep, ...remainingSteps] = steps;
    setAutopilot(firstStep);

    let elapsed = firstStep.duration;
    remainingSteps.forEach((step) => {
      scheduleAutopilotTimer(() => {
        if (autopilotSequenceRef.current !== sequence) return;
        setAutopilot(step);
      }, elapsed);
      elapsed += step.duration;
    });

    scheduleAutopilotTimer(() => {
      if (autopilotSequenceRef.current !== sequence) return;
      // After staying, go "somewhere else" by starting a random wander sequence
      runAutopilotSequence();
    }, elapsed);
  }, [bubble, clearAutopilotTimers, getAutopilotTargetForRect, isDragging, isResizing, reduceMotion, runAutopilotSequence, scheduleAutopilotTimer, wanderMode, widget.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => setViewport(getViewportSize());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.addEventListener("pointerdown", cancelAutopilotForUser, true);
    window.addEventListener("keydown", cancelAutopilotForUser, true);
    window.addEventListener("wheel", cancelAutopilotForUser, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener("pointerdown", cancelAutopilotForUser, true);
      window.removeEventListener("keydown", cancelAutopilotForUser, true);
      window.removeEventListener("wheel", cancelAutopilotForUser, true);
    };
  }, [cancelAutopilotForUser]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleWidgetInteraction = (event: Event) => {
      const customEvent = event as CustomEvent<{ widgetId: string }>;
      if (customEvent.detail?.widgetId) {
        runContextualSequence(customEvent.detail.widgetId);
      }
    };
    window.addEventListener("curio:widget-interaction", handleWidgetInteraction);
    return () => window.removeEventListener("curio:widget-interaction", handleWidgetInteraction);
  }, [runContextualSequence]);

  useEffect(() => {
    clearAutopilotTimers();

    if (reduceMotion || wanderMode === "off" || bubble) {
      setAutopilot(null);
      return;
    }

    scheduleAutopilotTimer(
      runAutopilotSequence,
      getAutopilotDelay(wanderMode),
    );

    return clearAutopilotTimers;
  }, [
    autopilotCycle,
    bubble,
    clearAutopilotTimers,
    interactionToken,
    reduceMotion,
    runAutopilotSequence,
    scheduleAutopilotTimer,
    wanderMode,
  ]);

  useEffect(() => {
    return () => {
      clearAutopilotTimers();
      autopilotSequenceRef.current += 1;
    };
  }, [clearAutopilotTimers]);

  useEffect(() => {
    const nextSize = getStoredRobotSize(widget, viewport);
    const next = getStoredRobotPosition(widget, viewport, nextSize);
    setSize(nextSize);
    sizeRef.current = nextSize;
    setPosition(next);
    positionRef.current = next;
  }, [
    viewport,
    widget.config.robotFloatingSize,
    widget.config.robotFloatingX,
    widget.config.robotFloatingY,
    widget.id,
  ]);

  const persistClampedPosition = useCallback(
    (nextPosition: FloatingWidgetPosition) => {
      const clamped = clampFloatingWidgetPosition(
        nextPosition,
        viewport,
        widgetSize,
        FLOATING_ROBOT_MARGIN,
      );
      setPosition(clamped);
      positionRef.current = clamped;
      onPositionChange(widget.id, clamped, sizeRef.current);
    },
    [onPositionChange, viewport, widget.id, widgetSize],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.currentTarget.setPointerCapture === "function") {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture can fail if the pointer was canceled by the browser.
        }
      }
      gestureRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        origin: positionRef.current,
        dragged: false,
      };
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();

      const deltaX = event.clientX - gesture.startClientX;
      const deltaY = event.clientY - gesture.startClientY;
      if (
        Math.abs(deltaX) >= FLOATING_ROBOT_DRAG_THRESHOLD ||
        Math.abs(deltaY) >= FLOATING_ROBOT_DRAG_THRESHOLD
      ) {
        if (!gesture.dragged) {
          gesture.dragged = true;
          setIsDragging(true);
        }
      }

      if (!gesture.dragged) return;

      const next = clampFloatingWidgetPosition(
        {
          x: gesture.origin.x + deltaX,
          y: gesture.origin.y + deltaY,
        },
        viewport,
        widgetSize,
        FLOATING_ROBOT_MARGIN,
      );
      setPosition(next);
      positionRef.current = next;
    },
    [viewport, widgetSize],
  );

  const handlePointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      gestureRef.current = null;

      if (gesture.dragged) {
        setIsDragging(false);
        persistClampedPosition(positionRef.current);
        return;
      }

      onToggleConnection?.();
    },
    [onToggleConnection, persistClampedPosition],
  );

  const persistClampedSize = useCallback(
    (nextSize: number) => {
      const maxSize = getMaxFloatingRobotSize(viewport);
      const clampedSize = Math.max(
        FLOATING_ROBOT_MIN_SIZE,
        Math.min(maxSize, nextSize),
      );
      const clampedPosition = clampFloatingWidgetPosition(
        positionRef.current,
        viewport,
        { width: clampedSize, height: clampedSize },
        FLOATING_ROBOT_MARGIN,
      );
      setSize(clampedSize);
      sizeRef.current = clampedSize;
      setPosition(clampedPosition);
      positionRef.current = clampedPosition;
      onPositionChange(widget.id, clampedPosition, clampedSize);
    },
    [onPositionChange, viewport, widget.id],
  );

  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.currentTarget.setPointerCapture === "function") {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Ignore pointer capture failures on canceled gestures.
        }
      }
      resizeGestureRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        originSize: sizeRef.current,
        originPosition: positionRef.current,
      };
      setIsResizing(true);
    },
    [],
  );

  const handleResizePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const gesture = resizeGestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = Math.max(
        event.clientX - gesture.startClientX,
        event.clientY - gesture.startClientY,
      );
      const maxSize = getMaxFloatingRobotSize(viewport);
      const nextSize = Math.max(
        FLOATING_ROBOT_MIN_SIZE,
        Math.min(maxSize, gesture.originSize + delta),
      );
      const nextPosition = clampFloatingWidgetPosition(
        gesture.originPosition,
        viewport,
        { width: nextSize, height: nextSize },
        FLOATING_ROBOT_MARGIN,
      );
      setSize(nextSize);
      sizeRef.current = nextSize;
      setPosition(nextPosition);
      positionRef.current = nextPosition;
    },
    [viewport],
  );

  const handleResizePointerEnd = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const gesture = resizeGestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      resizeGestureRef.current = null;
      setIsResizing(false);
      persistClampedSize(sizeRef.current);
    },
    [persistClampedSize],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      onToggleConnection?.();
    },
    [onToggleConnection],
  );

  const autopilotTransform =
    autopilotStyle === "inspect"
      ? "scale(1.03) rotate(2deg)"
      : autopilotStyle === "perch"
        ? "scale(0.985) rotate(-1.4deg)"
        : autopilotStyle === "peek"
          ? "scale(0.97) rotate(2.2deg)"
          : autopilotStyle === "dash"
            ? "scale(1.08, 0.94) rotate(-3deg)"
            : autopilotStyle === "scan"
              ? "scale(1.02) rotate(1deg)"
              : autopilotStyle === "float"
                ? "scale(1.01) rotate(-1deg)"
                : autopilotStyle === "hide"
                  ? "scale(0.5) translateY(40px) rotate(-8deg)"
                  : autopilotStyle === "rotate"
                    ? "rotate(360deg) scale(1.02)"
                    : autopilotStyle === "tumble"
                      ? "rotate(720deg) scale(0.85)"
                      : autopilotStyle === "fall"
                        ? "translateY(25px) scaleY(0.88) rotate(4deg)"
                        : autopilotStyle === "pulse"
                          ? "scale(1.12)"
                          : autopilotStyle === "glitch"
                            ? "scale(1.08) translate(2px, -2px)"
                            : autopilotStyle === "warp"
                              ? "scale(1.35, 0.78) rotate(-4deg)"
                              : "scale(1) rotate(0deg)";

  const autopilotTransition = reduceMotion || isDragging || isResizing
    ? undefined
    : autopilotStyle === "dash"
      ? [
          "left 450ms cubic-bezier(0.2, 0, 0, 1)",
          "top 450ms cubic-bezier(0.2, 0, 0, 1)",
          "transform 400ms cubic-bezier(0.2, 0, 0, 1)",
          "filter 400ms ease",
          "opacity 400ms ease",
        ].join(", ")
      : autopilotStyle === "float"
        ? [
            "left 3500ms ease-in-out",
            "top 3500ms ease-in-out",
            "transform 3200ms ease-in-out",
            "filter 3200ms ease-in-out",
            "opacity 3200ms ease-in-out",
          ].join(", ")
        : autopilotStyle === "scan"
          ? [
              "left 2500ms ease-in-out",
              "top 2500ms ease-in-out",
              "transform 2500ms ease-in-out",
              "filter 2500ms ease-in-out",
              "opacity 2500ms ease-in-out",
            ].join(", ")
          : autopilotStyle === "hide"
            ? [
                "left 3500ms ease-in-out",
                "top 3500ms ease-in-out",
                "transform 3000ms cubic-bezier(0.4, 0, 0.2, 1)",
                "opacity 3000ms ease-in-out",
                "filter 3000ms ease-in-out",
              ].join(", ")
            : autopilotStyle === "rotate"
              ? [
                  "left 4000ms ease-in-out",
                  "top 4000ms ease-in-out",
                  "transform 4000ms cubic-bezier(0.4, 0, 0.2, 1)",
                ].join(", ")
              : autopilotStyle === "tumble"
                ? [
                    "left 4500ms ease-in-out",
                    "top 4500ms ease-in-out",
                    "transform 4500ms linear",
                  ].join(", ")
              : autopilotStyle === "fall"
                ? [
                    "left 1200ms ease-out",
                    "top 1200ms cubic-bezier(0.47, 0, 0.745, 0.715)",
                    "transform 1000ms ease-out",
                  ].join(", ")
                : autopilotStyle === "pulse"
                  ? [
                      "left 4000ms ease-in-out",
                      "top 4000ms ease-in-out",
                      "transform 2200ms ease-in-out",
                    ].join(", ")
                  : autopilotStyle === "glitch"
                    ? [
                        "transform 150ms step-end",
                        "opacity 150ms step-end",
                        "filter 150ms step-end",
                      ].join(", ")
                    : autopilotStyle === "warp"
                      ? [
                          "left 1800ms cubic-bezier(0.19, 1, 0.22, 1)",
                          "top 1800ms cubic-bezier(0.19, 1, 0.22, 1)",
                          "transform 1500ms cubic-bezier(0.19, 1, 0.22, 1)",
                        ].join(", ")
                      : [
                          "left 2200ms cubic-bezier(0.16, 1, 0.3, 1)",
                          "top 2200ms cubic-bezier(0.16, 1, 0.3, 1)",
                          "transform 1800ms cubic-bezier(0.16, 1, 0.3, 1)",
                          "filter 1800ms cubic-bezier(0.16, 1, 0.3, 1)",
                          "opacity 1800ms cubic-bezier(0.16, 1, 0.3, 1)",
                        ].join(", ");

  return (
    <div
      data-testid="dashboard-floating-robot"
      data-dashboard-floating-robot="true"
      data-robot-wander-mode={wanderMode}
      data-robot-autopilot-phase={autopilotPhase}
      data-robot-autopilot-style={autopilotStyle}
      className="fixed"
      style={{
        left: visualPosition.x,
        top: visualPosition.y,
        width: size,
        height: size,
        zIndex: 60,
        transform: autopilotTransform,
        opacity: 1,
        filter: "drop-shadow(0 14px 28px rgba(0,0,0,0.18)) saturate(1.03)",
        transition: autopilotTransition,
      }}
    >
      {bubble && (
        <div
          data-testid="dashboard-robot-bubble"
          data-dashboard-robot-bubble-kind={bubble.kind}
          className={`pointer-events-none absolute z-50 w-max min-w-[8rem] max-w-[min(17rem,calc(100vw-2rem))] whitespace-normal rounded-[1.35rem] border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] px-3.5 py-2.5 text-xs font-semibold leading-5 text-[var(--ether-on-surface)] opacity-95 shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur-[var(--ether-glass-blur)] ${bubblePlacementClass}`}
        >
          {bubble.text}
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        aria-label="Connect with robot"
        data-testid="dashboard-floating-robot-surface"
        className={`group/floating-robot relative h-full w-full cursor-grab touch-none overflow-visible rounded-full active:cursor-grabbing ${
          autopilotPhase === "home" && !isDragging && !isResizing && !reduceMotion
            ? "dashboard-floating-robot-idle"
            : ""
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
      >
        {/* Visual Effects Layer */}
        {glowEnabled && (
          <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-visible">
            <div
              aria-hidden
              className="dashboard-floating-robot-aura absolute h-[140%] w-[140%] rounded-full"
            />
            
            {autopilotPhase !== "home" && (
              <div
                aria-hidden
                className="dashboard-floating-robot-scan absolute h-[118%] w-[118%] rounded-full"
              />
            )}

            {autopilotStyle === "scan" && (
              <div
                aria-hidden
                className="dashboard-floating-robot-laser-scan absolute h-[120%] w-[120%] rounded-full"
              />
            )}
          </div>
        )}
        <button
          type="button"
          aria-label="Robot Face widget actions"
          ref={(node) => onRegisterWidgetMenuButton(widget.id, node)}
          className="absolute right-1 top-1 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] text-[var(--ether-on-surface)] opacity-0 shadow-[var(--ether-glass-shadow)] backdrop-blur-[var(--ether-glass-blur)] transition hover:bg-[var(--ether-control-hover)] focus-visible:opacity-100 group-hover/floating-robot:opacity-100"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleWidgetMenu(widget.id);
          }}
        >
          <MoreHorizontal size={18} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Resize floating robot"
          data-testid="dashboard-floating-robot-resize-handle"
          className="absolute bottom-1 right-1 z-40 flex h-9 w-9 cursor-nwse-resize items-end justify-end rounded-full p-1.5 opacity-0 outline-none transition group-hover/floating-robot:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--dashboard-accent)]/35"
          style={{ touchAction: "none" }}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerEnd}
          onPointerCancel={handleResizePointerEnd}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <span
            aria-hidden
            className="block h-5 w-5 rounded-br-[0.9rem] border-b-2 border-r-2 border-[var(--ether-on-surface)]/35 shadow-[0_0_12px_color-mix(in_srgb,var(--dashboard-accent)_18%,transparent)] transition group-hover/floating-robot:border-[var(--dashboard-accent)]/65"
          />
        </button>
        <DashboardWidgetFrameContext.Provider value={frameInfo}>
          <React.Suspense fallback={null}>
            <FloatingRobotFaceWidget widget={widget} faceSlot={faceSlot} noGlow />
          </React.Suspense>
        </DashboardWidgetFrameContext.Provider>
      </div>
    </div>
  );
};
