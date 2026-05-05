import {
    createFaceTrackingBackend,
    getTrackingCanvasDimensions,
} from './faceTracking';
import type { FaceProfile } from './faceProfileStore';

// v2: 16x16 grid + Sobel gradient magnitudes (4 bins per cell) for lighting
// and angle robustness. v1 profiles (64-dim luminance) are filtered out at
// match time and surfaced as "needs re-enrollment" in the UI.
const EMBEDDING_VERSION = 2;
const FACE_DESCRIPTOR_GRID_SIZE = 16;
const FACE_DESCRIPTOR_PADDING = 0.18;
const FACE_KEYPOINT_LIMIT = 6;
// Expose for profile store/UI so they can detect stale v1 embeddings.
export const CURRENT_FACE_EMBEDDING_VERSION = EMBEDDING_VERSION;
const MIN_FACE_SIZE_RATIO = 0.12;
const DEFAULT_TRACKING_MAX_DIMENSION = 192;
const ENROLLMENT_SAMPLE_GAP_MS = 240;
const IDENTIFY_SAMPLE_GAP_MS = 180;
// Enrollment intentionally spans ~15 seconds so users can naturally cycle
// through several head angles (straight, left, right, up, down, smile)
// without us storing raw frames long-term.
export const FACE_ENROLLMENT_DURATION_MS = 15_000;
const FACE_IDENTIFY_DURATION_MS = 1_800;
const MIN_ENROLLMENT_SAMPLES = 8;
// MAX kept generous so the time budget (FACE_ENROLLMENT_DURATION_MS) is the
// real stopping condition. With ~240ms gap + detect latency we top out around
// 35-45 frames in 12.5s on a decent device -- well under this cap.
const MAX_ENROLLMENT_SAMPLES = 80;
const MIN_IDENTIFY_SAMPLES = 3;
// Let identify collect a slightly bigger window so its averaged template
// sits in a similar distribution to the enrollment template. Cosine
// comparing 6-frame vs 30-frame averages was too noisy.
const MAX_IDENTIFY_SAMPLES = 12;
// Tuned for home use with a small, known set of people (2-5 household members).
// Threshold lowered so off-angle / slightly-different-lighting frames still
// match the enrolled person. Margin kept meaningful so Curio still refuses
// to guess when two household members score close together.
// Passive monitoring (runs every 1.5-3s during live sessions) stays stricter
// because a false positive there silently swaps the active speaker identity.
const RECOGNITION_THRESHOLD = 0.62;
const RECOGNITION_MARGIN = 0.045;
const PASSIVE_RECOGNITION_THRESHOLD = 0.72;
const PASSIVE_RECOGNITION_MARGIN = 0.055;

export interface FaceKeypoint {
    x: number;
    y: number;
}

export interface FaceBounds {
    xMin: number;
    yMin: number;
    width: number;
    height: number;
    xCenter: number;
    yCenter: number;
}

export interface FaceGeometrySnapshot {
    center: FaceKeypoint;
    bounds: FaceBounds;
    keypoints: FaceKeypoint[];
    confidence?: number | null;
}

export interface FaceRecognitionMatch {
    profileId: string;
    profileName: string;
    score: number;
    confidence: number;
}

type CollectFaceEmbeddingOptions = {
    durationMs: number;
    minSamples: number;
    maxSamples: number;
    sampleGapMs: number;
};

type MatchFaceOptions = {
    threshold?: number;
    margin?: number;
};

export type CreateFaceProfileOptions = {
    name: string;
    existingProfile?: FaceProfile | null;
};

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

const clamp01 = (value: number): number => clamp(value, 0, 1);

const normalizeName = (name: string): string => name.trim() || 'Face Profile';

const roundToThreeDecimals = (value: number): number => Math.round(value * 1000) / 1000;

