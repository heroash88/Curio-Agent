import type { TtsSession as PiperTtsSession } from '@realtimex/piper-tts-web';
import {
  getSharedAudioContext,
  isAudioUnlocked,
  isSafariBrowser,
  isStrictAudioPolicy,
  lockAudioSuspend,
  unlockAudioSuspend,
} from './audioContext';
import { reportTtsProgress } from './ttsProgress';
import { stripEmojiForSpeech } from './ttsTextSanitizer';
import {
  DEFAULT_PIPER_VOICE,
  PIPER_VOICES,
  PIPER_WASM_PATHS,
  assertPiperLocalAssetsAvailable,
  installLocalPiperFetch,
} from '../lib/piperTts/localAssets';

type PiperTtsModule = typeof import('@realtimex/piper-tts-web') & {
  TtsSession: typeof PiperTtsSession & { _instance?: PiperTtsSession | null };
  remove?: (voiceId: string) => Promise<void>;
};

const INACTIVITY_RELEASE_MS = 90_000;
const MAX_HOT_PIPER_SESSIONS = 3;
const PIPER_LOAD_TIMEOUT_MS = 90_000;
const PIPER_SAFARI_LOAD_TIMEOUT_MS = 60_000;
const PIPER_PREDICT_TIMEOUT_MS = 45_000;
const PIPER_SAFARI_PREDICT_TIMEOUT_MS = 30_000;

let piperModulePromise: Promise<PiperTtsModule> | null = null;
let activeSource: AudioBufferSourceNode | null = null;
let activePlaybackResolve: (() => void) | null = null;
let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

interface CachedPiperSession {
  promise: Promise<PiperTtsSession>;
  lastUsed: number;
}

const sessionCache = new Map<string, CachedPiperSession>();

export const listPiperVoices = (): Array<{ id: string; label: string }> =>
  PIPER_VOICES.map((voice) => ({ id: voice.id, label: voice.label }));

const normalizePiperVoice = (voiceName?: string): string => {
  const voiceId = voiceName?.trim();
  return PIPER_VOICES.some((voice) => voice.id === voiceId) ? voiceId as string : DEFAULT_PIPER_VOICE;
};

const loadPiperModule = async (): Promise<PiperTtsModule> => {
  piperModulePromise ??= import('@realtimex/piper-tts-web') as Promise<PiperTtsModule>;
  return piperModulePromise;
};

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          onTimeout?.();
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const bumpInactivityTimer = (): void => {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    inactivityTimer = null;
    releasePiperModels();
  }, INACTIVITY_RELEASE_MS);
};

const pruneSessionCache = (activeVoiceId: string): void => {
  if (sessionCache.size <= MAX_HOT_PIPER_SESSIONS) return;

  const staleEntries = [...sessionCache.entries()]
    .filter(([voiceId]) => voiceId !== activeVoiceId)
    .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);

  while (sessionCache.size > MAX_HOT_PIPER_SESSIONS && staleEntries.length > 0) {
    const [voiceId] = staleEntries.shift() as [string, CachedPiperSession];
    sessionCache.delete(voiceId);
  }
};

const getPiperSession = async (voiceId: string): Promise<PiperTtsSession> => {
  installLocalPiperFetch();
  await assertPiperLocalAssetsAvailable([voiceId]);

  const cached = sessionCache.get(voiceId);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.promise;
  }

  const piper = await loadPiperModule();
  piper.TtsSession._instance = null;
  reportTtsProgress(`Loading Piper ${voiceId}...`);
  const rawPromise = piper.TtsSession.create({
    voiceId,
    allowLocalModels: true,
    fallbackStrategy: 'local',
    wasmPaths: PIPER_WASM_PATHS as unknown as {
      onnxWasm: string;
      piperData: string;
      piperWasm: string;
    },
    progress: (progress) => {
      if (progress.total > 0) {
        reportTtsProgress(`Loading Piper ${Math.round((progress.loaded / progress.total) * 100)}%...`);
      }
    },
  });
  const promise = withTimeout(
    rawPromise,
    isSafariBrowser ? PIPER_SAFARI_LOAD_TIMEOUT_MS : PIPER_LOAD_TIMEOUT_MS,
    'Piper TTS did not finish loading. Curio will use a lighter local voice for this response.',
    () => {
      reportTtsProgress('Piper TTS load timed out. Clearing cached voice data...');
      piper.TtsSession._instance = null;
      void piper.remove?.(voiceId).catch(() => {});
    },
  );
  sessionCache.set(voiceId, { promise, lastUsed: Date.now() });
  pruneSessionCache(voiceId);

  try {
    const session = await promise;
    reportTtsProgress('Piper ready.');
    return session;
  } catch (error) {
    sessionCache.delete(voiceId);
    piper.TtsSession._instance = null;
    void piper.remove?.(voiceId).catch(() => {});
    reportTtsProgress((error as Error).message || 'Piper TTS could not be loaded.');
    throw error;
  }
};

const stopActiveAudio = (): void => {
  const source = activeSource;
  activeSource = null;
  const resolve = activePlaybackResolve;
  activePlaybackResolve = null;

  if (source) {
    try {
      source.stop();
      source.disconnect();
    } catch {
      // Source may already be stopped.
    }
  }

  resolve?.();
};

