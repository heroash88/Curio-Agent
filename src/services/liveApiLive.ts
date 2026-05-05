/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration } from '@google/genai';
import type { ReactNode } from 'react';
import { createLiveAPIStateMachine, LiveAPIStateMachine } from './LiveAPIStateMachine';
import { getSharedAudioContext, lockAudioSuspend, unlockAudioSuspend, isSafariBrowser } from './audioContext';
import { encodeBytesToBase64 } from './audioBinary';
import { createPcmCaptureWorkletNode } from './audioWorkletCapture';
import type { LiveModuleMode } from './liveSessionConfig';
import { analyzeTranscript, analyzeTranscriptAsync, resolveCardEntityId } from './transcriptAnalyzer';
import { getTranscriptCardsEnabled } from '../utils/settingsStorage';
import { requestElectronMediaAccess } from '../utils/electronMediaAccess';
import type { CardEvent } from './cardTypes';
import { musicPlaybackService } from './musicPlaybackService';

// Extracted modules
import { AudioPlaybackManager } from './audioPlaybackManager';
import { TranscriptManager } from './transcriptManager';
import { VisionAssistManager } from './visionAssistManager';
import { HaCameraManager } from './haCameraManager';
import { buildToolsArray } from './toolDeclarations';
import { getToolHandler, interceptForDeviceCard, sanitizeToolResultForModel } from './toolCallRouter';
import { getVisibleGeminiModelPartText, shouldDisableGeminiLiveThoughts } from './geminiLiveTranscript';
import { LIVE_SESSION_MIC_AUDIO_CONSTRAINTS } from './sessionMicConstraints';

let _pcmBuffer: Int16Array | null = null;
const floatTo16BitPcm = (float32Array: Float32Array): Int16Array => {
    if (!_pcmBuffer || _pcmBuffer.length !== float32Array.length) {
        _pcmBuffer = new Int16Array(float32Array.length);
    }
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        _pcmBuffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return _pcmBuffer;
};

const DEFAULT_MODEL_NAME = 'gemini-3.1-flash-live-preview';

export interface LiveState {
    isConnected: boolean;
    isSpeaking: boolean;
    error: string | null;
    transcript?: string | null;
    userTranscript?: string | null;
    modelTranscript?: string | null;
    transcriptHistory?: Array<{ speaker: 'user' | 'ai'; text: string }>;
}

export interface BaseToolHandler {
    notifyAiState: (label: string, icon?: ReactNode, autoClear?: boolean) => void;
    getAppState: () => any;
    toggleCamera?: (enabled: boolean) =>
        | Promise<{
              success: boolean;
              enabled: boolean;
              error?: string;
              frameReady?: boolean;
              framesCaptured?: number;
              facingMode?: 'user' | 'environment';
              canFlipCamera?: boolean;
          }>
        | { success: boolean; enabled: boolean; error?: string; frameReady?: boolean; framesCaptured?: number; facingMode?: 'user' | 'environment'; canFlipCamera?: boolean };
    flipCamera?: () =>
        | Promise<{ success: boolean; enabled: boolean; error?: string; frameReady?: boolean; framesCaptured?: number; facingMode?: 'user' | 'environment'; canFlipCamera?: boolean }>
        | { success: boolean; enabled: boolean; error?: string; frameReady?: boolean; framesCaptured?: number; facingMode?: 'user' | 'environment'; canFlipCamera?: boolean };
}

export interface HomeToolHandler extends BaseToolHandler {
    getAvailableSubjects: () => string[];
    navigateToSubject: (subject: string) => void;
    get_weather?: (city?: string) => Promise<any> | any;
}

export type AnyToolHandler = HomeToolHandler;
export type { LiveModuleMode } from './liveSessionConfig';
export { SUBJECT_CONFIG } from './liveSessionConfig';

