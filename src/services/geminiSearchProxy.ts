/**
 * geminiSearchProxy -- proxies search queries through Gemini 2.5 Flash Lite's
 * text API with Google Search grounding enabled.
 *
 * Used by 3.1 Live models where native googleSearch grounding on the Live API
 * causes disconnects on the free tier. Flash Lite 3.1 also lacks free-tier
 * search grounding, so we use 2.5 Flash Lite which has 500 RPD free.
 *
 * The Live model calls a `google_search` function, which routes here, makes a
 * text-only generateContent call with grounding, and returns the result.
 *
 * Quota protection: the model can misfire search calls on trivial utterances
 * ("hello", "thanks", "what's 2+2") which chews through the 500 RPD budget.
 * We add three cheap, local guards BEFORE hitting the network:
 *   1. Minimum query length + shape check -- rejects one-word / empty / greeting
 *      queries without making a request.
 *   2. Short-term dedupe -- identical query within DEDUPE_WINDOW_MS returns the
 *      cached answer.
 *   3. Per-minute rate limit -- caps requests at MAX_PER_MINUTE to survive a
 *      runaway loop.
 * All guards short-circuit locally and never contact the network.
 */

import { GoogleGenAI } from '@google/genai';
import { getApiKeyAsync } from './ai/config';

const SEARCH_MODEL = 'gemini-2.5-flash-lite';
const SEARCH_TIMEOUT_MS = 15_000;

// Quota guards.
const MIN_QUERY_LENGTH = 4;
const DEDUPE_WINDOW_MS = 60_000;
const MAX_PER_MINUTE = 8;
const RATE_WINDOW_MS = 60_000;

// Queries that should never hit the network -- small talk, greetings, trivial
// single-word prompts the model sometimes forwards verbatim. Match is case-
// insensitive on the trimmed query string.
const TRIVIAL_QUERY_PATTERNS: RegExp[] = [
    /^(hi|hello|hey|yo|sup|hiya|howdy)\b/i,
    /^(thanks|thank you|thx|ty)\b/i,
    /^(ok|okay|cool|nice|great|good|bye|goodbye)\b/i,
    /^(yes|no|yep|nope|yeah|nah)\b/i,
    /^(what|who|why|how|when|where)\??$/i,
    /^test\b/i,
];

const cache = new Map<string, { at: number; result: string }>();
const recentCalls: number[] = [];

function normaliseQuery(q: string): string {
    return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isTrivialQuery(q: string): boolean {
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return true;
    // Single word queries are almost never a legitimate search.
    if (!trimmed.includes(' ')) return true;
    return TRIVIAL_QUERY_PATTERNS.some(re => re.test(trimmed));
}

function underRateLimit(): boolean {
    const now = Date.now();
    // Drop expired entries.
    while (recentCalls.length && now - recentCalls[0] > RATE_WINDOW_MS) {
        recentCalls.shift();
    }
    return recentCalls.length < MAX_PER_MINUTE;
}

/**
 * Perform a grounded Google Search via the Flash Lite text API.
 * Returns a plain-text summary of search results.
 */
export async function geminiSearchProxy(query: string): Promise<{ result: string }> {
    if (!query || typeof query !== 'string') {
        return { result: 'Search skipped -- empty query.' };
    }

    if (isTrivialQuery(query)) {
        console.warn('[GeminiSearchProxy] Skipped trivial query:', JSON.stringify(query));
        return { result: 'Search skipped -- query too trivial. Answer from general knowledge.' };
    }

    const key = normaliseQuery(query);
    const now = Date.now();

    // Dedupe: same query within the window reuses the cached answer.
    const cached = cache.get(key);
    if (cached && now - cached.at < DEDUPE_WINDOW_MS) {
        console.log('[GeminiSearchProxy] Served from dedupe cache:', JSON.stringify(query));
        return { result: cached.result };
    }

    if (!underRateLimit()) {
        console.warn('[GeminiSearchProxy] Rate limit hit -- rejecting query:', JSON.stringify(query));
        return { result: 'Search temporarily unavailable -- too many recent searches. Answer from general knowledge.' };
    }

    const apiKey = await getApiKeyAsync();
    if (!apiKey) {
        return { result: 'Search unavailable -- no API key configured.' };
    }

    recentCalls.push(now);

    const ai = new GoogleGenAI({ apiKey });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

    try {
        const response = await ai.models.generateContent({
            model: SEARCH_MODEL,
            contents: query,
            config: {
                tools: [{ googleSearch: {} }],
                systemInstruction: 'You are a search assistant. Answer the query using the Google Search results. Be concise and factual. Include key details like dates, numbers, and names. Do not add commentary.',
            },
        });

        const text = response?.text?.trim();
        if (!text) {
            return { result: 'Search returned no results.' };
        }

        cache.set(key, { at: now, result: text });
        // Keep cache bounded.
        if (cache.size > 50) {
            const oldestKey = cache.keys().next().value;
            if (oldestKey) cache.delete(oldestKey);
        }

        return { result: text };
    } catch (e: any) {
        console.error('[GeminiSearchProxy] Search failed:', e.message || e);
        return { result: `Search failed: ${e.message || 'unknown error'}` };
    } finally {
        clearTimeout(timer);
    }
}

// Test-only hook -- lets the test suite reset internal state between runs.
// Intentionally not exported from a barrel; import by path if needed.
export function __resetGeminiSearchProxyForTests() {
    cache.clear();
    recentCalls.length = 0;
}
