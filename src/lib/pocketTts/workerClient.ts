/**
 * Main-thread client for the Pocket TTS inference worker.
 *
 * The worker owns model loading and the autoregressive flow LM loop.
 * The main thread keeps the AudioContext (StreamingAudioPlayer) because
 * AudioContext is not available in workers.
 *
 * One worker per process, shared across speak() calls. Requests are
 * tagged with a monotonic id so chunks can be routed to the right caller
 * if they overlap.
 */

import type { SerializedPocketState } from "./onnxState";

const POCKET_TTS_WORKER_VERSION = "20260429-streaming-prime-v1";
const WORKER_URL = `/pocketTtsWorker.bundle.js?v=${POCKET_TTS_WORKER_VERSION}`;

type WorkerOut =
  | { type: "chunk"; id: number; samples: Float32Array }
  | { type: "done"; id: number }
  | { type: "error"; id: number; message: string };

interface PendingRequest {
  onChunk: (samples: Float32Array) => Promise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
}

let workerInstance: Worker | null = null;
const pending = new Map<number, PendingRequest>();
let nextId = 1;
let speakQueue: Promise<void> = Promise.resolve();

// Serialize chunk handlers per-request so StreamingAudioPlayer.playChunk's
// AudioContext scheduling sees chunks in order even when postMessage
// delivers them tightly packed.
const chunkQueues = new Map<number, Promise<void>>();

const getWorker = (): Worker => {
  if (workerInstance) return workerInstance;
  workerInstance = new Worker(WORKER_URL);

  workerInstance.addEventListener("message", (event: MessageEvent<WorkerOut>) => {
    const msg = event.data;
    const req = pending.get(msg.id);
    if (!req) return;

    if (msg.type === "chunk") {
      const prev = chunkQueues.get(msg.id) || Promise.resolve();
      const next = prev.then(() => req.onChunk(msg.samples)).catch(() => {
        // Errors in playback shouldn't kill the inference pipeline;
        // swallow and let the `done` / `error` messages resolve the request.
      });
      chunkQueues.set(msg.id, next);
      return;
    }

    if (msg.type === "done") {
      // Wait for all chunks to finish playing before resolving.
      const tail = chunkQueues.get(msg.id) || Promise.resolve();
      tail.finally(() => {
        chunkQueues.delete(msg.id);
        pending.delete(msg.id);
        req.resolve();
      });
      return;
    }

    if (msg.type === "error") {
      chunkQueues.delete(msg.id);
      pending.delete(msg.id);
      req.reject(new Error(msg.message));
    }
  });

  workerInstance.addEventListener("error", (event) => {
    const message = event.message || "Pocket TTS worker crashed";
    for (const [id, req] of pending) {
      req.reject(new Error(message));
      chunkQueues.delete(id);
    }
    pending.clear();
    // Drop the worker so the next call spins up a fresh one.
    workerInstance?.terminate();
    workerInstance = null;
  });

  return workerInstance;
};

export interface WorkerSpeakOptions {
  tokenIds: number[];
  voiceEmbedding?: Float32Array;
  voiceEmbeddingFrames?: number;
  voiceState?: SerializedPocketState;
  temperature: number;
  lsdSteps: number;
  framesAfterEos: number;
  onChunk: (samples: Float32Array) => Promise<void>;
  signal?: { aborted: boolean };
}

const postSpeakToWorker = async (opts: WorkerSpeakOptions): Promise<void> => {
  if (opts.signal?.aborted) return;

  const worker = getWorker();
  const id = nextId++;

  return new Promise<void>((resolve, reject) => {
    pending.set(id, { onChunk: opts.onChunk, resolve, reject });

    // Copy the voice embedding before transfer. Pre-conditioned voice states
    // stay cloned (not transferred) so the in-memory voice cache remains usable.
    const embeddingCopy = opts.voiceEmbedding
      ? new Float32Array(opts.voiceEmbedding)
      : undefined;
    const transfer = embeddingCopy ? [embeddingCopy.buffer] : [];

    worker.postMessage(
      {
        type: "speak",
        id,
        tokenIds: opts.tokenIds,
        voiceEmbedding: embeddingCopy,
        voiceEmbeddingFrames: opts.voiceEmbeddingFrames,
        voiceState: opts.voiceState,
        temperature: opts.temperature,
        lsdSteps: opts.lsdSteps,
        framesAfterEos: opts.framesAfterEos,
      },
      transfer,
    );

    // Wire abort signal: poll or hook into caller's signal.
    if (opts.signal) {
      const checkAbort = () => {
        if (opts.signal?.aborted) {
          worker.postMessage({ type: "abort", id });
        }
      };
      // Check once immediately in case it was already aborted.
      checkAbort();
      // And lightly poll -- the caller's signal is a plain object, not
      // AbortSignal, so there's no event to subscribe to.
      const interval = setInterval(() => {
        if (!pending.has(id)) {
          clearInterval(interval);
          return;
        }
        checkAbort();
      }, 100);
    }
  });
};

export const runInferenceInWorker = async (opts: WorkerSpeakOptions): Promise<void> => {
  const run = speakQueue.catch(() => undefined).then(() => postSpeakToWorker(opts));
  speakQueue = run.catch(() => undefined);
  return run;
};

export const releaseWorkerModels = () => {
  if (!workerInstance) return;
  workerInstance.postMessage({ type: "release" });
};

export const warmupWorker = (): Promise<void> => {
  const worker = getWorker();
  const id = nextId++;
  return new Promise<void>((resolve, reject) => {
    pending.set(id, {
      onChunk: async () => {
        /* no-op, warmup produces no chunks */
      },
      resolve,
      reject,
    });
    worker.postMessage({ type: "warmup", id });
  });
};

export const terminateWorker = () => {
  if (!workerInstance) return;
  workerInstance.terminate();
  workerInstance = null;
  speakQueue = Promise.resolve();
  for (const [, req] of pending) {
    req.reject(new Error("Pocket TTS worker terminated"));
  }
  pending.clear();
  chunkQueues.clear();
};
