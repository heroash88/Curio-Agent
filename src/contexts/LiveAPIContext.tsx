import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { LiveClient, LiveState } from '../services/liveApiLive';
import type { NovaClient } from '../services/novaLive';
import type { LiveState as NovaLiveState } from '../services/novaLive';
import { getApiKeyAsync, getGeminiLiveModel, getNovaApiKeyAsync, getNovaVoice } from '../services/ai/config';
import { AppMode as GlobalAppMode } from '../hooks/useAppMode';
import { unlockAudioContext, isSafariBrowser } from '../services/audioContext';
import { resetHaMcpRuntimeStatus, setHaMcpRuntimeStatus } from '../utils/haMcpRuntimeStatus';
import { useRuntimePerformanceProfile } from '../services/runtimePerformanceProfile';
import { setVolume } from '../services/volumeStore';
import { revokeProcessorBlobUrls } from '../services/audioWorkletCapture';
import { revokeNovaProcessorBlobUrls } from '../services/novaAudioWorklet';
import { revokeAllCustomWakeWordBlobUrls } from '../services/customWakeWordStore';
import { getSessionMicRestoreMode } from '../services/browserIdlePolicy';
import {
    useHaMcpEnabled,
    useHaMcpToken,
    useHaMcpUrl,
    useHaApiMode,
    getHaMcpTokenAsync,
    useGenericMcpServers,
    useMuteMicWhileAiSpeaking,
    useWakeWordEnabled,
    useLowPowerMode,
    useSpeakerMuted,
    useVoiceBackend,
    useClearVoiceEnabled,
    useVoiceGateThreshold,
} from '../utils/settingsStorage';
import { stopListening, isListening } from '../services/wakeWordService';
import { useCameraCapture } from '../hooks/useCameraCapture';
import { LIVE_SESSION_MIC_AUDIO_CONSTRAINTS } from '../services/sessionMicConstraints';



import type { LiveModuleMode as LiveAppMode } from '../services/liveSessionConfig';
import type { FunctionDeclaration } from '@google/genai';
import { CardManagerProvider, useCardManager } from './CardManagerContext';
import { TimerTickProvider } from '../hooks/useTimerTick';
import CardStack from '../components/cards/CardStack';
import DesktopCardBridgeHost from '../components/desktop/DesktopCardBridgeHost';
import type { CardEvent } from '../services/cardTypes';

let liveClientModulePromise: Promise<typeof import('../services/liveApiLive')> | null = null;

const loadLiveClientModule = () => {
    if (!liveClientModulePromise) {
        liveClientModulePromise = import('../services/liveApiLive');
    }

    return liveClientModulePromise;
};

let novaClientModulePromise: Promise<typeof import('../services/novaLive')> | null = null;

const loadNovaClientModule = () => {
    if (!novaClientModulePromise) {
        novaClientModulePromise = import('../services/novaLive');
    }
    return novaClientModulePromise;
};

const isHomeAssistantOauthCallbackInFlight = () => {
    if (typeof window === 'undefined') {
        return false;
    }

    const params = new URLSearchParams(window.location.search);
    const hasOauthCallbackParams = Boolean(params.get('code') && params.get('state'));
    const hasPendingOauthState = Boolean(
        localStorage.getItem('curio_ha_oauth_state_pending') &&
        localStorage.getItem('curio_ha_oauth_verifier_pending') &&
        localStorage.getItem('curio_ha_auth_url_pending'),
    );

    return hasOauthCallbackParams && hasPendingOauthState;
};

interface LiveAPIContextType {
    isConnected: boolean;
    isConnecting: boolean;
    isSpeaking: boolean;
    error: string | null;
    client: LiveClient | NovaClient | null;
    transcript: string | null;
    userTranscript: string | null;
    modelTranscript: string | null;
    transcriptHistory: Array<{ speaker: 'user' | 'model', text: string }>;
    globalMode: GlobalAppMode | null;
    setGlobalMode: (mode: GlobalAppMode) => void;
    globalNavigate: ((mode: GlobalAppMode) => void) | null;
    setGlobalNavigate: (fn: (mode: GlobalAppMode) => void) => void;
    connect: (mode: LiveAppMode, handler?: any, systemInstruction?: string, voiceName?: string, initialStream?: MediaStream) => Promise<void>;
    disconnect: () => Promise<void>;
    reconnectWithContext: (mode: LiveAppMode, handler?: any, systemInstruction?: string, voiceName?: string) => Promise<void>;
    updateContext: (mode: LiveAppMode, handler?: any, systemInstruction?: string, voiceName?: string) => Promise<void>;
    unlockAudio: () => Promise<boolean>;
    primeCameraPermission: () => Promise<boolean>;
    primeMicrophonePermission: () => Promise<boolean>;
    primeAllPermissions: () => Promise<{ camera: boolean; microphone: boolean }>;
    
    // Camera state
    cameraEnabled: boolean;
    userFacingCamera: boolean;
    canFlipCamera: boolean;
    showCameraPreview: boolean;
    mediaStream: MediaStream | null;
    audioInputStream: MediaStream | null;
    
