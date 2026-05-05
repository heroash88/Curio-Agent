export interface StockQuote {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  instrumentType?: string;
}

export interface StockSearchResult {
  symbol: string;
  name: string;
  exchange?: string;
  type?: string;
}

export type StockHistoryRange = '1d' | '1w' | '1m' | '3m' | 'ytd' | '1y' | '5y';

export interface StockHistoryPoint {
  timestamp: number;
  close: number;
  currency?: string;
}

type StockFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export const DEFAULT_STOCK_SYMBOLS = 'AAPL,TSLA,BTC-USD';
const YAHOO_STOCK_PROXY_BASE = '/stock-proxy';
const STOOQ_STOCK_PROXY_BASE = '/stooq-proxy';
const YAHOO_RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1_000;

const STOCK_HISTORY_RANGE_PARAMS: Record<
  StockHistoryRange,
  { range: string; interval: string }
> = {
  '1d': { range: '1d', interval: '5m' },
  '1w': { range: '5d', interval: '15m' },
  '1m': { range: '1mo', interval: '1d' },
  '3m': { range: '3mo', interval: '1d' },
  ytd: { range: 'ytd', interval: '1d' },
  '1y': { range: '1y', interval: '1wk' },
  '5y': { range: '5y', interval: '1mo' },
};

const STOOQ_HISTORY_LOOKBACK_DAYS: Record<
  Exclude<StockHistoryRange, 'ytd'>,
  number
> = {
  '1d': 7,
  '1w': 14,
  '1m': 45,
  '3m': 110,
  '1y': 380,
  '5y': 1_850,
};

let yahooRateLimitedUntil = 0;
let yahooQuoteQueue: Promise<void> = Promise.resolve();

const LOCAL_STOCK_SEARCH_CATALOG: StockSearchResult[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'META', name: 'Meta Platforms Inc.', exchange: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'NFLX', name: 'Netflix Inc.', exchange: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'AMD', name: 'Advanced Micro Devices Inc.', exchange: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'INTC', name: 'Intel Corporation', exchange: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'ORCL', name: 'Oracle Corporation', exchange: 'NYSE', type: 'EQUITY' },
  { symbol: 'CRM', name: 'Salesforce Inc.', exchange: 'NYSE', type: 'EQUITY' },
  { symbol: 'ADBE', name: 'Adobe Inc.', exchange: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', exchange: 'NYSE', type: 'EQUITY' },
  { symbol: 'V', name: 'Visa Inc.', exchange: 'NYSE', type: 'EQUITY' },
  { symbol: 'MA', name: 'Mastercard Incorporated', exchange: 'NYSE', type: 'EQUITY' },
  { symbol: 'WMT', name: 'Walmart Inc.', exchange: 'NYSE', type: 'EQUITY' },
  { symbol: 'DIS', name: 'The Walt Disney Company', exchange: 'NYSE', type: 'EQUITY' },
  { symbol: 'BRK-B', name: 'Berkshire Hathaway Inc.', exchange: 'NYSE', type: 'EQUITY' },
  { symbol: 'COIN', name: 'Coinbase Global Inc.', exchange: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', exchange: 'NYSE Arca', type: 'ETF' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', exchange: 'NASDAQ', type: 'ETF' },
  { symbol: 'BTC-USD', name: 'Bitcoin USD', exchange: 'Crypto', type: 'CRYPTOCURRENCY' },
  { symbol: 'ETH-USD', name: 'Ethereum USD', exchange: 'Crypto', type: 'CRYPTOCURRENCY' },
];

const normalizeStockSymbol = (symbol: string) => symbol.trim().toUpperCase();

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new Error('Stock request aborted.');
  }
};

const getRetryAfterMs = (response: Response): number | null => {
  const retryAfter = response.headers?.get('Retry-After');
  if (!retryAfter) return null;

  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1_000;
  }

  const retryAfterDate = Date.parse(retryAfter);
  if (Number.isFinite(retryAfterDate)) {
    return Math.max(0, retryAfterDate - Date.now());
  }

  return null;
};

