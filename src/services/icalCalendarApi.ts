export interface ICalCalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  startDateTime?: string;
  endDateTime?: string;
  location?: string;
  description?: string;
  allDay: boolean;
  calendarSourceId: string;
  calendarSourceName: string;
  recurrence?: ICalRecurrenceRule;
}

export interface ICalCalendarSource {
  id: string;
  name: string;
  importedAt: number;
  eventCount: number;
  events: ICalCalendarEvent[];
}

export interface ICalParseOptions {
  fallbackName?: string;
  sourceId?: string;
}

export interface ICalImportOptions {
  name: string;
  content: string;
  now?: number;
}

export interface ICalRecurrenceRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count?: number;
  until?: string;
  byDay?: string[];
}

interface ICalProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

const ICAL_STORAGE_KEY = "curio_ical_calendar_sources";
const ICAL_CHANGED_EVENT = "curio:ical-calendars-changed";
const WEEKDAY_INDEX: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const isBrowser = () => typeof window !== "undefined";

const dispatchICalChanged = () => {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event("storage"));
  window.dispatchEvent(new CustomEvent("curio:settings-changed"));
  window.dispatchEvent(new CustomEvent(ICAL_CHANGED_EVENT));
};

const createSourceId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `ical_${crypto.randomUUID()}`;
  }
  return `ical_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const unfoldICalLines = (content: string): string[] => {
  const rawLines = content.replace(/\r\n?/g, "\n").split("\n");
  const lines: string[] = [];

  for (const line of rawLines) {
    if (!line) continue;
    if (/^[ \t]/.test(line) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line.trimEnd());
    }
  }

  return lines;
};

const parseProperty = (line: string): ICalProperty | null => {
  const colonIndex = line.indexOf(":");
  if (colonIndex < 0) return null;

  const left = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const [rawName, ...rawParams] = left.split(";");
  const params: Record<string, string> = {};

  rawParams.forEach((param) => {
    const [key, ...valueParts] = param.split("=");
    if (!key || valueParts.length === 0) return;
    params[key.toUpperCase()] = valueParts.join("=");
  });

  return {
    name: rawName.toUpperCase(),
    params,
    value,
  };
};

const unescapeICalText = (value = ""): string =>
  value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();

const normalizeDatePart = (value: string): string =>
  `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;

const parseICalDateValue = (
  value: string | undefined,
  params: Record<string, string> = {},
) => {
  const raw = (value || "").trim();
  if (!raw) {
    return { iso: undefined, allDay: false };
  }

  if (params.VALUE?.toUpperCase() === "DATE" || /^\d{8}$/.test(raw)) {
    return {
      iso: `${normalizeDatePart(raw)}T00:00:00`,
      allDay: true,
    };
  }

  const match = raw.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/,
  );
  if (!match) {
    const parsed = Date.parse(raw);
    return {
      iso: Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined,
      allDay: false,
    };
  }

  const [, year, month, day, hour, minute, second, zone] = match;
  if (zone === "Z") {
    return {
      iso: new Date(
        Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second),
        ),
      ).toISOString(),
      allDay: false,
    };
  }

  return {
    iso: `${year}-${month}-${day}T${hour}:${minute}:${second}`,
    allDay: false,
  };
};

const formatEventStart = (iso: string | undefined, allDay: boolean): string => {
  if (!iso) return "";
  if (allDay) {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatEventEnd = (iso: string | undefined, allDay: boolean): string => {
  if (!iso || allDay) return "";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
};

const parseRRule = (raw: string | undefined): ICalRecurrenceRule | undefined => {
  if (!raw) return undefined;
  const parts = raw.split(";").reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split("=");
    if (key && value) acc[key.toUpperCase()] = value;
    return acc;
  }, {});

  const freq = parts.FREQ?.toUpperCase();
  if (
    freq !== "DAILY" &&
    freq !== "WEEKLY" &&
    freq !== "MONTHLY" &&
    freq !== "YEARLY"
  ) {
    return undefined;
  }

  const interval = Math.max(1, Number.parseInt(parts.INTERVAL || "1", 10) || 1);
  const count = parts.COUNT
    ? Math.max(1, Number.parseInt(parts.COUNT, 10) || 1)
    : undefined;
  const until = parts.UNTIL
    ? parseICalDateValue(parts.UNTIL).iso
    : undefined;
  const byDay = parts.BYDAY
    ? parts.BYDAY.split(",")
        .map((day) => day.slice(-2).toUpperCase())
        .filter((day) => day in WEEKDAY_INDEX)
    : undefined;

  return {
    freq,
    interval,
    count,
    until,
    byDay,
  };
};

