import type { FunctionDeclaration } from '@google/genai';

import { getToolHandler, type ToolCallContext } from '../toolCallRouter';

import { captureSingleCameraFrame, type CameraSnapshotDependencies } from './cameraVision';
import type {
  LLMChatMessage,
  LLMProvider,
  LLMToolCall,
  LLMToolDefinition,
} from './llmProvider';
import { sanitizeLLMVisibleText } from './llmProvider';
import {
  CUSTOM_CAMERA_TOOL_NAME,
  buildCustomLLMToolDefinitions,
} from './toolSchema';

export interface RunLLMToolAgentInput {
  provider: LLMProvider;
  prompt: string;
  systemPrompt?: string;
  sessionMessages?: LLMChatMessage[];
  onSessionMessagesChange?: (messages: LLMChatMessage[]) => void;
  maxSessionMessages?: number;
  persistSystemPromptInSession?: boolean;
  temperature?: number;
  mcpTools?: FunctionDeclaration[];
  context: ToolCallContext;
  maxRounds?: number;
  cameraDependencies?: CameraSnapshotDependencies;
  toolDefinitions?: LLMToolDefinition[];
}

const DEFAULT_MAX_TOOL_ROUNDS = 6;
const DEFAULT_MAX_SESSION_MESSAGES = 10;
const DEFAULT_MAX_TOOL_DEFINITION_TOKENS = 2200;
const RECENT_TOOL_SELECTION_MESSAGE_LIMIT = 4;
const RECENT_TOOL_NAME_LIMIT = 6;
const RECENT_TOOL_SELECTION_BONUS = 22;
const APPROX_CHARS_PER_TOKEN = 4;
const REQUEST_BUDGET_PADDING_TOKENS = 24;
const MIN_COMPACTED_TOOL_RESULT_CHARS = 400;
const MAX_RESULT_SUFFIX = '\n\n[Result truncated to fit the selected LLM provider request budget.]';
const TOOL_BLOCKED_RESPONSE_RE = /\b(?:(?:can't|cannot|unable to|not able to)\s+(?:access|use|call|control|connect|reach|check|retrieve|open|turn|set|create|send|fetch)|(?:don't|do not)\s+(?:have|have access to|have permission to|have the ability to|see|control|access|use)|no access|without access|not connected|not available|no tool)\b/i;

const PROMPT_STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'could',
  'from',
  'have',
  'just',
  'please',
  'show',
  'tell',
  'that',
  'this',
  'what',
  'when',
  'where',
  'with',
  'would',
  'your',
]);

const COMMON_TOOL_PRIORITY = new Map<string, number>([
  ['get_weather', 18],
  ['setTimer', 16],
  ['cancelTimer', 14],
  ['setReminder', 15],
  ['getMyReminders', 12],
  ['get_calendar_events', 14],
  ['saveNote', 12],
  ['getMyNotes', 10],
  ['deleteNote', 12],
  ['updateNote', 12],
  ['play_music', 12],
  ['play_youtube_video', 10],
  ['show_calculation', 10],
  ['show_definition', 10],
  ['show_translation', 10],
  ['search_places', 9],
  ['get_directions', 9],
  ['run_routine', 8],
  ['list_routines', 8],
  ['show_home_status', 8],
]);

const CAMERA_TERMS = new Set([
  'camera',
  'holding',
  'look',
  'photo',
  'picture',
  'see',
  'visible',
  'vision',
]);

const LIVE_LOOKUP_TERMS = new Set([
  'current',
  'latest',
  'live',
  'news',
  'recent',
  'today',
  'tonight',
  'score',
  'scores',
  'result',
  'results',
  'forecast',
  'price',
]);

const SPORTS_RESULT_TERMS = new Set([
  'beat',
  'defeat',
  'defeated',
  'football',
  'game',
  'games',
  'league',
  'lead',
  'leading',
  'losing',
  'match',
  'matches',
  'nba',
  'nfl',
  'nhl',
  'mlb',
  'premier',
  'result',
  'results',
  'score',
  'scores',
  'soccer',
  'sport',
  'sports',
  'team',
  'win',
  'winning',
  'won',
]);

const SERVICE_BRAND_TERMS = new Set([
  'cloudflare',
  'context7',
  'exa',
  'firecrawl',
  'fred',
  'github',
  'jina',
  'linear',
  'notion',
  'pubmed',
  'sentry',
  'slack',
  'stripe',
  'zapier',
]);

/** Maps domain topic terms to MCP brand names so tools score higher when the
 *  user asks about a topic without explicitly naming the service. */
