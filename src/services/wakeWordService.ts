/**
 * Wake word service powered by openwakeword-js + ONNX Runtime Web.
 *
 * The service keeps the detection pipeline local in-browser and supports
 * selecting different wake-word models over time.
 */
import {
    DEFAULT_WAKE_WORD_ID,
    WAKE_WORD_DETECTED_EVENT,
    getWakeWordDefinition,
    resolveModelPath,
    type WakeWordDefinition,
    type WakeWordDetectedDetail
} from './wakeWordCatalog';
import { getSharedAudioContext, lockAudioSuspend, unlockAudioSuspend } from './audioContext';
import { requestElectronMediaAccess } from '../utils/electronMediaAccess';

const WAKE_WORD_DEBUG = import.meta.env.DEV;

// ---------------------------------------------------------------------------
// ORT WASM environment configuration.
// Wake-word models are tiny (mel + embedding + classifier all run in well
// under 10ms single-threaded on a Pi). Multi-threading costs more in worker
// spin-up and cross-thread sync than it saves, and starves the UI thread on
// low-end devices. We force numThreads=1 and enable SIMD for ARM NEON / x86.
// Configured once, lazily, before the first InferenceSession is created.
// ---------------------------------------------------------------------------
let ortEnvConfigured = false;
async function configureOrtEnv(): Promise<void> {
    if (ortEnvConfigured) return;
    ortEnvConfigured = true;
    try {
        const ort: any = await import('onnxruntime-web/wasm');
        if (ort?.env?.wasm) {
            ort.env.wasm.numThreads = 1;
            ort.env.wasm.simd = true;
            ort.env.wasm.proxy = false;
        }
        if (ort?.env) {
            ort.env.logLevel = 'error';
        }
        if (WAKE_WORD_DEBUG) {
            console.debug('[WakeWord] ORT env configured: numThreads=1, simd=true, proxy=false.');
        }
    } catch (error) {
        console.warn('[WakeWord] Failed to configure ORT env:', error);
    }
}

// ---------------------------------------------------------------------------
// RMS energy pre-gate.
// On an idle/silent room, every 80ms frame would otherwise run all three
// ONNX sessions (mel -> embedding -> classifier). Skipping inference when
// the frame is below an energy floor drops idle CPU dramatically. We still
// run inference every SILENT_KEEPALIVE_INTERVAL frames so the internal
// embedding history stays warm and the first real utterance after silence
// is detected reliably.
// ---------------------------------------------------------------------------
const RMS_SILENCE_THRESHOLD = 0.003;
const SILENT_KEEPALIVE_INTERVAL = 8; // ~640ms between keep-alive inferences
let silentFramesSkipped = 0;

function isProbablySilent(samples: Float32Array): boolean {
    // Sample every 4th value; good enough for gating at ~4x lower cost.
    let sumSq = 0;
    let count = 0;
    for (let i = 0; i < samples.length; i += 4) {
        const v = samples[i];
        sumSq += v * v;
        count += 1;
    }
    if (count === 0) return true;
    const rms = Math.sqrt(sumSq / count);
    return rms < RMS_SILENCE_THRESHOLD;
}

/**
 * Linear Downsampler: Converts audio from native hardware rate to 16kHz
 * Uses a pre-allocated buffer to avoid GC pressure on low-end devices.
 */
let downsampleOutputBuffer: Float32Array | null = null;

function downsampleBuffer(buffer: Float32Array, fromRate: number, toRate: number = 16000): Float32Array {
    if (fromRate === toRate) return buffer;
    const ratio = fromRate / toRate;
    const newLength = Math.floor(buffer.length / ratio);
    // Reuse output buffer if same size, otherwise allocate once
    if (!downsampleOutputBuffer || downsampleOutputBuffer.length !== newLength) {
        downsampleOutputBuffer = new Float32Array(newLength);
    }
    const result = downsampleOutputBuffer;
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
        const nextOffsetBuffer = Math.floor((offsetResult + 1) * ratio);
        let accum = 0;
        let count = 0;
        for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
            accum += buffer[i];
            count++;
        }
        result[offsetResult] = count > 0 ? accum / count : 0;
        offsetResult++;
        offsetBuffer = nextOffsetBuffer;
    }
    return result;
}

type StartListeningOptions = {
    onDetect?: (detail: WakeWordDetectedDetail) => void;
    detectionThreshold?: number;
    wakeWordId?: string;
};

type PreloadWakeWordOptions = {
    wakeWordId?: string;
};

const COOLDOWN_MS = 5_000;

type WakeWordModel = {
    init: () => Promise<void>;
    predict: (samples: Float32Array) => Promise<Record<string, number>>;
    reset?: () => void;
};

let OpenWakeWordModel:
    | (new (options: {
        wakewordModels: string[];
        melspectrogramModelPath: string;
        embeddingModelPath: string;
        inferenceFramework: 'onnx';
        wasmPaths: string;
        thresholds: Record<string, number>;
    }) => WakeWordModel)
    | null = null;

