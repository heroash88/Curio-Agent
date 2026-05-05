import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RobotFaceWidget } from './RobotFaceWidget';
import { DashboardWidgetActionSlotContext } from './WidgetShell';
import type { DashboardWidget } from '../../../services/dashboardTypes';

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
    pixelHeight: 300,
  }),
}));

const widget: DashboardWidget = {
  id: 'robot_test',
  type: 'robot_face',
  position: 0,
  size: 'large',
  enabled: true,
  config: { w: 3, h: 3 },
};

describe('RobotFaceWidget', () => {
  it('reveals the widget action dots on hover without leaving a hidden clickable layer', () => {
    const { container } = render(
      <DashboardWidgetActionSlotContext.Provider value={<button type="button">Robot controls</button>}>
        <RobotFaceWidget
          widget={widget}
          faceSlot={<div data-testid="robot-face-art">Robot face</div>}
        />
      </DashboardWidgetActionSlotContext.Provider>,
    );

    const actionSlot = screen.getByText(/Robot controls/i).parentElement;

    expect(container.querySelector('[data-widget-primitive="body"]')).toBeInTheDocument();
    expect(actionSlot).toHaveClass('dashboard-robot-action-slot');
    expect(actionSlot).toHaveClass('opacity-0', 'group-hover/robot-face:opacity-100');
    expect(actionSlot).toHaveClass('pointer-events-none', 'group-hover/robot-face:pointer-events-auto');
  });

  it('fits the unchanged Bender face inside a scaled dashboard canvas', () => {
    const { container } = render(
      <RobotFaceWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            robotFaceStyle: 'bender',
            robotShowGlow: true,
          },
        }}
        faceSlot={<div data-testid="robot-face-art">Bender face</div>}
      />,
    );

    const root = container.firstElementChild as HTMLElement;
    const faceFrame = screen.getByTestId('robot-face-art').parentElement;

    expect(root).toHaveAttribute('data-robot-face-style', 'bender');
    expect(root).toHaveClass('overflow-hidden');
    expect(root.querySelector('.dashboard-robot-glow')).toBeNull();
    expect(faceFrame).toHaveClass('dashboard-bender-face-frame', 'overflow-visible');
    expect(faceFrame).toHaveStyle({
      width: '760px',
      height: '560px',
      transformOrigin: 'center',
    });
    expect(faceFrame?.style.transform).toMatch(/^scale\(/);
  });
});
