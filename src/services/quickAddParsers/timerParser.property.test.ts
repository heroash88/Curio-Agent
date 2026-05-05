import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { formatTimerShorthand, parseTimerQuickAdd } from './timerParser';

/**
 * Feature: dashboard-interactivity-upgrades, Property 6: Timer shorthand round-trip
 *
 * Validates: Requirements 7.11
 *
 * For any non-negative millisecond duration `ms` in `[0, 86_400_000]`,
 * `parseTimerQuickAdd(formatTimerShorthand(ms)).durationMs === ms`.
 */
describe('timerParser round-trip', () => {
  it('parse(format(ms)).durationMs === ms for ms in [0, 86_400_000]', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 86_400_000 }), (ms) => {
        const formatted = formatTimerShorthand(ms);
        const parsed = parseTimerQuickAdd(formatted);
        expect('durationMs' in parsed).toBe(true);
        if ('durationMs' in parsed) {
          expect(parsed.durationMs).toBe(ms);
        }
      }),
      { numRuns: 200 },
    );
  });
});
