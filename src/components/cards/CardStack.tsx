import React, {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { useCardManager } from "../../contexts/CardManagerContext";
import AnimatedCard from "./AnimatedCard";
import FallbackCard from "./FallbackCard";
import { CardErrorBoundary } from "./CardErrorBoundary";

const FLIP_DURATION_MS = 350;
const FLIP_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

const CardStack: React.FC = () => {
  const { cards, dispatch, registry, pauseTimer, resumeTimer } =
    useCardManager();

  // ── FLIP animation: smooth position shifts when cards are inserted/removed ──
  // Stores the bounding rect (top) of each card element keyed by card id.
  const prevRectsRef = useRef<Map<string, number>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Snapshot positions BEFORE React commits new DOM (useLayoutEffect runs synchronously after render but before paint)
  // We capture in a ref that persists across renders.
  // The snapshot is taken at the END of each commit cycle for the NEXT render.
  const MAX_VISIBLE_TOP_CARDS = 3;
  const { topCards, musicCards, overflowCount } = useMemo(() => {
    const music = cards.filter((c) => c.type === "music");
    const top = cards.filter((c) => c.type !== "music");
    const overflow = Math.max(0, top.length - MAX_VISIBLE_TOP_CARDS);
    return {
      topCards: top.slice(0, MAX_VISIBLE_TOP_CARDS),
      musicCards: music,
      overflowCount: overflow,
    };
  }, [cards]);

  const topCardLayoutSignature = useMemo(
    () => topCards.map((card) => card.id).join("|"),
    [topCards],
  );

  useEffect(() => {
    // After paint: record current positions for the next FLIP cycle
    const container = containerRef.current;
    if (!container) return;
    const rects = new Map<string, number>();
    for (const child of Array.from(container.children) as HTMLElement[]) {
      const id = child.dataset.cardId;
      if (id) rects.set(id, child.getBoundingClientRect().top);
    }
    prevRectsRef.current = rects;
  }, [topCardLayoutSignature]);

  // After DOM update: compare new positions to old, apply inverse transform, animate to 0
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const prevRects = prevRectsRef.current;
    if (prevRects.size === 0) return;

    for (const child of Array.from(container.children) as HTMLElement[]) {
      const id = child.dataset.cardId;
      if (!id) continue;
      const prevTop = prevRects.get(id);
      if (prevTop === undefined) continue; // new card — handled by AnimatedCard entrance

      const currentTop = child.getBoundingClientRect().top;
      const deltaY = prevTop - currentTop;
      if (Math.abs(deltaY) < 1) continue; // no meaningful shift

      // Invert: place the element at its old position
      child.style.transform = `translateY(${deltaY}px)`;
      child.style.transition = "none";

      // Play: animate to the new position
      requestAnimationFrame(() => {
        child.style.transition = `transform ${FLIP_DURATION_MS}ms ${FLIP_EASING}`;
        child.style.transform = "";
        // Clean up inline styles after animation completes
        const cleanup = () => {
          child.style.transition = "";
          child.removeEventListener("transitionend", cleanup);
        };
        child.addEventListener("transitionend", cleanup, { once: true });
      });
    }
  }, [topCardLayoutSignature]);

  const handleDismiss = useCallback(
    (cardId: string) => {
      const card = cards.find((c) => c.id === cardId);
      if (card?.type === "camera") {
        window.dispatchEvent(new CustomEvent("ha-camera-closed"));
      }
      dispatch({
        type: "SET_ANIMATION_STATE",
        payload: { id: cardId, state: "exiting" },
      });
      setTimeout(() => {
        dispatch({ type: "REMOVE_CARD", payload: { id: cardId } });
        requestAnimationFrame(() => {
          const nextCard = document.querySelector<HTMLElement>(
            '[role="article"][tabindex="0"]',
          );
          if (nextCard) {
            nextCard.focus();
          } else {
            document.body.focus();
          }
        });
      }, 300);
    },
    [dispatch, cards],
  );

  const handleInteractionStart = useCallback(
    (cardId: string) => {
      pauseTimer(cardId);
    },
    [pauseTimer],
  );

  const handleInteractionEnd = useCallback(
    (cardId: string) => {
      resumeTimer(cardId);
    },
    [resumeTimer],
  );

  // Stable per-card callback refs
  const dismissHandlersRef = useRef<Map<string, () => void>>(new Map());
  const interactionStartHandlersRef = useRef<Map<string, () => void>>(
    new Map(),
  );
  const interactionEndHandlersRef = useRef<Map<string, () => void>>(new Map());

  const getCardCallbacks = useCallback(
    (cardId: string) => {
      if (!dismissHandlersRef.current.has(cardId)) {
        dismissHandlersRef.current.set(cardId, () => handleDismiss(cardId));
      }
      if (!interactionStartHandlersRef.current.has(cardId)) {
        interactionStartHandlersRef.current.set(cardId, () =>
          handleInteractionStart(cardId),
        );
      }
      if (!interactionEndHandlersRef.current.has(cardId)) {
        interactionEndHandlersRef.current.set(cardId, () =>
          handleInteractionEnd(cardId),
        );
      }
      return {
        onDismiss: dismissHandlersRef.current.get(cardId)!,
        onInteractionStart: interactionStartHandlersRef.current.get(cardId)!,
        onInteractionEnd: interactionEndHandlersRef.current.get(cardId)!,
      };
    },
    [handleDismiss, handleInteractionStart, handleInteractionEnd],
  );

  useEffect(() => {
    const currentIds = new Set(cards.map((c) => c.id));
    for (const id of dismissHandlersRef.current.keys()) {
      if (!currentIds.has(id)) {
        dismissHandlersRef.current.delete(id);
        interactionStartHandlersRef.current.delete(id);
        interactionEndHandlersRef.current.delete(id);
      }
    }
  }, [cards]);

  const renderCard = useCallback(
    (card: (typeof cards)[0]) => {
      const registration = registry.get(card.type);
      const CardComponent = registration?.component ?? FallbackCard;
      const cbs = getCardCallbacks(card.id);
      return (
        <div key={card.id} data-card-id={card.id}>
          <AnimatedCard
            card={card}
            onDismiss={cbs.onDismiss}
            onInteractionStart={cbs.onInteractionStart}
            onInteractionEnd={cbs.onInteractionEnd}
          >
            <Suspense fallback={null}>
              <CardErrorBoundary cardType={card.type} onDismiss={cbs.onDismiss}>
                <CardComponent
                  card={card}
                  onDismiss={cbs.onDismiss}
                  onInteractionStart={cbs.onInteractionStart}
                  onInteractionEnd={cbs.onInteractionEnd}
                />
              </CardErrorBoundary>
            </Suspense>
          </AnimatedCard>
        </div>
      );
    },
    [registry, getCardCallbacks],
  );

  if (cards.length === 0) return null;

  return (
    <>
      {topCards.length > 0 && (
        <div
          ref={containerRef}
          className="fixed left-0 right-0 top-[calc(0.75rem+env(safe-area-inset-top,0px))] z-[60] mx-auto flex max-w-[min(48rem,calc(100%-1rem))] flex-col items-center gap-2.5 px-3 pointer-events-none sm:top-[calc(1rem+env(safe-area-inset-top,0px))] sm:gap-3 sm:px-4"
        >
          {topCards.map(renderCard)}
          {overflowCount > 0 && (
            <div className="pointer-events-none rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] px-3 py-1 text-[10px] font-bold text-[var(--ether-on-surface-variant)] backdrop-blur-sm">
              +{overflowCount} more
            </div>
          )}
        </div>
      )}

      {musicCards.length > 0 && (
        <div className="fixed bottom-5 left-4 z-[55] flex flex-col items-start gap-3 pointer-events-none sm:bottom-6 sm:left-6">
          {musicCards.map(renderCard)}
        </div>
      )}
    </>
  );
};

export default CardStack;
