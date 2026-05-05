import React from 'react';
import type { CardComponentProps, PlacesCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';
import { LocationPreview } from './MapPreview';

const PlacesCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as PlacesCardData;

  const handlePlaceClick = (url?: string) => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="card-glass max-w-[400px]">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400">
          <span className="text-lg">📍</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold font-headline">Places: {data.query}</p>
          <p className={`text-[10px] font-medium ${t.faint}`}>Search results</p>
        </div>
      </div>

      <div className="space-y-3">
        {data.places.map((place, i) => (
          <div
            key={i}
            onClick={() => handlePlaceClick(place.mapsUrl)}
            className={`group cursor-pointer rounded-xl border border-white/5 ${t.panel} p-3 transition-all hover:bg-white/10 active:scale-[0.98]`}
          >
            <div className="flex gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10">
                <LocationPreview
                  location={place.location}
                  staticMapUrl={place.staticMapUrl}
                  label={place.name}
                  className="h-full w-full rounded-none border-0"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold transition-colors group-hover:text-indigo-400">{place.name}</p>
                <p className={`mt-0.5 line-clamp-2 text-[11px] leading-tight ${t.muted}`}>{place.address}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  {place.rating && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-yellow-500">★</span>
                      <span className="text-[10px] font-bold">{place.rating}</span>
                      <span className={`text-[10px] ${t.faint}`}>({place.userRatingCount})</span>
                    </div>
                  )}
                  {place.priceLevel && (
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-white/60">
                      {place.priceLevel.replace('PRICE_LEVEL_', '').length === 1
                        ? place.priceLevel.replace('PRICE_LEVEL_', '')
                        : '$$'}
                    </span>
                  )}
                  {place.openNow !== undefined && (
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider ${
                        place.openNow ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {place.openNow ? 'Open Now' : 'Closed'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {data.centerMapUrl && (
        <a
          href={data.centerMapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-4 flex items-center justify-center gap-1.5 rounded-xl border ${t.panelBorder} ${t.btn} py-2.5 text-[11px] font-semibold ${t.muted} transition-all`}
        >
          View all on Map ↗
        </a>
      )}
    </div>
  );
};

export default PlacesCard;
