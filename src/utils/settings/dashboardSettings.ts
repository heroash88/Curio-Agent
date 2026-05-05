import { useMemo, useSyncExternalStore } from 'react';
import {
  DEFAULT_DASHBOARD_PREFERENCES,
  DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS,
  DEFAULT_DASHBOARD_WIDGETS,
  DASHBOARD_ANIMATION_PRESETS,
  getDashboardCatalogItem,
  MAX_DASHBOARD_WIDGETS,
  type DashboardAnimationIntensity,
  type DashboardBoardPreferences,
  type DashboardAnimationPreset,
  type DashboardInteractivitySettings,
  type DashboardPage,
  type DashboardPageAppearance,
  type DashboardPageBackgroundStyle,
  type DashboardPageThemeMode,
  type DashboardWidget,
  type DashboardWidgetConfig,
  type DashboardWidgetType,
} from '../../services/dashboardTypes';
import { normalizeDashboardGeneratedAnimationSpec } from '../../services/dashboardGeneratedAnimation';
import { subscribeToSettingsStorage, useSettingsStorageValue } from './core';


export type IdleMode = 'face' | 'dashboard';

export const getIdleMode = (): IdleMode => {
  if (typeof window === 'undefined') return 'face';
  return (localStorage.getItem('curio_idle_mode') as IdleMode) || 'face';
};
export const setIdleMode = (mode: IdleMode) => {
  localStorage.setItem('curio_idle_mode', mode);
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useIdleMode = () => useSettingsStorageValue(getIdleMode, 'face' as IdleMode);

export const DEFAULT_DASHBOARD_PAGE_ID = 'dashboard-main';
export const MAX_DASHBOARD_PAGES = 12;

const getDashboardLayoutKey = (profileId: string | null) =>
  profileId ? `curio_dashboard_layout_${profileId}` : 'curio_dashboard_layout';

const getDashboardPagesKey = (profileId: string | null) =>
  profileId ? `curio_dashboard_pages_${profileId}` : 'curio_dashboard_pages';

const getDashboardActivePageKey = (profileId: string | null) =>
  profileId
    ? `curio_dashboard_active_page_${profileId}`
    : 'curio_dashboard_active_page';

type RemovedDashboardWidgetConfig = DashboardWidget['config'] & {
  borderBeamEnabled?: unknown;
  borderBeamSize?: unknown;
  borderBeamColorVariant?: unknown;
  borderBeamStrength?: unknown;
};

const normalizeDashboardWidgetConfig = (
  config: DashboardWidget['config'] | undefined,
): DashboardWidget['config'] => {
  const {
    borderBeamEnabled: _borderBeamEnabled,
    borderBeamSize: _borderBeamSize,
    borderBeamColorVariant: _borderBeamColorVariant,
    borderBeamStrength: _borderBeamStrength,
    ...rest
  } = (config || {}) as RemovedDashboardWidgetConfig;

  return rest;
};

const normalizeDashboardLayout = (widgets: DashboardWidget[]): DashboardWidget[] => {
  const source = widgets.length > 0 ? widgets : DEFAULT_DASHBOARD_WIDGETS;

  return source
    .map((widget) => {
      const rawType = String((widget as { type?: unknown }).type || '');
      const migratedType = rawType === 'countdowns' ? 'stopwatch' : rawType;
      if (!getDashboardCatalogItem(migratedType as DashboardWidgetType)) {
        return null;
      }
      return {
        ...widget,
        type: migratedType as DashboardWidgetType,
      };
    })
    .filter((widget): widget is DashboardWidget => Boolean(widget))
    .slice(0, MAX_DASHBOARD_WIDGETS)
    .sort((left, right) => {
      const leftPosition = Number.isFinite(left.position) ? left.position : 0;
      const rightPosition = Number.isFinite(right.position) ? right.position : 0;
      return leftPosition - rightPosition;
    })
    .map((widget, index) => {
      const config = normalizeDashboardWidgetConfig(widget.config);

      return {
        ...widget,
        position: index,
        config: {
          ...config,
          w: Math.max(1, Math.min(8, Number(config.w || 2))),
          h: Math.max(1, Math.min(8, Number(config.h || 2))),
        },
        enabled: widget.enabled ?? true,
        layout: widget.layout || {},
      };
    });
};

const readLegacyDashboardLayout = (profileId: string | null): DashboardWidget[] => {
  if (typeof window === 'undefined') return DEFAULT_DASHBOARD_WIDGETS;
  const key = getDashboardLayoutKey(profileId);
  let raw = localStorage.getItem(key);
  if (!raw && profileId) {
    raw = localStorage.getItem(getDashboardLayoutKey(null));
  }
  const parsed = raw ? (JSON.parse(raw) as DashboardWidget[]) : DEFAULT_DASHBOARD_WIDGETS;
  return normalizeDashboardLayout(parsed);
};

const normalizeDashboardPageName = (name: unknown, index: number) => {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed) return trimmed.slice(0, 40);
  return index === 0 ? 'Dashboard' : `Page ${index + 1}`;
};

