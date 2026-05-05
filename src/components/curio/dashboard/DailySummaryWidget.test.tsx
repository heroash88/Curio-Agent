import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DailySummaryWidget from './DailySummaryWidget';
import { DashboardWidgetActionSlotContext } from './WidgetShell';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import type { WeatherData } from '../../../services/weatherService';

const widgetSizeMock = vi.hoisted(() => ({
  current: {
    w: 2,
    h: 2,
    area: 4,
    sizeClass: 'small',
    isWide: false,
    isTall: false,
    isCompact: true,
    pixelWidth: 280,
    pixelHeight: 230,
  },
}));

const localTaskMock = vi.hoisted(() => ({
  tasks: [] as Array<{ id: string; name: string; completed: boolean }>,
}));

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    display: 'font-display',
    muted: 'text-muted',
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => widgetSizeMock.current,
}));

vi.mock('../../../hooks/useSyncedDashboardTime', () => ({
  useSyncedDashboardTime: () => new Date('2026-04-25T09:30:00'),
}));

vi.mock('../../../utils/settingsStorage', () => ({
  useGoogleCalendarAccessToken: () => null,
  useHaMcpEnabled: () => false,
  useHaMcpUrl: () => '',
  useNotificationSystemStatus: () => ({ enabled: true }),
  useOutlookCalendarAccessToken: () => null,
  useRoutines: () => [],
  useSettingsStorageValue: (reader: () => unknown, fallback: unknown) =>
    typeof reader === 'function' ? reader() : fallback,
  useTempUnit: () => 'F',
  useUserName: () => 'Alexandria Longname',
}));

vi.mock('../../../services/chorePersistence', () => ({
  getChores: () => [],
  getTasks: () => localTaskMock.tasks,
}));

vi.mock('../../../services/notesPersistence', () => ({
  getReminders: () => [],
}));

vi.mock('../../../services/notificationCenterStore', () => ({
  useNotificationCenterEntries: () => [],
  useUnreadNotificationCount: () => 0,
}));

vi.mock('../../../services/icalCalendarApi', () => ({
  getICalCalendarSources: () => [],
  listICalEvents: vi.fn(async () => []),
  subscribeICalCalendarSources: () => () => undefined,
}));

const widget: DashboardWidget = {
  id: 'daily-summary-test',
  type: 'daily_summary',
  position: 0,
  size: 'small',
  enabled: true,
  config: {
    w: 2,
    h: 2,
    dailySummaryModules: ['weather', 'calendar', 'tasks', 'notifications'],
  },
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
};

const setWidgetSize = (
  w: number,
  h: number,
  pixelWidth: number,
  pixelHeight: number,
) => {
  widgetSizeMock.current = {
    w,
    h,
    area: w * h,
    sizeClass: pixelHeight <= 220 || pixelWidth <= 320 ? 'small' : 'medium',
    isWide: w >= 3 || pixelWidth >= 420,
    isTall: h >= 3 || pixelHeight >= 320,
    isCompact: w <= 2 && h <= 2,
    pixelWidth,
    pixelHeight,
  };
};

const renderWidget = (overrides: Partial<DashboardWidget> = {}) =>
  render(
    <DailySummaryWidget
      widget={{ ...widget, ...overrides, config: { ...widget.config, ...overrides.config } }}
      weather={weather}
      aqi={null}
      activeProfileName="Alexandria Longname"
    />,
  );

