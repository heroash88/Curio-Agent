import React, { useState, useCallback } from 'react';
import type { CardComponentProps, ImageCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const DESIGN_TOKEN = 'card-glass';

const ImageCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as ImageCardData;
  const [hasError, setHasError] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const openFullscreen = useCallback(() => {
    if (!hasError) setFullscreen(true);
  }, [hasError]);

  const closeFullscreen = useCallback(() => {
    setFullscreen(false);
  }, []);

  return (
    <div className={DESIGN_TOKEN}>
      {hasError ? (
        <div className="flex flex-col items-center justify-center py-6 gap-2">
          <span className="text-4xl">🖼️</span>
          <p className={`${t.muted} text-sm`}>Image unavailable</p>
        </div>
      ) : (
        <button
          type="button"
          className="w-full cursor-pointer bg-transparent border-0 p-0"
          onClick={openFullscreen}
          aria-label="View fullscreen"
        >
          <img
            src={data.imageUrl}
            alt={data.caption}
            loading="lazy"
            onError={handleError}
            className="w-full max-h-[200px] object-cover rounded-xl"
          />
        </button>
      )}
      {data.caption && (
        <p className={`${t.muted} text-sm mt-2`}>{data.caption}</p>
      )}

      {fullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={closeFullscreen}
          role="dialog"
          aria-label="Fullscreen image"
        >
          <button
            type="button"
            onClick={closeFullscreen}
            className={`absolute top-4 right-4 ${t.text} text-2xl ${t.btn} rounded-full w-10 h-10 flex items-center justify-center`}
            aria-label="Close fullscreen"
          >
            ✕
          </button>
          <img
            src={data.imageUrl}
            alt={data.caption}
            className="max-w-full max-h-full object-contain rounded-xl"
          />
        </div>
      )}
    </div>
  );
};

export default React.memo(ImageCard);
