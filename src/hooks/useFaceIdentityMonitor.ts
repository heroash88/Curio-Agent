import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FaceTrackingSample } from '../services/faceTracking';
import {
    identifyResolvedFaceFromStream,
    identityNamesMatch,
    resolveFaceIdentity,
} from '../services/faceIdentityRuntime';
import { playFaceIdentityAnimation } from '../services/faceIdentityAnimationMap';
import type { FaceProfile } from '../services/faceProfileStore';
import {
    applyResolvedSpeakerIdentity,
    getSpeakerSessionState,
} from '../services/speakerSessionStore';
import type { FaceStyleId } from '../utils/settingsStorage';

type FaceRecognitionModule = typeof import('../services/faceRecognitionService');

type FaceIdentityFeedbackTone = 'recognized' | 'switch' | 'neutral';

export interface FaceIdentityFeedback {
    id: number;
    message: string;
    tone: FaceIdentityFeedbackTone;
}

type UseFaceIdentityMonitorOptions = {
    enabled: boolean;
    faceTrackingEnabled: boolean;
    passiveTrackingEnabled: boolean;
    sessionActive: boolean;
    visionStream: MediaStream | null;
    faceProfiles: FaceProfile[];
    defaultProfileId?: string | null;
    faceStyleId: FaceStyleId;
    lowPowerMode: boolean;
};

type TrackingFrameSnapshot = {
    sample: FaceTrackingSample | null;
    canvas: HTMLCanvasElement | null;
    capturedAt: number;
};

const FEEDBACK_DURATION_MS = 5_000;
const ACTIVE_RECOGNITION_INTERVAL_MS = 1_500;
const ACTIVE_RECOGNITION_INTERVAL_LOW_POWER_MS = 2_400;
const PASSIVE_RECOGNITION_INTERVAL_MS = 2_200;
const PASSIVE_RECOGNITION_INTERVAL_LOW_POWER_MS = 3_200;
const TRACKING_SAMPLE_STALE_MS = 1_250;
const IDENTITY_SWITCH_STREAK = 2;
const UNCERTAINTY_STREAK_THRESHOLD = 3;
const UNCERTAINTY_EVENT_COOLDOWN_MS = 12_000;

let faceRecognitionModulePromise: Promise<FaceRecognitionModule> | null = null;

const loadFaceRecognitionModule = (): Promise<FaceRecognitionModule> => {
    if (!faceRecognitionModulePromise) {
        faceRecognitionModulePromise = import('../services/faceRecognitionService');
    }
    return faceRecognitionModulePromise;
};

const buildFeedbackMessage = (
    profileName: string,
    sessionActive: boolean,
    mode: 'recognized' | 'switch' | 'reconfirm',
): { message: string; tone: FaceIdentityFeedbackTone } => {
    if (mode === 'switch') {
        return {
            message: sessionActive ? `Now talking to ${profileName}` : `Recognized: ${profileName}`,
            tone: 'switch',
        };
    }

    if (mode === 'reconfirm') {
        return {
            message: sessionActive ? `Talking to ${profileName}` : `Hi ${profileName}`,
            tone: 'neutral',
        };
    }

    return {
        message: sessionActive ? `Talking to ${profileName}` : `Hi ${profileName}`,
        tone: 'recognized',
    };
};