const createFaceProfileId = (name: string): string => {
    const base = normalizeName(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'face-profile';
    const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
    return `face-${base}-${suffix}`;
};

const normalizeEmbedding = (embedding: Float32Array): Float32Array => {
    let magnitude = 0;
    for (let index = 0; index < embedding.length; index += 1) {
        magnitude += embedding[index] * embedding[index];
    }

    const norm = Math.sqrt(magnitude) || 1;
    const normalized = new Float32Array(embedding.length);
    for (let index = 0; index < embedding.length; index += 1) {
        normalized[index] = embedding[index] / norm;
    }
    return normalized;
};

const quantizeEmbedding = (embedding: Float32Array): number[] => {
    const quantized = new Array<number>(embedding.length);
    for (let index = 0; index < embedding.length; index += 1) {
        quantized[index] = clamp(Math.round(embedding[index] * 127), -127, 127);
    }
    return quantized;
};

const dequantizeEmbedding = (embedding: number[]): Float32Array => {
    const dequantized = new Float32Array(embedding.length);
    for (let index = 0; index < embedding.length; index += 1) {
        dequantized[index] = (Number(embedding[index]) || 0) / 127;
    }
    return normalizeEmbedding(dequantized);
};

const averageEmbeddings = (embeddings: Float32Array[]): Float32Array => {
    if (embeddings.length === 0) {
        return new Float32Array();
    }

    // Each input embedding is already L2-normalized by createFaceEmbeddingFromFrame,
    // so averaging gives a unit-ish mean vector that's stable regardless of
    // how many frames the caller collected. This is the standard
    // template-averaging approach used by FaceNet-style pipelines and keeps
    // enroll (N=20-40) and identify (N=6-10) templates comparable.
    const dimension = embeddings[0].length;
    const combined = new Float32Array(dimension);

    for (const embedding of embeddings) {
        for (let index = 0; index < dimension; index += 1) {
            combined[index] += embedding[index] ?? 0;
        }
    }

    for (let index = 0; index < dimension; index += 1) {
        combined[index] /= embeddings.length;
    }

    return normalizeEmbedding(combined);
};

const blendEmbeddings = (
    existingEmbedding: number[],
    nextEmbedding: Float32Array,
    existingSampleCount: number,
): number[] => {
    const previous = dequantizeEmbedding(existingEmbedding);
    const blended = new Float32Array(Math.max(previous.length, nextEmbedding.length));
    const previousWeight = Math.max(1, existingSampleCount);
    const totalWeight = previousWeight + 1;

    for (let index = 0; index < blended.length; index += 1) {
        blended[index] = (
            ((previous[index] ?? 0) * previousWeight) +
            (nextEmbedding[index] ?? 0)
        ) / totalWeight;
    }

    return quantizeEmbedding(normalizeEmbedding(blended));
};

const cosineSimilarity = (left: Float32Array, right: Float32Array): number => {
    const length = Math.min(left.length, right.length);
    if (length === 0) {
        return 0;
    }

    let dot = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;

    for (let index = 0; index < length; index += 1) {
        dot += left[index] * right[index];
        leftMagnitude += left[index] * left[index];
        rightMagnitude += right[index] * right[index];
    }

    const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
    if (!denominator) {
        return 0;
    }

    return dot / denominator;
};

const isRenderableVideoFrame = (
    video: HTMLVideoElement,
    stream: MediaStream | null,
): boolean => {
    const hasLiveVideoTrack = stream
        ?.getVideoTracks()
        .some((track) => track.readyState === 'live' && track.enabled);

    if (!hasLiveVideoTrack) {
        return false;
    }
    if (video.paused || video.ended) {
        return false;
    }
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return false;
    }
    if (video.videoWidth <= 1 || video.videoHeight <= 1) {
        return false;
    }
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
        if (isRenderableVideoFrame(video, stream)) {
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

const normalizeBounds = (bounds: FaceBounds): FaceBounds => {
    const width = clamp(bounds.width, 0, 1);
    const height = clamp(bounds.height, 0, 1);
    const xMin = clamp(bounds.xCenter - width / 2, 0, Math.max(0, 1 - width));
    const yMin = clamp(bounds.yCenter - height / 2, 0, Math.max(0, 1 - height));
    const xCenter = clamp(xMin + width / 2, 0, 1);
    const yCenter = clamp(yMin + height / 2, 0, 1);

    return {
        xMin,
        yMin,
        width,
        height,
        xCenter,
        yCenter,
    };
};

const GRADIENT_BIN_COUNT = 4;

/**
 * Build a face descriptor from the cropped grayscale patch:
 *   1. Z-normalized luminance per pixel (illumination-invariant base).
 *   2. Cell-wise Sobel gradient magnitudes binned into 4 orientations.
 * Total length = (GRID^2) + (GRID^2 * 4) dims. For a 16x16 grid that's
 * 256 + 1024 = 1280 dims before the keypoint tail is appended.
 */
const collectDescriptorFromImageData = (imageData: ImageData): Float32Array => {
    const width = imageData.width;
    const height = imageData.height;
    const pixelCount = width * height;
    const luminance = new Float32Array(pixelCount);
    let mean = 0;

    for (let index = 0; index < pixelCount; index += 1) {
        const offset = index * 4;
        const value = (
            (imageData.data[offset] * 0.299) +
            (imageData.data[offset + 1] * 0.587) +
            (imageData.data[offset + 2] * 0.114)
        ) / 255;
        luminance[index] = value;
        mean += value;
    }

    mean /= Math.max(1, pixelCount);

    let variance = 0;
    for (let index = 0; index < pixelCount; index += 1) {
        const delta = luminance[index] - mean;
        variance += delta * delta;
    }

    const std = Math.sqrt(variance / Math.max(1, pixelCount)) || 1;
    const normalizedLuminance = new Float32Array(pixelCount);
    for (let index = 0; index < pixelCount; index += 1) {
        normalizedLuminance[index] = clamp((luminance[index] - mean) / (std * 2.5), -1, 1);
    }

    // Sobel gradients on the z-normalized luminance so contrast changes
    // don't dominate the orientation histograms.
    const gradientFeatures = new Float32Array(pixelCount * GRADIENT_BIN_COUNT);
    for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
            const idx = y * width + x;
            const gx =
                -normalizedLuminance[idx - width - 1] + normalizedLuminance[idx - width + 1]
                - 2 * normalizedLuminance[idx - 1] + 2 * normalizedLuminance[idx + 1]
                - normalizedLuminance[idx + width - 1] + normalizedLuminance[idx + width + 1];
            const gy =
                -normalizedLuminance[idx - width - 1] - 2 * normalizedLuminance[idx - width] - normalizedLuminance[idx - width + 1]
                + normalizedLuminance[idx + width - 1] + 2 * normalizedLuminance[idx + width] + normalizedLuminance[idx + width + 1];

            const magnitude = Math.hypot(gx, gy);
            if (magnitude < 1e-4) continue;

            // Map orientation to [0, GRADIENT_BIN_COUNT) -- unsigned (0..pi)
            // so opposite gradients share a bin, which is what we want for edges.
            let angle = Math.atan2(gy, gx);
            if (angle < 0) angle += Math.PI;
            const bin = Math.min(GRADIENT_BIN_COUNT - 1, Math.floor((angle / Math.PI) * GRADIENT_BIN_COUNT));
            gradientFeatures[idx * GRADIENT_BIN_COUNT + bin] = magnitude;
        }
    }

    const combined = new Float32Array(pixelCount + pixelCount * GRADIENT_BIN_COUNT);
    combined.set(normalizedLuminance, 0);
    combined.set(gradientFeatures, pixelCount);
    return combined;
};

