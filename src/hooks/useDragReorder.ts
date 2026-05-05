import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

/**
 * `useDragReorder(items, onReorder, options)`
 *
 * Pointer + keyboard list-reorder primitive used by list widgets
 * (Tasks, Reminders, Bookmarks, Portfolio, Stocks, Weather Outlook,
 * World Clock). Design pillar: pure core + thin React wrapper so the
 * permutation-preserving property can be proven against
 * {@link reorderArray} directly.
 *
 * Keyboard model (design Requirements 5.2-5.4, 5.7):
 *   - Space / Enter picks up the focused row and announces position.
 *   - Arrow{Up,Down} while picked up moves the row via
 *     {@link reorderArray} and re-announces position.
 *   - Space / Enter again commits (drops) the row.
 *   - Escape cancels: restores the pre-drag list and clears state.
 *
 * Pointer model (design Requirement 5.1):
 *   - `pointerdown` on a row captures the pointer and starts a drag.
 *   - `pointermove` swaps with the row whose mid-Y the pointer has
 *     crossed.
 *   - `pointerup` / `pointercancel` commits the current order or
 *     cancels the drag on cancel.
 *
 * SSR: every subscription is guarded; the hook returns stable no-op
 * bindings under SSR and when `enabled === false`.
 */

export interface UseDragReorderOptions<T> {
  /** Stable key extractor for list items. Required. */
  keyExtractor: (item: T) => string;
  /** Toggle gate — defaults to `true`; when `false`, no-op bindings. */
  enabled?: boolean;
}

export interface DragReorderRowBindings {
  onPointerDown: (event: ReactPointerEvent) => void;
  onKeyDown: (event: ReactKeyboardEvent) => void;
  /** True when this row is the one being picked up. */
  isDragging: boolean;
  /** Accessibility prop to pass through to the row element. */
  'aria-grabbed'?: boolean;
  /** Inline style to apply to the row for visual drag feedback. */
  style?: CSSProperties;
}

export interface UseDragReorderResult<T> {
  /** Returns the bindings for the row at `index`. */
  getRowBindings: (index: number) => DragReorderRowBindings;
  /** Current dragging index, or null. */
  dragIndex: number | null;
  /** Live position announcement for aria-live="polite" readouts. */
  announcement: string;
  /**
   * The items the hook currently exposes. Equal to the last committed
   * `onReorder(next)` argument. Useful when consumers render from this
   * array so intermediate drag steps repaint.
   */
  items: readonly T[];
}

/**
 * Pure reorder: return a new array with the element at `from` moved
 * to `to`. Out-of-range inputs collapse to the identity (no-op) so
 * consumers never end up with shorter lists or duplicated entries
 * (design Property 4).
 *
 * Clamping rules:
 *   - Empty input returns `[]`.
 *   - `from` is clamped into `[0, items.length - 1]`.
 *   - `to` is clamped into `[0, items.length - 1]`.
 *   - If, after clamping, `from === to`, returns a copy of the input.
 *
 * Never throws; never mutates the input.
 */
export function reorderArray<T>(
  items: readonly T[],
  from: number,
  to: number,
): T[] {
  const length = items.length;
  if (length === 0) return [];

  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return items.slice();
  }

  const clampedFrom = Math.min(Math.max(Math.trunc(from), 0), length - 1);
  const clampedTo = Math.min(Math.max(Math.trunc(to), 0), length - 1);

  if (clampedFrom === clampedTo) {
    return items.slice();
  }

  const next = items.slice();
  const [moved] = next.splice(clampedFrom, 1);
  next.splice(clampedTo, 0, moved);
  return next;
}

const EMPTY_BINDINGS: DragReorderRowBindings = {
  onPointerDown: () => {},
  onKeyDown: () => {},
  isDragging: false,
  style: undefined,
};

const formatAnnouncement = (index: number, length: number): string => {
  if (length <= 0) return '';
  const safeIndex = Math.min(Math.max(index, 0), length - 1);
  return `Item at position ${safeIndex + 1} of ${length}`;
};

