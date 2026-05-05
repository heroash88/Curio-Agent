import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import { useAnimationsEnabled, useLowPowerMode } from '../../../utils/settingsStorage';
import type {
  DashboardMusicDesign,
  DashboardMusicSource,
  DashboardWidget,
  DashboardWidgetConfig,
} from '../../../services/dashboardTypes';
import { musicPlaybackService, type MusicPlaybackTrack } from '../../../services/musicPlaybackService';
import { searchMusicCandidates, type MusicSearchMatch } from '../../../services/musicSearchService';
import {
  getSpotifyAuthStatus,
  signInWithSpotify,
  signOutSpotify,
} from '../../../services/spotifyApi';
import WidgetShell, { DashboardWidgetActionSlotContext } from './WidgetShell';
import { WidgetText } from './widgetPrimitives';
import {
  Play,
  Pause,
  Repeat,
  Shuffle,
  SkipForward,
  SkipBack,
  Search as SearchIcon,
  Volume2,
  VolumeX,
  X,
  History,
  Loader2,
  ExternalLink,
  Disc3,
  Headphones,
} from 'lucide-react';
import { IconMusic } from './widgetIcons';

const formatClock = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const WAVEFORM_BAR_COUNT = 32;

const TrackArtwork: React.FC<{
  src?: string;
  alt: string;
  className: string;
}> = ({ src, alt, className }) => {
  if (src) {
    return <img src={src} alt={alt} className={className} loading="lazy" />;
  }
  return (
    <div
      className={`${className} flex items-center justify-center bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)]`}
      aria-label={alt}
    >
      <IconMusic />
    </div>
  );
};

type WaveBarProfile = {
  base: number;
  variance: number;
  frequency: number;
  phaseOffset: number;
};

type SearchResultsDragState = {
  pointerId: number;
  startY: number;
  scrollTop: number;
  moved: boolean;
};

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

const buildWaveProfile = (seedSource: string): WaveBarProfile[] => {
  const seed = seedSource || 'idle';
  return Array.from({ length: WAVEFORM_BAR_COUNT }, (_, index) => {
    const code = seed.charCodeAt(index % seed.length) || 47;
    const mix = (code * (index + 3) + index * 19) % 97;
    return {
      base: 0.18 + ((mix % 32) / 100),
      variance: 0.36 + (((mix * 3) % 36) / 100),
      frequency: 1.35 + (((mix * 5) % 22) / 10),
      phaseOffset: ((code + index * 23) % 360) * (Math.PI / 180),
    };
  });
};