export class LiveClient {
    private ai: GoogleGenAI;
    private mediaStream: MediaStream | null = null;
    private inputSource: MediaStreamAudioSourceNode | null = null;
    private inputGainNode: GainNode | null = null;
    private processor: AudioWorkletNode | null = null;
    private audioContext: AudioContext | null = null;
    private filterChainHead: AudioNode | null = null;
    public clearVoiceEnabled: boolean = true;
    public voiceGateThreshold: number = 0;
    private statusCallback: (status: LiveState) => void;
    private session: any = null;
    public mode: LiveModuleMode;
    private stateMachine: LiveAPIStateMachine;
    private _voiceName?: string;
    private lastStatus: LiveState | null = null;
    public mcpTools: FunctionDeclaration[] = [];
    public onMcpToolCall?: (name: string, args: any) => Promise<any>;
    public muteMicWhileSpeaking: boolean = false;
    public isMuted: boolean = false;
    private _duckBuffer: Float32Array | null = null;
    private _streamingCardEmitted = false;
    private _modelName: string;
    private _previousSessionHandle: string | null = null;
    public onResumptionTokenReceived?: (token: string) => void;
    public onResumptionFailed?: () => void;
    private _historySeeded = false;
    private _startedWithHandle = false;
    private _userTurnCount = 0;
    private turnHadToolCall = false;

    // Extracted managers
    private audio: AudioPlaybackManager;
    private transcripts: TranscriptManager;
    private vision: VisionAssistManager;
    private haCamera: HaCameraManager;

    /** Expose analyserNode for waveform visualization. */
    get analyserNode(): AnalyserNode | null { return this.audio.analyserNode; }

    /** Mute/unmute the AI speaker output. */
    set speakerMuted(muted: boolean) { this.audio.speakerMuted = muted; }
    get speakerMuted(): boolean { return this.audio.speakerMuted; }

    /** Whether an HA camera stream is currently active. */
    get isHaCameraStreaming(): boolean { return this.haCamera.isStreaming; }

    constructor(
        apiKey: string,
        onStatusChange: (status: LiveState) => void,
        modelName?: string,
        mode: LiveModuleMode = 'global',
        _cachedContent?: string,
        private systemInstruction?: string,
        previousSessionHandle: string | null = null,
        voiceName?: string,
        private handler?: AnyToolHandler,
        mcpTools: FunctionDeclaration[] = [],
        onMcpToolCall?: (name: string, args: any) => Promise<any>,
        public onCardEvent?: (event: CardEvent) => void,
        public entityCache?: any[],
        private initialHistory?: Array<{ speaker: 'user' | 'model', text: string }>
    ) {
        const cleanApiKey = (apiKey || '').trim();
        const cleanModelName = (modelName || DEFAULT_MODEL_NAME).trim();
        this.ai = new GoogleGenAI({ apiKey: cleanApiKey });
        this.statusCallback = onStatusChange;
        this.mode = mode;
        this._modelName = cleanModelName;
        this._voiceName = voiceName;
        this._previousSessionHandle = previousSessionHandle;
        this._startedWithHandle = !!previousSessionHandle;
        this._userTurnCount = previousSessionHandle ? 0 : 1;
        this.mcpTools = mcpTools;
        this.onMcpToolCall = onMcpToolCall;
        this.handler = handler;

        // Initialize extracted managers
        this.audio = new AudioPlaybackManager((isSpeaking) => {
            if (isSpeaking) {
                this.onStatusChange({ ...this.lastStatus!, isSpeaking: true });
            } else {
                this.onStatusChange({ ...this.lastStatus!, isSpeaking: false });
            }
        });

        this.transcripts = new TranscriptManager();

        this.vision = new VisionAssistManager({
            getSession: () => this.session,
            toggleCamera: handler?.toggleCamera?.bind(handler),
            isHaCameraStreaming: () => this.haCamera.isStreaming,
            stopAudio: () => this.audio.stop(),
        });

        this.haCamera = new HaCameraManager({
            sendVideoFrame: (b64) => this.sendVideoFrame(b64),
            toggleCamera: handler?.toggleCamera?.bind(handler),
            hasMediaStream: () => {
                if (!this.mediaStream) return false;
                const videoTracks = this.mediaStream.getVideoTracks();
                return videoTracks.length > 0 && videoTracks[0].readyState === 'live';
            },
        });

        this.stateMachine = createLiveAPIStateMachine();
        this.stateMachine.onStateChange((newState, previousState) => {
            console.log(`[LiveClient] State: ${previousState} -> ${newState}`);
            if (newState === 'connected') {
                this.onStatusChange({ isConnected: true, isSpeaking: false, error: null });
            } else if (newState === 'disconnected') {
                this.onStatusChange({ isConnected: false, isSpeaking: false, error: null });
            } else if (newState === 'error') {
                this.onStatusChange({
                    isConnected: false, isSpeaking: false,
                    error: this.stateMachine.getLastError()?.message || 'Error',
                });
            }
        });
    }

