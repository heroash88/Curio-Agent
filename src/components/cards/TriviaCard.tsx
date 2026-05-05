import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { CardComponentProps, TriviaCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const TriviaCard: React.FC<CardComponentProps> = ({ card, onDismiss, onInteractionStart, onInteractionEnd }) => {
  const t = useCardTheme();
  const data = card.data as unknown as TriviaCardData;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const isRevealed = selectedIndex !== null || data.revealed;
  const timerRef = useRef<number | null>(null);
  const dismissRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (dismissRef.current) window.clearTimeout(dismissRef.current);
  }, []);

  const handleSelect = useCallback((idx: number) => {
    if (selectedIndex !== null) return;
    onInteractionStart();
    setSelectedIndex(idx);
    // Resume auto-dismiss timer after 5 seconds
    timerRef.current = window.setTimeout(onInteractionEnd, 5000);
    // Auto-dismiss the card after 5 seconds
    dismissRef.current = window.setTimeout(onDismiss, 5000);
  }, [selectedIndex, onInteractionStart, onInteractionEnd, onDismiss]);

  return (
    <div className="card-glass">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/20 text-violet-400">
          <span className="text-lg">🧠</span>
        </div>
        <div>
          <p className="text-sm font-bold font-headline">Trivia</p>
          {data.category && <p className={`text-[10px] font-medium ${t.faint}`}>{data.category}</p>}
        </div>
      </div>
      <p className={`text-sm leading-relaxed ${t.text2} mb-3`}>{data.question}</p>
      <div className="space-y-2">
        {data.options.map((opt, i) => {
          let cls = `${t.panel} ${t.panelBorder} hover:${t.panel}`;
          if (isRevealed) {
            if (i === data.correctIndex) cls = 'bg-emerald-500/15 border-emerald-500/30';
            else if (i === selectedIndex) cls = 'bg-rose-500/15 border-rose-500/30';
            else cls = `${t.panel} ${t.panelBorder} opacity-50`;
          }
          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={isRevealed}
              className={`w-full text-left rounded-xl border px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.98] ${cls}`}
            >
              <span className={`font-bold ${t.faint} mr-2`}>{String.fromCharCode(65 + i)}.</span>
              {opt}
              {isRevealed && i === data.correctIndex && <span className="ml-2 text-emerald-400">✓</span>}
              {isRevealed && i === selectedIndex && i !== data.correctIndex && <span className="ml-2 text-rose-400">✗</span>}
            </button>
          );
        })}
      </div>
      {isRevealed && data.explanation && (
        <div className={`mt-3 rounded-xl ${t.panel} border ${t.panelBorder} p-3`}>
          <p className={`text-[11px] ${t.muted} italic leading-relaxed`}>{data.explanation}</p>
        </div>
      )}
    </div>
  );
};

export default TriviaCard;
