import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DateInfoWidget from './DateInfoWidget';
import type { DashboardWidget } from '../../../services/dashboardTypes';

const widgetSizeMock = vi.hoisted(() => ({
  current: {
    w: 3,
    h: 3,
    area: 9,
    pixelWidth: 440,
    pixelHeight: 360,
    sizeClass: 'large',
    isCompact: false,
    isTall: true,
    isWide: true,
  },
}));

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    headline: 'font-headline',
    muted: 'text-muted',
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => widgetSizeMock.current,
}));

vi.mock('../../../hooks/useSyncedDashboardTime', () => ({
  useSyncedDashboardTime: () => new Date('2026-04-29T12:00:00-07:00'),
}));

const buildWidget = (config: Record<string, unknown> = {}): DashboardWidget => ({
  id: 'date-info-test',
  type: 'date_info',
  position: 0,
  size: 'large',
  enabled: true,
  config: {
    w: 3,
    h: 3,
    dateInfoFiscalYearStartMonth: 4,
    dateInfoMetrics: ['dayOfYear', 'daysLeft', 'calendarWeek', 'isoWeek', 'fiscalWeek'],
    dateInfoImportantDates: [
      { id: 'launch', label: 'Launch day', date: '2026-05-10', recurringAnnual: false },
      { id: 'birthday', label: 'Birthday', date: '07-04', recurringAnnual: true },
    ],
    ...config,
  },
});

describe('DateInfoWidget', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders configurable date facts, calendar week, fiscal info, and a full year calendar', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T12:00:00-07:00'));

    render(<DateInfoWidget widget={buildWidget()} />);

    expect(screen.getByTestId('date-info-panel')).toHaveClass('dashboard-date-info-widget');
    expect(screen.getByText('Calendar week')).toBeInTheDocument();
    expect(screen.getByText('ISO week')).toBeInTheDocument();
    expect(screen.getByText('Fiscal week')).toBeInTheDocument();
    expect(screen.getByText(/FY2027/i)).toBeInTheDocument();

    const yearCalendar = screen.getByTestId('date-info-year-calendar');
    expect(within(yearCalendar).getAllByTestId('date-info-month')).toHaveLength(12);
    expect(within(yearCalendar).getByLabelText('April 29, 2026')).toHaveTextContent('29');
    expect(screen.getByText('Launch day')).toBeInTheDocument();
    expect(screen.getByText('Birthday')).toBeInTheDocument();
  });

  it('allows important dates to be added and removed from the widget', () => {
    const onUpdateWidgetConfig = vi.fn();

    render(
      <DateInfoWidget
        widget={buildWidget({ dateInfoImportantDates: [] })}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    fireEvent.change(screen.getByLabelText('Important date title'), {
      target: { value: 'Project review' },
    });
    fireEvent.change(screen.getByLabelText('Important date'), {
      target: { value: '2026-06-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add important date' }));

    expect(onUpdateWidgetConfig).toHaveBeenCalledWith('date-info-test', {
      dateInfoImportantDates: [
        expect.objectContaining({
          label: 'Project review',
          date: '2026-06-15',
          recurringAnnual: false,
        }),
      ],
    });

    render(
      <DateInfoWidget
        widget={buildWidget({
          dateInfoImportantDates: [
            { id: 'review', label: 'Project review', date: '2026-06-15', recurringAnnual: false },
          ],
        })}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove Project review' }));
    expect(onUpdateWidgetConfig).toHaveBeenLastCalledWith('date-info-test', {
      dateInfoImportantDates: [],
    });
  });

  it('opens an expanded mini month calendar with week, month, year, and week number controls', () => {
    const onUpdateWidgetConfig = vi.fn();

    render(
      <DateInfoWidget
        widget={buildWidget({ dateInfoShowWeekNumbers: false })}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    const miniMonth = screen.getByRole('button', { name: /open expanded april 2026 calendar/i });
    expect(within(miniMonth).getByText('APRIL')).toBeInTheDocument();
    expect(within(miniMonth).getByTestId('date-info-mini-selected-day')).toHaveTextContent('29');

    fireEvent.click(miniMonth);

    const dialog = screen.getByRole('dialog', { name: /expanded date calendar/i });
    expect(within(dialog).getByRole('tab', { name: 'Week' })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Month' })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Year' })).toBeInTheDocument();
    expect(within(dialog).getByText('April 2026')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /show week numbers/i }));
    expect(onUpdateWidgetConfig).toHaveBeenCalledWith('date-info-test', {
      dateInfoShowWeekNumbers: true,
    });

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Week' }));
    expect(within(dialog).getByText(/Calendar week/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Year' }));
    expect(within(dialog).getByText('2026')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /next year/i }));
    expect(within(dialog).getByText('2027')).toBeInTheDocument();
  });
});
