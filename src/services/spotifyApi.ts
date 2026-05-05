import { getSecret, hasSecret, setSecret } from '../utils/secretStorage';
import { randomId } from '../utils/randomId';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
const SPOTIFY_AUTH_STATE_STORAGE_KEY = 'curio_spotify_auth_state';
const SPOTIFY_CODE_VERIFIER_STORAGE_KEY = 'curio_spotify_code_verifier';
const OAUTH_RESULT_STORAGE_KEY = 'curio_oauth_result';
const SPOTIFY_STATE_METADATA_SEPARATOR = '.';
const SPOTIFY_TOKEN_EXPIRY_SKEW_MS = 30_000;

export const SPOTIFY_CLIENT_ID_STORAGE_KEY = 'curio_spotify_client_id';
export const SPOTIFY_TOKEN_STORAGE_KEY = 'curio_spotify_token';

export type SpotifyCatalogItemType = 'track' | 'album' | 'artist' | 'playlist';

export interface SpotifyCatalogItem {
  source: 'spotify';
  itemType: SpotifyCatalogItemType;
  id: string;
  uri: string;
  title: string;
  artistOrChannel: string;
  thumbnailUrl: string;
  query: string;
  score: number;
  albumName?: string;
  durationSeconds?: number;
  externalUrl?: string;
  releaseDate?: string;
  totalTracks?: number;
}

