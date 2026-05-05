import type { CardEvent, ReminderCardData } from '../../cardTypes';
import { isConversationalOffer } from '../helpers';

export function detectReminder(normalized: string, original: string): CardEvent | null {
    const patterns = [
        /remind(?:er)?\s+(?:me\s+)?(?:to\s+)?(.+?)(?:\s+(?:at|in|on|by)\s+(.+?))?(?:\.|!|$)/i,
        /don'?t\s+forget\s+(?:to\s+)?(.+?)(?:\s+(?:at|in|on|by)\s+(.+?))?(?:\.|!|$)/i,
        /remember\s+to\s+(.+?)(?:\s+(?:at|in|on|by)\s+(.+?))?(?:\.|!|$)/i,
    ];

    if (!/remind|reminder|don'?t forget|remember to/i.test(normalized)) return null;
    if (isConversationalOffer(normalized)) return null;

    for (const pattern of patterns) {
        const m = original.match(pattern);
        if (m) {
            const text = m[1].trim();
            if (text.length < 3) continue;
            const scheduledTime = m[2]?.trim() || '';

            const data: ReminderCardData = { text, scheduledTime };
            return { type: 'reminder', data: data as unknown as Record<string, unknown>, autoDismissMs: 10000 };
        }
    }

    return null;
}
