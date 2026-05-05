import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { searchStockSymbols } from '../../../services/stockMarketService';
import StockSymbolSettings from './StockSymbolSettings';

vi.mock('../../../services/stockMarketService', async (importActual) => {
  const actual = await importActual<typeof import('../../../services/stockMarketService')>();
  return {
    ...actual,
    searchStockSymbols: vi.fn(),
  };
});

const searchStockSymbolsMock = vi.mocked(searchStockSymbols);

describe('StockSymbolSettings', () => {
  beforeEach(() => {
    searchStockSymbolsMock.mockReset();
  });

  it('searches and adds a selected stock symbol', async () => {
    searchStockSymbolsMock.mockResolvedValue([
      {
        symbol: 'MSFT',
        name: 'Microsoft Corporation',
        exchange: 'NASDAQ',
        type: 'EQUITY',
      },
    ]);
    const onSymbolsChange = vi.fn();

    render(
      <StockSymbolSettings
        symbols="AAPL,TSLA"
        onSymbolsChange={onSymbolsChange}
        variant="light"
      />,
    );

    expect(screen.getByRole('button', { name: /search stock symbols/i })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: /search stocks/i }), {
      target: { value: 'Microsoft' },
    });

    await waitFor(() => {
      expect(searchStockSymbolsMock).toHaveBeenCalledWith('Microsoft', expect.any(AbortSignal));
    });

    fireEvent.click(await screen.findByRole('option', {
      name: /Microsoft Corporation MSFT NASDAQ/i,
    }));

    expect(onSymbolsChange).toHaveBeenCalledWith('AAPL,TSLA,MSFT');
  });

  it('removes a tracked stock symbol', () => {
    const onSymbolsChange = vi.fn();

    render(
      <StockSymbolSettings
        symbols="AAPL,TSLA"
        onSymbolsChange={onSymbolsChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /remove AAPL/i }));

    expect(onSymbolsChange).toHaveBeenCalledWith('TSLA');
  });
});
