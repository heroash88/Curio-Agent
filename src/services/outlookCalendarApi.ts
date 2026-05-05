// src/services/outlookCalendarApi.ts
// Microsoft Outlook Calendar API via Microsoft Graph.
// Mirrors the pattern of googleCalendarApi.ts.

import { getOutlookCalendarAccessToken, setOutlookCalendarAccessToken } from '../utils/settingsStorage';
import { signInWithMicrosoft, silentRefreshMicrosoft } from './microsoftOAuth';
import { hasRecentUserInteraction } from './googleOAuth';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';
const CALENDAR_SCOPES = [
    'Calendars.Read',
    'Calendars.ReadWrite',
];

export interface OutlookEvent {
    id: string;
    title: string;
    startTime: string;
    endTime?: string;
    startDateTime?: string;
    endDateTime?: string;
    location?: string;
    description?: string;
    allDay: boolean;
}

interface GraphEvent {
    id: string;
    subject?: string;
    bodyPreview?: string;
    isAllDay?: boolean;
    location?: { displayName?: string };
    start?: { dateTime?: string; timeZone?: string };
    end?: { dateTime?: string; timeZone?: string };
}

// -- Helpers --

function parseGraphEvent(e: GraphEvent): OutlookEvent {
    const allDay = !!e.isAllDay;
    const startRaw = e.start?.dateTime || '';
    const endRaw = e.end?.dateTime || '';

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
        startTime = new Date(startRaw).toLocaleDateString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric',
        });
        endTime = '';
    }

    return {
        id: e.id,
        title: e.subject || '(No title)',
        startTime,
        endTime,
        startDateTime: e.start?.dateTime,
        endDateTime: e.end?.dateTime,
        location: e.location?.displayName,
        description: e.bodyPreview,
        allDay,
    };
}

async function ensureToken(): Promise<string> {
    let token = getOutlookCalendarAccessToken();
    if (token) return token;

    // Try silent refresh first (hidden iframe, no UI)
    try {
        const result = await silentRefreshMicrosoft(CALENDAR_SCOPES);
        token = result.accessToken;
        setOutlookCalendarAccessToken(token);
        return token;
    } catch { /* silent refresh failed */ }

    if (!hasRecentUserInteraction()) {
        throw new Error('Outlook Calendar token expired. Interact with the page to re-authenticate.');
    }
    const result = await signInWithMicrosoft(CALENDAR_SCOPES);
    token = result.accessToken;
    setOutlookCalendarAccessToken(token);
    return token;
}

async function graphFetch(path: string, init?: RequestInit): Promise<Response> {
    const token = await ensureToken();
    const res = await fetch(`${GRAPH_API}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...init?.headers,
        },
    });
    if (res.status === 401) {
        setOutlookCalendarAccessToken('');

        // Try silent refresh first
        try {
            const silentResult = await silentRefreshMicrosoft(CALENDAR_SCOPES);
            setOutlookCalendarAccessToken(silentResult.accessToken);
            return fetch(`${GRAPH_API}${path}`, {
                ...init,
                headers: {
                    Authorization: `Bearer ${silentResult.accessToken}`,
                    'Content-Type': 'application/json',
                    ...init?.headers,
                },
            });
        } catch { /* silent refresh failed */ }

        if (!hasRecentUserInteraction()) {
            throw new Error('Outlook Calendar token expired. Interact with the page to re-authenticate.');
        }
        const freshToken = (await signInWithMicrosoft(CALENDAR_SCOPES)).accessToken;
        setOutlookCalendarAccessToken(freshToken);
        return fetch(`${GRAPH_API}${path}`, {
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

// -- Public API --

export async function listEvents(
    maxResults = 10,
    timeMinISO?: string,
    timeMaxISO?: string,
): Promise<OutlookEvent[]> {
    const now = new Date().toISOString();
    const filter = `start/dateTime ge '${timeMinISO || now}'`;
    const params = new URLSearchParams({
        $top: String(maxResults),
        $orderby: 'start/dateTime',
        $filter: filter,
    });
    if (timeMaxISO) {
        params.set('$filter', `${filter} and end/dateTime le '${timeMaxISO}'`);
    }

    const res = await graphFetch(`/me/calendarView?startDateTime=${encodeURIComponent(timeMinISO || now)}&endDateTime=${encodeURIComponent(timeMaxISO || new Date(Date.now() + 7 * 86400000).toISOString())}&$top=${maxResults}&$orderby=start/dateTime`);
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || `Outlook Calendar API ${res.status}`);
    }
    const data = await res.json();
    return (data.value || []).map(parseGraphEvent);
}

export async function createEvent(opts: {
    title: string;
    startDateTime: string;
    endDateTime?: string;
    location?: string;
    description?: string;
    allDay?: boolean;
}): Promise<OutlookEvent> {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const body: Record<string, any> = {
        subject: opts.title,
        isAllDay: !!opts.allDay,
    };

    if (opts.location) body.location = { displayName: opts.location };
    if (opts.description) body.body = { contentType: 'text', content: opts.description };

    if (opts.allDay) {
        const dateStr = opts.startDateTime.slice(0, 10);
        body.start = { dateTime: dateStr + 'T00:00:00', timeZone };
        const end = new Date(dateStr + 'T00:00:00');
        end.setDate(end.getDate() + 1);
        body.end = { dateTime: end.toISOString().slice(0, 10) + 'T00:00:00', timeZone };
    } else {
        body.start = { dateTime: opts.startDateTime, timeZone };
        if (opts.endDateTime) {
            body.end = { dateTime: opts.endDateTime, timeZone };
        } else {
            const start = new Date(opts.startDateTime);
            start.setHours(start.getHours() + 1);
            body.end = { dateTime: start.toISOString(), timeZone };
        }
    }

    const res = await graphFetch('/me/events', {
        method: 'POST',
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || `Create event failed: ${res.status}`);
    }
    return parseGraphEvent(await res.json());
}

export async function updateEvent(eventId: string, opts: {
    title?: string;
    startDateTime?: string;
    endDateTime?: string;
    location?: string;
    description?: string;
}): Promise<OutlookEvent> {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const body: Record<string, any> = {};

    if (opts.title !== undefined) body.subject = opts.title;
    if (opts.location !== undefined) body.location = { displayName: opts.location };
    if (opts.description !== undefined) body.body = { contentType: 'text', content: opts.description };
    if (opts.startDateTime) body.start = { dateTime: opts.startDateTime, timeZone };
    if (opts.endDateTime) body.end = { dateTime: opts.endDateTime, timeZone };

    const res = await graphFetch(`/me/events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || `Update event failed: ${res.status}`);
    }
    return parseGraphEvent(await res.json());
}

export async function deleteEvent(eventId: string): Promise<void> {
    const res = await graphFetch(`/me/events/${eventId}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || `Delete event failed: ${res.status}`);
    }
}
