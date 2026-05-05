import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchStockHistory,
  fetchStockQuote,
  parseStockSymbols,
  removeStockSymbol,
  resetStockMarketServiceForTests,
  searchStockSymbols,
  upsertStockSymbol,
} from './stockMarketService';

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 500) => ({
  ok,
  status,
  headers: { get: () => null } as unknown as Headers,
  json: async () => body,
}) as Response;

const textResponse = (body: string, ok = true, status = ok ? 200 : 500) => ({
  ok,
  status,
  text: async () => body,
}) as Response;

describe('stockMarketService', () => {
  beforeEach(() => {
    resetStockMarketServiceForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.pushState(null, '', '/');
  });

  it('loads quote data through the same-origin Yahoo proxy', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      chart: {
        result: [
          {
            meta: {
              symbol: 'AAPL',
              shortName: 'Apple Inc.',
              currency: 'USD',
              regularMarketPrice: 189.12,
              previousClose: 186.9,
            },
          },
        ],
      },
    }));

    const quote = await fetchStockQuote('aapl', undefined, fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      '/stock-proxy/v8/finance/chart/AAPL',
      { signal: undefined },
    );
    expect(quote).toEqual({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      price: 189.12,
      change: 2.219999999999999,
      changePercent: 1.1878009630818614,
      currency: 'USD',
    });
  });

  it('loads historical chart data through the same-origin Yahoo proxy', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      chart: {
        result: [
          {
            meta: {
              currency: 'USD',
            },
            timestamp: [1_700_000_000, 1_700_086_400, 1_700_172_800],
            indicators: {
              quote: [
                {
                  close: [188.25, 190.5, null],
                },
              ],
            },
          },
        ],
      },
    }));

    const history = await fetchStockHistory('aapl', '1m', undefined, fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      '/stock-proxy/v8/finance/chart/AAPL?range=1mo&interval=1d&includePrePost=false',
      { signal: undefined },
    );
    expect(history).toEqual([
      {
        timestamp: 1_700_000_000_000,
        close: 188.25,
        currency: 'USD',
      },
      {
        timestamp: 1_700_086_400_000,
        close: 190.5,
        currency: 'USD',
      },
    ]);
  });

  it('falls back to Stooq historical data when Yahoo chart history is rate limited', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T12:00:00Z'));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, false, 429))
      .mockResolvedValueOnce(textResponse([
        '<html><body><table id="fth1"><tbody>',
        '<tr><td>2</td><td nowrap>24 Apr 2026</td><td>189.00</td><td>191.00</td><td>188.00</td><td>190.25</td><td>+1.00%</td><td>+1.25</td><td>2000</td></tr>',
        '<tr><td>1</td><td nowrap>13 Mar 2026</td><td>180.00</td><td>181.00</td><td>179.00</td><td>180.50</td><td>-0.50%</td><td>-0.90</td><td>1000</td></tr>',
        '</tbody></table></body></html>',
      ].join('\n')));

    const history = await fetchStockHistory('aapl', '1m', undefined, fetcher);

    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      '/stooq-proxy/q/d/?s=AAPL.US&i=d&d1=20260313&d2=20260427',
      { signal: undefined },
    );
    expect(history).toEqual([
      {
        timestamp: Date.parse('2026-03-13T00:00:00Z'),
        close: 180.5,
        currency: 'USD',
      },
      {
        timestamp: Date.parse('2026-04-24T00:00:00Z'),
        close: 190.25,
        currency: 'USD',
      },
    ]);
  });

  it('uses distinct Stooq date windows for different history ranges while Yahoo is cooling down', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T12:00:00Z'));
    const csv = [
      '<html><body><table id="fth1"><tbody>',
      '<tr><td>1</td><td nowrap>24 Apr 2026</td><td>189.00</td><td>191.00</td><td>188.00</td><td>190.25</td><td>+1.00%</td><td>+1.25</td><td>2000</td></tr>',
      '</tbody></table></body></html>',
    ].join('\n');
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, false, 429))
      .mockResolvedValue(textResponse(csv));

    await fetchStockHistory('AAPL', '1w', undefined, fetcher);
    await fetchStockHistory('AAPL', '1y', undefined, fetcher);

    const urls = fetcher.mock.calls.map(([url]) => String(url));
    expect(urls).toContain('/stooq-proxy/q/d/?s=AAPL.US&i=d&d1=20260413&d2=20260427');
    expect(urls).toContain('/stooq-proxy/q/d/?s=AAPL.US&i=d&d1=20250412&d2=20260427');
  });

  it('keeps proxy requests under the Home Assistant ingress path', async () => {
    window.history.pushState(null, '', '/api/hassio_ingress/test-token/dashboard');
    const fetcher = vi.fn(async () => jsonResponse({
      chart: {
        result: [
          {
            meta: {
              symbol: 'AAPL',
              currency: 'USD',
              regularMarketPrice: 189.12,
              previousClose: 186.9,
            },
          },
        ],
      },
    }));

    await fetchStockQuote('AAPL', undefined, fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      '/api/hassio_ingress/test-token/stock-proxy/v8/finance/chart/AAPL',
      { signal: undefined },
    );
  });

  it('searches companies by name through the same-origin Yahoo proxy', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      quotes: [
        {
          symbol: 'AAPL',
          shortname: 'Apple Inc.',
          exchDisp: 'NASDAQ',
          quoteType: 'EQUITY',
        },
        { shortname: 'Missing ticker' },
      ],
    }));

    const results = await searchStockSymbols('apple', undefined, fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      '/stock-proxy/v1/finance/search?q=apple&quotesCount=8&newsCount=0',
      { signal: undefined },
    );
    expect(results).toEqual([
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        exchange: 'NASDAQ',
        type: 'EQUITY',
      },
    ]);
  });

  it('falls back to Stooq quote data when Yahoo is unavailable', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, false))
      .mockResolvedValueOnce(textResponse([
        'Symbol,Date,Time,Open,High,Low,Close,Volume',
        'AAPL.US,2026-04-24,22:00:19,186.90,190.00,185.10,189.12,1000',
      ].join('\n')));

    const quote = await fetchStockQuote('AAPL', undefined, fetcher);

    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      '/stooq-proxy/q/l/?s=AAPL.US&f=sd2t2ohlcv&h&e=csv',
      { signal: undefined },
    );
    expect(quote).toEqual({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      price: 189.12,
      change: 2.219999999999999,
      changePercent: 1.1878009630818614,
      currency: 'USD',
      instrumentType: 'EQUITY',
    });
  });

  it('serializes Yahoo quote attempts after a rate limit so concurrent loads do not spam Yahoo', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stock-proxy/')) {
        return jsonResponse({ error: 'rate limited' }, false, 429);
      }
      if (url.includes('AAPL.US')) {
        return textResponse([
          'Symbol,Date,Time,Open,High,Low,Close,Volume',
          'AAPL.US,2026-04-24,22:00:19,186.90,190.00,185.10,189.12,1000',
        ].join('\n'));
      }
      if (url.includes('TSLA.US')) {
        return textResponse([
          'Symbol,Date,Time,Open,High,Low,Close,Volume',
          'TSLA.US,2026-04-24,22:00:19,242.00,245.10,238.40,241.50,1000',
        ].join('\n'));
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await Promise.all([
      fetchStockQuote('AAPL', undefined, fetcher),
      fetchStockQuote('TSLA', undefined, fetcher),
    ]);

    const requestedUrls = fetcher.mock.calls.map(([url]) => String(url));
    expect(requestedUrls.filter((url) => url.includes('/stock-proxy/'))).toEqual([
      '/stock-proxy/v8/finance/chart/AAPL',
    ]);
    expect(requestedUrls).toContain('/stooq-proxy/q/l/?s=AAPL.US&f=sd2t2ohlcv&h&e=csv');
    expect(requestedUrls).toContain('/stooq-proxy/q/l/?s=TSLA.US&f=sd2t2ohlcv&h&e=csv');
  });

  it('falls back to local autocomplete matches when Yahoo search is unavailable', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('rate limited');
    });

    await expect(searchStockSymbols('microsoft', undefined, fetcher)).resolves.toEqual([
      {
        symbol: 'MSFT',
        name: 'Microsoft Corporation',
        exchange: 'NASDAQ',
        type: 'EQUITY',
      },
    ]);
  });

  it('uses local autocomplete while Yahoo search is rate limited', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ error: 'rate limited' }, false, 429));

    const firstResults = await searchStockSymbols('microsoft', undefined, fetcher);
    const secondResults = await searchStockSymbols('microsoft', undefined, fetcher);

    expect(firstResults).toEqual([
      {
        symbol: 'MSFT',
        name: 'Microsoft Corporation',
        exchange: 'NASDAQ',
        type: 'EQUITY',
      },
    ]);
    expect(secondResults).toEqual(firstResults);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('normalizes and de-dupes tracked symbols', () => {
    expect(parseStockSymbols(' aapl, TSLA,, btc-usd ')).toEqual(['AAPL', 'TSLA', 'BTC-USD']);
    expect(parseStockSymbols(undefined)).toEqual(['AAPL', 'TSLA', 'BTC-USD']);
    expect(parseStockSymbols('')).toEqual([]);
    expect(upsertStockSymbol('AAPL, TSLA', 'aapl')).toBe('AAPL,TSLA');
    expect(upsertStockSymbol('AAPL, TSLA', 'msft')).toBe('AAPL,TSLA,MSFT');
    expect(upsertStockSymbol('', 'msft')).toBe('MSFT');
    expect(removeStockSymbol('AAPL, TSLA', 'aapl')).toBe('TSLA');
    expect(removeStockSymbol(undefined, 'tsla')).toBe('AAPL,BTC-USD');
  });
});
