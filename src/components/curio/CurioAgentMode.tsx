import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    MessageSquare,
} from 'lucide-react';

import { useLiveAPIControls, useLiveAPIStreaming } from '../../contexts/LiveAPIContext';
import { isSafariBrowser } from '../../services/audioContext';
import type { CurioState } from '../../services/emotionDetection';
import { emotionFromText, getSharedVisionStream } from '../../services/emotionDetection';
import { CurioClock } from './CurioClock';

const LazyDashboard = React.lazy(() => import('./Dashboard'));

const LazyCurioSettingsModal = React.lazy(() => import('./CurioSettingsModal').then(m => ({ default: m.CurioSettingsModal })));
import { CurioWeatherWidget } from './CurioWeatherWidget';
import { createGlobalMascotHandler } from '../../utils/appPageCatalog';
import { useLiveApiVoiceId, useSelectedWakeWordId, useFaceStyleId, isBackgroundDark,
    useWakeWordEnabled, useUserName, useWeatherCity, useTempUnit, useLowPowerMode,
    useScreensaverEnabled, useScreensaverTimeout, useIdleSleepTimeout, useFaceTrackingEnabled,
    useThemeMode, setThemeMode, useShowIdlePrompt, useIdlePromptScale, useIdlePromptPosition,
    useShowClockWidget, useShowWeatherWidget, useConnectButtonScale, useConnectButtonPosition,
    useRobotFaceScale, useHomeLocation, useWorkLocation, useCustomLocations,
    useAppBackgroundStyle, useAppBackgroundColor, useVoiceBackend, useSpeakerMuted, setSpeakerMuted,
    getBenderSoundsEnabled, useIdleMode, setIdleMode, useRoutines, useActivePersonalitySettings, useProactiveEnabled,
    useSpeakerIdentificationEnabled, useSpeakerAlwaysOnEnabled, useSpeakerDefaultProfileId,
    useCustomTTSEngine, useCustomTTSVoiceId, useCustomTTSVoiceProfileId,
    useShowVoiceWaveform,
    useFaceRecognitionEnabled, useFacePassiveTrackingEnabled, useFaceDefaultProfileId,
    getDesktopFloatingEnabled, setDesktopFloatingEnabled, useDesktopFloatingEnabled,
    useDesktopFaceScale,
    getEnabledGenericMcpServers,
    KIRO_BG_VALUE, BENDER_BG_VALUE, buildAppBackgroundCss,
} from '../../utils/settingsStorage';
import { getCurioDesktopBridge, getCurioDesktopRole } from '../../desktop/desktopBridge';
import type { DesktopFaceCommand } from '../../desktop/desktopTypes';
import { getWakeWordDefinition } from '../../services/wakeWordCatalog';
import { useAppMode } from '../../hooks/useAppMode';
import { useSpeakerIdentityMonitor } from '../../hooks/useSpeakerIdentityMonitor';
import { useFaceIdentityMonitor } from '../../hooks/useFaceIdentityMonitor';
import { VoiceWaveform } from './VoiceWaveform';
import { getCurioSystemPrompt } from './curioSystemPrompt';
import type { CurioSearchGroundingMode } from './curioSystemPrompt';
import { UpdateNotification } from './UpdateNotification';
import { InsecureContextBanner } from './InsecureContextBanner';
import { useIdleTimer } from '../../hooks/useIdleTimer';
import { useSubtitles } from '../../hooks/useSubtitles';
import { useWeatherLoader } from '../../hooks/useWeatherLoader';
import { useMusicPlayback } from '../../hooks/useMusicPlayback';
import { useIdleStatusPhrase } from '../../hooks/useIdleStatusPhrase';
import { useHaOAuthCallback } from '../../hooks/useHaOAuthCallback';
import { useHaIngressAutoLogin } from '../../hooks/useHaIngressAutoLogin';
import { useGoogleRedirectCallback } from '../../hooks/useGoogleRedirectCallback';
import { MusicMiniPlayer } from './MusicMiniPlayer';
import { getUnifiedWeather } from '../../services/weatherService';
import { getGeminiLiveModel } from '../../services/ai/config';
import type { LLMChatMessage } from '../../services/ai/llmProvider';
import { useRuntimePerformanceProfile } from '../../services/runtimePerformanceProfile';
import type { DashboardRobotFaceStyle } from '../../services/dashboardTypes';
import { useCardManager } from '../../contexts/CardManagerContext';
import type { CardEvent } from '../../services/cardTypes';
import type { OfflineSpeechCallbacks } from '../../services/offlineSpeechService';
import type { HaVoicePipelineCallbacks } from '../../services/haVoicePipelineService';
import { appendSpeakerContextToInstruction } from '../../services/speakerIdentity';
import { identifyResolvedSpeakerFromStream } from '../../services/speakerIdentityRuntime';
import { useSpeakerProfiles } from '../../services/speakerProfileStore';
import { useFaceProfiles } from '../../services/faceProfileStore';
import { applyResolvedSpeakerIdentity, getSpeakerSessionState, useSpeakerSessionState } from '../../services/speakerSessionStore';
import { LIVE_SESSION_MIC_AUDIO_CONSTRAINTS } from '../../services/sessionMicConstraints';
import { getVoiceConnectionToggleAction, getVoiceConnectionUiState } from './voiceConnectionUi';
import type { DictationHandle } from '../../services/webSpeechDictation';
import { speakWithSafetyTimeout } from '../../services/browserSpeechSynthesis';
import { trackDashboardActivityEvent } from '../../services/screenTimePersistence';
import { handleOfflineCardEvent, resolveAndEmitCard } from './curioAgentCardEvents';
import {
    getCurioRuntimeState,
    getEffectiveTranscriptState,
    sanitizeTextForSpokenTranscript,
} from './curioAgentModeUtils';
import { CurioCameraPreview } from './CurioCameraPreview';
import { CurioConnectControls } from './CurioConnectControls';
import { CurioFaceControls } from './CurioFaceControls';
import { CurioFaceRenderer } from './CurioFaceRenderer';
import { CurioStatusStack } from './CurioStatusStack';
import { CurioTextInputBar } from './CurioTextInputBar';
import { CurioTranscriptOverlay } from './CurioTranscriptOverlay';
import {
    useAmbientSpeechDelivery,
    useHomeFacePresence,
    useMediaStreamVideo,
    usePersistentSubtitlesEnabled,
    useProactiveEngineLifecycle,
    useQuickActionTextInput,
    useRoutineSchedulerLifecycle,
    useSessionActiveRef,
} from './useCurioAgentRuntimeEffects';

type CustomLlmSessionCache = {
    key: string;
    messages: LLMChatMessage[];
};

const CUSTOM_LLM_VOICE_IDLE_TIMEOUT_MS = 30_000;
const SUBTITLE_INACTIVE_HIDE_DELAY_MS = 700;

const hasConfiguredSearchMcp = (): boolean =>
    getEnabledGenericMcpServers().some((server) => server.kind === 'search');

const resolveVoiceSearchGroundingMode = (voiceBackend: string): CurioSearchGroundingMode => {
    if (voiceBackend === 'nova_sonic' && hasConfiguredSearchMcp()) {
        return 'external-mcp-search';
    }

    return !getGeminiLiveModel().includes('3.1')
        ? 'native-google-search'
        : 'live-search-proxy';
};

// Lazy-loaded service accessors -- avoids bundling heavy modules eagerly
const loadOfflineSpeech = () => import('../../services/offlineSpeechService');
const loadHaVoicePipeline = () => import('../../services/haVoicePipelineService');
const loadAudioService = () => import('../../services/audioService');
const loadTranscriptAnalyzer = () => import('../../services/transcriptAnalyzer');

interface CurioAgentModeProps { }

const LazyScreensaver = lazy(() =>
    import('./Screensaver').then((module) => ({ default: module.Screensaver }))
);

const LazyCurioWakeWord = lazy(() =>
    import('./CurioWakeWord').then((module) => ({ default: module.CurioWakeWord }))
);

const LazyCardDebugPanel = import.meta.env.DEV
    ? lazy(() => import('./CardDebugPanel'))
    : null;

