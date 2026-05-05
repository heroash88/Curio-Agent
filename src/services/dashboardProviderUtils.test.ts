import { describe, expect, it } from "vitest";

import {
  resolveCalendarProvider,
  resolveMailProvider,
  resolveTaskProvider,
} from "./dashboardProviderUtils";

describe("resolveCalendarProvider", () => {
  it("selects imported iCal calendars when requested or when no cloud calendar is connected", () => {
    expect(resolveCalendarProvider("ical", "", "", true)).toBe("ical");
    expect(resolveCalendarProvider("ical", "", "", false)).toBeNull();
    expect(resolveCalendarProvider("auto", "", "", true)).toBe("ical");
    expect(resolveCalendarProvider("auto", "google-token", "", true)).toBe("google");
  });

  it("allows Zapier as an explicit provider without borrowing direct account tokens", () => {
    expect(resolveCalendarProvider("zapier", "", "", false)).toBe("zapier");
    expect(resolveMailProvider("zapier", "", "")).toBe("zapier");
    expect(resolveTaskProvider("zapier", "", false)).toBe("zapier");
  });
});
