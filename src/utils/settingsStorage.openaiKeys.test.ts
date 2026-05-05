import { beforeEach, describe, expect, it, vi } from 'vitest';

const secretStorageMock = vi.hoisted(() => {
  const secrets = new Map<string, string>();
  return {
    secrets,
    getSecret: vi.fn(async (key: string) => secrets.get(key) || ''),
    getSecretSync: vi.fn((key: string) => {
      const raw = localStorage.getItem(key) || '';
      return raw && !raw.startsWith('enc::') ? raw : '';
    }),
    setSecret: vi.fn(async (key: string, value: string) => {
      const trimmed = value.trim();
      if (trimmed) {
        secrets.set(key, trimmed);
        localStorage.setItem(key, `enc::${btoa(trimmed)}`);
      } else {
        secrets.delete(key);
        localStorage.removeItem(key);
      }
    }),
  };
});

vi.mock('./secretStorage', () => ({
  getSecret: secretStorageMock.getSecret,
  getSecretSync: secretStorageMock.getSecretSync,
  setSecret: secretStorageMock.setSecret,
}));

import {
  getOpenAICompatibleApiKeyStorageKey,
  getOpenAICompatibleProviderPresetId,
  getOpenaiApiKey,
  getOpenaiApiKeyAsync,
  setOpenAIApiKey,
} from './settingsStorage';

