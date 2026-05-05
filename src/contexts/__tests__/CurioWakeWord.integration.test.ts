import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  constructorCalls: 0,
  initCalls: 0,
  getUserMediaCalls: 0,
}));

const liveApiState = vi.hoisted(() => ({
  isConnected: false,
  isConnecting: false,
  isSpeaking: false,
  isMuted: false,
  connect: vi.fn(async () => undefined),
  disconnect: vi.fn(async () => undefined),
  globalMode: null as null | string,
  globalNavigate: vi.fn(),
  unlockAudio: vi.fn(async () => true),
  toggleCamera: vi.fn(),
  transcriptHistory: [] as Array<{ speaker: string; text: string }>,
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
      return { Hey_Curio: 0.1 };
    }

    reset() {}
  }

  return { Model: MockModel };
});

vi.mock('../../services/audioContext', () => ({
  getSharedAudioContext: vi.fn(() => mockAudioContext),
  lockAudioSuspend: vi.fn(),
  unlockAudioSuspend: vi.fn(),
}));

vi.mock('../../contexts/LiveAPIContext', () => ({
  useLiveAPI: () => liveApiState,
  useLiveAPIControls: () => liveApiState,
  useLiveAPIStreaming: () => ({
    isSpeaking: liveApiState.isSpeaking,
    transcriptHistory: liveApiState.transcriptHistory,
  }),
}));

vi.mock('../../contexts/CardManagerContext', () => ({
  useCardManager: () => ({
    emitCardEvent: vi.fn(),
  }),
}));

vi.mock('../../utils/settingsStorage', () => ({
  useLiveApiVoiceId: () => 'Aoede',
  useSelectedWakeWordId: () => 'hey-curio',
  useWakeWordEnabled: () => true,
  useSpeakerIdentificationEnabled: () => false,
  useSpeakerDefaultProfileId: () => '',
  useFaceRecognitionEnabled: () => false,
  subscribeToSettingsStorage: () => () => {},
  useSettingsStore: () => ({
    userName: '',
    weatherCity: '',
    tempUnit: 'f',
    homeLocation: '',
    workLocation: '',
  }),
  useUserName: () => '',
  useWeatherCity: () => '',
  useTempUnit: () => 'f',
  useHomeLocation: () => '',
  useWorkLocation: () => '',
  useCustomLocations: () => [],
  useVoiceBackend: () => 'liveapi',
  useWakeWordThreshold: () => null,
  useActivePersonalitySettings: () => ({ id: 'default', label: 'Default', prompt: '', source: 'preset' }),
}));

vi.mock('../../services/speakerProfileStore', () => ({
  useSpeakerProfiles: () => [],
}));

vi.mock('../../services/speakerIdentityRuntime', () => ({
  identifyResolvedSpeakerFromStream: vi.fn(async () => null),
}));

vi.mock('../../services/speakerSessionStore', () => ({
  applyResolvedSpeakerIdentity: vi.fn(),
  getSpeakerSessionState: () => ({
    activeProfileId: null,
    activeProfileName: null,
    source: 'none',
    recognizedBy: 'fallback',
    confidence: null,
  }),
}));

vi.mock('../../utils/appPageCatalog', () => ({
  createGlobalMascotHandler: () => vi.fn(),
}));

vi.mock('../../services/liveSessionConfig', () => ({
  SUBJECT_CONFIG: {},
}));

vi.mock('../../services/audioService', () => ({
  playCurioGreeting: vi.fn(),
}));

vi.mock('../../components/curio/curioSystemPrompt', () => ({
  getCurioSystemPrompt: () => 'prompt',
}));

vi.mock('../../services/musicPlaybackService', () => ({
  musicPlaybackService: {
    getState: () => ({ playbackState: 'paused' }),
    pause: vi.fn(async () => undefined),
  },
}));

class MockAudioWorkletNode {
  port = { onmessage: null as ((event: MessageEvent<Float32Array>) => void) | null };
  connect = vi.fn();
  disconnect = vi.fn();
}

const setupBrowserMocks = () => {
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

describe('CurioWakeWord re-arm behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockState.constructorCalls = 0;
    mockState.initCalls = 0;
    mockState.getUserMediaCalls = 0;
    liveApiState.isConnected = false;
    liveApiState.isConnecting = false;
    liveApiState.isSpeaking = false;
    liveApiState.isMuted = false;
    liveApiState.transcriptHistory = [];
    setupBrowserMocks();
  });

  it('re-arms and re-initializes the ONNX model after a connect/disconnect cycle', async () => {
    const { CurioWakeWord } = await import('../../components/curio/CurioWakeWord');
    const view = render(React.createElement(CurioWakeWord));

    await waitFor(() => {
      expect(mockState.initCalls).toBe(1);
      expect(mockState.getUserMediaCalls).toBe(1);
    });

    // Simulate Live API connection — stopListening releases the ONNX model
    liveApiState.isConnected = true;
    view.rerender(React.createElement(CurioWakeWord));

    await waitFor(() => {
      expect(mockState.initCalls).toBe(1);
    });

    // Simulate disconnect — startListening re-creates the model to resume detection
    liveApiState.isConnected = false;
    view.rerender(React.createElement(CurioWakeWord));

    await waitFor(() => {
      expect(mockState.getUserMediaCalls).toBe(2);
      // Model is re-initialized because stopListening now releases it to free memory
      expect(mockState.initCalls).toBe(2);
    });
  });

  it('re-arms wake word after unmuting without opening an extra idle session mic path', async () => {
    const { CurioWakeWord } = await import('../../components/curio/CurioWakeWord');

    liveApiState.isMuted = true;
    const view = render(React.createElement(CurioWakeWord));

    await waitFor(() => {
      expect(mockState.getUserMediaCalls).toBe(0);
    });

    liveApiState.isMuted = false;
    view.rerender(React.createElement(CurioWakeWord));

    await waitFor(() => {
      expect(mockState.getUserMediaCalls).toBe(1);
      expect(mockState.initCalls).toBeGreaterThanOrEqual(1);
    });
  });
});
