import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHaCameraState = vi.hoisted(() => ({
  instances: [] as Array<{
    isStreaming: boolean;
    stop: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {},
  LiveServerMessage: {},
  Modality: { AUDIO: 'AUDIO' },
  Type: {
    ARRAY: 'ARRAY',
    BOOLEAN: 'BOOLEAN',
    INTEGER: 'INTEGER',
    NUMBER: 'NUMBER',
    OBJECT: 'OBJECT',
    STRING: 'STRING',
  },
}));

vi.mock('./haCameraManager', () => {
  class MockHaCameraManager {
    isStreaming = false;
    stop = vi.fn();
    dispose = vi.fn();

    constructor() {
      mockHaCameraState.instances.push(this);
    }
  }

  return { HaCameraManager: MockHaCameraManager };
});

describe('live clients HA camera manager lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHaCameraState.instances.length = 0;
  });

  it('disposes the Gemini Live HA camera manager on disconnect', async () => {
    const { LiveClient } = await import('./liveApiLive');
    const client = new LiveClient('test-api-key', vi.fn(), 'test-model');
    const manager = mockHaCameraState.instances.at(-1);

    await client.disconnect();

    expect(manager?.dispose).toHaveBeenCalledWith(false);
  }, 20000);

  it('disposes the Nova HA camera manager on disconnect', async () => {
    const { NovaClient } = await import('./novaLive');
    const client = new NovaClient('test-api-key', vi.fn(), 'test-model');
    const manager = mockHaCameraState.instances.at(-1);

    await client.disconnect();

    expect(manager?.dispose).toHaveBeenCalledWith(false);
  }, 20000);
});
