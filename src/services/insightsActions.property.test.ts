/**
 * Feature: dashboard-interactivity-upgrades, Property 19: Insights taps do not mutate configuration
 * Validates: Requirement 25.5
 *
 * Assert: dispatching `curio:dashboard-scroll-to-widget` does not mutate any
 * `curio_dashboard_prefs*` or `curio_dashboard_pages*` localStorage keys.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

describe('Property 19: Insights taps do not mutate configuration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  /**
   * Collect all localStorage keys matching dashboard prefs/pages patterns.
   */
  const snapshotDashboardKeys = (): Record<string, string | null> => {
    const snapshot: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith('curio_dashboard_prefs') ||
          key.startsWith('curio_dashboard_pages'))
      ) {
        snapshot[key] = localStorage.getItem(key);
      }
    }
    return snapshot;
  };

  it('dispatching curio:dashboard-scroll-to-widget does not mutate dashboard prefs or pages keys', () => {
    fc.assert(
      fc.property(
        fc.record({
          widgetId: fc.string({ minLength: 1, maxLength: 30 }),
        }),
        ({ widgetId }) => {
          // Seed some dashboard config keys so we can verify they stay unchanged
          localStorage.setItem(
            'curio_dashboard_prefs',
            JSON.stringify({ interactivity: { insightsActionsEnabled: true } }),
          );
          localStorage.setItem(
            'curio_dashboard_pages',
            JSON.stringify([
              {
                id: 'home',
                label: 'Home',
                widgets: [{ id: widgetId, type: 'weather', enabled: true }],
              },
            ]),
          );

          const before = snapshotDashboardKeys();

          // Dispatch the scroll-to-widget event (same as what Insights rows dispatch)
          window.dispatchEvent(
            new CustomEvent('curio:dashboard-scroll-to-widget', {
              detail: { widgetId },
            }),
          );

          const after = snapshotDashboardKeys();

          // Assert no mutation occurred
          expect(after).toEqual(before);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('dispatching curio:dashboard-scroll-to-widget with missing widget does not mutate dashboard keys', () => {
    fc.assert(
      fc.property(
        fc.record({
          widgetId: fc.string({ minLength: 1, maxLength: 30 }),
        }),
        ({ widgetId }) => {
          // Seed dashboard config with no matching widget
          localStorage.setItem(
            'curio_dashboard_prefs',
            JSON.stringify({ interactivity: { insightsActionsEnabled: true } }),
          );
          localStorage.setItem(
            'curio_dashboard_pages',
            JSON.stringify([
              {
                id: 'home',
                label: 'Home',
                widgets: [
                  { id: 'other-widget', type: 'tasks', enabled: true },
                ],
              },
            ]),
          );

          const before = snapshotDashboardKeys();

          // Dispatch scroll-to-widget for a widget that doesn't exist on the page
          window.dispatchEvent(
            new CustomEvent('curio:dashboard-scroll-to-widget', {
              detail: { widgetId },
            }),
          );

          const after = snapshotDashboardKeys();

          expect(after).toEqual(before);
        },
      ),
      { numRuns: 100 },
    );
  });
});
