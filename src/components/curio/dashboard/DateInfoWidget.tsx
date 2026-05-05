import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useSyncedDashboardTime } from '../../../hooks/useSyncedDashboardTime';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type {
  DashboardDateInfoImportantDate,
  DashboardDateInfoMetric,
  DashboardWidget,
  DashboardWidgetConfig,
} from '../../../services/dashboardTypes';
import WidgetShell from './WidgetShell';
import { WidgetText } from './widgetPrimitives';
import { IconCalendar } from './widgetIcons';

const MS_PER_DAY = 86_400_000;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DEFAULT_METRICS: DashboardDateInfoMetric[] = [
  'dayOfYear',
  'daysLeft',
  'calendarWeek',
  'isoWeek',
  'yearProgress',
  'fiscalWeek',
];

const dateOnly = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const isSameDate = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const getDayOfYear = (date: Date) => {
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.floor((dateOnly(date).getTime() - start.getTime()) / MS_PER_DAY) + 1;
};

const getDaysInYear = (year: number) =>
  Math.round((new Date(year + 1, 0, 1).getTime() - new Date(year, 0, 1).getTime()) / MS_PER_DAY);

const getDaysInMonth = (year: number, monthIndex: number) =>
  new Date(year, monthIndex + 1, 0).getDate();

const getCalendarWeek = (date: Date) => {
  const start = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = getDayOfYear(date);
  return Math.floor((dayOfYear + start.getDay() - 1) / 7) + 1;
};

const getWeekStart = (date: Date) => {
  const start = dateOnly(date);
  start.setDate(start.getDate() - start.getDay());
  return start;
};

const getIsoWeek = (date: Date) => {
  const d = dateOnly(date);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d.getTime() - yearStart.getTime()) / MS_PER_DAY) + 1) / 7);
};

const getQuarter = (date: Date) => Math.floor(date.getMonth() / 3) + 1;

const getFiscalInfo = (date: Date, startMonth: number) => {
  const normalizedStartMonth = Math.max(1, Math.min(12, Math.round(startMonth || 1))) - 1;
  const startYear = date.getMonth() >= normalizedStartMonth
    ? date.getFullYear()
    : date.getFullYear() - 1;
  const fiscalStart = new Date(startYear, normalizedStartMonth, 1);
  const fiscalEnd = new Date(startYear + 1, normalizedStartMonth, 1);
  const fiscalDay = Math.floor((dateOnly(date).getTime() - fiscalStart.getTime()) / MS_PER_DAY) + 1;
  const fiscalDays = Math.round((fiscalEnd.getTime() - fiscalStart.getTime()) / MS_PER_DAY);
  const monthOffset = ((date.getMonth() - normalizedStartMonth) + 12) % 12;

  return {
    fiscalYear: startYear + 1,
    fiscalQuarter: Math.floor(monthOffset / 3) + 1,
    fiscalWeek: Math.ceil(fiscalDay / 7),
    fiscalDay,
    fiscalDaysLeft: fiscalDays - fiscalDay,
    fiscalProgress: Math.round((fiscalDay / fiscalDays) * 100),
    startMonth: normalizedStartMonth + 1,
  };
};

const parseImportantDate = (item: DashboardDateInfoImportantDate, year: number) => {
  const value = item.date.trim();
  const parts = value.split('-').map((part) => Number(part));
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return new Date(year, parts[0] - 1, parts[1]);
  }
  return null;
};

const getImportantDateKeys = (items: DashboardDateInfoImportantDate[], year: number) => new Set(
  items.flatMap((item) => {
    const parsed = parseImportantDate(item, year);
    if (!parsed) return [];
    if (!item.recurringAnnual && parsed.getFullYear() !== year) return [];
    return [`${parsed.getMonth()}-${parsed.getDate()}`];
  }),
);

type CalendarDayCell = {
  date: Date;
  inMonth: boolean;
  important: boolean;
};

type ExpandedCalendarView = 'week' | 'month' | 'year';

