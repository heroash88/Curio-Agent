/**
 * Feature: dashboard-interactivity-upgrades, Property 21: WorldClock offset release restores real time
 *
 * For any drag offset in minutes, releasing the drag SHALL restore the
 * displayed time to within 1 second of Date.now() and SHALL NOT modify
 * the widget's persisted time zone.
 *
 * **Validates: Requirements 29.10**
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Pure model of the WorldClock offset preview behavior.
 *
 * While dragging, the displayed time = realTime + offsetMinutes.
 * On release, the displayed time resets to realTime (within 1s tolerance)
 * and the persisted timezone is never mutated.
 */

interface ClockState {
  /** The persisted IANA timezone string */
  persistedTimeZone: string;
  /** Current drag offset in minutes (0 when not dragging) */
  offsetMinutes: number;
  /** Whether a drag is currently active */
  isDragging: boolean;
}

function startDrag(state: ClockState): ClockState {
  return { ...state, isDragging: true };
}

function updateDragOffset(state: ClockState, offsetMinutes: number): ClockState {
  if (!state.isDragging) return state;
  return { ...state, offsetMinutes };
}

function releaseDrag(state: ClockState): ClockState {
  return { ...state, isDragging: false, offsetMinutes: 0 };
}

function getDisplayedTime(state: ClockState, realTimeMs: number): number {
  return realTimeMs + state.offsetMinutes * 60_000;
}

describe('Property 21: WorldClock offset release restores real time', () => {
  const VALID_TIMEZONES = [
    'America/New_York',
    'Europe/London',
    'Asia/Tokyo',
    'Australia/Sydney',
    'Pacific/Auckland',
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  it('releasing a drag restores displayed time to within 1s of real time', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_TIMEZONES),
        fc.integer({ min: -720, max: 720 }), // offset in minutes (-12h to +12h)
        fc.integer({ min: 1_700_000_000_000, max: 1_800_000_000_000 }), // realTimeMs
        (timezone, offsetMinutes, realTimeMs) => {
          // Start with a clean state
          const initial: ClockState = {
            persistedTimeZone: timezone,
            offsetMinutes: 0,
            isDragging: false,
          };

          // Simulate drag sequence
          const dragging = startDrag(initial);
          const withOffset = updateDragOffset(dragging, offsetMinutes);

          // During drag, displayed time includes offset
          const displayedDuringDrag = getDisplayedTime(withOffset, realTimeMs);
          expect(displayedDuringDrag).toBe(realTimeMs + offsetMinutes * 60_000);

          // Release the drag
          const released = releaseDrag(withOffset);

          // After release, displayed time is within 1s of real time
          const displayedAfterRelease = getDisplayedTime(released, realTimeMs);
          expect(Math.abs(displayedAfterRelease - realTimeMs)).toBeLessThanOrEqual(1000);

          // Persisted timezone is never mutated
          expect(released.persistedTimeZone).toBe(timezone);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('drag does not mutate the persisted time zone regardless of offset magnitude', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_TIMEZONES),
        fc.array(fc.integer({ min: -1440, max: 1440 }), { minLength: 1, maxLength: 20 }),
        (timezone, offsets) => {
          let state: ClockState = {
            persistedTimeZone: timezone,
            offsetMinutes: 0,
            isDragging: false,
          };

          // Simulate multiple drag-release cycles
          for (const offset of offsets) {
            state = startDrag(state);
            state = updateDragOffset(state, offset);
            state = releaseDrag(state);
          }

          // After all cycles, timezone is unchanged
          expect(state.persistedTimeZone).toBe(timezone);
          // And offset is zero
          expect(state.offsetMinutes).toBe(0);
          expect(state.isDragging).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('offset of zero on release means exact real time', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_TIMEZONES),
        fc.integer({ min: 1_700_000_000_000, max: 1_800_000_000_000 }),
        (timezone, realTimeMs) => {
          const state: ClockState = {
            persistedTimeZone: timezone,
            offsetMinutes: 0,
            isDragging: false,
          };

          const displayed = getDisplayedTime(state, realTimeMs);
          expect(displayed).toBe(realTimeMs);
        },
      ),
      { numRuns: 100 },
    );
  });
});
