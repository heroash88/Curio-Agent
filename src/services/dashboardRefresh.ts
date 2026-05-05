import type {
  DashboardWidgetConfig,
  DashboardWidgetType,
} from './dashboardTypes';

export type DashboardRefreshMode = 'push' | 'timed' | 'manual';

export interface DashboardRefreshPolicy {
  mode: DashboardRefreshMode;
  intervalMinutes: number;
  intervalMs: number | null;
  minIntervalMinutes: number;
  shouldPoll: boolean;
  label: string;
  description: string;
}

export const LIVE_DASHBOARD_WIDGET_TYPES = [
  'weather',
  'forecast',
  'air_quality',
  'astronomy',
  'calendar',
  'google_calendar',
  'outlook_calendar',
  'ical_calendar',
  'commute',
  'map',
  'tasks',
  'google_tasks',
  'chores',
  'mail',
  'gmail',
  'outlook_mail',
  'messages',
  'slack',
  'stock',
  'news',
  'quote',
  'fun_fact',
  'ha_entities',
  'ha_sensor',
  'ha_camera',
  'ha_light',
  'ha_climate',
  'ha_cover',
  'ha_media_player',
  'ha_select',
  'ha_button_stack',
  'ha_calendar',
  'ha_vacuum',
  'ha_printer',
  'ha_energy',
] as const satisfies readonly DashboardWidgetType[];

const LIVE_WIDGET_SET = new Set<DashboardWidgetType>(
  LIVE_DASHBOARD_WIDGET_TYPES,
);

const DEFAULT_INTERVAL_MINUTES: Partial<Record<DashboardWidgetType, number>> = {
  weather: 10,
  forecast: 10,
  air_quality: 10,
  astronomy: 20,
  calendar: 5,
  google_calendar: 5,
  outlook_calendar: 5,
  ical_calendar: 5,
  commute: 10,
  map: 10,
  tasks: 5,
  google_tasks: 5,
  chores: 5,
  mail: 5,
  gmail: 5,
  outlook_mail: 5,
  messages: 5,
  slack: 5,
  stock: 15,
  news: 15,
  quote: 60,
  fun_fact: 60,
  ha_entities: 1,
  ha_sensor: 1,
  ha_camera: 1,
  ha_light: 1,
  ha_climate: 1,
  ha_cover: 1,
  ha_media_player: 1,
  ha_select: 1,
  ha_button_stack: 1,
  ha_calendar: 5,
  ha_vacuum: 1,
  ha_printer: 1,
  ha_energy: 1,
};

const MIN_INTERVAL_MINUTES: Partial<Record<DashboardWidgetType, number>> = {
  stock: 15,
  news: 10,
  quote: 15,
  fun_fact: 15,
  weather: 5,
  forecast: 5,
  air_quality: 5,
  astronomy: 10,
  calendar: 3,
  google_calendar: 3,
  outlook_calendar: 3,
  ical_calendar: 3,
  mail: 3,
  gmail: 3,
  outlook_mail: 3,
  messages: 3,
  slack: 3,
  ha_camera: 1,
  ha_sensor: 1,
  ha_entities: 1,
  ha_light: 1,
  ha_climate: 1,
  ha_cover: 1,
  ha_media_player: 1,
  ha_select: 1,
  ha_button_stack: 1,
  ha_calendar: 3,
  ha_vacuum: 1,
  ha_printer: 1,
  ha_energy: 1,
};

const MODE_LABELS: Record<DashboardRefreshMode, string> = {
  push: 'Push',
  timed: 'Timed',
  manual: 'Manual',
};

const MODE_DESCRIPTIONS: Record<DashboardRefreshMode, string> = {
  push: 'Use app/session updates and refresh after widget actions.',
  timed: 'Refresh on a safe timer while the dashboard is visible.',
  manual: 'Only refresh on open, save, or the refresh button.',
};

const normalizeMode = (value: unknown): DashboardRefreshMode => {
  if (value === 'push' || value === 'manual' || value === 'timed') {
    return value;
  }
  return 'timed';
};

const normalizeInterval = (
  value: unknown,
  fallback: number,
  min: number,
): number => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : fallback;
  const finite = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.round(finite));
};

export const isLiveDashboardWidget = (type: DashboardWidgetType): boolean =>
  LIVE_WIDGET_SET.has(type);

export const getDashboardRefreshDefaults = (type: DashboardWidgetType) => {
  const minIntervalMinutes = MIN_INTERVAL_MINUTES[type] ?? 5;
  return {
    minIntervalMinutes,
    defaultIntervalMinutes:
      DEFAULT_INTERVAL_MINUTES[type] ?? minIntervalMinutes,
  };
};