describe('DailySummaryWidget', () => {
  beforeEach(() => {
    localTaskMock.tasks = [];
    widgetSizeMock.current = {
      w: 2,
      h: 2,
      area: 4,
      sizeClass: 'small',
      isWide: false,
      isTall: false,
      isCompact: true,
      pixelWidth: 280,
      pixelHeight: 230,
    };
  });

  it('renders the reference-style daily summary list', () => {
    const { container } = renderWidget();

    expect(screen.getByTestId('daily-summary-body')).toHaveClass(
      'min-h-0',
      'overflow-hidden',
    );
    expect(screen.getByTestId('daily-summary-body')).toHaveAttribute(
      'data-widget-primitive',
      'body',
    );
    expect(screen.getByTestId('daily-summary-heading')).toHaveTextContent(
      'Daily Summary',
    );
    expect(screen.getByTestId('daily-summary-heading')).toHaveAttribute(
      'data-widget-primitive',
      'text',
    );
    expect(screen.getByText('Saturday, April 25')).toBeInTheDocument();

    const list = screen.getByTestId('daily-summary-module-grid');
    expect(list).toHaveClass('overflow-y-auto', 'dashboard-widget-touch-scroll-y');
    expect(container).toHaveTextContent('Weather');
    expect(container).toHaveTextContent('Calendar');
    expect(container).toHaveTextContent('Tasks');
    expect(container).toHaveTextContent('Alerts');
    expect(within(list).getByText('Weather')).toBeInTheDocument();
    expect(within(list).getByText('72\u00b0F - Partly Cloudy')).toBeInTheDocument();
    expect(within(list).getByText('Calendar')).toBeInTheDocument();
    expect(within(list).getByText('No events today')).toBeInTheDocument();
    expect(within(list).getByText('Tasks')).toBeInTheDocument();
    expect(within(list).getByText('No open tasks')).toBeInTheDocument();
    expect(within(list).getByText('Alerts')).toBeInTheDocument();
    expect(within(list).getByText('No active alerts')).toBeInTheDocument();
  });

  it('counts internal tasks as completed progress in the tasks row', () => {
    localTaskMock.tasks = [
      { id: 'task_1', name: 'Do the thing', completed: false },
      { id: 'task_2', name: 'Done thing', completed: true },
    ];

    renderWidget({
      config: {
        dailySummaryModules: ['tasks'],
      },
    });

    expect(screen.getByText('1 of 2 completed')).toBeInTheDocument();
  });

  it('uses a wide option with text summary and data rows', () => {
    widgetSizeMock.current = {
      w: 4,
      h: 3,
      area: 12,
      sizeClass: 'large',
      isWide: true,
      isTall: false,
      isCompact: false,
      pixelWidth: 920,
      pixelHeight: 560,
    };

    renderWidget();

    const body = screen.getByTestId('daily-summary-body');
    expect(body).toHaveClass(
      'grid',
      'grid-cols-[minmax(0,1.15fr)_minmax(280px,1fr)]',
    );
    expect(screen.getByTestId('daily-summary-text-summary')).toHaveTextContent(
      '72\u00b0F and partly cloudy',
    );
    expect(screen.getByTestId('daily-summary-text-summary')).toHaveTextContent(
      '0 open queue items',
    );
    expect(screen.getByTestId('daily-summary-module-grid')).toHaveClass(
      'overflow-y-auto',
    );
  });

  it.each([
    ['2x2', 2, 2, 330, 202, 3],
    ['3x2', 3, 2, 504, 202, 3],
    ['2x3', 2, 3, 330, 294, 4],
    ['3x3', 3, 3, 504, 294, 4],
  ])(
    'keeps the %s layout dense without collapsed module rows',
    (_label, w, h, pixelWidth, pixelHeight, expectedModules) => {
      setWidgetSize(w, h, pixelWidth, pixelHeight);

      renderWidget({
        config: {
          w,
          h,
          dailySummaryModules: ['weather', 'calendar', 'tasks', 'notifications'],
        },
      });

      const body = screen.getByTestId('daily-summary-body');
      expect(body).toHaveClass('gap-2');
      expect(body).not.toHaveClass('pt-[3.5rem]');
      expect(body).not.toHaveClass('pt-[3.25rem]');

      const renderedLabels = ['Weather', 'Calendar', 'Tasks', 'Alerts'].slice(
        0,
        expectedModules,
      );
      expect(renderedLabels.map((name) => screen.getByText(name))).toHaveLength(
        expectedModules,
      );

      renderedLabels.forEach((name) => {
        const row = screen.getByText(name).parentElement?.parentElement;
        expect(row).toBeTruthy();
        expect(row).not.toHaveClass('flex-1');
        expect(row).toHaveClass('min-h-9');
      });
    },
  );

  it('keeps dashboard action dots visible on the summary surface', () => {
    render(
      <DashboardWidgetActionSlotContext.Provider value={<button type="button">Widget controls</button>}>
        <DailySummaryWidget
          widget={widget}
          weather={weather}
          aqi={null}
          activeProfileName="Alexandria Longname"
        />
      </DashboardWidgetActionSlotContext.Provider>,
    );

    expect(screen.getByText('Widget controls').parentElement).toHaveClass('opacity-100');
    expect(screen.getByText('Widget controls').parentElement).not.toHaveClass('opacity-0');
  });
});
