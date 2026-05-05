export const POCKET_SAMPLE_RATE = 24_000;
export const POCKET_SAMPLES_PER_FRAME = 1_920;
export const POCKET_DECODER_WARMUP_FRAMES = 128;
export const POCKET_DECODER_SETTLE_FRAMES = 48;
// Hidden warmup + settle frames already remove decoder startup artifacts.
// Do not trim generated speech by default; even a few frames can drop words.
export const POCKET_START_ARTIFACT_TRIM_FRAMES = 0;
export const POCKET_START_FADE_IN_MS = 80;

export const stabilizePocketDecodedAudio = (
  fullAudio: Float32Array,
  options: {
    warmupFrames?: number;
    samplesPerFrame?: number;
    sampleRate?: number;
    fadeInMs?: number;
    settleFrames?: number;
    startArtifactTrimFrames?: number;
  } = {},
): Float32Array => {
  const warmupFrames = Math.max(0, Math.floor(options.warmupFrames ?? POCKET_DECODER_WARMUP_FRAMES));
  const settleFrames = Math.max(0, Math.floor(options.settleFrames ?? 0));
  const startArtifactTrimFrames = Math.max(0, Math.floor(options.startArtifactTrimFrames ?? POCKET_START_ARTIFACT_TRIM_FRAMES));
  const samplesPerFrame = Math.max(1, Math.floor(options.samplesPerFrame ?? POCKET_SAMPLES_PER_FRAME));
  const sampleRate = Math.max(1, Math.floor(options.sampleRate ?? POCKET_SAMPLE_RATE));
  const fadeInMs = Math.max(0, options.fadeInMs ?? POCKET_START_FADE_IN_MS);
  const warmupSamples = Math.min(fullAudio.length, (warmupFrames + settleFrames + startArtifactTrimFrames) * samplesPerFrame);
  const trimmedAudio = fullAudio.subarray(warmupSamples);
  const audioData = new Float32Array(trimmedAudio.length);
  audioData.set(trimmedAudio);

  const fadeSamples = Math.min(audioData.length, Math.floor((fadeInMs / 1000) * sampleRate));
  if (fadeSamples <= 1) return audioData;

  for (let i = 0; i < fadeSamples; i += 1) {
    const t = i / (fadeSamples - 1);
    audioData[i] *= t * t * (3 - 2 * t);
  }

  return audioData;
};
