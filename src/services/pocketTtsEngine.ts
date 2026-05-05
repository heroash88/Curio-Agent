import { cachedFetch, safetensors, tokenizers, opfs } from "@jax-js/loaders";

import {
  loadModels,
  releaseModels as releaseMainThreadModels,
  runInference,
  StreamingAudioPlayer,
} from "../lib/pocketTts/onnxEngine";
import {
  makeInitialStateData,
  type SerializedPocketState,
  type SerializedPocketTensor,
} from "../lib/pocketTts/onnxState";
import {
  releaseWorkerModels,
  runInferenceInWorker,
  warmupWorker,
} from "../lib/pocketTts/workerClient";
import {
  getPocketTtsThreadCount,
  getPocketTtsRuntimePreference,
  shouldUsePocketMainThreadFastPath,
} from "./pocketTtsRuntimeMode";
import { splitPocketTtsText } from "./pocketTtsText";

// Keep tokenizer + voice cache warm in memory; the model bundle lives in the
// worker. Release both after inactivity to free RAM on low-memory devices
// (Pi, tablets).
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

let tokenizer: tokenizers.Unigram | null = null;
type NumericArray = Float32Array | BigInt64Array | Uint8Array;

interface StateManifestEntry {
  dtype: "float32" | "int64" | "bool";
  fill: "nan" | "empty" | "zeros" | "ones";
  input_name: string;
  key: string;
  module: string;
  shape: number[];
}

interface PocketBundleMetadata {
  bos_before_voice_file?: string;
  flow_lm_state_manifest: StateManifestEntry[];
  insert_bos_before_voice?: boolean;
  model_recommended_frames_after_eos?: number | null;
  pad_with_spaces_for_short_inputs?: boolean;
  predefined_voices?: string[];
  tokenizer_file?: string;
}

interface ParsedVoiceTensor {
  data: NumericArray;
  dtype: SerializedPocketTensor["dtype"];
  shape: number[];
}

type ParsedVoiceRecord = Record<string, ParsedVoiceTensor>;
type VoiceConditioning =
  | { kind: "embedding"; data: Float32Array; frames: number }
  | { kind: "state"; state: SerializedPocketState };

const voiceConditioningCache = new Map<string, VoiceConditioning>();
let bundleMetadataPromise: Promise<PocketBundleMetadata> | null = null;
let voiceRecordsPromise: Promise<Record<string, ParsedVoiceRecord>> | null = null;
let bosBeforeVoicePromise: Promise<{ data: Float32Array; shape: number[] } | null> | null = null;
let mainThreadFastPathDisabled = false;

const scheduleModelRelease = () => {
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    console.log("Pocket TTS: releasing models due to inactivity.");
    tokenizer = null;
    releaseMainThreadModels();
    releaseWorkerModels();
    releaseTimer = null;
  }, INACTIVITY_TIMEOUT_MS);
};

const shouldUseMainThreadRuntime = (): boolean => (
  !mainThreadFastPathDisabled && shouldUsePocketMainThreadFastPath()
);

const MAIN_THREAD_FIRST_CHUNK_FRAMES = 20;
const MAIN_THREAD_CHUNK_FRAMES = 12;
const MAIN_THREAD_YIELD_EVERY_STEPS = 2;

