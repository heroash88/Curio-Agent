import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DashboardWidget } from "../../../services/dashboardTypes";
import AlertsWidget from "./AlertsWidget";

vi.mock("../../../hooks/useCardTheme", () => ({
  useCardTheme: () => ({
    onSurface: "text-white",
    onSurfaceVariant: "text-white/70",
  }),
}));

vi.mock("../../../hooks/useWidgetSize", () => ({
  useWidgetSize: () => ({
    w: 4,
    h: 2,
    area: 8,
    sizeClass: "large",
    isWide: true,
    isTall: false,
    isCompact: false,
    pixelWidth: 760,
    pixelHeight: 260,
  }),
}));

const widget: DashboardWidget = {
  id: "alerts-test",
  type: "alerts",
  position: 0,
  size: "large",
  enabled: true,
  config: { w: 4, h: 2 },
};

describe("AlertsWidget", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      "curio_notification_center_v1",
      JSON.stringify([
        {
          id: "alert-high",
          source: "home_assistant",
          title: "Front Door",
          message: "Left unlocked",
          priority: "high",
          state: "delivered",
          createdAt: Date.now(),
          unread: true,
        },
        {
          id: "alert-normal",
          source: "routine",
          title: "Software",
          message: "Updated",
          priority: "normal",
          state: "completed",
          createdAt: Date.now() - 60000,
          unread: false,
        },
      ]),
    );
  });

  it("renders priority alert cards from the notification center", () => {
    render(<AlertsWidget widget={widget} />);

    const list = screen.getByTestId("alerts-widget-list");
    expect(within(list).getByRole("button", { name: /High alert Front Door/i })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: /Medium alert Software/i })).toBeInTheDocument();
    expect(screen.getByText("1 high")).toBeInTheDocument();
    expect(screen.getByText("1 unread")).toBeInTheDocument();
  });

  it("marks an unread alert read when clicked", () => {
    render(<AlertsWidget widget={widget} />);

    fireEvent.click(screen.getByRole("button", { name: /High alert Front Door/i }));

    const stored = JSON.parse(localStorage.getItem("curio_notification_center_v1") || "[]");
    expect(stored.find((entry: { id: string }) => entry.id === "alert-high")).toMatchObject({
      unread: false,
    });
  });
});
