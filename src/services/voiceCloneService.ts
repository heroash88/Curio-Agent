import { getVoiceProfile, type StoredVoiceProfile } from './voiceProfileStore';

export interface VoiceCloneBuildOptions {
  source?: 'recording' | 'upload';
  sampleRate?: number;
  durationMs?: number;
}

export interface VoiceCloneSpeaker {
  speak: (
    text: string,
    voice?: {
      voiceId?: string;
      speakerEmbedding?: Float32Array;
    },
  ) => Promise<unknown>;
}

export interface VoiceRecorderEnvironment {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  MediaRecorderCtor?: typeof MediaRecorder;
  setTimeout?: typeof window.setTimeout;
}

const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_MAX_DURATION_MS = 12000;

const createVoiceProfileId = (name: string): string => {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'custom-voice';

  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

  return `voice-${base}-${suffix}`;
};

const resolveUploadName = (name: string): string =>
  name
    .replace(/\.[^.]+$/u, '')
    .replace(/[_-]+/g, ' ')
    .trim() || 'Uploaded Voice';

// Note: createVoiceEmbedding has been removed. We now directly call encodeVoiceToEmbeddings in createStoredVoiceProfile.

const estimateDurationMs = (audio: Float32Array, sampleRate: number): number => {
  if (!sampleRate || audio.length === 0) {
    return 0;
  }

  return Math.round((audio.length / sampleRate) * 1000);
};

import { encodeVoiceToEmbeddings } from '../lib/pocketTts/mimiEncoder';

export const createStoredVoiceProfile = async (
  name: string,
  audio: Float32Array,
  options: VoiceCloneBuildOptions = {},
): Promise<StoredVoiceProfile> => {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const createdAt = Date.now();

  const embeddingResult = await encodeVoiceToEmbeddings(audio);

  return {
    id: createVoiceProfileId(name),
    name: name.trim() || 'Custom Voice',
    embedding: embeddingResult.data,
    embeddingVersion: 2, // Upgraded to real Floats
    createdAt,
    updatedAt: createdAt,
    source: options.source ?? 'upload',
    sampleRate,
    durationMs: options.durationMs ?? estimateDurationMs(audio, sampleRate),
  };
};

export const recordVoiceSample = async (
  durationMs = 5000,
  environment: VoiceRecorderEnvironment = {},
): Promise<Blob> => {
  const getUserMedia = environment.getUserMedia
    ?? navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  const MediaRecorderCtor = environment.MediaRecorderCtor ?? globalThis.MediaRecorder;
  const scheduleStop = environment.setTimeout ?? window.setTimeout.bind(window);

  if (!getUserMedia || !MediaRecorderCtor) {
    throw new Error('Voice recording is not supported in this browser.');
  }

  const stream = await getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  });

  const recorder = new MediaRecorderCtor(stream);
  const chunks: BlobPart[] = [];

  return new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = () => {
      stream.getTracks().forEach((track) => track.stop());
      reject(new Error('Voice recording failed.'));
    };

    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
    };

    recorder.start();
    scheduleStop(() => recorder.stop(), durationMs);
  });
};

