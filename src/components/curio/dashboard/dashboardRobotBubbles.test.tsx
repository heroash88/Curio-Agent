import { describe, expect, it } from "vitest";
import type { DashboardWidget } from "../../../services/dashboardTypes";
import type { NotificationCenterEntry } from "../../../services/notificationCenterStore";
import { getDashboardRobotBubble } from "./dashboardRobotBubbles";

const robotWidget = (
  config: DashboardWidget["config"] = {},
): DashboardWidget => ({
  id: "robot_1",
  type: "robot_face",
  position: 0,
  size: "large",
  enabled: true,
  config: { w: 2, h: 2, ...config },
});

const notification = (
  source: NotificationCenterEntry["source"],
  title: string,
  message = "",
  overrides: Partial<NotificationCenterEntry> = {},
): NotificationCenterEntry => ({
  id: `${source}_1`,
  source,
  title,
  message,
  priority: "normal",
  state: "delivered",
  createdAt: Date.now(),
  unread: true,
  ...overrides,
});

describe("getDashboardRobotBubble", () => {
  it("turns unread email alerts into robot bubbles", () => {
    const bubble = getDashboardRobotBubble({
      widget: robotWidget(),
      notificationEntries: [notification("email", "Sam sent the proposal")],
      widgets: [],
      editMode: false,
      userTyping: false,
    });

    expect(bubble).toMatchObject({
      kind: "email",
      text: "New email: Sam sent the proposal",
    });
  });

  it("respects per-type robot bubble switches", () => {
    const bubble = getDashboardRobotBubble({
      widget: robotWidget({ robotBubbleEmail: false }),
      notificationEntries: [notification("email", "Sam sent the proposal")],
      widgets: [],
      editMode: false,
      userTyping: false,
    });

    expect(bubble).toBeNull();
  });

  it("does not turn completed routine history into stuck system alert bubbles", () => {
    const bubble = getDashboardRobotBubble({
      widget: robotWidget(),
      notificationEntries: [
        notification("routine", "Good Morning", "Completed 4 steps.", {
          state: "completed",
        }),
      ],
      widgets: [],
      editMode: false,
      userTyping: false,
    });

    expect(bubble).toBeNull();
  });

  it("does not keep stale interrupted routine runs stuck on the robot", () => {
    const bubble = getDashboardRobotBubble({
      widget: robotWidget(),
      notificationEntries: [
        notification("routine", "Good Morning", "Routine running.", {
          createdAt: Date.now() - 15 * 60 * 1000,
          state: "running",
        }),
      ],
      widgets: [],
      editMode: false,
      userTyping: false,
    });

    expect(bubble).toBeNull();
  });

  it("still surfaces failed routine alerts", () => {
    const bubble = getDashboardRobotBubble({
      widget: robotWidget(),
      notificationEntries: [
        notification("routine", "Good Morning", "Finished with issues.", {
          priority: "high",
          state: "failed",
        }),
      ],
      widgets: [],
      editMode: false,
      userTyping: false,
    });

    expect(bubble).toMatchObject({
      kind: "notification",
      text: "Good Morning",
      priority: "high",
    });
  });

  it("uses companion comments while the user is typing or editing", () => {
    expect(
      getDashboardRobotBubble({
        widget: robotWidget(),
        notificationEntries: [],
        widgets: [],
        editMode: false,
        userTyping: true,
      }),
    ).toMatchObject({
      kind: "companion",
      text: "Keep going. I am watching the dashboard context with you.",
    });

    expect(
      getDashboardRobotBubble({
        widget: robotWidget({ robotBubbleCompanion: false }),
        notificationEntries: [],
        widgets: [],
        editMode: true,
        userTyping: false,
      }),
    ).toBeNull();
  });

  it("can surface widget data insights without external calls", () => {
    const bubble = getDashboardRobotBubble({
      widget: robotWidget(),
      notificationEntries: [],
      widgets: [],
      editMode: false,
      userTyping: false,
      weather: {
        city: "Portland",
        desc: "Rain",
        icon: "rain",
        tempF: 52,
        tempC: 11,
      },
    });

    expect(bubble).toMatchObject({
      kind: "widget_data",
      text: "Weather note: Rain in Portland.",
    });
  });
});
