import { act, render } from '@testing-library/react';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import WidgetCounter from './WidgetCounter';
import type { MotionProfile } from '../../../../hooks/useMotionProfile';

/**
 * Feature: dashboard-interactivity-upgrades, Property 1: WidgetCounter settles to final value
 *
 * Validates: Requirements 1.10
 *
 * For any finite sequence of numeric `value` updates passed to
 * `WidgetCounter`, after all animations have completed, the rendered
 * text equals `format(lastFiniteValue)` when the final value is finite,
 * or the configured fallback when the final value is non-finite.
 *
 * This test pins `useMotionProfile` to `offProfile` so updates render
 * synchronously; the settling guarantee is otherwise identical to the
 * animated path because `WidgetCounter` always calls `motionValue.set`
 * with the incoming value on completion.
 */

const offProfile: MotionProfile = {
  mode: 'off',
  shouldAnimate: false,
  durationMs: () => 0,
  scale: () => 1,
};

vi.mock('../../../../hooks/useMotionProfile', () => ({
  useMotionProfile: () => offProfile,
}));

const defaultFormat = (n: number) =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const findLastFinite = (values: number[]): number | undefined => {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(values[i])) return values[i];
  }
  return undefined;
};

describe('WidgetCounter property: settles to final value', () => {
  it('final rendered text equals format(lastFinite) or fallback', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.integer({ min: -1000, max: 1000 }),
            fc.constant(Number.NaN),
            fc.constant(Number.POSITIVE_INFINITY),
            fc.constant(Number.NEGATIVE_INFINITY),
          ),
          { minLength: 1, maxLength: 20 },
        ),
        (updates) => {
          const first = updates[0];
          const { rerender, container, unmount } = render(
            <WidgetCounter value={first} />,
          );
          for (let i = 1; i < updates.length; i += 1) {
            act(() => {
              rerender(<WidgetCounter value={updates[i]} />);
            });
          }

          const rendered =
            container.querySelector('[data-widget-primitive="counter"]')
              ?.textContent ?? '';

          const finalValue = updates[updates.length - 1];
          if (Number.isFinite(finalValue)) {
            expect(rendered).toBe(defaultFormat(finalValue));
          } else {
            // When the final update is non-finite, the primitive short-
            // circuits to the fallback regardless of any prior finite
            // values in the sequence.
            const lastFinite = findLastFinite(updates);
            // Both '—' (default fallback) and the last formatted finite
            // value would satisfy some interpretations, but the primitive
            // renders the fallback when the *current* value is non-finite.
            expect(rendered).toBe('—');
            // Sanity: if there were no finite updates at all, the
            // fallback is the only possible render.
            if (lastFinite === undefined) {
              expect(rendered).toBe('—');
            }
          }

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});
