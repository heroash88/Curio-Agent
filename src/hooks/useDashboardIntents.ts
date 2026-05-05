import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type React from 'react';

import {
  DASHBOARD_HOVER_EVENT,
  DASHBOARD_ITEM_DROP_EVENT,
  DASHBOARD_SELECT_EVENT,
  dispatchDropIntent,
  readDashboardDragPayload,
  type DashboardDragPayload,
  type DropIntentPayload,
  type HoverEventDetail,
  type SelectEventDetail,
  isDropTargetSupported,
} from '../services/dashboardIntents';
import type { DashboardWidget } from '../services/dashboardTypes';
import { dashboardToastBus } from '../services/dashboardToastBus';

/**
 * `useDropIntentTarget`
 *
 * Widget-facing hook that subscribes to the `curio:dashboard-item-drop`
 * event and forwards drops targeting *this* widget to the provided
 * handler. Drops that target a different widget are ignored. Drops
 * whose `(sourceWidgetType -> targetWidgetType)` pair is not in the
 * `DROP_INTENT_REGISTRY` are rejected with the shared "Not supported
 * here" toast (design Requirement 10.8). Consumer handlers may throw —
 * the listener catches and logs so one misbehaving widget does not
 * break cross-widget drops for others.
 *
 * The handler is re-subscribed on every render (consumers that pass
 * inline closures resubscribe; that is acceptable because
 * `addEventListener`/`removeEventListener` are cheap and the handler
 * body always validates payload before dispatching).
 */
export type DropIntentHandler = (
  payload: DropIntentPayload,
) => void | Promise<void>;

const UNSUPPORTED_TOAST_ID = 'drop-intent-unsupported';
const UNSUPPORTED_TOAST_LABEL = 'Not supported here';

export interface UseDropIntentTargetOptions {
  /**
   * When `false`, the hook does NOT install the event listener. The
   * per-widget `dropIntentsEnabled` interactivity toggle is the primary
   * consumer of this flag (design Requirement 10.7). Defaults to `true`.
   */
  enabled?: boolean;
}

export function useDropIntentTarget(
  widgetId: string,
  handler: DropIntentHandler,
  options?: UseDropIntentTargetOptions,
): void {
  const enabled = options?.enabled !== false;
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!enabled) {
      return;
    }

    const listener = (event: Event): void => {
      const detail = (event as CustomEvent<DropIntentPayload>).detail;
      if (!detail || typeof detail !== 'object') {
        return;
      }
      if (detail.targetWidgetId !== widgetId) {
        return;
      }

      if (
        !isDropTargetSupported(detail.sourceWidgetType, detail.targetWidgetType)
      ) {
        dashboardToastBus.show({
          id: UNSUPPORTED_TOAST_ID,
          label: UNSUPPORTED_TOAST_LABEL,
        });
        return;
      }

      try {
        const result = handler(detail);
        if (result && typeof (result as Promise<void>).then === 'function') {
          (result as Promise<void>).catch((err) => {
            console.warn('[useDropIntentTarget] handler rejected', err);
          });
        }
      } catch (err) {
        console.warn('[useDropIntentTarget] handler threw', err);
      }
    };

    window.addEventListener(DASHBOARD_ITEM_DROP_EVENT, listener);
    return () => {
      window.removeEventListener(DASHBOARD_ITEM_DROP_EVENT, listener);
    };
  }, [widgetId, handler, enabled]);
}

/**
 * `useDashboardDropTarget`
 *
 * Provides DOM handlers for widgets that accept drops from
 * HTML5-drag sources (bookmarks, stock rows, news articles, map
 * pins, tasks). The hook returns props to spread on the drop zone
 * element:
 *   - `onDragOver` — calls `preventDefault` when the dragged payload
 *     matches the current target's supported source types, which
 *     makes the drop valid. No-op otherwise so native drops (files,
 *     links) bubble.
 *   - `onDrop` — parses the payload, dispatches
 *     `curio:dashboard-item-drop`, and prevents default.
 *
 * Widgets should also subscribe via `useDropIntentTarget` to receive
 * the dispatched event. Separating DOM handling from event
 * subscription keeps business logic thin and centralised.
 *
 * When `enabled` is `false`, the returned handlers are noops so the
 * `dropIntentsEnabled` interactivity toggle can gate drop targets at
 * a single place (design Requirement 10.7).
 */
export interface UseDashboardDropTargetOptions {
  widgetId: string;
  widgetType: DashboardWidget['type'];
  enabled?: boolean;
}

export interface DashboardDropTargetBindings {
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
}

