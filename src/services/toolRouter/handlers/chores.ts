/**
 * Chore handlers backed by chorePersistence. Every mutation emits an
 * updated chore card so the UI and the AI observation stay aligned.
 */

import type { ChoreItem } from '../../cardTypes';
import { register } from '../router';

register('show_chores', async (_args, ctx) => {
    const { getChores } = await import('../../chorePersistence');
    const chores = getChores();
    if (ctx.onCardEvent) {
        try {
            ctx.onCardEvent({ type: 'chore', data: { title: 'Chores & Tasks', chores, mode: 'list' }, persistent: true });
        } catch {}
    }
    return { result: { success: true, choreCount: chores.length, chores: chores.map((c: ChoreItem) => ({ name: c.name, completed: c.completed, assignee: c.assignee })) }, emittedCard: true };
});

register('add_chore', async (args, ctx) => {
    const { addChore, getChores } = await import('../../chorePersistence');
    const chore = addChore(args?.name || 'New chore', args?.assignee, args?.recurring);
    const chores = getChores();
    if (ctx.onCardEvent) {
        try {
            ctx.onCardEvent({ type: 'chore', data: { title: 'Chores & Tasks', chores, mode: 'updated', message: `Added: ${chore.name}` }, persistent: true });
        } catch {}
    }
    return { result: { success: true, chore }, emittedCard: true };
});

register('complete_chore', async (args, ctx) => {
    const { getChores, completeChore } = await import('../../chorePersistence');
    const chores = getChores();
    const name = (args?.name || '').toLowerCase();
    const match = chores.find((c: ChoreItem) => c.name.toLowerCase().includes(name));
    if (!match) return { result: { success: false, error: `No chore matching "${args?.name}" found.` }, emittedCard: false };
    completeChore(match.id);
    const updated = getChores();
    if (ctx.onCardEvent) {
        try {
            ctx.onCardEvent({ type: 'chore', data: { title: 'Chores & Tasks', chores: updated, mode: 'updated', message: `Done: ${match.name}` }, persistent: true });
        } catch {}
    }
    return { result: { success: true, completed: match.name }, emittedCard: true };
});

register('reset_chores', async (_args, ctx) => {
    const { resetCompletedChores, getChores } = await import('../../chorePersistence');
    resetCompletedChores();
    const chores = getChores();
    if (ctx.onCardEvent) {
        try {
            ctx.onCardEvent({ type: 'chore', data: { title: 'Chores & Tasks', chores, mode: 'updated', message: 'All chores reset.' }, persistent: true });
        } catch {}
    }
    return { result: { success: true, message: 'All chores reset to incomplete.' }, emittedCard: true };
});
