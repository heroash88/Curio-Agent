/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Home Assistant OAuth Helpers (IndieAuth with PKCE)
 *
 * Two strategies depending on the runtime environment:
 *   - Desktop / normal browser: popup-based flow (no page reload)
 *   - iOS PWA / standalone mode: redirect-based flow (page reloads,
 *     callback handled by useHaOAuthCallback on mount)
 *
 * iOS PWA doesn't support real popups -- window.open creates a new tab
 * that can't communicate back to the suspended app. The redirect flow
 * is the only reliable option there.
 */

export interface HaOAuthResult {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

const OAUTH_RESULT_STORAGE_KEY = 'curio_oauth_result';

type OAuthCallbackPayload = {
  type?: unknown;
  code?: unknown;
  state?: unknown;
};

const clearStoredOAuthResult = () => {
  try { localStorage.removeItem(OAUTH_RESULT_STORAGE_KEY); } catch { /* ignore */ }
};

// ── Helpers ────────────────────────────────────────────────────────

export function generateRandomString(length: number = 64): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let text = '';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  // crypto.subtle is only available in secure contexts (HTTPS or localhost).
  // On plain HTTP over LAN, fall back to a JS SHA-256 implementation.
  if (window.crypto?.subtle) {
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(new Uint8Array(digest));
  }
  const digest = sha256(data);
  return base64UrlEncode(digest);
}

function base64UrlEncode(a: Uint8Array): string {
  return btoa(String.fromCharCode.apply(null, Array.from(a)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── Fallback SHA-256 for non-secure contexts (HTTP over LAN) ───────

function sha256(data: Uint8Array): Uint8Array {
  // Minimal SHA-256 implementation for PKCE when crypto.subtle is unavailable.
  const K: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  const ch = (x: number, y: number, z: number) => (x & y) ^ (~x & z);
  const maj = (x: number, y: number, z: number) => (x & y) ^ (x & z) ^ (y & z);
  const sigma0 = (x: number) => rotr(2, x) ^ rotr(13, x) ^ rotr(22, x);
  const sigma1 = (x: number) => rotr(6, x) ^ rotr(11, x) ^ rotr(25, x);
  const gamma0 = (x: number) => rotr(7, x) ^ rotr(18, x) ^ (x >>> 3);
  const gamma1 = (x: number) => rotr(17, x) ^ rotr(19, x) ^ (x >>> 10);

  // Pre-processing: padding
  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const padLen = ((msgLen + 8) % 64 === 0) ? msgLen + 8 : msgLen + 64 - ((msgLen + 8) % 64);
  const padded = new Uint8Array(padLen + 8);
  padded.set(data);
  padded[msgLen] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen, false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const w = new Array<number>(64);
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) w[i] = (gamma1(w[i - 2]) + w[i - 7] + gamma0(w[i - 15]) + w[i - 16]) | 0;

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + sigma1(e) + ch(e, f, g) + K[i] + w[i]) | 0;
      const t2 = (sigma0(a) + maj(a, b, c)) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  const result = new Uint8Array(32);
  const rv = new DataView(result.buffer);
  rv.setUint32(0, h0, false); rv.setUint32(4, h1, false);
  rv.setUint32(8, h2, false); rv.setUint32(12, h3, false);
  rv.setUint32(16, h4, false); rv.setUint32(20, h5, false);
  rv.setUint32(24, h6, false); rv.setUint32(28, h7, false);
  return result;
}

function isStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );
}


// ── Redirect flow (iOS PWA / standalone) ───────────────────────────

/**
 * Starts the redirect-based OAuth flow. Stores PKCE state in localStorage
 * and navigates the current page to HA's auth endpoint. The app will
 * reload with ?code=&state= params, handled by useHaOAuthCallback.
 */