const getMonthCalendarWeeks = (
  year: number,
  monthIndex: number,
  importantDates: DashboardDateInfoImportantDate[],
) => {
  const firstDay = new Date(year, monthIndex, 1);
  const firstGridDay = new Date(year, monthIndex, 1 - firstDay.getDay());
  const importantKeys = getImportantDateKeys(importantDates, year);

  return Array.from({ length: 6 }).map((_, weekIndex) => {
    const weekStart = new Date(firstGridDay);
    weekStart.setDate(firstGridDay.getDate() + weekIndex * 7);
    return {
      weekNumber: getCalendarWeek(weekStart),
      days: Array.from({ length: 7 }).map((__, dayIndex): CalendarDayCell => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + dayIndex);
        return {
          date,
          inMonth: date.getMonth() === monthIndex,
          important: importantKeys.has(`${date.getMonth()}-${date.getDate()}`),
        };
      }),
    };
  });
};

const getWeekDays = (date: Date, importantDates: DashboardDateInfoImportantDate[]) => {
  const start = getWeekStart(date);
  const importantKeys = getImportantDateKeys(importantDates, date.getFullYear());
  return Array.from({ length: 7 }).map((_, dayIndex) => {
    const day = new Date(start);
    day.setDate(start.getDate() + dayIndex);
    return {
      date: day,
      important: importantKeys.has(`${day.getMonth()}-${day.getDate()}`),
    };
  });
};

const shiftCalendarDate = (date: Date, view: ExpandedCalendarView, direction: number) => {
  if (view === 'week') {
    const next = new Date(date);
    next.setDate(next.getDate() + direction * 7);
    return next;
  }
  if (view === 'year') {
    return new Date(date.getFullYear() + direction, date.getMonth(), date.getDate());
  }
  const targetMonth = date.getMonth() + direction;
  const targetYear = date.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const targetDay = Math.min(date.getDate(), getDaysInMonth(targetYear, normalizedMonth));
  return new Date(targetYear, normalizedMonth, targetDay);
};

const formatMonthYear = (date: Date) =>
  date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

const getUpcomingImportantDates = (
  items: DashboardDateInfoImportantDate[],
  now: Date,
) => {
  const today = dateOnly(now);
  return items
    .map((item) => {
      const parsed = parseImportantDate(item, now.getFullYear());
      if (!parsed) return null;
      let nextDate = parsed;
      if (item.recurringAnnual && nextDate < today) {
        nextDate = new Date(now.getFullYear() + 1, parsed.getMonth(), parsed.getDate());
      }
      const daysUntil = Math.ceil((dateOnly(nextDate).getTime() - today.getTime()) / MS_PER_DAY);
      return { item, date: nextDate, daysUntil };
    })
    .filter((entry): entry is { item: DashboardDateInfoImportantDate; date: Date; daysUntil: number } =>
      Boolean(entry && entry.daysUntil >= 0),
    )
    .sort((a, b) => a.daysUntil - b.daysUntil);
};

const getDateInfo = (now: Date, fiscalStartMonth: number) => {
  const dayOfYear = getDayOfYear(now);
  const totalDays = getDaysInYear(now.getFullYear());
  const daysRemaining = totalDays - dayOfYear;
  const daysInMonth = getDaysInMonth(now.getFullYear(), now.getMonth());
  const monthDay = now.getDate();
  const fiscal = getFiscalInfo(now, fiscalStartMonth);

  return {
    dayOfYear,
    daysRemaining,
    calendarWeek: getCalendarWeek(now),
    isoWeek: getIsoWeek(now),
    yearProgress: Math.round((dayOfYear / totalDays) * 100),
    monthProgress: Math.round((monthDay / daysInMonth) * 100),
    quarter: getQuarter(now),
    daysInMonth,
    year: now.getFullYear(),
    monthDay,
    fiscal,
  };
};

