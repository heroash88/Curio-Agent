import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Eye, EyeOff, RefreshCw, ChevronDown,
    ShieldCheck, Check, Music2, Plus, Trash2, Search,
    ChevronRight, AlertCircle, Link2, Circle,
} from 'lucide-react';
import { signInWithGoogle, googleSignOut } from '../../../services/googleOAuth';
import { signInWithMicrosoft, microsoftSignOut } from '../../../services/microsoftOAuth';
import {
    getSpotifyAuthStatus,
    getSpotifyClientId,
    setSpotifyClientId,
    signInWithSpotify,
    signOutSpotify,
} from '../../../services/spotifyApi';
import SettingsSection from '../SettingsSection';
import {
    getStatusBadgeClassName,
    getStatusTextClassName,
    getStatusText,
    type McpStatus,
} from './settingsTypes';
import {
    getGmailReplyEnabled, setGmailReplyEnabled,
    getOutlookReplyEnabled, setOutlookReplyEnabled,
    createGenericMcpServer,
    createGenericMcpServerFromPreset,
    getGenericMcpAuthToken,
    setGenericMcpServers,
    setGenericMcpAuthToken,
    useGenericMcpServers,
    getGenericMcpEnvSecret,
    setGenericMcpEnvSecret,
    hasGenericMcpEnvSecret,
    GENERIC_MCP_SERVER_PRESETS,
    EXA_FREE_MCP_SERVER_ID,
    EXA_FREE_MCP_SKILL_URL,
    type GenericMcpServerConfig,
    type GenericMcpServerPreset,
} from '../../../utils/settingsStorage';

interface AccountsKeysSectionProps {
    localGoogleApiKey: string;
    setLocalGoogleApiKey: (v: string) => void;
    googleCalendarAccessToken: string;
    setGoogleCalendarAccessToken: (v: string) => void;
    googleTasksAccessToken: string;
    setGoogleTasksAccessToken: (v: string) => void;
    gmailAccessToken: string;
    setGmailAccessToken: (v: string) => void;
    outlookCalendarAccessToken: string;
    setOutlookCalendarAccessToken: (v: string) => void;
    outlookMailAccessToken: string;
    setOutlookMailAccessToken: (v: string) => void;
    slackAccessToken: string;
    setSlackAccessToken: (v: string) => void;
    haMcpEnabled: boolean;
    setHaMcpEnabled: (v: boolean) => void;
    haMcpAuthMode: 'token' | 'oauth';
    setHaMcpAuthMode: (v: 'oauth' | 'token') => void;
    localHaUrl: string;
    setLocalHaUrl: (v: string) => void;
    localHaToken: string;
    setLocalHaToken: (v: string) => void;
    mcpStatus: McpStatus;
    mcpError: string | null;
    checkMcpConnection: (url: string, token: string) => void | Promise<void>;
    handleHaOAuth: () => void;
}

