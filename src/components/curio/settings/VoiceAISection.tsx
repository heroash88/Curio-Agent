import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Brain, AudioWaveform, Server, RotateCcw, Sliders, Sparkles, Zap, Languages, Upload, Play, Loader2, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { GEMINI_LIVE_MODELS, GEMINI_TEXT_MODELS, getGeminiLiveModel, setGeminiLiveModel, NOVA_VOICES, getNovaVoice, setNovaVoice } from '../../../services/ai/config';
import {
    OPENAI_COMPATIBLE_PROVIDER_PRESETS,
    TEXT_LLM_PROVIDER_OPTIONS,
    getOpenAICompatibleProviderPreset,
    getTextLLMProviderOptionValue,
    resolveTextLLMProviderOption,
} from '../../../services/ai/openAICompatiblePresets';
import { GEMINI_LIVE_VOICES } from '../../../services/geminiVoiceCatalog';
import { getAvailableWakeWords, getWakeWordDefinition } from '../../../services/wakeWordCatalog';
import {
    REMOTE_TTS_PROVIDER_PRESETS,
    getRemoteTtsProviderPreset,
    type RemoteTtsProviderPresetId,
} from '../../../services/remoteTtsPresets';
import {
    useWakeWordThreshold, setWakeWordThreshold,
    useMicGainDb, setMicGainDb,
    useKittenModelId, setKittenModelId,
    getOpenaiApiKeyAsync,
} from '../../../utils/settingsStorage';
import { saveCustomWakeWord, deleteCustomWakeWord, listCustomWakeWords, revokeCustomWakeWordBlobUrl } from '../../../services/customWakeWordStore';
import { loadCustomWakeWords } from '../../../services/wakeWordCatalog';
import { fetchPipelinesStandalone as fetchHaPipelines } from '../../../services/haVoicePipelineService';
import { subscribeTtsProgress } from '../../../services/ttsProgress';
import { isSafariBrowser } from '../../../services/audioContext';
import { useLiveAPIControls } from '../../../contexts/LiveAPIContext';
import type {
    CustomLLMProviderType,
    CustomTTSEngine,
    VoiceBackend,
} from '../../../utils/settingsStorage';
import { isIOSDevice } from '../../../utils/pwa';
import SettingsSection from '../SettingsSection';
import SettingsToggle from '../SettingsToggle';
import PersonalitySelector from './PersonalitySelector';
import { VoiceRecordingModal } from './VoiceRecordingModal';
import type { OpenAICompatibleProviderPresetId, TextLLMProviderOptionId } from '../../../services/ai/openAICompatiblePresets';
import {
    CUSTOM_LLM_MODEL_SELECT_VALUE,
    getLlmModelSelectValue,
    shouldApplyOpenAIModelDefault,
} from './voiceAiModelSelection';

interface VoiceAISectionProps {
    unlockAudio: () => Promise<boolean | void>;
    voiceBackend: string;
    setVoiceBackend: (v: VoiceBackend) => void;
    localApiKey: string;
    setLocalApiKey: (v: string) => void;
    localNovaApiKey: string;
    setLocalNovaApiKey: (v: string) => void;
    liveApiVoiceId: string;
    setLiveApiVoiceId: (v: string) => void;
    localCustomLLMProviderType: CustomLLMProviderType;
    setLocalCustomLLMProviderType: (v: CustomLLMProviderType) => void;
    localOpenAIProviderPresetId: OpenAICompatibleProviderPresetId;
    setLocalOpenAIProviderPresetId: (v: OpenAICompatibleProviderPresetId) => void;
    localOllamaUrl: string;
    setLocalOllamaUrl: (v: string) => void;
    localOpenAIUrl: string;
    setLocalOpenAIUrl: (v: string) => void;
    localOllamaModel: string;
    setLocalOllamaModel: (v: string) => void;
    localGeminiModel: string;
    setLocalGeminiModel: (v: string) => void;
    localGeminiTextApiKey: string;
    setLocalGeminiTextApiKey: (v: string) => void;
    localOpenAIModel: string;
    setLocalOpenAIModel: (v: string) => void;
    localOpenAIApiKey: string;
    setLocalOpenAIApiKey: (v: string) => void;
    haMcpEnabled: boolean;
    setHaMcpEnabled: (v: boolean) => void;
    haVoicePipelineId: string;
    setHaVoicePipelineId: (v: string) => void;
    customTTSEngine: CustomTTSEngine;
    setCustomTTSEngine: (v: CustomTTSEngine) => void;
    customTTSVoiceId: string;
    setCustomTTSVoiceId: (v: string) => void;
    customTTSVoiceProfileId: string;
    setCustomTTSVoiceProfileId: (v: string) => void;
    wakeWordEnabled: boolean;
    handleHandsFreeToggle: () => void;
    subtitlesEnabled: boolean;
    setSubtitlesEnabled: (v: boolean) => void;
    selectedWakeWordId: string;
    setSelectedWakeWordId: (v: string) => void;
    selectedWakeWordPhrase: string;
    ttsRemoteUrl: string;
    setTtsRemoteUrl: (v: string) => void;
    ttsRemoteModel: string;
    setTtsRemoteModel: (v: string) => void;
    ttsRemoteApiKey: string;
    setTtsRemoteApiKey: (v: string) => void;
    ttsRemoteProviderPresetId: RemoteTtsProviderPresetId;
    setTtsRemoteProviderPresetId: (v: RemoteTtsProviderPresetId) => void;
    ttsRemoteRegion: string;
    setTtsRemoteRegion: (v: string) => void;
    ttsRemoteSecondaryKey: string;
    setTtsRemoteSecondaryKey: (v: string) => void;
    customWakeWords: Array<{ id: string; label: string; phrase: string; threshold: number; filename: string }>;
    setCustomWakeWords: (v: Array<{ id: string; label: string; phrase: string; threshold: number; filename: string }>) => void;
}

const PREVIEW_TEXT = "Hi, I am Curio. I am your AI companion and I'm ready to help you explore and learn!";

