import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import Dashboard, { getClampedWidgetActionMenuPosition } from './Dashboard';
import type { WeatherData } from '../../services/weatherService';

const mockDashboardWidgets = vi.hoisted(() => [
  {
    id: 'weather_1',
    type: 'weather',
    position: 0,
    size: 'large',
    enabled: true,
    config: { w: 2, h: 2 },
  },
]);

const mockDashboardPages = vi.hoisted(() => [
  {
    id: 'home',
    name: 'Home',
    widgets: [
      {
        id: 'weather_1',
        type: 'weather',
        position: 0,
        size: 'large',
        enabled: true,
        config: { w: 2, h: 2 },
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  },
]);

const mockDashboardPageState = vi.hoisted(() => ({
  activeId: 'home',
}));

const mockDashboardPageSetters = vi.hoisted(() => ({
  setPages: vi.fn((pages: typeof mockDashboardPages) => {
    mockDashboardPages.splice(0, mockDashboardPages.length, ...pages);
  }),
  setActiveId: vi.fn((pageId: string) => {
    mockDashboardPageState.activeId = pageId;
  }),
}));

const mockSettingsState = vi.hoisted(() => ({
  proactiveConfig: { enabled: true, rules: [] as Array<Record<string, unknown>> },
  notificationStatus: {
    enabled: true,
    activeRuleCount: 0,
    availableRuleCount: 0,
    pausedRuleCount: 0,
  },
  routines: [] as Array<Record<string, unknown>>,
  themeMode: 'dark' as 'light' | 'dark',
  dashboardPreferences: {
    mode: 'grid',
    snapToGrid: true,
    accentPreset: 'cobalt',
    glassEffectEnabled: true,
    glassEffectIntensity: 50,
    reduceMotion: true,
    widgetGlowEnabled: false,
    showPageSwitcher: true,
    pageKeyboardShortcutsEnabled: true,
  },
}));

const mockBackgroundPresets = vi.hoisted(() => [
  {
    id: 'curio-studio-light',
    label: 'Studio Light',
    value: '/assets/backgrounds/curio-studio-light.png',
    style: 'image',
    dark: false,
  },
  {
    id: 'paper-lantern',
    label: 'Paper Lantern',
    value: 'linear-gradient(135deg, #f7eee2, #9fb6bf)',
    style: 'gradient',
    dark: false,
  },
  {
    id: 'cream',
    label: 'Cream',
    value: '#fef3c7',
    style: 'solid',
    dark: false,
  },
]);

const mockNotificationState = vi.hoisted(() => ({
  entries: [] as Array<Record<string, unknown>>,
  unread: 0,
  clear: vi.fn(),
  markAllRead: vi.fn(),
}));

vi.mock('../../utils/settingsStorage', () => ({
  APP_BACKGROUND_PRESETS: mockBackgroundPresets,
  FACE_STYLES: [
    { id: 'curio', label: 'Curio' },
    { id: 'bender', label: 'Bender' },
    { id: 'kiro', label: 'Kiro' },
  ],
  buildAppBackgroundCss: () => undefined,
  getFaceStyleId: () => 'curio',
  setAppBackgroundColor: vi.fn(),
  setAppBackgroundStyle: vi.fn(),
  setProfileActiveDashboardPageId: mockDashboardPageSetters.setActiveId,
  setProfileDashboardPages: mockDashboardPageSetters.setPages,
  setDashboardTitle: vi.fn(),
  setFaceStyleId: vi.fn(),
  setNotificationSystemEnabled: vi.fn(),
  setProfileDashboardLayout: vi.fn(),
  setProfileDashboardPreferences: vi.fn(),
  setProactiveConfig: vi.fn(),
  setTempUnit: vi.fn(),
  setThemeMode: vi.fn(),
  setUserAvatarDataUrl: vi.fn(),
  setUserName: vi.fn(),
  useAppBackgroundColor: () => '',
  useAppBackgroundStyle: () => 'default',
  useDashboardTitle: () => '',
  useHaMcpEnabled: () => false,
  useHaMcpUrl: () => '',
  useProfileActiveDashboardPageId: () => mockDashboardPageState.activeId,
  useProfileDashboardPages: () => mockDashboardPages,
  useProfileDashboardLayout: () => mockDashboardWidgets,
  useProfileDashboardPreferences: () => mockSettingsState.dashboardPreferences,
  useProactiveConfig: () => mockSettingsState.proactiveConfig,
  useNotificationSystemStatus: () => mockSettingsState.notificationStatus,
  useRoutines: () => mockSettingsState.routines,
  useTempUnit: () => 'F',
  useThemeMode: () => mockSettingsState.themeMode,
  useUserAvatarDataUrl: () => '',
  useUserName: () => '',
  toggleNotificationRuleEnabled: vi.fn(),
}));

vi.mock('../../services/notificationCenterStore', () => ({
  clearNotificationCenterEntries: mockNotificationState.clear,
  markAllNotificationCenterEntriesRead: mockNotificationState.markAllRead,
  useNotificationCenterEntries: () => mockNotificationState.entries,
  useUnreadNotificationCount: () => mockNotificationState.unread,
}));

vi.mock('../../services/speakerSessionStore', () => ({
  useSpeakerSessionState: () => ({
    activeProfileId: null,
    activeProfileName: '',
    recognizedBy: null,
    updatedAt: 0,
  }),
}));

vi.mock('./dashboard/dashboardRegistry', async () => {
  const React = await import('react');
  const { DashboardWidgetActionSlotContext } =
    await vi.importActual<typeof import('./dashboard/WidgetShell')>(
      './dashboard/WidgetShell',
    );

  return {
    DASHBOARD_WIDGET_GROUPS: [
      {
        key: 'productivity',
        label: 'Productivity',
        types: ['rich_note'],
      },
    ],
    preloadDashboardWidgetComponents: vi.fn(),
    WIDGET_COMPONENTS: {
      weather: ({ widget }: { widget: { id: string } }) => (
        <div data-testid={`widget-body-${widget.id}`}>Weather widget body</div>
      ),
      news: ({ widget }: { widget: { id: string } }) => {
        const actionSlot = React.useContext(DashboardWidgetActionSlotContext);
        return (
          <div data-testid={`widget-body-${widget.id}`}>
            {actionSlot}
            News widget body
          </div>
        );
      },
      system_status: ({ widget }: { widget: { id: string } }) => {
        const actionSlot = React.useContext(DashboardWidgetActionSlotContext);
        return (
          <div data-testid={`widget-body-${widget.id}`}>
            {actionSlot}
            System widget body
          </div>
        );
      },
      screen_time: ({ widget }: { widget: { id: string } }) => {
        const actionSlot = React.useContext(DashboardWidgetActionSlotContext);
        return (
          <div data-testid={`widget-body-${widget.id}`}>
            {actionSlot}
            Insights widget body
          </div>
        );
      },
      robot_face: ({
        widget,
      }: {
        widget: { id: string; config: Record<string, unknown> };
      }) => {
        const actionSlot = React.useContext(DashboardWidgetActionSlotContext);
        return (
          <div data-testid={`widget-body-${widget.id}`}>
            {actionSlot}
            <div>Robot style {String(widget.config.robotFaceStyle || 'curio')}</div>
            <div>Robot color {String(widget.config.robotAccentColor || '#38bdf8')}</div>
          </div>
        );
      },
      rich_note: ({
        widget,
        onCreateWidget,
      }: {
        widget: { id: string };
        onCreateWidget?: (
          type: string,
          config: Record<string, unknown>,
          options?: { afterWidgetId?: string },
        ) => void;
      }) => (
        <div data-testid={`widget-body-${widget.id}`}>
          Sticky note body
          <button
            type="button"
            onClick={() =>
              onCreateWidget?.(
                'rich_note',
                {
                  richNoteTitle: 'Sticky Note 2',
                  richNoteHtml: '',
                  richNotePinnedToGrid: false,
                },
                { afterWidgetId: widget.id },
              )
            }
          >
            Mock add sticky note
          </button>
        </div>
      ),
    },
  };
});

vi.mock('./dashboard/ICalCalendarSettings', () => ({
  default: () => null,
}));

const weather: WeatherData = {
  city: 'Sample City',
  tempF: 59,
  tempC: 15,
  icon: 'sun',
  desc: 'Clear',
  humidity: 46,
  windSpeedMph: 4,
  daily: [
    { date: 'Fri', highF: 59, lowF: 41, highC: 15, lowC: 5, icon: 'sun', condition: 'Clear' },
  ],
};

const resetDashboardNotificationMocks = () => {
  mockSettingsState.proactiveConfig = { enabled: true, rules: [] };
  mockSettingsState.notificationStatus = {
    enabled: true,
    activeRuleCount: 0,
    availableRuleCount: 0,
    pausedRuleCount: 0,
  };
  mockSettingsState.routines = [];
  mockNotificationState.entries = [];
  mockNotificationState.unread = 0;
  mockNotificationState.clear.mockClear();
  mockNotificationState.markAllRead.mockClear();
};

const resetDashboardWidgets = () => {
  mockDashboardWidgets.splice(0, mockDashboardWidgets.length, {
    id: 'weather_1',
    type: 'weather',
    position: 0,
    size: 'large',
    enabled: true,
    config: { w: 2, h: 2 },
  });
  mockDashboardPages.splice(0, mockDashboardPages.length, {
    id: 'home',
    name: 'Home',
    widgets: mockDashboardWidgets,
    createdAt: 1,
    updatedAt: 1,
  });
  mockDashboardPageState.activeId = 'home';
  mockDashboardPageSetters.setPages.mockClear();
  mockDashboardPageSetters.setActiveId.mockClear();
};

beforeEach(() => {
  resetDashboardWidgets();
  mockSettingsState.themeMode = 'dark';
  mockSettingsState.dashboardPreferences.mode = 'grid';
  mockSettingsState.dashboardPreferences.snapToGrid = true;
  mockSettingsState.dashboardPreferences.accentPreset = 'cobalt';
  mockSettingsState.dashboardPreferences.glassEffectEnabled = true;
  mockSettingsState.dashboardPreferences.reduceMotion = true;
  mockSettingsState.dashboardPreferences.widgetGlowEnabled = false;
  mockSettingsState.dashboardPreferences.showPageSwitcher = true;
  mockSettingsState.dashboardPreferences.pageKeyboardShortcutsEnabled = true;
});

const mockCoarsePointer = () => {
  const originalMatchMedia = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches:
        query.includes('hover: none') ||
        query.includes('pointer: coarse'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  return () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
  };
};

const mockDashboardBoardWidth = (width: number, height = 720) => {
  const OriginalResizeObserver = globalThis.ResizeObserver;

  class FixedResizeObserver implements ResizeObserver {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element) {
      this.callback(
        [
          {
            target,
            contentRect: {
              x: 0,
              y: 0,
              width,
              height,
              top: 0,
              left: 0,
              right: width,
              bottom: height,
              toJSON: () => ({}),
            },
          } as unknown as ResizeObserverEntry,
        ],
        this,
      );
    }

    unobserve() {}

    disconnect() {}
  }

  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: FixedResizeObserver,
  });

  return () => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: OriginalResizeObserver,
    });
  };
};

