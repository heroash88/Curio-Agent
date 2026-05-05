import {
  parseStockSymbols,
  type StockHistoryPoint,
  type StockHistoryRange,
  type StockQuote,
} from './stockMarketService';

export type PortfolioRange = StockHistoryRange;

export interface PortfolioHolding {
  id: string;
  symbol: string;
  shares: number;
  name?: string;
}

export interface PortfolioPosition {
  id: string;
  symbol: string;
  name?: string;
  shares: number;
  quote?: StockQuote;
  value: number;
  dailyGain: number;
  dailyGainPercent: number;
}

export interface PortfolioSnapshot {
  totalValue: number;
  dailyGain: number;
  dailyGainPercent: number;
  currency: string;
  positions: PortfolioPosition[];
}

export interface PortfolioHistoryPoint {
  timestamp: number;
  value: number;
}

export const PORTFOLIO_RANGES: Array<{
  id: PortfolioRange;
  label: string;
}> = [
  { id: '1d', label: 'Day' },
  { id: '1w', label: 'W' },
  { id: '1m', label: 'M' },
  { id: '3m', label: '3M' },
  { id: 'ytd', label: 'YTD' },
  { id: '1y', label: '1Y' },
  { id: '5y', label: '5Y' },
];

const PORTFOLIO_DAY_MS = 24 * 60 * 60 * 1000;
const ESTIMATED_PORTFOLIO_RANGE_DAYS: Record<
  Exclude<PortfolioRange, 'ytd'>,
  number
> = {
  '1d': 1,
  '1w': 7,
  '1m': 30,
  '3m': 90,
  '1y': 365,
  '5y': 365 * 5,
};

const ESTIMATED_PORTFOLIO_MIDPOINT_RATIO: Record<
  Exclude<PortfolioRange, '1d'>,
  number
> = {
  '1w': 0.44,
  '1m': 0.58,
  '3m': 0.48,
  ytd: 0.62,
  '1y': 0.54,
  '5y': 0.68,
};

const normalizePortfolioSymbol = (symbol: string) =>
  parseStockSymbols(symbol)[0] || '';

const normalizeShareCount = (shares: unknown) => {
  const numericShares = Number(shares);
  if (!Number.isFinite(numericShares) || numericShares <= 0) return 0;
  return Number(numericShares.toFixed(6));
};

const buildHoldingId = (symbol: string) =>
  `portfolio-${symbol.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`;

export const normalizePortfolioHoldings = (
  holdings: unknown,
): PortfolioHolding[] => {
  if (!Array.isArray(holdings)) return [];

  const bySymbol = new Map<string, PortfolioHolding>();
  holdings.forEach((holding) => {
    if (!holding || typeof holding !== 'object') return;
    const source = holding as Partial<PortfolioHolding>;
    const symbol = normalizePortfolioSymbol(String(source.symbol || ''));
    const shares = normalizeShareCount(source.shares);
    if (!symbol || shares <= 0) return;

    const existing = bySymbol.get(symbol);
    if (existing) {
      bySymbol.set(symbol, {
        ...existing,
        shares: Number((existing.shares + shares).toFixed(6)),
        name: existing.name || source.name,
      });
      return;
    }

    bySymbol.set(symbol, {
      id: source.id || buildHoldingId(symbol),
      symbol,
      shares,
      name: source.name,
    });
  });

  return [...bySymbol.values()];
};

export const upsertPortfolioHolding = (
  holdings: unknown,
  nextHolding: Pick<PortfolioHolding, 'symbol' | 'shares'> & Partial<PortfolioHolding>,
): PortfolioHolding[] => {
  const normalizedHoldings = normalizePortfolioHoldings(holdings);
  const symbol = normalizePortfolioSymbol(nextHolding.symbol);
  const shares = normalizeShareCount(nextHolding.shares);
  if (!symbol || shares <= 0) return normalizedHoldings;

  const existing = normalizedHoldings.find((holding) => holding.symbol === symbol);
  const nextNormalizedHolding: PortfolioHolding = {
    id: existing?.id || nextHolding.id || buildHoldingId(symbol),
    symbol,
    shares,
    name: nextHolding.name || existing?.name,
  };

  if (existing) {
    return normalizedHoldings.map((holding) =>
      holding.symbol === symbol ? nextNormalizedHolding : holding,
    );
  }

  return [...normalizedHoldings, nextNormalizedHolding];
};

