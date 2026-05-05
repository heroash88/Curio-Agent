import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createFaceTrackingBackend,
  getTrackingCanvasDimensions,
  type FaceTrackingBackend,
  type FaceTrackingSample,
  type NormalizedFaceBounds,
} from '../services/faceTracking';
import { getSharedVisionStream } from '../services/emotionDetection';
import { acquireFaceVisionStream } from '../services/faceVisionStreamManager';

const PREVIEW_MAX_DIMENSION = 160;
const PREVIEW_POLL_INTERVAL_MS = 120;

type ManagedLease = Awaited<ReturnType<typeof acquireFaceVisionStream>>;

type RunWithFaceReadyOptions<T> = {
  minFaceStableMs: number;
  timeoutMs?: number;
  task: (stream: MediaStream) => Promise<T>;
};

type UseFacePreviewSessionOptions = {
  preferredStream?: MediaStream | null;
};

type UseFacePreviewSessionResult = {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  previewStream: MediaStream | null;
  previewBusy: boolean;
  previewOpen: boolean;
  previewReady: boolean;
  faceDetected: boolean;
  faceBounds: NormalizedFaceBounds | null;
  faceStableMs: number;
  openPreview: () => Promise<MediaStream>;
  closePreview: () => void;
  runWithFaceReady: <T>(options: RunWithFaceReadyOptions<T>) => Promise<T>;
};

