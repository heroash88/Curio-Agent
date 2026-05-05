import React from 'react';
import type { CardComponentProps, MapCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';
import { DirectionsPreview } from './MapPreview';

const MODE_ICONS: Record<string, string> = {
  driving: '🚗',
  walking: '🚶',
  transit: '🚌',
  bicycling: '🚲',
};

const MapCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as MapCardData;
  const icon = MODE_ICONS[data.travelMode] || '📍';

  return (
    <div className="card-glass">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400">
          <span className="text-lg">{icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold font-headline">Directions to {data.destination}</p>
          {data.origin && <p className={`text-[10px] font-medium ${t.faint}`}>From {data.origin}</p>}
        </div>
      </div>

      <DirectionsPreview
        destination={data.destination}
        encodedPolyline={data.encodedPolyline}
        staticMapUrl={data.staticMapUrl}
        travelMode={data.travelMode}
      />

      <div className="mb-4 flex gap-3">
        {data.duration && (
          <div className={`flex-1 rounded-xl ${t.panel} p-3 text-center`}>
            <p className="text-xl font-bold font-headline tracking-tight">{data.duration}</p>
            <p className={`text-[9px] font-bold uppercase tracking-wider ${t.faint}`}>Duration</p>
          </div>
        )}
        {data.distance && (
          <div className={`flex-1 rounded-xl ${t.panel} p-3 text-center`}>
            <p className="text-xl font-bold font-headline tracking-tight">{data.distance}</p>
            <p className={`text-[9px] font-bold uppercase tracking-wider ${t.faint}`}>Distance</p>
          </div>
        )}
      </div>

      {data.steps && data.steps.length > 0 && (
        <div className={`max-h-28 space-y-1.5 overflow-y-auto rounded-xl ${t.panel} p-3`}>
          {data.steps.slice(0, 5).map((step, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span className={`w-4 shrink-0 text-right font-bold ${t.faint}`}>{i + 1}.</span>
              <span className={`${t.muted} flex-1`}>{step.instruction}</span>
              <span className={`${t.faint} shrink-0`}>{step.distance}</span>
            </div>
          ))}
        </div>
      )}

      {data.mapUrl && (
        <a
          href={data.mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-3 flex items-center justify-center gap-1.5 rounded-xl border ${t.panelBorder} ${t.btn} py-2 text-[11px] font-semibold ${t.muted} transition-all`}
        >
          Open in Maps ↗
        </a>
      )}
    </div>
  );
};

export default MapCard;
