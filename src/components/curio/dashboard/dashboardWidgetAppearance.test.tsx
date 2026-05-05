import { describe, expect, it } from "vitest";

import {
  getDashboardWidgetGlowLayerStyle,
  resolveDashboardWidgetAccent,
} from "./dashboardWidgetAppearance";

describe("dashboard widget appearance", () => {
  it("resolves custom widget accents with a restrained glow alpha", () => {
    expect(resolveDashboardWidgetAccent("#10b981")).toMatchObject({
      solid: "rgb(16, 185, 129)",
      soft: "rgba(16, 185, 129, 0.07)",
      glow: "rgba(16, 185, 129, 0.14)",
    });
  });

  it("builds a subtle default widget glow layer", () => {
    const style = getDashboardWidgetGlowLayerStyle(undefined, true);

    expect(style.opacity).toBe("0.62");
    expect(style.background).toContain("var(--dashboard-accent) 14%");
    expect(style.background).toContain("var(--dashboard-accent) 8%");
    expect(style.boxShadow).toContain("0 10px 24px");
    expect(style.boxShadow).toContain("inset 0 0 14px");
  });
});