describe('Dashboard widget action menu placement', () => {
  it('clamps menus inside the left edge of the viewport', () => {
    expect(
      getClampedWidgetActionMenuPosition({
        anchorRect: { top: 48, right: 42, bottom: 82 },
        menuWidth: 240,
        menuHeight: 220,
        viewportWidth: 320,
        viewportHeight: 480,
      }),
    ).toEqual({ left: 12, top: 90 });
  });

  it('opens above the button when there is not enough room below', () => {
    expect(
      getClampedWidgetActionMenuPosition({
        anchorRect: { top: 420, right: 350, bottom: 454 },
        menuWidth: 240,
        menuHeight: 190,
        viewportWidth: 360,
        viewportHeight: 500,
      }),
    ).toEqual({ left: 108, top: 222 });
  });
});

describe('Dashboard search', () => {
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>;
  let scrollToSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollIntoViewSpy = vi.fn();
    scrollToSpy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewSpy,
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollToSpy,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses inline search results and clicking a result reveals the existing widget without opening an expanded widget drawer', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Search dashboard' }));

    expect(screen.getByTestId('dashboard-inline-search')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-search-results')).not.toBeInTheDocument();
    expect(screen.queryByText(/No on-screen results/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Dashboard Search')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search dashboard'), {
      target: { value: 'weather' },
    });

    const resultList = await screen.findByTestId('dashboard-search-results');
    expect(resultList).toHaveClass('flex-col');
    const result = screen.getByRole('button', { name: /show weather/i });
    expect(result).toHaveClass('outline-none');
    expect(result).toHaveClass('focus-visible:ring-2');
    fireEvent.click(result);

    await waitFor(() =>
      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({ left: 0, behavior: 'auto' }),
      ),
    );
    const highlightedWidget = document.querySelector(
      '[data-dashboard-widget-id="weather_1"] > div',
    );
    const highlightedWidgetFrame = document.querySelector(
      '[data-dashboard-widget-id="weather_1"]',
    );
    expect(highlightedWidget).toHaveClass('dashboard-widget-search-highlight');
    expect(highlightedWidgetFrame).toHaveStyle({ contain: 'layout style' });
    expect(highlightedWidget).not.toHaveClass('ring-2');
    expect(screen.queryByTestId('dashboard-inline-search')).not.toBeInTheDocument();
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Close expanded widget')).not.toBeInTheDocument();
  });
});

describe('Dashboard notifications panel', () => {
  beforeEach(() => {
    resetDashboardNotificationMocks();
  });

  it('keeps rules and routines hidden until their summary cards are selected', async () => {
    mockSettingsState.proactiveConfig = {
      enabled: true,
      rules: [
        {
          id: 'calendar_default',
          kind: 'calendar',
          label: 'Calendar reminders',
          enabled: true,
          speak: true,
          sound: true,
          showCard: true,
          priority: 'normal',
          leadMinutes: 10,
        },
      ],
    };
    mockSettingsState.notificationStatus = {
      enabled: true,
      activeRuleCount: 1,
      availableRuleCount: 1,
      pausedRuleCount: 0,
    };
    mockSettingsState.routines = [
      { id: 'routine_1', name: 'Good Night', enabled: true },
    ];
    mockNotificationState.entries = [
      {
        id: 'entry_1',
        source: 'weather',
        title: 'Rain soon',
        message: 'Light rain is expected in the next hour.',
        priority: 'high',
        state: 'delivered',
        createdAt: Date.now(),
        unread: true,
      },
    ];
    mockNotificationState.unread = 1;

    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(await screen.findByText('Recent activity')).toBeInTheDocument();
    expect(screen.getByText('Rain soon')).toBeInTheDocument();
    expect(screen.queryByText('Notification system')).not.toBeInTheDocument();
    expect(screen.queryByText('Calendar reminders')).not.toBeInTheDocument();
    expect(screen.queryByText('Routine queue')).not.toBeInTheDocument();
    expect(screen.queryByText('Good Night')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Rules/i }));

    expect(screen.getByText('Notification rules')).toBeInTheDocument();
    expect(screen.getByText('Calendar reminders')).toBeInTheDocument();
    expect(screen.queryByText('Rain soon')).not.toBeInTheDocument();
    expect(screen.queryByText('Routine queue')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Routines/i }));

    expect(screen.getByText('Routine queue')).toBeInTheDocument();
    expect(screen.getByText('Good Night')).toBeInTheDocument();
    expect(screen.queryByText('Calendar reminders')).not.toBeInTheDocument();
  });
});