interface SpotifyTokenBundle {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

interface SpotifyTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface SpotifyImage {
  url?: string;
  width?: number;
  height?: number;
}

interface SpotifyArtistRef {
  name?: string;
}

interface SpotifyTrackItem {
  id?: string;
  uri?: string;
  name?: string;
  duration_ms?: number;
  popularity?: number;
  external_urls?: { spotify?: string };
  artists?: SpotifyArtistRef[];
  album?: {
    name?: string;
    images?: SpotifyImage[];
  };
}

interface SpotifyAlbumItem {
  id?: string;
  uri?: string;
  name?: string;
  total_tracks?: number;
  release_date?: string;
  external_urls?: { spotify?: string };
  images?: SpotifyImage[];
  artists?: SpotifyArtistRef[];
}

interface SpotifyArtistItem {
  id?: string;
  uri?: string;
  name?: string;
  popularity?: number;
  external_urls?: { spotify?: string };
  images?: SpotifyImage[];
}

interface SpotifyPlaylistItem {
  id?: string;
  uri?: string;
  name?: string;
  external_urls?: { spotify?: string };
  images?: SpotifyImage[];
  owner?: { display_name?: string };
}

interface SpotifySearchPayload {
  tracks?: { items?: SpotifyTrackItem[] };
  albums?: { items?: SpotifyAlbumItem[] };
  artists?: { items?: SpotifyArtistItem[] };
  playlists?: { items?: SpotifyPlaylistItem[] };
}

interface SpotifyCurrentlyPlayingPayload {
  is_playing?: boolean;
  progress_ms?: number | null;
  item?: SpotifyTrackItem | null;
}

interface SpotifyOAuthCallbackPayload {
  type?: string;
  code?: string;
  state?: string;
}

export interface SpotifyNowPlaying {
  isPlaying: boolean;
  progressSeconds: number;
  item: SpotifyCatalogItem | null;
}

const safeWindow = () => (typeof window === 'undefined' ? null : window);

const readJson = async <T,>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const buildSpotifyError = async (response: Response, fallback: string): Promise<Error> => {
  const payload = await readJson<{ error?: { message?: string; reason?: string } | string; error_description?: string }>(response);
  const apiMessage =
    (typeof payload?.error === 'object' && payload.error.message)
    || (typeof payload?.error === 'string' ? payload.error : '')
    || payload?.error_description
    || response.statusText
    || fallback;

  if (response.status === 403) {
    return new Error(`${apiMessage}. Spotify playback control requires a Premium account and an active Spotify device.`);
  }

  if (response.status === 404) {
    return new Error(`${apiMessage}. Open Spotify on one of your devices, start any track once, then try Curio again.`);
  }

  return new Error(apiMessage);
};

const selectImage = (images?: SpotifyImage[]): string => {
  if (!Array.isArray(images) || images.length === 0) return '';
  return images
    .slice()
    .sort((left, right) => (right.width || 0) - (left.width || 0))
    .find((image) => image.url)?.url || '';
};

const formatArtists = (artists?: SpotifyArtistRef[]): string =>
  Array.isArray(artists) && artists.length > 0
    ? artists.map((artist) => artist.name).filter(Boolean).join(', ')
    : 'Spotify';

const normalizeTokenBundle = (value: unknown): SpotifyTokenBundle | null => {
  if (!value || typeof value !== 'object') return null;
  const maybeToken = value as Partial<SpotifyTokenBundle>;
  if (!maybeToken.accessToken || typeof maybeToken.accessToken !== 'string') return null;
  return {
    accessToken: maybeToken.accessToken,
    refreshToken: typeof maybeToken.refreshToken === 'string' ? maybeToken.refreshToken : undefined,
    expiresAt: typeof maybeToken.expiresAt === 'number' ? maybeToken.expiresAt : 0,
  };
};

const readStoredSpotifyToken = async (): Promise<SpotifyTokenBundle | null> => {
  const win = safeWindow();
  if (!win) return null;

  const raw = win.localStorage.getItem(SPOTIFY_TOKEN_STORAGE_KEY);
  if (!raw) return null;

  const serialized = raw.startsWith('enc::')
    ? await getSecret(SPOTIFY_TOKEN_STORAGE_KEY)
    : raw;

  if (!serialized) return null;

  try {
    return normalizeTokenBundle(JSON.parse(serialized));
  } catch {
    return null;
  }
};

const persistSpotifyToken = async (token: SpotifyTokenBundle): Promise<void> => {
  await setSecret(SPOTIFY_TOKEN_STORAGE_KEY, JSON.stringify(token));
};

const clearPendingSpotifyOAuth = (win: Window): void => {
  win.localStorage.removeItem(SPOTIFY_AUTH_STATE_STORAGE_KEY);
  win.localStorage.removeItem(SPOTIFY_CODE_VERIFIER_STORAGE_KEY);
};

const clearStoredOAuthResult = (win: Window): void => {
  try { win.localStorage.removeItem(OAUTH_RESULT_STORAGE_KEY); } catch { /* ignore */ }
};

const dispatchSpotifyConnectionChanged = (win: Window): void => {
  win.dispatchEvent(new Event('storage'));
  win.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

const readStoredOAuthResult = (win: Window): SpotifyOAuthCallbackPayload | null => {
  try {
    const stored = win.localStorage.getItem(OAUTH_RESULT_STORAGE_KEY);
    if (!stored) return null;
    const payload = JSON.parse(stored) as SpotifyOAuthCallbackPayload;
    return payload?.type === 'oauth-callback' ? payload : null;
  } catch {
    return null;
  }
};

const encodeBase64UrlString = (value: string): string =>
  btoa(value)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const createSpotifyOAuthState = (win: Window): string => {
  const nonce = randomId();
  const metadata = encodeBase64UrlString(JSON.stringify({ returnOrigin: win.location.origin }));
  return `${nonce}${SPOTIFY_STATE_METADATA_SEPARATOR}${metadata}`;
};

const prepareSpotifyAuthorizationUrl = async (
  win: Window,
  clientId: string,
  redirectUri: string,
): Promise<URL> => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = createSpotifyOAuthState(win);
  const scope = [
    'user-read-currently-playing',
    'user-read-playback-state',
    'user-modify-playback-state',
  ].join(' ');

  win.localStorage.setItem(SPOTIFY_AUTH_STATE_STORAGE_KEY, state);
  win.localStorage.setItem(SPOTIFY_CODE_VERIFIER_STORAGE_KEY, codeVerifier);
  clearStoredOAuthResult(win);

  const authUrl = new URL(SPOTIFY_AUTH_URL);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('code_challenge', codeChallenge);

  return authUrl;
};

export const resolveSpotifyRedirectUri = (origin?: string): string => {
  const baseOrigin = origin || safeWindow()?.location.origin || '';
  const redirectUrl = new URL('/oauth-callback.html', baseOrigin);

  if (redirectUrl.hostname === 'localhost') {
    redirectUrl.hostname = '127.0.0.1';
  }

  return redirectUrl.toString();
};

export const getSpotifyClientId = (): string => {
  const win = safeWindow();
  const stored = win?.localStorage.getItem(SPOTIFY_CLIENT_ID_STORAGE_KEY) || '';
  if (stored.trim()) return stored.trim();
  return (import.meta.env.VITE_SPOTIFY_CLIENT_ID || '').trim();
};

export const setSpotifyClientId = (clientId: string): void => {
  const win = safeWindow();
  if (!win) return;

  const trimmed = clientId.trim();
  if (trimmed) {
    win.localStorage.setItem(SPOTIFY_CLIENT_ID_STORAGE_KEY, trimmed);
  } else {
    win.localStorage.removeItem(SPOTIFY_CLIENT_ID_STORAGE_KEY);
  }
  win.dispatchEvent(new Event('storage'));
  win.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const getSpotifyAuthStatus = () => ({
  hasClientId: Boolean(getSpotifyClientId()),
  connected: hasSecret(SPOTIFY_TOKEN_STORAGE_KEY),
  redirectUri: resolveSpotifyRedirectUri(),
});

const isStandaloneDisplayMode = (win: Window): boolean => {
  const browserWindow = win as Window & {
    matchMedia?: (query: string) => MediaQueryList;
    navigator?: Navigator & { standalone?: boolean };
  };

  const mediaStandalone =
    typeof browserWindow.matchMedia === 'function' &&
    browserWindow.matchMedia('(display-mode: standalone)').matches;
  const legacyIOSStandalone = browserWindow.navigator?.standalone === true;

  return mediaStandalone || legacyIOSStandalone;
};

const isIOSLikeBrowser = (win: Window): boolean => {
  const nav = (win as Window & { navigator?: Navigator }).navigator;
  if (!nav) return false;

  const userAgent = nav.userAgent || '';
  const platform = nav.platform || '';
  const maxTouchPoints = nav.maxTouchPoints || 0;
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
};

const shouldUseSameTabSpotifyAuth = (win: Window): boolean =>
  isStandaloneDisplayMode(win) || isIOSLikeBrowser(win);

const generateCodeVerifier = (): string => {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('Spotify sign-in requires Web Crypto.');
  }

  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(64));
  return Array.from(values, (value) => possible[value % possible.length]).join('');
};

