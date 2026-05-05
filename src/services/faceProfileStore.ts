import { useSyncExternalStore } from 'react';
import { subscribeToSettingsStorage } from '../utils/settingsStorage';

const FACE_PROFILES_KEY = 'curio_face_profiles_v1';
const DEFAULT_FACE_PROFILE_KEY = 'curio_default_face_profile_id';

export interface FaceProfile {
    id: string;
    name: string;
    embedding: number[];
    embeddingVersion: number;
    createdAt: number;
    updatedAt: number;
    sampleCount: number;
}

const emitFaceProfileChange = (): void => {
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

const normalizeFaceProfile = (profile: FaceProfile): FaceProfile | null => {
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
        name: profile.name.trim() || 'Face Profile',
        embedding,
        embeddingVersion: Number.isFinite(profile.embeddingVersion) ? profile.embeddingVersion : 1,
        createdAt,
        updatedAt,
        sampleCount,
    };
};

export const getFaceProfiles = (): FaceProfile[] => {
    if (typeof window === 'undefined') {
        return [];
    }

    try {
        const raw = localStorage.getItem(FACE_PROFILES_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw) as FaceProfile[];
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map(normalizeFaceProfile)
            .filter((profile): profile is FaceProfile => Boolean(profile));
    } catch {
        return [];
    }
};

export const setFaceProfiles = (profiles: FaceProfile[]): void => {
    const normalized = profiles
        .map(normalizeFaceProfile)
        .filter((profile): profile is FaceProfile => Boolean(profile));

    localStorage.setItem(FACE_PROFILES_KEY, JSON.stringify(normalized));

    const defaultProfileId = localStorage.getItem(DEFAULT_FACE_PROFILE_KEY);
    if (defaultProfileId && !normalized.some((profile) => profile.id === defaultProfileId)) {
        localStorage.removeItem(DEFAULT_FACE_PROFILE_KEY);
    }

    emitFaceProfileChange();
};

export const upsertFaceProfile = (profile: FaceProfile): void => {
    const normalized = normalizeFaceProfile(profile);
    if (!normalized) {
        return;
    }

    const profiles = getFaceProfiles();
    const existingIndex = profiles.findIndex((entry) => entry.id === normalized.id);

    if (existingIndex >= 0) {
        profiles[existingIndex] = normalized;
    } else {
        profiles.push(normalized);
    }

    setFaceProfiles(profiles);
};

export const renameFaceProfile = (profileId: string, name: string): void => {
    const nextName = name.trim();
    if (!nextName) {
        return;
    }

    setFaceProfiles(
        getFaceProfiles().map((profile) =>
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

export const removeFaceProfile = (profileId: string): void => {
    setFaceProfiles(getFaceProfiles().filter((profile) => profile.id !== profileId));
};

let cachedFaceProfilesJson = '';
let cachedFaceProfiles: FaceProfile[] = [];

const getFaceProfilesSnapshot = (): FaceProfile[] => {
    const profiles = getFaceProfiles();
    const nextJson = JSON.stringify(profiles);

    if (nextJson !== cachedFaceProfilesJson) {
        cachedFaceProfilesJson = nextJson;
        cachedFaceProfiles = profiles;
    }

    return cachedFaceProfiles;
};

export const useFaceProfiles = () =>
    useSyncExternalStore(
        subscribeToSettingsStorage,
        getFaceProfilesSnapshot,
        () => cachedFaceProfiles,
    );
