import { beforeEach, describe, expect, it } from "vitest";

import {
  getProfileDashboardPages,
  setProfileDashboardPages,
} from "./dashboardSettings";

const makePage = (appearance: Record<string, unknown>) => ({
  id: "home",
  name: "Home",
  appearance,
  widgets: [],
  createdAt: 1,
  updatedAt: 1,
});

describe("dashboard page appearance settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("preserves animated dashboard background appearances", () => {
    localStorage.setItem(
      "curio_dashboard_pages",
      JSON.stringify([
        makePage({
          themeMode: "dark",
          accentPreset: "neon",
          backgroundStyle: "animated",
          backgroundColor: "#02130d",
          glassEffectEnabled: true,
          animationPreset: "matrix",
        }),
      ]),
    );

    expect(getProfileDashboardPages(null)[0].appearance).toEqual({
      themeMode: "dark",
      accentPreset: "neon",
      backgroundStyle: "animated",
      backgroundColor: "#02130d",
      glassEffectEnabled: true,
      animationPreset: "matrix",
    });
  });

  it("drops unknown animation presets while keeping the rest of the page", () => {
    localStorage.setItem(
      "curio_dashboard_pages",
      JSON.stringify([
        makePage({
          backgroundStyle: "animated",
          animationPreset: "screensaver",
        }),
      ]),
    );

    expect(getProfileDashboardPages(null)[0].appearance).toEqual({
      backgroundStyle: "animated",
    });
  });

  it("normalizes generated animated themes when they are persisted", () => {
    setProfileDashboardPages(
      [
        makePage({
          themeMode: "dark",
          accentPreset: "neon",
          backgroundStyle: "animated",
          animationPreset: "particles",
          accentColor: "#22f7a5",
        }),
      ],
      null,
    );

    expect(JSON.parse(localStorage.getItem("curio_dashboard_pages") || "[]")[0].appearance)
      .toMatchObject({
        backgroundStyle: "animated",
        animationPreset: "particles",
        accentColor: "#22f7a5",
      });
  });

  it("preserves expanded animated background presets", () => {
    localStorage.setItem(
      "curio_dashboard_pages",
      JSON.stringify([
        makePage({
          backgroundStyle: "animated",
          animationPreset: "aurora",
        }),
      ]),
    );

    expect(getProfileDashboardPages(null)[0].appearance).toEqual({
      backgroundStyle: "animated",
      animationPreset: "aurora",
    });
  });

  it("normalizes generated animation specs with clamped controls", () => {
    localStorage.setItem(
      "curio_dashboard_pages",
      JSON.stringify([
        makePage({
          backgroundStyle: "animated",
          animationPreset: "generated",
          generatedAnimation: {
            kind: "ribbons",
            colors: ["#22f7a5", "javascript:alert(1)", "rgba(125, 211, 252, 0.9)"],
            density: -12,
            speed: 220,
            complexity: 42,
            shape: "lines",
            direction: "left",
            glow: true,
          },
        }),
      ]),
    );

    expect(getProfileDashboardPages(null)[0].appearance).toEqual({
      backgroundStyle: "animated",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "ribbons",
        colors: ["#22f7a5", "rgba(125, 211, 252, 0.9)"],
        density: 0,
        speed: 100,
        complexity: 42,
        shape: "lines",
        direction: "left",
        glow: true,
      },
    });
  });

  it("preserves layered generated animation specs", () => {
    localStorage.setItem(
      "curio_dashboard_pages",
      JSON.stringify([
        makePage({
          backgroundStyle: "animated",
          animationPreset: "generated",
          generatedAnimation: {
            kind: "wormhole",
            colors: ["#22f7a5", "#7dd3fc"],
            density: 76,
            speed: 64,
            complexity: 90,
            layers: [
              {
                kind: "nebula",
                colors: ["#22f7a5", "bad color", "#a78bfa"],
                opacity: 82,
                blendMode: "screen",
                depth: 18,
                scale: 96,
                trail: 44,
                pulse: 58,
                turbulence: 72,
                blur: 36,
              },
              {
                kind: "energyRibbons",
                colors: ["#7dd3fc"],
                opacity: 72,
                blendMode: "lighter",
                direction: "right",
                shape: "lines",
                glow: true,
              },
            ],
          },
        }),
      ]),
    );

    expect(getProfileDashboardPages(null)[0].appearance).toEqual({
      backgroundStyle: "animated",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "wormhole",
        colors: ["#22f7a5", "#7dd3fc"],
        density: 72,
        speed: 64,
        complexity: 88,
        shape: "dots",
        direction: "up",
        glow: true,
        layers: [
          {
            kind: "nebula",
            colors: ["#22f7a5", "#a78bfa"],
            opacity: 82,
            blendMode: "screen",
            depth: 18,
            scale: 96,
            trail: 36,
            pulse: 58,
            turbulence: 72,
            blur: 36,
          },
          {
            kind: "energyRibbons",
            colors: ["#7dd3fc"],
            opacity: 72,
            blendMode: "lighter",
            direction: "right",
            shape: "lines",
            glow: true,
          },
        ],
      },
    });
  });

  it("preserves generated weather and elemental animation specs", () => {
    localStorage.setItem(
      "curio_dashboard_pages",
      JSON.stringify([
        makePage({
          backgroundStyle: "animated",
          animationPreset: "generated",
          generatedAnimation: {
            kind: "fire",
            colors: ["#fb923c", "#ef4444"],
            density: 88,
            speed: 72,
            complexity: 90,
            shape: "lines",
            direction: "up",
            glow: true,
            layers: [
              {
                kind: "embers",
                colors: ["#facc15"],
                opacity: 80,
                blendMode: "lighter",
                direction: "up",
                trail: 90,
                blur: 90,
                glow: true,
              },
              {
                kind: "fog",
                colors: ["rgba(255, 255, 255, 0.64)"],
                opacity: 36,
                blendMode: "screen",
                direction: "right",
                blur: 90,
              },
            ],
          },
        }),
      ]),
    );

    expect(getProfileDashboardPages(null)[0].appearance).toEqual({
      backgroundStyle: "animated",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "fire",
        colors: ["#fb923c", "#ef4444"],
        density: 72,
        speed: 72,
        complexity: 88,
        shape: "lines",
        direction: "up",
        glow: true,
        layers: [
          {
            kind: "embers",
            colors: ["#facc15"],
            opacity: 80,
            blendMode: "lighter",
            direction: "up",
            trail: 46,
            blur: 18,
            glow: true,
          },
          {
            kind: "fog",
            colors: ["rgba(255, 255, 255, 0.64)"],
            opacity: 36,
            blendMode: "screen",
            direction: "right",
            blur: 42,
          },
        ],
      },
    });
  });

  it("drops generated animation specs when the background is not animated", () => {
    localStorage.setItem(
      "curio_dashboard_pages",
      JSON.stringify([
        makePage({
          backgroundStyle: "gradient",
          animationPreset: "generated",
          generatedAnimation: {
            kind: "particles",
            colors: ["#22f7a5"],
            density: 50,
            speed: 50,
            complexity: 50,
          },
        }),
      ]),
    );

    expect(getProfileDashboardPages(null)[0].appearance).toEqual({
      backgroundStyle: "gradient",
    });
  });
});
