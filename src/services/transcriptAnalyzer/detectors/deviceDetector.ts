import type { CardEvent, DeviceCardData, DeviceSupportedAction } from '../../cardTypes';
import { isConversationalOffer } from '../helpers';

/** Domain keywords used to infer what type of device the user is talking about */
export const DEVICE_DOMAIN_MAP: Array<{ domain: string; keywords: string[]; icon: string }> = [
    { domain: 'light', keywords: ['light', 'lights', 'lamp', 'lamps', 'bulb', 'bulbs', 'led', 'leds', 'ceiling light', 'floor lamp', 'strip', 'lightstrip', 'chandelier', 'sconce', 'nightlight', 'spotlight', 'dimmer'], icon: '💡' },
    { domain: 'switch', keywords: ['switch', 'outlet', 'plug', 'socket', 'power strip'], icon: '⚡' },
    { domain: 'fan', keywords: ['fan', 'ceiling fan', 'desk fan', 'tower fan', 'exhaust fan'], icon: '🌀' },
    { domain: 'lock', keywords: ['lock', 'door lock', 'deadbolt', 'smart lock', 'front door lock', 'back door lock'], icon: '🔒' },
    { domain: 'cover', keywords: ['blind', 'blinds', 'curtain', 'curtains', 'shade', 'shades', 'garage', 'garage door', 'cover', 'shutter', 'shutters', 'roller', 'awning', 'gate'], icon: '🪟' },
    { domain: 'vacuum', keywords: ['vacuum', 'roomba', 'robot vacuum', 'roborock', 'robovac'], icon: '🧹' },
    { domain: 'media_player', keywords: ['tv', 'television', 'speaker', 'speakers', 'media player', 'chromecast', 'sonos', 'roku', 'apple tv', 'firestick', 'fire stick', 'soundbar', 'receiver', 'home theater'], icon: '📺' },
    { domain: 'scene', keywords: ['scene', 'activate scene', 'set the scene', 'movie mode', 'dinner mode', 'bedtime mode', 'night mode', 'party mode'], icon: '🎬' },
    { domain: 'script', keywords: ['script', 'routine', 'run routine', 'automation', 'run automation'], icon: '⚙️' },
];

/** Action verbs and what device action they map to */
export const ACTION_VERB_MAP: Array<{ verbs: string[]; action: DeviceSupportedAction; resultState: string }> = [
    { verbs: ['turn on', 'switch on', 'power on', 'enable', 'activate', 'start', 'open', 'raise', 'brighten'], action: 'turn_on', resultState: 'on' },
    { verbs: ['turn off', 'switch off', 'power off', 'disable', 'deactivate', 'shut off', 'kill', 'close', 'lower', 'dim'], action: 'turn_off', resultState: 'off' },
    { verbs: ['toggle', 'flip', 'switch'], action: 'toggle', resultState: 'toggled' },
    { verbs: ['lock', 'secure'], action: 'lock', resultState: 'locked' },
    { verbs: ['unlock', 'unsecure', 'open the lock'], action: 'unlock', resultState: 'unlocked' },
    { verbs: ['open', 'raise', 'lift'], action: 'open_cover', resultState: 'open' },
    { verbs: ['close', 'lower', 'shut', 'drop'], action: 'close_cover', resultState: 'closed' },
    { verbs: ['stop'], action: 'stop_cover', resultState: 'stopped' },
];

const DEVICE_FILLER = new Set([
    'the', 'a', 'an', 'my', 'our', 'your', 'please', 'can', 'you',
    'could', 'would', 'will', 'just', 'go', 'ahead', 'and', 'also',
    'then', 'now', 'right', 'for', 'me', 'us', 'in', 'at', 'to',
]);