const logPocketRuntimeSelection = (
  mode: "main-thread" | "worker",
  chunkCount: number,
) => {
  const crossOriginIsolated = (globalThis as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  const hardwareConcurrency = typeof navigator === "undefined" ? undefined : navigator.hardwareConcurrency;
  const ortThreads = mode === "main-thread" ? getPocketTtsThreadCount() : 1;

  console.info("[PocketTTS] Runtime selected", {
    mode,
    ortThreads,
    chunkCount,
    crossOriginIsolated,
    hardwareConcurrency,
    preference: getPocketTtsRuntimePreference(),
    fastPathDisabled: mainThreadFastPathDisabled,
    firstChunkFrames: mode === "main-thread" ? MAIN_THREAD_FIRST_CHUNK_FRAMES : undefined,
    chunkFrames: mode === "main-thread" ? MAIN_THREAD_CHUNK_FRAMES : undefined,
  });
};

const HF_URL_PREFIX =
  "https://huggingface.co/kyutai/pocket-tts-without-voice-cloning/resolve/fbf8280";
const BUNDLE_REMOTE_URL =
  "https://huggingface.co/spaces/KevinAHM/pocket-tts-web/resolve/main/onnx/english_2026-04";
const LOCAL_BUNDLE_PREFIX = "/models/pocket-tts-onnx/english_2026-04";
const LOCAL_VOICES_PREFIX = "/models/pocket-tts-onnx/voices";
const DEFAULT_POCKET_VOICE_ID = "alba";

const PREDEFINED_VOICE_IDS = [
  "alba", "azelma", "cosette", "eponine", "fantine", "javert", "jean", "marius",
] as const;

// Each predefined voice has a local (bundled) path and a remote fallback.
// The 8 files total ~4 MB, small enough to ship with the app alongside the
// 120 MB of INT8 models -- no runtime download needed.
const PREDEFINED_VOICES: Record<string, { local: string; remote: string }> = {};
for (const id of PREDEFINED_VOICE_IDS) {
  PREDEFINED_VOICES[id] = {
    local: `${LOCAL_VOICES_PREFIX}/${id}.safetensors`,
    remote: `${HF_URL_PREFIX}/embeddings/${id}.safetensors`,
  };
}

export const DEFAULT_POCKET_TTS_VOICES = PREDEFINED_VOICE_IDS.map((id) => ({
  id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
}));

const getTokenizer = async (): Promise<tokenizers.Unigram> => {
  if (tokenizer) return tokenizer;

  const metadata = await loadBundleMetadata();
  const tokenizerFile = metadata.tokenizer_file || "tokenizer.model";
  const remoteUrl = `${BUNDLE_REMOTE_URL}/${tokenizerFile}`;
  const localUrl = `${LOCAL_BUNDLE_PREFIX}/${tokenizerFile}`;
  const legacyLocalUrl = "/models/tokenizer.model";
  const legacyRemoteUrl = HF_URL_PREFIX + "/tokenizer.model";

  let finalUrl = legacyRemoteUrl;
  for (const url of [localUrl, remoteUrl, legacyLocalUrl, legacyRemoteUrl]) {
    try {
      const head = await fetch(url, { method: "HEAD" });
      const contentType = head.headers.get("content-type") || "";
      if (head.ok && !contentType.includes("text/html")) {
        finalUrl = url;
        break;
      }
    } catch {
      // Try the next source.
    }
  }

  tokenizer = await tokenizers.loadSentencePiece(finalUrl);
  return tokenizer;
};

const fetchFirstAvailable = async (urls: string[]): Promise<ArrayBuffer> => {
  for (const url of urls) {
    try {
      const head = await fetch(url, { method: "HEAD" });
      const contentType = head.headers.get("content-type") || "";
      if (!head.ok || contentType.includes("text/html")) continue;
      const res = await fetch(url);
      if (res.ok) return await res.arrayBuffer();
    } catch {
      // Try the next source.
    }
  }
  throw new Error(`Unable to load Pocket TTS asset from ${urls.join(", ")}`);
};

const loadBundleMetadata = async (): Promise<PocketBundleMetadata> => {
  if (bundleMetadataPromise) return bundleMetadataPromise;
  bundleMetadataPromise = (async () => {
    const buffer = await fetchFirstAvailable([
      `${LOCAL_BUNDLE_PREFIX}/bundle.json`,
      `${BUNDLE_REMOTE_URL}/bundle.json`,
    ]);
    return JSON.parse(new TextDecoder().decode(buffer)) as PocketBundleMetadata;
  })();
  return bundleMetadataPromise;
};

const cloneNumericArray = (data: NumericArray): NumericArray => {
  if (data instanceof BigInt64Array) return new BigInt64Array(data);
  if (data instanceof Uint8Array) return new Uint8Array(data);
  return new Float32Array(data);
};

const numericShape = (shape: readonly number[]): number[] => shape.map((dim) => Math.max(0, Math.floor(dim)));

const deriveStep = (record: ParsedVoiceRecord, moduleName: string): ParsedVoiceTensor | undefined => {
  const direct = record[`${moduleName}/step`];
  if (direct) return direct;

  const offset = record[`${moduleName}/offset`];
  if (offset && !record[`${moduleName}/end_offset`] && offset.data.length > 0) {
    return {
      data: BigInt64Array.from([BigInt(offset.data[0] as number | bigint)]),
      dtype: "int64",
      shape: [1],
    };
  }

  const currentEnd = record[`${moduleName}/current_end`];
  if (currentEnd) {
    return {
      data: BigInt64Array.from([BigInt(currentEnd.shape[0] || 0)]),
      dtype: "int64",
      shape: [1],
    };
  }

  return undefined;
};

const adaptVoiceTensor = (
  source: ParsedVoiceTensor,
  entry: StateManifestEntry,
): NumericArray => {
  const targetShape = numericShape(entry.shape);
  const targetSize = targetShape.reduce((total, dim) => total * dim, 1);
  const sourceShape = numericShape(source.shape);

  if (
    sourceShape.length === targetShape.length
    && sourceShape.every((dim, index) => dim === targetShape[index])
  ) {
    return cloneNumericArray(source.data);
  }

  if (source.data.length === targetSize) {
    return cloneNumericArray(source.data);
  }

  const target = makeInitialStateData(entry.dtype, targetShape, "flow");
  if (sourceShape.length !== targetShape.length || targetSize === 0) {
    return target;
  }

  const sourceStrides = [];
  let sourceStride = 1;
  for (let index = sourceShape.length - 1; index >= 0; index -= 1) {
    sourceStrides[index] = sourceStride;
    sourceStride *= sourceShape[index];
  }

  const targetStrides = [];
  let targetStride = 1;
  for (let index = targetShape.length - 1; index >= 0; index -= 1) {
    targetStrides[index] = targetStride;
    targetStride *= targetShape[index];
  }

  const limits = sourceShape.map((dim, index) => Math.min(dim, targetShape[index] || 0));
  if (limits.some((limit) => limit <= 0)) {
    return target;
  }

  const indices = new Array(sourceShape.length).fill(0);
  let done = false;
  while (!done) {
    let sourceIndex = 0;
    let targetIndex = 0;
    for (let index = 0; index < indices.length; index += 1) {
      sourceIndex += indices[index] * sourceStrides[index];
      targetIndex += indices[index] * targetStrides[index];
    }
    (target as unknown as ArrayLike<unknown> & { [key: number]: unknown })[targetIndex] =
      (source.data as unknown as ArrayLike<unknown>)[sourceIndex];

    for (let dim = indices.length - 1; dim >= 0; dim -= 1) {
      indices[dim] += 1;
      if (indices[dim] < limits[dim]) break;
      indices[dim] = 0;
      if (dim === 0) done = true;
    }
  }

  return target;
};

const stateFromVoiceRecord = (
  record: ParsedVoiceRecord,
  metadata: PocketBundleMetadata,
): SerializedPocketState => {
  const state: SerializedPocketState = {};
  for (const entry of metadata.flow_lm_state_manifest) {
    const tensor = record[`${entry.module}/${entry.key}`]
      || (entry.key === "step" ? deriveStep(record, entry.module) : undefined);
    const data = tensor
      ? adaptVoiceTensor(tensor, entry)
      : makeInitialStateData(entry.dtype, entry.shape, "flow");
    state[entry.input_name] = {
      dtype: entry.dtype,
      data,
      shape: numericShape(entry.shape),
    };
  }
  return state;
};

const parseVoiceStatesBin = (buffer: ArrayBuffer): Record<string, ParsedVoiceRecord> => {
  const view = new DataView(buffer);
  let offset = 0;
  const magic = new TextDecoder().decode(new Uint8Array(buffer, offset, 5));
  offset += 5;
  if (magic !== "PTVB1") {
    throw new Error("Invalid Pocket TTS voices.bin header.");
  }

  const voices: Record<string, ParsedVoiceRecord> = {};
  const voiceCount = view.getUint32(offset, true);
  offset += 4;

  for (let voiceIndex = 0; voiceIndex < voiceCount; voiceIndex += 1) {
    const nameLength = view.getUint16(offset, true);
    offset += 2;
    const name = new TextDecoder().decode(new Uint8Array(buffer, offset, nameLength));
    offset += nameLength;

    const tensorCount = view.getUint16(offset, true);
    offset += 2;
    const tensors: ParsedVoiceRecord = {};

    for (let tensorIndex = 0; tensorIndex < tensorCount; tensorIndex += 1) {
      const keyLength = view.getUint16(offset, true);
      offset += 2;
      const key = new TextDecoder().decode(new Uint8Array(buffer, offset, keyLength));
      offset += keyLength;

      const dtypeCode = view.getUint8(offset);
      offset += 1;
      const rank = view.getUint8(offset);
      offset += 1;
      const shape = [];
      for (let dim = 0; dim < rank; dim += 1) {
        shape.push(view.getUint32(offset, true));
        offset += 4;
      }

      const byteLength = view.getUint32(offset, true);
      offset += 4;
      const slice = buffer.slice(offset, offset + byteLength);
      offset += byteLength;

      if (dtypeCode === 0) {
        tensors[key] = { data: new Float32Array(slice), dtype: "float32", shape };
      } else if (dtypeCode === 1) {
        tensors[key] = { data: new BigInt64Array(slice), dtype: "int64", shape };
      } else if (dtypeCode === 2) {
        tensors[key] = { data: new Uint8Array(slice), dtype: "bool", shape };
      } else {
        throw new Error(`Unsupported Pocket TTS voice tensor dtype ${dtypeCode}.`);
      }
    }

    voices[name] = tensors;
  }

  return voices;
};

const loadVoiceRecords = async (): Promise<Record<string, ParsedVoiceRecord>> => {
  if (voiceRecordsPromise) return voiceRecordsPromise;
  voiceRecordsPromise = fetchFirstAvailable([
    `${LOCAL_BUNDLE_PREFIX}/voices.bin`,
    `${BUNDLE_REMOTE_URL}/voices.bin`,
  ]).then(parseVoiceStatesBin);
  return voiceRecordsPromise;
};

const parseNpyFloat32 = (buffer: ArrayBuffer): { data: Float32Array; shape: number[] } => {
  const view = new DataView(buffer);
  const magic = new Uint8Array(buffer, 0, 6);
  const expected = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59];
  for (let index = 0; index < expected.length; index += 1) {
    if (magic[index] !== expected[index]) {
      throw new Error("Invalid NPY file.");
    }
  }

  const major = view.getUint8(6);
  const headerLength = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
  const headerOffset = major === 1 ? 10 : 12;
  const headerText = new TextDecoder().decode(new Uint8Array(buffer, headerOffset, headerLength));
  const shapeMatch = headerText.match(/\(\s*([0-9,\s]+)\)/);
  if (!shapeMatch) {
    throw new Error("Could not parse NPY shape.");
  }
  const shape = shapeMatch[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10));
  const dataOffset = headerOffset + headerLength;
  return { data: new Float32Array(buffer.slice(dataOffset)), shape };
};

