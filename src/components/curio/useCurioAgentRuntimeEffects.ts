import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';

import type { CardEvent } from '../../services/cardTypes';
import type { FaceTrackingSample } from '../../services/faceTracking';
import { requestAmbientSpeech, subscribeAmbientSpeech } from '../../services/ambientOutput';
import type { NotificationPriority } from '../../services/proactiveTypes';
import type { AqiData, WeatherData } from '../../services/weatherService';

const loadOfflineSpeech = () => import('../../services/offlineSpeechService');
const loadAudioService = () => import('../../services/audioService');
const loadProactiveEngine = () => import('../../services/proactiveEngine');
const loadRoutineScheduler = () => import('../../services/routineScheduler');

type WeatherSnapshot = {
    city: string;
    tempUnit: string;
    weather: WeatherData | null;
    aqi: AqiData | null;
};

export function useMediaStreamVideo(mediaStream: MediaStream | null): RefObject<HTMLVideoElement | null> {
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        if (mediaStream) {
            video.srcObject = mediaStream;
            video.play().catch(() => {});
        } else {
            video.srcObject = null;
        }
    }, [mediaStream]);

    return videoRef;
}

export function useQuickActionTextInput(
    setShowTextInput: (visible: boolean) => void,
): RefObject<HTMLFormElement | null> {
    const textInputFormRef = useRef<HTMLFormElement | null>(null);

    useEffect(() => {
        const handleQuickAction = (event: Event) => {
            const text = (event as CustomEvent<{ text?: string }>).detail?.text?.trim();
            if (!text) return;

            setShowTextInput(true);

            let attempts = 0;
            const submit = () => {
                const form = textInputFormRef.current;
                const input = form?.querySelector('input[type="text"]') as HTMLInputElement | null;
                if (!form || !input) {
                    if (attempts < 10) {
                        attempts += 1;
                        window.setTimeout(submit, 50);
                    }
                    return;
                }

                input.value = text;
                form.requestSubmit();
            };

            submit();
        };

        window.addEventListener('curio:quick-action', handleQuickAction as EventListener);
        return () => window.removeEventListener('curio:quick-action', handleQuickAction as EventListener);
    }, [setShowTextInput]);

    return textInputFormRef;
}

export function usePersistentSubtitlesEnabled(): [boolean, Dispatch<SetStateAction<boolean>>] {
    const [subtitlesEnabled, setSubtitlesEnabled] = useState(() => {
        const saved = localStorage.getItem('curio-subtitles-enabled');
        return saved !== null ? saved === 'true' : true;
    });

    useEffect(() => {
        localStorage.setItem('curio-subtitles-enabled', String(subtitlesEnabled));
    }, [subtitlesEnabled]);

    return [subtitlesEnabled, setSubtitlesEnabled];
}

export function useHomeFacePresence(
    handleTrackingSample: (sample: FaceTrackingSample | null, canvas: HTMLCanvasElement | null) => void,
): {
    homeFaceDetected: boolean;
    handleFaceTrackingSample: (sample: FaceTrackingSample | null, canvas: HTMLCanvasElement | null) => void;
} {
    const [homeFaceDetected, setHomeFaceDetected] = useState(false);
    const homeFaceLostTimeoutRef = useRef<number | null>(null);

    const handleFaceTrackingSample = useCallback((
        sample: FaceTrackingSample | null,
        canvas: HTMLCanvasElement | null,
    ) => {
        if (homeFaceLostTimeoutRef.current !== null) {
            window.clearTimeout(homeFaceLostTimeoutRef.current);
            homeFaceLostTimeoutRef.current = null;
        }

        if (sample) {
            setHomeFaceDetected(true);
        } else {
            homeFaceLostTimeoutRef.current = window.setTimeout(() => {
                setHomeFaceDetected(false);
                homeFaceLostTimeoutRef.current = null;
            }, 600);
        }

        handleTrackingSample(sample, canvas);
    }, [handleTrackingSample]);

    useEffect(() => {
        return () => {
            if (homeFaceLostTimeoutRef.current !== null) {
                window.clearTimeout(homeFaceLostTimeoutRef.current);
            }
        };
    }, []);

    return { homeFaceDetected, handleFaceTrackingSample };
}

