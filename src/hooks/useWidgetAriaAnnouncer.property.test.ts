/**
 * Feature: dashboard-interactivity-upgrades, Property 20: aria-live coalescing window
 *
 * Validates: Requirement 26.6
 *
 * For any stream of announcement events for a given widget id, the
 * `useWidgetAriaAnnouncer` coalescer SHALL emit at most one
 * announcement per 2000 ms for that widget id.
 *
 * This test exercises the underlying pure helper `announceText` by
 * simulating an event timeline with manually-advanced `nowMs`. The
 * React hook wraps this helper, so proving the property over the
 * helper is sufficient (design §Event Bus Contracts: "Pure module-level
 * map of `widgetId → lastAnnouncedAtMs`").
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  announceText,
  DEFAULT_ARIA_ANNOUNCER_COALESCE_WINDOW_MS,
} from './useWidgetAriaAnnouncer';

interface TimelineEvent {
  text: string;
  deltaMs: number;
}

const eventArb: fc.Arbitrary<TimelineEvent> = fc.record({
  text: fc.string({ minLength: 1, maxLength: 12, unit: 'grapheme-ascii' }),
  deltaMs: fc.integer({ min: 0, max: 4000 }),
});

const timelineArb = fc.array(eventArb, { minLength: 0, maxLength: 40 });

interface Emission {
  at: number;
  text: string;
}

/**
 * Replay a timeline through `announceText` and collect the timestamps
 * where a fresh announcement was emitted.
 */
const replay = (
  widgetId: string,
  events: TimelineEvent[],
  coalesceWindowMs: number,
): Emission[] => {
  const emissions: Emission[] = [];
  let nowMs = 0;
  let lastAnnouncedAtMs: number | null = null;

  for (const event of events) {
    nowMs += event.deltaMs;
    const result = announceText({
      widgetId,
      incomingText: event.text,
      nowMs,
      coalesceWindowMs,
      lastAnnouncedAtMs,
    });
    if (result.announced) {
      emissions.push({ at: nowMs, text: result.text });
      lastAnnouncedAtMs = result.nextLastAnnouncedAtMs;
    }
  }

  return emissions;
};

describe('useWidgetAriaAnnouncer — Property 20: aria-live coalescing window', () => {
  it('emits at most one announcement per coalesce window for a given widget id', () => {
    fc.assert(
      fc.property(timelineArb, (events) => {
        const coalesceWindowMs = DEFAULT_ARIA_ANNOUNCER_COALESCE_WINDOW_MS;
        const emissions = replay('widget-a', events, coalesceWindowMs);

        for (let i = 1; i < emissions.length; i += 1) {
          const gap = emissions[i].at - emissions[i - 1].at;
          // The gap between any two consecutive emissions SHALL be at
          // least `coalesceWindowMs`. This equivalently guarantees "at
          // most one announcement per 2000 ms window".
          expect(gap).toBeGreaterThanOrEqual(coalesceWindowMs);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('for any sliding window of size 2000ms, at most one emission falls within it', () => {
    fc.assert(
      fc.property(timelineArb, (events) => {
        const coalesceWindowMs = DEFAULT_ARIA_ANNOUNCER_COALESCE_WINDOW_MS;
        const emissions = replay('widget-b', events, coalesceWindowMs);

        // Pairwise check: no two emissions strictly closer than
        // `coalesceWindowMs` exist.
        for (let i = 0; i < emissions.length; i += 1) {
          for (let j = i + 1; j < emissions.length; j += 1) {
            const gap = emissions[j].at - emissions[i].at;
            if (gap < coalesceWindowMs) {
              throw new Error(
                `Found two emissions within ${coalesceWindowMs}ms (gap=${gap})`,
              );
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('suppresses empty / null / undefined incoming text without resetting the window', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 4000 }),
        (baseTs, delta) => {
          // Prime a prior announcement.
          const primed = announceText({
            widgetId: 'widget-c',
            incomingText: 'hello',
            nowMs: baseTs,
            coalesceWindowMs: DEFAULT_ARIA_ANNOUNCER_COALESCE_WINDOW_MS,
            lastAnnouncedAtMs: null,
          });
          expect(primed.announced).toBe(true);
          expect(primed.nextLastAnnouncedAtMs).toBe(baseTs);

          // An empty incoming text must not advance the timestamp.
          const suppressed = announceText({
            widgetId: 'widget-c',
            incomingText: '',
            nowMs: baseTs + delta,
            coalesceWindowMs: DEFAULT_ARIA_ANNOUNCER_COALESCE_WINDOW_MS,
            lastAnnouncedAtMs: primed.nextLastAnnouncedAtMs,
          });
          expect(suppressed.announced).toBe(false);
          expect(suppressed.nextLastAnnouncedAtMs).toBe(baseTs);
        },
      ),
      { numRuns: 100 },
    );
  });
});
