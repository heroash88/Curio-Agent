import React from 'react';
import type { CardComponentProps, AirQualityCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const AQI_THEME: Record<string, { color: string; bg: string; border: string }> = {
  good:                            { color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/30' },
  moderate:                        { color: 'text-amber-400',   bg: 'bg-amber-500/20',   border: 'border-amber-500/30' },
  'unhealthy for sensitive groups': { color: 'text-orange-400',  bg: 'bg-orange-500/20',  border: 'border-orange-500/30' },
  unhealthy:                       { color: 'text-rose-400',    bg: 'bg-rose-500/20',    border: 'border-rose-500/30' },
  'very unhealthy':                { color: 'text-purple-400',  bg: 'bg-purple-500/20',  border: 'border-purple-500/30' },
  hazardous:                       { color: 'text-rose-600',    bg: 'bg-rose-600/20',    border: 'border-rose-600/30' },
};

const AirQualityCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as AirQualityCardData;
  const cat = (data.category || '').toLowerCase();
  const theme = AQI_THEME[cat] || { color: 'text-white/60', bg: 'bg-white/10', border: 'border-white/10' };

  const pollutants = [
    { label: 'PM2.5', value: data.pm25 },
    { label: 'PM10', value: data.pm10 },
    { label: 'O₃', value: data.o3 },
    { label: 'NO₂', value: data.no2 },
  ].filter(p => p.value != null);

  return (
    <div className="card-glass">
      <div className={`h-1.5 w-full rounded-full mb-4 ${theme.bg.replace('/20', '/60')}`} />
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 items-center justify-center rounded-full ${theme.bg}`}>
            <span className="text-lg">🌬️</span>
          </div>
          <div>
            <p className="text-sm font-bold font-headline">Air Quality</p>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${theme.color}`}>{data.category}</p>
          </div>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${theme.bg} ${theme.border}`}>
          <span className={`text-xl font-black font-headline ${theme.color}`}>{data.aqi}</span>
        </div>
      </div>
      {data.advice && <p className={`text-[11px] ${t.muted} mb-3 leading-relaxed`}>{data.advice}</p>}
      {pollutants.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {pollutants.map(({ label, value }) => (
            <div key={label} className={`rounded-xl ${t.panel} px-3 py-2 text-center`}>
              <p className="text-sm font-bold">{value}</p>
              <p className={`text-[9px] font-bold uppercase tracking-wider ${t.faint}`}>{label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AirQualityCard;
