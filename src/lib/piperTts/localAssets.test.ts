import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PIPER_LOCAL_MODEL_PATH,
  PIPER_WASM_PATHS,
  PIPER_VOICES,
  assertPiperLocalAssetsAvailable,
  installLocalPiperFetch,
  piperLocalAssetPath,
} from './localAssets';
import { createOrtWasmPaths } from '../ortWasmConfig';

describe('Piper TTS local assets', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('bundles publishable low and medium voice weights locally', () => {
    const qualities = new Set(PIPER_VOICES.map((voice) => voice.quality));
    const voiceIds = PIPER_VOICES.map((voice) => voice.id);

    expect(qualities).toEqual(new Set(['low', 'medium']));
    expect(voiceIds).toEqual(expect.arrayContaining([
      'en_US-lessac-low',
      'en_US-lessac-medium',
      'en_US-amy-low',
      'en_US-amy-medium',
      'en_GB-alba-medium',
      'en_GB-cori-medium',
    ]));
    expect(PIPER_VOICES.length).toBeGreaterThanOrEqual(9);
  });

  it('maps Piper Hugging Face model URLs to local project assets', () => {
    expect(
      piperLocalAssetPath(
        'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx',
      ),
    ).toBe(`${PIPER_LOCAL_MODEL_PATH}/voices/en_US-lessac-medium/en_US-lessac-medium.onnx`);
    expect(
      piperLocalAssetPath(
        'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json',
      ),
    ).toBe(`${PIPER_LOCAL_MODEL_PATH}/voices/en_US-lessac-medium/en_US-lessac-medium.onnx.json`);
    expect(
      piperLocalAssetPath(
        'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/cori/medium/en_GB-cori-medium.onnx',
      ),
    ).toBe(`${PIPER_LOCAL_MODEL_PATH}/voices/en_GB-cori-medium/en_GB-cori-medium.onnx`);
  });

  it('uses an object ONNX WASM mapping so Vite does not import public .mjs files', () => {
    expect(PIPER_WASM_PATHS.onnxWasm).toEqual(createOrtWasmPaths());
  });

  it('patches Piper voice fetches without affecting other requests', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);

    installLocalPiperFetch();

    await fetch(
      'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx',
    );
    await fetch('/models/tiny-tts/config.json');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${PIPER_LOCAL_MODEL_PATH}/voices/en_US-lessac-medium/en_US-lessac-medium.onnx`,
      undefined,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/models/tiny-tts/config.json', undefined);
  });

  it('blocks unbundled Piper model downloads so runtime stays offline-only', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);

    installLocalPiperFetch();

    await expect(fetch(
      'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/en/en_US/libritts/high/en_US-libritts-high.onnx',
    )).rejects.toThrow(/offline-only/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks the local Piper runtime and voice files', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await assertPiperLocalAssetsAvailable(['en_US-lessac-low']);

    expect(fetchMock).toHaveBeenCalledWith(
      `${PIPER_LOCAL_MODEL_PATH}/wasm/piper_phonemize.wasm`,
      expect.objectContaining({ method: 'HEAD' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${PIPER_LOCAL_MODEL_PATH}/wasm/piper_phonemize.data`,
      expect.objectContaining({ method: 'HEAD' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${PIPER_LOCAL_MODEL_PATH}/voices/en_US-lessac-low/en_US-lessac-low.onnx`,
      expect.objectContaining({ method: 'HEAD' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${PIPER_LOCAL_MODEL_PATH}/voices/en_US-lessac-low/en_US-lessac-low.onnx.json`,
      expect.objectContaining({ method: 'HEAD' }),
    );
  });
});
