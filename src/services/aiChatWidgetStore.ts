export type AiChatWidgetRole = 'user' | 'assistant';

export type AiChatWidgetAttachmentKind = 'image' | 'file';

export interface AiChatWidgetAttachment {
  id: string;
  kind: AiChatWidgetAttachmentKind;
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  textPreview?: string;
}

export interface AiChatWidgetMessage {
  id: string;
  role: AiChatWidgetRole;
  content: string;
  createdAt: number;
  attachments: AiChatWidgetAttachment[];
}

export interface AiChatWidgetConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AiChatWidgetMessage[];
}

const STORAGE_PREFIX = 'curio_ai_chat_widget:';
const CONVERSATIONS_STORAGE_PREFIX = 'curio_ai_chat_widget_conversations:';
const ACTIVE_CONVERSATION_STORAGE_PREFIX = 'curio_ai_chat_widget_active:';
const DEFAULT_HISTORY_LIMIT = 80;
const CONVERSATION_TITLE_LIMIT = 56;
const TITLE_SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'via',
  'vs',
  'with',
]);

export const getAiChatWidgetStorageKey = (widgetId: string): string =>
  `${STORAGE_PREFIX}${widgetId}`;

export const getAiChatWidgetConversationsStorageKey = (widgetId: string): string =>
  `${CONVERSATIONS_STORAGE_PREFIX}${widgetId}`;

