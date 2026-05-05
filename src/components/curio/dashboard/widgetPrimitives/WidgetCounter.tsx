import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  animate,
  useMotionValue,
  useMotionValueEvent,
  type AnimationPlaybackControls,
} from 'framer-motion';

import { useMotionProfile } from '../../../../hooks/useMotionProfile';

/**
 * WidgetCounter renders a number that animates between updates.
 *
 * Three visual modes are supported:
 *
 * - `tickUp` (default): simple linear interpolation of the numeric value.
 * - `slotRoll`: the full formatted string slides up/down a single column.
 * - `odometer`: each character of the formatted string animates in its own
 *   column, giving a flip-clock feel.
 *
 * All three modes run through the same `useMotionValue` pipeline — `mode`
 * controls rendering, not the animation itself, which keeps the final
 * settled text identical across modes (Property 1 / Requirement 1.10).
 *
 * Non-finite inputs (NaN, Infinity) short-circuit to `fallback`, cancel any
 * running animation, and leave the motion value parked at the last finite
 * value so a follow-up finite update still animates smoothly.
 *
 * `useMotionProfile()` decides whether to animate at all. In `off` mode or
 * when the caller passes `prefersReducedMotion`, the component renders
 * synchronously with no transition. In `subtle` mode the requested
 * duration is capped at 200ms via `motionProfile.durationMs`.
 */

export type WidgetCounterMode = 'odometer' | 'slotRoll' | 'tickUp';

export interface WidgetCounterProps {
  value: number;
  /** Visual strategy for interpolating between values. Default `tickUp`. */
  mode?: WidgetCounterMode;
  /** Number of fractional digits to render. Default `0`. */
  precision?: number;
  /** Base animation duration in ms. Default `650`. */
  durationMs?: number;
  /** Custom formatter; defaults to a locale-aware number format. */
  format?: (n: number) => string;
  /** Escape hatch; when true, skips animation regardless of motion profile. */
  prefersReducedMotion?: boolean;
  /** Static text shown when `value` is non-finite. Default `'—'`. */
  fallback?: string;
  className?: string;
  /** Human-readable hint mirrored onto the outer element as `aria-label`. */
  ariaLabel?: string;
}

// Use useLayoutEffect in the browser, useEffect on the server.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const defaultFormatter = (precision: number) => (n: number) =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });

/** Characters that pass through the per-digit animation without flipping. */
const PASSTHROUGH_CHARS = new Set([
  ',',
  '.',
  ' ',
  '%',
  '$',
  '€',
  '£',
  '¥',
  '+',
  '−',
  '-',
  '/',
  ':',
  '(',
  ')',
]);

interface OdometerCharProps {
  char: string;
  animate: boolean;
  durationMs: number;
}

const OdometerChar: React.FC<OdometerCharProps> = ({
  char,
  animate: shouldAnimate,
  durationMs,
}) => {
  const isAnimatable = !PASSTHROUGH_CHARS.has(char) && char.length === 1;
  if (!isAnimatable) {
    return <span aria-hidden="true">{char}</span>;
  }
  const keyframes = { transform: 'translateY(0)' };
  const initial = shouldAnimate ? { transform: 'translateY(-50%)' } : keyframes;
  const transition = shouldAnimate
    ? { duration: Math.max(0, durationMs / 1000), ease: 'easeOut' as const }
    : { duration: 0 };
  return (
    <span
      aria-hidden="true"
      // key on char so the span remounts when the digit changes, triggering
      // the enter animation from initial -> keyframes.
      className="inline-block tabular-nums"
      style={{ transform: initial.transform, transition: `transform ${transition.duration}s ease-out` }}
      ref={(node) => {
        if (!node) return;
        // Kick off the slide on the next frame so the transition applies.
        requestAnimationFrame(() => {
          node.style.transform = keyframes.transform;
        });
      }}
    >
      {char}
    </span>
  );
};

