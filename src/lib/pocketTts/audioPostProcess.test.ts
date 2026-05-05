import { describe, expect, it } from 'vitest';

import {
  POCKET_DECODER_WARMUP_FRAMES,
  POCKET_DECODER_SETTLE_FRAMES,
  POCKET_START_ARTIFACT_TRIM_FRAMES,
  POCKET_START_FADE_IN_MS,
  stabilizePocketDecodedAudio,
} from './audioPostProcess';

describe('stabilizePocketDecodedAudio', () => {
  it('removes decoder warmup samples before playback', () => {
    const samples = Float32Array.from([100, 101, 102, 103, 1, 2, 3, 4]);

    const stabilized = stabilizePocketDecodedAudio(samples, {
      warmupFrames: 2,
      samplesPerFrame: 2,
      startArtifactTrimFrames: 0,
      fadeInMs: 0,
    });

    expect(Array.from(stabilized)).toEqual([1, 2, 3, 4]);
  });

  it('can remove hidden decoder settle samples after warmup', () => {
    const samples = Float32Array.from([100, 101, 200, 201, 1, 2, 3, 4]);

    const stabilized = stabilizePocketDecodedAudio(samples, {
      warmupFrames: 1,
      settleFrames: 1,
      samplesPerFrame: 2,
      startArtifactTrimFrames: 0,
      fadeInMs: 0,
    });

    expect(Array.from(stabilized)).toEqual([1, 2, 3, 4]);
  });

  it('can hard-trim audible Pocket startup artifact frames after hidden pre-roll', () => {
    const samples = Float32Array.from([
      100, 101, // decoder warmup
      200, 201, // hidden settle
      300, 301, // robotic startup artifact
      1, 2, 3, 4,
    ]);

    const stabilized = stabilizePocketDecodedAudio(samples, {
      warmupFrames: 1,
      settleFrames: 1,
      startArtifactTrimFrames: 1,
      samplesPerFrame: 2,
      fadeInMs: 0,
    });

    expect(Array.from(stabilized)).toEqual([1, 2, 3, 4]);
  });

  it('keeps the first generated speech samples by default after hidden pre-roll', () => {
    const samples = Float32Array.from([
      100, 101, // decoder warmup
      200, 201, // hidden settle
      1, 2, 3, 4, // first audible speech
    ]);

    const stabilized = stabilizePocketDecodedAudio(samples, {
      warmupFrames: 1,
      settleFrames: 1,
      samplesPerFrame: 2,
      fadeInMs: 0,
    });

    expect(Array.from(stabilized)).toEqual([1, 2, 3, 4]);
  });

  it('fades in the first audible samples after trimming', () => {
    const samples = Float32Array.from([9, 9, 1, 1, 1, 1]);

    const stabilized = stabilizePocketDecodedAudio(samples, {
      warmupFrames: 1,
      samplesPerFrame: 2,
      sampleRate: 10,
      startArtifactTrimFrames: 0,
      fadeInMs: 300,
    });

    expect(Array.from(stabilized)).toEqual([0, 0.5, 1, 1]);
  });

  it('uses a long enough default pre-roll to hide Pocket decoder startup artifacts', () => {
    expect(POCKET_DECODER_WARMUP_FRAMES).toBeGreaterThanOrEqual(120);
    expect(POCKET_DECODER_SETTLE_FRAMES).toBeGreaterThanOrEqual(48);
    expect(POCKET_START_ARTIFACT_TRIM_FRAMES).toBeLessThanOrEqual(1);
    expect(POCKET_START_FADE_IN_MS).toBeLessThanOrEqual(120);
  });
});
