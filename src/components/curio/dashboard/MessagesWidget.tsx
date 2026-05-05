import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Hash, Send, MessageSquare, RefreshCcw } from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useDashboardRefresh } from '../../../hooks/useDashboardRefresh';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type { SlackMessage } from '../../../services/cardTypes';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import { useSlackAccessToken } from '../../../utils/settingsStorage';
import WidgetShell from './WidgetShell';
import { WidgetText } from './widgetPrimitives';

const buildMockMessages = (): SlackMessage[] => ([
  { id: 'mock-1', channel: 'studio', user: 'Maya', text: 'Client review moved to 2:30. I left notes in the deck.', timestamp: '2m' },
  { id: 'mock-2', channel: 'studio', user: 'Theo', text: 'Lighting pass is approved. Shipping render queue next.', timestamp: '11m' },
  { id: 'mock-3', channel: 'studio', user: 'Eliza', text: 'Coffee + standup in ten if you want in.', timestamp: '24m' },
]);

const MessagesWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const slackToken = useSlackAccessToken();

  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [channelName, setChannelName] = useState(widget.config.channelName || 'general');
  const [channelId, setChannelId] = useState(widget.config.channelId || '');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);

  const provider = widget.config.messagesProvider || 'slack';
  const layoutMaxItems = size.pixelHeight < 340 ? 2 : size.pixelHeight < 500 ? 3 : size.isTall ? 6 : 4;
  const maxItems = Math.max(1, Math.min(Number(widget.config.maxItems || layoutMaxItems), layoutMaxItems));

  const loadMessages = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setOffline(false);

    try {
      if (provider === 'mock') {
        setMessages(buildMockMessages().slice(0, maxItems));
        setChannelName(widget.config.channelName || 'studio');
        setChannelId('mock');
        return;
      }

      if (provider === 'mcp') {
        const { listMcpMessages } = await import('../../../services/zapierMcpWidgetService');
        const channelQuery = String(
          widget.config.mcpChannelQuery || widget.config.channelName || widget.config.channelId || '',
        ).trim();
        const { messages: next } = await listMcpMessages({
          serverId: widget.config.mcpServerId,
          toolName: widget.config.mcpToolName,
          channelQuery,
          maxItems,
        });
        setMessages(next.map((message) => ({
          id: message.id,
          channel: message.channel,
          user: message.user,
          text: message.text,
          timestamp: message.timestamp,
        } satisfies SlackMessage)));
        setChannelName(channelQuery || widget.config.channelName || 'messages');
        setChannelId(channelQuery || widget.config.channelId || '');
        return;
      }

      const slackApi = await import('../../../services/slackApi');

      if (slackToken) {
        if (widget.config.channelId) {
          const resolvedChannel = await slackApi.resolveChannel(widget.config.channelId);
          const nextMessages = await slackApi.listMessages(resolvedChannel, maxItems, widget.config.channelName);
          setMessages(nextMessages);
          setChannelId(resolvedChannel);
          setChannelName(widget.config.channelName || widget.config.channelId || resolvedChannel);
        } else {
          const recent = await slackApi.getRecentMessages(maxItems);
          setMessages(recent.messages);
          setChannelId(recent.channel.id);
          setChannelName(recent.channel.name);
        }
        return;
      }

      const cachedChannelIds = slackApi.getCachedChannelIds();
      const offlineChannelId = widget.config.channelId || cachedChannelIds[0];
      const cached = offlineChannelId ? slackApi.getOfflineMessages(offlineChannelId) : null;
      if (cached) {
        setMessages(cached.messages.slice(-maxItems));
        setChannelId(offlineChannelId);
        setChannelName(widget.config.channelName || cached.channelName || offlineChannelId);
        setOffline(true);
        return;
      }

      setMessages([]);
      setChannelId('');
      setChannelName(widget.config.channelName || 'general');
    } catch {
      setMessages([]);
      setChannelId('');
    } finally {
      setLoading(false);
    }
  }, [
    maxItems,
    provider,
    slackToken,
    widget.config.channelId,
    widget.config.channelName,
    widget.config.mcpChannelQuery,
    widget.config.mcpServerId,
  ]);

  useEffect(() => {
    setChannelName(widget.config.channelName || 'general');
    setChannelId(widget.config.channelId || '');
  }, [widget.config.channelId, widget.config.channelName]);

  const { refreshNow } = useDashboardRefresh({
    widget,
    onRefresh: (background) => loadMessages(background),
  });

  const canSend = provider === 'slack' && Boolean(slackToken) && Boolean(channelId) && !offline;

  const handleSend = async () => {
    if (!canSend || !draft.trim() || !channelId) return;
    try {
      const { sendMessage } = await import('../../../services/slackApi');
      await sendMessage(channelId, draft.trim());
      setDraft('');
      await loadMessages(false);
    } catch {
      // Keep the draft intact so the user can retry.
    }
  };

  const getInitials = (name: string) => name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  const getAvatarColor = (name: string) => {
    const colors = ['bg-indigo-500/20 text-indigo-400', 'bg-violet-500/20 text-violet-400', 'bg-fuchsia-500/20 text-fuchsia-400', 'bg-sky-500/20 text-sky-400'];
    let hash = 0;
    for (let index = 0; index < name.length; index += 1) {
      hash = name.charCodeAt(index) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const headerLabel = useMemo(() => {
    if (provider === 'mock') return '#demo';
    if (provider === 'mcp') return channelName ? `#${channelName} via MCP` : 'MCP messages';
    if (offline) return `#${channelName} offline`;
    return `#${channelName}`;
  }, [channelName, offline, provider]);

  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare accent="violet" widget={widget}>
        <div className="flex flex-1 items-center justify-center">
          <MessageSquare size={24} className="text-[var(--ether-violet)]" />
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      widget={widget}
      title={widget.type === 'slack' ? 'Slack Channel' : 'Messages'}
      icon={<Hash size={14} />}
      accent="violet"
      rightSlot={
        <div className="flex items-center gap-2">
          <WidgetText variant="label" tone="muted" className="rounded-full bg-[var(--ether-control-bg)] px-2 py-0.5">
            {headerLabel}
          </WidgetText>
          <button
            type="button"
            onClick={() => refreshNow(false)}
            className="dashboard-widget-control-button"
            aria-label="Refresh messages"
          >
            <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      }
    >
      <div className="flex h-full flex-col">
        <div className="dashboard-widget-touch-scroll mb-4 min-h-0 flex-1 space-y-3 pr-1">
          {messages.length === 0 && !loading ? (
            <div className={`flex h-full flex-col items-center justify-center ${theme.onSurfaceVariant}`}>
              <MessageSquare size={32} className="mb-2 opacity-75" />
              <WidgetText variant="label" tone="muted" align="center" className="px-4">
                {provider === 'slack'
                  ? 'Connect Slack or open a cached channel'
                  : provider === 'mcp'
                    ? 'No messages from MCP yet'
                    : 'No messages'}
              </WidgetText>
            </div>
          ) : (
            messages.slice(0, maxItems).map((message) => (
              <div key={message.id} className="flex gap-3 ether-widget-enter">
                <div className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-[10px] font-bold ${getAvatarColor(message.user)}`}>
                  {getInitials(message.user)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-[12px] font-bold ${theme.onSurface}`}>{message.user}</span>
                    <span className="text-[9px] font-medium tabular-nums text-[var(--ether-on-surface-variant)] opacity-70">{message.timestamp}</span>
                  </div>
                  <div className="rounded-2xl rounded-tl-none border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3">
                    <p className={`text-[12px] leading-relaxed ${theme.onSurfaceVariant}`}>{message.text}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-1">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSend();
            }}
            placeholder={
              canSend
                ? `Message #${channelName}`
                : offline
                  ? 'Offline cache is read-only'
                  : provider === 'mcp'
                    ? 'MCP messages are read-only'
                    : 'Connect Slack to reply'
            }
            disabled={!canSend}
            className={`min-w-0 flex-1 bg-transparent px-3 py-2 text-xs outline-none placeholder:text-[var(--ether-on-surface-variant)]/75 ${theme.onSurface} disabled:text-[var(--ether-on-surface-variant)] disabled:opacity-100`}
          />
          <button
            onClick={() => void handleSend()}
            disabled={!canSend || !draft.trim()}
            className="h-10 w-10 flex items-center justify-center rounded-xl bg-[var(--ether-violet)] text-black hover:scale-105 active:scale-95 transition-all disabled:opacity-20 disabled:scale-100"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </WidgetShell>
  );
};

export default MessagesWidget;
