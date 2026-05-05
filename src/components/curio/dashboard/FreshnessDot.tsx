import React from 'react';
import { RefreshCw } from 'lucide-react';

import type { FreshnessState } from '../../../services/dashboardRefresh';

export interface FreshnessDotProps {
  /** Current freshness state from `computeFreshnessState`. */
  state: FreshnessState;
  /**
   * When `true`, the `fresh` state renders a pulsing dot. When `false`,
   * every state renders statically (reduced motion / animation off).
   */
  motionEnabled: boolean;
  /** Invoked by the retry chip when state is `error`. */
  onRetry?: () => void;
  className?: string;
}

const DOT_BASE_CLASS =
  'dashboard-widget-freshness-dot inline-block h-1.5 w-1.5 rounded-full';

const stateToClass: Record<FreshnessState, string> = {
  fresh: 'bg-[var(--dashboard-widget-accent,var(--ether-primary))]',
  idle: 'bg-[var(--ether-on-surface-variant)]/40',
  stale: 'bg-amber-500',
  error: 'bg-rose-500',
};

const stateToLabel: Record<FreshnessState, string> = {
  fresh: 'Data fresh',
  idle: 'Data idle',
  stale: 'Data stale',
  error: 'Last refresh failed',
};

/**
 * Small live-status dot rendered inside the WidgetShell's refresh
 * metadata chip.
 *
 * Requirements 20.1 - 20.5:
 *   - `fresh` pulses when `motionEnabled` is true; other states render
 *     statically.
 *   - In `error` state, renders a small retry chip next to the dot.
 */
const FreshnessDot: React.FC<FreshnessDotProps> = ({
  state,
  motionEnabled,
  onRetry,
  className,
}) => {
  const shouldPulse = state === 'fresh' && motionEnabled;
  const dotClassName = [
    DOT_BASE_CLASS,
    stateToClass[state],
    shouldPulse ? 'dashboard-widget-freshness-dot--pulse' : '',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');

  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          data-testid="freshness-dot"
          data-state={state}
          className={dotClassName}
          aria-label={stateToLabel[state]}
          role="img"
        />
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="dashboard-widget-control-button pointer-events-auto h-5 min-h-0 w-5 min-w-0 rounded-full border-0 bg-rose-500/15 p-0 text-rose-500 hover:bg-rose-500/25"
            aria-label="Retry widget refresh"
          >
            <RefreshCw size={10} strokeWidth={2.25} />
          </button>
        )}
      </span>
    );
  }

  return (
    <span
      data-testid="freshness-dot"
      data-state={state}
      className={dotClassName}
      aria-label={stateToLabel[state]}
      role="img"
    />
  );
};

export default FreshnessDot;
