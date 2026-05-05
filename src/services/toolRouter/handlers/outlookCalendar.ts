/**
 * Microsoft Outlook calendar handlers. These run against the Outlook
 * calendar API regardless of the user-preferred provider; the generic
 * get_calendar_events handler picks between providers when asked to.
 */

import { register } from '../router';

register('get_outlook_events', async (args, ctx) => {
    try {
        const { listEvents } = await import('../../outlookCalendarApi');
        const events = await listEvents(
            args.maxResults || 10,
            args.timeMin,
            args.timeMax,
        );
        const dateLabel = args.timeMin
            ? new Date(args.timeMin).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
            : 'Upcoming';
        if (ctx.onCardEvent) {
            try {
                ctx.onCardEvent({
                    type: 'calendar',
                    data: { events, date: `Outlook - ${dateLabel}`, mode: 'view' },
                });
            } catch {}
        }
        return {
            result: {
                success: true,
                source: 'outlook',
                events: events.map(e => ({
                    id: e.id, title: e.title, startTime: e.startTime,
                    endTime: e.endTime, location: e.location, allDay: e.allDay,
                })),
                count: events.length,
            },
            emittedCard: true,
        };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});

register('create_outlook_event', async (args, ctx) => {
    try {
        const { createEvent } = await import('../../outlookCalendarApi');
        const event = await createEvent({
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
                        date: 'New Event',
                        mode: 'created',
                        message: `"${event.title}" added to your Outlook calendar.`,
                    },
                });
            } catch {}
        }
        return { result: { success: true, event, message: `Event "${event.title}" created in Outlook.` }, emittedCard: true };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});

register('update_outlook_event', async (args, ctx) => {
    try {
        const { updateEvent } = await import('../../outlookCalendarApi');
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
                    data: { events: [event], date: 'Updated', mode: 'updated', message: `"${event.title}" updated in Outlook.` },
                });
            } catch {}
        }
        return { result: { success: true, event, message: `Event "${event.title}" updated.` }, emittedCard: true };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});

register('delete_outlook_event', async (args, ctx) => {
    try {
        const { deleteEvent } = await import('../../outlookCalendarApi');
        await deleteEvent(args.eventId);
        const title = args.title || 'Event';
        if (ctx.onCardEvent) {
            try {
                ctx.onCardEvent({
                    type: 'calendar',
                    data: { events: [], date: '', mode: 'deleted', message: `"${title}" removed from Outlook.` },
                });
            } catch {}
        }
        return { result: { success: true, message: `"${title}" deleted from Outlook.` }, emittedCard: true };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});
