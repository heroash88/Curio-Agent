/**
 * Kitten TTS client used by TTSService when the engine is 'kitten-tts'.
 *
 * Runs inference directly on the main thread. Unlike Pocket TTS (which needs
 * ~100 sequential ORT calls per sentence and must live in a worker), Kitten
 * runs ONE ORT call per text chunk. A single call takes <500ms even on a
 * phone, so the main thread handles it fine and we avoid all the iOS Safari
 * worker + WASM loading issues that caused infinite hangs.
 *
 * The phonemizer (eSpeak NG compiled to Emscripten WASM) also runs on the
 * main thread -- it initializes correctly here but fails inside iife workers
 * on iOS.
 */

import { StreamingAudioPlayer } from "../lib/pocketTts/onnxEngine";
import { isSafariBrowser } from "./audioContext";
import { reportTtsProgress } from "./ttsProgress";
import { stripEmojiForSpeech } from "./ttsTextSanitizer";
import {
    DEFAULT_KITTEN_MODEL,
    DEFAULT_KITTEN_VOICE,
    KITTEN_VOICE_NAMES,
    isKittenModelId,
    type KittenModelId,
} from "../lib/kittenTts/modelCatalog";
import { chunkText, preprocessText } from "../lib/kittenTts/preprocess";
import { addBoundaryTokens, normalizePhonemes, tokenize } from "../lib/kittenTts/tokenizer";
import {
    ensureModelLoaded,
    releaseAllModels,
    runKittenInference,
} from "../lib/kittenTts/kittenEngine";

const KITTEN_SAMPLE_RATE = 24_000;
const PHONEMIZER_TIMEOUT_MS = 4_000;

// Keep the model hot for 60s after the last use, then release to free memory.
const INACTIVITY_RELEASE_MS = 60_000;
let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

const bumpInactivityTimer = (): void => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        inactivityTimer = null;
        releaseAllModels();
    }, INACTIVITY_RELEASE_MS);
};

export const listKittenVoices = (): Array<{ id: string; label: string }> =>
    KITTEN_VOICE_NAMES.map((name) => ({ id: name, label: name }));

export const ensureKittenReady = async (modelId: KittenModelId): Promise<void> => {
    await ensureModelLoaded(modelId);
    bumpInactivityTimer();
};

export const releaseKittenModels = (): void => {
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }
    releaseAllModels();
};

export interface KittenSpeakOptions {
    text: string;
    voiceName?: string;
    modelId?: KittenModelId;
    speed?: number;
}

let activePlayer: StreamingAudioPlayer | null = null;
let aborted = false;

type ChunkPhonemizer = (text: string) => Promise<string>;

let chunkPhonemizerPromise: Promise<ChunkPhonemizer> | null = null;

const flattenPhonemes = (result: string | string[]): string =>
    Array.isArray(result) ? result.join(" ") : String(result);

const withTimeout = async <T>(promise: Promise<T>, label: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`${label} timed out after ${PHONEMIZER_TIMEOUT_MS}ms`));
                }, PHONEMIZER_TIMEOUT_MS);
            }),
        ]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
};

const createJsPhonemizer = async (): Promise<ChunkPhonemizer> => {
    const { phonemize } = await import("phonemize");
    return async (text: string) => flattenPhonemes(phonemize(text));
};

const createWasmPhonemizer = async (): Promise<ChunkPhonemizer> => {
    const { phonemize } = await import("phonemizer");
    return async (text: string) =>
        flattenPhonemes(await withTimeout(phonemize(text, "en-us"), "Kitten phonemizer"));
};

const switchToJsPhonemizer = async (): Promise<ChunkPhonemizer> => {
    chunkPhonemizerPromise = createJsPhonemizer();
    return chunkPhonemizerPromise;
};

const getChunkPhonemizer = async (): Promise<ChunkPhonemizer> => {
    if (!chunkPhonemizerPromise) {
        chunkPhonemizerPromise = isSafariBrowser
            ? createJsPhonemizer()
            : createWasmPhonemizer().catch(async (error) => {
                  console.warn(
                      "[KittenTTS] Failed to initialize WASM phonemizer, falling back to pure JS.",
                      error,
                  );
                  return switchToJsPhonemizer();
              });
    }

    return chunkPhonemizerPromise;
};

export const speakWithKitten = async (opts: KittenSpeakOptions): Promise<void> => {
    const modelId: KittenModelId = isKittenModelId(opts.modelId)
        ? opts.modelId
        : DEFAULT_KITTEN_MODEL;
    const voiceName = opts.voiceName?.trim() || DEFAULT_KITTEN_VOICE;
    const speed = opts.speed && opts.speed > 0 ? opts.speed : 1;

    aborted = false;
    bumpInactivityTimer();

    // Phonemize + tokenize on the main thread.
    reportTtsProgress("Normalizing preview text...");
    const cleaned = preprocessText(stripEmojiForSpeech(opts.text));
    const textChunks = chunkText(cleaned);
    if (textChunks.length === 0) return;

    reportTtsProgress(isSafariBrowser ? "Loading Safari-compatible phonemizer..." : "Loading phonemizer...");
    let phonemizeChunk = await getChunkPhonemizer();

    const tokenizedChunks: Array<{ tokenIds: number[]; textLength: number }> = [];
    for (let index = 0; index < textChunks.length; index += 1) {
        const chunk = textChunks[index];
        reportTtsProgress(`Phonemizing text (${index + 1}/${textChunks.length})...`);
        let phonemes: string;
        try {
            phonemes = await phonemizeChunk(chunk);
        } catch (error) {
            if (isSafariBrowser) {
                throw error;
            }

            console.warn(
                "[KittenTTS] WASM phonemizer stalled during preview, retrying with pure JS fallback.",
                error,
            );
            reportTtsProgress("Switching to compatibility phonemizer...");
            phonemizeChunk = await switchToJsPhonemizer();
            phonemes = await phonemizeChunk(chunk);
        }
        const normalized = normalizePhonemes(phonemes);
        const tokenIds = addBoundaryTokens(tokenize(normalized));
        tokenizedChunks.push({ tokenIds, textLength: chunk.length });
    }

    if (activePlayer) {
        await activePlayer.close();
        activePlayer = null;
    }
    reportTtsProgress("Preparing audio output...");
    activePlayer = new StreamingAudioPlayer();

    try {
        await runKittenInference(
            { modelId, text: "", voiceName, speed, tokenizedChunks },
            async (samples) => {
                if (activePlayer && !aborted) {
                    reportTtsProgress("Playing audio...");
                    await activePlayer.playChunk(samples);
                }
            },
            () => aborted,
        );
        if (activePlayer && !aborted) {
            await activePlayer.waitUntilFinished();
        }
    } finally {
        bumpInactivityTimer();
        if (activePlayer) {
            await activePlayer.close();
            activePlayer = null;
        }
    }

    void KITTEN_SAMPLE_RATE;
};

export const stopKitten = async (): Promise<void> => {
    aborted = true;
    if (activePlayer) {
        await activePlayer.close();
        activePlayer = null;
    }
};
