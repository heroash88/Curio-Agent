import type {
  DashboardCalendarProvider,
  DashboardMailProvider,
  DashboardTaskProvider,
} from "./dashboardTypes";

export type ResolvedCalendarProvider = Exclude<
  DashboardCalendarProvider,
  "auto"
> | null;
export type ResolvedMailProvider = Exclude<
  DashboardMailProvider,
  "auto"
> | null;
export type ResolvedTaskProvider = DashboardTaskProvider | null;

export const resolveCalendarProvider = (
  preferred: DashboardCalendarProvider,
  googleToken: string,
  outlookToken: string,
  hasICalSources = false,
): ResolvedCalendarProvider => {
  if (preferred === "google") return googleToken ? "google" : null;
  if (preferred === "outlook") return outlookToken ? "outlook" : null;
  if (preferred === "ical") return hasICalSources ? "ical" : null;
  if (preferred === "zapier") return "zapier";
  if (preferred === "mcp") return "mcp";
  if (googleToken) return "google";
  if (outlookToken) return "outlook";
  if (hasICalSources) return "ical";
  return null;
};

export const resolveMailProvider = (
  preferred: DashboardMailProvider,
  gmailToken: string,
  outlookToken: string,
): ResolvedMailProvider => {
  if (preferred === "gmail") return gmailToken ? "gmail" : null;
  if (preferred === "outlook") return outlookToken ? "outlook" : null;
  if (preferred === "zapier") return "zapier";
  if (preferred === "mcp") return "mcp";
  if (gmailToken) return "gmail";
  if (outlookToken) return "outlook";
  return null;
};

export const resolveTaskProvider = (
  preferred: DashboardTaskProvider,
  googleTasksToken: string,
  googleAuthAvailable = false,
): ResolvedTaskProvider => {
  if (preferred === "notion") return "notion";
  if (preferred === "zapier") return "zapier";
  if (preferred === "mcp") return "mcp";
  if (preferred === "google")
    return googleTasksToken || googleAuthAvailable ? "google" : null;
  return "internal";
};

export const parseEventStartMs = (startValue?: string): number | null => {
  if (!startValue) return null;
  const parsed = Date.parse(startValue);
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatRelativeTime = (
  startValue?: string,
  now = Date.now(),
): string => {
  const startMs = parseEventStartMs(startValue);
  if (!startMs) return "";
  const diffMs = startMs - now;
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 1) {
    return diffMs >= 0 ? "Starting now" : "Started just now";
  }
  if (diffMinutes > 0 && diffMinutes < 60) {
    return `In ${diffMinutes}m`;
  }
  if (diffMinutes >= 60 && diffMinutes < 24 * 60) {
    return `In ${Math.round(diffMinutes / 60)}h`;
  }
  if (diffMinutes < 0 && diffMinutes > -60) {
    return `${Math.abs(diffMinutes)}m ago`;
  }
  if (diffMinutes <= -60 && diffMinutes > -24 * 60) {
    return `${Math.round(Math.abs(diffMinutes) / 60)}h ago`;
  }

  return new Date(startMs).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

export const getDayPartGreeting = (date = new Date()): string => {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};