    // Camera controls
    setCameraEnabled: (enabled: boolean) => void;
    setShowCameraPreview: (show: boolean) => void;
    toggleCamera: (enabled?: boolean) => Promise<CameraToggleResult>;
    flipCamera: () => Promise<CameraToggleResult>;
    isMuted: boolean;
    setIsMuted: (muted: boolean) => void;
    resumptionToken: string | null;
    resetSession: () => void;
    /** Clear only the Gemini resumption handle -- keeps transcript history. */
    clearResumptionToken: () => void;
    /** Clear any stale connection error (e.g. when switching to offline mode). */
    clearError: () => void;
    /** Send a text turn using the internal client ref (avoids stale closure issues). */
    sendTextTurn: (text: string) => boolean;
    /** Send a silent system note to the model (no user-facing response). */
    sendSystemNote: (text: string) => boolean;
}

type LiveAPIStreamingContextType = Pick<
    LiveAPIContextType,
    'isSpeaking' | 'transcript' | 'userTranscript' | 'modelTranscript' | 'transcriptHistory'
>;

type LiveAPIControlsContextType = Omit<LiveAPIContextType, keyof LiveAPIStreamingContextType>;

const LiveAPIControlsContext = createContext<LiveAPIControlsContextType | undefined>(undefined);
const LiveAPIStreamingContext = createContext<LiveAPIStreamingContextType | undefined>(undefined);
const SESSION_RESUMPTION_TOKEN_KEY = 'curio_session_resumption_token';
const TRANSCRIPT_HISTORY_KEY = 'curio_transcript_history';
/** Cap transcript history to prevent unbounded memory growth during long sessions. */
const MAX_TRANSCRIPT_HISTORY = 50;
type CameraToggleResult = {
    success: boolean;
    enabled: boolean;
    error?: string;
    frameReady?: boolean;
    framesCaptured?: number;
    facingMode?: 'user' | 'environment';
    canFlipCamera?: boolean;
};

