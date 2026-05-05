import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileWidget from './ProfileWidget';
import { DashboardWidgetActionSlotContext } from './WidgetShell';
import type { DashboardWidget } from '../../../services/dashboardTypes';

const widgetSizeMock = vi.hoisted(() => ({
  current: {
    w: 2,
    h: 3,
    area: 6,
    sizeClass: 'medium',
    isWide: false,
    isTall: true,
    isCompact: false,
    pixelWidth: 300,
    pixelHeight: 340,
  },
}));

const settingsMocks = vi.hoisted(() => ({
  avatarDataUrl: '',
  setNotificationSystemEnabled: vi.fn(),
  setOfflineModeEnabled: vi.fn(),
  setSpeakerMuted: vi.fn(),
}));

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: false,
    muted: 'text-muted',
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
    surfaceContainerLow: 'surface-low',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => widgetSizeMock.current,
}));

vi.mock('../../../utils/settingsStorage', () => ({
  setNotificationSystemEnabled: settingsMocks.setNotificationSystemEnabled,
  setOfflineModeEnabled: settingsMocks.setOfflineModeEnabled,
  setSpeakerMuted: settingsMocks.setSpeakerMuted,
  useUserAvatarDataUrl: () => settingsMocks.avatarDataUrl,
  useUserName: () => 'Curio Operator',
  useVoiceBackend: () => 'liveapi',
}));

const widget: DashboardWidget = {
  id: 'profile-test',
  type: 'profile',
  position: 0,
  size: 'medium',
  enabled: true,
  config: { w: 2, h: 3 },
};

describe('ProfileWidget', () => {
  beforeEach(() => {
    widgetSizeMock.current = {
      w: 2,
      h: 3,
      area: 6,
      sizeClass: 'medium',
      isWide: false,
      isTall: true,
      isCompact: false,
      pixelWidth: 300,
      pixelHeight: 340,
    };
    settingsMocks.setNotificationSystemEnabled.mockClear();
    settingsMocks.setOfflineModeEnabled.mockClear();
    settingsMocks.setSpeakerMuted.mockClear();
    settingsMocks.avatarDataUrl = '';
    localStorage.clear();
  });

  it('uses a simplified operator header with the user image and no session label', () => {
    settingsMocks.avatarDataUrl = 'data:image/png;base64,avatar';

    render(<ProfileWidget widget={widget} />);

    expect(screen.getByText('Curio Operator')).toBeInTheDocument();
    expect(screen.getByAltText('Curio Operator')).toHaveAttribute(
      'src',
      settingsMocks.avatarDataUrl,
    );
    expect(screen.queryByText('Shared session')).not.toBeInTheDocument();
    expect(screen.queryByText('Mode Effects')).not.toBeInTheDocument();
  });

  it('uses colorful distinct system and status cards', () => {
    render(<ProfileWidget widget={widget} />);

    const homeCard = screen.getByText('Home Assistant').closest('[data-profile-vitals-card]');
    const voiceCard = screen.getByText('Voice AI').closest('[data-profile-vitals-card]');
    const connectivityCard = screen.getByText('Connectivity').closest('[data-profile-vitals-card]');
    const privacyCard = screen.getByText('Privacy').closest('[data-profile-vitals-card]');

    expect(homeCard).toHaveClass('profile-vitals-card-ok');
    expect(homeCard).toHaveClass('profile-vitals-card-home');
    expect(homeCard).toHaveClass('shadow-none');
    expect(homeCard).not.toHaveClass('backdrop-blur-md');
    expect(voiceCard).toHaveClass('profile-vitals-card-ok');
    expect(voiceCard).toHaveClass('profile-vitals-card-voice');
    expect(connectivityCard).toHaveClass('profile-vitals-card-connectivity');
    expect(privacyCard).toHaveClass('profile-vitals-card-privacy');
    expect(screen.getByRole('button', { name: /Open/i })).toHaveClass('profile-status-option-available');
    expect(screen.getByRole('button', { name: /Focus/i })).toHaveClass('profile-status-option-focus');
  });

  it('connects operator modes to notification, audio, and offline settings', () => {
    render(<ProfileWidget widget={widget} />);

    fireEvent.click(screen.getByRole('button', { name: /Focus/i }));
    expect(settingsMocks.setNotificationSystemEnabled).toHaveBeenLastCalledWith(false);
    expect(settingsMocks.setOfflineModeEnabled).toHaveBeenLastCalledWith(false);
    expect(settingsMocks.setSpeakerMuted).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: /Open/i }));
    expect(settingsMocks.setNotificationSystemEnabled).toHaveBeenLastCalledWith(true);
    expect(settingsMocks.setOfflineModeEnabled).toHaveBeenLastCalledWith(false);
    expect(settingsMocks.setSpeakerMuted).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: /Away/i }));
    expect(settingsMocks.setNotificationSystemEnabled).toHaveBeenLastCalledWith(false);
    expect(settingsMocks.setOfflineModeEnabled).toHaveBeenLastCalledWith(false);
    expect(settingsMocks.setSpeakerMuted).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: /Offline/i }));
    expect(settingsMocks.setNotificationSystemEnabled).toHaveBeenLastCalledWith(false);
    expect(settingsMocks.setOfflineModeEnabled).toHaveBeenLastCalledWith(true);
    expect(settingsMocks.setSpeakerMuted).toHaveBeenLastCalledWith(false);
  });

  it('keeps operator actions reachable when resized to a tiny card', () => {
    widgetSizeMock.current = {
      w: 1,
      h: 1,
      area: 1,
      sizeClass: 'tiny',
      isWide: false,
      isTall: false,
      isCompact: true,
      pixelWidth: 160,
      pixelHeight: 120,
    };

    render(
      <DashboardWidgetActionSlotContext.Provider value={<button type="button">Widget controls</button>}>
        <ProfileWidget widget={widget} />
      </DashboardWidgetActionSlotContext.Provider>,
    );

    expect(screen.getByText('Widget controls').parentElement).toHaveClass('opacity-100');
    expect(screen.getByText('Widget controls').parentElement).not.toHaveClass('opacity-0');
    expect(screen.queryByRole('button', { name: 'Focus' })).not.toBeInTheDocument();
    expect(screen.getByText('CO')).toBeInTheDocument();
  });
});
