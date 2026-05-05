import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * FitText renders a piece of text that auto-shrinks to fit its container.
 *
 * Used for hero numbers and countdowns where the widget size changes but the
 * content should never clip. Authors declare a minimum and maximum font
 * size in `rem` units, and FitText measures the rendered text against its
 * parent width using a ResizeObserver, stepping down the font size until
 * it fits.
 *
 * Primitives built on top (WidgetHero) consume this so widgets do not need
 * to hand-roll `text-4xl sm:text-5xl lg:text-6xl` responsive ladders.
 */

export interface FitTextProps {
  children: React.ReactNode;
  /** Minimum font size in rem. Default 1.125 (~18px). */
  min?: number;
  /** Maximum font size in rem. Default 4.5 (~72px). */
  max?: number;
  /** Step size in rem when shrinking. Default 0.125. */
  step?: number;
  /** Maximum number of lines before shrinking kicks in. Default 1. */
  maxLines?: 1 | 2;
  /** Element tag. Default `span`. */
  as?: 'span' | 'div' | 'strong' | 'h2' | 'h3';
  className?: string;
  /** Optional explicit height constraint in px, used when vertical room is tight. */
  availableHeight?: number;
}

// Use useLayoutEffect on the client and useEffect on the server (SSR-safe).
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const FitTextImpl: React.FC<FitTextProps> = ({
  children,
  min = 1.125,
  max = 4.5,
  step = 0.125,
  maxLines = 1,
  as: Tag = 'span',
  className = '',
  availableHeight,
}) => {
  const containerRef = useRef<HTMLElement | null>(null);
  const [fontSize, setFontSize] = useState<number>(max);

  const clampedMin = Math.max(0.5, Math.min(min, max));
  const clampedMax = Math.max(clampedMin, max);

  // Re-fit whenever the container resizes or the text content changes.
  useIsomorphicLayoutEffect(() => {
    const node = containerRef.current;
    if (!node || typeof window === 'undefined') return;

    let raf = 0;
    const measure = () => {
      const parent = node.parentElement;
      if (!parent) return;
      // Start at max size and step down until the rendered block fits.
      let size = clampedMax;
      node.style.fontSize = `${size}rem`;
      // `scrollWidth` reflects layout after font-size changes synchronously
      // inside the RAF tick below.
      while (size > clampedMin) {
        const fitsWidth = node.scrollWidth <= parent.clientWidth + 1;
        const heightCap = availableHeight ?? parent.clientHeight;
        const fitsHeight = !heightCap || node.scrollHeight <= heightCap + 1;
        if (fitsWidth && fitsHeight) break;
        size = Math.max(clampedMin, size - step);
        node.style.fontSize = `${size}rem`;
      }
      setFontSize(size);
    };

    // Run measurement after paint so font metrics are accurate.
    raf = window.requestAnimationFrame(measure);

    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(measure);
    });
    if (node.parentElement) observer.observe(node.parentElement);
    observer.observe(node);

    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [children, clampedMin, clampedMax, step, availableHeight]);

  const clampClass =
    maxLines === 2 ? 'line-clamp-2' : 'truncate whitespace-nowrap';

  const style = useMemo<React.CSSProperties>(
    () => ({
      // Inline fontSize wins over Tailwind text-* classes, which is what we
      // want here.
      fontSize: `${fontSize}rem`,
      lineHeight: 1.05,
    }),
    [fontSize],
  );

  return (
    <Tag
      // ref callback type-narrows between span/div/strong/h2/h3
      ref={(node: HTMLElement | null) => {
        containerRef.current = node;
      }}
      data-widget-primitive="fit-text"
      data-fit-size={fontSize.toFixed(3)}
      className={`inline-block max-w-full ${clampClass} ${className}`.trim()}
      style={style}
    >
      {children}
    </Tag>
  );
};

export const FitText = React.memo(FitTextImpl);
FitText.displayName = 'FitText';

export default FitText;
