import type { NotificationCenterEntry } from "../../../services/notificationCenterStore";
import type {
  DashboardWidget,
  DashboardWidgetConfig,
} from "../../../services/dashboardTypes";
import type { AqiData, WeatherData } from "../../../services/weatherService";

export type DashboardRobotBubbleKind =
  | "email"
  | "message"
  | "calendar"
  | "reminder"
  | "notification"
  | "widget_data"
  | "companion";

export interface DashboardRobotBubble {
  id: string;
  kind: DashboardRobotBubbleKind;
  text: string;
  priority: "low" | "normal" | "high";
}

export interface DashboardRobotBubbleContext {
  widget: DashboardWidget;
  notificationEntries: NotificationCenterEntry[];
  widgets: DashboardWidget[];
  editMode: boolean;
  userTyping: boolean;
  weather?: WeatherData | null;
  aqi?: AqiData | null;
  enabledRoutineCount?: number;
}

type BubbleSwitchKey =
  | "robotBubbleEmail"
  | "robotBubbleMessages"
  | "robotBubbleCalendar"
  | "robotBubbleReminders"
  | "robotBubbleNotifications"
  | "robotBubbleWidgetData"
  | "robotBubbleCompanion";

const BUBBLE_KIND_SWITCH: Record<DashboardRobotBubbleKind, BubbleSwitchKey> = {
  email: "robotBubbleEmail",
  message: "robotBubbleMessages",
  calendar: "robotBubbleCalendar",
  reminder: "robotBubbleReminders",
  notification: "robotBubbleNotifications",
  widget_data: "robotBubbleWidgetData",
  companion: "robotBubbleCompanion",
};
const ROUTINE_RUNNING_BUBBLE_MAX_AGE_MS = 5 * 60 * 1000;

const isEnabled = (
  config: DashboardWidgetConfig,
  kind: DashboardRobotBubbleKind,
) =>
  config.robotBubblesEnabled !== false &&
  config[BUBBLE_KIND_SWITCH[kind]] !== false;

const compact = (value: string, max = 86) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trim()}...`;
};

const classifyNotification = (
  entry: NotificationCenterEntry,
): DashboardRobotBubbleKind => {
  const haystack = `${entry.source} ${entry.title} ${entry.message}`.toLowerCase();
  if (entry.source === "email" || /\b(email|gmail|outlook|inbox|mail)\b/.test(haystack)) {
    return "email";
  }
  if (entry.source === "slack" || /\b(slack|message|dm|mention|mentioned)\b/.test(haystack)) {
    return "message";
  }
  if (entry.source === "calendar" || /\b(calendar|meeting|event|agenda)\b/.test(haystack)) {
    return "calendar";
  }
  if (entry.source === "reminder" || /\b(reminder|due|don't forget|dont forget)\b/.test(haystack)) {
    return "reminder";
  }
  return "notification";
};

const textForNotification = (
  entry: NotificationCenterEntry,
  kind: DashboardRobotBubbleKind,
) => {
  const title = compact(entry.title || entry.message || "New update");
  if (kind === "email") return `New email: ${title}`;
  if (kind === "message") return `Message for you: ${title}`;
  if (kind === "calendar") return `Calendar heads-up: ${title}`;
  if (kind === "reminder") return `Reminder soon: ${title}`;
  return compact(title || "There is a new dashboard alert.");
};

const getNotificationBubble = (
  widget: DashboardWidget,
  entries: NotificationCenterEntry[],
): DashboardRobotBubble | null => {
  const unread = entries
    .filter((entry) => {
      if (!entry.unread) return false;
      if (entry.source === "routine") {
        if (entry.state === "failed") return true;
        if (entry.state === "running" || entry.state === "queued") {
          return Date.now() - entry.createdAt <= ROUTINE_RUNNING_BUBBLE_MAX_AGE_MS;
        }
        // Routine completions are activity history, not live alerts.
        return false;
      }
      return true;
    })
    .sort((left, right) => right.createdAt - left.createdAt);

  for (const entry of unread) {
    const kind = classifyNotification(entry);
    if (!isEnabled(widget.config, kind)) continue;
    return {
      id: `notification:${entry.id}`,
      kind,
      text: textForNotification(entry, kind),
      priority: entry.priority,
    };
  }

  return null;
};

const getCompanionBubble = (
  widget: DashboardWidget,
  editMode: boolean,
  userTyping: boolean,
): DashboardRobotBubble | null => {
  if (!isEnabled(widget.config, "companion")) return null;
  if (userTyping) {
    return {
      id: "companion:typing",
      kind: "companion",
      text: "Keep going. I am watching the dashboard context with you.",
      priority: "low",
    };
  }
  if (editMode) {
    return {
      id: "companion:editing",
      kind: "companion",
      text: "Layout mode is on. I will stay nearby while you tune things.",
      priority: "low",
    };
  }
  return null;
};

const getWidgetDataBubble = ({
  widget,
  widgets,
  weather,
  aqi,
  enabledRoutineCount = 0,
}: DashboardRobotBubbleContext): DashboardRobotBubble | null => {
  if (!isEnabled(widget.config, "widget_data")) return null;

  if (aqi && Number.isFinite(aqi.value) && aqi.value >= 100) {
    return {
      id: `widget-data:aqi:${Math.round(aqi.value)}`,
      kind: "widget_data",
      text: `Air quality note: ${aqi.category || "elevated"} at ${Math.round(aqi.value)}.`,
      priority: aqi.value >= 150 ? "high" : "normal",
    };
  }

  if (weather && /\b(rain|storm|snow|sleet|thunder|fog)\b/i.test(weather.desc)) {
    return {
      id: `widget-data:weather:${weather.city}:${weather.desc}`,
      kind: "widget_data",
      text: `Weather note: ${compact(weather.desc, 42)} in ${compact(weather.city || "your area", 28)}.`,
      priority: /\b(storm|thunder)\b/i.test(weather.desc) ? "normal" : "low",
    };
  }

  if (enabledRoutineCount > 0 && widgets.some((item) => item.type === "quick_actions")) {
    return {
      id: `widget-data:routines:${enabledRoutineCount}`,
      kind: "widget_data",
      text: `${enabledRoutineCount} routine${enabledRoutineCount === 1 ? "" : "s"} ready when you need them.`,
      priority: "low",
    };
  }

  return null;
};

export const getDashboardRobotBubble = (
  context: DashboardRobotBubbleContext,
): DashboardRobotBubble | null => {
  if (context.widget.type !== "robot_face") return null;
  if (context.widget.config.robotBubblesEnabled === false) return null;

  return (
    getNotificationBubble(context.widget, context.notificationEntries) ||
    getCompanionBubble(context.widget, context.editMode, context.userTyping) ||
    getWidgetDataBubble(context)
  );
};
