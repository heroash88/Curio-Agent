import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurioDesktopBridge } from '../../desktop/desktopBridge';
import { useTransparentDesktopSurface } from '../../desktop/useTransparentDesktopSurface';
import type { DesktopCardsSnapshot } from '../../desktop/desktopTypes';
import type { Card, CardAction, CardManagerContextValue } from '../../services/cardTypes';
import { CARD_REGISTRY } from '../../services/cardRegistry';
import { CardManagerContext } from '../../contexts/CardManagerContext';
import { TimerTickProvider } from '../../hooks/useTimerTick';
import AnimatedCard from '../cards/AnimatedCard';
import FallbackCard from '../cards/FallbackCard';
import { CardErrorBoundary } from '../cards/CardErrorBoundary';

const MAX_VISIBLE_TOP_CARDS = 3;

const estimateCardsWindowHeight = (cardCount: number, overflowCount: number) => {
  if (cardCount <= 0) return 140;
  const stackHeight = cardCount === 1 ? 240 : cardCount === 2 ? 340 : 430;
  return stackHeight + (overflowCount > 0 ? 34 : 0);
};

const DesktopCardOverlayApp: React.FC = () => {
  useTransparentDesktopSurface();
  const bridge = useMemo(() => getCurioDesktopBridge(), []);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const [snapshot, setSnapshot] = useState<DesktopCardsSnapshot>({ cards: [], externalized: false });

  useEffect(() => bridge.onCardsSnapshot(setSnapshot), [bridge]);

  useEffect(() => {
    let passthrough: boolean | null = null;
    const setPassthrough = (enabled: boolean) => {
      if (passthrough === enabled) return;
      passthrough = enabled;
      bridge.setCardsWindowMousePassthrough?.(enabled);
    };
    // Accept both PointerEvent and MouseEvent so we cover Windows, where
    // Electron's setIgnoreMouseEvents(true, { forward: true }) forwards
    // native mousemove messages but does not always produce pointermove
    // events on fully transparent windows. Without the mousemove path
    // the overlay never detects the cursor entering a card and never
    // toggles off passthrough, leaving cards unclickable.
    const updatePassthrough = (event: PointerEvent | MouseEvent) => {
      const target = document.elementFromPoint?.(event.clientX, event.clientY);
      const overCard = target instanceof Element && Boolean(target.closest('[data-desktop-card-hitbox="true"]'));
      setPassthrough(!overCard);
    };
    const enablePassthrough = () => setPassthrough(true);

    enablePassthrough();
    window.addEventListener('pointermove', updatePassthrough);
    window.addEventListener('pointerleave', enablePassthrough);
    window.addEventListener('mousemove', updatePassthrough);
    window.addEventListener('mouseleave', enablePassthrough);
    window.addEventListener('blur', enablePassthrough);
    return () => {
      window.removeEventListener('pointermove', updatePassthrough);
      window.removeEventListener('pointerleave', enablePassthrough);
      window.removeEventListener('mousemove', updatePassthrough);
      window.removeEventListener('mouseleave', enablePassthrough);
      window.removeEventListener('blur', enablePassthrough);
      enablePassthrough();
    };
  }, [bridge]);

  const cards = snapshot.externalized ? snapshot.cards : [];
  const topCards = useMemo(() => {
    const nonMusicCards = cards.filter((card) => card.type !== 'music');
    return (nonMusicCards.length > 0 ? nonMusicCards : cards).slice(0, MAX_VISIBLE_TOP_CARDS);
  }, [cards]);
  const overflowCount = Math.max(0, cards.length - topCards.length);

  useEffect(() => {
    if (!snapshot.externalized || topCards.length === 0) {
      bridge.setCardsWindowLayout?.({ height: estimateCardsWindowHeight(0, 0) });
      return;
    }

    const stack = stackRef.current;
    if (!stack) return;

    let frame: number | null = null;
    const publishHeight = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const rect = stack.getBoundingClientRect();
        const measuredHeight = Math.ceil(rect.bottom + 16);
        bridge.setCardsWindowLayout?.({
          height: Math.max(estimateCardsWindowHeight(topCards.length, overflowCount), measuredHeight),
        });
      });
    };

    publishHeight();

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        if (frame !== null) window.cancelAnimationFrame(frame);
      };
    }

    const observer = new ResizeObserver(publishHeight);
    observer.observe(stack);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [bridge, overflowCount, snapshot.externalized, topCards.length]);

  const sendAction = useCallback((action: { type: 'dismiss' | 'interaction-start' | 'interaction-end'; cardId: string }) => {
    bridge.sendCardAction(action);
  }, [bridge]);

  const dispatchCardAction = useCallback<React.Dispatch<CardAction>>((action) => {
    if (action.type !== 'UPDATE_CARD') return;
    setSnapshot((current) => ({
      ...current,
      cards: current.cards.map((card) =>
        card.id === action.payload.id
          ? { ...card, data: { ...card.data, ...action.payload.data } }
          : card,
      ),
    }));
    bridge.sendCardAction({
      type: 'update',
      cardId: action.payload.id,
      data: action.payload.data,
    });
  }, [bridge]);

  const cardManagerValue = useMemo<CardManagerContextValue>(
    () => ({
      cards,
      dispatch: dispatchCardAction,
      emitCardEvent: () => {},
      enabled: true,
      pauseTimer: (cardId: string) => sendAction({ type: 'interaction-start', cardId }),
      registerCardType: () => {},
      registry: CARD_REGISTRY,
      resumeTimer: (cardId: string) => sendAction({ type: 'interaction-end', cardId }),
    }),
    [cards, dispatchCardAction, sendAction],
  );

  const renderCard = useCallback((card: Card) => {
    const registration = CARD_REGISTRY.get(card.type);
    const CardComponent = registration?.component ?? FallbackCard;
    const onDismiss = () => sendAction({ type: 'dismiss', cardId: card.id });
    const onInteractionStart = () => sendAction({ type: 'interaction-start', cardId: card.id });
    const onInteractionEnd = () => sendAction({ type: 'interaction-end', cardId: card.id });

    return (
      <div key={card.id} data-card-id={card.id} data-desktop-card-hitbox="true">
        <AnimatedCard
          card={card}
          onDismiss={onDismiss}
          onInteractionStart={onInteractionStart}
          onInteractionEnd={onInteractionEnd}
        >
          <Suspense fallback={null}>
            <CardErrorBoundary cardType={card.type} onDismiss={onDismiss}>
              <CardComponent
                card={card}
                onDismiss={onDismiss}
                onInteractionStart={onInteractionStart}
                onInteractionEnd={onInteractionEnd}
              />
            </CardErrorBoundary>
          </Suspense>
        </AnimatedCard>
      </div>
    );
  }, [sendAction]);

  return (
    <TimerTickProvider>
      <CardManagerContext.Provider value={cardManagerValue}>
        <div className="desktop-card-overlay h-dvh w-dvw overflow-hidden bg-transparent">
          {topCards.length > 0 && (
            <div
              ref={stackRef}
              className="fixed left-0 right-0 top-[calc(0.75rem+env(safe-area-inset-top,0px))] z-[60] mx-auto flex max-w-[min(48rem,calc(100%-1rem))] flex-col items-center gap-2.5 px-3 pointer-events-none sm:top-[calc(1rem+env(safe-area-inset-top,0px))] sm:gap-3 sm:px-4"
              data-desktop-card-stack="true"
            >
              {topCards.map(renderCard)}
              {overflowCount > 0 && (
                <div className="pointer-events-none rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] px-3 py-1 text-[10px] font-bold text-[var(--ether-on-surface-variant)] backdrop-blur-sm">
                  +{overflowCount} more
                </div>
              )}
            </div>
          )}
        </div>
      </CardManagerContext.Provider>
    </TimerTickProvider>
  );
};

export default DesktopCardOverlayApp;
