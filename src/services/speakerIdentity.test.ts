import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendSpeakerContextToInstruction,
  resolveSpeakerIdentity,
  type ResolvedSpeakerIdentity,
} from './speakerIdentity';
import type { SpeakerProfile } from './speakerProfileStore';

const profiles: SpeakerProfile[] = [
  {
    id: 'speaker-alice',
    name: 'Alice',
    embedding: [12, 6, -3],
    embeddingVersion: 1,
    createdAt: 1,
    updatedAt: 1,
    sampleCount: 1,
  },
  {
    id: 'speaker-bob',
    name: 'Bob',
    embedding: [3, 9, -8],
    embeddingVersion: 1,
    createdAt: 2,
    updatedAt: 2,
    sampleCount: 1,
  },
];

describe('speaker identity fallback resolution', () => {
  beforeEach(() => {
    // Keep timestamps deterministic enough for truthy checks.
    Date.now = () => 1234;
  });

  it('uses the recognized profile when a confident match exists', () => {
    const identity = resolveSpeakerIdentity({
      match: {
        profileId: 'speaker-alice',
        profileName: 'Alice',
        score: 0.94,
        confidence: 0.8,
      },
      profiles,
      lastRecognizedProfileId: 'speaker-bob',
      defaultProfileId: 'speaker-bob',
    });

    expect(identity).toMatchObject({
      profileId: 'speaker-alice',
      profileName: 'Alice',
      source: 'recognized',
      confidence: 0.8,
      matchedScore: 0.94,
    });
  });

  it('falls back to the last recognized profile before using the default', () => {
    const identity = resolveSpeakerIdentity({
      match: null,
      profiles,
      lastRecognizedProfileId: 'speaker-bob',
      defaultProfileId: 'speaker-alice',
    });

    expect(identity).toMatchObject({
      profileId: 'speaker-bob',
      profileName: 'Bob',
      source: 'fallback-last-recognized',
    });
  });

  it('uses the configured default when there is no recognized speaker in-session', () => {
    const identity = resolveSpeakerIdentity({
      match: null,
      profiles,
      lastRecognizedProfileId: 'missing',
      defaultProfileId: 'speaker-alice',
    });

    expect(identity).toMatchObject({
      profileId: 'speaker-alice',
      profileName: 'Alice',
      source: 'fallback-default',
    });
  });

  it('keeps the base instruction untouched when there is no active identity', () => {
    const identity = resolveSpeakerIdentity({
      match: null,
      profiles: [],
      lastRecognizedProfileId: null,
      defaultProfileId: null,
    });

    expect(appendSpeakerContextToInstruction('base prompt', identity)).toBe('base prompt');
  });

  it('appends speaker metadata to the instruction payload', () => {
    const identity: ResolvedSpeakerIdentity = {
      profileId: 'speaker-alice',
      profileName: 'Alice',
      source: 'recognized',
      recognizedBy: 'voice',
      confidence: 0.78,
      matchedProfileId: 'speaker-alice',
      matchedProfileName: 'Alice',
      matchedScore: 0.91,
      updatedAt: 1234,
    };

    const instruction = appendSpeakerContextToInstruction('base prompt', identity);

    expect(instruction).toContain('base prompt');
    expect(instruction).toContain('speaker_id: speaker-alice');
    expect(instruction).toContain('speaker_name: Alice');
  });
});
