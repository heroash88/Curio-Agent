import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import type {
  DashboardWidgetConfig,
  DashboardWidgetType,
} from '../../../services/dashboardTypes';

/**
 * `WidgetInteractivityOverrides`
 *
 * Per-widget interactivity overrides rendered inside the Widget
 * Settings sheet. Each row is a tri-state control:
 *
 *   - "Auto"  -> `undefined` (inherit the board-level setting)
 *   - "On"    -> `true`
 *   - "Off"   -> `false`
 *
 * Presence (not value) is what `effectiveToggle` checks when deciding
 * whether to use the widget value instead of the board value
 * (Requirement 30.6). Persisting `undefined` therefore means "defer
 * to the board" — exactly what Auto should do.
 *
 * The section is collapsible; most users do not need to touch these
 * keys and we do not want to dominate the sheet for widgets that have
 * many other settings.
 *
 * Widget-specific wins (NowPlaying seek sync, Pomodoro breathing ring,
 * WorldClock offset preview, ImageGallery pinch zoom, RichNote TTS
 * highlight, value morph) are only shown for widget types that
 * actually use them.
 */

type TriStateValue = boolean | undefined;

type OverrideKey =
  | 'ambientPulseEnabled'
  | 'freshnessDotEnabled'
  | 'swipeGesturesEnabled'
  | 'dragReorderEnabled'
  | 'rollingNumbersEnabled'
  | 'widgetPinningEnabled'
  | 'seekBarLiveSyncEnabled'
  | 'breathingRingEnabled'
  | 'valueMorphEnabled'
  | 'clockOffsetPreviewEnabled'
  | 'pinchZoomEnabled'
  | 'ttsWordHighlightEnabled';

interface OverrideRowConfig {
  key: OverrideKey;
  label: string;
  description: string;
}

const BOARD_LEVEL_OVERRIDES: ReadonlyArray<OverrideRowConfig> = [
  {
    key: 'ambientPulseEnabled',
    label: 'Ambient pulse',
    description: 'Pulse this widget when its data updates.',
  },
  {
    key: 'freshnessDotEnabled',
    label: 'Freshness dot',
    description: 'Show the freshness dot in refresh metadata.',
  },
  {
    key: 'swipeGesturesEnabled',
    label: 'Swipe gestures',
    description: 'Swipe rows to complete or snooze.',
  },
  {
    key: 'dragReorderEnabled',
    label: 'Drag to reorder',
    description: 'Pointer/keyboard reorder inside this widget.',
  },
  {
    key: 'rollingNumbersEnabled',
    label: 'Rolling numbers',
    description: 'Animate numeric transitions.',
  },
  {
    key: 'widgetPinningEnabled',
    label: 'Pinning',
    description: 'Pin items to the top of the widget.',
  },
];

/**
 * Map of widget-specific wins to the widget types that actually use
 * them. Anything outside this map skips the row entirely.
 */
const WIDGET_SPECIFIC_OVERRIDES: ReadonlyArray<{
  row: OverrideRowConfig;
  appliesTo: ReadonlySet<DashboardWidgetType>;
}> = [
  {
    row: {
      key: 'seekBarLiveSyncEnabled',
      label: 'Live seek bar',
      description: 'Keep the seek bar in sync with live playback.',
    },
    appliesTo: new Set<DashboardWidgetType>(['music']),
  },
  {
    row: {
      key: 'breathingRingEnabled',
      label: 'Breathing ring',
      description: 'Soft breathing ring during focus sessions.',
    },
    appliesTo: new Set<DashboardWidgetType>(['pomodoro']),
  },
  {
    row: {
      key: 'valueMorphEnabled',
      label: 'Value morph',
      description: 'Morph numeric values instead of snapping.',
    },
    appliesTo: new Set<DashboardWidgetType>([
      'air_quality',
      'stock',
      'portfolio',
      'health',
      'ha_energy',
    ]),
  },
  {
    row: {
      key: 'clockOffsetPreviewEnabled',
      label: 'Clock offset preview',
      description: 'Preview time zone offsets by dragging.',
    },
    appliesTo: new Set<DashboardWidgetType>(['world_clock']),
  },
  {
    row: {
      key: 'pinchZoomEnabled',
      label: 'Pinch to zoom',
      description: 'Pinch gestures zoom the focused photo.',
    },
    appliesTo: new Set<DashboardWidgetType>(['image_gallery']),
  },
  {
    row: {
      key: 'ttsWordHighlightEnabled',
      label: 'TTS word highlight',
      description: 'Highlight the current word while reading.',
    },
    appliesTo: new Set<DashboardWidgetType>(['rich_note']),
  },
];