export const LiveAPIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const haMcpEnabled = useHaMcpEnabled();
    const haMcpUrl = useHaMcpUrl();
    const haMcpToken = useHaMcpToken();
    const haApiMode = useHaApiMode();
    const genericMcpServers = useGenericMcpServers();
    const muteMicWhileAiSpeaking = useMuteMicWhileAiSpeaking();
    const wakeWordEnabled = useWakeWordEnabled();
    const lowPowerMode = useLowPowerMode();
    const speakerMuted = useSpeakerMuted();
    const voiceBackend = useVoiceBackend();
    const clearVoiceEnabled = useClearVoiceEnabled();
    const voiceGateThreshold = useVoiceGateThreshold();



    const [clientInstance, setClientInstance] = useState<LiveClient | NovaClient | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [desktopCardsExternalized, setDesktopCardsExternalized] = useState(false);

    const [isConnecting, setIsConnecting] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const runtimeProfile = useRuntimePerformanceProfile({
        lowPowerMode,
        isConnected,
        isConnecting,
        wakeWordEnabled,
    });

    // --- Audio-Reactive Volume ---
    // Reads RMS from the AnalyserNode attached to the TTS audio stream and
    // writes volume to the shared store so VoiceWaveform + CurioFace can
    // read it each animation frame without forcing style recalculation.
    useEffect(() => {
        const analyserNode = clientInstance ? (clientInstance as any).analyserNode as AnalyserNode | null : null;
        if (!analyserNode || !isSpeaking) {
            setVolume(0);
            return;
        }
        let animationFrameId: number;
        const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
        const updateVolume = () => {
            analyserNode.getByteTimeDomainData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const diff = dataArray[i] - 128;
                sum += diff * diff;
            }
            const rms = Math.sqrt(sum / dataArray.length);
            const volume = Math.min(1, rms / 48);
            const smoothedVolume = Math.max(0.05, volume);
            setVolume(smoothedVolume);
            animationFrameId = requestAnimationFrame(updateVolume);
        };
        updateVolume();
        return () => {
            cancelAnimationFrame(animationFrameId);
            setVolume(0);
        };
    }, [clientInstance, isSpeaking]);

    const [error, setError] = useState<string | null>(null);
    const [transcript, setTranscript] = useState<string | null>(null);
    const [userTranscript, setUserTranscript] = useState<string | null>(null);
    const [modelTranscript, setModelTranscript] = useState<string | null>(null);
    const [transcriptHistory, setTranscriptHistory] = useState<Array<{ speaker: 'user' | 'model', text: string }>>(() => {
        const saved = localStorage.getItem(TRANSCRIPT_HISTORY_KEY);
        try {
            const parsed = saved ? JSON.parse(saved) : [];
            return parsed.length > MAX_TRANSCRIPT_HISTORY ? parsed.slice(-MAX_TRANSCRIPT_HISTORY) : parsed;
        } catch {
            return [];
        }
    });

    const [resumptionToken, setResumptionToken] = useState<string | null>(() => 
        localStorage.getItem(SESSION_RESUMPTION_TOKEN_KEY)
    );

    useEffect(() => {
        // Debounce localStorage writes to avoid serializing on every transcript chunk
        const timeoutId = setTimeout(() => {
            localStorage.setItem(TRANSCRIPT_HISTORY_KEY, JSON.stringify(transcriptHistory));
        }, 1000);
        return () => clearTimeout(timeoutId);
    }, [transcriptHistory]);

    useEffect(() => {
        if (resumptionToken) {
            localStorage.setItem(SESSION_RESUMPTION_TOKEN_KEY, resumptionToken);
        } else {
            localStorage.removeItem(SESSION_RESUMPTION_TOKEN_KEY);
        }
    }, [resumptionToken]);
    const [globalMode, setGlobalMode] = useState<GlobalAppMode | null>(null);
    const [globalNavigate, setGlobalNavigate] = useState<((mode: GlobalAppMode) => void) | null>(null);
    const isReconnectingRef = useRef(false);
    const connectionStateRef = useRef<'disconnected' | 'connecting' | 'connected' | 'disconnecting'>('disconnected');
    const connectionAttemptIdRef = useRef(0);
    const disconnectPromiseRef = useRef<Promise<void> | null>(null);
    const clientRef = useRef<LiveClient | NovaClient | null>(null);
    const lastSpeechEndedAtRef = useRef<number>(0);
    // Ref so the setInterval closure always sees the latest isSpeaking value
    const isSpeakingRef = useRef(false);

    // Card event emitter ref — bridged to CardManagerContext via CardEventBridge
    const cardEventEmitterRef = useRef<((event: CardEvent) => void) | null>(null);

    // --- Camera State (extracted to useCameraCapture hook) ---
    const [isMuted, setIsMuted] = useState(false);

    const sendVideoFrameToClient = useCallback((base64: string): boolean => {
        if (!clientRef.current) return false;
        try { clientRef.current.sendVideoFrame(base64); return true; } catch { return false; }
    }, []);
    const isSessionConnected = useCallback(() => connectionStateRef.current === 'connected' && !!clientRef.current, []);

    const {
        cameraEnabled, userFacingCamera, canFlipCamera, showCameraPreview, mediaStream,
        setCameraEnabled, setShowCameraPreview, toggleCamera, flipCamera, stopCamera,
        primeCameraPermission, primeMicrophonePermission, primeAllPermissions,
        normalizeInitialStreamForSession,
    } = useCameraCapture({ sendVideoFrame: sendVideoFrameToClient, isSpeakingRef, isSessionConnected });

    const audioStreamRef = useRef<MediaStream | null>(null);
    const [audioInputStream, setAudioInputStream] = useState<MediaStream | null>(null);
    const micPermissionPrimedRef = useRef(false);
    
    // Keep refs in sync so the capture interval closure and stable callbacks never see a stale value
    useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

    const resetSession = useCallback(() => {
        setResumptionToken(null);
        setTranscriptHistory([]);
        localStorage.removeItem(SESSION_RESUMPTION_TOKEN_KEY);
        localStorage.removeItem(TRANSCRIPT_HISTORY_KEY);
    }, []);

    // Clear only the Gemini session resumption handle. Transcript history is
    // preserved and re-seeded on the next connect, so the AI still remembers
    // the earlier conversation -- it just won't replay the in-flight turn
    // (useful after a proactive disconnect like music autoplay).
    const clearResumptionToken = useCallback(() => {
        setResumptionToken(null);
        localStorage.removeItem(SESSION_RESUMPTION_TOKEN_KEY);
    }, []);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    // Forward card-state changes to the connected client as silent system
    // notes so the AI knows what's currently on screen and doesn't repeat
    // information the user is already seeing.
    useEffect(() => {
        const handleCardsChanged = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (!detail || !clientRef.current) return;
            if (connectionStateRef.current !== 'connected') return;
            const client = clientRef.current as { sendSystemNote?: (text: string) => void };
            if (typeof client.sendSystemNote === 'function') {
                client.sendSystemNote(`Cards on screen (${detail.count}): ${detail.summary}. Do not re-describe card contents unless the user asks.`);
            }
        };
        window.addEventListener('curio:cards-changed', handleCardsChanged);
        return () => window.removeEventListener('curio:cards-changed', handleCardsChanged);
    }, []);

    // Forward mic-gain slider changes to the live client without restarting
    // the audio graph. The service-level wake-word service has its own listener;
    // this covers the Gemini Live capture path.
    useEffect(() => {
        const handleGainChange = (e: Event) => {
            const detail = (e as CustomEvent<{ db: number }>).detail;
            if (!detail || !clientRef.current) return;
            const client = clientRef.current as { setInputGainDb?: (db: number) => void };
            if (typeof client.setInputGainDb === 'function') {
                client.setInputGainDb(detail.db);
            }
        };
        window.addEventListener('curio:mic-gain-changed', handleGainChange);
        return () => window.removeEventListener('curio:mic-gain-changed', handleGainChange);
    }, []);


    useEffect(() => {
        let isCancelled = false;

        if (wakeWordEnabled && runtimeProfile.allowDisconnectedPreload) {
            void loadLiveClientModule();
        }

        if (!haMcpEnabled || !haMcpUrl || !haMcpToken) {
            if (connectionStateRef.current === 'disconnected') {
                resetHaMcpRuntimeStatus();
            }
            return () => {
                isCancelled = true;
            };
        }

        if (!runtimeProfile.allowDisconnectedPreload) {
            if (connectionStateRef.current === 'disconnected') {
                resetHaMcpRuntimeStatus();
            }
            return () => {
                isCancelled = true;
            };
        }

        if (isHomeAssistantOauthCallbackInFlight()) {
            if (connectionStateRef.current === 'disconnected') {
                setHaMcpRuntimeStatus('checking');
            }
            return () => {
                isCancelled = true;
            };
        }

        // Detect mixed content early: HTTPS page cannot fetch HTTP HA instance
        if (typeof window !== 'undefined' && window.location.protocol === 'https:' && haMcpUrl.startsWith('http://')) {
            if (connectionStateRef.current === 'disconnected') {
                setHaMcpRuntimeStatus(
                    'error',
                    'Mixed content blocked: HTTPS app cannot connect to HTTP Home Assistant. ' +
                    'Enable HTTPS on HA or access Curio over HTTP (e.g. via the HA add-on).',
                );
            }
            return () => {
                isCancelled = true;
            };
        }

        const preloadHomeAssistant = async () => {
            if (connectionStateRef.current === 'disconnected') {
                setHaMcpRuntimeStatus('checking');
            }

            try {
                const { prepareHomeAssistantMcpSession } = await import('../services/haMcpService');
                await prepareHomeAssistantMcpSession(haMcpUrl, await getHaMcpTokenAsync(), { silent: true, apiMode: haApiMode });

                if (!isCancelled && connectionStateRef.current === 'disconnected') {
                    setHaMcpRuntimeStatus('connected');
                }
            } catch (preloadError: any) {
                if (!isCancelled && connectionStateRef.current === 'disconnected') {
                    setHaMcpRuntimeStatus(
                        'error',
                        preloadError?.message || 'Failed to preload Home Assistant tools.',
                    );
                }
            }
        };

        void preloadHomeAssistant();

        return () => {
            isCancelled = true;
        };
    }, [haMcpEnabled, haMcpToken, haMcpUrl, runtimeProfile.allowDisconnectedPreload, wakeWordEnabled]);
    
    // Sync the "Mute Mic While Speaking" setting to the current client instance if it exists
    useEffect(() => {
        if (clientRef.current) {
            clientRef.current.muteMicWhileSpeaking = muteMicWhileAiSpeaking;
        }
    }, [muteMicWhileAiSpeaking]);

    useEffect(() => {
        if (clientRef.current) {
            clientRef.current.speakerMuted = speakerMuted;
        }
    }, [speakerMuted]);

    // Sync isMuted state to the live client and handle hardware lifecycle
    useEffect(() => {
        const syncMuteState = async () => {
            if (clientRef.current) {
                clientRef.current.isMuted = isMuted;
            }

            if (isMuted) {
                console.log('[LiveAPIContext] Mic Muted: Disabling audio tracks.');

                // Send audioStreamEnd to flush any cached audio on the server side
                // before we mute. This prevents stale buffered audio
                // from being processed after the mic is re-enabled.
                if (clientRef.current && isConnected) {
                    clientRef.current.sendAudioStreamEnd();
                }

                // SAFARI FIX: Instead of stopping tracks (which releases
                // hardware and requires a new getUserMedia call to re-acquire),
                // just disable them. The mic stays acquired but stops sending
                // audio data. This avoids the Safari restriction that
                // getUserMedia must be called from a user gesture handler.
                const activeAudioStream = audioStreamRef.current;
                if (activeAudioStream) {
                    activeAudioStream.getAudioTracks().forEach(track => {
                        track.enabled = false;
                    });
                }

                if (isListening()) {
                    console.log('[LiveAPIContext] Stopping wake word due to mute.');
                    stopListening();
                }
            } else {
                // Unmuting: only restore the session-owned mic while a session is
                // active. Idle wake-word mode owns its own raw stream separately.
                const existingStream = audioStreamRef.current;
                const audioTracks = existingStream?.active ? existingStream.getAudioTracks() : [];
                const hasLiveTracks = audioTracks.some((track) => track.readyState === 'live');
                const restoreMode = getSessionMicRestoreMode({
                    isConnected,
                    isConnecting,
                    hasExistingLiveTracks: hasLiveTracks,
                });

                if (restoreMode === 'defer') {
                    console.log('[LiveAPIContext] Mic Unmuted (Idle): Deferring microphone ownership to wake word runtime.');
                    return;
                }

                if (restoreMode === 'reuse_existing' && existingStream) {
                    console.log('[LiveAPIContext] Mic Unmuted: Re-enabling existing session tracks.');
                    audioTracks.forEach(track => { track.enabled = true; });
                    setAudioInputStream(existingStream);
                    return;
                }

                // Fallback: stream was already dead (e.g. disconnect killed it),
                // need to re-acquire. On Safari this will only work if a prior
                // user gesture has already granted permission.
                console.log('[LiveAPIContext] Mic Unmuted (Active Session): Re-acquiring hardware stream.');

                try {
                    const freshStream = await navigator.mediaDevices.getUserMedia({
                        audio: LIVE_SESSION_MIC_AUDIO_CONSTRAINTS
                    });
                    audioStreamRef.current = freshStream;
                    setAudioInputStream(freshStream);

                    // Update active AI session if one is running
                    if (clientRef.current) {
                        clientRef.current.updateAudioStream(freshStream);
                    }
                } catch (err: any) {
                    console.error('[LiveAPIContext] Failed to re-acquire mic on unmute:', err);
                    setError(
                        isSafariBrowser && err?.name === 'NotAllowedError'
                            ? "Microphone access denied. Check Safari > Settings > Websites > Microphone AND macOS System Settings > Privacy & Security > Microphone."
                            : "Failed to re-acquire microphone. Please check permissions."
                    );
                }
            }
        };

        void syncMuteState();
    }, [isMuted, wakeWordEnabled, isConnected, isConnecting]);




    const stopMediaStream = useCallback((stream: MediaStream | null | undefined) => {
        if (!stream) return;
        stream.getTracks().forEach(track => {
            track.stop();
            track.enabled = false;
        });
    }, []);

    const finalizeDisconnectedState = useCallback(() => {
        connectionStateRef.current = 'disconnected';
        (window as any).__curioLiveApiActive = false;
        // Always release the session mic stream — it uses echoCancellation which
        // triggers browser audio ducking on other media (YouTube music).
        const activeAudioStream = audioStreamRef.current;
        stopMediaStream(activeAudioStream);
        audioStreamRef.current = null;
        if (haMcpEnabled && haMcpUrl && haMcpToken) {
            setHaMcpRuntimeStatus('connected');
        } else {
            resetHaMcpRuntimeStatus();
        }
        if (!isReconnectingRef.current) {
            setIsConnected(false);
        }
        setIsConnecting(false);
        setIsSpeaking(false);
        setTranscript(null);
        setUserTranscript(null);
        setModelTranscript(null);
        setTranscriptHistory([]);
        setClientInstance(null);
    }, [haMcpEnabled, haMcpToken, haMcpUrl, stopMediaStream]);

    const disconnect = useCallback(async () => {
        if (disconnectPromiseRef.current) {
            await disconnectPromiseRef.current;
            return;
        }

        const disconnectAttemptId = ++connectionAttemptIdRef.current;
        const client = clientRef.current;
        const activeAudioStream = audioStreamRef.current;

        const disconnectOperation = (async () => {
            connectionStateRef.current = 'disconnecting';
            setIsConnecting(false);

            try {
                if (client) {
                    await client.disconnect();
                }
            } catch (err: any) {
                console.error("LiveAPI Context Disconnect Error:", err);
            } finally {
                // Always release the session mic stream to stop browser audio ducking.
                stopMediaStream(activeAudioStream);
                if (audioStreamRef.current === activeAudioStream) {
                    audioStreamRef.current = null;
                    setAudioInputStream(null);
                }
                if (clientRef.current === client) {
                    clientRef.current = null;
                    setClientInstance(null);
                }
                if (connectionAttemptIdRef.current === disconnectAttemptId) {
                    finalizeDisconnectedState();
                    // Always turn off the camera when the session ends
                    stopCamera();
                }
            }
        })();

        disconnectPromiseRef.current = disconnectOperation;

        try {
            await disconnectOperation;
        } finally {
            if (disconnectPromiseRef.current === disconnectOperation) {
                disconnectPromiseRef.current = null;
            }
        }
    }, [finalizeDisconnectedState, stopCamera, stopMediaStream]);

    const connect = useCallback(async (
        mode: LiveAppMode, 
        handler?: any, 
        systemInstruction?: string, 
        voiceName?: string, 
        initialStream?: MediaStream,
        forceNewSession: boolean = false
    ) => {
        if (
            connectionStateRef.current === 'connecting' ||
            connectionStateRef.current === 'connected' ||
            connectionStateRef.current === 'disconnecting'
        ) {
            await disconnect();
            await new Promise(resolve => setTimeout(resolve, 120));
        }

        const connectAttemptId = ++connectionAttemptIdRef.current;
        let connectionTimeout: ReturnType<typeof setTimeout> | null = null;
        let initialMicStream: MediaStream | undefined = initialStream
            ? normalizeInitialStreamForSession(initialStream)
            : undefined;
        let client: LiveClient | NovaClient | null = null;

        const isLatestConnectAttempt = () => connectionAttemptIdRef.current === connectAttemptId;
        const isCurrentConnectAttempt = () =>
            isLatestConnectAttempt() &&
            (connectionStateRef.current === 'connecting' || connectionStateRef.current === 'connected');

        const clearConnectionTimeout = () => {
            if (connectionTimeout !== null) {
                clearTimeout(connectionTimeout);
                connectionTimeout = null;
            }
        };

        const releaseConnectStream = () => {
            stopMediaStream(initialMicStream);
            if (audioStreamRef.current === initialMicStream) {
                audioStreamRef.current = null;
                setAudioInputStream(null);
            }
        };

        const abandonIfStale = async () => {
            if (isCurrentConnectAttempt()) return false;
            clearConnectionTimeout();
            if (client) {
                try {
                    await client.disconnect();
                } catch (disconnectError) {
                    console.warn('[LiveAPIContext] Failed to clean up abandoned client:', disconnectError);
                }
                if (clientRef.current === client) {
                    clientRef.current = null;
                    setClientInstance(null);
                }
            }
            releaseConnectStream();
            return true;
        };

        connectionStateRef.current = 'connecting';
        setIsConnecting(true);
        setError(null);

        // Safety timeout - if connection hasn't changed from connecting in 10s, reset it
        connectionTimeout = setTimeout(() => {
          if (isLatestConnectAttempt() && connectionStateRef.current === 'connecting') {
            console.warn("[LiveAPIContext] Connection timed out, resetting state.");
            finalizeDisconnectedState();
            // Provide specific guidance based on likely cause
            const hasApiKey = !!localStorage.getItem('curio_gemini_api_key');
            if (!hasApiKey) {
              setError("No API key configured. Please add your Gemini API key in Settings.");
            } else if (!navigator.onLine) {
              setError("You appear to be offline. Check your internet connection and try again.");
            } else {
              setError("Connection timed out. This may be a network issue or an invalid API key. Check Settings and try again.");
            }
          }
        }, 12000);

        try {
            // Use the provided initialStream if available, otherwise try to capture a new one.
            // On strict browsers like Silk, the initialStream must be acquired 
            // in the very first line of the onClick handler.
            if (!initialMicStream && navigator.mediaDevices?.getUserMedia) {
                console.log('[LiveAPIContext] No initial stream provided, attempting to capture mic stream...');
                try {
                    initialMicStream = await navigator.mediaDevices.getUserMedia({
                        audio: LIVE_SESSION_MIC_AUDIO_CONSTRAINTS
                    });
                    micPermissionPrimedRef.current = true;
                    void unlockAudioContext();
                    console.log('[LiveAPIContext] Successfully captured mic stream inside connect fallback.');
                } catch (micErr: any) {
                    console.warn('[LiveAPIContext] Failed to capture mic stream during connect fallback:', micErr);
                    if (isSafariBrowser && micErr?.name === 'NotAllowedError') {
                        console.warn(
                            '[LiveAPIContext] Safari mic permission denied. Check Safari > Settings > Websites > Microphone ' +
                            'AND macOS System Settings > Privacy & Security > Microphone.'
                        );
                    }
                }
            } else if (initialMicStream) {
                console.log('[LiveAPIContext] Using pre-acquired initial stream.');
                // We assume audio context is already being unlocked in parallel or sequence 
                // in the gesture handler, but let's ensure it here just in case.
                void unlockAudioContext();
                micPermissionPrimedRef.current = true;
            }

            audioStreamRef.current = initialMicStream ?? null;
            setAudioInputStream(initialMicStream ?? null);

            if (await abandonIfStale()) return;

            const apiKey = await getApiKeyAsync();

            if (await abandonIfStale()) return;

            if (!apiKey && voiceBackend !== 'nova_sonic') {
                releaseConnectStream();
                throw new Error("No Gemini API key found. Please add it in settings.");
            }

            // --- Home Assistant MCP Integration ---
            let mcpTools: FunctionDeclaration[] = [];
            let haClient: any = null;
            let haInstructionSuffix = "";
            
            if (haMcpEnabled && haMcpUrl && haMcpToken) {
                    console.log('[LiveAPIContext] HA MCP Enabled, initializing...');
                    setHaMcpRuntimeStatus('checking');
                    try {
                        const { prepareHomeAssistantMcpSession } = await import('../services/haMcpService');
                        const preparedHomeAssistant = await prepareHomeAssistantMcpSession(
                            haMcpUrl,
                            await getHaMcpTokenAsync(),
                            { apiMode: haApiMode },
                        );
                        haClient = preparedHomeAssistant.client;
                        mcpTools = preparedHomeAssistant.tools;
                        console.log(`[LiveAPIContext] Loaded ${mcpTools.length} HA tools:`, preparedHomeAssistant.toolNames);
                        
                        if (mcpTools.length > 0) {
                            setHaMcpRuntimeStatus('connected');
                            haInstructionSuffix = preparedHomeAssistant.instructionSuffix;
                        } else {
                            setHaMcpRuntimeStatus('error', 'No Home Assistant tools were returned.');
                        }
                    } catch (e: any) {
                        setHaMcpRuntimeStatus('error', e?.message || 'Failed to load Home Assistant tools.');
                        console.error('[LiveAPIContext] Failed to load HA MCP tools:', e);
                    }
            } else {
                resetHaMcpRuntimeStatus();
            }

            // --- Generic MCP Integration ---
            let genericMcpSession: import('../services/genericMcpService').PreparedGenericMcpTools | null = null;
            const enabledGenericMcpServers = genericMcpServers.filter((server) => server.enabled && server.url.trim());
            if (enabledGenericMcpServers.length > 0) {
                console.log(`[LiveAPIContext] Generic MCP enabled, initializing ${enabledGenericMcpServers.length} server(s)...`);
                try {
                    const {
                        filterPreparedGenericMcpToolsForSearchCapability,
                        prepareGenericMcpTools,
                    } = await import('../services/genericMcpService');
                    genericMcpSession = filterPreparedGenericMcpToolsForSearchCapability(
                        await prepareGenericMcpTools(enabledGenericMcpServers),
                        { allowSearchTools: voiceBackend === 'nova_sonic' },
                    );
                    mcpTools = [...mcpTools, ...genericMcpSession.tools];
                    console.log(`[LiveAPIContext] Loaded ${genericMcpSession.tools.length} Generic MCP tools:`, genericMcpSession.toolNames);
                } catch (e: any) {
                    console.error('[LiveAPIContext] Failed to load Generic MCP tools:', e);
                }
            }

            if (await abandonIfStale()) return;

            const modelName = getGeminiLiveModel();

            // ── Status callback shared by both backends ──
            const onStatusChange = (status: LiveState | NovaLiveState) => {
                if (!client || clientRef.current !== client) return;

                if (status.isConnected) {
                    connectionStateRef.current = 'connected';
                    setIsConnecting(false);
                    setError(null);
                } else if (connectionStateRef.current !== 'disconnecting') {
                    connectionStateRef.current = 'disconnected';
                    setIsConnecting(false);
                    setClientInstance(null);
                }

                (window as any).__curioLiveApiActive = status.isConnected;
                setIsConnected(status.isConnected);
                setIsSpeaking(status.isSpeaking);
                if (status.transcript !== undefined) {
                    setTranscript(status.transcript ?? null);
                } else if (!status.isConnected) {
                    setTranscript(null);
                }
                if (status.userTranscript !== undefined) {
                    setUserTranscript(status.userTranscript ?? null);
                }
                if (status.modelTranscript !== undefined) {
                    setModelTranscript(status.modelTranscript ?? null);
                }
                if (!status.isConnected) {
                    setUserTranscript(null);
                    setModelTranscript(null);
                }
                if (status.error) {
                    setError(status.error);
                }
                if (status.transcriptHistory) {
                  const mapped = status.transcriptHistory.map(item => ({
                    ...item,
                    speaker: (item.speaker === 'ai' ? 'model' : 'user') as 'user' | 'model'
                  }));
                  setTranscriptHistory(mapped.length > MAX_TRANSCRIPT_HISTORY
                    ? mapped.slice(-MAX_TRANSCRIPT_HISTORY)
                    : mapped
                  );
                }
            };

            const onCardEventBridge = (event: CardEvent) => { cardEventEmitterRef.current?.(event); };
            const mcpToolCallFn = async (name: string, args: any) => {
                console.log(`[LiveAPIContext] AI calling MCP tool: ${name}`, args);
                try {
                    if (haClient && name.startsWith('homeassistant__')) {
                        return await haClient.callTool(name, args);
                    } else if (genericMcpSession?.bindings.has(name)) {
                        return await genericMcpSession.callTool(name, args);
                    }
                    // No binding: return a structured error rather than throwing so the
                    // model can continue the turn and explain to the user.
                    console.warn(`[LiveAPIContext] No MCP client for tool: ${name}`);
                    return {
                        success: false,
                        error: `No MCP client available to handle tool: ${name}`,
                    };
                } catch (err) {
                    // A single MCP tool failure should not crash the entire turn. Return
                    // the error as a result so the model can recover or surface it.
                    const message = err instanceof Error ? err.message : String(err);
                    console.error(`[LiveAPIContext] MCP tool call failed: ${name}`, err);
                    return {
                        success: false,
                        error: message || `MCP tool ${name} failed.`,
                    };
                }
            };

            if (voiceBackend === 'nova_sonic') {
                // ── Nova Sonic backend ──
                const novaApiKey = await getNovaApiKeyAsync();
                if (await abandonIfStale()) return;
                if (!novaApiKey) {
                    releaseConnectStream();
                    throw new Error("No Nova API key found. Please add it in Settings.");
                }
                const novaVoice = getNovaVoice();
                const { NovaClient } = await loadNovaClientModule();
                if (await abandonIfStale()) return;
                client = new NovaClient(
                    novaApiKey,
                    onStatusChange,
                    'nova-2-sonic-v1',
                    mode,
                    undefined,
                    (systemInstruction || "") + haInstructionSuffix + (genericMcpSession?.instructionSuffix || ''),
                    null,
                    novaVoice,
                    handler,
                    mcpTools,
                    mcpToolCallFn,
                    onCardEventBridge,
                    haClient?.entityCache || [],
                    transcriptHistory,
                );
            } else {
                // ── Gemini Live backend (default) ──
                const { LiveClient } = await loadLiveClientModule();
                if (await abandonIfStale()) return;
                client = new LiveClient(
                    apiKey!,
                    onStatusChange,
                    modelName,
                    mode,
                    undefined,
                    (systemInstruction || "") + haInstructionSuffix + (genericMcpSession?.instructionSuffix || ''),
                    forceNewSession ? null : (resumptionToken || null),
                    voiceName,
                    handler,
                    mcpTools,
                    mcpToolCallFn,
                    onCardEventBridge,
                    haClient?.entityCache || [],
                    transcriptHistory,
                );

                (client as LiveClient).onResumptionTokenReceived = (token) => {
                    setResumptionToken(token);
                };

                (client as LiveClient).onResumptionFailed = () => {
                    console.warn("[LiveAPIContext] Session handle expired. Reconnecting seamlessly...");
                    setResumptionToken(null);
                    localStorage.removeItem(SESSION_RESUMPTION_TOKEN_KEY);
                    isReconnectingRef.current = true;
                    setTimeout(async () => {
                        try {
                            await connect(mode, handler, systemInstruction, voiceName, initialMicStream, true);
                        } finally {
                            isReconnectingRef.current = false;
                        }
                    }, 100);
                };
            }

            if (await abandonIfStale()) return;
            if (!client) {
                throw new Error("Failed to create Live API client.");
            }

            clientRef.current = client;
            setClientInstance(client);
            client.muteMicWhileSpeaking = muteMicWhileAiSpeaking;
            client.clearVoiceEnabled = clearVoiceEnabled;
            client.voiceGateThreshold = voiceGateThreshold;
            client.speakerMuted = speakerMuted;
            await client.connect(initialMicStream);

            if (await abandonIfStale()) return;

            clearConnectionTimeout();
            setIsConnecting(false);
            if (isCurrentConnectAttempt()) {
                connectionStateRef.current = 'connected';
                (window as any).__curioLiveApiActive = true;
                setIsConnected(true);
            }

        } catch (err: any) {
            clearConnectionTimeout();
            if (!isLatestConnectAttempt()) {
                if (client) {
                    try {
                        await client.disconnect();
                    } catch {}
                }
                releaseConnectStream();
                return;
            }
            console.error("LiveAPI Context Connection Error:", err);
            setError(err?.message || "Failed to connect to Live API");
            if (clientRef.current === client) {
                clientRef.current = null;
                setClientInstance(null);
            }
            // Stop mic tracks before clearing the ref
            const leakedStream = audioStreamRef.current;
            stopMediaStream(leakedStream);
            audioStreamRef.current = null;
            setAudioInputStream(null);
            finalizeDisconnectedState();
        }
    }, [disconnect, finalizeDisconnectedState, genericMcpServers, haMcpEnabled, haMcpToken, haMcpUrl, muteMicWhileAiSpeaking, clearVoiceEnabled, voiceGateThreshold, normalizeInitialStreamForSession, resumptionToken, toggleCamera, voiceBackend, stopMediaStream]);

    const reconnectWithContext = useCallback(async (mode: LiveAppMode, handler?: any, systemInstruction?: string, voiceName?: string) => {
        if (isReconnectingRef.current) return;
        isReconnectingRef.current = true;
        try {
            await disconnect();
            // Wait for disconnect process to stabilize
            await new Promise(resolve => setTimeout(resolve, 500));
            await connect(mode, handler, systemInstruction, voiceName);
        } finally {
            isReconnectingRef.current = false;
        }
    }, [disconnect, connect]);

    const updateContext = useCallback(async (mode: LiveAppMode, handler?: any, systemInstruction?: string, voiceName?: string) => {
        await reconnectWithContext(mode, handler, systemInstruction, voiceName);
    }, [reconnectWithContext]);

    useEffect(() => {
        return () => {
            const client = clientRef.current;
            if (client) {
                client.disconnect().catch(e => console.error("Error disconnecting on unmount", e));
            }
            // Revoke cached audio worklet blob URLs
            revokeProcessorBlobUrls();
            revokeNovaProcessorBlobUrls();
            revokeAllCustomWakeWordBlobUrls();
        };
    }, []);

    /** Send a text turn via the internal client ref -- avoids stale closure issues. */
    const sendTextTurn = useCallback((text: string): boolean => {
        if (!clientRef.current) return false;
        clientRef.current.sendTextTurn(text);
        return true;
    }, []);

    /** Send a silent system note to the model (e.g. identified speaker). */
    const sendSystemNote = useCallback((text: string): boolean => {
        if (!clientRef.current) return false;
        const client = clientRef.current as { sendSystemNote?: (text: string) => void };
        if (typeof client.sendSystemNote !== 'function') return false;
        client.sendSystemNote(text);
        return true;
    }, []);

    useEffect(() => {
        if (!isSpeaking) {
            lastSpeechEndedAtRef.current = Date.now();
        }
    }, [isSpeaking]);

    const controlsValue = useMemo(() => ({
        isConnected,
        isConnecting,
        error,
        client: clientInstance,
        globalMode,
        setGlobalMode,
        globalNavigate,
        setGlobalNavigate,
        connect,
        disconnect,
        reconnectWithContext,
        updateContext,
        unlockAudio: unlockAudioContext,
        primeCameraPermission,
        primeMicrophonePermission,
        primeAllPermissions,
        cameraEnabled,
        userFacingCamera,
        canFlipCamera,
        showCameraPreview,
        mediaStream,
        audioInputStream,
        setCameraEnabled,
        setShowCameraPreview,
        toggleCamera,
        flipCamera,
        isMuted,
        setIsMuted,
        resumptionToken,
        resetSession,
        clearResumptionToken,
        clearError,
        sendTextTurn,
        sendSystemNote,
    }), [
        isConnected, isConnecting, error, clientInstance, globalMode, globalNavigate,
        connect, disconnect, reconnectWithContext, updateContext,
        primeCameraPermission, primeMicrophonePermission, primeAllPermissions,
        cameraEnabled, userFacingCamera, canFlipCamera, showCameraPreview, mediaStream,
        audioInputStream,
        toggleCamera, flipCamera, isMuted, resumptionToken, resetSession, clearResumptionToken, clearError, sendTextTurn, sendSystemNote
    ]);

    const streamingValue = useMemo(() => ({
        isSpeaking,
        transcript,
        userTranscript,
        modelTranscript,
        transcriptHistory,
    }), [isSpeaking, transcript, userTranscript, modelTranscript, transcriptHistory]);

    return (
        <LiveAPIControlsContext.Provider value={controlsValue}>
            <LiveAPIStreamingContext.Provider value={streamingValue}>
                <CardManagerProvider>
                    <TimerTickProvider>
                        <CardEventBridge emitterRef={cardEventEmitterRef} />
                        <DesktopCardBridgeHost onExternalizedChange={setDesktopCardsExternalized} />
                        {children}
                        {!desktopCardsExternalized && <CardStack />}
                    </TimerTickProvider>
                </CardManagerProvider>
            </LiveAPIStreamingContext.Provider>
        </LiveAPIControlsContext.Provider>
    );
};

