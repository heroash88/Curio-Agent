/**
 * Environment utility functions
 * 
 * Provides environment detection that can be mocked in tests
 */

/**
 * Check if the application is running in production mode
 * @returns true if in production, false otherwise
 */
export const isProduction = (): boolean => {
  try {
    return import.meta.env.PROD;
  } catch {
    // Fallback for test environments that don't support import.meta
    return process.env.NODE_ENV === 'production';
  }
};

/**
 * Check if the application is running in development mode
 * @returns true if in development, false otherwise
 */
export const isDevelopment = (): boolean => {
  return !isProduction();
};

/**
 * Check if the application is running inside Electron.
 * Detects the Electron user-agent string injected by the runtime.
 */
export const isElectron = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /electron/i.test(navigator.userAgent);
};

/**
 * Check if the application is running inside a Home Assistant ingress panel.
 * HA ingress embeds the addon in an iframe under /api/hassio_ingress/<token>/.
 * We detect this by checking the URL path or the presence of the runtime config
 * flag set during a previous auto-login.
 */
export const isHomeAssistantIngress = (): boolean => {
  if (typeof window === 'undefined') return false;
  // Check if we previously detected ingress and stored the flag
  if (localStorage.getItem('curio_ha_ingress') === 'true') return true;
  // Check if the URL contains the HA ingress path pattern
  if (/\/api\/hassio_ingress\//.test(window.location.pathname)) return true;
  // Check if we're in an iframe (ingress loads addons in iframes)
  try {
    if (window.self !== window.top) return true;
  } catch {
    // Cross-origin iframe -- likely ingress
    return true;
  }
  return false;
};

/**
 * Returns the base URL for the app, accounting for HA ingress.
 * In ingress: "http://ha-host:8123/api/hassio_ingress/<token>"
 * Normal:    "http://localhost:8080" (just the origin)
 */
export const getAppBaseUrl = (): string => {
  if (typeof window === 'undefined') return '';
  const path = window.location.pathname;
  const match = path.match(/^(\/api\/hassio_ingress\/[^/]+)/);
  if (match) return `${window.location.origin}${match[1]}`;
  return window.location.origin;
};