let model: WakeWordModel | null = null;
let loadedModelWakeWordId: string | null = null;
let preloadPromise: Promise<WakeWordDefinition> | null = null;
let preloadingWakeWordId: string | null = null;
let modelLoadSequence = 0;
let releaseSequence = 0;
let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let audioWorkletNode: AudioWorkletNode | null = null;
let workletBlobUrl: string | null = null;
let isWorkletRegistered = false;

const workletCode = `
class WakeWordProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.CHUNK_SIZE = 1280;
        // Double-buffer: fill one while the other is being transferred
        this.buffers = [new Float32Array(this.CHUNK_SIZE), new Float32Array(this.CHUNK_SIZE)];
        this.activeBuffer = 0;
        this.chunkIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const inputChannel = inputs[0]?.[0];
        if (!inputChannel) return true;

        for (let index = 0; index < inputChannel.length; index += 1) {
            this.buffers[this.activeBuffer][this.chunkIndex] = inputChannel[index];
            this.chunkIndex += 1;

            if (this.chunkIndex === this.CHUNK_SIZE) {
                const filled = this.buffers[this.activeBuffer];
                // Swap to the other buffer before transferring
                this.activeBuffer = 1 - this.activeBuffer;
                // If the other buffer was transferred and detached, re-allocate it
                if (this.buffers[this.activeBuffer].byteLength === 0) {
                    this.buffers[this.activeBuffer] = new Float32Array(this.CHUNK_SIZE);
                }
                this.chunkIndex = 0;
                // Transfer ownership of the filled buffer to avoid copying
                this.port.postMessage(filled, [filled.buffer]);
            }
        }

        return true;
    }
}
registerProcessor('wake-word-processor', WakeWordProcessor);
`;

let sourceNode: MediaStreamAudioSourceNode | null = null;
let sinkGainNode: GainNode | null = null;
// Input gain applied between sourceNode and audioWorkletNode. Lets the user
// boost a quiet mic (or attenuate a clipping one) from Settings without
// restarting the wake-word pipeline.
let inputGainNode: GainNode | null = null;
let removeResumeListeners: (() => void) | null = null;
let audioSuspendLocked = false;

let isRunning = false;
let isStarting = false;
let isModelReady = false;
let isInferring = false; // Guard against concurrent ONNX sessions
let currentWakeWordId = DEFAULT_WAKE_WORD_ID;
let currentThreshold = getWakeWordDefinition(DEFAULT_WAKE_WORD_ID).threshold;
let onDetectCallback: ((detail: WakeWordDetectedDetail) => void) | null = null;
let lastDetectionTime = 0;
let lastLogTime = 0;
let lastHeartbeatTime = 0;
let startSequence = 0;

// ---------------------------------------------------------------------------
// Periodic "breathe" cycle — stops and restarts the ONNX runtime every N
// minutes to release fragmented WASM heap memory. On a Pi running 24/7 the
// WASM allocator fragments over millions of inference calls and eventually
// OOMs. A brief ~1-2s restart window every 5 minutes keeps memory stable.
// ---------------------------------------------------------------------------
const BREATHE_INTERVAL_MS = 2 * 60_000; // 2 minutes
let breatheTimerId: ReturnType<typeof setTimeout> | null = null;
let breatheRestartOpts: StartListeningOptions | null = null;

function clearBreatheTimer(): void {
    if (breatheTimerId !== null) {
        clearTimeout(breatheTimerId);
        breatheTimerId = null;
    }
}

function scheduleBreathe(): void {
    clearBreatheTimer();
    if (!isRunning) return;
    breatheTimerId = setTimeout(async () => {
        breatheTimerId = null;
        if (!isRunning || isStarting) return;

        const opts = breatheRestartOpts;
        if (!opts) return;

        if (WAKE_WORD_DEBUG) {
            console.debug('[WakeWord] Breathe cycle: restarting to release WASM heap fragmentation...');
        }
        logWakeWordLifecycle('breathe_restart_begin', {
            wakeWordId: opts.wakeWordId ?? currentWakeWordId,
        });

        try {
            // Capture opts before stopListening clears breatheRestartOpts
            const restartOpts = { ...opts };

            // Stop tears down the audio graph and releases the ONNX model
            stopListening();

            // Brief pause to let the browser GC the WASM pages
            await new Promise(resolve => setTimeout(resolve, 200));

            // Restart with the same configuration
            await startListening(restartOpts);
            logWakeWordLifecycle('breathe_restart_complete', {
                wakeWordId: restartOpts.wakeWordId ?? currentWakeWordId,
            });
        } catch (error) {
            if (!(error instanceof Error && error.message === 'Wake word start aborted')) {
                console.warn('[WakeWord] Breathe cycle restart failed:', error);
            }
            logWakeWordLifecycle('breathe_restart_failed', {
                wakeWordId: opts.wakeWordId ?? currentWakeWordId,
                reason: error instanceof Error ? error.message : String(error),
            });
        }
    }, BREATHE_INTERVAL_MS);
}

