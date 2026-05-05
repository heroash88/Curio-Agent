import { beforeEach, describe, expect, it, vi } from 'vitest';

const settingsMock = vi.hoisted(() => ({
  getCustomLLMApiKeyAsync: vi.fn(),
  getCustomLLMBaseUrl: vi.fn(),
  getCustomLLMModel: vi.fn(),
  getCustomLLMProviderType: vi.fn(),
  getOpenAICompatibleProviderPresetId: vi.fn(),
}));

const geminiConfigMock = vi.hoisted(() => ({
  getApiKeyAsync: vi.fn(),
  getGeminiTextApiKeyAsync: vi.fn(),
}));

vi.mock('../../utils/settingsStorage', () => settingsMock);
vi.mock('./config', () => geminiConfigMock);

import {
  customLLMProviderConfigHasNativeSearch,
  getConfiguredCustomLLMProviderConfig,
  getMissingCustomLLMCredentialMessage,
  hasConfiguredCustomLLMCredential,
} from './customLlmRuntime';

describe('custom LLM provider config', () => {
  beforeEach(() => {
    settingsMock.getCustomLLMProviderType.mockReturnValue('openai');
    settingsMock.getCustomLLMBaseUrl.mockReturnValue('https://api.openai.com');
    settingsMock.getCustomLLMModel.mockReturnValue('gpt-4o-mini');
    settingsMock.getCustomLLMApiKeyAsync.mockResolvedValue('provider-key');
    settingsMock.getOpenAICompatibleProviderPresetId.mockReturnValue('openai');
    geminiConfigMock.getApiKeyAsync.mockResolvedValue('live-gemini-key');
    geminiConfigMock.getGeminiTextApiKeyAsync.mockResolvedValue('text-gemini-key');
  });

  it('configures OpenAI-compatible providers with their stored key and model', async () => {
    await expect(getConfiguredCustomLLMProviderConfig()).resolves.toMatchObject({
      type: 'openai',
      baseUrl: 'https://api.openai.com',
      apiKey: 'provider-key',
      model: 'gpt-4o-mini',
      openAICompatible: {
        auth: {
          type: 'bearer',
          token: 'provider-key',
        },
      },
    });
  });

  it('configures Gemini as a direct text LLM provider', async () => {
    settingsMock.getCustomLLMProviderType.mockReturnValue('gemini');
    settingsMock.getCustomLLMBaseUrl.mockReturnValue('');
    settingsMock.getCustomLLMModel.mockReturnValue('gemini-2.5-flash');

    await expect(getConfiguredCustomLLMProviderConfig()).resolves.toMatchObject({
      type: 'gemini',
      apiKey: 'text-gemini-key',
      model: 'gemini-2.5-flash',
      nativeSearch: { type: 'gemini-google-search' },
    });
    expect(geminiConfigMock.getApiKeyAsync).not.toHaveBeenCalled();
  });

  it('enables Amazon Nova native grounding for Nova 2 text models', async () => {
    settingsMock.getCustomLLMProviderType.mockReturnValue('openai');
    settingsMock.getOpenAICompatibleProviderPresetId.mockReturnValue('amazon_nova');
    settingsMock.getCustomLLMBaseUrl.mockReturnValue('https://api.nova.amazon.com/v1');
    settingsMock.getCustomLLMModel.mockReturnValue('nova-2-lite-v1');

    const config = await getConfiguredCustomLLMProviderConfig();

    expect(customLLMProviderConfigHasNativeSearch(config)).toBe(true);
    expect(config).toMatchObject({
      nativeSearch: { type: 'nova-grounding' },
      openAICompatible: {
        nativeSearch: { type: 'nova-grounding' },
      },
    });
  });

  it('detects OpenAI search-preview models as native-search text providers', async () => {
    settingsMock.getCustomLLMProviderType.mockReturnValue('openai');
    settingsMock.getOpenAICompatibleProviderPresetId.mockReturnValue('openai');
    settingsMock.getCustomLLMBaseUrl.mockReturnValue('https://api.openai.com');
    settingsMock.getCustomLLMModel.mockReturnValue('gpt-4o-search-preview');

    const config = await getConfiguredCustomLLMProviderConfig();

    expect(customLLMProviderConfigHasNativeSearch(config)).toBe(true);
    expect(config).toMatchObject({
      nativeSearch: { type: 'openai-web-search' },
      openAICompatible: {
        nativeSearch: { type: 'openai-web-search' },
      },
    });
  });

  it('requires a direct Gemini API key when Gemini is selected', async () => {
    settingsMock.getCustomLLMProviderType.mockReturnValue('gemini');
    settingsMock.getCustomLLMModel.mockReturnValue('gemini-2.5-flash');
    geminiConfigMock.getGeminiTextApiKeyAsync.mockResolvedValue('');

    const config = await getConfiguredCustomLLMProviderConfig();

    expect(hasConfiguredCustomLLMCredential(config)).toBe(false);
    expect(getMissingCustomLLMCredentialMessage(config)).toBe(
      'No Gemini API key found. Add it in Settings > Voice & AI > Gemini.',
    );
  });
});
