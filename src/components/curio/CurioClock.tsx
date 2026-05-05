import React, { useEffect, useMemo, useState } from 'react';
import { useClockWidgetScale, useClockWidgetPosition, useIsBgDark, useClockShowSeconds, useClockUse24Hour } from '../../utils/settingsStorage';
import type { WidgetPosition } from '../../utils/settingsStorage';

interface CurioClockProps {
    lowPowerMode?: boolean;
}

const scheduleMinuteBoundary = (onTick: () => void): (() => void) => {
    let timeoutId: number | null = null;
    const scheduleNext = () => {
        const now = Date.now();
        const nextMinuteDelay = 60_000 - (now % 60_000) + 25;
        timeoutId = window.setTimeout(() => {
            // Skip tick when tab hidden; still reschedule so we're ready when visible
            if (document.visibilityState !== 'hidden') onTick();
            scheduleNext();
        }, nextMinuteDelay);
    };
    scheduleNext();
    return () => { if (timeoutId !== null) window.clearTimeout(timeoutId); };
};

const POSITION_CLASSES: Record<WidgetPosition, string> = {
    'top-left': 'top-[calc(1.25rem+env(safe-area-inset-top,0px))] left-[calc(1.25rem+env(safe-area-inset-left,0px))]',
    'top-right': 'top-[calc(1.25rem+env(safe-area-inset-top,0px))] right-[calc(1.25rem+env(safe-area-inset-right,0px))]',
    'bottom-left': 'bottom-28 left-[calc(1.25rem+env(safe-area-inset-left,0px))]',
    'bottom-right': 'bottom-28 right-[calc(1.25rem+env(safe-area-inset-right,0px))]',
};

// Base sizes at scale 100
const BASE_TIME_PX = 72;   // ~text-7xl
const BASE_AMPM_PX = 18;   // ~text-lg
const BASE_DATE_PX = 14;   // ~text-sm

export const CurioClock: React.FC<CurioClockProps> = React.memo(({ lowPowerMode = true }) => {
    const clockWidgetScale = useClockWidgetScale();
    const clockWidgetPosition = useClockWidgetPosition();
    const showSeconds = useClockShowSeconds();
    const use24Hour = useClockUse24Hour();
    const [now, setNow] = useState(() => new Date());
    const isDark = useIsBgDark();
    const pos = POSITION_CLASSES[clockWidgetPosition] || POSITION_CLASSES['top-left'];
    const s = clockWidgetScale / 100;

    const sizes = useMemo(() => ({
        time: Math.round(BASE_TIME_PX * s),
        ampm: Math.round(BASE_AMPM_PX * s),
        date: Math.round(BASE_DATE_PX * s),
    }), [s]);

    // Tick every second when seconds are shown, otherwise minute-boundary
    const needsSecondTick = showSeconds && !lowPowerMode;

    useEffect(() => {
        setNow(new Date());
        if (needsSecondTick) {
            const timer = window.setInterval(() => {
                // Skip update when tab hidden -- avoids wasted work on backgrounded tabs
                if (document.visibilityState === 'hidden') return;
                setNow(new Date());
            }, 1_000);
            return () => window.clearInterval(timer);
        }
        return scheduleMinuteBoundary(() => setNow(new Date()));
    }, [needsSecondTick]);

    const timeOpts: Intl.DateTimeFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
        ...(showSeconds && !lowPowerMode ? { second: '2-digit' } : {}),
        hour12: !use24Hour,
    };
    const timeStr = now.toLocaleTimeString([], timeOpts);

    const match = timeStr.match(/^([\d:]+)\s*(AM|PM)?$/i);
    const timePart = match ? match[1] : timeStr;
    const ampm = match?.[2] || '';
    const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

    return (
        <div className={`absolute ${pos} z-30 pointer-events-none`}>
            <div className="transition-colors duration-500 px-5 py-4">
                <div className="flex items-baseline gap-1.5">
                    <span
                        className={`font-semibold leading-none tracking-tight tabular-nums transition-colors duration-500 font-headline ${isDark ? 'text-white' : 'text-slate-800'}`}
                        style={{ fontSize: sizes.time, textShadow: isDark ? '0 2px 8px rgba(0,0,0,0.5)' : '0 1px 4px rgba(255,255,255,0.7)' }}
                    >
                        {timePart}
                    </span>
                    {ampm && (
                        <span
                            className={`font-semibold uppercase transition-colors duration-500 ${isDark ? 'text-white/40' : 'text-slate-400'}`}
                            style={{ fontSize: sizes.ampm }}
                        >
                            {ampm}
                        </span>
                    )}
                </div>
                <div
                    className={`mt-2 font-medium transition-colors duration-500 ${isDark ? 'text-white/50' : 'text-slate-500'}`}
                    style={{ fontSize: sizes.date }}
                >
                    {dateStr}
                </div>
            </div>
        </div>
    );
});

CurioClock.displayName = 'CurioClock';
