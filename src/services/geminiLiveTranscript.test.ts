import { describe, expect, it } from 'vitest';

import {
    getVisibleGeminiModelPartText,
    shouldDisableGeminiLiveThoughts,
} from './geminiLiveTranscript';

describe('geminiLiveTranscript', () => {
    it('drops Gemini thought parts before they reach subtitles', () => {
        expect(getVisibleGeminiModelPartText({ thought: true, text: 'I should call a tool first.' })).toBe('');
        expect(getVisibleGeminiModelPartText({ text: 'The kitchen light is on.' })).toBe('The kitchen light is on.');
    });

    it('sanitizes text-labeled reasoning from model text parts', () => {
        expect(getVisibleGeminiModelPartText({ text: 'Analysis: inspect tools\nFinal: Done.' })).toBe('Done.');
    });

    it('only disables Live thoughts for Gemini 2.5 models', () => {
        expect(shouldDisableGeminiLiveThoughts('gemini-2.5-flash-native-audio-preview-12-2025')).toBe(true);
        expect(shouldDisableGeminiLiveThoughts('gemini-3.1-flash-live-preview')).toBe(false);
    });
});
