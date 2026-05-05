import React from 'react';
import type { CardComponentProps, DefinitionCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const DefinitionCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as DefinitionCardData;

  return (
    <div className="card-glass">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/20 border border-indigo-500/20 shrink-0">
          <span className="text-lg">📖</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-xl font-bold font-headline">{data.word}</p>
            {data.partOfSpeech && (
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-[10px] font-bold text-indigo-300">
                {data.partOfSpeech}
              </span>
            )}
          </div>
          {data.pronunciation && (
            <p className={`${t.faint} text-xs mt-0.5`}>{data.pronunciation}</p>
          )}
          <p className={`text-sm ${t.text2} leading-relaxed mt-2`}>{data.definition}</p>
        </div>
      </div>
    </div>
  );
};

export default React.memo(DefinitionCard);
