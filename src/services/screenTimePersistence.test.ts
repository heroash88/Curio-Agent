import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDashboardActivitySummary,
  resetDashboardActivityMetrics,
  trackDashboardActivityEvent,
} from './screenTimePersistence';

describe('dashboard activity persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T15:30:00'));
    resetDashboardActivityMetrics();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('records useful dashboard and AI activity for the current day', () => {
    trackDashboardActivityEvent('dashboardOpen');
    trackDashboardActivityEvent('dashboardTime', { durationMs: 125_000 });
    trackDashboardActivityEvent('aiMessage', {
      source: 'text',
      backend: 'custom_llm',
    });
    trackDashboardActivityEvent('responseCard', { cardType: 'weather' });
    trackDashboardActivityEvent('widgetInteraction', {
      widgetType: 'weather',
      widgetLabel: 'Weather',
    });

    const summary = getDashboardActivitySummary();

    expect(summary.today.dashboardMs).toBe(125_000);
    expect(summary.today.dashboardVisits).toBe(1);
    expect(summary.today.aiMessages).toBe(1);
    expect(summary.today.responseCards).toBe(1);
    expect(summary.today.widgetInteractions).toBe(1);
    expect(summary.topWidget).toMatchObject({
      label: 'Weather',
      count: 1,
    });
    expect(summary.weeklyTotals.dashboardMs).toBe(125_000);
  });
});
