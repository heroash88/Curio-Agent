import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import { resetQuoteServiceForTests } from '../../../services/quoteService';
import QuoteWidget from './QuoteWidget';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    headline: 'font-headline',
    muted: 'text-muted',
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
    surfaceContainer: 'surface-container',
    surfaceContainerLow: 'surface-container-low',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => ({
    w: 3,
    h: 3,
    area: 9,
    pixelWidth: 420,
    pixelHeight: 320,
    sizeClass: 'large',
    isCompact: false,
    isTall: false,
    isWide: true,
  }),
}));

const buildWidget = (
  config: Partial<DashboardWidget['config']> = {},
): DashboardWidget => ({
  id: 'quote-test',
  type: 'quote',
  position: 0,
  size: 'large',
  enabled: true,
  config,
});

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 500) => ({
  ok,
  status,
  json: async () => body,
}) as Response;

describe('QuoteWidget', () => {
  beforeEach(() => {
    resetQuoteServiceForTests();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse([
        { q: 'Remote quote one keeps the morning fresh.', a: 'Ada Lovelace' },
        { q: 'Remote quote two gives the user a choice.', a: 'Grace Hopper' },
      ])),
    );
  });

  afterEach(() => {
    resetQuoteServiceForTests();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('loads quotes from the remote source and defaults rotation to one hour', async () => {
    render(<QuoteWidget widget={buildWidget()} />);

    expect(await screen.findByText(/Remote quote (one|two)/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/quotes-proxy/api/quotes',
      expect.any(Object),
    );
    expect(screen.getByRole('link', { name: 'ZenQuotes' })).toHaveAttribute(
      'href',
      'https://zenquotes.io/',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open quote controls' }));

    expect(screen.getByRole('button', { name: 'Every 1 hour' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('lets the user select a loaded quote and change the rotation interval', async () => {
    const onUpdateWidgetConfig = vi.fn();
    render(
      <QuoteWidget
        widget={buildWidget()}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    await screen.findByText(/Remote quote (one|two)/i);

    fireEvent.click(screen.getByRole('button', { name: 'Open quote controls' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select quote: Remote quote two gives the user a choice.' }));

    expect(screen.getByText(/Remote quote two gives the user a choice/i)).toBeInTheDocument();
    expect(onUpdateWidgetConfig).toHaveBeenCalledWith('quote-test', {
      quoteSelectedIndex: 1,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open quote controls' }));
    fireEvent.click(screen.getByRole('button', { name: 'Every 2 hours' }));

    await waitFor(() => {
      expect(onUpdateWidgetConfig).toHaveBeenCalledWith('quote-test', {
        refreshIntervalMinutes: 120,
      });
    });
  });
});