const collectKeypointDescriptor = (geometry: FaceGeometrySnapshot): number[] => {
    const normalizedBounds = normalizeBounds(geometry.bounds);
    const scale = Math.max(normalizedBounds.width, normalizedBounds.height) || 1;
    const keypoints: number[] = [];

    for (let index = 0; index < FACE_KEYPOINT_LIMIT; index += 1) {
        const point = geometry.keypoints[index];
        if (!point) {
            keypoints.push(0, 0);
            continue;
        }

        keypoints.push(
            clamp((point.x - normalizedBounds.xCenter) / scale, -1, 1),
            clamp((point.y - normalizedBounds.yCenter) / scale, -1, 1),
        );
    }

    const pairwiseFeatures = [0, 0, 0, 0];
    if (geometry.keypoints[0] && geometry.keypoints[1]) {
        const dx = geometry.keypoints[0].x - geometry.keypoints[1].x;
        const dy = geometry.keypoints[0].y - geometry.keypoints[1].y;
        pairwiseFeatures[0] = clamp(Math.hypot(dx, dy) / scale, 0, 1);
        pairwiseFeatures[1] = clamp(dy / scale, -1, 1);
    }
    if (geometry.keypoints[2]) {
        pairwiseFeatures[2] = clamp((geometry.keypoints[2].x - normalizedBounds.xCenter) / scale, -1, 1);
        pairwiseFeatures[3] = clamp((geometry.keypoints[2].y - normalizedBounds.yCenter) / scale, -1, 1);
    }

    return [
        ...keypoints,
        ...pairwiseFeatures,
        clamp((normalizedBounds.width / Math.max(normalizedBounds.height, 1e-6)) - 1, -1, 1),
        clamp(Math.sqrt(normalizedBounds.width * normalizedBounds.height), 0, 1),
    ];
};

