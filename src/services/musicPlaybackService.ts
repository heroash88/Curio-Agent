import type { MusicCardData, MusicPlaybackState } from './cardTypes';
import {
  pauseSpotifyPlayback,
  playSpotifyCatalogItem,
  resumeSpotifyPlayback,
  seekSpotifyPlayback,
  setSpotifyVolume,
  type SpotifyCatalogItem,
  type SpotifyCatalogItemType,
} from './spotifyApi';

export const MUSIC_PLAYER_ID = 'curio-youtube-music-player';
export const SPOTIFY_MUSIC_PLAYER_ID = 'curio-spotify-music-player';
const YOUTUBE_IFRAME_API_URL = 'https://www.youtube.com/iframe_api';
const YOUTUBE_PLAYER_READY_TIMEOUT_MS = 10_000;
const MUSIC_VOLUME_STORAGE_KEY = 'curio_youtube_music_volume';
const DEFAULT_MUSIC_VOLUME = 70;
const YOUTUBE_PLAYER_SIZE = 220;

type PlaybackListener = (snapshot: MusicPlaybackSnapshot) => void;
export type MusicSource = 'youtube' | 'spotify';

type YouTubePlayerStateMap = {
  UNSTARTED: number;
  ENDED: number;
  PLAYING: number;
  PAUSED: number;
  BUFFERING: number;
  CUED: number;
};

interface YouTubePlayerConstructorOptions {
  width?: string;
  height?: string;
  host?: string;
  videoId?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: () => void;
    onStateChange?: (event: { data: number }) => void;
    onError?: (event: { data: number }) => void;
  };
}

interface YouTubePlayerInstance {
  destroy?: () => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getPlayerState?: () => number;
  getVolume?: () => number;
  loadVideoById?: (videoId: string) => void;
  pauseVideo?: () => void;
  playVideo?: () => void;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  setVolume?: (volume: number) => void;
  stopVideo?: () => void;
}

interface YouTubeIframeApi {
  Player: new (element: HTMLElement | string, options: YouTubePlayerConstructorOptions) => YouTubePlayerInstance;
  PlayerState: YouTubePlayerStateMap;
}

declare global {
  interface Window {
    YT?: YouTubeIframeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface MusicPlaybackSnapshot {
  playerId: string;
  videoId: string | null;
  id: string | null;
  uri: string;
  itemType?: SpotifyCatalogItemType;
  query: string;
  title: string;
  artistOrChannel: string;
  thumbnailUrl: string;
  albumName?: string;
  externalUrl?: string;
  playbackState: MusicPlaybackState;
  currentTimeSeconds: number;
  durationSeconds: number;
  volume: number;
  source: MusicSource;
  error?: string;
  autoplayBlocked?: boolean;
}

export interface MusicPlaybackTrack {
  source?: MusicSource;
  videoId?: string;
  id?: string;
  uri?: string;
  itemType?: SpotifyCatalogItemType;
  query: string;
  title: string;
  artistOrChannel: string;
  thumbnailUrl: string;
  albumName?: string;
  externalUrl?: string;
  durationSeconds?: number;
}

const clampVolume = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_MUSIC_VOLUME;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
};

const getStoredVolume = (): number => {
  if (typeof window === 'undefined') {
    return DEFAULT_MUSIC_VOLUME;
  }

  try {
    const raw = window.localStorage.getItem(MUSIC_VOLUME_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_MUSIC_VOLUME;
    }

    return clampVolume(Number(raw));
  } catch {
    return DEFAULT_MUSIC_VOLUME;
  }
};

const persistVolume = (value: number) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(MUSIC_VOLUME_STORAGE_KEY, String(clampVolume(value)));
  } catch {
    // Ignore storage failures.
  }
};

const isIOSWebKitRuntime = (): boolean => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
};

const createIdleSnapshot = (): MusicPlaybackSnapshot => ({
  playerId: MUSIC_PLAYER_ID,
  videoId: null,
  id: null,
  uri: '',
  query: '',
  title: '',
  artistOrChannel: '',
  thumbnailUrl: '',
  playbackState: 'idle',
  currentTimeSeconds: 0,
  durationSeconds: 0,
  volume: getStoredVolume(),
  source: 'youtube',
  error: undefined,
  autoplayBlocked: false,
});

