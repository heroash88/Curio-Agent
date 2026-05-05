import { isSafariBrowser } from './audioContext';
import { stripEmojiForSpeech } from './ttsTextSanitizer';

export type TTSEngine = 'auto' | 'pocket-tts' | 'kitten-tts' | 'tiny-tts' | 'piper-tts' | 'browser' | 'remote';

export interface TTSVoiceDescriptor {
  id: string;
  label: string;
  source: 'pocket-tts' | 'kitten-tts' | 'tiny-tts' | 'piper-tts' | 'browser' | 'remote';
}

export interface TTSVoiceSelection {
  voiceId?: string;
  speakerEmbedding?: Float32Array | number[];
  rate?: number;
  pitch?: number;
  volume?: number;
  /** Kitten TTS only: which model variant ('nano' | 'micro' | 'mini'). */
  kittenModelId?: 'nano' | 'micro' | 'mini';
}

interface PocketTtsModule {
  createTTS: () => Promise<PocketTtsInstance> | PocketTtsInstance;
}

interface TinyTtsModule {
  listTinyVoices: () => Array<{ id: string; label: string }>;
  ensureTinyReady: () => Promise<void>;
  speakWithTiny: (
    options: { text: string; speed?: number },
  ) => Promise<void>;
  stopTiny: () => Promise<void>;
  releaseTinyModels: () => void;
}

interface PiperTtsModule {
  listPiperVoices: () => Array<{ id: string; label: string }>;
  ensurePiperReady: (voiceName?: string) => Promise<void>;
  speakWithPiper: (
    text: string,
    options?: { voiceName?: string; speed?: number },
  ) => Promise<void>;
  stopPiper: () => Promise<void>;
  releasePiperModels: () => void;
}

interface PocketTtsInstance {
  speak: (text: string, options?: Record<string, unknown>) => Promise<unknown> | unknown;
  listVoices?: () =>
    | Promise<Array<{ id: string; label?: string }>>
    | Array<{ id: string; label?: string }>;
  stop?: () => Promise<void> | void;
  ensureOfflineModelsReady?: () => Promise<void>;
  clearModelCache?: () => Promise<void>;
}

let moduleLoader: (() => Promise<PocketTtsModule>) | null = null;
let tinyModuleLoader: (() => Promise<TinyTtsModule>) | null = null;
let piperModuleLoader: (() => Promise<PiperTtsModule>) | null = null;
let pocketSpeakQueue: Promise<void> = Promise.resolve();

const DEFAULT_POCKET_TTS_VOICES: TTSVoiceDescriptor[] = [
  { id: 'alba', label: 'Alba', source: 'pocket-tts' },
  { id: 'azelma', label: 'Azelma', source: 'pocket-tts' },
  { id: 'cosette', label: 'Cosette', source: 'pocket-tts' },
  { id: 'eponine', label: 'Eponine', source: 'pocket-tts' },
  { id: 'fantine', label: 'Fantine', source: 'pocket-tts' },
  { id: 'javert', label: 'Javert', source: 'pocket-tts' },
  { id: 'jean', label: 'Jean', source: 'pocket-tts' },
  { id: 'marius', label: 'Marius', source: 'pocket-tts' },
];

const toFloat32Embedding = (embedding?: Float32Array | number[]): Float32Array | undefined => {
  if (!embedding) {
    return undefined;
  }

  if (embedding instanceof Float32Array) {
    return embedding;
  }

  return new Float32Array(embedding);
};

const loadPocketTtsModule = async (): Promise<PocketTtsModule> => {
  if (moduleLoader) {
    return moduleLoader();
  }

  // Load the webgpu-based PocketTTS engine. Vite will code-split this automatically.
  return (await import('./pocketTtsEngine')) as PocketTtsModule;
};

const loadTinyTtsModule = async (): Promise<TinyTtsModule> => {
  if (tinyModuleLoader) {
    return tinyModuleLoader();
  }

  return (await import('./tinyTtsClient')) as TinyTtsModule;
};

const loadPiperTtsModule = async (): Promise<PiperTtsModule> => {
  if (piperModuleLoader) {
    return piperModuleLoader();
  }

  return (await import('./piperTtsClient')) as PiperTtsModule;
};

const isPocketMemoryError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /out of memory|memory|transient reason|wasm/i.test(message);
};

const isPiperRecoverableError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /Piper TTS did not finish|Piper TTS playback|Audio is locked|TTS Session initialization failed|Failed to fetch|NotAllowed|AbortError|decode|memory|WebAssembly|wasm/i.test(message);
};