const getDescriptorBounds = (geometry: FaceGeometrySnapshot): FaceBounds | null => {
    const normalizedBounds = normalizeBounds(geometry.bounds);
    if (normalizedBounds.width < MIN_FACE_SIZE_RATIO || normalizedBounds.height < MIN_FACE_SIZE_RATIO) {
        return null;
    }

    const paddedWidth = clamp(normalizedBounds.width * (1 + FACE_DESCRIPTOR_PADDING * 2), 0, 1);
    const paddedHeight = clamp(normalizedBounds.height * (1 + FACE_DESCRIPTOR_PADDING * 2), 0, 1);
    const xMin = clamp(normalizedBounds.xCenter - paddedWidth / 2, 0, Math.max(0, 1 - paddedWidth));
    const yMin = clamp(normalizedBounds.yCenter - paddedHeight / 2, 0, Math.max(0, 1 - paddedHeight));

    return {
        xMin,
        yMin,
        width: paddedWidth,
        height: paddedHeight,
        xCenter: clamp(xMin + paddedWidth / 2, 0, 1),
        yCenter: clamp(yMin + paddedHeight / 2, 0, 1),
    };
};

export const createFaceEmbeddingFromFrame = (
    sourceCanvas: HTMLCanvasElement,
    geometry: FaceGeometrySnapshot,
    scratchCanvas?: HTMLCanvasElement | null,
): Float32Array | null => {
    const descriptorBounds = getDescriptorBounds(geometry);
    if (!descriptorBounds) {
        return null;
    }

    const targetCanvas = scratchCanvas ?? document.createElement('canvas');
    targetCanvas.width = FACE_DESCRIPTOR_GRID_SIZE;
    targetCanvas.height = FACE_DESCRIPTOR_GRID_SIZE;

    const context = targetCanvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
        return null;
    }

    const sourceWidth = sourceCanvas.width;
    const sourceHeight = sourceCanvas.height;

    const sx = clamp(Math.round(descriptorBounds.xMin * sourceWidth), 0, sourceWidth - 1);
    const sy = clamp(Math.round(descriptorBounds.yMin * sourceHeight), 0, sourceHeight - 1);
    const sw = clamp(
        Math.round(descriptorBounds.width * sourceWidth),
        FACE_DESCRIPTOR_GRID_SIZE,
        Math.max(FACE_DESCRIPTOR_GRID_SIZE, sourceWidth - sx),
    );
    const sh = clamp(
        Math.round(descriptorBounds.height * sourceHeight),
        FACE_DESCRIPTOR_GRID_SIZE,
        Math.max(FACE_DESCRIPTOR_GRID_SIZE, sourceHeight - sy),
    );

    context.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    context.drawImage(
        sourceCanvas,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        targetCanvas.width,
        targetCanvas.height,
    );

    const imageData = context.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
    const pixelDescriptor = collectDescriptorFromImageData(imageData);
    const keypointDescriptor = collectKeypointDescriptor(geometry);
    const combined = new Float32Array(pixelDescriptor.length + keypointDescriptor.length);

    // Scale the keypoint tail so it survives the final L2 normalization. Without
    // this, keypoints contribute <1% of the vector's energy and are effectively
    // ignored when matching. Matching the sqrt(pixelLen/keypointLen) ratio
    // gives both halves roughly equal L2 weight after normalization.
    const keypointScale = keypointDescriptor.length > 0
        ? Math.sqrt(pixelDescriptor.length / keypointDescriptor.length)
        : 1;

    combined.set(pixelDescriptor, 0);
    for (let i = 0; i < keypointDescriptor.length; i += 1) {
        combined[pixelDescriptor.length + i] = keypointDescriptor[i] * keypointScale;
    }

    return normalizeEmbedding(combined);
};

const createVideoElement = (stream: MediaStream): HTMLVideoElement => {
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
    video.srcObject = stream;
    document.body.appendChild(video);
    return video;
};

