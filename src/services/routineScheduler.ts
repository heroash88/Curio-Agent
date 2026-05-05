import { markRoutineRunAt, getRoutines } from '../utils/settingsStorage';
import type { Routine } from './routineTypes';
import type { RoutineContext } from './routineEngine';
import { subscribeBackgroundTick } from './backgroundTicker';

let started = false;
let routineContext: RoutineContext | null = null;

const lastMinuteKeyByRoutine = new Map<string, string>();
// Per-routine throttle for HA state / music triggers so a flapping motion
// sensor doesn't fire the same routine a dozen times in a row.
const lastTriggerAtByRoutine = new Map<string, number>();
const EVENT_TRIGGER_COOLDOWN_MS = 10_000;

let tickUnsubscribe: (() => void) | null = null;

const getMinuteKey = (date: Date): string =>
  [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  ].join('-');

const matchesField = (value: number, field: string): boolean => {
  if (field === '*') return true;

  return field.split(',').some((part) => {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      return Number.isFinite(start) && Number.isFinite(end) && value >= start && value <= end;
    }

    return Number.parseInt(part, 10) === value;
  });
};

const matchesSchedule = (routine: Routine, now: Date): boolean => {
  const schedule = routine.trigger.cron?.trim();
  if (!schedule) return false;

  if (/^\d{2}:\d{2}$/.test(schedule)) {
    const [hour, minute] = schedule.split(':').map(Number);
    if (now.getHours() !== hour || now.getMinutes() !== minute) return false;

    if (routine.trigger.days?.length) {
      return routine.trigger.days.includes(now.getDay());
    }

    return true;
  }

  const parts = schedule.split(/\s+/);
  if (parts.length !== 5) return false;

  return (
    matchesField(now.getMinutes(), parts[0])
    && matchesField(now.getHours(), parts[1])
    && matchesField(now.getDate(), parts[2])
    && matchesField(now.getMonth() + 1, parts[3])
    && matchesField(now.getDay(), parts[4])
  );
};

const shouldRunThisMinute = (routine: Routine, now: Date): boolean => {
  const minuteKey = getMinuteKey(now);
  const lastMinuteKey = lastMinuteKeyByRoutine.get(routine.id);
  if (lastMinuteKey === minuteKey) return false;

  if (routine.lastRunAt) {
    const lastRun = new Date(routine.lastRunAt);
    if (getMinuteKey(lastRun) === minuteKey) {
      lastMinuteKeyByRoutine.set(routine.id, minuteKey);
      return false;
    }
  }

  lastMinuteKeyByRoutine.set(routine.id, minuteKey);
  return true;
};

const shouldRunEventNow = (routineId: string): boolean => {
  const now = Date.now();
  const last = lastTriggerAtByRoutine.get(routineId) || 0;
  if (now - last < EVENT_TRIGGER_COOLDOWN_MS) return false;
  lastTriggerAtByRoutine.set(routineId, now);
  return true;
};

const runRoutine = async (routine: Routine) => {
  if (!routineContext) return;

  markRoutineRunAt(routine.id);
  const { executeRoutine } = await import('./routineEngine');
  await executeRoutine(routine, routineContext);
};

const checkScheduledRoutines = () => {
  if (!routineContext || document.visibilityState === 'hidden') return;

  const now = new Date();
  const routines = getRoutines();

  routines.forEach((routine) => {
    if (!routine.enabled || routine.trigger.type !== 'schedule') return;
    if (!matchesSchedule(routine, now) || !shouldRunThisMinute(routine, now)) return;

    console.log(`[RoutineScheduler] Scheduled routine "${routine.name}".`);
    void runRoutine(routine);
  });
};

const handleSessionEvent = (eventKind: 'session_start' | 'session_end') => {
  if (!routineContext) return;

  getRoutines().forEach((routine) => {
    if (!routine.enabled || routine.trigger.type !== 'event' || routine.trigger.event !== eventKind) return;
    if (!shouldRunEventNow(routine.id)) return;

    console.log(`[RoutineScheduler] Event routine "${routine.name}" -> ${eventKind}.`);
    void runRoutine(routine);
  });
};

const onSessionStarted = () => handleSessionEvent('session_start');
const onSessionEnded = () => handleSessionEvent('session_end');

const handleHaStateChange = (e: Event) => {
  if (!routineContext) return;
  const detail = (e as CustomEvent).detail as { entityId?: string; state?: string } | undefined;
  if (!detail?.entityId) return;

  getRoutines().forEach((routine) => {
    if (!routine.enabled || routine.trigger.type !== 'ha_state') return;
    if (routine.trigger.haEntityId !== detail.entityId) return;
    if (routine.trigger.haState && routine.trigger.haState !== detail.state) return;
    if (!shouldRunEventNow(routine.id)) return;

    console.log(`[RoutineScheduler] HA state "${routine.name}" ${detail.entityId} -> ${detail.state}`);
    void runRoutine(routine);
  });
};

const handleMusicEvent = (e: Event) => {
  if (!routineContext) return;
  const detail = (e as CustomEvent).detail as { event?: string } | undefined;
  if (!detail?.event) return;

  getRoutines().forEach((routine) => {
    if (!routine.enabled || routine.trigger.type !== 'music') return;
    if (routine.trigger.musicEvent !== detail.event) return;
    if (!shouldRunEventNow(routine.id)) return;

    console.log(`[RoutineScheduler] Music routine "${routine.name}" -> ${detail.event}`);
    void runRoutine(routine);
  });
};

const hasSchedulableRoutine = (): boolean =>
  getRoutines().some((r) => r.enabled && r.trigger.type === 'schedule');

const configureTickSubscription = () => {
  if (tickUnsubscribe) {
    tickUnsubscribe();
    tickUnsubscribe = null;
  }

  if (!hasSchedulableRoutine()) return;

  // Scheduled routines support HH:MM precision, so we check every 30s so a
  // cron window at minute X always fires somewhere in X:00-X:30 at worst.
  checkScheduledRoutines();
  tickUnsubscribe = subscribeBackgroundTick(30, checkScheduledRoutines);
};

const onSettingsChanged = () => {
  if (!started) return;
  configureTickSubscription();
};

export function startRoutineScheduler(context: RoutineContext): void {
  routineContext = context;

  if (started) return;
  started = true;

  configureTickSubscription();
  window.addEventListener('curio:session-started', onSessionStarted);
  window.addEventListener('curio:session-ended', onSessionEnded);
  window.addEventListener('curio:ha-state-changed', handleHaStateChange);
  window.addEventListener('curio:music-event', handleMusicEvent);
  window.addEventListener('curio:settings-changed', onSettingsChanged);

  console.log('[RoutineScheduler] Started.');
}

export function stopRoutineScheduler(): void {
  if (tickUnsubscribe) {
    tickUnsubscribe();
    tickUnsubscribe = null;
  }

  window.removeEventListener('curio:session-started', onSessionStarted);
  window.removeEventListener('curio:session-ended', onSessionEnded);
  window.removeEventListener('curio:ha-state-changed', handleHaStateChange);
  window.removeEventListener('curio:music-event', handleMusicEvent);
  window.removeEventListener('curio:settings-changed', onSettingsChanged);
  lastMinuteKeyByRoutine.clear();
  lastTriggerAtByRoutine.clear();
  routineContext = null;
  started = false;

  console.log('[RoutineScheduler] Stopped.');
}
