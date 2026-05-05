import React, { useEffect, useRef, useState } from 'react';
import { Mic, Shield, Star, Trash2, RefreshCcw, Users, FlaskConical, CheckCircle2, XCircle, AudioLines, Zap } from 'lucide-react';
import SettingsSection from '../SettingsSection';
import SettingsToggle from '../SettingsToggle';
import { useLiveAPIControls } from '../../../contexts/LiveAPIContext';
import {
    setSpeakerAlwaysOnEnabled,
    setSpeakerDefaultProfileId,
    setSpeakerIdentificationEnabled,
    useSpeakerAlwaysOnEnabled,
    useSpeakerDefaultProfileId,
    useSpeakerIdentificationEnabled,
} from '../../../utils/settingsStorage';
import {
    removeSpeakerProfile,
    renameSpeakerProfile,
    upsertSpeakerProfile,
    useSpeakerProfiles,
    type SpeakerProfile,
} from '../../../services/speakerProfileStore';
import { useSpeakerSessionState } from '../../../services/speakerSessionStore';
import { SPEAKER_ENROLLMENT_DURATION_MS, SPEAKER_IDENTIFY_DURATION_MS } from '../../../services/speakerRecognitionService';
import { requestElectronMediaAccess } from '../../../utils/electronMediaAccess';

const DEFAULT_NEW_PROFILE_NAME = 'New User';
const ENROLLMENT_GUIDE_TICK_MS = 250;
const LONG_ENROLLMENT_SENTENCES = [
    'Curio is a smart robot that can recognize my voice and interact with me securely, keeping all my data private on this device.',
    'I am setting up my voice profile for Curio right now, which involves reading this naturally long sentence so it can learn exactly what I sound like.',
    'To help Curio recognise my voice better, I will count slowly down from ten like this: ten, nine, eight, seven, six, five, four, three, two, and one.',
    'Curio helps me organize my day and keep the house running, which means I can ask it to set reminders, tell me the weather, or play music.',
] as const;

