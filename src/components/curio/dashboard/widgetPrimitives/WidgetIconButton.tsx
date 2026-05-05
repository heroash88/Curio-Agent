import React, { forwardRef, useEffect } from 'react';

/**
 * WidgetIconButton is the shared, accessibility-safe icon button used by
 * widgets for in-card icon controls (Requirement 27).
 *
 * Guardrails baked in here:
 *
 * - 44px minimum touch target by default so kiosk and tablet users can
 *   tap accurately. A container-query variant relaxes to 36px when the
 *   button is placed in a container narrower than 200px, matching the
 *   design's "compact widget body" carve-out.
 * - Standard focus ring and a small set of tonal variants (`default`,
 *   `primary`, `danger`) wired to the existing dashboard tokens.
 * - Dev-mode warning when `ariaLabel` is missing/empty so missing labels
 *   are caught before they ship.
 *
 * All native `<button>` props (onClick, disabled, type, ...) are
 * forwarded. Consumers pass the icon as a node through the `icon` prop;
 * children are intentionally not accepted because this primitive always
 * renders an icon-only button.
 */

export type WidgetIconButtonTone = 'default' | 'danger' | 'primary';

export interface WidgetIconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The icon node (typically a lucide-react icon). */
  icon: React.ReactNode;
  /**
   * Required accessible name for the button. A development-mode warning
   * fires when this is missing or empty.
   */
  ariaLabel: string;
  /** Visual tone. Default `default`. */
  tone?: WidgetIconButtonTone;
  /**
   * When `true`, the button starts at the relaxed 36px minimum instead of
   * 44px. Container-query relaxation still applies. Default `false`.
   */
  compact?: boolean;
}

const BASE_CLASSES =
  // Standard dashboard icon-button chrome (matches dashboard-widget-control-button).
  'relative inline-flex items-center justify-center rounded-full border transition-all ' +
  // Focus ring
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ether-primary)]/35 focus-visible:ring-offset-0 ' +
  // Disabled state
  'disabled:cursor-not-allowed disabled:opacity-40';

const TONE_CLASSES: Record<WidgetIconButtonTone, string> = {
  default:
    'border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]',
  primary:
    'border-[var(--ether-primary)]/30 bg-[var(--ether-primary)]/15 text-[var(--ether-on-surface)] hover:bg-[var(--ether-primary)]/25',
  danger:
    'border-[var(--ether-error)]/25 bg-[var(--ether-error)]/10 text-[var(--ether-error)] hover:bg-[var(--ether-error)]/20',
};

// Tailwind 4 arbitrary container variant. When the button is placed inside
// an ancestor with `container-type: inline-size`, this relaxes the target
// size to 36px in narrow widget bodies. When no container ancestor is
// declared, the variant is inert and the 44px default stands.
const SIZE_CLASSES_DEFAULT =
  'min-w-[44px] min-h-[44px] [@container(width<200px)]:min-w-[36px] [@container(width<200px)]:min-h-[36px]';
const SIZE_CLASSES_COMPACT =
  'min-w-[36px] min-h-[36px] [@container(width<200px)]:min-w-[36px] [@container(width<200px)]:min-h-[36px]';

const WidgetIconButtonImpl = forwardRef<
  HTMLButtonElement,
  WidgetIconButtonProps
>(function WidgetIconButton(
  {
    icon,
    ariaLabel,
    tone = 'default',
    compact = false,
    className = '',
    type = 'button',
    ...rest
  },
  ref,
) {
  useEffect(() => {
    if (import.meta.env.DEV && (!ariaLabel || ariaLabel.trim().length === 0)) {
      // eslint-disable-next-line no-console
      console.warn(
        '[WidgetIconButton] ariaLabel is required and must be non-empty. ' +
          'Every icon-only button needs an accessible name.',
      );
    }
  }, [ariaLabel]);

  const sizeClasses = compact ? SIZE_CLASSES_COMPACT : SIZE_CLASSES_DEFAULT;

  return (
    <button
      ref={ref}
      type={type}
      aria-label={ariaLabel}
      data-widget-primitive="icon-button"
      data-tone={tone}
      data-compact={compact ? 'true' : 'false'}
      className={`${BASE_CLASSES} ${TONE_CLASSES[tone]} ${sizeClasses} ${className}`.trim()}
      {...rest}
    >
      <span aria-hidden="true" className="inline-flex items-center justify-center">
        {icon}
      </span>
    </button>
  );
});

export const WidgetIconButton = React.memo(WidgetIconButtonImpl);
WidgetIconButton.displayName = 'WidgetIconButton';

export default WidgetIconButton;
