import React, { useEffect, useMemo, useState } from 'react';
import { CloudSun, MapPin, Plus, TrendingUp, Umbrella, X } from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useDashboardWeatherData } from '../../../hooks/useDashboardWeatherData';
import { useDragReorder } from '../../../hooks/useDragReorder';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type { DashboardWidget, DashboardWidgetConfig } from '../../../services/dashboardTypes';
import type { AqiData, DailyForecast, WeatherData } from '../../../services/weatherService';
import { useTempUnit } from '../../../utils/settingsStorage';
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from '../../../utils/settings/dashboardSettings';
import WidgetShell from './WidgetShell';
import { DragReorderHandle, InlineQuickAdd, WidgetSkeleton, WidgetText } from './widgetPrimitives';

interface ForecastWidgetProps {
  widget: DashboardWidget;
  weather: WeatherData | null;
  aqi: AqiData | null;
  onUpdateWidgetConfig?: (widgetId: string, patch: Partial<DashboardWidgetConfig>) => void;
}

const CONDITION_EMOJIS: Record<string, string> = {
  clear: '☀️',
  sunny: '☀️',
  cloudy: '☁️',
  overcast: '☁️',
  rain: '🌧️',
  rainy: '🌧️',
  drizzle: '🌦️',
  'light drizzle': '🌦️',
  'light rain': '🌦️',
  'light showers': '🌦️',
  'heavy rain': '🌧️',
  'heavy showers': '🌧️',
  snow: '❄️',
  snowy: '❄️',
  'light snow': '🌨️',
  storm: '⛈️',
  thunderstorm: '⛈️',
  fog: '🌫️',
  foggy: '🌫️',
  mist: '🌫️',
  'partly cloudy': '⛅',
  'mostly clear': '🌤️',
};

