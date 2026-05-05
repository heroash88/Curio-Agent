import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DashboardWidgetFrame,
  areDashboardWidgetFramePropsEqual,
  type DashboardWidgetFrameProps,
} from './DashboardWidgetFrame';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import type { PackedDashboardItem } from './dashboardLayout';

const renderCounts = vi.hoisted(() => ({
  notes: 0,
  weather: 0,
}));

vi.mock('./dashboardRegistry', () => ({
  WIDGET_COMPONENTS: {
    notes: ({ widget }: { widget: DashboardWidget }) => {
      renderCounts.notes += 1;
      return <div data-testid={`mock-widget-${widget.id}`}>Notes widget body</div>;
    },
    music: ({ widget }: { widget: DashboardWidget }) => (
      <div data-testid={`mock-widget-${widget.id}`}>Music widget body</div>
    ),
    youtube_video: ({ widget }: { widget: DashboardWidget }) => (
      <div data-testid={`mock-widget-${widget.id}`}>YouTube widget body</div>
    ),
    weather: ({ widget }: { widget: DashboardWidget }) => {
      renderCounts.weather += 1;
      return <div data-testid={`mock-widget-${widget.id}`}>Weather widget body</div>;
    },
  },
}));

const widget: DashboardWidget = {
  id: 'notes_1',
  type: 'notes',
  position: 0,
  size: 'medium',
  enabled: true,
  config: { w: 2, h: 2 },
};

const packedItem: PackedDashboardItem = {
  widget,
  x: 0,
  y: 0,
  w: 2,
  h: 2,
  left: 12,
  top: 18,
  width: 240,
  height: 180,
};

const buildFrameProps = (overrides: Partial<DashboardWidgetFrameProps> = {}) => {
  const baseProps: DashboardWidgetFrameProps = {
    widget,
    packedItem,
    editMode: true,
    effectiveMode: 'grid',
    isDefaultDarkWallpaper: false,
    isDark: false,
    reduceMotion: true,
    widgetGlowEnabled: false,
    glassEffectEnabled: true,
    glassEffectIntensity: 50,
    isActiveDrag: false,
    activeGestureKind: null,
    resizeIntentActive: false,
    isSearchHighlighted: false,
    isFocused: false,
    isMenuOpen: false,
    metrics: { columns: 8, columnWidth: 100, rowHeight: 80, gap: 12 },
    weather: null,
    aqi: null,
    activeProfileName: null,
    activeProfileId: null,
    recognizedBy: null,
    speakerUpdatedAt: 0,
    onUpdateWidgetConfig: vi.fn(),
    onOpenWidgetSettings: vi.fn(),
    onRegisterWidgetMenuButton: vi.fn(),
    onToggleWidgetMenu: vi.fn(),
    onBeginGridDrag: vi.fn(),
    onBeginFreeformDrag: vi.fn(),
    onBeginGridResize: vi.fn(),
    onBeginFreeformResize: vi.fn(),
    onBeginGridResizeAt: vi.fn(),
    onBeginFreeformResizeAt: vi.fn(),
    onRaiseFreeformWidget: vi.fn(),
    onSetResizeIntentWidgetId: vi.fn(),
    onClearPendingResizeHold: vi.fn(),
    pendingResizeHoldRef: { current: null },
    dragElementRef: { current: null },
  };

  return { ...baseProps, ...overrides };
};

const renderFrame = (overrides: Partial<DashboardWidgetFrameProps> = {}) => {
  return render(<DashboardWidgetFrame {...buildFrameProps(overrides)} />);
};

