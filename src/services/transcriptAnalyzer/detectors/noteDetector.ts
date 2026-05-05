import type { CardEvent } from '../../cardTypes';
import { isConversationalOffer } from '../helpers';

export function detectNote(normalized: string, original: string): CardEvent | null {
    if (!/\b(?:take\s+(?:a\s+)?note|save\s+(?:a\s+)?note|note\s+that|write\s+(?:this\s+)?down|jot\s+(?:this\s+)?down|make\s+a\s+note)\b/i.test(normalized)) return null;
    if (isConversationalOffer(normalized)) return null;

    const patterns = [
        /(?:take\s+(?:a\s+)?note|save\s+(?:a\s+)?note|make\s+a\s+note)\s*(?:that\s+|to\s+|about\s+|of\s+)?[:\-]?\s*(.+?)(?:\.|!|$)/i,
        /note\s+that\s+(.+?)(?:\.|!|$)/i,
        /(?:write|jot)\s+(?:this\s+)?down\s*[:\-]?\s*(.+?)(?:\.|!|$)/i,
    ];

    for (const pattern of patterns) {
        const m = original.match(pattern);
        if (m) {
            const text = m[1].trim();
            if (text.length < 2) continue;
            return { type: 'note_save', data: { text, category: 'general' } };
        }
    }

    return null;
}

export function detectShowNotes(normalized: string): CardEvent | null {
    if (!/\b(?:show\s+(?:me\s+)?(?:my\s+)?notes|what\s+(?:are\s+)?my\s+notes|read\s+(?:me\s+)?(?:my\s+)?notes|list\s+(?:my\s+)?notes|view\s+(?:my\s+)?notes|open\s+(?:my\s+)?notes)\b/i.test(normalized)) return null;
    return { type: 'show_notes', data: {} };
}

export function detectShowReminders(normalized: string): CardEvent | null {
    if (!/\b(?:show\s+(?:me\s+)?(?:my\s+)?reminders|what\s+(?:are\s+)?my\s+reminders|list\s+(?:my\s+)?reminders|view\s+(?:my\s+)?reminders|what\s+do\s+i\s+(?:need|have)\s+to\s+do|open\s+(?:my\s+)?reminders)\b/i.test(normalized)) return null;
    return { type: 'show_reminders', data: {} };
}
