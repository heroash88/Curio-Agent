import React from 'react';
import {
  Droplets,
  Leaf,
  ThermometerSun,
  Wind as WindIcon,
  Sun,
} from 'lucide-react';
import { useDashboardWeatherData } from '../../../hooks/useDashboardWeatherData';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import {
  getDashboardRefreshPolicy,
  isLiveDashboardWidget,
} from '../../../services/dashboardRefresh';
import {
  appendWidgetSparklineSample,
} from '../../../services/dashboardSparklineStore';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import type { AqiData, WeatherData } from '../../../services/weatherService';
import { useTempUnit } from '../../../utils/settingsStorage';
import { useDashboardInteractivitySettings } from '../../../utils/settings/dashboardSettings';
import WidgetShell from './WidgetShell';
import { WidgetBody, WidgetSkeleton, WidgetText } from './widgetPrimitives';

const WeatherFocusedLazy = React.lazy(() => import('./weather/WeatherFocused'));

interface WeatherDashWidgetProps {
  widget: DashboardWidget;
  weather: WeatherData | null;
  aqi: AqiData | null;
  focused?: boolean;
}

export const CONDITION_EMOJIS: Record<string, string> = {
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
  'heavy snow': '❄️',
  'snow grains': '🌨️',
  'snow showers': '🌨️',
  'heavy snow showers': '❄️',
  storm: '⛈️',
  thunderstorm: '⛈️',
  'thunderstorm w/ hail': '⛈️',
  'severe thunderstorm': '⛈️',
  fog: '🌫️',
  foggy: '🌫️',
  mist: '🌫️',
  'rime fog': '🌫️',
  'partly cloudy': '⛅',
  'mostly clear': '🌤️',
  'freezing drizzle': '🌧️',
  'heavy freezing drizzle': '🌧️',
  'freezing rain': '🌧️',
  'heavy freezing rain': '🌧️',
};

const formatTemp = (value: number | null | undefined) =>
  Number.isFinite(value) ? `${Math.round(value as number)}°` : '--';

type WeatherMotionKind = 'clear' | 'partly' | 'cloud' | 'rain' | 'storm' | 'snow' | 'fog';

const RAIN_STREAKS = Array.from({ length: 12 }, (_, index) => index);

const getWeatherMotionKind = (description: string): WeatherMotionKind => {
  const value = description.toLowerCase();
  if (value.includes('storm') || value.includes('thunder')) return 'storm';
  if (value.includes('snow')) return 'snow';
  if (value.includes('rain') || value.includes('drizzle') || value.includes('shower')) return 'rain';
  if (value.includes('fog') || value.includes('mist')) return 'fog';
  if (value.includes('partly') || value.includes('mostly clear')) return 'partly';
  if (value.includes('cloud') || value.includes('overcast')) return 'cloud';
  return 'clear';
};

