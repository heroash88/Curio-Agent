/**
 * Slack handlers: send a message, list channels, and get recent messages
 * with an offline cache fallback when the Slack API is unreachable.
 */

import { register } from '../router';

register('send_slack_message', async (args, ctx) => {
    try {
        const { sendMessage, resolveChannel } = await import('../../slackApi');
        const channelId = await resolveChannel(args.channel);
        await sendMessage(channelId, args.text);
        if (ctx.onCardEvent) {
            try {
                ctx.onCardEvent({
                    type: 'slack',
                    data: {
                        channel: channelId,
                        channelName: args.channel,
                        messages: [{ id: Date.now().toString(), channel: channelId, user: 'You', text: args.text, timestamp: 'Just now' }],
                        mode: 'sent',
                    },
                    autoDismissMs: 5000,
                });
            } catch {}
        }
        return { result: { success: true, message: `Message sent to ${args.channel}.` }, emittedCard: true };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});

register('get_slack_messages', async (args, ctx) => {
    console.log('[Slack] get_slack_messages tool called, args:', JSON.stringify(args));
    try {
        let channelId: string;
        let channelName: string;
        let messages: import('../../cardTypes').SlackMessage[];

        if (args.channel) {
            // Specific channel requested
            const { listMessages, resolveChannel } = await import('../../slackApi');
            channelId = await resolveChannel(args.channel);
            channelName = args.channel;
            messages = await listMessages(channelId, args.limit || 15, args.channel);
        } else {
            // No channel specified -- fetch from most active channel
            const { getRecentMessages } = await import('../../slackApi');
            const result = await getRecentMessages(args.limit || 15);
            channelId = result.channel.id;
            channelName = '#' + result.channel.name;
            messages = result.messages;
        }

        console.log('[Slack] get_slack_messages: got', messages.length, 'messages from', channelName);
        if (ctx.onCardEvent) {
            try {
                ctx.onCardEvent({
                    type: 'slack',
                    data: {
                        channel: channelId,
                        channelName,
                        messages,
                        mode: 'messages',
                    },
                    persistent: true,
                });
            } catch {}
        }
        return {
            result: {
                success: true,
                channel: channelName,
                messages: messages.slice(0, 10).map(m => ({
                    user: m.user,
                    text: m.text.slice(0, 100),
                    timestamp: m.timestamp,
                })),
                count: messages.length,
            },
            emittedCard: true,
        };
    } catch (e) {
        console.error('[Slack] get_slack_messages failed:', (e as Error).message);
        // Offline fallback: try cached messages
        try {
            const { getOfflineMessages, getCachedChannelIds } = await import('../../slackApi');
            // If a specific channel was requested, try that cache; otherwise try any cached channel
            const cacheTarget = args.channel || getCachedChannelIds()[0];
            if (cacheTarget) {
                const cached = getOfflineMessages(cacheTarget);
                if (cached && cached.messages.length > 0) {
                    const age = Date.now() - cached.cachedAt;
                    const ageLabel = age < 60000 ? 'just now'
                        : age < 3600000 ? `${Math.round(age / 60000)}m ago`
                        : `${Math.round(age / 3600000)}h ago`;
                    console.log('[Slack] Serving offline cache for', cacheTarget, '-- cached', ageLabel);
                    if (ctx.onCardEvent) {
                        try {
                            ctx.onCardEvent({
                                type: 'slack',
                                data: {
                                    channel: cacheTarget,
                                    channelName: cached.channelName || cacheTarget,
                                    messages: cached.messages,
                                    mode: 'messages',
                                    offline: true,
                                    cachedAt: ageLabel,
                                },
                                persistent: true,
                            });
                        } catch {}
                    }
                    return {
                        result: {
                            success: true,
                            offline: true,
                            cachedAt: ageLabel,
                            channel: cached.channelName || cacheTarget,
                            messages: cached.messages.slice(0, 10).map(m => ({
                                user: m.user,
                                text: m.text.slice(0, 100),
                                timestamp: m.timestamp,
                            })),
                            count: cached.messages.length,
                            note: `Showing cached messages from ${ageLabel}. Could not reach Slack.`,
                        },
                        emittedCard: true,
                    };
                }
            }
        } catch { /* cache read failed too */ }
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});

register('list_slack_channels', async (_args, ctx) => {
    try {
        const { listChannels } = await import('../../slackApi');
        const channels = await listChannels();
        if (ctx.onCardEvent) {
            try {
                ctx.onCardEvent({
                    type: 'list',
                    data: {
                        title: '💬 Slack Channels',
                        items: channels.slice(0, 20).map(ch => `#${ch.name}`),
                    },
                    autoDismissMs: 15000,
                });
            } catch {}
        }
        return {
            result: {
                success: true,
                channels: channels.map(ch => ({ id: ch.id, name: ch.name })),
                count: channels.length,
            },
            emittedCard: true,
        };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});