describe('Dashboard pages', () => {
  beforeEach(() => {
    mockDashboardPages.splice(
      0,
      mockDashboardPages.length,
      {
        id: 'home',
        name: 'Home',
        appearance: {
          themeMode: 'dark',
          accentPreset: 'cobalt',
          backgroundStyle: 'default',
          backgroundColor: '#0a0a0a',
          glassEffectEnabled: true,
        },
        widgets: [
          {
            id: 'weather_1',
            type: 'weather',
            position: 0,
            size: 'large',
            enabled: true,
            config: { w: 2, h: 2 },
          },
        ],
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'work',
        name: 'Work',
        appearance: {
          themeMode: 'light',
          accentPreset: 'coral',
          backgroundStyle: 'solid',
          backgroundColor: '#fef3c7',
          glassEffectEnabled: false,
        },
        widgets: [
          {
            id: 'news_1',
            type: 'news',
            position: 0,
            size: 'large',
            enabled: true,
            config: { w: 3, h: 3 },
          },
        ],
        createdAt: 2,
        updatedAt: 2,
      },
    );
    mockDashboardPageState.activeId = 'home';
    mockDashboardPageSetters.setPages.mockClear();
    mockDashboardPageSetters.setActiveId.mockClear();
  });

  it('switches between compact dashboard page tabs without opening a large panel', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    expect(screen.getByTestId('dashboard-page-switcher')).toBeInTheDocument();
    expect(screen.getByText('Weather widget body')).toBeInTheDocument();
    expect(screen.queryByText('News widget body')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to Work dashboard page' }),
    );

    await waitFor(() => {
      expect(screen.getByText('News widget body')).toBeInTheDocument();
    });
    expect(screen.queryByText('Weather widget body')).not.toBeInTheDocument();
    expect(mockDashboardPageSetters.setActiveId).toHaveBeenCalledWith('work', null);
  });

  it('keeps board controls within the viewport without horizontal scrolling', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Board controls' }));

    const panel = (await screen.findByText('Board Controls')).closest('.dashboard-floating-panel');
    expect(panel).toHaveClass('overflow-x-hidden');
    expect(panel).toHaveClass('max-w-[calc(100vw-1rem)]');
  });

  it('switches pages when clicking the page row in board controls', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Board controls' }));
    fireEvent.click(await screen.findByTestId('dashboard-page-row-work'));

    await waitFor(() => {
      expect(screen.getByText('News widget body')).toBeInTheDocument();
    });
    expect(mockDashboardPageSetters.setActiveId).toHaveBeenCalledWith('work', null);
  });

  it('switches pages with bracket keyboard shortcuts when text is not being edited', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    expect(screen.getByText('Weather widget body')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: ']' });

    await waitFor(() => {
      expect(screen.getByText('News widget body')).toBeInTheDocument();
    });
    expect(mockDashboardPageSetters.setActiveId).toHaveBeenCalledWith('work', null);

    fireEvent.keyDown(window, { key: '[' });

    await waitFor(() => {
      expect(screen.getByText('Weather widget body')).toBeInTheDocument();
    });
    expect(mockDashboardPageSetters.setActiveId).toHaveBeenLastCalledWith('home', null);
  });

  it('shows the page keyboard shortcuts in board controls', () => {
    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Board controls' }));

    expect(screen.getByText('Page shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Use [ and ]')).toBeInTheDocument();
  });

  it('ignores page keyboard shortcuts while editing text', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Board controls' }));
    const homeName = screen.getByLabelText('Rename Home dashboard page');
    homeName.focus();

    fireEvent.keyDown(homeName, { key: ']' });

    await waitFor(() => {
      expect(screen.getByText('Weather widget body')).toBeInTheDocument();
    });
    expect(mockDashboardPageSetters.setActiveId).not.toHaveBeenCalledWith('work', null);
  });

  it('can disable page keyboard shortcuts from board controls', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Board controls' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disable page keyboard shortcuts' }));

    fireEvent.keyDown(window, { key: ']' });

    await waitFor(() => {
      expect(screen.getByText('Weather widget body')).toBeInTheDocument();
    });
    expect(mockDashboardPageSetters.setActiveId).not.toHaveBeenCalledWith('work', null);
  });

  it('uses a compact icon-only delete control for pages', () => {
    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Board controls' }));

    expect(screen.queryByRole('button', { name: 'Remove page' })).not.toBeInTheDocument();

    const deleteWorkPage = screen.getByRole('button', {
      name: 'Delete Work dashboard page',
    });
    expect(deleteWorkPage).toHaveClass('h-8', 'w-8');
    expect(deleteWorkPage).not.toHaveClass('w-full');
    expect(deleteWorkPage).toHaveTextContent('');

    fireEvent.click(deleteWorkPage);

    expect(mockDashboardPageSetters.setPages).toHaveBeenLastCalledWith(
      [expect.objectContaining({ id: 'home' })],
      null,
    );
  });

  it('renames and reorders pages from board controls', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Board controls' }));

    const homeName = screen.getByLabelText('Rename Home dashboard page');
    fireEvent.change(homeName, { target: { value: 'Kitchen' } });
    fireEvent.blur(homeName);

    await waitFor(() => {
      expect(mockDashboardPageSetters.setPages).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'home', name: 'Kitchen' }),
        ]),
        null,
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Move Work page up' }));

    await waitFor(() => {
      expect(mockDashboardPageSetters.setPages).toHaveBeenLastCalledWith(
        [
          expect.objectContaining({ id: 'work' }),
          expect.objectContaining({ id: 'home' }),
        ],
        null,
      );
    });
  });

  it('can hide the page switcher from the dashboard surface', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    expect(screen.getByTestId('dashboard-page-switcher')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Board controls' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide page switcher' }));

    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-page-switcher')).not.toBeInTheDocument();
    });
  });

  it('stores visual controls on the active page instead of every page', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Board controls' }));
    fireEvent.click(screen.getByTestId('dashboard-page-row-work'));
    fireEvent.click(screen.getByRole('button', { name: 'Use dark theme for this page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select orchid accent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use Studio Light background' }));

    await waitFor(() => {
      expect(mockDashboardPageSetters.setPages).toHaveBeenLastCalledWith(
        [
          expect.objectContaining({
            id: 'home',
            appearance: expect.objectContaining({
              accentPreset: 'cobalt',
              backgroundStyle: 'default',
            }),
          }),
          expect.objectContaining({
            id: 'work',
            appearance: expect.objectContaining({
              themeMode: 'dark',
              accentPreset: 'orchid',
              backgroundStyle: 'image',
              backgroundColor: '/assets/backgrounds/curio-studio-light.png',
            }),
          }),
        ],
        null,
      );
    });
  });

  it('generates an animated page theme from the board controls prompt', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Board controls' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open AI theme generator' }));
    fireEvent.change(screen.getByPlaceholderText('Describe a theme...'), {
      target: { value: 'Make this look like the Matrix terminal' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate dashboard theme' }));

    await waitFor(() => {
      expect(mockDashboardPageSetters.setPages).toHaveBeenLastCalledWith(
        [
          expect.objectContaining({
            id: 'home',
            appearance: expect.objectContaining({
              themeMode: 'dark',
              accentPreset: 'neon',
              backgroundStyle: 'animated',
              animationPreset: 'matrix',
            }),
          }),
          expect.objectContaining({
            id: 'work',
            appearance: expect.objectContaining({
              accentPreset: 'coral',
            }),
          }),
        ],
        null,
      );
    });
  });

  it('mounts animated backgrounds under the full dashboard root instead of the scroll canvas', async () => {
    mockSettingsState.dashboardPreferences.reduceMotion = false;
    mockDashboardPages[0].appearance = {
      backgroundStyle: 'animated',
      animationPreset: 'matrix',
    };

    render(<Dashboard weather={weather} aqi={null} />);

    const animated = await screen.findByTestId('dashboard-animated-background');
    expect(screen.getByTestId('dashboard-root')).toContainElement(animated);
    expect(screen.getByTestId('dashboard-board-scroller')).not.toContainElement(animated);
  });

  it('resets the active page theme from board controls', async () => {
    mockDashboardPages[0].appearance = {
      themeMode: 'dark',
      accentPreset: 'neon',
      accentColor: '#22f7a5',
      backgroundStyle: 'animated',
      backgroundColor: '#02130d',
      glassEffectEnabled: true,
      animationPreset: 'matrix',
    };

    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Board controls' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset dashboard theme' }));

    await waitFor(() => {
      expect(mockDashboardPageSetters.setPages).toHaveBeenLastCalledWith(
        [
          expect.objectContaining({
            id: 'home',
            appearance: {},
          }),
          expect.objectContaining({
            id: 'work',
            appearance: expect.objectContaining({
              accentPreset: 'coral',
            }),
          }),
        ],
        null,
      );
    });
  });

  it('resets the active page theme from the board controls AI reset prompt', async () => {
    mockDashboardPages[0].appearance = {
      themeMode: 'dark',
      accentPreset: 'neon',
      accentColor: '#22f7a5',
      backgroundStyle: 'animated',
      backgroundColor: '#02130d',
      glassEffectEnabled: true,
      animationPreset: 'matrix',
    };

    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Board controls' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open AI theme generator' }));
    fireEvent.change(screen.getByPlaceholderText('Describe a theme...'), {
      target: { value: 'Reset the dashboard theme back to the default look.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate dashboard theme' }));

    await waitFor(() => {
      expect(mockDashboardPageSetters.setPages).toHaveBeenLastCalledWith(
        [
          expect.objectContaining({
            id: 'home',
            appearance: {},
          }),
          expect.objectContaining({
            id: 'work',
            appearance: expect.objectContaining({
              accentPreset: 'coral',
            }),
          }),
        ],
        null,
      );
    });
  });
});

