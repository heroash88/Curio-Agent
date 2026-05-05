import { useEffect, useSyncExternalStore } from 'react';

export interface AppUsage {
  id: string;
  label: string;
  minutes: number;
  color: string;
}

export interface DashboardActivityWidgetUsage {
  type: string;
  label: string;
  count: number;
}

export interface DashboardActivityDay {
  date: string;
  dashboardMs: number;
  aiMessages: number;
  textMessages: number;
  voiceMessages: number;
  responseCards: number;
  widgetInteractions: number;
  dashboardVisits: number;
  commands: number;
  settingsOpens: number;
  firstSeenAt: number | null;
  lastSeenAt: number | null;
  activeMsByHour: Record<string, number>;
  messagesByBackend: Record<string, number>;
  cardTypes: Record<string, number>;
  widgetUsage: Record<string, DashboardActivityWidgetUsage>;
  categoryUsage: Record<string, AppUsage>;
}

export interface DashboardActivityStore {
  version: 1;
  updatedAt: number;
  days: Record<string, DashboardActivityDay>;
}

export interface DashboardActivitySummary {
  today: DashboardActivityDay;
  previousDay: DashboardActivityDay | null;
  week: DashboardActivityDay[];
  weeklyTotals: Pick<
    DashboardActivityDay,
    | 'dashboardMs'
    | 'aiMessages'
    | 'textMessages'
    | 'voiceMessages'
    | 'responseCards'
    | 'widgetInteractions'
    | 'dashboardVisits'
    | 'commands'
    | 'settingsOpens'
  >;
  topWidget: DashboardActivityWidgetUsage | null;
  activeHour: { hour: number; label: string; durationMs: number } | null;
  focusScore: number;
  topCardType: { type: string; count: number } | null;
}

export type DashboardActivityEventType =
  | 'dashboardOpen'
  | 'dashboardTime'
  | 'aiMessage'
  | 'responseCard'
  | 'widgetInteraction'
  | 'command'
  | 'settingsOpen';

type DashboardActivityPayload = {
  durationMs?: number;
  source?: 'text' | 'voice' | 'system';
  backend?: string;
  cardType?: string;
  widgetId?: string;
  widgetType?: string;
  widgetLabel?: string;
};

const LEGACY_STORAGE_KEY = 'etheros_screentime';
const STORAGE_KEY = 'curio_dashboard_activity_v1';
export const SCREEN_TIME_EVENT = 'curio:screentime-changed';
export const DASHBOARD_ACTIVITY_EVENT = 'curio:dashboard-activity-changed';
const RETAINED_DAY_COUNT = 21;

const emptyTotals = {
  dashboardMs: 0,
  aiMessages: 0,
  textMessages: 0,
  voiceMessages: 0,
  responseCards: 0,
  widgetInteractions: 0,
  dashboardVisits: 0,
  commands: 0,
  settingsOpens: 0,
};

const emitActivityChanged = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent(SCREEN_TIME_EVENT));
  window.dispatchEvent(new CustomEvent(DASHBOARD_ACTIVITY_EVENT));
  window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

const pad = (value: number) => String(value).padStart(2, '0');

export const getDashboardActivityDateKey = (timestamp = Date.now()) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const createEmptyDay = (date = getDashboardActivityDateKey()): DashboardActivityDay => ({
  date,
  dashboardMs: 0,
  aiMessages: 0,
  textMessages: 0,
  voiceMessages: 0,
  responseCards: 0,
  widgetInteractions: 0,
  dashboardVisits: 0,
  commands: 0,
  settingsOpens: 0,
  firstSeenAt: null,
  lastSeenAt: null,
  activeMsByHour: {},
  messagesByBackend: {},
  cardTypes: {},
  widgetUsage: {},
  categoryUsage: {},
});

const normalizeDay = (
  day: Partial<DashboardActivityDay> | null | undefined,
  date: string,
): DashboardActivityDay => ({
  ...createEmptyDay(date),
  ...(day || {}),
  date,
  activeMsByHour: day?.activeMsByHour || {},
  messagesByBackend: day?.messagesByBackend || {},
  cardTypes: day?.cardTypes || {},
  widgetUsage: day?.widgetUsage || {},
  categoryUsage: day?.categoryUsage || {},
});

const readStore = (): DashboardActivityStore => {
  if (typeof window === 'undefined') {
    return { version: 1, updatedAt: 0, days: {} };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, updatedAt: 0, days: {} };
    const parsed = JSON.parse(raw) as Partial<DashboardActivityStore>;
    const days = Object.fromEntries(
      Object.entries(parsed.days || {}).map(([date, day]) => [
        date,
        normalizeDay(day, date),
      ]),
    );
    return { version: 1, updatedAt: parsed.updatedAt || 0, days };
  } catch {
    return { version: 1, updatedAt: 0, days: {} };
  }
};

