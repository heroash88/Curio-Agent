import { getGeminiTextModel, setGeminiTextModel } from '../../services/ai/config';
import type { OpenAICompatibleProviderPresetId } from '../../services/ai/openAICompatiblePresets';
import {
    DEFAULT_REMOTE_TTS_PROVIDER_PRESET_ID,
    getRemoteTtsProviderPreset,
    isRemoteTtsProviderPresetId,
    type RemoteTtsProviderPresetId,
} from '../../services/remoteTtsPresets';
import { getSecret, getSecretSync, setSecret } from '../secretStorage';
import { useSettingsStorageValue } from './core';

export const getMuteMicWhileAiSpeaking = () => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('curio_mute_mic_while_speaking') === 'true';
};

export const useMuteMicWhileAiSpeaking = () => useSettingsStorageValue(getMuteMicWhileAiSpeaking, false);

export const getClearVoiceEnabled = () => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('curio_clear_voice_enabled') === 'true';
};
export const useClearVoiceEnabled = () => useSettingsStorageValue(getClearVoiceEnabled, false);


export const getVoiceGateThreshold = () => {
    if (typeof window === 'undefined') return 0;
    const val = localStorage.getItem('curio_voice_gate_threshold');
    return val ? parseFloat(val) : 0;
};
export const useVoiceGateThreshold = () => useSettingsStorageValue(getVoiceGateThreshold, 0);

export type CustomLLMProviderType = 'gemini' | 'ollama' | 'openai';

export const getCustomLLMProviderType = (): CustomLLMProviderType => {
    if (typeof window === 'undefined') return 'ollama';
    const value = localStorage.getItem('curio_llm_provider_type');
    if (value === 'gemini') return 'gemini';
    return value === 'openai' ? 'openai' : 'ollama';
};

