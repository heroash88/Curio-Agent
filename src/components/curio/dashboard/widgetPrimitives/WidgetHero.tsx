import React from 'react';
import type { WidgetSizeInfo } from '../../../../hooks/useWidgetSize';
import FitText from './FitText';
import WidgetText from './WidgetText';

/**
 * WidgetHero is the "one big thing" block used by weather temp, air
 * quality index, clocks, countdowns, portfolio totals, and similar
 * widgets. It renders a large auto-fit value with an optional unit, label
 * above, and caption below.
 *
 * The primitive uses `FitText` internally so the value never clips and
 * widgets stop maintaining `text-4xl sm:text-6xl lg:text-7xl` ladders.
 * Font size bounds are derived from the widget size class unless the
 * caller overrides them.
 */

export interface WidgetHeroProps {
  /** Required: widget size info for adaptive sizing. */
  size: WidgetSizeInfo;
  /** The big number or string (e.g. "72°F", "13:42", "$12,480"). */
  value: React.ReactNode;
  /** Optional small unit baseline-aligned next to the value. */
  unit?: React.ReactNode;
  /** Optional label rendered above the value. */
  label?: React.ReactNode;
  /** Optional supporting caption rendered below. */
  caption?: React.ReactNode;
  /** Alignment. Default `start`. */
  align?: 'start' | 'center';
  /** Explicit min/max font size (rem). Overrides size-class defaults. */
  minRem?: number;
  maxRem?: number;
  /** Tone applied to the value. Default `default`. */
  tone?: 'default' | 'accent';
  className?: string;
  'data-testid'?: string;
}

const getHeroBounds = (size: WidgetSizeInfo): { min: number; max: number } => {
  switch (size.sizeClass) {
    case 'tiny':
      return { min: 1.25, max: 2 };
    case 'small':
      return { min: 1.5, max: 2.75 };
    case 'medium':
      return { min: 1.75, max: 3.75 };
    case 'large':
      return { min: 2, max: 5 };
    case 'xlarge':
    default:
      return { min: 2.25, max: 6 };
  }
};

const WidgetHeroImpl: React.FC<WidgetHeroProps> = ({
  size,
  value,
  unit,
  label,
  caption,
  align = 'start',
  minRem,
  maxRem,
  tone = 'default',
  className = '',
  'data-testid': testId,
}) => {
  const bounds = getHeroBounds(size);
  const min = minRem ?? bounds.min;
  const max = maxRem ?? bounds.max;
  const alignClass = align === 'center' ? 'items-center text-center' : 'items-start text-left';
  const valueToneClass =
    tone === 'accent'
      ? 'text-[var(--dashboard-widget-accent,var(--ether-sky))]'
      : 'text-[var(--ether-on-surface)]';

  return (
    <div
      data-widget-primitive="hero"
      data-testid={testId}
      className={`flex min-w-0 flex-col gap-1 ${alignClass} ${className}`.trim()}
    >
      {label && (
        <WidgetText variant="label" align={align === 'center' ? 'center' : 'start'}>
          {label}
        </WidgetText>
      )}
      <div
        className={`flex min-w-0 items-baseline gap-1.5 ${
          align === 'center' ? 'justify-center' : 'justify-start'
        }`}
      >
        <FitText
          min={min}
          max={max}
          className={`font-bold tabular-nums tracking-tight ${valueToneClass}`}
        >
          {value}
        </FitText>
        {unit && (
          <span
            className="shrink-0 whitespace-nowrap text-[0.6em] font-bold uppercase tracking-[0.1em] text-[var(--ether-on-surface-variant)]"
            aria-hidden={typeof unit === 'string' ? undefined : true}
          >
            {unit}
          </span>
        )}
      </div>
      {caption && (
        <WidgetText variant="caption" tone="muted" align={align === 'center' ? 'center' : 'start'}>
          {caption}
        </WidgetText>
      )}
    </div>
  );
};

export const WidgetHero = React.memo(WidgetHeroImpl);
WidgetHero.displayName = 'WidgetHero';

export default WidgetHero;