let pendingSamples: Float32Array | null = null;
const ACCUMULATOR_SIZE = 1280;
const accumulator = new Float32Array(ACCUMULATOR_SIZE);
// Pre-allocated buffer for pending samples — avoids GC pressure from new Float32Array on every chunk
const pendingBuffer = new Float32Array(ACCUMULATOR_SIZE);
let accumulatorOffset = 0;

/**
 * Live-update the wake-word input gain. Called when the user drags the
 * mic-gain slider in Settings -- no need to tear down and restart the
 * whole audio pipeline. Clamps input to the safe range.
 */
export function setInputGainDb(db: number): void {
    if (!inputGainNode) return;
    const clamped = Math.min(24, Math.max(-12, Number.isFinite(db) ? db : 0));
    const linear = Math.pow(10, clamped / 20);
    try {
        // setTargetAtTime ramps the gain smoothly so large jumps don't pop.
        const now = inputGainNode.context.currentTime;
        inputGainNode.gain.setTargetAtTime(linear, now, 0.02);
    } catch {
        // Fallback for contexts that don't accept setTargetAtTime
        inputGainNode.gain.value = linear;
    }
}

// Subscribe once at module load so slider changes in Settings take effect
// live without restarting the wake-word pipeline.
if (typeof window !== 'undefined') {
    window.addEventListener('curio:mic-gain-changed', (e: Event) => {
        const detail = (e as CustomEvent<{ db: number }>).detail;
        if (detail && typeof detail.db === 'number') setInputGainDb(detail.db);
    });
}

const getModelKeyFromPath = (modelPath: string) =>
    (modelPath.split('/').pop() || modelPath).replace(/\.onnx$/i, '').replace(/\\/g, '/');

const getTimingNow = (): number =>
    typeof performance !== 'undefined' ? performance.now() : Date.now();

const logWakeWordTiming = (label: string, startedAt: number): void => {
    console.info(`[WakeWord][timing] ${label}: ${(getTimingNow() - startedAt).toFixed(1)}ms`);
};

const logWakeWordLifecycle = (event: string, detail?: Record<string, unknown>): void => {
    const suffix = detail && Object.keys(detail).length > 0
        ? ` ${Object.entries(detail)
            .map(([key, value]) => `${key}=${String(value)}`)
            .join(' ')}`
        : '';
    console.info(`[WakeWord][lifecycle] ${event}${suffix}`);
};

function clearLoadedModelCache(): void {
    // Release ONNX sessions held by the model to free WASM heap pages.
    // openwakeword-js doesn't expose dispose(), but its InferenceSession
    // fields are only `private` in TS (not runtime-private), so we can
    // reach in and call release() on each session explicitly. This is the
    // only reliable way to free memory on low-end devices - GC alone is
    // unreliable for WASM-backed buffers.
    if (model) {
        const m = model as any;
        const releaseSession = (sess: any) => {
            try { sess?.release?.(); } catch { /* best effort */ }
        };

        // Standard dispose paths first (in case the lib ever adds them).
        try {
            if (typeof m.dispose === 'function') m.dispose();
            else if (typeof m.destroy === 'function') m.destroy();
        } catch { /* best effort */ }

        // Then explicitly release the known sessions in openwakeword-js.
        releaseSession(m.melSession);
        releaseSession(m.embeddingSession);
        releaseSession(m.vadSession);

        const customSessions = m.customSessions;
        if (customSessions && typeof customSessions.values === 'function') {
            for (const sess of customSessions.values()) {
                releaseSession(sess);
            }
            try { customSessions.clear?.(); } catch { /* best effort */ }
        }

        // Null the private refs so the model object itself can be GC'd
        // without holding onto detached sessions.
        try {
            m.melSession = null;
            m.embeddingSession = null;
            m.vadSession = null;
        } catch { /* best effort */ }
    }
    model = null;
    loadedModelWakeWordId = null;
    preloadPromise = null;
    preloadingWakeWordId = null;
}

function invalidateLoadedModelCache(): void {
    modelLoadSequence += 1;
    clearLoadedModelCache();
}

async function createWakeWordModel(
    wakeWord: WakeWordDefinition,
    threshold: number
): Promise<WakeWordModel> {
    const ModelConstructor = await getWakeWordModelConstructor();
    if (!ModelConstructor) {
        throw new Error('Model constructor is not available');
    }

    if (WAKE_WORD_DEBUG) {
        console.debug('[WakeWord] Lifecycle: Loading model configuration...');
    }

    const modelPath = await resolveModelPath(wakeWord);

    return new ModelConstructor({
        wakewordModels: [modelPath],
        melspectrogramModelPath: '/models/melspectrogram.onnx',
        embeddingModelPath: '/models/embedding_model.onnx',
        inferenceFramework: 'onnx' as const,
        wasmPaths: window.location.origin + '/models/',
        thresholds: {
            [getModelKeyFromPath(modelPath)]: threshold
        }
    });
}

