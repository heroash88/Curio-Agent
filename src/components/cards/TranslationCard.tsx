import React from 'react';
import type { CardComponentProps, TranslationCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

function capitalizeLang(lang: string): string {
  if (!lang) return lang;
  return lang.charAt(0).toUpperCase() + lang.slice(1);
}

const TranslationCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as TranslationCardData;

  const sourceLang = data.sourceLanguage && data.sourceLanguage.toLowerCase() !== 'unknown'
    ? capitalizeLang(data.sourceLanguage)
    : 'Auto-detected';
  const targetLang = capitalizeLang(data.targetLanguage || 'Unknown');

  return (
    <div className="card-glass">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🌐</span>
        <span className={`${t.text} font-bold font-headline text-sm`}>Translation</span>
      </div>
      <div className="flex items-stretch gap-3">
        <div className={`flex-1 rounded-xl ${t.panel} p-3`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${t.faint} mb-1`}>{sourceLang}</p>
          <p className={`text-sm ${t.text2} leading-relaxed`}>{data.originalText}</p>
        </div>
        <div className="flex items-center shrink-0">
          <span className={`${t.faint} text-lg`}>→</span>
        </div>
        <div className={`flex-1 rounded-xl p-3 ${t.dark ? 'bg-emerald-500/10 border border-emerald-500/15' : 'bg-emerald-50 border border-emerald-200'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${t.dark ? 'text-emerald-400/60' : 'text-emerald-600'}`}>{targetLang}</p>
          <p className={`text-sm leading-relaxed ${t.dark ? 'text-emerald-200' : 'text-emerald-700'}`}>{data.translatedText}</p>
        </div>
      </div>
    </div>
  );
};

export default React.memo(TranslationCard);