const SecretField: React.FC<{
    label: string;
    icon: React.ReactNode;
    placeholder: string;
    value: string;
    onChange: (v: string) => void;
    show: boolean;
    onToggleShow: () => void;
    hint?: React.ReactNode;
}> = ({ label, icon, placeholder, value, onChange, show, onToggleShow, hint }) => {
    const fieldName = `curio-field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

    return (
        <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {icon}
                {label}
            </label>
            <div className="curio-secret-field flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <input
                    type="text"
                    name={fieldName}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    placeholder={placeholder}
                    className="curio-secret-input w-full bg-transparent text-sm text-slate-700 outline-none"
                    style={{ WebkitTextSecurity: show ? 'none' : 'disc' } as React.CSSProperties}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={(event) => event.stopPropagation()}
                />
                <button type="button" onClick={onToggleShow} className="text-slate-400 transition-colors hover:text-slate-600">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
            </div>
            {hint && <p className="px-1 text-[10px] italic text-slate-400">{hint}</p>}
        </div>
    );
};

const VoiceAISection: React.FC<VoiceAISectionProps> = ({
    unlockAudio,
    voiceBackend, setVoiceBackend,
    localApiKey, setLocalApiKey,
    localNovaApiKey, setLocalNovaApiKey,
    liveApiVoiceId, setLiveApiVoiceId,
    localCustomLLMProviderType, setLocalCustomLLMProviderType,
    localOpenAIProviderPresetId, setLocalOpenAIProviderPresetId,
    localOllamaUrl, setLocalOllamaUrl,
    localOpenAIUrl, setLocalOpenAIUrl,
    localOllamaModel, setLocalOllamaModel,
    localGeminiModel, setLocalGeminiModel,
    localGeminiTextApiKey, setLocalGeminiTextApiKey,
    localOpenAIModel, setLocalOpenAIModel,
    localOpenAIApiKey, setLocalOpenAIApiKey,
    haMcpEnabled, setHaMcpEnabled,
    haVoicePipelineId, setHaVoicePipelineId,
    customTTSEngine, setCustomTTSEngine,
    customTTSVoiceId, setCustomTTSVoiceId,
    customTTSVoiceProfileId, setCustomTTSVoiceProfileId,
    wakeWordEnabled, handleHandsFreeToggle,
    subtitlesEnabled, setSubtitlesEnabled,
    selectedWakeWordId, setSelectedWakeWordId,
    selectedWakeWordPhrase,
    customWakeWords, setCustomWakeWords,
    ttsRemoteUrl, setTtsRemoteUrl,
    ttsRemoteModel, setTtsRemoteModel,
    ttsRemoteApiKey, setTtsRemoteApiKey,
    ttsRemoteProviderPresetId, setTtsRemoteProviderPresetId,
    ttsRemoteRegion, setTtsRemoteRegion,
    ttsRemoteSecondaryKey, setTtsRemoteSecondaryKey,
}) => {
    const { resetSession } = useLiveAPIControls();
    const kittenModelId = useKittenModelId();
    const [currentModel, setCurrentModel] = useState(getGeminiLiveModel());
    const [currentNovaVoice, setCurrentNovaVoice] = useState(getNovaVoice());
    const [showGeminiApiKey, setShowGeminiApiKey] = useState(false);
    const [showGeminiTextApiKey, setShowGeminiTextApiKey] = useState(false);
    const [showNovaApiKey, setShowNovaApiKey] = useState(false);
    const [showOpenAIApiKey, setShowOpenAIApiKey] = useState(false);
    const [showRemoteTtsApiKey, setShowRemoteTtsApiKey] = useState(false);
    const [showRemoteTtsSecondaryKey, setShowRemoteTtsSecondaryKey] = useState(false);
    const [haPipelines, setHaPipelines] = useState<Array<{ id: string; name: string }>>([]);
    const [pipelinesLoading, setPipelinesLoading] = useState(false);
    const [showCustomWakeWordUpload, setShowCustomWakeWordUpload] = useState(false);
    const [ttsVoices, setTtsVoices] = useState<Array<{ id: string; label: string; source: string }>>([]);
    const [clonedVoices, setClonedVoices] = useState<Array<{ id: string; name: string }>>([]);
    const [ttsLoading, setTtsLoading] = useState(false);
    const [ttsStatus, setTtsStatus] = useState<string | null>(null);
    const [remoteModels, setRemoteModels] = useState<string[]>([]);
    const [fetchingModels, setFetchingModels] = useState(false);
    const [llmModels, setLlmModels] = useState<string[]>([]);
    const [fetchingLlmModels, setFetchingLlmModels] = useState(false);
    const [llmFetchError, setLlmFetchError] = useState<string | null>(null);
    const [isCustomLlmModelInput, setIsCustomLlmModelInput] = useState(false);
    const [voiceAction, setVoiceAction] = useState<'recording' | 'processing' | 'previewing' | null>(null);
    const [showVoiceRecordingModal, setShowVoiceRecordingModal] = useState(false);
    const [isModelsReady, setIsModelsReady] = useState<boolean | null>(null);
    const [isManagingModels, setIsManagingModels] = useState(false);
    const [isTinyReady, setIsTinyReady] = useState<boolean | null>(null);
    const [isTinyPreparing, setIsTinyPreparing] = useState(false);
    const [isPiperReady, setIsPiperReady] = useState<boolean | null>(null);
    const [isPiperPreparing, setIsPiperPreparing] = useState(false);
    const voiceUploadInputRef = useRef<HTMLInputElement | null>(null);
    const tinyPrepareAttemptRef = useRef(false);
    const piperPrepareAttemptRef = useRef(false);
    const piperPreparedVoiceRef = useRef<string | null>(null);
    const openAIKeyLoadSeqRef = useRef(0);

    const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
    const [confirmingReset, setConfirmingReset] = useState(false);
    const [uploadVoiceName, setUploadVoiceName] = useState<{ blob: Blob; suggested: string } | null>(null);
    const iosDevice = isIOSDevice();
    const shouldAvoidPocketWarmup = iosDevice || isSafariBrowser;

    // Debounced writers -- sliders fire rapid updates, but we don't want every
    // pixel move to round-trip through localStorage + broadcast the custom
    // event (which the live audio graph acts on). 80ms feels instant without
    // thrashing.
    const thresholdTimer = useRef<number | null>(null);
    const gainTimer = useRef<number | null>(null);
    const userThreshold = useWakeWordThreshold();
    const micGainDb = useMicGainDb();
    const toolLlmBaseUrl = localCustomLLMProviderType === 'ollama'
        ? localOllamaUrl
        : localCustomLLMProviderType === 'openai'
            ? localOpenAIUrl
            : '';
    const setToolLlmBaseUrl = localCustomLLMProviderType === 'ollama' ? setLocalOllamaUrl : setLocalOpenAIUrl;
    const toolLlmModel = localCustomLLMProviderType === 'gemini'
        ? localGeminiModel
        : localCustomLLMProviderType === 'ollama'
            ? localOllamaModel
            : localOpenAIModel;
    const setToolLlmModel = localCustomLLMProviderType === 'gemini'
        ? setLocalGeminiModel
        : localCustomLLMProviderType === 'ollama'
            ? setLocalOllamaModel
            : setLocalOpenAIModel;
    const openAIProviderPreset = getOpenAICompatibleProviderPreset(localOpenAIProviderPresetId);
    const openAIModelOptions = Array.from(new Set([
        ...openAIProviderPreset.modelOptions,
        ...llmModels,
    ].filter(Boolean)));
    const geminiModelOptions = GEMINI_TEXT_MODELS.map((model) => model.id);
    const llmModelOptions = localCustomLLMProviderType === 'gemini'
        ? geminiModelOptions
        : localCustomLLMProviderType === 'openai'
            ? openAIModelOptions
            : llmModels;
    const llmModelSelectValue = getLlmModelSelectValue(
        llmModelOptions,
        toolLlmModel,
        isCustomLlmModelInput,
    );
    const showOpenAIBaseUrlInput = localCustomLLMProviderType === 'openai' && openAIProviderPreset.showBaseUrlInput === true;
    const openAIBaseUrlEditable = showOpenAIBaseUrlInput;
    const openAIBaseUrlPlaceholder = openAIProviderPreset.baseUrlPlaceholder || (localCustomLLMProviderType === 'openai' ? 'https://api.example.com' : 'http://localhost:11434');
    const openAIModelLabel = openAIProviderPreset.modelLabel || 'Model';
    const openAISecretLabel = openAIProviderPreset.apiKeyLabel;
    const textLLMProviderValue = getTextLLMProviderOptionValue(
        localCustomLLMProviderType,
        localOpenAIProviderPresetId,
    );
    const textLLMProviderOption = resolveTextLLMProviderOption(textLLMProviderValue);
    const llmProviderBadgeLabel = textLLMProviderOption.label;
    const catalogDefaultThreshold = getWakeWordDefinition(selectedWakeWordId).threshold;
    const effectiveThreshold = userThreshold ?? catalogDefaultThreshold;
    const [localThreshold, setLocalThreshold] = useState<number>(effectiveThreshold);
    const [localGainDb, setLocalGainDb] = useState<number>(micGainDb);
    const loadOpenAIProviderApiKey = useCallback(async (
        presetId: OpenAICompatibleProviderPresetId,
        model: string,
        baseUrl: string,
    ) => {
        const loadSeq = openAIKeyLoadSeqRef.current + 1;
        openAIKeyLoadSeqRef.current = loadSeq;
        setLocalOpenAIApiKey('');
        const apiKey = await getOpenaiApiKeyAsync(presetId, model, baseUrl, { allowLegacyFallback: false });
        if (openAIKeyLoadSeqRef.current === loadSeq) {
            setLocalOpenAIApiKey(apiKey);
        }
    }, [setLocalOpenAIApiKey]);
    // Keep local state in sync when the user switches wake word or settings
    // change elsewhere.
    React.useEffect(() => { setLocalThreshold(effectiveThreshold); }, [effectiveThreshold]);
    React.useEffect(() => { setLocalGainDb(micGainDb); }, [micGainDb]);
    useEffect(() => {
        if (localCustomLLMProviderType !== 'openai') return;
        void loadOpenAIProviderApiKey(localOpenAIProviderPresetId, localOpenAIModel, localOpenAIUrl);
    }, [
        loadOpenAIProviderApiKey,
        localCustomLLMProviderType,
        localOpenAIModel,
        localOpenAIProviderPresetId,
        localOpenAIUrl,
    ]);

    useEffect(() => {
        if (localCustomLLMProviderType !== 'openai') return;
        if (openAIProviderPreset.baseUrl && localOpenAIUrl !== openAIProviderPreset.baseUrl) {
            setLocalOpenAIUrl(openAIProviderPreset.baseUrl);
        }
        if (shouldApplyOpenAIModelDefault(
            localCustomLLMProviderType,
            localOpenAIModel,
            openAIProviderPreset.defaultModel,
            isCustomLlmModelInput,
        )) {
            setLocalOpenAIModel(openAIProviderPreset.defaultModel);
        }
    }, [
        isCustomLlmModelInput,
        localCustomLLMProviderType,
        localOpenAIModel,
        localOpenAIUrl,
        openAIProviderPreset.baseUrl,
        openAIProviderPreset.defaultModel,
        setLocalOpenAIModel,
        setLocalOpenAIUrl,
    ]);

    const handleOpenAIProviderPresetChange = useCallback((presetId: OpenAICompatibleProviderPresetId) => {
        const preset = getOpenAICompatibleProviderPreset(presetId);
        const normalizedCurrentOpenAIUrl = localOpenAIUrl.trim().replace(/\/+$/, '');
        const currentUrlIsFixedPreset = OPENAI_COMPATIBLE_PROVIDER_PRESETS.some(
            (candidate) => candidate.baseUrl && candidate.baseUrl.replace(/\/+$/, '') === normalizedCurrentOpenAIUrl,
        );
        let nextOpenAIUrl = localOpenAIUrl;
        let nextOpenAIModel = localOpenAIModel;

        setLocalOpenAIProviderPresetId(presetId);
        setIsCustomLlmModelInput(false);
        setLlmModels([]);
        setLlmFetchError(null);

        if (preset.baseUrl) {
            nextOpenAIUrl = preset.baseUrl;
            setLocalOpenAIUrl(nextOpenAIUrl);
        } else if (currentUrlIsFixedPreset) {
            nextOpenAIUrl = '';
            setLocalOpenAIUrl(nextOpenAIUrl);
        }

        if (preset.defaultModel) {
            nextOpenAIModel = preset.defaultModel;
            setLocalOpenAIModel(nextOpenAIModel);
        } else if (preset.modelOptions.length > 0) {
            nextOpenAIModel = preset.modelOptions[0];
            setLocalOpenAIModel(nextOpenAIModel);
        }
        void loadOpenAIProviderApiKey(presetId, nextOpenAIModel, nextOpenAIUrl);
    }, [
        loadOpenAIProviderApiKey,
        localOpenAIModel,
        localOpenAIUrl,
        setLocalOpenAIModel,
        setLocalOpenAIProviderPresetId,
        setLocalOpenAIUrl,
    ]);

    const handleTextLLMProviderChange = useCallback((value: TextLLMProviderOptionId) => {
        const selection = resolveTextLLMProviderOption(value);
        setLocalCustomLLMProviderType(selection.providerType);
        setIsCustomLlmModelInput(false);
        setLlmModels([]);
        setLlmFetchError(null);
        if (selection.providerType === 'openai' && selection.presetId) {
            handleOpenAIProviderPresetChange(selection.presetId);
        }
    }, [
        handleOpenAIProviderPresetChange,
        setLocalCustomLLMProviderType,
    ]);

    const handleRefreshLlmModels = useCallback(async () => {
        if (localCustomLLMProviderType === 'gemini') return;
        if (!toolLlmBaseUrl) return;
        setFetchingLlmModels(true);
        setLlmFetchError(null);
        try {
            const { fetchAvailableModels } = await import('../../../services/ai/llmProvider');
            const models = await fetchAvailableModels(
                toolLlmBaseUrl,
                localCustomLLMProviderType,
                localCustomLLMProviderType === 'ollama' ? '' : localOpenAIApiKey,
            );
            setLlmModels(models);
        } catch (error) {
            setLlmFetchError((error as Error).message || 'Failed to fetch models.');
        } finally {
            setFetchingLlmModels(false);
        }
    }, [localCustomLLMProviderType, localOpenAIApiKey, toolLlmBaseUrl]);

    useEffect(() => {
        if (voiceBackend !== 'custom_llm') return;
        let cancelled = false;

        const loadVoices = async () => {
            setTtsLoading(true);
            setTtsStatus(null);
            try {
                const [{ TTSService }, { listVoiceProfiles }] = await Promise.all([
                    import('../../../services/pocketTtsService'),
                    import('../../../services/voiceProfileStore'),
                ]);

                const service = new TTSService({ engine: customTTSEngine });
                
                // For remote engine, we don't automatically load voices on every mount
                // because it requires a network request that might fail or be slow.
                // The user can trigger it manually via the "Fetch" button.
                if (customTTSEngine === 'remote' && ttsVoices.length === 0) {
                    // We could auto-load if a URL exists, but let's stick to manual for now
                    // to avoid unexpected network errors.
                    return;
                }

                const [availableVoices, customProfiles] = await Promise.all([
                    service.listVoices().catch(() => []),
                    listVoiceProfiles().catch(() => []),
                ]);

                if (!cancelled) {
                    setTtsVoices(availableVoices);
                    setClonedVoices(customProfiles.map((profile) => ({
                        id: profile.id,
                        name: profile.name,
                    })));
                }
            } catch (error) {
                if (!cancelled) {
                    setTtsVoices([]);
                    setClonedVoices([]);
                    setTtsStatus((error as Error).message || 'Failed to load TTS voices.');
                }
            } finally {
                if (!cancelled) {
                    setTtsLoading(false);
                }
            }
        };

        void loadVoices();

        return () => {
            cancelled = true;
        };
    }, [customTTSEngine, voiceBackend]);

    useEffect(() => {
        return subscribeTtsProgress((message) => {
            if (voiceAction === 'previewing') {
                setTtsStatus(message);
            }
        });
    }, [voiceAction]);

    const onThresholdSlide = (v: number) => {
        setLocalThreshold(v);
        if (thresholdTimer.current) window.clearTimeout(thresholdTimer.current);
        thresholdTimer.current = window.setTimeout(() => {
            // If the user drags back to the catalog default, clear the override
            // so future wake-word changes pick up the model's recommended value.
            setWakeWordThreshold(Math.abs(v - catalogDefaultThreshold) < 0.005 ? null : v);
        }, 80);
    };
    const onGainSlide = (v: number) => {
        setLocalGainDb(v);
        if (gainTimer.current) window.clearTimeout(gainTimer.current);
        gainTimer.current = window.setTimeout(() => setMicGainDb(v), 80);
    };

    const handleTtsEngineChange = (engine: CustomTTSEngine) => {
        setCustomTTSEngine(engine);
        setCustomTTSVoiceId('');
        if (engine !== 'pocket-tts') {
            setCustomTTSVoiceProfileId('');
        }
        setTtsStatus(null);
        setIsModelsReady(null);
        setIsTinyReady(null);
        setIsPiperReady(null);
        piperPreparedVoiceRef.current = null;
    };

    const refreshClonedVoices = async () => {
        try {
            const { listVoiceProfiles } = await import('../../../services/voiceProfileStore');
            const profiles = await listVoiceProfiles();
            setClonedVoices(profiles.map((profile) => ({
                id: profile.id,
                name: profile.name,
            })));
        } catch (error) {
            setTtsStatus((error as Error).message || 'Failed to refresh cloned voices.');
        }
    };

    const persistVoiceProfileFromBlob = async (
        blob: Blob,
        source: 'recording' | 'upload',
        name: string,
    ) => {
        setVoiceAction('processing');
        setTtsStatus(null);

        try {
            const [{ createVoiceProfileFromBlob }, { saveVoiceProfile }, { TTSService }] = await Promise.all([
                import('../../../services/voiceCloneService'),
                import('../../../services/voiceProfileStore'),
                import('../../../services/pocketTtsService'),
            ]);

            const ttsService = new TTSService({ engine: 'pocket-tts' });
            await ttsService.prepareVoiceCloneModels();
            const profile = await createVoiceProfileFromBlob(name, blob, { source });
            await saveVoiceProfile(profile);
            setCustomTTSVoiceProfileId(profile.id);
            setCustomTTSVoiceId('');
            await refreshClonedVoices();
            setTtsStatus(`Saved voice "${profile.name}".`);
        } catch (error) {
            setTtsStatus((error as Error).message || 'Failed to save the custom voice.');
        } finally {
            setVoiceAction(null);
        }
    };

    const handleRecordVoice = () => {
        setShowVoiceRecordingModal(true);
    };

    const handleFetchRemoteVoices = async () => {
        setTtsLoading(true);
        setTtsStatus(null);
        try {
            const { TTSService } = await import('../../../services/pocketTtsService');
            const service = new TTSService({ engine: 'remote' });
            
            const availableVoices = await service.listVoices({
                baseUrl: ttsRemoteUrl,
                apiKey: ttsRemoteApiKey,
                presetId: ttsRemoteProviderPresetId,
                region: ttsRemoteRegion,
                secondaryKey: ttsRemoteSecondaryKey,
            });
            
            setTtsVoices(availableVoices);
            setTtsStatus(`Successfully loaded ${availableVoices.length} voices.`);
        } catch (e: any) {
            console.error('[RemoteTTS] Error fetching voices:', e);
            setTtsStatus(`Error: ${e.message || 'Failed to fetch voices'}`);
        } finally {
            setTtsLoading(false);
        }
    };

    const handleFetchRemoteModels = async () => {
        setFetchingModels(true);
        setTtsStatus(null);
        try {
            const { RemoteTtsProvider } = await import('../../../services/remoteTtsProvider');
            const provider = new RemoteTtsProvider();
            const models = await provider.listModels({
                baseUrl: ttsRemoteUrl,
                apiKey: ttsRemoteApiKey,
                presetId: ttsRemoteProviderPresetId,
                region: ttsRemoteRegion,
                secondaryKey: ttsRemoteSecondaryKey,
            });
            
            if (models.length > 0) {
                setRemoteModels(models);
                setTtsStatus(`Found ${models.length} models.`);
            } else {
                setTtsStatus("No models found on this server.");
            }
        } catch (e: any) {
            console.error('[RemoteTTS] Error fetching models:', e);
            setTtsStatus(`Error: ${e.message || 'Failed to fetch models'}`);
        } finally {
            setFetchingModels(false);
        }
    };

    const handlePreviewVoice = async () => {
        // Safari/iOS require the AudioContext to be resumed from the original
        // user gesture before the async model load + inference chain begins.
        const unlockPromise = unlockAudio();
        setVoiceAction('previewing');
        setTtsStatus('Preparing preview...');
        try {
            await unlockPromise;
            const [{ TTSService }, { getVoiceProfile }] = await Promise.all([
                import('../../../services/pocketTtsService'),
                import('../../../services/voiceProfileStore'),
            ]);

            const service = new TTSService({ engine: customTTSEngine });
            
            const options: any = {};
            if (customTTSVoiceId) {
                options.voiceId = customTTSVoiceId;
            }

            // Handle custom voice profile (recorded voice)
            if (customTTSVoiceProfileId) {
                const profile = await getVoiceProfile(customTTSVoiceProfileId);
                if (profile && profile.embedding) {
                    options.speakerEmbedding = profile.embedding;
                }
            }

            if (customTTSEngine === 'remote') {
                options.baseUrl = ttsRemoteUrl;
                options.model = ttsRemoteModel;
                options.apiKey = ttsRemoteApiKey;
                options.presetId = ttsRemoteProviderPresetId;
                options.region = ttsRemoteRegion;
                options.secondaryKey = ttsRemoteSecondaryKey;
            }
            
            await service.speak(PREVIEW_TEXT, options);
            setTtsStatus(null);
        } catch (error) {
            setTtsStatus((error as Error).message || 'Preview failed.');
        } finally {
            setVoiceAction(null);
        }
    };

    const handleDeleteVoiceProfile = async (id: string) => {
        try {
            const { deleteVoiceProfile } = await import('../../../services/voiceProfileStore');
            await deleteVoiceProfile(id);
            if (customTTSVoiceProfileId === id) {
                setCustomTTSVoiceProfileId('');
            }
            await refreshClonedVoices();
            setTtsStatus('Voice profile deleted.');
        } catch (error) {
            setTtsStatus((error as Error).message || 'Failed to delete voice profile.');
        } finally {
            setConfirmingDeleteId(null);
        }
    };

    // Auto-prefetch Pocket TTS models in the background as soon as the user
    // has Pocket TTS selected. Models are bundled in the repo so the first hit
    // lands in the browser + SW cache; every subsequent load is instant.
    // No button, no manual step -- just invisible priming.
    useEffect(() => {
        if (customTTSEngine !== 'pocket-tts') return;
        if (isModelsReady) return;
        if (shouldAvoidPocketWarmup) {
            setIsModelsReady(false);
            setIsManagingModels(false);
            return;
        }

        let cancelled = false;
        setIsManagingModels(true);
        (async () => {
            try {
                const { TTSService } = await import('../../../services/pocketTtsService');
                const service = new TTSService({ engine: 'pocket-tts' });
                await service.prepareOfflineModels();
                if (cancelled) return;
                setIsModelsReady(true);
                setTtsStatus(null);
            } catch (error) {
                if (cancelled) return;
                setIsModelsReady(false);
                setTtsStatus((error as Error).message || 'Pocket TTS models could not be prepared.');
            } finally {
                if (!cancelled) setIsManagingModels(false);
            }
        })();

        return () => { cancelled = true; };
    }, [customTTSEngine, shouldAvoidPocketWarmup, isModelsReady]);

    useEffect(() => {
        if (customTTSEngine !== 'tiny-tts') {
            tinyPrepareAttemptRef.current = false;
            return;
        }
        if (isTinyReady || tinyPrepareAttemptRef.current) return;

        let cancelled = false;
        tinyPrepareAttemptRef.current = true;
        setIsTinyPreparing(true);
        setTtsStatus('Preparing TinyTTS local voice...');
        (async () => {
            try {
                const { TTSService } = await import('../../../services/pocketTtsService');
                const service = new TTSService({ engine: 'tiny-tts' });
                await service.prepareOfflineModels();
                if (cancelled) return;
                setIsTinyReady(true);
                setTtsStatus(null);
            } catch (error) {
                if (cancelled) return;
                setIsTinyReady(false);
                setTtsStatus((error as Error).message || 'TinyTTS could not be prepared.');
            } finally {
                if (!cancelled) setIsTinyPreparing(false);
            }
        })();

        return () => { cancelled = true; };
    }, [customTTSEngine, isTinyReady]);

    useEffect(() => {
        if (customTTSEngine !== 'piper-tts') {
            piperPrepareAttemptRef.current = false;
            piperPreparedVoiceRef.current = null;
            return;
        }
        const selectedVoiceId = customTTSVoiceId || '';
        if (isPiperReady && piperPreparedVoiceRef.current === selectedVoiceId) return;
        if (piperPrepareAttemptRef.current && piperPreparedVoiceRef.current === selectedVoiceId) return;

        let cancelled = false;
        piperPrepareAttemptRef.current = true;
        piperPreparedVoiceRef.current = selectedVoiceId;
        setIsPiperPreparing(true);
        setTtsStatus('Preparing Piper local voice...');
        (async () => {
            try {
                const { TTSService } = await import('../../../services/pocketTtsService');
                const service = new TTSService({ engine: 'piper-tts' });
                await service.prepareOfflineModels({ voiceId: selectedVoiceId });
                if (cancelled) return;
                setIsPiperReady(true);
                setTtsStatus(null);
            } catch (error) {
                if (cancelled) return;
                setIsPiperReady(false);
                setTtsStatus((error as Error).message || 'Piper could not be prepared.');
            } finally {
                if (!cancelled) setIsPiperPreparing(false);
            }
        })();

        return () => { cancelled = true; };
    }, [customTTSEngine, customTTSVoiceId, isPiperReady]);


    return (
        <SettingsSection title="Voice & AI" icon={<Brain size={18} className="text-indigo-500" />} defaultOpen={true}>
            <div className="space-y-3">
                <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Mic size={14} className="text-emerald-500" /> Voice Backend</label>
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 sm:grid-cols-5">
                        <button onClick={() => setVoiceBackend('liveapi')} className={`rounded-md px-2 py-1.5 text-[10px] font-bold transition-all ${voiceBackend === 'liveapi' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            Gemini Live
                        </button>
                        <button onClick={() => setVoiceBackend('nova_sonic')} className={`rounded-md px-2 py-1.5 text-[10px] font-bold transition-all ${voiceBackend === 'nova_sonic' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            Nova Sonic
                        </button>
                        <button onClick={() => setVoiceBackend('offline')} className={`rounded-md px-2 py-1.5 text-[10px] font-bold transition-all ${voiceBackend === 'offline' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            Offline
                        </button>
                        <button onClick={() => { if (!haMcpEnabled) { setHaMcpEnabled(true); } setVoiceBackend('ha_voice_pipeline'); }} className={`rounded-md px-2 py-1.5 text-[10px] font-bold transition-all ${voiceBackend === 'ha_voice_pipeline' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            HA Voice
                        </button>
                        <button onClick={() => setVoiceBackend('custom_llm')} className={`rounded-md px-2 py-1.5 text-[10px] font-bold transition-all ${voiceBackend === 'custom_llm' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            Text LLM
                        </button>
                    </div>
                    <p className="px-1 text-[10px] italic text-slate-400">
                        {voiceBackend === 'liveapi' && 'Real-time AI conversation via Gemini Live API.'}
                        {voiceBackend === 'nova_sonic' && 'Real-time speech-to-speech via Amazon Nova Sonic.'}
                        {voiceBackend === 'offline' && 'Browser speech recognition -- no cloud AI.'}
                        {voiceBackend === 'ha_voice_pipeline' && 'Voice pipeline through Home Assistant (requires HA connection).'}
                        {voiceBackend === 'custom_llm' && 'Typed tool-enabled backend with one-shot camera vision and local TTS playback.'}
                    </p>
                    {voiceBackend === 'liveapi' && (
                        <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                            <SecretField
                                label="Gemini API Key"
                                icon={<img src="/assets/icons/gemini-brand.png" alt="Gemini" className="h-3.5 w-3.5 object-contain" />}
                                placeholder="Enter Gemini API Key..."
                                value={localApiKey}
                                onChange={setLocalApiKey}
                                show={showGeminiApiKey}
                                onToggleShow={() => setShowGeminiApiKey(v => !v)}
                                hint={<>Powers Gemini Live voice conversations. Get one at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Google AI Studio</a>.</>}
                            />
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Brain size={14} className="text-indigo-500" /> Gemini Model</label>
                                <select className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none" value={currentModel} onChange={(e) => { setGeminiLiveModel(e.target.value); setCurrentModel(e.target.value); }}>
                                    {GEMINI_LIVE_MODELS.map((m) => (<option key={m.id} value={m.id}>{m.name} -- {m.description}</option>))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><AudioWaveform size={14} className="text-rose-500" /> Gemini Voice</label>
                                <select
                                    className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none"
                                    value={liveApiVoiceId}
                                    onChange={(event) => setLiveApiVoiceId(event.target.value)}
                                >
                                    {GEMINI_LIVE_VOICES.map((voice) => (
                                        <option key={voice.id} value={voice.id}>
                                            {voice.name} -- {voice.style}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="pt-2">
                                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5"><Sparkles size={14} className="text-indigo-500" /> AI Personality</label>
                                <PersonalitySelector />
                            </div>
                        </div>
                    )}
                    {voiceBackend === 'nova_sonic' && (
                        <div className="space-y-3 rounded-xl border border-orange-100 bg-orange-50/40 p-3">
                            <SecretField
                                label="Nova Sonic API Key"
                                icon={<img src="/assets/icons/nova-brand.png" alt="Nova" className="h-3.5 w-3.5 object-contain" />}
                                placeholder="Enter Nova API Key..."
                                value={localNovaApiKey}
                                onChange={setLocalNovaApiKey}
                                show={showNovaApiKey}
                                onToggleShow={() => setShowNovaApiKey(v => !v)}
                                hint={<>Powers Nova Sonic voice. Get one at <a href="https://nova.amazon.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Amazon Nova</a>.</>}
                            />
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><AudioWaveform size={14} className="text-orange-500" /> Nova Voice</label>
                                <select className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none" value={currentNovaVoice} onChange={(e) => { setNovaVoice(e.target.value); setCurrentNovaVoice(e.target.value); }}>
                                    {NOVA_VOICES.map((v) => (<option key={v.id} value={v.id}>{v.name} -- {v.style}</option>))}
                                </select>
                            </div>
                            <div className="pt-2">
                                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5"><Sparkles size={14} className="text-indigo-500" /> AI Personality</label>
                                <PersonalitySelector />
                            </div>
                        </div>
                    )}
                    {voiceBackend === 'ha_voice_pipeline' && (
                        <div className="space-y-1.5 pt-1">
                            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Server size={14} className="text-teal-500" /> HA Pipeline</label>
                            <div className="flex gap-2">
                                <select
                                    className="flex-1 cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 outline-none"
                                    value={haVoicePipelineId}
                                    onChange={(e) => setHaVoicePipelineId(e.target.value)}
                                >
                                    <option value="">Default Pipeline</option>
                                    {haPipelines.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={async () => {
                                        setPipelinesLoading(true);
                                        try {
                                            const pipelines = await fetchHaPipelines();
                                            setHaPipelines(pipelines);
                                        } catch (e) {
                                            console.warn('[Settings] Failed to fetch pipelines:', e);
                                        } finally {
                                            setPipelinesLoading(false);
                                        }
                                    }}
                                    disabled={pipelinesLoading}
                                    className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-600 transition-all hover:bg-slate-100 active:scale-95 disabled:opacity-50"
                                >
                                    {pipelinesLoading ? '...' : 'Fetch'}
                                </button>
                            </div>
                            <p className="px-1 text-[9px] italic text-slate-400">Select which HA voice assistant to use. Click Fetch to load available pipelines.</p>
                        </div>
                    )}
                    {voiceBackend === 'custom_llm' && (
                        <div className="space-y-3 pt-1">
                            <div className="space-y-3 rounded-xl border border-fuchsia-100 bg-fuchsia-50/35 p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        <Brain size={14} className="text-fuchsia-500" />
                                        Text LLM
                                    </label>
                                    <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase tracking-wider text-fuchsia-600 shadow-sm">
                                        {llmProviderBadgeLabel}
                                    </span>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Provider</label>
                                    <select
                                        value={textLLMProviderValue}
                                        onChange={(event) => handleTextLLMProviderChange(event.target.value as TextLLMProviderOptionId)}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-fuchsia-300"
                                    >
                                        {TEXT_LLM_PROVIDER_OPTIONS.map((provider) => (
                                            <option key={provider.id} value={provider.id}>
                                                {provider.label}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="px-1 text-[9px] italic text-slate-400">{textLLMProviderOption.description}</p>
                                </div>

                                {localCustomLLMProviderType !== 'gemini' && (
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            {localCustomLLMProviderType === 'openai' && !showOpenAIBaseUrlInput ? 'Endpoint' : 'Base URL'}
                                        </label>
                                        {localCustomLLMProviderType === 'openai' && !openAIBaseUrlEditable ? (
                                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
                                                {toolLlmBaseUrl}
                                            </div>
                                        ) : (
                                            <input
                                                type="text"
                                                placeholder={localCustomLLMProviderType === 'openai' ? openAIBaseUrlPlaceholder : 'http://localhost:11434'}
                                                value={toolLlmBaseUrl}
                                                onChange={(event) => setToolLlmBaseUrl(event.target.value)}
                                                onBlur={(event) => {
                                                    if (localCustomLLMProviderType === 'openai') {
                                                        void loadOpenAIProviderApiKey(localOpenAIProviderPresetId, localOpenAIModel, event.currentTarget.value);
                                                    }
                                                }}
                                                onKeyDown={(event) => event.stopPropagation()}
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-300 focus:border-fuchsia-300 focus:outline-none"
                                            />
                                        )}
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            {localCustomLLMProviderType === 'gemini' ? 'Gemini Model' : localCustomLLMProviderType === 'openai' ? openAIModelLabel : 'Model'}
                                        </label>
                                        {localCustomLLMProviderType !== 'gemini' && (
                                            <button
                                                onClick={() => void handleRefreshLlmModels()}
                                                disabled={fetchingLlmModels || !toolLlmBaseUrl}
                                                className="flex items-center gap-1 text-[9px] font-bold text-fuchsia-500 transition-colors hover:text-fuchsia-700 disabled:opacity-50"
                                            >
                                                <RefreshCw size={10} className={fetchingLlmModels ? 'animate-spin' : ''} />
                                                {fetchingLlmModels ? 'Fetching...' : 'Refresh Models'}
                                            </button>
                                        )}
                                    </div>
                                    {llmModelOptions.length > 0 ? (
                                        <div className="space-y-2">
                                            <select
                                                value={llmModelSelectValue}
                                                onChange={(event) => {
                                                    if (event.target.value === CUSTOM_LLM_MODEL_SELECT_VALUE) {
                                                        setIsCustomLlmModelInput(true);
                                                        if (llmModelOptions.includes(toolLlmModel)) {
                                                            setToolLlmModel('');
                                                            if (localCustomLLMProviderType === 'openai') {
                                                                void loadOpenAIProviderApiKey(localOpenAIProviderPresetId, '', localOpenAIUrl);
                                                            }
                                                        }
                                                        return;
                                                    }
                                                    const nextModel = event.target.value;
                                                    setIsCustomLlmModelInput(false);
                                                    setToolLlmModel(nextModel);
                                                    if (localCustomLLMProviderType === 'openai') {
                                                        void loadOpenAIProviderApiKey(localOpenAIProviderPresetId, nextModel, localOpenAIUrl);
                                                    }
                                                }}
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-fuchsia-300"
                                            >
                                                {llmModelOptions.map((model) => (
                                                    <option key={model} value={model}>{model}</option>
                                                ))}
                                                <option value={CUSTOM_LLM_MODEL_SELECT_VALUE}>Custom model ID...</option>
                                            </select>
                                            {llmModelSelectValue === CUSTOM_LLM_MODEL_SELECT_VALUE && (
                                                <input
                                                    type="text"
                                                    placeholder={localCustomLLMProviderType === 'gemini' ? 'gemini-2.5-flash' : localCustomLLMProviderType === 'openai' ? 'provider/model-id' : 'llama3'}
                                                    value={toolLlmModel}
                                                    onChange={(event) => setToolLlmModel(event.target.value)}
                                                    onBlur={(event) => {
                                                        if (localCustomLLMProviderType === 'openai') {
                                                            void loadOpenAIProviderApiKey(localOpenAIProviderPresetId, event.currentTarget.value, localOpenAIUrl);
                                                        }
                                                    }}
                                                    onKeyDown={(event) => event.stopPropagation()}
                                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-300 focus:border-fuchsia-300 focus:outline-none"
                                                />
                                            )}
                                        </div>
                                    ) : (
                                        <input
                                            type="text"
                                            placeholder={localCustomLLMProviderType === 'gemini' ? 'gemini-2.5-flash' : localCustomLLMProviderType === 'openai' ? 'gpt-4o' : 'llama3'}
                                            value={toolLlmModel}
                                            onChange={(event) => setToolLlmModel(event.target.value)}
                                            onBlur={(event) => {
                                                if (localCustomLLMProviderType === 'openai') {
                                                    void loadOpenAIProviderApiKey(localOpenAIProviderPresetId, event.currentTarget.value, localOpenAIUrl);
                                                }
                                            }}
                                            onKeyDown={(event) => event.stopPropagation()}
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-300 focus:border-fuchsia-300 focus:outline-none"
                                        />
                                    )}
                                    {llmFetchError && <p className="text-[9px] italic text-red-500">{llmFetchError}</p>}
                                </div>

                                {localCustomLLMProviderType === 'gemini' && (
                                    <SecretField
                                        label="Gemini Text API Key"
                                        icon={<Brain size={14} className="text-fuchsia-500" />}
                                        placeholder="Enter Gemini Text API Key..."
                                        value={localGeminiTextApiKey}
                                        onChange={setLocalGeminiTextApiKey}
                                        show={showGeminiTextApiKey}
                                        onToggleShow={() => setShowGeminiTextApiKey(v => !v)}
                                        hint="Stored separately from the Gemini Live key."
                                    />
                                )}

                                {localCustomLLMProviderType === 'openai' && (
                                    <SecretField
                                        label={openAISecretLabel}
                                        icon={<Brain size={14} className="text-fuchsia-500" />}
                                        placeholder={openAIProviderPreset.apiKeyPlaceholder}
                                        value={localOpenAIApiKey}
                                        onChange={setLocalOpenAIApiKey}
                                        show={showOpenAIApiKey}
                                        onToggleShow={() => setShowOpenAIApiKey(v => !v)}
                                        hint={`Saved separately for ${openAIProviderPreset.label} and ${localOpenAIModel || 'this model'}.`}
                                    />
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Sparkles size={14} className="text-fuchsia-500" /> TTS Engine</label>
                                <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-100 p-1 sm:grid-cols-7">
                                    {(['auto', 'tiny-tts', 'piper-tts', 'browser', 'kitten-tts', 'pocket-tts', 'remote'] as const).map((engine) => (
                                        <button
                                            key={engine}
                                            onClick={() => handleTtsEngineChange(engine)}
                                            className={`rounded-md px-1.5 py-1.5 text-[10px] font-bold transition-all ${customTTSEngine === engine ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            {engine === 'kitten-tts' ? 'Kitten' : engine === 'tiny-tts' ? 'Tiny' : engine === 'piper-tts' ? 'Piper' : engine === 'pocket-tts' ? 'Pocket' : engine === 'remote' ? 'Remote' : engine.charAt(0).toUpperCase() + engine.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {customTTSEngine === 'tiny-tts' && (
                                <div className="space-y-1.5 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
                                    <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-700">
                                        <Zap size={14} className="text-sky-500" /> TinyTTS Local Voice
                                    </label>
                                    <p className="text-[10px] leading-relaxed text-sky-800/80">
                                        Small bundled English ONNX voice with local CMU/G2P pronunciation. Good default for mobile/Safari and avoids Pocket's large memory footprint.
                                    </p>
                                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2">
                                        {isTinyPreparing ? (
                                            <>
                                                <Loader2 size={12} className="animate-spin text-sky-600" />
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700">Preparing TinyTTS...</span>
                                            </>
                                        ) : isTinyReady ? (
                                            <>
                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">TinyTTS ready</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Prepares on selection</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {customTTSEngine === 'piper-tts' && (
                                <div className="space-y-1.5 rounded-xl border border-cyan-100 bg-cyan-50/60 p-3">
                                    <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-700">
                                        <AudioWaveform size={14} className="text-cyan-500" /> Piper Local Voice
                                    </label>
                                    <p className="text-[10px] leading-relaxed text-cyan-800/80">
                                        Offline Piper TTS with bundled US and UK English ONNX voices plus local phonemizer WASM. Pick low voices for small devices or high voices for richer desktop playback.
                                    </p>
                                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2">
                                        {isPiperPreparing ? (
                                            <>
                                                <Loader2 size={12} className="animate-spin text-cyan-600" />
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">Preparing Piper...</span>
                                            </>
                                        ) : isPiperReady ? (
                                            <>
                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Piper ready</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Prepares on selection</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {customTTSEngine === 'kitten-tts' && (
                                <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                                    <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        <Sparkles size={14} className="text-fuchsia-500" /> Kitten Model
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {([
                                            { id: 'nano', label: 'Nano', sub: '15M, 56 MB', tag: 'Phone / Pi' },
                                            { id: 'micro', label: 'Micro', sub: '40M, 41 MB', tag: 'Laptop' },
                                            { id: 'mini', label: 'Mini', sub: '80M, 78 MB', tag: 'Desktop' },
                                        ] as const).map((m) => (
                                            <button
                                                key={m.id}
                                                onClick={() => setKittenModelId(m.id)}
                                                className={`rounded-lg px-2 py-2 text-left transition-all ${
                                                    kittenModelId === m.id
                                                        ? 'bg-white shadow-sm ring-1 ring-fuchsia-200'
                                                        : 'hover:bg-white/60'
                                                }`}
                                            >
                                                <div className={`text-[11px] font-bold ${kittenModelId === m.id ? 'text-fuchsia-600' : 'text-slate-600'}`}>{m.label}</div>
                                                <div className="text-[9px] text-slate-500">{m.sub}</div>
                                                <div className="text-[9px] text-slate-400">{m.tag}</div>
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[9px] italic text-slate-400">
                                        All three Kitten models run in-browser via ONNX. Start with Nano for phones; pick Mini for best quality on desktop.
                                    </p>
                                </div>
                            )}

                            {customTTSEngine === 'remote' && (() => {
                                const remoteTtsPreset = getRemoteTtsProviderPreset(ttsRemoteProviderPresetId);
                                const showBaseUrlField = remoteTtsPreset.showBaseUrlInput === true;
                                const hasSecondaryKey = Boolean(remoteTtsPreset.secondaryKeyLabel);
                                const hasRegion = Boolean(remoteTtsPreset.regionLabel);
                                const effectiveBaseUrl = ttsRemoteUrl || remoteTtsPreset.baseUrl || '';
                                const fetchModelsDisabled =
                                    fetchingModels ||
                                    (ttsRemoteProviderPresetId === 'custom' && !effectiveBaseUrl);
                                const fetchVoicesDisabled =
                                    ttsLoading ||
                                    (ttsRemoteProviderPresetId === 'custom' && !effectiveBaseUrl);
                                const modelOptionsList = Array.from(new Set([
                                    ...remoteTtsPreset.modelOptions,
                                    ...remoteModels,
                                ].filter(Boolean)));
                                return (
                                <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                                    <div className="space-y-1.5">
                                        <label className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                            <Server size={12} className="text-fuchsia-500" /> Provider
                                        </label>
                                        <select
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-fuchsia-300"
                                            value={ttsRemoteProviderPresetId}
                                            onChange={(e) => {
                                                const nextId = e.target.value as RemoteTtsProviderPresetId;
                                                const nextPreset = getRemoteTtsProviderPreset(nextId);
                                                setTtsRemoteProviderPresetId(nextId);
                                                setRemoteModels([]);
                                                setTtsVoices([]);
                                                setTtsStatus(null);
                                                // Seed provider defaults so the user sees a sensible model/voice.
                                                if (nextPreset.defaultModel) setTtsRemoteModel(nextPreset.defaultModel);
                                                if (nextPreset.defaultVoiceId) setCustomTTSVoiceId(nextPreset.defaultVoiceId);
                                                if (nextPreset.showBaseUrlInput !== true && nextPreset.baseUrl) {
                                                    setTtsRemoteUrl(nextPreset.baseUrl);
                                                }
                                                if (nextPreset.defaultRegion) setTtsRemoteRegion(nextPreset.defaultRegion);
                                            }}
                                        >
                                            {REMOTE_TTS_PROVIDER_PRESETS.map((preset) => (
                                                <option key={preset.id} value={preset.id}>
                                                    {preset.label}{preset.advanced ? ' (Advanced)' : ''}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="px-1 text-[10px] italic text-slate-400">{remoteTtsPreset.description}</p>
                                    </div>

                                    {showBaseUrlField && (
                                        <div className="space-y-1.5">
                                            <label className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">Server URL</label>
                                            <input
                                                type="text"
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-fuchsia-300"
                                                placeholder={remoteTtsPreset.baseUrlPlaceholder || 'https://your-tts-server.com/v1'}
                                                value={ttsRemoteUrl}
                                                onChange={(e) => setTtsRemoteUrl(e.target.value)}
                                            />
                                        </div>
                                    )}

                                    {hasRegion && (
                                        <div className="space-y-1.5">
                                            <label className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">{remoteTtsPreset.regionLabel}</label>
                                            {remoteTtsPreset.regionOptions && remoteTtsPreset.regionOptions.length > 0 ? (
                                                <select
                                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-fuchsia-300"
                                                    value={ttsRemoteRegion || remoteTtsPreset.defaultRegion || ''}
                                                    onChange={(e) => setTtsRemoteRegion(e.target.value)}
                                                >
                                                    {remoteTtsPreset.regionOptions.map((region) => (
                                                        <option key={region} value={region}>{region}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    type="text"
                                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-fuchsia-300"
                                                    placeholder={remoteTtsPreset.regionPlaceholder}
                                                    value={ttsRemoteRegion}
                                                    onChange={(e) => setTtsRemoteRegion(e.target.value)}
                                                />
                                            )}
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">{remoteTtsPreset.modelLabel || 'Model ID'}</label>
                                            {(ttsRemoteProviderPresetId === 'openai' || ttsRemoteProviderPresetId === 'custom') && (
                                                <button
                                                    onClick={handleFetchRemoteModels}
                                                    disabled={fetchModelsDisabled}
                                                    className="text-[9px] font-bold text-fuchsia-500 hover:text-fuchsia-700 transition-colors disabled:opacity-50"
                                                >
                                                    {fetchingModels ? '...' : 'Fetch Models'}
                                                </button>
                                            )}
                                        </div>
                                        <div className="relative">
                                            {modelOptionsList.length > 0 ? (
                                                <div className="flex gap-2">
                                                    <select
                                                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-fuchsia-300"
                                                        value={modelOptionsList.includes(ttsRemoteModel) ? ttsRemoteModel : ''}
                                                        onChange={(e) => setTtsRemoteModel(e.target.value)}
                                                    >
                                                        <option value="" disabled>Select a model...</option>
                                                        {modelOptionsList.map((m) => (
                                                            <option key={m} value={m}>{m}</option>
                                                        ))}
                                                    </select>
                                                    {remoteModels.length > 0 && (
                                                        <button
                                                            onClick={() => setRemoteModels([])}
                                                            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                                                            title="Back to manual input"
                                                        >
                                                            <RotateCcw size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <input
                                                    type="text"
                                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-fuchsia-300"
                                                    placeholder={remoteTtsPreset.modelPlaceholder || 'tts-1, piper, etc.'}
                                                    value={ttsRemoteModel}
                                                    onChange={(e) => setTtsRemoteModel(e.target.value)}
                                                />
                                            )}
                                        </div>
                                    </div>

                                    <SecretField
                                        label={remoteTtsPreset.apiKeyLabel}
                                        icon={<Sparkles size={14} className="text-fuchsia-500" />}
                                        placeholder={remoteTtsPreset.apiKeyPlaceholder}
                                        value={ttsRemoteApiKey}
                                        onChange={setTtsRemoteApiKey}
                                        show={showRemoteTtsApiKey}
                                        onToggleShow={() => setShowRemoteTtsApiKey((v) => !v)}
                                    />

                                    {hasSecondaryKey && (
                                        <SecretField
                                            label={remoteTtsPreset.secondaryKeyLabel as string}
                                            icon={<Sparkles size={14} className="text-fuchsia-500" />}
                                            placeholder={remoteTtsPreset.secondaryKeyPlaceholder || ''}
                                            value={ttsRemoteSecondaryKey}
                                            onChange={setTtsRemoteSecondaryKey}
                                            show={showRemoteTtsSecondaryKey}
                                            onToggleShow={() => setShowRemoteTtsSecondaryKey((v) => !v)}
                                        />
                                    )}

                                    {remoteTtsPreset.hint && (
                                        <p className="px-1 text-[10px] italic text-slate-400">{remoteTtsPreset.hint}</p>
                                    )}

                                    <button
                                        onClick={handleFetchRemoteVoices}
                                        disabled={fetchVoicesDisabled}
                                        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white border border-fuchsia-200 py-1.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-600 transition-all hover:bg-fuchsia-50 active:scale-95 disabled:opacity-50"
                                    >
                                        {ttsLoading ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                                        Fetch Available Voices
                                    </button>
                                </div>
                                );
                            })()}

                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><AudioWaveform size={14} className="text-fuchsia-500" /> Built-in Voice</label>
                                <select
                                    className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none"
                                    value={customTTSVoiceId}
                                    onChange={(e) => {
                                        setCustomTTSVoiceId(e.target.value);
                                        if (e.target.value) setCustomTTSVoiceProfileId('');
                                    }}
                                    disabled={ttsLoading}
                                >
                                    <option value="">
                                        {ttsLoading
                                            ? 'Loading voices...'
                                            : customTTSEngine === 'auto'
                                                ? 'Default voice (Tiny)'
                                            : customTTSEngine === 'pocket-tts'
                                                ? 'Default voice (Alba)'
                                            : customTTSEngine === 'tiny-tts'
                                                ? 'Default voice (Tiny)'
                                            : customTTSEngine === 'piper-tts'
                                                ? 'Default voice (Lessac medium)'
                                                : customTTSEngine === 'kitten-tts'
                                                    ? 'Default voice (Bella)'
                                                : 'Default voice'}
                                    </option>
                                    {ttsVoices.map((voice) => (
                                        <option key={voice.id} value={voice.id}>{voice.label} -- {voice.source}</option>
                                    ))}
                                </select>
                            </div>

                            {customTTSEngine === 'pocket-tts' && (
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Mic size={14} className="text-fuchsia-500" /> Custom Voice</label>
                                <select
                                    className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none"
                                    value={customTTSVoiceProfileId}
                                    onChange={(e) => {
                                        setCustomTTSVoiceProfileId(e.target.value);
                                        if (e.target.value) setCustomTTSVoiceId('');
                                    }}
                                >
                                    <option value="">None selected</option>
                                    {clonedVoices.map((voice) => (
                                        <option key={voice.id} value={voice.id}>{voice.name}</option>
                                    ))}
                                </select>
                                
                                {clonedVoices.length > 0 && (
                                    <div className="mt-2 space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/50 p-2">
                                        <p className="px-1 text-[9px] font-bold uppercase text-slate-400 tracking-tight">Manage Saved Voices</p>
                                        <div className="space-y-1">
                                            {clonedVoices.map((voice) => (
                                                <div key={voice.id} className="flex items-center justify-between rounded-lg bg-white px-2 py-1.5 border border-slate-100">
                                                    <span className="text-[11px] font-medium text-slate-600 truncate">{voice.name}</span>
                                                    <div className="flex items-center gap-2">
                                                        {confirmingDeleteId === voice.id ? (
                                                            <>
                                                                <button 
                                                                    onClick={() => void handleDeleteVoiceProfile(voice.id)}
                                                                    className="text-[9px] font-bold text-red-600 hover:underline"
                                                                >
                                                                    Confirm
                                                                </button>
                                                                <button 
                                                                    onClick={() => setConfirmingDeleteId(null)}
                                                                    className="text-[9px] font-bold text-slate-400 hover:text-slate-600"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button 
                                                                onClick={() => setConfirmingDeleteId(voice.id)}
                                                                className="text-[9px] font-bold text-red-500 hover:text-red-700 transition-colors px-1"
                                                            >
                                                                Delete
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            )}

                            {customTTSEngine === 'pocket-tts' && (
                            <input
                                ref={voiceUploadInputRef}
                                type="file"
                                accept="audio/*,.wav,.mp3,.webm"
                                className="hidden"
                                onChange={async (event) => {
                                    const file = event.target.files?.[0];
                                    if (!file) return;
                                    setUploadVoiceName({ 
                                        blob: file, 
                                        suggested: file.name.replace(/\.[^.]+$/u, '') || `Uploaded Voice ${clonedVoices.length + 1}` 
                                    });
                                    event.target.value = '';
                                }}
                            />
                            )}

                            {customTTSEngine === 'pocket-tts' && uploadVoiceName && (
                                <div className="space-y-2 rounded-xl bg-indigo-50 border border-indigo-100 p-3 animate-in fade-in slide-in-from-top-2">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Name Uploaded Voice</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            autoFocus
                                            value={uploadVoiceName.suggested}
                                            onChange={(e) => setUploadVoiceName({...uploadVoiceName, suggested: e.target.value})}
                                            className="flex-1 rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') void persistVoiceProfileFromBlob(uploadVoiceName.blob, 'upload', uploadVoiceName.suggested).then(() => setUploadVoiceName(null));
                                                if (e.key === 'Escape') setUploadVoiceName(null);
                                            }}
                                        />
                                        <button 
                                            onClick={async () => {
                                                await persistVoiceProfileFromBlob(uploadVoiceName.blob, 'upload', uploadVoiceName.suggested);
                                                setUploadVoiceName(null);
                                            }}
                                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-indigo-700"
                                        >
                                            Save
                                        </button>
                                        <button 
                                            onClick={() => setUploadVoiceName(null)}
                                            className="rounded-lg bg-slate-200 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-300"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className={customTTSEngine === 'pocket-tts' ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-1 gap-2'}>
                                {customTTSEngine === 'pocket-tts' && (
                                    <>
                                        <button
                                            onClick={() => void handleRecordVoice()}
                                            disabled={voiceAction !== null}
                                            className="flex items-center justify-center gap-1.5 rounded-xl bg-fuchsia-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-fuchsia-700 transition-colors hover:bg-fuchsia-100 disabled:opacity-50"
                                        >
                                            {voiceAction === 'recording' ? <Loader2 size={12} className="animate-spin" /> : <Mic size={12} />} Record
                                        </button>
                                        <button
                                            onClick={() => voiceUploadInputRef.current?.click()}
                                            disabled={voiceAction !== null}
                                            className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50"
                                        >
                                            <Upload size={12} /> Upload
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={() => void handlePreviewVoice()}
                                    disabled={voiceAction !== null}
                                    className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                                >
                                    {voiceAction === 'previewing' ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Preview
                                </button>
                            </div>

                            {customTTSEngine === 'pocket-tts' && (
                                <p className="px-1 text-[9px] italic text-slate-400">
                                    Record or upload a short voice sample, store its compact embedding locally, then reuse it for Pocket TTS-compatible playback.
                                    {isSafariBrowser ? ' Safari will skip background Pocket loading and may fall back to the browser voice if memory is tight.' : ''}
                                </p>
                            )}

                            {customTTSEngine === 'pocket-tts' && (
                                <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2">
                                    {isManagingModels ? (
                                        <>
                                            <Loader2 size={12} className="animate-spin text-indigo-500" />
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Preparing models...</span>
                                        </>
                                    ) : isModelsReady ? (
                                        <>
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Pocket TTS ready</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Models will prepare on first use</span>
                                        </>
                                    )}
                                </div>
                            )}

                            {ttsStatus && (
                                <p className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-500">{ttsStatus}</p>
                            )}
                            <div className="pt-2">
                                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5"><Sparkles size={14} className="text-indigo-500" /> AI Personality</label>
                                <PersonalitySelector />
                            </div>
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <SettingsToggle
                        label="Hands-Free"
                        description={`"${selectedWakeWordPhrase}" (High CPU)`}
                        enabled={wakeWordEnabled}
                        onToggle={handleHandsFreeToggle}
                        icon={<Zap size={14} className="text-indigo-500" />}
                    />
                    <SettingsToggle
                        label="Subtitles"
                        description="Live transcripts"
                        enabled={subtitlesEnabled}
                        onToggle={() => setSubtitlesEnabled(!subtitlesEnabled)}
                        color="bg-sky-500"
                        icon={<Languages size={14} className="text-sky-500" />}
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><AudioWaveform size={14} className="text-teal-500" /> Wake Word</label>
                    <select className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none" value={selectedWakeWordId} onChange={(e) => setSelectedWakeWordId(e.target.value)}>
                        {getAvailableWakeWords().map((ww) => (<option key={ww.id} value={ww.id}>{ww.label}</option>))}
                    </select>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowCustomWakeWordUpload(v => !v)}
                            className="text-xs font-bold text-indigo-500 hover:text-indigo-700 transition-colors"
                        >
                            {showCustomWakeWordUpload ? 'Hide Upload' : '+ Add Custom Wake Word'}
                        </button>
                        {customWakeWords.length > 0 && (
                            <span className="text-[10px] text-slate-400">{customWakeWords.length} custom</span>
                        )}
                    </div>
                    {showCustomWakeWordUpload && (
                        <div className="space-y-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-3.5">
                            <p className="text-xs text-slate-600">Upload an OpenWakeWord <code className="text-[11px] bg-slate-200 px-1.5 py-0.5 rounded font-mono">.onnx</code> model file.</p>
                            <input
                                type="file"
                                accept=".onnx"
                                className="w-full text-xs text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-xs file:font-bold file:text-indigo-600 hover:file:bg-indigo-100 file:cursor-pointer"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file || !file.name.endsWith('.onnx')) return;
                                    const baseName = file.name.replace(/\.onnx$/i, '').replace(/[_-]/g, ' ');
                                    const label = baseName.charAt(0).toUpperCase() + baseName.slice(1);
                                    const id = 'custom-' + baseName.toLowerCase().replace(/\s+/g, '-');
                                    const data = await file.arrayBuffer();
                                    await saveCustomWakeWord({ id, label, phrase: label, threshold: 0.5, filename: file.name, data });
                                    await loadCustomWakeWords();
                                    const updated = await listCustomWakeWords();
                                    setCustomWakeWords(updated);
                                    setSelectedWakeWordId(id);
                                    e.target.value = '';
                                }}
                            />
                            {customWakeWords.length > 0 && (
                                <div className="space-y-1.5 pt-1.5">
                                    <p className="text-[10px] font-bold uppercase text-slate-400">Custom Models</p>
                                    {customWakeWords.map((cw) => (
                                        <div key={cw.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 border border-slate-200">
                                            <div className="min-w-0">
                                                <p className="text-xs font-semibold text-slate-700 truncate">{cw.label}</p>
                                                <p className="text-[10px] text-slate-400 truncate">{cw.filename}</p>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    await deleteCustomWakeWord(cw.id);
                                                    revokeCustomWakeWordBlobUrl(cw.id);
                                                    await loadCustomWakeWords();
                                                    const updated = await listCustomWakeWords();
                                                    setCustomWakeWords(updated);
                                                    if (selectedWakeWordId === cw.id) {
                                                        setSelectedWakeWordId('hey-curio');
                                                    }
                                                }}
                                                className="shrink-0 ml-3 text-[10px] font-bold text-red-500 hover:text-red-700"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <Sliders size={14} className="text-indigo-500" /> Audio Tuning
                    </label>
 
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-700">Wake Word Sensitivity</span>
                            <span className="text-[11px] font-mono text-slate-500">
                                {localThreshold.toFixed(2)}
                                {userThreshold === null && <span className="ml-1 text-[9px] italic text-slate-400">(default)</span>}
                            </span>
                        </div>
                        <input
                            type="range"
                            min={0.1}
                            max={0.9}
                            step={0.01}
                            value={localThreshold}
                            onChange={(e) => onThresholdSlide(parseFloat(e.target.value))}
                            className="w-full accent-indigo-500"
                        />
                        <div className="flex justify-between text-[9px] text-slate-400">
                            <span>More triggers</span>
                            <button
                                onClick={() => { setLocalThreshold(catalogDefaultThreshold); setWakeWordThreshold(null); }}
                                className="text-[9px] font-semibold text-indigo-500 hover:text-indigo-700"
                            >
                                Reset to default
                            </button>
                            <span>Stricter</span>
                        </div>
                    </div>
 
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-700">Microphone Gain</span>
                            <span className="text-[11px] font-mono text-slate-500">
                                {localGainDb > 0 ? '+' : ''}{localGainDb.toFixed(0)} dB
                            </span>
                        </div>
                        <input
                            type="range"
                            min={-12}
                            max={24}
                            step={1}
                            value={localGainDb}
                            onChange={(e) => onGainSlide(parseFloat(e.target.value))}
                            className="w-full accent-emerald-500"
                        />
                        <div className="flex justify-between text-[9px] text-slate-400">
                            <span>Quieter</span>
                            <button
                                onClick={() => { setLocalGainDb(0); setMicGainDb(0); }}
                                className="text-[9px] font-semibold text-emerald-500 hover:text-emerald-700"
                            >
                                Unity
                            </button>
                            <span>Louder</span>
                        </div>
                    </div>
                </div>
 
                <div className="flex items-center justify-between gap-4 rounded-xl border border-red-100 bg-red-50/30 p-3 mt-1">
                    <div className="flex flex-col">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-red-700"><RotateCcw size={14} /> Reset Conversation</span>
                        <span className="text-[10px] text-red-400 italic">Clear history and start fresh</span>
                    </div>
                    {confirmingReset ? (
                        <div className="flex gap-2">
                            <button 
                                onClick={() => { resetSession(); setConfirmingReset(false); }} 
                                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition-all active:scale-95"
                            >
                                Confirm
                            </button>
                            <button 
                                onClick={() => setConfirmingReset(false)} 
                                className="rounded-xl bg-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-300 transition-all active:scale-95"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => setConfirmingReset(true)} className="rounded-xl bg-red-100 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-200 transition-all active:scale-95">Reset</button>
                    )}
                </div>
            </div>
            <VoiceRecordingModal 
                isOpen={showVoiceRecordingModal} 
                onClose={() => setShowVoiceRecordingModal(false)}
                onSave={async (blob, name) => {
                    await persistVoiceProfileFromBlob(blob, 'recording', name);
                }}
            />
        </SettingsSection>
    );
};

export default React.memo(VoiceAISection);
