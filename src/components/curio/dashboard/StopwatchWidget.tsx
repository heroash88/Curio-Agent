import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Flag, Pause, Play, RotateCcw } from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type {
  DashboardWidget,
  DashboardWidgetConfig,
} from '../../../services/dashboardTypes';
import WidgetShell from './WidgetShell';
import { IconStopwatch } from './widgetIcons';
import { FitText, WidgetBody, WidgetFooter, WidgetText } from './widgetPrimitives';

const MAX_LAPS = 5;
const STOPWATCH_TICK_INTERVAL_MS = 10;

type StopwatchState = {
  running: boolean;
  startedAt: number | null;
  elapsedMs: number;
  laps: number[];
};

const readStopwatchState = (config: DashboardWidgetConfig): StopwatchState => ({
  running: Boolean(config.stopwatchRunning),
  startedAt:
    typeof config.stopwatchStartedAt === 'number'
      ? config.stopwatchStartedAt
      : null,
  elapsedMs:
    typeof config.stopwatchElapsedMs === 'number'
      ? Math.max(0, config.stopwatchElapsedMs)
      : 0,
  laps: Array.isArray(config.stopwatchLaps)
    ? config.stopwatchLaps.filter((lap) => Number.isFinite(lap)).slice(0, MAX_LAPS)
    : [],
});