const loadBosBeforeVoice = async (
  metadata: PocketBundleMetadata,
): Promise<{ data: Float32Array; shape: number[] } | null> => {
  if (!metadata.insert_bos_before_voice || !metadata.bos_before_voice_file) return null;
  if (bosBeforeVoicePromise) return bosBeforeVoicePromise;
  bosBeforeVoicePromise = fetchFirstAvailable([
    `${LOCAL_BUNDLE_PREFIX}/${metadata.bos_before_voice_file}`,
    `${BUNDLE_REMOTE_URL}/${metadata.bos_before_voice_file}`,
  ]).then(parseNpyFloat32);
  return bosBeforeVoicePromise;
};

const withBosBeforeVoice = async (
  embedding: Float32Array,
  frames: number,
  metadata: PocketBundleMetadata,
): Promise<{ data: Float32Array; frames: number }> => {
  const bos = await loadBosBeforeVoice(metadata);
  if (!bos) return { data: embedding, frames };

  const bosFrames = bos.shape.length >= 2 ? bos.shape[1] : Math.floor(bos.data.length / 1024);
  const data = new Float32Array(bos.data.length + embedding.length);
  data.set(bos.data, 0);
  data.set(embedding, bos.data.length);
  return { data, frames: frames + bosFrames };
};

