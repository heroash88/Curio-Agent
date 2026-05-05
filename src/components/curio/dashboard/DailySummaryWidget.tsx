import React, { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarRange,
  CloudSun,
  Home,
  ListTodo,
  Radio,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useCardTheme } from "../../../hooks/useCardTheme";
import { useWidgetSize } from "../../../hooks/useWidgetSize";
import type {
  DashboardDailySummaryModule,
  DashboardWidget,
} from "../../../services/dashboardTypes";
import {
  formatRelativeTime,
  getDayPartGreeting,
  resolveCalendarProvider,
} from "../../../services/dashboardProviderUtils";
import type { AqiData, WeatherData } from "../../../services/weatherService";
import { getTasks } from "../../../services/chorePersistence";
import { getReminders } from "../../../services/notesPersistence";
import { useUnreadNotificationCount } from "../../../services/notificationCenterStore";
import { useSyncedDashboardTime } from "../../../hooks/useSyncedDashboardTime";
import {
  useGoogleCalendarAccessToken,
  useHaMcpEnabled,
  useHaMcpUrl,
  useOutlookCalendarAccessToken,
  useRoutines,
  useSettingsStorageValue,
  useNotificationSystemStatus,
  useTempUnit,
  useUserName,
} from "../../../utils/settingsStorage";
import {
  getICalCalendarSources,
  listICalEvents,
  subscribeICalCalendarSources,
} from "../../../services/icalCalendarApi";
import WidgetShell from "./WidgetShell";
import { WidgetBody, WidgetText } from "./widgetPrimitives";

type DailySummaryWidgetProps = {
  widget: DashboardWidget;
  weather: WeatherData | null;
  aqi: AqiData | null;
  activeProfileName?: string | null;
  focused?: boolean;
};

type CalendarEvent = {
  id?: string;
  title: string;
  startTime: string;
  startDateTime?: string;
  endTime?: string;
  allDay?: boolean;
};

type ModuleTone = {
  icon: string;
  pill: string;
};

type SummaryModuleRow = {
  id: DashboardDailySummaryModule;
  label: string;
  detail: string;
  icon: LucideIcon;
  tone: ModuleTone;
};

const DEFAULT_SUMMARY_MODULES: DashboardDailySummaryModule[] = [
  "weather",
  "calendar",
  "tasks",
  "notifications",
  "devices",
  "routines",
  "air",
];

// Restrained Ether-style tone system. Soft pill for the icon, colored
// foreground only — no gradient tiles, no glow halos. Matches the rest
// of the dashboard widgets (SystemStatus, Profile, Weather).
const TONE_AMBER: ModuleTone = {
  icon: "text-amber-600 dark:text-amber-300",
  pill: "bg-amber-500/15",
};
const TONE_SKY: ModuleTone = {
  icon: "text-sky-600 dark:text-sky-300",
  pill: "bg-sky-500/15",
};
const TONE_EMERALD: ModuleTone = {
  icon: "text-emerald-600 dark:text-emerald-300",
  pill: "bg-emerald-500/15",
};
const TONE_ROSE: ModuleTone = {
  icon: "text-rose-600 dark:text-rose-300",
  pill: "bg-rose-500/15",
};
const TONE_TEAL: ModuleTone = {
  icon: "text-teal-600 dark:text-teal-300",
  pill: "bg-teal-500/15",
};
const TONE_VIOLET: ModuleTone = {
  icon: "text-violet-600 dark:text-violet-300",
  pill: "bg-violet-500/15",
};
const TONE_LIME: ModuleTone = {
  icon: "text-lime-600 dark:text-lime-300",
  pill: "bg-lime-500/15",
};
const TONE_MUTED: ModuleTone = {
  icon: "text-[var(--ether-on-surface-variant)]",
  pill: "bg-[var(--ether-surface-container-highest)]",
};

const normalizeSummaryModules = (modules?: DashboardDailySummaryModule[]) => {
  const selected =
    Array.isArray(modules) && modules.length > 0
      ? modules
      : DEFAULT_SUMMARY_MODULES;
  const selectedSet = new Set(selected);
  return DEFAULT_SUMMARY_MODULES.filter((module) => selectedSet.has(module));
};

const plural = (
  count: number,
  singular: string,
  pluralValue = `${singular}s`,
) => `${count} ${count === 1 ? singular : pluralValue}`;

