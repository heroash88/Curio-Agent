/**
 * Helpers for mapping natural-language widget references onto concrete
 * DashboardWidgetType values and dispatching the `curio:dashboard-widget-intent`
 * event used by the Dashboard to open widgets on demand.
 */

import { WIDGET_CATALOG, type DashboardWidgetType } from '../dashboardTypes';

const DASHBOARD_WIDGET_TYPES = new Set<DashboardWidgetType>(
    WIDGET_CATALOG.map((item) => item.type),
);

const DASHBOARD_WIDGET_ALIASES: Record<string, DashboardWidgetType> = {
    youtube: 'youtube_video',
    'youtube video': 'youtube_video',
    video: 'youtube_video',
    videos: 'youtube_video',
    music: 'music',
    'now playing': 'music',
    player: 'music',
    weather: 'weather',
    forecast: 'forecast',
    clock: 'clock',
    'world clock': 'world_clock',
    greeting: 'greeting',
    welcome: 'greeting',
    profile: 'profile',
    activity: 'health',
    health: 'health',
    calendar: 'calendar',
    reminders: 'reminders',
    reminder: 'reminders',
    notes: 'notes',
    note: 'notes',
    obsidian: 'obsidian_notes',
    'obsidian notes': 'obsidian_notes',
    tasks: 'tasks',
    task: 'tasks',
    todo: 'tasks',
    'to do': 'tasks',
    'google tasks': 'google_tasks',
    chores: 'chores',
    chore: 'chores',
    mail: 'mail',
    email: 'mail',
    gmail: 'gmail',
    outlook: 'outlook_mail',
    slack: 'slack',
    messages: 'messages',
    bookmarks: 'bookmarks',
    habits: 'habits',
    news: 'news',
    stock: 'stock',
    stocks: 'stock',
    map: 'map',
    location: 'map',
    commute: 'commute',
    alarms: 'alarms',
    alarm: 'alarms',
    timers: 'timers',
    timer: 'timers',
    sketch: 'sketch',
    drawing: 'sketch',
    freeform: 'sketch',
    robot: 'robot_face',
    'robot face': 'robot_face',
    camera: 'ha_camera',
};

const normalizeWidgetAlias = (value: string): string =>
    value
        .toLowerCase()
        .trim()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ');

export const resolveDashboardWidgetType = (value: unknown): DashboardWidgetType | null => {
    if (typeof value !== 'string') return null;
    const normalized = normalizeWidgetAlias(value);
    if (!normalized) return null;

    const alias = DASHBOARD_WIDGET_ALIASES[normalized];
    if (alias) return alias;

    const typeCandidate = normalized.replace(/\s+/g, '_') as DashboardWidgetType;
    if (DASHBOARD_WIDGET_TYPES.has(typeCandidate)) return typeCandidate;

    for (const item of WIDGET_CATALOG) {
        const normalizedLabel = normalizeWidgetAlias(item.label);
        if (normalizedLabel === normalized || normalized.includes(normalizedLabel)) {
            return item.type;
        }
        if ((item.keywords || []).some((keyword) => normalizeWidgetAlias(keyword) === normalized)) {
            return item.type;
        }
    }

    return null;
};

export const buildDashboardWidgetConfigPatch = (
    widgetType: DashboardWidgetType,
    args: any,
): Partial<Record<string, unknown>> => {
    if (widgetType === 'youtube_video') {
        const query = String(args?.query || '').trim();
        const title = String(args?.title || '').trim();
        const videoId = String(args?.videoId || '').trim();
        return {
            ...(query ? { youtubeQuery: query } : {}),
            ...(videoId ? { youtubeVideoId: videoId } : {}),
            ...(title || query ? { youtubeTitle: title || query } : {}),
            youtubeAutoplay: args?.autoplay !== false,
            youtubeRequestNonce: Date.now(),
        };
    }

    if (widgetType === 'news') {
        const topic = String(args?.query || args?.topic || '').trim();
        return topic ? { newsTopic: topic } : {};
    }

    if (widgetType === 'stock') {
        const symbols = String(args?.query || args?.symbols || '').trim();
        return symbols ? { symbols } : {};
    }

    return {};
};

export const dispatchDashboardWidgetIntent = (
    widgetType: DashboardWidgetType,
    configPatch: Partial<Record<string, unknown>> = {},
): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        window.dispatchEvent(new CustomEvent('curio:dashboard-widget-intent', {
            detail: { widgetType, configPatch },
        }));
        return true;
    } catch {
        return false;
    }
};
