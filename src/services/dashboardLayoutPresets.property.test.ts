/**
 * Feature: dashboard-interactivity-upgrades, Property 18: Layout preset export/import round-trip
 *
 * Validates: Requirement 24.8
 *
 * For any valid `DashboardLayoutPreset` `p`,
 * `importDashboardLayoutPreset(exportDashboardLayoutPreset(p))` SHALL
 * deep-equal `p` after normalization.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  exportDashboardLayoutPreset,
  importDashboardLayoutPreset,
  normalizePreset,
  type DashboardLayoutPreset,
} from './dashboardLayoutPresets';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const widgetTypeArb = fc.constantFrom(
  'tasks',
  'weather',
  'clock',
  'calendar',
  'stock',
  'notes',
  'reminders',
  'greeting',
  'music',
  'pomodoro',
  'habits',
  'bookmarks',
  'news',
  'mail',
  'health',
);

const widgetSizeArb = fc.constantFrom('small', 'medium', 'large', 'xlarge');

const widgetConfigArb = fc.record({
  w: fc.integer({ min: 1, max: 8 }),
  h: fc.integer({ min: 1, max: 8 }),
});

const widgetArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
  type: widgetTypeArb,
  position: fc.nat({ max: 47 }),
  size: widgetSizeArb,
  config: widgetConfigArb,
  enabled: fc.boolean(),
});

const categoryArb = fc.constantFrom('morning', 'focus', 'weekend', 'custom');

const presetArb: fc.Arbitrary<DashboardLayoutPreset> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  name: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
  description: fc.option(fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0), { nil: undefined }),
  category: fc.option(categoryArb, { nil: undefined }),
  schemaVersion: fc.constant(1 as const),
  widgets: fc.array(widgetArb, { minLength: 1, maxLength: 10 }),
  createdAt: fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 }),
}) as fc.Arbitrary<DashboardLayoutPreset>;

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe('Property 18: Layout preset export/import round-trip', () => {
  it('importDashboardLayoutPreset(exportDashboardLayoutPreset(p)) deep-equals normalizePreset(p)', () => {
    fc.assert(
      fc.property(presetArb, (preset) => {
        const exported = exportDashboardLayoutPreset(preset);
        const imported = importDashboardLayoutPreset(exported);
        const normalizedOriginal = normalizePreset(preset);

        expect(imported).toEqual(normalizedOriginal);
      }),
      { numRuns: 200 },
    );
  });
});
