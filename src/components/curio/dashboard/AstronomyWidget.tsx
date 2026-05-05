import React, { useEffect, useMemo, useState } from 'react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useDashboardWeatherData } from '../../../hooks/useDashboardWeatherData';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import type { AqiData, WeatherData } from '../../../services/weatherService';
import WidgetShell from './WidgetShell';
import { WidgetText } from './widgetPrimitives';
import { IconSun } from './widgetIcons';

interface AstronomyWidgetProps {
  widget: DashboardWidget;
  weather: WeatherData | null;
  aqi: AqiData | null;
}

interface MoonPhase {
  name: string;
  className: string;
  illumination: number;
}

interface SunTimes {
  sunrise: string;
  sunset: string;
  daylight: string;
  progress: number;
  state: 'before' | 'day' | 'after';
}

const SYNODIC_MONTH = 29.53059;
const KNOWN_NEW_MOON = new Date('2000-01-06T18:14:00Z').getTime();

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const moonPhaseSlug = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

function getMoonPhase(): MoonPhase {
  const daysSince = (Date.now() - KNOWN_NEW_MOON) / 86_400_000;
  const phase = ((daysSince % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
  const normalized = phase / SYNODIC_MONTH;
  const illumination = Math.round(((1 - Math.cos(normalized * Math.PI * 2)) / 2) * 100);

  if (normalized < 0.0625) return { name: 'New Moon', className: 'new-moon', illumination };
  if (normalized < 0.1875) return { name: 'Waxing Crescent', className: 'waxing-crescent', illumination };
  if (normalized < 0.3125) return { name: 'First Quarter', className: 'first-quarter', illumination };
  if (normalized < 0.4375) return { name: 'Waxing Gibbous', className: 'waxing-gibbous', illumination };
  if (normalized < 0.5625) return { name: 'Full Moon', className: 'full-moon', illumination };
  if (normalized < 0.6875) return { name: 'Waning Gibbous', className: 'waning-gibbous', illumination };
  if (normalized < 0.8125) return { name: 'Last Quarter', className: 'last-quarter', illumination };
  if (normalized < 0.9375) return { name: 'Waning Crescent', className: 'waning-crescent', illumination };
  return { name: 'New Moon', className: 'new-moon', illumination };
}

const formatSolarHour = (h: number) => {
  const totalMinutes = Math.round(h * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

function estimateSunTimes(lat: number): SunTimes {
  const now = new Date();
  const dayOfYear = Math.ceil(
    (now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86_400_000,
  );
  const declination = 23.45 * Math.sin(((360 / 365) * (dayOfYear - 81)) * (Math.PI / 180));
  const latRad = lat * (Math.PI / 180);
  const decRad = declination * (Math.PI / 180);
  const cosHourAngle = Math.max(-1, Math.min(1, -Math.tan(latRad) * Math.tan(decRad)));
  const hourAngle = Math.acos(cosHourAngle) * (180 / Math.PI);
  const sunriseHour = 12 - hourAngle / 15;
  const sunsetHour = 12 + hourAngle / 15;
  const daylightHours = sunsetHour - sunriseHour;
  const daylightMinutes = Math.round(daylightHours * 60);
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const progress = clamp((nowHour - sunriseHour) / daylightHours);

  return {
    sunrise: formatSolarHour(sunriseHour),
    sunset: formatSolarHour(sunsetHour),
    daylight: `${Math.floor(daylightMinutes / 60)}h ${daylightMinutes % 60}m`,
    progress,
    state: nowHour < sunriseHour ? 'before' : nowHour > sunsetHour ? 'after' : 'day',
  };
}

const AstronomyMetric: React.FC<{
  label: string;
  value: string;
  tone?: 'sunrise' | 'sunset' | 'daylight' | 'moon';
}> = ({ label, value, tone = 'daylight' }) => (
  <div className={`astronomy-metric astronomy-metric-${tone}`}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const MoonVisual: React.FC<{ moon: MoonPhase; compact?: boolean }> = ({ moon, compact = false }) => (
  <div className={`astronomy-moon-wrap ${compact ? 'astronomy-moon-wrap-compact' : ''}`}>
    <div
      data-testid="astronomy-moon"
      data-moon-phase={moonPhaseSlug(moon.name)}
      className={`astronomy-moon astronomy-moon-${moon.className}`}
      aria-label={`${moon.name} moon, ${moon.illumination}% illuminated`}
      role="img"
    >
      <span className="astronomy-moon-surface" aria-hidden>
        <span className="astronomy-moon-mare astronomy-moon-mare-a" />
        <span className="astronomy-moon-mare astronomy-moon-mare-b" />
        <span className="astronomy-moon-mare astronomy-moon-mare-c" />
        <span className="astronomy-moon-crater astronomy-moon-crater-a" />
        <span className="astronomy-moon-crater astronomy-moon-crater-b" />
        <span className="astronomy-moon-crater astronomy-moon-crater-c" />
      </span>
    </div>
  </div>
);

const AstronomyWidget: React.FC<AstronomyWidgetProps> = ({ widget, weather, aqi }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const { weather: resolved, loading } = useDashboardWeatherData({
    widgetId: widget.id,
    widgetType: widget.type,
    city: widget.config.city,
    fallbackWeather: weather,
    fallbackAqi: aqi,
    refreshMode: widget.config.refreshMode,
    refreshIntervalMinutes: widget.config.refreshIntervalMinutes,
  });
  const [moon, setMoon] = useState(getMoonPhase);

  useEffect(() => {
    const id = window.setInterval(() => setMoon(getMoonPhase()), 3_600_000);
    return () => window.clearInterval(id);
  }, []);

  const sunTimes = useMemo(() => {
    const lat = resolved?.latitude;
    return lat != null ? estimateSunTimes(lat) : null;
  }, [resolved?.latitude]);

  const isCompact = size.isCompact || size.pixelHeight < 300;
  const isMini = size.w <= 2 && size.h <= 2;
  const sunProgress = sunTimes?.progress ?? 0.5;
  const sunX = 9 + sunProgress * 76;
  const sunY = 18 + Math.sin(sunProgress * Math.PI) * 51;
  const statusLabel = sunTimes
    ? sunTimes.state === 'day'
      ? 'Sun above horizon'
      : sunTimes.state === 'before'
        ? 'Before sunrise'
        : 'After sunset'
    : 'Location needed';

  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare accent="violet" widget={widget} glowEnabled>
        <div className="dashboard-astronomy-widget dashboard-astronomy-tiny flex flex-1 items-center justify-center overflow-hidden rounded-[inherit]">
          <MoonVisual moon={moon} compact />
          <span className={`sr-only ${theme.muted}`}>{moon.name}</span>
        </div>
      </WidgetShell>
    );
  }

  const renderMiniPanel = () => (
    <div
      data-testid="astronomy-panel"
      className="dashboard-astronomy-widget dashboard-astronomy-compact dashboard-astronomy-mini flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl"
      style={{
        '--sun-progress': sunProgress,
        '--sun-x': `${sunX}%`,
        '--sun-y': `${sunY}%`,
        '--sun-glow-y': `${100 - sunY}%`,
      } as React.CSSProperties}
    >
      <div className="astronomy-mini-top">
        <div
          data-testid="astronomy-sun-scene"
          className={`astronomy-sun-scene astronomy-mini-sun astronomy-sun-${sunTimes?.state ?? 'day'}`}
        >
          <div className="astronomy-star-field" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="astronomy-sun-horizon" aria-hidden="true" />
          <div
            data-testid="astronomy-sun-orb"
            className="astronomy-sun-orb"
            aria-label="Animated sun position"
            role="img"
          >
            <span className="weather-motion-sun astronomy-weather-sun-core" aria-hidden />
          </div>
          <div className="astronomy-mini-status">
            <span>{statusLabel}</span>
            <strong>{sunTimes?.sunrise ?? '--:--'}</strong>
          </div>
        </div>

        <div className="astronomy-mini-moon">
          <MoonVisual moon={moon} compact />
          <span>Moon</span>
          <strong>{moon.name}</strong>
        </div>
      </div>

      {sunTimes && (
        <div
          data-testid="astronomy-daylight-meter"
          className="astronomy-daylight-meter astronomy-mini-daylight-meter"
          aria-label={`${sunTimes.daylight} daylight`}
        >
          <span />
        </div>
      )}

      <div className="astronomy-mini-facts">
        <AstronomyMetric label="Rise" value={sunTimes?.sunrise ?? '--'} tone="sunrise" />
        <AstronomyMetric label="Set" value={sunTimes?.sunset ?? '--'} tone="sunset" />
        <AstronomyMetric label="Light" value={sunTimes?.daylight ?? '--'} tone="daylight" />
        <AstronomyMetric label="Phase" value={moon.name} tone="moon" />
      </div>
    </div>
  );

  return (
    <WidgetShell
      title="Astronomy"
      icon={<IconSun />}
      accent="violet"
      widget={widget}
      glowEnabled
      bodyClassName="overflow-hidden"
    >
      {loading && !resolved ? (
        <div className="flex flex-1 items-center justify-center">
          <p className={`text-sm ${theme.muted}`}>Loading...</p>
        </div>
      ) : isMini ? (
        renderMiniPanel()
      ) : (
        <div
          data-testid="astronomy-panel"
          className={`dashboard-astronomy-widget ${isCompact ? 'dashboard-astronomy-compact' : 'dashboard-astronomy-roomy'} flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl`}
          style={{
            '--sun-progress': sunProgress,
            '--sun-x': `${sunX}%`,
            '--sun-y': `${sunY}%`,
            '--sun-glow-y': `${100 - sunY}%`,
          } as React.CSSProperties}
        >
          <div className="astronomy-hero-grid min-h-0 flex-1">
            <div
              data-testid="astronomy-sun-scene"
              className={`astronomy-sun-scene astronomy-sun-${sunTimes?.state ?? 'day'}`}
            >
              <div className="astronomy-star-field" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="astronomy-sun-horizon" aria-hidden="true" />
              <div className="astronomy-sun-arc" aria-hidden="true" />
              <div
                data-testid="astronomy-sun-orb"
                className="astronomy-sun-orb"
                aria-label="Animated sun position"
                role="img"
              >
                <span className="weather-motion-sun astronomy-weather-sun-core" aria-hidden />
              </div>
              <div className="astronomy-sky-label">
                <span>{statusLabel}</span>
                <strong>{resolved?.city || 'Local sky'}</strong>
              </div>
            </div>

            <div className="astronomy-moon-card">
              <MoonVisual moon={moon} compact={isCompact} />
              <div className="min-w-0">
                <WidgetText variant="label" tone="muted">
                  Moon
                </WidgetText>
                <div className={`truncate text-sm font-bold ${theme.onSurface}`}>
                  {moon.name}
                </div>
                {!isCompact && (
                  <div className={`mt-0.5 text-[10px] font-semibold ${theme.onSurfaceVariant}`}>
                    {moon.illumination}% lit
                  </div>
                )}
              </div>
            </div>
          </div>

          {sunTimes ? (
            <>
              <div
                data-testid="astronomy-daylight-meter"
                className="astronomy-daylight-meter"
                aria-label={`${sunTimes.daylight} daylight`}
              >
                <span />
              </div>
              <div className="astronomy-metric-grid">
                <AstronomyMetric label="Sunrise" value={sunTimes.sunrise} tone="sunrise" />
                <AstronomyMetric label="Sunset" value={sunTimes.sunset} tone="sunset" />
                <AstronomyMetric label="Daylight" value={sunTimes.daylight} tone="daylight" />
                <AstronomyMetric label="Moon" value={moon.name} tone="moon" />
              </div>
            </>
          ) : (
            <div className="astronomy-metric-grid">
              <AstronomyMetric label="Location" value="Needed" />
              <AstronomyMetric label="Moon" value={moon.name} tone="moon" />
            </div>
          )}
        </div>
      )}
    </WidgetShell>
  );
};

export default AstronomyWidget;
