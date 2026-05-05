import { useCallback, useRef, useState } from 'react';

import { dashboardToastBus } from '../services/dashboardToastBus';
import { useDashboardInteractivitySettings } from '../utils/settings/dashboardSettings';

/**
 * `useOptimisticAction` wraps an asynchronous mutation in the classic
 * optimistic-update + rollback-on-failure pattern described in
 * Requirement 17.
 *
 * The hook does not own the visible state. Consumers pass `localState`
 * and a `setLocalState` function (typically from their own widget
 * store) so the same pattern works whether state lives in `useState`,
 * a Zustand-style store, or a context reducer.
 *
 * Flow:
 *   1. `run()` snapshots `localState`.
 *   2. Computes `next = apply(prev)` and calls
 *      `setLocalState(next)` immediately — the screen shows the
 *      intended state before the server confirms.
 *   3. `await commit()`.
 *      - On resolve: clear `isPending` and `error`.
 *      - On reject: call `rollback(prev, next, err)` (or default to
 *        `prev`) and call `setLocalState` with its return. Emit a
 *        retry toast via `dashboardToastBus`.
 *
 * Honors `optimisticActionsEnabled` (Requirement 17.5): when false,
 * the hook skips the `apply` phase and just awaits `commit()`; on
 * reject it still surfaces an error toast but never touches local
 * state (nothing to roll back).
 *
 * Motion (shake / static red outline per Requirement 17.6) is a
 * consumer concern: the hook returns `isPending` and `error` so
 * callers can drive `data-*` attributes and CSS accordingly.
 */
export interface UseOptimisticActionArgs<TState> {
  /** Pure function producing the optimistic `next` state from `prev`. */
  apply: (prev: TState) => TState;
  /** The asynchronous server-side commit. Its resolution clears
   * pending; its rejection triggers rollback. */
  commit: () => Promise<unknown>;
  /**
   * Optional custom rollback. When omitted, the hook calls
   * `setLocalState(prev)`. Useful when the server may return partial
   * information that should influence the rolled-back shape.
   */
  rollback?: (prev: TState, next: TState, error: unknown) => TState;
  /** Label used on the error toast. Default: "Action failed. Tap to retry.". */
  retryLabel?: string;
  /** Stable id for the error toast. Default: "optimistic-action-error". */
  errorToastId?: string;
}

export interface UseOptimisticActionResult {
  /** Execute the optimistic action. Safe to await; never throws. */
  run: () => Promise<void>;
  /** True while `commit()` is in flight. */
  isPending: boolean;
  /** Last rejection reason, or `null` if the last run succeeded. */
  error: unknown;
}

const DEFAULT_ERROR_TOAST_ID = 'optimistic-action-error';
const DEFAULT_RETRY_LABEL = 'Action failed. Tap to retry.';

export function useOptimisticAction<TState>(
  localState: TState,
  setLocalState: (next: TState) => void,
  args: UseOptimisticActionArgs<TState>,
): UseOptimisticActionResult {
  const interactivity = useDashboardInteractivitySettings();

  // Keep the latest inputs in a ref so `run` stays stable across
  // renders; consumers can pass inline closures without resubscribing.
  const latestRef = useRef({
    localState,
    setLocalState,
    args,
    optimisticActionsEnabled: interactivity.optimisticActionsEnabled,
  });
  latestRef.current = {
    localState,
    setLocalState,
    args,
    optimisticActionsEnabled: interactivity.optimisticActionsEnabled,
  };

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = useCallback(async (): Promise<void> => {
    const {
      localState: prev,
      setLocalState: setState,
      args: currentArgs,
      optimisticActionsEnabled,
    } = latestRef.current;

    const {
      apply,
      commit,
      rollback,
      retryLabel = DEFAULT_RETRY_LABEL,
      errorToastId = DEFAULT_ERROR_TOAST_ID,
    } = currentArgs;

    let next: TState = prev;
    const shouldApplyOptimistically = optimisticActionsEnabled;

    if (shouldApplyOptimistically) {
      try {
        next = apply(prev);
      } catch (err) {
        // A throwing `apply` is a caller bug, but surface it the same
        // way a failed commit would: visible toast, hook error state.
        setError(err);
        dashboardToastBus.show({
          id: errorToastId,
          label: retryLabel,
          tone: 'danger',
          onUndo: () => {
            void run();
          },
        });
        return;
      }
      setState(next);
    }

    setIsPending(true);
    setError(null);

    try {
      await commit();
      setIsPending(false);
      setError(null);
    } catch (err) {
      setIsPending(false);
      setError(err);

      if (shouldApplyOptimistically) {
        // Roll back: consumer-supplied rollback takes precedence so
        // widgets that track drift (e.g., concurrent edits) can merge
        // partial server state. Otherwise restore the snapshot.
        try {
          const rolledBack = rollback ? rollback(prev, next, err) : prev;
          setState(rolledBack);
        } catch {
          // If rollback itself throws, fall back to the snapshot so
          // the UI does not end up in a half-applied state.
          setState(prev);
        }
      }

      dashboardToastBus.show({
        id: errorToastId,
        label: retryLabel,
        tone: 'danger',
        onUndo: () => {
          void run();
        },
      });
    }
  }, []);

  return { run, isPending, error };
}