const readEventDate = (properties: Map<string, ICalProperty>) => {
  const startProp = properties.get("DTSTART");
  const endProp = properties.get("DTEND");
  const start = parseICalDateValue(startProp?.value, startProp?.params);
  const end = parseICalDateValue(endProp?.value, endProp?.params);
  return { start, end };
};

const parseEventBlock = (
  properties: ICalProperty[],
  sourceId: string,
  sourceName: string,
): ICalCalendarEvent | null => {
  const propertyMap = new Map<string, ICalProperty>();
  properties.forEach((property) => {
    if (!propertyMap.has(property.name)) {
      propertyMap.set(property.name, property);
    }
  });

  const { start, end } = readEventDate(propertyMap);
  if (!start.iso) return null;

  const uid = unescapeICalText(propertyMap.get("UID")?.value || "");
  const title = unescapeICalText(propertyMap.get("SUMMARY")?.value || "") || "(No title)";
  const description = unescapeICalText(propertyMap.get("DESCRIPTION")?.value || "");
  const location = unescapeICalText(propertyMap.get("LOCATION")?.value || "");

  return {
    id: uid || `${sourceId}_${start.iso}_${title}`,
    title,
    startTime: formatEventStart(start.iso, start.allDay),
    endTime: formatEventEnd(end.iso, start.allDay),
    startDateTime: start.iso,
    endDateTime: end.iso,
    location: location || undefined,
    description: description || undefined,
    allDay: start.allDay,
    calendarSourceId: sourceId,
    calendarSourceName: sourceName,
    recurrence: parseRRule(propertyMap.get("RRULE")?.value),
  };
};

export const parseICalCalendar = (
  content: string,
  options: ICalParseOptions = {},
): { name: string; events: ICalCalendarEvent[] } => {
  const sourceId = options.sourceId || createSourceId();
  const lines = unfoldICalLines(content);
  const calendarProperties: ICalProperty[] = [];
  const eventBlocks: ICalProperty[][] = [];
  let currentEvent: ICalProperty[] | null = null;

  for (const line of lines) {
    const property = parseProperty(line);
    if (!property) continue;

    if (property.name === "BEGIN" && property.value.toUpperCase() === "VEVENT") {
      currentEvent = [];
      continue;
    }

    if (property.name === "END" && property.value.toUpperCase() === "VEVENT") {
      if (currentEvent) eventBlocks.push(currentEvent);
      currentEvent = null;
      continue;
    }

    if (currentEvent) {
      currentEvent.push(property);
    } else {
      calendarProperties.push(property);
    }
  }

  const calendarName =
    unescapeICalText(
      calendarProperties.find((property) => property.name === "X-WR-CALNAME")
        ?.value || "",
    ) ||
    options.fallbackName?.replace(/\.(ics|ical)$/i, "").trim() ||
    "Imported iCal";

  return {
    name: calendarName,
    events: eventBlocks
      .map((block) => parseEventBlock(block, sourceId, calendarName))
      .filter((event): event is ICalCalendarEvent => Boolean(event)),
  };
};

const getStoredSources = (): ICalCalendarSource[] => {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(ICAL_STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter(
          (source): source is ICalCalendarSource =>
            Boolean(source?.id && source?.name && Array.isArray(source?.events)),
        )
      : [];
  } catch {
    return [];
  }
};

const setStoredSources = (sources: ICalCalendarSource[]) => {
  if (!isBrowser()) return;
  localStorage.setItem(ICAL_STORAGE_KEY, JSON.stringify(sources));
  dispatchICalChanged();
};

export const getICalCalendarSources = (): ICalCalendarSource[] =>
  getStoredSources();

export const hasICalCalendarSources = (): boolean =>
  getStoredSources().length > 0;

