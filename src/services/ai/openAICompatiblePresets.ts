export type OpenAICompatibleProviderPresetId =
  | 'openai'
  | 'amazon_nova'
  | 'anthropic'
  | 'groq'
  | 'openrouter'
  | 'mistral'
  | 'custom';

export interface OpenAICompatibleProviderPreset {
  id: OpenAICompatibleProviderPresetId;
  label: string;
  description: string;
  baseUrl: string;
  defaultModel: string;
  modelOptions: string[];
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  baseUrlPlaceholder?: string;
  modelLabel?: string;
  advanced?: boolean;
  showBaseUrlInput?: boolean;
}

export const OPENAI_COMPATIBLE_PROVIDER_PRESETS: OpenAICompatibleProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'Official OpenAI Chat Completions endpoint.',
    baseUrl: 'https://api.openai.com',
    defaultModel: 'gpt-4o-mini',
    modelOptions: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
    apiKeyLabel: 'OpenAI API Key',
    apiKeyPlaceholder: 'sk-...',
  },
  {
    id: 'amazon_nova',
    label: 'Amazon Nova',
    description: 'Amazon Nova OpenAI-compatible chat completions endpoint.',
    baseUrl: 'https://api.nova.amazon.com/v1',
    defaultModel: 'nova-2-lite-v1',
    modelOptions: ['nova-2-lite-v1'],
    apiKeyLabel: 'Amazon Nova API Key',
    apiKeyPlaceholder: 'Nova API key...',
  },
  {
    id: 'anthropic',
    label: 'Claude',
    description: 'Claude hosted model endpoint.',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-5-20250929',
    modelOptions: [
      'claude-sonnet-4-5-20250929',
      'claude-opus-4-1-20250805',
      'claude-haiku-4-5-20251001',
    ],
    apiKeyLabel: 'Claude API Key',
    apiKeyPlaceholder: 'sk-ant-...',
  },
  {
    id: 'groq',
    label: 'Groq',
    description: 'GroqCloud hosted model endpoint.',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-20b',
    modelOptions: [
      'openai/gpt-oss-20b',
      'openai/gpt-oss-120b',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
    ],
    apiKeyLabel: 'Groq API Key',
    apiKeyPlaceholder: 'gsk_...',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'OpenRouter hosted model router.',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    modelOptions: [
      'openai/gpt-4o-mini',
      'anthropic/claude-sonnet-4.5',
      'google/gemini-2.5-flash',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    apiKeyLabel: 'OpenRouter API Key',
    apiKeyPlaceholder: 'sk-or-...',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    description: 'Mistral chat completions endpoint.',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    modelOptions: [
      'mistral-small-latest',
      'mistral-medium-latest',
      'mistral-large-latest',
      'codestral-latest',
    ],
    apiKeyLabel: 'Mistral API Key',
    apiKeyPlaceholder: 'Mistral API key...',
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Custom chat completions endpoint.',
    baseUrl: '',
    defaultModel: '',
    modelOptions: [],
    apiKeyLabel: 'API Key',
    apiKeyPlaceholder: 'Provider API key...',
    baseUrlPlaceholder: 'https://api.provider.com/v1',
    modelLabel: 'Model',
    advanced: true,
    showBaseUrlInput: true,
  },
];

const PRESET_BY_ID = new Map(OPENAI_COMPATIBLE_PROVIDER_PRESETS.map((preset) => [preset.id, preset]));

export type TextLLMProviderOptionId =
  | 'gemini'
  | 'ollama'
  | OpenAICompatibleProviderPresetId;

export type TextLLMProviderType = 'gemini' | 'ollama' | 'openai';

export interface TextLLMProviderOption {
  id: TextLLMProviderOptionId;
  label: string;
  description: string;
  providerType: TextLLMProviderType;
  presetId?: OpenAICompatibleProviderPresetId;
  advanced?: boolean;
}

export const TEXT_LLM_PROVIDER_OPTIONS: TextLLMProviderOption[] = [
  {
    id: 'gemini',
    label: 'Gemini',
    description: 'Direct Gemini text models.',
    providerType: 'gemini',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    description: 'Local Ollama server.',
    providerType: 'ollama',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    description: 'Mistral hosted models.',
    providerType: 'openai',
    presetId: 'mistral',
  },
  {
    id: 'anthropic',
    label: 'Claude',
    description: 'Claude hosted models.',
    providerType: 'openai',
    presetId: 'anthropic',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'OpenAI hosted models.',
    providerType: 'openai',
    presetId: 'openai',
  },
  {
    id: 'amazon_nova',
    label: 'Amazon Nova',
    description: 'Amazon Nova hosted models.',
    providerType: 'openai',
    presetId: 'amazon_nova',
  },
  {
    id: 'groq',
    label: 'Groq',
    description: 'GroqCloud hosted models.',
    providerType: 'openai',
    presetId: 'groq',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'OpenRouter hosted model router.',
    providerType: 'openai',
    presetId: 'openrouter',
  },
  {
    id: 'custom',
    label: 'Custom (Advanced)',
    description: 'Custom chat completions endpoint.',
    providerType: 'openai',
    presetId: 'custom',
    advanced: true,
  },
];

const TEXT_PROVIDER_BY_ID = new Map(TEXT_LLM_PROVIDER_OPTIONS.map((provider) => [provider.id, provider]));

export const getTextLLMProviderOptionValue = (
  providerType: TextLLMProviderType,
  presetId: OpenAICompatibleProviderPresetId = 'openai',
): TextLLMProviderOptionId => {
  if (providerType === 'gemini' || providerType === 'ollama') {
    return providerType;
  }
  return presetId;
};

export const resolveTextLLMProviderOption = (
  id: string | null | undefined,
): TextLLMProviderOption =>
  TEXT_PROVIDER_BY_ID.get(id as TextLLMProviderOptionId) ??
  TEXT_PROVIDER_BY_ID.get('openai') as TextLLMProviderOption;

export const getOpenAICompatibleProviderPreset = (
  id?: string | null,
): OpenAICompatibleProviderPreset =>
  (PRESET_BY_ID.get(id as OpenAICompatibleProviderPresetId) ??
    PRESET_BY_ID.get('custom')) as OpenAICompatibleProviderPreset;

export const isOpenAICompatibleProviderPresetId = (
  value: string | null | undefined,
): value is OpenAICompatibleProviderPresetId =>
  Boolean(value && PRESET_BY_ID.has(value as OpenAICompatibleProviderPresetId));