const MCP_DOMAIN_TERMS = new Map<string, string[]>([
  ['earthquake', ['usgs', 'olyport']],
  ['seismic', ['usgs', 'olyport']],
  ['tremor', ['usgs', 'olyport']],
  ['wildfire', ['nifc', 'olyport']],
  ['inflation', ['fred', 'olyport']],
  ['gdp', ['fred', 'olyport']],
  ['economic', ['fred', 'olyport']],
  ['interest rate', ['fred', 'olyport']],
  ['electricity', ['eia', 'olyport']],
  ['energy', ['eia', 'olyport']],
  ['fuel', ['eia', 'olyport']],
  ['renewable', ['eia', 'olyport']],
  ['pollutant', ['epa', 'olyport']],
  ['superfund', ['epa', 'olyport']],
  ['aqi', ['epa', 'olyport']],
  ['air quality', ['epa', 'olyport']],
  ['recall', ['fda', 'olyport']],
  ['adverse event', ['fda', 'olyport']],
  ['flood', ['usgs', 'olyport']],
  ['stream gauge', ['usgs', 'olyport']],
  ['water level', ['usgs', 'olyport']],
  ['biomedical', ['pubmed', 'olyport']],
  ['clinical study', ['pubmed', 'olyport']],
  ['medical research', ['pubmed', 'olyport']],
]);

const formatLocalDateForPrompt = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildFreshLookupInstruction = (): string => [
  `For this fresh/current lookup, prioritize data that matches the current local date (${formatLocalDateForPrompt(new Date())}) and the user's requested timeframe.`,
  'When provider search or search tools are available, use date-scoped queries with words like current, latest, today, live, or recent as appropriate.',
  'Do not rely on old articles, stale schedules, cached summaries, preview pages, or pages that do not clearly match the requested date/time unless the user explicitly asks for history.',
  'Answer in concise spoken text without raw URLs, markdown links, or citation lists; mention source names only when it helps.',
].join(' ');

const buildSportsLiveLookupInstruction = (): string => [
  'For this live/current sports score lookup, search for the current live score/status first.',
  `Use both team names plus "live score", "today (${formatLocalDateForPrompt(new Date())})", and the current date when provider search is available.`,
  'Ignore prediction, preview, odds, kickoff, TV-channel, and pre-match pages when the user is asking for an ongoing, today, live, final, or current result.',
  'If you find a score/status, call show_sports_score with the exact score/status and answer in one short spoken sentence without URLs, markdown links, or citation lists.',
].join(' ');

const buildNotionLookupInstruction = (): string => [
  'For this Notion workspace request: Do not ask for Notion page, database, project, task, or UUID IDs first.',
  'If the user provided a Notion URL, extract the 32-character or UUID-like ID from the URL before asking.',
  'If the user provided a title or name, use Notion search, list, or query tools to resolve it to an ID before using ID-only tools.',
  'Ask one short clarifying question only if lookup fails or returns indistinguishable matches.',
  'Keep the final spoken answer to one short sentence.',
].join(' ');

const buildNotionLookupRetryInstruction = (): string =>
  `${buildNotionLookupInstruction()} The previous draft asked the user for a Notion ID; treat that as unresolved and call an available Notion lookup tool when possible.`;

const buildToolLimitSummaryInstruction = (): string => [
  'Tool-call limit reached for this turn. Do not call any more tools.',
  'Answer the user now using only the tool results already present above.',
  'If the results include Notion pages, blocks, database items, projects, notes, or tasks, summarize the title and visible contents in concise spoken text.',
  'If the results are insufficient, say what was found and ask one short follow-up question.',
].join(' ');

const normalizeTerms = (value: string): string[] => {
  const terms = new Set<string>();
  for (const match of value.toLowerCase().matchAll(/[a-z0-9]+/g)) {
    const term = match[0];
    if (term.length < 3 || PROMPT_STOP_WORDS.has(term)) {
      continue;
    }
    terms.add(term);
    if (term.endsWith('ies') && term.length > 4) {
      terms.add(`${term.slice(0, -3)}y`);
    } else if (term.endsWith('s') && term.length > 3) {
      terms.add(term.slice(0, -1));
    }
    if (term.endsWith('ing') && term.length > 5) {
      terms.add(term.slice(0, -3));
    }
    if (term.endsWith('ed') && term.length > 4) {
      terms.add(term.slice(0, -2));
    }
  }
  return [...terms];
};

const estimateTokenCount = (value: unknown): number =>
  Math.max(1, Math.ceil(JSON.stringify(value).length / APPROX_CHARS_PER_TOKEN));

const estimateToolRequestTokenCount = (
  messages: LLMChatMessage[],
  tools: LLMToolDefinition[],
): number =>
  estimateTokenCount({ messages, tools }) + REQUEST_BUDGET_PADDING_TOKENS;

const getToolSearchText = (tool: LLMToolDefinition): string =>
  `${tool.name} ${tool.description} ${JSON.stringify(tool.parameters)}`.toLowerCase();