// Bridge component that connects CardManagerContext's emitCardEvent to the ref
const CardEventBridge: React.FC<{ emitterRef: React.MutableRefObject<((event: CardEvent) => void) | null> }> = ({ emitterRef }) => {
    const { emitCardEvent } = useCardManager();
    useEffect(() => {
        emitterRef.current = emitCardEvent;
        // Register debug emitter for console testing (dev only)
        import('../services/cardDebug').then(({ setDebugEmitter }) => {
            setDebugEmitter(emitCardEvent);
        }).catch(() => {});
        return () => {
            emitterRef.current = null;
            import('../services/cardDebug').then(({ setDebugEmitter }) => {
                setDebugEmitter(null);
            }).catch(() => {});
        };
    }, [emitCardEvent, emitterRef]);
    return null;
};

export const useLiveAPIControls = () => {
    const context = useContext(LiveAPIControlsContext);
    if (context === undefined) {
        throw new Error('useLiveAPIControls must be used within a LiveAPIProvider');
    }
    return context;
};

export const useLiveAPIStreaming = () => {
    const context = useContext(LiveAPIStreamingContext);
    if (context === undefined) {
        throw new Error('useLiveAPIStreaming must be used within a LiveAPIProvider');
    }
    return context;
};

export const useLiveAPI = () => {
    const controls = useLiveAPIControls();
    const streaming = useLiveAPIStreaming();
    return useMemo(() => ({ ...controls, ...streaming }), [controls, streaming]);
};
