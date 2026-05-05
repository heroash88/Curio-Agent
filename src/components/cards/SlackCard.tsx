import React, { useState } from 'react';
import type { CardComponentProps, SlackCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';
import { Hash, Send } from 'lucide-react';

const SlackCard: React.FC<CardComponentProps> = ({ card, onInteractionStart, onInteractionEnd }) => {
    const t = useCardTheme();
    const d = card.data as unknown as SlackCardData;
    const isOffline = !!(d as any).offline;
    const cachedAt = (d as any).cachedAt as string | undefined;
    const [replyText, setReplyText] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSend = async () => {
        if (!replyText.trim()) return;
        setSending(true);
        try {
            const { sendMessage } = await import('../../services/slackApi');
            await sendMessage(d.channel, replyText.trim());
            setSent(true);
            setReplyText('');
            setTimeout(() => setSent(false), 2000);
        } catch (e) {
            console.error('[SlackCard] Send failed:', e);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="card-glass min-w-[360px] max-w-[480px]" onMouseEnter={onInteractionStart} onMouseLeave={onInteractionEnd}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4A154B]/20">
                    <Hash size={16} className="text-[#4A154B]" />
                </div>
                <h3 className={`text-base font-bold flex-1 ${t.text}`}>
                    {d.channelName || d.channel}
                </h3>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${t.muted}`}>Slack</span>
                {isOffline && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-700">
                        Offline{cachedAt ? ` -- ${cachedAt}` : ''}
                    </span>
                )}
            </div>

            {/* Messages */}
            <div className="space-y-1.5 max-h-64 overflow-y-auto mb-3">
                {d.messages.length === 0 && (
                    <p className={`text-center text-sm py-4 ${t.muted}`}>No messages.</p>
                )}
                {d.messages.map(msg => (
                    <div key={msg.id} className={`rounded-xl px-3 py-2 ${t.panel} border ${t.panelBorder}`}>
                        <div className="flex items-center justify-between mb-0.5">
                            <p className={`text-xs font-bold ${t.text2}`}>{msg.user}</p>
                            <p className={`text-[10px] ${t.muted}`}>{msg.timestamp}</p>
                        </div>
                        <p className={`text-xs ${t.muted} whitespace-pre-wrap`}>{msg.text}</p>
                    </div>
                ))}
            </div>

            {/* Quick reply -- hidden when offline */}
            {d.mode === 'messages' && !isOffline && (
                sent ? (
                    <p className="text-center text-sm text-emerald-400 font-bold py-2">Sent!</p>
                ) : (
                    <div className="flex gap-2">
                        <input
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                            placeholder="Type a message..."
                            className={`flex-1 rounded-xl border px-3 py-2 text-sm outline-none ${t.panel} ${t.panelBorder} ${t.text2}`}
                        />
                        <button onClick={handleSend} disabled={sending || !replyText.trim()} className="rounded-xl px-3 bg-[#4A154B] text-white hover:bg-[#611f69] disabled:opacity-50 shrink-0">
                            <Send size={14} />
                        </button>
                    </div>
                )
            )}
        </div>
    );
};

export default SlackCard;