describe('Dashboard visual controls', () => {
  it('keeps widget glow off by default and toggles it globally from board controls', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    const widgetSurface = document.querySelector(
      '[data-dashboard-widget-id="weather_1"] > div',
    );

    expect(widgetSurface?.querySelector('[data-dashboard-widget-glow="true"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Board controls' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enable widget glow' }));

    await waitFor(() => {
      expect(widgetSurface?.querySelector('[data-dashboard-widget-glow="true"]')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Disable widget glow' }));

    await waitFor(() => {
      expect(widgetSurface?.querySelector('[data-dashboard-widget-glow="true"]')).toBeNull();
    });
  });

  it('applies the selected board accent to widget semantic accent variables', () => {
    render(<Dashboard weather={weather} aqi={null} />);

    const rootStyle = screen.getByTestId('dashboard-root').getAttribute('style') || '';

    expect(rootStyle).toContain('--dashboard-accent: #7dd3fc');
    expect(rootStyle).toContain('--ether-teal: #7dd3fc');
    expect(rootStyle).toContain('--ether-amber: #7dd3fc');
    expect(rootStyle).toContain('--ether-emerald: #7dd3fc');
  });

  it('shows image backgrounds from Settings inside quick board controls', () => {
    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Board controls' }));

    expect(
      screen.getByRole('button', { name: 'Use Studio Light background' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use Paper Lantern background' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use Cream background' }),
    ).toBeInTheDocument();
  });

  it('lets users select hardcoded animated backgrounds from quick board controls', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Board controls' }));

    expect(
      screen.getByRole('button', { name: 'Use Matrix Rain animated background' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use Particle Mesh animated background' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Use Matrix Rain animated background' }));

    await waitFor(() => {
      expect(mockDashboardPageSetters.setPages).toHaveBeenLastCalledWith(
        [
          expect.objectContaining({
            id: 'home',
            appearance: expect.objectContaining({
              backgroundStyle: 'animated',
              animationPreset: 'matrix',
              backgroundColor: expect.stringContaining('#053f2f'),
              glassEffectEnabled: true,
            }),
          }),
        ],
        null,
      );
    });
  });

  it('shows full background preset labels without truncating them', () => {
    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Board controls' }));

    const backgroundGrid = screen.getByTestId('dashboard-background-preset-grid');
    const paperLabel = screen.getByText('Paper Lantern');

    expect(backgroundGrid).toHaveClass('grid-cols-2');
    expect(paperLabel).toHaveClass('whitespace-normal');
    expect(paperLabel).not.toHaveClass('truncate');
    expect(paperLabel.closest('button')).toHaveClass('min-h-16');
  });

  it('uses glassy light-mode card variables by default and can toggle them off from board controls', async () => {
    mockSettingsState.themeMode = 'light';

    render(<Dashboard weather={weather} aqi={null} />);

    const root = screen.getByTestId('dashboard-root');
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(root.getAttribute('style')).toContain('--ether-glass-bg: rgba(255, 253, 248, 0.58)');
    expect(root.getAttribute('style')).toContain('--ether-glass-blur: 22px');
    expect(root.getAttribute('style')).toContain('color: var(--ether-on-surface)');

    fireEvent.click(screen.getByRole('button', { name: 'Board controls' }));
    fireEvent.click(screen.getByRole('button', { name: /Glass effect/i }));

    await waitFor(() => {
      expect(root.getAttribute('style')).toContain('--ether-glass-bg: #fbf9f4');
      expect(root.getAttribute('style')).toContain('--ether-glass-blur: 0px');
      expect(screen.getByRole('button', { name: /Glass effect/i })).toHaveTextContent('Off');
    });
  });

  it('sets dark-mode glass variables explicitly so light cards do not linger after mode switches', () => {
    mockSettingsState.themeMode = 'dark';

    render(<Dashboard weather={weather} aqi={null} />);

    const root = screen.getByTestId('dashboard-root');

    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(root).not.toHaveClass('light-mode');
    expect(root.getAttribute('style')).toContain('--ether-on-surface: #f5f0e6');
    expect(root.getAttribute('style')).toContain('--ether-glass-bg: rgba(25, 23, 19, 0.92)');
    expect(root.getAttribute('style')).toContain('--ether-glass-blur: 16px');
    expect(root.getAttribute('style')).toContain('color: var(--ether-on-surface)');
  });

  it('renders the top dashboard toolbar as lighter transparent glass', () => {
    mockSettingsState.themeMode = 'dark';

    const { rerender } = render(<Dashboard weather={weather} aqi={null} />);

    const darkToolbar = screen.getByTestId('dashboard-toolbar');
    expect(darkToolbar.getAttribute('style')).toContain('rgba(12, 11, 10, 0.4)');
    expect(darkToolbar.getAttribute('style')).toContain('blur(24px) saturate(1.35)');
    expect(darkToolbar.getAttribute('style')).toContain('box-shadow');

    mockSettingsState.themeMode = 'light';
    rerender(<Dashboard weather={weather} aqi={null} />);

    const lightToolbar = screen.getByTestId('dashboard-toolbar');
    expect(lightToolbar.getAttribute('style')).toContain('rgba(234, 226, 211, 0.34)');
    expect(lightToolbar.getAttribute('style')).toContain('blur(24px) saturate(1.25)');
  });

  it('lets dark-wallpaper widget chrome render without adding a visible backing layer', () => {
    mockSettingsState.themeMode = 'dark';

    const { rerender } = render(<Dashboard weather={weather} aqi={null} />);

    const darkWidgetFrame = screen
      .getByTestId('widget-body-weather_1')
      .closest('[data-dashboard-widget-id]') as HTMLElement | null;
    const darkWidgetSurface = document.querySelector(
      '[data-dashboard-widget-id="weather_1"] > div',
    );
    expect(screen.getByTestId('widget-body-weather_1').parentElement).toHaveClass(
      'rounded-[inherit]',
    );
    expect(darkWidgetFrame?.style.contain).toBe('layout style');
    expect(darkWidgetSurface).toHaveClass('overflow-visible');
    expect(
      darkWidgetSurface?.querySelector('[data-dashboard-widget-edge-guard="true"]'),
    ).toBeNull();

    mockSettingsState.themeMode = 'light';
    rerender(<Dashboard weather={weather} aqi={null} />);

    const lightWidgetFrame = screen
      .getByTestId('widget-body-weather_1')
      .closest('[data-dashboard-widget-id]') as HTMLElement | null;
    const lightWidgetSurface = document.querySelector(
      '[data-dashboard-widget-id="weather_1"] > div',
    );
    expect(lightWidgetFrame?.style.contain).toBe('layout paint style');
    expect(lightWidgetSurface).toHaveClass('overflow-hidden');
    expect(
      lightWidgetSurface?.querySelector('[data-dashboard-widget-edge-guard="true"]'),
    ).toBeNull();
  });
});

describe('Dashboard PWA shell', () => {
  it('marks the dashboard viewport and board scroller as iOS safe-area aware surfaces', () => {
    render(<Dashboard weather={weather} aqi={null} />);

    expect(screen.getByTestId('dashboard-root')).toHaveClass('dashboard-pwa-root');
    expect(screen.getByTestId('dashboard-board-scroller')).toHaveClass('dashboard-pwa-scroll');
  });
});

describe('Dashboard grid sizing', () => {
  it('caps ultra-wide grid canvases so widgets reflow instead of stretching', async () => {
    const restoreBoardWidth = mockDashboardBoardWidth(3840);

    try {
      render(<Dashboard weather={weather} aqi={null} />);

      await act(async () => {
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
      });

      const scroller = screen.getByTestId('dashboard-board-scroller');
      const canvas = scroller.firstElementChild as HTMLElement | null;
      const weatherFrame = screen
        .getByTestId('widget-body-weather_1')
        .closest('[data-dashboard-widget-id]') as HTMLElement | null;

      expect(canvas).toHaveStyle({ width: '2418px' });
      expect(weatherFrame).toHaveStyle({ width: '330px' });
    } finally {
      restoreBoardWidth();
    }
  });
});

describe('Dashboard freeform sizing', () => {
  let restoreBoardWidth: (() => void) | null = null;

  beforeEach(() => {
    restoreBoardWidth = mockDashboardBoardWidth(1024);
    mockSettingsState.dashboardPreferences.mode = 'freeform';
    mockDashboardWidgets.splice(0, mockDashboardWidgets.length, {
      id: 'weather_1',
      type: 'weather',
      position: 0,
      size: 'large',
      enabled: true,
      config: { w: 2, h: 2 },
    });
    mockDashboardPages.splice(0, mockDashboardPages.length, {
      id: 'home',
      name: 'Home',
      widgets: mockDashboardWidgets,
      createdAt: 1,
      updatedAt: 1,
    });
    mockDashboardPageSetters.setPages.mockClear();
  });

  afterEach(() => {
    restoreBoardWidth?.();
    restoreBoardWidth = null;
  });

  it('hydrates missing freeform rects into fixed dashboard pixels instead of raw viewport pixels', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    await act(async () => {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });

    const scroller = screen.getByTestId('dashboard-board-scroller');
    const canvas = scroller.firstElementChild as HTMLElement | null;
    const weatherFrame = screen
      .getByTestId('widget-body-weather_1')
      .closest('[data-dashboard-widget-id]') as HTMLElement | null;

    expect(canvas).toHaveStyle({ width: '852px' });
    expect(weatherFrame).toHaveStyle({ width: '330px', height: '202px' });

    await waitFor(() => {
      expect(mockDashboardPageSetters.setPages).toHaveBeenCalled();
    });

    const persistedWeather = mockDashboardPages[0].widgets.find(
      (widget) => widget.id === 'weather_1',
    );
    expect(persistedWeather?.layout?.freeform).toMatchObject({
      x: 0,
      y: 0,
      w: 330,
      h: 202,
    });
  });
});

describe('Dashboard floating robot widget', () => {
  let restoreBoardWidth: (() => void) | null = null;

  beforeEach(() => {
    vi.useRealTimers();
    mockSettingsState.dashboardPreferences.reduceMotion = true;
    mockNotificationState.entries = [];
    mockNotificationState.unread = 0;
    restoreBoardWidth = mockDashboardBoardWidth(1024);
    mockDashboardWidgets.splice(0, mockDashboardWidgets.length, {
      id: 'robot_1',
      type: 'robot_face',
      position: 0,
      size: 'large',
      enabled: true,
      config: {
        w: 3,
        h: 3,
        robotFloatingEnabled: true,
        robotFloatingX: 120,
        robotFloatingY: 140,
      },
    });
    mockDashboardPages.splice(
      0,
      mockDashboardPages.length,
      {
        id: 'home',
        name: 'Home',
        widgets: mockDashboardWidgets,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'work',
        name: 'Work',
        widgets: [
          {
            id: 'weather_2',
            type: 'weather',
            position: 0,
            size: 'large',
            enabled: true,
            config: { w: 2, h: 2 },
          },
        ],
        createdAt: 2,
        updatedAt: 2,
      },
    );
    mockDashboardPageState.activeId = 'home';
    mockDashboardPageSetters.setPages.mockClear();
    mockDashboardPageSetters.setActiveId.mockClear();
  });

  afterEach(() => {
    restoreBoardWidth?.();
    restoreBoardWidth = null;
  });

  it('keeps the robot in a fixed overlay after switching dashboard pages', async () => {
    render(
      <Dashboard
        weather={weather}
        aqi={null}
        faceSlot={() => <div data-testid="robot-face-art">Robot face</div>}
      />,
    );

    expect(screen.getByTestId('dashboard-floating-robot')).toBeInTheDocument();
    expect(await screen.findByTestId('robot-face-art')).toBeInTheDocument();
    expect(
      document.querySelector('[data-dashboard-widget-id="robot_1"]'),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to Work dashboard page' }),
    );

    await waitFor(() => {
      expect(screen.getByText('Weather widget body')).toBeInTheDocument();
    });
    expect(screen.getByTestId('dashboard-floating-robot')).toBeInTheDocument();
    expect(await screen.findByTestId('robot-face-art')).toBeInTheDocument();
  });

  it('floats the robot when the active widget list comes from the legacy layout', async () => {
    mockDashboardPages.splice(0, mockDashboardPages.length);

    render(
      <Dashboard
        weather={weather}
        aqi={null}
        faceSlot={() => <div data-testid="robot-face-art">Robot face</div>}
      />,
    );

    expect(screen.getByTestId('dashboard-floating-robot')).toBeInTheDocument();
    expect(await screen.findByTestId('robot-face-art')).toBeInTheDocument();
    expect(
      document.querySelector('[data-dashboard-widget-id="robot_1"]'),
    ).toBeNull();
  });

  it('clicks the floating robot to toggle connection but ignores drag releases', async () => {
    const onToggleConnection = vi.fn();

    render(
      <Dashboard
        weather={weather}
        aqi={null}
        faceSlot={() => <div data-testid="robot-face-art">Robot face</div>}
        onToggleConnection={onToggleConnection}
      />,
    );

    const surface = screen.getByTestId('dashboard-floating-robot-surface');

    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 150,
      clientY: 160,
      pointerId: 1,
    });
    fireEvent.pointerUp(surface, {
      clientX: 150,
      clientY: 160,
      pointerId: 1,
    });

    expect(onToggleConnection).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 150,
      clientY: 160,
      pointerId: 2,
    });
    fireEvent.pointerMove(surface, {
      clientX: 210,
      clientY: 220,
      pointerId: 2,
    });
    fireEvent.pointerUp(surface, {
      clientX: 210,
      clientY: 220,
      pointerId: 2,
    });

    expect(onToggleConnection).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockDashboardPageSetters.setPages).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            widgets: expect.arrayContaining([
              expect.objectContaining({
                id: 'robot_1',
                config: expect.objectContaining({
                  robotFloatingX: 180,
                  robotFloatingY: 200,
                }),
              }),
            ]),
          }),
        ]),
        null,
      );
    });
  });

  it('opens the robot action menu from the floating overlay', async () => {
    render(
      <Dashboard
        weather={weather}
        aqi={null}
        faceSlot={() => <div data-testid="robot-face-art">Robot face</div>}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Robot Face widget actions/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Float/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-floating-robot')).toBeNull();
    });
    expect(
      document.querySelector('[data-dashboard-widget-id="robot_1"]'),
    ).toBeInTheDocument();
  });

  it('shows proactive bubbles from dashboard notifications', () => {
    mockNotificationState.entries = [
      {
        id: 'email_1',
        source: 'email',
        title: 'Maya sent the notes',
        message: '',
        priority: 'normal',
        state: 'delivered',
        createdAt: Date.now(),
        unread: true,
      },
    ];
    mockNotificationState.unread = 1;

    render(
      <Dashboard
        weather={weather}
        aqi={null}
        faceSlot={() => <div data-testid="robot-face-art">Robot face</div>}
      />,
    );

    const bubble = screen.getByTestId('dashboard-robot-bubble');
    expect(bubble).toHaveTextContent(
      'New email: Maya sent the notes',
    );
    expect(bubble.className).toContain('left-[calc(100%+0.5rem)]');
  });

  it('resizes the floating robot from its hover corner handle', async () => {
    render(
      <Dashboard
        weather={weather}
        aqi={null}
        faceSlot={() => <div data-testid="robot-face-art">Robot face</div>}
      />,
    );

    const resizeHandle = screen.getByTestId('dashboard-floating-robot-resize-handle');
    fireEvent.pointerDown(resizeHandle, {
      button: 0,
      clientX: 300,
      clientY: 300,
      pointerId: 5,
    });
    fireEvent.pointerMove(resizeHandle, {
      clientX: 340,
      clientY: 340,
      pointerId: 5,
    });
    fireEvent.pointerUp(resizeHandle, {
      clientX: 340,
      clientY: 340,
      pointerId: 5,
    });

    await waitFor(() => {
      expect(mockDashboardPageSetters.setPages).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            widgets: expect.arrayContaining([
              expect.objectContaining({
                id: 'robot_1',
                config: expect.objectContaining({
                  robotFloatingSize: 230,
                }),
              }),
            ]),
          }),
        ]),
        null,
      );
    });
  });

  it('lets the floating robot resize much larger while staying inside the viewport', async () => {
    mockDashboardWidgets[0].config = {
      ...mockDashboardWidgets[0].config,
      robotFloatingX: 780,
      robotFloatingY: 500,
      robotFloatingSize: 190,
    };
    mockDashboardPages[0].widgets = mockDashboardWidgets;

    render(
      <Dashboard
        weather={weather}
        aqi={null}
        faceSlot={() => <div data-testid="robot-face-art">Robot face</div>}
      />,
    );

    const resizeHandle = screen.getByTestId('dashboard-floating-robot-resize-handle');
    fireEvent.pointerDown(resizeHandle, {
      button: 0,
      clientX: 300,
      clientY: 300,
      pointerId: 6,
    });
    fireEvent.pointerMove(resizeHandle, {
      clientX: 720,
      clientY: 720,
      pointerId: 6,
    });
    fireEvent.pointerUp(resizeHandle, {
      clientX: 720,
      clientY: 720,
      pointerId: 6,
    });

    await waitFor(() => {
      expect(mockDashboardPageSetters.setPages).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            widgets: expect.arrayContaining([
              expect.objectContaining({
                id: 'robot_1',
                config: expect.objectContaining({
                  robotFloatingX: 398,
                  robotFloatingY: 142,
                  robotFloatingSize: 610,
                }),
              }),
            ]),
          }),
        ]),
        null,
      );
    });
  });

  it('wanders with varied above-board visits without persisting temporary positions', async () => {
    vi.useFakeTimers();
    mockSettingsState.dashboardPreferences.reduceMotion = false;
    mockNotificationState.entries = [];
    mockNotificationState.unread = 0;
    mockDashboardWidgets[0].config = {
      ...mockDashboardWidgets[0].config,
      robotFloatingX: 120,
      robotFloatingY: 140,
      robotFloatingSize: 190,
      robotWanderMode: 'full',
    };
    mockDashboardWidgets.push({
      id: 'weather_target',
      type: 'weather',
      position: 1,
      size: 'large',
      enabled: true,
      config: { w: 2, h: 2 },
    });
    mockDashboardPages[0].widgets = mockDashboardWidgets;
    const originalRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      const element = this as Element;
      if (element.getAttribute('data-dashboard-widget-id') === 'weather_target') {
        return {
          x: 420,
          y: 220,
          left: 420,
          top: 220,
          right: 660,
          bottom: 400,
          width: 240,
          height: 180,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return originalRect.call(this);
    };

    try {
      render(
        <Dashboard
          weather={weather}
          aqi={null}
          faceSlot={() => <div data-testid="robot-face-art">Robot face</div>}
        />,
      );

      const robot = screen.getByTestId('dashboard-floating-robot');
      expect(robot).toHaveAttribute('data-robot-wander-mode', 'full');
      expect(robot).toHaveAttribute('data-robot-autopilot-phase', 'home');
      mockDashboardPageSetters.setPages.mockClear();

      await act(async () => {
        vi.advanceTimersByTime(24000);
      });

      expect(robot).toHaveAttribute('data-robot-autopilot-phase', 'dash');
      expect(robot).toHaveAttribute('data-robot-autopilot-style', 'dash');
      expect(robot).toHaveStyle({ left: '668px', top: '215px' });
      expect(robot).toHaveStyle({ zIndex: '60', opacity: '1' });
      expect(robot.getAttribute('style')).toContain('450ms');

      await act(async () => {
        vi.advanceTimersByTime(450);
      });

      expect(robot).toHaveAttribute('data-robot-autopilot-phase', 'scan');
      expect(robot).toHaveAttribute('data-robot-autopilot-style', 'scan');
      expect(robot).toHaveStyle({ left: '475px', top: '74px' });
      expect(robot).toHaveStyle({ zIndex: '60', opacity: '1' });

      await act(async () => {
        vi.advanceTimersByTime(2500);
      });

      expect(robot).toHaveAttribute('data-robot-autopilot-phase', 'return');
      expect(robot).toHaveStyle({ left: '120px', top: '140px' });
      expect(mockDashboardPageSetters.setPages).not.toHaveBeenCalled();
    } finally {
      Element.prototype.getBoundingClientRect = originalRect;
      vi.useRealTimers();
    }
  });
});

