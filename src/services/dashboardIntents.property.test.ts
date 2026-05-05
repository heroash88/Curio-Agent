/**
 * Feature: dashboard-interactivity-upgrades, Property 7: Drop intent failure is a no-op on both sides
 *
 * Validates: Requirement 10.9
 *
 * For any `(sourceWidgetType, targetWidgetType, payload)` triple that the
 * `DROP_INTENT_REGISTRY` rejects (see `isDropTargetSupported`), dispatching
 * a `curio:dashboard-item-drop` CustomEvent for a subscribed target widget
 * SHALL NOT invoke the consumer's drop handler. The hook's contract is
 * the dashboard-wide "no-op guarantee" at the event-bus layer: target
 * widget code never runs, so no config mutation is possible on the
 * target side. Source widgets never see their own dispatch (the hook
 * only matches by `targetWidgetId`), so rejected drops are a no-op on
 * both sides by construction.
 *
 * The property additionally asserts that rejected drops surface the
 * shared "Not supported here" toast through `dashboardToastBus` so the
 * UX contract is observable.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import fc from 'fast-check';

import {
  DASHBOARD_ITEM_DROP_EVENT,
  DROP_INTENT_REGISTRY,
  type DropIntentPayload,
  isDropTargetSupported,
} from './dashboardIntents';
import {
  dashboardToastBus,
  resetDashboardToastBus,
} from './dashboardToastBus';
import { useDropIntentTarget } from '../hooks/useDashboardIntents';
import type { DashboardWidgetType } from './dashboardTypes';

// A representative slice of the DashboardWidgetType union. Covers every
// widget type that appears in `DROP_INTENT_REGISTRY` plus several
// unrelated widget types so fast-check can generate both supported and
// rejected pairs. Keeping the list explicit avoids depending on the
// full `WIDGET_CATALOG` (which includes HA-specific entries that are
// not meaningful drop sources or targets).
const WIDGET_TYPES: readonly DashboardWidgetType[] = [
  // Registry sources.
  'bookmarks',
  'tasks',
  'stock',
  'map',
  'news',
  // Registry targets.
  'notes',
  'rich_note',
  'obsidian_notes',
  'pomodoro',
  'portfolio',
  'commute',
  // Plenty of widget types that are NOT in the registry, used as
  // counter-examples so rejection is exercised often.
  'clock',
  'weather',
  'calendar',
  'mail',
  'messages',
  'ai_chat',
  'world_clock',
  'greeting',
  'timers',
  'reminders',
  'habits',
];

const widgetTypeArb = fc.constantFrom(...WIDGET_TYPES);

// Arbitrary JSON-serialisable payload object. `fc.object` is too broad
// (generates symbol-keyed values etc.), but `fc.dictionary(string, jsonValue)`
// gives a flat `Record<string, unknown>` that mirrors the real
// `DropIntentPayload.payload` shape.
const payloadArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 8 }),
  fc.jsonValue(),
  { maxKeys: 4 },
);

const TARGET_WIDGET_ID = 'property-7-target';

const dispatchDropEvent = (detail: DropIntentPayload): void => {
  window.dispatchEvent(
    new CustomEvent<DropIntentPayload>(DASHBOARD_ITEM_DROP_EVENT, { detail }),
  );
};

describe('dashboardIntents — Property 7: Drop intent failure is a no-op on both sides', () => {
  // Shared handler kept across property iterations. `renderHook` is
  // expensive, so we mount once and clear the handler (and toast bus)
  // between iterations.
  const handler = vi.fn();

  beforeAll(() => {
    renderHook(() => useDropIntentTarget(TARGET_WIDGET_ID, handler));
  });

  beforeEach(() => {
    resetDashboardToastBus();
    handler.mockClear();
  });

  afterEach(() => {
    resetDashboardToastBus();
  });

  it('rejected (source -> target) pairs do not invoke the target handler and emit the unsupported toast', () => {
    fc.assert(
      fc.property(
        widgetTypeArb,
        widgetTypeArb,
        payloadArb,
        fc.string({ minLength: 1, maxLength: 12 }),
        (sourceWidgetType, targetWidgetType, payload, sourceWidgetId) => {
          // Focus only on rejected pairs.
          fc.pre(!isDropTargetSupported(sourceWidgetType, targetWidgetType));

          // Hermetic per-iteration reset. `resetDashboardToastBus`
          // wipes the toast queue and drops subscribers, so we
          // re-establish a fresh show-spy for the single dispatch.
          resetDashboardToastBus();
          handler.mockClear();
          const showSpy = vi
            .spyOn(dashboardToastBus, 'show')
            .mockImplementation(() => {});

          act(() => {
            dispatchDropEvent({
              sourceWidgetId,
              sourceWidgetType,
              payload,
              targetWidgetId: TARGET_WIDGET_ID,
              targetWidgetType,
            });
          });

          // No-op guarantee: handler must never fire for rejected pairs.
          expect(handler).not.toHaveBeenCalled();

          // UX contract: the shared unsupported toast fires exactly once
          // with the documented id + label.
          expect(showSpy).toHaveBeenCalledTimes(1);
          expect(showSpy).toHaveBeenCalledWith({
            id: 'drop-intent-unsupported',
            label: 'Not supported here',
          });

          showSpy.mockRestore();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sanity check: the registry rejects at least some generated pairs', () => {
    // Guards against the property above degenerating into a vacuous
    // assertion if the arbitrary starts producing only supported pairs.
    let rejected = 0;
    let supported = 0;
    for (const src of WIDGET_TYPES) {
      for (const tgt of WIDGET_TYPES) {
        if (isDropTargetSupported(src, tgt)) supported += 1;
        else rejected += 1;
      }
    }
    expect(rejected).toBeGreaterThan(0);
    expect(supported).toBe(
      DROP_INTENT_REGISTRY.reduce(
        (acc, rule) => acc + rule.targetTypes.length,
        0,
      ),
    );
  });
});
