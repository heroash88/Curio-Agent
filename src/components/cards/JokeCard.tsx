import React, { useState, useRef, useEffect } from 'react';
import type { CardComponentProps, JokeCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const JokeCard: React.FC<CardComponentProps> = ({ card, onInteractionStart, onInteractionEnd }) => {
  const t = useCardTheme();
  const data = card.data as unknown as JokeCardData;
  const [revealed, setRevealed] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  return (
    <div className="card-glass">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
          <span className="text-lg">😂</span>
        </div>
        <div>
          <p className="text-sm font-bold font-headline">{data.category ? `${data.category} Joke` : 'Joke'}</p>
          <p className={`text-[10px] font-medium ${t.faint}`}>Tap to reveal the punchline</p>
        </div>
      </div>
      <p className={`text-sm leading-relaxed ${t.text2}`}>{data.setup}</p>
      {revealed ? (
        <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
          <p className="text-sm font-bold text-amber-300 leading-relaxed">{data.punchline}</p>
        </div>
      ) : (
        <button
          onClick={() => { onInteractionStart(); setRevealed(true); timerRef.current = window.setTimeout(onInteractionEnd, 5000); }}
          className={`mt-3 w-full rounded-xl ${t.btn} border ${t.panelBorder} px-4 py-2.5 text-sm font-semibold ${t.btnText} transition-all active:scale-[0.98]`}
        >
          Reveal Punchline 🥁
        </button>
      )}
    </div>
  );
};

export default JokeCard;
