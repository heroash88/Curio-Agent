import type { CardEvent } from '../../cardTypes';

const SHOW_CHORES = /\b(?:show|list|what are|open|check)\s+(?:my\s+)?(?:chores?|tasks?|to.?do|task\s*list|chore\s*list)\b/;
const ADD_CHORE = /\b(?:add|create|new)\s+(?:a\s+)?(?:chore|task)\b/;
const RESET_CHORES = /\b(?:reset|clear|restart)\s+(?:all\s+)?(?:chores?|tasks?)\b/;

export function detectChore(normalized: string, _trimmed: string): CardEvent | null {
    if (SHOW_CHORES.test(normalized)) {
        return { type: 'chore' as any, data: { title: 'Chores & Tasks', chores: [], mode: 'list' }, persistent: true };
    }
    if (RESET_CHORES.test(normalized)) {
        return { type: 'chore' as any, data: { title: 'Chores & Tasks', chores: [], mode: 'updated', message: 'Reset requested' }, persistent: true };
    }
    if (ADD_CHORE.test(normalized)) {
        const nameMatch = normalized.match(/(?:add|create|new)\s+(?:a\s+)?(?:chore|task)\s+(?:called\s+|named\s+)?["']?(.+?)["']?\s*$/);
        const name = nameMatch?.[1] || 'New chore';
        return { type: 'chore' as any, data: { title: 'Chores & Tasks', chores: [{ id: `chore_${Date.now()}`, name, completed: false }], mode: 'updated' }, persistent: true };
    }
    return null;
}
