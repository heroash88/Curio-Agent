/**
 * Note and reminder handlers backed by local notesPersistence.
 */

import { register } from '../router';

const normalizeNoteText = (value: unknown): string =>
    String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const parseNoteIndex = (value: unknown): number | null => {
    const numeric = typeof value === 'number' ? value : Number(String(value || '').trim());
    return Number.isInteger(numeric) && numeric > 0 ? numeric - 1 : null;
};

const resolveNoteTarget = <T extends { id: string; text: string }>(
    args: any,
    notes: T[],
): T | null => {
    const id = String(args?.id || args?.noteId || '').trim();
    if (id) {
        return notes.find((note) => note.id === id) || null;
    }

    const noteIndex = parseNoteIndex(args?.index ?? args?.noteIndex);
    if (noteIndex !== null) {
        return notes[noteIndex] || null;
    }

    const requestedText = normalizeNoteText(args?.text ?? args?.currentText ?? args?.query);
    if (!requestedText) {
        return null;
    }

    return notes.find((note) => normalizeNoteText(note.text) === requestedText)
        || notes.find((note) => normalizeNoteText(note.text).includes(requestedText))
        || null;
};

register('saveNote', async (args, ctx) => {
    const { saveNote } = await import('../../notesPersistence');
    const note = saveNote(args?.text || '', args?.category || 'general');
    if (ctx.onCardEvent) {
        try { ctx.onCardEvent({ type: 'list', data: { title: '📝 Note Saved', items: [note.text] }, autoDismissMs: 5000 }); } catch {}
    }
    return { result: { success: true, noteSaved: true, noteId: note.id, text: note.text }, emittedCard: true };
});

register('getMyNotes', async (_args, ctx) => {
    const { getNotes } = await import('../../notesPersistence');
    const notes = getNotes();
    if (ctx.onCardEvent && notes.length > 0) {
        try {
            ctx.onCardEvent({
                type: 'list',
                data: { title: '📝 My Notes', items: notes.slice(0, 10).map(n => n.text), itemIds: notes.slice(0, 10).map(n => n.id), deletable: true },
                autoDismissMs: 0, persistent: true,
            });
        } catch {}
    }
    return {
        result: {
            success: true,
            notes: notes.map((n, index) => ({
                id: n.id,
                index: index + 1,
                text: n.text,
                category: n.category,
                createdAt: new Date(n.createdAt).toLocaleString(),
            })),
        },
        emittedCard: notes.length > 0,
    };
});

register('deleteNote', async (args, ctx) => {
    const { deleteNote, getNotes } = await import('../../notesPersistence');
    const notes = getNotes();
    const note = resolveNoteTarget(args, notes);
    if (!note) {
        return {
            result: {
                success: false,
                error: 'Could not find that saved personal note. Ask to show your notes first, then refer to its number, id, or exact text.',
            },
            emittedCard: false,
        };
    }

    deleteNote(note.id);
    if (ctx.onCardEvent) {
        try { ctx.onCardEvent({ type: 'list', data: { title: '📝 Note Deleted', items: [note.text] }, autoDismissMs: 5000 }); } catch {}
    }
    return {
        result: {
            success: true,
            noteDeleted: true,
            noteId: note.id,
            text: note.text,
            remainingCount: Math.max(0, notes.length - 1),
        },
        emittedCard: true,
    };
});

register('updateNote', async (args, ctx) => {
    const { getNotes, updateNote } = await import('../../notesPersistence');
    const newText = String(args?.newText ?? args?.text ?? '').trim();
    if (!newText) {
        return {
            result: {
                success: false,
                error: 'Updated note text is required.',
            },
            emittedCard: false,
        };
    }

    const notes = getNotes();
    const note = resolveNoteTarget({
        ...args,
        text: args?.currentText ?? args?.matchText ?? args?.query ?? (args?.newText !== undefined ? args?.text : undefined),
    }, notes);
    if (!note) {
        return {
            result: {
                success: false,
                error: 'Could not find that saved personal note. Ask to show your notes first, then refer to its number, id, or exact text.',
            },
            emittedCard: false,
        };
    }

    updateNote(note.id, newText);
    if (ctx.onCardEvent) {
        try { ctx.onCardEvent({ type: 'list', data: { title: '📝 Note Updated', items: [newText] }, autoDismissMs: 5000 }); } catch {}
    }
    return {
        result: {
            success: true,
            noteUpdated: true,
            noteId: note.id,
            previousText: note.text,
            text: newText,
        },
        emittedCard: true,
    };
});

register('setReminder', async (args, ctx) => {
    const { saveReminder } = await import('../../notesPersistence');
    const reminder = saveReminder(args?.text || '', args?.timeDescription || 'Soon', args?.dueDateTime);
    if (ctx.onCardEvent) {
        try { ctx.onCardEvent({ type: 'reminder', data: { text: reminder.text, scheduledTime: reminder.timeDescription, dueDateTime: reminder.dueDateTime } }); } catch {}
    }
    return { result: { success: true, reminderSet: true, reminderId: reminder.id, text: reminder.text, when: reminder.timeDescription, dueDateTime: reminder.dueDateTime }, emittedCard: true };
});

register('getMyReminders', async (_args, ctx) => {
    const { getReminders } = await import('../../notesPersistence');
    const reminders = getReminders().filter(r => !r.done);
    if (ctx.onCardEvent && reminders.length > 0) {
        try { ctx.onCardEvent({ type: 'list', data: { title: '🔔 My Reminders', items: reminders.slice(0, 10).map(r => `${r.text} — ${r.timeDescription}`) }, autoDismissMs: 10000 }); } catch {}
    }
    return { result: { success: true, reminders: reminders.map(r => ({ text: r.text, when: r.timeDescription, createdAt: new Date(r.createdAt).toLocaleString() })) }, emittedCard: reminders.length > 0 };
});
