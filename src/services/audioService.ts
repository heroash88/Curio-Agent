/**
 * Audio Synthesis Service
 * Provides realistic instrument sounds using the Web Audio API
 */

import { getSharedAudioContext, resumeAudioContext as resumeShared } from './audioContext';
import {
    BENDER_CONNECT_CLIPS,
    BENDER_DISMISS_CLIPS,
    BENDER_INTERJECTION_CLIPS,
    pickRandom,
} from './benderAudioCatalog';
import type { BenderClip } from './benderAudioCatalog';

// Helper to get or create audio context
function getAudioContext(): AudioContext {
    return getSharedAudioContext(false);
}

export const resumeAudioContext = async (): Promise<void> => {
    await resumeShared();
};

export const suspendAudioContext = async (): Promise<void> => {
    // We delegate suspension to the shared context service or just let it auto-suspend
    // But if we really want to force suspend:
    const ctx = getSharedAudioContext(false);
    if (ctx.state === 'running') {
        await ctx.suspend();
    }
};

// Note frequencies for all piano keys (A0 to C8)
const NOTE_FREQUENCIES: Record<string, number> = {
    // Octave 3
    'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81,
    'F3': 174.61, 'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00,
    'A#3': 233.08, 'B3': 246.94,
    // Octave 4 (Middle C octave)
    'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63,
    'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00,
    'A#4': 466.16, 'B4': 493.88,
    // Octave 5
    'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25,
    'F5': 698.46, 'F#5': 739.99, 'G5': 783.99, 'G#5': 830.61, 'A5': 880.00,
    'A#5': 932.33, 'B5': 987.77,
    // Octave 6
    'C6': 1046.50, 'C#6': 1108.73, 'D6': 1174.66, 'D#6': 1244.51, 'E6': 1318.51,
    'F6': 1396.91, 'F#6': 1479.98, 'G6': 1567.98, 'G#6': 1661.22, 'A6': 1760.00,
    'A#6': 1864.66, 'B6': 1975.53,
};

// Get frequency for a note name
export const getNoteFrequency = (note: string): number => {
    return NOTE_FREQUENCIES[note] || 440;
};

// Instrument types
export type InstrumentType = 'piano' | 'strings' | 'brass' | 'woodwinds' | 'percussion' | 'mallet';

type HarmonicPartial = Readonly<{
    ratio: number;
    gain: number;
}>;

const PIANO_HARMONICS: readonly HarmonicPartial[] = [
    { ratio: 1, gain: 1.0 },      // Fundamental
    { ratio: 2, gain: 0.5 },      // 1st harmonic
    { ratio: 3, gain: 0.25 },     // 2nd harmonic
    { ratio: 4, gain: 0.125 },    // 3rd harmonic
    { ratio: 5, gain: 0.0625 },   // 4th harmonic
];

/**
 * Play a realistic piano note with harmonics and ADSR envelope
 */
export const playPianoNote = (
    frequency: number,
    velocity: number = 0.7,
    duration: number = 1.5
): void => {
    const ctx = getAudioContext();
    // If context is suspended (common on first interaction), resume it first.
    // Scheduling oscillators on a suspended context causes stutter when it resumes.
    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => { });
    }
    const now = ctx.currentTime;

    // Create a master gain for this note
    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);

    // ADSR envelope parameters
    const attack = 0.005;
    const decay = 0.1;
    const sustain = velocity * 0.4;
    const release = duration * 0.8;

    // Set up the envelope
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(velocity * 0.5, now + attack);
    masterGain.gain.linearRampToValueAtTime(sustain, now + attack + decay);
    masterGain.gain.setValueAtTime(sustain, now + duration - release);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Create multiple oscillators for harmonics (richer piano sound)
    PIANO_HARMONICS.forEach(({ ratio, gain }) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();

        osc.type = ratio === 1 ? 'triangle' : 'sine';
        // Clamp frequency to 8000Hz to avoid console warnings in some browsers
        osc.frequency.value = Math.min(frequency * ratio, 8000);
        oscGain.gain.value = gain;

        // Slight detuning for warmth
        osc.detune.value = (Math.random() - 0.5) * 4;

        osc.connect(oscGain);
        oscGain.connect(masterGain);

        osc.start(now);
        osc.stop(now + duration + 0.1);
    });

    // Add a subtle hammer attack sound
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(velocity * 0.05, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
    noiseGain.connect(masterGain);

    // Use an oscillator to simulate attack transient
    const attackOsc = ctx.createOscillator();
    attackOsc.type = 'square';
    // Clamp attack frequency to 8000Hz to avoid nominal range warnings
    attackOsc.frequency.value = Math.min(frequency * 8, 8000);
    attackOsc.connect(noiseGain);
    attackOsc.start(now);
    attackOsc.stop(now + 0.02);
};