const loadPredefinedVoice = async (
  voiceId: string,
): Promise<VoiceConditioning> => {
  const cached = voiceConditioningCache.get(voiceId);
  if (cached) return cached;

  try {
    const [metadata, records] = await Promise.all([
      loadBundleMetadata(),
      loadVoiceRecords(),
    ]);
    const record = records[voiceId] || records[DEFAULT_POCKET_VOICE_ID];
    if (record) {
      const result: VoiceConditioning = {
        kind: "state",
        state: stateFromVoiceRecord(record, metadata),
      };
      voiceConditioningCache.set(voiceId, result);
      return result;
    }
  } catch (error) {
    console.warn("[PocketTTS] Falling back to legacy voice embedding:", error);
  }

  const entry = PREDEFINED_VOICES[voiceId] || PREDEFINED_VOICES[DEFAULT_POCKET_VOICE_ID];

  // Try the locally bundled file first -- avoids the HuggingFace round-trip
  // and keeps voice loading fast + offline-capable.
  let buffer: ArrayBuffer | null = null;
  try {
    const head = await fetch(entry.local, { method: "HEAD" });
    const contentType = head.headers.get("content-type") || "";
    if (head.ok && !contentType.includes("text/html")) {
      const res = await fetch(entry.local);
      if (res.ok) buffer = await res.arrayBuffer();
    }
  } catch {
    // fall through to remote
  }
  if (!buffer) {
    buffer = await cachedFetch(entry.remote);
  }

  const parsed = safetensors.parse(buffer);
  const audioPrompt = parsed.tensors.audio_prompt;
  if (!audioPrompt) {
    throw new Error(`Pocket TTS voice ${voiceId} did not include an audio_prompt tensor.`);
  }

  // Safetensors stores [N, 1024] or [1, N, 1024]; normalize to [N, 1024].
  let shape = audioPrompt.shape.slice();
  while (shape.length > 2 && shape[0] === 1) shape = shape.slice(1);
  const frames = shape[0];

  const raw = audioPrompt.data as Float32Array;
  const data = raw instanceof Float32Array ? raw : new Float32Array(raw);

  const result: VoiceConditioning = { kind: "embedding", data, frames };
  voiceConditioningCache.set(voiceId, result);
  return result;
};

