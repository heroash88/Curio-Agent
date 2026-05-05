import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSubtitlesInput {
    isConnected: boolean;
    isSpeaking: boolean;
    userTranscript: string | null;
    modelTranscript: string | null;
    subtitlesEnabled: boolean;
    turnKey?: number;
    inactiveHideDelayMs?: number;
}

interface UseSubtitlesResult {
    showTranscript: boolean;
    latchedUser: string | null;
    latchedModel: string | null;
}

/**
 * Manages subtitle display: latches transcripts and keeps them visible until
 * the current chat/session is dismissed, disabled, disconnected, or a new user
 * turn starts.
 */
export const useSubtitles = ({
    isConnected,
    userTranscript,
    modelTranscript,
    subtitlesEnabled,
    turnKey = 0,
    inactiveHideDelayMs = 0,
}: UseSubtitlesInput): UseSubtitlesResult => {
    const [showTranscript, setShowTranscript] = useState(false);
    const [latchedUser, setLatchedUser] = useState<string | null>(null);
    const [latchedModel, setLatchedModel] = useState<string | null>(null);
    const latchedUserRef = useRef<string | null>(null);
    const latchedModelRef = useRef<string | null>(null);
    const lastTurnKeyRef = useRef(turnKey);
    const inactiveHideTimerRef = useRef<number | null>(null);

    // Track the last value we dismissed so we don't re-latch the same stale value.
    // This prevents the "zombie subtitle" bug where a stale offlineUserTranscript
    // keeps re-appearing after the auto-hide timer clears it.
    const dismissedUserRef = useRef<string | null>(null);
    const dismissedModelRef = useRef<string | null>(null);

    const resetAll = useCallback(() => {
        // Remember what we dismissed so we don't re-latch the same values
        dismissedUserRef.current = latchedUserRef.current;
        dismissedModelRef.current = latchedModelRef.current;
        latchedUserRef.current = null;
        latchedModelRef.current = null;
        setLatchedUser(null);
        setLatchedModel(null);
        setShowTranscript(false);
    }, []);

    const clearInactiveHideTimer = useCallback(() => {
        if (inactiveHideTimerRef.current !== null) {
            window.clearTimeout(inactiveHideTimerRef.current);
            inactiveHideTimerRef.current = null;
        }
    }, []);

    useEffect(() => clearInactiveHideTimer, [clearInactiveHideTimer]);

    // Latch: keep the latest non-null transcript, but skip if it's the same
    // value we already dismissed (prevents stale re-latching).
    useEffect(() => {
        if (turnKey !== lastTurnKeyRef.current) {
            lastTurnKeyRef.current = turnKey;
            latchedModelRef.current = null;
            dismissedModelRef.current = null;
            setLatchedModel(null);
        }

        if (userTranscript && userTranscript !== latchedUserRef.current) {
            if (userTranscript !== dismissedUserRef.current) {
                latchedUserRef.current = userTranscript;
                setLatchedUser(userTranscript);
                // New user input clears the dismissed tracking
                dismissedUserRef.current = null;
                dismissedModelRef.current = null;
            }
        }
        if (modelTranscript && modelTranscript !== latchedModelRef.current) {
            if (modelTranscript !== dismissedModelRef.current) {
                latchedModelRef.current = modelTranscript;
                setLatchedModel(modelTranscript);
                dismissedModelRef.current = null;
            }
        }
    }, [userTranscript, modelTranscript, turnKey]);

    // Show/hide logic
    useEffect(() => {
        if (!subtitlesEnabled) {
            clearInactiveHideTimer();
            resetAll();
            dismissedUserRef.current = null;
            dismissedModelRef.current = null;
            return;
        }

        const liveUser = userTranscript && userTranscript !== dismissedUserRef.current ? userTranscript : null;
        const liveModel = modelTranscript && modelTranscript !== dismissedModelRef.current ? modelTranscript : null;
        const hasLive = !!(liveUser || liveModel);
        const hasLatched = !!(latchedUserRef.current || latchedModelRef.current);

        if (!isConnected) {
            clearInactiveHideTimer();
            if (inactiveHideDelayMs > 0 && (hasLive || hasLatched)) {
                setShowTranscript(true);
                inactiveHideTimerRef.current = window.setTimeout(() => {
                    inactiveHideTimerRef.current = null;
                    resetAll();
                    dismissedUserRef.current = null;
                    dismissedModelRef.current = null;
                }, inactiveHideDelayMs);
                return;
            }

            resetAll();
            dismissedUserRef.current = null;
            dismissedModelRef.current = null;
            return;
        }

        clearInactiveHideTimer();

        // Check if we have content worth showing.
        // Ignore live values that match what we already dismissed.
        if (!hasLive && !hasLatched) { setShowTranscript(false); return; }
        setShowTranscript(true);
    }, [clearInactiveHideTimer, inactiveHideDelayMs, userTranscript, modelTranscript, subtitlesEnabled, isConnected, resetAll]);

    return { showTranscript, latchedUser, latchedModel };
};
