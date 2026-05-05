/**
 * Shared background ticker.
 *
 * Coalesces polling work across the app into a single interval so low-power
 * devices (Raspberry Pi, tablets) don't wake up every few seconds for each
 * independent engine. Subscribers declare the cadence they need; the ticker
 * dispatches to them on multiples of its base tick.
 *
 * Design notes:
 * - Base tick is 15 seconds. That matches the most aggressive consumer
 *   (alarm checker) while being coarse enough for everything else.
 * - Subscribers at 30 / 60 / 300 / 900 seconds run on multiples of the base
 *   tick, so they all share the same wakeup.
 * - When the document is hidden, we pause the ticker entirely. Consumers that
 *   must keep running while hidden should use their own timer (none currently
 *   need to, and the OS throttles hidden-tab timers anyway).
 * - When `lowPowerMode` is on, the base tick doubles to 30s, so every cadence
 *   is lengthened in lockstep. This makes the whole proactive / routine /
 *   alarm stack cheaper on battery-powered devices.
 */

import { getLowPowerMode } from '../utils/settingsStorage';

type TickInterval = 15 | 30 | 60 | 300 | 900;

type Listener = () => void;

const listeners: Record<TickInterval, Set<Listener>> = {
  15: new Set(),
  30: new Set(),
  60: new Set(),
  300: new Set(),
  900: new Set(),
};

let intervalId: number | null = null;
let tickCount = 0;
let lastBaseMs = 15_000;

const getBaseTickMs = (): number => (getLowPowerMode() ? 30_000 : 15_000);

const fire = (bucket: TickInterval) => {
  listeners[bucket].forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.warn(`[BackgroundTicker] Listener in ${bucket}s bucket threw:`, error);
    }
  });
};

const runTick = () => {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return;
  }

  tickCount += 1;
  // Base tick is scaled by lowPowerMode, but bucket cadences describe the
  // wall-clock cadence at normal power. In low-power mode each bucket fires
  // at half the frequency, which is intentional.
  fire(15);
  if (tickCount % 2 === 0) fire(30);
  if (tickCount % 4 === 0) fire(60);
  if (tickCount % 20 === 0) fire(300);
  if (tickCount % 60 === 0) fire(900);
};

const ensureRunning = () => {
  if (intervalId !== null) return;
  lastBaseMs = getBaseTickMs();
  intervalId = window.setInterval(runTick, lastBaseMs);
};

const stopIfIdle = () => {
  const anyListeners = (Object.values(listeners) as Set<Listener>[]).some((set) => set.size > 0);
  if (anyListeners) return;
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
    tickCount = 0;
  }
};

const restartForBaseChange = () => {
  const nextBaseMs = getBaseTickMs();
  if (nextBaseMs === lastBaseMs || intervalId === null) return;
  window.clearInterval(intervalId);
  lastBaseMs = nextBaseMs;
  intervalId = window.setInterval(runTick, lastBaseMs);
};

// React to low-power mode toggles at runtime.
if (typeof window !== 'undefined') {
  window.addEventListener('curio:settings-changed', restartForBaseChange);
  // Pause the ticker explicitly when the tab goes hidden to avoid the 1Hz
  // background throttle burst that browsers apply when the tab becomes
  // visible again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && intervalId !== null) {
      // Fire immediately so consumers catch up on returning to the tab.
      runTick();
    }
  });
}

/**
 * Subscribe to the background ticker. Returns an unsubscribe function that
 * should be called in the cleanup path of whatever owns the subscription.
 */
export const subscribeBackgroundTick = (
  intervalSeconds: TickInterval,
  listener: Listener,
): (() => void) => {
  listeners[intervalSeconds].add(listener);
  ensureRunning();

  return () => {
    listeners[intervalSeconds].delete(listener);
    stopIfIdle();
  };
};

/** Test / debug helper -- force a synchronous tick in all buckets. */
export const __fireTickForTesting = () => {
  (Object.keys(listeners) as unknown as TickInterval[]).forEach((bucket) => fire(bucket));
};
