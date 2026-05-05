import { canvasToJpegBase64Data } from '../../utils/blobEncoding';
import type { LLMImageInput, LLMProvider, LLMVisionInput } from './llmProvider';

export interface CameraSnapshot extends LLMImageInput {
  width: number;
  height: number;
}

import { requestElectronMediaAccess } from '../../utils/electronMediaAccess';

export interface CameraCaptureOptions {
  facingMode?: 'user' | 'environment';
  maxDimension?: number;
  quality?: number;
}

export interface CameraSnapshotDependencies {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  captureFrameFromStream?: (
    stream: MediaStream,
    options: CameraCaptureOptions,
  ) => Promise<CameraSnapshot>;
}

const waitForVideoFrame = async (
  video: HTMLVideoElement,
  timeoutMs = 800,
): Promise<void> => {
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
    return;
  }

  const requestVideoFrameCallback = (
    video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number;
    }
  ).requestVideoFrameCallback;

  if (typeof requestVideoFrameCallback === 'function') {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Timed out waiting for a camera frame.'));
        }
      }, timeoutMs);

      requestVideoFrameCallback.call(video, () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          resolve();
        }
      });
    });
    return;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 16));
  }

  throw new Error('Timed out waiting for a camera frame.');
};

export const captureFrameFromStream = async (
  stream: MediaStream,
  options: CameraCaptureOptions = {},
): Promise<CameraSnapshot> => {
  if (typeof document === 'undefined') {
    throw new Error('Camera capture requires a browser document.');
  }

  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  const maxDimension = options.maxDimension ?? 640;
  const quality = options.quality ?? 0.72;

  try {
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    video.srcObject = stream;
    await video.play();
    await waitForVideoFrame(video);

    const scale = video.videoWidth > maxDimension || video.videoHeight > maxDimension
      ? Math.min(maxDimension / video.videoWidth, maxDimension / video.videoHeight)
      : 1;

    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to create a canvas context for camera capture.');
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64Data = await canvasToJpegBase64Data(canvas, quality);
    if (!base64Data) {
      throw new Error('Failed to encode the camera frame as JPEG.');
    }

    return {
      mimeType: 'image/jpeg',
      base64Data,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    video.pause();
    video.srcObject = null;
  }
};

const defaultGetUserMedia = async (
  constraints: MediaStreamConstraints,
): Promise<MediaStream> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera capture is not supported in this browser.');
  }
  const nativeAccess = await requestElectronMediaAccess('camera');
  if (!nativeAccess) {
    throw new Error('Camera access was not granted.');
  }

  return navigator.mediaDevices.getUserMedia(constraints);
};

export const captureSingleCameraFrame = async (
  options: CameraCaptureOptions = {},
  dependencies: CameraSnapshotDependencies = {},
): Promise<CameraSnapshot> => {
  const getUserMedia = dependencies.getUserMedia ?? defaultGetUserMedia;
  const capture = dependencies.captureFrameFromStream ?? captureFrameFromStream;

  const stream = await getUserMedia({
    video: {
      facingMode: { ideal: options.facingMode ?? 'environment' },
      width: { ideal: 960 },
      height: { ideal: 720 },
    },
    audio: false,
  });

  try {
    return await capture(stream, options);
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
};

export const describeCameraSnapshot = async (
  provider: LLMProvider,
  input: {
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
  },
  dependencies?: CameraSnapshotDependencies,
): Promise<string> => {
  if (!provider.generateVisionText) {
    throw new Error(`Provider "${provider.name}" does not support image input.`);
  }

  const image = await captureSingleCameraFrame({}, dependencies);
  const visionInput: LLMVisionInput = {
    prompt: input.prompt,
    systemPrompt: input.systemPrompt,
    temperature: input.temperature,
    image,
  };

  return provider.generateVisionText(visionInput);
};
