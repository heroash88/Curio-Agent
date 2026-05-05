/**
 * Early-boot runtime config loader.
 *
 * Reads optional query parameters at page load and exposes them via
 * globals that other modules check. Currently handles:
 *
 *   ?novaProxy=<url>   Base URL of a bundled Nova Sonic WebSocket proxy.
 *                      Used by Electron (main process injects the URL
 *                      after it spawns the local proxy).
 *
 * Must run before any service that reads window.__CURIO_NOVA_PROXY__.
 * Import this as the first side-effect in index.tsx.
 */

declare global {
    interface Window {
        __CURIO_NOVA_PROXY__?: string;
        __CURIO_DESKTOP_ROLE__?: string;
    }
}

export function loadRuntimeConfig(): void {
    if (typeof window === 'undefined') return;

    try {
        const params = new URLSearchParams(window.location.search);
        const novaProxy = params.get('novaProxy');
        const desktopRole = params.get('desktopRole');
        if (desktopRole) {
            window.__CURIO_DESKTOP_ROLE__ = desktopRole;
        }
        if (novaProxy) {
            window.__CURIO_NOVA_PROXY__ = novaProxy;
            // Persist so it survives SPA navigations and reloads that
            // drop the query param. Safe to overwrite each boot.
            try { sessionStorage.setItem('curio_nova_proxy_runtime', novaProxy); } catch { /* ignore */ }
        } else {
            // Fall back to a value captured earlier in this session.
            try {
                const saved = sessionStorage.getItem('curio_nova_proxy_runtime');
                if (saved) window.__CURIO_NOVA_PROXY__ = saved;
            } catch { /* ignore */ }
        }
    } catch { /* URL parsing failures should never block app boot */ }
}
