import type { DashboardWidgetConfig } from './dashboardTypes';

export type FunFactSource = 'uselessfacts' | 'local';

export interface DashboardFunFact {
  text: string;
  source: FunFactSource;
  sourceLabel: string;
  sourceUrl?: string;
  permalink?: string;
}

type FactFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface FactCachePayload {
  fetchedAt: number;
  fact: DashboardFunFact;
}

export const DEFAULT_FUN_FACT_REFRESH_MINUTES = 60;
export const MIN_FUN_FACT_REFRESH_MINUTES = 15;
export const FUN_FACT_CACHE_TTL_MS = DEFAULT_FUN_FACT_REFRESH_MINUTES * 60 * 1000;

const FACTS_PROXY_BASE = '/facts-proxy';
const FACT_CACHE_KEY = 'curio:fun-facts:uselessfacts-cache:v1';

export const LOCAL_FUN_FACTS: DashboardFunFact[] = [
  {
    text: 'Honey never spoils. Archaeologists have found 3,000-year-old honey in Egyptian tombs that was still edible.',
    source: 'local',
    sourceLabel: 'Curio facts',
  },
  {
    text: 'Octopuses have three hearts and blue blood.',
    source: 'local',
    sourceLabel: 'Curio facts',
  },
  {
    text: 'Bananas are berries, but strawberries are not.',
    source: 'local',
    sourceLabel: 'Curio facts',
  },
  {
    text: 'A day on Venus is longer than a year on Venus.',
    source: 'local',
    sourceLabel: 'Curio facts',
  },
  {
    text: 'The first computer programmer was Ada Lovelace, in the 1840s.',
    source: 'local',
    sourceLabel: 'Curio facts',
  },
  {
    text: 'The moon has moonquakes, similar to earthquakes on Earth.',
    source: 'local',
    sourceLabel: 'Curio facts',
  },
  {
    text: 'Scotland\'s national animal is the unicorn.',
    source: 'local',
    sourceLabel: 'Curio facts',
  },
  {
    text: 'A jiffy is an actual unit of time equal to 1/100th of a second.',
    source: 'local',
    sourceLabel: 'Curio facts',
  },
];

const getIngressPrefix = () => {
  if (typeof window === 'undefined') return '';
  const match = window.location.pathname.match(/^(\/api\/hassio_ingress\/[^/]+)/);
  return match?.[1] || '';
};

const buildFactProxyPath = (path: string) =>
  `${getIngressPrefix()}${FACTS_PROXY_BASE}${path}`;

const normalizeFactText = (value: unknown) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const normalizeRemoteFact = (value: unknown): DashboardFunFact | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const text = normalizeFactText(record.text);
  if (!text || text.length < 8) return null;
  const sourceUrl = normalizeFactText(record.source_url);
  const permalink = normalizeFactText(record.permalink);
  return {
    text,
    source: 'uselessfacts',
    sourceLabel: 'Useless Facts',
    sourceUrl: sourceUrl && isHttpUrl(sourceUrl) ? sourceUrl : undefined,
    permalink: permalink && isHttpUrl(permalink) ? permalink : undefined,
  };
};

const getStorage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

const normalizeCachedFact = (value: unknown): DashboardFunFact | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<DashboardFunFact>;
  const text = normalizeFactText(record.text);
  if (!text) return null;
  const sourceUrl = normalizeFactText(record.sourceUrl);
  const permalink = normalizeFactText(record.permalink);
  return {
    text,
    source: record.source === 'uselessfacts' ? 'uselessfacts' : 'local',
    sourceLabel: normalizeFactText(record.sourceLabel) || 'Useless Facts',
    sourceUrl: sourceUrl && isHttpUrl(sourceUrl) ? sourceUrl : undefined,
    permalink: permalink && isHttpUrl(permalink) ? permalink : undefined,
  };
};

const readFactCache = (nowMs: number, allowStale = false): DashboardFunFact | null => {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(FACT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FactCachePayload>;
    if (typeof parsed.fetchedAt !== 'number') return null;
    if (!allowStale && nowMs - parsed.fetchedAt >= FUN_FACT_CACHE_TTL_MS) return null;
    return normalizeCachedFact(parsed.fact);
  } catch {
    return null;
  }
};

const writeFactCache = (fact: DashboardFunFact, nowMs: number) => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(FACT_CACHE_KEY, JSON.stringify({ fetchedAt: nowMs, fact }));
  } catch {
    // Ignore quota/private mode failures; local fallback keeps the widget alive.
  }
};

const pickLocalFact = (nowMs: number) => {
  const index = Math.floor(nowMs / FUN_FACT_CACHE_TTL_MS) % LOCAL_FUN_FACTS.length;
  return LOCAL_FUN_FACTS[index] || LOCAL_FUN_FACTS[0];
};

export const getFunFactRefreshIntervalMinutes = (
  config: Pick<DashboardWidgetConfig, 'refreshIntervalMinutes'>,
): number => {
  const raw = Number(config.refreshIntervalMinutes ?? DEFAULT_FUN_FACT_REFRESH_MINUTES);
  const finite = Number.isFinite(raw) ? raw : DEFAULT_FUN_FACT_REFRESH_MINUTES;
  return Math.max(MIN_FUN_FACT_REFRESH_MINUTES, Math.round(finite));
};

export const fetchFunFact = async ({
  fetcher = fetch,
  signal,
  nowMs = Date.now(),
}: {
  fetcher?: FactFetch;
  signal?: AbortSignal;
  nowMs?: number;
} = {}): Promise<DashboardFunFact> => {
  const cachedFact = readFactCache(nowMs);
  if (cachedFact) return cachedFact;

  try {
    const response = await fetcher(
      buildFactProxyPath('/api/v2/facts/random?language=en'),
      {
        signal,
        headers: {
          Accept: 'application/json',
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Fun fact request failed with ${response.status}.`);
    }
    const fact = normalizeRemoteFact(await response.json());
    if (fact) {
      writeFactCache(fact, nowMs);
      return fact;
    }
  } catch {
    const staleFact = readFactCache(nowMs, true);
    if (staleFact) return staleFact;
  }

  return pickLocalFact(nowMs);
};

export const resetFunFactServiceForTests = () => {
  getStorage()?.removeItem(FACT_CACHE_KEY);
};
