import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chunkPiperText } from './piperTtsClient';

const okFetch = vi.fn(async () => new Response(null, {
  status: 200,
  headers: { 'content-type': 'application/octet-stream' },
}));

describe('piperTtsClient performance helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('@realtimex/piper-tts-web');
  });

  it('splits longer text so Piper can start playback before a full response is synthesized', () => {
    const text = [
      'First sentence is short.',
      'Second sentence is intentionally a little longer so the chunker has useful punctuation to follow.',
      'Third sentence gives the renderer another chunk to synthesize while previous audio is playing.',
    ].join(' ');

    const chunks = chunkPiperText(text, 90);

    expect(chunks).toEqual([
      'First sentence is short.',
      'Second sentence is intentionally a little longer so the chunker has useful punctuation to follow.',
      'Third sentence gives the renderer another chunk to synthesize while previous audio is playing.',
    ]);
  });

  it('rejects and clears a stalled Piper session load instead of waiting forever', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', okFetch);
    vi.doMock('@realtimex/piper-tts-web', () => ({
      TtsSession: {
        _instance: null,
        create: vi.fn(() => new Promise(() => {})),
      },
      remove: vi.fn().mockResolvedValue(undefined),
    }));

    vi.resetModules();
    const { ensurePiperReady } = await import('./piperTtsClient');

    const loadPromise = ensurePiperReady('en_US-lessac-low');
    const observed = loadPromise.then(
      () => 'resolved',
      (error: Error) => error.message,
    );

    await vi.advanceTimersByTimeAsync(90_001);

    await expect(Promise.race([observed, Promise.resolve('pending')]))
      .resolves.toMatch(/Piper TTS did not finish loading/i);
  });
});
