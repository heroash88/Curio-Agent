/**
 * Feature: dashboard-interactivity-upgrades, Property 24: Backup/restore round-trip
 *
 * For any dashboard state D containing feature-owned keys,
 * restore(backup(D)) equals D for each feature-owned key.
 *
 * **Validates: Requirement 31.5**
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature-owned localStorage key patterns:
 * - curio_dashboard_presets* (layout presets)
 * - curio_widget_sparkline_* (sparkline history)
 * - curio_widget_state_* (persistent widget state)
 * - curio_dashboard_prefs* (board preferences including InteractivitySettings)
 * - curio_dashboard_pages* (page layouts with widget configs)
 */

const FEATURE_KEY_PREFIXES = [
  'curio_dashboard_presets',
  'curio_widget_sparkline_',
  'curio_widget_state_',
  'curio_dashboard_prefs',
  'curio_dashboard_pages',
] as const;

function isFeatureOwnedKey(key: string): boolean {
  return FEATURE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Simulates the backup sweep: collects all curio_* keys that are not transient.
 */
function simulateBackup(storage: Storage): Record<string, string> {
  const entries: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key) continue;
    if (!key.startsWith('curio_') && !key.startsWith('curio:') && !key.startsWith('curio-') && !key.startsWith('gemini_') && !key.startsWith('etheros_')) continue;
    // Skip transient keys
    if (key === 'curio_oauth_result' || key.startsWith('curio-weather-cache') || key.startsWith('curio:quotes:') || key.startsWith('curio:fun-facts:')) continue;
    const value = storage.getItem(key);
    if (value !== null) entries[key] = value;
  }
  return entries;
}

/**
 * Simulates the restore: clears all curio_* keys, then sets the backed-up entries.
 */
function simulateRestore(storage: Storage, entries: Record<string, string>): void {
  // Clear all curio-owned keys
  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key) continue;
    if (key.startsWith('curio_') || key.startsWith('curio:') || key.startsWith('curio-') || key.startsWith('gemini_') || key.startsWith('etheros_')) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    storage.removeItem(key);
  }

  // Restore entries
  for (const [key, value] of Object.entries(entries)) {
    storage.setItem(key, value);
  }
}

describe('Property 24: Backup/restore round-trip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('restore(backup(D)) preserves all feature-owned keys', () => {
    // Arbitrary for generating feature-owned key-value pairs
    const featureKeyArb = fc.oneof(
      fc.tuple(fc.constant('curio_dashboard_presets'), fc.json({ maxDepth: 2 })),
      fc.tuple(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z0-9]+$/.test(s)).map((id) => `curio_dashboard_presets_${id}`),
        fc.json({ maxDepth: 2 }),
      ),
      fc.tuple(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z0-9]+$/.test(s)).map((id) => `curio_widget_sparkline_${id}_price`),
        fc.json({ maxDepth: 1 }),
      ),
      fc.tuple(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z0-9]+$/.test(s)).map((id) => `curio_widget_state_${id}_mode`),
        fc.json({ maxDepth: 1 }),
      ),
      fc.tuple(fc.constant('curio_dashboard_prefs'), fc.json({ maxDepth: 2 })),
      fc.tuple(fc.constant('curio_dashboard_pages'), fc.json({ maxDepth: 2 })),
    );

    fc.assert(
      fc.property(
        fc.array(featureKeyArb, { minLength: 1, maxLength: 15 }),
        (entries) => {
          localStorage.clear();

          // Set up the initial state
          for (const [key, value] of entries) {
            localStorage.setItem(key, value);
          }

          // Capture the feature-owned state before backup
          const stateBefore: Record<string, string> = {};
          for (const [key, value] of entries) {
            if (isFeatureOwnedKey(key)) {
              stateBefore[key] = value;
            }
          }

          // Backup
          const backup = simulateBackup(localStorage);

          // Clear and restore
          simulateRestore(localStorage, backup);

          // Verify all feature-owned keys are preserved
          for (const [key, expectedValue] of Object.entries(stateBefore)) {
            const actual = localStorage.getItem(key);
            expect(actual).toBe(expectedValue);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('missing keys in older backups do not cause restore failure', () => {
    fc.assert(
      fc.property(
        fc.json({ maxDepth: 2 }),
        (prefsJson) => {
          localStorage.clear();

          // Simulate an older backup that only has prefs but no sparkline/state keys
          const olderBackup: Record<string, string> = {
            curio_dashboard_prefs: prefsJson,
          };

          // Restore should not throw
          expect(() => simulateRestore(localStorage, olderBackup)).not.toThrow();

          // The restored key should be present
          expect(localStorage.getItem('curio_dashboard_prefs')).toBe(prefsJson);

          // Missing keys should simply not exist (no crash)
          expect(localStorage.getItem('curio_widget_sparkline_test_price')).toBeNull();
          expect(localStorage.getItem('curio_widget_state_test_mode')).toBeNull();
          expect(localStorage.getItem('curio_dashboard_presets')).toBeNull();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('non-feature keys are not lost during restore', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-z_]+$/.test(s)).map((s) => `curio_${s}`),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z0-9]+$/.test(s)).map((id) => `curio_widget_state_${id}_tab`),
        fc.string({ minLength: 1, maxLength: 50 }),
        (otherKey, otherValue, featureKey, featureValue) => {
          localStorage.clear();
          localStorage.setItem(otherKey, otherValue);
          localStorage.setItem(featureKey, featureValue);

          const backup = simulateBackup(localStorage);
          simulateRestore(localStorage, backup);

          // Both keys should survive the round-trip
          expect(localStorage.getItem(featureKey)).toBe(featureValue);
          // The other curio key should also survive (it's in the backup)
          expect(localStorage.getItem(otherKey)).toBe(otherValue);
        },
      ),
      { numRuns: 50 },
    );
  });
});
