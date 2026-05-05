import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AstronomyWidget from './AstronomyWidget';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import type { WeatherData } from '../../../services/weatherService';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    headline: 'font-headline',
    muted: 'text-muted',
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
  }),
}));

const widgetSizeMock = vi.hoisted(() => ({
  current: {
    w: 2,
    h: 3,
    area: 6,
    pixelWidth: 320,
    pixelHeight: 360,
    sizeClass: 'medium',
    isCompact: false,
    isTall: true,
    isWide: false,
  },
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => widgetSizeMock.current,
}));

vi.mock('../../../hooks/useDashboardWeatherData', () => ({
  useDashboardWeatherData: ({ fallbackWeather }: { fallbackWeather: WeatherData | null }) => ({
    weather: fallbackWeather,
    aqi: null,
    loading: false,
  }),
}));

const widget: DashboardWidget = {
  id: 'astronomy-test',
  type: 'astronomy',
  position: 0,
  size: 'medium',
  enabled: true,
  config: { w: 2, h: 3 },
};

const weather: WeatherData = {
  city: 'San Francisco',
  tempF: 62,
  tempC: 17,
  icon: 'sun',
  desc: 'Clear',
  latitude: 37.7749,
  longitude: -122.4194,
};

describe('AstronomyWidget', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a space-filling animated astronomy scene with sun, daylight, and moon visuals', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T12:30:00-07:00'));

    render(<AstronomyWidget widget={widget} weather={weather} aqi={null} />);

    expect(screen.getByTestId('astronomy-panel')).toHaveClass('dashboard-astronomy-widget');
    expect(screen.getByTestId('astronomy-sun-scene')).toHaveClass('astronomy-sun-scene');
    expect(screen.getByTestId('astronomy-sun-orb')).toHaveAttribute('aria-label', 'Animated sun position');
    expect(screen.getByTestId('astronomy-daylight-meter')).toHaveAttribute('aria-label', expect.stringMatching(/daylight/i));
    expect(screen.getByTestId('astronomy-moon')).toHaveAttribute('aria-label', expect.stringMatching(/moon/i));
    expect(screen.getByTestId('astronomy-moon')).toHaveAttribute('data-moon-phase');
    expect(screen.getByText('Sunrise')).toBeInTheDocument();
    expect(screen.getByText('Sunset')).toBeInTheDocument();
    expect(screen.getByText('Daylight')).toBeInTheDocument();
    expect(screen.getAllByText('Moon').length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the 2x2 layout visual and compact instead of falling back to stat rows', () => {
    widgetSizeMock.current = {
      w: 2,
      h: 2,
      area: 4,
      pixelWidth: 300,
      pixelHeight: 250,
      sizeClass: 'small',
      isCompact: true,
      isTall: false,
      isWide: false,
    };

    render(<AstronomyWidget widget={widget} weather={weather} aqi={null} />);

    expect(screen.getByTestId('astronomy-panel')).toHaveClass('dashboard-astronomy-compact');
    expect(screen.getByTestId('astronomy-sun-scene')).toBeInTheDocument();
    expect(screen.getByTestId('astronomy-moon')).toBeInTheDocument();
    expect(screen.queryByText(/Location needed/i)).not.toBeInTheDocument();
  });
});
