// src/services/slackApi.ts
// Slack Web API client -- list channels, read messages, send messages.
// Uses a user/bot token stored in settings (pasted directly or via OAuth).

import { getSlackAccessToken, setSlackAccessToken } from '../utils/settingsStorage';
import type { SlackMessage, SlackChannel } from './cardTypes';

const SLACK_API = 'https://slack.com/api';

// In the browser, Slack's API blocks CORS. Route through a local proxy instead.
// Dev: Vite proxy at /slack-proxy -> https://slack.com/api
// Prod (HA addon): nginx proxy at /slack-proxy -> https://slack.com/api
function getSlackApiBase(): string {
    // If running in a browser context, use the proxy
    if (typeof window !== 'undefined') {
        return window.location.origin + '/slack-proxy';
    }
    return SLACK_API;
}

// -- Offline cache --

const CACHE_KEY_PREFIX = 'curio_slack_cache_';
const MAX_CACHED_CHANNELS = 20;

function cacheKey(channel: string): string {
    return CACHE_KEY_PREFIX + channel;
}

function cacheMessages(channel: string, messages: SlackMessage[], channelName?: string): void {
    try {
        const entry = { messages, channelName, cachedAt: Date.now() };
        localStorage.setItem(cacheKey(channel), JSON.stringify(entry));
    } catch { /* storage full -- ignore */ }
}

interface CachedSlackData {
    messages: SlackMessage[];
    channelName?: string;
    cachedAt: number;
}

function getCachedMessages(channel: string): CachedSlackData | null {
    try {
        const raw = localStorage.getItem(cacheKey(channel));
        if (!raw) return null;
        return JSON.parse(raw) as CachedSlackData;
    } catch { return null; }
}

/** Returns all cached channel keys for listing offline channels. */
export function getCachedChannelIds(): string[] {
    const ids: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_KEY_PREFIX)) {
            ids.push(key.slice(CACHE_KEY_PREFIX.length));
        }
    }
    return ids.slice(0, MAX_CACHED_CHANNELS);
}

/** Get cached data for a channel (for offline reads). */
export function getOfflineMessages(channel: string): CachedSlackData | null {
    return getCachedMessages(channel);
}

// -- Helpers --

function ensureToken(): string {
    const token = getSlackAccessToken();
    if (!token) {
        console.warn('[Slack] No token configured');
        throw new Error(
            'Slack token is not configured. Add it in Settings > Accounts & Keys > Slack.',
        );
    }
    console.log('[Slack] Token found:', token.slice(0, 8) + '...');
    return token;
}

async function slackFetch(method: string, params: Record<string, string> = {}): Promise<any> {
    const token = ensureToken();
    const base = getSlackApiBase();
    console.log('[Slack] API call:', method, 'via', base);
    const res = await fetch(`${base}/${method}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(params).toString(),
    });
    const data = await res.json();
    if (!data.ok) {
        console.error('[Slack] API error:', method, data.error);
        if (data.error === 'invalid_auth' || data.error === 'token_expired') {
            setSlackAccessToken('');
        }
        throw new Error(data.error || 'Slack API error');
    }
    console.log('[Slack] API success:', method);
    return data;
}

// -- Public API --

export async function listChannels(limit = 50): Promise<SlackChannel[]> {
    const data = await slackFetch('conversations.list', {
        types: 'public_channel,private_channel,im,mpim',
        limit: String(limit),
        exclude_archived: 'true',
    });
    return (data.channels || []).map((ch: any) => ({
        id: ch.id,
        name: ch.name || ch.id,
        isIm: !!ch.is_im,
        isMpim: !!ch.is_mpim,
    }));
}

export async function listMessages(channel: string, limit = 15, channelName?: string): Promise<SlackMessage[]> {
    console.log('[Slack] listMessages: channel=', channel, 'limit=', limit);
    const data = await slackFetch('conversations.history', {
        channel,
        limit: String(limit),
    });

    // Resolve user names in parallel
    const userIds = [...new Set((data.messages || []).map((m: any) => m.user).filter(Boolean))] as string[];
    const userMap = new Map<string, string>();
    await Promise.all(
        userIds.map(async (uid: string) => {
            try {
                const u = await slackFetch('users.info', { user: uid });
                userMap.set(uid, u.user?.real_name || u.user?.name || uid);
            } catch { userMap.set(uid, uid); }
        }),
    );

    const messages = (data.messages || []).reverse().map((m: any) => ({
        id: m.ts,
        channel,
        user: userMap.get(m.user) || m.user || 'bot',
        text: m.text || '',
        timestamp: m.ts
            ? new Date(parseFloat(m.ts) * 1000).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
            })
            : '',
    }));

    // Cache for offline access
    cacheMessages(channel, messages, channelName);
    console.log('[Slack] listMessages: got', messages.length, 'messages, cached for offline');

    return messages;
}

export async function sendMessage(channel: string, text: string): Promise<{ ts: string }> {
    const data = await slackFetch('chat.postMessage', { channel, text });
    return { ts: data.ts };
}

export async function resolveChannel(nameOrId: string): Promise<string> {
    // If it looks like a channel ID already, return it
    if (/^[CDGU][A-Z0-9]+$/.test(nameOrId)) return nameOrId;

    // Strip leading # if present
    const name = nameOrId.replace(/^#/, '');

    const channels = await listChannels(200);
    const match = channels.find(
        ch => ch.name.toLowerCase() === name.toLowerCase() || ch.id === nameOrId,
    );
    if (match) return match.id;
    throw new Error(`Slack channel "${nameOrId}" not found.`);
}

/**
 * Fetch recent messages without specifying a channel.
 * Picks the first non-IM channel (usually #general) or falls back to the first channel.
 */
export async function getRecentMessages(limit = 15): Promise<{ channel: SlackChannel; messages: SlackMessage[] }> {
    console.log('[Slack] getRecentMessages: fetching channel list...');
    const channels = await listChannels(50);
    if (channels.length === 0) throw new Error('No Slack channels found.');

    // Prefer #general, then first non-IM channel, then first channel
    const general = channels.find(ch => ch.name === 'general');
    const target = general || channels.find(ch => !ch.isIm && !ch.isMpim) || channels[0];
    console.log('[Slack] getRecentMessages: using channel', target.name, target.id);

    const messages = await listMessages(target.id, limit, target.name);
    return { channel: target, messages };
}
