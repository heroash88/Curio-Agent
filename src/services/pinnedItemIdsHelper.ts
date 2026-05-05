/**
 * Pure helpers for per-widget pinning (Requirement 15).
 *
 * These utilities back `pinnedItemIds` state owned by
 * `useWidgetPersistentState` inside Mail, YouTube, HaEntities, and
 * News widgets. Keeping them in a dedicated module lets the widgets
 * and the property test in `pinnedItemIds.property.test.ts` share a
 * single source of truth.
 *
 * Semantics:
 *
 *   - `togglePin(list, id)` returns a new array. When `id` is already
 *     in `list`, it is removed; otherwise it is appended to the end
 *     (preserving insertion order so widgets can render the oldest
 *     pins first, per Requirement 15.3).
 *   - `isPinned(list, id)` is a simple membership check.
 *   - `sortPinnedFirst(items, pinnedItemIds, keyExtractor)` reorders
 *     an array so that pinned items come first in the order specified
 *     by `pinnedItemIds`; unpinned items retain their original order.
 *     Empty or invalid ids are skipped gracefully.
 *
 * All functions are pure (no localStorage, no DOM, no events).
 */

/**
 * Toggle membership of `id` in `list`. Pure and idempotent when paired
 * with itself (applying twice returns the original list).
 */
export function togglePin(list: readonly string[], id: string): string[] {
  return list.includes(id)
    ? list.filter((existing) => existing !== id)
    : [...list, id];
}

/** Membership check matching `togglePin`'s semantics. */
export function isPinned(list: readonly string[], id: string): boolean {
  return list.includes(id);
}

/**
 * Sort `items` so that entries whose key is in `pinnedItemIds` appear
 * first, in the order of `pinnedItemIds` (oldest pin first, matching
 * Requirement 15.3). Remaining items keep their original order.
 *
 * The function is stable and never mutates its inputs. Items whose key
 * cannot be extracted are treated as unpinned (they fall through to
 * the tail).
 */
export function sortPinnedFirst<T>(
  items: readonly T[],
  pinnedItemIds: readonly string[],
  keyExtractor: (item: T) => string,
): T[] {
  if (pinnedItemIds.length === 0) return [...items];

  const pinnedIndex = new Map<string, number>();
  pinnedItemIds.forEach((id, index) => {
    if (typeof id === 'string' && id.length > 0 && !pinnedIndex.has(id)) {
      pinnedIndex.set(id, index);
    }
  });

  if (pinnedIndex.size === 0) return [...items];

  const pinned: Array<{ item: T; order: number }> = [];
  const unpinned: T[] = [];

  items.forEach((item) => {
    const key = keyExtractor(item);
    const order = pinnedIndex.get(key);
    if (order !== undefined) {
      pinned.push({ item, order });
    } else {
      unpinned.push(item);
    }
  });

  pinned.sort((left, right) => left.order - right.order);

  return [...pinned.map((entry) => entry.item), ...unpinned];
}
