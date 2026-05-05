import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { searchStockSymbols } from '../../../services/stockMarketService';
import PortfolioHoldingsSettings from './PortfolioHoldingsSettings';

vi.mock('../../../services/stockMarketService', async (importActual) => {
  const actual = await importActual<typeof import('../../../services/stockMarketService')>();
  return {
    ...actual,
    searchStockSymbols: vi.fn(),
  };
});

const searchStockSymbolsMock = vi.mocked(searchStockSymbols);

describe('PortfolioHoldingsSettings', () => {
  beforeEach(() => {
    searchStockSymbolsMock.mockReset();
  });

  it('searches and adds a holding with the selected share count', async () => {
    searchStockSymbolsMock.mockResolvedValue([
      {
        symbol: 'MSFT',
        name: 'Microsoft Corporation',
        exchange: 'NASDAQ',
        type: 'EQUITY',
      },
    ]);
    const onHoldingsChange = vi.fn();

    render(
      <PortfolioHoldingsSettings
        holdings={[{ id: 'aapl', symbol: 'AAPL', shares: 2, name: 'Apple Inc.' }]}
        onHoldingsChange={onHoldingsChange}
        variant="light"
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: /search portfolio stocks/i }), {
      target: { value: 'Microsoft' },
    });
    fireEvent.change(screen.getByLabelText(/shares to add/i), {
      target: { value: '3.5' },
    });

    await waitFor(() => {
      expect(searchStockSymbolsMock).toHaveBeenCalledWith('Microsoft', expect.any(AbortSignal));
    });

    fireEvent.click(await screen.findByRole('option', {
      name: /Microsoft Corporation MSFT NASDAQ/i,
    }));

    expect(onHoldingsChange).toHaveBeenCalledWith([
      { id: 'aapl', symbol: 'AAPL', shares: 2, name: 'Apple Inc.' },
      {
        id: 'portfolio-msft',
        symbol: 'MSFT',
        shares: 3.5,
        name: 'Microsoft Corporation',
      },
    ]);
  });

  it('updates and removes holding share counts', () => {
    const onHoldingsChange = vi.fn();

    render(
      <PortfolioHoldingsSettings
        holdings={[{ id: 'aapl', symbol: 'AAPL', shares: 2, name: 'Apple Inc.' }]}
        onHoldingsChange={onHoldingsChange}
      />,
    );

    fireEvent.change(screen.getByLabelText(/shares for AAPL/i), {
      target: { value: '4.25' },
    });
    fireEvent.blur(screen.getByLabelText(/shares for AAPL/i));

    expect(onHoldingsChange).toHaveBeenCalledWith([
      { id: 'aapl', symbol: 'AAPL', shares: 4.25, name: 'Apple Inc.' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: /remove AAPL/i }));

    expect(onHoldingsChange).toHaveBeenLastCalledWith([]);
  });
});
