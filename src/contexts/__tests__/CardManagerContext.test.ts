import { describe, expect, it } from 'vitest';

import {
  buildCardEventDedupKey,
  cardReducer,
} from '../CardManagerContext';

describe('CardManagerContext helpers', () => {
  it('dedupes identical rapid card emissions without suppressing changed payloads', () => {
    const first = buildCardEventDedupKey({
      type: 'weather',
      data: { city: 'Austin', temperature: 72 },
    });
    const duplicate = buildCardEventDedupKey({
      type: 'weather',
      data: { city: 'Austin', temperature: 72 },
    });
    const updated = buildCardEventDedupKey({
      type: 'weather',
      data: { city: 'Austin', temperature: 73 },
    });

    expect(duplicate).toBe(first);
    expect(updated).not.toBe(first);
  });

  it('keeps singleton card ids stable while refreshing their auto-dismiss metadata', () => {
    const firstState = cardReducer(
      { cards: [] },
      {
        type: 'ADD_CARD',
        payload: {
          type: 'weather',
          data: { city: 'Austin', temperature: 72 },
          autoDismissMs: 1000,
        },
      },
    );
    const cardId = firstState.cards[0].id;

    const nextState = cardReducer(firstState, {
      type: 'ADD_CARD',
      payload: {
        type: 'weather',
        data: { city: 'Austin', temperature: 73 },
        autoDismissMs: 5000,
      },
    });

    expect(nextState.cards).toHaveLength(1);
    expect(nextState.cards[0].id).toBe(cardId);
    expect(nextState.cards[0].data.temperature).toBe(73);
    expect(nextState.cards[0].autoDismissMs).toBe(5000);
  });
});
