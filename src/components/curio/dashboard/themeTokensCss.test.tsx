import { describe, expect, it } from "vitest";
import { readAllAppCss } from "../../../styles/readCss";

const readRule = (css: string, selector: string) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
};

describe("light theme surface tokens", () => {
  it("uses near-white shared highlights for light mode controls and cards", () => {
    const css = readAllAppCss();
    const appLightRule = css.match(
      /\.light-mode,\s*\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/,
    )?.[1] ?? "";
    const cardLightRule = readRule(css, 'html[data-card-theme="light"] .card-glass');

    [appLightRule, cardLightRule].forEach((rule) => {
      expect(rule).toContain("--ether-surface-container-low: #fbfcff;");
      expect(rule).toContain("--ether-surface-container: #ffffff;");
      expect(rule).toContain("--ether-control-bg: rgba(255, 255, 255, 0.66);");
      expect(rule).toContain("--ether-control-hover: rgba(255, 255, 255, 0.78);");
    });
  });
});
