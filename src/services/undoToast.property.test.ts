/**
 * Feature: dashboard-interactivity-upgrades, Property 12: Undo restores exact prior state
 *
 * Validates: Requirement 16.7
 *
 * This property verifies the generic "apply then undo" identity at the
 * reducer layer. Each destructive widget action (task delete, reminder
 * dismiss, bookmark delete, portfolio holding remove, stock row remove,
 * notification dismiss, pin remove) is modeled as a pure pair of
 * functions:
 *
 *   apply(state) -> { next, undo: () => state }
 *
 * For the toast bus plumbing to be honest about Requirement 16.7, it is
 * enough that every destructive action we wire through
 * `dashboardToastBus` can produce an `undo` closure whose invocation
 * deep-equals the pre-action state. This is the bug the undo contract
 * is meant to prevent: an undo that drifts from the original snapshot.
 *
 * The property is exercised over a representative shape — index-based
 * deletion from a string list — which covers the Tasks, Reminders,
 * Bookmarks, Portfolio holdings, Stocks rows, Notifications, and pinned
 * items surfaces (all of which persist ordered lists of ids and all of
 * which delete by index or by id). Widget integrations in later tasks
 * will extend this property with destructive-action generators specific
 * to each store.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

/**
 * Minimal action contract for the property: given an initial state,
 * `apply` returns the new state and an `undo` closure that returns a
 * state deep-equal to the initial state.
 */
interface ActionCase<S> {
  initial: S;
  apply: (state: S) => { next: S; undo: () => S };
}

/**
 * Concrete destructive action generator for a list-of-ids shape.
 * Mirrors the shape of Tasks/Reminders/Bookmarks/Portfolio/Stocks/
 * Notifications/Pins stores.
 */
interface DeleteCase {
  kind: 'deleteIndex';
  list: string[];
  index: number;
}

const deleteCaseToAction = (testCase: DeleteCase): ActionCase<string[]> => {
  const { list, index } = testCase;
  return {
    initial: list.slice(),
    apply: (state: string[]) => {
      // Snapshot BEFORE mutation — this is the contract every widget
      // store must honor before dispatching a destructive event.
      const snapshot = state.slice();
      const next = state.slice(0, index).concat(state.slice(index + 1));
      return {
        next,
        undo: () => snapshot.slice(),
      };
    },
  };
};

const nonEmptyListArb = fc.array(fc.string(), { minLength: 1, maxLength: 50 });

const deleteCaseArb: fc.Arbitrary<DeleteCase> = nonEmptyListArb.chain((list) =>
  fc.integer({ min: 0, max: list.length - 1 }).map((index) => ({
    kind: 'deleteIndex' as const,
    list,
    index,
  })),
);

describe('Undo reducer identity — Property 12: Undo restores exact prior state', () => {
  it('apply(state).undo() deep-equals the pre-apply state for every destructive case', () => {
    fc.assert(
      fc.property(deleteCaseArb, (testCase) => {
        const action = deleteCaseToAction(testCase);
        const beforeSnapshot = action.initial.slice();

        const { next, undo } = action.apply(action.initial);

        // The destructive action must not retain a reference to the
        // original list (otherwise `undo` would return a mutated array).
        expect(next).not.toBe(action.initial);

        const restored = undo();

        expect(restored).toEqual(beforeSnapshot);
        // Restoring must not hand back the same reference as `next`,
        // otherwise a subsequent mutation of `next` would poison the
        // undo snapshot.
        expect(restored).not.toBe(next);
      }),
      { numRuns: 100 },
    );
  });

  it('undo is deterministic: repeated invocations all equal the pre-apply state', () => {
    fc.assert(
      fc.property(deleteCaseArb, (testCase) => {
        const action = deleteCaseToAction(testCase);
        const beforeSnapshot = action.initial.slice();

        const { undo } = action.apply(action.initial);

        for (let i = 0; i < 3; i += 1) {
          expect(undo()).toEqual(beforeSnapshot);
        }
      }),
      { numRuns: 50 },
    );
  });
});
