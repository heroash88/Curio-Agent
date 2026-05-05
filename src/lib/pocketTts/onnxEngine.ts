/**
 * Pure onnxruntime-web inference for Pocket TTS, using the INT8 export from
 * https://huggingface.co/KevinAHM/pocket-tts-onnx -- smallest footprint (~200 MB)
 * and the fastest path on WASM-SIMD.
 *
 * Why this is faster than the old JAX-JS WebGPU path:
 *   1. INT8 ops on WASM-SIMD run ~4x real-time -- a 4 sec sentence generates
 *      in ~1 sec. No WebGPU shader compile, no browser driver overhead.
 *   2. Streaming playback: first chunk (~160 ms) starts playing while the rest
 *      is still being generated. The old player buffered everything first.
 *   3. Thread caps (intra=4, inter=1) match KevinAHM's benchmarks -- avoids
 *      over-subscription on the small sequential matmuls.
 */

import * as ort from "onnxruntime-web/wasm";

// Share ORT globals (wasmPaths, numThreads) with mimiEncoder.ts.
import "./mimiEncoder";
import {
  getSharedAudioContext,
  isAudioUnlocked,
  isStrictAudioPolicy,
  lockAudioSuspend,
  unlockAudioSuspend,
} from "../../services/audioContext";
import { getPocketTtsThreadCount } from "../../services/pocketTtsRuntimeMode";
import {
  POCKET_DECODER_SETTLE_FRAMES,
  POCKET_DECODER_WARMUP_FRAMES,
  POCKET_SAMPLE_RATE,
  POCKET_SAMPLES_PER_FRAME,
} from "./audioPostProcess";
import {
  makeInitialStateData,
  type PocketStateInitMode,
  type SerializedPocketState,
} from "./onnxState";

const ONNX_BASE_URL = "https://huggingface.co/KevinAHM/pocket-tts-onnx/resolve/main/onnx";
const ONNX_BUNDLE_REMOTE_URL =
  "https://huggingface.co/spaces/KevinAHM/pocket-tts-web/resolve/main/onnx/english_2026-04";
const LOCAL_BASE_URL = "/models/pocket-tts-onnx";
const LOCAL_BUNDLE_URL = `${LOCAL_BASE_URL}/english_2026-04`;

const SAMPLE_RATE = POCKET_SAMPLE_RATE;
const SAMPLES_PER_FRAME = POCKET_SAMPLES_PER_FRAME;
const FRAME_LATENT_DIM = 32;
const TEXT_EMBED_DIM = 1024;
export const POCKET_STREAM_PRIME_SEC = 0.32;
export const FRAME_DURATION_SEC = SAMPLES_PER_FRAME / SAMPLE_RATE; // 0.08 sec

type ModelName =
  | "text_conditioner_int8"
  | "flow_lm_main_int8"
  | "flow_lm_flow_int8"
  | "mimi_decoder_int8";

export interface ModelBundle {
  text_conditioner: ort.InferenceSession;
  flow_lm_main: ort.InferenceSession;
  flow_lm_flow: ort.InferenceSession;
  mimi_decoder: ort.InferenceSession;
}

let bundlePromise: Promise<ModelBundle> | null = null;

// iOS Safari/PWA caps WebAssembly memory at ~1 GB. With ~125 MB of INT8 model
// files plus the 2-3x working memory ORT needs to parse each graph, peak
// memory during load can exceed the ceiling. Surfaces as a cryptic
// "The operation failed for an unknown transient reason (e.g. out of memory)".
const isIOS = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadish = navigator.platform === "MacIntel"
    && (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadish;
};

const isSafari = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|CriOS|FxiOS/.test(ua);
};

const wrapSafariMemoryError = (err: unknown, phase: string): Error => {
  const message = err instanceof Error ? err.message : String(err);
  return new Error(
    `Pocket TTS couldn't ${phase} in Safari. Safari caps WebAssembly memory aggressively, ` +
      `which may not be enough for the Pocket TTS models plus runtime buffers. ` +
      `Close other browser tabs and try again, or switch to the 'Browser', 'Tiny', or 'Remote' TTS engine in Settings. ` +
      `(Underlying error: ${message})`,
  );
};