/**
 * Play a string instrument note (Violin, Cello, etc.)
 * Characterized by sawtooth wave, slower attack, and vibrato
 */
export const playStringNote = (
    frequency: number,
    velocity: number = 0.7,
    duration: number = 1.5
): void => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);

    // Slower attack for bowing effect
    const attack = 0.1;
    const decay = 0.2;
    const sustain = velocity * 0.8;
    const release = 0.3;

    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(velocity, now + attack);
    masterGain.gain.linearRampToValueAtTime(sustain, now + attack + decay);
    masterGain.gain.setValueAtTime(sustain, now + duration - release);
    masterGain.gain.linearRampToValueAtTime(0.001, now + duration);

    // Sawtooth for rich harmonics
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = frequency;

    // Vibrato LFO
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 5; // 5Hz vibrato

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 3; // Depth of vibrato

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start(now);
    lfo.stop(now + duration);

    // Filter to warm up the sound
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency * 4;

    osc.connect(filter);
    filter.connect(masterGain);

    osc.start(now);
    osc.stop(now + duration);
};

/**
 * Play a brass instrument note (Trumpet, Trombone, etc.)
 * Characterized by bright attack and filter envelope
 */
export const playBrassNote = (
    frequency: number,
    velocity: number = 0.7,
    duration: number = 1.5
): void => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);

    // Punchy attack
    const attack = 0.03;
    const decay = 0.1;
    const sustain = velocity * 0.9;
    const release = 0.2;

    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(velocity, now + attack);
    masterGain.gain.linearRampToValueAtTime(sustain, now + attack + decay);
    masterGain.gain.setValueAtTime(sustain, now + duration - release);
    masterGain.gain.linearRampToValueAtTime(0.001, now + duration);

    // Mix of sawtooth and triangle
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = frequency;

    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = frequency;

    // Filter envelope (simulation of increasing brightness with breath pressure)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(frequency, now);
    filter.frequency.linearRampToValueAtTime(frequency * 5, now + attack);
    filter.frequency.linearRampToValueAtTime(frequency * 3, now + duration);

    o1.connect(filter);
    o2.connect(filter);
    filter.connect(masterGain);

    o1.start(now);
    o1.stop(now + duration);
    o2.start(now);
    o2.stop(now + duration);
};

/**
 * Play a woodwind instrument note (Flute, Clarinet, etc.)
 * Characterized by pure tone + breath noise
 */
export const playWoodwindNote = (
    frequency: number,
    velocity: number = 0.7,
    duration: number = 1.5
): void => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);

    // Softer attack
    const attack = 0.08;
    const sustain = velocity * 0.8;
    const release = 0.2;

    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(velocity, now + attack);
    masterGain.gain.setValueAtTime(sustain, now + duration - release);
    masterGain.gain.linearRampToValueAtTime(0.001, now + duration);

    // Sine wave for flute-like purity (or triangle for clarinet)
    const osc = ctx.createOscillator();
    osc.type = 'sine'; // Flute-is
    osc.frequency.value = frequency;

    // Breath noise
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.1; // Low volume noise
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Filter noise to be "breathy"
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = frequency * 2;
    noiseFilter.Q.value = 1;

    osc.connect(masterGain);
    noise.connect(noiseFilter);
    noiseFilter.connect(masterGain);

    osc.start(now);
    osc.stop(now + duration);
    noise.start(now);
    noise.stop(now + duration);
};

