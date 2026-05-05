import type { CardEvent } from '../../cardTypes';

const CHECK_EMAIL = /\b(?:check|read|show|open|any new|do i have|what(?:'s| is)?\s+(?:new|in))\s+(?:my\s+)?(?:email|emails|gmail|inbox|mail|messages?)\b/;
const CHECK_EMAIL_SIMPLE = /\b(?:my\s+(?:email|emails|inbox|mail)|new\s+(?:email|emails|mail|messages?))\b/;
const SEARCH_EMAIL = /\b(?:search|find|look for)\s+(?:my\s+)?(?:email|emails|gmail|inbox|mail)\s+(?:for|about)\s+(.+)/;

export function detectGmail(normalized: string, _trimmed: string): CardEvent | null {
    if (CHECK_EMAIL.test(normalized) || CHECK_EMAIL_SIMPLE.test(normalized)) {
        return { type: 'gmail' as any, data: { messages: [], mode: 'inbox' }, persistent: true };
    }
    const searchMatch = normalized.match(SEARCH_EMAIL);
    if (searchMatch) {
        return { type: 'gmail' as any, data: { messages: [], mode: 'search', query: searchMatch[1].trim() }, persistent: true };
    }
    return null;
}