const WeatherMotionModel: React.FC<{
  kind: WeatherMotionKind;
  label: string;
}> = ({ kind, label }) => {
  const showSun = kind === 'clear' || kind === 'partly';
  const showCloud = kind !== 'clear';
  // For partly-cloudy, offset sun up-left so cloud overlaps bottom-right.
  const sunCx = kind === 'partly' ? 28 : 32;
  const sunCy = kind === 'partly' ? 22 : 32;
  const sunR = kind === 'partly' ? 11 : 14;

  return (
    <div
      className={`weather-motion-model weather-motion-${kind}`}
      data-testid="weather-motion-model"
      role="img"
      aria-label={label || 'Weather condition'}
    >
      <svg
        className="weather-motion-svg"
        viewBox="0 0 64 64"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <radialGradient id="wm-sun-grad" cx="35%" cy="32%" r="60%">
            <stop offset="0%" stopColor="#fff7b0" />
            <stop offset="55%" stopColor="#ffd84f" />
            <stop offset="100%" stopColor="#f59e0b" />
          </radialGradient>
          <linearGradient id="wm-cloud-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#d1dbe6" />
          </linearGradient>
          <linearGradient id="wm-cloud-back-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8eef5" />
            <stop offset="100%" stopColor="#b8c5d4" />
          </linearGradient>
        </defs>

        {showSun && (
          <g className="weather-motion-svg-sun" aria-hidden="true">
            <circle cx={sunCx} cy={sunCy} r={sunR + 4} fill="rgba(250, 204, 21, 0.24)" />
            <circle cx={sunCx} cy={sunCy} r={sunR} fill="url(#wm-sun-grad)" />
            <circle cx={sunCx - 3} cy={sunCy - 3} r={sunR * 0.35} fill="rgba(255, 243, 199, 0.55)" />
          </g>
        )}

        {(kind === 'cloud' || kind === 'rain' || kind === 'storm' || kind === 'snow') && (
          <g className="weather-motion-svg-cloud-back" aria-hidden="true">
            <path
              d="M14 40h26c3.6 0 6.4-2.5 6.4-5.7 0-3-2.5-5.4-5.7-5.7-1.6-4.3-5.4-7.3-9.8-7.3-4.2 0-7.8 2.7-9.2 6.5h-.7c-4.2 0-7.5 2.7-7.5 6s3.2 6.2 6.5 6.2Z"
              fill="url(#wm-cloud-back-grad)"
              opacity="0.55"
              transform="translate(-4 4) scale(0.88)"
            />
          </g>
        )}

        {showCloud && (
          <g className="weather-motion-svg-cloud" aria-hidden="true">
            <ellipse cx="32" cy="47" rx="20" ry="3.5" fill="rgba(15, 23, 42, 0.15)" />
            <path
              d="M16 44h30c4.2 0 7.4-2.7 7.4-6.2 0-3.3-2.8-6-6.4-6.2-1.7-4.6-6-7.8-10.9-7.8-4.7 0-8.7 3-10.2 7.2h-.8c-4.6 0-8.2 2.9-8.2 6.5S11.4 44 16 44Z"
              fill="url(#wm-cloud-grad)"
              stroke="rgba(148, 163, 184, 0.3)"
              strokeWidth="0.6"
            />
            <path
              d="M19 31.5c1.7-3.6 5.4-6 9.9-6 4.7 0 8.7 3 10.1 7"
              fill="none"
              stroke="rgba(255, 255, 255, 0.8)"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
          </g>
        )}

        {kind === 'rain' && (
          <g className="weather-motion-svg-rain" aria-hidden="true">
            {[22, 32, 42].map((x, i) => (
              <line
                key={i}
                x1={x}
                y1="47"
                x2={x - 2}
                y2="56"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeLinecap="round"
                style={{ animationDelay: `${i * 0.18}s` }}
              />
            ))}
          </g>
        )}

        {kind === 'storm' && (
          <path
            className="weather-motion-svg-bolt"
            d="M33 46 27 58l10-8.5h-5.2l5.2-10-10.3 8.5h6.3Z"
            fill="#facc15"
            stroke="#f59e0b"
            strokeWidth="0.6"
            aria-hidden="true"
          />
        )}

        {kind === 'snow' && (
          <g className="weather-motion-svg-snow" aria-hidden="true">
            {[22, 32, 42].map((x, i) => (
              <circle
                key={i}
                cx={x}
                cy="51"
                r="1.8"
                fill="#f1f5f9"
                style={{ animationDelay: `${i * 0.4}s` }}
              />
            ))}
          </g>
        )}

        {kind === 'fog' && (
          <g className="weather-motion-svg-fog" aria-hidden="true">
            <line x1="12" y1="50" x2="52" y2="50" stroke="rgba(148, 163, 184, 0.75)" strokeWidth="2.2" strokeLinecap="round" />
            <line x1="18" y1="55" x2="46" y2="55" stroke="rgba(148, 163, 184, 0.6)" strokeWidth="2.2" strokeLinecap="round" />
          </g>
        )}
      </svg>
    </div>
  );
};

