import { useCallback, useEffect, useRef, useState } from 'react';
import { isSafariBrowser } from '../services/audioContext';
import { LIVE_SESSION_MIC_AUDIO_CONSTRAINTS } from '../services/sessionMicConstraints';
import { canvasToJpegBase64Data } from '../utils/blobEncoding';
import { requestElectronMediaAccess } from '../utils/electronMediaAccess';
import {
    getNextCameraFacingMode,
    hasMultipleVideoInputDevices,
    type CameraFacingMode,
} from './cameraDeviceUtils';

const CAMERA_PERMISSION_PRIMED_KEY = 'curio_camera_permission_primed';

type CameraToggleResult = {
    success: boolean;
    enabled: boolean;
    error?: string;
    frameReady?: boolean;
    framesCaptured?: number;
    facingMode?: CameraFacingMode;
    canFlipCamera?: boolean;
};

interface UseCameraCaptureInput {
    /** Callback to send a base64 JPEG frame to the Live API. Returns false if not connected. */
    sendVideoFrame: (base64: string) => boolean;
    /** Whether the AI is currently speaking (skip frame capture while speaking). */
    isSpeakingRef: React.RefObject<boolean>;
    /** Whether the Live API session is connected. */
    isSessionConnected: () => boolean;
}

interface UseCameraCaptureResult {
    cameraEnabled: boolean;
    userFacingCamera: boolean;
    canFlipCamera: boolean;
    showCameraPreview: boolean;
    mediaStream: MediaStream | null;
    setCameraEnabled: (enabled: boolean) => void;
    setShowCameraPreview: (show: boolean) => void;
    toggleCamera: (enabled?: boolean) => Promise<CameraToggleResult>;
    flipCamera: () => Promise<CameraToggleResult>;
    stopCamera: () => void;
    primeCameraPermission: () => Promise<boolean>;
    primeMicrophonePermission: () => Promise<boolean>;
    primeAllPermissions: () => Promise<{ camera: boolean; microphone: boolean }>;
    /** Normalize an initial getUserMedia stream: strip video tracks, apply live-session mic constraints. */
    normalizeInitialStreamForSession: (stream: MediaStream) => MediaStream | undefined;
}

/**
 * Extracted camera capture logic from LiveAPIContext.
 *
 * Manages:
 * - Camera stream acquisition (Pi-compatible multi-attempt)
 * - Offscreen video/canvas for frame capture
 * - 1 FPS capture interval during connected sessions
 * - Camera permission priming
 * - Flip camera (user/environment)
 * - Cleanup on unmount
 */
