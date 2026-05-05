import React, { useCallback, useEffect, useState } from 'react';
import { useCardManager } from '../../contexts/CardManagerContext';
import { interceptToolCall } from '../../services/cardInterceptor';
import type {
  CardComponentProps,
  MediaCardData,
  MediaSupportedAction,
} from '../../services/cardTypes';
import { resolveSupportedToolName } from '../../services/haWidgetSupport';
import { getHaPreparedSession } from '../../services/haMcpService';
import { useCardTheme } from '../../hooks/useCardTheme';

const STATE_BADGES: Record<string, string> = {
  playing: 'Play',
  paused: 'Paused',
  idle: 'Idle',
};

const ACTION_LABELS: Record<MediaSupportedAction, string> = {
  media_play: 'Play',
  media_pause: 'Pause',
  media_next_track: 'Next',
};

const ACTION_ICONS: Record<MediaSupportedAction, string> = {
  media_play: '▶',
  media_pause: '⏸',
  media_next_track: '⏭',
};

const MediaCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const { dispatch } = useCardManager();
  const initialData = card.data as unknown as MediaCardData;
  const [data, setData] = useState(initialData);
  const [availableActions, setAvailableActions] = useState<MediaSupportedAction[]>(
    initialData.supportedActions ?? [],
  );
  const [actionInFlight, setActionInFlight] = useState<MediaSupportedAction | null>(null);

  useEffect(() => {
    setData(initialData);
    setAvailableActions(initialData.supportedActions ?? []);
  }, [initialData]);

  useEffect(() => {
    let cancelled = false;

    const resolveActions = async () => {
      if (!data.entityId || !(data.supportedActions?.length)) {
        if (!cancelled) {
          setAvailableActions([]);
        }
        return;
      }

      try {
        const session = await getHaPreparedSession();
        if (!session) { if (!cancelled) setAvailableActions([]); return; }
        const supported = (data.supportedActions ?? []).filter((action) =>
          Boolean(resolveSupportedToolName(session.toolNames, action, 'media_player')),
        );
        if (!cancelled) {
          setAvailableActions(supported);
        }
      } catch {
        if (!cancelled) {
          setAvailableActions([]);
        }
      }
    };

    void resolveActions();

    return () => {
      cancelled = true;
    };
  }, [data.entityId, data.supportedActions]);

  const applyCardUpdate = useCallback((nextData: MediaCardData) => {
    setData(nextData);
    dispatch({
      type: 'UPDATE_CARD',
      payload: {
        id: card.id,
        data: nextData as unknown as Partial<typeof card.data>,
      },
    });
  }, [card.id, dispatch]);

  const handleAction = useCallback(async (requestedAction: MediaSupportedAction) => {
    if (actionInFlight || !data.entityId) return;
    setActionInFlight(requestedAction);

    try {
      const session = await getHaPreparedSession();
      if (!session) return;
      const toolName = resolveSupportedToolName(session.toolNames, requestedAction, 'media_player');
      if (!toolName) {
        return;
      }

      const geminiToolName = `homeassistant__${toolName.replace(/\./g, '__')}`;
      const args: Record<string, string> = { entity_id: data.entityId };
      if (toolName.startsWith('Hass')) {
        const entity = session.client.entityCache.find(e => e.entity_id === data.entityId);
        if (entity) args.name = entity.name;
      }
      const result = await session.client.callTool(geminiToolName, args);
      const updatedCard = interceptToolCall(geminiToolName, args, result, session.client.entityCache);
      if (updatedCard?.type === 'media') {
        applyCardUpdate(updatedCard.data as unknown as MediaCardData);
      }
    } catch (error) {
      console.warn('[MediaCard] Action failed:', error);
    } finally {
      setActionInFlight(null);
    }
  }, [actionInFlight, applyCardUpdate, data.entityId]);

  const badge = STATE_BADGES[data.playbackState] ?? data.playbackState;

  return (
    <div className="card-glass">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="truncate text-base font-bold font-headline">{data.playerName}</p>
        <span className={`rounded-full ${t.panel} px-3 py-1 text-sm`}>
          {badge}
        </span>
      </div>

      {data.trackTitle && (
        <p className="truncate text-base">{data.trackTitle}</p>
      )}
      {data.artistName && (
        <p className={`truncate text-sm ${t.muted}`}>{data.artistName}</p>
      )}

      {availableActions.length > 0 ? (
        <div className="mt-4 flex items-center gap-3">
          {availableActions.map((action) => (
            <button
              key={action}
              onClick={() => void handleAction(action)}
              disabled={Boolean(actionInFlight)}
              className={`flex items-center gap-2 rounded-full ${t.btn} px-4 py-2 text-sm font-semibold transition-all active:scale-95 disabled:opacity-50`}
              aria-label={`${ACTION_LABELS[action]} ${data.playerName}`}
            >
              <span className="text-lg leading-none">{ACTION_ICONS[action]}</span>
              <span>{actionInFlight === action ? 'Working...' : ACTION_LABELS[action]}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className={`mt-4 text-sm ${t.muted}`}>Read-only status</p>
      )}
    </div>
  );
};

export default React.memo(MediaCard);

