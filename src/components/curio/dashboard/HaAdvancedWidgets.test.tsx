import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import { DashboardWidgetFrameContext } from '../../../hooks/useWidgetSize';
import { DashboardWidgetActionSlotContext } from './WidgetShell';
import { HaClimateWidget, HaEnergyWidget, HaMediaPlayerWidget, HaPrinterWidget } from './HaAdvancedWidgets';

const mocks = vi.hoisted(() => ({
  loadHaStatesCached: vi.fn(),
  callHaService: vi.fn(),
}));

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: true,
    onSurface: 'text-white',
    onSurfaceVariant: 'text-white/70',
  }),
}));

vi.mock('../../../utils/settingsStorage', () => ({
  useHaMcpEnabled: () => true,
  useHaMcpUrl: () => 'http://ha.local:8123/api/mcp',
  getHaMcpTokenAsync: () => Promise.resolve('ha-token'),
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
  id: 'media-widget',
  type: 'ha_media_player',
  position: 0,
  size: 'large',
  enabled: true,
  config: {
    w: 3,
    h: 3,
    entityIds: ['media_player.family_room'],
  },
};

const printerWidget: DashboardWidget = {
  id: 'printer-widget',
  type: 'ha_printer',
  position: 1,
  size: 'large',
  enabled: true,
  config: {
    w: 4,
    h: 3,
    entityIds: [
      'sensor.printer_status',
      'sensor.printer_progress',
      'sensor.printer_nozzle',
      'sensor.printer_bed',
      'button.printer_pause',
      'camera.printer',
    ],
  },
};

const renderHaWidget = (children: React.ReactNode) =>
  render(
    <React.StrictMode>
      <DashboardWidgetFrameContext.Provider
        value={{ pixelWidth: 462, pixelHeight: 378, gridWidth: 3, gridHeight: 3 }}
      >
        <DashboardWidgetActionSlotContext.Provider
          value={<button type="button">Widget actions</button>}
        >
          {children}
        </DashboardWidgetActionSlotContext.Provider>
      </DashboardWidgetFrameContext.Provider>
    </React.StrictMode>,
  );

const renderMediaWidget = () => renderHaWidget(<HaMediaPlayerWidget widget={widget} />);

const renderPrinterWidget = () => renderHaWidget(<HaPrinterWidget widget={printerWidget} />);

const energyWidget: DashboardWidget = {
  id: 'energy-widget',
  type: 'ha_energy',
  position: 2,
  size: 'large',
  enabled: true,
  config: {
    w: 3,
    h: 3,
    entityIds: ['sensor.home_power', 'sensor.solar_power', 'sensor.daily_energy'],
  },
};

const renderEnergyWidget = (
  overrides: {
    widget?: DashboardWidget;
  } = {},
) =>
  renderHaWidget(
    <HaEnergyWidget
      widget={overrides.widget || energyWidget}
    />,
  );

const climateWidget: DashboardWidget = {
  id: 'climate-widget',
  type: 'ha_climate',
  position: 3,
  size: 'large',
  enabled: true,
  config: {
    w: 2,
    h: 3,
    entityIds: ['climate.downstairs'],
  },
};

const renderClimateWidget = () => renderHaWidget(<HaClimateWidget widget={climateWidget} />);

describe('HaAdvancedWidgets', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads media player state under StrictMode remounts', async () => {
    mocks.loadHaStatesCached.mockResolvedValue([
      {
        entity_id: 'media_player.family_room',
        state: 'playing',
        attributes: {
          friendly_name: 'Family Room',
          media_title: 'Mock Song',
          media_artist: 'Curio Radio',
          volume_level: 0.42,
        },
      },
    ]);

    const { container } = renderMediaWidget();

    expect(await screen.findByText('Mock Song')).toBeInTheDocument();
    expect(container.querySelector('[data-widget-primitive="body"]')).toBeInTheDocument();
  });

  it('syncs media artwork from Home Assistant media attributes', async () => {
    mocks.loadHaStatesCached.mockResolvedValue([
      {
        entity_id: 'media_player.family_room',
        state: 'playing',
        attributes: {
          friendly_name: 'Family Room',
          media_title: 'Mock Song',
          media_artist: 'Curio Radio',
          entity_picture: '/api/media_player_proxy/media_player.family_room?token=art-token',
          volume_level: 0.42,
        },
      },
    ]);

    renderMediaWidget();

    const artwork = await screen.findByAltText('Mock Song artwork');
    expect(artwork).toHaveAttribute(
      'src',
      'http://ha.local:8123/api/media_player_proxy/media_player.family_room?token=art-token',
    );
  });

  it('sends media controls through the shared Home Assistant widget API', async () => {
    mocks.loadHaStatesCached.mockResolvedValue([
      {
        entity_id: 'media_player.family_room',
        state: 'playing',
        attributes: {
          friendly_name: 'Family Room',
          media_title: 'Mock Song',
          media_artist: 'Curio Radio',
          volume_level: 0.42,
        },
      },
    ]);
    mocks.callHaService.mockResolvedValue(new Response(null, { status: 200 }));

    renderMediaWidget();

    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));

    await waitFor(() => {
      expect(mocks.callHaService).toHaveBeenCalledWith(
        'http://ha.local:8123/api/mcp',
        'media_player',
        'media_play_pause',
        { entity_id: 'media_player.family_room' },
      );
    });
  });

  it('shows printer camera snapshots and exposes printer action entities', async () => {
    const createObjectURL = vi.fn(() => 'blob:printer-camera');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<svg />', {
      status: 200,
      headers: { 'Content-Type': 'image/svg+xml' },
    })));

    mocks.loadHaStatesCached.mockResolvedValue([
      {
        entity_id: 'sensor.printer_status',
        state: 'printing',
        attributes: { friendly_name: 'Printer Status' },
      },
      {
        entity_id: 'sensor.printer_progress',
        state: '63',
        attributes: { friendly_name: 'Printer Progress', unit_of_measurement: '%' },
      },
      {
        entity_id: 'sensor.printer_nozzle',
        state: '214',
        attributes: { friendly_name: 'Nozzle', unit_of_measurement: '°C' },
      },
      {
        entity_id: 'sensor.printer_bed',
        state: '60',
        attributes: { friendly_name: 'Bed', unit_of_measurement: '°C' },
      },
      {
        entity_id: 'button.printer_pause',
        state: 'unknown',
        attributes: { friendly_name: 'Pause Print' },
      },
      {
        entity_id: 'camera.printer',
        state: 'idle',
        attributes: { friendly_name: 'Printer Camera' },
      },
    ]);
    mocks.callHaService.mockResolvedValue(new Response(null, { status: 200 }));

    renderPrinterWidget();

    expect(await screen.findByAltText('Printer Camera')).toHaveAttribute('src', 'blob:printer-camera');

    fireEvent.click(screen.getByRole('button', { name: 'Pause Print' }));

    await waitFor(() => {
      expect(mocks.callHaService).toHaveBeenCalledWith(
        'http://ha.local:8123/api/mcp',
        'button',
        'press',
        { entity_id: 'button.printer_pause' },
      );
    });
  });

  it('renders energy sensors as a reference-style monthly usage card', async () => {
    mocks.loadHaStatesCached.mockResolvedValue([
      {
        entity_id: 'sensor.home_power',
        state: '875',
        attributes: { friendly_name: 'Home Power', unit_of_measurement: 'W' },
      },
      {
        entity_id: 'sensor.solar_power',
        state: '520',
        attributes: { friendly_name: 'Solar Power', unit_of_measurement: 'W' },
      },
      {
        entity_id: 'sensor.daily_energy',
        state: '7.4',
        attributes: { friendly_name: 'Daily Energy', unit_of_measurement: 'kWh' },
      },
    ]);

    const { container } = renderEnergyWidget();

    expect(await screen.findByTestId('ha-energy-meter')).toHaveTextContent('7.4 kWh');
    expect(screen.getByText('This Month')).toBeInTheDocument();
    expect(screen.getByText('Total Usage')).toBeInTheDocument();
    expect(screen.getByText('+8%')).toBeInTheDocument();
    expect(screen.getByText('vs last month')).toBeInTheDocument();
    expect(screen.getByTestId('ha-energy-monthly-chart')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View details/i })).not.toBeInTheDocument();
    expect(container.innerHTML).toContain('bg-[var(--ether-glass-bg)]');
    expect(container.innerHTML).not.toContain('!bg-white');
  });

  it('renders climate as a Nest-style dial and sends target temperature changes', async () => {
    mocks.loadHaStatesCached.mockResolvedValue([
      {
        entity_id: 'climate.downstairs',
        state: 'heat',
        attributes: {
          friendly_name: 'Downstairs',
          current_temperature: 70,
          temperature: 72,
          min_temp: 60,
          max_temp: 82,
          hvac_modes: ['heat', 'cool', 'auto', 'off'],
        },
      },
    ]);
    mocks.callHaService.mockResolvedValue(new Response(null, { status: 200 }));

    const { container } = renderClimateWidget();

    expect(await screen.findByTestId('ha-climate-dial')).toHaveTextContent('72');
    expect(container.querySelector('[data-widget-primitive="body"]')).toBeInTheDocument();
    expect(container.querySelector('[data-widget-primitive="footer"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Raise temperature' }));

    await waitFor(() => {
      expect(mocks.callHaService).toHaveBeenCalledWith(
        'http://ha.local:8123/api/mcp',
        'climate',
        'set_temperature',
        { entity_id: 'climate.downstairs', temperature: 73 },
      );
    });
  });
});
