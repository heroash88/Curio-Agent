import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MapCard from './MapCard';
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
  id: 'map-card',
  type: 'map',
  data,
  createdAt: Date.now(),
  autoDismissMs: 0,
  persistent: false,
  animationState: 'visible',
});

describe('MapCard', () => {
  it('renders an SVG route preview when encodedPolyline is present', () => {
    render(
      <MapCard
        card={createCard({
          destination: 'Downtown Seattle',
          origin: 'Current Location',
          travelMode: 'driving',
          distance: '10.5 mi',
          duration: '21 min',
          encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
          mapUrl: 'https://maps.example/route',
        })}
        onDismiss={vi.fn()}
        onInteractionStart={vi.fn()}
        onInteractionEnd={vi.fn()}
      />,
    );

    expect(screen.getByTestId('directions-preview')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open in maps/i })).toHaveAttribute(
      'href',
      'https://maps.example/route',
    );
  });

  it('replaces failed legacy map images with a clean fallback state', () => {
    render(
      <MapCard
        card={createCard({
          destination: 'Legacy Destination',
          travelMode: 'driving',
          staticMapUrl: 'https://example.com/map.png',
        })}
        onDismiss={vi.fn()}
        onInteractionStart={vi.fn()}
        onInteractionEnd={vi.fn()}
      />,
    );

    const image = screen.getByRole('img', { name: /map to legacy destination/i });
    fireEvent.error(image);

    expect(screen.queryByRole('img', { name: /map to legacy destination/i })).not.toBeInTheDocument();
    expect(screen.getByText(/preview unavailable/i)).toBeInTheDocument();
  });
});
