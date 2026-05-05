import { useSyncExternalStore } from 'react';
import {
  dashboardToastBus,
  type DashboardToast,
} from '../services/dashboardToastBus';

/**
 * `useDashboardToastBus`
 *
 * Reactive read of the visible toast list from `dashboardToastBus`.
 * Subscribers only re-render when the toast list changes.
 *
 * Implementation notes:
 *  - `dashboardToastBus.getSnapshot()` returns a fresh array reference
 *    on every call. `useSyncExternalStore` requires a stable snapshot
 *    between notifications, so this module keeps a cached snapshot at
 *    module scope and only replaces it when the bus notifies us.
 *  - The cached snapshot is seeded from `dashboardToastBus.getSnapshot()`
 *    at import time. The bus also pushes a snapshot synchronously when
 *    `subscribe(fn)` is called, so the cache stays in sync even if the
 *    bus state changed between module evaluation and the first
 *    subscription.
 *  - `getServerSnapshot` returns a shared empty array so SSR output is
 *    stable and consistent across calls.
 *
 * Consumers that need to push or dismiss toasts should import
 * `dashboardToastBus` directly from `services/dashboardToastBus`.
 * This hook intentionally does not re-export the bus so there is a
 * single source of truth.
 */

const EMPTY_SNAPSHOT: readonly DashboardToast[] = Object.freeze([]);

let cachedSnapshot: DashboardToast[] = dashboardToastBus.getSnapshot();

const getSnapshot = (): DashboardToast[] => cachedSnapshot;

const getServerSnapshot = (): DashboardToast[] =>
  EMPTY_SNAPSHOT as DashboardToast[];

const subscribe = (onChange: () => void): (() => void) => {
  return dashboardToastBus.subscribe((next) => {
    cachedSnapshot = next;
    onChange();
  });
};

export function useDashboardToastBus(): DashboardToast[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