const pruneDays = (days: Record<string, DashboardActivityDay>) => {
  const orderedKeys = Object.keys(days).sort();
  const retainedKeys = orderedKeys.slice(-RETAINED_DAY_COUNT);
  return Object.fromEntries(retainedKeys.map((key) => [key, days[key]]));
};

const writeStore = (store: DashboardActivityStore) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...store,
      days: pruneDays(store.days),
      updatedAt: Date.now(),
    }),
  );
  emitActivityChanged();
};

const updateToday = (
  updater: (day: DashboardActivityDay, timestamp: number) => void,
  timestamp = Date.now(),
) => {
  const date = getDashboardActivityDateKey(timestamp);
  const store = readStore();
  const day = normalizeDay(store.days[date], date);
  day.firstSeenAt = day.firstSeenAt ?? timestamp;
  day.lastSeenAt = timestamp;
  updater(day, timestamp);
  store.days[date] = day;
  writeStore(store);
};

export const resetDashboardActivityMetrics = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  cachedSummaryRaw = '';
  cachedSummaryValue = null;
  lastDashboardSessionOpenAt = 0;
  emitActivityChanged();
};

export const trackDashboardActivityEvent = (
  type: DashboardActivityEventType,
  payload: DashboardActivityPayload = {},
) => {
  updateToday((day, timestamp) => {
    if (type === 'dashboardOpen') {
      day.dashboardVisits += 1;
      return;
    }

    if (type === 'dashboardTime') {
      const durationMs = Math.max(0, Math.round(payload.durationMs || 0));
      if (durationMs <= 0) return;
      day.dashboardMs += durationMs;
      const hour = String(new Date(timestamp).getHours());
      day.activeMsByHour[hour] = (day.activeMsByHour[hour] || 0) + durationMs;
      return;
    }

    if (type === 'aiMessage') {
      day.aiMessages += 1;
      if (payload.source === 'voice') {
        day.voiceMessages += 1;
      } else {
        day.textMessages += 1;
      }
      const backend = payload.backend || 'unknown';
      day.messagesByBackend[backend] = (day.messagesByBackend[backend] || 0) + 1;
      return;
    }

    if (type === 'responseCard') {
      day.responseCards += 1;
      const cardType = payload.cardType || 'card';
      day.cardTypes[cardType] = (day.cardTypes[cardType] || 0) + 1;
      return;
    }

    if (type === 'widgetInteraction') {
      day.widgetInteractions += 1;
      const widgetType = payload.widgetType || 'widget';
      const existing = day.widgetUsage[widgetType];
      day.widgetUsage[widgetType] = {
        type: widgetType,
        label: payload.widgetLabel || existing?.label || widgetType,
        count: (existing?.count || 0) + 1,
      };
      return;
    }

    if (type === 'command') {
      day.commands += 1;
      return;
    }

    if (type === 'settingsOpen') {
      day.settingsOpens += 1;
    }
  });
};

const sumDays = (days: DashboardActivityDay[]) =>
  days.reduce(
    (totals, day) => ({
      dashboardMs: totals.dashboardMs + day.dashboardMs,
      aiMessages: totals.aiMessages + day.aiMessages,
      textMessages: totals.textMessages + day.textMessages,
      voiceMessages: totals.voiceMessages + day.voiceMessages,
      responseCards: totals.responseCards + day.responseCards,
      widgetInteractions: totals.widgetInteractions + day.widgetInteractions,
      dashboardVisits: totals.dashboardVisits + day.dashboardVisits,
      commands: totals.commands + day.commands,
      settingsOpens: totals.settingsOpens + day.settingsOpens,
    }),
    { ...emptyTotals },
  );

const getTopWidget = (day: DashboardActivityDay) => {
  const widgets = Object.values(day.widgetUsage);
  if (widgets.length === 0) return null;
  return widgets.sort((left, right) => right.count - left.count)[0];
};

const getTopCardType = (day: DashboardActivityDay) => {
  const entries = Object.entries(day.cardTypes);
  if (entries.length === 0) return null;
  const [type, count] = entries.sort((left, right) => right[1] - left[1])[0];
  return { type, count };
};

const getActiveHour = (day: DashboardActivityDay) => {
  const entries = Object.entries(day.activeMsByHour);
  if (entries.length === 0) return null;
  const [rawHour, durationMs] = entries.sort((left, right) => right[1] - left[1])[0];
  const hour = Number(rawHour);
  const labelDate = new Date();
  labelDate.setHours(hour, 0, 0, 0);
  return {
    hour,
    durationMs,
    label: labelDate.toLocaleTimeString([], { hour: 'numeric' }),
  };
};

const calculateFocusScore = (day: DashboardActivityDay) => {
  const activeMinutes = day.dashboardMs / 60_000;
  if (activeMinutes <= 0) return 0;
  const signalCount = day.aiMessages + day.responseCards + day.widgetInteractions;
  const interactionLoad = signalCount / Math.max(1, activeMinutes);
  return Math.max(
    0,
    Math.min(100, Math.round(88 - interactionLoad * 7 + Math.min(10, activeMinutes / 6))),
  );
};

