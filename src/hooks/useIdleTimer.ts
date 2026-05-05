import { useCallback, useEffect, useRef, useState } from 'react';

const IDLE_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'curio:wake'] as const;

export const useIdleTimer = (timeoutSeconds: number, enabled: boolean = true) => {
    const [isIdle, setIsIdle] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const idleRef = useRef(false);

    const clearIdleTimeout = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const scheduleIdleTimeout = useCallback(() => {
        clearIdleTimeout();

        if (!enabled || timeoutSeconds <= 0) {
            idleRef.current = false;
            setIsIdle(false);
            return;
        }

        timeoutRef.current = setTimeout(() => {
            idleRef.current = true;
            setIsIdle(true);
        }, timeoutSeconds * 1000);
    }, [clearIdleTimeout, enabled, timeoutSeconds]);

    const resetIdleTimer = useCallback(() => {
        if (idleRef.current) {
            idleRef.current = false;
            setIsIdle(false);
        }

        scheduleIdleTimeout();
    }, [scheduleIdleTimeout]);

    useEffect(() => {
        if (!enabled || timeoutSeconds <= 0) {
            clearIdleTimeout();
            idleRef.current = false;
            setIsIdle(false);
            return;
        }

        const handleActivity = () => {
            resetIdleTimer();
        };

        IDLE_EVENTS.forEach((eventName) => window.addEventListener(eventName, handleActivity));
        scheduleIdleTimeout();

        return () => {
            clearIdleTimeout();
            IDLE_EVENTS.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
        };
    }, [clearIdleTimeout, enabled, resetIdleTimer, scheduleIdleTimeout, timeoutSeconds]);

    return { isIdle, resetIdleTimer };
};

