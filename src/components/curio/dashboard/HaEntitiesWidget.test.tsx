import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import HaEntitiesWidget from './HaEntitiesWidget';

const mocks = vi.hoisted(() => ({
  loadHaStatesCached: vi.fn(),
  callHaService: vi.fn(),
}));

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    onSurface: 'text-white',
    onSurfaceVariant: 'text-white/70',
    surfaceContainerLow: 'bg-white/10',
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
    pixelWidth: 480,
    pixelHeight: 420,
  }),
}));

vi.mock('../../../hooks/useDashboardRefresh', async () => {
  const ReactActual = await vi.importActual<typeof React>('react');
  return {
    useDashboardRefresh: ({ onRefresh }: { onRefresh: (background?: boolean) => void }) => {
      ReactActual.useEffect(() => {
        void onRefresh(false);
      }, [onRefresh]);
      return { refreshNow: vi.fn() };
    },
  };
});

vi.mock('../../../utils/settingsStorage', () => ({
  useHaMcpEnabled: () => true,
  useHaMcpUrl: () => 'http://ha.local:8123/api/mcp',
}));

vi.mock('./haWidgetApi', async (importActual) => {
  const actual = await importActual<typeof import('./haWidgetApi')>();
  return {
    ...actual,
    loadHaStatesCached: (...args: unknown[]) => mocks.loadHaStatesCached(...args),
    callHaService: (...args: unknown[]) => mocks.callHaService(...args),
  };
});

const widget: DashboardWidget = {
  id: 'entities-widget',
  type: 'ha_entities',
  position: 0,
  size: 'large',
  enabled: true,
  config: {
    w: 3,
    h: 3,
    entityIds: ['light.kitchen_lamp'],
  },
};

describe('HaEntitiesWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadHaStatesCached.mockResolvedValue([
      {
        entity_id: 'light.kitchen_lamp',
        state: 'on',
        attributes: {
          friendly_name: 'Kitchen Lamp',
          brightness: 128,
        },
      },
    ]);
  });

  it('opens inline brightness and color controls for lights', async () => {
    render(<HaEntitiesWidget widget={widget} />);

    fireEvent.click(await screen.findByRole('button', { name: /Kitchen Lamp/i }));

    fireEvent.change(screen.getByRole('slider', { name: /Kitchen Lamp brightness/i }), {
      target: { value: '40' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Set Kitchen Lamp to warm amber/i }));

    await waitFor(() => {
      expect(mocks.callHaService).toHaveBeenCalledWith(
        'http://ha.local:8123/api/mcp',
        'light',
        'turn_on',
        { entity_id: 'light.kitchen_lamp', brightness_pct: 40 },
      );
      expect(mocks.callHaService).toHaveBeenCalledWith(
        'http://ha.local:8123/api/mcp',
        'light',
        'turn_on',
        { entity_id: 'light.kitchen_lamp', rgb_color: [255, 184, 108] },
      );
    });
  });

  it('renders multiple Home Assistant devices in the mockup device grid', async () => {
    mocks.loadHaStatesCached.mockResolvedValue([
      {
        entity_id: 'light.kitchen_lamp',
        state: 'on',
        attributes: { friendly_name: 'Kitchen Lamp', brightness: 128 },
      },
      {
        entity_id: 'switch.porch_outlet',
        state: 'off',
        attributes: { friendly_name: 'Porch Outlet' },
      },
    ]);

    render(
      <HaEntitiesWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            entityIds: ['light.kitchen_lamp', 'switch.porch_outlet'],
          },
        }}
      />,
    );

    expect(await screen.findByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText(/View all devices/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Devices' }));
    expect(screen.getByTestId('ha-entities-device-grid')).toHaveClass('grid-cols-2');
    expect(screen.getByText('Kitchen Lamp')).toBeInTheDocument();
    expect(screen.getByText('Porch Outlet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Devices' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('groups the Rooms tab by HA area and applies selected room filters', async () => {
    mocks.loadHaStatesCached.mockResolvedValue([
      {
        entity_id: 'light.kitchen_lamp',
        state: 'on',
        area: 'Kitchen',
        attributes: { friendly_name: 'Kitchen Lamp', brightness: 128 },
      },
      {
        entity_id: 'switch.porch_outlet',
        state: 'off',
        area: 'Entry',
        attributes: { friendly_name: 'Porch Outlet' },
      },
    ]);

    render(
      <HaEntitiesWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            entityIds: ['light.kitchen_lamp', 'switch.porch_outlet'],
            haRoomNames: ['Kitchen'],
          },
        }}
      />,
    );

    expect(await screen.findByText('Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Kitchen Lamp')).toBeInTheDocument();
    expect(screen.queryByText('Porch Outlet')).not.toBeInTheDocument();
  });

  it('applies comma-separated type filters to selected entities and still shows every selected device', async () => {
    mocks.loadHaStatesCached.mockResolvedValue([
      {
        entity_id: 'light.kitchen_lamp',
        state: 'on',
        attributes: { friendly_name: 'Kitchen Lamp', brightness: 128 },
      },
      {
        entity_id: 'switch.porch_outlet',
        state: 'off',
        attributes: { friendly_name: 'Porch Outlet' },
      },
      {
        entity_id: 'lock.front_door',
        state: 'locked',
        attributes: { friendly_name: 'Front Door' },
      },
    ]);

    render(
      <HaEntitiesWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            domain: 'light, switch',
            entityIds: ['light.kitchen_lamp', 'switch.porch_outlet', 'lock.front_door'],
            maxItems: 1,
          },
        }}
      />,
    );

    expect(await screen.findByText('Kitchen Lamp')).toBeInTheDocument();
    expect(screen.getByText('Porch Outlet')).toBeInTheDocument();
    expect(screen.queryByText('Front Door')).not.toBeInTheDocument();
  });
});
