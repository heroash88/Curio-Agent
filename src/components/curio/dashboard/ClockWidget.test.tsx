import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClockWidget from './ClockWidget';
import type { DashboardWidget } from '../../../services/dashboardTypes';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    headline: 'font-headline',
    muted: 'text-muted',
    onSurface: 'text-surface',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => ({
    w: 3,
    h: 3,
    area: 9,
    sizeClass: 'medium',
    isWide: true,
    isTall: true,
    isCompact: false,
    pixelWidth: 420,
    pixelHeight: 320,
  }),
}));

vi.mock('../../../hooks/useSyncedDashboardTime', () => ({
  useSyncedDashboardTime: () => new Date('2026-04-25T09:30:00'),
}));

vi.mock('../../../utils/settingsStorage', () => ({
  useClockShowSeconds: () => false,
  useClockUse24Hour: () => false,
}));

const widget: DashboardWidget = {
  id: 'clock-test',
  type: 'clock',
  position: 0,
  size: 'medium',
  enabled: true,
  config: { w: 3, h: 3 },
};

describe('ClockWidget', () => {
  it('uses shared body and text primitives for the digital clock surface', () => {
    const { container } = render(<ClockWidget widget={widget} />);

    expect(container.querySelector('[data-widget-primitive="body"]')).toBeInTheDocument();
    expect(container.querySelector('[data-widget-primitive="text"][data-variant="caption"]')).toHaveTextContent(
      'Saturday, April 25',
    );
    expect(screen.getByText('09:30')).toBeInTheDocument();
  });
});
