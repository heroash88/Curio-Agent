/**
 * Google OAuth via Google Identity Services (no Firebase needed).
 *
 * Each user provides their own Google OAuth Client ID in settings.
 * The OAuth flow runs entirely client-side using Google's token endpoint.
 *
 * Token lifecycle:
 * - Implicit grant tokens expire after ~1 hour (Google-enforced).
 * - On 401, the API services first attempt a silent refresh via hidden iframe
 *   (`prompt=none`). If the user still has an active Google session, this
 *   returns a fresh token without any visible UI.
 * - If silent refresh fails (user signed out of Google, third-party cookies
 *   blocked, etc.) and the user recently interacted with the page, an
 *   interactive popup is shown.
 * - If silent refresh fails and the user is idle, the call throws so widgets
 *   can degrade gracefully until the user returns.
 */

import { getGoogleClientId } from '../utils/settingsStorage';
import { randomId } from '../utils/randomId';

const TOKEN_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

/**
 * Tracks the last user-interaction timestamp so background code can avoid
 * opening OAuth popups when the user hasn't touched the page recently.
 */
let lastUserInteractionAt = Date.now();
const USER_INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;
USER_INTERACTION_EVENTS.forEach((event) => {
  window.addEventListener(event, () => { lastUserInteractionAt = Date.now(); }, { passive: true, capture: true });
});

/** How recently a user gesture must have occurred to allow an OAuth popup (ms). */
const INTERACTION_RECENCY_MS = 30_000; // 30 seconds

/**
 * Returns true if a user gesture occurred recently enough to justify opening
 * an interactive OAuth popup. Background timer refreshes will not satisfy this.
 */
export function hasRecentUserInteraction(): boolean {
  return Date.now() - lastUserInteractionAt < INTERACTION_RECENCY_MS;
}

// ── Silent token refresh via hidden iframe ───────────────────────────────────

/** Prevents multiple silent refresh attempts from racing. */
let silentRefreshInFlight: Promise<GoogleOAuthResult> | null = null;

/**
 * Attempts to get a fresh Google access token without any user-visible UI.
 * Uses a hidden iframe pointed at Google's auth endpoint with `prompt=none`.
 * If the user still has an active Google session, Google redirects back to
 * oauth-callback.html with a new token in the hash fragment.
 *
 * Returns the new token on success, or throws if silent refresh is not possible
 * (user signed out, cookies blocked, iframe sandboxed, etc.).
 */
export async function silentRefreshGoogle(scopes: string[]): Promise<GoogleOAuthResult> {
  // Deduplicate concurrent calls
  if (silentRefreshInFlight) return silentRefreshInFlight;

  const clientId = getGoogleClientId().trim();
  if (!clientId) {
    throw new Error('Google OAuth Client ID is not configured.');
  }

  const promise = new Promise<GoogleOAuthResult>((resolve, reject) => {
    const redirectUri = window.location.origin + '/oauth-callback.html';
    const state = randomId();
    const scopeStr = scopes.join(' ');

    // Clear stale OAuth results before starting
    try { localStorage.removeItem('curio_oauth_result'); } catch { /* ignore */ }

    const authUrl = new URL(TOKEN_ENDPOINT);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', scopeStr);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('prompt', 'none');
    authUrl.searchParams.set('include_granted_scopes', 'true');

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');

    let settled = false;
    let bc: BroadcastChannel | null = null;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(pollCheck);
      clearTimeout(timeout);
      if (bc) { try { bc.close(); } catch { /* ignore */ } }
      try { document.body.removeChild(iframe); } catch { /* ignore */ }
    };

    const handlePayload = (data: any) => {
      if (settled) return;
      if (!data || data.type !== 'oauth-callback') return;
      if (!data.access_token) return;

      // Ignore stale results from a different OAuth flow
      if (data.state !== state) return;

      cleanup();
      try { localStorage.removeItem('curio_oauth_result'); } catch { /* ignore */ }

      resolve({ accessToken: data.access_token });
    };

    // Listen for the callback via postMessage
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      handlePayload(event.data);
    };
    window.addEventListener('message', onMessage);

    // BroadcastChannel fallback
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('curio-oauth');
      bc.onmessage = (event: MessageEvent) => handlePayload(event.data);
    }

    // Poll localStorage as a last resort
    const pollCheck = setInterval(() => {
      if (settled) return;
      try {
        const stored = localStorage.getItem('curio_oauth_result');
        if (stored) {
          handlePayload(JSON.parse(stored));
        }
      } catch { /* ignore */ }
    }, 300);

    // Silent refresh should complete quickly (< 10s). If it doesn't, the
    // user's Google session is likely gone or third-party cookies are blocked.
    const timeout = setTimeout(() => {
      if (settled) return;
      cleanup();
      reject(new Error('Silent token refresh timed out.'));
    }, 10_000);

    // Load the iframe — Google will either redirect with a token or with an
    // error (which won't trigger our callback, so we'll hit the timeout).
    document.body.appendChild(iframe);
    iframe.src = authUrl.toString();
  });

  silentRefreshInFlight = promise;
  promise.finally(() => { silentRefreshInFlight = null; });
  return promise;
}

