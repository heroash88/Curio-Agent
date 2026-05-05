import { getPersistedAlarms } from '../utils/settingsStorage';
import { getSharedAudioContext } from './audioContext';
import { subscribeBackgroundTick } from './backgroundTicker';

let unsubscribe: (() => void) | null = null;
let ringingAlarmId: string | null = null;
let ringSources: OscillatorNode[] = [];
let ringingTimeoutId: ReturnType<typeof setTimeout> | null = null;

/** Play an alarm ring sound using oscillators -- repeating chime pattern */
function playAlarmRing() {
  stopAlarmRing();
  try {
    const ctx = getSharedAudioContext(false);
    if (ctx.state === 'suspended') ctx.resume();

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(ctx.destination);

    // Repeating chime: play 3 notes, pause, repeat.
    const freqs = [880, 1108.73, 1318.51]; // A5, C#6, E6
    let t = ctx.currentTime;

    for (let rep = 0; rep < 8; rep++) {
      for (const freq of freqs) {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.4, t + 0.02);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.connect(env);
        env.connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.3);
        ringSources.push(osc);
        t += 0.15;
      }
      t += 0.5; // pause between chime groups
    }
  } catch (e) {
    console.warn('[AlarmChecker] Failed to play alarm sound:', e);
  }
}

/** Stop the alarm ring sound */
export function stopAlarmRing() {
  for (const osc of ringSources) {
    try { osc.stop(); osc.disconnect(); } catch {}
  }
  ringSources = [];
}

type AlarmCallback = (alarmId: string, label: string, time: string) => void;

let onAlarmFired: AlarmCallback | null = null;

/** Register a callback for when an alarm fires */
export function setAlarmCallback(cb: AlarmCallback | null) {
  onAlarmFired = cb;
}

/** Check if any alarm should fire right now */
function checkAlarms() {
  // Visibility gate -- no sense firing background alarms that can't be heard
  // on a hidden tab anyway, and most browsers will throttle us regardless.
  if (document.visibilityState === 'hidden') return;

  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const currentDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];

  const alarms = getPersistedAlarms();
  for (const alarm of alarms) {
    if (!alarm.enabled) continue;
    if (alarm.time !== currentTime) continue;

    if (alarm.days && alarm.days.length > 0 && !alarm.days.includes(currentDay)) continue;

    // Don't re-fire the same alarm within the same minute.
    if (ringingAlarmId === alarm.id) continue;

    console.log(`[AlarmChecker] Alarm fired: ${alarm.label} at ${alarm.time}`);
    ringingAlarmId = alarm.id;
    playAlarmRing();
    onAlarmFired?.(alarm.id, alarm.label, alarm.time);

    // Clear ringing state after 2 minutes so it can fire again tomorrow.
    ringingTimeoutId = setTimeout(() => {
      if (ringingAlarmId === alarm.id) ringingAlarmId = null;
      ringingTimeoutId = null;
    }, 120_000);
    return; // Only fire one alarm at a time.
  }
}

/** Start the alarm checker (call once on app mount) */
export function startAlarmChecker() {
  if (unsubscribe !== null) return;
  checkAlarms(); // Check immediately so alarms set for the current minute still fire.
  // Share the 15s bucket with the rest of the proactive stack so we do not
  // wake the CPU separately -- HH:MM precision is good enough for alarms.
  unsubscribe = subscribeBackgroundTick(15, checkAlarms);
  console.log('[AlarmChecker] Started (shared ticker)');
}

/** Stop the alarm checker */
export function stopAlarmChecker() {
  if (unsubscribe !== null) {
    unsubscribe();
    unsubscribe = null;
  }
  if (ringingTimeoutId !== null) {
    clearTimeout(ringingTimeoutId);
    ringingTimeoutId = null;
  }
  stopAlarmRing();
  ringingAlarmId = null;
}