const makeSessionOptions = (): ort.InferenceSession.SessionOptions => {
  const isWorkerScope = typeof document === "undefined";
  const threadCount = isWorkerScope ? 1 : getPocketTtsThreadCount();
  return {
    // WASM-only: WebGPU EP currently fails on these INT8 models with a WGSL
    // compile error ("no matching constructor for i32(vec4<u32>)"). Revisit
    // when ORT-web's WebGPU backend supports quantized conv/matmul properly.
    executionProviders: ["wasm"],
    intraOpNumThreads: threadCount,
    interOpNumThreads: 1,
    graphOptimizationLevel: "all",
  };
};

const legacyModelName = (name: ModelName): string => {
  if (name === "text_conditioner_int8") {
    return "text_conditioner";
  }
  return name;
};

const fetchModel = async (name: ModelName): Promise<ArrayBuffer> => {
  const filename = `${name}.onnx`;
  const legacyFilename = `${legacyModelName(name)}.onnx`;
  const local = `${LOCAL_BUNDLE_URL}/${filename}`;
  const remote = `${ONNX_BUNDLE_REMOTE_URL}/${filename}`;
  const legacyLocal = `${LOCAL_BASE_URL}/${legacyFilename}`;
  const legacyRemote = `${ONNX_BASE_URL}/${legacyFilename}`;

  // Prefer a locally served copy (drop into public/models/pocket-tts-onnx/)
  // to skip the ~200 MB download on HA add-on / Pi deployments.
  for (const url of [local, remote, legacyLocal, legacyRemote]) {
    try {
      const head = await fetch(url, { method: "HEAD" });
      const contentType = head.headers.get("content-type") || "";
      if (head.ok && !contentType.includes("text/html")) {
        const res = await fetch(url);
        if (res.ok) return await res.arrayBuffer();
      }
    } catch {
      // Try the next source.
    }
  }

  throw new Error(`Failed to download Pocket TTS model ${name}.`);
};

const loadSession = async (name: ModelName): Promise<ort.InferenceSession> => {
  const data = await fetchModel(name);
  return await ort.InferenceSession.create(new Uint8Array(data), makeSessionOptions());
};

export const loadModels = async (): Promise<ModelBundle> => {
  if (bundlePromise) return bundlePromise;
  bundlePromise = (async () => {
    try {
      if (isIOS() || isSafari()) {
        // Sequential load -- avoids the parallel-allocation memory spike that
        // pushes Safari past its WASM memory ceiling. macOS Safari can hit the
        // same opaque "unknown transient reason" failure as iOS here, even on
        // machines with plenty of system RAM.
        const text_conditioner = await loadSession("text_conditioner_int8");
        const flow_lm_main = await loadSession("flow_lm_main_int8");
        const flow_lm_flow = await loadSession("flow_lm_flow_int8");
        const mimi_decoder = await loadSession("mimi_decoder_int8");
        return { text_conditioner, flow_lm_main, flow_lm_flow, mimi_decoder };
      }
      const [text_conditioner, flow_lm_main, flow_lm_flow, mimi_decoder] = await Promise.all([
        loadSession("text_conditioner_int8"),
        loadSession("flow_lm_main_int8"),
        loadSession("flow_lm_flow_int8"),
        loadSession("mimi_decoder_int8"),
      ]);
      return { text_conditioner, flow_lm_main, flow_lm_flow, mimi_decoder };
    } catch (err) {
      // Clear the cached promise so a retry can try again (with freed memory).
      bundlePromise = null;
      if (isIOS() || isSafari()) throw wrapSafariMemoryError(err, "load");
      throw err;
    }
  })();
  return bundlePromise;
};

export const releaseModels = () => {
  bundlePromise = null;
};

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

type StateDict = Record<string, ort.Tensor>;

