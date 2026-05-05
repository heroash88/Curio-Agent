import React, { useState } from 'react';
import { Music, Pause, Play, Volume2 } from 'lucide-react';
import { useThemeMode } from '../../utils/settingsStorage';
import { useCardManager } from '../../contexts/CardManagerContext';
import { musicPlaybackService } from '../../services/musicPlaybackService';

interface MusicMiniPlayerProps {
    playbackState: any;
    isMusicCardVisible: boolean;
    isPlayingOrPaused: boolean;
}

const MusicMiniPlayerComponent: React.FC<MusicMiniPlayerProps> = ({ playbackState, isMusicCardVisible, isPlayingOrPaused }) => {
    const themeMode = useThemeMode();
    const [showVolume, setShowVolume] = useState(false);
    const { emitCardEvent } = useCardManager();

    if (!isPlayingOrPaused || isMusicCardVisible) return null;

    const handleRestore = () => {
        emitCardEvent({
            type: 'music',
            data: {
                ...playbackState,
                autoplayBlocked: false,
            },
            persistent: true,
        });
    };

    const isDark = themeMode === 'dark';

    const togglePlayback = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (playbackState.playbackState === 'playing') {
            void musicPlaybackService.pause();
        } else {
            void musicPlaybackService.resume();
        }
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        void musicPlaybackService.setVolume(Number(e.target.value));
    };

    const pillBg = isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-black/5 hover:bg-black/10';
    const pillText = isDark ? 'text-white' : 'text-black';
    const pillActive = 'bg-teal-400/20 text-teal-500';

    return (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2">
            {showVolume && (
                <div
                    className={`flex items-center gap-3 px-4 py-2 rounded-2xl backdrop-blur-xl border border-white/10 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300 ${isDark ? 'bg-black/60' : 'bg-white/80'}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <Volume2 size={14} className={isDark ? 'text-white/40' : 'text-black/40'} />
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={playbackState.volume}
                        onChange={handleVolumeChange}
                        className="w-24 h-1 cursor-pointer appearance-none rounded-full bg-teal-400/30 accent-teal-400"
                    />
                </div>
            )}

            <div
                onClick={handleRestore}
                className="relative flex items-center gap-3 px-4 py-2.5 rounded-full overflow-hidden border-none shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all cursor-pointer group"
            >
                <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                    <div
                        className="absolute inset-[-100%] bg-cover bg-center scale-[2] blur-3xl opacity-80 saturate-[2.5] transition-all duration-1000"
                        style={{ backgroundImage: `url(${playbackState.thumbnailUrl})` }}
                    />
                    <div className={`absolute inset-0 transition-colors duration-500 ${isDark ? 'bg-black/30' : 'bg-white/15'}`} />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/10" />
                </div>

                <div
                    className="absolute -inset-8 z-[-1] scale-125 blur-3xl opacity-30 saturate-[2] transition-all duration-1000"
                    style={{ backgroundImage: `url(${playbackState.thumbnailUrl})`, backgroundSize: 'cover' }}
                />

                <div className="relative z-10 flex items-center gap-3 w-full">
                    <div className="flex items-center justify-center ml-1">
                        {playbackState.playbackState === 'playing' ? (
                            <div className="flex gap-1 h-3 items-end">
                                <div className="w-1 bg-teal-400 animate-music-bar-1" />
                                <div className="w-1 bg-teal-400 animate-music-bar-2" />
                                <div className="w-1 bg-teal-400 animate-music-bar-3" />
                            </div>
                        ) : (
                            <Music size={14} className="text-teal-400" />
                        )}
                    </div>

                    <div className="flex flex-col items-start min-w-[120px] max-w-[240px] ml-1 overflow-visible">
                        <span className={`text-[8px] font-black uppercase tracking-widest leading-none mb-1 opacity-60 ${isDark ? 'text-white' : 'text-black'}`}>Now Playing</span>
                        <div className="w-full relative h-4 flex items-center">
                            <span
                                key={playbackState.title}
                                className={`inline-block font-bold whitespace-nowrap origin-left transition-all duration-500 ${pillText} ${playbackState.playbackState === 'playing' ? 'animate-text-breath' : ''}`}
                                style={{
                                    fontSize: (playbackState.title?.length || 0) > 35 ? '7px' :
                                        (playbackState.title?.length || 0) > 25 ? '8.5px' :
                                            (playbackState.title?.length || 0) > 15 ? '10.5px' : '12.5px'
                                }}
                            >
                                {playbackState.title || "Loading..."}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 ml-auto">
                        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg shadow-sm border border-white/10">
                            {playbackState.thumbnailUrl ? (
                                <img src={playbackState.thumbnailUrl} alt="Art" className="h-full w-full object-cover" />
                            ) : (
                                <div className={`flex h-full w-full items-center justify-center ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
                                    <Music size={14} className={isDark ? 'text-white/20' : 'text-black/20'} />
                                </div>
                            )}
                        </div>
                        <button
                            onClick={togglePlayback}
                            className={`h-10 w-10 flex items-center justify-center rounded-full transition-all active:scale-90 shadow-lg ${pillBg} ${pillText}`}
                            aria-label={playbackState.playbackState === 'playing' ? 'Pause' : 'Play'}
                        >
                            {playbackState.playbackState === 'playing' ? (
                                <Pause size={16} fill="currentColor" />
                            ) : (
                                <Play size={16} fill="currentColor" className="translate-x-0.5" />
                            )}
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowVolume(!showVolume); }}
                            className={`h-10 w-10 flex items-center justify-center rounded-full transition-all active:scale-90 shadow-lg ${showVolume ? pillActive : `${pillBg} ${pillText}`}`}
                            title="Volume"
                        >
                            <Volume2 size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const MusicMiniPlayer = React.memo(MusicMiniPlayerComponent);
