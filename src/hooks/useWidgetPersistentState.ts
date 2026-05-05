import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';

/**
 * `useWidgetPersistentState<T>(widgetId, key, initial)` is a
 * localStorage-backed `useState` replacement for small per-widget UI
 * state (collapse, tab selection, view mode) that should survive
 * reloads (Requirement 14).
 *
 *   - Storage key: `curio_widget_state_<widgetId>_<key>`.
 *   - Values are JSON-serialized. Malformed stored data falls back
 *     silently to `initial`.
 *   - `setValue` accepts a value or functional updater and persists
 *     synchronously before dispatching same-tab `storage` and
 *     `curio:settings-changed` events so other mounts re-read
 *     immediately.
 *   - The hook uses a `useSyncExternalStore`-backed subscription so
 *     multiple concurrent mounts of the same `(widgetId, key)` pair
 *     stay in sync within a single tab.
 *   - SSR-safe: returns `[initial, () => {}]` when `window` is
 *     undefined.
 */

/** Prefix for every localStorage key owned by `useWidgetPersistentState`. */
export const WIDGET_PERSISTENT_STATE_KEY_PREFIX = 'curio_widget_state_';

/**
 * Compose the localStorage key for a given `(widgetId, key)` pair.
 * Exported so deletion/cleanup helpers can derive keys without
 * duplicating the prefix.
 */
export function getWidgetPersistentStateKey(
  widgetId: string,
  key: string,
): string {
  return `${WIDGET_PERSISTENT_STATE_KEY_PREFIX}${widgetId}_${key}`;
}

/**
 * Derive the per-widget prefix for bulk cleanup: every key belonging
 * to `widgetId` starts with this prefix.
 */
export function getWidgetPersistentStateWidgetPrefix(widgetId: string): string {
  return `${WIDGET_PERSISTENT_STATE_KEY_PREFIX}${widgetId}_`;
}

const SETTINGS_CHANGED_EVENT = 'curio:settings-changed';

const isBrowser = (): boolean => typeof window !== 'undefined';

const readStoredValue = <T,>(storageKey: string, initial: T): T => {
  if (!isBrowser()) return initial;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw == null) return initial;
    return JSON.parse(raw) as T;
  } catch {
    return initial;
  }
};

const writeStoredValue = <T,>(storageKey: string, value: T): void => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Swallow persistence errors (quota, private mode). The in-memory
    // value still updates through the subscription fan-out so the UI
    // stays consistent for this session.
  }
  try {
    window.dispatchEvent(new Event('storage'));
  } catch {
    // Some environments (very old jsdom) don't support constructing
    // `Event('storage')`; ignore and rely on the custom event below.
  }
  try {
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT));
  } catch {
    // Older browsers without CustomEvent fall back silently.
  }
};

/**
 * Module-level subscription layer so every `useSyncExternalStore`
 * instance re-reads from localStorage on any of:
 *
 *   - the native cross-tab `storage` event,
 *   - the same-tab `curio:settings-changed` event,
 *   - a direct write via this hook (which dispatches both above).
 *
 * A single window listener is shared across all hook instances to
 * avoid O(N) listener growth.
 */
const listeners = new Set<() => void>();
let windowListenerAttached = false;

const notifyAll = (): void => {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // Subscriber errors must not break the bus.
    }
  });
};

const attachWindowListenerIfNeeded = (): void => {
  if (windowListenerAttached || !isBrowser()) return;
  windowListenerAttached = true;
  window.addEventListener('storage', notifyAll);
  window.addEventListener(SETTINGS_CHANGED_EVENT, notifyAll);
};

const subscribe = (onChange: () => void): (() => void) => {
  attachWindowListenerIfNeeded();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};

/**
 * Functional updater signature matching React's `setState` — accepts
 * either a new value or a callback that receives the previous value.
 */
export type WidgetPersistentStateUpdater<T> = T | ((prev: T) => T);

const isFunctionUpdater = <T,>(
  next: WidgetPersistentStateUpdater<T>,
): next is (prev: T) => T => typeof next === 'function';

export function useWidgetPersistentState<T>(
  widgetId: string,
  key: string,
  initial: T,
): [T, (next: WidgetPersistentStateUpdater<T>) => void] {
  const storageKey = useMemo(
    () => getWidgetPersistentStateKey(widgetId, key),
    [widgetId, key],
  );

  // Cache the snapshot between notifications so
  // `useSyncExternalStore` does not see a fresh reference on every
  // read (it requires stable snapshots).
  const cachedRawRef = useRef<string | undefined>(undefined);
  const cachedValueRef = useRef<T>(initial);

  const getSnapshot = useCallback((): T => {
    if (!isBrowser()) return initial;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(storageKey);
    } catch {
      raw = null;
    }
    const rawKey = raw === null ? '\u0000__absent__' : raw;
    if (rawKey !== cachedRawRef.current) {
      cachedRawRef.current = rawKey;
      cachedValueRef.current = readStoredValue<T>(storageKey, initial);
    }
    return cachedValueRef.current;
  }, [storageKey, initial]);

  const getServerSnapshot = useCallback((): T => initial, [initial]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: WidgetPersistentStateUpdater<T>) => {
      if (!isBrowser()) return;
      const prev = readStoredValue<T>(storageKey, initial);
      const resolved = isFunctionUpdater(next) ? next(prev) : next;
      writeStoredValue<T>(storageKey, resolved);
      // Invalidate the local cache so the next getSnapshot re-reads.
      cachedRawRef.current = undefined;
      // Same-tab subscribers (including this hook instance) re-read
      // via the `storage` + `curio:settings-changed` listeners fired
      // by writeStoredValue.
    },
    [storageKey, initial],
  );

  // Under SSR, `useSyncExternalStore` returns the server snapshot which
  // is `initial`; the setter is a no-op.
  if (!isBrowser()) {
    return [initial, () => {}];
  }

  return [value, setValue];
}
