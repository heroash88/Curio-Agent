import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readElectronMainSource = () => readFileSync(resolve(process.cwd(), 'electron/main.cjs'), 'utf8');

describe('Electron main process hardening', () => {
  it('prevents duplicate desktop instances from starting duplicate background services', () => {
    const source = readElectronMainSource();

    expect(source).toContain('app.requestSingleInstanceLock()');
    expect(source).toContain("app.on('second-instance'");
    expect(source).toContain('showMainWindow()');
  });

  it('clears stale Nova proxy process state when the helper exits or the app quits', () => {
    const source = readElectronMainSource();

    expect(source).toContain("proc.on('exit'");
    expect(source).toContain('novaProxyProcess = null;');
    expect(source).toContain('novaProxyPort = null;');
  });

  it('accepts measured card overlay layout to keep the transparent cards window compact', () => {
    const source = readElectronMainSource();

    expect(source).toContain('cardsWindowLayout');
    expect(source).toContain('setCardsWindowLayout(layout)');
    expect(source).toContain('normalizeCardsWindowHeight');
  });

  it('has Windows parity hooks for desktop floating companion windows', () => {
    const source = readElectronMainSource();

    expect(source).toContain("const isWindows = process.platform === 'win32'");
    expect(source).toContain("app.setAppUserModelId('com.curio.robot')");
    expect(source).toContain('function configureFloatingCompanionWindow');
    expect(source).toContain("isWindows ? 'screen-saver' : 'floating'");
    expect(source).toContain('if (!isWindows)');
    expect(source).toContain('configureFloatingCompanionWindow(faceWindow)');
    expect(source).toContain('configureFloatingCompanionWindow(cardsWindow)');
  });

  it('uses platform-appropriate tray images for Windows and macOS', () => {
    const source = readElectronMainSource();

    expect(source).toContain('function createTrayIconImage');
    expect(source).toContain('if (isMac) image.setTemplateImage(true)');
    expect(source).toContain('new Tray(createTrayIconImage())');
  });
});
