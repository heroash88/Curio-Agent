/**
 * Feature: dashboard-interactivity-upgrades, Property 8: LinkedWidgetId resolution is id-preserving or null
 *
 * Validates: Requirement 11.8
 *
 * For any `linkedWidgetId` (string, null, undefined) and any list of
 * live widgets, `resolveLinkedWidget(id, widgets)` SHALL return
 * either a widget whose `.id === id` or `null`. The function SHALL
 * NEVER return a widget with a different id.
 *
 * This is the core safety invariant that keeps Pomodoro from
 * displaying someone else's task when the linked id goes stale, and
 * NowPlaying from mirroring the wrong music widget after a reshuffle.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { resolveLinkedWidget } from './dashboardIntents';
import type { DashboardWidget } from './dashboardTypes';

const widgetIdArb = fc.string({
  minLength: 1,
  maxLength: 12,
  unit: 'grapheme-ascii',
});

/**
 * Build a fake widget from just an id. Every other field is filled
 * with a defensible default so the value type-checks; the property
 * only reads `.id`.
 */
const makeFakeWidget = (id: string): DashboardWidget => ({
  id,
  type: 'notes',
  position: 0,
  size: 'medium',
  config: {},
  enabled: true,
});

const widgetsArb = fc
  .uniqueArray(widgetIdArb, { maxLength: 10 })
  .map((ids) => ids.map(makeFakeWidget));

const queryIdArb = fc.oneof(
  widgetIdArb,
  fc.constant(null),
  fc.constant(undefined),
);

describe('resolveLinkedWidget — Property 8: id-preserving or null', () => {
  it('returns either null or a widget whose id equals the query id', () => {
    fc.assert(
      fc.property(queryIdArb, widgetsArb, (queryId, widgets) => {
        const result = resolveLinkedWidget(queryId, widgets);

        if (result === null) {
          // Null is always a valid answer (Requirement 11.5).
          return;
        }

        // Otherwise, the id must match exactly. `queryId` can only be
        // a non-empty string when a match exists (nullish query
        // values always resolve to `null`).
        expect(typeof queryId).toBe('string');
        expect(result.id).toBe(queryId);
      }),
      { numRuns: 100 },
    );
  });

  it('returns null for nullish or empty query ids regardless of widgets list', () => {
    fc.assert(
      fc.property(widgetsArb, (widgets) => {
        expect(resolveLinkedWidget(null, widgets)).toBeNull();
        expect(resolveLinkedWidget(undefined, widgets)).toBeNull();
        expect(resolveLinkedWidget('', widgets)).toBeNull();
      }),
      { numRuns: 50 },
    );
  });

  it('returns null for empty or nullish widgets list regardless of query id', () => {
    fc.assert(
      fc.property(queryIdArb, (queryId) => {
        expect(resolveLinkedWidget(queryId, null)).toBeNull();
        expect(resolveLinkedWidget(queryId, undefined)).toBeNull();
        expect(resolveLinkedWidget(queryId, [])).toBeNull();
      }),
      { numRuns: 50 },
    );
  });
});
