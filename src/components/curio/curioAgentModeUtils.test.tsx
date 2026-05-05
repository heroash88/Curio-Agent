import { describe, expect, it } from 'vitest';

import {
    getCurioRuntimeState,
    getEffectiveTranscriptState,
    sanitizeTextForSpokenTranscript,
    stripFencedTranscriptBlocks,
} from './curioAgentModeUtils';

describe('curioAgentModeUtils', () => {
    it('uses live transcripts once a connected live backend has a model response', () => {
        const state = getEffectiveTranscriptState({
            isConnected: true,
            haVoiceActive: false,
            offlineActive: false,
            textOnlyActive: true,
            customLlmVoiceActive: false,
            isSpeaking: true,
            offlineSpeaking: false,
            userTranscript: 'live user',
            modelTranscript: 'live model',
            offlineUserTranscript: 'typed user',
            offlineModelTranscript: 'typed model',
            haUserTranscript: null,
            haModelTranscript: null,
        });

        expect(state.effectiveUserTranscript).toBe('live user');
        expect(state.effectiveModelTranscript).toBe('live model');
        expect(state.effectiveIsSpeaking).toBe(true);
        expect(state.anySessionActive).toBe(true);
    });

    it('prefers active Home Assistant voice transcripts over other sources', () => {
        const state = getEffectiveTranscriptState({
            isConnected: true,
            haVoiceActive: true,
            offlineActive: true,
            textOnlyActive: true,
            customLlmVoiceActive: false,
            isSpeaking: true,
            offlineSpeaking: true,
            userTranscript: 'live user',
            modelTranscript: 'live model',
            offlineUserTranscript: 'offline user',
            offlineModelTranscript: 'offline model',
            haUserTranscript: 'ha user',
            haModelTranscript: 'ha model',
        });

        expect(state.effectiveUserTranscript).toBe('ha user');
        expect(state.effectiveModelTranscript).toBe('ha model');
        expect(state.effectiveIsSpeaking).toBe(false);
    });

    it('keeps offline and custom LLM sessions active without a live connection', () => {
        const state = getEffectiveTranscriptState({
            isConnected: false,
            haVoiceActive: false,
            offlineActive: false,
            textOnlyActive: false,
            customLlmVoiceActive: true,
            isSpeaking: false,
            offlineSpeaking: true,
            userTranscript: null,
            modelTranscript: null,
            offlineUserTranscript: 'local user',
            offlineModelTranscript: 'local model',
            haUserTranscript: null,
            haModelTranscript: null,
        });

        expect(state.effectiveUserTranscript).toBe('local user');
        expect(state.effectiveModelTranscript).toBe('local model');
        expect(state.effectiveIsSpeaking).toBe(false);
        expect(state.anySessionActive).toBe(true);
    });

    it('keeps local voice state ahead of stale connection errors', () => {
        expect(getCurioRuntimeState({
            playbackState: 'idle',
            isConnecting: false,
            haVoiceConnecting: false,
            isConnected: false,
            haVoiceActive: false,
            isSpeaking: false,
            offlineActive: true,
            textOnlyActive: false,
            customLlmVoiceActive: false,
            offlineSpeaking: true,
            error: 'previous connection failed',
            cameraEnabled: false,
        })).toBe('speaking');
    });

    it('prioritizes music playback animation over voice state', () => {
        expect(getCurioRuntimeState({
            playbackState: 'playing',
            isConnecting: true,
            haVoiceConnecting: false,
            isConnected: false,
            haVoiceActive: false,
            isSpeaking: false,
            offlineActive: false,
            textOnlyActive: false,
            customLlmVoiceActive: false,
            offlineSpeaking: false,
            error: null,
            cameraEnabled: false,
        })).toBe('dancing');
    });

    it('strips closed and unfinished fenced transcript blocks', () => {
        expect(stripFencedTranscriptBlocks('Here\n```json\n{"tool":true}\n```\nDone')).toBe('Here\n\nDone');
        expect(stripFencedTranscriptBlocks('Visible\n```json\n{"tool":true}')).toBe('Visible');
    });

    it('removes markdown citations and bare links from spoken transcript text', () => {
        expect(
            sanitizeTextForSpokenTranscript(
                'Aston Villa lead 2-1 ([standard.co.uk](https://www.standard.co.uk/sport/live.html?utm_source=nova.amazon.com)) ([espn.com](https://www.espn.com/story)).',
            ),
        ).toBe('Aston Villa lead 2-1.');

        expect(
            sanitizeTextForSpokenTranscript('Details are at https://example.com/live-score if you want them.'),
        ).toBe('Details are at if you want them.');
    });
});
