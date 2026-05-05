/**
 * Microsoft Outlook mail handlers: inbox/search, reply, and send. Reply
 * and send are gated on getOutlookReplyEnabled() so users can disable
 * outbound email while keeping reads.
 */

import { register } from '../router';

register('check_outlook_mail', async (args, ctx) => {
    try {
        const { listMessages } = await import('../../outlookMailApi');
        const { messages, totalUnread } = await listMessages({
            maxResults: args?.maxResults || 10,
            query: args?.query,
        });
        if (ctx.onCardEvent) {
            try {
                ctx.onCardEvent({
                    type: 'outlookMail',
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
                    conversationId: m.conversationId,
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

register('reply_outlook_mail', async (args, ctx) => {
    const { getOutlookReplyEnabled } = await import('../../../utils/settingsStorage');
    if (!getOutlookReplyEnabled()) {
        return {
            result: {
                success: false,
                replyBlocked: true,
                error: 'Outlook replies are disabled. Tell the user: "Email replies are currently turned off. You can enable them in Settings > Accounts & Keys > Microsoft Outlook."',
            },
            emittedCard: false,
        };
    }
    try {
        const { sendReply } = await import('../../outlookMailApi');
        await sendReply({ messageId: args.messageId, body: args.body });
        if (ctx.onCardEvent) {
            try {
                ctx.onCardEvent({
                    type: 'list',
                    data: { title: '📧 Outlook Reply Sent', items: [`Message ID: ${args.messageId}`] },
                    autoDismissMs: 5000,
                });
            } catch {}
        }
        return { result: { success: true, message: 'Reply sent via Outlook.' }, emittedCard: true };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});

register('send_outlook_mail', async (args, ctx) => {
    const { getOutlookReplyEnabled } = await import('../../../utils/settingsStorage');
    if (!getOutlookReplyEnabled()) {
        return {
            result: {
                success: false,
                replyBlocked: true,
                error: 'Outlook sending is disabled. Tell the user: "Email sending is currently turned off. You can enable it in Settings > Accounts & Keys > Microsoft Outlook."',
            },
            emittedCard: false,
        };
    }
    try {
        const { sendMail } = await import('../../outlookMailApi');
        await sendMail({ to: args.to, subject: args.subject, body: args.body });
        if (ctx.onCardEvent) {
            try {
                ctx.onCardEvent({
                    type: 'list',
                    data: { title: '📧 Outlook Email Sent', items: [`To: ${args.to}`, `Subject: ${args.subject}`] },
                    autoDismissMs: 5000,
                });
            } catch {}
        }
        return { result: { success: true, message: `Email sent to ${args.to} via Outlook.` }, emittedCard: true };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});
