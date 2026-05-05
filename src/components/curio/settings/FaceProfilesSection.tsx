import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  FlaskConical,
  RefreshCcw,
  Shield,
  Star,
  Trash2,
  Users,
  X,
  XCircle,
  Scan,
  Zap,
} from 'lucide-react';
import SettingsSection from '../SettingsSection';
import SettingsToggle from '../SettingsToggle';
import { useLiveAPIControls } from '../../../contexts/LiveAPIContext';
import {
  setFaceDefaultProfileId,
  setFacePassiveTrackingEnabled,
  setFaceRecognitionEnabled,
  useFaceDefaultProfileId,
  useFacePassiveTrackingEnabled,
  useFaceRecognitionEnabled,
  useFaceTrackingEnabled,
} from '../../../utils/settingsStorage';
import {
  removeFaceProfile,
  renameFaceProfile,
  upsertFaceProfile,
  useFaceProfiles,
  type FaceProfile,
} from '../../../services/faceProfileStore';
import { useSpeakerSessionState } from '../../../services/speakerSessionStore';
import { FACE_ENROLLMENT_DURATION_MS, CURRENT_FACE_EMBEDDING_VERSION } from '../../../services/faceRecognitionService';
import { useFacePreviewSession } from '../../../hooks/useFacePreviewSession';

const DEFAULT_NEW_PROFILE_NAME = 'New User';
const ENROLLMENT_GUIDE_TICK_MS = 250;
const ENROLL_FACE_READY_MS = 700;
const TEST_FACE_READY_MS = 2_200;
const TEST_CAMERA_TIMEOUT_MS = 10_000;

// Cycled during the 15s capture window with explicit, unambiguous directions
// so the user offers genuinely varied head angles instead of staying still.
// Order is deliberate: neutral base first, then 4 cardinal rotations, then
// a smile to add expression variance at the end.
const ENROLLMENT_GUIDED_PROMPTS = [
  'Look straight at the camera.',
  'Slowly tilt your head to the left.',
  'Slowly tilt your head to the right.',
  'Tilt your chin up a bit.',
  'Now smile at the camera.',
] as const;

type FaceTestResult =
  | {
      matched: true;
      name: string;
      score: number;
      confidence: number;
    }
  | {
      matched: false;
    };

type FacePreviewCardProps = {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  faceDetected: boolean;
  faceBounds: import('../../../services/faceTracking').NormalizedFaceBounds | null;
  helperText: string;
  progressLabel?: string | null;
  progress?: number | null;
  busy?: boolean;
  onCancel: () => void;
};

