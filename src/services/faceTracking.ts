export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface NormalizedFaceBounds {
  xMin: number;
  yMin: number;
  width: number;
  height: number;
  xCenter: number;
  yCenter: number;
}

export interface FaceTrackingSample {
  center: NormalizedPoint;
  bounds: NormalizedFaceBounds;
  keypoints: NormalizedPoint[];
  confidence?: number | null;
}

export interface FaceTrackingBackend {
  kind: 'native' | 'mediapipe';
  detect(source: HTMLCanvasElement, timestampMs: number): Promise<FaceTrackingSample | null>;
  dispose(): Promise<void> | void;
}

export const hasTrackedFaceSample = (
  sample: FaceTrackingSample | null | undefined,
): boolean =>
  Boolean(
    sample &&
    Number.isFinite(sample.center?.x) &&
    Number.isFinite(sample.center?.y),
  );

interface NativeDetectedFace {
  boundingBox?: DOMRectReadOnly | DOMRect;
}

interface NativeFaceDetectorInstance {
  detect(input: CanvasImageSource): Promise<NativeDetectedFace[]>;
}

interface NativeFaceDetectorConstructor {
  new (options?: { fastMode?: boolean; maxDetectedFaces?: number }): NativeFaceDetectorInstance;
}

interface MediaPipeDetection {
  boundingBox?: Record<string, unknown>;
  relativeBoundingBox?: Record<string, unknown>;
  locationData?: {
    boundingBox?: Record<string, unknown>;
    relativeBoundingBox?: Record<string, unknown>;
    keypoints?: Array<Record<string, unknown>>;
    relativeKeypoints?: Array<Record<string, unknown>>;
  };
  keypoints?: Array<Record<string, unknown>>;
  landmarks?: Array<Record<string, unknown>>;
}

interface MediaPipeTasksVisionResolver {
  forVisionTasks(basePath: string): Promise<unknown>;
}

interface MediaPipeTasksFaceDetectorInstance {
  detectForVideo(
    input: CanvasImageSource,
    timestampMs: number,
  ): {
    detections?: MediaPipeDetection[];
  };
  close?: () => Promise<void> | void;
}

interface MediaPipeTasksFaceDetectorConstructor {
  createFromOptions(
    vision: unknown,
    options: {
      baseOptions: {
        modelAssetPath: string;
        delegate?: 'CPU' | 'GPU';
      };
      runningMode: 'VIDEO';
      minDetectionConfidence: number;
      minSuppressionThreshold?: number;
    },
  ): Promise<MediaPipeTasksFaceDetectorInstance>;
}

type WindowWithFaceTrackingBackends = Window &
  typeof globalThis & {
    FaceDetector?: NativeFaceDetectorConstructor;
  };

const MEDIAPIPE_TASKS_VISION_WASM_ROOT = '/mediapipe/wasm';
const MEDIAPIPE_FACE_MODEL_PATH = '/models/blaze_face_short_range.tflite';
const FACE_KEYPOINT_LIMIT = 6;

let cachedNativeFaceDetector: NativeFaceDetectorConstructor | null | undefined;
let mediaPipeTasksVisionModulePromise: Promise<{
  FilesetResolver: MediaPipeTasksVisionResolver;
  FaceDetector: MediaPipeTasksFaceDetectorConstructor;
}> | null = null;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeCoordinate = (value: unknown, dimension: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  if (value >= 0 && value <= 1) {
    return value;
  }

  if (dimension > 0) {
    return value / dimension;
  }

  return null;
};

const extractNormalizedPoint = (
  candidate: Record<string, unknown> | null | undefined,
  frameWidth: number,
  frameHeight: number,
): NormalizedPoint | null => {
  if (!candidate) {
    return null;
  }

  const normalizedX = normalizeCoordinate(candidate.x, frameWidth);
  const normalizedY = normalizeCoordinate(candidate.y, frameHeight);

  if (normalizedX === null || normalizedY === null) {
    return null;
  }

  return { x: normalizedX, y: normalizedY };
};

