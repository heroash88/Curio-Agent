/**
 * DashboardToastBus
 *
 * A tiny pub/sub that holds a queue of transient "undo" toasts for the
 * dashboard. Visual rendering lives in `DashboardToastHost`; this module
 * owns state, auto-dismiss timers, and the single-fire `onUndo` contract.
 *
 * Contract (design §16):
 *  - `show(toast)` adds a toast. If a toast with the same id already
 *    exists, it replaces the previous toast in place and restarts the
 *    auto-dismiss timer.
 *  - At most three toasts are visible at once. When a fourth toast with
 *    a new id is shown, the oldest toast is dropped (its timer is cleared
 *    and its `onUndo` is NOT invoked — a passive dismiss).
 *  - `dismiss(id)` removes the toast and clears its timer. It does NOT
 *    invoke `onUndo`.
 *  - `triggerUndo(id)` invokes `onUndo` at most once and then dismisses
 *    the toast. Calling it a second time is a no-op.
 *  - Auto-dismiss uses `durationMs` (default 5000). A `durationMs <= 0`
 *    disables the timer; the toast stays until manually dismissed.
 *  - A `curio:dashboard-toast` CustomEvent fires on every state change
 *    for non-subscriber listeners (guarded by `typeof window`).
 *  - Every subscriber receives a fresh, immutable snapshot array on
 *    every state change. Subscribers MUST NOT mutate the snapshot.
 *
 * SSR: every call is safe when `window` is undefined. Timers use
 * `setTimeout`/`clearTimeout` which are globals in Node too.
 */

export type DashboardToastTone = 'default' | 'success' | 'danger';

export interface DashboardToast {
  id: string;
  label: string;
  tone?: DashboardToastTone;
  onUndo?: () => void;
  /** Auto-dismiss delay in ms. Defaults to 5000. `<= 0` disables auto-dismiss. */
  durationMs?: number;
}

type Subscriber = (toasts: DashboardToast[]) => void;

const MAX_VISIBLE_TOASTS = 3;
const DEFAULT_DURATION_MS = 5000;
const TOAST_EVENT_NAME = 'curio:dashboard-toast';

type TimerHandle = ReturnType<typeof setTimeout>;

const subscribers = new Set<Subscriber>();
const timers = new Map<string, TimerHandle>();
const firedUndoIds = new Set<string>();
let toasts: DashboardToast[] = [];

const clearTimer = (id: string): void => {
  const handle = timers.get(id);
  if (handle !== undefined) {
    clearTimeout(handle);
    timers.delete(id);
  }
};

const scheduleTimer = (toast: DashboardToast): void => {
  clearTimer(toast.id);
  const duration = toast.durationMs ?? DEFAULT_DURATION_MS;
  if (!Number.isFinite(duration) || duration <= 0) {
    return;
  }
  const handle = setTimeout(() => {
    timers.delete(toast.id);
    // Passive dismiss: does NOT call onUndo.
    removeToastById(toast.id);
  }, duration);
  timers.set(toast.id, handle);
};

const snapshot = (): DashboardToast[] => toasts.slice();

const emit = (): void => {
  const frozen = snapshot();
  subscribers.forEach((fn) => {
    try {
      fn(frozen);
    } catch {
      // Subscriber errors must not break the bus.
    }
  });
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent(TOAST_EVENT_NAME, { detail: frozen }),
      );
    } catch {
      // Older environments without CustomEvent fall back silently.
    }
  }
};

const removeToastById = (id: string): boolean => {
  const next = toasts.filter((toast) => toast.id !== id);
  if (next.length === toasts.length) {
    return false;
  }
  clearTimer(id);
  toasts = next;
  emit();
  return true;
};

const dropOldestIfNeeded = (): void => {
  while (toasts.length > MAX_VISIBLE_TOASTS) {
    const [oldest, ...rest] = toasts;
    if (!oldest) break;
    clearTimer(oldest.id);
    toasts = rest;
    // No onUndo on passive drop-on-overflow.
  }
};

const show = (toast: DashboardToast): void => {
  if (!toast || typeof toast.id !== 'string' || toast.id.length === 0) {
    return;
  }
  // Replacing by id: wipe the prior fired-undo flag so the new toast
  // starts with a fresh onUndo budget, and clear its timer.
  firedUndoIds.delete(toast.id);

  const existingIndex = toasts.findIndex((item) => item.id === toast.id);
  if (existingIndex >= 0) {
    const next = toasts.slice();
    next[existingIndex] = { ...toast };
    toasts = next;
    clearTimer(toast.id);
  } else {
    toasts = [...toasts, { ...toast }];
    dropOldestIfNeeded();
  }

  scheduleTimer(toast);
  emit();
};

const dismiss = (id: string): void => {
  removeToastById(id);
};

const triggerUndo = (id: string): void => {
  if (firedUndoIds.has(id)) {
    // Idempotent: after the first call, subsequent calls just ensure the
    // toast is dismissed and do not re-invoke `onUndo`.
    removeToastById(id);
    return;
  }
  const toast = toasts.find((item) => item.id === id);
  if (!toast) {
    return;
  }
  firedUndoIds.add(id);
  try {
    toast.onUndo?.();
  } finally {
    removeToastById(id);
  }
};

const subscribe = (fn: Subscriber): (() => void) => {
  subscribers.add(fn);
  // Immediately push the current snapshot so new subscribers sync up
  // without waiting for the next state change.
  try {
    fn(snapshot());
  } catch {
    // Subscriber errors must not break the bus.
  }
  return () => {
    subscribers.delete(fn);
  };
};

export const dashboardToastBus = {
  show,
  dismiss,
  triggerUndo,
  subscribe,
  /** Test-only snapshot accessor. Do not use in production code. */
  getSnapshot: snapshot,
};

/**
 * Test-only helper. Clears all toasts, cancels every pending auto-dismiss
 * timer, resets the `onUndo` fire tracker, and drops every subscriber so
 * tests can start from a clean slate. Do NOT call from production code.
 */
export const resetDashboardToastBus = (): void => {
  timers.forEach((handle) => clearTimeout(handle));
  timers.clear();
  firedUndoIds.clear();
  toasts = [];
  subscribers.clear();
};

export const DASHBOARD_TOAST_EVENT_NAME = TOAST_EVENT_NAME;
export const DASHBOARD_TOAST_MAX_VISIBLE = MAX_VISIBLE_TOASTS;
export const DASHBOARD_TOAST_DEFAULT_DURATION_MS = DEFAULT_DURATION_MS;