const uniqueCities = (cities: string[]) => {
  const seen = new Set<string>();
  return cities
    .map((city) => city.trim())
    .filter((city) => {
      if (!city) return false;
      const key = city.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const parseCityQuickAdd = (
  input: string,
): { city: string } | { parseError: string } => {
  const trimmed = input.trim();
  if (!trimmed) return { parseError: 'City required' };
  return { city: trimmed };
};

const getDayTemp = (day: DailyForecast, unit: 'F' | 'C', kind: 'high' | 'low') =>
  unit === 'C'
    ? kind === 'high'
      ? day.highC
      : day.lowC
    : kind === 'high'
      ? day.highF
      : day.lowF;

const getForecastEmoji = (condition?: string) =>
  CONDITION_EMOJIS[(condition || '').toLowerCase()] ?? '🌤️';

const describeTrend = (days: DailyForecast[], unit: 'F' | 'C') => {
  if (days.length < 2) return 'Forecast building';
  const first = getDayTemp(days[0], unit, 'high');
  const last = getDayTemp(days[Math.min(days.length, 5) - 1], unit, 'high');
  const delta = last - first;
  if (Math.abs(delta) <= 2) return 'Holding steady';
  return delta > 0 ? `Warming trend +${delta}°` : `Cooling trend ${delta}°`;
};

const describeRainRisk = (days: DailyForecast[]) => {
  const wettest = days.reduce<DailyForecast | null>((best, day) => {
    if (!best) return day;
    return (day.humidity || 0) > (best.humidity || 0) ? day : best;
  }, null);
  if (!wettest || wettest.humidity == null) return 'Rain risk unavailable';
  return `Rain risk ${wettest.humidity}% ${wettest.date}`;
};

const describeBestDay = (days: DailyForecast[], unit: 'F' | 'C') => {
  if (days.length === 0) return 'No clear best day';
  const best = days.reduce((winner, day) => {
    const winnerHigh = getDayTemp(winner, unit, 'high');
    const dayHigh = getDayTemp(day, unit, 'high');
    const winnerScore = Math.abs(winnerHigh - 72) + (winner.humidity || 0) / 8;
    const dayScore = Math.abs(dayHigh - 72) + (day.humidity || 0) / 8;
    return dayScore < winnerScore ? day : winner;
  }, days[0]);
  return `Best window ${best.date}`;
};

const ForecastWidget: React.FC<ForecastWidgetProps> = ({
  widget,
  weather,
  aqi,
  onUpdateWidgetConfig,
}) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const tempUnit = useTempUnit();
  const configuredCitiesKey = Array.isArray(widget.config.forecastCities)
    ? widget.config.forecastCities.join('\n')
    : '';
  const initialCities = useMemo(() => {
    const configuredCities = configuredCitiesKey ? configuredCitiesKey.split('\n') : [];
    const fallbackCity = widget.config.city || weather?.city || '';
    return uniqueCities(configuredCities.length ? configuredCities : [fallbackCity]);
  }, [configuredCitiesKey, weather?.city, widget.config.city]);
  const [trackedCities, setTrackedCities] = useState<string[]>(initialCities);
  const [activeCity, setActiveCity] = useState(
    widget.config.city || initialCities[0] || weather?.city || '',
  );
  const [draftCity, setDraftCity] = useState('');

  useEffect(() => {
    setTrackedCities(initialCities);
    setActiveCity((current) => {
      if (current && initialCities.some((city) => city.toLowerCase() === current.toLowerCase())) {
        return current;
      }
      return widget.config.city || initialCities[0] || weather?.city || '';
    });
  }, [initialCities, weather?.city, widget.config.city]);

  const activeLookupCity = activeCity || trackedCities[0] || widget.config.city || weather?.city || '';
  const { weather: resolved, loading } = useDashboardWeatherData({
    widgetId: widget.id,
    widgetType: widget.type,
    city: activeLookupCity,
    fallbackWeather: weather,
    fallbackAqi: aqi,
    refreshMode: widget.config.refreshMode,
    refreshIntervalMinutes: widget.config.refreshIntervalMinutes,
  });

  const daily = (resolved?.daily || []).slice(0, 5);
  const activeCityName = resolved?.city || activeLookupCity || 'Local weather';
  const temperature = resolved ? `${tempUnit === 'C' ? resolved.tempC : resolved.tempF}°${tempUnit}` : '--';
  const trend = describeTrend(daily, tempUnit);
  const rainRisk = describeRainRisk(daily);
  const bestDay = describeBestDay(daily, tempUnit);

  const persistCities = (nextCities: string[], nextActiveCity: string) => {
    setTrackedCities(nextCities);
    setActiveCity(nextActiveCity);
    onUpdateWidgetConfig?.(widget.id, {
      forecastCities: nextCities,
      city: nextActiveCity,
    });
  };

  const selectCity = (city: string) => {
    setActiveCity(city);
    onUpdateWidgetConfig?.(widget.id, { city });
  };

  const handleAddCity = () => {
    const city = draftCity.trim();
    if (!city) return;
    const existingCity = trackedCities.find((item) => item.toLowerCase() === city.toLowerCase());
    const nextCities = existingCity ? trackedCities : uniqueCities([...trackedCities, city]);
    persistCities(nextCities, existingCity || city);
    setDraftCity('');
  };

  const handleRemoveCity = (city: string) => {
    const nextCities = trackedCities.filter((item) => item.toLowerCase() !== city.toLowerCase());
    const nextActiveCity =
      activeCity.toLowerCase() === city.toLowerCase()
        ? nextCities[0] || ''
        : activeCity || nextCities[0] || '';
    persistCities(nextCities, nextActiveCity);
  };

  const boardInteractivity = useDashboardInteractivitySettings();
  const dragReorderEnabled = effectiveToggle(
    'dragReorderEnabled',
    boardInteractivity,
    widget.config,
  );
  const inlineQuickAddEnabled = effectiveToggle(
    'inlineQuickAddEnabled',
    boardInteractivity,
    widget.config,
  );
  const {
    getRowBindings,
    announcement: dragAnnouncement,
  } = useDragReorder<string>(
    trackedCities,
    (next) => persistCities(next, activeLookupCity),
    {
      keyExtractor: (city) => city,
      enabled: dragReorderEnabled && Boolean(onUpdateWidgetConfig),
    },
  );

  if (size.sizeClass === 'tiny') {
    const tomorrow = daily[1];
    return (
      <WidgetShell bare accent="indigo" widget={widget}>
        <div className="flex h-full items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className={`flex items-center gap-1.5`}>
              <CloudSun size={12} className="shrink-0 text-[var(--ether-primary)]" />
              <WidgetText variant="label" tone="muted">Outlook</WidgetText>
            </div>
            <div className={`mt-1 truncate text-[10px] font-semibold ${theme.onSurfaceVariant}`}>
              {activeCityName}
            </div>
            <div className={`mt-1 text-3xl font-light tracking-tight ${theme.headline} ${theme.onSurface}`}>
              {tomorrow ? (tempUnit === 'C' ? tomorrow.highC : tomorrow.highF) : '--'}°
            </div>
          </div>
          <span className="text-3xl" role="img" aria-label={tomorrow?.condition || 'Forecast'}>
            {tomorrow ? (CONDITION_EMOJIS[(tomorrow.condition || '').toLowerCase()] ?? '🌤️') : '🌤️'}
          </span>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      bare
      accent="indigo"
      widget={widget}
      bodyClassName="h-full"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-start justify-between gap-3 pr-11 sm:pr-12">
          <div className="min-w-0 flex-1">
            <div className={`flex items-center gap-2`}>
              <CloudSun size={14} className="shrink-0 text-[var(--ether-primary)]" />
              <WidgetText variant="label" tone="muted">Weather Outlook</WidgetText>
            </div>
            <div className={`mt-2 flex min-w-0 items-center gap-2 text-sm ${theme.onSurfaceVariant}`}>
              <MapPin size={12} className="shrink-0" />
              <span className="truncate">{activeCityName}</span>
              <span className={`shrink-0 rounded-full bg-[var(--ether-control-bg)] px-2 py-0.5 text-[10px] font-bold ${theme.onSurface}`}>
                {temperature}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex shrink-0 gap-1.5 overflow-x-auto pb-1">
          <div role="status" aria-live="polite" className="sr-only">
            {dragAnnouncement}
          </div>
          {trackedCities.map((city, index) => {
            const isActive = city.toLowerCase() === activeLookupCity.toLowerCase();
            const rowBindings = getRowBindings(index);
            return (
              <div
                key={city}
                data-dragging={rowBindings.isDragging ? 'true' : undefined}
                className="inline-flex shrink-0 items-center overflow-hidden rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] data-[dragging=true]:border-[var(--ether-primary)]/60 data-[dragging=true]:shadow-md"
              >
                {dragReorderEnabled && onUpdateWidgetConfig && (
                  <DragReorderHandle
                    bindings={rowBindings}
                    ariaLabel={`Reorder ${city}`}
                    compact
                    className="ml-1"
                  />
                )}
                <button
                  type="button"
                  onClick={() => selectCity(city)}
                  aria-label={`Show ${city} outlook`}
                  className={`h-8 px-3 text-[11px] font-bold transition ${
                    isActive
                      ? 'bg-[var(--ether-primary)]/12 text-[var(--ether-on-surface)]'
                      : 'text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]'
                  }`}
                >
                  {city}
                </button>
                {trackedCities.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove ${city}`}
                    onClick={() => handleRemoveCity(city)}
                    className="flex h-8 w-7 items-center justify-center text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-error)]/10 hover:text-[var(--ether-error)]"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {inlineQuickAddEnabled ? (
          <InlineQuickAdd
            placeholder="Add city..."
            parser={parseCityQuickAdd}
            onSubmit={(parsed) => {
              const city = parsed.city;
              const existingCity = trackedCities.find(
                (item) => item.toLowerCase() === city.toLowerCase(),
              );
              const nextCities = existingCity
                ? trackedCities
                : uniqueCities([...trackedCities, city]);
              persistCities(nextCities, existingCity || city);
            }}
            ariaLabel="Add forecast city"
            compact
            className="mt-2 shrink-0"
          />
        ) : (
          <form
            className="mt-2 grid shrink-0 grid-cols-[1fr_auto] gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              handleAddCity();
            }}
          >
            <input
              value={draftCity}
              onChange={(event) => setDraftCity(event.target.value)}
              aria-label="Add forecast city"
              placeholder="Add city..."
              className="h-8 min-w-0 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 text-xs font-semibold text-[var(--ether-on-surface)] outline-none placeholder:text-[var(--ether-on-surface-variant)]/50 focus:border-[var(--ether-primary)]/50"
            />
            <button
              type="submit"
              aria-label="Add tracked forecast city"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--ether-primary)] text-[var(--ether-control-active-text)] transition hover:scale-105 active:scale-95"
            >
              <Plus size={15} strokeWidth={2.5} />
            </button>
          </form>
        )}

        {loading && !resolved ? (
          <WidgetSkeleton variant="stat" />
        ) : daily.length === 0 ? (
          <div className={`flex flex-1 items-center justify-center text-sm font-medium ${theme.onSurfaceVariant}`}>
            No forecast available
          </div>
        ) : (
          <>
            <div className="mt-3 grid shrink-0 grid-cols-3 gap-1.5">
              {[
                { label: trend, icon: <TrendingUp size={12} /> },
                { label: rainRisk, icon: <Umbrella size={12} /> },
                { label: bestDay, icon: <CloudSun size={12} /> },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`flex min-w-0 items-center justify-center gap-1 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-[0.08em] ${theme.onSurfaceVariant}`}
                >
                  <span className="shrink-0 text-[var(--ether-primary)]">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </div>
              ))}
            </div>

            <div className="dashboard-widget-touch-scroll mt-3 min-h-0 flex-1 space-y-1.5 pr-1">
              {daily.map((day, index) => {
                const isToday = index === 0;
                const emoji = getForecastEmoji(day.condition);
                const precip = day.humidity;
                return (
                  <div
                    key={`${day.date}-${index}`}
                    data-testid="forecast-day-card"
                    className={`grid grid-cols-[3.5rem_2rem_minmax(0,1fr)_4.25rem_3rem] items-center gap-2 rounded-xl px-3 py-2 ${
                      isToday ? 'bg-[var(--ether-primary)]/10 font-semibold' : 'bg-[var(--ether-surface-container)]'
                    }`}
                  >
                    <span className={`text-xs ${theme.onSurfaceVariant}`}>
                      {isToday ? 'Today' : day.date}
                    </span>
                    <span className="text-center text-lg" role="img" aria-label={day.condition}>
                      {emoji}
                    </span>
                    <span className={`min-w-0 truncate text-xs capitalize ${theme.muted}`}>
                      {day.condition}
                    </span>
                    <span className={`text-right text-xs tabular-nums ${theme.onSurface}`}>
                      {getDayTemp(day, tempUnit, 'high')}° / {getDayTemp(day, tempUnit, 'low')}°
                    </span>
                    <span className={`text-right text-[10px] font-semibold tabular-nums ${theme.onSurfaceVariant}`}>
                      {precip == null ? '--' : `${precip}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </WidgetShell>
  );
};

export default React.memo(ForecastWidget);
