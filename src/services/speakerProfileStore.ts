import { useSyncExternalStore } from 'react';
import { subscribeToSettingsStorage } from '../utils/settingsStorage';

const SPEAKER_PROFILES_KEY = 'curio_speaker_profiles_v1';
const DEFAULT_SPEAKER_PROFILE_KEY = 'curio_default_speaker_profile_id';

export interface SpeakerProfile {
    id: string;
    name: string;
    embedding: number[];
    embeddingVersion: number;
    createdAt: number;
    updatedAt: number;
    sampleCount: number;
}

const emitSpeakerProfileChange = (): void => {
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

const normalizeSpeakerProfile = (profile: SpeakerProfile): SpeakerProfile | null => {
    if (!profile || typeof profile.id !== 'string' || typeof profile.name !== 'string') {
        return null;
    }

    const embedding = Array.isArray(profile.embedding)
        ? profile.embedding
            .map((value) => Math.max(-127, Math.min(127, Math.round(Number(value) || 0))))
        : [];

    if (embedding.length === 0) {
        return null;
    }

    const createdAt = Number.isFinite(profile.createdAt) ? profile.createdAt : Date.now();
    const updatedAt = Number.isFinite(profile.updatedAt) ? profile.updatedAt : createdAt;
    const sampleCount = Number.isFinite(profile.sampleCount) && profile.sampleCount > 0
        ? Math.round(profile.sampleCount)
        : 1;

    return {
        id: profile.id,
        name: profile.name.trim() || 'Voice Profile',
        embedding,
        embeddingVersion: Number.isFinite(profile.embeddingVersion) ? profile.embeddingVersion : 1,
        createdAt,
        updatedAt,
        sampleCount,
    };
};

export const getSpeakerProfiles = (): SpeakerProfile[] => {
    if (typeof window === 'undefined') {
        return [];
    }

    try {
        const raw = localStorage.getItem(SPEAKER_PROFILES_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw) as SpeakerProfile[];
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map(normalizeSpeakerProfile)
            .filter((profile): profile is SpeakerProfile => Boolean(profile));
    } catch {
        return [];
    }
};

export const setSpeakerProfiles = (profiles: SpeakerProfile[]): void => {
    const normalized = profiles
        .map(normalizeSpeakerProfile)
        .filter((profile): profile is SpeakerProfile => Boolean(profile));

    localStorage.setItem(SPEAKER_PROFILES_KEY, JSON.stringify(normalized));

    const defaultProfileId = localStorage.getItem(DEFAULT_SPEAKER_PROFILE_KEY);
    if (defaultProfileId && !normalized.some((profile) => profile.id === defaultProfileId)) {
        localStorage.removeItem(DEFAULT_SPEAKER_PROFILE_KEY);
    }

    emitSpeakerProfileChange();
};

export const upsertSpeakerProfile = (profile: SpeakerProfile): void => {
    const normalized = normalizeSpeakerProfile(profile);
    if (!normalized) {
        return;
    }

    const profiles = getSpeakerProfiles();
    const index = profiles.findIndex((entry) => entry.id === normalized.id);

    if (index >= 0) {
        profiles[index] = normalized;
    } else {
        profiles.push(normalized);
    }

    setSpeakerProfiles(profiles);
};

export const renameSpeakerProfile = (profileId: string, name: string): void => {
    const nextName = name.trim();
    if (!nextName) {
        return;
    }

    setSpeakerProfiles(
        getSpeakerProfiles().map((profile) =>
            profile.id === profileId
                ? {
                    ...profile,
                    name: nextName,
                    updatedAt: Date.now(),
                }
                : profile,
        ),
    );
};

export const removeSpeakerProfile = (profileId: string): void => {
    setSpeakerProfiles(getSpeakerProfiles().filter((profile) => profile.id !== profileId));
};

let cachedSpeakerProfilesJson = '';
let cachedSpeakerProfiles: SpeakerProfile[] = [];

const getSpeakerProfilesSnapshot = (): SpeakerProfile[] => {
    const profiles = getSpeakerProfiles();
    const json = JSON.stringify(profiles);

    if (json !== cachedSpeakerProfilesJson) {
        cachedSpeakerProfilesJson = json;
        cachedSpeakerProfiles = profiles;
    }

    return cachedSpeakerProfiles;
};

export const useSpeakerProfiles = () =>
    useSyncExternalStore(
        subscribeToSettingsStorage,
        getSpeakerProfilesSnapshot,
        () => cachedSpeakerProfiles,
    );
