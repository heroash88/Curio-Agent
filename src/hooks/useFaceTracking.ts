/**
 * Shared face-tracking hook used by CurioFace and AstroFace.
 *
 * Manages the full lifecycle: camera acquisition, face detection backend,
 * polling loop with backoff, and cleanup.  The hook writes detected face
 * positions into the caller-provided `targetEyeRef` so each face component
 * can drive its own eye-follow animation.
 */
import { useEffect, useRef } from 'react';
import {
  createFaceTrackingBackend,
  type FaceTrackingSample,
  getTrackingCanvasDimensions,
  mapFaceCenterToEyeTarget,
} from '../services/faceTracking';
import { acquireFaceVisionStream } from '../services/faceVisionStreamManager';

export interface UseFaceTrackingOptions {
  /** Is face tracking enabled in settings? */
  faceTrackingEnabled: boolean;
  /** Does the runtime profile allow background face tracking work? */
  allowFaceTrackingBackgroundWork: boolean;
  /** Shared vision MediaStream (from camera capture), or null. */
  sharedVisionStream: MediaStream | null;
  /** Is the camera user-facing? Controls mirror-X. */
  userFacingCamera: boolean;
  /** Is the device in low-power mode? */
  isLowPower: boolean;
  /** Polling interval in ms (from runtime profile). */
  faceTrackingPollIntervalMs: number;

  // -- Mutable refs the hook writes into --
  /** Eye target position the hook updates on each detection. */
  targetEyeRef: React.MutableRefObject<{ x: number; y: number }>;
  /** Current (smoothed) eye position -- reset on disable. */
  currentEyeRef: React.MutableRefObject<{ x: number; y: number }>;
  /** Consecutive detection misses counter. */
  consecutiveMissesRef: React.MutableRefObject<number>;
  /** Whether face detection is currently active. */
  faceDetectionActiveRef: React.MutableRefObject<boolean>;

  /** Called after resetting eye positions so the face can re-render. */
  applyEyeTransform: () => void;
  /** Called when a face is detected to reset idle timers. */
  registerInteraction: () => void;
  /** Optional sparse sample callback for identity recognition work. */
  onTrackingSample?: (sample: FaceTrackingSample | null, canvas: HTMLCanvasElement | null) => void;
  /** Optional ref that tracks whether a real face is currently visible. */
  facePresentRef?: React.MutableRefObject<boolean>;
  /** Optional face-presence callback for UI indicators. */
  onFacePresenceChange?: (present: boolean) => void;

  /** Label used in console.warn messages (e.g. "CurioFace", "AstroFace"). */
  logTag?: string;

  /** Backoff threshold -- consecutive misses before slowing down. Default 30. */
  backoffThreshold?: number;
  /** Backoff interval in ms after threshold is exceeded. Default 500. */
  backoffIntervalMs?: number;
}

