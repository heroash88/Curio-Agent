import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readDashboardWidgetCss = () =>
  readFileSync(resolve(process.cwd(), "src/styles/dashboard-widgets.css"), "utf8");

const extractRule = (source: string, selector: string) => {
  const selectorIndex = source.indexOf(selector);
  expect(selectorIndex).toBeGreaterThanOrEqual(0);
  const openBraceIndex = source.indexOf("{", selectorIndex);
  const closeBraceIndex = source.indexOf("}", openBraceIndex);

  return source.slice(openBraceIndex + 1, closeBraceIndex);
};

describe("dashboard widget control CSS", () => {
  it("tints dark theme action dots with the dashboard accent instead of plain white", () => {
    const source = readDashboardWidgetCss();

    expect(source).toContain('[data-theme="dark"] .dashboard-widget-menu-button');
    expect(source).toContain("color-mix(in srgb, var(--dashboard-accent)");
  });

  it("keeps menu button chrome on dark-theme control tokens", () => {
    const source = readDashboardWidgetCss();
    const menuRule = extractRule(source, ".dashboard-widget-menu-button");
    const darkActiveRule = extractRule(
      source,
      '[data-theme="dark"] .dashboard-widget-menu-button:hover,',
    );

    expect(menuRule).toContain("var(--ether-control-bg)");
    expect(menuRule).not.toContain("var(--ether-surface-bright)");
    expect(darkActiveRule).toContain("background:");
    expect(darkActiveRule).toContain("var(--ether-control-bg)");
    expect(darkActiveRule).toContain("var(--dashboard-accent)");
  });

  it("does not let global card theme selectors recolor dashboard menu buttons", () => {
    const source = readDashboardWidgetCss();

    expect(source).not.toContain('html[data-card-theme="light"] .dashboard-widget-menu-button');
    expect(source).not.toContain('html[data-card-theme="dark"] .dashboard-widget-menu-button');
  });
});
