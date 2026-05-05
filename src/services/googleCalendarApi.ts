// src/services/googleCalendarApi.ts
// Google Calendar API -- read, create, update, delete events.
// Uses the same OAuth access token pattern as googlePhotosAPI / googleTasksAPI.

import { getGoogleCalendarAccessToken } from '../utils/settingsStorage';
import { signInWithGoogle, hasRecentUserInteraction, silentRefreshGoogle } from './googleOAuth';
import { setGoogleCalendarAccessToken } from '../utils/settingsStorage';
import { friendlyGoogleError } from '../utils/googleApiErrors';

const CAL_API = 'https://www.googleapis.com/calendar/v3';
const CALENDAR_SCOPES = [
    'https://www.googleapis.com/auth/calendar',
];

export interface CalendarEvent {
    id: string;
    title: string;
    startTime: string;
    endTime?: string;
    startDateTime?: string;
    endDateTime?: string;
    location?: string;
    description?: string;
    allDay: boolean;
    calendarId?: string;
}

interface GCalEvent {
    id: string;
    summary?: string;
    location?: string;
    description?: string;
    start?: { dateTime?: string; date?: string; timeZone?: string };
    end?: { dateTime?: string; date?: string; timeZone?: string };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseGCalEvent(e: GCalEvent): CalendarEvent {
    const allDay = !e.start?.dateTime;
    const startRaw = e.start?.dateTime || e.start?.date || '';
    const endRaw = e.end?.dateTime || e.end?.date || '';

    let startTime = startRaw;
    let endTime = endRaw;

    if (!allDay && startRaw) {
        startTime = new Date(startRaw).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        });
        if (endRaw) {
            endTime = new Date(endRaw).toLocaleString(undefined, {
                hour: 'numeric', minute: '2-digit',
            });
        }
    } else if (allDay && startRaw) {
        startTime = new Date(startRaw + 'T00:00:00').toLocaleDateString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric',
        });
        endTime = '';
    }

    return {
        id: e.id,
        title: e.summary || '(No title)',
        startTime,
        endTime,
        startDateTime: e.start?.dateTime || (e.start?.date ? `${e.start.date}T00:00:00` : undefined),
        endDateTime: e.end?.dateTime || (e.end?.date ? `${e.end.date}T00:00:00` : undefined),
        location: e.location,
        description: e.description,
        allDay,
    };
}

async function ensureToken(): Promise<string> {
    let token = getGoogleCalendarAccessToken();
    if (token) return token;

    // Try silent refresh first (hidden iframe, no UI)
    try {
        const result = await silentRefreshGoogle(CALENDAR_SCOPES);
        token = result.accessToken;
        setGoogleCalendarAccessToken(token);
        return token;
    } catch { /* silent refresh failed */ }

    // Fall back to interactive popup only if user is active
    if (!hasRecentUserInteraction()) {
        throw new Error('Google Calendar token expired. Interact with the page to re-authenticate.');
    }

    const result = await signInWithGoogle(CALENDAR_SCOPES);
    token = result.accessToken;
    setGoogleCalendarAccessToken(token);
    return token;
}

