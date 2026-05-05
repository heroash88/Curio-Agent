import { useMemo, useSyncExternalStore } from 'react';
import {
  useDashboardInteractivitySettings,
  useDashboardPreferences,
} from '../utils/settings/dashboardSettings';
import type { DashboardAnimationIntensity } from '../services/dashboardTypes';

/**
 * Resolved motion mode. `off` disables all motion, `subtle` runs short
 * (<=200ms) duration-only animations, and `full` runs the complete
 * animation.
 */
export type MotionMode = 'off' | 'subtle' | 'full';

/**
 * A resolved motion profile that any widget can consult to scale its
 * animations. Consumers call `durationMs(base)` and `scale(base)` to
 * derive safe values from their desired baseline.
 */
export interface MotionProfile {
  /** The resolved motion mode for the current user/board state. */
  mode: MotionMode;
  /** `false` when `mode === 'off'`, `true` otherwise. */
  shouldAnimate: boolean;
  /**
   * Returns the effective duration for a baseline duration in
   * milliseconds. Zero when `mode === 'off'`, capped at 200ms when
   * `mode === 'subtle'`, pass-through when `mode === 'full'`.
   */
  durationMs: (baseMs: number) => number;
  /**
   * Returns the effective scale multiplier for a baseline scale. `1`
   * (i.e. no scale) when `mode === 'off'` or `mode === 'subtle'`, and
   * the input baseline when `mode === 'full'`.
   */
  scale: (baseScale: number) => number;
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Resolve the effective `MotionMode` from the board-level animation
 * intensity, the OS-level `prefers-reduced-motion` flag, and the
 * board-level reduce-motion preference.
 *
 * Pure, no side effects. Mirrors the design exactly:
 *
 *   - Any of `prefersReducedMotion`, `boardReduceMotion`, or
 *     `intensity === 'off'` collapses to `'off'`.
 *   - Otherwise the intensity value (`'subtle' | 'full'`) is returned
 *     as-is.
 */
export function resolveMotionMode(
  intensity: DashboardAnimationIntensity,
  prefersReducedMotion: boolean,
  boardReduceMotion: boolean,
): MotionMode {
  if (prefersReducedMotion || boardReduceMotion || intensity === 'off') {
    return 'off';
  }
  return intensity;
}

/**
 * Build a `MotionProfile` for a resolved `MotionMode`. Pure: given the
 * same `mode`, the returned object is functionally equivalent (though
 * not referentially identical) across calls.
 */
export function buildMotionProfile(mode: MotionMode): MotionProfile {
  return {
    mode,
    shouldAnimate: mode !== 'off',
    durationMs: (base) => {
      if (mode === 'off') return 0;
      if (mode === 'subtle') return Math.min(base, 200);
      return base;
    },
    scale: (base) => {
      if (mode === 'off' || mode === 'subtle') return 1;
      return base;
    },
  };
}

/**
 * Subscribe to the `(prefers-reduced-motion: reduce)` media query.
 *
 * Returns an unsubscribe function. SSR-safe: when `window` is
 * unavailable, subscription is a no-op.
 */
const subscribeToPrefersReducedMotion = (onChange: () => void): (() => void) => {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return () => {};
  }

  const media = window.matchMedia(REDUCED_MOTION_QUERY);

  // Safari < 14 only supports addListener/removeListener. Prefer
  // addEventListener where available and fall back where it is not.
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }
  if (typeof (media as MediaQueryList).addListener === 'function') {
    (media as MediaQueryList).addListener(onChange);
    return () => (media as MediaQueryList).removeListener(onChange);
  }
  return () => {};
};

/**
 * Read the current `(prefers-reduced-motion: reduce)` value. Returns
 * `false` under SSR (no `window`) or when `matchMedia` is unavailable.
 */
const readPrefersReducedMotion = (): boolean => {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
};

const getServerPrefersReducedMotion = (): boolean => false;

/**
 * Reactive read of the OS-level `prefers-reduced-motion: reduce`
 * preference. Backed by `useSyncExternalStore` so it re-renders
 * consumers exactly when the media query flips.
 */
const usePrefersReducedMotion = (): boolean =>
  useSyncExternalStore(
    subscribeToPrefersReducedMotion,
    readPrefersReducedMotion,
    getServerPrefersReducedMotion,
  );

/**
 * Hook that returns the current dashboard `MotionProfile`.
 *
 * Reads:
 *   - board-level animation intensity from
 *     `useDashboardInteractivitySettings()`,
 *   - board-level reduce-motion toggle from
 *     `useDashboardPreferences()`,
 *   - OS-level `prefers-reduced-motion: reduce` via a
 *     `useSyncExternalStore`-backed media query subscription.
 *
 * The returned object is memoized by
 * `(intensity, boardReduceMotion, prefersReducedMotion)` so consumers
 * can safely compare by identity to decide when to restart
 * animations.
 *
 * SSR: when `window` is unavailable, returns a `full` profile so
 * rendered HTML matches the default motion assumption.
 */
export function useMotionProfile(): MotionProfile {
  const interactivity = useDashboardInteractivitySettings();
  const preferences = useDashboardPreferences();
  const prefersReducedMotion = usePrefersReducedMotion();

  const intensity = interactivity.animationIntensity;
  const boardReduceMotion = preferences.reduceMotion;

  return useMemo(() => {
    if (typeof window === 'undefined') {
      return buildMotionProfile('full');
    }
    const mode = resolveMotionMode(
      intensity,
      prefersReducedMotion,
      boardReduceMotion,
    );
    return buildMotionProfile(mode);
  }, [intensity, boardReduceMotion, prefersReducedMotion]);
}