export function detectDevice(normalized: string, original: string): CardEvent | null {
    if (isConversationalOffer(normalized)) return null;

    // Step 1: Detect action verb
    let matchedAction: (typeof ACTION_VERB_MAP)[number] | null = null;
    let verbEndIndex = 0;

    for (const entry of ACTION_VERB_MAP) {
        for (const verb of entry.verbs) {
            const idx = normalized.indexOf(verb);
            if (idx !== -1) {
                const end = idx + verb.length;
                if (!matchedAction || verb.length > (matchedAction.verbs.find(v => normalized.includes(v))?.length || 0)) {
                    matchedAction = entry;
                    verbEndIndex = end;
                }
            }
        }
    }

    if (!matchedAction) return null;

    // Step 2: Detect domain from keywords
    let matchedDomain: (typeof DEVICE_DOMAIN_MAP)[number] | null = null;

    for (const entry of DEVICE_DOMAIN_MAP) {
        for (const kw of entry.keywords) {
            const idx = normalized.indexOf(kw);
            if (idx !== -1) {
                if (!matchedDomain || kw.length > (matchedDomain.keywords.find(k => normalized.includes(k))?.length || 0)) {
                    matchedDomain = entry;
                }
            }
        }
    }

    if (!matchedDomain) {
        const afterVerb = normalized.substring(verbEndIndex).trim();
        const roomWords = [
            'bedroom', 'kitchen', 'living room', 'bathroom', 'hallway', 'garage',
            'office', 'den', 'basement', 'attic', 'porch', 'patio', 'dining room',
            'nursery', 'laundry', 'closet', 'foyer', 'entryway', 'mudroom',
            'pantry', 'studio', 'guest room', 'master bedroom', 'upstairs',
            'downstairs', 'front yard', 'backyard', 'back yard', 'driveway',
            'stairway', 'stairs', 'landing', 'loft', 'sunroom', 'conservatory',
            'playroom', 'game room', 'theater', 'theatre', 'gym', 'workshop',
            'shed', 'pool', 'deck', 'balcony', 'terrace', 'courtyard',
            'front door', 'back door', 'side door', 'main', 'exterior',
            'interior', 'outside', 'inside', 'outdoor', 'indoor',
        ];
        const hasRoom = roomWords.some(r => afterVerb.includes(r));
        const hasSpecificDevice = /\bthe\s+\w+/.test(afterVerb) && afterVerb.length > 5;
        if (!hasRoom && !hasSpecificDevice) return null;
    }

    // Step 3: Extract device name
    const afterVerb = original.substring(verbEndIndex).trim();
    let deviceNameRaw = afterVerb
        .replace(/[.!?,;]+$/, '')
        .replace(/\s+(?:please|now|right now|for me|for us|immediately|quickly)$/i, '')
        .trim();

    let deviceName = deviceNameRaw;
    const words = deviceName.split(/\s+/);
    const filtered = words.filter(w => !DEVICE_FILLER.has(w.toLowerCase()));
    deviceName = filtered.join(' ').trim();

    if (!deviceName || (matchedDomain && matchedDomain.keywords.includes(deviceName.toLowerCase()))) {
        deviceName = matchedDomain ? matchedDomain.keywords[0] : deviceNameRaw;
    }

    if (deviceName.length < 2) return null;

    // Step 4: Determine control kind and supported actions
    const domain = matchedDomain?.domain || 'switch';
    let controlKind: string = 'toggle';
    let supportedActions: DeviceSupportedAction[] = ['turn_on', 'turn_off', 'toggle'];

    if (domain === 'lock') {
        controlKind = 'lock';
        supportedActions = ['lock', 'unlock'];
    } else if (domain === 'cover') {
        controlKind = 'cover';
        supportedActions = ['open_cover', 'close_cover', 'stop_cover'];
    } else if (domain === 'climate' || domain === 'sensor') {
        controlKind = 'readonly';
        supportedActions = [];
    }

    // Step 5: Build the friendly name
    const friendlyName = deviceName
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

    const data: DeviceCardData = {
        entityId: '',
        friendlyName,
        domain,
        action: matchedAction.resultState === 'on' ? 'Turned On'
            : matchedAction.resultState === 'off' ? 'Turned Off'
            : matchedAction.resultState === 'locked' ? 'Locked'
            : matchedAction.resultState === 'unlocked' ? 'Unlocked'
            : matchedAction.resultState === 'open' ? 'Opened'
            : matchedAction.resultState === 'closed' ? 'Closed'
            : 'Updated',
        state: matchedAction.resultState,
        controlKind,
        supportedActions,
    };

    return { type: 'device', data: data as unknown as Record<string, unknown> };
}
