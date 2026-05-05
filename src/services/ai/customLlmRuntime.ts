import {
  getCustomLLMApiKeyAsync,
  getCustomLLMBaseUrl,
  getCustomLLMModel,
  getCustomLLMProviderType,
  getOpenAICompatibleProviderPresetId,
} from '../../utils/settingsStorage';

import {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
  createLLMProvider,
  type LLMNativeSearchConfig,
  type LLMProvider,
  type LLMProviderConfig,
  type OpenAICompatibleProviderOptions,
} from './llmProvider';
import { getGeminiTextApiKeyAsync } from './config';

const resolveBaseUrl = (type: LLMProviderConfig['type'], baseUrl: string): string => {
  const trimmed = baseUrl.trim();
  if (trimmed) {
    return trimmed;
  }

  return type === 'openai'
    ? DEFAULT_OPENAI_COMPATIBLE_BASE_URL
    : DEFAULT_OLLAMA_BASE_URL;
};

const resolveModel = (model: string): string => {
  const trimmed = model.trim();
  return trimmed || 'qwen3';
};

const OPENAI_CHAT_COMPLETIONS_SEARCH_MODEL_RE = /(?:^|\/)(?:gpt-5-search-api|gpt-4o(?:-mini)?-search-preview)(?:$|[-:])/i;

const isOfficialOpenAIEndpoint = (baseUrl: string): boolean => {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'api.openai.com';
  } catch {
    return baseUrl.toLowerCase().includes('api.openai.com');
  }
};

const isOfficialNovaEndpoint = (baseUrl: string): boolean => {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'api.nova.amazon.com';
  } catch {
    return baseUrl.toLowerCase().includes('api.nova.amazon.com');
  }
};

const NOVA_TEXT_NATIVE_SEARCH_MODEL_RE = /^nova-2-[a-z0-9-]+$/i;

const resolveCustomLLMNativeSearch = (
  config: Pick<LLMProviderConfig, 'type' | 'baseUrl' | 'model'>,
): LLMNativeSearchConfig | undefined => {
  if (config.type === 'gemini') {
    return { type: 'gemini-google-search' };
  }

  if (
    config.type === 'openai' &&
    getOpenAICompatibleProviderPresetId() === 'openai' &&
    isOfficialOpenAIEndpoint(config.baseUrl || DEFAULT_OPENAI_COMPATIBLE_BASE_URL) &&
    OPENAI_CHAT_COMPLETIONS_SEARCH_MODEL_RE.test(config.model)
  ) {
    return { type: 'openai-web-search' };
  }

  if (
    config.type === 'openai' &&
    getOpenAICompatibleProviderPresetId() === 'amazon_nova' &&
    isOfficialNovaEndpoint(config.baseUrl || '') &&
    NOVA_TEXT_NATIVE_SEARCH_MODEL_RE.test(config.model)
  ) {
    return { type: 'nova-grounding' };
  }

  return undefined;
};

export const customLLMProviderConfigHasNativeSearch = (config: LLMProviderConfig): boolean =>
  Boolean(config.nativeSearch);

export const hasConfiguredCustomLLMCredential = (config: LLMProviderConfig): boolean => {
  if (config.type === 'ollama') {
    return true;
  }
  return Boolean(config.apiKey?.trim());
};

export const getMissingCustomLLMCredentialMessage = (config: LLMProviderConfig): string => {
  if (config.type === 'gemini') {
    return 'No Gemini API key found. Add it in Settings > Voice & AI > Gemini.';
  }

  return 'No Text LLM credential found. Add the selected provider credential in Settings > Voice & AI > Text LLM.';
};

const resolveOpenAICompatibleRuntimeConfig = async (
  baseUrl: string,
  apiKey: string,
): Promise<{
  baseUrl: string;
  apiKey: string;
  openAICompatible?: OpenAICompatibleProviderOptions;
}> => {
  return {
    baseUrl,
    apiKey,
    openAICompatible: {
      auth: { type: 'bearer', token: apiKey },
    },
  };
};

export interface CustomLLMSystemPromptInput {
  systemInstruction: string;
  homeAssistantToolCount?: number;
  homeAssistantEntityCount?: number;
  externalMcpToolCount?: number;
  externalMcpInstruction?: string;
  providerSupportsTools?: boolean;
}

export interface CustomLLMFollowupSystemPromptInput {
  contextDigest?: string;
  homeAssistantToolCount?: number;
  homeAssistantEntityCount?: number;
  externalMcpToolCount?: number;
  externalMcpInstruction?: string;
  providerSupportsTools?: boolean;
}