async function calFetch(path: string, init?: RequestInit): Promise<Response> {
    const token = await ensureToken();
    const res = await fetch(`${CAL_API}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...init?.headers,
        },
    });

    if (res.status === 401) {
        // Token expired -- clear and attempt silent refresh
        setGoogleCalendarAccessToken('');

        try {
            const silentResult = await silentRefreshGoogle(CALENDAR_SCOPES);
            setGoogleCalendarAccessToken(silentResult.accessToken);
            return fetch(`${CAL_API}${path}`, {
                ...init,
                headers: {
                    Authorization: `Bearer ${silentResult.accessToken}`,
                    'Content-Type': 'application/json',
                    ...init?.headers,
                },
            });
        } catch { /* silent refresh failed */ }

        if (!hasRecentUserInteraction()) {
            throw new Error('Google Calendar token expired. Interact with the page to re-authenticate.');
        }
        const freshToken = (await signInWithGoogle(CALENDAR_SCOPES)).accessToken;
        setGoogleCalendarAccessToken(freshToken);
        return fetch(`${CAL_API}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${freshToken}`,
                'Content-Type': 'application/json',
                ...init?.headers,
            },
        });
    }

    return res;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * List upcoming events from the user's primary calendar.
 * @param maxResults Max events to return (default 10).
 * @param timeMinISO Optional ISO start bound (defaults to now).
 * @param timeMaxISO Optional ISO end bound.
 */
export async function listEvents(
    maxResults = 10,
    timeMinISO?: string,
    timeMaxISO?: string,
): Promise<CalendarEvent[]> {
    const now = new Date().toISOString();
    const params = new URLSearchParams({
        maxResults: String(maxResults),
        timeMin: timeMinISO || now,
        singleEvents: 'true',
        orderBy: 'startTime',
    });
    if (timeMaxISO) params.set('timeMax', timeMaxISO);

    const res = await calFetch(`/calendars/primary/events?${params}`);
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(friendlyGoogleError(new Error(err?.error?.message || `Calendar API ${res.status}`)));
    }
    const data = await res.json();
    return (data.items || []).map(parseGCalEvent);
}

/**
 * Create a new calendar event.
 */
export async function createEvent(opts: {
    title: string;
    startDateTime: string; // RFC 3339 with offset
    endDateTime?: string;
    location?: string;
    description?: string;
    allDay?: boolean;
}): Promise<CalendarEvent> {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const body: Record<string, any> = {
        summary: opts.title,
        location: opts.location,
        description: opts.description,
    };

    if (opts.allDay) {
        // All-day events use date-only strings (YYYY-MM-DD)
        const dateStr = opts.startDateTime.slice(0, 10);
        body.start = { date: dateStr };
        // End date for all-day is exclusive, so add 1 day
        const end = new Date(dateStr + 'T00:00:00');
        end.setDate(end.getDate() + 1);
        const endStr = end.toISOString().slice(0, 10);
        body.end = { date: endStr };
    } else {
        body.start = { dateTime: opts.startDateTime, timeZone };
        if (opts.endDateTime) {
            body.end = { dateTime: opts.endDateTime, timeZone };
        } else {
            // Default to 1 hour duration
            const start = new Date(opts.startDateTime);
            start.setHours(start.getHours() + 1);
            body.end = { dateTime: start.toISOString(), timeZone };
        }
    }

    const res = await calFetch('/calendars/primary/events', {
        method: 'POST',
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(friendlyGoogleError(new Error(err?.error?.message || `Create event failed: ${res.status}`)));
    }

    return parseGCalEvent(await res.json());
}

/**
 * Update an existing calendar event.
 */
export async function updateEvent(eventId: string, opts: {
    title?: string;
    startDateTime?: string;
    endDateTime?: string;
    location?: string;
    description?: string;
}): Promise<CalendarEvent> {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const body: Record<string, any> = {};

    if (opts.title !== undefined) body.summary = opts.title;
    if (opts.location !== undefined) body.location = opts.location;
    if (opts.description !== undefined) body.description = opts.description;
    if (opts.startDateTime) body.start = { dateTime: opts.startDateTime, timeZone };
    if (opts.endDateTime) body.end = { dateTime: opts.endDateTime, timeZone };

    const res = await calFetch(`/calendars/primary/events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(friendlyGoogleError(new Error(err?.error?.message || `Update event failed: ${res.status}`)));
    }

    return parseGCalEvent(await res.json());
}

/**
 * Delete a calendar event.
 */
export async function deleteEvent(eventId: string): Promise<void> {
    const res = await calFetch(`/calendars/primary/events/${eventId}`, {
        method: 'DELETE',
    });

    if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => null);
        throw new Error(friendlyGoogleError(new Error(err?.error?.message || `Delete event failed: ${res.status}`)));
    }
}
