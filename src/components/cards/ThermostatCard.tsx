import React from 'react';
import type { CardComponentProps, ThermostatCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const MODE_THEME: Record<string, { icon: string; color: string; bg: string }> = {
  heat:      { icon: '🔥', color: 'text-orange-400', bg: 'bg-orange-500/20' },
  cool:      { icon: '❄️', color: 'text-sky-400',    bg: 'bg-sky-500/20' },
  heat_cool: { icon: '🔄', color: 'text-violet-400', bg: 'bg-violet-500/20' },
  auto:      { icon: '🔄', color: 'text-violet-400', bg: 'bg-violet-500/20' },
  off:       { icon: '⭕', color: 'text-white/60',   bg: 'bg-white/10' },
  fan_only:  { icon: '💨', color: 'text-[#00B2FF]',   bg: 'bg-sky-500/20' },
  dry:       { icon: '💧', color: 'text-blue-400',   bg: 'bg-blue-500/20' },
};

const ThermostatCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as ThermostatCardData;
  const theme = MODE_THEME[data.hvacMode] || MODE_THEME.auto;

  return (
    <div className="card-glass">
      <div className="flex items-center gap-2.5 mb-4">
        <div className={`flex h-9 w-9 items-center justify-center rounded-full ${theme.bg}`}>
          <span className="text-lg">{theme.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold font-headline truncate">{data.name}</p>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${theme.color}`}>
            {data.hvacMode.replace('_', ' ')}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-6 py-2">
        <div className={`flex-1 rounded-xl ${t.panel} p-4 text-center`}>
          <p className="text-3xl font-light font-headline tracking-tight">{data.currentTemp}°{data.unit}</p>
          <p className={`text-[9px] font-bold uppercase tracking-wider ${t.faint} mt-1`}>Current</p>
        </div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${t.panel} ${t.faint} text-sm shrink-0`}>→</div>
        <div className={`flex-1 rounded-xl ${theme.bg} border ${theme.bg.replace('/20', '/30').replace('bg-', 'border-')} p-4 text-center`}>
          <p className={`text-3xl font-bold font-headline tracking-tight ${theme.color}`}>{data.targetTemp}°{data.unit}</p>
          <p className={`text-[9px] font-bold uppercase tracking-wider ${t.faint} mt-1`}>Target</p>
        </div>
      </div>
      {data.humidity != null && (
        <div className={`mt-3 rounded-xl ${t.panel} px-3 py-2 text-center`}>
          <p className={`text-[11px] font-medium ${t.faint}`}>💧 Humidity: {data.humidity}%</p>
        </div>
      )}
    </div>
  );
};

export default ThermostatCard;
