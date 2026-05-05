import { useEffect } from 'react';
import {
    setHaMcpOAuthTokens,
    setHaMcpEnabled,
    setHaMcpAuthMode,
    setHaMcpUrl,
} from '../utils/settingsStorage';

/**
 * Handles the HA OAuth redirect callback on app load.
 *
 * When the redirect-based OAuth flow is used (iOS PWA / standalone mode),
 * HA redirects back to the app's root URL with ?code=&state= params.
 * This hook detects those params, exchanges the code for a token using
 * the PKCE verifier stored in localStorage, and persists the connection.
 */
export const useHaOAuthCallback = (): void => {
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');

        if (!code || !state) return;

        const pendingState = localStorage.getItem('curio_ha_oauth_state_pending');
        const pendingVerifier = localStorage.getItem('curio_ha_oauth_verifier_pending');
        const pendingUrl = localStorage.getItem('curio_ha_auth_url_pending');
        const pendingRedirectUri = localStorage.getItem('curio_ha_oauth_redirect_uri');

        if (state !== pendingState || !pendingVerifier || !pendingUrl) {
            // Not our OAuth callback -- could be something else with code/state
            return;
        }

        // Clean the URL immediately so a refresh doesn't re-trigger
        window.history.replaceState({}, '', window.location.origin + window.location.pathname);

        // Clear pending state before async work
        localStorage.removeItem('curio_ha_oauth_state_pending');
        localStorage.removeItem('curio_ha_oauth_verifier_pending');
        localStorage.removeItem('curio_ha_auth_url_pending');
        localStorage.removeItem('curio_ha_oauth_redirect_uri');

        const redirectUri = pendingRedirectUri || window.location.origin + '/';

        import('../utils/haAuthUtils').then(async ({ exchangeCodeForToken }) => {
            try {
                const tokenData = await exchangeCodeForToken(
                    pendingUrl,
                    code,
                    pendingVerifier,
                    window.location.origin,
                    redirectUri,
                );

                await setHaMcpOAuthTokens(tokenData);
                setHaMcpAuthMode('oauth');
                setHaMcpUrl(pendingUrl);
                setHaMcpEnabled(true);
                console.log('Home Assistant connected via OAuth (redirect flow)!');
            } catch (error) {
                console.error('HA OAuth exchange failed:', error);
            }
        });
    }, []);
};
