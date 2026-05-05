/**
 * Thin wrapper around the Web Speech API for text-LLM dictation.
 *
 * Used by the text-LLM voice flow: wake word listens for one utterance, while
 * Connect can keep recognition continuous. Final transcripts are handed to the
 * text LLM as if the user had typed them. No transcript analyzer, no local
 * processing -- that's the whole point.
 *
 * The "offline" voice backend uses its own continuous-mode wrapper in
 * offlineSpeechService.ts. Keeping them separate avoids coupling the
 * custom-LLM flow to the local intent analyzer.
 */

interface SpeechRecognitionAlt {
    transcript: string;
    confidence: number;
}

interface SpeechRecognitionRes {
    isFinal: boolean;
    0: SpeechRecognitionAlt;
}

interface SpeechRecognitionEvt {
    resultIndex: number;
    results: { length: number; [i: number]: SpeechRecognitionRes };
}

interface SpeechRecognitionInst extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionEvt) => void) | null;
    onstart: (() => void) | null;
    onspeechend: (() => void) | null;
    onerror: ((event: { error: string; message?: string }) => void) | null;
    onend: (() => void) | null;
}

// The global Window.SpeechRecognition / webkitSpeechRecognition augmentation
// lives in offlineSpeechService.ts -- we read those constructors via a
// runtime cast here to avoid duplicating the declaration.
type SpeechRecognitionCtor = new () => SpeechRecognitionInst;

export const isWebSpeechSupported = (): boolean => {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as {
        SpeechRecognition?: unknown;
        webkitSpeechRecognition?: unknown;
    };
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
};

export interface DictationCallbacks {
    onStart?: () => void;
    onInterim?: (text: string) => void;
    onFinal: (text: string) => void;
    onError?: (message: string) => void;
    onEnd?: () => void;
}

export interface DictationHandle {
    stop: () => void;
    abort: () => void;
    resetIdleTimeout: () => void;
}

export interface DictationOptions {
    continuous?: boolean;
    idleTimeoutMs?: number;
    onIdle?: () => void;
}

/**
 * Start a dictation session. By default this is single-utterance; callers can
 * opt into continuous mode for connected sessions. Final transcripts arrive
 * via callbacks.onFinal.
 */
export const startDictation = (
    cbs: DictationCallbacks,
    options: DictationOptions = {},
): DictationHandle | null => {
    const w = window as unknown as {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
        cbs.onError?.('Speech recognition is not supported in this browser.');
        return null;
    }

    const recognition = new Ctor();
    // Single-utterance mode auto-ends after silence. Connected text-LLM
    // sessions opt into continuous mode so the mic stays open between turns.
    recognition.continuous = Boolean(options.continuous);
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    let finalEmitted = false;
    let aborted = false;
    let idleTimer: number | null = null;

    const clearIdleTimeout = () => {
        if (idleTimer !== null) {
            window.clearTimeout(idleTimer);
            idleTimer = null;
        }
    };

    const resetIdleTimeout = () => {
        clearIdleTimeout();
        if (!options.idleTimeoutMs || options.idleTimeoutMs <= 0 || !options.onIdle) {
            return;
        }
        idleTimer = window.setTimeout(() => {
            idleTimer = null;
            options.onIdle?.();
        }, options.idleTimeoutMs);
    };

    recognition.onstart = () => {
        resetIdleTimeout();
        cbs.onStart?.();
    };

    recognition.onresult = (event) => {
        let interim = '';
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const r = event.results[i];
            if (r.isFinal) finalText += r[0].transcript;
            else interim += r[0].transcript;
        }
        if (interim) cbs.onInterim?.(interim);
        if (finalText) {
            finalEmitted = true;
            cbs.onFinal(finalText.trim());
        }
        if (interim || finalText) {
            resetIdleTimeout();
        }
    };

    recognition.onerror = (event) => {
        // 'aborted' is from our own stop/abort call; 'no-speech' means the user
        // never spoke -- neither is a real error.
        if (event.error === 'aborted' || aborted) return;
        if (event.error === 'no-speech') {
            cbs.onError?.('no-speech');
            return;
        }
        cbs.onError?.(event.error || 'Unknown speech recognition error');
    };

    recognition.onend = () => {
        clearIdleTimeout();
        if (!finalEmitted && !aborted) {
            // Recognizer ended without producing a final result (e.g. the user
            // said nothing). Surface as an end signal so the caller can reset UI.
            cbs.onEnd?.();
        } else {
            cbs.onEnd?.();
        }
    };

    try {
        recognition.start();
    } catch (e) {
        cbs.onError?.(`Failed to start dictation: ${(e as Error).message}`);
        return null;
    }

    return {
        stop: () => {
            clearIdleTimeout();
            try { recognition.stop(); } catch { /* ignore */ }
        },
        abort: () => {
            aborted = true;
            clearIdleTimeout();
            try { recognition.abort(); } catch { /* ignore */ }
        },
        resetIdleTimeout,
    };
};
