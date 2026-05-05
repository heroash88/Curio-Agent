import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { Card } from '../../services/cardTypes';
import { X } from 'lucide-react';

interface AnimatedCardProps {
  card: Card;
  children: React.ReactNode;
  onDismiss: () => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
}

const SWIPE_DISMISS_THRESHOLD = 0.4;
const SPRING_BACK_MS = 200;
const ENTRANCE_MS = 350;
const EXIT_MS = 250;

const AnimatedCard: React.FC<AnimatedCardProps> = ({
  card,
  children,
  onDismiss,
  onInteractionStart,
  onInteractionEnd,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [willChange, setWillChange] = useState(false);
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);

  // Swipe state
  const swipeStartX = useRef<number | null>(null);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [springBack, setSpringBack] = useState(false);

  // Entrance animation
  useEffect(() => {
    if (card.animationState === 'entering') {
      setWillChange(true);
      // Force a frame so the initial transform is applied before transitioning
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setEntered(true);
        });
      });
    }
  }, [card.animationState]);

  // Exit animation
  useEffect(() => {
    if (card.animationState === 'exiting') {
      setWillChange(true);
      setExiting(true);
    }
  }, [card.animationState]);

  const handleTransitionEnd = useCallback(() => {
    setWillChange(false);
  }, []);

  // Swipe handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      swipeStartX.current = e.clientX;
      setIsSwiping(false);
      setSpringBack(false);
      vibratedRef.current = false;
      onInteractionStart();
    },
    [onInteractionStart],
  );

  // Track whether we already vibrated for this swipe gesture
  const vibratedRef = useRef(false);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (swipeStartX.current === null) return;
    const dx = e.clientX - swipeStartX.current;
    setSwipeX(dx);
    setIsSwiping(true);

    // Haptic feedback when crossing the dismiss threshold
    const width = cardWidthRef.current;
    const pastThreshold = Math.abs(dx) > width * SWIPE_DISMISS_THRESHOLD;
    if (pastThreshold && !vibratedRef.current) {
      vibratedRef.current = true;
      try { navigator.vibrate?.(10); } catch {}
    } else if (!pastThreshold && vibratedRef.current) {
      // Reset if user drags back below threshold
      vibratedRef.current = false;
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    if (swipeStartX.current === null) {
      onInteractionEnd();
      return;
    }
    const width = cardWidthRef.current;
    if (Math.abs(swipeX) > width * SWIPE_DISMISS_THRESHOLD) {
      onDismiss();
    } else {
      setSpringBack(true);
      setSwipeX(0);
      setTimeout(() => setSpringBack(false), SPRING_BACK_MS);
    }
    swipeStartX.current = null;
    setIsSwiping(false);
    onInteractionEnd();
  }, [swipeX, onDismiss, onInteractionEnd]);

  const handlePointerCancel = useCallback(() => {
    swipeStartX.current = null;
    setSwipeX(0);
    setIsSwiping(false);
    onInteractionEnd();
  }, [onInteractionEnd]);

  // Compute swipe opacity (proportional reduction) — use cached width to avoid layout thrash
  const cardWidthRef = useRef(300);
  if (cardRef.current && !isSwiping) {
    // Only measure when not actively swiping to avoid per-frame layout
    cardWidthRef.current = cardRef.current.offsetWidth || 300;
  }
  const swipeProgress = cardWidthRef.current > 0 ? Math.abs(swipeX) / cardWidthRef.current : 0;
  const swipeOpacity = Math.max(0, 1 - swipeProgress);

  // Build transform + opacity
  let transform: string;
  let opacity: number;
  let transition: string;

  if (exiting) {
    transform = 'translateX(0) scale(0.95)';
    opacity = 0;
    transition = `transform ${EXIT_MS}ms ease-in, opacity ${EXIT_MS}ms ease-in`;
  } else if (!entered) {
    // Start slightly scaled down and transparent — no large translateY that causes reflow jump
    transform = 'scale(0.92) translateY(12px)';
    opacity = 0;
    transition = `transform ${ENTRANCE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${ENTRANCE_MS}ms ease-out`;
  } else if (isSwiping) {
    const scale = Math.max(0.92, 1 - swipeProgress * 0.1);
    transform = `translateX(${swipeX}px) scale(${scale})`;
    opacity = swipeOpacity;
    transition = 'none';
  } else if (springBack) {
    transform = 'translateX(0) scale(1)';
    opacity = 1;
    transition = `transform ${SPRING_BACK_MS}ms ease-out, opacity ${SPRING_BACK_MS}ms ease-out`;
  } else {
    transform = 'scale(1) translateY(0)';
    opacity = 1;
    transition = `transform ${ENTRANCE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${ENTRANCE_MS}ms ease-out`;
  }

  return (
    <div
      ref={cardRef}
      role="article"
      aria-label={`${card.type} card`}
      tabIndex={0}
      className="relative pointer-events-auto touch-pan-y"
      style={{
        transform,
        opacity,
        transition,
        willChange: willChange ? 'transform, opacity' : 'auto',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || e.key === 'Delete') {
          e.stopPropagation();
          onDismiss();
        }
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onTransitionEnd={handleTransitionEnd}
    >
      {/* Close button */}
      <button
        className="absolute -right-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-active-bg)] text-[var(--ether-control-active-text)] shadow-lg backdrop-blur-md transition-all hover:scale-105 active:scale-90"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        aria-label="Dismiss card"
      >
        <X size={12} strokeWidth={3} />
      </button>
      {children}
    </div>
  );
};

export default React.memo(AnimatedCard);
