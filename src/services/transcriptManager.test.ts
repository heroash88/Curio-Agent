import { describe, expect, it } from 'vitest';

import { TranscriptManager } from './transcriptManager';

describe('TranscriptManager', () => {
    it('keeps hidden assistant reasoning out of visible transcript chunks', () => {
        const manager = new TranscriptManager();

        manager.mergeAssistantChunk('Thought: I should inspect the tools');

        expect(manager.pendingAssistant).toBe('');

        manager.mergeAssistantChunk('\nFinal: The kitchen light is on.');

        expect(manager.pendingAssistant).toBe('The kitchen light is on.');
    });

    it('keeps normal assistant text that mentions thought-like words', () => {
        const manager = new TranscriptManager();

        manager.mergeAssistantChunk('I thought about it, and the answer is yes.');

        expect(manager.pendingAssistant).toBe('I thought about it, and the answer is yes.');
    });
});