interface PointerDragState {
  pointerId: number;
  rowHeight: number;
  rowWidth: number;
  anchorX: number;
  anchorY: number;
  /** Number of columns in the grid (1 for single-column lists). */
  columns: number;
  detach: () => void;
}

export function useDragReorder<T>(
  items: readonly T[],
  onReorder: (next: T[]) => void,
  options: UseDragReorderOptions<T>,
): UseDragReorderResult<T> {
  const enabled = options.enabled !== false;
  const keyExtractor = options.keyExtractor;

  // Ref-held latest props so the pointer/keyboard callbacks can stay
  // stable across renders. `items`/`onReorder` change often; we do not
  // want row bindings to churn identity on every list update.
  const itemsRef = useRef<readonly T[]>(items);
  itemsRef.current = items;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState<string>('');
  // Visual translate is tracked via ref + direct DOM style to avoid
  // re-rendering on every pointermove (which causes jitter).
  const dragElementRef = useRef<HTMLElement | null>(null);

  // Stable ref mirror of dragIndex so window-level pointer listeners
  // see the latest value without having to re-subscribe per change.
  const dragIndexRef = useRef<number | null>(null);
  dragIndexRef.current = dragIndex;

  // Pre-drag snapshot, used by Escape / pointercancel to revert.
  const snapshotRef = useRef<readonly T[] | null>(null);
  const pointerDragRef = useRef<PointerDragState | null>(null);

  const commitReorder = useCallback((next: T[], newIndex: number) => {
    onReorderRef.current(next);
    itemsRef.current = next;
    dragIndexRef.current = newIndex;
    setDragIndex(newIndex);
    setAnnouncement(formatAnnouncement(newIndex, next.length));
  }, []);

  const detachPointer = useCallback(() => {
    const drag = pointerDragRef.current;
    if (drag) {
      try {
        drag.detach();
      } catch {
        // Listener teardown must never throw upstream.
      }
    }
    pointerDragRef.current = null;
  }, []);

  const cancelDrag = useCallback(() => {
    detachPointer();
    const snapshot = snapshotRef.current;
    snapshotRef.current = null;
    if (snapshot) {
      onReorderRef.current(snapshot.slice());
      itemsRef.current = snapshot;
    }
    dragIndexRef.current = null;
    setDragIndex(null);
    setAnnouncement('');
  }, [detachPointer]);

  const finishDrag = useCallback(() => {
    detachPointer();
    snapshotRef.current = null;
    dragIndexRef.current = null;
    setDragIndex(null);
  }, [detachPointer]);

  // Reset any in-flight drag when the hook is disabled mid-gesture.
  useEffect(() => {
    if (!enabled && dragIndexRef.current !== null) {
      detachPointer();
      snapshotRef.current = null;
      dragIndexRef.current = null;
      setDragIndex(null);
      setAnnouncement('');
    }
  }, [enabled, detachPointer]);

  // Clean up any dangling pointer listeners if the hook unmounts.
  useEffect(() => {
    return () => {
      detachPointer();
    };
  }, [detachPointer]);

  const handleKeyDown = useCallback(
    (index: number, event: ReactKeyboardEvent) => {
      if (!enabled) return;
      const key = event.key;
      const current = itemsRef.current;
      const currentDragIndex = dragIndexRef.current;

      // Pick-up / drop via Space or Enter.
      if (key === ' ' || key === 'Spacebar' || key === 'Space' || key === 'Enter') {
        event.preventDefault();
        if (currentDragIndex === null) {
          if (current.length === 0) return;
          const clamped = Math.min(Math.max(index, 0), current.length - 1);
          snapshotRef.current = current.slice();
          dragIndexRef.current = clamped;
          setDragIndex(clamped);
          setAnnouncement(formatAnnouncement(clamped, current.length));
        } else {
          // Commit: keep the current order.
          finishDrag();
          setAnnouncement('');
        }
        return;
      }

      if (key === 'Escape' || key === 'Esc') {
        if (currentDragIndex !== null) {
          event.preventDefault();
          cancelDrag();
        }
        return;
      }

      if (currentDragIndex === null) return;

      if (key === 'ArrowUp') {
        event.preventDefault();
        const nextIndex = Math.max(0, currentDragIndex - 1);
        if (nextIndex === currentDragIndex) return;
        const next = reorderArray(current, currentDragIndex, nextIndex);
        commitReorder(next, nextIndex);
        return;
      }

      if (key === 'ArrowDown') {
        event.preventDefault();
        const nextIndex = Math.min(current.length - 1, currentDragIndex + 1);
        if (nextIndex === currentDragIndex) return;
        const next = reorderArray(current, currentDragIndex, nextIndex);
        commitReorder(next, nextIndex);
      }
    },
    [enabled, commitReorder, cancelDrag, finishDrag],
  );

  const handlePointerDown = useCallback(
    (index: number, event: ReactPointerEvent) => {
      if (!enabled) return;
      if (event.button !== undefined && event.button !== 0) return;

      const target = event.currentTarget as HTMLElement | null;
      if (!target || typeof target.getBoundingClientRect !== 'function') {
        return;
      }

      // Find the row element (closest ancestor or self with data-dragging attr)
      const rowElement = target.closest<HTMLElement>('[data-dragging]') || target.parentElement;

      const current = itemsRef.current;
      if (current.length === 0) return;
      const clamped = Math.min(Math.max(index, 0), current.length - 1);

      const rect = (rowElement || target).getBoundingClientRect();
      const rowHeight = rect.height || 1;
      const rowWidth = rect.width || 1;
      // Anchor tracks the current center of the dragged row so deltas
      // measure against the row's latest position after each swap.
      const anchorX = rect.left + rowWidth / 2;
      const anchorY = rect.top + rowHeight / 2;

      // Detect grid columns by comparing sibling positions. If the
      // parent is a multi-column grid, adjacent items share the same
      // top offset within a row.
      let columns = 1;
      const parentEl = (rowElement || target).parentElement;
      if (parentEl && current.length > 1) {
        const children = Array.from(parentEl.children) as HTMLElement[];
        if (children.length >= 2) {
          const firstRect = children[0].getBoundingClientRect();
          let cols = 1;
          for (let i = 1; i < children.length; i++) {
            const childRect = children[i].getBoundingClientRect();
            // If the child's top is roughly the same as the first, it's in the same row
            if (Math.abs(childRect.top - firstRect.top) < rowHeight * 0.5) {
              cols++;
            } else {
              break;
            }
          }
          columns = cols;
        }
      }

      try {
        if (typeof target.setPointerCapture === 'function') {
          target.setPointerCapture(event.pointerId);
        }
      } catch {
        // Ignore capture failures; window listeners below cover moves
        // outside the row bounds.
      }

      // Store the row element for direct DOM style manipulation during drag
      dragElementRef.current = rowElement || target;

      // Wire listeners up front so we can tear them down atomically.
      let detached = false;
      const onMove = (ev: PointerEvent) => {
        const drag = pointerDragRef.current;
        if (!drag || drag.pointerId !== ev.pointerId) return;
        const live = itemsRef.current;
        const currentIdx = dragIndexRef.current;
        if (currentIdx === null || live.length === 0) return;

        // Visual translate: move the element freely in both axes
        const visualDeltaX = ev.clientX - drag.anchorX;
        const visualDeltaY = ev.clientY - drag.anchorY;
        if (dragElementRef.current) {
          dragElementRef.current.style.transform = `translate(${visualDeltaX}px, ${visualDeltaY}px)`;
          dragElementRef.current.style.zIndex = '50';
          dragElementRef.current.style.position = 'relative';
        }

        // Calculate index offset based on grid geometry
        let deltaIndex: number;
        if (drag.columns > 1) {
          // Multi-column grid: compute row and column offsets
          const deltaColsRaw = visualDeltaX / drag.rowWidth;
          const deltaRowsRaw = visualDeltaY / drag.rowHeight;
          const deltaCols = Math.round(deltaColsRaw);
          const deltaRows = Math.round(deltaRowsRaw);
          deltaIndex = deltaRows * drag.columns + deltaCols;
        } else {
          // Single-column list: only vertical movement matters
          deltaIndex = Math.round(visualDeltaY / drag.rowHeight);
        }

        if (!Number.isFinite(deltaIndex) || deltaIndex === 0) return;

        const nextIndex = Math.min(
          live.length - 1,
          Math.max(0, currentIdx + deltaIndex),
        );
        if (nextIndex === currentIdx) return;

        const nextItems = reorderArray(live, currentIdx, nextIndex);
        // Move the anchor so the next delta measures from the new
        // resting position. For grids, shift by the actual index
        // difference converted back to pixel offsets.
        const actualDelta = nextIndex - currentIdx;
        if (drag.columns > 1) {
          const rowShift = Math.trunc(actualDelta / drag.columns);
          const colShift = actualDelta - rowShift * drag.columns;
          drag.anchorX += colShift * drag.rowWidth;
          drag.anchorY += rowShift * drag.rowHeight;
        } else {
          drag.anchorY += actualDelta * drag.rowHeight;
        }
        // Update visual offset after swap
        if (dragElementRef.current) {
          const newDx = ev.clientX - drag.anchorX;
          const newDy = ev.clientY - drag.anchorY;
          dragElementRef.current.style.transform = `translate(${newDx}px, ${newDy}px)`;
        }
        commitReorder(nextItems, nextIndex);
      };

      const onUp = (ev: PointerEvent) => {
        const drag = pointerDragRef.current;
        if (!drag || drag.pointerId !== ev.pointerId) return;
        detach();
        if (dragElementRef.current) {
          dragElementRef.current.style.transform = '';
          dragElementRef.current.style.zIndex = '';
          dragElementRef.current.style.position = '';
          dragElementRef.current = null;
        }
        finishDrag();
        setAnnouncement('');
      };

      const onCancel = (ev: PointerEvent) => {
        const drag = pointerDragRef.current;
        if (!drag || drag.pointerId !== ev.pointerId) return;
        if (dragElementRef.current) {
          dragElementRef.current.style.transform = '';
          dragElementRef.current.style.zIndex = '';
          dragElementRef.current.style.position = '';
          dragElementRef.current = null;
        }
        cancelDrag();
      };

      const detach = () => {
        if (detached) return;
        detached = true;
        if (typeof window === 'undefined') return;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
      };

      if (typeof window !== 'undefined') {
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
      }

      snapshotRef.current = current.slice();
      pointerDragRef.current = {
        pointerId: event.pointerId,
        rowHeight,
        rowWidth,
        anchorX,
        anchorY,
        columns,
        detach,
      };
      dragIndexRef.current = clamped;
      setDragIndex(clamped);
      setAnnouncement(formatAnnouncement(clamped, current.length));
    },
    [enabled, commitReorder, cancelDrag, finishDrag],
  );

  const getRowBindings = useCallback(
    (index: number): DragReorderRowBindings => {
      if (!enabled) return EMPTY_BINDINGS;
      const isDraggingThis = dragIndex === index;
      return {
        onPointerDown: (event) => handlePointerDown(index, event),
        onKeyDown: (event) => handleKeyDown(index, event),
        isDragging: isDraggingThis,
        'aria-grabbed': isDraggingThis ? true : undefined,
        style: undefined,
      };
    },
    [enabled, handlePointerDown, handleKeyDown, dragIndex],
  );

  return useMemo(
    () => ({
      getRowBindings,
      dragIndex: enabled ? dragIndex : null,
      announcement: enabled ? announcement : '',
      items,
    }),
    // `keyExtractor` is surfaced here in the dep list to keep closures
    // reading it alive even though the hook does not currently reach
    // for it outside the public API shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getRowBindings, enabled, dragIndex, announcement, items, keyExtractor],
  );
}
