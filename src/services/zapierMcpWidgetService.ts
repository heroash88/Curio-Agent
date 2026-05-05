import type { FunctionDeclaration } from '@google/genai';

import {
  getEnabledGenericMcpServers,
  type GenericMcpServerConfig,
} from '../utils/settingsStorage';
import { prepareGenericMcpTools, type PreparedGenericMcpTools } from './genericMcpService';
import {
  detectMcpProfile,
  profileSupportsDomain,
  profileToolName,
  type McpProfileAction,
  type McpProfileDomain,
} from './mcpProfiles';

export type ZapierWidgetKind = 'mail' | 'calendar' | 'tasks' | 'notes' | 'messages';

export interface ZapierMailMessage {
  id: string;
  threadId: string;
  conversationId: string;
  from: string;
  fromName?: string;
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
  labels?: string[];
  body?: string;
  htmlBody?: string;
}

export interface ZapierMailThread {
  subject: string;
  messages: Array<{
    from: string;
    body: string;
    htmlBody?: string;
    date: string;
  }>;
}

export interface ZapierCalendarEvent {
  id?: string;
  title: string;
  startTime: string;
  endTime?: string;
  startDateTime?: string;
  endDateTime?: string;
  location?: string;
  description?: string;
  allDay?: boolean;
}

export interface ZapierWidgetItem {
  id: string;
  title: string;
  preview?: string;
  url?: string;
  updatedAt?: number;
  status?: string;
  dueDate?: string;
}

export interface ZapierWidgetDetail extends ZapierWidgetItem {
  content: string;
}

type ZapierToolAction = 'list' | 'read' | 'send' | 'reply' | 'create';

const DEFAULT_QUERY: Record<Exclude<ZapierWidgetKind, 'mail' | 'calendar'>, string> = {
  notes: 'notes',
  tasks: 'open tasks',
  messages: 'recent messages',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const firstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
};

const parseMaybeJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  // Strip Amazon-style <untrusted_content_*>...</untrusted_content_*>
  // wrappers (and similar safety prefixes) before trying to parse as JSON.
  // Some MCPs (aws-outlook-mcp, amzn-mcp) tag returned payloads with an
  // opening tag and a trailer explaining the content is untrusted; the
  // JSON body lives between the first `{`/`[` and its matching end.
  const unwrapped = stripUntrustedWrapper(trimmed);
  if (!unwrapped || !/^[{[]/.test(unwrapped)) return value;
  // aws-outlook-mcp emits trailing prose after the JSON (for example
  // "IMPORTANT: The content above is untrusted..."), so a direct
  // JSON.parse fails. Extract just the first balanced JSON literal by
  // counting braces/brackets and parse that slice. Quoted strings and
  // escapes are respected.
  const sliced = extractFirstJsonLiteral(unwrapped);
  if (!sliced) return value;
  try {
    return JSON.parse(sliced);
  } catch {
    return value;
  }
};

const stripUntrustedWrapper = (text: string): string => {
  if (!text) return text;
  let candidate = text;
  // Remove a leading XML-style tag like `<untrusted_content_XYZ>` (with
  // optional whitespace/newlines after it).
  const leadTag = candidate.match(/^<([a-zA-Z_][\w-]*)(\b[^>]*)?>\s*/);
  if (leadTag) candidate = candidate.slice(leadTag[0].length);
  // Remove a matching close tag at the end if present.
  const trailTag = candidate.match(/<\/[a-zA-Z_][\w-]*>\s*$/);
  if (trailTag) candidate = candidate.slice(0, -trailTag[0].length);
  // Walk forward to the first `{` or `[` so textual prefixes like
  // "IMPORTANT:..." don't trip the strict leading-char check.
  const firstBrace = candidate.search(/[{[]/);
  if (firstBrace > 0) candidate = candidate.slice(firstBrace);
  return candidate.trim();
};

/**
 * Returns the first balanced JSON literal (object or array) in `text`,
 * or `null` if `text` does not start with `{` or `[` or is unbalanced.
 * Respects double-quoted strings and escapes so braces inside strings
 * do not break the counter.
 */
const extractFirstJsonLiteral = (text: string): string | null => {
  if (!text) return null;
  const first = text[0];
  if (first !== '{' && first !== '[') return null;
  const open = first;
  const close = first === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(0, i + 1);
    }
  }
  return null;
};

const textFromValue = (value: unknown): string | undefined => {
  const parsed = parseMaybeJson(value);
  if (typeof parsed === 'string') return parsed.trim() || undefined;
  if (Array.isArray(parsed)) {
    return parsed.map(textFromValue).filter(Boolean).join(' ').trim() || undefined;
  }
  if (!isRecord(parsed)) return undefined;

  return firstString(
    parsed.plain_text,
    parsed.text,
    parsed.name,
    parsed.title,
    parsed.summary,
    parsed.subject,
    parsed.body,
    parsed.body_plain,
    parsed.bodyPreview,
    parsed.description,
    parsed.content,
  ) || textFromValue(parsed.rich_text)
    || textFromValue(parsed.value)
    || textFromValue((parsed.text as Record<string, unknown> | undefined)?.content);
};

const collectEntries = (value: unknown, depth = 0): unknown[] => {
  if (depth > 8 || value == null) return [];
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed.flatMap((entry) => collectEntries(entry, depth + 1));
  if (!isRecord(parsed)) return [];

  if (
    Object.prototype.hasOwnProperty.call(parsed, 'type') &&
    typeof parsed.text === 'string' &&
    Object.keys(parsed).length <= 4
  ) {
    return collectEntries(parsed.text, depth + 1);
  }
  if (
    typeof parsed.text === 'string' &&
    /^[{[]/.test(parsed.text.trim()) &&
    Object.keys(parsed).length <= 4
  ) {
    return collectEntries(parsed.text, depth + 1);
  }

  const arrayKeys = [
    'results',
    'items',
    'rows',
    'records',
    'data',
    'emails',
    'messages',
    'events',
    'tasks',
    'todos',
    'documents',
    'docs',
    'notes',
    'pages',
    'entries',
    'value', // Microsoft Graph style
    'lists', // aws-outlook-mcp todo_lists: { content: { lists: [...] } }
    'folders',
    'checklistItems',
    'channels',
  ];
  for (const key of arrayKeys) {
    if (Array.isArray(parsed[key])) return collectEntries(parsed[key], depth + 1);
  }

  // Some MCPs wrap results in { success, content: { emails: [...] } }
  // or { success, result: { ... } }. Recurse into those before giving up.
  if (isRecord(parsed.content)) {
    const fromNested = collectEntries(parsed.content, depth + 1);
    if (fromNested.length > 0) return fromNested;
  }
  if (isRecord(parsed.result)) {
    const fromResult = collectEntries(parsed.result, depth + 1);
    if (fromResult.length > 0) return fromResult;
  }
  if (isRecord(parsed.data)) {
    const fromData = collectEntries(parsed.data, depth + 1);
    if (fromData.length > 0) return fromData;
  }

  if (Array.isArray(parsed.content)) {
    const fromContent = parsed.content.flatMap((entry) => collectEntries(entry, depth + 1));
    if (fromContent.length > 0) return fromContent;
  }

  if (
    firstString(
      parsed.id,
      parsed.message_id,
      parsed.event_id,
      parsed.task_id,
      parsed.conversationId,
      parsed.conversation_id,
      parsed.url,
      parsed.title,
      parsed.name,
      parsed.subject,
      parsed.topic,
      parsed.summary,
    )
  ) {
    return [parsed];
  }

  return [];
};

const collectTextFragments = (
  value: unknown,
  fragments: string[] = [],
  depth = 0,
): string[] => {
  if (depth > 10 || value == null) return fragments;
  const parsed = parseMaybeJson(value);
  if (typeof parsed === 'string') {
    const text = parsed.trim();
    if (text) fragments.push(text);
    return fragments;
  }
  if (Array.isArray(parsed)) {
    parsed.forEach((entry) => collectTextFragments(entry, fragments, depth + 1));
    return fragments;
  }
  if (!isRecord(parsed)) return fragments;

  const text = firstString(
    parsed.plain_text,
    parsed.markdown,
    parsed.body_plain,
    parsed.body,
    parsed.text,
    parsed.summary,
    parsed.description,
    parsed.content,
    parsed.notes,
  );
  if (text) fragments.push(text);

  [
    parsed.rich_text,
    parsed.html,
    parsed.body_html,
    parsed.children,
    parsed.blocks,
    parsed.results,
    parsed.items,
    parsed.messages,
    parsed.documents,
    parsed.notes,
    parsed.properties,
  ].forEach((entry) => collectTextFragments(entry, fragments, depth + 1));

  return fragments;
};

const toDateString = (value: unknown): string | undefined => {
  if (isRecord(value)) {
    return firstString(value.dateTime, value.date_time, value.date, value.start, value.end);
  }
  return firstString(value);
};

const normalizeUrl = (value: unknown): string | undefined => {
  const raw = firstString(value);
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch {
    return undefined;
  }
  return undefined;
};

const shortDateLabel = (value: string | undefined): string => {
  if (!value) return '';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const stripHtml = (value: string): string =>
  value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();

const toolHaystack = (tool: FunctionDeclaration): string =>
  `${tool.name || ''} ${tool.description || ''}`.toLowerCase();

const hasAny = (value: string, terms: string[]) =>
  terms.some((term) => value.includes(term));

const toolSchemaProperties = (tool: FunctionDeclaration): Record<string, unknown> => {
  const parameters = tool.parameters as { properties?: Record<string, unknown> } | undefined;
  return isRecord(parameters?.properties) ? parameters.properties : {};
};

const findTool = (
  prepared: PreparedGenericMcpTools,
  kind: ZapierWidgetKind,
  action: ZapierToolAction,
): FunctionDeclaration | null => {
  const domainTerms: Record<ZapierWidgetKind, string[]> = {
    mail: ['mail', 'email', 'gmail', 'outlook'],
    calendar: ['calendar', 'event', 'schedule', 'meeting'],
    tasks: ['task', 'todo', 'to do', 'project', 'asana', 'todoist', 'trello', 'linear'],
    notes: ['note', 'document', 'doc', 'notion', 'page', 'memo'],
    messages: ['slack', 'message', 'channel', 'chat', 'dm', 'direct_message', 'teams'],
  };
  const actionTerms: Record<ZapierToolAction, string[]> = {
    list: ['list', 'find', 'search', 'get', 'read', 'inbox', 'upcoming', 'recent', 'history'],
    read: ['read', 'get', 'fetch', 'find', 'search', 'detail', 'history'],
    send: ['send', 'post', 'create draft', 'email', 'message'],
    reply: ['reply', 'respond', 'send'],
    create: ['create', 'add', 'schedule', 'new', 'post'],
  };
  const blockedByAction: Record<ZapierToolAction, string[]> = {
    list: ['send', 'create', 'add', 'delete', 'remove', 'update', 'reply'],
    read: ['send', 'create', 'add', 'delete', 'remove', 'update', 'reply'],
    send: ['search', 'find', 'list', 'read', 'delete', 'remove'],
    reply: ['search', 'find', 'list', 'read', 'delete', 'remove'],
    create: ['search', 'find', 'list', 'read', 'delete', 'remove'],
  };

  let best: { tool: FunctionDeclaration; score: number } | null = null;
  for (const tool of prepared.tools) {
    const haystack = toolHaystack(tool);
    if (!hasAny(haystack, domainTerms[kind])) continue;
    // Only the tool *name* disqualifies a tool for an action. Descriptions
    // on multiplexed tools (aws-outlook-mcp `todo_tasks`: "Create, read,
    // update, delete, and complete tasks") enumerate every CRUD verb and
    // would otherwise block the tool for every action.
    const nameLower = (tool.name || '').toLowerCase();
    if (hasAny(nameLower, blockedByAction[action])) continue;

    let score = 1;
    if (hasAny(haystack, actionTerms[action])) score += 3;
    if (nameLower && hasAny(nameLower, domainTerms[kind])) score += 2;
    if (nameLower && hasAny(nameLower, actionTerms[action])) score += 2;
    if (/zapier/i.test(haystack)) score += 1;
    // Multiplexed tools (e.g. `todo_tasks`) score a small bump when their
    // schema exposes an `operation` enum — they can service any action.
    const props = toolSchemaProperties(tool);
    if (isRecord(props.operation) && Array.isArray((props.operation as JsonRecord).enum)) {
      score += 1;
    }

    if (!best || score > best.score) best = { tool, score };
  }

  return best?.tool || null;
};

const requireZapierTool = (
  prepared: PreparedGenericMcpTools,
  kind: ZapierWidgetKind,
  action: ZapierToolAction,
): FunctionDeclaration => {
  const tool = findTool(prepared, kind, action);
  if (tool) return tool;
  const kindLabel = kind === 'mail' ? 'email' : kind;
  throw new Error(`No Zapier ${kindLabel} ${action} action is exposed. Add that action in Zapier MCP, then refresh Curio.`);
};

const getCandidateValue = (key: string, candidates: Record<string, unknown>): unknown => {
  if (Object.prototype.hasOwnProperty.call(candidates, key)) return candidates[key];
  const normalized = key.toLowerCase();
  if (/^(q|query|search|search_query|instructions|input)$/.test(normalized)) {
    return candidates.query || candidates.instructions;
  }
  if (/^(limit|max|max_results|maxresults|page_size|count|top)$/.test(normalized)) {
    return candidates.limit;
  }
  if (/^(start|start_time|starttime|start_date|startdatetime|start_date_time)$/.test(normalized)) {
    return candidates.start_time || candidates.startDateTime;
  }
  if (/^(end|end_time|endtime|end_date|enddatetime|end_date_time)$/.test(normalized)) {
    return candidates.end_time || candidates.endDateTime;
  }
  if (/^(to|recipient|email|email_address)$/.test(normalized)) return candidates.to;
  if (/^(subject|title|summary|name|displayname)$/.test(normalized)) {
    return candidates.subject || candidates.title || candidates.displayName;
  }
  if (/^(body|message|content|description|notes)$/.test(normalized)) {
    return candidates.body || candidates.description;
  }
  if (/^(location|where)$/.test(normalized)) return candidates.location;
  if (/^(id|message_id|thread_id|conversation_id|event_id|task_id|list_id|listid|item_id|itemid)$/.test(normalized)) {
    return candidates.id
      || candidates.message_id
      || candidates.thread_id
      || candidates.event_id
      || candidates.listId
      || candidates.taskId
      || candidates.itemId;
  }
  if (normalized === 'operation') return candidates.operation;
  return undefined;
};

const buildToolArgs = (
  tool: FunctionDeclaration,
  candidates: Record<string, unknown>,
  action?: ZapierToolAction,
): Record<string, unknown> => {
  const props = toolSchemaProperties(tool);
  const keys = Object.keys(props);
  if (keys.length === 0) {
    return Object.fromEntries(
      Object.entries(candidates).filter(([, value]) => value != null && value !== ''),
    );
  }

  // Auto-populate an `operation` arg for multiplexed tools
  // (e.g. aws-outlook-mcp `todo_tasks` takes operation: list|get|create…)
  // when the caller didn't pass one explicitly.
  const operationSchema = isRecord(props.operation) ? (props.operation as JsonRecord) : null;
  const operationEnum = operationSchema && Array.isArray(operationSchema.enum)
    ? (operationSchema.enum as unknown[]).map(String)
    : null;
  if (operationEnum && candidates.operation == null && action) {
    const preference: Record<ZapierToolAction, string[]> = {
      list: ['list', 'search', 'find'],
      read: ['get', 'read', 'fetch'],
      send: ['send', 'create', 'post'],
      reply: ['reply', 'respond', 'send'],
      create: ['create', 'add'],
    };
    const match = preference[action].find((op) => operationEnum.includes(op));
    if (match) candidates = { ...candidates, operation: match };
  }

  const args: Record<string, unknown> = {};
  keys.forEach((key) => {
    const value = getCandidateValue(key, candidates);
    if (value == null || value === '') return;
    const coerced = coerceArgValue(value, isRecord(props[key]) ? props[key] as JsonRecord : {});
    if (coerced == null || coerced === '') return;
    args[key] = coerced;
  });
  return args;
};

type JsonRecord = Record<string, unknown>;

const coerceArgValue = (value: unknown, schema: JsonRecord): unknown => {
  const schemaType = typeof schema.type === 'string' ? (schema.type as string) : '';
  // Wrap plain-text bodies in a minimal HTML envelope when the tool
  // description asks for HTML (aws-outlook-mcp `email_send` / `email_reply`
  // say "Email body content in HTML, starting with <html>").
  const description = typeof schema.description === 'string' ? schema.description.toLowerCase() : '';
  if (schemaType === 'string' && /html/.test(description) && typeof value === 'string' && !/^<(html|!doctype|body)/i.test(value.trim())) {
    const escaped = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\r?\n/g, '<br/>');
    return `<html><body>${escaped}</body></html>`;
  }
  if (schemaType === 'array' && !Array.isArray(value)) {
    // `to: "a@x.com,b@x.com"` → ["a@x.com", "b@x.com"]; `to: "alice@x.com"` → ["alice@x.com"].
    if (typeof value === 'string') {
      const parts = value.split(/[;,\s]+/).map((part) => part.trim()).filter(Boolean);
      return parts.length > 0 ? parts : undefined;
    }
    return [value];
  }
  if (schemaType === 'number' && typeof value === 'string') {
    const num = Number(value);
    return Number.isFinite(num) ? num : value;
  }
  if (schemaType === 'boolean' && typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return value;
};

export const findEnabledZapierMcpServer = (
  servers = getEnabledGenericMcpServers(),
): GenericMcpServerConfig | null =>
  servers.find((server) => {
    if (!server.enabled) return false;
    if (server.id === 'zapier-actions') return true;
    if (/zapier/i.test(server.name || '')) return true;
    try {
      return new URL(server.url).hostname.toLowerCase().includes('zapier.com');
    } catch {
      return false;
    }
  }) || null;

/**
 * Locate a generic MCP server by id, or fall back to the first enabled
 * general-kind MCP server. Used by widgets configured with the `"mcp"`
 * provider to pick which server drives Mail/Calendar/Tasks/Notes/Messages
 * when the user has multiple connected.
 */
export const findEnabledMcpServerForWidget = (
  preferredServerId?: string,
  servers = getEnabledGenericMcpServers(),
  domain?: McpProfileDomain,
): GenericMcpServerConfig | null => {
  if (preferredServerId) {
    const match = servers.find((server) => server.id === preferredServerId && server.enabled);
    if (match) return match;
  }
  const general = servers.filter((server) => server.enabled && server.kind !== 'search');
  if (domain) {
    // When a domain is hinted, prefer a server whose profile explicitly
    // claims support for that domain (e.g. pick the Outlook profile
    // server for Mail even if another general MCP is also enabled).
    const domainMatch = general.find((server) => {
      const profile = detectMcpProfile(server);
      return profile ? profileSupportsDomain(profile, domain) : false;
    });
    if (domainMatch) return domainMatch;
  }
  return general[0] || null;
};

const prepareZapier = async (): Promise<PreparedGenericMcpTools> => {
  const server = findEnabledZapierMcpServer();
  if (!server) {
    throw new Error('Connect and enable the Zapier MCP server in Accounts & Keys.');
  }
  const prepared = await prepareGenericMcpTools([server]);
  if (prepared.tools.length === 0) {
    throw new Error('Zapier MCP is connected, but no Zapier actions are exposed yet.');
  }
  return prepared;
};

/**
 * Prepare tools for an arbitrary enabled MCP server so widgets can call
 * mail/calendar/tasks/notes/messages actions through it. When
 * `preferredServerId` is empty the first enabled general-kind MCP server
 * is used. Passing `domain` prefers a server whose recognized profile
 * supports that domain (e.g. Outlook for `'mail'`) when multiple general
 * servers are enabled.
 */
const prepareMcpForWidget = async (
  preferredServerId?: string,
  domain?: McpProfileDomain,
): Promise<{ server: GenericMcpServerConfig; prepared: PreparedGenericMcpTools }> => {
  const server = findEnabledMcpServerForWidget(preferredServerId, undefined, domain);
  if (!server) {
    throw new Error('Connect and enable an MCP server in Accounts & Keys to use the MCP provider.');
  }
  const prepared = await prepareGenericMcpTools([server]);
  if (prepared.tools.length === 0) {
    throw new Error(`"${server.name}" is connected, but no tools are exposed yet.`);
  }
  return { server, prepared };
};

const callZapier = async (
  prepared: PreparedGenericMcpTools,
  tool: FunctionDeclaration,
  candidates: Record<string, unknown>,
  action?: ZapierToolAction,
): Promise<unknown> => {
  const name = tool.name;
  if (!name) throw new Error('Zapier MCP returned an unnamed tool.');
  return prepared.callTool(name, buildToolArgs(tool, candidates, action));
};

const callMcp = callZapier;

export const normalizeZapierMailMessages = (
  result: unknown,
  maxItems = 20,
): { messages: ZapierMailMessage[]; totalUnread: number } => {
  const seen = new Set<string>();
  const messages = collectEntries(result)
    .map((entry): ZapierMailMessage | null => {
      const parsed = parseMaybeJson(entry);
      if (!isRecord(parsed)) return null;
      const body = firstString(parsed.body_plain, parsed.text, parsed.body, parsed.content, parsed.snippet, parsed.preview) || '';
      const htmlBody = firstString(parsed.body_html, parsed.htmlBody, parsed.html);
      const fromRecord = isRecord(parsed.from) ? parsed.from : undefined;
      const fromEmailAddress = isRecord(fromRecord?.emailAddress) ? fromRecord.emailAddress : undefined;
      // aws-outlook-mcp returns `senders` as a string array of display names.
      const sendersArray = Array.isArray(parsed.senders)
        ? parsed.senders.map(String).filter(Boolean)
        : [];
      const from = firstString(
        parsed.from_email,
        parsed.fromEmail,
        fromEmailAddress?.address,
        parsed.sender_email,
        parsed.sender,
        parsed.from,
        parsed.email,
        sendersArray[0],
      ) || '';
      const fromName = firstString(
        parsed.from_name,
        parsed.fromName,
        fromEmailAddress?.name,
        parsed.sender_name,
        parsed.senderName,
        sendersArray[0],
      );
      const subject = firstString(parsed.subject, parsed.title, parsed.topic, parsed.name) || '(no subject)';
      const id = firstString(
        parsed.id,
        parsed.message_id,
        parsed.messageId,
        parsed.conversationId,
        parsed.conversation_id,
        parsed.thread_id,
        parsed.threadId,
        subject,
      );
      if (!id) return null;
      const labels = Array.isArray(parsed.labels)
        ? parsed.labels.map(String)
        : Array.isArray(parsed.labelIds)
          ? parsed.labelIds.map(String)
          : Array.isArray(parsed.categories)
            ? parsed.categories.map(String)
            : [];
      const unreadCount = Number(parsed.unreadCount ?? parsed.unread_count);
      const unreadRaw = parsed.unread ?? parsed.isUnread ?? parsed.is_read === false ?? parsed.isRead === false;
      const isUnread = unreadRaw === true
        || (Number.isFinite(unreadCount) && unreadCount > 0)
        || labels.some((label) => /unread/i.test(label));
      const rawDate = firstString(
        parsed.date,
        parsed.receivedDateTime,
        parsed.received_at,
        parsed.created_at,
        parsed.createdTime,
        parsed.lastDeliveryTime,
        parsed.last_delivery_time,
        parsed.sentDateTime,
      );
      return {
        id,
        threadId: firstString(parsed.threadId, parsed.thread_id, parsed.conversationId, parsed.conversation_id, id) || id,
        conversationId: firstString(parsed.conversationId, parsed.conversation_id, parsed.threadId, parsed.thread_id, id) || id,
        from,
        fromName,
        subject,
        snippet: firstString(parsed.snippet, parsed.bodyPreview, parsed.preview, stripHtml(body || htmlBody || '')) || '',
        date: shortDateLabel(rawDate),
        isUnread,
        labels,
        body,
        htmlBody,
      };
    })
    .filter((item): item is ZapierMailMessage => Boolean(item))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, maxItems);

  const totalRaw = parseMaybeJson(result);
  const totalUnread = isRecord(totalRaw)
    ? Number(totalRaw.totalUnread ?? totalRaw.total_unread ?? totalRaw.unread_count ?? messages.filter((item) => item.isUnread).length)
    : messages.filter((item) => item.isUnread).length;

  return {
    messages,
    totalUnread: Number.isFinite(totalUnread) ? totalUnread : messages.filter((item) => item.isUnread).length,
  };
};

export const normalizeZapierCalendarEvents = (
  result: unknown,
  maxItems = 20,
): ZapierCalendarEvent[] => {
  const seen = new Set<string>();
  return collectEntries(result)
    .map((entry): ZapierCalendarEvent | null => {
      const parsed = parseMaybeJson(entry);
      if (!isRecord(parsed)) return null;
      const title = firstString(parsed.title, parsed.summary, parsed.subject, parsed.name);
      const startDateTime = toDateString(parsed.startDateTime)
        || toDateString(parsed.start_time)
        || toDateString(parsed.start)
        || toDateString(parsed.start_at)
        || toDateString(parsed.date);
      if (!title || !startDateTime) return null;
      const endDateTime = toDateString(parsed.endDateTime)
        || toDateString(parsed.end_time)
        || toDateString(parsed.end)
        || toDateString(parsed.end_at);
      const id = firstString(parsed.id, parsed.event_id, parsed.eventId, `${title}-${startDateTime}`);
      const allDay = parsed.allDay === true
        || parsed.all_day === true
        || (/^\d{4}-\d{2}-\d{2}$/.test(startDateTime) && !endDateTime?.includes('T'));
      return {
        id,
        title,
        startTime: startDateTime,
        endTime: endDateTime,
        startDateTime,
        endDateTime,
        location: firstString(parsed.location, parsed.where),
        description: firstString(parsed.description, parsed.notes, parsed.body, parsed.content),
        allDay,
      };
    })
    .filter((item): item is ZapierCalendarEvent => Boolean(item))
    .filter((item) => {
      const key = item.id || `${item.title}-${item.startDateTime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxItems);
};

const normalizeZapierWidgetItem = (entry: unknown): ZapierWidgetItem | null => {
  const parsed = parseMaybeJson(entry);
  if (!isRecord(parsed)) return null;
  const title = firstString(parsed.title, parsed.name, parsed.displayName, parsed.summary, parsed.subject, textFromValue(parsed));
  const id = firstString(parsed.id, parsed.task_id, parsed.taskId, parsed.page_id, parsed.document_id, parsed.url, title);
  if (!id || !title) return null;
  const updatedRaw = firstString(
    parsed.updatedAt,
    parsed.updated_at,
    parsed.modifiedTime,
    parsed.last_edited_time,
    parsed.lastModifiedDateTime,
    parsed.created_at,
    parsed.createdDateTime,
  );
  const dueDate = firstString(
    parsed.dueDate,
    parsed.due_date,
    parsed.due,
    parsed.deadline,
    parsed.dueDateTime,
  );

  return {
    id,
    title,
    preview: firstString(
      parsed.preview,
      parsed.description,
      parsed.summary,
      parsed.notes,
      parsed.text,
      parsed.body,
      parsed.content,
      parsed.snippet,
      parsed.importance,
    ),
    url: normalizeUrl(firstString(parsed.url, parsed.web_url, parsed.html_url, parsed.link)),
    updatedAt: updatedRaw && Number.isFinite(Date.parse(updatedRaw)) ? Date.parse(updatedRaw) : undefined,
    status: firstString(parsed.status, parsed.state, parsed.stage),
    dueDate,
  };
};

export const normalizeZapierWidgetItems = (result: unknown, maxItems = 20): ZapierWidgetItem[] => {
  const seen = new Set<string>();
  return collectEntries(result)
    .map(normalizeZapierWidgetItem)
    .filter((item): item is ZapierWidgetItem => Boolean(item))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, maxItems);
};

export const listZapierMailMessages = async ({
  query = 'inbox',
  maxItems = 20,
}: {
  query?: string;
  maxItems?: number;
} = {}): Promise<{ messages: ZapierMailMessage[]; totalUnread: number }> => {
  const prepared = await prepareZapier();
  const tool = requireZapierTool(prepared, 'mail', 'list');
  const result = await callZapier(prepared, tool, {
    query: query.trim() || 'inbox',
    instructions: query.trim() || 'List recent inbox email messages.',
    limit: maxItems,
  });
  return normalizeZapierMailMessages(result, maxItems);
};

export const readZapierMailThread = async (
  message: ZapierMailMessage,
): Promise<ZapierMailThread> => {
  const prepared = await prepareZapier();
  const tool = findTool(prepared, 'mail', 'read');
  if (!tool) {
    return {
      subject: message.subject,
      messages: [{
        from: message.fromName || message.from,
        body: message.body || message.snippet,
        htmlBody: message.htmlBody,
        date: message.date,
      }],
    };
  }

  const result = await callZapier(prepared, tool, {
    id: message.id,
    message_id: message.id,
    thread_id: message.threadId,
    query: message.subject,
    instructions: `Read the email thread for "${message.subject}".`,
  });
  const normalized = normalizeZapierMailMessages(result, 10).messages;
  if (normalized.length > 0) {
    return {
      subject: normalized[0]?.subject || message.subject,
      messages: normalized.map((entry) => ({
        from: entry.fromName || entry.from,
        body: entry.body || entry.snippet,
        htmlBody: entry.htmlBody,
        date: entry.date,
      })),
    };
  }

  return {
    subject: message.subject,
    messages: [{
      from: message.fromName || message.from,
      body: collectTextFragments(result).join('\n').trim() || message.body || message.snippet,
      htmlBody: message.htmlBody,
      date: message.date,
    }],
  };
};

export const sendZapierEmail = async ({
  to,
  subject,
  body,
}: {
  to: string;
  subject?: string;
  body: string;
}): Promise<void> => {
  const prepared = await prepareZapier();
  const tool = requireZapierTool(prepared, 'mail', 'send');
  await callZapier(prepared, tool, {
    to,
    subject,
    title: subject,
    body,
    description: body,
    instructions: `Send an email to ${to}${subject ? ` with subject "${subject}"` : ''}.`,
  });
};

export const sendZapierEmailReply = async ({
  message,
  body,
}: {
  message: ZapierMailMessage;
  body: string;
}): Promise<void> => {
  const prepared = await prepareZapier();
  const tool = findTool(prepared, 'mail', 'reply') || requireZapierTool(prepared, 'mail', 'send');
  await callZapier(prepared, tool, {
    id: message.id,
    message_id: message.id,
    thread_id: message.threadId,
    to: message.from,
    subject: message.subject,
    title: message.subject,
    body,
    description: body,
    instructions: `Reply to the email thread "${message.subject}".`,
  });
};

export const listZapierCalendarEvents = async ({
  query = 'upcoming events',
  maxItems = 20,
  startDateTime,
  endDateTime,
}: {
  query?: string;
  maxItems?: number;
  startDateTime?: string;
  endDateTime?: string;
} = {}): Promise<ZapierCalendarEvent[]> => {
  const prepared = await prepareZapier();
  const tool = requireZapierTool(prepared, 'calendar', 'list');
  const result = await callZapier(prepared, tool, {
    query: query.trim() || 'upcoming events',
    instructions: query.trim() || 'List upcoming calendar events.',
    limit: maxItems,
    start_time: startDateTime,
    startDateTime,
    end_time: endDateTime,
    endDateTime,
  });
  return normalizeZapierCalendarEvents(result, maxItems);
};

export const createZapierCalendarEvent = async ({
  title,
  startDateTime,
  endDateTime,
  location,
  description,
  allDay,
}: {
  title: string;
  startDateTime: string;
  endDateTime?: string;
  location?: string;
  description?: string;
  allDay?: boolean;
}): Promise<ZapierCalendarEvent> => {
  const prepared = await prepareZapier();
  const tool = requireZapierTool(prepared, 'calendar', 'create');
  const result = await callZapier(prepared, tool, {
    title,
    summary: title,
    subject: title,
    start_time: startDateTime,
    startDateTime,
    end_time: endDateTime,
    endDateTime,
    location,
    description,
    body: description,
    all_day: allDay,
    allDay,
    instructions: `Create a calendar event titled "${title}".`,
  });
  return normalizeZapierCalendarEvents(result, 1)[0] || {
    title,
    startTime: startDateTime,
    startDateTime,
    endTime: endDateTime,
    endDateTime,
    location,
    description,
    allDay,
  };
};

export const listZapierWidgetItems = async ({
  kind,
  query,
  maxItems = 20,
}: {
  kind: Exclude<ZapierWidgetKind, 'mail' | 'calendar'>;
  query?: string;
  maxItems?: number;
}): Promise<ZapierWidgetItem[]> => {
  const prepared = await prepareZapier();
  const tool = requireZapierTool(prepared, kind, 'list');
  const fallback = DEFAULT_QUERY[kind];
  const result = await callZapier(prepared, tool, {
    query: (query || fallback).trim(),
    instructions: `Find ${kind === 'tasks' ? 'tasks or project items' : 'notes or documents'} matching "${query || fallback}".`,
    limit: maxItems,
  });
  return normalizeZapierWidgetItems(result, maxItems);
};

export const fetchZapierWidgetItem = async (
  item: Pick<ZapierWidgetItem, 'id' | 'title'> & Partial<ZapierWidgetItem>,
  kind?: Exclude<ZapierWidgetKind, 'mail' | 'calendar'>,
): Promise<ZapierWidgetDetail> => {
  const effectiveKind = kind || (item.status || item.dueDate ? 'tasks' : 'notes');
  const prepared = await prepareZapier();
  const tool = findTool(prepared, effectiveKind, 'read') || findTool(prepared, effectiveKind, 'list');
  let result: unknown = null;
  if (tool) {
    result = await callZapier(prepared, tool, {
      id: item.id,
      query: item.title,
      instructions: `Read details for "${item.title}".`,
      limit: 1,
    });
  }

  const [normalized] = normalizeZapierWidgetItems(result, 1);
  const content = collectTextFragments(result)
    .filter((text, index, values) => values.indexOf(text) === index)
    .join('\n')
    .trim();

  return {
    ...item,
    ...normalized,
    id: normalized?.id || item.id,
    title: normalized?.title || item.title,
    url: normalized?.url || item.url,
    content: content || normalized?.preview || item.preview || item.title,
  };
};

// ── Server-aware variants ─────────────────────────────────────────
//
// The helpers below accept a specific enabled MCP server so widgets
// configured with the generic `"mcp"` provider can route through any
// enabled MCP that exposes matching tools (for example an internal
// amzn-mcp with Slack/email actions alongside Zapier Actions).

export interface McpMessagesChannel {
  id: string;
  name?: string;
  description?: string;
}

export interface McpMessagesMessage {
  id: string;
  channel: string;
  channelId?: string;
  user: string;
  text: string;
  timestamp: string;
  raw?: Record<string, unknown>;
}

const normalizeMcpMessagesChannels = (result: unknown, maxItems = 25): McpMessagesChannel[] => {
  const seen = new Set<string>();
  return collectEntries(result)
    .map((entry): McpMessagesChannel | null => {
      const parsed = parseMaybeJson(entry);
      if (!isRecord(parsed)) return null;
      const id = firstString(parsed.id, parsed.channel_id, parsed.channelId, parsed.name);
      if (!id) return null;
      return {
        id,
        name: firstString(parsed.name, parsed.channel_name, parsed.topic, parsed.title),
        description: firstString(parsed.description, parsed.purpose, parsed.topic),
      };
    })
    .filter((entry): entry is McpMessagesChannel => Boolean(entry))
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .slice(0, maxItems);
};

const normalizeMcpMessagesMessages = (
  result: unknown,
  channelLabel: string | undefined,
  maxItems = 20,
): McpMessagesMessage[] => {
  const seen = new Set<string>();
  return collectEntries(result)
    .map((entry, index): McpMessagesMessage | null => {
      const parsed = parseMaybeJson(entry);
      if (!isRecord(parsed)) return null;
      const text = firstString(
        parsed.text,
        parsed.message,
        parsed.body,
        parsed.content,
        (parsed.blocks as Record<string, unknown>[] | undefined)?.map?.((block) => textFromValue(block))?.filter(Boolean).join(' '),
      );
      if (!text) return null;
      const user = firstString(
        parsed.user,
        parsed.username,
        parsed.user_name,
        parsed.author,
        parsed.sender,
        parsed.from,
      ) || 'unknown';
      const rawTs = firstString(parsed.ts, parsed.timestamp, parsed.created_at, parsed.date);
      const timestampLabel = (() => {
        if (!rawTs) return '';
        const parsedNum = Number(rawTs);
        if (Number.isFinite(parsedNum) && parsedNum > 1_000_000_000) {
          // Slack `ts` values are Unix seconds with microsecond fraction.
          return shortDateLabel(new Date(parsedNum * 1000).toISOString());
        }
        return shortDateLabel(rawTs);
      })();
      const id = firstString(parsed.id, parsed.ts, parsed.message_ts, `${rawTs || index}`) || `msg-${index}`;
      const channelId = firstString(parsed.channel, parsed.channel_id, parsed.channelId);
      return {
        id,
        channel: firstString(parsed.channel_name, channelLabel, channelId) || 'channel',
        channelId,
        user,
        text,
        timestamp: timestampLabel,
        raw: parsed,
      };
    })
    .filter((message): message is McpMessagesMessage => Boolean(message))
    .filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    })
    .slice(0, maxItems);
};

const resolveMcpTool = (
  prepared: PreparedGenericMcpTools,
  toolName: string | undefined,
  kind: ZapierWidgetKind,
  action: ZapierToolAction,
  server?: GenericMcpServerConfig,
): FunctionDeclaration | null => {
  // 1. Explicit pin from widget settings wins.
  if (toolName) {
    const exact = prepared.tools.find((tool) => tool.name === toolName);
    if (exact) return exact;
    // Fall back to matching a scoped "{server}__{name}" alias that the
    // preparer may have produced for ambiguous tool names.
    const scoped = prepared.tools.find((tool) => tool.name?.endsWith(`__${toolName}`));
    if (scoped) return scoped;
  }
  // 2. Profile-tailored exact tool: when the user adds a recognized
  // stdio MCP (e.g. aws-outlook-mcp), skip the heuristic matcher and
  // call the exact tool we know services this domain/action. Profiles
  // only activate on detect, not on any preset/catalog listing.
  if (server) {
    const profile = detectMcpProfile(server);
    const profileDomain = kind as McpProfileDomain;
    const profileAction = action === 'send' || action === 'reply' || action === 'read' || action === 'list' || action === 'create'
      ? (action as McpProfileAction)
      : null;
    if (profile && profileAction && profileSupportsDomain(profile, profileDomain)) {
      const pinned = profileToolName(profile, profileDomain, profileAction)
        // Fall through the inbox/search preference for list when the
        // widget was pinned with a search-specific role.
        || (action === 'list' ? profileToolName(profile, profileDomain, 'search') : undefined);
      if (pinned) {
        const match = prepared.tools.find((tool) => tool.name === pinned);
        if (match) return match;
      }
    }
  }
  // 3. Fall through to the generic keyword matcher.
  return findTool(prepared, kind, action);
};

export const listMcpMailMessages = async (options: {
  serverId?: string;
  toolName?: string;
  query?: string;
  maxItems?: number;
} = {}): Promise<{ messages: ZapierMailMessage[]; totalUnread: number; debug: {
  serverName: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  rawResultPreview: string;
  normalizedCount: number;
} }> => {
  const { prepared, server } = await prepareMcpForWidget(options.serverId, 'mail');
  const query = (options.query || 'inbox').trim() || 'inbox';
  const isSearch = query !== 'inbox' && !/^(inbox|all|unread)$/i.test(query);
  const profile = detectMcpProfile(server);
  const effectiveTool = (() => {
    if (options.toolName) {
      return resolveMcpTool(prepared, options.toolName, 'mail', 'list', server);
    }
    if (isSearch && profile) {
      const searchName = profileToolName(profile, 'mail', 'search');
      if (searchName) {
        const searchTool = prepared.tools.find((t) => t.name === searchName);
        if (searchTool) return searchTool;
      }
    }
    return resolveMcpTool(prepared, undefined, 'mail', 'list', server);
  })();
  if (!effectiveTool) {
    throw new Error(`${server.name} does not expose an email list/search tool. Pin a tool name in widget settings if auto-match missed it.`);
  }
  const toolArgs = buildToolArgs(effectiveTool, {
    query,
    instructions: `List recent email messages${query !== 'inbox' ? ` matching "${query}"` : ''}.`,
    limit: options.maxItems || 20,
  }, isSearch ? 'list' : 'list');

  console.info('[MailWidget/MCP] Dispatching email list', {
    server: server.name,
    serverId: server.id,
    tool: effectiveTool.name,
    args: toolArgs,
  });

  const result = await prepared.callTool(effectiveTool.name!, toolArgs);

  const preview = (() => {
    try {
      const serialized = typeof result === 'string' ? result : JSON.stringify(result);
      return serialized ? serialized.slice(0, 600) : '';
    } catch {
      return '[unserializable result]';
    }
  })();

  const normalized = normalizeZapierMailMessages(result, options.maxItems || 20);

  console.info('[MailWidget/MCP] Email list result', {
    tool: effectiveTool.name,
    normalizedCount: normalized.messages.length,
    totalUnread: normalized.totalUnread,
    rawPreview: preview,
    fullResult: result,
  });

  return {
    ...normalized,
    debug: {
      serverName: server.name,
      toolName: effectiveTool.name || '',
      toolArgs,
      rawResultPreview: preview,
      normalizedCount: normalized.messages.length,
    },
  };
};

/**
 * Probe whether a configured MCP server currently exposes any
 * send-capable email tool. Used by the Mail widget to decide whether to
 * unlock the compose UI without forcing the user to click Send first.
 */
export const mcpMailSendAvailable = async (options: {
  serverId?: string;
  toolName?: string;
} = {}): Promise<boolean> => {
  try {
    const { prepared, server } = await prepareMcpForWidget(options.serverId, 'mail');
    if (options.toolName) {
      return prepared.tools.some((tool) => tool.name === options.toolName);
    }
    return Boolean(resolveMcpTool(prepared, undefined, 'mail', 'send', server));
  } catch {
    return false;
  }
};

/**
 * Probe whether a configured MCP server exposes a reply-capable email
 * tool. Mirrors `mcpMailSendAvailable` for the reply button.
 */
export const mcpMailReplyAvailable = async (options: {
  serverId?: string;
  toolName?: string;
} = {}): Promise<boolean> => {
  try {
    const { prepared, server } = await prepareMcpForWidget(options.serverId, 'mail');
    if (options.toolName) {
      return prepared.tools.some((tool) => tool.name === options.toolName);
    }
    return Boolean(resolveMcpTool(prepared, undefined, 'mail', 'reply', server));
  } catch {
    return false;
  }
};

/**
 * Send a new email through an enabled MCP server. When `toolName` is set
 * the helper calls that tool directly; otherwise the heuristic matcher
 * picks a send-capable tool (e.g. aws-outlook-mcp `email_send`).
 */
export const sendMcpEmail = async (options: {
  serverId?: string;
  toolName?: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
}): Promise<{ toolName: string; args: Record<string, unknown>; result: unknown }> => {
  const { prepared, server } = await prepareMcpForWidget(options.serverId, 'mail');
  const tool = resolveMcpTool(prepared, options.toolName, 'mail', 'send', server);
  if (!tool) {
    throw new Error(`${server.name} does not expose an email send tool. Enable write tools on the MCP (for aws-outlook-mcp, set OUTLOOK_MCP_ENABLE_WRITES=true) and pin the send tool in widget settings.`);
  }
  const args = buildToolArgs(tool, {
    to: options.to,
    cc: options.cc,
    bcc: options.bcc,
    subject: options.subject,
    title: options.subject,
    body: options.body,
    message: options.body,
    content: options.body,
    instructions: `Send an email to ${options.to} with subject "${options.subject}".`,
  }, 'send');
  console.info('[MailWidget/MCP] Sending email', {
    server: server.name,
    tool: tool.name,
    args,
  });
  const result = await prepared.callTool(tool.name!, args);
  console.info('[MailWidget/MCP] Send result', { tool: tool.name, result });
  return { toolName: tool.name || '', args, result };
};

/**
 * Reply to an email through an enabled MCP server.
 *
 * Handles the aws-outlook-mcp case where the reply tool requires
 * `itemId`/`itemChangeKey` but the inbox/search list returns only a
 * `conversationId`. When the reply tool's schema asks for those fields
 * and they weren't provided on the message (selected from the list),
 * Curio first calls a read tool to resolve them.
 */
export const replyMcpEmail = async (options: {
  serverId?: string;
  /** Pinned reply tool name. Falls back to heuristic if unset. */
  replyToolName?: string;
  /** Pinned read tool name (for resolving itemId/itemChangeKey). */
  readToolName?: string;
  /** Identifier from the list result. For aws-outlook-mcp this is `conversationId`. */
  conversationId?: string;
  /** If already known, skip the read step. */
  itemId?: string;
  itemChangeKey?: string;
  /** Recipient fallback if the reply tool supports only additional recipients. */
  to?: string;
  subject?: string;
  body: string;
  replyAll?: boolean;
}): Promise<{ toolName: string; args: Record<string, unknown>; result: unknown }> => {
  const { prepared, server } = await prepareMcpForWidget(options.serverId, 'mail');
  const replyTool = resolveMcpTool(prepared, options.replyToolName, 'mail', 'reply', server);
  if (!replyTool) {
    throw new Error(`${server.name} does not expose an email reply tool. Enable write tools on the MCP and pin the reply tool in widget settings.`);
  }

  const replyProps = toolSchemaProperties(replyTool);
  const replyRequires = Array.isArray((replyTool.parameters as JsonRecord | undefined)?.required)
    ? ((replyTool.parameters as JsonRecord).required as string[])
    : [];
  const needsItemId = replyRequires.includes('itemId') || 'itemId' in replyProps;
  const needsChangeKey = replyRequires.includes('itemChangeKey') || 'itemChangeKey' in replyProps;

  let itemId = options.itemId;
  let itemChangeKey = options.itemChangeKey;

  // If the reply tool needs item ids and we don't have them yet, call
  // the read tool to resolve them from the conversation id.
  if ((needsItemId && !itemId) || (needsChangeKey && !itemChangeKey)) {
    // Prefer a dedicated read tool (`email_read`) when the server has
    // one, even if the widget's list/search tool is also pinned. The
    // list tool (e.g. `email_inbox`, `email_search`) usually doesn't
    // return `itemId`/`itemChangeKey`, while a read-by-id tool does.
    const readTool = resolveMcpTool(prepared, options.readToolName, 'mail', 'read', server)
      || resolveMcpTool(prepared, undefined, 'mail', 'read', server);
    if (!readTool) {
      throw new Error(`${server.name} requires itemId/itemChangeKey for replies but does not expose a read tool to resolve them.`);
    }
    if (!options.conversationId) {
      throw new Error('Cannot resolve reply target: conversationId is missing on the selected email.');
    }
    const readArgs = buildToolArgs(readTool, {
      conversationId: options.conversationId,
      id: options.conversationId,
      thread_id: options.conversationId,
      query: options.subject || '',
    }, 'read');
    console.info('[MailWidget/MCP] Resolving reply target via read tool', {
      server: server.name,
      readTool: readTool.name,
      args: readArgs,
    });
    const readResult = await prepared.callTool(readTool.name!, readArgs);
    console.info('[MailWidget/MCP] Raw read result:', JSON.stringify(readResult).slice(0, 1000));
    const entries = collectEntries(readResult);
    console.info('[MailWidget/MCP] collectEntries found', entries.length, 'entries. First entry keys:', entries[0] ? Object.keys(entries[0] as Record<string, unknown>) : 'none');
    const resolved = findFirstItemIds(readResult);
    console.info('[MailWidget/MCP] Read resolved item keys', resolved);
    itemId = itemId || resolved.itemId;
    itemChangeKey = itemChangeKey || resolved.itemChangeKey;
    if (needsItemId && !itemId) {
      throw new Error('Could not find an itemId on the conversation to reply to.');
    }
    if (needsChangeKey && !itemChangeKey) {
      throw new Error('Could not find an itemChangeKey on the conversation to reply to.');
    }
  }

  const args = buildToolArgs(replyTool, {
    itemId,
    itemChangeKey,
    conversationId: options.conversationId,
    id: options.conversationId,
    thread_id: options.conversationId,
    to: options.to,
    subject: options.subject,
    title: options.subject,
    body: options.body,
    message: options.body,
    content: options.body,
    replyAll: options.replyAll,
    instructions: `Reply to the email thread${options.subject ? ` "${options.subject}"` : ''}.`,
  }, 'reply');

  console.info('[MailWidget/MCP] Sending reply', {
    server: server.name,
    tool: replyTool.name,
    args,
  });
  const result = await prepared.callTool(replyTool.name!, args);
  console.info('[MailWidget/MCP] Reply result', { tool: replyTool.name, result });
  return { toolName: replyTool.name || '', args, result };
};

/**
 * Walks an arbitrary MCP read result and returns the first
 * `itemId`/`itemChangeKey` pair it can find. Used to resolve reply
 * targets for aws-outlook-mcp-style reply tools. Returns whatever keys
 * were found; callers validate required keys themselves.
 *
 * Uses the same `parseMaybeJson` + `collectEntries` scaffolding the rest
 * of the normalizer uses, so wrappers like
 * `<untrusted_content_*>...{"success":true,"content":{"emails":[{...}]}}...`
 * are traversed correctly.
 */
const findFirstItemIds = (value: unknown): { itemId?: string; itemChangeKey?: string } => {
  const scan = (entry: unknown): { itemId?: string; itemChangeKey?: string } | null => {
    const parsed = parseMaybeJson(entry);
    if (!isRecord(parsed)) return null;
    const itemId = firstString(parsed.itemId, parsed.ItemId, parsed.item_id, parsed.Id, parsed.id);
    const itemChangeKey = firstString(parsed.itemChangeKey, parsed.ItemChangeKey, parsed.item_change_key, parsed.ChangeKey, parsed.changeKey);
    if (itemId || itemChangeKey) return { itemId, itemChangeKey };
    return null;
  };

  // First, try the top-level value in case the full result already has
  // the IDs on the outer object (some MCPs do this for read-by-id).
  const topLevel = scan(value);
  if (topLevel) return topLevel;

  // Then walk the same traversal the list/search normalizers use so
  // wrappers and nested `{ content: { emails: [...] } }` shapes are
  // unwrapped consistently.
  for (const entry of collectEntries(value)) {
    const found = scan(entry);
    if (found) return found;
  }

  return {};
};

export const listMcpCalendarEvents = async (options: {
  serverId?: string;
  toolName?: string;
  query?: string;
  maxItems?: number;
  startDateTime?: string;
  endDateTime?: string;
} = {}): Promise<ZapierCalendarEvent[]> => {
  const { prepared, server } = await prepareMcpForWidget(options.serverId, 'calendar');
  const tool = resolveMcpTool(prepared, options.toolName, 'calendar', 'list', server);
  if (!tool) {
    throw new Error(`${server.name} does not expose a calendar list/search tool. Pin a tool name in widget settings if auto-match missed it.`);
  }
  const query = (options.query || 'upcoming events').trim() || 'upcoming events';
  const result = await callMcp(prepared, tool, {
    query,
    instructions: query,
    limit: options.maxItems || 20,
    start_time: options.startDateTime,
    startDateTime: options.startDateTime,
    end_time: options.endDateTime,
    endDateTime: options.endDateTime,
  });
  return normalizeZapierCalendarEvents(result, options.maxItems || 20);
};

export const listMcpWidgetItems = async (options: {
  serverId?: string;
  toolName?: string;
  kind: Exclude<ZapierWidgetKind, 'mail' | 'calendar' | 'messages'>;
  query?: string;
  maxItems?: number;
  /** For multiplexed tools that need a parent list id (e.g. aws-outlook-mcp
   * `todo_tasks` requires `listId`). When unset, Curio resolves it
   * automatically by calling a sibling `*_lists` tool. */
  listId?: string;
}): Promise<ZapierWidgetItem[]> => {
  const { prepared, server } = await prepareMcpForWidget(options.serverId, options.kind as McpProfileDomain);
  const tool = resolveMcpTool(prepared, options.toolName, options.kind, 'list', server);
  if (!tool) {
    throw new Error(`${server.name} does not expose a ${options.kind} list/search tool. Pin a tool name in widget settings if auto-match missed it.`);
  }
  const query = (options.query || (options.kind === 'tasks' ? 'open tasks' : 'notes')).trim();

  // Some MCPs (e.g. aws-outlook-mcp `todo_tasks`) require a `listId` to
  // list items. If the tool schema requires one and we don't have it,
  // resolve it by listing the parent buckets through a sibling tool
  // (e.g. `todo_lists`) and picking the best match.
  const props = toolSchemaProperties(tool);
  const requiredKeys = Array.isArray((tool.parameters as JsonRecord | undefined)?.required)
    ? ((tool.parameters as JsonRecord).required as string[])
    : [];
  const needsListId = 'listId' in props && (requiredKeys.includes('listId') || !options.listId);
  let resolvedListId = options.listId;
  if (needsListId && !resolvedListId) {
    resolvedListId = await resolveSiblingListId(prepared, tool, options.kind, query);
  }

  const result = await callMcp(prepared, tool, {
    query,
    instructions: `Find ${options.kind === 'tasks' ? 'tasks or project items' : 'notes or documents'}${query ? ` matching "${query}"` : ''}.`,
    limit: options.maxItems || 20,
    listId: resolvedListId,
    showCompleted: false,
  }, 'list');
  return normalizeZapierWidgetItems(result, options.maxItems || 20);
};

/**
 * Pick a sibling list/container tool and call it to resolve a parent
 * list id for the current list tool. For aws-outlook-mcp, the matched
 * list tool is `todo_tasks` (which needs `listId`) and the sibling is
 * `todo_lists` (which returns the available lists). Returns the
 * best-match list id or undefined if nothing resolves.
 */
const resolveSiblingListId = async (
  prepared: PreparedGenericMcpTools,
  currentTool: FunctionDeclaration,
  kind: Exclude<ZapierWidgetKind, 'mail' | 'calendar' | 'messages'>,
  query: string,
): Promise<string | undefined> => {
  const currentName = (currentTool.name || '').toLowerCase();
  // Prefer a tool whose name is the current one with "tasks" swapped
  // for "lists" (e.g. todo_tasks -> todo_lists). Fall back to any
  // tool whose name contains "list" in the same domain.
  const candidateNames = [
    currentName.replace(/tasks?$/, 'lists'),
    currentName.replace(/tasks?/, 'lists'),
    currentName.replace(/notes?$/, 'folders'),
  ].filter((name) => name && name !== currentName);

  let listTool = prepared.tools.find((t) => t.name && candidateNames.includes(t.name.toLowerCase()));
  if (!listTool) {
    const domainTerms = kind === 'tasks'
      ? ['task', 'todo', 'list']
      : ['note', 'doc', 'folder', 'page'];
    listTool = prepared.tools.find((t) => {
      const n = (t.name || '').toLowerCase();
      return n.includes('list') && domainTerms.some((term) => n.includes(term));
    });
  }
  if (!listTool) return undefined;

  let result: unknown;
  try {
    result = await callMcp(prepared, listTool, { query }, 'list');
  } catch (error) {
    console.warn('[MCP] resolveSiblingListId failed:', error);
    return undefined;
  }

  // Scan for objects that have both an `id` and a `displayName` / `name`
  // (the aws-outlook-mcp `todo_lists` shape) and pick the best match.
  const entries = collectEntries(result);
  const parsed = entries
    .map((entry) => parseMaybeJson(entry))
    .filter(isRecord) as Array<Record<string, unknown>>;
  if (parsed.length === 0) return undefined;

  const byName = (candidates: string[]): Record<string, unknown> | undefined =>
    parsed.find((entry) => {
      const name = firstString(entry.displayName, entry.name, entry.title);
      if (!name) return false;
      return candidates.some((candidate) => name.toLowerCase() === candidate.toLowerCase());
    });

  // 1. Exact match on the user's query string.
  const queryMatch = query ? byName([query]) : undefined;
  // 2. Well-known default list names.
  const defaultMatch = byName(['Tasks', 'To-Do', 'Todo', 'Inbox']);
  // 3. Fall back to the first list.
  const chosen = queryMatch || defaultMatch || parsed[0];

  return firstString(chosen.id, chosen.listId);
};

export const fetchMcpWidgetItem = async (
  item: Pick<ZapierWidgetItem, 'id' | 'title'> & Partial<ZapierWidgetItem>,
  options: {
    serverId?: string;
    toolName?: string;
    kind?: Exclude<ZapierWidgetKind, 'mail' | 'calendar' | 'messages'>;
    /** Pass-through for multiplexed tools (e.g. todo_tasks needs listId). */
    listId?: string;
  } = {},
): Promise<ZapierWidgetDetail> => {
  const effectiveKind = options.kind || (item.status || item.dueDate ? 'tasks' : 'notes');
  const { prepared, server } = await prepareMcpForWidget(options.serverId, effectiveKind as McpProfileDomain);
  const tool = resolveMcpTool(prepared, options.toolName, effectiveKind, 'read', server)
    || resolveMcpTool(prepared, options.toolName, effectiveKind, 'list', server);
  let result: unknown = null;
  if (tool) {
    // For multiplexed tools that need a listId and we don't have one,
    // resolve it by listing sibling containers (same path as
    // listMcpWidgetItems). No-op when the tool doesn't require listId.
    const props = toolSchemaProperties(tool);
    const requiredKeys = Array.isArray((tool.parameters as JsonRecord | undefined)?.required)
      ? ((tool.parameters as JsonRecord).required as string[])
      : [];
    let resolvedListId = options.listId;
    if ('listId' in props && requiredKeys.includes('listId') && !resolvedListId) {
      resolvedListId = await resolveSiblingListId(prepared, tool, effectiveKind, item.title || '');
    }
    result = await callMcp(prepared, tool, {
      id: item.id,
      taskId: item.id,
      listId: resolvedListId,
      query: item.title,
      instructions: `Read details for "${item.title}".`,
      limit: 1,
    }, 'read');
  }
  const [normalized] = normalizeZapierWidgetItems(result, 1);
  const content = collectTextFragments(result)
    .filter((text, index, values) => values.indexOf(text) === index)
    .join('\n')
    .trim();
  return {
    ...item,
    ...normalized,
    id: normalized?.id || item.id,
    title: normalized?.title || item.title,
    url: normalized?.url || item.url,
    content: content || normalized?.preview || item.preview || item.title,
  };
};

export const listMcpMessages = async (options: {
  serverId?: string;
  toolName?: string;
  channelQuery?: string;
  maxItems?: number;
} = {}): Promise<{ messages: McpMessagesMessage[]; channel?: McpMessagesChannel }> => {
  const { prepared, server } = await prepareMcpForWidget(options.serverId, 'messages');
  const tool = resolveMcpTool(prepared, options.toolName, 'messages', 'list', server);
  if (!tool) {
    throw new Error(`${server.name} does not expose a Slack/messages list tool. Pin a tool name in widget settings if auto-match missed it.`);
  }
  const channelQuery = (options.channelQuery || '').trim();
  const result = await callMcp(prepared, tool, {
    query: channelQuery,
    instructions: channelQuery
      ? `Read recent messages from "${channelQuery}".`
      : 'Read recent Slack messages.',
    channel: channelQuery,
    channel_name: channelQuery,
    limit: options.maxItems || 20,
  });
  const messages = normalizeMcpMessagesMessages(result, channelQuery, options.maxItems || 20);
  const channel = channelQuery ? { id: channelQuery, name: channelQuery } : undefined;
  return { messages, channel };
};

export const listMcpMessagesChannels = async (options: {
  serverId?: string;
  maxItems?: number;
} = {}): Promise<McpMessagesChannel[]> => {
  const { prepared } = await prepareMcpForWidget(options.serverId, 'messages');
  const tool = findTool(prepared, 'messages', 'list');
  if (!tool) return [];
  const result = await callMcp(prepared, tool, {
    query: 'channels',
    instructions: 'List Slack channels.',
    limit: options.maxItems || 50,
  });
  return normalizeMcpMessagesChannels(result, options.maxItems || 50);
};
