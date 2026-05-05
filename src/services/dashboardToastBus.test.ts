import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DASHBOARD_TOAST_EVENT_NAME,
  dashboardToastBus,
  resetDashboardToastBus,
  type DashboardToast,
} from './dashboardToastBus';

describe('dashboardToastBus', () => {
  beforeEach(() => {
    resetDashboardToastBus();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetDashboardToastBus();
  });

  it('notifies subscribers with the current snapshot on subscribe and on every change', () => {
    const updates: DashboardToast[][] = [];
    const unsubscribe = dashboardToastBus.subscribe((toasts) => {
      updates.push(toasts);
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual([]);

    dashboardToastBus.show({ id: 'a', label: 'first' });
    expect(updates[updates.length - 1]).toEqual([
      { id: 'a', label: 'first' },
    ]);

    dashboardToastBus.dismiss('a');
    expect(updates[updates.length - 1]).toEqual([]);

    unsubscribe();
    dashboardToastBus.show({ id: 'b', label: 'after unsubscribe' });
    expect(updates[updates.length - 1]).toEqual([]);
  });

  it('replaces an existing toast when show() is called with the same id', () => {
    dashboardToastBus.show({ id: 'same', label: 'v1', tone: 'default' });
    dashboardToastBus.show({ id: 'same', label: 'v2', tone: 'danger' });

    const snap = dashboardToastBus.getSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]).toMatchObject({ id: 'same', label: 'v2', tone: 'danger' });
  });

  it('caps visible toasts at three by dropping the oldest', () => {
    dashboardToastBus.show({ id: 'a', label: 'a' });
    dashboardToastBus.show({ id: 'b', label: 'b' });
    dashboardToastBus.show({ id: 'c', label: 'c' });
    dashboardToastBus.show({ id: 'd', label: 'd' });

    const ids = dashboardToastBus.getSnapshot().map((t) => t.id);
    expect(ids).toEqual(['b', 'c', 'd']);
  });

  it('auto-dismisses after durationMs (default 5000)', () => {
    dashboardToastBus.show({ id: 'timed', label: 'auto' });
    expect(dashboardToastBus.getSnapshot()).toHaveLength(1);

    vi.advanceTimersByTime(4999);
    expect(dashboardToastBus.getSnapshot()).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(dashboardToastBus.getSnapshot()).toHaveLength(0);
  });

  it('does not schedule auto-dismiss when durationMs <= 0', () => {
    dashboardToastBus.show({ id: 'sticky', label: 'persist', durationMs: 0 });
    vi.advanceTimersByTime(60_000);
    expect(dashboardToastBus.getSnapshot()).toHaveLength(1);

    dashboardToastBus.dismiss('sticky');
    expect(dashboardToastBus.getSnapshot()).toHaveLength(0);
  });

  it('clears the auto-dismiss timer when a toast is dismissed manually', () => {
    const onUndo = vi.fn();
    dashboardToastBus.show({ id: 'x', label: 'to dismiss', onUndo });
    dashboardToastBus.dismiss('x');
    vi.advanceTimersByTime(10_000);
    expect(onUndo).not.toHaveBeenCalled();
    expect(dashboardToastBus.getSnapshot()).toHaveLength(0);
  });

  it('triggerUndo invokes onUndo exactly once even when called twice', () => {
    const onUndo = vi.fn();
    dashboardToastBus.show({ id: 'u', label: 'undo me', onUndo });

    dashboardToastBus.triggerUndo('u');
    dashboardToastBus.triggerUndo('u');

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(dashboardToastBus.getSnapshot()).toHaveLength(0);
  });

  it('dismiss does NOT invoke onUndo', () => {
    const onUndo = vi.fn();
    dashboardToastBus.show({ id: 'd', label: 'passive', onUndo });
    dashboardToastBus.dismiss('d');
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('auto-dismiss does NOT invoke onUndo', () => {
    const onUndo = vi.fn();
    dashboardToastBus.show({ id: 'timer', label: 'auto', onUndo });
    vi.advanceTimersByTime(5000);
    expect(onUndo).not.toHaveBeenCalled();
    expect(dashboardToastBus.getSnapshot()).toHaveLength(0);
  });

  it('dropping on overflow does NOT invoke onUndo of the evicted toast', () => {
    const onUndo = vi.fn();
    dashboardToastBus.show({ id: 'a', label: 'a', onUndo });
    dashboardToastBus.show({ id: 'b', label: 'b' });
    dashboardToastBus.show({ id: 'c', label: 'c' });
    dashboardToastBus.show({ id: 'd', label: 'd' });

    expect(onUndo).not.toHaveBeenCalled();
    const ids = dashboardToastBus.getSnapshot().map((t) => t.id);
    expect(ids).not.toContain('a');
  });

  it('replacing by id resets the undo budget', () => {
    const firstUndo = vi.fn();
    const secondUndo = vi.fn();
    dashboardToastBus.show({ id: 'dup', label: 'v1', onUndo: firstUndo });
    dashboardToastBus.triggerUndo('dup');
    expect(firstUndo).toHaveBeenCalledTimes(1);

    dashboardToastBus.show({ id: 'dup', label: 'v2', onUndo: secondUndo });
    dashboardToastBus.triggerUndo('dup');
    expect(secondUndo).toHaveBeenCalledTimes(1);
  });

  it('dispatches a curio:dashboard-toast CustomEvent on every state change', () => {
    const handler = vi.fn();
    window.addEventListener(DASHBOARD_TOAST_EVENT_NAME, handler);

    dashboardToastBus.show({ id: 'e', label: 'evt' });
    dashboardToastBus.dismiss('e');

    window.removeEventListener(DASHBOARD_TOAST_EVENT_NAME, handler);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('ignores toasts with an empty or invalid id', () => {
    dashboardToastBus.show({ id: '', label: 'no-id' } as DashboardToast);
    expect(dashboardToastBus.getSnapshot()).toHaveLength(0);
  });

  it('resetDashboardToastBus clears every toast, timer, and subscriber', () => {
    const subscriber = vi.fn();
    dashboardToastBus.subscribe(subscriber);
    dashboardToastBus.show({ id: 'r', label: 'reset me' });

    resetDashboardToastBus();

    expect(dashboardToastBus.getSnapshot()).toEqual([]);
    subscriber.mockClear();
    dashboardToastBus.show({ id: 's', label: 'post-reset' });
    // Prior subscriber was cleared by reset.
    expect(subscriber).not.toHaveBeenCalled();

    // Pending timer from before reset must not fire.
    vi.advanceTimersByTime(4999);
    expect(dashboardToastBus.getSnapshot().map((t) => t.id)).toEqual(['s']);
  });
});
