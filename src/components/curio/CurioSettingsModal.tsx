import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { getWakeWordDefinition } from '../../services/wakeWordCatalog';
import { getSecret, SENSITIVE_KEYS } from '../../utils/secretStorage';
import {
    STORAGE_KEY_GEMINI_TEXT_API_KEY,
    getGeminiTextModel,
    setGeminiTextApiKey,
    setGeminiTextModel,
    setNovaApiKey
} from '../../services/ai/config';
import { useLiveApiVoiceId, useSelectedWakeWordId, useSettingsStore, useCustomRobotColor,
    useIdleMode, useDashboardLayout, useDashboardPreferences,
    setIdleMode, setDashboardLayout, setDashboardPreferences,
    useRoutines, setRoutines,
    getTtsRemoteUrl, getTtsRemoteModel,
    getRemoteTtsProviderPresetId, getTtsRemoteRegion, getTtsRemoteSecondaryKeyAsync,
    getTtsRemoteApiKeyAsync,
    getOllamaBaseUrl, getOpenaiBaseUrl, getOllamaModel, getOpenaiModel,
    getOpenAICompatibleProviderPresetId,
    setOllamaBaseUrl, setOpenAIBaseUrl, setOllamaModel, setOpenAIModel, setOpenAIApiKey,
    setOpenAICompatibleProviderPresetId,
    setTtsRemoteUrl, setTtsRemoteModel, setTtsRemoteApiKey,
    setRemoteTtsProviderPresetId, setTtsRemoteRegion, setTtsRemoteSecondaryKey,
    useDesktopFaceScale, setDesktopFaceScale,
    useDesktopTextInputEnabled, setDesktopTextInputEnabled,
    useDesktopSubtitlesEnabled, setDesktopSubtitlesEnabled,
    setHaMcpOAuthTokens
} from '../../utils/settingsStorage';
import { getCurioDesktopRole } from '../../desktop/desktopBridge';
import { requestElectronMediaAccess } from '../../utils/electronMediaAccess';
import type { CustomLocationEntry } from '../../utils/settingsStorage';
import type { OpenAICompatibleProviderPresetId } from '../../services/ai/openAICompatiblePresets';
import type { RemoteTtsProviderPresetId } from '../../services/remoteTtsPresets';
import { DEFAULT_REMOTE_TTS_PROVIDER_PRESET_ID } from '../../services/remoteTtsPresets';
import { useFullscreen } from '../../hooks/useFullscreen';
import { useResolvedSurfaceTheme } from '../../hooks/useCardTheme';
import {
    preloadWakeWordModel,
    releaseWakeWordRuntime,
} from '../../services/wakeWordService';
import { listCustomWakeWords } from '../../services/customWakeWordStore';
import { useHaMcpRuntimeStatus } from '../../utils/haMcpRuntimeStatus';
import type { McpStatus } from './settings/settingsTypes';

// Section components
import AccountsKeysSection from './settings/AccountsKeysSection';
import GeneralSection from './settings/GeneralSection';
import DisplaySection from './settings/DisplaySection';
import VoiceAISection from './settings/VoiceAISection';
import SpeakerProfilesSection from './settings/SpeakerProfilesSection';
import FaceProfilesSection from './settings/FaceProfilesSection';
import RobotSection from './settings/RobotSection';
import LocationsWeatherSection from './settings/LocationsWeatherSection';
import ScreensaverSection from './settings/ScreensaverSection';
import CardsSection from './settings/CardsSection';
import DesktopSection from './settings/DesktopSection';

const LazyHaEntityFilterSection = React.lazy(() => import('./settings/HaEntityFilterSection'));
import DashboardSection from './settings/DashboardSection';
import NotificationsSection from './settings/NotificationsSection';
import RoutinesSection from './settings/RoutinesSection';
import BackupRestoreSection from './settings/BackupRestoreSection';

interface CurioSettingsModalProps {
    open: boolean;
    onClose: () => void;
    onRefreshWeather: () => void;
    subtitlesEnabled: boolean;
    setSubtitlesEnabled: (enabled: boolean) => void;
    unlockAudio: () => Promise<boolean>;
    primeAllPermissions: () => Promise<{ camera: boolean; microphone: boolean }>;
}

