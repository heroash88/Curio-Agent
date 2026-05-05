import { getSecret, setSecret, hasSecret } from '../../utils/secretStorage';

export type AIProvider = 'gemini';

// Unified storage key for the Live API
// This replaces the old 'gemini_api_key' and 'gemini_audio_api_key'
export const STORAGE_KEY_GEMINI_LIVE_API_KEY = 'gemini_live_api_key';
export const STORAGE_KEY_GEMINI_LIVE_MODEL = 'gemini_live_live_model_selection';
export const STORAGE_KEY_GEMINI_TEXT_API_KEY = 'gemini_text_api_key';
export const STORAGE_KEY_GEMINI_TEXT_MODEL = 'curio_gemini_text_model';

// Nova Sonic storage keys
export const STORAGE_KEY_NOVA_API_KEY = 'curio_nova_api_key';
export const STORAGE_KEY_NOVA_VOICE = 'curio_nova_voice';

export const GEMINI_LIVE_MODELS = [
    { id: 'gemini-3.1-flash-live-preview', name: 'Gemini 3.1 Flash Live', description: 'Latest, fastest' },
    { id: 'gemini-2.5-flash-native-audio-preview-12-2025', name: 'Gemini 2.5 Flash Native Audio', description: 'Native audio, affective dialog' },
];

export const GEMINI_TEXT_MODELS = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast text responses' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Deeper text reasoning' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Balanced text responses' },
];

export const DEFAULT_GEMINI_TEXT_MODEL = 'gemini-2.5-flash';

export const getGeminiTextModel = (): string => {
    const saved = localStorage.getItem(STORAGE_KEY_GEMINI_TEXT_MODEL)?.trim();
    return saved || DEFAULT_GEMINI_TEXT_MODEL;
};

export const setGeminiTextModel = (model: string) => {
    localStorage.setItem(STORAGE_KEY_GEMINI_TEXT_MODEL, model.trim() || DEFAULT_GEMINI_TEXT_MODEL);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const getGeminiTextApiKeyAsync = async (): Promise<string | null> => {
    const savedKey = (await getSecret(STORAGE_KEY_GEMINI_TEXT_API_KEY)).trim();
    return savedKey || null;
};

export const getGeminiTextApiKey = (): string | null => {
    if (hasSecret(STORAGE_KEY_GEMINI_TEXT_API_KEY)) return '__encrypted__';
    const savedKey = localStorage.getItem(STORAGE_KEY_GEMINI_TEXT_API_KEY)?.trim();
    return savedKey || null;
};

export const setGeminiTextApiKey = async (key: string): Promise<void> => {
    await setSecret(STORAGE_KEY_GEMINI_TEXT_API_KEY, key);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

/**
 * Gets the current Live API model name.
 */
export const getGeminiLiveModel = (): string => {
    const saved = localStorage.getItem(STORAGE_KEY_GEMINI_LIVE_MODEL);
    if (saved && GEMINI_LIVE_MODELS.some(m => m.id === saved)) return saved;
    return 'gemini-3.1-flash-live-preview';
};

/**
 * Sets the Live API model.
 */
export const setGeminiLiveModel = (model: string) => {
    localStorage.setItem(STORAGE_KEY_GEMINI_LIVE_MODEL, model);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

/**
 * Built-in fallback API key.
 * Users must provide their own key via Settings.
 */
export const BUILTIN_API_KEY = '';

/**
 * Async API key retrieval for the Live API (decrypts from storage).
 */
export const getApiKeyAsync = async (): Promise<string | null> => {
    const savedKey = (await getSecret(STORAGE_KEY_GEMINI_LIVE_API_KEY)).trim();
    return savedKey || BUILTIN_API_KEY || null;
};

/**
 * Synchronous API key retrieval — returns a value only if the key
 * hasn't been encrypted yet (legacy). Once encrypted, returns BUILTIN_API_KEY.
 * Prefer getApiKeyAsync() for actual usage.
 */
export const getApiKey = (_provider?: string): string | null => {
    if (hasSecret(STORAGE_KEY_GEMINI_LIVE_API_KEY)) return '__encrypted__';
    const savedKey = localStorage.getItem(STORAGE_KEY_GEMINI_LIVE_API_KEY)?.trim();
    return savedKey || BUILTIN_API_KEY || null;
};

/**
 * Unified API key saving for the Live API (encrypts before storing).
 */
export const setApiKey = async (key: string): Promise<void> => {
    await setSecret(STORAGE_KEY_GEMINI_LIVE_API_KEY, key);
    window.dispatchEvent(new Event('storage'));
};


// ── Nova Sonic ──────────────────────────────────────────────────────

export const NOVA_VOICES = [
    { id: 'tiffany', name: 'Tiffany', style: 'Friendly' },
    { id: 'matthew', name: 'Matthew', style: 'Warm' },
    { id: 'amy', name: 'Amy', style: 'Clear' },
];

export const DEFAULT_NOVA_VOICE = 'tiffany';

export const getNovaVoice = (): string => {
    const saved = localStorage.getItem(STORAGE_KEY_NOVA_VOICE);
    if (saved && NOVA_VOICES.some(v => v.id === saved)) return saved;
    return DEFAULT_NOVA_VOICE;
};

export const setNovaVoice = (voice: string) => {
    localStorage.setItem(STORAGE_KEY_NOVA_VOICE, voice);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const getNovaApiKeyAsync = async (): Promise<string | null> => {
    const savedKey = (await getSecret(STORAGE_KEY_NOVA_API_KEY)).trim();
    return savedKey || null;
};

export const setNovaApiKey = async (key: string): Promise<void> => {
    await setSecret(STORAGE_KEY_NOVA_API_KEY, key);
    window.dispatchEvent(new Event('storage'));
};
