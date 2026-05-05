import { useCallback, useMemo } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

import {
  useSwipeGesture,
  type SwipeGestureHandlers,
} from './useSwipeGesture';
import { useMotionProfile, type MotionProfile } from './useMotionProfile';

/**
 * `useSwipeableRowActions`
 *
 * Small composition helper used by row-level editors (Tasks, Reminders,
 * Alerts / NotificationsCenter) to wire the three sibling concerns that
 * always travel together for dashboard Requirement 6:
 *
 *   1. Horizontal swipe gesture via `useSwipeGesture`.
 *   2. Keyboard equivalents on the same row element (`Shift+Enter`
 *      commits the "primary" action, `Backspace` commits the "secondary"
 *      action).
 *   3. A motion-aware transform + proportional accent wash the row can
 *      render as the user swipes.
 *
 * The hook is intentionally framework-light:
 *
 *   - It returns a single `rowProps` object ready to spread on the row's
 *     outer element.
 *   - It returns a `visuals` object with the numeric transform and the
 *     recommended wash opacity/background so widgets can style the row
 *     with their own accent classes without importing the motion hook
 *     separately.
 *   - When `enabled === false`, every handler is a no-op, the row does
 *     not declare pointer event handlers at all (so click/tap remains
 *     untouched), and only the keyboard equivalents stay active. That
 *     mirrors the "fine-pointer users still get keyboard" rule from
 *     Requirement 6.7 and the "when disabled, rows behave as before"
 *     note in the tasks file.
 *
 * Keyboard policy:
 *   - `onKeyDown` intercepts `Shift+Enter` and `Backspace` only. Every
 *     other key (including plain `Enter`) is left alone so existing row
 *     behaviour (open editor, toggle complete, etc.) keeps working.
 *   - Both commit keys call `preventDefault()` to avoid the browser
 *     navigating back on `Backspace` or submitting a parent form on
 *     `Shift+Enter`.
 *
 * Commit policy:
 *   - Swipe commit threshold defaults to 0.4 (40% of row width per
 *     Requirement 6.3). Consumers can override via `commitThreshold`.
 *   - A swipe that commits swallows the click on the current pointer,
 *     but since the row body's `onClick` fires off a separate pointer
 *     capture, we simply run the commit action from here; widgets do not
 *     need to special-case it.
 */

export interface SwipeableRowVisuals {
  /**
   * Horizontal translation in pixels to apply to the row while
   * swiping. `0` when no swipe is in progress.
   */
  translateX: number;
  /**
   * Opacity of the accent wash overlay in `[0, 1]`. Consumers render
   * the wash behind their row content and tint it based on the swipe
   * direction.
   */
  washOpacity: number;
  /**
   * `1` for a right-committing swipe (primary), `-1` for a
   * left-committing swipe (secondary), `0` otherwise. Widgets pick the
   * accent colour to render (success vs. danger) from this sign.
   */
  direction: -1 | 0 | 1;
  /** True while the row is actively being swiped past the hysteresis. */
  isSwiping: boolean;
  /** Normalized progress in `[-1, 1]`. */
  progress: number;
  /** Current motion profile (for consumers that need the `mode`). */
  motionProfile: MotionProfile;
  /** `true` once the row has crossed the commit threshold. */
  isPastCommitThreshold: boolean;
}

export interface SwipeableRowProps {
  onPointerDown?: (event: ReactPointerEvent) => void;
  onPointerMove?: (event: ReactPointerEvent) => void;
  onPointerUp?: (event: ReactPointerEvent) => void;
  onPointerCancel?: (event: ReactPointerEvent) => void;
  onKeyDown: (event: ReactKeyboardEvent) => void;
  /** Matches CSS `touch-action: pan-y` so vertical scrolling is preserved. */
  style: { touchAction: 'pan-y' };
}

export interface UseSwipeableRowActionsOptions {
  /**
   * Commits when the user swipes right past the threshold OR presses
   * `Shift+Enter` on the focused row. Typically "complete",
   * "acknowledge", or "mark read".
   */
  onPrimaryCommit: () => void;
  /**
   * Commits when the user swipes left past the threshold OR presses
   * `Backspace` on the focused row. Typically "snooze", "archive", or
   * "delete".
   */
  onSecondaryCommit: () => void;
  /**
   * When `false`, swipe handlers collapse to no-ops (pointer events
   * stay with the row's own handlers) but the keyboard equivalents
   * still fire. This matches Requirement 6.5 and 6.7.
   */
  swipeEnabled: boolean;
  /** Swipe commit threshold. Defaults to 0.4. */
  commitThreshold?: number;
}

export interface UseSwipeableRowActionsResult {
  rowProps: SwipeableRowProps;
  visuals: SwipeableRowVisuals;
}

const DEFAULT_COMMIT_THRESHOLD = 0.4;
const MAX_WASH_OPACITY = 0.45;

export function useSwipeableRowActions(
  options: UseSwipeableRowActionsOptions,
): UseSwipeableRowActionsResult {
  const {
    onPrimaryCommit,
    onSecondaryCommit,
    swipeEnabled,
    commitThreshold = DEFAULT_COMMIT_THRESHOLD,
  } = options;

  const motionProfile = useMotionProfile();

  const swipe = useSwipeGesture({
    enabled: swipeEnabled,
    commitThreshold,
    onSwipeRight: onPrimaryCommit,
    onSwipeLeft: onSecondaryCommit,
  });

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        onPrimaryCommit();
        return;
      }
      if (event.key === 'Backspace') {
        // Only fire when focus is on the row itself, not on a
        // nested input/editor where Backspace deletes text.
        const target = event.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            (target as HTMLElement).isContentEditable)
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onSecondaryCommit();
      }
    },
    [onPrimaryCommit, onSecondaryCommit],
  );

  const visuals = useMemo<SwipeableRowVisuals>(() => {
    // Under reduced motion / `mode === 'off'`, we still show a wash
    // hint (linear, no spring) so users on touch devices can see the
    // gesture register. The magnitude stays the same; what changes is
    // that the parent does not animate back to rest with a spring.
    const progress = swipe.progress;
    const direction: -1 | 0 | 1 = progress > 0 ? 1 : progress < 0 ? -1 : 0;
    const washOpacity = Math.min(Math.abs(progress), 1) * MAX_WASH_OPACITY;
    return {
      translateX: swipeEnabled ? swipe.deltaX : 0,
      washOpacity: swipeEnabled ? washOpacity : 0,
      direction: swipeEnabled ? direction : 0,
      isSwiping: swipeEnabled && swipe.isSwiping,
      progress: swipeEnabled ? progress : 0,
      motionProfile,
      isPastCommitThreshold:
        swipeEnabled && Math.abs(progress) >= commitThreshold,
    };
  }, [
    commitThreshold,
    motionProfile,
    swipe.deltaX,
    swipe.isSwiping,
    swipe.progress,
    swipeEnabled,
  ]);

  const rowProps = useMemo<SwipeableRowProps>(() => {
    const base: SwipeableRowProps = {
      onKeyDown: handleKeyDown,
      style: { touchAction: 'pan-y' },
    };
    if (!swipeEnabled) {
      return base;
    }
    return {
      ...base,
      ...(swipe.handlers as SwipeGestureHandlers),
    };
  }, [handleKeyDown, swipe.handlers, swipeEnabled]);

  return { rowProps, visuals };
}
