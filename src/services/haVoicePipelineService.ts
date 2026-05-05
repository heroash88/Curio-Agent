/**
 * HA Voice Pipeline Service
 *
 * Manages a Home Assistant Assist voice pipeline session over WebSocket.
 * Uses browser Web Speech API for STT, then sends recognized text to HA's
 * pipeline with start_stage: "intent" for intent processing + TTS.
 *
 * This avoids the complexity of binary audio streaming over WebSocket
 * and works reliably with HA Cloud STT and local STT providers.
 *
 * Flow:
 * 1. Connect to ws://<ha>/api/websocket, authenticate
 * 2. Browser Web Speech API transcribes user speech
 * 3. Send text via assist_pipeline/run { start_stage: "intent", input: { text } }
 * 4. Receive intent-end (response text) and tts-end (audio URL)
 * 5. Play TTS audio from HA
 */

import { getHaMcpUrl, getHaVoicePipelineId } from '../utils/settingsStorage';
import { getHaMcpTokenAsync } from '../utils/settingsStorage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HaVoicePipelineStatus =
    | 'disconnected'
    | 'connecting'
    | 'authenticating'
    | 'ready'
    | 'listening'
    | 'processing'
    | 'speaking'
    | 'error';

export interface HaVoicePipelineCallbacks {
    onStatusChange: (status: HaVoicePipelineStatus) => void;
    onTranscript: (text: string, isFinal: boolean) => void;
    onIntentResult: (responseText: string, conversationId?: string) => void;
    onTtsUrl: (url: string) => void;
    onError: (code: string, message: string) => void;
    onRunEnd: () => void;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let ws: WebSocket | null = null;
let status: HaVoicePipelineStatus = 'disconnected';
let callbacks: HaVoicePipelineCallbacks | null = null;
let msgId = 1;
let conversationId: string | null = null;
let activePipelineSubId: number | null = null;

// Web Speech API
let recognition: any = null;
let continuousListening = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getHaVoicePipelineStatus(): HaVoicePipelineStatus {
    return status;
}

export function isHaVoicePipelineConnected(): boolean {
    return status !== 'disconnected' && status !== 'error' && status !== 'connecting' && status !== 'authenticating';
}

/**
 * Connect to HA WebSocket and authenticate.
 */
export async function connectHaVoicePipeline(
    cbs: HaVoicePipelineCallbacks
): Promise<void> {
    callbacks = cbs;

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }

    const haUrl = getHaMcpUrl();
    const token = await getHaMcpTokenAsync();
    if (!haUrl || !token) {
        setStatus('error');
        cbs.onError('config', 'HA URL or token not configured');
        return;
    }

    const wsUrl = haUrl
        .replace(/^http/, 'ws')
        .replace(/\/+$/, '') + '/api/websocket';

    setStatus('connecting');
    msgId = 1;

    return new Promise<void>((resolve, reject) => {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            setStatus('authenticating');
        };

        ws.onmessage = (event) => {
            if (typeof event.data !== 'string') return;

            let msg: any;
            try { msg = JSON.parse(event.data); } catch { return; }

            if (msg.type === 'auth_required') {
                ws?.send(JSON.stringify({ type: 'auth', access_token: token }));
                return;
            }
            if (msg.type === 'auth_ok') {
                setStatus('ready');
                resolve();
                return;
            }
            if (msg.type === 'auth_invalid') {
                setStatus('error');
                callbacks?.onError('auth', msg.message || 'Authentication failed');
                reject(new Error(msg.message || 'Auth failed'));
                return;
            }

            // Pipeline subscription events
            if (msg.type === 'event' && msg.id === activePipelineSubId && msg.event) {
                handlePipelineEvent(msg.event);
                return;
            }

            // Result for pipeline run subscription
            if (msg.type === 'result' && msg.id === activePipelineSubId) {
                if (!msg.success) {
                    const errMsg = msg.error?.message || 'Pipeline run failed';
                    console.error('[HaVoicePipeline] Run failed:', errMsg);
                    callbacks?.onError('run', errMsg);
                    activePipelineSubId = null;
                    setStatus('ready');
                }
                return;
            }
        };

        ws.onerror = () => {
            setStatus('error');
            callbacks?.onError('ws', 'WebSocket connection error');
            reject(new Error('WebSocket error'));
        };

        ws.onclose = () => {
            activePipelineSubId = null;
            if (status !== 'error') {
                setStatus('disconnected');
            }
        };
    });
}

