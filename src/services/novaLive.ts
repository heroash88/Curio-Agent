/**
 * NovaClient -- WebSocket client for Amazon Nova Sonic (nova-2-sonic-v1).
 *
 * Mirrors the LiveClient interface so LiveAPIContext can swap between
 * Gemini and Nova without changing the rest of the app.
 *
 * Protocol: wss://api.nova.amazon.com/v1/realtime?model=nova-2-sonic-v1
 * Audio: PCM16 @ 24kHz mono, base64-encoded
 */

import type { ReactNode } from 'react';
import { getSharedAudioContext, lockAudioSuspend, unlockAudioSuspend, isSafariBrowser } from './audioContext';
import { requestElectronMediaAccess } from '../utils/electronMediaAccess';
import { encodeBytesToBase64 } from './audioBinary';
import { createNovaPcmCaptureWorkletNode } from './novaAudioWorklet';
import { AudioPlaybackManager } from './audioPlaybackManager';
import { TranscriptManager } from './transcriptManager';
import { VisionAssistManager } from './visionAssistManager';
import { HaCameraManager } from './haCameraManager';
import { getToolHandler, interceptForDeviceCard, sanitizeToolResultForModel } from './toolCallRouter';
import { getBuiltInToolDeclarations } from './toolDeclarations';
import type { CardEvent } from './cardTypes';
import type { FunctionDeclaration } from '@google/genai';
import { buildLiveSessionMicConstraints } from './sessionMicConstraints';

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
        | Promise<{ success: boolean; enabled: boolean; error?: string; frameReady?: boolean; framesCaptured?: number; facingMode?: 'user' | 'environment'; canFlipCamera?: boolean }>
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

const NOVA_SAMPLE_RATE = 24000;

/**
 * Resolve the Nova API base URL.
 *
 * Resolution order:
 *   1. User-configured override in localStorage (for Firebase Hosting /
 *      remote deployments where no bundled proxy exists).
 *   2. Electron: __CURIO_NOVA_PROXY__ on window, injected by the main
 *      process after it spawns the local proxy.
 *   3. Same-origin `/nova-proxy/` path (bundled by the HA add-on and
 *      the RPi kiosk image nginx configs).
 *   4. Dev mode: localhost:8081 (scripts/nova-proxy.mjs started via
 *      `npm run dev:nova`).
 *   5. Fallback to the public API (will fail without a proxy; kept so
 *      the error surface is obvious if someone runs a plain build
 *      without either a bundled proxy or a user-configured URL).
 */
function getNovaApiBaseUrl(): string {
    // 1. User-configured proxy URL
    const custom = typeof localStorage !== 'undefined'
        ? localStorage.getItem('curio_nova_proxy_url')
        : null;
    if (custom) return custom.replace(/\/+$/, '');

    // 2. Electron-injected proxy URL (main process spawns the proxy and
    //    sets window.__CURIO_NOVA_PROXY__ to something like
    //    `ws://127.0.0.1:8081` before the renderer loads any code).
    if (typeof window !== 'undefined' && (window as any).__CURIO_NOVA_PROXY__) {
        return String((window as any).__CURIO_NOVA_PROXY__).replace(/\/+$/, '');
    }

    // 3. Bundled same-origin proxy (HA add-on, RPi kiosk).
    //    nginx exposes the local Node proxy at /nova-proxy/.
    //    We return a path starting with '/' so getNovaWsBaseUrl
    //    builds the correct ws://host:port/nova-proxy URL below.
    if (typeof window !== 'undefined' && typeof location !== 'undefined') {
        // Skip same-origin default for the Vite dev server; that one uses
        // localhost:8081 via the separate `npm run nova:proxy` step.
        if (!import.meta.env?.DEV) {
            return '/nova-proxy';
        }
    }

    // 4. Dev mode
    if (import.meta.env?.DEV) return 'http://localhost:8081';

    // 5. Fallback
    return 'https://api.nova.amazon.com';
}

