import { beforeEach, describe, expect, it } from 'vitest';
import {
  getSpeakerProfiles,
  removeSpeakerProfile,
  renameSpeakerProfile,
  setSpeakerProfiles,
  upsertSpeakerProfile,
  type SpeakerProfile,
} from './speakerProfileStore';

const alice: SpeakerProfile = {
  id: 'speaker-alice',
  name: 'Alice',
  embedding: [10, -3, 7, 2],
  embeddingVersion: 1,
  createdAt: 10,
  updatedAt: 10,
  sampleCount: 1,
};

const bob: SpeakerProfile = {
  id: 'speaker-bob',
  name: 'Bob',
  embedding: [8, -5, 4, 1],
  embeddingVersion: 1,
  createdAt: 20,
  updatedAt: 20,
  sampleCount: 2,
};

describe('speakerProfileStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists and reads normalized speaker profiles', () => {
    setSpeakerProfiles([alice, bob]);

    expect(getSpeakerProfiles()).toEqual([alice, bob]);
  });

  it('updates an existing profile without duplicating it', () => {
    setSpeakerProfiles([alice]);

    upsertSpeakerProfile({
      ...alice,
      name: 'Alice Cooper',
      updatedAt: 99,
      sampleCount: 3,
    });

    expect(getSpeakerProfiles()).toEqual([
      {
        ...alice,
        name: 'Alice Cooper',
        updatedAt: 99,
        sampleCount: 3,
      },
    ]);
  });

  it('renames a stored profile', () => {
    setSpeakerProfiles([alice]);

    renameSpeakerProfile(alice.id, 'Alicia');

    expect(getSpeakerProfiles()[0].name).toBe('Alicia');
  });

  it('removes the configured default profile when that profile is deleted', () => {
    setSpeakerProfiles([alice, bob]);
    localStorage.setItem('curio_default_speaker_profile_id', bob.id);

    removeSpeakerProfile(bob.id);

    expect(getSpeakerProfiles()).toEqual([alice]);
    expect(localStorage.getItem('curio_default_speaker_profile_id')).toBeNull();
  });
});
