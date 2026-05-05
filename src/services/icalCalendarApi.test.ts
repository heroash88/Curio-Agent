import { beforeEach, describe, expect, it } from "vitest";

import {
  importICalCalendarSource,
  listICalEvents,
  parseICalCalendar,
  removeICalCalendarSource,
} from "./icalCalendarApi";

const sampleCalendar = `BEGIN:VCALENDAR
VERSION:2.0
X-WR-CALNAME:Studio Schedule
BEGIN:VEVENT
UID:event-1@example.com
DTSTART:20260424T170000Z
DTEND:20260424T180000Z
SUMMARY:Design Review
LOCATION:Zoom
DESCRIPTION:Review\\, polish\\nShip notes
END:VEVENT
BEGIN:VEVENT
UID:event-2@example.com
DTSTART;VALUE=DATE:20260425
DTEND;VALUE=DATE:20260426
SUMMARY:Launch Day
END:VEVENT
END:VCALENDAR`;

describe("icalCalendarApi", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("parses timed and all-day iCal events into dashboard calendar events", () => {
    const calendar = parseICalCalendar(sampleCalendar, {
      fallbackName: "Imported",
      sourceId: "source_1",
    });

    expect(calendar.name).toBe("Studio Schedule");
    expect(calendar.events).toHaveLength(2);
    expect(calendar.events[0]).toMatchObject({
      id: "event-1@example.com",
      title: "Design Review",
      location: "Zoom",
      description: "Review, polish\nShip notes",
      allDay: false,
      calendarSourceId: "source_1",
      calendarSourceName: "Studio Schedule",
    });
    expect(calendar.events[0].startDateTime).toBe("2026-04-24T17:00:00.000Z");
    expect(calendar.events[1]).toMatchObject({
      title: "Launch Day",
      allDay: true,
      startDateTime: "2026-04-25T00:00:00",
    });
  });

  it("stores imported iCal sources and lists events in a selected date window", async () => {
    const source = importICalCalendarSource({
      name: "Studio",
      content: sampleCalendar,
      now: 1777060000000,
    });

    const events = await listICalEvents(
      5,
      "2026-04-24T00:00:00.000Z",
      "2026-04-26T00:00:00.000Z",
      source.id,
    );

    expect(events.map((event) => event.title)).toEqual([
      "Design Review",
      "Launch Day",
    ]);

    removeICalCalendarSource(source.id);
    await expect(
      listICalEvents(5, "2026-04-24T00:00:00.000Z", "2026-04-26T00:00:00.000Z", source.id),
    ).resolves.toEqual([]);
  });

  it("expands simple recurring weekly iCal events inside the requested window", async () => {
    const source = importICalCalendarSource({
      name: "Training",
      content: `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:standup@example.com
DTSTART:20260420T160000Z
DTEND:20260420T163000Z
RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=MO,WE
SUMMARY:Team Standup
END:VEVENT
END:VCALENDAR`,
    });

    const events = await listICalEvents(
      10,
      "2026-04-22T00:00:00.000Z",
      "2026-05-01T00:00:00.000Z",
      source.id,
    );

    expect(events.map((event) => event.startDateTime)).toEqual([
      "2026-04-22T16:00:00.000Z",
      "2026-04-27T16:00:00.000Z",
      "2026-04-29T16:00:00.000Z",
    ]);
  });

  it("lists old unbounded daily recurring events in the current window", async () => {
    const source = importICalCalendarSource({
      name: "Habits",
      content: `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:daily@example.com
DTSTART:20200101T150000Z
DTEND:20200101T151500Z
RRULE:FREQ=DAILY
SUMMARY:Daily Check-in
END:VEVENT
END:VCALENDAR`,
    });

    const events = await listICalEvents(
      3,
      "2026-04-24T00:00:00.000Z",
      "2026-04-27T00:00:00.000Z",
      source.id,
    );

    expect(events.map((event) => event.startDateTime)).toEqual([
      "2026-04-24T15:00:00.000Z",
      "2026-04-25T15:00:00.000Z",
      "2026-04-26T15:00:00.000Z",
    ]);
  });
});
