import React, { useState } from 'react';
import { Mail, Reply, Send, User } from 'lucide-react';
import { WidgetBody, WidgetText, WidgetInlineError } from '../widgetPrimitives';
import type { DashboardWidget } from '../../../../services/dashboardTypes';
import { useWidgetPersistentState } from '../../../../hooks/useWidgetPersistentState';

interface MailThreadReaderProps {
  widget: DashboardWidget;
  focused?: boolean;
}

interface ThreadMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: string;
  isMe: boolean;
}

/**
 * MailThreadReader — focused overlay editor for Mail widgets.
 * Renders a full thread reader (all messages in conversation) with
 * an inline reply draft at the bottom.
 * Wired for Mail, Gmail, OutlookMail widget types.
 *
 * Requirements: 13.6
 */
const MailThreadReader: React.FC<MailThreadReaderProps> = ({ widget }) => {
  const [error] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useWidgetPersistentState<string>(
    widget.id, 'reply-draft', '',
  );
  const [showReply, setShowReply] = useState(false);

  // In a real implementation, this would read from the mail service.
  // For now, show a placeholder thread or empty state.
  const [thread] = useWidgetPersistentState<ThreadMessage[]>(
    widget.id, 'active-thread', [],
  );

  if (error) {
    return <WidgetInlineError message={error} widgetId={widget.id} />;
  }

  if (thread.length === 0) {
    return (
      <WidgetBody gap="md">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
          <Mail size={32} className="text-[var(--ether-on-surface-variant)]/30" />
          <WidgetText variant="title">Mail Thread Reader</WidgetText>
          <WidgetText variant="body" tone="muted" align="center">
            Select a message from the compact view to read the full thread here.
            All messages in the conversation will be displayed with an inline reply option.
          </WidgetText>
        </div>
      </WidgetBody>
    );
  }

  return (
    <WidgetBody gap="sm" scroll="y">
      {/* Thread subject */}
      <div className="border-b border-[var(--ether-glass-border)] pb-2">
        <WidgetText variant="title">{thread[0]?.subject || 'Thread'}</WidgetText>
        <WidgetText variant="label" tone="muted">
          {thread.length} message{thread.length !== 1 ? 's' : ''}
        </WidgetText>
      </div>

      {/* Messages */}
      <div className="space-y-3">
        {thread.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-xl border px-3 py-2.5 ${
              msg.isMe
                ? 'border-[var(--ether-primary)]/20 bg-[var(--ether-primary)]/5'
                : 'border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60'
            }`}
          >
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <User size={12} className="text-[var(--ether-on-surface-variant)]" />
                <span className="text-xs font-medium text-[var(--ether-on-surface)]">{msg.from}</span>
              </div>
              <span className="text-[10px] text-[var(--ether-on-surface-variant)]">{msg.date}</span>
            </div>
            <div className="text-xs leading-relaxed text-[var(--ether-on-surface)]/80 whitespace-pre-wrap">
              {msg.body}
            </div>
          </div>
        ))}
      </div>

      {/* Inline reply draft */}
      {showReply ? (
        <div className="rounded-xl border border-[var(--ether-primary)]/30 bg-[var(--ether-surface-container-low)]/60 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Reply size={12} className="text-[var(--ether-primary)]" />
            <WidgetText variant="label">Reply</WidgetText>
          </div>
          <textarea
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
            placeholder="Type your reply..."
            rows={4}
            className="w-full resize-none rounded-lg border border-[var(--ether-glass-border)] bg-transparent px-2.5 py-2 text-xs text-[var(--ether-on-surface)] placeholder:text-[var(--ether-on-surface-variant)]/50 focus:border-[var(--ether-primary)]/40 focus:outline-none"
            autoFocus
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowReply(false)}
              className="rounded-lg px-2.5 py-1 text-[11px] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                // In a real implementation, this would send via the mail service
                setReplyDraft('');
                setShowReply(false);
              }}
              disabled={!replyDraft.trim()}
              className="flex items-center gap-1 rounded-lg bg-[var(--ether-primary)] px-3 py-1 text-[11px] font-medium text-[var(--ether-on-primary)] disabled:opacity-50"
            >
              <Send size={10} />
              Send
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowReply(true)}
          className="flex items-center gap-1.5 rounded-xl border border-dashed border-[var(--ether-glass-border)] px-3 py-2.5 text-xs text-[var(--ether-on-surface-variant)] transition hover:border-[var(--ether-primary)]/40 hover:bg-[var(--ether-control-hover)]"
        >
          <Reply size={12} />
          Reply to thread
        </button>
      )}
    </WidgetBody>
  );
};

export default MailThreadReader;
