import React from "react";
import { X } from "lucide-react";
import type { NotificationCenterEntry } from "../../../services/notificationCenterStore";
import {
  clearNotificationCenterEntries,
  markAllNotificationCenterEntriesRead,
} from "../../../services/notificationCenterStore";
import { getNotificationPriorityDetails } from "../../../services/notificationPriority";
import type { ProactiveConfig } from "../../../services/proactiveTypes";
import type { Routine } from "../../../services/routineTypes";
import {
  setNotificationSystemEnabled,
  toggleNotificationRuleEnabled,
  type NotificationSystemStatus,
} from "../../../utils/settingsStorage";
import { formatRelativeTime } from "../../../services/dashboardProviderUtils";

export type NotificationPanelView = "activity" | "rules" | "routines";
export type NotificationFilter = "all" | "unread" | "high";

export interface NotificationSidePanelProps {
  notificationPanelView: NotificationPanelView;
  notificationFilter: NotificationFilter;
  effectiveUnreadNotificationCount: number;
  highPriorityNotificationCount: number;
  enabledRoutineCount: number;
  notificationSystemStatus: NotificationSystemStatus;
  effectiveNotificationEntries: NotificationCenterEntry[];
  visibleNotificationEntries: NotificationCenterEntry[];
  proactiveConfig: ProactiveConfig;
  routines: Routine[];
  onClose: () => void;
  onPanelViewChange: (view: NotificationPanelView) => void;
  onNotificationFilterChange: (filter: NotificationFilter) => void;
}