const ForecastWeatherIcon: React.FC<{
  kind: WeatherMotionKind;
  label: string;
}> = ({ kind, label }) => {
  const showSun = kind === 'clear' || kind === 'partly';
  const showCloud = kind !== 'clear';

  return (
    <svg
      className={`weather-forecast-icon weather-forecast-icon-${kind}`}
      data-testid="weather-forecast-icon"
      viewBox="0 0 48 48"
      role="img"
      aria-label={label || 'Weather condition'}
      focusable="false"
    >
      {showSun && (
        <g className="weather-forecast-icon-sun" aria-hidden="true">
          <circle className="weather-forecast-icon-sun-glow" cx={kind === 'partly' ? 30 : 24} cy={kind === 'partly' ? 19 : 24} r="15" />
          <circle className="weather-forecast-icon-sun-core" cx={kind === 'partly' ? 30 : 24} cy={kind === 'partly' ? 19 : 24} r="10" />
        </g>
      )}
      {showCloud && (
        <g className="weather-forecast-icon-cloud" aria-hidden="true">
          <ellipse className="weather-forecast-icon-cloud-shadow" cx="24" cy="34" rx="16" ry="5" />
          <path
            className="weather-forecast-icon-cloud-base"
            d="M14.6 34.8h21.2c4.1 0 7.2-2.8 7.2-6.4 0-3.4-2.8-6.1-6.4-6.4C35.1 17.5 30.9 14 25.9 14c-4.8 0-8.8 3.1-10.3 7.4h-.8c-4.7 0-8.4 3-8.4 6.8 0 3.7 3.6 6.6 8.2 6.6Z"
          />
          <path
            className="weather-forecast-icon-cloud-highlight"
            d="M16.2 22.4c1.6-3.6 5.2-6.1 9.5-6.1 4.5 0 8.4 2.9 9.8 6.9"
          />
        </g>
      )}
      {kind === 'rain' && (
        <g className="weather-forecast-icon-rain" aria-hidden="true">
          <path d="M17 38.5l-2.1 4.1" />
          <path d="M24 38.5l-2.1 4.1" />
          <path d="M31 38.5l-2.1 4.1" />
        </g>
      )}
      {kind === 'storm' && (
        <path
          className="weather-forecast-icon-bolt"
          d="M25.8 34.5 20.6 45l8-7.2h-4.2l4.1-8.2-8.2 7.1h4.6Z"
          aria-hidden="true"
        />
      )}
      {kind === 'snow' && (
        <g className="weather-forecast-icon-snow" aria-hidden="true">
          <circle cx="17" cy="40" r="1.7" />
          <circle cx="24" cy="42" r="1.7" />
          <circle cx="31" cy="40" r="1.7" />
        </g>
      )}
      {kind === 'fog' && (
        <g className="weather-forecast-icon-fog" aria-hidden="true">
          <path d="M12 38h24" />
          <path d="M16 42h18" />
        </g>
      )}
    </svg>
  );
};

const WeatherDashWidget: React.FC<WeatherDashWidgetProps> = ({ widget, weather, aqi, focused = false }) => {
  if (focused) {
    return (
      <React.Suspense fallback={<WidgetSkeleton variant="chart" />}>
        <WeatherFocusedLazy widget={widget} weather={weather} aqi={aqi} focused />
      </React.Suspense>
    );
  }

  return <WeatherDashWidgetCompact widget={widget} weather={weather} aqi={aqi} />;
};

