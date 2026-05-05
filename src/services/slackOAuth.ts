/**
 * Slack OAuth via implicit grant flow.
 *
 * NOTE: Slack's standard OAuth requires a server-side code exchange.
 * For a fully client-side flow, users can alternatively paste a Bot User
 * OAuth Token directly in settings. This module supports the popup flow
 * for Slack apps configured with the "token rotation" or user-token grant.
 *
 * If the user provides a token directly, this module is not needed.
 */

import { getSlackClientId } from '../utils/settingsStorage';
import { randomId } from '../utils/randomId';

const AUTH_ENDPOINT = 'https://slack.com/oauth/v2/authorize';

interface SlackOAuthResult {
    accessToken: string;
}

/**
 * Opens a popup to Slack's OAuth consent screen.
 * Slack OAuth v2 requires a server-side code exchange for bot tokens,
 * but user tokens can use the implicit flow with user_scope.
 */
export async function signInWithSlack(userScopes: string[]): Promise<SlackOAuthResult> {
    const clientId = getSlackClientId().trim();
    if (!clientId) {
        throw new Error(
            'Slack Client ID is not configured. Add it in Settings > Accounts & Keys.',
        );
    }

    const redirectUri = window.location.origin + '/oauth-callback.html';
    const state = randomId();

    const authUrl = new URL(AUTH_ENDPOINT);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('user_scope', userScopes.join(','));
    authUrl.searchParams.set('state', state);

    return new Promise((resolve, reject) => {
        const width = 500;
        const height = 700;
        const left = window.screenX + (window.innerWidth - width) / 2;
        const top = window.screenY + (window.innerHeight - height) / 2;

        const popup = window.open(
            authUrl.toString(),
            'slack-oauth',
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
            // Slack returns a code for server-side exchange, or access_token for implicit
            if (!data.access_token && !data.code) return;

            cleanup();
            try { localStorage.removeItem('curio_oauth_result'); } catch { /* ignore */ }
            try { popup.close(); } catch { /* ignore */ }

            if (data.state !== state) {
                reject(new Error('OAuth state mismatch.'));
                return;
            }

            if (data.access_token) {
                resolve({ accessToken: data.access_token });
            } else {
                // Code-based flow -- user should paste token directly instead
                reject(new Error('Slack OAuth returned a code. Please paste your Bot Token directly in Settings instead.'));
            }
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

export function slackSignOut(): void {
    // Tokens are local-only.
}
