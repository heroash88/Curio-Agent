import type { FaceRecognitionMatch } from './faceRecognitionService';
import type { FaceProfile } from './faceProfileStore';
import {
    createResolvedSpeakerIdentity,
    type ResolvedSpeakerIdentity,
} from './speakerIdentity';
import type { SpeakerSessionState } from './speakerSessionStore';
import { getSpeakerSessionState } from './speakerSessionStore';

type ResolveFaceIdentityOptions = {
    match: FaceRecognitionMatch | null;
    profiles: FaceProfile[];
    defaultProfileId?: string | null;
    currentSession?: SpeakerSessionState;
};

type IdentifyResolvedFaceOptions = {
    enabled: boolean;
    stream?: MediaStream | null;
    profiles: FaceProfile[];
    defaultProfileId?: string | null;
};

const normalizeIdentityName = (value: string | null | undefined): string =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

export const identityNamesMatch = (
    left: string | null | undefined,
    right: string | null | undefined,
): boolean => Boolean(left && right && normalizeIdentityName(left) === normalizeIdentityName(right));

const roundToThreeDecimals = (value: number): number => Math.round(value * 1000) / 1000;

const combineModalConfidence = (
    voiceConfidence: number | null | undefined,
    faceConfidence: number | null | undefined,
): number | null => {
    const values = [voiceConfidence, faceConfidence].filter(
        (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );
    if (values.length === 0) {
        return null;
    }
    if (values.length === 1) {
        return roundToThreeDecimals(values[0]);
    }
    const strongestSignal = Math.max(...values);
    const supportingSignal = Math.min(...values);
    const boosted = strongestSignal + (supportingSignal * 0.18);
    return roundToThreeDecimals(Math.min(0.99, boosted));
};

export const getEffectiveDefaultFaceProfileId = (
    profiles: FaceProfile[],
    configuredDefaultProfileId?: string | null,
): string | null => {
    if (configuredDefaultProfileId && profiles.some((profile) => profile.id === configuredDefaultProfileId)) {
        return configuredDefaultProfileId;
    }
    if (profiles.length === 1) {
        return profiles[0].id;
    }
    return null;
};

export const resolveFaceIdentity = ({
    match,
    profiles,
    defaultProfileId,
    currentSession = getSpeakerSessionState(),
}: ResolveFaceIdentityOptions): ResolvedSpeakerIdentity | null => {
    if (match) {
        const sameAsCurrentIdentity = identityNamesMatch(
            match.profileName,
            currentSession.activeProfileName,
        );

        return createResolvedSpeakerIdentity({
            profileId:
                sameAsCurrentIdentity && currentSession.activeProfileId
                    ? currentSession.activeProfileId
                    : match.profileId,
            profileName:
                sameAsCurrentIdentity && currentSession.activeProfileName
                    ? currentSession.activeProfileName
                    : match.profileName,
            source: 'recognized',
            recognizedBy:
                sameAsCurrentIdentity &&
                (currentSession.recognizedBy === 'voice' || currentSession.recognizedBy === 'multimodal')
                    ? 'multimodal'
                    : 'face',
            confidence:
                sameAsCurrentIdentity && currentSession.recognizedBy === 'voice'
                    ? combineModalConfidence(currentSession.confidence, match.confidence)
                    : match.confidence,
            matchedProfileId: match.profileId,
            matchedProfileName: match.profileName,
            matchedScore: match.score,
        });
    }

    if (currentSession.activeProfileId && currentSession.activeProfileName) {
        // Keep the current session identity stable when face confidence drops.
        return null;
    }

    if (currentSession.lastRecognizedProfileId && currentSession.lastRecognizedProfileName) {
        return createResolvedSpeakerIdentity({
            profileId: currentSession.lastRecognizedProfileId,
            profileName: currentSession.lastRecognizedProfileName,
            source: 'fallback-last-recognized',
            recognizedBy: 'fallback',
        });
    }

    const effectiveDefaultProfileId = getEffectiveDefaultFaceProfileId(profiles, defaultProfileId);
    const defaultProfile = effectiveDefaultProfileId
        ? profiles.find((profile) => profile.id === effectiveDefaultProfileId) ?? null
        : null;

    if (!defaultProfile) {
        return null;
    }

    return createResolvedSpeakerIdentity({
        profileId: defaultProfile.id,
        profileName: defaultProfile.name,
        source: 'fallback-default',
        recognizedBy: 'fallback',
    });
};

export const identifyResolvedFaceFromStream = async ({
    enabled,
    stream,
    profiles,
    defaultProfileId,
}: IdentifyResolvedFaceOptions): Promise<ResolvedSpeakerIdentity | null> => {
    if (!enabled) {
        return null;
    }

    const currentSession = getSpeakerSessionState();
    const resolveFallback = () =>
        resolveFaceIdentity({
            match: null,
            profiles,
            defaultProfileId,
            currentSession,
        });

    if (!stream || profiles.length === 0) {
        return resolveFallback();
    }

    try {
        const { identifyFaceFromStream } = await import('./faceRecognitionService');
        const match = await identifyFaceFromStream(stream, profiles);
        return resolveFaceIdentity({
            match,
            profiles,
            defaultProfileId,
            currentSession,
        });
    } catch (error) {
        console.warn('[FaceIdentity] Falling back after face identification failure:', error);
        return resolveFallback();
    }
};
