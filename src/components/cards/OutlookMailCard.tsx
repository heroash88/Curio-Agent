import React, { useState } from "react";
import type {
  CardComponentProps,
  OutlookMailCardData,
  OutlookMailMessage,
} from "../../services/cardTypes";
import { useCardTheme } from "../../hooks/useCardTheme";
import { Mail, MailOpen, Send, ChevronRight, X } from "lucide-react";

const OutlookMailCard: React.FC<CardComponentProps> = ({
  card,
  onInteractionStart,
  onInteractionEnd,
}) => {
  const t = useCardTheme();
  const d = card.data as unknown as OutlookMailCardData;
  const cardWidthClass =
    "w-[min(30rem,calc(100vw-1.5rem))] min-w-0 max-w-[480px]";
  const [selected, setSelected] = useState<OutlookMailMessage | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReply = async () => {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      const { sendReply } = await import("../../services/outlookMailApi");
      await sendReply({ messageId: selected.id, body: replyText.trim() });
      setSent(true);
      setReplyText("");
      setTimeout(() => {
        setSent(false);
        setSelected(null);
      }, 2000);
    } catch (e) {
      console.error("[OutlookMailCard] Reply failed:", e);
    } finally {
      setSending(false);
    }
  };

  // Thread view
  if (selected && d.threadMessages) {
    return (
      <div
        className={`card-glass ${cardWidthClass}`}
        onMouseEnter={onInteractionStart}
        onMouseLeave={onInteractionEnd}
      >
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setSelected(null)}
            className={`rounded-lg p-1 ${t.btn} ${t.btnText}`}
          >
            <X size={14} />
          </button>
          <p className={`text-sm font-bold truncate flex-1 ${t.text}`}>
            {d.threadSubject || selected.subject}
          </p>
        </div>
        <div className="space-y-2 max-h-52 overflow-y-auto mb-3">
          {d.threadMessages.map((msg, i) => (
            <div
              key={i}
              className={`rounded-xl p-3 ${t.panel} border ${t.panelBorder}`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className={`text-xs font-bold ${t.text2}`}>{msg.from}</p>
                <p className={`text-[10px] ${t.muted}`}>{msg.date}</p>
              </div>
              <p
                className={`text-xs ${t.muted} whitespace-pre-wrap line-clamp-4`}
              >
                {msg.body}
              </p>
            </div>
          ))}
        </div>
        {sent ? (
          <p className="text-center text-sm text-emerald-400 font-bold py-2">
            Sent!
          </p>
        ) : (
          <div className="flex gap-2">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply..."
              rows={2}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm outline-none resize-none ${t.panel} ${t.panelBorder} ${t.text2}`}
            />
            <button
              onClick={handleReply}
              disabled={sending || !replyText.trim()}
              className="rounded-xl px-3 bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 shrink-0"
            >
              <Send size={14} />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`card-glass ${cardWidthClass}`}
      onMouseEnter={onInteractionStart}
      onMouseLeave={onInteractionEnd}
    >
      <div className="flex items-center gap-2 mb-3">
        <Mail size={16} className="text-blue-500" />
        <h3 className={`text-base font-bold flex-1 ${t.text}`}>
          {d.mode === "search" ? `Outlook: "${d.query}"` : "Outlook Inbox"}
        </h3>
        {d.totalUnread != null && d.totalUnread > 0 && (
          <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-black text-white">
            {d.totalUnread} unread
          </span>
        )}
      </div>
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {d.messages.length === 0 && (
          <p className={`text-center text-sm py-4 ${t.muted}`}>
            No messages found.
          </p>
        )}
        {d.messages.map((msg) => (
          <button
            key={msg.id}
            onClick={() => setSelected(msg)}
            className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors ${t.panel} border ${t.panelBorder} hover:opacity-80`}
          >
            <div className="flex items-start gap-2">
              {msg.isUnread ? (
                <Mail size={14} className="text-blue-400 shrink-0 mt-0.5" />
              ) : (
                <MailOpen size={14} className={`${t.muted} shrink-0 mt-0.5`} />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={`text-xs font-bold truncate ${msg.isUnread ? t.text : t.text2}`}
                  >
                    {msg.fromName || msg.from}
                  </p>
                  <p className={`text-[10px] shrink-0 ${t.muted}`}>
                    {msg.date}
                  </p>
                </div>
                <p
                  className={`text-xs truncate ${msg.isUnread ? t.text2 : t.muted}`}
                >
                  {msg.subject}
                </p>
                <p className={`text-[11px] truncate ${t.muted}`}>
                  {msg.snippet}
                </p>
              </div>
              <ChevronRight size={12} className={`${t.muted} shrink-0 mt-1`} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default OutlookMailCard;
