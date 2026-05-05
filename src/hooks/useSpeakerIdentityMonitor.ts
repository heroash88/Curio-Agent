import { useEffect, useRef } from 'react';
import {
    buildSpeakerSystemNote,
    getSpeakerIdentityKey,
    resolveSpeakerIdentity,
} from '../services/speakerIdentity';
import type { SpeakerProfile } from '../services/speakerProfileStore';
import {
    applyResolvedSpeakerIdentity,
    getSpeakerSessionState,
    useSpeakerSessionState,
} from '../services/speakerSessionStore';

type UseSpeakerIdentityMonitorOptions = {
    isConnected: boolean;
    audioInputStream: MediaStream | null;
    sendSystemNote: (text: string) => boolean;
    speakerIdentificationEnabled: boolean;
    speakerAlwaysOnEnabled: boolean;
    defaultSpeakerProfileId: string;
    profiles: SpeakerProfile[];
    lowPowerMode: boolean;
};

export const useSpeakerIdentityMonitor = ({
    isConnected,
    audioInputStream,
    sendSystemNote,
    speakerIdentificationEnabled,
    speakerAlwaysOnEnabled,
    defaultSpeakerProfileId,
    profiles,
    lowPowerMode,
}: UseSpeakerIdentityMonitorOptions): void => {
    const sessionSpeaker = useSpeakerSessionState();
    const sessionSpeakerIdentity = {
        profileId: sessionSpeaker.activeProfileId,
        profileName: sessionSpeaker.activeProfileName,
        source: sessionSpeaker.source,
        recognizedBy: sessionSpeaker.recognizedBy,
        confidence: sessionSpeaker.confidence,
    };
    const lastNotifiedKeyRef = useRef(getSpeakerIdentityKey(sessionSpeakerIdentity));

    useEffect(() => {
        if (!speakerIdentificationEnabled) {
            return;
        }

        const currentState = getSpeakerSessionState();
        const activeLooksFaceOwned = Boolean(
            currentState.activeProfileId &&
            !profiles.some((profile) => profile.id === currentState.activeProfileId) &&
            currentState.recognizedBy !== 'voice' &&
            currentState.recognizedBy !== 'multimodal',
        );
        const lastLooksFaceOwned = Boolean(
            currentState.lastRecognizedProfileId &&
            !profiles.some((profile) => profile.id === currentState.lastRecognizedProfileId) &&
            currentState.recognizedBy !== 'voice' &&
            currentState.recognizedBy !== 'multimodal',
        );

        if (currentState.recognizedBy === 'face' || activeLooksFaceOwned || lastLooksFaceOwned) {
            return;
        }

        const activeStillExists = currentState.activeProfileId
            ? profiles.some((profile) => profile.id === currentState.activeProfileId)
            : true;
        const lastStillExists = currentState.lastRecognizedProfileId
            ? profiles.some((profile) => profile.id === currentState.lastRecognizedProfileId)
            : true;

        if (activeStillExists && lastStillExists) {
            return;
        }

        const resolved = resolveSpeakerIdentity({
            match: null,
            profiles,
            lastRecognizedProfileId: currentState.lastRecognizedProfileId,
            defaultProfileId: defaultSpeakerProfileId,
        });
        applyResolvedSpeakerIdentity(resolved);
    }, [defaultSpeakerProfileId, profiles, speakerIdentificationEnabled]);

    useEffect(() => {
        if (!isConnected) {
            const currentState = getSpeakerSessionState();
            lastNotifiedKeyRef.current = getSpeakerIdentityKey({
                profileId: currentState.activeProfileId,
                profileName: currentState.activeProfileName,
                source: currentState.source,
                recognizedBy: currentState.recognizedBy,
                confidence: currentState.confidence,
            });
            return;
        }

        const nextKey = getSpeakerIdentityKey(sessionSpeakerIdentity);
        if (nextKey === 'none' || nextKey === lastNotifiedKeyRef.current) {
            return;
        }

        const note = buildSpeakerSystemNote(sessionSpeakerIdentity);
        if (!note) {
            return;
        }

        if (sendSystemNote(note)) {
            lastNotifiedKeyRef.current = nextKey;
        }
    }, [isConnected, sendSystemNote, sessionSpeakerIdentity]);

    useEffect(() => {
        if (
            !isConnected ||
            !speakerIdentificationEnabled ||
            !speakerAlwaysOnEnabled ||
            !audioInputStream ||
            profiles.length < 2
        ) {
            return;
        }

        let isCancelled = false;
        let monitorHandle: { stop: () => void } | null = null;

        void import('../services/speakerRecognitionService')
            .then(async ({ startPassiveSpeakerMonitor }) => {
                if (isCancelled) {
                    return;
                }

                monitorHandle = await startPassiveSpeakerMonitor({
                    stream: audioInputStream,
                    profiles,
                    lowPowerMode,
                    currentProfileId: getSpeakerSessionState().activeProfileId,
                    onRecognizedSpeakerChange: (match) => {
                        const resolved = resolveSpeakerIdentity({
                            match,
                            profiles,
                            lastRecognizedProfileId: getSpeakerSessionState().lastRecognizedProfileId,
                            defaultProfileId: defaultSpeakerProfileId,
                        });
                        applyResolvedSpeakerIdentity(resolved);
                    },
                });
            })
            .catch((error) => {
                console.warn('[SpeakerIdentity] Failed to start passive monitor:', error);
            });

        return () => {
            isCancelled = true;
            monitorHandle?.stop();
        };
    }, [
        audioInputStream,
        defaultSpeakerProfileId,
        isConnected,
        lowPowerMode,
        profiles,
        speakerAlwaysOnEnabled,
        speakerIdentificationEnabled,
    ]);
};