describe('Dashboard widget resize affordance', () => {
  it('keeps the grab cursor scoped to the widget move handle in edit mode', () => {
    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const widgetSurface = document.querySelector(
      '[data-dashboard-widget-id="weather_1"] > div',
    );

    expect(widgetSurface).not.toHaveClass('ring-1');
    expect(widgetSurface).not.toHaveClass('cursor-grab');
    expect(widgetSurface?.querySelector('.cursor-grab')).toBeInTheDocument();
  });

  it('puts a subtle resize handle directly on each widget without opening the action menu', () => {
    render(<Dashboard weather={weather} aqi={null} />);

    const handle = screen.getByTestId('dashboard-resize-handle-weather_1');

    expect(handle).toHaveAttribute('aria-label', 'Resize widget');
    expect(handle).toHaveAttribute('data-dashboard-resize-handle', 'true');
    expect(handle).toHaveClass('dashboard-widget-resize-handle');
    expect(handle).toHaveClass('group-hover:opacity-100');
    expect(handle).toHaveClass('bottom-0', 'right-0', 'h-8', 'w-8', 'p-1.5');
    const resizeCorner = handle.querySelector('[data-dashboard-resize-corner="true"]');
    expect(resizeCorner).toBeInTheDocument();
    expect(resizeCorner).toHaveClass('h-4', 'w-4');
    expect(handle).toHaveStyle({ touchAction: 'none' });
    expect(screen.queryByText('Move & resize')).not.toBeInTheDocument();
  });

  it('clears the corner resize affordance when resizing ends', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    const handle = screen.getByTestId('dashboard-resize-handle-weather_1');
    const widgetFrame = screen
      .getByTestId('widget-body-weather_1')
      .closest('[data-dashboard-widget-id]');

    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 260,
      clientY: 240,
    });

    await waitFor(() => {
      expect(widgetFrame).toHaveAttribute('data-dashboard-resize-intent', 'true');
      expect(handle).toHaveAttribute('data-resize-active', 'true');
    });

    fireEvent.pointerUp(window);

    await waitFor(() => {
      expect(widgetFrame).not.toHaveAttribute('data-dashboard-resize-intent');
      expect(handle).toHaveAttribute('data-resize-active', 'false');
    });
  });

  it('does not paint-contain the active widget while resizing so rounded corners stay smooth', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    const handle = screen.getByTestId('dashboard-resize-handle-weather_1');
    const widgetFrame = screen
      .getByTestId('widget-body-weather_1')
      .closest('[data-dashboard-widget-id]') as HTMLElement | null;

    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 260,
      clientY: 240,
    });

    await waitFor(() => {
      expect(widgetFrame).toHaveAttribute('data-dashboard-resize-intent', 'true');
      expect(widgetFrame?.style.contain).toBe('layout style');
    });
  });

  it('requires a one-second hold before touch resizing begins', async () => {
    mockSettingsState.themeMode = 'light';
    vi.useFakeTimers();

    try {
      render(<Dashboard weather={weather} aqi={null} />);

      const handle = screen.getByTestId('dashboard-resize-handle-weather_1');
      const widgetFrame = screen
        .getByTestId('widget-body-weather_1')
        .closest('[data-dashboard-widget-id]') as HTMLElement | null;

      fireEvent.pointerDown(handle, {
        button: 0,
        pointerId: 7,
        pointerType: 'touch',
        clientX: 260,
        clientY: 240,
      });

      expect(widgetFrame).toHaveAttribute('data-dashboard-resize-intent', 'true');
      expect(widgetFrame?.style.contain).not.toBe('layout style');

      await act(async () => {
        vi.advanceTimersByTime(999);
      });

      expect(widgetFrame?.style.contain).not.toBe('layout style');

      await act(async () => {
        vi.advanceTimersByTime(1);
      });

      expect(widgetFrame?.style.contain).toBe('layout style');
    } finally {
      vi.useRealTimers();
    }
  });

  it('still starts touch resizing after the hold if the finger drifts first', async () => {
    vi.useFakeTimers();

    try {
      render(<Dashboard weather={weather} aqi={null} />);

      const handle = screen.getByTestId('dashboard-resize-handle-weather_1');
      const widgetFrame = screen
        .getByTestId('widget-body-weather_1')
        .closest('[data-dashboard-widget-id]') as HTMLElement | null;

      fireEvent.pointerDown(handle, {
        button: 0,
        pointerId: 7,
        pointerType: 'touch',
        clientX: 260,
        clientY: 240,
      });

      fireEvent.pointerMove(handle, {
        pointerId: 7,
        pointerType: 'touch',
        clientX: 274,
        clientY: 252,
      });

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(widgetFrame?.style.contain).toBe('layout style');
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears a pending touch resize when the finger lifts before the hold completes', async () => {
    mockSettingsState.themeMode = 'light';
    vi.useFakeTimers();

    try {
      render(<Dashboard weather={weather} aqi={null} />);

      const handle = screen.getByTestId('dashboard-resize-handle-weather_1');
      const widgetFrame = screen
        .getByTestId('widget-body-weather_1')
        .closest('[data-dashboard-widget-id]') as HTMLElement | null;

      fireEvent.pointerDown(handle, {
        button: 0,
        pointerId: 7,
        pointerType: 'touch',
        clientX: 260,
        clientY: 240,
      });

      expect(widgetFrame).toHaveAttribute('data-dashboard-resize-intent', 'true');

      fireEvent.pointerUp(handle, {
        pointerId: 7,
        pointerType: 'touch',
        clientX: 260,
        clientY: 240,
      });

      expect(widgetFrame).not.toHaveAttribute('data-dashboard-resize-intent');

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(widgetFrame?.style.contain).not.toBe('layout style');
    } finally {
      vi.useRealTimers();
    }
  });

  it('prevents native touch scrolling while a resize gesture is active', async () => {
    vi.useFakeTimers();

    try {
      render(<Dashboard weather={weather} aqi={null} />);

      const handle = screen.getByTestId('dashboard-resize-handle-weather_1');
      const widgetFrame = screen
        .getByTestId('widget-body-weather_1')
        .closest('[data-dashboard-widget-id]') as HTMLElement | null;

      fireEvent.pointerDown(handle, {
        button: 0,
        pointerId: 7,
        pointerType: 'touch',
        clientX: 260,
        clientY: 240,
      });

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(widgetFrame).toHaveAttribute('data-dashboard-resize-intent', 'true');
      expect(widgetFrame?.style.contain).toBe('layout style');

      const touchMove = new Event('touchmove', {
        bubbles: true,
        cancelable: true,
      });

      window.dispatchEvent(touchMove);

      expect(touchMove.defaultPrevented).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Dashboard robot widget menu', () => {
  it('floats the robot from the widget action menu', async () => {
    mockDashboardWidgets.splice(0, mockDashboardWidgets.length, {
      id: 'robot_1',
      type: 'robot_face',
      position: 0,
      size: 'large',
      enabled: true,
      config: { w: 2, h: 2, robotFloatingEnabled: false },
    });

    render(
      <Dashboard
        weather={weather}
        aqi={null}
        faceSlot={() => <div data-testid="robot-face-art">Robot face</div>}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Robot Face widget actions/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Float/i }));

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-floating-robot')).toBeInTheDocument();
    });
    expect(screen.getByTestId('robot-face-art')).toBeInTheDocument();
    expect(
      document.querySelector('[data-dashboard-widget-id="robot_1"]'),
    ).toBeNull();
  });

  it('lets the user pick robot faces and robot colors from the widget action menu', async () => {
    mockDashboardWidgets.splice(0, mockDashboardWidgets.length, {
      id: 'robot_1',
      type: 'robot_face',
      position: 0,
      size: 'large',
      enabled: true,
      config: { w: 2, h: 2, robotFaceStyle: 'curio', robotAccentColor: '#38bdf8' },
    });

    render(<Dashboard weather={weather} aqi={null} />);

    const menuButton = screen.getByRole('button', { name: /Robot Face widget actions/i });
    expect(menuButton).toHaveClass('dashboard-widget-control-button');
    expect(menuButton).toHaveClass('dashboard-widget-menu-button');

    fireEvent.click(menuButton);
    fireEvent.click(await screen.findByRole('button', { name: 'Bender' }));

    await waitFor(() => {
      expect(screen.getByText('Robot style bender')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Robot Face widget actions/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Robot color #8b5cf6' }));

    await waitFor(() => {
      expect(screen.getByText('Robot color #8b5cf6')).toBeInTheDocument();
    });
  });
});

describe('Dashboard widget settings', () => {
  it('lets news widgets configure ten or more loaded articles', async () => {
    mockDashboardWidgets.splice(0, mockDashboardWidgets.length, {
      id: 'news_1',
      type: 'news',
      position: 0,
      size: 'large',
      enabled: true,
      config: { w: 3, h: 3, newsProvider: 'combined_world' },
    });

    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: /News widget actions/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Settings/i }));

    const maxItemsInput = await screen.findByLabelText('Max items');
    expect(maxItemsInput).toHaveValue('10');

    fireEvent.change(maxItemsInput, { target: { value: '25' } });
    expect(maxItemsInput).toHaveValue('20');
  });

  it('lets news widgets configure source, type, and custom RSS feeds from widget settings', async () => {
    mockDashboardWidgets.splice(0, mockDashboardWidgets.length, {
      id: 'news_1',
      type: 'news',
      position: 0,
      size: 'large',
      enabled: true,
      config: { w: 3, h: 3 },
    });

    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: /News widget actions/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Settings/i }));

    expect(await screen.findByLabelText('News source')).toHaveValue('combined_world');
    expect(screen.getByLabelText('News type')).toHaveValue('world');

    fireEvent.change(screen.getByLabelText('News type'), {
      target: { value: 'technology' },
    });
    fireEvent.change(screen.getByLabelText('Custom RSS feeds'), {
      target: {
        value: 'Example Wire | https://example.com/feed.xml | technology',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockDashboardPageSetters.setPages).toHaveBeenCalled();
    });

    expect(mockDashboardPages[0].widgets[0].config).toMatchObject({
      newsProvider: 'combined_world',
      newsCategory: 'technology',
      newsCustomFeeds: [
        {
          id: 'example-wire',
          label: 'Example Wire',
          url: 'https://example.com/feed.xml',
          categoryIds: ['technology'],
          enabled: true,
        },
      ],
    });
  });

  it('lets system widgets choose visible system info from widget settings', async () => {
    mockDashboardWidgets.splice(0, mockDashboardWidgets.length, {
      id: 'system_1',
      type: 'system_status',
      position: 0,
      size: 'medium',
      enabled: true,
      config: {
        w: 3,
        h: 2,
        systemStatusModules: ['network', 'voice'],
      },
    });

    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: /System widget actions/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Settings/i }));

    expect(await screen.findByText('System info')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Voice/i }));
    fireEvent.click(screen.getByRole('button', { name: /Storage/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockDashboardPageSetters.setPages).toHaveBeenCalled();
    });

    expect(mockDashboardPages[0].widgets[0].config.systemStatusModules).toEqual([
      'network',
      'storage',
    ]);
  });

  it('lets insights widgets choose visible activity modules from widget settings', async () => {
    mockDashboardWidgets.splice(0, mockDashboardWidgets.length, {
      id: 'insights_1',
      type: 'screen_time',
      position: 0,
      size: 'medium',
      enabled: true,
      config: {
        w: 3,
        h: 3,
        activityModules: ['dashboardTime', 'aiMessages'],
      },
    });

    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: /Insights widget actions/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Settings/i }));

    expect(await screen.findByText('Insight modules')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /AI messages/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cards created/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockDashboardPageSetters.setPages).toHaveBeenCalled();
    });

    expect(mockDashboardPages[0].widgets[0].config.activityModules).toEqual([
      'dashboardTime',
      'responseCards',
    ]);
  });
});

