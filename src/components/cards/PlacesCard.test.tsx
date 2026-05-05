import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PlacesCard from './PlacesCard';
import type { Card } from '../../services/cardTypes';

vi.mock('../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    faint: 'text-slate-500',
    panel: 'bg-black/[0.03]',
    muted: 'text-slate-500',
    btn: 'bg-black/[0.05]',
    panelBorder: 'border-black/[0.06]',
  }),
}));

const createCard = (data: Record<string, unknown>): Card => ({
  id: 'places-card',
  type: 'places',
  data,
  createdAt: Date.now(),
  autoDismissMs: 0,
  persistent: false,
  animationState: 'visible',
});

describe('PlacesCard', () => {
  it('renders local previews from place coordinates and keeps links clickable', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <PlacesCard
        card={createCard({
          query: 'coffee shops',
          centerMapUrl: 'https://maps.example/search',
          places: [
            {
              name: 'Coffee Shop',
              address: '123 Main St',
              location: { latitude: 47.6062, longitude: -122.3321 },
              mapsUrl: 'https://maps.example/coffee-shop',
            },
            {
              name: 'Second Cafe',
              address: '456 Pine St',
              location: { latitude: 47.6097, longitude: -122.3331 },
              mapsUrl: 'https://maps.example/second-cafe',
            },
          ],
        })}
        onDismiss={vi.fn()}
        onInteractionStart={vi.fn()}
        onInteractionEnd={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId('location-preview')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /view all on map/i })).toHaveAttribute(
      'href',
      'https://maps.example/search',
    );

    fireEvent.click(screen.getByText('Coffee Shop'));
    expect(openSpy).toHaveBeenCalledWith(
      'https://maps.example/coffee-shop',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('removes broken legacy place images instead of leaving a broken img in the card', () => {
    render(
      <PlacesCard
        card={createCard({
          query: 'coffee shops',
          places: [
            {
              name: 'Legacy Cafe',
              address: '123 Main St',
              staticMapUrl: 'https://example.com/legacy.png',
            },
          ],
        })}
        onDismiss={vi.fn()}
        onInteractionStart={vi.fn()}
        onInteractionEnd={vi.fn()}
      />,
    );

    const image = screen.getByRole('img', { name: /legacy cafe/i });
    fireEvent.error(image);

    expect(screen.queryByRole('img', { name: /legacy cafe/i })).not.toBeInTheDocument();
    expect(screen.getByText(/preview unavailable/i)).toBeInTheDocument();
  });
});
