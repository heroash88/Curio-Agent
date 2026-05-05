import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QuickActionsWidget from './QuickActionsWidget';
import type { DashboardWidget } from '../../../services/dashboardTypes';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    onSurface: 'text-surface',
    surfaceContainerLow: 'surface-low',
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

const widget: DashboardWidget = {
  id: 'quick-actions-test',
  type: 'quick_actions',
  position: 0,
  size: 'medium',
  enabled: true,
  config: { w: 3, h: 3 },
};

describe('QuickActionsWidget', () => {
  it('uses shared body and text primitives while dispatching quick actions', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const { container } = render(<QuickActionsWidget widget={widget} />);

    expect(container.querySelector('[data-widget-primitive="body"]')).toBeInTheDocument();
    expect(container.querySelector('[data-widget-primitive="text"]')).toHaveTextContent('Weather');

    fireEvent.click(screen.getByRole('button', { name: 'Weather' }));

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'curio:quick-action',
        detail: { text: 'What is the weather?' },
      }),
    );

    dispatchSpy.mockRestore();
  });
});
