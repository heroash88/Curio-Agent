import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DashboardWidget } from "../../../services/dashboardTypes";
import RemindersWidget from "./RemindersWidget";

vi.mock("../../../hooks/useWidgetSize", () => ({
  useWidgetSize: () => ({
    w: 3,
    h: 3,
    area: 9,
    sizeClass: "large",
    isWide: true,
    isTall: true,
    isCompact: false,
    pixelWidth: 420,
    pixelHeight: 420,
  }),
}));

const widget: DashboardWidget = {
  id: "reminders_test",
  type: "reminders",
  position: 0,
  size: "large",
  enabled: true,
  config: { w: 3, h: 3 },
};

describe("RemindersWidget", () => {
  beforeEach(() => {
    localStorage.clear();
    // Disable inline quick-add so these legacy tests keep exercising
    // the full-form add controls. InlineQuickAdd has its own coverage.
    localStorage.setItem(
      'curio_dashboard_prefs',
      JSON.stringify({ interactivity: { inlineQuickAddEnabled: false } }),
    );
    localStorage.setItem(
      "curio_reminders",
      JSON.stringify([
        {
          id: "reminder_active",
          text: "Call Sam",
          timeDescription: "Apr 29, 9:30 AM",
          dueDateTime: "2026-04-29T09:30",
          createdAt: 1,
          done: false,
        },
        {
          id: "reminder_done",
          text: "Paid bill",
          timeDescription: "Apr 28, 5:00 PM",
          dueDateTime: "2026-04-28T17:00",
          createdAt: 2,
          done: true,
        },
      ]),
    );
  });

  it("can show finished reminders and reopen them", () => {
    render(<RemindersWidget widget={widget} />);

    expect(screen.queryByText("Paid bill")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show finished reminders" }));
    expect(screen.getByText("Paid bill")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reopen reminder Paid bill" }));
    expect(JSON.parse(localStorage.getItem("curio_reminders") || "[]")).toEqual([
      expect.objectContaining({ id: "reminder_active", done: false }),
      expect.objectContaining({ id: "reminder_done", done: false }),
    ]);
  });

  it("edits reminder text, date, and time in place", () => {
    render(<RemindersWidget widget={widget} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit reminder Call Sam" }));
    fireEvent.change(screen.getByLabelText("Reminder text"), {
      target: { value: "Call Taylor" },
    });
    fireEvent.change(screen.getByLabelText("Reminder date"), {
      target: { value: "2026-05-01" },
    });
    fireEvent.change(screen.getByLabelText("Reminder time"), {
      target: { value: "10:45" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save reminder" }));

    expect(JSON.parse(localStorage.getItem("curio_reminders") || "[]")).toEqual([
      expect.objectContaining({
        id: "reminder_active",
        text: "Call Taylor",
        dueDateTime: "2026-05-01T10:45",
      }),
      expect.objectContaining({ id: "reminder_done" }),
    ]);
  });
});
