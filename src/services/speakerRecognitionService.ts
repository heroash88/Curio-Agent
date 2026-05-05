import { getSharedAudioContext } from './audioContext';
import type { SpeakerRecognitionMatch } from './speakerIdentity';
import type { SpeakerProfile } from './speakerProfileStore';

const EMBEDDING_VERSION = 1;
const EMBEDDING_BAND_COUNT = 12;
const FFT_SIZE = 2048;
const ANALYSIS_INTERVAL_MS = 85;
// Enrollment intentionally runs longer than one-shot identification so the
// voiceprint captures a few different phrases without introducing a heavy
// on-device model.
export const SPEAKER_ENROLLMENT_DURATION_MS = 10_500;
const ENROLL_CAPTURE_MS = SPEAKER_ENROLLMENT_DURATION_MS;
// Identify windows need to be long enough for a natural phrase ("hey Curio,
// can you hear me?") but short enough that the test feels responsive.
// 4s gives ~40-45 analysis frames, well above MIN_IDENTIFY_VOICED_FRAMES.
export const SPEAKER_IDENTIFY_DURATION_MS = 4000;
const IDENTIFY_CAPTURE_MS = SPEAKER_IDENTIFY_DURATION_MS;
const MIN_ENROLL_VOICED_FRAMES = 20;
const MIN_IDENTIFY_VOICED_FRAMES = 6;
const RECOGNITION_THRESHOLD = 0.86;
const RECOGNITION_MARGIN = 0.035;
const MONITOR_THRESHOLD = 0.9;
const MONITOR_MARGIN = 0.025;
const MONITOR_TICK_MS = 350;
const MONITOR_TICK_MS_LOW_POWER = 550;
const MONITOR_MAX_FRAMES = 7;
const MONITOR_MAX_FRAMES_LOW_POWER = 5;
const MONITOR_MIN_FRAMES = 4;
const MONITOR_EVALUATION_GAP_MS = 1800;
const MONITOR_EVALUATION_GAP_MS_LOW_POWER = 2600;
const MIN_VOICE_HZ = 80;
const MAX_VOICE_HZ = 3800;
const RMS_VOICE_THRESHOLD = 0.012;

type BandRange = {
    startIndex: number;
    endIndex: number;
};

type AnalysisSession = {
    source: MediaStreamAudioSourceNode;
    analyser: AnalyserNode;
    timeData: Float32Array;
    frequencyData: Float32Array;
    bandRanges: BandRange[];
    hzPerBin: number;
    dispose: () => void;
};

type CaptureEmbeddingOptions = {
    durationMs: number;
    minVoicedFrames: number;
};

type MatchSpeakerOptions = {
    threshold?: number;
    margin?: number;
};

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => window.setTimeout(resolve, ms));

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const normalizeName = (name: string): string => name.trim() || 'Voice Profile';

const roundToThreeDecimals = (value: number): number => Math.round(value * 1000) / 1000;

