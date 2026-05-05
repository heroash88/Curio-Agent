import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DashboardWidget } from "../../../services/dashboardTypes";
import { useDashboardWidgetIntents } from "./useDashboardWidgetIntents";

const makeWidget = (
  id: string,
  type: DashboardWidget["type"],
  config: DashboardWidget["config"] = { w: 2, h: 2 },
): DashboardWidget => ({
  id,
  type,
  position: 0,
  size: "large",
  enabled: true,
  config,
});

describe("useDashboardWidgetIntents", () => {
  it("patches an existing widget from dashboard widget intent events", () => {
    const widgetsRef = {
      current: [makeWidget("weather_1", "weather", { w: 2, h: 2 })],
    };
    const persistWidgets = vi.fn();

    renderHook(() => useDashboardWidgetIntents({ widgetsRef, persistWidgets }));

    act(() => {
      window.dispatchEvent(
        new CustomEvent("curio:dashboard-widget-intent", {
          detail: {
            widgetType: "weather",
            configPatch: { weatherCity: "Seattle" },
          },
        }),
      );
    });

    expect(persistWidgets).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "weather_1",
        enabled: true,
        config: expect.objectContaining({ weatherCity: "Seattle" }),
      }),
    ]);
  });

  it("creates a configured YouTube widget from card intent events", () => {
    const widgetsRef = { current: [] as DashboardWidget[] };
    const persistWidgets = vi.fn();

    renderHook(() => useDashboardWidgetIntents({ widgetsRef, persistWidgets }));

    act(() => {
      window.dispatchEvent(
        new CustomEvent("curio:dashboard-card-intent", {
          detail: {
            type: "youtube",
            data: {
              searchQuery: "curio robot demo",
              videoId: "abc123",
              title: "Curio Demo",
            },
          },
        }),
      );
    });

    expect(persistWidgets).toHaveBeenCalledWith([
      expect.objectContaining({
        type: "youtube_video",
        position: 0,
        config: expect.objectContaining({
          youtubeQuery: "curio robot demo",
          youtubeVideoId: "abc123",
          youtubeTitle: "Curio Demo",
          youtubeAutoplay: true,
        }),
      }),
    ]);
  });
});