const getYouTubePlayerErrorMessage = (code: number): string => {
  switch (code) {
    case 2:
      return 'That YouTube video id is invalid.';
    case 5:
      return 'This YouTube video cannot play in the HTML5 player.';
    case 100:
      return 'That YouTube video is unavailable or private.';
    case 101:
    case 150:
      return 'YouTube blocked this video from playing inside Curio on this device.';
    default:
      return `YouTube playback failed (Error ${code}).`;
  }
};

const hasLoadedPlaybackItem = (snapshot: MusicPlaybackSnapshot): boolean =>
  Boolean(snapshot.videoId || snapshot.uri || snapshot.id);

const inferSpotifyItemType = (uri?: string): SpotifyCatalogItemType => {
  const rawType = uri?.split(':')[1];
  if (rawType === 'album' || rawType === 'artist' || rawType === 'playlist' || rawType === 'track') {
    return rawType;
  }
  return 'track';
};

const toSpotifyCatalogItem = (track: MusicPlaybackTrack): SpotifyCatalogItem => {
  const uri = track.uri?.trim();
  if (!uri) {
    throw new Error('Spotify playback requires a Spotify URI.');
  }

  const id = track.id?.trim() || uri.split(':').pop() || uri;
  const itemType = track.itemType || inferSpotifyItemType(uri);
  return {
    source: 'spotify',
    itemType,
    id,
    uri,
    title: track.title,
    artistOrChannel: track.artistOrChannel,
    thumbnailUrl: track.thumbnailUrl,
    query: track.query,
    score: 0,
    albumName: track.albumName,
    durationSeconds: track.durationSeconds,
    externalUrl: track.externalUrl,
  };
};

export const toMusicCardData = (snapshot: MusicPlaybackSnapshot): MusicCardData | null => {
  if (!hasLoadedPlaybackItem(snapshot)) {
    return null;
  }

  return {
    playerId: snapshot.playerId,
    videoId: snapshot.videoId,
    id: snapshot.id,
    uri: snapshot.uri,
    itemType: snapshot.itemType,
    query: snapshot.query,
    title: snapshot.title,
    artistOrChannel: snapshot.artistOrChannel,
    thumbnailUrl: snapshot.thumbnailUrl,
    albumName: snapshot.albumName,
    externalUrl: snapshot.externalUrl,
    playbackState: snapshot.playbackState,
    currentTimeSeconds: snapshot.currentTimeSeconds,
    durationSeconds: snapshot.durationSeconds,
    volume: snapshot.volume,
    source: snapshot.source,
    error: snapshot.error,
    autoplayBlocked: snapshot.autoplayBlocked,
  };
};

export class MusicPlaybackService {
  private listeners = new Set<PlaybackListener>();
  private snapshot: MusicPlaybackSnapshot = createIdleSnapshot();
  private apiReadyPromise: Promise<YouTubeIframeApi> | null = null;
  private playerReadyPromise: Promise<YouTubePlayerInstance> | null = null;
  private player: YouTubePlayerInstance | null = null;
  private hostElement: HTMLDivElement | null = null;
  private autoplayCheckTimer: number | null = null;
  private progressSyncTimer: number | null = null;
  private visibilityHandler: (() => void) | null = null;

  subscribe(listener: PlaybackListener) {
    this.listeners.add(listener);
    listener(this.getState());

    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): MusicPlaybackSnapshot {
    return { ...this.snapshot };
  }

  warmup(): void {
    void this.ensureIframeApi().catch(() => {
      // The next explicit play attempt will surface the error in the widget.
    });
  }