export const removePortfolioHolding = (
  holdings: unknown,
  symbol: string,
): PortfolioHolding[] => {
  const normalizedSymbol = normalizePortfolioSymbol(symbol);
  if (!normalizedSymbol) return normalizePortfolioHoldings(holdings);
  return normalizePortfolioHoldings(holdings)
    .filter((holding) => holding.symbol !== normalizedSymbol);
};

export const buildPortfolioSnapshot = (
  holdings: unknown,
  quotes: StockQuote[],
): PortfolioSnapshot => {
  const normalizedHoldings = normalizePortfolioHoldings(holdings);
  const quoteBySymbol = new Map(
    quotes.map((quote) => [normalizePortfolioSymbol(quote.symbol), quote]),
  );

  const positions = normalizedHoldings.map((holding): PortfolioPosition => {
    const quote = quoteBySymbol.get(holding.symbol);
    const value = quote ? quote.price * holding.shares : 0;
    const dailyGain = quote ? quote.change * holding.shares : 0;
    const previousValue = value - dailyGain;
    const dailyGainPercent = previousValue > 0
      ? (dailyGain / previousValue) * 100
      : 0;

    return {
      id: holding.id,
      symbol: holding.symbol,
      name: holding.name || quote?.name,
      shares: holding.shares,
      quote,
      value,
      dailyGain,
      dailyGainPercent,
    };
  });

  const totalValue = positions.reduce((sum, position) => sum + position.value, 0);
  const dailyGain = positions.reduce((sum, position) => sum + position.dailyGain, 0);
  const previousTotalValue = totalValue - dailyGain;
  const dailyGainPercent = previousTotalValue > 0
    ? (dailyGain / previousTotalValue) * 100
    : 0;
  const currency = positions.find((position) => position.quote?.currency)?.quote?.currency || 'USD';

  return {
    totalValue,
    dailyGain,
    dailyGainPercent,
    currency,
    positions,
  };
};

export const buildPortfolioHistory = (
  holdings: unknown,
  historyBySymbol: Record<string, StockHistoryPoint[]>,
): PortfolioHistoryPoint[] => {
  const normalizedHoldings = normalizePortfolioHoldings(holdings);
  if (normalizedHoldings.length === 0) return [];

  const histories = normalizedHoldings.map((holding) => {
    const points = (historyBySymbol[holding.symbol] || [])
      .filter((point) =>
        Number.isFinite(point.timestamp) && Number.isFinite(point.close),
      )
      .sort((left, right) => left.timestamp - right.timestamp);
    return { holding, points };
  });

  if (histories.some(({ points }) => points.length === 0)) {
    return [];
  }

  const timeline = [...new Set(
    histories.flatMap(({ points }) => points.map((point) => point.timestamp)),
  )].sort((left, right) => left - right);
  const indexes = histories.map(() => 0);
  const lastCloseByHistory = histories.map(() => Number.NaN);
  const portfolioHistory: PortfolioHistoryPoint[] = [];

  timeline.forEach((timestamp) => {
    histories.forEach(({ points }, historyIndex) => {
      while (
        indexes[historyIndex] < points.length
        && points[indexes[historyIndex]].timestamp <= timestamp
      ) {
        lastCloseByHistory[historyIndex] = points[indexes[historyIndex]].close;
        indexes[historyIndex] += 1;
      }
    });

    if (lastCloseByHistory.some((close) => !Number.isFinite(close))) {
      return;
    }

    const value = histories.reduce((total, { holding }, historyIndex) =>
      total + lastCloseByHistory[historyIndex] * holding.shares, 0);
    portfolioHistory.push({ timestamp, value });
  });

  return portfolioHistory;
};

export const buildTodayPortfolioHistory = (
  snapshot: PortfolioSnapshot,
  now = Date.now(),
): PortfolioHistoryPoint[] => {
  if (!Number.isFinite(snapshot.totalValue) || snapshot.totalValue <= 0) {
    return [];
  }

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const openingValue = Math.max(0, snapshot.totalValue - snapshot.dailyGain);

  return [
    {
      timestamp: startOfToday.getTime(),
      value: openingValue,
    },
    {
      timestamp: now,
      value: snapshot.totalValue,
    },
  ];
};