const enqueuePocketSpeak = (task: () => Promise<void>): Promise<void> => {
  const run = pocketSpeakQueue.catch(() => undefined).then(task);
  pocketSpeakQueue = run.catch(() => undefined);
  return run;
};

const waitForBrowserVoices = async (): Promise<SpeechSynthesisVoice[]> => {
  if (typeof speechSynthesis === 'undefined') {
    return [];
  }

  const voices = speechSynthesis.getVoices();
  if (voices.length > 0) {
    return voices;
  }

  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const timeout = window.setTimeout(() => {
      speechSynthesis.removeEventListener?.('voiceschanged', handleVoicesChanged);
      resolve(speechSynthesis.getVoices());
    }, 300);

    const handleVoicesChanged = () => {
      window.clearTimeout(timeout);
      speechSynthesis.removeEventListener?.('voiceschanged', handleVoicesChanged);
      resolve(speechSynthesis.getVoices());
    };

    speechSynthesis.addEventListener?.('voiceschanged', handleVoicesChanged);
  });
};

export const setPocketTtsModuleLoader = (
  loader: (() => Promise<PocketTtsModule>) | null,
): void => {
  moduleLoader = loader;
};

export const setTinyTtsModuleLoader = (
  loader: (() => Promise<TinyTtsModule>) | null,
): void => {
  tinyModuleLoader = loader;
};

export const setPiperTtsModuleLoader = (
  loader: (() => Promise<PiperTtsModule>) | null,
): void => {
  piperModuleLoader = loader;
};

export class TTSService {
  private pocketInstancePromise: Promise<PocketTtsInstance> | null = null;
  private remoteProvider: any | null = null;

  constructor(
    private readonly options: {
      engine?: TTSEngine;
    } = {},
  ) {}

  private get engine(): TTSEngine {
    return this.options.engine ?? 'auto';
  }

  private async getPocketInstance(): Promise<PocketTtsInstance> {
    if (!this.pocketInstancePromise) {
      this.pocketInstancePromise = loadPocketTtsModule()
        .then(async (module) => await module.createTTS());
    }

    return this.pocketInstancePromise;
  }

  private async getRemoteProvider(): Promise<any> {
    if (!this.remoteProvider) {
      const { RemoteTtsProvider } = await import('./remoteTtsProvider');
      this.remoteProvider = new RemoteTtsProvider();
    }
    return this.remoteProvider;
  }

  private async listPocketVoices(): Promise<TTSVoiceDescriptor[]> {
    const instance = await this.getPocketInstance();
    const voices = instance.listVoices ? await instance.listVoices() : [];

    if (!voices || voices.length === 0) {
      return DEFAULT_POCKET_TTS_VOICES;
    }

    return voices.map((voice) => ({
      id: voice.id,
      label: voice.label || voice.id,
      source: 'pocket-tts' as const,
    }));
  }

  private async listBrowserVoices(): Promise<TTSVoiceDescriptor[]> {
    const voices = await waitForBrowserVoices();
    return voices.map((voice) => ({
      id: voice.name,
      label: voice.name,
      source: 'browser' as const,
    }));
  }

  private async listRemoteVoices(
    options: {
      baseUrl?: string;
      apiKey?: string;
      presetId?: string;
      region?: string;
      secondaryKey?: string;
    } = {},
  ): Promise<TTSVoiceDescriptor[]> {
    const provider = await this.getRemoteProvider();
    const voices = await provider.listVoices(options);
    return voices.map((v: any) => ({
      id: v.id,
      label: v.label,
      source: 'remote' as const,
    }));
  }

  async listVoices(
    options: {
      baseUrl?: string;
      apiKey?: string;
      presetId?: string;
      region?: string;
      secondaryKey?: string;
    } = {},
  ): Promise<TTSVoiceDescriptor[]> {
    if (this.engine === 'remote') {
      return this.listRemoteVoices(options);
    }
    if (this.engine === 'browser') {
      return this.listBrowserVoices();
    }
    if (this.engine === 'kitten-tts') {
      return this.listKittenVoices();
    }
    if (this.engine === 'tiny-tts') {
      return this.listTinyVoices();
    }
    if (this.engine === 'piper-tts') {
      return this.listPiperVoices();
    }
    if (this.engine === 'auto') {
      if (isSafariBrowser) {
        return this.listTinyVoices();
      }
      try {
        return await this.listTinyVoices();
      } catch {
        // Continue to Pocket/browser below.
      }
    }

    try {
      return await this.listPocketVoices();
    } catch {
      if (this.engine === 'pocket-tts') {
        throw new Error('Pocket TTS runtime is not available.');
      }

      return this.listBrowserVoices();
    }
  }

