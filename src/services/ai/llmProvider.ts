import {
  GoogleGenAI,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
  type Part,
} from '@google/genai';

export interface LLMTextInput {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  stream?: boolean;
}

export interface LLMImageInput {
  mimeType: string;
  base64Data: string;
  width?: number;
  height?: number;
}

export interface LLMVisionInput {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  image: LLMImageInput;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
  thoughtSignature?: string;
}

export type LLMChatMessage =
  | {
      role: 'system' | 'user' | 'assistant';
      content: string;
    }
  | {
      role: 'assistant';
      content: string;
      toolCalls: LLMToolCall[];
    }
  | {
      role: 'tool';
      name: string;
      content: string;
      toolCallId?: string;
    };

export interface LLMToolInput {
  messages: LLMChatMessage[];
  tools: LLMToolDefinition[];
  temperature?: number;
  allowNativeSearch?: boolean;
}

export interface LLMToolResponse {
  text: string;
  toolCalls: LLMToolCall[];
}

export type LLMNativeSearchConfig =
  | { type: 'gemini-google-search' }
  | { type: 'openai-web-search' }
  | { type: 'nova-grounding' };

export interface LLMProvider {
  name: string;
  nativeSearch?: LLMNativeSearchConfig;
  maxToolDefinitionTokens?: number;
  maxToolResultChars?: number;
  maxToolResponseTokens?: number;
  maxToolRequestTokens?: number;

  generateText(input: LLMTextInput): Promise<string>;

  streamText?(input: {
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    onToken: (token: string) => void;
  }): Promise<void>;

  generateVisionText?(input: LLMVisionInput): Promise<string>;

  generateToolResponse?(input: LLMToolInput): Promise<LLMToolResponse>;
}

type LLMNativeSearchConfigField = {
  nativeSearch?: LLMNativeSearchConfig;
};

export type LLMProviderConfig =
  | ({
      type: 'ollama';
      baseUrl: string;
      apiKey?: string;
      model: string;
    } & LLMNativeSearchConfigField)
  | ({
      type: 'openai';
      baseUrl: string;
      apiKey?: string;
      model: string;
      openAICompatible?: OpenAICompatibleProviderOptions;
    } & LLMNativeSearchConfigField)
  | ({
      type: 'gemini';
      baseUrl?: string;
      apiKey?: string;
      model: string;
    } & LLMNativeSearchConfigField);

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
export const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = 'https://api.openai.com';

export type OpenAICompatibleAuth =
  | { type: 'bearer'; token: string }
  | { type: 'api-key'; key: string }
  | { type: 'none' };

export interface OpenAICompatibleProviderOptions {
  auth?: OpenAICompatibleAuth;
  nativeSearch?: LLMNativeSearchConfig;
}

type OpenAIMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string }
  | {
      role: 'assistant';
      content: string;
      tool_calls: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    }
  | {
      role: 'tool';
      tool_call_id: string;
      name: string;
      content: string;
    }
  | {
      role: 'user';
      content: Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
    };

type OllamaChatMessage =
  | {
      role: 'system' | 'user' | 'assistant';
      content: string;
      images?: string[];
    }
  | {
      role: 'assistant';
      content: string;
      tool_calls: Array<{
        type: 'function';
        function: {
          name: string;
          arguments: Record<string, unknown>;
        };
      }>;
    }
  | {
      role: 'tool';
      tool_name: string;
      content: string;
    };

const normalizeBaseUrl = (baseUrl: string): string =>
  baseUrl.trim().replace(/\/+$/, '');

const OPENAI_COMPATIBLE_PROXY_HOSTS = new Set([
  'api.nova.amazon.com',
  'api.openai.com',
  'api.anthropic.com',
  'api.groq.com',
  'openrouter.ai',
  'api.mistral.ai',
]);

const canUseOpenAICompatibleProxy = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && OPENAI_COMPATIBLE_PROXY_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
};

const shouldUseOpenAICompatibleProxyFirst = (url: string): boolean => {
  return canUseOpenAICompatibleProxy(url);
};

const getOpenAICompatibleProxyUrl = (url: string): string =>
  `/openai-compatible-proxy?url=${encodeURIComponent(url)}`;

const isFetchNetworkFailure = (error: unknown): boolean =>
  error instanceof TypeError && /fetch|network|load/i.test(error.message);

// Detect mixed-content blocking BEFORE issuing the fetch -- browsers (Safari
// especially) throw an opaque TypeError when an https page tries to reach http.
const assertNotMixedContent = (url: string, label: string): void => {
  if (typeof window === 'undefined') return;
  const pageIsSecure = window.location.protocol === 'https:';
  if (!pageIsSecure) return;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol !== 'http:') return;
  const host = parsed.hostname;
  // Chrome/Edge allow http://localhost and http://127.0.0.1 as "potentially
  // trustworthy" even from https pages. Safari and iOS do not.
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  throw new Error(
    `${label} blocked: cannot reach ${parsed.origin} from an https page.${isLocalhost
      ? ' Safari/iOS blocks http://localhost from https pages. Run the app over http, or front Ollama with https (e.g. ngrok, cloudflared, or a local reverse proxy).'
      : ' Use https for the endpoint or serve the app over http.'}`,
  );
};

