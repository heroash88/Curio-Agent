import React from 'react';
import type { CardComponentProps, QuoteCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const DESIGN_TOKEN = 'card-glass';

const QuoteCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as QuoteCardData;

  return (
    <div className={DESIGN_TOKEN}>
      <span className={`text-4xl ${t.faint} leading-none`}>&ldquo;</span>
      <p className={`${t.text} italic text-sm mt-1 px-2`}>{data.quote}</p>
      <p className={`${t.muted} text-sm mt-3 text-right`}>— {data.author}</p>
    </div>
  );
};

export default React.memo(QuoteCard);