const MusicWidget: React.FC<{
  widget: DashboardWidget;
  onUpdateWidgetConfig?: (widgetId: string, patch: Partial<DashboardWidgetConfig>) => void;
}> = ({ widget, onUpdateWidgetConfig }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const animationsEnabled = useAnimationsEnabled();
  const lowPowerMode = useLowPowerMode();
  const selectedSource = (widget.config.musicSource || 'youtube') as DashboardMusicSource;
  const selectedDesign = (widget.config.musicDesign || 'curio') as DashboardMusicDesign;
  const dashboardActionSlot = React.useContext(DashboardWidgetActionSlotContext);
  const [snapshot, setSnapshot] = useState(() => musicPlaybackService.getState());
  const hasTrack = Boolean(snapshot.videoId || snapshot.uri || snapshot.id);
  const isPlaying = snapshot.playbackState === 'playing';
  const activeSource = hasTrack ? snapshot.source : selectedSource;
  const sourceLabel = activeSource === 'spotify' ? 'Spotify' : 'YouTube Music';

  // Search UI State
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<MusicSearchMatch[]>([]);
  const [showInlinePlayer, setShowInlinePlayer] = useState(false);
  const [spotifyAuthStatus, setSpotifyAuthStatus] = useState(() => getSpotifyAuthStatus());
  const [spotifyAuthError, setSpotifyAuthError] = useState('');

  // History State
  const [history, setHistory] = useState<MusicPlaybackTrack[]>(() => {
    try {
      const stored = localStorage.getItem('curio_music_history');
      return stored ? JSON.parse(stored).slice(0, 5) : [];
    } catch { return []; }
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const wavePhaseRef = useRef(0);
  const searchResultsDragRef = useRef<SearchResultsDragState | null>(null);
  const suppressSearchResultClickRef = useRef(false);
  const [wavePhase, setWavePhase] = useState(0);

  const updateMusicConfig = (patch: Partial<DashboardWidgetConfig>) => {
    onUpdateWidgetConfig?.(widget.id, patch);
  };

  useEffect(() => musicPlaybackService.subscribe(setSnapshot), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refreshSpotifyStatus = () => {
      const status = getSpotifyAuthStatus();
      setSpotifyAuthStatus(status);
      if (status.connected) {
        setSpotifyAuthError('');
      }
    };
    window.addEventListener('storage', refreshSpotifyStatus);
    window.addEventListener('curio:settings-changed', refreshSpotifyStatus);
    return () => {
      window.removeEventListener('storage', refreshSpotifyStatus);
      window.removeEventListener('curio:settings-changed', refreshSpotifyStatus);
    };
  }, []);

  useEffect(() => {
    if (selectedSource === 'youtube') {
      musicPlaybackService.warmup();
    }
  }, [selectedSource]);

  useEffect(() => {
    if (showSearch && selectedSource === 'youtube') {
      musicPlaybackService.warmup();
    }
  }, [selectedSource, showSearch]);

  useEffect(() => {
    wavePhaseRef.current = snapshot.currentTimeSeconds;
    if (!isPlaying) {
      setWavePhase(snapshot.currentTimeSeconds);
    }
  }, [isPlaying, snapshot.currentTimeSeconds]);

  useEffect(() => {
    if (!hasTrack || !isPlaying || !animationsEnabled || typeof window === 'undefined') {
      return;
    }

    let rafId = 0;
    let last = window.performance.now();
    let visualAccumulator = 0;
    const tick = (now: number) => {
      const deltaSeconds = Math.max(0, Math.min((now - last) / 1000, 0.12));
      last = now;
      if (document.visibilityState === 'hidden') {
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      wavePhaseRef.current += deltaSeconds;
      visualAccumulator += deltaSeconds;
      if (visualAccumulator >= 1 / (lowPowerMode ? 12 : 24)) {
        setWavePhase(wavePhaseRef.current);
        visualAccumulator = 0;
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [animationsEnabled, hasTrack, isPlaying, lowPowerMode, snapshot.videoId]);

  useEffect(() => {
    const trackKey = snapshot.source === 'spotify'
      ? (snapshot.uri || snapshot.id || '')
      : (snapshot.videoId || '');
    if (trackKey && snapshot.title) {
      const track: MusicPlaybackTrack = {
        videoId: snapshot.videoId || undefined,
        id: snapshot.id || undefined,
        uri: snapshot.uri || undefined,
        itemType: snapshot.itemType,
        source: snapshot.source,
        title: snapshot.title,
        artistOrChannel: snapshot.artistOrChannel,
        thumbnailUrl: snapshot.thumbnailUrl,
        albumName: snapshot.albumName,
        externalUrl: snapshot.externalUrl,
        durationSeconds: snapshot.durationSeconds,
        query: snapshot.query || snapshot.title
      };
      setHistory(prev => {
        const filtered = prev.filter((item) => {
          const itemKey = item.source === 'spotify'
            ? (item.uri || item.id || '')
            : (item.videoId || '');
          return itemKey !== trackKey;
        });
        const next = [track, ...filtered].slice(0, 10);
        localStorage.setItem('curio_music_history', JSON.stringify(next));
        return next;
      });
    }
  }, [snapshot.albumName, snapshot.artistOrChannel, snapshot.durationSeconds, snapshot.externalUrl, snapshot.id, snapshot.itemType, snapshot.query, snapshot.source, snapshot.thumbnailUrl, snapshot.title, snapshot.uri, snapshot.videoId]);

  useEffect(() => {
    setShowInlinePlayer(false);
  }, [snapshot.id, snapshot.uri, snapshot.videoId]);

  useEffect(() => {
    if (snapshot.playbackState === 'error' || snapshot.autoplayBlocked) {
      setShowInlinePlayer(true);
    }
  }, [snapshot.autoplayBlocked, snapshot.playbackState]);

  const toggle = () => {
    if (!hasTrack) {
      setShowSearch(true);
      return;
    }
    void (isPlaying ? musicPlaybackService.pause() : musicPlaybackService.resume());
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    setIsSearching(true);
    setSpotifyAuthError('');
    const primarySource: DashboardMusicSource =
      selectedSource === 'spotify' && !spotifyAuthStatus.connected
        ? 'youtube'
        : selectedSource;
    try {
      const results = await searchMusicCandidates(query, primarySource);
      if (selectedSource === 'spotify' && primarySource === 'youtube') {
        setSpotifyAuthError('Spotify playback needs a usable Spotify account. Showing YouTube results.');
      }
      setSearchResults(results);
    } catch (err) {
      if (selectedSource === 'spotify') {
        try {
          const fallbackResults = await searchMusicCandidates(query, 'youtube');
          setSpotifyAuthError('Spotify search is unavailable here. Showing YouTube results.');
          setSearchResults(fallbackResults);
          return;
        } catch (fallbackError) {
          console.error('Music fallback search failed', fallbackError);
        }
      }
      console.error('Music search failed', err);
      setSpotifyAuthError(err instanceof Error ? err.message : 'Music search failed.');
    } finally {
      setIsSearching(false);
    }
  };

  const playTrack = async (track: MusicPlaybackTrack | MusicSearchMatch) => {
    const playbackQuery =
      'query' in track && typeof track.query === 'string'
        ? track.query
        : track.title;

    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);

    try {
      const requestedSource = track.source || selectedSource;
      const nextSnapshot = await musicPlaybackService.play({
        source: track.source || selectedSource,
        videoId: track.videoId,
        id: track.id,
        uri: track.uri,
        itemType: track.itemType,
        title: track.title,
        artistOrChannel: track.artistOrChannel,
        thumbnailUrl: track.thumbnailUrl,
        albumName: track.albumName,
        externalUrl: track.externalUrl,
        durationSeconds: track.durationSeconds,
        query: playbackQuery || track.title
      });
      if (
        requestedSource === 'spotify' &&
        nextSnapshot?.playbackState === 'error'
      ) {
        const fallbackQuery = [track.title, track.artistOrChannel].filter(Boolean).join(' ');
        const fallbackResults = await searchMusicCandidates(fallbackQuery, 'youtube');
        const fallbackTrack = fallbackResults[0];
        if (fallbackTrack) {
          await musicPlaybackService.play({
            ...fallbackTrack,
            source: 'youtube',
            query: fallbackQuery || fallbackTrack.query || fallbackTrack.title,
          });
          setSpotifyAuthError('Spotify playback is unavailable here. Playing a YouTube result instead.');
        }
      }
    } catch (err) {
      console.error('Playback failed', err);
    }
  };

  const getSearchResultsScrollMax = (element: HTMLElement) =>
    Math.max(0, element.scrollHeight - element.clientHeight);

  const handleSearchResultsWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    const scrollMax = getSearchResultsScrollMax(container);
    const delta = event.deltaY || event.deltaX;
    if (scrollMax <= 0 || delta === 0) return;

    const nextScrollTop = Math.max(0, Math.min(scrollMax, container.scrollTop + delta));
    event.stopPropagation();
    if (nextScrollTop === container.scrollTop) return;

    event.preventDefault();
    container.scrollTop = nextScrollTop;
  };

  const handleSearchResultsPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const container = event.currentTarget;
    if (getSearchResultsScrollMax(container) <= 0) return;

    searchResultsDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      scrollTop: container.scrollTop,
      moved: false,
    };
    // Don't stopPropagation or setPointerCapture here — that would steal
    // the pointer from child buttons and prevent their click events from
    // firing.  Capture is deferred to the first real drag movement.
  };

  const handleSearchResultsPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = searchResultsDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(deltaY) < 4) return;

    const container = event.currentTarget;
    // First frame of real movement — capture the pointer now so subsequent
    // move/up events stay on this container even if the pointer leaves it.
    if (!drag.moved) {
      if (typeof container.setPointerCapture === 'function') {
        try {
          container.setPointerCapture(event.pointerId);
        } catch {
          // Native touch scrolling can cancel capture before React sees the event.
        }
      }
    }
    drag.moved = true;
    suppressSearchResultClickRef.current = true;
    event.preventDefault();
    event.stopPropagation();
    container.scrollTop = Math.max(
      0,
      Math.min(getSearchResultsScrollMax(container), drag.scrollTop - deltaY),
    );
  };

  const handleSearchResultsPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = searchResultsDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    searchResultsDragRef.current = null;
    if (drag.moved) {
      event.preventDefault();
      event.stopPropagation();
      suppressSearchResultClickRef.current = true;
      window.setTimeout(() => {
        suppressSearchResultClickRef.current = false;
      }, 0);

      const container = event.currentTarget;
      if (typeof container.releasePointerCapture === 'function') {
        try {
          container.releasePointerCapture(event.pointerId);
        } catch {
          // Capture may already be released after native touch cancellation.
        }
      }
    }
  };

  const handleSearchResultClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    track: MusicPlaybackTrack | MusicSearchMatch,
  ) => {
    if (suppressSearchResultClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressSearchResultClickRef.current = false;
      return;
    }

    event.stopPropagation();
    void playTrack(track);
  };

  // TODO: [seekBarLiveSyncEnabled] When effectiveToggle('seekBarLiveSyncEnabled', board, widget.config)
  // is true and isPlaying, start a 250ms interval that increments currentTimeSeconds locally so the
  // seek bar advances smoothly between playback service updates. Clear the interval when paused or
  // when a fresh snapshot arrives. Gate behind: effectiveToggle('seekBarLiveSyncEnabled', boardInteractivity, widget.config)

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!snapshot.durationSeconds) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    void musicPlaybackService.seekTo(percent * snapshot.durationSeconds);
  };

  const setVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    void musicPlaybackService.setVolume(parseInt(e.target.value, 10));
  };

  const handleReplay = () => {
    if (!hasTrack) return;
    void musicPlaybackService.seekTo(0);
  };

  const handleShuffleNext = async () => {
    const query = snapshot.query || snapshot.title;
    if (!query) {
      setShowSearch(true);
      return;
    }

    setIsSearching(true);
    try {
      const candidates = await searchMusicCandidates(query, selectedSource);
      const currentKey = snapshot.source === 'spotify'
        ? (snapshot.uri || snapshot.id || '')
        : (snapshot.videoId || '');
      const pool = candidates.filter((track) => {
        const candidateKey = track.source === 'spotify'
          ? (track.uri || track.id || '')
          : (track.videoId || '');
        return candidateKey !== currentKey;
      });
      const nextTrack = (pool.length > 0 ? pool : candidates)[0];
      if (nextTrack) {
        await playTrack(nextTrack);
      }
    } catch (error) {
      console.error('Music shuffle failed', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSpotifyConnect = async () => {
    setSpotifyAuthError('');
    try {
      await signInWithSpotify();
      setSpotifyAuthStatus(getSpotifyAuthStatus());
    } catch (error) {
      setSpotifyAuthError(error instanceof Error ? error.message : 'Spotify sign-in failed.');
    }
  };

  const handleSpotifyDisconnect = async () => {
    setSpotifyAuthError('');
    await signOutSpotify();
    setSpotifyAuthStatus(getSpotifyAuthStatus());
  };

  const progress = snapshot.durationSeconds > 0
    ? Math.min(1, Math.max(0, snapshot.currentTimeSeconds / snapshot.durationSeconds))
    : 0;
  const artworkAlt = snapshot.title || 'Artwork';
  const compactPlayer = size.isCompact || size.pixelHeight < 340 || size.pixelWidth < 320;
  const minimalPlayer = size.pixelHeight < 330 || size.pixelWidth < 300;
  const searchPanelCompact = size.pixelHeight < 380 || size.pixelWidth < 340;
  const artistLine = snapshot.artistOrChannel
    ? snapshot.artistOrChannel.toUpperCase()
    : sourceLabel.toUpperCase();
  const currentTimeLabel = formatClock(snapshot.currentTimeSeconds);
  const durationLabel = formatClock(snapshot.durationSeconds);
  const youtubeWatchUrl = snapshot.source === 'youtube' && snapshot.videoId
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(snapshot.videoId)}`
    : '';
  const inlinePlayerSrc = snapshot.source === 'youtube' && snapshot.videoId
    ? `https://www.youtube.com/embed/${encodeURIComponent(snapshot.videoId)}?autoplay=1&playsinline=1&controls=1&rel=0&modestbranding=1${typeof window !== 'undefined' && window.location.origin.startsWith('http') ? `&origin=${encodeURIComponent(window.location.origin)}` : ''}`
    : '';
  const externalPlaybackUrl = snapshot.externalUrl || youtubeWatchUrl;
  const manualPlaybackNeeded = snapshot.source === 'youtube' && hasTrack && (snapshot.playbackState === 'error' || snapshot.autoplayBlocked);
  const spotifyNeedsConnection = selectedSource === 'spotify' && !spotifyAuthStatus.connected;
  const spotifyCompactPanel = size.pixelHeight < 260 || size.pixelWidth < 420;
  const spotifyUltraCompactPanel = size.pixelHeight < 220 || size.pixelWidth < 340;
  const spotifySkin = theme.dark
    ? {
      surface: 'bg-[#121212] text-white',
      artworkScrim: 'bg-gradient-to-b from-[#121212]/40 via-[#121212]/80 to-[#121212]',
      overlay: 'bg-[#121212]/95 text-white',
      segment: 'bg-white/10 text-white/55',
      segmentHover: 'hover:text-white',
      primaryText: 'text-white',
      strongText: 'text-white/75',
      mutedText: 'text-white/55',
      softText: 'text-white/45',
      faintText: 'text-white/35',
      idleArtwork: 'bg-white/10 text-white/45',
      control: 'bg-white/10 text-white/70 hover:text-white',
      controlSubtle: 'bg-white/10 text-white/60 hover:text-white',
      input: 'border-white/10 bg-white/10 text-white placeholder:text-white/35',
      listRow: 'hover:bg-white/10',
      resultTitle: 'text-white',
      resultSubtitle: 'text-white/50',
      recentTitle: 'text-white/70',
      emptyState: 'text-white/30',
      secondaryButton: 'border-white/10 bg-white/10 text-white/75',
      progressTrack: 'bg-white/15',
      timeText: 'text-white/40',
      iconButton: 'text-white/70 hover:text-white',
      openButton: 'text-white/45 hover:text-white',
      errorPanel: 'border-red-400/20 bg-red-500/15 text-red-100',
      errorText: 'text-red-300',
    }
    : {
      surface: 'bg-[#f7faf1] text-slate-950',
      artworkScrim: 'bg-gradient-to-b from-[#f7faf1]/25 via-[#f7faf1]/80 to-[#f7faf1]',
      overlay: 'bg-[#f7faf1]/95 text-slate-950',
      segment: 'bg-emerald-950/5 text-slate-500 ring-1 ring-emerald-900/10',
      segmentHover: 'hover:text-slate-950',
      primaryText: 'text-slate-950',
      strongText: 'text-slate-700',
      mutedText: 'text-slate-500',
      softText: 'text-slate-500',
      faintText: 'text-slate-400',
      idleArtwork: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/80',
      control: 'border border-emerald-900/10 bg-white/80 text-slate-600 shadow-sm hover:bg-white hover:text-slate-950',
      controlSubtle: 'border border-emerald-900/10 bg-white/75 text-slate-500 shadow-sm hover:bg-white hover:text-slate-950',
      input: 'border-emerald-900/10 bg-white/85 text-slate-950 shadow-sm placeholder:text-slate-400',
      listRow: 'hover:bg-emerald-900/5',
      resultTitle: 'text-slate-950',
      resultSubtitle: 'text-slate-500',
      recentTitle: 'text-slate-600',
      emptyState: 'text-slate-400',
      secondaryButton: 'border-emerald-900/10 bg-white/80 text-slate-700 shadow-sm',
      progressTrack: 'bg-slate-900/10',
      timeText: 'text-slate-500',
      iconButton: 'text-slate-600 hover:text-slate-950',
      openButton: 'text-slate-400 hover:text-slate-950',
      errorPanel: 'border-red-500/20 bg-red-50 text-red-700',
      errorText: 'text-red-500',
    };
  const curioSeekTrackClass = theme.dark
    ? 'bg-black/35 ring-1 ring-white/10 shadow-inner shadow-black/30'
    : 'bg-slate-950/18 ring-1 ring-slate-950/10 shadow-inner shadow-black/10';
  const curioSeekProgressClass = theme.dark
    ? 'bg-[#f472b6] shadow-[0_0_12px_rgba(244,114,182,0.38)]'
    : 'bg-[#be185d] shadow-[0_0_10px_rgba(190,24,93,0.18)]';

  const waveformProfile = useMemo(
    () => buildWaveProfile(`${snapshot.videoId || snapshot.uri || snapshot.id || 'idle'}:${snapshot.title || ''}`),
    [snapshot.id, snapshot.title, snapshot.uri, snapshot.videoId],
  );

  const waveformBars = useMemo(() => {
    const timeBase = isPlaying ? wavePhase : snapshot.currentTimeSeconds;
    const progressFactor = snapshot.durationSeconds > 0
      ? Math.min(1, Math.max(0, snapshot.currentTimeSeconds / snapshot.durationSeconds))
      : 0;
    const motionFactor = isPlaying ? 1 : 0.55;

    return waveformProfile.map((bar, index) => {
      const primary = Math.sin((timeBase * bar.frequency * 2.6) + bar.phaseOffset);
      const secondary = Math.sin((timeBase * (bar.frequency * 1.15 + 0.92)) + (bar.phaseOffset * 0.63) + (index * 0.19));
      const movement = ((primary * 0.67) + (secondary * 0.33) + 1) / 2;
      const progressInfluence = 0.9 + (Math.sin((progressFactor * Math.PI * 8) + (index * 0.4)) * 0.12);
      return clampUnit(bar.base + (movement * bar.variance * progressInfluence * motionFactor));
    });
  }, [isPlaying, snapshot.currentTimeSeconds, snapshot.durationSeconds, wavePhase, waveformProfile]);

  const manualPlayerPanel = manualPlaybackNeeded && (
    <div className="rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)]/70 p-2">
      {showInlinePlayer && inlinePlayerSrc && !minimalPlayer && (
        <div className="mb-2 aspect-video overflow-hidden rounded-xl bg-black">
          <iframe
            src={inlinePlayerSrc}
            title={snapshot.title || 'YouTube player'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="h-full w-full border-0"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!showInlinePlayer && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowInlinePlayer(true);
            }}
            className="rounded-full bg-[var(--ether-on-surface)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ether-surface)]"
          >
            Show player
          </button>
        )}
        {youtubeWatchUrl && (
          <a
            href={youtubeWatchUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface)]"
          >
            <ExternalLink size={11} />
            YouTube
          </a>
        )}
      </div>
    </div>
  );

  const spotifySearchOverlay = showSearch && (
    <div
      className={`absolute inset-0 z-20 flex min-h-0 flex-col overflow-hidden ${spotifySkin.overlay} backdrop-blur-xl ${spotifyCompactPanel ? 'p-2' : 'p-3'
        }`}
      data-testid="spotify-music-search-overlay"
    >
      <div className={`flex shrink-0 items-center justify-between gap-2 ${spotifyCompactPanel ? 'mb-2' : 'mb-3'}`}>
        <div className={`flex rounded-full p-0.5 text-[9px] font-black uppercase tracking-[0.16em] ${spotifySkin.segment}`}>
          {(['youtube', 'spotify'] as DashboardMusicSource[]).map((source) => (
            <button
              key={source}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                updateMusicConfig({ musicSource: source });
                setSearchResults([]);
              }}
              className={`rounded-full px-3 py-1.5 transition ${selectedSource === source ? 'bg-[#1db954] text-black' : spotifySkin.segmentHover
                }`}
            >
              {source}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1.5" data-testid="spotify-music-search-actions">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowSearch(false);
            }}
            className="dashboard-widget-control-button"
            aria-label="Close music search"
          >
            <X size={14} />
          </button>
          {dashboardActionSlot}
        </div>
      </div>

      <form onSubmit={handleSearch} className={`flex shrink-0 gap-2 ${spotifyCompactPanel ? 'mb-2' : 'mb-3'}`}>
        <input
          ref={searchInputRef}
          autoFocus
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={`Search ${selectedSource === 'spotify' ? 'Spotify songs, albums...' : 'YouTube Music...'}`}
          className={`min-w-0 flex-1 rounded-full border px-4 text-xs outline-none focus:border-[#1db954]/70 ${spotifySkin.input} ${spotifyCompactPanel ? 'py-1.5' : 'py-2'
            }`}
        />
        <button
          type="submit"
          className="dashboard-widget-control-button dashboard-widget-control-button-primary shrink-0"
          aria-label="Submit music search"
        >
          {isSearching ? <Loader2 size={14} className="animate-spin" /> : <SearchIcon size={14} />}
        </button>
      </form>

      <div
        className="dashboard-widget-touch-scroll min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1 [touch-action:pan-y]"
        data-testid="spotify-music-search-results"
        onWheel={handleSearchResultsWheel}
        onPointerDown={handleSearchResultsPointerDown}
        onPointerMove={handleSearchResultsPointerMove}
        onPointerUp={handleSearchResultsPointerEnd}
        onPointerCancel={handleSearchResultsPointerEnd}
      >
        {searchResults.length > 0 ? (
          searchResults.map((track) => (
            <button
              key={track.videoId || track.uri || track.id}
              onClick={(event) => handleSearchResultClick(event, track)}
              className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition ${spotifySkin.listRow}`}
            >
              <TrackArtwork src={track.thumbnailUrl} alt={track.title} className="h-10 w-10 shrink-0 rounded-md object-cover" />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[12px] font-bold ${spotifySkin.resultTitle}`}>{track.title}</p>
                <p className={`truncate text-[10px] ${spotifySkin.resultSubtitle}`}>
                  {track.itemType ? `${track.itemType} - ` : ''}{track.artistOrChannel}
                </p>
              </div>
            </button>
          ))
        ) : spotifyNeedsConnection ? (
          <div
            className={`flex min-h-full flex-col items-center text-center ${spotifyCompactPanel ? 'justify-start gap-2 py-1' : 'justify-center gap-3'
              }`}
          >
            {!spotifyUltraCompactPanel && <Headphones size={26} className="shrink-0 text-[#1db954]" />}
            <p
              className={`max-w-[15rem] font-bold uppercase ${spotifySkin.mutedText} ${spotifyCompactPanel ? 'text-[9px] leading-relaxed tracking-[0.14em]' : 'text-[10px] tracking-[0.18em]'
                }`}
            >
              Connect Spotify to search albums, artists, playlists, and songs.
            </p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void handleSpotifyConnect();
              }}
              className={`rounded-full bg-[#1db954] font-black uppercase tracking-[0.16em] text-black ${spotifyCompactPanel ? 'px-4 py-1.5 text-[9px]' : 'px-5 py-2 text-[10px]'
                }`}
            >
              Connect Spotify
            </button>
            {spotifyAuthError && <p className={`line-clamp-3 px-4 text-[10px] ${spotifySkin.errorText}`}>{spotifyAuthError}</p>}
          </div>
        ) : history.length > 0 && !isSearching ? (
          <>
            <div className={`px-1 text-[9px] font-black uppercase tracking-[0.18em] ${spotifySkin.faintText}`}>Recent</div>
            {history.map((track) => (
              <button
                key={track.videoId || track.uri || track.id}
                onClick={(event) => handleSearchResultClick(event, track)}
                className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition ${spotifySkin.listRow}`}
              >
                <TrackArtwork src={track.thumbnailUrl} alt={track.title} className="h-9 w-9 shrink-0 rounded-md object-cover opacity-70" />
                <p className={`min-w-0 flex-1 truncate text-[11px] font-medium ${spotifySkin.recentTitle}`}>{track.title}</p>
              </button>
            ))}
          </>
        ) : !isSearching && (
          <div className={`flex min-h-full flex-col items-center justify-center gap-2 ${spotifySkin.emptyState}`}>
            {!spotifyUltraCompactPanel && <Disc3 size={26} />}
            <p className="text-[10px] font-black uppercase tracking-[0.18em]">Search your library</p>
          </div>
        )}
      </div>
    </div>
  );

  if (selectedDesign === 'spotify') {
    const coverSize = minimalPlayer ? 'h-16 w-16' : compactPlayer ? 'h-20 w-20' : 'h-24 w-24';
    const idleArtworkClass = spotifyCompactPanel
      ? 'h-8 w-20 rounded-full'
      : compactPlayer
        ? 'h-14 w-14 rounded-2xl'
        : 'h-20 w-20 rounded-2xl';
    const idleGapClass = spotifyCompactPanel ? 'gap-2' : 'gap-4';
    const idleTitleClass = spotifyCompactPanel ? 'text-lg' : 'text-xl';
    return (
      <DashboardWidgetActionSlotContext.Provider value={null}>
        <WidgetShell bare padded={false} accent="emerald" widget={widget}>
          <div
            className={`relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[inherit] p-3 ${spotifySkin.surface}`}
            data-testid="spotify-music-surface"
          >
            {hasTrack && snapshot.thumbnailUrl && (
              <div className="absolute inset-0 opacity-25">
                <img src={snapshot.thumbnailUrl} alt="" className="h-full w-full scale-125 object-cover blur-2xl" />
                <div className={`absolute inset-0 ${spotifySkin.artworkScrim}`} />
              </div>
            )}
            {spotifySearchOverlay}

            <div
              className={`relative z-10 flex shrink-0 items-center justify-between gap-2 ${spotifyCompactPanel ? 'mb-1.5' : 'mb-2'
                }`}
              data-testid="spotify-music-header"
            >
              <div className="min-w-0">
                <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${spotifySkin.faintText}`}>Now Playing</p>
                <p className={`truncate text-[11px] font-bold ${spotifySkin.strongText}`}>{sourceLabel}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5" data-testid="spotify-music-header-actions">
                <button
                  type="button"
                  onClick={() => setShowSearch(true)}
                  className="dashboard-widget-control-button"
                  aria-label="Search music"
                >
                  <SearchIcon size={14} />
                </button>
                {!showSearch && dashboardActionSlot}
              </div>
            </div>

            {!hasTrack ? (
              <div className={`relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center ${idleGapClass} text-center`}>
                <div className={`flex items-center justify-center ${spotifySkin.idleArtwork} ${idleArtworkClass}`}>
                  <IconMusic />
                </div>
                <div>
                  <h3 className={`${idleTitleClass} font-black leading-none ${spotifySkin.primaryText}`}>No track queued</h3>
                  <div className={`${spotifyCompactPanel ? 'mt-1' : 'mt-2'}`}>
                    <WidgetText variant="label" className={spotifySkin.softText}>
                      {selectedSource === 'spotify' ? 'Spotify source selected' : 'YouTube source selected'}
                    </WidgetText>
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSearch(true)}
                    className={`rounded-full bg-[#1db954] font-black uppercase tracking-[0.16em] text-black ${spotifyCompactPanel ? 'px-4 py-1.5 text-[9px]' : 'px-5 py-2 text-[10px]'
                      }`}
                  >
                    Browse Music
                  </button>
                  {selectedSource === 'spotify' && (
                    <button
                      type="button"
                      onClick={spotifyAuthStatus.connected ? handleSpotifyDisconnect : handleSpotifyConnect}
                      className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] ${spotifySkin.secondaryButton}`}
                    >
                      {spotifyAuthStatus.connected ? 'Connected' : 'Connect'}
                    </button>
                  )}
                </div>
                {spotifyAuthError && <p className={`line-clamp-2 px-4 text-[10px] ${spotifySkin.errorText}`}>{spotifyAuthError}</p>}
              </div>
            ) : (
              <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-between gap-3">
                {snapshot.playbackState === 'error' && (
                  <div className={`rounded-xl border px-3 py-2 text-[10px] font-bold uppercase ${spotifySkin.errorPanel}`}>
                    {snapshot.error || 'Playback failed'}
                  </div>
                )}
                <div className="flex min-h-0 items-center gap-4">
                  <TrackArtwork src={snapshot.thumbnailUrl} alt={artworkAlt} className={`${coverSize} shrink-0 rounded-lg object-cover shadow-2xl`} />
                  <div className="min-w-0 flex-1">
                    <h3 className={`${minimalPlayer ? 'line-clamp-1 text-lg' : 'line-clamp-2 text-2xl'} font-black leading-none ${spotifySkin.primaryText}`}>
                      {snapshot.title}
                    </h3>
                    <p className={`mt-2 truncate text-[11px] font-semibold ${spotifySkin.mutedText}`}>{snapshot.artistOrChannel}</p>
                    {snapshot.albumName && (
                      <p className={`mt-1 truncate text-[10px] ${spotifySkin.faintText}`}>{snapshot.albumName}</p>
                    )}
                  </div>
                </div>

                <div>
                  <div onClick={seek} className={`h-1.5 cursor-pointer rounded-full ${spotifySkin.progressTrack}`}>
                    <div className="h-full rounded-full bg-[#1db954] transition-all duration-300" style={{ width: `${progress * 100}%` }} />
                  </div>
                  <div className={`mt-1.5 flex justify-between text-[9px] font-bold tabular-nums ${spotifySkin.timeText}`}>
                    <span>{currentTimeLabel}</span>
                    <span>{durationLabel}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <button type="button" onClick={handleShuffleNext} className="text-[#1db954]" aria-label="Shuffle similar track">
                    <Shuffle size={16} />
                  </button>
                  <div className="flex items-center gap-5">
                    <button type="button" onClick={handleReplay} className={`transition ${spotifySkin.iconButton}`} aria-label="Restart track">
                      <SkipBack size={17} fill="currentColor" />
                    </button>
                    <button
                      type="button"
                      onClick={toggle}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1db954] text-black shadow-[0_14px_32px_rgba(29,185,84,0.28)] transition hover:scale-105 active:scale-95"
                      aria-label={isPlaying ? 'Pause music' : 'Play music'}
                    >
                      {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
                    </button>
                    <button type="button" onClick={handleShuffleNext} className={`transition ${spotifySkin.iconButton}`} aria-label="Play next similar track">
                      <SkipForward size={17} fill="currentColor" />
                    </button>
                  </div>
                  {externalPlaybackUrl ? (
                    <a
                      href={externalPlaybackUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className={`transition ${spotifySkin.openButton}`}
                      aria-label={`Open in ${sourceLabel}`}
                    >
                      <ExternalLink size={15} />
                    </a>
                  ) : (
                    <span className="w-[15px]" />
                  )}
                </div>
              </div>
            )}
          </div>
        </WidgetShell>
      </DashboardWidgetActionSlotContext.Provider>
    );
  }

  // Tiny View
  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare padded={false} accent="pink" widget={widget}>
        <div className="group relative flex h-full w-full flex-col items-center justify-center overflow-hidden">
          {hasTrack && snapshot.thumbnailUrl ? (
            <>
              {/* Blurred Background Art */}
              <div className="absolute inset-0 z-0 transition-transform duration-700 group-hover:scale-110">
                <img
                  src={snapshot.thumbnailUrl}
                  alt=""
                  className={`h-full w-full object-cover transition-all duration-1000 ${isPlaying ? 'scale-110 blur-[1px]' : 'scale-100 grayscale-[0.6] opacity-50'}`}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/70" />
              </div>

              {/* Content */}
              <div className="relative z-10 flex flex-col items-center gap-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); toggle(); }}
                  className={`flex h-11 w-11 items-center justify-center rounded-full transition-all duration-300 shadow-2xl ${isPlaying
                      ? 'bg-white text-black scale-105'
                      : 'bg-white/20 text-white backdrop-blur-xl border border-white/30 hover:bg-white/40 active:scale-95'
                    }`}
                >
                  {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                </button>
                <div className="max-w-[85%] text-center px-2">
                  <p className="truncate text-[9px] font-black uppercase text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                    {snapshot.title}
                  </p>
                  {hasTrack && (
                    <p className="mt-0.5 text-[8px] font-bold text-white/70 tabular-nums">
                      {currentTimeLabel} / {durationLabel}
                    </p>
                  )}
                </div>
              </div>

              {/* Small "Now Playing" Indicator */}
              {isPlaying && (
                <div className="absolute top-2 right-2 flex h-3 items-end gap-0.5 opacity-75">
                  {waveformBars.slice(0, 3).map((value, index) => (
                    <span
                      key={index}
                      className="w-0.5 rounded-full bg-white transition-all duration-100"
                      style={{ height: `${Math.max(2, value * 10)}px` }}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-[var(--ether-surface-container-high)] flex items-center justify-center shadow-lg border border-[var(--ether-glass-border)]">
                <IconMusic />
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setShowSearch(true); }}
                className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--ether-primary)] hover:text-[var(--ether-on-surface)] transition-colors"
              >
                BROWSE MUSIC
              </button>
            </div>
          )}
        </div>
      </WidgetShell>
    );
  }

  return (
    <DashboardWidgetActionSlotContext.Provider value={showSearch ? null : dashboardActionSlot}>
      <WidgetShell
        bare={showSearch}
        padded={!showSearch}
        widget={widget}
        title={showSearch ? "Search Music" : "Now Playing"}
        icon={<IconMusic />}
        accent="pink"
        rightSlot={
          <div className="flex gap-2">
            {widget.config.linkedMusicWidgetId && !showSearch && (
              <span
                data-testid="music-linked-chip"
                className="inline-flex items-center rounded-full bg-[var(--ether-control-bg)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)]"
                aria-label="Linked to another music widget"
              >
                Linked
              </span>
            )}
            {!showSearch && (
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="dashboard-widget-control-button"
                aria-label="Search music"
              >
                <SearchIcon size={14} />
              </button>
            )}
            {showSearch && (
              <button
                type="button"
                onClick={() => setShowSearch(false)}
                className="dashboard-widget-control-button dashboard-widget-control-button-active"
                aria-label="Close music search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        }
      >
        <div className="relative flex min-h-0 flex-1 flex-col">

          {/* ── Search Overlay ── */}
          {showSearch && (
            <div
              className="relative z-20 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/95 p-2 backdrop-blur-md ether-widget-enter sm:p-3"
              data-testid="curio-music-search-frame"
            >
              <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
                <div className="flex rounded-full bg-[var(--ether-control-bg)] p-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--ether-on-surface-variant)]">
                  {(['youtube', 'spotify'] as DashboardMusicSource[]).map((source) => (
                    <button
                      key={source}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        updateMusicConfig({ musicSource: source });
                        setSearchResults([]);
                      }}
                      className={`rounded-full px-2.5 py-1 transition ${selectedSource === source
                          ? 'bg-[var(--ether-on-surface)] text-[var(--ether-surface)]'
                          : 'hover:text-[var(--ether-on-surface)]'
                        }`}
                    >
                      {source}
                    </button>
                  ))}
                </div>
                {selectedSource === 'spotify' && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void (spotifyAuthStatus.connected ? handleSpotifyDisconnect() : handleSpotifyConnect());
                    }}
                    className="rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--ether-on-surface)]"
                  >
                    {spotifyAuthStatus.connected ? 'Connected' : 'Connect'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowSearch(false);
                  }}
                  className="dashboard-widget-control-button dashboard-widget-control-button-active relative z-30"
                  aria-label="Close music search"
                >
                  <X size={13} />
                </button>
              </div>
              <form
                onSubmit={handleSearch}
                className={`flex shrink-0 gap-2 ${searchPanelCompact ? 'mb-2' : 'mb-3'}`}
                data-testid="curio-music-search-form"
              >
                <input
                  ref={searchInputRef}
                  autoFocus
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={`Search ${selectedSource === 'spotify' ? 'Spotify songs, albums, artists...' : 'YouTube Music...'}`}
                  className="min-w-0 flex-1 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] px-3 py-2 text-xs outline-none focus:border-[var(--ether-primary)]/50"
                />
                <button
                  type="submit"
                  className="dashboard-widget-control-button dashboard-widget-control-button-primary shrink-0"
                  aria-label="Submit music search"
                >
                  {isSearching ? <Loader2 size={14} className="animate-spin" /> : <SearchIcon size={14} />}
                </button>
              </form>

              <div
                className="dashboard-widget-touch-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-1 [touch-action:pan-y]"
                data-testid="curio-music-search-results"
                onWheel={handleSearchResultsWheel}
                onPointerDown={handleSearchResultsPointerDown}
                onPointerMove={handleSearchResultsPointerMove}
                onPointerUp={handleSearchResultsPointerEnd}
                onPointerCancel={handleSearchResultsPointerEnd}
              >
                {searchResults.length > 0 ? (
                  searchResults.map(track => (
                    <button
                      key={track.videoId || track.uri || track.id}
                      onClick={(event) => handleSearchResultClick(event, track)}
                      className={`flex w-full items-center gap-3 rounded-xl border border-transparent p-2 text-left transition-all hover:border-white/5 hover:bg-white/5 ${searchPanelCompact ? 'min-h-10' : 'min-h-12'}`}
                    >
                      <TrackArtwork src={track.thumbnailUrl} alt={track.title} className={`${searchPanelCompact ? 'h-8 w-8' : 'h-10 w-10'} shrink-0 rounded-lg object-cover`} />
                      <div className="min-w-0 flex-1">
                        <p className={`text-[11px] font-bold truncate ${theme.onSurface}`}>{track.title}</p>
                        <p className={`text-[9px] ${theme.onSurfaceVariant}`}>
                          {track.itemType ? `${track.itemType} - ` : ''}{track.artistOrChannel}
                        </p>
                      </div>
                    </button>
                  ))
                ) : spotifyNeedsConnection ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
                    <Headphones size={24} className="text-[var(--ether-on-surface-variant)]" />
                    <WidgetText variant="label" tone="muted" align="center">
                      Connect Spotify to search and play
                    </WidgetText>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleSpotifyConnect();
                      }}
                      className="rounded-full bg-[#1db954] px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-black"
                    >
                      Connect Spotify
                    </button>
                    {spotifyAuthError && (
                      <p className="line-clamp-3 text-[10px] text-red-400">{spotifyAuthError}</p>
                    )}
                  </div>
                ) : history.length > 0 && !isSearching ? (
                  <>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <History size={10} className={theme.onSurfaceVariant} />
                      <WidgetText variant="label" tone="muted">Recent</WidgetText>
                    </div>
                    {history.map(track => (
                      <button
                        key={track.videoId || track.uri || track.id}
                        onClick={(event) => handleSearchResultClick(event, track)}
                        className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left border border-transparent hover:border-white/5 transition-all"
                      >
                        <TrackArtwork src={track.thumbnailUrl} alt={track.title} className="h-8 w-8 shrink-0 rounded-lg object-cover opacity-60" />
                        <div className="min-w-0 flex-1">
                          <p className={`text-[10px] font-medium truncate ${theme.onSurfaceVariant}`}>{track.title}</p>
                        </div>
                      </button>
                    ))}
                  </>
                ) : !isSearching && (
                  <div className="h-full flex flex-col items-center justify-center opacity-30">
                    <IconMusic />
                    <div className="mt-2">
                      <WidgetText variant="label" tone="muted" align="center">Find your soul</WidgetText>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Main View ── */}
          {!showSearch && (!hasTrack ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="shrink-0">
                <h3
                  className={`font-headline font-semibold leading-tight text-[var(--ether-on-surface)] ${
                    compactPlayer ? 'text-base' : 'text-2xl'
                  }`}
                >
                  No track queued
                </h3>
                <div className="mt-1.5">
                  <WidgetText variant="label" tone="muted">
                    Search {sourceLabel}
                  </WidgetText>
                </div>
              </div>
              {!compactPlayer && (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-1">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--ether-control-bg)] text-[var(--ether-on-surface)] ring-1 ring-[var(--ether-glass-border)]">
                    <IconMusic />
                  </div>
                  <div
                    className="flex h-10 w-full items-center justify-center gap-1 overflow-hidden opacity-55"
                    data-testid="curio-music-idle-waveform"
                  >
                    {waveformBars.slice(0, 12).map((value, index) => (
                      <span
                        key={index}
                        className="w-1 shrink-0 rounded-full bg-[var(--ether-on-surface)]/35 transition-all duration-100"
                        style={{ height: `${Math.max(9, value * 28)}px` }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className={`flex shrink-0 flex-col gap-2 ${compactPlayer ? 'mt-auto' : ''}`}>
                <button
                  onClick={() => setShowSearch(true)}
                  className={`rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface)] transition hover:bg-[var(--ether-control-hover)] active:scale-[0.98] ${
                    compactPlayer ? 'px-4 py-2 text-[10px]' : 'px-5 py-3 text-[11px]'
                  }`}
                >
                  Browse Music
                </button>
                {selectedSource === 'spotify' && (
                  <button
                    type="button"
                    onClick={spotifyAuthStatus.connected ? handleSpotifyDisconnect : handleSpotifyConnect}
                    className={`rounded-full border border-[#1db954]/35 bg-[#1db954]/10 font-black uppercase tracking-[0.18em] text-[#1db954] transition hover:bg-[#1db954]/15 ${
                      compactPlayer ? 'px-4 py-1.5 text-[9px]' : 'px-5 py-2 text-[10px]'
                    }`}
                  >
                    {spotifyAuthStatus.connected ? 'Spotify connected' : 'Connect Spotify'}
                  </button>
                )}
              </div>
            </div>
          ) : minimalPlayer ? (
            <div
              className="flex min-h-0 flex-1 flex-col justify-between gap-2"
              data-testid="curio-music-compact-player"
            >
              {snapshot.playbackState === 'error' && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5">
                  <p className="line-clamp-1 text-[10px] font-bold uppercase text-red-500">{snapshot.error || 'Playback failed'}</p>
                </div>
              )}
              {manualPlayerPanel}

              <div className="flex min-w-0 shrink-0 items-center gap-3">
                <TrackArtwork
                  src={snapshot.thumbnailUrl}
                  alt={artworkAlt}
                  className="h-14 w-14 shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-[var(--ether-glass-border)]"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-1 font-headline text-[17px] font-semibold leading-none text-[var(--ether-on-surface)]">
                    {snapshot.title}
                  </h3>
                  <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <WidgetText variant="label" tone="muted">
                        {artistLine}
                      </WidgetText>
                    </div>
                    <p className="shrink-0 text-[9px] font-bold tabular-nums text-[var(--ether-on-surface-variant)]">
                      {currentTimeLabel} / {durationLabel}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 py-1" data-testid="curio-music-compact-media">
                <div
                  className="flex h-8 w-full items-center justify-center gap-1 overflow-hidden px-2"
                  data-testid="curio-music-active-waveform"
                >
                  {waveformBars.slice(0, 16).map((value, index) => (
                    <span
                      key={index}
                      data-testid="curio-music-waveform-bar"
                      className="w-1 shrink-0 rounded-full bg-[var(--ether-on-surface)]/45 transition-all duration-100"
                      style={{
                        height: `${Math.max(7, value * 24)}px`,
                        opacity: isPlaying ? 0.85 : 0.42,
                      }}
                    />
                  ))}
                </div>

                <div
                  onClick={seek}
                  className={`h-1.5 w-full cursor-pointer overflow-hidden rounded-full ${curioSeekTrackClass}`}
                  role="button"
                  tabIndex={0}
                  aria-label="Seek in track"
                  data-testid="curio-music-seek-bar"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void musicPlaybackService.seekTo(progress * snapshot.durationSeconds);
                    }
                  }}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${curioSeekProgressClass}`}
                    data-testid="curio-music-seek-progress"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              </div>

              <div
                className="flex shrink-0 items-center justify-center gap-5 text-[var(--ether-on-surface)]"
                data-testid="curio-music-playback-controls"
              >
                <button
                  onClick={handleReplay}
                  className="opacity-70 transition hover:opacity-100 active:scale-95"
                  aria-label="Restart track"
                >
                  <SkipBack size={15} fill="currentColor" />
                </button>
                <button
                  onClick={toggle}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ether-on-surface)] text-[var(--ether-surface)] shadow-[0_12px_28px_rgba(0,0,0,0.18)] transition hover:scale-105 active:scale-95"
                  aria-label={isPlaying ? 'Pause music' : 'Play music'}
                >
                  {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="ml-0.5" />}
                </button>
                <button
                  onClick={handleShuffleNext}
                  className="opacity-70 transition hover:opacity-100 active:scale-95"
                  aria-label="Play next similar track"
                >
                  <SkipForward size={15} fill="currentColor" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-3">
              {snapshot.playbackState === 'error' && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 flex items-center gap-2">
                  <X className="text-red-500 shrink-0" size={14} />
                  <p className="line-clamp-2 text-[10px] font-bold uppercase text-red-500">{snapshot.error || 'Playback failed'}</p>
                </div>
              )}
              {manualPlayerPanel}

              <div className="flex min-w-0 shrink-0 items-center gap-4">
                <TrackArtwork
                  src={snapshot.thumbnailUrl}
                  alt={artworkAlt}
                  className={`${compactPlayer ? 'h-16 w-16' : 'h-20 w-20'} shrink-0 rounded-2xl object-cover shadow-lg ring-1 ring-[var(--ether-glass-border)]`}
                />
                <div className="min-w-0 flex-1">
                  <h3 className={`font-headline font-semibold leading-none text-[var(--ether-on-surface)] ${minimalPlayer ? 'line-clamp-1 text-xl' : compactPlayer ? 'line-clamp-1 text-2xl' : 'line-clamp-2 text-3xl'}`}>
                    {snapshot.title}
                  </h3>
                  <div className="mt-2">
                    <WidgetText variant="label" tone="muted">
                      {artistLine}
                    </WidgetText>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-col items-center gap-2">
                <div
                  className="flex h-14 w-full items-center justify-center gap-1 overflow-hidden px-4"
                  data-testid="curio-music-active-waveform"
                >
                  {waveformBars.slice(0, compactPlayer ? 18 : 24).map((value, index) => (
                    <span
                      key={index}
                      data-testid="curio-music-waveform-bar"
                      className="w-1 shrink-0 rounded-full bg-[var(--ether-on-surface)]/45 transition-all duration-100"
                      style={{
                        height: `${Math.max(10, value * (compactPlayer ? 30 : 38))}px`,
                        opacity: isPlaying ? 0.88 : 0.42,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-1">
                <div
                  onClick={seek}
                  className={`h-1.5 w-full cursor-pointer overflow-hidden rounded-full ${curioSeekTrackClass}`}
                  role="button"
                  tabIndex={0}
                  aria-label="Seek in track"
                  data-testid="curio-music-seek-bar"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void musicPlaybackService.seekTo(progress * snapshot.durationSeconds);
                    }
                  }}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${curioSeekProgressClass}`}
                    data-testid="curio-music-seek-progress"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[10px] font-bold tabular-nums text-[var(--ether-on-surface-variant)]">
                  <span>{currentTimeLabel}</span>
                  <span>{durationLabel}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[var(--ether-on-surface)]" data-testid="curio-music-playback-controls">
                <button
                  onClick={handleShuffleNext}
                  className={`transition hover:opacity-100 active:scale-95 ${compactPlayer ? 'hidden' : 'opacity-45'}`}
                  aria-label="Shuffle similar track"
                >
                  <Shuffle size={16} />
                </button>
                <div className={`flex items-center ${minimalPlayer ? 'gap-5' : 'gap-7'}`}>
                  <button
                    onClick={handleReplay}
                    className="opacity-75 transition hover:opacity-100 active:scale-95"
                    aria-label="Restart track"
                  >
                    <SkipBack size={16} fill="currentColor" />
                  </button>
                  <button
                    onClick={toggle}
                    className={`${minimalPlayer ? 'h-10 w-10' : 'h-12 w-12'} flex items-center justify-center rounded-full bg-[var(--ether-on-surface)] text-[var(--ether-surface)] shadow-[0_12px_28px_rgba(0,0,0,0.18)] transition hover:scale-105 active:scale-95`}
                    aria-label={isPlaying ? 'Pause music' : 'Play music'}
                  >
                    {isPlaying ? <Pause size={minimalPlayer ? 17 : 20} fill="currentColor" /> : <Play size={minimalPlayer ? 17 : 20} fill="currentColor" className="ml-0.5" />}
                  </button>
                  <button
                    onClick={handleShuffleNext}
                    className="opacity-75 transition hover:opacity-100 active:scale-95"
                    aria-label="Play next similar track"
                  >
                    <SkipForward size={16} fill="currentColor" />
                  </button>
                </div>
                <button
                  onClick={handleReplay}
                  className={`transition hover:opacity-100 active:scale-95 ${compactPlayer ? 'hidden' : 'opacity-45'}`}
                  aria-label="Repeat track"
                >
                  <Repeat size={16} />
                </button>
              </div>

              {!compactPlayer && (
                <div className="flex items-center gap-3 text-[var(--ether-on-surface-variant)]">
                  {snapshot.volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  <input
                    type="range"
                    min="0" max="100"
                    value={snapshot.volume}
                    onChange={setVolume}
                    className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--ether-control-bg)] accent-[var(--ether-on-surface)]"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </WidgetShell>
    </DashboardWidgetActionSlotContext.Provider>
  );
};

export default React.memo(MusicWidget);
