import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchFunFact,
  getFunFactRefreshIntervalMinutes,
  resetFunFactServiceForTests,
} from './funFactService';

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 500) => ({
  ok,
  status,
  json: async () => body,
}) as Response;

describe('funFactService', () => {
  afterEach(() => {
    resetFunFactServiceForTests();
    localStorage.clear();
    window.history.pushState(null, '', '/');
  });

  it('loads a random fact through the same-origin facts proxy', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      text: 'Sea otters hold hands while sleeping so they do not drift apart.',
      source: 'Example source',
      source_url: 'https://example.com/otters',
      permalink: 'https://uselessfacts.jsph.pl/fact/otters',
    }));

    const fact = await fetchFunFact({ fetcher, nowMs: 1_777_000_000_000 });

    expect(fetcher).toHaveBeenCalledWith(
      '/facts-proxy/api/v2/facts/random?language=en',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/json' }),
      }),
    );
    expect(fact).toEqual({
      text: 'Sea otters hold hands while sleeping so they do not drift apart.',
      source: 'uselessfacts',
      sourceLabel: 'Useless Facts',
      sourceUrl: 'https://example.com/otters',
      permalink: 'https://uselessfacts.jsph.pl/fact/otters',
    });
  });

  it('keeps proxy requests under the Home Assistant ingress path', async () => {
    window.history.pushState(null, '', '/api/hassio_ingress/test-token/dashboard');
    const fetcher = vi.fn(async () => jsonResponse({
      text: 'The first oranges were not orange.',
    }));

    await fetchFunFact({ fetcher, nowMs: 1_777_000_000_000 });

    expect(fetcher).toHaveBeenCalledWith(
      '/api/hassio_ingress/test-token/facts-proxy/api/v2/facts/random?language=en',
      expect.any(Object),
    );
  });

  it('defaults to hourly refresh and falls back locally when the source fails', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ error: 'offline' }, false, 503));

    const fact = await fetchFunFact({ fetcher, nowMs: 1_777_000_000_000 });

    expect(getFunFactRefreshIntervalMinutes({})).toBe(60);
    expect(getFunFactRefreshIntervalMinutes({ refreshIntervalMinutes: 5 })).toBe(15);
    expect(fact.source).toBe('local');
    expect(fact.sourceLabel).toBe('Curio facts');
    expect(fact.text.length).toBeGreaterThan(20);
  });
});