describe('DashboardWidgetFrame', () => {
  beforeEach(() => {
    renderCounts.notes = 0;
    renderCounts.weather = 0;
  });

  it('makes the active move surface less transparent while a widget is dragged', () => {
    const { container } = renderFrame({
      isActiveDrag: true,
      activeGestureKind: 'drag-grid',
      activeGestureOriginRect: {
        left: packedItem.left,
        top: packedItem.top,
        width: packedItem.width,
        height: packedItem.height,
      },
    });

    const frame = container.querySelector<HTMLElement>(
      '[data-dashboard-widget-id="notes_1"]',
    );
    const movingSurface = container.querySelector<HTMLElement>(
      '[data-dashboard-moving-widget="true"]',
    );

    expect(frame).toHaveStyle({
      '--dashboard-active-drag-glass-bg':
        'color-mix(in srgb, var(--ether-glass-bg) 55%, var(--ether-surface) 45%)',
    });
    expect(movingSurface).toHaveStyle({
      '--ether-glass-bg': 'var(--dashboard-active-drag-glass-bg)',
    });
  });

  it('applies widget glass and glow to eligible media widgets', () => {
    const musicWidget: DashboardWidget = {
      ...widget,
      id: 'music_1',
      type: 'music',
    };

    const { container } = renderFrame({
      widget: musicWidget,
      widgetGlowEnabled: true,
    });

    expect(
      container.querySelector('[data-dashboard-widget-glow="true"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-dashboard-widget-glass="on"]'),
    ).toBeTruthy();
  });

  it('applies widget glow but not glass to excluded full-bleed widgets', () => {
    const youtubeWidget: DashboardWidget = {
      ...widget,
      id: 'youtube_1',
      type: 'youtube_video',
    };

    const { container } = renderFrame({
      widget: youtubeWidget,
      widgetGlowEnabled: true,
    });

    expect(
      container.querySelector('[data-dashboard-widget-glow="true"]'),
    ).toBeTruthy();
    const surface = container.querySelector<HTMLElement>(
      '[data-dashboard-widget-glass="unsupported"]',
    );
    expect(surface).toHaveStyle({
      '--ether-glass-bg': '#fbf9f4',
      '--ether-glass-blur': '0px',
    });
  });

  it('lets an eligible widget opt out of glass while the page glass is enabled', () => {
    const { container } = renderFrame({
      widget: {
        ...widget,
        config: {
          ...widget.config,
          glassEnabled: false,
        },
      },
      glassEffectEnabled: true,
    });

    const surface = container.querySelector<HTMLElement>(
      '[data-dashboard-widget-glass="off"]',
    );
    expect(surface).toHaveStyle({
      '--ether-glass-bg': '#fbf9f4',
      '--ether-glass-blur': '0px',
    });
  });

  it('keeps edit-mode frame corners visually clean until resize is active', () => {
    const { container } = renderFrame({ editMode: true });

    const surface = container.querySelector<HTMLElement>(
      '[data-dashboard-widget-glass]',
    );
    const resizeCorner = container.querySelector<HTMLElement>(
      '[data-dashboard-resize-corner="true"]',
    );

    expect(surface?.className).not.toContain('ring-1');
    expect(surface).toHaveClass('overflow-hidden');
    expect(surface?.className).not.toContain('overflow-visible');
    expect(resizeCorner).toHaveClass('border-transparent', 'opacity-0');
    expect(resizeCorner?.className).not.toContain('border-[var(--ether-on-surface)]/36');
  });

  it('does not rerender widgets that ignore weather, profile, speaker, and face runtime props', () => {
    const props = buildFrameProps({
      weather: {
        tempF: 72,
        tempC: 22,
        icon: 'clear-day',
        desc: 'Clear',
        city: 'Austin',
      },
      activeProfileName: 'Taylor',
      activeProfileId: 'profile-a',
      recognizedBy: 'voice',
      speakerUpdatedAt: 1,
    });
    const { rerender } = render(<DashboardWidgetFrame {...props} />);

    expect(renderCounts.notes).toBe(1);

    const nextProps = buildFrameProps({
      ...props,
      weather: {
        tempF: 73,
        tempC: 23,
        icon: 'clear-day',
        desc: 'Clear',
        city: 'Austin',
      },
      activeProfileName: 'Jordan',
      activeProfileId: 'profile-b',
      recognizedBy: 'face',
      speakerUpdatedAt: 2,
      faceSlot: () => <div data-testid="unused-face-slot" />,
    });

    expect(areDashboardWidgetFramePropsEqual(props, nextProps)).toBe(true);

    rerender(
      <DashboardWidgetFrame {...nextProps} />,
    );

    expect(renderCounts.notes).toBe(1);
  });

  it('rerenders a weather-aware widget when its derived runtime props change', () => {
    const weatherWidget: DashboardWidget = {
      ...widget,
      id: 'weather_1',
      type: 'weather',
    };
    const weatherPackedItem: PackedDashboardItem = {
      ...packedItem,
      widget: weatherWidget,
    };
    const props = buildFrameProps({
      widget: weatherWidget,
      packedItem: weatherPackedItem,
      weather: {
        tempF: 72,
        tempC: 22,
        icon: 'clear-day',
        desc: 'Clear',
        city: 'Austin',
      },
    });
    const { rerender } = render(<DashboardWidgetFrame {...props} />);

    expect(renderCounts.weather).toBe(1);

    const nextProps = buildFrameProps({
      ...props,
      weather: {
        tempF: 73,
        tempC: 23,
        icon: 'partly-cloudy-day',
        desc: 'Partly cloudy',
        city: 'Austin',
      },
    });

    expect(areDashboardWidgetFramePropsEqual(props, nextProps)).toBe(false);

    rerender(<DashboardWidgetFrame {...nextProps} />);

    expect(renderCounts.weather).toBe(2);
  });
});
