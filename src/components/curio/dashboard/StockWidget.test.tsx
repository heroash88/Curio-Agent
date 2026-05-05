import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import StockWidget from './StockWidget';

const stockServiceMock = vi.hoisted(() => ({
  DEFAULT_STOCK_SYMBOLS: 'AAPL,TSLA,BTC-USD',
  fetchStockQuote: vi.fn(),
  parseStockSymbols: vi.fn((value?: string | null) =>
    (value || 'AAPL,TSLA,BTC-USD')
      .split(',')
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean),
  ),
}));

vi.mock('../../../services/stockMarketService', () => stockServiceMock);

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    onSurface: 'text-slate-900',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => ({
    w: 3,
    h: 3,
    area: 9,
    sizeClass: 'large',
    isWide: true,
    isTall: true,
    isCompact: false,
    pixelWidth: 480,
    pixelHeight: 420,
  }),
}));

const buildWidget = (config: DashboardWidget['config'] = {}): DashboardWidget => ({
  id: 'stock-test',
  type: 'stock',
  position: 0,
  size: 'large',
  enabled: true,
  config: {
    symbols: 'AAPL,TSLA',
    ...config,
  },
});

describe('StockWidget', () => {
  beforeEach(() => {
    stockServiceMock.fetchStockQuote.mockReset();
    stockServiceMock.parseStockSymbols.mockClear();
    localStorage.clear();
    // Exercise the legacy non-quick-add path in these tests. The
    // InlineQuickAdd primitive has its own coverage.
    localStorage.setItem(
      'curio_dashboard_prefs',
      JSON.stringify({ interactivity: { inlineQuickAddEnabled: false } }),
    );
  });

  it('loads quotes through the stock market service', async () => {
    stockServiceMock.fetchStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      name: symbol === 'AAPL' ? 'Apple Inc.' : 'Tesla Inc.',
      price: symbol === 'AAPL' ? 189.12 : 241.5,
      change: symbol === 'AAPL' ? 2.22 : -1.5,
      changePercent: symbol === 'AAPL' ? 1.19 : -0.62,
      currency: 'USD',
    }));

    render(<StockWidget widget={buildWidget()} />);

    expect(await screen.findByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('TSLA')).toBeInTheDocument();
    expect(screen.getByText('$189.12')).toBeInTheDocument();
    expect(screen.getByTestId('stock-sparkline-AAPL')).toBeInTheDocument();
    expect(stockServiceMock.fetchStockQuote).toHaveBeenCalledWith('AAPL', expect.any(AbortSignal));
  });

  it('reloads quotes when the tracked symbols change', async () => {
    stockServiceMock.fetchStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      name: symbol === 'MSFT' ? 'Microsoft Corporation' : `${symbol} Inc.`,
      price: symbol === 'MSFT' ? 421.25 : 189.12,
      change: 1.2,
      changePercent: 0.3,
      currency: 'USD',
    }));

    const { rerender } = render(<StockWidget widget={buildWidget()} />);

    await waitFor(() => {
      expect(stockServiceMock.fetchStockQuote).toHaveBeenCalledWith('AAPL', expect.any(AbortSignal));
    });
    stockServiceMock.fetchStockQuote.mockClear();

    rerender(<StockWidget widget={buildWidget({ symbols: 'AAPL,TSLA,MSFT' })} />);

    await waitFor(() => {
      expect(stockServiceMock.fetchStockQuote).toHaveBeenCalledWith('MSFT', expect.any(AbortSignal));
    });
  });

  it('opens inline search from the widget search button', async () => {
    stockServiceMock.fetchStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      name: symbol === 'AAPL' ? 'Apple Inc.' : 'Tesla Inc.',
      price: symbol === 'AAPL' ? 189.12 : 241.5,
      change: 1.2,
      changePercent: 0.3,
      currency: 'USD',
    }));
    const onUpdateWidgetConfig = vi.fn();

    render(
      <StockWidget
        widget={buildWidget()}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    // Wait for stocks to load so the content area renders
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /search stocks/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /search stocks/i }));

    // The inline search input should now be visible
    await waitFor(() => {
      expect(screen.getByLabelText(/search stock symbol/i)).toBeInTheDocument();
    });
  });
});