export const useFaceIdentityMonitor = ({
    enabled,
    faceTrackingEnabled,
    passiveTrackingEnabled,
    sessionActive,
    visionStream,
    faceProfiles,
    defaultProfileId,
    faceStyleId,
    lowPowerMode,
}: UseFaceIdentityMonitorOptions): {
    feedback: FaceIdentityFeedback | null;
    handleTrackingSample: (sample: FaceTrackingSample | null, canvas: HTMLCanvasElement | null) => void;
} => {
    const [feedback, setFeedback] = useState<FaceIdentityFeedback | null>(null);

    const feedbackTimeoutRef = useRef<number | null>(null);
    const trackingFrameRef = useRef<TrackingFrameSnapshot>({
        sample: null,
        canvas: null,
        capturedAt: 0,
    });
    const candidateStreakRef = useRef<{ profileId: string | null; count: number }>({
        profileId: null,
        count: 0,
    });
    const uncertaintyStreakRef = useRef(0);
    const uncertainStateRef = useRef(false);
    const lastUncertainEventAtRef = useRef(0);
    const lastOneShotAttemptKeyRef = useRef<string>('');
    const passiveRecognitionCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const recognitionIntervalMs = useMemo(() => {
        if (passiveTrackingEnabled) {
            return lowPowerMode
                ? PASSIVE_RECOGNITION_INTERVAL_LOW_POWER_MS
                : PASSIVE_RECOGNITION_INTERVAL_MS;
        }

        return lowPowerMode
            ? ACTIVE_RECOGNITION_INTERVAL_LOW_POWER_MS
            : ACTIVE_RECOGNITION_INTERVAL_MS;
    }, [lowPowerMode, passiveTrackingEnabled]);

    const clearFeedbackTimer = useCallback(() => {
        if (feedbackTimeoutRef.current !== null) {
            window.clearTimeout(feedbackTimeoutRef.current);
            feedbackTimeoutRef.current = null;
        }
    }, []);

    const showFeedback = useCallback((
        message: string,
        tone: FaceIdentityFeedbackTone,
    ) => {
        clearFeedbackTimer();
        setFeedback({
            id: Date.now(),
            message,
            tone,
        });
        feedbackTimeoutRef.current = window.setTimeout(() => {
            setFeedback(null);
            feedbackTimeoutRef.current = null;
        }, FEEDBACK_DURATION_MS);
    }, [clearFeedbackTimer]);

    const handleTrackingSample = useCallback((
        sample: FaceTrackingSample | null,
        canvas: HTMLCanvasElement | null,
    ) => {
        trackingFrameRef.current = {
            sample,
            canvas,
            capturedAt: sample && canvas ? Date.now() : 0,
        };

        if (!sample || !canvas) {
            candidateStreakRef.current = { profileId: null, count: 0 };
        }
    }, []);

    const applyRecognizedIdentity = useCallback((resolvedIdentity: NonNullable<ReturnType<typeof resolveFaceIdentity>>) => {
        if (!resolvedIdentity.profileName) {
            return;
        }

        const currentSession = getSpeakerSessionState();
        const sameAsCurrent = identityNamesMatch(
            resolvedIdentity.profileName,
            currentSession.activeProfileName,
        );
        const sameAsLast = identityNamesMatch(
            resolvedIdentity.profileName,
            currentSession.lastRecognizedProfileName,
        );
        const modalityChanged = resolvedIdentity.recognizedBy !== currentSession.recognizedBy;
        const activeIdentityChanged = !sameAsCurrent || resolvedIdentity.profileId !== currentSession.activeProfileId;
        const shouldApply = activeIdentityChanged || modalityChanged || uncertainStateRef.current;

        if (!shouldApply) {
            return;
        }

        applyResolvedSpeakerIdentity(resolvedIdentity);

        let feedbackMode: 'recognized' | 'switch' | 'reconfirm' = 'recognized';
        if (sameAsCurrent && uncertainStateRef.current) {
            feedbackMode = 'reconfirm';
        } else if (currentSession.activeProfileName && !sameAsCurrent) {
            feedbackMode = 'switch';
        } else if (sameAsLast) {
            feedbackMode = 'reconfirm';
        }

        const nextFeedback = buildFeedbackMessage(
            resolvedIdentity.profileName,
            sessionActive,
            feedbackMode,
        );
        showFeedback(nextFeedback.message, nextFeedback.tone);
        playFaceIdentityAnimation(
            faceStyleId,
            feedbackMode === 'switch'
                ? 'changed'
                : feedbackMode === 'reconfirm'
                    ? 'returning'
                    : 'recognized',
        );

        uncertaintyStreakRef.current = 0;
        uncertainStateRef.current = false;
    }, [faceStyleId, sessionActive, showFeedback]);

    useEffect(() => {
        return () => {
            clearFeedbackTimer();
        };
    }, [clearFeedbackTimer]);

    useEffect(() => {
        if (enabled) {
            return;
        }

        trackingFrameRef.current = {
            sample: null,
            canvas: null,
            capturedAt: 0,
        };
        candidateStreakRef.current = { profileId: null, count: 0 };
        uncertaintyStreakRef.current = 0;
        uncertainStateRef.current = false;
        if (passiveRecognitionCanvasRef.current) {
            passiveRecognitionCanvasRef.current.width = 0;
            passiveRecognitionCanvasRef.current.height = 0;
            passiveRecognitionCanvasRef.current = null;
        }
        clearFeedbackTimer();
        setFeedback(null);
    }, [clearFeedbackTimer, enabled]);

    useEffect(() => {
        if (
            !enabled ||
            faceTrackingEnabled ||
            !sessionActive ||
            !visionStream
        ) {
            if (!sessionActive) {
                lastOneShotAttemptKeyRef.current = '';
            }
            return;
        }

        // Include each profile's updatedAt so re-enrollments trigger a fresh
        // identification pass instead of hitting the stale-attempt cache.
        const profileRevision = faceProfiles
            .map((profile) => `${profile.id}:${profile.updatedAt}`)
            .join('|');
        const attemptKey = `${visionStream.id || 'vision'}:${sessionActive ? 'active' : 'idle'}:${faceProfiles.length}:${defaultProfileId || ''}:${profileRevision}`;
        if (lastOneShotAttemptKeyRef.current === attemptKey) {
            return;
        }
        lastOneShotAttemptKeyRef.current = attemptKey;

        let cancelled = false;

        void identifyResolvedFaceFromStream({
            enabled,
            stream: visionStream,
            profiles: faceProfiles,
            defaultProfileId,
        }).then((resolvedIdentity) => {
            if (cancelled || !resolvedIdentity) {
                return;
            }

            if (resolvedIdentity.source === 'recognized') {
                applyRecognizedIdentity(resolvedIdentity);
                return;
            }

            if (!getSpeakerSessionState().activeProfileId) {
                applyResolvedSpeakerIdentity(resolvedIdentity);
            }
        }).catch((error) => {
            console.warn('[FaceIdentity] One-shot face identification failed:', error);
        });

        return () => {
            cancelled = true;
        };
    }, [
        applyRecognizedIdentity,
        defaultProfileId,
        enabled,
        faceProfiles,
        faceTrackingEnabled,
        sessionActive,
        visionStream,
    ]);

    useEffect(() => {
        if (
            !enabled ||
            !faceTrackingEnabled ||
            faceProfiles.length === 0 ||
            (!sessionActive && !passiveTrackingEnabled)
        ) {
            return;
        }

        let cancelled = false;
        let recognitionModule: FaceRecognitionModule | null = null;
        let intervalId: number | null = null;

        const evaluateTrackingIdentity = () => {
            if (cancelled || !recognitionModule) {
                return;
            }

            const { sample, canvas, capturedAt } = trackingFrameRef.current;
            if (
                !sample ||
                !canvas ||
                Date.now() - capturedAt > TRACKING_SAMPLE_STALE_MS
            ) {
                return;
            }

            const match = recognitionModule.identifyPassiveFaceFromTrackingFrame(
                canvas,
                sample,
                faceProfiles,
                passiveRecognitionCanvasRef.current ?? (
                    passiveRecognitionCanvasRef.current = document.createElement('canvas')
                ),
            );

            if (!match) {
                candidateStreakRef.current = { profileId: null, count: 0 };
                uncertaintyStreakRef.current += 1;

                if (
                    uncertaintyStreakRef.current >= UNCERTAINTY_STREAK_THRESHOLD &&
                    Date.now() - lastUncertainEventAtRef.current > UNCERTAINTY_EVENT_COOLDOWN_MS &&
                    getSpeakerSessionState().activeProfileId
                ) {
                    uncertainStateRef.current = true;
                    lastUncertainEventAtRef.current = Date.now();
                    playFaceIdentityAnimation(faceStyleId, 'uncertain');
                }
                return;
            }

            const previousCandidate = candidateStreakRef.current;
            candidateStreakRef.current = {
                profileId: match.profileId,
                count: previousCandidate.profileId === match.profileId
                    ? previousCandidate.count + 1
                    : 1,
            };

            const currentSession = getSpeakerSessionState();
            const switchingUsers = Boolean(
                currentSession.activeProfileName &&
                !identityNamesMatch(match.profileName, currentSession.activeProfileName),
            );
            const requiredStreak = switchingUsers ? IDENTITY_SWITCH_STREAK : 1;

            if (candidateStreakRef.current.count < requiredStreak) {
                return;
            }

            const resolvedIdentity = resolveFaceIdentity({
                match,
                profiles: faceProfiles,
                defaultProfileId,
                currentSession,
            });

            if (!resolvedIdentity || resolvedIdentity.source !== 'recognized') {
                return;
            }

            applyRecognizedIdentity(resolvedIdentity);
        };

        void loadFaceRecognitionModule()
            .then((module) => {
                if (cancelled) {
                    return;
                }

                recognitionModule = module;
                evaluateTrackingIdentity();
                intervalId = window.setInterval(
                    evaluateTrackingIdentity,
                    recognitionIntervalMs,
                );

                if (cancelled) {
                    if (intervalId !== null) {
                        window.clearInterval(intervalId);
                    }
                    return;
                }
            })
            .catch((error) => {
                console.warn('[FaceIdentity] Passive tracking module failed to load:', error);
            });

        return () => {
            cancelled = true;
            if (intervalId !== null) {
                window.clearInterval(intervalId);
            }
            if (passiveRecognitionCanvasRef.current) {
                passiveRecognitionCanvasRef.current.width = 0;
                passiveRecognitionCanvasRef.current.height = 0;
            }
        };
    }, [
        applyRecognizedIdentity,
        defaultProfileId,
        enabled,
        faceProfiles,
        faceStyleId,
        faceTrackingEnabled,
        passiveTrackingEnabled,
        recognitionIntervalMs,
        sessionActive,
    ]);

    return {
        feedback,
        handleTrackingSample,
    };
};
