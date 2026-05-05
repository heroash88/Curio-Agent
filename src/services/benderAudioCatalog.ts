/**
 * Bender Audio Catalog
 *
 * Defines all Bender personality sound clips organized by category.
 * To add new clips:
 *   1. Drop the .mp3 file into the appropriate public/audio/bender/<category>/ folder
 *   2. Add an entry to the matching array below
 *   3. That's it -- the playback functions pick a random clip from the array
 *
 * Categories:
 *   - connect:       Played when a session starts (greeting)
 *   - dismiss:       Played when a session ends (farewell)
 *   - interjection:  Played randomly mid-conversation for flavor
 */

export interface BenderClip {
    /** File path relative to public root, e.g. "/audio/bender/connect/hey.mp3" */
    src: string;
    /** Human-readable label (for docs / debug) */
    label: string;
}

export const BENDER_CONNECT_CLIPS: BenderClip[] = [
    { src: '/audio/bender/connect/call-me-bender.mp3', label: 'Call me Bender' },
    { src: '/audio/bender/connect/hey.mp3', label: 'Hey' },
    { src: '/audio/bender/connect/i-m-bender.mp3', label: "I'm Bender" },
];

export const BENDER_DISMISS_CLIPS: BenderClip[] = [
    { src: '/audio/bender/dismiss/ah-boo-hoo.mp3', label: 'Ah boo hoo' },
    { src: '/audio/bender/dismiss/ah-crap.mp3', label: 'Ah crap' },
    { src: '/audio/bender/dismiss/no-you-shut-up.mp3', label: 'No you shut up' },
];

export const BENDER_INTERJECTION_CLIPS: BenderClip[] = [
    { src: '/audio/bender/interjection/ah-ok.mp3', label: 'Ah ok' },
    { src: '/audio/bender/interjection/bite-my-shiny-metal-ass.mp3', label: 'Bite my shiny metal ass' },
    { src: '/audio/bender/interjection/can-t-you-see-i-m-using-the-toilet.mp3', label: "Can't you see I'm using the toilet" },
    { src: '/audio/bender/interjection/i-m-bender-2.mp3', label: "I'm Bender (alt)" },
];

/** Pick a random clip from an array */
export const pickRandom = (clips: BenderClip[]): BenderClip | undefined =>
    clips.length > 0 ? clips[Math.floor(Math.random() * clips.length)] : undefined;
