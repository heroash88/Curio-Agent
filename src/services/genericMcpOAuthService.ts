import { getSecret, hasSecret, setSecret } from '../utils/secretStorage';
import { generateCodeChallenge, generateRandomString } from '../utils/haAuthUtils';
import type { GenericMcpServerConfig } from '../utils/settingsStorage';

type JsonRecord = Record<string, unknown>;

export interface GenericMcpOAuthDiscovery {
    resource: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    registrationEndpoint?: string;
    issuer?: string;
    scopesSupported?: string[];
}

interface GenericMcpOAuthClientCredentials {
    clientId: string;
    clientSecret?: string;
}

interface GenericMcpOAuthTokenBundle {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
    tokenEndpoint?: string;
    resource?: string;
    scope?: string;
    tokenType?: string;
}

interface OAuthCallbackPayload {
    type?: unknown;
    code?: unknown;
    state?: unknown;
    error?: unknown;
    error_description?: unknown;
}

interface OAuthTokenResponse {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
}

export interface GenericMcpOAuthConnectionStatus {
    connected: boolean;
    expiresAt?: number;
    hasRefreshToken?: boolean;
}

const OAUTH_RESULT_STORAGE_KEY = 'curio_oauth_result';
const TOKEN_EXPIRY_SKEW_MS = 60_000;

export const getGenericMcpOAuthTokenStorageKey = (serverId: string): string =>
    `curio_generic_mcp_oauth_token:${serverId}`;

export const getGenericMcpOAuthClientStorageKey = (serverId: string): string =>
    `curio_generic_mcp_oauth_client:${serverId}`;

const canUseMcpOAuthProxy = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        if (parsed.protocol !== 'https:') return false;
        if (
            host === 'localhost' ||
            host.endsWith('.localhost') ||
            host === '0.0.0.0' ||
            host === '::1' ||
            /^127\./.test(host) ||
            /^10\./.test(host) ||
            /^192\.168\./.test(host) ||
            /^169\.254\./.test(host)
        ) {
            return false;
        }
        const private172Match = host.match(/^172\.(\d+)\./);
        return private172Match ? Number(private172Match[1]) < 16 || Number(private172Match[1]) > 31 : true;
    } catch {
        return false;
    }
};

const getMcpOAuthProxyUrl = (url: string): string =>
    `/mcp-oauth-proxy?url=${encodeURIComponent(url)}`;

const isFetchNetworkFailure = (error: unknown): boolean =>
    error instanceof TypeError && /fetch|network|load/i.test(error.message);

const fetchWithOAuthProxyFallback = async (url: string, init: RequestInit = {}): Promise<Response> => {
    try {
        return await fetch(url, init);
    } catch (error) {
        if (isFetchNetworkFailure(error) && canUseMcpOAuthProxy(url)) {
            return fetch(getMcpOAuthProxyUrl(url), init);
        }
        throw error;
    }
};

