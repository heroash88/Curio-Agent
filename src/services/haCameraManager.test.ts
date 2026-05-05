import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HaCameraManager } from './haCameraManager';

vi.mock('../utils/blobEncoding', () => ({
  blobToBase64Data: vi.fn().mockResolvedValue('frame-base64'),
}));

describe('HaCameraManager', () => {
  const originalFetch = globalThis.fetch;
  let manager: HaCameraManager | null = null;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['jpeg'], { type: 'image/jpeg' }),
    } as Response);
  });

  afterEach(() => {
    manager?.dispose(false);
    manager = null;
    globalThis.fetch = originalFetch;
  });

  it('starts the shared stream from a dashboard camera handoff event', async () => {
    manager = new HaCameraManager({
      sendVideoFrame: vi.fn(),
      hasMediaStream: () => false,
    });

    window.dispatchEvent(
      new CustomEvent('ha-camera-switch', {
        detail: {
          entityId: 'camera.garage',
          baseUrl: 'http://ha.local:8123',
          token: 'ha-token',
          startIfIdle: true,
        },
      }),
    );

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://ha.local:8123/api/camera_proxy/camera.garage',
        { headers: { Authorization: 'Bearer ha-token' } },
      );
    });
    expect(manager.entityId).toBe('camera.garage');
  });

  it('stops a temporary dashboard stream when the matching source reverts', async () => {
    manager = new HaCameraManager({
      sendVideoFrame: vi.fn(),
      hasMediaStream: () => false,
    });

    window.dispatchEvent(
      new CustomEvent('ha-camera-switch', {
        detail: {
          entityId: 'camera.garage',
          baseUrl: 'http://ha.local:8123',
          token: 'ha-token',
          startIfIdle: true,
          sourceId: 'dashboard-widget:cam-widget',
          temporary: true,
        },
      }),
    );

    await vi.waitFor(() => {
      expect(manager.entityId).toBe('camera.garage');
    });

    window.dispatchEvent(
      new CustomEvent('ha-camera-stop', {
        detail: {
          entityId: 'camera.garage',
          sourceId: 'dashboard-widget:cam-widget',
        },
      }),
    );

    expect(manager.entityId).toBeNull();
  });
});
