import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WeatherDashWidget from './WeatherDashWidget';
import { DashboardWidgetActionSlotContext } from './WidgetShell';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import type { AqiData, WeatherData } from '../../../services/weatherService';

const widgetSizeMock = vi.hoisted(() => ({
  current: {
    w: 3,
    h: 3,
    area: 9,
    sizeClass: 'large',
    isWide: true,
    isTall: true,
    isCompact: false,
    pixelWidth: 680,
    pixelHeight: 430,
  },
}));

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: false,
    headline: 'font-headline',
    onSurface: 'text-slate-900',
    onSurfaceVariant: 'text-slate-600',
    muted: 'text-slate-500',
    text2: 'text-slate-600',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => widgetSizeMock.current,
}));

vi.mock('../../../hooks/useDashboardWeatherData', () => ({
  useDashboardWeatherData: ({ fallbackWeather, fallbackAqi }: {
    fallbackWeather: WeatherData | null;
    fallbackAqi: unknown;
  }) => ({
    weather: fallbackWeather,
    aqi: fallbackAqi,
    loading: false,
  }),
}));

vi.mock('../../../utils/settingsStorage', () => ({
  useTempUnit: () => 'F',
}));

const widget: DashboardWidget = {
  id: 'weather_test',
  type: 'weather',
  position: 0,
  size: 'large',
  enabled: true,
  config: { w: 3, h: 3 },
};

const weather: WeatherData = {
  city: 'Sample City',
  tempF: 72,
  tempC: 22,
  icon: 'partlyCloudyDay',
  desc: 'Partly Cloudy',
  humidity: 46,
  windSpeedMph: 8,
  feelsLikeF: 69,
  feelsLikeC: 21,
  daily: [
    { date: 'Fri', highF: 74, lowF: 55, highC: 23, lowC: 13, icon: 'sun', condition: 'Clear', humidity: 40 },
    { date: 'Sat', highF: 70, lowF: 53, highC: 21, lowC: 12, icon: 'cloud', condition: 'Cloudy', humidity: 50 },
  ],
};

const aqi: AqiData = {
  value: 18,
  category: 'Good',
  color: '#22c55e',
};

