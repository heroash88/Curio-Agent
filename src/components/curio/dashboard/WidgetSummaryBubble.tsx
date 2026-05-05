import React, { useCallback, useEffect, useState, useRef } from 'react';
import { X, Send, Bot, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  extractWidgetTextContent,
  generateWidgetFollowUp,
  generateWidgetSummary,
} from '../../../services/ai/widgetSummaryService';
import type { LLMChatMessage } from '../../../services/ai/llmProvider';

const isSafeLinkUrl = (value: string): boolean =>
  /^(https?:\/\/|mailto:)/i.test(value.trim());

/** Lightweight inline markdown renderer for summary bubble messages. */
const renderSummaryRichText = (text: string): React.ReactNode[] => {
  const tokenRe = /(\[[^\]]+]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|https?:\/\/[^\s<)]+)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `rt-${match.index}`;
    const linkMatch = token.match(/^\[([^\]]+)]\(([^)]+)\)$/);

    if (linkMatch && isSafeLinkUrl(linkMatch[2])) {
      nodes.push(
        <a
          key={key}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[var(--ether-primary)] underline decoration-[var(--ether-primary)]/35 underline-offset-2"
        >
          {linkMatch[1]}
        </a>,
      );
    } else if (token.startsWith('http') && isSafeLinkUrl(token)) {
      nodes.push(
        <a
          key={key}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[var(--ether-primary)] underline decoration-[var(--ether-primary)]/35 underline-offset-2"
        >
          {token}
        </a>,
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code key={key} className="rounded-md bg-[var(--ether-control-bg)] px-1 py-0.5 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
};

interface SummaryBubbleState {
  isOpen: boolean;
  widgetId: string | null;
  widgetType: string | null;
  textContent: string | null;
  summary: string;
  isSummarizing: boolean;
  error: string | null;
  chatHistory: LLMChatMessage[];
}

export const WidgetSummaryBubble: React.FC = () => {
  const [state, setState] = useState<SummaryBubbleState>({
    isOpen: false,
    widgetId: null,
    widgetType: null,
    textContent: null,
    summary: '',
    isSummarizing: false,
    error: null,
    chatHistory: [],
  });

  const [followUpText, setFollowUpText] = useState('');
  const [isFollowingUp, setIsFollowingUp] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleToggle = async (event: Event) => {
      const customEvent = event as CustomEvent<{ widgetId: string; widgetType: string }>;
      const { widgetId, widgetType } = customEvent.detail;

      const textContent = extractWidgetTextContent(widgetId, widgetType);
      if (!textContent) {
        console.warn('Could not extract text for widget', widgetId);
        return;
      }

      setState({
        isOpen: true,
        widgetId,
        widgetType,
        textContent,
        summary: '',
        isSummarizing: true,
        error: null,
        chatHistory: [],
      });
      setFollowUpText('');

      try {
        const result = await generateWidgetSummary({ widgetId, widgetType, textContent });
        setState(s => ({
          ...s,
          isSummarizing: false,
          summary: result,
          chatHistory: [{ role: 'assistant', content: result }],
        }));
      } catch (err) {
        setState(s => ({
          ...s,
          isSummarizing: false,
          error: (err as Error).message || 'Failed to generate summary.',
        }));
      }
    };

    window.addEventListener('curio:toggle-summary', handleToggle);
    return () => window.removeEventListener('curio:toggle-summary', handleToggle);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.chatHistory]);

  const handleClose = useCallback(() => {
    setState(s => ({ ...s, isOpen: false }));
  }, []);

  const handleSendFollowUp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!followUpText.trim() || isFollowingUp || !state.widgetId || !state.textContent) return;

    const userMsg = followUpText.trim();
    setFollowUpText('');
    setIsFollowingUp(true);

    const updatedHistory: LLMChatMessage[] = [
      ...state.chatHistory,
      { role: 'user', content: userMsg }
    ];

    setState(s => ({ ...s, chatHistory: updatedHistory, error: null }));

    try {
      const response = await generateWidgetFollowUp(
        { widgetId: state.widgetId!, widgetType: state.widgetType!, textContent: state.textContent! },
        updatedHistory,
        userMsg
      );

      setState(s => ({
        ...s,
        chatHistory: [...updatedHistory, { role: 'assistant', content: response }]
      }));
    } catch (err) {
      setState(s => ({
        ...s,
        error: (err as Error).message || 'Failed to generate response.',
      }));
    } finally {
      setIsFollowingUp(false);
    }
  };

  return (
    <AnimatePresence>
      {state.isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed bottom-6 right-6 z-[100] flex w-80 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] shadow-2xl backdrop-blur-2xl"
          style={{ maxHeight: '60vh' }}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/50 px-4 py-3">
            <div className="flex items-center gap-2 text-[var(--ether-on-surface)]">
              <Bot size={16} className="text-[var(--ether-primary)]" />
              <span className="text-xs font-bold uppercase tracking-wider">AI Summary</span>
            </div>
            <button
              onClick={handleClose}
              className="rounded-full p-1 text-[var(--ether-on-surface-variant)] transition-colors hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
            >
              <X size={16} />
            </button>
          </div>

          {/* Chat / Content Area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {state.isSummarizing ? (
              <div className="flex items-center gap-3 text-[var(--ether-on-surface-variant)]">
                <Loader2 size={16} className="animate-spin text-[var(--ether-primary)]" />
                <span className="text-sm font-medium">Summarizing...</span>
              </div>
            ) : state.error && state.chatHistory.length === 0 ? (
              <div className="text-sm text-[var(--ether-error)]">{state.error}</div>
            ) : (
              state.chatHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.role === 'user'
                      ? 'bg-[var(--ether-primary)] text-[var(--ether-control-active-text)] rounded-tr-sm'
                      : 'bg-[var(--ether-surface-container)] text-[var(--ether-on-surface)] rounded-tl-sm border border-[var(--ether-glass-border)]'
                  }`}>
                    {msg.role === 'assistant' ? renderSummaryRichText(msg.content) : msg.content}
                  </div>
                </div>
              ))
            )}

            {isFollowingUp && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl bg-[var(--ether-surface-container)] px-4 py-3 text-sm text-[var(--ether-on-surface-variant)] rounded-tl-sm border border-[var(--ether-glass-border)] flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--ether-on-surface-variant)] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--ether-on-surface-variant)] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--ether-on-surface-variant)] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {state.error && state.chatHistory.length > 0 && (
               <div className="text-xs text-[var(--ether-error)] text-center">{state.error}</div>
            )}
          </div>

          {/* Input Area */}
          <div className="shrink-0 border-t border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/30 p-3">
            <form onSubmit={handleSendFollowUp} className="relative flex items-center">
              <input
                type="text"
                value={followUpText}
                onChange={(e) => setFollowUpText(e.target.value)}
                placeholder="Ask a follow-up question..."
                className="w-full rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] py-2.5 pl-4 pr-10 text-sm text-[var(--ether-on-surface)] outline-none placeholder:text-[var(--ether-on-surface-variant)] focus:border-[var(--ether-primary)]/50"
                disabled={state.isSummarizing || isFollowingUp}
              />
              <button
                type="submit"
                disabled={!followUpText.trim() || state.isSummarizing || isFollowingUp}
                className="absolute right-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ether-primary)] text-[var(--ether-control-active-text)] shadow-md shadow-[var(--ether-primary)]/20 transition-transform disabled:opacity-50 hover:scale-105 active:scale-95"
              >
                <Send size={12} className="ml-px" />
              </button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
