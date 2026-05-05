import { describe, expect, it } from 'vitest';

import {
  getDashboardRefreshPolicy,
  isLiveDashboardWidget,
} from './dashboardRefresh';

describe('dashboard refresh policy', () => {
  it('disables polling for manual refresh mode', () => {
    const policy = getDashboardRefreshPolicy('stock', {
      refreshMode: 'manual',
      refreshIntervalMinutes: 1,
    });

    expect(policy.mode).toBe('manual');
    expect(policy.shouldPoll).toBe(false);
    expect(policy.intervalMs).toBeNull();
  });

  it('disables polling for push refresh mode', () => {
    const policy = getDashboardRefreshPolicy('ha_sensor', {
      refreshMode: 'push',
      refreshIntervalMinutes: 1,
    });

    expect(policy.mode).toBe('push');
    expect(policy.shouldPoll).toBe(false);
    expect(policy.intervalMs).toBeNull();
  });

  it('clamps timed refreshes to the widget minimum interval', () => {
    const policy = getDashboardRefreshPolicy('stock', {
      refreshMode: 'timed',
      refreshIntervalMinutes: 1,
    });

    expect(policy.mode).toBe('timed');
    expect(policy.intervalMinutes).toBe(15);
    expect(policy.intervalMs).toBe(15 * 60 * 1000);
    expect(policy.shouldPoll).toBe(true);
  });

  it('identifies only data-backed widgets as live widgets', () => {
    expect(isLiveDashboardWidget('mail')).toBe(true);
    expect(isLiveDashboardWidget('ha_camera')).toBe(true);
    expect(isLiveDashboardWidget('greeting')).toBe(false);
    expect(isLiveDashboardWidget('clock')).toBe(false);
  });
});