const initialStateTensor = (
  type: string,
  shape: readonly (number | string)[],
  mode: PocketStateInitMode = "default",
): ort.Tensor => {
  const dims = shape.map((d) => (typeof d === "number" ? d : 0));
  const data = makeInitialStateData(type, shape, mode);

  switch (type) {
    case "int64":
    case "tensor(int64)":
      return new ort.Tensor("int64", data as BigInt64Array, dims);
    case "bool":
    case "tensor(bool)":
      return new ort.Tensor("bool", data as Uint8Array, dims);
    default:
      return new ort.Tensor("float32", data as Float32Array, dims);
  }
};

const initState = (
  session: ort.InferenceSession,
  mode: PocketStateInitMode = "default",
): StateDict => {
  const state: StateDict = {};
  const metadata = session.inputMetadata;
  for (let i = 0; i < session.inputNames.length; i++) {
    const name = session.inputNames[i];
    if (!name.startsWith("state_")) continue;
    const meta = metadata[i];
    if (meta && meta.isTensor) {
      state[name] = initialStateTensor(meta.type, meta.shape, mode);
    } else {
      state[name] = initialStateTensor("float32", [], mode);
    }
  }
  return state;
};

const stateFromSerialized = (state: SerializedPocketState): StateDict => {
  const result: StateDict = {};
  for (const [name, tensor] of Object.entries(state)) {
    result[name] = new ort.Tensor(tensor.dtype, tensor.data as never, tensor.shape);
  }
  return result;
};

const copyStateFromOutputs = (
  state: StateDict,
  result: ort.InferenceSession.ReturnType,
  session: ort.InferenceSession,
): StateDict => {
  const next: StateDict = { ...state };
  for (const outName of session.outputNames) {
    if (!outName.startsWith("out_state_")) continue;
    const idx = outName.replace("out_state_", "");
    const value = result[outName];
    if (value) next[`state_${idx}`] = value as ort.Tensor;
  }
  return next;
};

const primeMimiDecoderState = async (
  bundle: ModelBundle,
  state: StateDict,
  firstLatent: Float32Array,
): Promise<StateDict> => {
  const warmupFrames = POCKET_DECODER_WARMUP_FRAMES;
  const settleFrames = POCKET_DECODER_SETTLE_FRAMES;
  const totalFrames = warmupFrames + settleFrames;
  if (totalFrames <= 0) return state;

  const latents = new Float32Array(totalFrames * FRAME_LATENT_DIM);
  for (let frame = 0; frame < settleFrames; frame += 1) {
    latents.set(firstLatent, (warmupFrames + frame) * FRAME_LATENT_DIM);
  }

  const primeOut = await bundle.mimi_decoder.run({
    latent: new ort.Tensor(
      "float32",
      latents,
      [1, totalFrames, FRAME_LATENT_DIM],
    ),
    ...state,
  });

  return copyStateFromOutputs(state, primeOut, bundle.mimi_decoder);
};

// ---------------------------------------------------------------------------
// Streaming audio player -- schedules chunks back-to-back on the AudioContext
// timeline so the user hears audio as soon as the first chunk is ready.
// ---------------------------------------------------------------------------

/**
 * Gapless streaming player. Schedules each chunk back-to-back on the
 * AudioContext timeline. If generation stalls and we fall behind real-time
 * (nextStartTime < currentTime), we rebase cleanly to currentTime without
 * creating overlap -- so at worst the listener hears a short silence, never
 * garbled/overlapping audio.
 *
 * Chunk lead-in: we delay the first chunk by `primeSec` so the first few
 * chunks land contiguously even if the decoder takes a moment to warm up.
 */
export class StreamingAudioPlayer {
  private readonly ctx: AudioContext;
  private readonly primeSec: number;
  private baseScheduleTime: number | null = null;
  private totalScheduledSec = 0;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private closed = false;
  private suspendLockReleased = false;

