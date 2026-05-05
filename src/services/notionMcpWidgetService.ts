import {
  getEnabledGenericMcpServers,
  type GenericMcpServerConfig,
} from '../utils/settingsStorage';
import { prepareGenericMcpTools } from './genericMcpService';

export type NotionWidgetKind = 'notes' | 'projects';

export interface NotionWidgetItem {
  id: string;
  title: string;
  preview?: string;
  url?: string;
  updatedAt?: number;
  status?: string;
  dueDate?: string;
}

export interface NotionWidgetDetail extends NotionWidgetItem {
  content: string;
}

export interface ListNotionWidgetItemsOptions {
  kind: NotionWidgetKind;
  query?: string;
  maxItems?: number;
}

const DEFAULT_QUERY: Record<NotionWidgetKind, string> = {
  notes: 'notes',
  projects: 'projects tasks',
};

const NOTION_ID_RE = /\b(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const firstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

const notionTextValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value)) {
    return value.map(notionTextValue).filter(Boolean).join(' ').trim() || undefined;
  }
  if (!isRecord(value)) return undefined;
  return firstString(value.plain_text, value.text, value.name, value.title)
    || notionTextValue(value.rich_text)
    || notionTextValue(value.title)
    || notionTextValue((value.text as Record<string, unknown> | undefined)?.content);
};

const notionPropertyText = (
  properties: Record<string, unknown> | undefined,
  names: string[],
): string | undefined => {
  if (!properties) return undefined;
  const normalized = new Map(
    Object.entries(properties).map(([key, value]) => [key.toLowerCase(), value]),
  );
  for (const name of names) {
    const value = normalized.get(name.toLowerCase());
    if (!isRecord(value)) {
      const text = notionTextValue(value);
      if (text) return text;
      continue;
    }
    const text = notionTextValue(value.title)
      || notionTextValue(value.rich_text)
      || notionTextValue(value.status)
      || notionTextValue(value.select)
      || notionTextValue(value.multi_select)
      || notionTextValue(value.people)
      || notionTextValue(value);
    if (text) return text;
  }
  return undefined;
};

const notionPropertyDate = (
  properties: Record<string, unknown> | undefined,
  names: string[],
): string | undefined => {
  if (!properties) return undefined;
  const normalized = new Map(
    Object.entries(properties).map(([key, value]) => [key.toLowerCase(), value]),
  );
  for (const name of names) {
    const value = normalized.get(name.toLowerCase());
    if (isRecord(value) && isRecord(value.date)) {
      const date = firstString(value.date.start, value.date.end);
      if (date) return date;
    }
    const text = notionTextValue(value);
    if (text && /^\d{4}-\d{2}-\d{2}/.test(text)) return text;
  }
  return undefined;
};

const parseMaybeJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const normalizeNotionId = (value: unknown): string | undefined => {
  const text = firstString(value);
  if (!text) return undefined;
  const match = text.match(NOTION_ID_RE);
  return match?.[0].replace(/-/g, '').toLowerCase();
};

const buildNotionUrlFromId = (id: unknown): string | undefined => {
  const normalized = normalizeNotionId(id);
  return normalized ? `https://www.notion.so/${normalized}` : undefined;
};

const cleanNotionMcpTextLines = (text: string): string => {
  const withoutSections = text
    .replace(/<properties\b[^>]*>[\s\S]*?<\/properties>/gi, '')
    .replace(/<data-sources\b[^>]*>[\s\S]*?<\/data-sources>/gi, '')
    .replace(/<ancestor-path\b[^>]*>[\s\S]*?<\/ancestor-path>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const withoutTags = withoutSections.replace(/<\/?[a-z0-9_-]+\b[^>]*>/gi, '');

  const lines = withoutTags
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^Here is the result of "view" for the (?:Page|Database|Item|Record) with URL\b/i.test(trimmed)) return false;
      if (/^The title of this (?:Database|Data Source|Page|Item|Record) is:/i.test(trimmed)) return false;
      if (/^Here (?:are|is) the .*(?:Data Sources|schema configuration|properties):?$/i.test(trimmed)) return false;
      if (/^You can use the "view" tool on the URL of any Data Source\b/i.test(trimmed)) return false;
      if (/^as of \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/i.test(trimmed)) return false;
      if (/^[{[][\s\S]*(?:"(?:operator|dataSourceUrl|propertyType|sorts|displayProperties|groupBy)"|collection:\/\/)[\s\S]*[}\]],?$/i.test(trimmed)) return false;
      return true;
    });

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const stripNotionMetaTags = (text: string): string => {
  const contentBlocks = Array.from(text.matchAll(/<content\b[^>]*>([\s\S]*?)<\/content>/gi))
    .map((match) => cleanNotionMcpTextLines(match[1] || ''))
    .filter(Boolean);
  if (contentBlocks.length > 0) return contentBlocks.join('\n\n').trim();

  return cleanNotionMcpTextLines(text);
};