function getNovaWsBaseUrl(): string {
    const base = getNovaApiBaseUrl();
    // If using localhost proxy, just swap protocol
    if (base.startsWith('http://')) return base.replace('http://', 'ws://');
    if (base.startsWith('https://')) return base.replace('https://', 'wss://');
    // If using a relative proxy path, construct the full ws:// URL from current host
    if (base.startsWith('/')) {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${location.host}${base}`;
    }
    return base;
}

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

/**
 * Convert Gemini-format FunctionDeclaration[] to Nova/OpenAI tool format.
 */
function convertToolsToNovaFormat(
    builtInTools: FunctionDeclaration[],
    mcpTools: FunctionDeclaration[],
): any[] {
    const allDecls = [...builtInTools, ...mcpTools];
    return allDecls
        .filter(t => t.name)
        .map(decl => {
            const params: any = { type: 'object', properties: {}, required: [] };
            if (decl.parameters && typeof decl.parameters === 'object') {
                const p = decl.parameters as any;
                if (p.properties) {
                    // Convert Gemini Type enum values to JSON Schema type strings
                    for (const [key, val] of Object.entries(p.properties)) {
                        const prop = val as any;
                        const converted: any = { ...prop };
                        if (typeof converted.type === 'string') {
                            converted.type = converted.type.toLowerCase();
                        }
                        // Map Gemini Type enum names
                        const typeMap: Record<string, string> = {
                            STRING: 'string', NUMBER: 'number', INTEGER: 'integer',
                            BOOLEAN: 'boolean', ARRAY: 'array', OBJECT: 'object',
                        };
                        if (typeMap[converted.type]) {
                            converted.type = typeMap[converted.type];
                        }
                        if (converted.items && typeof converted.items.type === 'string') {
                            const itemType = typeMap[converted.items.type] || converted.items.type.toLowerCase();
                            converted.items = { ...converted.items, type: itemType };
                            if (converted.items.properties) {
                                const convertedItemProps: any = {};
                                for (const [ik, iv] of Object.entries(converted.items.properties)) {
                                    const ip = iv as any;
                                    const ct = typeMap[ip.type] || (typeof ip.type === 'string' ? ip.type.toLowerCase() : ip.type);
                                    convertedItemProps[ik] = { ...ip, type: ct };
                                }
                                converted.items.properties = convertedItemProps;
                            }
                        }
                        params.properties[key] = converted;
                    }
                }
                if (p.required) params.required = p.required;
            }
            return {
                type: 'function' as const,
                name: decl.name,
                description: decl.description || '',
                parameters: params,
            };
        });
}

export class NovaClient {
    private ws: WebSocket | null = null;
    private mediaStream: MediaStream | null = null;
    private inputSource: MediaStreamAudioSourceNode | null = null;
    private processor: AudioWorkletNode | null = null;
    private audioContext: AudioContext | null = null;
    private statusCallback: (status: LiveState) => void;
    private lastStatus: LiveState | null = null;
    private _voiceName: string;
    private _apiKey: string;
    public muteMicWhileSpeaking: boolean = false;
    public isMuted: boolean = false;
    public clearVoiceEnabled: boolean = true;
    public voiceGateThreshold: number = 0;
    private _duckBuffer: Float32Array | null = null;
    public mcpTools: FunctionDeclaration[] = [];
    public onMcpToolCall?: (name: string, args: any) => Promise<any>;
    public onCardEvent?: (event: CardEvent) => void;
    public entityCache?: any[];
    public onResumptionTokenReceived?: (token: string) => void;
    public onResumptionFailed?: () => void;

    // Extracted managers (same as LiveClient)
    private audio: AudioPlaybackManager;
    private transcripts: TranscriptManager;
    private vision: VisionAssistManager;
    private haCamera: HaCameraManager;

    // Dedup: track recently emitted card types to prevent duplicates
    // when Nova calls multiple tools for the same intent (e.g. get_directions + show_commute)
    private _recentCardTypes = new Map<string, number>();
    private readonly CARD_DEDUP_MS = 3000;

    get analyserNode(): AnalyserNode | null { return this.audio.analyserNode; }
    set speakerMuted(muted: boolean) { this.audio.speakerMuted = muted; }
    get speakerMuted(): boolean { return this.audio.speakerMuted; }
    get isHaCameraStreaming(): boolean { return this.haCamera.isStreaming; }

    constructor(
        apiKey: string,
        onStatusChange: (status: LiveState) => void,
        _modelName?: string,
        _mode?: string,
        _cachedContent?: string,
        private systemInstruction?: string,
        _previousSessionHandle?: string | null,
        voiceName?: string,
        private handler?: AnyToolHandler,
        mcpTools: FunctionDeclaration[] = [],
        onMcpToolCall?: (name: string, args: any) => Promise<any>,
        onCardEvent?: (event: CardEvent) => void,
        entityCache?: any[],
        _initialHistory?: Array<{ speaker: 'user' | 'model'; text: string }>,
    ) {
        this._apiKey = (apiKey || '').trim();
        this._voiceName = voiceName || 'tiffany';
        this.statusCallback = onStatusChange;
        this.mcpTools = mcpTools;
        this.onMcpToolCall = onMcpToolCall;
        this.onCardEvent = onCardEvent;
        this.entityCache = entityCache;
        this.handler = handler;

        this.audio = new AudioPlaybackManager((isSpeaking) => {
            this.onStatusChange({ ...this.lastStatus!, isSpeaking });
        });
        this.transcripts = new TranscriptManager();
        this.vision = new VisionAssistManager({
            getSession: () => null, // Nova doesn't use Gemini sessions
            toggleCamera: handler?.toggleCamera,
            isHaCameraStreaming: () => this.haCamera.isStreaming,
            stopAudio: () => this.audio.stop(),
        });
        this.haCamera = new HaCameraManager({
            sendVideoFrame: (_base64: string) => { /* Nova doesn't support vision */ },
            toggleCamera: handler?.toggleCamera,
            hasMediaStream: () => !!this.mediaStream,
        });
    }

    private onStatusChange(status: LiveState) {
        this.lastStatus = status;
        this.statusCallback(status);
    }

    /**
     * Emit a card event with deduplication.
     * Suppresses duplicate card types within CARD_DEDUP_MS to prevent
     * Nova from showing e.g. both a map card and a commute card for the
     * same directions request.
     */
    private emitCardDeduped(event: CardEvent) {
        if (!this.onCardEvent) return;
        const now = Date.now();
        // Map related card types to a single dedup key
        const DEDUP_GROUPS: Record<string, string> = {
            map: 'directions', commute: 'directions',
            weather: 'weather', airQuality: 'airQuality',
        };
        const dedupKey = DEDUP_GROUPS[event.type] || event.type;
        const lastEmit = this._recentCardTypes.get(dedupKey);
        if (lastEmit && now - lastEmit < this.CARD_DEDUP_MS) {
            console.log(`[NovaClient] Suppressed duplicate card: ${event.type} (dedup key: ${dedupKey})`);
            return;
        }
        this._recentCardTypes.set(dedupKey, now);
        try { this.onCardEvent(event); } catch {}
    }

    async connect(audioStream?: MediaStream) {
        try {
            this.onStatusChange({
                isConnected: false, isSpeaking: false, error: null,
            });

            // Connect via WebSocket through the local proxy.
            // The proxy (scripts/nova-proxy.mjs) accepts the token as a query
            // param and forwards to Nova with the proper Authorization header.
            const wsBase = getNovaWsBaseUrl();
            const wsUrl = `${wsBase}/?token=${encodeURIComponent(this._apiKey)}`;
            console.log('[NovaClient] Connecting to WebSocket:', wsUrl.replace(/token=[^&]+/, 'token=***'));

            const ws = new WebSocket(wsUrl);
            this.ws = ws;

            // Build Nova tools from Gemini declarations
            const builtInTools = getBuiltInToolDeclarations();
            const novaTools = convertToolsToNovaFormat(builtInTools, this.mcpTools);

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Nova WebSocket connection timed out')), 15000);

                ws.onopen = () => {
                    console.log('[NovaClient] WebSocket open, waiting for session.created...');
                };

                ws.onclose = (e) => {
                    clearTimeout(timeout);
                    if (!this.lastStatus?.isConnected) {
                        reject(new Error(`Nova WebSocket closed during setup: code=${e.code} reason=${e.reason || 'none'}`));
                    }
                };

                ws.onerror = (e) => {
                    clearTimeout(timeout);
                    console.error('[NovaClient] WebSocket error during setup:', e);
                    reject(new Error('Nova WebSocket connection failed. Check your API key and network.'));
                };

                ws.onmessage = (event) => {
                    let msg: any;
                    try { msg = JSON.parse(event.data as string); } catch { return; }

                    if (msg.type === 'session.created') {
                        console.log('[NovaClient] Session created');
                        // Build instructions with Nova-specific brevity rules prepended
                        const baseInstructions = this.systemInstruction || 'You are Curio, a helpful robot friend.';
                        const novaPrefix = `CRITICAL VOICE RULES:
- You are speaking aloud in real-time. Keep responses SHORT (1-2 sentences max).
- NEVER narrate your reasoning, thought process, or chain of thought. NEVER say "Let me parse that data", "I should present this", "Looking at the forecast", etc.
- NEVER repeat the user's question back to them.
- Go STRAIGHT to the answer. Be direct and conversational.
- For weather: just say the temperature and conditions in one sentence. Do not read the entire forecast unless asked.
- For tool results: summarize the key info in 1 sentence. Do not dump raw data.
- For device control (lights, switches, locks, thermostats): just confirm briefly. "Done", "Light's on", "Turned off", "Locked". No extra commentary.
- For notes, reminders, and Obsidian: just confirm. "Saved", "Note created", "Got it". Do not read back the content unless asked.
- NEVER over-explain what you just did. The user can see the card on screen.

`;
                        // Configure session
                        ws.send(JSON.stringify({
                            type: 'session.update',
                            session: {
                                type: 'realtime',
                                instructions: novaPrefix + baseInstructions,
                                audio: {
                                    input: {
                                        turn_detection: { threshold: 0.5 },
                                    },
                                    output: {
                                        voice: this._voiceName,
                                    },
                                },
                                tools: novaTools,
                                tool_choice: 'auto',
                                max_output_tokens: 1024,
                            },
                        }));
                    } else if (msg.type === 'session.updated') {
                        console.log('[NovaClient] Session configured');
                        resolve();
                    } else if (msg.type === 'error') {
                        console.error('[NovaClient] Session error:', msg.error);
                        clearTimeout(timeout);
                        reject(new Error(msg.error?.message || 'Nova session error'));
                    }
                };
            });

            // Session is ready -- set up audio and message handling
            lockAudioSuspend();
            const captureContext = getSharedAudioContext(true);
            this.audioContext = captureContext;
            this.audio.setAudioContext(captureContext);

            if (!audioStream && !(await requestElectronMediaAccess('microphone'))) {
                throw new Error('Microphone access was not granted.');
            }
            const micStream = audioStream || await navigator.mediaDevices.getUserMedia({
                audio: buildLiveSessionMicConstraints(NOVA_SAMPLE_RATE),
            });
            this.mediaStream = micStream;
            this.inputSource = captureContext.createMediaStreamSource(micStream);

            this.processor = await createNovaPcmCaptureWorkletNode(
                captureContext,
                (data) => {
                    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.isMuted) return;

                    let processedData = data;
                    const isAiSpeaking = this.audio.isPlayingOrRecent || this.lastStatus?.isSpeaking;

                    if (this.muteMicWhileSpeaking && isAiSpeaking) {
                        if (!this._duckBuffer || this._duckBuffer.length !== data.length) {
                            this._duckBuffer = new Float32Array(data.length);
                        }
                        for (let i = 0; i < data.length; i++) {
                            this._duckBuffer[i] = data[i] * 0.08;
                        }
                        processedData = this._duckBuffer;
                    }

                    const pcm16 = floatTo16BitPcm(processedData);
                    const base64 = encodeBytesToBase64(new Uint8Array(pcm16.buffer));
                    try {
                        this.ws!.send(JSON.stringify({
                            type: 'input_audio_buffer.append',
                            audio: base64,
                        }));
                    } catch { /* WebSocket may be closing */ }
                },
                512,
                this.voiceGateThreshold,
            );

            this.inputSource.connect(this.processor);

            // Set up the main message handler
            ws.onmessage = (event) => {
                let msg: any;
                try { msg = JSON.parse(event.data as string); } catch { return; }
                this.handleNovaMessage(msg);
            };

            ws.onclose = (e) => {
                console.log('[NovaClient] WebSocket closed:', e.code, e.reason);
                this.onStatusChange({ ...this.lastStatus!, isConnected: false, isSpeaking: false });
                this.disconnect();
            };

            ws.onerror = () => {
                this.onStatusChange({ ...this.lastStatus!, isConnected: false, isSpeaking: false, error: 'Connection error' });
                this.disconnect();
            };

            this.onStatusChange({
                isConnected: true, isSpeaking: false, error: null,
            });

        } catch (e: any) {
            let errorMsg = e.message || 'Failed to connect';
            if (isSafariBrowser && e?.name === 'NotAllowedError') {
                errorMsg = 'Microphone access denied. Check Safari > Settings > Websites > Microphone AND macOS System Settings > Privacy & Security > Microphone.';
            }
            this.onStatusChange({ isConnected: false, isSpeaking: false, error: errorMsg });
            this.disconnect();
            throw e;
        }
    }

    private handleNovaMessage(msg: any) {
        const eventType = msg.type;

        switch (eventType) {
            case 'error':
                console.error('[NovaClient] Error:', msg.error);
                this.onStatusChange({
                    ...this.lastStatus!,
                    error: msg.error?.message || 'Nova error',
                });
                break;

            case 'conversation.item.input_audio_transcription.completed':
                if (msg.transcript) {
                    this.transcripts.mergeUserChunk(msg.transcript);
                    this.onStatusChange({
                        ...this.lastStatus!,
                        transcript: this.transcripts.pendingUser,
                        userTranscript: this.transcripts.pendingUser,
                    });
                }
                break;

            case 'response.output_audio.delta':
                if (msg.delta) {
                    this.onStatusChange({ ...this.lastStatus!, isSpeaking: true });
                    this.audio.play(msg.delta);
                }
                break;

            case 'response.output_audio_transcript.delta':
                if (msg.delta) {
                    this.transcripts.mergeAssistantChunk(msg.delta);
                    this.onStatusChange({
                        ...this.lastStatus!,
                        transcript: this.transcripts.pendingAssistant,
                        userTranscript: this.transcripts.pendingUser || null,
                        modelTranscript: this.transcripts.pendingAssistant,
                    });
                }
                break;

            case 'response.output_audio_transcript.done':
                // Final transcript for the turn
                if (msg.transcript) {
                    this.transcripts.mergeAssistantChunk(msg.transcript);
                }
                break;

            case 'response.function_call_arguments.done':
                // Nova sends tool calls as individual events
                this.handleNovaToolCall(msg);
                break;

            case 'response.done': {
                // End of response -- finalize turn
                const response = msg.response;
                if (response?.output) {
                    for (const item of response.output) {
                        if (item.type === 'function_call') {
                            this.handleNovaToolCall(item);
                        }
                    }
                }

                this.transcripts.finalizeTurn();

                // End-of-turn card analysis
                const lastAiEntry = this.transcripts.history[this.transcripts.history.length - 1];
                const aiText = lastAiEntry?.speaker === 'ai' ? lastAiEntry.text : '';

                // Parse text interceptors (YOUTUBE_SEARCH, IMAGE_SEARCH) from final text
                if (this.onCardEvent && aiText) {
                    this.parseTextInterceptors(aiText);
                }

                this.onStatusChange({
                    ...this.lastStatus!,
                    transcript: '',
                    userTranscript: null,
                    modelTranscript: null,
                    transcriptHistory: this.transcripts.getHistorySnapshot(),
                });
                break;
            }

            case 'input_audio_buffer.speech_started':
                // User started speaking -- interrupt AI audio
                this.audio.stop();
                break;

            case 'input_audio_buffer.speech_stopped':
            case 'input_audio_buffer.committed':
                // User stopped speaking / audio committed
                break;

            case 'conversation.item.input_audio_transcription.delta':
                // Streaming user speech transcription
                if (msg.delta) {
                    this.transcripts.mergeUserChunk(msg.delta);
                    this.onStatusChange({
                        ...this.lastStatus!,
                        transcript: this.transcripts.pendingUser,
                        userTranscript: this.transcripts.pendingUser,
                    });
                }
                break;

            case 'response.output_text.delta':
                // Streaming text output (non-audio text responses)
                if (msg.delta) {
                    this.transcripts.mergeAssistantChunk(msg.delta);
                    this.onStatusChange({
                        ...this.lastStatus!,
                        transcript: this.transcripts.pendingAssistant,
                        modelTranscript: this.transcripts.pendingAssistant,
                    });
                }
                break;

            case 'response.output_text.done':
            case 'response.content_part.added':
            case 'response.content_part.done':
            case 'response.output_item.added':
            case 'response.output_item.done':
                // Structural events -- no action needed
                break;

            default:
                // Log unhandled events for debugging
                if (!eventType.startsWith('rate_limits') && eventType !== 'response.created'
                    && eventType !== 'conversation.item.added' && eventType !== 'conversation.item.done'
                    && eventType !== 'response.output_audio.done') {
                    console.log('[NovaClient] Unhandled event:', eventType);
                }
                break;
        }
    }

    private parseTextInterceptors(text: string) {
        if (!this.onCardEvent) return;
        const youtubeMatch = text.match(/YOUTUBE_SEARCH:\s*(.+)$/m);
        const imageMatch = text.match(/IMAGE_SEARCH:\s*(.+)$/m);
        if (youtubeMatch) {
            const query = youtubeMatch[1].trim();
            try {
                this.onCardEvent({ type: 'youtube', data: { searchQuery: query, title: query }, persistent: true });
            } catch {}
        }
        if (imageMatch) {
            const query = imageMatch[1].trim();
            try {
                this.onCardEvent({ type: 'image', data: { query, imageUrl: '' } });
            } catch {}
        }
    }

    private async handleNovaToolCall(item: any) {
        const callId = item.call_id || item.id;
        const name = item.name;
        let args: any = {};
        try {
            args = typeof item.arguments === 'string' ? JSON.parse(item.arguments) : (item.arguments || {});
        } catch {
            args = {};
        }

        console.log('[NovaClient] Tool call:', name, args);

        const ctx = {
            onCardEvent: (event: CardEvent) => this.emitCardDeduped(event),
            entityCache: this.entityCache,
            handler: this.handler,
            onMcpToolCall: this.onMcpToolCall,
            disconnect: () => this.disconnect(),
            startHaCameraStream: (entityId: string, baseUrl: string, token: string) =>
                this.haCamera.start(entityId, baseUrl, token, () => {
                    // Notify Nova that camera was closed
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.sendTextTurn('[System: The user closed the camera card. The camera feed is no longer visible.]');
                    }
                }),
            stopHaCameraStream: (restore?: boolean) => this.haCamera.stop(restore),
            isHaCameraStreaming: this.haCamera.isStreaming,
        };

        let result: any = { success: true };
        let emittedCard = false;

        const handler = getToolHandler(name);
        if (handler) {
            const handlerResult = await handler(args, ctx);
            result = handlerResult.result;
            emittedCard = handlerResult.emittedCard;
        } else if (this.onMcpToolCall) {
            try {
                result = await this.onMcpToolCall(name, args);
            } catch (e) {
                result = { success: false, error: (e as Error).message };
            }
        }

        if (emittedCard || interceptForDeviceCard(name, args, result, this.entityCache, (e: CardEvent) => this.emitCardDeduped(e))) {
            // Card was emitted by tool handler or device interceptor
        }

        // Send tool result back to Nova
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'function_call_output',
                    call_id: callId,
                    output: JSON.stringify(sanitizeToolResultForModel(result)),
                },
            }));
            // Nova with server VAD automatically generates responses after
            // receiving tool output -- no need to send response.create.
        }
    }

    sendTextTurn(text: string) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.transcripts.pendingUser = text;
        this.onStatusChange({
            ...this.lastStatus!,
            userTranscript: text,
            transcript: text,
            transcriptHistory: this.transcripts.getHistorySnapshot(),
        });
        // Stop local audio playback so the new response isn't mixed with the old one
        this.audio.stop();
        this.onStatusChange({ ...this.lastStatus!, isSpeaking: false });
        const eventId = 'evt_text_' + Date.now();
        this.ws.send(JSON.stringify({
            event_id: eventId,
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text }],
            },
        }));
    }

    /**
     * Send a silent system note so the model knows what cards are on screen
     * without triggering a spoken response.
     */
    sendSystemNote(text: string) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const eventId = 'evt_sys_' + Date.now();
        try {
            this.ws.send(JSON.stringify({
                event_id: eventId,
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'system',
                    content: [{ type: 'input_text', text: `[System: ${text}]` }],
                },
            }));
        } catch { /* WebSocket may be closing */ }
    }

    sendVideoFrame(_base64: string): boolean {
        // Nova Sonic does not support native vision input.
        // Vision frames are not sent. Return false to indicate unsupported.
        return false;
    }

    updateAudioStream(stream: MediaStream) {
        if (!this.audioContext || !this.processor) return;
        if (this.inputSource) {
            try { this.inputSource.disconnect(); } catch {}
        }
        this.mediaStream = stream;
        this.inputSource = this.audioContext.createMediaStreamSource(stream);
        this.inputSource.connect(this.processor);
    }

    sendAudioStreamEnd() {
        // Nova uses server-side VAD, no explicit audio stream end needed.
        // But we can commit the buffer if needed.
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
            } catch {}
        }
    }

    async disconnect() {
        this.vision.clear();
        if (this.haCamera.isStreaming) {
            if (this.onCardEvent) {
                try { this.onCardEvent({ type: 'close_camera', data: {} }); } catch {}
            }
        }
        this.haCamera.dispose(false);
        this.audio.stop();
        unlockAudioSuspend();

        if (this.processor) try { this.processor.disconnect(); } catch {}
        if (this.inputSource) try { this.inputSource.disconnect(); } catch {}
        this.audio.clearAudioContext();
        this.processor = null;
        this.inputSource = null;

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
            this.mediaStream = null;
        }
        this.audioContext = null;

        if (this.ws) {
            try { this.ws.close(); } catch {}
            this.ws = null;
        }

        this._recentCardTypes.clear();
        this.onStatusChange({ isConnected: false, isSpeaking: false, error: null });
    }
}
