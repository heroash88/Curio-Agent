import { describe, expect, it } from 'vitest';

import { LIVE_SESSION_MIC_AUDIO_CONSTRAINTS, buildLiveSessionMicConstraints } from './sessionMicConstraints';

describe('sessionMicConstraints', () => {
    it('keeps browser voice processing disabled for live sessions to avoid playback ducking', () => {
        expect(LIVE_SESSION_MIC_AUDIO_CONSTRAINTS).toMatchObject({
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: { ideal: 1 },
            sampleRate: { ideal: 16000 },
        });
    });

    it('allows callers to override the target sample rate without enabling processing', () => {
        expect(buildLiveSessionMicConstraints(24000)).toMatchObject({
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: { ideal: 24000 },
        });
    });
});
