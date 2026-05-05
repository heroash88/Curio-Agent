/**
 * Shared helpers for transcript analysis detectors.
 */

/** Words that signal the AI is *offering* to do something rather than *doing* it */
const CONVERSATIONAL_REJECT = [
    'want to hear', 'want a ', 'like a ', 'how about', 'shall i',
    'would you like', 'want me to', 'i can share', 'i could share',
    'i can tell you', 'let me know if', 'should i', 'do you want',
    'i could also', 'maybe i can', 'if you\'d like', 'if you want',
    'i\'d be happy to', 'would you prefer', 'care to hear',
    'i\'ll tell you', 'i can also', 'i\'ll share', 'let me share',
    'i have a', 'here\'s one', 'i know a', 'i\'ve got',
];

/** Returns true when the text is the AI asking/offering rather than delivering content */
export function isConversationalOffer(normalized: string): boolean {
    return CONVERSATIONAL_REJECT.some(p => normalized.includes(p));
}

/** Count how many keywords from a list appear in the text */
export function keywordScore(normalized: string, keywords: string[]): number {
    return keywords.reduce((n, kw) => n + (normalized.includes(kw) ? 1 : 0), 0);
}

/** True when the text is a question directed at the user (not a statement) */
export function isQuestion(normalized: string): boolean {
    return /\?$/.test(normalized.trim()) ||
        /^(?:what|where|when|who|how|why|do you|can you|could you|would you|is there|are there)\b/.test(normalized.trim());
}
