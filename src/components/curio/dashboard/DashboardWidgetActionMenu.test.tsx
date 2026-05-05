import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DashboardWidgetActionMenu } from "./DashboardWidgetActionMenu";
import type { DashboardWidget } from "../../../services/dashboardTypes";

const weatherWidget: DashboardWidget = {
  id: "weather_1",
  type: "weather",
  position: 0,
  size: "medium",
  enabled: true,
  config: {},
};

const robotWidget: DashboardWidget = {
  id: "robot_1",
  type: "robot_face",
  position: 0,
  size: "large",
  enabled: true,
  config: { w: 2, h: 2, robotFloatingEnabled: false },
};

describe("DashboardWidgetActionMenu", () => {
  it("renders the portaled menu with the dashboard theme tokens", () => {
    render(
      <DashboardWidgetActionMenu
        widget={weatherWidget}
        menuRef={React.createRef<HTMLDivElement>()}
        position={{ left: 16, top: 16 }}
        tempUnit="F"
        editMode
        widgetGlowEnabled={false}
        glassEffectEnabled
        themeMode="dark"
        appearanceStyle={
          {
            "--dashboard-accent": "#00ffaa",
            "--ether-overlay-panel": "rgba(1, 2, 3, 0.72)",
          } as React.CSSProperties
        }
        onFocusWidget={vi.fn()}
        onOpenWidgetSettings={vi.fn()}
        onEnableEditMode={vi.fn()}
        onUpdateWidgetConfig={vi.fn()}
        onSetTempUnit={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    const menu = screen.getByRole("menu", { name: "Weather actions" });

    expect(menu).toHaveAttribute("data-theme", "dark");
    expect(menu).toHaveStyle({
      "--dashboard-accent": "#00ffaa",
      "--ether-overlay-panel": "rgba(1, 2, 3, 0.72)",
    });
  });

  it("renders temperature unit labels without encoding corruption", () => {
    render(
      <DashboardWidgetActionMenu
        widget={weatherWidget}
        menuRef={React.createRef<HTMLDivElement>()}
        position={{ left: 16, top: 16 }}
        tempUnit="C"
        editMode
        widgetGlowEnabled={false}
        glassEffectEnabled
        onFocusWidget={vi.fn()}
        onOpenWidgetSettings={vi.fn()}
        onEnableEditMode={vi.fn()}
        onUpdateWidgetConfig={vi.fn()}
        onSetTempUnit={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "\u00b0F" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "\u00b0C" })).toBeInTheDocument();
    expect(screen.queryByText(/Â/)).toBeNull();
    expect(screen.queryByText(/Ã/)).toBeNull();
  });
  it("shows glow controls for full-bleed widgets while hiding glass controls", () => {
    render(
      <DashboardWidgetActionMenu
        widget={{
          ...weatherWidget,
          id: "youtube_1",
          type: "youtube_video",
        }}
        menuRef={React.createRef<HTMLDivElement>()}
        position={{ left: 16, top: 16 }}
        tempUnit="F"
        editMode
        widgetGlowEnabled
        glassEffectEnabled
        onFocusWidget={vi.fn()}
        onOpenWidgetSettings={vi.fn()}
        onEnableEditMode={vi.fn()}
        onUpdateWidgetConfig={vi.fn()}
        onSetTempUnit={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Glow")).toBeInTheDocument();
    expect(screen.queryByText("Glass")).toBeNull();
  });

  it("lets robot widgets toggle floating from the action menu", () => {
    const onUpdateWidgetConfig = vi.fn();

    render(
      <DashboardWidgetActionMenu
        widget={robotWidget}
        menuRef={React.createRef<HTMLDivElement>()}
        position={{ left: 16, top: 16 }}
        tempUnit="F"
        editMode={false}
        widgetGlowEnabled={false}
        glassEffectEnabled
        onFocusWidget={vi.fn()}
        onOpenWidgetSettings={vi.fn()}
        onEnableEditMode={vi.fn()}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
        onSetTempUnit={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: /Float/i }));

    expect(onUpdateWidgetConfig).toHaveBeenCalledWith("robot_1", {
      robotFloatingEnabled: true,
    });
  });
});
