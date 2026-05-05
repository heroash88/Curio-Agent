/**
 * Microsoft OAuth via Azure AD implicit grant flow (no backend needed).
 *
 * Each user provides their own Azure AD App (Client) ID in settings.
 * Uses the same popup + postMessage + BroadcastChannel pattern as googleOAuth.ts.
 */

import { getMicrosoftClientId } from '../utils/settingsStorage';
import { randomId } from '../utils/randomId';

const AUTH_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';

// ── Silent token refresh via hidden iframe ───────────────────────────────────

/** Prevents multiple silent refresh attempts from racing. */
let silentRefreshInFlight: Promise<MicrosoftOAuthResult> | null = null;

/**
 * Attempts to get a fresh Microsoft access token without any user-visible UI.
 * Uses a hidden iframe pointed at Microsoft's auth endpoint with `prompt=none`.
 */
export async function silentRefreshMicrosoft(scopes: string[]): Promise<MicrosoftOAuthResult> {
  if (silentRefreshInFlight) return silentRefreshInFlight;

  const clientId = getMicrosoftClientId().trim();
  if (!clientId) {
    throw new Error('Microsoft OAuth Client ID is not configured.');
  }

  const promise = new Promise<MicrosoftOAuthResult>((resolve, reject) => {
    const redirectUri = window.location.origin + '/oauth-callback.html';
    const state = randomId();
    const scopeStr = scopes.join(' ');

    const authUrl = new URL(AUTH_ENDPOINT);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', scopeStr);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('prompt', 'none');

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

      cleanup();
      try { localStorage.removeItem('curio_oauth_result'); } catch { /* ignore */ }

      if (data.state !== state) {
        reject(new Error('OAuth state mismatch during silent refresh.'));
        return;
      }

      resolve({ accessToken: data.access_token });
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      handlePayload(event.data);
    };
    window.addEventListener('message', onMessage);

    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('curio-oauth');
      bc.onmessage = (event: MessageEvent) => handlePayload(event.data);
    }

    const pollCheck = setInterval(() => {
      if (settled) return;
      try {
        const stored = localStorage.getItem('curio_oauth_result');
        if (stored) { handlePayload(JSON.parse(stored)); }
      } catch { /* ignore */ }
    }, 300);

    const timeout = setTimeout(() => {
      if (settled) return;
      cleanup();
      reject(new Error('Silent token refresh timed out.'));
    }, 10_000);

    document.body.appendChild(iframe);
    iframe.src = authUrl.toString();
  });

  silentRefreshInFlight = promise;
  promise.finally(() => { silentRefreshInFlight = null; });
  return promise;
}

interface MicrosoftOAuthResult {
    accessToken: string;
}

/**
 * Opens a popup to Microsoft's OAuth consent screen and returns an access token.
 * Uses the implicit grant flow (response_type=token) so no backend is needed.
 */
export async function signInWithMicrosoft(scopes: string[]): Promise<MicrosoftOAuthResult> {
    const clientId = getMicrosoftClientId().trim();
    if (!clientId) {
        throw new Error(
            'Microsoft OAuth Client ID is not configured. Add it in Settings > Accounts & Keys.',
        );
    }

    const redirectUri = window.location.origin + '/oauth-callback.html';
    const state = randomId();
    const scopeStr = scopes.join(' ');

    const authUrl = new URL(AUTH_ENDPOINT);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', scopeStr);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('prompt', 'consent');

    return new Promise((resolve, reject) => {
        const width = 500;
        const height = 600;
        const left = window.screenX + (window.innerWidth - width) / 2;
        const top = window.screenY + (window.innerHeight - height) / 2;

        const popup = window.open(
            authUrl.toString(),
            'microsoft-oauth',
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
            clearInterval(pollCheck);
            clearTimeout(timeout);
            if (bc) { try { bc.close(); } catch { /* ignore */ } }
        };

        const handlePayload = (data: any) => {
            if (settled) return;
            if (!data || data.type !== 'oauth-callback') return;
            if (!data.access_token) return;

            cleanup();
            try { localStorage.removeItem('curio_oauth_result'); } catch { /* ignore */ }
            try { popup.close(); } catch { /* ignore */ }

            if (data.state !== state) {
                reject(new Error('OAuth state mismatch.'));
                return;
            }

            resolve({ accessToken: data.access_token });
        };

        const onMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            handlePayload(event.data);
        };
        window.addEventListener('message', onMessage);

        if (typeof BroadcastChannel !== 'undefined') {
            bc = new BroadcastChannel('curio-oauth');
            bc.onmessage = (event: MessageEvent) => handlePayload(event.data);
        }

        let popupClosedSince: number | null = null;
        const CLOSED_GRACE_MS = 3000;

        const pollCheck = setInterval(() => {
            if (settled) return;
            try {
                const stored = localStorage.getItem('curio_oauth_result');
                if (stored) { handlePayload(JSON.parse(stored)); return; }
            } catch { /* ignore */ }
            try {
                if (popup.closed) {
                    if (popupClosedSince === null) {
                        popupClosedSince = Date.now();
                    } else if (Date.now() - popupClosedSince > CLOSED_GRACE_MS) {
                        cleanup();
                        reject(new Error('Sign-in cancelled.'));
                    }
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

export function microsoftSignOut(): void {
    // Tokens are local-only -- nothing to do server-side.
}
