import { afterEach, describe, expect, it, vi } from 'vitest';

import { releaseTinyTextCache, textToPhonemeIds } from './text';
import { releaseG2PModel } from './g2pPredict';

describe('TinyTTS text pipeline', () => {
    afterEach(() => {
        releaseTinyTextCache();
        releaseG2PModel();
        vi.restoreAllMocks();
    });

    it('converts CMU dictionary words into aligned TinyTTS id streams', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (url.endsWith('/cmudict.json')) {
                return new Response(JSON.stringify({
                    HELLO: ['HH', 'AH0', 'L', 'OW1'],
                    WORLD: ['W', 'ER1', 'L', 'D'],
                }), { status: 200 });
            }
            return new Response('{}', { status: 404 });
        }));

        const result = await textToPhonemeIds('Hello world.');

        expect(result.phoneIds.length).toBe(result.toneIds.length);
        expect(result.phoneIds.length).toBe(result.langIds.length);
        expect(result.phoneIds.length).toBeGreaterThan(10);
        expect(result.phoneIds[0]).toBe(0);
        expect(result.toneIds[0]).toBe(0);
        expect(result.langIds[0]).toBe(0);
    });
});
