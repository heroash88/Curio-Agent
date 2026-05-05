import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useDashboardRefresh } from '../hooks/useDashboardRefresh';
import type { DashboardWidget } from '../services/dashboardTypes';

const buildWidget = (config: DashboardWidget['config']): DashboardWidget => ({
  id: 'weather_test',
  type: 'weather',
  label: 'Weather',
  enabled: true,
  position: 0,
  config,
});

const Harness: React.FC<{
  widget: DashboardWidget;
  onRefresh: ReturnType<typeof vi.fn>;
}> = ({ widget, onRefresh }) => {
  useDashboardRefresh({ widget, onRefresh });
  return null;
};

describe('useDashboardRefresh', () => {
  it('does not fire a new initial refresh for unrelated config-only changes', () => {
    const onRefresh = vi.fn();
    const widget = buildWidget({
      refreshMode: 'timed',
      refreshIntervalMinutes: 15,
      w: 2,
      h: 2,
    });

    const { rerender } = render(React.createElement(Harness, { widget, onRefresh }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenLastCalledWith(false, 'initial');

    rerender(
      React.createElement(Harness, {
        widget: buildWidget({
          refreshMode: 'timed',
          refreshIntervalMinutes: 15,
          w: 3,
          h: 2,
          customTitle: 'Outdoor weather',
        }),
        onRefresh,
      }),
    );

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
