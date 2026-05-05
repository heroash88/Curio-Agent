import type { DashboardWidgetConfig } from './dashboardTypes';

export type DashboardQuoteSource = 'zenquotes' | 'local';

export interface DashboardQuote {
  text: string;
  author: string;
  source: DashboardQuoteSource;
  sourceLabel: string;
}

type QuoteFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface QuoteCachePayload {
  fetchedAt: number;
  quotes: DashboardQuote[];
}

export const DEFAULT_QUOTE_REFRESH_MINUTES = 60;
export const MIN_QUOTE_REFRESH_MINUTES = 15;
export const QUOTE_CACHE_TTL_MS = DEFAULT_QUOTE_REFRESH_MINUTES * 60 * 1000;

const QUOTE_PROXY_BASE = '/quotes-proxy';
const QUOTE_CACHE_KEY = 'curio:quotes:zenquotes-cache:v1';

export const LOCAL_QUOTES: DashboardQuote[] = [
  {
    text: 'The best way to predict the future is to invent it.',
    author: 'Alan Kay',
    source: 'local',
    sourceLabel: 'Curio library',
  },
  {
    text: 'Simplicity is the ultimate sophistication.',
    author: 'Leonardo da Vinci',
    source: 'local',
    sourceLabel: 'Curio library',
  },
  {
    text: 'Talk is cheap. Show me the code.',
    author: 'Linus Torvalds',
    source: 'local',
    sourceLabel: 'Curio library',
  },
  {
    text: 'Stay hungry, stay foolish.',
    author: 'Steve Jobs',
    source: 'local',
    sourceLabel: 'Curio library',
  },
  {
    text: 'First, solve the problem. Then, write the code.',
    author: 'John Johnson',
    source: 'local',
    sourceLabel: 'Curio library',
  },
  {
    text: 'In the middle of difficulty lies opportunity.',
    author: 'Albert Einstein',
    source: 'local',
    sourceLabel: 'Curio library',
  },
  {
    text: 'It does not matter how slowly you go as long as you do not stop.',
    author: 'Confucius',
    source: 'local',
    sourceLabel: 'Curio library',
  },
  {
    text: 'The journey of a thousand miles begins with one step.',
    author: 'Lao Tzu',
    source: 'local',
    sourceLabel: 'Curio library',
  },
  {
    text: 'Be yourself; everyone else is already taken.',
    author: 'Oscar Wilde',
    source: 'local',
    sourceLabel: 'Curio library',
  },
  {
    text: 'Do what you can, with what you have, where you are.',
    author: 'Theodore Roosevelt',
    source: 'local',
    sourceLabel: 'Curio library',
  },
];

const getIngressPrefix = () => {
  if (typeof window === 'undefined') return '';
  const match = window.location.pathname.match(/^(\/api\/hassio_ingress\/[^/]+)/);
  return match?.[1] || '';
};

const buildQuoteProxyPath = (path: string) =>
  `${getIngressPrefix()}${QUOTE_PROXY_BASE}${path}`;

const normalizeQuoteText = (value: unknown) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

const normalizeZenQuote = (value: unknown): DashboardQuote | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const text = normalizeQuoteText(record.q);
  const author = normalizeQuoteText(record.a) || 'Unknown';
  if (!text || text.length < 8) return null;
  return {
    text,
    author,
    source: 'zenquotes',
    sourceLabel: 'ZenQuotes',
  };
};

const getStorage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

const readQuoteCache = (nowMs: number, allowStale = false): DashboardQuote[] | null => {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(QUOTE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QuoteCachePayload>;
    if (!Array.isArray(parsed.quotes) || typeof parsed.fetchedAt !== 'number') return null;
    if (!allowStale && nowMs - parsed.fetchedAt > QUOTE_CACHE_TTL_MS) return null;
    const quotes = parsed.quotes
      .map((quote): DashboardQuote | null => {
        const text = normalizeQuoteText(quote?.text);
        const author = normalizeQuoteText(quote?.author) || 'Unknown';
        if (!text) return null;
        return {
          text,
          author,
          source: quote?.source === 'zenquotes' ? 'zenquotes' : 'local',
          sourceLabel: normalizeQuoteText(quote?.sourceLabel) || 'ZenQuotes',
        };
      })
      .filter((quote): quote is DashboardQuote => quote !== null);
    return quotes.length > 0 ? quotes : null;
  } catch {
    return null;
  }
};

const writeQuoteCache = (quotes: DashboardQuote[], nowMs: number) => {
  const storage = getStorage();
  if (!storage || quotes.length === 0) return;
  try {
    storage.setItem(QUOTE_CACHE_KEY, JSON.stringify({ fetchedAt: nowMs, quotes }));
  } catch {
    // Ignore quota/private mode failures; the widget can use in-memory data.
  }
};

export const getQuoteRefreshIntervalMinutes = (
  config: Pick<DashboardWidgetConfig, 'refreshIntervalMinutes'>,
): number => {
  const raw = Number(config.refreshIntervalMinutes ?? DEFAULT_QUOTE_REFRESH_MINUTES);
  const finite = Number.isFinite(raw) ? raw : DEFAULT_QUOTE_REFRESH_MINUTES;
  return Math.max(MIN_QUOTE_REFRESH_MINUTES, Math.round(finite));
};

export const getQuoteIndexForTime = (
  nowMs: number,
  intervalMinutes: number,
  quoteCount: number,
): number => {
  if (quoteCount <= 0) return 0;
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
  return Math.floor(nowMs / intervalMs) % quoteCount;
};

export const fetchQuoteBatch = async ({
  fetcher = fetch,
  signal,
  nowMs = Date.now(),
  source = 'zenquotes',
}: {
  fetcher?: QuoteFetch;
  signal?: AbortSignal;
  nowMs?: number;
  source?: DashboardQuoteSource;
} = {}): Promise<DashboardQuote[]> => {
  if (source === 'local') return LOCAL_QUOTES;

  const cachedQuotes = readQuoteCache(nowMs);
  if (cachedQuotes) return cachedQuotes;

  try {
    const response = await fetcher(buildQuoteProxyPath('/api/quotes'), {
      signal,
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Quote request failed with ${response.status}.`);
    }
    const payload = await response.json();
    const quotes = Array.isArray(payload)
      ? payload
          .map(normalizeZenQuote)
          .filter((quote): quote is DashboardQuote => quote !== null)
      : [];
    if (quotes.length > 0) {
      writeQuoteCache(quotes, nowMs);
      return quotes;
    }
  } catch {
    const staleQuotes = readQuoteCache(nowMs, true);
    if (staleQuotes) return staleQuotes;
  }

  return LOCAL_QUOTES;
};

export const resetQuoteServiceForTests = () => {
  getStorage()?.removeItem(QUOTE_CACHE_KEY);
};
