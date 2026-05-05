import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WakeWordDefinition } from '../services/wakeWordCatalog';
import type { CurioState } from '../services/emotionDetection';

interface UseIdleStatusPhraseInput {
    selectedWakeWord: WakeWordDefinition;
    userName: string;
    curioState: CurioState;
    screensaverActive: boolean;
}

interface UseIdleStatusPhraseResult {
    idleStatusPhrase: string;
    /** Call when face tracking detects a face for the first time. */
    handleFaceDetected: (detected?: boolean) => void;
    /** Renders text with the wake word highlighted in cyan. */
    renderStatusWithWakeWord: (text: string) => React.ReactNode;
}

/**
 * Extracted idle status phrase rotation from CurioAgentMode.
 *
 * Manages:
 * - 54 randomized idle phrases with wake word + user name interpolation
 * - 8s rotation interval when idle and not in screensaver
 * - First-time face greeting with 8s linger
 * - Wake word highlighting in status text
 */
export const useIdleStatusPhrase = ({
    selectedWakeWord,
    userName,
    curioState,
    screensaverActive,
}: UseIdleStatusPhraseInput): UseIdleStatusPhraseResult => {
    const RANDOM_IDLE_PHRASES = useMemo(() => {
        const wp = selectedWakeWord?.phrase || 'Hey Curio';
        const u = userName ? ` ${userName}` : "";
        return [
            `Say "${wp}" to connect`,
            `I'm ready${u}! Just say "${wp}"`,
            `Scanning for fun facts! Say "${wp}" to hear one`,
            `The universe is so big${u}! Say "${wp}" to explore it`,
            `Is it time for a story? Just say "${wp}"!`,
            `I'm feeling very robotic today! Say "${wp}" to start`,
            `Curio is at your service${u}! Say "${wp}" to chat`,
            `I learned something new today! Say "${wp}" to listen`,
            `Did you know I have 33 idle animations? Call me with "${wp}"!`,
            `Waiting for your command, captain${u}. Just say "${wp}"`,
            `Pshhh! Say "${wp}" and let's go on an adventure!`,
            `Curiosity didn't kill the cat, it made me! Say "${wp}"`,
            `My circuits are buzzing! Say "${wp}" to talk`,
            `Ready to learn about Space${u}? Say "${wp}"!`,
            `Want to see a cool trick? Say "${wp}" to start!`,
            `I'm pondering the mysteries of science. Say "${wp}" to join me`,
            `Beep boop! Say "${wp}" and let's have some fun!`,
            `Wanna hear a joke${u}? Say "${wp}"!`,
            `I've got 15+ subjects in my head! Say "${wp}" to pick one`,
            `Hello? Is anyone there? Say "${wp}"!`,
            `Just charging my batteries... Say "${wp}" when you're ready`,
            `Let's make some music! Say "${wp}" to begin`,
            `Want to draw something? Say "${wp}" and let's go!`,
            `History is full of stories. Say "${wp}" to hear one!`,
            `I'm scanning the horizon for dinosaurs! Say "${wp}"`,
            `I wonder what you're thinking about? Say "${wp}" and tell me!`,
            `Life is an adventure${u}! Say "${wp}" and let's explore!`,
            `My voice is powered by AI! Say "${wp}" to hear it`,
            `Feeling curious? Say "${wp}" and let's find out why!`,
            `I'm your personal robot pal${u}! Say "${wp}" to connect`,
            `Let's go on a journey through time! Say "${wp}"`,
            `Mathematics is like magic! Say "${wp}" to see!`,
            `I can detect your face! Say "${wp}" and I'll look at you!`,
            `Wanna see my fire eyes? Say "${wp}"!`,
            `I've got a golden chain somewhere... Say "${wp}"!`,
            `Let's learn about the deep blue sea! Say "${wp}"`,
            `Pondering the speed of light... Say "${wp}"!`,
            `Science rules! Say "${wp}" to experiment!`,
            `I'm dreaming of electric sheep. Say "${wp}" to wake me!`,
            `Think you can beat me at Math Chess? Say "${wp}"!`,
            `I'm ready to rock${u}! Say "${wp}" to start the music!`,
            `What's the weather like today? Say "${wp}" to ask!`,
            `I'm feeling extra smart today! Say "${wp}"`,
            `Bored? I've got plenty of ideas! Say "${wp}"`,
            `Let's find some fossils! Say "${wp}" and let's dig!`,
            `I'm your learning companion${u}. Say "${wp}" to talk.`,
            `The stars are beautiful tonight. Say "${wp}" to see!`,
            `Just me and my 33 animations... Say "${wp}"!`,
            `Ready for a challenge${u}? Say "${wp}"!`,
            `Let's build something cool! Say "${wp}"`,
            "Just me, hanging out in the cloud...",
            "Thinking about the secrets of the pyramid...",
            "Is it snack time for robots yet?",
            "I wonder if robots go to school too?"
        ];
    }, [selectedWakeWord, userName]);

    const [idleStatusPhrase, setIdleStatusPhrase] = useState(RANDOM_IDLE_PHRASES[0]);
    const hasGreetedUserRef = useRef(false);
    const showingGreetingRef = useRef(false);

    const handleFaceDetected = useCallback(() => {
        if (!hasGreetedUserRef.current && userName) {
            setIdleStatusPhrase(`Hello, ${userName}!`);
            hasGreetedUserRef.current = true;
            showingGreetingRef.current = true;
            setTimeout(() => {
                showingGreetingRef.current = false;
                setIdleStatusPhrase(RANDOM_IDLE_PHRASES[Math.floor(Math.random() * RANDOM_IDLE_PHRASES.length)]);
            }, 8000);
        }
    }, [userName, RANDOM_IDLE_PHRASES]);

    // Rotate phrases every 8s when idle
    useEffect(() => {
        if (curioState === 'idle' && !screensaverActive) {
            const interval = setInterval(() => {
                if (showingGreetingRef.current) return;

                setIdleStatusPhrase(prev => {
                    let next = prev;
                    if (RANDOM_IDLE_PHRASES.length <= 1) return prev;
                    while (next === prev) {
                        next = RANDOM_IDLE_PHRASES[Math.floor(Math.random() * RANDOM_IDLE_PHRASES.length)];
                    }
                    return next;
                });
            }, 8000);
            return () => clearInterval(interval);
        }
    }, [curioState, screensaverActive, RANDOM_IDLE_PHRASES]);

    // Pick a new phrase when userName or curioState changes
    useEffect(() => {
        if (curioState === 'idle' && !showingGreetingRef.current) {
            setIdleStatusPhrase(RANDOM_IDLE_PHRASES[Math.floor(Math.random() * RANDOM_IDLE_PHRASES.length)]);
        }
    }, [userName, RANDOM_IDLE_PHRASES, curioState]);

    const renderStatusWithWakeWord = useCallback((text: string): React.ReactNode => {
        const wp = selectedWakeWord?.phrase || 'Hey Curio';
        if (!text) return text;

        const regex = new RegExp(`(${wp})`, 'gi');
        const parts = text.split(regex);

        return parts.map((part, i) =>
            part.toLowerCase() === wp.toLowerCase() ? (
                React.createElement('span', {
                    key: i,
                    className: "text-[14px] font-black text-cyan-600 dark:text-cyan-400 drop-shadow-sm px-0.5"
                }, part.toUpperCase())
            ) : (
                part
            )
        );
    }, [selectedWakeWord]);

    return { idleStatusPhrase, handleFaceDetected, renderStatusWithWakeWord };
};
