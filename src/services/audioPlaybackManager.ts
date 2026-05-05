/**
 * AudioPlaybackManager — handles TTS audio scheduling and playback.
 * Extracted from LiveClient to keep audio concerns isolated.
 */

import { decodeBase64ToBytes } from './audioBinary';

export class AudioPlaybackManager {
    private nextStartTime = 0;
    private lastPlaybackEndTime = 0;
    private scheduledSources: AudioBufferSourceNode[] = [];
    public analyserNode: AnalyserNode | null = null;
    private audioContext: AudioContext | null = null;
    private outputGain: GainNode | null = null;
    private onSpeakingChange: (isSpeaking: boolean) => void;
    private _speakerMuted = false;

    constructor(onSpeakingChange: (isSpeaking: boolean) => void) {
        this.onSpeakingChange = onSpeakingChange;
    }

    /** Bind to an AudioContext (called during connect). */
    setAudioContext(ctx: AudioContext) {
        this.audioContext = ctx;
        this.nextStartTime = ctx.currentTime;
        this.analyserNode = ctx.createAnalyser();
        this.analyserNode.fftSize = 256;
        this.analyserNode.smoothingTimeConstant = 0.5;
        this.outputGain = ctx.createGain();
        this.outputGain.gain.value = this._speakerMuted ? 0 : 1;
        this.analyserNode.connect(this.outputGain);
        this.outputGain.connect(ctx.destination);
    }

    /** Release the audio context reference (called during disconnect). */
    clearAudioContext() {
        if (this.outputGain) {
            try { this.outputGain.disconnect(); } catch {}
            this.outputGain = null;
        }
        if (this.analyserNode) {
            try { this.analyserNode.disconnect(); } catch {}
            this.analyserNode = null;
        }
        this.audioContext = null;
    }

    /** Mute or unmute the speaker output. */
    set speakerMuted(muted: boolean) {
        this._speakerMuted = muted;
        if (this.outputGain) {
            this.outputGain.gain.value = muted ? 0 : 1;
        }
    }

    get speakerMuted(): boolean {
        return this._speakerMuted;
    }

    /** Whether audio is currently being played or was very recently. */
    get isPlayingOrRecent(): boolean {
        return this.scheduledSources.length > 0 || Date.now() - this.lastPlaybackEndTime < 600;
    }

    /** Stop all scheduled audio sources immediately. */
    stop() {
        this.scheduledSources.forEach((s) => {
            try { s.onended = null; s.stop(); s.disconnect(); } catch {}
        });
        this.scheduledSources = [];
        this.lastPlaybackEndTime = Date.now();
        if (this.audioContext) {
            this.nextStartTime = this.audioContext.currentTime;
        }
        this.onSpeakingChange(false);
    }

    /** Decode base64 PCM audio and schedule it for gapless playback. */
    play(base64: string) {
        if (!this.audioContext) return;
        const ctx = this.audioContext;
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        const bytes = decodeBase64ToBytes(base64);
        const pcmData = new Int16Array(bytes.buffer);
        const float32Data = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
            float32Data[i] = pcmData[i] / 32768.0;
        }
        const buffer = ctx.createBuffer(1, float32Data.length, 24000);
        buffer.getChannelData(0).set(float32Data);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        if (this.analyserNode) {
            source.connect(this.analyserNode);
            // analyserNode → outputGain → destination chain is set up in setAudioContext
        } else if (this.outputGain) {
            source.connect(this.outputGain);
        } else {
            source.connect(ctx.destination);
        }
        const now = ctx.currentTime;
        // Snap forward if stale to avoid scheduling in the past
        if (this.nextStartTime < now - 0.5) {
            this.nextStartTime = now;
        }
        this.nextStartTime = Math.max(now, this.nextStartTime);
        source.start(this.nextStartTime);
        this.nextStartTime += buffer.duration;
        this.scheduledSources.push(source);
        source.onended = () => {
            const idx = this.scheduledSources.indexOf(source);
            if (idx > -1) this.scheduledSources.splice(idx, 1);
            this.lastPlaybackEndTime = Date.now();
            if (this.scheduledSources.length === 0) {
                this.onSpeakingChange(false);
            }
        };
    }
}
