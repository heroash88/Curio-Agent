import React from 'react';
import { SwitchCamera } from 'lucide-react';

type CurioCameraPreviewProps = {
    cameraEnabled: boolean;
    canFlipCamera: boolean;
    previewVideoRef: React.RefObject<HTMLVideoElement | null>;
    userFacingCamera: boolean;
    onFlipCamera: () => void;
    onCloseCamera: () => void;
};

export function CurioCameraPreview({
    cameraEnabled,
    canFlipCamera,
    previewVideoRef,
    userFacingCamera,
    onFlipCamera,
    onCloseCamera,
}: CurioCameraPreviewProps) {
    if (!cameraEnabled) {
        return null;
    }

    return (
        <div
            className="absolute bottom-20 right-3 sm:right-4 z-40 overflow-hidden rounded-2xl border-2 border-teal-400/60 shadow-2xl shadow-black/40 bg-black w-[120px] h-[90px] sm:w-[160px] sm:h-[120px]"
            onClick={(event) => event.stopPropagation()}
        >
            <video
                ref={previewVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: userFacingCamera ? 'scaleX(-1)' : 'none' }}
            />
            <div className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-teal-500/90 px-2 py-0.5 text-[10px] font-bold text-white">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                LIVE
            </div>
            {canFlipCamera && (
                <button
                    onClick={(event) => { event.stopPropagation(); onFlipCamera(); }}
                    className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                    aria-label="Flip camera"
                    title="Flip camera"
                >
                    <SwitchCamera size={13} />
                </button>
            )}
            <button
                onClick={(event) => { event.stopPropagation(); onCloseCamera(); }}
                className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                aria-label="Close camera"
            >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}