const normalizeDashboardPageId = (id: unknown, index: number) => {
  const raw = typeof id === 'string' ? id.trim() : '';
  if (raw) {
    return raw
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 48);
  }
  return index === 0 ? DEFAULT_DASHBOARD_PAGE_ID : `dashboard-page-${index + 1}`;
};

const DASHBOARD_PAGE_ACCENT_PRESETS = new Set([
  'cobalt',
  'champagne',
  'verdant',
  'graphite',
  'aurora',
  'neon',
  'coral',
  'moss',
  'orchid',
  'sunrise',
  'arctic',
  'ember',
]);

const isDashboardPageThemeMode = (value: unknown): value is DashboardPageThemeMode =>
  value === 'light' || value === 'dark';

const isDashboardPageBackgroundStyle = (
  value: unknown,
): value is DashboardPageBackgroundStyle =>
  value === 'default' ||
  value === 'solid' ||
  value === 'gradient' ||
  value === 'image' ||
  value === 'animated';

const DASHBOARD_ANIMATION_PRESET_VALUES = new Set<DashboardAnimationPreset>(
  DASHBOARD_ANIMATION_PRESETS,
);

const isDashboardAnimationPreset = (
  value: unknown,
): value is DashboardAnimationPreset =>
  typeof value === 'string' &&
  DASHBOARD_ANIMATION_PRESET_VALUES.has(value as DashboardAnimationPreset);