const fetchJson = async <T,>(url: string, init: RequestInit = {}, label = 'OAuth request'): Promise<T> => {
    const response = await fetchWithOAuthProxyFallback(url, {
        ...init,
        headers: {
            Accept: 'application/json',
            ...(init.headers || {}),
        },
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
        parsed = text ? JSON.parse(text) : null;
    } catch {
        parsed = null;
    }
    if (!response.ok) {
        const message = parsed && typeof parsed === 'object'
            ? String((parsed as JsonRecord).error_description || (parsed as JsonRecord).error || response.statusText)
            : text || response.statusText;
        throw new Error(`${label} failed (${response.status}): ${message}`);
    }
    return parsed as T;
};

const readJsonSecret = async <T,>(key: string): Promise<T | null> => {
    const raw = await getSecret(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
};

const writeJsonSecret = async (key: string, value: unknown): Promise<void> => {
    await setSecret(key, JSON.stringify(value));
};

const dispatchSettingsChanged = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

const normalizeTokenBundle = (
    payload: OAuthTokenResponse,
    existing: Partial<GenericMcpOAuthTokenBundle> = {},
): GenericMcpOAuthTokenBundle => {
    if (!payload.access_token) {
        throw new Error(payload.error_description || payload.error || 'OAuth token response did not include an access token.');
    }
    return {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token || existing.refreshToken,
        expiresAt: typeof payload.expires_in === 'number'
            ? Date.now() + Math.max(0, payload.expires_in) * 1000
            : existing.expiresAt || 0,
        tokenEndpoint: existing.tokenEndpoint,
        resource: existing.resource,
        scope: payload.scope || existing.scope,
        tokenType: payload.token_type || existing.tokenType || 'Bearer',
    };
};

const getStoredClientCredentials = async (serverId: string): Promise<GenericMcpOAuthClientCredentials | null> =>
    readJsonSecret<GenericMcpOAuthClientCredentials>(getGenericMcpOAuthClientStorageKey(serverId));

const setStoredClientCredentials = async (
    serverId: string,
    credentials: GenericMcpOAuthClientCredentials,
): Promise<void> => {
    await writeJsonSecret(getGenericMcpOAuthClientStorageKey(serverId), credentials);
};

const getStoredTokenBundle = async (serverId: string): Promise<GenericMcpOAuthTokenBundle | null> =>
    readJsonSecret<GenericMcpOAuthTokenBundle>(getGenericMcpOAuthTokenStorageKey(serverId));

const setStoredTokenBundle = async (
    serverId: string,
    bundle: GenericMcpOAuthTokenBundle,
): Promise<void> => {
    await writeJsonSecret(getGenericMcpOAuthTokenStorageKey(serverId), bundle);
    dispatchSettingsChanged();
};

export const clearGenericMcpOAuthConnection = async (serverId: string): Promise<void> => {
    await setSecret(getGenericMcpOAuthTokenStorageKey(serverId), '');
    await setSecret(getGenericMcpOAuthClientStorageKey(serverId), '');
    dispatchSettingsChanged();
};

export const getGenericMcpOAuthConnectionStatus = async (
    serverId: string,
): Promise<GenericMcpOAuthConnectionStatus> => {
    const token = await getStoredTokenBundle(serverId);
    return {
        connected: Boolean(token?.accessToken),
        expiresAt: token?.expiresAt,
        hasRefreshToken: Boolean(token?.refreshToken),
    };
};

export const hasGenericMcpOAuthConnection = (serverId: string): boolean =>
    hasSecret(getGenericMcpOAuthTokenStorageKey(serverId));

export const parseMcpOAuthResourceMetadataFromAuthenticateHeader = (
    header: string | null | undefined,
): string | null => {
    if (!header) return null;
    const quoted = header.match(/resource_metadata="([^"]+)"/i);
    if (quoted?.[1]) return quoted[1];
    const unquoted = header.match(/resource_metadata=([^,\s]+)/i);
    return unquoted?.[1] || null;
};

const candidateProtectedResourceUrls = (mcpServerUrl: string, authenticateHeader?: string | null): string[] => {
    const fromHeader = parseMcpOAuthResourceMetadataFromAuthenticateHeader(authenticateHeader);
    const candidates = fromHeader ? [fromHeader] : [];
    try {
        const url = new URL(mcpServerUrl);
        const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
        candidates.push(`${url.origin}/.well-known/oauth-protected-resource${path}`);
        candidates.push(`${url.origin}/.well-known/oauth-protected-resource`);
    } catch {
        // Invalid URLs are handled when fetching below.
    }
    return [...new Set(candidates)];
};

export const discoverGenericMcpOAuthMetadata = async (
    mcpServerUrl: string,
    authenticateHeader?: string | null,
): Promise<GenericMcpOAuthDiscovery> => {
    const candidates = candidateProtectedResourceUrls(mcpServerUrl, authenticateHeader);
    let protectedResource: JsonRecord | null = null;
    let lastError: unknown = null;

    for (const url of candidates) {
        try {
            protectedResource = await fetchJson<JsonRecord>(url, {}, 'Protected resource metadata');
            break;
        } catch (error) {
            lastError = error;
        }
    }

    if (!protectedResource) {
        throw lastError instanceof Error
            ? lastError
            : new Error('Unable to discover OAuth protected resource metadata for this MCP server.');
    }

    const authorizationServers = protectedResource.authorization_servers;
    if (!Array.isArray(authorizationServers) || typeof authorizationServers[0] !== 'string') {
        throw new Error('OAuth protected resource metadata did not include an authorization server.');
    }

    const authorizationServerUrl = authorizationServers[0];
    const authServerMetadataUrl = new URL('/.well-known/oauth-authorization-server', authorizationServerUrl).toString();
    const authMetadata = await fetchJson<JsonRecord>(authServerMetadataUrl, {}, 'Authorization server metadata');
    const authorizationEndpoint = authMetadata.authorization_endpoint;
    const tokenEndpoint = authMetadata.token_endpoint;
    if (typeof authorizationEndpoint !== 'string' || typeof tokenEndpoint !== 'string') {
        throw new Error('OAuth authorization server metadata is missing required endpoints.');
    }

    const registrationEndpoint = typeof authMetadata.registration_endpoint === 'string'
        ? authMetadata.registration_endpoint
        : undefined;

    return {
        resource: typeof protectedResource.resource === 'string' ? protectedResource.resource : mcpServerUrl,
        authorizationEndpoint,
        tokenEndpoint,
        registrationEndpoint,
        issuer: typeof authMetadata.issuer === 'string' ? authMetadata.issuer : authorizationServerUrl,
        scopesSupported: Array.isArray(authMetadata.scopes_supported)
            ? authMetadata.scopes_supported.filter((scope): scope is string => typeof scope === 'string')
            : undefined,
    };
};

const registerGenericMcpOAuthClient = async (
    server: GenericMcpServerConfig,
    discovery: GenericMcpOAuthDiscovery,
    redirectUri: string,
): Promise<GenericMcpOAuthClientCredentials> => {
    const existing = await getStoredClientCredentials(server.id);
    if (existing?.clientId) return existing;

    if (!discovery.registrationEndpoint) {
        throw new Error('This OAuth MCP server does not advertise dynamic client registration.');
    }

    const registered = await fetchJson<JsonRecord>(
        discovery.registrationEndpoint,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_name: 'Curio Robot',
                client_uri: typeof window !== 'undefined' ? window.location.origin : 'https://curio.local',
                redirect_uris: [redirectUri],
                grant_types: ['authorization_code', 'refresh_token'],
                response_types: ['code'],
                token_endpoint_auth_method: 'none',
            }),
        },
        'OAuth client registration',
    );

    if (typeof registered.client_id !== 'string') {
        throw new Error('OAuth client registration did not return a client_id.');
    }

    const credentials = {
        clientId: registered.client_id,
        clientSecret: typeof registered.client_secret === 'string' ? registered.client_secret : undefined,
    };
    await setStoredClientCredentials(server.id, credentials);
    return credentials;
};