const isWebSearchTool = (tool: LLMToolDefinition, toolText: string): boolean =>
  tool.name === 'google_search' ||
  /web_search|search the web|fresh\/current public information|source-backed web lookup|external mcp search|live sports scores/i.test(tool.name) ||
  /search the web|fresh\/current public information|source-backed web lookup|external mcp search|live sports scores/i.test(toolText);

const getPromptServiceBrandTerms = (promptTerms: string[]): string[] =>
  promptTerms.filter((term) => SERVICE_BRAND_TERMS.has(term));

const scoreToolForPrompt = (
  tool: LLMToolDefinition,
  promptTerms: string[],
): number => {
  const toolText = getToolSearchText(tool);
  const requestedServiceTerms = getPromptServiceBrandTerms(promptTerms);
  if (
    requestedServiceTerms.length > 0 &&
    !requestedServiceTerms.some((term) => toolText.includes(term))
  ) {
    return 0;
  }
  const nameText = tool.name.toLowerCase();
  const nameTerms = normalizeTerms(tool.name.replace(/_/g, ' '));
  const promptTermSet = new Set(promptTerms);
  let score = 0;

  for (const term of promptTerms) {
    if (nameText.includes(term)) {
      score += 18;
    } else if (toolText.includes(term)) {
      score += 5;
    }
  }

  for (const term of nameTerms) {
    if (promptTermSet.has(term)) {
      score += 14;
    }
  }

  if (tool.name === CUSTOM_CAMERA_TOOL_NAME && promptTerms.some((term) => CAMERA_TERMS.has(term))) {
    score += 40;
  }

  const hasLiveLookupIntent = promptTerms.some((term) => LIVE_LOOKUP_TERMS.has(term));
  const hasSportsResultIntent = promptTerms.some((term) => SPORTS_RESULT_TERMS.has(term));
  const hasNotionIntent = promptTermSet.has('notion');
  if (hasLiveLookupIntent && isWebSearchTool(tool, toolText)) {
    score += 45;
  }

  if (tool.name === 'show_sports_score' && hasSportsResultIntent) {
    score += 45;
  }

  if (hasNotionIntent && toolText.includes('notion')) {
    if (/\b(search|list|query|find|lookup)\b/i.test(`${tool.name} ${tool.description}`)) {
      score += 55;
    }

    if (
      /\b(fetch|get|read)\b/i.test(tool.name) &&
      /\b(?:page|database|project|task)?\s*(?:id|uuid)\b/i.test(toolText)
    ) {
      score -= 20;
    }
  }

  if (score > 0) {
    score += COMMON_TOOL_PRIORITY.get(tool.name) ?? 0;
  }

  // Boost MCP tools when domain topic terms match (e.g. "earthquake" → USGS tools)
  if (score === 0) {
    for (const term of promptTerms) {
      const domainBrands = MCP_DOMAIN_TERMS.get(term);
      if (domainBrands && domainBrands.some((brand) => toolText.includes(brand))) {
        score += 30;
        break;
      }
    }
  }

  return score;
};

export const selectLLMToolDefinitionsForPrompt = (
  tools: LLMToolDefinition[],
  prompt: string,
  maxDefinitionTokens?: number,
  requiredToolNames: string[] = [],
): LLMToolDefinition[] => {
  if (typeof maxDefinitionTokens !== 'number' || !Number.isFinite(maxDefinitionTokens) || maxDefinitionTokens <= 0) {
    return tools;
  }

  const promptTerms = normalizeTerms(prompt);
  const requiredNames = new Set(requiredToolNames.filter(Boolean));
  const candidates = tools
    .map((tool, index) => ({
      tool,
      index,
      tokens: estimateTokenCount(tool),
      score: scoreToolForPrompt(tool, promptTerms) + (requiredNames.has(tool.name) ? RECENT_TOOL_SELECTION_BONUS : 0),
    }))
    .sort((left, right) =>
      right.score - left.score ||
      left.tokens - right.tokens ||
      left.index - right.index,
    );

  const selected: Array<{ tool: LLMToolDefinition; index: number }> = [];
  let tokenTotal = 0;

  for (const candidate of candidates) {
    if (candidate.score <= 0) {
      break;
    }

    if (tokenTotal + candidate.tokens <= maxDefinitionTokens || selected.length === 0) {
      selected.push(candidate);
      tokenTotal += candidate.tokens;
    }
  }

  return selected
    .sort((left, right) => left.index - right.index)
    .map((candidate) => candidate.tool);
};

const buildToolSelectionPrompt = (
  prompt: string,
  sessionMessages: LLMChatMessage[],
): string => {
  const recentContext = sessionMessages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-RECENT_TOOL_SELECTION_MESSAGE_LIMIT)
    .map((message) => message.content.trim())
    .filter(Boolean);

  return [...recentContext, prompt].join('\n');
};