  private async listKittenVoices(): Promise<TTSVoiceDescriptor[]> {
    const { listKittenVoices } = await import('./kittenTtsClient');
    return listKittenVoices().map((v) => ({
      id: v.id,
      label: v.label,
      source: 'kitten-tts' as const,
    }));
  }

  private async listTinyVoices(): Promise<TTSVoiceDescriptor[]> {
    const { listTinyVoices } = await loadTinyTtsModule();
    return listTinyVoices().map((voice) => ({
      id: voice.id,
      label: voice.label,
      source: 'tiny-tts' as const,
    }));
  }

  private async listPiperVoices(): Promise<TTSVoiceDescriptor[]> {
    const { listPiperVoices } = await loadPiperTtsModule();
    return listPiperVoices().map((voice) => ({
      id: voice.id,
      label: voice.label,
      source: 'piper-tts' as const,
    }));
  }

  async prepareOfflineModels(voice: TTSVoiceSelection = {}): Promise<void> {
    if (this.engine === 'kitten-tts') {
      const { ensureKittenReady } = await import('./kittenTtsClient');
      const { getKittenModelId } = await import('../utils/settingsStorage');
      await ensureKittenReady(getKittenModelId());
      return;
    }
    if (this.engine === 'tiny-tts' || this.engine === 'auto') {
      const { ensureTinyReady } = await loadTinyTtsModule();
      await ensureTinyReady();
      return;
    }
    if (this.engine === 'piper-tts') {
      const { ensurePiperReady } = await loadPiperTtsModule();
      await ensurePiperReady(voice.voiceId);
      return;
    }

    const instance = await this.getPocketInstance();
    if (instance.ensureOfflineModelsReady) {
      await instance.ensureOfflineModelsReady();
    }
  }

  async prepareVoiceCloneModels(): Promise<void> {
    // Voice cloning needs the separate Mimi encoder. Keep it out of the
    // normal Pocket warmup path so iOS Safari doesn't pay that memory cost
    // unless the user is actually recording or uploading a custom voice.
    const { initializeMimiEncoder } = await import('../lib/pocketTts/mimiEncoder');
    await initializeMimiEncoder();
  }

  async clearOfflineCache(): Promise<void> {
    if (this.engine === 'kitten-tts') {
      const { releaseKittenModels } = await import('./kittenTtsClient');
      releaseKittenModels();
      return;
    }
    if (this.engine === 'tiny-tts') {
      const { releaseTinyModels } = await loadTinyTtsModule();
      releaseTinyModels();
      return;
    }
    if (this.engine === 'piper-tts') {
      const { releasePiperModels } = await loadPiperTtsModule();
      releasePiperModels();
      return;
    }

    const instance = await this.getPocketInstance();
    if (instance.clearModelCache) {
      await instance.clearModelCache();
    }
    
    const { clearMimiSession } = await import('../lib/pocketTts/mimiEncoder');
    clearMimiSession();
  }

  async speak(text: string, voice: TTSVoiceSelection = {}): Promise<void> {
    const speechText = stripEmojiForSpeech(text);
    if (!speechText) {
      return;
    }

    if (this.engine === 'browser') {
      await this.speakWithBrowser(speechText, voice);
      return;
    }

    if (this.engine === 'remote') {
      const provider = await this.getRemoteProvider();
      await provider.speak(speechText, {
        voiceId: voice.voiceId,
        // @ts-ignore - allowing temporary overrides for preview/test if needed
        baseUrl: voice.baseUrl,
        // @ts-ignore
        apiKey: voice.apiKey,
        // @ts-ignore
        model: voice.model,
        // @ts-ignore
        presetId: voice.presetId,
        // @ts-ignore
        region: voice.region,
        // @ts-ignore
        secondaryKey: voice.secondaryKey,
      });
      return;
    }

    if (this.engine === 'kitten-tts') {
      await this.speakWithKitten(speechText, voice);
      return;
    }

    if (this.engine === 'tiny-tts') {
      await this.speakWithTiny(speechText, voice);
      return;
    }

    if (this.engine === 'piper-tts') {
      try {
        await this.speakWithPiper(speechText, voice);
      } catch (error) {
        if (!isPiperRecoverableError(error)) {
          throw error;
        }

        const { reportTtsProgress } = await import('./ttsProgress');
        reportTtsProgress('Piper TTS is not ready in this browser. Using a lighter local voice for this response.');

        try {
          await this.speakWithTiny(speechText, voice);
        } catch (tinyError) {
          console.warn('[TTSService] TinyTTS fallback failed after Piper, using browser speech:', tinyError);
          await this.speakWithBrowser(speechText, voice);
        }
      }
      return;
    }

    if (this.engine === 'auto' && !voice.speakerEmbedding) {
      if (isSafariBrowser) {
        try {
          await this.speakWithTiny(speechText, voice);
          return;
        } catch (error) {
          console.warn('[TTSService] TinyTTS failed in Safari auto mode, using browser fallback:', error);
          await this.speakWithBrowser(speechText, voice);
          return;
        }
      }

      try {
        await this.speakWithTiny(speechText, voice);
        return;
      } catch (error) {
        console.warn('[TTSService] TinyTTS failed, trying browser fallback:', error);
        await this.speakWithBrowser(speechText, voice);
        return;
      }
    }

    try {
      await this.speakWithPocket(speechText, voice);
    } catch (error) {
      if (this.engine === 'pocket-tts') {
        if (!voice.speakerEmbedding && isPocketMemoryError(error)) {
          const { reportTtsProgress } = await import('./ttsProgress');
          reportTtsProgress('Pocket TTS ran out of browser memory. Using the browser voice for this preview.');
          await this.speakWithBrowser(speechText, voice);
          return;
        }
        throw new Error(
          `Pocket TTS runtime is not available. ${(error as Error).message || ''}`.trim(),
        );
      }

      if (voice.speakerEmbedding) {
        throw new Error('Pocket TTS runtime is required for cloned voice playback.');
      }

      await this.speakWithBrowser(speechText, voice);
    }
  }

