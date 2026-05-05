import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acquireFaceVisionStream,
  resetFaceVisionStreamManagerForTests,
} from './faceVisionStreamManager';

type FakeTrack = MediaStreamTrack & {
  stop: ReturnType<typeof vi.fn>;
};

const createFakeTrack = (): FakeTrack => ({
  enabled: true,
  id: `track-${Math.random().toString(36).slice(2, 8)}`,
  kind: 'video',
  label: 'Fake Camera',
  muted: false,
  readyState: 'live',
  stop: vi.fn(),
  addEventListener: vi.fn(),
  applyConstraints: vi.fn(),
  clone: vi.fn(),
  dispatchEvent: vi.fn(),
  getCapabilities: vi.fn(),
  getConstraints: vi.fn(),
  getSettings: vi.fn(),
  removeEventListener: vi.fn(),
  onended: null,
  onmute: null,
  onunmute: null,
} as unknown as FakeTrack);

const createFakeStream = () => {
  const track = createFakeTrack();
  const stream = {
    active: true,
    id: `stream-${Math.random().toString(36).slice(2, 8)}`,
    getAudioTracks: () => [],
    getTrackById: () => track,
    getTracks: () => [track],
    getVideoTracks: () => [track],
    addTrack: vi.fn(),
    clone: vi.fn(),
    removeTrack: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onaddtrack: null,
    onremovetrack: null,
    onactive: null,
    oninactive: null,
  } as unknown as MediaStream;

  return { stream, track };
};

afterEach(() => {
  resetFaceVisionStreamManagerForTests();
});

describe('faceVisionStreamManager', () => {
  it('reuses one camera stream across multiple face-vision consumers', async () => {
    const first = createFakeStream();
    const getUserMedia = vi.fn(async () => first.stream);

    const leaseA = await acquireFaceVisionStream(getUserMedia);
    const leaseB = await acquireFaceVisionStream(getUserMedia);

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(leaseA.stream).toBe(first.stream);
    expect(leaseB.stream).toBe(first.stream);

    leaseA.release();
    expect(first.track.stop).not.toHaveBeenCalled();

    leaseB.release();
    expect(first.track.stop).toHaveBeenCalledTimes(1);
  });

  it('opens a fresh stream after the previous shared stream is fully released', async () => {
    const first = createFakeStream();
    const second = createFakeStream();
    const getUserMedia = vi
      .fn<() => Promise<MediaStream>>()
      .mockResolvedValueOnce(first.stream)
      .mockResolvedValueOnce(second.stream);

    const leaseA = await acquireFaceVisionStream(getUserMedia);
    leaseA.release();

    const leaseB = await acquireFaceVisionStream(getUserMedia);

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(leaseB.stream).toBe(second.stream);
    expect(first.track.stop).toHaveBeenCalledTimes(1);

    leaseB.release();
    expect(second.track.stop).toHaveBeenCalledTimes(1);
  });

  it('treats release as idempotent so cleanup races do not double-stop tracks', async () => {
    const fake = createFakeStream();
    const getUserMedia = vi.fn(async () => fake.stream);

    const lease = await acquireFaceVisionStream(getUserMedia);
    lease.release();
    lease.release();

    expect(fake.track.stop).toHaveBeenCalledTimes(1);
  });
});