interface GoogleOAuthResult {
  accessToken: string;
}

/**
 * Opens a popup to Google's OAuth consent screen and returns an access token.
 * Uses the implicit grant flow (response_type=token) so no backend is needed.
 */
export async function signInWithGoogle(scopes: string[]): Promise<GoogleOAuthResult> {
  const clientId = getGoogleClientId().trim();
  if (!clientId) {
    throw new Error(
      'Google OAuth Client ID is not configured. Add it in Settings > Integrations.',
    );
  }

  const redirectUri = window.location.origin + '/oauth-callback.html';
  const state = randomId();
  const scopeStr = scopes.join(' ');

  const authUrl = new URL(TOKEN_ENDPOINT);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', scopeStr);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('include_granted_scopes', 'true');

  // Clear any stale OAuth result from a previous attempt so it doesn't
  // get picked up immediately by the poll/focus handlers below.
  try { localStorage.removeItem('curio_oauth_result'); } catch { /* ignore */ }

  return new Promise((resolve, reject) => {
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;

    const popup = window.open(
      authUrl.toString(),
      'google-oauth',
      `width=${width},height=${height},left=${left},top=${top}`,
    );

    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups for this site.'));
      return;
    }

    let settled = false;
    let bc: BroadcastChannel | null = null;

    const cleanup = () => {
      settled = true;
      window.removeEventListener('message', onMessage);
      window.removeEventListener('focus', onFocus);
      clearInterval(pollCheck);
      clearTimeout(timeout);
      if (bc) { try { bc.close(); } catch { /* ignore */ } }
    };

    const handlePayload = (data: any) => {
      if (settled) return;
      if (!data || data.type !== 'oauth-callback') return;
      if (!data.access_token) return;

      // Check state BEFORE cleanup so a mismatched (stale) result doesn't
      // consume this flow. Just ignore it and keep waiting for the real one.
      if (data.state !== state) return;

      cleanup();
      try { localStorage.removeItem('curio_oauth_result'); } catch { /* ignore */ }
      try { popup.close(); } catch { /* ignore */ }

      resolve({ accessToken: data.access_token });
    };

    // Channel 1: postMessage from popup
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      handlePayload(event.data);
    };
    window.addEventListener('message', onMessage);

    // Channel 2: BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('curio-oauth');
      bc.onmessage = (event: MessageEvent) => handlePayload(event.data);
    }

    // Channel 4: When focus returns to this window (popup closed), check
    // localStorage immediately in case the polling interval hasn't fired yet.
    const onFocus = () => {
      if (settled) return;
      try {
        const stored = localStorage.getItem('curio_oauth_result');
        if (stored) handlePayload(JSON.parse(stored));
      } catch { /* ignore */ }
    };
    window.addEventListener('focus', onFocus);

    // Channel 3: Poll localStorage for the OAuth result.
    // We intentionally do NOT check popup.closed here. On Windows, browsers
    // report popup.closed=true when the popup navigates cross-origin to
    // Google's auth pages, causing false "cancelled" errors. Instead we rely
    // on the 5-minute timeout as the only cancellation mechanism.
    const pollCheck = setInterval(() => {
      if (settled) return;

      try {
        const stored = localStorage.getItem('curio_oauth_result');
        if (stored) {
          handlePayload(JSON.parse(stored));
        }
      } catch { /* ignore */ }
    }, 500);

    // Timeout after 5 minutes
    const timeout = setTimeout(() => {
      if (settled) return;
      cleanup();
      try { popup.close(); } catch { /* ignore */ }
      reject(new Error('Sign-in timed out.'));
    }, 5 * 60 * 1000);
  });
}

/** Convenience: no-op sign out (tokens are just cleared from localStorage). */
export function googleSignOut(): void {
  // Nothing to do server-side -- tokens are local-only.
}
