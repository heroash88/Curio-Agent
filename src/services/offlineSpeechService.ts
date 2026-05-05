/**
 * Offline Speech Service
 *
 * Uses the browser's built-in Web Speech API (SpeechRecognition) to convert
 * voice input to text without any cloud AI dependency. The recognized text
 * is then fed through the transcript analyzer to produce card events and
 * trigger local actions (weather, music, device control, etc.).
 */

import type { CardEvent } from './cardTypes';
import { analyzeTranscript, resolveCardEntityId } from './transcriptAnalyzer';
import { musicPlaybackService, toMusicCardData } from './musicPlaybackService';
import { getUnifiedWeather } from './weatherService';
import { searchMusic } from './musicSearchService';
import {
    saveNote, getNotes, deleteNote,
    saveReminder, getReminders, deleteReminder,
} from './notesPersistence';
import {
    getWeatherCity,
    getTempUnit,
    getLowPowerMode,
    getHaMcpUrl,
    getHaMcpEnabled,
} from '../utils/settingsStorage';
import { getHaMcpTokenAsync, getHomeLocation, getWorkLocation, getGoogleApiKeyAsync } from '../utils/settingsStorage';

export {
    speakOffline,
    speakWithSafetyTimeout,
    unlockSpeechSynthesis,
} from './browserSpeechSynthesis';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionResultList {
    length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
    isFinal: boolean;
    length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
}

interface SpeechRecognitionInstance extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: { error: string; message?: string }) => void) | null;
    onend: (() => void) | null;
    onstart: (() => void) | null;
    onspeechstart: (() => void) | null;
    onspeechend: (() => void) | null;
}

declare global {
    interface Window {
        SpeechRecognition?: new () => SpeechRecognitionInstance;
        webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    }
}

export type OfflineSpeechStatus =
    | 'idle'
    | 'listening'
    | 'processing'
    | 'speaking'
    | 'error';

export interface OfflineSpeechCallbacks {
    onStatusChange: (status: OfflineSpeechStatus) => void;
    onTranscript: (text: string, isFinal: boolean) => void;
    onCardEvent: (event: CardEvent) => void;
    onSpeak: (text: string) => void;
    onError: (error: string) => void;
}

// ─── Speech Recognition wrapper ──────────────────────────────────────────────

let recognition: SpeechRecognitionInstance | null = null;
let callbacks: OfflineSpeechCallbacks | null = null;
let entityCache: Array<{ entity_id: string; name: string; domain: string; state?: string; area?: string }> = [];
let isActive = false;
let restartOnEnd = false;

/** Check if the browser supports the Web Speech API */
export function isSpeechRecognitionSupported(): boolean {
    return typeof window !== 'undefined' &&
        !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/** Set the HA entity cache for device/camera/thermostat resolution */
export function setOfflineEntityCache(
    cache: Array<{ entity_id: string; name: string; domain: string; state?: string; area?: string }>
) {
    entityCache = cache;
}

/** Start offline speech recognition */
export function startOfflineListening(cbs: OfflineSpeechCallbacks): boolean {
    if (!isSpeechRecognitionSupported()) {
        cbs.onError('Speech recognition is not supported in this browser.');
        return false;
    }

    callbacks = cbs;

    if (recognition) {
        try { recognition.abort(); } catch {}
    }

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return false;

    recognition = new SpeechRecognitionCtor();
    // Use continuous mode when we intend to keep listening across utterances.
    // This avoids tearing down and recreating the SpeechRecognition instance
    // after every silence, which on Android Chrome triggers a new mic
    // permission notification each time.
    recognition.continuous = restartOnEnd;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        isActive = true;
        callbacks?.onStatusChange('listening');
    };

    recognition.onspeechstart = () => {
        callbacks?.onStatusChange('listening');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
                finalTranscript += result[0].transcript;
            } else {
                interimTranscript += result[0].transcript;
            }
        }

        if (interimTranscript) {
            callbacks?.onTranscript(interimTranscript, false);
        }

        if (finalTranscript) {
            callbacks?.onTranscript(finalTranscript, true);
            callbacks?.onStatusChange('processing');
            processOfflineCommand(finalTranscript.trim());
        }
    };

    recognition.onerror = (event) => {
        console.warn('[OfflineSpeech] Recognition error:', event.error);
        // 'no-speech' is normal -- user didn't say anything.
        // In continuous mode the session stays alive, so only restart
        // if the session actually ended (handled in onend).
        if (event.error === 'no-speech' || event.error === 'aborted') {
            return;
        }
        callbacks?.onError(`Speech recognition error: ${event.error}`);
        callbacks?.onStatusChange('error');
    };

    recognition.onend = () => {
        isActive = false;
        // In continuous mode the session can still end unexpectedly
        // (e.g. network hiccup, browser policy). Restart if we're
        // supposed to keep listening, reusing a small delay to avoid
        // tight loops.
        if (restartOnEnd && callbacks) {
            setTimeout(() => {
                if (restartOnEnd && callbacks) startOfflineListening(callbacks);
            }, 300);
        } else {
            callbacks?.onStatusChange('idle');
        }
    };

    try {
        recognition.start();
        return true;
    } catch (e) {
        console.error('[OfflineSpeech] Failed to start:', e);
        callbacks?.onError('Failed to start speech recognition.');
        return false;
    }
}

/** Stop offline speech recognition */
export function stopOfflineListening() {
    restartOnEnd = false;
    isActive = false;
    if (recognition) {
        try { recognition.stop(); } catch {}
        recognition = null;
    }
    callbacks?.onStatusChange('idle');
}

/** Start continuous listening (restarts after each utterance) */
export function startContinuousOfflineListening(cbs: OfflineSpeechCallbacks): boolean {
    restartOnEnd = true;
    return startOfflineListening(cbs);
}

/** Check if currently listening */
export function isOfflineListening(): boolean {
    return isActive;
}

/**
 * Process a text command in offline mode without needing speech recognition.
 * Requires callbacks to be set up first via startOfflineListening/startContinuousOfflineListening,
 * OR accepts inline callbacks.
 */
export async function processOfflineTextCommand(
    text: string,
    cbs?: OfflineSpeechCallbacks,
): Promise<void> {
    const activeCbs = cbs || callbacks;
    if (!activeCbs) return;
    const prevCallbacks = callbacks;
    callbacks = activeCbs;
    try {
        await processOfflineCommand(text.trim());
    } finally {
        callbacks = prevCallbacks;
    }
}


// ─── Offline command processing ───────────────────────────────────────────────

