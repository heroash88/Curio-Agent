import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  deleteVoiceProfile,
  getVoiceProfile,
  listVoiceProfiles,
  renameVoiceProfile,
  saveVoiceProfile,
  setVoiceProfileStoreAdapter,
  type StoredVoiceProfile,
  type VoiceProfileStoreAdapter,
} from './voiceProfileStore';

const createMemoryAdapter = (): VoiceProfileStoreAdapter => {
  const store = new Map<string, StoredVoiceProfile>();

  return {
    async put(profile) {
      store.set(profile.id, structuredClone(profile));
    },
    async get(profileId) {
      const profile = store.get(profileId);
      return profile ? structuredClone(profile) : null;
    },
    async list() {
      return [...store.values()].map((profile) => structuredClone(profile));
    },
    async delete(profileId) {
      store.delete(profileId);
    },
  };
};

const alice: StoredVoiceProfile = {
  id: 'voice-alice',
  name: 'Alice',
  embedding: [127, -64, 18, 0],
  embeddingVersion: 1,
  createdAt: 10,
  updatedAt: 10,
  source: 'upload',
  sampleRate: 16000,
  durationMs: 4200,
};

const bob: StoredVoiceProfile = {
  id: 'voice-bob',
  name: 'Bob',
  embedding: [42, -12, 7, 3],
  embeddingVersion: 1,
  createdAt: 20,
  updatedAt: 20,
  source: 'recording',
  sampleRate: 16000,
  durationMs: 5100,
};

describe('voiceProfileStore', () => {
  beforeEach(() => {
    setVoiceProfileStoreAdapter(createMemoryAdapter());
  });

  afterEach(() => {
    setVoiceProfileStoreAdapter(null);
  });

  it('persists and lists normalized voice profiles', async () => {
    await saveVoiceProfile(alice);
    await saveVoiceProfile(bob);

    const profiles = await listVoiceProfiles();

    expect(profiles).toEqual([bob, alice]);
  });

  it('renames a stored profile', async () => {
    await saveVoiceProfile(alice);

    await renameVoiceProfile(alice.id, 'Alicia');

    const profile = await getVoiceProfile(alice.id);
    expect(profile?.name).toBe('Alicia');
    expect(profile?.updatedAt).toBeGreaterThanOrEqual(alice.updatedAt);
  });

  it('deletes stored profiles', async () => {
    await saveVoiceProfile(alice);

    await deleteVoiceProfile(alice.id);

    expect(await getVoiceProfile(alice.id)).toBeNull();
    expect(await listVoiceProfiles()).toEqual([]);
  });
});
