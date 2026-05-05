import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../..');
const readProjectFile = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Dashboard settings layout', () => {
  it('keeps the mode controls compact and avoids robot runtime explainer copy', () => {
    const source = readProjectFile('src/components/curio/settings/DashboardSection.tsx');

    expect(source).toContain('settings-consistency-scope');
    expect(source).toContain('settings-unified-card');
    expect(source).toContain('Choose what stays on screen.');
    expect(source).toContain('{activeWidgets.length} active');

    expect(source).not.toContain('Dashboard Runtime');
    expect(source).not.toContain('Keep the board live while Curio listens');
    expect(source).not.toContain('Dashboard mode now stays on-screen');
    expect(source).not.toContain('Robot animations only load');
    expect(source).not.toContain('Robot widget enabled');
    expect(source).not.toContain('Robot fully unloaded');
    expect(source).not.toContain('bg-sky-500 text-white');
  });

  it('exposes no-key RSS source and category controls for the news widget', () => {
    const source = readProjectFile('src/components/curio/settings/DashboardSection.tsx');
    const feedService = readProjectFile('src/services/newsFeedService.ts');

    expect(source).toContain('News source');
    expect(source).toContain('NEWS_FEED_PROVIDER_OPTIONS');
    expect(source).toContain('newsCategory');
    expect(source).toContain('newsCustomFeedUrl');
    expect(feedService).toContain('New York Times RSS');
  });

  it('lets news widgets configure how many articles are loaded', () => {
    const source = readProjectFile('src/components/curio/settings/DashboardSection.tsx');

    expect(source).toContain('"news",');
    expect(source).toContain('widget.type === "news" ? 10 : 4');
    expect(source).toContain('widget.type === "news" ? 20 : 12');
  });

  it('keeps widget library buttons constrained for mobile touch hit testing', () => {
    const source = readProjectFile('src/components/curio/settings/DashboardSection.tsx');

    expect(source).toContain('w-full min-w-0');
    expect(source).toContain('min-w-0 flex-1');
  });

  it('exposes a global widget glow control in dashboard settings', () => {
    const source = readProjectFile('src/components/curio/settings/DashboardSection.tsx');

    expect(source).toContain('Widget glow');
    expect(source).toContain('widgetGlowEnabled');
  });

  it('groups global widget glow with board controls in dashboard settings', () => {
    const source = readProjectFile('src/components/curio/settings/DashboardSection.tsx');

    const boardControlsIndex = source.indexOf('Board controls');
    const widgetGlowIndex = source.indexOf('label="Widget glow"');
    const visualSystemIndex = source.indexOf('Visual system');

    expect(boardControlsIndex).toBeGreaterThanOrEqual(0);
    expect(widgetGlowIndex).toBeGreaterThan(boardControlsIndex);
    expect(widgetGlowIndex).toBeLessThan(visualSystemIndex);
  });

  it('exposes the AI theme generator in dashboard settings', () => {
    const source = readProjectFile('src/components/curio/settings/DashboardSection.tsx');

    expect(source).toContain('AI Theme Generator');
    expect(source).toContain('Describe a theme...');
    expect(source).toContain('Generate Theme');
  });

  it('exposes hardcoded animated background choices in dashboard settings', () => {
    const source = readProjectFile('src/components/curio/settings/DashboardSection.tsx');
    const presets = readProjectFile('src/services/dashboardAnimatedBackgroundPresets.ts');

    expect(source).toContain('DASHBOARD_ANIMATED_BACKGROUND_OPTIONS');
    expect(source).toContain('Animated backgrounds');
    expect(source).toContain('Use ${preset.label} animated background');
    expect(presets).toContain('Matrix Rain');
    expect(presets).toContain('Particle Mesh');
  });
});