const collectRecentToolNames = (messages: LLMChatMessage[]): string[] => {
  const names: string[] = [];
  const seen = new Set<string>();
  const addName = (name: string | undefined) => {
    const trimmed = name?.trim();
    if (!trimmed || seen.has(trimmed) || names.length >= RECENT_TOOL_NAME_LIMIT) {
      return;
    }
    seen.add(trimmed);
    names.push(trimmed);
  };

  for (let index = messages.length - 1; index >= 0 && names.length < RECENT_TOOL_NAME_LIMIT; index -= 1) {
    const message = messages[index];
    if (message.role === 'tool') {
      addName(message.name);
    }
    if (message.role === 'assistant' && 'toolCalls' in message) {
      for (let toolIndex = message.toolCalls.length - 1; toolIndex >= 0; toolIndex -= 1) {
        addName(message.toolCalls[toolIndex]?.name);
      }
    }
  }

  return names;
};

const hasSportsResultPromptIntent = (prompt: string): boolean => {
  const promptTerms = normalizeTerms(prompt);
  return promptTerms.some((term) => SPORTS_RESULT_TERMS.has(term));
};

const hasLiveLookupPromptIntent = (prompt: string): boolean => {
  const promptTerms = normalizeTerms(prompt);
  return promptTerms.some((term) => LIVE_LOOKUP_TERMS.has(term));
};

const NOTION_ID_REQUEST_RE = /\bnotion\b[\s\S]{0,180}\b(?:page|database|project|task)?\s*(?:id|uuid)\b|\b(?:page|database|project|task)\s*(?:id|uuid)\b[\s\S]{0,180}\bnotion\b|\b(?:actual|correct)\s+(?:notion\s+)?(?:page|database|project|task)?\s*(?:id|uuid)\b|\bshare\s+(?:the\s+)?(?:notion\s+)?(?:page|database|project|task)?\s*(?:id|uuid)\b/i;
const NOTION_PROMPT_RE = /\bnotion\b|https?:\/\/(?:www\.)?notion\.(?:so|site)\//i;
const NOTION_URL_RE = /https?:\/\/(?:www\.)?notion\.(?:so|site)\/[^\s<>()\]]+/gi;
const NOTION_ID_CANDIDATE_RE = /\b(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi;

const hasNotionTool = (tools: LLMToolDefinition[]): boolean =>
  tools.some((tool) => /\bnotion\b/i.test(getToolSearchText(tool)));

const extractNotionUrlIdCandidates = (value: string): string[] => {
  const ids = new Set<string>();

  for (const match of value.matchAll(NOTION_URL_RE)) {
    const rawUrl = match[0].replace(/[.,;!?]+$/, '');
    let decodedUrl = rawUrl;
    try {
      decodedUrl = decodeURIComponent(rawUrl);
    } catch {
      decodedUrl = rawUrl;
    }

    for (const idMatch of decodedUrl.matchAll(NOTION_ID_CANDIDATE_RE)) {
      ids.add(idMatch[0].replace(/-/g, '').toLowerCase());
    }
  }

  return [...ids];
};

const buildNotionUrlIdInstruction = (
  prompt: string,
  sessionMessages: LLMChatMessage[],
): string => {
  const recentContext = sessionMessages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-RECENT_TOOL_SELECTION_MESSAGE_LIMIT)
    .map((message) => message.content)
    .join('\n');
  const ids = extractNotionUrlIdCandidates(`${recentContext}\n${prompt}`);

  if (ids.length === 0) {
    return '';
  }

  const label = ids.length === 1 ? 'candidate' : 'candidates';
  return `Detected Notion URL ID ${label}: ${ids.join(', ')}. Use these IDs with Notion fetch, read, update, or query tools when appropriate before asking the user for an ID.`;
};

const hasNotionPromptIntent = (
  prompt: string,
  sessionMessages: LLMChatMessage[],
): boolean => {
  if (NOTION_PROMPT_RE.test(prompt)) {
    return true;
  }

  return sessionMessages
    .slice(-RECENT_TOOL_SELECTION_MESSAGE_LIMIT)
    .some((message) =>
      (message.role === 'user' || message.role === 'assistant') &&
      NOTION_PROMPT_RE.test(message.content),
    );
};

const shouldRetryWithExpandedToolDefinitions = (
  responseText: string,
  selectedTools: LLMToolDefinition[],
  allTools: LLMToolDefinition[],
): boolean =>
  selectedTools.length < allTools.length &&
  TOOL_BLOCKED_RESPONSE_RE.test(responseText);

