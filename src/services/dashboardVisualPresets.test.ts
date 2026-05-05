import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_ACCENT_ORDER,
  DASHBOARD_ACCENT_PRESETS,
  getDashboardAccentVariables,
} from './dashboardVisualPresets';

describe('dashboard visual presets', () => {
  it('provides a broader shared accent palette for dashboard and settings', () => {
    expect(DASHBOARD_ACCENT_ORDER.length).toBeGreaterThanOrEqual(10);
    expect(new Set(DASHBOARD_ACCENT_ORDER).size).toBe(DASHBOARD_ACCENT_ORDER.length);

    for (const preset of DASHBOARD_ACCENT_ORDER) {
      expect(DASHBOARD_ACCENT_PRESETS[preset]).toEqual(
        expect.objectContaining({
          label: expect.any(String),
          accent: expect.stringMatching(/^#/),
          accentSoft: expect.stringContaining('rgba'),
          glow: expect.stringContaining('rgba'),
        }),
      );
    }
  });

  it('maps the selected board accent into widget semantic accent tokens', () => {
    const variables = getDashboardAccentVariables('coral');
    const accent = DASHBOARD_ACCENT_PRESETS.coral.accent;

    expect(variables['--dashboard-accent']).toBe(accent);
    expect(variables['--ether-primary']).toBe(accent);
    expect(variables['--ether-teal']).toBe(accent);
    expect(variables['--ether-amber']).toBe(accent);
    expect(variables['--ether-emerald']).toBe(accent);
    expect(variables['--ether-rose']).toBe(accent);
  });
});
