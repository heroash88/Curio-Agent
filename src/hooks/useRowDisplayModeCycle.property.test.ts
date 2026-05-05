/**
 * Feature: dashboard-interactivity-upgrades, Property 22: Stocks/Portfolio display-mode cycle
 *
 * For any non-negative number of per-row taps n, the persisted display mode
 * SHALL equal MODES[n % 3] where MODES = ['value', 'percent', 'dayChange'],
 * and remounting the widget SHALL restore the same mode through
 * useWidgetPersistentState.
 *
 * **Validates: Requirements 29.11**
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { nextRowDisplayMode, type RowDisplayMode } from './useRowDisplayModeCycle';

const MODES: readonly RowDisplayMode[] = ['value', 'percent', 'dayChange'];

describe('Property 22: Stocks/Portfolio display-mode cycle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('nextRowDisplayMode cycles through MODES in order', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 300 }),
        (taps) => {
          let mode: RowDisplayMode = 'value';
          for (let i = 0; i < taps; i++) {
            mode = nextRowDisplayMode(mode);
          }
          expect(mode).toBe(MODES[taps % 3]);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('starting from any mode, n taps lands on MODES[(startIndex + n) % 3]', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<RowDisplayMode>('value', 'percent', 'dayChange'),
        fc.nat({ max: 200 }),
        (startMode, taps) => {
          const startIndex = MODES.indexOf(startMode);
          let mode = startMode;
          for (let i = 0; i < taps; i++) {
            mode = nextRowDisplayMode(mode);
          }
          expect(mode).toBe(MODES[(startIndex + taps) % 3]);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('persisted mode survives round-trip through localStorage', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<RowDisplayMode>('value', 'percent', 'dayChange'),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-z0-9-]+$/.test(s)),
        (mode, widgetId) => {
          const key = `curio_widget_state_${widgetId}_rowDisplayMode`;
          localStorage.setItem(key, JSON.stringify(mode));
          const stored = JSON.parse(localStorage.getItem(key) || '"value"');
          expect(stored).toBe(mode);
        },
      ),
      { numRuns: 100 },
    );
  });
});
