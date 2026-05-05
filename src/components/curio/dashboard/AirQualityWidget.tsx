import React from 'react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useDashboardRefresh } from '../../../hooks/useDashboardRefresh';
import { useDashboardWeatherData } from '../../../hooks/useDashboardWeatherData';
import { useWidgetAriaAnnouncer } from '../../../hooks/useWidgetAriaAnnouncer';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import {
  appendWidgetSparklineSample,
} from '../../../services/dashboardSparklineStore';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import type { AqiData, WeatherData } from '../../../services/weatherService';
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from '../../../utils/settings/dashboardSettings';
import WidgetShell, { type WidgetAccent } from './WidgetShell';
import {
  WidgetBody,
  WidgetCounter,
  WidgetEmptyState,
  WidgetHero,
  WidgetText,
} from './widgetPrimitives';
import { IconLeaf } from './widgetIcons';

interface AirQualityWidgetProps {
  widget: DashboardWidget;
  weather: WeatherData | null;
  aqi: AqiData | null;
}

type AqiLevel =
  | 'good'
  | 'moderate'
  | 'sensitive'
  | 'unhealthy'
  | 'very-unhealthy'
  | 'hazardous';

interface AqiVisual {
  level: AqiLevel;
  label: string;
  guidance: string;
  accent: WidgetAccent;
}

const AQI_VISUALS: Record<AqiLevel, AqiVisual> = {
  good: {
    level: 'good',
    label: 'Fresh air',
    guidance: 'Air is clean enough for outdoor plans.',
    accent: 'emerald',
  },
  moderate: {
    level: 'moderate',
    label: 'Watch the air',
    guidance: 'Fine for most people, with a light watch for sensitive groups.',
    accent: 'amber',
  },
  sensitive: {
    level: 'sensitive',
    label: 'Sensitive alert',
    guidance: 'Sensitive groups may want easier outdoor activity.',
    accent: 'amber',
  },
  unhealthy: {
    level: 'unhealthy',
    label: 'Poor air',
    guidance: 'Reduce long outdoor activity when possible.',
    accent: 'rose',
  },
  'very-unhealthy': {
    level: 'very-unhealthy',
    label: 'Heavy air',
    guidance: 'Keep outdoor activity short and consider filtration indoors.',
    accent: 'violet',
  },
  hazardous: {
    level: 'hazardous',
    label: 'Stay inside',
    guidance: 'Avoid outdoor activity and close windows if possible.',
    accent: 'rose',
  },
};

const getAqiVisual = (data: AqiData): AqiVisual => {
  const category = data.category.toLowerCase();
  if (data.value > 300 || category.includes('hazard')) return AQI_VISUALS.hazardous;
  if (data.value > 200 || category.includes('very')) return AQI_VISUALS['very-unhealthy'];
  if (data.value > 150 || category.includes('unhealthy')) return AQI_VISUALS.unhealthy;
  if (data.value > 100 || category.includes('sensitive')) return AQI_VISUALS.sensitive;
  if (data.value > 50 || category.includes('moderate')) return AQI_VISUALS.moderate;
  return AQI_VISUALS.good;
};

const getAqiMeterWidth = (value: number) => `${Math.min((value / 300) * 100, 100)}%`;