const getMetricValue = (
  key: DashboardDateInfoMetric,
  info: ReturnType<typeof getDateInfo>,
) => {
  switch (key) {
    case 'dayOfYear': return { label: 'Day of year', value: String(info.dayOfYear) };
    case 'daysLeft': return { label: 'Days left', value: String(info.daysRemaining) };
    case 'calendarWeek': return { label: 'Calendar week', value: String(info.calendarWeek) };
    case 'isoWeek': return { label: 'ISO week', value: String(info.isoWeek) };
    case 'yearProgress': return { label: 'Year progress', value: `${info.yearProgress}%` };
    case 'monthProgress': return { label: 'Month progress', value: `${info.monthProgress}%` };
    case 'quarter': return { label: 'Quarter', value: `Q${info.quarter}` };
    case 'daysInMonth': return { label: 'Days in month', value: String(info.daysInMonth) };
    case 'fiscalYear': return { label: 'Fiscal year', value: `FY${info.fiscal.fiscalYear}` };
    case 'fiscalQuarter': return { label: 'Fiscal quarter', value: `FQ${info.fiscal.fiscalQuarter}` };
    case 'fiscalWeek': return { label: 'Fiscal week', value: String(info.fiscal.fiscalWeek) };
    case 'fiscalDaysLeft': return { label: 'Fiscal left', value: String(info.fiscal.fiscalDaysLeft) };
    default: return { label: 'Date', value: '--' };
  }
};

const normalizeMetrics = (metrics: unknown): DashboardDateInfoMetric[] =>
  Array.isArray(metrics) && metrics.length > 0
    ? metrics.filter((metric): metric is DashboardDateInfoMetric => typeof metric === 'string')
    : DEFAULT_METRICS;

const normalizeImportantDates = (items: unknown): DashboardDateInfoImportantDate[] =>
  Array.isArray(items)
    ? items
        .filter((item): item is DashboardDateInfoImportantDate =>
          Boolean(item && typeof item === 'object' && 'label' in item && 'date' in item),
        )
        .map((item) => ({
          id: String(item.id || `${item.label}-${item.date}`),
          label: String(item.label || 'Important date'),
          date: String(item.date || ''),
          recurringAnnual: item.recurringAnnual === true,
          color: item.color ? String(item.color) : undefined,
        }))
    : [];

const formatDateShort = (date: Date) =>
  date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const formatDateLong = (date: Date) =>
  date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

const DateMetricCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="date-info-metric-card">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const MiniMonthCalendar: React.FC<{
  now: Date;
  importantDates: DashboardDateInfoImportantDate[];
  onOpen: () => void;
}> = ({ now, importantDates, onOpen }) => {
  const weeks = getMonthCalendarWeeks(now.getFullYear(), now.getMonth(), importantDates);
  const monthName = MONTH_NAMES[now.getMonth()];

  return (
    <button
      type="button"
      data-testid="date-info-mini-month"
      className="date-info-mini-month"
      aria-label={`Open expanded ${monthName} ${now.getFullYear()} calendar`}
      onClick={onOpen}
    >
      <span className="date-info-mini-month-title">{monthName.toUpperCase()}</span>
      <span className="date-info-mini-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </span>
      <span className="date-info-mini-grid">
        {weeks.flatMap((week) =>
          week.days.map((day) => {
            const selected = isSameDate(day.date, now);
            return (
              <span
                key={day.date.toISOString()}
                data-testid={selected ? 'date-info-mini-selected-day' : undefined}
                className={`date-info-mini-day ${day.inMonth ? '' : 'date-info-mini-day-outside'} ${selected ? 'date-info-mini-day-selected' : ''} ${day.important ? 'date-info-mini-day-important' : ''}`}
              >
                {day.inMonth ? day.date.getDate() : ''}
              </span>
            );
          }),
        )}
      </span>
    </button>
  );
};

