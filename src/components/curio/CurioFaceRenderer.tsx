import React, { Suspense } from 'react';

import type { Card } from '../../services/cardTypes';
import type { CurioState } from '../../services/emotionDetection';
import type { FaceTrackingSample } from '../../services/faceTracking';
import type { RuntimePerformanceProfile } from '../../services/runtimePerformanceProfile';

const LazyCurioFace = React.lazy(() => import('./CurioFace').then(m => ({ default: m.CurioFace })));
const LazyAstroFace = React.lazy(() => import('./AstroFace').then(m => ({ default: m.AstroFace })));
const LazyKiroFace = React.lazy(() => import('./KiroFace').then(m => ({ default: m.KiroFace })));
const LazyBenderFace = React.lazy(() => import('./BenderFace'));

type CurioFaceRendererProps = {
    faceStyleId: string;
    overrideFaceStyleId?: string;
    surface?: 'face' | 'dashboard-widget';
    state: CurioState;
    activeCard?: Card | null;
    lowPowerMode: boolean;
    faceTrackingEnabled: boolean;
    idleSleepTimeout: number;
    mediaStream: MediaStream | null;
    userFacingCamera: boolean;
    runtimeProfile: RuntimePerformanceProfile;
    onFaceDetected: (detected?: boolean) => void;
    onFaceTrackingSample: (sample: FaceTrackingSample | null, canvas: HTMLCanvasElement | null) => void;
    emotionHint: string | null;
};

export function CurioFaceRenderer({
    faceStyleId,
    overrideFaceStyleId,
    surface = 'face',
    state,
    activeCard,
    lowPowerMode,
    faceTrackingEnabled,
    idleSleepTimeout,
    mediaStream,
    userFacingCamera,
    runtimeProfile,
    onFaceDetected,
    onFaceTrackingSample,
    emotionHint,
}: CurioFaceRendererProps) {
    const activeFaceStyleId = overrideFaceStyleId || faceStyleId;
    const dashboardFaceClass = surface === 'dashboard-widget' ? 'curio-dashboard-face' : '';
    const className = `h-full w-full ${dashboardFaceClass}`;

    return (
        <Suspense fallback={null}>
            {activeFaceStyleId === 'astro' ? (
                <LazyAstroFace
                    state={state}
                    activeCard={activeCard}
                    className={className}
                    lowPowerMode={lowPowerMode}
                    faceTrackingEnabled={faceTrackingEnabled}
                    idleSleepTimeout={idleSleepTimeout}
                    mediaStream={mediaStream}
                    userFacingCamera={userFacingCamera}
                    runtimeProfile={runtimeProfile}
                    onFaceDetected={onFaceDetected}
                    onFaceTrackingSample={onFaceTrackingSample}
                    emotionHint={emotionHint}
                />
            ) : activeFaceStyleId === 'kiro' ? (
                <LazyKiroFace
                    state={state}
                    activeCard={activeCard}
                    className={className}
                    lowPowerMode={lowPowerMode}
                    faceTrackingEnabled={faceTrackingEnabled}
                    idleSleepTimeout={idleSleepTimeout}
                    mediaStream={mediaStream}
                    userFacingCamera={userFacingCamera}
                    runtimeProfile={runtimeProfile}
                    onFaceDetected={onFaceDetected}
                    onFaceTrackingSample={onFaceTrackingSample}
                    emotionHint={emotionHint}
                />
            ) : activeFaceStyleId === 'bender' ? (
                <LazyBenderFace
                    state={state}
                    className={className}
                    lowPowerMode={lowPowerMode}
                    faceTrackingEnabled={faceTrackingEnabled}
                    mediaStream={mediaStream}
                    userFacingCamera={userFacingCamera}
                    runtimeProfile={runtimeProfile}
                    onFaceDetected={onFaceDetected}
                    onFaceTrackingSample={onFaceTrackingSample}
                    idleSleepTimeout={idleSleepTimeout}
                    emotionHint={emotionHint}
                />
            ) : (
                <LazyCurioFace
                    state={state}
                    className={className}
                    lowPowerMode={lowPowerMode}
                    faceTrackingEnabled={faceTrackingEnabled}
                    idleSleepTimeout={idleSleepTimeout}
                    mediaStream={mediaStream}
                    userFacingCamera={userFacingCamera}
                    runtimeProfile={runtimeProfile}
                    onFaceDetected={onFaceDetected}
                    onFaceTrackingSample={onFaceTrackingSample}
                    emotionHint={emotionHint}
                />
            )}
        </Suspense>
    );
}