export const CurioAgentMode: React.FC<CurioAgentModeProps> = () => {
    const {
        isConnected,
        isConnecting,
        connect,
        disconnect,
        unlockAudio,
        primeMicrophonePermission,
        primeAllPermissions,
        updateContext,
        globalNavigate,
        setGlobalNavigate,
        cameraEnabled,
        userFacingCamera,
        canFlipCamera,
        toggleCamera,
        flipCamera,
        isMuted,
        setIsMuted,
        mediaStream,
        audioInputStream,
        error,
        client,
        sendTextTurn: contextSendTextTurn,
        sendSystemNote,
        clearError,
        clearResumptionToken,
    } = useLiveAPIControls();
    const {
        isSpeaking,
        userTranscript,
        modelTranscript,
    } = useLiveAPIStreaming();

    const { setMode } = useAppMode();
    const wakeWordEnabled = useWakeWordEnabled();
    const userName = useUserName();
    const weatherCity = useWeatherCity();
    const tempUnit = useTempUnit();
    const lowPowerMode = useLowPowerMode();
    const screensaverEnabled = useScreensaverEnabled();
    const screensaverTimeout = useScreensaverTimeout();
    const idleSleepTimeout = useIdleSleepTimeout();
    const faceTrackingEnabled = useFaceTrackingEnabled();
    const themeMode = useThemeMode();
    const showIdlePrompt = useShowIdlePrompt();
    const idlePromptScale = useIdlePromptScale();
    const idlePromptPosition = useIdlePromptPosition();
    const showClockWidget = useShowClockWidget();
    const showWeatherWidget = useShowWeatherWidget();
    const showVoiceWaveform = useShowVoiceWaveform();
    const connectButtonScale = useConnectButtonScale();
    const connectButtonPosition = useConnectButtonPosition();
    const robotFaceScale = useRobotFaceScale();
    const desktopFloatingEnabled = useDesktopFloatingEnabled();
    const desktopFaceScale = useDesktopFaceScale();
    const canUseDesktopFloating =
        typeof window !== 'undefined' &&
        Boolean(window.curioDesktop) &&
        getCurioDesktopRole() === 'app';
    const [desktopFloatingActive, setDesktopFloatingActive] = useState(
        () => canUseDesktopFloating && getDesktopFloatingEnabled(),
    );
    const homeLocation = useHomeLocation();
    const workLocation = useWorkLocation();
    const customLocations = useCustomLocations();
    const appBackgroundStyle = useAppBackgroundStyle();
    const appBackgroundColor = useAppBackgroundColor();
    const appBackgroundCss = useMemo(
        () => buildAppBackgroundCss(appBackgroundStyle, appBackgroundColor, themeMode),
        [appBackgroundColor, appBackgroundStyle, themeMode],
    );
    const voiceBackend = useVoiceBackend();
    const customTTSEngine = useCustomTTSEngine();
    const customTTSVoiceId = useCustomTTSVoiceId();
    const customTTSVoiceProfileId = useCustomTTSVoiceProfileId();
    const speakerMuted = useSpeakerMuted();
    const speakerIdentificationEnabled = useSpeakerIdentificationEnabled();
    const speakerAlwaysOnEnabled = useSpeakerAlwaysOnEnabled();
    const defaultSpeakerProfileId = useSpeakerDefaultProfileId();
    const faceRecognitionEnabled = useFaceRecognitionEnabled();
    const facePassiveTrackingEnabled = useFacePassiveTrackingEnabled();
    const defaultFaceProfileId = useFaceDefaultProfileId();
    const speakerProfiles = useSpeakerProfiles();
    const faceProfiles = useFaceProfiles();
    const [offlineActive, setOfflineActive] = useState(false);
    const [haVoiceActive, setHaVoiceActive] = useState(false);
    const [haVoiceConnecting, setHaVoiceConnecting] = useState(false);
    const haVoiceTtsAudioRef = useRef<HTMLAudioElement | null>(null);
    const pendingTextRef = useRef<string | null>(null);
    const faceStyleId = useFaceStyleId();
    const activePersonality = useActivePersonalitySettings();
    const activePersonalityPrompt = activePersonality.prompt;
    const activePersonalitySignature = `${activePersonality.id}:${activePersonality.prompt}`;
    const idleMode = useIdleMode();
    const routines = useRoutines();

    // ── Offline transcript state (for subtitles) ──
    const [offlineUserTranscript, setOfflineUserTranscript] = useState<string | null>(null);
    const [offlineModelTranscript, setOfflineModelTranscript] = useState<string | null>(null);
    const [offlineSpeaking, setOfflineSpeaking] = useState(false);
    // Tracks text-only interaction (user typed without pressing Connect)
    const [textOnlyActive, setTextOnlyActive] = useState(false);
    const [customLlmVoiceActive, setCustomLlmVoiceActiveState] = useState(false);
    const [subtitleTurnKey, setSubtitleTurnKey] = useState(0);
    const speakerMutedRef = useRef(speakerMuted);
    const customLlmSessionRef = useRef<CustomLlmSessionCache | null>(null);
    const customLlmVoiceActiveRef = useRef(false);
    const customLlmVoiceProcessingRef = useRef(false);
    const customLlmVoiceIdleTimerRef = useRef<number | null>(null);
    const customLlmDictationRef = useRef<DictationHandle | null>(null);

    const setCustomLlmVoiceActive = useCallback((active: boolean) => {
        customLlmVoiceActiveRef.current = active;
        setCustomLlmVoiceActiveState(active);
    }, []);

    const noteSubtitleUserTurn = useCallback(() => {
        setSubtitleTurnKey((key) => key + 1);
    }, []);

    const dismissLocalChatTranscript = useCallback(() => {
        setTextOnlyActive(false);
        setOfflineSpeaking(false);
        setOfflineUserTranscript(null);
        setOfflineModelTranscript(null);
    }, []);

    const stopCustomLLMVoiceSession = useCallback(() => {
        customLlmVoiceActiveRef.current = false;
        customLlmVoiceProcessingRef.current = false;
        setCustomLlmVoiceActiveState(false);
        if (customLlmVoiceIdleTimerRef.current !== null) {
            window.clearTimeout(customLlmVoiceIdleTimerRef.current);
            customLlmVoiceIdleTimerRef.current = null;
        }
        if (customLlmDictationRef.current) {
            customLlmDictationRef.current.abort();
            customLlmDictationRef.current = null;
        }
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        dismissLocalChatTranscript();
    }, [dismissLocalChatTranscript]);

    const clearCustomLLMVoiceIdleTimer = useCallback(() => {
        if (customLlmVoiceIdleTimerRef.current !== null) {
            window.clearTimeout(customLlmVoiceIdleTimerRef.current);
            customLlmVoiceIdleTimerRef.current = null;
        }
    }, []);

    const scheduleCustomLLMVoiceIdleDisconnect = useCallback(() => {
        clearCustomLLMVoiceIdleTimer();
        customLlmVoiceIdleTimerRef.current = window.setTimeout(() => {
            customLlmVoiceIdleTimerRef.current = null;
            if (customLlmVoiceActiveRef.current) {
                stopCustomLLMVoiceSession();
            }
        }, CUSTOM_LLM_VOICE_IDLE_TIMEOUT_MS);
    }, [clearCustomLLMVoiceIdleTimer, stopCustomLLMVoiceSession]);

    // ── HA Voice Pipeline cleanup (declared early so effects can reference it) ──
    const stopHaVoiceSession = useCallback(() => {
        void loadHaVoicePipeline().then(m => { m.stopListening(); m.disconnectHaVoicePipeline(); });
        if (haVoiceTtsAudioRef.current) {
            haVoiceTtsAudioRef.current.pause();
            haVoiceTtsAudioRef.current.removeAttribute('src');
            haVoiceTtsAudioRef.current = null;
        }
        setHaVoiceActive(false);
        setHaVoiceConnecting(false);
        setHaUserTranscript(null);
        setHaModelTranscript(null);
    }, []);
    const isBenderFullscreen = faceStyleId === 'bender';
    const bgIsDark = isBackgroundDark(appBackgroundStyle, appBackgroundColor, themeMode, faceStyleId);

    const { isIdle, resetIdleTimer } = useIdleTimer(
        screensaverTimeout,
        screensaverEnabled
    );

    const liveApiVoiceId = useLiveApiVoiceId();
    const selectedWakeWordId = useSelectedWakeWordId();
    const selectedWakeWord = useMemo(
        () => getWakeWordDefinition(selectedWakeWordId),
        [selectedWakeWordId]
    );

    const previewVideoRef = useMediaStreamVideo(mediaStream);

    // curioState definition moved below to access playbackState

    const [controlsVisible, setControlsVisible] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showTextInput, setShowTextInput] = useState(false);
    const textInputFormRef = useQuickActionTextInput(setShowTextInput);
    const textInputTogglePointerHandledRef = useRef(false);

    const toggleTextInputVisibility = useCallback(() => {
        setShowTextInput((visible) => {
            if (visible) {
                dismissLocalChatTranscript();
            }
            return !visible;
        });
    }, [dismissLocalChatTranscript]);

    const handleTextInputTogglePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        textInputTogglePointerHandledRef.current = true;
        toggleTextInputVisibility();
    }, [toggleTextInputVisibility]);

    const handleTextInputToggleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (textInputTogglePointerHandledRef.current) {
            textInputTogglePointerHandledRef.current = false;
            return;
        }
        toggleTextInputVisibility();
    }, [toggleTextInputVisibility]);

    const screensaverActive = isIdle && !isConnected && !isConnecting && !haVoiceActive && !haVoiceConnecting && !offlineActive;
    const sessionActiveForIdentity =
        isConnected ||
        isConnecting ||
        haVoiceActive ||
        haVoiceConnecting ||
        offlineActive ||
        textOnlyActive;
    const sharedVisionStream = getSharedVisionStream(mediaStream);
    const runtimeProfile = useRuntimePerformanceProfile({
        lowPowerMode,
        isConnected,
        isConnecting,
        screensaverActive,
        faceTrackingEnabled,
        wakeWordEnabled,
    });

    useSpeakerIdentityMonitor({
        isConnected,
        audioInputStream,
        sendSystemNote,
        speakerIdentificationEnabled,
        speakerAlwaysOnEnabled,
        defaultSpeakerProfileId,
        profiles: speakerProfiles,
        lowPowerMode,
    });

    const {
        feedback: faceIdentityFeedback,
        handleTrackingSample,
    } = useFaceIdentityMonitor({
        enabled: faceRecognitionEnabled,
        faceTrackingEnabled,
        passiveTrackingEnabled: facePassiveTrackingEnabled,
        sessionActive: sessionActiveForIdentity,
        visionStream: sharedVisionStream,
        faceProfiles,
        defaultProfileId: defaultFaceProfileId,
        faceStyleId,
        lowPowerMode,
    });
    const { homeFaceDetected, handleFaceTrackingSample } = useHomeFacePresence(handleTrackingSample);
    const identityContextEnabled = speakerIdentificationEnabled || faceRecognitionEnabled;

    const { currentWeather, currentAqi, activeCity, refreshWeather, getWeatherSnapshot } = useWeatherLoader({
        weatherCity,
        tempUnit,
        lowPowerMode,
        isConnected,
        allowHighFrequencyRefresh: runtimeProfile.allowHighFrequencyWeatherRefresh,
    });

    const voiceRoutines = useMemo(
        () =>
            routines
                .filter((routine) => routine.enabled && routine.trigger.type === 'voice' && routine.trigger.phrase)
                .map((routine) => ({
                    id: routine.id,
                    name: routine.name,
                    phrase: routine.trigger.phrase || '',
                })),
        [routines],
    );








    const openSettings = useCallback(() => {
        setShowSettings(true);
    }, []);
    const handleOpenSettings = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        setShowSettings(true);
    }, []);
    const handlePointerOpenSettings = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (event.button !== 0) return;
        setShowSettings(true);
    }, []);
    const handleOpenDashboardMode = useCallback(() => {
        setIdleMode('dashboard');
    }, []);
    const handleCloseSettings = useCallback(() => {
        setShowSettings(false);
    }, []);
    const handleRefreshWeather = refreshWeather;

    useEffect(() => {
        if (!canUseDesktopFloating) {
            setDesktopFloatingActive(false);
            return undefined;
        }

        setDesktopFloatingActive(desktopFloatingEnabled);
        return getCurioDesktopBridge().onFloatingModeChange((active) => {
            setDesktopFloatingEnabled(active);
            setDesktopFloatingActive(active);
            if (active) setIdleMode('dashboard');
        });
    }, [canUseDesktopFloating, desktopFloatingEnabled]);

    // Reset idle timer whenever any voice session is active or AI is speaking.
    // This prevents the screensaver from activating during a conversation,
    // even if the user hasn't touched the screen in a while.
    // Also runs a periodic keepalive so the timer never expires mid-session.
    useEffect(() => {
        const sessionActive = isConnected || isConnecting || haVoiceActive || haVoiceConnecting || offlineActive;
        if (sessionActive || isSpeaking) {
            resetIdleTimer();
        }
        if (!sessionActive) return;
        const keepalive = setInterval(resetIdleTimer, 30_000);
        return () => clearInterval(keepalive);
    }, [isConnected, isConnecting, haVoiceActive, haVoiceConnecting, offlineActive, isSpeaking, resetIdleTimer]);

    // iOS/Safari Background Activity Handler
    // Force disconnects the Live API to release the microphone when the app is minimized
    // BUT skip if an HA camera stream is active - the user is viewing a camera feed
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                if (desktopFloatingActive) {
                    console.log('[CurioAgentMode] App hidden for desktop floating mode - keeping assistant runtime connected.');
                    return;
                }
                // Don't disconnect if an HA camera stream is active
                if (client?.isHaCameraStreaming) {
                    console.log('[CurioAgentMode] App backgrounded but HA camera is streaming - staying connected.');
                    return;
                }
                if (isConnected || isConnecting) {
                    console.log('[CurioAgentMode] App backgrounded. Force disconnecting Live API to release microphone.');
                    disconnect();
                }
                // Also disconnect HA voice pipeline
                if (haVoiceActive) {
                    console.log('[CurioAgentMode] App backgrounded. Stopping HA voice pipeline.');
                    stopHaVoiceSession();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isConnected, isConnecting, disconnect, client, haVoiceActive, stopHaVoiceSession, desktopFloatingActive]);

    const [subtitlesEnabled, setSubtitlesEnabled] = usePersistentSubtitlesEnabled();

    // ── HA Voice Pipeline transcript state ──
    const [haUserTranscript, setHaUserTranscript] = useState<string | null>(null);
    const [haModelTranscript, setHaModelTranscript] = useState<string | null>(null);

    // ── Unified transcript derivation ──
    // Instead of a fragile priority chain with manual flags, derive the active
    // transcript source from which session is actually running. Any provider
    // that has a non-null transcript wins. Priority: whoever is actively
    // producing output right now.
    //
    // Sources (highest to lowest priority):
    // 1. HA Voice Pipeline (haVoiceActive + haUserTranscript/haModelTranscript)
    // 2. Offline / text-only (offlineActive || textOnlyActive + offline transcripts)
    // 3. LiveAPI / Nova (isConnected + userTranscript/modelTranscript from context)
    //
    // The key insight: when a text-input auto-connects LiveAPI, the LiveAPI
    // transcripts become the source as soon as the model starts responding.
    // We detect this by checking if the LiveAPI has a non-null modelTranscript
    // while connected -- that means the AI is responding through LiveAPI, so
    // we should use LiveAPI transcripts regardless of textOnlyActive.

    const {
        effectiveUserTranscript,
        effectiveModelTranscript,
        effectiveIsSpeaking,
        anySessionActive,
    } = getEffectiveTranscriptState({
        isConnected,
        haVoiceActive,
        offlineActive,
        textOnlyActive,
        customLlmVoiceActive,
        isSpeaking,
        offlineSpeaking,
        userTranscript,
        modelTranscript,
        offlineUserTranscript,
        offlineModelTranscript,
        haUserTranscript,
        haModelTranscript,
    });

    const { showTranscript, latchedUser: latchedUserValue, latchedModel: latchedModelValue } = useSubtitles({
        isConnected: anySessionActive,
        isSpeaking: effectiveIsSpeaking,
        userTranscript: effectiveUserTranscript,
        modelTranscript: effectiveModelTranscript,
        subtitlesEnabled,
        turnKey: subtitleTurnKey,
        inactiveHideDelayMs: SUBTITLE_INACTIVE_HIDE_DELAY_MS,
    });

    // Music Playback State for layout coordination
    const { cards, emitCardEvent: baseEmitCardEvent } = useCardManager();
    const activeCard = cards.length > 0 ? cards[cards.length - 1] : null;
    // Music playback state managed by useMusicPlayback hook
    const { playbackState, isMusicCardVisible, isPlayingOrPaused, isMiniPlayerActive, markMusicStateBeforeConnect, pauseMusic } = useMusicPlayback({ isConnected, isConnecting, cards });
    const emitCardEventRef = useRef(baseEmitCardEvent);
    const getWeatherSnapshotRef = useRef(getWeatherSnapshot);

    getWeatherSnapshotRef.current = getWeatherSnapshot;
    speakerMutedRef.current = speakerMuted;






    const curioState: CurioState = useMemo(() => getCurioRuntimeState({
        playbackState: playbackState.playbackState,
        isConnecting,
        haVoiceConnecting,
        isConnected,
        haVoiceActive,
        isSpeaking,
        offlineActive,
        textOnlyActive,
        customLlmVoiceActive,
        offlineSpeaking,
        error,
        cameraEnabled,
    }), [playbackState.playbackState, error, isConnecting, isConnected, isSpeaking, cameraEnabled, haVoiceConnecting, haVoiceActive, offlineActive, textOnlyActive, customLlmVoiceActive, offlineSpeaking]);

    const speakerSession = useSpeakerSessionState();
    const showDashboard = idleMode === 'dashboard' && !screensaverActive;
    const emitCardEvent = useCallback((event: CardEvent) => {
        if (showDashboard && typeof window !== 'undefined') {
            try {
                window.dispatchEvent(new CustomEvent('curio:dashboard-card-intent', { detail: event }));
            } catch {
                // Ignore bridge dispatch failures.
            }

            // Dashboard mode should route video intents to the YouTube widget
            // instead of opening a fullscreen card.
            if (event.type === 'youtube') {
                return;
            }
        }
        baseEmitCardEvent(event);
    }, [baseEmitCardEvent, showDashboard]);

    emitCardEventRef.current = emitCardEvent;
    const connectionUiState = useMemo(() => getVoiceConnectionUiState({
        isConnected,
        isConnecting,
        haVoiceActive,
        haVoiceConnecting,
        offlineActive,
        customLlmVoiceActive,
    }), [customLlmVoiceActive, haVoiceActive, haVoiceConnecting, isConnected, isConnecting, offlineActive]);

    // Derive emotion hint from AI transcript for expressive face reactions
    const emotionHint = useMemo(() => emotionFromText(effectiveModelTranscript), [effectiveModelTranscript]);

    // --- Bender interjection sounds ---
    // Play a random Bender clip ~20% of the time when the AI starts speaking.
    // Cooldown of 30s prevents spamming.
    const benderInterjectionCooldown = useRef(0);
    useEffect(() => {
        if (faceStyleId !== 'bender' || !getBenderSoundsEnabled()) return;
        if (!effectiveIsSpeaking) return;
        const now = Date.now();
        if (now - benderInterjectionCooldown.current < 30_000) return;
        if (Math.random() > 0.2) return;
        benderInterjectionCooldown.current = now;
        void loadAudioService().then(m => m.playBenderInterjection());
    }, [effectiveIsSpeaking, faceStyleId]);

    // Track if music was playing before we connected so we can resume it after






    const sessionActive = isConnected
        || isConnecting
        || isSpeaking
        || haVoiceActive
        || haVoiceConnecting
        || offlineActive
        || customLlmVoiceActive
        || textOnlyActive
        || offlineSpeaking;
    const isSessionActiveRef = useSessionActiveRef(sessionActive);
    useAmbientSpeechDelivery(isSessionActiveRef, speakerMutedRef);

    const proactiveEnabled = useProactiveEnabled();
    useProactiveEngineLifecycle({
        enabled: proactiveEnabled,
        emitCardEventRef,
        getWeatherSnapshotRef,
        isSessionActiveRef,
    });

    const hasAnyEnabledRoutine = useMemo(
        () => routines.some((r) => r.enabled),
        [routines],
    );
    useRoutineSchedulerLifecycle({
        enabled: hasAnyEnabledRoutine,
        emitCardEventRef,
    });

    // --- IDLE STATUS PHRASES ---    // Idle status phrases managed by useIdleStatusPhrase hook
    const { idleStatusPhrase, handleFaceDetected: onFaceGreeting, renderStatusWithWakeWord } = useIdleStatusPhrase({
        selectedWakeWord,
        userName,
        curioState,
        screensaverActive,
    });

    // When face tracking detects a face, greet the user AND dismiss the
    // screensaver so walking up to the device wakes it automatically.
    const handleFaceDetected = useCallback((detected?: boolean) => {
        onFaceGreeting(detected);
        if (detected !== false) {
            resetIdleTimer();
        }
    }, [onFaceGreeting, resetIdleTimer]);

    // Auto-disconnect Live API when music or video starts playing.
    // We clear ONLY the resumption token (not transcript history) so the
    // next connection starts a fresh server session instead of replaying
    // the in-flight "play music" turn / tool call. Transcript history is
    // preserved and re-seeded as plain text on reconnect, so the AI still
    // remembers the earlier conversation.
    useEffect(() => {
        const handleMediaPlaying = () => {
            if (isConnected) {
                console.log('[CurioAgentMode] External media (video) detected during stable session. Disconnecting and clearing resumption token.');
                clearResumptionToken();
                disconnect();
            }
        };

        window.addEventListener('curio:media-playing', handleMediaPlaying);

        // Only disconnect if music starts/is playing while we are already in a stable CONNECTED state.
        // We ignore 'isConnecting' to allow the pause-on-connect logic time to work.
        if (playbackState.playbackState === 'playing' && isConnected && !isConnecting) {
            console.log('[CurioAgentMode] Music detected as playing during stable session. Disconnecting and clearing resumption token.');
            clearResumptionToken();
            disconnect();
        }

        return () => window.removeEventListener('curio:media-playing', handleMediaPlaying);
    }, [playbackState.playbackState, isConnected, isConnecting, disconnect, clearResumptionToken]);

    // Handle Home Assistant OAuth callback (extracted to hook)
    useHaOAuthCallback();

    // Auto-login when running inside HA ingress panel
    useHaIngressAutoLogin();

    // Handle Google sign-in redirect result (Photos / Tasks on iOS PWA)
    useGoogleRedirectCallback();





    // Initialize global navigation
    useEffect(() => {
        setGlobalNavigate(() => setMode);
    }, [setGlobalNavigate, setMode]);

    const handler = useMemo(() => ({
        ...createGlobalMascotHandler(
            setMode,
            toggleCamera
        ),
        flipCamera,
        get_weather: async (city?: string) => {
            const requestedCity = city?.trim();
            const snapshot = getWeatherSnapshot();
            console.log('[CurioAgentMode] AI calling get_weather tool', requestedCity ? `for city: ${requestedCity}` : '(local)');

            // If a specific city is requested (different from local), fetch fresh data for it
            if (requestedCity && requestedCity.toLowerCase() !== (snapshot.city || '').toLowerCase()) {
                try {
                    const { weather, aqi } = await getUnifiedWeather(requestedCity, false, true);
                    return {
                        city: weather?.city || requestedCity,
                        tempUnit: snapshot.tempUnit,
                        weather,
                        aqi,
                        timestamp: new Date().toISOString(),
                        note: `Weather for ${weather?.city || requestedCity} (requested by user)`
                    };
                } catch (e) {
                    return { success: false, error: `Failed to fetch weather for ${requestedCity}: ${(e as Error).message}` };
                }
            }

            // Return local weather
            return {
                city: snapshot.city,
                tempUnit: snapshot.tempUnit,
                weather: snapshot.weather,
                aqi: snapshot.aqi,
                timestamp: new Date().toISOString()
            };
        },
        get_current_time: async () => {
            console.log('[CurioAgentMode] AI calling get_current_time tool');
            return {
                localTime: new Date().toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(' ', 'T'),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                iso: new Date().toISOString()
            };
        }
    }), [setMode, toggleCamera, flipCamera]);

    const lastHandledConfigRef = useRef({
        userName,
        weatherCity,
        tempUnit,
        liveApiVoiceId,
        activePersonalitySignature,
    });

    useEffect(() => {
        // If we are not connected, we don't need to sync context.
        // We update the ref so that when we DO connect, we have the latest baseline.
        if (!isConnected || !globalNavigate) {
            lastHandledConfigRef.current = {
                userName, weatherCity, tempUnit, liveApiVoiceId, activePersonalitySignature
            };
            return;
        }

        const configChanged =
            lastHandledConfigRef.current.userName !== userName ||
            lastHandledConfigRef.current.weatherCity !== weatherCity ||
            lastHandledConfigRef.current.tempUnit !== tempUnit ||
            lastHandledConfigRef.current.liveApiVoiceId !== liveApiVoiceId ||
            lastHandledConfigRef.current.activePersonalitySignature !== activePersonalitySignature;

        if (configChanged) {
            console.log('[CurioAgentMode] Context parameters changed while connected, updating...', {
                old: lastHandledConfigRef.current,
                new: { userName, weatherCity, tempUnit, liveApiVoiceId, activePersonalitySignature }
            });

            lastHandledConfigRef.current = {
                userName, weatherCity, tempUnit, liveApiVoiceId, activePersonalitySignature
            };

            const baseInstruction = getCurioSystemPrompt(
                userName || undefined,
                activeCity,
                tempUnit,
                currentWeather,
                currentAqi,
                resolveVoiceSearchGroundingMode(voiceBackend),
                activePersonalityPrompt,
                homeLocation,
                workLocation,
                customLocations,
                voiceRoutines,
            );

            void updateContext(
                'global',
                handler,
                identityContextEnabled
                    ? appendSpeakerContextToInstruction(baseInstruction, {
                        profileId: getSpeakerSessionState().activeProfileId,
                        profileName: getSpeakerSessionState().activeProfileName,
                        source: getSpeakerSessionState().source,
                        recognizedBy: getSpeakerSessionState().recognizedBy,
                        confidence: getSpeakerSessionState().confidence,
                    })
                    : baseInstruction,
                liveApiVoiceId || 'Aoede'
            );
        }
    }, [handler, identityContextEnabled, isConnected, liveApiVoiceId, updateContext, userName, weatherCity, activeCity, tempUnit, globalNavigate, currentWeather, currentAqi, homeLocation, workLocation, customLocations, voiceRoutines, activePersonalityPrompt, activePersonalitySignature, voiceBackend]);

    // Sound effects triggered by state transitions
    const prevStateRef = useRef<CurioState>('idle');
    useEffect(() => {
        const prev = prevStateRef.current;
        prevStateRef.current = curioState;

        if (curioState === prev) return;

        if (curioState === 'warmup') {
            // Greeting moved to direct button/wake handlers to avoid double-triggering
        } else if (curioState === 'idle') {
            // Disconnected -- stop any leftover sound
            void loadAudioService().then(m => m.stopCurioSound());
        }
    }, [curioState]);

    // Also stop sound immediately when the user presses Disconnect
    const handleDisconnect = useCallback(async () => {
        if (faceStyleId === 'bender' && getBenderSoundsEnabled()) {
            void loadAudioService().then(m => m.playBenderDismissal());
        }
        void loadAudioService().then(m => m.stopCurioSound());
        // Clean up HA voice pipeline if active
        const haVoiceMod = await loadHaVoicePipeline();
        if (haVoiceActive || haVoiceMod.isHaVoicePipelineConnected()) {
            stopHaVoiceSession();
        }
        // Clean up offline if active
        const offlineMod = await loadOfflineSpeech();
        if (offlineActive || offlineMod.isOfflineListening()) {
            offlineMod.stopOfflineListening();
            setOfflineActive(false);
            setOfflineUserTranscript(null);
            setOfflineModelTranscript(null);
            setOfflineSpeaking(false);
        }
        stopCustomLLMVoiceSession();
        setTextOnlyActive(false);
        await toggleCamera(false);
        await disconnect();
    }, [disconnect, toggleCamera, faceStyleId, haVoiceActive, stopHaVoiceSession, offlineActive, stopCustomLLMVoiceSession]);


    // Send queued text after connection is established
    useEffect(() => {
        if (isConnected && client && pendingTextRef.current) {
            const text = pendingTextRef.current;
            pendingTextRef.current = null;
            // Clear offline transcript state -- LiveAPI will manage transcripts now
            setOfflineUserTranscript(null);
            setOfflineModelTranscript(null);
            setOfflineSpeaking(false);
            setTextOnlyActive(false);
            setTimeout(() => contextSendTextTurn(text), 500);
        }
    }, [isConnected, client, contextSendTextTurn]);

    // Stable callbacks for processOfflineTextCommand -- avoids recreating on every submit
    const offlineTextCallbacks = useMemo<OfflineSpeechCallbacks>(() => ({
        onStatusChange: (status) => {
            if (status === 'speaking') { setOfflineSpeaking(true); }
            else if (status === 'listening' || status === 'idle') { setOfflineSpeaking(false); }
        },
        onTranscript: () => {},
        onCardEvent: (ev: CardEvent) => { emitCardEvent(ev); },
        onSpeak: (msg: string) => {
            setTextOnlyActive(true);
            setOfflineModelTranscript(msg);
            setOfflineSpeaking(true);
            speakWithSafetyTimeout(msg, () => setOfflineSpeaking(false));
        },
        onError: () => {},
    }), [emitCardEvent]);

    const finishTextOnlySpeech = useCallback((delayMs = 0) => {
        window.setTimeout(() => {
            setOfflineSpeaking(false);
        }, delayMs);
    }, []);

    const dismissTextOnlyTurn = useCallback((delayMs = 0) => {
        window.setTimeout(() => {
            dismissLocalChatTranscript();
        }, delayMs);
    }, [dismissLocalChatTranscript]);

    const speakCustomLLMResponse = useCallback(async (text: string) => {
        const spokenText = sanitizeTextForSpokenTranscript(text) || text.trim();
        setOfflineModelTranscript(spokenText);

        if (!spokenText.trim()) {
            dismissTextOnlyTurn(200);
            return;
        }

        if (speakerMuted) {
            finishTextOnlySpeech();
            return;
        }

        setOfflineSpeaking(true);
        try {
            const { TTSService } = await import('../../services/pocketTtsService');
            const service = new TTSService({ engine: customTTSEngine });

            if (customTTSVoiceProfileId) {
                const { speakWithClonedVoice } = await import('../../services/voiceCloneService');
                await speakWithClonedVoice(service, spokenText, customTTSVoiceProfileId);
            } else {
                await service.speak(spokenText, customTTSVoiceId ? { voiceId: customTTSVoiceId } : undefined);
            }
        } catch (error) {
            console.warn('[CurioAgentMode] Custom LLM TTS failed:', error);
            finishTextOnlySpeech();
            return;
        }

        finishTextOnlySpeech(100);
    }, [customTTSEngine, customTTSVoiceId, customTTSVoiceProfileId, dismissTextOnlyTurn, finishTextOnlySpeech, speakerMuted]);

    const runCustomLLMTextTurn = useCallback(async (text: string) => {
        noteSubtitleUserTurn();
        setTextOnlyActive(true);
        clearError();
        setOfflineUserTranscript(text);
        setOfflineModelTranscript(null);
        setOfflineSpeaking(false);

        try {
            const [
                {
                    buildCustomLLMFollowupSystemPrompt,
                    buildCustomLLMSystemPrompt,
                    createConfiguredCustomLLMProvider,
                    customLLMProviderConfigHasNativeSearch,
                    getConfiguredCustomLLMProviderConfig,
                    getMissingCustomLLMCredentialMessage,
                    hasConfiguredCustomLLMCredential,
                },
                { runLLMToolAgent },
                {
                    buildCustomLLMToolDefinitions,
                    getCurrentConnectedToolState,
                },
            ] = await Promise.all([
                import('../../services/ai/customLlmRuntime'),
                import('../../services/ai/llmToolAgent'),
                import('../../services/ai/toolSchema'),
            ]);

            const config = await getConfiguredCustomLLMProviderConfig();
            if (!hasConfiguredCustomLLMCredential(config)) {
                throw new Error(getMissingCustomLLMCredentialMessage(config));
            }

            const provider = await createConfiguredCustomLLMProvider();
            const providerHasNativeSearch = customLLMProviderConfigHasNativeSearch(config);
            const connectedToolState = getCurrentConnectedToolState();

            let mcpTools: import('@google/genai').FunctionDeclaration[] = [];
            let onMcpToolCall: ((name: string, args: any) => Promise<any>) | undefined;
            let entityCache: any[] = [];
            let homeAssistantToolCount = 0;
            let genericMcpSession: import('../../services/genericMcpService').PreparedGenericMcpTools | null = null;
            let haToolCall: ((name: string, args: any) => Promise<any>) | undefined;

            try {
                const { getHaPreparedSession } = await import('../../services/haMcpService');
                const prepared = await getHaPreparedSession();
                if (prepared) {
                    mcpTools = prepared.tools;
                    entityCache = prepared.entities;
                    homeAssistantToolCount = prepared.tools.length;
                    haToolCall = async (name, args) => prepared.client.callTool(name, args);
                }
            } catch (haError) {
                console.warn('[CurioAgentMode] Failed to prepare Home Assistant tools for custom LLM:', haError);
            }

            try {
                const {
                    filterPreparedGenericMcpToolsForSearchCapability,
                    prepareGenericMcpTools,
                } = await import('../../services/genericMcpService');
                genericMcpSession = filterPreparedGenericMcpToolsForSearchCapability(
                    await prepareGenericMcpTools(),
                    { allowSearchTools: !providerHasNativeSearch },
                );
                if (genericMcpSession.tools.length > 0) {
                    mcpTools = [...mcpTools, ...genericMcpSession.tools];
                }
            } catch (mcpError) {
                console.warn('[CurioAgentMode] Failed to prepare external MCP tools for custom LLM:', mcpError);
            }

            if (haToolCall || genericMcpSession?.tools.length) {
                onMcpToolCall = async (name, args) => {
                    if (name.startsWith('homeassistant__') && haToolCall) {
                        return haToolCall(name, args);
                    }
                    if (genericMcpSession?.bindings.has(name)) {
                        return genericMcpSession.callTool(name, args);
                    }
                    throw new Error(`No MCP client available to handle tool: ${name}`);
                };
            }

            const homeAssistantAvailable = homeAssistantToolCount > 0;
            const promptCapabilities = {
                customTextTools: true,
                homeAssistant: homeAssistantAvailable,
                calendar: connectedToolState.googleCalendar || connectedToolState.importedCalendar || connectedToolState.outlookCalendar,
                googleCalendar: connectedToolState.googleCalendar,
                outlookCalendar: connectedToolState.outlookCalendar,
                gmail: connectedToolState.gmail,
                outlookMail: connectedToolState.outlookMail,
                slack: connectedToolState.slack,
                obsidian: connectedToolState.obsidian,
            };
            const textToolDefinitions = buildCustomLLMToolDefinitions(mcpTools, {
                homeAssistant: homeAssistantAvailable,
            });

            const baseInstruction = getCurioSystemPrompt(
                userName || undefined,
                activeCity,
                tempUnit,
                currentWeather,
                currentAqi,
                (genericMcpSession?.searchToolNames.length || 0) > 0
                    ? 'external-mcp-search'
                    : 'provider-native-search',
                activePersonalityPrompt,
                homeLocation,
                workLocation,
                customLocations,
                voiceRoutines,
                promptCapabilities,
            );

            const systemInstruction = identityContextEnabled
                ? appendSpeakerContextToInstruction(baseInstruction, {
                    profileId: getSpeakerSessionState().activeProfileId,
                    profileName: getSpeakerSessionState().activeProfileName,
                    source: getSpeakerSessionState().source,
                    recognizedBy: getSpeakerSessionState().recognizedBy,
                    confidence: getSpeakerSessionState().confidence,
                })
                : baseInstruction;

            const speakerState = getSpeakerSessionState();
            const contextDigest = [
                `Current local time: ${new Date().toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(' ', 'T')} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
                `User: ${userName || 'User'}`,
                `Location: ${currentWeather?.city || activeCity || weatherCity || 'Unknown'}`,
                `Weather: ${currentWeather ? `${tempUnit === 'C' ? `${currentWeather.tempC}C` : `${currentWeather.tempF}F`}, ${currentWeather.desc || 'conditions unknown'}` : 'No data'}`,
                `Air quality: ${currentAqi ? `${currentAqi.value} (${currentAqi.category})` : 'No data'}`,
                `Home: ${homeLocation || 'Not set'}`,
                `Work: ${workLocation || 'Not set'}`,
                customLocations.length > 0
                    ? `Custom locations: ${customLocations.filter((location) => location.label && location.address).map((location) => `${location.label}: ${location.address}`).join('; ')}`
                    : 'Custom locations: none',
                voiceRoutines.length > 0
                    ? `Voice routines: ${voiceRoutines.map((routine) => `${routine.name || routine.phrase} -> ${routine.id}`).join('; ')}`
                    : 'Voice routines: none',
                identityContextEnabled && speakerState.activeProfileName
                    ? `Recognized speaker: ${speakerState.activeProfileName} (${speakerState.confidence ?? 'unknown'} confidence)`
                    : '',
            ].filter(Boolean).join('\n');
            const sessionToolSignature = textToolDefinitions
                .map((tool) => tool.name || '')
                .filter(Boolean)
                .sort()
                .join('|');
            const sessionKey = JSON.stringify({
                providerType: config.type,
                baseUrl: config.baseUrl,
                model: config.model,
                personality: activePersonalitySignature,
                toolSignature: sessionToolSignature,
                identityContextEnabled,
            });
            const cachedSession = customLlmSessionRef.current?.key === sessionKey
                ? customLlmSessionRef.current
                : null;
            const isFollowupTurn = Boolean(cachedSession?.messages.length);
            const customLlmSystemPrompt = isFollowupTurn
                ? buildCustomLLMFollowupSystemPrompt({
                    contextDigest,
                    homeAssistantToolCount,
                    homeAssistantEntityCount: entityCache.length,
                    externalMcpToolCount: genericMcpSession?.tools.length || 0,
                    externalMcpInstruction: genericMcpSession?.instructionSuffix || '',
                    providerSupportsTools: Boolean(provider.generateToolResponse),
                })
                : buildCustomLLMSystemPrompt({
                    systemInstruction,
                    homeAssistantToolCount,
                    homeAssistantEntityCount: entityCache.length,
                    externalMcpToolCount: genericMcpSession?.tools.length || 0,
                    externalMcpInstruction: genericMcpSession?.instructionSuffix || '',
                    providerSupportsTools: Boolean(provider.generateToolResponse),
                });

            const responseText = await runLLMToolAgent({
                provider,
                prompt: text,
                systemPrompt: customLlmSystemPrompt,
                sessionMessages: cachedSession?.messages ?? [],
                persistSystemPromptInSession: false,
                maxSessionMessages: provider.maxToolDefinitionTokens ? 8 : 12,
                onSessionMessagesChange: (messages) => {
                    customLlmSessionRef.current = { key: sessionKey, messages };
                },
                toolDefinitions: textToolDefinitions,
                context: {
                    onCardEvent: emitCardEvent,
                    entityCache,
                    handler,
                    onMcpToolCall,
                    disconnect: () => {},
                    startHaCameraStream: async () => {},
                    stopHaCameraStream: () => {},
                    isHaCameraStreaming: false,
                },
            });

            if (responseText) {
                await speakCustomLLMResponse(responseText);
            } else {
                dismissTextOnlyTurn(200);
            }
        } catch (error) {
            console.error('[CurioAgentMode] Custom LLM turn failed:', error);
            setOfflineModelTranscript((error as Error).message || 'The custom LLM request failed.');
            finishTextOnlySpeech();
        }
    }, [activeCity, activePersonalityPrompt, activePersonalitySignature, clearError, currentAqi, currentWeather, customLocations, dismissTextOnlyTurn, emitCardEvent, finishTextOnlySpeech, handler, homeLocation, identityContextEnabled, noteSubtitleUserTurn, speakCustomLLMResponse, tempUnit, userName, voiceRoutines, weatherCity, workLocation]);

    // Voice flow for the text-only custom LLM backend. Wake word uses a single
    // utterance; Connect keeps continuous dictation alive until Disconnect or
    // the idle timer closes the session.
    const startCustomLLMVoiceTurn = useCallback(async (options?: { keepSessionActive?: boolean }) => {
        const keepSessionActive = Boolean(options?.keepSessionActive);
        // If a dictation is already running, ignore (wake word debounces too).
        if (customLlmDictationRef.current) return;

        if (keepSessionActive) {
            setCustomLlmVoiceActive(true);
            scheduleCustomLLMVoiceIdleDisconnect();
        }
        clearError();
        void unlockAudio();

        const { startDictation, isWebSpeechSupported } = await import('../../services/webSpeechDictation');
        if (!isWebSpeechSupported()) {
            // Safari desktop + older browsers: no Web Speech API. Fall back
            // to opening the text input so the wake word still does something
            // useful -- the user types instead of speaks.
            setShowTextInput(true);
            if (keepSessionActive) {
                clearCustomLLMVoiceIdleTimer();
                setCustomLlmVoiceActive(false);
            }
            // Give the user a hint that dictation isn't available here.
            setTextOnlyActive(true);
            setOfflineModelTranscript('Speech recognition is not available in this browser. Type your message.');
            window.setTimeout(() => {
                setTextOnlyActive(false);
                setOfflineModelTranscript(null);
            }, 3500);
            return;
        }

        // Optimistically show the listening state so the user sees feedback.
        setTextOnlyActive(true);
        setOfflineUserTranscript('');
        setOfflineModelTranscript(null);
        setOfflineSpeaking(false);

        if (faceStyleId === 'bender' && getBenderSoundsEnabled()) {
            void loadAudioService().then((m) => m.playBenderGreeting());
        } else if (faceStyleId !== 'bender') {
            void loadAudioService().then((m) => m.playCurioGreeting());
        }

        let finalHandled = false;

        const handle = startDictation({
            onInterim: (text) => {
                if (keepSessionActive) {
                    if (customLlmVoiceProcessingRef.current) return;
                    scheduleCustomLLMVoiceIdleDisconnect();
                }
                setOfflineUserTranscript(text);
            },
            onFinal: (text) => {
                finalHandled = true;
                if (keepSessionActive && customLlmVoiceProcessingRef.current) return;
                if (!keepSessionActive) {
                    customLlmDictationRef.current = null;
                }
                if (!text) {
                    setOfflineUserTranscript(null);
                    if (keepSessionActive) {
                        scheduleCustomLLMVoiceIdleDisconnect();
                    } else {
                        setTextOnlyActive(false);
                    }
                    return;
                }
                if (keepSessionActive) {
                    clearCustomLLMVoiceIdleTimer();
                    customLlmVoiceProcessingRef.current = true;
                }
                void (async () => {
                    await runCustomLLMTextTurn(text);
                    if (keepSessionActive) {
                        customLlmVoiceProcessingRef.current = false;
                        if (customLlmVoiceActiveRef.current) {
                            customLlmDictationRef.current?.resetIdleTimeout();
                            scheduleCustomLLMVoiceIdleDisconnect();
                        }
                    }
                })();
            },
            onError: (msg) => {
                if (!keepSessionActive) {
                    customLlmDictationRef.current = null;
                }
                if (msg === 'no-speech') {
                    setOfflineUserTranscript(null);
                    if (keepSessionActive) {
                        scheduleCustomLLMVoiceIdleDisconnect();
                    } else {
                        // Silent failure -- just drop back to idle.
                        setTextOnlyActive(false);
                    }
                    return;
                }
                console.warn('[CurioAgentMode] Custom LLM dictation error:', msg);
                if (keepSessionActive) {
                    customLlmVoiceProcessingRef.current = false;
                    clearCustomLLMVoiceIdleTimer();
                    setCustomLlmVoiceActive(false);
                }
                // Safari's STT can fail at runtime (network error, denied permission,
                // unsupported language). Pop the text input so the user isn't stuck.
                setShowTextInput(true);
                setOfflineModelTranscript(`Couldn't hear you. Type instead.`);
                window.setTimeout(() => {
                    setTextOnlyActive(false);
                    setOfflineUserTranscript(null);
                    setOfflineModelTranscript(null);
                }, 3000);
            },
            onEnd: () => {
                // Connected mode owns the visible session state; a recognizer
                // end should not flip the Connect button unless idle cleanup
                // or explicit Disconnect does it.
                if (customLlmDictationRef.current) {
                    customLlmDictationRef.current = null;
                }
                if (keepSessionActive) {
                    if (customLlmVoiceActiveRef.current && !customLlmVoiceProcessingRef.current) {
                        scheduleCustomLLMVoiceIdleDisconnect();
                    }
                    return;
                }
                if (!finalHandled) {
                    setTextOnlyActive(false);
                }
            },
        }, { continuous: keepSessionActive });

        if (handle) customLlmDictationRef.current = handle;
        else if (keepSessionActive) {
            clearCustomLLMVoiceIdleTimer();
            setCustomLlmVoiceActive(false);
        }
    }, [clearCustomLLMVoiceIdleTimer, clearError, faceStyleId, runCustomLLMTextTurn, scheduleCustomLLMVoiceIdleDisconnect, setCustomLlmVoiceActive, unlockAudio]);

    // Abort any in-flight dictation on unmount so we don't leave the mic hot.
    useEffect(() => {
        return () => stopCustomLLMVoiceSession();
    }, [stopCustomLLMVoiceSession]);

    const startOfflineSession = useCallback(() => {
        void loadOfflineSpeech().then(async offlineMod => {
            if (offlineActive || offlineMod.isOfflineListening()) {
                offlineMod.stopOfflineListening();
                setOfflineActive(false);
                setOfflineUserTranscript(null);
                setOfflineModelTranscript(null);
                setOfflineSpeaking(false);
                return;
            }
            // Clear any stale Gemini connection error so it doesn't
            // overlay the offline session UI or confuse curioState
            clearError();
            setOfflineActive(true);
            void unlockAudio();
            // Unlock iOS speech synthesis during this user gesture so
            // async onSpeak callbacks can use speechSynthesis.speak()
            offlineMod.unlockSpeechSynthesis();
            if (faceStyleId === 'bender' && getBenderSoundsEnabled()) { void loadAudioService().then(m => m.playBenderGreeting()); } else if (faceStyleId !== 'bender') { void loadAudioService().then(m => m.playCurioGreeting()); }

            // Load HA entities for device control in offline mode
            try {
                const { getHaPreparedSession } = await import('../../services/haMcpService');
                const prepared = await getHaPreparedSession();
                if (prepared) {
                    offlineMod.setOfflineEntityCache(prepared.entities);
                    console.log(`[CurioAgentMode] Loaded ${prepared.entities.length} HA entities for offline mode`);
                }
            } catch (e) {
                console.warn('[CurioAgentMode] Failed to load HA entities for offline mode:', e);
            }

            const cbs: OfflineSpeechCallbacks = {
                onStatusChange: (status) => {
                    window.dispatchEvent(new CustomEvent('curio:offline-status', { detail: { status } }));
                    if (status === 'idle' && !offlineMod.isOfflineListening()) { setOfflineActive(false); }
                    if (status === 'speaking') { setOfflineSpeaking(true); }
                    else if (status === 'listening' || status === 'idle') { setOfflineSpeaking(false); }
                },
                onTranscript: (text, isFinal) => {
                    window.dispatchEvent(new CustomEvent('curio:offline-transcript', { detail: { text, isFinal } }));
                    setOfflineUserTranscript(text);
                    if (isFinal) {
                        trackDashboardActivityEvent('aiMessage', {
                            source: 'voice',
                            backend: 'offline',
                        });
                        noteSubtitleUserTurn();
                        // Clear model transcript when new user input arrives
                        setOfflineModelTranscript(null);
                    }
                },
                onCardEvent: (event) => { emitCardEvent(event); },
                onSpeak: (text) => {
                    // Show the spoken response as model transcript for subtitles
                    setOfflineModelTranscript(text);
                    setOfflineSpeaking(true);
                    speakWithSafetyTimeout(text, () => setOfflineSpeaking(false));
                },
                onError: (err) => { console.warn('[CurioAgentMode] Offline error:', err); },
            };
            if (!offlineMod.isSpeechRecognitionSupported()) {
                console.warn('[CurioAgentMode] Speech recognition not supported');
                setOfflineActive(false);
                return;
            }
            offlineMod.startContinuousOfflineListening(cbs);
        });
    }, [emitCardEvent, faceStyleId, noteSubtitleUserTurn, unlockAudio, offlineActive, clearError]);

    // ── HA Voice Pipeline session ──
    const startHaVoiceSession = useCallback(async () => {
        if (haVoiceActive || haVoiceConnecting) {
            stopHaVoiceSession();
            return;
        }

        setHaVoiceConnecting(true);
        // Clear any stale Gemini connection error
        clearError();
        void unlockAudio();

        const cbs: HaVoicePipelineCallbacks = {
            onStatusChange: (s) => {
                console.log('[HaVoice] Status:', s);
                if (s === 'disconnected' || s === 'error') {
                    setHaVoiceActive(false);
                    setHaVoiceConnecting(false);
                }
            },
            onTranscript: (text, isFinal) => {
                setHaUserTranscript(text);
                if (isFinal) {
                    trackDashboardActivityEvent('aiMessage', {
                        source: 'voice',
                        backend: 'ha_voice_pipeline',
                    });
                    // Analyze user speech for card-worthy commands (timers, notes, devices, etc.)
                    // and execute actions + emit cards via resolveAndEmitCard.
                    // The HA pipeline also processes the text for AI response -- both paths
                    // run in parallel. Cards from user speech appear immediately; the HA AI
                    // response may produce additional content cards via onIntentResult.
                    void loadTranscriptAnalyzer().then(m => {
                        const cardEvent = m.analyzeTranscript(text, false, 'offline');
                        if (cardEvent) {
                            void resolveAndEmitCard(cardEvent, emitCardEvent);
                        }
                    });
                    // Handle commands the transcript analyzer doesn't detect but
                    // the offline processor does (music, weather, directions, email).
                    // Use a lightweight check to avoid double-processing.
                    const normalized = text.toLowerCase().trim();
                    const isMusic = /\b(?:play|play me|put on|listen to)\s+.{3,}/i.test(normalized) && !/\b(?:video|youtube)\b/i.test(normalized);
                    const isWeather = /\b(?:weather|forecast|how (?:hot|cold|warm) is it|do i need (?:a )?(?:jacket|umbrella))\b/i.test(normalized);
                    const isDirections = /\b(?:directions?\s+to|navigate\s+to|how\s+(?:do\s+i\s+)?get\s+to|take\s+me\s+to)\b/i.test(normalized);
                    if (isMusic || isWeather || isDirections) {
                        void loadOfflineSpeech().then(mod => {
                            mod.processOfflineTextCommand(text, {
                                onSpeak: () => {},
                                onStatusChange: () => {},
                                onTranscript: () => {},
                                onError: () => {},
                                onCardEvent: emitCardEvent,
                            });
                        });
                    }
                }
            },
            onIntentResult: (responseText) => {
                if (responseText) {
                    setHaModelTranscript(responseText);
                    // Analyze HA response for card-worthy content
                    void loadTranscriptAnalyzer().then(m => {
                        const cardEvent = m.analyzeTranscript(responseText, false, 'offline');
                        if (cardEvent) {
                            void resolveAndEmitCard(cardEvent, emitCardEvent);
                        }
                    });
                }
            },
            onTtsUrl: (url) => {
                // Stop any previous TTS
                if (haVoiceTtsAudioRef.current) {
                    haVoiceTtsAudioRef.current.pause();
                }
                const audio = new Audio(url);
                haVoiceTtsAudioRef.current = audio;
                audio.onended = () => {
                    // Clear live transcripts so useSubtitles latches them and starts the 10s auto-hide
                    setHaUserTranscript(null);
                    setHaModelTranscript(null);
                    // Resume speech recognition now that TTS is done
                    void loadHaVoicePipeline().then(m => m.resumeListening());
                };
                audio.onerror = () => {
                    setHaUserTranscript(null);
                    setHaModelTranscript(null);
                    // Resume listening even if TTS fails
                    void loadHaVoicePipeline().then(m => m.resumeListening());
                };
                audio.play().catch(e => {
                    console.warn('[HaVoice] TTS playback failed:', e);
                    setHaUserTranscript(null);
                    setHaModelTranscript(null);
                    // Resume listening if autoplay is blocked
                    void loadHaVoicePipeline().then(m => m.resumeListening());
                });
            },
            onError: (code, message) => {
                console.warn('[HaVoice] Pipeline error:', code, message);
            },
            onRunEnd: () => {
                // Clear live transcripts if they haven't been cleared by TTS
                // (e.g. when HA returns no TTS URL)
                setHaUserTranscript(null);
                setHaModelTranscript(null);
            },
        };

        try {
            const haVoiceMod = await loadHaVoicePipeline();
            await haVoiceMod.connectHaVoicePipeline(cbs);
            void unlockAudio();

            // Load HA entities for device control in HA voice pipeline mode
            try {
                const { getHaPreparedSession } = await import('../../services/haMcpService');
                const prepared = await getHaPreparedSession();
                if (prepared) {
                    const offlineMod = await loadOfflineSpeech();
                    offlineMod.setOfflineEntityCache(prepared.entities);
                    console.log(`[CurioAgentMode] Loaded ${prepared.entities.length} HA entities for HA voice pipeline`);
                }
            } catch (e) {
                console.warn('[CurioAgentMode] Failed to load HA entities for HA voice pipeline:', e);
            }

            // Start browser speech recognition -- recognized text gets sent
            // to HA's intent pipeline automatically by the service
            haVoiceMod.startListening();

            setHaVoiceActive(true);
            setHaVoiceConnecting(false);

            if (faceStyleId === 'bender' && getBenderSoundsEnabled()) { void loadAudioService().then(m => m.playBenderGreeting()); } else if (faceStyleId !== 'bender') { void loadAudioService().then(m => m.playCurioGreeting()); }
        } catch (e: any) {
            console.error('[HaVoice] Failed to start:', e);
            stopHaVoiceSession();
        }
    }, [haVoiceActive, haVoiceConnecting, stopHaVoiceSession, unlockAudio, faceStyleId, emitCardEvent, clearError]);

    const handleConnectionToggle = useCallback(async () => {
        const connectionAction = getVoiceConnectionToggleAction({
            voiceBackend,
            isConnected,
            isConnecting,
            haVoiceActive,
            haVoiceConnecting,
            offlineActive,
            customLlmVoiceActive,
        });

        if (connectionAction === 'toggle_ha_voice') {
            startHaVoiceSession();
            return;
        }

        if (connectionAction === 'toggle_offline_voice') {
            startOfflineSession();
            return;
        }

        if (connectionAction === 'toggle_custom_llm_voice') {
            if (customLlmVoiceActive || customLlmDictationRef.current) {
                stopCustomLLMVoiceSession();
                return;
            }
            void startCustomLLMVoiceTurn({ keepSessionActive: true });
            return;
        }

        if (connectionAction === 'disconnect_live') {
            await handleDisconnect();
            return;
        }

        // --- GESTURE PRIMING ---
        // For iOS Safari, audio must be unlocked synchronously within the click execution block
        // BEFORE any 'await' interrupts the runtime stack. 
        // For Amazon Silk, we must NOT use 'await' here because that will steal the gesture 
        // needed for the subsequent getUserMedia request.
        void unlockAudio();

        let initialStream: MediaStream | undefined = undefined;
        try {
            console.log('[CurioAgentMode] Capturing initial mic stream (gesture-driven)...');
            const microphoneReady = await primeMicrophonePermission();
            if (!microphoneReady) {
                throw new DOMException('Microphone permission was not granted.', 'NotAllowedError');
            }
            // Only request audio -- camera opens on demand when user asks for vision
            initialStream = await navigator.mediaDevices.getUserMedia({ audio: LIVE_SESSION_MIC_AUDIO_CONSTRAINTS });
            console.log('[CurioAgentMode] Mic stream captured successfully.');
        } catch (err: any) {
            console.error('[CurioAgentMode] Mic capture failed:', err);
            // Provide actionable guidance on Safari where permissions are
            // controlled at two levels: browser and OS.
            if (err?.name === 'NotAllowedError') {
                const safariHint = isSafariBrowser
                    ? ' On Safari, check: Safari > Settings > Websites > Microphone, AND macOS System Settings > Privacy & Security > Microphone.'
                    : '';
                console.warn('[CurioAgentMode] Microphone access was denied.' + safariHint);
            }
        }

        // Defer greeting slightly so the AudioContext has time to stabilize
        // after getUserMedia. Playing oscillators while the audio graph is being
        // constructed in onopen causes stutter on first connect.
        setTimeout(() => {
            if (faceStyleId === 'bender' && getBenderSoundsEnabled()) {
                void loadAudioService().then(m => m.playBenderGreeting());
            } else if (faceStyleId !== 'bender') {
                void loadAudioService().then(m => m.playCurioGreeting());
            }
        }, 150);

        // Track pre-connection music state for auto-resume and pause
        markMusicStateBeforeConnect();
        pauseMusic();

        const resolvedSpeakerIdentity = await identifyResolvedSpeakerFromStream({
            enabled: speakerIdentificationEnabled,
            stream: initialStream,
            profiles: speakerProfiles,
            defaultProfileId: defaultSpeakerProfileId,
        });
        if (resolvedSpeakerIdentity) {
            applyResolvedSpeakerIdentity(resolvedSpeakerIdentity);
        }
        const activeSessionIdentity = identityContextEnabled
            ? {
                profileId: getSpeakerSessionState().activeProfileId,
                profileName: getSpeakerSessionState().activeProfileName,
                source: getSpeakerSessionState().source,
                recognizedBy: getSpeakerSessionState().recognizedBy,
                confidence: getSpeakerSessionState().confidence,
            }
            : null;

        const baseInstruction = getCurioSystemPrompt(
            userName || undefined,
            activeCity,
            tempUnit,
            currentWeather,
            currentAqi,
            resolveVoiceSearchGroundingMode(voiceBackend),
            activePersonalityPrompt,
            homeLocation,
            workLocation,
            customLocations,
            voiceRoutines,
        );

        // Fire-and-forget -- the isConnecting state drives UI feedback.
        // Awaiting here blocks the main thread and causes a visible freeze.
        void connect(
            'global',
            handler,
            identityContextEnabled
                ? appendSpeakerContextToInstruction(baseInstruction, activeSessionIdentity ?? resolvedSpeakerIdentity)
                : baseInstruction,
            liveApiVoiceId || 'Aoede',
            initialStream
        );
    }, [
        connect,
        handleDisconnect,
        handler,
        isConnected,
        isConnecting,
        liveApiVoiceId,
        currentAqi,
        currentWeather,
        activeCity,
        tempUnit,
        unlockAudio,
        primeMicrophonePermission,
        userName,
        voiceBackend,
        haVoiceActive,
        haVoiceConnecting,
        offlineActive,
        customLlmVoiceActive,
        activePersonalityPrompt,
        identityContextEnabled,
        speakerIdentificationEnabled,
        defaultSpeakerProfileId,
        speakerProfiles,
        startOfflineSession,
        startCustomLLMVoiceTurn,
        stopCustomLLMVoiceSession,
        homeLocation,
        workLocation,
        customLocations,
        voiceRoutines,
        startHaVoiceSession,
    ]);

    const handleTextSubmit = useCallback((text: string) => {
        trackDashboardActivityEvent('aiMessage', {
            source: 'text',
            backend: voiceBackend,
        });
        noteSubtitleUserTurn();

        const isTextOnly = !isConnected && !offlineActive && !haVoiceActive;
        if (isTextOnly) {
            setTextOnlyActive(true);
            clearError();
        }
        if (!isConnected) {
            setOfflineUserTranscript(text);
            setOfflineModelTranscript(null);
        }

        if (voiceBackend === 'ha_voice_pipeline' && haVoiceActive) {
            setHaUserTranscript(text);
            setHaModelTranscript(null);
            void loadTranscriptAnalyzer().then(m => {
                const cardEvent = m.analyzeTranscript(text, false, 'offline');
                if (cardEvent) void resolveAndEmitCard(cardEvent, emitCardEvent);
            });
            void loadHaVoicePipeline().then(m => m.sendText(text));
            return;
        }

        if (voiceBackend === 'ha_voice_pipeline' && !haVoiceActive) {
            void (async () => {
                try {
                    void loadTranscriptAnalyzer().then(async (m) => {
                        const cardEvent = m.analyzeTranscript(text, false, 'offline');
                        if (cardEvent) void resolveAndEmitCard(cardEvent, emitCardEvent);
                    });

                    const haVoiceMod = await loadHaVoicePipeline();
                    if (!haVoiceMod.isHaVoicePipelineConnected()) {
                        const cbs: HaVoicePipelineCallbacks = {
                            onStatusChange: () => {},
                            onTranscript: () => {},
                            onIntentResult: (responseText) => {
                                if (responseText) {
                                    setOfflineModelTranscript(responseText);
                                    setOfflineSpeaking(true);
                                    void loadTranscriptAnalyzer().then(m2 => {
                                        const respCard = m2.analyzeTranscript(responseText, false, 'offline');
                                        if (respCard) handleOfflineCardEvent(respCard, emitCardEvent);
                                    });
                                }
                            },
                            onTtsUrl: (url) => {
                                const audio = new Audio(url);
                                audio.onended = () => {
                                    setOfflineSpeaking(false);
                                };
                                audio.onerror = () => {
                                    setOfflineSpeaking(false);
                                };
                                audio.play().catch(() => {
                                    setOfflineSpeaking(false);
                                });
                            },
                            onError: () => {},
                            onRunEnd: () => {
                                setOfflineSpeaking(false);
                            },
                        };
                        await haVoiceMod.connectHaVoicePipeline(cbs);
                    }
                    haVoiceMod.sendText(text);
                } catch {
                    const offlineMod = await loadOfflineSpeech();
                    offlineMod.processOfflineTextCommand(text, offlineTextCallbacks);
                }
            })();
            return;
        }

        if (voiceBackend === 'offline') {
            void (async () => {
                const offlineMod = await loadOfflineSpeech();
                try {
                    const { getHaPreparedSession } = await import('../../services/haMcpService');
                    const prepared = await getHaPreparedSession();
                    if (prepared) offlineMod.setOfflineEntityCache(prepared.entities);
                } catch { /* best effort */ }
                offlineMod.processOfflineTextCommand(text, offlineTextCallbacks);
            })();
            return;
        }

        if (voiceBackend === 'custom_llm') {
            void unlockAudio();
            void runCustomLLMTextTurn(text);
            return;
        }

        if (contextSendTextTurn(text)) {
            return;
        }

        if (isConnected) {
            pendingTextRef.current = text;
            return;
        }

        if (voiceBackend === 'liveapi' || voiceBackend === 'nova_sonic') {
            pendingTextRef.current = text;
            void handleConnectionToggle();
            return;
        }

        void (async () => {
            const offlineMod = await loadOfflineSpeech();
            try {
                    const { getHaPreparedSession } = await import('../../services/haMcpService');
                    const prepared = await getHaPreparedSession();
                    if (prepared) offlineMod.setOfflineEntityCache(prepared.entities);
                } catch { /* best effort */ }
            offlineMod.processOfflineTextCommand(text, offlineTextCallbacks);
        })();
    }, [
        clearError,
        contextSendTextTurn,
        emitCardEvent,
        haVoiceActive,
        handleConnectionToggle,
        isConnected,
        noteSubtitleUserTurn,
        offlineActive,
        offlineTextCallbacks,
        runCustomLLMTextTurn,
        unlockAudio,
        voiceBackend,
    ]);

    // Listen for wake-connect events from CurioWakeWord for HA voice mode
    // and for the custom-LLM voice flow.
    useEffect(() => {
        const handleWakeConnect = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.backend === 'ha_voice_pipeline') {
                startHaVoiceSession();
            } else if (detail?.backend === 'custom_llm') {
                void startCustomLLMVoiceTurn();
            }
        };
        window.addEventListener('curio:wake-connect', handleWakeConnect);
        return () => window.removeEventListener('curio:wake-connect', handleWakeConnect);
    }, [startHaVoiceSession, startCustomLLMVoiceTurn]);

    useEffect(() => {
        if (!canUseDesktopFloating) return undefined;
        const handleFaceCommand = (command: DesktopFaceCommand) => {
            if (command.type === 'activate') {
                if (!anySessionActive && !isConnecting && !haVoiceConnecting) {
                    void handleConnectionToggle();
                } else {
                    setShowTextInput(true);
                }
                return;
            }
            if (command.type === 'submit-text') {
                window.dispatchEvent(new CustomEvent('curio:quick-action', {
                    detail: { text: command.text },
                }));
                return;
            }
            if (command.type === 'open-settings') {
                openSettings();
                return;
            }
            if (command.type === 'stop-floating') {
                setDesktopFloatingEnabled(false);
                setDesktopFloatingActive(false);
            }
        };

        return getCurioDesktopBridge().onFaceCommand(handleFaceCommand);
    }, [
        anySessionActive,
        canUseDesktopFloating,
        handleConnectionToggle,
        haVoiceConnecting,
        isConnecting,
        openSettings,
    ]);

    const handleStartFloatingFace = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!canUseDesktopFloating) return;
        setDesktopFloatingEnabled(true);
        setDesktopFloatingActive(true);
        setIdleMode('dashboard');
        getCurioDesktopBridge().startFloatingFace();
    }, [canUseDesktopFloating]);

    const statusMessages = useMemo<Record<CurioState, string>>(() => ({
        idle: idleStatusPhrase,
        warmup: 'Connecting Curio...',
        listening: userName ? `Checking in, ${userName}...` : 'Listening. Talk to Curio.',
        speaking: 'Curio is speaking.',
        thinking: 'Thinking...',
        error: error || 'Curio hit a snag.',
        capturing: `Say "${selectedWakeWord.phrase}"`,
        dancing: 'Enjoying the music!'
    }), [idleStatusPhrase, userName, error, selectedWakeWord.phrase]);

    const statusPillClasses: Record<CurioState, string> = useMemo(() => ({
        idle: 'border-slate-200 bg-white/90 text-slate-600',
        warmup: 'border-amber-200 bg-amber-50/95 text-amber-700',
        listening: 'border-teal-200 bg-teal-50/95 text-teal-700',
        speaking: 'border-violet-200 bg-violet-50/95 text-violet-700',
        thinking: 'border-blue-200 bg-blue-50/95 text-blue-700',
        error: 'border-red-200 bg-red-50/95 text-red-700',
        capturing: 'border-emerald-200 bg-emerald-50/95 text-emerald-700',
        dancing: 'border-indigo-200 bg-indigo-50/95 text-indigo-700'
    }), []);

    const renderFace = (
        overrideFaceStyleId?: DashboardRobotFaceStyle,
        surface: 'face' | 'dashboard-widget' = 'face',
    ) => (
        <CurioFaceRenderer
            faceStyleId={faceStyleId}
            overrideFaceStyleId={overrideFaceStyleId}
            surface={surface}
            state={curioState}
            activeCard={activeCard}
            lowPowerMode={lowPowerMode}
            faceTrackingEnabled={faceTrackingEnabled}
            idleSleepTimeout={idleSleepTimeout}
            mediaStream={mediaStream}
            userFacingCamera={userFacingCamera}
            runtimeProfile={runtimeProfile}
            onFaceDetected={handleFaceDetected}
            onFaceTrackingSample={handleFaceTrackingSample}
            emotionHint={emotionHint}
        />
    );

    useEffect(() => {
        if (!canUseDesktopFloating || !desktopFloatingActive) return;
        const subtitleText =
            latchedModelValue ||
            effectiveModelTranscript ||
            latchedUserValue ||
            effectiveUserTranscript ||
            null;
        const subtitleSpeaker =
            latchedModelValue || effectiveModelTranscript
                ? 'model'
                : latchedUserValue || effectiveUserTranscript
                    ? 'user'
                    : null;
        getCurioDesktopBridge().publishFaceSnapshot({
            faceStyleId,
            state: curioState,
            activeCard,
            emotionHint,
            lowPowerMode,
            faceTrackingEnabled,
            idleSleepTimeout,
            themeMode,
            robotFaceScale: desktopFaceScale,
            faceTrackingSample: null,
            speakerName: speakerSession.activeProfileName,
            subtitleText,
            subtitleSpeaker,
            isConnected: anySessionActive,
            isConnecting: isConnecting || haVoiceConnecting,
            isSpeaking: effectiveIsSpeaking,
        });
    }, [
        activeCard,
        anySessionActive,
        canUseDesktopFloating,
        curioState,
        desktopFaceScale,
        desktopFloatingActive,
        effectiveModelTranscript,
        effectiveIsSpeaking,
        effectiveUserTranscript,
        emotionHint,
        faceStyleId,
        faceTrackingEnabled,
        haVoiceConnecting,
        idleSleepTimeout,
        isConnecting,
        latchedModelValue,
        latchedUserValue,
        lowPowerMode,
        speakerSession.activeProfileName,
        themeMode,
    ]);

    const dashboardFaceSlot = showDashboard ? (
        (robotFaceStyle?: DashboardRobotFaceStyle) => (
        <div className="w-full h-full flex flex-col items-center justify-center relative pointer-events-auto">
            <div className="flex items-center justify-center h-full w-full">
                {renderFace(robotFaceStyle, 'dashboard-widget')}
            </div>
        </div>
        )
    ) : undefined;

    return (
        <div
            className={`curio-pwa-shell relative flex w-full flex-col overflow-hidden transition-colors duration-500 ${bgIsDark ? 'text-white' : 'text-slate-900'} ${appBackgroundStyle === 'default' && (showDashboard || (!isBenderFullscreen && faceStyleId !== 'kiro')) ? (themeMode === 'dark' ? 'bg-gradient-to-b from-[#0f172a] via-[#020617] to-black' : 'bg-gradient-to-b from-[#F0F4F8] to-[#E1E8EF]') : ''}`}
            style={appBackgroundStyle !== 'default' ? appBackgroundCss : !showDashboard && isBenderFullscreen ? { background: BENDER_BG_VALUE } : !showDashboard && faceStyleId === 'kiro' ? { background: KIRO_BG_VALUE } : undefined}
            data-theme={themeMode}
            onClick={() => setControlsVisible(v => !v)}
        >
            {screensaverActive && (
                <Suspense fallback={null}>
                    <div className="absolute inset-0 z-[100]">
                        <LazyScreensaver
                            onDismiss={resetIdleTimer}
                            weather={currentWeather}
                            aqi={currentAqi}
                            lowPowerMode={lowPowerMode}
                            runtimeProfile={runtimeProfile}
                        />
                    </div>
                </Suspense>
            )}

            <UpdateNotification />
            <InsecureContextBanner />

            {wakeWordEnabled && (
                <Suspense fallback={null}>
                    <LazyCurioWakeWord />
                </Suspense>
            )}
            {/* Refined minimalist background -- skip blur on low-power devices */}
            {!showDashboard && !lowPowerMode && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-white/20 rounded-full blur-3xl opacity-60" />
                <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/20 rounded-full blur-3xl opacity-60" />
            </div>
            )}

            {!showDashboard && (
                <CurioFaceControls
                    visible={controlsVisible}
                    isConnected={isConnected}
                    isSpeaking={isSpeaking}
                    themeMode={themeMode}
                    cameraEnabled={cameraEnabled}
                    canFlipCamera={canFlipCamera}
                    isMuted={isMuted}
                    speakerMuted={speakerMuted}
                    bgIsDark={bgIsDark}
                    canUseDesktopFloating={canUseDesktopFloating}
                    desktopFloatingActive={desktopFloatingActive}
                    onToggleTheme={() => setThemeMode(themeMode === 'light' ? 'dark' : 'light')}
                    onToggleCamera={() => { void toggleCamera(); }}
                    onFlipCamera={() => { void flipCamera(); }}
                    onToggleMicMuted={() => setIsMuted(!isMuted)}
                    onToggleSpeakerMuted={() => setSpeakerMuted(!speakerMuted)}
                    onStartFloatingFace={handleStartFloatingFace}
                    onOpenDashboardMode={handleOpenDashboardMode}
                    onOpenSettings={handleOpenSettings}
                    onPointerOpenSettings={handlePointerOpenSettings}
                />
            )}

            {showSettings && (
                <Suspense fallback={null}>
                    <LazyCurioSettingsModal
                        open={showSettings}
                        onClose={handleCloseSettings}
                        onRefreshWeather={handleRefreshWeather}
                        subtitlesEnabled={subtitlesEnabled}
                        setSubtitlesEnabled={setSubtitlesEnabled}
                        unlockAudio={unlockAudio}
                        primeAllPermissions={primeAllPermissions}
                    />
                </Suspense>
            )}

            {/* Mini Player Indicator */}
            <MusicMiniPlayer
                playbackState={playbackState}
                isMusicCardVisible={isMusicCardVisible}
                isPlayingOrPaused={isPlayingOrPaused}
            />

            <div className={`absolute inset-0 z-0 flex items-center justify-center pointer-events-none ${isBenderFullscreen ? '' : ''}`}>
                {showDashboard ? (
                    <div className="flex h-full w-full pointer-events-auto">
                        <Suspense fallback={null}>
                            <LazyDashboard weather={currentWeather} aqi={currentAqi} faceSlot={dashboardFaceSlot}
                                connectionLabel={connectionUiState.label}
                                connectionActive={connectionUiState.active}
                                connectionBusy={connectionUiState.busy}
                                onToggleConnection={() => { void handleConnectionToggle(); }}
                                cameraEnabled={cameraEnabled}
                                canFlipCamera={canFlipCamera}
                                onToggleCamera={toggleCamera}
                                onFlipCamera={flipCamera}
                                isMuted={isMuted}
                                onToggleMute={() => setIsMuted(!isMuted)}
                                onOpenSettings={openSettings}
                                textInputVisible={showTextInput}
                                onToggleTextInput={toggleTextInputVisibility}
                            />
                        </Suspense>
                    </div>
                ) : (
                    <div
                        className={`flex items-center justify-center pointer-events-auto ${isBenderFullscreen ? 'h-full w-full' : 'face-container'}`}
                        style={{
                            transform: `scale(${robotFaceScale / 100})`,
                            transformOrigin: 'center center',
                            transition: 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
                        }}
                    >
                        {renderFace()}
                    </div>
                )}
            </div>

            {/* Digital Clock -- top left */}
            {showClockWidget && (
                <div className="max-sm:scale-75 max-sm:origin-top-left">
                    <CurioClock lowPowerMode={lowPowerMode} />
                </div>
            )}

            {/* Weather Widget -- top right */}
            {showWeatherWidget && (
                <div className="max-sm:scale-75 max-sm:origin-top-right">
                    <CurioWeatherWidget
                        weather={currentWeather}
                        aqi={currentAqi}
                        tempUnit={tempUnit}
                        lowPowerMode={lowPowerMode}
                    />
                </div>
            )}
            {/* Voice Waveform (New per Stitch design) */}
            {anySessionActive && effectiveIsSpeaking && showVoiceWaveform && (
                <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none h-20 sm:h-32">
                    <VoiceWaveform
                        isSpeaking={effectiveIsSpeaking}
                        isConnected={anySessionActive}
                        lowPowerMode={lowPowerMode}
                    />
                </div>
            )}

            <CurioStatusStack
                idlePromptPosition={idlePromptPosition}
                isMiniPlayerActive={isMiniPlayerActive}
                connectButtonPosition={connectButtonPosition}
                homeFaceDetected={homeFaceDetected}
                faceIdentityFeedback={faceIdentityFeedback}
                showDashboard={showDashboard}
                isConnected={isConnected}
                isConnecting={isConnecting}
                offlineActive={offlineActive}
                haVoiceActive={haVoiceActive}
                showTranscript={showTranscript}
                showIdlePrompt={showIdlePrompt}
                idlePromptScale={idlePromptScale}
                curioState={curioState}
                statusMessage={statusMessages[curioState]}
                statusPillClass={statusPillClasses[curioState]}
                renderStatusWithWakeWord={renderStatusWithWakeWord}
            />

            {/* Transcript Overlay -- premium floating panels, bottom-centered */}
            <CurioTranscriptOverlay
                showTranscript={showTranscript}
                showTextInput={showTextInput}
                effectiveUserTranscript={effectiveUserTranscript}
                effectiveModelTranscript={effectiveModelTranscript}
                latchedUserValue={latchedUserValue}
                latchedModelValue={latchedModelValue}
                effectiveIsSpeaking={effectiveIsSpeaking}
            />

            {/* Text Input -- refined command bar with motion */}
            <CurioTextInputBar
                visible={showTextInput}
                formRef={textInputFormRef}
                placeholder={voiceBackend !== 'liveapi' && voiceBackend !== 'nova_sonic' ? 'Type a command...' : isConnected ? 'Message Curio...' : 'Type a command...'}
                onSubmitText={handleTextSubmit}
            />

            {/* Connect Controls */}
            <CurioConnectControls
                showDashboard={showDashboard}
                connectButtonPosition={connectButtonPosition}
                isMiniPlayerActive={isMiniPlayerActive}
                controlsVisible={controlsVisible}
                wakeWordEnabled={wakeWordEnabled}
                connectButtonScale={connectButtonScale}
                connectionActive={connectionUiState.active}
                connectionBusy={connectionUiState.busy}
                connectionLabel={connectionUiState.label}
                onToggleConnection={() => { void handleConnectionToggle(); }}
            />

            {/* Chat toggle button -- anchored above Safari/PWA bottom chrome */}
            {!showDashboard && (
                <button
                    type="button"
                    onPointerDown={handleTextInputTogglePointerDown}
                    onClick={handleTextInputToggleClick}
                    className="absolute curio-face-chat-hotspot flex items-center justify-center rounded-full bg-transparent p-0"
                    aria-label="Toggle text input"
                >
                    <span
                        className={`curio-face-chat-toggle flex items-center justify-center w-11 h-11 rounded-full shadow-lg transition-all active:scale-90 ${showTextInput
                            ? 'bg-slate-800 text-white shadow-slate-400/30'
                            : 'bg-white/80 text-slate-500 hover:bg-white shadow-black/10'
                        }`}
                    >
                        <MessageSquare size={20} />
                    </span>
                </button>
            )}

            {/* Version Display -- bottom center */}
            <div className="absolute left-1/2 -translate-x-1/2 z-10 text-[9px] font-medium tracking-tight text-white/20 pointer-events-none curio-face-version-label">
                v{__APP_VERSION__}
            </div>

            <CurioCameraPreview
                cameraEnabled={cameraEnabled}
                canFlipCamera={canFlipCamera}
                previewVideoRef={previewVideoRef}
                userFacingCamera={userFacingCamera}
                onFlipCamera={() => { void flipCamera(); }}
                onCloseCamera={() => { void toggleCamera(false); }}
            />
            {/* Dev-only card debug panel */}
            {LazyCardDebugPanel && (
                <Suspense fallback={null}>
                    <LazyCardDebugPanel />
                </Suspense>
            )}
        </div>
    );
};

export default CurioAgentMode;