const markYahooRateLimited = (response: Response) => {
  const retryAfterMs = getRetryAfterMs(response) ?? YAHOO_RATE_LIMIT_COOLDOWN_MS;
  yahooRateLimitedUntil = Math.max(
    yahooRateLimitedUntil,
    Date.now() + retryAfterMs,
  );
};

const isYahooRateLimited = () => Date.now() < yahooRateLimitedUntil;

const runYahooQuoteRequest = async <T>(task: () => Promise<T>): Promise<T> => {
  const previousRequest = yahooQuoteQueue;
  let releaseCurrentRequest = () => {};
  yahooQuoteQueue = new Promise<void>((resolve) => {
    releaseCurrentRequest = resolve;
  });

  await previousRequest;
  try {
    return await task();
  } finally {
    releaseCurrentRequest();
  }
};

const getIngressPrefix = () => {
  if (typeof window === 'undefined') return '';
  const match = window.location.pathname.match(/^(\/api\/hassio_ingress\/[^/]+)/);
  return match?.[1] || '';
};

const buildProxyPath = (proxyBase: string, path: string) =>
  `${getIngressPrefix()}${proxyBase}${path}`;

const parseSymbolList = (value: string): string[] =>
  value
    .split(',')
    .map(normalizeStockSymbol)
    .filter(Boolean)
    .filter((symbol, index, symbols) => symbols.indexOf(symbol) === index);

export const parseStockSymbols = (
  value: string | null | undefined,
): string[] => {
  const source = value == null ? DEFAULT_STOCK_SYMBOLS : value;
  return parseSymbolList(source);
};

export const upsertStockSymbol = (current: string, symbol: string): string => {
  const symbols = parseSymbolList(current);
  const normalizedSymbol = normalizeStockSymbol(symbol);
  if (!normalizedSymbol) return symbols.join(',');
  if (symbols.includes(normalizedSymbol)) return symbols.join(',');
  return [...symbols, normalizedSymbol].join(',');
};

export const removeStockSymbol = (
  current: string | null | undefined,
  symbol: string,
): string => {
  const normalizedSymbol = normalizeStockSymbol(symbol);
  if (!normalizedSymbol) return parseStockSymbols(current).join(',');
  return parseStockSymbols(current)
    .filter((trackedSymbol) => trackedSymbol !== normalizedSymbol)
    .join(',');
};

const findLocalStock = (symbol: string) =>
  LOCAL_STOCK_SEARCH_CATALOG.find((item) => item.symbol === normalizeStockSymbol(symbol));

const toStooqSymbol = (symbol: string) => {
  const normalizedSymbol = normalizeStockSymbol(symbol);
  if (normalizedSymbol.endsWith('-USD')) return normalizedSymbol.replace('-', '');
  if (normalizedSymbol.startsWith('^')) return normalizedSymbol;
  if (normalizedSymbol.endsWith('.US')) return normalizedSymbol;
  return `${normalizedSymbol}.US`;
};

const parseStooqCsvQuote = (csv: string, symbol: string): StockQuote => {
  const [, row = ''] = csv.trim().split(/\r?\n/);
  const [stooqSymbol, , , openValue, , , closeValue] = row.split(',');
  const price = Number(closeValue);
  const open = Number(openValue);
  if (!stooqSymbol || stooqSymbol.includes('N/D') || !Number.isFinite(price)) {
    throw new Error(`No fallback quote returned for ${symbol}.`);
  }

  const normalizedSymbol = normalizeStockSymbol(symbol);
  const localMatch = findLocalStock(normalizedSymbol);
  const change = Number.isFinite(open) ? price - open : 0;
  const changePercent = Number.isFinite(open) && open > 0 ? (change / open) * 100 : 0;

  return {
    symbol: normalizedSymbol,
    name: localMatch?.name,
    price,
    change,
    changePercent,
    currency: 'USD',
    instrumentType: localMatch?.type || (normalizedSymbol.endsWith('-USD') ? 'CRYPTOCURRENCY' : 'EQUITY'),
  };
};