const shouldRetryNotionIdRequest = (
  responseText: string,
  allTools: LLMToolDefinition[],
  prompt: string,
  sessionMessages: LLMChatMessage[],
): boolean =>
  Boolean(responseText.trim()) &&
  NOTION_ID_REQUEST_RE.test(responseText) &&
  hasNotionTool(allTools) &&
  hasNotionPromptIntent(prompt, sessionMessages);

const truncateTextWithSuffix = (serialized: string, maxChars: number): string => {
  if (serialized.length <= maxChars) {
    return serialized;
  }

  const usableChars = Math.max(0, maxChars - MAX_RESULT_SUFFIX.length);
  return `${serialized.slice(0, usableChars)}${MAX_RESULT_SUFFIX}`;
};

const truncateSerializedToolResult = (serialized: string, maxChars?: number): string => {
  if (typeof maxChars !== 'number' || !Number.isFinite(maxChars) || serialized.length <= maxChars) {
    return serialized;
  }

  return truncateTextWithSuffix(serialized, maxChars);
};

const serializeToolResult = (result: unknown, maxChars?: number): string => {
  let serialized: string;
  if (typeof result === 'string') {
    serialized = result;
  } else {
    try {
      serialized = JSON.stringify(result ?? null);
    } catch {
      serialized = JSON.stringify({
        success: false,
        error: 'Tool result could not be serialized.',
      });
    }
  }

  return truncateSerializedToolResult(serialized, maxChars);
};

const cloneToolCall = (toolCall: LLMToolCall): LLMToolCall => ({
  ...toolCall,
  arguments: { ...toolCall.arguments },
});

const cloneChatMessage = (message: LLMChatMessage): LLMChatMessage => {
  if (message.role === 'assistant' && 'toolCalls' in message) {
    return {
      ...message,
      toolCalls: message.toolCalls.map(cloneToolCall),
    };
  }

  return { ...message };
};

type AssistantToolCallMessage = Extract<LLMChatMessage, { role: 'assistant'; toolCalls: LLMToolCall[] }>;
type ToolChatMessage = Extract<LLMChatMessage, { role: 'tool' }>;

const isAssistantToolCallMessage = (message: LLMChatMessage): message is AssistantToolCallMessage =>
  message.role === 'assistant' &&
  'toolCalls' in message &&
  Array.isArray(message.toolCalls) &&
  message.toolCalls.length > 0;

const isToolChatMessage = (message: LLMChatMessage | undefined): message is ToolChatMessage =>
  Boolean(message) && message?.role === 'tool';

const getStableToolCallId = (toolCall: LLMToolCall, index: number): string =>
  toolCall.id?.trim() || `tool_call_${index}`;

const normalizeAssistantToolCalls = (message: AssistantToolCallMessage): AssistantToolCallMessage => ({
  ...message,
  toolCalls: message.toolCalls.map((toolCall, index) => ({
    ...cloneToolCall(toolCall),
    id: getStableToolCallId(toolCall, index),
  })),
});

const toolMessageMatchesCall = (
  message: ToolChatMessage,
  toolCall: LLMToolCall,
  index: number,
): boolean => {
  const expectedId = getStableToolCallId(toolCall, index);
  const messageId = message.toolCallId?.trim();
  const callName = toolCall.name.trim();
  const messageName = message.name.trim();

  if (messageId === expectedId) {
    return true;
  }

  if (messageName !== callName) {
    return false;
  }

  return !messageId || messageId === callName;
};

const normalizeToolMessagePairs = (messages: LLMChatMessage[]): LLMChatMessage[] => {
  const normalized: LLMChatMessage[] = [];

  for (let index = 0; index < messages.length;) {
    const message = messages[index];

    if (message.role === 'tool') {
      index += 1;
      continue;
    }

    if (!isAssistantToolCallMessage(message)) {
      normalized.push(cloneChatMessage(message));
      index += 1;
      continue;
    }

    const assistantMessage = normalizeAssistantToolCalls(message);
    const toolMessages: ToolChatMessage[] = [];
    let hasCompleteToolResultGroup = true;

    for (let toolIndex = 0; toolIndex < assistantMessage.toolCalls.length; toolIndex += 1) {
      const toolMessage = messages[index + 1 + toolIndex];
      const toolCall = assistantMessage.toolCalls[toolIndex];
      if (!isToolChatMessage(toolMessage) || !toolMessageMatchesCall(toolMessage, toolCall, toolIndex)) {
        hasCompleteToolResultGroup = false;
        break;
      }

      toolMessages.push({
        ...toolMessage,
        name: toolMessage.name.trim() || toolCall.name,
        toolCallId: getStableToolCallId(toolCall, toolIndex),
      });
    }

    if (hasCompleteToolResultGroup) {
      normalized.push(assistantMessage, ...toolMessages);
      index += 1 + toolMessages.length;
      continue;
    }

    if (message.content.trim()) {
      normalized.push({
        role: 'assistant',
        content: message.content,
      });
    }
    index += 1;
  }

  return normalized;
};

