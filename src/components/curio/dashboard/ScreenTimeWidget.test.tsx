import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import {
  resetDashboardActivityMetrics,
  trackDashboardActivityEvent,
} from '../../../services/screenTimePersistence';
import ScreenTimeWidget from './ScreenTimeWidget';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: true,
    muted: 'text-muted',
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
    surfaceContainer: 'surface-container',
    surfaceContainerHigh: 'surface-container-high',
    surfaceContainerLow: 'surface-container-low',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => ({
    w: 3,
    h: 3,
    area: 9,
    pixelWidth: 420,
    pixelHeight: 380,
    sizeClass: 'large',
    isCompact: false,
    isTall: true,
    isWide: true,
  }),
}));

vi.mock('../../../utils/settingsStorage', () => ({
  useThemeMode: () => 'dark',
}));

const buildWidget = (
  config: Partial<DashboardWidget['config']> = {},
): DashboardWidget => ({
  id: 'insights-test',
  type: 'screen_time',
  position: 0,
  size: 'large',
  enabled: true,
  config: {
    w: 3,
    h: 3,
    ...config,
  } as DashboardWidget['config'],
});

describe('ScreenTimeWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T15:30:00'));
    localStorage.clear();
    resetDashboardActivityMetrics();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('renders selected Curio activity insight modules from real local metrics', () => {
    trackDashboardActivityEvent('dashboardOpen');
    trackDashboardActivityEvent('dashboardTime', { durationMs: 185_000 });
    trackDashboardActivityEvent('aiMessage', { source: 'text', backend: 'custom_llm' });
    trackDashboardActivityEvent('widgetInteraction', {
      widgetType: 'weather',
      widgetLabel: 'Weather',
    });
    trackDashboardActivityEvent('responseCard', { cardType: 'weather' });

    render(
      <ScreenTimeWidget
        widget={buildWidget({
          activityModules: ['dashboardTime', 'aiMessages', 'topWidget'],
        })}
      />,
    );

    expect(screen.getByText('Curio Insights')).toBeInTheDocument();
    expect(screen.getByText('Dashboard time')).toBeInTheDocument();
    expect(screen.getAllByText('3m').length).toBeGreaterThan(0);
    expect(screen.getByText('AI messages')).toBeInTheDocument();
    expect(screen.getByTestId('activity-module-aiMessages')).toHaveTextContent('1');
    expect(screen.getByText('Top widget')).toBeInTheDocument();
    expect(screen.getByText('Weather')).toBeInTheDocument();
    expect(screen.queryByText('Cards created')).not.toBeInTheDocument();
  });
});