const clampEstimatedPortfolioPercent = (value: number) =>
  Math.min(0.8, Math.max(-0.6, value));

const getEstimatedRangeStartTime = (range: PortfolioRange, now: number) => {
  if (range === 'ytd') {
    const date = new Date(now);
    return Date.UTC(date.getUTCFullYear(), 0, 1);
  }

  return now - ESTIMATED_PORTFOLIO_RANGE_DAYS[range] * PORTFOLIO_DAY_MS;
};

export const buildEstimatedPortfolioRangeHistory = (
  snapshot: PortfolioSnapshot,
  range: PortfolioRange,
  now = Date.now(),
): PortfolioHistoryPoint[] => {
  if (range === '1d') {
    return buildTodayPortfolioHistory(snapshot, now);
  }

  if (!Number.isFinite(snapshot.totalValue) || snapshot.totalValue <= 0) {
    return [];
  }

  const startTime = getEstimatedRangeStartTime(range, now);
  const durationMs = Math.max(PORTFOLIO_DAY_MS, now - startTime);
  const durationDays = Math.max(1, durationMs / PORTFOLIO_DAY_MS);
  const dailyPercent = Number.isFinite(snapshot.dailyGainPercent)
    ? snapshot.dailyGainPercent / 100
    : 0;
  const estimatedRangePercent = clampEstimatedPortfolioPercent(
    dailyPercent * Math.sqrt(durationDays),
  );
  const baselineDivisor = Math.max(0.05, 1 + estimatedRangePercent);
  const baselineValue = Math.max(0, snapshot.totalValue / baselineDivisor);
  const valueMove = snapshot.totalValue - baselineValue;
  const midpointTime = Math.round(startTime + durationMs * 0.56);
  const midpointValue = Math.max(
    0,
    baselineValue + valueMove * ESTIMATED_PORTFOLIO_MIDPOINT_RATIO[range],
  );

  return [
    {
      timestamp: startTime,
      value: baselineValue,
    },
    {
      timestamp: midpointTime,
      value: midpointValue,
    },
    {
      timestamp: now,
      value: snapshot.totalValue,
    },
  ];
};

export function buildPortfolioChartHistory(
  history: PortfolioHistoryPoint[],
  snapshot: PortfolioSnapshot,
  now?: number,
): PortfolioHistoryPoint[];
export function buildPortfolioChartHistory(
  history: PortfolioHistoryPoint[],
  snapshot: PortfolioSnapshot,
  range: PortfolioRange,
  now?: number,
): PortfolioHistoryPoint[];
export function buildPortfolioChartHistory(
  history: PortfolioHistoryPoint[],
  snapshot: PortfolioSnapshot,
  rangeOrNow: PortfolioRange | number = '1d',
  maybeNow?: number,
): PortfolioHistoryPoint[] {
  const range = typeof rangeOrNow === 'string' ? rangeOrNow : '1d';
  const now = typeof rangeOrNow === 'number'
    ? rangeOrNow
    : maybeNow ?? Date.now();
  const sortedHistory = history
    .filter((point) =>
      Number.isFinite(point.timestamp) && Number.isFinite(point.value),
    )
    .sort((left, right) => left.timestamp - right.timestamp);

  if (!Number.isFinite(snapshot.totalValue) || snapshot.totalValue <= 0) {
    return sortedHistory;
  }

  if (sortedHistory.length === 0) {
    return buildEstimatedPortfolioRangeHistory(snapshot, range, now);
  }

  const lastPoint = sortedHistory[sortedHistory.length - 1];
  const currentPoint = {
    timestamp: Math.max(now, lastPoint.timestamp),
    value: snapshot.totalValue,
  };

  if (currentPoint.timestamp === lastPoint.timestamp) {
    return [...sortedHistory.slice(0, -1), currentPoint];
  }

  return [...sortedHistory, currentPoint];
}

export const calculatePortfolioPeriodChange = (
  currentValue: number,
  history: PortfolioHistoryPoint[],
) => {
  const baseline = history.find((point) => point.value > 0)?.value;
  if (!baseline) {
    return {
      value: 0,
      percent: 0,
    };
  }

  const value = currentValue - baseline;
  return {
    value,
    percent: (value / baseline) * 100,
  };
};