describe('Dashboard widget picker', () => {
  it('does not auto-focus the picker search field on coarse pointer devices', async () => {
    const restoreMatchMedia = mockCoarsePointer();

    try {
      render(<Dashboard weather={weather} aqi={null} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));

      const pickerSearch = await screen.findByPlaceholderText('Find a widget to add');
      await new Promise((resolve) => window.requestAnimationFrame(resolve));

      expect(document.activeElement).not.toBe(pickerSearch);
    } finally {
      restoreMatchMedia();
    }
  });

  it('waits for the touch keyboard to dismiss before closing after a searched add', async () => {
    const restoreMatchMedia = mockCoarsePointer();

    try {
      render(<Dashboard weather={weather} aqi={null} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));

      const pickerSearch = await screen.findByPlaceholderText('Find a widget to add');
      vi.useFakeTimers();
      pickerSearch.focus();
      expect(document.activeElement).toBe(pickerSearch);

      fireEvent.change(pickerSearch, { target: { value: 'sticky' } });
      fireEvent.click(screen.getByRole('button', { name: /Sticky Note/i }));

      expect(document.activeElement).not.toBe(pickerSearch);
      expect(screen.getByText('Add a surface')).toBeInTheDocument();
      expect(screen.queryByText('Sticky note body')).not.toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(450);
        vi.runOnlyPendingTimers();
      });

      expect(screen.queryByText('Add a surface')).not.toBeInTheDocument();
      expect(screen.getByText('Sticky note body')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
      restoreMatchMedia();
    }
  });

  it('captures searched add taps before iPad Safari can swallow the click', async () => {
    const restoreMatchMedia = mockCoarsePointer();

    try {
      render(<Dashboard weather={weather} aqi={null} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));

      const pickerSearch = await screen.findByPlaceholderText('Find a widget to add');
      vi.useFakeTimers();
      pickerSearch.focus();
      fireEvent.change(pickerSearch, { target: { value: 'sticky' } });

      fireEvent.pointerDown(screen.getByRole('button', { name: /Sticky Note/i }));

      expect(document.activeElement).not.toBe(pickerSearch);
      expect(screen.getByText('Add a surface')).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(450);
        vi.runOnlyPendingTimers();
      });

      expect(screen.queryByText('Add a surface')).not.toBeInTheDocument();
      expect(screen.getByText('Sticky note body')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
      restoreMatchMedia();
    }
  });

  it('releases the picker layer before mounting the selected widget', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    expect(await screen.findByText('Add a surface')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Sticky Note/i }));

    expect(screen.queryByText('Add a surface')).not.toBeInTheDocument();
    expect(screen.queryByText('Sticky note body')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Sticky note body')).toBeInTheDocument();
    });
  });
});

