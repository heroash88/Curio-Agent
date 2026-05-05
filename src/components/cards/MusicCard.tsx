import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Music, Pause, Play, Square, Volume1, Volume2, VolumeX, SkipForward } from 'lucide-react';
import type { CardComponentProps, MusicCardData } from '../../services/cardTypes';
import { musicPlaybackService } from '../../services/musicPlaybackService';
import { searchMusicCandidates } from '../../services/musicSearchService';

const CARD_BASE_CLASS =
  'relative w-[min(100vw-2rem,17rem)] overflow-hidden rounded-3xl border border-white/5 p-4 text-white shadow-[0_32px_64px_rgba(0,0,0,0.5)] transition-all duration-500';

const formatPlaybackTime = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const MusicCard: React.FC<CardComponentProps> = ({
  card,
  onDismiss,
  onInteractionStart,
  onInteractionEnd,
}) => {
  const initialData = card.data as unknown as MusicCardData;
  const [snapshot, setSnapshot] = useState(() => musicPlaybackService.getState());
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(
    typeof initialData.currentTimeSeconds === 'number' ? initialData.currentTimeSeconds : 0,
  );
  const isSeekingRef = useRef(false);
  const hasMountedRef = useRef(false);
  const hasDismissedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = musicPlaybackService.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const hasActiveItem = Boolean(snapshot.videoId || snapshot.uri || snapshot.id);
    if (!hasDismissedRef.current && !hasActiveItem && snapshot.playbackState === 'idle') {
      hasDismissedRef.current = true;
      onDismiss();
    }
  }, [onDismiss, snapshot.id, snapshot.playbackState, snapshot.uri, snapshot.videoId]);

  const cardData = useMemo<MusicCardData>(() => ({
    ...initialData,
    playerId: snapshot.playerId || initialData.playerId,
    videoId: snapshot.videoId || initialData.videoId || null,
    id: snapshot.id || initialData.id,
    uri: snapshot.uri || initialData.uri,
    itemType: snapshot.itemType || initialData.itemType,
    query: snapshot.query || initialData.query,
    title: snapshot.title || initialData.title,
    artistOrChannel: snapshot.artistOrChannel || initialData.artistOrChannel,
    thumbnailUrl: snapshot.thumbnailUrl || initialData.thumbnailUrl,
    albumName: snapshot.albumName || initialData.albumName,
    externalUrl: snapshot.externalUrl || initialData.externalUrl,
    playbackState: snapshot.playbackState !== 'idle' ? snapshot.playbackState : initialData.playbackState,
    currentTimeSeconds:
      typeof snapshot.currentTimeSeconds === 'number'
        ? snapshot.currentTimeSeconds
        : (typeof initialData.currentTimeSeconds === 'number' ? initialData.currentTimeSeconds : 0),
    durationSeconds:
      typeof snapshot.durationSeconds === 'number'
        ? snapshot.durationSeconds
        : (typeof initialData.durationSeconds === 'number' ? initialData.durationSeconds : 0),
    volume: typeof snapshot.volume === 'number' ? snapshot.volume : (typeof initialData.volume === 'number' ? initialData.volume : 70),
    source: snapshot.source || initialData.source || 'youtube',
    error: snapshot.error ?? initialData.error,
    autoplayBlocked: snapshot.autoplayBlocked ?? initialData.autoplayBlocked,
  }), [initialData, snapshot]);

  useEffect(() => {
    if (!isSeeking) {
      setSeekValue(cardData.currentTimeSeconds);
    }
  }, [cardData.currentTimeSeconds, isSeeking]);

  const primaryActionLabel = cardData.playbackState === 'playing'
    ? 'Pause'
    : cardData.playbackState === 'loading'
      ? 'Loading'
      : 'Play';

  const handlePrimaryAction = async () => {
    onInteractionStart();
    try {
      if (cardData.playbackState === 'playing') {
        await musicPlaybackService.pause();
      } else {
        await musicPlaybackService.resume();
      }
    } finally {
      onInteractionEnd();
    }
  };

  const handleVolumeChange = async (nextVolume: number) => {
    onInteractionStart();
    try {
      await musicPlaybackService.setVolume(nextVolume);
    } finally {
      onInteractionEnd();
    }
  };

  const VolumeIcon = cardData.volume <= 0 ? VolumeX : cardData.volume < 45 ? Volume1 : Volume2;

  const handleSeekCommit = async (nextTime: number) => {
    onInteractionStart();
    try {
      await musicPlaybackService.seekTo(nextTime);
    } finally {
      onInteractionEnd();
    }
  };

  const handleStop = async () => {
    onInteractionStart();
    try {
      await musicPlaybackService.stop();
    } finally {
      onInteractionEnd();
    }
  };

  const handleShuffleNext = async () => {
    onInteractionStart();
    try {
      const query = cardData.query || cardData.title;
      if (!query) return;

      const candidates = await searchMusicCandidates(query, cardData.source);
      if (candidates.length > 0) {
        const currentKey = cardData.source === 'spotify'
          ? (cardData.uri || cardData.id || '')
          : (cardData.videoId || '');
        const others = candidates.filter((candidate) => {
          const candidateKey = candidate.source === 'spotify'
            ? (candidate.uri || candidate.id || '')
            : (candidate.videoId || '');
          return candidateKey !== currentKey;
        });
        const pool = others.length > 0 ? others : candidates;
        const nextTrack = pool[Math.floor(Math.random() * pool.length)];
        
        await musicPlaybackService.play({
          source: nextTrack.source,
          videoId: nextTrack.videoId,
          id: nextTrack.id,
          uri: nextTrack.uri,
          itemType: nextTrack.itemType,
          query: query,
          title: nextTrack.title,
          artistOrChannel: nextTrack.artistOrChannel,
          thumbnailUrl: nextTrack.thumbnailUrl,
          albumName: nextTrack.albumName,
          externalUrl: nextTrack.externalUrl,
          durationSeconds: nextTrack.durationSeconds,
        });
      }
    } finally {
      onInteractionEnd();
    }
  };

  return (
    <div className={CARD_BASE_CLASS}>
      {/* Reactive "Bleeding Color" Background System */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {/* Deep Field Glow */}
        <div 
          className="absolute inset-[-50%] bg-cover bg-center scale-150 blur-[80px] opacity-60 transition-all duration-1000"
          style={{ backgroundImage: `url(${cardData.thumbnailUrl})` }}
        />
        
        {/* Dynamic Inner Light */}
        <div 
          className="absolute inset-0 bg-cover bg-center scale-110 blur-2xl opacity-30 transition-all duration-1000 animate-pulse-slow"
          style={{ backgroundImage: `url(${cardData.thumbnailUrl})` }}
        />

        {/* Glossy Overlay Gradients */}
        <div className="absolute inset-0 bg-gradient-to-tr from-black/80 via-black/30 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/50" />
      </div>

      {/* External Glow Shadow (Invisible but affects context) */}
      <div 
        className="absolute -inset-10 z-[-1] scale-110 blur-[100px] opacity-20 transition-all duration-1000"
        style={{ backgroundImage: `url(${cardData.thumbnailUrl})`, backgroundSize: 'cover' }}
      />

      <div className="relative z-10 flex flex-col items-center">
        {/* Header Label - Tighter */}
        <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">
            <span className="h-1 w-1 rounded-full bg-teal-400 animate-pulse" />
            Curio Music
        </p>

        {/* Thumbnail - Smaller and Tighter */}
        <div className="relative group mb-3">
            <div className="absolute -inset-1.5 rounded-xl bg-white/10 blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
            {cardData.thumbnailUrl && (
                <img
                    src={cardData.thumbnailUrl}
                    alt={cardData.title}
                    className="relative h-14 w-14 rounded-xl object-cover shadow-2xl ring-1 ring-white/20"
                    loading="lazy"
                />
            )}
            {!cardData.thumbnailUrl && (
                <div className="relative h-14 w-14 rounded-xl bg-white/5 flex items-center justify-center ring-1 ring-white/10">
                    <Music size={20} className="text-white/20" />
                </div>
            )}
        </div>

        {/* Text Metadata - Compact Centered */}
        <div className="text-center w-full px-2">
            <h3 className="line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm">
                {cardData.title}
            </h3>
            <p className="mt-0.5 truncate text-[10px] font-medium text-white/70">
                {cardData.artistOrChannel}
            </p>
        </div>

        {cardData.error && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-red-500/20 border border-red-500/30 px-3 py-1.5 text-[10px] text-red-200 backdrop-blur-sm">
            <span className="h-1 w-1 rounded-full bg-red-400" />
            {cardData.error}
          </div>
        )}

        {/* Playback Status Badge - Tighter */}
        <div className="mt-2 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-white/70 backdrop-blur-md">
                {cardData.playbackState === 'playing' && (
                    <div className="flex gap-0.5 h-1.5 items-end">
                    <div className="w-0.5 bg-teal-400/80 animate-music-bar-1" />
                    <div className="w-0.5 bg-teal-400/80 animate-music-bar-2" />
                    <div className="w-0.5 bg-teal-400/80 animate-music-bar-3" />
                    </div>
                )}
                {cardData.playbackState === 'loading' ? 'Buffering...' : cardData.playbackState}
            </span>
        </div>

        {/* Progress Bar - Compact */}
        <div className="mt-3 w-full px-1">
          <input
            type="range"
            min={0}
            max={Math.max(1, cardData.durationSeconds || 0)}
            step={1}
            value={Math.min(seekValue, Math.max(1, cardData.durationSeconds || 0))}
            onPointerDown={() => {
              isSeekingRef.current = true;
              setIsSeeking(true);
            }}
            onPointerUp={(event) => {
              const nextTime = Number((event.target as HTMLInputElement).value);
              isSeekingRef.current = false;
              setIsSeeking(false);
              void handleSeekCommit(nextTime);
            }}
            onPointerCancel={() => {
              isSeekingRef.current = false;
              setIsSeeking(false);
            }}
            onChange={(event) => {
              const nextTime = Number(event.target.value);
              setSeekValue(nextTime);
              if (!isSeekingRef.current) {
                void handleSeekCommit(nextTime);
              }
            }}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-white transition-all hover:bg-white/30"
            aria-label="Music playback position"
            disabled={cardData.durationSeconds <= 0}
          />
          <div className="mt-2 flex items-center justify-between font-medium text-[9px] tabular-nums text-white/50">
            <span>{formatPlaybackTime(isSeeking ? seekValue : cardData.currentTimeSeconds)}</span>
            <span>{formatPlaybackTime(cardData.durationSeconds)}</span>
          </div>
        </div>

        {/* Playback Controls - Centered Bottom - Tighter */}
        <div className="mt-1 flex flex-col items-center gap-2 w-full">
            <div className="flex w-full items-center justify-center gap-5">
                <button
                    type="button"
                    onClick={handleStop}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-all hover:bg-white/15 active:scale-95 disabled:opacity-50 border border-white/5"
                    aria-label="Stop music"
                >
                    <Square size={16} fill="currentColor" className="opacity-80" />
                </button>

                <button
                    type="button"
                    onClick={handlePrimaryAction}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition-all hover:bg-white/25 active:scale-90 disabled:opacity-50 shadow-lg border border-white/10"
                    disabled={cardData.playbackState === 'loading'}
                    aria-label={`${primaryActionLabel} music`}
                >
                    {cardData.playbackState === 'playing' ? <Pause size={24} fill="currentColor" /> : <Play size={24} className="translate-x-[1px]" fill="currentColor" />}
                </button>

                <button
                    type="button"
                    onClick={handleShuffleNext}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-all hover:bg-white/15 active:scale-95 disabled:opacity-50 border border-white/5"
                    title="Shuffle Next"
                    aria-label="Shuffle next song"
                >
                    <SkipForward size={16} fill="currentColor" className="opacity-80" />
                </button>
            </div>

            {/* Volume Control - Tighter */}
            <div className="flex w-full items-center gap-3 px-2">
                <VolumeIcon size={12} className="shrink-0 text-white/50" aria-hidden="true" />
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={cardData.volume}
                    onChange={(event) => {
                        void handleVolumeChange(Number(event.target.value));
                    }}
                    className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-teal-400 transition-all hover:bg-white/30"
                    aria-label="Music player volume"
                />
            </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(MusicCard);
