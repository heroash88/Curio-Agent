import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import PortfolioWidget from './PortfolioWidget';

const stockServiceMock = vi.hoisted(() => ({
  fetchStockHistory: vi.fn(),
  fetchStockQuote: vi.fn(),
}));

vi.mock('../../../services/stockMarketService', async (importActual) => {
  const actual = await importActual<typeof import('../../../services/stockMarketService')>();
  return {
    ...actual,
    fetchStockHistory: stockServiceMock.fetchStockHistory,
    fetchStockQuote: stockServiceMock.fetchStockQuote,
  };
});

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    onSurface: 'text-slate-900',
  }),
}));

let mockWidgetSize = {
  w: 4,
  h: 4,
  area: 16,
  sizeClass: 'xlarge',
  isWide: true,
  isTall: true,
  isCompact: false,
  pixelWidth: 640,
  pixelHeight: 560,
};

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => mockWidgetSize,
}));

const buildWidget = (config: DashboardWidget['config'] = {}): DashboardWidget => ({
  id: 'portfolio-test',
  type: 'portfolio',
  position: 0,
  size: 'large',
  enabled: true,
  config: {
    portfolioHoldings: [
      { id: 'aapl', symbol: 'AAPL', shares: 4, name: 'Apple Inc.' },
      { id: 'tsla', symbol: 'TSLA', shares: 2, name: 'Tesla Inc.' },
    ],
    portfolioRange: '1d',
    ...config,
  },
});

