import { afterEach, describe, expect, it, vi } from 'vitest';

import { loginToHomeAssistantPopup, refreshHomeAssistantToken } from './haAuthUtils';

describe('Home Assistant OAuth helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('ignores a stale stored OAuth callback before accepting the current popup callback', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer),
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'ha-access-token',
        refresh_token: 'ha-refresh-token',
        expires_in: 3600,
      }),
    }));

    const popup = {
      closed: false,
      close: vi.fn(() => {
        popup.closed = true;
      }),
      location: { href: 'about:blank' },
    };

    const signIn = loginToHomeAssistantPopup(
      'http://homeassistant.local:8123',
      popup as unknown as Window,
    );

    await vi.advanceTimersByTimeAsync(0);

    const authUrl = new URL(popup.location.href);
    const state = authUrl.searchParams.get('state');
    expect(state).toBeTruthy();

    window.localStorage.setItem('curio_oauth_result', JSON.stringify({
      type: 'oauth-callback',
      code: 'old-code',
      state: 'old-state',
    }));
    await vi.advanceTimersByTimeAsync(500);

    window.localStorage.setItem('curio_oauth_result', JSON.stringify({
      type: 'oauth-callback',
      code: 'current-code',
      state,
    }));
    await vi.advanceTimersByTimeAsync(500);

    await expect(signIn).resolves.toMatchObject({
      access_token: 'ha-access-token',
    });

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const tokenBody = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    expect(tokenBody.get('code')).toBe('current-code');
    expect(window.localStorage.getItem('curio_oauth_result')).toBeNull();
  });

  it('does not cancel when Chrome reports the cross-origin auth popup as closed before callback', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn().mockResolvedValue(new Uint8Array([4, 3, 2, 1]).buffer),
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'ha-access-token',
        refresh_token: 'ha-refresh-token',
        expires_in: 3600,
      }),
    }));

    const popup = {
      closed: false,
      close: vi.fn(() => {
        popup.closed = true;
      }),
      location: { href: 'about:blank' },
    };

    const signIn = loginToHomeAssistantPopup(
      'http://homeassistant.local:8123',
      popup as unknown as Window,
    );
    const observed = signIn.then(
      (result) => result.access_token,
      (error: Error) => `rejected:${error.message}`,
    );

    await vi.advanceTimersByTimeAsync(0);

    const authUrl = new URL(popup.location.href);
    const state = authUrl.searchParams.get('state');
    expect(state).toBeTruthy();

    popup.closed = true;
    await vi.advanceTimersByTimeAsync(4_100);

    window.localStorage.setItem('curio_oauth_result', JSON.stringify({
      type: 'oauth-callback',
      code: 'current-code',
      state,
    }));
    await vi.advanceTimersByTimeAsync(500);

    await expect(observed).resolves.toBe('ha-access-token');
  });

  it('refreshes an OAuth access token with the stored refresh token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-ha-access-token',
        refresh_token: 'new-ha-refresh-token',
        expires_in: 1800,
      }),
    }));

    await expect(
      refreshHomeAssistantToken('http://homeassistant.local:8123/api/mcp', 'old-refresh-token'),
    ).resolves.toMatchObject({
      access_token: 'new-ha-access-token',
      refresh_token: 'new-ha-refresh-token',
      expires_in: 1800,
    });

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      'http://homeassistant.local:8123/auth/token',
      expect.objectContaining({ method: 'POST' }),
    );
    const tokenBody = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    expect(tokenBody.get('grant_type')).toBe('refresh_token');
    expect(tokenBody.get('refresh_token')).toBe('old-refresh-token');
  });
});