  async stop(): Promise<void> {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }

    if (this.remoteProvider) {
      await this.remoteProvider.stop?.();
    }

    // Stop any active kitten playback (best-effort; safe if never used).
    try {
      const { stopKitten } = await import('./kittenTtsClient');
      await stopKitten();
    } catch {
      // Module not loaded -- nothing to stop.
    }

    try {
      const { stopTiny } = await loadTinyTtsModule();
      await stopTiny();
    } catch {
      // Module not loaded -- nothing to stop.
    }

    try {
      const { stopPiper } = await loadPiperTtsModule();
      await stopPiper();
    } catch {
      // Module not loaded -- nothing to stop.
    }

    if (!this.pocketInstancePromise) {
      return;
    }

    try {
      const instance = await this.pocketInstancePromise;
      await instance.stop?.();
    } catch {
      // Ignore stop failures -- runtime may never have initialized.
    }
  }

  private async speakWithKitten(text: string, voice: TTSVoiceSelection): Promise<void> {
    const { speakWithKitten } = await import('./kittenTtsClient');
    const { getKittenModelId } = await import('../utils/settingsStorage');
    await speakWithKitten({
      text,
      voiceName: voice.voiceId,
      modelId: voice.kittenModelId ?? getKittenModelId(),
      speed: voice.rate,
    });
  }

  private async speakWithTiny(text: string, voice: TTSVoiceSelection): Promise<void> {
    const { speakWithTiny } = await loadTinyTtsModule();
    await speakWithTiny({
      text,
      speed: voice.rate,
    });
  }

  private async speakWithPiper(text: string, voice: TTSVoiceSelection): Promise<void> {
    const { speakWithPiper } = await loadPiperTtsModule();
    await speakWithPiper(text, {
      voiceName: voice.voiceId,
      speed: voice.rate,
    });
  }

  private async speakWithPocket(text: string, voice: TTSVoiceSelection): Promise<void> {
    await enqueuePocketSpeak(async () => {
      const instance = await this.getPocketInstance();
      const options: Record<string, unknown> = {};

      if (voice.voiceId) {
        options.speaker = voice.voiceId;
      }

      const embedding = toFloat32Embedding(voice.speakerEmbedding);
      if (embedding) {
        options.speakerEmbedding = embedding;
      }

      await instance.speak(text, options);
    });
  }

  private async speakWithBrowser(text: string, voice: TTSVoiceSelection): Promise<void> {
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
      throw new Error('Browser speech synthesis is not available.');
    }

    const browserVoices = await waitForBrowserVoices();
    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = browserVoices.find((candidate) => candidate.name === voice.voiceId);

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    if (Number.isFinite(voice.rate)) {
      utterance.rate = Number(voice.rate);
    }

    if (Number.isFinite(voice.pitch)) {
      utterance.pitch = Number(voice.pitch);
    }

    if (Number.isFinite(voice.volume)) {
      utterance.volume = Number(voice.volume);
    }

    await new Promise<void>((resolve, reject) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => reject(new Error('Browser speech synthesis failed.'));
      speechSynthesis.speak(utterance);
    });
  }
}
