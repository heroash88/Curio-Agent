import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  dispatchWidgetDataUpdated,
  getDashboardRefreshEventName,
  getDashboardRefreshPolicy,
} from '../services/dashboardRefresh';
import type { DashboardWidget } from '../services/dashboardTypes';

export type DashboardRefreshReason = 'initial' | 'timer' | 'manual';

interface UseDashboardRefreshInput {
  widget: DashboardWidget;
  enabled?: boolean;
  refreshOnMount?: boolean;
  onRefresh: (
    background: boolean,
    reason: DashboardRefreshReason,
  ) => void | Promise<void>;
}

export const useDashboardRefresh = ({
  widget,
  enabled = true,
  refreshOnMount = true,
  onRefresh,
}: UseDashboardRefreshInput) => {
  const refreshRef = useRef(onRefresh);

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  const policy = useMemo(
    () => getDashboardRefreshPolicy(widget.type, widget.config),
    [widget.config.refreshIntervalMinutes, widget.config.refreshMode, widget.type],
  );

  const widgetId = widget.id;
  const widgetType = widget.type;

  const invokeRefresh = useCallback(
    async (background: boolean, reason: DashboardRefreshReason) => {
      try {
        await refreshRef.current(background, reason);
      } catch {
        // Refresh failures must not dispatch the data-updated event.
        return;
      }
      dispatchWidgetDataUpdated({
        widgetId,
        widgetType,
        updatedAt: Date.now(),
      });
    },
    [widgetId, widgetType],
  );

  const refreshNow = useCallback(
    (background = false, reason: DashboardRefreshReason = 'manual') => {
      if (!enabled) return;
      void invokeRefresh(background, reason);
    },
    [enabled, invokeRefresh],
  );

  useEffect(() => {
    if (!enabled) return;
    if (refreshOnMount) {
      void invokeRefresh(false, 'initial');
    }
    if (!policy.shouldPoll || !policy.intervalMs) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        void invokeRefresh(true, 'timer');
      }
    }, policy.intervalMs);

    return () => window.clearInterval(intervalId);
  }, [
    enabled,
    invokeRefresh,
    policy.intervalMs,
    policy.shouldPoll,
    refreshOnMount,
  ]);

  useEffect(() => {
    if (!enabled) return;
    const eventName = getDashboardRefreshEventName(widgetId);
    const handler = () => {
      void invokeRefresh(false, 'manual');
    };

    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [enabled, invokeRefresh, widgetId]);

  return {
    policy,
    refreshNow,
  };
};
