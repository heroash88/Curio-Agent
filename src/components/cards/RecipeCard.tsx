import React, { useState } from 'react';
import type { CardComponentProps, RecipeCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const RecipeCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as RecipeCardData;
  const ingredients = data.ingredients || [];
  const steps = data.steps || [];
  const [tab, setTab] = useState<'ingredients' | 'steps'>(
    ingredients.length > 0 ? 'ingredients' : 'steps'
  );

  return (
    <div className="card-glass overflow-hidden min-w-[360px]">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500/20">
            <span className="text-lg">🍳</span>
          </div>
          <div>
            <p className="text-sm font-bold font-headline">{data.title || 'Recipe'}</p>
            <p className={`text-[10px] font-medium ${t.faint}`}>
              {ingredients.length} ingredients · {steps.length} steps
            </p>
          </div>
        </div>

        {/* Tabs */}
        {ingredients.length > 0 && steps.length > 0 && (
          <div className={`flex gap-1 rounded-xl ${t.panel} p-1`}>
            <button onClick={() => setTab('ingredients')}
              className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${tab === 'ingredients' ? `${t.btn} ${t.text}` : `${t.faint} hover:${t.muted}`}`}>
              Ingredients
            </button>
            <button onClick={() => setTab('steps')}
              className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${tab === 'steps' ? `${t.btn} ${t.text}` : `${t.faint} hover:${t.muted}`}`}>
              Steps
            </button>
          </div>
        )}
      </div>

      {/* Content — scrollable */}
      <div className="px-5 pb-5 max-h-[50vh] overflow-y-auto">
        {tab === 'ingredients' && ingredients.length > 0 && (
          <div className="space-y-1.5 mt-3">
            {ingredients.map((item, i) => (
              <div key={i} className={`flex items-start gap-2.5 rounded-xl ${t.panel} px-3 py-2`}>
                <span className="text-orange-400/60 text-xs mt-0.5">•</span>
                <span className={`text-sm ${t.text2}`}>{item}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'steps' && steps.length > 0 && (
          <div className="space-y-2 mt-3">
            {steps.map((step, i) => (
              <div key={i} className={`flex items-start gap-3 rounded-xl ${t.panel} px-3 py-2.5`}>
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-sky-400 text-xs font-bold shrink-0">
                  {i + 1}
                </div>
                <span className={`text-sm ${t.text2} leading-relaxed`}>{step}</span>
              </div>
            ))}
          </div>
        )}

        {ingredients.length === 0 && steps.length === 0 && (
          <p className={`text-sm ${t.faint} italic text-center py-4`}>No recipe details available</p>
        )}
      </div>
    </div>
  );
};

export default React.memo(RecipeCard);