const extractNotionPropertiesFromTags = (text: string): Record<string, unknown> | undefined => {
  const match = text.match(/<properties>([\s\S]*?)<\/properties>/i);
  if (!match) return undefined;
  try {
    const parsed = JSON.parse(match[1]);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const extractNotionTitleFromTags = (text: string): string | undefined => {
  const match = text.match(/^The title of this (?:Page|Database|Item|Record) is:\s*(.+)$/im);
  return match?.[1]?.trim() || undefined;
};

const extractNotionIdFromTags = (text: string): string | undefined => {
  const match = text.match(/<(?:page|database)\s+url="([^"]+)"/i);
  const rawUrl = match?.[1]?.replace(/^\{\{|\}\}$|\\/g, '');
  if (rawUrl) return normalizeNotionId(rawUrl);
  return undefined;
};

const normalizeExternalNotionUrl = (
  preferredUrl: unknown,
  fallbackId: unknown,
): string | undefined => {
  const raw = firstString(preferredUrl);
  if (raw) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.href;
      }
    } catch {
      // Relative Notion paths would navigate inside Curio; fall through to ID URL.
    }
  }

  return buildNotionUrlFromId(fallbackId);
};

const collectResultEntries = (value: unknown): unknown[] => {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed;

  if (typeof parsed === 'string' && /<(?:page|database|properties|content)/i.test(parsed)) {
    const properties = extractNotionPropertiesFromTags(parsed);
    const id = extractNotionIdFromTags(parsed);
    const title = extractNotionTitleFromTags(parsed);
    if (properties || id) {
      return [{
        id,
        title,
        properties,
        url: id ? buildNotionUrlFromId(id) : undefined,
        text: stripNotionMetaTags(parsed),
      }];
    }
  }

  if (!isRecord(parsed)) return [];

  if (Array.isArray(parsed.results)) return parsed.results;
  if (Array.isArray(parsed.pages)) return parsed.pages;
  if (Array.isArray(parsed.items)) return parsed.items;
  if (Array.isArray(parsed.content)) {
    return parsed.content.flatMap((entry) => {
      if (isRecord(entry) && typeof entry.text === 'string') {
        return collectResultEntries(entry.text);
      }
      return collectResultEntries(entry);
    });
  }
  if (isRecord(parsed.page) || isRecord(parsed.database)) return [parsed.page || parsed.database];
  if (firstString(parsed.id, parsed.url, parsed.title, parsed.name)) return [parsed];
  return [];
};

const collectNotionTextFragments = (
  value: unknown,
  fragments: string[] = [],
  depth = 0,
): string[] => {
  if (depth > 12 || value == null) return fragments;

  const parsed = parseMaybeJson(value);
  if (typeof parsed === 'string') {
    const text = stripNotionMetaTags(parsed);
    if (text) fragments.push(text);
    return fragments;
  }

  if (Array.isArray(parsed)) {
    parsed.forEach((entry) => collectNotionTextFragments(entry, fragments, depth + 1));
    return fragments;
  }

  if (!isRecord(parsed)) return fragments;

  // Metadata/noise keys to skip during recursion
  const NOISE_KEYS = /^(id|url|public_url|type|object|created_time|last_edited_time|updated_at|href|operator|dataSourceUrl|propertyType|sorts|displayProperties|groupBy|icon|cover|parent|archived|in_trash|color|annotations|options|select|multi_select|people|files|checkbox|number|formula|relation|rollup)$/i;

  for (const [key, entry] of Object.entries(parsed)) {
    if (NOISE_KEYS.test(key)) continue;
    collectNotionTextFragments(entry, fragments, depth + 1);
  }

  return fragments;
};