// Small collapsible sub-group within the Accounts section
const SubGroup: React.FC<{
    title: string;
    icon: React.ReactNode;
    badge?: React.ReactNode;
    defaultOpen?: boolean;
    children: React.ReactNode;
}> = ({ title, icon, badge, defaultOpen = false, children }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="rounded-2xl border border-slate-200/50 bg-white/60 backdrop-blur-md shadow-sm transition-all overflow-hidden">
            <button
                onClick={() => setOpen(v => !v)}
                className="flex w-full items-center justify-between px-4 py-3.5 transition-colors hover:bg-white/80"
            >
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100/80 shadow-sm text-slate-500">
                        {icon}
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-700">{title}</span>
                    {badge}
                </div>
                <div className={`flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>
                    <ChevronDown size={14} className="text-slate-500" />
                </div>
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                    >
                        <div className="px-4 pb-4 space-y-3 pt-1 border-t border-slate-100/50">{children}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

function McpIcon({ size = 15, className = '' }: { size?: number; className?: string }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 512 512"
            fill="none"
            stroke="currentColor"
            strokeWidth="54"
            strokeLinecap="square"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path d="M83 287 252 118c47-47 128-14 128 53v151" />
            <path d="M429 225 260 394c-47 47-128 14-128-53V190" />
            <path d="M176 329 330 175" />
        </svg>
    );
}

const getPresetAuthLabel = (preset: GenericMcpServerPreset): string => {
    if (preset.authLabel) return preset.authLabel;
    if (preset.authType === 'oauth') return 'OAuth';
    if (preset.authType === 'bearer') return 'Bearer token';
    if (preset.authType === 'api_key') return preset.authHeaderName || 'API key header';
    return 'No auth';
};

const AccountsKeysSection: React.FC<AccountsKeysSectionProps> = ({
    localGoogleApiKey, setLocalGoogleApiKey,
    googleCalendarAccessToken, setGoogleCalendarAccessToken,
    googleTasksAccessToken, setGoogleTasksAccessToken,
    gmailAccessToken, setGmailAccessToken,
    outlookCalendarAccessToken, setOutlookCalendarAccessToken,
    outlookMailAccessToken, setOutlookMailAccessToken,
    slackAccessToken, setSlackAccessToken,
    haMcpEnabled, setHaMcpEnabled,
    haMcpAuthMode, setHaMcpAuthMode,
    localHaUrl, setLocalHaUrl,
    localHaToken, setLocalHaToken,
    mcpStatus, mcpError,
    checkMcpConnection, handleHaOAuth,
}) => {
    const [showGoogleApiKey, setShowGoogleApiKey] = useState(false);
    const [showHaToken, setShowHaToken] = useState(false);

    const [localClientId, setLocalClientId] = useState(() =>
        (typeof window !== 'undefined' ? localStorage.getItem('curio_google_client_id') : '') || ''
    );
    const hasClientId = localClientId.trim().length > 0;

    const [localMsClientId, setLocalMsClientId] = useState(() =>
        (typeof window !== 'undefined' ? localStorage.getItem('curio_microsoft_client_id') : '') || ''
    );
    const hasMsClientId = localMsClientId.trim().length > 0;

    const [localSlackToken, setLocalSlackToken] = useState(() =>
        (typeof window !== 'undefined' ? localStorage.getItem('curio_slack_token') : '') || ''
    );
    const [showSlackToken, setShowSlackToken] = useState(false);

    // GitHub connection state. Token is loaded async because it is stored
    // encrypted through secret storage; the input starts empty and only
    // populates once decryption succeeds.
    const [localGitHubToken, setLocalGitHubToken] = useState('');
    const [showGitHubToken, setShowGitHubToken] = useState(false);
    const [localGitHubUsername, setLocalGitHubUsername] = useState(() =>
        (typeof window !== 'undefined' ? localStorage.getItem('curio_github_username') : '') || ''
    );
    const [localGitHubDefaultRepo, setLocalGitHubDefaultRepo] = useState(() =>
        (typeof window !== 'undefined' ? localStorage.getItem('curio_github_default_repo') : '') || ''
    );
    const [gitHubAuthModeLocal, setGitHubAuthModeLocal] = useState<'pat' | 'oauth' | 'mcp'>(() => {
        if (typeof window === 'undefined') return 'pat';
        const raw = localStorage.getItem('curio_github_auth_mode');
        if (raw === 'pat' || raw === 'oauth' || raw === 'mcp') return raw;
        return 'pat';
    });
    const [gitHubTokenHasValue, setGitHubTokenHasValue] = useState(false);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { getGitHubAccessTokenAsync } = await import('../../../utils/settingsStorage');
                const token = await getGitHubAccessTokenAsync();
                if (!cancelled) {
                    setGitHubTokenHasValue(Boolean(token));
                    if (token) setLocalGitHubToken(token);
                }
            } catch {
                // secret storage may be unavailable in test contexts
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const [localSpotifyClientId, setLocalSpotifyClientId] = useState(() => getSpotifyClientId());
    const [spotifyStatus, setSpotifyStatus] = useState(() => getSpotifyAuthStatus());
    const [spotifyError, setSpotifyError] = useState('');
    const hasSpotifyClientId = localSpotifyClientId.trim().length > 0;

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const refreshSpotifyStatus = () => {
            const status = getSpotifyAuthStatus();
            setSpotifyStatus(status);
            if (status.connected) {
                setSpotifyError('');
            }
        };
        window.addEventListener('storage', refreshSpotifyStatus);
        window.addEventListener('curio:settings-changed', refreshSpotifyStatus);
        return () => {
            window.removeEventListener('storage', refreshSpotifyStatus);
            window.removeEventListener('curio:settings-changed', refreshSpotifyStatus);
        };
    }, []);

    const [resetting, setResetting] = useState(false);
    const handleResetHaConnection = useCallback(async () => {
        setResetting(true);
        try {
            const { resetPreparedHomeAssistantMcpSession } = await import('../../../services/haMcpService');
            const { resetHaMcpRuntimeStatus } = await import('../../../utils/haMcpRuntimeStatus');
            resetPreparedHomeAssistantMcpSession();
            resetHaMcpRuntimeStatus();
            await new Promise(r => setTimeout(r, 300));
            if (localHaUrl && (haMcpAuthMode === 'oauth' || localHaToken)) {
                await checkMcpConnection(localHaUrl, localHaToken);
            }
        } catch (e) {
            console.warn('[HA] Reset failed:', e);
        } finally {
            setResetting(false);
        }
    }, [localHaUrl, localHaToken, haMcpAuthMode, checkMcpConnection]);

    // Summary badges for collapsed state
    const googleBadge = (localGoogleApiKey || googleCalendarAccessToken || googleTasksAccessToken || gmailAccessToken)
        ? <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[8px] font-bold text-green-600">connected</span>
        : null;

    const [gmailReplyOn, setGmailReplyOn] = useState(() => getGmailReplyEnabled());
    const [outlookReplyOn, setOutlookReplyOn] = useState(() => getOutlookReplyEnabled());

    const microsoftBadge = (outlookCalendarAccessToken || outlookMailAccessToken)
        ? <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[8px] font-bold text-green-600">connected</span>
        : null;

    const slackBadge = slackAccessToken
        ? <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[8px] font-bold text-green-600">connected</span>
        : null;

    const gitHubBadge = gitHubAuthModeLocal === 'mcp'
        ? <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[8px] font-bold text-violet-600">via MCP</span>
        : gitHubTokenHasValue
            ? <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[8px] font-bold text-green-600">connected</span>
            : null;

    const spotifyBadge = spotifyStatus.connected
        ? <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[8px] font-bold text-green-600">connected</span>
        : null;

    const haBadge = haMcpEnabled
        ? (
            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5">
                <div className={`h-1.5 w-1.5 rounded-full ${getStatusBadgeClassName(mcpStatus)}`} />
                <span className={`text-[8px] font-black uppercase ${getStatusTextClassName(mcpStatus)}`}>{getStatusText(mcpStatus)}</span>
            </div>
        )
        : null;

    return (
        <SettingsSection title="Accounts & Keys" icon={<ShieldCheck size={18} className="text-emerald-500" />}>
            <div className="space-y-2">
                {/* Google Services sub-group */}
                <SubGroup
                    title="Google Services"
                    icon={<img src="/assets/icons/google-brand.png" alt="Google" className="h-3.5 w-3.5 object-contain" />}
                    badge={googleBadge}
                >
                    <ApiKeyField
                        label="Google API Key"
                        icon={<img src="/assets/icons/google-brand.png" alt="Google" className="h-3.5 w-3.5 object-contain" />}
                        placeholder="Enter Google API Key..."
                        value={localGoogleApiKey}
                        onChange={setLocalGoogleApiKey}
                        show={showGoogleApiKey}
                        onToggleShow={() => setShowGoogleApiKey(v => !v)}
                        hint="Powers YouTube, Places, and Routes APIs."
                    />

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">OAuth Client ID</label>
                        <p className="text-[10px] text-slate-400">
                            Required for Photos, Calendar, Tasks. Create at{' '}
                            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Google Cloud Console</a>.
                        </p>
                        <input
                            type="text"
                            placeholder="xxxx.apps.googleusercontent.com"
                            value={localClientId}
                            onChange={(e) => setLocalClientId(e.target.value)}
                            onBlur={(e) => {
                                localStorage.setItem('curio_google_client_id', e.target.value.trim());
                                window.dispatchEvent(new CustomEvent('curio:settings-changed'));
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none"
                        />
                    </div>

                    <GoogleServiceRow
                        label="Google Calendar"
                        icon={<img src="/assets/icons/google-calendar-brand.png" alt="Calendar" className="h-3.5 w-3.5 object-contain" />}
                        connected={!!googleCalendarAccessToken}
                        description="View, create, and manage calendar events by voice."
                        hasClientId={hasClientId}
                        onConnect={async () => {
                            try {
                                const result = await signInWithGoogle(['https://www.googleapis.com/auth/calendar']);
                                setGoogleCalendarAccessToken(result.accessToken);
                            } catch (e) { console.error('Google Sign-in (Calendar) Failed', e); }
                        }}
                        onDisconnect={() => { googleSignOut(); setGoogleCalendarAccessToken(''); }}
                    />

                    <GoogleServiceRow
                        label="Google Tasks"
                        icon={<img src="/assets/icons/tasks-brand.png" alt="Tasks" className="h-3.5 w-3.5 object-contain" />}
                        connected={!!googleTasksAccessToken}
                        description="Sync reminders to your task list."
                        hasClientId={hasClientId}
                        onConnect={async () => {
                            try {
                                const result = await signInWithGoogle(['https://www.googleapis.com/auth/tasks']);
                                setGoogleTasksAccessToken(result.accessToken);
                            } catch (e) { console.error('Google Sign-in (Tasks) Failed', e); }
                        }}
                        onDisconnect={() => { googleSignOut(); setGoogleTasksAccessToken(''); }}
                    />

                    <GoogleServiceRow
                        label="Gmail"
                        icon={<img src="/assets/icons/gmail-brand.png" alt="Gmail" className="h-3.5 w-3.5 object-contain" />}
                        connected={!!gmailAccessToken}
                        description="Read inbox and search emails by voice."
                        hasClientId={hasClientId}
                        onConnect={async () => {
                            try {
                                const result = await signInWithGoogle([
                                    'https://www.googleapis.com/auth/gmail.readonly',
                                    'https://www.googleapis.com/auth/gmail.send',
                                    'https://www.googleapis.com/auth/gmail.modify',
                                ]);
                                setGmailAccessToken(result.accessToken);
                            } catch (e) { console.error('Google Sign-in (Gmail) Failed', e); }
                        }}
                        onDisconnect={() => { googleSignOut(); setGmailAccessToken(''); }}
                    />

                    {gmailAccessToken && (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white p-2.5">
                            <div className="flex-1 min-w-0">
                                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">Allow AI Replies</span>
                                <p className="text-[10px] text-slate-400 leading-tight">When off, Curio can read but never send email.</p>
                            </div>
                            <button
                                onClick={() => {
                                    const next = !gmailReplyOn;
                                    setGmailReplyOn(next);
                                    setGmailReplyEnabled(next);
                                }}
                                role="switch"
                                aria-checked={gmailReplyOn}
                                data-state={gmailReplyOn ? 'on' : 'off'}
                                className="curio-settings-toggle-switch relative h-6 w-11 shrink-0 rounded-full transition-colors"
                            >
                                <span className={`curio-settings-toggle-thumb absolute top-0.5 left-0.5 h-5 w-5 rounded-full shadow transition-transform ${gmailReplyOn ? 'translate-x-5' : ''}`} />
                            </button>
                        </div>
                    )}
                </SubGroup>

                {/* Spotify sub-group */}
                <SubGroup
                    title="Spotify"
                    icon={<Music2 size={14} className="text-emerald-500" />}
                    badge={spotifyBadge}
                >
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Spotify Client ID</label>
                        <p className="text-[10px] text-slate-400">
                            Create an app at{' '}
                            <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Spotify Developer Dashboard</a>.
                            Add this exact Redirect URI: <code className="rounded bg-slate-100 px-1 text-[10px] text-slate-600">{spotifyStatus.redirectUri}</code>
                        </p>
                        <input
                            type="text"
                            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            value={localSpotifyClientId}
                            onChange={(event) => setLocalSpotifyClientId(event.target.value)}
                            onBlur={(event) => {
                                setSpotifyClientId(event.target.value);
                                setSpotifyStatus(getSpotifyAuthStatus());
                            }}
                            onKeyDown={(event) => event.stopPropagation()}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-300 focus:border-emerald-400 focus:outline-none"
                        />
                    </div>

                    <GoogleServiceRow
                        label="Spotify Playback"
                        icon={<Music2 size={14} className="text-emerald-500" />}
                        connected={spotifyStatus.connected}
                        description="Search tracks, albums, artists, and control playback on an active Spotify device."
                        hasClientId={hasSpotifyClientId}
                        onConnect={async () => {
                            try {
                                setSpotifyError('');
                                setSpotifyClientId(localSpotifyClientId);
                                await signInWithSpotify();
                                setSpotifyStatus(getSpotifyAuthStatus());
                            } catch (error) {
                                const message = error instanceof Error ? error.message : 'Spotify sign-in failed.';
                                setSpotifyError(message);
                                console.error('Spotify Sign-in Failed', error);
                            }
                        }}
                        onDisconnect={async () => {
                            await signOutSpotify();
                            setSpotifyStatus(getSpotifyAuthStatus());
                        }}
                    />

                    {spotifyError && (
                        <p className="rounded-lg border border-red-100 bg-red-50 p-2 text-[10px] leading-4 text-red-600">
                            {spotifyError}
                        </p>
                    )}
                </SubGroup>

                {/* Microsoft Outlook sub-group */}
                <SubGroup
                    title="Microsoft Outlook"
                    icon={<img src="/assets/icons/outlook-brand.png" alt="Outlook" className="h-[14px] w-[14px] object-contain" />}
                    badge={microsoftBadge}
                >
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Azure App (Client) ID</label>
                        <p className="text-[10px] text-slate-400">
                            Required for Outlook Calendar & Mail. Create at{' '}
                            <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Azure Portal</a>.
                        </p>
                        <input
                            type="text"
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            value={localMsClientId}
                            onChange={(e) => setLocalMsClientId(e.target.value)}
                            onBlur={(e) => {
                                localStorage.setItem('curio_microsoft_client_id', e.target.value.trim());
                                window.dispatchEvent(new CustomEvent('curio:settings-changed'));
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none"
                        />
                    </div>

                    <GoogleServiceRow
                        label="Outlook Calendar"
                        icon={<img src="/assets/icons/outlook-brand.png" alt="Outlook" className="h-[14px] w-[14px] object-contain" />}
                        connected={!!outlookCalendarAccessToken}
                        description="View and manage Outlook calendar events."
                        hasClientId={hasMsClientId}
                        onConnect={async () => {
                            try {
                                const result = await signInWithMicrosoft(['Calendars.Read', 'Calendars.ReadWrite']);
                                setOutlookCalendarAccessToken(result.accessToken);
                            } catch (e) { console.error('Microsoft Sign-in (Calendar) Failed', e); }
                        }}
                        onDisconnect={() => { microsoftSignOut(); setOutlookCalendarAccessToken(''); }}
                    />

                    <GoogleServiceRow
                        label="Outlook Mail"
                        icon={<img src="/assets/icons/outlook-brand.png" alt="Outlook" className="h-[14px] w-[14px] object-contain" />}
                        connected={!!outlookMailAccessToken}
                        description="Read inbox and search Outlook emails."
                        hasClientId={hasMsClientId}
                        onConnect={async () => {
                            try {
                                const result = await signInWithMicrosoft(['Mail.Read', 'Mail.Send']);
                                setOutlookMailAccessToken(result.accessToken);
                            } catch (e) { console.error('Microsoft Sign-in (Mail) Failed', e); }
                        }}
                        onDisconnect={() => { microsoftSignOut(); setOutlookMailAccessToken(''); }}
                    />

                    {outlookMailAccessToken && (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white p-2.5">
                            <div className="flex-1 min-w-0">
                                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                    <img src="/assets/icons/outlook-brand.png" alt="Outlook" className="h-[14px] w-[14px] object-contain" />
                                    Allow AI Replies & Send
                                </span>
                                <p className="text-[10px] text-slate-400 leading-tight">When off, Curio can read but never send Outlook email.</p>
                            </div>
                            <button
                                onClick={() => {
                                    const next = !outlookReplyOn;
                                    setOutlookReplyOn(next);
                                    setOutlookReplyEnabled(next);
                                }}
                                role="switch"
                                aria-checked={outlookReplyOn}
                                data-state={outlookReplyOn ? 'on' : 'off'}
                                className="curio-settings-toggle-switch relative h-6 w-11 shrink-0 rounded-full transition-colors"
                            >
                                <span className={`curio-settings-toggle-thumb absolute top-0.5 left-0.5 h-5 w-5 rounded-full shadow transition-transform ${outlookReplyOn ? 'translate-x-5' : ''}`} />
                            </button>
                        </div>
                    )}
                </SubGroup>

                {/* Slack sub-group */}
                <SubGroup
                    title="Slack"
                    icon={<img src="/assets/icons/slack-brand.png" alt="Slack" className="h-[14px] w-[14px] object-contain" />}
                    badge={slackBadge}
                >
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Bot User OAuth Token</label>
                        <p className="text-[10px] text-slate-400">
                            Paste your Bot User OAuth Token (starts with <code className="text-[10px] bg-slate-100 px-1 rounded">xoxb-</code>).
                            Go to <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Slack API</a>
                            {' '}&gt; your app &gt; OAuth &amp; Permissions. Required bot scopes: channels:history, channels:read, chat:write, users:read.
                        </p>
                        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <input
                                type="text"
                                name="curio-field-slack"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                data-lpignore="true"
                                data-1p-ignore="true"
                                data-form-type="other"
                                placeholder="xoxb-..."
                                value={localSlackToken}
                                style={{ WebkitTextSecurity: showSlackToken ? 'none' : 'disc' } as React.CSSProperties}
                                onChange={(e) => setLocalSlackToken(e.target.value)}
                                onBlur={(e) => {
                                    const val = e.target.value.trim();
                                    setSlackAccessToken(val);
                                }}
                                onKeyDown={(e) => e.stopPropagation()}
                                className="w-full bg-transparent text-sm text-slate-700 outline-none"
                            />
                            <button type="button" onClick={() => setShowSlackToken(v => !v)} className="text-slate-400 hover:text-slate-600">
                                {showSlackToken ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>
                    {slackAccessToken && (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white p-2.5">
                            <div className="flex-1 min-w-0">
                                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                    <img src="/assets/icons/slack-brand.png" alt="Slack" className="h-[14px] w-[14px] object-contain" />
                                    Slack Connected
                                </span>
                                <p className="text-[10px] text-slate-400 leading-tight">Curio can read and send Slack messages.</p>
                            </div>
                            <button
                                onClick={() => { setSlackAccessToken(''); setLocalSlackToken(''); }}
                                className="text-[10px] font-bold text-red-500 hover:text-red-700"
                            >Disconnect</button>
                        </div>
                    )}
                </SubGroup>

                {/* GitHub sub-group */}
                <SubGroup
                    title="GitHub"
                    icon={<span className="inline-flex h-[14px] w-[14px] items-center justify-center text-[12px]">🐙</span>}
                    badge={gitHubBadge}
                >
                    <div className="space-y-2">
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Auth mode</label>
                            <div className="mt-1 flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
                                {(['pat', 'oauth', 'mcp'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={async () => {
                                            setGitHubAuthModeLocal(mode);
                                            const { setGitHubAuthMode } = await import('../../../utils/settingsStorage');
                                            setGitHubAuthMode(mode);
                                        }}
                                        className={`flex-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition ${
                                            gitHubAuthModeLocal === mode
                                                ? 'bg-slate-900 text-white'
                                                : 'text-slate-500 hover:bg-slate-100'
                                        }`}
                                    >
                                        {mode === 'pat' ? 'Token' : mode === 'oauth' ? 'OAuth' : 'MCP'}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-1 text-[10px] text-slate-400 leading-tight">
                                {gitHubAuthModeLocal === 'pat' && 'Fine-grained or classic personal access token. Recommended.'}
                                {gitHubAuthModeLocal === 'oauth' && 'Paste an OAuth access token from a GitHub OAuth app or device flow.'}
                                {gitHubAuthModeLocal === 'mcp' && 'Route requests through the GitHub Remote MCP server configured in the Generic MCP section below.'}
                            </p>
                        </div>

                        {gitHubAuthModeLocal !== 'mcp' && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    {gitHubAuthModeLocal === 'pat' ? 'Personal Access Token' : 'OAuth Access Token'}
                                </label>
                                <p className="text-[10px] text-slate-400">
                                    Create one at{' '}
                                    <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">github.com/settings/tokens</a>.
                                    Suggested scopes: <code className="bg-slate-100 px-1 rounded">repo</code>, <code className="bg-slate-100 px-1 rounded">read:user</code>, <code className="bg-slate-100 px-1 rounded">notifications</code>, <code className="bg-slate-100 px-1 rounded">read:project</code>.
                                </p>
                                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                                    <input
                                        type="text"
                                        name="curio-field-github"
                                        autoComplete="off"
                                        autoCorrect="off"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                        data-lpignore="true"
                                        data-1p-ignore="true"
                                        data-form-type="other"
                                        placeholder="ghp_... or github_pat_..."
                                        value={localGitHubToken}
                                        style={{ WebkitTextSecurity: showGitHubToken ? 'none' : 'disc' } as React.CSSProperties}
                                        onChange={(e) => setLocalGitHubToken(e.target.value)}
                                        onBlur={async (e) => {
                                            const val = e.target.value.trim();
                                            const { setGitHubAccessToken } = await import('../../../utils/settingsStorage');
                                            await setGitHubAccessToken(val);
                                            setGitHubTokenHasValue(Boolean(val));
                                        }}
                                        onKeyDown={(e) => e.stopPropagation()}
                                        className="w-full bg-transparent text-sm text-slate-700 outline-none"
                                    />
                                    <button type="button" onClick={() => setShowGitHubToken(v => !v)} className="text-slate-400 hover:text-slate-600">
                                        {showGitHubToken ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Username</label>
                                <input
                                    type="text"
                                    value={localGitHubUsername}
                                    onChange={(e) => setLocalGitHubUsername(e.target.value)}
                                    onBlur={async (e) => {
                                        const { setGitHubUsername } = await import('../../../utils/settingsStorage');
                                        setGitHubUsername(e.target.value.trim());
                                    }}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    placeholder="octocat"
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Default repo</label>
                                <input
                                    type="text"
                                    value={localGitHubDefaultRepo}
                                    onChange={(e) => setLocalGitHubDefaultRepo(e.target.value)}
                                    onBlur={async (e) => {
                                        const { setGitHubDefaultRepo } = await import('../../../utils/settingsStorage');
                                        setGitHubDefaultRepo(e.target.value.trim());
                                    }}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    placeholder="owner/repo"
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                                />
                            </div>
                        </div>
                    </div>
                    {gitHubTokenHasValue && gitHubAuthModeLocal !== 'mcp' && (
                        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white p-2.5">
                            <div className="flex-1 min-w-0">
                                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                    <span className="text-[14px]">🐙</span>
                                    GitHub Connected
                                </span>
                                <p className="text-[10px] text-slate-400 leading-tight">Curio can read repos, PRs, issues, notifications, and workflow runs.</p>
                            </div>
                            <button
                                onClick={async () => {
                                    const { setGitHubAccessToken } = await import('../../../utils/settingsStorage');
                                    await setGitHubAccessToken('');
                                    setLocalGitHubToken('');
                                    setGitHubTokenHasValue(false);
                                }}
                                className="text-[10px] font-bold text-red-500 hover:text-red-700"
                            >Disconnect</button>
                        </div>
                    )}
                </SubGroup>

                {/* Home Assistant sub-group */}
                <SubGroup
                    title="Home Assistant"
                    icon={<img src="/assets/icons/ha-brand.png" alt="Home Assistant" className="h-3.5 w-3.5 object-contain" />}
                    badge={haBadge}
                >
                    <div className="flex items-center justify-between gap-3 py-1">
                        <span className="text-xs font-semibold text-slate-600">Enable Home Assistant</span>
                        <button
                            onClick={() => setHaMcpEnabled(!haMcpEnabled)}
                            role="switch"
                            aria-checked={haMcpEnabled}
                            data-state={haMcpEnabled ? 'on' : 'off'}
                            className="curio-settings-toggle-switch relative h-6 w-11 shrink-0 rounded-full shadow-sm transition-all duration-300 active:scale-95"
                        >
                            <div className={`curio-settings-toggle-thumb absolute top-0.5 h-5 w-5 rounded-full shadow-md transition-all duration-300 ${haMcpEnabled ? 'left-5.5' : 'left-0.5'}`} />
                        </button>
                    </div>
                    {haMcpEnabled && (
                        <div className="space-y-2.5" style={{ contentVisibility: 'auto', containIntrinsicSize: '260px' }}>
                            <div className="flex gap-2 rounded-lg bg-slate-100 p-1">
                                <button
                                    onClick={() => setHaMcpAuthMode('oauth')}
                                    className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold transition-all ${haMcpAuthMode === 'oauth' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >OAuth Login</button>
                                <button
                                    onClick={() => setHaMcpAuthMode('token')}
                                    className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold transition-all ${haMcpAuthMode === 'token' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >Access Token</button>
                            </div>

                            {mcpStatus === 'error' && mcpError && (
                                <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-2">
                                    <span className="mt-0.5 text-xs">!</span>
                                    <div className="flex-1">
                                        <p className="text-[10px] font-bold leading-tight text-red-700">Connection Failed</p>
                                        <p className="mt-0.5 text-[9px] leading-tight text-red-600">{mcpError}</p>
                                    </div>
                                    <button
                                        onClick={() => void checkMcpConnection(localHaUrl, localHaToken)}
                                        className="text-[9px] font-black uppercase text-red-700 hover:text-red-800 hover:underline"
                                    >Retry</button>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">HA URL</label>
                                <input
                                    type="text"
                                    placeholder="http://homeassistant.local:8123"
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400"
                                    value={localHaUrl}
                                    onChange={(e) => setLocalHaUrl(e.target.value)}
                                    onKeyDown={(e) => e.stopPropagation()}
                                />
                            </div>

                            {haMcpAuthMode === 'oauth' ? (
                                <button
                                    onClick={handleHaOAuth}
                                    disabled={!localHaUrl}
                                    className="w-full rounded-xl bg-indigo-500 py-2.5 text-xs font-bold text-white shadow-md hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                >Login with Home Assistant</button>
                            ) : (
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Access Token</label>
                                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                                        <input
                                            type="text"
                                            name="curio-field-home-assistant"
                                            autoComplete="off"
                                            autoCorrect="off"
                                            autoCapitalize="none"
                                            spellCheck={false}
                                            data-lpignore="true"
                                            data-1p-ignore="true"
                                            data-form-type="other"
                                            placeholder="Long-lived access token"
                                            className="w-full bg-transparent text-sm text-slate-700 outline-none"
                                            style={{ WebkitTextSecurity: showHaToken ? 'none' : 'disc' } as React.CSSProperties}
                                            value={localHaToken}
                                            onChange={(e) => setLocalHaToken(e.target.value)}
                                            onKeyDown={(e) => e.stopPropagation()}
                                        />
                                        <button type="button" onClick={() => setShowHaToken(v => !v)} className="text-slate-400 hover:text-slate-600">
                                            {showHaToken ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2">
                                {localHaUrl && (haMcpAuthMode === 'oauth' || localHaToken) && (
                                    <button
                                        onClick={() => void checkMcpConnection(localHaUrl, localHaToken)}
                                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-50 py-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600 transition-colors hover:bg-indigo-100 active:scale-95"
                                    >
                                        <div className={`h-1.5 w-1.5 rounded-full ${getStatusBadgeClassName(mcpStatus)}`} /> Check
                                    </button>
                                )}
                                {(mcpStatus === 'connected' || mcpStatus === 'error') && (
                                    <button
                                        onClick={() => void handleResetHaConnection()}
                                        disabled={resetting}
                                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-50 py-2 text-[10px] font-bold uppercase tracking-wider text-amber-700 transition-colors hover:bg-amber-100 active:scale-95 disabled:opacity-50"
                                    >
                                        <RefreshCw size={12} className={resetting ? 'animate-spin' : ''} /> {resetting ? 'Resetting...' : 'Reset'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </SubGroup>

                {/* Obsidian */}
                <ObsidianSettingsBlock />

                {/* Generic MCP */}
                <GenericMcpSettingsBlock />
            </div>
        </SettingsSection>
    );
};

// -- Reusable API key field --
const ApiKeyField: React.FC<{
    label: string;
    icon: React.ReactNode;
    placeholder: string;
    value: string;
    onChange: (v: string) => void;
    show: boolean;
    onToggleShow: () => void;
    hint: React.ReactNode;
}> = ({ label, icon, placeholder, value, onChange, show, onToggleShow, hint }) => {
    const fieldName = `curio-field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

    return (
        <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{icon} {label}</label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <input
                    type="text"
                    name={fieldName}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    placeholder={placeholder}
                    className="w-full bg-transparent text-sm text-slate-700 outline-none"
                    style={{ WebkitTextSecurity: show ? 'none' : 'disc' } as React.CSSProperties}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                />
                <button type="button" onClick={onToggleShow} className="text-slate-400 hover:text-slate-600">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
            </div>
            <p className="px-1 text-[10px] italic text-slate-400">{hint}</p>
        </div>
    );
};

// -- Reusable Google service connect/disconnect row --
const GoogleServiceRow: React.FC<{
    label: string;
    icon: React.ReactNode;
    connected: boolean;
    description: string;
    hasClientId: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
}> = ({ label, icon, connected, description, hasClientId, onConnect, onDisconnect }) => (
    <div className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200/50 bg-white/80 p-3 shadow-sm transition-all hover:bg-white hover:shadow-md">
        <div className="flex-1 min-w-0">
            <span className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100/80">
                    {icon}
                </div>
                {label}
            </span>
            <p className="mt-1 text-[10px] text-slate-500 leading-relaxed pr-2">{description}</p>
        </div>
        {connected ? (
            <div className="flex flex-col items-end gap-1.5 shrink-0">
                <div className="flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-1 border border-green-200/50">
                    <Check size={12} className="text-green-600" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-green-700">Connected</span>
                </div>
                <button onClick={onDisconnect} className="text-[9px] font-bold text-red-500 hover:text-red-700 transition-colors uppercase tracking-widest">Disconnect</button>
            </div>
        ) : (
            <button
                disabled={!hasClientId}
                onClick={onConnect}
                className="shrink-0 rounded-xl bg-blue-500 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm shadow-blue-500/20 transition-all hover:bg-blue-600 hover:shadow-md hover:shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >Connect</button>
        )}
    </div>
);

// -- Self-contained Obsidian settings block --
function ObsidianSettingsBlock() {
    const [obsEnabled, setObsEnabled] = useState(() => localStorage.getItem('curio_obsidian_enabled') === 'true');
    const [obsUrl, setObsUrl] = useState(() => localStorage.getItem('curio_obsidian_url') || 'http://127.0.0.1:27123');
    const [obsKey, setObsKey] = useState(() => localStorage.getItem('curio_obsidian_api_key') || '');
    const [showObsKey, setShowObsKey] = useState(false);
    const [obsStatus, setObsStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');

    const toggleEnabled = useCallback((v: boolean) => {
        setObsEnabled(v);
        localStorage.setItem('curio_obsidian_enabled', v.toString());
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('curio:settings-changed'));
    }, []);

    const saveUrl = useCallback((v: string) => {
        localStorage.setItem('curio_obsidian_url', v);
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('curio:settings-changed'));
    }, []);

    const saveKey = useCallback((v: string) => {
        localStorage.setItem('curio_obsidian_api_key', v);
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('curio:settings-changed'));
    }, []);

    const checkConnection = useCallback(async () => {
        setObsStatus('checking');
        try {
            const res = await fetch(obsUrl.replace(/\/+$/, '') + '/', {
                headers: obsKey ? { Authorization: `Bearer ${obsKey}` } : {},
            });
            setObsStatus(res.ok ? 'ok' : 'error');
        } catch {
            setObsStatus('error');
        }
    }, [obsUrl, obsKey]);

    const obsBadge = obsEnabled
        ? (obsStatus === 'ok'
            ? <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[8px] font-bold text-green-600">connected</span>
            : <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[8px] font-bold text-purple-600">enabled</span>)
        : null;

    return (
        <SubGroup
            title="Obsidian Notes"
            icon={<img src="/assets/icons/obsidian-brand.png" alt="Obsidian" className="h-[14px] w-[14px] object-contain" />}
            badge={obsBadge}
        >
            <div className="flex items-center justify-between gap-3 py-1">
                <div>
                    <span className="text-xs font-semibold text-slate-600">Enable Obsidian</span>
                    <p className="text-[10px] text-slate-400">
                        Via <a href="https://github.com/coddingtonbear/obsidian-local-rest-api" target="_blank" rel="noopener noreferrer" className="text-purple-500 underline">Local REST API</a> plugin.
                    </p>
                </div>
                <button
                    onClick={() => toggleEnabled(!obsEnabled)}
                    role="switch"
                    aria-checked={obsEnabled}
                    data-state={obsEnabled ? 'on' : 'off'}
                    className="curio-settings-toggle-switch relative h-6 w-11 shrink-0 rounded-full transition-colors"
                >
                    <span className={`curio-settings-toggle-thumb absolute top-0.5 left-0.5 h-5 w-5 rounded-full shadow transition-transform ${obsEnabled ? 'translate-x-5' : ''}`} />
                </button>
            </div>
            {obsEnabled && (
                <div className="space-y-2">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">API URL</label>
                        <input
                            type="text"
                            placeholder="http://127.0.0.1:27123"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                            value={obsUrl}
                            onChange={(e) => { setObsUrl(e.target.value); setObsStatus('idle'); }}
                            onBlur={(e) => {
                                const nextValue = e.target.value.trim();
                                if (nextValue !== localStorage.getItem('curio_obsidian_url')) saveUrl(nextValue);
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">API Key</label>
                        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <input
                                type="text"
                                name="curio-field-obsidian"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                data-lpignore="true"
                                data-1p-ignore="true"
                                data-form-type="other"
                                placeholder="From Obsidian plugin settings"
                                className="w-full bg-transparent text-sm text-slate-700 outline-none"
                                style={{ WebkitTextSecurity: showObsKey ? 'none' : 'disc' } as React.CSSProperties}
                                value={obsKey}
                                onChange={(e) => { setObsKey(e.target.value); setObsStatus('idle'); }}
                                onBlur={(e) => {
                                    const nextValue = e.target.value.trim();
                                    if (nextValue !== localStorage.getItem('curio_obsidian_api_key')) saveKey(nextValue);
                                }}
                                onKeyDown={(e) => e.stopPropagation()}
                            />
                            <button type="button" onClick={() => setShowObsKey(v => !v)} className="text-slate-400 hover:text-slate-600">
                                {showObsKey ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={() => void checkConnection()}
                        className={`flex w-full items-center justify-center gap-2 rounded-xl py-2 text-[10px] font-bold uppercase tracking-wider transition-colors active:scale-95 ${obsStatus === 'ok' ? 'bg-green-100 text-green-700' : obsStatus === 'error' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-purple-100 text-purple-600 hover:bg-purple-200'}`}
                    >
                        <div className={`h-2 w-2 rounded-full ${obsStatus === 'ok' ? 'bg-green-500' : obsStatus === 'error' ? 'bg-red-500' : obsStatus === 'checking' ? 'bg-yellow-500 animate-pulse' : 'bg-slate-400'}`} />
                        {obsStatus === 'ok' ? 'Connected' : obsStatus === 'checking' ? 'Checking...' : obsStatus === 'error' ? 'Failed -- Retry' : 'Check Connection'}
                    </button>
                </div>
            )}
        </SubGroup>
    );
}

type GenericMcpCheckStatus = {
    state: 'idle' | 'checking' | 'ok' | 'error';
    message: string;
    tools?: Array<{ name: string; description?: string }>;
};

type GenericMcpOAuthUiStatus = {
    connected: boolean;
    checking?: boolean;
    message?: string;
};

// -- Small editor for the stdio transport fields on an external MCP
// server. Rendered inline by GenericMcpSettingsBlock only when
// `server.transport === 'stdio'`. Shows a warning when the desktop
// bridge is not available (browser/PWA mode). --
function McpStdioFields({
    server,
    onUpdate,
    bridgeAvailable,
}: {
    server: GenericMcpServerConfig;
    onUpdate: (patch: Partial<GenericMcpServerConfig>) => void;
    bridgeAvailable: boolean;
}) {
    const [argsText, setArgsText] = useState(() => (server.args || []).join(' '));
    const [newEnvKey, setNewEnvKey] = useState('');
    const [newEnvValue, setNewEnvValue] = useState('');
    const [newEnvSecret, setNewEnvSecret] = useState(false);
    const [envSecretCache, setEnvSecretCache] = useState<Record<string, string>>({});
    const [showEnvSecret, setShowEnvSecret] = useState<Record<string, boolean>>({});

    useEffect(() => {
        setArgsText((server.args || []).join(' '));
    }, [server.id, server.args]);

    const secretNames = server.secretEnvNames || [];

    useEffect(() => {
        let cancelled = false;
        void Promise.all(secretNames.map(async (name) => [name, await getGenericMcpEnvSecret(server.id, name)] as const))
            .then((entries) => {
                if (cancelled) return;
                setEnvSecretCache(Object.fromEntries(entries));
            });
        return () => { cancelled = true; };
    }, [server.id, secretNames.join(',')]);

    const parseArgsInput = (value: string): string[] => {
        const out: string[] = [];
        const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(value)) !== null) {
            out.push(match[1] ?? match[2] ?? match[3] ?? '');
        }
        return out;
    };

    const commitArgs = () => {
        const parsed = parseArgsInput(argsText);
        if (JSON.stringify(parsed) !== JSON.stringify(server.args || [])) {
            onUpdate({ args: parsed.length > 0 ? parsed : undefined });
        }
    };

    const plainEnvEntries = Object.entries(server.env || {}).filter(([key]) => !secretNames.includes(key));

    const removeEnvKey = (key: string) => {
        if (secretNames.includes(key)) {
            const nextSecretNames = secretNames.filter((n) => n !== key);
            void setGenericMcpEnvSecret(server.id, key, '');
            onUpdate({
                secretEnvNames: nextSecretNames.length > 0 ? nextSecretNames : undefined,
            });
            return;
        }
        const nextEnv = { ...(server.env || {}) };
        delete nextEnv[key];
        onUpdate({ env: Object.keys(nextEnv).length > 0 ? nextEnv : undefined });
    };

    const addEnvKey = () => {
        const name = newEnvKey.trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return;
        if (newEnvSecret) {
            void setGenericMcpEnvSecret(server.id, name, newEnvValue);
            const nextSecretNames = Array.from(new Set([...secretNames, name]));
            onUpdate({ secretEnvNames: nextSecretNames });
        } else {
            const nextEnv = { ...(server.env || {}), [name]: newEnvValue };
            onUpdate({ env: nextEnv });
        }
        setNewEnvKey('');
        setNewEnvValue('');
        setNewEnvSecret(false);
    };

    return (
        <div className="space-y-2">
            {!bridgeAvailable && (
                <div className="rounded-md bg-amber-50 px-2 py-1.5 text-[10px] leading-4 text-amber-700">
                    Local (stdio) MCP servers require the Curio desktop app. This transport will be skipped in a browser or PWA.
                </div>
            )}

            <div className="space-y-1.5">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Executable path</label>
                <input
                    type="text"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    placeholder={typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || '')
                        ? 'C:\\path\\to\\server.exe'
                        : '/usr/local/bin/my-mcp-server'}
                    className="block w-full min-w-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-400"
                    value={server.command || ''}
                    onChange={(event) => onUpdate({ command: event.target.value })}
                    onBlur={() => {
                        // Auto-suggest a friendly name when the user finishes
                        // typing a recognized executable path. Only fires once
                        // on blur to avoid stale-closure races during typing.
                        const defaultName = !server.name || server.name === 'External MCP Server';
                        if (!defaultName || !server.command?.trim()) return;
                        void import('../../../services/mcpProfiles').then(({ detectMcpProfile }) => {
                            const detected = detectMcpProfile({ ...server, transport: 'stdio' });
                            if (detected?.suggestedServerName && detected.suggestedServerName !== server.name) {
                                onUpdate({ name: detected.suggestedServerName });
                            }
                        });
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                />
            </div>

            <div className="space-y-1.5">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Arguments (space-separated, quotes respected)</label>
                <input
                    type="text"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    placeholder="--flag value"
                    className="block w-full min-w-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-400"
                    value={argsText}
                    onChange={(event) => setArgsText(event.target.value)}
                    onBlur={commitArgs}
                    onKeyDown={(event) => event.stopPropagation()}
                />
            </div>

            <div className="space-y-1.5">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Working directory (optional)</label>
                <input
                    type="text"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    placeholder="Leave empty to inherit"
                    className="block w-full min-w-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-400"
                    value={server.cwd || ''}
                    onChange={(event) => onUpdate({ cwd: event.target.value })}
                    onKeyDown={(event) => event.stopPropagation()}
                />
            </div>

            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Environment variables</label>
                    <span className="text-[9px] text-slate-400">Secrets are encrypted at rest.</span>
                </div>

                {(plainEnvEntries.length === 0 && secretNames.length === 0) && (
                    <p className="text-[10px] text-slate-400">None set.</p>
                )}

                {plainEnvEntries.map(([key, value]) => (
                    <div key={`plain-${key}`} className="grid grid-cols-[120px_1fr_auto] gap-1.5">
                        <span className="flex items-center truncate rounded-md border border-dashed border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-500">{key}</span>
                        <input
                            type="text"
                            value={value}
                            onChange={(event) => onUpdate({ env: { ...(server.env || {}), [key]: event.target.value } })}
                            onKeyDown={(event) => event.stopPropagation()}
                            className="min-w-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-400"
                        />
                        <button
                            type="button"
                            onClick={() => removeEnvKey(key)}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                            aria-label={`Remove env ${key}`}
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}

                {secretNames.map((name) => (
                    <div key={`secret-${name}`} className="grid grid-cols-[120px_1fr_auto] gap-1.5">
                        <span className="flex items-center gap-1 truncate rounded-md border border-dashed border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-semibold text-amber-700">
                            <ShieldCheck size={10} /> {name}
                        </span>
                        <div className="relative">
                            <input
                                type="text"
                                autoComplete="off"
                                value={envSecretCache[name] ?? (hasGenericMcpEnvSecret(server.id, name) ? '••••••' : '')}
                                onChange={(event) => {
                                    setEnvSecretCache((current) => ({ ...current, [name]: event.target.value }));
                                }}
                                onBlur={(event) => void setGenericMcpEnvSecret(server.id, name, event.target.value)}
                                onKeyDown={(event) => event.stopPropagation()}
                                className="w-full min-w-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 pr-8 text-[11px] text-slate-700 outline-none focus:border-blue-400"
                                placeholder="Secret value"
                                style={{ WebkitTextSecurity: showEnvSecret[name] ? 'none' : 'disc' } as React.CSSProperties}
                            />
                            <button
                                type="button"
                                onClick={() => setShowEnvSecret((current) => ({ ...current, [name]: !current[name] }))}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                aria-label={showEnvSecret[name] ? `Hide ${name}` : `Show ${name}`}
                            >
                                {showEnvSecret[name] ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => removeEnvKey(name)}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                            aria-label={`Remove env ${name}`}
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}

                <div className="grid grid-cols-[120px_1fr_auto_auto] items-center gap-1.5">
                    <input
                        type="text"
                        spellCheck={false}
                        autoCapitalize="off"
                        autoComplete="off"
                        placeholder="NAME"
                        value={newEnvKey}
                        onChange={(event) => setNewEnvKey(event.target.value.replace(/\s+/g, ''))}
                        onKeyDown={(event) => event.stopPropagation()}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-mono uppercase text-slate-700 outline-none focus:border-blue-400"
                    />
                    <input
                        type="text"
                        autoComplete="off"
                        placeholder={newEnvSecret ? 'Secret value (encrypted)' : 'Value'}
                        value={newEnvValue}
                        onChange={(event) => setNewEnvValue(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                        className="min-w-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-400"
                    />
                    <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                        <input
                            type="checkbox"
                            checked={newEnvSecret}
                            onChange={(event) => setNewEnvSecret(event.target.checked)}
                        />
                        Secret
                    </label>
                    <button
                        type="button"
                        onClick={addEnvKey}
                        disabled={!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newEnvKey.trim())}
                        className="rounded-md bg-slate-100 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-200 disabled:opacity-40"
                    >
                        Add
                    </button>
                </div>
            </div>
        </div>
    );
}

// -- Self-contained Generic MCP settings block --
function GenericMcpSettingsBlock() {
    const storedServers = useGenericMcpServers();
    const [servers, setServers] = useState<GenericMcpServerConfig[]>(storedServers);
    const [checkStatus, setCheckStatus] = useState<Record<string, GenericMcpCheckStatus>>({});
    const [authTokens, setAuthTokens] = useState<Record<string, string>>({});
    const [showAuthTokens, setShowAuthTokens] = useState<Record<string, boolean>>({});
    const [oauthStatus, setOauthStatus] = useState<Record<string, GenericMcpOAuthUiStatus>>({});
    const [expandedServerId, setExpandedServerId] = useState<string | null>(null);
    const [expandedToolsServerId, setExpandedToolsServerId] = useState<string | null>(null);
    const [catalogOpen, setCatalogOpen] = useState(false);

    useEffect(() => {
        setServers(storedServers);
    }, [storedServers]);

    useEffect(() => {
        let cancelled = false;
        void Promise.all(storedServers.map(async (server) => [server.id, await getGenericMcpAuthToken(server.id)] as const))
            .then((entries) => {
                if (cancelled) return;
                setAuthTokens(Object.fromEntries(entries));
            });
        return () => {
            cancelled = true;
        };
    }, [storedServers]);

    useEffect(() => {
        let cancelled = false;
        void import('../../../services/genericMcpOAuthService')
            .then(async ({ getGenericMcpOAuthConnectionStatus }) => {
                const entries = await Promise.all(storedServers
                    .filter((server) => server.authType === 'oauth')
                    .map(async (server) => {
                        const status = await getGenericMcpOAuthConnectionStatus(server.id);
                        return [server.id, { connected: status.connected }] as const;
                    }));
                if (!cancelled) {
                    setOauthStatus((current) => ({ ...current, ...Object.fromEntries(entries) }));
                }
            })
            .catch(() => {
                // OAuth status is best-effort UI state; tool calls still validate headers.
            });
        return () => {
            cancelled = true;
        };
    }, [storedServers]);

    const saveServers = useCallback((nextServers: GenericMcpServerConfig[]) => {
        setServers(nextServers);
        setGenericMcpServers(nextServers);
    }, []);

    const updateServer = useCallback((serverId: string, patch: Partial<GenericMcpServerConfig>) => {
        saveServers(servers.map((server) => server.id === serverId ? { ...server, ...patch } : server));
    }, [saveServers, servers]);

    const removeServer = useCallback((serverId: string) => {
        saveServers(servers.filter((server) => server.id !== serverId));
        setCheckStatus((current) => {
            const next = { ...current };
            delete next[serverId];
            return next;
        });
        setExpandedServerId((current) => (current === serverId ? null : current));
    }, [saveServers, servers]);

    const addCustomServer = useCallback(() => {
        const next = createGenericMcpServer();
        saveServers([...servers, next]);
        setExpandedServerId(next.id);
        setCatalogOpen(false);
    }, [saveServers, servers]);

    const addPresetServer = useCallback((preset: GenericMcpServerPreset) => {
        const existing = servers.find((server) =>
            server.id === preset.id ||
            server.url === preset.url ||
            (preset.id === EXA_FREE_MCP_SERVER_ID && (
                server.sourceUrl === EXA_FREE_MCP_SKILL_URL ||
                server.url.includes('mcp.exa.ai')
            ))
        );
        if (existing) {
            updateServer(existing.id, {
                kind: preset.kind,
                authType: preset.authType || existing.authType || 'none',
                authHeaderName: preset.authHeaderName || existing.authHeaderName,
                sourceUrl: existing.sourceUrl || preset.sourceUrl,
                usageHint: preset.usageHint || existing.usageHint,
            });
            setExpandedServerId(existing.id);
            return;
        }
        const next = createGenericMcpServerFromPreset(preset);
        saveServers([...servers, next]);
        setExpandedServerId(next.id);
        setCatalogOpen(false);
    }, [saveServers, servers, updateServer]);

    const connectOAuthServer = useCallback(async (server: GenericMcpServerConfig) => {
        const popup = window.open(
            'about:blank',
            `curio-mcp-oauth-${server.id}`,
            'width=520,height=680,left=120,top=80',
        );
        if (!popup) {
            setOauthStatus((current) => ({
                ...current,
                [server.id]: { connected: false, message: 'Popup blocked.' },
            }));
            return;
        }
        try {
            setOauthStatus((current) => ({
                ...current,
                [server.id]: { connected: false, checking: true, message: 'Connecting...' },
            }));
            const { startGenericMcpOAuth } = await import('../../../services/genericMcpOAuthService');
            const status = await startGenericMcpOAuth(server, popup);
            setOauthStatus((current) => ({
                ...current,
                [server.id]: { connected: status.connected, message: status.connected ? 'OAuth connected.' : 'Not connected.' },
            }));
            setCheckStatus((current) => ({
                ...current,
                [server.id]: { state: 'ok', message: 'OAuth connected. Test tools, then enable.' },
            }));
        } catch (error) {
            try { popup.close(); } catch { /* ignore */ }
            setOauthStatus((current) => ({
                ...current,
                [server.id]: { connected: false, message: (error as Error).message || 'OAuth failed.' },
            }));
            setCheckStatus((current) => ({
                ...current,
                [server.id]: { state: 'error', message: (error as Error).message || 'OAuth failed.' },
            }));
        }
    }, []);

    const disconnectOAuthServer = useCallback(async (server: GenericMcpServerConfig) => {
        const { clearGenericMcpOAuthConnection } = await import('../../../services/genericMcpOAuthService');
        await clearGenericMcpOAuthConnection(server.id);
        setOauthStatus((current) => ({
            ...current,
            [server.id]: { connected: false, message: 'OAuth disconnected.' },
        }));
        setCheckStatus((current) => ({
            ...current,
            [server.id]: { state: 'idle', message: 'OAuth disconnected.' },
        }));
    }, []);

    const checkServer = useCallback(async (server: GenericMcpServerConfig) => {
        const transport = server.transport || 'http';
        if (transport === 'stdio') {
            if (!server.command?.trim()) {
                setCheckStatus((current) => ({
                    ...current,
                    [server.id]: { state: 'error', message: 'Set a command path first.' },
                }));
                return;
            }
            if (!window.curioDesktop?.mcpStdio) {
                setCheckStatus((current) => ({
                    ...current,
                    [server.id]: { state: 'error', message: 'Local MCP servers require the Curio desktop app.' },
                }));
                return;
            }
        } else if (!server.url.trim()) {
            setCheckStatus((current) => ({
                ...current,
                [server.id]: { state: 'error', message: 'Add a URL first.' },
            }));
            return;
        }

        // When the user adds a recognized stdio MCP (e.g. the Outlook
        // Mail & Calendar server), apply any profile-specific env vars
        // that unlock the full tool set (writes, etc.) before we spawn
        // it for testing. This runs only when a profile is detected
        // from the executable name and never overwrites an existing
        // user value.
        let effectiveServer = server;
        try {
            const { applyProfileEnvDefaults } = await import('../../../services/mcpProfiles');
            const envResult = applyProfileEnvDefaults(server, 'test');
            if (envResult.changed) {
                const updated: GenericMcpServerConfig = {
                    ...server,
                    env: envResult.nextEnv,
                };
                effectiveServer = updated;
                const nextServers = servers.map((candidate) =>
                    candidate.id === server.id ? updated : candidate,
                );
                saveServers(nextServers);
            }
        } catch {
            // Best-effort. If profile application fails we still let the
            // user try Test; they can add env vars manually.
        }

        setCheckStatus((current) => ({
            ...current,
            [server.id]: { state: 'checking', message: 'Checking...' },
        }));

        try {
            if (effectiveServer.authType === 'oauth') {
                const { getGenericMcpOAuthConnectionStatus } = await import('../../../services/genericMcpOAuthService');
                const oauth = await getGenericMcpOAuthConnectionStatus(effectiveServer.id);
                if (!oauth.connected) {
                    setCheckStatus((current) => ({
                        ...current,
                        [effectiveServer.id]: { state: 'error', message: 'Connect OAuth first.' },
                    }));
                    return;
                }
            }
            await setGenericMcpAuthToken(effectiveServer.id, authTokens[effectiveServer.id] || '');
            const { fetchGenericMcpToolsForServer } = await import('../../../services/genericMcpService');
            const tools = await fetchGenericMcpToolsForServer(effectiveServer);
            setCheckStatus((current) => ({
                ...current,
                [effectiveServer.id]: {
                    state: 'ok',
                    message: tools.length > 0
                        ? `${tools.length} ${tools.length === 1 ? 'tool' : 'tools'} available`
                        : 'Connected, but no tools were returned.',
                    tools: tools.map((tool) => ({
                        name: tool.name || '',
                        description: typeof tool.description === 'string' ? tool.description : undefined,
                    })).filter((tool) => tool.name),
                },
            }));
        } catch (error) {
            setCheckStatus((current) => ({
                ...current,
                [effectiveServer.id]: {
                    state: 'error',
                    message: (error as Error).message || 'Connection failed.',
                },
            }));
        }
    }, [authTokens, saveServers, servers]);

    const enabledCount = servers.filter((server) => {
        if (!server.enabled) return false;
        if ((server.transport || 'http') === 'stdio') return Boolean(server.command?.trim());
        return Boolean(server.url.trim());
    }).length;
    const addedPresetIds = new Set(servers.map((server) => server.id));
    const availablePresets = GENERIC_MCP_SERVER_PRESETS.filter((preset) =>
        !addedPresetIds.has(preset.id) &&
        !servers.some((server) =>
            server.url === preset.url ||
            (preset.id === EXA_FREE_MCP_SERVER_ID && (
                server.sourceUrl === EXA_FREE_MCP_SKILL_URL ||
                server.url.includes('mcp.exa.ai')
            ))
        )
    );
    const mcpBadge = enabledCount > 0
        ? <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[8px] font-bold text-blue-600">{enabledCount}</span>
        : null;

    // Compact row health dot color. Green = enabled + not broken, amber = needs
    // setup, rose = last test failed, slate = disabled / no URL yet.
    type RowHealth = 'ok' | 'warn' | 'error' | 'idle';
    const rowHealth = (server: GenericMcpServerConfig): RowHealth => {
        const status = checkStatus[server.id]?.state;
        if (status === 'error') return 'error';
        const transport = server.transport || 'http';
        if (transport === 'stdio') {
            if (!server.command?.trim()) return 'warn';
        } else if (!server.url.trim()) return 'warn';
        if (server.authType === 'oauth' && !oauthStatus[server.id]?.connected) return 'warn';
        if (server.enabled) return 'ok';
        return 'idle';
    };
    const healthDotClass: Record<RowHealth, string> = {
        ok: 'bg-emerald-500 shadow-[0_0_0_3px_rgb(16_185_129/0.15)]',
        warn: 'bg-amber-400 shadow-[0_0_0_3px_rgb(251_191_36/0.15)]',
        error: 'bg-rose-500 shadow-[0_0_0_3px_rgb(244_63_94/0.15)]',
        idle: 'bg-slate-300',
    };

    const renderServerDetail = (server: GenericMcpServerConfig) => {
        const status = checkStatus[server.id] || { state: 'idle', message: '' };
        const isExa = server.id === EXA_FREE_MCP_SERVER_ID || server.sourceUrl === EXA_FREE_MCP_SKILL_URL;
        const matchingPreset = GENERIC_MCP_SERVER_PRESETS.find((preset) =>
            server.id === preset.id ||
            server.url === preset.url ||
            (preset.sourceUrl && server.sourceUrl === preset.sourceUrl)
        );
        return (
            <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 p-2.5">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input
                        type="text"
                        value={server.name}
                        onChange={(event) => updateServer(server.id, { name: event.target.value })}
                        onKeyDown={(event) => event.stopPropagation()}
                        className="min-w-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-blue-400"
                        placeholder="Provider name"
                    />
                    <button
                        type="button"
                        onClick={() => removeServer(server.id)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                        aria-label="Remove MCP server"
                    >
                        <Trash2 size={13} />
                    </button>
                </div>

                <div className="grid grid-cols-[110px_1fr] gap-2">
                    <select
                        value={server.kind}
                        onChange={(event) => updateServer(server.id, { kind: event.target.value === 'search' ? 'search' : 'general' })}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-600 outline-none focus:border-blue-400"
                    >
                        <option value="search">Search</option>
                        <option value="general">General</option>
                    </select>
                    <select
                        value={server.transport || 'http'}
                        onChange={(event) => {
                            const next: 'http' | 'stdio' = event.target.value === 'stdio' ? 'stdio' : 'http';
                            const patch: Partial<GenericMcpServerConfig> = { transport: next };
                            // Avoid leaving stale fields from the other transport around.
                            if (next === 'stdio') {
                                if (!server.command) patch.command = '';
                            } else {
                                patch.command = undefined;
                                patch.args = undefined;
                                patch.cwd = undefined;
                                patch.env = undefined;
                                patch.secretEnvNames = undefined;
                            }
                            updateServer(server.id, patch);
                        }}
                        className="col-span-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-600 outline-none focus:border-blue-400"
                    >
                        <option value="http">Remote (HTTP/HTTPS)</option>
                        <option value="stdio">Local (stdio command)</option>
                    </select>
                </div>

                {(server.transport || 'http') === 'http' ? (
                    <input
                        type="text"
                        placeholder="https://mcp.example.com/mcp or http://localhost:8765/mcp"
                        className="block w-full min-w-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-400"
                        value={server.url}
                        onChange={(event) => updateServer(server.id, { url: event.target.value })}
                        onKeyDown={(event) => event.stopPropagation()}
                    />
                ) : (
                    <McpStdioFields
                        server={server}
                        onUpdate={(patch) => updateServer(server.id, patch)}
                        bridgeAvailable={Boolean((typeof window !== 'undefined' ? window.curioDesktop : undefined)?.mcpStdio)}
                    />
                )}

                <input
                    type="text"
                    placeholder="AI hint: e.g. 'Use when user asks about earthquakes'"
                    className="block w-full min-w-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-500 outline-none focus:border-blue-400"
                    value={server.usageHint || ''}
                    onChange={(event) => updateServer(server.id, { usageHint: event.target.value })}
                    onKeyDown={(event) => event.stopPropagation()}
                />

                <div className="grid grid-cols-[110px_1fr] gap-2">
                    <select
                        value={server.authType || 'none'}
                        onChange={(event) => updateServer(server.id, {
                            authType: event.target.value === 'bearer'
                                ? 'bearer'
                                : event.target.value === 'api_key'
                                    ? 'api_key'
                                    : event.target.value === 'oauth'
                                        ? 'oauth'
                                        : 'none',
                        })}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-600 outline-none focus:border-blue-400"
                    >
                        <option value="none">No auth</option>
                        <option value="bearer">Bearer</option>
                        <option value="api_key">API key</option>
                        <option value="oauth">OAuth</option>
                    </select>
                    {(server.authType === 'bearer' || server.authType === 'api_key') && (
                        <div className="grid grid-cols-[130px_1fr] gap-2">
                            {server.authType === 'api_key' ? (
                                <input
                                    type="text"
                                    value={server.authHeaderName || 'x-api-key'}
                                    onChange={(event) => updateServer(server.id, { authHeaderName: event.target.value })}
                                    onKeyDown={(event) => event.stopPropagation()}
                                    className="min-w-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-400"
                                    placeholder="x-api-key"
                                />
                            ) : (
                                <span className="flex items-center rounded-md border border-dashed border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-400">Authorization</span>
                            )}
                            <div className="relative">
                                <input
                                    type="text"
                                    autoComplete="off"
                                    value={authTokens[server.id] || ''}
                                    onChange={(event) => setAuthTokens((current) => ({
                                        ...current,
                                        [server.id]: event.target.value,
                                    }))}
                                    onBlur={(event) => void setGenericMcpAuthToken(server.id, event.target.value)}
                                    onKeyDown={(event) => event.stopPropagation()}
                                    className="w-full min-w-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 pr-8 text-[11px] text-slate-700 outline-none focus:border-blue-400"
                                    placeholder={server.authType === 'bearer' ? 'Bearer token' : 'API key'}
                                    style={{ WebkitTextSecurity: showAuthTokens[server.id] ? 'none' : 'disc' } as React.CSSProperties}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowAuthTokens((current) => ({
                                        ...current,
                                        [server.id]: !current[server.id],
                                    }))}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    aria-label={showAuthTokens[server.id] ? 'Hide MCP token' : 'Show MCP token'}
                                >
                                    {showAuthTokens[server.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                                </button>
                            </div>
                        </div>
                    )}
                    {server.authType === 'oauth' && (
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => void connectOAuthServer(server)}
                                disabled={oauthStatus[server.id]?.checking}
                                className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:bg-blue-100 disabled:opacity-60"
                            >
                                {oauthStatus[server.id]?.connected ? <Link2 size={11} /> : <RefreshCw size={11} className={oauthStatus[server.id]?.checking ? 'animate-spin' : ''} />}
                                {oauthStatus[server.id]?.connected ? 'Reconnect' : 'Connect'}
                            </button>
                            {oauthStatus[server.id]?.connected && (
                                <button
                                    type="button"
                                    onClick={() => void disconnectOAuthServer(server)}
                                    className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-200"
                                >
                                    Disconnect
                                </button>
                            )}
                            <span className={`text-[10px] ${oauthStatus[server.id]?.connected ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {oauthStatus[server.id]?.connected ? 'Connected' : 'Not connected'}
                            </span>
                        </div>
                    )}
                </div>

                {(isExa || matchingPreset?.authInstructions) && (
                    <div className="rounded-md bg-blue-50/60 px-2 py-1.5 text-[9px] leading-4 text-blue-600">
                        {matchingPreset?.authInstructions}
                        {isExa && !matchingPreset?.authInstructions && (
                            <>LobeHub skill: {EXA_FREE_MCP_SKILL_URL}</>
                        )}
                    </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-0.5">
                    <button
                        type="button"
                        onClick={() => void checkServer(server)}
                        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${status.state === 'ok' ? 'bg-emerald-100 text-emerald-700' : status.state === 'error' ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                        {status.state === 'error' ? <AlertCircle size={11} /> : status.state === 'ok' ? <Check size={11} /> : <RefreshCw size={11} className={status.state === 'checking' ? 'animate-spin' : ''} />}
                        {status.state === 'checking' ? 'Checking' : 'Test'}
                    </button>
                    {status.message && (
                        status.state === 'ok' && status.tools && status.tools.length > 0 ? (
                            <button
                                type="button"
                                onClick={() => setExpandedToolsServerId((current) => current === server.id ? null : server.id)}
                                className="flex min-w-0 items-center gap-1 text-[10px] text-emerald-600 hover:text-emerald-700 hover:underline"
                                aria-expanded={expandedToolsServerId === server.id}
                            >
                                <ChevronRight
                                    size={10}
                                    className={`shrink-0 transition-transform ${expandedToolsServerId === server.id ? 'rotate-90' : ''}`}
                                />
                                <span className="truncate">{status.message}</span>
                            </button>
                        ) : (
                            <span className={`min-w-0 truncate text-[10px] ${status.state === 'ok' ? 'text-emerald-600' : status.state === 'error' ? 'text-rose-500' : 'text-slate-400'}`}>
                                {status.message}
                            </span>
                        )
                    )}
                </div>

                {status.state === 'ok' && status.tools && status.tools.length > 0 && expandedToolsServerId === server.id && (
                    <div className="mt-1 max-h-56 overflow-y-auto rounded-md border border-emerald-100 bg-emerald-50/40 p-1.5">
                        <ul className="space-y-1">
                            {status.tools.map((tool) => (
                                <li key={tool.name} className="rounded bg-white/70 px-2 py-1">
                                    <code className="block break-all text-[10px] font-semibold text-emerald-700">{tool.name}</code>
                                    {tool.description && (
                                        <p className="mt-0.5 line-clamp-3 text-[9px] leading-snug text-slate-500">
                                            {tool.description}
                                        </p>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        );
    };

    return (
        <SubGroup
            title="External MCP Servers"
            icon={<McpIcon size={15} />}
            badge={mcpBadge}
        >
            <div className="space-y-2">
                <div className="flex items-start justify-between gap-2 pb-1">
                    <p className="flex-1 text-[10px] leading-4 text-slate-400">
                        Add search or general MCP servers for Live AI, Nova, and Text LLM tools.
                    </p>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {availablePresets.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setCatalogOpen((current) => !current)}
                                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${catalogOpen ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                                <Search size={11} />
                                Browse
                                <span className={`rounded-full px-1 text-[8px] font-black ${catalogOpen ? 'bg-white/25' : 'bg-slate-200'}`}>{availablePresets.length}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={addCustomServer}
                            className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-200"
                        >
                            <Plus size={11} /> Add
                        </button>
                    </div>
                </div>

                <AnimatePresence initial={false}>
                    {catalogOpen && availablePresets.length > 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: 'easeInOut' }}
                            className="overflow-hidden"
                        >
                            <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-slate-200 bg-slate-50/50 p-1.5 md:grid-cols-2">
                                {availablePresets.map((preset) => (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => addPresetServer(preset)}
                                        className="group flex min-w-0 items-start gap-2 rounded-md bg-white px-2 py-1.5 text-left transition-colors hover:bg-blue-50"
                                    >
                                        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${preset.kind === 'search' ? 'bg-blue-50 text-blue-500' : 'bg-slate-100 text-slate-500'} group-hover:bg-white`}>
                                            {preset.kind === 'search' ? <Search size={12} /> : <McpIcon size={12} />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex flex-wrap items-center gap-1.5">
                                                <span className="truncate text-[11px] font-bold text-slate-700">{preset.name}</span>
                                                <span className="shrink-0 rounded-full bg-slate-100 px-1 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-slate-500">
                                                    {getPresetAuthLabel(preset)}
                                                </span>
                                            </span>
                                            <span className="mt-0.5 block text-[9px] leading-[1.35] text-slate-400 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden">{preset.description}</span>
                                        </span>
                                        <Plus size={12} className="mt-0.5 shrink-0 text-slate-400 group-hover:text-blue-500" />
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {servers.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-white/60 px-3 py-4 text-center">
                        <div className="flex justify-center text-slate-300 mb-1.5">
                            <Circle size={18} />
                        </div>
                        <p className="text-[11px] text-slate-500">No MCP servers yet.</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                            {availablePresets.length > 0 ? 'Browse the catalog to add one.' : 'Add a custom server to get started.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {servers.map((server) => {
                            const health = rowHealth(server);
                            const isOpen = expandedServerId === server.id;
                            const authLabel = server.authType === 'oauth'
                                ? (oauthStatus[server.id]?.connected ? 'OAuth' : 'OAuth (not connected)')
                                : server.authType === 'bearer' ? 'Bearer'
                                    : server.authType === 'api_key' ? 'API key'
                                        : 'No auth';
                            const hostLabel = (() => { try { return server.url ? new URL(server.url).hostname : ''; } catch { return server.url; } })();

                            return (
                                <div key={server.id} className="rounded-xl border border-slate-200/70 bg-white/80 overflow-hidden transition-shadow hover:shadow-sm">
                                    <div className="flex items-center gap-2 px-2.5 py-2">
                                        <button
                                            type="button"
                                            onClick={() => setExpandedServerId((current) => current === server.id ? null : server.id)}
                                            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                                            aria-expanded={isOpen}
                                            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${server.name || 'MCP server'}`}
                                        >
                                            <span className={`h-2 w-2 shrink-0 rounded-full ${healthDotClass[health]}`} />
                                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${server.kind === 'search' ? 'bg-blue-50 text-blue-500' : 'bg-slate-100 text-slate-500'}`}>
                                                {server.kind === 'search' ? <Search size={12} /> : <McpIcon size={12} />}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-1.5">
                                                    <span className="truncate text-[12px] font-bold text-slate-700">{server.name || 'Untitled MCP'}</span>
                                                    {server.enabled && (
                                                        <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-emerald-600">On</span>
                                                    )}
                                                </span>
                                                <span className="mt-0.5 flex items-center gap-1.5 text-[9px] text-slate-400">
                                                    <span className="shrink-0">{authLabel}</span>
                                                    {hostLabel && (
                                                        <>
                                                            <span>&middot;</span>
                                                            <span className="truncate">{hostLabel}</span>
                                                        </>
                                                    )}
                                                </span>
                                            </span>
                                        </button>

                                        <div className="flex shrink-0 items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const transport = server.transport || 'http';
                                                    const missing = transport === 'stdio'
                                                        ? !server.command?.trim()
                                                        : !server.url.trim();
                                                    if (!server.enabled && missing) {
                                                        setCheckStatus((current) => ({
                                                            ...current,
                                                            [server.id]: {
                                                                state: 'error',
                                                                message: transport === 'stdio'
                                                                    ? 'Set a command before enabling.'
                                                                    : 'Add a URL before enabling.',
                                                            },
                                                        }));
                                                        setExpandedServerId(server.id);
                                                        return;
                                                    }
                                                    updateServer(server.id, { enabled: !server.enabled });
                                                }}
                                                aria-label={server.enabled ? 'Disable MCP server' : 'Enable MCP server'}
                                                role="switch"
                                                aria-checked={server.enabled}
                                                data-state={server.enabled ? 'on' : 'off'}
                                                className="curio-settings-toggle-switch relative h-5 w-9 shrink-0 rounded-full transition-colors"
                                            >
                                                <span className={`curio-settings-toggle-thumb absolute top-0.5 left-0.5 h-4 w-4 rounded-full shadow transition-transform ${server.enabled ? 'translate-x-4' : ''}`} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setExpandedServerId((current) => current === server.id ? null : server.id)}
                                                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                                aria-hidden="true"
                                                tabIndex={-1}
                                            >
                                                {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                            </button>
                                        </div>
                                    </div>

                                    <AnimatePresence initial={false}>
                                        {isOpen && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.22, ease: 'easeInOut' }}
                                            >
                                                {renderServerDetail(server)}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </SubGroup>
    );
}

export default React.memo(AccountsKeysSection);