export const normalizeAudio = async (
  blob: Blob,
  options: {
    targetSampleRate?: number;
    maxDurationMs?: number;
    trimSilence?: boolean;
    applyMastering?: boolean;
  } = {},
): Promise<Float32Array> => {
  const targetSampleRate = options.targetSampleRate ?? DEFAULT_SAMPLE_RATE;
  const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  const trimSilence = options.trimSilence ?? true;
  const applyMastering = options.applyMastering ?? true;

  if (typeof AudioContext === 'undefined' || typeof OfflineAudioContext === 'undefined') {
    throw new Error('Audio decoding is not supported in this browser.');
  }

  // 1. Decode original blob (native browser decoding)
  const decodeCtx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    const buffer = await blob.arrayBuffer();
    decoded = await decodeCtx.decodeAudioData(buffer.slice(0));
  } finally {
    await decodeCtx.close().catch(() => {});
  }

  // 2. Professional Mastering & Resampling via OfflineAudioContext
  // We build a serial DSP chain: Source -> EQ -> Compressor -> Output
  const targetFrameCount = Math.floor(decoded.duration * targetSampleRate);
  const offCtx = new OfflineAudioContext(1, targetFrameCount, targetSampleRate);

  const source = offCtx.createBufferSource();
  source.buffer = decoded;

  let lastNode: AudioNode = source;

  if (applyMastering) {
    // A. High-Pass Filter (Remove low-frequency rumble/noise below 100Hz)
    const hpFilter = offCtx.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.value = 100;
    hpFilter.Q.value = 0.707;
    lastNode.connect(hpFilter);
    lastNode = hpFilter;

    // B. Dynamics Compressor (Ensures consistent vocal volume and "presence")
    const compressor = offCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-24, offCtx.currentTime);
    compressor.knee.setValueAtTime(30, offCtx.currentTime);
    compressor.ratio.setValueAtTime(4, offCtx.currentTime);
    compressor.attack.setValueAtTime(0.003, offCtx.currentTime);
    compressor.release.setValueAtTime(0.25, offCtx.currentTime);
    lastNode.connect(compressor);
    lastNode = compressor;
  }

  lastNode.connect(offCtx.destination);
  source.start(0);

  // Render the processed audio to a buffer
  const resampledBuffer = await offCtx.startRendering();
  let data = resampledBuffer.getChannelData(0);

  // 3. Trim Silence pass
  // Strips dead air to optimize embedding extraction
  if (trimSilence) {
    let start = 0;
    let end = data.length - 1;
    const threshold = 0.015; // Roughly -36dB

    while (start < data.length && Math.abs(data[start]) < threshold) {
      start += 1;
    }
    while (end > start && Math.abs(data[end]) < threshold) {
      end -= 1;
    }
    
    if (start > 0 || end < data.length - 1) {
      data = data.slice(start, end + 1);
    }
  }

  // 4. Cap Duration
  const maxSamples = Math.floor((maxDurationMs / 1000) * targetSampleRate);
  if (data.length > maxSamples) {
    data = data.slice(0, maxSamples);
  }

  // 5. RMS-based Loudness Normalization
  // Unlike peak normalization, this standardizes the overall "energy" of the voice
  let sumSquare = 0;
  for (let i = 0; i < data.length; i += 1) {
    sumSquare += data[i] * data[i];
  }
  
  const rms = Math.sqrt(sumSquare / (data.length || 1));
  const targetRms = 0.12; // -18.4 dBFS (Ideal for voice encoders)

  if (rms > 0.001) {
    const gain = targetRms / rms;
    let peak = 0;
    for (let i = 0; i < data.length; i += 1) {
      data[i] = data[i] * gain;
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }

    // 6. Final Soft Limiting
    // Ensures we never cross the digital ceiling after amplification
    if (peak > 0.98) {
      const limiterGain = 0.98 / peak;
      for (let i = 0; i < data.length; i += 1) {
        data[i] = Math.max(-1, Math.min(1, data[i] * limiterGain));
      }
    }
  }

  return data;
};

export const createVoiceProfileFromBlob = async (
  name: string,
  blob: Blob,
  options: VoiceCloneBuildOptions = {},
): Promise<StoredVoiceProfile> => {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const normalized = await normalizeAudio(blob, { targetSampleRate: sampleRate });

  return createStoredVoiceProfile(name, normalized, {
    ...options,
    sampleRate,
    durationMs: options.durationMs ?? estimateDurationMs(normalized, sampleRate),
  });
};

export const handleVoiceUpload = async (
  file: File,
  explicitName?: string,
): Promise<StoredVoiceProfile> => {
  const profileName = explicitName?.trim() || resolveUploadName(file.name);
  return createVoiceProfileFromBlob(profileName, file, { source: 'upload' });
};

export const dequantizeVoiceEmbedding = (embedding: number[] | Float32Array): Float32Array => {
  if (embedding instanceof Float32Array) {
    return embedding;
  }

  const dequantized = new Float32Array(embedding.length);
  for (let index = 0; index < embedding.length; index += 1) {
    dequantized[index] = (Number(embedding[index]) || 0) / 127;
  }

  return dequantized;
};

export const speakWithClonedVoice = async (
  tts: VoiceCloneSpeaker,
  text: string,
  voiceId: string,
): Promise<void> => {
  const profile = await getVoiceProfile(voiceId);
  if (!profile) {
    throw new Error(`Voice profile "${voiceId}" was not found.`);
  }

  await tts.speak(text, {
    speakerEmbedding: dequantizeVoiceEmbedding(profile.embedding),
  });
};
