import React from 'react';
import type { CardComponentProps, SensorReadingCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const CLASS_ICON: Record<string, string> = {
  temperature: '🌡️',
  humidity: '💧',
  pressure: '🔵',
  battery: '🔋',
  illuminance: '☀️',
  power: '⚡',
  energy: '⚡',
  voltage: '🔌',
  current: '🔌',
  gas: '🔥',
  co2: '🫁',
  pm25: '🌫️',
  pm10: '🌫️',
};

const CLASS_COLOR: Record<string, { text: string; bg: string }> = {
  temperature: { text: 'text-orange-400', bg: 'bg-orange-500/20' },
  humidity:    { text: 'text-sky-400',    bg: 'bg-sky-500/20' },
  pressure:    { text: 'text-indigo-400', bg: 'bg-indigo-500/20' },
  battery:     { text: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  illuminance: { text: 'text-amber-400',  bg: 'bg-amber-500/20' },
  power:       { text: 'text-yellow-400', bg: 'bg-yellow-500/20' },
};

const SensorReadingCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as SensorReadingCardData;
  const dc = data.deviceClass || 'temperature';
  const icon = data.icon || CLASS_ICON[dc] || '📊';
  const color = CLASS_COLOR[dc] || { text: 'text-white/70', bg: 'bg-white/10' };

  return (
    <div className="card-glass">
      <div className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${color.bg}`}>
            <span className="text-xl">{icon}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold font-headline truncate">{data.friendlyName}</p>
            {data.area && (
              <p className={`text-[10px] font-bold uppercase tracking-wider ${t.faint}`}>{data.area}</p>
            )}
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-3xl font-black font-headline ${color.text}`}>{data.value}</span>
          {data.unit && <span className={`text-sm font-bold ${t.muted}`}>{data.unit}</span>}
        </div>
      </div>
    </div>
  );
};

export default SensorReadingCard;
