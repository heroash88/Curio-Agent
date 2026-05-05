import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAllAppCss } from '../styles/readCss';

const root = resolve(__dirname, '../..');
const readProjectFile = (path: string) => readFileSync(resolve(root, path), 'utf8');
const readAppCss = () => readAllAppCss();

describe('PWA viewport shell', () => {
  it('opts into full-bleed iOS safe areas and uses dynamic viewport units before React mounts', () => {
    const html = readProjectFile('index.html');

    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('apple-mobile-web-app-status-bar-style');
    expect(html).toContain('black-translucent');
    expect(html).toContain('format-detection');
    expect(html).toContain('100dvh');
    expect(html).toContain('env(safe-area-inset-top');
    expect(html).toContain('env(safe-area-inset-bottom');
  });

  it('defines shared PWA safe-area utilities for the app and dashboard shells', () => {
    const css = readAppCss();

    expect(css).toContain('--pwa-safe-top: env(safe-area-inset-top, 0px)');
    expect(css).toContain('--pwa-safe-bottom: env(safe-area-inset-bottom, 0px)');
    expect(css).toContain('.curio-pwa-shell');
    expect(css).toContain('.dashboard-pwa-root');
    expect(css).toContain('.dashboard-pwa-scroll');
    expect(css).toContain('-webkit-fill-available');
  });

  it('extends the app background through the Safari and PWA bottom bleed area', () => {
    const css = readAppCss();

    expect(css).toContain('--pwa-bleed-height: 100lvh');
    expect(css).toContain('--pwa-bottom-bleed: max(6rem, var(--pwa-safe-bottom))');
    expect(css).toContain('.curio-pwa-shell::before');
    expect(css).toContain('bottom: calc(-1 * var(--pwa-bottom-bleed))');
  });

  it('keeps robot face subtitles and text input above iOS browser chrome', () => {
    const css = readAppCss();
    const faceModeShell = readProjectFile('src/components/curio/CurioAgentMode.tsx');
    const faceMode = [
      faceModeShell,
      readProjectFile('src/components/curio/CurioConnectControls.tsx'),
      readProjectFile('src/components/curio/CurioTextInputBar.tsx'),
      readProjectFile('src/components/curio/CurioTranscriptOverlay.tsx'),
    ].join('\n');

    expect(css).toContain('--curio-face-text-bottom');
    expect(css).toContain('--curio-face-transcript-bottom');
    expect(css).toContain('.curio-face-chat-toggle');
    expect(css).toContain('touch-action: manipulation');
    expect(css).toContain('pointer-events: auto');
    expect(css).toContain('.curio-face-chat-hotspot');
    expect(css).toContain('.curio-face-transcript-overlay');
    expect(css).toContain('.curio-face-text-input');
    expect(css).toContain('.curio-face-connect-controls');
    expect(faceMode).toContain('curio-face-chat-toggle');
    expect(faceMode).toContain('curio-face-transcript-overlay');
    expect(faceMode).toContain('curio-face-text-input');
    expect(faceMode).toContain('curio-face-connect-controls');
    expect(faceMode).toContain('absolute curio-face-chat-hotspot');
    expect(faceModeShell.indexOf('curio-face-chat-hotspot')).toBeGreaterThan(faceModeShell.indexOf('CurioConnectControls'));
    expect(faceModeShell).toContain('textInputTogglePointerHandledRef');
    expect(faceModeShell).toContain('onPointerDown={handleTextInputTogglePointerDown}');
    expect(faceMode).not.toContain('fixed curio-face-chat-toggle');
    expect(faceMode).not.toContain('fixed left-1/2 -translate-x-1/2 z-[80]');
    expect(faceMode).not.toContain("style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}");
  });
});
