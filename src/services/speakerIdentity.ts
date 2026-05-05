import type { SpeakerProfile } from './speakerProfileStore';

export type SpeakerIdentitySource =
    | 'recognized'
    | 'fallback-last-recognized'
    | 'fallback-default'
    | 'none';

export type SpeakerIdentityModality =
    | 'voice'
    | 'face'
    | 'multimodal'
    | 'fallback';

export interface SpeakerRecognitionMatch {
    profileId: string;
    profileName: string;
    score: number;
    confidence: number;
}

export interface ResolvedSpeakerIdentity {
    profileId: string | null;
    profileName: string | null;
    source: SpeakerIdentitySource;
    recognizedBy: SpeakerIdentityModality;
    confidence: number | null;
    matchedProfileId: string | null;
    matchedProfileName: string | null;
    matchedScore: number | null;
    updatedAt: number;
}

type SpeakerIdentityLike = Pick<
    ResolvedSpeakerIdentity,
    'profileId' | 'profileName' | 'source' | 'recognizedBy' | 'confidence'
>;

type ResolveSpeakerIdentityOptions = {
    match: SpeakerRecognitionMatch | null;
    profiles: SpeakerProfile[];
    lastRecognizedProfileId?: string | null;
    defaultProfileId?: string | null;
};

export const createResolvedSpeakerIdentity = ({
    profileId,
    profileName,
    source,
    recognizedBy,
    confidence = null,
    matchedProfileId = null,
    matchedProfileName = null,
    matchedScore = null,
    updatedAt = Date.now(),
}: {
    profileId: string | null;
    profileName: string | null;
    source: SpeakerIdentitySource;
    recognizedBy?: SpeakerIdentityModality;
    confidence?: number | null;
    matchedProfileId?: string | null;
    matchedProfileName?: string | null;
    matchedScore?: number | null;
    updatedAt?: number;
}): ResolvedSpeakerIdentity => ({
    profileId,
    profileName,
    source,
    recognizedBy:
        recognizedBy ??
        (source === 'recognized' ? 'voice' : 'fallback'),
    confidence,
    matchedProfileId,
    matchedProfileName,
    matchedScore,
    updatedAt,
});

const createResolvedIdentity = (
    profile: SpeakerProfile | null,
    source: SpeakerIdentitySource,
    confidence: number | null = null,
    match: SpeakerRecognitionMatch | null = null,
): ResolvedSpeakerIdentity =>
    createResolvedSpeakerIdentity({
        profileId: profile?.id ?? null,
        profileName: profile?.name ?? null,
        source,
        recognizedBy: source === 'recognized' ? 'voice' : 'fallback',
        confidence,
        matchedProfileId: match?.profileId ?? null,
        matchedProfileName: match?.profileName ?? null,
        matchedScore: match?.score ?? null,
    });

export const getEffectiveDefaultSpeakerProfileId = (
    profiles: SpeakerProfile[],
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

export const resolveSpeakerIdentity = ({
    match,
    profiles,
    lastRecognizedProfileId,
    defaultProfileId,
}: ResolveSpeakerIdentityOptions): ResolvedSpeakerIdentity => {
    const matchedProfile = match
        ? profiles.find((profile) => profile.id === match.profileId) ?? null
        : null;
    if (matchedProfile) {
        return createResolvedIdentity(
            matchedProfile,
            'recognized',
            match?.confidence ?? null,
            match,
        );
    }

    const lastRecognizedProfile = lastRecognizedProfileId
        ? profiles.find((profile) => profile.id === lastRecognizedProfileId) ?? null
        : null;
    if (lastRecognizedProfile) {
        return createResolvedIdentity(lastRecognizedProfile, 'fallback-last-recognized');
    }

    const effectiveDefaultProfileId = getEffectiveDefaultSpeakerProfileId(profiles, defaultProfileId);
    const defaultProfile = effectiveDefaultProfileId
        ? profiles.find((profile) => profile.id === effectiveDefaultProfileId) ?? null
        : null;
    if (defaultProfile) {
        return createResolvedIdentity(defaultProfile, 'fallback-default');
    }

    return createResolvedIdentity(null, 'none');
};

export const hasResolvedSpeakerIdentity = (
    identity: SpeakerIdentityLike | null | undefined,
): identity is SpeakerIdentityLike & { profileId: string; profileName: string } =>
    Boolean(identity?.profileId && identity?.profileName);

export const getSpeakerIdentityKey = (identity: SpeakerIdentityLike | null | undefined): string => {
    if (!hasResolvedSpeakerIdentity(identity)) {
        return 'none';
    }
    return `${identity.profileId}:${identity.source}`;
};

export const appendSpeakerContextToInstruction = (
    instruction: string,
    identity: SpeakerIdentityLike | null | undefined,
): string => {
    if (!hasResolvedSpeakerIdentity(identity)) {
        return instruction;
    }

    const confidenceText =
        identity.source === 'recognized' && typeof identity.confidence === 'number'
            ? `\n- speaker_confidence: ${identity.confidence.toFixed(2)}`
            : '';
    const modalityText = `\n- speaker_modality: ${identity.recognizedBy ?? 'fallback'}`;

    const speakerContext =
        `[ACTIVE SPEAKER]\n` +
        `- speaker_id: ${identity.profileId}\n` +
        `- speaker_name: ${identity.profileName}\n` +
        `- speaker_source: ${identity.source}${modalityText}${confidenceText}\n` +
        `Treat this speaker identity as the best available context for personalization. ` +
        `If a newer system note updates the speaker, follow the newest identity.`;

    return instruction ? `${instruction}\n\n${speakerContext}` : speakerContext;
};

export const buildSpeakerSystemNote = (
    identity: SpeakerIdentityLike | null | undefined,
): string | null => {
    if (!hasResolvedSpeakerIdentity(identity)) {
        return null;
    }

    const confidenceText =
        identity.source === 'recognized' && typeof identity.confidence === 'number'
            ? ` Confidence ${identity.confidence.toFixed(2)}.`
            : '';
    const modality = identity.recognizedBy ?? 'fallback';

    return `Speaker update: current speaker is ${identity.profileName} (speaker_id=${identity.profileId}, source=${identity.source}, modality=${modality}).${confidenceText} Use this identity for personalization until a newer speaker update arrives.`;
};
