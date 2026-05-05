import { useEffect, useRef, useState } from 'react';
import { useOptionalTimerTick } from './useTimerTick';

type TimePrecision = 'second' | 'minute';

const getBucket = (timestamp: number, precision: TimePrecision): number =>
  precision === 'second'
    ? Math.floor(timestamp / 1_000)
    : Math.floor(timestamp / 60_000);

export const useSyncedDashboardTime = (
  precision: TimePrecision = 'minute',
): Date => {
  const subscribe = useOptionalTimerTick();
  const [now, setNow] = useState(() => new Date());
  const bucketRef = useRef(getBucket(Date.now(), precision));

  useEffect(() => {
    bucketRef.current = getBucket(Date.now(), precision);

    const handleTick = (timestamp: number) => {
      const nextBucket = getBucket(timestamp, precision);
      if (nextBucket === bucketRef.current) return;
      bucketRef.current = nextBucket;
      setNow(new Date(timestamp));
    };

    if (subscribe) {
      return subscribe(handleTick);
    }

    const fallbackInterval = precision === 'second' ? 1_000 : 60_000;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        handleTick(Date.now());
      }
    }, fallbackInterval);
    return () => window.clearInterval(intervalId);
  }, [precision, subscribe]);

  return now;
};
