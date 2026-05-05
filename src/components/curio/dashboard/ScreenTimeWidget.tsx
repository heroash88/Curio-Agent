import React, { useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  BrainCircuit,
  CalendarDays,
  Clock3,
  Eye,
  Gauge,
  Layers3,
  MessageSquareText,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import {
  DASHBOARD_ACTIVITY_MODULE_OPTIONS,
  type DashboardActivityModule,
  type DashboardWidget,
} from '../../../services/dashboardTypes';
import {
  type DashboardActivitySummary,
  useDashboardActivitySummary,
} from '../../../services/screenTimePersistence';
import { dashboardToastBus } from '../../../services/dashboardToastBus';
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
  useDashboardLayout,
} from '../../../utils/settings/dashboardSettings';
import { useWidgetAriaAnnouncer } from '../../../hooks/useWidgetAriaAnnouncer';
import WidgetShell from './WidgetShell';
import { WidgetCounter, WidgetText } from './widgetPrimitives';

type InsightTone = 'sky' | 'violet' | 'emerald' | 'amber' | 'rose' | 'slate';

interface InsightItem {
  id: DashboardActivityModule;
  label: string;
  value: string;
  detail: string;
  tone: InsightTone;
  icon: React.ReactNode;
  progress?: number;
  /** Widget type referenced by this insight (for tappable navigation). */
  referencedWidgetType?: string;
}

const DEFAULT_ACTIVITY_MODULES = DASHBOARD_ACTIVITY_MODULE_OPTIONS.map(
  (option) => option.id,
);

const TONE_STYLES: Record<
  InsightTone,
  { soft: string; icon: string; bar: string }
> = {
  sky: {
    soft: 'bg-sky-500/10 border-sky-500/20',
    icon: 'text-sky-500',
    bar: 'bg-sky-400',
  },
  violet: {
    soft: 'bg-violet-500/10 border-violet-500/20',
    icon: 'text-violet-500',
    bar: 'bg-violet-400',
  },
  emerald: {
    soft: 'bg-emerald-500/10 border-emerald-500/20',
    icon: 'text-emerald-500',
    bar: 'bg-emerald-400',
  },
  amber: {
    soft: 'bg-amber-500/10 border-amber-500/20',
    icon: 'text-amber-500',
    bar: 'bg-amber-400',
  },
  rose: {
    soft: 'bg-rose-500/10 border-rose-500/20',
    icon: 'text-rose-500',
    bar: 'bg-rose-400',
  },
  slate: {
    soft: 'bg-slate-500/10 border-slate-500/20',
    icon: 'text-[var(--ether-on-surface-variant)]',
    bar: 'bg-[var(--ether-on-surface-variant)]',
  },
};

const isActivityModule = (module: unknown): module is DashboardActivityModule =>
  DEFAULT_ACTIVITY_MODULES.includes(module as DashboardActivityModule);

const getSelectedModules = (
  modules?: DashboardActivityModule[],
): DashboardActivityModule[] => {
  if (!Array.isArray(modules) || modules.length === 0) {
    return DEFAULT_ACTIVITY_MODULES;
  }
  const selected = modules.filter(isActivityModule);
  return selected.length > 0 ? selected : DEFAULT_ACTIVITY_MODULES;
};

