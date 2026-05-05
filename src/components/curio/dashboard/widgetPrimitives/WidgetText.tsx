import React from 'react';
import { useCardTheme } from '../../../../hooks/useCardTheme';

/**
 * WidgetText is the unified typography primitive for widget bodies.
 *
 * Each variant has a single source of truth for font size, weight, color,
 * and wrap/truncate behavior, so widgets stop re-inventing `text-[10px]
 * font-bold uppercase tracking-[0.1em]` rows and `truncate text-sm ...`
 * values.
 *
 * Variants:
 *  - `title`: the widget-internal section heading (distinct from the
 *    WidgetShell title). Truncates with a tooltip fallback.
 *  - `label`: the small uppercase label used on stats and metadata. Always
 *    truncates so long translations never push siblings off-screen.
 *  - `value`: right-aligned numeric value. Uses `tabular-nums` and
 *    `whitespace-nowrap` because numbers should shrink, never wrap.
 *  - `body`: paragraph text, wraps naturally, optional `lines` clamp to a
 *    maximum number of lines (1-5).
 *  - `caption`: the small supporting text under a hero or stat.
 *
 * All variants apply `min-w-0` behavior by being span/div elements safe to
 * drop into flex rows; callers wrap them in `min-w-0 flex-1` containers
 * where truncation should happen.
 */

export type WidgetTextVariant = 'title' | 'label' | 'value' | 'body' | 'caption';

export type WidgetTextTone = 'default' | 'muted' | 'faint' | 'accent';

export type WidgetTextAlign = 'start' | 'center' | 'end';

export interface WidgetTextProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children'> {
  variant?: WidgetTextVariant;
  tone?: WidgetTextTone;
  align?: WidgetTextAlign;
  /** Render as a different element. Defaults match the variant. */
  as?: 'span' | 'div' | 'p' | 'strong' | 'h2' | 'h3';
  /** For `body` only: clamp the text to N lines. 1 = truncate single line. */
  lines?: 1 | 2 | 3 | 4 | 5;
  /**
   * If true, even title/label variants honor a hover title attribute so the
   * full string can be revealed. Applied automatically when children is a
   * plain string. Set to false to disable.
   */
  showTitle?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const ALIGN_CLASS: Record<WidgetTextAlign, string> = {
  start: 'text-left',
  center: 'text-center',
  end: 'text-right',
};

const LINE_CLAMP_CLASS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'truncate',
  2: 'line-clamp-2 [overflow-wrap:anywhere]',
  3: 'line-clamp-3 [overflow-wrap:anywhere]',
  4: 'line-clamp-4 [overflow-wrap:anywhere]',
  5: 'line-clamp-5 [overflow-wrap:anywhere]',
};

const getToneClass = (
  tone: WidgetTextTone,
  theme: ReturnType<typeof useCardTheme>,
): string => {
  switch (tone) {
    case 'muted':
      return theme.onSurfaceVariant;
    case 'faint':
      return theme.faint;
    case 'accent':
      return 'text-[var(--dashboard-widget-accent,var(--ether-sky))]';
    default:
      return theme.onSurface;
  }
};

const variantDefaults: Record<
  WidgetTextVariant,
  { element: WidgetTextProps['as']; className: string; tone: WidgetTextTone }
> = {
  title: {
    element: 'h3',
    className:
      'min-w-0 max-w-full truncate text-[13px] font-bold leading-[1.25] tracking-[0.02em]',
    tone: 'default',
  },
  label: {
    element: 'span',
    className:
      'min-w-0 max-w-full truncate text-[10px] font-bold uppercase leading-[1.35] tracking-[0.14em]',
    tone: 'muted',
  },
  value: {
    element: 'span',
    className:
      'shrink-0 whitespace-nowrap text-sm font-bold tabular-nums leading-[1.2]',
    tone: 'default',
  },
  body: {
    element: 'p',
    className: 'min-w-0 max-w-full text-[12px] leading-[1.4]',
    tone: 'default',
  },
  caption: {
    element: 'span',
    className:
      'min-w-0 max-w-full truncate text-[11px] leading-[1.3]',
    tone: 'muted',
  },
};

const WidgetTextImpl: React.FC<WidgetTextProps> = ({
  variant = 'body',
  tone,
  align,
  as,
  lines,
  showTitle,
  className = '',
  children,
  ...rest
}) => {
  const theme = useCardTheme();
  const preset = variantDefaults[variant];
  const Tag = (as ?? preset.element ?? 'span') as React.ElementType;
  const effectiveTone = tone ?? preset.tone;
  const alignClass = align ? ALIGN_CLASS[align] : '';

  // Only body uses a multi-line clamp; other variants always truncate or
  // control their own wrap.
  const clampClass =
    variant === 'body' && lines
      ? LINE_CLAMP_CLASS[lines]
      : variant === 'body'
        ? '[overflow-wrap:anywhere]'
        : '';

  // Attach a native tooltip for variants that always truncate so long strings
  // stay readable on hover.
  const shouldSetTitle =
    (showTitle ?? true) &&
    (variant === 'title' || variant === 'label' || variant === 'caption') &&
    typeof children === 'string';
  const titleAttr = shouldSetTitle ? (children as string) : undefined;

  return (
    <Tag
      data-widget-primitive="text"
      data-variant={variant}
      title={titleAttr}
      className={`${preset.className} ${getToneClass(effectiveTone, theme)} ${alignClass} ${clampClass} ${className}`.trim()}
      {...rest}
    >
      {children}
    </Tag>
  );
};

export const WidgetText = React.memo(WidgetTextImpl);
WidgetText.displayName = 'WidgetText';

export default WidgetText;
