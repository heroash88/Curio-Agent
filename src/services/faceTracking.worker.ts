import { FilesetResolver, FaceDetector } from '@mediapipe/tasks-vision';

interface NormalizedPoint {
  x: number;
  y: number;
}

interface NormalizedFaceBounds {
  xMin: number;
  yMin: number;
  width: number;
  height: number;
  xCenter: number;
  yCenter: number;
}

interface FaceTrackingSample {
  center: NormalizedPoint;
  bounds: NormalizedFaceBounds;
  keypoints: NormalizedPoint[];
}

const MEDIAPIPE_FACE_MODEL_PATH = '/models/blaze_face_short_range.tflite';
const MEDIAPIPE_TASKS_VISION_WASM_ROOT = '/mediapipe/wasm';
const FACE_KEYPOINT_LIMIT = 6;

let detector: any = null;

const normalizeCoordinate = (value: unknown, dimension: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value >= 0 && value <= 1) return value;
  if (dimension > 0) return value / dimension;
  return null;
};

const extractNormalizedPoint = (candidate: any, frameWidth: number, frameHeight: number): NormalizedPoint | null => {
  if (!candidate) return null;
  const normalizedX = normalizeCoordinate(candidate.x, frameWidth);
  const normalizedY = normalizeCoordinate(candidate.y, frameHeight);
  return (normalizedX === null || normalizedY === null) ? null : { x: normalizedX, y: normalizedY };
};

const extractNormalizedCenter = (box: any, frameWidth: number, frameHeight: number): NormalizedPoint | null => {
  if (!box) return null;
  if (typeof box.xCenter === 'number' && typeof box.yCenter === 'number') {
    const x = normalizeCoordinate(box.xCenter, frameWidth);
    const y = normalizeCoordinate(box.yCenter, frameHeight);
    return x === null || y === null ? null : { x, y };
  }
  return null;
};

const extractNormalizedBounds = (box: any, frameWidth: number, frameHeight: number): NormalizedFaceBounds | null => {
  if (!box) return null;
  const width = normalizeCoordinate(box.width, frameWidth);
  const height = normalizeCoordinate(box.height, frameHeight);
  if (width === null || height === null || width <= 0 || height <= 0) return null;

  if (typeof box.xCenter === 'number' && typeof box.yCenter === 'number') {
    const xCenter = normalizeCoordinate(box.xCenter, frameWidth);
    const yCenter = normalizeCoordinate(box.yCenter, frameHeight);
    if (xCenter === null || yCenter === null) return null;
    return {
      xMin: Math.max(0, Math.min(1 - width, xCenter - width / 2)),
      yMin: Math.max(0, Math.min(1 - height, yCenter - height / 2)),
      width,
      height,
      xCenter,
      yCenter,
    };
  }

  if (typeof box.xMin === 'number' && typeof box.yMin === 'number') {
    const xMin = normalizeCoordinate(box.xMin, frameWidth);
    const yMin = normalizeCoordinate(box.yMin, frameHeight);
    if (xMin === null || yMin === null) return null;
    return {
      xMin: Math.max(0, Math.min(1 - width, xMin)),
      yMin: Math.max(0, Math.min(1 - height, yMin)),
      width,
      height,
      xCenter: Math.max(0, Math.min(1, xMin + width / 2)),
      yCenter: Math.max(0, Math.min(1, yMin + height / 2)),
    };
  }

  return null;
};

const deriveBoundsFromKeypoints = (keypoints: NormalizedPoint[]): NormalizedFaceBounds | null => {
  if (!keypoints.length) return null;

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
  const xCenter = Math.max(0, Math.min(1, (minX + maxX) / 2));
  const yCenter = Math.max(0, Math.min(1, (minY + maxY) / 2));

  return {
    xMin: Math.max(0, Math.min(1 - width, xCenter - width / 2)),
    yMin: Math.max(0, Math.min(1 - height, yCenter - height / 2)),
    width,
    height,
    xCenter,
    yCenter,
  };
};

const extractFaceSample = (detection: any, width: number, height: number): FaceTrackingSample | null => {
  if (!detection) return null;
  const keypointCollections = [
    detection.keypoints,
    detection.landmarks,
    detection.locationData?.relativeKeypoints,
    detection.locationData?.keypoints,
  ];
  const keypoints = keypointCollections
    .flatMap((collection: any) => Array.isArray(collection) ? collection : [])
    .map((candidate: any) => extractNormalizedPoint(candidate, width, height))
    .filter((point: NormalizedPoint | null): point is NormalizedPoint => Boolean(point))
    .slice(0, FACE_KEYPOINT_LIMIT);

  const bounds = (
    extractNormalizedBounds(detection.relativeBoundingBox, width, height) ||
    extractNormalizedBounds(detection.boundingBox, width, height) ||
    extractNormalizedBounds(detection.locationData?.relativeBoundingBox, width, height) ||
    extractNormalizedBounds(detection.locationData?.boundingBox, width, height) ||
    deriveBoundsFromKeypoints(keypoints)
  );

  const center =
    keypoints.length >= 2
      ? { x: (keypoints[0].x + keypoints[1].x) / 2, y: (keypoints[0].y + keypoints[1].y) / 2 }
      : keypoints[0] || extractNormalizedCenter(detection.relativeBoundingBox || detection.locationData?.relativeBoundingBox, width, height) || (
        bounds ? { x: bounds.xCenter, y: bounds.yCenter } : null
      );

  if (!center || !bounds) return null;

  return {
    center,
    bounds,
    keypoints,
  };
};

const init = async () => {
  try {
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_TASKS_VISION_WASM_ROOT);
    
    detector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MEDIAPIPE_FACE_MODEL_PATH,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.5,
      minSuppressionThreshold: 0.3,
    });

    self.postMessage({ type: 'INIT_DONE' });
  } catch (error) {
    try {
      // GPU fallback
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_TASKS_VISION_WASM_ROOT);
      detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_FACE_MODEL_PATH,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
        minSuppressionThreshold: 0.3,
      });
      self.postMessage({ type: 'INIT_DONE' });
    } catch (err) {
      console.error('[FaceWorker] Init failed:', err);
      self.postMessage({ type: 'ERROR', error: String(err) });
    }
  }
};

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === 'INIT') {
    await init();
  } else if (type === 'DETECT') {
    if (!detector) return;
    const { bitmap, timestamp } = payload;
    try {
      const result = detector.detectForVideo(bitmap, timestamp);
      const sample = (result?.detections?.length)
        ? extractFaceSample(result.detections[0], bitmap.width, bitmap.height)
        : null;
      
      bitmap.close();
      
      self.postMessage({ 
        type: 'RESULT', 
        payload: { sample, timestamp } 
      });
    } catch (error) {
      self.postMessage({ type: 'ERROR', error: String(error) });
    }
  }
};