const NotificationSidePanel: React.FC<NotificationSidePanelProps> = ({
  notificationPanelView,
  notificationFilter,
  effectiveUnreadNotificationCount,
  highPriorityNotificationCount,
  enabledRoutineCount,
  notificationSystemStatus,
  effectiveNotificationEntries,
  visibleNotificationEntries,
  proactiveConfig,
  routines,
  onClose,
  onPanelViewChange,
  onNotificationFilterChange,
}) => (
  <>
    <div
      className="absolute inset-0 z-[34] bg-black/45 backdrop-blur-sm"
      onClick={onClose}
    />
    <div className="dashboard-side-panel absolute inset-y-0 right-0 z-[35] flex w-full max-w-[28rem] flex-col border-l border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] p-4 shadow-[var(--ether-glass-shadow)] backdrop-blur-[var(--ether-glass-blur)]">
      <div className="flex items-start justify-between gap-3 pb-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ether-on-surface-variant)]">
            Notifications
          </div>
          <div className="mt-1 text-xl font-semibold text-[var(--ether-on-surface)]">
            Activity & routines
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)]"
          aria-label="Close notifications"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 pb-4">
        <button
          type="button"
          onClick={() => {
            onPanelViewChange("activity");
            onNotificationFilterChange("unread");
          }}
          aria-pressed={
            notificationPanelView === "activity" &&
            notificationFilter === "unread"
          }
          className={`rounded-2xl p-3 text-left transition ${
            notificationPanelView === "activity" &&
            notificationFilter === "unread"
              ? "border border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10"
              : "border border-transparent bg-[var(--ether-control-bg)] hover:bg-[var(--ether-control-hover)]"
          }`}
        >
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)]">
            Unread
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {effectiveUnreadNotificationCount}
          </div>
          <div className="mt-1 truncate text-[10px] opacity-70">
            {notificationSystemStatus.enabled ? "Needs review" : "Paused"}
          </div>
        </button>
        <button
          type="button"
          onClick={() => onPanelViewChange("rules")}
          aria-pressed={notificationPanelView === "rules"}
          className={`rounded-2xl p-3 text-left transition ${
            notificationPanelView === "rules"
              ? "border border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10"
              : "border border-transparent bg-[var(--ether-control-bg)] hover:bg-[var(--ether-control-hover)]"
          }`}
        >
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)]">
            Rules
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {notificationSystemStatus.activeRuleCount}
          </div>
          <div className="mt-1 truncate text-[10px] opacity-70">
            {notificationSystemStatus.enabled ? "Enabled" : "Paused"}
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            onPanelViewChange("activity");
            onNotificationFilterChange("high");
          }}
          aria-pressed={
            notificationPanelView === "activity" &&
            notificationFilter === "high"
          }
          className={`rounded-2xl p-3 text-left transition ${
            notificationPanelView === "activity" &&
            notificationFilter === "high"
              ? "border border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10"
              : "border border-transparent bg-[var(--ether-control-bg)] hover:bg-[var(--ether-control-hover)]"
          }`}
        >
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)]">
            High
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {highPriorityNotificationCount}
          </div>
          <div className="mt-1 truncate text-[10px] opacity-70">
            Priority
          </div>
        </button>
        <button
          type="button"
          onClick={() => onPanelViewChange("routines")}
          aria-pressed={notificationPanelView === "routines"}
          className={`rounded-2xl p-3 text-left transition ${
            notificationPanelView === "routines"
              ? "border border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10"
              : "border border-transparent bg-[var(--ether-control-bg)] hover:bg-[var(--ether-control-hover)]"
          }`}
        >
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)]">
            Routines
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {enabledRoutineCount}
          </div>
          <div className="mt-1 truncate text-[10px] opacity-70">
            Automations
          </div>
        </button>
      </div>

      {notificationPanelView === "activity" && (
        <>
          <div className="flex items-center justify-between gap-3 pb-3">
            <div className="text-sm font-semibold text-[var(--ether-on-surface)]">
              Recent activity
            </div>
            <div className="flex items-center gap-2">
              {effectiveUnreadNotificationCount > 0 && (
                <button
                  onClick={() => markAllNotificationCenterEntriesRead()}
                  className="text-xs font-semibold text-[var(--ether-on-surface-variant)] transition hover:text-[var(--ether-on-surface)]"
                >
                  Mark read
                </button>
              )}
              {effectiveNotificationEntries.length > 0 && (
                <button
                  onClick={() => clearNotificationCenterEntries()}
                  className="text-xs font-semibold text-[var(--ether-on-surface-variant)] transition hover:text-[var(--ether-on-surface)]"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="mb-3 flex gap-2">
            {(
              [
                ["all", "All"],
                ["unread", "Unread"],
                ["high", "High"],
              ] as const
            ).map(([filter, label]) => (
              <button
                key={filter}
                type="button"
                onClick={() => onNotificationFilterChange(filter)}
                className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition ${
                  notificationFilter === filter
                    ? "bg-[var(--ether-on-surface)] text-[var(--ether-surface)]"
                    : "bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {visibleNotificationEntries.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-xs text-center">
                  <div className="text-sm font-semibold text-[var(--ether-on-surface)]">
                    {!notificationSystemStatus.enabled
                      ? "Notifications are paused"
                      : effectiveNotificationEntries.length === 0
                        ? "No recent notifications"
                        : "No matching notifications"}
                  </div>
                  <div className="mt-2 text-sm text-[var(--ether-on-surface-variant)]">
                    {!notificationSystemStatus.enabled
                      ? "Turn the notification system on to show current activity here."
                      : effectiveNotificationEntries.length === 0
                        ? "Recent proactive alerts and routine runs will appear here."
                        : "Try another filter or clear the activity log."}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                {visibleNotificationEntries.map((entry) => {
                  const priorityDetails = getNotificationPriorityDetails(entry.priority);
                  return (
                    <div
                      key={entry.id}
                      className={`rounded-[1.4rem] border p-3 ${
                        entry.unread
                          ? "border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10"
                          : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-[var(--ether-surface-container-high)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
                              {entry.source.replace("_", " ")}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] ${
                                entry.priority === "high"
                                  ? "bg-rose-500/15 text-rose-400"
                                  : entry.priority === "low"
                                    ? "bg-slate-500/10 text-[var(--ether-on-surface-variant)]"
                                    : "bg-sky-500/15 text-sky-400"
                              }`}
                              title={`${priorityDetails.description}. ${priorityDetails.soundDescription}.`}
                            >
                              {priorityDetails.label}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
                              {entry.state}
                            </span>
                          </div>
                          <div className="mt-2 truncate text-sm font-semibold text-[var(--ether-on-surface)]">
                            {entry.title}
                          </div>
                          <div className="mt-1 text-sm leading-5 text-[var(--ether-on-surface-variant)]">
                            {entry.message}
                          </div>
                        </div>
                        <div className="shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ether-on-surface-variant)]">
                          {formatRelativeTime(
                            new Date(entry.createdAt).toISOString(),
                          ).toLowerCase()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {notificationPanelView === "rules" && (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[var(--ether-on-surface)]">
                Notification rules
              </div>
              <div className="mt-0.5 text-xs text-[var(--ether-on-surface-variant)]">
                Synced with Settings.
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                setNotificationSystemEnabled(!notificationSystemStatus.enabled)
              }
              className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition ${
                notificationSystemStatus.enabled
                  ? "bg-[var(--ether-control-active-bg)] text-[var(--ether-control-active-text)]"
                  : "bg-[var(--ether-surface-container-high)] text-[var(--ether-on-surface-variant)]"
              }`}
            >
              {notificationSystemStatus.enabled ? "On" : "Paused"}
            </button>
          </div>
          <div className="grid gap-2">
            {proactiveConfig.rules.length === 0 ? (
              <div className="rounded-2xl bg-[var(--ether-control-bg)] p-4 text-sm text-[var(--ether-on-surface-variant)]">
                No notification rules configured.
              </div>
            ) : (
              proactiveConfig.rules.map((rule) => {
                const ruleActive =
                  notificationSystemStatus.enabled && rule.enabled;
                const priorityDetails = getNotificationPriorityDetails(rule.priority);
                return (
                  <button
                    key={rule.id}
                    type="button"
                    onClick={() => toggleNotificationRuleEnabled(rule.id)}
                    className={`rounded-[1.1rem] border p-3 text-left transition ${
                      ruleActive
                        ? "border-[var(--ether-primary)]/30 bg-[var(--ether-primary)]/10"
                        : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] opacity-75 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[var(--ether-on-surface)]">
                          {rule.label}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)]">
                          <span>{rule.kind}</span>
                          <span title={`${priorityDetails.description}. ${priorityDetails.soundDescription}.`}>
                            {priorityDetails.label}
                          </span>
                          {rule.speak && <span>Speak</span>}
                          {rule.sound && <span>Sound</span>}
                          {rule.showCard && <span>Card</span>}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] ${
                          ruleActive
                            ? "bg-[var(--ether-control-active-bg)] text-[var(--ether-control-active-text)]"
                            : "bg-[var(--ether-surface-container-high)] text-[var(--ether-on-surface-variant)]"
                        }`}
                      >
                        {ruleActive
                          ? "Active"
                          : notificationSystemStatus.enabled
                            ? "Off"
                            : "Paused"}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {notificationPanelView === "routines" && (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="mb-3">
            <div className="text-sm font-semibold text-[var(--ether-on-surface)]">
              Routine queue
            </div>
            <div className="mt-0.5 text-xs text-[var(--ether-on-surface-variant)]">
              Active routines from Settings.
            </div>
          </div>
          {routines.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-xs text-center">
                <div className="text-sm font-semibold text-[var(--ether-on-surface)]">
                  No routines configured
                </div>
                <div className="mt-2 text-sm text-[var(--ether-on-surface-variant)]">
                  Routines you create in Settings will appear here.
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              {routines.map((routine) => (
                <div
                  key={routine.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--ether-control-bg)] px-3 py-3"
                >
                  <span className="min-w-0 truncate text-sm font-semibold text-[var(--ether-on-surface)]">
                    {routine.name}
                  </span>
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)]">
                    {routine.enabled ? "Enabled" : "Off"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  </>
);

export default React.memo(NotificationSidePanel);
