import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import CalendarWidget from './CalendarWidget';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    headline: 'font-headline',
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => ({
    w: 3,
    h: 2,
    area: 6,
    sizeClass: 'medium',
    isWide: true,
    isTall: false,
    isCompact: false,
    pixelWidth: 420,
    pixelHeight: 320,
  }),
}));

vi.mock('../../../hooks/useDashboardRefresh', () => ({
  useDashboardRefresh: () => ({
    policy: { shouldPoll: false, intervalMs: 0 },
    refreshNow: vi.fn(),
  }),
}));

vi.mock('../../../utils/settingsStorage', () => ({
  useGoogleCalendarAccessToken: () => 'google-token',
  useOutlookCalendarAccessToken: () => null,
}));

vi.mock('../../../services/icalCalendarApi', () => ({
  getICalCalendarSources: () => [],
  listICalEvents: vi.fn(async () => []),
  subscribeICalCalendarSources: () => () => undefined,
}));

const buildWidget = (): DashboardWidget => ({
  id: 'calendar-test',
  type: 'calendar',
  position: 0,
  size: 'medium',
  enabled: true,
  config: {
    w: 3,
    h: 2,
    calendarDesign: 'studio',
  },
});

describe('CalendarWidget', () => {
  it('keeps the studio timeline scrollable when the widget is resized short', () => {
    render(<CalendarWidget widget={buildWidget()} />);

    const timeline = screen.getByTestId('calendar-studio-timeline');
    expect(timeline).toHaveClass(
      'dashboard-widget-touch-scroll',
      'min-h-0',
      'flex-1',
    );
    expect(timeline).not.toHaveClass('overflow-hidden');
  });

  it('lets the schedule move beyond the current week even when the selected date is empty', () => {
    render(<CalendarWidget widget={buildWidget()} />);

    const label = screen.getByRole('button', { name: 'Jump to today' });
    const initialLabel = label.textContent;

    fireEvent.click(screen.getByRole('button', { name: 'Next date range' }));

    expect(screen.getByTestId('calendar-date-controls')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jump to today' }).textContent).not.toBe(initialLabel);

    fireEvent.click(screen.getByText('day'));
    fireEvent.click(screen.getByRole('button', { name: 'Next date range' }));

    expect(screen.getByRole('button', { name: 'Jump to today' }).textContent).toContain('-');
  });

  it('keeps a weekly board available in studio mode', () => {
    render(<CalendarWidget widget={buildWidget()} />);

    fireEvent.click(screen.getByText('day'));

    expect(screen.getByTestId('calendar-week-board')).toBeInTheDocument();
    expect(screen.getAllByTestId('calendar-week-day')).toHaveLength(7);
  });

  it('renders Zapier as a first-class calendar provider', () => {
    render(<CalendarWidget widget={{
      ...buildWidget(),
      id: 'zapier-calendar',
      config: {
        ...buildWidget().config,
        calendarProvider: 'zapier',
      },
    }} />);

    expect(screen.getByText('Zapier Calendar')).toBeInTheDocument();
  });
});
