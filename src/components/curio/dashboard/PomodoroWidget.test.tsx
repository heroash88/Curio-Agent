import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PomodoroWidget from './PomodoroWidget';
import type { DashboardWidget } from '../../../services/dashboardTypes';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: false,
    onSurface: 'text-slate-950',
    onSurfaceVariant: 'text-slate-600',
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
    pixelWidth: 420,
    pixelHeight: 420,
  }),
}));

const widget: DashboardWidget = {
  id: 'pomodoro_test',
  type: 'pomodoro',
  position: 0,
  size: 'large',
  enabled: true,
  config: {
    w: 3,
    h: 3,
  },
};

describe('PomodoroWidget', () => {
  it('uses the shared circular widget control for reset', () => {
    render(<PomodoroWidget widget={widget} />);

    expect(screen.getByRole('button', { name: 'Reset pomodoro' })).toHaveClass(
      'dashboard-widget-control-button',
    );
  });
});