const extractNormalizedBounds = (
  box: Record<string, unknown> | null | undefined,
  frameWidth: number,
  frameHeight: number,
): NormalizedFaceBounds | null => {
  if (!box) {
    return null;
  }

  const width = normalizeCoordinate(box.width, frameWidth);
  const height = normalizeCoordinate(box.height, frameHeight);

  if (width === null || height === null || width <= 0 || height <= 0) {
    return null;
  }

  if (typeof box.xCenter === 'number' && typeof box.yCenter === 'number') {
    const xCenter = normalizeCoordinate(box.xCenter, frameWidth);
    const yCenter = normalizeCoordinate(box.yCenter, frameHeight);
    if (xCenter === null || yCenter === null) {
      return null;
    }
    return {
      xMin: clamp(xCenter - width / 2, 0, Math.max(0, 1 - width)),
      yMin: clamp(yCenter - height / 2, 0, Math.max(0, 1 - height)),
      width,
      height,
      xCenter: clamp(xCenter, 0, 1),
      yCenter: clamp(yCenter, 0, 1),
    };
  }

  if (typeof box.xMin === 'number' && typeof box.yMin === 'number') {
    const xMin = normalizeCoordinate(box.xMin, frameWidth);
    const yMin = normalizeCoordinate(box.yMin, frameHeight);
    if (xMin === null || yMin === null) {
      return null;
    }
    return {
      xMin: clamp(xMin, 0, Math.max(0, 1 - width)),
      yMin: clamp(yMin, 0, Math.max(0, 1 - height)),
      width,
      height,
      xCenter: clamp(xMin + width / 2, 0, 1),
      yCenter: clamp(yMin + height / 2, 0, 1),
    };
  }

  if (typeof box.xmin === 'number' && typeof box.ymin === 'number') {
    const xMin = normalizeCoordinate(box.xmin, frameWidth);
    const yMin = normalizeCoordinate(box.ymin, frameHeight);
    if (xMin === null || yMin === null) {
      return null;
    }
    return {
      xMin: clamp(xMin, 0, Math.max(0, 1 - width)),
      yMin: clamp(yMin, 0, Math.max(0, 1 - height)),
      width,
      height,
      xCenter: clamp(xMin + width / 2, 0, 1),
      yCenter: clamp(yMin + height / 2, 0, 1),
    };
  }

  if (typeof box.originX === 'number' && typeof box.originY === 'number') {
    const xMin = normalizeCoordinate(box.originX, frameWidth);
    const yMin = normalizeCoordinate(box.originY, frameHeight);
    if (xMin === null || yMin === null) {
      return null;
    }
    return {
      xMin: clamp(xMin, 0, Math.max(0, 1 - width)),
      yMin: clamp(yMin, 0, Math.max(0, 1 - height)),
      width,
      height,
      xCenter: clamp(xMin + width / 2, 0, 1),
      yCenter: clamp(yMin + height / 2, 0, 1),
    };
  }

  return null;
};

const extractNormalizedKeypoints = (
  candidates: Array<Record<string, unknown>> | null | undefined,
  frameWidth: number,
  frameHeight: number,
): NormalizedPoint[] =>
  Array.isArray(candidates)
    ? candidates
      .map((candidate) => extractNormalizedPoint(candidate, frameWidth, frameHeight))
      .filter((point): point is NormalizedPoint => Boolean(point))
    : [];

const deriveBoundsFromKeypoints = (
  keypoints: NormalizedPoint[],
): NormalizedFaceBounds | null => {
  if (keypoints.length === 0) {
    return null;
  }

  let minX = keypoints[0].x;
  let minY = keypoints[0].y;
  let maxX = keypoints[0].x;
  let maxY = keypoints[0].y;

  for (const point of keypoints) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const width = Math.max(0.12, maxX - minX);
  const height = Math.max(0.12, maxY - minY);
  const xCenter = clamp((minX + maxX) / 2, 0, 1);
  const yCenter = clamp((minY + maxY) / 2, 0, 1);

  return {
    xMin: clamp(xCenter - width / 2, 0, Math.max(0, 1 - width)),
    yMin: clamp(yCenter - height / 2, 0, Math.max(0, 1 - height)),
    width,
    height,
    xCenter,
    yCenter,
  };
};

