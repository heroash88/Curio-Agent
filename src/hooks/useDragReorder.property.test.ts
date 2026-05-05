/**
 * Feature: dashboard-interactivity-upgrades, Property 4: Reorder preserves the multiset of row identifiers
 *
 * Validates: Requirement 5.8
 *
 * For any list of rows with unique ids and any valid drag-reorder or
 * keyboard-reorder operation, the resulting list SHALL be a
 * permutation of the original list (same set of ids, no duplicates,
 * no additions, no deletions).
 *
 * The property is exercised against the pure helper
 * {@link reorderArray}; the hook delegates every keyboard/pointer
 * reorder to it, so proving the property over the helper covers the
 * hook's mutation surface. Indices are generated outside the valid
 * range too (`[-2, length + 2]`) to exercise the clamping contract.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { reorderArray } from './useDragReorder';

describe('useDragReorder — Property 4: reorder preserves multiset of ids', () => {
  it('produces a permutation of the original list for any (from, to) pair', () => {
    fc.assert(
      fc.property(
        fc
          .uniqueArray(fc.string({ minLength: 1, maxLength: 4 }), {
            minLength: 1,
            maxLength: 12,
          })
          .chain((ids) =>
            fc
              .tuple(
                fc.constant(ids),
                fc.integer({ min: -2, max: ids.length + 2 }),
                fc.integer({ min: -2, max: ids.length + 2 }),
              ),
          ),
        ([ids, from, to]) => {
          const next = reorderArray(ids, from, to);

          // Length is preserved — no additions or deletions.
          expect(next.length).toBe(ids.length);

          // The multiset of ids is preserved.
          expect(new Set(next)).toEqual(new Set(ids));

          // With unique ids, the result must also have unique ids
          // (permutation, not multiset with duplicates).
          expect(new Set(next).size).toBe(next.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
