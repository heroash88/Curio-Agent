import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

/**
 * `useListKeyboardNav`
 *
 * Shared keyboard contract for list-widget rows (Tasks, Reminders,
 * Chores, Bookmarks, etc. — design Requirement 28). The hook owns the
 * focused-row index and exposes an `onKeyDown` handler to attach to
 * the list container.
 *
 * Contract:
 *   - `ArrowUp` / `ArrowDown` move `focusedIndex` within
 *     `[0, count - 1]` and `preventDefault()` so page scroll does not
 *     happen.
 *   - `Enter` calls `onActivate?.(focusedIndex)`.
 *   - `Backspace` calls `onDelete?.(focusedIndex)`.
 *   - `Escape` is intentionally a no-op at the list level — the
 *     inline editor inside the row owns Escape cancellation.
 *   - `focusedIndex` is clamped whenever `count` shrinks below it.
 *   - `enabled === false` collapses the handler to a no-op and
 *     returns a frozen `focusedIndex` of `0`.
 *
 * SSR: pure state + callbacks; no `window` access.
 */

export interface UseListKeyboardNavOptions {
  /** Number of items. */
  count: number;
  /** Called when the user activates a row via Enter. */
  onActivate?: (index: number) => void;
  /** Called when the user deletes a row via Backspace. */
  onDelete?: (index: number) => void;
  /** Initial index. Default 0. */
  initialIndex?: number;
  /** When false, handlers are no-ops. */
  enabled?: boolean;
}

export interface ListKeyboardNavBindings {
  focusedIndex: number;
  setFocusedIndex: (index: number) => void;
  onKeyDown: (event: ReactKeyboardEvent) => void;
}

const clampIndex = (index: number, count: number): number => {
  if (count <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  const int = Math.trunc(index);
  if (int < 0) return 0;
  if (int > count - 1) return count - 1;
  return int;
};

export function useListKeyboardNav(
  options: UseListKeyboardNavOptions,
): ListKeyboardNavBindings {
  const enabled = options.enabled !== false;
  const count = Math.max(0, Math.trunc(options.count) || 0);
  const initialIndex = clampIndex(options.initialIndex ?? 0, count);

  const [focusedIndex, setFocusedIndexState] = useState<number>(initialIndex);

  // Ref-mirror the live state so handlers stay stable and read the
  // latest index without subscribing to re-renders.
  const focusedIndexRef = useRef<number>(focusedIndex);
  focusedIndexRef.current = focusedIndex;

  const onActivateRef = useRef(options.onActivate);
  onActivateRef.current = options.onActivate;
  const onDeleteRef = useRef(options.onDelete);
  onDeleteRef.current = options.onDelete;

  // Re-clamp whenever `count` changes so we never point past the end.
  useEffect(() => {
    setFocusedIndexState((prev) => clampIndex(prev, count));
  }, [count]);

  const setFocusedIndex = useCallback(
    (index: number) => {
      const next = clampIndex(index, count);
      focusedIndexRef.current = next;
      setFocusedIndexState(next);
    },
    [count],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (!enabled) return;
      if (count <= 0) return;

      const key = event.key;
      const current = focusedIndexRef.current;

      if (key === 'ArrowDown') {
        event.preventDefault();
        const nextIndex = Math.min(count - 1, current + 1);
        if (nextIndex !== current) setFocusedIndex(nextIndex);
        return;
      }

      if (key === 'ArrowUp') {
        event.preventDefault();
        const nextIndex = Math.max(0, current - 1);
        if (nextIndex !== current) setFocusedIndex(nextIndex);
        return;
      }

      if (key === 'Home') {
        event.preventDefault();
        if (current !== 0) setFocusedIndex(0);
        return;
      }

      if (key === 'End') {
        event.preventDefault();
        const last = count - 1;
        if (current !== last) setFocusedIndex(last);
        return;
      }

      if (key === 'Enter') {
        // Let the default activation happen too, but surface the
        // callback for list-level handling.
        const fn = onActivateRef.current;
        if (typeof fn === 'function') {
          try {
            fn(current);
          } catch {
            // Caller errors must not break keyboard navigation.
          }
        }
        return;
      }

      if (key === 'Backspace' || key === 'Delete') {
        const fn = onDeleteRef.current;
        if (typeof fn === 'function') {
          event.preventDefault();
          try {
            fn(current);
          } catch {
            // Ditto.
          }
        }
        return;
      }

      // Escape is intentionally not handled at the list level — the
      // inline editor inside the row (if any) owns its own cancel
      // semantics.
    },
    [enabled, count, setFocusedIndex],
  );

  const noop = useCallback(() => {}, []);

  return useMemo<ListKeyboardNavBindings>(
    () => ({
      focusedIndex: enabled ? focusedIndex : 0,
      setFocusedIndex: enabled ? setFocusedIndex : noop,
      onKeyDown: enabled ? handleKeyDown : noop,
    }),
    [enabled, focusedIndex, setFocusedIndex, handleKeyDown, noop],
  );
}
