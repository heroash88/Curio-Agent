import React from 'react';
import { useCardTheme } from '../../../../hooks/useCardTheme';
import WidgetText from './WidgetText';

/**
 * WidgetEmptyState is the shared "nothing to show" / "loading" /
 * "something went wrong" panel. Every widget previously hand-rolled its
 * own; this primitive keeps the spacing, wrap behavior, and tone
 * consistent.
 *
 * Pass the icon element, a title string, and an optional description. The
 * primitive takes care of truncation, center alignment, and responsive
 * padding.
 */

export type WidgetEmptyStateVariant = 'empty' | 'loading' | 'error';

export interface WidgetEmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  variant?: WidgetEmptyStateVariant;
  /** Optional footer action (e.g. a retry button). */
  action?: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

const WidgetEmptyStateImpl: React.FC<WidgetEmptyStateProps> = ({
  icon,
  title,
  description,
  variant = 'empty',
  action,
  className = '',
  'data-testid': testId,
}) => {
  const theme = useCardTheme();
  const borderClass =
    variant === 'error'
      ? 'border-[var(--ether-error)]/50'
      : 'border-dashed border-[var(--ether-glass-border)]';

  return (
    <div
      data-widget-primitive="empty-state"
      data-variant={variant}
      data-testid={testId}
      className={`flex h-full min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border ${borderClass} bg-[var(--ether-surface-container-low)] px-3 py-4 text-center ${className}`.trim()}
    >
      {icon && (
        <div className={`shrink-0 opacity-70 ${theme.onSurfaceVariant}`} aria-hidden>
          {icon}
        </div>
      )}
      <WidgetText variant="label" tone="muted" align="center">
        {title}
      </WidgetText>
      {description && (
        <WidgetText variant="caption" tone="muted" align="center" lines={undefined}>
          {description}
        </WidgetText>
      )}
      {action && <div className="mt-1 shrink-0">{action}</div>}
    </div>
  );
};

export const WidgetEmptyState = React.memo(WidgetEmptyStateImpl);
WidgetEmptyState.displayName = 'WidgetEmptyState';

export default WidgetEmptyState;
