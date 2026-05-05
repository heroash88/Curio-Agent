import type { CardEvent, TimerCardData } from '../../cardTypes';

export function detectTimer(normalized: string, original: string): CardEvent | null {
    const timerDurationPatterns = [
        /(?:set(?:ting)?|start(?:ing)?|creat(?:e|ing)|begin(?:ning)?)\s+(?:a\s+)?(\d+)\s*(second|minute|hour|min|sec|hr)s?\s*(?:timer|countdown)/i,
        /timer\s+(?:for\s+)?(\d+)\s*(second|minute|hour|min|sec|hr)s?/i,
        /(\d+)\s*(second|minute|hour|min|sec|hr)s?\s+timer/i,
        /countdown\s+(?:for\s+|of\s+)?(\d+)\s*(second|minute|hour|min|sec|hr)s?/i,
        /(?:set(?:ting)?|start(?:ing)?)\s+(?:a\s+)?timer\s+(?:for\s+)?(\d+)\s*(second|minute|hour|min|sec|hr)s?/i,
    ];

    const multiUnitPattern = /(?:set(?:ting)?|start(?:ing)?|creat(?:e|ing))?\s*(?:a\s+)?(?:timer\s+(?:for\s+)?)?(\d+)\s*(hour|hr)s?\s*(?:and\s+)?(\d+)\s*(minute|min)s?(?:\s*(?:and\s+)?(\d+)\s*(second|sec)s?)?/i;
    const namedTimerPattern = /(?:called|named|labeled|for)\s+["""]?([^""",.]+)["""]?/i;

    let duration = 0;
    let label = '';

    // Try multi-unit first
    const multiMatch = original.match(multiUnitPattern);
    if (multiMatch && (normalized.includes('timer') || normalized.includes('countdown') || /\bset\b/.test(normalized))) {
        const hours = parseInt(multiMatch[1], 10);
        const mins = parseInt(multiMatch[3], 10);
        const secs = multiMatch[5] ? parseInt(multiMatch[5], 10) : 0;
        duration = (hours * 3600 + mins * 60 + secs) * 1000;
        label = `${hours}h ${mins}m timer`;
    }

    // Single-unit patterns
    if (duration <= 0) {
        for (const pattern of timerDurationPatterns) {
            const m = original.match(pattern);
            if (m) {
                const amount = parseInt(m[1], 10);
                const unit = m[2].toLowerCase();
                if (unit.startsWith('sec')) duration = amount * 1000;
                else if (unit.startsWith('min')) duration = amount * 60 * 1000;
                else if (unit.startsWith('hr') || unit.startsWith('hour')) duration = amount * 3600 * 1000;
                label = `${amount} ${unit} timer`;
                break;
            }
        }
    }

    // Conversational durations
    if (duration <= 0) {
        if (/(?:half\s+(?:an?\s+)?hour|30\s*min)/i.test(original) && /timer|countdown/i.test(normalized)) {
            duration = 30 * 60 * 1000; label = '30 minute timer';
        } else if (/quarter\s+(?:of\s+an?\s+)?hour|15\s*min/i.test(original) && /timer|countdown/i.test(normalized)) {
            duration = 15 * 60 * 1000; label = '15 minute timer';
        } else if (/(?:one|an?)\s+hour/i.test(original) && /timer|countdown/i.test(normalized)) {
            duration = 60 * 60 * 1000; label = '1 hour timer';
        } else if (/(?:two|2)\s+hours?/i.test(original) && /timer|countdown/i.test(normalized)) {
            duration = 2 * 60 * 60 * 1000; label = '2 hour timer';
        } else if (/(?:three|3)\s+hours?/i.test(original) && /timer|countdown/i.test(normalized)) {
            duration = 3 * 60 * 60 * 1000; label = '3 hour timer';
        } else if (/(?:five|5)\s+minutes?/i.test(original) && /timer|countdown|set/i.test(normalized)) {
            duration = 5 * 60 * 1000; label = '5 minute timer';
        } else if (/(?:ten|10)\s+minutes?/i.test(original) && /timer|countdown|set/i.test(normalized)) {
            duration = 10 * 60 * 1000; label = '10 minute timer';
        } else if (/(?:twenty|20)\s+minutes?/i.test(original) && /timer|countdown|set/i.test(normalized)) {
            duration = 20 * 60 * 1000; label = '20 minute timer';
        } else if (/(?:forty five|45)\s+minutes?/i.test(original) && /timer|countdown|set/i.test(normalized)) {
            duration = 45 * 60 * 1000; label = '45 minute timer';
        } else if (/(?:ninety|90)\s+(?:seconds?|sec)/i.test(original) && /timer|countdown|set/i.test(normalized)) {
            duration = 90 * 1000; label = '90 second timer';
        }
    }

    // Spoken word numbers: "set a five minute timer"
    if (duration <= 0 && /timer|countdown/i.test(normalized)) {
        const wordNumbers: Record<string, number> = {
            one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
            eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
            fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
            nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
        };
        const wordNumPattern = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty)\s+(second|minute|hour|min|sec|hr)s?\b/i;
        const wnMatch = original.match(wordNumPattern);
        if (wnMatch) {
            const amount = wordNumbers[wnMatch[1].toLowerCase()] || 0;
            const unit = wnMatch[2].toLowerCase();
            if (amount > 0) {
                if (unit.startsWith('sec')) duration = amount * 1000;
                else if (unit.startsWith('min')) duration = amount * 60 * 1000;
                else if (unit.startsWith('hr') || unit.startsWith('hour')) duration = amount * 3600 * 1000;
                label = `${amount} ${unit} timer`;
            }
        }
    }

    if (duration <= 0) return null;

    const nameMatch = original.match(namedTimerPattern);
    if (nameMatch) {
        const candidate = nameMatch[1].trim();
        if (!/^\d+\s*(second|minute|hour|min|sec|hr)s?$/i.test(candidate)) {
            label = candidate;
        }
    }

    const targetTime = Date.now() + duration;
    const data: TimerCardData = {
        label,
        isAlarm: false,
        targetTime,
        duration,
        completionState: 'running',
    };

    return {
        type: 'timer',
        data: data as unknown as Record<string, unknown>,
        persistent: true,
    };
}
