import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationsSection from './NotificationsSection';
import RoutinesSection from './RoutinesSection';
import { DEFAULT_PROACTIVE_CONFIG } from '../../../services/proactiveTypes';
import type { Routine } from '../../../services/routineTypes';

const cardManagerMock = vi.hoisted(() => ({
  emitCardEvent: vi.fn(),
}));

const ambientSpeechMock = vi.hoisted(() => ({
  requestAmbientSpeech: vi.fn(),
}));

const audioServiceMock = vi.hoisted(() => ({
  playNotificationSound: vi.fn(),
  resumeAudioContext: vi.fn(async () => undefined),
}));

const settingsStorageMock = vi.hoisted(() => ({
  addNotificationRule: vi.fn(),
  deleteNotificationRule: vi.fn(),
  markRoutineRunAt: vi.fn(),
  setNotificationRuleEnabled: vi.fn(),
  setNotificationSystemEnabled: vi.fn(),
  updateNotificationRule: vi.fn(),
}));

vi.mock('../../../contexts/CardManagerContext', () => ({
  useCardManager: () => ({ emitCardEvent: cardManagerMock.emitCardEvent }),
}));

vi.mock('../../../services/ambientOutput', () => ({
  requestAmbientSpeech: ambientSpeechMock.requestAmbientSpeech,
}));

vi.mock('../../../services/audioService', () => ({
  playNotificationSound: audioServiceMock.playNotificationSound,
  resumeAudioContext: audioServiceMock.resumeAudioContext,
}));

vi.mock('../../../utils/settingsStorage', () => ({
  addNotificationRule: settingsStorageMock.addNotificationRule,
  deleteNotificationRule: settingsStorageMock.deleteNotificationRule,
  getHaMcpEnabled: vi.fn(() => false),
  getHaMcpTokenAsync: vi.fn(async () => ''),
  getHaMcpUrl: vi.fn(() => ''),
  markRoutineRunAt: settingsStorageMock.markRoutineRunAt,
  setNotificationRuleEnabled: settingsStorageMock.setNotificationRuleEnabled,
  setNotificationSystemEnabled: settingsStorageMock.setNotificationSystemEnabled,
  updateNotificationRule: settingsStorageMock.updateNotificationRule,
  useNotificationSystemStatus: () => ({
    enabled: true,
    activeRuleCount: DEFAULT_PROACTIVE_CONFIG.rules.length,
    availableRuleCount: DEFAULT_PROACTIVE_CONFIG.rules.length,
  }),
  useProactiveConfig: () => ({
    enabled: true,
    rules: DEFAULT_PROACTIVE_CONFIG.rules,
  }),
}));

const sampleRoutine: Routine = {
  id: 'routine_theme_test',
  name: 'Theme Test',
  icon: '*',
  trigger: { type: 'ha_state', haEntityId: 'binary_sensor.front_door', haState: 'open' },
  enabled: true,
  createdAt: 1,
  steps: [
    {
      id: 'step_card',
      type: 'show_card',
      enabled: true,
      config: { type: 'list', data: { title: 'List', items: ['One'] } },
    },
  ],
};