const createSpeakerProfileId = (name: string): string => {
    const base = normalizeName(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'voice-profile';
    const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
    return `speaker-${base}-${suffix}`;
};

const buildBandRanges = (frequencyBinCount: number, hzPerBin: number): BandRange[] => {
    const bandRanges: BandRange[] = [];
    const minHz = MIN_VOICE_HZ;
    const maxHz = Math.max(minHz + 100, MAX_VOICE_HZ);

    for (let index = 0; index < EMBEDDING_BAND_COUNT; index += 1) {
        const startHz = minHz * Math.pow(maxHz / minHz, index / EMBEDDING_BAND_COUNT);
        const endHz = minHz * Math.pow(maxHz / minHz, (index + 1) / EMBEDDING_BAND_COUNT);
        const startIndex = Math.max(1, Math.floor(startHz / hzPerBin));
        const endIndex = Math.min(
            frequencyBinCount - 1,
            Math.max(startIndex, Math.ceil(endHz / hzPerBin)),
        );
        bandRanges.push({ startIndex, endIndex });
    }

    return bandRanges;
};

const createAnalysisSession = async (stream: MediaStream): Promise<AnalysisSession> => {
    const audioContext = getSharedAudioContext(true);
    if (audioContext.state !== 'running') {
        try {
            await audioContext.resume();
        } catch {
            // Resume is gesture-gated on some browsers. If it stays suspended,
            // the analyser still starts producing data once the app is active.
        }
    }

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.minDecibels = -95;
    analyser.maxDecibels = -20;
    analyser.smoothingTimeConstant = 0.2;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const hzPerBin = (audioContext.sampleRate / 2) / analyser.frequencyBinCount;

    return {
        source,
        analyser,
        timeData: new Float32Array(analyser.fftSize),
        frequencyData: new Float32Array(analyser.frequencyBinCount),
        bandRanges: buildBandRanges(analyser.frequencyBinCount, hzPerBin),
        hzPerBin,
        dispose: () => {
            try { source.disconnect(); } catch { /* already disconnected */ }
            try { analyser.disconnect(); } catch { /* already disconnected */ }
        },
    };
};

const calculateRms = (timeData: Float32Array): number => {
    let sum = 0;
    for (let index = 0; index < timeData.length; index += 1) {
        const sample = timeData[index];
        sum += sample * sample;
    }
    return Math.sqrt(sum / Math.max(1, timeData.length));
};

const countZeroCrossings = (timeData: Float32Array): number => {
    let count = 0;
    for (let index = 1; index < timeData.length; index += 1) {
        const previous = timeData[index - 1];
        const current = timeData[index];
        if ((previous <= 0 && current > 0) || (previous >= 0 && current < 0)) {
            count += 1;
        }
    }
    return count;
};

const extractFrameFeature = (session: AnalysisSession): number[] | null => {
    session.analyser.getFloatTimeDomainData(session.timeData);
    const rms = calculateRms(session.timeData);
    if (rms < RMS_VOICE_THRESHOLD) {
        return null;
    }

    session.analyser.getFloatFrequencyData(session.frequencyData);

    const bandFeatures = new Array<number>(EMBEDDING_BAND_COUNT).fill(0);
    let totalMagnitude = 0;
    let weightedFrequency = 0;
    let lowMagnitude = 0;
    let highMagnitude = 0;

    for (let bandIndex = 0; bandIndex < session.bandRanges.length; bandIndex += 1) {
        const range = session.bandRanges[bandIndex];
        let bandTotal = 0;
        let bandCount = 0;

        for (let index = range.startIndex; index <= range.endIndex; index += 1) {
            const db = session.frequencyData[index];
            const magnitude = Math.pow(10, db / 20);
            const hz = index * session.hzPerBin;

            bandTotal += clamp01((db + 96) / 72);
            bandCount += 1;
            totalMagnitude += magnitude;
            weightedFrequency += magnitude * hz;

            if (hz <= 900) {
                lowMagnitude += magnitude;
            } else {
                highMagnitude += magnitude;
            }
        }

        bandFeatures[bandIndex] = bandCount > 0 ? bandTotal / bandCount : 0;
    }

    const centroidHz = totalMagnitude > 0 ? weightedFrequency / totalMagnitude : 0;

    let cumulativeMagnitude = 0;
    let rolloffHz = 0;
    const rolloffTarget = totalMagnitude * 0.85;
    if (totalMagnitude > 0) {
        for (let index = 1; index < session.frequencyData.length; index += 1) {
            const magnitude = Math.pow(10, session.frequencyData[index] / 20);
            cumulativeMagnitude += magnitude;
            if (cumulativeMagnitude >= rolloffTarget) {
                rolloffHz = index * session.hzPerBin;
                break;
            }
        }
    }

    const zeroCrossingRate = countZeroCrossings(session.timeData) / Math.max(1, session.timeData.length);
    const lowHighRatio = clamp01(lowMagnitude / Math.max(1e-6, lowMagnitude + highMagnitude));
    const normalizedCentroid = clamp01(centroidHz / MAX_VOICE_HZ);
    const normalizedRolloff = clamp01(rolloffHz / MAX_VOICE_HZ);
    const normalizedEnergy = clamp01((20 * Math.log10(rms + 1e-4) + 55) / 55);

    return [
        ...bandFeatures,
        lowHighRatio,
        normalizedCentroid,
        normalizedRolloff,
        zeroCrossingRate,
        normalizedEnergy,
    ];
};

const aggregateFrameFeatures = (frames: number[][]): Float32Array => {
    if (frames.length === 0) {
        return new Float32Array();
    }

    const frameDimension = frames[0].length;
    const means = new Float32Array(frameDimension);
    const variances = new Float32Array(frameDimension);

    for (const frame of frames) {
        for (let index = 0; index < frameDimension; index += 1) {
            means[index] += frame[index];
        }
    }

    for (let index = 0; index < frameDimension; index += 1) {
        means[index] /= frames.length;
    }

    for (const frame of frames) {
        for (let index = 0; index < frameDimension; index += 1) {
            const delta = frame[index] - means[index];
            variances[index] += delta * delta;
        }
    }

    const embedding = new Float32Array(frameDimension * 2);
    for (let index = 0; index < frameDimension; index += 1) {
        embedding[index] = means[index];
        embedding[frameDimension + index] = Math.sqrt(variances[index] / frames.length);
    }

    return normalizeEmbedding(embedding);
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
        quantized[index] = Math.max(-127, Math.min(127, Math.round(embedding[index] * 127)));
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

const blendEmbeddings = (
    existingEmbedding: number[],
    nextEmbedding: Float32Array,
    existingSampleCount: number,
): number[] => {
    const existing = dequantizeEmbedding(existingEmbedding);
    const blended = new Float32Array(Math.max(existing.length, nextEmbedding.length));
    const totalWeight = Math.max(1, existingSampleCount) + 1;

    for (let index = 0; index < blended.length; index += 1) {
        const previousValue = existing[index] ?? 0;
        const nextValue = nextEmbedding[index] ?? 0;
        blended[index] = ((previousValue * Math.max(1, existingSampleCount)) + nextValue) / totalWeight;
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

export type VoiceEnrollmentQuality = {
    /** Voiced-frame ratio: fraction of analysis windows that contained
     *  speech. 1.0 = continuous talking, 0.3 and up is acceptable, below
     *  0.25 usually means the user was too quiet or far from the mic. */
    voicedRatio: number;
    voicedFrameCount: number;
    totalFrameCount: number;
};

const captureEmbedding = async (
    stream: MediaStream,
    { durationMs, minVoicedFrames }: CaptureEmbeddingOptions,
): Promise<{ embedding: Float32Array; quality: VoiceEnrollmentQuality }> => {
    // The recognizer samples a short window and immediately tears down the
    // analyser nodes. This avoids a second long-lived worklet or polling loop.
    const session = await createAnalysisSession(stream);
    const frameFeatures: number[][] = [];
    let totalFrameCount = 0;

    try {
        const startedAt = Date.now();
        while (Date.now() - startedAt < durationMs) {
            totalFrameCount += 1;
            const feature = extractFrameFeature(session);
            if (feature) {
                frameFeatures.push(feature);
            }
            await sleep(ANALYSIS_INTERVAL_MS);
        }
    } finally {
        session.dispose();
    }

    if (frameFeatures.length < minVoicedFrames) {
        throw new Error('Not enough voice activity detected. Try speaking clearly and a little closer to the mic.');
    }

    return {
        embedding: aggregateFrameFeatures(frameFeatures),
        quality: {
            voicedRatio: totalFrameCount > 0
                ? Math.round((frameFeatures.length / totalFrameCount) * 1000) / 1000
                : 0,
            voicedFrameCount: frameFeatures.length,
            totalFrameCount,
        },
    };
};

const matchSpeakerEmbedding = (
    embedding: Float32Array,
    profiles: SpeakerProfile[],
    options: MatchSpeakerOptions = {},
): SpeakerRecognitionMatch | null => {
    const threshold = options.threshold ?? RECOGNITION_THRESHOLD;
    const margin = options.margin ?? RECOGNITION_MARGIN;

    const scores = profiles
        .map((profile) => ({
            profile,
            score: cosineSimilarity(embedding, dequantizeEmbedding(profile.embedding)),
        }))
        .sort((left, right) => right.score - left.score);

    const best = scores[0];
    if (!best || best.score < threshold) {
        return null;
    }

    const secondBestScore = scores[1]?.score ?? 0;
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

export type CreateSpeakerProfileOptions = {
    name: string;
    existingProfile?: SpeakerProfile | null;
};

export const createSpeakerProfileFromStream = async (
    stream: MediaStream,
    options: CreateSpeakerProfileOptions,
): Promise<{ profile: SpeakerProfile; quality: VoiceEnrollmentQuality }> => {
    const { embedding, quality } = await captureEmbedding(stream, {
        durationMs: ENROLL_CAPTURE_MS,
        minVoicedFrames: MIN_ENROLL_VOICED_FRAMES,
    });

    const normalizedName = normalizeName(options.name);
    const existingProfile = options.existingProfile ?? null;
    const now = Date.now();

    const profile: SpeakerProfile = {
        id: existingProfile?.id ?? createSpeakerProfileId(normalizedName),
        name: normalizedName,
        embedding: existingProfile
            ? blendEmbeddings(
                existingProfile.embedding,
                embedding,
                existingProfile.sampleCount,
            )
            : quantizeEmbedding(embedding),
        embeddingVersion: EMBEDDING_VERSION,
        createdAt: existingProfile?.createdAt ?? now,
        updatedAt: now,
        sampleCount: existingProfile ? existingProfile.sampleCount + 1 : 1,
    };

    return { profile, quality };
};

export const identifySpeakerFromStream = async (
    stream: MediaStream,
    profiles: SpeakerProfile[],
): Promise<SpeakerRecognitionMatch | null> => {
    if (profiles.length === 0) {
        return null;
    }

    const { embedding } = await captureEmbedding(stream, {
        durationMs: IDENTIFY_CAPTURE_MS,
        minVoicedFrames: MIN_IDENTIFY_VOICED_FRAMES,
    });

    return matchSpeakerEmbedding(embedding, profiles);
};

export type PassiveSpeakerMonitorOptions = {
    stream: MediaStream;
    profiles: SpeakerProfile[];
    lowPowerMode?: boolean;
    currentProfileId?: string | null;
    onRecognizedSpeakerChange: (match: SpeakerRecognitionMatch) => void;
};

export type PassiveSpeakerMonitorHandle = {
    stop: () => void;
};

export const startPassiveSpeakerMonitor = async (
    options: PassiveSpeakerMonitorOptions,
): Promise<PassiveSpeakerMonitorHandle> => {
    // Passive monitoring reuses the active session stream and samples only a
    // handful of analyser frames every few hundred milliseconds. This keeps
    // speaker-change detection cheap enough for low-end devices.
    const session = await createAnalysisSession(options.stream);
    const recentFrames: number[][] = [];
    let currentProfileId = options.currentProfileId ?? null;
    let lastEvaluationAt = 0;
    const tickMs = options.lowPowerMode ? MONITOR_TICK_MS_LOW_POWER : MONITOR_TICK_MS;
    const maxFrames = options.lowPowerMode ? MONITOR_MAX_FRAMES_LOW_POWER : MONITOR_MAX_FRAMES;
    const evaluationGapMs = options.lowPowerMode
        ? MONITOR_EVALUATION_GAP_MS_LOW_POWER
        : MONITOR_EVALUATION_GAP_MS;
    let stopped = false;

    const timerId = window.setInterval(() => {
        if (stopped) {
            return;
        }

        // If the caller's stream tracks were stopped (e.g. session disconnect
        // without explicit monitor stop), bail out so we don't keep polling
        // an analyser that only produces silence.
        const hasLiveTrack = options.stream
            .getAudioTracks()
            .some((track) => track.readyState === 'live');
        if (!hasLiveTrack) {
            stopped = true;
            window.clearInterval(timerId);
            recentFrames.length = 0;
            session.dispose();
            return;
        }

        const feature = extractFrameFeature(session);
        if (!feature) {
            return;
        }

        recentFrames.push(feature);
        if (recentFrames.length > maxFrames) {
            recentFrames.shift();
        }

        if (recentFrames.length < MONITOR_MIN_FRAMES) {
            return;
        }

        const now = Date.now();
        if (now - lastEvaluationAt < evaluationGapMs) {
            return;
        }
        lastEvaluationAt = now;

        const embedding = aggregateFrameFeatures(recentFrames);
        const match = matchSpeakerEmbedding(embedding, options.profiles, {
            threshold: MONITOR_THRESHOLD,
            margin: MONITOR_MARGIN,
        });

        if (!match || match.profileId === currentProfileId) {
            return;
        }

        currentProfileId = match.profileId;
        recentFrames.length = 0;
        options.onRecognizedSpeakerChange(match);
    }, tickMs);

    return {
        stop: () => {
            if (stopped) {
                return;
            }
            stopped = true;
            window.clearInterval(timerId);
            recentFrames.length = 0;
            session.dispose();
        },
    };
};
