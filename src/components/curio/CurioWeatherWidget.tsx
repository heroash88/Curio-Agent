import React, { useMemo } from 'react';
import type { AqiData, WeatherData } from '../../services/weatherService';
import { AnimatedWeatherIcon } from '../common/WeatherIcon';
import { useTempUnit, useWeatherWidgetScale, useWeatherWidgetPosition, useIsBgDark } from '../../utils/settingsStorage';
import type { WidgetPosition } from '../../utils/settingsStorage';

interface CurioWeatherWidgetProps {
    weather: WeatherData | null;
    aqi: AqiData | null;
    tempUnit: 'F' | 'C';
    lowPowerMode?: boolean;
}

const POSITION_CLASSES: Record<WidgetPosition, string> = {
    'top-left': 'top-[calc(1.25rem+env(safe-area-inset-top,0px))] left-[calc(1.25rem+env(safe-area-inset-left,0px))]',
    'top-right': 'top-[calc(1.25rem+env(safe-area-inset-top,0px))] right-[calc(1.25rem+env(safe-area-inset-right,0px))]',
    'bottom-left': 'bottom-28 left-[calc(1.25rem+env(safe-area-inset-left,0px))]',
    'bottom-right': 'bottom-28 right-[calc(1.25rem+env(safe-area-inset-right,0px))]',
};

// Base sizes at scale 100
const BASE = { width: 200, temp: 32, desc: 13, city: 13, icon: 44, aqiLabel: 8, aqiCat: 11, aqiNum: 18 };

export const CurioWeatherWidget: React.FC<CurioWeatherWidgetProps> = React.memo(({
    weather,
    aqi,
}) => {
    const tempUnit = useTempUnit();
    const weatherWidgetScale = useWeatherWidgetScale();
    const weatherWidgetPosition = useWeatherWidgetPosition();
    const s = weatherWidgetScale / 100;

    const sz = useMemo(() => ({
        width: Math.round(BASE.width * s),
        temp: Math.round(BASE.temp * s),
        desc: Math.round(BASE.desc * s),
        city: Math.round(BASE.city * s),
        icon: Math.round(BASE.icon * s),
        aqiLabel: Math.round(BASE.aqiLabel * s),
        aqiCat: Math.round(BASE.aqiCat * s),
        aqiNum: Math.round(BASE.aqiNum * s),
    }), [s]);

    const isDark = useIsBgDark();

    if (!weather) return null;
    const pos = POSITION_CLASSES[weatherWidgetPosition] || POSITION_CLASSES['top-right'];

    return (
        <div className={`absolute ${pos} z-30 pointer-events-none`}>
            <div className="transition-colors duration-500 overflow-hidden" style={{ width: sz.width }}>
                <div className="px-4 pt-4 pb-3">
                    <div className="flex items-center gap-2.5">
                        <AnimatedWeatherIcon icon={weather.icon} size={sz.icon} />
                        <div>
                            <div
                                className={`font-semibold leading-none tracking-tight transition-colors duration-500 font-headline ${isDark ? 'text-white' : 'text-slate-800'}`}
                                style={{ fontSize: sz.temp, textShadow: isDark ? '0 2px 8px rgba(0,0,0,0.5)' : '0 1px 4px rgba(255,255,255,0.7)' }}
                            >
                                {tempUnit === 'F' ? weather.tempF : weather.tempC}°
                                <span style={{ fontSize: Math.round(sz.temp * 0.65) }}>{tempUnit}</span>
                            </div>
                            <div
                                className={`mt-0.5 capitalize transition-colors duration-500 ${isDark ? 'text-white/50' : 'text-slate-500'}`}
                                style={{ fontSize: sz.desc }}
                            >
                                {weather.desc}
                            </div>
                        </div>
                    </div>
                    <div
                        className={`mt-2.5 font-semibold transition-colors duration-500 ${isDark ? 'text-white/85' : 'text-slate-700'}`}
                        style={{ fontSize: sz.city }}
                    >
                        {weather.city}
                        {weather.humidity != null && (
                            <span className={`ml-2 font-normal ${isDark ? 'text-white/40' : 'text-slate-400'}`} style={{ fontSize: Math.round(sz.city * 0.85) }}>
                                💧 {weather.humidity}%
                            </span>
                        )}
                    </div>
                </div>

                {aqi && (
                    <div className={`px-4 pb-3.5 pt-2.5 border-t transition-colors duration-500 ${isDark ? 'border-white/[0.08]' : 'border-black/[0.06]'}`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <div
                                    className={`font-bold uppercase tracking-[0.15em] transition-colors duration-500 ${isDark ? 'text-white/35' : 'text-slate-500'}`}
                                    style={{ fontSize: sz.aqiLabel }}
                                >
                                    Air Quality
                                </div>
                                <div
                                    className={`mt-0.5 transition-colors duration-500 ${isDark ? 'text-white/60' : 'text-slate-500'}`}
                                    style={{ fontSize: sz.aqiCat }}
                                >
                                    {aqi.category}
                                </div>
                            </div>
                            <div
                                className="flex items-center justify-center rounded-lg px-2.5 py-1 min-w-[40px]"
                                style={{ backgroundColor: aqi.color + '22' }}
                            >
                                <span className="font-bold leading-none" style={{ color: aqi.color, fontSize: sz.aqiNum }}>
                                    {aqi.value}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

CurioWeatherWidget.displayName = 'CurioWeatherWidget';