const chunkMessagesPreservingToolPairs = (messages: LLMChatMessage[]): LLMChatMessage[][] => {
  const chunks: LLMChatMessage[][] = [];

  for (let index = 0; index < messages.length;) {
    const message = messages[index];

    if (isAssistantToolCallMessage(message)) {
      const groupLength = 1 + message.toolCalls.length;
      const group = messages.slice(index, index + groupLength);
      if (group.length === groupLength && group.slice(1).every(isToolChatMessage)) {
        chunks.push(group.map(cloneChatMessage));
        index += groupLength;
        continue;
      }
    }

    if (message.role !== 'tool') {
      chunks.push([cloneChatMessage(message)]);
    }
    index += 1;
  }

  return chunks;
};

const trimSessionMessages = (
  messages: LLMChatMessage[],
  maxMessages = DEFAULT_MAX_SESSION_MESSAGES,
  persistSystemPrompt = true,
): LLMChatMessage[] => {
  const normalizedMessages = normalizeToolMessagePairs(messages);
  const systemMessages = persistSystemPrompt
    ? normalizedMessages.filter((message) => message.role === 'system')
    : [];
  const nonSystemChunks = chunkMessagesPreservingToolPairs(
    normalizedMessages.filter((message) => message.role !== 'system'),
  );
  const maxRetainedMessages = Math.max(1, maxMessages);
  const retainedChunks: LLMChatMessage[][] = [];
  let retainedCount = 0;

  for (let index = nonSystemChunks.length - 1; index >= 0; index -= 1) {
    const chunk = nonSystemChunks[index];
    if (retainedChunks.length === 0 || retainedCount + chunk.length <= maxRetainedMessages) {
      retainedChunks.unshift(chunk);
      retainedCount += chunk.length;
    }
  }

  return [
    ...systemMessages,
    ...retainedChunks.flat(),
  ];
};

const compactToolResultsForBudget = (
  messages: LLMChatMessage[],
  tools: LLMToolDefinition[],
  maxRequestTokens?: number,
): LLMChatMessage[] => {
  if (typeof maxRequestTokens !== 'number' || !Number.isFinite(maxRequestTokens) || maxRequestTokens <= 0) {
    return messages.map(cloneChatMessage);
  }

  const compacted = messages.map(cloneChatMessage);
  let estimatedTokens = estimateToolRequestTokenCount(compacted, tools);
  let guard = 0;

  while (estimatedTokens > maxRequestTokens && guard < 20) {
    guard += 1;

    const candidate = compacted
      .map((message, index) => ({ message, index }))
      .filter(({ message }) =>
        message.role === 'tool' &&
        message.content.length > MIN_COMPACTED_TOOL_RESULT_CHARS + MAX_RESULT_SUFFIX.length,
      )
      .sort((left, right) => right.message.content.length - left.message.content.length)[0];

    if (!candidate || candidate.message.role !== 'tool') {
      break;
    }

    const overBudgetTokens = estimatedTokens - maxRequestTokens;
    const shrinkByChars = Math.max(
      overBudgetTokens * APPROX_CHARS_PER_TOKEN + MAX_RESULT_SUFFIX.length,
      Math.ceil(candidate.message.content.length * 0.35),
    );
    const nextMaxChars = Math.max(
      MIN_COMPACTED_TOOL_RESULT_CHARS,
      candidate.message.content.length - shrinkByChars,
    );
    const nextContent = truncateTextWithSuffix(candidate.message.content, nextMaxChars);

    if (nextContent.length >= candidate.message.content.length) {
      break;
    }

    compacted[candidate.index] = {
      ...candidate.message,
      content: nextContent,
    };
    estimatedTokens = estimateToolRequestTokenCount(compacted, tools);
  }

  return compacted;
};