export const subscribeICalCalendarSources = (
  callback: () => void,
): (() => void) => {
  if (!isBrowser()) return () => {};
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener("curio:settings-changed", handler);
  window.addEventListener(ICAL_CHANGED_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("curio:settings-changed", handler);
    window.removeEventListener(ICAL_CHANGED_EVENT, handler);
  };
};

export const importICalCalendarSource = ({
  name,
  content,
  now = Date.now(),
}: ICalImportOptions): ICalCalendarSource => {
  const id = createSourceId();
  const parsed = parseICalCalendar(content, {
    fallbackName: name,
    sourceId: id,
  });

  if (parsed.events.length === 0) {
    throw new Error("No events were found in that iCal file.");
  }

  const source: ICalCalendarSource = {
    id,
    name: parsed.name,
    importedAt: now,
    eventCount: parsed.events.length,
    events: parsed.events,
  };

  setStoredSources([...getStoredSources(), source]);
  return source;
};

export const removeICalCalendarSource = (sourceId: string): void => {
  setStoredSources(getStoredSources().filter((source) => source.id !== sourceId));
};

const parseRangeDate = (value: string | undefined, fallback: number): Date => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return new Date(Number.isFinite(parsed) ? parsed : fallback);
};

const eventStartMs = (event: ICalCalendarEvent): number =>
  Date.parse(event.startDateTime || event.startTime);

const eventEndMs = (event: ICalCalendarEvent): number => {
  const parsed = Date.parse(event.endDateTime || "");
  if (Number.isFinite(parsed)) return parsed;
  return eventStartMs(event) + (event.allDay ? 86400000 : 3600000);
};

const eventStartsInRange = (
  event: ICalCalendarEvent,
  rangeStart: Date,
  rangeEnd: Date,
): boolean => {
  const start = eventStartMs(event);
  return Number.isFinite(start) && start >= rangeStart.getTime() && start < rangeEnd.getTime();
};

const cloneDate = (date: Date) => new Date(date.getTime());

const addDays = (date: Date, days: number) => {
  return new Date(date.getTime() + days * 86400000);
};

