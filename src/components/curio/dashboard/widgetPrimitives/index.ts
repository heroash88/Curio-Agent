/**
 * Shared dashboard widget primitives.
 *
 * These components are the "unified content kit" for dashboard widgets.
 * Widget authors compose them instead of hand-rolling flex/grid/scroll
 * trees so the dashboard keeps consistent guardrails:
 *
 * - No hidden scroll. `WidgetBody` defaults to `overflow: hidden`; widgets
 *   opt in to `scroll="y"` only when genuinely needed.
 * - No text cutoffs. `WidgetText` variants pick the right truncate or
 *   line-clamp treatment, and `FitText`/`WidgetHero` auto-shrink big
 *   numbers before they clip.
 * - No runaway wide boxes. `WidgetStatGrid` collapses columns as the
 *   widget narrows instead of overflowing, and every primitive enforces
 *   `min-w-0`/`min-h-0` so flex rows behave.
 * - Declarative shape. `WidgetContent` accepts a `WidgetContentSpec`
 *   object so widgets with "hero + stats + list + footer" surfaces
 *   describe *what* to show while the primitive decides *how it fits*.
 *
 * See `docs/dashboard.md` (Authoring new widgets) for the full guide.
 */

export { default as WidgetBody } from './WidgetBody';
export type {
  WidgetBodyAlign,
  WidgetBodyGap,
  WidgetBodyProps,
  WidgetBodyScroll,
} from './WidgetBody';

export { default as WidgetText } from './WidgetText';
export type {
  WidgetTextAlign,
  WidgetTextProps,
  WidgetTextTone,
  WidgetTextVariant,
} from './WidgetText';

export { default as FitText } from './FitText';
export type { FitTextProps } from './FitText';

export { default as WidgetHero } from './WidgetHero';
export type { WidgetHeroProps } from './WidgetHero';

export { default as WidgetStatGrid } from './WidgetStatGrid';
export type { WidgetStatGridProps } from './WidgetStatGrid';

export { default as WidgetList } from './WidgetList';
export type { WidgetListProps } from './WidgetList';

export { default as WidgetEmptyState } from './WidgetEmptyState';
export type {
  WidgetEmptyStateProps,
  WidgetEmptyStateVariant,
} from './WidgetEmptyState';

export { default as WidgetFooter } from './WidgetFooter';
export type { WidgetFooterProps } from './WidgetFooter';

export { default as WidgetContent } from './WidgetContent';
export type {
  WidgetContentEmptySpec,
  WidgetContentHeroSpec,
  WidgetContentListSpec,
  WidgetContentProps,
  WidgetContentSpec,
  WidgetContentStatSpec,
} from './WidgetContent';

export { default as WidgetCounter } from './WidgetCounter';
export type { WidgetCounterMode, WidgetCounterProps } from './WidgetCounter';

export { default as WidgetSkeleton } from './WidgetSkeleton';
export type {
  WidgetSkeletonProps,
  WidgetSkeletonVariant,
} from './WidgetSkeleton';

export { default as WidgetInlineError } from './WidgetInlineError';
export type { WidgetInlineErrorProps } from './WidgetInlineError';

export { default as WidgetIconButton } from './WidgetIconButton';
export type {
  WidgetIconButtonProps,
  WidgetIconButtonTone,
} from './WidgetIconButton';

export { default as InlineQuickAdd } from './InlineQuickAdd';
export type { InlineQuickAddProps } from './InlineQuickAdd';

export { default as DragReorderHandle } from './DragReorderHandle';
export type { DragReorderHandleProps } from './DragReorderHandle';