export const extractFaceTrackingSampleFromMediaPipeDetection = (
  detection: MediaPipeDetection | null | undefined,
  frameWidth: number,
  frameHeight: number,
): FaceTrackingSample | null => {
  if (!detection) {
    return null;
  }

  const keypointCollections = [
    detection.keypoints,
    detection.landmarks,
    detection.locationData?.relativeKeypoints,
    detection.locationData?.keypoints,
  ];

  const keypoints = keypointCollections
    .flatMap((collection) => extractNormalizedKeypoints(collection, frameWidth, frameHeight))
    .slice(0, FACE_KEYPOINT_LIMIT);

  const centerFromKeypoints =
    keypoints.length >= 2
      ? {
        x: (keypoints[0].x + keypoints[1].x) / 2,
        y: (keypoints[0].y + keypoints[1].y) / 2,
      }
      : keypoints[0] ?? null;

  const bounds = (
    extractNormalizedBounds(detection.relativeBoundingBox, frameWidth, frameHeight) ||
    extractNormalizedBounds(detection.boundingBox, frameWidth, frameHeight) ||
    extractNormalizedBounds(detection.locationData?.relativeBoundingBox, frameWidth, frameHeight) ||
    extractNormalizedBounds(detection.locationData?.boundingBox, frameWidth, frameHeight) ||
    deriveBoundsFromKeypoints(keypoints)
  );

  const center = centerFromKeypoints || (
    bounds
      ? { x: bounds.xCenter, y: bounds.yCenter }
      : null
  );

  if (!center || !bounds) {
    return null;
  }

  return {
    center,
    bounds,
    keypoints,
  };
};

export const extractFaceCenterFromMediaPipeDetection = (
  detection: MediaPipeDetection | null | undefined,
  frameWidth: number,
  frameHeight: number,
): NormalizedPoint | null => {
  const sample = extractFaceTrackingSampleFromMediaPipeDetection(
    detection,
    frameWidth,
    frameHeight,
  );
  return sample?.center ?? null;
};

export const extractFaceTrackingSampleFromNativeDetections = (
  detections: NativeDetectedFace[] | null | undefined,
  frameWidth: number,
  frameHeight: number,
): FaceTrackingSample | null => {
  if (!Array.isArray(detections) || detections.length === 0 || frameWidth <= 0 || frameHeight <= 0) {
    return null;
  }

  const face = detections
    .filter((candidate) => candidate?.boundingBox)
    .sort((left, right) => {
      const leftArea = (left.boundingBox?.width ?? 0) * (left.boundingBox?.height ?? 0);
      const rightArea = (right.boundingBox?.width ?? 0) * (right.boundingBox?.height ?? 0);
      return rightArea - leftArea;
    })[0];

  if (!face?.boundingBox) {
    return null;
  }

  const xMin = clamp(face.boundingBox.x / frameWidth, 0, 1);
  const yMin = clamp(face.boundingBox.y / frameHeight, 0, 1);
  const width = clamp(face.boundingBox.width / frameWidth, 0, 1);
  const height = clamp(face.boundingBox.height / frameHeight, 0, 1);

  return {
    center: {
      x: clamp(xMin + width / 2, 0, 1),
      y: clamp(yMin + height / 2, 0, 1),
    },
    bounds: {
      xMin,
      yMin,
      width,
      height,
      xCenter: clamp(xMin + width / 2, 0, 1),
      yCenter: clamp(yMin + height / 2, 0, 1),
    },
    keypoints: [],
  };
};

