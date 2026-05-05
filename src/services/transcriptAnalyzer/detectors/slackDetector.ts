import type { CardEvent } from '../../cardTypes';

const SLACK_PATTERN = /\b(?:check|read|show|open|what(?:'s| is)?\s+(?:on|in))\s+(?:my\s+)?slack\b/;
const SLACK_SIMPLE = /\b(?:slack\s+messages?|my\s+slack)\b/;

/**
 * Detects Slack message requests and returns cached messages for offline use.
 * When online, the AI tool call handles this. When offline (transcript analyzer
 * running in offline mode), this serves cached messages directly.
 */
export function detectSlack(normalized: string, _trimmed: string): CardEvent | null {
    if (!SLACK_PATTERN.test(normalized) && !SLACK_SIMPLE.test(normalized)) return null;

    // Try to load cached messages synchronously from localStorage
    try {
        const ids = getCachedChannelIds();
        if (ids.length === 0) {
            console.log('[SlackDetector] No cached Slack channels found');
            return null;
        }

        // Grab the first cached channel
        const channelId = ids[0];
        const raw = localStorage.getItem('curio_slack_cache_' + channelId);
        if (!raw) return null;

        const cached = JSON.parse(raw) as {
            messages: Array<{ id: string; channel: string; user: string; text: string; timestamp: string }>;
            channelName?: string;
            cachedAt: number;
        };

        if (!cached.messages || cached.messages.length === 0) return null;

        const age = Date.now() - cached.cachedAt;
        const ageLabel = age < 60000 ? 'just now'
            : age < 3600000 ? `${Math.round(age / 60000)}m ago`
            : `${Math.round(age / 3600000)}h ago`;

        console.log('[SlackDetector] Serving offline cache for', cached.channelName || channelId, '--', ageLabel);

        return {
            type: 'slack',
            data: {
                channel: channelId,
                channelName: cached.channelName || channelId,
                messages: cached.messages,
                mode: 'messages',
                offline: true,
                cachedAt: ageLabel,
            } as Record<string, unknown>,
            persistent: true,
        };
    } catch (e) {
        console.error('[SlackDetector] Failed to read cache:', e);
        return null;
    }
}

/** Read cached channel IDs from localStorage (sync, no imports needed). */
function getCachedChannelIds(): string[] {
    const prefix = 'curio_slack_cache_';
    const ids: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
            ids.push(key.slice(prefix.length));
        }
    }
    return ids;
}
