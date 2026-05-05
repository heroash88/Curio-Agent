import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  constructorCalls: 0,
  initCalls: 0,
  predictCalls: 0,
  resetCalls: 0,
  getUserMediaCalls: 0,
}));

const mockAudioContext = vi.hoisted(() => ({
  state: 'running' as AudioContextState,
  sampleRate: 48000,
  audioWorklet: {
    addModule: vi.fn(async () => undefined),
  },
  resume: vi.fn(async () => undefined),
  createMediaStreamSource: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
  createGain: vi.fn(() => ({
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
  createMediaStreamDestination: vi.fn(() => ({})),
}));

vi.mock('openwakeword-js', () => {
  class MockModel {
    constructor() {
      mockState.constructorCalls += 1;
    }

    async init() {
      mockState.initCalls += 1;
    }

    async predict() {
      mockState.predictCalls += 1;
      return { Hey_Curio: 0.1 };
    }

    reset() {
      mockState.resetCalls += 1;
    }
  }

  return { Model: MockModel };
});

vi.mock('./audioContext', () => ({
  getSharedAudioContext: vi.fn(() => mockAudioContext),
  lockAudioSuspend: vi.fn(),
  unlockAudioSuspend: vi.fn(),
}));

class MockAudioWorkletNode {
  port = { onmessage: null as ((event: MessageEvent<Float32Array>) => void) | null };
  connect = vi.fn();
  disconnect = vi.fn();
}

const setupBrowserMocks = () => {
  mockState.getUserMediaCalls = 0;
  Object.defineProperty(globalThis, 'AudioWorkletNode', {
    configurable: true,
    value: MockAudioWorkletNode,
  });
  Object.defineProperty(globalThis.URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => 'blob:wakeword'),
  });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        mockState.getUserMediaCalls += 1;
        return {
          getTracks: () => [
            {
              enabled: true,
              stop: vi.fn(),
            },
          ],
        } as unknown as MediaStream;
      }),
    },
  });
};

const loadService = async () => import('./wakeWordService');

describe('wakeWordService hybrid cache', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockState.constructorCalls = 0;
    mockState.initCalls = 0;
    mockState.predictCalls = 0;
    mockState.resetCalls = 0;
    mockAudioContext.audioWorklet.addModule.mockClear();
    mockAudioContext.resume.mockClear();
    mockAudioContext.createMediaStreamSource.mockClear();
    mockAudioContext.createGain.mockClear();
    mockAudioContext.createMediaStreamDestination.mockClear();
    setupBrowserMocks();
  });

  it('preloads the same wake word only once', async () => {
    const service = await loadService();

    await service.preloadWakeWordModel({ wakeWordId: 'hey-curio' });
    await service.preloadWakeWordModel({ wakeWordId: 'hey-curio' });

    expect(mockState.constructorCalls).toBe(1);
    expect(mockState.initCalls).toBe(1);
  });

  it('releases the ONNX runtime on stopListening and re-initializes on next start', async () => {
    const service = await loadService();

    await service.startListening({ wakeWordId: 'hey-curio' });
    service.stopListening();
    await service.startListening({ wakeWordId: 'hey-curio' });

    // stopListening now releases the model to free memory on low-end devices,
    // so the second startListening must re-create and re-init the model.
    expect(mockState.initCalls).toBe(2);
    expect(mockState.getUserMediaCalls).toBe(2);
  });

  it('rebuilds the runtime when the wake word changes', async () => {
    const service = await loadService();

    await service.preloadWakeWordModel({ wakeWordId: 'hey-curio' });
    await service.preloadWakeWordModel({ wakeWordId: 'bimo' });

    expect(mockState.constructorCalls).toBe(2);
    expect(mockState.initCalls).toBe(2);
  });

  it('does not rebuild the runtime when only the threshold changes', async () => {
    const service = await loadService();

    await service.startListening({ wakeWordId: 'hey-curio', detectionThreshold: 0.25 });
    await service.startListening({ wakeWordId: 'hey-curio', detectionThreshold: 0.6 });

    expect(mockState.initCalls).toBe(1);
  });

  it('drops the cache when releaseWakeWordRuntime is called', async () => {
    const service = await loadService();

    await service.preloadWakeWordModel({ wakeWordId: 'hey-curio' });
    service.releaseWakeWordRuntime();
    await service.startListening({ wakeWordId: 'hey-curio' });

    expect(mockState.initCalls).toBe(2);
  });
});
