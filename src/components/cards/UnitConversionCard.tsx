import React from 'react';
import type { CardComponentProps, UnitConversionCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const CATEGORY_ICONS: Record<string, string> = {
  length: '📏', weight: '⚖️', temperature: '🌡️', volume: '🧪',
  speed: '💨', area: '📐', time: '⏱️', data: '💾',
};

const UnitConversionCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as UnitConversionCardData;
  const icon = CATEGORY_ICONS[data.category?.toLowerCase()] || '🔄';

  return (
    <div className="card-glass">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500/20 text-sky-400">
          <span className="text-lg">{icon}</span>
        </div>
        <div>
          <p className="text-sm font-bold font-headline capitalize">{data.category} Conversion</p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-4 py-2">
        <div className={`flex-1 rounded-xl ${t.panel} p-4 text-center`}>
          <p className="text-2xl font-bold font-headline tracking-tight">{data.fromValue}</p>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${t.faint} mt-1`}>{data.fromUnit}</p>
        </div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${t.panel} ${t.muted} text-sm font-bold shrink-0`}>=</div>
        <div className="flex-1 rounded-xl bg-sky-500/10 border border-sky-500/20 p-4 text-center">
          <p className="text-2xl font-bold font-headline tracking-tight text-sky-300">{data.toValue}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-400/60 mt-1">{data.toUnit}</p>
        </div>
      </div>
    </div>
  );
};

export default UnitConversionCard;
