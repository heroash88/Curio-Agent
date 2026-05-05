import React, { useMemo } from 'react';
import type { WidgetSizeInfo } from '../../../../hooks/useWidgetSize';
import WidgetBody from './WidgetBody';
import WidgetText from './WidgetText';

/**
 * WidgetList renders a vertical list of items without surprising scroll.
 *
 * Widget authors repeatedly re-implement "show as many items as fit, drop
 * the rest, show a `+N more` chip". This primitive does it once.
 *
 * Default behavior: estimate how many rows fit based on the widget's
 * `pixelHeight` and an `approxRowHeight`, render that many items, and show
 * a `+N more` pill when items were dropped. Authors who want scrolling
 * instead can pass `scroll="y"` and the primitive turns into a scroll
 * container with the shared `dashboard-widget-touch-scroll` pattern.
 */

export interface WidgetListProps<T> {
  /** The full item list. */
  items: readonly T[];
  /**
   * Render function for a single item. Receives the item and its index.
   * The returned node is expected to be a row-level element; authors may
   * apply their own row chrome (backgrounds, borders, icons).
   */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** React key extractor. Items are lists, keys matter. */
  getKey: (item: T, index: number) => string | number;
  /**
   * Required: pass `useWidgetSize(widget)` so the primitive can estimate
   * how many rows fit.
   */
  size: WidgetSizeInfo;
  /**
   * Approximate row height in pixels used to compute how many items fit
   * without scrolling. Default 44.
   */
  approxRowHeight?: number;
  /**
   * Reserve space (in pixels) above/below the list for headers, empty
   * states, or a "more" chip. Subtracted from the available height before
   * computing row count. Default 40.
   */
  reservedHeight?: number;
  /**
   * Hard ceiling on how many items render, regardless of computed fit.
   * Use for widgets that should not list beyond N even when the widget is
   * huge (e.g. "upcoming 10 tasks"). Default: no cap.
   */
  maxItems?: number;
  /**
   * Minimum items to attempt rendering even on tiny widgets. Default 1.
   */
  minItems?: number;
  /** Gap between items. Default `sm`. */
  gap?: 'none' | 'xs' | 'sm' | 'md';
  /** Scroll behavior. Default `none`: drop overflow and show `+N more`. */
  scroll?: 'none' | 'y';
  /**
   * Node rendered when `items` is empty. If omitted, a default muted
   * "No items" row is rendered so every widget behaves the same way.
   */
  emptyState?: React.ReactNode;
  /**
   * Label used in the default empty state. Ignored when `emptyState` is
   * supplied. Default "No items".
   */
  emptyLabel?: React.ReactNode;
  /**
   * Label used in the "more" chip. Receives the overflow count.
   * Default `(n) => \`+${n} more\``.
   */
  renderMore?: (overflowCount: number) => React.ReactNode;
  /** Extra classes on the list container. */
  className?: string;
  'data-testid'?: string;
}

const GAP_CLASS: Record<NonNullable<WidgetListProps<unknown>['gap']>, string> = {
  none: '',
  xs: 'gap-1',
  sm: 'gap-1.5',
  md: 'gap-2',
};

function computeVisibleCount<T>(
  items: readonly T[],
  size: WidgetSizeInfo,
  approxRowHeight: number,
  reservedHeight: number,
  minItems: number,
  maxItems?: number,
): number {
  if (items.length === 0) return 0;
  const availableHeight = Math.max(0, size.pixelHeight - reservedHeight);
  const rawCount = approxRowHeight > 0
    ? Math.floor(availableHeight / approxRowHeight)
    : items.length;
  const bounded = Math.max(minItems, Math.min(items.length, rawCount || minItems));
  if (typeof maxItems === 'number') {
    return Math.min(bounded, Math.max(minItems, maxItems));
  }
  return bounded;
}

function WidgetListInner<T>({
  items,
  renderItem,
  getKey,
  size,
  approxRowHeight = 44,
  reservedHeight = 40,
  maxItems,
  minItems = 1,
  gap = 'sm',
  scroll = 'none',
  emptyState,
  emptyLabel = 'No items',
  renderMore = (count: number) => `+${count} more`,
  className = '',
  'data-testid': testId,
}: WidgetListProps<T>) {
  const visibleCount = useMemo(
    () =>
      scroll === 'y'
        ? (typeof maxItems === 'number' ? Math.min(maxItems, items.length) : items.length)
        : computeVisibleCount(
            items,
            size,
            approxRowHeight,
            reservedHeight,
            minItems,
            maxItems,
          ),
    [
      items,
      size,
      approxRowHeight,
      reservedHeight,
      minItems,
      maxItems,
      scroll,
    ],
  );

  if (items.length === 0) {
    return (
      <div
        data-widget-primitive="list"
        data-empty="true"
        data-testid={testId}
        className={`flex min-h-0 flex-1 items-center justify-center ${className}`.trim()}
      >
        {emptyState ?? <WidgetText variant="caption">{emptyLabel}</WidgetText>}
      </div>
    );
  }

  const visibleItems = items.slice(0, visibleCount);
  const overflowCount = items.length - visibleItems.length;

  const rows = (
    <>
      {visibleItems.map((item, index) => (
        <React.Fragment key={getKey(item, index)}>
          {renderItem(item, index)}
        </React.Fragment>
      ))}
      {overflowCount > 0 && scroll === 'none' && (
        <div
          data-widget-primitive="list-overflow"
          className="flex items-center justify-center rounded-lg border border-dashed border-[var(--ether-glass-border)] px-2 py-1"
        >
          <WidgetText variant="caption" tone="muted">
            {renderMore(overflowCount)}
          </WidgetText>
        </div>
      )}
    </>
  );

  if (scroll === 'y') {
    return (
      <WidgetBody
        gap={gap === 'none' ? 'none' : gap === 'xs' ? 'xs' : gap === 'sm' ? 'sm' : 'md'}
        scroll="y"
        className={className}
        data-testid={testId}
      >
        {rows}
      </WidgetBody>
    );
  }

  return (
    <div
      data-widget-primitive="list"
      data-testid={testId}
      className={`flex min-h-0 min-w-0 flex-col ${GAP_CLASS[gap]} ${className}`.trim()}
    >
      {rows}
    </div>
  );
}

export const WidgetList = React.memo(WidgetListInner) as <T>(
  props: WidgetListProps<T>,
) => React.ReactElement;

(WidgetList as unknown as { displayName?: string }).displayName = 'WidgetList';

export default WidgetList;