const triStateButtonClass = (active: boolean) =>
  `flex-1 min-w-0 rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition ${
    active
      ? 'bg-[var(--ether-control-active-bg)] text-[var(--ether-control-active-text)] shadow-sm'
      : 'bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]'
  }`;

const resolveValue = (value: unknown): TriStateValue =>
  typeof value === 'boolean' ? value : undefined;

const TriStateRow: React.FC<{
  row: OverrideRowConfig;
  value: TriStateValue;
  onChange: (next: TriStateValue) => void;
}> = ({ row, value, onChange }) => {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 items-center py-1.5">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-[var(--ether-on-surface)]">
          {row.label}
        </div>
        <div className="text-[10px] leading-4 text-[var(--ether-on-surface-variant)]">
          {row.description}
        </div>
      </div>
      <div
        role="radiogroup"
        aria-label={`${row.label} override`}
        className="flex w-[180px] gap-1"
      >
        <button
          type="button"
          role="radio"
          aria-checked={value === undefined}
          onClick={() => onChange(undefined)}
          className={triStateButtonClass(value === undefined)}
        >
          Auto
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === true}
          onClick={() => onChange(true)}
          className={triStateButtonClass(value === true)}
        >
          On
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === false}
          onClick={() => onChange(false)}
          className={triStateButtonClass(value === false)}
        >
          Off
        </button>
      </div>
    </div>
  );
};

interface WidgetInteractivityOverridesProps {
  widgetType: DashboardWidgetType;
  config: DashboardWidgetConfig;
  onConfigChange: (
    updater: (config: DashboardWidgetConfig) => DashboardWidgetConfig,
  ) => void;
  defaultOpen?: boolean;
}

const WidgetInteractivityOverrides: React.FC<
  WidgetInteractivityOverridesProps
> = ({ widgetType, config, onConfigChange, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);

  const applyOverride = (key: OverrideKey, next: TriStateValue) => {
    onConfigChange((current) => {
      const updated = { ...current };
      if (next === undefined) {
        delete updated[key];
      } else {
        updated[key] = next;
      }
      return updated;
    });
  };

  const widgetSpecificRows = WIDGET_SPECIFIC_OVERRIDES.filter((entry) =>
    entry.appliesTo.has(widgetType),
  ).map((entry) => entry.row);

  return (
    <div
      className="rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)]"
      data-testid="widget-interactivity-overrides"
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition hover:bg-[var(--ether-control-hover)]"
      >
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
            Interactivity
          </div>
          <div className="text-[10px] leading-4 text-[var(--ether-on-surface-variant)]">
            Per-widget overrides. Auto inherits the board setting.
          </div>
        </div>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-[var(--ether-on-surface-variant)] transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div className="divide-y divide-[var(--ether-glass-border)]/60 px-4 pb-3">
          {BOARD_LEVEL_OVERRIDES.map((row) => (
            <TriStateRow
              key={row.key}
              row={row}
              value={resolveValue(config[row.key])}
              onChange={(next) => applyOverride(row.key, next)}
            />
          ))}
          {widgetSpecificRows.length > 0 && (
            <div className="pt-2">
              <div className="pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
                Widget-specific
              </div>
              {widgetSpecificRows.map((row) => (
                <TriStateRow
                  key={row.key}
                  row={row}
                  value={resolveValue(config[row.key])}
                  onChange={(next) => applyOverride(row.key, next)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WidgetInteractivityOverrides;
