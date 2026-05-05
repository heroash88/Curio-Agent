import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DASHBOARD_WIDGET_DATA_UPDATED_EVENT,
  FRESHNESS_FRESH_WINDOW_MS,
  computeFreshnessState,
  dispatchWidgetDataUpdated,
  shouldRenderSheen,
  type FreshnessState,
} from './dashboardRefresh';

describe('computeFreshnessState', () => {
  const NOW = 10_000_000;

  it('returns "error" when lastRefreshError is truthy, regardless of other inputs', () => {
    const state = computeFreshnessState({
      updatedAt: NOW,
      intervalMs: 60_000,
      lastRefreshError: new Error('fetch failed'),
      nowMs: NOW,
    });
    expect(state).toBe<FreshnessState>('error');
  });

  it('error wins even over never-refreshed widgets', () => {
    expect(
      computeFreshnessState({
        updatedAt: null,
        intervalMs: null,
        lastRefreshError: 'offline',
        nowMs: NOW,
      }),
    ).toBe('error');
  });

  it('returns "idle" for widgets that have never refreshed', () => {
    expect(
      computeFreshnessState({
        updatedAt: null,
        intervalMs: 60_000,
        lastRefreshError: null,
        nowMs: NOW,
      }),
    ).toBe('idle');
  });

  it('returns "fresh" within the 30s fresh window', () => {
    expect(
      computeFreshnessState({
        updatedAt: NOW - (FRESHNESS_FRESH_WINDOW_MS - 1),
        intervalMs: 60_000,
        lastRefreshError: null,
        nowMs: NOW,
      }),
    ).toBe('fresh');
  });

  it('treats negative ages (clock skew) as fresh', () => {
    expect(
      computeFreshnessState({
        updatedAt: NOW + 5_000,
        intervalMs: 60_000,
        lastRefreshError: null,
        nowMs: NOW,
      }),
    ).toBe('fresh');
  });

  it('returns "idle" when no polling interval is configured and past the fresh window', () => {
    expect(
      computeFreshnessState({
        updatedAt: NOW - (FRESHNESS_FRESH_WINDOW_MS + 1_000),
        intervalMs: null,
        lastRefreshError: null,
        nowMs: NOW,
      }),
    ).toBe('idle');
  });

  it('returns "idle" past the fresh window but inside the polling interval', () => {
    const intervalMs = 120_000;
    expect(
      computeFreshnessState({
        updatedAt: NOW - 45_000,
        intervalMs,
        lastRefreshError: null,
        nowMs: NOW,
      }),
    ).toBe('idle');
  });

  it('returns "stale" once age meets or exceeds the polling interval', () => {
    const intervalMs = 60_000;
    expect(
      computeFreshnessState({
        updatedAt: NOW - intervalMs,
        intervalMs,
        lastRefreshError: null,
        nowMs: NOW,
      }),
    ).toBe('stale');

    expect(
      computeFreshnessState({
        updatedAt: NOW - intervalMs - 5_000,
        intervalMs,
        lastRefreshError: null,
        nowMs: NOW,
      }),
    ).toBe('stale');
  });

  it('never returns multiple states — exactly one result per input', () => {
    const allowed: FreshnessState[] = ['fresh', 'idle', 'stale', 'error'];
    const samples = [
      { updatedAt: null, intervalMs: null, lastRefreshError: null, nowMs: NOW },
      { updatedAt: NOW, intervalMs: null, lastRefreshError: null, nowMs: NOW },
      {
        updatedAt: NOW - 120_000,
        intervalMs: 60_000,
        lastRefreshError: null,
        nowMs: NOW,
      },
      {
        updatedAt: NOW - 120_000,
        intervalMs: 60_000,
        lastRefreshError: new Error('x'),
        nowMs: NOW,
      },
    ];
    for (const sample of samples) {
      const state = computeFreshnessState(sample);
      expect(allowed).toContain(state);
    }
  });
});

describe('shouldRenderSheen', () => {
  const motionAllow = { shouldAnimate: true };
  const motionDeny = { shouldAnimate: false };

  it('returns true only when every gate is satisfied', () => {
    expect(
      shouldRenderSheen({
        isFirstLoad: false,
        isRefreshing: true,
        sheenEnabled: true,
        motionProfile: motionAllow,
      }),
    ).toBe(true);
  });

  it('returns false during the first load even with all other gates satisfied', () => {
    expect(
      shouldRenderSheen({
        isFirstLoad: true,
        isRefreshing: true,
        sheenEnabled: true,
        motionProfile: motionAllow,
      }),
    ).toBe(false);
  });

  it('returns false when not refreshing', () => {
    expect(
      shouldRenderSheen({
        isFirstLoad: false,
        isRefreshing: false,
        sheenEnabled: true,
        motionProfile: motionAllow,
      }),
    ).toBe(false);
  });

  it('returns false when the feature toggle is off', () => {
    expect(
      shouldRenderSheen({
        isFirstLoad: false,
        isRefreshing: true,
        sheenEnabled: false,
        motionProfile: motionAllow,
      }),
    ).toBe(false);
  });

  it('returns false when the motion profile disables animation', () => {
    expect(
      shouldRenderSheen({
        isFirstLoad: false,
        isRefreshing: true,
        sheenEnabled: true,
        motionProfile: motionDeny,
      }),
    ).toBe(false);
  });

  it('covers the full truth table with exactly one "true" combination', () => {
    const boolValues = [false, true];
    let trueCount = 0;
    for (const isFirstLoad of boolValues) {
      for (const isRefreshing of boolValues) {
        for (const sheenEnabled of boolValues) {
          for (const shouldAnimate of boolValues) {
            const result = shouldRenderSheen({
              isFirstLoad,
              isRefreshing,
              sheenEnabled,
              motionProfile: { shouldAnimate },
            });
            if (result) trueCount += 1;
          }
        }
      }
    }
    // Only the (false, true, true, true) combination should render the sheen.
    expect(trueCount).toBe(1);
  });
});

describe('dispatchWidgetDataUpdated', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dispatches a CustomEvent on window with the provided detail', () => {
    const handler = vi.fn();
    window.addEventListener(DASHBOARD_WIDGET_DATA_UPDATED_EVENT, handler);

    const detail = {
      widgetId: 'weather_primary',
      widgetType: 'weather' as const,
      updatedAt: 42,
    };
    dispatchWidgetDataUpdated(detail);

    window.removeEventListener(DASHBOARD_WIDGET_DATA_UPDATED_EVENT, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent<typeof detail>;
    expect(event.type).toBe(DASHBOARD_WIDGET_DATA_UPDATED_EVENT);
    expect(event.detail).toEqual(detail);
  });

  it('is SSR-safe: no-ops and does not throw when window is undefined', () => {
    vi.stubGlobal('window', undefined);
    expect(() =>
      dispatchWidgetDataUpdated({
        widgetId: 'x',
        widgetType: 'stock',
        updatedAt: 1,
      }),
    ).not.toThrow();
  });

  it('never throws even if CustomEvent is missing', () => {
    const original = window.CustomEvent;
    // @ts-expect-error — intentional tamper for SSR-safety coverage.
    delete window.CustomEvent;
    try {
      expect(() =>
        dispatchWidgetDataUpdated({
          widgetId: 'x',
          widgetType: 'stock',
          updatedAt: 1,
        }),
      ).not.toThrow();
    } finally {
      window.CustomEvent = original;
    }
  });
});
