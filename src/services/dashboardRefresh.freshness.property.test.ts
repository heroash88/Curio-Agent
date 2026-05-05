/**
 * Feature: dashboard-interactivity-upgrades, Property 15: FreshnessDot state is mutually exclusive
 *
 * Validates: Requirement 20.6
 *
 * For any `(updatedAt, intervalMs, lastRefreshError, nowMs)` tuple,
 * `computeFreshnessState(...)` SHALL return exactly one of
 * `'fresh' | 'idle' | 'stale' | 'error'` — it is a total classifier
 * that never returns `null`, `undefined`, or any other value, and the
 * four states are mutually exclusive by construction.
 *
 * This file also encodes two invariants that fall out of the same
 * classifier so the mutual-exclusion guarantee has teeth:
 *   - `lastRefreshError` truthy always wins => `'error'`.
 *   - `updatedAt === null` with no error always => `'idle'`.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  computeFreshnessState,
  type FreshnessState,
} from './dashboardRefresh';

const ALLOWED_STATES: readonly FreshnessState[] = [
  'fresh',
  'idle',
  'stale',
  'error',
] as const;

// Milliseconds upper bound ~ year 2286, well past any realistic test
// input while still well inside safe-integer range.
const MS_UPPER = 1e13;
// Intervals cap at 10 minutes to match the dashboard's longest polling
// cadence (see Requirement 20.1 / refresh policy defaults).
const INTERVAL_MS_UPPER = 10 * 60 * 1000;

const updatedAtArb = fc.option(fc.integer({ min: 0, max: MS_UPPER }), {
  nil: null,
});
const intervalMsArb = fc.option(
  fc.integer({ min: 0, max: INTERVAL_MS_UPPER }),
  { nil: null },
);
// Cover the full truthiness spectrum of `lastRefreshError`: nullish,
// empty string, non-empty string, and Error instance. Using constants
// keeps the arbitrary shrinkable and avoids generating exotic objects
// whose truthiness we don't care about for the classifier contract.
const errorArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.string(),
  fc.constant(new Error('x')),
);
const nowMsArb = fc.integer({ min: 0, max: MS_UPPER });

describe('computeFreshnessState — Property 15: FreshnessDot state is mutually exclusive', () => {
  it('always returns exactly one of the four allowed literals', () => {
    fc.assert(
      fc.property(
        updatedAtArb,
        intervalMsArb,
        errorArb,
        nowMsArb,
        (updatedAt, intervalMs, lastRefreshError, nowMs) => {
          const state = computeFreshnessState({
            updatedAt,
            intervalMs,
            lastRefreshError,
            nowMs,
          });

          // Single, defined, string value — never null/undefined/multiple.
          expect(typeof state).toBe('string');
          // Membership in the exclusive set of four literals.
          expect(ALLOWED_STATES).toContain(state);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('returns "error" whenever lastRefreshError is truthy, regardless of other inputs', () => {
    // Restrict to truthy errors so the assertion is meaningful.
    const truthyErrorArb = fc.oneof(
      fc.string({ minLength: 1 }),
      fc.constant(new Error('boom')),
    );

    fc.assert(
      fc.property(
        updatedAtArb,
        intervalMsArb,
        truthyErrorArb,
        nowMsArb,
        (updatedAt, intervalMs, lastRefreshError, nowMs) => {
          const state = computeFreshnessState({
            updatedAt,
            intervalMs,
            lastRefreshError,
            nowMs,
          });
          expect(state).toBe<FreshnessState>('error');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('returns "idle" whenever updatedAt is null and there is no error', () => {
    // Restrict error to falsy values so never-refreshed dominates.
    const falsyErrorArb = fc.constantFrom(null, undefined, '');

    fc.assert(
      fc.property(
        intervalMsArb,
        falsyErrorArb,
        nowMsArb,
        (intervalMs, lastRefreshError, nowMs) => {
          const state = computeFreshnessState({
            updatedAt: null,
            intervalMs,
            lastRefreshError,
            nowMs,
          });
          expect(state).toBe<FreshnessState>('idle');
        },
      ),
      { numRuns: 200 },
    );
  });
});
