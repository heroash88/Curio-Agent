/**
 * Web Worker host for Pocket TTS inference.
 *
 * Why this exists: on iOS Safari the autoregressive flow LM runs ~100
 * sequential `session.run()` calls per sentence. Even with yields, running
 * this on the main thread is enough to trip the OS app-responsiveness
 * watchdog, which thermal-throttles the device and silently terminates the
 * page ("session keeps closing"). Moving inference into a worker keeps the
 * main thread free for UI and audio scheduling.
 *
 * AudioContext is main-thread only, so the worker produces Float32 PCM
 * chunks and posts them back to the main thread where StreamingAudioPlayer
 * schedules them on the audio timeline.
 */

import {
  loadModels,
  releaseModels,
  runInference,
  type ModelBundle,
} from "./onnxEngine";
import type { SerializedPocketState } from "./onnxState";

type InMessage =
  | { type: "warmup"; id: number }
  | {
      type: "speak";
      id: number;
      tokenIds: number[];
      voiceEmbedding?: Float32Array;
      voiceEmbeddingFrames?: number;
      voiceState?: SerializedPocketState;
      temperature: number;
      lsdSteps: number;
      framesAfterEos: number;
    }
  | { type: "abort"; id: number }
  | { type: "release" };

type OutMessage =
  | { type: "chunk"; id: number; samples: Float32Array }
  | { type: "done"; id: number }
  | { type: "error"; id: number; message: string };

let bundle: ModelBundle | null = null;
const abortedIds = new Set<number>();

const ensureBundle = async (): Promise<ModelBundle> => {
  if (!bundle) bundle = await loadModels();
  return bundle;
};

const post = (msg: OutMessage, transfer?: Transferable[]) => {
  if (transfer && transfer.length) {
    (self as unknown as Worker).postMessage(msg, transfer);
  } else {
    (self as unknown as Worker).postMessage(msg);
  }
};

self.addEventListener("message", async (event: MessageEvent<InMessage>) => {
  const msg = event.data;

  if (msg.type === "abort") {
    abortedIds.add(msg.id);
    return;
  }

  if (msg.type === "release") {
    bundle = null;
    releaseModels();
    return;
  }

  if (msg.type === "warmup") {
    try {
      await ensureBundle();
      post({ type: "done", id: msg.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      post({ type: "error", id: msg.id, message });
    }
    return;
  }

  if (msg.type === "speak") {
    const { id, tokenIds, voiceEmbedding, voiceEmbeddingFrames, voiceState, temperature, lsdSteps, framesAfterEos } = msg;
    try {
      const active = await ensureBundle();
      await runInference(
        active,
        tokenIds,
        {
          voiceState,
          voiceEmbedding,
          voiceEmbeddingFrames,
          temperature,
          lsdSteps,
          framesAfterEos,
        },
        async (samples) => {
          // Copy into a fresh buffer so we can transfer ownership cheaply
          // rather than serialize. The source samples are a view over
          // ORT-owned memory that gets reused.
          const copy = new Float32Array(samples.length);
          copy.set(samples);
          post({ type: "chunk", id, samples: copy }, [copy.buffer]);
        },
        () => abortedIds.has(id),
      );
      abortedIds.delete(id);
      post({ type: "done", id });
    } catch (err) {
      abortedIds.delete(id);
      const message = err instanceof Error ? err.message : String(err);
      post({ type: "error", id, message });
    }
  }
});
