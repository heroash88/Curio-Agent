export const WAKE_WORD_DETECTED_EVENT = 'WAKE_WORD_DETECTED';
export const DEFAULT_WAKE_WORD_ID = 'hey-curio';
export const DEFAULT_WAKE_WORD_ENABLED = false;

export interface WakeWordDefinition {
    id: string;
    label: string;
    phrase: string;
    modelPath: string;
    threshold: number;
}

export interface WakeWordDetectedDetail {
    id: string;
    label: string;
    phrase: string;
    score: number;
}

export const BUILTIN_WAKE_WORDS: WakeWordDefinition[] = [
    {
        id: 'hey-curio',
        label: 'Hey Curio',
        phrase: 'Hey Curio',
        modelPath: '/models/Hey_Curio.onnx',
        threshold: 0.18
    },
    {
        id: 'bimo',
        label: 'Bimo',
        phrase: 'Bimo',
        modelPath: '/models/BIMO.onnx',
        threshold: 0.35
    },
    {
        id: 'robot',
        label: 'Robot',
        phrase: 'Robot',
        modelPath: '/models/Robot.onnx',
        threshold: 0.35
    },
    {
        id: 'jarvis',
        label: 'Jarvis',
        phrase: 'Jarvis',
        modelPath: '/models/jarvis_v2.onnx',
        threshold: 0.35
    },
    {
        id: 'hello-deepa',
        label: 'Hello Deepa',
        phrase: 'Hello Deepa',
        modelPath: '/models/hello_deepa.onnx',
        threshold: 0.42
    },
    {
        id: 'namaste-deepa',
        label: 'Namaste Deepa',
        phrase: 'Namaste Deepa',
        modelPath: '/models/namaste_deepa.onnx',
        threshold: 0.42
    },
    {
        id: 'hey-bender',
        label: 'Hey Bender',
        phrase: 'Hey Bender',
        modelPath: '/models/Hey_Bender.onnx',
        threshold: 0.35
    }
];

import { listCustomWakeWords, getCustomWakeWordBlobUrl } from './customWakeWordStore';

// In-memory cache of custom wake words loaded from IndexedDB
let customWakeWords: WakeWordDefinition[] = [];

/**
 * Load custom wake words from IndexedDB into the in-memory cache.
 * Call this once at startup or after adding/removing a custom model.
 */
export async function loadCustomWakeWords(): Promise<void> {
    try {
        const entries = await listCustomWakeWords();
        customWakeWords = entries.map((e) => ({
            id: e.id,
            label: e.label,
            phrase: e.phrase,
            modelPath: '', // resolved at load time via blob URL
            threshold: e.threshold,
        }));
    } catch (err) {
        console.warn('[WakeWordCatalog] Failed to load custom wake words:', err);
    }
}

/**
 * Get the model path for a wake word. For custom models, this creates
 * a blob URL from IndexedDB on demand.
 */
export async function resolveModelPath(wakeWord: WakeWordDefinition): Promise<string> {
    if (wakeWord.modelPath) return wakeWord.modelPath;
    // Custom wake word -- resolve from IndexedDB
    const blobUrl = await getCustomWakeWordBlobUrl(wakeWord.id);
    if (blobUrl) return blobUrl;
    throw new Error(`No model found for wake word: ${wakeWord.id}`);
}

export function getAvailableWakeWords(): WakeWordDefinition[] {
    return [
        ...BUILTIN_WAKE_WORDS.map((wakeWord) => ({ ...wakeWord })),
        ...customWakeWords,
    ];
}

export function resolveWakeWordId(candidate: string | null | undefined): string {
    if (!candidate) return DEFAULT_WAKE_WORD_ID;
    const normalized = String(candidate).trim().toLowerCase();
    const all = getAvailableWakeWords();
    const match = all.find((wakeWord) => wakeWord.id === normalized);
    return match?.id ?? DEFAULT_WAKE_WORD_ID;
}

export function getWakeWordDefinition(wakeWordId: string | null | undefined): WakeWordDefinition {
    const resolvedId = resolveWakeWordId(wakeWordId);
    const all = getAvailableWakeWords();
    return all.find((wakeWord) => wakeWord.id === resolvedId) || BUILTIN_WAKE_WORDS[0];
}
