import React, { useEffect, useState, useRef } from 'react';
import { useGoogleTasksAccessToken } from '../../utils/settingsStorage';
import { createGoogleTask } from '../../services/googleTasksAPI';
import type { CardComponentProps, ReminderCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const SYNC_LABELS: Record<string, { icon: string; label: string; cls: string }> = {
  pending: { icon: '⏳', label: 'Syncing...', cls: 'text-white/60' },
  synced:  { icon: '☁️', label: 'Google Tasks', cls: 'text-emerald-400' },
  failed:  { icon: '⚠️', label: 'Sync failed', cls: 'text-red-400' },
  local:   { icon: '📌', label: 'Local only', cls: 'text-sky-400' },
};

const ReminderCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as ReminderCardData;
  const googleTasksAccessToken = useGoogleTasksAccessToken();
  const [syncStatus, setSyncStatus] = useState<'pending' | 'synced' | 'local' | 'failed'>('pending');
  const hasAttemptedSync = useRef(false);

  useEffect(() => {
    let isMounted = true;

    if (!googleTasksAccessToken) {
      if (isMounted) setSyncStatus('local');
      return;
    }

    if (hasAttemptedSync.current) return;
    hasAttemptedSync.current = true;

    const syncTask = async () => {
      try {
        await createGoogleTask(googleTasksAccessToken, data.text, data.scheduledTime, data.dueDateTime);
        if (isMounted) setSyncStatus('synced');
      } catch (err) {
        console.error("Failed to sync reminder to Google Tasks:", err);
        if (isMounted) setSyncStatus('failed');
      }
    };

    syncTask();
    return () => { isMounted = false; };
  }, [googleTasksAccessToken, data.text, data.scheduledTime, data.dueDateTime]);

  const badge = SYNC_LABELS[syncStatus] || SYNC_LABELS.local;

  return (
    <div className="card-glass overflow-hidden">
      {/* Accent header strip */}
      <div className="bg-violet-500/15 px-5 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/20 border border-violet-500/25">
            <span className="text-xl">🔔</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold font-headline">Reminder</p>
            <p className={`text-[10px] font-medium ${t.faint}`}>{data.scheduledTime}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        <p className={`text-[14px] leading-relaxed ${t.text2}`}>{data.text}</p>

        {/* Sync badge */}
        <div className="mt-3 flex items-center gap-1.5">
          <span className="text-xs">{badge.icon}</span>
          <span className={`text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ReminderCard);
