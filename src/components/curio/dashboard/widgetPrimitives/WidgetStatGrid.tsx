import React from 'react';
import type { WidgetSizeInfo } from '../../../../hooks/useWidgetSize';

/**
 * WidgetStatGrid arranges a list of stat children (typically `WidgetStat`
 * instances) into a responsive grid that collapses to fewer columns as the
 * widget shrinks.
 *
 * Widget authors stop hand-coding `grid grid-cols-1 sm:grid-cols-2
 * md:grid-cols-3` combinations per widget. Instead, they pass the
 * `size` info from `useWidgetSize` and the grid picks a sensible column
 * count based on pixel width and caller-supplied bounds.
 */

export interface WidgetStatGridProps {
  /** Required: pass `useWidgetSize(widget)` so layout adapts to size. */
  size: WidgetSizeInfo;
  /** Minimum columns at the narrowest width. Default 1. */
  minColumns?: 1 | 2;
  /** Maximum columns at the widest width. Default 3. */
  maxColumns?: 2 | 3 | 4;
  /** Gap between cells. Default `sm`. */
  gap?: 'xs' | 'sm' | 'md';
  className?: string;
  children?: React.ReactNode;
}

const GAP_CLASS: Record<NonNullable<WidgetStatGridProps['gap']>, string> = {
  xs: 'gap-1',
  sm: 'gap-1.5',
  md: 'gap-2',
};

const GRID_COLUMN_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

const pickColumnCount = (
  size: WidgetSizeInfo,
  minColumns: 1 | 2,
  maxColumns: 2 | 3 | 4,
): 1 | 2 | 3 | 4 => {
  // Width thresholds are chosen so a typical 3-column stat row fits
  // comfortably inside an ~560px wide widget without clipping labels.
  const { pixelWidth } = size;
  let target: number;
  if (pixelWidth >= 640) target = Math.min(maxColumns, 4);
  else if (pixelWidth >= 460) target = Math.min(maxColumns, 3);
  else if (pixelWidth >= 300) target = Math.min(maxColumns, 2);
  else target = 1;
  return Math.max(minColumns, target) as 1 | 2 | 3 | 4;
};

const WidgetStatGridImpl: React.FC<WidgetStatGridProps> = ({
  size,
  minColumns = 1,
  maxColumns = 3,
  gap = 'sm',
  className = '',
  children,
}) => {
  const columns = pickColumnCount(size, minColumns, maxColumns);
  return (
    <div
      data-widget-primitive="stat-grid"
      data-columns={columns}
      className={`grid min-w-0 ${GRID_COLUMN_CLASS[columns]} ${GAP_CLASS[gap]} ${className}`.trim()}
    >
      {children}
    </div>
  );
};

export const WidgetStatGrid = React.memo(WidgetStatGridImpl);
WidgetStatGrid.displayName = 'WidgetStatGrid';

export default WidgetStatGrid;
