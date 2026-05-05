import { useMemo } from 'react';

import {
  resolveLinkedWidget,
} from '../services/dashboardIntents';
import type { DashboardWidget } from '../services/dashboardTypes';

/**
 * Hook-style wrapper around {@link resolveLinkedWidget}. Thin by
 * design: widgets that consume linked references (Pomodoro's
 * `linkedTaskId`, Map's `linkedCommuteId`, NowPlaying's
 * `linkedMusicWidgetId`) already hold a widgets array in their render
 * path, so the hook only exists to expose a consistent, memoized
 * shape.
 *
 * The returned reference is stable between renders when the resolved
 * widget does not change, so consumers can depend on identity for
 * effect-dep arrays.
 */
export function useLinkedWidget(
  id: string | null | undefined,
  widgets: readonly DashboardWidget[] | null | undefined,
): DashboardWidget | null {
  return useMemo(
    () => resolveLinkedWidget(id, widgets),
    [id, widgets],
  );
}
