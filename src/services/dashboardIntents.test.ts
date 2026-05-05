import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardWidgetType } from './dashboardTypes';
import {
  DASHBOARD_HOVER_EVENT,
  DASHBOARD_ITEM_DROP_EVENT,
  DASHBOARD_SELECT_EVENT,
  DROP_INTENT_REGISTRY,
  dispatchDropIntent,
  dispatchHover,
  dispatchSelect,
  isDropTargetSupported,
  type DropIntentPayload,
  type HoverEventDetail,
  type SelectEventDetail,
} from './dashboardIntents';

describe('dashboardIntents', () => {
  describe('DROP_INTENT_REGISTRY and isDropTargetSupported', () => {
    it('registers every (source -> target) pair from the design', () => {
      // Design Requirement 10.2–10.6: Bookmarks -> Notes/RichNote/Obsidian,
      // Task -> Pomodoro, Stocks -> Portfolio, Map -> Commute,
      // News -> RichNote/Obsidian.
      const expected: Array<[DashboardWidgetType, DashboardWidgetType]> = [
        ['bookmarks', 'notes'],
        ['bookmarks', 'rich_note'],
        ['bookmarks', 'obsidian_notes'],
        ['tasks', 'pomodoro'],
        ['stock', 'portfolio'],
        ['map', 'commute'],
        ['news', 'rich_note'],
        ['news', 'obsidian_notes'],
      ];

      for (const [src, tgt] of expected) {
        expect(isDropTargetSupported(src, tgt)).toBe(true);
      }
    });

    it('returns false for unregistered combinations', () => {
      const unsupported: Array<[DashboardWidgetType, DashboardWidgetType]> = [
        ['bookmarks', 'portfolio'],
        ['tasks', 'commute'],
        ['stock', 'notes'],
        ['map', 'rich_note'],
        ['news', 'pomodoro'],
        // Unknown source type (never registered).
        ['clock', 'notes'],
        // Self-drops are never registered either.
        ['notes', 'notes'],
      ];

      for (const [src, tgt] of unsupported) {
        expect(isDropTargetSupported(src, tgt)).toBe(false);
      }
    });

    it('is side-effect-free and idempotent across calls', () => {
      const before = DROP_INTENT_REGISTRY.length;
      isDropTargetSupported('bookmarks', 'notes');
      isDropTargetSupported('stock', 'portfolio');
      expect(DROP_INTENT_REGISTRY).toHaveLength(before);
    });
  });

  describe('dispatchDropIntent', () => {
    const handler = vi.fn();

    beforeEach(() => {
      handler.mockReset();
      window.addEventListener(DASHBOARD_ITEM_DROP_EVENT, handler);
    });

    afterEach(() => {
      window.removeEventListener(DASHBOARD_ITEM_DROP_EVENT, handler);
    });

    it('fires curio:dashboard-item-drop with the exact detail object', () => {
      const payload: DropIntentPayload = {
        sourceWidgetId: 'widget-bookmarks-1',
        sourceWidgetType: 'bookmarks',
        payload: { url: 'https://example.com', title: 'Example' },
        targetWidgetId: 'widget-notes-1',
        targetWidgetType: 'notes',
        position: { x: 120, y: 240 },
      };

      dispatchDropIntent(payload);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent<DropIntentPayload>;
      expect(event.type).toBe(DASHBOARD_ITEM_DROP_EVENT);
      expect(event.detail).toEqual(payload);
    });
  });

  describe('dispatchHover', () => {
    const handler = vi.fn();

    beforeEach(() => {
      handler.mockReset();
      window.addEventListener(DASHBOARD_HOVER_EVENT, handler);
    });

    afterEach(() => {
      window.removeEventListener(DASHBOARD_HOVER_EVENT, handler);
    });

    it('fires curio:dashboard-hover with the exact detail object', () => {
      const detail: HoverEventDetail = {
        widgetId: 'calendar-1',
        itemKind: 'calendar-event',
        itemId: 'evt-42',
      };

      dispatchHover(detail);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent<HoverEventDetail>;
      expect(event.type).toBe(DASHBOARD_HOVER_EVENT);
      expect(event.detail).toEqual(detail);
    });

    it('supports null itemKind / itemId as hover-end signal', () => {
      // Design Requirement 12.4/12.7: hover-end clears highlights.
      const detail: HoverEventDetail = {
        widgetId: 'x',
        itemKind: null,
        itemId: null,
      };

      dispatchHover(detail);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent<HoverEventDetail>;
      expect(event.detail).toEqual(detail);
    });
  });

  describe('dispatchSelect', () => {
    const handler = vi.fn();

    beforeEach(() => {
      handler.mockReset();
      window.addEventListener(DASHBOARD_SELECT_EVENT, handler);
    });

    afterEach(() => {
      window.removeEventListener(DASHBOARD_SELECT_EVENT, handler);
    });

    it('fires curio:dashboard-select with the exact detail object', () => {
      const detail: SelectEventDetail = {
        widgetId: 'mail-1',
        itemKind: 'mail-thread',
        itemId: 'thread-7',
      };

      dispatchSelect(detail);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent<SelectEventDetail>;
      expect(event.type).toBe(DASHBOARD_SELECT_EVENT);
      expect(event.detail).toEqual(detail);
    });
  });

  describe('SSR / missing window guard', () => {
    // We stub `window` to undefined for this block only, mirroring the
    // SSR path. The helpers must simply no-op without throwing. Because
    // the source reads `typeof window`, `vi.stubGlobal` on `window` is
    // the right seam.
    beforeEach(() => {
      vi.stubGlobal('window', undefined);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('does not throw when dispatch helpers run without window', () => {
      expect(() =>
        dispatchDropIntent({
          sourceWidgetId: 's',
          sourceWidgetType: 'bookmarks',
          payload: {},
          targetWidgetId: 't',
          targetWidgetType: 'notes',
        }),
      ).not.toThrow();

      expect(() =>
        dispatchHover({ widgetId: 'x', itemKind: null, itemId: null }),
      ).not.toThrow();

      expect(() =>
        dispatchSelect({
          widgetId: 'x',
          itemKind: 'task',
          itemId: 'id-1',
        }),
      ).not.toThrow();
    });
  });
});
