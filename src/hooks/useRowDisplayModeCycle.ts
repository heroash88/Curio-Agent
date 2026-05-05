import { useCallback } from 'react';
import { useWidgetPersistentState } from './useWidgetPersistentState';

/**
 * Row display modes for Stocks and Portfolio widgets.
 * Cycling order: value -> percent -> dayChange -> value ...
 */
export type RowDisplayMode = 'value' | 'percent' | 'dayChange';

const MODES: readonly RowDisplayMode[] = ['value', 'percent', 'dayChange'] as const;

const isRowDisplayMode = (value: unknown): value is RowDisplayMode =>
  value === 'value' || value === 'percent' || value === 'dayChange';

/**
 * Cycle to the next display mode given the current mode.
 * Pure function: `MODES[(indexOf(current) + 1) % 3]`.
 */
export function nextRowDisplayMode(current: RowDisplayMode): RowDisplayMode {
  const index = MODES.indexOf(current);
  return MODES[(index + 1) % MODES.length];
}

/**
 * Hook that persists a per-widget row display mode and exposes a cycle function.
 *
 * Uses `useWidgetPersistentState` so the mode survives reloads and remounts.
 *
 * Property 22: For any non-negative number of taps n, the persisted display
 * mode equals MODES[n % 3].
 */
export function useRowDisplayModeCycle(widgetId: string): {
  mode: RowDisplayMode;
  cycle: () => void;
} {
  const [stored, setStored] = useWidgetPersistentState<RowDisplayMode>(
    widgetId,
    'rowDisplayMode',
    'value',
  );

  // Normalize in case stored value is corrupted
  const mode: RowDisplayMode = isRowDisplayMode(stored) ? stored : 'value';

  const cycle = useCallback(() => {
    setStored((prev) => {
      const safe = isRowDisplayMode(prev) ? prev : 'value';
      return nextRowDisplayMode(safe);
    });
  }, [setStored]);

  return { mode, cycle };
}