const WeatherDashWidgetCompact: React.FC<Omit<WeatherDashWidgetProps, 'focused'>> = ({ widget, weather, aqi }) => {
  const focused = false; // compact view is never focused
  const size = useWidgetSize(widget);
  const unit = useTempUnit();
  const { weather: resolved, aqi: resolvedAqi } = useDashboardWeatherData({
    widgetId: widget.id,
    widgetType: widget.type,
    city: widget.config.city,
    fallbackWeather: weather,
    fallbackAqi: aqi,
    refreshMode: widget.config.refreshMode,
    refreshIntervalMinutes: widget.config.refreshIntervalMinutes,
  });

  const boardInteractivity = useDashboardInteractivitySettings();
  const sparklineHistoryEnabled = boardInteractivity.sparklineHistoryEnabled;
  const sparklineMaxSamples = Number.isFinite(widget.config.sparklineMaxSamples)
    ? Number(widget.config.sparklineMaxSamples)
    : undefined;
  const tempForSample = resolved
    ? (unit === 'C' ? resolved.tempC : resolved.tempF)
    : null;
  const lastTempSampleRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!sparklineHistoryEnabled) return;
    if (tempForSample == null) return;
    if (!Number.isFinite(tempForSample)) return;
    if (lastTempSampleRef.current === tempForSample) return;
    lastTempSampleRef.current = tempForSample;
    appendWidgetSparklineSample(
      widget.id,
      'temp',
      { t: Date.now(), v: tempForSample },
      sparklineMaxSamples,
    );
  }, [tempForSample, sparklineHistoryEnabled, sparklineMaxSamples, widget.id]);
  const refreshPolicy = getDashboardRefreshPolicy(widget.type, widget.config);
  const refreshLabel = widget.config.showRefreshMetadata && isLiveDashboardWidget(widget.type)
    ? refreshPolicy.mode === 'timed'
      ? `Every ${refreshPolicy.intervalMinutes}m`
      : refreshPolicy.label
    : null;
  const crampedSurface = size.pixelWidth < 300 || size.pixelHeight < 240 || size.sizeClass === 'small';
  const wideSurface = size.pixelWidth >= 560 && size.pixelHeight >= 320;
  const tallSurface = !wideSurface && size.pixelWidth >= 340 && size.pixelHeight >= 390;
  const surfaceClassNames = [
    'card-glass',
    'dashboard-weather-card',
    `dashboard-weather-card-${size.sizeClass}`,
    wideSurface ? 'dashboard-weather-card-wide' : null,
    tallSurface ? 'dashboard-weather-card-tall' : null,
    crampedSurface ? 'dashboard-weather-card-cramped' : null,
    focused ? 'dashboard-weather-card-focused' : null,
    'weather-card-glass',
    'weather-card-unified-glass',
    'group',
    'relative',
    'isolate',
    'flex',
    'h-full',
    'min-h-0',
    'w-full',
    'min-w-0',
    'flex-col',
    'overflow-hidden',
  ].filter(Boolean);

  const renderSurface = (children: React.ReactNode, ariaLabel: string, conditionClassName?: string) => (
    <WidgetShell widget={widget} bare padded={false} accent="sky">
      <WidgetBody gap="none">
        <div
          className={`${surfaceClassNames.join(' ')} p-4 sm:p-5 ${conditionClassName || ''}`}
          data-testid="weather-dashboard-card"
          aria-label={ariaLabel}
        >
          {(conditionClassName?.includes('weather-card-condition-rain') || conditionClassName?.includes('weather-card-condition-storm')) && (
            <div className="weather-card-rain-layer" data-testid="weather-card-rain-layer" aria-hidden>
              {RAIN_STREAKS.map((streak) => (
                <span key={streak} />
              ))}
            </div>
          )}
          {children}
          {refreshLabel && (
            <div className="pointer-events-none absolute bottom-3 right-3 z-20 rounded-full border border-white/30 bg-white/35 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-700 shadow-sm backdrop-blur-md dark:bg-black/20 dark:text-white/70">
              {refreshLabel}
            </div>
          )}
        </div>
      </WidgetBody>
    </WidgetShell>
  );

  const motionKind = getWeatherMotionKind(resolved?.desc || '');
  const conditionClassName = `weather-card-condition-${motionKind}`;
  const minuteCastBars = React.useMemo(() => {
    const wetBias = motionKind === 'rain' || motionKind === 'storm' ? 0.72 : motionKind === 'cloud' ? 0.34 : 0.18;
    const humidityBias = Math.max(0, Math.min(0.42, (Number(resolved?.humidity || 0) / 100) * 0.42));
    return Array.from({ length: 32 }, (_, index) => {
      const wave = Math.sin(index * 0.78 + (resolved?.windSpeedMph || 0) * 0.12) * 0.22;
      const taper = index > 20 ? (32 - index) / 12 : index < 4 ? (index + 2) / 6 : 1;
      return Math.max(0.12, Math.min(1, (wetBias + humidityBias + wave) * taper));
    });
  }, [motionKind, resolved?.humidity, resolved?.windSpeedMph]);

  if (!resolved) {
    return renderSurface(
      <div className={`flex flex-1 items-center justify-center text-sm font-semibold text-[var(--ether-on-surface-variant)]`}>
        Syncing weather
      </div>,
      'Syncing weather',
    );
  }

  const temp = unit === 'C' ? resolved.tempC : resolved.tempF;
  const feelsLike = unit === 'C' ? resolved.feelsLikeC : resolved.feelsLikeF;
  const high = resolved.daily?.[0] ? (unit === 'C' ? resolved.daily[0].highC : resolved.daily[0].highF) : null;
  const low = resolved.daily?.[0] ? (unit === 'C' ? resolved.daily[0].lowC : resolved.daily[0].lowF) : null;
  const daily = resolved.daily ?? [];
  const city = resolved.city || widget.config.city || 'Local weather';
  const compact = size.sizeClass === 'small' || size.sizeClass === 'tiny';
  const veryCramped = size.pixelWidth < 200 || size.pixelHeight < 160;
  
  const compactSummaryOnly = size.isCompact || size.pixelHeight < 240;
  const narrowCompactSummary = compactSummaryOnly && size.pixelWidth < 260;
  const showPrimaryIcon = !veryCramped && size.pixelWidth >= (narrowCompactSummary ? 210 : 250) && size.pixelHeight >= 185;
  const iconSlotSizeClass = compact
    ? narrowCompactSummary
      ? 'h-16 w-16'
      : 'h-20 w-20'
    : tallSurface
      ? 'h-24 w-24'
      : 'h-28 w-28';
  const iconColumnClass = narrowCompactSummary
    ? 'grid-cols-[minmax(0,1fr)_4rem]'
    : 'grid-cols-[minmax(0,1fr)_clamp(4.75rem,24%,7rem)]';
  const statsAsSidecar = wideSurface;
  const showStats = !compactSummaryOnly && !veryCramped && size.pixelWidth >= 200 && size.pixelHeight >= 175;
  const showCompactMetrics = compactSummaryOnly && !veryCramped && (resolved.humidity != null || resolvedAqi);
  const heightUsedByCurrent = showPrimaryIcon ? (compact ? 96 : tallSurface ? 112 : 120) : 84;
  const heightUsedByStats = showStats && !statsAsSidecar ? (resolvedAqi ? 82 : 58) : 0;
  
  const showMinuteCast = !tallSurface && !veryCramped && size.pixelWidth >= 340 && size.pixelHeight >= (heightUsedByCurrent + heightUsedByStats + 120);
  const heightUsedByMinuteCast = showMinuteCast ? 70 : 0;
  const allowForecast = focused || !compactSummaryOnly;
  
  const showForecast = daily.length > 0 && allowForecast && (focused ? size.pixelHeight >= 225 : size.pixelHeight >= (heightUsedByCurrent + heightUsedByStats + heightUsedByMinuteCast + 118));
  
  const showTodayText = !showForecast && daily[0] && size.pixelHeight >= (heightUsedByCurrent + heightUsedByStats + heightUsedByMinuteCast + 20);

  const forecastCount = focused ? 5 : size.pixelWidth >= 520 ? 5 : size.pixelWidth >= 360 ? 4 : 3;
  const forecastDays = daily.slice(0, forecastCount);
  if (size.sizeClass === 'tiny') {
    return renderSurface(
      <div className="flex h-full items-center justify-between gap-3">
        <WeatherMotionModel kind={motionKind} label={resolved.desc} />
        <div className="min-w-0 text-right">
          <div className="flex items-start justify-end">
            <div className={`font-light tabular-nums leading-none tracking-tight text-[var(--ether-on-surface)] text-3xl`}>
              {formatTemp(temp).replace('°', '')}
            </div>
            <div className={`font-light text-[var(--ether-on-surface)] text-sm`}>
              °{unit}
            </div>
          </div>
          <div className={`weather-card-description truncate text-[11px] font-medium text-[var(--ether-on-surface-variant)] mt-1`}>
            {resolved.desc}
          </div>
        </div>
      </div>,
      `${city} weather, ${resolved.desc}`,
      conditionClassName,
    );
  }

  return renderSurface(
    <div className="flex h-full w-full flex-col justify-between min-h-0">
      <div className={`flex items-start justify-between shrink-0`}>
        <div>
          <div className="flex items-center gap-2">
            <Sun className="text-amber-500 dark:text-amber-400" size={18} />
            <WidgetText as="span" variant="title" className="text-sm text-[var(--ether-on-surface)]">
              Weather
            </WidgetText>
          </div>
          <WidgetText
            as="div"
            variant="caption"
            tone="muted"
            className="weather-card-city mt-1 text-[11px] font-medium text-[var(--ether-on-surface-variant)]"
          >
            {city}
          </WidgetText>
        </div>
      </div>

      <div className={`weather-current-region mt-2 flex flex-1 min-h-0 ${statsAsSidecar ? 'items-center justify-between gap-4' : 'flex-col items-start justify-start'}`}>
        <div
          data-testid="weather-current-hero"
          className={`weather-current-hero grid min-w-0 items-start gap-3 ${statsAsSidecar ? 'flex-1' : 'w-full'} ${showPrimaryIcon ? iconColumnClass : 'grid-cols-1'}`}
        >
          <div className="flex min-w-0 flex-col self-start">
            <div className="weather-card-temp flex items-start">
              <span className="weather-card-temp sr-only">{formatTemp(temp)}{unit}</span>
              <div className={`font-light tabular-nums leading-none tracking-tight text-[var(--ether-on-surface)] ${compact ? 'text-5xl' : 'text-7xl min-[400px]:text-[80px]'}`}>
                {formatTemp(temp).replace('°', '')}
              </div>
              <div className={`font-light text-[var(--ether-on-surface)] ${compact ? 'text-2xl mt-1' : 'text-3xl mt-2 min-[400px]:text-4xl'}`}>
                °{unit}
              </div>
            </div>
            <div className="weather-card-description text-base text-[var(--ether-on-surface-variant)] mt-2 font-medium capitalize">
              {resolved.desc}
            </div>
          </div>

          {showPrimaryIcon && (
            <div
              data-testid="weather-primary-icon-slot"
              className={`weather-primary-icon-slot relative shrink-0 justify-self-end self-start ${iconSlotSizeClass}`}
            >
              <WeatherMotionModel kind={motionKind} label={resolved.desc} />
            </div>
          )}
        </div>

        {showStats && (
          <div className={`text-[13px] text-[var(--ether-on-surface-variant)] shrink-0 ${statsAsSidecar ? 'flex w-full max-w-[160px] flex-col gap-2.5' : 'mt-3 grid w-full grid-cols-2 gap-x-3 gap-y-2'}`}>
            {feelsLike != null && (
              <div className="flex min-w-0 items-center gap-1.5">
                <ThermometerSun size={13} className="dashboard-weather-detail-icon shrink-0 text-orange-500 dark:text-orange-400" />
                <span className="weather-card-detail-label min-w-0 flex-1 truncate">Feels like</span>
                <span className="weather-card-detail-value shrink-0 font-semibold tabular-nums text-[var(--ether-on-surface)]">{formatTemp(feelsLike).replace('°', '')}°</span>
              </div>
            )}
            {resolved.humidity != null && (
              <div className="flex min-w-0 items-center gap-1.5">
                <Droplets size={13} className="dashboard-weather-detail-icon shrink-0 text-blue-500 dark:text-blue-400" />
                <span className="weather-card-detail-label min-w-0 flex-1 truncate">Humidity</span>
                <span className="weather-card-detail-value shrink-0 font-semibold tabular-nums text-[var(--ether-on-surface)]">{resolved.humidity}%</span>
              </div>
            )}
            {resolved.windSpeedMph != null && (
              <div className="flex min-w-0 items-center gap-1.5">
                <WindIcon size={13} className="dashboard-weather-detail-icon shrink-0 text-teal-500 dark:text-teal-400" />
                <span className="weather-card-detail-label min-w-0 flex-1 truncate">Wind</span>
                <span className="weather-card-detail-value shrink-0 font-semibold tabular-nums text-[var(--ether-on-surface)]">{Math.round(resolved.windSpeedMph)} mph</span>
              </div>
            )}
            {resolvedAqi && (
              <div className={`flex min-w-0 items-center gap-1.5 ${statsAsSidecar ? '' : 'col-span-2'}`}>
                <Leaf size={13} className="dashboard-weather-detail-icon shrink-0 text-emerald-500 dark:text-emerald-400" />
                <span className="weather-card-detail-label min-w-0 flex-1 truncate">Air</span>
                <span className="weather-card-detail-value shrink-0 rounded-[4px] border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-bold tabular-nums tracking-wide text-[10px] text-emerald-600 dark:text-emerald-400">
                  AQI {resolvedAqi.value}
                  {resolvedAqi.category && <span className="sr-only"> {resolvedAqi.category}</span>}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {showCompactMetrics && (
        <div className="mt-1.5 flex w-full shrink-0 items-center gap-2 overflow-hidden text-[10px] font-bold text-[var(--ether-on-surface-variant)]">
          {resolved.humidity != null && (
            <div className="flex min-w-0 flex-1 items-center justify-between gap-1.5 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/35 px-2 py-1">
              <span className="flex min-w-0 items-center gap-1 truncate">
                <Droplets size={11} className="shrink-0 text-blue-500 dark:text-blue-400" />
                Humidity
              </span>
              <span className="weather-card-detail-value shrink-0 tabular-nums text-[var(--ether-on-surface)]">{resolved.humidity}%</span>
            </div>
          )}
          {resolvedAqi && (
            <div className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300">
              <Leaf size={11} className="shrink-0" />
              <span className="weather-card-detail-value tabular-nums">AQI {resolvedAqi.value}</span>
            </div>
          )}
        </div>
      )}

      {showMinuteCast && (
        <div className="mt-4 flex flex-col gap-2 border-t border-[var(--ether-glass-border)] pt-4 shrink-0" data-testid="weather-minute-strip">
          <div className="text-xs font-medium text-[var(--ether-on-surface-variant)]">
            {motionKind === 'rain' || motionKind === 'storm' ? 'Rain for the next 60 min' : 'Precipitation next 60 min'}
          </div>
          <div className="h-8 flex items-end gap-[3px]">
            {minuteCastBars.map((height, index) => (
              <div 
                key={index} 
                className="flex-1 bg-cyan-500 dark:bg-cyan-400/80 rounded-t-[1px]"
                style={{ height: `${Math.max(10, height * 100)}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[11px] font-medium text-[var(--ether-on-surface-variant)] mt-1">
            <span>Now</span>
            <span>15m</span>
            <span>30m</span>
            <span>45m</span>
            <span>60m</span>
          </div>
        </div>
      )}

      {showForecast && (
        <div
          className="mt-4 flex min-h-0 shrink-0 items-stretch gap-2 overflow-hidden justify-between"
          data-testid="weather-forecast-strip"
        >
          {forecastDays.map((day, index) => {
            const forecastMotionKind = getWeatherMotionKind(day.condition || day.icon || '');
            const dayHigh = unit === 'C' ? day.highC : day.highF;
            const dayLow = unit === 'C' ? day.lowC : day.lowF;

            return (
              <div key={`${day.date}-${index}`} className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl bg-black/5 dark:bg-white/[0.03] border border-[var(--ether-glass-border)] py-3 text-center">
                <div className={`weather-card-forecast-label text-xs font-semibold ${index === 0 ? 'text-[var(--ether-on-surface)]' : 'text-[var(--ether-on-surface-variant)]'}`}>
                  {index === 0 ? 'Today' : day.date}
                </div>
                <div className="weather-forecast-icon-frame my-1 shrink-0">
                  <ForecastWeatherIcon
                    kind={forecastMotionKind}
                    label={day.condition || day.icon || 'weather'}
                  />
                </div>
                <div className="flex items-baseline justify-center gap-1.5 whitespace-nowrap tabular-nums">
                  <span className="weather-card-forecast-high text-[13px] font-bold text-[var(--ether-on-surface)]">{formatTemp(dayHigh)}</span>
                  <span className="weather-card-forecast-low text-[11px] font-semibold text-[var(--ether-on-surface-variant)]">{formatTemp(dayLow)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showTodayText && (
        <div className={`weather-card-today-summary mt-1 line-clamp-1 shrink-0 text-xs font-semibold text-[var(--ether-on-surface-variant)]`}>
          Today: {formatTemp(high)} high, {formatTemp(low)} low
        </div>
      )}
    </div>,
    `${city} weather, ${resolved.desc}`,
    conditionClassName,
  );
};

export default React.memo(WeatherDashWidget);