export const setCustomLLMProviderType = (providerType: CustomLLMProviderType) => {
    localStorage.setItem('curio_llm_provider_type', providerType);
    if (providerType === 'openai' && !localStorage.getItem('curio_llm_base_url') && !localStorage.getItem('curio_openai_base_url')) {
        localStorage.setItem('curio_openai_base_url', 'https://api.openai.com');
    }
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useCustomLLMProviderType = () =>
    useSettingsStorageValue(getCustomLLMProviderType, 'ollama' as CustomLLMProviderType);

export const getOpenAICompatibleProviderPresetId = (): OpenAICompatibleProviderPresetId => {
    if (typeof window === 'undefined') return 'openai';
    const value = localStorage.getItem('curio_openai_provider_preset');
    switch (value) {
        case 'amazon_nova':
        case 'anthropic':
        case 'groq':
        case 'openrouter':
        case 'mistral':
        case 'custom':
            return value;
        case 'openai':
        default:
            return 'openai';
    }
};

export const setOpenAICompatibleProviderPresetId = (presetId: OpenAICompatibleProviderPresetId) => {
    localStorage.setItem('curio_openai_provider_preset', presetId);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useOpenAICompatibleProviderPresetId = () =>
    useSettingsStorageValue(getOpenAICompatibleProviderPresetId, 'openai' as OpenAICompatibleProviderPresetId);

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

export const getOllamaBaseUrl = (): string => {
    if (typeof window === 'undefined') return DEFAULT_OLLAMA_BASE_URL;
    return localStorage.getItem('curio_ollama_base_url') || localStorage.getItem('curio_llm_base_url') || DEFAULT_OLLAMA_BASE_URL;
};

export const setOllamaBaseUrl = (url: string) => {
    localStorage.setItem('curio_ollama_base_url', url);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const getOpenaiBaseUrl = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_openai_base_url') || localStorage.getItem('curio_llm_base_url') || '';
};

export const setOpenAIBaseUrl = (url: string) => {
    localStorage.setItem('curio_openai_base_url', url);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

// Provide aliases for backwards compatibility in other imports
export const setOpenaiBaseUrl = setOpenAIBaseUrl;
export const getOpenAIBaseUrl = getOpenaiBaseUrl;

export const getCustomLLMBaseUrl = (): string => {
    const provider = getCustomLLMProviderType();
    if (provider === 'ollama') return getOllamaBaseUrl();
    if (provider === 'openai') return getOpenAIBaseUrl();
    return '';
};

export const setCustomLLMBaseUrl = (baseUrl: string) => {
    const provider = getCustomLLMProviderType();
    if (provider === 'ollama') {
        setOllamaBaseUrl(baseUrl);
    } else if (provider === 'openai') {
        setOpenAIBaseUrl(baseUrl);
    }
};

export const useCustomLLMBaseUrl = () =>
    useSettingsStorageValue(getCustomLLMBaseUrl, DEFAULT_OLLAMA_BASE_URL);

export const getOllamaModel = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_ollama_model') || localStorage.getItem('curio_llm_model') || '';
};

export const setOllamaModel = (model: string) => {
    localStorage.setItem('curio_ollama_model', model);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const getOpenaiModel = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_openai_model') || localStorage.getItem('curio_llm_model') || '';
};

export const setOpenAIModel = (model: string) => {
    localStorage.setItem('curio_openai_model', model);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

// Aliases for back compat with other components
export const getOpenAIModel = getOpenaiModel;
export const setOpenaiModel = setOpenAIModel;

export const getCustomLLMModel = (): string => {
    const provider = getCustomLLMProviderType();
    if (provider === 'gemini') return getGeminiTextModel();
    return provider === 'ollama' ? getOllamaModel() : getOpenAIModel();
};

export const setCustomLLMModel = (model: string) => {
    const provider = getCustomLLMProviderType();
    if (provider === 'gemini') {
        setGeminiTextModel(model);
    } else if (provider === 'ollama') {
        setOllamaModel(model);
    } else {
        setOpenAIModel(model);
    }
};

export const useCustomLLMModel = () => useSettingsStorageValue(getCustomLLMModel, 'qwen3');

const OPENAI_COMPATIBLE_LEGACY_API_KEY_STORAGE_KEYS = [
    'curio_openai_api_key',
    'curio_llm_api_key',
] as const;

const normalizeOpenAICompatibleApiKeyPart = (value: string, fallback: string): string => {
    const normalized = value.trim().toLowerCase();
    return encodeURIComponent(normalized || fallback);
};

export const getOpenAICompatibleApiKeyStorageKey = (
    presetId: OpenAICompatibleProviderPresetId = getOpenAICompatibleProviderPresetId(),
    model: string = getOpenaiModel(),
    baseUrl: string = getOpenaiBaseUrl(),
): string => {
    const modelPart = normalizeOpenAICompatibleApiKeyPart(model, 'default-model');
    const endpointPart = presetId === 'custom'
        ? `:${normalizeOpenAICompatibleApiKeyPart(baseUrl, 'default-endpoint')}`
        : '';

    return `curio_openai_api_key:${presetId}:${modelPart}${endpointPart}`;
};

interface OpenAIApiKeyLookupOptions {
    allowLegacyFallback?: boolean;
}

const getLegacyOpenAIApiKeySync = (): string => {
    for (const key of OPENAI_COMPATIBLE_LEGACY_API_KEY_STORAGE_KEYS) {
        const value = getSecretSync(key);
        if (value) return value;
    }
    return '';
};

const getLegacyOpenAIApiKeyAsync = async (): Promise<string> => {
    for (const key of OPENAI_COMPATIBLE_LEGACY_API_KEY_STORAGE_KEYS) {
        const value = await getSecret(key);
        if (value) return value;
    }
    return '';
};

export const getOpenaiApiKey = (
    presetId: OpenAICompatibleProviderPresetId = getOpenAICompatibleProviderPresetId(),
    model: string = getOpenaiModel(),
    baseUrl: string = getOpenaiBaseUrl(),
    options: OpenAIApiKeyLookupOptions = {},
): string => {
    if (typeof window === 'undefined') return '';
    const storageKey = getOpenAICompatibleApiKeyStorageKey(presetId, model, baseUrl);
    const value = getSecretSync(storageKey);
    if (value) return value;
    return options.allowLegacyFallback === true ? getLegacyOpenAIApiKeySync() : '';
};

export const setOpenAIApiKey = async (
    apiKey: string,
    presetId: OpenAICompatibleProviderPresetId = getOpenAICompatibleProviderPresetId(),
    model: string = getOpenaiModel(),
    baseUrl: string = getOpenaiBaseUrl(),
) => {
    const storageKey = getOpenAICompatibleApiKeyStorageKey(presetId, model, baseUrl);
    const trimmedApiKey = apiKey.trim();
    await setSecret(storageKey, trimmedApiKey);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

// Aliases
export const getOpenAIApiKey = getOpenaiApiKey;
export const setOpenaiApiKey = setOpenAIApiKey;

export const getOpenaiApiKeyAsync = async (
    presetId: OpenAICompatibleProviderPresetId = getOpenAICompatibleProviderPresetId(),
    model: string = getOpenaiModel(),
    baseUrl: string = getOpenaiBaseUrl(),
    options: OpenAIApiKeyLookupOptions = {},
): Promise<string> => {
    const storageKey = getOpenAICompatibleApiKeyStorageKey(presetId, model, baseUrl);
    const val = await getSecret(storageKey);
    if (val) return val;
    if (options.allowLegacyFallback !== true) return '';

    const legacy = await getLegacyOpenAIApiKeyAsync();
    return legacy || '';
};
export const getOpenAIApiKeyAsync = getOpenaiApiKeyAsync;

export const getCustomLLMApiKey = (): string => {
    const provider = getCustomLLMProviderType();
    return provider === 'openai' ? getOpenAIApiKey() : '';
};

export const useCustomLLMApiKey = () => useSettingsStorageValue(getCustomLLMApiKey, '');

export const getCustomLLMApiKeyAsync = async (): Promise<string> => {
    const provider = getCustomLLMProviderType();
    if (provider === 'openai') {
        return await getOpenaiApiKeyAsync();
    }
    if (provider === 'gemini') {
        return '';
    }
    const val = await getSecret('curio_llm_api_key');
    if (val) return val;
    const raw = localStorage.getItem('curio_llm_api_key') || '';
    if (raw && !raw.startsWith('enc::')) return raw;
    return '';
};

export const setCustomLLMApiKey = async (apiKey: string) => {
    const provider = getCustomLLMProviderType();
    if (provider === 'openai') {
        await setOpenAIApiKey(apiKey);
    } else if (provider === 'ollama') {
        await setSecret('curio_llm_api_key', apiKey);
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('curio:settings-changed'));
    }
};

export type CustomTTSEngine = 'auto' | 'browser' | 'pocket-tts' | 'kitten-tts' | 'tiny-tts' | 'piper-tts' | 'remote';

export const getCustomTTSEngine = (): CustomTTSEngine => {
    if (typeof window === 'undefined') return 'auto';
    const value = localStorage.getItem('curio_tts_engine');
    if (
        value === 'browser' ||
        value === 'pocket-tts' ||
        value === 'kitten-tts' ||
        value === 'tiny-tts' ||
        value === 'piper-tts' ||
        value === 'remote'
    ) return value;
    return 'auto';
};
export const useCustomTTSEngine = () =>
    useSettingsStorageValue(getCustomTTSEngine, 'auto' as CustomTTSEngine);

// Which Kitten TTS model variant to use: nano (15M), micro (40M), mini (80M).
// Separate from the voice id since the same 8 voice names exist across all
// three models.
export type KittenModelChoice = 'nano' | 'micro' | 'mini';
export const DEFAULT_KITTEN_MODEL: KittenModelChoice = 'micro';

export const getKittenModelId = (): KittenModelChoice => {
    if (typeof window === 'undefined') return DEFAULT_KITTEN_MODEL;
    const value = localStorage.getItem('curio_kitten_model');
    if (value === 'nano' || value === 'micro' || value === 'mini') return value;
    return DEFAULT_KITTEN_MODEL;
};

export const setKittenModelId = (id: KittenModelChoice) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('curio_kitten_model', id);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useKittenModelId = () =>
    useSettingsStorageValue(getKittenModelId, DEFAULT_KITTEN_MODEL);

export const getCustomTTSVoiceId = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_tts_voice_id') || '';
};
export const useCustomTTSVoiceId = () => useSettingsStorageValue(getCustomTTSVoiceId, '');

export const getCustomTTSVoiceProfileId = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_tts_voice_profile_id') || '';
};
export const useCustomTTSVoiceProfileId = () =>
    useSettingsStorageValue(getCustomTTSVoiceProfileId, '');

export const getTtsRemoteUrl = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_tts_remote_url') || '';
};
export const useTtsRemoteUrl = () => useSettingsStorageValue(getTtsRemoteUrl, '');

