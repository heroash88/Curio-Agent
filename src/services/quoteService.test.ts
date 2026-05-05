import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchQuoteBatch,
  getQuoteRefreshIntervalMinutes,
  resetQuoteServiceForTests,
} from './quoteService';

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 500) => ({
  ok,
  status,
  json: async () => body,
}) as Response;

describe('quoteService', () => {
  afterEach(() => {
    resetQuoteServiceForTests();
    localStorage.clear();
    window.history.pushState(null, '', '/');
  });

  it('loads a batch of quotes through the same-origin ZenQuotes proxy', async () => {
    const fetcher = vi.fn(async () => jsonResponse([
      { q: 'Make it work, make it right, make it fast.', a: 'Kent Beck' },
      { q: 'Simplicity is prerequisite for reliability.', a: 'Edsger W. Dijkstra' },
    ]));

    const quotes = await fetchQuoteBatch({ fetcher, nowMs: 1_777_000_000_000 });

    expect(fetcher).toHaveBeenCalledWith(
      '/quotes-proxy/api/quotes',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/json' }),
      }),
    );
    expect(quotes).toEqual([
      {
        text: 'Make it work, make it right, make it fast.',
        author: 'Kent Beck',
        source: 'zenquotes',
        sourceLabel: 'ZenQuotes',
      },
      {
        text: 'Simplicity is prerequisite for reliability.',
        author: 'Edsger W. Dijkstra',
        source: 'zenquotes',
        sourceLabel: 'ZenQuotes',
      },
    ]);
  });

  it('keeps proxy requests under the Home Assistant ingress path', async () => {
    window.history.pushState(null, '', '/api/hassio_ingress/test-token/dashboard');
    const fetcher = vi.fn(async () => jsonResponse([
      { q: 'A calm interface is a useful interface.', a: 'Curio' },
    ]));

    await fetchQuoteBatch({ fetcher, nowMs: 1_777_000_000_000 });

    expect(fetcher).toHaveBeenCalledWith(
      '/api/hassio_ingress/test-token/quotes-proxy/api/quotes',
      expect.any(Object),
    );
  });

  it('uses a one-hour default refresh interval and falls back to local quotes when remote loading fails', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ error: 'rate limited' }, false, 429));

    const quotes = await fetchQuoteBatch({ fetcher, nowMs: 1_777_000_000_000 });

    expect(getQuoteRefreshIntervalMinutes({})).toBe(60);
    expect(getQuoteRefreshIntervalMinutes({ refreshIntervalMinutes: 5 })).toBe(15);
    expect(quotes.length).toBeGreaterThan(5);
    expect(quotes[0]).toMatchObject({
      source: 'local',
      sourceLabel: 'Curio library',
    });
  });
});