const getAiChatWidgetActiveConversationStorageKey = (widgetId: string): string =>
  `${ACTIVE_CONVERSATION_STORAGE_PREFIX}${widgetId}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeAttachment = (value: unknown): AiChatWidgetAttachment | null => {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' && value.id.trim() ? value.id : `att_${Date.now()}`;
  const kind = value.kind === 'image' ? 'image' : 'file';
  const name = typeof value.name === 'string' && value.name.trim() ? value.name : 'Attachment';
  const mimeType = typeof value.mimeType === 'string' ? value.mimeType : '';
  const size = Number.isFinite(value.size) ? Number(value.size) : 0;
  const dataUrl = typeof value.dataUrl === 'string' && value.dataUrl.startsWith('data:')
    ? value.dataUrl
    : undefined;
  const textPreview = typeof value.textPreview === 'string' ? value.textPreview.slice(0, 16000) : undefined;

  return {
    id,
    kind,
    name,
    mimeType,
    size,
    ...(dataUrl ? { dataUrl } : {}),
    ...(textPreview ? { textPreview } : {}),
  };
};

const normalizeMessage = (value: unknown): AiChatWidgetMessage | null => {
  if (!isRecord(value)) return null;
  if (value.role !== 'user' && value.role !== 'assistant') return null;
  const content = typeof value.content === 'string' ? value.content : '';
  const createdAt = Number.isFinite(value.createdAt) ? Number(value.createdAt) : Date.now();
  const id = typeof value.id === 'string' && value.id.trim()
    ? value.id
    : `msg_${createdAt}_${Math.random().toString(36).slice(2, 8)}`;
  const attachments = Array.isArray(value.attachments)
    ? value.attachments.map(normalizeAttachment).filter((item): item is AiChatWidgetAttachment => Boolean(item))
    : [];

  return {
    id,
    role: value.role,
    content,
    createdAt,
    attachments,
  };
};

const normalizeTitleText = (content: string): string =>
  content
    .replace(/!\[([^\]]*)]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*]\s+(?:\[[ xX]\]\s*)?/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getAttachmentTitleSource = (messages: AiChatWidgetMessage[]): string =>
  messages
    .flatMap((message) => message.attachments.map((attachment) => attachment.name.trim()))
    .filter(Boolean)
    .join(', ');

const removeRequestLeadIn = (value: string): string => {
  let next = value.trim();
  const patterns = [
    /^(?:please\s+)?(?:can|could|would|will)\s+you\s+/i,
    /^(?:please\s+)?(?:help\s+me|help|i\s+need|i\s+want|i\s+would\s+like|i'd\s+like|i\s+am\s+looking\s+to|i'm\s+looking\s+to|we\s+need|we\s+want)\s+(?:to\s+)?/i,
    /^(?:please\s+)?(?:create|make|build|generate|write|draft|show|give\s+me|tell\s+me|explain|summarize|find|search|open|review|analyze)\s+(?:me\s+)?(?:a|an|the)?\s*/i,
    /^i\s+understand\s+(?:you'd|you\s+would)\s+like(?:\s+me)?(?:\s+to)?\s+/i,
    /^here\s+(?:is|are)\s+(?:a|an|the)?\s*/i,
  ];

  let changed = true;
  while (changed) {
    const previous = next;
    patterns.forEach((pattern) => {
      next = next.replace(pattern, '').trim();
    });
    changed = previous !== next;
  }

  return next || value.trim();
};

const titleCaseToken = (token: string, index: number): string => {
  const match = token.match(/^([("'[]*)(.+?)([)"'\].,!?;:]*)$/);
  if (!match) return token;
  const [, prefix, core, suffix] = match;
  const lower = core.toLowerCase();
  if (index > 0 && TITLE_SMALL_WORDS.has(lower)) return `${prefix}${lower}${suffix}`;
  if (/[a-z][A-Z]/.test(core) || /[0-9]/.test(core) || /^[A-Z]{2,}$/.test(core)) {
    return `${prefix}${core}${suffix}`;
  }
  return `${prefix}${lower.charAt(0).toUpperCase()}${lower.slice(1)}${suffix}`;
};

const titleCase = (value: string): string =>
  value
    .split(/\s+/)
    .map(titleCaseToken)
    .join(' ')
    .trim();

const truncateConversationTitle = (value: string): string => {
  if (value.length <= CONVERSATION_TITLE_LIMIT) return value;
  const slice = value.slice(0, CONVERSATION_TITLE_LIMIT - 3).trimEnd();
  const lastSpace = slice.lastIndexOf(' ');
  const shortened = lastSpace > 28 ? slice.slice(0, lastSpace) : slice;
  return `${shortened.trimEnd()}...`;
};

const deriveLegacyConversationTitle = (messages: AiChatWidgetMessage[], fallback = 'New chat'): string => {
  const firstUserMessage = messages.find((message) => message.role === 'user' && message.content.trim());
  const source = firstUserMessage?.content.trim() || messages[0]?.content.trim() || fallback;
  const singleLine = source.replace(/\s+/g, ' ').trim();
  return singleLine.length > 44 ? `${singleLine.slice(0, 41)}...` : singleLine || fallback;
};

const deriveConversationTitle = (messages: AiChatWidgetMessage[], fallback = 'New chat'): string => {
  const firstUserMessage = messages.find((message) => message.role === 'user' && message.content.trim());
  const firstTextMessage = messages.find((message) => message.content.trim());
  const attachmentSource = getAttachmentTitleSource(messages);
  const source = firstUserMessage?.content.trim()
    || firstTextMessage?.content.trim()
    || attachmentSource
    || fallback;
  const normalized = normalizeTitleText(source);
  const firstSentence = normalized.match(/^(.+?[.!?])(?:\s|$)/)?.[1] || normalized;
  const cleaned = removeRequestLeadIn(firstSentence)
    .replace(/\bthe\s+(top|best|main|primary|current|latest)\b/gi, '$1')
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const titled = titleCase(cleaned || normalized || fallback);
  return truncateConversationTitle(titled || fallback);
};

const normalizeConversation = (value: unknown): AiChatWidgetConversation | null => {
  if (!isRecord(value)) return null;
  const messages = Array.isArray(value.messages)
    ? value.messages.map(normalizeMessage).filter((item): item is AiChatWidgetMessage => Boolean(item))
    : [];
  const createdAt = Number.isFinite(value.createdAt)
    ? Number(value.createdAt)
    : messages[0]?.createdAt ?? Date.now();
  const updatedAt = Number.isFinite(value.updatedAt)
    ? Number(value.updatedAt)
    : messages[messages.length - 1]?.createdAt ?? createdAt;
  const id = typeof value.id === 'string' && value.id.trim()
    ? value.id
    : `conversation_${createdAt}_${Math.random().toString(36).slice(2, 8)}`;
  const savedTitle = typeof value.title === 'string' ? value.title.trim() : '';
  const title = messages.length > 0 && (!savedTitle || savedTitle === 'New chat' || savedTitle === deriveLegacyConversationTitle(messages))
    ? deriveConversationTitle(messages)
    : savedTitle || deriveConversationTitle(messages);

  return {
    id,
    title,
    createdAt,
    updatedAt,
    messages,
  };
};

const sortConversations = (conversations: AiChatWidgetConversation[]): AiChatWidgetConversation[] =>
  [...conversations].sort((left, right) => right.updatedAt - left.updatedAt);

const shouldRefreshConversationTitle = (conversation: AiChatWidgetConversation): boolean => {
  const currentTitle = conversation.title.trim();
  if (!currentTitle || currentTitle === 'New chat') return true;
  return currentTitle === deriveConversationTitle(conversation.messages)
    || currentTitle === deriveLegacyConversationTitle(conversation.messages);
};

const trimHistory = (
  messages: AiChatWidgetMessage[],
  limit = DEFAULT_HISTORY_LIMIT,
): AiChatWidgetMessage[] => {
  const safeLimit = Math.max(1, Math.min(Number.isFinite(limit) ? Math.round(limit) : DEFAULT_HISTORY_LIMIT, 200));
  return messages.slice(-safeLimit);
};

const getLegacyAiChatWidgetHistory = (widgetId: string): AiChatWidgetMessage[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(getAiChatWidgetStorageKey(widgetId)) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeMessage).filter((item): item is AiChatWidgetMessage => Boolean(item));
  } catch {
    return [];
  }
};

const readAiChatWidgetConversations = (widgetId: string): AiChatWidgetConversation[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(getAiChatWidgetConversationsStorageKey(widgetId)) || '[]');
    if (!Array.isArray(parsed)) return [];
    return sortConversations(
      parsed.map(normalizeConversation).filter((item): item is AiChatWidgetConversation => Boolean(item)),
    );
  } catch {
    return [];
  }
};

const writeAiChatWidgetConversations = (
  widgetId: string,
  conversations: AiChatWidgetConversation[],
): AiChatWidgetConversation[] => {
  const normalized = sortConversations(
    conversations.map(normalizeConversation).filter((item): item is AiChatWidgetConversation => Boolean(item)),
  );
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(getAiChatWidgetConversationsStorageKey(widgetId), JSON.stringify(normalized));
  }
  return normalized;
};

const dispatchAiChatWidgetHistoryChanged = (widgetId: string) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('curio:ai-chat-history-changed', { detail: { widgetId } }));
  }
};

const setLegacyAiChatWidgetHistory = (widgetId: string, messages: AiChatWidgetMessage[]) => {
  if (typeof localStorage === 'undefined') return;
  if (messages.length === 0) {
    localStorage.removeItem(getAiChatWidgetStorageKey(widgetId));
    return;
  }
  localStorage.setItem(getAiChatWidgetStorageKey(widgetId), JSON.stringify(messages));
};

const migrateLegacyHistory = (widgetId: string): AiChatWidgetConversation[] => {
  const existing = readAiChatWidgetConversations(widgetId);
  if (existing.length > 0) return existing;
  const legacyMessages = getLegacyAiChatWidgetHistory(widgetId);
  if (legacyMessages.length === 0) return [];
  const createdAt = legacyMessages[0]?.createdAt ?? Date.now();
  const updatedAt = legacyMessages[legacyMessages.length - 1]?.createdAt ?? createdAt;
  const conversation: AiChatWidgetConversation = {
    id: `conversation_${createdAt}_${Math.random().toString(36).slice(2, 8)}`,
    title: deriveConversationTitle(legacyMessages, 'Current chat'),
    createdAt,
    updatedAt,
    messages: legacyMessages,
  };
  writeAiChatWidgetConversations(widgetId, [conversation]);
  localStorage.setItem(getAiChatWidgetActiveConversationStorageKey(widgetId), conversation.id);
  return [conversation];
};

export const getAiChatWidgetConversations = (widgetId: string): AiChatWidgetConversation[] =>
  migrateLegacyHistory(widgetId);

export const getAiChatWidgetActiveConversationId = (widgetId: string): string | null => {
  if (typeof localStorage === 'undefined') return null;
  const conversations = getAiChatWidgetConversations(widgetId);
  if (conversations.length === 0) return null;
  const saved = localStorage.getItem(getAiChatWidgetActiveConversationStorageKey(widgetId));
  if (saved && conversations.some((conversation) => conversation.id === saved)) {
    return saved;
  }
  return conversations[0].id;
};

export const setAiChatWidgetActiveConversationId = (
  widgetId: string,
  conversationId: string,
): AiChatWidgetConversation | null => {
  const conversations = getAiChatWidgetConversations(widgetId);
  const selected = conversations.find((conversation) => conversation.id === conversationId) || null;
  if (!selected || typeof localStorage === 'undefined') return null;
  localStorage.setItem(getAiChatWidgetActiveConversationStorageKey(widgetId), selected.id);
  setLegacyAiChatWidgetHistory(widgetId, selected.messages);
  dispatchAiChatWidgetHistoryChanged(widgetId);
  return selected;
};

export const createAiChatWidgetConversation = (
  widgetId: string,
  options: {
    title?: string;
    messages?: AiChatWidgetMessage[];
    now?: number;
  } = {},
): AiChatWidgetConversation => {
  const now = Number.isFinite(options.now) ? Number(options.now) : Date.now();
  const messages = options.messages || [];
  const conversation: AiChatWidgetConversation = {
    id: `conversation_${now}_${Math.random().toString(36).slice(2, 8)}`,
    title: options.title?.trim() || deriveConversationTitle(messages),
    createdAt: now,
    updatedAt: messages[messages.length - 1]?.createdAt ?? now,
    messages,
  };
  const conversations = writeAiChatWidgetConversations(widgetId, [
    ...readAiChatWidgetConversations(widgetId),
    conversation,
  ]);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(getAiChatWidgetActiveConversationStorageKey(widgetId), conversation.id);
  }
  setLegacyAiChatWidgetHistory(widgetId, conversation.messages);
  dispatchAiChatWidgetHistoryChanged(widgetId);
  return conversations.find((item) => item.id === conversation.id) || conversation;
};

export const getAiChatWidgetHistory = (widgetId: string): AiChatWidgetMessage[] => {
  const conversations = getAiChatWidgetConversations(widgetId);
  const activeId = getAiChatWidgetActiveConversationId(widgetId);
  const activeConversation = conversations.find((conversation) => conversation.id === activeId);
  return activeConversation?.messages || getLegacyAiChatWidgetHistory(widgetId);
};

export const saveAiChatWidgetHistory = (
  widgetId: string,
  messages: AiChatWidgetMessage[],
  limit = DEFAULT_HISTORY_LIMIT,
): AiChatWidgetMessage[] => {
  const normalized = trimHistory(messages.map(normalizeMessage).filter((item): item is AiChatWidgetMessage => Boolean(item)), limit);
  if (typeof localStorage !== 'undefined') {
    let conversations = getAiChatWidgetConversations(widgetId);
    let activeId = getAiChatWidgetActiveConversationId(widgetId);

    if (!activeId || conversations.length === 0) {
      const conversation = createAiChatWidgetConversation(widgetId, {
        messages: normalized,
        now: normalized[0]?.createdAt ?? Date.now(),
      });
      activeId = conversation.id;
      conversations = readAiChatWidgetConversations(widgetId);
    }

    const updatedAt = normalized[normalized.length - 1]?.createdAt ?? Date.now();
    const nextConversations = conversations.map((conversation) => (
      conversation.id === activeId
        ? {
            ...conversation,
            title: shouldRefreshConversationTitle(conversation)
              ? deriveConversationTitle(normalized)
              : conversation.title.trim(),
            updatedAt,
            messages: normalized,
          }
        : conversation
    ));
    writeAiChatWidgetConversations(widgetId, nextConversations);
    setLegacyAiChatWidgetHistory(widgetId, normalized);
    dispatchAiChatWidgetHistoryChanged(widgetId);
  }
  return normalized;
};

export const appendAiChatWidgetMessages = (
  widgetId: string,
  messages: AiChatWidgetMessage[],
  limit = DEFAULT_HISTORY_LIMIT,
): AiChatWidgetMessage[] =>
  saveAiChatWidgetHistory(widgetId, [...getAiChatWidgetHistory(widgetId), ...messages], limit);

export const deleteAiChatWidgetMessage = (
  widgetId: string,
  messageId: string,
): AiChatWidgetMessage[] => {
  const next = getAiChatWidgetHistory(widgetId).filter((message) => message.id !== messageId);
  return saveAiChatWidgetHistory(widgetId, next);
};

export const clearAiChatWidgetHistory = (widgetId: string): void => {
  if (typeof localStorage === 'undefined') return;
  const conversations = getAiChatWidgetConversations(widgetId);
  const activeId = getAiChatWidgetActiveConversationId(widgetId);
  if (!activeId || conversations.length === 0) {
    localStorage.removeItem(getAiChatWidgetStorageKey(widgetId));
    dispatchAiChatWidgetHistoryChanged(widgetId);
    return;
  }
  writeAiChatWidgetConversations(
    widgetId,
    conversations.map((conversation) => (
      conversation.id === activeId
        ? { ...conversation, title: 'New chat', updatedAt: Date.now(), messages: [] }
        : conversation
    )),
  );
  localStorage.removeItem(getAiChatWidgetStorageKey(widgetId));
  dispatchAiChatWidgetHistoryChanged(widgetId);
};

export const deleteAiChatWidgetConversation = (
  widgetId: string,
  conversationId: string,
): AiChatWidgetConversation[] => {
  if (typeof localStorage === 'undefined') return [];
  const next = writeAiChatWidgetConversations(
    widgetId,
    getAiChatWidgetConversations(widgetId).filter((conversation) => conversation.id !== conversationId),
  );
  const activeId = localStorage.getItem(getAiChatWidgetActiveConversationStorageKey(widgetId));
  if (activeId === conversationId) {
    const fallback = next[0] || null;
    if (fallback) {
      localStorage.setItem(getAiChatWidgetActiveConversationStorageKey(widgetId), fallback.id);
      setLegacyAiChatWidgetHistory(widgetId, fallback.messages);
    } else {
      localStorage.removeItem(getAiChatWidgetActiveConversationStorageKey(widgetId));
      localStorage.removeItem(getAiChatWidgetStorageKey(widgetId));
    }
  }
  dispatchAiChatWidgetHistoryChanged(widgetId);
  return next;
};
