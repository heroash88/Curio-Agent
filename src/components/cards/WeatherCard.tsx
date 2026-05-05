import React from 'react';
import type { CardComponentProps, WeatherCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const CONDITION_ICONS: Record<string, string> = {
  clear: '☀️', sunny: '☀️', cloudy: '☁️', overcast: '☁️',
  rain: '🌧️', rainy: '🌧️', drizzle: '🌦️',
  'light drizzle': '🌦️', 'light rain': '🌦️', 'light showers': '🌦️',
  'heavy rain': '🌧️', 'heavy showers': '🌧️',
  snow: '❄️', snowy: '❄️', 'light snow': '🌨️', 'heavy snow': '❄️',
  'snow grains': '🌨️', 'snow showers': '🌨️', 'heavy snow showers': '❄️',
  storm: '⛈️', thunderstorm: '⛈️', 'thunderstorm w/ hail': '⛈️', 'severe thunderstorm': '⛈️',
  fog: '🌫️', foggy: '🌫️', mist: '🌫️', 'rime fog': '🌫️',
  'partly cloudy': '⛅', 'mostly clear': '🌤️',
  'freezing drizzle': '🌧️', 'heavy freezing drizzle': '🌧️',
  'freezing rain': '🌧️', 'heavy freezing rain': '🌧️',
};

const WeatherCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as WeatherCardData;
  const condition = (data.condition ?? '').toLowerCase();
  const icon = CONDITION_ICONS[condition] ?? '🌤️';
  const unit = data.unit ?? 'F';
  const isForecast = data.forecastMode && data.daily && data.daily.length > 0;

  return (
    <div className="card-glass weather-card-glass">
      {/* Current weather header */}
      <div className="weather-card-header flex items-center justify-between">
        <div>
          <p className="text-5xl font-light font-headline">
            {data.temperature}°{unit}
          </p>
          <p className={`text-base ${t.text2} capitalize mt-1`}>{data.condition}</p>
        </div>
        <span className="text-6xl" role="img" aria-label={data.condition}>{icon}</span>
      </div>

      {/* Stats row */}
      <div className={`weather-card-stats flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm ${t.muted}`}>
        <span>H: {data.high}°</span>
        <span>L: {data.low}°</span>
        {data.humidity != null && <span>💧 {data.humidity}%</span>}
      </div>

      {/* ── Forecast mode: 5-day detailed rows ── */}
      {isForecast && (
        <div className="weather-card-forecast mt-4 space-y-1.5">
          <p className={`text-xs font-bold uppercase tracking-wider ${t.muted}`}>5-Day Forecast</p>
          {data.daily!.slice(0, 5).map((d, i) => {
            const dIcon = CONDITION_ICONS[d.condition?.toLowerCase()] ?? '🌤️';
            return (
              <div
                key={i}
                className={`flex items-center justify-between rounded-xl px-3 py-2 ${i === 0 ? 'bg-[var(--ether-surface-container-low)] font-semibold' : ''}`}
              >
                <span className={`w-12 text-xs ${t.text2}`}>{i === 0 ? 'Today' : d.date}</span>
                <span className="text-lg w-8 text-center">{dIcon}</span>
                <span className={`text-xs w-20 text-center ${t.muted} capitalize`}>{d.condition}</span>
                {d.humidity != null && (
                  <span className={`text-[10px] w-10 text-center ${t.muted}`}>💧{d.humidity}%</span>
                )}
                <span className={`text-xs w-16 text-right tabular-nums ${t.text2}`}>
                  {unit === 'C' ? d.highC : d.highF}° / {unit === 'C' ? d.lowC : d.lowF}°
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Compact mode: scrollable daily strip ── */}
      {!isForecast && data.daily && data.daily.length > 0 && (
        <div className="weather-card-daily-strip mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {data.daily.slice(0, 7).map((d, i) => {
            const dIcon = CONDITION_ICONS[d.condition?.toLowerCase()] ?? '🌤️';
            return (
              <div key={i} className={`flex flex-col items-center min-w-[44px] text-xs ${t.text2} ${i === 0 ? 'font-bold' : ''}`}>
                <span className="text-[10px]">{i === 0 ? 'Today' : d.date}</span>
                <span className="text-base my-0.5">{dIcon}</span>
                <span>{unit === 'C' ? d.highC : d.highF}°</span>
                <span className={`${t.muted} text-[10px]`}>{unit === 'C' ? d.lowC : d.lowF}°</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Legacy hourly forecast */}
      {!isForecast && data.forecast && data.forecast.length > 0 && (
        <div className="weather-card-hourly-strip mt-3 flex gap-3 overflow-x-auto pb-1 scrollbar-none">
          {data.forecast.slice(0, 6).map((f, i) => {
            const fIcon = CONDITION_ICONS[f.condition?.toLowerCase()] ?? '🌤️';
            return (
              <div key={i} className={`flex flex-col items-center min-w-[48px] text-xs ${t.text2}`}>
                <span>{f.time}</span>
                <span className="text-lg my-0.5">{fIcon}</span>
                <span>{f.temp}°</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default React.memo(WeatherCard);
