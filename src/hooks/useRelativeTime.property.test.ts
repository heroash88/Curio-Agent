/**
 * Feature: dashboard-interactivity-upgrades, Property 3: Relative-time monotonicity
 *
 * Validates: Requirement 4.6
 *
 * For any two finite timestamps `t1 <= t2` observed at the same
 * present time `now`, `formatRelativeTime(t1, now)` SHALL produce a
 * string whose implied age is greater than or equal to the age
 * implied by `formatRelativeTime(t2, now)`.
 *
 * The property is exercised against the pure helper
 * {@link formatRelativeTime}; `useRelativeTime` delegates to the same
 * helper (plus a `setInterval` re-render schedule) so proving the
 * property over the helper covers the hook.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { formatRelativeTime } from './useRelativeTime';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Parse a relative-time label into a lower-bound age in milliseconds.
 * The mapping matches the bucketing in {@link formatRelativeTime} so
 * identical labels compare equal and later buckets compare strictly
 * greater than earlier ones.
 *
 *   - `'just now'`        -> 0
 *   - `'{n}s ago'`        -> n * 1000
 *   - `'{n}m ago'`        -> n * 60_000
 *   - `'{n}h ago'`        -> n * 3_600_000
 *   - `'{n}d ago'`        -> n * 86_400_000
 *
 * Throws when the label is unrecognised so malformed output surfaces
 * as a test failure.
 */
export const impliedAgeMs = (label: string): number => {
  if (label === 'just now') return 0;
  const match = /^(\d+)([smhd]) ago$/.exec(label);
  if (!match) {
    throw new Error(`Unrecognised relative-time label: ${label}`);
  }
  const n = Number(match[1]);
  switch (match[2]) {
    case 's':
      return n * SECOND_MS;
    case 'm':
      return n * MINUTE_MS;
    case 'h':
      return n * HOUR_MS;
    case 'd':
      return n * DAY_MS;
    default:
      throw new Error(`Unrecognised unit in label: ${label}`);
  }
};

// Keep the range well within `Number.MAX_SAFE_INTEGER` so arithmetic
// stays exact.
const timestampArb = fc.integer({ min: 0, max: 10 * 365 * DAY_MS });
const nowArb = fc.integer({ min: 0, max: 20 * 365 * DAY_MS });

describe('useRelativeTime — Property 3: Relative-time monotonicity', () => {
  it('for t1 <= t2, age(label(t1)) >= age(label(t2)) at the same now', () => {
    fc.assert(
      fc.property(
        timestampArb,
        timestampArb,
        nowArb,
        (a, b, now) => {
          const t1 = Math.min(a, b);
          const t2 = Math.max(a, b);

          const label1 = formatRelativeTime(t1, now);
          const label2 = formatRelativeTime(t2, now);

          // The "—" placeholder only appears for non-finite inputs, so
          // with finite `t1` and `t2` both labels should be parseable.
          expect(label1).not.toBe('—');
          expect(label2).not.toBe('—');

          const age1 = impliedAgeMs(label1);
          const age2 = impliedAgeMs(label2);

          expect(age1).toBeGreaterThanOrEqual(age2);
        },
      ),
      { numRuns: 100 },
    );
  });
});
