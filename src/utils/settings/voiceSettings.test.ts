import { beforeEach, describe, expect, it } from 'vitest';

import {
  getOllamaBaseUrl,
  getOpenAICompatibleProviderPresetId,
  getVoiceBackend,
  setOllamaBaseUrl,
  setOpenAICompatibleProviderPresetId,
  setVoiceBackend,
} from './voiceSettings';

describe('voice settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults fresh installs to the offline voice backend', () => {
    expect(getVoiceBackend()).toBe('offline');
  });

  it('preserves an explicitly saved voice backend', () => {
    setVoiceBackend('liveapi');

    expect(getVoiceBackend()).toBe('liveapi');
  });

  it('defaults the Ollama base URL to the local Ollama server', () => {
    expect(getOllamaBaseUrl()).toBe('http://localhost:11434');
  });

  it('preserves an explicitly saved Ollama base URL', () => {
    setOllamaBaseUrl('http://ollama.local:11434');

    expect(getOllamaBaseUrl()).toBe('http://ollama.local:11434');
  });

  it('accepts Amazon Nova as an OpenAI-compatible provider preset', () => {
    setOpenAICompatibleProviderPresetId('amazon_nova');

    expect(getOpenAICompatibleProviderPresetId()).toBe('amazon_nova');
  });
});
