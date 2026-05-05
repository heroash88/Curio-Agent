import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSharedAudioContext } from './audioContext';
import { RemoteTtsProvider } from './remoteTtsProvider';

vi.mock('./audioContext', () => ({
  getSharedAudioContext: vi.fn(),
}));

type FakeSource = {
  buffer: unknown;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
};

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const createSource = (autoEnd = false): FakeSource => {
  const source: FakeSource = {
    buffer: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(() => {
      if (autoEnd) {
        source.onended?.();
      }
    }),
    stop: vi.fn(() => {
      source.onended?.();
    }),
    onended: null,
  };
  return source;
};

const createAudioContext = (source: FakeSource) => ({
  state: 'running' as AudioContextState,
  destination: {},
  resume: vi.fn().mockResolvedValue(undefined),
  decodeAudioData: vi.fn().mockResolvedValue({ decoded: true }),
  createBufferSource: vi.fn(() => source),
});

const stubRemoteTtsFetch = () => {
  const arrayBuffer = new Uint8Array([1, 2, 3]).buffer;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer),
  }));
};

describe('RemoteTtsProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    stubRemoteTtsFetch();
  });

  it('plays remote speech through the shared AudioContext service', async () => {
    const source = createSource(true);
    const audioContext = createAudioContext(source);
    vi.mocked(getSharedAudioContext).mockReturnValue(audioContext as unknown as AudioContext);
    vi.stubGlobal('AudioContext', vi.fn(function MockAudioContext() {
      return audioContext;
    }));

    const provider = new RemoteTtsProvider();
    await provider.speak('Hello remote TTS', {
      baseUrl: 'http://tts.local',
      model: 'tts-1',
      apiKey: '',
    });

    expect(getSharedAudioContext).toHaveBeenCalledWith(true);
    expect(audioContext.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledWith(audioContext.destination);
    expect(source.start).toHaveBeenCalledWith(0);
  });

  it('stops and disconnects active buffer sources', async () => {
    const source = createSource(false);
    const audioContext = createAudioContext(source);
    vi.mocked(getSharedAudioContext).mockReturnValue(audioContext as unknown as AudioContext);
    vi.stubGlobal('AudioContext', vi.fn(function MockAudioContext() {
      return audioContext;
    }));

    const provider = new RemoteTtsProvider();
    const speaking = provider.speak('Stop this remote TTS', {
      baseUrl: 'http://tts.local',
      model: 'tts-1',
      apiKey: '',
    });

    await flush();
    await flush();

    expect(source.start).toHaveBeenCalledWith(0);

    await provider.stop();

    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    await expect(speaking).resolves.toBeUndefined();
  });
});
