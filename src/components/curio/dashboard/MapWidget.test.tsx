import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MapWidget from './MapWidget';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import type { WeatherData } from '../../../services/weatherService';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: true,
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
    surfaceContainerLow: 'surface-low',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => ({
    sizeClass: 'medium',
    isCompact: false,
  }),
}));

vi.mock('../../../hooks/useDashboardRefresh', () => ({
  useDashboardRefresh: () => undefined,
}));

vi.mock('../../../utils/settingsStorage', () => ({
  useHomeLocation: () => '123 Home Street',
  useWorkLocation: () => '456 Work Ave',
}));

vi.mock('../../cards/MapPreview', () => ({
  LocationPreview: ({ label, className }: { label: string; className?: string }) => (
    <div className={className} data-testid="location-preview">{label}</div>
  ),
}));

const widget: DashboardWidget = {
  id: 'map-test',
  type: 'map',
  position: 0,
  size: 'medium',
  enabled: true,
  config: {},
};

const weather: WeatherData = {
  city: 'Sample City',
  tempF: 61,
  tempC: 16,
  icon: 'clear',
  desc: 'Clear',
  humidity: 40,
  windSpeedMph: 5,
  feelsLikeF: 60,
  feelsLikeC: 16,
  latitude: 47.48,
  longitude: -122.2,
};

const makeScrollable = (element: HTMLElement) => {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: 160 });
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: 420 });
};

describe('MapWidget', () => {
  it('scrolls location tabs horizontally with a mouse wheel', () => {
    const { container } = render(<MapWidget widget={widget} weather={weather} />);
    const tabs = screen.getByTestId('map-location-tabs');
    makeScrollable(tabs);

    fireEvent.wheel(tabs, { deltaY: 80 });

    expect(container.querySelector('[data-widget-primitive="body"]')).toBeInTheDocument();
    expect(tabs).toHaveClass('overflow-x-auto');
    expect(tabs.scrollLeft).toBeGreaterThan(0);
  });

  it('preserves normal tab clicks when the location tabs are not dragged', () => {
    render(<MapWidget widget={widget} weather={weather} />);

    fireEvent.click(screen.getByRole('button', { name: 'home' }));

    expect(screen.getByRole('button', { name: 'home' })).toHaveClass('bg-[var(--ether-control-active-bg)]');
  });

  it('does not turn a drag-scroll gesture into a tab click', () => {
    render(<MapWidget widget={widget} weather={weather} />);
    const tabs = screen.getByTestId('map-location-tabs');
    makeScrollable(tabs);

    fireEvent.pointerDown(tabs, { pointerId: 1, button: 0, clientX: 140 });
    fireEvent.pointerMove(tabs, { pointerId: 1, clientX: 40 });
    fireEvent.pointerUp(tabs, { pointerId: 1, clientX: 40 });
    fireEvent.click(screen.getByRole('button', { name: 'home' }));

    expect(screen.getByRole('button', { name: 'current' })).toHaveClass('bg-[var(--ether-control-active-bg)]');
  });
});
