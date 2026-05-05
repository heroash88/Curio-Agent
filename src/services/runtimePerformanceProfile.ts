import { useEffect, useMemo, useState } from 'react';
import {
    getBrowserDeviceProfile,
    type BrowserDeviceProfile,
} from './browserDeviceProfile';

export interface RuntimePerformanceProfileInput {
    lowPowerMode: boolean;
    isConnected?: boolean;
    isConnecting?: boolean;
    screensaverActive?: boolean;
    faceTrackingEnabled?: boolean;
    wakeWordEnabled?: boolean;
    visibilityState?: DocumentVisibilityState;
    deviceProfile?: BrowserDeviceProfile;
}

export interface RuntimePerformanceProfile {
    documentHidden: boolean;
    constrainedDevice: boolean;
    deviceProfile: BrowserDeviceProfile;
    allowDisconnectedPreload: boolean;
    allowAmbientAnimation: boolean;
    allowFaceHeavyEffects: boolean;
    allowScreensaverHeavyEffects: boolean;
    allowHighFrequencyWeatherRefresh: boolean;
    allowFaceTrackingBackgroundWork: boolean;
    idleAnimationChance: number;
    maxCurioIdleAnimationType: number;
    maxAstroIdleAnimationType: number;
    maxKiroIdleAnimationType: number;
    microSaccadeIntervalMs: number;
    microSaccadeChance: number;
    eyeConvergedThrottleMs: number;
    faceTrackingPollIntervalMs: number;
    screensaverSlideIntervalMs: number;
    screensaverUrlRefreshIntervalMs: number;
}

const getDefaultVisibilityState = (): DocumentVisibilityState =>
    typeof document === 'undefined' ? 'visible' : document.visibilityState;

export const createRuntimePerformanceProfile = ({
    lowPowerMode,
    isConnected = false,
    isConnecting = false,
    screensaverActive = false,
    faceTrackingEnabled = false,
    wakeWordEnabled = false,
    visibilityState = getDefaultVisibilityState(),
    deviceProfile = getBrowserDeviceProfile(),
}: RuntimePerformanceProfileInput): RuntimePerformanceProfile => {
    const connectedSession = isConnected || isConnecting;
    const documentHidden = visibilityState === 'hidden';
    const constrainedDevice = lowPowerMode || deviceProfile.isConstrained;
    const wakeWordIdle = wakeWordEnabled && !connectedSession;

    let idleAnimationChance = 0.25;
    let maxCurioIdleAnimationType = 65;
    let maxAstroIdleAnimationType = 120;
    let maxKiroIdleAnimationType = 141;
    let microSaccadeIntervalMs = 150;
    let microSaccadeChance = 0.05;
    let eyeConvergedThrottleMs = 250;

    if (constrainedDevice) {
        idleAnimationChance = 0.14;
        maxCurioIdleAnimationType = 28;
        maxAstroIdleAnimationType = 42;
        maxKiroIdleAnimationType = 42;
        microSaccadeIntervalMs = 320;
        microSaccadeChance = 0.025;
        eyeConvergedThrottleMs = 360;
    }

    if (wakeWordIdle) {
        idleAnimationChance = Math.min(idleAnimationChance, 0.1);
        maxCurioIdleAnimationType = Math.min(maxCurioIdleAnimationType, 18);
        maxAstroIdleAnimationType = Math.min(maxAstroIdleAnimationType, 24);
        maxKiroIdleAnimationType = Math.min(maxKiroIdleAnimationType, 24);
        microSaccadeIntervalMs = Math.max(microSaccadeIntervalMs, 420);
        microSaccadeChance = Math.min(microSaccadeChance, 0.015);
        eyeConvergedThrottleMs = Math.max(eyeConvergedThrottleMs, 450);
    }

    if (lowPowerMode) {
        idleAnimationChance = Math.min(idleAnimationChance, 0.08);
        maxCurioIdleAnimationType = Math.min(maxCurioIdleAnimationType, 12);
        maxAstroIdleAnimationType = Math.min(maxAstroIdleAnimationType, 18);
        maxKiroIdleAnimationType = Math.min(maxKiroIdleAnimationType, 18);
        microSaccadeIntervalMs = Math.max(microSaccadeIntervalMs, 520);
        microSaccadeChance = Math.min(microSaccadeChance, 0.01);
        eyeConvergedThrottleMs = Math.max(eyeConvergedThrottleMs, 520);
    }

    return {
        documentHidden,
        constrainedDevice,
        deviceProfile,
        allowDisconnectedPreload: !lowPowerMode && !documentHidden,
        // In low power mode, still allow ambient animation but at reduced fidelity
        // so the face doesn't look dead. The face engine itself throttles animations.
        allowAmbientAnimation: !documentHidden && !screensaverActive,
        allowFaceHeavyEffects: !documentHidden && !lowPowerMode && !wakeWordIdle && !constrainedDevice,
        allowScreensaverHeavyEffects: !documentHidden && !lowPowerMode && !constrainedDevice,
        allowHighFrequencyWeatherRefresh: !documentHidden && !lowPowerMode && !screensaverActive && !constrainedDevice,
        // Keep face tracking alive during screensaver when enabled so it can
        // dismiss the screensaver on face detection. Still disable when hidden.
        allowFaceTrackingBackgroundWork: !documentHidden && (!screensaverActive || faceTrackingEnabled),
        idleAnimationChance,
        maxCurioIdleAnimationType,
        maxAstroIdleAnimationType,
        maxKiroIdleAnimationType,
        microSaccadeIntervalMs,
        microSaccadeChance,
        eyeConvergedThrottleMs,
        faceTrackingPollIntervalMs: lowPowerMode
            ? (connectedSession ? 120 : 180)
            : constrainedDevice
                ? (connectedSession ? 110 : 220)
                : 80,
        screensaverSlideIntervalMs: lowPowerMode ? 60_000 : 30_000,
        screensaverUrlRefreshIntervalMs: lowPowerMode ? 55 * 60_000 : 45 * 60_000,
    };
};

export const useRuntimePerformanceProfile = (
    input: Omit<RuntimePerformanceProfileInput, 'visibilityState'>,
): RuntimePerformanceProfile => {
    const [visibilityState, setVisibilityState] = useState<DocumentVisibilityState>(getDefaultVisibilityState);

    useEffect(() => {
        if (typeof document === 'undefined') {
            return undefined;
        }

        const handleVisibilityChange = () => {
            setVisibilityState(document.visibilityState);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    return useMemo(
        () => createRuntimePerformanceProfile({ ...input, visibilityState }),
        [
            input.isConnected,
            input.isConnecting,
            input.lowPowerMode,
            input.screensaverActive,
            input.faceTrackingEnabled,
            input.wakeWordEnabled,
            visibilityState,
        ],
    );
};