const safeFetch = async (
  url: string,
  init: RequestInit,
  label: string,
): Promise<Response> => {
  assertNotMixedContent(url, label);
  const requestUrl = shouldUseOpenAICompatibleProxyFirst(url)
    ? getOpenAICompatibleProxyUrl(url)
    : url;
  try {
    return await fetch(requestUrl, init);
  } catch (err) {
    if (requestUrl === url && isFetchNetworkFailure(err) && canUseOpenAICompatibleProxy(url)) {
      try {
        return await fetch(getOpenAICompatibleProxyUrl(url), init);
      } catch (proxyErr) {
        const proxyMessage = proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
        throw new Error(
          `${label} failed to reach ${url} through Curio's same-origin proxy: ${proxyMessage}.`,
        );
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    // iOS/Safari surface mixed-content + CORS + offline as a bare TypeError.
    throw new Error(
      `${label} failed to reach ${url}: ${message}. ` +
        `Check that the endpoint is reachable and allows CORS from ${window.location.origin}.`,
    );
  }
};

const getOpenAIUrl = (baseUrl: string, path: string): string => {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.endsWith('/v1')) {
    return `${normalized}${path}`;
  }
  return `${normalized}/v1${path}`;
};

const getOpenAICompatibleUrl = (
  baseUrl: string,
  path: string,
): string => {
  return getOpenAIUrl(baseUrl, path);
};

const buildOpenAICompatibleHeaders = async (
  apiKey: string,
  options?: OpenAICompatibleProviderOptions,
  baseHeaders: Record<string, string> = {},
): Promise<Record<string, string>> => {
  const auth = options?.auth ?? { type: 'bearer' as const, token: apiKey };

  if (auth.type === 'api-key') {
    const key = auth.key.trim();
    if (!key) {
      throw new Error('OpenAI-compatible API key is missing. Add the selected provider key in Settings > Voice & AI > Text LLM.');
    }
    return { ...baseHeaders, 'api-key': key };
  }

  if (auth.type === 'bearer') {
    const token = auth.token.trim();
    if (!token) {
      throw new Error('OpenAI-compatible API key is missing. Add the selected provider key in Settings > Voice & AI > Text LLM.');
    }
    return { ...baseHeaders, Authorization: `Bearer ${token}` };
  }

  return baseHeaders;
};

const getOpenAIToolRequestLimits = (
  baseUrl: string,
  model: string,
): Pick<LLMProvider, 'maxToolDefinitionTokens' | 'maxToolResultChars' | 'maxToolResponseTokens' | 'maxToolRequestTokens'> => {
  const normalizedBaseUrl = baseUrl.toLowerCase();
  const normalizedModel = model.toLowerCase();

  if (normalizedBaseUrl.includes('api.groq.com')) {
    return {
      maxToolDefinitionTokens: normalizedModel.includes('gpt-oss-20b') ? 900 : 1800,
      maxToolResultChars: normalizedModel.includes('gpt-oss-20b') ? 3500 : 6000,
      maxToolResponseTokens: normalizedModel.includes('gpt-oss-20b') ? 256 : 512,
      maxToolRequestTokens: normalizedModel.includes('gpt-oss-20b') ? 6500 : 9000,
    };
  }

  return {};
};

const toTemperature = (temperature?: number): number | undefined =>
  Number.isFinite(temperature) ? temperature : undefined;

const getOpenAIWebSearchOptions = (
  nativeSearch?: LLMNativeSearchConfig,
): Record<string, unknown> | undefined =>
  nativeSearch?.type === 'openai-web-search'
    ? { search_context_size: 'medium' }
    : undefined;

const getOpenAICompatibleNativeSearchFields = (
  nativeSearch?: LLMNativeSearchConfig,
): Record<string, unknown> => {
  const openAIWebSearchOptions = getOpenAIWebSearchOptions(nativeSearch);
  if (openAIWebSearchOptions) {
    return { web_search_options: openAIWebSearchOptions };
  }

  if (nativeSearch?.type === 'nova-grounding') {
    return { system_tools: ['nova_grounding'] };
  }

  return {};
};

const OPENAI_SCHEMA_TYPE_MAP: Record<string, string | null> = {
  TYPE_UNSPECIFIED: null,
  STRING: 'string',
  NUMBER: 'number',
  INTEGER: 'integer',
  BOOLEAN: 'boolean',
  ARRAY: 'array',
  OBJECT: 'object',
  NULL: 'null',
};

const VALID_JSON_SCHEMA_TYPES: ReadonlySet<string> = new Set([
  'array',
  'boolean',
  'integer',
  'null',
  'number',
  'object',
  'string',
]);

const normalizeOpenAISchemaType = (type: unknown): string | null => {
  if (typeof type !== 'string') {
    return null;
  }

  const mapped = Object.prototype.hasOwnProperty.call(OPENAI_SCHEMA_TYPE_MAP, type)
    ? OPENAI_SCHEMA_TYPE_MAP[type]
    : type.toLowerCase();

  if (!mapped || !VALID_JSON_SCHEMA_TYPES.has(mapped)) {
    return null;
  }

  return mapped;
};

const isOpenAISchemaTypeKeywordValue = (value: unknown): boolean =>
  typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'));

const normalizeOpenAIToolSchemaValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeOpenAIToolSchemaValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  const rawType = record.type;
  const hasSchemaTypeKeyword = isOpenAISchemaTypeKeywordValue(rawType);

  for (const [key, nestedValue] of Object.entries(record)) {
    if (key === 'type' && hasSchemaTypeKeyword) {
      continue;
    }
    normalized[key] = normalizeOpenAIToolSchemaValue(nestedValue);
  }

  if (hasSchemaTypeKeyword && Array.isArray(rawType)) {
    const types = Array.from(new Set<string>(
      rawType
        .map(normalizeOpenAISchemaType)
        .filter((type): type is string => Boolean(type)),
    ));
    if (types.length === 1) {
      normalized.type = types[0];
    } else if (types.length > 1) {
      normalized.anyOf = types.map((type) => ({ type }));
    }
    return normalized;
  }

  if (hasSchemaTypeKeyword) {
    const type = normalizeOpenAISchemaType(rawType);
    if (type) {
      normalized.type = type;
    }
  }

  return normalized;
};

