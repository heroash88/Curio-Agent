import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestElectronMediaAccess } from './electronMediaAccess';

const originalCurioDesktop = window.curioDesktop;

describe('requestElectronMediaAccess', () => {
  afterEach(() => {
    window.curioDesktop = originalCurioDesktop;
    vi.restoreAllMocks();
  });

  it('allows web builds when no Electron bridge is available', async () => {
    window.curioDesktop = undefined;

    await expect(requestElectronMediaAccess('microphone')).resolves.toBe(true);
  });

  it('delegates media access requests to Electron when available', async () => {
    const requestMediaAccess = vi.fn(async () => true);
    window.curioDesktop = { requestMediaAccess } as typeof window.curioDesktop;

    await expect(requestElectronMediaAccess('camera')).resolves.toBe(true);

    expect(requestMediaAccess).toHaveBeenCalledWith('camera');
  });

  it('returns false when the native request fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.curioDesktop = {
      requestMediaAccess: vi.fn(async () => {
        throw new Error('denied');
      }),
    } as typeof window.curioDesktop;

    await expect(requestElectronMediaAccess('microphone')).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });
});