export const useCameraCapture = ({
    sendVideoFrame,
    isSpeakingRef,
    isSessionConnected,
}: UseCameraCaptureInput): UseCameraCaptureResult => {
    const [cameraEnabled, setCameraEnabled] = useState(false);
    const [userFacingCamera, setUserFacingCamera] = useState(false);
    const [canFlipCamera, setCanFlipCamera] = useState(false);
    const [showCameraPreview, setShowCameraPreview] = useState(false);
    const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

    const streamRef = useRef<MediaStream | null>(null);
    const captureIntervalRef = useRef<number | null>(null);
    const offscreenVideoRef = useRef<HTMLVideoElement | null>(null);
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const lastCanvasWidthRef = useRef(0);
    const lastCanvasHeightRef = useRef(0);
    const captureInFlightRef = useRef(false);
    const cameraPermissionPrimedRef = useRef(
        typeof window !== 'undefined' && localStorage.getItem(CAMERA_PERMISSION_PRIMED_KEY) === 'true'
    );
    const micPermissionPrimedRef = useRef(false);

    const cameraEnabledRef = useRef(cameraEnabled);
    const userFacingCameraRef = useRef(userFacingCamera);
    const canFlipCameraRef = useRef(canFlipCamera);
    useEffect(() => { cameraEnabledRef.current = cameraEnabled; }, [cameraEnabled]);
    useEffect(() => { userFacingCameraRef.current = userFacingCamera; }, [userFacingCamera]);
    useEffect(() => { canFlipCameraRef.current = canFlipCamera; }, [canFlipCamera]);

    const ensureOffscreenElements = useCallback(() => {
        if (typeof document === 'undefined') return;
        if (!offscreenVideoRef.current) {
            offscreenVideoRef.current = document.createElement('video');
            offscreenVideoRef.current.playsInline = true;
            offscreenVideoRef.current.autoplay = true;
            offscreenVideoRef.current.muted = true;
        }
        if (!offscreenCanvasRef.current) {
            offscreenCanvasRef.current = document.createElement('canvas');
        }
    }, []);

    const markCameraPermissionPrimed = useCallback(() => {
        cameraPermissionPrimedRef.current = true;
        if (typeof window !== 'undefined') {
            localStorage.setItem(CAMERA_PERMISSION_PRIMED_KEY, 'true');
        }
    }, []);

    const stopCamera = useCallback(() => {
        if (captureIntervalRef.current !== null) {
            window.clearInterval(captureIntervalRef.current);
            captureIntervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (offscreenVideoRef.current) {
            offscreenVideoRef.current.pause();
            offscreenVideoRef.current.srcObject = null;
            offscreenVideoRef.current = null;
        }
        offscreenCanvasRef.current = null;
        canvasCtxRef.current = null;
        captureInFlightRef.current = false;
        lastCanvasWidthRef.current = 0;
        lastCanvasHeightRef.current = 0;
        setMediaStream(null);
        setCameraEnabled(false);
        setShowCameraPreview(false);
    }, []);

    const refreshCameraDeviceAvailability = useCallback(async (): Promise<boolean> => {
        if (!navigator.mediaDevices?.enumerateDevices) {
            canFlipCameraRef.current = false;
            setCanFlipCamera(false);
            return false;
        }
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const canFlip = hasMultipleVideoInputDevices(devices);
            canFlipCameraRef.current = canFlip;
            setCanFlipCamera(canFlip);
            return canFlip;
        } catch (error) {
            console.warn('[useCameraCapture] Failed to enumerate camera devices:', error);
            return canFlipCameraRef.current;
        }
    }, []);

    const resolveFacingMode = useCallback((stream: MediaStream, requested: CameraFacingMode): CameraFacingMode => {
        const trackFacingMode = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
        return trackFacingMode === 'user' || trackFacingMode === 'environment'
            ? trackFacingMode
            : requested;
    }, []);

    const normalizeInitialStreamForSession = useCallback((stream: MediaStream): MediaStream | undefined => {
        const audioTracks = stream.getAudioTracks();
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0) {
            videoTracks.forEach((track) => track.stop());
            markCameraPermissionPrimed();
            void refreshCameraDeviceAvailability();
        }
        if (audioTracks.length === 0) {
            stream.getTracks().forEach((track) => track.stop());
            return undefined;
        }
        const track = audioTracks[0];
        if (track.applyConstraints) {
            track.applyConstraints(LIVE_SESSION_MIC_AUDIO_CONSTRAINTS)
                .catch(err => console.warn('[useCameraCapture] Failed to apply live-session mic constraints', err));
        }
        return new MediaStream(audioTracks);
    }, [markCameraPermissionPrimed, refreshCameraDeviceAvailability]);

    const primeCameraPermission = useCallback(async (): Promise<boolean> => {
        if (cameraPermissionPrimedRef.current) return true;
        if (!navigator.mediaDevices?.getUserMedia) return false;
        try {
            const nativeAccess = await requestElectronMediaAccess('camera');
            if (!nativeAccess) return false;
            // Skip the Permissions API shortcut entirely. Safari's
            // navigator.permissions.query({ name: 'camera' }) can return
            // stale or incorrect states -- e.g. reporting 'denied' when the
            // user just needs to be re-prompted, or throwing on certain
            // permission names. Calling getUserMedia directly is the only
            // reliable cross-browser way to test and request permission.
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            stream.getTracks().forEach((track) => track.stop());
            markCameraPermissionPrimed();
            void refreshCameraDeviceAvailability();
            return true;
        } catch (error: any) {
            const name = error?.name || '';
            if (name === 'NotAllowedError') {
                const safariHint = isSafariBrowser
                    ? ' On Safari, check Safari > Settings > Websites > Camera AND macOS System Settings > Privacy & Security > Camera.'
                    : '';
                console.warn('[useCameraCapture] Camera permission denied.' + safariHint);
            } else {
                console.warn('[useCameraCapture] Camera permission preflight failed:', error);
            }
            return false;
        }
    }, [markCameraPermissionPrimed, refreshCameraDeviceAvailability]);

    const primeMicrophonePermission = useCallback(async (): Promise<boolean> => {
        if (micPermissionPrimedRef.current) return true;
        if (!navigator.mediaDevices?.getUserMedia) return false;
        try {
            const nativeAccess = await requestElectronMediaAccess('microphone');
            if (!nativeAccess) return false;
            const stream = await navigator.mediaDevices.getUserMedia({ audio: LIVE_SESSION_MIC_AUDIO_CONSTRAINTS, video: false });
            stream.getTracks().forEach((track) => track.stop());
            micPermissionPrimedRef.current = true;
            return true;
        } catch (error: any) {
            const name = error?.name || '';
            if (name === 'NotAllowedError') {
                const safariHint = isSafariBrowser
                    ? ' On Safari, check Safari > Settings > Websites > Microphone AND macOS System Settings > Privacy & Security > Microphone.'
                    : '';
                console.warn('[useCameraCapture] Microphone permission denied.' + safariHint);
            } else {
                console.warn('[useCameraCapture] Microphone permission preflight failed:', error);
            }
            return false;
        }
    }, []);

    const primeAllPermissions = useCallback(async (): Promise<{ camera: boolean; microphone: boolean }> => {
        if (!navigator.mediaDevices?.getUserMedia) return { camera: false, microphone: false };

        const nativeMicrophone = await requestElectronMediaAccess('microphone');
        const nativeCamera = await requestElectronMediaAccess('camera');
        if (!nativeMicrophone && !nativeCamera) return { camera: false, microphone: false };

        // Safari on macOS (and iOS) often requires separate permission prompts
        // for camera and microphone. A combined audio/video request can fail
        // entirely if either permission is denied, even if the other would have
        // succeeded. Always try the combined request first for efficiency, but
        // fall back to individual requests on failure.
        try {
            if (!nativeMicrophone || !nativeCamera) throw new Error('Native permission denied');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: LIVE_SESSION_MIC_AUDIO_CONSTRAINTS, video: true });
            stream.getTracks().forEach((track) => track.stop());
            markCameraPermissionPrimed();
            void refreshCameraDeviceAvailability();
            micPermissionPrimedRef.current = true;
            return { camera: true, microphone: true };
        } catch {
            // Combined request failed -- try each permission individually.
            // On Safari this is more reliable because the browser shows
            // separate permission dialogs for camera and microphone.
            const microphone = await primeMicrophonePermission();
            const camera = await primeCameraPermission();
            return { camera, microphone };
        }
    }, [markCameraPermissionPrimed, primeCameraPermission, primeMicrophonePermission, refreshCameraDeviceAvailability]);

    const captureAndSendFrame = useCallback(async (facingMode: CameraFacingMode = 'environment') => {
        ensureOffscreenElements();
        const video = offscreenVideoRef.current;
        const canvas = offscreenCanvasRef.current;
        if (!video || !canvas || video.readyState < 2) return false;
        if (video.videoWidth === 0 || video.videoHeight === 0) return false;
        if (captureInFlightRef.current) return false;

        const maxDimension = 640;
        const scale = (video.videoWidth > maxDimension || video.videoHeight > maxDimension)
            ? Math.min(maxDimension / video.videoWidth, maxDimension / video.videoHeight)
            : 1;
        const targetW = Math.max(1, Math.round(video.videoWidth * scale));
        const targetH = Math.max(1, Math.round(video.videoHeight * scale));
        if (lastCanvasWidthRef.current !== targetW || lastCanvasHeightRef.current !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
            lastCanvasWidthRef.current = targetW;
            lastCanvasHeightRef.current = targetH;
            canvasCtxRef.current = canvas.getContext('2d');
        }
        if (!canvasCtxRef.current) {
            canvasCtxRef.current = canvas.getContext('2d');
        }
        const ctx = canvasCtxRef.current;
        if (!ctx) return false;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (facingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        captureInFlightRef.current = true;
        try {
            const base64Data = await canvasToJpegBase64Data(canvas, 0.7);
            if (!base64Data) return false;
            return sendVideoFrame(base64Data);
        } catch (err) {
            console.warn('[useCameraCapture] Failed to send camera frame:', err);
            return false;
        } finally {
            captureInFlightRef.current = false;
        }
    }, [ensureOffscreenElements, sendVideoFrame]);

    const waitForRenderedVideoFrame = useCallback(async (timeoutMs = 500) => {
        const video = offscreenVideoRef.current;
        if (!video) return false;
        const rvfc = (video as HTMLVideoElement & {
            requestVideoFrameCallback?: (callback: () => void) => number;
        }).requestVideoFrameCallback;
        if (typeof rvfc === 'function') {
            return await new Promise<boolean>((resolve) => {
                let settled = false;
                const timeout = window.setTimeout(() => { if (!settled) { settled = true; resolve(false); } }, timeoutMs);
                rvfc.call(video, () => { if (!settled) { settled = true; window.clearTimeout(timeout); resolve(true); } });
            });
        }
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return true;
            await new Promise((resolve) => window.setTimeout(resolve, 16));
        }
        return false;
    }, []);

    const sendFreshCameraFrames = useCallback(async (
        facingMode: CameraFacingMode = 'environment',
        targetFrames = 2,
        timeoutMs = 1200,
    ) => {
        let framesCaptured = 0;
        const deadline = Date.now() + timeoutMs;
        while (framesCaptured < targetFrames && Date.now() < deadline) {
            const timeRemaining = Math.max(100, deadline - Date.now());
            const frameAvailable = await waitForRenderedVideoFrame(Math.min(400, timeRemaining));
            if (!frameAvailable) break;
            if (await captureAndSendFrame(facingMode)) framesCaptured += 1;
            if (framesCaptured < targetFrames) await new Promise((resolve) => window.setTimeout(resolve, 120));
        }
        if (framesCaptured > 0) await new Promise((resolve) => window.setTimeout(resolve, 80));
        return framesCaptured;
    }, [captureAndSendFrame, waitForRenderedVideoFrame]);

    const startCamera = useCallback(async (facingMode: CameraFacingMode = 'environment'): Promise<CameraToggleResult> => {
        stopCamera();
        ensureOffscreenElements();
        let stream: MediaStream | null = null;
        let lastError: unknown = null;
        const attempts = [
            { video: { facingMode: { ideal: facingMode }, width: { ideal: 960 }, height: { ideal: 720 } }, audio: false },
            { video: true, audio: false },
        ] as const;
        for (const constraints of attempts) {
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints as MediaStreamConstraints);
                break;
            } catch (err) {
                lastError = err;
                console.warn('[useCameraCapture] Camera attempt failed:', constraints, err);
            }
        }
        if (!stream) {
            console.warn('[useCameraCapture] All camera attempts failed.');
            let errorMessage = lastError instanceof Error ? lastError.message : 'Unable to access camera.';
            // Provide Safari-specific guidance for permission errors
            if (lastError instanceof Error && lastError.name === 'NotAllowedError') {
                if (isSafariBrowser) {
                    errorMessage = 'Camera access denied. Check Safari > Settings > Websites > Camera AND macOS System Settings > Privacy & Security > Camera.';
                }
            }
            return {
                success: false,
                enabled: false,
                error: errorMessage,
                frameReady: false,
                facingMode,
                canFlipCamera: canFlipCameraRef.current,
            };
        }
        try {
            const activeFacingMode = resolveFacingMode(stream, facingMode);
            streamRef.current = stream;
            setMediaStream(stream);
            setCameraEnabled(true);
            setUserFacingCamera(activeFacingMode === 'user');
            setShowCameraPreview(true);
            markCameraPermissionPrimed();
            const canFlip = await refreshCameraDeviceAvailability();
            if (offscreenVideoRef.current) {
                offscreenVideoRef.current.srcObject = stream;
                await offscreenVideoRef.current.play().catch((e: any) => console.warn('[useCameraCapture] offscreen video play error:', e));
            }
            const framesCaptured = await sendFreshCameraFrames(activeFacingMode, 2, 1400);
            if (framesCaptured < 1) {
                stopCamera();
                return {
                    success: false,
                    enabled: false,
                    frameReady: false,
                    framesCaptured,
                    error: 'Camera started, but no usable frame was available yet.',
                    facingMode: activeFacingMode,
                    canFlipCamera: canFlip,
                };
            }
            captureIntervalRef.current = window.setInterval(() => {
                if (isSpeakingRef.current) return;
                if (!isSessionConnected()) return;
                void captureAndSendFrame(activeFacingMode);
            }, 1000);
            return {
                success: true,
                enabled: true,
                frameReady: true,
                framesCaptured,
                facingMode: activeFacingMode,
                canFlipCamera: canFlip,
            };
        } catch (error) {
            console.warn('[useCameraCapture] Camera setup failed:', error);
            stopCamera();
            const errorMessage = error instanceof Error ? error.message : 'Failed to initialize camera stream.';
            return {
                success: false,
                enabled: false,
                error: errorMessage,
                frameReady: false,
                framesCaptured: 0,
                facingMode,
                canFlipCamera: canFlipCameraRef.current,
            };
        }
    }, [captureAndSendFrame, ensureOffscreenElements, isSessionConnected, isSpeakingRef, markCameraPermissionPrimed, refreshCameraDeviceAvailability, resolveFacingMode, sendFreshCameraFrames, stopCamera]);

    const toggleCamera = useCallback(async (forceEnabled?: boolean): Promise<CameraToggleResult> => {
        const nextEnabled = typeof forceEnabled === 'boolean' ? forceEnabled : !cameraEnabledRef.current;
        const activeFacingMode: CameraFacingMode = userFacingCameraRef.current ? 'user' : 'environment';
        if (!nextEnabled) {
            stopCamera();
            return {
                success: true,
                enabled: false,
                frameReady: false,
                framesCaptured: 0,
                facingMode: activeFacingMode,
                canFlipCamera: canFlipCameraRef.current,
            };
        }
        if (!cameraEnabledRef.current) {
            return startCamera(activeFacingMode);
        }
        const framesCaptured = await sendFreshCameraFrames(activeFacingMode, 1, 500);
        const frameReady = framesCaptured > 0;
        return {
            success: frameReady,
            enabled: true,
            frameReady,
            framesCaptured,
            error: frameReady ? undefined : 'Camera is on, but no fresh frame was available.',
            facingMode: activeFacingMode,
            canFlipCamera: canFlipCameraRef.current,
        };
    }, [sendFreshCameraFrames, startCamera, stopCamera]);

    const flipCamera = useCallback(async (): Promise<CameraToggleResult> => {
        const canFlip = canFlipCameraRef.current || await refreshCameraDeviceAvailability();
        const currentFacingMode: CameraFacingMode = userFacingCameraRef.current ? 'user' : 'environment';
        if (!canFlip) {
            return {
                success: false,
                enabled: cameraEnabledRef.current,
                frameReady: false,
                framesCaptured: 0,
                error: 'No alternate camera was detected on this device.',
                facingMode: currentFacingMode,
                canFlipCamera: false,
            };
        }
        const nextFacingMode = getNextCameraFacingMode(currentFacingMode);
        setUserFacingCamera(nextFacingMode === 'user');
        if (!cameraEnabledRef.current) {
            return {
                success: true,
                enabled: false,
                frameReady: false,
                framesCaptured: 0,
                facingMode: nextFacingMode,
                canFlipCamera: true,
            };
        }
        return startCamera(nextFacingMode);
    }, [refreshCameraDeviceAvailability, startCamera]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopCamera();
            if (offscreenVideoRef.current) {
                offscreenVideoRef.current.pause();
                offscreenVideoRef.current.srcObject = null;
                offscreenVideoRef.current = null;
            }
            offscreenCanvasRef.current = null;
            canvasCtxRef.current = null;
        };
    }, [stopCamera]);

    return {
        cameraEnabled,
        userFacingCamera,
        canFlipCamera,
        showCameraPreview,
        mediaStream,
        setCameraEnabled,
        setShowCameraPreview,
        toggleCamera,
        flipCamera,
        stopCamera,
        primeCameraPermission,
        primeMicrophonePermission,
        primeAllPermissions,
        normalizeInitialStreamForSession,
    };
};
