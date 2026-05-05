import * as ort from 'onnxruntime-web/wasm';

import { reportTtsProgress } from '../../services/ttsProgress';
import { configureOrtWasmEnv } from '../ortWasmConfig';
import { TINY_TTS_ASSETS } from './localAssets';
import { textToPhonemeIds } from './text';

configureOrtWasmEnv(ort.env, { numThreads: 1, forceWasmPaths: true });

export const TINY_TTS_SAMPLE_RATE = 44_100;

let sessionPromise: Promise<ort.InferenceSession> | null = null;

const fetchModelBytes = async (): Promise<Uint8Array> => {
    const response = await fetch(TINY_TTS_ASSETS.model);
    if (!response.ok) throw new Error(`Failed to fetch TinyTTS model: HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
};

const getSession = async (): Promise<ort.InferenceSession> => {
    if (!sessionPromise) {
        sessionPromise = (async () => {
            reportTtsProgress('Loading TinyTTS model...');
            const bytes = await fetchModelBytes();
            return await ort.InferenceSession.create(bytes, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all',
            });
        })();
    }

    return sessionPromise;
};

const toInt64Tensor = (values: number[], dims: number[]): ort.Tensor =>
    new ort.Tensor('int64', BigInt64Array.from(values, (value) => BigInt(value)), dims);

const toScalarInt64Tensor = (value: number): ort.Tensor =>
    new ort.Tensor('int64', BigInt64Array.from([BigInt(value)]), [1]);

const toScalarFloat32Tensor = (value: number): ort.Tensor =>
    new ort.Tensor('float32', Float32Array.from([value]), [1]);

const copyTensorAudio = (tensor: ort.Tensor): Float32Array => {
    const data = tensor.data as Float32Array | number[];
    const source = data instanceof Float32Array ? data : Float32Array.from(data as number[]);
    const owned = new Float32Array(source.length);
    owned.set(source);
    return owned;
};

export interface TinyInferenceOptions {
    text: string;
    speed?: number;
    shouldAbort?: () => boolean;
}

export const ensureTinyModelLoaded = async (): Promise<void> => {
    await getSession();
};

export const runTinyInference = async (options: TinyInferenceOptions): Promise<Float32Array> => {
    const speed = options.speed && options.speed > 0 ? Math.min(1.5, Math.max(0.65, options.speed)) : 1;
    const session = await getSession();
    if (options.shouldAbort?.()) return new Float32Array();

    reportTtsProgress('Phonemizing TinyTTS text...');
    const { phoneIds, toneIds, langIds } = await textToPhonemeIds(options.text);
    const seqLen = phoneIds.length;
    if (seqLen <= 3 || options.shouldAbort?.()) return new Float32Array();

    reportTtsProgress('Generating TinyTTS audio...');
    const outputs = await session.run({
        x: toInt64Tensor(phoneIds, [1, seqLen]),
        x_lengths: toScalarInt64Tensor(seqLen),
        sid: toScalarInt64Tensor(0),
        tone: toInt64Tensor(toneIds, [1, seqLen]),
        language: toInt64Tensor(langIds, [1, seqLen]),
        bert: new ort.Tensor('float32', new Float32Array(seqLen * 1024), [1, 1024, seqLen]),
        ja_bert: new ort.Tensor('float32', new Float32Array(seqLen * 768), [1, 768, seqLen]),
        noise_scale: toScalarFloat32Tensor(0.667),
        noise_scale_w: toScalarFloat32Tensor(0.8),
        length_scale: toScalarFloat32Tensor(1 / speed),
    });

    const tensor = outputs.audio ?? outputs[session.outputNames[0]];
    if (!tensor) throw new Error('TinyTTS returned no audio output.');
    return copyTensorAudio(tensor);
};

export const releaseTinyModel = (): void => {
    const promise = sessionPromise;
    sessionPromise = null;
    void promise?.then((session) => session.release()).catch(() => {
        // Best-effort memory release.
    });
};