export const extractFaceCenterFromNativeDetections = (
  detections: NativeDetectedFace[] | null | undefined,
  frameWidth: number,
  frameHeight: number,
): NormalizedPoint | null => {
  const sample = extractFaceTrackingSampleFromNativeDetections(
    detections,
    frameWidth,
    frameHeight,
  );
  return sample?.center ?? null;
};

export const mapFaceCenterToEyeTarget = (
  center: NormalizedPoint,
  options?: {
    maxMove?: number;
    mirrorX?: boolean;
    yScale?: number;
  },
) => {
  const maxMove = options?.maxMove ?? 20;
  const mirrorX = options?.mirrorX ?? true;
  const yScale = options?.yScale ?? 2.4;
  const xScale = 2.6;

  const centeredX = (center.x - 0.5) * maxMove * xScale;
  const centeredY = (center.y - 0.5) * maxMove * yScale;

  return {
    x: clamp(mirrorX ? -centeredX : centeredX, -maxMove, maxMove),
    y: clamp(centeredY, -maxMove, maxMove),
  };
};

export const getTrackingCanvasDimensions = (
  frameWidth: number,
  frameHeight: number,
  maxDimension: number,
) => {
  if (frameWidth <= 0 || frameHeight <= 0) {
    return { width: 0, height: 0 };
  }

  const scale =
    frameWidth > maxDimension || frameHeight > maxDimension
      ? Math.min(maxDimension / frameWidth, maxDimension / frameHeight)
      : 1;

  return {
    width: Math.max(1, Math.round(frameWidth * scale)),
    height: Math.max(1, Math.round(frameHeight * scale)),
  };
};

const getNativeFaceDetectorConstructor = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  if (cachedNativeFaceDetector !== undefined) {
    return cachedNativeFaceDetector;
  }

  const candidate = (window as WindowWithFaceTrackingBackends).FaceDetector;
  cachedNativeFaceDetector =
    typeof candidate === 'function' && typeof candidate.prototype?.detect === 'function'
      ? (candidate as NativeFaceDetectorConstructor)
      : null;

  return cachedNativeFaceDetector;
};

const loadMediaPipeTasksVisionModule = async () => {
  if (!mediaPipeTasksVisionModulePromise) {
    mediaPipeTasksVisionModulePromise = import('@mediapipe/tasks-vision')
      .then((module) => ({
        FilesetResolver: module.FilesetResolver as MediaPipeTasksVisionResolver,
        FaceDetector: module.FaceDetector as unknown as MediaPipeTasksFaceDetectorConstructor,
      }))
      .catch((error) => {
        mediaPipeTasksVisionModulePromise = null;
        throw error;
      });
  }

  return await mediaPipeTasksVisionModulePromise;
};

const createNativeBackend = async (): Promise<FaceTrackingBackend | null> => {
  const NativeFaceDetector = getNativeFaceDetectorConstructor();
  if (!NativeFaceDetector) {
    return null;
  }

  const detector = new NativeFaceDetector({
    fastMode: true,
    maxDetectedFaces: 1,
  });

  return {
    kind: 'native',
    async detect(source) {
      return extractFaceTrackingSampleFromNativeDetections(
        await detector.detect(source),
        source.width,
        source.height,
      );
    },
    dispose() {},
  };
};

const createMediaPipeBackend = async (): Promise<FaceTrackingBackend> => {
  const { FilesetResolver, FaceDetector: TaskFaceDetector } = await loadMediaPipeTasksVisionModule();

  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_TASKS_VISION_WASM_ROOT);
  const createDetector = async (delegate?: 'CPU' | 'GPU') =>
    await TaskFaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MEDIAPIPE_FACE_MODEL_PATH,
        ...(delegate ? { delegate } : {}),
      },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.5,
      minSuppressionThreshold: 0.3,
    });

  let detector: MediaPipeTasksFaceDetectorInstance;
  try {
    detector = await createDetector('GPU');
  } catch {
    detector = await createDetector('CPU');
  }

  return {
    kind: 'mediapipe',
    async detect(source, timestampMs) {
      const result = detector.detectForVideo(source, timestampMs);
      const detections = Array.isArray(result?.detections) ? result.detections : [];
      return detections.length
        ? extractFaceTrackingSampleFromMediaPipeDetection(detections[0], source.width, source.height)
        : null;
    },
    async dispose() {
      const closeResult = detector.close?.();
      if (closeResult && typeof (closeResult as Promise<void>).then === 'function') {
        await closeResult;
      }
    },
  };
};

