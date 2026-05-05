import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import { DashboardWidgetFrameContext } from '../../../hooks/useWidgetSize';
import { DashboardWidgetActionSlotContext } from './WidgetShell';
import HaCameraWidget from './HaCameraWidget';

const mocks = vi.hoisted(() => ({
  useHaMcpUrl: vi.fn(),
  getHaMcpTokenAsync: vi.fn(),
  loadHaStatesCached: vi.fn(),
}));

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: true,
    onSurface: 'text-white',
    onSurfaceVariant: 'text-white/70',
  }),
}));

vi.mock('../../../hooks/useDashboardRefresh', () => ({
  useDashboardRefresh: vi.fn(() => ({
    policy: { mode: 'manual', shouldPoll: false },
    refreshNow: vi.fn(),
  })),
}));

vi.mock('../../../utils/settingsStorage', () => ({
  useHaMcpUrl: () => mocks.useHaMcpUrl(),
  getHaMcpTokenAsync: () => mocks.getHaMcpTokenAsync(),
}));

vi.mock('./haWidgetApi', async (importActual) => {
  const actual = await importActual<typeof import('./haWidgetApi')>();
  return {
    ...actual,
    loadHaStatesCached: (...args: unknown[]) => mocks.loadHaStatesCached(...args),
  };
});

const buildWidget = (
  config: DashboardWidget['config'] = {},
): DashboardWidget => ({
  id: 'cam-widget',
  type: 'ha_camera',
  position: 0,
  size: 'large',
  enabled: true,
  config: {
    entityIds: ['camera.front_door'],
    refreshMode: 'push',
    ...config,
  },
});

