import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardWidget } from "../../../services/dashboardTypes";
import TasksWidget from "./TasksWidget";

const widgetSizeMock = vi.hoisted(() => ({
  current: {
    w: 2,
    h: 3,
    area: 6,
    sizeClass: "small",
    isWide: false,
    isTall: true,
    isCompact: true,
    pixelWidth: 232,
    pixelHeight: 320,
  },
}));

vi.mock("../../../hooks/useWidgetSize", () => ({
  useWidgetSize: () => widgetSizeMock.current,
}));

vi.mock("../../../hooks/useDashboardRefresh", () => ({
  useDashboardRefresh: () => ({
    refreshNow: vi.fn(),
  }),
}));

const widget: DashboardWidget = {
  id: "tasks_compact",
  type: "tasks",
  position: 0,
  size: "small",
  enabled: true,
  config: { w: 2, h: 3 },
};

describe("TasksWidget compact layout", () => {
  beforeEach(() => {
    widgetSizeMock.current = {
      w: 2,
      h: 3,
      area: 6,
      sizeClass: "small",
      isWide: false,
      isTall: true,
      isCompact: true,
      pixelWidth: 232,
      pixelHeight: 320,
    };
    localStorage.clear();
    // Exercise the legacy create-row path. InlineQuickAdd has its own
    // coverage in the primitive tests.
    localStorage.setItem(
      'curio_dashboard_prefs',
      JSON.stringify({ interactivity: { inlineQuickAddEnabled: false } }),
    );
    localStorage.setItem("curio_tasks", JSON.stringify([]));
  });

  it("uses compact header and create controls at narrow widths", () => {
    render(<TasksWidget widget={widget} />);

    expect(screen.queryByText("Tasks & Routines")).not.toBeInTheDocument();
    expect(screen.getByTestId("tasks-widget-layout").className).not.toContain("pt-6");
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.queryByTestId("tasks-widget-compact-header")).not.toBeInTheDocument();
    expect(screen.getByTestId("tasks-widget-header-actions")).toHaveClass(
      "gap-1",
    );
    expect(screen.getByTestId("tasks-widget-create-row")).toHaveClass(
      "grid-cols-[minmax(0,1fr)_auto]",
    );
    expect(screen.getByLabelText("Task priority")).toHaveClass(
      "col-span-2",
      "w-full",
    );
    expect(screen.getByPlaceholderText("What needs doing?")).toHaveClass(
      "text-[12px]",
    );
  });

  it("keeps the compact 2x3 layout even when the two-column frame is wider", () => {
    widgetSizeMock.current = {
      ...widgetSizeMock.current,
      sizeClass: "medium",
      isCompact: false,
      pixelWidth: 306,
      pixelHeight: 320,
    };

    render(<TasksWidget widget={widget} />);

    expect(screen.queryByText("Tasks & Routines")).not.toBeInTheDocument();
    expect(screen.getByTestId("tasks-widget-layout").className).not.toContain("pt-6");
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.queryByTestId("tasks-widget-compact-header")).not.toBeInTheDocument();
    expect(screen.getByTestId("tasks-widget-create-row")).toHaveClass(
      "grid-cols-[minmax(0,1fr)_auto]",
    );
    expect(screen.getByLabelText("Task priority")).toHaveClass(
      "col-span-2",
      "w-full",
    );
  });
});
