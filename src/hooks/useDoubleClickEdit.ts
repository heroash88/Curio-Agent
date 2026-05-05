import {
  useCallback,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

/**
 * `useDoubleClickEdit`
 *
 * Double-click / double-tap entry point into inline edit mode
 * (design Requirement 9). Exposes two handlers:
 *
 *   - `onDoubleClick`: the native mouse/pen double-click path. Fires
 *     `onActivate()` unconditionally.
 *   - `onPointerUp`: a touch-only double-tap detector. Tracks the
 *     timestamp of the last `pointerup` where `pointerType === 'touch'`
 *     and fires `onActivate()` when the subsequent tap arrives within
 *     `doubleTapGapMs`. Resets after firing so three quick taps only
 *     activate once.
 *
 * `enabled === false` collapses both handlers to no-ops.
 *
 * SSR: uses only `Date.now()` and refs; no `window` access at module
 * scope.
 */

export interface UseDoubleClickEditOptions {
  /** Called on double-click / double-tap. */
  onActivate: () => void;
  /** When false, handlers are no-ops. */
  enabled?: boolean;
  /** Touch double-tap max gap ms. Default 320. */
  doubleTapGapMs?: number;
}

export interface DoubleClickEditHandlers {
  onDoubleClick: (event: ReactMouseEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
}

const DEFAULT_DOUBLE_TAP_GAP_MS = 320;

const NOOP_HANDLERS: DoubleClickEditHandlers = {
  onDoubleClick: () => {},
  onPointerUp: () => {},
};

export function useDoubleClickEdit(
  options: UseDoubleClickEditOptions,
): DoubleClickEditHandlers {
  const enabled = options.enabled !== false;
  const doubleTapGapMs = Math.max(
    0,
    options.doubleTapGapMs ?? DEFAULT_DOUBLE_TAP_GAP_MS,
  );

  const onActivateRef = useRef(options.onActivate);
  onActivateRef.current = options.onActivate;

  const lastTapAtRef = useRef<number>(0);

  const activate = useCallback(() => {
    try {
      onActivateRef.current();
    } catch {
      // Don't leak caller errors to the pointer pipeline.
    }
  }, []);

  const handleDoubleClick = useCallback(
    (_event: ReactMouseEvent) => {
      if (!enabled) return;
      // Native double-click fires for mouse/pen pointers; touch goes
      // through the pointerUp path below.
      activate();
    },
    [enabled, activate],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent) => {
      if (!enabled) return;
      if (event.pointerType !== 'touch') return;

      const now = Date.now();
      const last = lastTapAtRef.current;
      if (last > 0 && now - last <= doubleTapGapMs) {
        // Second tap inside window: activate and reset the clock so a
        // third immediate tap doesn't re-fire.
        lastTapAtRef.current = 0;
        activate();
        return;
      }
      lastTapAtRef.current = now;
    },
    [enabled, doubleTapGapMs, activate],
  );

  return useMemo(() => {
    if (!enabled) return NOOP_HANDLERS;
    return {
      onDoubleClick: handleDoubleClick,
      onPointerUp: handlePointerUp,
    };
  }, [enabled, handleDoubleClick, handlePointerUp]);
}
