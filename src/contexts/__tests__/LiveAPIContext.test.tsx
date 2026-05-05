import React, { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveModuleMode } from '../../services/liveSessionConfig';

const mockState = vi.hoisted(() => ({
  clients: [] as Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onStatusChange: (status: { isConnected: boolean; isSpeaking: boolean; error: string | null }) => void;
  }>,
  stopCamera: vi.fn(),
}));

vi.mock('../../services/ai/config', () => ({
  getApiKeyAsync: vi.fn(async () => 'test-api-key'),
  getGeminiLiveModel: vi.fn(() => 'gemini-3.1-flash-live-preview'),
  getNovaApiKeyAsync: vi.fn(async () => ''),
  getNovaVoice: vi.fn(() => 'nova-voice'),
}));

vi.mock('../../services/liveApiLive', () => {
  class MockLiveClient {
    connect = vi.fn(async () => {
      this.onStatusChange({ isConnected: true, isSpeaking: false, error: null });
    });

    disconnect = vi.fn(async () => {
      this.onStatusChange({ isConnected: false, isSpeaking: false, error: null });
    });

    muteMicWhileSpeaking = false;
    clearVoiceEnabled = true;
    voiceGateThreshold = 0;
    speakerMuted = false;
    isMuted = false;
    analyserNode = null;
    isHaCameraStreaming = false;
    onResumptionTokenReceived?: (token: string) => void;
    onResumptionFailed?: () => void;
    sendTextTurn = vi.fn();
    sendSystemNote = vi.fn();
    sendVideoFrame = vi.fn();
    sendAudioStreamEnd = vi.fn();
    setInputGainDb = vi.fn();

    constructor(
      _apiKey: string,
      public onStatusChange: (status: { isConnected: boolean; isSpeaking: boolean; error: string | null }) => void,
    ) {
      mockState.clients.push(this);
    }
  }

  return {
    LiveClient: MockLiveClient,
    SUBJECT_CONFIG: {},
  };
});

vi.mock('../../services/novaLive', () => ({
  NovaClient: vi.fn(),
}));

vi.mock('../../services/audioContext', () => ({
  unlockAudioContext: vi.fn(async () => true),
  isSafariBrowser: false,
}));

vi.mock('../../utils/haMcpRuntimeStatus', () => ({
  resetHaMcpRuntimeStatus: vi.fn(),
  setHaMcpRuntimeStatus: vi.fn(),
}));

vi.mock('../../services/runtimePerformanceProfile', () => ({
  useRuntimePerformanceProfile: () => ({ allowDisconnectedPreload: false }),
}));

vi.mock('../../services/volumeStore', () => ({
  setVolume: vi.fn(),
}));

vi.mock('../../services/audioWorkletCapture', () => ({
  revokeProcessorBlobUrls: vi.fn(),
}));

vi.mock('../../services/novaAudioWorklet', () => ({
  revokeNovaProcessorBlobUrls: vi.fn(),
}));

vi.mock('../../services/customWakeWordStore', () => ({
  revokeAllCustomWakeWordBlobUrls: vi.fn(),
}));

vi.mock('../../services/browserIdlePolicy', () => ({
  getSessionMicRestoreMode: vi.fn(() => 'defer'),
}));

vi.mock('../../utils/settingsStorage', () => ({
  useHaMcpEnabled: () => false,
  useHaMcpToken: () => '',
  useHaMcpUrl: () => '',
  useHaApiMode: () => 'mcp',
  getHaMcpTokenAsync: vi.fn(async () => ''),
  useGenericMcpServers: () => [],
  useMuteMicWhileAiSpeaking: () => false,
  useWakeWordEnabled: () => false,
  useLowPowerMode: () => false,
  useSpeakerMuted: () => false,
  useVoiceBackend: () => 'liveapi',
  useClearVoiceEnabled: () => true,
  useVoiceGateThreshold: () => 0,
}));

vi.mock('../../services/wakeWordService', () => ({
  stopListening: vi.fn(),
  isListening: vi.fn(() => false),
}));

vi.mock('../../hooks/useCameraCapture', () => ({
  useCameraCapture: () => ({
    cameraEnabled: false,
    userFacingCamera: false,
    canFlipCamera: false,
    showCameraPreview: false,
    mediaStream: null,
    setCameraEnabled: vi.fn(),
    setShowCameraPreview: vi.fn(),
    toggleCamera: vi.fn(async () => ({ success: true, enabled: false })),
    flipCamera: vi.fn(async () => ({ success: false, enabled: false })),
    stopCamera: mockState.stopCamera,
    primeCameraPermission: vi.fn(async () => true),
    primeMicrophonePermission: vi.fn(async () => true),
    primeAllPermissions: vi.fn(async () => ({ camera: true, microphone: true })),
    normalizeInitialStreamForSession: (stream: MediaStream) => stream,
  }),
}));

vi.mock('../CardManagerContext', () => ({
  CardManagerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useCardManager: () => ({ emitCardEvent: vi.fn() }),
}));

vi.mock('../../hooks/useTimerTick', () => ({
  TimerTickProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../components/cards/CardStack', () => ({
  default: () => null,
}));

vi.mock('../../components/desktop/DesktopCardBridgeHost', () => ({
  default: () => null,
}));

vi.mock('../../services/cardDebug', () => ({
  setDebugEmitter: vi.fn(),
}));

const createStream = () => ({
  getTracks: () => [
    {
      enabled: true,
      stop: vi.fn(),
    },
  ],
}) as unknown as MediaStream;

type Controls = {
  connect: (
    mode: LiveModuleMode,
    handler?: unknown,
    systemInstruction?: string,
    voiceName?: string,
    initialStream?: MediaStream,
  ) => Promise<void>;
};

describe('LiveAPIProvider connection lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.clients = [];
    localStorage.clear();
  });

  it('does not let an abandoned overlapping Gemini connect become a second active session', async () => {
    const { LiveAPIProvider, useLiveAPIControls } = await import('../LiveAPIContext');
    let controls: Controls | null = null;

    const Probe = () => {
      const liveControls = useLiveAPIControls();
      useEffect(() => {
        controls = liveControls;
      }, [liveControls]);
      return null;
    };

    render(
      <LiveAPIProvider>
        <Probe />
      </LiveAPIProvider>,
    );

    await waitFor(() => expect(controls).not.toBeNull());

    let firstConnect!: Promise<void>;
    let secondConnect!: Promise<void>;

    await act(async () => {
      firstConnect = controls!.connect('global', {}, 'prompt', 'Aoede', createStream());
      secondConnect = controls!.connect('global', {}, 'prompt', 'Aoede', createStream());
      await Promise.allSettled([firstConnect, secondConnect]);
    });

    const connectedClients = mockState.clients.filter((client) => client.connect.mock.calls.length > 0);
    expect(connectedClients).toHaveLength(1);
  });
});