const WidgetCounterImpl: React.FC<WidgetCounterProps> = ({
  value,
  mode = 'tickUp',
  precision = 0,
  durationMs = 650,
  format,
  prefersReducedMotion = false,
  fallback = '—',
  className = '',
  ariaLabel,
}) => {
  const motionProfile = useMotionProfile();
  const resolvedFormat = useMemo(
    () => format ?? defaultFormatter(precision),
    [format, precision],
  );

  // A valid starting point the motion value can animate from. Defaults to
  // whatever the first finite `value` was, or 0 otherwise.
  const firstFinite = Number.isFinite(value) ? value : 0;
  const motionValue = useMotionValue(firstFinite);
  const lastFiniteValueRef = useRef<number>(firstFinite);
  const controlsRef = useRef<AnimationPlaybackControls | null>(null);

  const [text, setText] = useState<string>(() =>
    Number.isFinite(value) ? resolvedFormat(value) : fallback,
  );

  // Keep `text` in sync with the motion value so the rendered string always
  // reflects the current animated number.
  useMotionValueEvent(motionValue, 'change', (latest) => {
    if (!Number.isFinite(latest)) return;
    setText(resolvedFormat(latest));
  });

  useIsomorphicLayoutEffect(() => {
    // Cancel any in-flight animation when `value` changes so the new
    // animation starts cleanly from the last rendered position.
    controlsRef.current?.stop();
    controlsRef.current = null;

    if (!Number.isFinite(value)) {
      // Park the motion value at the last finite number so the next finite
      // update can animate from a real starting point, and render fallback.
      motionValue.set(lastFiniteValueRef.current);
      setText(fallback);
      return;
    }

    lastFiniteValueRef.current = value;

    const effectiveDuration = motionProfile.durationMs(durationMs);
    const skipAnimation =
      prefersReducedMotion ||
      motionProfile.mode === 'off' ||
      effectiveDuration <= 0;

    if (skipAnimation) {
      motionValue.set(value);
      setText(resolvedFormat(value));
      return;
    }

    const controls = animate(motionValue, value, {
      duration: effectiveDuration / 1000,
      ease: 'easeOut',
      onComplete: () => {
        // Final-value guarantee: rendered text equals `format(value)` after
        // the animation settles, independent of formatter precision or
        // easing rounding.
        motionValue.set(value);
        setText(resolvedFormat(value));
      },
    });
    controlsRef.current = controls;
  }, [
    value,
    durationMs,
    resolvedFormat,
    fallback,
    motionProfile,
    motionValue,
    prefersReducedMotion,
  ]);

  useEffect(() => {
    // Clean up any in-flight animation on unmount.
    return () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

  const isFallback = !Number.isFinite(value) && text === fallback;

  if (mode === 'tickUp' || isFallback) {
    return (
      <span
        data-widget-primitive="counter"
        data-mode={mode}
        aria-label={ariaLabel}
        className={`tabular-nums whitespace-nowrap ${className}`.trim()}
      >
        {text}
      </span>
    );
  }

  // slotRoll renders the full string as a single column, odometer renders
  // each character in its own column. The final settled text matches
  // `format(value)` in both cases because the shared motion-value pipeline
  // above drives `text` identically.
  const shouldAnimate =
    !prefersReducedMotion && motionProfile.mode !== 'off';
  const effectiveDuration = motionProfile.durationMs(durationMs);

  if (mode === 'slotRoll') {
    return (
      <span
        data-widget-primitive="counter"
        data-mode="slotRoll"
        aria-label={ariaLabel}
        className={`relative inline-flex items-center overflow-hidden tabular-nums whitespace-nowrap ${className}`.trim()}
      >
        <span
          key={text}
          className="inline-block"
          style={{
            transform: shouldAnimate ? 'translateY(0)' : 'translateY(0)',
            transition: shouldAnimate
              ? `transform ${Math.max(0, effectiveDuration / 1000)}s ease-out`
              : 'none',
          }}
          ref={(node) => {
            if (!node || !shouldAnimate) return;
            node.style.transform = 'translateY(30%)';
            requestAnimationFrame(() => {
              if (!node) return;
              node.style.transform = 'translateY(0)';
            });
          }}
        >
          {text}
        </span>
      </span>
    );
  }

  // odometer
  const chars = Array.from(text);
  return (
    <span
      data-widget-primitive="counter"
      data-mode="odometer"
      aria-label={ariaLabel}
      className={`inline-flex items-center overflow-hidden tabular-nums whitespace-nowrap ${className}`.trim()}
    >
      {chars.map((char, index) => (
        <OdometerChar
          // Keying by (char, index) remounts the span when the digit
          // changes, triggering the enter animation.
          key={`${index}:${char}`}
          char={char}
          animate={shouldAnimate}
          durationMs={effectiveDuration}
        />
      ))}
    </span>
  );
};

export const WidgetCounter = React.memo(WidgetCounterImpl);
WidgetCounter.displayName = 'WidgetCounter';

export default WidgetCounter;