export function getCurrentWakeWord(): WakeWordDefinition {
    return getWakeWordDefinition(currentWakeWordId);
}

async function getWakeWordModelConstructor() {
    if (!OpenWakeWordModel) {
        // Configure ORT env BEFORE the module initializes any sessions.
        await configureOrtEnv();
        // @ts-ignore
        const openWakeWordModule = await import('openwakeword-js');
        OpenWakeWordModel = openWakeWordModule.Model;
    }

    return OpenWakeWordModel;
}

export async function preloadWakeWordModel(opts: PreloadWakeWordOptions = {}): Promise<WakeWordDefinition> {
    const wakeWord = getWakeWordDefinition(opts.wakeWordId);

    if (model && loadedModelWakeWordId === wakeWord.id) {
        return wakeWord;
    }

    if (preloadPromise && preloadingWakeWordId === wakeWord.id) {
        await preloadPromise;
        return wakeWord;
    }

    const preloadStartedAt = getTimingNow();
    const loadSequence = ++modelLoadSequence;
    const threshold = currentWakeWordId === wakeWord.id ? currentThreshold : wakeWord.threshold;

    preloadingWakeWordId = wakeWord.id;
    if (loadedModelWakeWordId && loadedModelWakeWordId !== wakeWord.id) {
        clearLoadedModelCache();
    }

    const task = (async (): Promise<WakeWordDefinition> => {
        console.info(`[WakeWord] Preloading runtime for "${wakeWord.phrase}"...`);
        const nextModel = await createWakeWordModel(wakeWord, threshold);
        const initStartedAt = getTimingNow();
        await nextModel.init();
        logWakeWordTiming(`model.init(${wakeWord.id})`, initStartedAt);

        if (loadSequence !== modelLoadSequence) {
            return wakeWord;
        }

        model = nextModel;
        loadedModelWakeWordId = wakeWord.id;
        console.info(`[WakeWord] Preloaded runtime for "${wakeWord.phrase}".`);
        return wakeWord;
    })();

    preloadPromise = task;

    try {
        const result = await task;
        if (loadSequence === modelLoadSequence) {
            logWakeWordTiming(`preload(${wakeWord.id})`, preloadStartedAt);
        }
        return result;
    } catch (error) {
        if (loadSequence === modelLoadSequence) {
            clearLoadedModelCache();
        }
        throw error;
    } finally {
        if (preloadPromise === task) {
            preloadPromise = null;
        }
        if (loadSequence === modelLoadSequence && preloadingWakeWordId === wakeWord.id) {
            preloadingWakeWordId = null;
        }
    }
}

function dispatchDetected(detail: WakeWordDetectedDetail): void {
    window.dispatchEvent(new CustomEvent<WakeWordDetectedDetail>(WAKE_WORD_DETECTED_EVENT, { detail }));
    onDetectCallback?.(detail);
}

async function processAudio(samples: Float32Array): Promise<void> {
    if (!model || !isModelReady || isInferring) return;

    isInferring = true;
    try {
        const scores = await model.predict(samples);
        const now = Date.now();

        if (WAKE_WORD_DEBUG && now - lastLogTime > 1000) {
            const display = Object.entries(scores)
                .map(([key, value]) => `${key}=${value.toFixed(3)}`)
                .join(', ');
            if (display) {
                console.debug(`[WakeWord] scores: ${display}`);
            }
            lastLogTime = now;
        }

        if (now - lastDetectionTime < COOLDOWN_MS) {
            return;
        }

        const wakeWord = getCurrentWakeWord();
        const targetKey = getModelKeyFromPath(wakeWord.modelPath);
        const score = scores[targetKey] ?? Math.max(...Object.values(scores), 0);

        // Debug trace for scores that are "close" to help troubleshoot reliability
        if (WAKE_WORD_DEBUG && score > 0.20 && score < currentThreshold && now - lastLogTime > 500) {
            console.debug(`[WakeWord] "${targetKey}" detected at ${score.toFixed(3)} - below threshold ${currentThreshold}`);
        }

        if (score >= currentThreshold) {
            const detail: WakeWordDetectedDetail = {
                id: wakeWord.id,
                label: wakeWord.label,
                phrase: wakeWord.phrase,
                score
            };

            console.log(`[WakeWord] SUCCESS: "${wakeWord.phrase}" (${targetKey}) detected at score ${score.toFixed(3)}`);
            lastDetectionTime = now;
            model.reset?.();
            dispatchDetected(detail);
        }
    } catch (error) {
        console.warn('[WakeWord] Inference failed:', error);
    } finally {
        isInferring = false;
    }
}

