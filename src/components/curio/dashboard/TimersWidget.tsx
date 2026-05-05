import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useDoubleClickEdit } from '../../../hooks/useDoubleClickEdit';
import { useTimerTick } from '../../../hooks/useTimerTick';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import { CardManagerContext } from '../../../contexts/CardManagerContext';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import type { PersistedTimer } from '../../../services/cardTypes';
import { persistTimers, restoreTimers } from '../../../services/timerPersistence';
import { getPersistedAlarms, setPersistedAlarms, useSettingsStorageValue } from '../../../utils/settingsStorage';
import { randomId } from '../../../utils/randomId';
import { parseTimerQuickAdd } from '../../../services/quickAddParsers/timerParser';
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from '../../../utils/settings/dashboardSettings';
import WidgetShell from './WidgetShell';
import { InlineQuickAdd, WidgetText } from './widgetPrimitives';
import { IconTimer } from './widgetIcons';

const TIMER_PRESETS_MINUTES = [5, 10, 25];
const CUSTOM_MINUTE_OPTIONS = Array.from({ length: 121 }, (_, index) => index);
const CUSTOM_SECOND_OPTIONS = Array.from({ length: 60 }, (_, index) => index);
const DEFAULT_ALARM_TIME = '07:00';
const ALARM_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ALARM_HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const ALARM_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => index);
const ALARM_MERIDIEM_OPTIONS = ['AM', 'PM'] as const;
type AlarmMeridiem = (typeof ALARM_MERIDIEM_OPTIONS)[number];

const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? Math.round(value) : min));

