import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HealthWidget from './HealthWidget';
import type { DashboardWidget } from '../../../services/dashboardTypes';

const widgetSizeMock = vi.hoisted(() => ({
  current: {
    w: 2,
    h: 3,
    area: 6,
    sizeClass: 'medium',
    isWide: false,
    isTall: true,
    isCompact: true,
    pixelWidth: 300,
    pixelHeight: 330,
  },
}));

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: true,
    muted: 'text-muted',
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
    surfaceContainerLow: 'surface-low',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => widgetSizeMock.current,
}));

const widget: DashboardWidget = {
  id: 'activity-test',
  type: 'health',
  position: 0,
  size: 'medium',
  enabled: true,
  config: {},
};

describe('HealthWidget', () => {
  beforeEach(() => {
    widgetSizeMock.current = {
      w: 2,
      h: 3,
      area: 6,
      sizeClass: 'medium',
      isWide: false,
      isTall: true,
      isCompact: true,
      pixelWidth: 300,
      pixelHeight: 330,
    };
  });

  it('centers the day/week range selector in the widget body', () => {
    render(<HealthWidget widget={widget} />);

    expect(screen.getByTestId('activity-range-switch')).toHaveClass('self-center');
  });

  it('keeps activity metric values inside their cards in narrow resized widgets', () => {
    widgetSizeMock.current = {
      w: 2,
      h: 2,
      area: 4,
      sizeClass: 'small',
      isWide: false,
      isTall: false,
      isCompact: true,
      pixelWidth: 240,
      pixelHeight: 260,
    };

    const { container } = render(<HealthWidget widget={widget} />);

    expect(screen.getByTestId('activity-content')).toHaveClass('overflow-hidden');
    expect(container.querySelectorAll('.activity-primary-stat-card')).toHaveLength(2);
    container.querySelectorAll('.activity-primary-stat-card').forEach((card) => {
      expect(card).toHaveClass('min-w-0', 'overflow-hidden');
    });
    container.querySelectorAll('.activity-stat-value').forEach((value) => {
      expect(value).toHaveClass('truncate');
    });
    expect(container.querySelectorAll('.activity-compact-metric-value')).toHaveLength(0);
  });

  it('hides the range selector in the shortest activity frame so the numbers keep breathing room', () => {
    widgetSizeMock.current = {
      w: 2,
      h: 2,
      area: 4,
      sizeClass: 'small',
      isWide: false,
      isTall: false,
      isCompact: true,
      pixelWidth: 260,
      pixelHeight: 190,
    };

    render(<HealthWidget widget={widget} />);

    expect(screen.queryByTestId('activity-range-switch')).not.toBeInTheDocument();
  });
});
