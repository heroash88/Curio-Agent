/**
 * Feature: dashboard-interactivity-upgrades, Property 16: Sheen never renders during first-load
 *
 * Validates: Requirement 22.5
 *
 * For any combination of `(isFirstLoad, isRefreshing, sheenEnabled,
 * motionProfile)`, `shouldRenderSheen(...) === true` implies
 * `isFirstLoad === false`. The stale-while-revalidate sheen must never
 * paint while the widget is still showing its first-load placeholder.
 *
 * Secondary invariant: the function is a total boolean classifier —
 * the result is always `true` or `false`, never `undefined` or `null`.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { shouldRenderSheen } from './dashboardRefresh';

describe('shouldRenderSheen — Property 16: Sheen never renders during first-load', () => {
  it('result === true implies isFirstLoad === false across the full (4-boolean) input space', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (isFirstLoad, isRefreshing, sheenEnabled, shouldAnimate) => {
          const result = shouldRenderSheen({
            isFirstLoad,
            isRefreshing,
            sheenEnabled,
            motionProfile: { shouldAnimate },
          });

          if (result === true) {
            expect(isFirstLoad).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('always returns a boolean — never undefined or null', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (isFirstLoad, isRefreshing, sheenEnabled, shouldAnimate) => {
          const result = shouldRenderSheen({
            isFirstLoad,
            isRefreshing,
            sheenEnabled,
            motionProfile: { shouldAnimate },
          });

          expect(typeof result).toBe('boolean');
        },
      ),
      { numRuns: 200 },
    );
  });
});
