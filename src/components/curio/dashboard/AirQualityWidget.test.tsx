import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AirQualityWidget from './AirQualityWidget';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import type { AqiData } from '../../../services/weatherService';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    headline: 'font-headline',
    muted: 'text-muted',
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
    surfaceContainerLow: 'surface-container-low',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => ({
    w: 2,
    h: 2,
    area: 4,
    pixelWidth: 320,
    pixelHeight: 240,
    sizeClass: 'medium',
    isCompact: false,
    isTall: false,
    isWide: false,
  }),
}));

vi.mock('../../../hooks/useDashboardWeatherData', () => ({
  useDashboardWeatherData: ({ fallbackAqi }: { fallbackAqi: AqiData | null }) => ({
    weather: null,
    aqi: fallbackAqi,
    loading: false,
  }),
}));

const widget: DashboardWidget = {
  id: 'air-quality-test',
  type: 'air_quality',
  position: 0,
  size: 'small',
  enabled: true,
  config: { w: 2, h: 2 },
};

describe('AirQualityWidget', () => {
  it('renders a simple panel with AQI value and guidance for good air', () => {
    render(
      <AirQualityWidget
        widget={widget}
        weather={null}
        aqi={{ value: 18, category: 'Good', color: '#22c55e' }}
      />,
    );

    expect(screen.getByTestId('air-quality-panel')).toHaveAttribute('data-aqi-level', 'good');
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('Fresh air')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(
      screen.getByText('Air is clean enough for outdoor plans.'),
    ).toBeInTheDocument();
  });

  it('surfaces hazardous-level label and guidance for very high AQI values', () => {
    render(
      <AirQualityWidget
        widget={widget}
        weather={null}
        aqi={{ value: 320, category: 'Hazardous', color: '#9F1239' }}
      />,
    );

    expect(screen.getByTestId('air-quality-panel')).toHaveAttribute('data-aqi-level', 'hazardous');
    expect(screen.getByText('320')).toBeInTheDocument();
    expect(screen.getByText('Stay inside')).toBeInTheDocument();
    expect(
      screen.getByText('Avoid outdoor activity and close windows if possible.'),
    ).toBeInTheDocument();
  });
});
