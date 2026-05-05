import type { CardEvent, AlarmCardData } from '../../cardTypes';
import { isConversationalOffer } from '../helpers';

export function detectAlarm(normalized: string, original: string): CardEvent | null {
    if (!normalized.includes('alarm')) return null;
    if (isConversationalOffer(normalized)) return null;

    const alarmPatterns = [
        /alarm\s+(?:for|at)\s+(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?/i,
        /(?:set|create|make)\s+(?:an?\s+)?alarm\s+(?:for\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?/i,
        /wake\s+(?:me\s+)?(?:up\s+)?(?:at|for)\s+(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?/i,
    ];

    for (const pattern of alarmPatterns) {
        const m = original.match(pattern);
        if (m) {
            let hours = parseInt(m[1], 10);
            const minutes = m[2] ? parseInt(m[2], 10) : 0;
            const ampm = m[3]?.toLowerCase().replace(/\./g, '');
            if (ampm === 'pm' && hours < 12) hours += 12;
            if (ampm === 'am' && hours === 12) hours = 0;

            const now = new Date();
            const target = new Date(now);
            target.setHours(hours, minutes, 0, 0);
            if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);

            const timeStr = `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;

            const dayMatch = original.match(/(?:on|every)\s+((?:mon|tue|wed|thu|fri|sat|sun|weekday|weekend)[a-z,\s]*)/i);
            const days = dayMatch ? dayMatch[1].split(/[,\s]+/).filter(Boolean) : undefined;

            const labelMatch = original.match(/(?:called|named|labeled)\s+["""]?([^""",.]+)["""]?/i);
            const label = labelMatch ? labelMatch[1].trim() : `Alarm ${timeStr}`;

            const data: AlarmCardData = {
                alarms: [{
                    id: `alarm-${Date.now()}`,
                    label,
                    time: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
                    enabled: true,
                    days,
                    targetTime: target.getTime(),
                }],
                mode: 'list',
            };

            return { type: 'alarm', data: data as unknown as Record<string, unknown>, persistent: true };
        }
    }

    return null;
}
