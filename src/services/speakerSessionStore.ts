import { useSyncExternalStore } from 'react';
import type { ResolvedSpeakerIdentity } from './speakerIdentity';

export interface SpeakerSessionState {
    activeProfileId: string | null;
    activeProfileName: string | null;
    source: ResolvedSpeakerIdentity['source'];
    recognizedBy: ResolvedSpeakerIdentity['recognizedBy'];
    confidence: number | null;
    lastRecognizedProfileId: string | null;
    lastRecognizedProfileName: string | null;
    updatedAt: number;
}

const INITIAL_SPEAKER_SESSION_STATE: SpeakerSessionState = {
    activeProfileId: null,
    activeProfileName: null,
    source: 'none',
    recognizedBy: 'fallback',
    confidence: null,
    lastRecognizedProfileId: null,
    lastRecognizedProfileName: null,
    updatedAt: 0,
};

let speakerSessionState: SpeakerSessionState = INITIAL_SPEAKER_SESSION_STATE;
const listeners = new Set<() => void>();

const emitChange = (): void => {
    listeners.forEach((listener) => listener());
};

export const getSpeakerSessionState = (): SpeakerSessionState => speakerSessionState;

export const subscribeSpeakerSessionState = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const setSpeakerSessionState = (
    nextState:
        | SpeakerSessionState
        | ((previousState: SpeakerSessionState) => SpeakerSessionState),
): void => {
    const resolvedState =
        typeof nextState === 'function'
            ? nextState(speakerSessionState)
            : nextState;

    speakerSessionState = resolvedState;
    emitChange();
};

export const applyResolvedSpeakerIdentity = (identity: ResolvedSpeakerIdentity): void => {
    setSpeakerSessionState((previousState) => ({
        activeProfileId: identity.profileId,
        activeProfileName: identity.profileName,
        source: identity.source,
        recognizedBy: identity.recognizedBy,
        confidence: identity.confidence,
        lastRecognizedProfileId:
            identity.source === 'recognized'
                ? identity.profileId
                : previousState.lastRecognizedProfileId,
        lastRecognizedProfileName:
            identity.source === 'recognized'
                ? identity.profileName
                : previousState.lastRecognizedProfileName,
        updatedAt: identity.updatedAt,
    }));
};

export const clearActiveSpeakerIdentity = (): void => {
    setSpeakerSessionState((previousState) => ({
        ...previousState,
        activeProfileId: null,
        activeProfileName: null,
        source: 'none',
        recognizedBy: 'fallback',
        confidence: null,
        updatedAt: Date.now(),
    }));
};

export const resetSpeakerSessionState = (): void => {
    speakerSessionState = INITIAL_SPEAKER_SESSION_STATE;
    emitChange();
};

export const useSpeakerSessionState = (): SpeakerSessionState =>
    useSyncExternalStore(
        subscribeSpeakerSessionState,
        getSpeakerSessionState,
        getSpeakerSessionState,
    );
