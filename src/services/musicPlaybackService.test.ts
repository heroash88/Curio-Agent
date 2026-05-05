import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./spotifyApi', () => ({
  playSpotifyCatalogItem: vi.fn(async () => {}),
  pauseSpotifyPlayback: vi.fn(async () => {}),
  resumeSpotifyPlayback: vi.fn(async () => {}),
  seekSpotifyPlayback: vi.fn(async () => {}),
  setSpotifyVolume: vi.fn(async () => {}),
  getSpotifyCurrentlyPlaying: vi.fn(async () => null),
}));

const PLAYER_STATES = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
};

const loadService = async () => import('./musicPlaybackService');

describe('musicPlaybackService', () => {
  const setNavigatorLike = (platform: string, maxTouchPoints: number, userAgent: string) => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: platform,
    });
    Object.defineProperty(window.navigator, 'maxTouchPoints', {
      configurable: true,
      value: maxTouchPoints,
    });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: userAgent,
    });
  };

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    window.localStorage.clear();
    delete window.YT;
    delete window.onYouTubeIframeAPIReady;
    document.getElementById('curio-youtube-music-player')?.remove();
    document.querySelector('script[data-curio-youtube-iframe="true"]')?.remove();
    setNavigatorLike('MacIntel', 0, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a real-size YouTube iframe player so onReady can fire reliably', async () => {
    const playerCalls: Array<{
      iframeId: string;
      options: Record<string, unknown>;
      instance: {
        loadVideoById: ReturnType<typeof vi.fn>;
        setVolume: ReturnType<typeof vi.fn>;
      };
    }> = [];

    class MockPlayer {
      loadVideoById = vi.fn();
      setVolume = vi.fn();
      getPlayerState = vi.fn(() => PLAYER_STATES.BUFFERING);

      constructor(iframeId: string, options: Record<string, any>) {
        playerCalls.push({ iframeId, options, instance: this });
        options.events?.onReady?.();
      }
    }

    window.YT = {
      Player: MockPlayer as any,
      PlayerState: PLAYER_STATES,
    };

    const { musicPlaybackService } = await loadService();
    const snapshot = await musicPlaybackService.play({
      videoId: 'abc123',
      query: 'test song',
      title: 'Test Song',
      artistOrChannel: 'Curio Channel',
      thumbnailUrl: 'https://img.youtube.com/vi/abc123/hqdefault.jpg',
    });

    expect(playerCalls).toHaveLength(1);
    // Player is now created via "existing iframe" pattern — the iframe is
    // built by the service and the API wraps it by ID.
    expect(playerCalls[0].iframeId).toBe('curio-youtube-music-player-iframe');

    // The iframe element should exist and have the embed URL with the video id.
    const iframe = document.getElementById('curio-youtube-music-player-iframe') as HTMLIFrameElement | null;
    expect(iframe).toBeInstanceOf(HTMLIFrameElement);
    expect(iframe?.src).toContain('/embed/abc123');
    expect(iframe?.src).toContain('enablejsapi=1');
    expect(iframe?.getAttribute('credentialless')).toBe('true');
    expect(iframe?.referrerPolicy).toBe('strict-origin-when-cross-origin');

    // Host div should be full-size for reliable iframe loading.
    const host = document.getElementById('curio-youtube-music-player');
    expect(host?.style.width).toBe('220px');
    expect(host?.style.height).toBe('220px');
    expect(host?.style.clipPath).toBe('');
    expect(host?.style.zIndex).toBe('-1');
    expect(host?.style.opacity).toBe('');
    expect(host?.style.transform).toBe('');

    expect(playerCalls[0].instance.setVolume).toHaveBeenCalledWith(70);
    expect(playerCalls[0].instance.loadVideoById).toHaveBeenCalledWith('abc123');
    expect(snapshot.videoId).toBe('abc123');
    expect(snapshot.playbackState).toBe('loading');
    expect(snapshot.error).toBeUndefined();

    await musicPlaybackService.stop();
  });

  it('starts Spotify playback without mounting the hidden YouTube iframe player', async () => {
    const spotifyApi = await import('./spotifyApi');
    const { musicPlaybackService } = await loadService();

    const snapshot = await musicPlaybackService.play({
      source: 'spotify',
      itemType: 'track',
      id: 'spotify_track_1',
      uri: 'spotify:track:spotify_track_1',
      query: 'digital love',
      title: 'Digital Love',
      artistOrChannel: 'Daft Punk',
      thumbnailUrl: 'https://i.scdn.co/image/track',
      albumName: 'Discovery',
      durationSeconds: 301,
    } as any);

    expect(spotifyApi.playSpotifyCatalogItem).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'spotify',
        itemType: 'track',
        uri: 'spotify:track:spotify_track_1',
      }),
    );
    expect(snapshot.source).toBe('spotify');
    expect(snapshot.videoId).toBeNull();
    expect(snapshot.id).toBe('spotify_track_1');
    expect(snapshot.uri).toBe('spotify:track:spotify_track_1');
    expect(snapshot.playbackState).toBe('playing');
    expect(document.getElementById('curio-youtube-music-player')).toBeNull();

    await musicPlaybackService.stop();
  });

  it('does not treat a mounted iframe as playable until YouTube reports ready', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const playerCalls: Array<{
      iframeId: string;
      instance: {
        loadVideoById: ReturnType<typeof vi.fn>;
        setVolume: ReturnType<typeof vi.fn>;
      };
    }> = [];

    class MockPlayer {
      loadVideoById = vi.fn();
      setVolume = vi.fn();
      getPlayerState = vi.fn(() => PLAYER_STATES.BUFFERING);

      constructor(iframeId: string, _options: Record<string, any>) {
        playerCalls.push({ iframeId, instance: this });
        // Intentionally never calls onReady.
      }
    }

    window.YT = {
      Player: MockPlayer as any,
      PlayerState: PLAYER_STATES,
    };

    const { musicPlaybackService } = await loadService();
    const playPromise = musicPlaybackService.play({
      videoId: 'chrome123',
      query: 'chrome song',
      title: 'Chrome Song',
      artistOrChannel: 'Curio Channel',
      thumbnailUrl: 'https://img.youtube.com/vi/chrome123/hqdefault.jpg',
    });

    await Promise.resolve();

    // The service creates the iframe directly; the host div contains it.
    const host = document.getElementById('curio-youtube-music-player');
    expect(host).toBeTruthy();
    const iframe = host?.querySelector('iframe');
    expect(iframe).toBeInstanceOf(HTMLIFrameElement);
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);

    const snapshot = await playPromise;

    expect(playerCalls).toHaveLength(1);
    expect(playerCalls[0].instance.loadVideoById).not.toHaveBeenCalled();
    expect(snapshot.videoId).toBe('chrome123');
    expect(snapshot.playbackState).toBe('error');
    expect(snapshot.error).toBe('YouTube Player initialization timed out after 10s');

    await musicPlaybackService.stop();
  });

  it('surfaces YouTube embed-blocked errors without retrying hosts', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const playerCalls: string[] = [];

    class MockPlayer {
      destroy = vi.fn();
      loadVideoById = vi.fn();
      setVolume = vi.fn();
      getPlayerState = vi.fn(() => PLAYER_STATES.UNSTARTED);

      constructor(iframeId: string, options: Record<string, any>) {
        playerCalls.push(iframeId);
        options.events?.onError?.({ data: 150 });
      }
    }

    window.YT = {
      Player: MockPlayer as any,
      PlayerState: PLAYER_STATES,
    };

    const { musicPlaybackService } = await loadService();
    const snapshot = await musicPlaybackService.play({
      videoId: 'blocked123',
      query: 'blocked song',
      title: 'Blocked Song',
      artistOrChannel: 'Curio Channel',
      thumbnailUrl: 'https://img.youtube.com/vi/blocked123/hqdefault.jpg',
    });

    expect(playerCalls).toEqual(['curio-youtube-music-player-iframe']);
    expect(snapshot.videoId).toBe('blocked123');
    expect(snapshot.playbackState).toBe('error');
    expect(snapshot.error).toBe('YouTube blocked this video from playing inside Curio on this device.');

    await musicPlaybackService.stop();
  });

  it('uses manual visible playback on iOS WebKit instead of the hidden iframe player', async () => {
    setNavigatorLike(
      'MacIntel',
      5,
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    );

    const { musicPlaybackService } = await loadService();
    const snapshot = await musicPlaybackService.play({
      videoId: 'ios123',
      query: 'ios song',
      title: 'iOS Song',
      artistOrChannel: 'Curio Channel',
      thumbnailUrl: 'https://img.youtube.com/vi/ios123/hqdefault.jpg',
    });

    expect(snapshot.videoId).toBe('ios123');
    expect(snapshot.playbackState).toBe('ready');
    expect(snapshot.autoplayBlocked).toBe(true);
    expect(snapshot.error).toBeUndefined();
    expect(document.getElementById('curio-youtube-music-player')).toBeNull();
    expect(document.querySelector('script[data-curio-youtube-iframe="true"]')).toBeNull();
  });

  it('times out cleanly when the YouTube player never becomes ready', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const playerCalls: Array<{
      iframeId: string;
      instance: {
        destroy: ReturnType<typeof vi.fn>;
        loadVideoById: ReturnType<typeof vi.fn>;
        setVolume: ReturnType<typeof vi.fn>;
      };
    }> = [];

    class MockPlayer {
      destroy = vi.fn();
      loadVideoById = vi.fn();
      setVolume = vi.fn();
      getPlayerState = vi.fn(() => PLAYER_STATES.BUFFERING);

      constructor(iframeId: string, _options: Record<string, any>) {
        playerCalls.push({ iframeId, instance: this });
        // Intentionally never calls onReady — simulates a broken player.
      }
    }

    window.YT = {
      Player: MockPlayer as any,
      PlayerState: PLAYER_STATES,
    };

    const { musicPlaybackService } = await loadService();
    const playPromise = musicPlaybackService.play({
      videoId: 'fallback123',
      query: 'fallback song',
      title: 'Fallback Song',
      artistOrChannel: 'Curio Channel',
      thumbnailUrl: 'https://img.youtube.com/vi/fallback123/hqdefault.jpg',
    });

    await vi.advanceTimersByTimeAsync(10_000);
    const snapshot = await playPromise;

    expect(playerCalls).toHaveLength(1);
    expect(playerCalls[0].iframeId).toBe('curio-youtube-music-player-iframe');
    expect(snapshot.videoId).toBe('fallback123');
    expect(snapshot.playbackState).toBe('error');
    expect(snapshot.error).toBe('YouTube Player initialization timed out after 10s');

    await musicPlaybackService.stop();
  });

  it('keeps resume failures inside playback state instead of rejecting to the UI', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    class MockPlayer {
      destroy = vi.fn();
      setVolume = vi.fn();
      getPlayerState = vi.fn(() => PLAYER_STATES.UNSTARTED);

      constructor() {
        // Intentionally never calls onReady.
      }
    }

    window.YT = {
      Player: MockPlayer as any,
      PlayerState: PLAYER_STATES,
    };

    const { musicPlaybackService } = await loadService();
    const playPromise = musicPlaybackService.play({
      videoId: 'timeout123',
      query: 'timeout song',
      title: 'Timeout Song',
      artistOrChannel: 'Curio Channel',
      thumbnailUrl: 'https://img.youtube.com/vi/timeout123/hqdefault.jpg',
    });

    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await playPromise;

    const resumePromise = musicPlaybackService.resume();
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(resumePromise).resolves.toMatchObject({
      videoId: 'timeout123',
      playbackState: 'error',
      error: 'YouTube Player initialization timed out after 10s',
    });

    await musicPlaybackService.stop();
  });
});
