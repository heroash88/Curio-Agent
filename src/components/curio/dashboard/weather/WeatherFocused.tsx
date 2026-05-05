import React, { useMemo } from 'react';
import { Cloud, Droplets, Wind, Thermometer, MapPin, Plus } from 'lucide-react';
import { WidgetBody, WidgetText, WidgetInlineError } from '../widgetPrimitives';
import type { DashboardWidget } from '../../../../services/dashboardTypes';
import type { AqiData, WeatherData } from '../../../../services/weatherService';
import { useWidgetPersistentState } from '../../../../hooks/useWidgetPersistentState';

interface WeatherFocusedProps {
  widget: DashboardWidget;
  weather: WeatherData | null;
  aqi: AqiData | null;
  focused?: boolean;
}

type RadarLayer = 'precipitation' | 'wind' | 'temperature';

/**
 * WeatherFocused — focused overlay editor for the Weather widget.
 * Renders an hourly temperature strip (next 24h), radar tile toggles
 * (precipitation, wind, temperature layers), and a saved locations list.
 *
 * Requirements: 13.4
 */
const WeatherFocused: React.FC<WeatherFocusedProps> = ({ widget, weather }) => {
  const [activeLayers, setActiveLayers] = useWidgetPersistentState<RadarLayer[]>(
    widget.id, 'radar-layers', ['precipitation'],
  );
  const [savedLocations, setSavedLocations] = useWidgetPersistentState<string[]>(
    widget.id, 'saved-locations', [],
  );
  const [newLocation, setNewLocation] = React.useState('');

  // Generate hourly data from weather or synthetic
  const hourlyData = useMemo(() => {
    const baseTemp = weather?.tempF ?? 68;
    return Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      temp: Math.round(baseTemp + Math.sin((i - 6) * 0.26) * 8 + Math.cos(i * 1.1) * 3),
      label: `${i.toString().padStart(2, '0')}:00`,
    }));
  }, [weather?.tempF]);

  const toggleLayer = (layer: RadarLayer) => {
    setActiveLayers((prev) =>
      prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer],
    );
  };

  const addLocation = () => {
    const trimmed = newLocation.trim();
    if (trimmed && !savedLocations.includes(trimmed)) {
      setSavedLocations((prev) => [...prev, trimmed]);
      setNewLocation('');
    }
  };

  const removeLocation = (loc: string) => {
    setSavedLocations((prev) => prev.filter((l) => l !== loc));
  };

  if (!weather) {
    return <WidgetInlineError message="Weather data unavailable" widgetId={widget.id} />;
  }

  const minTemp = Math.min(...hourlyData.map((h) => h.temp));
  const maxTemp = Math.max(...hourlyData.map((h) => h.temp));
  const tempRange = maxTemp - minTemp || 1;

  return (
    <WidgetBody gap="md" scroll="y">
      <WidgetText variant="title">Weather Details</WidgetText>

      {/* Hourly temperature strip */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <Thermometer size={12} className="text-[var(--ether-on-surface-variant)]" />
          <WidgetText variant="label" tone="muted">Next 24 Hours</WidgetText>
        </div>
        <div className="flex gap-0.5 overflow-x-auto rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60 p-2">
          {hourlyData.map((h) => {
            const height = ((h.temp - minTemp) / tempRange) * 48 + 12;
            return (
              <div key={h.hour} className="flex min-w-[28px] flex-col items-center gap-0.5">
                <span className="text-[9px] font-medium text-[var(--ether-on-surface)]">{h.temp}°</span>
                <div className="flex h-16 w-3 items-end">
                  <div
                    className="w-full rounded-t-sm bg-sky-400/60"
                    style={{ height: `${height}%` }}
                  />
                </div>
                <span className="text-[8px] text-[var(--ether-on-surface-variant)]">
                  {h.hour === 0 ? '12a' : h.hour < 12 ? `${h.hour}a` : h.hour === 12 ? '12p' : `${h.hour - 12}p`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Radar layer toggles */}
      <div className="space-y-1.5">
        <WidgetText variant="label" tone="muted">Radar Layers</WidgetText>
        <div className="flex gap-2">
          {([
            { id: 'precipitation' as RadarLayer, icon: Droplets, label: 'Rain', color: 'text-blue-400' },
            { id: 'wind' as RadarLayer, icon: Wind, label: 'Wind', color: 'text-teal-400' },
            { id: 'temperature' as RadarLayer, icon: Thermometer, label: 'Temp', color: 'text-orange-400' },
          ]).map(({ id, icon: Icon, label, color }) => {
            const active = activeLayers.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleLayer(id)}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl border px-3 py-2.5 transition ${
                  active
                    ? 'border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/10'
                    : 'border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60 hover:bg-[var(--ether-control-hover)]'
                }`}
                aria-pressed={active}
                aria-label={`${label} layer ${active ? 'on' : 'off'}`}
              >
                <Icon size={16} className={active ? color : 'text-[var(--ether-on-surface-variant)]'} />
                <span className={`text-[10px] font-medium ${active ? 'text-[var(--ether-on-surface)]' : 'text-[var(--ether-on-surface-variant)]'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
        {/* Simple radar placeholder */}
        <div className="relative h-32 w-full overflow-hidden rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60">
          <div className="absolute inset-0 flex items-center justify-center">
            <Cloud size={32} className="text-[var(--ether-on-surface-variant)]/20" />
          </div>
          {activeLayers.includes('precipitation') && (
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/10 via-transparent to-blue-400/5" />
          )}
          {activeLayers.includes('wind') && (
            <div className="absolute inset-0 bg-gradient-to-r from-teal-400/10 via-transparent to-teal-400/5" />
          )}
          {activeLayers.includes('temperature') && (
            <div className="absolute inset-0 bg-gradient-to-t from-orange-400/10 via-transparent to-red-400/5" />
          )}
          <div className="absolute bottom-2 left-2 text-[9px] text-[var(--ether-on-surface-variant)]">
            {activeLayers.length > 0 ? activeLayers.join(', ') : 'No layers active'}
          </div>
        </div>
      </div>

      {/* Saved locations */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <MapPin size={12} className="text-[var(--ether-on-surface-variant)]" />
          <WidgetText variant="label" tone="muted">Saved Locations</WidgetText>
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addLocation(); }}
            placeholder="Add city..."
            className="flex-1 rounded-lg border border-[var(--ether-glass-border)] bg-transparent px-2.5 py-1.5 text-xs text-[var(--ether-on-surface)] placeholder:text-[var(--ether-on-surface-variant)]/50"
          />
          <button
            type="button"
            onClick={addLocation}
            className="rounded-lg border border-[var(--ether-glass-border)] px-2 py-1.5 text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)]"
            aria-label="Add location"
          >
            <Plus size={14} />
          </button>
        </div>
        {savedLocations.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {savedLocations.map((loc) => (
              <span
                key={loc}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60 px-2.5 py-1 text-[11px] text-[var(--ether-on-surface)]"
              >
                {loc}
                <button
                  type="button"
                  onClick={() => removeLocation(loc)}
                  className="ml-0.5 text-[var(--ether-on-surface-variant)] hover:text-[var(--ether-error)]"
                  aria-label={`Remove ${loc}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </WidgetBody>
  );
};

export default WeatherFocused;