const formatStopwatchElapsed = (ms: number) => {
  const safeMs = Math.max(0, Math.floor(ms));
  const centiseconds = Math.floor((safeMs % 1000) / 10);
  const totalSeconds = Math.floor(safeMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  const baseLabel = `${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${centiseconds
    .toString()
    .padStart(2, '0')}`;

  return hours > 0 ? `${hours.toString().padStart(2, '0')}:${baseLabel}` : baseLabel;
};

const getElapsed = (state: StopwatchState, now: number) => {
  if (!state.running || !state.startedAt) return state.elapsedMs;
  return state.elapsedMs + Math.max(0, now - state.startedAt);
};

const StopwatchWidget: React.FC<{
  widget: DashboardWidget;
  onUpdateWidgetConfig?: (
    widgetId: string,
    patch: Partial<DashboardWidgetConfig>,
  ) => void;
}> = ({ widget, onUpdateWidgetConfig }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const [now, setNow] = useState(() => Date.now());
  const [state, setState] = useState<StopwatchState>(() =>
    readStopwatchState(widget.config),
  );
  const gridWidth = size.w ?? 0;
  const gridHeight = size.h ?? 0;
  const tinyLayout =
    size.sizeClass === 'tiny' ||
    gridWidth <= 1 ||
    gridHeight <= 1 ||
    size.pixelHeight <= 170 ||
    (size.pixelWidth <= 190 && size.pixelHeight <= 220);
  const compactLayout =
    !tinyLayout &&
    (size.sizeClass === 'small' ||
      size.pixelHeight < 260 ||
      (gridWidth <= 2 && gridHeight <= 2));
  const iconOnlyActions =
    compactLayout ||
    size.pixelWidth < 330 ||
    size.pixelHeight < 300;
  const showProgressRing = !tinyLayout && (!compactLayout || size.pixelHeight >= 205);
  const progressRingSize = compactLayout ? 56 : 82;
  const progressRingInnerInset = compactLayout ? 8 : 8;
  const progressRingIconSize = compactLayout ? 'h-6 w-6' : 'h-8 w-8';

  useEffect(() => {
    setState(readStopwatchState(widget.config));
  }, [widget.id, widget.config.stopwatchRequestNonce]);

  useEffect(() => {
    if (!state.running) return;
    const updateNow = () => setNow(Date.now());
    updateNow();
    const intervalId = window.setInterval(updateNow, STOPWATCH_TICK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [state.running]);

  const elapsed = getElapsed(state, now);
  const elapsedLabel = formatStopwatchElapsed(elapsed);

  const updateConfig = useCallback(
    (patch: Partial<DashboardWidgetConfig>) => {
      onUpdateWidgetConfig?.(widget.id, {
        ...patch,
        stopwatchRequestNonce: Date.now(),
      });
    },
    [onUpdateWidgetConfig, widget.id],
  );

  const commitState = useCallback(
    (nextState: StopwatchState) => {
      setState(nextState);
      updateConfig({
        stopwatchRunning: nextState.running,
        stopwatchStartedAt: nextState.startedAt ?? undefined,
        stopwatchElapsedMs: nextState.elapsedMs,
        stopwatchLaps: nextState.laps,
      });
    },
    [updateConfig],
  );

  const handleStartPause = () => {
    const timestamp = Date.now();
    if (state.running) {
      commitState({
        ...state,
        running: false,
        startedAt: null,
        elapsedMs: getElapsed(state, timestamp),
      });
      return;
    }

    commitState({
      ...state,
      running: true,
      startedAt: timestamp,
    });
    setNow(timestamp);
  };

  const handleLap = () => {
    const currentElapsed = getElapsed(state, Date.now());
    if (currentElapsed <= 0) return;
    commitState({
      ...state,
      laps: [currentElapsed, ...state.laps].slice(0, MAX_LAPS),
    });
  };

  const handleReset = () => {
    commitState({
      running: false,
      startedAt: null,
      elapsedMs: 0,
      laps: [],
    });
    setNow(Date.now());
  };

  const ringProgress = useMemo(() => {
    const seconds = Math.floor(elapsed / 1000);
    return (seconds % 60) / 60;
  }, [elapsed]);

  const elapsedTime = (
    <FitText
      as="div"
      min={tinyLayout ? 0.85 : compactLayout ? 1.15 : 1.4}
      max={tinyLayout ? 1.55 : compactLayout ? 2.2 : 2.7}
      step={0.075}
      availableHeight={
        tinyLayout
          ? Math.max(36, size.pixelHeight - 22)
          : compactLayout
            ? Math.max(42, Math.min(88, size.pixelHeight * 0.38))
            : undefined
      }
      className="w-full font-mono font-bold tracking-normal text-[var(--ether-on-surface)]"
    >
      {elapsedLabel}
    </FitText>
  );
  const primaryActionLabel = state.running ? 'Pause' : 'Start';
  const primaryButtonClasses = iconOnlyActions
    ? 'mx-auto flex aspect-square h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ether-control-active-bg)] text-[var(--ether-control-active-text)] transition hover:brightness-105 active:scale-95'
    : 'flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-[var(--ether-control-active-bg)] px-2 py-2 text-xs font-bold text-[var(--ether-control-active-text)] transition hover:brightness-105 active:scale-95';
  const secondaryButtonClasses = iconOnlyActions
    ? 'mx-auto flex aspect-square h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ether-control-hover)] text-[var(--ether-on-surface)] transition hover:bg-[var(--ether-control-active-bg)] hover:text-[var(--ether-control-active-text)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-45'
    : 'flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-[var(--ether-control-hover)] px-2 py-2 text-xs font-bold text-[var(--ether-on-surface)] transition hover:bg-[var(--ether-control-active-bg)] hover:text-[var(--ether-control-active-text)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-45';

  if (tinyLayout) {
    return (
      <WidgetShell
        widget={widget}
        accent="amber"
        bare
        padded={false}
        actionSlotVisibility="hover"
      >
        <WidgetBody
          align="center"
          gap="xs"
          className="items-center px-2 py-2 text-center"
          data-testid="stopwatch-tiny-body"
        >
          <button
            type="button"
            onClick={handleStartPause}
            aria-label={state.running ? 'Pause stopwatch' : 'Start stopwatch'}
            data-testid="stopwatch-tiny-time"
            className="flex w-full min-w-0 items-center justify-center rounded-xl text-center transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ether-primary)]/40"
          >
            {elapsedTime}
          </button>
        </WidgetBody>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      widget={widget}
      title="Stopwatch"
      icon={<IconStopwatch />}
      accent="amber"
      padded={false}
      bodyClassName={compactLayout ? 'px-3 pb-3 pt-2' : 'px-4 pb-4 pt-3 sm:px-5 sm:pb-5'}
      titleClassName={
        compactLayout
          ? 'truncate whitespace-nowrap text-[10px] font-bold uppercase leading-none tracking-[0.11em]'
          : undefined
      }
      rightSlot={!compactLayout ? (
        <span className={`text-[10px] font-bold ${theme.muted}`}>
          {state.running ? 'Running' : 'Ready'}
        </span>
      ) : undefined}
    >
      <WidgetBody gap={compactLayout ? 'sm' : 'lg'}>
        <div
          data-testid="stopwatch-display"
          className={`flex min-h-0 flex-1 flex-col items-center justify-center text-center ${compactLayout ? 'gap-1.5' : 'gap-2'}`}
        >
          {showProgressRing && (
            <div
              data-testid="stopwatch-progress-ring"
              className="relative flex shrink-0 items-center justify-center rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] shadow-inner"
              style={{
                width: progressRingSize,
                height: progressRingSize,
                background: `conic-gradient(from -90deg, var(--ether-control-active-bg) ${ringProgress * 100}%, var(--ether-control-hover) 0)`,
              }}
              aria-hidden="true"
            >
              <div
                className="absolute rounded-full bg-[var(--ether-glass-bg)] backdrop-blur-md"
                style={{ inset: progressRingInnerInset }}
              />
              <IconStopwatch className={`relative z-10 ${progressRingIconSize}`} />
            </div>
          )}

          <div className="w-full min-w-0">
            <div
              data-testid={compactLayout ? 'stopwatch-compact-time' : 'stopwatch-time'}
              className="mx-auto flex w-full min-w-0 max-w-full justify-center"
            >
              {elapsedTime}
            </div>
            {!compactLayout && (
              <WidgetText as="div" variant="caption" tone="muted" className={`mt-1 text-xs font-semibold ${theme.muted}`}>
                {state.running ? 'Timing now' : elapsed > 0 ? 'Paused' : 'Ready to time'}
              </WidgetText>
            )}
          </div>
        </div>

        {state.laps.length > 0 && !compactLayout && (
          <div className="dashboard-widget-touch-scroll min-h-0 rounded-[1rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-2">
            <div className="flex min-h-0 flex-col gap-1.5">
              {state.laps.slice(0, MAX_LAPS).map((lap, index) => (
                <div
                  key={`${lap}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-[var(--ether-surface-container-low)] px-2 py-1"
                >
                  <span className={`text-[10px] font-bold ${theme.muted}`}>
                    Lap {state.laps.length - index}
                  </span>
                  <span className="font-mono text-xs font-bold text-[var(--ether-on-surface)]">
                    {formatStopwatchElapsed(lap)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <WidgetFooter gap="none">
          <div className={`grid grid-cols-3 items-center ${iconOnlyActions ? 'gap-2' : 'gap-1.5'}`}>
            <button
              type="button"
              onClick={handleStartPause}
              aria-label={state.running ? 'Pause stopwatch' : 'Start stopwatch'}
              className={primaryButtonClasses}
            >
              {state.running ? <Pause size={iconOnlyActions ? 17 : 14} /> : <Play size={iconOnlyActions ? 17 : 14} />}
              {!iconOnlyActions && <span className="min-w-0 truncate">{primaryActionLabel}</span>}
            </button>
            <button
              type="button"
              onClick={handleLap}
              aria-label="Record lap"
              disabled={elapsed <= 0}
              className={secondaryButtonClasses}
            >
              <Flag size={iconOnlyActions ? 17 : 14} />
              {!iconOnlyActions && <span className="min-w-0 truncate">Lap</span>}
            </button>
            <button
              type="button"
              onClick={handleReset}
              aria-label="Reset stopwatch"
              disabled={elapsed <= 0 && state.laps.length === 0}
              className={secondaryButtonClasses}
            >
              <RotateCcw size={iconOnlyActions ? 17 : 14} />
              {!iconOnlyActions && <span className="min-w-0 truncate">Reset</span>}
            </button>
          </div>
        </WidgetFooter>
      </WidgetBody>
    </WidgetShell>
  );
};

export default React.memo(StopwatchWidget);