const normalizeDashboardPageAppearance = (
  appearance: unknown,
): DashboardPageAppearance | undefined => {
  if (!appearance || typeof appearance !== 'object') return undefined;
  const raw = appearance as Partial<DashboardPageAppearance>;
  const normalized: DashboardPageAppearance = {};

  if (isDashboardPageThemeMode(raw.themeMode)) {
    normalized.themeMode = raw.themeMode;
  }
  if (typeof raw.accentPreset === 'string' && DASHBOARD_PAGE_ACCENT_PRESETS.has(raw.accentPreset)) {
    normalized.accentPreset = raw.accentPreset as DashboardPageAppearance['accentPreset'];
  }
  if (typeof raw.accentColor === 'string' && raw.accentColor.trim()) {
    normalized.accentColor = raw.accentColor.trim();
  }
  const backgroundStyle = isDashboardPageBackgroundStyle(raw.backgroundStyle)
    ? raw.backgroundStyle
    : undefined;
  if (backgroundStyle) {
    normalized.backgroundStyle = backgroundStyle;
  }
  if (typeof raw.backgroundColor === 'string' && raw.backgroundColor.trim()) {
    normalized.backgroundColor = raw.backgroundColor;
  }
  if (typeof raw.glassEffectEnabled === 'boolean') {
    normalized.glassEffectEnabled = raw.glassEffectEnabled;
  }
  if (backgroundStyle === 'animated' && isDashboardAnimationPreset(raw.animationPreset)) {
    normalized.animationPreset = raw.animationPreset;
    if (raw.animationPreset === 'generated') {
      const generatedAnimation = normalizeDashboardGeneratedAnimationSpec(
        raw.generatedAnimation,
      );
      if (generatedAnimation) {
        normalized.generatedAnimation = generatedAnimation;
      }
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const createDefaultDashboardPage = (
  widgets: DashboardWidget[],
  timestamp = 0,
): DashboardPage => {
  return {
    id: DEFAULT_DASHBOARD_PAGE_ID,
    name: 'Dashboard',
    widgets: normalizeDashboardLayout(widgets),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

const normalizeDashboardPageWidgets = (
  widgets: DashboardPage['widgets'] | undefined,
  fallbackWidgets: DashboardWidget[],
): DashboardWidget[] => {
  if (Array.isArray(widgets)) {
    return widgets.length === 0 ? [] : normalizeDashboardLayout(widgets);
  }
  return normalizeDashboardLayout(fallbackWidgets);
};

const normalizeDashboardPages = (
  pages: DashboardPage[] | null | undefined,
  fallbackWidgets: DashboardWidget[] = DEFAULT_DASHBOARD_WIDGETS,
): DashboardPage[] => {
  const source = Array.isArray(pages) && pages.length > 0
    ? pages
    : [createDefaultDashboardPage(fallbackWidgets, Date.now())];
  const seenIds = new Set<string>();

  return source
    .slice(0, MAX_DASHBOARD_PAGES)
    .map((page, index) => {
      const baseId = normalizeDashboardPageId(page?.id, index);
      let id = baseId || `${DEFAULT_DASHBOARD_PAGE_ID}-${index + 1}`;
      let suffix = 2;
      while (seenIds.has(id)) {
        id = `${baseId || DEFAULT_DASHBOARD_PAGE_ID}-${suffix}`;
        suffix += 1;
      }
      seenIds.add(id);

      const createdAt =
        typeof page?.createdAt === 'number' && Number.isFinite(page.createdAt)
          ? page.createdAt
          : typeof page?.updatedAt === 'number' && Number.isFinite(page.updatedAt)
            ? page.updatedAt
            : 0;
      const updatedAt =
        typeof page?.updatedAt === 'number' && Number.isFinite(page.updatedAt)
          ? page.updatedAt
          : createdAt;
      return {
        id,
        name: normalizeDashboardPageName(page?.name, index),
        appearance: normalizeDashboardPageAppearance(page?.appearance),
        widgets: normalizeDashboardPageWidgets(page?.widgets, fallbackWidgets),
        createdAt,
        updatedAt,
      };
    });
};

const readStoredDashboardPages = (profileId: string | null) => {
  const key = getDashboardPagesKey(profileId);
  let raw = localStorage.getItem(key);
  if (!raw && profileId) {
    raw = localStorage.getItem(getDashboardPagesKey(null));
  }
  return raw;
};

const readStoredDashboardActivePageId = (profileId: string | null) => {
  const key = getDashboardActivePageKey(profileId);
  let raw = localStorage.getItem(key);
  if (!raw && profileId) {
    raw = localStorage.getItem(getDashboardActivePageKey(null));
  }
  return raw || '';
};

const hasStoredDashboardPages = (profileId: string | null) => {
  if (typeof window === 'undefined') return false;
  return Boolean(readStoredDashboardPages(profileId));
};

const writeLegacyDashboardLayout = (
  widgets: DashboardWidget[],
  profileId: string | null,
) => {
  localStorage.setItem(
    getDashboardLayoutKey(profileId),
    JSON.stringify(normalizeDashboardLayout(widgets)),
  );
};

const isQuotaExceededError = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');

const notifyDashboardPersistenceError = (error: unknown): void => {
  console.warn('[SettingsStorage] Failed to persist dashboard pages:', error);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('curio:persistence-error', {
    detail: {
      area: 'dashboard',
      message: isQuotaExceededError(error)
        ? 'Dashboard storage is full. Remove large images or reload after the gallery migrates photos.'
        : 'Dashboard changes could not be saved.',
    },
  }));
};

const DASHBOARD_ANIMATION_INTENSITY_VALUES: readonly DashboardAnimationIntensity[] = [
  'off',
  'subtle',
  'full',
];

const isDashboardAnimationIntensity = (value: unknown): value is DashboardAnimationIntensity =>
  typeof value === 'string' &&
  (DASHBOARD_ANIMATION_INTENSITY_VALUES as readonly string[]).includes(value);

const normalizeDashboardInteractivitySettings = (
  input: unknown,
): DashboardInteractivitySettings => {
  const normalized: DashboardInteractivitySettings = {
    ...DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS,
  };
  if (!input || typeof input !== 'object') {
    return normalized;
  }
  const raw = input as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS) as Array<
    keyof DashboardInteractivitySettings
  >) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const value = raw[key];
    if (key === 'animationIntensity') {
      if (isDashboardAnimationIntensity(value)) {
        normalized.animationIntensity = value;
      }
      continue;
    }
    if (typeof value === 'boolean') {
      (normalized as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return normalized;
};

const normalizeDashboardPreferences = (
  prefs?: Partial<DashboardBoardPreferences> | null,
): DashboardBoardPreferences => {
  const normalized: DashboardBoardPreferences = {
    mode: prefs?.mode === 'freeform' ? 'freeform' : DEFAULT_DASHBOARD_PREFERENCES.mode,
    snapToGrid: prefs?.snapToGrid ?? DEFAULT_DASHBOARD_PREFERENCES.snapToGrid,
    accentPreset: prefs?.accentPreset || DEFAULT_DASHBOARD_PREFERENCES.accentPreset,
    glassEffectEnabled: prefs?.glassEffectEnabled ?? DEFAULT_DASHBOARD_PREFERENCES.glassEffectEnabled,
    glassEffectIntensity: Math.max(
      0,
      Math.min(
        100,
        Number.isFinite(Number(prefs?.glassEffectIntensity))
          ? Number(prefs?.glassEffectIntensity)
          : DEFAULT_DASHBOARD_PREFERENCES.glassEffectIntensity,
      ),
    ),
    reduceMotion: prefs?.reduceMotion ?? DEFAULT_DASHBOARD_PREFERENCES.reduceMotion,
    widgetGlowEnabled: prefs?.widgetGlowEnabled ?? DEFAULT_DASHBOARD_PREFERENCES.widgetGlowEnabled,
    showPageSwitcher: prefs?.showPageSwitcher ?? DEFAULT_DASHBOARD_PREFERENCES.showPageSwitcher,
    pageKeyboardShortcutsEnabled:
      prefs?.pageKeyboardShortcutsEnabled ??
      DEFAULT_DASHBOARD_PREFERENCES.pageKeyboardShortcutsEnabled,
    interactivity: normalizeDashboardInteractivitySettings(prefs?.interactivity),
  };

  if (typeof prefs?.accentColor === 'string' && prefs.accentColor.trim()) {
    normalized.accentColor = prefs.accentColor.trim();
  }

  return normalized;
};

export const getDashboardPages = (): DashboardPage[] => getProfileDashboardPages(null);

export const setDashboardPages = (pages: DashboardPage[]) => {
  setProfileDashboardPages(pages, null);
};

export const useDashboardPages = () => useProfileDashboardPages(null);
export const getActiveDashboardPageId = () => getProfileActiveDashboardPageId(null);
export const setActiveDashboardPageId = (pageId: string) =>
  setProfileActiveDashboardPageId(pageId, null);
export const useActiveDashboardPageId = () => useProfileActiveDashboardPageId(null);

export const getDashboardLayout = (): DashboardWidget[] => {
  return getProfileDashboardLayout(null);
};

export const setDashboardLayout = (widgets: DashboardWidget[]) => {
  setProfileDashboardLayout(widgets, null);
};

export const useDashboardLayout = () => useProfileDashboardLayout(null);
export const getDashboardPreferences = () => getProfileDashboardPreferences(null);
export const setDashboardPreferences = (preferences: DashboardBoardPreferences) =>
  setProfileDashboardPreferences(preferences, null);
export const useDashboardPreferences = () => useProfileDashboardPreferences(null);

export const getDashboardInteractivitySettings = () =>
  getProfileDashboardInteractivitySettings(null);
export const setDashboardInteractivitySettings = (
  patch: Partial<DashboardInteractivitySettings>,
) => setProfileDashboardInteractivitySettings(patch, null);
export const useDashboardInteractivitySettings = () =>
  useProfileDashboardInteractivitySettings(null);

export const getProfileDashboardPages = (profileId: string | null): DashboardPage[] => {
  if (typeof window === 'undefined') {
    return [createDefaultDashboardPage(DEFAULT_DASHBOARD_WIDGETS)];
  }
  try {
    const legacyWidgets = readLegacyDashboardLayout(profileId);
    const raw = readStoredDashboardPages(profileId);
    if (!raw) {
      return [createDefaultDashboardPage(legacyWidgets)];
    }
    return normalizeDashboardPages(JSON.parse(raw) as DashboardPage[], legacyWidgets);
  } catch {
    return [createDefaultDashboardPage(DEFAULT_DASHBOARD_WIDGETS)];
  }
};

export const setProfileDashboardPages = (
  pages: DashboardPage[],
  profileId: string | null,
) => {
  const normalizedPages = normalizeDashboardPages(
    pages,
    readLegacyDashboardLayout(profileId),
  );
  const storedActiveId = readStoredDashboardActivePageId(profileId);
  const activePage =
    normalizedPages.find((page) => page.id === storedActiveId) ||
    normalizedPages[0];

  try {
    localStorage.setItem(getDashboardPagesKey(profileId), JSON.stringify(normalizedPages));
    localStorage.setItem(getDashboardActivePageKey(profileId), activePage.id);
    writeLegacyDashboardLayout(activePage.widgets, profileId);
  } catch (error) {
    notifyDashboardPersistenceError(error);
    return;
  }
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useProfileDashboardPages = (profileId: string | null) => {
  const reader = useMemo(() => {
    const readSnapshot = () => getProfileDashboardPages(profileId);
    let cachedRaw: string | undefined;
    let cachedValue: DashboardPage[] = [createDefaultDashboardPage(DEFAULT_DASHBOARD_WIDGETS)];

    return (): DashboardPage[] => {
      if (typeof window === 'undefined') return [createDefaultDashboardPage(DEFAULT_DASHBOARD_WIDGETS)];
      const raw = readSnapshot();
      const rawStr = JSON.stringify(raw);
      if (rawStr !== cachedRaw) {
        cachedRaw = rawStr;
        cachedValue = raw;
      }
      return cachedValue;
    };
  }, [profileId]);

  return useSyncExternalStore(
    subscribeToSettingsStorage,
    reader,
    () => [createDefaultDashboardPage(DEFAULT_DASHBOARD_WIDGETS)],
  );
};

export const getProfileActiveDashboardPageId = (profileId: string | null): string => {
  if (typeof window === 'undefined') return DEFAULT_DASHBOARD_PAGE_ID;
  const pages = getProfileDashboardPages(profileId);
  const storedId = readStoredDashboardActivePageId(profileId);
  return pages.some((page) => page.id === storedId)
    ? storedId
    : pages[0]?.id || DEFAULT_DASHBOARD_PAGE_ID;
};

export const setProfileActiveDashboardPageId = (
  pageId: string,
  profileId: string | null,
) => {
  const pages = getProfileDashboardPages(profileId);
  const activePage = pages.find((page) => page.id === pageId) || pages[0];
  if (!activePage) return;
  localStorage.setItem(getDashboardActivePageKey(profileId), activePage.id);
  writeLegacyDashboardLayout(activePage.widgets, profileId);
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useProfileActiveDashboardPageId = (profileId: string | null) => {
  const reader = useMemo(() => {
    const readSnapshot = () => getProfileActiveDashboardPageId(profileId);
    let cachedRaw: string | undefined;
    let cachedValue = DEFAULT_DASHBOARD_PAGE_ID;

    return (): string => {
      if (typeof window === 'undefined') return DEFAULT_DASHBOARD_PAGE_ID;
      const raw = readSnapshot();
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedValue = raw;
      }
      return cachedValue;
    };
  }, [profileId]);

  return useSyncExternalStore(
    subscribeToSettingsStorage,
    reader,
    () => DEFAULT_DASHBOARD_PAGE_ID,
  );
};

export const getProfileDashboardPreferences = (profileId: string | null): DashboardBoardPreferences => {
  if (typeof window === 'undefined') return DEFAULT_DASHBOARD_PREFERENCES;
  try {
    const key = profileId ? `curio_dashboard_prefs_${profileId}` : 'curio_dashboard_prefs';
    let raw = localStorage.getItem(key);
    if (!raw && profileId) {
      raw = localStorage.getItem('curio_dashboard_prefs');
    }
    return normalizeDashboardPreferences(raw ? JSON.parse(raw) as Partial<DashboardBoardPreferences> : undefined);
  } catch {
    return DEFAULT_DASHBOARD_PREFERENCES;
  }
};

export const setProfileDashboardPreferences = (
  preferences: DashboardBoardPreferences,
  profileId: string | null,
) => {
  const key = profileId ? `curio_dashboard_prefs_${profileId}` : 'curio_dashboard_prefs';
  localStorage.setItem(key, JSON.stringify(normalizeDashboardPreferences(preferences)));
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useProfileDashboardPreferences = (profileId: string | null) => {
  const reader = useMemo(() => {
    const readSnapshot = () => getProfileDashboardPreferences(profileId);
    let cachedRaw: string | undefined;
    let cachedValue: DashboardBoardPreferences = DEFAULT_DASHBOARD_PREFERENCES;

    return (): DashboardBoardPreferences => {
      if (typeof window === 'undefined') return DEFAULT_DASHBOARD_PREFERENCES;
      const raw = readSnapshot();
      const rawStr = JSON.stringify(raw);
      if (rawStr !== cachedRaw) {
        cachedRaw = rawStr;
        cachedValue = raw;
      }
      return cachedValue;
    };
  }, [profileId]);

  return useSyncExternalStore(
    subscribeToSettingsStorage,
    reader,
    () => DEFAULT_DASHBOARD_PREFERENCES,
  );
};

export const getProfileDashboardInteractivitySettings = (
  profileId: string | null,
): DashboardInteractivitySettings =>
  getProfileDashboardPreferences(profileId).interactivity;

export const setProfileDashboardInteractivitySettings = (
  patch: Partial<DashboardInteractivitySettings>,
  profileId: string | null,
) => {
  const current = getProfileDashboardPreferences(profileId);
  const nextInteractivity = normalizeDashboardInteractivitySettings({
    ...current.interactivity,
    ...patch,
  });
  setProfileDashboardPreferences(
    { ...current, interactivity: nextInteractivity },
    profileId,
  );
};

export const useProfileDashboardInteractivitySettings = (profileId: string | null) => {
  const reader = useMemo(() => {
    const readSnapshot = () => getProfileDashboardInteractivitySettings(profileId);
    let cachedRaw: string | undefined;
    let cachedValue: DashboardInteractivitySettings =
      DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS;

    return (): DashboardInteractivitySettings => {
      if (typeof window === 'undefined') return DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS;
      const raw = readSnapshot();
      const rawStr = JSON.stringify(raw);
      if (rawStr !== cachedRaw) {
        cachedRaw = rawStr;
        cachedValue = raw;
      }
      return cachedValue;
    };
  }, [profileId]);

  return useSyncExternalStore(
    subscribeToSettingsStorage,
    reader,
    () => DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS,
  );
};

/**
 * Board-level interactivity toggle keys that can be overridden per widget.
 *
 * Excludes `animationIntensity` (not a boolean) since `effectiveToggle`
 * resolves a boolean and `animationIntensity` is always a board-level value.
 */
export type DashboardInteractivityToggleKey = Exclude<
  keyof DashboardInteractivitySettings,
  'animationIntensity'
>;

/**
 * Per-widget interactivity override keys. A widget config may omit any of
 * these (presence, not value, is what determines whether the override wins).
 *
 * Note: not every board-level toggle has a per-widget override. Keys missing
 * from this union fall through to the board-level value for every widget.
 */
export type DashboardWidgetInteractivityOverrideKey =
  | 'ambientPulseEnabled'
  | 'freshnessDotEnabled'
  | 'swipeGesturesEnabled'
  | 'dragReorderEnabled'
  | 'rollingNumbersEnabled'
  | 'widgetPinningEnabled'
  | 'seekBarLiveSyncEnabled'
  | 'breathingRingEnabled'
  | 'valueMorphEnabled'
  | 'clockOffsetPreviewEnabled'
  | 'pinchZoomEnabled'
  | 'ttsWordHighlightEnabled';

const DASHBOARD_WIDGET_INTERACTIVITY_OVERRIDE_KEYS: ReadonlySet<string> = new Set<
  DashboardWidgetInteractivityOverrideKey
>([
  'ambientPulseEnabled',
  'freshnessDotEnabled',
  'swipeGesturesEnabled',
  'dragReorderEnabled',
  'rollingNumbersEnabled',
  'widgetPinningEnabled',
  'seekBarLiveSyncEnabled',
  'breathingRingEnabled',
  'valueMorphEnabled',
  'clockOffsetPreviewEnabled',
  'pinchZoomEnabled',
  'ttsWordHighlightEnabled',
]);

/**
 * Resolve the effective value of an interactivity toggle for a given widget.
 *
 * Returns the per-widget override when it is a defined boolean, otherwise the
 * board-level value. When `board` is missing, falls back to
 * `DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS`. Never throws on null/undefined
 * inputs.
 *
 * Board-only toggles (those without a per-widget override in
 * `DashboardWidgetInteractivityOverrideKey`) always return the board value.
 *
 * Pure function. No side effects, no storage reads.
 */
export function effectiveToggle<K extends DashboardInteractivityToggleKey>(
  toggle: K,
  board: DashboardInteractivitySettings | null | undefined,
  widgetConfig?: DashboardWidgetConfig | null,
): boolean {
  const resolvedBoard: DashboardInteractivitySettings =
    board ?? DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS;
  const boardValue = resolvedBoard[toggle] as boolean;

  if (
    widgetConfig &&
    DASHBOARD_WIDGET_INTERACTIVITY_OVERRIDE_KEYS.has(toggle)
  ) {
    const overrideKey = toggle as DashboardWidgetInteractivityOverrideKey;
    const override = widgetConfig[overrideKey];
    if (typeof override === 'boolean') {
      return override;
    }
  }

  return boardValue;
}


export const getProfileDashboardLayout = (profileId: string | null): DashboardWidget[] => {
  if (typeof window === 'undefined') return DEFAULT_DASHBOARD_WIDGETS;
  try {
    if (hasStoredDashboardPages(profileId)) {
      const pages = getProfileDashboardPages(profileId);
      const activePageId = getProfileActiveDashboardPageId(profileId);
      const activePage =
        pages.find((page) => page.id === activePageId) ||
        pages[0];
      return activePage?.widgets || DEFAULT_DASHBOARD_WIDGETS;
    }
    return readLegacyDashboardLayout(profileId);
  } catch {
    return DEFAULT_DASHBOARD_WIDGETS;
  }
};

export const setProfileDashboardLayout = (widgets: DashboardWidget[], profileId: string | null) => {
  const normalizedWidgets = normalizeDashboardLayout(widgets);

  if (hasStoredDashboardPages(profileId)) {
    const pages = getProfileDashboardPages(profileId);
    const activePageId = getProfileActiveDashboardPageId(profileId);
    const nextPages = pages.map((page) =>
      page.id === activePageId
        ? {
            ...page,
            widgets: normalizedWidgets,
            updatedAt: Date.now(),
          }
        : page,
    );
    localStorage.setItem(
      getDashboardPagesKey(profileId),
      JSON.stringify(normalizeDashboardPages(nextPages, normalizedWidgets)),
    );
  }

  writeLegacyDashboardLayout(normalizedWidgets, profileId);
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useProfileDashboardLayout = (profileId: string | null) => {
  // Can't use useSettingsStorageValue because it has empty dependency array []
  const reader = useMemo(() => {
    const readSnapshot = () => getProfileDashboardLayout(profileId);
    let cachedRaw: string | undefined;
    let cachedValue: DashboardWidget[] = DEFAULT_DASHBOARD_WIDGETS;

    return (): DashboardWidget[] => {
      if (typeof window === 'undefined') return DEFAULT_DASHBOARD_WIDGETS;
      const raw = readSnapshot();
      const rawStr = JSON.stringify(raw);
      if (rawStr !== cachedRaw) {
        cachedRaw = rawStr;
        cachedValue = raw;
      }
      return cachedValue;
    };
  }, [profileId]);

  return useSyncExternalStore(
    subscribeToSettingsStorage,
    reader,
    () => DEFAULT_DASHBOARD_WIDGETS
  );
};


/**
 * Remove every `useWidgetPersistentState` entry belonging to `widgetId`.
 *
 * Walks localStorage and deletes any key that starts with
 * `curio_widget_state_<widgetId>_`. Dispatches a single
 * `curio:settings-changed` event at the end so open mounts of the
 * hook see the deletion and re-read their defaults (Requirement 14.4).
 *
 * SSR-safe: no-op when `window` is undefined. Safe to call even if no
 * entries exist.
 */
export function clearWidgetPersistentState(widgetId: string): void {
  if (typeof window === 'undefined') return;
  if (!widgetId) return;

  const prefix = `curio_widget_state_${widgetId}_`;
  const toRemove: string[] = [];

  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        toRemove.push(key);
      }
    }
  } catch {
    return;
  }

  if (toRemove.length === 0) return;

  for (const key of toRemove) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Continue removing siblings even if one fails.
    }
  }

  try {
    window.dispatchEvent(new Event('storage'));
  } catch {
    // Ignore environments that disallow Event construction.
  }
  try {
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
  } catch {
    // Ignore environments without CustomEvent.
  }
}