const fitMessagesToRequestBudget = (
  messages: LLMChatMessage[],
  tools: LLMToolDefinition[],
  maxRequestTokens: number | undefined,
  currentTurnStartIndex: number,
): LLMChatMessage[] => {
  const normalizedMessages = normalizeToolMessagePairs(messages);
  if (typeof maxRequestTokens !== 'number' || !Number.isFinite(maxRequestTokens) || maxRequestTokens <= 0) {
    return normalizedMessages.map(cloneChatMessage);
  }

  const clonedMessages = normalizedMessages.map(cloneChatMessage);
  if (estimateToolRequestTokenCount(clonedMessages, tools) <= maxRequestTokens) {
    return clonedMessages;
  }

  const previousMessages = normalizedMessages.slice(0, currentTurnStartIndex);
  const systemMessages = previousMessages.filter((message) => message.role === 'system');
  const priorSessionChunks = chunkMessagesPreservingToolPairs(
    previousMessages.filter((message) => message.role !== 'system'),
  );
  const currentTurnMessages = normalizedMessages.slice(currentTurnStartIndex);
  const retainedPriorMessages: LLMChatMessage[] = [];

  for (let index = priorSessionChunks.length - 1; index >= 0; index -= 1) {
    const chunk = priorSessionChunks[index];
    const candidatePriorMessages = [
      ...chunk,
      ...retainedPriorMessages,
    ];
    const candidateMessages = compactToolResultsForBudget(
      [
        ...systemMessages,
        ...candidatePriorMessages,
        ...currentTurnMessages,
      ],
      tools,
      maxRequestTokens,
    );

    if (estimateToolRequestTokenCount(candidateMessages, tools) <= maxRequestTokens) {
      retainedPriorMessages.unshift(...chunk);
    }
  }

  return compactToolResultsForBudget(
    [
      ...systemMessages,
      ...retainedPriorMessages,
      ...currentTurnMessages,
    ],
    tools,
    maxRequestTokens,
  );
};

const normalizeCameraFacingMode = (value: unknown): 'user' | 'environment' =>
  value === 'user' ? 'user' : 'environment';

const executeCustomCameraTool = async (
  provider: LLMProvider,
  toolCall: LLMToolCall,
  dependencies?: CameraSnapshotDependencies,
): Promise<unknown> => {
  if (!provider.generateVisionText) {
    return {
      success: false,
      error: `Provider "${provider.name}" does not support image input.`,
    };
  }

  const prompt = String(toolCall.arguments.prompt || '').trim();
  if (!prompt) {
    return {
      success: false,
      error: 'The camera inspection tool requires a prompt.',
    };
  }

  const image = await captureSingleCameraFrame(
    {
      facingMode: normalizeCameraFacingMode(toolCall.arguments.facingMode),
    },
    dependencies,
  );

  const description = await provider.generateVisionText({
    prompt,
    systemPrompt: 'You are analyzing a single camera image captured by Curio. Answer the prompt directly, stay concise, and do not guess when the image is unclear.',
    image,
  });

  return {
    success: true,
    imageWidth: image.width,
    imageHeight: image.height,
    description,
  };
};

const executeToolCall = async (
  provider: LLMProvider,
  toolCall: LLMToolCall,
  context: ToolCallContext,
  cameraDependencies?: CameraSnapshotDependencies,
): Promise<unknown> => {
  if (toolCall.name === CUSTOM_CAMERA_TOOL_NAME) {
    return executeCustomCameraTool(provider, toolCall, cameraDependencies);
  }

  const handler = getToolHandler(toolCall.name);
  if (handler) {
    const response = await handler(toolCall.arguments, context);
    return response.result;
  }

  if (context.onMcpToolCall) {
    return context.onMcpToolCall(toolCall.name, toolCall.arguments);
  }

  return {
    success: false,
    error: `Unknown tool: ${toolCall.name}`,
  };
};

const trySummarizeToolLimitResults = async (
  provider: LLMProvider,
  messages: LLMChatMessage[],
  currentTurnStartIndex: number,
  temperature: number | undefined,
): Promise<{
  text: string;
  messages: LLMChatMessage[];
} | null> => {
  if (!provider.generateToolResponse) {
    return null;
  }

  const finalMessages: LLMChatMessage[] = [
    ...messages,
    {
      role: 'system',
      content: buildToolLimitSummaryInstruction(),
    },
  ];
  const requestMessages = fitMessagesToRequestBudget(
    finalMessages,
    [],
    provider.maxToolRequestTokens,
    currentTurnStartIndex,
  );

  try {
    const response = await provider.generateToolResponse({
      messages: requestMessages,
      tools: [],
      temperature,
      allowNativeSearch: false,
    });
    const visibleText = sanitizeLLMVisibleText(response.text || '');
    if (!visibleText) {
      return null;
    }

    return {
      text: visibleText,
      messages: [
        ...finalMessages,
        {
          role: 'assistant',
          content: visibleText,
        },
      ],
    };
  } catch (error) {
    console.warn('[LLMToolAgent] Failed to summarize tool results after hitting the tool limit:', error);
    return null;
  }
};

