import React from 'react';

import SettingsToggle from '../SettingsToggle';
import {
  setDashboardInteractivitySettings,
  useDashboardInteractivitySettings,
} from '../../../utils/settingsStorage';
import type {
  DashboardAnimationIntensity,
  DashboardInteractivitySettings as DashboardInteractivitySettingsType,
} from '../../../services/dashboardTypes';

/**
 * Dashboard "Interactivity" sub-section rendered inside
 * `DashboardSection.tsx`. Exposes:
 *
 *   - Segmented control for `animationIntensity` (off | subtle | full).
 *   - One toggle row per boolean `InteractivitySetting` key, covering
 *     every toggle listed in Requirement 30.1.
 *
 * Each control dispatches `setDashboardInteractivitySettings({ key })`
 * so the change flows through `dashboardSettings` and fires both
 * `storage` and `curio:settings-changed` events (Requirement 30.2,
 * 30.3).
 */

type InteractivityBooleanKey = Exclude<
  keyof DashboardInteractivitySettingsType,
  'animationIntensity'
>;

interface ToggleConfig {
  key: InteractivityBooleanKey;
  label: string;
  description: string;
}

const INTERACTIVITY_TOGGLES: ReadonlyArray<ToggleConfig> = [
  {
    key: 'ambientPulseEnabled',
    label: 'Ambient pulse',
    description: 'Soft ring pulse on widgets when their data updates.',
  },
  {
    key: 'freshnessDotEnabled',
    label: 'Freshness dot',
    description: 'Shows fresh / idle / stale / error state near refresh metadata.',
  },
  {
    key: 'staleRevalidateSheenEnabled',
    label: 'Stale revalidate sheen',
    description: 'Top-edge gradient while a widget refreshes in the background.',
  },
  {
    key: 'swipeGesturesEnabled',
    label: 'Swipe gestures',
    description: 'Swipe list rows to complete, snooze, or archive.',
  },
  {
    key: 'doubleClickEditEnabled',
    label: 'Double-click edit',
    description: 'Double-click numeric values to edit them in place.',
  },
  {
    key: 'dragReorderEnabled',
    label: 'Drag to reorder',
    description: 'Pointer and keyboard reorder for list-shaped widgets.',
  },
  {
    key: 'commandPaletteEnabled',
    label: 'Command palette',
    description: 'Open the dashboard palette with Cmd/Ctrl + K.',
  },
  {
    key: 'dropIntentsEnabled',
    label: 'Cross-widget drops',
    description: 'Drop items between widgets (Bookmarks -> Notes, Task -> Pomodoro, ...).',
  },
  {
    key: 'hoverSelectionBusEnabled',
    label: 'Hover + selection bus',
    description: 'Hovering an item highlights related items on Calendar, Mail, and Tasks.',
  },
  {
    key: 'undoToastsEnabled',
    label: 'Undo toasts',
    description: 'Confirm destructive actions with an Undo toast in the corner.',
  },
  {
    key: 'widgetPinningEnabled',
    label: 'Widget pinning',
    description: 'Pin items to the top of Mail, News, YouTube, and HA Entities.',
  },
  {
    key: 'relativeTimeHintsEnabled',
    label: 'Relative time hints',
    description: 'Show "12s ago" style labels in refresh metadata.',
  },
  {
    key: 'rollingNumbersEnabled',
    label: 'Rolling numbers',
    description: 'Animate numeric changes on Stocks, Health, Habits, and Insights.',
  },
  {
    key: 'inlineQuickAddEnabled',
    label: 'Inline quick-add',
    description: 'Quick-add rows (tasks, reminders, timers, symbols) inside widgets.',
  },
  {
    key: 'optimisticActionsEnabled',
    label: 'Optimistic actions',
    description: 'Apply local changes immediately and roll back on failure.',
  },
  {
    key: 'insightsActionsEnabled',
    label: 'Insights actions',
    description: 'Tap Insights rows to jump to or prune widgets.',
  },
  {
    key: 'ariaLiveUpdatesEnabled',
    label: 'Screen reader updates',
    description: 'Announce coalesced widget updates via aria-live.',
  },
  {
    key: 'sparklineHistoryEnabled',
    label: 'Sparkline history',
    description: 'Keep a small trend buffer for Stocks, AQI, Energy, and Weather.',
  },
];

const ANIMATION_OPTIONS: ReadonlyArray<{
  value: DashboardAnimationIntensity;
  label: string;
  description: string;
}> = [
  { value: 'off', label: 'Off', description: 'No motion' },
  { value: 'subtle', label: 'Subtle', description: '<=200ms only' },
  { value: 'full', label: 'Full', description: 'All animations' },
];

const segmentedButtonClass = (active: boolean) =>
  `flex-1 min-w-0 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] transition ${
    active
      ? 'bg-slate-900 text-white shadow-sm'
      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
  }`;

const DashboardInteractivitySettings: React.FC = () => {
  const interactivity = useDashboardInteractivitySettings();

  const handleToggle = (key: InteractivityBooleanKey) => {
    setDashboardInteractivitySettings({ [key]: !interactivity[key] });
  };

  const handleIntensity = (value: DashboardAnimationIntensity) => {
    if (value === interactivity.animationIntensity) return;
    setDashboardInteractivitySettings({ animationIntensity: value });
  };

  return (
    <div className="space-y-4" data-testid="dashboard-interactivity-settings">
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Animation intensity
          </span>
          <a
            href="/docs/dashboard.md#interactivity"
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 hover:text-slate-600"
            target="_blank"
            rel="noreferrer"
          >
            Help
          </a>
        </div>
        <div
          role="radiogroup"
          aria-label="Animation intensity"
          className="flex gap-2"
        >
          {ANIMATION_OPTIONS.map((option) => {
            const active = interactivity.animationIntensity === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${option.label} (${option.description})`}
                onClick={() => handleIntensity(option.value)}
                className={segmentedButtonClass(active)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] leading-4 text-slate-500">
          {ANIMATION_OPTIONS.find(
            (option) => option.value === interactivity.animationIntensity,
          )?.description}
        </p>
      </div>

      <div className="grid gap-1.5">
        {INTERACTIVITY_TOGGLES.map((toggle) => (
          <SettingsToggle
            key={toggle.key}
            label={toggle.label}
            description={toggle.description}
            enabled={Boolean(interactivity[toggle.key])}
            onToggle={() => handleToggle(toggle.key)}
          />
        ))}
      </div>
    </div>
  );
};

export default DashboardInteractivitySettings;