const normalizeNotionWidgetItem = (entry: unknown): NotionWidgetItem | null => {
  const parsed = parseMaybeJson(entry);
  if (!isRecord(parsed)) return null;
  const properties = isRecord(parsed.properties)
    ? parsed.properties as Record<string, unknown>
    : undefined;
  const title = firstString(
    parsed.title,
    parsed.name,
    notionPropertyText(properties, ['Name', 'Title', 'Task', 'Project']),
    notionTextValue(parsed),
  );
  const id = firstString(parsed.id, parsed.page_id, parsed.database_id, parsed.url, title);
  if (!id || !title) return null;

  const updatedRaw = firstString(parsed.last_edited_time, parsed.updatedAt, parsed.updated_at, parsed.created_time);
  const updatedAt = updatedRaw ? Date.parse(updatedRaw) : undefined;

  return {
    id,
    title,
    preview: firstString(
      parsed.preview,
      parsed.description,
      parsed.summary,
      notionPropertyText(properties, ['Summary', 'Description', 'Notes']),
    ),
    url: normalizeExternalNotionUrl(firstString(parsed.url, parsed.public_url), id),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : undefined,
    status: firstString(
      parsed.status,
      notionPropertyText(properties, ['Status', 'State', 'Stage']),
    ),
    dueDate: firstString(
      parsed.dueDate,
      parsed.due_date,
      notionPropertyDate(properties, ['Due', 'Due Date', 'Date']),
    ),
  };
};

export const normalizeNotionWidgetItems = (result: unknown, maxItems = 20): NotionWidgetItem[] => {
  const seen = new Set<string>();
  return collectResultEntries(result)
    .map(normalizeNotionWidgetItem)
    .filter((item): item is NotionWidgetItem => Boolean(item))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, maxItems);
};

export const findEnabledNotionMcpServer = (
  servers = getEnabledGenericMcpServers(),
): GenericMcpServerConfig | null =>
  servers.find((server) => {
    if (!server.enabled) return false;
    if (server.id === 'notion-workspace') return true;
    if (/notion/i.test(server.name || '')) return true;
    try {
      return new URL(server.url).hostname.toLowerCase() === 'mcp.notion.com';
    } catch {
      return false;
    }
  }) || null;

const pickSearchTool = (toolNames: string[]): string | null =>
  toolNames.find((name) => /notion.*search|search.*notion/i.test(name))
  || toolNames.find((name) => /search/i.test(name))
  || null;

const pickFetchTool = (toolNames: string[]): string | null =>
  toolNames.find((name) => /notion.*(?:fetch|read|get)|(?:fetch|read|get).*notion/i.test(name))
  || toolNames.find((name) => /fetch|read|get/i.test(name))
  || null;

export const listNotionWidgetItems = async ({
  kind,
  query,
  maxItems = 20,
}: ListNotionWidgetItemsOptions): Promise<NotionWidgetItem[]> => {
  const server = findEnabledNotionMcpServer();
  if (!server) {
    throw new Error('Connect and enable the Notion MCP server in Accounts & Keys.');
  }

  const prepared = await prepareGenericMcpTools([server]);
  const searchTool = pickSearchTool(prepared.toolNames);
  if (!searchTool) {
    throw new Error('The connected Notion MCP server does not expose a search tool.');
  }

  const result = await prepared.callTool(searchTool, {
    query: (query || DEFAULT_QUERY[kind]).trim(),
    page_size: maxItems,
    limit: maxItems,
  });

  return normalizeNotionWidgetItems(result, maxItems);
};

export const fetchNotionWidgetItem = async (
  item: Pick<NotionWidgetItem, 'id' | 'title'> & Partial<NotionWidgetItem>,
): Promise<NotionWidgetDetail> => {
  const server = findEnabledNotionMcpServer();
  if (!server) {
    throw new Error('Connect and enable the Notion MCP server in Accounts & Keys.');
  }

  const prepared = await prepareGenericMcpTools([server]);
  const fetchTool = pickFetchTool(prepared.toolNames);
  if (!fetchTool) {
    throw new Error('The connected Notion MCP server does not expose a fetch/read tool.');
  }

  const result = await prepared.callTool(fetchTool, {
    id: item.id,
    page_id: item.id,
    url: item.url,
  });
  const [normalized] = normalizeNotionWidgetItems(result, 1);
  const content = collectNotionTextFragments(result)
    .filter((text, index, values) => values.indexOf(text) === index)
    .join('\n')
    .trim();

  return {
    ...item,
    ...normalized,
    id: normalized?.id || item.id,
    title: normalized?.title || item.title,
    url: normalizeExternalNotionUrl(normalized?.url || item.url, normalized?.id || item.id),
    content: content || normalized?.preview || item.preview || item.title,
  };
};
