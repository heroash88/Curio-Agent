/**
 * Kitten TTS inference engine.
 *
 * Runs on the main thread (not in a worker). Kitten models are small enough
 * that a single ORT session.run() per text chunk completes in <500ms even on
 * phones, so there's no need for a worker and we avoid all the iOS Safari
 * worker + WASM loading issues.
 *
 * One session cached per model id. Switching models releases the previous
 * session to free memory.
 */

import * as ort from "onnxruntime-web/wasm";

import { reportTtsProgress } from "../../services/ttsProgress";
import { configureOrtWasmEnv } from "../ortWasmConfig";
import { KITTEN_MODELS, KITTEN_VOICE_ALIASES, type KittenModelId } from "./modelCatalog";
import { parseVoicesNpz, type VoiceTable } from "./npz";

configureOrtWasmEnv(ort.env, { numThreads: 1, forceWasmPaths: true });

const SAMPLE_RATE = 24_000;
const CHUNK_TAIL_TRIM = 5_000; // matches reference -- strips silence/garble

interface LoadedModel {
    session: ort.InferenceSession;
    voices: VoiceTable;
    speedPriors: Record<string, number>;
}

const cache = new Map<KittenModelId, LoadedModel>();

const fetchBuffer = async (url: string, label: string): Promise<ArrayBuffer> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${label}: HTTP ${res.status}`);
    return res.arrayBuffer();
};

const loadModel = async (id: KittenModelId): Promise<LoadedModel> => {
    const existing = cache.get(id);
    if (existing) return existing;

    const info = KITTEN_MODELS[id];
    reportTtsProgress(`Loading ${info.label} model files...`);
    const [modelBuf, voicesBuf, configText] = await Promise.all([
        fetchBuffer(`${info.basePath}/model.onnx`, `${id} model`),
        fetchBuffer(`${info.basePath}/voices.npz`, `${id} voices`),
        fetch(`${info.basePath}/kitten_config.json`).then((r) => r.text()),
    ]);

    // int8-quantized models (micro, mini) fail on the WebGPU EP; stay on WASM
    // across the board for consistent behaviour. The overhead is small for
    // these model sizes.
    reportTtsProgress("Starting ONNX session...");
    const session = await ort.InferenceSession.create(new Uint8Array(modelBuf), {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
    });

    reportTtsProgress("Loading voice embeddings...");
    const voices = parseVoicesNpz(voicesBuf);

    let speedPriors: Record<string, number> = {};
    try {
        const config = JSON.parse(configText);
        speedPriors = config.speed_priors || {};
    } catch {
        // Non-fatal -- fall back to default speed 1.0.
    }

    const loaded: LoadedModel = { session, voices, speedPriors };
    cache.set(id, loaded);
    return loaded;
};

export const ensureModelLoaded = async (id: KittenModelId): Promise<void> => {
    await loadModel(id);
};

export const releaseAllModels = (): void => {
    cache.clear();
};

export const releaseOtherModels = (keep: KittenModelId): void => {
    // Free sessions for models other than the one currently in use.
    // Helpful on phones where each session is 40-80 MB.
    for (const key of cache.keys()) {
        if (key !== keep) cache.delete(key);
    }
};

export interface InferenceRequest {
    modelId: KittenModelId;
    text: string;
    voiceName: string;
    speed: number;
}

export interface InferenceResult {
    samples: Float32Array;
    sampleRate: number;
}

const resolveVoiceKey = (voiceName: string): string =>
    KITTEN_VOICE_ALIASES[voiceName] ?? voiceName;

const pickStyleForChunk = (
    matrix: { rows: number; cols: number; values: Float32Array },
    textLength: number,
): Float32Array => {
    const rowIndex = Math.min(textLength, matrix.rows - 1);
    const start = rowIndex * matrix.cols;
    return matrix.values.slice(start, start + matrix.cols);
};

const trimTail = (chunk: Float32Array): Float32Array => {
    if (chunk.length <= CHUNK_TAIL_TRIM) return chunk;
    return chunk.slice(0, chunk.length - CHUNK_TAIL_TRIM);
};

/**
 * Run inference for one text request. Accepts pre-tokenized chunks so the
 * worker doesn't need the phonemizer (which fails in iife workers on iOS).
 * Each chunk is a tuple of [tokenIds, chunkTextLength] -- the text length
 * is needed to pick the right style row from the voice matrix.
 */
export const runKittenInference = async (
    req: InferenceRequest & { tokenizedChunks: Array<{ tokenIds: number[]; textLength: number }> },
    onChunk: (samples: Float32Array) => Promise<void>,
    shouldAbort?: () => boolean,
): Promise<number> => {
    const model = await loadModel(req.modelId);
    const voiceKey = resolveVoiceKey(req.voiceName);
    const voice = model.voices[voiceKey];
    if (!voice) {
        throw new Error(
            `Kitten voice '${req.voiceName}' (-> '${voiceKey}') not in voices.npz. ` +
                `Available: ${Object.keys(model.voices).join(", ")}`,
        );
    }

    const speedPrior = model.speedPriors[voiceKey] ?? 1;
    const speed = req.speed * speedPrior;

    for (let index = 0; index < req.tokenizedChunks.length; index += 1) {
        const chunk = req.tokenizedChunks[index];
        if (shouldAbort?.()) return SAMPLE_RATE;
        if (chunk.tokenIds.length <= 3) continue; // just boundary tokens

        reportTtsProgress(`Generating audio (${index + 1}/${req.tokenizedChunks.length})...`);
        const inputIds = BigInt64Array.from(chunk.tokenIds, (v) => BigInt(v));
        const style = pickStyleForChunk(voice, chunk.textLength);

        const outputs = await model.session.run({
            input_ids: new ort.Tensor("int64", inputIds, [1, inputIds.length]),
            style: new ort.Tensor("float32", style, [1, style.length]),
            speed: new ort.Tensor("float32", Float32Array.from([speed]), [1]),
        });

        const firstKey = Object.keys(outputs)[0];
        const tensor = outputs[firstKey];
        const raw = tensor.data as Float32Array;
        const samples = trimTail(raw instanceof Float32Array ? raw : new Float32Array(raw));

        const owned = new Float32Array(samples.length);
        owned.set(samples);
        await onChunk(owned);
    }

    return SAMPLE_RATE;
};

export { SAMPLE_RATE };
