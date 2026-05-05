import { cachedFetch } from "@jax-js/loaders";
import * as ort from "onnxruntime-web/wasm";

import { configureOrtWasmEnv } from "../ortWasmConfig";
import { getPocketTtsThreadCount } from "../../services/pocketTtsRuntimeMode";

const isWorkerScope = typeof document === "undefined";
const maxMainThreadThreads = getPocketTtsThreadCount();

// ORT-web needs the WASM binary pinned so Vite never serves index.html for the
// runtime sidecar. The JS loader stays bundled with the app; public .mjs files
// cannot be imported as modules by Vite's dev server.
configureOrtWasmEnv(ort.env, {
  // The Pocket inference worker is already a worker. ORT's threaded WASM path
  // tries to derive and spawn another worker script from the bundled IIFE,
  // which fails in Chrome with "cannot determine the script source URL".
  numThreads: isWorkerScope ? 1 : maxMainThreadThreads,
  proxy: false,
  forceWasmPaths: true,
});
if (typeof (globalThis as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated !== "undefined"
    && !(globalThis as unknown as { crossOriginIsolated: boolean }).crossOriginIsolated) {
  // Threads need crossOriginIsolated. Fall back to single-threaded if COOP/COEP
  // headers aren't set (e.g. some HA ingress setups).
  console.warn("Pocket TTS: crossOriginIsolated=false, forcing numThreads=1 (set COOP/COEP headers to enable multi-threading)");
  ort.env.wasm.numThreads = 1;
}

const BUNDLE_MIMI_ENCODER_URL =
  "https://huggingface.co/spaces/KevinAHM/pocket-tts-web/resolve/main/onnx/english_2026-04/mimi_encoder_int8.onnx";
const LOCAL_BUNDLE_MIMI_URL = "/models/pocket-tts-onnx/english_2026-04/mimi_encoder_int8.onnx";
const LEGACY_MIMI_ENCODER_URL =
  "https://huggingface.co/KevinAHM/pocket-tts-onnx/resolve/main/onnx/mimi_encoder.onnx";
const LOCAL_MIMI_URL = "/models/pocket-tts-onnx/mimi_encoder.onnx";

let session: ort.InferenceSession | null = null;
let isInitializing = false;

/**
 * Initializes the ONNX Runtime session for the mimi_encoder.
 * The model weights are automatically cached locally via cachedFetch.
 */
export const initializeMimiEncoder = async (): Promise<ort.InferenceSession> => {
  if (session) return session;
  if (isInitializing) {
    // Wait slightly if another initialization is running
    while (isInitializing) {
      await new Promise((r) => setTimeout(r, 100));
      if (session) return session;
    }
  }

  isInitializing = true;
  try {
    let onnxData: ArrayBuffer | null = null;
    for (const url of [
      LOCAL_BUNDLE_MIMI_URL,
      BUNDLE_MIMI_ENCODER_URL,
      LOCAL_MIMI_URL,
      LEGACY_MIMI_ENCODER_URL,
    ]) {
      try {
        const response = await fetch(url, { method: "HEAD" });
        const contentType = response.headers.get("content-type") || "";
        // Check !text/html to protect against Vite's SPA history-api-fallback returning index.html
        if (response.ok && !contentType.includes("text/html")) {
          onnxData = await cachedFetch(url);
          break;
        }
      } catch {
        // Try the next source.
      }
    }

    if (!onnxData) {
      throw new Error("Unable to load Pocket TTS Mimi encoder.");
    }
    
    session = await ort.InferenceSession.create(new Uint8Array(onnxData), {
      executionProviders: ["wasm"],
    });
    return session;
  } finally {
    isInitializing = false;
  }
};

/**
 * Releases the ONNX session from memory.
 */
export const clearMimiSession = () => {
  session = null;
};

/**
 * Interface representing the extracted embedding and its original shape.
 * Shape is important so we can reconstruct the exactly correctly sized numpy ndarray
 * for JAX-JS in pocketTtsEngine.ts.
 */
export interface VoiceEmbedding {
  data: Float32Array;
  shape: number[];
}

/**
 * Encodes raw 24kHz audio into Kyutai Pocket TTS acoustic tokens via mimi_encoder.onnx.
 * 
 * @param audio Normalized (-1 to 1) 24kHz Float32Array of the recorded voice sample.
 * @returns The Float32Array containing the model's 1024-d acoustic token sequence, along with shape array like [N, 1024].
 */
export const encodeVoiceToEmbeddings = async (
  audio: Float32Array
): Promise<VoiceEmbedding> => {
  const encSession = await initializeMimiEncoder();

  // Ensure audio is properly scaled to [-1, 1] if not already
  let maxAbs = 0;
  for (let i = 0; i < audio.length; i++) {
    const abs = Math.abs(audio[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  if (maxAbs > 1.0) {
    for (let i = 0; i < audio.length; i++) {
      audio[i] = audio[i] / maxAbs;
    }
  }

  // ONNX Model Input Shape: [1, 1, seq_length]
  const inputTensor = new ort.Tensor("float32", audio, [1, 1, audio.length]);

  const feeds: Record<string, ort.Tensor> = {
    audio: inputTensor,
  };

  const results = await encSession.run(feeds);
  const outputName = encSession.outputNames[0];
  const outputTensor = results[outputName];

  // Output Shape: [1, N, 1024]
  let shape = outputTensor.dims.slice();
  
  // Normalize dimensions to [N, 1024] to match Kyutai's expected dimension matrix
  // Squeeze any 1-dims from the left
  while (shape.length > 2 && shape[0] === 1) {
    shape = shape.slice(1);
  }

  return {
    data: outputTensor.data as Float32Array,
    shape,
  };
};