const FacePreviewCard: React.FC<FacePreviewCardProps> = ({
  videoRef,
  faceDetected,
  faceBounds,
  helperText,
  progressLabel,
  progress,
  busy = false,
  onCancel,
}) => {
  const frameStyle = faceBounds
    ? {
        left: `${faceBounds.xMin * 100}%`,
        top: `${faceBounds.yMin * 100}%`,
        width: `${faceBounds.width * 100}%`,
        height: `${faceBounds.height * 100}%`,
      }
    : null;

  return (
    <div className="space-y-3 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              faceDetected ? 'bg-emerald-500' : 'bg-amber-400'
            }`}
          />
          <span className={faceDetected ? 'text-emerald-700' : 'text-amber-700'}>
            {faceDetected ? 'Face detected' : 'Waiting for face'}
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X size={12} />
          {busy ? 'Working' : 'Cancel'}
        </button>
      </div>

      {progressLabel && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-cyan-700">
            <span>{progressLabel}</span>
          </div>
          {typeof progress === 'number' && (
            <div className="h-2 overflow-hidden rounded-full bg-cyan-100">
              <div
                className={`h-full rounded-full ${busy ? 'bg-cyan-500' : 'bg-emerald-500'} transition-[width] duration-150`}
                style={{ width: `${Math.max(6, Math.min(100, progress * 100))}%` }}
              />
            </div>
          )}
        </div>
      )}

      <div className="relative overflow-hidden rounded-xl border border-cyan-200 bg-slate-950 shadow-sm">
        <video
          ref={(node) => {
            videoRef.current = node;
          }}
          autoPlay
          playsInline
          muted
          className="aspect-video w-full object-cover scale-x-[-1]"
        />
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[62%] w-[48%] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border-2 border-dashed border-white/70 shadow-[0_0_0_1px_rgba(15,23,42,0.18)]" />
          {frameStyle && (
            <div
              className={`absolute rounded-[24px] border-2 shadow-[0_0_0_1px_rgba(15,23,42,0.2)] ${
                faceDetected ? 'border-emerald-400' : 'border-amber-300'
              }`}
              style={frameStyle}
            />
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent px-3 py-3">
            <p className="text-center text-sm font-medium tracking-wide text-white drop-shadow-md">
              {helperText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const FaceProfilesSection: React.FC = () => {
  const { primeCameraPermission, mediaStream } = useLiveAPIControls();
  const faceRecognitionEnabled = useFaceRecognitionEnabled();
  const facePassiveTrackingEnabled = useFacePassiveTrackingEnabled();
  const faceTrackingEnabled = useFaceTrackingEnabled();
  const faceProfiles = useFaceProfiles();
  const sessionSpeaker = useSpeakerSessionState();
  const defaultFaceProfileId = useFaceDefaultProfileId();

  const [newProfileName, setNewProfileName] = useState(DEFAULT_NEW_PROFILE_NAME);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [savingProfileId, setSavingProfileId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [enrollmentElapsedMs, setEnrollmentElapsedMs] = useState(0);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<FaceTestResult | null>(null);
  const [activePreviewMode, setActivePreviewMode] = useState<'enroll' | 'test' | null>(null);

  const enrollmentTimerRef = useRef<number | null>(null);
  const {
    videoRef,
    previewBusy,
    previewOpen,
    previewReady,
    faceDetected,
    faceBounds,
    faceStableMs,
    closePreview,
    runWithFaceReady,
  } = useFacePreviewSession({
    preferredStream: mediaStream,
  });

  useEffect(() => {
    setDraftNames((previousDrafts) => {
      const nextDrafts: Record<string, string> = {};
      for (const profile of faceProfiles) {
        nextDrafts[profile.id] = previousDrafts[profile.id] ?? profile.name;
      }
      return nextDrafts;
    });
  }, [faceProfiles]);

  const clearEnrollmentTimer = (): void => {
    if (enrollmentTimerRef.current !== null) {
      window.clearInterval(enrollmentTimerRef.current);
      enrollmentTimerRef.current = null;
    }
  };

  useEffect(() => clearEnrollmentTimer, []);

  const stopPreview = () => {
    clearEnrollmentTimer();
    setEnrollmentElapsedMs(0);
    setActivePreviewMode(null);
    closePreview();
  };

  const enrollmentProgress = Math.min(1, enrollmentElapsedMs / FACE_ENROLLMENT_DURATION_MS);
  const enrollmentSecondsRemaining = Math.max(
    0,
    Math.ceil((FACE_ENROLLMENT_DURATION_MS - enrollmentElapsedMs) / 1000),
  );
  const previewReadyProgress = Math.min(
    1,
    faceStableMs / (activePreviewMode === 'test' ? TEST_FACE_READY_MS : ENROLL_FACE_READY_MS),
  );

  const guidedEnrollmentPrompt = (() => {
    if (!previewBusy || activePreviewMode !== 'enroll') return null;
    const slice = FACE_ENROLLMENT_DURATION_MS / ENROLLMENT_GUIDED_PROMPTS.length;
    const index = Math.min(
      ENROLLMENT_GUIDED_PROMPTS.length - 1,
      Math.floor(enrollmentElapsedMs / slice),
    );
    return ENROLLMENT_GUIDED_PROMPTS[index];
  })();

  const previewHelperText = previewBusy
    ? activePreviewMode === 'test'
      ? 'Hold steady while Curio verifies your face.'
      : guidedEnrollmentPrompt ?? 'Keep your face inside the guide while Curio captures a few angles.'
    : faceDetected
      ? activePreviewMode === 'test'
        ? 'Face locked. Keep looking at the camera.'
        : 'Face locked. Hold still and turn gently when asked.'
      : 'Move your face into the center guide before capture starts.';

  const previewProgressLabel = previewBusy
    ? activePreviewMode === 'test'
      ? 'Running Face ID test'
      : `Capturing face sample -- ${enrollmentSecondsRemaining}s left`
    : activePreviewMode === 'test'
      ? `Hold a detected face for ${Math.ceil(Math.max(0, TEST_FACE_READY_MS - faceStableMs) / 1000)}s`
      : 'Hold a detected face steady to begin capture';

  const cancelPreview = () => {
    setTesting(false);
    setSavingProfileId(null);
    stopPreview();
    setStatusMessage(null);
  };

  const enrollProfile = async (existingProfile?: FaceProfile): Promise<void> => {
    const requestedName = existingProfile
      ? (draftNames[existingProfile.id] ?? existingProfile.name)
      : newProfileName;
    const nextName = requestedName.trim() || DEFAULT_NEW_PROFILE_NAME;

    setSavingProfileId(existingProfile?.id ?? '__new__');
    setTesting(false);
    setTestResult(null);
    setErrorMessage(null);
    setStatusMessage(`Opening camera for ${nextName}. Center the face in the guide to begin capture.`);
    setActivePreviewMode('enroll');

    try {
      const cameraReady = await primeCameraPermission();
      if (!cameraReady) {
        throw new Error('Curio needs camera access to enroll a face profile. Please allow camera access and try again.');
      }

      const { profile, quality } = await runWithFaceReady({
        minFaceStableMs: ENROLL_FACE_READY_MS,
        task: async (stream) => {
          clearEnrollmentTimer();
          const startedAt = Date.now();
          enrollmentTimerRef.current = window.setInterval(() => {
            const elapsedMs = Date.now() - startedAt;
            if (elapsedMs >= FACE_ENROLLMENT_DURATION_MS) {
              setEnrollmentElapsedMs(FACE_ENROLLMENT_DURATION_MS);
              clearEnrollmentTimer();
              return;
            }
            setEnrollmentElapsedMs(elapsedMs);
          }, ENROLLMENT_GUIDE_TICK_MS);

          const { createFaceProfileFromStream } = await import('../../../services/faceRecognitionService');
          return await createFaceProfileFromStream(stream, {
            name: nextName,
            existingProfile: existingProfile ?? null,
          });
        },
      });

      upsertFaceProfile(profile);

      if (!defaultFaceProfileId || faceProfiles.length === 0) {
        setFaceDefaultProfileId(profile.id);
      }

      if (!faceRecognitionEnabled) {
        setFaceRecognitionEnabled(true);
      }

      if (!existingProfile) {
        setNewProfileName(DEFAULT_NEW_PROFILE_NAME);
      }

      setDraftNames((previousDrafts) => ({
        ...previousDrafts,
        [profile.id]: profile.name,
      }));

      // Surface a clear warning if samples disagreed -- this usually means
      // bad lighting or too much movement during capture. <0.82 agreement
      // typically misses matches later, so suggest a re-capture.
      if (quality.sampleAgreement < 0.82) {
        setStatusMessage(
          `Saved ${profile.name}, but the capture was a bit unstable (agreement ${Math.round(quality.sampleAgreement * 100)}%). Try "Add samples" in better lighting for more reliable recognition.`,
        );
      } else if (!existingProfile) {
        // Nudge first-time enrollers to add samples later. Additive
        // enrollment is the biggest accuracy lever for this descriptor.
        setStatusMessage(
          `Saved ${profile.name}. Tip: add another sample later (different time of day, glasses on/off) to make recognition even better.`,
        );
      } else {
        setStatusMessage(`Saved ${profile.name}. Now ${profile.sampleCount} sample${profile.sampleCount === 1 ? '' : 's'} on file.`);
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Face enrollment failed. Please try again.';
      setErrorMessage(message);
      setStatusMessage(null);
    } finally {
      clearEnrollmentTimer();
      setEnrollmentElapsedMs(0);
      setSavingProfileId(null);
      stopPreview();
    }
  };

  const runFaceIdTest = async () => {
    if (faceProfiles.length === 0) {
      return;
    }

    setTesting(true);
    setSavingProfileId(null);
    setErrorMessage(null);
    setStatusMessage('Opening the camera for Face ID test. Keep your face in the guide until Curio finishes.');
    setTestResult(null);
    setActivePreviewMode('test');

    try {
      const cameraReady = await primeCameraPermission();
      if (!cameraReady) {
        throw new Error('Camera access is required to test Face ID.');
      }

      const match = await runWithFaceReady({
        minFaceStableMs: TEST_FACE_READY_MS,
        timeoutMs: TEST_CAMERA_TIMEOUT_MS,
        task: async (stream) => {
          const { identifyFaceFromStream } = await import('../../../services/faceRecognitionService');
          return await identifyFaceFromStream(stream, faceProfiles);
        },
      });

      if (match) {
        setTestResult({
          matched: true,
          name: match.profileName,
          score: match.score,
          confidence: match.confidence,
        });
      } else {
        setTestResult({ matched: false });
      }
      setStatusMessage(null);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Face ID test failed. Please try again.';
      setErrorMessage(message);
      setStatusMessage(null);
    } finally {
      setTesting(false);
      stopPreview();
    }
  };

  return (
    <SettingsSection title="Face ID" icon={<Camera size={18} className="text-cyan-500" />}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <SettingsToggle
                        label="Face ID"
                        description="Match visible people with local-only faceprints"
                        enabled={faceRecognitionEnabled}
                        onToggle={() => setFaceRecognitionEnabled(!faceRecognitionEnabled)}
                        color="bg-cyan-500"
                        icon={<Scan size={14} className="text-cyan-500" />}
                    />
                    <SettingsToggle
                        label="Passive Tracking"
                        description={
                            faceTrackingEnabled
                                ? 'Reuse face tracking samples during live sessions'
                                : 'Needs Robot > Face Tracking enabled'
                        }
                        enabled={faceTrackingEnabled && facePassiveTrackingEnabled}
                        onToggle={() => {
                            if (!faceTrackingEnabled) {
                                setStatusMessage('Turn on Robot > Face Tracking before enabling passive face tracking.');
                                return;
                            }
                            setFacePassiveTrackingEnabled(!facePassiveTrackingEnabled);
                        }}
                        color="bg-indigo-500"
                        icon={<Zap size={14} className="text-indigo-500" />}
                    />
                </div>

                <div className="rounded-2xl border border-cyan-100 bg-cyan-50/50 p-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Shield size={64} className="text-cyan-500" />
                    </div>
                    <div className="flex items-start gap-3 relative z-10 transition-all">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-cyan-100/80 text-cyan-600">
                            <Shield size={14} />
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-cyan-900">Private Biometrics</p>
                            <p className="text-[11px] leading-relaxed text-cyan-800/80">
                                Curio stores a compact local face embedding instead of raw photos. Face tracking, live sessions, enrollment, and testing reuse the same camera resource, and Curio only stops the hardware when the last owner releases it.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-100 text-cyan-600">
                                <Camera size={14} />
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                Enroll New Face
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
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none transition-all focus:border-cyan-400 focus:ring-4 focus:ring-cyan-50"
                                    placeholder="Enter profile name..."
                                />
                                <div className="absolute right-3 top-2.5 text-slate-300">
                                    <Users size={18} />
                                </div>
                            </div>
                            <button
                                onClick={() => { void enrollProfile(); }}
                                disabled={savingProfileId !== null || testing}
                                className="group relative flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-6 py-2.5 text-xs font-bold text-white transition-all hover:bg-cyan-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 overflow-hidden shadow-md shadow-cyan-100"
                            >
                                {savingProfileId === '__new__' ? (
                                    <>
                                        <RefreshCcw size={14} className="animate-spin" />
                                        <span>Capturing...</span>
                                    </>
                                ) : (
                                    <>
                                        <Camera size={14} />
                                        <span>Start Face Enrollment</span>
                                    </>
                                )}
                            </button>
                        </div>

                        {activePreviewMode === 'enroll' && previewOpen && savingProfileId === '__new__' && (
                            <div className="animate-in fade-in zoom-in-95 duration-300">
                                <FacePreviewCard
                                    videoRef={videoRef}
                                    faceDetected={faceDetected}
                                    faceBounds={faceBounds}
                                    helperText={previewHelperText}
                                    progressLabel={previewProgressLabel}
                                    progress={previewBusy ? enrollmentProgress : previewReady ? previewReadyProgress : null}
                                    busy={previewBusy}
                                    onCancel={cancelPreview}
                                />
                            </div>
                        )}

                        <div className="flex items-start gap-2.5 px-1">
                            <div className="mt-0.5 h-1 w-1 rounded-full bg-slate-300 shrink-0" />
                            <p className="text-[10px] leading-relaxed text-slate-400">
                                Curio waits for a detected face before starting. Move naturally and turn gently when prompted to capture multiple angles.
                            </p>
                        </div>
                    </div>
                </div>

                {faceProfiles.length > 0 && (
                    <div className="space-y-3 pt-2">
                        <div className="flex items-center gap-2 pl-1">
                            <div className="w-1 h-3 rounded-full bg-slate-300" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                Enrolled Facprints
                            </span>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-3">
                            {faceProfiles.map((profile) => {
                                const isDefault = defaultFaceProfileId === profile.id;
                                const isEnrolling = savingProfileId === profile.id;
                                const isActive = sessionSpeaker.activeProfileId === profile.id && sessionSpeaker.recognizedBy === 'face';
                                const isStaleVersion = profile.embeddingVersion !== CURRENT_FACE_EMBEDDING_VERSION;

                                return (
                                    <div key={profile.id} className="group relative rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-cyan-200 hover:shadow-md hover:shadow-cyan-50/50">
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                                            <div className="flex-1 min-w-0 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="relative">
                                                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${isActive ? 'bg-cyan-100 text-cyan-600' : 'bg-slate-100 text-slate-400'}`}>
                                                            <Camera size={20} />
                                                        </div>
                                                        {isActive && (
                                                            <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-white ring-2 ring-white">
                                                                <CheckCircle2 size={10} />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <input
                                                            type="text"
                                                            value={draftNames[profile.id] ?? profile.name}
                                                            onChange={(event) => {
                                                                const nextValue = event.target.value;
                                                                setDraftNames((prev) => ({ ...prev, [profile.id]: nextValue }));
                                                            }}
                                                            onBlur={() => {
                                                                const nextName = (draftNames[profile.id] ?? profile.name).trim();
                                                                if (nextName && nextName !== profile.name) renameFaceProfile(profile.id, nextName);
                                                            }}
                                                            className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none focus:text-cyan-600"
                                                        />
                                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                            <span className="text-[10px] font-medium text-slate-400">
                                                                {profile.sampleCount} face capture{profile.sampleCount === 1 ? '' : 's'}
                                                            </span>
                                                            {isDefault && (
                                                                <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-600 border border-amber-100">
                                                                    <Star size={8} fill="currentColor" />
                                                                    Default Fallback
                                                                </span>
                                                            )}
                                                            {isStaleVersion && (
                                                                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-bold text-rose-600 border border-rose-100">
                                                                    Re-enroll to upgrade
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                                                <button
                                                    onClick={() => setFaceDefaultProfileId(isDefault ? '' : profile.id)}
                                                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition-all active:scale-95 ${isDefault ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-50 text-slate-500 border border-slate-100 hover:bg-white hover:border-amber-200 hover:text-amber-600'}`}
                                                >
                                                    <Star size={12} fill={isDefault ? 'currentColor' : 'none'} />
                                                    {isDefault ? 'Default User' : 'Set Default'}
                                                </button>
                                                
                                                <button
                                                    onClick={() => { void enrollProfile(profile); }}
                                                    disabled={savingProfileId !== null || testing}
                                                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600 transition-all hover:bg-white hover:border-cyan-200 hover:text-cyan-600 active:scale-95 disabled:opacity-50"
                                                >
                                                    <RefreshCcw size={12} className={isEnrolling ? 'animate-spin' : ''} />
                                                    {isEnrolling ? 'Capturing...' : isStaleVersion ? 'Re-enroll' : 'Add samples'}
                                                </button>

                                                <button
                                                    onClick={() => removeFaceProfile(profile.id)}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-400 transition-all hover:bg-red-50 hover:border-red-100 hover:text-red-500 active:scale-95"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {isEnrolling && previewOpen && activePreviewMode === 'enroll' && (
                                            <div className="mt-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-2">
                                                <FacePreviewCard
                                                    videoRef={videoRef}
                                                    faceDetected={faceDetected}
                                                    faceBounds={faceBounds}
                                                    helperText={previewHelperText}
                                                    progressLabel={previewProgressLabel}
                                                    progress={previewBusy ? enrollmentProgress : previewReady ? previewReadyProgress : null}
                                                    busy={previewBusy}
                                                    onCancel={cancelPreview}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                                    <FlaskConical size={14} />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    Verify Face Recognition
                                </span>
                            </div>
                            <button
                                onClick={() => { void runFaceIdTest(); }}
                                disabled={testing || savingProfileId !== null || faceProfiles.length === 0}
                                className="rounded-xl bg-violet-500 px-4 py-1.5 text-[11px] font-bold text-white transition-all hover:bg-violet-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 shadow-md shadow-violet-100"
                            >
                                {testing ? 'Testing...' : 'Test Face ID'}
                            </button>
                        </div>
                    </div>

                    <div className="p-4 space-y-4">
                        <p className="text-[11px] leading-relaxed text-slate-500 px-1">
                            Curio will open a brief preview and attempt to match your face against all {faceProfiles.length} enrolled profiles.
                        </p>

                        {activePreviewMode === 'test' && previewOpen && (
                            <div className="animate-in fade-in zoom-in-95 duration-300">
                                <FacePreviewCard
                                    videoRef={videoRef}
                                    faceDetected={faceDetected}
                                    faceBounds={faceBounds}
                                    helperText={previewHelperText}
                                    progressLabel={previewProgressLabel}
                                    progress={previewBusy ? 1 : previewReady ? previewReadyProgress : null}
                                    busy={previewBusy}
                                    onCancel={cancelPreview}
                                />
                            </div>
                        )}

                        {testResult !== null && !testing && (
                            <div className={`flex items-start gap-3 rounded-xl border p-4 transition-all animate-in slide-in-from-bottom-2 ${
                                testResult.matched ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
                            }`}>
                                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${testResult.matched ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                    {testResult.matched ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                                </div>
                                <div className="space-y-1">
                                    <p className={`text-xs font-bold ${testResult.matched ? 'text-emerald-900' : 'text-amber-900'}`}>
                                        {testResult.matched ? `Recognized as ${testResult.name}` : 'No Match Found'}
                                    </p>
                                    <p className={`text-[11px] leading-relaxed ${testResult.matched ? 'text-emerald-700/80' : 'text-amber-700/80'}`}>
                                        {testResult.matched 
                                            ? `Confidence: ${(testResult.confidence * 100).toFixed(1)}% (Score: ${(testResult.score * 100).toFixed(1)}%)`
                                            : 'The face did not meet the confidence threshold. Try repositioning or checking your lighting.'
                                        }
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {(statusMessage || errorMessage) && (
                    <div className={`mt-2 flex items-center gap-3 rounded-2xl border px-4 py-3 text-[11px] font-medium leading-relaxed shadow-sm transition-all animate-in slide-in-from-bottom-2 ${
                        errorMessage 
                            ? 'border-red-100 bg-red-50 text-red-700' 
                            : 'border-cyan-100 bg-cyan-50 text-cyan-700'
                    }`}>
                        {errorMessage ? <XCircle size={14} className="shrink-0" /> : <CheckCircle2 size={14} className="shrink-0" />}
                        <p>{errorMessage ?? statusMessage}</p>
                    </div>
                )}
        </SettingsSection>
  );
};

export default React.memo(FaceProfilesSection);