const SpeakerProfilesSection: React.FC = () => {
    const { unlockAudio, primeMicrophonePermission, audioInputStream } = useLiveAPIControls();
    const speakerIdentificationEnabled = useSpeakerIdentificationEnabled();
    const speakerAlwaysOnEnabled = useSpeakerAlwaysOnEnabled();
    const speakerProfiles = useSpeakerProfiles();
    const sessionSpeaker = useSpeakerSessionState();

    const [newProfileName, setNewProfileName] = useState(DEFAULT_NEW_PROFILE_NAME);
    const [draftNames, setDraftNames] = useState<Record<string, string>>({});
    const [savingProfileId, setSavingProfileId] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [enrollmentElapsedMs, setEnrollmentElapsedMs] = useState(0);
    const [activeSentence, setActiveSentence] = useState<string | null>(null);
    const enrollmentTimerRef = useRef<number | null>(null);
    // Track sentence rotation per profile so each re-enrollment sees a fresh
    // prompt. Module-local Map is fine -- bounded by profile count and the
    // cycle is purely a UX nicety, no correctness dependency on persistence.
    const sentenceIndexByProfileRef = useRef<Map<string, number>>(new Map());

    const defaultSpeakerProfileId = useSpeakerDefaultProfileId();

    useEffect(() => {
        setDraftNames((previousDrafts) => {
            const nextDrafts: Record<string, string> = {};
            for (const profile of speakerProfiles) {
                nextDrafts[profile.id] = previousDrafts[profile.id] ?? profile.name;
            }
            return nextDrafts;
        });
    }, [speakerProfiles]);

    const canEnableAlwaysOn = speakerProfiles.length >= 2;
    const clearEnrollmentTimer = (): void => {
        if (enrollmentTimerRef.current !== null) {
            window.clearInterval(enrollmentTimerRef.current);
            enrollmentTimerRef.current = null;
        }
    };

    useEffect(() => clearEnrollmentTimer, []);

    /**
     * Acquire a mic stream, reusing the active session's audioInputStream if
     * it's live. iOS Safari serializes getUserMedia so a second open request
     * while a session is running can fail; reusing avoids that and cuts
     * permission dialog flicker. Caller must only call track.stop() when
     * owned === true (we opened this stream).
     */
    const acquireMicStream = async (): Promise<{ stream: MediaStream; owned: boolean }> => {
        if (audioInputStream && audioInputStream.getAudioTracks().some((t) => t.readyState === 'live')) {
            return { stream: audioInputStream, owned: false };
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('This browser does not support microphone capture for voice enrollment.');
        }
        const nativeAccess = await requestElectronMediaAccess('microphone');
        if (!nativeAccess) {
            throw new Error('Microphone access was not granted.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
            },
        });
        return { stream, owned: true };
    };

    const pickNextSentence = (profileId: string): string => {
        const map = sentenceIndexByProfileRef.current;
        const previous = map.get(profileId);
        const next = previous === undefined
            ? Math.floor(Math.random() * LONG_ENROLLMENT_SENTENCES.length)
            : (previous + 1) % LONG_ENROLLMENT_SENTENCES.length;
        map.set(profileId, next);
        return LONG_ENROLLMENT_SENTENCES[next];
    };

    const enrollmentProgress = Math.min(1, enrollmentElapsedMs / SPEAKER_ENROLLMENT_DURATION_MS);

    const enrollmentSecondsRemaining = Math.max(
        0,
        Math.ceil((SPEAKER_ENROLLMENT_DURATION_MS - enrollmentElapsedMs) / 1000),
    );

    const enrollProfile = async (existingProfile?: SpeakerProfile): Promise<void> => {
        const requestedName = existingProfile
            ? (draftNames[existingProfile.id] ?? existingProfile.name)
            : newProfileName;
        const nextName = requestedName.trim() || DEFAULT_NEW_PROFILE_NAME;

        setSavingProfileId(existingProfile?.id ?? '__new__');
        setEnrollmentElapsedMs(0);
        setActiveSentence(pickNextSentence(existingProfile?.id ?? '__new__'));
        setStatusMessage(
            existingProfile
                ? `Mic ready. Ask ${nextName} to read each guided line for about 10 seconds.`
                : `Mic ready. Ask ${nextName} to read each guided line for about 10 seconds.`,
        );
        setErrorMessage(null);

        let acquired: { stream: MediaStream; owned: boolean } | null = null;

        try {
            await unlockAudio();
            const microphoneReady = await primeMicrophonePermission();
            if (!microphoneReady) {
                throw new Error('Curio needs microphone access to enroll a voice profile. Please allow mic access and try again.');
            }

            clearEnrollmentTimer();
            const startedAt = Date.now();
            enrollmentTimerRef.current = window.setInterval(() => {
                const elapsedMs = Date.now() - startedAt;
                if (elapsedMs >= SPEAKER_ENROLLMENT_DURATION_MS) {
                    setEnrollmentElapsedMs(SPEAKER_ENROLLMENT_DURATION_MS);
                    clearEnrollmentTimer();
                    return;
                }
                setEnrollmentElapsedMs(elapsedMs);
            }, ENROLLMENT_GUIDE_TICK_MS);

            acquired = await acquireMicStream();

            const { createSpeakerProfileFromStream } = await import('../../../services/speakerRecognitionService');
            const { profile, quality } = await createSpeakerProfileFromStream(acquired.stream, {
                name: nextName,
                existingProfile: existingProfile ?? null,
            });

            upsertSpeakerProfile(profile);

            if (!defaultSpeakerProfileId || speakerProfiles.length === 0) {
                setSpeakerDefaultProfileId(profile.id);
            }

            if (!speakerIdentificationEnabled) {
                setSpeakerIdentificationEnabled(true);
            }

            if (!existingProfile) {
                setNewProfileName(DEFAULT_NEW_PROFILE_NAME);
            }

            setDraftNames((previousDrafts) => ({
                ...previousDrafts,
                [profile.id]: profile.name,
            }));

            // Voiced ratio <0.25 means most of the 10s window was silence --
            // the resulting voiceprint will be thin. Warn and suggest retry.
            if (quality.voicedRatio < 0.25) {
                setStatusMessage(
                    `Saved ${profile.name}, but only ${Math.round(quality.voicedRatio * 100)}% of the window had speech. Try "Improve voiceprint" with a longer phrase or closer to the mic.`,
                );
            } else if (!existingProfile) {
                // Nudge first-time enrollers -- additive enrollment matters
                // more for voice because variance estimates stabilize slowly.
                setStatusMessage(
                    `Saved a local voiceprint for ${profile.name}. Tip: "Improve voiceprint" another time in a different setting for better recognition.`,
                );
            } else {
                setStatusMessage(`Saved ${profile.name}. Now ${profile.sampleCount} voice sample${profile.sampleCount === 1 ? '' : 's'} on file.`);
            }
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : 'Voice enrollment failed. Please try again.';
            setErrorMessage(message);
            setStatusMessage(null);
        } finally {
            clearEnrollmentTimer();
            setEnrollmentElapsedMs(0);
            // Only stop tracks we actually opened -- the live session stream
            // is owned by LiveAPIContext and must stay alive.
            if (acquired?.owned) {
                acquired.stream.getTracks().forEach((track) => track.stop());
            }
            setSavingProfileId(null);
        }
    };

    return (
        <SettingsSection title="Voice ID" icon={<Mic size={18} className="text-sky-500" />}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <SettingsToggle
                        label="Speaker ID"
                        description="Identify who is talking using local-only voiceprints"
                        enabled={speakerIdentificationEnabled}
                        onToggle={() => setSpeakerIdentificationEnabled(!speakerIdentificationEnabled)}
                        color="bg-emerald-500"
                        icon={<AudioLines size={14} className="text-emerald-500" />}
                    />
                    <SettingsToggle
                        label="Always-On"
                        description={canEnableAlwaysOn ? 'Watch for speaker changes during live sessions' : 'Needs 2+ enrolled users'}
                        enabled={speakerAlwaysOnEnabled}
                        onToggle={() => setSpeakerAlwaysOnEnabled(!speakerAlwaysOnEnabled)}
                        color="bg-indigo-500"
                        icon={<Zap size={14} className="text-indigo-500" />}
                    />
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Shield size={64} className="text-emerald-500" />
                    </div>
                    <div className="flex items-start gap-3 relative z-10 transition-all">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-600">
                            <Shield size={14} />
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-emerald-900">Private & Secure by Default</p>
                            <p className="text-[11px] leading-relaxed text-emerald-800/80">
                                Curio stores a compact local voice embedding instead of raw audio. Enrollment listens for a guided 10-second sample, saves the voiceprint on this device, and releases the mic immediately after processing.
                            </p>
                            <p className="text-[11px] leading-relaxed text-emerald-800/80">
                                When wakeword is off, speaker ID runs only once when a live voice session starts. Always-On mode only watches for speaker changes during an active session.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                                <Mic size={14} />
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                Enroll New Voice
                            </span>
                        </div>
                    </div>
                    
                    <div className="p-4 space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <div className="relative flex-1 group">
                                <input
                                    type="text"
                                    value={newProfileName}
                                    onChange={(event) => setNewProfileName(event.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none transition-all focus:border-sky-400 focus:ring-4 focus:ring-sky-50"
                                    placeholder="Enter profile name..."
                                />
                                <div className="absolute right-3 top-2.5 text-slate-300">
                                    <Users size={18} />
                                </div>
                            </div>
                            <button
                                onClick={() => { void enrollProfile(); }}
                                disabled={savingProfileId !== null}
                                className="group relative flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-6 py-2.5 text-xs font-bold text-white transition-all hover:bg-sky-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 overflow-hidden shadow-md shadow-sky-100"
                            >
                                {savingProfileId === '__new__' ? (
                                    <>
                                        <RefreshCcw size={14} className="animate-spin" />
                                        <span>Listening...</span>
                                    </>
                                ) : (
                                    <>
                                        <Mic size={14} />
                                        <span>Start Enrollment</span>
                                    </>
                                )}
                            </button>
                        </div>

                        {savingProfileId === '__new__' && (
                            <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-3 rounded-xl border border-sky-100 bg-sky-50/50 p-4">
                                <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-sky-700">
                                    <div className="flex items-center gap-2">
                                        <div className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
                                        <span>Reading Guided Sentence</span>
                                    </div>
                                    <span className="tabular-nums bg-sky-100 px-2 py-0.5 rounded-full">{enrollmentSecondsRemaining}s left</span>
                                </div>
                                
                                <div className="h-2 overflow-hidden rounded-full bg-sky-100/50 p-[1px]">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600 transition-[width] duration-300 shadow-[0_0_8px_rgba(14,165,233,0.3)]"
                                        style={{ width: `${Math.max(6, enrollmentProgress * 100)}%` }}
                                    />
                                </div>

                                {activeSentence && (
                                    <div className="relative group">
                                        <div className="absolute -inset-0.5 bg-gradient-to-r from-sky-500 to-indigo-500 rounded-xl blur opacity-10" />
                                        <div className="relative rounded-xl border border-sky-200 bg-white px-5 py-4 text-center shadow-sm">
                                            <p className="text-sm font-bold text-sky-900 leading-relaxed italic">
                                                "{activeSentence}"
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex items-start gap-2.5 px-1 py-1">
                            <div className="mt-0.5 h-1 w-1 rounded-full bg-slate-300 shrink-0" />
                            <p className="text-[10px] leading-relaxed text-slate-400">
                                Curio will guide you through several sentences to build a reliable local voiceprint. No audio data leaves this device.
                            </p>
                        </div>
                    </div>
                </div>

                {speakerProfiles.length > 0 && (
                    <div className="space-y-3 pt-2">
                        <div className="flex items-center gap-2 pl-1">
                            <div className="w-1 h-3 rounded-full bg-slate-300" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                Enrolled Profiles
                            </span>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-3">
                            {speakerProfiles.map((profile) => {
                                const isDefault = defaultSpeakerProfileId === profile.id;
                                const isActive = sessionSpeaker.activeProfileId === profile.id;
                                const draftName = draftNames[profile.id] ?? profile.name;
                                const isEnrolling = savingProfileId === profile.id;

                                return (
                                    <div key={profile.id} className="group relative rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-sky-200 hover:shadow-md hover:shadow-sky-50/50">
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                                            <div className="flex-1 min-w-0 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="relative">
                                                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                                            <Users size={20} />
                                                        </div>
                                                        {isActive && (
                                                            <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
                                                                <CheckCircle2 size={10} />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <input
                                                            type="text"
                                                            value={draftName}
                                                            onChange={(event) => setDraftNames((previousDrafts) => ({
                                                                ...previousDrafts,
                                                                [profile.id]: event.target.value,
                                                            }))}
                                                            onBlur={() => {
                                                                if (draftName.trim() && draftName.trim() !== profile.name) {
                                                                    renameSpeakerProfile(profile.id, draftName);
                                                                }
                                                            }}
                                                            className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none focus:text-sky-600"
                                                        />
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="text-[10px] font-medium text-slate-400">
                                                                {profile.sampleCount} voice sample{profile.sampleCount === 1 ? '' : 's'}
                                                            </span>
                                                            {isDefault && (
                                                                <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-600 border border-amber-100">
                                                                    <Star size={8} fill="currentColor" />
                                                                    Default Fallback
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                                                <button
                                                    onClick={() => setSpeakerDefaultProfileId(isDefault ? '' : profile.id)}
                                                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition-all active:scale-95 ${isDefault ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-50 text-slate-500 border border-slate-100 hover:bg-white hover:border-amber-200 hover:text-amber-600'}`}
                                                >
                                                    <Star size={12} fill={isDefault ? 'currentColor' : 'none'} />
                                                    {isDefault ? 'Default User' : 'Set Default'}
                                                </button>
                                                
                                                <button
                                                    onClick={() => { void enrollProfile(profile); }}
                                                    disabled={savingProfileId !== null}
                                                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600 transition-all hover:bg-white hover:border-sky-200 hover:text-sky-600 active:scale-95 disabled:opacity-50"
                                                >
                                                    <RefreshCcw size={12} className={isEnrolling ? 'animate-spin' : ''} />
                                                    {isEnrolling ? 'Listening...' : 'Improve voiceprint'}
                                                </button>

                                                <button
                                                    onClick={() => removeSpeakerProfile(profile.id)}
                                                    disabled={savingProfileId !== null}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-400 transition-all hover:bg-red-50 hover:border-red-100 hover:text-red-500 active:scale-95 disabled:opacity-50"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {isEnrolling && (
                                            <div className="mt-4 pt-4 border-t border-slate-100 space-y-3 animate-in fade-in slide-in-from-top-2">
                                                <div className="flex items-center justify-between text-[11px] font-bold text-sky-700">
                                                    <span>Re-enrolling {profile.name}...</span>
                                                    <span className="tabular-nums">{enrollmentSecondsRemaining}s</span>
                                                </div>
                                                <div className="h-1.5 overflow-hidden rounded-full bg-sky-100">
                                                    <div
                                                        className="h-full rounded-full bg-sky-500"
                                                        style={{ width: `${Math.max(6, enrollmentProgress * 100)}%` }}
                                                    />
                                                </div>
                                                {activeSentence && (
                                                    <p className="text-xs font-medium text-sky-900 border border-sky-100 bg-sky-50/50 rounded-xl px-4 py-2.5 text-center italic">
                                                        "{activeSentence}"
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <VoiceIdTestPanel
                    profiles={speakerProfiles}
                    unlockAudio={unlockAudio}
                    primeMicrophonePermission={primeMicrophonePermission}
                    audioInputStream={audioInputStream}
                />

                {(statusMessage || errorMessage) && (
                    <div className={`mt-2 flex items-center gap-3 rounded-2xl border px-4 py-3 text-[11px] font-medium leading-relaxed shadow-sm transition-all animate-in slide-in-from-bottom-2 ${
                        errorMessage 
                            ? 'border-red-100 bg-red-50 text-red-700' 
                            : 'border-sky-100 bg-sky-50 text-sky-700'
                    }`}>
                        {errorMessage ? <XCircle size={14} className="shrink-0" /> : <CheckCircle2 size={14} className="shrink-0" />}
                        <p>{errorMessage ?? statusMessage}</p>
                    </div>
                )}
        </SettingsSection>
    );
};

/* ─────────────────────────────────────── VoiceIdTestPanel ─────────────────── */

type VoiceTestResult = {
    matched: true;
    name: string;
    score: number;
    confidence: number;
} | { matched: false };

type VoiceIdTestPanelProps = {
    profiles: import('../../../services/speakerProfileStore').SpeakerProfile[];
    unlockAudio: () => Promise<void | boolean>;
    primeMicrophonePermission: () => Promise<boolean>;
    audioInputStream: MediaStream | null;
};

const VoiceIdTestPanel: React.FC<VoiceIdTestPanelProps> = ({
    profiles,
    unlockAudio,
    primeMicrophonePermission,
    audioInputStream,
}) => {
    const [testing, setTesting] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [result, setResult] = useState<VoiceTestResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const countdownRef = useRef<number | null>(null);

    const TEST_DURATION_MS = SPEAKER_IDENTIFY_DURATION_MS;

    const clearCountdownTimer = () => {
        if (countdownRef.current !== null) {
            window.clearInterval(countdownRef.current);
            countdownRef.current = null;
        }
    };

    useEffect(() => clearCountdownTimer, []);

    const runTest = async () => {
        if (profiles.length === 0) return;
        setTesting(true);
        setResult(null);
        setError(null);
        setCountdown(Math.ceil(TEST_DURATION_MS / 1000));

        let acquired: { stream: MediaStream; owned: boolean } | null = null;
        try {
            await unlockAudio();
            const micReady = await primeMicrophonePermission();
            if (!micReady) throw new Error('Microphone access is required to test Voice ID.');

            if (audioInputStream && audioInputStream.getAudioTracks().some((t) => t.readyState === 'live')) {
                acquired = { stream: audioInputStream, owned: false };
            } else {
                acquired = {
                    stream: await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                            channelCount: 1,
                        },
                    }),
                    owned: true,
                };
            }

            const startedAt = Date.now();
            countdownRef.current = window.setInterval(() => {
                const remaining = Math.max(0, Math.ceil((TEST_DURATION_MS - (Date.now() - startedAt)) / 1000));
                setCountdown(remaining);
                if (remaining === 0) clearCountdownTimer();
            }, 200);

            const { identifySpeakerFromStream } = await import('../../../services/speakerRecognitionService');
            const match = await identifySpeakerFromStream(acquired.stream, profiles);

            if (match) {
                setResult({ matched: true, name: match.profileName, score: match.score, confidence: match.confidence });
            } else {
                setResult({ matched: false });
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Test failed. Please try again.');
        } finally {
            clearCountdownTimer();
            setCountdown(0);
            if (acquired?.owned) {
                acquired.stream.getTracks().forEach((t) => t.stop());
            }
            setTesting(false);
        }
    };

    if (profiles.length === 0) return null;

    return (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3.5">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                    <FlaskConical size={14} className="text-violet-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Test Voice Recognition
                    </span>
                </div>
                <button
                    onClick={() => { void runTest(); }}
                    disabled={testing}
                    className="rounded-xl bg-violet-500 px-3 py-1.5 text-[11px] font-bold text-white transition-all hover:bg-violet-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {testing ? `Listening… ${countdown}s` : 'Test Now'}
                </button>
            </div>

            <p className="text-[11px] leading-relaxed text-slate-500">
                Say a short phrase or sentence (about {Math.round(SPEAKER_IDENTIFY_DURATION_MS / 1000)}s) and Curio will try to match your voice against all {profiles.length} enrolled profile{profiles.length === 1 ? '' : 's'}.
            </p>

            {testing && (
                <div className="h-1.5 overflow-hidden rounded-full bg-violet-100">
                    <div
                        className="h-full animate-pulse rounded-full bg-violet-400"
                        style={{ width: '100%' }}
                    />
                </div>
            )}

            {result !== null && !testing && (
                <div
                    className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${
                        result.matched
                            ? 'border-emerald-200 bg-emerald-50'
                            : 'border-amber-200 bg-amber-50'
                    }`}
                >
                    {result.matched ? (
                        <>
                            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                            <div className="min-w-0 space-y-0.5">
                                <p className="text-[11px] font-bold text-emerald-800">
                                    Recognised as <span className="font-extrabold">{result.name}</span>
                                </p>
                                <p className="text-[10px] text-emerald-700">
                                    Score: {(result.score * 100).toFixed(1)}%
                                    &nbsp;·&nbsp;
                                    Confidence: {(result.confidence * 100).toFixed(1)}%
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            <XCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
                            <div className="min-w-0 space-y-0.5">
                                <p className="text-[11px] font-bold text-amber-800">No match found</p>
                                <p className="text-[10px] text-amber-700">
                                    The voice did not meet the confidence threshold. Try speaking closer to the mic or re-enrolling.
                                </p>
                            </div>
                        </>
                    )}
                </div>
            )}

            {error && (
                <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700">
                    {error}
                </p>
            )}
        </div>
    );
};

export default React.memo(SpeakerProfilesSection);