export const getDashboardActivitySummary = (
  timestamp = Date.now(),
): DashboardActivitySummary => {
  const store = readStore();
  const todayKey = getDashboardActivityDateKey(timestamp);
  const today = normalizeDay(store.days[todayKey], todayKey);
  const date = new Date(timestamp);
  const week = Array.from({ length: 7 }, (_, index) => {
    const dayDate = new Date(date);
    dayDate.setDate(date.getDate() - (6 - index));
    const key = getDashboardActivityDateKey(dayDate.getTime());
    return normalizeDay(store.days[key], key);
  });
  const previousDate = new Date(date);
  previousDate.setDate(date.getDate() - 1);
  const previousKey = getDashboardActivityDateKey(previousDate.getTime());
  const previousDay = store.days[previousKey]
    ? normalizeDay(store.days[previousKey], previousKey)
    : null;

  return {
    today,
    previousDay,
    week,
    weeklyTotals: sumDays(week),
    topWidget: getTopWidget(today),
    activeHour: getActiveHour(today),
    focusScore: calculateFocusScore(today),
    topCardType: getTopCardType(today),
  };
};

let cachedSummaryRaw = '';
let cachedSummaryValue: DashboardActivitySummary | null = null;
let lastDashboardSessionOpenAt = 0;

const getDashboardActivitySummarySnapshot = () => {
  if (typeof window === 'undefined') return getDashboardActivitySummary();
  const raw = `${getDashboardActivityDateKey()}::${
    localStorage.getItem(STORAGE_KEY) || ''
  }`;
  if (cachedSummaryValue && raw === cachedSummaryRaw) {
    return cachedSummaryValue;
  }
  cachedSummaryRaw = raw;
  cachedSummaryValue = getDashboardActivitySummary();
  return cachedSummaryValue;
};

const subscribeToDashboardActivity = (onStoreChange: () => void) => {
  if (typeof window === 'undefined') return () => {};
  const handleChange = () => onStoreChange();
  window.addEventListener('storage', handleChange);
  window.addEventListener('curio:settings-changed', handleChange);
  window.addEventListener(DASHBOARD_ACTIVITY_EVENT, handleChange);
  window.addEventListener(SCREEN_TIME_EVENT, handleChange);
  return () => {
    window.removeEventListener('storage', handleChange);
    window.removeEventListener('curio:settings-changed', handleChange);
    window.removeEventListener(DASHBOARD_ACTIVITY_EVENT, handleChange);
    window.removeEventListener(SCREEN_TIME_EVENT, handleChange);
  };
};

export const useDashboardActivitySummary = () =>
  useSyncExternalStore(
    subscribeToDashboardActivity,
    getDashboardActivitySummarySnapshot,
    getDashboardActivitySummarySnapshot,
  );

export const startDashboardActivitySession = () => {
  if (typeof window === 'undefined') return () => {};
  const startedAt = Date.now();
  if (startedAt - lastDashboardSessionOpenAt > 10_000) {
    trackDashboardActivityEvent('dashboardOpen');
    lastDashboardSessionOpenAt = startedAt;
  }
  let lastVisibleAt = Date.now();

  const flush = (force = false) => {
    if (!force && document.visibilityState === 'hidden') return;
    const now = Date.now();
    const durationMs = now - lastVisibleAt;
    lastVisibleAt = now;
    trackDashboardActivityEvent('dashboardTime', { durationMs });
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      flush(true);
    } else {
      lastVisibleAt = Date.now();
    }
  };

  const interval = window.setInterval(flush, 15_000);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => {
    flush();
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
};

export const useDashboardActivityTracking = (enabled = true) => {
  useEffect(() => {
    if (!enabled) return undefined;
    return startDashboardActivitySession();
  }, [enabled]);
};

export function getScreenTime(): AppUsage[] {
  const summary = getDashboardActivitySummary();
  const activityUsage: AppUsage[] = [
    {
      id: 'dashboard-time',
      label: 'Dashboard time',
      minutes: Math.round(summary.today.dashboardMs / 60_000),
      color: '#38bdf8',
    },
    {
      id: 'ai-messages',
      label: 'AI messages',
      minutes: summary.today.aiMessages,
      color: '#a78bfa',
    },
    {
      id: 'widget-interactions',
      label: 'Widget interactions',
      minutes: summary.today.widgetInteractions,
      color: '#34d399',
    },
  ];
  return [
    ...activityUsage,
    ...Object.values(summary.today.categoryUsage),
  ].filter((item) => item.minutes > 0);
}

export function trackUsage(category: string, minutes: number) {
  updateToday((day) => {
    const id = category.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `usage-${Date.now()}`;
    const existing = day.categoryUsage[id];
    day.categoryUsage[id] = {
      id,
      label: category,
      minutes: (existing?.minutes || 0) + Math.max(0, Math.round(minutes)),
      color: existing?.color || 'var(--ether-slate)',
    };
  });
}