const normalizeOpenAIToolParameters = (parameters: Record<string, unknown>): Record<string, unknown> => {
  const normalized = normalizeOpenAIToolSchemaValue(parameters);
  return normalized && typeof normalized === 'object' && !Array.isArray(normalized)
    ? normalized as Record<string, unknown>
    : { type: 'object', properties: {} };
};

const REASONING_TAG_NAMES = String.raw`think|thinking|reasoning|analysis|scratchpad|chain[-_\s]*of[-_\s]*thought`;
const REASONING_TAG_BLOCK_RE = new RegExp(
  String.raw`<\s*(?:${REASONING_TAG_NAMES})\b[^>]*>[\s\S]*?<\s*\/\s*(?:${REASONING_TAG_NAMES})\s*>`,
  'gi',
);
const UNCLOSED_REASONING_TAG_RE = new RegExp(
  String.raw`<\s*(?:${REASONING_TAG_NAMES})\b[^>]*>[\s\S]*$`,
  'gi',
);
const RESIDUAL_REASONING_TAG_RE = new RegExp(
  String.raw`<\s*\/?\s*(?:${REASONING_TAG_NAMES})\b[^>]*>`,
  'gi',
);
const REASONING_FENCE_RE = new RegExp(
  String.raw`${'```'}[ \t]*(?:${REASONING_TAG_NAMES})[^\n]*\n[\s\S]*?${'```'}`,
  'gi',
);
const REASONING_BRACKET_BLOCK_RE = new RegExp(
  String.raw`\[\s*(?:${REASONING_TAG_NAMES}|internal)\s*\][\s\S]*?\[\s*\/\s*(?:${REASONING_TAG_NAMES}|internal)\s*\]`,
  'gi',
);
const FINAL_INLINE_LABEL_RE = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:final(?: answer)?|answer|response)\s*:\s*/gi;
const FINAL_HEADING_LABEL_RE = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:final(?: answer)?|answer|response)\s*(?:\n|$)/gi;
const LEADING_FINAL_LABEL_RE = /^\s*(?:#{1,6}\s*)?(?:final(?: answer)?|answer|response)\s*:\s*/i;
const FINAL_HEADING_LINE_RE = /^\s*(?:#{1,6}\s*)?(?:final(?: answer)?|answer|response)\s*$/i;
const HIDDEN_LINE_LABEL_RE = /^\s*(?:thought(?: process)?|reasoning|analysis|chain[-_\s]*of[-_\s]*thought|scratchpad|internal(?: notes?)?|tool(?: choice| selection)?|plan)\s*:/i;
const HIDDEN_HEADING_LINE_RE = /^\s*(?:#{1,6}\s*)?(?:thought(?: process)?|reasoning|analysis|chain[-_\s]*of[-_\s]*thought|scratchpad|internal(?: notes?)?|tool(?: choice| selection)?|plan)\s*$/i;
const DISCARD_INTERNAL_LINE_RE = /^\s*(?:i need to|i should|we need to|let'?s|i will)\b.*\b(?:tool|call|reason|think|analy[sz]e|respond|answer)\b/i;

const findLastFinalBoundary = (text: string): number | null => {
  const boundaries = [
    ...Array.from(text.matchAll(FINAL_INLINE_LABEL_RE), (match) => (match.index ?? 0) + match[0].length),
    ...Array.from(text.matchAll(FINAL_HEADING_LABEL_RE), (match) => (match.index ?? 0) + match[0].length),
  ];

  if (boundaries.length === 0) {
    return null;
  }

  return Math.max(...boundaries);
};

export const sanitizeLLMVisibleText = (raw: string): string => {
  if (!raw.trim()) {
    return '';
  }

  let text = raw.replace(/\r\n?/g, '\n');

  for (let pass = 0; pass < 3; pass += 1) {
    text = text
      .replace(REASONING_FENCE_RE, '\n')
      .replace(REASONING_BRACKET_BLOCK_RE, '\n')
      .replace(REASONING_TAG_BLOCK_RE, '\n');
  }

  const finalBoundary = findLastFinalBoundary(text);
  if (finalBoundary !== null) {
    text = text.slice(finalBoundary);
  } else {
    text = text.replace(UNCLOSED_REASONING_TAG_RE, '\n');
  }

  const filteredLines: string[] = [];
  let skippingHiddenBlock = false;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed) {
      skippingHiddenBlock = false;
      if (filteredLines.length > 0 && filteredLines[filteredLines.length - 1] !== '') {
        filteredLines.push('');
      }
      continue;
    }

    if (FINAL_HEADING_LINE_RE.test(trimmed)) {
      skippingHiddenBlock = false;
      continue;
    }

    if (LEADING_FINAL_LABEL_RE.test(trimmed)) {
      skippingHiddenBlock = false;
      filteredLines.push(trimmed.replace(LEADING_FINAL_LABEL_RE, ''));
      continue;
    }

    if (HIDDEN_LINE_LABEL_RE.test(trimmed) || HIDDEN_HEADING_LINE_RE.test(trimmed)) {
      skippingHiddenBlock = true;
      continue;
    }

    if (skippingHiddenBlock || DISCARD_INTERNAL_LINE_RE.test(trimmed)) {
      continue;
    }

    filteredLines.push(line);
  }

  return filteredLines
    .join('\n')
    .replace(RESIDUAL_REASONING_TAG_RE, '')
    .replace(LEADING_FINAL_LABEL_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const STREAM_CONTROL_LABELS = [
  'thought',
  'thought process',
  'reasoning',
  'analysis',
  'chain of thought',
  'scratchpad',
  'internal',
  'plan',
  'final',
  'final answer',
  'answer',
  'response',
];

const shouldHoldPotentialControlPrefix = (raw: string): boolean => {
  const trimmed = raw.trimStart().toLowerCase();
  if (!trimmed) {
    return false;
  }

  if ('```'.startsWith(trimmed) || /^<\s*\/?\s*[a-z_-]*$/.test(trimmed)) {
    return true;
  }

  if (/^#{1,6}\s*(?:[a-z][a-z\s-]*)?$/.test(trimmed)) {
    return true;
  }

  return STREAM_CONTROL_LABELS.some((label) => label.startsWith(trimmed));
};

const createVisibleTextStreamFilter = (onToken: (token: string) => void) => {
  let rawOutput = '';
  let emittedVisible = '';

  return (token: string) => {
    rawOutput += token;
    const visibleOutput = sanitizeLLMVisibleText(rawOutput);

    if (shouldHoldPotentialControlPrefix(rawOutput)) {
      return;
    }

    if (!visibleOutput.startsWith(emittedVisible)) {
      emittedVisible = visibleOutput;
      return;
    }

    const delta = visibleOutput.slice(emittedVisible.length);
    if (delta) {
      onToken(delta);
      emittedVisible = visibleOutput;
    }
  };
};

const readErrorBody = async (response: Response): Promise<string> => {
  try {
    const text = await response.text();
    return text.trim() || response.statusText || `HTTP ${response.status}`;
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
};

const OPENAI_COMPATIBLE_RATE_LIMIT_RETRIES = 2;
const OPENAI_COMPATIBLE_RATE_LIMIT_RETRY_FALLBACK_MS = 1_000;
const OPENAI_COMPATIBLE_RATE_LIMIT_RETRY_CAP_MS = 15_000;

const waitForRetryDelay = async (delayMs: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
};

const parseRetryAfterHeaderMs = (value: string | null): number | null => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const retryAt = Date.parse(trimmed);
  if (Number.isFinite(retryAt)) {
    return Math.max(0, retryAt - Date.now());
  }

  return null;
};

const parseRateLimitRetryDelayMs = (response: Response, errorBody: string): number | null => {
  const retryAfterMs = parseRetryAfterHeaderMs(response.headers?.get?.('retry-after') ?? null);
  if (retryAfterMs !== null) {
    return retryAfterMs;
  }

  const bodyMatch = errorBody.match(/(?:try again in|retry(?:\s|-)?after)\s+([\d.]+)\s*(ms|milliseconds?|s|sec|secs|seconds?)?/i);
  if (!bodyMatch) {
    return null;
  }

  const amount = Number(bodyMatch[1]);
  if (!Number.isFinite(amount)) {
    return null;
  }

  const unit = bodyMatch[2]?.toLowerCase() || 's';
  return unit.startsWith('ms') || unit.startsWith('millisecond')
    ? Math.max(0, amount)
    : Math.max(0, amount * 1000);
};

const clampRateLimitRetryDelayMs = (delayMs: number | null): number =>
  Math.min(
    OPENAI_COMPATIBLE_RATE_LIMIT_RETRY_CAP_MS,
    Math.max(0, Math.ceil(delayMs ?? OPENAI_COMPATIBLE_RATE_LIMIT_RETRY_FALLBACK_MS)),
  );

const assertOk = async (response: Response, label: string): Promise<void> => {
  if (response.ok) {
    return;
  }

  const errorBody = await readErrorBody(response);
  throw new Error(`${label} failed (${response.status}): ${errorBody}`);
};

const extractOpenAIContent = (content: unknown): string => {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') {
          return '';
        }

        if ((part as { type?: string }).type === 'text') {
          const textValue = (part as { text?: unknown }).text;
          return typeof textValue === 'string' ? textValue : '';
        }

        return '';
      })
      .join('');
  }

  return '';
};

