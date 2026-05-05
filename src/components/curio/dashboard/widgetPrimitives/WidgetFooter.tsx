import React from 'react';

/**
 * WidgetFooter is the shared "pin this to the bottom" row for widget bodies.
 *
 * The single bug this solves: widgets that render a "flex column with
 * justify-between" and a tall decorative middle block push their action
 * button past the widget's rounded bottom edge at small sizes. That has
 * happened in Music (browse button), AirQuality (bar + guidance), Habits
 * (progress footer), Tasks (completion footer), and others.
 *
 * Rules baked in here:
 *
 * - `shrink-0` so the footer is never squeezed by a middle flex child.
 * - `mt-auto` so the footer sticks to the body bottom even when the
 *   middle column is shorter than the body. This replaces the
 *   `justify-between` pattern that overflows when content exceeds the
 *   body height.
 * - Default `gap-2` stacking for multiple footer rows (e.g. Browse Music
 *   + Connect Spotify).
 * - Optional top border matches the common HabitsWidget / TasksWidget
 *   "progress footer" treatment without repeating its Tailwind.
 *
 * Use WidgetFooter whenever a widget has a button, action row, or summary
 * bar that must live at the bottom of the body. Do not use
 * `justify-between` on the outer body column; let natural flow handle the
 * top section and let WidgetFooter handle the bottom.
 */

export interface WidgetFooterProps {
  /** Vertical gap between stacked footer rows. Default `sm`. */
  gap?: 'none' | 'xs' | 'sm' | 'md';
  /**
   * Draw a 1px top border in `--ether-glass-border` with `pt-3` so the
   * footer reads as a separate row. Matches the pattern used by Habits
   * and Tasks for their progress summaries. Default `false`.
   */
  bordered?: boolean;
  /** Alignment for the footer's main axis. Default `stretch`. */
  align?: 'start' | 'center' | 'end' | 'stretch';
  /** Extra classes. */
  className?: string;
  /** Optional test id. */
  'data-testid'?: string;
  children?: React.ReactNode;
}

const GAP_CLASS: Record<NonNullable<WidgetFooterProps['gap']>, string> = {
  none: '',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-3',
};

const ALIGN_CLASS: Record<NonNullable<WidgetFooterProps['align']>, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

const WidgetFooterImpl: React.FC<WidgetFooterProps> = ({
  gap = 'sm',
  bordered = false,
  align = 'stretch',
  className = '',
  children,
  ...rest
}) => {
  return (
    <div
      data-widget-primitive="footer"
      className={`mt-auto flex shrink-0 flex-col ${GAP_CLASS[gap]} ${ALIGN_CLASS[align]} ${
        bordered ? 'border-t border-[var(--ether-glass-border)] pt-3' : ''
      } ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
};

export const WidgetFooter = React.memo(WidgetFooterImpl);
WidgetFooter.displayName = 'WidgetFooter';

export default WidgetFooter;