const waitForOAuthCallback = (
    popup: Window,
    expectedState: string,
): Promise<{ code: string }> => new Promise((resolve, reject) => {
    let settled = false;
    let bc: BroadcastChannel | null = null;

    const cleanup = () => {
        settled = true;
        window.removeEventListener('message', onMessage);
        clearInterval(pollCheck);
        clearTimeout(timeout);
        if (bc) {
            try { bc.close(); } catch { /* ignore */ }
        }
    };

    const handlePayload = (data: unknown, source: 'message' | 'storage') => {
        if (settled) return true;
        if (!data || typeof data !== 'object') return false;
        const payload = data as OAuthCallbackPayload;
        if (payload.type !== 'oauth-callback') return false;

        if (payload.state !== expectedState) {
            if (source === 'storage') {
                try { localStorage.removeItem(OAUTH_RESULT_STORAGE_KEY); } catch { /* ignore */ }
                return false;
            }
            cleanup();
            try { popup.close(); } catch { /* ignore */ }
            reject(new Error('OAuth state mismatch.'));
            return true;
        }

        if (typeof payload.error === 'string') {
            cleanup();
            try { popup.close(); } catch { /* ignore */ }
            reject(new Error(payload.error_description ? `${payload.error}: ${payload.error_description}` : payload.error));
            return true;
        }

        if (typeof payload.code !== 'string') return false;

        cleanup();
        try { localStorage.removeItem(OAUTH_RESULT_STORAGE_KEY); } catch { /* ignore */ }
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
                handlePayload(JSON.parse(stored), 'storage');
            }
        } catch { /* ignore */ }
    }, 250);

    const timeout = setTimeout(() => {
        if (settled) return;
        cleanup();
        try { popup.close(); } catch { /* ignore */ }
        reject(new Error('OAuth sign-in timed out.'));
    }, 5 * 60 * 1000);
});

