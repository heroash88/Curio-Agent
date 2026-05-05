import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import WidgetSettingsModal from './WidgetSettingsModal';

const mocks = vi.hoisted(() => ({
  getHaMcpTokenAsync: vi.fn(),
  listNotionWidgetItems: vi.fn(),
  entities: [
    { entity_id: 'light.kitchen_lamp', name: 'Kitchen Lamp' },
    { entity_id: 'camera.front_door', name: 'Front Door Camera' },
    { entity_id: 'camera.garage', name: 'Garage Camera' },
    { entity_id: 'switch.porch_outlet', name: 'Porch Outlet' },
  ],
}));

vi.mock('../../../utils/settingsStorage', () => ({
  FACE_STYLES: [],
  getFaceStyleId: () => 'curio',
  getHaMcpTokenAsync: () => mocks.getHaMcpTokenAsync(),
}));

vi.mock('../../../services/haMcpService', () => ({
  HomeAssistantMCPClient: class {
    _allEntities = mocks.entities;

    constructor() {}

    async listEntities() {
      return this._allEntities;
    }
  },
}));

vi.mock('../../../services/notionMcpWidgetService', () => ({
  listNotionWidgetItems: mocks.listNotionWidgetItems,
}));

const widget: DashboardWidget = {
  id: 'home-widget',
  type: 'ha_entities',
  position: 0,
  size: 'large',
  enabled: true,
  config: {
    w: 3,
    h: 3,
    domain: 'light',
    entityIds: [],
  },
};