/** Built-in responses for common queries when no card is detected */
const SPOKEN_RESPONSES: Array<{ patterns: RegExp[]; respond: (text: string) => string }> = [
    {
        patterns: [/\b(?:what time is it|what's the time|current time|tell me the time|what time do you have)\b/i],
        respond: () => {
            const now = new Date();
            const h = now.getHours() % 12 || 12;
            const m = now.getMinutes().toString().padStart(2, '0');
            const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
            return `It's ${h}:${m} ${ampm}.`;
        },
    },
    {
        patterns: [/\b(?:what day is it|what's today|today's date|what is the date|what's the date)\b/i],
        respond: () => {
            const now = new Date();
            return `Today is ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`;
        },
    },
    {
        patterns: [/\b(?:hello|hi there|hey there|good morning|good afternoon|good evening|howdy)\b/i],
        respond: () => {
            const hour = new Date().getHours();
            if (hour < 12) return 'Good morning! How can I help you?';
            if (hour < 17) return 'Good afternoon! What can I do for you?';
            return 'Good evening! What can I help with?';
        },
    },
    {
        patterns: [/\b(?:thank you|thanks|thank)\b/i],
        respond: () => "You're welcome!",
    },
    {
        patterns: [/\b(?:goodbye|bye|see you|good night|see you later)\b/i],
        respond: () => 'Goodbye! Talk to you later.',
    },
    {
        patterns: [/\b(?:who are you|what are you|what's your name|your name)\b/i],
        respond: () => "I'm Curio, your offline voice assistant. I can help with weather, timers, music, smart home, and more!",
    },
    {
        patterns: [/\b(?:help|what can you do|what do you do|what are your capabilities)\b/i],
        respond: () => "I can set timers and alarms, take notes, set reminders, check the weather, play music and videos, control smart home devices, do quick math, and more. Just ask!",
    },
    {
        patterns: [/\b(?:how are you|how do you feel|how's it going|what's up)\b/i],
        respond: () => "I'm doing great, thanks for asking! What can I help you with?",
    },
    {
        patterns: [/\b(?:tell me a joke|say something funny|make me laugh)\b/i],
        respond: () => {
            const jokes = [
                "Why don't scientists trust atoms? Because they make up everything!",
                "What do you call a fake noodle? An impasta!",
                "Why did the scarecrow win an award? He was outstanding in his field!",
                "What do you call a bear with no teeth? A gummy bear!",
                "Why don't eggs tell jokes? They'd crack each other up!",
            ];
            return jokes[Math.floor(Math.random() * jokes.length)];
        },
    },
    {
        patterns: [/\b(?:flip a coin|coin flip|heads or tails)\b/i],
        respond: () => Math.random() < 0.5 ? "It's heads!" : "It's tails!",
    },
    {
        patterns: [/\b(?:roll a die|roll a dice|roll dice|random number)\b/i],
        respond: () => `You rolled a ${Math.floor(Math.random() * 6) + 1}!`,
    },
    {
        patterns: [/\b(?:what year is it|current year|what's the year)\b/i],
        respond: () => `The current year is ${new Date().getFullYear()}.`,
    },
    {
        patterns: [/\b(?:how many days (?:until|till|to|before)\s+(.+))\b/i],
        respond: (text: string) => {
            const m = text.match(/(?:until|till|to|before)\s+(.+?)(?:\?|$)/i);
            if (!m) return "I couldn't figure out the date. Try saying the full date.";
            const target = new Date(m[1].trim());
            if (isNaN(target.getTime())) return `I couldn't parse "${m[1].trim()}" as a date.`;
            const days = Math.ceil((target.getTime() - Date.now()) / 86400000);
            if (days < 0) return `That was ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago.`;
            if (days === 0) return "That's today!";
            return `${days} day${days !== 1 ? 's' : ''} until ${m[1].trim()}.`;
        },
    },
    {
        patterns: [/\b(?:count(?:down)?\s+to\s+(.+))\b/i],
        respond: (text: string) => {
            const m = text.match(/count(?:down)?\s+to\s+(.+?)(?:\?|$)/i);
            if (!m) return "Count down to what?";
            const target = new Date(m[1].trim());
            if (isNaN(target.getTime())) return `I couldn't parse "${m[1].trim()}" as a date.`;
            const diff = target.getTime() - Date.now();
            if (diff <= 0) return "That date has already passed!";
            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            return `${days} day${days !== 1 ? 's' : ''} and ${hours} hour${hours !== 1 ? 's' : ''} until ${m[1].trim()}.`;
        },
    },
    {
        patterns: [/(?:what(?:'s| is)\s+)?\d+(?:\.\d+)?\s*[\+\-\*x\/]\s*\d+|calculate\s+\d+|compute\s+\d+|\d+\s+(?:plus|minus|times|divided by|multiplied by)\s+\d+/i],
        respond: (text: string) => {
            return evaluateSpokenMath(text) || "I couldn't parse that calculation.";
        },
    },
    {
        patterns: [/\b(?:what(?:'s| is)\s+\d+\s+(?:plus|minus|times|divided by|multiplied by|over|mod)\s+\d+)\b/i],
        respond: (text: string) => {
            return evaluateSpokenMath(text) || "I couldn't parse that calculation.";
        },
    },
    {
        patterns: [/\b(?:battery|battery level|charge level|how much (?:battery|charge))\b/i],
        respond: () => {
            if ('getBattery' in navigator) return 'Checking battery... this feature requires a supported browser.';
            return "Battery info isn't available in this browser.";
        },
    },
    {
        patterns: [/\b(?:random number between|pick a number|give me a number)\b/i],
        respond: (text: string) => {
            const m = text.match(/(?:between|from)\s+(\d+)\s+(?:and|to)\s+(\d+)/i);
            if (m) {
                const min = parseInt(m[1], 10);
                const max = parseInt(m[2], 10);
                const result = Math.floor(Math.random() * (max - min + 1)) + min;
                return `Your random number is ${result}.`;
            }
            return `Your random number is ${Math.floor(Math.random() * 100) + 1}.`;
        },
    },
    {
        patterns: [/\b(?:what day (?:of the week )?(?:is|was|will be)\s+|what day is)\b/i],
        respond: (text: string) => {
            const m = text.match(/(?:is|was|will be)\s+(.+?)(?:\?|$)/i);
            if (m) {
                const d = new Date(m[1].trim());
                if (!isNaN(d.getTime())) {
                    return `${m[1].trim()} is a ${d.toLocaleDateString('en-US', { weekday: 'long' })}.`;
                }
            }
            return `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}.`;
        },
    },
    {
        patterns: [/\b(?:how do you spell|spell|spelling of)\b/i],
        respond: (text: string) => {
            const m = text.match(/(?:spell|spelling of)\s+(\w+)/i);
            if (m) {
                const word = m[1].trim();
                return `${word} is spelled: ${word.toUpperCase().split('').join(' - ')}.`;
            }
            return 'What word would you like me to spell?';
        },
    },
    {
        patterns: [/\b(?:convert|how (?:many|much))\s+\d+/i],
        respond: (text: string) => {
            // Simple unit conversions spoken
            const m = text.match(/(\d+(?:\.\d+)?)\s*(miles?|km|kilometers?|pounds?|lbs?|kg|kilograms?|feet|foot|ft|meters?|m|inches?|in|cm|centimeters?|gallons?|gal|liters?|l|fahrenheit|f|celsius|c|ounces?|oz|grams?|g)\s+(?:to|in|into|as)\s+(\w+)/i);
            if (!m) return "I couldn't parse that conversion. Try something like 'convert 5 miles to kilometers'.";
            const val = parseFloat(m[1]);
            const from = m[2].toLowerCase().replace(/s$/, '');
            const to = m[3].toLowerCase().replace(/s$/, '');
            const conversions: Record<string, Record<string, number>> = {
                mile: { km: 1.60934, kilometer: 1.60934, meter: 1609.34, feet: 5280, foot: 5280 },
                km: { mile: 0.621371, meter: 1000, feet: 3280.84, foot: 3280.84 },
                kilometer: { mile: 0.621371, meter: 1000 },
                pound: { kg: 0.453592, kilogram: 0.453592, ounce: 16, gram: 453.592 },
                lb: { kg: 0.453592, kilogram: 0.453592, ounce: 16, gram: 453.592 },
                kg: { pound: 2.20462, lb: 2.20462, ounce: 35.274, gram: 1000 },
                kilogram: { pound: 2.20462, ounce: 35.274, gram: 1000 },
                foot: { meter: 0.3048, cm: 30.48, centimeter: 30.48, inch: 12, mile: 0.000189394 },
                feet: { meter: 0.3048, cm: 30.48, centimeter: 30.48, inch: 12 },
                ft: { meter: 0.3048, cm: 30.48, inch: 12 },
                meter: { foot: 3.28084, feet: 3.28084, ft: 3.28084, cm: 100, centimeter: 100, inch: 39.3701, mile: 0.000621371, km: 0.001 },
                inch: { cm: 2.54, centimeter: 2.54, foot: 0.0833333, feet: 0.0833333, meter: 0.0254 },
                cm: { inch: 0.393701, meter: 0.01, foot: 0.0328084, feet: 0.0328084 },
                centimeter: { inch: 0.393701, meter: 0.01 },
                gallon: { liter: 3.78541, l: 3.78541 },
                gal: { liter: 3.78541, l: 3.78541 },
                liter: { gallon: 0.264172, gal: 0.264172 },
                l: { gallon: 0.264172, gal: 0.264172 },
                ounce: { gram: 28.3495, g: 28.3495, pound: 0.0625, lb: 0.0625, kg: 0.0283495 },
                oz: { gram: 28.3495, g: 28.3495, pound: 0.0625, lb: 0.0625 },
                gram: { ounce: 0.035274, oz: 0.035274, pound: 0.00220462, kg: 0.001 },
                g: { ounce: 0.035274, oz: 0.035274, pound: 0.00220462, kg: 0.001 },
            };
            // Temperature special case
            if ((from === 'fahrenheit' || from === 'f') && (to === 'celsius' || to === 'c')) {
                return `${val} Fahrenheit is ${((val - 32) * 5 / 9).toFixed(1)} Celsius.`;
            }
            if ((from === 'celsius' || from === 'c') && (to === 'fahrenheit' || to === 'f')) {
                return `${val} Celsius is ${(val * 9 / 5 + 32).toFixed(1)} Fahrenheit.`;
            }
            const factor = conversions[from]?.[to];
            if (factor) {
                const result = (val * factor).toFixed(2);
                return `${val} ${m[2]} is ${result} ${m[3]}.`;
            }
            return `I don't know how to convert ${m[2]} to ${m[3]}.`;
        },
    },
    {
        patterns: [/\b(?:what's?\s+the\s+(?:square root|sqrt)\s+of\s+\d+)\b/i],
        respond: (text: string) => {
            const m = text.match(/(?:square root|sqrt)\s+of\s+(\d+(?:\.\d+)?)/i);
            if (m) {
                const val = parseFloat(m[1]);
                return `The square root of ${val} is ${Math.sqrt(val).toFixed(4)}.`;
            }
            return "I couldn't parse that.";
        },
    },
    {
        patterns: [/\b(?:what's?\s+\d+\s*(?:percent|%)\s+of\s+\d+)\b/i],
        respond: (text: string) => {
            const m = text.match(/(\d+(?:\.\d+)?)\s*(?:percent|%)\s+of\s+(\d+(?:\.\d+)?)/i);
            if (m) {
                const pct = parseFloat(m[1]);
                const val = parseFloat(m[2]);
                return `${pct}% of ${val} is ${(pct / 100 * val).toFixed(2)}.`;
            }
            return "I couldn't parse that.";
        },
    },
    {
        patterns: [/\b(?:what's?\s+\d+\s*(?:squared|cubed|to the power))\b/i],
        respond: (text: string) => {
            const m = text.match(/(\d+(?:\.\d+)?)\s*(?:squared|to the power of 2)/i);
            if (m) return `${m[1]} squared is ${Math.pow(parseFloat(m[1]), 2)}.`;
            const m2 = text.match(/(\d+(?:\.\d+)?)\s*(?:cubed|to the power of 3)/i);
            if (m2) return `${m2[1]} cubed is ${Math.pow(parseFloat(m2[1]), 3)}.`;
            const m3 = text.match(/(\d+(?:\.\d+)?)\s*to the power of\s*(\d+)/i);
            if (m3) return `${m3[1]} to the power of ${m3[2]} is ${Math.pow(parseFloat(m3[1]), parseInt(m3[2]))}.`;
            return "I couldn't parse that.";
        },
    },
];

/**
 * Process a recognized speech command offline.
 * Runs the text through the transcript analyzer, then handles special
 * commands that need async work (weather fetch, music search, etc.).
 */
async function processOfflineCommand(text: string) {
    if (!text || !callbacks) return;
    console.log('[OfflineSpeech] processOfflineCommand:', text);

    const normalized = text.toLowerCase().trim();

    // ── Check for close/dismiss commands ──
    if (/\b(?:close|dismiss|hide|clear)\s+(?:all\s+)?(?:cards?|everything|all)\b/i.test(normalized) ||
        /\b(?:never\s*mind|cancel)\b/i.test(normalized)) {
        callbacks.onCardEvent({ type: 'close_all', data: {} });
        callbacks.onSpeak('Done.');
        callbacks.onStatusChange('idle');
        return;
    }

    // ── Check for disconnect/stop commands ──
    if (/^(?:stop|stop listening|disconnect|go away|goodbye|bye)$/i.test(normalized)) {
        callbacks.onSpeak('Going offline. Say the wake word to start again.');
        stopOfflineListening();
        return;
    }

    // ── Note taking: "take a note ...", "save a note ..." ──
    const noteMatch = text.match(/(?:take\s+(?:a\s+)?note|save\s+(?:a\s+)?note|make\s+a\s+note|write\s+(?:this\s+)?down|jot\s+(?:this\s+)?down)\s*(?:that\s+|to\s+|about\s+|of\s+)?[:\-]?\s*(.+?)(?:\.|!|$)/i)
        || text.match(/note\s+that\s+(.+?)(?:\.|!|$)/i);
    if (noteMatch) {
        const noteText = noteMatch[1].trim();
        if (noteText.length >= 2) {
            const note = saveNote(noteText);
            callbacks.onCardEvent({
                type: 'list',
                data: { title: 'Note Saved', items: [note.text] },
                autoDismissMs: 5000,
            });
            callbacks.onSpeak(`Got it. Note saved: ${noteText}`);
            callbacks.onStatusChange('idle');
            return;
        }
    }

    // ── Show notes: "show me my notes", "what are my notes" ──
    if (/\b(?:show\s+(?:me\s+)?(?:my\s+)?notes|what\s+(?:are\s+)?my\s+notes|read\s+(?:me\s+)?(?:my\s+)?notes|list\s+(?:my\s+)?notes|view\s+(?:my\s+)?notes|open\s+(?:my\s+)?notes)\b/i.test(normalized)) {
        const notes = getNotes();
        if (notes.length === 0) {
            callbacks.onSpeak("You don't have any notes yet. Say 'take a note' followed by what you want to remember.");
        } else {
            callbacks.onCardEvent({
                type: 'list',
                data: {
                    title: 'My Notes',
                    items: notes.map(n => n.text),
                    itemIds: notes.map(n => n.id),
                    deletable: true,
                },
                persistent: true,
            });
            callbacks.onSpeak(`You have ${notes.length} note${notes.length !== 1 ? 's' : ''}.`);
        }
        callbacks.onStatusChange('idle');
        return;
    }

    // ── Delete/clear all notes: "clear my notes", "delete all notes" ──
    if (/\b(?:clear|delete|remove|erase)\s+(?:all\s+)?(?:my\s+)?notes\b/i.test(normalized)) {
        const notes = getNotes();
        for (const n of notes) deleteNote(n.id);
        callbacks.onSpeak(notes.length > 0 ? `Cleared ${notes.length} note${notes.length !== 1 ? 's' : ''}.` : 'No notes to clear.');
        callbacks.onStatusChange('idle');
        return;
    }

    // ── Show reminders: "show me my reminders", "what do I need to do" ──
    if (/\b(?:show\s+(?:me\s+)?(?:my\s+)?reminders|what\s+(?:are\s+)?my\s+reminders|list\s+(?:my\s+)?reminders|view\s+(?:my\s+)?reminders|what\s+do\s+i\s+(?:need|have)\s+to\s+do|open\s+(?:my\s+)?reminders)\b/i.test(normalized)) {
        const reminders = getReminders().filter(r => !r.done);
        if (reminders.length === 0) {
            callbacks.onSpeak("You don't have any active reminders.");
        } else {
            callbacks.onCardEvent({
                type: 'list',
                data: {
                    title: 'My Reminders',
                    items: reminders.map(r => `${r.text}${r.timeDescription ? ' -- ' + r.timeDescription : ''}`),
                    itemIds: reminders.map(r => r.id),
                    deletable: true,
                },
                persistent: true,
            });
            callbacks.onSpeak(`You have ${reminders.length} reminder${reminders.length !== 1 ? 's' : ''}.`);
        }
        callbacks.onStatusChange('idle');
        return;
    }

    // ── Clear reminders: "clear my reminders", "delete all reminders" ──
    if (/\b(?:clear|delete|remove|erase)\s+(?:all\s+)?(?:my\s+)?reminders\b/i.test(normalized)) {
        const reminders = getReminders();
        for (const r of reminders) deleteReminder(r.id);
        callbacks.onSpeak(reminders.length > 0 ? `Cleared ${reminders.length} reminder${reminders.length !== 1 ? 's' : ''}.` : 'No reminders to clear.');
        callbacks.onStatusChange('idle');
        return;
    }

    // ── Try transcript analyzer first (synchronous) ──
    let cardEvent = analyzeTranscript(text, false, 'offline');

    // Resolve entity IDs for device/camera/thermostat
    if (cardEvent && entityCache.length > 0 &&
        (cardEvent.type === 'device' || cardEvent.type === 'camera' || cardEvent.type === 'thermostat')) {
        // Save the intended action state before resolution overwrites it
        const intendedState = (cardEvent.data as { state?: string }).state;
        cardEvent = resolveCardEntityId(cardEvent, entityCache);

        const resolvedEntityId = (cardEvent.data as { entityId?: string }).entityId;

        // If entity resolution failed, tell the user instead of showing a broken card
        if (!resolvedEntityId) {
            const friendlyName = (cardEvent.data as { friendlyName?: string; cameraName?: string }).friendlyName
                || (cardEvent.data as { cameraName?: string }).cameraName
                || (cardEvent.data as { name?: string }).name || '';
            if (cardEvent.type === 'camera') {
                callbacks.onSpeak(`I couldn't find a camera called "${friendlyName}" in your smart home.`);
            } else {
                callbacks.onSpeak(`I couldn't find a device called "${friendlyName}" in your smart home. Make sure Home Assistant is connected.`);
            }
            callbacks.onStatusChange('idle');
            return;
        }

        // Restore the intended state for optimistic display (resolveCardEntityId
        // overwrites state with the current HA state from cache)
        if (cardEvent.type === 'device' && intendedState) {
            cardEvent = {
                ...cardEvent,
                data: {
                    ...cardEvent.data,
                    state: intendedState,
                    resolvedState: intendedState,
                } as unknown as Record<string, unknown>,
            };
        }
        // Inject haUrl and haToken for camera cards so CameraCard can fetch snapshots
        if (cardEvent.type === 'camera' && getHaMcpEnabled()) {
            const haUrl = getHaMcpUrl().replace(/\/+$/, '').replace(/\/api\/mcp\/?$/, '');
            void getHaMcpTokenAsync().then(token => {
                if (token && callbacks) {
                    callbacks.onCardEvent({
                        ...cardEvent!,
                        data: {
                            ...cardEvent!.data,
                            haUrl,
                            haToken: token,
                        } as unknown as Record<string, unknown>,
                        persistent: true,
                    });
                }
            });
            // Don't emit the card yet -- the async callback above will emit it with credentials
            speakCardConfirmation(cardEvent);
            callbacks.onStatusChange('idle');
            return;
        }
    } else if (cardEvent &&
        (cardEvent.type === 'device' || cardEvent.type === 'camera' || cardEvent.type === 'thermostat') &&
        entityCache.length === 0) {
        // HA entity cache not loaded -- can't resolve or control devices
        const friendlyName = (cardEvent.data as { friendlyName?: string; cameraName?: string }).friendlyName
            || (cardEvent.data as { cameraName?: string }).cameraName || '';
        callbacks.onSpeak(`I can't control "${friendlyName}" because Home Assistant is not connected. Please connect to Home Assistant in settings.`);
        callbacks.onStatusChange('idle');
        return;
    }

    if (cardEvent) {
        // Handle special meta-events that need persistence actions
        if (cardEvent.type === 'note_save') {
            const noteData = cardEvent.data as { text: string; category?: string };
            const note = saveNote(noteData.text, noteData.category || 'general');
            callbacks.onCardEvent({
                type: 'list',
                data: { title: 'Note Saved', items: [note.text] },
                autoDismissMs: 5000,
            });
            callbacks.onSpeak(`Got it. Note saved: ${noteData.text}`);
            callbacks.onStatusChange('idle');
            return;
        }
        if (cardEvent.type === 'show_notes') {
            const notes = getNotes();
            if (notes.length === 0) {
                callbacks.onSpeak("You don't have any notes yet.");
            } else {
                callbacks.onCardEvent({
                    type: 'list',
                    data: { title: 'My Notes', items: notes.map(n => n.text), itemIds: notes.map(n => n.id), deletable: true },
                    persistent: true,
                });
                callbacks.onSpeak(`You have ${notes.length} note${notes.length !== 1 ? 's' : ''}.`);
            }
            callbacks.onStatusChange('idle');
            return;
        }
        if (cardEvent.type === 'show_reminders') {
            const reminders = getReminders().filter(r => !r.done);
            if (reminders.length === 0) {
                callbacks.onSpeak("You don't have any active reminders.");
            } else {
                callbacks.onCardEvent({
                    type: 'list',
                    data: {
                        title: 'My Reminders',
                        items: reminders.map(r => `${r.text}${r.timeDescription ? ' -- ' + r.timeDescription : ''}`),
                        itemIds: reminders.map(r => r.id),
                        deletable: true,
                    },
                    persistent: true,
                });
                callbacks.onSpeak(`You have ${reminders.length} reminder${reminders.length !== 1 ? 's' : ''}.`);
            }
            callbacks.onStatusChange('idle');
            return;
        }
        // Persist reminders detected by the transcript analyzer
        if (cardEvent.type === 'reminder') {
            const rData = cardEvent.data as { text?: string; scheduledTime?: string };
            saveReminder(rData.text || '', rData.scheduledTime || 'Soon');
        }

        // ── Resolve sensor reading from HA entity cache ──
        if (cardEvent.type === 'sensorReading') {
            if (entityCache.length === 0) {
                callbacks.onSpeak('I need Home Assistant to check sensor readings. Please connect to Home Assistant in settings.');
                callbacks.onStatusChange('idle');
                return;
            }
            const sData = cardEvent.data as { deviceClass?: string; area?: string; query?: string };
            const resolved = resolveSensorReading(sData.deviceClass || 'temperature', sData.area || '', entityCache);
            if (resolved) {
                callbacks.onCardEvent(resolved);
                const rd = resolved.data as { friendlyName?: string; value?: string; unit?: string };
                callbacks.onSpeak(`${rd.friendlyName || 'Sensor'} reads ${rd.value}${rd.unit ? ' ' + rd.unit : ''}.`);
                callbacks.onStatusChange('idle');
                return;
            }
            callbacks.onSpeak("I couldn't find a matching sensor in your smart home.");
            callbacks.onStatusChange('idle');
            return;
        }

        // ── Resolve home status from HA entity cache ──
        if (cardEvent.type === 'homeStatus') {
            if (entityCache.length === 0) {
                callbacks.onSpeak('I need Home Assistant to check home status. Please connect to Home Assistant in settings.');
                callbacks.onStatusChange('idle');
                return;
            }
            const hsData = cardEvent.data as { kind?: string; area?: string; query?: string };
            const resolved = resolveHomeStatus(hsData.kind || 'door', hsData.area || '', entityCache);
            if (resolved) {
                callbacks.onCardEvent(resolved);
                const rd = resolved.data as { title?: string; items?: Array<{ state?: string }> };
                const items = rd.items || [];
                const activeCount = items.filter(i => {
                    const s = (i.state || '').toLowerCase();
                    return s === 'open' || s === 'on' || s === 'home' || s === 'detected';
                }).length;
                if (hsData.kind === 'motion') {
                    callbacks.onSpeak(activeCount > 0 ? `Motion detected in ${activeCount} area${activeCount !== 1 ? 's' : ''}.` : 'No motion detected.');
                } else if (hsData.kind === 'presence') {
                    callbacks.onSpeak(activeCount > 0 ? `${activeCount} person${activeCount !== 1 ? 's' : ''} home.` : 'Nobody is home.');
                } else {
                    callbacks.onSpeak(activeCount > 0 ? `${activeCount} ${hsData.kind || 'item'}${activeCount !== 1 ? 's' : ''} open.` : `All ${hsData.kind || 'item'}s are closed.`);
                }
                callbacks.onStatusChange('idle');
                return;
            }
            callbacks.onSpeak(`I couldn't find any ${hsData.kind || 'status'} sensors in your smart home.`);
            callbacks.onStatusChange('idle');
            return;
        }

        // ── Chores (offline) ──
        if (cardEvent.type === 'chore') {
            try {
                const { getChores } = await import('./chorePersistence');
                const chores = getChores();
                callbacks.onCardEvent({
                    type: 'chore',
                    data: { title: 'Chores & Tasks', chores, mode: 'list' },
                    persistent: true,
                });
                const done = chores.filter(c => c.completed).length;
                callbacks.onSpeak(`You have ${chores.length} chore${chores.length !== 1 ? 's' : ''}, ${done} done.`);
            } catch {
                callbacks.onSpeak('Could not load chores.');
            }
            callbacks.onStatusChange('idle');
            return;
        }

        // ── Gmail (offline) ──
        if (cardEvent.type === 'gmail') {
            try {
                const { listMessages } = await import('./gmailApi');
                const query = (cardEvent.data as { query?: string }).query;
                const { messages, totalUnread } = await listMessages({
                    maxResults: 10,
                    query,
                    labelIds: query ? undefined : ['INBOX'],
                });
                callbacks.onCardEvent({
                    type: 'gmail',
                    data: { messages, totalUnread, mode: query ? 'search' : 'inbox', query },
                    persistent: true,
                });
                if (messages.length === 0) {
                    callbacks.onSpeak(query ? `No emails found for "${query}".` : 'Your inbox is empty.');
                } else {
                    callbacks.onSpeak(`You have ${messages.length} email${messages.length !== 1 ? 's' : ''}${totalUnread > 0 ? `, ${totalUnread} unread` : ''}.`);
                }
            } catch {
                callbacks.onSpeak('Could not check email. Make sure Gmail is connected in settings.');
            }
            callbacks.onStatusChange('idle');
            return;
        }

        // ── Outlook mail (offline) ──
        if (cardEvent.type === 'outlookMail') {
            try {
                const { listMessages } = await import('./outlookMailApi');
                const { messages, totalUnread } = await listMessages({ maxResults: 10 });
                callbacks.onCardEvent({
                    type: 'outlookMail',
                    data: { messages, totalUnread, mode: 'inbox' },
                    persistent: true,
                });
                if (messages.length === 0) {
                    callbacks.onSpeak('Your Outlook inbox is empty.');
                } else {
                    callbacks.onSpeak(`You have ${messages.length} Outlook email${messages.length !== 1 ? 's' : ''}${totalUnread > 0 ? `, ${totalUnread} unread` : ''}.`);
                }
            } catch {
                callbacks.onSpeak('Could not check Outlook. Make sure Microsoft is connected in settings.');
            }
            callbacks.onStatusChange('idle');
            return;
        }

        // ── Slack (offline -- serves cached messages) ──
        if (cardEvent.type === 'slack') {
            // The slack detector already populates cached messages in the card data
            const slackData = cardEvent.data as { messages?: any[]; channelName?: string; offline?: boolean };
            if (slackData.messages && slackData.messages.length > 0) {
                callbacks.onCardEvent(cardEvent);
                callbacks.onSpeak(`Showing ${slackData.messages.length} Slack message${slackData.messages.length !== 1 ? 's' : ''} from ${slackData.channelName || 'Slack'}${slackData.offline ? ' (cached)' : ''}.`);
            } else {
                callbacks.onSpeak('No cached Slack messages available. Connect to the internet and check Slack first.');
            }
            callbacks.onStatusChange('idle');
            return;
        }

        // ── Flight tracking (offline) ──
        if (cardEvent.type === 'flight') {
            const fData = cardEvent.data as { flightNumber?: string; origin?: string; destination?: string };
            try {
                const { getFlightByNumber } = await import('./flightApi');
                if (fData.flightNumber && fData.flightNumber !== 'Route Search') {
                    const flight = await getFlightByNumber(fData.flightNumber);
                    if (flight) {
                        callbacks.onCardEvent({ type: 'flight', data: flight as unknown as Record<string, unknown> });
                        callbacks.onSpeak(`Flight ${flight.flightNumber} is ${flight.status}. From ${flight.origin} to ${flight.destination}.`);
                    } else {
                        callbacks.onSpeak(`Could not find flight ${fData.flightNumber}.`);
                    }
                } else {
                    callbacks.onSpeak('I found a route search request. Please use the online assistant for route-based flight lookups.');
                }
            } catch {
                callbacks.onSpeak('Could not look up flight information.');
            }
            callbacks.onStatusChange('idle');
            return;
        }

        // ── Energy (offline -- needs HA) ──
        if (cardEvent.type === 'energy') {
            if (entityCache.length === 0) {
                callbacks.onSpeak('I need Home Assistant to check energy data. Please connect in settings.');
            } else {
                callbacks.onSpeak('Energy dashboard requires the online assistant to fetch sensor data from Home Assistant.');
            }
            callbacks.onStatusChange('idle');
            return;
        }

        // ── Security (offline -- needs HA) ──
        if (cardEvent.type === 'security') {
            if (entityCache.length === 0) {
                callbacks.onSpeak('I need Home Assistant to check security status. Please connect in settings.');
            } else {
                callbacks.onSpeak('Security status requires the online assistant to fetch alarm and lock states from Home Assistant.');
            }
            callbacks.onStatusChange('idle');
            return;
        }

        callbacks.onCardEvent(cardEvent);
        speakCardConfirmation(cardEvent);
        // Execute device/thermostat actions via HA REST API
        if ((cardEvent.type === 'device' || cardEvent.type === 'thermostat') &&
            (cardEvent.data as { entityId?: string }).entityId) {
            void executeDeviceAction(cardEvent);
        }
        callbacks.onStatusChange('idle');
        return;
    }

    // ── Try async handlers for commands that need network/API calls ──

    // Weather — expanded patterns for spoken queries
    if (/\b(?:weather|temperature|forecast|how (?:hot|cold|warm) is it|what's it like outside|do i need (?:a )?(?:jacket|umbrella|coat)|will it (?:rain|snow)|is it (?:going to )?(?:rain|snow|cold|hot|warm))\b/i.test(normalized)) {
        callbacks.onSpeak('Checking the weather.');
        try {
            const weatherEvent = await fetchOfflineWeather();
            if (weatherEvent) {
                callbacks.onCardEvent(weatherEvent);
                // Also speak the weather
                const data = weatherEvent.data as { temperature?: number; condition?: string; unit?: string };
                if (data.temperature) {
                    callbacks.onSpeak(`It's currently ${data.temperature} degrees ${data.unit === 'C' ? 'Celsius' : 'Fahrenheit'}, ${data.condition || 'clear'}.`);
                }
            } else {
                callbacks.onSpeak('Sorry, I could not fetch the weather right now.');
            }
        } catch {
            callbacks.onSpeak('Sorry, I could not fetch the weather right now.');
        }
        callbacks.onStatusChange('idle');
        return;
    }

    // Music / Video — detect video intent first, then fall back to music
    // "Play Adele music videos", "play rolling in the deep video", "play cat videos"
    const isVideoIntent = /\b(?:video|videos|music\s*video|music\s*videos|mv|clip|clips)\b/i.test(normalized);

    if (isVideoIntent && /\bplay\b/i.test(normalized)) {
        const query = normalized
            .replace(/\b(?:play|play me|put on|watch|show|find|search|look up|listen to|some|please|for me|on youtube|can you|could you|a)\b/gi, '')
            .replace(/\b(?:music\s*)?(?:video|videos|mv|clip|clips)\b/gi, '')
            .trim();
        if (query && query.length > 1) {
            callbacks.onCardEvent({
                type: 'youtube',
                data: { searchQuery: `${query} music video`, title: query } as unknown as Record<string, unknown>,
                persistent: true,
            });
            callbacks.onSpeak(`Playing ${query} video.`);
        } else {
            callbacks.onSpeak('What video would you like to watch?');
        }
        callbacks.onStatusChange('idle');
        return;
    }

    // YouTube video — "show a video about X", "watch X on youtube"
    if (/\b(?:show|find|search|look up|watch)\s+(?:a\s+)?(?:video|youtube|clip)\b/i.test(normalized) ||
        /\b(?:youtube|video)\s+(?:of|about|for)\s+/i.test(normalized)) {
        const query = normalized
            .replace(/\b(?:show|find|search|look up|watch|a|video|youtube|clip|on|for|me|please|of|about|can you|could you)\b/gi, '')
            .trim();
        if (query && query.length > 1) {
            callbacks.onCardEvent({
                type: 'youtube',
                data: { searchQuery: query, title: query } as unknown as Record<string, unknown>,
                persistent: true,
            });
            callbacks.onSpeak(`Searching YouTube for ${query}.`);
        }
        callbacks.onStatusChange('idle');
        return;
    }

    // Music -- "play Adele", "play some jazz", "put on rolling in the deep"
    if (/\b(?:play|play me|put on|listen to)\s+(?:some\s+)?(?:music|song|songs?|track)\b/i.test(normalized) ||
        /\bplay\s+.{3,}/i.test(normalized)) {
        const query = normalized
            .replace(/\b(?:play|play me|put on|listen to|some|music|song|songs?|track|please|for me|on youtube|can you|could you)\b/gi, '')
            .trim();
        console.log('[OfflineSpeech] Music intent detected. Raw:', normalized, '| Cleaned query:', query);
        if (query && query.length > 1) {
            callbacks.onSpeak(`Searching for ${query}.`);
            try {
                console.log('[OfflineSpeech] Calling searchOfflineMusic for:', query);
                const musicEvent = await searchOfflineMusic(query);
                console.log('[OfflineSpeech] searchOfflineMusic result:', musicEvent ? 'got card' : 'null');
                if (musicEvent) {
                    callbacks.onCardEvent(musicEvent);
                } else {
                    callbacks.onSpeak(`Sorry, I couldn't find "${query}".`);
                }
            } catch (err) {
                console.error('[OfflineSpeech] Music search error:', err);
                callbacks.onSpeak('Sorry, I could not find that music.');
            }
        } else {
            callbacks.onSpeak('What would you like me to play?');
        }
        callbacks.onStatusChange('idle');
        return;
    }

    // Pause/resume/stop music
    if (/\b(?:pause|stop|resume|unpause|continue)\s*(?:the\s+)?(?:music|song|playback|player)?\s*$/i.test(normalized)) {
        try {
            if (/\b(?:pause|stop)\b/i.test(normalized)) {
                musicPlaybackService.pause();
                callbacks.onSpeak('Music paused.');
            } else {
                musicPlaybackService.resume();
                callbacks.onSpeak('Resuming music.');
            }
        } catch {
            callbacks.onSpeak('No music is playing.');
        }
        callbacks.onStatusChange('idle');
        return;
    }

    // Device control via HA REST API (when entity cache is available)
    if (entityCache.length > 0 && /\b(?:turn|switch|toggle|lock|unlock|open|close|dim|brighten|set|activate|run)\b/i.test(normalized)) {
        // The transcript analyzer already handles device detection, but if it didn't fire,
        // try a more aggressive match for offline mode
        const deviceEvent = forceDeviceDetection(text);
        if (deviceEvent) {
            const intendedState = (deviceEvent.data as { state?: string }).state;
            const resolved = resolveCardEntityId(deviceEvent, entityCache);
            const resolvedEntityId = (resolved.data as { entityId?: string }).entityId;

            if (!resolvedEntityId) {
                const target = (resolved.data as { friendlyName?: string }).friendlyName || '';
                callbacks.onSpeak(`I couldn't find a device called "${target}" in your smart home.`);
                callbacks.onStatusChange('idle');
                return;
            }

            // Restore intended state for optimistic display
            let finalEvent = resolved;
            if (intendedState) {
                finalEvent = {
                    ...resolved,
                    data: { ...resolved.data, state: intendedState, resolvedState: intendedState } as unknown as Record<string, unknown>,
                };
            }
            callbacks.onCardEvent(finalEvent);
            speakCardConfirmation(finalEvent);
            // Try to actually execute the action via HA REST
            void executeDeviceAction(finalEvent);
            callbacks.onStatusChange('idle');
            return;
        }
    }

    // ── Scene / routine activation: "activate movie mode", "run bedtime routine" ──
    if (entityCache.length > 0 && /\b(?:activate|run|trigger|start|set)\s+(?:the\s+)?(?:scene|routine|mode|automation)\b/i.test(normalized)) {
        const sceneMatch = text.match(/(?:activate|run|trigger|start|set)\s+(?:the\s+)?(?:(.+?)\s+)?(?:scene|routine|mode|automation)/i);
        if (sceneMatch) {
            const sceneName = sceneMatch[1]?.trim() || '';
            if (sceneName.length > 1) {
                const sceneEntity = entityCache.find(e =>
                    (e.domain === 'scene' || e.domain === 'script' || e.domain === 'automation') &&
                    e.name.toLowerCase().includes(sceneName.toLowerCase())
                );
                if (sceneEntity) {
                    callbacks.onSpeak(`Activating ${sceneEntity.name}.`);
                    void executeSceneAction(sceneEntity.entity_id, sceneEntity.domain);
                } else {
                    callbacks.onSpeak(`I couldn't find a scene or routine called "${sceneName}".`);
                }
                callbacks.onStatusChange('idle');
                return;
            }
        }
    }

    // ── "All lights off/on": bulk control ──
    if (entityCache.length > 0 && /\b(?:turn|switch)\s+(?:off|on)\s+(?:all\s+)?(?:the\s+)?lights\b/i.test(normalized)) {
        const isOn = /\bon\b/i.test(normalized);
        const lights = entityCache.filter(e => e.domain === 'light');
        if (lights.length > 0) {
            callbacks.onSpeak(`Turning ${isOn ? 'on' : 'off'} ${lights.length} light${lights.length !== 1 ? 's' : ''}.`);
            for (const light of lights) {
                void executeDeviceAction({
                    type: 'device',
                    data: { entityId: light.entity_id, state: isOn ? 'on' : 'off', domain: 'light' } as unknown as Record<string, unknown>,
                });
            }
        } else {
            callbacks.onSpeak("I don't see any lights in your smart home.");
        }
        callbacks.onStatusChange('idle');
        return;
    }

    // ── Brightness control: "set bedroom lights to 50%", "dim the living room to 30" ──
    if (entityCache.length > 0 && /\b(?:set|dim|brighten|brightness)\b.*\b\d+\s*%?\b/i.test(normalized)) {
        const brightnessMatch = text.match(/(?:set|dim|brighten|brightness)\s+(?:the\s+)?(.+?)\s+(?:to\s+)?(\d+)\s*%?/i);
        if (brightnessMatch) {
            const target = brightnessMatch[1].trim().toLowerCase();
            const level = Math.min(100, Math.max(0, parseInt(brightnessMatch[2], 10)));
            const lightEntity = entityCache.find(e =>
                e.domain === 'light' &&
                (e.name.toLowerCase().includes(target) ||
                 e.entity_id.toLowerCase().includes(target.replace(/\s+/g, '_')) ||
                 (e.area && e.area.toLowerCase().includes(target)))
            );
            if (lightEntity) {
                callbacks.onSpeak(`Setting ${lightEntity.name} to ${level} percent.`);
                void executeBrightnessAction(lightEntity.entity_id, level);
                callbacks.onStatusChange('idle');
                return;
            }
        }
    }

    // ── Device status queries: "is the front door locked?", "is the garage open?" ──
    if (entityCache.length > 0 && /\b(?:is\s+(?:the\s+)?|what'?s?\s+(?:the\s+)?|status\s+of|check\s+(?:the\s+)?)\b/i.test(normalized) &&
        /\b(?:locked|unlocked|open|closed|on|off|running|temperature|temp|set to)\b/i.test(normalized)) {
        const statusEntity = findEntityBySpokenName(normalized, entityCache);
        if (statusEntity) {
            const state = statusEntity.state || 'unknown';
            callbacks.onSpeak(`${statusEntity.name} is currently ${state}.`);
            callbacks.onStatusChange('idle');
            return;
        }
    }

    // ── Directions / Navigation ──
    // Covers: "directions to X", "how do I get to X", "navigate to X", "take me to X",
    // "where is X", "how far is X", "find X near me", "nearest X",
    // "what's the best way to get to X", "show me how to get to X",
    // "I need to go to X", "can you get me to X", "map of X", "map to X"
    const directionsPattern = /\b(?:directions?\s+to|navigate\s+to|how\s+(?:do\s+i\s+|can\s+i\s+)?get\s+to|route\s+to|take\s+me\s+to|show\s+(?:me\s+)?(?:the\s+)?(?:way|route|directions?)\s+to|(?:best|fastest|quickest|shortest)\s+(?:way|route)\s+to|i\s+need\s+to\s+(?:go|get|drive|walk|bike)\s+to|(?:can\s+you\s+)?get\s+me\s+to|map\s+(?:to|of)|how\s+far\s+(?:is|to)|how\s+long\s+(?:to\s+(?:get|drive|walk)\s+to|does\s+it\s+take\s+to\s+(?:get|drive|walk)\s+to))\b/i;
    if (directionsPattern.test(normalized)) {
        const destPatterns = [
            /(?:directions?\s+to|navigate\s+to|route\s+to|take\s+me\s+to|map\s+to)\s+(.+?)(?:\?|!|$)/i,
            /(?:how\s+(?:do\s+i\s+|can\s+i\s+)?get\s+to|how\s+far\s+(?:is|to))\s+(.+?)(?:\?|!|$)/i,
            /(?:best|fastest|quickest|shortest)\s+(?:way|route)\s+to\s+(.+?)(?:\?|!|$)/i,
            /show\s+(?:me\s+)?(?:the\s+)?(?:way|route|directions?)\s+to\s+(.+?)(?:\?|!|$)/i,
            /(?:need\s+to\s+(?:go|get|drive|walk|bike)\s+to|get\s+me\s+to)\s+(.+?)(?:\?|!|$)/i,
            /how\s+long\s+(?:to\s+(?:get|drive|walk)\s+to|does\s+it\s+take\s+to\s+(?:get|drive|walk)\s+to)\s+(.+?)(?:\?|!|$)/i,
            /map\s+of\s+(.+?)(?:\?|!|$)/i,
        ];

        let destination = '';
        for (const p of destPatterns) {
            const m = text.match(p);
            if (m) { destination = m[1].trim(); break; }
        }

        // Strip trailing filler
        destination = destination
            .replace(/\s+(?:please|right now|now|from here|from my location|by car|by foot|walking|driving|on foot)$/i, '')
            .trim();

        // Detect travel mode from the query
        let travelMode: 'driving' | 'walking' | 'transit' | 'bicycling' | undefined;
        if (/\b(?:walk|walking|on foot|by foot)\b/i.test(normalized)) travelMode = 'walking';
        else if (/\b(?:bus|train|subway|metro|transit|public transport)\b/i.test(normalized)) travelMode = 'transit';
        else if (/\b(?:bike|bicycle|cycling|biking)\b/i.test(normalized)) travelMode = 'bicycling';

        // Detect explicit origin: "from X to Y"
        let explicitOrigin: string | undefined;
        const fromToMatch = text.match(/from\s+(.+?)\s+to\s+(.+?)(?:\?|!|$)/i);
        if (fromToMatch) {
            explicitOrigin = fromToMatch[1].trim();
            destination = fromToMatch[2].trim();
        }

        if (destination && destination.length > 1) {
            callbacks.onSpeak(`Getting directions to ${destination}.`);
            try {
                const dirEvent = await fetchDirections(destination, explicitOrigin, travelMode);
                if (dirEvent) {
                    callbacks.onCardEvent(dirEvent);
                    const data = dirEvent.data as { duration?: string; durationInTraffic?: string; distance?: string };
                    const time = data.durationInTraffic || data.duration;
                    if (time) {
                        callbacks.onSpeak(`It's about ${time}${data.distance ? ', ' + data.distance : ''}.`);
                    }
                } else {
                    callbacks.onSpeak(`Sorry, I couldn't get directions to ${destination}.`);
                }
            } catch {
                callbacks.onSpeak('Sorry, directions are not available right now.');
            }
            callbacks.onStatusChange('idle');
            return;
        }
    }

    // ── "Where is X" / "find X near me" / "nearest X" -- places search ──
    if (/\b(?:where\s+is\s+(?:the\s+)?(?:nearest|closest)|find\s+(?:a\s+|the\s+)?(?:nearby|near me)|nearest\s+\w+|closest\s+\w+|where\s+can\s+i\s+find)\b/i.test(normalized)) {
        const placeMatch = text.match(/(?:where\s+is\s+(?:the\s+)?(?:nearest|closest)\s+|find\s+(?:a\s+|the\s+)?(?:nearby\s+)?|nearest\s+|closest\s+|where\s+can\s+i\s+find\s+(?:a\s+)?)(.+?)(?:\s+near\s+(?:me|here))?(?:\?|!|$)/i);
        if (placeMatch) {
            const query = placeMatch[1].trim();
            if (query.length > 1) {
                // Use directions to the place name as a simple fallback
                callbacks.onSpeak(`Searching for ${query} nearby.`);
                try {
                    const dirEvent = await fetchDirections(query + ' near me');
                    if (dirEvent) {
                        callbacks.onCardEvent(dirEvent);
                        const data = dirEvent.data as { duration?: string; distance?: string };
                        if (data.duration) {
                            callbacks.onSpeak(`Found one about ${data.duration} away.`);
                        }
                    } else {
                        callbacks.onSpeak(`Sorry, I couldn't find ${query} nearby.`);
                    }
                } catch {
                    callbacks.onSpeak('Sorry, location search is not available right now.');
                }
                callbacks.onStatusChange('idle');
                return;
            }
        }
    }

    // ── Traffic / commute ──
    // Covers: "how's traffic", "how long to get to work", "commute time",
    // "what's my commute", "traffic to work", "ETA to office",
    // "how long will it take to drive to work", "is there traffic"
    if (/\b(?:traffic|commute|how long (?:to|will it take|does it take)|drive time|travel time|eta\s+to|is there traffic|what'?s?\s+(?:my\s+)?commute)\b/i.test(normalized)) {
        const isToWork = /\b(?:work|office|job|the office)\b/i.test(normalized);
        const isToHome = /\b(?:home|house|my place)\b/i.test(normalized);
        let destination = '';
        let origin = '';

        if (isToWork) {
            destination = getWorkLocation();
            origin = getHomeLocation();
        } else if (isToHome) {
            destination = getHomeLocation();
            origin = getWorkLocation();
        } else {
            // Try to extract destination: "traffic to downtown", "how long to the airport"
            const m = text.match(/(?:traffic\s+to|to\s+(?:get\s+to\s+)?|eta\s+to)\s+(.+?)(?:\?|!|$)/i);
            if (m) destination = m[1].trim();
        }

        if (destination) {
            callbacks.onSpeak('Checking traffic.');
            try {
                const dirEvent = await fetchDirections(destination, origin || undefined);
                if (dirEvent) {
                    callbacks.onCardEvent(dirEvent);
                    const data = dirEvent.data as { duration?: string; durationInTraffic?: string; distance?: string };
                    const time = data.durationInTraffic || data.duration;
                    if (time) {
                        callbacks.onSpeak(`It's about ${time} to get there${data.distance ? ', ' + data.distance : ''}.`);
                    }
                } else {
                    callbacks.onSpeak('Sorry, I could not check traffic right now.');
                }
            } catch {
                callbacks.onSpeak('Sorry, traffic info is not available right now.');
            }
        } else {
            callbacks.onSpeak('Where would you like to check traffic to? You can set home and work locations in settings.');
        }
        callbacks.onStatusChange('idle');
        return;
    }

    // ── Math expressions: "1 + 1", "5 times 3", "what is 10 divided by 2" ──
    const mathResult = evaluateSpokenMath(text);
    if (mathResult) {
        callbacks.onSpeak(mathResult);
        // Also show a calculation card
        const mathMatch = text.match(/(-?\d+(?:\.\d+)?)\s*(?:[\+\-\*x\/]|plus|minus|times|divided by|multiplied by|over)\s*(-?\d+(?:\.\d+)?)/i);
        if (mathMatch) {
            callbacks.onCardEvent({
                type: 'calculation',
                data: {
                    equation: text.trim(),
                    result: mathResult.match(/equals\s+(.+?)\./)?.[1] || '',
                },
                autoDismissMs: 8000,
            });
        }
        callbacks.onStatusChange('idle');
        return;
    }

    // ── Try built-in spoken responses ──
    for (const { patterns, respond } of SPOKEN_RESPONSES) {
        if (patterns.some(p => p.test(normalized))) {
            callbacks.onSpeak(respond(text));
            callbacks.onStatusChange('idle');
            return;
        }
    }

    // ── Fallback ──
    callbacks.onSpeak("Sorry, I didn't understand that. Try setting a timer, taking a note, checking the weather, getting directions, controlling a device, or playing music.");
    callbacks.onStatusChange('idle');
}

/** Speak a confirmation for a card event */
function speakCardConfirmation(event: CardEvent) {
    if (!callbacks) return;

    switch (event.type) {
        case 'timer': {
            const data = event.data as { label?: string; duration?: number };
            const mins = data.duration ? Math.round(data.duration / 60000) : 0;
            callbacks.onSpeak(mins > 0 ? `${mins} minute timer started.` : (data.label ? `Timer "${data.label}" started.` : 'Timer started.'));
            break;
        }
        case 'alarm': {
            const data = event.data as { alarms?: Array<{ time?: string }> };
            const time = data.alarms?.[0]?.time;
            callbacks.onSpeak(time ? `Alarm set for ${time}.` : 'Alarm set.');
            break;
        }
        case 'stopwatch':
            callbacks.onSpeak('Stopwatch started.');
            break;
        case 'reminder': {
            const data = event.data as { text?: string };
            callbacks.onSpeak(data.text ? `I'll remind you to ${data.text}.` : 'Reminder set.');
            break;
        }
        case 'device': {
            const data = event.data as { friendlyName?: string; action?: string };
            callbacks.onSpeak(`${data.action || 'Done'}: ${data.friendlyName || 'device'}.`);
            break;
        }
        case 'camera': {
            const data = event.data as { cameraName?: string };
            callbacks.onSpeak(`Showing ${data.cameraName || 'camera'}.`);
            break;
        }
        case 'thermostat': {
            const data = event.data as { targetTemp?: number; unit?: string; hvacMode?: string };
            if (data.targetTemp) {
                callbacks.onSpeak(`Setting thermostat to ${data.targetTemp} degrees.`);
            } else if (data.hvacMode) {
                callbacks.onSpeak(`Setting thermostat to ${data.hvacMode} mode.`);
            } else {
                callbacks.onSpeak('Adjusting thermostat.');
            }
            break;
        }
        case 'weather':
            // Weather is spoken separately in the async handler
            break;
        case 'music':
            callbacks.onSpeak('Playing music.');
            break;
        case 'youtube':
            callbacks.onSpeak('Here you go.');
            break;
        case 'image':
            callbacks.onSpeak('Here you go.');
            break;
        case 'joke': {
            const data = event.data as { setup?: string };
            callbacks.onSpeak(data.setup || 'Here is a joke.');
            break;
        }
        case 'trivia':
            callbacks.onSpeak('Here is a trivia question.');
            break;
        case 'funFact': {
            const data = event.data as { fact?: string };
            callbacks.onSpeak(data.fact ? data.fact.substring(0, 150) : 'Here is a fun fact.');
            break;
        }
        case 'quote': {
            const data = event.data as { quote?: string; author?: string };
            callbacks.onSpeak(data.quote ? `${data.quote} -- ${data.author || 'Unknown'}` : 'Here is a quote.');
            break;
        }
        case 'definition': {
            const data = event.data as { word?: string; definition?: string };
            callbacks.onSpeak(data.word ? `${data.word}: ${(data.definition || '').substring(0, 100)}` : 'Here is the definition.');
            break;
        }
        case 'calculation': {
            const data = event.data as { equation?: string; result?: string };
            callbacks.onSpeak(data.result ? `${data.equation || 'That'} equals ${data.result}.` : 'Here is the result.');
            break;
        }
        case 'unitConversion': {
            const data = event.data as { fromValue?: number; fromUnit?: string; toValue?: number; toUnit?: string };
            callbacks.onSpeak(data.toValue != null ? `${data.fromValue} ${data.fromUnit} is ${data.toValue} ${data.toUnit}.` : 'Here is the conversion.');
            break;
        }
        case 'translation': {
            const data = event.data as { translatedText?: string; targetLanguage?: string };
            callbacks.onSpeak(data.translatedText ? `In ${data.targetLanguage || 'that language'}: ${data.translatedText}` : 'Here is the translation.');
            break;
        }
        case 'recipe': {
            const data = event.data as { title?: string };
            callbacks.onSpeak(data.title ? `Here is the recipe for ${data.title}.` : 'Here is the recipe.');
            break;
        }
        case 'news':
            callbacks.onSpeak('Here are the latest headlines.');
            break;
        case 'calendar':
            callbacks.onSpeak('Here is your schedule.');
            break;
        case 'finance': {
            const data = event.data as { symbol?: string; price?: number };
            callbacks.onSpeak(data.symbol ? `${data.symbol} is at ${data.price}.` : 'Here is the financial data.');
            break;
        }
        case 'sportsScore': {
            const data = event.data as { homeTeam?: string; awayTeam?: string; homeScore?: number; awayScore?: number };
            callbacks.onSpeak(data.homeTeam ? `${data.homeTeam} ${data.homeScore}, ${data.awayTeam} ${data.awayScore}.` : 'Here is the score.');
            break;
        }
        case 'airQuality': {
            const data = event.data as { aqi?: number; category?: string };
            callbacks.onSpeak(data.aqi ? `Air quality is ${data.category || 'unknown'}, AQI ${data.aqi}.` : 'Here is the air quality.');
            break;
        }
        case 'astronomy':
            callbacks.onSpeak('Here is the astronomy info.');
            break;
        case 'commute': {
            const data = event.data as { duration?: string; durationInTraffic?: string };
            const time = data.durationInTraffic || data.duration;
            callbacks.onSpeak(time ? `Your commute is about ${time}.` : 'Here is the commute info.');
            break;
        }
        case 'map':
            callbacks.onSpeak('Here are the directions.');
            break;
        case 'places':
            callbacks.onSpeak('Here are the results.');
            break;
        case 'list': {
            const data = event.data as { title?: string; items?: string[] };
            callbacks.onSpeak(data.title || 'Here is the list.');
            break;
        }
        default:
            break;
    }
}

/** Fetch weather using the existing weather service */
async function fetchOfflineWeather(): Promise<CardEvent | null> {
    try {
        const city = getWeatherCity() || '';
        const unit = getTempUnit();

        const result = await getUnifiedWeather(city, getLowPowerMode());
        if (!result?.weather) return null;

        const w = result.weather;
        const temp = unit === 'C' ? w.tempC : w.tempF;

        return {
            type: 'weather',
            data: {
                temperature: temp,
                condition: w.desc?.toLowerCase() || 'clear',
                high: unit === 'C' ? (w.daily?.[0]?.highC ?? temp + 5) : (w.daily?.[0]?.highF ?? temp + 5),
                low: unit === 'C' ? (w.daily?.[0]?.lowC ?? temp - 5) : (w.daily?.[0]?.lowF ?? temp - 5),
                unit,
                humidity: w.humidity,
            } as unknown as Record<string, unknown>,
        };
    } catch (e) {
        console.error('[OfflineSpeech] Weather fetch failed:', e);
        return null;
    }
}

/** Search for music using the existing music search service */
async function searchOfflineMusic(query: string): Promise<CardEvent | null> {
    try {
        const result = await searchMusic(query);

        if (result.success && result.track) {
            // Got a real result -- start playback
            const snapshot = await musicPlaybackService.play(result.track);
            const cardData = toMusicCardData(snapshot);
            if (!cardData) return null;
            return {
                type: 'music',
                data: cardData as unknown as Record<string, unknown>,
                persistent: true,
            };
        }

        // No search results (Invidious down, no API key) -- fall back to YouTube card
        // which resolves the search query itself via YouTube embed or Invidious
        console.log('[OfflineSpeech] Music search returned no results, falling back to YouTube card for:', query);
        return {
            type: 'youtube',
            data: {
                searchQuery: `${query} music`,
                title: query,
            } as unknown as Record<string, unknown>,
            persistent: true,
        };
    } catch (e) {
        console.error('[OfflineSpeech] Music search failed:', e);
        return null;
    }
}

/**
 * Force device detection for offline mode — more aggressive than the transcript
 * analyzer's detectDevice since we know the user is giving a voice command.
 */
function forceDeviceDetection(text: string): CardEvent | null {
    const normalized = text.toLowerCase();
    // Expanded pattern: more verbs, room-aware, "please" anywhere
    const m = normalized.match(/\b(turn on|turn off|switch on|switch off|toggle|lock|unlock|open|close|dim|brighten|activate|start|stop|enable|disable|shut off|power on|power off)\s+(?:the\s+)?(.+?)(?:\s+please)?$/i);
    if (!m) return null;

    const verb = m[1].toLowerCase();
    const target = m[2].trim().replace(/\s+please$/i, '');
    if (target.length < 2) return null;

    let action = 'Toggled';
    let state = 'toggled';
    if (/on$|brighten|activate|start|enable|power on/.test(verb)) { action = 'Turned On'; state = 'on'; }
    else if (/off$|dim|shut|stop|disable|power off/.test(verb)) { action = 'Turned Off'; state = 'off'; }
    else if (verb === 'lock') { action = 'Locked'; state = 'locked'; }
    else if (verb === 'unlock') { action = 'Unlocked'; state = 'unlocked'; }
    else if (verb === 'open') { action = 'Opened'; state = 'open'; }
    else if (verb === 'close') { action = 'Closed'; state = 'closed'; }

    // Infer domain from target keywords
    let domain = 'light';
    if (/\b(?:lock|deadbolt)\b/i.test(target)) domain = 'lock';
    else if (/\b(?:blind|curtain|shade|garage|cover|shutter|gate)\b/i.test(target)) domain = 'cover';
    else if (/\b(?:fan)\b/i.test(target)) domain = 'fan';
    else if (/\b(?:switch|outlet|plug)\b/i.test(target)) domain = 'switch';
    else if (/\b(?:tv|television|speaker|media|soundbar)\b/i.test(target)) domain = 'media_player';
    else if (/\b(?:vacuum|roomba)\b/i.test(target)) domain = 'vacuum';

    const friendlyName = target.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    return {
        type: 'device',
        data: {
            entityId: '',
            friendlyName,
            domain,
            action,
            state,
            controlKind: domain === 'lock' ? 'lock' : domain === 'cover' ? 'cover' : 'toggle',
            supportedActions: domain === 'lock' ? ['lock', 'unlock']
                : domain === 'cover' ? ['open_cover', 'close_cover', 'stop_cover']
                : ['turn_on', 'turn_off', 'toggle'],
        } as unknown as Record<string, unknown>,
    };
}

/**
 * Execute a device action via HA REST API.
 * After the action completes, fetches the real device state and emits
 * an updated card event so the UI reflects the actual state.
 */
async function executeDeviceAction(event: CardEvent): Promise<void> {
    try {
        const data = event.data as { entityId?: string; state?: string; domain?: string; friendlyName?: string };
        if (!data.entityId) {
            if (callbacks) callbacks.onSpeak("I can't control that device -- no entity ID was resolved.");
            return;
        }

        if (!getHaMcpEnabled()) {
            if (callbacks) callbacks.onSpeak('Home Assistant is not enabled. Please enable it in settings.');
            return;
        }

        const url = getHaMcpUrl().replace(/\/+$/, '');
        const token = await getHaMcpTokenAsync();
        if (!url || !token) {
            if (callbacks) callbacks.onSpeak('Home Assistant URL or token is missing. Please check settings.');
            return;
        }

        // Determine service to call
        const domain = data.domain || data.entityId.split('.')[0] || 'homeassistant';
        let service = 'toggle';
        if (data.state === 'on') service = 'turn_on';
        else if (data.state === 'off') service = 'turn_off';
        else if (data.state === 'locked') service = 'lock';
        else if (data.state === 'unlocked') service = 'unlock';
        else if (data.state === 'open') service = 'open_cover';
        else if (data.state === 'closed') service = 'close_cover';

        const apiDomain = ['lock', 'unlock'].includes(service) ? 'lock'
            : ['open_cover', 'close_cover', 'stop_cover'].includes(service) ? 'cover'
            : domain;

        const resp = await fetch(`${url}/api/services/${apiDomain}/${service}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ entity_id: data.entityId }),
        });

        if (!resp.ok) {
            console.warn(`[OfflineSpeech] Device action failed: ${resp.status} ${resp.statusText}`);
            if (callbacks) {
                // Emit card with error state
                callbacks.onCardEvent({
                    ...event,
                    data: { ...event.data, error: `Action failed (${resp.status})` } as unknown as Record<string, unknown>,
                });
                callbacks.onSpeak(`Sorry, I couldn't control ${data.friendlyName || 'the device'}. Home Assistant returned an error.`);
            }
            return;
        }

        console.log(`[OfflineSpeech] Executed ${apiDomain}.${service} on ${data.entityId} (${resp.status})`);

        // After the action, fetch the real state and emit an updated card
        if (callbacks) {
            // Brief delay for HA state propagation
            await new Promise(r => setTimeout(r, 500));
            try {
                const stateResp = await fetch(`${url}/api/states/${encodeURIComponent(data.entityId)}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (stateResp.ok) {
                    const stateJson = await stateResp.json();
                    const realState = stateJson.state as string;
                    const friendlyName = stateJson.attributes?.friendly_name ||
                        data.friendlyName || data.entityId;
                    // Update the entity cache too
                    const cached = entityCache.find(e => e.entity_id === data.entityId);
                    if (cached) cached.state = realState;
                    // Emit updated card with the real state
                    callbacks.onCardEvent({
                        ...event,
                        data: {
                            ...event.data,
                            state: realState,
                            resolvedState: realState,
                            friendlyName,
                        } as unknown as Record<string, unknown>,
                    });
                }
            } catch (e) {
                console.warn('[OfflineSpeech] Failed to refresh state after action:', e);
            }
        }
    } catch (e) {
        console.warn('[OfflineSpeech] Device action failed:', e);
        if (callbacks) {
            const data = event.data as { friendlyName?: string };
            callbacks.onSpeak(`Sorry, I couldn't control ${data.friendlyName || 'the device'}. ${(e as Error).message || 'Connection error.'}`);
            // Emit card with error
            callbacks.onCardEvent({
                ...event,
                data: { ...event.data, error: 'Action failed -- check connection' } as unknown as Record<string, unknown>,
            });
        }
    }
}

/** Execute a scene/script/automation via HA REST API */
async function executeSceneAction(entityId: string, domain: string): Promise<void> {
    try {
        if (!getHaMcpEnabled()) return;
        const url = getHaMcpUrl().replace(/\/+$/, '');
        const token = await getHaMcpTokenAsync();
        if (!url || !token) return;

        const service = domain === 'scene' ? 'turn_on'
            : domain === 'automation' ? 'trigger'
            : 'turn_on'; // scripts use turn_on

        await fetch(`${url}/api/services/${domain}/${service}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ entity_id: entityId }),
        });
        console.log(`[OfflineSpeech] Executed ${domain}.${service} on ${entityId}`);
    } catch (e) {
        console.warn('[OfflineSpeech] Scene action failed:', e);
    }
}

/** Set brightness on a light entity via HA REST API */
async function executeBrightnessAction(entityId: string, brightnessPercent: number): Promise<void> {
    try {
        if (!getHaMcpEnabled()) return;
        const url = getHaMcpUrl().replace(/\/+$/, '');
        const token = await getHaMcpTokenAsync();
        if (!url || !token) return;

        // HA brightness is 0-255
        const brightness = Math.round((brightnessPercent / 100) * 255);

        await fetch(`${url}/api/services/light/turn_on`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ entity_id: entityId, brightness }),
        });
        console.log(`[OfflineSpeech] Set brightness on ${entityId} to ${brightnessPercent}%`);
    } catch (e) {
        console.warn('[OfflineSpeech] Brightness action failed:', e);
    }
}

/** Find an entity by spoken name using fuzzy matching against the entity cache */
function findEntityBySpokenName(
    spoken: string,
    cache: Array<{ entity_id: string; name: string; domain: string; state?: string; area?: string }>,
): { entity_id: string; name: string; domain: string; state?: string } | null {
    if (!cache.length) return null;

    const normalize = (s: string) => s.toLowerCase().replace(/[_\-.']/g, ' ').replace(/\s+/g, ' ').trim();
    const spokenNorm = normalize(spoken);

    let best: (typeof cache)[number] | null = null;
    let bestScore = 0;

    for (const entity of cache) {
        const nameNorm = normalize(entity.name);
        const suffixNorm = normalize(entity.entity_id.replace(/^[^.]+\./, ''));
        const areaNorm = normalize(entity.area || '');

        let score = 0;
        if (spokenNorm.includes(nameNorm) || nameNorm.includes(spokenNorm)) score = 80;
        else if (spokenNorm.includes(suffixNorm) || suffixNorm.includes(spokenNorm)) score = 70;

        // Area boost
        if (areaNorm && spokenNorm.includes(areaNorm)) score += 15;

        // Domain keyword boost
        const domainKeywords: Record<string, string[]> = {
            lock: ['door', 'lock', 'deadbolt'],
            cover: ['garage', 'blind', 'curtain', 'shade'],
            light: ['light', 'lamp', 'bulb'],
            climate: ['thermostat', 'temperature', 'temp'],
            switch: ['switch', 'outlet', 'plug'],
        };
        const dkws = domainKeywords[entity.domain] || [];
        if (dkws.some(kw => spokenNorm.includes(kw))) score += 10;

        if (score > bestScore) {
            bestScore = score;
            best = entity;
        }
    }

    return bestScore >= 50 ? best : null;
}

/** Fetch directions using Google Directions API */
async function fetchDirections(destination: string, origin?: string, travelMode?: 'driving' | 'walking' | 'transit' | 'bicycling'): Promise<CardEvent | null> {
    try {
        const apiKey = await getGoogleApiKeyAsync();
        if (!apiKey) {
            console.warn('[OfflineSpeech] No Google API key for directions');
            return null;
        }

        const originAddr = origin || getHomeLocation() || '';
        if (!originAddr) {
            return await fetchDirectionsWithGeolocation(destination, apiKey, travelMode);
        }

        const mode = travelMode || 'driving';
        let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(originAddr)}&destination=${encodeURIComponent(destination)}&mode=${mode}&key=${apiKey}`;
        if (mode === 'driving') url += '&departure_time=now';

        const res = await fetch(url);
        if (!res.ok) return null;

        const json = await res.json();
        if (json.status !== 'OK' || !json.routes?.length) return null;

        const route = json.routes[0];
        const leg = route.legs[0];

        const steps = (leg.steps || []).slice(0, 8).map((s: { html_instructions?: string; distance?: { text?: string } }) => ({
            instruction: (s.html_instructions || '').replace(/<[^>]+>/g, ''),
            distance: s.distance?.text || '',
        }));

        return {
            type: 'map',
            data: {
                origin: leg.start_address || originAddr,
                destination: leg.end_address || destination,
                travelMode: mode,
                distance: leg.distance?.text,
                duration: leg.duration?.text,
                durationInTraffic: leg.duration_in_traffic?.text,
                steps,
                encodedPolyline: route.overview_polyline?.points,
            } as unknown as Record<string, unknown>,
            persistent: true,
        };
    } catch (e) {
        console.warn('[OfflineSpeech] Directions fetch failed:', e);
        return null;
    }
}

/** Fallback: use browser geolocation as origin for directions */
async function fetchDirectionsWithGeolocation(destination: string, apiKey: string, travelMode?: 'driving' | 'walking' | 'transit' | 'bicycling'): Promise<CardEvent | null> {
    return new Promise((resolve) => {
        if (!navigator.geolocation) { resolve(null); return; }

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const origin = `${pos.coords.latitude},${pos.coords.longitude}`;
                    const mode = travelMode || 'driving';
                    let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${encodeURIComponent(destination)}&mode=${mode}&key=${apiKey}`;
                    if (mode === 'driving') url += '&departure_time=now';
                    const res = await fetch(url);
                    if (!res.ok) { resolve(null); return; }

                    const json = await res.json();
                    if (json.status !== 'OK' || !json.routes?.length) { resolve(null); return; }

                    const route = json.routes[0];
                    const leg = route.legs[0];

                    const steps = (leg.steps || []).slice(0, 8).map((s: { html_instructions?: string; distance?: { text?: string } }) => ({
                        instruction: (s.html_instructions || '').replace(/<[^>]+>/g, ''),
                        distance: s.distance?.text || '',
                    }));

                    resolve({
                        type: 'map',
                        data: {
                            origin: leg.start_address || 'Current location',
                            destination: leg.end_address || destination,
                            travelMode: mode,
                            distance: leg.distance?.text,
                            duration: leg.duration?.text,
                            durationInTraffic: leg.duration_in_traffic?.text,
                            steps,
                            encodedPolyline: route.overview_polyline?.points,
                        } as unknown as Record<string, unknown>,
                        persistent: true,
                    });
                } catch {
                    resolve(null);
                }
            },
            () => resolve(null),
            { timeout: 5000 },
        );
    });
}

/**
 * Evaluate a spoken math expression.
 * Handles both symbolic ("5 + 3", "10 * 2") and spoken ("5 plus 3", "10 times 2").
 * Returns a spoken result string, or null if unparseable.
 */
function evaluateSpokenMath(text: string): string | null {
    const normalized = text.toLowerCase().trim();

    // Replace spoken operators with symbols
    let expr = normalized
        .replace(/\bplus\b/gi, '+')
        .replace(/\bminus\b/gi, '-')
        .replace(/\btimes\b/gi, '*')
        .replace(/\bmultiplied\s+by\b/gi, '*')
        .replace(/\bdivided\s+by\b/gi, '/')
        .replace(/\bover\b/gi, '/')
        .replace(/\bmod(?:ulo)?\b/gi, '%')
        .replace(/\bx\b/gi, '*')
        .replace(/\bto the power of\b/gi, '**')
        .replace(/\bsquared\b/gi, '**2')
        .replace(/\bcubed\b/gi, '**3');

    // Extract the math expression (numbers and operators)
    const mathMatch = expr.match(/(-?\d+(?:\.\d+)?)\s*([+\-*/%]|\*\*)\s*(-?\d+(?:\.\d+)?)/);
    if (!mathMatch) return null;

    const a = parseFloat(mathMatch[1]);
    const op = mathMatch[2];
    const b = parseFloat(mathMatch[3]);

    let result: number;
    switch (op) {
        case '+': result = a + b; break;
        case '-': result = a - b; break;
        case '*': result = a * b; break;
        case '/': result = b !== 0 ? a / b : NaN; break;
        case '%': result = b !== 0 ? a % b : NaN; break;
        case '**': result = Math.pow(a, b); break;
        default: return null;
    }

    if (isNaN(result)) return "Can't divide by zero.";

    // Format nicely
    const opName = op === '+' ? 'plus' : op === '-' ? 'minus' : op === '*' ? 'times'
        : op === '/' ? 'divided by' : op === '%' ? 'mod' : op === '**' ? 'to the power of' : op;
    const formatted = Number.isInteger(result) ? result.toString() : result.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');

    return `${a} ${opName} ${b} equals ${formatted}.`;
}

// ── Sensor & Home Status resolvers ──────────────────────────────────────────

type EntityLike = { entity_id: string; name: string; domain: string; state?: string; area?: string };

/**
 * Resolve a sensor reading query against the HA entity cache.
 * Finds the best matching sensor entity and returns a sensorReading card event.
 */
/** Resolve a sensor reading query against the HA entity cache. */
export function resolveSensorReading(
    deviceClass: string,
    area: string,
    cache: EntityLike[],
): CardEvent | null {
    const normalize = (s: string) => s.toLowerCase().replace(/[_\-.']/g, ' ').replace(/\s+/g, ' ').trim();
    const areaNorm = normalize(area);

    // Filter to sensor entities with numeric-looking states
    const sensors = cache.filter(e => {
        if (e.domain !== 'sensor') return false;
        if (e.state === undefined || e.state === 'unavailable' || e.state === 'unknown') return false;
        // Match by device class keywords in entity_id or name
        const id = e.entity_id.toLowerCase();
        const name = e.name.toLowerCase();
        if (deviceClass === 'temperature') {
            return id.includes('temp') || name.includes('temp') || name.includes('temperature');
        }
        if (deviceClass === 'humidity') {
            return id.includes('humid') || name.includes('humid') || name.includes('humidity');
        }
        if (deviceClass === 'power') {
            return id.includes('power') || id.includes('energy') || id.includes('watt') ||
                name.includes('power') || name.includes('energy') || name.includes('watt');
        }
        if (deviceClass === 'battery') {
            return id.includes('battery') || name.includes('battery');
        }
        if (deviceClass === 'illuminance') {
            return id.includes('illumin') || id.includes('lux') || id.includes('light_level') ||
                name.includes('illumin') || name.includes('lux') || name.includes('light level');
        }
        return id.includes(deviceClass) || name.includes(deviceClass);
    });

    if (sensors.length === 0) return null;

    // If area specified, prefer sensors in that area
    let best = sensors[0];
    if (areaNorm) {
        const areaMatch = sensors.find(e =>
            normalize(e.area || '').includes(areaNorm) ||
            normalize(e.name).includes(areaNorm) ||
            normalize(e.entity_id).includes(areaNorm.replace(/\s+/g, '_'))
        );
        if (areaMatch) best = areaMatch;
    }

    // Determine unit from entity_id or common patterns
    let unit = '';
    if (deviceClass === 'temperature') unit = best.entity_id.includes('_c') || best.name.toLowerCase().includes('celsius') ? 'C' : 'F';
    else if (deviceClass === 'humidity') unit = '%';
    else if (deviceClass === 'pressure') unit = 'hPa';
    else if (deviceClass === 'battery') unit = '%';
    else if (deviceClass === 'illuminance') unit = 'lx';
    else if (deviceClass === 'power') unit = 'W';
    else if (deviceClass === 'energy') unit = 'kWh';
    else if (deviceClass === 'voltage') unit = 'V';
    else if (deviceClass === 'current') unit = 'A';

    // Try to parse the state as a number for temperature unit detection
    const numVal = parseFloat(best.state || '');
    if (deviceClass === 'temperature' && !isNaN(numVal)) {
        // Heuristic: if value > 50, likely Fahrenheit; if < 50, likely Celsius
        // (not perfect but reasonable for indoor temps)
        if (unit === 'F' && numVal < 50) unit = 'C';
        if (unit === '' && numVal > 50) unit = 'F';
        if (unit === '') unit = 'F'; // default
    }

    return {
        type: 'sensorReading',
        data: {
            entityId: best.entity_id,
            friendlyName: best.name,
            value: best.state || '?',
            unit,
            deviceClass,
            area: best.area || '',
        },
    };
}

/**
 * Resolve a home status query against the HA entity cache.
 * Finds matching door/garage/motion/presence entities and returns a homeStatus card.
 */
/** Resolve a home status query against the HA entity cache. */
export function resolveHomeStatus(
    kind: string,
    area: string,
    cache: EntityLike[],
): CardEvent | null {
    const normalize = (s: string) => s.toLowerCase().replace(/[_\-.']/g, ' ').replace(/\s+/g, ' ').trim();
    const areaNorm = normalize(area);

    let items: EntityLike[] = [];

    if (kind === 'door') {
        items = cache.filter(e => {
            if (e.state === 'unavailable' || e.state === 'unknown') return false;
            const id = e.entity_id.toLowerCase();
            const name = e.name.toLowerCase();
            // binary_sensor doors, or cover doors (not garage)
            return ((e.domain === 'binary_sensor' || e.domain === 'cover' || e.domain === 'lock') &&
                (id.includes('door') || name.includes('door') || id.includes('entry') || name.includes('entry')) &&
                !id.includes('garage') && !name.includes('garage'));
        });
    } else if (kind === 'garage') {
        items = cache.filter(e => {
            if (e.state === 'unavailable' || e.state === 'unknown') return false;
            const id = e.entity_id.toLowerCase();
            const name = e.name.toLowerCase();
            return (e.domain === 'cover' || e.domain === 'binary_sensor') &&
                (id.includes('garage') || name.includes('garage'));
        });
    } else if (kind === 'motion') {
        items = cache.filter(e => {
            if (e.state === 'unavailable' || e.state === 'unknown') return false;
            const id = e.entity_id.toLowerCase();
            const name = e.name.toLowerCase();
            return e.domain === 'binary_sensor' &&
                (id.includes('motion') || name.includes('motion') ||
                 id.includes('occupancy') || name.includes('occupancy') ||
                 id.includes('pir') || name.includes('movement'));
        });
    } else if (kind === 'presence') {
        // Presence queries ("anyone in the living room") should include
        // person trackers, device trackers, AND motion/occupancy sensors
        items = cache.filter(e => {
            if (e.state === 'unavailable' || e.state === 'unknown') return false;
            const id = e.entity_id.toLowerCase();
            const name = e.name.toLowerCase();
            return e.domain === 'person' || e.domain === 'device_tracker' ||
                (e.domain === 'binary_sensor' &&
                 (id.includes('presence') || id.includes('occupancy') ||
                  id.includes('motion') || id.includes('pir') || id.includes('movement') ||
                  name.includes('presence') || name.includes('occupancy') ||
                  name.includes('motion') || name.includes('movement')));
        });
    } else if (kind === 'window') {
        items = cache.filter(e => {
            if (e.state === 'unavailable' || e.state === 'unknown') return false;
            const id = e.entity_id.toLowerCase();
            const name = e.name.toLowerCase();
            return e.domain === 'binary_sensor' &&
                (id.includes('window') || name.includes('window'));
        });
    }

    // Filter by area if specified
    if (areaNorm && items.length > 0) {
        const areaFiltered = items.filter(e =>
            normalize(e.area || '').includes(areaNorm) ||
            normalize(e.name).includes(areaNorm) ||
            normalize(e.entity_id).includes(areaNorm.replace(/\s+/g, '_'))
        );
        if (areaFiltered.length > 0) items = areaFiltered;
    }

    if (items.length === 0) return null;

    const TITLE_MAP: Record<string, string> = {
        door: 'Doors', garage: 'Garage', motion: 'Motion Sensors',
        presence: 'Presence', window: 'Windows',
    };

    return {
        type: 'homeStatus',
        data: {
            kind,
            title: TITLE_MAP[kind] || 'Home Status',
            items: items.map(e => ({
                entityId: e.entity_id,
                friendlyName: e.name,
                state: e.state || 'unknown',
                area: e.area || '',
            })),
        },
    };
}