const formatDuration = (milliseconds: number) => {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const formatCompactDuration = (milliseconds: number) => {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round((minutes / 60) * 10) / 10}h`;
};

const getPercentChangeLabel = (summary: DashboardActivitySummary) => {
  const previous = summary.previousDay?.dashboardMs || 0;
  const current = summary.today.dashboardMs;
  if (previous <= 0 && current <= 0) return 'No trend yet';
  if (previous <= 0) return 'New activity';
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return 'Even with yesterday';
  return `${change > 0 ? '+' : ''}${change}% vs yesterday`;
};

const buildInsightItems = (
  summary: DashboardActivitySummary,
): Record<DashboardActivityModule, InsightItem> => {
  const maxWeekMs = Math.max(
    1,
    ...summary.week.map((day) => day.dashboardMs),
  );
  const topWidget = summary.topWidget;
  const activeHour = summary.activeHour;
  const topCardType = summary.topCardType;

  return {
    dashboardTime: {
      id: 'dashboardTime',
      label: 'Dashboard time',
      value: formatDuration(summary.today.dashboardMs),
      detail: getPercentChangeLabel(summary),
      tone: 'sky',
      icon: <Clock3 size={15} />,
      progress: Math.min(1, summary.today.dashboardMs / Math.max(60 * 60_000, maxWeekMs)),
    },
    aiMessages: {
      id: 'aiMessages',
      label: 'AI messages',
      value: String(summary.today.aiMessages),
      detail: `${summary.today.textMessages} typed · ${summary.today.voiceMessages} spoken`,
      tone: 'violet',
      icon: <MessageSquareText size={15} />,
      progress: Math.min(1, summary.today.aiMessages / 12),
    },
    responseCards: {
      id: 'responseCards',
      label: 'Cards created',
      value: String(summary.today.responseCards),
      detail: topCardType ? `${topCardType.type} led today` : 'Tool cards shown by Curio',
      tone: 'emerald',
      icon: <Layers3 size={15} />,
      progress: Math.min(1, summary.today.responseCards / 12),
    },
    widgetInteractions: {
      id: 'widgetInteractions',
      label: 'Widget taps',
      value: String(summary.today.widgetInteractions),
      detail: topWidget ? `${topWidget.label} used most` : 'Clicks inside widgets',
      tone: 'amber',
      icon: <MousePointerClick size={15} />,
      progress: Math.min(1, summary.today.widgetInteractions / 24),
    },
    dashboardVisits: {
      id: 'dashboardVisits',
      label: 'Visits',
      value: String(summary.today.dashboardVisits),
      detail: 'Dashboard sessions opened',
      tone: 'sky',
      icon: <Eye size={15} />,
      progress: Math.min(1, summary.today.dashboardVisits / 8),
    },
    topWidget: {
      id: 'topWidget',
      label: 'Top widget',
      value: topWidget?.label || 'None yet',
      detail: topWidget ? `${topWidget.count} interaction${topWidget.count === 1 ? '' : 's'}` : 'Tap widgets to build this',
      tone: 'emerald',
      icon: <Trophy size={15} />,
      referencedWidgetType: topWidget?.type,
    },
    activeHour: {
      id: 'activeHour',
      label: 'Active hour',
      value: activeHour?.label || 'No peak yet',
      detail: activeHour ? `${formatCompactDuration(activeHour.durationMs)} active` : 'Tracks visible dashboard time',
      tone: 'amber',
      icon: <CalendarDays size={15} />,
    },
    weeklyTrend: {
      id: 'weeklyTrend',
      label: 'Weekly trend',
      value: formatDuration(summary.weeklyTotals.dashboardMs),
      detail: `${summary.weeklyTotals.aiMessages} AI messages this week`,
      tone: 'sky',
      icon: <BarChart3 size={15} />,
      progress: Math.min(1, summary.weeklyTotals.dashboardMs / (7 * 60 * 60_000)),
    },
    focusScore: {
      id: 'focusScore',
      label: 'Focus score',
      value: `${summary.focusScore}%`,
      detail: summary.focusScore > 70 ? 'Calm dashboard usage' : 'High interaction density',
      tone: summary.focusScore > 70 ? 'emerald' : summary.focusScore > 0 ? 'amber' : 'slate',
      icon: <Gauge size={15} />,
      progress: summary.focusScore / 100,
    },
    localPrivacy: {
      id: 'localPrivacy',
      label: 'Privacy',
      value: 'Local only',
      detail: 'Stored in this browser',
      tone: 'slate',
      icon: <ShieldCheck size={15} />,
    },
  };
};

const ScreenTimeWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const summary = useDashboardActivitySummary();
  const selectedModules = getSelectedModules(widget.config.activityModules);
  const insightItems = useMemo(() => buildInsightItems(summary), [summary]);
  const visibleItems = selectedModules.map((module) => insightItems[module]);
  const primaryTime = formatDuration(summary.today.dashboardMs);
  const maxWeekMs = Math.max(1, ...summary.week.map((day) => day.dashboardMs));

  const boardInteractivity = useDashboardInteractivitySettings();
  const rollingEnabled = effectiveToggle(
    'rollingNumbersEnabled',
    boardInteractivity,
    widget.config,
  );
  const insightsActionsEnabled = effectiveToggle(
    'insightsActionsEnabled',
    boardInteractivity,
    widget.config,
  );

  const activePageWidgets = useDashboardLayout();

  const handleInsightTap = useCallback(
    (item: InsightItem) => {
      if (!insightsActionsEnabled) return;
      if (!item.referencedWidgetType) return;

      // Find the widget on the active page matching this type
      const targetWidget = activePageWidgets.find(
        (w) => w.type === item.referencedWidgetType && w.enabled,
      );

      if (!targetWidget) {
        dashboardToastBus.show({
          id: `insights-missing-widget-${item.referencedWidgetType}`,
          label: 'Widget no longer on this page',
          tone: 'default',
          durationMs: 3000,
        });
        return;
      }

      // Dispatch scroll-to-widget event
      window.dispatchEvent(
        new CustomEvent('curio:dashboard-scroll-to-widget', {
          detail: { widgetId: targetWidget.id },
        }),
      );
    },
    [insightsActionsEnabled, activePageWidgets],
  );

  useWidgetAriaAnnouncer(
    widget.id,
    `Dashboard insights: ${summary.today.aiMessages} AI messages, ${summary.today.widgetInteractions} widget taps`,
  );

  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare accent="indigo" widget={widget}>
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
          <span className={`text-2xl font-semibold tabular-nums ${theme.onSurface}`}>
            {formatCompactDuration(summary.today.dashboardMs)}
          </span>
          <WidgetText variant="label" tone="muted" align="center">
            Insights
          </WidgetText>
          <span className={`text-[10px] font-semibold ${theme.onSurfaceVariant}`}>
            {summary.today.aiMessages} AI
          </span>
        </div>
      </WidgetShell>
    );
  }

  const showChart = size.pixelHeight >= 320;
  
  const moduleLimit =
    size.area <= 4
      ? (showChart ? 2 : 4)
      : size.area <= 6
        ? (showChart ? 4 : 6)
        : size.pixelHeight < 430
          ? 6
          : visibleItems.length;

  const shownItems = visibleItems.slice(0, moduleLimit);
  const hiddenCount = Math.max(0, visibleItems.length - shownItems.length);
  const gridClass = size.isWide && size.area >= 6 ? 'grid-cols-2' : 'grid-cols-1';

  return (
    <WidgetShell
      widget={widget}
      title="Curio Insights"
      icon={<BrainCircuit size={16} />}
      accent="indigo"
      bodyClassName="gap-3"
      rightSlot={
        <WidgetText variant="label" tone="muted" className="rounded-full bg-[var(--ether-surface-container-high)] px-2.5 py-1">
          Today
        </WidgetText>
      }
    >
      <div className="rounded-[1.35rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] p-3">
        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="min-w-0">
            <WidgetText variant="label" tone="muted">
              Dashboard activity
            </WidgetText>
            <div className={`mt-1 text-3xl font-semibold leading-none tabular-nums tracking-tight ${theme.onSurface}`}>
              {primaryTime}
            </div>
            <div className={`mt-1.5 text-xs font-medium ${theme.onSurfaceVariant}`}>
              {summary.today.aiMessages} AI messages · {summary.today.responseCards} cards
            </div>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/10 text-violet-500">
            <Sparkles size={20} />
          </span>
        </div>

        <AnimatePresence>
          {showChart && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 grid grid-cols-7 gap-1.5 relative z-10"
            >
              {summary.week.map((day) => {
                const ratio = day.dashboardMs / maxWeekMs;
                const barHeightPercent = Math.max(8, Math.round(100 * ratio));
                const label = new Date(`${day.date}T00:00:00`).toLocaleDateString([], {
                  weekday: 'narrow',
                });
                return (
                  <div key={day.date} className="flex min-w-0 flex-col items-center gap-1.5">
                    <div className="flex h-12 w-full max-w-[28px] mx-auto items-end justify-center rounded-full bg-[var(--ether-surface-container-high)]/50 p-1 hover:bg-[var(--ether-surface-container-high)] transition-colors">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${barHeightPercent}%` }}
                        transition={{ type: "spring", bounce: 0.2, duration: 0.8 }}
                        className="w-full rounded-full bg-gradient-to-t from-[var(--ether-primary)]/80 to-[var(--ether-primary)] shadow-sm"
                        title={`${label}: ${formatDuration(day.dashboardMs)}`}
                      />
                    </div>
                    <WidgetText variant="label" tone="muted">
                      {label}
                    </WidgetText>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div
        data-testid="activity-insight-modules"
        className={`grid min-h-0 flex-1 gap-2 overflow-y-auto pr-0.5 ${gridClass} content-start`}
      >
        <AnimatePresence mode="popLayout">
          {shownItems.map((item, index) => {
            const tone = TONE_STYLES[item.tone];
            const isTappable = insightsActionsEnabled && !!item.referencedWidgetType;
            return (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                key={item.id}
                data-testid={`activity-module-${item.id}`}
                role={isTappable ? 'button' : undefined}
                tabIndex={isTappable ? 0 : undefined}
                onClick={isTappable ? () => handleInsightTap(item) : undefined}
                onKeyDown={isTappable ? (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleInsightTap(item);
                  }
                } : undefined}
                className={`group min-w-0 rounded-[1.15rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3 shadow-sm transition-all hover:bg-[var(--ether-surface-container-high)] hover:shadow-md hover:-translate-y-0.5${isTappable ? ' cursor-pointer' : ''}`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${tone.soft} ${tone.icon} transition-colors bg-[var(--ether-surface-container)]`}>
                    {item.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <WidgetText variant="label" tone="muted">
                      {item.label}
                    </WidgetText>
                    <div className={`mt-0.5 truncate text-sm font-semibold tracking-tight ${theme.onSurface}`}>
                      {rollingEnabled && /^\d+$/.test(item.value) ? (
                        <WidgetCounter
                          value={Number(item.value)}
                          ariaLabel={`${item.label} ${item.value}`}
                        />
                      ) : (
                        item.value
                      )}
                    </div>
                    <div className={`mt-1 truncate text-[11px] font-medium opacity-80 ${theme.onSurfaceVariant}`}>
                      {item.detail}
                    </div>
                  </div>
                </div>
                {item.progress != null && !size.isCompact && (
                  <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--ether-surface-container-high)]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round(Math.max(0, Math.min(1, item.progress)) * 100)}%` }}
                      transition={{ duration: 1, delay: 0.2 }}
                      className={`h-full rounded-full ${tone.bar} shadow-sm`}
                    />
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {hiddenCount > 0 && (
          <motion.div 
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`rounded-[1.15rem] border border-dashed border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)]/50 p-3 text-center`}
          >
            <WidgetText variant="label" tone="muted" align="center">
              +{hiddenCount} more insights
            </WidgetText>
          </motion.div>
        )}
      </div>
    </WidgetShell>
  );
};

export default ScreenTimeWidget;
