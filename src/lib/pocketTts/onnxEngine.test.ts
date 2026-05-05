import { describe, expect, it, vi } from 'vitest';

vi.mock('onnxruntime-web/wasm', () => {
  class Tensor {
    constructor(
      public type: string,
      public data: Float32Array | BigInt64Array | Uint8Array,
      public dims: number[],
    ) {}
  }

  return {
    Tensor,
    env: { wasm: {} },
    InferenceSession: { create: vi.fn() },
  };
});

import {
  POCKET_DECODER_SETTLE_FRAMES,
  POCKET_DECODER_WARMUP_FRAMES,
} from './audioPostProcess';
import { POCKET_STREAM_PRIME_SEC, runInference, type ModelBundle } from './onnxEngine';

type FakeTensor = {
  type: string;
  data: Float32Array;
  dims: number[];
};

const tensor = (data: Float32Array, dims: number[]): FakeTensor => ({
  type: 'float32',
  data,
  dims,
});

describe('runInference', () => {
  it('keeps enough playback lead-in to avoid clipping the first Pocket chunk', () => {
    expect(POCKET_STREAM_PRIME_SEC).toBeGreaterThanOrEqual(0.28);
  });

  it('primes the Mimi decoder before emitting the first streaming audio chunk', async () => {
    let autoregressiveCalls = 0;
    const decodedFrameCounts: number[] = [];
    const emittedChunkMarkers: number[] = [];

    const textConditioner = {
      inputNames: [],
      inputMetadata: [],
      outputNames: ['text_embeddings'],
      run: vi.fn().mockResolvedValue({
        text_embeddings: tensor(new Float32Array(1024), [1, 1, 1024]),
      }),
    };

    const flowMain = {
      inputNames: [],
      inputMetadata: [],
      outputNames: ['conditioning', 'eos'],
      run: vi.fn().mockImplementation(async (feeds: Record<string, FakeTensor>) => {
        const isAutoregressiveStep = feeds.sequence?.dims[1] === 1;
        if (isAutoregressiveStep) autoregressiveCalls += 1;

        return {
          conditioning: tensor(new Float32Array(32), [1, 1, 32]),
          eos: tensor(
            Float32Array.of(isAutoregressiveStep && autoregressiveCalls >= 3 ? 0 : -5),
            [1, 1],
          ),
        };
      }),
    };

    const flowStep = {
      inputNames: [],
      inputMetadata: [],
      outputNames: ['delta'],
      run: vi.fn().mockResolvedValue({
        delta: tensor(new Float32Array(32), [1, 32]),
      }),
    };

    const mimiDecoder = {
      inputNames: [],
      inputMetadata: [],
      outputNames: ['audio'],
      run: vi.fn().mockImplementation(async (feeds: Record<string, FakeTensor>) => {
        const frames = feeds.latent.dims[1];
        decodedFrameCounts.push(frames);
        return {
          audio: tensor(Float32Array.of(frames), [1]),
        };
      }),
    };

    const bundle = {
      text_conditioner: textConditioner,
      flow_lm_main: flowMain,
      flow_lm_flow: flowStep,
      mimi_decoder: mimiDecoder,
    } as unknown as ModelBundle;

    await runInference(
      bundle,
      [1, 2, 3],
      {
        voiceState: {},
        temperature: 0,
        firstChunkFrames: 2,
        chunkFrames: 10,
        framesAfterEos: 0,
        maxFrames: 5,
      },
      async (samples) => {
        emittedChunkMarkers.push(samples[0]);
      },
    );

    expect(decodedFrameCounts[0]).toBe(
      POCKET_DECODER_WARMUP_FRAMES + POCKET_DECODER_SETTLE_FRAMES,
    );
    expect(emittedChunkMarkers).toEqual([2, 1]);
  });
});