// Mallet instrument (Xylophone, Marimba) - bright, distinct attack, pure tone
export const playMalletNote = (
    frequency: number,
    velocity: number = 0.7,
    duration: number = 0.5
): void => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);

    // Hard, fast attack
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(velocity, now + 0.001);
    masterGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    // Sine wave dominant for xylophone
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency;

    // Slight frequency drop for "thud" effect
    osc.frequency.setValueAtTime(frequency, now);

    // "Wood" click layer
    const clickOsc = ctx.createOscillator();
    clickOsc.type = 'square';
    clickOsc.frequency.value = 1000;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(velocity * 0.1, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.01);
    clickOsc.connect(clickGain);
    clickGain.connect(masterGain);
    clickOsc.start(now);
    clickOsc.stop(now + 0.02);

    // Main tone
    osc.connect(masterGain);
    osc.start(now);
    osc.stop(now + duration);
};

/**
 * Unified player function
 */
export const playInstrumentNote = (
    type: InstrumentType,
    frequency: number,
    velocity: number = 0.7,
    duration: number = 1.5
): void => {
    switch (type) {
        case 'strings':
            playStringNote(frequency, velocity, duration);
            break;
        case 'brass':
            playBrassNote(frequency, velocity, duration);
            break;
        case 'woodwinds':
            playWoodwindNote(frequency, velocity, duration);
            break;
        case 'mallet':
            playMalletNote(frequency, velocity, duration); // Use shorter default duration inside the function? passed duration is 1.5 here.
            // Override duration for mallet to be shorter naturally? 
            // playMalletNote signature expects duration. 
            // Let's passed duration but maybe cap it? 
            // Actually xylophone rings for a bit. 1.5 is long but ok.
            break;
        case 'piano':
        default:
            playPianoNote(frequency, velocity, duration);
            break;
    }
};

/**
 * Play a note by name (e.g., "C4", "F#5")
 */
export const playNoteByName = (noteName: string, velocity: number = 0.7): void => {
    const freq = getNoteFrequency(noteName);
    playPianoNote(freq, velocity);
};

/**
 * Play a kick drum sound
 */
export const playKick = (velocity: number = 0.8): void => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Oscillator for the body of the kick
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);

    oscGain.gain.setValueAtTime(velocity, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);

    // Click transient
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'square';
    clickOsc.frequency.value = 200;
    clickGain.gain.setValueAtTime(velocity * 0.3, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.01);
    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.01);
};

/**
 * Play a snare drum sound
 */
export const playSnare = (velocity: number = 0.7): void => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Create noise buffer for snare wires
    const bufferSize = ctx.sampleRate * 0.2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1000;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(velocity * 0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 0.2);

    // Body tone
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 180;
    oscGain.gain.setValueAtTime(velocity * 0.5, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
};

/**
 * Play a hi-hat sound
 */
export const playHiHat = (open: boolean = false, velocity: number = 0.5): void => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const duration = open ? 0.4 : 0.08;

    // Create noise buffer
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // High-pass and band-pass for metallic sound
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 7000;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 10000;
    bandpass.Q.value = 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(velocity * 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + duration);
};

/**
 * Play a tom drum sound
 */
export const playTom = (pitch: 'high' | 'mid' | 'low' = 'mid', velocity: number = 0.7): void => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const frequencies = { high: 200, mid: 120, low: 80 };
    const baseFreq = frequencies[pitch];

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * 1.5, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.1);

    gain.gain.setValueAtTime(velocity, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
};

/**
 * Play a cymbal crash
 */
export const playCymbal = (velocity: number = 0.5): void => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Create noise buffer
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 5000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(velocity * 0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2);

    noise.connect(highpass);
    highpass.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 2);
};

/**
 * Play a success sound: A lush, warm, ambient chord (C Major 9) instead of a sequence.
 */
