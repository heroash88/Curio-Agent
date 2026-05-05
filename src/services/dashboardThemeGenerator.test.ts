import { describe, expect, it } from "vitest";

import {
  buildDashboardThemeAppearance,
  generateDashboardThemeFromPrompt,
  isDashboardThemeResetPrompt,
} from "./dashboardThemeGenerator";

describe("dashboard theme generator", () => {
  it("honors explicit light mode requests even for dark-coded styles", () => {
    expect(generateDashboardThemeFromPrompt("light mode Matrix terminal")).toMatchObject({
      themeMode: "light",
      backgroundStyle: "animated",
      animationPreset: "matrix",
    });
  });

  it("lets explicit dark requests win over bright palette language", () => {
    expect(generateDashboardThemeFromPrompt("dark Matrix terminal with bright green glass"))
      .toMatchObject({
        themeMode: "dark",
        backgroundStyle: "animated",
        animationPreset: "matrix",
      });
  });

  it("maps visual effect language beyond Matrix to animated presets", () => {
    expect(generateDashboardThemeFromPrompt("soft aurora borealis glass"))
      .toMatchObject({
        animationPreset: "aurora",
        backgroundStyle: "animated",
      });
    expect(generateDashboardThemeFromPrompt("light aurora borealis glass"))
      .toMatchObject({
        themeMode: "light",
        animationPreset: "aurora",
        backgroundStyle: "animated",
      });
    expect(generateDashboardThemeFromPrompt("retro neon perspective grid"))
      .toMatchObject({
        animationPreset: "grid",
        backgroundStyle: "animated",
      });
    expect(generateDashboardThemeFromPrompt("liquid plasma lava lamp"))
      .toMatchObject({
        animationPreset: "plasma",
        backgroundStyle: "animated",
      });
  });

  it("can use an AI supplied custom accent color instead of only a preset", () => {
    expect(buildDashboardThemeAppearance({
      prompt: "cyberpunk command center",
      accentColor: "#ff2bd6",
    })).toMatchObject({
      themeMode: "dark",
      backgroundStyle: "animated",
      accentColor: "#ff2bd6",
    });
  });

  it("can generate a custom animated background spec from novel animation language", () => {
    const appearance = buildDashboardThemeAppearance({
      prompt: "make a blue firefly forest animation with slow glowing dots",
    });

    expect(appearance).toMatchObject({
      backgroundStyle: "animated",
      animationPreset: "generated",
      glassEffectEnabled: true,
      generatedAnimation: {
        kind: "particles",
        shape: "dots",
        direction: "up",
        glow: true,
      },
    });
    expect(appearance.generatedAnimation?.colors).toEqual(
      expect.arrayContaining(["#93c5fd", "#a7f3d0"]),
    );
  });

  it("maps weather and elemental prompts to richer generated animation families", () => {
    const fire = buildDashboardThemeAppearance({
      prompt: "maximum cinematic fire background with flame tongues, smoke, ash, and glowing embers",
    });
    expect(fire).toMatchObject({
      backgroundStyle: "animated",
      animationPreset: "generated",
      accentPreset: "ember",
      generatedAnimation: {
        kind: "fire",
        direction: "up",
        glow: true,
      },
    });
    expect(fire.generatedAnimation?.layers?.map((layer) => layer.kind))
      .toEqual(expect.arrayContaining(["embers", "fog"]));

    const snow = buildDashboardThemeAppearance({
      prompt: "quiet snowfall blizzard dashboard with frost",
    });
    expect(snow).toMatchObject({
      backgroundStyle: "animated",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "snow",
        direction: "down",
      },
    });

    const storm = buildDashboardThemeAppearance({
      prompt: "heavy rainstorm with lightning over the dashboard",
    });
    expect(storm).toMatchObject({
      backgroundStyle: "animated",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "rain",
        shape: "lines",
        direction: "down",
      },
    });
    expect(storm.generatedAnimation?.layers?.map((layer) => layer.kind))
      .toEqual(expect.arrayContaining(["lightning"]));

    const underwater = buildDashboardThemeAppearance({
      prompt: "underwater dashboard with drifting bubbles and caustic waves",
    });
    expect(underwater).toMatchObject({
      backgroundStyle: "animated",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "bubbles",
        direction: "up",
      },
    });
  });

  it("maps documented AI theme prompt examples to the intended effect families", () => {
    expect(buildDashboardThemeAppearance({
      prompt: "Make my dashboard a dark volcanic command center with realistic fire, smoke, orange glass, and glowing embers behind every widget.",
    })).toMatchObject({
      themeMode: "dark",
      accentPreset: "ember",
      backgroundStyle: "animated",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "fire",
        direction: "up",
      },
    });

    expect(buildDashboardThemeAppearance({
      prompt: "Create a calm light-mode snowfall dashboard with icy blue accents, soft white glass cards, drifting snow, and gentle fog.",
    })).toMatchObject({
      themeMode: "light",
      accentPreset: "arctic",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "snow",
        direction: "down",
      },
    });

    const rainyCyberpunk = buildDashboardThemeAppearance({
      prompt: "Turn this into a rainy cyberpunk night dashboard with neon reflections, diagonal rain streaks, electric purple highlights, and occasional lightning.",
    });
    expect(rainyCyberpunk).toMatchObject({
      themeMode: "dark",
      accentPreset: "orchid",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "rain",
        direction: "down",
        shape: "lines",
      },
    });
    expect(rainyCyberpunk.generatedAnimation?.layers?.map((layer) => layer.kind))
      .not.toContain("dataStorm");

    expect(buildDashboardThemeAppearance({
      prompt: "Give me an underwater research lab theme with teal glass, rising bubbles, slow wave caustics, and bright readable widgets.",
    })).toMatchObject({
      themeMode: "dark",
      accentPreset: "arctic",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "bubbles",
        direction: "up",
      },
    });

    const thunderstorm = buildDashboardThemeAppearance({
      prompt: "Make a thunderstorm operations dashboard: dark mode, storm clouds, blue lightning bolts, wet glass, and high contrast text.",
    });
    expect(thunderstorm).toMatchObject({
      themeMode: "dark",
      accentPreset: "arctic",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "lightning",
      },
    });
    expect(thunderstorm.generatedAnimation?.layers?.map((layer) => layer.kind))
      .not.toContain("dataStorm");

    expect(buildDashboardThemeAppearance({
      prompt: "Create a cozy fireplace dashboard with warm amber glass, slow embers, subtle smoke, and no harsh red background.",
    })).toMatchObject({
      themeMode: "dark",
      accentPreset: "ember",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "fire",
        complexity: 58,
      },
    });

    expect(buildDashboardThemeAppearance({
      prompt: "Make it a winter aurora theme in light mode with pale green accents, snowfall, mist, and glassy white widgets.",
    })).toMatchObject({
      themeMode: "light",
      accentPreset: "aurora",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "snow",
        colors: expect.arrayContaining(["#86efac"]),
      },
    });

    expect(buildDashboardThemeAppearance({
      prompt: "Turn my dashboard into a deep-space wormhole with star trails, violet and cyan glow, layered particles, and dark readable cards.",
    })).toMatchObject({
      themeMode: "dark",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "wormhole",
      },
    });

    expect(generateDashboardThemeFromPrompt(
      "Make a Matrix terminal dashboard with animated digital rain, black glass, green accents, and dense code-like motion.",
    )).toMatchObject({
      themeMode: "dark",
      accentPreset: "neon",
      backgroundStyle: "animated",
      animationPreset: "matrix",
    });

    expect(isDashboardThemeResetPrompt("Reset the dashboard theme back to the default look."))
      .toBe(true);
  });

  it("normalizes explicit AI generated animation controls", () => {
    expect(buildDashboardThemeAppearance({
      backgroundStyle: "animated",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "orbits",
        colors: ["#abc", "#123456", "url(bad)"],
        density: 140,
        speed: -10,
        complexity: 48,
        shape: "rings",
        direction: "radial",
        glow: true,
      },
    })).toMatchObject({
      backgroundStyle: "animated",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "orbits",
        colors: ["#abc", "#123456"],
        density: 100,
        speed: 0,
        complexity: 48,
        shape: "rings",
        direction: "radial",
        glow: true,
      },
    });
  });

  it("normalizes layered cinematic animation controls", () => {
    expect(buildDashboardThemeAppearance({
      backgroundStyle: "animated",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "wormhole",
        colors: ["#08111f", "#7dd3fc"],
        density: 88,
        speed: 74,
        complexity: 96,
        layers: [
          {
            kind: "nebula",
            colors: ["#123456", "javascript:alert(1)", "rgba(125, 211, 252, 0.9)"],
            opacity: 130,
            blendMode: "lighter",
            depth: -10,
            scale: 180,
            trail: 88,
            pulse: 120,
            turbulence: 42,
            blur: 140,
            shape: "rings",
            direction: "radial",
            glow: true,
          },
          {
            kind: "not-real",
            colors: ["#abcdef"],
            opacity: 62,
            blendMode: "bad-mode",
          },
        ],
      },
    })).toMatchObject({
      backgroundStyle: "animated",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "wormhole",
        layers: [
          {
            kind: "nebula",
            colors: ["#123456", "rgba(125, 211, 252, 0.9)"],
            opacity: 100,
            blendMode: "lighter",
            depth: 0,
            scale: 100,
            trail: 36,
            pulse: 100,
            turbulence: 42,
            blur: 56,
            shape: "rings",
            direction: "radial",
            glow: true,
          },
          {
            kind: "particles",
            colors: ["#abcdef"],
            opacity: 62,
            blendMode: "screen",
          },
        ],
      },
    });
  });

  it("builds cinematic generated layers from wow-factor prompts", () => {
    const appearance = buildDashboardThemeAppearance({
      prompt: "maximum wow factor cinematic wormhole with nebula fog, radar pulses, data storm, energy ribbons, depth and trails",
    });

    expect(appearance).toMatchObject({
      backgroundStyle: "animated",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "wormhole",
        glow: true,
      },
    });
    expect(appearance.generatedAnimation?.layers?.map((layer) => layer.kind))
      .toEqual(expect.arrayContaining([
        "nebula",
        "wormhole",
        "energyRibbons",
        "dataStorm",
        "radar",
      ]));
  });

  it("keeps complex generated animation specs inside a desktop render budget", () => {
    const appearance = buildDashboardThemeAppearance({
      backgroundStyle: "animated",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "wormhole",
        colors: ["#7dd3fc", "#f0abfc"],
        density: 100,
        speed: 100,
        complexity: 100,
        layers: [
          { kind: "constellation", colors: ["#7dd3fc"], density: 100, trail: 100, blur: 100 },
          { kind: "mesh", colors: ["#22d3ee"], density: 100, trail: 100, blur: 100 },
          { kind: "dataStorm", colors: ["#34d399"], density: 100, trail: 100, blur: 100 },
          { kind: "nebula", colors: ["#a78bfa"], density: 100, trail: 100, blur: 100 },
          { kind: "wormhole", colors: ["#f0abfc"], density: 100, trail: 100, blur: 100 },
          { kind: "energyRibbons", colors: ["#fb7185"], density: 100, trail: 100, blur: 100 },
          { kind: "radar", colors: ["#facc15"], density: 100, trail: 100, blur: 100 },
        ],
      },
    });

    expect(appearance.generatedAnimation?.density).toBeLessThanOrEqual(72);
    expect(appearance.generatedAnimation?.layers).toHaveLength(6);
    expect(appearance.generatedAnimation?.layers).toEqual([
      expect.objectContaining({ kind: "constellation", density: 46, trail: 24, blur: 18 }),
      expect.objectContaining({ kind: "mesh", density: 46, trail: 24, blur: 18 }),
      expect.objectContaining({ kind: "dataStorm", density: 72, trail: 34, blur: 10 }),
      expect.objectContaining({ kind: "nebula", density: 24, trail: 36, blur: 56 }),
      expect.objectContaining({ kind: "wormhole", density: 54, trail: 60, blur: 28 }),
      expect.objectContaining({ kind: "energyRibbons", density: 54, trail: 58, blur: 20 }),
    ]);
  });

  it("normalizes new weather and elemental generated animation families", () => {
    const appearance = buildDashboardThemeAppearance({
      backgroundStyle: "animated",
      animationPreset: "generated",
      generatedAnimation: {
        kind: "fire",
        colors: ["#fb923c", "#ef4444"],
        density: 100,
        speed: 100,
        complexity: 100,
        direction: "up",
        layers: [
          { kind: "snow", colors: ["#ffffff"], density: 100, trail: 100, blur: 100 },
          { kind: "rain", colors: ["#7dd3fc"], density: 100, trail: 100, blur: 100 },
          { kind: "lightning", colors: ["#e0f2fe"], density: 100, trail: 100, blur: 100 },
          { kind: "fog", colors: ["rgba(255, 255, 255, 0.8)"], density: 100, trail: 100, blur: 100 },
          { kind: "bubbles", colors: ["#67e8f9"], density: 100, trail: 100, blur: 100 },
          { kind: "embers", colors: ["#facc15"], density: 100, trail: 100, blur: 100 },
        ],
      },
    });

    expect(appearance.generatedAnimation).toMatchObject({
      kind: "fire",
      density: 72,
      complexity: 88,
      layers: [
        expect.objectContaining({ kind: "snow", density: 82, trail: 24, blur: 12 }),
        expect.objectContaining({ kind: "rain", density: 72, trail: 34, blur: 10 }),
        expect.objectContaining({ kind: "lightning", density: 18, trail: 24, blur: 14 }),
        expect.objectContaining({ kind: "fog", density: 20, trail: 28, blur: 42 }),
        expect.objectContaining({ kind: "bubbles", density: 56, trail: 20, blur: 14 }),
        expect.objectContaining({ kind: "embers", density: 72, trail: 46, blur: 18 }),
      ],
    });
  });
});
