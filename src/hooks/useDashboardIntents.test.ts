/**
 * Feature: dashboard-interactivity-upgrades — Task 2.6
 *
 * Tests for `useDropIntentTarget` and `useHoverBus` covering:
 *  - drop matching by `targetWidgetId`,
 *  - registry-based support checks + the "Not supported here" toast,
 *  - listener cleanup on unmount,
 *  - hover reducer (latest, hover-end clears, select updates).
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DASHBOARD_HOVER_EVENT,
  DASHBOARD_ITEM_DROP_EVENT,
  DASHBOARD_SELECT_EVENT,
  type DropIntentPayload,
  type HoverEventDetail,
  type SelectEventDetail,
} from '../services/dashboardIntents';
import {
  dashboardToastBus,
  resetDashboardToastBus,
} from '../services/dashboardToastBus';
import {
  resetHoverBusForTests,
  useDropIntentTarget,
  useHoverBus,
} from './useDashboardIntents';

const dispatchDropEvent = (detail: DropIntentPayload): void => {
  window.dispatchEvent(
    new CustomEvent<DropIntentPayload>(DASHBOARD_ITEM_DROP_EVENT, { detail }),
  );
};

const dispatchHoverEvent = (detail: HoverEventDetail): void => {
  window.dispatchEvent(
    new CustomEvent<HoverEventDetail>(DASHBOARD_HOVER_EVENT, { detail }),
  );
};

const dispatchSelectEvent = (detail: SelectEventDetail): void => {
  window.dispatchEvent(
    new CustomEvent<SelectEventDetail>(DASHBOARD_SELECT_EVENT, { detail }),
  );
};

const makeSupportedPayload = (targetWidgetId: string): DropIntentPayload => ({
  sourceWidgetId: 'bookmarks-1',
  sourceWidgetType: 'bookmarks',
  payload: { url: 'https://example.com', title: 'Example' },
  targetWidgetId,
  targetWidgetType: 'notes',
});

describe('useDropIntentTarget', () => {
  beforeEach(() => {
    resetDashboardToastBus();
  });

  afterEach(() => {
    resetDashboardToastBus();
  });

  it('invokes the handler when the drop targets this widget and the registry supports the pair', () => {
    const handler = vi.fn();
    renderHook(() => useDropIntentTarget('notes-42', handler));

    const payload = makeSupportedPayload('notes-42');
    act(() => {
      dispatchDropEvent(payload);
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it('ignores drops that target a different widget', () => {
    const handler = vi.fn();
    renderHook(() => useDropIntentTarget('notes-42', handler));

    act(() => {
      dispatchDropEvent(makeSupportedPayload('notes-other'));
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not invoke the handler for unsupported (source -> target) pairs and shows the "Not supported here" toast', () => {
    const handler = vi.fn();
    const showSpy = vi.spyOn(dashboardToastBus, 'show');

    renderHook(() => useDropIntentTarget('portfolio-1', handler));

    const unsupported: DropIntentPayload = {
      sourceWidgetId: 'clock-1',
      // `clock` is not a registered drop source in DROP_INTENT_REGISTRY.
      sourceWidgetType: 'clock',
      payload: {},
      targetWidgetId: 'portfolio-1',
      targetWidgetType: 'portfolio',
    };

    act(() => {
      dispatchDropEvent(unsupported);
    });

    expect(handler).not.toHaveBeenCalled();
    expect(showSpy).toHaveBeenCalledTimes(1);
    expect(showSpy).toHaveBeenCalledWith({
      id: 'drop-intent-unsupported',
      label: 'Not supported here',
    });
  });

  it('removes the listener on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() =>
      useDropIntentTarget('notes-42', handler),
    );

    unmount();

    act(() => {
      dispatchDropEvent(makeSupportedPayload('notes-42'));
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not crash when the handler throws synchronously', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handler = vi.fn(() => {
      throw new Error('boom');
    });

    renderHook(() => useDropIntentTarget('notes-42', handler));

    expect(() => {
      act(() => {
        dispatchDropEvent(makeSupportedPayload('notes-42'));
      });
    }).not.toThrow();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('useHoverBus', () => {
  beforeEach(() => {
    resetHoverBusForTests();
  });

  afterEach(() => {
    resetHoverBusForTests();
  });

  it('starts with null hovered and null selected', () => {
    const { result } = renderHook(() => useHoverBus());
    expect(result.current.hovered).toBeNull();
    expect(result.current.selected).toBeNull();
  });

  it('updates `hovered` on a hover event and resets it to null on hover-end', () => {
    const { result } = renderHook(() => useHoverBus());

    const hover: HoverEventDetail = {
      widgetId: 'calendar-1',
      itemKind: 'calendar-event',
      itemId: 'evt-42',
    };

    act(() => {
      dispatchHoverEvent(hover);
    });
    expect(result.current.hovered).toEqual(hover);

    act(() => {
      dispatchHoverEvent({
        widgetId: 'calendar-1',
        itemKind: null,
        itemId: null,
      });
    });
    expect(result.current.hovered).toBeNull();
  });

  it('updates `selected` on a select event without disturbing `hovered`', () => {
    const { result } = renderHook(() => useHoverBus());

    const hover: HoverEventDetail = {
      widgetId: 'tasks-1',
      itemKind: 'task',
      itemId: 'task-1',
    };
    act(() => {
      dispatchHoverEvent(hover);
    });

    const selected: SelectEventDetail = {
      widgetId: 'mail-1',
      itemKind: 'mail-thread',
      itemId: 'thread-7',
    };
    act(() => {
      dispatchSelectEvent(selected);
    });

    expect(result.current.hovered).toEqual(hover);
    expect(result.current.selected).toEqual(selected);
  });
});