const base64UrlEncode = (input: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const createCodeChallenge = async (verifier: string): Promise<string> => {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Spotify sign-in requires crypto.subtle. Use HTTPS or a loopback IP address.');
  }

  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
};

const exchangeSpotifyCode = async (
  code: string,
  codeVerifier: string,
  redirectUri = resolveSpotifyRedirectUri(),
): Promise<SpotifyTokenBundle> => {
  const clientId = getSpotifyClientId();
  if (!clientId) {
    throw new Error('Spotify Client ID is not configured.');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw await buildSpotifyError(response, 'Spotify token exchange failed.');
  }

  const payload = await readJson<SpotifyTokenResponse>(response);
  if (!payload?.access_token) {
    throw new Error(payload?.error_description || 'Spotify did not return an access token.');
  }

  const token = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + Math.max(0, payload.expires_in || 3600) * 1000,
  };
  await persistSpotifyToken(token);
  return token;
};

export const refreshSpotifyAccessToken = async (): Promise<string> => {
  const clientId = getSpotifyClientId();
  const storedToken = await readStoredSpotifyToken();

  if (!clientId) {
    throw new Error('Spotify Client ID is not configured.');
  }

  if (!storedToken?.refreshToken) {
    throw new Error('Spotify is not connected. Sign in to Spotify first.');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: storedToken.refreshToken,
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw await buildSpotifyError(response, 'Spotify token refresh failed.');
  }

  const payload = await readJson<SpotifyTokenResponse>(response);
  if (!payload?.access_token) {
    throw new Error(payload?.error_description || 'Spotify did not refresh the access token.');
  }

  const refreshedToken = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || storedToken.refreshToken,
    expiresAt: Date.now() + Math.max(0, payload.expires_in || 3600) * 1000,
  };
  await persistSpotifyToken(refreshedToken);
  return refreshedToken.accessToken;
};

