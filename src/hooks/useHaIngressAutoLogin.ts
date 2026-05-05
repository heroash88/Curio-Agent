import { useEffect } from 'react';
import {
    setHaMcpToken,
    setHaMcpEnabled,
    setHaMcpAuthMode,
    setHaMcpUrl,
    getHaMcpUrl,
} from '../utils/settingsStorage';

/**
 * Runtime config written by run.sh when the addon has a SUPERVISOR_TOKEN.
 */
interface HaRuntimeConfig {
    haIngress: boolean;
    supervisorToken: string;
}

/**
 * Derives the base URL for the current ingress session.
 * In ingress, the app is served at /api/hassio_ingress/<token>/.
 * All fetch requests need to go through this base path so the
 * HA Supervisor proxies them to the addon container.
 *
 * Falls back to window.location.origin for non-ingress contexts.
 */
function getIngressBase(): string {
    const path = window.location.pathname;
    // Match /api/hassio_ingress/<token> prefix
    const match = path.match(/^(\/api\/hassio_ingress\/[^/]+)/);
    if (match) return `${window.location.origin}${match[1]}`;
    // Not in ingress -- use origin directly
    return window.location.origin;
}

/**
 * Auto-configures the HA connection when running inside a Home Assistant
 * ingress panel. The addon's run.sh writes ha-runtime-config.json with
 * the SUPERVISOR_TOKEN at container startup. This hook fetches that file
 * on mount and, if found, sets up the HA connection automatically --
 * no manual token entry or OAuth flow needed.
 *
 * The nginx config proxies /ha-proxy/* to the HA Core API using the
 * supervisor token server-side, so the browser uses relative URLs.
 *
 * NOTE: This runs every mount and will overwrite `curio_ha_mcp_url` if
 * the stored URL doesn't match the current ingress origin. That's
 * deliberate -- the same browser profile is used both for direct addon
 * access (http://<host>:8099) and via HA ingress (https://<ha>/...),
 * and each needs a different base URL. Without this rewrite, a user
 * who first configured HA on the direct port would see HA "connected"
 * from ingress but all requests would fail because they're pointed at
 * a host that isn't reachable from HA's origin.
 */
export const useHaIngressAutoLogin = (): void => {
    useEffect(() => {
        let cancelled = false;

        const tryAutoLogin = async () => {
            try {
                const res = await fetch('./ha-runtime-config.json', {
                    cache: 'no-store',
                });
                if (!res.ok) return; // Not running in HA addon

                const config: HaRuntimeConfig = await res.json();
                if (cancelled || !config.haIngress || !config.supervisorToken) return;

                // The nginx proxy at /ha-proxy/ forwards to http://supervisor/core/
                // so /ha-proxy/api/services -> /core/api/services on the supervisor.
                // In ingress mode the app is served under
                // /api/hassio_ingress/<token>/, so the full URL the browser must
                // hit is <origin>/api/hassio_ingress/<token>/ha-proxy.
                const base = getIngressBase();
                const proxyBaseUrl = `${base}/ha-proxy`;
                const existingUrl = getHaMcpUrl();

                // Always store the ingress flag -- other code uses it for
                // environment detection (see utils/environment.ts).
                localStorage.setItem('curio_ha_ingress', 'true');

                if (existingUrl === proxyBaseUrl) {
                    // Already configured for this ingress origin. Nothing to do.
                    return;
                }

                console.log('[HA Ingress] Runtime config detected -- (re)configuring HA connection for', proxyBaseUrl);

                // Token is used by haMcpService for the Authorization header,
                // but nginx overrides it server-side for proxied requests anyway.
                await setHaMcpToken(config.supervisorToken);
                setHaMcpUrl(proxyBaseUrl);
                setHaMcpAuthMode('token');
                setHaMcpEnabled(true);

                console.log('[HA Ingress] HA connection auto-configured via supervisor token');
            } catch {
                // Silently ignore -- not running in HA addon context
            }
        };

        tryAutoLogin();

        return () => { cancelled = true; };
    }, []);
};
