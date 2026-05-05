import { describe, expect, it } from 'vitest';

import type { StockHistoryPoint, StockQuote } from './stockMarketService';
import {
  PORTFOLIO_RANGES,
  buildPortfolioChartHistory,
  buildPortfolioHistory,
  buildPortfolioSnapshot,
  buildTodayPortfolioHistory,
  calculatePortfolioPeriodChange,
  normalizePortfolioHoldings,
  removePortfolioHolding,
  upsertPortfolioHolding,
} from './portfolioTrackerService';

describe('portfolioTrackerService', () => {
  it('normalizes, adds, updates, and removes portfolio holdings', () => {
    const normalized = normalizePortfolioHoldings([
      { id: 'one', symbol: ' aapl ', shares: 1.5, name: 'Apple Inc.' },
      { id: 'two', symbol: 'AAPL', shares: 0.5 },
      { id: 'bad', symbol: '', shares: 10 },
      { id: 'zero', symbol: 'TSLA', shares: 0 },
    ]);

    expect(normalized).toEqual([
      {
        id: 'one',
        symbol: 'AAPL',
        shares: 2,
        name: 'Apple Inc.',
      },
    ]);

    expect(upsertPortfolioHolding(normalized, {
      symbol: 'msft',
      shares: 3,
      name: 'Microsoft Corporation',
    })).toEqual([
      {
        id: 'one',
        symbol: 'AAPL',
        shares: 2,
        name: 'Apple Inc.',
      },
      {
        id: 'portfolio-msft',
        symbol: 'MSFT',
        shares: 3,
        name: 'Microsoft Corporation',
      },
    ]);

    expect(upsertPortfolioHolding(normalized, {
      symbol: 'aapl',
      shares: 4,
    })).toEqual([
      {
        id: 'one',
        symbol: 'AAPL',
        shares: 4,
        name: 'Apple Inc.',
      },
    ]);

    expect(removePortfolioHolding(normalized, 'aapl')).toEqual([]);
  });

  it('builds a current portfolio snapshot from live quotes', () => {
    const quotes: StockQuote[] = [
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        price: 190,
        change: 2,
        changePercent: 1.06,
        currency: 'USD',
      },
      {
        symbol: 'TSLA',
        name: 'Tesla Inc.',
        price: 240,
        change: -3,
        changePercent: -1.23,
        currency: 'USD',
      },
    ];

    const snapshot = buildPortfolioSnapshot([
      { id: 'aapl', symbol: 'AAPL', shares: 4 },
      { id: 'tsla', symbol: 'TSLA', shares: 2 },
    ], quotes);

    expect(snapshot.totalValue).toBe(1240);
    expect(snapshot.dailyGain).toBe(2);
    expect(snapshot.dailyGainPercent).toBeCloseTo(0.1616, 4);
    expect(snapshot.positions).toMatchObject([
      {
        symbol: 'AAPL',
        shares: 4,
        value: 760,
        dailyGain: 8,
      },
      {
        symbol: 'TSLA',
        shares: 2,
        value: 480,
        dailyGain: -6,
      },
    ]);
  });

  it('aggregates historical stock prices into portfolio value points', () => {
    const historyBySymbol: Record<string, StockHistoryPoint[]> = {
      AAPL: [
        { timestamp: 1000, close: 100, currency: 'USD' },
        { timestamp: 2000, close: 110, currency: 'USD' },
      ],
      TSLA: [
        { timestamp: 1000, close: 200, currency: 'USD' },
        { timestamp: 2000, close: 190, currency: 'USD' },
      ],
    };

    const history = buildPortfolioHistory([
      { id: 'aapl', symbol: 'AAPL', shares: 2 },
      { id: 'tsla', symbol: 'TSLA', shares: 1 },
    ], historyBySymbol);

    expect(history).toEqual([
      { timestamp: 1000, value: 400 },
      { timestamp: 2000, value: 410 },
    ]);
    expect(calculatePortfolioPeriodChange(430, history)).toEqual({
      value: 30,
      percent: 7.5,
    });
  });

  it('forward-fills staggered stock histories without partial portfolio values', () => {
    const historyBySymbol: Record<string, StockHistoryPoint[]> = {
      AAPL: [
        { timestamp: 1000, close: 100, currency: 'USD' },
        { timestamp: 3000, close: 120, currency: 'USD' },
      ],
      TSLA: [
        { timestamp: 2000, close: 200, currency: 'USD' },
        { timestamp: 3000, close: 190, currency: 'USD' },
      ],
    };

    const history = buildPortfolioHistory([
      { id: 'aapl', symbol: 'AAPL', shares: 2 },
      { id: 'tsla', symbol: 'TSLA', shares: 1 },
    ], historyBySymbol);

    expect(history).toEqual([
      { timestamp: 2000, value: 400 },
      { timestamp: 3000, value: 430 },
    ]);
  });

  it('does not build partial portfolio history when a holding has no prices', () => {
    const history = buildPortfolioHistory([
      { id: 'aapl', symbol: 'AAPL', shares: 2 },
      { id: 'tsla', symbol: 'TSLA', shares: 1 },
    ], {
      AAPL: [
        { timestamp: 1000, close: 100, currency: 'USD' },
        { timestamp: 2000, close: 110, currency: 'USD' },
      ],
    });

    expect(history).toEqual([]);
  });

  it('extends historical portfolio values to the current live total', () => {
    const snapshot = buildPortfolioSnapshot([
      { id: 'aapl', symbol: 'AAPL', shares: 2 },
      { id: 'tsla', symbol: 'TSLA', shares: 1 },
    ], [
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        price: 125,
        change: 5,
        changePercent: 4.17,
        currency: 'USD',
      },
      {
        symbol: 'TSLA',
        name: 'Tesla Inc.',
        price: 210,
        change: 20,
        changePercent: 10.53,
        currency: 'USD',
      },
    ]);

    expect(buildPortfolioChartHistory([
      { timestamp: 1000, value: 400 },
      { timestamp: 2000, value: 430 },
    ], snapshot, 3000)).toEqual([
      { timestamp: 1000, value: 400 },
      { timestamp: 2000, value: 430 },
      { timestamp: 3000, value: 460 },
    ]);
  });

  it('builds a today history fallback from live quote movement', () => {
    const quotes: StockQuote[] = [
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        price: 190,
        change: 2,
        changePercent: 1.06,
        currency: 'USD',
      },
      {
        symbol: 'TSLA',
        name: 'Tesla Inc.',
        price: 240,
        change: -3,
        changePercent: -1.23,
        currency: 'USD',
      },
    ];
    const now = new Date(2026, 3, 27, 11, 30).getTime();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const snapshot = buildPortfolioSnapshot([
      { id: 'aapl', symbol: 'AAPL', shares: 4 },
      { id: 'tsla', symbol: 'TSLA', shares: 2 },
    ], quotes);

    expect(buildTodayPortfolioHistory(snapshot, now)).toEqual([
      { timestamp: startOfToday.getTime(), value: 1238 },
      { timestamp: now, value: 1240 },
    ]);
  });

  it('builds range-aware chart fallbacks when market history is unavailable', () => {
    const now = Date.UTC(2026, 3, 27, 16, 30);
    const snapshot = buildPortfolioSnapshot([
      { id: 'aapl', symbol: 'AAPL', shares: 4 },
      { id: 'tsla', symbol: 'TSLA', shares: 2 },
    ], [
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        price: 190,
        change: 2,
        changePercent: 1.06,
        currency: 'USD',
      },
      {
        symbol: 'TSLA',
        name: 'Tesla Inc.',
        price: 240,
        change: -3,
        changePercent: -1.23,
        currency: 'USD',
      },
    ]);

    const dayFallback = buildPortfolioChartHistory([], snapshot, '1d', now);
    const monthFallback = buildPortfolioChartHistory([], snapshot, '1m', now);
    const yearFallback = buildPortfolioChartHistory([], snapshot, '1y', now);

    expect(dayFallback).toHaveLength(2);
    expect(monthFallback).toHaveLength(3);
    expect(yearFallback).toHaveLength(3);
    expect(monthFallback[0].timestamp).toBe(now - 30 * 24 * 60 * 60 * 1000);
    expect(yearFallback[0].timestamp).toBe(now - 365 * 24 * 60 * 60 * 1000);
    expect(monthFallback[0].value).not.toBe(dayFallback[0].value);
    expect(yearFallback[0].value).not.toBe(monthFallback[0].value);
    expect(calculatePortfolioPeriodChange(snapshot.totalValue, yearFallback).value)
      .not.toBe(snapshot.dailyGain);
  });

  it('defines the Robinhood-style portfolio chart ranges', () => {
    expect(PORTFOLIO_RANGES.map((range) => range.label)).toEqual([
      'Day',
      'W',
      'M',
      '3M',
      'YTD',
      '1Y',
      '5Y',
    ]);
  });
});