describe('OpenAI-compatible API key storage', () => {
  beforeEach(() => {
    localStorage.clear();
    secretStorageMock.secrets.clear();
    secretStorageMock.getSecret.mockClear();
    secretStorageMock.getSecretSync.mockClear();
    secretStorageMock.setSecret.mockClear();
  });

  it('stores API keys separately for each provider and model', async () => {
    const openAIKey = getOpenAICompatibleApiKeyStorageKey(
      'openai',
      'gpt-4o-mini',
      'https://api.openai.com',
    );
    const groqKey = getOpenAICompatibleApiKeyStorageKey(
      'groq',
      'openai/gpt-oss-20b',
      'https://api.groq.com/openai/v1',
    );

    expect(openAIKey).not.toBe(groqKey);

    await setOpenAIApiKey('sk-openai', 'openai', 'gpt-4o-mini', 'https://api.openai.com');
    await setOpenAIApiKey('gsk-groq', 'groq', 'openai/gpt-oss-20b', 'https://api.groq.com/openai/v1');

    expect(secretStorageMock.setSecret).toHaveBeenCalledWith(openAIKey, 'sk-openai');
    expect(secretStorageMock.setSecret).toHaveBeenCalledWith(groqKey, 'gsk-groq');
    expect(localStorage.getItem(openAIKey)).toBe('enc::c2stb3BlbmFp');
    expect(localStorage.getItem(groqKey)).toBe('enc::Z3NrLWdyb3E=');
    expect(await getOpenaiApiKeyAsync('openai', 'gpt-4o-mini', 'https://api.openai.com')).toBe('sk-openai');
    expect(await getOpenaiApiKeyAsync('groq', 'openai/gpt-oss-20b', 'https://api.groq.com/openai/v1')).toBe('gsk-groq');
    expect(await getOpenaiApiKeyAsync('openai', 'gpt-4o', 'https://api.openai.com')).toBe('');
  });

  it('does not reuse a provider key after switching OpenRouter models', async () => {
    await setOpenAIApiKey(
      'sk-or-openrouter',
      'openrouter',
      'openai/gpt-4o-mini',
      'https://openrouter.ai/api/v1',
    );

    await expect(
      getOpenaiApiKeyAsync(
        'openrouter',
        'google/gemini-2.5-flash',
        'https://openrouter.ai/api/v1',
        { allowLegacyFallback: false },
      ),
    ).resolves.toBe('');
  });

  it('keeps blank-model keys separate from concrete model keys', async () => {
    await setOpenAIApiKey(
      'gsk-provider',
      'groq',
      '',
      'https://api.groq.com/openai/v1',
    );

    await setOpenAIApiKey(
      '',
      'groq',
      'llama-3.3-70b-versatile',
      'https://api.groq.com/openai/v1',
    );

    await expect(
      getOpenaiApiKeyAsync(
        'groq',
        'llama-3.3-70b-versatile',
        'https://api.groq.com/openai/v1',
        { allowLegacyFallback: false },
      ),
    ).resolves.toBe('');
    await expect(
      getOpenaiApiKeyAsync(
        'groq',
        '',
        'https://api.groq.com/openai/v1',
        { allowLegacyFallback: false },
      ),
    ).resolves.toBe('gsk-provider');
  });

  it('does not migrate an existing model key into another model slot', async () => {
    const oldModelKey = getOpenAICompatibleApiKeyStorageKey(
      'openrouter',
      'openai/gpt-4o-mini',
      'https://openrouter.ai/api/v1',
    );
    const providerKey = getOpenAICompatibleApiKeyStorageKey(
      'openrouter',
      '',
      'https://openrouter.ai/api/v1',
    );

    secretStorageMock.secrets.set(oldModelKey, 'sk-or-existing');
    localStorage.setItem(oldModelKey, 'enc::c2stb3ItZXhpc3Rpbmc=');

    await expect(
      getOpenaiApiKeyAsync(
        'openrouter',
        'google/gemini-2.5-flash',
        'https://openrouter.ai/api/v1',
        { allowLegacyFallback: false },
      ),
    ).resolves.toBe('');
    expect(secretStorageMock.setSecret).not.toHaveBeenCalledWith(providerKey, 'sk-or-existing');
  });

  it('only uses legacy fallback when explicitly requested', async () => {
    secretStorageMock.secrets.set('curio_openai_api_key', 'legacy-openai-key');
    localStorage.setItem('curio_openai_api_key', 'legacy-openai-key');
    const scopedKey = getOpenAICompatibleApiKeyStorageKey(
      'openai',
      'gpt-4o-mini',
      'https://api.openai.com',
    );

    await expect(
      getOpenaiApiKeyAsync(
        'groq',
        'openai/gpt-oss-20b',
        'https://api.groq.com/openai/v1',
        { allowLegacyFallback: false },
      ),
    ).resolves.toBe('');

    await expect(
      getOpenaiApiKeyAsync(
        'openai',
        'gpt-4o-mini',
        'https://api.openai.com',
      ),
    ).resolves.toBe('');

    await expect(
      getOpenaiApiKeyAsync(
        'openai',
        'gpt-4o-mini',
        'https://api.openai.com',
        { allowLegacyFallback: true },
      ),
    ).resolves.toBe('legacy-openai-key');
    expect(secretStorageMock.setSecret).not.toHaveBeenCalledWith(scopedKey, 'legacy-openai-key');
  });

  it('does not write provider-level fallback keys when saving model keys', async () => {
    const providerKey = getOpenAICompatibleApiKeyStorageKey(
      'openai',
      '',
      'https://api.openai.com',
    );

    await setOpenAIApiKey('sk-openai', 'openai', 'gpt-4o-mini', 'https://api.openai.com');

    expect(secretStorageMock.setSecret).not.toHaveBeenCalledWith(providerKey, 'sk-openai');
    expect(localStorage.getItem(providerKey)).toBeNull();
  });

  it('does not expose encrypted blobs through the synchronous getter', () => {
    const storageKey = getOpenAICompatibleApiKeyStorageKey(
      'openai',
      'gpt-4o-mini',
      'https://api.openai.com',
    );

    localStorage.setItem(storageKey, 'enc::not-plaintext');

    expect(getOpenaiApiKey(
      'openai',
      'gpt-4o-mini',
      'https://api.openai.com',
      { allowLegacyFallback: false },
    )).toBe('');
  });

  it('maps retired Azure, AWS, and Nova presets back to OpenAI-compatible defaults', () => {
    for (const retiredPreset of ['azure', 'aws', 'nova']) {
      localStorage.setItem('curio_openai_provider_preset', retiredPreset);

      expect(getOpenAICompatibleProviderPresetId()).toBe('openai');
    }
  });
});
