import React from 'react';
import type { CardComponentProps, FunFactCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const DESIGN_TOKEN = 'card-glass';

const FunFactCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as FunFactCardData;

  return (
    <div className={DESIGN_TOKEN}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">💡</span>
        <span className={`${t.text} font-bold font-headline`}>Fun Fact</span>
      </div>
      <div className="border-l-2 border-blue-400 pl-3">
        <p className={`${t.text} italic text-sm`}>{data.fact}</p>
      </div>
    </div>
  );
};

export default React.memo(FunFactCard);
