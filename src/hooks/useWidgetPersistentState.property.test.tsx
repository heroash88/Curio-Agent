/**
 * Feature: dashboard-interactivity-upgrades, Property 10: useWidgetPersistentState round-trip across remount
 *
 * Validates: Requirement 14.7
 *
 * For any JSON-serializable value `v` and any `(widgetId, key)` pair,
 * calling `setValue(v)` then remounting a component with the same
 * `widgetId` and `key` SHALL read `v` as the current value.
 *
 * The round-trip property pins the semantic contract for per-widget
 * UI state (collapse, tab selection, view mode): it must survive not
 * only in-memory state transitions but also full component teardown
 * and reload, which is how the dashboard recovers after reloads.
 */
import { act, renderHook } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getWidgetPersistentStateKey,
  useWidgetPersistentState,
} from './useWidgetPersistentState';

const WIDGET_ID = 'widget-round-trip';
const KEY = 'display-mode';

// fast-check's `jsonValue` is the canonical JSON-serializable generator.
const jsonValueArb = fc.jsonValue();

const clearStorageForKey = () => {
  try {
    window.localStorage.removeItem(getWidgetPersistentStateKey(WIDGET_ID, KEY));
  } catch {
    // Ignore: clearing is best-effort.
  }
};

describe('useWidgetPersistentState — Property 10: round-trip across remount', () => {
  beforeEach(() => {
    clearStorageForKey();
  });

  afterEach(() => {
    clearStorageForKey();
  });

  it('setValue(v) then remount reads v back', () => {
    fc.assert(
      fc.property(jsonValueArb, (value) => {
        clearStorageForKey();

        // Fresh initial value so the hook does not read an accidental
        // residue from a prior iteration.
        const initial = { __initial__: true };

        const first = renderHook(() =>
          useWidgetPersistentState<unknown>(WIDGET_ID, KEY, initial),
        );

        act(() => {
          const [, setValue] = first.result.current;
          setValue(value);
        });

        // Unmount before the second render to simulate a component
        // teardown / page reload.
        first.unmount();

        const second = renderHook(() =>
          useWidgetPersistentState<unknown>(WIDGET_ID, KEY, initial),
        );

        const [readBack] = second.result.current;
        // fast-check's `jsonValue` produces values that deep-equal
        // themselves after JSON round-trip, so strict deep equality
        // is the right assertion here.
        expect(readBack).toEqual(value);

        second.unmount();
      }),
      { numRuns: 100 },
    );
  });
});
