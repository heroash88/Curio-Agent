import React from 'react';
import type { CardComponentProps, CalculationCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const CalculationCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as CalculationCardData;

  return (
    <div className="card-glass">
      <p className={`text-base font-mono ${t.muted}`}>{data.equation}</p>
      <p className={`text-4xl font-bold font-headline mt-2 ${t.text}`}>= {data.result}</p>
    </div>
  );
};

export default React.memo(CalculationCard);