const CurioSettingsModalComponent: React.FC<CurioSettingsModalProps> = ({
    open,
    onClose,
    onRefreshWeather,
    subtitlesEnabled,
    setSubtitlesEnabled,
    unlockAudio,
}) => {
    const {
        setApiKey,
        wakeWordEnabled, setWakeWordEnabled,
        userName, setUserName,
        weatherCity, setWeatherCity,
        tempUnit, setTempUnit,
        haMcpUrl, setHaMcpUrl,
        setHaMcpToken,
        haMcpEnabled, setHaMcpEnabled,
        haMcpAuthMode, setHaMcpAuthMode,
        lowPowerMode, setLowPowerMode,
        muteMicWhileAiSpeaking, setMuteMicWhileAiSpeaking,
        voiceBackend, setVoiceBackend,
        haVoicePipelineId, setHaVoicePipelineId,
        customLLMProviderType, setCustomLLMProviderType,
        openAICompatibleProviderPresetId,
        customLLMBaseUrl,
        customLLMModel,
        customTTSEngine, setCustomTTSEngine,
        customTTSVoiceId, setCustomTTSVoiceId,
        customTTSVoiceProfileId, setCustomTTSVoiceProfileId,
        setSelectedWakeWordId, setLiveApiVoiceId,
        responseCardsEnabled, setResponseCardsEnabled,
        transcriptCardsEnabled, setTranscriptCardsEnabled,
        speakerMuted, setSpeakerMuted,
        screensaverEnabled, setScreensaverEnabled,
        screensaverTimeout, setScreensaverTimeout,
        screensaverSource, setScreensaverSource,
        googleAccessToken, setGoogleAccessToken,
        googleTasksAccessToken, setGoogleTasksAccessToken,
        googleCalendarAccessToken, setGoogleCalendarAccessToken,
        setGoogleSelectedAlbumId,
        gmailAccessToken, setGmailAccessToken,
        outlookCalendarAccessToken, setOutlookCalendarAccessToken,
        outlookMailAccessToken, setOutlookMailAccessToken,
        slackAccessToken, setSlackAccessToken,
        faceTrackingEnabled, setFaceTrackingEnabled,
        idleSleepTimeout, setIdleSleepTimeout,
        themeMode, setThemeMode,
        clockWidgetScale, setClockWidgetScale,
        weatherWidgetScale, setWeatherWidgetScale,
        idlePromptScale, setIdlePromptScale,
        robotFaceScale, setRobotFaceScale,
        clockWidgetPosition, setClockWidgetPosition,
        weatherWidgetPosition, setWeatherWidgetPosition,
        showIdlePrompt, setShowIdlePrompt,
        idlePromptPosition, setIdlePromptPosition,
        showClockWidget, setShowClockWidget,
        showWeatherWidget, setShowWeatherWidget,
        showVoiceWaveform, setShowVoiceWaveform,
        connectButtonPosition, setConnectButtonPosition,
        connectButtonScale, setConnectButtonScale,
        googleApiKey: _googleApiKey, setGoogleApiKey,
        homeLocation, setHomeLocation,
        workLocation, setWorkLocation,
        robotColorThemeId, setRobotColorThemeId,
        setCustomRobotColor,
        faceStyleId, setFaceStyleId,
        customLocations,
        appBackgroundStyle, setAppBackgroundStyle,
        appBackgroundColor, setAppBackgroundColor,
        clockShowSeconds, setClockShowSeconds,
        clockUse24Hour, setClockUse24Hour,
        benderSoundsEnabled, setBenderSoundsEnabled,
    } = useSettingsStore();

    const customRobotColor = useCustomRobotColor();
    const idleMode = useIdleMode();
    const dashboardWidgets = useDashboardLayout();
    const dashboardPreferences = useDashboardPreferences();
    const routines = useRoutines();
    const desktopFaceScale = useDesktopFaceScale();
    const desktopTextInputEnabled = useDesktopTextInputEnabled();
    const desktopSubtitlesEnabled = useDesktopSubtitlesEnabled();
    const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
    const resolvedSurfaceTheme = useResolvedSurfaceTheme();
    const liveApiVoiceId = useLiveApiVoiceId();
    const selectedWakeWordId = useSelectedWakeWordId();
    const runtimeHaMcp = useHaMcpRuntimeStatus();

    const selectedWakeWord = useMemo(
        () => getWakeWordDefinition(selectedWakeWordId),
        [selectedWakeWordId]
    );

    // Local state for fields that save on close
    const [localApiKey, setLocalApiKey] = useState('');
    const [localNovaApiKey, setLocalNovaApiKey] = useState('');
    const [localHaUrl, setLocalHaUrl] = useState(haMcpUrl);
    const [localHaToken, setLocalHaToken] = useState('');
    const [localUserName, setLocalUserName] = useState(userName);
    const [localGoogleApiKey, setLocalGoogleApiKey] = useState('');
    const [localCustomLLMProviderType, setLocalCustomLLMProviderTypeState] = useState(customLLMProviderType);
    const [localOpenAIProviderPresetId, setLocalOpenAIProviderPresetId] = useState<OpenAICompatibleProviderPresetId>(openAICompatibleProviderPresetId);
    const [localOllamaUrl, setLocalOllamaUrl] = useState(getOllamaBaseUrl());
    const [localOpenAIUrl, setLocalOpenAIUrl] = useState(getOpenaiBaseUrl());
    const [localOllamaModel, setLocalOllamaModel] = useState(getOllamaModel());
    const [localGeminiModel, setLocalGeminiModel] = useState(getGeminiTextModel());
    const [localGeminiTextApiKey, setLocalGeminiTextApiKey] = useState('');
    const [localOpenAIModel, setLocalOpenAIModel] = useState(getOpenaiModel());
    const [localOpenAIApiKey, setLocalOpenAIApiKey] = useState('');
    const [localHomeLocation, setLocalHomeLocation] = useState(homeLocation);
    const [localWorkLocation, setLocalWorkLocation] = useState(workLocation);
    const [localCustomLocations, setLocalCustomLocations] = useState<CustomLocationEntry[]>(customLocations);
    const [localTtsRemoteUrl, setLocalTtsRemoteUrl] = useState('');
    const [localTtsRemoteModel, setLocalTtsRemoteModel] = useState('');
    const [localTtsRemoteApiKey, setLocalTtsRemoteApiKey] = useState('');
    const [localTtsRemoteProviderPresetId, setLocalTtsRemoteProviderPresetId] = useState<RemoteTtsProviderPresetId>(DEFAULT_REMOTE_TTS_PROVIDER_PRESET_ID);
    const [localTtsRemoteRegion, setLocalTtsRemoteRegion] = useState('');
    const [localTtsRemoteSecondaryKey, setLocalTtsRemoteSecondaryKey] = useState('');
    const [mcpStatus, setMcpStatus] = useState<McpStatus>('idle');
    const [mcpError, setMcpError] = useState<string | null>(null);
    const [haAllEntities, setHaAllEntities] = useState<Array<{ entity_id: string; name: string; domain: string; area?: string; state?: string }>>([]);
    const [customWakeWords, setCustomWakeWords] = useState<Array<{ id: string; label: string; phrase: string; threshold: number; filename: string }>>([]);
    const [minimizedForPreview, setMinimizedForPreview] = useState(false);
    const minimizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Track the decrypted "saved" HA values so we can detect real user edits
    const savedHaUrlRef = useRef(haMcpUrl);
    const savedHaTokenRef = useRef('');
    const hasUnsavedHaConfig = localHaUrl !== savedHaUrlRef.current || localHaToken !== savedHaTokenRef.current;

    // -- Effects --

    // Sync local state when modal opens — decrypt secrets asynchronously
    useEffect(() => {
        if (!open) return;
        let cancelled = false;

        const setIfOpen = <T,>(setter: (value: T) => void, value: T) => {
            if (!cancelled) {
                setter(value);
            }
        };

        getSecret('gemini_live_api_key').then(v => setIfOpen(setLocalApiKey, v || ''));
        getSecret(STORAGE_KEY_GEMINI_TEXT_API_KEY).then(v => setIfOpen(setLocalGeminiTextApiKey, v || ''));
        getSecret('curio_nova_api_key').then(v => setIfOpen(setLocalNovaApiKey, v || ''));
        getSecret('curio_ha_mcp_token').then(v => {
            const decrypted = v || '';
            if (!cancelled) {
                setLocalHaToken(decrypted);
                savedHaTokenRef.current = decrypted;
            }
        });
        getSecret('curio_google_api_key').then(v => setIfOpen(setLocalGoogleApiKey, v || ''));
        setIfOpen(setLocalTtsRemoteUrl, getTtsRemoteUrl());
        setIfOpen(setLocalTtsRemoteModel, getTtsRemoteModel());
        {
            const presetId = getRemoteTtsProviderPresetId();
            setIfOpen(setLocalTtsRemoteProviderPresetId, presetId);
            setIfOpen(setLocalTtsRemoteRegion, getTtsRemoteRegion(presetId));
            void getTtsRemoteApiKeyAsync(presetId).then(v =>
                setIfOpen(setLocalTtsRemoteApiKey, v || ''),
            );
            void getTtsRemoteSecondaryKeyAsync(presetId).then(v =>
                setIfOpen(setLocalTtsRemoteSecondaryKey, v || ''),
            );
        }

        setLocalHaUrl(haMcpUrl);
        savedHaUrlRef.current = haMcpUrl;
        setLocalUserName(userName);
        setLocalCustomLLMProviderTypeState(customLLMProviderType);
        const nextOpenAIProviderPresetId = getOpenAICompatibleProviderPresetId();
        const nextOpenAIUrl = getOpenaiBaseUrl();
        const nextOpenAIModel = getOpenaiModel();
        setLocalOpenAIProviderPresetId(nextOpenAIProviderPresetId);
        setLocalOllamaUrl(getOllamaBaseUrl());
        setLocalOpenAIUrl(nextOpenAIUrl);
        setLocalOllamaModel(getOllamaModel());
        setLocalGeminiModel(getGeminiTextModel());
        setLocalOpenAIModel(nextOpenAIModel);
        setIfOpen(setLocalOpenAIApiKey, '');
        setLocalHomeLocation(homeLocation);
        setLocalWorkLocation(workLocation);
        setLocalCustomLocations(customLocations);
        setMcpStatus(runtimeHaMcp.status);
        setMcpError(runtimeHaMcp.error);
        void listCustomWakeWords()
            .then((wakeWords) => {
                if (!cancelled) {
                    setCustomWakeWords(wakeWords);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setCustomWakeWords([]);
                }
            });
        // Fetch HA entities for the entity filter section
        if (haMcpEnabled) {
            void (async () => {
                try {
                    const { getHaMcpUrl, getHaApiMode, getHaMcpTokenAsync } = await import('../../utils/settingsStorage');
                    const { HomeAssistantMCPClient } = await import('../../services/haMcpService');
                    const token = await getHaMcpTokenAsync();
                    if (!token) return;
                    const client = new HomeAssistantMCPClient(getHaMcpUrl(), token, getHaApiMode());
                    await client.listEntities({ silent: true });
                    const allEnts = client._allEntities.length > 0 ? client._allEntities : client.entityCache;
                    if (!cancelled) {
                        setHaAllEntities(allEnts.map(e => ({
                            entity_id: e.entity_id,
                            name: e.name || e.entity_id,
                            domain: e.domain || e.entity_id.split('.')[0],
                            area: e.area,
                            state: e.state,
                        })));
                    }
                } catch {
                    if (!cancelled) {
                        setHaAllEntities([]);
                    }
                }
            })();
        }

        return () => {
            cancelled = true;
        };
    }, [open, customLLMBaseUrl, customLLMModel, customLLMProviderType, customLocations, haMcpEnabled, haMcpUrl, homeLocation, runtimeHaMcp.error, runtimeHaMcp.status, userName, workLocation]);

    // When the user picks a different Remote TTS provider preset inside the
    // modal, reload the region and the preset-scoped primary/secondary keys
    // so the fields reflect the values saved for that preset rather than
    // leaking credentials from the previously selected provider.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const presetId = localTtsRemoteProviderPresetId;
        setLocalTtsRemoteRegion(getTtsRemoteRegion(presetId));
        // Clear immediately to avoid flashing the previous provider's key
        // while the async secret reads are in flight.
        setLocalTtsRemoteApiKey('');
        setLocalTtsRemoteSecondaryKey('');
        void getTtsRemoteApiKeyAsync(presetId).then((value) => {
            if (!cancelled) setLocalTtsRemoteApiKey(value || '');
        });
        void getTtsRemoteSecondaryKeyAsync(presetId).then((value) => {
            if (!cancelled) setLocalTtsRemoteSecondaryKey(value || '');
        });
        return () => {
            cancelled = true;
        };
    }, [open, localTtsRemoteProviderPresetId]);

    // Listen for animation preview minimize requests
    useEffect(() => {
        if (!open) return;
        const handleMinimize = (e: Event) => {
            const duration = (e as CustomEvent).detail?.duration ?? 3000;
            setMinimizedForPreview(true);
            if (minimizeTimerRef.current) clearTimeout(minimizeTimerRef.current);
            minimizeTimerRef.current = setTimeout(() => setMinimizedForPreview(false), duration);
        };
        window.addEventListener('curio:minimize-settings', handleMinimize);
        return () => {
            window.removeEventListener('curio:minimize-settings', handleMinimize);
            if (minimizeTimerRef.current) clearTimeout(minimizeTimerRef.current);
        };
    }, [open]);

    // Sync HA runtime status
    useEffect(() => {
        if (!open || hasUnsavedHaConfig) return;
        setMcpStatus(runtimeHaMcp.status);
        setMcpError(runtimeHaMcp.error);
    }, [hasUnsavedHaConfig, open, runtimeHaMcp.error, runtimeHaMcp.status]);

    useEffect(() => {
        if (!open || !hasUnsavedHaConfig) return;
        setMcpStatus('idle');
        setMcpError(null);
    }, [hasUnsavedHaConfig, open]);

    // -- Callbacks --

    const checkMcpConnection = useCallback(async (url: string, token: string) => {
        if (!url || (!token && haMcpAuthMode !== 'oauth')) {
            setMcpStatus('idle');
            setMcpError(null);
            return;
        }

        // Detect mixed content: https page fetching http HA instance
        if (window.location.protocol === 'https:' && url.startsWith('http://')) {
            setMcpStatus('error');
            setMcpError(
                'Mixed content blocked: this app is served over HTTPS but your Home Assistant URL uses HTTP. ' +
                'Your browser blocks these requests for security. ' +
                'Either enable HTTPS on your HA instance, or access Curio over HTTP (e.g. via the HA add-on).'
            );
            return;
        }

        setMcpStatus('checking');
        setMcpError(null);
        try {
            const { HomeAssistantMCPClient } = await import('../../services/haMcpService');
            const client = new HomeAssistantMCPClient(url, token);
            const tools = await client.getTools();
            if (tools && tools.length > 0) { setMcpStatus('connected'); setMcpError(null); }
            else { setMcpStatus('error'); setMcpError('No tools returned. Check your configuration.'); }
        } catch (error: any) {
            console.error('[HA MCP] Status check failed:', error);
            setMcpStatus('error');
            setMcpError(error?.message || 'Connection failed');
        }
    }, [haMcpAuthMode]);

    const handleClose = useCallback(() => onClose(), [onClose]);

    const handleSave = useCallback(async () => {
        // Always persist secrets — comparing decrypted local vs encrypted store is unreliable
        await setApiKey(localApiKey);
        await setNovaApiKey(localNovaApiKey);
        await setGoogleApiKey(localGoogleApiKey);
        
        setTtsRemoteUrl(localTtsRemoteUrl);
        setTtsRemoteModel(localTtsRemoteModel);
        await setTtsRemoteApiKey(localTtsRemoteApiKey, localTtsRemoteProviderPresetId);
        setRemoteTtsProviderPresetId(localTtsRemoteProviderPresetId);
        setTtsRemoteRegion(localTtsRemoteRegion, localTtsRemoteProviderPresetId);
        await setTtsRemoteSecondaryKey(localTtsRemoteSecondaryKey, localTtsRemoteProviderPresetId);

        setCustomLLMProviderType(localCustomLLMProviderType);
        setOpenAICompatibleProviderPresetId(localOpenAIProviderPresetId);
        setOllamaBaseUrl(localOllamaUrl);
        setGeminiTextModel(localGeminiModel);
        await setGeminiTextApiKey(localGeminiTextApiKey);
        setOpenAIBaseUrl(localOpenAIUrl);
        setOllamaModel(localOllamaModel);
        setOpenAIModel(localOpenAIModel);
        await setOpenAIApiKey(localOpenAIApiKey, localOpenAIProviderPresetId, localOpenAIModel, localOpenAIUrl);
        if (localHaUrl !== savedHaUrlRef.current) setHaMcpUrl(localHaUrl);
        await setHaMcpToken(localHaToken);
        if (localUserName !== userName) setUserName(localUserName);
        if (localHomeLocation !== homeLocation) setHomeLocation(localHomeLocation);
        if (localWorkLocation !== workLocation) setWorkLocation(localWorkLocation);
        handleClose();
    }, [handleClose, localApiKey, localNovaApiKey, localGoogleApiKey, localCustomLLMProviderType, localOpenAIProviderPresetId, localOllamaUrl, localOpenAIUrl, localOllamaModel, localGeminiModel, localGeminiTextApiKey, localOpenAIModel, localOpenAIApiKey, localHaToken, localHaUrl, setGoogleApiKey, setCustomLLMProviderType, setOllamaBaseUrl, setOpenAIBaseUrl, setOllamaModel, setOpenAIModel, setOpenAIApiKey, localUserName, userName, setUserName, localHomeLocation, homeLocation, setHomeLocation, localWorkLocation, workLocation, setWorkLocation, localTtsRemoteUrl, localTtsRemoteModel, localTtsRemoteApiKey, localTtsRemoteProviderPresetId, localTtsRemoteRegion, localTtsRemoteSecondaryKey]);

    const handleHandsFreeToggle = useCallback(async () => {
        const newState = !wakeWordEnabled;
        setWakeWordEnabled(newState);
        if (!newState) { releaseWakeWordRuntime(); return; }
        try {
            const microphoneReady = await requestElectronMediaAccess('microphone');
            if (!microphoneReady) return;
            if (navigator.mediaDevices?.getUserMedia) {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());
            }
            await unlockAudio();
            await preloadWakeWordModel({ wakeWordId: selectedWakeWord.id });
        } catch (wakeWordError) {
            console.error('[CurioSettingsModal] Failed to prepare wake word audio:', wakeWordError);
        }
    }, [selectedWakeWord.id, setWakeWordEnabled, unlockAudio, wakeWordEnabled]);

    const handleHaOAuth = useCallback(() => {
        if (!localHaUrl) return;

        // Persist the URL before starting OAuth so it survives page reloads
        // (the redirect flow navigates away and back).
        setHaMcpUrl(localHaUrl);

        // Open a popup synchronously from the tap. On iOS standalone/PWA
        // this will be ignored and the redirect flow is used instead.
        const popup = window.open('about:blank', 'ha-oauth');
        if (popup) popup.document.write('<p>Connecting to Home Assistant...</p>');

        void import('../../utils/haAuthUtils').then(async ({ loginToHomeAssistant }) => {
            try {
                const tokenData = await loginToHomeAssistant(localHaUrl, popup);
                if (!tokenData) return; // Redirect flow -- page will reload
                await setHaMcpOAuthTokens(tokenData);
                setHaMcpAuthMode('oauth');
                setHaMcpUrl(localHaUrl);
                setHaMcpEnabled(true);
            } catch (error) {
                console.error('HA OAuth failed:', error);
            }
        });
    }, [localHaUrl, setHaMcpAuthMode, setHaMcpEnabled, setHaMcpUrl]);

    if (!open) return null;

    const settingsTheme = resolvedSurfaceTheme;
    const settingsIsDark = settingsTheme === 'dark';
    const showDesktopSettings =
        typeof window !== 'undefined' &&
        Boolean(window.curioDesktop) &&
        getCurioDesktopRole() === 'app';

    return (
        <div
            data-theme={settingsTheme}
            className={`curio-settings-modal fixed inset-0 z-[100] flex items-center justify-center px-4 transition-all duration-500 ${minimizedForPreview ? 'pointer-events-none opacity-0' : settingsIsDark ? 'bg-black/65 backdrop-blur-[2px]' : 'bg-slate-900/40'}`}
            onClick={minimizedForPreview ? undefined : handleClose}
        >
            <div
                className={`curio-settings-panel flex max-h-[88vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border shadow-2xl transition-colors duration-300 md:max-w-3xl lg:max-w-5xl ${settingsIsDark ? 'border-white/10 bg-slate-950 text-slate-100 shadow-black/50' : 'border-sky-100 bg-white text-slate-900'}`}
                onClick={(event) => event.stopPropagation()}
                style={{ touchAction: 'pan-y' }}
            >
                <div className={`curio-settings-header flex-shrink-0 px-6 py-4 text-white ${settingsIsDark ? 'bg-[linear-gradient(135deg,#020617_0%,#172554_48%,#0e7490_100%)]' : 'bg-gradient-to-r from-sky-500 to-indigo-600'}`}>
                    <h3 className="text-lg font-bold">Curio Settings</h3>
                    <p className="text-xs opacity-90">Customize your AI agent companion</p>
                </div>

                <div
                    className="curio-settings-content flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-5 -webkit-overflow-scrolling-touch"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                >
                    <VoiceAISection
                        unlockAudio={unlockAudio}
                        voiceBackend={voiceBackend} setVoiceBackend={setVoiceBackend}
                        localApiKey={localApiKey} setLocalApiKey={setLocalApiKey}
                        localNovaApiKey={localNovaApiKey} setLocalNovaApiKey={setLocalNovaApiKey}
                        liveApiVoiceId={liveApiVoiceId} setLiveApiVoiceId={setLiveApiVoiceId}
                        localCustomLLMProviderType={localCustomLLMProviderType}
                        setLocalCustomLLMProviderType={setLocalCustomLLMProviderTypeState}
                        localOpenAIProviderPresetId={localOpenAIProviderPresetId}
                        setLocalOpenAIProviderPresetId={setLocalOpenAIProviderPresetId}
                        localOllamaUrl={localOllamaUrl} setLocalOllamaUrl={setLocalOllamaUrl}
                        localOpenAIUrl={localOpenAIUrl} setLocalOpenAIUrl={setLocalOpenAIUrl}
                        localOllamaModel={localOllamaModel} setLocalOllamaModel={setLocalOllamaModel}
                        localGeminiModel={localGeminiModel} setLocalGeminiModel={setLocalGeminiModel}
                        localGeminiTextApiKey={localGeminiTextApiKey} setLocalGeminiTextApiKey={setLocalGeminiTextApiKey}
                        localOpenAIModel={localOpenAIModel} setLocalOpenAIModel={setLocalOpenAIModel}
                        localOpenAIApiKey={localOpenAIApiKey} setLocalOpenAIApiKey={setLocalOpenAIApiKey}
                        haMcpEnabled={haMcpEnabled} setHaMcpEnabled={setHaMcpEnabled}
                        haVoicePipelineId={haVoicePipelineId} setHaVoicePipelineId={setHaVoicePipelineId}
                        customTTSEngine={customTTSEngine} setCustomTTSEngine={setCustomTTSEngine}
                        customTTSVoiceId={customTTSVoiceId} setCustomTTSVoiceId={setCustomTTSVoiceId}
                        customTTSVoiceProfileId={customTTSVoiceProfileId} setCustomTTSVoiceProfileId={setCustomTTSVoiceProfileId}
                        ttsRemoteUrl={localTtsRemoteUrl} setTtsRemoteUrl={setLocalTtsRemoteUrl}
                        ttsRemoteModel={localTtsRemoteModel} setTtsRemoteModel={setLocalTtsRemoteModel}
                        ttsRemoteApiKey={localTtsRemoteApiKey} setTtsRemoteApiKey={setLocalTtsRemoteApiKey}
                        ttsRemoteProviderPresetId={localTtsRemoteProviderPresetId} setTtsRemoteProviderPresetId={setLocalTtsRemoteProviderPresetId}
                        ttsRemoteRegion={localTtsRemoteRegion} setTtsRemoteRegion={setLocalTtsRemoteRegion}
                        ttsRemoteSecondaryKey={localTtsRemoteSecondaryKey} setTtsRemoteSecondaryKey={setLocalTtsRemoteSecondaryKey}
                        wakeWordEnabled={wakeWordEnabled} handleHandsFreeToggle={handleHandsFreeToggle}
                        subtitlesEnabled={subtitlesEnabled} setSubtitlesEnabled={setSubtitlesEnabled}
                        selectedWakeWordId={selectedWakeWordId} setSelectedWakeWordId={setSelectedWakeWordId}
                        selectedWakeWordPhrase={selectedWakeWord.phrase}
                        customWakeWords={customWakeWords} setCustomWakeWords={setCustomWakeWords}
                    />

                    <GeneralSection
                        localUserName={localUserName} setLocalUserName={setLocalUserName}
                        userName={userName} setUserName={setUserName}
                        muteMicWhileAiSpeaking={muteMicWhileAiSpeaking} setMuteMicWhileAiSpeaking={setMuteMicWhileAiSpeaking}
                        speakerMuted={speakerMuted} setSpeakerMuted={setSpeakerMuted}
                        lowPowerMode={lowPowerMode} setLowPowerMode={setLowPowerMode}
                    />

                    <AccountsKeysSection
                        localGoogleApiKey={localGoogleApiKey} setLocalGoogleApiKey={setLocalGoogleApiKey}
                        googleCalendarAccessToken={googleCalendarAccessToken} setGoogleCalendarAccessToken={setGoogleCalendarAccessToken}
                        googleTasksAccessToken={googleTasksAccessToken} setGoogleTasksAccessToken={setGoogleTasksAccessToken}
                        gmailAccessToken={gmailAccessToken} setGmailAccessToken={setGmailAccessToken}
                        outlookCalendarAccessToken={outlookCalendarAccessToken} setOutlookCalendarAccessToken={setOutlookCalendarAccessToken}
                        outlookMailAccessToken={outlookMailAccessToken} setOutlookMailAccessToken={setOutlookMailAccessToken}
                        slackAccessToken={slackAccessToken} setSlackAccessToken={setSlackAccessToken}
                        haMcpEnabled={haMcpEnabled} setHaMcpEnabled={setHaMcpEnabled}
                        haMcpAuthMode={haMcpAuthMode} setHaMcpAuthMode={setHaMcpAuthMode}
                        localHaUrl={localHaUrl} setLocalHaUrl={setLocalHaUrl}
                        localHaToken={localHaToken} setLocalHaToken={setLocalHaToken}
                        mcpStatus={mcpStatus} mcpError={mcpError}
                        checkMcpConnection={checkMcpConnection}
                        handleHaOAuth={handleHaOAuth}
                    />

                    {haMcpEnabled && haAllEntities.length > 0 && (
                        <React.Suspense fallback={null}>
                            <LazyHaEntityFilterSection entities={haAllEntities} />
                        </React.Suspense>
                    )}

                    <DisplaySection
                        themeMode={themeMode} setThemeMode={setThemeMode}
                        isFullscreen={isFullscreen} toggleFullscreen={toggleFullscreen}
                        appBackgroundStyle={appBackgroundStyle} setAppBackgroundStyle={setAppBackgroundStyle}
                        appBackgroundColor={appBackgroundColor} setAppBackgroundColor={setAppBackgroundColor}
                        showClockWidget={showClockWidget} setShowClockWidget={setShowClockWidget}
                        clockWidgetScale={clockWidgetScale} setClockWidgetScale={setClockWidgetScale}
                        clockWidgetPosition={clockWidgetPosition} setClockWidgetPosition={setClockWidgetPosition}
                        showWeatherWidget={showWeatherWidget} setShowWeatherWidget={setShowWeatherWidget}
                        weatherWidgetScale={weatherWidgetScale} setWeatherWidgetScale={setWeatherWidgetScale}
                        weatherWidgetPosition={weatherWidgetPosition} setWeatherWidgetPosition={setWeatherWidgetPosition}
                        showIdlePrompt={showIdlePrompt} setShowIdlePrompt={setShowIdlePrompt}
                        idlePromptScale={idlePromptScale} setIdlePromptScale={setIdlePromptScale}
                        idlePromptPosition={idlePromptPosition} setIdlePromptPosition={setIdlePromptPosition}
                        connectButtonScale={connectButtonScale} setConnectButtonScale={setConnectButtonScale}
                        connectButtonPosition={connectButtonPosition} setConnectButtonPosition={setConnectButtonPosition}
                        clockShowSeconds={clockShowSeconds} setClockShowSeconds={setClockShowSeconds}
                        clockUse24Hour={clockUse24Hour} setClockUse24Hour={setClockUse24Hour}
                        showVoiceWaveform={showVoiceWaveform} setShowVoiceWaveform={setShowVoiceWaveform}
                    />

                    {showDesktopSettings && (
                        <DesktopSection
                            desktopFaceScale={desktopFaceScale}
                            setDesktopFaceScale={setDesktopFaceScale}
                            desktopTextInputEnabled={desktopTextInputEnabled}
                            setDesktopTextInputEnabled={setDesktopTextInputEnabled}
                            desktopSubtitlesEnabled={desktopSubtitlesEnabled}
                            setDesktopSubtitlesEnabled={setDesktopSubtitlesEnabled}
                        />
                    )}

                    <SpeakerProfilesSection />
                    <FaceProfilesSection />

                    <RobotSection
                        faceStyleId={faceStyleId} setFaceStyleId={setFaceStyleId}
                        robotFaceScale={robotFaceScale} setRobotFaceScale={setRobotFaceScale}
                        robotColorThemeId={robotColorThemeId} setRobotColorThemeId={setRobotColorThemeId}
                        customRobotColor={customRobotColor} setCustomRobotColor={setCustomRobotColor}
                        faceTrackingEnabled={faceTrackingEnabled} setFaceTrackingEnabled={setFaceTrackingEnabled}
                        idleSleepTimeout={idleSleepTimeout} setIdleSleepTimeout={setIdleSleepTimeout}
                        benderSoundsEnabled={benderSoundsEnabled} setBenderSoundsEnabled={setBenderSoundsEnabled}
                    />

                    <LocationsWeatherSection
                        open={open}
                        tempUnit={tempUnit} setTempUnit={setTempUnit}
                        weatherCity={weatherCity} setWeatherCity={setWeatherCity}
                        localHomeLocation={localHomeLocation} setLocalHomeLocation={setLocalHomeLocation}
                        homeLocation={homeLocation} setHomeLocation={setHomeLocation}
                        localWorkLocation={localWorkLocation} setLocalWorkLocation={setLocalWorkLocation}
                        workLocation={workLocation} setWorkLocation={setWorkLocation}
                        localCustomLocations={localCustomLocations} setLocalCustomLocations={setLocalCustomLocations}
                        onRefreshWeather={onRefreshWeather}
                    />

                    <ScreensaverSection
                        open={open}
                        screensaverEnabled={screensaverEnabled} setScreensaverEnabled={setScreensaverEnabled}
                        screensaverTimeout={screensaverTimeout} setScreensaverTimeout={setScreensaverTimeout}
                        screensaverSource={screensaverSource} setScreensaverSource={setScreensaverSource}
                        googleAccessToken={googleAccessToken} setGoogleAccessToken={setGoogleAccessToken}
                        setGoogleSelectedAlbumId={setGoogleSelectedAlbumId}
                    />

                    <DashboardSection
                        idleMode={idleMode}
                        setIdleMode={setIdleMode}
                        dashboardWidgets={dashboardWidgets}
                        setDashboardWidgets={setDashboardLayout}
                        dashboardPreferences={dashboardPreferences}
                        setDashboardPreferences={setDashboardPreferences}
                    />

                    <NotificationsSection />

                    <RoutinesSection routines={routines} setRoutines={setRoutines} />

                    <CardsSection
                        responseCardsEnabled={responseCardsEnabled} setResponseCardsEnabled={setResponseCardsEnabled}
                        transcriptCardsEnabled={transcriptCardsEnabled} setTranscriptCardsEnabled={setTranscriptCardsEnabled}
                    />

                    <BackupRestoreSection />
                </div>

                <div className={`curio-settings-footer flex items-center justify-between gap-3 border-t px-4 py-3 sm:px-6 sm:py-3.5 ${settingsIsDark ? 'border-white/10 bg-slate-950/95' : 'bg-slate-50'}`}>
                    <button
                        onClick={() => {
                            if (window.confirm('This will clear all saved tokens, API keys, and cached data. You will need to re-enter them. Continue?')) {
                                for (const key of SENSITIVE_KEYS) localStorage.removeItem(key);
                                localStorage.removeItem('curio_google_access_token');
                                localStorage.removeItem('curio_google_tasks_access_token');
                                localStorage.removeItem('curio_google_calendar_access_token');
                                localStorage.removeItem('curio_google_client_id');
                                localStorage.removeItem('curio_llm_provider_type');
                                localStorage.removeItem('curio_llm_base_url');
                                localStorage.removeItem('curio_llm_model');
                                localStorage.removeItem('curio_tts_engine');
                                localStorage.removeItem('curio_tts_voice_id');
                                localStorage.removeItem('curio_tts_voice_profile_id');
                                localStorage.removeItem('curio_ha_mcp_oauth_state');
                                indexedDB.deleteDatabase('curio-secrets');
                                indexedDB.deleteDatabase('curio-voice-profiles');
                                if ('caches' in window) caches.keys().then(names => names.forEach(name => caches.delete(name)));
                                window.location.reload();
                            }
                        }}
                        title="Clear all saved API keys, tokens, and cached data. The page will reload."
                        aria-label="Reset cache and tokens"
                        className="curio-settings-danger inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-600 transition-all hover:bg-red-100 active:scale-95 sm:px-3 sm:py-2 sm:text-xs"
                    >
                        <Trash2 size={14} />
                        <span className="hidden sm:inline">Reset Cache &amp; Tokens</span>
                        <span className="sm:hidden">Reset</span>
                    </button>
                    <button
                        onClick={handleSave}
                        className="rounded-xl bg-sky-500 px-4 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-sky-600 active:scale-95 sm:px-6 sm:text-sm"
                    >
                        Save &amp; Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export const CurioSettingsModal = React.memo(CurioSettingsModalComponent);

CurioSettingsModal.displayName = 'CurioSettingsModal';
