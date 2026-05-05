import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DASHBOARD_PAGE_ID,
  getDashboardPreferences,
  getDashboardPages,
  getActiveDashboardPageId,
  getProfileDashboardLayout,
  getProfileDashboardPages,
  setActiveDashboardPageId,
  setDashboardPreferences,
  setDashboardLayout,
  setDashboardPages,
  setProfileActiveDashboardPageId,
  setProfileDashboardLayout,
  setProfileDashboardPages,
} from './settingsStorage';
import {
  DEFAULT_DASHBOARD_PREFERENCES,
  type DashboardPage,
  type DashboardWidget,
} from '../services/dashboardTypes';

const widget = (
  id: string,
  type: DashboardWidget['type'] = 'weather',
  position = 0,
): DashboardWidget => ({
  id,
  type,
  position,
  size: 'medium',
  enabled: true,
  config: { w: 2, h: 2 },
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(Date, 'now').mockReturnValue(1777010046000);
});

describe('dashboard pages settings storage', () => {
  it('migrates the legacy single dashboard layout into one default page', () => {
    localStorage.setItem(
      'curio_dashboard_layout',
      JSON.stringify([widget('legacy_weather')]),
    );

    const pages = getDashboardPages();

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      id: DEFAULT_DASHBOARD_PAGE_ID,
      name: 'Dashboard',
      widgets: [expect.objectContaining({ id: 'legacy_weather' })],
    });
    expect(getActiveDashboardPageId()).toBe(DEFAULT_DASHBOARD_PAGE_ID);
  });

  it('returns the active page widgets through the legacy layout getter', () => {
    const pages: DashboardPage[] = [
      {
        id: 'home',
        name: 'Home',
        widgets: [widget('home_weather')],
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'work',
        name: 'Work',
        widgets: [widget('work_tasks', 'tasks')],
        createdAt: 2,
        updatedAt: 2,
      },
    ];

    setDashboardPages(pages);
    setActiveDashboardPageId('work');

    expect(getProfileDashboardLayout(null)).toEqual([
      expect.objectContaining({ id: 'work_tasks', type: 'tasks' }),
    ]);
  });

  it('preserves explicitly empty dashboard pages', () => {
    setDashboardPages([
      {
        id: 'home',
        name: 'Home',
        widgets: [widget('home_weather')],
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'blank',
        name: 'Blank',
        widgets: [],
        createdAt: 2,
        updatedAt: 2,
      },
    ]);
    setActiveDashboardPageId('blank');

    expect(getDashboardPages().find((page) => page.id === 'blank')?.widgets).toEqual([]);
    expect(getProfileDashboardLayout(null)).toEqual([]);
  });

  it('updates only the active page when the legacy layout setter is used', () => {
    setProfileDashboardPages(
      [
        {
          id: 'home',
          name: 'Home',
          widgets: [widget('home_weather')],
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'work',
          name: 'Work',
          widgets: [widget('work_tasks', 'tasks')],
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      'speaker_1',
    );
    setProfileActiveDashboardPageId('work', 'speaker_1');

    setProfileDashboardLayout([widget('work_notes', 'notes')], 'speaker_1');

    const pages = getProfileDashboardPages('speaker_1');
    expect(pages.find((page) => page.id === 'home')?.widgets).toEqual([
      expect.objectContaining({ id: 'home_weather' }),
    ]);
    expect(pages.find((page) => page.id === 'work')?.widgets).toEqual([
      expect.objectContaining({ id: 'work_notes', type: 'notes' }),
    ]);
  });

  it('preserves page appearance settings independently from widgets', () => {
    setDashboardPages([
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
        widgets: [widget('home_weather')],
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'work',
        name: 'Work',
        appearance: {
          themeMode: 'light',
          accentPreset: 'orchid',
          backgroundStyle: 'solid',
          backgroundColor: '#fef3c7',
          glassEffectEnabled: false,
        },
        widgets: [widget('work_tasks', 'tasks')],
        createdAt: 2,
        updatedAt: 2,
      },
    ]);
    setActiveDashboardPageId('work');

    setDashboardLayout([widget('work_notes', 'notes')]);

    expect(getDashboardPages()).toEqual([
      expect.objectContaining({
        id: 'home',
        appearance: expect.objectContaining({
          themeMode: 'dark',
          accentPreset: 'cobalt',
        }),
      }),
      expect.objectContaining({
        id: 'work',
        appearance: expect.objectContaining({
          themeMode: 'light',
          accentPreset: 'orchid',
          backgroundStyle: 'solid',
          backgroundColor: '#fef3c7',
          glassEffectEnabled: false,
        }),
        widgets: [expect.objectContaining({ id: 'work_notes' })],
      }),
    ]);
  });

  it('falls back to the first remaining page when the active page is removed', () => {
    setDashboardPages([
      {
        id: 'home',
        name: 'Home',
        widgets: [widget('home_weather')],
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'work',
        name: 'Work',
        widgets: [widget('work_tasks', 'tasks')],
        createdAt: 2,
        updatedAt: 2,
      },
    ]);
    setActiveDashboardPageId('work');

    setDashboardPages([
      {
        id: 'home',
        name: 'Home',
        widgets: [widget('home_weather')],
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    expect(getActiveDashboardPageId()).toBe('home');
  });

  it('normalizes stored pages with missing timestamps without changing snapshots', () => {
    localStorage.setItem(
      'curio_dashboard_pages',
      JSON.stringify([
        {
          id: 'loose',
          name: 'Loose',
          widgets: [widget('loose_weather')],
        },
      ]),
    );

    const firstRead = getDashboardPages();
    vi.mocked(Date.now).mockReturnValue(1777010047000);
    const secondRead = getDashboardPages();

    expect(firstRead[0]).toMatchObject({
      id: 'loose',
      createdAt: 0,
      updatedAt: 0,
    });
    expect(secondRead).toEqual(firstRead);
  });

  it('does not throw when dashboard page persistence exceeds browser storage quota', () => {
    const originalSetItem = Storage.prototype.setItem;
    const quotaError = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
      if (key === 'curio_dashboard_pages') {
        throw quotaError;
      }
      return originalSetItem.call(this, key, value);
    });

    expect(() => {
      setProfileDashboardPages(
        [
          {
            id: 'home',
            name: 'Home',
            widgets: [
              {
                ...widget('gallery', 'image_gallery'),
                config: {
                  w: 4,
                  h: 4,
                  galleryImages: ['data:image/png;base64,too-large-for-localstorage'],
                },
              },
            ],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        null,
      );
    }).not.toThrow();
  });

  it('normalizes dashboard glass intensity preferences', () => {
    localStorage.setItem(
      'curio_dashboard_prefs',
      JSON.stringify({
        ...DEFAULT_DASHBOARD_PREFERENCES,
        glassEffectIntensity: 150,
      }),
    );

    expect(getDashboardPreferences().glassEffectIntensity).toBe(100);

    setDashboardPreferences({
      ...DEFAULT_DASHBOARD_PREFERENCES,
      glassEffectIntensity: 35,
    });

    expect(getDashboardPreferences().glassEffectIntensity).toBe(35);
  });

  it('drops removed dashboard border beam settings and widget config', () => {
    localStorage.setItem(
      'curio_dashboard_prefs',
      JSON.stringify({
        ...DEFAULT_DASHBOARD_PREFERENCES,
        widgetBorderBeamEnabled: true,
        widgetBorderBeamSize: 'line',
        widgetBorderBeamColorVariant: 'sunset',
        widgetBorderBeamStrength: 'strong',
      }),
    );

    expect(getDashboardPreferences()).not.toHaveProperty('widgetBorderBeamEnabled');
    expect(getDashboardPreferences()).not.toHaveProperty('widgetBorderBeamSize');
    expect(getDashboardPreferences()).not.toHaveProperty('widgetBorderBeamColorVariant');
    expect(getDashboardPreferences()).not.toHaveProperty('widgetBorderBeamStrength');

    setDashboardLayout([
      {
        ...widget('legacy_beam_widget'),
        config: {
          w: 2,
          h: 2,
          borderBeamEnabled: true,
          borderBeamSize: 'line',
          borderBeamColorVariant: 'sunset',
          borderBeamStrength: 'strong',
        } as DashboardWidget['config'],
      },
    ]);

    const [storedWidget] = getProfileDashboardLayout(null);

    expect(storedWidget.config).not.toHaveProperty('borderBeamEnabled');
    expect(storedWidget.config).not.toHaveProperty('borderBeamSize');
    expect(storedWidget.config).not.toHaveProperty('borderBeamColorVariant');
    expect(storedWidget.config).not.toHaveProperty('borderBeamStrength');
  });

});
