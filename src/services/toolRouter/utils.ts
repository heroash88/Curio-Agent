/**
 * Shared helpers used by several tool handlers and exposed on the public
 * toolCallRouter surface.
 */

import type { CardEvent } from '../cardTypes';
import { musicPlaybackService, toMusicCardData } from '../musicPlaybackService';

const EXPLICIT_VIDEO_INTENT_PATTERNS = [
    /\bmusic video\b/i, /\byoutube video\b/i, /\bofficial video\b/i,
    /\bvideo on youtube\b/i, /\bwatch\b/i, /\bshow me (?:the )?video\b/i,
];

export const isExplicitVideoIntent = (query: string): boolean =>
    EXPLICIT_VIDEO_INTENT_PATTERNS.some((p) => p.test(query));

export const normalizeVideoSearchQuery = (query: string): string =>
    query.replace(/^\s*(?:please\s+)?(?:play|watch|show|find|open)\s+/i, '')
        .replace(/\s+on youtube\s*$/i, '').trim();

export function sanitizeToolResultForModel(result: any): any {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
    let sanitized = result;
    if ('__curio' in sanitized) {
        const { __curio: _ignored, ...rest } = sanitized;
        sanitized = rest;
    }
    if (Array.isArray(sanitized.content)) {
        const textParts = sanitized.content
            .filter((c: any) => c?.type === 'text' && c?.text)
            .map((c: any) => c.text);
        if (textParts.length > 0) {
            return { output: textParts.join('\n'), isError: sanitized.isError ?? false };
        }
    }
    return sanitized;
}

export function emitMusicCardEvent(
    onCardEvent: ((event: CardEvent) => void) | undefined,
    snapshot: ReturnType<typeof musicPlaybackService.getState>,
): boolean {
    if (!onCardEvent) return false;
    const cardData = toMusicCardData(snapshot);
    if (!cardData) return false;
    try {
        onCardEvent({ type: 'music', data: cardData as unknown as Record<string, unknown>, persistent: true });
        return true;
    } catch { return false; }
}
