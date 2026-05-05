import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useDashboardRefresh } from '../../../hooks/useDashboardRefresh';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import { useHaMcpEnabled, useHaMcpUrl } from '../../../utils/settingsStorage';
import type { DashboardWidget, DashboardWidgetConfig } from '../../../services/dashboardTypes';
import {
  getHaDeviceDisplaySettings,
  shouldShowHaLiveBadge,
  type DashboardHaDeviceIcon,
} from '../../../services/haDeviceDisplay';
import WidgetShell, { type WidgetAccent } from './WidgetShell';
import { WidgetText } from './widgetPrimitives';
import { HaDeviceIcon } from './haDeviceIcons';
import { loadHaStatesCached } from './haWidgetApi';

const ACCENT_BAR: Record<WidgetAccent, string> = {
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  emerald: 'bg-emerald-500',
  rose: 'bg-rose-500',
  amber: 'bg-amber-500',
  indigo: 'bg-indigo-500',
  pink: 'bg-pink-500',
  teal: 'bg-teal-500',
  slate: 'bg-slate-500',
};

interface HaSensorWidgetProps {
  widget: DashboardWidget;
  config?: DashboardWidgetConfig;
}

type SensorKind = 'temperature' | 'humidity' | 'power' | 'motion' | 'co2' | 'light' | 'contact' | 'generic';

interface SensorMeta {
  kind: SensorKind;
  label: string;
  accent: WidgetAccent;
  icon: DashboardHaDeviceIcon;
  maxScale: number;
}

function getSensorMeta(entityId = '', unit = ''): SensorMeta {
  const id = entityId.toLowerCase();
  if (id.includes('temp') || unit === '°C' || unit === '°F')
    return { kind: 'temperature', label: 'Temperature', accent: 'rose', icon: 'thermometer', maxScale: unit === '°F' ? 120 : 50 };
  if (id.includes('humid'))
    return { kind: 'humidity',    label: 'Humidity',    accent: 'sky', icon: 'droplets', maxScale: 100 };
  if (id.includes('power') || unit === 'W' || unit === 'kWh' || unit === 'kW')
    return { kind: 'power',       label: 'Power',       accent: 'amber', icon: 'power', maxScale: unit === 'kWh' ? 30 : unit === 'kW' ? 10 : 3000 };
  if (id.includes('motion') || id.includes('occupan'))
    return { kind: 'motion',      label: 'Motion',      accent: 'violet', icon: 'motion', maxScale: 1 };
  if (id.includes('co2') || id.includes('carbon'))
    return { kind: 'co2',         label: 'CO2',         accent: 'teal', icon: 'fan', maxScale: 2000 };
  if (id.includes('lux') || id.includes('illumin'))
    return { kind: 'light',       label: 'Light',       accent: 'amber', icon: 'sun', maxScale: 1000 };
  if (id.includes('door') || id.includes('window'))
    return { kind: 'contact',     label: 'Contact',     accent: 'indigo', icon: 'door', maxScale: 1 };
  return { kind: 'generic', label: 'Sensor', accent: 'indigo', icon: 'gauge', maxScale: 100 };
}