const formatTimerLabel = (totalSeconds: number) => {
  const safeSeconds = Math.max(1, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  const parts = [];
  if (minutes > 0) parts.push(`${minutes} min`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} sec`);
  return `${parts.join(' ')} timer`;
};

const getAlarmParts = (time: string) => {
  const match = ALARM_TIME_PATTERN.exec(time);
  const hours24 = match ? Number(match[1]) : 7;
  const minutes = match ? Number(match[2]) : 0;
  const meridiem: AlarmMeridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hour = hours24 % 12 || 12;
  return { hour, minutes, meridiem };
};

const formatAlarmDisplayTime = (time: string) => {
  const { hour, minutes, meridiem } = getAlarmParts(time);
  return `${hour}:${minutes.toString().padStart(2, '0')} ${meridiem}`;
};

const toAlarmStorageTime = (
  hour: number,
  minutes: number,
  meridiem: AlarmMeridiem,
) => {
  const safeHour = clampNumber(hour, 1, 12);
  const safeMinutes = clampNumber(minutes, 0, 59);
  const hours24 =
    meridiem === 'AM'
      ? safeHour % 12
      : safeHour === 12
        ? 12
        : safeHour + 12;
  return `${hours24.toString().padStart(2, '0')}:${safeMinutes.toString().padStart(2, '0')}`;
};

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return {
      main: `${hours}:${minutes.toString().padStart(2, '0')}`,
      sub: seconds.toString().padStart(2, '0'),
    };
  }
  return {
    main: minutes.toString().padStart(2, '0'),
    sub: seconds.toString().padStart(2, '0'),
  };
};

const TimersWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const subscribeToTick = useTimerTick();
  const cardManager = useContext(CardManagerContext);
  const [now, setNow] = useState(() => Date.now());
  const [customMinutes, setCustomMinutes] = useState(15);
  const [customSeconds, setCustomSeconds] = useState(0);
  const [alarmHour, setAlarmHour] = useState(() => getAlarmParts(DEFAULT_ALARM_TIME).hour);
  const [alarmMinute, setAlarmMinute] = useState(() => getAlarmParts(DEFAULT_ALARM_TIME).minutes);
  const [alarmMeridiem, setAlarmMeridiem] = useState<AlarmMeridiem>(
    () => getAlarmParts(DEFAULT_ALARM_TIME).meridiem,
  );
  const [alarmLabel, setAlarmLabel] = useState('');
  const timers = useSettingsStorageValue<PersistedTimer[]>(restoreTimers, []);
  const persistedAlarms = useSettingsStorageValue(getPersistedAlarms, []);
  const boardInteractivity = useDashboardInteractivitySettings();
  const inlineQuickAddEnabled = effectiveToggle(
    'inlineQuickAddEnabled',
    boardInteractivity,
    widget.config,
  );
  const doubleClickEditEnabled = effectiveToggle(
    'doubleClickEditEnabled',
    boardInteractivity,
    widget.config,
  );
  const [isEditingCustomDuration, setIsEditingCustomDuration] = useState(false);
  const [customDurationDraft, setCustomDurationDraft] = useState('');
  const customDurationInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (isEditingCustomDuration) {
      customDurationInputRef.current?.focus();
      customDurationInputRef.current?.select();
    }
  }, [isEditingCustomDuration]);
  const customDurationLabel = `Duration: ${customMinutes}m ${customSeconds}s`;
  const customDurationDoubleClickHandlers = useDoubleClickEdit({
    enabled: doubleClickEditEnabled,
    onActivate: () => {
      setCustomDurationDraft(
        `${customMinutes}m${customSeconds > 0 ? ` ${customSeconds}s` : ''}`,
      );
      setIsEditingCustomDuration(true);
    },
  });
  const timerView = widget.type === 'alarms' || widget.config.timerView === 'alarms'
    ? 'alarms'
    : 'all';
  const visibleTimers = timerView === 'alarms' ? [] : timers;
  const visibleAlarms = [...persistedAlarms].sort((left, right) => left.time.localeCompare(right.time));
  const visibleCount = timerView === 'alarms' ? visibleAlarms.length : visibleTimers.length;
  const canAddTimers = timerView !== 'alarms';
  const compactLayout =
    size.pixelWidth < 340 ||
    size.pixelHeight < 280 ||
    ((size.w ?? 0) <= 2 && (size.h ?? 0) <= 2);

  React.useEffect(() => {
    if (timerView === 'alarms') return;
    if (visibleTimers.length === 0) return;
    return subscribeToTick((nextNow) => setNow(nextNow));
  }, [subscribeToTick, timerView, visibleTimers.length]);

  const startTimer = useCallback(
    (totalSeconds: number) => {
      const safeSeconds = clampNumber(totalSeconds, 1, 720 * 60);
      const duration = safeSeconds * 1000;
      const targetTime = Date.now() + duration;
      const label = formatTimerLabel(safeSeconds);

      if (cardManager?.enabled) {
        cardManager.emitCardEvent({
          type: 'timer',
          data: {
            label,
            isAlarm: false,
            targetTime,
            duration,
            completionState: 'running',
          },
          persistent: true,
        });
        return;
      }

      persistTimers([
        ...restoreTimers(),
        {
          id: randomId(),
          label,
          isAlarm: false,
          targetTime,
          duration,
          createdAt: Date.now(),
        },
      ]);
    },
    [cardManager],
  );

  const handleCustomSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTimer(customMinutes * 60 + customSeconds);
  };

  const addAlarm = useCallback(() => {
    const time = toAlarmStorageTime(alarmHour, alarmMinute, alarmMeridiem);
    const label = alarmLabel.trim() || `Alarm ${formatAlarmDisplayTime(time)}`;
    setPersistedAlarms([
      ...getPersistedAlarms(),
      {
        id: randomId(),
        label,
        time,
        enabled: true,
        days: [],
      },
    ]);
    setAlarmLabel('');
  }, [alarmHour, alarmLabel, alarmMeridiem, alarmMinute]);

  const handleAlarmSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addAlarm();
  };

  const toggleAlarm = useCallback((alarmId: string) => {
    setPersistedAlarms(
      getPersistedAlarms().map((alarm) =>
        alarm.id === alarmId
          ? { ...alarm, enabled: !alarm.enabled }
          : alarm,
      ),
    );
  }, []);

  const deleteAlarm = useCallback((alarmId: string) => {
    setPersistedAlarms(getPersistedAlarms().filter((alarm) => alarm.id !== alarmId));
  }, []);

  const customTotalSeconds = customMinutes * 60 + customSeconds;
  const selectClass = `w-full appearance-none rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] pl-2 pr-10 text-xs font-semibold text-[var(--ether-on-surface)] outline-none transition focus:border-[var(--ether-primary)]/45 focus:bg-[var(--ether-control-hover)] dark:bg-[var(--ether-surface-container)] dark:text-[var(--ether-on-surface)] [&>option]:bg-[var(--ether-surface-container)] [&>option]:text-[var(--ether-on-surface)] ${compactLayout ? 'py-1' : 'py-1.5'}`;
  const compactSelectClass = `w-full appearance-none rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] pl-2 pr-6 text-xs font-semibold text-[var(--ether-on-surface)] outline-none transition focus:border-[var(--ether-primary)]/45 focus:bg-[var(--ether-control-hover)] dark:bg-[var(--ether-surface-container)] dark:text-[var(--ether-on-surface)] [&>option]:bg-[var(--ether-surface-container)] [&>option]:text-[var(--ether-on-surface)] ${compactLayout ? 'py-1' : 'py-1.5'}`;

  const maxShown = (() => {
    if (size.pixelHeight < 320) return 1;
    if (size.pixelHeight < 460) return 2;
    switch (size.sizeClass) {
      case 'tiny':   return 1;
      case 'small':  return size.isTall ? 3 : 2;
      case 'medium': return size.isTall ? 5 : 3;
      case 'large':  return 6;
      case 'xlarge': return 8;
    }
  })();
  const widgetTitle = compactLayout
    ? timerView === 'alarms'
      ? 'Alarms'
      : 'Timers'
    : timerView === 'alarms'
      ? 'Active Alarms'
      : 'Active Timers';

  // Tiny: show closest-to-finish timer only.
  if (size.sizeClass === 'tiny') {
    if (timerView === 'alarms') {
      const nextAlarm = visibleAlarms.find((alarm) => alarm.enabled) || visibleAlarms[0];
      return (
        <WidgetShell bare widget={widget}>
          <div className="flex flex-1 flex-col items-center justify-center">
            {nextAlarm ? (
              <>
                <span className={`text-2xl font-bold tabular-nums ${theme.onSurface}`}>
                  {formatAlarmDisplayTime(nextAlarm.time)}
                </span>
                <WidgetText variant="label" tone="muted" align="center">
                  {visibleAlarms.length} saved
                </WidgetText>
              </>
            ) : (
              <>
                <IconTimer />
                <WidgetText variant="label" tone="muted" align="center">
                  None
                </WidgetText>
              </>
            )}
          </div>
        </WidgetShell>
      );
    }

    const nextTimer = visibleTimers
      .map((timer) => {
        const remaining = Math.max(0, Number(timer.targetTime || 0) - now);
        return { timer, remaining };
      })
      .sort((a, b) => a.remaining - b.remaining)[0];

    return (
      <WidgetShell bare widget={widget}>
        <div className="flex flex-1 flex-col items-center justify-center">
          {nextTimer ? (
            <>
              <span className={`text-3xl font-bold tabular-nums ${theme.onSurface}`}>
                {formatDuration(nextTimer.remaining).main}
              </span>
              <WidgetText variant="label" tone="muted" align="center">
                {visibleTimers.length} active
              </WidgetText>
            </>
          ) : (
            <>
              <IconTimer />
              <WidgetText variant="label" tone="muted" align="center">
                None
              </WidgetText>
            </>
          )}
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      widget={widget}
      title={widgetTitle}
      icon={<IconTimer />}
      accent="amber"
      padded={false}
      bodyClassName={compactLayout ? 'px-3 pb-3 pt-1' : 'px-4 pb-4 pt-3 sm:px-5 sm:pb-5'}
      rightSlot={
        visibleCount > 0 ? (
          <span className={`text-[10px] font-bold ${theme.muted}`}>
            {visibleCount}
          </span>
        ) : undefined
      }
    >
      <div className={`flex min-h-0 flex-1 flex-col ${compactLayout ? 'gap-1.5' : 'gap-2'}`}>
        {canAddTimers && (
          <div
            data-testid="timer-quick-add"
            className={`shrink-0 rounded-[1.15rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] ${compactLayout ? 'p-1.5' : 'p-2'}`}
          >
            <div className={`grid grid-cols-3 ${compactLayout ? 'gap-1' : 'gap-1.5'}`}>
              {TIMER_PRESETS_MINUTES.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => startTimer(minutes * 60)}
                  className={`rounded-xl bg-[var(--ether-control-hover)] px-2 text-xs font-bold text-[var(--ether-on-surface)] transition hover:bg-[var(--ether-control-active-bg)] hover:text-[var(--ether-control-active-text)] active:scale-95 ${compactLayout ? 'py-1' : 'py-1.5'}`}
                >
                  {minutes}m
                </button>
              ))}
            </div>
            {inlineQuickAddEnabled ? (
              <InlineQuickAdd
                placeholder="Start timer (e.g. 25m)"
                parser={parseTimerQuickAdd}
                onSubmit={(parsed) => {
                  const seconds = Math.max(1, Math.round(parsed.durationMs / 1000));
                  startTimer(seconds);
                }}
                ariaLabel="Quick start timer"
                compact
                className="mt-2"
              />
            ) : null}
            {doubleClickEditEnabled ? (
              <div
                className={`${inlineQuickAddEnabled ? 'mt-1.5' : 'mt-2'}`}
                data-testid="timer-custom-duration-edit"
              >
                {isEditingCustomDuration ? (
                  <input
                    ref={customDurationInputRef}
                    type="text"
                    value={customDurationDraft}
                    aria-label="Edit custom timer duration"
                    onChange={(event) => setCustomDurationDraft(event.target.value)}
                    onBlur={() => setIsEditingCustomDuration(false)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        const parsed = parseTimerQuickAdd(customDurationDraft);
                        if ('parseError' in parsed) {
                          setIsEditingCustomDuration(false);
                          return;
                        }
                        const seconds = Math.max(
                          1,
                          Math.round(parsed.durationMs / 1000),
                        );
                        startTimer(seconds);
                        setIsEditingCustomDuration(false);
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        setIsEditingCustomDuration(false);
                      }
                    }}
                    className="w-full rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-2 py-1 text-xs font-semibold text-[var(--ether-on-surface)] outline-none focus:border-[var(--ether-primary)]/45 focus:bg-[var(--ether-control-hover)]"
                  />
                ) : (
                  <button
                    type="button"
                    onDoubleClick={customDurationDoubleClickHandlers.onDoubleClick}
                    onPointerUp={customDurationDoubleClickHandlers.onPointerUp}
                    className={`w-full rounded-xl px-2 py-1 text-left text-[10px] font-bold uppercase tracking-[0.14em] ${theme.muted} hover:bg-[var(--ether-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ether-primary)]/45`}
                    aria-label={`${customDurationLabel}. Double-click to edit.`}
                  >
                    {customDurationLabel}
                  </button>
                )}
              </div>
            ) : null}
            <form
              onSubmit={handleCustomSubmit}
              data-testid="timer-custom-form"
              className={`flex items-center ${compactLayout ? 'mt-2 gap-1' : 'mt-2.5 gap-1.5'}`}
            >
              <div className="relative min-w-0 flex-1">
                <select
                  value={customMinutes}
                  onChange={(event) =>
                    setCustomMinutes(
                      clampNumber(Number(event.target.value), 0, 120),
                    )
                  }
                  aria-label="Custom timer minutes"
                  className={selectClass}
                >
                  {CUSTOM_MINUTE_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes}
                    </option>
                  ))}
                </select>
                <span className={`pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 ${theme.muted}`}>
                  <WidgetText variant="label" tone="muted">min</WidgetText>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  size={12}
                  className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--ether-on-surface-variant)]"
                />
              </div>
              <div className="relative min-w-0 flex-1">
                <select
                  value={customSeconds}
                  onChange={(event) =>
                    setCustomSeconds(
                      clampNumber(Number(event.target.value), 0, 59),
                    )
                  }
                  aria-label="Custom timer seconds"
                  className={selectClass}
                >
                  {CUSTOM_SECOND_OPTIONS.map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds}
                    </option>
                  ))}
                </select>
                <span className={`pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 ${theme.muted}`}>
                  <WidgetText variant="label" tone="muted">sec</WidgetText>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  size={12}
                  className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--ether-on-surface-variant)]"
                />
              </div>
              <button
                type="submit"
                disabled={customTotalSeconds <= 0}
                className={`rounded-xl bg-[var(--ether-control-active-bg)] text-xs font-bold text-[var(--ether-control-active-text)] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 ${compactLayout ? 'px-2.5 py-1' : 'px-3 py-1.5'}`}
              >
                Start
              </button>
            </form>
          </div>
        )}

        {timerView === 'alarms' && (
          <div
            data-testid="alarm-quick-add"
            className={`shrink-0 rounded-[1.15rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] ${compactLayout ? 'p-1.5' : 'p-2'}`}
          >
            <form onSubmit={handleAlarmSubmit} className={`grid ${compactLayout ? 'gap-1' : 'gap-1.5'}`}>
              <div className={`grid ${compactLayout ? 'grid-cols-[0.78fr_0.92fr_0.82fr] gap-1' : 'grid-cols-[0.8fr_0.9fr_0.85fr] gap-1.5'}`}>
                <div className="relative min-w-0">
                  <select
                    value={alarmHour}
                    onChange={(event) =>
                      setAlarmHour(clampNumber(Number(event.target.value), 1, 12))
                    }
                    aria-label="Alarm hour"
                    className={`${compactSelectClass} tabular-nums`}
                  >
                    {ALARM_HOUR_OPTIONS.map((hour) => (
                      <option key={hour} value={hour}>
                        {hour}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    size={12}
                    className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--ether-on-surface-variant)]"
                  />
                </div>
                <div className="relative min-w-0">
                  <select
                    value={alarmMinute}
                    onChange={(event) =>
                      setAlarmMinute(clampNumber(Number(event.target.value), 0, 59))
                    }
                    aria-label="Alarm minute"
                    className={`${compactSelectClass} tabular-nums`}
                  >
                    {ALARM_MINUTE_OPTIONS.map((minute) => (
                      <option key={minute} value={minute}>
                        {minute.toString().padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    size={12}
                    className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--ether-on-surface-variant)]"
                  />
                </div>
                <div className="relative min-w-0">
                  <select
                    value={alarmMeridiem}
                    onChange={(event) =>
                      setAlarmMeridiem(event.target.value === 'PM' ? 'PM' : 'AM')
                    }
                    aria-label="Alarm AM or PM"
                    className={compactSelectClass}
                  >
                    {ALARM_MERIDIEM_OPTIONS.map((meridiem) => (
                      <option key={meridiem} value={meridiem}>
                        {meridiem}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    size={12}
                    className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--ether-on-surface-variant)]"
                  />
                </div>
              </div>
              <div className={`grid ${compactLayout ? 'grid-cols-[1fr_auto] gap-1' : 'grid-cols-[1fr_auto] gap-1.5'}`}>
                <input
                  type="text"
                  value={alarmLabel}
                  onChange={(event) => setAlarmLabel(event.target.value)}
                  aria-label="Alarm label"
                  placeholder="Label"
                  className={`min-w-0 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-2 text-xs font-semibold text-[var(--ether-on-surface)] outline-none transition placeholder:text-[var(--ether-on-surface-variant)]/55 focus:border-[var(--ether-primary)]/45 focus:bg-[var(--ether-control-hover)] ${compactLayout ? 'py-1' : 'py-1.5'}`}
                />
                <button
                  type="submit"
                  className={`rounded-xl bg-[var(--ether-control-active-bg)] text-xs font-bold text-[var(--ether-control-active-text)] transition active:scale-95 ${compactLayout ? 'px-2.5 py-1' : 'px-3 py-1.5'}`}
                >
                  Add alarm
                </button>
              </div>
            </form>
          </div>
        )}

        {timerView === 'alarms' ? (
          visibleAlarms.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <p className={`text-sm ${theme.muted}`}>No alarms set.</p>
            </div>
          ) : (
            <div
              data-testid="alarm-list"
              className={`dashboard-widget-touch-scroll flex min-h-0 flex-1 flex-col pr-1 ${compactLayout ? 'gap-1' : 'gap-1.5'}`}
            >
              {visibleAlarms.slice(0, maxShown).map((alarm) => (
                <div
                  key={alarm.id}
                  className={`flex min-h-0 items-center justify-between gap-2 rounded-lg ${theme.surfaceContainerLow} ${compactLayout ? 'px-2.5 py-1.5' : 'px-3 py-2'} ${alarm.enabled ? '' : 'opacity-55'}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className={`font-bold tabular-nums ${theme.onSurface} ${compactLayout ? 'text-sm' : 'text-base'}`}>
                      {formatAlarmDisplayTime(alarm.time)}
                    </div>
                    <div className={`truncate text-[10px] font-semibold ${theme.muted}`}>
                      {alarm.label || 'Alarm'}{alarm.days?.length ? ` - ${alarm.days.join(', ')}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleAlarm(alarm.id)}
                    aria-label={alarm.enabled ? `Disable ${alarm.label || alarm.time}` : `Enable ${alarm.label || alarm.time}`}
                    className={`h-7 rounded-full px-2 text-[10px] font-bold transition active:scale-95 ${alarm.enabled ? 'bg-[var(--ether-control-active-bg)] text-[var(--ether-control-active-text)]' : 'bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)]'}`}
                  >
                    {alarm.enabled ? 'On' : 'Off'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteAlarm(alarm.id)}
                    aria-label={`Delete ${alarm.label || alarm.time}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] transition hover:bg-rose-500/15 hover:text-rose-400 active:scale-95"
                  >
                    <X aria-hidden="true" size={14} strokeWidth={2.4} />
                  </button>
                </div>
              ))}
              {visibleAlarms.length > maxShown && (
                <WidgetText variant="label" tone="muted" align="center">
                  +{visibleAlarms.length - maxShown} more
                </WidgetText>
              )}
            </div>
          )
        ) : visibleTimers.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className={`text-sm ${theme.muted}`}>
              No active timers.
            </p>
          </div>
        ) : (
          <div
            data-testid="timer-list"
            className={`dashboard-widget-touch-scroll flex min-h-0 flex-1 flex-col pr-1 ${compactLayout ? 'gap-1' : 'gap-1.5'}`}
          >
            {visibleTimers.slice(0, maxShown).map((timer) => {
              const remaining = Math.max(0, Number(timer.targetTime || 0) - now);
              const { main, sub } = formatDuration(remaining);
              return (
                <div
                  key={timer.id}
                  className={`flex min-h-0 items-center justify-between gap-2 rounded-lg ${theme.surfaceContainerLow} ${compactLayout ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}
                >
                  <span className={`min-w-0 truncate font-medium ${theme.onSurface} ${compactLayout ? 'text-xs' : 'text-sm'}`}>
                    {timer.label || (timer.isAlarm ? 'Alarm' : 'Timer')}
                  </span>
                  <span className={`shrink-0 font-bold tabular-nums tracking-tight ${theme.onSurface} ${compactLayout ? 'text-base' : 'text-lg'}`}>
                    {main}:<span className={theme.onSurfaceVariant}>{sub}</span>
                  </span>
                </div>
              );
            })}
            {visibleTimers.length > maxShown && (
              <WidgetText variant="label" tone="muted" align="center">
                +{visibleTimers.length - maxShown} more
              </WidgetText>
            )}
          </div>
        )}
      </div>
    </WidgetShell>
  );
};

export default TimersWidget;