describe('WeatherDashWidget', () => {
  beforeEach(() => {
    widgetSizeMock.current = {
      w: 3,
      h: 3,
      area: 9,
      sizeClass: 'large',
      isWide: true,
      isTall: true,
      isCompact: false,
      pixelWidth: 680,
      pixelHeight: 430,
    };
  });

  it('renders weather as a single rich weather card surface without a nested dashboard shell', () => {
    const { container } = render(
      <DashboardWidgetActionSlotContext.Provider value={<button type="button">Widget controls</button>}>
        <WeatherDashWidget widget={widget} weather={weather} aqi={aqi} />
      </DashboardWidgetActionSlotContext.Provider>,
    );

    const surface = screen.getByTestId('weather-dashboard-card');
    expect(container.querySelector('[data-widget-primitive="body"]')).toBeInTheDocument();
    expect(surface).toHaveClass('card-glass', 'weather-card-glass', 'dashboard-weather-card');
    expect(surface).toHaveClass('weather-card-unified-glass');
    expect(surface).toHaveClass('weather-card-condition-partly');
    expect(container.querySelectorAll('.weather-card-glass')).toHaveLength(1);
    expect(container.querySelector('.weather-card-glass .weather-card-glass')).not.toBeInTheDocument();

    expect(screen.getByText(/72°F/)).toBeInTheDocument();
    expect(screen.getByText(/Partly Cloudy/i)).toBeInTheDocument();
    expect(screen.getByText(/Sample City/i)).toBeInTheDocument();
    expect(container.querySelector('.dashboard-weather-metric')).not.toBeInTheDocument();
    expect(screen.queryByText(/Range/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Feels like/i)).toBeInTheDocument();
    expect(screen.getByText(/69°/)).toBeInTheDocument();
    expect(screen.getByText(/Wind/i)).toBeInTheDocument();
    expect(screen.getByText(/8 mph/i)).toBeInTheDocument();
    expect(screen.getByText(/Air/i)).toBeInTheDocument();
    expect(screen.getByText(/Good/i)).toBeInTheDocument();
    expect(screen.getByTestId('weather-minute-strip')).toBeInTheDocument();
    expect(screen.getByTestId('weather-motion-model')).toHaveClass('weather-motion-partly');
    expect(container.querySelectorAll('.dashboard-weather-detail-icon').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByTestId('weather-forecast-strip')).toBeInTheDocument();
    expect(container.querySelector('.dashboard-weather-forecast-day.rounded-2xl')).not.toBeInTheDocument();
    expect(screen.getByText(/Today/i)).toBeInTheDocument();
    expect(screen.getByText(/Sat/i)).toBeInTheDocument();
    expect(screen.getByText(/Widget controls/i)).toBeInTheDocument();
    const actionSlot = screen.getByText(/Widget controls/i).parentElement;
    expect(actionSlot).toHaveClass('absolute', 'right-3', 'top-4');
    expect(actionSlot).toHaveClass('pointer-events-none', 'opacity-0');
    expect(actionSlot).toHaveClass('group-hover:pointer-events-auto', 'group-hover:opacity-100');
    expect(actionSlot).not.toHaveClass('left-3');
  });

  it('marks light-mode weather text with readable contrast hooks', () => {
    const { container } = render(
      <WeatherDashWidget widget={widget} weather={weather} aqi={aqi} />,
    );

    expect(screen.getByText('Sample City')).toHaveClass('weather-card-city');
    expect(screen.getByText(/72°F/)).toHaveClass('weather-card-temp');
    expect(screen.getByText(/Partly Cloudy/i)).toHaveClass('weather-card-description');
    expect(screen.getByText(/Feels like/i)).toHaveClass('weather-card-detail-label');
    expect(screen.getByText(/69°/)).toHaveClass('weather-card-detail-value');
    expect(screen.getByText('Today')).toHaveClass('weather-card-forecast-label');
    expect(container.querySelector('.weather-card-forecast-high')).toBeInTheDocument();
    expect(container.querySelector('.weather-card-forecast-low')).toBeInTheDocument();
  });

  it('adds a card rain layer when the current weather is rainy', () => {
    render(
      <WeatherDashWidget
        widget={widget}
        weather={{ ...weather, desc: 'Light Drizzle' }}
        aqi={aqi}
      />,
    );

    expect(screen.getByTestId('weather-dashboard-card')).toHaveClass('weather-card-condition-rain');
    expect(screen.getByTestId('weather-motion-model')).toHaveClass('weather-motion-rain');
    expect(screen.getByTestId('weather-card-rain-layer')).toBeInTheDocument();
  });

  it('keeps compact weather cards sparse enough to breathe after resizing', () => {
    widgetSizeMock.current = {
      w: 2,
      h: 2,
      area: 4,
      sizeClass: 'small',
      isWide: false,
      isTall: false,
      isCompact: true,
      pixelWidth: 280,
      pixelHeight: 210,
    };

    const { container } = render(
      <WeatherDashWidget
        widget={widget}
        weather={{
          ...weather,
          city: 'A very long city name that should not crowd the card',
          desc: 'Mostly Clear With Long Text',
        }}
        aqi={aqi}
      />,
    );

    const surface = screen.getByTestId('weather-dashboard-card');
    expect(surface).toHaveClass('dashboard-weather-card-cramped');
    expect(screen.queryByTestId('weather-forecast-strip')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.weather-card-detail-value')).toHaveLength(2);
    expect(screen.getByText(/Today:/i)).toHaveClass('weather-card-today-summary');
    expect(screen.getByText(/Today:/i)).not.toHaveClass('mt-auto');
  });

  it('adds a wide weather layout hook when resized into a larger panel', () => {
    widgetSizeMock.current = {
      w: 6,
      h: 4,
      area: 24,
      sizeClass: 'xlarge',
      isWide: true,
      isTall: false,
      isCompact: false,
      pixelWidth: 680,
      pixelHeight: 420,
    };

    render(<WeatherDashWidget widget={widget} weather={weather} aqi={aqi} />);

    expect(screen.getByTestId('weather-dashboard-card')).toHaveClass(
      'dashboard-weather-card-wide',
    );
  });
});
