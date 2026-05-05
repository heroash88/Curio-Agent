import { getSecret, hasSecret, setSecret } from '../secretStorage';
import { HA_SMART_HOME_REVIEW_MCP_URL, HA_SMART_HOME_REVIEW_TOKEN, isHaSmartHomeReviewMode } from '../../services/haSmartHomeMock';
import { useSettingsStorageValue } from './core';

const boolSetting = (key: string, fallback: boolean) => {
    const get = (): boolean => {
        if (typeof window === 'undefined') return fallback;
        const val = localStorage.getItem(key);
        return val === null ? fallback : val === 'true';
    };
    const set = (v: boolean) => {
        localStorage.setItem(key, v.toString());
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('curio:settings-changed'));
    };
    return { get, set };
};

export const DEFAULT_HA_URL = 'http://homeassistant.local:8123';
export const DEFAULT_HA_TOKEN = '';
const HA_ACCESS_TOKEN_KEY = 'curio_ha_mcp_token';
const HA_REFRESH_TOKEN_KEY = 'curio_ha_mcp_refresh_token';
const HA_TOKEN_EXPIRES_AT_KEY = 'curio_ha_mcp_token_expires_at';
const HA_TOKEN_REFRESH_SKEW_MS = 60_000;

export const getHaMcpUrl = () => {
    if (typeof window === 'undefined') return DEFAULT_HA_URL;
    if (isHaSmartHomeReviewMode()) return HA_SMART_HOME_REVIEW_MCP_URL;
    return localStorage.getItem('curio_ha_mcp_url') || DEFAULT_HA_URL;
};

export const getHaMcpToken = () => {
    if (typeof window === 'undefined') return DEFAULT_HA_TOKEN;
    if (isHaSmartHomeReviewMode()) return HA_SMART_HOME_REVIEW_TOKEN;
    return localStorage.getItem(HA_ACCESS_TOKEN_KEY) || DEFAULT_HA_TOKEN;
};

const readSecretWithRawFallback = async (key: string): Promise<string> => {
    const val = await getSecret(key);
    if (val) return val;
    const raw = localStorage.getItem(key) || '';
    if (raw && !raw.startsWith('enc::')) return raw;
    return '';
};

const getStoredHaTokenExpiry = () => {
    const raw = Number(localStorage.getItem(HA_TOKEN_EXPIRES_AT_KEY) || 0);
    return Number.isFinite(raw) ? raw : 0;
};

/** Async version that decrypts the HA token from encrypted storage. */
export const getHaMcpTokenAsync = async (
    options: { forceRefresh?: boolean } = {},
): Promise<string> => {
    if (isHaSmartHomeReviewMode()) return HA_SMART_HOME_REVIEW_TOKEN;
    const accessToken = await readSecretWithRawFallback(HA_ACCESS_TOKEN_KEY);
    const authMode = getHaMcpAuthMode();
    if (authMode !== 'oauth') return accessToken || DEFAULT_HA_TOKEN;

    const refreshToken = await readSecretWithRawFallback(HA_REFRESH_TOKEN_KEY);
    const expiresAt = getStoredHaTokenExpiry();
    const shouldRefresh = Boolean(
        refreshToken &&
        (options.forceRefresh || !accessToken || !expiresAt || Date.now() >= expiresAt - HA_TOKEN_REFRESH_SKEW_MS),
    );
    if (!shouldRefresh) return accessToken || DEFAULT_HA_TOKEN;

    try {
        const { refreshHomeAssistantToken } = await import('../haAuthUtils');
        const tokenData = await refreshHomeAssistantToken(getHaMcpUrl(), refreshToken);
        await setHaMcpOAuthTokens({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || refreshToken,
            expires_in: tokenData.expires_in,
        });
        return tokenData.access_token;
    } catch (error) {
        console.warn('[SettingsStorage] Failed to refresh Home Assistant OAuth token:', error);
        return accessToken || DEFAULT_HA_TOKEN;
    }
};

export const getHaMcpEnabled = () => {
    if (typeof window === 'undefined') return false;
    if (isHaSmartHomeReviewMode()) return true;
    return localStorage.getItem('curio_ha_mcp_enabled') === 'true';
};

export const getHaMcpAuthMode = () => {
    if (typeof window === 'undefined') return 'token';
    return (localStorage.getItem('curio_ha_mcp_auth_mode') as 'token' | 'oauth') || 'token';
};

export type HaApiMode = 'mcp' | 'rest';

export const getHaApiMode = (): HaApiMode => {
    if (isHaSmartHomeReviewMode()) return 'rest';
    // Derive from auth mode: OAuth -> MCP, Token -> REST
    const authMode = getHaMcpAuthMode();
    return authMode === 'oauth' ? 'mcp' : 'rest';
};

export const getHaMcpOauthState = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_ha_mcp_oauth_state') || '';
};


export const useHaMcpUrl = () => useSettingsStorageValue(getHaMcpUrl, DEFAULT_HA_URL);
export const useHaMcpToken = () => useSettingsStorageValue(getHaMcpToken, DEFAULT_HA_TOKEN);
export const useHaMcpEnabled = () => useSettingsStorageValue(getHaMcpEnabled, false);
export const useHaMcpAuthMode = () => useSettingsStorageValue(getHaMcpAuthMode, 'token');
export const useHaApiMode = () => useSettingsStorageValue(getHaApiMode, 'rest' as HaApiMode);
export const useHaMcpOauthState = () => useSettingsStorageValue(getHaMcpOauthState, '');

// --- HA Entity Filter ---
// Stores entity IDs that the user has excluded from AI control.
// All entities are exposed by default; only excluded ones are stored.
const HA_EXCLUDED_ENTITIES_KEY = 'curio_ha_excluded_entities';

