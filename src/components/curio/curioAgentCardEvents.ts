import type { CardEvent } from '../../services/cardTypes';
import {
    getHaMcpTokenAsync,
    getHaMcpUrl,
} from '../../utils/settingsStorage';

const loadNotesPersistence = () => import('../../services/notesPersistence');
const loadOfflineSpeech = () => import('../../services/offlineSpeechService');

/**
 * Handle special meta-events from the transcript analyzer (note_save, show_notes, show_reminders).
 * These aren't real card types -- they trigger persistence actions and emit list cards.
 */
export async function handleOfflineCardEvent(
    event: CardEvent,
    emitCardEvent: (e: CardEvent) => void,
): Promise<void> {
    if (event.type === 'note_save') {
        const data = event.data as { text: string; category?: string };
        const { saveNote } = await loadNotesPersistence();
        const note = saveNote(data.text, data.category || 'general');
        emitCardEvent({ type: 'list', data: { title: 'Note Saved', items: [note.text] }, autoDismissMs: 5000 });
        return;
    }
    if (event.type === 'show_notes') {
        const { getNotes } = await loadNotesPersistence();
        const notes = getNotes();
        if (notes.length > 0) {
            emitCardEvent({
                type: 'list',
                data: { title: 'My Notes', items: notes.map(n => n.text), itemIds: notes.map(n => n.id), deletable: true },
                persistent: true,
            });
        }
        return;
    }
    if (event.type === 'show_reminders') {
        const { getReminders } = await loadNotesPersistence();
        const reminders = getReminders().filter(r => !r.done);
        if (reminders.length > 0) {
            emitCardEvent({
                type: 'list',
                data: {
                    title: 'My Reminders',
                    items: reminders.map(r => `${r.text}${r.timeDescription ? ' -- ' + r.timeDescription : ''}`),
                    itemIds: reminders.map(r => r.id),
                    deletable: true,
                },
                persistent: true,
            });
        }
        return;
    }
    if (event.type === 'reminder') {
        const rData = event.data as { text?: string; scheduledTime?: string };
        const { saveReminder } = await loadNotesPersistence();
        saveReminder(rData.text || '', rData.scheduledTime || 'Soon');
    }
    emitCardEvent(event);
}

/**
 * Resolve a card event from the transcript analyzer against the HA entity cache,
 * injecting haUrl/haToken for camera cards and preserving intended state for device cards.
 * Falls back to emitting the unresolved card if HA is not available.
 */
export async function resolveAndEmitCard(
    cardEvent: CardEvent,
    emitCardEvent: (e: CardEvent) => void,
): Promise<void> {
    const needsResolution = cardEvent.type === 'device' || cardEvent.type === 'camera'
        || cardEvent.type === 'thermostat' || cardEvent.type === 'sensorReading'
        || cardEvent.type === 'homeStatus';

    const needsExecution = cardEvent.type === 'gmail' || cardEvent.type === 'outlookMail'
        || cardEvent.type === 'chore' || cardEvent.type === 'flight';

    if (!needsResolution && !needsExecution) {
        handleOfflineCardEvent(cardEvent, emitCardEvent);
        return;
    }

    if (cardEvent.type === 'gmail') {
        try {
            const { listMessages } = await import('../../services/gmailApi');
            const query = (cardEvent.data as { query?: string }).query;
            const { messages, totalUnread } = await listMessages({
                maxResults: 10,
                query,
                labelIds: query ? undefined : ['INBOX'],
            });
            emitCardEvent({
                type: 'gmail',
                data: { messages, totalUnread, mode: query ? 'search' : 'inbox', query },
                persistent: true,
            });
        } catch {
            // Silent fail -- HA AI will respond verbally.
        }
        return;
    }

    if (cardEvent.type === 'outlookMail') {
        try {
            const { listMessages } = await import('../../services/outlookMailApi');
            const { messages, totalUnread } = await listMessages({ maxResults: 10 });
            emitCardEvent({
                type: 'outlookMail',
                data: { messages, totalUnread, mode: 'inbox' },
                persistent: true,
            });
        } catch {
            // Silent fail.
        }
        return;
    }

    if (cardEvent.type === 'chore') {
        try {
            const { getChores } = await import('../../services/chorePersistence');
            const chores = getChores();
            emitCardEvent({
                type: 'chore',
                data: { title: 'Chores & Tasks', chores, mode: 'list' },
                persistent: true,
            });
        } catch {
            // Silent fail.
        }
        return;
    }

    if (cardEvent.type === 'flight') {
        const fData = cardEvent.data as { flightNumber?: string };
        if (fData.flightNumber && fData.flightNumber !== 'Route Search') {
            try {
                const { getFlightByNumber } = await import('../../services/flightApi');
                const flight = await getFlightByNumber(fData.flightNumber);
                if (flight) {
                    emitCardEvent({ type: 'flight', data: flight as unknown as Record<string, unknown> });
                }
            } catch {
                // Silent fail.
            }
        }
        return;
    }

    try {
        const { getHaPreparedSession } = await import('../../services/haMcpService');
        const prepared = await getHaPreparedSession();
        if (!prepared) {
            handleOfflineCardEvent(cardEvent, emitCardEvent);
            return;
        }
        const offlineMod = await loadOfflineSpeech();
        offlineMod.setOfflineEntityCache(prepared.entities);

        if (cardEvent.type === 'sensorReading') {
            const { resolveSensorReading } = await loadOfflineSpeech();
            const sData = cardEvent.data as { deviceClass?: string; area?: string };
            const resolved = resolveSensorReading(sData.deviceClass || 'temperature', sData.area || '', prepared.entities);
            if (resolved) {
                emitCardEvent(resolved);
            }
            return;
        }

        if (cardEvent.type === 'homeStatus') {
            const { resolveHomeStatus } = await loadOfflineSpeech();
            const hsData = cardEvent.data as { kind?: string; area?: string };
            const resolved = resolveHomeStatus(hsData.kind || 'door', hsData.area || '', prepared.entities);
            if (resolved) {
                emitCardEvent(resolved);
            }
            return;
        }

        const { resolveCardEntityId } = await import('../../services/transcriptAnalyzer');
        const intendedState = (cardEvent.data as { state?: string }).state;
        let resolved = resolveCardEntityId(cardEvent, prepared.entities);

        if (resolved.type === 'device' && intendedState) {
            resolved = { ...resolved, data: { ...resolved.data, state: intendedState, resolvedState: intendedState } as unknown as Record<string, unknown> };
        }

        if (resolved.type === 'camera') {
            const haUrl = getHaMcpUrl().replace(/\/+$/, '').replace(/\/api\/mcp\/?$/, '');
            const token = await getHaMcpTokenAsync();
            resolved = { ...resolved, data: { ...resolved.data, haUrl, haToken: token } as unknown as Record<string, unknown>, persistent: true };
        }

        emitCardEvent(resolved);
    } catch {
        handleOfflineCardEvent(cardEvent, emitCardEvent);
    }
}
