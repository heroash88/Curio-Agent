import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Timer, Play, Pause, RotateCcw, Coffee, Brain, X } from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import {
  useDashboardDropTarget,
  useDropIntentTarget,
} from '../../../hooks/useDashboardIntents';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import { getChores, getTasks } from '../../../services/chorePersistence';
import { dashboardToastBus } from '../../../services/dashboardToastBus';
import type {
  DashboardWidget,
  DashboardWidgetConfig,
} from '../../../services/dashboardTypes';
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from '../../../utils/settings/dashboardSettings';
import WidgetShell from './WidgetShell';
import { WidgetText } from './widgetPrimitives';

interface PomodoroWidgetProps {
  widget: DashboardWidget;
  onUpdateWidgetConfig?: (widgetId: string, patch: Partial<DashboardWidgetConfig>) => void;
}

const PomodoroWidget: React.FC<PomodoroWidgetProps> = ({ widget, onUpdateWidgetConfig }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'work' | 'short' | 'long'>('work');

  const workMins = Math.max(1, Number(widget.config?.workMins || 25));
  const breakMins = Math.max(1, Number(widget.config?.breakMins || 5));

  const boardInteractivity = useDashboardInteractivitySettings();
  const dropIntentsEnabled = effectiveToggle(
    'dropIntentsEnabled',
    boardInteractivity,
    widget.config,
  );
  const handlePomodoroDrop = useCallback(
    (payload: { payload: Record<string, unknown> }) => {
      const taskId = payload.payload.taskId;
      const title = payload.payload.title;
      const dueDateTime = payload.payload.dueDateTime;
      if (typeof taskId !== 'string' || !taskId) return;
      onUpdateWidgetConfig?.(widget.id, { linkedTaskId: taskId });

      // If the dropped item has a dueDateTime, calculate remaining
      // minutes until that time and use it as the timer duration.
      if (typeof dueDateTime === 'string' && dueDateTime) {
        const dueMs = Date.parse(dueDateTime);
        if (Number.isFinite(dueMs)) {
          const remainingMs = dueMs - Date.now();
          const remainingMins = Math.max(1, Math.round(remainingMs / 60000));
          if (remainingMs > 0 && remainingMins <= 480) {
            // Set a custom countdown to the due time
            setTimeLeft(remainingMins * 60);
            setMode('work');
            setIsActive(true);
            dashboardToastBus.show({
              id: `pomodoro-linked-task-${widget.id}`,
              label: `Countdown: ${remainingMins} min for "${typeof title === 'string' && title ? title : 'task'}"`,
            });
            return;
          }
        }
      }

      setIsActive(true);
      dashboardToastBus.show({
        id: `pomodoro-linked-task-${widget.id}`,
        label: `Focusing on ${typeof title === 'string' && title ? title : 'task'}`,
      });
    },
    [onUpdateWidgetConfig, widget.id],
  );
  useDropIntentTarget(widget.id, handlePomodoroDrop, {
    enabled: dropIntentsEnabled,
  });
  const dropBindings = useDashboardDropTarget({
    widgetId: widget.id,
    widgetType: widget.type,
    enabled: dropIntentsEnabled,
  });

  // Resolve the linked task title against the task + chore stores
  // (Requirement 11.2). If the task has been deleted, clear the
  // dangling id so the widget stops showing a stale label.
  const linkedTaskId = widget.config.linkedTaskId;
  const linkedTaskTitle = useMemo(() => {
    if (!linkedTaskId) return null;
    const allTasks = [...getTasks(), ...getChores()];
    const match = allTasks.find((task) => task.id === linkedTaskId);
    return match ? match.name : null;
  }, [linkedTaskId]);
  useEffect(() => {
    if (linkedTaskId && linkedTaskTitle === null) {
      onUpdateWidgetConfig?.(widget.id, { linkedTaskId: undefined });
    }
  }, [linkedTaskId, linkedTaskTitle, onUpdateWidgetConfig, widget.id]);
  const [isEditingWorkMins, setIsEditingWorkMins] = useState(false);
  const [workMinsDraft, setWorkMinsDraft] = useState<string>(String(workMins));
  const workMinsInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (isEditingWorkMins) {
      workMinsInputRef.current?.focus();
      workMinsInputRef.current?.select();
    }
  }, [isEditingWorkMins]);
  const commitWorkMins = () => {
    const parsed = Number(workMinsDraft);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setIsEditingWorkMins(false);
      return;
    }
    const next = Math.max(1, Math.round(parsed));
    if (next !== workMins) {
      onUpdateWidgetConfig?.(widget.id, { workMins: next });
    }
    setIsEditingWorkMins(false);
  };
  const MODES = useMemo(() => ({
    work: {
      label: 'Focus',
      title: 'Work',
      shortTitle: 'Work',
      time: workMins * 60,
      color: 'var(--ether-rose)',
      tintDark: 'rgba(244,63,94,0.18)',
      tintLight: 'rgba(244,63,94,0.12)',
      shadow: 'rgba(244,63,94,0.28)',
    },
    short: {
      label: 'Short Break',
      title: 'Short',
      shortTitle: 'Short',
      time: breakMins * 60,
      color: 'var(--ether-teal)',
      tintDark: 'rgba(20,184,166,0.18)',
      tintLight: 'rgba(20,184,166,0.12)',
      shadow: 'rgba(20,184,166,0.28)',
    },
    long: {
      label: 'Long Break',
      title: 'Long',
      shortTitle: 'Long',
      time: Math.max(breakMins * 3, 10) * 60,
      color: 'var(--ether-indigo)',
      tintDark: 'rgba(99,102,241,0.18)',
      tintLight: 'rgba(99,102,241,0.12)',
      shadow: 'rgba(99,102,241,0.28)',
    },
  }), [breakMins, workMins]);

  useEffect(() => {
    if (!isActive) return;

    const intervalId = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isActive]);

  useEffect(() => {
    if (!isActive) {
      setTimeLeft(MODES[mode].time);
    }
  }, [MODES, isActive, mode]);

  const toggleTimer = () => setIsActive(!isActive);

  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(currentMode.time);
  };

  const changeMode = (newMode: 'work' | 'short' | 'long') => {
    setMode(newMode);
    setIsActive(false);
    setTimeLeft(MODES[newMode].time);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentMode = MODES[mode];
  const progress = (timeLeft / currentMode.time) * 100;
  const compactPomodoro = size.isCompact || size.pixelWidth < 340 || size.pixelHeight < 330;
  const squeezedPomodoro = size.pixelHeight < 290 || size.pixelWidth < 290;
  const ringSize = squeezedPomodoro ? 96 : compactPomodoro ? 118 : size.pixelHeight < 390 ? 138 : 158;
  const strokeWidth = compactPomodoro ? 8 : 9;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const modeButtonAccent = {
    backgroundColor: theme.dark ? currentMode.tintDark : currentMode.tintLight,
    borderColor: theme.dark ? currentMode.tintDark : currentMode.tintLight,
    color: theme.dark ? '#f8fafc' : '#0f172a',
  };
  const modeButtonGroupClass = 'border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)]';
  const inactiveModeButtonClass = 'border-transparent text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]';
  const transportButtonClass = isActive
    ? 'bg-[var(--ether-control-active-bg)] text-[var(--ether-control-active-text)]'
    : 'text-white';

  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare accent="rose" widget={widget}>
        <div className="flex flex-1 flex-col items-center justify-center">
            <WidgetText variant="label" tone="muted" align="center" className="mb-1">{mode[0]}</WidgetText>
            <span className={`text-xl font-bold tabular-nums ${theme.onSurface}`}>{formatTime(timeLeft)}</span>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      widget={widget}
      title="Pomodoro"
      icon={<Timer size={14} />}
      accent={mode === 'work' ? 'rose' : mode === 'short' ? 'teal' : 'indigo'}
      rightSlot={
        <button
          type="button"
          onClick={resetTimer}
          aria-label="Reset pomodoro"
          className="dashboard-widget-control-button"
        >
          <RotateCcw size={13} />
        </button>
      }
    >
      <div
        className={`flex h-full min-h-0 flex-col items-center justify-center ${squeezedPomodoro ? 'gap-2' : compactPomodoro ? 'gap-3' : 'gap-5'}`}
        onDragOver={dropBindings.onDragOver}
        onDrop={dropBindings.onDrop}
      >
        {linkedTaskTitle && !squeezedPomodoro ? (
          <div
            data-testid="pomodoro-linked-task-label"
            className="flex w-full max-w-[18rem] items-center gap-1 rounded-full bg-[var(--ether-control-bg)] px-3 py-1"
            aria-label={`Focus: ${linkedTaskTitle}`}
          >
            <span className="min-w-0 flex-1 truncate text-center text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ether-on-surface-variant)]">
              Focus: {linkedTaskTitle}
            </span>
            <button
              type="button"
              onClick={() => onUpdateWidgetConfig?.(widget.id, { linkedTaskId: undefined })}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-error)]/10 hover:text-[var(--ether-error)]"
              aria-label="Clear focus task"
            >
              <X size={10} />
            </button>
          </div>
        ) : null}
        {/* ── Mode Select ── */}
        <div className={`grid w-full max-w-[18rem] grid-cols-3 gap-1 rounded-2xl p-1 ${modeButtonGroupClass}`}>
            {(['work', 'short', 'long'] as const).map((m) => (
                <button
                    key={m}
                    onClick={() => changeMode(m)}
                    className={`min-w-0 rounded-xl border font-bold uppercase transition-all ${
                        compactPomodoro ? 'px-1.5 py-1 text-[9px] tracking-normal' : 'px-3 py-1.5 text-[9px] tracking-widest'
                    } ${
                        mode === m
                          ? 'shadow-sm'
                          : inactiveModeButtonClass
                    }`}
                    style={mode === m ? modeButtonAccent : undefined}
                >
                    {!compactPomodoro && (m === 'work' ? <Brain size={12} className="mr-1 inline" /> : <Coffee size={12} className="mr-1 inline" />)}
                    {compactPomodoro ? MODES[m].shortTitle : MODES[m].title}
                </button>
            ))}
        </div>

        {/* ── Progress Circle ── */}
        <div className={`relative flex shrink-0 items-center justify-center${widget.config.breathingRingEnabled !== false ? ' pomodoro-breathing-ring' : ''}`} style={{ height: ringSize, width: ringSize }}>
            <svg className="absolute inset-0 h-full w-full -rotate-90 transform" viewBox="0 0 120 120">
                <circle
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    className="text-[var(--ether-control-bg)]"
                />
                <circle
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke={currentMode.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - progress / 100)}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-linear shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                    style={{ filter: `drop-shadow(0 0 4px ${currentMode.color})` }}
                />
            </svg>
            <div className="text-center z-10">
                <div className={`font-bold tabular-nums tracking-tight ${compactPomodoro ? 'text-2xl' : 'text-4xl'} ${theme.onSurface}`}>{formatTime(timeLeft)}</div>
                <div className={`mt-1 font-bold uppercase ${compactPomodoro ? 'text-[9px] tracking-normal' : 'text-[10px] tracking-[0.25em]'} ${theme.onSurfaceVariant}`}>{currentMode.label}</div>
                {mode === 'work' && !isActive ? (
                  isEditingWorkMins ? (
                    <input
                      ref={workMinsInputRef}
                      type="number"
                      min={1}
                      max={180}
                      value={workMinsDraft}
                      aria-label="Edit work session minutes"
                      onChange={(event) => setWorkMinsDraft(event.target.value)}
                      onBlur={commitWorkMins}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          commitWorkMins();
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          setIsEditingWorkMins(false);
                        }
                      }}
                      className="mt-1 w-16 rounded-md border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-1 text-center text-[10px] font-bold text-[var(--ether-on-surface)] outline-none focus:border-[var(--ether-primary)]/45"
                    />
                  ) : (
                    <button
                      type="button"
                      data-testid="pomodoro-work-mins"
                      onClick={() => {
                        setWorkMinsDraft(String(workMins));
                        setIsEditingWorkMins(true);
                      }}
                      className={`mt-1 rounded-md px-1 text-[10px] font-bold tabular-nums ${theme.onSurfaceVariant} hover:bg-[var(--ether-control-hover)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[var(--ether-primary)]/45`}
                      aria-label={`${workMins} minute session. Click to edit.`}
                    >
                      {workMins} min
                    </button>
                  )
                ) : null}
            </div>
        </div>

        {/* ── Controls ── */}
        <button
            onClick={toggleTimer}
            aria-label={isActive ? 'Pause pomodoro' : 'Start pomodoro'}
            className={`relative grid place-items-center overflow-hidden rounded-2xl transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ether-primary)]/45 ${
                compactPomodoro ? 'h-11 w-11' : 'h-14 w-14'
            } ${
                transportButtonClass
            }`}
            style={
              !isActive
                ? {
                    backgroundColor: currentMode.color,
                    boxShadow: `0 14px 28px -14px ${currentMode.shadow}`,
                  }
                : undefined
            }
        >
            {isActive ? (
              <Pause size={compactPomodoro ? 18 : 24} fill="currentColor" />
            ) : (
              <Play size={compactPomodoro ? 18 : 24} fill="currentColor" />
            )}
        </button>
      </div>
    </WidgetShell>
  );
};

export default PomodoroWidget;