export const ensureOfflineModelsReady = async () => {
  // Warm up tokenizer + default voice on the main thread, and the model
  // bundle in the worker, in parallel. First speak() then just does
  // inference.
  await Promise.all([
    getTokenizer(),
    loadBundleMetadata(),
    loadPredefinedVoice(DEFAULT_POCKET_VOICE_ID),
    shouldUseMainThreadRuntime() ? loadModels() : warmupWorker(),
  ]);
};

export const clearModelCache = async () => {
  try {
    await opfs.clear();
  } catch {
    // OPFS may not be available -- ignore.
  }
  tokenizer = null;
  voiceConditioningCache.clear();
  bundleMetadataPromise = null;
  voiceRecordsPromise = null;
  bosBeforeVoicePromise = null;
  mainThreadFastPathDisabled = false;
  releaseMainThreadModels();
  releaseWorkerModels();
};

const prepareText = (
  raw: string,
  metadata?: PocketBundleMetadata,
): { text: string; framesAfterEos: number } => {
  let text = raw.trim();
  if (!text) throw new Error("Prompt cannot be empty");
  text = text.replace(/\s+/g, " ");

  const wordCount = text.split(" ").length;
  const framesAfterEos = metadata?.model_recommended_frames_after_eos
    ?? (wordCount <= 4 ? 5 : 3);

  // Capitalize first letter so the tokenizer behaves.
  text = text.replace(/^(\p{Ll})/u, (c) => c.toLocaleUpperCase());

  // Ensure punctuation.
  if (/[\p{L}\p{N}]$/u.test(text)) text = text + ".";

  if (metadata?.pad_with_spaces_for_short_inputs && text.split(" ").length < 5) {
    text = " ".repeat(8) + text;
  }

  return { text, framesAfterEos };
};