export const getDashboardRefreshPolicy = (
  type: DashboardWidgetType,
  config: Pick<
    DashboardWidgetConfig,
    'refreshMode' | 'refreshIntervalMinutes'
  > = {},
): DashboardRefreshPolicy => {
  const mode = normalizeMode(config.refreshMode);
  const defaults = getDashboardRefreshDefaults(type);
  const intervalMinutes = normalizeInterval(
    config.refreshIntervalMinutes,
    defaults.defaultIntervalMinutes,
    defaults.minIntervalMinutes,
  );
  const shouldPoll = isLiveDashboardWidget(type) && mode === 'timed';

  return {
    mode,
    intervalMinutes,
    intervalMs: shouldPoll ? intervalMinutes * 60 * 1000 : null,
    minIntervalMinutes: defaults.minIntervalMinutes,
    shouldPoll,
    label: MODE_LABELS[mode],
    description: MODE_DESCRIPTIONS[mode],
  };
};

export const getDashboardRefreshEventName = (widgetId: string): string =>
  `curio:dashboard-refresh-widget:${widgetId}`;

// --- Widget data-updated event (Requirements 2.1, 20.1, 22.1) ---------------

export const DASHBOARD_WIDGET_DATA_UPDATED_EVENT =
  'curio:widget-data-updated' as const;

export interface DashboardWidgetDataUpdatedDetail {
  widgetId: string;
  widgetType: DashboardWidgetType;
  updatedAt: number;
}

/**
 * Dispatches the shared `curio:widget-data-updated` event on `window` after
 * a successful widget refresh. SSR-safe and never throws: any missing
 * window/CustomEvent is silently swallowed so call sites can fire-and-forget.
 */
export const dispatchWidgetDataUpdated = (
  detail: DashboardWidgetDataUpdatedDetail,
): void => {
  try {
    if (typeof window === 'undefined') return;
    if (typeof window.CustomEvent !== 'function') return;
    const event = new window.CustomEvent<DashboardWidgetDataUpdatedDetail>(
      DASHBOARD_WIDGET_DATA_UPDATED_EVENT,
      { detail },
    );
    window.dispatchEvent(event);
  } catch {
    // Swallow — dispatch must never break the refresh path.
  }
};

// --- Freshness + sheen helpers (Requirements 20.1, 22.1, 22.5) --------------

export const FRESHNESS_FRESH_WINDOW_MS = 30_000;

export type FreshnessState = 'fresh' | 'idle' | 'stale' | 'error';

export interface ComputeFreshnessStateArgs {
  updatedAt: number | null;
  intervalMs: number | null;
  lastRefreshError: unknown | null;
  nowMs: number;
}

/**
 * Pure classifier for the FreshnessDot. Exactly one of
 * `'fresh' | 'idle' | 'stale' | 'error'` is returned.
 *
 * Rules (in order):
 *  - `lastRefreshError` truthy wins => `'error'`.
 *  - Never-refreshed (`updatedAt == null`) => `'idle'`.
 *  - Age `<` {@link FRESHNESS_FRESH_WINDOW_MS} => `'fresh'` (negative ages
 *    from clock skew are also treated as fresh).
 *  - `intervalMs != null && age >= intervalMs` => `'stale'`.
 *  - Otherwise => `'idle'`.
 */
export const computeFreshnessState = ({
  updatedAt,
  intervalMs,
  lastRefreshError,
  nowMs,
}: ComputeFreshnessStateArgs): FreshnessState => {
  if (lastRefreshError) return 'error';
  if (updatedAt == null) return 'idle';

  const age = nowMs - updatedAt;
  if (age < FRESHNESS_FRESH_WINDOW_MS) return 'fresh';

  if (intervalMs != null && age >= intervalMs) return 'stale';
  return 'idle';
};

export interface ShouldRenderSheenArgs {
  isFirstLoad: boolean;
  isRefreshing: boolean;
  sheenEnabled: boolean;
  motionProfile: { shouldAnimate: boolean };
}

/**
 * Pure guard for the stale-while-revalidate sheen. Sheen only renders when
 * every gate aligns: feature enabled, actively refreshing, not the initial
 * first-load placeholder, and the motion profile permits animation.
 */
export const shouldRenderSheen = ({
  isFirstLoad,
  isRefreshing,
  sheenEnabled,
  motionProfile,
}: ShouldRenderSheenArgs): boolean =>
  Boolean(
    sheenEnabled &&
      isRefreshing &&
      !isFirstLoad &&
      motionProfile?.shouldAnimate,
  );