const buildOpenAIMessages = (
  prompt: string,
  systemPrompt?: string,
  image?: LLMImageInput,
): OpenAIMessage[] => {
  const messages: OpenAIMessage[] = [];

  if (systemPrompt?.trim()) {
    messages.push({ role: 'system', content: systemPrompt.trim() });
  }

  if (image) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:${image.mimeType};base64,${image.base64Data}`,
          },
        },
      ],
    });
  } else {
    messages.push({ role: 'user', content: prompt });
  }

  return messages;
};

const parseJsonRecord = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  if (typeof raw !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const normalizeToolCallId = (toolCall: LLMToolCall, index: number): string =>
  toolCall.id?.trim() || `tool_call_${index}`;

const buildOpenAIToolMessages = (messages: LLMChatMessage[]): OpenAIMessage[] =>
  messages.map((message) => {
    if (message.role === 'tool') {
      const toolName = message.name.trim() || message.toolCallId?.trim() || 'tool';
      return {
        role: 'tool',
        tool_call_id: message.toolCallId?.trim() || toolName,
        // Harmony-backed OpenAI-compatible providers need the tool author name.
        name: toolName,
        content: message.content,
      };
    }

    if ('toolCalls' in message && Array.isArray(message.toolCalls)) {
      return {
        role: 'assistant',
        content: message.content,
        tool_calls: message.toolCalls.map((toolCall, index) => ({
          id: normalizeToolCallId(toolCall, index),
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.arguments ?? {}),
          },
        })),
      };
    }

    if (message.role === 'assistant') {
      return {
        role: 'assistant',
        content: message.content,
      };
    }

    return {
      role: message.role,
      content: message.content,
    };
  });

const buildOllamaToolMessages = (messages: LLMChatMessage[]): OllamaChatMessage[] =>
  messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_name: message.name,
        content: message.content,
      };
    }

    if ('toolCalls' in message && Array.isArray(message.toolCalls)) {
      return {
        role: 'assistant',
        content: message.content,
        tool_calls: message.toolCalls.map((toolCall) => ({
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: toolCall.arguments ?? {},
          },
        })),
      };
    }

    if (message.role === 'assistant') {
      return {
        role: 'assistant',
        content: message.content,
      };
    }

    return {
      role: message.role,
      content: message.content,
    };
  });

const extractOpenAIToolResponse = (data: any): LLMToolResponse => {
  const message = data?.choices?.[0]?.message;
  const rawToolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];

  return {
    text: sanitizeLLMVisibleText(extractOpenAIContent(message?.content)),
    toolCalls: rawToolCalls.map((toolCall: any, index: number) => ({
      id: typeof toolCall?.id === 'string' ? toolCall.id : `tool_call_${index}`,
      name: String(toolCall?.function?.name || ''),
      arguments: parseJsonRecord(toolCall?.function?.arguments),
    })).filter((toolCall: LLMToolCall) => toolCall.name.length > 0),
  };
};

const extractOllamaToolResponse = (data: any): LLMToolResponse => {
  const message = data?.message;
  const rawToolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];

  return {
    text: sanitizeLLMVisibleText(typeof message?.content === 'string' ? message.content : ''),
    toolCalls: rawToolCalls.map((toolCall: any, index: number) => ({
      id: typeof toolCall?.id === 'string' ? toolCall.id : `tool_call_${index}`,
      name: String(toolCall?.function?.name || ''),
      arguments: parseJsonRecord(toolCall?.function?.arguments),
    })).filter((toolCall: LLMToolCall) => toolCall.name.length > 0),
  };
};

const forEachTextLine = async (
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
): Promise<void> => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          onLine(line);
        }
        newlineIndex = buffer.indexOf('\n');
      }
    }

    const trailing = `${buffer}${decoder.decode()}`.trim();
    if (trailing) {
      onLine(trailing);
    }
  } finally {
    reader.releaseLock();
  }
};

export class OpenAICompatibleProvider implements LLMProvider {
  public readonly name = 'openai-compatible';
  public readonly nativeSearch?: LLMNativeSearchConfig;
  public readonly maxToolDefinitionTokens?: number;
  public readonly maxToolResultChars?: number;
  public readonly maxToolResponseTokens?: number;
  public readonly maxToolRequestTokens?: number;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly options: OpenAICompatibleProviderOptions = {},
  ) {
    this.nativeSearch = options.nativeSearch;
    const limits = getOpenAIToolRequestLimits(baseUrl, model);
    this.maxToolDefinitionTokens = limits.maxToolDefinitionTokens;
    this.maxToolResultChars = limits.maxToolResultChars;
    this.maxToolResponseTokens = limits.maxToolResponseTokens;
    this.maxToolRequestTokens = limits.maxToolRequestTokens;
  }

  private getUrl(path: string): string {
    return getOpenAICompatibleUrl(this.baseUrl, path);
  }

  private async createJsonRequestInit(
    method: 'POST' | 'GET',
    body?: Record<string, unknown>,
  ): Promise<RequestInit> {
    const serializedBody = body ? JSON.stringify(body) : '';
    const baseHeaders: Record<string, string> = body
      ? { 'Content-Type': 'application/json' }
      : {};
    const headers = await buildOpenAICompatibleHeaders(
      this.apiKey,
      this.options,
      baseHeaders,
    );

    return {
      method,
      headers,
      ...(body ? { body: serializedBody } : {}),
    };
  }

  private withModel(payload: Record<string, unknown>): Record<string, unknown> {
    return { model: this.model, ...payload };
  }

  private async fetchJsonWithRateLimitRetry(
    path: string,
    payload: Record<string, unknown>,
    label: string,
  ): Promise<Response> {
    const url = this.getUrl(path);

    for (let attempt = 0; attempt <= OPENAI_COMPATIBLE_RATE_LIMIT_RETRIES; attempt += 1) {
      const response = await safeFetch(
        url,
        await this.createJsonRequestInit('POST', payload),
        label,
      );

      if (response.ok) {
        return response;
      }

      const errorBody = await readErrorBody(response);
      if (response.status === 429 && attempt < OPENAI_COMPATIBLE_RATE_LIMIT_RETRIES) {
        const delayMs = clampRateLimitRetryDelayMs(parseRateLimitRetryDelayMs(response, errorBody));
        await waitForRetryDelay(delayMs);
        continue;
      }

      throw new Error(`${label} failed (${response.status}): ${errorBody}`);
    }

    throw new Error(`${label} failed: rate limit retry exhausted`);
  }

  async generateText({
    prompt,
    systemPrompt,
    temperature,
    stream,
  }: LLMTextInput): Promise<string> {
    if (stream) {
      let output = '';
      await this.streamText?.({
        prompt,
        systemPrompt,
        temperature,
        onToken: (token) => {
          output += token;
        },
      });
      return sanitizeLLMVisibleText(output);
    }

    const url = this.getUrl('/chat/completions');
    const response = await safeFetch(
      url,
      await this.createJsonRequestInit(
        'POST',
        this.withModel({
          temperature: toTemperature(temperature),
          stream: false,
          messages: buildOpenAIMessages(prompt, systemPrompt),
          ...getOpenAICompatibleNativeSearchFields(this.nativeSearch),
        }),
      ),
      'OpenAI-compatible request',
    );

    await assertOk(response, 'OpenAI-compatible request');

    const data = await response.json();
    return sanitizeLLMVisibleText(extractOpenAIContent(data?.choices?.[0]?.message?.content));
  }

  async streamText({
    prompt,
    systemPrompt,
    temperature,
    onToken,
  }: {
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    onToken: (token: string) => void;
  }): Promise<void> {
    const url = this.getUrl('/chat/completions');
    const response = await safeFetch(
      url,
      await this.createJsonRequestInit(
        'POST',
        this.withModel({
          temperature: toTemperature(temperature),
          stream: true,
          messages: buildOpenAIMessages(prompt, systemPrompt),
          ...getOpenAICompatibleNativeSearchFields(this.nativeSearch),
        }),
      ),
      'OpenAI-compatible stream',
    );

    await assertOk(response, 'OpenAI-compatible stream');

    if (!response.body) {
      throw new Error('OpenAI-compatible stream did not return a readable body.');
    }

    const emitVisibleToken = createVisibleTextStreamFilter(onToken);

    await forEachTextLine(response.body, (line) => {
      if (!line.startsWith('data:')) {
        return;
      }

      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') {
        return;
      }

      const chunk = JSON.parse(payload);
      const token = chunk?.choices?.[0]?.delta?.content;
      if (typeof token === 'string' && token.length > 0) {
        emitVisibleToken(token);
      }
    });
  }

  async generateVisionText({
    prompt,
    systemPrompt,
    temperature,
    image,
  }: LLMVisionInput): Promise<string> {
    const url = this.getUrl('/chat/completions');
    const response = await safeFetch(
      url,
      await this.createJsonRequestInit(
        'POST',
        this.withModel({
          temperature: toTemperature(temperature),
          stream: false,
          messages: buildOpenAIMessages(prompt, systemPrompt, image),
          ...getOpenAICompatibleNativeSearchFields(this.nativeSearch),
        }),
      ),
      'OpenAI-compatible vision request',
    );

    await assertOk(response, 'OpenAI-compatible vision request');

    const data = await response.json();
    return sanitizeLLMVisibleText(extractOpenAIContent(data?.choices?.[0]?.message?.content));
  }

  async generateToolResponse({
    messages,
    tools,
    temperature,
    allowNativeSearch = true,
  }: LLMToolInput): Promise<LLMToolResponse> {
    const openAITools = tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: normalizeOpenAIToolParameters(tool.parameters),
      },
    }));

    const response = await this.fetchJsonWithRateLimitRetry(
      '/chat/completions',
      this.withModel({
        temperature: toTemperature(temperature),
        stream: false,
        messages: buildOpenAIToolMessages(messages),
        ...(allowNativeSearch ? getOpenAICompatibleNativeSearchFields(this.nativeSearch) : {}),
        ...(openAITools.length > 0 ? {
          tools: openAITools,
          tool_choice: 'auto',
        } : {}),
        ...(this.maxToolResponseTokens ? { max_tokens: this.maxToolResponseTokens } : {}),
      }),
      'OpenAI-compatible tool request',
    );

    const data = await response.json();
    return extractOpenAIToolResponse(data);
  }
}

const buildGeminiConfig = (
  systemInstruction?: string,
  temperature?: number,
  tools?: LLMToolDefinition[],
  nativeSearch?: LLMNativeSearchConfig,
): Record<string, unknown> | undefined => {
  const config: Record<string, unknown> = {};
  if (systemInstruction?.trim()) {
    config.systemInstruction = systemInstruction.trim();
  }
  const normalizedTemperature = toTemperature(temperature);
  if (normalizedTemperature !== undefined) {
    config.temperature = normalizedTemperature;
  }
  const toolConfig: Record<string, unknown>[] = [];
  if (nativeSearch?.type === 'gemini-google-search') {
    toolConfig.push({ googleSearch: {} });
  }
  if (tools && tools.length > 0) {
    toolConfig.push({
      functionDeclarations: tools.map((tool): FunctionDeclaration => ({
        name: tool.name,
        description: tool.description,
        parameters: normalizeOpenAIToolParameters(tool.parameters) as FunctionDeclaration['parameters'],
      })),
    });
  }
  if (toolConfig.length > 0) {
    config.tools = toolConfig;
  }
  return Object.keys(config).length > 0 ? config : undefined;
};

const parseGeminiFunctionResponseContent = (content: string): Record<string, unknown> => {
  const trimmed = content.trim();
  if (!trimmed) {
    return { output: null };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { output: parsed };
  } catch {
    return { output: content };
  }
};

const buildGeminiToolContents = (messages: LLMChatMessage[]): Content[] =>
  messages
    .filter((message) => message.role !== 'system')
    .map((message): Content => {
      if (message.role === 'tool') {
        return {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: message.toolCallId,
                name: message.name,
                response: parseGeminiFunctionResponseContent(message.content),
              },
            } as Part,
          ],
        };
      }

      if ('toolCalls' in message) {
        const parts: Part[] = [
          ...(message.content.trim() ? [{ text: message.content }] as Part[] : []),
          ...message.toolCalls.map((toolCall): Part => {
            const part: Part = {
              functionCall: {
                id: toolCall.id,
                name: toolCall.name,
                args: toolCall.arguments,
              },
            };

            if (toolCall.thoughtSignature) {
              part.thoughtSignature = toolCall.thoughtSignature;
            }

            return part;
          }),
        ];

        return {
          role: 'model',
          parts: parts.length > 0 ? parts : [{ text: '' }],
        };
      }

      return {
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      };
    });

const getGeminiSystemInstruction = (messages: LLMChatMessage[]): string =>
  messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n');

type GeminiToolResponseData = {
  text?: string;
  functionCalls?: FunctionCall[];
  candidates?: Array<{
    content?: {
      parts?: Part[];
    };
  }>;
};

const getGeminiFunctionCallParts = (data: GeminiToolResponseData): Part[] =>
  (data.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .filter((part) => Boolean(part.functionCall));

const getGeminiThoughtSignatureForCall = (
  functionCallParts: Part[],
  toolCall: FunctionCall,
  index: number,
): string | undefined => {
  const matchingPart = typeof toolCall.id === 'string'
    ? functionCallParts.find((part) => part.functionCall?.id === toolCall.id)
    : undefined;
  const fallbackPart = matchingPart || functionCallParts[index];
  const signature = fallbackPart?.thoughtSignature;
  return typeof signature === 'string' && signature.length > 0 ? signature : undefined;
};

const extractGeminiToolResponse = (data: GeminiToolResponseData): LLMToolResponse => {
  const rawToolCalls = Array.isArray(data.functionCalls) ? data.functionCalls : [];
  const functionCallParts = getGeminiFunctionCallParts(data);

  return {
    text: sanitizeLLMVisibleText(data.text || ''),
    toolCalls: rawToolCalls.map((toolCall, index) => {
      const thoughtSignature = getGeminiThoughtSignatureForCall(functionCallParts, toolCall, index);
      return {
        id: typeof toolCall.id === 'string' ? toolCall.id : `tool_call_${index}`,
        name: String(toolCall.name || ''),
        arguments: toolCall.args && typeof toolCall.args === 'object'
          ? toolCall.args
          : {},
        ...(thoughtSignature ? { thoughtSignature } : {}),
      };
    }).filter((toolCall) => toolCall.name.length > 0),
  };
};

export class GeminiProvider implements LLMProvider {
  public readonly name = 'gemini';
  public readonly nativeSearch?: LLMNativeSearchConfig;
  public readonly maxToolDefinitionTokens = 1800;
  public readonly maxToolResultChars = 6000;
  public readonly maxToolResponseTokens = 512;
  public readonly maxToolRequestTokens = 9000;
  private readonly client: GoogleGenAI;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    nativeSearch?: LLMNativeSearchConfig,
  ) {
    this.nativeSearch = nativeSearch;
    this.client = new GoogleGenAI({ apiKey: apiKey.trim() });
  }

  private assertApiKey(): void {
    if (!this.apiKey.trim()) {
      throw new Error('Gemini API key is missing. Add it in Settings > Voice & AI > Gemini.');
    }
  }

  async generateText({
    prompt,
    systemPrompt,
    temperature,
  }: LLMTextInput): Promise<string> {
    this.assertApiKey();
    const config = buildGeminiConfig(systemPrompt, temperature, undefined, this.nativeSearch);
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
      ...(config ? { config } : {}),
    });

    return sanitizeLLMVisibleText(response.text || '');
  }

  async generateVisionText({
    prompt,
    systemPrompt,
    temperature,
    image,
  }: LLMVisionInput): Promise<string> {
    this.assertApiKey();
    const config = buildGeminiConfig(systemPrompt, temperature, undefined, this.nativeSearch);
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: image.mimeType,
                data: image.base64Data,
              },
            },
          ],
        },
      ],
      ...(config ? { config } : {}),
    });

    return sanitizeLLMVisibleText(response.text || '');
  }

  async generateToolResponse({
    messages,
    tools,
    temperature,
    allowNativeSearch = true,
  }: LLMToolInput): Promise<LLMToolResponse> {
    this.assertApiKey();
    const config = buildGeminiConfig(
      getGeminiSystemInstruction(messages),
      temperature,
      tools,
      allowNativeSearch ? this.nativeSearch : undefined,
    );
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: buildGeminiToolContents(messages),
      ...(config ? { config } : {}),
    });

    return extractGeminiToolResponse(response);
  }
}

export class OllamaProvider implements LLMProvider {
  public readonly name = 'ollama';

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async generateText({
    prompt,
    systemPrompt,
    temperature,
    stream,
  }: LLMTextInput): Promise<string> {
    if (stream) {
      let output = '';
      await this.streamText?.({
        prompt,
        systemPrompt,
        temperature,
        onToken: (token) => {
          output += token;
        },
      });
      return sanitizeLLMVisibleText(output);
    }

    const response = await safeFetch(
      `${normalizeBaseUrl(this.baseUrl)}/api/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          system: systemPrompt,
          stream: false,
          options: {
            temperature: toTemperature(temperature),
          },
        }),
      },
      'Ollama request',
    );

    await assertOk(response, 'Ollama request');

    const data = await response.json();
    return sanitizeLLMVisibleText(typeof data?.response === 'string' ? data.response : '');
  }

  async streamText({
    prompt,
    systemPrompt,
    temperature,
    onToken,
  }: {
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    onToken: (token: string) => void;
  }): Promise<void> {
    const response = await safeFetch(
      `${normalizeBaseUrl(this.baseUrl)}/api/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          system: systemPrompt,
          stream: true,
          options: {
            temperature: toTemperature(temperature),
          },
        }),
      },
      'Ollama stream',
    );

    await assertOk(response, 'Ollama stream');

    if (!response.body) {
      throw new Error('Ollama stream did not return a readable body.');
    }

    const emitVisibleToken = createVisibleTextStreamFilter(onToken);

    await forEachTextLine(response.body, (line) => {
      const chunk = JSON.parse(line);
      const token = chunk?.response;
      if (typeof token === 'string' && token.length > 0) {
        emitVisibleToken(token);
      }
    });
  }

  async generateVisionText({
    prompt,
    systemPrompt,
    temperature,
    image,
  }: LLMVisionInput): Promise<string> {
    const response = await safeFetch(
      `${normalizeBaseUrl(this.baseUrl)}/api/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          system: systemPrompt,
          images: [image.base64Data],
          stream: false,
          options: {
            temperature: toTemperature(temperature),
          },
        }),
      },
      'Ollama vision request',
    );

    await assertOk(response, 'Ollama vision request');

    const data = await response.json();
    return sanitizeLLMVisibleText(typeof data?.response === 'string' ? data.response : '');
  }

  async generateToolResponse({
    messages,
    tools,
    temperature,
  }: LLMToolInput): Promise<LLMToolResponse> {
    const ollamaTools = tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: normalizeOpenAIToolParameters(tool.parameters),
      },
    }));

    const response = await safeFetch(
      `${normalizeBaseUrl(this.baseUrl)}/api/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          messages: buildOllamaToolMessages(messages),
          ...(ollamaTools.length > 0 ? { tools: ollamaTools } : {}),
          options: {
            temperature: toTemperature(temperature),
          },
        }),
      },
      'Ollama tool request',
    );

    await assertOk(response, 'Ollama tool request');

    const data = await response.json();
    return extractOllamaToolResponse(data);
  }
}

export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  if (config.type === 'ollama') {
    return new OllamaProvider(config.baseUrl, config.model);
  }

  if (config.type === 'gemini') {
    return new GeminiProvider(config.apiKey || '', config.model, config.nativeSearch);
  }

  return new OpenAICompatibleProvider(
    config.baseUrl,
    config.apiKey || '',
    config.model,
    {
      ...(config.openAICompatible || {}),
      ...(config.nativeSearch ? { nativeSearch: config.nativeSearch } : {}),
    },
  );
}

export async function fetchAvailableModels(
  baseUrl: string,
  type: 'ollama' | 'openai' | 'gemini',
  apiKey?: string,
  options: OpenAICompatibleProviderOptions = {},
): Promise<string[]> {
  const normalized = normalizeBaseUrl(baseUrl);

  if (type === 'gemini') {
    return ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'];
  }

  if (type === 'ollama') {
    const response = await safeFetch(`${normalized}/api/tags`, {}, 'Ollama models fetch');
    await assertOk(response, 'Ollama models fetch');
    const data = await response.json();
    if (Array.isArray(data?.models)) {
      return data.models.map((m: any) => m.name);
    }
    return [];
  }

  const url = getOpenAICompatibleUrl(baseUrl, '/models');
  const headers = await buildOpenAICompatibleHeaders(
    apiKey || '',
    options,
  );
  const response = await safeFetch(url, { headers }, 'OpenAI-compatible models fetch');
  await assertOk(response, 'OpenAI-compatible models fetch');
  const data = await response.json();
  if (Array.isArray(data?.data)) {
    return data.data.map((m: any) => m.id);
  }
  return [];
}