const buildRuntimeContractLines = (
  homeAssistantToolCount: number,
  homeAssistantEntityCount: number,
  externalMcpToolCount: number,
  externalMcpInstruction: string,
  providerSupportsTools: boolean,
): string[] => [
  '- Never reveal hidden reasoning, chain-of-thought, analysis, planning notes, scratchpad text, or tool-selection notes.',
  '- Do not use thinking tags or labels like Thought, Reasoning, Analysis, or Final in user-visible replies.',
  '- You receive Curio app context on the first turn, including weather, locations, identity context when enabled, routines, and live tool declarations.',
  `- Home Assistant tools loaded: ${homeAssistantToolCount}. Home Assistant entities loaded: ${homeAssistantEntityCount}.`,
  `- External MCP tools loaded: ${externalMcpToolCount}.`,
  externalMcpInstruction.trim(),
  providerSupportsTools
    ? '- When a tool is available and helpful, call it. Do not claim a tool result unless the tool actually returned it.'
    : '- Tool calling is unavailable for this provider, so state briefly when a live action or live lookup cannot be completed.',
  '- Default to one short sentence for dashboard, face-mode, and TTS-visible replies. Ask at most one short clarifying question when information is missing.',
  '- Your reply may be spoken aloud in face mode. Keep user-visible replies TTS-friendly. Do not include raw URLs, markdown links, citations, or source lists; mention a source by plain publisher name only when it matters.',
  '- For live or ongoing sports, first look for the current live score/status using team names plus "live score", "today", and the current date. Ignore prediction, preview, odds, kickoff, TV-channel, and pre-match pages when a live or final score is needed.',
  '- After tool calls, answer naturally with only the user-facing result. Do not explain tool names, IDs, schemas, or backend requirements unless the user explicitly asks.',
].filter(Boolean);

export const buildCustomLLMSystemPrompt = ({
  systemInstruction,
  homeAssistantToolCount = 0,
  homeAssistantEntityCount = 0,
  externalMcpToolCount = 0,
  externalMcpInstruction = '',
  providerSupportsTools = true,
}: CustomLLMSystemPromptInput): string => {
  const trimmedInstruction = systemInstruction.trim();
  const runtimeContract = [
    'Custom Text LLM runtime contract:',
    ...buildRuntimeContractLines(
      homeAssistantToolCount,
      homeAssistantEntityCount,
      externalMcpToolCount,
      externalMcpInstruction,
      providerSupportsTools,
    ),
  ];

  return [trimmedInstruction, runtimeContract.join('\n')]
    .filter(Boolean)
    .join('\n\n');
};

export const buildCustomLLMFollowupSystemPrompt = ({
  contextDigest = '',
  homeAssistantToolCount = 0,
  homeAssistantEntityCount = 0,
  externalMcpToolCount = 0,
  externalMcpInstruction = '',
  providerSupportsTools = true,
}: CustomLLMFollowupSystemPromptInput): string => {
  const runtimeContract = [
    'Follow-up Custom Text LLM runtime contract:',
    '- This is an additive follow-up turn. Use the rolling conversation history sent with this request.',
    '- Curio avoids resending the full static app context on follow-up turns; rely on the compact current app context below.',
    ...buildRuntimeContractLines(
      homeAssistantToolCount,
      homeAssistantEntityCount,
      externalMcpToolCount,
      externalMcpInstruction,
      providerSupportsTools,
    ),
  ];

  return [
    runtimeContract.join('\n'),
    contextDigest.trim() ? `[CURRENT APP CONTEXT]\n${contextDigest.trim()}` : '',
  ].filter(Boolean).join('\n\n');
};

export const getConfiguredCustomLLMProviderConfig = async (): Promise<LLMProviderConfig> => {
  const type = getCustomLLMProviderType();
  const model = resolveModel(getCustomLLMModel());

  if (type === 'gemini') {
    const nativeSearch = resolveCustomLLMNativeSearch({ type, baseUrl: '', model });
    return {
      type,
      baseUrl: '',
      apiKey: (await getGeminiTextApiKeyAsync()) || '',
      model,
      nativeSearch,
    };
  }

  const apiKey = type === 'openai'
    ? await getCustomLLMApiKeyAsync()
    : undefined;
  const rawBaseUrl = getCustomLLMBaseUrl();
  const baseUrl = resolveBaseUrl(type, rawBaseUrl);

  if (type === 'openai') {
    const nativeSearch = resolveCustomLLMNativeSearch({ type, baseUrl, model });
    const openAICompatible = await resolveOpenAICompatibleRuntimeConfig(baseUrl, apiKey || '');
    return {
      type,
      model,
      ...openAICompatible,
      nativeSearch,
      openAICompatible: {
        ...openAICompatible.openAICompatible,
        ...(nativeSearch ? { nativeSearch } : {}),
      },
    };
  }

  return {
    type,
    baseUrl,
    apiKey,
    model,
  };
};

export const createConfiguredCustomLLMProvider = async (): Promise<LLMProvider> => {
  const config = await getConfiguredCustomLLMProviderConfig();
  return createLLMProvider(config);
};