const formatTemperature = (value: number, unit: string) =>
  `${value}\u00b0${unit}`;

const DailySummaryWidget: React.FC<DailySummaryWidgetProps> = ({
  widget,
  weather,
  aqi,
  activeProfileName,
  focused = false,
}) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const configuredName = useUserName();
  const displayName = activeProfileName || configuredName || "";
  const tempUnit = useTempUnit();
  const googleCalendarToken = useGoogleCalendarAccessToken();
  const outlookCalendarToken = useOutlookCalendarAccessToken();
  const [icalSourceCount, setICalSourceCount] = useState(
    () => getICalCalendarSources().length,
  );
  const unreadNotificationCount = useUnreadNotificationCount();
  const notificationSystemStatus = useNotificationSystemStatus();
  const routines = useRoutines();
  const haEnabled = useHaMcpEnabled();
  const haUrl = useHaMcpUrl();
  const now = useSyncedDashboardTime("minute");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const reminders = useSettingsStorageValue(getReminders, []);
  const tasks = useSettingsStorageValue(getTasks, []);
  const reminderCount = reminders.filter((item) => !item.done).length;
  const taskCount = tasks.filter((item) => !item.completed).length;
  const completedReminderCount = reminders.filter((item) => item.done).length;
  const completedTaskCount = tasks.filter((item) => item.completed).length;
  const enabledRoutineCount = routines.filter(
    (routine) => routine.enabled,
  ).length;
  const effectiveUnreadNotificationCount = notificationSystemStatus.enabled
    ? unreadNotificationCount
    : 0;
  const enabledModules = useMemo(
    () => normalizeSummaryModules(widget.config.dailySummaryModules),
    [widget.config.dailySummaryModules],
  );
  const provider = resolveCalendarProvider(
    widget.config.calendarProvider || "auto",
    googleCalendarToken,
    outlookCalendarToken,
    icalSourceCount > 0,
  );

  useEffect(() => {
    return subscribeICalCalendarSources(() => {
      setICalSourceCount(getICalCalendarSources().length);
    });
  }, []);

  useEffect(() => {
    if (!provider) {
      setEvents([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const start = new Date();
        const end = new Date();
        end.setHours(24, 0, 0, 0);
        const nextEvents = provider === "zapier"
          ? await (await import("../../../services/zapierMcpWidgetService"))
            .listZapierCalendarEvents({
            query: String(widget.config.zapierQuery || "today"),
            maxItems: 4,
            startDateTime: start.toISOString(),
            endDateTime: end.toISOString(),
          })
          : await (provider === "ical"
            ? listICalEvents
            : provider === "google"
              ? (await import("../../../services/googleCalendarApi"))
                  .listEvents
              : (await import("../../../services/outlookCalendarApi"))
                  .listEvents)(
            4,
            start.toISOString(),
            end.toISOString(),
            provider === "ical"
              ? widget.config.calendarSourceId || "all"
              : undefined,
          );
        if (!cancelled) {
          setEvents(nextEvents);
        }
      } catch {
        if (!cancelled) {
          setEvents([]);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [provider, widget.config.calendarSourceId]);

  const greeting = useMemo(() => getDayPartGreeting(now), [now]);

  const greetingLine = displayName
    ? `${greeting}, ${displayName}.`
    : `${greeting}.`;
  const weatherTemp = weather
    ? tempUnit === "C"
      ? weather.tempC
      : weather.tempF
    : null;
  const weatherWithUnit =
    weatherTemp != null ? formatTemperature(weatherTemp, tempUnit) : null;
  const weatherLine =
    weather && weatherWithUnit
      ? `${weatherWithUnit} and ${weather.desc.toLowerCase()}`
      : "ambient conditions syncing";
  const notificationBrief = notificationSystemStatus.enabled
    ? `${effectiveUnreadNotificationCount} unread notification${
        effectiveUnreadNotificationCount === 1 ? "" : "s"
      }`
    : "notifications paused";
  const nextEvent = events[0];
  const summary = nextEvent
    ? `Next up: ${nextEvent.title}${
        nextEvent.startTime
          ? ` ${formatRelativeTime(
              nextEvent.startDateTime || nextEvent.startTime,
            ).toLowerCase()}`
          : ""
      }`
    : "No major calendar pressure for the rest of the day";
  const openQueue = taskCount + reminderCount;
  const queueTotal = tasks.length + reminders.length;
  const queueDone = completedTaskCount + completedReminderCount;

  // ---------- Layout decisions ----------
  // Wide-short surfaces (for example 4x3) still read best with the two-column
  // layout so the heading and summary text keep their proper width. We allow
  // wideSummary when the board is clearly wider than tall even if the height
  // is under the usual 320px threshold. The right-hand list already scrolls
  // and shrinks to fit the shorter height.
  const hasWideAspect =
    size.pixelWidth >= 560 &&
    size.pixelHeight >= 220 &&
    size.pixelWidth >= size.pixelHeight * 1.7;
  const wideSummary =
    (focused && size.pixelWidth >= 520 && size.pixelHeight >= 300) ||
    (size.pixelWidth >= 560 && size.pixelHeight >= 320) ||
    hasWideAspect;
  const compactSurface =
    !wideSummary &&
    ((size.w <= 3 && size.h <= 3) ||
      (size.pixelWidth < 560 && size.pixelHeight < 330));
  const compactRows =
    compactSurface || size.pixelWidth < 360 || size.pixelHeight < 320;
  const compactHeader =
    compactSurface || size.pixelWidth < 340 || size.pixelHeight < 320;
  const miniSurface = size.pixelWidth < 260 || size.pixelHeight < 190;
  const denseRows = compactSurface || size.pixelHeight < 320;
  const hideSummaryDetail = compactSurface || size.pixelHeight < 320;
  const stretchRows = !denseRows && size.pixelHeight < 330;
  const fillListSpace = denseRows || stretchRows;
  const showSummaryDate = widget.config.showDate !== false;

  const maxVisibleModules = wideSummary
    ? Math.min(size.pixelHeight >= 460 ? 6 : 4, enabledModules.length)
    : miniSurface
      ? Math.min(2, enabledModules.length)
      : size.pixelHeight < 210
        ? Math.min(3, enabledModules.length)
        : Math.min(4, enabledModules.length);

  const summaryDetail = `${weatherLine}. ${notificationBrief}, ${plural(
    enabledRoutineCount,
    "active routine",
  )}, and ${plural(openQueue, "open queue item")}.`;

  const moduleCards = useMemo<SummaryModuleRow[]>(() => {
    const deviceReady = haEnabled && Boolean(haUrl);
    const calendarDetail =
      events.length > 0
        ? `${events.length} event${events.length === 1 ? "" : "s"} today`
        : "No events today";
    const taskDetail =
      queueTotal > 0
        ? `${queueDone} of ${queueTotal} completed`
        : "No open tasks";
    const notificationDetail = notificationSystemStatus.enabled
      ? effectiveUnreadNotificationCount > 0
        ? `${effectiveUnreadNotificationCount} active alert${
            effectiveUnreadNotificationCount === 1 ? "" : "s"
          }`
        : "No active alerts"
      : "Alerts paused";

    return [
      {
        id: "weather",
        label: "Weather",
        detail:
          weather && weatherWithUnit
            ? `${weatherWithUnit} - ${weather.desc}`
            : "Waiting for local forecast",
        icon: CloudSun,
        tone: TONE_AMBER,
      },
      {
        id: "calendar",
        label: "Calendar",
        detail: calendarDetail,
        icon: CalendarRange,
        tone: TONE_SKY,
      },
      {
        id: "tasks",
        label: "Tasks",
        detail: taskDetail,
        icon: ListTodo,
        tone: TONE_EMERALD,
      },
      {
        id: "notifications",
        label: "Alerts",
        detail: notificationDetail,
        icon: Bell,
        tone: notificationSystemStatus.enabled ? TONE_ROSE : TONE_MUTED,
      },
      {
        id: "devices",
        label: "Devices",
        detail: deviceReady ? "Home Assistant ready" : "Not connected",
        icon: Home,
        tone: deviceReady ? TONE_TEAL : TONE_MUTED,
      },
      {
        id: "routines",
        label: "Routines",
        detail:
          enabledRoutineCount > 0
            ? `${enabledRoutineCount} active routine${
                enabledRoutineCount === 1 ? "" : "s"
              }`
            : "No active routines",
        icon: Zap,
        tone: TONE_VIOLET,
      },
      {
        id: "air",
        label: "Air",
        detail: aqi ? `${aqi.value} - ${aqi.category}` : "AQI pending",
        icon: Radio,
        tone: TONE_LIME,
      },
    ];
  }, [
    aqi,
    effectiveUnreadNotificationCount,
    enabledRoutineCount,
    events.length,
    haEnabled,
    haUrl,
    notificationSystemStatus.enabled,
    queueDone,
    queueTotal,
    weather,
    weatherWithUnit,
  ]);

  const visibleModuleCards = moduleCards
    .filter((card) => enabledModules.includes(card.id))
    .slice(0, maxVisibleModules);

  // ---------- Tiny ----------
  if (size.sizeClass === "tiny") {
    return (
      <WidgetShell bare widget={widget} actionSlotVisibility="always">
        <WidgetBody align="center" gap="sm" className="w-full items-center px-2 py-3 text-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--ether-glass-border)] bg-sky-500/15 text-sky-600 dark:text-sky-300">
            <Sparkles size={14} strokeWidth={2.4} />
          </span>
          <WidgetText
            as="span"
            variant="label"
            tone="muted"
            align="center"
            className={`text-[9px] tracking-[0.16em] ${theme.muted}`}
          >
            {greeting}
          </WidgetText>
        </WidgetBody>
      </WidgetShell>
    );
  }

  // ---------- Mini surface (cramped small) ----------
  if (miniSurface) {
    return (
      <WidgetShell
        bare
        padded={false}
        widget={widget}
        bodyClassName="min-h-0 overflow-hidden"
        actionSlotVisibility="always"
      >
        <WidgetBody
          data-testid="daily-summary-body"
          gap="sm"
          actionSafeArea
          className="overflow-hidden rounded-[inherit] px-3.5 py-3 pr-12"
        >
          <div className="min-w-0">
            <WidgetText
              as="h2"
              variant="label"
              tone="muted"
              data-testid="daily-summary-heading"
              className={`truncate text-[9px] font-bold uppercase tracking-[0.18em] ${theme.muted}`}
            >
              Daily Summary
            </WidgetText>
            {showSummaryDate && (
              <div
                className={`mt-1 truncate text-[15px] font-semibold leading-tight ${theme.display} ${theme.onSurface}`}
              >
                {now.toLocaleDateString([], {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </div>
            )}
          </div>

          <div
            className={`line-clamp-2 text-[11px] font-medium leading-snug ${theme.onSurface}`}
          >
            {summary}
          </div>

          <div className="grid min-h-0 gap-1.5">
            {visibleModuleCards.slice(0, 2).map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.id}
                  className="flex min-w-0 items-center gap-2 rounded-[0.85rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-2 py-1"
                >
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[0.5rem] ${card.tone.pill} ${card.tone.icon}`}
                    aria-hidden
                  >
                    <Icon size={12} strokeWidth={2.4} />
                  </div>
                  <div className="min-w-0 leading-tight">
                    <div
                      className={`truncate text-[10px] font-semibold ${theme.onSurface}`}
                    >
                      {card.label}
                    </div>
                    <div
                      className={`truncate text-[9px] ${theme.onSurfaceVariant}`}
                    >
                      {card.detail}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </WidgetBody>
      </WidgetShell>
    );
  }

  const headerNode = (
    <div className={`shrink-0 ${wideSummary ? "pr-6" : "pr-12"}`}>
      <WidgetText
        as="h2"
        variant="label"
        tone="muted"
        data-testid="daily-summary-heading"
        className={`font-bold uppercase tracking-[0.18em] ${theme.muted} ${
          compactHeader ? "text-[9px]" : "text-[10px]"
        }`}
      >
        Daily Summary
      </WidgetText>
      {showSummaryDate && (
        <div
          className={`mt-1 font-semibold leading-[1.05] tracking-tight ${theme.display} ${theme.onSurface} ${
            wideSummary
              ? "text-[28px]"
              : compactHeader
                ? "text-[20px]"
                : "text-[24px]"
          }`}
        >
          {now.toLocaleDateString([], {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </div>
      )}
    </div>
  );

  const listNode = (
    <WidgetBody
      data-testid="daily-summary-module-grid"
      scroll="y"
      gap="none"
      className={`w-full dashboard-widget-touch-scroll-y pb-2 ${
        fillListSpace ? "flex-1" : "shrink-0"
      } ${wideSummary && !fillListSpace ? "self-stretch" : ""} ${
        wideSummary ? "pt-10" : ""
      }`}
    >
      <div
        className={`flex w-full flex-col ${
          denseRows ? "gap-1.5" : compactRows ? "gap-2" : "gap-2"
        }`}
      >
        {visibleModuleCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className={`group flex min-h-0 items-center rounded-[1rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] transition-colors duration-200 hover:bg-[var(--ether-surface-container-high)] ${
                denseRows
                  ? "gap-2.5 px-2.5 py-1.5"
                  : compactRows
                    ? "gap-3 px-3 py-2"
                    : "gap-3 px-3.5 py-2.5"
              } ${
                stretchRows
                  ? "flex-1"
                  : denseRows
                    ? "min-h-9 shrink-0"
                    : compactRows
                      ? "min-h-[3rem] shrink-0"
                      : "min-h-[3.25rem] shrink-0"
              }`}
            >
              <div
                className={`flex shrink-0 items-center justify-center ${card.tone.pill} ${card.tone.icon} ${
                  denseRows
                    ? "h-7 w-7 rounded-[0.55rem]"
                    : compactRows
                      ? "h-8 w-8 rounded-[0.65rem]"
                      : "h-9 w-9 rounded-[0.7rem]"
                }`}
                aria-hidden
              >
                <Icon
                  size={denseRows ? 13 : compactRows ? 14 : 16}
                  strokeWidth={2.3}
                />
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div
                  className={`truncate font-semibold ${theme.onSurface} ${
                    denseRows
                      ? "text-[11px]"
                      : compactRows
                        ? "text-[12px]"
                        : "text-[13px]"
                  }`}
                >
                  {card.label}
                </div>
                <div
                  className={`mt-0.5 truncate ${theme.onSurfaceVariant} ${
                    denseRows
                      ? "text-[10px]"
                      : compactRows
                        ? "text-[10px]"
                        : "text-[11px]"
                  }`}
                >
                  {card.detail}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </WidgetBody>
  );

  // ---------- Full layout ----------
  return (
    <WidgetShell
      bare
      padded={false}
      widget={widget}
      bodyClassName="min-h-0 overflow-hidden"
      actionSlotVisibility="always"
    >
      <WidgetBody
        data-testid="daily-summary-body"
        gap="none"
        className={`overflow-hidden rounded-[inherit] ${
          compactRows ? "px-4 py-4" : "px-5 py-5"
        } ${
          wideSummary
            ? "grid grid-cols-[minmax(0,1.15fr)_minmax(280px,1fr)] gap-8"
            : compactSurface
              ? "flex-col gap-2"
              : "flex-col gap-4"
        }`}
      >
        {wideSummary ? (
          <>
            <div className="flex h-full min-h-0 min-w-0 flex-col pb-2">
              {headerNode}
              <div
                data-testid="daily-summary-text-summary"
                className="flex min-w-0 flex-1 flex-col justify-center pr-2"
              >
                <div
                  className={`mb-2 text-[10px] font-bold uppercase tracking-[0.14em] ${theme.muted}`}
                >
                  {greetingLine}
                </div>
                <div
                  className={`text-[22px] font-semibold leading-[1.2] tracking-tight ${theme.display} ${theme.onSurface}`}
                >
                  {summary}
                </div>
                <div
                  className={`mt-3 text-[12px] font-medium leading-relaxed ${theme.onSurfaceVariant}`}
                >
                  {summaryDetail}
                </div>
              </div>
            </div>
            {listNode}
          </>
        ) : (
          <>
            <div
              className={`flex shrink-0 flex-col ${
                compactRows ? "gap-2" : "gap-3"
              }`}
            >
              {headerNode}
              <div className="flex min-w-0 flex-col">
                <div
                  className={`mb-1 text-[10px] font-bold uppercase tracking-[0.12em] ${theme.muted}`}
                >
                  {greetingLine}
                </div>
                <div
                  className={`${
                    compactRows
                      ? "line-clamp-2 text-[14px]"
                      : "text-[17px]"
                  } font-semibold leading-snug tracking-tight ${theme.display} ${theme.onSurface}`}
                >
                  {summary}
                </div>
                {!hideSummaryDetail && (
                  <div
                    className={`mt-2 line-clamp-3 text-[11px] font-medium leading-relaxed ${theme.onSurfaceVariant}`}
                  >
                    {summaryDetail}
                  </div>
                )}
              </div>
            </div>
            {listNode}
          </>
        )}
      </WidgetBody>
    </WidgetShell>
  );
};

export default DailySummaryWidget;
