import {
    resolveSpeakerIdentity,
    type ResolvedSpeakerIdentity,
} from './speakerIdentity';
import type { SpeakerProfile } from './speakerProfileStore';
import { getSpeakerSessionState } from './speakerSessionStore';

type IdentifyResolvedSpeakerOptions = {
    enabled: boolean;
    stream?: MediaStream | null;
    profiles: SpeakerProfile[];
    defaultProfileId?: string | null;
};

export const identifyResolvedSpeakerFromStream = async ({
    enabled,
    stream,
    profiles,
    defaultProfileId,
}: IdentifyResolvedSpeakerOptions): Promise<ResolvedSpeakerIdentity | null> => {
    if (!enabled) {
        return null;
    }

    const currentSession = getSpeakerSessionState();
    const buildFallbackIdentity = () =>
        resolveSpeakerIdentity({
            match: null,
            profiles,
            lastRecognizedProfileId: currentSession.lastRecognizedProfileId,
            defaultProfileId,
        });

    if (profiles.length === 0) {
        return buildFallbackIdentity();
    }

    if (!stream) {
        return buildFallbackIdentity();
    }

    try {
        const { identifySpeakerFromStream } = await import('./speakerRecognitionService');
        const match = await identifySpeakerFromStream(stream, profiles);
        return resolveSpeakerIdentity({
            match,
            profiles,
            lastRecognizedProfileId: currentSession.lastRecognizedProfileId,
            defaultProfileId,
        });
    } catch (error) {
        console.warn('[SpeakerIdentity] Falling back after identification failure:', error);
        return buildFallbackIdentity();
    }
};
