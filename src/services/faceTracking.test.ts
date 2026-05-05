import { describe, expect, it } from 'vitest';
import {
  extractFaceCenterFromMediaPipeDetection,
  extractFaceCenterFromNativeDetections,
  getTrackingCanvasDimensions,
  hasTrackedFaceSample,
  mapFaceCenterToEyeTarget,
} from './faceTracking';

describe('faceTracking helpers', () => {
  it('picks the largest native face and normalizes its center', () => {
    const center = extractFaceCenterFromNativeDetections(
      [
        { boundingBox: { x: 20, y: 10, width: 30, height: 30 } as DOMRect },
        { boundingBox: { x: 100, y: 40, width: 120, height: 90 } as DOMRect },
      ],
      320,
      180,
    );

    expect(center).toEqual({
      x: (100 + 60) / 320,
      y: (40 + 45) / 180,
    });
  });

  it('extracts a mediapipe face center from keypoints when available', () => {
    const center = extractFaceCenterFromMediaPipeDetection(
      {
        keypoints: [
          { x: 0.3, y: 0.4 },
          { x: 0.7, y: 0.4 },
        ],
      },
      320,
      180,
    );

    expect(center).toEqual({ x: 0.5, y: 0.4 });
  });

  it('falls back to a mediapipe bounding box center when keypoints are missing', () => {
    const center = extractFaceCenterFromMediaPipeDetection(
      {
        relativeBoundingBox: {
          xMin: 0.25,
          yMin: 0.1,
          width: 0.5,
          height: 0.6,
        },
      },
      320,
      180,
    );

    expect(center).toEqual({ x: 0.5, y: 0.4 });
  });

  it('maps a face center to an eye target with mirroring', () => {
    const mirrored = mapFaceCenterToEyeTarget({ x: 0.8, y: 0.2 }, { maxMove: 20, mirrorX: true });
    const notMirrored = mapFaceCenterToEyeTarget({ x: 0.8, y: 0.2 }, { maxMove: 20, mirrorX: false });

    expect(mirrored.x).toBeLessThan(0);
    expect(notMirrored.x).toBeGreaterThan(0);
    expect(Math.abs(mirrored.y)).toBeGreaterThan(0);
  });

  it('treats a centered tracking sample as a detected face', () => {
    expect(hasTrackedFaceSample({
      center: { x: 0.5, y: 0.5 },
      bounds: {
        xMin: 0.3,
        yMin: 0.2,
        width: 0.4,
        height: 0.5,
        xCenter: 0.5,
        yCenter: 0.45,
      },
      keypoints: [],
    })).toBe(true);

    expect(hasTrackedFaceSample(null)).toBe(false);
  });

  it('downscales tracking frames while preserving aspect ratio', () => {
    expect(getTrackingCanvasDimensions(1280, 720, 320)).toEqual({ width: 320, height: 180 });
    expect(getTrackingCanvasDimensions(320, 240, 320)).toEqual({ width: 320, height: 240 });
  });
});