const collectFaceEmbeddingsFromStream = async (
    stream: MediaStream,
    options: CollectFaceEmbeddingOptions,
): Promise<Float32Array[]> => {
    const video = createVideoElement(stream);
    const backend = await createFaceTrackingBackend();
    const processingCanvas = document.createElement('canvas');
    const descriptorCanvas = document.createElement('canvas');
    let descriptors: Float32Array[] = [];

    try {
        try {
            await video.play();
        } catch {
            // Safari may gate playback until a gesture. If frames never become
            // available, the enrollment/identify flow will fail gracefully.
        }

        const frameReady = await waitForRenderableVideoFrame(video, stream, 3_000);
        if (!frameReady) {
            throw new Error('Curio could not read a usable camera frame. Please check camera permission and try again.');
        }

        const startedAt = Date.now();
        let lastVideoTime = -1;
        let lastCollectedAt = 0;

        while (Date.now() - startedAt < options.durationMs) {
            if (!isRenderableVideoFrame(video, stream)) {
                await new Promise((resolve) => window.setTimeout(resolve, 50));
                continue;
            }

            if (video.currentTime === lastVideoTime || Date.now() - lastCollectedAt < options.sampleGapMs) {
                await new Promise((resolve) => window.setTimeout(resolve, 40));
                continue;
            }

            lastVideoTime = video.currentTime;
            lastCollectedAt = Date.now();

            const { width, height } = getTrackingCanvasDimensions(
                video.videoWidth,
                video.videoHeight,
                DEFAULT_TRACKING_MAX_DIMENSION,
            );
            if (!width || !height) {
                continue;
            }

            if (processingCanvas.width !== width || processingCanvas.height !== height) {
                processingCanvas.width = width;
                processingCanvas.height = height;
            }

            const context = processingCanvas.getContext('2d', { alpha: false });
            if (!context) {
                continue;
            }

            context.drawImage(video, 0, 0, processingCanvas.width, processingCanvas.height);
            const sample = await backend.detect(processingCanvas, performance.now());
            if (!sample) {
                continue;
            }

            const embedding = createFaceEmbeddingFromFrame(processingCanvas, sample, descriptorCanvas);
            if (!embedding) {
                continue;
            }

            descriptors.push(embedding);
            if (descriptors.length >= options.maxSamples) {
                break;
            }
        }
    } finally {
        try {
            const disposeResult = backend.dispose?.();
            if (disposeResult && typeof (disposeResult as Promise<void>).then === 'function') {
                await disposeResult;
            }
        } catch {
            // Best-effort cleanup.
        }

        video.pause();
        video.srcObject = null;
        if (video.parentNode) {
            video.parentNode.removeChild(video);
        }
        processingCanvas.width = 0;
        processingCanvas.height = 0;
        descriptorCanvas.width = 0;
        descriptorCanvas.height = 0;
    }

    return descriptors;
};

export type FaceEnrollmentQuality = {
    /** Mean cosine similarity of each input frame against the final template.
     *  1.0 = all frames agreed perfectly. <0.8 means samples disagreed enough
     *  that the resulting template is unlikely to match reliably later. */
    sampleAgreement: number;
    frameCount: number;
};

const captureFaceEmbedding = async (
    stream: MediaStream,
    options: CollectFaceEmbeddingOptions,
): Promise<{ embedding: Float32Array; quality: FaceEnrollmentQuality }> => {
    const descriptors = await collectFaceEmbeddingsFromStream(stream, options);
    if (descriptors.length < options.minSamples) {
        throw new Error('Not enough clear face samples were captured. Please face the camera in good lighting and try again.');
    }
    const embedding = averageEmbeddings(descriptors);
    // Sample agreement: how well each input frame matched the final template.
    // A healthy enrollment averages ~0.90+. Anything under ~0.82 usually means
    // the user moved too much, lighting shifted, or the camera was unstable.
    let totalAgreement = 0;
    for (const descriptor of descriptors) {
        totalAgreement += cosineSimilarity(descriptor, embedding);
    }
    const sampleAgreement = totalAgreement / descriptors.length;
    return {
        embedding,
        quality: {
            sampleAgreement: roundToThreeDecimals(sampleAgreement),
            frameCount: descriptors.length,
        },
    };
};

