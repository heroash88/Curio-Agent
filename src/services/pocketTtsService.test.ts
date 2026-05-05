import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TTSService,
  setPocketTtsModuleLoader,
  setPiperTtsModuleLoader,
  setTinyTtsModuleLoader,
} from './pocketTtsService';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

class FakeSpeechSynthesisUtterance {
  public voice: SpeechSynthesisVoice | null = null;
  public rate = 1;
  public pitch = 1;
  public volume = 1;
  public onend: ((event: Event) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;

  constructor(public text: string) {}
}

describe('TTSService', () => {
  beforeEach(() => {
    setPocketTtsModuleLoader(null);
    setPiperTtsModuleLoader(null);
    setTinyTtsModuleLoader(null);
    vi.restoreAllMocks();
    vi.stubGlobal('SpeechSynthesisUtterance', FakeSpeechSynthesisUtterance as unknown as typeof SpeechSynthesisUtterance);
  });

  it('lazy-loads the Pocket TTS runtime only once', async () => {
    const speak = vi.fn().mockResolvedValue(undefined);
    const createTTS = vi.fn().mockResolvedValue({
      speak,
      listVoices: vi.fn().mockResolvedValue([
        { id: 'alba', label: 'Alba' },
      ]),
    });

    setPocketTtsModuleLoader(async () => ({ createTTS }));

    const service = new TTSService({ engine: 'pocket-tts' });

    const voices = await service.listVoices();
    await service.speak('Hello there', { voiceId: 'alba' });
    await service.speak('Hello again', { voiceId: 'alba' });

    expect(voices).toEqual([{ id: 'alba', label: 'Alba', source: 'pocket-tts' }]);
    expect(createTTS).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenNthCalledWith(1, 'Hello there', { speaker: 'alba' });
    expect(speak).toHaveBeenNthCalledWith(2, 'Hello again', { speaker: 'alba' });
  });

  it('serializes Pocket speech across service instances', async () => {
    let resolveFirst!: () => void;
    const speak = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce(undefined);
    const createTTS = vi.fn().mockResolvedValue({ speak });

    setPocketTtsModuleLoader(async () => ({ createTTS }));

    const firstService = new TTSService({ engine: 'pocket-tts' });
    const secondService = new TTSService({ engine: 'pocket-tts' });

    const first = firstService.speak('First reply', { voiceId: 'alba' });
    const second = secondService.speak('Second reply', { voiceId: 'alba' });

    await tick();

    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith('First reply', { speaker: 'alba' });

    resolveFirst();
    await first;
    await tick();

    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak).toHaveBeenNthCalledWith(2, 'Second reply', { speaker: 'alba' });

    await second;
  });

  it('removes emoji before sending text to TTS engines', async () => {
    const speak = vi.fn().mockResolvedValue(undefined);
    const createTTS = vi.fn().mockResolvedValue({
      speak,
    });

    setPocketTtsModuleLoader(async () => ({ createTTS }));

    const service = new TTSService({ engine: 'pocket-tts' });
    await service.speak('Nice work 😊🚀 1️⃣ from the crew 👨‍👩‍👧‍👦!', { voiceId: 'alba' });

    expect(speak).toHaveBeenCalledWith('Nice work from the crew!', { speaker: 'alba' });
  });

  it('falls back to browser speech synthesis in auto mode when TinyTTS is unavailable', async () => {
    setPocketTtsModuleLoader(async () => {
      throw new Error('Pocket TTS runtime missing');
    });
    setTinyTtsModuleLoader(async () => {
      throw new Error('TinyTTS runtime missing');
    });

    const speak = vi.fn((utterance: FakeSpeechSynthesisUtterance) => {
      utterance.onend?.(new Event('end'));
    });

    const voice = { name: 'Browser Voice', lang: 'en-US' } as SpeechSynthesisVoice;
    vi.stubGlobal('speechSynthesis', {
      speak,
      cancel: vi.fn(),
      getVoices: vi.fn(() => [voice]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } satisfies Partial<SpeechSynthesis>);

    const service = new TTSService({ engine: 'auto' });
    const voices = await service.listVoices();

    expect(voices).toEqual([{ id: 'Browser Voice', label: 'Browser Voice', source: 'browser' }]);

    await service.speak('Fallback speech', { voiceId: 'Browser Voice' });

    expect(speak).toHaveBeenCalledTimes(1);
    expect((speak.mock.calls[0]?.[0] as FakeSpeechSynthesisUtterance).text).toBe('Fallback speech');
  });

  it('prefers TinyTTS in auto mode before loading the heavier Pocket runtime', async () => {
    const speakWithTiny = vi.fn().mockResolvedValue(undefined);
    const createTTS = vi.fn();
    setTinyTtsModuleLoader(async () => ({
      listTinyVoices: () => [{ id: 'MALE', label: 'Tiny' }],
      ensureTinyReady: vi.fn().mockResolvedValue(undefined),
      speakWithTiny,
      stopTiny: vi.fn().mockResolvedValue(undefined),
      releaseTinyModels: vi.fn(),
    }));
    setPocketTtsModuleLoader(async () => ({ createTTS }));

    const service = new TTSService({ engine: 'auto' });
    await service.speak('Auto local voice');

    expect(speakWithTiny).toHaveBeenCalledTimes(1);
    expect(createTTS).not.toHaveBeenCalled();
  });

  it('uses TinyTTS voices and playback when TinyTTS is selected', async () => {
    const speakWithTiny = vi.fn().mockResolvedValue(undefined);
    setTinyTtsModuleLoader(async () => ({
      listTinyVoices: () => [{ id: 'MALE', label: 'Tiny - English male' }],
      ensureTinyReady: vi.fn().mockResolvedValue(undefined),
      speakWithTiny,
      stopTiny: vi.fn().mockResolvedValue(undefined),
      releaseTinyModels: vi.fn(),
    }));

    const service = new TTSService({ engine: 'tiny-tts' });

    await expect(service.listVoices()).resolves.toEqual([
      { id: 'MALE', label: 'Tiny - English male', source: 'tiny-tts' },
    ]);
    await service.speak('A tiny local voice', { rate: 1.15 });

    expect(speakWithTiny).toHaveBeenCalledWith({
      text: 'A tiny local voice',
      speed: 1.15,
    });
  });

  it('uses Piper voices, preparation, and playback when Piper TTS is selected', async () => {
    const ensurePiperReady = vi.fn().mockResolvedValue(undefined);
    const speakWithPiper = vi.fn().mockResolvedValue(undefined);
    setPiperTtsModuleLoader(async () => ({
      listPiperVoices: () => [
        { id: 'en_US-lessac-low', label: 'Lessac - US English (low)' },
        { id: 'en_US-lessac-medium', label: 'Lessac - US English (medium)' },
        { id: 'en_US-amy-low', label: 'Amy - US English female (low)' },
      ],
      ensurePiperReady,
      speakWithPiper,
      stopPiper: vi.fn().mockResolvedValue(undefined),
      releasePiperModels: vi.fn(),
    }));

    const service = new TTSService({ engine: 'piper-tts' });

    await expect(service.listVoices()).resolves.toEqual([
      { id: 'en_US-lessac-low', label: 'Lessac - US English (low)', source: 'piper-tts' },
      { id: 'en_US-lessac-medium', label: 'Lessac - US English (medium)', source: 'piper-tts' },
      { id: 'en_US-amy-low', label: 'Amy - US English female (low)', source: 'piper-tts' },
    ]);

    await service.prepareOfflineModels({ voiceId: 'en_US-amy-low' });
    await service.speak('A Piper local voice', { voiceId: 'en_US-lessac-medium', rate: 0.95 });

    expect(ensurePiperReady).toHaveBeenCalledWith('en_US-amy-low');
    expect(speakWithPiper).toHaveBeenCalledWith('A Piper local voice', {
      voiceName: 'en_US-lessac-medium',
      speed: 0.95,
    });
  });

  it('falls back to TinyTTS when explicit Piper playback stalls', async () => {
    const speakWithTiny = vi.fn().mockResolvedValue(undefined);
    setPiperTtsModuleLoader(async () => ({
      listPiperVoices: () => [{ id: 'en_US-lessac-low', label: 'Lessac' }],
      ensurePiperReady: vi.fn().mockResolvedValue(undefined),
      speakWithPiper: vi.fn().mockRejectedValue(new Error('Piper TTS did not finish loading')),
      stopPiper: vi.fn().mockResolvedValue(undefined),
      releasePiperModels: vi.fn(),
    }));
    setTinyTtsModuleLoader(async () => ({
      listTinyVoices: () => [{ id: 'MALE', label: 'Tiny' }],
      ensureTinyReady: vi.fn().mockResolvedValue(undefined),
      speakWithTiny,
      stopTiny: vi.fn().mockResolvedValue(undefined),
      releaseTinyModels: vi.fn(),
    }));

    const service = new TTSService({ engine: 'piper-tts' });
    await service.speak('Do not go silent', { voiceId: 'en_US-lessac-low', rate: 0.95 });

    expect(speakWithTiny).toHaveBeenCalledWith({
      text: 'Do not go silent',
      speed: 0.95,
    });
  });

  it('falls back to browser speech when Piper and TinyTTS both fail', async () => {
    setPiperTtsModuleLoader(async () => ({
      listPiperVoices: () => [{ id: 'en_US-lessac-low', label: 'Lessac' }],
      ensurePiperReady: vi.fn().mockResolvedValue(undefined),
      speakWithPiper: vi.fn().mockRejectedValue(new Error('Piper TTS playback failed')),
      stopPiper: vi.fn().mockResolvedValue(undefined),
      releasePiperModels: vi.fn(),
    }));
    setTinyTtsModuleLoader(async () => ({
      listTinyVoices: () => [{ id: 'MALE', label: 'Tiny' }],
      ensureTinyReady: vi.fn().mockResolvedValue(undefined),
      speakWithTiny: vi.fn().mockRejectedValue(new Error('TinyTTS failed')),
      stopTiny: vi.fn().mockResolvedValue(undefined),
      releaseTinyModels: vi.fn(),
    }));

    const speak = vi.fn((utterance: FakeSpeechSynthesisUtterance) => {
      utterance.onend?.(new Event('end'));
    });

    vi.stubGlobal('speechSynthesis', {
      speak,
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } satisfies Partial<SpeechSynthesis>);

    const service = new TTSService({ engine: 'piper-tts' });
    await service.speak('Use the last fallback');

    expect(speak).toHaveBeenCalledTimes(1);
    expect((speak.mock.calls[0]?.[0] as FakeSpeechSynthesisUtterance).text).toBe('Use the last fallback');
  });

  it('falls back to browser speech for explicit Pocket playback when Safari reports memory pressure', async () => {
    setPocketTtsModuleLoader(async () => ({
      createTTS: vi.fn().mockResolvedValue({
        speak: vi.fn().mockRejectedValue(new Error('unknown transient reason (e.g. out of memory)')),
      }),
    }));

    const speak = vi.fn((utterance: FakeSpeechSynthesisUtterance) => {
      utterance.onend?.(new Event('end'));
    });

    vi.stubGlobal('speechSynthesis', {
      speak,
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } satisfies Partial<SpeechSynthesis>);

    const service = new TTSService({ engine: 'pocket-tts' });
    await service.speak('Memory-safe fallback');

    expect(speak).toHaveBeenCalledTimes(1);
    expect((speak.mock.calls[0]?.[0] as FakeSpeechSynthesisUtterance).text).toBe('Memory-safe fallback');
  });

  it('rejects cloned voice playback when Pocket TTS is unavailable', async () => {
    setPocketTtsModuleLoader(async () => {
      throw new Error('Pocket TTS runtime missing');
    });

    vi.stubGlobal('speechSynthesis', {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } satisfies Partial<SpeechSynthesis>);

    const service = new TTSService({ engine: 'auto' });

    await expect(
      service.speak('Custom voice sample', {
        speakerEmbedding: new Float32Array([0.2, -0.1, 0.4]),
      }),
    ).rejects.toThrow(/Pocket TTS runtime/i);
  });
});
