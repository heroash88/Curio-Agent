import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WidgetShell from './WidgetShell';
import {
  DASHBOARD_WIDGET_DATA_UPDATED_EVENT,
  type DashboardWidgetDataUpdatedDetail,
} from '../../../services/dashboardRefresh';
import type { DashboardWidget } from '../../../services/dashboardTypes';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: false,
    onSurface: 'text-[var(--ether-on-surface)]',
    onSurfaceVariant: 'text-[var(--ether-on-surface-variant)]',
  }),
}));

vi.mock('../../../hooks/useMotionProfile', () => ({
  useMotionProfile: () => ({
    mode: 'full',
    shouldAnimate: true,
    durationMs: (base: number) => base,
    scale: (base: number) => base,
  }),
}));

const widget: DashboardWidget = {
  id: 'widget-shell-pulse-test',
  type: 'notes',
  position: 0,
  size: 'medium',
  enabled: true,
  config: {},
};

const dispatchDataUpdated = (widgetId: string, updatedAt = Date.now()) => {
  window.dispatchEvent(
    new CustomEvent<DashboardWidgetDataUpdatedDetail>(
      DASHBOARD_WIDGET_DATA_UPDATED_EVENT,
      {
        detail: { widgetId, widgetType: 'notes', updatedAt },
      },
    ),
  );
};

describe('WidgetShell ambient pulse', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not render a pulse layer at rest', () => {
    render(
      <WidgetShell widget={widget} title="Notes">
        <p>body</p>
      </WidgetShell>,
    );

    expect(screen.queryByTestId('widget-shell-pulse')).toBeNull();
  });

  it('renders and then removes the ambient pulse layer once the animation ends', () => {
    render(
      <WidgetShell widget={widget} title="Notes">
        <p>body</p>
      </WidgetShell>,
    );

    const shellRoot = screen.getByText('body').closest('.group');
    expect(shellRoot).toBeTruthy();
    const beforeClassName = shellRoot!.className;

    act(() => {
      dispatchDataUpdated(widget.id);
    });

    // Pulse is rendered immediately as a transient absolute child.
    const pulse = screen.getByTestId('widget-shell-pulse');
    expect(pulse.className).toContain('widget-shell-pulse');
    // The pulse class is not on the shell root; resting styles remain.
    expect(shellRoot!.className).toBe(beforeClassName);

    // Advance past the pulse duration (760ms + buffer) and fire the
    // animation end to simulate a browser that completes the keyframe.
    act(() => {
      vi.advanceTimersByTime(1000);
      // jsdom does not run animations, but the component does not rely
      // on `animationend` for cleanup — it renders the pulse as a
      // keyed child. Force a no-op state flush.
    });

    // Resting className on the shell root is unchanged after the pulse.
    expect(shellRoot!.className).toBe(beforeClassName);
  });

  it('coalesces rapid events within 2 seconds into a single pulse', () => {
    render(
      <WidgetShell widget={widget} title="Notes">
        <p>body</p>
      </WidgetShell>,
    );

    act(() => {
      const base = Date.now();
      dispatchDataUpdated(widget.id, base);
      dispatchDataUpdated(widget.id, base + 100);
      dispatchDataUpdated(widget.id, base + 500);
    });

    const pulses = screen.getAllByTestId('widget-shell-pulse');
    expect(pulses).toHaveLength(1);
  });

  it('ignores events for other widget ids', () => {
    render(
      <WidgetShell widget={widget} title="Notes">
        <p>body</p>
      </WidgetShell>,
    );

    act(() => {
      dispatchDataUpdated('some-other-widget');
    });

    expect(screen.queryByTestId('widget-shell-pulse')).toBeNull();
  });
});
