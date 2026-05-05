import React from 'react';
import type { CardComponentProps, CommuteCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const TRAFFIC_THEME: Record<string, { color: string; bg: string; label: string }> = {
  light:   { color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: '🟢 Light Traffic' },
  moderate:{ color: 'text-amber-400',   bg: 'bg-amber-500/20',   label: '🟡 Moderate Traffic' },
  heavy:   { color: 'text-rose-400',    bg: 'bg-rose-500/20',    label: '🔴 Heavy Traffic' },
  unknown: { color: 'text-white/50',    bg: 'bg-white/10',       label: '⚪ Traffic Unknown' },
};

const CommuteCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as CommuteCardData;
  const theme = TRAFFIC_THEME[data.trafficCondition] || TRAFFIC_THEME.unknown;

  return (
    <div className="card-glass min-w-[420px]">
      <div className="flex items-center gap-2.5 mb-4">
        <div className={`flex h-9 w-9 items-center justify-center rounded-full ${theme.bg}`}>
          <span className="text-lg">🚗</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold font-headline truncate">{data.origin} → {data.destination}</p>
          {data.route && <p className={`text-[10px] font-medium ${t.faint} truncate`}>via {data.route}</p>}
        </div>
      </div>
      <div className="flex gap-3 mb-3">
        <div className={`flex-1 rounded-xl ${t.panel} p-3 text-center`}>
          <p className="text-2xl font-bold font-headline tracking-tight">{data.durationInTraffic || data.duration}</p>
          <p className={`text-[9px] font-bold uppercase tracking-wider ${t.faint}`}>ETA</p>
        </div>
        <div className={`flex-1 rounded-xl ${t.panel} p-3 text-center`}>
          <p className="text-2xl font-bold font-headline tracking-tight">{data.distance}</p>
          <p className={`text-[9px] font-bold uppercase tracking-wider ${t.faint}`}>Distance</p>
        </div>
      </div>
      <div className={`rounded-xl ${theme.bg} px-3 py-2 text-center`}>
        <p className={`text-xs font-semibold ${theme.color}`}>{theme.label}</p>
      </div>
      {data.departureTime && (
        <p className={`text-[10px] ${t.faint} text-center mt-2`}>Depart by {data.departureTime}</p>
      )}
    </div>
  );
};

export default CommuteCard;