export async function startHaOAuthRedirect(haUrl: string): Promise<void> {
  const baseUrl = haUrl.replace(/\/api\/mcp\/?$/, '').replace(/\/$/, '');
  const clientId = window.location.origin;
  // Use the app's root URL as redirect -- HA will redirect back here
  const redirectUri = window.location.origin + '/';
  const state = generateRandomString(16);
  const verifier = generateRandomString(64);
  const challenge = await generateCodeChallenge(verifier);

  clearStoredOAuthResult();

  // Persist PKCE state so useHaOAuthCallback can complete the exchange
  localStorage.setItem('curio_ha_oauth_state_pending', state);
  localStorage.setItem('curio_ha_oauth_verifier_pending', verifier);
  localStorage.setItem('curio_ha_auth_url_pending', haUrl);
  localStorage.setItem('curio_ha_oauth_redirect_uri', redirectUri);

  const authUrl = new URL(`${baseUrl}/auth/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  window.location.href = authUrl.toString();
}

// ── Popup flow (desktop / normal browsers) ─────────────────────────

/**
 * Popup-based OAuth flow. The caller must pass a pre-opened popup
 * (opened synchronously from a user gesture to avoid iOS blocking).
 * Returns the token data directly -- no page reload needed.
 */
export async function loginToHomeAssistantPopup(
  haUrl: string,
  popup: Window,
): Promise<HaOAuthResult> {
  const baseUrl = haUrl.replace(/\/api\/mcp\/?$/, '').replace(/\/$/, '');
  const clientId = window.location.origin;
  const redirectUri = `${window.location.origin}/oauth-callback.html`;
  const state = generateRandomString(16);
  const verifier = generateRandomString(64);

  clearStoredOAuthResult();

  let challenge: string;
  try {
    challenge = await generateCodeChallenge(verifier);
  } catch (err) {
    popup.close();
    throw err;
  }

  const authUrl = new URL(`${baseUrl}/auth/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  popup.location.href = authUrl.toString();

  const { code } = await waitForOAuthMessage(popup, state);
  return exchangeCodeForToken(baseUrl, code, verifier, clientId, redirectUri);
}

/**
 * Unified entry point. Detects the environment and picks the right flow.
 * - Standalone/PWA: redirect flow (returns null, callback on reload)
 * - Normal browser: popup flow (returns token data)
 *
 * The caller must pass a pre-opened popup for the popup flow.
 */
export async function loginToHomeAssistant(
  haUrl: string,
  popup: Window | null,
): Promise<HaOAuthResult | null> {
  if (isStandaloneMode() || !popup) {
    // Close the popup if one was opened before we detected standalone
    if (popup) try { popup.close(); } catch { /* ignore */ }
    await startHaOAuthRedirect(haUrl);
    return null; // Page will reload
  }
  return loginToHomeAssistantPopup(haUrl, popup);
}

// ── Message listener for popup flow ────────────────────────────────

function waitForOAuthMessage(
  popup: Window,
  expectedState: string,
): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let bc: BroadcastChannel | null = null;

    const cleanup = () => {
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(pollCheck);
      clearTimeout(timeout);
      if (bc) { try { bc.close(); } catch { /* ignore */ } }
    };

    const handlePayload = (data: unknown, source: 'message' | 'storage') => {
      if (settled) return true;
      if (!data || typeof data !== 'object') return false;

      const payload = data as OAuthCallbackPayload;
      if (payload.type !== 'oauth-callback') return false;
      if (typeof payload.code !== 'string') {
        if (source === 'storage') clearStoredOAuthResult();
        return false;
      }

      if (payload.state !== expectedState) {
        if (source === 'storage') {
          clearStoredOAuthResult();
          return false;
        }

        cleanup();
        clearStoredOAuthResult();
        try { popup.close(); } catch { /* ignore */ }
        reject(new Error('OAuth state mismatch.'));
        return true;
      }

      cleanup();
      clearStoredOAuthResult();
      try { popup.close(); } catch { /* ignore */ }
      resolve({ code: payload.code });
      return true;
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      handlePayload(event.data, 'message');
    };
    window.addEventListener('message', onMessage);

    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('curio-oauth');
      bc.onmessage = (event: MessageEvent) => handlePayload(event.data, 'message');
    }

    const pollCheck = setInterval(() => {
      if (settled) return;
      try {
        const stored = localStorage.getItem(OAUTH_RESULT_STORAGE_KEY);
        if (stored) {
          if (handlePayload(JSON.parse(stored), 'storage')) return;
        }
      } catch { /* ignore */ }
    }, 500);

    const timeout = setTimeout(() => {
      if (settled) return;
      cleanup();
      try { popup.close(); } catch { /* ignore */ }
      reject(new Error('Sign-in timed out.'));
    }, 5 * 60 * 1000);
  });
}

// ── Token exchange ─────────────────────────────────────────────────

export async function exchangeCodeForToken(
  baseUrlOrHaUrl: string,
  code: string,
  verifier: string,
  clientId?: string,
  redirectUri?: string,
): Promise<HaOAuthResult> {
  const baseUrl = baseUrlOrHaUrl.replace(/\/api\/mcp\/?$/, '').replace(/\/$/, '');
  const resolvedClientId = clientId || window.location.origin;
  const resolvedRedirectUri = redirectUri || window.location.origin + '/';

  const response = await fetch(`${baseUrl}/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: resolvedClientId,
      redirect_uri: resolvedRedirectUri,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`HA OAuth exchange failed (${response.status}):`, err);
    throw new Error(`Failed to exchange code (${response.status}): ${err}`);
  }

  return response.json();
}

export async function refreshHomeAssistantToken(
  baseUrlOrHaUrl: string,
  refreshToken: string,
  clientId?: string,
): Promise<HaOAuthResult> {
  const baseUrl = baseUrlOrHaUrl.replace(/\/api\/mcp\/?$/, '').replace(/\/$/, '');
  const resolvedClientId = clientId || window.location.origin;

  const response = await fetch(`${baseUrl}/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: resolvedClientId,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`HA OAuth refresh failed (${response.status}):`, err);
    throw new Error(`Failed to refresh token (${response.status}): ${err}`);
  }

  return response.json();
}
