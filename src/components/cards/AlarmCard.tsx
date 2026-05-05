import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CardComponentProps, AlarmCardData } from '../../services/cardTypes';
import { getPersistedAlarms, setPersistedAlarms, usePersistedAlarms } from '../../utils/settingsStorage';
import { useCardTheme } from '../../hooks/useCardTheme';
import { randomId } from '../../utils/randomId';

const SNOOZE_MINUTES = 5;

const AlarmCard: React.FC<CardComponentProps> = ({ card, onDismiss, onInteractionStart, onInteractionEnd }) => {
  const t = useCardTheme();
  const data = card.data as unknown as AlarmCardData;
  const isRinging = data.mode === 'ringing';

  // For list mode, always read live from persistence so deletes/toggles reflect immediately
  const persistedAlarms = usePersistedAlarms();
  const alarms = isRinging ? (data.alarms || []) : persistedAlarms.map(a => ({
    id: a.id,
    label: a.label,
    time: a.time,
    enabled: a.enabled,
    days: a.days,
  }));
  const [currentTime, setCurrentTime] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  // Update clock every second when ringing
  useEffect(() => {
    if (!isRinging) return;
    const id = window.setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [isRinging]);

  const handleStop = useCallback(() => {
    import('../../services/alarmChecker').then(({ stopAlarmRing }) => stopAlarmRing());
    onDismiss();
  }, [onDismiss]);

  const handleSnooze = useCallback(() => {
    import('../../services/alarmChecker').then(({ stopAlarmRing }) => stopAlarmRing());
    // Snooze: create a temporary one-shot alarm N minutes from now
    const snoozeTime = new Date(Date.now() + SNOOZE_MINUTES * 60_000);
    const hh = snoozeTime.getHours().toString().padStart(2, '0');
    const mm = snoozeTime.getMinutes().toString().padStart(2, '0');
    const persisted = getPersistedAlarms();
    const ringing = alarms.find(a => a.id === data.ringingAlarmId);
    persisted.push({
      id: randomId(),
      label: `${ringing?.label || 'Alarm'} (Snooze)`,
      time: `${hh}:${mm}`,
      enabled: true,
    });
    setPersistedAlarms(persisted);
    onDismiss();
  }, [alarms, data.ringingAlarmId, onDismiss]);

  const toggleAlarm = useCallback((alarmId: string) => {
    onInteractionStart();
    const persisted = getPersistedAlarms();
    setPersistedAlarms(persisted.map(a => a.id === alarmId ? { ...a, enabled: !a.enabled } : a));
    setTimeout(onInteractionEnd, 300);
  }, [onInteractionStart, onInteractionEnd]);

  const deleteAlarm = useCallback((alarmId: string) => {
    onInteractionStart();
    const remaining = getPersistedAlarms().filter(a => a.id !== alarmId);
    setPersistedAlarms(remaining);
    if (remaining.length === 0) {
      // No alarms left, dismiss the card
      setTimeout(() => onDismiss(), 300);
    }
    setTimeout(onInteractionEnd, 300);
  }, [onInteractionStart, onInteractionEnd, onDismiss]);

  // ── Ringing: fullscreen portal ──
  if (isRinging) {
    const ringing = alarms.find(a => a.id === data.ringingAlarmId) || alarms[0];
    return createPortal(
      <div className="fixed inset-0 z-[400] flex flex-col items-center justify-center bg-black/95 backdrop-blur-xl text-white">
        {/* Animated background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-rose-500/10 animate-pulse" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-rose-500/5 animate-ping" style={{ animationDuration: '2s' }} />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-6 px-8">
          {/* Clock icon */}
          <div className="relative">
            <div className="absolute inset-[-12px] rounded-full bg-rose-500/20 animate-ping" style={{ animationDuration: '1.5s' }} />
            <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-rose-500/15 border-2 border-rose-500/30">
              <span className="text-6xl" style={{ animation: 'bounce 0.5s ease-in-out infinite alternate' }}>⏰</span>
            </div>
          </div>

          {/* Current time */}
          <p className="text-6xl font-bold tabular-nums tracking-tight">{currentTime}</p>

          {/* Alarm label */}
          <div className="text-center">
            <p className="text-2xl font-bold text-white/90">{ringing?.label || 'Alarm'}</p>
            <p className={`text-base ${t.faint} mt-1`}>Set for {ringing?.time}</p>
          </div>

          {/* Buttons */}
          <div className="flex gap-4 mt-8 w-full max-w-xs">
            <button
              onClick={handleSnooze}
              className={`flex-1 rounded-2xl ${t.btn} border ${t.panelBorder} px-6 py-4 text-base font-bold backdrop-blur-md transition-all active:scale-95`}
            >
              😴 Snooze
              <p className={`text-[10px] font-normal ${t.faint} mt-0.5`}>{SNOOZE_MINUTES} min</p>
            </button>
            <button
              onClick={handleStop}
              className="flex-1 rounded-2xl bg-rose-500 px-6 py-4 text-base font-bold shadow-lg shadow-rose-500/30 transition-all hover:bg-rose-400 active:scale-95"
            >
              ✋ Stop
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // ── List view ──
  return (
    <div className="card-glass overflow-hidden">
      <div className="bg-amber-500/10 px-5 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/20 border border-amber-500/25">
            <span className="text-xl">⏰</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold font-headline">My Alarms</p>
            <p className={`text-[10px] font-medium ${t.faint}`}>
              {alarms.filter(a => a.enabled).length} active · {alarms.length} total
            </p>
          </div>
        </div>
      </div>
      <div className="px-4 py-3">
        {alarms.length === 0 ? (
          <p className={`text-sm ${t.faint} italic text-center py-6`}>No alarms set</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {alarms.map((alarm) => (
              <div key={alarm.id} className={`flex items-center gap-3 rounded-2xl p-3.5 transition-all ${alarm.enabled ? t.panel : `${t.panel} opacity-50`}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-xl font-bold font-headline tabular-nums leading-tight">{alarm.time}</p>
                  <p className={`text-[11px] font-medium ${t.faint} truncate mt-0.5`}>
                    {alarm.label}{alarm.days?.length ? ` · ${alarm.days.join(', ')}` : ''}
                  </p>
                </div>
                <button onClick={() => toggleAlarm(alarm.id)} className={`relative h-7 w-12 shrink-0 rounded-full transition-all duration-300 ${alarm.enabled ? 'bg-[#00B2FF]' : t.btn}`} aria-label={alarm.enabled ? 'Disable' : 'Enable'}>
                  <div className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-all duration-300 ${alarm.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
                <button onClick={() => deleteAlarm(alarm.id)} className={`flex h-8 w-8 items-center justify-center rounded-full ${t.panel} ${t.faint} hover:bg-rose-500/20 hover:text-rose-400 transition-all active:scale-90`} aria-label="Delete alarm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AlarmCard;
