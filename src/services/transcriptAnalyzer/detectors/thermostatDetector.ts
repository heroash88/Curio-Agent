import type { CardEvent, ThermostatCardData } from '../../cardTypes';
import { isConversationalOffer } from '../helpers';

export function detectThermostat(normalized: string, original: string): CardEvent | null {
    const keywords = [
        'thermostat', 'temperature to', 'set the temp', 'set temp',
        'heat to', 'cool to', 'ac to', 'hvac', 'heating to',
        'cooling to', 'set the house to', 'set the home to',
        'make it warmer', 'make it cooler', 'make it hotter',
        'make it colder', 'turn up the heat', 'turn down the heat',
        'turn up the ac', 'turn down the ac', 'crank the heat',
        'crank the ac',
    ];

    if (!keywords.some(kw => normalized.includes(kw))) return null;
    if (isConversationalOffer(normalized)) return null;

    const tempPatterns = [
        /(?:set|change|adjust)\s+(?:the\s+)?(?:thermostat|temperature|temp|heat|ac|hvac)\s+(?:to\s+)?(-?\d{1,3})\s*(?:°?\s*(?:F|C|fahrenheit|celsius)?)?/i,
        /(?:heat|cool|heating|cooling)\s+(?:to\s+)?(-?\d{1,3})\s*(?:°?\s*(?:F|C|fahrenheit|celsius)?)?/i,
        /set\s+(?:the\s+)?(?:house|home|room)\s+(?:to\s+)?(-?\d{1,3})\s*(?:°?\s*(?:F|C|fahrenheit|celsius)?)?/i,
        /make\s+it\s+(-?\d{1,3})\s*(?:°?\s*(?:F|C|fahrenheit|celsius)?)?/i,
    ];

    let targetTemp = 0;
    let unit: 'F' | 'C' = 'F';

    for (const pattern of tempPatterns) {
        const m = original.match(pattern);
        if (m) {
            targetTemp = parseInt(m[1], 10);
            if (/celsius|°?\s*C\b/i.test(original)) unit = 'C';
            break;
        }
    }

    let hvacMode: ThermostatCardData['hvacMode'] = 'auto';
    if (/\b(?:heat|heating|warm|warmer|hotter)\b/i.test(normalized)) hvacMode = 'heat';
    else if (/\b(?:cool|cooling|ac|air\s*condition|colder|cooler)\b/i.test(normalized)) hvacMode = 'cool';
    else if (/\b(?:off|turn off|disable)\b/i.test(normalized)) hvacMode = 'off';
    else if (/\b(?:fan|fan only)\b/i.test(normalized)) hvacMode = 'fan_only';

    if (targetTemp === 0 && hvacMode === 'auto') {
        if (/\b(?:warmer|hotter|turn up|crank up|raise)\b/i.test(normalized)) hvacMode = 'heat';
        else if (/\b(?:cooler|colder|turn down|lower)\b/i.test(normalized)) hvacMode = 'cool';
        else return null;
    }

    if (targetTemp !== 0) {
        if (unit === 'F' && (targetTemp < 40 || targetTemp > 100)) return null;
        if (unit === 'C' && (targetTemp < 5 || targetTemp > 38)) return null;
    }

    let thermostatName = 'Thermostat';
    const nameMatch = original.match(/(?:the\s+)?(\w+(?:\s+\w+)?)\s+thermostat/i);
    if (nameMatch && nameMatch[1].toLowerCase() !== 'the') {
        thermostatName = nameMatch[1].trim()
            .split(/\s+/)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ') + ' Thermostat';
    }

    const data: ThermostatCardData = {
        entityId: '',
        name: thermostatName,
        currentTemp: targetTemp || 72,
        targetTemp: targetTemp || 72,
        hvacMode,
        unit,
        supportedModes: ['heat', 'cool', 'heat_cool', 'auto', 'off', 'fan_only'],
    };

    return { type: 'thermostat', data: data as unknown as Record<string, unknown>, persistent: true };
}