const addMonths = (date: Date, months: number) => {
  const next = cloneDate(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const addYears = (date: Date, years: number) => {
  const next = cloneDate(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
};

const monthsBetween = (from: Date, to: Date): number =>
  (to.getFullYear() - from.getFullYear()) * 12 +
  (to.getMonth() - from.getMonth());

const getFirstCandidateCursor = (
  firstStart: Date,
  rangeStart: Date,
  recurrence: ICalRecurrenceRule,
): Date => {
  if (recurrence.count || rangeStart <= firstStart) {
    return cloneDate(firstStart);
  }

  const diffDays = Math.max(
    0,
    Math.floor((rangeStart.getTime() - firstStart.getTime()) / 86400000),
  );

  if (recurrence.freq === "DAILY") {
    const skipped = Math.floor(diffDays / recurrence.interval);
    return addDays(firstStart, skipped * recurrence.interval);
  }

  if (recurrence.freq === "WEEKLY") {
    if (recurrence.byDay?.length) {
      return addDays(firstStart, Math.max(0, diffDays - 7));
    }
    const skipped = Math.floor(Math.floor(diffDays / 7) / recurrence.interval);
    return addDays(firstStart, skipped * recurrence.interval * 7);
  }

  if (recurrence.freq === "MONTHLY") {
    const skipped = Math.floor(
      Math.max(0, monthsBetween(firstStart, rangeStart)) / recurrence.interval,
    );
    return addMonths(firstStart, skipped * recurrence.interval);
  }

  const skipped = Math.floor(
    Math.max(0, rangeStart.getFullYear() - firstStart.getFullYear()) /
      recurrence.interval,
  );
  return addYears(firstStart, skipped * recurrence.interval);
};

const toStoredIso = (date: Date, referenceIso: string | undefined) =>
  referenceIso?.endsWith("Z")
    ? date.toISOString()
    : `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}T${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}:${`${date.getSeconds()}`.padStart(2, "0")}`;

const buildOccurrence = (
  event: ICalCalendarEvent,
  occurrenceStart: Date,
): ICalCalendarEvent => {
  const originalStart = new Date(event.startDateTime || event.startTime);
  const durationMs = Math.max(
    event.allDay ? 86400000 : 60000,
    eventEndMs(event) - originalStart.getTime(),
  );
  const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
  const startIso = toStoredIso(occurrenceStart, event.startDateTime);
  const endIso = toStoredIso(occurrenceEnd, event.endDateTime || event.startDateTime);

  return {
    ...event,
    id: `${event.id}:${startIso}`,
    startDateTime: startIso,
    endDateTime: endIso,
    startTime: formatEventStart(startIso, event.allDay),
    endTime: formatEventEnd(endIso, event.allDay),
  };
};

const shouldStopRecurrence = (
  occurrenceDate: Date,
  recurrence: ICalRecurrenceRule,
  generatedCount: number,
  rangeEnd: Date,
): boolean => {
  if (generatedCount > 2000) return true;
  if (recurrence.count && generatedCount >= recurrence.count) return true;
  if (recurrence.until && occurrenceDate.getTime() > Date.parse(recurrence.until)) {
    return true;
  }
  return occurrenceDate.getTime() >= rangeEnd.getTime() + 370 * 86400000;
};

const expandRecurringEvent = (
  event: ICalCalendarEvent,
  rangeStart: Date,
  rangeEnd: Date,
): ICalCalendarEvent[] => {
  const recurrence = event.recurrence;
  const firstStart = new Date(event.startDateTime || event.startTime);
  if (!recurrence || Number.isNaN(firstStart.getTime())) return [event];

  const occurrences: ICalCalendarEvent[] = [];
  let generatedCount = 0;

  if (recurrence.freq === "WEEKLY" && recurrence.byDay?.length) {
    let cursor = getFirstCandidateCursor(firstStart, rangeStart, recurrence);
    while (!shouldStopRecurrence(cursor, recurrence, generatedCount, rangeEnd)) {
      const daysSinceStart = Math.floor(
        (cursor.getTime() - firstStart.getTime()) / 86400000,
      );
      const weeksSinceStart = Math.floor(daysSinceStart / 7);
      const matchesInterval = weeksSinceStart % recurrence.interval === 0;
      const matchesDay = recurrence.byDay.includes(
        Object.keys(WEEKDAY_INDEX).find(
          (day) => WEEKDAY_INDEX[day] === cursor.getDay(),
        ) || "",
      );

      if (daysSinceStart >= 0 && matchesInterval && matchesDay) {
        generatedCount += 1;
        const occurrence = buildOccurrence(event, cursor);
        if (eventStartsInRange(occurrence, rangeStart, rangeEnd)) {
          occurrences.push(occurrence);
        }
      }

      cursor = addDays(cursor, 1);
    }
    return occurrences;
  }

  let cursor = getFirstCandidateCursor(firstStart, rangeStart, recurrence);
  while (!shouldStopRecurrence(cursor, recurrence, generatedCount, rangeEnd)) {
    generatedCount += 1;
    const occurrence = buildOccurrence(event, cursor);
    if (eventStartsInRange(occurrence, rangeStart, rangeEnd)) {
      occurrences.push(occurrence);
    }

    if (recurrence.freq === "DAILY") cursor = addDays(cursor, recurrence.interval);
    else if (recurrence.freq === "WEEKLY") cursor = addDays(cursor, recurrence.interval * 7);
    else if (recurrence.freq === "MONTHLY") cursor = addMonths(cursor, recurrence.interval);
    else cursor = addYears(cursor, recurrence.interval);
  }

  return occurrences;
};

export const listICalEvents = async (
  maxResults = 10,
  timeMinISO?: string,
  timeMaxISO?: string,
  sourceId = "all",
): Promise<ICalCalendarEvent[]> => {
  const now = Date.now();
  const rangeStart = parseRangeDate(timeMinISO, now);
  const rangeEnd = parseRangeDate(timeMaxISO, now + 7 * 86400000);
  const selectedSources = getStoredSources().filter(
    (source) => sourceId === "all" || source.id === sourceId,
  );

  return selectedSources
    .flatMap((source) =>
      source.events.flatMap((event) =>
        expandRecurringEvent(event, rangeStart, rangeEnd),
      ),
    )
    .filter((event) => eventStartsInRange(event, rangeStart, rangeEnd))
    .sort((left, right) => eventStartMs(left) - eventStartMs(right))
    .slice(0, Math.max(1, maxResults));
};