export function useDashboardDropTarget(
  options: UseDashboardDropTargetOptions,
): DashboardDropTargetBindings {
  const { widgetId, widgetType, enabled = true } = options;

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      if (!enabled) return;
      const types = event.dataTransfer?.types;
      const hasCurio =
        types && Array.from(types).includes('application/x-curio-drop-intent');
      if (!hasCurio) return;
      // Call preventDefault on both the React and native events to
      // signal that this is a valid drop target.
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    },
    [enabled],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      if (!enabled) return;
      const payload: DashboardDragPayload | null = readDashboardDragPayload(
        event.dataTransfer,
      );
      if (!payload) return;
      event.preventDefault();

      dispatchDropIntent({
        sourceWidgetId: payload.sourceWidgetId,
        sourceWidgetType: payload.sourceWidgetType,
        payload: { ...payload.data, kind: payload.kind },
        targetWidgetId: widgetId,
        targetWidgetType: widgetType,
        position: { x: event.clientX, y: event.clientY },
      });
    },
    [enabled, widgetId, widgetType],
  );

  return useMemo(() => ({ onDragOver, onDrop }), [onDragOver, onDrop]);
}

/**
 * `useHoverBus`
 *
 * Reactive reducer over `curio:dashboard-hover` and
 * `curio:dashboard-select`. Returns the latest non-end hover detail
 * and the latest select detail. A hover event with `itemId === null`
 * clears `hovered` so downstream widgets drop their highlights
 * (design Requirement 12.4/12.7).
 *
 * The underlying store is module-level. It subscribes to `window`
 * events only while at least one subscriber is active so tests do not
 * leak listeners across files. `getServerSnapshot` returns a shared
 * frozen empty state so SSR renders match the initial client state.
 */
export interface HoverBusState {
  hovered: HoverEventDetail | null;
  selected: SelectEventDetail | null;
}

const EMPTY_STATE: HoverBusState = Object.freeze({
  hovered: null,
  selected: null,
}) as HoverBusState;

let currentState: HoverBusState = EMPTY_STATE;
const listeners = new Set<() => void>();
let windowHoverListener: ((event: Event) => void) | null = null;
let windowSelectListener: ((event: Event) => void) | null = null;

const notify = (): void => {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // Subscriber errors must not break the bus.
    }
  });
};

const setState = (next: HoverBusState): void => {
  if (
    next.hovered === currentState.hovered &&
    next.selected === currentState.selected
  ) {
    return;
  }
  currentState = next;
  notify();
};

const handleHoverEvent = (event: Event): void => {
  const detail = (event as CustomEvent<HoverEventDetail>).detail;
  if (!detail || typeof detail !== 'object') {
    return;
  }
  if (detail.itemId === null) {
    // Hover-end: clear highlights regardless of which widget emitted.
    setState({ hovered: null, selected: currentState.selected });
    return;
  }
  setState({ hovered: detail, selected: currentState.selected });
};

const handleSelectEvent = (event: Event): void => {
  const detail = (event as CustomEvent<SelectEventDetail>).detail;
  if (!detail || typeof detail !== 'object') {
    return;
  }
  setState({ hovered: currentState.hovered, selected: detail });
};

const attachWindowListeners = (): void => {
  if (typeof window === 'undefined') return;
  if (windowHoverListener || windowSelectListener) return;
  windowHoverListener = handleHoverEvent;
  windowSelectListener = handleSelectEvent;
  window.addEventListener(DASHBOARD_HOVER_EVENT, windowHoverListener);
  window.addEventListener(DASHBOARD_SELECT_EVENT, windowSelectListener);
};

const detachWindowListeners = (): void => {
  if (typeof window === 'undefined') return;
  if (windowHoverListener) {
    window.removeEventListener(DASHBOARD_HOVER_EVENT, windowHoverListener);
    windowHoverListener = null;
  }
  if (windowSelectListener) {
    window.removeEventListener(DASHBOARD_SELECT_EVENT, windowSelectListener);
    windowSelectListener = null;
  }
};

const subscribe = (onChange: () => void): (() => void) => {
  if (listeners.size === 0) {
    attachWindowListeners();
  }
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      detachWindowListeners();
    }
  };
};

const getSnapshot = (): HoverBusState => currentState;

const getServerSnapshot = (): HoverBusState => EMPTY_STATE;

export function useHoverBus(): HoverBusState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Test-only helper. Resets the module-level hover bus state, drops
 * every subscriber, and detaches window listeners so tests start from
 * a clean slate. Do NOT call from production code.
 */
export const resetHoverBusForTests = (): void => {
  listeners.clear();
  detachWindowListeners();
  currentState = EMPTY_STATE;
};