describe('Dashboard sticky note placement', () => {
  it('lets sticky notes float independently while the rest of the board stays in grid mode', () => {
    mockDashboardWidgets.splice(
      0,
      mockDashboardWidgets.length,
      {
        id: 'weather_1',
        type: 'weather',
        position: 0,
        size: 'large',
        enabled: true,
        config: { w: 2, h: 2 },
      },
      {
        id: 'sticky_1',
        type: 'rich_note',
        position: 1,
        size: 'medium',
        enabled: true,
        config: { w: 2, h: 2, richNotePinnedToGrid: false },
      },
    );

    render(<Dashboard weather={weather} aqi={null} />);

    expect(screen.getByTestId('widget-body-weather_1').closest('[data-dashboard-widget-id]')).toHaveAttribute(
      'data-dashboard-placement',
      'grid',
    );
    expect(screen.getByTestId('widget-body-sticky_1').closest('[data-dashboard-widget-id]')).toHaveAttribute(
      'data-dashboard-placement',
      'freeform',
    );
    expect(screen.getByTestId('widget-body-sticky_1').closest('[data-dashboard-widget-id]')?.className).not.toContain(
      'transition-[left,top',
    );
  });

  it('creates each new sticky note as its own floating widget', () => {
    mockDashboardWidgets.splice(
      0,
      mockDashboardWidgets.length,
      {
        id: 'sticky_1',
        type: 'rich_note',
        position: 0,
        size: 'medium',
        enabled: true,
        config: { w: 2, h: 2, richNoteTitle: 'Sticky Note', richNotePinnedToGrid: false },
      },
    );

    render(<Dashboard weather={weather} aqi={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mock add sticky note' }));

    const stickyWidgets = screen.getAllByText('Sticky note body');
    expect(stickyWidgets).toHaveLength(2);
    expect(
      document.querySelectorAll('[data-dashboard-placement="freeform"][data-dashboard-widget-id]'),
    ).toHaveLength(2);
  });
});

describe('Dashboard freeform layering', () => {
  let restoreBoardWidth: (() => void) | null = null;

  beforeEach(() => {
    restoreBoardWidth = mockDashboardBoardWidth(1024);
    mockSettingsState.dashboardPreferences.mode = 'freeform';
    mockSettingsState.dashboardPreferences.snapToGrid = false;
    mockDashboardWidgets.splice(
      0,
      mockDashboardWidgets.length,
      {
        id: 'weather_1',
        type: 'weather',
        position: 0,
        size: 'large',
        enabled: true,
        config: { w: 2, h: 2 },
        layout: { freeform: { x: 0, y: 0, w: 220, h: 180, z: 1 } },
      },
      {
        id: 'news_1',
        type: 'news',
        position: 1,
        size: 'large',
        enabled: true,
        config: { w: 2, h: 2 },
        layout: { freeform: { x: 20, y: 20, w: 220, h: 180, z: 4 } },
      },
    );
    mockDashboardPages.splice(0, mockDashboardPages.length, {
      id: 'home',
      name: 'Home',
      widgets: mockDashboardWidgets,
      createdAt: 1,
      updatedAt: 1,
    });
    mockDashboardPageSetters.setPages.mockClear();
  });

  afterEach(() => {
    restoreBoardWidth?.();
    restoreBoardWidth = null;
  });

  it('raises a clicked freeform widget above overlapping widgets', async () => {
    render(<Dashboard weather={weather} aqi={null} />);

    const weatherFrame = screen
      .getByTestId('widget-body-weather_1')
      .closest('[data-dashboard-widget-id]') as HTMLElement;

    await waitFor(() => {
      expect(weatherFrame).toHaveAttribute('data-dashboard-placement', 'freeform');
    });

    fireEvent.pointerDown(weatherFrame, { button: 0 });

    await waitFor(() => {
      expect(weatherFrame).toHaveStyle('z-index: 5');
    });
    await waitFor(() => {
      expect(mockDashboardPageSetters.setPages).toHaveBeenCalled();
    });
    expect(
      mockDashboardPages[0].widgets.find((widget) => widget.id === 'weather_1')?.layout?.freeform?.z,
    ).toBe(5);
  });
});