export const getSpotifyAccessToken = async (): Promise<string> => {
  const storedToken = await readStoredSpotifyToken();
  if (!storedToken) {
    throw new Error('Spotify is not connected. Sign in to Spotify first.');
  }

  if (storedToken.expiresAt > Date.now() + SPOTIFY_TOKEN_EXPIRY_SKEW_MS) {
    return storedToken.accessToken;
  }

  return refreshSpotifyAccessToken();
};

const spotifyFetch = async (path: string, init: RequestInit = {}, retry = true): Promise<Response> => {
  const accessToken = await getSpotifyAccessToken();
  const response = await fetch(`${SPOTIFY_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });

  if (response.status === 401 && retry) {
    await refreshSpotifyAccessToken();
    return spotifyFetch(path, init, false);
  }

  if (!response.ok) {
    throw await buildSpotifyError(response, `Spotify request failed with status ${response.status}.`);
  }

  return response;
};

const mapSpotifyTrack = (query: string, item: SpotifyTrackItem): SpotifyCatalogItem | null => {
  if (!item.id || !item.uri || !item.name) return null;

  return {
    source: 'spotify',
    itemType: 'track',
    id: item.id,
    uri: item.uri,
    title: item.name,
    artistOrChannel: formatArtists(item.artists),
    thumbnailUrl: selectImage(item.album?.images),
    query,
    score: item.popularity || 0,
    albumName: item.album?.name,
    durationSeconds: item.duration_ms ? Math.round(item.duration_ms / 1000) : undefined,
    externalUrl: item.external_urls?.spotify,
  };
};

const mapSpotifyAlbum = (query: string, item: SpotifyAlbumItem): SpotifyCatalogItem | null => {
  if (!item.id || !item.uri || !item.name) return null;

  return {
    source: 'spotify',
    itemType: 'album',
    id: item.id,
    uri: item.uri,
    title: item.name,
    artistOrChannel: formatArtists(item.artists),
    thumbnailUrl: selectImage(item.images),
    query,
    score: 0,
    releaseDate: item.release_date,
    totalTracks: item.total_tracks,
    externalUrl: item.external_urls?.spotify,
  };
};

const mapSpotifyArtist = (query: string, item: SpotifyArtistItem): SpotifyCatalogItem | null => {
  if (!item.id || !item.uri || !item.name) return null;

  return {
    source: 'spotify',
    itemType: 'artist',
    id: item.id,
    uri: item.uri,
    title: item.name,
    artistOrChannel: 'Artist',
    thumbnailUrl: selectImage(item.images),
    query,
    score: item.popularity || 0,
    externalUrl: item.external_urls?.spotify,
  };
};

const mapSpotifyPlaylist = (query: string, item: SpotifyPlaylistItem): SpotifyCatalogItem | null => {
  if (!item.id || !item.uri || !item.name) return null;

  return {
    source: 'spotify',
    itemType: 'playlist',
    id: item.id,
    uri: item.uri,
    title: item.name,
    artistOrChannel: item.owner?.display_name || 'Playlist',
    thumbnailUrl: selectImage(item.images),
    query,
    score: 0,
    externalUrl: item.external_urls?.spotify,
  };
};

export const searchSpotifyCatalog = async (
  query: string,
  options: { limit?: number; types?: SpotifyCatalogItemType[] } = {},
): Promise<SpotifyCatalogItem[]> => {
  const sanitizedQuery = query.trim();
  if (!sanitizedQuery) return [];

  const types = options.types || ['track', 'album', 'artist', 'playlist'];
  const params = new URLSearchParams({
    q: sanitizedQuery,
    type: types.join(','),
    limit: String(options.limit ?? 5),
  });

  const response = await spotifyFetch(`/search?${params.toString()}`);
  const payload = await readJson<SpotifySearchPayload>(response);

  if (!payload) return [];

  return [
    ...(payload.tracks?.items || []).map((item) => mapSpotifyTrack(sanitizedQuery, item)),
    ...(payload.albums?.items || []).map((item) => mapSpotifyAlbum(sanitizedQuery, item)),
    ...(payload.artists?.items || []).map((item) => mapSpotifyArtist(sanitizedQuery, item)),
    ...(payload.playlists?.items || []).map((item) => mapSpotifyPlaylist(sanitizedQuery, item)),
  ].filter((item): item is SpotifyCatalogItem => Boolean(item));
};

const buildSpotifyPlayBody = (item: SpotifyCatalogItem) => {
  if (item.itemType === 'track' || item.uri.startsWith('spotify:track:')) {
    return { uris: [item.uri] };
  }

  return { context_uri: item.uri };
};

export const playSpotifyCatalogItem = async (item: SpotifyCatalogItem): Promise<void> => {
  await spotifyFetch('/me/player/play', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSpotifyPlayBody(item)),
  });
};

export const pauseSpotifyPlayback = async (): Promise<void> => {
  await spotifyFetch('/me/player/pause', { method: 'PUT' });
};

export const resumeSpotifyPlayback = async (): Promise<void> => {
  await spotifyFetch('/me/player/play', { method: 'PUT' });
};

export const seekSpotifyPlayback = async (positionSeconds: number): Promise<void> => {
  const params = new URLSearchParams({
    position_ms: String(Math.max(0, Math.round(positionSeconds * 1000))),
  });
  await spotifyFetch(`/me/player/seek?${params.toString()}`, { method: 'PUT' });
};

export const setSpotifyVolume = async (volume: number): Promise<void> => {
  const params = new URLSearchParams({
    volume_percent: String(Math.max(0, Math.min(100, Math.round(volume)))),
  });
  await spotifyFetch(`/me/player/volume?${params.toString()}`, { method: 'PUT' });
};

export const getSpotifyCurrentlyPlaying = async (): Promise<SpotifyNowPlaying | null> => {
  const response = await spotifyFetch('/me/player/currently-playing?additional_types=track,episode');
  if (response.status === 204) return null;

  const payload = await readJson<SpotifyCurrentlyPlayingPayload>(response);
  if (!payload) return null;

  const item = payload.item ? mapSpotifyTrack('', payload.item) : null;
  return {
    isPlaying: payload.is_playing === true,
    progressSeconds: payload.progress_ms ? Math.round(payload.progress_ms / 1000) : 0,
    item,
  };
};

export const signOutSpotify = async (): Promise<void> => {
  const win = safeWindow();
  if (!win) return;

  await setSecret(SPOTIFY_TOKEN_STORAGE_KEY, '');
  clearPendingSpotifyOAuth(win);
  clearStoredOAuthResult(win);
  dispatchSpotifyConnectionChanged(win);
};

const isAllowedOAuthOrigin = (origin: string, redirectUri: string): boolean => {
  const win = safeWindow();
  if (!win) return false;

  return origin === win.location.origin || origin === new URL(redirectUri).origin;
};

export const completePendingSpotifySignIn = async (): Promise<boolean> => {
  const win = safeWindow();
  if (!win) return false;

  const payload = readStoredOAuthResult(win);
  if (!payload?.code || !payload.state) return false;

  const storedState = win.localStorage.getItem(SPOTIFY_AUTH_STATE_STORAGE_KEY);
  const storedVerifier = win.localStorage.getItem(SPOTIFY_CODE_VERIFIER_STORAGE_KEY);
  if (!storedState || !storedVerifier) return false;

  if (payload.state !== storedState) {
    clearPendingSpotifyOAuth(win);
    clearStoredOAuthResult(win);
    throw new Error('Spotify OAuth state mismatch.');
  }

  try {
    await exchangeSpotifyCode(payload.code, storedVerifier, resolveSpotifyRedirectUri());
    clearPendingSpotifyOAuth(win);
    clearStoredOAuthResult(win);
    dispatchSpotifyConnectionChanged(win);
    return true;
  } catch (error) {
    clearPendingSpotifyOAuth(win);
    clearStoredOAuthResult(win);
    throw error;
  }
};

export const signInWithSpotify = async (): Promise<void> => {
  const win = safeWindow();
  if (!win) {
    throw new Error('Spotify sign-in requires a browser window.');
  }

  const clientId = getSpotifyClientId();
  if (!clientId) {
    throw new Error('Spotify Client ID is not configured. Add it in Settings > Accounts & Keys.');
  }

  const redirectUri = resolveSpotifyRedirectUri();
  if (win.location.protocol === 'file:') {
    throw new Error('Spotify sign-in requires Curio to run from HTTPS or a loopback IP address.');
  }

  if (shouldUseSameTabSpotifyAuth(win)) {
    const authUrl = await prepareSpotifyAuthorizationUrl(win, clientId, redirectUri);
    win.location.assign(authUrl.toString());
    return new Promise<void>(() => undefined);
  }

  const width = 500;
  const height = 700;
  const left = win.screenX + (win.innerWidth - width) / 2;
  const top = win.screenY + (win.innerHeight - height) / 2;
  const popup = win.open(
    'about:blank',
    'spotify-oauth',
    `width=${width},height=${height},left=${left},top=${top}`,
  );

  try {
    const authUrl = await prepareSpotifyAuthorizationUrl(win, clientId, redirectUri);

    if (!popup) {
      win.location.assign(authUrl.toString());
      return new Promise<void>(() => undefined);
    }

    popup.location.href = authUrl.toString();
  } catch (error) {
    try { popup?.close(); } catch { /* ignore */ }
    clearPendingSpotifyOAuth(win);
    throw error;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let tokenExchangeStarted = false;
    let popupWasObservedOpen = false;
    let bc: BroadcastChannel | null = null;

    const cleanup = (options: { clearPending?: boolean } = {}) => {
      const { clearPending = true } = options;
      settled = true;
      win.removeEventListener('message', onMessage);
      clearInterval(pollCheck);
      clearTimeout(timeout);
      if (bc) {
        try { bc.close(); } catch { /* ignore */ }
      }
      if (clearPending) {
        clearPendingSpotifyOAuth(win);
      }
    };

    const handlePayload = (data: any, origin?: string) => {
      if (settled) return;
      if (!data || data.type !== 'oauth-callback') return;
      if (!data.code || !data.state) return;
      if (origin && !isAllowedOAuthOrigin(origin, redirectUri)) return;

      const storedState = win.localStorage.getItem(SPOTIFY_AUTH_STATE_STORAGE_KEY);
      const storedVerifier = win.localStorage.getItem(SPOTIFY_CODE_VERIFIER_STORAGE_KEY);

      if (data.state !== storedState || !storedVerifier) {
        cleanup();
        reject(new Error('Spotify OAuth state mismatch.'));
        return;
      }

      tokenExchangeStarted = true;
      void exchangeSpotifyCode(data.code, storedVerifier, redirectUri)
        .then(() => {
          cleanup();
          clearStoredOAuthResult(win);
          try { popup.close(); } catch { /* ignore */ }
          dispatchSpotifyConnectionChanged(win);
          resolve();
        })
        .catch((error) => {
          cleanup();
          reject(error);
        });
    };

    const onMessage = (event: MessageEvent) => {
      handlePayload(event.data, event.origin);
    };
    win.addEventListener('message', onMessage);

    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('curio-oauth');
      bc.onmessage = (event: MessageEvent) => handlePayload(event.data);
    }

    let popupClosedSince: number | null = null;
    const pollCheck = setInterval(() => {
      if (settled) return;
      try {
        const storedPayload = readStoredOAuthResult(win);
        if (storedPayload) {
          handlePayload(storedPayload);
          return;
        }
      } catch { /* ignore */ }

      try {
        const popupIsClosed = popup.closed;
        if (!popupIsClosed) {
          popupWasObservedOpen = true;
          popupClosedSince = null;
        } else if (!tokenExchangeStarted && popupWasObservedOpen) {
          if (popupClosedSince === null) {
            popupClosedSince = Date.now();
          } else if (Date.now() - popupClosedSince > 3000) {
            cleanup({ clearPending: false });
            reject(new Error('Spotify sign-in cancelled.'));
          }
        }
      } catch { /* ignore */ }
    }, 500);

    const timeout = setTimeout(() => {
      if (settled) return;
      cleanup();
      try { popup.close(); } catch { /* ignore */ }
      reject(new Error('Spotify sign-in timed out.'));
    }, 5 * 60 * 1000);
  });
};
