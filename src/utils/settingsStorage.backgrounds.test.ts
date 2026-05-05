import { describe, expect, it } from 'vitest';
import { APP_BACKGROUND_PRESETS } from './settingsStorage';

describe('app background presets', () => {
  it('includes six generated dashboard image backgrounds split across light and dark modes', () => {
    const generatedDashboardImages = APP_BACKGROUND_PRESETS.filter((preset) =>
      preset.id.startsWith('dashboard-'),
    );

    expect(generatedDashboardImages).toHaveLength(6);
    expect(generatedDashboardImages.every((preset) => preset.style === 'image')).toBe(true);
    expect(generatedDashboardImages.filter((preset) => preset.dark).length).toBe(3);
    expect(generatedDashboardImages.filter((preset) => !preset.dark).length).toBe(3);
    expect(generatedDashboardImages.every((preset) => preset.value.endsWith('.svg'))).toBe(true);
  });
});