const formatStooqDate = (date: Date) =>
  `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;

const STOOQ_MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const getStooqHistoryWindow = (range: StockHistoryRange) => {
  const now = new Date(Date.now());
  const endDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  const startDate = new Date(endDate);

  if (range === 'ytd') {
    startDate.setUTCMonth(0, 1);
    return {
      start: formatStooqDate(startDate),
      end: formatStooqDate(endDate),
    };
  }

  startDate.setUTCDate(startDate.getUTCDate() - STOOQ_HISTORY_LOOKBACK_DAYS[range]);
  return {
    start: formatStooqDate(startDate),
    end: formatStooqDate(endDate),
  };
};

const parseStooqHistoricalDate = (value: string) => {
  const match = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) return Number.NaN;
  const [, rawDay, rawMonth, rawYear] = match;
  const month = STOOQ_MONTH_INDEX[rawMonth.toLowerCase()];
  const day = Number(rawDay);
  const year = Number(rawYear);
  if (!Number.isInteger(day) || !Number.isInteger(year) || month == null) {
    return Number.NaN;
  }
  return Date.UTC(year, month, day);
};

const parseStooqHtmlHistory = (html: string): StockHistoryPoint[] => {
  if (typeof DOMParser === 'undefined') {
    return [];
  }

  const document = new DOMParser().parseFromString(html, 'text/html');
  return [...document.querySelectorAll('table#fth1 tr')]
    .map((row): StockHistoryPoint | null => {
      const cells = [...row.querySelectorAll('td')]
        .map((cell) => cell.textContent?.trim() || '');
      const timestamp = parseStooqHistoricalDate(cells[1] || '');
      const close = Number((cells[5] || '').replace(/,/g, ''));
      if (!Number.isFinite(timestamp) || !Number.isFinite(close)) {
        return null;
      }
      return {
        timestamp,
        close,
        currency: 'USD',
      };
    })
    .filter((point): point is StockHistoryPoint => point !== null)
    .sort((left, right) => left.timestamp - right.timestamp);
};

const fetchYahooStockQuote = async (
  symbol: string,
  signal?: AbortSignal,
  fetcher: StockFetch = fetch,
): Promise<StockQuote> => {
  const normalizedSymbol = normalizeStockSymbol(symbol);
  if (!normalizedSymbol) {
    throw new Error('Stock symbol is required.');
  }

  return runYahooQuoteRequest(async () => {
    throwIfAborted(signal);
    if (isYahooRateLimited()) {
      throw new Error('Yahoo Finance is rate limited.');
    }

    const response = await fetcher(
      buildProxyPath(YAHOO_STOCK_PROXY_BASE, `/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}`),
      { signal },
    );
    if (response.status === 429) {
      markYahooRateLimited(response);
      throw new Error(`Yahoo Finance is rate limited for ${normalizedSymbol}.`);
    }
    if (!response.ok) {
      throw new Error(`Quote fetch failed for ${normalizedSymbol}.`);
    }

    const payload = await response.json();
    const meta = payload?.chart?.result?.[0]?.meta;
    if (!meta) {
      throw new Error(`No quote metadata returned for ${normalizedSymbol}.`);
    }

    const previousClose = Number(meta.previousClose || 0);
    const price = Number(meta.regularMarketPrice || 0);
    const change = price - previousClose;
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

    return {
      symbol: normalizeStockSymbol(String(meta.symbol || normalizedSymbol)),
      name: meta.shortName || meta.longName || undefined,
      price,
      change,
      changePercent,
      currency: meta.currency || 'USD',
      instrumentType: meta.instrumentType || undefined,
    };
  });
};

const fetchStooqStockQuote = async (
  symbol: string,
  signal?: AbortSignal,
  fetcher: StockFetch = fetch,
): Promise<StockQuote> => {
  const normalizedSymbol = normalizeStockSymbol(symbol);
  const stooqSymbol = toStooqSymbol(normalizedSymbol);
  const response = await fetcher(
    buildProxyPath(STOOQ_STOCK_PROXY_BASE, `/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`),
    { signal },
  );
  if (!response.ok) {
    throw new Error(`Fallback quote fetch failed for ${normalizedSymbol}.`);
  }
  return parseStooqCsvQuote(await response.text(), normalizedSymbol);
};

export const fetchStockQuote = async (
  symbol: string,
  signal?: AbortSignal,
  fetcher: StockFetch = fetch,
): Promise<StockQuote> => {
  try {
    return await fetchYahooStockQuote(symbol, signal, fetcher);
  } catch (yahooError) {
    if (signal?.aborted) throw yahooError;
    try {
      return await fetchStooqStockQuote(symbol, signal, fetcher);
    } catch (stooqError) {
      throw new Error(
        `${(yahooError as Error).message} Fallback failed: ${(stooqError as Error).message}`,
      );
    }
  }
};

const fetchYahooStockHistory = async (
  symbol: string,
  range: StockHistoryRange = '1d',
  signal?: AbortSignal,
  fetcher: StockFetch = fetch,
): Promise<StockHistoryPoint[]> => {
  const normalizedSymbol = normalizeStockSymbol(symbol);
  if (!normalizedSymbol) {
    throw new Error('Stock symbol is required.');
  }

  return runYahooQuoteRequest(async () => {
    throwIfAborted(signal);
    if (isYahooRateLimited()) {
      throw new Error('Yahoo Finance is rate limited.');
    }

    const rangeParams = STOCK_HISTORY_RANGE_PARAMS[range] || STOCK_HISTORY_RANGE_PARAMS['1d'];
    const params = new URLSearchParams({
      range: rangeParams.range,
      interval: rangeParams.interval,
      includePrePost: 'false',
    });
    const response = await fetcher(
      buildProxyPath(
        YAHOO_STOCK_PROXY_BASE,
        `/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}?${params.toString()}`,
      ),
      { signal },
    );
    if (response.status === 429) {
      markYahooRateLimited(response);
      throw new Error(`Yahoo Finance is rate limited for ${normalizedSymbol}.`);
    }
    if (!response.ok) {
      throw new Error(`History fetch failed for ${normalizedSymbol}.`);
    }

    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const timestamps: unknown[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
    const closes: unknown[] = Array.isArray(result?.indicators?.quote?.[0]?.close)
      ? result.indicators.quote[0].close
      : [];
    const currency = typeof result?.meta?.currency === 'string'
      ? result.meta.currency
      : undefined;

    return timestamps
      .map((rawTimestamp: unknown, index: number): StockHistoryPoint | null => {
        const rawClose = closes[index];
        const timestamp = Number(rawTimestamp);
        const close = rawClose == null ? Number.NaN : Number(rawClose);
        if (!Number.isFinite(timestamp) || !Number.isFinite(close)) {
          return null;
        }
        return {
          timestamp: timestamp * 1_000,
          close,
          currency,
        };
      })
      .filter((point): point is StockHistoryPoint => point !== null);
  });
};

const fetchStooqStockHistory = async (
  symbol: string,
  range: StockHistoryRange = '1d',
  signal?: AbortSignal,
  fetcher: StockFetch = fetch,
): Promise<StockHistoryPoint[]> => {
  const normalizedSymbol = normalizeStockSymbol(symbol);
  const stooqSymbol = toStooqSymbol(normalizedSymbol);
  const window = getStooqHistoryWindow(range);
  const response = await fetcher(
    buildProxyPath(
      STOOQ_STOCK_PROXY_BASE,
      `/q/d/?s=${encodeURIComponent(stooqSymbol)}&i=d&d1=${window.start}&d2=${window.end}`,
    ),
    { signal },
  );
  if (!response.ok) {
    throw new Error(`Fallback history fetch failed for ${normalizedSymbol}.`);
  }
  return parseStooqHtmlHistory(await response.text());
};

export const fetchStockHistory = async (
  symbol: string,
  range: StockHistoryRange = '1d',
  signal?: AbortSignal,
  fetcher: StockFetch = fetch,
): Promise<StockHistoryPoint[]> => {
  try {
    return await fetchYahooStockHistory(symbol, range, signal, fetcher);
  } catch (yahooError) {
    if (signal?.aborted) throw yahooError;
    try {
      return await fetchStooqStockHistory(symbol, range, signal, fetcher);
    } catch (stooqError) {
      throw new Error(
        `${(yahooError as Error).message} Fallback failed: ${(stooqError as Error).message}`,
      );
    }
  }
};

const searchLocalStockSymbols = (query: string) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length < 2) return [];
  return LOCAL_STOCK_SEARCH_CATALOG
    .filter((item) =>
      item.symbol.toLowerCase().includes(normalizedQuery)
      || item.name.toLowerCase().includes(normalizedQuery)
      || item.exchange?.toLowerCase().includes(normalizedQuery),
    )
    .slice(0, 8);
};

const mergeSearchResults = (
  primary: StockSearchResult[],
  secondary: StockSearchResult[],
) => {
  const seen = new Set<string>();
  return [...primary, ...secondary]
    .filter((item) => {
      if (seen.has(item.symbol)) return false;
      seen.add(item.symbol);
      return true;
    })
    .slice(0, 8);
};

export const searchStockSymbols = async (
  query: string,
  signal?: AbortSignal,
  fetcher: StockFetch = fetch,
): Promise<StockSearchResult[]> => {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) return [];
  const localMatches = searchLocalStockSymbols(trimmedQuery);
  throwIfAborted(signal);
  if (isYahooRateLimited()) {
    return localMatches;
  }

  const params = new URLSearchParams({
    q: trimmedQuery,
    quotesCount: '8',
    newsCount: '0',
  });
  try {
    const response = await fetcher(
      buildProxyPath(YAHOO_STOCK_PROXY_BASE, `/v1/finance/search?${params.toString()}`),
      { signal },
    );
    if (response.status === 429) {
      markYahooRateLimited(response);
      return localMatches;
    }
    if (!response.ok) {
      throw new Error(`Stock search failed for ${trimmedQuery}.`);
    }

    const payload = await response.json() as { quotes?: Array<Record<string, unknown>> };
    const quotes: Array<Record<string, unknown>> = Array.isArray(payload.quotes) ? payload.quotes : [];
    const remoteMatches = quotes
      .map((quote): StockSearchResult | null => {
        const symbol = typeof quote?.symbol === 'string' ? normalizeStockSymbol(quote.symbol) : '';
        const rawName = quote.shortname || quote.longname || quote.name;
        const name = typeof rawName === 'string' ? rawName : symbol;
        if (!symbol || !name) return null;
        return {
          symbol,
          name,
          exchange: typeof quote.exchDisp === 'string'
            ? quote.exchDisp
            : typeof quote.exchange === 'string'
              ? quote.exchange
              : undefined,
          type: typeof quote.quoteType === 'string' ? quote.quoteType : undefined,
        };
      })
      .filter((quote): quote is StockSearchResult => quote !== null);
    return mergeSearchResults(localMatches, remoteMatches);
  } catch (searchError) {
    if (signal?.aborted) throw searchError;
    return localMatches;
  }
};

export const resetStockMarketServiceForTests = () => {
  yahooRateLimitedUntil = 0;
  yahooQuoteQueue = Promise.resolve();
};
