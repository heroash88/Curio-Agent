import React from 'react';
import type { CardComponentProps } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const FallbackCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  return (
    <div className="card-glass">
      <p className={`text-sm ${t.muted} mb-2`}>Unknown card type: {card.type}</p>
      <pre className={`text-sm ${t.muted} overflow-auto max-h-[120px] whitespace-pre-wrap font-mono`}>
        {JSON.stringify(card.data, null, 2)}
      </pre>
    </div>
  );
};

export default React.memo(FallbackCard);
