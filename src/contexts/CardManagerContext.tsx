import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import type { ReactNode } from "react";
import type {
  Card,
  CardAction,
  CardEvent,
  CardManagerContextValue,
  CardTypeRegistration,
} from "../services/cardTypes";
import { useResponseCardsEnabled } from "../utils/settingsStorage";
import { getCardEnabled } from "../utils/settingsStorage";
import {
  restoreTimers,
  TIMERS_EVENT,
} from "../services/timerPersistence";
import { randomId } from "../utils/randomId";
import { CARD_REGISTRY } from "../services/cardRegistry";
import { trackDashboardActivityEvent } from "../services/screenTimePersistence";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_CARDS = 5;
const DEFAULT_AUTO_DISMISS_MS = 15000;
const UNSET_AUTO_DISMISS_MS = -1;
const STAGGER_WINDOW_MS = 200;
const STAGGER_DELAY_MS = 100;

// ---------------------------------------------------------------------------
// Human-readable summary of currently visible cards. Kept short -- the model
// only needs to know what the user can already see, not the full card data.
// ---------------------------------------------------------------------------
function buildCardSummary(cards: Card[]): string {
  if (cards.length === 0) return "no cards visible";
  const parts: string[] = [];
  for (const c of cards) {
    const d = c.data || {};
    const label =
      (typeof d.title === "string" && d.title) ||
      (typeof d.label === "string" && d.label) ||
      (typeof d.name === "string" && d.name) ||
      (typeof d.query === "string" && d.query) ||
      (typeof d.city === "string" && d.city) ||
      (typeof d.entityId === "string" && d.entityId) ||
      "";
    parts.push(label ? `${c.type}: ${String(label).slice(0, 60)}` : c.type);
  }
  return parts.join("; ");
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------
interface CardManagerState {
  cards: Card[];
}

const initialState: CardManagerState = { cards: [] };

const stableStringify = (value: unknown): string => {
  if (typeof value === "undefined") return '"__undefined__"';
  if (typeof value === "function") return '"__function__"';
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
};

export const buildCardEventDedupKey = (event: CardEvent): string =>
  stableStringify({
    type: event.type,
    data: event.data,
    autoDismissMs: event.autoDismissMs ?? null,
    persistent: event.persistent ?? null,
  });

export function cardReducer(
  state: CardManagerState,
  action: CardAction,
): CardManagerState {
  switch (action.type) {
    case "ADD_CARD": {
      const event = action.payload;
      const entityId =
        event.type === "device" || event.type === "media"
          ? typeof event.data?.entityId === "string"
            ? event.data.entityId
            : ""
          : event.type === "music"
            ? typeof event.data?.playerId === "string"
              ? event.data.playerId
              : ""
            : "";
      const nextAutoDismissMs = event.autoDismissMs ?? UNSET_AUTO_DISMISS_MS;

      // Multi-instance card types: these legitimately stack because each
      // instance represents a distinct physical thing (a specific device,
      // a specific player, a specific timer). They dedupe separately by
      // entityId / playerId / label above.
      //
      // EVERY OTHER card type is treated as a singleton -- re-emitting the
      // same type updates the existing card in place instead of stacking.
      // This is the default so new card types automatically get the right
      // behavior without anyone having to remember to add them to a list.
      const MULTI_INSTANCE_TYPES = new Set([
        "device",
        "media",
        "music",
        "timer",
      ]);
      const isSingleton = !MULTI_INSTANCE_TYPES.has(event.type);

      if (entityId) {
        const existing = state.cards.find((card) => {
          if (card.type !== event.type) return false;

          const cardId =
            card.type === "music" ? card.data.playerId : card.data.entityId;

          return cardId === entityId;
        });

        if (existing) {
          const updated: Card = {
            ...existing,
            data: event.data,
            createdAt: Date.now(),
            autoDismissMs: nextAutoDismissMs,
            persistent: event.persistent ?? existing.persistent,
            animationState: "visible",
          };

          const next = [
            updated,
            ...state.cards.filter((card) => card.id !== existing.id),
          ].slice(0, MAX_CARDS);

          return { ...state, cards: next };
        }
      }

      // Singleton replace: reuse the existing card's id so React updates in
      // place instead of unmount/remount. This eliminates the visual jump
      // when the same card type is emitted twice in a conversation.
      if (isSingleton) {
        const existing = state.cards.find((c) => c.type === event.type);
        if (existing) {
          const updated: Card = {
            ...existing,
            data: event.data,
            createdAt: Date.now(),
            autoDismissMs: nextAutoDismissMs,
            persistent: event.persistent ?? existing.persistent,
            animationState: "visible",
          };
          const next = [
            updated,
            ...state.cards.filter((c) => c.id !== existing.id),
          ].slice(0, MAX_CARDS);
          return { ...state, cards: next };
        }
      }

      const newCard: Card = {
        id: randomId(),
        type: event.type,
        data: event.data,
        createdAt: Date.now(),
        autoDismissMs: nextAutoDismissMs,
        persistent: event.persistent ?? false,
        animationState: "entering",
      };
      // Newest-first: prepend
      let next = [newCard, ...state.cards];
      // Enforce max -- evict oldest (last in array)
      if (next.length > MAX_CARDS) {
        next = next.slice(0, MAX_CARDS);
      }
      return { ...state, cards: next };
    }

    case "REMOVE_CARD": {
      return {
        ...state,
        cards: state.cards.filter((c) => c.id !== action.payload.id),
      };
    }

    case "UPDATE_CARD": {
      return {
        ...state,
        cards: state.cards.map((c) =>
          c.id === action.payload.id
            ? { ...c, data: { ...c.data, ...action.payload.data } }
            : c,
        ),
      };
    }

    case "SET_ANIMATION_STATE": {
      return {
        ...state,
        cards: state.cards.map((c) =>
          c.id === action.payload.id
            ? { ...c, animationState: action.payload.state }
            : c,
        ),
      };
    }

    case "DISMISS_ALL": {
      return { ...state, cards: [] };
    }

    case "DISMISS_CAMERA": {
      return {
        ...state,
        cards: state.cards.filter((c) => c.type !== "camera"),
      };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
export const CardManagerContext = createContext<CardManagerContextValue | undefined>(
  undefined,
);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export const CardManagerProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const enabled = useResponseCardsEnabled();
  const [state, dispatch] = useReducer(cardReducer, initialState);
  const cardsRef = useRef<Card[]>(state.cards);

  // Card type registry — static, built at module load time (see cardRegistry.ts)
  const registryRef =
    useRef<ReadonlyMap<string, CardTypeRegistration>>(CARD_REGISTRY);

  // Keep registerCardType as a no-op for backward compatibility with the context interface.
  // No external consumers call it, but the type requires it.
  const registerCardType = useCallback(
    (_type: string, _registration: CardTypeRegistration) => {
      // Static registry — registration happens in cardRegistry.ts at module load time.
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Auto-dismiss timers
  // ---------------------------------------------------------------------------
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  // Track remaining time for interaction hold
  const timerMetaRef = useRef<
    Map<string, { startedAt: number; remaining: number }>
  >(new Map());

  const clearCardTimer = useCallback((cardId: string) => {
    const timer = timersRef.current.get(cardId);
    if (timer !== undefined) {
      clearTimeout(timer);
      timersRef.current.delete(cardId);
    }
    timerMetaRef.current.delete(cardId);
  }, []);

  const startCardTimer = useCallback(
    (cardId: string, durationMs: number) => {
      if (durationMs <= 0) {
        clearCardTimer(cardId);
        return;
      }
      clearCardTimer(cardId);
      const now = Date.now();
      timerMetaRef.current.set(cardId, {
        startedAt: now,
        remaining: durationMs,
      });
      const handle = setTimeout(() => {
        timersRef.current.delete(cardId);
        timerMetaRef.current.delete(cardId);
        dispatch({
          type: "SET_ANIMATION_STATE",
          payload: { id: cardId, state: "exiting" },
        });
        // Remove after exit animation completes (~250ms)
        setTimeout(() => {
          dispatch({ type: "REMOVE_CARD", payload: { id: cardId } });
        }, 300);
      }, durationMs);
      timersRef.current.set(cardId, handle);
    },
    [clearCardTimer],
  );

  useEffect(() => {
    cardsRef.current = state.cards;
  }, [state.cards]);

  // ---------------------------------------------------------------------------
  // Interaction hold: pause / resume
  // ---------------------------------------------------------------------------
  const holdStartRef = useRef<Map<string, number>>(new Map());

  const pauseTimer = useCallback(
    (cardId: string) => {
      // User physically interacted with the card — permanently cancel auto-dismiss
      clearCardTimer(cardId);
      holdStartRef.current.set(cardId, Date.now());
    },
    [clearCardTimer],
  );

  const resumeTimer = useCallback((cardId: string) => {
    // After user interaction, the card stays on screen until manually dismissed.
    // Just clean up the hold tracking — do NOT restart any timer.
    holdStartRef.current.delete(cardId);
  }, []);

  // ---------------------------------------------------------------------------
  // Dedup: prevent the exact same card event from being emitted twice in rapid succession.
  // This avoids the visual "bounce" caused by streaming + end-of-turn double emission.
  // ---------------------------------------------------------------------------
  const DEDUP_WINDOW_MS = 1500;
  const lastEmitByKeyRef = useRef<Map<string, number>>(new Map());

  // ---------------------------------------------------------------------------
  // Stagger entrance animations
  // ---------------------------------------------------------------------------
  const lastEmitTimeRef = useRef<number>(0);
  const pendingStaggerCountRef = useRef<number>(0);

  // ---------------------------------------------------------------------------
  // emitCardEvent
  // ---------------------------------------------------------------------------
  const emitCardEvent = useCallback(
    (event: CardEvent) => {
      if (!enabled) return;

      // Check per-card-type toggle
      if (typeof event.type === "string" && !getCardEnabled(event.type as any))
        return;

      // Dedup exact duplicates only. Distinct updates of the same type should
      // still land quickly so cards and dashboard widgets stay fresh.
      const now = Date.now();
      for (const [key, timestamp] of lastEmitByKeyRef.current) {
        if (now - timestamp > DEDUP_WINDOW_MS * 4) {
          lastEmitByKeyRef.current.delete(key);
        }
      }
      const dedupKey = buildCardEventDedupKey(event);
      const lastEmitForKey = lastEmitByKeyRef.current.get(dedupKey) ?? 0;
      if (
        now - lastEmitForKey < DEDUP_WINDOW_MS &&
        event.type !== "close_all" &&
        event.type !== "close_camera"
      ) {
        return;
      }
      lastEmitByKeyRef.current.set(dedupKey, now);

      // Special case: CLOSE_CARDS
      if (event.type === "close_all") {
        dispatch({ type: "DISMISS_ALL" });
        // Also clear all timers
        for (const [id] of timersRef.current) {
          clearCardTimer(id);
        }
        timerMetaRef.current.clear();
        holdStartRef.current.clear();
        return;
      }

      // Special case: close camera cards
      if (event.type === "close_camera") {
        // Use dispatch to remove all camera cards — avoids stale state.cards closure
        dispatch({ type: "DISMISS_CAMERA" });
        // Notify liveApiLive that the camera card is gone
        window.dispatchEvent(new CustomEvent("ha-camera-closed"));
        return;
      }

      trackDashboardActivityEvent("responseCard", {
        cardType: String(event.type),
      });

      const gap = now - lastEmitTimeRef.current;
      lastEmitTimeRef.current = now;

      if (gap < STAGGER_WINDOW_MS) {
        pendingStaggerCountRef.current += 1;
      } else {
        pendingStaggerCountRef.current = 0;
      }

      const staggerDelay = pendingStaggerCountRef.current * STAGGER_DELAY_MS;

      if (staggerDelay > 0) {
        setTimeout(() => {
          dispatch({ type: "ADD_CARD", payload: event });
        }, staggerDelay);
      } else {
        dispatch({ type: "ADD_CARD", payload: event });
      }
    },
    [enabled, clearCardTimer],
  );

  // ---------------------------------------------------------------------------
  // Alarm checker — fires alarms and emits ringing card
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    import("../services/alarmChecker").then(
      ({ startAlarmChecker, setAlarmCallback }) => {
        if (cancelled) return;
        setAlarmCallback((alarmId, label, time) => {
          emitCardEvent({
            type: "alarm",
            data: {
              alarms: [{ id: alarmId, label, time, enabled: true }],
              mode: "ringing",
              ringingAlarmId: alarmId,
            },
            persistent: true,
          });
        });
        startAlarmChecker();
      },
    );
    return () => {
      cancelled = true;
      import("../services/alarmChecker").then(({ stopAlarmChecker }) => {
        stopAlarmChecker();
      });
    };
  }, [emitCardEvent]);

  // ---------------------------------------------------------------------------
  // Pause auto-dismiss timers when tab is hidden, resume when visible
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Pause all active timers by clearing them and recording remaining time
        for (const [cardId, handle] of timersRef.current.entries()) {
          clearTimeout(handle);
          const meta = timerMetaRef.current.get(cardId);
          if (meta) {
            const elapsed = Date.now() - meta.startedAt;
            const remaining = Math.max(0, meta.remaining - elapsed);
            timerMetaRef.current.set(cardId, { ...meta, remaining });
          }
        }
        timersRef.current.clear();
      } else {
        // Resume all paused timers with their remaining time
        for (const [cardId, meta] of timerMetaRef.current.entries()) {
          if (meta.remaining > 0 && !timersRef.current.has(cardId)) {
            startCardTimer(cardId, meta.remaining);
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [startCardTimer]);

  // ---------------------------------------------------------------------------
  // Start auto-dismiss timers for newly added cards
  // ---------------------------------------------------------------------------
  const prevCardTimerKeysRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const currentIds = new Set(state.cards.map((c) => c.id));
    const currentTimerKeys = new Map<string, string>();

    for (const card of state.cards) {
      if (card.persistent) {
        clearCardTimer(card.id);
        currentTimerKeys.set(card.id, "persistent");
        continue;
      }

      const registration = registryRef.current.get(card.type);
      const duration =
        card.autoDismissMs >= 0
          ? card.autoDismissMs
          : (registration?.defaultAutoDismissMs ?? DEFAULT_AUTO_DISMISS_MS);
      const timerKey = `${card.createdAt}:${card.autoDismissMs}:${duration}`;
      currentTimerKeys.set(card.id, timerKey);
      if (prevCardTimerKeysRef.current.get(card.id) === timerKey) {
        continue;
      }

      if (duration > 0) {
        startCardTimer(card.id, duration);
      } else {
        clearCardTimer(card.id);
      }
    }
    // Clean up card auto-dismiss timers for removed cards. Timer persistence is
    // intentionally owned by timer actions, not by card visibility.
    for (const oldId of prevCardTimerKeysRef.current.keys()) {
      if (!currentIds.has(oldId)) {
        clearCardTimer(oldId);
      }
    }
    prevCardTimerKeysRef.current = currentTimerKeys;
  }, [state.cards, startCardTimer, clearCardTimer]);

  const completedTimerIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!enabled) return;

    const showDueTimers = () => {
      const persisted = restoreTimers({ includeExpired: true });
      const storedIds = new Set(persisted.map((timer) => timer.id));
      for (const timerId of completedTimerIdsRef.current) {
        if (!storedIds.has(timerId)) {
          completedTimerIdsRef.current.delete(timerId);
        }
      }

      const now = Date.now();
      for (const timer of persisted) {
        if (timer.targetTime > now || completedTimerIdsRef.current.has(timer.id)) {
          continue;
        }

        const alreadyVisible = cardsRef.current.some((card) => {
          if (card.type !== "timer") return false;
          const data = card.data as Partial<{
            timerId: string;
            label: string;
            targetTime: number;
          }>;
          return (
            card.id === timer.id ||
            data.timerId === timer.id ||
            (data.targetTime === timer.targetTime && data.label === timer.label)
          );
        });
        if (alreadyVisible) continue;

        completedTimerIdsRef.current.add(timer.id);
        dispatch({
          type: "ADD_CARD",
          payload: {
            type: "timer",
            persistent: true,
            data: {
              timerId: timer.id,
              label: timer.label,
              isAlarm: timer.isAlarm,
              targetTime: timer.targetTime,
              duration: timer.duration,
              completionState: "completed",
            },
          },
        });
      }
    };

    showDueTimers();
    const interval = window.setInterval(showDueTimers, 1_000);
    window.addEventListener(TIMERS_EVENT, showDueTimers);
    window.addEventListener("focus", showDueTimers);
    document.addEventListener("visibilitychange", showDueTimers);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(TIMERS_EVENT, showDueTimers);
      window.removeEventListener("focus", showDueTimers);
      document.removeEventListener("visibilitychange", showDueTimers);
    };
  }, [enabled]);

  // ---------------------------------------------------------------------------
  // Restore persisted timers on mount (with guard against double-mount in strict mode)
  // ---------------------------------------------------------------------------
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (!enabled || hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    const persisted = restoreTimers();
    for (const timer of persisted) {
      const event: CardEvent = {
        type: "timer",
        data: {
          label: timer.label,
          timerId: timer.id,
          isAlarm: timer.isAlarm,
          targetTime: timer.targetTime,
          duration: timer.duration,
          completionState: "running",
        },
        persistent: true,
      };
      dispatch({ type: "ADD_CARD", payload: event });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // When disabled, dismiss all cards and cancel timers
  // ---------------------------------------------------------------------------
  const prevEnabledRef = useRef(enabled);
  useEffect(() => {
    if (prevEnabledRef.current && !enabled) {
      // Transitioned from enabled → disabled
      dispatch({ type: "DISMISS_ALL" });
      for (const [id] of timersRef.current) {
        clearCardTimer(id);
      }
      timerMetaRef.current.clear();
      holdStartRef.current.clear();
    }
    prevEnabledRef.current = enabled;
  }, [enabled, clearCardTimer]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      for (const [, handle] of timersRef.current) {
        clearTimeout(handle);
      }
      timersRef.current.clear();
      timerMetaRef.current.clear();
      holdStartRef.current.clear();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Notify the AI about what cards are currently on screen so it doesn't
  // repeat content the user is already seeing. Fires a custom event that
  // LiveAPIContext listens for and forwards to the live client.
  // ---------------------------------------------------------------------------
  const lastCardSummaryRef = useRef<string>("");
  useEffect(() => {
    const summary = buildCardSummary(state.cards);
    if (summary === lastCardSummaryRef.current) return;
    lastCardSummaryRef.current = summary;
    // Debounce so rapid card updates (stagger, dedup) don't spam the model
    const handle = setTimeout(() => {
      try {
        window.dispatchEvent(
          new CustomEvent("curio:cards-changed", {
            detail: { summary, count: state.cards.length },
          }),
        );
      } catch {}
    }, 400);
    return () => clearTimeout(handle);
  }, [state.cards]);

  const contextValue = useMemo<CardManagerContextValue>(
    () => ({
      cards: state.cards,
      dispatch,
      emitCardEvent,
      registerCardType,
      enabled,
      registry: registryRef.current,
      pauseTimer,
      resumeTimer,
    }),
    [
      state.cards,
      emitCardEvent,
      registerCardType,
      enabled,
      pauseTimer,
      resumeTimer,
    ],
  );

  return React.createElement(
    CardManagerContext.Provider,
    { value: contextValue },
    children,
  );
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export const useCardManager = (): CardManagerContextValue => {
  const ctx = useContext(CardManagerContext);
  if (!ctx) {
    throw new Error("useCardManager must be used within a CardManagerProvider");
  }
  return ctx;
};
