import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Plus,
  RefreshCcw,
} from "lucide-react";
import { useCardTheme } from "../../../hooks/useCardTheme";
import { useDashboardRefresh } from "../../../hooks/useDashboardRefresh";
import { useWidgetSize } from "../../../hooks/useWidgetSize";
import type {
  DashboardCalendarDesign,
  DashboardCalendarProvider,
  DashboardWidget,
  DashboardWidgetConfig,
} from "../../../services/dashboardTypes";
import {
  formatRelativeTime,
  resolveCalendarProvider,
} from "../../../services/dashboardProviderUtils";
import {
  useGoogleCalendarAccessToken,
  useOutlookCalendarAccessToken,
} from "../../../utils/settingsStorage";
import {
  getICalCalendarSources,
  listICalEvents,
  subscribeICalCalendarSources,
} from "../../../services/icalCalendarApi";
import WidgetShell from "./WidgetShell";
import { WidgetSkeleton, WidgetInlineError, WidgetText } from "./widgetPrimitives";
import { IconCalendar } from "./widgetIcons";

const CalendarFocusedLazy = React.lazy(() => import('./calendar/CalendarFocused'));

import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from "../../../utils/settings/dashboardSettings";
import { useHoverBus } from "../../../hooks/useDashboardIntents";
import { useMotionProfile } from "../../../hooks/useMotionProfile";
import { dispatchHover } from "../../../services/dashboardIntents";

interface CalendarEvent {
  id?: string;
  title: string;
  startTime: string;
  endTime?: string;
  startDateTime?: string;
  endDateTime?: string;
  location?: string;
  description?: string;
  allDay?: boolean;
}

interface EventDraft {
  title: string;
  startDateTime: string;
  endDateTime: string;
  location: string;
  description: string;
  allDay: boolean;
}

const EVENT_ACCENTS = [
  "border-orange-400",
  "border-sky-400",
  "border-teal-400",
  "border-violet-400",
  "border-rose-400",
];

const EVENT_TONES = [
  { bar: "bg-sky-400", border: "border-sky-400/35", bg: "bg-sky-500/12" },
  { bar: "bg-teal-400", border: "border-teal-400/35", bg: "bg-teal-500/12" },
  { bar: "bg-amber-400", border: "border-amber-400/35", bg: "bg-amber-500/12" },
  { bar: "bg-rose-400", border: "border-rose-400/35", bg: "bg-rose-500/12" },
  { bar: "bg-violet-400", border: "border-violet-400/35", bg: "bg-violet-500/12" },
];

