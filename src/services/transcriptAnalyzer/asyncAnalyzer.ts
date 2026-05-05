/**
 * Async transcript analysis -- handles tokens that require network fetches (e.g. IMAGE_SEARCH).
 * Call after analyzeTranscript (synchronous detectors) when the turn is complete.
 */

import type { CardEvent } from '../cardTypes';

export async function analyzeTranscriptAsync(
    text: string
): Promise<CardEvent | null> {
    if (!text) return null;

    const imageSearchMatch = text.match(/IMAGE_SEARCH:\s*(.+?)(?:\n|$)/i);

    if (imageSearchMatch) {
        const query = imageSearchMatch[1].trim();
        console.log('[ImageSearch] Attempting Wikipedia fetch for query: ' + query);
        try {
            const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(query.replace(/\s+/g, '_'));
            const res = await fetch(url);

            if (res.ok) {
                const json = await res.json();
                if (json.thumbnail && json.thumbnail.source) {
                    const shortCaption = json.extract
                        ? (json.extract.length > 150 ? json.extract.substring(0, 150) + '...' : json.extract)
                        : query;

                    return {
                        type: 'image',
                        data: { imageUrl: json.thumbnail.source, caption: shortCaption } as unknown as Record<string, unknown>,
                        autoDismissMs: 12000,
                    };
                } else {
                    console.warn(`[ImageSearch] Wikipedia article found but no thumbnail: ${query}`);
                }
            } else {
                console.warn(`[ImageSearch] Wikipedia returned ${res.status} for query: ${query}`);
            }
        } catch (err) {
            console.warn('[ImageSearch] Wikipedia fetch error:', err);
        }
    }

    return null;
}
