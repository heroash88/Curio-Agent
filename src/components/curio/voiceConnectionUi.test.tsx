import { describe, expect, it } from 'vitest';

import { getVoiceConnectionToggleAction, getVoiceConnectionUiState } from './voiceConnectionUi';

const baseState = {
    isConnected: false,
    isConnecting: false,
    haVoiceActive: false,
    haVoiceConnecting: false,
    offlineActive: false,
    customLlmVoiceActive: false,
};

describe('voiceConnectionUi', () => {
    it('keeps offline sessions disconnectable from dashboard controls', () => {
        expect(getVoiceConnectionUiState({ ...baseState, offlineActive: true })).toEqual({
            active: true,
            busy: false,
            label: 'Disconnect',
        });
    });

    it('keeps text LLM voice sessions disconnectable from dashboard controls', () => {
        expect(getVoiceConnectionUiState({ ...baseState, customLlmVoiceActive: true })).toEqual({
            active: true,
            busy: false,
            label: 'Disconnect',
        });
    });

    it('routes the text LLM connect button to microphone dictation', () => {
        expect(getVoiceConnectionToggleAction({
            ...baseState,
            voiceBackend: 'custom_llm',
        })).toBe('toggle_custom_llm_voice');
    });

    it('still routes connected Live API sessions to disconnect', () => {
        expect(getVoiceConnectionToggleAction({
            ...baseState,
            voiceBackend: 'liveapi',
            isConnected: true,
        })).toBe('disconnect_live');
    });
});
