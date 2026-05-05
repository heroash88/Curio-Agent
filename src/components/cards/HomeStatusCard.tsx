import React from 'react';
import type { CardComponentProps, HomeStatusCardData, HomeStatusItem } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const KIND_ICON: Record<string, string> = {
  door: '🚪', garage: '🏠', motion: '🏃', presence: '👤', window: '🪟',
};

function isActive(item: HomeStatusItem): boolean {
  const s = item.state.toLowerCase();
  return s === 'open' || s === 'on' || s === 'home' || s === 'detected';
}

function stateLabel(item: HomeStatusItem, kind: string): string {
  const s = item.state.toLowerCase();
  if (kind === 'motion') return s === 'on' || s === 'detected' ? 'Motion Detected' : 'Clear';
  if (kind === 'presence') return s === 'home' ? 'Home' : 'Away';
  if (kind === 'garage') return s === 'open' ? 'Open' : s === 'closed' ? 'Closed' : item.state;
  return s === 'on' || s === 'open' ? 'Open' : s === 'off' || s === 'closed' ? 'Closed' : item.state;
}

const HomeStatusCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as HomeStatusCardData;
  const icon = KIND_ICON[data.kind] || '🏠';
  const activeCount = data.items.filter(isActive).length;
  const hasActive = activeCount > 0;

  return (
    <div className="card-glass">
      {/* Accent bar */}
      <div className={`h-1 w-full ${hasActive ? 'bg-amber-500' : 'bg-emerald-500'}`} />
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${hasActive ? 'bg-amber-500/20' : 'bg-emerald-500/20'}`}>
              <span className="text-xl">{icon}</span>
            </div>
            <div>
              <p className="text-sm font-bold font-headline">{data.title}</p>
              <p className={`text-[10px] font-bold uppercase tracking-wider ${hasActive ? 'text-amber-400' : 'text-emerald-400'}`}>
                {data.kind === 'motion'
                  ? (hasActive ? `${activeCount} active` : 'All clear')
                  : data.kind === 'presence'
                  ? (hasActive ? `${activeCount} home` : 'Nobody home')
                  : (hasActive ? `${activeCount} open` : 'All closed')}
              </p>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="space-y-1.5">
          {data.items.map((item) => {
            const active = isActive(item);
            return (
              <div key={item.entityId}
                className={`flex items-center justify-between rounded-xl px-3 py-2 ${t.panel}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${active ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                  <span className="text-xs font-semibold truncate">{item.friendlyName}</span>
                  {item.area && <span className={`text-[9px] ${t.faint} shrink-0`}>{item.area}</span>}
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider shrink-0 ${active ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {stateLabel(item, data.kind)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default HomeStatusCard;