const parseEventDate = (event: CalendarEvent) => {
  if (event.startDateTime) {
    const parsed = new Date(event.startDateTime);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const parsed = new Date(event.startTime);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const today = new Date();
  const match = event.startTime.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return today;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = match[3]?.toUpperCase();
  if (period === "PM" && hour < 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  today.setHours(hour, minute, 0, 0);
  return today;
};

const buildWeekDays = (anchor: Date) => {
  const start = new Date(anchor);
  // Start at Sunday of the current week
  start.setDate(anchor.getDate() - anchor.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date) => {
  const next = startOfDay(date);
  next.setDate(next.getDate() + 1);
  return next;
};

const formatHourLabel = (hour: number) => {
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour} ${suffix}`;
};

const formatDateTimeInput = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const buildDefaultDraft = (): EventDraft => {
  const start = new Date();
  start.setMinutes(start.getMinutes() < 30 ? 30 : 60, 0, 0);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  return {
    title: "",
    startDateTime: formatDateTimeInput(start),
    endDateTime: formatDateTimeInput(end),
    location: "",
    description: "",
    allDay: false,
  };
};

const getEventTimeBadge = (event: CalendarEvent) => {
  if (event.allDay) {
    return { primary: "All", secondary: "Day" };
  }

  const parsed = parseEventDate(event);
  return {
    primary: parsed
      .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      .replace(/\s?(AM|PM)$/i, ""),
    secondary:
      parsed.toLocaleTimeString([], { hour: "numeric" }).match(/AM|PM/i)?.[0] ||
      "",
  };
};

const formatEventRange = (event: CalendarEvent) => {
  const start = event.startDateTime
    ? new Date(event.startDateTime)
    : parseEventDate(event);
  const end = event.endDateTime ? new Date(event.endDateTime) : null;

  if (event.allDay) {
    return start.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }

  const dateLabel = start.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const startLabel = start.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const endLabel = end
    ? end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : event.endTime || "";

  return endLabel
    ? `${dateLabel} • ${startLabel} – ${endLabel}`
    : `${dateLabel} • ${startLabel}`;
};

const CalendarWidget: React.FC<{
  widget: DashboardWidget;
  focused?: boolean;
  onUpdateWidgetConfig?: (
    widgetId: string,
    patch: Partial<DashboardWidgetConfig>,
  ) => void;
}> = ({ widget, focused, onUpdateWidgetConfig }) => {
  if (focused) {
    return (
      <React.Suspense fallback={<WidgetSkeleton variant="list" />}>
        <CalendarFocusedLazy widget={widget} focused onUpdateWidgetConfig={onUpdateWidgetConfig} />
      </React.Suspense>
    );
  }

  return <CalendarWidgetCompact widget={widget} onUpdateWidgetConfig={onUpdateWidgetConfig} />;
};

const CalendarWidgetCompact: React.FC<{
  widget: DashboardWidget;
  onUpdateWidgetConfig?: (
    widgetId: string,
    patch: Partial<DashboardWidgetConfig>,
  ) => void;
}> = ({ widget, onUpdateWidgetConfig }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const googleCalendarToken = useGoogleCalendarAccessToken();
  const outlookCalendarToken = useOutlookCalendarAccessToken();
  const [icalSourceCount, setICalSourceCount] = useState(
    () => getICalCalendarSources().length,
  );

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"day" | "week">(
    size.isTall ? "week" : "day",
  );
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftEvent, setDraftEvent] = useState<EventDraft>(() =>
    buildDefaultDraft(),
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => setSaveSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccess]);

  const calendarDesign = (widget.config?.calendarDesign || "list") as DashboardCalendarDesign;
  const today = useMemo(() => new Date(), []);

  // Day selection state
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  // Hover/selection bus wiring (Requirement 12.2, 12.3).
  //
  // Source role: when the user hovers a calendar event row, the widget
  // emits a `calendar-event` hover. Meta carries the event's start/end
  // so Mail-side consumers can match on date ranges even if they do
  // not carry attendee info directly (our Gmail/Outlook types currently
  // only expose `from`, not an attendee list — the Mail widget falls
  // back to sender-only matching).
  //
  // Target role: when another widget hovers a `task` with an attached
  // due date, the matching day cell renders a highlight ring.
  const boardInteractivity = useDashboardInteractivitySettings();
  const hoverBusEnabled = effectiveToggle(
    "hoverSelectionBusEnabled",
    boardInteractivity,
    widget.config,
  );
  const motionProfile = useMotionProfile();
  const { hovered } = useHoverBus();

  const hoveredTaskDueDate =
    hoverBusEnabled && hovered?.itemKind === "task"
      ? (hovered.meta as { dueDate?: string } | undefined)?.dueDate ?? null
      : null;

  const dayKeyForDate = (date: Date) => {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, "0");
    const d = `${date.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const isDayHighlighted = (date: Date): boolean =>
    hoveredTaskDueDate !== null && dayKeyForDate(date) === hoveredTaskDueDate;

  // Reduced-motion / animationIntensity='off' renders a static outline
  // instead of any transition (Requirement 12.6).
  const hoverHighlightClass = motionProfile.shouldAnimate
    ? "ring-2 ring-[var(--ether-primary)] ring-offset-0 transition-[box-shadow,border-color] duration-150"
    : "outline outline-2 outline-[var(--ether-primary)]";

  const emitEventHover = (event: CalendarEvent) => {
    if (!hoverBusEnabled) return;
    if (!event.id) return;
    dispatchHover({
      widgetId: widget.id,
      itemKind: "calendar-event",
      itemId: event.id,
      meta: {
        start: event.startDateTime || event.startTime || "",
        end: event.endDateTime || event.endTime || "",
        title: event.title,
      },
    });
  };

  const emitHoverEnd = () => {
    if (!hoverBusEnabled) return;
    dispatchHover({
      widgetId: widget.id,
      itemKind: null,
      itemId: null,
    });
  };

  const layoutMaxItems = size.pixelHeight < 360 ? 3 : size.pixelHeight < 540 ? 5 : size.isTall ? 8 : 5;
  const maxItems = Math.max(1, Math.min(Number(widget.config?.maxItems || layoutMaxItems), layoutMaxItems));
  const provider = resolveCalendarProvider(
    widget.config?.calendarProvider || "auto",
    googleCalendarToken,
    outlookCalendarToken,
    icalSourceCount > 0,
  );
  const preferredProvider = (widget.config?.calendarProvider || "auto") as DashboardCalendarProvider;
  const availableProviders = useMemo(() => {
    if (preferredProvider !== "auto") {
      return provider ? [provider] : [];
    }
    return [
      googleCalendarToken ? "google" : null,
      outlookCalendarToken ? "outlook" : null,
      icalSourceCount > 0 ? "ical" : null,
    ].filter(Boolean) as Array<Exclude<DashboardCalendarProvider, "auto">>;
  }, [
    googleCalendarToken,
    icalSourceCount,
    outlookCalendarToken,
    preferredProvider,
    provider,
  ]);
  const selectedICalSourceId = widget.config?.calendarSourceId || "all";
  const createProvider = availableProviders.includes("google")
    ? "google"
    : availableProviders.includes("outlook")
      ? "outlook"
      : availableProviders.includes("zapier")
        ? "zapier"
      : null;
  const canCreateEvents = createProvider === "google" || createProvider === "outlook" || createProvider === "zapier";
  const widgetTitle =
    preferredProvider === "google"
      ? "Google Calendar"
      : preferredProvider === "outlook"
        ? "Outlook Calendar"
        : preferredProvider === "ical"
          ? "iCal Calendar"
          : preferredProvider === "zapier"
            ? "Zapier Calendar"
          : "Schedule";
  const emptyCalendarMessage =
    preferredProvider === "google"
      ? "Connect Google Calendar"
      : preferredProvider === "outlook"
        ? "Connect Outlook Calendar"
        : preferredProvider === "ical"
          ? "Import iCal First"
          : preferredProvider === "zapier"
            ? "Connect Zapier MCP"
          : "Calendar Not Linked";

  useEffect(() => {
    return subscribeICalCalendarSources(() => {
      setICalSourceCount(getICalCalendarSources().length);
    });
  }, []);

  const loadEvents = useCallback(async (background = false) => {
    if (availableProviders.length === 0) {
      setEvents([]);
      return;
    }

    if (!background) setLoading(true);
    try {
      const weekStart = buildWeekDays(selectedDate)[0]!;
      const windowStart = viewMode === "week" ? startOfDay(weekStart) : startOfDay(selectedDate);
      const windowEnd =
        viewMode === "week"
          ? (() => {
            const end = startOfDay(weekStart);
            end.setDate(end.getDate() + 7);
            return end;
          })()
          : endOfDay(selectedDate);

      const results = await Promise.all(
        availableProviders.map(async (calendarProvider) => {
          if (calendarProvider === "zapier") {
            const { listZapierCalendarEvents } =
              await import("../../../services/zapierMcpWidgetService");
            return listZapierCalendarEvents({
              query: String(widget.config.zapierQuery || "upcoming events"),
              maxItems: Math.max(maxItems * 4, 20),
              startDateTime: windowStart.toISOString(),
              endDateTime: windowEnd.toISOString(),
            });
          }

          if (calendarProvider === "mcp") {
            const { listMcpCalendarEvents } =
              await import("../../../services/zapierMcpWidgetService");
            return listMcpCalendarEvents({
              serverId: widget.config.mcpServerId,
              toolName: widget.config.mcpToolName,
              query: String(widget.config.mcpQuery || widget.config.zapierQuery || "upcoming events"),
              maxItems: Math.max(maxItems * 4, 20),
              startDateTime: windowStart.toISOString(),
              endDateTime: windowEnd.toISOString(),
            });
          }

          const listEvents =
            calendarProvider === "ical"
              ? listICalEvents
              : calendarProvider === "google"
                ? (await import("../../../services/googleCalendarApi")).listEvents
                : (await import("../../../services/outlookCalendarApi")).listEvents;

          return listEvents(
            Math.max(maxItems * 4, 20),
            windowStart.toISOString(),
            windowEnd.toISOString(),
            calendarProvider === "ical" ? selectedICalSourceId : undefined,
          );
        }),
      );

      const result = results.flat();

      setEvents(result);
      setLoadError(null);
      setSelectedEvent((current) =>
        current
          ? result.find((event) => event.id === current.id) || current
          : current,
      );
    } catch (err) {
      console.warn("Calendar load failed", err);
      setEvents([]);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [availableProviders, maxItems, selectedDate, selectedICalSourceId, viewMode, widget.config.zapierQuery, widget.config.mcpQuery, widget.config.mcpServerId, widget.config.mcpToolName]);

  useEffect(() => {
    if (availableProviders.length === 0) {
      setEvents([]);
    }
  }, [availableProviders.length]);

  const { refreshNow } = useDashboardRefresh({
    widget,
    enabled: availableProviders.length > 0,
    onRefresh: (background) => loadEvents(background),
  });

  const switchCalendarDesign = () => {
    const nextDesign: DashboardCalendarDesign =
      calendarDesign === "studio" ? "list" : "studio";
    onUpdateWidgetConfig?.(widget.id, { calendarDesign: nextDesign });
  };

  const openComposer = () => {
    setSelectedEvent(null);
    setDraftEvent(buildDefaultDraft());
    setSaveError(null);
    setSaveSuccess(null);
    setComposerOpen(true);
  };

  const openEventDetail = (event: CalendarEvent) => {
    setComposerOpen(false);
    setSaveError(null);
    setSaveSuccess(null);
    setSelectedEvent(event);
  };

  const handleCreateEvent = async () => {
    if (!canCreateEvents) {
      setSaveError("Imported iCal calendars are read-only.");
      return;
    }

    if (!createProvider || !draftEvent.title.trim()) {
      setSaveError("Add a title before saving this event.");
      return;
    }

    if (!draftEvent.allDay) {
      const start = new Date(draftEvent.startDateTime);
      const end = new Date(draftEvent.endDateTime);
      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end <= start
      ) {
        setSaveError("Choose an end time after the event start.");
        return;
      }
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const createEvent =
        createProvider === "google"
          ? (await import("../../../services/googleCalendarApi")).createEvent
          : createProvider === "outlook"
            ? (await import("../../../services/outlookCalendarApi")).createEvent
            : (await import("../../../services/zapierMcpWidgetService")).createZapierCalendarEvent;

      const createdEvent = await createEvent({
        title: draftEvent.title.trim(),
        startDateTime: draftEvent.allDay
          ? `${draftEvent.startDateTime}T00:00:00`
          : new Date(draftEvent.startDateTime).toISOString(),
        endDateTime:
          draftEvent.allDay || !draftEvent.endDateTime
            ? undefined
            : new Date(draftEvent.endDateTime).toISOString(),
        location: draftEvent.location.trim() || undefined,
        description: draftEvent.description.trim() || undefined,
        allDay: draftEvent.allDay,
      });

      setSaveSuccess("Event added.");
      setComposerOpen(false);
      setSelectedEvent(createdEvent);
      await loadEvents(false);
    } catch (error) {
      setSaveError((error as Error).message || "Could not create the event.");
    } finally {
      setSaving(false);
    }
  };

  const sortedEvents = useMemo(
    () =>
      events
        .slice()
        .sort(
          (left, right) =>
            parseEventDate(left).getTime() - parseEventDate(right).getTime(),
        ),
    [events],
  );

  const weekDays = useMemo(() => buildWeekDays(selectedDate), [selectedDate]);
  const selectedWeekStart = weekDays[0]!;
  const selectedWeekEnd = weekDays[6]!;

  // Filter events for the selected date
  const filteredEvents = useMemo(() => {
    return sortedEvents.filter(event => {
      const eventDate = parseEventDate(event);
      return eventDate.toDateString() === selectedDate.toDateString();
    });
  }, [sortedEvents, selectedDate]);

  const visibleEvents = useMemo(() => {
    if (viewMode === "day") return filteredEvents;
    const weekStartMs = startOfDay(selectedWeekStart).getTime();
    const weekEnd = startOfDay(selectedWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndMs = weekEnd.getTime();
    return sortedEvents.filter((event) => {
      const eventMs = parseEventDate(event).getTime();
      return eventMs >= weekStartMs && eventMs < weekEndMs;
    });
  }, [filteredEvents, selectedWeekStart, sortedEvents, viewMode]);

  const weekEventsByDay = useMemo(() => {
    const next = new Map<string, CalendarEvent[]>();
    weekDays.forEach((date) => next.set(date.toDateString(), []));
    visibleEvents.forEach((event) => {
      const key = parseEventDate(event).toDateString();
      next.get(key)?.push(event);
    });
    return next;
  }, [visibleEvents, weekDays]);

  const moveDate = (direction: -1 | 1) => {
    setSelectedDate((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + direction * (viewMode === "week" ? 7 : 1));
      return next;
    });
  };

  const selectedRangeLabel =
    viewMode === "week"
      ? `${selectedWeekStart.toLocaleDateString([], { month: "short", day: "numeric" })} - ${selectedWeekEnd.toLocaleDateString([], { month: "short", day: "numeric" })}`
      : selectedDate.toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

  const timelineHours = useMemo(() => {
    const eventHours = filteredEvents
      .filter((event) => !event.allDay)
      .map((event) => parseEventDate(event).getHours());
    const earliest = Math.min(9, ...eventHours);
    const latest = Math.max(13, ...eventHours);
    return Array.from(
      { length: Math.min(12, Math.max(4, latest - earliest + 1)) },
      (_, index) => earliest + index,
    );
  }, [filteredEvents]);

  const renderEventDetail = () => {
    if (!selectedEvent) return null;

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-4 flex items-start gap-3">
          <button
            type="button"
            onClick={() => setSelectedEvent(null)}
            className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ether-control-bg)] transition hover:bg-[var(--ether-control-hover)] ${theme.onSurface}`}
            aria-label="Back to calendar"
          >
            <ArrowLeft size={14} />
          </button>
          <div className="min-w-0 flex-1">
            <WidgetText variant="label" tone="muted">
              Event Detail
            </WidgetText>
            <h3
              className={`mt-1 text-xl font-semibold tracking-[-0.03em] ${theme.onSurface}`}
            >
              {selectedEvent.title}
            </h3>
            <div className={`mt-2 text-sm ${theme.onSurfaceVariant}`}>
              {formatEventRange(selectedEvent)}
            </div>
          </div>
        </div>

        <div className="dashboard-widget-touch-scroll min-h-0 flex-1 space-y-3 pr-1">
          <div className="rounded-[1.45rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] p-4">
            <WidgetText variant="label" tone="muted">
              When
            </WidgetText>
            <div className={`mt-2 text-base font-semibold ${theme.onSurface}`}>
              {selectedEvent.allDay
                ? "All-day"
                : formatRelativeTime(
                  selectedEvent.startDateTime || selectedEvent.startTime,
                )}
            </div>
            <div className={`mt-1 text-sm ${theme.onSurfaceVariant}`}>
              {formatEventRange(selectedEvent)}
            </div>
          </div>

          {selectedEvent.location && (
            <div className="rounded-[1.45rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] p-4">
              <div className="flex items-center gap-2">
                <MapPin size={12} className="text-[var(--ether-rose)]" />
                <WidgetText variant="label" tone="muted">Location</WidgetText>
              </div>
              <div className={`mt-2 text-sm ${theme.onSurface}`}>
                {selectedEvent.location}
              </div>
            </div>
          )}

          {selectedEvent.description && (
            <div className="rounded-[1.45rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] p-4">
              <div className="flex items-center gap-2">
                <FileText size={12} className="text-[var(--ether-sky)]" />
                <WidgetText variant="label" tone="muted">Notes</WidgetText>
              </div>
              <div
                className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${theme.onSurfaceVariant}`}
              >
                {selectedEvent.description}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderComposer = () => (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex items-start gap-3">
        <button
          type="button"
          onClick={() => setComposerOpen(false)}
          className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ether-control-bg)] transition hover:bg-[var(--ether-control-hover)] ${theme.onSurface}`}
          aria-label="Back to calendar"
        >
          <ArrowLeft size={14} />
        </button>
        <div className="min-w-0 flex-1">
          <WidgetText variant="label" tone="muted">
            New Event
          </WidgetText>
          <h3
            className={`mt-1 text-xl font-semibold tracking-[-0.03em] ${theme.onSurface}`}
          >
            Add to calendar
          </h3>
        </div>
      </div>

      <div className="dashboard-widget-touch-scroll min-h-0 flex-1 space-y-3 pr-1">
        <label className="block">
          <span className="mb-2 block">
            <WidgetText variant="label" tone="muted">Title</WidgetText>
          </span>
          <input
            value={draftEvent.title}
            onChange={(event) =>
              setDraftEvent((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            placeholder="Deep work block"
            className="w-full rounded-[1.1rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-4 py-3 text-sm outline-none transition focus:border-[var(--ether-primary)]/35"
          />
        </label>

        <button
          type="button"
          onClick={() =>
            setDraftEvent((current) => ({
              ...current,
              allDay: !current.allDay,
              startDateTime: !current.allDay
                ? current.startDateTime.slice(0, 10)
                : `${current.startDateTime}T09:00`,
              endDateTime: !current.allDay
                ? current.endDateTime.slice(0, 10)
                : `${current.endDateTime || current.startDateTime}T10:00`,
            }))
          }
          className={`rounded-2xl border px-3 py-3 text-left text-sm font-medium transition ${draftEvent.allDay
              ? "border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/10 text-[var(--ether-on-surface)]"
              : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)]"
            }`}
        >
          All-day event
        </button>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block">
              <WidgetText variant="label" tone="muted">{draftEvent.allDay ? "Date" : "Starts"}</WidgetText>
            </span>
            <input
              type={draftEvent.allDay ? "date" : "datetime-local"}
              value={draftEvent.startDateTime}
              onChange={(event) =>
                setDraftEvent((current) => ({
                  ...current,
                  startDateTime: event.target.value,
                }))
              }
              className="w-full rounded-[1.1rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-4 py-3 text-sm outline-none transition focus:border-[var(--ether-primary)]/35"
            />
          </label>

          {!draftEvent.allDay && (
            <label className="block">
              <span className="mb-2 block">
                <WidgetText variant="label" tone="muted">Ends</WidgetText>
              </span>
              <input
                type="datetime-local"
                value={draftEvent.endDateTime}
                onChange={(event) =>
                  setDraftEvent((current) => ({
                    ...current,
                    endDateTime: event.target.value,
                  }))
                }
                className="w-full rounded-[1.1rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-4 py-3 text-sm outline-none transition focus:border-[var(--ether-primary)]/35"
              />
            </label>
          )}
        </div>

        <label className="block">
          <span className="mb-2 block">
            <WidgetText variant="label" tone="muted">Location</WidgetText>
          </span>
          <input
            value={draftEvent.location}
            onChange={(event) =>
              setDraftEvent((current) => ({
                ...current,
                location: event.target.value,
              }))
            }
            placeholder="Studio, Zoom, Brooklyn"
            className="w-full rounded-[1.1rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-4 py-3 text-sm outline-none transition focus:border-[var(--ether-primary)]/35"
          />
        </label>

        <label className="block">
          <span className="mb-2 block">
            <WidgetText variant="label" tone="muted">Notes</WidgetText>
          </span>
          <textarea
            value={draftEvent.description}
            onChange={(event) =>
              setDraftEvent((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            rows={4}
            placeholder="Agenda, call notes, links, prep items"
            className="w-full resize-none rounded-[1.1rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-4 py-3 text-sm outline-none transition focus:border-[var(--ether-primary)]/35"
          />
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div
          className={`text-[11px] ${saveError ? "text-[var(--ether-error)]" : "text-[var(--ether-on-surface-variant)]"}`}
        >
          {saveError ||
            saveSuccess ||
            "The widget will save this event to the connected calendar account."}
        </div>
        <button
          type="button"
          onClick={() => void handleCreateEvent()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--ether-control-active-bg)] px-4 py-2 text-sm font-semibold text-[var(--ether-control-active-text)] transition disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Plus size={14} />
          )}
          Save
        </button>
      </div>
    </div>
  );

  const renderWeekBoard = (compactStudio: boolean) => {
    const maxEventsPerDay = compactStudio ? 2 : size.pixelWidth >= 620 ? 4 : 3;

    return (
      <div
        data-testid="calendar-week-board"
        className={`dashboard-widget-touch-scroll min-h-0 flex-1 overflow-y-auto pr-1 ${compactStudio ? "grid grid-cols-1 gap-2" : "grid grid-cols-7 gap-2"
          }`}
      >
        {weekDays.map((date) => {
          const dayEvents = weekEventsByDay.get(date.toDateString()) || [];
          const isSelected = date.toDateString() === selectedDate.toDateString();
          const isToday = date.toDateString() === today.toDateString();
          const isHovered = isDayHighlighted(date);
          return (
            <div
              key={date.toISOString()}
              data-testid="calendar-week-day"
              data-hover-highlight={isHovered ? "true" : undefined}
              className={`min-w-0 rounded-[1.2rem] border p-2 transition ${isSelected
                  ? "border-[var(--ether-rose)]/35 bg-[var(--ether-rose)]/10"
                  : "border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/80"
                } ${isHovered ? hoverHighlightClass : ""}`}
            >
              <button
                type="button"
                onClick={() => setSelectedDate(date)}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-1 py-1 text-left transition hover:bg-[var(--ether-control-hover)]"
              >
                <span className="min-w-0">
                  <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--ether-on-surface-variant)]">
                    {date.toLocaleDateString([], { weekday: compactStudio ? "long" : "short" })}
                  </span>
                  <span className="mt-0.5 block text-lg font-semibold leading-none text-[var(--ether-on-surface)]">
                    {date.getDate()}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold tabular-nums ${isToday
                      ? "bg-[var(--ether-rose)] text-black"
                      : "bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)]"
                    }`}
                >
                  {dayEvents.length}
                </span>
              </button>
              <div className="mt-2 grid gap-1.5">
                {dayEvents.slice(0, maxEventsPerDay).map((event, eventIndex) => {
                  const timeBadge = getEventTimeBadge(event);
                  return (
                    <button
                      key={event.id || `${date.toISOString()}-${eventIndex}`}
                      type="button"
                      onClick={() => openEventDetail(event)}
                      onMouseEnter={() => emitEventHover(event)}
                      onMouseLeave={emitHoverEnd}
                      className="min-w-0 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-2 py-2 text-left transition hover:bg-[var(--ether-control-hover)]"
                    >
                      <span className="block truncate text-[11px] font-semibold text-[var(--ether-on-surface)]">
                        {event.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--ether-on-surface-variant)]">
                        {event.allDay ? "All day" : `${timeBadge.primary}${timeBadge.secondary ? ` ${timeBadge.secondary}` : ""}`}
                      </span>
                    </button>
                  );
                })}
                {dayEvents.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[var(--ether-glass-border)] px-2 py-3 text-center text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)] opacity-65">
                    Clear
                  </div>
                )}
                {dayEvents.length > maxEventsPerDay && (
                  <div className="px-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-rose)]">
                    +{dayEvents.length - maxEventsPerDay} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderStudioCalendar = () => {
    const compactStudio =
      size.isCompact || size.pixelWidth < 460 || size.pixelHeight < 360;
    const eventLimit = compactStudio ? Math.min(3, maxItems) : maxItems;
    const displayedEvents = filteredEvents.slice(0, eventLimit);
    const nowHour = today.getHours();
    const nowMinute = today.getMinutes();
    const isShowingCurrentDay = selectedDate.toDateString() === today.toDateString();
    const currentHourVisible = timelineHours.includes(nowHour) && isShowingCurrentDay;

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-4 flex shrink-0 items-end justify-between gap-3">
          <h2
            className={`font-headline text-2xl leading-none tracking-[-0.045em] text-[var(--ether-on-surface)] ${compactStudio ? "text-xl" : ""}`}
          >
            {viewMode === "week"
              ? `Week of ${selectedWeekStart.toLocaleDateString([], { month: "long", day: "numeric" })}`
              : selectedDate.toLocaleDateString([], {
                weekday: compactStudio ? "short" : "long",
                month: "long",
                day: "numeric",
              })}
          </h2>
          {!compactStudio && (
            <div className="rounded-full bg-[var(--ether-control-bg)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
              {viewMode === "week" ? visibleEvents.length : filteredEvents.length} planned
            </div>
          )}
        </div>

        {!compactStudio && viewMode === "week" && (
          <div className="mb-5 grid shrink-0 grid-cols-7 gap-1 text-center relative z-0">
            {weekDays.map((date) => {
              const isSelected = date.toDateString() === selectedDate.toDateString();
              const isToday = date.toDateString() === today.toDateString();
              return (
                <button
                  key={date.toISOString()}
                  onClick={() => setSelectedDate(date)}
                  className={`relative flex flex-col items-center rounded-full py-2 text-[10px] font-bold transition-all ${isSelected
                      ? "text-[var(--ether-surface)]"
                      : "text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
                    } ${isToday && !isSelected ? "ring-1 ring-[var(--ether-rose)]/40" : ""}`}
                >
                  {isSelected && (
                    <motion.div
                      layoutId={`calendarActiveDay-${widget.id}`}
                      className="absolute inset-0 -z-10 rounded-full bg-[var(--ether-on-surface)] shadow-md"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="opacity-70">{date.toLocaleDateString([], { weekday: "short" })}</span>
                  <span className="text-base font-medium">
                    {date.getDate()}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {viewMode === "week" ? renderWeekBoard(compactStudio) : (
          <div
            data-testid="calendar-studio-timeline"
            className="relative dashboard-widget-touch-scroll min-h-0 flex-1 pr-1"
          >
            {displayedEvents.length === 0 && !loading ? (
              <div className="flex h-full flex-col items-center justify-center opacity-35">
                <Clock size={30} className="mb-2" />
                <div className="text-center">
                  <WidgetText variant="label" align="center">Clear Schedule</WidgetText>
                  <div className="text-[8px] tracking-normal font-medium">No events for this day</div>
                </div>
              </div>
            ) : (
              <div className={`relative ${compactStudio ? "space-y-2" : "space-y-3"}`}>
                <div className="absolute bottom-0 left-[2.2rem] top-2 w-px bg-gradient-to-b from-[var(--ether-glass-border)] to-transparent" />
                {timelineHours.map((hour, index) => {
                  const hourEvents = displayedEvents.filter(
                    (event) =>
                      !event.allDay && parseEventDate(event).getHours() === hour,
                  );
                  return (
                    <motion.div
                      key={hour}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="relative flex items-center gap-3"
                    >
                      <span className="w-10 shrink-0 text-right pr-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ether-on-surface-variant)]">
                        {formatHourLabel(hour)}
                      </span>
                      {hourEvents.length > 0 ? (
                        <div className="grid min-w-0 flex-1 gap-2 z-10">
                          {hourEvents.map((event, eventIndex) => {
                            const accentColor = EVENT_ACCENTS[eventIndex % EVENT_ACCENTS.length];
                            const bgColor = accentColor.replace('border-', 'bg-').replace('-400', '-500');
                            return (
                              <motion.button
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.98 }}
                                key={event.id || `${hour}-${eventIndex}`}
                                type="button"
                                onClick={() => openEventDetail(event)}
                                onMouseEnter={() => emitEventHover(event)}
                                onMouseLeave={emitHoverEnd}
                                className={`group relative truncate rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/80 backdrop-blur-sm shadow-sm px-4 py-3 text-left text-sm font-medium text-[var(--ether-on-surface)] transition hover:bg-[var(--ether-surface-container-high)] hover:shadow-md overflow-hidden ${compactStudio ? "py-2 text-xs" : ""}`}
                              >
                                <div className={`absolute bottom-0 left-0 top-0 w-1 opacity-80 ${bgColor}`} />
                                {event.title}
                              </motion.button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="relative min-w-0 flex-1 flex items-center h-full">
                          <div className="absolute left-[-5px] h-[5px] w-[5px] rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]" />
                          <div className="h-px w-full bg-[var(--ether-glass-border)]/50" />
                        </div>
                      )}
                      {currentHourVisible &&
                        hour === nowHour &&
                        !compactStudio && (
                          <div
                            className="pointer-events-none absolute left-0 right-0 z-10 flex items-center gap-2"
                            style={{
                              top: `${Math.min(92, Math.max(8, (nowMinute / 60) * 100))}%`,
                            }}
                          >
                            <span className="w-10 text-[10px] font-bold text-rose-500">
                              {today.toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                            <span className="h-2 w-2 rounded-full bg-rose-500" />
                            <span className="h-px flex-1 bg-rose-500" />
                          </div>
                        )}
                    </motion.div>
                  );
                })}

                {displayedEvents.some((event) => event.allDay) && (
                  <div className="mt-2 grid gap-2">
                    <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ether-rose)] ml-1">All Day</div>
                    {displayedEvents
                      .filter((event) => event.allDay)
                      .map((event) => (
                        <button
                          key={event.id || event.title}
                          type="button"
                          onClick={() => openEventDetail(event)}
                          onMouseEnter={() => emitEventHover(event)}
                          onMouseLeave={emitHoverEnd}
                          className="rounded-xl bg-[var(--ether-control-bg)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] border-l-4 border-rose-500/40"
                        >
                          {event.title}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (size.sizeClass === "tiny") {
    return (
      <WidgetShell bare accent="rose" widget={widget}>
        <div className="flex flex-1 flex-col items-center justify-center">
          <span
            className={`text-4xl font-bold tabular-nums ${theme.onSurface} ${theme.headline}`}
          >
            {visibleEvents.length}
          </span>
          <WidgetText variant="label" tone="muted">
            Events
          </WidgetText>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      widget={widget}
      title={widgetTitle}
      icon={<IconCalendar />}
      accent="rose"
      rightSlot={
        <div className="flex items-center gap-1.5">
          {canCreateEvents && (
            <button
              type="button"
              onClick={openComposer}
              className="dashboard-widget-control-button"
              aria-label="Create event"
            >
              <Plus size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setViewMode(viewMode === "day" ? "week" : "day")}
            className="rounded-lg bg-[var(--ether-control-bg)] px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-[var(--ether-on-surface-variant)] transition-colors hover:bg-[var(--ether-control-hover)]"
          >
            {viewMode}
          </button>
          <button
            type="button"
            onClick={switchCalendarDesign}
            className="rounded-lg bg-[var(--ether-control-bg)] px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-[var(--ether-on-surface-variant)] transition-colors hover:bg-[var(--ether-control-hover)]"
            aria-label={`Switch to ${calendarDesign === "studio" ? "list" : "studio"} calendar design`}
          >
            {calendarDesign === "studio" ? "studio" : "list"}
          </button>
          <button
            type="button"
            onClick={() => refreshNow(false)}
            className="dashboard-widget-control-button"
            aria-label="Refresh calendar"
          >
            <RefreshCcw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {!composerOpen && !selectedEvent && availableProviders.length > 0 && (
          <div
            className="mb-3 flex shrink-0 items-center justify-between gap-2 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-2 py-2"
            data-testid="calendar-date-controls"
          >
            <button
              type="button"
              onClick={() => moveDate(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)]"
              aria-label="Previous date range"
            >
              <ArrowLeft size={13} />
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(new Date())}
              className="min-w-0 flex-1 truncate rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface)] transition hover:bg-[var(--ether-control-hover)]"
              aria-label="Jump to today"
            >
              {selectedRangeLabel}
            </button>
            <button
              type="button"
              onClick={() => moveDate(1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)]"
              aria-label="Next date range"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}

        {availableProviders.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center opacity-60">
            <CalendarIcon size={32} className="mb-2" />
            <WidgetText variant="label" tone="muted" align="center" className="px-4">
              {emptyCalendarMessage}
            </WidgetText>
          </div>
        ) : loading && events.length === 0 ? (
          <WidgetSkeleton variant="list" />
        ) : loadError && events.length === 0 ? (
          <WidgetInlineError message={loadError} widgetId={widget.id} />
        ) : composerOpen ? (
          renderComposer()
        ) : selectedEvent ? (
          renderEventDetail()
        ) : calendarDesign === "studio" ? (
          renderStudioCalendar()
        ) : (
          <div
            data-testid="calendar-agenda-list"
            className="dashboard-widget-touch-scroll min-h-0 flex-1 space-y-2 pr-1"
          >
            {visibleEvents.length === 0 && !loading ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full flex-col items-center justify-center opacity-60">
                <Clock size={32} className="mb-3 text-[var(--ether-on-surface-variant)]" />
                <WidgetText variant="label" tone="muted" align="center">
                  Clear Schedule
                </WidgetText>
              </motion.div>
            ) : (
              <AnimatePresence mode="popLayout">
                {visibleEvents.slice(0, maxItems).map((event, index) => {
                  const timeBadge = getEventTimeBadge(event);
                  const eventTone = EVENT_TONES[index % EVENT_TONES.length];
                  return (
                    <motion.button
                      layout
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.25, delay: index * 0.05 }}
                      key={event.id || index}
                      type="button"
                      onClick={() => openEventDetail(event)}
                      onMouseEnter={() => emitEventHover(event)}
                      onMouseLeave={emitHoverEnd}
                      className="group relative grid w-full grid-cols-[3.9rem_minmax(0,1fr)] items-stretch gap-3 text-left transition-all hover:scale-[1.008]"
                    >
                      <div className="flex shrink-0 flex-col items-end justify-center pr-1 text-right">
                        <span
                          className="text-[10px] font-bold tabular-nums tracking-tight text-[var(--ether-on-surface-variant)]"
                        >
                          {timeBadge.primary}
                        </span>
                        <span className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--ether-on-surface-variant)]/55">
                          {timeBadge.secondary || (event.allDay ? "All" : "")}
                        </span>
                      </div>

                      <div className={`relative min-w-0 overflow-hidden rounded-2xl border px-4 py-3 shadow-sm backdrop-blur-sm transition hover:shadow-md ${eventTone.border} ${eventTone.bg}`}>
                        <div className={`absolute bottom-0 left-0 top-0 w-1 ${eventTone.bar}`} />
                        <div
                          className={`truncate text-[14px] font-semibold tracking-tight ${theme.onSurface}`}
                        >
                          {event.title}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-medium opacity-40">
                            {formatRelativeTime(
                              event.startDateTime || event.startTime,
                            )}
                          </span>
                          {event.endTime && !event.allDay && (
                            <span className="text-[10px] font-medium opacity-20">
                              • Until {event.endTime}
                            </span>
                          )}
                        </div>
                        {event.location && (
                          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--ether-on-surface-variant)]">
                            <MapPin
                              size={11}
                              className="text-[var(--ether-rose)]"
                            />
                            <span className="truncate">{event.location}</span>
                          </div>
                        )}
                      </div>

                      <ChevronRight
                        size={16}
                        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 transition-all duration-300 group-hover:opacity-60 group-hover:translate-x-1"
                      />
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        )}

        {saveSuccess && !composerOpen && !selectedEvent && (
          <div className="mt-4 rounded-2xl border border-[var(--ether-rose)]/20 bg-[var(--ether-rose)]/10 px-4 py-3 text-[11px] text-[var(--ether-rose)]">
            {saveSuccess}
          </div>
        )}

        {!composerOpen &&
          !selectedEvent &&
          !size.isCompact &&
          visibleEvents.length > 0 && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              type="button"
              onClick={() => openEventDetail(visibleEvents[0])}
              className="mt-4 flex items-center justify-between rounded-3xl border border-[var(--ether-rose)]/20 bg-gradient-to-br from-[var(--ether-rose)]/10 to-[var(--ether-rose)]/5 p-4 text-left transition-all hover:from-[var(--ether-rose)]/15 hover:to-[var(--ether-rose)]/10 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--ether-rose)] text-black shadow-lg shadow-[var(--ether-rose)]/20">
                  <Clock size={18} strokeWidth={2.5} />
                </div>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--ether-rose)]">
                    Next Up
                  </div>
                  <div
                    className={`max-w-[14rem] truncate text-[13px] tracking-tight font-semibold mt-0.5 ${theme.onSurface}`}
                  >
                    {visibleEvents[0].title}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[14px] font-bold tabular-nums tracking-tight text-[var(--ether-rose)]">
                  {formatRelativeTime(
                    visibleEvents[0].startDateTime || visibleEvents[0].startTime,
                  )}
                </div>
              </div>
            </motion.button>
          )}
      </div>
    </WidgetShell>
  );
};

export default React.memo(CalendarWidget);
