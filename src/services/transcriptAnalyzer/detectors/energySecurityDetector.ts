import type { CardEvent } from '../../cardTypes';

const ENERGY = /\b(?:energy|power usage|electricity|solar|how much (?:power|energy|electricity)|energy dashboard|power consumption|watt)\b/;
const SECURITY = /\b(?:security|alarm (?:status|state|panel)|are (?:the )?(?:doors?|locks?) (?:locked|secure)|home security|is the (?:house|home) (?:locked|secure|armed))\b/;

export function detectEnergy(normalized: string, _trimmed: string): CardEvent | null {
    if (ENERGY.test(normalized)) {
        return { type: 'energy' as any, data: {} };
    }
    return null;
}

export function detectSecurity(normalized: string, _trimmed: string): CardEvent | null {
    if (SECURITY.test(normalized)) {
        return { type: 'security' as any, data: { alarmState: 'unknown' } };
    }
    return null;
}
