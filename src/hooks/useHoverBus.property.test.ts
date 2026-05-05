/**
 * Feature: dashboard-interactivity-upgrades, Property 9: Hover-end clears highlights
 *
 * Validates: Requirement 12.7
 *
 * For any prior hover state, after a hover event with
 * `{ itemKind: null, itemId: null }` is reduced by the hover bus, the
 * highlighted-widget set SHALL be empty. The reducer is `useHoverBus`
 * in `useDashboardIntents.ts`; "highlighted set" maps to
 * `result.current.hovered` being null because downstream widgets derive
 * their highlight set from that reducer output (design §12.4/12.7).
 *
 * Hover-end MUST NOT disturb the `selected` slot — that is validated in
 * a secondary property to document the design intent.
 */
import { act, renderHook } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DASHBOARD_HOVER_EVENT,
  DASHBOARD_SELECT_EVENT,
  type HoverEventDetail,
  type HoverItemKind,
  type SelectEventDetail,
} from '../services/dashboardIntents';
import { resetHoverBusForTests, useHoverBus } from './useDashboardIntents';

// Ascii-only strings keep CustomEvent detail deterministic across
// environments and avoid serialisation flakiness in jsdom.
const asciiString = (minLength: number, maxLength: number) =>
  fc.string({ minLength, maxLength, unit: 'grapheme-ascii' });

const widgetIdArb = asciiString(1, 10);
const itemIdArb = asciiString(1, 6);
const itemKindArb = fc.constantFrom<HoverItemKind>(
  'calendar-event',
  'task',
  'mail-thread',
  'stock',
  'bookmark',
);

const hoverEventArb = fc.record({
  widgetId: widgetIdArb,
  itemKind: itemKindArb,
  itemId: itemIdArb,
});

const selectEventArb = fc.record({
  widgetId: widgetIdArb,
  itemKind: itemKindArb,
  itemId: itemIdArb,
});

type BusEvent =
  | { type: 'hover'; detail: HoverEventDetail }
  | { type: 'select'; detail: SelectEventDetail };

const eventArb: fc.Arbitrary<BusEvent> = fc.oneof(
  hoverEventArb.map((detail) => ({ type: 'hover' as const, detail })),
  selectEventArb.map((detail) => ({ type: 'select' as const, detail })),
);

const sequenceArb = fc.array(eventArb, { minLength: 0, maxLength: 20 });

const dispatchBusEvent = (event: BusEvent): void => {
  if (event.type === 'hover') {
    window.dispatchEvent(
      new CustomEvent<HoverEventDetail>(DASHBOARD_HOVER_EVENT, {
        detail: event.detail,
      }),
    );
  } else {
    window.dispatchEvent(
      new CustomEvent<SelectEventDetail>(DASHBOARD_SELECT_EVENT, {
        detail: event.detail,
      }),
    );
  }
};

const HOVER_END_WIDGET_ID = 'x';

describe('useHoverBus — Property 9: Hover-end clears highlights', () => {
  beforeEach(() => {
    resetHoverBusForTests();
  });

  afterEach(() => {
    resetHoverBusForTests();
  });

  it('after any sequence followed by a hover-end event, `hovered` is null', () => {
    fc.assert(
      fc.property(sequenceArb, (events) => {
        resetHoverBusForTests();
        const { result, unmount } = renderHook(() => useHoverBus());

        try {
          act(() => {
            for (const event of events) {
              dispatchBusEvent(event);
            }
            // Hover-end closer.
            window.dispatchEvent(
              new CustomEvent<HoverEventDetail>(DASHBOARD_HOVER_EVENT, {
                detail: {
                  widgetId: HOVER_END_WIDGET_ID,
                  itemKind: null,
                  itemId: null,
                },
              }),
            );
          });

          expect(result.current.hovered).toBeNull();
        } finally {
          unmount();
        }
      }),
      { numRuns: 100 },
    );
  });

  it('hover-end does not disturb the `selected` slot set earlier in the sequence', () => {
    fc.assert(
      fc.property(sequenceArb, selectEventArb, (events, finalSelected) => {
        resetHoverBusForTests();
        const { result, unmount } = renderHook(() => useHoverBus());

        try {
          act(() => {
            for (const event of events) {
              dispatchBusEvent(event);
            }
            // Apply a deterministic final select event so the assertion
            // below is about that specific value, regardless of what the
            // generated sequence chose.
            window.dispatchEvent(
              new CustomEvent<SelectEventDetail>(DASHBOARD_SELECT_EVENT, {
                detail: finalSelected,
              }),
            );
            // Hover-end.
            window.dispatchEvent(
              new CustomEvent<HoverEventDetail>(DASHBOARD_HOVER_EVENT, {
                detail: {
                  widgetId: HOVER_END_WIDGET_ID,
                  itemKind: null,
                  itemId: null,
                },
              }),
            );
          });

          expect(result.current.hovered).toBeNull();
          expect(result.current.selected).toEqual(finalSelected);
        } finally {
          unmount();
        }
      }),
      { numRuns: 100 },
    );
  });
});
