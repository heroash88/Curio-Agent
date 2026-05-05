import React from 'react';
import type { CardComponentProps, NewsCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const DESIGN_TOKEN = 'card-glass';

/** Truncate headline to 120 characters with ellipsis */
function truncateHeadline(text: string): string {
  if (text.length <= 120) return text;
  return text.slice(0, 120) + '...';
}

const NewsCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as NewsCardData;
  const items = data.items || [];

  if (items.length === 0) return null;

  if (items.length === 1) {
    const item = items[0];
    return (
      <div className={DESIGN_TOKEN}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">📰</span>
          <span className={`${t.text} font-bold font-headline`}>News</span>
        </div>
        <p className={`${t.text} font-bold font-headline text-base`}>{truncateHeadline(item.headline)}</p>
        <p className={`${t.muted} text-xs mt-1`}>{item.source || 'Unknown Source'}</p>
        {item.summary && (
          <p className={`${t.text2} text-sm mt-2`}>{item.summary}</p>
        )}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 text-sm mt-2 inline-block hover:underline"
          >
            Read More →
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={DESIGN_TOKEN}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">📰</span>
        <span className={`${t.text} font-bold font-headline`}>News</span>
      </div>
      <div className="overflow-x-auto flex gap-3 -mx-1 px-1 pb-2">
        {items.map((item, i) => (
          <div
            key={i}
            className={`min-w-[220px] max-w-[260px] flex-shrink-0 ${t.panel} rounded-xl p-3`}
          >
            <p className={`${t.text} font-bold font-headline text-sm`}>{truncateHeadline(item.headline)}</p>
            <p className={`${t.muted} text-xs mt-1`}>{item.source || 'Unknown Source'}</p>
            {item.summary && (
              <p className={`${t.text2} text-xs mt-1 line-clamp-2`}>{item.summary}</p>
            )}
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 text-xs mt-1 inline-block hover:underline"
              >
                Read More →
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(NewsCard);
