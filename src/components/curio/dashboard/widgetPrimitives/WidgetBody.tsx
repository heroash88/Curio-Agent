import React from 'react';

/**
 * WidgetBody is the single, unified container that widget bodies compose into.
 *
 * Guardrails enforced here (so individual widgets do not have to remember them):
 *
 * - min-w-0 + min-h-0 on the flex container so nothing can push a widget
 *   wider than its frame and clip text.
 * - overflow-hidden by default. Widgets that legitimately need scrolling
 *   (chat, news, long lists) must opt in with scroll="y".
 * - Flex column with a caller-controlled gap. Dashboard widgets almost always
 *   stack vertically; this removes the repeated `flex h-full min-h-0 flex-col
 *   gap-2` boilerplate.
 *
 * The shell (`WidgetShell`) already provides outer padding, so WidgetBody
 * never adds its own padding. Authors can still pass `className` for
 * one-off adjustments.
 */

export type WidgetBodyGap =
  | 'none'
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg';

export type WidgetBodyAlign = 'start' | 'center' | 'end' | 'between';

export type WidgetBodyScroll = 'none' | 'y' | 'x';

const GAP_CLASS: Record<WidgetBodyGap, string> = {
  none: '',
  xs: 'gap-1',
  sm: 'gap-1.5',
  md: 'gap-2',
  lg: 'gap-3',
};

const ALIGN_CLASS: Record<WidgetBodyAlign, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
};

const SCROLL_CLASS: Record<WidgetBodyScroll, string> = {
  none: 'overflow-hidden',
  // Matches the existing `dashboard-widget-touch-scroll` pattern used by
  // NewsWidget, MusicWidget, Bookmarks, etc., so touch behavior stays
  // consistent across widgets that legitimately scroll.
  y: 'dashboard-widget-touch-scroll overflow-y-auto overscroll-contain pr-1 [touch-action:pan-y]',
  x: 'overflow-x-auto overscroll-contain [touch-action:pan-x]',
};

export interface WidgetBodyProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'className' | 'children'> {
  /** Vertical gap between body children. Default `md`. */
  gap?: WidgetBodyGap;
  /** Cross-axis or main-axis distribution for the column. Default `start`. */
  align?: WidgetBodyAlign;
  /**
   * Opt into scrolling. Default is `none`, which enforces
   * `overflow-hidden`. Widgets that genuinely need to scroll a long list
   * or transcript can pass `y` or `x`.
   */
  scroll?: WidgetBodyScroll;
  /**
   * Reserve top-right space so widget content cannot run under the
   * 3-dot action menu. Use this when the widget is rendered inside a
   * `bare` or `padded={false}` shell and draws its own chrome at the
   * top. Applied via padding so it composes with the existing flex
   * column. Default `false` to preserve existing layouts.
   */
  actionSafeArea?: boolean;
  /** Extra classes appended to the container. */
  className?: string;
  /** Optional test id, mirrors existing widget list containers. */
  'data-testid'?: string;
  children?: React.ReactNode;
}

const WidgetBodyImpl: React.FC<WidgetBodyProps> = ({
  gap = 'md',
  align = 'start',
  scroll = 'none',
  actionSafeArea = false,
  className = '',
  children,
  ...rest
}) => {
  return (
    <div
      data-widget-primitive="body"
      data-scroll={scroll}
      data-action-safe-area={actionSafeArea ? 'true' : undefined}
      className={`flex h-full min-h-0 min-w-0 flex-1 flex-col ${GAP_CLASS[gap]} ${ALIGN_CLASS[align]} ${SCROLL_CLASS[scroll]} ${
        actionSafeArea ? 'pr-10 sm:pr-12' : ''
      } ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
};

export const WidgetBody = React.memo(WidgetBodyImpl);
WidgetBody.displayName = 'WidgetBody';

export default WidgetBody;