const MonthCalendarGrid: React.FC<{
  visibleDate: Date;
  selectedDate: Date;
  today: Date;
  importantDates: DashboardDateInfoImportantDate[];
  showWeekNumbers: boolean;
  onSelectDate?: (date: Date) => void;
  compact?: boolean;
}> = ({
  visibleDate,
  selectedDate,
  today,
  importantDates,
  showWeekNumbers,
  onSelectDate,
  compact = false,
}) => {
  const weeks = getMonthCalendarWeeks(visibleDate.getFullYear(), visibleDate.getMonth(), importantDates);

  return (
    <div
      className={`date-info-expanded-month-grid ${showWeekNumbers ? 'date-info-expanded-month-grid-weeks' : ''} ${compact ? 'date-info-expanded-month-grid-compact' : ''}`}
      aria-hidden={compact || undefined}
    >
      {showWeekNumbers && <span className="date-info-expanded-week-label">WK</span>}
      {WEEKDAY_LABELS.map((label, index) => (
        <span key={`${label}-${index}`} className="date-info-expanded-weekday">
          {label}
        </span>
      ))}
      {weeks.flatMap((week) => [
        showWeekNumbers ? (
          <span key={`week-${week.weekNumber}-${week.days[0].date.toISOString()}`} className="date-info-expanded-week-number">
            {week.weekNumber}
          </span>
        ) : null,
        ...week.days.map((day) => {
          const selected = isSameDate(day.date, selectedDate);
          const isToday = isSameDate(day.date, today);
          if (compact) {
            return (
              <span
                key={day.date.toISOString()}
                className={`date-info-expanded-day ${day.inMonth ? '' : 'date-info-expanded-day-outside'} ${selected ? 'date-info-expanded-day-selected' : ''} ${isToday ? 'date-info-expanded-day-today' : ''} ${day.important ? 'date-info-expanded-day-important' : ''}`}
              >
                {day.inMonth ? day.date.getDate() : ''}
              </span>
            );
          }
          return (
            <button
              key={day.date.toISOString()}
              type="button"
              className={`date-info-expanded-day ${day.inMonth ? '' : 'date-info-expanded-day-outside'} ${selected ? 'date-info-expanded-day-selected' : ''} ${isToday ? 'date-info-expanded-day-today' : ''} ${day.important ? 'date-info-expanded-day-important' : ''}`}
              onClick={() => onSelectDate?.(dateOnly(day.date))}
              aria-label={`${day.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${selected ? ', selected' : ''}`}
            >
              {day.date.getDate()}
            </button>
          );
        }),
      ])}
    </div>
  );
};

