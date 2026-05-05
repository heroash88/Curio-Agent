import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import WidgetShell, {
  DashboardWidgetEditModeContext,
  DashboardWidgetGlowContext,
} from './WidgetShell';
import type { DashboardWidget } from '../../../services/dashboardTypes';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: false,
    onSurface: 'text-[var(--ether-on-surface)]',
    onSurfaceVariant: 'text-[var(--ether-on-surface-variant)]',
  }),
}));

const widget: DashboardWidget = {
  id: 'widget-shell-test',
  type: 'notes',
  position: 0,
  size: 'medium',
  enabled: true,
  config: {},
};

describe('WidgetShell', () => {
  it('sets a dashboard text token so unstyled widget body text remains visible in light mode', () => {
    render(
      <WidgetShell widget={widget} title="Notes">
        <p>Inherited text</p>
      </WidgetShell>,
    );

    const shell = screen.getByText('Inherited text').closest('.group');

    expect(shell).toHaveClass('text-[var(--ether-on-surface)]');
  });

  it('applies the saved widget accent override as local accent tokens', () => {
    render(
      <WidgetShell
        widget={{
          ...widget,
          config: {
            accentOverride: 'rgba(16,185,129,0.2)',
          },
        }}
        title="Notes"
      >
        <p>Accent text</p>
      </WidgetShell>,
    );

    const shell = screen.getByText('Accent text').closest('.group');

    expect(shell).toHaveStyle({
      '--dashboard-widget-accent': 'rgb(16, 185, 129)',
      '--ether-primary': 'rgb(16, 185, 129)',
    });
  });

  it('renders a visible glow layer while glow bleed is enabled', () => {
    render(
      <WidgetShell
        widget={{
          ...widget,
          config: {
            accentOverride: 'rgba(16,185,129,0.2)',
          },
        }}
        glowEnabled
        title="Notes"
      >
        <p>Glowing text</p>
      </WidgetShell>,
    );

    expect(screen.getByTestId('widget-shell-glow')).not.toHaveClass('opacity-0');
  });

  it('keeps the default shell glow subtle', () => {
    render(
      <WidgetShell widget={widget} glowEnabled title="Notes">
        <p>Quiet glow text</p>
      </WidgetShell>,
    );

    const glow = screen.getByTestId('widget-shell-glow');
    const style = glow.getAttribute('style') || '';

    expect(style).toContain('opacity: 0.62');
    expect(style).toContain('var(--ether-sky) 7%');
    expect(style).toContain('var(--ether-sky) 3%');
  });

  it('renders widget header icons in the shared multi-color badge treatment', () => {
    render(
      <WidgetShell widget={widget} title="Notes" icon={<svg aria-hidden viewBox="0 0 24 24" />}>
        <p>Icon text</p>
      </WidgetShell>,
    );

    expect(screen.getByTestId('dashboard-widget-icon-badge')).toHaveClass('dashboard-widget-icon-badge');
    expect(screen.getByTestId('dashboard-widget-icon-burst')).toHaveClass('dashboard-widget-icon-burst');
  });

  it('uses the header icon as a hover-disclosed expand trigger', () => {
    let expandedWidgetId: string | null = null;
    const handleFocusWidget = (event: Event) => {
      expandedWidgetId = (event as CustomEvent<{ widgetId: string }>).detail?.widgetId || null;
    };
    window.addEventListener('curio-focus-widget', handleFocusWidget);

    render(
      <WidgetShell widget={widget} title="Notes" icon={<svg aria-hidden viewBox="0 0 24 24" />}>
        <p>Expandable text</p>
      </WidgetShell>,
    );

    const expandTrigger = screen.getByRole('button', { name: 'Expand Notes widget' });
    expect(expandTrigger).toHaveClass('dashboard-widget-icon-target');
    const iconBadge = screen.getByTestId('dashboard-widget-icon-badge');
    const expandGlyph = screen.getByTestId('dashboard-widget-icon-expand-button');
    expect(expandGlyph).toHaveClass('dashboard-widget-icon-expand-button');
    expect(iconBadge).toContainElement(expandGlyph);

    fireEvent.click(expandTrigger);

    expect(expandedWidgetId).toBe(widget.id);
    window.removeEventListener('curio-focus-widget', handleFocusWidget);
  });

  it('does not render shell glow by default', () => {
    render(
      <WidgetShell widget={widget} title="Notes">
        <p>Default text</p>
      </WidgetShell>,
    );

    expect(screen.queryByTestId('widget-shell-glow')).toBeNull();
  });

  it('does not draw the heavy hover shadow while dashboard edit mode is active', () => {
    render(
      <DashboardWidgetEditModeContext.Provider value>
        <WidgetShell widget={widget} title="Notes">
          <p>Edit mode text</p>
        </WidgetShell>
      </DashboardWidgetEditModeContext.Provider>,
    );

    const shell = screen.getByText('Edit mode text').closest('.group');

    expect(shell).toHaveClass('dashboard-widget-shell-editing');
    expect(shell?.className).not.toContain('hover:shadow');
    expect(shell?.className).not.toContain('hover:scale');
  });

  it('removes the glow layer when glow bleed is disabled', () => {
    render(
      <WidgetShell
        widget={{
          ...widget,
          config: {
            glowEnabled: false,
          },
        }}
        title="Notes"
      >
        <p>Plain text</p>
      </WidgetShell>,
    );

    expect(screen.queryByTestId('widget-shell-glow')).toBeNull();
  });

  it('lets a widget glow opt-out override explicit shell glow', () => {
    render(
      <WidgetShell
        widget={{
          ...widget,
          config: {
            glowEnabled: false,
          },
        }}
        glowEnabled
        title="Notes"
      >
        <p>Explicit glow text</p>
      </WidgetShell>,
    );

    expect(screen.queryByTestId('widget-shell-glow')).toBeNull();
  });

  it('uses global shell glow for media and full-bleed widgets', () => {
    const { rerender } = render(
      <DashboardWidgetGlowContext.Provider value>
        <WidgetShell widget={{ ...widget, type: 'music' }} title="Music">
          <p>Music text</p>
        </WidgetShell>
      </DashboardWidgetGlowContext.Provider>,
    );

    expect(screen.getByTestId('widget-shell-glow')).toBeInTheDocument();

    rerender(
      <DashboardWidgetGlowContext.Provider value>
        <WidgetShell widget={{ ...widget, type: 'youtube_video' }} title="Video">
          <p>Video text</p>
        </WidgetShell>
      </DashboardWidgetGlowContext.Provider>,
    );

    expect(screen.getByTestId('widget-shell-glow')).toBeInTheDocument();
  });
});