export const runLLMToolAgent = async ({
  provider,
  prompt,
  systemPrompt,
  sessionMessages = [],
  onSessionMessagesChange,
  maxSessionMessages = DEFAULT_MAX_SESSION_MESSAGES,
  persistSystemPromptInSession = true,
  temperature,
  mcpTools = [],
  context,
  maxRounds = DEFAULT_MAX_TOOL_ROUNDS,
  cameraDependencies,
  toolDefinitions,
}: RunLLMToolAgentInput): Promise<string> => {
  if (!provider.generateToolResponse) {
    const text = await provider.generateText({
      prompt,
      systemPrompt,
      temperature,
    });
    return sanitizeLLMVisibleText(text);
  }

  const normalizedSessionMessages = normalizeToolMessagePairs(sessionMessages);
  const allTools = toolDefinitions ?? buildCustomLLMToolDefinitions(mcpTools);
  let tools = selectLLMToolDefinitionsForPrompt(
    allTools,
    buildToolSelectionPrompt(prompt, normalizedSessionMessages),
    provider.maxToolDefinitionTokens ?? DEFAULT_MAX_TOOL_DEFINITION_TOKENS,
    collectRecentToolNames(normalizedSessionMessages),
  );
  const messages: LLMChatMessage[] = [...normalizedSessionMessages];

  const hasSystemMessage = messages.some((message) => message.role === 'system');
  if (!hasSystemMessage && systemPrompt?.trim()) {
    messages.unshift({
      role: 'system',
      content: systemPrompt.trim(),
    });
  }

  const currentTurnStartIndex = messages.length;
  const sportsResultPrompt = hasSportsResultPromptIntent(prompt);
  if (sportsResultPrompt) {
    messages.push({
      role: 'system',
      content: buildSportsLiveLookupInstruction(),
    });
  } else if (hasLiveLookupPromptIntent(prompt)) {
    messages.push({
      role: 'system',
      content: buildFreshLookupInstruction(),
    });
  }
  if (hasNotionTool(allTools) && hasNotionPromptIntent(prompt, normalizedSessionMessages)) {
    messages.push({
      role: 'system',
      content: buildNotionLookupInstruction(),
    });
    const notionUrlIdInstruction = buildNotionUrlIdInstruction(prompt, normalizedSessionMessages);
    if (notionUrlIdInstruction) {
      messages.push({
        role: 'system',
        content: notionUrlIdInstruction,
      });
    }
  }
  messages.push({
    role: 'user',
    content: prompt,
  });

  let lastText = '';
  let retriedWithExpandedTools = false;
  let retriedNotionLookup = false;
  let hasCurrentTurnToolResults = false;

  for (let round = 0; round < maxRounds; round += 1) {
    const requestMessages = fitMessagesToRequestBudget(
      messages,
      tools,
      provider.maxToolRequestTokens,
      currentTurnStartIndex,
    );
    const response = await provider.generateToolResponse({
      messages: requestMessages,
      tools,
      temperature,
      allowNativeSearch: !hasCurrentTurnToolResults,
    });
    const visibleText = sanitizeLLMVisibleText(response.text || '');

    lastText = visibleText || lastText;

    if (!response.toolCalls.length) {
      if (
        !retriedWithExpandedTools &&
        shouldRetryWithExpandedToolDefinitions(visibleText, tools, allTools)
      ) {
        retriedWithExpandedTools = true;
        tools = allTools;
        continue;
      }

      if (
        !retriedNotionLookup &&
        shouldRetryNotionIdRequest(visibleText, allTools, prompt, normalizedSessionMessages)
      ) {
        retriedNotionLookup = true;
        tools = allTools;
        messages.push({
          role: 'system',
          content: buildNotionLookupRetryInstruction(),
        });
        continue;
      }

      if (visibleText) {
        messages.push({
          role: 'assistant',
          content: visibleText,
        });
      }
      onSessionMessagesChange?.(trimSessionMessages(
        messages,
        maxSessionMessages,
        persistSystemPromptInSession,
      ));
      return visibleText || lastText;
    }

    messages.push({
      role: 'assistant',
      content: visibleText,
      toolCalls: response.toolCalls,
    });

    for (const toolCall of response.toolCalls) {
      console.log(`[LLMToolAgent] AI calling tool: ${toolCall.name}`, toolCall.arguments);
      const toolResult = await executeToolCall(
        provider,
        toolCall,
        context,
        cameraDependencies,
      );

      messages.push({
        role: 'tool',
        name: toolCall.name,
        toolCallId: toolCall.id,
        content: serializeToolResult(toolResult, provider.maxToolResultChars),
      });
      hasCurrentTurnToolResults = true;
    }
  }

  if (hasCurrentTurnToolResults) {
    const summarized = await trySummarizeToolLimitResults(
      provider,
      messages,
      currentTurnStartIndex,
      temperature,
    );
    if (summarized) {
      onSessionMessagesChange?.(trimSessionMessages(
        summarized.messages,
        maxSessionMessages,
        persistSystemPromptInSession,
      ));
      return summarized.text;
    }
  }

  onSessionMessagesChange?.(trimSessionMessages(
    messages,
    maxSessionMessages,
    persistSystemPromptInSession,
  ));

  return lastText || 'I could not finish that request within the tool limit.';
};
