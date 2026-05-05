import { useEffect, useRef } from 'react';

/**
 * Keeps the screen on using the Screen Wake Lock API.
 * Automatically re-acquires the lock when the tab becomes visible again
 * (browsers release it on visibility change).
 */
export function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!('wakeLock' in navigator)) return;

    const acquire = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      } catch {
        // Wake lock request can fail (e.g. low battery, background tab)
      }
    };

    acquire();

    // Re-acquire when tab becomes visible -- browsers release the lock on hide
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, []);
}