function enqueueOrProcess(samples: Float32Array): void {
    if (!isRunning || !isModelReady || !accumulator) return;

    if (WAKE_WORD_DEBUG) {
        const now = Date.now();
        if (now - lastHeartbeatTime > 5000) {
            console.debug(`[WakeWord] heart-beat: Audio flowing (${samples.length} samples, offset ${accumulatorOffset})`);
            lastHeartbeatTime = now;
        }
    }

    for (let i = 0; i < samples.length; i++) {
        accumulator[accumulatorOffset] = samples[i];
        accumulatorOffset++;

        if (accumulatorOffset >= ACCUMULATOR_SIZE) {
            // Buffer is full (1280 samples at 16kHz).
            // Energy pre-gate: skip ONNX inference on near-silent frames.
            // Run a keep-alive inference every SILENT_KEEPALIVE_INTERVAL
            // frames so the embedding history stays warm and we don't
            // miss the first utterance after a silent stretch.
            const shouldSkipInference =
                isProbablySilent(accumulator) &&
                silentFramesSkipped < SILENT_KEEPALIVE_INTERVAL;

            accumulatorOffset = 0;

            if (shouldSkipInference) {
                silentFramesSkipped += 1;
                continue;
            }

            silentFramesSkipped = 0;

            // Copy into pre-allocated pending buffer to avoid GC pressure
            pendingBuffer.set(accumulator);
            pendingSamples = pendingBuffer;

            if (!isInferring) {
                void drainLatestSamples();
            }

            // IMPORTANT: If we have more samples in the incoming buffer,
            // the loop continues and fills the NEXT frame starting from offset 0.
        }
    }
}

async function drainLatestSamples(): Promise<void> {
    while (pendingSamples && isRunning && isModelReady && model && !isInferring) {
        const nextSamples = pendingSamples;
        pendingSamples = null;
        await processAudio(nextSamples);
    }
}


function teardownAudioGraph(): void {
    if (audioWorkletNode) {
        try { audioWorkletNode.disconnect(); } catch { /* already disconnected */ }
        audioWorkletNode = null;
    }
    if (inputGainNode) {
        try { inputGainNode.disconnect(); } catch { /* already disconnected */ }
        inputGainNode = null;
    }
    if (sourceNode) {
        try { sourceNode.disconnect(); } catch { /* already disconnected */ }
        sourceNode = null;
    }
    if (sinkGainNode) {
        try { sinkGainNode.disconnect(); } catch { /* already disconnected */ }
        sinkGainNode = null;
    }

    removeResumeListeners?.();
    removeResumeListeners = null;

    if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
    }

    if (audioSuspendLocked) {
        unlockAudioSuspend();
        audioSuspendLocked = false;
    }

    // Revoke blob URL to free memory, but DON'T reset isWorkletRegistered —
    // the processor is registered on the shared AudioContext which persists.
    // Re-registering the same name throws NotSupportedError.
    if (workletBlobUrl) {
        URL.revokeObjectURL(workletBlobUrl);
        workletBlobUrl = null;
    }

    audioContext = null;
}