const hasRenderableVideoFrame = (
  video: HTMLVideoElement,
  stream: MediaStream | null,
) => {
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
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  const requestVideoFrameCallback = (
    video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number;
    }
  ).requestVideoFrameCallback;

  while (Date.now() < deadline) {
    if (hasRenderableVideoFrame(video, stream)) {
      return true;
    }

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

export const useFacePreviewSession = ({
  preferredStream = null,
}: UseFacePreviewSessionOptions = {}): UseFacePreviewSessionResult => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const managedLeaseRef = useRef<ManagedLease | null>(null);
  const usingPreferredStreamRef = useRef(false);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const faceDetectedSinceRef = useRef<number | null>(null);
  const faceDetectedRef = useRef(false);

  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceBounds, setFaceBounds] = useState<NormalizedFaceBounds | null>(null);
  const [faceStableMs, setFaceStableMs] = useState(0);

  const syncFaceState = useCallback((sample: FaceTrackingSample | null) => {
    const nextDetected = Boolean(sample);
    faceDetectedRef.current = nextDetected;
    setFaceDetected(nextDetected);
    setFaceBounds(sample?.bounds ?? null);

    if (nextDetected) {
      if (faceDetectedSinceRef.current === null) {
        faceDetectedSinceRef.current = Date.now();
      }
      setFaceStableMs(Math.max(0, Date.now() - faceDetectedSinceRef.current));
      return;
    }

    faceDetectedSinceRef.current = null;
    setFaceStableMs(0);
  }, []);

  const closePreview = useCallback(() => {
    managedLeaseRef.current?.release();
    managedLeaseRef.current = null;
    usingPreferredStreamRef.current = false;
    previewStreamRef.current = null;
    setPreviewStream(null);
    setPreviewBusy(false);
    setPreviewReady(false);
    syncFaceState(null);
  }, [syncFaceState]);

  const openPreview = useCallback(async (): Promise<MediaStream> => {
    const sharedStream = getSharedVisionStream(preferredStream);
    if (sharedStream) {
      usingPreferredStreamRef.current = true;
      previewStreamRef.current = sharedStream;
      setPreviewStream(sharedStream);
      return sharedStream;
    }

    if (!managedLeaseRef.current) {
      managedLeaseRef.current = await acquireFaceVisionStream();
    }

    usingPreferredStreamRef.current = false;
    previewStreamRef.current = managedLeaseRef.current.stream;
    setPreviewStream(managedLeaseRef.current.stream);
    return managedLeaseRef.current.stream;
  }, [preferredStream]);

  const waitForFaceReady = useCallback(async (
    minFaceStableMs: number,
    timeoutMs: number,
  ): Promise<void> => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const faceDetectedSince = faceDetectedSinceRef.current;
      if (faceDetectedSince !== null && Date.now() - faceDetectedSince >= minFaceStableMs) {
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 80));
    }

    throw new Error('No face detected yet. Center your face inside the guide and try again.');
  }, []);

  const runWithFaceReady = useCallback(async <T,>({
    minFaceStableMs,
    timeoutMs = 8_000,
    task,
  }: RunWithFaceReadyOptions<T>): Promise<T> => {
    const stream = await openPreview();
    await waitForFaceReady(minFaceStableMs, timeoutMs);
    setPreviewBusy(true);

    try {
      return await task(stream);
    } finally {
      setPreviewBusy(false);
    }
  }, [openPreview, waitForFaceReady]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !previewStream) {
      if (video) {
        video.pause();
        video.srcObject = null;
      }
      setPreviewReady(false);
      return;
    }

    let cancelled = false;

    video.srcObject = previewStream;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    void video.play().catch(() => {});

    void waitForRenderableVideoFrame(video, previewStream, 3_000).then((ready) => {
      if (!cancelled) {
        setPreviewReady(ready);
      }
    });

    return () => {
      cancelled = true;
      video.pause();
      video.srcObject = null;
      setPreviewReady(false);
    };
  }, [previewStream]);

  useEffect(() => {
    if (!previewStream || previewBusy || !previewReady) {
      if (!previewBusy) {
        syncFaceState(null);
      }
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    let cancelled = false;
    let detectInFlight = false;
    let lastVideoTime = -1;
    let pollTimeoutId: number | null = null;
    let backend: FaceTrackingBackend | null = null;
    const processingCanvas = document.createElement('canvas');
    let cachedCanvasContext: CanvasRenderingContext2D | null = null;

    const startPreviewDetection = async () => {
      backend = await createFaceTrackingBackend();
      if (cancelled) {
        void backend.dispose?.();
        backend = null;
        return;
      }

      const detectFrame = async () => {
        if (
          cancelled ||
          detectInFlight ||
          !hasRenderableVideoFrame(video, previewStream)
        ) {
          return;
        }

        const { width, height } = getTrackingCanvasDimensions(
          video.videoWidth,
          video.videoHeight,
          PREVIEW_MAX_DIMENSION,
        );

        if (!width || !height) {
          return;
        }

        if (processingCanvas.width !== width || processingCanvas.height !== height) {
          processingCanvas.width = width;
          processingCanvas.height = height;
          cachedCanvasContext = null;
        }

        if (!cachedCanvasContext) {
          cachedCanvasContext = processingCanvas.getContext('2d', { alpha: false });
        }

        if (!cachedCanvasContext) {
          return;
        }

        cachedCanvasContext.drawImage(video, 0, 0, processingCanvas.width, processingCanvas.height);

        detectInFlight = true;
        try {
          if (!backend) {
            return;
          }
          const sample = await backend.detect(processingCanvas, performance.now());
          if (!cancelled) {
            syncFaceState(sample);
          }
        } catch (error) {
          console.warn('[FacePreview] Preview detection skipped a frame:', error);
        } finally {
          detectInFlight = false;
        }
      };

      const poll = async () => {
        if (cancelled) {
          return;
        }

        if (hasRenderableVideoFrame(video, previewStream) && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          await detectFrame();
        }

        if (!cancelled) {
          pollTimeoutId = window.setTimeout(poll, PREVIEW_POLL_INTERVAL_MS);
        }
      };

      await poll();

    };
    void startPreviewDetection();

    return () => {
      cancelled = true;
      if (pollTimeoutId !== null) {
        window.clearTimeout(pollTimeoutId);
      }
      processingCanvas.width = 0;
      processingCanvas.height = 0;
      if (backend) {
        void backend.dispose?.();
      }
    };
  }, [previewBusy, previewReady, previewStream, syncFaceState]);

  useEffect(() => {
    return () => {
      closePreview();
    };
  }, [closePreview]);

  return {
    videoRef,
    previewStream,
    previewBusy,
    previewOpen: Boolean(previewStream),
    previewReady,
    faceDetected,
    faceBounds,
    faceStableMs,
    openPreview,
    closePreview,
    runWithFaceReady,
  };
};