const createWorkerBackend = async (): Promise<FaceTrackingBackend | null> => {
  if (typeof Worker === 'undefined') return null;
  // Worker path requires OffscreenCanvas.transferToImageBitmap to avoid
  // per-frame createImageBitmap allocations (main CPU/GC hotspot on Pi).
  if (typeof OffscreenCanvas === 'undefined') return null;

  try {
    const worker = new Worker('/faceTrackingWorker.bundle.js');

    let resolveInit: (val: void) => void;
    let rejectInit: (err: any) => void;
    const initPromise = new Promise<void>((resolve, reject) => {
      resolveInit = resolve;
      rejectInit = reject;
    });

    let pendingDetection: { resolve: (val: FaceTrackingSample | null) => void; reject: (err: any) => void } | null = null;

    worker.onmessage = (e) => {
      const { type, payload, error } = e.data;
      if (type === 'INIT_DONE') {
        resolveInit();
      } else if (type === 'RESULT') {
        if (pendingDetection) {
          pendingDetection.resolve(payload.sample ?? null);
          pendingDetection = null;
        }
      } else if (type === 'ERROR') {
        if (pendingDetection) {
          pendingDetection.reject(new Error(error));
          pendingDetection = null;
        } else {
          rejectInit(new Error(error));
        }
      }
    };

    worker.postMessage({ type: 'INIT' });
    await initPromise;

    // Pooled OffscreenCanvas reused every frame. transferToImageBitmap
    // produces a detached bitmap without allocating a new backing buffer,
    // unlike createImageBitmap which allocates + copies every call.
    let pooledCanvas: OffscreenCanvas | null = null;
    let pooledCtx: OffscreenCanvasRenderingContext2D | null = null;

    return {
      kind: 'mediapipe',
      async detect(source, timestampMs) {
        if (pendingDetection) return null; // Already in flight

        try {
          if (!pooledCanvas || pooledCanvas.width !== source.width || pooledCanvas.height !== source.height) {
            pooledCanvas = new OffscreenCanvas(source.width, source.height);
            pooledCtx = pooledCanvas.getContext('2d', { alpha: false });
          }
          if (!pooledCtx) return null;
          pooledCtx.drawImage(source, 0, 0, pooledCanvas.width, pooledCanvas.height);
          const bitmap = pooledCanvas.transferToImageBitmap();

          return new Promise((resolve, reject) => {
            pendingDetection = { resolve, reject };
            worker.postMessage(
              {
                type: 'DETECT',
                payload: { bitmap, timestamp: timestampMs },
              },
              [bitmap],
            );
          });
        } catch (error) {
          console.error('[FaceTracking] Detection failed:', error);
          return null;
        }
      },
      async dispose() {
        worker.terminate();
        pooledCanvas = null;
        pooledCtx = null;
      },
    };
  } catch (error) {
    console.warn('[FaceTracking] Failed to spawn worker:', error);
    return null;
  }
};

export const createFaceTrackingBackend = async (): Promise<FaceTrackingBackend> => {
  // Worker preferred: detection runs off the main thread, freeing the
  // render loop for face animation. Native FaceDetector (Safari) blocks
  // the main thread and is only used when no worker is available.
  const workerBackend = await createWorkerBackend();
  if (workerBackend) return workerBackend;

  const nativeBackend = await createNativeBackend();
  if (nativeBackend) return nativeBackend;

  return await createMediaPipeBackend();
};
