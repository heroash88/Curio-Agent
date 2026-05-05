/**
 * Gmail handlers: list inbox or search results, send replies. Reply is
 * gated on getGmailReplyEnabled() so users can disable writes while
 * keeping reads enabled.
 */

import { register } from '../router';

register('check_gmail', async (args, ctx) => {
    try {
        const { listMessages } = await import('../../gmailApi');
        const { messages, totalUnread } = await listMessages({
            maxResults: args?.maxResults || 10,
            query: args?.query,
            labelIds: args?.query ? undefined : ['INBOX'],
        });
        if (ctx.onCardEvent) {
            try {
                ctx.onCardEvent({
                    type: 'gmail',
                    data: {
                        messages,
                        totalUnread,
                        mode: args?.query ? 'search' : 'inbox',
                        query: args?.query,
                    },
                    persistent: true,
                });
            } catch {}
        }
        return {
            result: {
                success: true,
                count: messages.length,
                unread: totalUnread,
                messages: messages.slice(0, 5).map(m => ({
                    id: m.id,
                    threadId: m.threadId,
                    from: m.fromName || m.from,
                    subject: m.subject,
                    snippet: m.snippet,
                    isUnread: m.isUnread,
                    date: m.date,
                })),
            },
            emittedCard: true,
        };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});

register('reply_gmail', async (args, ctx) => {
    const { getGmailReplyEnabled } = await import('../../../utils/settingsStorage');
    if (!getGmailReplyEnabled()) {
        return {
            result: {
                success: false,
                replyBlocked: true,
                error: 'Gmail replies are disabled. Tell the user: "Email replies are currently turned off. You can enable them in Settings > Accounts & Keys > Gmail."',
            },
            emittedCard: false,
        };
    }
    try {
        const { sendReply } = await import('../../gmailApi');
        await sendReply({
            threadId: args.threadId,
            messageId: args.messageId,
            to: args.to,
            subject: args.subject,
            body: args.body,
        });
        if (ctx.onCardEvent) {
            try {
                ctx.onCardEvent({
                    type: 'list',
                    data: { title: '📧 Reply Sent', items: [`To: ${args.to}`, `Subject: Re: ${args.subject}`] },
                    autoDismissMs: 5000,
                });
            } catch {}
        }
        return { result: { success: true, message: `Reply sent to ${args.to}.` }, emittedCard: true };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});
