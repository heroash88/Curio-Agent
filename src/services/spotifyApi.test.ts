import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadSpotifyApi = async () => import('./spotifyApi');

describe('spotifyApi', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.doUnmock('../utils/secretStorage');
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const stubWindowForSpotifyAuth = (options: {
    origin?: string;
    href?: string;
    search?: string;
    open?: ReturnType<typeof vi.fn>;
    assign?: ReturnType<typeof vi.fn>;
    replaceState?: ReturnType<typeof vi.fn>;
  } = {}) => {
    const realWindow = window;
    const origin = options.origin || 'http://127.0.0.1:3000';
    const href = options.href || `${origin}/`;
    const url = new URL(href);
    const assign = options.assign || vi.fn();
    const open = options.open || vi.fn();
    const replaceState = options.replaceState || vi.fn();

    vi.stubGlobal('window', {
      location: {
        protocol: url.protocol,
        origin,
        href,
        pathname: url.pathname,
        search: options.search ?? url.search,
        hash: url.hash,
        assign,
      },
      history: {
        replaceState,
      },
      screenX: 0,
      screenY: 0,
      innerWidth: 1024,
      innerHeight: 768,
      localStorage: realWindow.localStorage,
      open,
      addEventListener: realWindow.addEventListener.bind(realWindow),
      removeEventListener: realWindow.removeEventListener.bind(realWindow),
      dispatchEvent: realWindow.dispatchEvent.bind(realWindow),
    });

    return { assign, open, replaceState };
  };

  it('uses an explicit loopback IP redirect URI when the app is opened on localhost', async () => {
    const { resolveSpotifyRedirectUri } = await loadSpotifyApi();

    expect(resolveSpotifyRedirectUri('http://localhost:8080')).toBe(
      'http://127.0.0.1:8080/oauth-callback.html',
    );
    expect(resolveSpotifyRedirectUri('http://127.0.0.1:8080')).toBe(
      'http://127.0.0.1:8080/oauth-callback.html',
    );
    expect(resolveSpotifyRedirectUri('https://curio-demo.web.app')).toBe(
      'https://curio-demo.web.app/oauth-callback.html',
    );
  });

  it('searches Spotify tracks and albums with the stored access token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tracks: {
          items: [
            {
              id: 'track_123',
              uri: 'spotify:track:track_123',
              name: 'Digital Love',
              duration_ms: 301000,
              popularity: 78,
              external_urls: { spotify: 'https://open.spotify.com/track/track_123' },
              artists: [{ name: 'Daft Punk' }],
              album: {
                name: 'Discovery',
                images: [{ url: 'https://i.scdn.co/image/track', width: 640, height: 640 }],
              },
            },
          ],
        },
        albums: {
          items: [
            {
              id: 'album_456',
              uri: 'spotify:album:album_456',
              name: 'Discovery',
              total_tracks: 14,
              release_date: '2001-03-12',
              external_urls: { spotify: 'https://open.spotify.com/album/album_456' },
              images: [{ url: 'https://i.scdn.co/image/album', width: 640, height: 640 }],
              artists: [{ name: 'Daft Punk' }],
            },
          ],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { SPOTIFY_TOKEN_STORAGE_KEY, searchSpotifyCatalog } = await loadSpotifyApi();
    window.localStorage.setItem(
      SPOTIFY_TOKEN_STORAGE_KEY,
      JSON.stringify({ accessToken: 'spotify-token', expiresAt: Date.now() + 60_000 }),
    );

    const results = await searchSpotifyCatalog('daft punk');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://api.spotify.com/v1/search?'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer spotify-token' },
      }),
    );
    expect(results).toEqual([
      expect.objectContaining({
        source: 'spotify',
        itemType: 'track',
        id: 'track_123',
        uri: 'spotify:track:track_123',
        title: 'Digital Love',
        artistOrChannel: 'Daft Punk',
        albumName: 'Discovery',
        durationSeconds: 301,
      }),
      expect.objectContaining({
        source: 'spotify',
        itemType: 'album',
        id: 'album_456',
        uri: 'spotify:album:album_456',
        title: 'Discovery',
        artistOrChannel: 'Daft Punk',
      }),
    ]);
  });

  it('starts Spotify playback with track URIs or album context URIs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);

    const { SPOTIFY_TOKEN_STORAGE_KEY, playSpotifyCatalogItem } = await loadSpotifyApi();
    window.localStorage.setItem(
      SPOTIFY_TOKEN_STORAGE_KEY,
      JSON.stringify({ accessToken: 'spotify-token', expiresAt: Date.now() + 60_000 }),
    );

    await playSpotifyCatalogItem({
      source: 'spotify',
      itemType: 'track',
      id: 'track_123',
      uri: 'spotify:track:track_123',
      title: 'Digital Love',
      artistOrChannel: 'Daft Punk',
      thumbnailUrl: '',
      query: 'digital love',
      score: 78,
    });

    await playSpotifyCatalogItem({
      source: 'spotify',
      itemType: 'album',
      id: 'album_456',
      uri: 'spotify:album:album_456',
      title: 'Discovery',
      artistOrChannel: 'Daft Punk',
      thumbnailUrl: '',
      query: 'discovery',
      score: 0,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.spotify.com/v1/me/player/play',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          Authorization: 'Bearer spotify-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: ['spotify:track:track_123'] }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.spotify.com/v1/me/player/play',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          Authorization: 'Bearer spotify-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ context_uri: 'spotify:album:album_456' }),
      }),
    );
  });

  it('opens the OAuth popup before the async PKCE challenge can lose the user gesture', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint8Array) => {
        values.fill(3);
        return values;
      },
      subtle: {
        digest: vi.fn().mockResolvedValue(new Uint8Array([9, 8, 7, 6]).buffer),
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'spotify-access-token',
        refresh_token: 'spotify-refresh-token',
        expires_in: 3600,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.doMock('../utils/secretStorage', () => ({
      getSecret: vi.fn(),
      hasSecret: vi.fn(() => false),
      setSecret: vi.fn().mockResolvedValue(undefined),
    }));

    const popup = {
      closed: false,
      close: vi.fn(() => {
        popup.closed = true;
      }),
      location: { href: 'about:blank' },
    };
    const openMock = vi.fn().mockReturnValue(popup as unknown as Window);
    stubWindowForSpotifyAuth({ open: openMock });

    const { SPOTIFY_CLIENT_ID_STORAGE_KEY, signInWithSpotify } = await loadSpotifyApi();
    window.localStorage.setItem(SPOTIFY_CLIENT_ID_STORAGE_KEY, 'spotify-client-id');

    const signInPromise = signInWithSpotify();
    const openedBeforePkceResolved = openMock.mock.calls.length > 0;

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const authUrlValue = popup.location.href === 'about:blank'
      ? (openMock.mock.calls[0]?.[0] as string)
      : popup.location.href;
    const authUrl = new URL(authUrlValue);
    const state = authUrl.searchParams.get('state');
    expect(state).toBeTruthy();

    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'oauth-callback', code: 'spotify-code', state },
      origin: window.location.origin,
    }));

    await expect(signInPromise).resolves.toBeUndefined();
    expect(openedBeforePkceResolved).toBe(true);
    expect(openMock).toHaveBeenCalledWith(
      'about:blank',
      'spotify-oauth',
      expect.stringContaining('width=500'),
    );
  });

  it('falls back to same-tab redirect when the browser blocks popups', async () => {
    const assignMock = vi.fn();
    const openMock = vi.fn(() => null);
    stubWindowForSpotifyAuth({ assign: assignMock, open: openMock });
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint8Array) => {
        values.fill(4);
        return values;
      },
      subtle: {
        digest: vi.fn().mockResolvedValue(new Uint8Array([4, 5, 6, 7]).buffer),
      },
    });

    const { SPOTIFY_CLIENT_ID_STORAGE_KEY, signInWithSpotify } = await loadSpotifyApi();
    window.localStorage.setItem(SPOTIFY_CLIENT_ID_STORAGE_KEY, 'spotify-client-id');

    void signInWithSpotify();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(assignMock).toHaveBeenCalledWith(expect.stringContaining('https://accounts.spotify.com/authorize?'));
    const redirectedUrl = new URL(assignMock.mock.calls[0][0]);
    expect(redirectedUrl.searchParams.get('client_id')).toBe('spotify-client-id');
    expect(window.localStorage.getItem('curio_spotify_auth_state')).toBeTruthy();
    expect(window.localStorage.getItem('curio_spotify_code_verifier')).toBeTruthy();
  });

  it('keeps the localhost app origin while using a 127.0.0.1 Spotify redirect URI', async () => {
    const assignMock = vi.fn();
    const popup = {
      closed: false,
      close: vi.fn(),
      location: { href: 'about:blank' },
    };
    const openMock = vi.fn().mockReturnValue(popup as unknown as Window);
    const digestMock = vi.fn().mockResolvedValue(new Uint8Array([4, 5, 6, 7]).buffer);
    stubWindowForSpotifyAuth({
      origin: 'http://localhost:3000',
      href: 'http://localhost:3000/',
      assign: assignMock,
      open: openMock,
    });
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint8Array) => {
        values.fill(6);
        return values;
      },
      subtle: {
        digest: digestMock,
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'spotify-access-token',
        refresh_token: 'spotify-refresh-token',
        expires_in: 3600,
      }),
    }));
    vi.doMock('../utils/secretStorage', () => ({
      getSecret: vi.fn(),
      hasSecret: vi.fn(() => false),
      setSecret: vi.fn().mockResolvedValue(undefined),
    }));

    const { SPOTIFY_CLIENT_ID_STORAGE_KEY, signInWithSpotify } = await loadSpotifyApi();
    window.localStorage.setItem(SPOTIFY_CLIENT_ID_STORAGE_KEY, 'spotify-client-id');

    const signInPromise = signInWithSpotify();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(assignMock).not.toHaveBeenCalled();
    expect(openMock).toHaveBeenCalled();
    expect(digestMock).toHaveBeenCalled();
    expect(window.localStorage.getItem('curio_spotify_auth_state')).toBeTruthy();
    expect(window.localStorage.getItem('curio_spotify_code_verifier')).toBeTruthy();

    const spotifyUrl = new URL(popup.location.href);
    expect(spotifyUrl.origin).toBe('https://accounts.spotify.com');
    expect(spotifyUrl.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:3000/oauth-callback.html');
    expect(spotifyUrl.searchParams.get('state')).toContain('.');

    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'oauth-callback', code: 'spotify-code', state: spotifyUrl.searchParams.get('state') },
      origin: 'http://127.0.0.1:3000',
    }));
    await expect(signInPromise).resolves.toBeUndefined();
  });

  it('falls back from localhost to same-tab Spotify auth without moving the app to 127.0.0.1 first', async () => {
    const assignMock = vi.fn();
    const openMock = vi.fn(() => null);
    stubWindowForSpotifyAuth({
      origin: 'http://localhost:3000',
      href: 'http://localhost:3000/',
      assign: assignMock,
      open: openMock,
    });
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint8Array) => {
        values.fill(8);
        return values;
      },
      subtle: {
        digest: vi.fn().mockResolvedValue(new Uint8Array([8, 7, 6, 5]).buffer),
      },
    });

    const { SPOTIFY_CLIENT_ID_STORAGE_KEY, signInWithSpotify } = await loadSpotifyApi();
    window.localStorage.setItem(SPOTIFY_CLIENT_ID_STORAGE_KEY, 'spotify-client-id');

    void signInWithSpotify();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(window.localStorage.getItem('curio_spotify_auth_state')).toBeTruthy();
    expect(window.localStorage.getItem('curio_spotify_code_verifier')).toBeTruthy();
    expect(assignMock).toHaveBeenCalledWith(expect.stringContaining('https://accounts.spotify.com/authorize?'));
    const spotifyUrl = new URL(assignMock.mock.calls[0][0]);
    expect(spotifyUrl.searchParams.get('client_id')).toBe('spotify-client-id');
    expect(spotifyUrl.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:3000/oauth-callback.html');
  });

  it('uses same-tab Spotify auth in standalone display mode', async () => {
    const assignMock = vi.fn();
    const openMock = vi.fn();
    stubWindowForSpotifyAuth({ assign: assignMock, open: openMock });
    (window as any).matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint8Array) => {
        values.fill(12);
        return values;
      },
      subtle: {
        digest: vi.fn().mockResolvedValue(new Uint8Array([1, 3, 5, 7]).buffer),
      },
    });

    const { SPOTIFY_CLIENT_ID_STORAGE_KEY, signInWithSpotify } = await loadSpotifyApi();
    window.localStorage.setItem(SPOTIFY_CLIENT_ID_STORAGE_KEY, 'spotify-client-id');

    void signInWithSpotify();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(openMock).not.toHaveBeenCalled();
    expect(assignMock).toHaveBeenCalledWith(expect.stringContaining('https://accounts.spotify.com/authorize?'));
  });

  it('completes a stored Spotify OAuth callback after the app is reloaded', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'spotify-access-token',
        refresh_token: 'spotify-refresh-token',
        expires_in: 3600,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const setSecretMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../utils/secretStorage', () => ({
      getSecret: vi.fn(),
      hasSecret: vi.fn(() => false),
      setSecret: setSecretMock,
    }));

    const { SPOTIFY_CLIENT_ID_STORAGE_KEY, completePendingSpotifySignIn } = await loadSpotifyApi();
    window.localStorage.setItem(SPOTIFY_CLIENT_ID_STORAGE_KEY, 'spotify-client-id');
    window.localStorage.setItem('curio_spotify_auth_state', 'spotify-state');
    window.localStorage.setItem('curio_spotify_code_verifier', 'spotify-verifier');
    window.localStorage.setItem('curio_oauth_result', JSON.stringify({
      type: 'oauth-callback',
      code: 'spotify-code',
      state: 'spotify-state',
    }));
    const settingsChanged = vi.fn();
    window.addEventListener('curio:settings-changed', settingsChanged);

    await expect(completePendingSpotifySignIn()).resolves.toBe(true);

    const tokenBody = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    expect(tokenBody.get('code')).toBe('spotify-code');
    expect(tokenBody.get('code_verifier')).toBe('spotify-verifier');
    expect(setSecretMock).toHaveBeenCalledWith(
      'curio_spotify_token',
      expect.stringContaining('spotify-access-token'),
    );
    expect(window.localStorage.getItem('curio_oauth_result')).toBeNull();
    expect(window.localStorage.getItem('curio_spotify_auth_state')).toBeNull();
    expect(window.localStorage.getItem('curio_spotify_code_verifier')).toBeNull();
    expect(settingsChanged).toHaveBeenCalled();

    window.removeEventListener('curio:settings-changed', settingsChanged);
  });

  it('does not cancel sign-in after the OAuth callback arrives while token exchange is pending', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint8Array) => {
        values.fill(7);
        return values;
      },
      subtle: {
        digest: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer),
      },
    });

    const fetchMock = vi.fn().mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          ok: true,
          json: async () => ({
            access_token: 'spotify-access-token',
            refresh_token: 'spotify-refresh-token',
            expires_in: 3600,
          }),
        });
      }, 4_000);
    }));
    vi.stubGlobal('fetch', fetchMock);
    const setSecretMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../utils/secretStorage', () => ({
      getSecret: vi.fn(),
      hasSecret: vi.fn(() => false),
      setSecret: setSecretMock,
    }));

    const popup = {
      closed: false,
      close: vi.fn(() => {
        popup.closed = true;
      }),
      location: { href: 'about:blank' },
    };
    const openMock = vi.fn().mockReturnValue(popup as unknown as Window);
    stubWindowForSpotifyAuth({ open: openMock });

    const { SPOTIFY_CLIENT_ID_STORAGE_KEY, signInWithSpotify } = await loadSpotifyApi();
    window.localStorage.setItem(SPOTIFY_CLIENT_ID_STORAGE_KEY, 'spotify-client-id');

    const signInPromise = signInWithSpotify();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(0);
    const authUrl = new URL(popup.location.href);
    const state = authUrl.searchParams.get('state');
    expect(state).toBeTruthy();

    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'oauth-callback', code: 'spotify-code', state },
      origin: window.location.origin,
    }));
    popup.closed = true;

    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(3_100);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(signInPromise).resolves.toBeUndefined();
    expect(setSecretMock).toHaveBeenCalledWith(
      'curio_spotify_token',
      expect.stringContaining('spotify-access-token'),
    );
  });

  it('waits for the callback when the browser reports the popup as closed from the start', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint8Array) => {
        values.fill(9);
        return values;
      },
      subtle: {
        digest: vi.fn().mockResolvedValue(new Uint8Array([5, 6, 7, 8]).buffer),
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'spotify-access-token',
        refresh_token: 'spotify-refresh-token',
        expires_in: 3600,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.doMock('../utils/secretStorage', () => ({
      getSecret: vi.fn(),
      hasSecret: vi.fn(() => false),
      setSecret: vi.fn().mockResolvedValue(undefined),
    }));

    const popup = {
      closed: true,
      close: vi.fn(),
      location: { href: 'about:blank' },
    };
    const openMock = vi.fn().mockReturnValue(popup as unknown as Window);
    stubWindowForSpotifyAuth({ open: openMock });

    const { SPOTIFY_CLIENT_ID_STORAGE_KEY, signInWithSpotify } = await loadSpotifyApi();
    window.localStorage.setItem(SPOTIFY_CLIENT_ID_STORAGE_KEY, 'spotify-client-id');

    const signInPromise = signInWithSpotify();
    const observedResult = signInPromise.then(() => 'resolved', (error) => error);
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(0);
    const authUrl = new URL(popup.location.href);
    const state = authUrl.searchParams.get('state');
    expect(state).toBeTruthy();

    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(3_600);
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'oauth-callback', code: 'spotify-code', state },
      origin: window.location.origin,
    }));
    await vi.advanceTimersByTimeAsync(0);

    await expect(observedResult).resolves.toBe('resolved');
  });

  it('keeps pending OAuth state when a popup closes before a delayed callback can resume', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint8Array) => {
        values.fill(11);
        return values;
      },
      subtle: {
        digest: vi.fn().mockResolvedValue(new Uint8Array([9, 9, 9, 9]).buffer),
      },
    });

    const popup = {
      closed: false,
      close: vi.fn(() => {
        popup.closed = true;
      }),
      location: { href: 'about:blank' },
    };
    const openMock = vi.fn().mockReturnValue(popup as unknown as Window);
    stubWindowForSpotifyAuth({ open: openMock });

    const { SPOTIFY_CLIENT_ID_STORAGE_KEY, signInWithSpotify } = await loadSpotifyApi();
    window.localStorage.setItem(SPOTIFY_CLIENT_ID_STORAGE_KEY, 'spotify-client-id');

    const signInPromise = signInWithSpotify();
    const observedResult = signInPromise.then(() => null, (error) => error);
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    popup.closed = true;
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(3_600);

    await expect(observedResult).resolves.toEqual(expect.objectContaining({
      message: 'Spotify sign-in cancelled.',
    }));
    expect(window.localStorage.getItem('curio_spotify_auth_state')).toBeTruthy();
    expect(window.localStorage.getItem('curio_spotify_code_verifier')).toBeTruthy();
  });
});