export const getTtsRemoteModel = (): string => {
    if (typeof window === 'undefined') return 'tts-1';
    return localStorage.getItem('curio_tts_remote_model') || 'tts-1';
};
export const useTtsRemoteModel = () => useSettingsStorageValue(getTtsRemoteModel, 'tts-1');

export const setMuteMicWhileAiSpeaking = (enabled: boolean) => {
    localStorage.setItem('curio_mute_mic_while_speaking', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setClearVoiceEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_clear_voice_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};



export const setVoiceGateThreshold = (threshold: number) => {
    localStorage.setItem('curio_voice_gate_threshold', threshold.toString());
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setCustomTTSEngine = (engine: CustomTTSEngine) => {
    localStorage.setItem('curio_tts_engine', engine);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setCustomTTSVoiceId = (voiceId: string) => {
    if (voiceId) {
        localStorage.setItem('curio_tts_voice_id', voiceId);
    } else {
        localStorage.removeItem('curio_tts_voice_id');
    }
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setCustomTTSVoiceProfileId = (voiceProfileId: string) => {
    if (voiceProfileId) {
        localStorage.setItem('curio_tts_voice_profile_id', voiceProfileId);
    } else {
        localStorage.removeItem('curio_tts_voice_profile_id');
    }
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setTtsRemoteUrl = (url: string) => {
    localStorage.setItem('curio_tts_remote_url', url);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setTtsRemoteModel = (model: string) => {
    localStorage.setItem('curio_tts_remote_model', model);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setTtsRemoteApiKey = async (
    key: string,
    presetId: RemoteTtsProviderPresetId = getRemoteTtsProviderPresetId(),
) => {
    // Scope the primary credential by preset so switching from ElevenLabs to
    // Azure (for example) does not show the ElevenLabs key in the Azure
    // subscription-key field. A shared copy is also written so older code
    // paths that read curio_tts_remote_api_key directly keep working.
    await setSecret(ttsRemotePrimaryKeyStorageKey(presetId), key);
    await setSecret('curio_tts_remote_api_key', key);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

const ttsRemotePrimaryKeyStorageKey = (
    presetId: RemoteTtsProviderPresetId = getRemoteTtsProviderPresetId(),
): string => `curio_tts_remote_api_key:${presetId}`;

export const getTtsRemotePrimaryKeyStorageKey = ttsRemotePrimaryKeyStorageKey;

export const getTtsRemoteApiKeyAsync = async (
    presetId: RemoteTtsProviderPresetId = getRemoteTtsProviderPresetId(),
): Promise<string> => {
    const scoped = await getSecret(ttsRemotePrimaryKeyStorageKey(presetId));
    if (scoped) return scoped;
    // Backward compatibility: before preset scoping, a single shared key was
    // used. Adopt that value for the current preset, then return it.
    const legacy = await getSecret('curio_tts_remote_api_key');
    if (legacy) {
        await setSecret(ttsRemotePrimaryKeyStorageKey(presetId), legacy);
        return legacy;
    }
    return '';
};

// ---------------------------------------------------------------------------
// Remote TTS provider preset. Parallels the text LLM provider preset: lets
// users pick ElevenLabs, Gemini, OpenAI, Amazon Polly, Azure Speech, or an
// advanced "Custom" (OpenAI-compatible) endpoint. Each preset has its own
// default base URL, default model/voice, and credential set; the preset id
// also scopes the per-provider secrets below.
// ---------------------------------------------------------------------------

const TTS_REMOTE_PRESET_STORAGE_KEY = 'curio_tts_remote_provider_preset';

export type { RemoteTtsProviderPresetId };

export const getRemoteTtsProviderPresetId = (): RemoteTtsProviderPresetId => {
    if (typeof window === 'undefined') return DEFAULT_REMOTE_TTS_PROVIDER_PRESET_ID;
    const value = localStorage.getItem(TTS_REMOTE_PRESET_STORAGE_KEY);
    return isRemoteTtsProviderPresetId(value) ? value : DEFAULT_REMOTE_TTS_PROVIDER_PRESET_ID;
};

export const setRemoteTtsProviderPresetId = (presetId: RemoteTtsProviderPresetId) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TTS_REMOTE_PRESET_STORAGE_KEY, presetId);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useRemoteTtsProviderPresetId = () =>
    useSettingsStorageValue(
        getRemoteTtsProviderPresetId,
        DEFAULT_REMOTE_TTS_PROVIDER_PRESET_ID,
    );

// --- Region (Amazon Polly, Azure Speech) -----------------------------------

const ttsRemoteRegionStorageKey = (presetId: RemoteTtsProviderPresetId): string =>
    `curio_tts_remote_region:${presetId}`;

export const getTtsRemoteRegion = (
    presetId: RemoteTtsProviderPresetId = getRemoteTtsProviderPresetId(),
): string => {
    if (typeof window === 'undefined') return '';
    const stored = localStorage.getItem(ttsRemoteRegionStorageKey(presetId));
    if (stored) return stored;
    return getRemoteTtsProviderPreset(presetId).defaultRegion ?? '';
};

export const setTtsRemoteRegion = (
    region: string,
    presetId: RemoteTtsProviderPresetId = getRemoteTtsProviderPresetId(),
) => {
    if (typeof window === 'undefined') return;
    const key = ttsRemoteRegionStorageKey(presetId);
    if (region) localStorage.setItem(key, region);
    else localStorage.removeItem(key);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useTtsRemoteRegion = () =>
    useSettingsStorageValue(() => getTtsRemoteRegion(), '');

// --- Secondary credential (Polly secret access key) ------------------------
//
// Polly is the only currently supported preset that needs a second credential
// (access key id + secret access key). Azure and ElevenLabs have a single
// credential stored under the primary curio_tts_remote_api_key. The secret is
// stored under curio_tts_remote_secondary_key:<presetId> so future presets
// with a secondary credential slot in naturally.

const ttsRemoteSecondaryKeyStorageKey = (
    presetId: RemoteTtsProviderPresetId = getRemoteTtsProviderPresetId(),
): string => `curio_tts_remote_secondary_key:${presetId}`;

export const getTtsRemoteSecondaryKeyStorageKey = ttsRemoteSecondaryKeyStorageKey;

export const getTtsRemoteSecondaryKeyAsync = async (
    presetId: RemoteTtsProviderPresetId = getRemoteTtsProviderPresetId(),
): Promise<string> => {
    const value = await getSecret(ttsRemoteSecondaryKeyStorageKey(presetId));
    return value || '';
};

export const setTtsRemoteSecondaryKey = async (
    key: string,
    presetId: RemoteTtsProviderPresetId = getRemoteTtsProviderPresetId(),
) => {
    await setSecret(ttsRemoteSecondaryKeyStorageKey(presetId), key);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};


// --- Offline Mode ---
export const getOfflineModeEnabled = () => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('curio_offline_mode') === 'true';
};
export const setOfflineModeEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_offline_mode', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useOfflineModeEnabled = () => useSettingsStorageValue(getOfflineModeEnabled, false);

// --- Voice Backend ---
export type VoiceBackend = 'liveapi' | 'nova_sonic' | 'offline' | 'ha_voice_pipeline' | 'custom_llm';
export const DEFAULT_VOICE_BACKEND: VoiceBackend = 'offline';

export const getVoiceBackend = (): VoiceBackend => {
    if (typeof window === 'undefined') return DEFAULT_VOICE_BACKEND;
    const val = localStorage.getItem('curio_voice_backend') as VoiceBackend | null;
    if (val === 'liveapi' || val === 'nova_sonic' || val === 'offline' || val === 'ha_voice_pipeline' || val === 'custom_llm') return val;
    // Migrate from legacy offline toggle
    if (localStorage.getItem('curio_offline_mode') === 'true') return 'offline';
    return DEFAULT_VOICE_BACKEND;
};
export const setVoiceBackend = (backend: VoiceBackend) => {
    localStorage.setItem('curio_voice_backend', backend);
    // Keep legacy key in sync for backwards compat
    localStorage.setItem('curio_offline_mode', backend === 'offline' ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useVoiceBackend = () => useSettingsStorageValue(getVoiceBackend, DEFAULT_VOICE_BACKEND);

// --- HA Voice Pipeline ID ---
export const getHaVoicePipelineId = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_ha_voice_pipeline_id') || '';
};
export const setHaVoicePipelineId = (id: string) => {
    localStorage.setItem('curio_ha_voice_pipeline_id', id);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useHaVoicePipelineId = () => useSettingsStorageValue(getHaVoicePipelineId, '');

// --- Speaker Identification ---
export const getSpeakerIdentificationEnabled = (): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('curio_speaker_identification_enabled') === 'true';
};
export const setSpeakerIdentificationEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_speaker_identification_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useSpeakerIdentificationEnabled = () =>
    useSettingsStorageValue(getSpeakerIdentificationEnabled, false);

export const getSpeakerAlwaysOnEnabled = (): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('curio_speaker_always_on_enabled') === 'true';
};
export const setSpeakerAlwaysOnEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_speaker_always_on_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useSpeakerAlwaysOnEnabled = () =>
    useSettingsStorageValue(getSpeakerAlwaysOnEnabled, false);

export const getSpeakerDefaultProfileId = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_default_speaker_profile_id') || '';
};
export const setSpeakerDefaultProfileId = (profileId: string) => {
    if (profileId) {
        localStorage.setItem('curio_default_speaker_profile_id', profileId);
    } else {
        localStorage.removeItem('curio_default_speaker_profile_id');
    }
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useSpeakerDefaultProfileId = () =>
    useSettingsStorageValue(getSpeakerDefaultProfileId, '');

// --- Speaker Mute ---
export const getSpeakerMuted = () => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('curio_speaker_muted') === 'true';
};
export const setSpeakerMuted = (muted: boolean) => {
    localStorage.setItem('curio_speaker_muted', muted ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
    // Notify the audio playback manager immediately
    window.dispatchEvent(new CustomEvent('curio:speaker-mute', { detail: { muted } }));
};
export const useSpeakerMuted = () => useSettingsStorageValue(getSpeakerMuted, false);

// ---------------------------------------------------------------------------
// Wake-word detection threshold override. When set, this overrides the
// per-model default threshold from the wake-word catalog. Range: 0.10 - 0.95.
// Lower = more sensitive (more false positives), higher = stricter (may miss).
// null means "use the catalog default" (most common).
// ---------------------------------------------------------------------------

export const getWakeWordThreshold = (): number | null => {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem('curio_wake_word_threshold');
    if (!raw) return null;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return null;
    return Math.min(0.95, Math.max(0.1, n));
};
export const setWakeWordThreshold = (value: number | null) => {
    if (value === null) {
        localStorage.removeItem('curio_wake_word_threshold');
    } else {
        const clamped = Math.min(0.95, Math.max(0.1, value));
        localStorage.setItem('curio_wake_word_threshold', clamped.toString());
    }
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useWakeWordThreshold = () =>
    useSettingsStorageValue<number | null>(getWakeWordThreshold, null);

// ---------------------------------------------------------------------------
// Microphone input gain (dB). Applied to both wake-word and Live API capture
// paths via a GainNode. Default 0 dB (unity). Range: -12 to +24 dB.
// ---------------------------------------------------------------------------

export const getMicGainDb = (): number => {
    if (typeof window === 'undefined') return 0;
    const raw = localStorage.getItem('curio_mic_gain_db');
    if (!raw) return 0;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return 0;
    return Math.min(24, Math.max(-12, n));
};
export const setMicGainDb = (db: number) => {
    const clamped = Math.min(24, Math.max(-12, db));
    localStorage.setItem('curio_mic_gain_db', clamped.toString());
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
    // Broadcast so live audio nodes can update without restart
    window.dispatchEvent(new CustomEvent('curio:mic-gain-changed', { detail: { db: clamped } }));
};
export const useMicGainDb = () => useSettingsStorageValue(getMicGainDb, 0);

/** Convert a dB value to a linear gain multiplier. 0 dB => 1.0. */
export const dbToGain = (db: number): number => Math.pow(10, db / 20);

