import { describe, expect, it } from 'vitest';

import {
  OPENAI_COMPATIBLE_PROVIDER_PRESETS,
  TEXT_LLM_PROVIDER_OPTIONS,
  getOpenAICompatibleProviderPreset,
  getTextLLMProviderOptionValue,
  resolveTextLLMProviderOption,
} from './openAICompatiblePresets';

describe('OpenAI-compatible provider presets', () => {
  it('includes the curated hosted providers and advanced custom options', () => {
    expect(OPENAI_COMPATIBLE_PROVIDER_PRESETS.map((preset) => preset.id)).toEqual([
      'openai',
      'amazon_nova',
      'anthropic',
      'groq',
      'openrouter',
      'mistral',
      'custom',
    ]);
  });

  it('uses fixed base URLs for common providers and editable URLs for advanced custom providers', () => {
    expect(getOpenAICompatibleProviderPreset('groq')).toMatchObject({
      baseUrl: 'https://api.groq.com/openai/v1',
    });
    expect(getOpenAICompatibleProviderPreset('groq').showBaseUrlInput).toBeUndefined();

    expect(getOpenAICompatibleProviderPreset('amazon_nova')).toMatchObject({
      label: 'Amazon Nova',
      baseUrl: 'https://api.nova.amazon.com/v1',
      defaultModel: 'nova-2-lite-v1',
    });
    expect(getOpenAICompatibleProviderPreset('amazon_nova').showBaseUrlInput).toBeUndefined();

    expect(getOpenAICompatibleProviderPreset('custom')).toMatchObject({
      advanced: true,
      showBaseUrlInput: true,
      modelLabel: 'Model',
      baseUrlPlaceholder: 'https://api.provider.com/v1',
    });
  });

  it('does not expose Azure or AWS Bedrock presets', () => {
    const ids = OPENAI_COMPATIBLE_PROVIDER_PRESETS.map((preset) => preset.id);

    expect(ids).not.toContain('azure');
    expect(ids).not.toContain('aws_bedrock');
  });

  it('exposes a flat Text LLM provider list for settings', () => {
    expect(TEXT_LLM_PROVIDER_OPTIONS.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: 'gemini', label: 'Gemini' },
      { id: 'ollama', label: 'Ollama' },
      { id: 'mistral', label: 'Mistral' },
      { id: 'anthropic', label: 'Claude' },
      { id: 'openai', label: 'OpenAI' },
      { id: 'amazon_nova', label: 'Amazon Nova' },
      { id: 'groq', label: 'Groq' },
      { id: 'openrouter', label: 'OpenRouter' },
      { id: 'custom', label: 'Custom (Advanced)' },
    ]);
    expect(TEXT_LLM_PROVIDER_OPTIONS.map((option) => option.label)).not.toContain('OpenAI-compatible');
  });

  it('maps flat Text LLM provider options to runtime provider settings', () => {
    expect(getTextLLMProviderOptionValue('gemini')).toBe('gemini');
    expect(getTextLLMProviderOptionValue('ollama')).toBe('ollama');
    expect(getTextLLMProviderOptionValue('openai', 'mistral')).toBe('mistral');

    expect(resolveTextLLMProviderOption('mistral')).toMatchObject({
      providerType: 'openai',
      presetId: 'mistral',
    });
    expect(resolveTextLLMProviderOption('amazon_nova')).toMatchObject({
      providerType: 'openai',
      presetId: 'amazon_nova',
    });
    expect(resolveTextLLMProviderOption('gemini')).toMatchObject({
      providerType: 'gemini',
    });
  });
});