const exchangeGenericMcpOAuthCode = async (
    discovery: GenericMcpOAuthDiscovery,
    credentials: GenericMcpOAuthClientCredentials,
    code: string,
    verifier: string,
    redirectUri: string,
): Promise<GenericMcpOAuthTokenBundle> => {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: credentials.clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource: discovery.resource,
    });
    if (credentials.clientSecret) {
        body.set('client_secret', credentials.clientSecret);
    }

    const payload = await fetchJson<OAuthTokenResponse>(
        discovery.tokenEndpoint,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
        },
        'OAuth token exchange',
    );

    return normalizeTokenBundle(payload, {
        tokenEndpoint: discovery.tokenEndpoint,
        resource: discovery.resource,
    });
};

const refreshGenericMcpOAuthToken = async (
    server: GenericMcpServerConfig,
    token: GenericMcpOAuthTokenBundle,
): Promise<GenericMcpOAuthTokenBundle> => {
    if (!token.refreshToken) {
        throw new Error(`MCP OAuth connection for ${server.name} has expired. Reconnect it in Settings.`);
    }

    const credentials = await getStoredClientCredentials(server.id);
    if (!credentials?.clientId) {
        throw new Error(`MCP OAuth client credentials for ${server.name} are missing. Reconnect it in Settings.`);
    }

    const tokenEndpoint = token.tokenEndpoint || (await discoverGenericMcpOAuthMetadata(server.url)).tokenEndpoint;
    const resource = token.resource || server.url;
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
        client_id: credentials.clientId,
        resource,
    });
    if (credentials.clientSecret) {
        body.set('client_secret', credentials.clientSecret);
    }

    const payload = await fetchJson<OAuthTokenResponse>(
        tokenEndpoint,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
        },
        'OAuth token refresh',
    );

    const refreshed = normalizeTokenBundle(payload, {
        ...token,
        tokenEndpoint,
        resource,
    });
    await setStoredTokenBundle(server.id, refreshed);
    return refreshed;
};

export const startGenericMcpOAuth = async (
    server: GenericMcpServerConfig,
    popup: Window | null,
): Promise<GenericMcpOAuthConnectionStatus> => {
    if (typeof window === 'undefined') {
        throw new Error('OAuth MCP sign-in requires a browser window.');
    }
    if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
    }

    const redirectUri = `${window.location.origin}/oauth-callback.html`;
    const discovery = await discoverGenericMcpOAuthMetadata(server.url);
    const credentials = await registerGenericMcpOAuthClient(server, discovery, redirectUri);
    const verifier = generateRandomString(64);
    const challenge = await generateCodeChallenge(verifier);
    const state = generateRandomString(32);

    const authUrl = new URL(discovery.authorizationEndpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', credentials.clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('resource', discovery.resource);
    authUrl.searchParams.set('prompt', 'consent');

    popup.location.href = authUrl.toString();

    const { code } = await waitForOAuthCallback(popup, state);
    const token = await exchangeGenericMcpOAuthCode(discovery, credentials, code, verifier, redirectUri);
    await setStoredTokenBundle(server.id, token);
    return {
        connected: true,
        expiresAt: token.expiresAt,
        hasRefreshToken: Boolean(token.refreshToken),
    };
};

export const getGenericMcpOAuthAuthHeaders = async (
    server: GenericMcpServerConfig,
): Promise<Record<string, string>> => {
    const token = await getStoredTokenBundle(server.id);
    if (!token?.accessToken) return {};

    const expired = Boolean(token.expiresAt && Date.now() >= token.expiresAt - TOKEN_EXPIRY_SKEW_MS);
    if (expired && !token.refreshToken) {
        throw new Error(`MCP OAuth connection for ${server.name} has expired. Reconnect it in Settings.`);
    }
    const usableToken = expired
        ? await refreshGenericMcpOAuthToken(server, token)
        : token;

    return { Authorization: `Bearer ${usableToken.accessToken}` };
};
