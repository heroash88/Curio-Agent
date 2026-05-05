import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runSettingsMigrations } from './settingsMigrations';
import { DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS } from '../services/dashboardTypes';

const VERSION_KEY = 'curio_settings_version';
const PREFS_KEY = 'curio_dashboard_prefs';

const interactivityKeys = Object.keys(DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS);

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('runSettingsMigrations v2', () => {
  it('fresh install: only writes the version and does not create phantom prefs keys', () => {
    runSettingsMigrations();

    expect(localStorage.getItem(VERSION_KEY)).toBe('2');
    expect(localStorage.getItem(PREFS_KEY)).toBeNull();

    const keys = Object.keys(localStorage);
    const phantomPrefsKeys = keys.filter(
      (k) => k === PREFS_KEY || k.startsWith('curio_dashboard_prefs_'),
    );
    expect(phantomPrefsKeys).toEqual([]);
  });

  it('legacy install with no interactivity: fills the full default block and preserves other fields', () => {
    const seed = { mode: 'grid', snapToGrid: true };
    localStorage.setItem(PREFS_KEY, JSON.stringify(seed));

    runSettingsMigrations();

    const stored = localStorage.getItem(PREFS_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string);

    expect(parsed.mode).toBe('grid');
    expect(parsed.snapToGrid).toBe(true);
    expect(parsed.interactivity).toEqual(DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS);
    expect(localStorage.getItem(VERSION_KEY)).toBe('2');
  });

  it('legacy install with partial interactivity: keeps user-set values and fills every other key with defaults', () => {
    const partial = { animationIntensity: 'subtle', rollingNumbersEnabled: false };
    const seed = { mode: 'freeform', interactivity: partial };
    localStorage.setItem(PREFS_KEY, JSON.stringify(seed));

    runSettingsMigrations();

    const stored = localStorage.getItem(PREFS_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string);

    expect(parsed.mode).toBe('freeform');
    expect(parsed.interactivity.animationIntensity).toBe('subtle');
    expect(parsed.interactivity.rollingNumbersEnabled).toBe(false);

    // Every other interactivity key should be filled with the default.
    for (const key of interactivityKeys) {
      if (key === 'animationIntensity' || key === 'rollingNumbersEnabled') continue;
      expect(parsed.interactivity[key]).toBe(
        (DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS as Record<string, unknown>)[key],
      );
    }
  });

  it('multi-profile install: independently fills each per-profile prefs key', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: 'grid' }));
    localStorage.setItem(
      'curio_dashboard_prefs_profile_abc',
      JSON.stringify({ mode: 'freeform', snapToGrid: false }),
    );
    localStorage.setItem(
      'curio_dashboard_prefs_profile_xyz',
      JSON.stringify({
        mode: 'grid',
        interactivity: { animationIntensity: 'off' },
      }),
    );

    runSettingsMigrations();

    const base = JSON.parse(localStorage.getItem(PREFS_KEY) as string);
    const abc = JSON.parse(localStorage.getItem('curio_dashboard_prefs_profile_abc') as string);
    const xyz = JSON.parse(localStorage.getItem('curio_dashboard_prefs_profile_xyz') as string);

    expect(base.mode).toBe('grid');
    expect(base.interactivity).toEqual(DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS);

    expect(abc.mode).toBe('freeform');
    expect(abc.snapToGrid).toBe(false);
    expect(abc.interactivity).toEqual(DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS);

    expect(xyz.mode).toBe('grid');
    expect(xyz.interactivity.animationIntensity).toBe('off');
    for (const key of interactivityKeys) {
      if (key === 'animationIntensity') continue;
      expect(xyz.interactivity[key]).toBe(
        (DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS as Record<string, unknown>)[key],
      );
    }
  });

  it('malformed JSON entry: does not throw, leaves the bad value untouched, and still migrates sibling profile keys', () => {
    localStorage.setItem(PREFS_KEY, 'not-json');
    localStorage.setItem(
      'curio_dashboard_prefs_profile_good',
      JSON.stringify({ mode: 'grid' }),
    );

    expect(() => runSettingsMigrations()).not.toThrow();

    expect(localStorage.getItem(PREFS_KEY)).toBe('not-json');

    const good = JSON.parse(
      localStorage.getItem('curio_dashboard_prefs_profile_good') as string,
    );
    expect(good.mode).toBe('grid');
    expect(good.interactivity).toEqual(DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS);
    expect(localStorage.getItem(VERSION_KEY)).toBe('2');
  });

  it('idempotence: two passes produce identical serialized data across every touched key', () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ mode: 'grid', snapToGrid: true }),
    );
    localStorage.setItem(
      'curio_dashboard_prefs_profile_abc',
      JSON.stringify({
        mode: 'freeform',
        interactivity: { animationIntensity: 'subtle' },
      }),
    );

    runSettingsMigrations();

    const snapshotAfterPass1: Record<string, string | null> = {
      [PREFS_KEY]: localStorage.getItem(PREFS_KEY),
      'curio_dashboard_prefs_profile_abc': localStorage.getItem(
        'curio_dashboard_prefs_profile_abc',
      ),
      [VERSION_KEY]: localStorage.getItem(VERSION_KEY),
    };

    // Force the migration body to execute again by resetting the version gate.
    localStorage.setItem(VERSION_KEY, '1');

    runSettingsMigrations();

    expect(localStorage.getItem(PREFS_KEY)).toBe(snapshotAfterPass1[PREFS_KEY]);
    expect(localStorage.getItem('curio_dashboard_prefs_profile_abc')).toBe(
      snapshotAfterPass1['curio_dashboard_prefs_profile_abc'],
    );
    expect(localStorage.getItem(VERSION_KEY)).toBe('2');
  });

  it('idempotence: already-migrated data at v2 is a no-op (early-exit via version gate)', () => {
    const alreadyMigrated = {
      mode: 'grid',
      snapToGrid: true,
      interactivity: { ...DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS },
    };
    localStorage.setItem(PREFS_KEY, JSON.stringify(alreadyMigrated));
    localStorage.setItem(VERSION_KEY, '2');

    const prefsBefore = localStorage.getItem(PREFS_KEY);
    const versionBefore = localStorage.getItem(VERSION_KEY);

    runSettingsMigrations();

    expect(localStorage.getItem(PREFS_KEY)).toBe(prefsBefore);
    expect(localStorage.getItem(VERSION_KEY)).toBe(versionBefore);
  });
});