export async function startListening(opts: StartListeningOptions = {}): Promise<WakeWordDefinition> {
    const wakeWord = getWakeWordDefinition(opts.wakeWordId);
    const nextThreshold = opts.detectionThreshold ?? wakeWord.threshold;
    const wakeWordChanged = currentWakeWordId !== wakeWord.id;

    onDetectCallback = opts.onDetect ?? onDetectCallback;

    if (isRunning || isStarting) {
        currentWakeWordId = wakeWord.id;
        currentThreshold = nextThreshold;
        if (!wakeWordChanged) {
            logWakeWordLifecycle('start_skipped', {
                wakeWordId: wakeWord.id,
                reason: isStarting ? 'already_starting' : 'already_running',
            });
            return wakeWord;
        }
        stopListening();
    }

    if (loadedModelWakeWordId && loadedModelWakeWordId !== wakeWord.id) {
        releaseWakeWordRuntime();
    }

    const sequence = ++startSequence;
    const listeningStartedAt = getTimingNow();
    isStarting = true;
    isRunning = true;
    isModelReady = false;
    currentWakeWordId = wakeWord.id;
    currentThreshold = nextThreshold;
    pendingSamples = null;
    accumulatorOffset = 0;
    silentFramesSkipped = 0;
    lastDetectionTime = 0;
    lastLogTime = 0;
    logWakeWordLifecycle('start_begin', {
        wakeWordId: wakeWord.id,
        threshold: nextThreshold.toFixed(3),
    });

    try {
        await preloadWakeWordModel({ wakeWordId: wakeWord.id });

        if (sequence !== startSequence || !isRunning) {
            throw new Error('Wake word start aborted');
        }

        if (!model || loadedModelWakeWordId !== wakeWord.id) {
            throw new Error(`Wake word runtime for "${wakeWord.id}" is not available`);
        }

        try {
            model.reset?.();
        } catch (error) {
            console.warn('[WakeWord] Failed to reset cached model state before listening:', error);
        }

        if (WAKE_WORD_DEBUG) {
            console.debug('[WakeWord] Lifecycle: Reusing preloaded model runtime.');
        }
        if (!mediaStream) {
            const getUserMediaStartedAt = getTimingNow();
            logWakeWordLifecycle('mic_acquire_requested', {
                wakeWordId: wakeWord.id,
            });
            const nativeAccess = await requestElectronMediaAccess('microphone');
            if (!nativeAccess) {
                throw new Error('Microphone access was not granted.');
            }
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: { ideal: 16000 }
                }
            });
            // If stopListening was called while we were awaiting getUserMedia,
            // stop the newly acquired stream immediately to free the mic.
            if (sequence !== startSequence || !isRunning) {
                stream.getTracks().forEach((t) => t.stop());
                logWakeWordLifecycle('mic_acquire_aborted', {
                    wakeWordId: wakeWord.id,
                });
                throw new Error('Wake word start aborted');
            }
            mediaStream = stream;
            logWakeWordTiming('getUserMedia', getUserMediaStartedAt);
            logWakeWordLifecycle('mic_acquired', {
                wakeWordId: wakeWord.id,
                trackCount: stream.getTracks().length,
            });
            if (WAKE_WORD_DEBUG) {
                console.debug('[WakeWord] Lifecycle: Microphone access granted.');
            }
        } else if (WAKE_WORD_DEBUG) {
            console.debug('[WakeWord] Lifecycle: Microphone already prepared.');
            logWakeWordLifecycle('mic_reused', {
                wakeWordId: wakeWord.id,
                trackCount: mediaStream.getTracks().length,
            });
        }

        if (sequence !== startSequence || !isRunning) {
            throw new Error('Wake word start aborted');
        }

        if (!audioContext) {
            if (WAKE_WORD_DEBUG) {
                console.debug('[WakeWord] Lifecycle: Requesting shared AudioContext...');
            }
            audioContext = getSharedAudioContext(true);
        } else if (WAKE_WORD_DEBUG) {
            console.debug('[WakeWord] Lifecycle: Reusing existing AudioContext.');
        }
        if (WAKE_WORD_DEBUG) {
            console.debug('[WakeWord] Lifecycle: AudioContext state:', audioContext.state);
        }

        if (!workletBlobUrl) {
            const blob = new Blob([workletCode], { type: 'application/javascript' });
            workletBlobUrl = URL.createObjectURL(blob);
        }

        const workletReadyStartedAt = getTimingNow();
        lockAudioSuspend(); // Prevent auto-suspend while listening
        audioSuspendLocked = true;
        if (!isWorkletRegistered && audioContext.audioWorklet) {
            if (WAKE_WORD_DEBUG) {
                console.debug('[WakeWord] Lifecycle: Registering AudioWorklet module...');
            }
            await audioContext.audioWorklet.addModule(workletBlobUrl);
            isWorkletRegistered = true;
            if (WAKE_WORD_DEBUG) {
                console.debug('[WakeWord] Lifecycle: AudioWorklet module registered.');
            }
        } else if (WAKE_WORD_DEBUG) {
            console.debug('[WakeWord] Lifecycle: AudioWorklet module already registered.');
        }

        // Try to resume immediately - might fail if not in a user gesture at THIS exact moment, 
        // but we now call this from user gestures in the UI.
        if (audioContext.state !== 'running') {
            try {
                if (WAKE_WORD_DEBUG) {
                    console.debug('[WakeWord] Attempting to resume AudioContext...');
                }
                await audioContext.resume();
                if (WAKE_WORD_DEBUG) {
                    console.debug('[WakeWord] AudioContext resume status:', audioContext.state);
                }
            } catch (error) {
                console.warn('[WakeWord] AudioContext resume was blocked; will wait for interaction.', error);
            }
        }

        if (audioContext.state !== 'running') {
            const handleResumeAttempt = () => {
                void resumeAudioContextOnInteraction();
            };

            window.addEventListener('pointerdown', handleResumeAttempt, { passive: true });
            window.addEventListener('keydown', handleResumeAttempt, { passive: true });
            window.addEventListener('touchstart', handleResumeAttempt, { passive: true });

            removeResumeListeners = () => {
                window.removeEventListener('pointerdown', handleResumeAttempt);
                window.removeEventListener('keydown', handleResumeAttempt);
                window.removeEventListener('touchstart', handleResumeAttempt);
            };
        }

        sourceNode = audioContext.createMediaStreamSource(mediaStream);
        
        // 100% RAW AUDIO INPUT (Matching Test CURIO bit-for-bit)
        audioWorkletNode = new AudioWorkletNode(audioContext, 'wake-word-processor');

        // User-adjustable mic gain from Settings. 0 dB = unity = 1.0.
        // IMPORTANT: only insert the GainNode when the user has actually
        // configured a non-zero gain. Inserting a pass-through gain node
        // when it isn't needed adds a node to the audio graph that can
        // subtly shift timing for the wake-word worklet on low-end devices.
        // Read lazily so we don't couple the service to React/state hooks.
        const readMicGainDb = (): number => {
            try {
                const raw = localStorage.getItem('curio_mic_gain_db');
                if (!raw) return 0;
                const n = parseFloat(raw);
                return Number.isFinite(n) ? Math.min(24, Math.max(-12, n)) : 0;
            } catch { return 0; }
        };
        const dbToLinear = (db: number) => Math.pow(10, db / 20);
        const initialGainDb = readMicGainDb();
        const nativeRate = audioContext.sampleRate;
        audioWorkletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
            if (!isRunning) return;
            // Linear downsampling to 16kHz
            const resampled = downsampleBuffer(event.data, nativeRate, 16000);
            enqueueOrProcess(resampled);
        };

        // Chain: Mic -> [optional Gain] -> Wakeword Processor.
        // Routing mic audio to audioContext.destination triggers browser audio
        // ducking which lowers YouTube/music volume. Use a silent
        // MediaStreamDestination instead.
        //
        // Only insert the gain node when the user has dialed in a non-unity
        // value. A pass-through gain node can add a small amount of latency
        // or buffering that affects wake-word inference reliability on
        // low-end devices. The node can also be added later on-demand if the
        // user moves the slider -- see curio:mic-gain-changed listener.
        if (Math.abs(initialGainDb) > 0.001) {
            inputGainNode = audioContext.createGain();
            inputGainNode.gain.value = dbToLinear(initialGainDb);
            sourceNode.connect(inputGainNode);
            inputGainNode.connect(audioWorkletNode);
        } else {
            inputGainNode = null;
            sourceNode.connect(audioWorkletNode);
        }
        try {
            const silentDest = audioContext.createMediaStreamDestination();
            sinkGainNode = audioContext.createGain();
            sinkGainNode.gain.value = 0;
            audioWorkletNode.connect(sinkGainNode);
            sinkGainNode.connect(silentDest);
        } catch {
            // Fallback: worklet keeps running from input connection alone
        }
        logWakeWordTiming('workletReady', workletReadyStartedAt);

        isModelReady = true;
        logWakeWordTiming(`listeningReady(${wakeWord.id})`, listeningStartedAt);
        if (WAKE_WORD_DEBUG) {
            console.debug(`[WakeWord] Listening for "${wakeWord.phrase}" at threshold ${nextThreshold}.`);
        }

        // Store opts and schedule the periodic breathe cycle to release WASM
        // heap fragmentation on long-running sessions (Pi, tablets).
        breatheRestartOpts = {
            wakeWordId: wakeWord.id,
            detectionThreshold: nextThreshold,
            onDetect: onDetectCallback ?? undefined,
        };
        scheduleBreathe();
        logWakeWordLifecycle('start_ready', {
            wakeWordId: wakeWord.id,
        });

        return wakeWord;
    } catch (error) {
        if (sequence === startSequence) {
            isStarting = false;
            removeResumeListeners?.();
            removeResumeListeners = null;
            // Only log as error if it's not a normal abort (e.g., user connected while starting)
            if (!(error instanceof Error && error.message === 'Wake word start aborted')) {
                console.error('[WakeWord] Failed to start:', error);
            }
            logWakeWordLifecycle('start_failed', {
                wakeWordId: wakeWord.id,
                reason: error instanceof Error ? error.message : String(error),
            });
            stopListening();
        }
        throw error;
    } finally {
        if (sequence === startSequence) {
            isStarting = false;
        }
    }
}

