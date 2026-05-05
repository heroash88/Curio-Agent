/**
 * Feature: dashboard-interactivity-upgrades, Property 2: Sparkline ring buffer respects max and last-appended
 *
 * Validates: Requirement 3.9
 *
 * For any sequence of `appendSamplePure` calls starting from an empty
 * buffer with a fixed `maxSamples`, the resulting array SHALL satisfy:
 *
 *   - `result.length <= maxSamples`
 *   - `result[result.length - 1]` deep-equals the most recently
 *     appended sample.
 *
 * The pure helper is exercised here so the property holds without
 * any dependency on localStorage/DOM state.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  appendSamplePure,
  type SparklineSample,
} from './dashboardSparklineStore';

const sampleArb = fc.record({
  t: fc.integer({ min: 0, max: 1e13 }),
  v: fc.double({ noNaN: true }),
});

const samplesArb = fc.array(sampleArb, { minLength: 1, maxLength: 200 });
const maxArb = fc.integer({ min: 1, max: 200 });

describe('appendSamplePure — Property 2: Sparkline ring buffer respects max and last-appended', () => {
  it('length never exceeds max and the final element equals the last appended sample', () => {
    fc.assert(
      fc.property(samplesArb, maxArb, (samples, max) => {
        let buffer: SparklineSample[] = [];
        for (const sample of samples) {
          buffer = appendSamplePure(buffer, sample, max);
        }

        expect(buffer.length).toBeLessThanOrEqual(max);

        const lastAppended = samples[samples.length - 1];
        expect(buffer[buffer.length - 1]).toEqual(lastAppended);
      }),
      { numRuns: 200 },
    );
  });
});