export const playSuccessSound = (): void => {
    // Play simultaneously for a rich, satisfying "chime" chord rather than a melody
    const chord = [261.63, 329.63, 392.00, 493.88, 587.33]; // C4, E4, G4, B4, D5
    chord.forEach((freq) => {
        playPianoNote(freq, 0.15, 2.0); // Very soft, long decay
    });
};

/**
 * Play an error sound: A very deep, hollow, muted organic "thud".
 */
export const playErrorSound = (): void => {
    const ctx = getSharedAudioContext(false);
    if (ctx.state === 'suspended') return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Deep sub-bass sine wave drop instead of a buzzer
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);

    // Very soft volume
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
};

export type NotificationSoundPriority = 'low' | 'normal' | 'high';

export type NotificationSoundNote = Readonly<{
    frequency: number;
    velocity: number;
    duration: number;
    delayMs: number;
}>;

export const NOTIFICATION_SOUND_PATTERNS: Record<NotificationSoundPriority, readonly NotificationSoundNote[]> = {
    low: [
        { frequency: 293.66, velocity: 0.026, duration: 0.32, delayMs: 0 },
    ],
    normal: [
        { frequency: 329.63, velocity: 0.032, duration: 0.34, delayMs: 0 },
        { frequency: 392.00, velocity: 0.026, duration: 0.34, delayMs: 115 },
    ],
    high: [
        { frequency: 349.23, velocity: 0.04, duration: 0.36, delayMs: 0 },
        { frequency: 440.00, velocity: 0.034, duration: 0.34, delayMs: 95 },
        { frequency: 523.25, velocity: 0.03, duration: 0.34, delayMs: 190 },
    ],
};

const playSoftNotificationNote = ({ frequency, velocity, duration }: NotificationSoundNote): void => {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => { });
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const primary = ctx.createOscillator();
    const primaryGain = ctx.createGain();
    const warmth = ctx.createOscillator();
    const warmthGain = ctx.createGain();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(950, now);
    filter.Q.setValueAtTime(0.35, now);

    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.linearRampToValueAtTime(velocity, now + 0.025);
    masterGain.gain.exponentialRampToValueAtTime(Math.max(velocity * 0.32, 0.001), now + duration * 0.45);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    primary.type = 'sine';
    primary.frequency.setValueAtTime(frequency, now);
    primaryGain.gain.setValueAtTime(1, now);

    warmth.type = 'triangle';
    warmth.frequency.setValueAtTime(frequency * 2, now);
    warmth.detune.setValueAtTime(-6, now);
    warmthGain.gain.setValueAtTime(0.055, now);

    primary.connect(primaryGain);
    primaryGain.connect(filter);
    warmth.connect(warmthGain);
    warmthGain.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(ctx.destination);

    primary.start(now);
    warmth.start(now);
    primary.stop(now + duration + 0.04);
    warmth.stop(now + duration + 0.04);
};

export const playNotificationSound = (priority: NotificationSoundPriority): void => {
    NOTIFICATION_SOUND_PATTERNS[priority].forEach((note) => {
        if (note.delayMs <= 0) {
            playSoftNotificationNote(note);
            return;
        }

        window.setTimeout(() => playSoftNotificationNote(note), note.delayMs);
    });
};

/**
 * Play a welcoming greeting sound for Curio: Melodic piano notes
 */
export const playCurioGreeting = (): void => {
    // A warm G-Major arpeggio (G4, B4, D5) - very 'Instrument' feel
    const freqs = [392.00, 493.88, 587.33];
    freqs.forEach((freq, i) => {
        // Snappier piano notes with less trailing sustain
        setTimeout(() => playPianoNote(freq, 0.15, 0.8), i * 50);
    });
};

/**
 * Play a random Bender clip from a given catalog array.
 */
const playBenderClip = (clips: BenderClip[]): void => {
    try {
        const clip = pickRandom(clips);
        if (!clip) return;
        const audio = new Audio(clip.src);
        audio.volume = 0.6;
        audio.play().catch(e => console.warn('Bender audio failed:', e));
    } catch (e) {
        console.warn('Bender audio error:', e);
    }
};

/**
 * Play a welcoming greeting sound for Bender (random connect clip).
 */