export function useSessionActiveRef(sessionActive: boolean): MutableRefObject<boolean> {
    const isSessionActiveRef = useRef(false);

    useEffect(() => {
        const wasActive = isSessionActiveRef.current;
        isSessionActiveRef.current = sessionActive;

        if (sessionActive && !wasActive) {
            window.dispatchEvent(new CustomEvent('curio:session-started'));
        } else if (!sessionActive && wasActive) {
            window.dispatchEvent(new CustomEvent('curio:session-ended'));
        }
    }, [sessionActive]);

    return isSessionActiveRef;
}

export function useAmbientSpeechDelivery(
    isSessionActiveRef: MutableRefObject<boolean>,
    speakerMutedRef: MutableRefObject<boolean>,
): void {
    useEffect(() => {
        const queue: string[] = [];
        let releaseTimer: ReturnType<typeof setTimeout> | null = null;
        let speaking = false;

        const clearReleaseTimer = () => {
            if (releaseTimer) {
                clearTimeout(releaseTimer);
                releaseTimer = null;
            }
        };

        const scheduleNext = async () => {
            if (speaking || isSessionActiveRef.current || queue.length === 0) {
                return;
            }

            const text = queue.shift();
            if (!text || speakerMutedRef.current) {
                return;
            }

            speaking = true;
            const offlineMod = await loadOfflineSpeech();
            offlineMod.speakOffline(text);

            releaseTimer = setTimeout(() => {
                speaking = false;
                void scheduleNext();
            }, Math.max(2_500, text.length * 70));
        };

        const unsubscribe = subscribeAmbientSpeech(({ text }) => {
            if (!text.trim()) {
                return;
            }

            queue.push(text);
            void scheduleNext();
        });

        const handleSessionEnded = () => {
            void scheduleNext();
        };

        window.addEventListener('curio:session-ended', handleSessionEnded);

        return () => {
            unsubscribe();
            clearReleaseTimer();
            window.removeEventListener('curio:session-ended', handleSessionEnded);
        };
    }, [isSessionActiveRef, speakerMutedRef]);
}

export function useProactiveEngineLifecycle({
    enabled,
    emitCardEventRef,
    getWeatherSnapshotRef,
    isSessionActiveRef,
}: {
    enabled: boolean;
    emitCardEventRef: MutableRefObject<(event: CardEvent) => void>;
    getWeatherSnapshotRef: MutableRefObject<() => WeatherSnapshot | null>;
    isSessionActiveRef: MutableRefObject<boolean>;
}): void {
    useEffect(() => {
        if (!enabled) return;

        let stopped = false;

        const initEngine = async () => {
            const mod = await loadProactiveEngine();
            if (stopped) return;

            mod.setWeatherSnapshotGetter(() => getWeatherSnapshotRef.current());
            mod.startProactiveEngine({
                isSessionActive: () => isSessionActiveRef.current,
                speak: (text) => requestAmbientSpeech({ text, reason: 'notification' }),
                playSound: async (priority: NotificationPriority) => {
                    const audioMod = await loadAudioService();
                    audioMod.playNotificationSound(priority);
                },
                emitCardEvent: (event) => emitCardEventRef.current(event),
            });
        };

        void initEngine();

        const handleSessionEnded = async () => {
            const mod = await loadProactiveEngine();
            mod.flushPendingNotifications();
        };

        window.addEventListener('curio:session-ended', handleSessionEnded);

        return () => {
            stopped = true;
            window.removeEventListener('curio:session-ended', handleSessionEnded);
            void loadProactiveEngine().then((mod) => mod.stopProactiveEngine());
        };
    }, [emitCardEventRef, enabled, getWeatherSnapshotRef, isSessionActiveRef]);
}

export function useRoutineSchedulerLifecycle({
    enabled,
    emitCardEventRef,
}: {
    enabled: boolean;
    emitCardEventRef: MutableRefObject<(event: CardEvent) => void>;
}): void {
    useEffect(() => {
        if (!enabled) return;

        let stopped = false;

        const initRoutines = async () => {
            const mod = await loadRoutineScheduler();
            if (stopped) return;

            mod.startRoutineScheduler({
                emitCardEvent: (event) => emitCardEventRef.current(event),
                speak: (text) => requestAmbientSpeech({ text, reason: 'routine' }),
            });
        };

        void initRoutines();

        return () => {
            stopped = true;
            void loadRoutineScheduler().then((mod) => mod.stopRoutineScheduler());
        };
    }, [emitCardEventRef, enabled]);
}
