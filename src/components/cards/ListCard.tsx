import React, { useCallback, useState } from 'react';
import type { CardComponentProps, ListCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';
// notesPersistence is lazy-loaded -- only needed when user clicks delete
const loadNotesPersistence = () => import('../../services/notesPersistence');

const ICON_MAP: Record<string, string> = {
  'note': '📝',
  'notes': '📝',
  'reminder': '🔔',
  'reminders': '🔔',
  'timer': '⏱️',
  'default': '📋',
};

function pickIcon(title: string): string {
  const lower = title.toLowerCase();
  for (const [key, icon] of Object.entries(ICON_MAP)) {
    if (lower.includes(key)) return icon;
  }
  return ICON_MAP.default;
}

function pickAccent(title: string): { bg: string; border: string; dot: string } {
  const lower = title.toLowerCase();
  if (lower.includes('note')) return { bg: 'bg-amber-500/15', border: 'border-amber-500/20', dot: 'bg-amber-400' };
  if (lower.includes('reminder')) return { bg: 'bg-violet-500/15', border: 'border-violet-500/20', dot: 'bg-violet-400' };
  if (lower.includes('timer')) return { bg: 'bg-rose-500/15', border: 'border-rose-500/20', dot: 'bg-rose-400' };
  return { bg: 'bg-sky-500/15', border: 'border-sky-500/20', dot: 'bg-sky-400' };
}

const ListCard: React.FC<CardComponentProps> = ({ card, onDismiss, onInteractionStart, onInteractionEnd }) => {
  const t = useCardTheme();
  const data = card.data as unknown as ListCardData;
  const [localItems, setLocalItems] = useState(() => (data.items || []).map((text, i) => ({
    text,
    id: data.itemIds?.[i] || null,
  })));
  const canDelete = data.deletable && data.itemIds;
  const title = data.title || 'List';
  const icon = pickIcon(title);
  const accent = pickAccent(title);

  const handleDelete = useCallback((index: number) => {
    onInteractionStart();
    const item = localItems[index];
    if (item.id) {
      const itemId = item.id;
      // Use the right persistence function based on list type
      if (title.toLowerCase().includes('reminder')) {
        loadNotesPersistence().then(m => m.deleteReminder(itemId)).catch(() => {});
      } else {
        loadNotesPersistence().then(m => m.deleteNote(itemId)).catch(() => {});
      }
    }
    const next = localItems.filter((_, i) => i !== index);
    setLocalItems(next);
    if (next.length === 0) {
      setTimeout(onDismiss, 300);
    }
    setTimeout(onInteractionEnd, 300);
  }, [localItems, title, onDismiss, onInteractionStart, onInteractionEnd]);

  return (
    <div className="card-glass overflow-hidden min-w-[360px]">
      {/* Header */}
      <div className={`px-5 pt-5 pb-3 ${accent.bg}`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${accent.bg} border ${accent.border}`}>
            <span className="text-xl">{icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold font-headline truncate ${t.text}`}>{title}</p>
            <p className={`text-[10px] font-medium ${t.faint}`}>{localItems.length} item{localItems.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="px-5 py-4 space-y-0.5">
        {localItems.map((item, i) => (
          <div key={item.id || i} className="flex gap-3 items-center py-2 group">
            <span className={`h-2 w-2 rounded-full ${accent.dot} opacity-70 shrink-0`} />
            <p className={`text-[13px] leading-relaxed ${t.text2} flex-1`}>{item.text}</p>
            {canDelete && (
              <button
                onClick={() => handleDelete(i)}
                className={`opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded-full ${t.btn} transition-all active:scale-90 shrink-0`}
                aria-label="Delete item"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(ListCard);