const AirQualityWidget: React.FC<AirQualityWidgetProps> = ({ widget, weather, aqi }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const { aqi: resolved, loading } = useDashboardWeatherData({
    widgetId: widget.id,
    widgetType: widget.type,
    city: widget.config.city,
    fallbackWeather: weather,
    fallbackAqi: aqi,
    refreshMode: widget.config.refreshMode,
    refreshIntervalMinutes: widget.config.refreshIntervalMinutes,
  });

  const boardInteractivity = useDashboardInteractivitySettings();
  const rollingEnabled = effectiveToggle(
    'rollingNumbersEnabled',
    boardInteractivity,
    widget.config,
  );
  const sparklineHistoryEnabled = boardInteractivity.sparklineHistoryEnabled;
  const sparklineMaxSamples = Number.isFinite(widget.config.sparklineMaxSamples)
    ? Number(widget.config.sparklineMaxSamples)
    : undefined;

  const lastSampledValueRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!sparklineHistoryEnabled) return;
    if (!resolved) return;
    if (!Number.isFinite(resolved.value)) return;
    if (lastSampledValueRef.current === resolved.value) return;
    lastSampledValueRef.current = resolved.value;
    appendWidgetSparklineSample(
      widget.id,
      'aqi',
      { t: Date.now(), v: resolved.value },
      sparklineMaxSamples,
    );
  }, [resolved, sparklineHistoryEnabled, sparklineMaxSamples, widget.id]);

  // Listen for refresh events so we append even when AQI value repeats.
  useDashboardRefresh({
    widget,
    refreshOnMount: false,
    onRefresh: () => {
      if (!sparklineHistoryEnabled) return;
      if (!resolved || !Number.isFinite(resolved.value)) return;
      appendWidgetSparklineSample(
        widget.id,
        'aqi',
        { t: Date.now(), v: resolved.value },
        sparklineMaxSamples,
      );
    },
  });

  useWidgetAriaAnnouncer(
    widget.id,
    resolved ? `Air quality ${resolved.value} ${resolved.category}` : '',
  );

  const visual = resolved ? getAqiVisual(resolved) : null;
  const accent = visual?.accent ?? 'emerald';
  const aqiColor = resolved?.color ?? '#94A3B8';

  // 1x1 / tiny: bare shell, centered number + AQI label. Matches other
  // tiny-sized widgets (Habits, Reminders, etc.).
  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare accent={accent} widget={widget}>
        <div
          data-testid={resolved ? 'air-quality-panel' : undefined}
          data-aqi-level={visual?.level}
          className="flex flex-1 flex-col items-center justify-center"
        >
          <span
            className="text-3xl font-bold tabular-nums tracking-tight"
            style={{ color: aqiColor }}
          >
            {resolved
              ? (rollingEnabled ? (
                  <WidgetCounter
                    value={resolved.value}
                    ariaLabel={`AQI ${resolved.value}`}
                  />
                ) : (
                  resolved.value
                ))
              : '--'}
          </span>
          <WidgetText variant="label" tone="muted" align="center">
            AQI
          </WidgetText>
        </div>
      </WidgetShell>
    );
  }

  if (!resolved) {
    return (
      <WidgetShell
        title="Air Quality"
        icon={<IconLeaf />}
        accent={accent}
        widget={widget}
      >
        <WidgetBody align="center">
          <WidgetEmptyState
            title={loading ? 'Loading' : 'AQI unavailable'}
            variant={loading ? 'loading' : 'empty'}
          />
        </WidgetBody>
      </WidgetShell>
    );
  }

  // Non-tiny: WidgetHero for the number, small stats row for category,
  // optional bar and guidance footer. No orb, no particles, no animated
  // surface - matches the simple design language of Habits, Health, etc.
  const showGuidance = !size.isCompact;
  const showMeter = size.pixelHeight >= 180;

  return (
    <WidgetShell
      title="Air Quality"
      icon={<IconLeaf />}
      accent={accent}
      widget={widget}
    >
      <WidgetBody
        gap="md"
        data-testid="air-quality-panel"
        data-aqi-level={visual?.level}
      >
        <WidgetHero
          size={size}
          value={
            <span style={{ color: aqiColor }}>
              {rollingEnabled ? (
                <WidgetCounter
                  value={resolved.value}
                  ariaLabel={`AQI ${resolved.value}`}
                />
              ) : (
                resolved.value
              )}
            </span>
          }
          label={<span>{visual?.label}</span>}
          caption={
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: aqiColor }}
              />
              <span>{resolved.category}</span>
            </span>
          }
          minRem={1.75}
          maxRem={size.sizeClass === 'xlarge' ? 5.5 : 4}
        />

        {showMeter && (
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: 'var(--ether-control-bg)' }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: getAqiMeterWidth(resolved.value),
                backgroundColor: aqiColor,
              }}
            />
          </div>
        )}

        {showGuidance && visual?.guidance && (
          <p
            className={`line-clamp-2 text-[11px] leading-snug ${theme.muted}`}
          >
            {visual.guidance}
          </p>
        )}
      </WidgetBody>
    </WidgetShell>
  );
};

export default AirQualityWidget;
