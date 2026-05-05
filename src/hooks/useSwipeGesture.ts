import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

/**
 * `useSwipeGesture`
 *
 * Pointer-based horizontal swipe primitive used by row-level editors
 * (Tasks, Reminders, NotificationsCenter). Design pillars:
 *
 *   - Only promote to a swipe after the pointer crosses
 *     `hysteresisPx` horizontally AND the horizontal delta dominates
 *     the vertical delta — vertical scroll still works.
 *   - On release, commit when `|progress| >= commitThreshold` and the
 *     matching `onSwipeLeft`/`onSwipeRight` callback is defined.
 *     Otherwise spring back (state simply clears).
 *   - `enabled === false` collapses the hook to a set of no-op
 *     handlers with `progress === 0` and `isSwiping === false`. This
 *     mirrors how the other direct-manipulation hooks gate on their
 *     toggle.
 *
 * SSR: pointer events are React synthetic events; no `window` access
 * at module scope. Every state mutation path is safe under SSR.
 */

export interface SwipeGestureHandlers {
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onPointerCancel: (event: ReactPointerEvent) => void;
}

export interface UseSwipeGestureOptions {
  /** Commit threshold as a fraction of the row width. Default 0.4. */
  commitThreshold?: number;
  /** Horizontal hysteresis before capture. Default 6px. */
  hysteresisPx?: number;
  /** Called when the user commits a right-swipe. */
  onSwipeRight?: () => void;
  /** Called when the user commits a left-swipe. */
  onSwipeLeft?: () => void;
  /** When false, all handlers are no-ops. */
  enabled?: boolean;
}

export interface UseSwipeGestureResult {
  handlers: SwipeGestureHandlers;
  /** Current normalized X delta in [-1, 1] while dragging. */
  progress: number;
  /** Raw pixel delta while dragging. */
  deltaX: number;
  isSwiping: boolean;
}

const DEFAULT_COMMIT_THRESHOLD = 0.4;
const DEFAULT_HYSTERESIS_PX = 6;

interface ActiveGesture {
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
  /** True once the gesture has been promoted to a horizontal swipe. */
  promoted: boolean;
}

const NOOP_HANDLERS: SwipeGestureHandlers = {
  onPointerDown: () => {},
  onPointerMove: () => {},
  onPointerUp: () => {},
  onPointerCancel: () => {},
};

const clampProgress = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
};

export function useSwipeGesture(
  options: UseSwipeGestureOptions,
): UseSwipeGestureResult {
  const enabled = options.enabled !== false;
  const commitThreshold = Math.max(
    0,
    options.commitThreshold ?? DEFAULT_COMMIT_THRESHOLD,
  );
  const hysteresisPx = Math.max(
    0,
    options.hysteresisPx ?? DEFAULT_HYSTERESIS_PX,
  );

  // Ref-held latest callbacks so handlers stay stable across renders.
  const callbacksRef = useRef<
    Pick<UseSwipeGestureOptions, 'onSwipeLeft' | 'onSwipeRight'>
  >({
    onSwipeLeft: options.onSwipeLeft,
    onSwipeRight: options.onSwipeRight,
  });
  callbacksRef.current = {
    onSwipeLeft: options.onSwipeLeft,
    onSwipeRight: options.onSwipeRight,
  };

  const gestureRef = useRef<ActiveGesture | null>(null);
  const [deltaX, setDeltaX] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const reset = useCallback(() => {
    gestureRef.current = null;
    setDeltaX(0);
    setProgress(0);
    setIsSwiping(false);
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (!enabled) return;
      if (event.button !== undefined && event.button !== 0) return;

      const target = event.currentTarget as HTMLElement | null;
      let width = 0;
      if (target && typeof target.getBoundingClientRect === 'function') {
        const rect = target.getBoundingClientRect();
        width = rect.width || 0;
      }
      // Guard against zero-width rows: clamp to 1 so divisions stay
      // finite. Consumers with truly zero-width rows will never cross
      // `hysteresisPx` anyway.
      width = width > 0 ? width : 1;

      gestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        width,
        promoted: false,
      };
      setDeltaX(0);
      setProgress(0);
      setIsSwiping(false);
    },
    [enabled],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (!enabled) return;
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;

      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;

      if (!gesture.promoted) {
        // Require both enough horizontal travel and horizontal
        // dominance to promote. Otherwise assume the user is scrolling
        // vertically and bail out of this gesture entirely.
        if (Math.abs(dx) < hysteresisPx) {
          return;
        }
        if (Math.abs(dx) <= Math.abs(dy)) {
          // Vertical dominated — drop the gesture; further moves are
          // ignored until the next pointerdown.
          gestureRef.current = null;
          return;
        }
        gesture.promoted = true;
        // Capture the pointer so moves outside the row's bounds still
        // reach us. Ignore capture errors in environments that do not
        // support `setPointerCapture`.
        const target = event.currentTarget as HTMLElement | null;
        try {
          if (target && typeof target.setPointerCapture === 'function') {
            target.setPointerCapture(event.pointerId);
          }
        } catch {
          // Ignore — gesture still works without explicit capture.
        }
        setIsSwiping(true);
      }

      const nextDelta = dx;
      setDeltaX(nextDelta);
      setProgress(clampProgress(nextDelta / gesture.width));
    },
    [enabled, hysteresisPx],
  );

  const finish = useCallback(
    (event: ReactPointerEvent, committed: boolean) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;

      if (committed && gesture.promoted) {
        const finalDelta = event.clientX - gesture.startX;
        const finalProgress = clampProgress(finalDelta / gesture.width);
        const { onSwipeLeft, onSwipeRight } = callbacksRef.current;
        if (
          finalProgress >= commitThreshold &&
          typeof onSwipeRight === 'function'
        ) {
          try {
            onSwipeRight();
          } catch {
            // Surface no error to the pointer pipeline.
          }
        } else if (
          finalProgress <= -commitThreshold &&
          typeof onSwipeLeft === 'function'
        ) {
          try {
            onSwipeLeft();
          } catch {
            // Surface no error to the pointer pipeline.
          }
        }
      }

      // Release the pointer capture if we acquired it.
      const target = event.currentTarget as HTMLElement | null;
      try {
        if (
          target &&
          typeof target.releasePointerCapture === 'function' &&
          typeof target.hasPointerCapture === 'function' &&
          target.hasPointerCapture(event.pointerId)
        ) {
          target.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignore release errors.
      }

      reset();
    },
    [commitThreshold, reset],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent) => {
      if (!enabled) return;
      finish(event, true);
    },
    [enabled, finish],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent) => {
      if (!enabled) return;
      // Cancelled gestures never commit a swipe.
      finish(event, false);
    },
    [enabled, finish],
  );

  const handlers = useMemo<SwipeGestureHandlers>(() => {
    if (!enabled) return NOOP_HANDLERS;
    return {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    };
  }, [
    enabled,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  ]);

  return useMemo(
    () => ({
      handlers,
      progress: enabled ? progress : 0,
      deltaX: enabled ? deltaX : 0,
      isSwiping: enabled ? isSwiping : false,
    }),
    [handlers, enabled, progress, deltaX, isSwiping],
  );
}
