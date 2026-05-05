import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ForecastWidget from './ForecastWidget';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import type { WeatherData } from '../../../services/weatherService';

const weatherByCity: Record<string, WeatherData> = {
  'Sample City': {
    city: 'Sample City',
    tempF: 72,
    tempC: 22,
    icon: 'partlyCloudyDay',
    desc: 'Partly Cloudy',
    humidity: 42,
    windSpeedMph: 8,
    daily: [
      { date: 'Mon', highF: 72, lowF: 56, highC: 22, lowC: 13, icon: 'sun', condition: 'Clear', humidity: 5 },
      { date: 'Tue', highF: 75, lowF: 58, highC: 24, lowC: 14, icon: 'partlyCloudyDay', condition: 'Mostly Clear', humidity: 10 },
      { date: 'Wed', highF: 79, lowF: 60, highC: 26, lowC: 16, icon: 'cloud', condition: 'Cloudy', humidity: 35 },
      { date: 'Thu', highF: 81, lowF: 62, highC: 27, lowC: 17, icon: 'rain', condition: 'Light Rain', humidity: 65 },
      { date: 'Fri', highF: 78, lowF: 59, highC: 26, lowC: 15, icon: 'sun', condition: 'Clear', humidity: 15 },
      { date: 'Sat', highF: 73, lowF: 55, highC: 23, lowC: 13, icon: 'sun', condition: 'Clear', humidity: 8 },
    ],
  },
  Paris: {
    city: 'Paris',
    tempF: 63,
    tempC: 17,
    icon: 'rain',
    desc: 'Light Rain',
    humidity: 71,
    windSpeedMph: 12,
    daily: [
      { date: 'Mon', highF: 63, lowF: 48, highC: 17, lowC: 9, icon: 'rain', condition: 'Light Rain', humidity: 70 },
      { date: 'Tue', highF: 61, lowF: 47, highC: 16, lowC: 8, icon: 'cloud', condition: 'Cloudy', humidity: 55 },
      { date: 'Wed', highF: 64, lowF: 49, highC: 18, lowC: 9, icon: 'partlyCloudyDay', condition: 'Partly Cloudy', humidity: 25 },
      { date: 'Thu', highF: 66, lowF: 50, highC: 19, lowC: 10, icon: 'sun', condition: 'Clear', humidity: 10 },
      { date: 'Fri', highF: 67, lowF: 51, highC: 19, lowC: 11, icon: 'sun', condition: 'Clear', humidity: 5 },
    ],
  },
};

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    headline: 'font-headline',
    muted: 'text-muted',
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
    surfaceContainer: 'surface-container',
    surfaceContainerLow: 'surface-container-low',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => ({
    w: 3,
    h: 3,
    area: 9,
    pixelWidth: 440,
    pixelHeight: 360,
    sizeClass: 'large',
    isCompact: false,
    isTall: false,
    isWide: true,
  }),
}));

vi.mock('../../../hooks/useDashboardWeatherData', () => ({
  useDashboardWeatherData: ({ city, fallbackWeather }: { city?: string; fallbackWeather: WeatherData | null }) => {
    const key = city?.trim() || fallbackWeather?.city || 'Sample City';
    return {
      weather: weatherByCity[key] || { ...(weatherByCity['Sample City']), city: key },
      aqi: null,
      loading: false,
    };
  },
}));

vi.mock('../../../utils/settingsStorage', () => ({
  useTempUnit: () => 'F',
}));

const widget: DashboardWidget = {
  id: 'forecast-test',
  type: 'forecast',
  position: 0,
  size: 'large',
  enabled: true,
  config: {
    forecastCities: ['Sample City', 'Paris'],
  },
};

describe('ForecastWidget', () => {
  beforeEach(() => {
    localStorage.clear();
    // Exercise the legacy input/plus-button add form. InlineQuickAdd has
    // its own coverage in the primitive tests.
    localStorage.setItem(
      'curio_dashboard_prefs',
      JSON.stringify({ interactivity: { inlineQuickAddEnabled: false } }),
    );
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders the renamed Weather Outlook with five forecast days for the active city', () => {
    const { container } = render(
      <ForecastWidget widget={widget} weather={weatherByCity['Sample City']} aqi={null} />,
    );

    expect(screen.getByText('Weather Outlook')).toBeInTheDocument();
    expect(container.querySelector('.lucide-cloud-sun')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Sample City outlook' })).toHaveClass('bg-[var(--ether-primary)]/12');

    const days = screen.getAllByTestId('forecast-day-card');
    expect(days).toHaveLength(5);
    expect(within(days[0]).getByText('Today')).toBeInTheDocument();
    expect(within(days[4]).getByText('Fri')).toBeInTheDocument();
    expect(screen.queryByText('Sat')).not.toBeInTheDocument();
    expect(screen.getByText(/Warming trend/i)).toBeInTheDocument();
    expect(screen.getByText(/Rain risk/i)).toBeInTheDocument();
  });

  it('adds, selects, and removes tracked forecast cities', () => {
    const onUpdateWidgetConfig = vi.fn();

    render(
      <ForecastWidget
        widget={widget}
        weather={weatherByCity['Sample City']}
        aqi={null}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Paris outlook' }));
    expect(screen.getAllByText('Paris').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('63°F')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Add forecast city'), {
      target: { value: 'Tokyo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add tracked forecast city' }));
    expect(onUpdateWidgetConfig).toHaveBeenCalledWith('forecast-test', {
      forecastCities: ['Sample City', 'Paris', 'Tokyo'],
      city: 'Tokyo',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Paris' }));
    expect(onUpdateWidgetConfig).toHaveBeenLastCalledWith('forecast-test', {
      forecastCities: ['Sample City', 'Tokyo'],
      city: 'Tokyo',
    });
  });
});
