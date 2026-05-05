import { act } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import { resetFunFactServiceForTests } from '../../../services/funFactService';
import FunFactWidget from './FunFactWidget';

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
    h: 2,
    area: 6,
    pixelWidth: 420,
    pixelHeight: 260,
    sizeClass: 'large',
    isCompact: false,
    isTall: false,
    isWide: true,
  }),
}));

const widget: DashboardWidget = {
  id: 'fun-fact-test',
  type: 'fun_fact',
  position: 0,
  size: 'medium',
  enabled: true,
  config: {},
};

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 500) => ({
  ok,
  status,
  json: async () => body,
}) as Response;

describe('FunFactWidget', () => {
  beforeEach(() => {
    resetFunFactServiceForTests();
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({
          text: 'Remote fun fact number one arrives from the source.',
          permalink: 'https://uselessfacts.jsph.pl/fact/one',
        }))
        .mockResolvedValueOnce(jsonResponse({
          text: 'Remote fun fact number two arrives after an hour.',
          permalink: 'https://uselessfacts.jsph.pl/fact/two',
        })),
    );
  });

  afterEach(() => {
    resetFunFactServiceForTests();
    localStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('loads remote fun facts and refreshes them every hour by default', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T12:00:00Z'));

    render(<FunFactWidget widget={widget} />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/Remote fun fact number one/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/facts-proxy/api/v2/facts/random?language=en',
      expect.any(Object),
    );
    expect(screen.getByRole('link', { name: 'Useless Facts' })).toHaveAttribute(
      'href',
      'https://uselessfacts.jsph.pl/fact/one',
    );

    await act(async () => {
      vi.advanceTimersByTime(60 * 60 * 1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/Remote fun fact number two/i)).toBeInTheDocument();
  });

  it('uses cleaner typography without an inner bordered text panel', async () => {
    render(<FunFactWidget widget={widget} />);

    const text = await screen.findByText(/Remote fun fact number one/i);
    expect(text).toHaveClass('font-headline');
    expect(screen.getByTestId('fun-fact-content')).not.toHaveClass(
      'rounded-lg',
      'surface-container-low',
    );
  });
});