const actionRoutine: Routine = {
  ...sampleRoutine,
  id: 'routine_action_test',
  name: 'Action Test',
  trigger: { type: 'voice', phrase: 'action test' },
  steps: [
    {
      id: 'step_action',
      type: 'tool_call',
      enabled: true,
      config: { toolName: 'get_weather', args: {} },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

const renderRoutinesWithState = (initialRoutines: Routine[]) => {
  const StatefulRoutines = () => {
    const [routines, setRoutines] = useState(initialRoutines);
    return <RoutinesSection routines={routines} setRoutines={setRoutines} />;
  };

  return render(<StatefulRoutines />);
};

describe('settings automation sections theme surfaces', () => {
  it('uses the unified settings surface classes for routines and step editors', () => {
    render(<RoutinesSection routines={[sampleRoutine]} setRoutines={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Routines/i }));

    const scope = screen.getByTestId('routines-settings-scope');
    expect(scope).toHaveClass('settings-consistency-scope');
    expect(screen.getByTestId('routine-settings-card')).toHaveClass('settings-unified-card');

    fireEvent.click(screen.getByText('Theme Test'));

    expect(screen.getByTestId('routine-trigger-panel')).toHaveClass('settings-unified-subpanel');
    expect(screen.getByTestId('routine-step-card')).toHaveClass('settings-unified-step');
  });

  it('uses the unified settings surface classes for notification rules and controls', () => {
    render(<NotificationsSection />);

    fireEvent.click(screen.getByRole('button', { name: /Notifications/i }));

    const scope = screen.getByTestId('notifications-settings-scope');
    expect(scope).toHaveClass('settings-consistency-scope');
    expect(screen.getAllByTestId('notification-rule-card')[0]).toHaveClass('settings-unified-card');
    expect(screen.queryAllByTestId('notification-rule-config')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /Calendar reminders/i }));

    expect(screen.getAllByTestId('notification-delivery-row')[0]).toHaveClass('settings-unified-toolbar');
    expect(screen.getAllByTestId('notification-rule-config')[0]).toHaveClass('settings-unified-subpanel');
  });

  it('previews notification sound, speech, and card delivery when testing a rule', async () => {
    render(<NotificationsSection />);

    fireEvent.click(screen.getByRole('button', { name: /Notifications/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /Test/i })[0]);

    await waitFor(() => {
      expect(audioServiceMock.resumeAudioContext).toHaveBeenCalledTimes(1);
      expect(audioServiceMock.playNotificationSound).toHaveBeenCalledWith('normal');
    });
    expect(ambientSpeechMock.requestAmbientSpeech).toHaveBeenCalledWith({
      text: 'Meeting with team starts in 10 minutes.',
      reason: 'notification',
    });
    expect(cardManagerMock.emitCardEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'list',
      data: {
        title: 'Calendar Preview',
        items: ['Meeting with team starts in 10 minutes.'],
      },
    }));
  });

  it('shows understandable low, medium, and high priority values', () => {
    render(<NotificationsSection />);

    fireEvent.click(screen.getByRole('button', { name: /Notifications/i }));
    fireEvent.click(screen.getByRole('button', { name: /Calendar reminders/i }));

    expect(screen.getAllByText('Low').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Medium').length).toBeGreaterThan(0);
    expect(screen.getAllByText('High').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quiet update').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Standard alert').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Urgent alert').length).toBeGreaterThan(0);
  });

  it('uses selectable weather alert presets instead of a freeform condition field', () => {
    render(<NotificationsSection />);

    fireEvent.click(screen.getByRole('button', { name: /Notifications/i }));
    fireEvent.click(screen.getByRole('button', { name: /Weather changes/i }));

    expect(screen.queryByRole('textbox', { name: /Alert Conditions/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rain/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Snow/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Storms/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Severe weather/i })).toBeInTheDocument();
  });

  it('offers additional app alert presets from connected Curio features', () => {
    render(<NotificationsSection />);

    fireEvent.click(screen.getByRole('button', { name: /Notifications/i }));

    expect(screen.getByRole('button', { name: /Slack messages/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Commute & traffic/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chores & tasks/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Air quality/i })).toBeInTheDocument();
  });

  it('offers specific add-alert templates instead of repeating the default app rows', () => {
    render(<NotificationsSection />);

    fireEvent.click(screen.getByRole('button', { name: /Notifications/i }));

    expect(screen.getByRole('button', { name: /Slack channel alert/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Slack person alert/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Slack keyword alert/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gmail sender alert/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Outlook sender alert/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Email keyword alert/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Gmail sender alert/i }));

    expect(settingsStorageMock.addNotificationRule).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'email',
      label: 'Gmail sender alert',
      provider: 'gmail',
      conditions: expect.arrayContaining(['from_sender']),
    }));
  });

  it('shows near-push cadence and source filters for Slack and email alerts', () => {
    render(<NotificationsSection />);

    fireEvent.click(screen.getByRole('button', { name: /Notifications/i }));
    fireEvent.click(screen.getByRole('button', { name: /Email alerts/i }));

    expect(screen.getByRole('button', { name: /Near-push/i })).toBeInTheDocument();
    expect(screen.getByText('Specific sender')).toBeInTheDocument();
    expect(screen.getByText('Subject or keyword')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Slack messages/i }));

    expect(screen.getByText('Channel')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('Priority words')).toBeInTheDocument();
  });

  it('expands routine action choices to the app tools routines can run', () => {
    render(<RoutinesSection routines={[actionRoutine]} setRoutines={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Routines/i }));
    fireEvent.click(screen.getByText('Action Test'));

    expect(screen.getByRole('option', { name: /Check Gmail/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Check Outlook mail/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Get Slack messages/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /List Slack channels/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Show chores/i })).toBeInTheDocument();
  });

  it('shows a plain parameter field for common routine actions', () => {
    render(<RoutinesSection routines={[actionRoutine]} setRoutines={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Routines/i }));
    fireEvent.click(screen.getByText('Action Test'));

    expect(screen.getByText('Action parameters')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Optional city name')).toBeInTheDocument();
  });

  it('shows practical timer and alarm options for routine actions', () => {
    renderRoutinesWithState([actionRoutine]);

    fireEvent.click(screen.getByRole('button', { name: /Routines/i }));
    fireEvent.click(screen.getByText('Action Test'));

    const actionSelect = screen.getByDisplayValue('Get weather');
    fireEvent.change(actionSelect, { target: { value: 'setTimer' } });

    expect(screen.getByText('Timer duration')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5 min' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Focus sprint, laundry, tea')).toBeInTheDocument();

    fireEvent.change(actionSelect, { target: { value: 'set_alarm' } });

    expect(screen.getByText('Alarm time')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Morning alarm')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Weekdays/i })).toBeInTheDocument();
  });

  it('shows calendar and notes fields for routine actions that create content', () => {
    renderRoutinesWithState([actionRoutine]);

    fireEvent.click(screen.getByRole('button', { name: /Routines/i }));
    fireEvent.click(screen.getByText('Action Test'));

    const actionSelect = screen.getByDisplayValue('Get weather');
    fireEvent.change(actionSelect, { target: { value: 'create_calendar_event' } });

    expect(screen.getByText('Event title')).toBeInTheDocument();
    expect(screen.getByText('Start date and time')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Coffee with teammate')).toBeInTheDocument();

    fireEvent.change(actionSelect, { target: { value: 'saveNote' } });

    expect(screen.getByText('Note text')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('What should Curio save?')).toBeInTheDocument();

    fireEvent.change(actionSelect, { target: { value: 'setReminder' } });

    expect(screen.getByText('Reminder text')).toBeInTheDocument();
    expect(screen.getByText('When')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Take out recycling')).toBeInTheDocument();
  });

  it('explains custom routine tools and provides JSON arguments', () => {
    render(<RoutinesSection routines={[actionRoutine]} setRoutines={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Routines/i }));
    fireEvent.click(screen.getByText('Action Test'));

    const actionSelect = screen.getByDisplayValue('Get weather');
    fireEvent.change(actionSelect, { target: { value: '__custom__' } });

    expect(screen.getByText('Advanced custom tool')).toBeInTheDocument();
    expect(screen.getByText(/Use this only when you know the registered tool name/i)).toBeInTheDocument();
    expect(screen.getByText('JSON arguments')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('{ "query": "status report" }')).toBeInTheDocument();
  });
});