  constructor(primeSec = POCKET_STREAM_PRIME_SEC) {
    // Use the shared app-wide AudioContext so Safari/iOS can rely on the
    // unlock gesture that the UI performs before kicking off async TTS work.
    this.ctx = getSharedAudioContext(false);
    this.primeSec = primeSec;
    lockAudioSuspend();
  }

  async playChunk(samples: Float32Array): Promise<void> {
    if (this.closed || samples.length === 0) return;
    if (this.ctx.state === "suspended") {
      if (isStrictAudioPolicy() && !isAudioUnlocked()) {
        throw new Error(
          "Audio is locked on Safari. Start playback from a direct user interaction first.",
        );
      }
      await this.ctx.resume();
    }

    // Copy the samples -- the Float32Array may be backed by an ORT tensor
    // whose memory gets reused on the next inference call.
    const copy = new Float32Array(samples.length);
    copy.set(samples);

    const buffer = this.ctx.createBuffer(1, copy.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(copy);

    // Schedule back-to-back against our own timeline cursor, not the
    // AudioContext clock. If we fall behind we shift everything forward
    // rather than overlapping or dropping samples.
    if (this.baseScheduleTime === null) {
      this.baseScheduleTime = this.ctx.currentTime + this.primeSec;
    }
    let startAt = this.baseScheduleTime + this.totalScheduledSec;
    if (startAt < this.ctx.currentTime) {
      const drift = this.ctx.currentTime - startAt;
      this.baseScheduleTime += drift;
      startAt = this.ctx.currentTime;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    source.start(startAt);
    this.totalScheduledSec += buffer.duration;

    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      try {
        source.disconnect();
      } catch {
        // already disconnected
      }
    };
  }

  async waitUntilFinished(): Promise<void> {
    if (this.closed || this.baseScheduleTime === null) return;
    const endTime = this.baseScheduleTime + this.totalScheduledSec;
    const remainingMs = Math.max(0, endTime - this.ctx.currentTime) * 1000;
    if (remainingMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remainingMs));
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const source of this.sources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // already stopped
      }
    }
    this.sources.clear();
    if (!this.suspendLockReleased) {
      this.suspendLockReleased = true;
      unlockAudioSuspend();
    }
  }
}

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  /** Pre-conditioned Flow LM state for a built-in voice. */
  voiceState?: SerializedPocketState;
  /** Voice conditioning: flat Float32Array, shape [1, N, 1024]. */
  voiceEmbedding?: Float32Array;
  /** N in the [1, N, 1024] voice embedding. */
  voiceEmbeddingFrames?: number;
  temperature?: number;
  lsdSteps?: number;
  framesAfterEos?: number;
  maxFrames?: number;
  /** Frames in the first decoded audio slice handed to the player. */
  firstChunkFrames?: number;
  /** Frames in subsequent decoded audio slices handed to the player. */
  chunkFrames?: number;
  /** How often the autoregressive loop yields back to the browser event loop. */
  yieldEverySteps?: number;
}

const gaussianNoise = (size: number, std: number): Float32Array => {
  const out = new Float32Array(size);
  if (std <= 0) return out;
  for (let i = 0; i < size; i += 2) {
    const u1 = Math.random() || 1e-9;
    const u2 = Math.random();
    const r = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;
    out[i] = r * Math.cos(theta) * std;
    if (i + 1 < size) out[i + 1] = r * Math.sin(theta) * std;
  }
  return out;
};

