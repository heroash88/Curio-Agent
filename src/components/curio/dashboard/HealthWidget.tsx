import React, { useMemo, useState } from 'react';
import { Activity, HeartPulse } from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useWidgetAriaAnnouncer } from '../../../hooks/useWidgetAriaAnnouncer';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type { DashboardHealthRange, DashboardWidget } from '../../../services/dashboardTypes';
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from '../../../utils/settings/dashboardSettings';
import WidgetShell from './WidgetShell';
import { WidgetCounter, WidgetText } from './widgetPrimitives';

const ringStyle = (value: number, color: string) => ({
  background: `conic-gradient(${color} ${value * 3.6}deg, rgba(148,163,184,0.14) 0deg)`,
});

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const HealthWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const [range, setRange] = useState<DashboardHealthRange>(widget.config.healthRange || 'day');

  const boardInteractivity = useDashboardInteractivitySettings();
  const rollingEnabled = effectiveToggle(
    'rollingNumbersEnabled',
    boardInteractivity,
    widget.config,
  );

  const data = useMemo(() => {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const dayProgress = clamp01(minutes / (16 * 60));
    const weekProgress = clamp01((now.getDay() + dayProgress) / 7);

    const rangeProgress = range === 'day' ? dayProgress : weekProgress;
    const stepGoal = widget.config.stepGoal || 8500;
    const moveGoal = widget.config.moveGoal || 650;
    const exerciseGoal = widget.config.exerciseGoal || 45;
    const standGoal = widget.config.standGoal || 12;

    const steps = Math.round(stepGoal * rangeProgress * 0.92 + (range === 'day' ? 420 : 1200));
    const move = Math.round(moveGoal * Math.min(1.18, rangeProgress * 1.08));
    const exercise = Math.round(exerciseGoal * Math.min(1.2, rangeProgress * 1.03));
    const stand = Math.round(standGoal * Math.min(1, rangeProgress * 1.22));
    const heartRate = 68 + Math.round(7 * Math.sin(minutes / 42));
    const recovery = 76 + Math.round(8 * Math.cos(minutes / 88));

    return {
      steps,
      move,
      exercise,
      stand,
      heartRate,
      recovery,
      stepGoal,
      moveGoal,
      exerciseGoal,
      standGoal,
      stepsProgress: clamp01(steps / stepGoal),
      moveProgress: clamp01(move / moveGoal),
      exerciseProgress: clamp01(exercise / exerciseGoal),
      standProgress: clamp01(stand / standGoal),
    };
  }, [range, widget.config.exerciseGoal, widget.config.moveGoal, widget.config.standGoal, widget.config.stepGoal]);
  const tightFrame = size.pixelWidth < 280 || size.pixelHeight < 300;
  const compactLayout = size.isCompact || size.pixelWidth < 340 || size.pixelHeight < 340;
  const primaryCardClass = tightFrame ? 'rounded-[1.15rem] p-2.5' : 'rounded-[1.5rem] p-3';
  const primaryValueClass = tightFrame
    ? 'text-[clamp(1.35rem,12cqw,1.85rem)]'
    : compactLayout
      ? 'text-2xl'
      : 'text-3xl';
  const compactMetricClass = tightFrame ? 'rounded-[1rem] px-2.5 py-2' : 'rounded-[1.25rem] px-3 py-2';
  const showCompactMetrics = !tightFrame && size.pixelHeight >= 300;
  const showRangeSwitch = !tightFrame || size.pixelHeight >= 205;

  useWidgetAriaAnnouncer(
    widget.id,
    `Activity ${data.steps.toLocaleString()} steps, heart rate ${data.heartRate}`,
  );

  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare widget={widget}>
        <div className="flex flex-1 flex-col items-center justify-center gap-1">
          <HeartPulse size={20} className="text-rose-400" />
          <span className={`text-sm font-semibold ${theme.onSurface}`}>{data.heartRate} bpm</span>
        </div>
      </WidgetShell>
    );
  }

  const showRings = !compactLayout && size.pixelWidth >= 360 && size.pixelHeight >= 360;
  const rangeSwitch = showRangeSwitch ? (
    <div
      data-testid="activity-range-switch"
      className="flex self-center rounded-full bg-[var(--ether-control-bg)] p-1 ring-1 ring-[var(--ether-glass-border)]"
    >
      {(['day', 'week'] as DashboardHealthRange[]).map((option) => (
        <button
          key={option}
          onClick={() => setRange(option)}
          className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition ${
            option === range ? 'bg-[var(--ether-control-active-bg)] text-[var(--ether-control-active-text)]' : 'text-[var(--ether-on-surface-variant)]'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <WidgetShell
      widget={widget}
      title="Activity"
      icon={<Activity size={15} strokeWidth={2.25} />}
      accent="rose"
    >
      <div
        data-testid="activity-content"
        className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${tightFrame ? 'gap-2' : 'gap-3'}`}
      >
        {rangeSwitch}
        <div className={`grid grid-cols-2 ${tightFrame ? 'gap-2' : 'gap-3'}`}>
          <div className={`activity-primary-stat-card min-w-0 overflow-hidden ${primaryCardClass} ${theme.surfaceContainerLow}`}>
            <WidgetText variant="label" tone="muted">Steps</WidgetText>
            <div className={`activity-stat-value mt-2 truncate ${primaryValueClass} font-semibold leading-none tracking-normal tabular-nums ${theme.onSurface}`}>
              {rollingEnabled ? (
                <WidgetCounter
                  value={data.steps}
                  ariaLabel={`Steps ${data.steps.toLocaleString()}`}
                />
              ) : (
                data.steps.toLocaleString()
              )}
            </div>
            <div className={`mt-1 truncate text-xs ${theme.onSurfaceVariant}`}>Goal {data.stepGoal.toLocaleString()}</div>
          </div>
          <div className={`activity-primary-stat-card min-w-0 overflow-hidden ${primaryCardClass} ${theme.surfaceContainerLow}`}>
            <WidgetText variant="label" tone="muted">Heart</WidgetText>
            <div className={`activity-stat-value mt-2 truncate ${primaryValueClass} font-semibold leading-none tracking-normal tabular-nums ${theme.onSurface}`}>
              {rollingEnabled ? (
                <WidgetCounter
                  value={data.heartRate}
                  ariaLabel={`Heart rate ${data.heartRate}`}
                />
              ) : (
                data.heartRate
              )}
            </div>
            <div className={`mt-1 truncate text-xs ${theme.onSurfaceVariant}`}>Recovery {data.recovery}%</div>
          </div>
        </div>

        {showRings ? (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Move', value: data.move, goal: data.moveGoal, progress: data.moveProgress, color: '#fb7185' },
              { label: 'Exercise', value: data.exercise, goal: data.exerciseGoal, progress: data.exerciseProgress, color: '#f59e0b' },
              { label: 'Stand', value: data.stand, goal: data.standGoal, progress: data.standProgress, color: '#38bdf8' },
            ].map((ring) => (
              <div key={ring.label} className={`rounded-[1.5rem] p-3 text-center ${theme.surfaceContainerLow}`}>
                <div className="mx-auto flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full p-[6px]" style={ringStyle(ring.progress, ring.color)}>
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-[var(--ether-glass-bg)]">
                    <span className={`text-sm font-semibold ${theme.onSurface}`}>{Math.round(ring.progress * 100)}%</span>
                  </div>
                </div>
                <div className="mt-3">
                  <WidgetText variant="label" tone="muted" align="center">{ring.label}</WidgetText>
                </div>
                <div className={`mt-1 text-sm font-semibold ${theme.onSurface}`}>{ring.value}/{ring.goal}</div>
              </div>
            ))}
          </div>
        ) : showCompactMetrics ? (
          <div className="grid min-h-0 grid-cols-3 gap-2">
            {[
              { label: 'Move', value: `${data.move}/${data.moveGoal}` },
              { label: 'Exercise', value: `${data.exercise}/${data.exerciseGoal}` },
              { label: 'Stand', value: `${data.stand}/${data.standGoal}` },
            ].map((item) => (
              <div key={item.label} className={`activity-compact-metric-card min-w-0 overflow-hidden ${compactMetricClass} ${theme.surfaceContainerLow}`}>
                <WidgetText variant="label" tone="muted">{item.label}</WidgetText>
                <div className={`activity-compact-metric-value mt-1 truncate text-sm font-semibold tabular-nums ${theme.onSurface}`}>{item.value}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </WidgetShell>
  );
};

export default HealthWidget;