const ExpandedCalendarDialog: React.FC<{
  now: Date;
  selectedDate: Date;
  visibleDate: Date;
  view: ExpandedCalendarView;
  importantDates: DashboardDateInfoImportantDate[];
  showWeekNumbers: boolean;
  onClose: () => void;
  onSelectDate: (date: Date) => void;
  onSetVisibleDate: (date: Date) => void;
  onSetView: (view: ExpandedCalendarView) => void;
  onToggleWeekNumbers: () => void;
}> = ({
  now,
  selectedDate,
  visibleDate,
  view,
  importantDates,
  showWeekNumbers,
  onClose,
  onSelectDate,
  onSetVisibleDate,
  onSetView,
  onToggleWeekNumbers,
}) => {
  const title = view === 'year'
    ? String(visibleDate.getFullYear())
    : formatMonthYear(visibleDate);
  const navUnit = view === 'year' ? 'year' : view === 'week' ? 'week' : 'month';
  const weekDays = getWeekDays(visibleDate, importantDates);
  const selectedWeek = getCalendarWeek(visibleDate);

  return (
    <div className="date-info-expanded-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="date-info-expanded-calendar"
        role="dialog"
        aria-modal="true"
        aria-label="Expanded date calendar"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="date-info-expanded-header">
          <div>
            <span>Calendar</span>
            <strong>{title}</strong>
          </div>
          <button type="button" className="date-info-expanded-close" aria-label="Close expanded calendar" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="date-info-expanded-toolbar">
          <div className="date-info-expanded-nav">
            <button
              type="button"
              aria-label={`Previous ${navUnit}`}
              onClick={() => onSetVisibleDate(shiftCalendarDate(visibleDate, view, -1))}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label={`Next ${navUnit}`}
              onClick={() => onSetVisibleDate(shiftCalendarDate(visibleDate, view, 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="date-info-expanded-tabs" role="tablist" aria-label="Calendar view">
            {(['week', 'month', 'year'] as ExpandedCalendarView[]).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={view === item}
                className={view === item ? 'date-info-expanded-tab-active' : ''}
                onClick={() => onSetView(item)}
              >
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`date-info-week-toggle ${showWeekNumbers ? 'date-info-week-toggle-active' : ''}`}
            onClick={onToggleWeekNumbers}
          >
            {showWeekNumbers ? 'Hide week numbers' : 'Show week numbers'}
          </button>
        </div>

        {view === 'week' && (
          <div className="date-info-expanded-week-view" data-testid="date-info-expanded-week-view">
            <div className="date-info-expanded-week-summary">
              <span>Calendar week</span>
              <strong>{selectedWeek}</strong>
            </div>
            <div className="date-info-expanded-week-days">
              {weekDays.map((day) => {
                const selected = isSameDate(day.date, selectedDate);
                const isToday = isSameDate(day.date, now);
                return (
                  <button
                    key={day.date.toISOString()}
                    type="button"
                    className={`${selected ? 'date-info-expanded-week-day-selected' : ''} ${isToday ? 'date-info-expanded-week-day-today' : ''} ${day.important ? 'date-info-expanded-week-day-important' : ''}`}
                    onClick={() => {
                      onSelectDate(dateOnly(day.date));
                      onSetVisibleDate(dateOnly(day.date));
                    }}
                  >
                    <span>{WEEKDAY_LABELS[day.date.getDay()]}</span>
                    <strong>{day.date.getDate()}</strong>
                    <em>{MONTH_LABELS[day.date.getMonth()]}</em>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === 'month' && (
          <MonthCalendarGrid
            visibleDate={visibleDate}
            selectedDate={selectedDate}
            today={now}
            importantDates={importantDates}
            showWeekNumbers={showWeekNumbers}
            onSelectDate={(date) => {
              onSelectDate(date);
              onSetVisibleDate(date);
            }}
          />
        )}

        {view === 'year' && (
          <div className="date-info-expanded-year-view" data-testid="date-info-expanded-year-view">
            {MONTH_NAMES.map((month, monthIndex) => {
              const monthDate = new Date(visibleDate.getFullYear(), monthIndex, 1);
              return (
                <button
                  key={month}
                  type="button"
                  aria-label={`Open ${month} ${visibleDate.getFullYear()} month view`}
                  className={`date-info-expanded-year-month ${monthIndex === now.getMonth() && visibleDate.getFullYear() === now.getFullYear() ? 'date-info-expanded-year-month-current' : ''}`}
                  onClick={() => {
                    const next = new Date(visibleDate.getFullYear(), monthIndex, Math.min(selectedDate.getDate(), getDaysInMonth(visibleDate.getFullYear(), monthIndex)));
                    onSetVisibleDate(next);
                    onSetView('month');
                  }}
                >
                  <span>{month}</span>
                  <MonthCalendarGrid
                    visibleDate={monthDate}
                    selectedDate={selectedDate}
                    today={now}
                    importantDates={importantDates}
                    showWeekNumbers={false}
                    compact
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const YearCalendar: React.FC<{
  year: number;
  now: Date;
  importantDates: DashboardDateInfoImportantDate[];
}> = ({ year, now, importantDates }) => {
  const importantKeys = getImportantDateKeys(importantDates, year);
  const todayKey = `${now.getMonth()}-${now.getDate()}`;

  return (
    <div data-testid="date-info-year-calendar" className="date-info-year-calendar">
      {MONTH_LABELS.map((month, monthIndex) => {
        const dayCount = getDaysInMonth(year, monthIndex);
        const hasImportantDate = Array.from(importantKeys).some((key) => key.startsWith(`${monthIndex}-`));
        return (
          <div
            key={month}
            data-testid="date-info-month"
            className={`date-info-month ${monthIndex === now.getMonth() ? 'date-info-month-current' : ''} ${hasImportantDate ? 'date-info-month-marked' : ''}`}
          >
            <div className="date-info-month-label">{month}</div>
            <div className="date-info-month-days">
              {Array.from({ length: dayCount }).map((_, dayIndex) => {
                const day = dayIndex + 1;
                const key = `${monthIndex}-${day}`;
                const dayDate = new Date(year, monthIndex, day);
                return (
                  <span
                    key={day}
                    className={`${key === todayKey ? 'date-info-day-today' : ''} ${importantKeys.has(key) ? 'date-info-day-important' : ''}`}
                    aria-label={formatDateLong(dayDate)}
                  >
                    {day}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const DateInfoWidget: React.FC<{
  widget: DashboardWidget;
  onUpdateWidgetConfig?: (widgetId: string, patch: Partial<DashboardWidgetConfig>) => void;
}> = ({ widget, onUpdateWidgetConfig }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const now = useSyncedDashboardTime('minute');
  const [draftLabel, setDraftLabel] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [draftRecurring, setDraftRecurring] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [expandedCalendarView, setExpandedCalendarView] = useState<ExpandedCalendarView>('month');
  const [selectedDate, setSelectedDate] = useState(() => dateOnly(now));
  const [visibleCalendarDate, setVisibleCalendarDate] = useState(() => dateOnly(now));
  const [showWeekNumbers, setShowWeekNumbers] = useState(widget.config.dateInfoShowWeekNumbers === true);
  const fiscalStartMonth = Number(widget.config.dateInfoFiscalYearStartMonth || 1);
  const metrics = normalizeMetrics(widget.config.dateInfoMetrics);
  const importantDates = normalizeImportantDates(widget.config.dateInfoImportantDates);
  const info = useMemo(() => getDateInfo(now, fiscalStartMonth), [fiscalStartMonth, now]);
  const upcomingDates = useMemo(
    () => getUpcomingImportantDates(importantDates, now).slice(0, size.isCompact ? 2 : 4),
    [importantDates, now, size.isCompact],
  );
  const showEditor = Boolean(onUpdateWidgetConfig) && !size.isCompact && size.pixelHeight >= 320;
  const visibleMetrics = metrics.slice(0, size.isCompact ? 4 : 8);

  useEffect(() => {
    setShowWeekNumbers(widget.config.dateInfoShowWeekNumbers === true);
  }, [widget.config.dateInfoShowWeekNumbers]);

  useEffect(() => {
    if (calendarOpen) return;
    const today = dateOnly(now);
    setSelectedDate((current) => isSameDate(current, today) ? current : today);
    setVisibleCalendarDate((current) => isSameDate(current, today) ? current : today);
  }, [calendarOpen, now]);

  useEffect(() => {
    if (!calendarOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCalendarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [calendarOpen]);

  const openExpandedCalendar = () => {
    const today = dateOnly(now);
    setSelectedDate(today);
    setVisibleCalendarDate(today);
    setExpandedCalendarView('month');
    setCalendarOpen(true);
  };

  const toggleWeekNumbers = () => {
    const next = !showWeekNumbers;
    setShowWeekNumbers(next);
    onUpdateWidgetConfig?.(widget.id, { dateInfoShowWeekNumbers: next });
  };

  const addImportantDate = () => {
    const label = draftLabel.trim();
    const date = draftDate.trim();
    if (!label || !date) return;
    const nextDates: DashboardDateInfoImportantDate[] = [
      ...importantDates,
      {
        id: `date_${Date.now().toString(36)}`,
        label,
        date,
        recurringAnnual: draftRecurring,
      },
    ];
    onUpdateWidgetConfig?.(widget.id, { dateInfoImportantDates: nextDates });
    setDraftLabel('');
    setDraftDate('');
    setDraftRecurring(false);
  };

  const removeImportantDate = (id: string) => {
    onUpdateWidgetConfig?.(widget.id, {
      dateInfoImportantDates: importantDates.filter((item) => item.id !== id),
    });
  };

  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare accent="violet" widget={widget} glowEnabled>
        <div className="dashboard-date-info-widget dashboard-date-info-tiny flex flex-1 flex-col items-center justify-center overflow-hidden rounded-[inherit]">
          <span className={`text-4xl font-bold tabular-nums ${theme.onSurface}`}>
            {now.getDate()}
          </span>
          <WidgetText variant="label" tone="muted" align="center">
            {MONTH_LABELS[now.getMonth()]} {info.year}
          </WidgetText>
        </div>
      </WidgetShell>
    );
  }

  return (
    <>
      <WidgetShell
        title="Date Info"
        icon={<IconCalendar />}
        accent="violet"
        widget={widget}
        glowEnabled
        bodyClassName="overflow-hidden"
      >
        <div
          data-testid="date-info-panel"
          className="dashboard-date-info-widget flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl"
          style={{ '--year-progress': `${info.yearProgress}%` } as React.CSSProperties}
        >
          <div className="date-info-hero">
            <div className="min-w-0">
              <div className="date-info-kicker">
                {now.toLocaleDateString(undefined, { weekday: 'long' })}
              </div>
              <div className="date-info-date">
                <span>{now.getDate()}</span>
                <div>
                  <strong>{MONTH_LABELS[now.getMonth()]}</strong>
                  <em>{info.year}</em>
                </div>
              </div>
            </div>
            <div className="date-info-progress-orb" aria-label={`${info.yearProgress}% through ${info.year}`} role="img">
              <span>{info.yearProgress}%</span>
            </div>
          </div>

          <div className="date-info-scroll dashboard-widget-touch-scroll">
            <MiniMonthCalendar
              now={now}
              importantDates={importantDates}
              onOpen={openExpandedCalendar}
            />

            <div className="date-info-metric-grid">
              {visibleMetrics.map((metric) => {
                const item = getMetricValue(metric, info);
                return <DateMetricCard key={metric} label={item.label} value={item.value} />;
              })}
            </div>

            <div className="date-info-fiscal-strip">
              <span>Fiscal calendar</span>
              <strong>FY{info.fiscal.fiscalYear} starts {MONTH_LABELS[info.fiscal.startMonth - 1]}</strong>
            </div>

            <YearCalendar year={info.year} now={now} importantDates={importantDates} />

            <div className="date-info-events">
              <div className="date-info-section-title">Important dates</div>
              {upcomingDates.length === 0 ? (
                <p className={`date-info-empty ${theme.muted}`}>Add dates to mark them on the year map.</p>
              ) : (
                upcomingDates.map(({ item, date, daysUntil }) => (
                  <div key={item.id} className="date-info-event-row">
                    <div className="min-w-0">
                      <span>{item.label}</span>
                      <strong>{formatDateShort(date)} - {daysUntil === 0 ? 'Today' : `${daysUntil}d`}</strong>
                    </div>
                    {onUpdateWidgetConfig && (
                      <button
                        type="button"
                        aria-label={`Remove ${item.label}`}
                        onClick={() => removeImportantDate(item.id)}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {showEditor && (
              <form
                className="date-info-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  addImportantDate();
                }}
              >
                <input
                  aria-label="Important date title"
                  value={draftLabel}
                  onChange={(event) => setDraftLabel(event.target.value)}
                  placeholder="Label"
                />
                <input
                  aria-label="Important date"
                  type="date"
                  value={draftDate}
                  onChange={(event) => setDraftDate(event.target.value)}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={draftRecurring}
                    onChange={(event) => setDraftRecurring(event.target.checked)}
                  />
                  Annual
                </label>
                <button type="submit" aria-label="Add important date">
                  <Plus size={14} />
                </button>
              </form>
            )}
          </div>
        </div>
      </WidgetShell>
      {calendarOpen && typeof document !== 'undefined' && createPortal(
        <ExpandedCalendarDialog
          now={dateOnly(now)}
          selectedDate={selectedDate}
          visibleDate={visibleCalendarDate}
          view={expandedCalendarView}
          importantDates={importantDates}
          showWeekNumbers={showWeekNumbers}
          onClose={() => setCalendarOpen(false)}
          onSelectDate={setSelectedDate}
          onSetVisibleDate={setVisibleCalendarDate}
          onSetView={setExpandedCalendarView}
          onToggleWeekNumbers={toggleWeekNumbers}
        />,
        document.body,
      )}
    </>
  );
};

export default React.memo(DateInfoWidget);
