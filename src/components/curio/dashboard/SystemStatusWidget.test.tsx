import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import SystemStatusWidget from './SystemStatusWidget';

const widgetSizeState = vi.hoisted(() => ({
  current: {
    w: 3,
    h: 3,
    area: 9,
    pixelWidth: 420,
    pixelHeight: 360,
    sizeClass: 'large',
    isCompact: false,
    isTall: true,
    isWide: true,
  },
}));

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: true,
    muted: 'text-muted',
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
    surfaceContainer: 'surface-container',
    surfaceContainerHigh: 'surface-container-high',
    surfaceContainerLow: 'surface-container-low',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => widgetSizeState.current,
}));

vi.mock('../../../utils/settingsStorage', () => ({
  useHaMcpEnabled: () => true,
  useThemeMode: () => 'dark',
  useVoiceBackend: () => 'custom_llm',
}));

vi.mock('../../../utils/haMcpRuntimeStatus', () => ({
  useHaMcpRuntimeStatus: () => ({ status: 'connected' }),
}));

const buildWidget = (
  config: Partial<DashboardWidget['config']> = {},
): DashboardWidget => ({
  id: 'system-test',
  type: 'system_status',
  position: 0,
  size: 'large',
  enabled: true,
  config: {
    w: 3,
    h: 3,
    ...config,
  } as DashboardWidget['config'],
});

describe('SystemStatusWidget', () => {
  beforeEach(() => {
    widgetSizeState.current = {
      w: 3,
      h: 3,
      area: 9,
      pixelWidth: 420,
      pixelHeight: 360,
      sizeClass: 'large',
      isCompact: false,
      isTall: true,
      isWide: true,
    };
    localStorage.setItem('curio-test-setting', 'stored value');
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: {
        effectiveType: '4g',
        downlink: 10,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      value: 8,
    });
    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: 5,
    });
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: vi.fn(async () => ({
          usage: 5 * 1024 * 1024,
          quota: 50 * 1024 * 1024,
        })),
      },
    });
    Object.defineProperty(performance, 'memory', {
      configurable: true,
      value: {
        usedJSHeapSize: 12 * 1024 * 1024,
        jsHeapSizeLimit: 128 * 1024 * 1024,
      },
    });
  });

  afterEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(performance, 'memory', {
      configurable: true,
      value: undefined,
    });
  });

  it('renders the selected system modules with live browser metrics', async () => {
    render(
      <SystemStatusWidget
        widget={buildWidget({
          systemStatusModules: ['network', 'storage', 'browser'],
        })}
      />,
    );

    expect(screen.getByText('System ready')).toBeInTheDocument();
    expect(screen.getByText('Network')).toBeInTheDocument();
    expect(screen.getByTestId('system-module-browser')).toHaveTextContent(
      'Browser',
    );
    const networkModule = screen.getByTestId('system-module-network');
    expect(networkModule).toHaveTextContent('Online');
    expect(networkModule).toHaveTextContent('Estimated link 10 Mbps');
    expect(networkModule).toHaveTextContent('4G class');

    await waitFor(() => {
      expect(screen.getByText(/5 MB/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.queryByText('Voice')).not.toBeInTheDocument();
    expect(screen.queryByText('Home Assistant')).not.toBeInTheDocument();
  });

  it('omits unsupported optional modules and reports browser device hints', () => {
    Object.defineProperty(navigator, 'getBattery', {
      configurable: true,
      value: undefined,
    });

    render(
      <SystemStatusWidget
        widget={buildWidget({
          systemStatusModules: ['power', 'device'] as any,
        })}
      />,
    );

    expect(screen.queryByTestId('system-module-power')).not.toBeInTheDocument();
    const deviceModule = screen.getByTestId('system-module-device');
    expect(deviceModule).toHaveTextContent('Device');
    expect(deviceModule).toHaveTextContent('8 threads');
    expect(deviceModule).toHaveTextContent('4 GB memory');
  });

  it('uses a compact health summary for tiny widgets', () => {
    widgetSizeState.current = {
      w: 1,
      h: 1,
      area: 1,
      pixelWidth: 140,
      pixelHeight: 140,
      sizeClass: 'tiny',
      isCompact: true,
      isTall: false,
      isWide: false,
    };

    render(
      <SystemStatusWidget
        widget={buildWidget({
          systemStatusModules: ['network', 'voice', 'homeAssistant'],
        })}
      />,
    );

    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('3/3')).toBeInTheDocument();
    expect(screen.queryByText('Network')).not.toBeInTheDocument();
  });
});
