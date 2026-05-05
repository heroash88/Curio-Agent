/**
 * Google Calendar handlers with iCal/Outlook fallbacks on read. Create,
 * update, and delete always target the Google provider since that is the
 * primary configured calendar; Outlook has its own dedicated handlers.
 */

import { friendlyGoogleError } from '../../../utils/googleApiErrors';
import { register } from '../router';

register('get_calendar_events', async (args, ctx) => {
    try {
        const [
            { getGoogleCalendarAccessToken, getOutlookCalendarAccessToken },
            { hasICalCalendarSources, listICalEvents },
        ] = await Promise.all([
            import('../../../utils/settingsStorage'),
            import('../../icalCalendarApi'),
        ]);
        const preferredProvider = String(args.provider || args.calendarProvider || 'auto');
        const hasGoogle = Boolean(getGoogleCalendarAccessToken());
        const hasOutlook = Boolean(getOutlookCalendarAccessToken());
        const hasICal = hasICalCalendarSources();
        const provider =
            preferredProvider === 'ical'
                ? 'ical'
                : preferredProvider === 'outlook'
                  ? 'outlook'
                  : preferredProvider === 'google'
                    ? 'google'
                    : hasGoogle
                      ? 'google'
                      : hasOutlook
                        ? 'outlook'
                        : hasICal
                          ? 'ical'
                          : 'google';
        const listEvents =
            provider === 'ical'
                ? listICalEvents
                : provider === 'outlook'
                  ? (await import('../../outlookCalendarApi')).listEvents
                  : (await import('../../googleCalendarApi')).listEvents;
        const events = await listEvents(
            args.maxResults || 10,
            args.timeMin,
            args.timeMax,
            provider === 'ical' ? args.calendarSourceId || 'all' : undefined,
        );
        if (ctx.onCardEvent) {
            const dateLabel = args.timeMin
                ? new Date(args.timeMin).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
                : 'Upcoming';
            const sourceLabel = provider === 'ical' ? 'iCal' : provider === 'outlook' ? 'Outlook' : 'Google';
            try {
                ctx.onCardEvent({
                    type: 'calendar',
                    data: { events, date: `${sourceLabel} - ${dateLabel}`, mode: 'view' },
                });
            } catch {}
        }
        return {
            result: {
                success: true,
                source: provider,
                events: events.map(e => ({
                    id: e.id,
                    title: e.title,
                    startTime: e.startTime,
                    endTime: e.endTime,
                    location: e.location,
                    allDay: e.allDay,
                })),
                count: events.length,
            },
            emittedCard: true,
        };
    } catch (err: any) {
        return { result: { success: false, error: friendlyGoogleError(err) }, emittedCard: false };
    }
});

register('create_calendar_event', async (args, ctx) => {
    try {
        const { createEvent } = await import('../../googleCalendarApi');
        const event = await createEvent({
            title: args.title,
            startDateTime: args.startDateTime,
            endDateTime: args.endDateTime,
            location: args.location,
            description: args.description,
            allDay: args.allDay,
        });
        if (ctx.onCardEvent) {
            try {
                ctx.onCardEvent({
                    type: 'calendar',
                    data: {
                        events: [event],
                        date: 'New Event',
                        mode: 'created',
                        message: `"${event.title}" added to your calendar.`,
                    },
                });
            } catch {}
        }
        return { result: { success: true, event, message: `Event "${event.title}" created.` }, emittedCard: true };
    } catch (err: any) {
        return { result: { success: false, error: friendlyGoogleError(err) }, emittedCard: false };
    }
});

register('update_calendar_event', async (args, ctx) => {
    try {
        const { updateEvent } = await import('../../googleCalendarApi');
        const event = await updateEvent(args.eventId, {
            title: args.title,
            startDateTime: args.startDateTime,
            endDateTime: args.endDateTime,
            location: args.location,
            description: args.description,
        });
        if (ctx.onCardEvent) {
            try {
                ctx.onCardEvent({
                    type: 'calendar',
                    data: {
                        events: [event],
                        date: 'Updated Event',
                        mode: 'updated',
                        message: `"${event.title}" has been updated.`,
                    },
                });
            } catch {}
        }
        return { result: { success: true, event, message: `Event "${event.title}" updated.` }, emittedCard: true };
    } catch (err: any) {
        return { result: { success: false, error: friendlyGoogleError(err) }, emittedCard: false };
    }
});

register('delete_calendar_event', async (args, ctx) => {
    try {
        const { deleteEvent } = await import('../../googleCalendarApi');
        await deleteEvent(args.eventId);
        const title = args.title || 'Event';
        if (ctx.onCardEvent) {
            try {
                ctx.onCardEvent({
                    type: 'calendar',
                    data: {
                        events: [],
                        date: '',
                        mode: 'deleted',
                        message: `"${title}" has been removed from your calendar.`,
                    },
                });
            } catch {}
        }
        return { result: { success: true, message: `Event "${title}" deleted.` }, emittedCard: true };
    } catch (err: any) {
        return { result: { success: false, error: friendlyGoogleError(err) }, emittedCard: false };
    }
});
