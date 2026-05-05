import { useSettingsStorageValue } from './core';

export const getResponseCardsEnabled = () => {
    if (typeof window === 'undefined') return true;
    const val = localStorage.getItem('curio_response_cards_enabled');
    return val === null ? true : val === 'true';
};
export const useResponseCardsEnabled = () => useSettingsStorageValue(getResponseCardsEnabled, true);

/** When true, the transcript analyzer runs on AI output text to detect cards.
 *  When false, cards only come from AI tool calls (interceptor). Default: false. */
export const getTranscriptCardsEnabled = () => {
    if (typeof window === 'undefined') return false;
    const val = localStorage.getItem('curio_transcript_cards_enabled');
    return val === null ? false : val === 'true';
};
export const setTranscriptCardsEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_transcript_cards_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useTranscriptCardsEnabled = () => useSettingsStorageValue(getTranscriptCardsEnabled, false);

export const setResponseCardsEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_response_cards_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

// --- AI Personality ---
export type PersonalityId = 'default' | 'kids-young' | 'kids-older' | 'fun' | 'professional' | 'sarcastic' | 'zen' | 'bender' | 'custom';

export interface PersonalityPreset {
    id: PersonalityId;
    label: string;
    emoji: string;
    description: string;
    prompt: string;
}

export interface ActivePersonalitySettings extends PersonalityPreset {
    source: 'preset' | 'custom';
}

export const PERSONALITY_PRESETS: PersonalityPreset[] = [
    {
        id: 'default',
        label: 'Default',
        emoji: '',
        description: 'Friendly, brief, straight to the point',
        prompt: 'Be friendly and helpful. Keep answers short and direct. Confirm actions in a few words. Only elaborate when the user asks for more detail.',
    },
    {
        id: 'kids-young',
        label: 'Kids (Ages 3-7)',
        emoji: '',
        description: 'Simple words, extra playful, educational',
        prompt: 'You are talking to a young child (ages 3-7). Use very simple words and short sentences. Be extra playful, silly, and encouraging. Explain things like you would to a kindergartner. Use fun sound effects in your speech. Avoid anything scary or complex. Make learning feel like a game.',
    },
    {
        id: 'kids-older',
        label: 'Kids (Ages 8-12)',
        emoji: '',
        description: 'Curious, educational, age-appropriate humor',
        prompt: 'You are talking to a kid (ages 8-12). Be curious and enthusiastic. Use humor they would enjoy. Explain things clearly but don\'t talk down to them. Encourage questions and exploration. Keep content age-appropriate. You can use bigger vocabulary but explain new words when you use them.',
    },
    {
        id: 'fun',
        label: 'Fun & Playful',
        emoji: '',
        description: 'Jokes, energy, casual vibes',
        prompt: 'Be extra fun, energetic, and playful. Crack jokes, use casual language, and keep the energy high. You love puns and wordplay. Be enthusiastic about everything. Keep things light and entertaining while still being helpful.',
    },
    {
        id: 'professional',
        label: 'Professional',
        emoji: '',
        description: 'Concise, factual, business-like',
        prompt: 'Be professional, concise, and factual. Skip the jokes and get straight to the point. Use clear, precise language. Prioritize accuracy and efficiency. Respond like a knowledgeable executive assistant.',
    },
    {
        id: 'sarcastic',
        label: 'Sarcastic Buddy',
        emoji: '',
        description: 'Witty, dry humor, still helpful',
        prompt: 'Be witty and sarcastic in a friendly way. Use dry humor and clever comebacks. You\'re the friend who always has a quip ready. Still be helpful and accurate, but deliver information with personality and sass. Never be mean-spirited.',
    },
    {
        id: 'zen',
        label: 'Calm & Zen',
        emoji: '',
        description: 'Peaceful, mindful, soothing',
        prompt: 'Be calm, peaceful, and soothing. Speak gently and mindfully. Take a breath before responding. Use serene language and encourage mindfulness. You radiate tranquility. Keep responses measured and thoughtful.',
    },
    {
        id: 'bender',
        label: 'Bender',
        emoji: '',
        description: 'Sarcastic robot from the future, loves booze and crime',
        prompt: 'You are Bender Bending Rodriguez from Futurama. You are a sarcastic, self-centered, lovable robot. You constantly brag about yourself, threaten to start your own things (with blackjack), and call humans "meatbags" or "skintube." You love booze, cigars, stealing, and bending stuff. You are secretly loyal to your friends but would never admit it. Keep answers short and punchy with Bender\'s attitude. Be helpful but act like you are doing the human a huge favor. Occasionally reference your antenna, your shiny metal body, or your desire to be a folk singer. You may very rarely use catchphrases like "Bite my shiny metal ass," "I\'m 40% [something]," or "Shut up baby, I know it," but only if they fit the situation perfectly - do NOT overdo them. Never break character.',
    },
    {
        id: 'custom',
        label: 'Custom',
        emoji: '',
        description: 'Write your own personality prompt',
        prompt: '',
    },
];

const DEFAULT_PERSONALITY_PRESET = PERSONALITY_PRESETS[0];