const runPocketInference = async (
  options: {
    tokenIds: number[];
    voiceEmbedding?: Float32Array;
    voiceEmbeddingFrames?: number;
    voiceState?: SerializedPocketState;
    framesAfterEos: number;
    onChunk: (samples: Float32Array) => Promise<void>;
    signal: { aborted: boolean };
  },
): Promise<void> => {
  const inferenceOptions = {
    voiceEmbedding: options.voiceEmbedding,
    voiceEmbeddingFrames: options.voiceEmbeddingFrames,
    voiceState: options.voiceState,
    temperature: 0.7,
    lsdSteps: 1,
    framesAfterEos: options.framesAfterEos,
  };

  if (shouldUseMainThreadRuntime()) {
    let emittedAudio = false;
    try {
      const bundle = await loadModels();
      await runInference(
        bundle,
        options.tokenIds,
        {
          ...inferenceOptions,
          firstChunkFrames: MAIN_THREAD_FIRST_CHUNK_FRAMES,
          chunkFrames: MAIN_THREAD_CHUNK_FRAMES,
          yieldEverySteps: MAIN_THREAD_YIELD_EVERY_STEPS,
        },
        async (samples) => {
          emittedAudio = true;
          await options.onChunk(samples);
        },
        () => options.signal.aborted,
      );
      return;
    } catch (error) {
      mainThreadFastPathDisabled = true;
      releaseMainThreadModels();
      if (emittedAudio) {
        throw error;
      }
      console.warn("[PocketTTS] Main-thread fast path failed; falling back to worker runtime", {
        attemptedOrtThreads: getPocketTtsThreadCount(),
        fallbackOrtThreads: 1,
        error,
      });
    }
  }

  await runInferenceInWorker({
    ...inferenceOptions,
    tokenIds: options.tokenIds,
    onChunk: options.onChunk,
    signal: options.signal,
  });
};

export const createTTS = () => {
  let activePlayer: StreamingAudioPlayer | null = null;
  let aborted = false;

  return {
    listVoices: () => DEFAULT_POCKET_TTS_VOICES,

    stop: async () => {
      aborted = true;
      if (activePlayer) {
        await activePlayer.close();
        activePlayer = null;
      }
    },

    speak: async (
      rawText: string,
      options: { speaker?: string; speakerEmbedding?: Float32Array } = {},
    ) => {
      scheduleModelRelease();
      aborted = false;

      const [tok, metadata] = await Promise.all([getTokenizer(), loadBundleMetadata()]);

      const textChunks = splitPocketTtsText(rawText);
      if (textChunks.length === 0) throw new Error("Prompt cannot be empty");
      const runtimeMode = shouldUseMainThreadRuntime() ? "main-thread" : "worker";
      logPocketRuntimeSelection(runtimeMode, textChunks.length);

      let voiceEmbedding: Float32Array | undefined;
      let voiceEmbeddingFrames: number | undefined;
      let voiceState: SerializedPocketState | undefined;

      if (options.speakerEmbedding) {
        const raw = options.speakerEmbedding;
        voiceEmbeddingFrames = Math.floor(raw.length / 1024);
        const embedding = raw instanceof Float32Array ? raw : new Float32Array(raw);
        const conditioned = await withBosBeforeVoice(embedding, voiceEmbeddingFrames, metadata);
        voiceEmbedding = conditioned.data;
        voiceEmbeddingFrames = conditioned.frames;
      } else {
        const voiceId = options.speaker && PREDEFINED_VOICES[options.speaker]
          ? options.speaker
          : DEFAULT_POCKET_VOICE_ID;
        const entry = await loadPredefinedVoice(voiceId);
        if (entry.kind === "state") {
          voiceState = entry.state;
        } else {
          const conditioned = await withBosBeforeVoice(entry.data, entry.frames, metadata);
          voiceEmbedding = conditioned.data;
          voiceEmbeddingFrames = conditioned.frames;
        }
      }

      if (activePlayer) {
        await activePlayer.close();
      }
      activePlayer = new StreamingAudioPlayer();

      // Abort signal shared with the worker client. The worker polls it
      // because we don't have a native AbortSignal here.
      const abortSignal = {
        get aborted() {
          return aborted;
        },
      };

      try {
        for (const chunk of textChunks) {
          if (aborted) break;
          const { text, framesAfterEos } = prepareText(chunk, metadata);
          const tokenIds = tok.encode(text);
          await runPocketInference({
            tokenIds,
            voiceEmbedding,
            voiceEmbeddingFrames,
            voiceState,
            framesAfterEos,
            onChunk: async (samples) => {
              if (activePlayer && !aborted) await activePlayer.playChunk(samples);
            },
            signal: abortSignal,
          });
        }

        if (activePlayer && !aborted) {
          await activePlayer.waitUntilFinished();
        }
      } catch (err) {
        console.error("Pocket TTS error:", err);
        throw err;
      } finally {
        if (activePlayer) {
          await activePlayer.close();
          activePlayer = null;
        }
      }
    },
  };
};
