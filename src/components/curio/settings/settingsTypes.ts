/**
 * Shared types and constants for settings sections.
 */

export interface CitySuggestion {
    name: string;
    country: string;
    state?: string;
    lat: number;
    lon: number;
}

export type McpStatus = 'idle' | 'checking' | 'connected' | 'error';

export const getStatusBadgeClassName = (status: McpStatus) => {
    if (status === 'connected') return 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)]';
    if (status === 'error') return 'bg-red-500';
    if (status === 'checking') return 'bg-amber-500 animate-pulse';
    return 'bg-slate-300';
};

export const getStatusTextClassName = (status: McpStatus) => {
    if (status === 'connected') return 'text-green-600';
    if (status === 'error') return 'text-red-500';
    if (status === 'checking') return 'text-amber-600';
    return 'text-slate-500';
};

export const getStatusText = (status: McpStatus) => {
    if (status === 'connected') return 'Connected';
    if (status === 'error') return 'Error';
    if (status === 'checking') return 'Checking';
    return 'Not checked';
};

export const ROBOT_ANIMATIONS_CATALOG: Record<string, { id: number; label: string }[]> = {
    curio: [
        { id: 2, label: 'Wink' },
        { id: 4, label: 'Curious' },
        { id: 5, label: 'Love' },
        { id: 6, label: 'Surprised' },
        { id: 7, label: 'Magnifying Glass' },
        { id: 8, label: 'Bob' },
        { id: 9, label: 'Sunglasses' },
        { id: 10, label: 'Dizzy' },
        { id: 11, label: 'Scanning' },
        { id: 13, label: 'Digital Glitch' },
        { id: 14, label: 'Gentleman' },
        { id: 16, label: 'Steam' },
        { id: 17, label: 'Matrix' },
        { id: 18, label: 'Rainbow' },
        { id: 19, label: 'Butterfly' },
        { id: 21, label: 'Gum Pop' },
        { id: 22, label: 'Confetti' },
        { id: 23, label: 'Halo' },
        { id: 24, label: 'Stars' },
        { id: 25, label: 'Clock' },
        { id: 26, label: 'Rain' },
        { id: 27, label: 'Sneeze' },
        { id: 28, label: 'Thinking' },
        { id: 29, label: 'Fire' },
        { id: 30, label: 'Propeller' },
        { id: 31, label: 'Music' },
        { id: 32, label: 'Gold Chain' },
        { id: 33, label: 'Confused' },
        { id: 34, label: 'Sad' },
        { id: 35, label: 'Love (Big)' },
        { id: 36, label: 'Smirk' },
        { id: 37, label: 'Antenna Glow' },
    ],
    astro: [
        { id: 0, label: 'Wink' },
        { id: 1, label: 'Happy/Bob' },
        { id: 2, label: 'Curious/Nod' },
        { id: 5, label: 'Love' },
        { id: 6, label: 'Surprised' },
        { id: 7, label: 'Magnifying Glass' },
        { id: 8, label: 'Bob' },
        { id: 9, label: 'Sunglasses' },
        { id: 10, label: 'Dizzy' },
        { id: 11, label: 'Scanning' },
        { id: 13, label: 'Digitized' },
        { id: 14, label: 'Gentleman' },
        { id: 16, label: 'Raging' },
        { id: 17, label: 'Matrix' },
        { id: 18, label: 'Rainbow' },
        { id: 19, label: 'Butterfly' },
        { id: 21, label: 'Gum Pop' },
        { id: 22, label: 'Confetti' },
        { id: 23, label: 'Halo' },
        { id: 24, label: 'Stars' },
        { id: 25, label: 'Clock' },
        { id: 26, label: 'Rain' },
        { id: 27, label: 'Sneeze' },
        { id: 28, label: 'Thinking' },
        { id: 29, label: 'Fire' },
        { id: 30, label: 'Propeller' },
        { id: 31, label: 'Music' },
    ],
    bender: [
        // Classic expressions
        { id: 1, label: 'Head Tilt' },
        { id: 2, label: 'Skewed Eyes' },
        { id: 3, label: 'Squished Eyes' },
        { id: 4, label: 'Red Socket' },
        { id: 5, label: 'Flushed Eyes' },
        // Shifty / scheming
        { id: 6, label: 'Look Left' },
        { id: 7, label: 'Look Right' },
        { id: 8, label: 'Half-Lidded' },
        { id: 9, label: 'Crooked Grin' },
        { id: 10, label: 'Dilated Pupils' },
        // Angry
        { id: 11, label: 'Angry Squint' },
        { id: 12, label: 'Rage Eyes' },
        { id: 13, label: 'Clenched Jaw' },
        { id: 14, label: 'Raised Visor' },
        { id: 15, label: 'Red Socket Glow' },
        // Drunk / wobbly
        { id: 16, label: 'Drunk Sway' },
        { id: 17, label: 'One Eye Droopy' },
        { id: 18, label: 'Round Pupils' },
        { id: 19, label: 'Tilted Head' },
        { id: 20, label: 'Lopsided Mouth' },
        // Maniacal / evil
        { id: 21, label: 'Bright Eyes' },
        { id: 22, label: 'Tiny Pupils' },
        { id: 23, label: 'Wide Grin' },
        { id: 24, label: 'Big Eyes' },
        { id: 25, label: 'Red Antenna' },
        // Eye roll
        { id: 26, label: 'Eyes Up' },
        { id: 27, label: 'Eye Roll' },
        // Bored / unimpressed
        { id: 28, label: 'Bored Lids' },
        { id: 29, label: 'Side-Eye' },
        { id: 30, label: 'Flat Mouth' },
        // Surprised / shocked
        { id: 31, label: 'Wide Eyes' },
        { id: 32, label: 'Huge Pupils' },
        { id: 33, label: 'Open Mouth' },
        { id: 34, label: 'Jumped Up' },
        // Smug / cool
        { id: 35, label: 'Smug Wink' },
        { id: 36, label: 'Smug Grin' },
        { id: 37, label: 'Side Glance' },
        // Antenna reactions
        { id: 38, label: 'Antenna Wobble' },
        { id: 39, label: 'Antenna Flash' },
        // Twitchy / glitchy
        { id: 40, label: 'Glitch Eye' },
        { id: 41, label: 'Pupil Twitch' },
        // Signature expressions
        { id: 42, label: 'Evil Grin' },
        { id: 43, label: 'Wink' },
        { id: 44, label: 'Droopy Sad' },
        { id: 45, label: 'Suspicious Squint' },
        { id: 46, label: 'Love Eyes' },
        { id: 47, label: 'Vibrating Rage' },
        { id: 48, label: 'Sleepy Blink' },
        { id: 49, label: 'Mischievous' },
        { id: 50, label: 'Belly Laugh' },
        { id: 99, label: 'Cigar Puff' },
    ]
};

export const DEFAULT_ANIMATIONS = ROBOT_ANIMATIONS_CATALOG.curio;

export const applyRobotThemeCss = (accent: string, eyeArc: string = accent, eyeRimOuter: string = accent) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--robot-accent', accent);
    root.style.setProperty('--robot-eye-arc', eyeArc);
    root.style.setProperty('--robot-eye-rim-outer', eyeRimOuter);
};

export const PENDING_GOOGLE_PICKER_SESSION_KEY = 'curio_pending_picker_session_id';
