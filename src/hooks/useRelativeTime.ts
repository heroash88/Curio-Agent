import { useEffect, useState } from 'react';

/**
 * `useRelativeTime(timestamp)` returns a short human-readable label
 * describing how long ago `timestamp` was. The hook schedules a re-
 * render on an interval matching the label resolution so that the
 * rendered string tracks wall-clock time without the caller having to
 * manage timers (Requirement 4).
 *
 * Label rules (computed via {@link formatRelativeTime}):
 *
 *   - `timestamp` is `null`, `undefined`, or not finite → `'—'`.
 *   - `age < 5s`            → `'just now'`.
 *   - `age < 60s`           → `'{sec}s ago'`.
 *   - `age < 60m`           → `'{min}m ago'`.
 *   - `age < 24h`           → `'{hr}h ago'`.
 *   - `age >= 24h`          → `'{days}d ago'`.
 *   - Negative ages (future timestamps from clock skew) are clamped to
 *     `'just now'` so minor drift does not produce confusing output.
 *
 * The hook does not schedule any timer when `timestamp` is nullish/
 * non-finite; it simply returns `'—'` (Requirement 4.5).
 */

/** Placeholder shown when the source timestamp is unknown. */
export const RELATIVE_TIME_PLACEHOLDER = '—';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const JUST_NOW_THRESHOLD_MS = 5 * SECOND_MS;

/** Tick interval used while the label is in the seconds bucket. */
export const RELATIVE_TIME_SECOND_TICK_MS = 10 * SECOND_MS;
/** Tick interval used while the label is in the minutes bucket. */
export const RELATIVE_TIME_MINUTE_TICK_MS = 30 * SECOND_MS;
/** Tick interval used while the label is in the hours-or-longer bucket. */
export const RELATIVE_TIME_COARSE_TICK_MS = 5 * MINUTE_MS;

export interface RelativeTimeResult {
  /** Human-readable label: "just now" | "12s ago" | "4m ago" | "2h ago" | "1d ago" | "—". */
  label: string;
}

const isFiniteTimestamp = (
  value: number | null | undefined,
): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Pure helper used by {@link useRelativeTime} and by the property test.
 *
 * `now` defaults to `Date.now()` so tests can pin the clock and the
 * hook can re-use the helper without a second time source.
 */
export function formatRelativeTime(
  timestamp: number | null | undefined,
  now: number = Date.now(),
): string {
  if (!isFiniteTimestamp(timestamp)) {
    return RELATIVE_TIME_PLACEHOLDER;
  }

  const age = now - timestamp;
  if (age < JUST_NOW_THRESHOLD_MS) {
    // Clock skew (future timestamps) or very recent values both fall
    // into the "just now" bucket.
    return 'just now';
  }

  if (age < MINUTE_MS) {
    const seconds = Math.floor(age / SECOND_MS);
    return `${seconds}s ago`;
  }

  if (age < HOUR_MS) {
    const minutes = Math.floor(age / MINUTE_MS);
    return `${minutes}m ago`;
  }

  if (age < DAY_MS) {
    const hours = Math.floor(age / HOUR_MS);
    return `${hours}h ago`;
  }

  const days = Math.floor(age / DAY_MS);
  return `${days}d ago`;
}

/**
 * Pick the re-render interval that matches the current label's
 * resolution. This keeps render work low for labels that only update
 * every few minutes and responsive for labels that flip every few
 * seconds.
 */
const pickTickIntervalMs = (
  timestamp: number | null | undefined,
  now: number,
): number => {
  if (!isFiniteTimestamp(timestamp)) return 0;
  const age = Math.max(0, now - timestamp);
  if (age < MINUTE_MS) return RELATIVE_TIME_SECOND_TICK_MS;
  if (age < HOUR_MS) return RELATIVE_TIME_MINUTE_TICK_MS;
  return RELATIVE_TIME_COARSE_TICK_MS;
};

/**
 * React hook returning the relative-time label for `timestamp`. The
 * returned string is re-derived from the latest wall-clock time on
 * every re-render; a `setInterval` is scheduled so the rendered value
 * keeps up with the label's resolution.
 *
 * When `timestamp` is nullish or non-finite, the hook returns the
 * placeholder `'—'` and schedules no timer (Requirement 4.5).
 */
export function useRelativeTime(
  timestamp: number | null | undefined,
): string {
  // The tick signal forces a re-render when the interval fires; we
  // compute the label from `Date.now()` on every render so the hook
  // does not need to stash the formatted string in state.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!isFiniteTimestamp(timestamp)) {
      return undefined;
    }
    if (typeof window === 'undefined') {
      return undefined;
    }

    const intervalMs = pickTickIntervalMs(timestamp, Date.now());
    if (intervalMs <= 0) return undefined;

    const id = window.setInterval(() => {
      setTick((prev) => (prev + 1) % Number.MAX_SAFE_INTEGER);
    }, intervalMs);

    return () => {
      window.clearInterval(id);
    };
    // Re-schedule whenever the reference timestamp changes or moves
    // between buckets on the next render; `timestamp` is the only
    // relevant input — `Date.now()` is read inside the interval body.
  }, [timestamp]);

  return formatRelativeTime(timestamp);
}