const decodeAudioData = async (
  ctx: AudioContext,
  data: ArrayBuffer,
): Promise<AudioBuffer> => new Promise((resolve, reject) => {
  let settled = false;
  const onResolve = (buffer: AudioBuffer) => {
    if (settled) return;
    settled = true;
    resolve(buffer);
  };
  const onReject = (error: DOMException | Error) => {
    if (settled) return;
    settled = true;
    reject(error);
  };

  const result = ctx.decodeAudioData(data.slice(0), onResolve, onReject);
  void result?.then(onResolve, onReject);
});

const resumePiperAudioContext = async (ctx: AudioContext): Promise<void> => {
  if (ctx.state !== 'suspended') return;
  if (isStrictAudioPolicy() && !isAudioUnlocked()) {
    throw new Error('Audio is locked on Safari. Start playback from a direct user interaction first.');
  }
  await ctx.resume();
};

const playWavBlob = async (blob: Blob, playbackRate?: number): Promise<void> => {
  stopActiveAudio();

  const ctx = getSharedAudioContext(false);
  await resumePiperAudioContext(ctx);
  const decoded = await decodeAudioData(ctx, await blob.arrayBuffer());
  const rate = Number.isFinite(playbackRate) && playbackRate && playbackRate > 0
    ? Math.min(1.35, Math.max(0.75, playbackRate))
    : 1;

  lockAudioSuspend();

  try {
    await new Promise<void>((resolve, reject) => {
      const source = ctx.createBufferSource();
      const playbackTimeout = setTimeout(() => {
        if (activeSource === source) activeSource = null;
        if (activePlaybackResolve) activePlaybackResolve = null;
        try {
          source.stop();
          source.disconnect();
        } catch {
          // Source may already be stopped.
        }
        reject(new Error('Piper TTS playback did not finish.'));
      }, Math.max(5_000, (decoded.duration / rate) * 1000 + 2_000));

      activeSource = source;
      activePlaybackResolve = () => {
        clearTimeout(playbackTimeout);
        resolve();
      };
      source.buffer = decoded;
      source.playbackRate.value = rate;
      source.connect(ctx.destination);
      source.onended = () => {
        if (activeSource === source) activeSource = null;
        if (activePlaybackResolve) {
          const finish = activePlaybackResolve;
          activePlaybackResolve = null;
          finish();
        }
        try {
          source.disconnect();
        } catch {
          // Already disconnected.
        }
      };

      try {
        source.start();
      } catch (error) {
        clearTimeout(playbackTimeout);
        if (activeSource === source) activeSource = null;
        if (activePlaybackResolve) activePlaybackResolve = null;
        reject(error);
      }
    });
  } finally {
    unlockAudioSuspend();
    stopActiveAudio();
  }
};

export const ensurePiperReady = async (voiceName?: string): Promise<void> => {
  await getPiperSession(normalizePiperVoice(voiceName));
  bumpInactivityTimer();
};

export const chunkPiperText = (text: string, maxChunkLength = 240): string[] => {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) return [];

  const sentences = cleaned.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [cleaned];
  const chunks: string[] = [];
  let current = '';

  const pushWords = (sentence: string): void => {
    let wordChunk = '';
    for (const word of sentence.split(/\s+/)) {
      const next = wordChunk ? `${wordChunk} ${word}` : word;
      if (next.length > maxChunkLength && wordChunk) {
        chunks.push(wordChunk);
        wordChunk = word;
      } else {
        wordChunk = next;
      }
    }
    if (wordChunk) chunks.push(wordChunk);
  };

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    if (sentence.length > maxChunkLength * 1.35) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      pushWords(sentence);
      continue;
    }

    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > maxChunkLength && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
};

export const speakWithPiper = async (
  text: string,
  options: { voiceName?: string; speed?: number } = {},
): Promise<void> => {
  const cleaned = stripEmojiForSpeech(text).trim().replace(/\s+/g, ' ');
  if (!cleaned) return;

  const voiceId = normalizePiperVoice(options.voiceName);
  bumpInactivityTimer();
  const session = await getPiperSession(voiceId);
  const chunks = chunkPiperText(cleaned);
  let nextWavPromise: Promise<Blob> | null = null;

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    reportTtsProgress(`Generating Piper audio (${index + 1}/${chunks.length})...`);
    nextWavPromise ??= withTimeout(
      session.predict(chunk),
      isSafariBrowser ? PIPER_SAFARI_PREDICT_TIMEOUT_MS : PIPER_PREDICT_TIMEOUT_MS,
      'Piper TTS did not finish generating audio. Curio will use a lighter local voice for this response.',
    );
    const wav = await nextWavPromise;
    nextWavPromise = index + 1 < chunks.length
      ? withTimeout(
        session.predict(chunks[index + 1]),
        isSafariBrowser ? PIPER_SAFARI_PREDICT_TIMEOUT_MS : PIPER_PREDICT_TIMEOUT_MS,
        'Piper TTS did not finish generating audio. Curio will use a lighter local voice for this response.',
      )
      : null;
    reportTtsProgress('Playing audio...');
    await playWavBlob(wav, options.speed);
  }
  bumpInactivityTimer();
};

export const stopPiper = async (): Promise<void> => {
  stopActiveAudio();
};

export const releasePiperModels = (): void => {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
  stopActiveAudio();
  sessionCache.clear();
  void loadPiperModule().then((piper) => {
    piper.TtsSession._instance = null;
  }).catch(() => {
    // Module never loaded.
  });
};
