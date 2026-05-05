import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { CardComponentProps, TimerCardData, PersistedTimer } from '../../services/cardTypes';
import { useTimerTick } from '../../hooks/useTimerTick';
import { persistTimers, restoreTimers, clearPersistedTimers } from '../../services/timerPersistence';
import { getSharedAudioContext } from '../../services/audioContext';
import { useCardTheme } from '../../hooks/useCardTheme';

const SVG_SIZE = 100;
const STROKE_WIDTH = 7;
const RADIUS = (SVG_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const RING_BURST_MS = 15_000;
const RING_REST_MS = 10_000;

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const TimerCard: React.FC<CardComponentProps> = ({ card, onDismiss }) => {
  const t = useCardTheme();
  const data = card.data as unknown as TimerCardData;
  const subscribe = useTimerTick();
  const timerStorageId = data.timerId || card.id;

  const [remaining, setRemaining] = useState(() =>
    Math.max(0, data.targetTime - Date.now()),
  );
  const [completed, setCompleted] = useState(data.completionState === 'completed');
  const completedRef = useRef(completed);
  const ringIntervalRef = useRef<number | null>(null);
  const ringStopTimeoutRef = useRef<number | null>(null);
  const ringRestartTimeoutRef = useRef<number | null>(null);
  const activeOscillatorsRef = useRef<OscillatorNode[]>([]);

  const stopRinging = useCallback(() => {
    if (ringIntervalRef.current !== null) {
      window.clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    if (ringStopTimeoutRef.current !== null) {
      window.clearTimeout(ringStopTimeoutRef.current);
      ringStopTimeoutRef.current = null;
    }
    if (ringRestartTimeoutRef.current !== null) {
      window.clearTimeout(ringRestartTimeoutRef.current);
      ringRestartTimeoutRef.current = null;
    }
    activeOscillatorsRef.current.forEach((osc) => {
      try {
        osc.stop();
      } catch {
        // Oscillator may already have stopped.
      }
    });
    activeOscillatorsRef.current = [];
  }, []);

  const playRingPulse = useCallback(() => {
    try {
      const audioCtx = getSharedAudioContext(true);
      if (audioCtx.state === 'suspended') {
        void audioCtx.resume();
      }
      const now = audioCtx.currentTime;
      const tones = data.isAlarm
        ? [
            { freq: 880, offset: 0, duration: 0.16 },
            { freq: 1175, offset: 0.17, duration: 0.16 },
          ]
        : [
            { freq: 659, offset: 0, duration: 0.18 },
            { freq: 880, offset: 0.2, duration: 0.22 },
          ];

      tones.forEach(({ freq, offset, duration }) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const startTime = now + offset;
        const endTime = startTime + duration;
        osc.type = data.isAlarm ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(data.isAlarm ? 0.24 : 0.16, startTime + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.onended = () => {
          activeOscillatorsRef.current = activeOscillatorsRef.current.filter(
            (activeOscillator) => activeOscillator !== osc,
          );
        };
        activeOscillatorsRef.current.push(osc);
        osc.start(startTime);
        osc.stop(endTime + 0.01);
      });
    } catch (e) {
      console.warn('[TimerCard] Failed to play completion sound:', e);
    }
  }, [data.isAlarm]);

  const startRingingUntilStopped = useCallback(() => {
    stopRinging();

    const startBurst = () => {
      if (!completedRef.current) return;
      playRingPulse();
      ringIntervalRef.current = window.setInterval(
        playRingPulse,
        data.isAlarm ? 640 : 880,
      );
      ringStopTimeoutRef.current = window.setTimeout(() => {
        if (ringIntervalRef.current !== null) {
          window.clearInterval(ringIntervalRef.current);
          ringIntervalRef.current = null;
        }
        if (!completedRef.current) return;
        ringRestartTimeoutRef.current = window.setTimeout(
          startBurst,
          RING_REST_MS,
        );
      }, RING_BURST_MS);
    };

    startBurst();
  }, [data.isAlarm, playRingPulse, stopRinging]);

  // Persist on create
  useEffect(() => {
      const timer: PersistedTimer = {
      id: timerStorageId,
      label: data.label,
      isAlarm: data.isAlarm,
      targetTime: data.targetTime,
      duration: data.duration,
      createdAt: card.createdAt,
    };
    const existing = restoreTimers();
    if (!existing.find((t) => t.id === timerStorageId)) {
      persistTimers([...existing, timer]);
    }
  }, [card.createdAt, data.label, data.isAlarm, data.targetTime, data.duration, timerStorageId]);

  // Subscribe to tick
  useEffect(() => {
    const unsubscribe = subscribe((now: number) => {
      const rem = Math.max(0, data.targetTime - now);
      setRemaining(rem);
      if (rem <= 0 && !completedRef.current) {
        completedRef.current = true;
        setCompleted(true);
      }
    });
    return unsubscribe;
  }, [subscribe, data.targetTime]);

  // On completion: keep ringing in 15s bursts until the user stops it.
  useEffect(() => {
    if (!completed) return;
    // Remove from persisted timers
    const existing = restoreTimers({ includeExpired: true }).filter((t) => t.id !== timerStorageId);
    if (existing.length > 0) {
      persistTimers(existing);
    } else {
      clearPersistedTimers();
    }
    startRingingUntilStopped();
    return stopRinging;
  }, [completed, timerStorageId, startRingingUntilStopped, stopRinging]);

  const handleStop = useCallback(() => {
    completedRef.current = false;
    stopRinging();
    // Remove from persistence on dismiss
    const existing = restoreTimers({ includeExpired: true }).filter((t) => t.id !== timerStorageId);
    if (existing.length > 0) {
      persistTimers(existing);
    } else {
      clearPersistedTimers();
    }
    onDismiss();
  }, [timerStorageId, onDismiss, stopRinging]);

  // Progress: 1 = full, 0 = empty
  const progress = data.duration > 0 ? Math.max(0, remaining / data.duration) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <div
      className={`card-glass ${
        completed ? 'animate-pulse' : ''
      }`}
    >
      <div className="flex items-center gap-5">
        {/* Circular progress */}
        <svg
          width={SVG_SIZE}
          height={SVG_SIZE}
          className="shrink-0 -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={SVG_SIZE / 2}
            cy={SVG_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={t.dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}
            strokeWidth={STROKE_WIDTH}
          />
          <circle
            cx={SVG_SIZE / 2}
            cy={SVG_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={t.dark ? 'white' : '#334155'}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.3s linear' }}
          />
        </svg>

        <div className="flex-1 min-w-0">
          {data.label && (
            <p className={`text-sm ${t.muted} truncate`}>{data.label}</p>
          )}
          <p className="text-4xl font-mono font-bold font-headline">
            {completed ? '0:00' : formatTime(remaining)}
          </p>
          <p className={`text-sm ${t.muted} mt-1`}>
            {data.isAlarm ? '⏰ Alarm' : '⏱️ Timer'}
          </p>
        </div>

        {completed ? (
          <button
            onClick={handleStop}
            className={`px-5 py-3 rounded-full bg-red-500/30 ${t.text} text-base font-semibold hover:bg-red-500/50 active:scale-95 transition-all`}
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleStop}
            className={`px-4 py-2 rounded-full ${t.btn} ${t.btnText} text-sm font-medium active:scale-95 transition-all`}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};

export default React.memo(TimerCard);
