import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GreetingWidget from './GreetingWidget';
import { DashboardWidgetActionSlotContext } from './WidgetShell';
import type { DashboardWidget } from '../../../services/dashboardTypes';

const widgetSizeMock = vi.hoisted(() => ({
  current: {
    w: 2,
    h: 1,
    area: 2,
    sizeClass: 'tiny',
    isWide: false,
    isTall: false,
    isCompact: true,
    pixelWidth: 220,
    pixelHeight: 130,
  },
}));

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    display: 'font-display',
    muted: 'text-muted',
    onSurface: 'text-surface',
  }),
}));

vi.mock('../../../hooks/useSyncedDashboardTime', () => ({
  useSyncedDashboardTime: () => new Date('2026-04-25T09:30:00'),
}));

vi.mock('../../../utils/settingsStorage', () => ({
  useUserName: () => 'Alexandria Longname',
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => widgetSizeMock.current,
}));

const widget: DashboardWidget = {
  id: 'greeting-test',
  type: 'greeting',
  position: 0,
  size: 'small',
  enabled: true,
  config: { w: 2, h: 1 },
};

describe('GreetingWidget', () => {
  it('uses a safe responsive text frame when resized tightly', () => {
    render(<GreetingWidget widget={widget} />);

    expect(screen.getByTestId('greeting-widget-body')).toHaveClass(
      'min-h-0',
      'overflow-hidden',
    );
    expect(screen.getByTestId('greeting-heading')).toHaveClass(
      'break-words',
      'tracking-normal',
    );
    expect(screen.getByTestId('greeting-heading').className).not.toContain('line-clamp');
  });

  it('keeps dashboard action dots visible on the welcome surface', () => {
    render(
      <DashboardWidgetActionSlotContext.Provider value={<button type="button">Widget controls</button>}>
        <GreetingWidget widget={widget} />
      </DashboardWidgetActionSlotContext.Provider>,
    );

    expect(screen.getByText('Widget controls').parentElement).toHaveClass('opacity-100');
    expect(screen.getByText('Widget controls').parentElement).not.toHaveClass('opacity-0');
  });
});