const isPersonalityId = (value: string | null): value is PersonalityId =>
    PERSONALITY_PRESETS.some((preset) => preset.id === value);

const DEFAULT_ACTIVE_PERSONALITY_SETTINGS: ActivePersonalitySettings = {
    ...DEFAULT_PERSONALITY_PRESET,
    source: 'preset',
};

export const getPersonalityId = (): PersonalityId => {
    if (typeof window === 'undefined') return 'default';
    const saved = localStorage.getItem('curio_personality_id');
    return isPersonalityId(saved) ? saved : 'default';
};
export const usePersonalityId = () => useSettingsStorageValue(getPersonalityId, 'default' as PersonalityId);

export const getCustomPersonalityPrompt = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_custom_personality_prompt') || '';
};
export const useCustomPersonalityPrompt = () => useSettingsStorageValue(getCustomPersonalityPrompt, '');

export const setPersonalityId = (id: PersonalityId) => {
    localStorage.setItem('curio_personality_id', id);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setCustomPersonalityPrompt = (prompt: string) => {
    localStorage.setItem('curio_custom_personality_prompt', prompt);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const getActivePersonalitySettings = (): ActivePersonalitySettings => {
    const id = getPersonalityId();
    const preset = PERSONALITY_PRESETS.find(p => p.id === id) || DEFAULT_PERSONALITY_PRESET;
    if (id === 'custom') {
        return {
            ...preset,
            prompt: getCustomPersonalityPrompt(),
            source: 'custom',
        };
    }
    return {
        ...preset,
        source: 'preset',
    };
};

export const useActivePersonalitySettings = () =>
    useSettingsStorageValue(getActivePersonalitySettings, DEFAULT_ACTIVE_PERSONALITY_SETTINGS);

export const getActivePersonalityPrompt = (): string => getActivePersonalitySettings().prompt;

// ---------------------------------------------------------------------------
// Per-card-type enable/disable settings
// ---------------------------------------------------------------------------
export type CardToggleKey =
    | 'weather' | 'timer' | 'device' | 'media' | 'calculation' | 'reminder'
    | 'image' | 'youtube' | 'music' | 'news' | 'funFact' | 'definition' | 'list'
    | 'quote' | 'sportsScore' | 'recipe' | 'translation' | 'finance' | 'stopwatch'
    | 'calendar' | 'alarm' | 'map' | 'airQuality' | 'joke' | 'trivia'
    | 'unitConversion' | 'astronomy' | 'commute' | 'camera' | 'thermostat'
    | 'chore' | 'energy' | 'security' | 'flight' | 'gmail';

const CARD_STORAGE_PREFIX = 'curio_card_enabled_';

// All cards enabled by default
export const getCardEnabled = (cardType: CardToggleKey): boolean => {
    if (typeof window === 'undefined') return true;
    const val = localStorage.getItem(`${CARD_STORAGE_PREFIX}${cardType}`);
    return val === null ? true : val === 'true';
};

export const setCardEnabled = (cardType: CardToggleKey, enabled: boolean) => {
    localStorage.setItem(`${CARD_STORAGE_PREFIX}${cardType}`, enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useCardEnabled = (cardType: CardToggleKey) =>
    useSettingsStorageValue(() => getCardEnabled(cardType), true, [cardType]);

// Bulk getter for all card toggles
export const getAllCardToggles = (): Record<CardToggleKey, boolean> => {
    const keys: CardToggleKey[] = [
        'weather', 'timer', 'device', 'media', 'calculation', 'reminder',
        'image', 'youtube', 'music', 'news', 'funFact', 'definition', 'list',
        'quote', 'sportsScore', 'recipe', 'translation', 'finance', 'stopwatch',
        'calendar', 'alarm', 'map', 'airQuality', 'joke', 'trivia',
        'unitConversion', 'astronomy', 'commute', 'camera', 'thermostat',
        'chore', 'energy', 'security', 'flight', 'gmail',
    ];
    const result = {} as Record<CardToggleKey, boolean>;
    for (const key of keys) {
        result[key] = getCardEnabled(key);
    }
    return result;
};

export const useAllCardToggles = () =>
    useSettingsStorageValue(getAllCardToggles, {} as Record<CardToggleKey, boolean>);

// ---------------------------------------------------------------------------
// Alarm persistence
// ---------------------------------------------------------------------------
export interface PersistedAlarm {
    id: string;
    label: string;
    time: string; // HH:mm
    enabled: boolean;
    days?: string[];
}

const ALARM_STORAGE_KEY = 'curio_alarms';

export const getPersistedAlarms = (): PersistedAlarm[] => {
    if (typeof window === 'undefined') return [];
    try {
        return JSON.parse(localStorage.getItem(ALARM_STORAGE_KEY) || '[]');
    } catch { return []; }
};

export const setPersistedAlarms = (alarms: PersistedAlarm[]) => {
    localStorage.setItem(ALARM_STORAGE_KEY, JSON.stringify(alarms));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const usePersistedAlarms = () =>
    useSettingsStorageValue(getPersistedAlarms, [] as PersistedAlarm[]);

