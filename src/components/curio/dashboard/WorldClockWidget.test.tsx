import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorldClockWidget from './WorldClockWidget';
import type { DashboardWidget } from '../../../services/dashboardTypes';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: false,
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
    w: 4,
    h: 3,
    area: 12,
    pixelWidth: 900,
    pixelHeight: 360,
    sizeClass: 'large',
    isCompact: false,
    isTall: false,
    isWide: true,
  }),
}));

vi.mock('../../../hooks/useSyncedDashboardTime', () => ({
  useSyncedDashboardTime: () => new Date('2026-04-29T12:30:00.000Z'),
}));

vi.mock('../../../utils/settingsStorage', () => ({
  useClockShowSeconds: () => false,
  useClockUse24Hour: () => false,
}));

const widget: DashboardWidget = {
  id: 'world-clock-test',
  type: 'world_clock',
  position: 0,
  size: 'large',
  enabled: true,
  config: {
    timezones: ['America/Los_Angeles', 'Europe/London'],
  },
};

describe('WorldClockWidget', () => {
  beforeEach(() => {
    localStorage.clear();
    // Keep the supplementary InlineQuickAdd hidden so legacy search-form
    // assertions see a single add path.
    localStorage.setItem(
      'curio_dashboard_prefs',
      JSON.stringify({ interactivity: { inlineQuickAddEnabled: false } }),
    );
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows each city side by side in a compact clock rail with its own time and date', () => {
    render(<WorldClockWidget widget={widget} />);

    const cityGrid = screen.getByTestId('world-clock-city-grid');
    expect(cityGrid).toHaveClass('grid');
    expect(cityGrid).toHaveClass('sm:grid-cols-3');

    const losAngeles = screen.getByRole('article', { name: /Los Angeles world clock/i });
    const london = screen.getByRole('article', { name: /London world clock/i });

    expect(losAngeles).toHaveClass('bg-transparent');
    expect(within(losAngeles).getByText('Los Angeles')).toBeInTheDocument();
    expect(within(losAngeles).getByText(/Apr 29/)).toBeInTheDocument();
    expect(within(london).getByText('London')).toBeInTheDocument();
    expect(within(london).getByText(/Apr 29/)).toBeInTheDocument();
    expect(screen.getAllByTestId('world-clock-dial')).toHaveLength(2);
  });

  it('opens the expanded dashboard view from the shared header icon trigger', () => {
    let expandedWidgetId: string | null = null;
    const handleFocusWidget = (event: Event) => {
      expandedWidgetId = (event as CustomEvent<{ widgetId: string }>).detail?.widgetId || null;
    };
    window.addEventListener('curio-focus-widget', handleFocusWidget);

    render(<WorldClockWidget widget={widget} />);

    fireEvent.click(screen.getByRole('button', { name: 'Expand World Clock widget' }));

    expect(expandedWidgetId).toBe(widget.id);
    window.removeEventListener('curio-focus-widget', handleFocusWidget);
  });

  it('renders simple black-and-white analog clock faces with clear hands', () => {
    render(<WorldClockWidget widget={widget} />);

    const dial = screen.getAllByTestId('world-clock-dial')[0];
    const hourHand = screen.getAllByTestId('world-clock-hour-hand')[0];
    const minuteHand = screen.getAllByTestId('world-clock-minute-hand')[0];
    const hourMarks = screen.getAllByTestId('world-clock-hour-mark');

    expect(dial).toHaveClass('bg-white', 'border-black/75');
    expect(hourHand).toHaveClass('bg-black', 'w-[4px]');
    expect(minuteHand).toHaveClass('bg-[#2563eb]', 'w-[2.5px]');
    expect(minuteHand).not.toHaveClass('bg-black');
    expect(hourMarks).toHaveLength(24);
    hourMarks.forEach((mark) => {
      expect(mark).toHaveClass('h-2', 'w-[2px]', 'bg-black/65');
      expect(mark).not.toHaveClass('h-3', 'w-[3px]', 'bg-black');
    });
  });

  it('adds and removes cities through a searchable city picker', () => {
    const onUpdateWidgetConfig = vi.fn();

    render(
      <WorldClockWidget
        widget={widget}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open city search' }));
    fireEvent.change(screen.getByLabelText('Search city to add'), {
      target: { value: 'San Francisco' },
    });
    fireEvent.click(screen.getByRole('option', { name: 'Add San Francisco' }));

    expect(onUpdateWidgetConfig).toHaveBeenCalledWith('world-clock-test', {
      timezones: ['America/Los_Angeles', 'Europe/London', 'America/Los_Angeles'],
      worldClockCities: [
        { label: 'Los Angeles', timeZone: 'America/Los_Angeles' },
        { label: 'London', timeZone: 'Europe/London' },
        { label: 'San Francisco', timeZone: 'America/Los_Angeles' },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove London' }));

    expect(onUpdateWidgetConfig).toHaveBeenLastCalledWith('world-clock-test', {
      timezones: ['America/Los_Angeles', 'America/Los_Angeles'],
      worldClockCities: [
        { label: 'Los Angeles', timeZone: 'America/Los_Angeles' },
        { label: 'San Francisco', timeZone: 'America/Los_Angeles' },
      ],
    });
  });

  it('keeps city names readable and hides search until the icon button opens it', () => {
    render(<WorldClockWidget widget={widget} />);

    expect(screen.queryByLabelText('Search city to add')).not.toBeInTheDocument();
    const searchButton = screen.getByRole('button', { name: 'Open city search' });
    expect(searchButton).toHaveClass('dashboard-widget-control-button');

    const losAngeles = screen.getByRole('article', { name: /Los Angeles world clock/i });
    const cityName = within(losAngeles).getByText('Los Angeles');

    expect(cityName).not.toHaveClass('truncate');

    fireEvent.click(searchButton);
    expect(searchButton).toHaveClass('dashboard-widget-control-button-active');

    const search = screen.getByLabelText('Search city to add');
    expect(search).toBeInTheDocument();

    const resultList = screen.getByRole('listbox', { name: 'City search results' });
    expect(resultList).toHaveClass('bg-[var(--ether-overlay-panel)]');
    expect(screen.getByRole('option', { name: 'Add New York' })).toBeInTheDocument();
  });
});
