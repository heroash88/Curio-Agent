import type { CardEvent, StopwatchCardData } from '../../cardTypes';
import { isConversationalOffer } from '../helpers';

export function detectStopwatch(normalized: string): CardEvent | null {
    const keywords = ['stopwatch', 'count up', 'count upward', 'elapsed timer', 'start counting'];
    if (!keywords.some(kw => normalized.includes(kw))) return null;
    if (/\d+\s*(second|minute|hour|min|sec|hr)s?/i.test(normalized)) return null;
    if (isConversationalOffer(normalized)) return null;

    const data: StopwatchCardData = { startTime: Date.now(), pausedElapsed: 0, running: true };
    return { type: 'stopwatch', data: data as unknown as Record<string, unknown>, persistent: true };
}
