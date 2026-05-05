/**
 * Feature: dashboard-interactivity-upgrades, Property 13: Optimistic rollback restores visible state
 *
 * Validates: Requirement 17.7
 *
 * For any optimistic action whose backing request fails, the widget's
 * visible state after rollback SHALL equal its visible state
 * immediately before the action.
 *
 * The test drives `useOptimisticAction` through a tiny state wrapper
 * whose setter mutates an external slot, simulating a widget's local
 * state store. After `commit` rejects, the slot value must deep-equal
 * the pre-run snapshot.
 *
 * The toast bus is mocked to a noop so the property focuses on the
 * rollback contract rather than side-effects.
 */
import { act, renderHook } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useOptimisticAction } from './useOptimisticAction';

vi.mock('../services/dashboardToastBus', () => ({
  dashboardToastBus: {
    show: vi.fn(),
    dismiss: vi.fn(),
    triggerUndo: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    getSnapshot: vi.fn(() => []),
  },
}));

const stateArb = fc.integer({ min: -100, max: 100 });
const applyDeltaArb = fc.integer({ min: -50, max: 50 });
const rejectCaseArb = fc.constantFrom<unknown>(
  null,
  undefined,
  'network-error',
  'server-500',
  new Error('boom'),
);

/**
 * Tiny wrapper so the hook can mutate a value owned outside React.
 * Mirrors how real widgets thread `useWidgetPersistentState` / Zustand
 * stores into the hook.
 */
interface StateSlot {
  state: number;
  setState: (next: number) => void;
}

const createSlot = (initial: number): StateSlot => {
  const slot: StateSlot = {
    state: initial,
    setState: (next: number) => {
      slot.state = next;
    },
  };
  return slot;
};

const flushMicrotasks = async (): Promise<void> => {
  // Three flushes cover: 1) the awaited `commit()` promise, 2) the
  // setState re-schedule, 3) any trailing microtasks from React's
  // scheduler.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('useOptimisticAction — Property 13: optimistic rollback restores visible state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('when commit rejects, local state deep-equals its pre-run value', async () => {
    await fc.assert(
      fc.asyncProperty(
        stateArb,
        applyDeltaArb,
        rejectCaseArb,
        async (initialState, delta, rejection) => {
          const slot = createSlot(initialState);
          const preRunSnapshot = slot.state;

          const apply = (prev: number) => prev + delta;
          const commit = () => Promise.reject(rejection);

          const { result, unmount } = renderHook(() =>
            useOptimisticAction<number>(slot.state, slot.setState, {
              apply,
              commit,
            }),
          );

          try {
            await act(async () => {
              await result.current.run();
              await flushMicrotasks();
            });

            // After rollback, the slot value must match the snapshot
            // taken immediately before `run()` was called.
            expect(slot.state).toBe(preRunSnapshot);
          } finally {
            unmount();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
