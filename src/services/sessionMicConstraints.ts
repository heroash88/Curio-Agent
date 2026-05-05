export const buildLiveSessionMicConstraints = (sampleRate = 16000): MediaTrackConstraints => ({
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: { ideal: 1 },
    sampleRate: { ideal: sampleRate },
});

export const LIVE_SESSION_MIC_AUDIO_CONSTRAINTS = buildLiveSessionMicConstraints(16000);
