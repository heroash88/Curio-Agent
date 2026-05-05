import { describe, expect, it } from 'vitest';

import { makeInitialStateData, tensorElementCount } from './onnxState';

describe('Pocket TTS ONNX state initialization', () => {
  it('fills Mimi first flags as true instead of false', () => {
    const data = makeInitialStateData('bool', [3], 'mimi');

    expect(Array.from(data as Uint8Array)).toEqual([1, 1, 1]);
  });

  it('fills Flow transformer cache state with NaN sentinels', () => {
    const data = makeInitialStateData('float32', [2, 2], 'flow') as Float32Array;

    expect(Array.from(data).every(Number.isNaN)).toBe(true);
  });

  it('keeps Mimi float state zero-initialized', () => {
    const data = makeInitialStateData('float32', [2, 2], 'mimi') as Float32Array;

    expect(Array.from(data)).toEqual([0, 0, 0, 0]);
  });

  it('treats dynamic dimensions as empty initial state', () => {
    expect(tensorElementCount([1, 'dynamic', 32])).toBe(0);
  });
});
