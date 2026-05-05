import {
  getDashboardCatalogItem,
  type DashboardWidget,
} from './dashboardTypes';
import type { AqiData, WeatherData } from './weatherService';

export interface DashboardSearchRuntime {
  weather?: WeatherData | null;
  aqi?: AqiData | null;
  tempUnit: 'F' | 'C';
}

export interface DashboardSearchResult {
  id: string;
  widgetId: string;
  label: string;
  title: string;
  summary: string;
  detail: string;
  badges: string[];
}

const normalize = (value: string) => value.trim().toLowerCase();

const stripHtml = (value: string) => value
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const clampSnippet = (value: string, max = 120) => {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}…`;
};

const weatherResult = (
  widget: DashboardWidget,
  weather: WeatherData,
  aqi: AqiData | null | undefined,
  tempUnit: 'F' | 'C',
): DashboardSearchResult => {
  const catalog = getDashboardCatalogItem(widget.type);
  const temp = tempUnit === 'C' ? weather.tempC : weather.tempF;
  const today = weather.daily?.[0];
  const high = today ? (tempUnit === 'C' ? today.highC : today.highF) : undefined;
  const low = today ? (tempUnit === 'C' ? today.lowC : today.lowF) : undefined;
  const highLow = high != null && low != null ? `H ${high}° / L ${low}°` : 'Forecast unavailable';
  const detail = [
    weather.humidity != null ? `Humidity ${weather.humidity}%` : null,
    weather.windSpeedMph != null ? `Wind ${weather.windSpeedMph} mph` : null,
    aqi ? `Air ${aqi.category} (${aqi.value})` : null,
  ].filter(Boolean).join(' • ');

  return {
    id: `${widget.id}:weather`,
    widgetId: widget.id,
    label: catalog?.label || 'Weather',
    title: `${temp}°${tempUnit} and ${weather.desc}`,
    summary: `${weather.city || 'Local weather'} • ${highLow}`,
    detail: detail || 'Current weather is available on this widget.',
    badges: ['Live weather', weather.desc, weather.city].filter(Boolean),
  };
};

const genericResult = (widget: DashboardWidget): DashboardSearchResult => {
  const catalog = getDashboardCatalogItem(widget.type);
  const label = widget.config.displayName || widget.config.richNoteTitle || widget.config.tableTitle || catalog?.label || widget.type;
  const configParts = [
    widget.config.city,
    widget.config.channelName,
    widget.config.customLocation,
    widget.config.customDestination,
    widget.config.youtubeTitle,
    widget.config.youtubeQuery,
    widget.config.symbols,
    widget.config.newsTopic,
    widget.config.domain,
    ...(widget.config.entityIds || []),
  ].filter(Boolean).join(' • ');

  let content = '';
  if (widget.type === 'rich_note') {
    content = stripHtml(String(widget.config.richNoteHtml || ''));
  }
  if (widget.type === 'table') {
    content = (widget.config.tableCells || []).flat().join(' • ');
  }

  return {
    id: `${widget.id}:widget`,
    widgetId: widget.id,
    label,
    title: label,
    summary: clampSnippet(content || configParts || catalog?.description || 'Widget is on the board.'),
    detail: catalog?.description || 'Open this widget to see more.',
    badges: [catalog?.category, widget.type.replace(/_/g, ' ')].filter(Boolean) as string[],
  };
};

const resultHaystack = (result: DashboardSearchResult) => [
  result.label,
  result.title,
  result.summary,
  result.detail,
  ...result.badges,
].join(' ').toLowerCase();

const scoreResult = (result: DashboardSearchResult, query: string) => {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 1;
  const haystack = resultHaystack(result);
  if (!haystack.includes(normalizedQuery)) return 0;
  if (normalize(result.label) === normalizedQuery) return 100;
  if (normalize(result.label).startsWith(normalizedQuery)) return 80;
  if (normalize(result.title).includes(normalizedQuery)) return 60;
  return 20;
};

export const buildDashboardSearchResults = (
  widgets: DashboardWidget[],
  query: string,
  runtime: DashboardSearchRuntime,
): DashboardSearchResult[] => {
  if (!normalize(query)) {
    return [];
  }

  return widgets
    .filter((widget) => widget.enabled)
    .map((widget) => (
      (widget.type === 'weather' || widget.type === 'forecast') && runtime.weather
        ? weatherResult(widget, runtime.weather, runtime.aqi, runtime.tempUnit)
        : genericResult(widget)
    ))
    .map((result, index) => ({ result, score: scoreResult(result, query), index }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.result);
};
