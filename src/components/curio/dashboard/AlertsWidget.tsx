import React, { useCallback, useMemo } from "react";
import { BellRing, CheckCircle2, Info, PackageCheck, ShieldAlert } from "lucide-react";

// TODO: [Accessibility] Apply useListKeyboardNav to the notification list for full keyboard
// navigation (ArrowUp/Down, Enter to activate, Backspace to dismiss with undo toast).
// TODO: [Accessibility] Replace in-card icon buttons with WidgetIconButton for 44px targets.

import { useCardTheme } from "../../../hooks/useCardTheme";
import { useSwipeableRowActions } from "../../../hooks/useSwipeableRowActions";
import { useWidgetSize } from "../../../hooks/useWidgetSize";
import type { DashboardWidget } from "../../../services/dashboardTypes";
import { dashboardToastBus } from "../../../services/dashboardToastBus";
import { formatRelativeTime } from "../../../services/dashboardProviderUtils";
import {
  getNotificationCenterEntries,
  markNotificationCenterEntryRead,
  upsertNotificationCenterEntry,
  useNotificationCenterEntries,
  type NotificationCenterEntry,
} from "../../../services/notificationCenterStore";
import { getNotificationPriorityDetails } from "../../../services/notificationPriority";
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from "../../../utils/settings/dashboardSettings";
import WidgetShell from "./WidgetShell";
import { WidgetEmptyState, WidgetText } from "./widgetPrimitives";

const getAlertTone = (entry: NotificationCenterEntry) => {
  if (entry.priority === "high") {
    return {
      icon: <ShieldAlert size={17} />,
      card: "border-rose-500/35 bg-rose-500/10 text-rose-400",
      badge: "bg-rose-500/16 text-rose-400",
    };
  }
  if (entry.priority === "low") {
    return {
      icon: <PackageCheck size={17} />,
      card: "border-amber-500/35 bg-amber-500/10 text-amber-400",
      badge: "bg-amber-500/16 text-amber-400",
    };
  }
  return {
    icon: <Info size={17} />,
    card: "border-sky-500/30 bg-sky-500/10 text-sky-400",
    badge: "bg-sky-500/16 text-sky-400",
  };
};

const sourceLabel = (source: string) =>
  source.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());

const ALERT_TOAST_ID_PREFIX = 'alerts-widget-row-';

const archiveNotificationEntry = (id: string) => {
  const all = getNotificationCenterEntries();
  const entry = all.find((item) => item.id === id);
  if (!entry) return null;
  const index = all.indexOf(entry);
  const next = all.filter((item) => item.id !== id);
  try {
    localStorage.setItem('curio_notification_center_v1', JSON.stringify(next));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new CustomEvent('curio:settings-changed'));
    }
  } catch {
    // localStorage disabled or full — leave list unchanged.
  }
  return { entry, index };
};

/**
 * Row wrapper that adds horizontal swipe + keyboard commit handling to
 * a single alert card. Kept as its own component so hooks run in a
 * stable scope per row.
 */
interface AlertCardProps {
  entry: NotificationCenterEntry;
  swipeEnabled: boolean;
  undoToastsEnabled: boolean;
  className: string;
  ariaLabel: string;
  children: React.ReactNode;
  compact: boolean;
}

const AlertCard: React.FC<AlertCardProps> = ({
  entry,
  swipeEnabled,
  undoToastsEnabled,
  className,
  ariaLabel,
  children,
  compact,
}) => {
  void compact;
  const onPrimaryCommit = useCallback(() => {
    if (!entry.unread) return;
    markNotificationCenterEntryRead(entry.id);
    if (!undoToastsEnabled) return;
    dashboardToastBus.show({
      id: `${ALERT_TOAST_ID_PREFIX}ack-${entry.id}`,
      label: 'Alert acknowledged',
      tone: 'success',
      onUndo: () => {
        const snapshot: NotificationCenterEntry = { ...entry, unread: true };
        upsertNotificationCenterEntry(snapshot);
      },
    });
  }, [entry, undoToastsEnabled]);

  const onSecondaryCommit = useCallback(() => {
    const removal = archiveNotificationEntry(entry.id);
    if (!removal || !undoToastsEnabled) return;
    const snapshot = removal.entry;
    dashboardToastBus.show({
      id: `${ALERT_TOAST_ID_PREFIX}archive-${entry.id}`,
      label: 'Alert archived',
      tone: 'danger',
      onUndo: () => {
        // Re-insert the archived entry; `upsertNotificationCenterEntry`
        // sorts by createdAt so the entry lands in its original slot.
        upsertNotificationCenterEntry(snapshot);
      },
    });
  }, [entry, undoToastsEnabled]);

  const { rowProps, visuals } = useSwipeableRowActions({
    onPrimaryCommit,
    onSecondaryCommit,
    swipeEnabled,
  });
  const translated = visuals.isSwiping && visuals.translateX !== 0;

  return (
    <div
      {...rowProps}
      role="group"
      aria-label={ariaLabel}
      tabIndex={0}
      data-swipe-committed={visuals.isPastCommitThreshold ? 'true' : undefined}
      className="relative"
      style={{
        ...rowProps.style,
        transform: translated
          ? `translate3d(${visuals.translateX}px, 0, 0)`
          : undefined,
        transition:
          visuals.isSwiping || !visuals.motionProfile.shouldAnimate
            ? 'none'
            : 'transform 180ms ease-out',
      }}
    >
      {visuals.washOpacity > 0 ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            background:
              visuals.direction >= 0
                ? 'rgba(16, 185, 129, 0.55)'
                : 'rgba(239, 68, 68, 0.55)',
            opacity: visuals.washOpacity,
          }}
        />
      ) : null}
      <button
        type="button"
        onClick={() => markNotificationCenterEntryRead(entry.id)}
        className={className}
        aria-label={ariaLabel}
      >
        {children}
      </button>
    </div>
  );
};

const AlertsWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const entries = useNotificationCenterEntries();
  const boardInteractivity = useDashboardInteractivitySettings();
  const swipeGesturesEnabled = effectiveToggle(
    'swipeGesturesEnabled',
    boardInteractivity,
    widget.config,
  );
  const undoToastsEnabled = boardInteractivity.undoToastsEnabled;
  const sortedEntries = useMemo(
    () => entries.slice().sort((left, right) => right.createdAt - left.createdAt),
    [entries],
  );
  const unreadCount = sortedEntries.filter((entry) => entry.unread).length;
  const highCount = sortedEntries.filter((entry) => entry.priority === "high").length;
  const compactHeader = size.pixelWidth < 360;
  const maxItems = Math.max(1, Math.min(Number(widget.config.maxItems || 4), size.pixelHeight < 260 ? 2 : size.pixelWidth >= 760 ? 4 : 3));
  const visibleEntries = sortedEntries.slice(0, maxItems);
  const gridClass = size.pixelWidth >= 760
    ? "grid-cols-4"
    : size.pixelWidth >= 520
      ? "grid-cols-2"
      : "grid-cols-1";

  if (size.sizeClass === "tiny") {
    return (
      <WidgetShell bare widget={widget} accent="rose">
        <div className="flex flex-1 flex-col items-center justify-center">
          <span className={`text-4xl font-bold tabular-nums ${theme.onSurface}`}>{unreadCount}</span>
          <WidgetText variant="label" tone="muted" align="center">Alerts</WidgetText>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      widget={widget}
      title="Alerts"
      icon={<BellRing size={14} />}
      accent="rose"
      rightSlot={
        compactHeader ? (
          <span className="rounded-full bg-rose-500/10 px-2 py-1 text-[9px] font-bold tabular-nums text-rose-500">
            {unreadCount}
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--ether-control-bg)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)]">
              {highCount} high
            </span>
            <span className="rounded-full bg-rose-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-rose-400">
              {unreadCount} unread
            </span>
          </div>
        )
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        {visibleEntries.length === 0 ? (
          <WidgetEmptyState
            icon={<CheckCircle2 size={26} className="text-emerald-400" />}
            title="No active alerts"
          />
        ) : (
          <div
            data-testid="alerts-widget-list"
            className={`dashboard-widget-touch-scroll grid min-h-0 flex-1 auto-rows-fr gap-3 pr-1 ${gridClass}`}
          >
            {visibleEntries.map((entry) => {
              const tone = getAlertTone(entry);
              const priority = getNotificationPriorityDetails(entry.priority);
              return (
                <AlertCard
                  key={entry.id}
                  entry={entry}
                  swipeEnabled={swipeGesturesEnabled}
                  undoToastsEnabled={undoToastsEnabled}
                  ariaLabel={`${priority.label} alert ${entry.title}`}
                  compact={size.isCompact}
                  className={`min-w-0 w-full rounded-2xl border p-3 text-left transition hover:scale-[1.01] active:scale-[0.99] ${tone.card} ${entry.unread ? "shadow-[0_14px_36px_rgba(0,0,0,0.16)]" : "opacity-75"}`}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone.badge}`}>
                      {tone.icon}
                    </div>
                    <span className="shrink-0 text-[9px] font-bold tabular-nums uppercase tracking-[0.12em] text-[var(--ether-on-surface-variant)]">
                      {formatRelativeTime(new Date(entry.createdAt).toISOString()).toLowerCase()}
                    </span>
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-80">
                    {priority.label}
                  </div>
                  <div className="mt-1 truncate text-sm font-bold text-[var(--ether-on-surface)]">
                    {entry.title}
                  </div>
                  <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--ether-on-surface-variant)]">
                    {entry.message}
                  </div>
                  {!size.isCompact && (
                    <div className="mt-3 truncate text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)]/80">
                      {sourceLabel(entry.source)} - {entry.state}
                    </div>
                  )}
                </AlertCard>
              );
            })}
          </div>
        )}
      </div>
    </WidgetShell>
  );
};

export default React.memo(AlertsWidget);
