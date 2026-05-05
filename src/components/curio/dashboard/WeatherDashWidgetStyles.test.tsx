import { describe, expect, it } from "vitest";
import { readAllAppCss } from "../../../styles/readCss";

const css = readAllAppCss();

const readRule = (selector: string) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`));
  return match?.groups?.body ?? "";
};

describe("WeatherDashWidget icon styles", () => {
  it("does not clip the primary sun glow into a box", () => {
    const iconSlotRule = readRule(".dashboard-weather-card .weather-primary-icon-slot");

    expect(iconSlotRule).toContain("overflow: visible");
    expect(iconSlotRule).not.toContain("contain: layout paint style");
  });
});