    private onStatusChange(status: LiveState) {
        this.lastStatus = status;
        this.statusCallback(status);
    }

    async connect(audioStream?: MediaStream) {
        try {
            await this.stateMachine.connect();
            const toolsArray = buildToolsArray(this._modelName, this.mcpTools);

            const configObj: any = {
                systemInstruction: {
                    parts: [{ text: this.systemInstruction || 'You are Curio, a helpful robot friend.' }],
                },
                responseModalities: [Modality.AUDIO],
                tools: toolsArray,
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                contextWindowCompression: { slidingWindow: {} },
                realtimeInputConfig: {
                    turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
                    automaticActivityDetection: {
                        disabled: false,
                        startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
                        endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                        prefixPaddingMs: 40,
                        silenceDurationMs: 500,
                    },
                },
                sessionResumption: this._previousSessionHandle
                    ? { handle: this._previousSessionHandle }
                    : {},
            };

            if (this._voiceName) {
                configObj.speechConfig = {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: this._voiceName } },
                };
            }

            const modelToUse = this._modelName;
            if (shouldDisableGeminiLiveThoughts(modelToUse)) {
                configObj.thinkingConfig = { includeThoughts: false };
            }
            const sessionPromise = (this.ai as any).live.connect({
                model: modelToUse,
                config: configObj,
                callbacks: {
                    onopen: async () => {
                        lockAudioSuspend();
                        if (
                            this.stateMachine.getState() !== 'connecting' &&
                            this.stateMachine.getState() !== 'connected'
                        ) {
                            unlockAudioSuspend();
                            return;
                        }
                        try {
                            const captureContext = getSharedAudioContext(true);
                            this.audioContext = captureContext;
                            this.audio.setAudioContext(captureContext);

                            if (!audioStream && !(await requestElectronMediaAccess('microphone'))) {
                                throw new Error('Microphone access was not granted.');
                            }
                            const micStream =
                                audioStream ||
                                (await navigator.mediaDevices.getUserMedia({
                                    audio: LIVE_SESSION_MIC_AUDIO_CONSTRAINTS,
                                }));
                            this.mediaStream = micStream;
                            this.inputSource = captureContext.createMediaStreamSource(micStream);
                            let lastNode: AudioNode = this.inputSource;

                            // User-adjustable mic gain from Settings. Lives at the
                            // head of the capture chain so it affects filters and
                            // the worklet output identically. Read lazily -- the
                            // service is decoupled from React hooks.
                            const readMicGainDb = (): number => {
                                try {
                                    const raw = localStorage.getItem('curio_mic_gain_db');
                                    const n = raw ? parseFloat(raw) : 0;
                                    return Number.isFinite(n) ? Math.min(24, Math.max(-12, n)) : 0;
                                } catch { return 0; }
                            };
                            this.inputGainNode = captureContext.createGain();
                            this.inputGainNode.gain.value = Math.pow(10, readMicGainDb() / 20);
                            this.inputSource.connect(this.inputGainNode);
                            lastNode = this.inputGainNode;

                            if (this.clearVoiceEnabled) {
                                const hpf = captureContext.createBiquadFilter();
                                hpf.type = 'highpass';
                                hpf.frequency.value = 80;
                                hpf.Q.value = 0.5;
                                this.filterChainHead = hpf;

                                const compressor = captureContext.createDynamicsCompressor();
                                compressor.threshold.value = -12;
                                compressor.knee.value = 30;
                                compressor.ratio.value = 3;
                                compressor.attack.value = 0.01;
                                compressor.release.value = 0.15;
                                hpf.connect(compressor);
                                lastNode = compressor;
                            } else {
                                this.filterChainHead = null;
                            }

                            this.processor = await createPcmCaptureWorkletNode(
                                captureContext,
                                (data) => {
                                    if (this.session) {
                                        if (this.stateMachine.getState() !== 'connected' || this.isMuted) return;

                                        let processedData = data;
                                        const isAiSpeaking = this.audio.isPlayingOrRecent || this.lastStatus?.isSpeaking;

                                        if (this.muteMicWhileSpeaking && isAiSpeaking) {
                                            if (!this._duckBuffer || this._duckBuffer.length !== data.length) {
                                                this._duckBuffer = new Float32Array(data.length);
                                            }
                                            const duckFactor = this._modelName.includes('3.1') ? 0.08 : 0.20;
                                            for (let i = 0; i < data.length; i++) {
                                                this._duckBuffer[i] = data[i] * duckFactor;
                                            }
                                            processedData = this._duckBuffer;
                                        }

                                        const pcm16 = floatTo16BitPcm(processedData);
                                        this.session.then((s: any) => {
                                            if (this.stateMachine.getState() !== 'connected') return;
                                            try {
                                                s.sendRealtimeInput({
                                                    audio: {
                                                        mimeType: 'audio/pcm;rate=16000',
                                                        data: encodeBytesToBase64(new Uint8Array(pcm16.buffer)),
                                                    },
                                                });
                                            } catch (e) { /* WebSocket may be closing */ }
                                        });
                                    }
                                },
                                512,
                                this.voiceGateThreshold
                            );

                            if (this.filterChainHead) {
                                this.inputGainNode.connect(this.filterChainHead);
                                lastNode.connect(this.processor);
                            } else {
                                this.inputGainNode.connect(this.processor);
                            }
                            this.audioContext = captureContext;
                        } catch (err: any) {
                            const safariPermMsg = isSafariBrowser && err?.name === 'NotAllowedError'
                                ? 'Microphone access denied. Check Safari > Settings > Websites > Microphone AND macOS System Settings > Privacy & Security > Microphone.'
                                : 'Audio hardware initialization failed. Please refresh.';
                            console.error('CRITICAL: Audio initialization failed:', err);
                            this.onerror?.(new Error(safariPermMsg));
                            this.disconnect();
                        }
                    },

                    onmessage: (msg: LiveServerMessage) => {
                        if ((msg as any).serverContent?.groundingMetadata || (msg as any).groundingMetadata) {
                            console.log('[LiveClient] Grounding metadata received:', JSON.stringify((msg as any).serverContent?.groundingMetadata || (msg as any).groundingMetadata).substring(0, 500));
                        }
                        // Handle GoAway
                        if ((msg as any).goAway) {
                            const timeLeft = (msg as any).goAway.timeLeft;
                            console.warn(`[LiveClient] GoAway received. Time left: ${timeLeft}s.`);
                            window.dispatchEvent(new CustomEvent('requestGlobalLiveApiReconnect', { detail: { reason: 'goaway', timeLeft } }));
                            return;
                        }

                        // Handle setupComplete + resumption
                        if ((msg as any).setupComplete) {
                            const setupComplete = (msg as any).setupComplete;
                            const handle = setupComplete.newHandle;
                            if (handle) {
                                this._previousSessionHandle = handle;
                                this.onResumptionTokenReceived?.(handle);
                            }
                            console.log('[LiveClient] Setup Complete.', handle ? 'Session resumable.' : 'No resumption handle.');

                            const historyToSeed = this.initialHistory?.filter(item => item.text && item.text.trim().length > 0);
                            if (!this._startedWithHandle && historyToSeed && historyToSeed.length > 0 && !this._historySeeded) {
                                this._historySeeded = true;
                                console.log(`[LiveClient] Seeding fresh session with ${historyToSeed.length} history items...`);
                                void (async () => {
                                    try {
                                        const session = await sessionPromise;
                                        const turns = historyToSeed.map(item => ({
                                            role: item.speaker === 'model' ? 'model' : 'user',
                                            parts: [{ text: item.text }]
                                        }));
                                        await session.sendClientContent({ turns, turnComplete: false });
                                    } catch (e) {
                                        console.error('[LiveClient] Failed to seed history:', e);
                                    }
                                })();
                            }
                        }

                        // Periodic resumption token updates
                        if ((msg as any).sessionResumptionUpdate) {
                            const update = (msg as any).sessionResumptionUpdate;
                            const handle = update.newHandle;
                            if (handle && update.resumable) {
                                this._previousSessionHandle = handle;
                                this.onResumptionTokenReceived?.(handle);
                            }
                        }

                        const content = msg.serverContent;
                        if (content) {
                            const suppressSpeculativeVisionReply =
                                Boolean(this.vision.question) && !this.vision.promptSentForTurn;

                            if ((content as any).interrupted) {
                                this.audio.stop();
                                return;
                            }
                            if (!suppressSpeculativeVisionReply && content.modelTurn?.parts) {
                                for (const part of content.modelTurn.parts) {
                                    if ((part as any).thought === true) {
                                        continue;
                                    }
                                    if (part.inlineData?.data) {
                                        this.onStatusChange({ ...this.lastStatus!, isSpeaking: true });
                                        this.audio.play(part.inlineData.data);
                                    }
                                    // Text parts arrive for text-input turns (no outputTranscription in that case)
                                    const visiblePartText = getVisibleGeminiModelPartText(part);
                                    if (visiblePartText) {
                                        this.transcripts.mergeAssistantChunk(visiblePartText);
                                        this.onStatusChange({
                                            ...this.lastStatus!,
                                            transcript: this.transcripts.pendingAssistant,
                                            userTranscript: this.transcripts.pendingUser || null,
                                            modelTranscript: this.transcripts.pendingAssistant,
                                        });
                                    }
                                }
                            } else if (suppressSpeculativeVisionReply && content.modelTurn?.parts) {
                                this.audio.stop();
                            }

                            if (content.inputTranscription?.text) {
                                this.transcripts.mergeUserChunk(content.inputTranscription.text);
                                this.vision.schedule(this.transcripts.pendingUser);
                                this.onStatusChange({
                                    ...this.lastStatus!,
                                    transcript: this.transcripts.pendingUser,
                                    userTranscript: this.transcripts.pendingUser,
                                });
                            }

                            if (!suppressSpeculativeVisionReply && content.outputTranscription?.text) {
                                this.transcripts.mergeAssistantChunk(content.outputTranscription.text);
                                this.onStatusChange({
                                    ...this.lastStatus!,
                                    transcript: this.transcripts.pendingAssistant,
                                    userTranscript: this.transcripts.pendingUser || null,
                                    modelTranscript: this.transcripts.pendingAssistant,
                                });

                                // Streaming card analysis -- only attempt once enough text
                                // has accumulated to avoid false positives on partial sentences.
                                if (this.onCardEvent && !this.turnHadToolCall && !this._streamingCardEmitted && !this.haCamera.isStreaming && this.transcripts.pendingAssistant.length > 200 && getTranscriptCardsEnabled()) {
                                    let cardEvent = analyzeTranscript(this.transcripts.pendingAssistant, false, 'ai');
                                    if (cardEvent) {
                                        // Resolve entity IDs for device/camera/thermostat cards
                                        if (this.entityCache?.length && (cardEvent.type === 'device' || cardEvent.type === 'camera' || cardEvent.type === 'thermostat')) {
                                            cardEvent = resolveCardEntityId(cardEvent, this.entityCache);
                                        }
                                        this._streamingCardEmitted = true;
                                        try { this.onCardEvent(cardEvent); } catch {}
                                    }
                                }
                            }

                            if (content.turnComplete) {
                                const { userCommitted } = this.transcripts.finalizeTurn();
                                if (userCommitted) this._userTurnCount++;

                                // End-of-turn card analysis
                                const lastAiEntry = this.transcripts.history[this.transcripts.history.length - 1];
                                const aiText = lastAiEntry?.speaker === 'ai' ? lastAiEntry.text : '';
                                if (this.onCardEvent && !this._streamingCardEmitted && !this.haCamera.isStreaming && aiText && getTranscriptCardsEnabled()) {
                                    let cardEvent = analyzeTranscript(aiText, this.turnHadToolCall, 'ai');
                                    if (cardEvent) {
                                        // Resolve entity IDs for device/camera/thermostat cards
                                        if (this.entityCache?.length && (cardEvent.type === 'device' || cardEvent.type === 'camera' || cardEvent.type === 'thermostat')) {
                                            cardEvent = resolveCardEntityId(cardEvent, this.entityCache);
                                        }
                                        try { this.onCardEvent(cardEvent); } catch {}
                                    }
                                }

                                // Async analysis (image search, etc.) -- skip if streaming already emitted a card
                                if (this.onCardEvent && !this._streamingCardEmitted && !this.haCamera.isStreaming && aiText) {
                                    const capturedOnCardEvent = this.onCardEvent;
                                    analyzeTranscriptAsync(aiText)
                                        .then(asyncCard => { if (asyncCard) try { capturedOnCardEvent(asyncCard); } catch {} })
                                        .catch(() => {});
                                }

                                this.turnHadToolCall = false;
                                this._streamingCardEmitted = false;
                                if (this.vision.promptSentForTurn || !this.vision.question) {
                                    this.vision.clear();
                                }
                                this.onStatusChange({
                                    ...this.lastStatus!,
                                    transcript: '',
                                    userTranscript: null,
                                    modelTranscript: null,
                                    transcriptHistory: this.transcripts.getHistorySnapshot(),
                                });
                            }
                        }
                        if (msg.toolCall) {
                            this.handleToolCalls(msg.toolCall, sessionPromise);
                        }
                    },

                    onclose: (e: any) => {
                        console.log('[LiveClient] WebSocket Closed. Code:', e.code, 'Reason:', e.reason);
                        if ((e.code === 1008 || e.code === 1007) && this._previousSessionHandle) {
                            console.warn(`[LiveClient] Session handle expired/invalid (Code: ${e.code}).`);
                            this._previousSessionHandle = null;
                            this.onResumptionFailed?.();
                            return;
                        }
                        this.onStatusChange({ ...this.lastStatus!, isConnected: false, isSpeaking: false });
                        this.disconnect();
                    },
                    onerror: (e: any) => {
                        console.error('[LiveClient] WebSocket Error:', e);
                        this.onStatusChange({
                            ...this.lastStatus!, isConnected: false, isSpeaking: false, error: 'Connection error',
                        });
                        this.disconnect();
                    },
                },
            });
            this.session = sessionPromise;
            await this.stateMachine.markConnected();
        } catch (e: any) {
            this.onStatusChange({ isConnected: false, isSpeaking: false, error: e.message || 'Failed to connect' });
            this.disconnect();
        }
    }

    public updateAudioStream(stream: MediaStream) {
        if (!this.audioContext || !this.processor) return;
        console.log('[LiveClient] Updating audio stream dynamically...');
        if (this.inputSource) {
            try { this.inputSource.disconnect(); } catch (e) {}
        }
        this.mediaStream = stream;
        this.inputSource = this.audioContext.createMediaStreamSource(stream);
        if (this.filterChainHead) {
            this.inputSource.connect(this.filterChainHead);
        } else {
            this.inputSource.connect(this.processor);
        }
    }

    async disconnect() {
        this.vision.clear();
        // Dismiss stale camera card on disconnect
        if (this.haCamera.isStreaming) {
            if (this.onCardEvent) {
                try { this.onCardEvent({ type: 'close_camera', data: {} }); } catch {}
            }
        }
        this.haCamera.dispose(false);
        this.audio.stop();
        unlockAudioSuspend();

        if (this.session && this.stateMachine.getState() === 'connected') {
            try {
                const s = await this.session;
                s.sendRealtimeInput({ audioStreamEnd: true });
            } catch (e) {}
        }

        if (this.processor) try { this.processor.disconnect(); } catch (e) {}
        if (this.inputSource) try { this.inputSource.disconnect(); } catch (e) {}
        if (this.inputGainNode) try { this.inputGainNode.disconnect(); } catch (e) {}
        if (this.filterChainHead) try { this.filterChainHead.disconnect(); } catch (e) {}
        this.filterChainHead = null;
        this.audio.clearAudioContext();
        this.processor = null;
        this.inputSource = null;
        this.inputGainNode = null;
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach((track) => {
                track.stop();
                if (typeof (track as any).enabled !== 'undefined') {
                    (track as any).enabled = false;
                }
            });
            this.mediaStream = null;
        }
        this.audioContext = null;
        if (this.session) {
            try {
                const s = await this.session;
                await Promise.race([
                    s.close(),
                    new Promise<void>((_, reject) =>
                        setTimeout(() => reject(new Error('Session close timed out')), 3000)
                    ),
                ]);
            } catch (e) {
                console.warn('[LiveClient] Session close failed or timed out:', e);
            }
            this.session = null;
        }
        await this.stateMachine.disconnect();
    }

    async handleToolCalls(toolCall: any, sessionPromise: Promise<any>) {
        const responses: any[] = [];
        const ctx = {
            onCardEvent: this.onCardEvent,
            entityCache: this.entityCache,
            handler: this.handler,
            onMcpToolCall: this.onMcpToolCall,
            disconnect: () => this.disconnect(),
            startHaCameraStream: (entityId: string, baseUrl: string, token: string) =>
                this.haCamera.start(entityId, baseUrl, token, () => {
                    if (this.session) {
                        try {
                            this.session.then((s: any) => s.sendRealtimeInput({ text: '[System: The user closed the camera card. The camera feed is no longer visible. Stop describing camera frames.]' }));
                        } catch {}
                    }
                }),
            stopHaCameraStream: (restore?: boolean) => this.haCamera.stop(restore),
            isHaCameraStreaming: this.haCamera.isStreaming,
        };

        for (const fc of toolCall.functionCalls) {
            let result: any = { success: true };
            let emittedCard = false;

            // Guard: Block replayed tool calls from resumed sessions
            const isResumedSessionReplay = this._startedWithHandle && this._userTurnCount === 0 && !this.transcripts.pendingUser.trim();

            if (isResumedSessionReplay && fc.name === 'disconnectSession') {
                console.log(`[LiveClient] Blocking replayed disconnectSession`);
                result = { success: true, skipped: true, reason: 'This disconnect request is from a previous session context.' };
                responses.push({ id: fc.id, name: fc.name, response: { result: sanitizeToolResultForModel(result) } });
                continue;
            }

            if (isResumedSessionReplay && fc.name === 'play_music') {
                const currentState = musicPlaybackService.getState();
                const isAlreadyPlaying = currentState.playbackState === 'playing' || currentState.playbackState === 'paused';
                if (isAlreadyPlaying) {
                    result = { success: true, skipped: true, reason: 'Music is already playing from the previous session.', currentState: currentState.playbackState, title: currentState.title };
                } else {
                    result = { success: true, skipped: true, reason: 'Music was stopped before this session resumed.' };
                }
                responses.push({ id: fc.id, name: fc.name, response: { result: sanitizeToolResultForModel(result) } });
                continue;
            }

            // Try registered handler first
            const handler = getToolHandler(fc.name);
            if (handler) {
                const handlerResult = await handler(fc.args, ctx);
                result = handlerResult.result;
                emittedCard = handlerResult.emittedCard;
            } else if (this.onMcpToolCall) {
                // Fall through to MCP
                console.log('[LiveClient] MCP tool call:', fc.name, 'args:', JSON.stringify(fc.args));
                try {
                    result = await this.onMcpToolCall(fc.name, fc.args);
                    console.log('[LiveClient] MCP tool result for', fc.name, ':', JSON.stringify(result).substring(0, 500));
                } catch (e) {
                    console.error('[LiveClient] MCP tool error for', fc.name, ':', (e as Error).message);
                    result = { success: false, error: (e as Error).message };
                }
            }

            if (emittedCard) {
                this.turnHadToolCall = true;
                this._streamingCardEmitted = true;
            }

            responses.push({
                id: fc.id,
                name: fc.name,
                response: { result: sanitizeToolResultForModel(result) },
            });

            // Debug search tool responses
            if (fc.name.includes('search') || fc.name.includes('Search')) {
                console.log('[LiveClient] Search tool response for', fc.name, ':', JSON.stringify(sanitizeToolResultForModel(result)).substring(0, 1000));
            }

            // Emit device card via interceptor (for HA device state changes)
            if (interceptForDeviceCard(fc.name, fc.args, result, this.entityCache, this.onCardEvent)) {
                this.turnHadToolCall = true;
            }
        }

        sessionPromise.then((s: any) => {
            try { s.sendToolResponse({ functionResponses: responses }); } catch (e) {}
        });
    }

    /**
     * Live-update the mic input gain while connected. Smooth ramp so the
     * user doesn't hear a pop as the slider moves.
     */
    public setInputGainDb(db: number): void {
        if (!this.inputGainNode || !this.audioContext) return;
        const clamped = Math.min(24, Math.max(-12, Number.isFinite(db) ? db : 0));
        const linear = Math.pow(10, clamped / 20);
        try {
            this.inputGainNode.gain.setTargetAtTime(linear, this.audioContext.currentTime, 0.02);
        } catch {
            this.inputGainNode.gain.value = linear;
        }
    }

    public sendTextTurn(text: string) {
        if (!this.session) return;
        this.transcripts.pendingUser = text;
        this.onStatusChange({
            ...this.lastStatus!,
            userTranscript: text,
            transcript: text,
        });
        this.vision.schedule(text);
        this.session.then((s: any) => s.sendRealtimeInput({ text }));
    }

    /**
     * Send a silent system note to the model without triggering a user turn.
     * Used to tell the model what cards are currently visible on screen so it
     * doesn't repeat information the user is already seeing.
     */
    public sendSystemNote(text: string) {
        if (!this.session || this.stateMachine.getState() !== 'connected') return;
        this.session.then((s: any) => {
            try {
                s.sendRealtimeInput({ text: `[System: ${text}]` });
            } catch { /* session may be closing */ }
        });
    }

    /** Flush any cached audio on the server (e.g. when mic is muted). */
    public sendAudioStreamEnd() {
        if (!this.session || this.stateMachine.getState() !== 'connected') return;
        this.session.then((s: any) => {
            try {
                s.sendRealtimeInput({ audioStreamEnd: true });
                console.log('[LiveClient] Sent audioStreamEnd (mic muted).');
            } catch (e) { /* WebSocket may be closing */ }
        });
    }

    public sendVideoFrame(base64: string) {
        if (!this.session) return;
        this.session.then((s: any) =>
            s.sendRealtimeInput({
                video: { mimeType: 'image/jpeg', data: base64 },
            })
        );
    }

    /** Start streaming HA camera frames to the model at ~0.5fps */
    public async startHaCameraStream(entityId: string, baseUrl: string, token: string) {
        await this.haCamera.start(entityId, baseUrl, token, () => {
            if (this.session) {
                try {
                    this.session.then((s: any) => s.sendRealtimeInput({ text: '[System: The user closed the camera card. The camera feed is no longer visible. Stop describing camera frames.]' }));
                } catch {}
            }
        });
    }

    /** Stop streaming HA camera frames to the model */
    public stopHaCameraStream(restoreDeviceCamera = true) {
        this.haCamera.stop(restoreDeviceCamera);
    }

    public onerror?: (err: Error) => void;
}
