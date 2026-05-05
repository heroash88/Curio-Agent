import { describe, expect, it } from 'vitest';
import { readAllAppCss } from '../../../styles/readCss';

describe('dashboard scroll CSS helpers', () => {
  it('defines the vertical touch scroll helper used by dashboard widgets', () => {
    const css = readAllAppCss();
    const helper = css.match(/\.dashboard-widget-touch-scroll-y\s*\{([\s\S]*?)\}/)?.[1] || '';

    expect(helper).toContain('overflow-y: auto');
    expect(helper).toContain('-webkit-overflow-scrolling: touch');
    expect(helper).toContain('touch-action: pan-y');
  });

  it('themes native dashboard dropdown controls and menus from the active dashboard theme', () => {
    const css = readAllAppCss();

    expect(css).toContain('--dashboard-select-color-scheme: dark');
    expect(css).toContain('--dashboard-select-color-scheme: light');
    expect(css).toContain('--dashboard-select-menu-bg');
    expect(css).toContain(':where(.dashboard-widget-body, .dashboard-widget-settings-panel) :where(select)');
    expect(css).toContain('color-scheme: var(--dashboard-select-color-scheme, dark)');
    expect(css).toContain(':where(.dashboard-widget-body, .dashboard-widget-settings-panel) :where(option, optgroup)');
    expect(css).toContain('background-color: var(--dashboard-select-menu-bg)');
    expect(css).toContain('color: var(--ether-on-surface)');
  });

  it('keeps settings modal native dropdown menus aligned with light and dark settings themes', () => {
    const css = readAllAppCss();

    expect(css).toContain('.curio-settings-modal :where(select)');
    expect(css).toContain('color-scheme: inherit');
    expect(css).toContain('.curio-settings-modal :where(option, optgroup)');
    expect(css).toContain('background-color: var(--settings-panel-raised)');
    expect(css).toContain('color: var(--settings-text)');
    expect(css).toContain('.curio-settings-modal[data-theme="dark"] option');
  });

  it('protects astronomy mini status text from the animated sun layer', () => {
    const css = readAllAppCss();
    const statusRule = css.match(/\.astronomy-mini-status\s*\{([\s\S]*?)\}/)?.[1] || '';

    expect(statusRule).toContain('background:');
    expect(statusRule).toContain('backdrop-filter');
    expect(statusRule).toContain('border: 1px solid');
  });
});
