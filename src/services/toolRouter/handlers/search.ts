/**
 * Google Search proxy used by Gemini Live 3.1 and text LLM tool agents.
 */

import { register } from '../router';

register('google_search', async (args, _ctx) => {
    const query = args.query || args.q || '';
    if (!query) {
        return { result: { success: false, error: 'No search query provided' }, emittedCard: false };
    }
    try {
        const { geminiSearchProxy } = await import('../../geminiSearchProxy');
        const searchResult = await geminiSearchProxy(query);
        return { result: { success: true, ...searchResult }, emittedCard: false };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});
