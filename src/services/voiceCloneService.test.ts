import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/pocketTts/mimiEncoder', () => ({
  encodeVoiceToEmbeddings: vi.fn(async (audio: Float32Array) => {
    const data = new Float32Array(256);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = audio[index % Math.max(audio.length, 1)] ?? 0;
    }
    return { data };
  }),
}));

import {
  createStoredVoiceProfile,
  dequantizeVoiceEmbedding,
  speakWithClonedVoice,
} from './voiceCloneService';
import {
  saveVoiceProfile,
  setVoiceProfileStoreAdapter,
  type StoredVoiceProfile,
  type VoiceProfileStoreAdapter,
} from './voiceProfileStore';

const cloneStoredVoiceProfile = (profile: StoredVoiceProfile): StoredVoiceProfile => ({
  ...profile,
  embedding: profile.embedding instanceof Float32Array
    ? new Float32Array(profile.embedding)
    : [...profile.embedding],
});

const createMemoryAdapter = (): VoiceProfileStoreAdapter => {
  const store = new Map<string, StoredVoiceProfile>();

  return {
    async put(profile) {
      store.set(profile.id, cloneStoredVoiceProfile(profile));
    },
    async get(profileId) {
      const profile = store.get(profileId);
      return profile ? cloneStoredVoiceProfile(profile) : null;
    },
    async list() {
      return [...store.values()].map((profile) => cloneStoredVoiceProfile(profile));
    },
    async delete(profileId) {
      store.delete(profileId);
    },
  };
};

describe('voiceCloneService', () => {
  beforeEach(() => {
    setVoiceProfileStoreAdapter(createMemoryAdapter());
  });

  afterEach(() => {
    setVoiceProfileStoreAdapter(null);
    vi.clearAllMocks();
  });

  it('dequantizes stored numeric embeddings for playback', () => {
    const embedding = dequantizeVoiceEmbedding([0, 64, -64, 127, -127]);

    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding[0]).toBe(0);
    expect(embedding[1]).toBeCloseTo(64 / 127, 6);
    expect(embedding[2]).toBeCloseTo(-64 / 127, 6);
    expect(embedding[3]).toBe(1);
    expect(embedding[4]).toBe(-1);
  });

  it('builds stored voice profiles from normalized audio', async () => {
    const profile = await createStoredVoiceProfile('Alice', new Float32Array([0, 0.5, -0.5]), {
      source: 'upload',
      sampleRate: 22050,
      durationMs: 1800,
    });

    expect(profile.name).toBe('Alice');
    expect(profile.embeddingVersion).toBe(2);
    expect(profile.embedding).toBeInstanceOf(Float32Array);
    expect(profile.embedding).toHaveLength(256);
    expect(profile.source).toBe('upload');
    expect(profile.sampleRate).toBe(22050);
    expect(profile.durationMs).toBe(1800);
  });

  it('loads a stored voice and passes a Float32Array embedding to TTS', async () => {
    const profile = await createStoredVoiceProfile('Alice', new Float32Array([0, 0.5, -0.5]), {
      source: 'recording',
      sampleRate: 16000,
      durationMs: 2400,
    });
    await saveVoiceProfile(profile);

    const speak = vi.fn().mockResolvedValue(undefined);

    await speakWithClonedVoice(
      { speak },
      'Hello from Curio',
      profile.id,
    );

    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0]?.[0]).toBe('Hello from Curio');
    expect(speak.mock.calls[0]?.[1]).toMatchObject({
      speakerEmbedding: expect.any(Float32Array),
    });
  });
});
