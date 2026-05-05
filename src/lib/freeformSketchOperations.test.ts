import { describe, expect, it } from 'vitest';

import {
  appendSmoothedSketchPoint,
  shouldEditSelectedConnectorFromControl,
  moveSketchItemToBack,
  moveSketchItemToFront,
} from './freeformSketchOperations';

describe('freeformSketchOperations', () => {
  it('keeps the first drawn point exact', () => {
    expect(appendSmoothedSketchPoint([], { x: 12, y: 18 })).toEqual([{ x: 12, y: 18 }]);
  });

  it('adds a subtly smoothed drawing point without snapping all the way to the raw pointer', () => {
    const next = appendSmoothedSketchPoint([{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 20, y: 10 });

    expect(next).toHaveLength(3);
    expect(next[2].x).toBeGreaterThan(10);
    expect(next[2].x).toBeLessThan(20);
    expect(next[2].y).toBeGreaterThan(0);
    expect(next[2].y).toBeLessThan(10);
  });

  it('moves selected sketch items to the front and back without changing other order', () => {
    const items = [{ id: 'background' }, { id: 'photo' }, { id: 'notes' }, { id: 'label' }];

    expect(moveSketchItemToFront(items, 'photo').map((item) => item.id)).toEqual([
      'background',
      'notes',
      'label',
      'photo',
    ]);
    expect(moveSketchItemToBack(items, 'notes').map((item) => item.id)).toEqual([
      'notes',
      'background',
      'photo',
      'label',
    ]);
  });

  it('returns the same item array when a layer move cannot apply', () => {
    const items = [{ id: 'a' }, { id: 'b' }];

    expect(moveSketchItemToFront(items, 'b')).toBe(items);
    expect(moveSketchItemToBack(items, 'a')).toBe(items);
    expect(moveSketchItemToFront(items, 'missing')).toBe(items);
  });

  it('keeps connector controls in draw-default mode while the connector tool is active', () => {
    expect(shouldEditSelectedConnectorFromControl('connector', 'existing-arrow')).toBe(false);
    expect(shouldEditSelectedConnectorFromControl('select', 'existing-arrow')).toBe(true);
    expect(shouldEditSelectedConnectorFromControl('connector', null)).toBe(false);
  });
});
