import React from 'react';
import type { CardComponentProps, AstronomyCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const MOON_PHASES: Record<string, string> = {
  'new moon': '🌑', 'waxing crescent': '🌒', 'first quarter': '🌓', 'waxing gibbous': '🌔',
  'full moon': '🌕', 'waning gibbous': '🌖', 'last quarter': '🌗', 'waning crescent': '🌘',
};

const AstronomyCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as AstronomyCardData;
  const moonIcon = MOON_PHASES[(data.moonPhase || '').toLowerCase()] || '🌙';

  const items = [
    data.sunrise ? { icon: '🌅', value: data.sunrise, label: 'Sunrise' } : null,
    data.sunset ? { icon: '🌇', value: data.sunset, label: 'Sunset' } : null,
    data.moonPhase ? { icon: moonIcon, value: data.moonPhase, label: data.moonIllumination != null ? `${data.moonIllumination}% lit` : 'Moon' } : null,
    data.dayLength ? { icon: '☀️', value: data.dayLength, label: 'Day Length' } : null,
  ].filter(Boolean) as { icon: string; value: string; label: string }[];

  return (
    <div className="card-glass min-w-[420px]">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400">
          <span className="text-lg">🔭</span>
        </div>
        <p className="text-sm font-bold font-headline">Astronomy</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map(({ icon, value, label }) => (
          <div key={label} className={`rounded-xl ${t.panel} p-3 text-center`}>
            <span className="text-xl">{icon}</span>
            <p className="text-xs font-bold mt-1 capitalize">{value}</p>
            <p className={`text-[9px] font-bold uppercase tracking-wider ${t.faint}`}>{label}</p>
          </div>
        ))}
      </div>
      {data.goldenHour && (
        <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-center">
          <p className="text-[11px] font-semibold text-amber-300/80">🌤️ Golden Hour: {data.goldenHour}</p>
        </div>
      )}
      {data.nextEvent && (
        <p className={`text-[10px] ${t.faint} mt-2 text-center`}>Next: {data.nextEvent} at {data.nextEventTime}</p>
      )}
    </div>
  );
};

export default AstronomyCard;
