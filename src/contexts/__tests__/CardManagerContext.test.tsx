import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CardManagerProvider,
  useCardManager,
} from '../CardManagerContext';
import type { CardManagerContextValue } from '../../services/cardTypes';
import {
  clearPersistedTimers,
  persistTimers,
  restoreTimers,
} from '../../services/timerPersistence';

vi.mock('../../utils/settingsStorage', () => ({
  getCardEnabled: () => true,
  useResponseCardsEnabled: () => true,
}));

vi.mock('../../services/alarmChecker', () => ({
  setAlarmCallback: vi.fn(),
  startAlarmChecker: vi.fn(),
  stopAlarmChecker: vi.fn(),
}));

let cardManager: CardManagerContextValue;

const Probe = () => {
  cardManager = useCardManager();
  return null;
};

describe('CardManagerProvider timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00.000Z'));
    clearPersistedTimers();
  });

  afterEach(() => {
    clearPersistedTimers();
    vi.useRealTimers();
  });

  it('keeps a dismissed running timer alive and shows it again when it finishes', async () => {
    render(
      <CardManagerProvider>
        <Probe />
      </CardManagerProvider>,
    );

    const targetTime = Date.now() + 1_000;
    act(() => {
      cardManager.emitCardEvent({
        type: 'timer',
        persistent: true,
        data: {
          label: 'Tea timer',
          isAlarm: false,
          targetTime,
          duration: 1_000,
          completionState: 'running',
        },
      });
    });

    expect(cardManager.cards).toHaveLength(1);
    const cardId = cardManager.cards[0].id;
    persistTimers([
      {
        id: cardId,
        label: 'Tea timer',
        isAlarm: false,
        targetTime,
        duration: 1_000,
        createdAt: Date.now(),
      },
    ]);

    act(() => {
      cardManager.dispatch({ type: 'REMOVE_CARD', payload: { id: cardId } });
    });

    expect(cardManager.cards).toHaveLength(0);
    expect(restoreTimers()).toEqual([
      expect.objectContaining({ id: cardId, label: 'Tea timer' }),
    ]);

    act(() => {
      vi.advanceTimersByTime(1_100);
    });

    expect(cardManager.cards).toHaveLength(1);
    expect(cardManager.cards[0].data).toEqual(
      expect.objectContaining({
        label: 'Tea timer',
        timerId: cardId,
        completionState: 'completed',
      }),
    );
  });
});