  async play(track: MusicPlaybackTrack): Promise<MusicPlaybackSnapshot> {
    const source: MusicSource = track.source === 'spotify' || track.uri?.startsWith('spotify:')
      ? 'spotify'
      : 'youtube';

    if (source === 'spotify') {
      return this.playSpotify(track);
    }

    const videoId = track.videoId?.trim();
    if (!videoId) {
      this.setSnapshot({
        ...this.snapshot,
        playbackState: 'error',
        error: 'YouTube playback requires a video id.',
      });
      return this.getState();
    }

    this.clearAutoplayFallback();
    this.stopProgressSync();
    // Destroy any stale player from a prior timeout so ensurePlayer starts fresh.
    this.destroyPlayer();
    this.setSnapshot({
      playerId: MUSIC_PLAYER_ID,
      videoId,
      id: videoId,
      uri: '',
      itemType: 'track',
      query: track.query,
      title: track.title,
      artistOrChannel: track.artistOrChannel,
      thumbnailUrl: track.thumbnailUrl,
      albumName: track.albumName,
      externalUrl: track.externalUrl,
      playbackState: 'loading',
      currentTimeSeconds: 0,
      durationSeconds: track.durationSeconds || 0,
      volume: this.snapshot.volume,
      source: 'youtube',
      error: undefined,
      autoplayBlocked: false,
    });

    if (isIOSWebKitRuntime()) {
      this.destroyPlayer();
      this.setSnapshot({
        ...this.snapshot,
        playbackState: 'ready',
        error: undefined,
        autoplayBlocked: true,
      });
      return this.getState();
    }

    try {
      const api = await this.ensureIframeApi();
      const player = await this.ensurePlayer(api, videoId);

      player.setVolume?.(this.snapshot.volume);
      player.loadVideoById?.(videoId);
      player.playVideo?.();
      this.scheduleAutoplayFallback(videoId, api);
      try { window.dispatchEvent(new CustomEvent('curio:music-event', { detail: { event: 'play_start' } })); } catch {}
    } catch (err) {
      console.error('[Music Service] Play failed', err);
      this.setSnapshot({
        ...this.snapshot,
        playbackState: 'error',
        error: err instanceof Error ? err.message : 'Failed to start playback',
      });
    }
    return this.getState();
  }

  private async playSpotify(track: MusicPlaybackTrack): Promise<MusicPlaybackSnapshot> {
    this.clearAutoplayFallback();
    this.stopProgressSync();
    this.destroyPlayer();

    let spotifyItem: SpotifyCatalogItem;
    try {
      spotifyItem = toSpotifyCatalogItem(track);
    } catch (err) {
      this.setSnapshot({
        ...this.snapshot,
        playerId: SPOTIFY_MUSIC_PLAYER_ID,
        videoId: null,
        id: track.id || null,
        uri: track.uri || '',
        source: 'spotify',
        playbackState: 'error',
        error: err instanceof Error ? err.message : 'Spotify playback failed.',
      });
      return this.getState();
    }

    this.setSnapshot({
      playerId: SPOTIFY_MUSIC_PLAYER_ID,
      videoId: null,
      id: spotifyItem.id,
      uri: spotifyItem.uri,
      itemType: spotifyItem.itemType,
      query: spotifyItem.query,
      title: spotifyItem.title,
      artistOrChannel: spotifyItem.artistOrChannel,
      thumbnailUrl: spotifyItem.thumbnailUrl,
      albumName: spotifyItem.albumName,
      externalUrl: spotifyItem.externalUrl,
      playbackState: 'loading',
      currentTimeSeconds: 0,
      durationSeconds: spotifyItem.durationSeconds || 0,
      volume: this.snapshot.volume,
      source: 'spotify',
      error: undefined,
      autoplayBlocked: false,
    });

    try {
      await playSpotifyCatalogItem(spotifyItem);
      this.setSnapshot({
        ...this.snapshot,
        playbackState: 'playing',
        error: undefined,
      });
      this.startProgressSync();
      try { window.dispatchEvent(new CustomEvent('curio:music-event', { detail: { event: 'play_start' } })); } catch {}
    } catch (err) {
      console.error('[Music Service] Spotify play failed', err);
      this.setSnapshot({
        ...this.snapshot,
        playbackState: 'error',
        error: err instanceof Error ? err.message : 'Failed to start Spotify playback',
      });
    }

    return this.getState();
  }

  async pause(): Promise<MusicPlaybackSnapshot> {
    if (this.snapshot.source === 'spotify') {
      if (!hasLoadedPlaybackItem(this.snapshot)) {
        return this.getState();
      }

      try {
        await pauseSpotifyPlayback();
      } catch (err) {
        this.setSnapshot({
          ...this.snapshot,
          playbackState: 'error',
          error: err instanceof Error ? err.message : 'Failed to pause Spotify playback',
        });
        return this.getState();
      }

      this.stopProgressSync();
      this.setSnapshot({
        ...this.snapshot,
        playbackState: 'paused',
        error: undefined,
      });
      return this.getState();
    }

    if (!this.snapshot.videoId || !this.player) {
      return this.getState();
    }

    this.player.pauseVideo?.();
    this.setSnapshot({
      ...this.snapshot,
      playbackState: 'paused',
      error: undefined,
    });
    return this.getState();
  }

