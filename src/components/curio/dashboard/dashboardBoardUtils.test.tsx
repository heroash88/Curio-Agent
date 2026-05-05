import { describe, expect, it } from "vitest";
import type { DashboardWidget } from "../../../services/dashboardTypes";
import {
  clampFloatingWidgetPosition,
  getDashboardAnimatedGlassVariables,
  getDashboardGlassVariables,
  getClampedWidgetActionMenuPosition,
  getVisibleWidgets,
  mergeVisibleOrder,
  normalizeWidgets,
  resolveColumns,
  resolveGridCanvasWidth,
} from "./dashboardBoardUtils";

const widget = (
  id: string,
  position: number,
  enabled = true,
): DashboardWidget => ({
  id,
  type: "weather",
  position,
  size: "large",
  enabled,
  config: { w: 2, h: 2 },
});

describe("dashboard board utilities", () => {
  it("clamps widget action menus into the viewport", () => {
    expect(
      getClampedWidgetActionMenuPosition({
        anchorRect: { top: 48, right: 42, bottom: 82 },
        menuWidth: 240,
        menuHeight: 220,
        viewportWidth: 320,
        viewportHeight: 480,
      }),
    ).toEqual({ left: 12, top: 90 });
  });

  it("normalizes visible widget order without dropping hidden widgets", () => {
    const hidden = widget("hidden", 0, false);
    const first = widget("first", 2);
    const second = widget("second", 1);

    expect(getVisibleWidgets([first, hidden, second]).map((item) => item.id))
      .toEqual(["second", "first"]);

    expect(
      mergeVisibleOrder([first, hidden, second], [first, second]).map((item) => ({
        id: item.id,
        position: item.position,
      })),
    ).toEqual([
      { id: "first", position: 0 },
      { id: "second", position: 1 },
      { id: "hidden", position: 2 },
    ]);
  });

  it("uses compact columns on small boards and dense columns on desktop boards", () => {
    expect(resolveColumns(320)).toBe(1);
    expect(resolveColumns(720)).toBe(4);
    expect(resolveColumns(1680)).toBe(9);
  });

  it("keeps desktop grid tracks in stable dashboard space as the viewport changes", () => {
    const gap = 18;

    [
      { availableWidth: 680, columns: 4, canvasWidth: 678, columnWidth: 156 },
      { availableWidth: 850, columns: 4, canvasWidth: 678, columnWidth: 156 },
      { availableWidth: 1230, columns: 7, canvasWidth: 1200, columnWidth: 156 },
      { availableWidth: 1630, columns: 9, canvasWidth: 1548, columnWidth: 156 },
    ].forEach(({ availableWidth, columns, canvasWidth, columnWidth }) => {
      const resolvedColumns = resolveColumns(availableWidth);
      const resolvedCanvasWidth = resolveGridCanvasWidth(
        availableWidth,
        resolvedColumns,
        gap,
      );
      const resolvedColumnWidth =
        (resolvedCanvasWidth - Math.max(0, resolvedColumns - 1) * gap) /
        resolvedColumns;

      expect(resolvedColumns).toBe(columns);
      expect(resolvedCanvasWidth).toBe(canvasWidth);
      expect(resolvedColumnWidth).toBe(columnWidth);
    });
  });

  it("clamps floating widget positions inside the viewport", () => {
    expect(
      clampFloatingWidgetPosition(
        { x: -80, y: -12 },
        { width: 360, height: 640 },
        { width: 180, height: 180 },
        16,
      ),
    ).toEqual({ x: 16, y: 16 });

    expect(
      clampFloatingWidgetPosition(
        { x: 340, y: 620 },
        { width: 360, height: 640 },
        { width: 180, height: 180 },
        16,
      ),
    ).toEqual({ x: 164, y: 444 });
  });

  it("clones normalized widgets instead of mutating the source array", () => {
    const original = [widget("late", 9), widget("early", 1)];
    const normalized = normalizeWidgets(original);

    expect(normalized.map((item) => `${item.id}:${item.position}`)).toEqual([
      "early:0",
      "late:1",
    ]);
    expect(original.map((item) => `${item.id}:${item.position}`)).toEqual([
      "late:9",
      "early:1",
    ]);
  });

  it("scales glass variables by intensity while preserving the default midpoint", () => {
    expect(getDashboardGlassVariables("light", true, 50)).toMatchObject({
      "--ether-glass-bg": "rgba(255, 255, 255, 0.64)",
      "--ether-glass-blur": "22px",
      "--ether-control-bg": "rgba(255, 255, 255, 0.66)",
      "--ether-control-hover": "rgba(255, 255, 255, 0.78)",
    });

    expect(getDashboardGlassVariables("light", true, 0)).toMatchObject({
      "--ether-glass-bg": "rgba(255, 255, 255, 0.88)",
      "--ether-glass-blur": "8px",
    });

    expect(getDashboardGlassVariables("dark", true, 100)).toMatchObject({
      "--ether-glass-bg": "rgba(25, 23, 19, 0.36)",
      "--ether-glass-blur": "42px",
    });
  });

  it("uses a lighter live blur budget over animated dashboard backgrounds", () => {
    expect(getDashboardAnimatedGlassVariables("dark", true, 100)).toMatchObject({
      "--ether-glass-bg": "rgba(25, 23, 19, 0.42)",
      "--ether-glass-blur": "10px",
    });

    expect(getDashboardAnimatedGlassVariables("light", true, 100)).toMatchObject({
      "--ether-glass-bg": "rgba(255, 255, 255, 0.5)",
      "--ether-glass-blur": "10px",
      "--ether-control-bg": "rgba(255, 255, 255, 0.74)",
    });
  });
});