/**
 * Disconnect from HA WebSocket and stop speech recognition.
 */
export function disconnectHaVoicePipeline(): void {
    stopListening();
    conversationId = null;
    activePipelineSubId = null;
    if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
        ws = null;
    }
    setStatus('disconnected');
}

/**
 * Start continuous listening via Web Speech API.
 * Recognized text is sent to HA's intent pipeline automatically.
 */
export function startListening(): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
        callbacks?.onError('stt', 'Speech recognition not supported in this browser');
        return;
    }

    stopListening();
    continuousListening = true;

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        if (interimTranscript) {
            callbacks?.onTranscript(interimTranscript, false);
        }

        if (finalTranscript) {
            callbacks?.onTranscript(finalTranscript, true);
            // Send to HA intent pipeline
            sendTextToHaPipeline(finalTranscript.trim());
        }
    };

    recognition.onerror = (event: any) => {
        console.warn('[HaVoicePipeline] Speech recognition error:', event.error);
        if (event.error === 'no-speech' || event.error === 'aborted') {
            // Normal -- restart if still listening
            if (continuousListening) {
                setTimeout(() => restartRecognition(), 300);
            }
            return;
        }
        callbacks?.onError('stt', `Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
        if (continuousListening && status !== 'processing' && status !== 'speaking') {
            setTimeout(() => restartRecognition(), 300);
        }
    };

    recognition.start();
    setStatus('listening');
    console.log('[HaVoicePipeline] Listening via Web Speech API');
}

/**
 * Stop listening.
 */
export function stopListening(): void {
    continuousListening = false;
    if (recognition) {
        try { recognition.abort(); } catch { /* ignore */ }
        recognition = null;
    }
}

/**
 * Resume listening after TTS playback finishes.
 * Called by the UI when the TTS audio.onended fires.
 */
export function resumeListening(): void {
    if (!continuousListening) return;
    if (status === 'processing') return; // another command already in flight
    setStatus('listening');
    restartRecognition();
}

/**
 * Send a text command directly to HA pipeline (for typed input).
 */
export function sendText(text: string): void {
    sendTextToHaPipeline(text);
}

/**
 * List available pipelines from HA using the active connection.
 */
export async function listPipelines(): Promise<Array<{ id: string; name: string }>> {
    if (!ws || ws.readyState !== WebSocket.OPEN) return [];

    const id = msgId++;
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve([]), 5000);

        const origOnMessage = ws!.onmessage;
        ws!.onmessage = (event: MessageEvent) => {
            if (typeof event.data === 'string') {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'result' && msg.id === id) {
                        clearTimeout(timeout);
                        ws!.onmessage = origOnMessage;
                        if (msg.success && msg.result?.pipelines) {
                            resolve(msg.result.pipelines.map((p: any) => ({ id: p.id, name: p.name })));
                        } else {
                            resolve([]);
                        }
                        return;
                    }
                } catch { /* pass through */ }
            }
            if (origOnMessage) (origOnMessage as any).call(ws, event);
        };
        ws!.send(JSON.stringify({ id, type: 'assist_pipeline/pipeline/list' }));
    });
}

/**
 * Fetch pipelines via a temporary WebSocket connection.
 * Works from the settings modal without needing an active voice session.
 */
export async function fetchPipelinesStandalone(): Promise<Array<{ id: string; name: string }>> {
    // If already connected, use the existing connection
    if (ws && ws.readyState === WebSocket.OPEN) {
        return listPipelines();
    }

    const haUrl = getHaMcpUrl();
    const token = await getHaMcpTokenAsync();
    if (!haUrl || !token) return [];

    const wsUrl = haUrl.replace(/^http/, 'ws').replace(/\/+$/, '') + '/api/websocket';

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            tmpWs.close();
            resolve([]);
        }, 8000);

        const tmpWs = new WebSocket(wsUrl);
        let tmpMsgId = 1;

        tmpWs.onmessage = (event) => {
            if (typeof event.data !== 'string') return;
            let msg: any;
            try { msg = JSON.parse(event.data); } catch { return; }

            if (msg.type === 'auth_required') {
                tmpWs.send(JSON.stringify({ type: 'auth', access_token: token }));
                return;
            }
            if (msg.type === 'auth_ok') {
                const id = tmpMsgId++;
                tmpWs.send(JSON.stringify({ id, type: 'assist_pipeline/pipeline/list' }));
                return;
            }
            if (msg.type === 'auth_invalid') {
                clearTimeout(timeout);
                tmpWs.close();
                resolve([]);
                return;
            }
            if (msg.type === 'result') {
                clearTimeout(timeout);
                tmpWs.close();
                if (msg.success && msg.result?.pipelines) {
                    resolve(msg.result.pipelines.map((p: any) => ({ id: p.id, name: p.name })));
                } else {
                    resolve([]);
                }
                return;
            }
        };

        tmpWs.onerror = () => {
            clearTimeout(timeout);
            resolve([]);
        };

        tmpWs.onclose = () => {
            clearTimeout(timeout);
        };
    });
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function setStatus(s: HaVoicePipelineStatus): void {
    status = s;
    callbacks?.onStatusChange(s);
}

function restartRecognition(): void {
    if (!continuousListening) return;
    try {
        if (recognition) {
            recognition.start();
            setStatus('listening');
        } else {
            startListening();
        }
    } catch {
        // Recognition might still be running, retry
        setTimeout(() => restartRecognition(), 500);
    }
}

/**
 * Temporarily abort recognition without clearing continuousListening,
 * so resumeListening() can restart it after TTS finishes.
 */
function pauseRecognition(): void {
    if (recognition) {
        try { recognition.abort(); } catch { /* ignore */ }
        recognition = null;
    }
}

function sendTextToHaPipeline(text: string): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn('[HaVoicePipeline] Cannot send text -- not connected');
        return;
    }
    if (!text) return;

    setStatus('processing');
    console.log('[HaVoicePipeline] Sending text to HA:', text);

    const id = msgId++;
    activePipelineSubId = id;
    const pipelineId = getHaVoicePipelineId();

    const runMsg: any = {
        id,
        type: 'assist_pipeline/run',
        start_stage: 'intent',
        end_stage: 'tts',
        input: { text },
    };

    if (pipelineId) {
        runMsg.pipeline = pipelineId;
    }
    if (conversationId) {
        runMsg.conversation_id = conversationId;
    }

    ws.send(JSON.stringify(runMsg));
}

function handlePipelineEvent(event: any): void {
    const eventType = event.type;
    const eventData = event.data || {};

    console.log('[HaVoicePipeline] Event:', eventType);

    switch (eventType) {
        case 'run-start':
            // Nothing to do for text-based pipeline
            break;
        case 'intent-end': {
            const response = eventData.intent_output?.response;
            const responseText =
                response?.speech?.plain?.speech ||
                response?.speech?.speech ||
                (typeof response?.plain === 'string' ? response.plain : null) ||
                (typeof response === 'string' ? response : null) ||
                '';
            conversationId = eventData.intent_output?.conversation_id || null;
            callbacks?.onIntentResult(responseText, conversationId || undefined);
            break;
        }
        case 'tts-end': {
            const url = eventData.tts_output?.url || eventData.tts_output?.url_path || null;
            if (url) {
                const haUrl = getHaMcpUrl().replace(/\/+$/, '');
                const fullUrl = url.startsWith('http') ? url : haUrl + url;
                // Pause speech recognition while TTS plays to prevent
                // the mic from picking up the assistant's own voice
                pauseRecognition();
                setStatus('speaking');
                callbacks?.onTtsUrl(fullUrl);
            }
            break;
        }
        case 'run-end': {
            activePipelineSubId = null;
            // Don't restart recognition here -- wait for TTS audio to
            // finish playing. CurioAgentMode calls resumeListening()
            // from the audio.onended handler.
            if (status !== 'speaking') {
                if (continuousListening) {
                    setTimeout(() => {
                        setStatus('listening');
                        restartRecognition();
                    }, 300);
                } else {
                    setStatus('ready');
                }
            }
            callbacks?.onRunEnd();
            break;
        }
        case 'error': {
            activePipelineSubId = null;
            const code = eventData.code || 'unknown';
            const message = eventData.message || 'Pipeline error';
            callbacks?.onError(code, message);
            // Resume listening on error
            if (continuousListening) {
                setTimeout(() => {
                    setStatus('listening');
                    restartRecognition();
                }, 500);
            } else {
                setStatus('ready');
            }
            break;
        }
    }
}
