import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CurioState } from '../../services/emotionDetection';
import type { FaceIdentityFeedback } from '../../hooks/useFaceIdentityMonitor';

const FACE_STATUS_NOTICE_MS = 5_000;

type CurioStatusStackProps = {
    idlePromptPosition: string;
    isMiniPlayerActive: boolean;
    connectButtonPosition: string;
    homeFaceDetected: boolean;
    faceIdentityFeedback: FaceIdentityFeedback | null;
    showDashboard: boolean;
    isConnected: boolean;
    isConnecting: boolean;
    offlineActive: boolean;
    haVoiceActive: boolean;
    showTranscript: boolean;
    showIdlePrompt: boolean;
    idlePromptScale: number;
    curioState: CurioState;
    statusMessage: string;
    statusPillClass: string;
    renderStatusWithWakeWord: (text: string) => ReactNode;
};

export function CurioStatusStack({
    idlePromptPosition,
    isMiniPlayerActive,
    connectButtonPosition,
    homeFaceDetected,
    faceIdentityFeedback,
    showDashboard,
    isConnected,
    isConnecting,
    offlineActive,
    haVoiceActive,
    showTranscript,
    showIdlePrompt,
    idlePromptScale,
    curioState,
    statusMessage,
    statusPillClass,
    renderStatusWithWakeWord,
}: CurioStatusStackProps) {
    const [showFaceDetectedNotice, setShowFaceDetectedNotice] = useState(false);
    const faceDetectedNoticeTimeoutRef = useRef<number | null>(null);
    const previousHomeFaceDetectedRef = useRef(false);

    useEffect(() => {
        const wasDetected = previousHomeFaceDetectedRef.current;
        previousHomeFaceDetectedRef.current = homeFaceDetected;

        if (!homeFaceDetected || wasDetected) return;

        if (faceDetectedNoticeTimeoutRef.current !== null) {
            window.clearTimeout(faceDetectedNoticeTimeoutRef.current);
        }

        setShowFaceDetectedNotice(true);
        faceDetectedNoticeTimeoutRef.current = window.setTimeout(() => {
            setShowFaceDetectedNotice(false);
            faceDetectedNoticeTimeoutRef.current = null;
        }, FACE_STATUS_NOTICE_MS);
    }, [homeFaceDetected]);

    useEffect(() => {
        return () => {
            if (faceDetectedNoticeTimeoutRef.current !== null) {
                window.clearTimeout(faceDetectedNoticeTimeoutRef.current);
            }
        };
    }, []);

    return (
        <div
            className="absolute left-0 right-0 z-50 flex flex-col items-center justify-center gap-2 px-4 pointer-events-none transition-all duration-500 curio-face-status-stack"
            data-placement={idlePromptPosition}
            data-mini-player={isMiniPlayerActive ? 'true' : undefined}
            data-connect-position={connectButtonPosition}
        >
            <AnimatePresence>
                {showFaceDetectedNotice && !faceIdentityFeedback && (
                    <motion.div
                        key="face-detected"
                        initial={{ opacity: 0, y: 6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="max-w-[calc(100vw-2rem)] rounded-full border border-emerald-200/80 bg-white/88 px-4 py-2 text-center text-[11px] font-semibold text-emerald-700 shadow-lg backdrop-blur-md"
                    >
                        Face detected
                    </motion.div>
                )}
                {faceIdentityFeedback && (
                    <motion.div
                        key={faceIdentityFeedback.id}
                        initial={{ opacity: 0, y: 6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        className={`max-w-[calc(100vw-2rem)] rounded-full border px-4 py-2 text-center text-[11px] font-semibold shadow-lg backdrop-blur-md ${
                            faceIdentityFeedback.tone === 'switch'
                                ? 'border-violet-200/80 bg-white/88 text-violet-700'
                                : faceIdentityFeedback.tone === 'neutral'
                                    ? 'border-slate-200/80 bg-white/88 text-slate-600'
                                    : 'border-emerald-200/80 bg-white/88 text-emerald-700'
                        }`}
                    >
                        {faceIdentityFeedback.message}
                    </motion.div>
                )}
            </AnimatePresence>
            {!showDashboard && !isConnected && !isConnecting && !offlineActive && !haVoiceActive && !showTranscript && showIdlePrompt && (
                <div
                    key={statusMessage}
                    className={`flex-shrink-0 rounded-2xl border px-4 py-1.5 font-bold uppercase tracking-widest pointer-events-auto transition-all duration-200 animate-[fadeSlideIn_0.4s_ease-out] origin-center max-w-[calc(100vw-2rem)] text-center ${statusPillClass}`}
                    style={{ fontSize: Math.round(10 * idlePromptScale / 100) }}
                    data-state={curioState}
                >
                    {renderStatusWithWakeWord(statusMessage)}
                </div>
            )}
        </div>
    );
}
