/**
 * Feature: dashboard-interactivity-upgrades, Property 14: Motion profile collapses to zero duration
 *
 * Validates: Requirement 19.8
 *
 * When `animationIntensity === 'off'` or any reduced-motion preference is
 * active (OS-level `prefers-reduced-motion` or the board-level
 * `reduceMotion` toggle), the resolved motion profile SHALL:
 *   - return `durationMs(base) === 0` for any base duration,
 *   - report `shouldAnimate === false`,
 *   - return `scale(base) === 1` for any base scale.
 *
 * When the resolved mode is `subtle`, durations SHALL be capped at 200ms
 * and scale SHALL collapse to 1 (duration-only animations).
 *
 * When the resolved mode is `full`, durations and scales SHALL be
 * passed through unchanged.
 *
 * Tests exercise the two exported pure helpers `resolveMotionMode` and
 * `buildMotionProfile` directly since they carry the full motion-mode
 * algebra and are deterministic.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { buildMotionProfile, resolveMotionMode } from './useMotionProfile';
import type { DashboardAnimationIntensity } from '../services/dashboardTypes';

const intensityArb = fc.constantFrom<DashboardAnimationIntensity>(
  'off',
  'subtle',
  'full',
);
const baseMsArb = fc.integer({ min: 0, max: 100_000 });
const scaleArb = fc.double({ min: 0.1, max: 3, noNaN: true });

describe('useMotionProfile — Property 14: Motion profile collapses to zero duration', () => {
  it('Property A: collapses to off when intensity is off or reduced motion is active', () => {
    fc.assert(
      fc.property(
        intensityArb,
        fc.boolean(),
        fc.boolean(),
        baseMsArb,
        scaleArb,
        (intensity, prefersReducedMotion, boardReduceMotion, baseMs, baseScale) => {
          fc.pre(
            intensity === 'off' || prefersReducedMotion || boardReduceMotion,
          );

          const mode = resolveMotionMode(
            intensity,
            prefersReducedMotion,
            boardReduceMotion,
          );
          const profile = buildMotionProfile(mode);

          expect(mode).toBe('off');
          expect(profile.mode).toBe('off');
          expect(profile.shouldAnimate).toBe(false);
          expect(profile.durationMs(baseMs)).toBe(0);
          expect(profile.scale(baseScale)).toBe(1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Property B: subtle caps duration at 200ms and forces scale to 1', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        baseMsArb,
        scaleArb,
        (prefersReducedMotion, boardReduceMotion, baseMs, baseScale) => {
          fc.pre(!prefersReducedMotion && !boardReduceMotion);

          const mode = resolveMotionMode(
            'subtle',
            prefersReducedMotion,
            boardReduceMotion,
          );
          const profile = buildMotionProfile(mode);

          expect(mode).toBe('subtle');
          expect(profile.mode).toBe('subtle');
          expect(profile.shouldAnimate).toBe(true);
          expect(profile.durationMs(baseMs)).toBe(Math.min(baseMs, 200));
          expect(profile.scale(baseScale)).toBe(1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Property C: full passes duration and scale through unchanged', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        baseMsArb,
        scaleArb,
        (prefersReducedMotion, boardReduceMotion, baseMs, baseScale) => {
          fc.pre(!prefersReducedMotion && !boardReduceMotion);

          const mode = resolveMotionMode(
            'full',
            prefersReducedMotion,
            boardReduceMotion,
          );
          const profile = buildMotionProfile(mode);

          expect(mode).toBe('full');
          expect(profile.mode).toBe('full');
          expect(profile.shouldAnimate).toBe(true);
          expect(profile.durationMs(baseMs)).toBe(baseMs);
          expect(profile.scale(baseScale)).toBe(baseScale);
        },
      ),
      { numRuns: 200 },
    );
  });
});