  async resume(): Promise<MusicPlaybackSnapshot> {
    if (this.snapshot.source === 'spotify') {
      if (!hasLoadedPlaybackItem(this.snapshot)) {
        return this.getState();
      }

      try {
        await resumeSpotifyPlayback();
        this.setSnapshot({
          ...this.snapshot,
          playbackState: 'playing',
          error: undefined,
        });
        this.startProgressSync();
      } catch (err) {
        console.error('[Music Service] Spotify resume failed', err);
        this.setSnapshot({
          ...this.snapshot,
          playbackState: 'error',
          error: err instanceof Error ? err.message : 'Failed to resume Spotify playback',
        });
      }
      return this.getState();
    }

    const videoId = this.snapshot.videoId;
    if (!videoId) {
      return this.getState();
    }

    if (isIOSWebKitRuntime()) {
      this.destroyPlayer();
      this.setSnapshot({
        ...this.snapshot,
        playbackState: 'ready',
        error: undefined,
        autoplayBlocked: true,
      });
      return this.getState();
    }

    try {
      const api = await this.ensureIframeApi();
      const player = await this.ensurePlayer(api, videoId);
      player.playVideo?.();
      this.setSnapshot({
        ...this.snapshot,
        playbackState: 'loading',
        error: undefined,
      });
      this.scheduleAutoplayFallback(videoId, api);
    } catch (err) {
      console.error('[Music Service] Resume failed', err);
      this.setSnapshot({
        ...this.snapshot,
        playbackState: 'error',
        error: err instanceof Error ? err.message : 'Failed to resume playback',
      });
    }
    return this.getState();
  }

  async seekTo(seconds: number): Promise<MusicPlaybackSnapshot> {
    if (this.snapshot.source === 'spotify') {
      if (!hasLoadedPlaybackItem(this.snapshot)) {
        return this.getState();
      }

      const duration = this.snapshot.durationSeconds;
      const nextTime = Math.max(0, Math.min(Number.isFinite(duration) && duration > 0 ? duration : seconds, seconds));
      try {
        await seekSpotifyPlayback(nextTime);
      } catch {
        // Ignore seek errors and preserve previous playback state.
      }

      this.setSnapshot({
        ...this.snapshot,
        currentTimeSeconds: nextTime,
      });
      return this.getState();
    }

    if (!this.snapshot.videoId || !this.player) {
      return this.getState();
    }

    const duration = this.player.getDuration?.() ?? this.snapshot.durationSeconds;
    const nextTime = Math.max(0, Math.min(Number.isFinite(duration) && duration > 0 ? duration : seconds, seconds));

    try {
      this.player.seekTo?.(nextTime, true);
    } catch {
      // Ignore seek errors and preserve previous playback state.
    }

    this.setSnapshot({
      ...this.snapshot,
      currentTimeSeconds: nextTime,
      durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : this.snapshot.durationSeconds,
    });

    return this.getState();
  }

  async setVolume(volume: number): Promise<MusicPlaybackSnapshot> {
    const nextVolume = clampVolume(volume);
    persistVolume(nextVolume);

    try {
      if (this.snapshot.source === 'spotify') {
        await setSpotifyVolume(nextVolume);
      } else {
        this.player?.setVolume?.(nextVolume);
      }
    } catch {
      // Ignore player volume failures and still persist local state.
    }

    this.setSnapshot({
      ...this.snapshot,
      volume: nextVolume,
    });

    return this.getState();
  }

  async stop(): Promise<MusicPlaybackSnapshot> {
    this.clearAutoplayFallback();
    this.stopProgressSync();
    if (this.snapshot.source === 'spotify') {
      try {
        await pauseSpotifyPlayback();
      } catch {
        // Ignore Spotify stop errors during teardown.
      }
      this.setSnapshot(createIdleSnapshot());
      try { window.dispatchEvent(new CustomEvent('curio:music-event', { detail: { event: 'play_stop' } })); } catch {}
      return this.getState();
    }

    try {
      this.player?.stopVideo?.();
    } catch {
      // Ignore stop errors during teardown.
    }
    this.destroyPlayer();
    this.setSnapshot(createIdleSnapshot());
    try { window.dispatchEvent(new CustomEvent('curio:music-event', { detail: { event: 'play_stop' } })); } catch {}
    return this.getState();
  }

