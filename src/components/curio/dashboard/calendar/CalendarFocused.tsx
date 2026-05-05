import React, { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { WidgetBody, WidgetText, WidgetInlineError } from '../widgetPrimitives';
import type { DashboardWidget, DashboardWidgetConfig } from '../../../../services/dashboardTypes';
import { useWidgetPersistentState } from '../../../../hooks/useWidgetPersistentState';

interface CalendarFocusedProps {
  widget: DashboardWidget;
  focused?: boolean;
  onUpdateWidgetConfig?: (widgetId: string, patch: Partial<DashboardWidgetConfig>) => void;
}

type ViewMode = 'week' | 'month';

interface QuickEvent {
  id: string;
  title: string;
  date: string; // ISO date
  time: string; // HH:MM
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 7); // 7am-6pm

/**
 * CalendarFocused — focused overlay editor for Calendar widgets.
 * Renders week and month grid views with inline event creation.
 * Wired for Calendar, GoogleCalendar, OutlookCalendar, iCal, HaCalendar.
 *
 * Requirements: 13.5
 */
const CalendarFocused: React.FC<CalendarFocusedProps> = ({ widget }) => {
  const [viewMode, setViewMode] = useWidgetPersistentState<ViewMode>(
    widget.id, 'calendar-view', 'week',
  );
  const [events, setEvents] = useWidgetPersistentState<QuickEvent[]>(
    widget.id, 'quick-events', [],
  );
  const [error] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('09:00');

  const navigate = useCallback((dir: -1 | 1) => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === 'week') next.setDate(next.getDate() + dir * 7);
      else next.setMonth(next.getMonth() + dir);
      return next;
    });
  }, [viewMode]);

  const handleAddEvent = useCallback(() => {
    if (!newTitle.trim()) return;
    const event: QuickEvent = {
      id: `evt-${Date.now()}`,
      title: newTitle.trim(),
      date: currentDate.toISOString().split('T')[0],
      time: newTime,
    };
    setEvents((prev) => [...prev, event]);
    setNewTitle('');
    setShowQuickAdd(false);
  }, [newTitle, newTime, currentDate, setEvents]);

  // Month grid data
  const monthGrid = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ day: number | null; isToday: boolean }> = [];
    const today = new Date();

    for (let i = 0; i < firstDay; i++) cells.push({ day: null, isToday: false });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        day: d,
        isToday: d === today.getDate() && month === today.getMonth() && year === today.getFullYear(),
      });
    }
    return cells;
  }, [currentDate]);

  // Week grid data
  const weekDays = useMemo(() => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const today = new Date();
      return {
        date: d,
        label: DAYS[i],
        dayNum: d.getDate(),
        isToday: d.toDateString() === today.toDateString(),
        dateStr: d.toISOString().split('T')[0],
      };
    });
  }, [currentDate]);

  if (error) {
    return <WidgetInlineError message={error} widgetId={widget.id} />;
  }

  const headerLabel = viewMode === 'month'
    ? currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : `Week of ${weekDays[0].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  return (
    <WidgetBody gap="sm" scroll="y">
      {/* Header with view toggle and navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate(-1)} className="rounded-lg p-1 text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]" aria-label="Previous">
            <ChevronLeft size={16} />
          </button>
          <WidgetText variant="title">{headerLabel}</WidgetText>
          <button type="button" onClick={() => navigate(1)} className="rounded-lg p-1 text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]" aria-label="Next">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-[var(--ether-surface-container-low)] p-0.5">
          {(['week', 'month'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                viewMode === mode
                  ? 'bg-[var(--ether-primary)] text-[var(--ether-on-primary)]'
                  : 'text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Month view */}
      {viewMode === 'month' && (
        <div className="rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60 p-2">
          <div className="grid grid-cols-7 gap-0.5">
            {DAYS.map((d) => (
              <div key={d} className="py-1 text-center text-[9px] font-medium text-[var(--ether-on-surface-variant)]">{d}</div>
            ))}
            {monthGrid.map((cell, i) => (
              <div
                key={i}
                className={`flex h-8 items-center justify-center rounded-md text-xs ${
                  cell.day === null ? '' :
                  cell.isToday ? 'bg-[var(--ether-primary)] font-bold text-[var(--ether-on-primary)]' :
                  'text-[var(--ether-on-surface)] hover:bg-[var(--ether-control-hover)]'
                }`}
              >
                {cell.day}
                {cell.day && events.some((e) => {
                  const eDate = new Date(e.date);
                  return eDate.getDate() === cell.day && eDate.getMonth() === currentDate.getMonth();
                }) && (
                  <span className="absolute mt-5 h-1 w-1 rounded-full bg-[var(--ether-primary)]" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Week view */}
      {viewMode === 'week' && (
        <div className="rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60 p-2">
          <div className="grid grid-cols-8 gap-0.5">
            <div /> {/* empty corner */}
            {weekDays.map((wd) => (
              <div key={wd.dateStr} className="flex flex-col items-center py-1">
                <span className="text-[9px] text-[var(--ether-on-surface-variant)]">{wd.label}</span>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium ${
                  wd.isToday ? 'bg-[var(--ether-primary)] text-[var(--ether-on-primary)]' : 'text-[var(--ether-on-surface)]'
                }`}>
                  {wd.dayNum}
                </span>
              </div>
            ))}
            {HOURS.slice(0, 6).map((hour) => (
              <React.Fragment key={hour}>
                <div className="flex items-center justify-end pr-1 text-[8px] text-[var(--ether-on-surface-variant)]">
                  {hour > 12 ? `${hour - 12}p` : hour === 12 ? '12p' : `${hour}a`}
                </div>
                {weekDays.map((wd) => {
                  const dayEvents = events.filter((e) => e.date === wd.dateStr && parseInt(e.time) === hour);
                  return (
                    <div key={`${hour}-${wd.dateStr}`} className="h-6 border-t border-[var(--ether-glass-border)]/30">
                      {dayEvents.map((ev) => (
                        <div key={ev.id} className="truncate rounded-sm bg-[var(--ether-primary)]/20 px-0.5 text-[7px] text-[var(--ether-primary)]">
                          {ev.title}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Inline event creation */}
      {showQuickAdd ? (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--ether-primary)]/30 bg-[var(--ether-surface-container-low)]/60 px-3 py-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddEvent(); if (e.key === 'Escape') setShowQuickAdd(false); }}
            placeholder="Event title..."
            className="flex-1 bg-transparent text-xs text-[var(--ether-on-surface)] placeholder:text-[var(--ether-on-surface-variant)]/50 focus:outline-none"
            autoFocus
          />
          <input
            type="time"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            className="w-20 rounded-md border border-[var(--ether-glass-border)] bg-transparent px-1.5 py-0.5 text-[10px] text-[var(--ether-on-surface)]"
          />
          <button type="button" onClick={handleAddEvent} className="rounded-lg bg-[var(--ether-primary)] px-2 py-1 text-[10px] font-medium text-[var(--ether-on-primary)]">
            Add
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowQuickAdd(true)}
          className="flex items-center gap-1.5 rounded-xl border border-dashed border-[var(--ether-glass-border)] px-3 py-2 text-xs text-[var(--ether-on-surface-variant)] transition hover:border-[var(--ether-primary)]/40 hover:bg-[var(--ether-control-hover)]"
        >
          <Plus size={12} />
          Quick add event
        </button>
      )}

      {/* Events list */}
      {events.length > 0 && (
        <div className="space-y-1">
          <WidgetText variant="label" tone="muted">Quick Events</WidgetText>
          {events.slice(-5).map((ev) => (
            <div key={ev.id} className="flex items-center justify-between rounded-lg border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60 px-2.5 py-1.5">
              <span className="text-xs text-[var(--ether-on-surface)]">{ev.title}</span>
              <span className="text-[10px] text-[var(--ether-on-surface-variant)]">{ev.date} {ev.time}</span>
            </div>
          ))}
        </div>
      )}
    </WidgetBody>
  );
};

export default CalendarFocused;
