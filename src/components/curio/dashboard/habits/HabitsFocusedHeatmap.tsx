import React, { useCallback, useMemo } from 'react';
import { Flame } from 'lucide-react';
import { WidgetBody, WidgetText } from '../widgetPrimitives';
import type { DashboardWidget } from '../../../../services/dashboardTypes';
import { useWidgetPersistentState } from '../../../../hooks/useWidgetPersistentState';

interface HabitsFocusedHeatmapProps {
  widget: DashboardWidget;
  focused?: boolean;
}

/**
 * HabitsFocusedHeatmap — focused overlay editor for the Habits widget.
 * Renders a month heatmap grid (30 day cells) with tap-to-toggle
 * functionality. Color intensity is based on streak length.
 *
 * Requirements: 13.7
 */
const HabitsFocusedHeatmap: React.FC<HabitsFocusedHeatmapProps> = ({ widget }) => {
  const [completedDays, setCompletedDays] = useWidgetPersistentState<string[]>(
    widget.id, 'heatmap-completed', [],
  );

  const today = useMemo(() => new Date(), []);
  const monthDays = useMemo(() => {
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const date = new Date(year, month, i + 1);
      return {
        day: i + 1,
        dateStr: date.toISOString().split('T')[0],
        isToday: i + 1 === today.getDate(),
        isFuture: date > today,
      };
    });
  }, [today]);

  const toggleDay = useCallback((dateStr: string) => {
    setCompletedDays((prev) =>
      prev.includes(dateStr)
        ? prev.filter((d) => d !== dateStr)
        : [...prev, dateStr],
    );
  }, [setCompletedDays]);

  // Calculate streak ending today
  const currentStreak = useMemo(() => {
    let streak = 0;
    const sorted = [...completedDays].sort().reverse();
    const todayStr = today.toISOString().split('T')[0];
    let checkDate = new Date(today);

    // Start from today or yesterday
    if (!sorted.includes(todayStr)) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    for (let i = 0; i < 60; i++) {
      const dateStr = checkDate.toISOString().split('T')[0];
      if (sorted.includes(dateStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }, [completedDays, today]);

  // Color intensity based on consecutive days around each cell
  const getIntensity = (dateStr: string): number => {
    if (!completedDays.includes(dateStr)) return 0;
    // Simple: count how many of the surrounding 3 days are also completed
    const date = new Date(dateStr);
    let nearby = 1;
    for (let offset = -1; offset <= 1; offset++) {
      if (offset === 0) continue;
      const neighbor = new Date(date);
      neighbor.setDate(neighbor.getDate() + offset);
      if (completedDays.includes(neighbor.toISOString().split('T')[0])) nearby++;
    }
    return nearby; // 1-3
  };

  const completedCount = monthDays.filter((d) => completedDays.includes(d.dateStr)).length;
  const monthLabel = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <WidgetBody gap="md" scroll="y">
      <div className="flex items-center justify-between">
        <WidgetText variant="title">Habits Heatmap</WidgetText>
        <div className="flex items-center gap-1.5">
          <Flame size={14} className={currentStreak > 0 ? 'text-orange-400' : 'text-[var(--ether-on-surface-variant)]/30'} />
          <span className="text-sm font-bold text-[var(--ether-on-surface)]">{currentStreak}</span>
          <span className="text-[10px] text-[var(--ether-on-surface-variant)]">day streak</span>
        </div>
      </div>

      <WidgetText variant="label" tone="muted">{monthLabel}</WidgetText>

      {/* Heatmap grid */}
      <div className="rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60 p-3">
        {/* Day-of-week headers */}
        <div className="mb-1 grid grid-cols-7 gap-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="text-center text-[8px] font-medium text-[var(--ether-on-surface-variant)]">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {/* Offset for first day of month */}
          {Array.from({ length: new Date(today.getFullYear(), today.getMonth(), 1).getDay() }, (_, i) => (
            <div key={`empty-${i}`} className="h-8 w-full" />
          ))}
          {monthDays.map((d) => {
            const intensity = getIntensity(d.dateStr);
            const isCompleted = completedDays.includes(d.dateStr);
            const bgClass = d.isFuture
              ? 'bg-[var(--ether-control-bg)]/30'
              : intensity === 3
                ? 'bg-emerald-500'
                : intensity === 2
                  ? 'bg-emerald-400/80'
                  : intensity === 1
                    ? 'bg-emerald-400/50'
                    : 'bg-[var(--ether-control-bg)]';

            return (
              <button
                key={d.dateStr}
                type="button"
                onClick={() => !d.isFuture && toggleDay(d.dateStr)}
                disabled={d.isFuture}
                className={`relative flex h-8 w-full items-center justify-center rounded-md text-[10px] font-medium transition-all ${bgClass} ${
                  d.isToday ? 'ring-1 ring-[var(--ether-primary)]' : ''
                } ${d.isFuture ? 'cursor-default opacity-40' : 'cursor-pointer hover:scale-105'} ${
                  isCompleted ? 'text-white' : 'text-[var(--ether-on-surface)]'
                }`}
                aria-label={`${d.day} ${isCompleted ? 'completed' : 'not completed'}`}
                aria-pressed={isCompleted}
              >
                {d.day}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60 px-3 py-2">
        <div className="text-center">
          <div className="text-lg font-bold text-[var(--ether-on-surface)]">{completedCount}</div>
          <div className="text-[9px] text-[var(--ether-on-surface-variant)]">days this month</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-[var(--ether-on-surface)]">{currentStreak}</div>
          <div className="text-[9px] text-[var(--ether-on-surface-variant)]">current streak</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-[var(--ether-on-surface)]">
            {monthDays.length > 0 ? Math.round((completedCount / Math.min(today.getDate(), monthDays.length)) * 100) : 0}%
          </div>
          <div className="text-[9px] text-[var(--ether-on-surface-variant)]">completion</div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-2">
        <span className="text-[9px] text-[var(--ether-on-surface-variant)]">Less</span>
        <div className="h-3 w-3 rounded-sm bg-[var(--ether-control-bg)]" />
        <div className="h-3 w-3 rounded-sm bg-emerald-400/50" />
        <div className="h-3 w-3 rounded-sm bg-emerald-400/80" />
        <div className="h-3 w-3 rounded-sm bg-emerald-500" />
        <span className="text-[9px] text-[var(--ether-on-surface-variant)]">More</span>
      </div>
    </WidgetBody>
  );
};

export default HabitsFocusedHeatmap;
