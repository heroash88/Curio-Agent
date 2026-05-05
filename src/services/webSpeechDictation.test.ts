import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startDictation } from './webSpeechDictation';

class FakeSpeechRecognition {
    static instances: FakeSpeechRecognition[] = [];

    continuous = false;
    interimResults = false;
    lang = '';
    maxAlternatives = 0;
    onresult: ((event: any) => void) | null = null;
    onstart: (() => void) | null = null;
    onspeechend: (() => void) | null = null;
    onerror: ((event: { error: string; message?: string }) => void) | null = null;
    onend: (() => void) | null = null;

    constructor() {
        FakeSpeechRecognition.instances.push(this);
    }

    start() {
        this.onstart?.();
    }

    stop() {
        this.onend?.();
    }

    abort() {
        this.onerror?.({ error: 'aborted' });
        this.onend?.();
    }

    emitTranscript(text: string, isFinal: boolean) {
        this.onresult?.({
            resultIndex: 0,
            results: {
                length: 1,
                0: {
                    isFinal,
                    0: { transcript: text, confidence: 0.9 },
                },
            },
        });
    }
}

describe('webSpeechDictation', () => {
    beforeEach(() => {
        FakeSpeechRecognition.instances = [];
        Object.defineProperty(window, 'SpeechRecognition', {
            configurable: true,
            value: FakeSpeechRecognition,
        });
        Object.defineProperty(window, 'webkitSpeechRecognition', {
            configurable: true,
            value: undefined,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        Reflect.deleteProperty(window, 'SpeechRecognition');
        Reflect.deleteProperty(window, 'webkitSpeechRecognition');
    });

    it('can keep Web Speech recognition continuous for connected text LLM sessions', () => {
        const finals: string[] = [];

        const handle = startDictation({
            onFinal: (text) => finals.push(text),
        }, { continuous: true });

        const recognition = FakeSpeechRecognition.instances[0];
        expect(recognition.continuous).toBe(true);

        recognition.emitTranscript('first turn', true);
        recognition.emitTranscript('second turn', true);

        expect(finals).toEqual(['first turn', 'second turn']);
        handle?.abort();
    });

    it('fires an idle callback after 30 seconds without speech activity', () => {
        vi.useFakeTimers();
        const onIdle = vi.fn();

        const handle = startDictation({
            onFinal: vi.fn(),
        }, {
            continuous: true,
            idleTimeoutMs: 30_000,
            onIdle,
        });

        vi.advanceTimersByTime(29_999);
        expect(onIdle).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(onIdle).toHaveBeenCalledTimes(1);
        handle?.abort();
    });

    it('resets the idle timer when interim speech activity arrives', () => {
        vi.useFakeTimers();
        const onIdle = vi.fn();

        const handle = startDictation({
            onFinal: vi.fn(),
            onInterim: vi.fn(),
        }, {
            continuous: true,
            idleTimeoutMs: 30_000,
            onIdle,
        });
        const recognition = FakeSpeechRecognition.instances[0];

        vi.advanceTimersByTime(20_000);
        recognition.emitTranscript('still talking', false);
        vi.advanceTimersByTime(29_999);
        expect(onIdle).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(onIdle).toHaveBeenCalledTimes(1);
        handle?.abort();
    });

    it('lets callers restart the idle timer after async response work', () => {
        vi.useFakeTimers();
        const onIdle = vi.fn();

        const handle = startDictation({
            onFinal: vi.fn(),
        }, {
            continuous: true,
            idleTimeoutMs: 30_000,
            onIdle,
        });

        vi.advanceTimersByTime(20_000);
        handle?.resetIdleTimeout();
        vi.advanceTimersByTime(29_999);
        expect(onIdle).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(onIdle).toHaveBeenCalledTimes(1);
        handle?.abort();
    });
});
