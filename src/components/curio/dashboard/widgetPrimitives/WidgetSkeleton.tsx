import React from 'react';

import { useMotionProfile } from '../../../../hooks/useMotionProfile';

/**
 * WidgetSkeleton renders a neutral, layout-matching placeholder while a
 * widget is in its first-load state. The variants below cover the
 * shapes that recur across the dashboard; `custom` lets a widget supply
 * its own block layout but still inherit the shared shimmer + token
 * styling via the wrapper.
 *
 * Guardrails baked in here:
 *
 * - Outer dimensions are `w-full h-full` so the skeleton always occupies
 *   the same bounding box as `WidgetBody` for a given `frameInfo`
 *   (Requirement 18.5).
 * - Placeholder blocks use `bg-[var(--ether-control-bg)]` so they read as
 *   neutral scaffolding in every theme.
 * - When `useMotionProfile().shouldAnimate === false`, the shimmer layer
 *   is omitted but the block layout still renders so the skeleton
 *   continues to reserve the right footprint (Requirement 18.4).
 */

export type WidgetSkeletonVariant =
  | 'stat'
  | 'list'
  | 'chart'
  | 'grid'
  | 'hero'
  | 'custom';

export interface WidgetSkeletonProps {
  /** Visual layout strategy. Default `stat`. */
  variant?: WidgetSkeletonVariant;
  /**
   * Number of rows to render for `list` and `grid` variants. Ignored by
   * other variants. Defaults to `4`.
   */
  rows?: number;
  /**
   * Custom placeholder content, rendered inside the shimmer wrapper when
   * `variant === 'custom'`.
   */
  children?: React.ReactNode;
  /** Extra classes appended to the outer wrapper. */
  className?: string;
  /** Optional test id. */
  'data-testid'?: string;
}

const BLOCK = 'bg-[var(--ether-control-bg)] rounded-md';

const clampRows = (rows: number | undefined, fallback: number): number => {
  const resolved = typeof rows === 'number' && Number.isFinite(rows) ? rows : fallback;
  return Math.max(1, Math.min(12, Math.round(resolved)));
};

const StatVariant: React.FC = () => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-2">
    <div className={`${BLOCK} h-8 w-24`} />
    <div className={`${BLOCK} h-3 w-16 opacity-70`} />
  </div>
);

const ListVariant: React.FC<{ rows: number }> = ({ rows }) => (
  <div className="flex h-full w-full flex-col gap-2">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className={`${BLOCK} h-7 w-full`} />
    ))}
  </div>
);

const ChartVariant: React.FC = () => (
  <div className="flex h-full w-full items-end gap-1.5">
    {[0.45, 0.72, 0.35, 0.6, 0.88, 0.5, 0.78, 0.42, 0.65].map((h, i) => (
      <div
        key={i}
        className={`${BLOCK} flex-1`}
        style={{ height: `${Math.round(h * 100)}%` }}
      />
    ))}
  </div>
);

const GridVariant: React.FC<{ rows: number }> = ({ rows }) => {
  // Render rows x rows tiles; caller passes the axis count through `rows`.
  const n = clampRows(rows, 3);
  const tiles = n * n;
  return (
    <div
      className="grid h-full w-full gap-2"
      style={{
        gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${n}, minmax(0, 1fr))`,
      }}
    >
      {Array.from({ length: tiles }).map((_, i) => (
        <div key={i} className={`${BLOCK} h-full w-full`} />
      ))}
    </div>
  );
};

const HeroVariant: React.FC = () => (
  <div className="flex h-full w-full items-center justify-center">
    <div className={`${BLOCK} h-full w-full`} />
  </div>
);

const renderVariant = (
  variant: WidgetSkeletonVariant,
  rows: number,
  children: React.ReactNode,
): React.ReactNode => {
  switch (variant) {
    case 'list':
      return <ListVariant rows={rows} />;
    case 'chart':
      return <ChartVariant />;
    case 'grid':
      return <GridVariant rows={rows} />;
    case 'hero':
      return <HeroVariant />;
    case 'custom':
      return children ?? null;
    case 'stat':
    default:
      return <StatVariant />;
  }
};

const WidgetSkeletonImpl: React.FC<WidgetSkeletonProps> = ({
  variant = 'stat',
  rows,
  children,
  className = '',
  'data-testid': testId,
}) => {
  const motionProfile = useMotionProfile();
  const shouldAnimate = motionProfile.shouldAnimate;
  const resolvedRows = clampRows(rows, variant === 'grid' ? 3 : 4);

  const shimmerClass = shouldAnimate
    ? 'after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.18)_50%,transparent_100%)] after:bg-[length:200%_100%] after:animate-[shimmer_1.8s_ease-in-out_infinite]'
    : '';

  return (
    <div
      data-widget-primitive="skeleton"
      data-variant={variant}
      data-animate={shouldAnimate ? 'true' : 'false'}
      data-testid={testId}
      aria-hidden="true"
      className={`relative h-full w-full min-h-0 min-w-0 overflow-hidden ${shimmerClass} ${className}`.trim()}
    >
      {renderVariant(variant, resolvedRows, children)}
    </div>
  );
};

export const WidgetSkeleton = React.memo(WidgetSkeletonImpl);
WidgetSkeleton.displayName = 'WidgetSkeleton';

export default WidgetSkeleton;
