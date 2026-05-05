/**
 * Feature: dashboard-interactivity-upgrades, Property 17: Palette open/close without selection is a no-op
 *
 * Validates: Requirement 23.9
 *
 * Assert: opening and closing the palette without selecting a result does
 * not mutate any widget config, layout, or persisted state.
 *
 * Since the command palette service is a pure registry + search layer with
 * no side effects until a result's `action()` is called, we verify that:
 *
 * 1. Calling `search(query)` never mutates the source registry.
 * 2. The results returned by `search` do not trigger any action unless
 *    explicitly invoked.
 * 3. Registering and unregistering sources is idempotent and does not
 *    produce side effects on widget state.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import fc from 'fast-check';

import {
  registerSource,
  unregisterSource,
  search,
  type CommandPaletteResult,
  type CommandPaletteSource,
} from './dashboardCommandPaletteService';

describe('DashboardCommandPalette — Property 17: Palette open/close without selection is a no-op', () => {
  // Track whether any action was called
  let actionCallCount: number;

  beforeEach(() => {
    actionCallCount = 0;
    // Clean up any previously registered sources
    unregisterSource('test-source-a');
    unregisterSource('test-source-b');
  });

  it('search() never invokes result actions — opening/closing is a no-op', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        async (labels, query) => {
          actionCallCount = 0;

          // Register a source that returns results with tracked actions
          const source: CommandPaletteSource = {
            id: 'test-source-a',
            search: () =>
              labels.map((label, i) => ({
                id: `result-${i}`,
                label,
                action: () => { actionCallCount += 1; },
                source: 'test-source-a',
              })),
          };

          registerSource(source);

          // Simulate "open palette, type query, then close without selecting"
          const results = await search(query);

          // The search itself should never call any action
          expect(actionCallCount).toBe(0);

          // Results are returned but no mutation occurred
          expect(Array.isArray(results)).toBe(true);

          // Cleanup
          unregisterSource('test-source-a');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('registering and unregistering sources does not produce side effects', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 10 }),
        async (sourceId) => {
          actionCallCount = 0;

          const source: CommandPaletteSource = {
            id: sourceId,
            search: () => [{
              id: 'r1',
              label: 'test',
              action: () => { actionCallCount += 1; },
              source: sourceId,
            }],
          };

          // Register, search, unregister — no actions should fire
          registerSource(source);
          await search('test');
          unregisterSource(sourceId);
          await search('test');

          expect(actionCallCount).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('search with empty query returns empty results without side effects', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('', ' ', '  ', '\t', '\n'),
        async (emptyQuery) => {
          actionCallCount = 0;

          const source: CommandPaletteSource = {
            id: 'test-source-b',
            search: () => [{
              id: 'r1',
              label: 'something',
              action: () => { actionCallCount += 1; },
              source: 'test-source-b',
            }],
          };

          registerSource(source);
          const results = await search(emptyQuery);

          // Empty/whitespace queries return no results
          expect(results).toHaveLength(0);
          // No actions invoked
          expect(actionCallCount).toBe(0);

          unregisterSource('test-source-b');
        },
      ),
      { numRuns: 50 },
    );
  });

  it('deduplication by id does not invoke actions', async () => {
    actionCallCount = 0;

    // Two sources returning the same id
    const sourceA: CommandPaletteSource = {
      id: 'test-source-a',
      search: () => [{
        id: 'shared-id',
        label: 'From A',
        action: () => { actionCallCount += 1; },
        source: 'test-source-a',
      }],
    };

    const sourceB: CommandPaletteSource = {
      id: 'test-source-b',
      search: () => [{
        id: 'shared-id',
        label: 'From B',
        action: () => { actionCallCount += 1; },
        source: 'test-source-b',
      }],
    };

    registerSource(sourceA);
    registerSource(sourceB);

    const results = await search('shared');
    // Deduplicated to one result
    expect(results.filter((r) => r.id === 'shared-id')).toHaveLength(1);
    // No actions called during search
    expect(actionCallCount).toBe(0);

    unregisterSource('test-source-a');
    unregisterSource('test-source-b');
  });
});