describe('HaCameraWidget', () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  let objectUrlCount = 0;

  beforeEach(() => {
    objectUrlCount = 0;
    mocks.useHaMcpUrl.mockReturnValue('http://ha.local:8123/api/mcp');
    mocks.getHaMcpTokenAsync.mockResolvedValue('ha-token');
    mocks.loadHaStatesCached.mockResolvedValue([
      {
        entity_id: 'camera.front_door',
        state: 'idle',
        attributes: { friendly_name: 'Front Door' },
      },
      {
        entity_id: 'camera.garage',
        state: 'idle',
        attributes: { friendly_name: 'Garage' },
      },
    ]);
    URL.createObjectURL = vi.fn(() => `blob:frame-${++objectUrlCount}`);
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    vi.unstubAllGlobals();
  });

  it('renders shared live frames without cropping the camera view', async () => {
    render(<HaCameraWidget widget={buildWidget()} />);

    fireEvent(
      window,
      new CustomEvent('ha-camera-frame', {
        detail: {
          entityId: 'camera.front_door',
          blob: new Blob(['frame'], { type: 'image/jpeg' }),
        },
      }),
    );

    const image = await screen.findByRole('img');
    expect(image.getAttribute('src')).toBe('blob:frame-1');
    expect(image.closest('[data-widget-primitive="body"]')).toBeInTheDocument();
    expect(image.className).toContain('object-contain');
    expect(image.className).not.toContain('object-cover');
  });

  it('offers a camera selector that updates the widget and hands off the HA stream', async () => {
    const onUpdateWidgetConfig = vi.fn();
    const switchEvents: Array<Record<string, unknown>> = [];
    const handleSwitch = (event: Event) => {
      switchEvents.push((event as CustomEvent).detail);
    };
    window.addEventListener('ha-camera-switch', handleSwitch);

    try {
      render(
        <HaCameraWidget
          widget={buildWidget()}
          onUpdateWidgetConfig={onUpdateWidgetConfig}
        />,
      );

      fireEvent.click(await screen.findByRole('button', { name: /select camera/i }));
      expect(await screen.findByTestId('ha-camera-picker-menu')).toHaveClass('z-[80]');
      fireEvent.click(await screen.findByRole('button', { name: /garage/i }));

      expect(onUpdateWidgetConfig).toHaveBeenCalledWith('cam-widget', {
        entityIds: ['camera.garage'],
      });
      await waitFor(() => {
        expect(switchEvents).toContainEqual(
          expect.objectContaining({
            entityId: 'camera.garage',
            baseUrl: 'http://ha.local:8123',
            token: 'ha-token',
            startIfIdle: true,
          }),
        );
      });
    } finally {
      window.removeEventListener('ha-camera-switch', handleSwitch);
    }
  });

  it('reserves space for dashboard actions so camera controls do not overlap the menu', async () => {
    render(
      <DashboardWidgetActionSlotContext.Provider
        value={<button type="button" aria-label="Camera widget actions">...</button>}
      >
        <HaCameraWidget widget={buildWidget()} />
      </DashboardWidgetActionSlotContext.Provider>,
    );

    const controls = await screen.findByRole('group', { name: /camera controls/i });
    expect(controls.className).toContain('pr-12');
  });

  it('can render a clean camera feed without persistent overlay text', async () => {
    render(
      <HaCameraWidget
        widget={buildWidget({
          haCameraChromeHidden: true,
        })}
      />,
    );

    fireEvent(
      window,
      new CustomEvent('ha-camera-frame', {
        detail: {
          entityId: 'camera.front_door',
          blob: new Blob(['frame'], { type: 'image/jpeg' }),
        },
      }),
    );

    await screen.findByRole('img');
    expect(screen.queryByText('camera.front_door')).not.toBeInTheDocument();
  });

  it('keeps the multi-camera set when a configured camera is opened', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['frame'], { type: 'image/jpeg' }), { status: 200 })));
    const onUpdateWidgetConfig = vi.fn();

    render(
      <DashboardWidgetFrameContext.Provider
        value={{ pixelWidth: 620, pixelHeight: 420, gridWidth: 4, gridHeight: 3 }}
      >
        <HaCameraWidget
          widget={buildWidget({
            entityIds: ['camera.front_door', 'camera.garage'],
            refreshMode: 'timed',
          })}
          onUpdateWidgetConfig={onUpdateWidgetConfig}
        />
      </DashboardWidgetFrameContext.Provider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Show Garage camera/i }));

    expect(onUpdateWidgetConfig).toHaveBeenCalledWith('cam-widget', {
      entityIds: ['camera.garage', 'camera.front_door'],
    });
  });

  it('expands one camera from the grid and returns to the multi-camera view', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['frame'], { type: 'image/jpeg' }), { status: 200 })));

    render(
      <DashboardWidgetFrameContext.Provider
        value={{ pixelWidth: 620, pixelHeight: 420, gridWidth: 4, gridHeight: 3 }}
      >
        <HaCameraWidget
          widget={buildWidget({
            entityIds: ['camera.front_door', 'camera.garage'],
            refreshMode: 'timed',
          })}
        />
      </DashboardWidgetFrameContext.Provider>,
    );

    expect(await screen.findByTestId('ha-camera-grid')).toBeInTheDocument();
    expect(screen.getByTestId('ha-camera-grid').closest('[data-widget-primitive="body"]')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: /Expand Garage camera/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('ha-camera-grid')).not.toBeInTheDocument();
    });
    expect(await screen.findByRole('button', { name: /Show all cameras/i })).toBeInTheDocument();
    const topOverlay = screen.getByTestId('ha-camera-top-overlay');
    const controls = screen.getByRole('group', { name: /camera controls/i });
    expect(topOverlay).toHaveClass('top-4');
    expect(topOverlay).toHaveClass('sm:top-5');
    expect(controls).toHaveClass('opacity-100');
    expect(controls).toHaveClass('flex-nowrap');
    expect(controls).toHaveClass('pr-12');
    expect(controls).toHaveClass('sm:pr-14');

    fireEvent.click(screen.getByRole('button', { name: /Show all cameras/i }));

    expect(await screen.findByTestId('ha-camera-grid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show Front Door camera/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show Garage camera/i })).toBeInTheDocument();
  });

  it('starts a temporary live stream when expanding a timed camera and stops it when returning', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['frame'], { type: 'image/jpeg' }), { status: 200 })));
    const onUpdateWidgetConfig = vi.fn();
    const switchEvents: Array<Record<string, unknown>> = [];
    const stopEvents: Array<Record<string, unknown>> = [];
    const handleSwitch = (event: Event) => switchEvents.push((event as CustomEvent).detail);
    const handleStop = (event: Event) => stopEvents.push((event as CustomEvent).detail);
    window.addEventListener('ha-camera-switch', handleSwitch);
    window.addEventListener('ha-camera-stop', handleStop);

    try {
      render(
        <DashboardWidgetFrameContext.Provider
          value={{ pixelWidth: 620, pixelHeight: 420, gridWidth: 4, gridHeight: 3 }}
        >
          <HaCameraWidget
            widget={buildWidget({
              entityIds: ['camera.front_door', 'camera.garage'],
              refreshMode: 'timed',
            })}
            onUpdateWidgetConfig={onUpdateWidgetConfig}
          />
        </DashboardWidgetFrameContext.Provider>,
      );

      fireEvent.click(await screen.findByRole('button', { name: /Expand Garage camera/i }));

      await waitFor(() => {
        expect(switchEvents).toContainEqual(
          expect.objectContaining({
            entityId: 'camera.garage',
            startIfIdle: true,
            sourceId: 'dashboard-widget:cam-widget',
            temporary: true,
          }),
        );
      });
      expect(onUpdateWidgetConfig).not.toHaveBeenCalledWith(
        'cam-widget',
        expect.objectContaining({ refreshMode: 'push' }),
      );

      fireEvent.click(await screen.findByRole('button', { name: /Show all cameras/i }));

      expect(stopEvents).toContainEqual(
        expect.objectContaining({
          entityId: 'camera.garage',
          sourceId: 'dashboard-widget:cam-widget',
        }),
      );
    } finally {
      window.removeEventListener('ha-camera-switch', handleSwitch);
      window.removeEventListener('ha-camera-stop', handleStop);
    }
  });

  it('can return from a focused camera feed to the configured camera grid', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['frame'], { type: 'image/jpeg' }), { status: 200 })));
    const switchEvents: Array<Record<string, unknown>> = [];
    const stopEvents: Array<Record<string, unknown>> = [];
    const handleSwitch = (event: Event) => switchEvents.push((event as CustomEvent).detail);
    const handleStop = (event: Event) => stopEvents.push((event as CustomEvent).detail);
    window.addEventListener('ha-camera-switch', handleSwitch);
    window.addEventListener('ha-camera-stop', handleStop);

    const { unmount } = render(
      <DashboardWidgetFrameContext.Provider
          value={{ pixelWidth: 720, pixelHeight: 520, gridWidth: 5, gridHeight: 4 }}
        >
          <HaCameraWidget
            focused
            widget={buildWidget({
              entityIds: ['camera.front_door', 'camera.garage'],
              refreshMode: 'timed',
            })}
          />
        </DashboardWidgetFrameContext.Provider>,
      );

    const topOverlay = await screen.findByTestId('ha-camera-top-overlay');
    const controls = screen.getByRole('group', { name: /camera controls/i });
    expect(topOverlay).toHaveClass('top-4');
    expect(topOverlay).toHaveClass('sm:top-6');
    expect(controls).toHaveClass('flex-nowrap');
    expect(controls).toHaveClass('pr-12');
    expect(controls).toHaveClass('sm:pr-16');
    await waitFor(() => {
      expect(switchEvents).toContainEqual(
        expect.objectContaining({
          entityId: 'camera.front_door',
          startIfIdle: true,
          sourceId: 'dashboard-widget:cam-widget',
          temporary: true,
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /Show all cameras/i }));

    expect(await screen.findByTestId('ha-camera-grid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show Garage camera/i })).toBeInTheDocument();

    unmount();
    expect(stopEvents).toContainEqual(
      expect.objectContaining({
        entityId: 'camera.front_door',
        sourceId: 'dashboard-widget:cam-widget',
      }),
    );

    window.removeEventListener('ha-camera-switch', handleSwitch);
    window.removeEventListener('ha-camera-stop', handleStop);
  });

  it('auto-selects real camera entities when the widget has no configured feed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['frame'], { type: 'image/jpeg' }), { status: 200 })));
    const onUpdateWidgetConfig = vi.fn();

    render(
      <DashboardWidgetFrameContext.Provider
        value={{ pixelWidth: 620, pixelHeight: 420, gridWidth: 4, gridHeight: 3 }}
      >
        <HaCameraWidget
          widget={buildWidget({ entityIds: [], refreshMode: 'timed' })}
          onUpdateWidgetConfig={onUpdateWidgetConfig}
        />
      </DashboardWidgetFrameContext.Provider>,
    );

    await waitFor(() => {
      expect(onUpdateWidgetConfig).toHaveBeenCalledWith('cam-widget', {
        entityIds: ['camera.front_door', 'camera.garage'],
      });
    });
    expect(await screen.findByText('Front Door')).toBeInTheDocument();
  });
});
