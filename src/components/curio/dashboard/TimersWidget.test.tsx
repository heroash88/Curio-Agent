import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TimersWidget from './TimersWidget';
import { CardManagerContext } from '../../../contexts/CardManagerContext';
import type { CardManagerContextValue } from '../../../services/cardTypes';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import { persistTimers } from '../../../services/timerPersistence';
import { getPersistedAlarms } from '../../../utils/settingsStorage';

const mockWidgetSize = vi.hoisted(() => ({
  current: {
    w: 2,
    h: 2,
    pixelWidth: 360,
    pixelHeight: 360,
    sizeClass: 'medium',
    isTall: false,
  },
}));

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    muted: 'text-muted',
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
    surfaceContainerLow: 'surface-low',
  }),
}));

vi.mock('../../../hooks/useTimerTick', () => ({
  useTimerTick: () => vi.fn(() => vi.fn()),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => mockWidgetSize.current,
}));

const baseWidget: DashboardWidget = {
  id: 'timers-test',
  type: 'timers',
  position: 0,
  size: 'medium',
  enabled: true,
  config: {},
};

const createCardManagerValue = (
  emitCardEvent: CardManagerContextValue['emitCardEvent'],
): CardManagerContextValue => ({
  cards: [],
  dispatch: vi.fn(),
  emitCardEvent,
  registerCardType: vi.fn(),
  enabled: true,
  registry: new Map(),
  pauseTimer: vi.fn(),
  resumeTimer: vi.fn(),
});

describe('TimersWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00.000Z'));
    mockWidgetSize.current = {
      w: 2,
      h: 2,
      pixelWidth: 360,
      pixelHeight: 360,
      sizeClass: 'medium',
      isTall: false,
    };
    localStorage.clear();
    // Exercise the legacy preset + custom-minute/second form path.
    // InlineQuickAdd has its own coverage in the primitive tests.
    localStorage.setItem(
      'curio_dashboard_prefs',
      JSON.stringify({ interactivity: { inlineQuickAddEnabled: false } }),
    );
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('emits a persistent timer card when response cards are enabled', () => {
    const emitCardEvent = vi.fn();

    render(
      <CardManagerContext.Provider value={createCardManagerValue(emitCardEvent)}>
        <TimersWidget widget={baseWidget} />
      </CardManagerContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '10m' }));

    expect(emitCardEvent).toHaveBeenCalledWith({
      type: 'timer',
      persistent: true,
      data: {
        label: '10 min timer',
        isAlarm: false,
        targetTime: Date.now() + 10 * 60_000,
        duration: 10 * 60_000,
        completionState: 'running',
      },
    });
  });

  it('persists a custom minute and second timer when the card manager is not available', () => {
    render(<TimersWidget widget={{ ...baseWidget, type: 'timers' }} />);

    fireEvent.change(screen.getByLabelText('Custom timer minutes'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Custom timer seconds'), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    const timers = JSON.parse(localStorage.getItem('curio_active_timers') || '[]');
    expect(timers).toEqual([
      expect.objectContaining({
        label: '2 min 30 sec timer',
        isAlarm: false,
        targetTime: Date.now() + 150_000,
        duration: 150_000,
      }),
    ]);
  });

  it('uses dropdown selectors for custom minutes and seconds', () => {
    render(<TimersWidget widget={{ ...baseWidget, type: 'timers' }} />);

    const minuteSelect = screen.getByRole('combobox', { name: 'Custom timer minutes' });
    const secondSelect = screen.getByRole('combobox', { name: 'Custom timer seconds' });
    expect(minuteSelect).toBeInTheDocument();
    expect(secondSelect).toBeInTheDocument();
    expect(minuteSelect).toHaveClass('dark:bg-[var(--ether-surface-container)]');
    expect(minuteSelect).toHaveClass('[&>option]:bg-[var(--ether-surface-container)]');
    expect(screen.getByTestId('timer-custom-form')).toHaveClass('mt-2');
    expect(screen.queryByRole('spinbutton', { name: 'Custom timer minutes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'Custom timer seconds' })).not.toBeInTheDocument();
  });

  it('emits custom seconds-only timers with a readable label', () => {
    const emitCardEvent = vi.fn();

    render(
      <CardManagerContext.Provider value={createCardManagerValue(emitCardEvent)}>
        <TimersWidget widget={baseWidget} />
      </CardManagerContext.Provider>,
    );

    fireEvent.change(screen.getByLabelText('Custom timer minutes'), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText('Custom timer seconds'), {
      target: { value: '45' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(emitCardEvent).toHaveBeenCalledWith({
      type: 'timer',
      persistent: true,
      data: {
        label: '45 sec timer',
        isAlarm: false,
        targetTime: Date.now() + 45_000,
        duration: 45_000,
        completionState: 'running',
      },
    });
  });

  it('uses a compact title and tighter controls in a 2 by 2 timer widget', () => {
    mockWidgetSize.current = {
      w: 2,
      h: 2,
      pixelWidth: 300,
      pixelHeight: 230,
      sizeClass: 'small',
      isTall: false,
    };
    persistTimers([
      {
        id: 'small-timer',
        label: '15 min timer',
        isAlarm: false,
        targetTime: Date.now() + 15 * 60_000,
        duration: 15 * 60_000,
        createdAt: Date.now(),
      },
    ]);

    render(<TimersWidget widget={{ ...baseWidget, type: 'timers' }} />);

    expect(screen.getByText('Timers')).toBeInTheDocument();
    expect(screen.queryByText('Active Timers')).not.toBeInTheDocument();
    expect(screen.getByTestId('timer-quick-add')).toHaveClass('p-1.5');
    expect(screen.getByTestId('timer-list')).toHaveClass('gap-1');
  });

  it('lets the alarms widget manually add multiple persisted alarms for AI lookup', () => {
    render(<TimersWidget widget={{ ...baseWidget, type: 'alarms', config: { timerView: 'alarms' } }} />);

    expect(screen.queryByRole('combobox', { name: 'Custom timer minutes' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Alarm hour' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Alarm minute' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Alarm AM or PM' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Alarm time')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Alarm hour'), {
      target: { value: '7' },
    });
    fireEvent.change(screen.getByLabelText('Alarm minute'), {
      target: { value: '30' },
    });
    fireEvent.change(screen.getByLabelText('Alarm AM or PM'), {
      target: { value: 'AM' },
    });
    fireEvent.change(screen.getByLabelText('Alarm label'), {
      target: { value: 'School run' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add alarm' }));

    fireEvent.change(screen.getByLabelText('Alarm hour'), {
      target: { value: '9' },
    });
    fireEvent.change(screen.getByLabelText('Alarm minute'), {
      target: { value: '15' },
    });
    fireEvent.change(screen.getByLabelText('Alarm AM or PM'), {
      target: { value: 'PM' },
    });
    fireEvent.change(screen.getByLabelText('Alarm label'), {
      target: { value: 'Medicine' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add alarm' }));

    const alarms = getPersistedAlarms();
    expect(alarms).toEqual([
      expect.objectContaining({
        label: 'School run',
        time: '07:30',
        enabled: true,
        days: [],
      }),
      expect.objectContaining({
        label: 'Medicine',
        time: '21:15',
        enabled: true,
        days: [],
      }),
    ]);
    expect(screen.getByText('7:30 AM')).toBeInTheDocument();
    expect(screen.getByText('9:15 PM')).toBeInTheDocument();
    expect(new Set(alarms.map((alarm) => alarm.id)).size).toBe(2);
  });
});
