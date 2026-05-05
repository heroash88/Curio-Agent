import { createContext, useContext, useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import React from 'react';

type TickCallback = (now: number) => void;
const TICK_INTERVAL_MS = 250;

interface TimerTickContextValue {
  subscribe: (callback: TickCallback) => () => void;
}

const TimerTickContext = createContext<TimerTickContextValue | undefined>(undefined);

export const TimerTickProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const subscribersRef = useRef<Set<TickCallback>>(new Set());
  const intervalIdRef = useRef<number | null>(null);

  const tick = useCallback(() => {
    if (subscribersRef.current.size === 0) {
      if (intervalIdRef.current !== null) {
        window.clearInterval(intervalIdRef.current);
      }
      intervalIdRef.current = null;
      return;
    }
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    const now = Date.now();
    subscribersRef.current.forEach((cb) => {
      try {
        cb(now);
      } catch {
        // Ignore errors from individual subscribers
      }
    });
  }, []);

  const subscribe = useCallback(
    (callback: TickCallback): (() => void) => {
      subscribersRef.current.add(callback);
      callback(Date.now());
      if (subscribersRef.current.size === 1 && intervalIdRef.current === null) {
        intervalIdRef.current = window.setInterval(tick, TICK_INTERVAL_MS);
      }
      return () => {
        subscribersRef.current.delete(callback);
        if (subscribersRef.current.size === 0 && intervalIdRef.current !== null) {
          window.clearInterval(intervalIdRef.current);
          intervalIdRef.current = null;
        }
      };
    },
    [tick],
  );

  // Cleanup on unmount
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (intervalIdRef.current !== null) {
        window.clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      subscribersRef.current.clear();
    };
  }, []);

  const value = React.useMemo(() => ({ subscribe }), [subscribe]);

  return React.createElement(TimerTickContext.Provider, { value }, children);
};

export const useTimerTick = (): ((callback: TickCallback) => () => void) => {
  const ctx = useContext(TimerTickContext);
  if (!ctx) {
    throw new Error('useTimerTick must be used within a TimerTickProvider');
  }
  return ctx.subscribe;
};

export const useOptionalTimerTick = (): (((callback: TickCallback) => () => void) | null) => {
  const ctx = useContext(TimerTickContext);
  return ctx?.subscribe ?? null;
};
