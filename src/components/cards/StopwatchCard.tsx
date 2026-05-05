import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { CardComponentProps, StopwatchCardData } from '../../services/cardTypes';
import { useTimerTick } from '../../hooks/useTimerTick';
import { useCardTheme } from '../../hooks/useCardTheme';

const DESIGN_TOKEN = 'card-glass';

/** Format elapsed milliseconds as MM:SS or H:MM:SS */
export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const StopwatchCard: React.FC<CardComponentProps> = ({ card, onDismiss }) => {
  const t = useCardTheme();
  const data = card.data as unknown as StopwatchCardData;
  const subscribe = useTimerTick();

  // Internal state
  const [running, setRunning] = useState(data.running);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef(data.startTime || Date.now());
  const pausedElapsedRef = useRef(data.pausedElapsed || 0);
  const runningRef = useRef(data.running);

  // Subscribe to tick
  useEffect(() => {
    const unsubscribe = subscribe((now: number) => {
      if (runningRef.current) {
        setElapsed(now - startTimeRef.current + pausedElapsedRef.current);
      }
    });
    return unsubscribe;
  }, [subscribe]);

  const handlePauseResume = useCallback(() => {
    if (runningRef.current) {
      // Pause
      const now = Date.now();
      pausedElapsedRef.current = now - startTimeRef.current + pausedElapsedRef.current;
      runningRef.current = false;
      setRunning(false);
      setElapsed(pausedElapsedRef.current);
    } else {
      // Resume
      startTimeRef.current = Date.now();
      runningRef.current = true;
      setRunning(true);
    }
  }, []);

  const handleReset = useCallback(() => {
    runningRef.current = false;
    startTimeRef.current = Date.now();
    pausedElapsedRef.current = 0;
    setRunning(false);
    setElapsed(0);
  }, []);

  return (
    <div className={DESIGN_TOKEN}>
      <div className="flex items-center gap-5">
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${t.muted} font-headline`}>⏱️ Stopwatch</p>
          <p className="text-4xl font-mono font-bold font-headline mt-1">
            {formatElapsed(elapsed)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePauseResume}
            className={`px-4 py-2 rounded-full ${t.btn} ${t.text} text-sm font-medium active:scale-95 transition-all`}
          >
            {running ? 'Pause' : 'Resume'}
          </button>
          <button
            onClick={handleReset}
            className={`px-4 py-2 rounded-full ${t.btn} ${t.btnText} text-sm font-medium active:scale-95 transition-all`}
          >
            Reset
          </button>
          <button
            onClick={onDismiss}
            className={`px-4 py-2 rounded-full bg-red-500/30 ${t.text} text-sm font-medium hover:bg-red-500/50 active:scale-95 transition-all`}
          >
            Stop
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(StopwatchCard);
