import React from 'react';
import type { WidgetSizeInfo } from '../../../../hooks/useWidgetSize';
import WidgetBody from './WidgetBody';
import WidgetEmptyState from './WidgetEmptyState';
import WidgetHero from './WidgetHero';
import WidgetList from './WidgetList';
import WidgetStatGrid from './WidgetStatGrid';
import WidgetText from './WidgetText';
import WidgetStat from '../WidgetStat';

/**
 * WidgetContent turns a declarative spec object into a fully laid out
 * widget body. The spec is the single edit point for authors of
 * "hero + stats + list + footer" shaped widgets (Astronomy, DateInfo,
 * AirQuality, Health, WorldClock, Stopwatch, Pomodoro, etc.).
 *
 * The primitive decides which sections render based on the widget size
 * class:
 *
 *   tiny     -> hero only (no label/caption if the size is extremely tight).
 *   small    -> hero + one stat + list with tiny count.
 *   medium   -> hero + stat grid + list (computed count).
 *   large    -> hero + stat grid + list + footer.
 *   xlarge   -> everything.
 *
 * Callers can still override the size-driven decisions via the `show`
 * flags in the spec if a specific widget needs different cutoffs.
 *
 * The primitive never invents a scroll area. When a `list` has more items
 * than fit, it relies on `WidgetList`'s "+N more" chip by default. Set
 * `list.scroll: 'y'` on widgets that genuinely want a scrollable region
 * (chat, news, tasks).
 */

export interface WidgetContentStatSpec {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: React.ReactNode;
  id?: string;
}

export interface WidgetContentListSpec<T = unknown> {
  items: readonly T[];
  getKey: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => React.ReactNode;
  approxRowHeight?: number;
  maxItems?: number;
  minItems?: number;
  scroll?: 'none' | 'y';
  emptyLabel?: React.ReactNode;
  emptyState?: React.ReactNode;
  testId?: string;
}

export interface WidgetContentHeroSpec {
  value: React.ReactNode;
  unit?: React.ReactNode;
  label?: React.ReactNode;
  caption?: React.ReactNode;
  align?: 'start' | 'center';
  tone?: 'default' | 'accent';
  testId?: string;
}

export interface WidgetContentEmptySpec {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  variant?: 'empty' | 'loading' | 'error';
}

export interface WidgetContentSpec<ListItem = unknown> {
  hero?: WidgetContentHeroSpec;
  stats?: WidgetContentStatSpec[];
  list?: WidgetContentListSpec<ListItem>;
  footer?: React.ReactNode;
  /**
   * If provided and no other content applies, renders as the entire body.
   * Useful for loading/error states that want the full widget surface.
   */
  empty?: WidgetContentEmptySpec;
  /**
   * Optional per-section overrides of the size-driven visibility rules.
   * Any flag left undefined falls back to the size-class defaults below.
   */
  show?: {
    hero?: boolean;
    stats?: boolean;
    list?: boolean;
    footer?: boolean;
  };
}

export interface WidgetContentProps<ListItem = unknown> {
  size: WidgetSizeInfo;
  spec: WidgetContentSpec<ListItem>;
  className?: string;
}

const defaultShow = (size: WidgetSizeInfo) => {
  switch (size.sizeClass) {
    case 'tiny':
      return { hero: true, stats: false, list: false, footer: false };
    case 'small':
      return { hero: true, stats: true, list: false, footer: false };
    case 'medium':
      return { hero: true, stats: true, list: true, footer: false };
    case 'large':
      return { hero: true, stats: true, list: true, footer: true };
    case 'xlarge':
    default:
      return { hero: true, stats: true, list: true, footer: true };
  }
};

function WidgetContentInner<ListItem>({
  size,
  spec,
  className = '',
}: WidgetContentProps<ListItem>) {
  // Empty-state shortcut: if a spec carries only an empty marker, render
  // it full-body. This is the shared loading/error surface.
  if (spec.empty && !spec.hero && !spec.stats?.length && !spec.list) {
    return (
      <WidgetBody className={className} align="center">
        <WidgetEmptyState
          icon={spec.empty.icon}
          title={spec.empty.title}
          description={spec.empty.description}
          variant={spec.empty.variant}
        />
      </WidgetBody>
    );
  }

  const defaults = defaultShow(size);
  const show = {
    hero: spec.show?.hero ?? defaults.hero,
    stats: spec.show?.stats ?? defaults.stats,
    list: spec.show?.list ?? defaults.list,
    footer: spec.show?.footer ?? defaults.footer,
  };

  const hasHero = show.hero && Boolean(spec.hero);
  const hasStats = show.stats && Boolean(spec.stats && spec.stats.length > 0);
  const hasList = show.list && Boolean(spec.list);
  const hasFooter = show.footer && Boolean(spec.footer);

  return (
    <WidgetBody gap="md" className={className}>
      {hasHero && spec.hero && (
        <WidgetHero
          size={size}
          value={spec.hero.value}
          unit={spec.hero.unit}
          label={spec.hero.label}
          caption={spec.hero.caption}
          align={spec.hero.align}
          tone={spec.hero.tone}
          data-testid={spec.hero.testId}
        />
      )}

      {hasStats && spec.stats && (
        <WidgetStatGrid size={size} minColumns={1} maxColumns={3}>
          {spec.stats.map((stat, index) => (
            <WidgetStat
              key={stat.id ?? (typeof stat.label === 'string' ? stat.label : index)}
              label={stat.label}
              value={stat.value}
              hint={stat.hint}
              accent={stat.accent}
              dense={size.isCompact}
            />
          ))}
        </WidgetStatGrid>
      )}

      {hasList && spec.list && (
        <WidgetList
          items={spec.list.items}
          getKey={spec.list.getKey}
          renderItem={spec.list.renderItem}
          size={size}
          approxRowHeight={spec.list.approxRowHeight}
          maxItems={spec.list.maxItems}
          minItems={spec.list.minItems}
          scroll={spec.list.scroll}
          emptyState={spec.list.emptyState}
          emptyLabel={spec.list.emptyLabel}
          data-testid={spec.list.testId}
        />
      )}

      {hasFooter && spec.footer && (
        <div
          data-widget-primitive="footer"
          className="mt-auto flex min-w-0 items-center justify-between gap-2 pt-1"
        >
          {typeof spec.footer === 'string' ? (
            <WidgetText variant="caption" tone="muted">
              {spec.footer}
            </WidgetText>
          ) : (
            spec.footer
          )}
        </div>
      )}
    </WidgetBody>
  );
}

export const WidgetContent = React.memo(WidgetContentInner) as <ListItem = unknown>(
  props: WidgetContentProps<ListItem>,
) => React.ReactElement;

(WidgetContent as unknown as { displayName?: string }).displayName = 'WidgetContent';

export default WidgetContent;
