/**
 * Detects sensor reading queries (temperature, humidity from HA sensors)
 * and home status queries (doors, garage, motion, presence).
 *
 * These return card events with a query field -- the actual entity lookup
 * happens in offlineSpeechService which has access to the HA entity cache.
 */

import type { CardEvent } from '../../cardTypes';

// ── Sensor reading detection ──

const SENSOR_PATTERNS: Array<{ pattern: RegExp; deviceClass: string }> = [
    // Temperature with area
    { pattern: /\b(?:what(?:'s| is) the )?temperature\b.*\b(?:in|of|at|for)\s+(?:the\s+)?(.+?)(?:\?|$)/i, deviceClass: 'temperature' },
    { pattern: /\bhow (?:hot|cold|warm) is (?:it )?(?:in|at) (?:the\s+)?(.+?)(?:\?|$)/i, deviceClass: 'temperature' },
    { pattern: /\b(?:what(?:'s| is) the )?temp(?:erature)?\s+(?:in|of|at|for)\s+(?:the\s+)?(.+?)(?:\?|$)/i, deviceClass: 'temperature' },
    // Humidity with area
    { pattern: /\b(?:what(?:'s| is) the )?humidity\b.*\b(?:in|of|at|for)\s+(?:the\s+)?(.+?)(?:\?|$)/i, deviceClass: 'humidity' },
    { pattern: /\bhow humid is (?:it )?(?:in|at) (?:the\s+)?(.+?)(?:\?|$)/i, deviceClass: 'humidity' },
    // Generic (no area)
    { pattern: /\b(?:what(?:'s| is) the )?temperature\b/i, deviceClass: 'temperature' },
    { pattern: /\bhow (?:hot|cold|warm) is it\b/i, deviceClass: 'temperature' },
    { pattern: /\b(?:what(?:'s| is) the )?humidity\b/i, deviceClass: 'humidity' },
    { pattern: /\b(?:what(?:'s| is) the )?(?:indoor|inside|room) temp/i, deviceClass: 'temperature' },
    // Power / energy sensors
    { pattern: /\b(?:how much )?(?:power|energy|electricity)\s+(?:is|am i|are we)\s+(?:using|consuming)\b/i, deviceClass: 'power' },
    { pattern: /\b(?:what(?:'s| is) the )?(?:power|energy) (?:usage|consumption)\b/i, deviceClass: 'power' },
    // Battery
    { pattern: /\b(?:what(?:'s| is) the )?battery\s+(?:level|percentage|charge)\s+(?:of|on|for)\s+(?:the\s+)?(.+?)(?:\?|$)/i, deviceClass: 'battery' },
    { pattern: /\bhow much battery (?:does|is)\s+(?:the\s+)?(.+?)\s+have\b/i, deviceClass: 'battery' },
    // Illuminance / light level
    { pattern: /\b(?:what(?:'s| is) the )?(?:light level|brightness|illuminance)\s+(?:in|of|at)\s+(?:the\s+)?(.+?)(?:\?|$)/i, deviceClass: 'illuminance' },
];

export function detectSensorReading(normalized: string, _original: string): CardEvent | null {
    for (const { pattern, deviceClass } of SENSOR_PATTERNS) {
        const m = normalized.match(pattern);
        if (m) {
            const area = m[1]?.trim() || '';
            return {
                type: 'sensorReading',
                data: {
                    entityId: '',
                    friendlyName: '',
                    value: '',
                    deviceClass,
                    area,
                    query: normalized,
                },
            };
        }
    }
    return null;
}

// ── Home status detection ──

type StatusKind = 'door' | 'garage' | 'motion' | 'presence' | 'window';

const STATUS_PATTERNS: Array<{ pattern: RegExp; kind: StatusKind }> = [
    // Motion
    { pattern: /\b(?:any|is there(?: any)?)\s+motion\s+(?:in|at|near)\s+(?:the\s+)?(.+?)(?:\?|$)/i, kind: 'motion' },
    { pattern: /\b(?:any(?:one| one)?|is (?:there )?(?:any(?:one| one)?|somebody|someone))\s+(?:in|at|near)\s+(?:the\s+)?(.+?)(?:\s+(?:now|right now))?\s*(?:\?|$)/i, kind: 'presence' },
    { pattern: /\b(?:any|is there(?: any)?)\s+(?:motion|movement|activity)\b/i, kind: 'motion' },
    // Doors
    { pattern: /\bis (?:the\s+)?(.+?)\s+(?:door|gate)\s+(?:open|closed|locked|unlocked)\b/i, kind: 'door' },
    { pattern: /\b(?:any|are (?:there )?(?:any)?)\s+doors?\s+open\b/i, kind: 'door' },
    { pattern: /\bis (?:the\s+)?(.+?)\s+door\s+open\b/i, kind: 'door' },
    { pattern: /\b(?:check|show|status of)\s+(?:the\s+)?(?:doors?|entry|entries)\b/i, kind: 'door' },
    // Garage
    { pattern: /\bis (?:the\s+)?(?:(.+?)\s+)?garage\s+(?:open|closed)\b/i, kind: 'garage' },
    { pattern: /\b(?:any|are (?:there )?(?:any)?)\s+garages?\s+open\b/i, kind: 'garage' },
    { pattern: /\b(?:check|show|status of)\s+(?:the\s+)?garage\b/i, kind: 'garage' },
    { pattern: /\bis the garage (?:door )?open\b/i, kind: 'garage' },
    // Windows
    { pattern: /\b(?:any|are (?:there )?(?:any)?)\s+windows?\s+open\b/i, kind: 'window' },
    { pattern: /\bis (?:the\s+)?(.+?)\s+window\s+open\b/i, kind: 'window' },
    // Presence
    { pattern: /\b(?:who(?:'s| is) (?:at )?home|anyone home|is (?:anyone|anybody|someone) home)\b/i, kind: 'presence' },
    { pattern: /\b(?:who(?:'s| is) (?:in|at) (?:the\s+)?(.+?))\s*(?:\?|$)/i, kind: 'presence' },
];

export function detectHomeStatus(normalized: string, _original: string): CardEvent | null {
    for (const { pattern, kind } of STATUS_PATTERNS) {
        const m = normalized.match(pattern);
        if (m) {
            const area = m[1]?.trim() || '';
            return {
                type: 'homeStatus',
                data: {
                    kind,
                    title: '',
                    items: [],
                    area,
                    query: normalized,
                },
            };
        }
    }
    return null;
}