  private syncProgressFromPlayer() {
    if (this.snapshot.source === 'spotify') {
      if (this.snapshot.playbackState !== 'playing') {
        return;
      }

      const duration = this.snapshot.durationSeconds;
      const nextCurrentTime =
        Number.isFinite(duration) && duration > 0
          ? Math.min(duration, this.snapshot.currentTimeSeconds + 0.5)
          : this.snapshot.currentTimeSeconds + 0.5;

      this.setSnapshot({
        ...this.snapshot,
        currentTimeSeconds: nextCurrentTime,
      });
      return;
    }

    if (!this.player || !this.snapshot.videoId) {
      return;
    }

    const duration = this.player.getDuration?.();
    const currentTime = this.player.getCurrentTime?.();
    const nextDuration =
      typeof duration === 'number' && Number.isFinite(duration) && duration > 0
        ? duration
        : this.snapshot.durationSeconds;
    const nextCurrentTime =
      typeof currentTime === 'number' && Number.isFinite(currentTime) && currentTime >= 0
        ? Math.min(currentTime, nextDuration || currentTime)
        : this.snapshot.currentTimeSeconds;

    if (
      nextDuration === this.snapshot.durationSeconds &&
      Math.abs(nextCurrentTime - this.snapshot.currentTimeSeconds) < 0.25
    ) {
      return;
    }

    this.setSnapshot({
      ...this.snapshot,
      currentTimeSeconds: nextCurrentTime,
      durationSeconds: nextDuration,
    });
  }

  private startProgressSyncTimer() {
    if (typeof window === 'undefined' || this.progressSyncTimer !== null) {
      return;
    }

    this.progressSyncTimer = window.setInterval(() => {
      this.syncProgressFromPlayer();
    }, 500) as unknown as number;
  }

  private stopProgressSyncTimer() {
    if (this.progressSyncTimer !== null) {
      window.clearInterval(this.progressSyncTimer);
      this.progressSyncTimer = null;
    }
  }

  private startProgressSync() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    this.startProgressSyncTimer();