export const playBenderGreeting = (): void => {
    playBenderClip(BENDER_CONNECT_CLIPS);
};

/**
 * Play a dismissal sound for Bender (random dismiss clip).
 */
export const playBenderDismissal = (): void => {
    playBenderClip(BENDER_DISMISS_CLIPS);
};

/**
 * Play a random Bender interjection clip (mid-conversation flavor).
 */
export const playBenderInterjection = (): void => {
    playBenderClip(BENDER_INTERJECTION_CLIPS);
};

/**
 * Stop any ongoing Curio sounds (placeholder for consistency)
 */
export const stopCurioSound = (): void => {
    // Currently audioService uses one-shot oscillators that stop themselves
    // We could track nodes if we needed to force stop, but for now this is a no-op
    // to maintain the interface of the deleted curioSoundService.
};

/**
 * Play a celebration fanfare: A fast, cascading harp-like sweep up into a bright sustained chord.
 */
export const playFanfare = (): void => {
    const sweep = [
        130.81, // C3
        196.00, // G3
        261.63, // C4
        329.63, // E4
        392.00, // G4
        493.88, // B4
        587.33, // D5
        783.99  // G5
    ];

    // Rapid ascending sweep
    sweep.forEach((freq, i) => {
        setTimeout(() => playPianoNote(freq, 0.15, 2.5), i * 40);
    });

    // Big final sustained chord hits at the end of the sweep
    setTimeout(() => {
        [261.63, 329.63, 392.00, 523.25].forEach(freq => playPianoNote(freq, 0.2, 3.0));
    }, sweep.length * 40);
};

/**
 * Play a simple metronome click
 */
export const playMetronomeClick = (accent: boolean = false): void => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = accent ? 1000 : 800;

    gain.gain.setValueAtTime(accent ? 0.5 : 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
};

let lastPopTime = 0;

/**
 * Play an interface pop: A microscopic, organic "tick" or "wood tap", exactly like modern premium UI.
 */
export const playInterfacePop = (pitch: number = 330): void => { // Default to an E4 equivalent rather than A5
    const nowMs = Date.now();
    if (nowMs - lastPopTime < 50) return; // Super fast debounce for smooth dragging
    lastPopTime = nowMs;

    setTimeout(() => {
        try {
            const ctx = getSharedAudioContext(false);
            if (ctx.state === 'suspended') return;
            const now = ctx.currentTime;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            // Very high starting freq dropping instantly to 0 creates a "tick" transient
            osc.type = 'sine';
            osc.frequency.setValueAtTime(Math.max(120, Math.min(1200, pitch * 2.4)), now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.015);

            gain.gain.setValueAtTime(0.12, now); // Barely audible
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now);
            osc.stop(now + 0.02);
        } catch (e) {
            console.warn('Audio feedback failed', e);
        }
    }, 0);
};

/**
 * Play a transition whoosh: A deep, bass-heavy subsonic sweep, like distant ocean waves or a heartbeat.
 */
export const playTransitionWhoosh = (): void => {
    const ctx = getSharedAudioContext(false);
    if (ctx.state === 'suspended') return;
    const now = ctx.currentTime;
    const duration = 0.8;

    // Create brown noise via filtering instead of harsh white noise
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02; // Brown noise approximation
        lastOut = data[i];
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Filter extremely low for a "sub-bass rumble" breeze
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(40, now);
    filter.frequency.exponentialRampToValueAtTime(400, now + duration * 0.4);
    filter.frequency.exponentialRampToValueAtTime(40, now + duration);

    // Subtle volume swell
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.4, now + duration * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + duration);
};

// Export note names for UI
export const ALL_NOTES = Object.keys(NOTE_FREQUENCIES);

export const getNotesInRange = (startNote: string, endNote: string): string[] => {
    const allNotes = Object.keys(NOTE_FREQUENCIES);
    const startIndex = allNotes.indexOf(startNote);
    const endIndex = allNotes.indexOf(endNote);
    if (startIndex === -1 || endIndex === -1) return [];
    return allNotes.slice(startIndex, endIndex + 1);
};