describe('WidgetSettingsModal Home Assistant entity settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.entities = [
      { entity_id: 'light.kitchen_lamp', name: 'Kitchen Lamp' },
      { entity_id: 'camera.front_door', name: 'Front Door Camera' },
      { entity_id: 'camera.garage', name: 'Garage Camera' },
      { entity_id: 'switch.porch_outlet', name: 'Porch Outlet' },
    ];
    mocks.getHaMcpTokenAsync.mockResolvedValue('ha-token');
    mocks.listNotionWidgetItems.mockReset();
  });

  it('filters Home widget entity choices by the selected type and saves selected devices', async () => {
    const onSave = vi.fn();

    render(
      <WidgetSettingsModal
        widget={widget}
        onClose={vi.fn()}
        onSave={onSave}
        haEnabled
        haUrl="http://ha.local:8123/api/mcp"
        widgetGlowEnabled={false}
        glassEffectEnabled
      />,
    );

    expect(await screen.findByText('Kitchen Lamp')).toBeInTheDocument();
    expect(screen.queryByText('Front Door Camera')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Clear'));
    fireEvent.click(screen.getByRole('button', { name: /Camera 2/i }));

    expect(await screen.findByText('Front Door Camera')).toBeInTheDocument();
    expect(screen.queryByText('Kitchen Lamp')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Front Door Camera'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'camera',
          entityIds: ['camera.front_door'],
        }),
      );
    });
  });

  it('allows Camera widget settings to select multiple camera feeds', async () => {
    const onSave = vi.fn();
    const cameraWidget: DashboardWidget = {
      id: 'camera-widget',
      type: 'ha_camera',
      position: 0,
      size: 'large',
      enabled: true,
      config: {
        w: 4,
        h: 3,
        entityIds: ['camera.front_door'],
      },
    };

    render(
      <WidgetSettingsModal
        widget={cameraWidget}
        onClose={vi.fn()}
        onSave={onSave}
        haEnabled
        haUrl="http://ha.local:8123/api/mcp"
        widgetGlowEnabled={false}
        glassEffectEnabled
      />,
    );

    expect(await screen.findAllByText('Front Door Camera')).toHaveLength(2);
    expect(screen.getByText('Garage Camera')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Garage Camera'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          entityIds: ['camera.front_door', 'camera.garage'],
        }),
      );
    });
  });

  it('shows glow settings for full-bleed widgets while hiding glass settings', () => {
    render(
      <WidgetSettingsModal
        widget={{
          id: 'youtube-widget',
          type: 'youtube_video',
          position: 0,
          size: 'large',
          enabled: true,
          config: {},
        }}
        onClose={vi.fn()}
        onSave={vi.fn()}
        haEnabled={false}
        haUrl=""
        widgetGlowEnabled
        glassEffectEnabled
      />,
    );

    expect(screen.getByText('Glow On')).toBeInTheDocument();
    expect(screen.queryByText(/Glass/)).toBeNull();
  });

  it('lets any widget use a custom accent color', async () => {
    const onSave = vi.fn();

    render(
      <WidgetSettingsModal
        widget={widget}
        onClose={vi.fn()}
        onSave={onSave}
        haEnabled={false}
        haUrl=""
        widgetGlowEnabled
        glassEffectEnabled
      />,
    );

    fireEvent.input(screen.getByLabelText('Custom widget accent color'), {
      target: { value: '#d946ef' },
    });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          accentOverride: '#d946ef',
        }),
      );
    });
  });

  it('lets the robot widget opt into a floating dashboard overlay', async () => {
    const onSave = vi.fn();

    render(
      <WidgetSettingsModal
        widget={{
          id: 'robot-widget',
          type: 'robot_face',
          position: 0,
          size: 'large',
          enabled: true,
          config: {},
        }}
        onClose={vi.fn()}
        onSave={onSave}
        haEnabled={false}
        haUrl=""
        widgetGlowEnabled={false}
        glassEffectEnabled
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Float across dashboard/i }));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          robotFloatingEnabled: true,
        }),
      );
    });
  });

  it('lets the robot widget choose autonomous floating motion', async () => {
    const onSave = vi.fn();

    render(
      <WidgetSettingsModal
        widget={{
          id: 'robot-widget',
          type: 'robot_face',
          position: 0,
          size: 'large',
          enabled: true,
          config: {
            robotFloatingEnabled: true,
            robotWanderMode: 'idle',
          },
        }}
        onClose={vi.fn()}
        onSave={onSave}
        haEnabled={false}
        haUrl=""
        widgetGlowEnabled={false}
        glassEffectEnabled
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Full wander/i }));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          robotWanderMode: 'full',
        }),
      );
    });
  });

  it('lets robot bubbles be disabled by proactive type', async () => {
    const onSave = vi.fn();

    render(
      <WidgetSettingsModal
        widget={{
          id: 'robot-widget',
          type: 'robot_face',
          position: 0,
          size: 'large',
          enabled: true,
          config: {},
        }}
        onClose={vi.fn()}
        onSave={onSave}
        haEnabled={false}
        haUrl=""
        widgetGlowEnabled={false}
        glassEffectEnabled
      />,
    );

    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
    expect(screen.getByText('Reminders')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Email/i }));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          robotBubbleEmail: false,
        }),
      );
    });
  });

  it('shows Zapier as a provider choice for mail and calendar widgets', () => {
    const { unmount } = render(
      <WidgetSettingsModal
        widget={{
          id: 'mail-widget',
          type: 'mail',
          position: 0,
          size: 'large',
          enabled: true,
          config: {},
        }}
        onClose={vi.fn()}
        onSave={vi.fn()}
        haEnabled={false}
        haUrl=""
        widgetGlowEnabled={false}
        glassEffectEnabled
      />,
    );

    expect(screen.getByRole('button', { name: 'zapier' })).toBeInTheDocument();
    unmount();

    render(
      <WidgetSettingsModal
        widget={{
          id: 'calendar-widget',
          type: 'calendar',
          position: 0,
          size: 'large',
          enabled: true,
          config: {},
        }}
        onClose={vi.fn()}
        onSave={vi.fn()}
        haEnabled={false}
        haUrl=""
        widgetGlowEnabled={false}
        glassEffectEnabled
      />,
    );

    expect(screen.getByRole('button', { name: 'zapier' })).toBeInTheDocument();
  });

  it('allows Energy widget settings to add multiple tracked devices', async () => {
    mocks.entities = [
      { entity_id: 'sensor.home_power', name: 'Home Power' },
      { entity_id: 'sensor.solar_power', name: 'Solar Power' },
      { entity_id: 'sensor.daily_energy', name: 'Daily Energy' },
      { entity_id: 'light.kitchen_lamp', name: 'Kitchen Lamp' },
    ];
    const onSave = vi.fn();
    const energyWidget: DashboardWidget = {
      id: 'energy-widget',
      type: 'ha_energy',
      position: 0,
      size: 'large',
      enabled: true,
      config: {
        w: 3,
        h: 3,
        entityIds: ['sensor.home_power'],
      },
    };

    render(
      <WidgetSettingsModal
        widget={energyWidget}
        onClose={vi.fn()}
        onSave={onSave}
        haEnabled
        haUrl="http://ha.local:8123/api/mcp"
        widgetGlowEnabled={false}
        glassEffectEnabled
      />,
    );

    expect(await screen.findByText('Tracked devices')).toBeInTheDocument();
    expect(screen.getByText('Solar Power')).toBeInTheDocument();
    expect(screen.queryByText('Kitchen Lamp')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Solar Power'));
    fireEvent.click(screen.getByText('Daily Energy'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          entityIds: ['sensor.home_power', 'sensor.solar_power', 'sensor.daily_energy'],
        }),
      );
    });
  });

  it('shows selected entities above the picker and removes them without searching', async () => {
    const onSave = vi.fn();
    const cameraWidget: DashboardWidget = {
      id: 'camera-widget',
      type: 'ha_camera',
      position: 0,
      size: 'large',
      enabled: true,
      config: {
        w: 4,
        h: 3,
        entityIds: ['camera.front_door', 'camera.garage'],
      },
    };

    render(
      <WidgetSettingsModal
        widget={cameraWidget}
        onClose={vi.fn()}
        onSave={onSave}
        haEnabled
        haUrl="http://ha.local:8123/api/mcp"
        widgetGlowEnabled={false}
        glassEffectEnabled
      />,
    );

    expect(await screen.findByText('Selected Entities')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove Front Door Camera/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove Garage Camera/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Remove Front Door Camera/i }));
    expect(screen.queryByRole('button', { name: /Remove Front Door Camera/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          entityIds: ['camera.garage'],
        }),
      );
    });
  });

  it('lets Home widget settings filter by selected HA rooms', async () => {
    mocks.entities = [
      { entity_id: 'light.kitchen_lamp', name: 'Kitchen Lamp', area: 'Kitchen' },
      { entity_id: 'switch.kitchen_fan', name: 'Kitchen Fan', area: 'Kitchen' },
      { entity_id: 'switch.porch_outlet', name: 'Porch Outlet', area: 'Entry' },
    ];
    const onSave = vi.fn();

    render(
      <WidgetSettingsModal
        widget={{
          ...widget,
          config: {
            ...widget.config,
            domain: '',
          },
        }}
        onClose={vi.fn()}
        onSave={onSave}
        haEnabled
        haUrl="http://ha.local:8123/api/mcp"
        widgetGlowEnabled={false}
        glassEffectEnabled
      />,
    );

    expect(await screen.findByRole('button', { name: /Kitchen 2/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Kitchen 2/i }));

    expect(screen.getByText('Kitchen Lamp')).toBeInTheDocument();
    expect(screen.getByText('Kitchen Fan')).toBeInTheDocument();
    expect(screen.queryByText('Porch Outlet')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          haRoomNames: ['Kitchen'],
        }),
      );
    });
  });

  it('saves the AI Chat app action tool toggle', () => {
    const onSave = vi.fn();
    const aiChatWidget: DashboardWidget = {
      id: 'ai-chat-widget',
      type: 'ai_chat',
      position: 0,
      size: 'large',
      enabled: true,
      config: {
        w: 4,
        h: 4,
      },
    };

    render(
      <WidgetSettingsModal
        widget={aiChatWidget}
        onClose={vi.fn()}
        onSave={onSave}
        haEnabled={false}
        haUrl=""
        widgetGlowEnabled={false}
        glassEffectEnabled
      />,
    );

    expect(screen.getByText('App actions')).toBeInTheDocument();

    fireEvent.click(screen.getByText('App actions'));
    fireEvent.click(screen.getByText('Save'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      aiChatToolUse: false,
    }));
  });

  it('saves AI Chat density and bubble text size controls', () => {
    const onSave = vi.fn();
    const aiChatWidget: DashboardWidget = {
      id: 'ai-chat-widget',
      type: 'ai_chat',
      position: 0,
      size: 'large',
      enabled: true,
      config: {
        w: 4,
        h: 4,
      },
    };

    render(
      <WidgetSettingsModal
        widget={aiChatWidget}
        onClose={vi.fn()}
        onSave={onSave}
        haEnabled={false}
        haUrl=""
        widgetGlowEnabled={false}
        glassEffectEnabled
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Compact/i }));
    fireEvent.click(screen.getByRole('button', { name: /Large/i }));
    fireEvent.click(screen.getByText('Save'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      aiChatDensity: 'compact',
      aiChatTextSize: 'large',
    }));
  });

  it('renders AI Chat feature toggles as roomier settings rows', () => {
    const aiChatWidget: DashboardWidget = {
      id: 'ai-chat-widget',
      type: 'ai_chat',
      position: 0,
      size: 'large',
      enabled: true,
      config: {
        w: 4,
        h: 4,
      },
    };

    render(
      <WidgetSettingsModal
        widget={aiChatWidget}
        onClose={vi.fn()}
        onSave={vi.fn()}
        haEnabled={false}
        haUrl=""
        widgetGlowEnabled={false}
        glassEffectEnabled
      />,
    );

    const voiceToggle = screen.getByRole('button', { name: /Voice input/i });
    const appActionsToggle = screen.getByRole('button', { name: /App actions/i });

    expect(voiceToggle).toHaveClass('min-h-11');
    expect(appActionsToggle).toHaveClass('min-h-11');
    expect(voiceToggle).not.toHaveClass('h-8');
    expect(appActionsToggle).not.toHaveClass('h-8');
  });

  it('fetches Notion note sources and saves the selected source', async () => {
    const onSave = vi.fn();
    mocks.listNotionWidgetItems.mockResolvedValueOnce([
      {
        id: 'page-1',
        title: 'Test Curio',
        preview: 'Project notes',
        url: 'https://www.notion.so/page-1',
      },
    ]);

    render(
      <WidgetSettingsModal
        widget={{
          id: 'notion-widget',
          type: 'notion_notes',
          position: 0,
          size: 'large',
          enabled: true,
          config: {
            notesProvider: 'notion',
            notionQuery: 'Test',
          },
        }}
        onClose={vi.fn()}
        onSave={onSave}
        haEnabled={false}
        haUrl=""
        widgetGlowEnabled={false}
        glassEffectEnabled
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fetch Notion notes' }));
    expect(await screen.findByText('Test Curio')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Select Notion source Test Curio' }));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        notionQuery: 'Test Curio',
        notionSourceId: 'page-1',
        notionSourceTitle: 'Test Curio',
        notionSourceUrl: 'https://www.notion.so/page-1',
      }));
    });
  });
});
