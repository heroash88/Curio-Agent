/**
 * Light text normalization before phonemization. Keeps punctuation so the
 * phonemizer emits the right prosody cues; strips HTML/URLs/emails that
 * the model has no way to pronounce sensibly.
 */

const URL_REGEX = /https?:\/\/\S+|www\.\S+/gi;
const EMAIL_REGEX = /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi;
const HTML_REGEX = /<[^>]+>/g;
const WHITESPACE_REGEX = /\s+/g;

const CONTRACTIONS: Array<[RegExp, string]> = [
    [/\bcan't\b/gi, "cannot"],
    [/\bwon't\b/gi, "will not"],
    [/\bshan't\b/gi, "shall not"],
    [/\bain't\b/gi, "is not"],
    [/\blet's\b/gi, "let us"],
    [/\bit's\b/gi, "it is"],
];

export const preprocessText = (raw: string): string => {
    let out = raw.normalize("NFC");
    out = out.replace(HTML_REGEX, " ");
    out = out.replace(URL_REGEX, " ");
    out = out.replace(EMAIL_REGEX, " ");
    for (const [pattern, replacement] of CONTRACTIONS) {
        out = out.replace(pattern, replacement);
    }
    out = out.replace(WHITESPACE_REGEX, " ").trim();
    return out;
};

// Split long text into sentence-size chunks. Each chunk is phonemized and
// inferred separately so the user hears the first chunk quickly.
export const chunkText = (text: string, maxLen = 400): string[] => {
    const chunks: string[] = [];
    const sentences = text.split(/([.!?]+)/g);

    // Re-pair sentence + terminator so punctuation is preserved.
    const pieces: string[] = [];
    for (let i = 0; i < sentences.length; i += 2) {
        const sentence = (sentences[i] || "").trim();
        const punct = (sentences[i + 1] || "").trim();
        const combined = (sentence + (punct || "")).trim();
        if (combined) pieces.push(combined);
    }

    for (const piece of pieces) {
        if (piece.length <= maxLen) {
            chunks.push(ensurePunctuation(piece));
            continue;
        }
        // Long sentence -- word-wrap into maxLen-sized pieces.
        let current = "";
        for (const word of piece.split(/\s+/)) {
            const next = current ? `${current} ${word}` : word;
            if (next.length <= maxLen) {
                current = next;
            } else {
                if (current) chunks.push(ensurePunctuation(current));
                current = word;
            }
        }
        if (current) chunks.push(ensurePunctuation(current));
    }

    return chunks;
};

const ensurePunctuation = (text: string): string => {
    const trimmed = text.trim();
    if (!trimmed) return trimmed;
    return /[.!?,;:]$/.test(trimmed) ? trimmed : `${trimmed},`;
};