describe('PortfolioWidget', () => {
  beforeEach(() => {
    mockWidgetSize = {
      w: 4,
      h: 4,
      area: 16,
      sizeClass: 'xlarge',
      isWide: true,
      isTall: true,
      isCompact: false,
      pixelWidth: 640,
      pixelHeight: 560,
    };
    stockServiceMock.fetchStockHistory.mockReset();
    stockServiceMock.fetchStockQuote.mockReset();
    stockServiceMock.fetchStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      name: symbol === 'AAPL' ? 'Apple Inc.' : 'Tesla Inc.',
      price: symbol === 'AAPL' ? 190 : 240,
      change: symbol === 'AAPL' ? 2 : -3,
      changePercent: symbol === 'AAPL' ? 1.06 : -1.23,
      currency: 'USD',
    }));
    stockServiceMock.fetchStockHistory.mockImplementation(async (symbol: string) => [
      {
        timestamp: 1000,
        close: symbol === 'AAPL' ? 185 : 242,
        currency: 'USD',
      },
      {
        timestamp: 2000,
        close: symbol === 'AAPL' ? 190 : 240,
        currency: 'USD',
      },
    ]);
  });

  it('renders total value, holdings, and one historical chart without duplicate sparklines', async () => {
    render(<PortfolioWidget widget={buildWidget()} />);

    expect(await screen.findByText('$1,240.00')).toBeInTheDocument();
    expect(screen.queryByLabelText(/live portfolio ticker/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/AAPL portfolio holding/i)).toHaveTextContent('AAPL');
    expect(screen.getByLabelText(/TSLA portfolio holding/i)).toHaveTextContent('TSLA');
    expect(screen.getByText('4 shares')).toBeInTheDocument();
    expect(screen.queryByTestId('portfolio-mini-sparkline')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText(/historical portfolio value chart/i)).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^Day$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^5Y$/i })).toBeInTheDocument();
  });

  it('toggles an individual holding between holding value and current share price', async () => {
    render(<PortfolioWidget widget={buildWidget()} />);

    const aaplHolding = await screen.findByLabelText(/AAPL portfolio holding/i);
    await waitFor(() => expect(aaplHolding).toHaveTextContent('$760.00'));
    expect(aaplHolding).not.toHaveTextContent('$190.00');

    fireEvent.click(aaplHolding);

    await waitFor(() => expect(aaplHolding).toHaveTextContent('$190.00'));
    expect(aaplHolding).not.toHaveTextContent('$760.00');

    fireEvent.click(aaplHolding);

    await waitFor(() => expect(aaplHolding).toHaveTextContent('$760.00'));
  });

  it('hides holding rows when the portfolio widget is compact but keeps the chart', async () => {
    mockWidgetSize = {
      w: 3,
      h: 2,
      area: 6,
      sizeClass: 'medium',
      isWide: true,
      isTall: false,
      isCompact: true,
      pixelWidth: 320,
      pixelHeight: 300,
    };

    render(<PortfolioWidget widget={buildWidget()} />);

    expect(await screen.findByText('$1,240.00')).toBeInTheDocument();
    const body = screen.getByTestId('portfolio-widget-body');
    expect(body).toHaveAttribute('data-widget-primitive', 'body');
    expect(body).toHaveClass('overflow-hidden');
    expect(body).not.toHaveClass('overflow-y-auto');
    expect(screen.getByTestId('portfolio-chart-card')).toHaveClass('flex-1', 'min-h-0', 'overflow-hidden');
    expect(screen.getByTestId('portfolio-range-controls')).toHaveClass('shrink-0');
    expect(screen.getByLabelText(/historical portfolio value chart/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/AAPL portfolio holding/i)).not.toBeInTheDocument();
  });

  it('hides the chart and holdings when the portfolio widget is very small', async () => {
    mockWidgetSize = {
      w: 2,
      h: 1,
      area: 2,
      sizeClass: 'tiny',
      isWide: true,
      isTall: false,
      isCompact: true,
      pixelWidth: 230,
      pixelHeight: 170,
    };

    render(<PortfolioWidget widget={buildWidget()} />);

    expect(await screen.findByText('$1,240.00')).toBeInTheDocument();
    expect(screen.getByText(/\+0\.16%/i)).toBeInTheDocument();
    expect(screen.queryByText(/\+\$16\.00/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Portfolio$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/historical portfolio value chart/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/AAPL portfolio holding/i)).not.toBeInTheDocument();
  });

  it('keeps the tiny portfolio focused on total value and percent movement only', async () => {
    mockWidgetSize = {
      w: 2,
      h: 1,
      area: 2,
      sizeClass: 'tiny',
      isWide: true,
      isTall: false,
      isCompact: true,
      pixelWidth: 230,
      pixelHeight: 150,
    };

    render(<PortfolioWidget widget={buildWidget()} />);

    expect(await screen.findByText('$1,240.00')).toBeInTheDocument();
    expect(screen.getByText(/\+0\.16%/i)).toBeInTheDocument();
    expect(screen.queryByText(/\+\$2\.00/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Today/i)).not.toBeInTheDocument();
  });

  it('renders a true 1x1 portfolio tile with fitted total value and movement', async () => {
    mockWidgetSize = {
      w: 1,
      h: 1,
      area: 1,
      sizeClass: 'tiny',
      isWide: false,
      isTall: false,
      isCompact: true,
      pixelWidth: 150,
      pixelHeight: 130,
    };

    render(<PortfolioWidget widget={buildWidget()} />);

    expect(await screen.findByText('$1,240.00')).toBeInTheDocument();
    const body = screen.getByTestId('portfolio-widget-body');
    expect(body).toHaveClass('items-center', 'justify-center', 'text-center');
    expect(screen.getByTestId('portfolio-total-value').querySelector('[data-widget-primitive="fit-text"]')).toBeInTheDocument();
    expect(screen.getByTestId('portfolio-compact-change')).toHaveTextContent('+0.16%');
    expect(screen.queryByLabelText(/historical portfolio value chart/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/AAPL portfolio holding/i)).not.toBeInTheDocument();
  });

  it('refreshes historical value when the user changes chart range', async () => {
    const onUpdateWidgetConfig = vi.fn();

    render(
      <PortfolioWidget
        widget={buildWidget()}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    await screen.findByText('$1,240.00');
    stockServiceMock.fetchStockHistory.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /^1Y$/i }));

    expect(onUpdateWidgetConfig).toHaveBeenCalledWith('portfolio-test', {
      portfolioRange: '1y',
    });
    await waitFor(() => {
      expect(stockServiceMock.fetchStockHistory).toHaveBeenCalledWith('AAPL', '1y', expect.any(AbortSignal));
    });
  });

  it('opens inline search from the widget search button', async () => {
    const onUpdateWidgetConfig = vi.fn();

    render(
      <PortfolioWidget
        widget={buildWidget()}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    // Wait for data to load so the search button renders
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add portfolio holding/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /add portfolio holding/i }));

    // The inline search input should now be visible
    await waitFor(() => {
      expect(screen.getByLabelText(/search stock to add to portfolio/i)).toBeInTheDocument();
    });
  });

  it('uses live quote movement when history is empty', async () => {
    stockServiceMock.fetchStockHistory.mockResolvedValue([]);

    render(<PortfolioWidget widget={buildWidget()} />);

    expect(await screen.findByText('$1,240.00')).toBeInTheDocument();
    expect(screen.getByLabelText(/historical portfolio value chart/i)).toBeInTheDocument();
    expect(screen.queryByText(/no history yet/i)).not.toBeInTheDocument();
    expect(screen.getByText(/\+\$2\.00/i)).toBeInTheDocument();
  });

  it('shows a range-specific estimate when selected history is unavailable', async () => {
    stockServiceMock.fetchStockHistory.mockResolvedValue([]);

    render(<PortfolioWidget widget={buildWidget()} />);

    expect(await screen.findByText('$1,240.00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^1Y$/i }));

    expect(await screen.findByText(/Estimated 1Y/i)).toBeInTheDocument();
    expect(screen.queryByText(/Today from quotes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+\$2\.00/i)).not.toBeInTheDocument();
  });

  it('uses complete aggregate history when stock candles are staggered', async () => {
    stockServiceMock.fetchStockHistory.mockImplementation(async (symbol: string) => {
      if (symbol === 'AAPL') {
        return [
          { timestamp: 1000, close: 185, currency: 'USD' },
          { timestamp: 3000, close: 190, currency: 'USD' },
        ];
      }
      return [
        { timestamp: 2000, close: 242, currency: 'USD' },
        { timestamp: 3000, close: 240, currency: 'USD' },
      ];
    });

    render(<PortfolioWidget widget={buildWidget()} />);

    expect(await screen.findByText('$1,240.00')).toBeInTheDocument();
    expect(screen.getByText(/\+\$16\.00/i)).toBeInTheDocument();
    expect(screen.queryByText(/\+\$500\.00/i)).not.toBeInTheDocument();
  });

  it('opens inline search from the empty holdings state', () => {
    const onUpdateWidgetConfig = vi.fn();

    render(
      <PortfolioWidget
        widget={buildWidget({ portfolioHoldings: [] })}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Add holding$/i }));

    // The inline search should open
    expect(screen.getByLabelText(/search stock to add to portfolio/i)).toBeInTheDocument();
  });
});
