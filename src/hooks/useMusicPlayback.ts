import { useCallback, useEffect, useRef, useState } from 'react';
import { musicPlaybackService } from '../services/musicPlaybackService';
import type { Card } from '../services/cardTypes';

interface UseMusicPlaybackInput {
    isConnected: boolean;
    isConnecting: boolean;
    cards: Card[];
}

interface UseMusicPlaybackResult {
    playbackState: ReturnType<typeof musicPlaybackService.getState>;
    isMusicCardVisible: boolean;
    isPlayingOrPaused: boolean;
    isMiniPlayerActive: boolean;
    /**
     * Call before connecting to Live API to track whether music was playing.
     * Returns true if music was playing and should be resumed after disconnect.
     */
    markMusicStateBeforeConnect: () => boolean;
    /** Pause music playback (e.g. before connecting). */
    pauseMusic: () => void;
}

/**
 * Extracted music playback state management from CurioAgentMode.
 *
 * Manages:
 * - Subscribing to musicPlaybackService state changes
 * - Derived booleans (isMusicCardVisible, isPlayingOrPaused, isMiniPlayerActive)
 * - Auto-resume music after Live API disconnect if it was playing before connect
 */
export const useMusicPlayback = ({
    isConnected,
    isConnecting,
    cards,
}: UseMusicPlaybackInput): UseMusicPlaybackResult => {
    const [playbackState, setPlaybackState] = useState(() => musicPlaybackService.getState());
    const wasMusicPlayingBeforeSessionRef = useRef(false);

    useEffect(() => {
        const unsubscribe = musicPlaybackService.subscribe((state) => {
            setPlaybackState(state);
        });
        return unsubscribe;
    }, []);

    const isMusicCardVisible = cards.some((c) => c.type === 'music');
    const isPlayingOrPaused = playbackState.playbackState === 'playing' || playbackState.playbackState === 'paused';
    const isMiniPlayerActive = isPlayingOrPaused && !isMusicCardVisible;

    // Track wake event for pre-connection music state
    useEffect(() => {
        const handleWake = (e: any) => {
            if (e.detail?.wasPlaying) {
                wasMusicPlayingBeforeSessionRef.current = true;
            }
        };
        window.addEventListener('curio:wake', handleWake);
        return () => window.removeEventListener('curio:wake', handleWake);
    }, []);

    // Auto-resume music after disconnect
    useEffect(() => {
        if (!isConnected && !isConnecting && wasMusicPlayingBeforeSessionRef.current) {
            const stillHasMusicCard = cards.some(c => c.type === 'music');
            if (stillHasMusicCard) {
                console.log('[useMusicPlayback] Session ended. Resuming previous music playback.');
                void musicPlaybackService.resume();
            }
            wasMusicPlayingBeforeSessionRef.current = false;
        }
    }, [isConnected, isConnecting, cards]);

    const markMusicStateBeforeConnect = useCallback((): boolean => {
        if (playbackState.playbackState === 'playing') {
            wasMusicPlayingBeforeSessionRef.current = true;
            return true;
        }
        return false;
    }, [playbackState.playbackState]);

    const pauseMusic = useCallback(() => {
        void musicPlaybackService.pause();
    }, []);

    return {
        playbackState,
        isMusicCardVisible,
        isPlayingOrPaused,
        isMiniPlayerActive,
        markMusicStateBeforeConnect,
        pauseMusic,
    };
};