export const getHaExcludedEntities = (): Set<string> => {
    if (typeof window === 'undefined') return new Set();
    try {
        const raw = localStorage.getItem(HA_EXCLUDED_ENTITIES_KEY);
        if (!raw) return new Set();
        return new Set(JSON.parse(raw) as string[]);
    } catch {
        return new Set();
    }
};

export const setHaExcludedEntities = (excluded: Set<string>) => {
    localStorage.setItem(HA_EXCLUDED_ENTITIES_KEY, JSON.stringify([...excluded]));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const isHaEntityExcluded = (entityId: string): boolean => {
    return getHaExcludedEntities().has(entityId);
};

export const toggleHaEntityExclusion = (entityId: string) => {
    const excluded = getHaExcludedEntities();
    if (excluded.has(entityId)) {
        excluded.delete(entityId);
    } else {
        excluded.add(entityId);
    }
    setHaExcludedEntities(excluded);
};

export const useHaExcludedEntities = () => useSettingsStorageValue(
    () => [...getHaExcludedEntities()],
    [] as string[],
);

export const setHaMcpUrl = (url: string) => {
    localStorage.setItem('curio_ha_mcp_url', url);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setHaMcpToken = async (token: string) => {
    await setSecret(HA_ACCESS_TOKEN_KEY, token);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setHaMcpOAuthTokens = async (tokenData: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
}) => {
    await setSecret(HA_ACCESS_TOKEN_KEY, tokenData.access_token);
    if (tokenData.refresh_token) {
        await setSecret(HA_REFRESH_TOKEN_KEY, tokenData.refresh_token);
    }
    if (typeof tokenData.expires_in === 'number' && Number.isFinite(tokenData.expires_in)) {
        localStorage.setItem(
            HA_TOKEN_EXPIRES_AT_KEY,
            String(Date.now() + Math.max(0, tokenData.expires_in) * 1000),
        );
    } else {
        localStorage.removeItem(HA_TOKEN_EXPIRES_AT_KEY);
    }
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setHaMcpEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_ha_mcp_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setHaMcpAuthMode = (mode: 'token' | 'oauth') => {
    localStorage.setItem('curio_ha_mcp_auth_mode', mode);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setHaApiMode = (mode: HaApiMode) => {
    localStorage.setItem('curio_ha_api_mode', mode);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setHaMcpOauthState = (state: string) => {
    localStorage.setItem('curio_ha_mcp_oauth_state', state);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const getYouTubeApiKey = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_youtube_api_key') || '';
};
export const useYouTubeApiKey = () => useSettingsStorageValue(getYouTubeApiKey, '');

/** Async version that decrypts the YouTube API key from encrypted storage. */
export const getYouTubeApiKeyAsync = async (): Promise<string> => {
    const val = await getSecret('curio_youtube_api_key');
    if (val) return val;
    // Fallback: legacy plaintext stored directly
    const raw = localStorage.getItem('curio_youtube_api_key') || '';
    if (raw && !raw.startsWith('enc::')) return raw;
    return '';
};

export const getGoogleApiKey = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_google_api_key') || '';
};
export const useGoogleApiKey = () => useSettingsStorageValue(getGoogleApiKey, '');

/** Async version that decrypts the Google API key from encrypted storage. */
export const getGoogleApiKeyAsync = async (): Promise<string> => {
    const val = await getSecret('curio_google_api_key');
    if (val) return val;
    // Fallback: legacy plaintext stored directly
    const raw = localStorage.getItem('curio_google_api_key') || '';
    if (raw && !raw.startsWith('enc::')) return raw;
    return '';
};

export const getGoogleClientId = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_google_client_id') || '';
};
export const useGoogleClientId = () => useSettingsStorageValue(getGoogleClientId, '');

export const getGoogleAccessToken = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_google_access_token') || '';
};
export const useGoogleAccessToken = () => useSettingsStorageValue(getGoogleAccessToken, '');

export const getGoogleSelectedAlbumId = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_google_album_id') || '';
};
export const useGoogleSelectedAlbumId = () => useSettingsStorageValue(getGoogleSelectedAlbumId, '');

export const getPickerPhotoUrls = (): string[] => {
    if (typeof window === 'undefined') return [];
    try {
        return JSON.parse(localStorage.getItem('curio_picker_photo_urls') || '[]');
    } catch { return []; }
};
// Google Photos Picker baseUrls expire after ~60 minutes.
// We also store the session ID and a fetch timestamp so the Screensaver
// can refresh URLs from the session when they go stale.
export const getPickerSessionId = (): string =>
    typeof window !== 'undefined' ? localStorage.getItem('curio_picker_session_id') || '' : '';
export const getPickerUrlsTimestamp = (): number =>
    typeof window !== 'undefined' ? parseInt(localStorage.getItem('curio_picker_urls_ts') || '0', 10) : 0;

export const setPickerPhotoUrls = (urls: string[], sessionId?: string) => {
    localStorage.setItem('curio_picker_photo_urls', JSON.stringify(urls));
    localStorage.setItem('curio_picker_urls_ts', Date.now().toString());
    if (sessionId) localStorage.setItem('curio_picker_session_id', sessionId);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setGoogleClientId = (id: string) => {
    localStorage.setItem('curio_google_client_id', id);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setGoogleAccessToken = (token: string) => {
    localStorage.setItem('curio_google_access_token', token);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const getGoogleTasksAccessToken = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_google_tasks_access_token') || '';
};
export const useGoogleTasksAccessToken = () => useSettingsStorageValue(getGoogleTasksAccessToken, '');

export const setGoogleTasksAccessToken = (token: string) => {
    localStorage.setItem('curio_google_tasks_access_token', token);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const getGoogleCalendarAccessToken = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_google_calendar_access_token') || '';
};
export const useGoogleCalendarAccessToken = () => useSettingsStorageValue(getGoogleCalendarAccessToken, '');

export const setGoogleCalendarAccessToken = (token: string) => {
    localStorage.setItem('curio_google_calendar_access_token', token);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setGoogleSelectedAlbumId = (id: string) => {
    localStorage.setItem('curio_google_album_id', id);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};


export const setYouTubeApiKey = async (key: string) => {
    await setSecret('curio_youtube_api_key', key);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setGoogleApiKey = async (key: string) => {
    await setSecret('curio_google_api_key', key);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

// ---------------------------------------------------------------------------
// Obsidian Local REST API settings
// ---------------------------------------------------------------------------
export const DEFAULT_OBSIDIAN_URL = 'http://127.0.0.1:27123';

export const getObsidianUrl = (): string => {
    if (typeof window === 'undefined') return DEFAULT_OBSIDIAN_URL;
    return localStorage.getItem('curio_obsidian_url') || DEFAULT_OBSIDIAN_URL;
};
export const setObsidianUrl = (url: string) => {
    localStorage.setItem('curio_obsidian_url', url);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useObsidianUrl = () => useSettingsStorageValue(getObsidianUrl, DEFAULT_OBSIDIAN_URL);

export const getObsidianApiKey = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_obsidian_api_key') || '';
};
export const setObsidianApiKey = (key: string) => {
    localStorage.setItem('curio_obsidian_api_key', key);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useObsidianApiKey = () => useSettingsStorageValue(getObsidianApiKey, '');

const obsidianEnabled = boolSetting('curio_obsidian_enabled', false);
export const getObsidianEnabled = obsidianEnabled.get;
export const setObsidianEnabled = obsidianEnabled.set;
export const useObsidianEnabled = () => useSettingsStorageValue(getObsidianEnabled, false);

// ---------------------------------------------------------------------------
// Gmail settings
// ---------------------------------------------------------------------------
export const getGmailAccessToken = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_gmail_access_token') || '';
};
export const setGmailAccessToken = (token: string) => {
    localStorage.setItem('curio_gmail_access_token', token);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useGmailAccessToken = () => useSettingsStorageValue(getGmailAccessToken, '');

/** When false, the AI is blocked from sending replies. Default: false (replies off). */
export const getGmailReplyEnabled = (): boolean => {
    if (typeof window === 'undefined') return false;
    const val = localStorage.getItem('curio_gmail_reply_enabled');
    return val === 'true';
};
export const setGmailReplyEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_gmail_reply_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useGmailReplyEnabled = () => useSettingsStorageValue(getGmailReplyEnabled, false);

// ---------------------------------------------------------------------------
// Microsoft Outlook settings
// ---------------------------------------------------------------------------
export const getMicrosoftClientId = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_microsoft_client_id') || '';
};
export const setMicrosoftClientId = (id: string) => {
    localStorage.setItem('curio_microsoft_client_id', id);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useMicrosoftClientId = () => useSettingsStorageValue(getMicrosoftClientId, '');

export const getOutlookCalendarAccessToken = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_outlook_calendar_token') || '';
};
export const setOutlookCalendarAccessToken = (token: string) => {
    localStorage.setItem('curio_outlook_calendar_token', token);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useOutlookCalendarAccessToken = () => useSettingsStorageValue(getOutlookCalendarAccessToken, '');

export const getOutlookMailAccessToken = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_outlook_mail_token') || '';
};
export const setOutlookMailAccessToken = (token: string) => {
    localStorage.setItem('curio_outlook_mail_token', token);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useOutlookMailAccessToken = () => useSettingsStorageValue(getOutlookMailAccessToken, '');

export const getOutlookReplyEnabled = (): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('curio_outlook_reply_enabled') === 'true';
};
export const setOutlookReplyEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_outlook_reply_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useOutlookReplyEnabled = () => useSettingsStorageValue(getOutlookReplyEnabled, false);

// ---------------------------------------------------------------------------
// Slack settings
// ---------------------------------------------------------------------------
export const getSlackClientId = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_slack_client_id') || '';
};
export const setSlackClientId = (id: string) => {
    localStorage.setItem('curio_slack_client_id', id);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useSlackClientId = () => useSettingsStorageValue(getSlackClientId, '');

export const getSlackAccessToken = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_slack_token') || '';
};
export const setSlackAccessToken = (token: string) => {
    localStorage.setItem('curio_slack_token', token);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useSlackAccessToken = () => useSettingsStorageValue(getSlackAccessToken, '');


// ---------------------------------------------------------------------------
// GitHub settings
// ---------------------------------------------------------------------------
// The GitHub dashboard widget, proactive notifications engine, and AI
// tool handler all share these settings. Auth mode can be:
//   - 'pat'   (default): a fine-grained or classic personal access token.
//   - 'oauth': an OAuth web/device-flow token, same header shape.
//   - 'mcp'  : route requests through the built-in `github-remote` MCP
//              server configured in Accounts & Keys.
export type GitHubAuthMode = 'pat' | 'oauth' | 'mcp';
export const DEFAULT_GITHUB_AUTH_MODE: GitHubAuthMode = 'pat';
export const DEFAULT_GITHUB_BASE_URL = 'https://api.github.com';

const GITHUB_TOKEN_KEY = 'curio_github_access_token';
const GITHUB_USERNAME_KEY = 'curio_github_username';
const GITHUB_BASE_URL_KEY = 'curio_github_base_url';
const GITHUB_AUTH_MODE_KEY = 'curio_github_auth_mode';
const GITHUB_DEFAULT_REPO_KEY = 'curio_github_default_repo';

export const getGitHubAuthMode = (): GitHubAuthMode => {
    if (typeof window === 'undefined') return DEFAULT_GITHUB_AUTH_MODE;
    const raw = localStorage.getItem(GITHUB_AUTH_MODE_KEY);
    if (raw === 'pat' || raw === 'oauth' || raw === 'mcp') return raw;
    return DEFAULT_GITHUB_AUTH_MODE;
};
export const setGitHubAuthMode = (mode: GitHubAuthMode) => {
    localStorage.setItem(GITHUB_AUTH_MODE_KEY, mode);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useGitHubAuthMode = () => useSettingsStorageValue(getGitHubAuthMode, DEFAULT_GITHUB_AUTH_MODE);

export const getGitHubUsername = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(GITHUB_USERNAME_KEY) || '';
};
export const setGitHubUsername = (login: string) => {
    localStorage.setItem(GITHUB_USERNAME_KEY, login);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useGitHubUsername = () => useSettingsStorageValue(getGitHubUsername, '');

export const getGitHubBaseUrl = (): string => {
    if (typeof window === 'undefined') return DEFAULT_GITHUB_BASE_URL;
    return localStorage.getItem(GITHUB_BASE_URL_KEY) || DEFAULT_GITHUB_BASE_URL;
};
export const setGitHubBaseUrl = (url: string) => {
    localStorage.setItem(GITHUB_BASE_URL_KEY, url || DEFAULT_GITHUB_BASE_URL);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useGitHubBaseUrl = () => useSettingsStorageValue(getGitHubBaseUrl, DEFAULT_GITHUB_BASE_URL);

export const getGitHubDefaultRepo = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(GITHUB_DEFAULT_REPO_KEY) || '';
};
export const setGitHubDefaultRepo = (repo: string) => {
    localStorage.setItem(GITHUB_DEFAULT_REPO_KEY, repo);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useGitHubDefaultRepo = () => useSettingsStorageValue(getGitHubDefaultRepo, '');

/**
 * Sync read used by hooks that need a cheap "is connected?" bool. Returns
 * empty when the token is encrypted and has not been decrypted yet; use
 * `getGitHubAccessTokenAsync` for an always-accurate value.
 */
export const getGitHubAccessToken = (): string => {
    if (typeof window === 'undefined') return '';
    const raw = localStorage.getItem(GITHUB_TOKEN_KEY) || '';
    if (!raw || raw.startsWith('enc::')) return '';
    return raw;
};
export const useGitHubAccessToken = () => useSettingsStorageValue(getGitHubAccessToken, '');

/**
 * Async variant that decrypts the token when needed. API clients and
 * the proactive engine must go through this so they also work on first
 * load before migration has completed.
 */
export const getGitHubAccessTokenAsync = async (): Promise<string> => {
    const secret = await getSecret(GITHUB_TOKEN_KEY);
    if (secret) return secret;
    const raw = typeof window !== 'undefined' ? localStorage.getItem(GITHUB_TOKEN_KEY) || '' : '';
    if (raw && !raw.startsWith('enc::')) return raw;
    return '';
};

export const setGitHubAccessToken = async (token: string): Promise<void> => {
    await setSecret(GITHUB_TOKEN_KEY, token);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const hasGitHubAccessToken = (): boolean =>
    hasSecret(GITHUB_TOKEN_KEY) || Boolean(getGitHubAccessToken());


// ---------------------------------------------------------------------------
// Generic MCP settings
// ---------------------------------------------------------------------------
export const DEFAULT_GENERIC_MCP_URL = '';
const GENERIC_MCP_SERVERS_KEY = 'curio_generic_mcp_servers';
const LEGACY_GENERIC_MCP_URL_KEY = 'curio_generic_mcp_url';
const LEGACY_GENERIC_MCP_ENABLED_KEY = 'curio_generic_mcp_enabled';

export type GenericMcpServerKind = 'general' | 'search';
export type GenericMcpAuthType = 'none' | 'bearer' | 'api_key' | 'oauth';
export type GenericMcpTransport = 'http' | 'stdio';

export interface GenericMcpServerConfig {
    id: string;
    name: string;
    /**
     * Endpoint URL for HTTP transport. Empty when `transport === 'stdio'`.
     * For backward compatibility we keep `url` required in the type so
     * existing consumers that assume a string still compile.
     */
    url: string;
    enabled: boolean;
    kind: GenericMcpServerKind;
    authType?: GenericMcpAuthType;
    authHeaderName?: string;
    sourceUrl?: string;
    /** AI-facing hint about when to use this server's tools. */
    usageHint?: string;
    /**
     * Wire transport. Defaults to `'http'` when omitted. `'stdio'` is only
     * usable from the Electron desktop app on the machine where the
     * executable lives; browsers/PWAs cannot spawn local processes.
     */
    transport?: GenericMcpTransport;
    /** Executable path for stdio transport. */
    command?: string;
    /** Process arguments for stdio transport. */
    args?: string[];
    /** Optional working directory for stdio transport. */
    cwd?: string;
    /**
     * Non-secret environment variables passed to the stdio process.
     * Secret values should be stored through
     * `setGenericMcpEnvSecret(serverId, name, value)` instead, which
     * encrypts them under `curio_generic_mcp_env:<serverId>:<NAME>`.
     */
    env?: Record<string, string>;
    /** Names of env vars whose values are stored as encrypted secrets. */
    secretEnvNames?: string[];
}

export interface GenericMcpServerPreset {
    id: string;
    name: string;
    url: string;
    kind: GenericMcpServerKind;
    description: string;
    category: string;
    authInstructions?: string;
    authLabel?: string;
    authType?: GenericMcpAuthType;
    authHeaderName?: string;
    sourceUrl?: string;
    /** AI-facing hint about when to use this server's tools. */
    usageHint?: string;
}

export const EXA_FREE_MCP_SERVER_ID = 'exa-web-search-free';
export const EXA_FREE_MCP_SKILL_URL = 'https://lobehub.com/skills/openclaw-skills-exa-web-search-free';
export const EXA_FREE_MCP_URL = 'https://mcp.exa.ai/mcp?tools=web_search_exa,get_code_context_exa,company_research_exa';

export const GENERIC_MCP_SERVER_PRESETS: GenericMcpServerPreset[] = [
    {
        id: EXA_FREE_MCP_SERVER_ID,
        name: 'Exa Web Search Free',
        url: EXA_FREE_MCP_URL,
        kind: 'search',
        category: 'Search',
        description: 'Public web search, code context, and company research through the LobeHub Exa skill.',
        authType: 'none',
        sourceUrl: EXA_FREE_MCP_SKILL_URL,
        usageHint: 'Use for fresh/current web search, code context lookup, or company research when the user needs live public information.',
    },
    {
        id: 'notion-workspace',
        name: 'Notion Workspace',
        url: 'https://mcp.notion.com/mcp',
        kind: 'general',
        category: 'Workspace',
        description: 'Read and write workspace pages, databases, comments, and Notion content through the official hosted MCP.',
        authType: 'oauth',
        authLabel: 'OAuth',
        authInstructions: 'Connect with OAuth. Curio dynamically registers a public MCP client, opens Notion consent, stores encrypted tokens, and refreshes them when possible.',
        sourceUrl: 'https://developers.notion.com/guides/mcp/get-started-with-mcp',
        usageHint: 'Use when the user asks about Notion pages, databases, projects, tasks, notes, or workspace content.',
    },
    {
        id: 'linear-workspace',
        name: 'Linear Workspace',
        url: 'https://mcp.linear.app/mcp',
        kind: 'general',
        category: 'Work',
        description: 'Search, create, and update Linear issues, projects, initiatives, comments, and planning data.',
        authType: 'bearer',
        authInstructions: 'Requires a Linear OAuth access token or restricted API key sent as Authorization: Bearer.',
        sourceUrl: 'https://linear.app/docs/mcp',
        usageHint: 'Use when the user asks about Linear issues, projects, initiatives, sprints, or engineering tasks.',
    },
    {
        id: 'github-remote',
        name: 'GitHub Remote MCP',
        url: 'https://api.githubcopilot.com/mcp/',
        kind: 'general',
        category: 'Code',
        description: 'Work with repositories, issues, pull requests, Actions, security alerts, and GitHub project context.',
        authType: 'bearer',
        authInstructions: 'Requires a GitHub personal access token or OAuth token sent as Authorization: Bearer. Tool availability follows GitHub and Copilot permissions.',
        sourceUrl: 'https://docs.github.com/copilot/how-tos/provide-context/use-mcp-in-your-ide/set-up-the-github-mcp-server',
        usageHint: 'Use when the user asks about GitHub repos, pull requests, issues, Actions, or code.',
    },
    {
        id: 'sentry-issues',
        name: 'Sentry Issues',
        url: 'https://mcp.sentry.dev/mcp',
        kind: 'general',
        category: 'Observability',
        description: 'Investigate Sentry issues, errors, traces, releases, and project health from Curio conversations.',
        authType: 'bearer',
        authInstructions: 'Requires a Sentry OAuth or API access token sent as Authorization: Bearer.',
        sourceUrl: 'https://mcp.sentry.dev/',
        usageHint: 'Use when the user asks about errors, crashes, stack traces, or Sentry issues.',
    },
    {
        id: 'stripe-payments',
        name: 'Stripe Payments',
        url: 'https://mcp.stripe.com',
        kind: 'general',
        category: 'Finance',
        description: 'Inspect and manage Stripe customers, subscriptions, invoices, payment links, disputes, and balances.',
        authType: 'bearer',
        authInstructions: 'Requires a Stripe secret or restricted API key sent as Authorization: Bearer. Use the narrowest key permissions you can.',
        sourceUrl: 'https://docs.stripe.com/mcp',
        usageHint: 'Use when the user asks about payments, invoices, customers, subscriptions, or Stripe data.',
    },
    {
        id: 'zapier-actions',
        name: 'Zapier Actions',
        url: 'https://mcp.zapier.com/api/mcp/mcp',
        kind: 'general',
        category: 'Automation',
        description: 'Trigger Zapier-connected app actions and workflow automations across your configured Zapier account.',
        authType: 'bearer',
        authInstructions: 'Requires the bearer token from your Zapier MCP setup page for the actions you explicitly expose.',
        sourceUrl: 'https://help.zapier.com/hc/en-us/articles/36265392843917-Use-Zapier-MCP-with-your-client',
        usageHint: 'Use when the user asks to trigger an automation, Zap, or cross-app workflow.',
    },
    {
        id: 'firecrawl-web-data',
        name: 'Firecrawl Web Data',
        url: 'https://mcp.firecrawl.dev/{FIRECRAWL_API_KEY}/v2/mcp',
        kind: 'search',
        category: 'Web Data',
        description: 'Search, scrape, crawl, map, and extract structured data from websites for research-heavy tasks.',
        authType: 'none',
        authLabel: 'API key in URL',
        authInstructions: 'Replace {FIRECRAWL_API_KEY} in the server URL with your Firecrawl API key before testing or enabling.',
        sourceUrl: 'https://docs.firecrawl.dev/mcp-server',
        usageHint: 'Use when the user needs to scrape, crawl, or extract structured data from specific websites.',
    },
    {
        id: 'context7-docs',
        name: 'Context7 Docs',
        url: 'https://mcp.context7.com/mcp',
        kind: 'general',
        category: 'Developer Docs',
        description: 'Fetch current, version-aware documentation and code examples for libraries and frameworks.',
        authType: 'api_key',
        authHeaderName: 'CONTEXT7_API_KEY',
        authInstructions: 'Paste your Context7 API key. Curio sends it as the CONTEXT7_API_KEY header.',
        sourceUrl: 'https://context7.com/docs/resources/all-clients',
        usageHint: 'Use when the user asks about library documentation, framework APIs, or code examples for a specific package.',
    },
    {
        id: 'jina-ai-reader',
        name: 'Jina AI Reader',
        url: 'https://mcp.jina.ai/v1',
        kind: 'search',
        category: 'Web Data',
        description: 'Search, read URLs, query papers, capture pages, and turn web content into AI-friendly context.',
        authType: 'bearer',
        authInstructions: 'Requires a Jina API key sent as Authorization: Bearer. You can add query filters to the URL to limit exposed tools.',
        sourceUrl: 'https://github.com/jina-ai/MCP',
        usageHint: 'Use when the user needs to read or summarize a specific URL, web article, or research paper.',
    },
    {
        id: 'cloudflare-radar',
        name: 'Cloudflare Radar',
        url: 'https://radar.mcp.cloudflare.com/mcp',
        kind: 'general',
        category: 'Internet Intel',
        description: 'Explore global Internet traffic trends, URL scans, outages, routing, and security intelligence.',
        authType: 'bearer',
        authInstructions: 'Requires Cloudflare OAuth or an API token sent as Authorization: Bearer with the permissions you want Curio to use.',
        sourceUrl: 'https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/',
        usageHint: 'Use when the user asks about internet traffic trends, URL scans, outages, BGP routing, or network security intelligence.',
    },
    {
        id: 'olyport-nws-alerts',
        name: 'NWS Weather Alerts',
        url: 'https://mcp.olyport.com/nws-alerts/mcp',
        kind: 'general',
        category: 'Weather',
        description: 'Active US weather alerts, watches, and warnings from the National Weather Service.',
        authType: 'none',
        sourceUrl: 'https://olyport.com/',
        usageHint: 'Use when the user asks about weather alerts, watches, warnings, or severe weather in the US.',
    },
    {
        id: 'olyport-wildfire',
        name: 'NIFC Wildfire Data',
        url: 'https://mcp.olyport.com/wildfire/mcp',
        kind: 'general',
        category: 'Safety',
        description: 'Current active wildfire incidents, size, location, and containment data.',
        authType: 'none',
        sourceUrl: 'https://olyport.com/',
        usageHint: 'Use when the user asks about wildfires, fire incidents, or containment status.',
    },
    {
        id: 'olyport-earthquake',
        name: 'USGS Earthquakes',
        url: 'https://mcp.olyport.com/earthquake/mcp',
        kind: 'general',
        category: 'Safety',
        description: 'Recent real-time earthquake events from the USGS catalog.',
        authType: 'none',
        sourceUrl: 'https://olyport.com/',
        usageHint: 'Use when the user asks about earthquakes, seismic activity, or recent tremors.',
    },
    {
        id: 'olyport-water-monitoring',
        name: 'USGS Water Monitoring',
        url: 'https://mcp.olyport.com/water/mcp',
        kind: 'general',
        category: 'Environment',
        description: 'Real-time USGS stream gauge water levels, flow rates, and flood-stage context.',
        authType: 'none',
        sourceUrl: 'https://olyport.com/',
        usageHint: 'Use when the user asks about river levels, stream gauges, flooding, or water flow rates.',
    },
    {
        id: 'olyport-epa-air-quality',
        name: 'EPA Air Quality',
        url: 'https://mcp.olyport.com/epa/mcp',
        kind: 'general',
        category: 'Environment',
        description: 'Current AQI, pollutant levels, toxics, Superfund, and nearby monitoring-station data.',
        authType: 'none',
        sourceUrl: 'https://olyport.com/',
        usageHint: 'Use when the user asks about EPA data, pollutant levels, toxics, Superfund sites, or monitoring stations.',
    },
    {
        id: 'olyport-fred-economic-data',
        name: 'FRED Economic Data',
        url: 'https://mcp.olyport.com/fred/mcp',
        kind: 'general',
        category: 'Economy',
        description: 'Federal Reserve economic series such as inflation, rates, employment, GDP, and housing indicators.',
        authType: 'none',
        sourceUrl: 'https://olyport.com/',
        usageHint: 'Use when the user asks about economic indicators, interest rates, inflation, GDP, or employment data.',
    },
    {
        id: 'olyport-eia-energy',
        name: 'EIA Energy Data',
        url: 'https://mcp.olyport.com/eia/mcp',
        kind: 'general',
        category: 'Energy',
        description: 'Electricity, fuel prices, generation, renewable energy, and state energy profile data from EIA.',
        authType: 'none',
        sourceUrl: 'https://olyport.com/',
        usageHint: 'Use when the user asks about electricity prices, fuel costs, energy generation, or renewable energy data.',
    },
    {
        id: 'olyport-pubmed',
        name: 'PubMed Literature',
        url: 'https://mcp.olyport.com/pubmed/mcp',
        kind: 'general',
        category: 'Research',
        description: 'Biomedical literature search, abstracts, MeSH terms, related papers, and citations from PubMed.',
        authType: 'none',
        sourceUrl: 'https://olyport.com/',
        usageHint: 'Use when the user asks about medical research, clinical studies, biomedical papers, or health literature.',
    },
    {
        id: 'olyport-fda-safety',
        name: 'FDA Safety Reports',
        url: 'https://mcp.olyport.com/fda-safety/mcp',
        kind: 'general',
        category: 'Safety',
        description: 'FDA adverse event reports, recalls, enforcement actions, and safety alerts from openFDA.',
        authType: 'none',
        sourceUrl: 'https://olyport.com/',
        usageHint: 'Use when the user asks about drug recalls, adverse events, FDA enforcement actions, or safety alerts.',
    },
];

const dispatchSettingsChanged = () => {
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const createExaFreeMcpServer = (): GenericMcpServerConfig => ({
    id: EXA_FREE_MCP_SERVER_ID,
    name: 'Exa Web Search Free',
    url: EXA_FREE_MCP_URL,
    enabled: false,
    kind: 'search',
    authType: 'none',
    sourceUrl: EXA_FREE_MCP_SKILL_URL,
});

export const createGenericMcpServer = (
    overrides: Partial<GenericMcpServerConfig> = {},
): GenericMcpServerConfig => ({
    id: overrides.id || `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name || 'External MCP Server',
    url: overrides.url || '',
    enabled: overrides.enabled ?? true,
    kind: overrides.kind || 'general',
    authType: overrides.authType || 'none',
    authHeaderName: overrides.authHeaderName,
    sourceUrl: overrides.sourceUrl,
    usageHint: overrides.usageHint,
    transport: overrides.transport || 'http',
    command: overrides.command,
    args: overrides.args,
    cwd: overrides.cwd,
    env: overrides.env,
    secretEnvNames: overrides.secretEnvNames,
});

export const createGenericMcpServerFromPreset = (
    preset: GenericMcpServerPreset,
    overrides: Partial<GenericMcpServerConfig> = {},
): GenericMcpServerConfig => createGenericMcpServer({
    id: preset.id,
    name: preset.name,
    url: preset.url,
    enabled: false,
    kind: preset.kind,
    authType: preset.authType || 'none',
    authHeaderName: preset.authHeaderName,
    sourceUrl: preset.sourceUrl,
    usageHint: preset.usageHint,
    ...overrides,
});

const sanitizeGenericMcpServer = (server: Partial<GenericMcpServerConfig>): GenericMcpServerConfig | null => {
    const url = typeof server.url === 'string' ? server.url.trim() : '';
    const transport: GenericMcpTransport = server.transport === 'stdio' ? 'stdio' : 'http';
    const command = typeof server.command === 'string' ? server.command.trim() : '';

    if (transport === 'http' && !url) return null;
    if (transport === 'stdio' && !command) return null;

    const id = typeof server.id === 'string' && server.id.trim()
        ? server.id.trim()
        : `mcp-${Math.random().toString(36).slice(2, 10)}`;
    const name = typeof server.name === 'string' && server.name.trim()
        ? server.name.trim()
        : 'External MCP Server';
    const kind = server.kind === 'search' ? 'search' : 'general';
    const authType: GenericMcpAuthType =
        server.authType === 'bearer' || server.authType === 'api_key' || server.authType === 'oauth'
            ? server.authType
            : 'none';
    const authHeaderName = typeof server.authHeaderName === 'string' && server.authHeaderName.trim()
        ? server.authHeaderName.trim()
        : undefined;
    const sourceUrl = typeof server.sourceUrl === 'string' && server.sourceUrl.trim()
        ? server.sourceUrl.trim()
        : undefined;
    const usageHint = typeof server.usageHint === 'string' && server.usageHint.trim()
        ? server.usageHint.trim()
        : undefined;

    const rawArgs = Array.isArray(server.args) ? server.args : undefined;
    const args = rawArgs
        ? rawArgs.map((v) => (typeof v === 'string' ? v : String(v ?? ''))).filter((v) => v.length > 0)
        : undefined;
    const cwd = typeof server.cwd === 'string' && server.cwd.trim() ? server.cwd.trim() : undefined;

    const sanitizedEnv: Record<string, string> | undefined = server.env && typeof server.env === 'object'
        ? Object.fromEntries(Object.entries(server.env)
            .filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
            .map(([key, value]) => [key, typeof value === 'string' ? value : String(value ?? '')]))
        : undefined;
    const env = sanitizedEnv && Object.keys(sanitizedEnv).length > 0 ? sanitizedEnv : undefined;

    const secretEnvNames = Array.isArray(server.secretEnvNames)
        ? Array.from(new Set(server.secretEnvNames
            .filter((v): v is string => typeof v === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(v))))
        : undefined;

    return {
        id,
        name,
        url,
        enabled: server.enabled !== false,
        kind,
        authType,
        authHeaderName,
        sourceUrl,
        usageHint,
        transport,
        command: transport === 'stdio' ? command : undefined,
        args: transport === 'stdio' ? args : undefined,
        cwd: transport === 'stdio' ? cwd : undefined,
        env: transport === 'stdio' ? env : undefined,
        secretEnvNames: transport === 'stdio' && secretEnvNames && secretEnvNames.length > 0 ? secretEnvNames : undefined,
    };
};

const parseGenericMcpServers = (raw: string | null): GenericMcpServerConfig[] => {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((entry) => sanitizeGenericMcpServer(entry as Partial<GenericMcpServerConfig>))
            .filter(Boolean) as GenericMcpServerConfig[];
    } catch {
        return [];
    }
};

const getLegacyGenericMcpServer = (): GenericMcpServerConfig | null => {
    if (typeof window === 'undefined') return null;
    const url = localStorage.getItem(LEGACY_GENERIC_MCP_URL_KEY)?.trim();
    if (!url) return null;
    return createGenericMcpServer({
        id: url.includes('mcp.exa.ai') ? EXA_FREE_MCP_SERVER_ID : 'legacy-generic-mcp',
        name: url.includes('mcp.exa.ai') ? 'Exa Web Search Free' : 'External MCP Server',
        url,
        enabled: localStorage.getItem(LEGACY_GENERIC_MCP_ENABLED_KEY) === 'true',
        kind: url.includes('mcp.exa.ai') ? 'search' : 'general',
        authType: 'none',
        sourceUrl: url.includes('mcp.exa.ai') ? EXA_FREE_MCP_SKILL_URL : undefined,
    });
};

export const getGenericMcpServers = (): GenericMcpServerConfig[] => {
    if (typeof window === 'undefined') return [];
    const configured = parseGenericMcpServers(localStorage.getItem(GENERIC_MCP_SERVERS_KEY));
    if (configured.length > 0) return configured;
    const legacy = getLegacyGenericMcpServer();
    return legacy ? [legacy] : [];
};

export const setGenericMcpServers = (servers: GenericMcpServerConfig[]) => {
    const sanitized = servers
        .map((server) => sanitizeGenericMcpServer(server))
        .filter(Boolean) as GenericMcpServerConfig[];
    localStorage.setItem(GENERIC_MCP_SERVERS_KEY, JSON.stringify(sanitized));
    dispatchSettingsChanged();
};

export const getEnabledGenericMcpServers = (): GenericMcpServerConfig[] =>
    getGenericMcpServers().filter((server) => {
        if (!server.enabled) return false;
        if ((server.transport || 'http') === 'stdio') return Boolean(server.command?.trim());
        return Boolean(server.url.trim());
    });

export const getGenericMcpUrl = () => {
    if (typeof window === 'undefined') return DEFAULT_GENERIC_MCP_URL;
    return getGenericMcpServers()[0]?.url || localStorage.getItem(LEGACY_GENERIC_MCP_URL_KEY) || DEFAULT_GENERIC_MCP_URL;
};

export const setGenericMcpUrl = (url: string) => {
    const servers = getGenericMcpServers();
    const next = servers.length > 0
        ? [{ ...servers[0], url: url.trim() }, ...servers.slice(1)]
        : [createGenericMcpServer({ url: url.trim(), enabled: getGenericMcpEnabled() })];
    localStorage.setItem(LEGACY_GENERIC_MCP_URL_KEY, url.trim());
    setGenericMcpServers(next);
};

export const useGenericMcpUrl = () => useSettingsStorageValue(getGenericMcpUrl, DEFAULT_GENERIC_MCP_URL);

export const getGenericMcpAuthTokenStorageKey = (serverId: string): string =>
    `curio_generic_mcp_auth_token:${serverId}`;

export const getGenericMcpOAuthTokenStorageKey = (serverId: string): string =>
    `curio_generic_mcp_oauth_token:${serverId}`;

export const getGenericMcpAuthToken = async (serverId: string): Promise<string> =>
    getSecret(getGenericMcpAuthTokenStorageKey(serverId));

export const setGenericMcpAuthToken = async (serverId: string, token: string): Promise<void> => {
    await setSecret(getGenericMcpAuthTokenStorageKey(serverId), token);
    dispatchSettingsChanged();
};

export const hasGenericMcpAuthToken = (serverId: string): boolean =>
    hasSecret(getGenericMcpAuthTokenStorageKey(serverId));

// ── stdio env secrets ──────────────────────────────────────────────

export const getGenericMcpEnvSecretStorageKey = (serverId: string, envName: string): string =>
    `curio_generic_mcp_env:${serverId}:${envName}`;

export const getGenericMcpEnvSecret = async (serverId: string, envName: string): Promise<string> =>
    getSecret(getGenericMcpEnvSecretStorageKey(serverId, envName));

export const setGenericMcpEnvSecret = async (
    serverId: string,
    envName: string,
    value: string,
): Promise<void> => {
    await setSecret(getGenericMcpEnvSecretStorageKey(serverId, envName), value);
    dispatchSettingsChanged();
};

export const hasGenericMcpEnvSecret = (serverId: string, envName: string): boolean =>
    hasSecret(getGenericMcpEnvSecretStorageKey(serverId, envName));

/**
 * Resolve the final env dictionary for a stdio MCP process by combining
 * the non-secret env map with any encrypted env values stored as secrets.
 */
export const resolveGenericMcpEnv = async (
    server: GenericMcpServerConfig,
): Promise<Record<string, string>> => {
    if ((server.transport || 'http') !== 'stdio') return {};
    const resolved: Record<string, string> = { ...(server.env || {}) };
    for (const name of server.secretEnvNames || []) {
        const value = await getGenericMcpEnvSecret(server.id, name);
        if (value) resolved[name] = value;
    }
    return resolved;
};

export const getGenericMcpAuthHeaders = async (
    server: GenericMcpServerConfig,
): Promise<Record<string, string>> => {
    if (!server.authType || server.authType === 'none') return {};
    if (server.authType === 'oauth') {
        const { getGenericMcpOAuthAuthHeaders } = await import('../../services/genericMcpOAuthService');
        return getGenericMcpOAuthAuthHeaders(server);
    }
    const token = await getGenericMcpAuthToken(server.id);
    if (!token) return {};
    if (server.authType === 'bearer') {
        return { Authorization: `Bearer ${token}` };
    }
    const headerName = server.authHeaderName?.trim() || 'x-api-key';
    return { [headerName]: token };
};

export const getGenericMcpEnabled = () => getGenericMcpServers().some((server) => server.enabled);
export const setGenericMcpEnabled = (enabled: boolean) => {
    const servers = getGenericMcpServers();
    const next = servers.length > 0
        ? servers.map((server, index) => index === 0 ? { ...server, enabled } : server)
        : [createGenericMcpServer({ url: getGenericMcpUrl(), enabled })];
    localStorage.setItem(LEGACY_GENERIC_MCP_ENABLED_KEY, enabled.toString());
    setGenericMcpServers(next);
};
export const useGenericMcpEnabled = () => useSettingsStorageValue(getGenericMcpEnabled, false);
export const useGenericMcpServers = () => useSettingsStorageValue(getGenericMcpServers, [] as GenericMcpServerConfig[]);