export function useFaceTracking({
  faceTrackingEnabled,
  allowFaceTrackingBackgroundWork,
  sharedVisionStream,
  userFacingCamera,
  isLowPower,
  faceTrackingPollIntervalMs,
  targetEyeRef,
  currentEyeRef,
  consecutiveMissesRef,
  faceDetectionActiveRef,
  applyEyeTransform,
  registerInteraction,
  onTrackingSample,
  facePresentRef,
  onFacePresenceChange,
  logTag = 'FaceTracking',
  backoffThreshold = 30,
  backoffIntervalMs = 500,
}: UseFaceTrackingOptions): void {
  const faceDetectionRef = useRef<any>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const pollIntervalMsRef = useRef(faceTrackingPollIntervalMs);
  const onTrackingSampleRef = useRef(onTrackingSample);

  useEffect(() => {
    pollIntervalMsRef.current = faceTrackingPollIntervalMs;
  }, [faceTrackingPollIntervalMs]);

  useEffect(() => {
    onTrackingSampleRef.current = onTrackingSample;
  }, [onTrackingSample]);

  useEffect(() => {
    const shouldUseSharedVisionStream = Boolean(sharedVisionStream);
    const shouldUseBackgroundTracking = faceTrackingEnabled && allowFaceTrackingBackgroundWork;

    if (!shouldUseSharedVisionStream && !shouldUseBackgroundTracking) {
      faceDetectionActiveRef.current = false;
      consecutiveMissesRef.current = 0;
      if (facePresentRef) {
        facePresentRef.current = false;
      }
      onFacePresenceChange?.(false);
      targetEyeRef.current.x = 0;
      targetEyeRef.current.y = 0;
      currentEyeRef.current.x = 0;
      currentEyeRef.current.y = 0;
      applyEyeTransform();
      onTrackingSampleRef.current?.(null, null);
      return;
    }

    let cancelled = false;
    let detectInFlight = false;
    let managedStreamLease: Awaited<ReturnType<typeof acquireFaceVisionStream>> | null = null;
    let resumeOnInteraction: (() => Promise<void>) | null = null;
    let lastProcessedVideoTime = -1;
    let lastDetectionAt = 0;
    let lastDetectorWarningAt = 0;
    let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let processingCanvasRef: HTMLCanvasElement | null = null;
    let cachedCanvasCtx: CanvasRenderingContext2D | null = null;
    let lastReportedHasFace: boolean | null = null;

    const centerEyes = () => {
      targetEyeRef.current.x = 0;
      targetEyeRef.current.y = 0;
    };

    const setFacePresent = (present: boolean) => {
      if (facePresentRef) {
        facePresentRef.current = present;
      }

      if (lastReportedHasFace === present) {
        return;
      }

      lastReportedHasFace = present;
      onFacePresenceChange?.(present);
    };

    const reportTrackingSample = (
      sample: FaceTrackingSample | null,
      canvas: HTMLCanvasElement | null,
    ) => {
      if (sample) {
        setFacePresent(true);
        onTrackingSampleRef.current?.(sample, canvas);
        return;
      }

      if (lastReportedHasFace !== false) {
        setFacePresent(false);
        onTrackingSampleRef.current?.(null, null);
      }
    };

    const hasRenderableVideoFrame = (video: HTMLVideoElement, stream: MediaStream | null) => {
      const hasLiveVideoTrack = stream
        ?.getVideoTracks()
        .some((track) => track.readyState === 'live' && track.enabled);
      if (!hasLiveVideoTrack) return false;
      if (video.paused || video.ended) return false;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
      if (video.videoWidth <= 1 || video.videoHeight <= 1) return false;
      return Number.isFinite(video.currentTime);
    };

    const waitForRenderableVideoFrame = async (
      video: HTMLVideoElement,
      stream: MediaStream | null,
      timeoutMs: number,
    ) => {
      const deadline = Date.now() + timeoutMs;
      const requestVideoFrameCallback = (
        video as HTMLVideoElement & {
          requestVideoFrameCallback?: (callback: () => void) => number;
        }
      ).requestVideoFrameCallback;

      while (!cancelled && Date.now() < deadline) {
        if (hasRenderableVideoFrame(video, stream)) return true;
        await new Promise<void>((resolve) => {
          if (typeof requestVideoFrameCallback === 'function') {
            requestVideoFrameCallback.call(video, () => resolve());
            return;
          }
          window.setTimeout(resolve, 40);
        });
      }
      return false;
    };

    const syncProcessingCanvas = (
      video: HTMLVideoElement,
      canvas: HTMLCanvasElement,
      maxDimension: number,
    ) => {
      const { width, height } = getTrackingCanvasDimensions(video.videoWidth, video.videoHeight, maxDimension);
      if (!width || !height) return null;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        cachedCanvasCtx = null; // Invalidate cached context on resize
      }
      if (!cachedCanvasCtx) {
        cachedCanvasCtx = canvas.getContext('2d', { alpha: false });
      }
      const context = cachedCanvasCtx;
      if (!context) return null;
      // drawImage covers the full canvas so clearRect is unnecessary
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas;
    };

    const isRecoverableDetectorError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return (
        message.includes('texImage2D') ||
        message.includes('roi-width') ||
        message.includes('ImageToTensorCalculator') ||
        message.includes('Framebuffer') ||
        message.includes('abort')
      );
    };

    const initFaceTracking = async () => {
      try {
        let activeStream = sharedVisionStream;
        let mirrorX = shouldUseSharedVisionStream ? userFacingCamera : true;

        if (!activeStream && shouldUseBackgroundTracking) {
          try {
            managedStreamLease = await acquireFaceVisionStream();
            activeStream = managedStreamLease.stream;
            mirrorX = true;
          } catch (error) {
            console.warn(`[${logTag}] Failed to acquire a local camera stream for face tracking:`, error);
            return;
          }
        }

        if (!activeStream || cancelled) {
          managedStreamLease?.release();
          return;
        }

        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.setAttribute('autoplay', 'true');
        video.setAttribute('playsinline', 'true');
        video.setAttribute('muted', 'true');
        video.style.position = 'fixed';
        video.style.top = '-9999px';
        video.style.left = '-9999px';
        video.style.width = '160px';
        video.style.height = '120px';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';
        video.srcObject = activeStream;
        document.body.appendChild(video);
        cameraVideoRef.current = video;

        if (cancelled) {
          video.srcObject = null;
          document.body.removeChild(video);
          cameraVideoRef.current = null;
          managedStreamLease?.release();
          return;
        }

        try { await video.play(); } catch { /* Safari gesture guard */ }

        resumeOnInteraction = async () => {
          if (!video.paused) return;
          try {
            await video.play();
            if (resumeOnInteraction) {
              window.removeEventListener('touchstart', resumeOnInteraction);
              window.removeEventListener('mousedown', resumeOnInteraction);
            }
          } catch { /* Keep hook installed until browser accepts playback */ }
        };
        window.addEventListener('touchstart', resumeOnInteraction, { passive: true });
        window.addEventListener('mousedown', resumeOnInteraction);

        const frameReady = await waitForRenderableVideoFrame(video, activeStream, 3_000);
        if (!frameReady || cancelled) { centerEyes(); return; }

        if (faceDetectionRef.current) {
          try {
            const closeResult = faceDetectionRef.current.dispose?.();
            if (closeResult && typeof closeResult.then === 'function') {
              await closeResult;
            }
          } catch { /* ignore disposal errors */ }
          faceDetectionRef.current = null;
        }

        faceDetectionRef.current = await createFaceTrackingBackend();
        faceDetectionActiveRef.current = true;

        const processingCanvas = document.createElement('canvas');
        processingCanvasRef = processingCanvas;
        const targetInputMaxDimension = 160;

        const detectFrame = async () => {
          if (
            cancelled ||
            detectInFlight ||
            !faceDetectionActiveRef.current ||
            !faceDetectionRef.current ||
            !hasRenderableVideoFrame(video, activeStream!)
          ) {
            if (Date.now() - lastDetectionAt > 220) {
              centerEyes();
            }
            if (Date.now() - lastDetectionAt > 320) {
              reportTrackingSample(null, null);
            }
            return;
          }

          const inputCanvas = syncProcessingCanvas(video, processingCanvas, targetInputMaxDimension);
          if (!inputCanvas) { centerEyes(); return; }

          detectInFlight = true;
          try {
            const sample = await faceDetectionRef.current.detect(inputCanvas, performance.now());
            if (cancelled) return;

            if (!sample) {
              consecutiveMissesRef.current++;
              if (Date.now() - lastDetectionAt > 220) {
                centerEyes();
              }
              if (Date.now() - lastDetectionAt > 320) {
                reportTrackingSample(null, null);
              }
              return;
            }

            consecutiveMissesRef.current = 0;
            lastDetectionAt = Date.now();
            registerInteraction();
            reportTrackingSample(sample, inputCanvas);
            const nextTarget = mapFaceCenterToEyeTarget(sample.center, { maxMove: 20, mirrorX });
            // Dead-zone: sub-pixel jitter from detector shouldn't kick the
            // eye RAF loop out of its converged/throttled state. Only write
            // when the target moved at least 0.5px.
            const dx = Math.abs(nextTarget.x - targetEyeRef.current.x);
            const dy = Math.abs(nextTarget.y - targetEyeRef.current.y);
            if (dx >= 0.5 || dy >= 0.5) {
              targetEyeRef.current.x = nextTarget.x;
              targetEyeRef.current.y = nextTarget.y;
            }
          } catch (error) {
            if (!isRecoverableDetectorError(error) || Date.now() - lastDetectorWarningAt > 5_000) {
              console.warn(`[${logTag}] Face tracking skipped a frame:`, error);
              lastDetectorWarningAt = Date.now();
            }
            if (Date.now() - lastDetectionAt > 220) centerEyes();
          } finally {
            detectInFlight = false;
          }
        };

        const poll = async () => {
          if (cancelled) return;

          if (!hasRenderableVideoFrame(video, activeStream!)) {
            if (Date.now() - lastDetectionAt > 220) {
              centerEyes();
            }
            if (Date.now() - lastDetectionAt > 320) {
              reportTrackingSample(null, null);
            }
            pollTimeoutId = setTimeout(poll, 100);
            return;
          }

          if (video.currentTime !== lastProcessedVideoTime) {
            lastProcessedVideoTime = video.currentTime;
            await detectFrame();
          }

          if (!cancelled) {
            // Tiered adaptive polling: back off aggressively when no one is
            // near the device. Idle CPU drops ~10x versus a flat 80ms loop.
            const misses = consecutiveMissesRef.current;
            const basePoll = pollIntervalMsRef.current || 80;
            let interval: number;
            if (misses === 0) interval = basePoll;
            else if (misses <= 5) interval = Math.max(basePoll, 120);
            else if (misses <= 15) interval = 250;
            else if (misses <= backoffThreshold) interval = backoffIntervalMs;
            else interval = Math.max(backoffIntervalMs, 1000);
            pollTimeoutId = setTimeout(poll, interval);
          }
        };

        poll();
      } catch (error) {
        console.warn(`[${logTag}] Face tracking initialization failed:`, error);
        faceDetectionActiveRef.current = false;
        centerEyes();
        reportTrackingSample(null, null);
        managedStreamLease?.release();
      }
    };

    void initFaceTracking();

    return () => {
      cancelled = true;
      faceDetectionActiveRef.current = false;
      consecutiveMissesRef.current = 0;
      reportTrackingSample(null, null);
      if (pollTimeoutId) { clearTimeout(pollTimeoutId); pollTimeoutId = null; }
      if (resumeOnInteraction) {
        window.removeEventListener('touchstart', resumeOnInteraction);
        window.removeEventListener('mousedown', resumeOnInteraction);
      }
      if (cameraVideoRef.current) {
        cameraVideoRef.current.pause();
        cameraVideoRef.current.srcObject = null;
        if (cameraVideoRef.current.parentNode) {
          cameraVideoRef.current.parentNode.removeChild(cameraVideoRef.current);
        }
        cameraVideoRef.current = null;
      }
      managedStreamLease?.release();
      if (faceDetectionRef.current) {
        try {
          const closeResult = faceDetectionRef.current.dispose?.();
          if (closeResult && typeof closeResult.catch === 'function') closeResult.catch(() => {});
        } catch { /* ignore */ }
        faceDetectionRef.current = null;
      }
      // Release the offscreen canvas to free GPU texture memory
      if (processingCanvasRef) {
        processingCanvasRef.width = 0;
        processingCanvasRef.height = 0;
        processingCanvasRef = null;
      }
      cachedCanvasCtx = null;
    };
  }, [
    allowFaceTrackingBackgroundWork,
    applyEyeTransform,
    faceTrackingEnabled,
    isLowPower,
    registerInteraction,
    sharedVisionStream,
    userFacingCamera,
    logTag,
    backoffThreshold,
    backoffIntervalMs,
    targetEyeRef,
    currentEyeRef,
    consecutiveMissesRef,
    faceDetectionActiveRef,
  ]);
}
