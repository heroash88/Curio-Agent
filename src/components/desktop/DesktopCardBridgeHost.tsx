import React, { useCallback, useEffect, useState } from 'react';
import { getCurioDesktopBridge, getCurioDesktopRole } from '../../desktop/desktopBridge';
import type { DesktopCardAction } from '../../desktop/desktopTypes';
import { useCardManager } from '../../contexts/CardManagerContext';
import {
  getDesktopFloatingEnabled,
  setDesktopFloatingEnabled,
  useDesktopFloatingEnabled,
} from '../../utils/settingsStorage';

interface DesktopCardBridgeHostProps {
  onExternalizedChange?: (externalized: boolean) => void;
}

const hasElectronDesktopBridge = () =>
  typeof window !== 'undefined' &&
  Boolean(window.curioDesktop) &&
  getCurioDesktopRole() === 'app';

const DesktopCardBridgeHost: React.FC<DesktopCardBridgeHostProps> = ({ onExternalizedChange }) => {
  const { cards, dispatch, pauseTimer, resumeTimer } = useCardManager();
  const storedFloatingEnabled = useDesktopFloatingEnabled();
  const [externalized, setExternalized] = useState(
    () => hasElectronDesktopBridge() && getDesktopFloatingEnabled(),
  );

  useEffect(() => {
    if (!hasElectronDesktopBridge()) {
      setExternalized(false);
      return;
    }
    setExternalized(storedFloatingEnabled);
  }, [storedFloatingEnabled]);

  useEffect(() => {
    if (!hasElectronDesktopBridge()) return undefined;
    return getCurioDesktopBridge().onFloatingModeChange((active) => {
      setDesktopFloatingEnabled(active);
      setExternalized(active);
    });
  }, []);

  useEffect(() => {
    onExternalizedChange?.(externalized);
  }, [externalized, onExternalizedChange]);

  useEffect(() => {
    if (!hasElectronDesktopBridge()) return;
    getCurioDesktopBridge().publishCardsSnapshot({
      cards,
      externalized,
    });
  }, [cards, externalized]);

  const dismissCard = useCallback((cardId: string) => {
    const card = cards.find((entry) => entry.id === cardId);
    if (card?.type === 'camera') {
      window.dispatchEvent(new CustomEvent('ha-camera-closed'));
    }
    dispatch({ type: 'SET_ANIMATION_STATE', payload: { id: cardId, state: 'exiting' } });
    window.setTimeout(() => {
      dispatch({ type: 'REMOVE_CARD', payload: { id: cardId } });
    }, 300);
  }, [cards, dispatch]);

  const handleCardAction = useCallback((action: DesktopCardAction) => {
    if (action.type === 'dismiss') {
      dismissCard(action.cardId);
    } else if (action.type === 'interaction-start') {
      pauseTimer(action.cardId);
    } else if (action.type === 'interaction-end') {
      resumeTimer(action.cardId);
    } else if (action.type === 'update') {
      dispatch({ type: 'UPDATE_CARD', payload: { id: action.cardId, data: action.data } });
    }
  }, [dismissCard, dispatch, pauseTimer, resumeTimer]);

  useEffect(() => {
    if (!hasElectronDesktopBridge()) return undefined;
    return getCurioDesktopBridge().onCardAction(handleCardAction);
  }, [handleCardAction]);

  return null;
};

export default DesktopCardBridgeHost;