export const matchFaceEmbedding = (
    embedding: Float32Array,
    profiles: FaceProfile[],
    options: MatchFaceOptions = {},
): FaceRecognitionMatch | null => {
    const threshold = options.threshold ?? RECOGNITION_THRESHOLD;
    const margin = options.margin ?? RECOGNITION_MARGIN;

    // v1 profiles use a different descriptor shape -- cosineSimilarity would
    // return meaningless scores. Filter them out so users with stale profiles
    // see the "needs re-enrollment" UI cue instead of silent false negatives.
    const compatibleProfiles = profiles.filter(
        (profile) => profile.embeddingVersion === EMBEDDING_VERSION,
    );
    if (compatibleProfiles.length === 0) {
        return null;
    }

    const scoredProfiles = compatibleProfiles
        .map((profile) => ({
            profile,
            score: cosineSimilarity(embedding, dequantizeEmbedding(profile.embedding)),
        }))
        .sort((left, right) => right.score - left.score);

    const best = scoredProfiles[0];
    if (!best || best.score < threshold) {
        return null;
    }

    const secondBestScore = scoredProfiles[1]?.score ?? 0;
    if (best.score - secondBestScore < margin) {
        return null;
    }

    const confidence = clamp01((best.score - threshold) / Math.max(1e-6, 1 - threshold));
    return {
        profileId: best.profile.id,
        profileName: best.profile.name,
        score: roundToThreeDecimals(best.score),
        confidence: roundToThreeDecimals(confidence),
    };
};

export const identifyFaceFromTrackingFrame = (
    sourceCanvas: HTMLCanvasElement,
    geometry: FaceGeometrySnapshot,
    profiles: FaceProfile[],
    options: MatchFaceOptions = {},
    scratchCanvas?: HTMLCanvasElement | null,
): FaceRecognitionMatch | null => {
    if (profiles.length === 0) {
        return null;
    }

    const embedding = createFaceEmbeddingFromFrame(sourceCanvas, geometry, scratchCanvas);
    if (!embedding) {
        return null;
    }

    return matchFaceEmbedding(embedding, profiles, options);
};

export const createFaceProfileFromStream = async (
    stream: MediaStream,
    options: CreateFaceProfileOptions,
): Promise<{ profile: FaceProfile; quality: FaceEnrollmentQuality }> => {
    const { embedding, quality } = await captureFaceEmbedding(stream, {
        durationMs: FACE_ENROLLMENT_DURATION_MS,
        minSamples: MIN_ENROLLMENT_SAMPLES,
        maxSamples: MAX_ENROLLMENT_SAMPLES,
        sampleGapMs: ENROLLMENT_SAMPLE_GAP_MS,
    });

    const normalizedName = normalizeName(options.name);
    const existingProfile = options.existingProfile ?? null;
    const now = Date.now();

    // If the existing profile uses an older descriptor version, reset it
    // instead of blending incompatible embeddings together.
    const canBlend = existingProfile
        && existingProfile.embeddingVersion === EMBEDDING_VERSION;

    const profile: FaceProfile = {
        id: existingProfile?.id ?? createFaceProfileId(normalizedName),
        name: normalizedName,
        embedding: canBlend
            ? blendEmbeddings(
                existingProfile.embedding,
                embedding,
                existingProfile.sampleCount,
            )
            : quantizeEmbedding(embedding),
        embeddingVersion: EMBEDDING_VERSION,
        createdAt: existingProfile?.createdAt ?? now,
        updatedAt: now,
        sampleCount: canBlend ? existingProfile.sampleCount + 1 : 1,
    };

    return { profile, quality };
};

export const identifyFaceFromStream = async (
    stream: MediaStream,
    profiles: FaceProfile[],
): Promise<FaceRecognitionMatch | null> => {
    if (profiles.length === 0) {
        return null;
    }

    const { embedding } = await captureFaceEmbedding(stream, {
        durationMs: FACE_IDENTIFY_DURATION_MS,
        minSamples: MIN_IDENTIFY_SAMPLES,
        maxSamples: MAX_IDENTIFY_SAMPLES,
        sampleGapMs: IDENTIFY_SAMPLE_GAP_MS,
    });

    return matchFaceEmbedding(embedding, profiles);
};

export const identifyPassiveFaceFromTrackingFrame = (
    sourceCanvas: HTMLCanvasElement,
    geometry: FaceGeometrySnapshot,
    profiles: FaceProfile[],
    scratchCanvas?: HTMLCanvasElement | null,
): FaceRecognitionMatch | null =>
    identifyFaceFromTrackingFrame(
        sourceCanvas,
        geometry,
        profiles,
        {
            threshold: PASSIVE_RECOGNITION_THRESHOLD,
            margin: PASSIVE_RECOGNITION_MARGIN,
        },
        scratchCanvas,
    );