export function stopListening(): void {
    const wasAudioSuspendLocked = audioSuspendLocked;
    clearBreatheTimer();
    breatheRestartOpts = null;
    const hadMicStream = !!mediaStream;
    try {
        isRunning = false;
        isStarting = false;
        isModelReady = false;
        isInferring = false;
        pendingSamples = null;
        accumulatorOffset = 0;
        silentFramesSkipped = 0;
        onDetectCallback = null;

        teardownAudioGraph();

        // Release the ONNX model and intermediate buffers to free memory.
        // On low-end devices (Pi, tablets) keeping the model cached pins ~3-5MB
        // of WASM heap. The ~200-500ms re-init cost on next startListening is
        // acceptable since it happens during the wake-word → Live API handoff.
        const hadModel = !!model || !!loadedModelWakeWordId;
        invalidateLoadedModelCache();
        downsampleOutputBuffer = null;
        logWakeWordLifecycle('listener_stopped', {
            wakeWordId: currentWakeWordId,
            hadMicStream,
            hadModel,
        });

        if (WAKE_WORD_DEBUG) {
            console.debug(
                hadModel
                    ? '[WakeWord] Stopped and released ONNX runtime to free memory.'
                    : '[WakeWord] Stopped.'
            );
        }
    } finally {
        // Ensure unlockAudioSuspend is called even if teardownAudioGraph throws
        if (wasAudioSuspendLocked && audioSuspendLocked) {
            unlockAudioSuspend();
            audioSuspendLocked = false;
        }
    }
}