    if (!this.visibilityHandler) {
      this.visibilityHandler = () => {
        if (document.hidden) {
          this.stopProgressSyncTimer();
        } else if (this.snapshot.playbackState === 'playing') {
          this.startProgressSyncTimer();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  private stopProgressSync() {
    this.stopProgressSyncTimer();

    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  private setSnapshot(nextSnapshot: MusicPlaybackSnapshot) {
    this.snapshot = { ...nextSnapshot };
    const current = this.getState();
    this.listeners.forEach((listener) => listener(current));
  }

  private removePlayerMountElement() {
    if (typeof document === 'undefined') {
      this.hostElement = null;
      return;
    }

    const currentMount = document.getElementById(MUSIC_PLAYER_ID);
    if (currentMount?.parentNode) {
      currentMount.parentNode.removeChild(currentMount);
    }

    if (this.hostElement && this.hostElement !== currentMount && this.hostElement.parentNode) {
      this.hostElement.parentNode.removeChild(this.hostElement);
    }

    this.hostElement = null;
  }

  private createHostElement() {
    if (typeof document === 'undefined') {
      throw new Error('YouTube playback requires a browser document.');
    }

    if (
      this.hostElement &&
      this.hostElement.isConnected &&
      this.hostElement.tagName.toLowerCase() === 'div'
    ) {
      return this.hostElement;
    }

    let currentMount = document.getElementById(MUSIC_PLAYER_ID);
    if (currentMount && currentMount.tagName.toLowerCase() !== 'div') {
      currentMount.parentNode?.removeChild(currentMount);
      currentMount = null;
    }

    let host = currentMount as HTMLDivElement | null;
    if (!host) {
      host = document.createElement('div');
      host.id = MUSIC_PLAYER_ID;
      document.body.appendChild(host);
    }
    // Keep a real renderable box for the IFrame API. Fully clipped, offscreen,
    // or transparent iframes can load the API script but never fire onReady.
    host.style.position = 'fixed';
    host.style.bottom = '0';
    host.style.right = '0';
    host.style.width = `${YOUTUBE_PLAYER_SIZE}px`;
    host.style.height = `${YOUTUBE_PLAYER_SIZE}px`;
    host.style.zIndex = '-1';
    host.style.overflow = 'hidden';
    host.style.opacity = '';
    host.style.transform = '';
    host.style.clipPath = '';
    host.style.contain = '';
    host.style.display = 'block';
    host.style.visibility = 'visible';
    host.style.pointerEvents = 'none';
    host.setAttribute('aria-hidden', 'true');
    this.hostElement = host;

    return this.hostElement;
  }

  private ensureIframeApi(): Promise<YouTubeIframeApi> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return Promise.reject(new Error('YouTube playback requires a browser window.'));
    }

    if (window.YT?.Player) {
      return Promise.resolve(window.YT);
    }

    if (this.apiReadyPromise) {
      return this.apiReadyPromise;
    }

    this.apiReadyPromise = new Promise<YouTubeIframeApi>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('YouTube IFrame API timed out after 10s'));
        this.apiReadyPromise = null;
      }, 10000);

      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        clearTimeout(timeout);
        previousReady?.();
        if (window.YT?.Player) {
          resolve(window.YT);
          return;
        }
        reject(new Error('YouTube IFrame API loaded without a Player constructor.'));
      };

      let script = document.querySelector<HTMLScriptElement>('script[data-curio-youtube-iframe="true"]');
      if (!script) {
        script = document.createElement('script');
        script.src = YOUTUBE_IFRAME_API_URL;
        script.async = true;
        script.dataset.curioYoutubeIframe = 'true';
        script.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Failed to load the YouTube IFrame API.'));
          this.apiReadyPromise = null;
        };
        document.head.appendChild(script);
      }
    });

    return this.apiReadyPromise;
  }

  private ensurePlayer(api: YouTubeIframeApi, initialVideoId?: string): Promise<YouTubePlayerInstance> {
    if (this.player && this.playerReadyPromise) {
      return this.playerReadyPromise;
    }

    this.playerReadyPromise = new Promise<YouTubePlayerInstance>((resolve, reject) => {
      let settled = false;

      const host = this.createHostElement();
      host.innerHTML = '';

      // Build the embed URL with the same parameters the YouTube video
      // widget uses (direct iframe approach).  The IFrame API's
      // `new YT.Player(element, fullOptions)` creation path silently
      // fails to fire onReady in some environments, so we create the
      // iframe ourselves and then wrap it with the API for control.
      const iframeId = `${MUSIC_PLAYER_ID}-iframe`;
      const embedParams = new URLSearchParams({
        autoplay: '1',
        controls: '0',
        rel: '0',
        iv_load_policy: '3',
        modestbranding: '1',
        playsinline: '1',
        enablejsapi: '1',
      });
      if (window.location.origin.startsWith('http')) {
        embedParams.set('origin', window.location.origin);
      }

      const iframe = document.createElement('iframe');
      iframe.id = iframeId;
      iframe.width = String(YOUTUBE_PLAYER_SIZE);
      iframe.height = String(YOUTUBE_PLAYER_SIZE);
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.setAttribute('allowfullscreen', '');
      // The app can run with COEP: credentialless; match the visible
      // YouTube widget so the embed is allowed to initialize.
      iframe.setAttribute('credentialless', 'true');
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.style.border = '0';
      iframe.src = `https://www.youtube.com/embed/${initialVideoId || ''}?${embedParams.toString()}`;
      host.appendChild(iframe);

      let playerInstance: YouTubePlayerInstance | null = null;
      let readyBeforeAssign = false;
      let isReady = false;

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { playerInstance?.destroy?.(); } catch { /* cleanup */ }
        if (this.player === playerInstance) this.player = null;
        this.playerReadyPromise = null;
        this.removePlayerMountElement();
        reject(new Error('YouTube Player initialization timed out after 10s'));
      }, YOUTUBE_PLAYER_READY_TIMEOUT_MS);

      const resolveReady = () => {
        if (settled || !playerInstance) return;
        clearTimeout(timeout);
        settled = true;
        this.player = playerInstance;
        resolve(playerInstance);
      };

      // Wrap the existing iframe with the IFrame API for programmatic
      // control (play, pause, seek, volume, state changes).
      const createdPlayer = new api.Player(iframeId, {
        events: {
          onReady: () => {
            clearTimeout(timeout);
            isReady = true;
            if (playerInstance) {
              resolveReady();
            } else {
              readyBeforeAssign = true;
            }
          },
          onStateChange: (event) => {
            this.handlePlayerStateChange(event.data, api);
          },
          onError: (event) => {
            clearTimeout(timeout);
            console.error('[YouTube Player Error]', event.data);
            const errorMessage = getYouTubePlayerErrorMessage(event.data);
            if (!isReady && !settled) {
              settled = true;
              try { playerInstance?.destroy?.(); } catch { /* cleanup */ }
              if (this.player === playerInstance) this.player = null;
              this.playerReadyPromise = null;
              this.removePlayerMountElement();
              reject(new Error(errorMessage));
              return;
            }
            this.setSnapshot({
              ...this.snapshot,
              playbackState: 'error',
              error: errorMessage,
            });
          },
        },
      });

      if (settled) {
        try { createdPlayer.destroy?.(); } catch { /* cleanup */ }
        this.removePlayerMountElement();
        return;
      }

      playerInstance = createdPlayer;
      this.player = playerInstance;
      this.player?.setVolume?.(this.snapshot.volume);

      if (readyBeforeAssign) {
        resolveReady();
      }
    });

    return this.playerReadyPromise;
  }

  private handlePlayerStateChange(state: number, api: YouTubeIframeApi) {
    if (!this.snapshot.videoId) {
      return;
    }

    switch (state) {
      case api.PlayerState.PLAYING:
        this.clearAutoplayFallback();
        this.startProgressSync();
        this.syncProgressFromPlayer();
        this.setSnapshot({
          ...this.snapshot,
          playbackState: 'playing',
          error: undefined,
          autoplayBlocked: false,
        });
        return;
      case api.PlayerState.PAUSED:
        this.clearAutoplayFallback();
        this.stopProgressSync();
        this.syncProgressFromPlayer();
        this.setSnapshot({
          ...this.snapshot,
          playbackState: 'paused',
          error: undefined,
        });
        return;
      case api.PlayerState.BUFFERING:
        this.syncProgressFromPlayer();
        this.setSnapshot({
          ...this.snapshot,
          playbackState: 'loading',
          error: undefined,
        });
        return;
      case api.PlayerState.CUED:
        this.clearAutoplayFallback();
        this.stopProgressSync();
        this.syncProgressFromPlayer();
        this.setSnapshot({
          ...this.snapshot,
          playbackState: 'ready',
          error: undefined,
          autoplayBlocked: true,
        });
        return;
      case api.PlayerState.ENDED:
        this.clearAutoplayFallback();
        this.stopProgressSync();
        void this.stop();
        return;
      default:
        return;
    }
  }

  private scheduleAutoplayFallback(videoId: string, api: YouTubeIframeApi) {
    if (typeof window === 'undefined') {
      return;
    }

    this.clearAutoplayFallback();
    this.autoplayCheckTimer = window.setTimeout(() => {
      if (!this.player || this.snapshot.videoId !== videoId) {
        return;
      }

      const playerState = this.player.getPlayerState?.();
      if (playerState === api.PlayerState.PLAYING || playerState === api.PlayerState.BUFFERING) {
        return;
      }

      this.setSnapshot({
        ...this.snapshot,
        playbackState: 'ready',
        autoplayBlocked: true,
        error: undefined,
      });
    }, 1500) as unknown as number;
  }

  private clearAutoplayFallback() {
    if (this.autoplayCheckTimer !== null) {
      window.clearTimeout(this.autoplayCheckTimer);
      this.autoplayCheckTimer = null;
    }
  }

  private destroyPlayer() {
    this.stopProgressSync();

    try {
      this.player?.destroy?.();
    } catch {
      // Ignore destroy errors during cleanup.
    }

    this.player = null;
    this.playerReadyPromise = null;

    this.removePlayerMountElement();
  }
}

export const musicPlaybackService = new MusicPlaybackService();