// Yield to the browser event loop so UI, audio, and iOS's app-responsiveness
// watchdog get a chance to run. Without this, the tight autoregressive loop
// of ~100 `await session.run()` calls only drains the microtask queue and
// never yields, which makes iOS Safari thermal-throttle and the page freeze.
// `scheduler.yield()` is the modern API; fall back to a zero-delay setTimeout
// which is enough to flip the event loop.
const yieldToEventLoop = (): Promise<void> => {
  const scheduler = (globalThis as unknown as {
    scheduler?: { yield?: () => Promise<void> };
  }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
};

export const runInference = async (
  bundle: ModelBundle,
  tokenIds: number[],
  opts: GenerateOptions,
  onAudioChunk: (samples: Float32Array) => Promise<void>,
  shouldAbort?: () => boolean,
): Promise<void> => {
  const {
    voiceState,
    voiceEmbedding,
    voiceEmbeddingFrames,
    temperature = 0.7,
    lsdSteps = 1,
    framesAfterEos = 3,
    maxFrames = 500,
    firstChunkFrames = 3,
    chunkFrames = 12,
    yieldEverySteps = 4,
  } = opts;

  // --- Text conditioning ---------------------------------------------------
  const tokensBig = new BigInt64Array(tokenIds.length);
  for (let i = 0; i < tokenIds.length; i++) tokensBig[i] = BigInt(tokenIds[i]);
  const tokenTensor = new ort.Tensor("int64", tokensBig, [1, tokenIds.length]);
  const textCondOut = await bundle.text_conditioner.run({ token_ids: tokenTensor });
  let textEmbTensor = Object.values(textCondOut)[0] as ort.Tensor;
  if (textEmbTensor.dims.length === 2) {
    // [T, D] -> [1, T, D]
    textEmbTensor = new ort.Tensor(
      "float32",
      textEmbTensor.data as Float32Array,
      [1, textEmbTensor.dims[0], textEmbTensor.dims[1]],
    );
  }

  // --- Voice conditioning --------------------------------------------------
  const emptySeq = new ort.Tensor("float32", new Float32Array(0), [1, 0, FRAME_LATENT_DIM]);
  const emptyText = new ort.Tensor("float32", new Float32Array(0), [1, 0, TEXT_EMBED_DIM]);

  // --- Flow main warmup: voice + text passes -------------------------------
  let mainState = voiceState ? stateFromSerialized(voiceState) : initState(bundle.flow_lm_main, "flow");

  if (!voiceState) {
    if (!voiceEmbedding || !voiceEmbeddingFrames) {
      throw new Error("Pocket TTS needs either a voice state or a voice embedding.");
    }
    const voiceTensor = new ort.Tensor(
      "float32",
      voiceEmbedding,
      [1, voiceEmbeddingFrames, TEXT_EMBED_DIM],
    );
    const voiceWarmup = await bundle.flow_lm_main.run({
      sequence: emptySeq,
      text_embeddings: voiceTensor,
      ...mainState,
    });
    mainState = copyStateFromOutputs(mainState, voiceWarmup, bundle.flow_lm_main);
  }

  const textWarmup = await bundle.flow_lm_main.run({
    sequence: emptySeq,
    text_embeddings: textEmbTensor,
    ...mainState,
  });
  mainState = copyStateFromOutputs(mainState, textWarmup, bundle.flow_lm_main);

  // --- Autoregressive loop -------------------------------------------------
  // Match the upstream browser runtime: decode generated latents in small
  // chunks while carrying Mimi state forward. The previous whole-sentence
  // decode path added a long artificial silent warmup before the real latents,
  // which could make the beginning sound robotic or vanish on some browsers.
  let curr = new ort.Tensor(
    "float32",
    new Float32Array(FRAME_LATENT_DIM).fill(NaN),
    [1, 1, FRAME_LATENT_DIM],
  );

  const generated: Float32Array[] = [];
  let decodedFrames = 0;
  let mimiState = initState(bundle.mimi_decoder, "mimi");
  let isFirstAudioChunk = true;

  let eosStep: number | null = null;
  const dt = 1.0 / lsdSteps;
  const std = temperature > 0 ? Math.sqrt(temperature) : 0;

  // Pre-allocated scratch tensors for the flow step. Reused across ~100
  // iterations to cut down on allocation churn and GC pauses.
  const sScalarData = new Float32Array(1);
  const tScalarData = new Float32Array(1);
  const xFlowData = new Float32Array(FRAME_LATENT_DIM);
  const sScalarTensor = new ort.Tensor("float32", sScalarData, [1, 1]);
  const tScalarTensor = new ort.Tensor("float32", tScalarData, [1, 1]);
  const xFlowTensor = new ort.Tensor("float32", xFlowData, [1, FRAME_LATENT_DIM]);

  for (let step = 0; step < maxFrames; step++) {
    if (shouldAbort?.()) return;

    // Yield every few steps so iOS Safari can run UI, audio, and its
    // app-responsiveness watchdog. Without this the tight ~100-step
    // await-driven loop drains only the microtask queue and iOS thermally
    // throttles / freezes the page.
    if (step > 0 && yieldEverySteps > 0 && step % yieldEverySteps === 0) await yieldToEventLoop();

    const mainOut = await bundle.flow_lm_main.run({
      sequence: curr,
      text_embeddings: emptyText,
      ...mainState,
    });
    const conditioning = mainOut[bundle.flow_lm_main.outputNames[0]] as ort.Tensor; // [1, 1, D]
    const eosLogit = mainOut[bundle.flow_lm_main.outputNames[1]] as ort.Tensor;     // [1, 1]
    mainState = copyStateFromOutputs(mainState, mainOut, bundle.flow_lm_main);

    if (eosStep === null && (eosLogit.data as Float32Array)[0] > -4) {
      eosStep = step;
    }
    const shouldStop = eosStep !== null && step >= eosStep + framesAfterEos;

    // Flow matching: noise -> Euler integration. Reuse a single Float32Array
    // for x and pre-allocated s/t scalar tensors to avoid per-step allocation
    // churn in the tight autoregressive loop.
    let x = gaussianNoise(FRAME_LATENT_DIM, std);
    for (let j = 0; j < lsdSteps; j++) {
      const s = j / lsdSteps;
      const t = s + dt;
      sScalarData[0] = s;
      tScalarData[0] = t;
      xFlowData.set(x);
      const flowOut = await bundle.flow_lm_flow.run({
        c: conditioning,
        s: sScalarTensor,
        t: tScalarTensor,
        x: xFlowTensor,
      });
      const delta = Object.values(flowOut)[0] as ort.Tensor;
      const deltaData = delta.data as Float32Array;
      const nextX = new Float32Array(FRAME_LATENT_DIM);
      for (let k = 0; k < FRAME_LATENT_DIM; k++) nextX[k] = x[k] + deltaData[k] * dt;
      x = nextX;
    }

    generated.push(x);
    curr = new ort.Tensor("float32", x, [1, 1, FRAME_LATENT_DIM]);

    const pendingFrames = generated.length - decodedFrames;
    let framesToDecode = 0;
    if (shouldStop) {
      framesToDecode = pendingFrames;
    } else if (isFirstAudioChunk && pendingFrames >= firstChunkFrames) {
      framesToDecode = firstChunkFrames;
    } else if (pendingFrames >= chunkFrames) {
      framesToDecode = chunkFrames;
    }

    if (framesToDecode > 0) {
      if (isFirstAudioChunk) {
        mimiState = await primeMimiDecoderState(bundle, mimiState, generated[0]);
      }

      const latents = new Float32Array(framesToDecode * FRAME_LATENT_DIM);
      for (let frame = 0; frame < framesToDecode; frame += 1) {
        latents.set(generated[decodedFrames + frame], frame * FRAME_LATENT_DIM);
      }
      const decOut = await bundle.mimi_decoder.run({
        latent: new ort.Tensor(
          "float32",
          latents,
          [1, framesToDecode, FRAME_LATENT_DIM],
        ),
        ...mimiState,
      });
      mimiState = copyStateFromOutputs(mimiState, decOut, bundle.mimi_decoder);
      decodedFrames += framesToDecode;

      const audioTensor = decOut[bundle.mimi_decoder.outputNames[0]] as ort.Tensor;
      const audioData = new Float32Array(audioTensor.data as Float32Array);
      if (audioData.length > 0) {
        await onAudioChunk(audioData);
      }
      isFirstAudioChunk = false;
    }

    if (shouldStop) break;
  }
};
