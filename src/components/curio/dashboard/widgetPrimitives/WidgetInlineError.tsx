import React, { useCallback } from 'react';
import { AlertTriangle, RefreshCcw, Settings } from 'lucide-react';

import { getDashboardRefreshEventName } from '../../../../services/dashboardRefresh';

/**
 * WidgetInlineError is the shared inline error panel rendered inside a
 * widget body when a refresh or action fails.
 *
 * Behavior:
 *
 * - Retry: if `onRetry` is provided, it is called. Otherwise, when a
 *   `widgetId` is supplied, the component dispatches a `CustomEvent`
 *   named `getDashboardRefreshEventName(widgetId)` on `window` so the
 *   widget's existing refresh listener fires (Requirement 21.3).
 * - Open Settings: the button only renders when `onOpenSettings` is
 *   provided; clicking it calls that callback. This keeps the primitive
 *   agnostic about how settings panels are opened (Requirement 21.4).
 * - Visual: uses the shared `--ether-error` token surface at 10% tint
 *   plus a 20% border tint so the panel reads as danger without looking
 *   garish on any theme.
 *
 * The primitive is intentionally compact. Widgets that want a larger
 * treatment can pass `compact={false}`; by default the panel is sized to
 * live inside a single widget body without taking over the layout.
 */

export interface WidgetInlineErrorProps {
  /** Human-readable error message. */
  message: string;
  /**
   * The widget's id. Required to dispatch the default refresh event when
   * `onRetry` is not supplied.
   */
  widgetId?: string;
  /**
   * Overrides the default refresh-dispatch behavior. When provided,
   * clicking Retry calls this callback instead of dispatching the
   * refresh event.
   */
  onRetry?: () => void;
  /**
   * Called when the user clicks "Settings". When omitted, the button is
   * not rendered.
   */
  onOpenSettings?: () => void;
  /**
   * Compact presentation shrinks padding and icon sizes so the panel
   * fits in small widget bodies. Default `false`.
   */
  compact?: boolean;
  /** Optional extra classes. */
  className?: string;
  /** Optional test id. */
  'data-testid'?: string;
}

const dispatchRefreshEvent = (widgetId: string): void => {
  if (typeof window === 'undefined') return;
  if (typeof window.CustomEvent !== 'function') return;
  try {
    const name = getDashboardRefreshEventName(widgetId);
    window.dispatchEvent(new window.CustomEvent(name, { detail: { widgetId } }));
  } catch {
    // Dispatch must never break the error surface.
  }
};

const WidgetInlineErrorImpl: React.FC<WidgetInlineErrorProps> = ({
  message,
  widgetId,
  onRetry,
  onOpenSettings,
  compact = false,
  className = '',
  'data-testid': testId,
}) => {
  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry();
      return;
    }
    if (widgetId) {
      dispatchRefreshEvent(widgetId);
    }
  }, [onRetry, widgetId]);

  const canRetry = Boolean(onRetry) || Boolean(widgetId);
  const iconSize = compact ? 12 : 14;
  const pad = compact ? 'px-2.5 py-2' : 'px-3 py-2.5';
  const textSize = compact ? 'text-[11px]' : 'text-xs';

  return (
    <div
      data-widget-primitive="inline-error"
      data-compact={compact ? 'true' : 'false'}
      data-testid={testId}
      role="alert"
      className={`flex w-full min-w-0 flex-col gap-2 rounded-2xl border border-[var(--ether-error)]/20 bg-[var(--ether-error)]/10 ${pad} text-[var(--ether-error)] ${className}`.trim()}
    >
      <div className="flex min-w-0 items-start gap-2">
        <AlertTriangle
          size={iconSize + 2}
          className="mt-[1px] shrink-0"
          aria-hidden="true"
        />
        <div className={`min-w-0 flex-1 ${textSize} leading-snug break-words`}>
          {message}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-6">
        {canRetry && (
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--ether-error)]/25 bg-[var(--ether-error)]/15 px-2.5 py-1 text-[11px] font-medium text-[var(--ether-error)] transition hover:bg-[var(--ether-error)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ether-error)]/40"
          >
            <RefreshCcw size={iconSize} aria-hidden="true" />
            <span>Retry</span>
          </button>
        )}
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--ether-glass-border)] bg-transparent px-2.5 py-1 text-[11px] font-medium text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ether-primary)]/35"
          >
            <Settings size={iconSize} aria-hidden="true" />
            <span>Settings</span>
          </button>
        )}
      </div>
    </div>
  );
};

export const WidgetInlineError = React.memo(WidgetInlineErrorImpl);
WidgetInlineError.displayName = 'WidgetInlineError';

export default WidgetInlineError;