const HaSensorWidget: React.FC<HaSensorWidgetProps> = ({ widget, config }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const haEnabled = useHaMcpEnabled();
  const haUrl = useHaMcpUrl();
  const cfg = config ?? widget.config;
  const entityId = cfg?.entityIds?.[0]?.toLowerCase();

  const [value, setValue] = useState<string>('--');
  const [unit, setUnit] = useState<string>('');
  const [name, setName] = useState<string>('Sensor');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const mountedRef = useRef(true);

  const meta = getSensorMeta(entityId, unit);
  const display = getHaDeviceDisplaySettings(cfg, {
    fallbackName: name,
    fallbackIcon: meta.icon,
  }, {
    widgetType: widget.type,
    entityId,
  });
  const showLiveBadge = shouldShowHaLiveBadge(cfg);
  const showEntityIds = cfg?.haShowEntityIds === true;
  const displayName = loading && !cfg?.displayName?.trim() ? 'Sensor' : display.displayName;

  const fetchState = useCallback(async () => {
    if (!entityId || !haEnabled || !haUrl || document.visibilityState === 'hidden') return;
    try {
      const states = await loadHaStatesCached(haUrl);
      const d = states.find((state) => state.entity_id.toLowerCase() === entityId);
      if (!d) {
        if (mountedRef.current) {
          setError(true);
          setLoading(false);
        }
        return;
      }
      if (!mountedRef.current) return;
      setValue(d.state);
      setUnit(d.attributes?.unit_of_measurement || '');
      setName(d.attributes?.friendly_name || entityId.split('.')[1] || 'Sensor');
      if (d.last_changed) {
        const diff = Math.round((Date.now() - new Date(d.last_changed).getTime()) / 60_000);
        setLastUpdated(diff < 1 ? 'just now' : `${diff}m ago`);
      }
      setError(false);
    } catch {
      if (mountedRef.current) setError(true);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [entityId, haEnabled, haUrl]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (entityId) {
      setLoading(true);
    }
  }, [entityId]);

  useDashboardRefresh({
    widget,
    enabled: Boolean(entityId && haEnabled && haUrl),
    onRefresh: () => fetchState(),
  });

  if (!entityId || !haEnabled || !haUrl) {
    return (
      <WidgetShell widget={widget} title="Sensor" icon={<HaDeviceIcon icon="thermometer" />} accent="slate">
        <div className="flex flex-1 items-center justify-center">
          <p className={`text-center text-sm ${theme.muted}`}>
            {!entityId ? "Tap settings to pick a sensor." : "Connect HA to read."}
          </p>
        </div>
      </WidgetShell>
    );
  }

  const numericValue = parseFloat(value);
  const isNumeric = !Number.isNaN(numericValue) && unit;
  const barPct = isNumeric
    ? Math.min(100, Math.max(0, (numericValue / meta.maxScale) * 100))
    : 0;

  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare widget={widget}>
        <div className="flex flex-1 flex-col items-center justify-center">
          <HaDeviceIcon icon={display.icon} className={theme.onSurfaceVariant} size={24} />
          <span className={`text-2xl font-bold tabular-nums ${theme.onSurface}`}>
            {loading ? '...' : error ? 'n/a' : value}
          </span>
          {unit && (
            <WidgetText variant="label" tone="muted" align="center">{unit}</WidgetText>
          )}
        </div>
      </WidgetShell>
    );
  }

  const valueSize =
    display.displaySize === 'compact' ? 'text-3xl'
    : display.displaySize === 'large' && value.length <= 4 ? 'text-6xl'
    : value.length > 6 ? 'text-3xl'
    : value.length > 4 ? 'text-4xl'
    : size.sizeClass === 'small' ? 'text-4xl'
    : size.sizeClass === 'large' || size.sizeClass === 'xlarge' ? 'text-6xl'
    : 'text-5xl';

  const showBar = isNumeric && !loading && !error && !size.isCompact;
  const showUpdated = lastUpdated && !loading && !size.isCompact;

  return (
    <WidgetShell
      widget={widget}
      title={displayName}
      icon={<HaDeviceIcon icon={display.icon} />}
      accent={meta.accent}
      rightSlot={
        loading || error || showLiveBadge ? (
          <span
            className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${theme.surfaceContainerLow} ${
              error ? 'text-rose-500' : loading ? theme.muted : 'text-emerald-500'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                error ? 'bg-rose-500' : loading ? 'bg-slate-400' : 'bg-emerald-500 animate-pulse'
              }`}
            />
            {loading ? 'Loading' : error ? 'Offline' : 'Live'}
          </span>
        ) : null
      }
    >
      <div className="flex flex-1 flex-col justify-end gap-1">
        <div className="flex items-baseline gap-1.5">
          <span className={`${valueSize} font-bold tracking-tight tabular-nums ${theme.onSurface}`}>
            {loading ? '...' : error ? 'n/a' : value}
          </span>
          {unit && (
            <span className={`text-lg font-semibold ${theme.onSurfaceVariant}`}>{unit}</span>
          )}
        </div>
        <p className={`truncate text-sm font-semibold ${theme.onSurfaceVariant}`}>
          {showEntityIds ? entityId : meta.label}
        </p>

        {showBar && (
          <div className={`mt-2 h-2 w-full rounded-full overflow-hidden ${theme.surfaceContainerLow} shadow-inner`}>
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_currentColor] ${ACCENT_BAR[meta.accent]}`}
              style={{ width: `${barPct}%` }}
            />
          </div>
        )}

        {showUpdated && (
          <p className={`mt-1 text-[10px] font-medium ${theme.muted}`}>Updated {lastUpdated}</p>
        )}
      </div>
    </WidgetShell>
  );
};

export default HaSensorWidget;
export { HaSensorWidget };