export function releaseWakeWordRuntime(): void {
    const hadCachedRuntime = !!model || !!loadedModelWakeWordId || !!preloadPromise;
    releaseSequence += 1;
    stopListening();
    invalidateLoadedModelCache();
    if (hadCachedRuntime) {
        console.info('[WakeWord] Released cached wake-word runtime.');
    }
}

export function takePreparedMediaStream(): MediaStream | null {
    const preparedStream = mediaStream;
    mediaStream = null;
    if (preparedStream) {
        logWakeWordLifecycle('prepared_stream_handoff', {
            wakeWordId: currentWakeWordId,
            trackCount: preparedStream.getTracks().length,
        });
    }
    return preparedStream;
}

export function isListening(): boolean {
    return isRunning;
}

export function stopListeningAndUnlock(): void {
    stopListening();
}

async function resumeAudioContextOnInteraction(): Promise<void> {
    if (!audioContext || audioContext.state === 'running') {
        return;
    }

    try {
        await audioContext.resume();
    } catch {
        // Ignore resume failures; the next user interaction can retry.
    }

    if ((audioContext as AudioContext).state === 'running') {
        removeResumeListeners?.();
        removeResumeListeners = null;
    }
}
export async function prepareWakeWordAudio(): Promise<void> {
    if (WAKE_WORD_DEBUG) {
        console.debug('[WakeWord] Preparing audio via user interaction...');
    }
    const seq = releaseSequence;
    try {
        if (!mediaStream) {
            const getUserMediaStartedAt = getTimingNow();
            logWakeWordLifecycle('prepare_audio_requested', {
                wakeWordId: currentWakeWordId,
            });
            const nativeAccess = await requestElectronMediaAccess('microphone');
            if (!nativeAccess) {
                throw new Error('Microphone access was not granted.');
            }
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: { ideal: 16000 }
                }
            });
            // If the runtime was released while we were awaiting getUserMedia,
            // stop the newly acquired stream immediately to free the mic.
            if (seq !== releaseSequence) {
                stream.getTracks().forEach((t) => t.stop());
                logWakeWordLifecycle('prepare_audio_aborted', {
                    wakeWordId: currentWakeWordId,
                });
                return;
            }
            mediaStream = stream;
            logWakeWordTiming('prepareWakeWordAudio.getUserMedia', getUserMediaStartedAt);
            logWakeWordLifecycle('prepare_audio_acquired', {
                wakeWordId: currentWakeWordId,
                trackCount: stream.getTracks().length,
            });
            if (WAKE_WORD_DEBUG) {
                console.debug('[WakeWord] Microphone access granted via preparation.');
            }
        } else {
            logWakeWordLifecycle('prepare_audio_reused', {
                wakeWordId: currentWakeWordId,
                trackCount: mediaStream.getTracks().length,
            });
        }

        if (!audioContext) {
            audioContext = getSharedAudioContext(true);
            if (WAKE_WORD_DEBUG) {
                console.debug('[WakeWord] AudioContext shared via preparation. State:', audioContext.state);
            }
        }

        if (audioContext.state !== 'running') {
            await audioContext.resume();
            if (WAKE_WORD_DEBUG) {
                console.debug('[WakeWord] AudioContext resumed via preparation. State:', audioContext.state);
            }
        }
    } catch (error) {
        console.error('[WakeWord] Failed to prepare audio:', error);
        throw error;
    }
}

export function resetWakeWordServiceForTests(): void {
    releaseWakeWordRuntime();
    clearBreatheTimer();
    breatheRestartOpts = null;
    OpenWakeWordModel = null;
    audioContext = null;
    mediaStream = null;
    audioWorkletNode = null;
    workletBlobUrl = null;
    isWorkletRegistered = false;
    sourceNode = null;
    sinkGainNode = null;
    removeResumeListeners = null;
    audioSuspendLocked = false;
    isRunning = false;
    isStarting = false;
    isModelReady = false;
    isInferring = false;
    currentWakeWordId = DEFAULT_WAKE_WORD_ID;
    currentThreshold = getWakeWordDefinition(DEFAULT_WAKE_WORD_ID).threshold;
    onDetectCallback = null;
    lastDetectionTime = 0;
    lastLogTime = 0;
    lastHeartbeatTime = 0;
    startSequence = 0;
    modelLoadSequence = 0;
    pendingSamples = null;
    accumulatorOffset = 0;
    silentFramesSkipped = 0;
    downsampleOutputBuffer = null;
}
