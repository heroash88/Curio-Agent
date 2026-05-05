import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TimerCard from './TimerCard';
import type { Card } from '../../services/cardTypes';

const audioMocks = vi.hoisted(() => ({
  createOscillator: vi.fn(),
  oscillatorStop: vi.fn(),
  oscillatorStart: vi.fn(),
  createGain: vi.fn(),
}));

vi.mock('../../services/audioContext', () => ({
  getSharedAudioContext: () => ({
    state: 'running',
    currentTime: 0,
    resume: vi.fn(),
    destination: {},
    createOscillator: audioMocks.createOscillator,
    createGain: audioMocks.createGain,
  }),
}));

vi.mock('../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: true,
    muted: 'text-muted',
    text: 'text-white',
    btn: 'bg-control',
    btnText: 'text-control',
  }),
}));

vi.mock('../../hooks/useTimerTick', () => ({
  useTimerTick: () => vi.fn(() => vi.fn()),
}));

const createCompletedTimerCard = (): Card => ({
  id: 'timer-card-test',
  type: 'timer',
  createdAt: Date.now() - 60_000,
  autoDismissMs: -1,
  persistent: true,
  animationState: 'visible',
  data: {
    label: 'Test timer',
    isAlarm: false,
    targetTime: Date.now() - 1,
    duration: 60_000,
    completionState: 'completed',
  },
});

describe('TimerCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    audioMocks.createOscillator.mockImplementation(() => ({
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: audioMocks.oscillatorStart,
      stop: audioMocks.oscillatorStop,
      onended: null,
    }));
    audioMocks.createGain.mockImplementation(() => ({
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }));
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('rings in 15 second bursts with a 10 second rest until the user stops it', () => {
    const onDismiss = vi.fn();
    render(
      <TimerCard
        card={createCompletedTimerCard()}
        onDismiss={onDismiss}
        onInteractionStart={vi.fn()}
        onInteractionEnd={vi.fn()}
      />,
    );

    expect(audioMocks.createOscillator).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(15_050);
    const callsAfterFirstBurst = audioMocks.createOscillator.mock.calls.length;
    expect(callsAfterFirstBurst).toBeGreaterThan(2);

    vi.advanceTimersByTime(9_000);
    expect(audioMocks.createOscillator).toHaveBeenCalledTimes(callsAfterFirstBurst);

    vi.advanceTimersByTime(1_100);
    expect(audioMocks.createOscillator.mock.calls.length).toBeGreaterThan(callsAfterFirstBurst);

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    const callsAfterStop = audioMocks.createOscillator.mock.calls.length;

    vi.advanceTimersByTime(30_000);
    expect(audioMocks.createOscillator).toHaveBeenCalledTimes(callsAfterStop);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
