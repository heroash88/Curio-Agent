import {
  getProfileActiveDashboardPageId,
  getProfileDashboardPages,
  setProfileDashboardPages,
} from "../utils/settingsStorage";
import {
  DASHBOARD_ANIMATION_PRESETS,
  type DashboardAccentPreset,
  type DashboardAnimationPreset,
  type DashboardGeneratedAnimationKind,
  type DashboardGeneratedAnimationLayer,
  type DashboardPageAppearance,
  type DashboardPageBackgroundStyle,
  type DashboardPageThemeMode,
} from "./dashboardTypes";
import {
  DEFAULT_DASHBOARD_GENERATED_ANIMATION,
  ensureDashboardGeneratedAnimationSpec,
  normalizeDashboardGeneratedAnimationSpec,
} from "./dashboardGeneratedAnimation";
import { DASHBOARD_ACCENT_ORDER } from "./dashboardVisualPresets";
import { getSpeakerSessionState } from "./speakerSessionStore";

const BACKGROUND_STYLES: DashboardPageBackgroundStyle[] = [
  "default",
  "solid",
  "gradient",
  "image",
  "animated",
];

const animationPresetValues = new Set<DashboardAnimationPreset>(
  DASHBOARD_ANIMATION_PRESETS,
);
const accentPresetValues = new Set<DashboardAccentPreset>(DASHBOARD_ACCENT_ORDER);
const backgroundStyleValues = new Set<DashboardPageBackgroundStyle>(
  BACKGROUND_STYLES,
);

export interface DashboardThemeGenerationInput {
  prompt?: unknown;
  themeMode?: unknown;
  accentPreset?: unknown;
  accentColor?: unknown;
  backgroundStyle?: unknown;
  backgroundColor?: unknown;
  glassEffectEnabled?: unknown;
  animationPreset?: unknown;
  generatedAnimation?: unknown;
}

export interface DashboardThemeApplyResult {
  success: boolean;
  profileId: string | null;
  pageId: string | null;
  appearance: DashboardPageAppearance;
  prompt?: string;
  error?: string;
}

const normalizeKeywordPrompt = (prompt: string) =>
  prompt.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

const hasAnyKeyword = (prompt: string, keywords: string[]) =>
  keywords.some((keyword) => prompt.includes(keyword));

const hasAnyWord = (prompt: string, words: string[]) => {
  const promptWords = new Set(prompt.split(" ").filter(Boolean));
  return words.some((word) => promptWords.has(word));
};

export const isDashboardThemeResetPrompt = (prompt: unknown): boolean => {
  const normalized = normalizeKeywordPrompt(typeof prompt === "string" ? prompt : "");
  if (!normalized) return false;
  return (
    hasAnyKeyword(normalized, [
      "reset dashboard theme",
      "reset theme",
      "restore dashboard theme",
      "restore theme",
      "back to default",
      "default look",
      "default theme",
      "profile defaults",
      "clear theme",
    ]) ||
    (hasAnyWord(normalized, ["reset", "restore"]) &&
      hasAnyWord(normalized, ["theme", "dashboard", "default"]))
  );
};

const inferRequestedMode = (
  prompt: string,
): DashboardPageThemeMode | undefined => {
  if (hasAnyKeyword(prompt, ["light mode", "bright mode", "bright theme", "day mode", "white mode"])) {
    return "light";
  }
  if (hasAnyKeyword(prompt, ["dark mode", "dark", "night", "black", "noir", "moody", "deep"])) {
    return "dark";
  }
  if (
    hasAnyWord(prompt, ["light", "white", "ivory", "pastel", "frosted", "airy", "paper"]) ||
    hasAnyKeyword(prompt, ["daylight"])
  ) {
    return "light";
  }
  return undefined;
};

const withPromptMode = (
  prompt: string,
  appearance: DashboardPageAppearance,
  lightBackgroundColor?: string,
): DashboardPageAppearance => {
  const requestedMode = inferRequestedMode(prompt);
  if (!requestedMode) return appearance;
  return {
    ...appearance,
    themeMode: requestedMode,
    backgroundColor:
      requestedMode === "light" && lightBackgroundColor
        ? lightBackgroundColor
        : appearance.backgroundColor,
  };
};

const buildCinematicGeneratedLayers = (
  prompt: string,
  colors: string[],
  baseKind: DashboardGeneratedAnimationKind,
): DashboardGeneratedAnimationLayer[] => {
  const wantsWow = hasAnyKeyword(prompt, [
    "wow",
    "cinematic",
    "complex",
    "complicated",
    "advanced",
    "depth",
    "trails",
    "layered",
    "cooler",
    "maximum",
    "epic",
    "immersive",
  ]);
  const layers: DashboardGeneratedAnimationLayer[] = [];
  const pushLayer = (layer: DashboardGeneratedAnimationLayer) => {
    if (layers.some((existing) => existing.kind === layer.kind)) return;
    layers.push(layer);
  };
  const weatherStorm =
    hasAnyKeyword(prompt, ["rainstorm", "thunder", "lightning", "monsoon", "downpour"]) ||
    (hasAnyWord(prompt, ["storm"]) &&
      !hasAnyKeyword(prompt, ["data storm", "code storm", "digital storm"]));
  const wantsDataStorm = hasAnyKeyword(prompt, [
    "data storm",
    "code storm",
    "digital storm",
    "code rain",
    "digital rain",
    "matrix rain",
    "matrix",
    "terminal rain",
    "code cascade",
    "data stream",
  ]);

  if (baseKind === "fire" || hasAnyKeyword(prompt, ["flame", "flames", "ember", "embers", "ash", "smoke", "inferno"])) {
    pushLayer({
      kind: "embers",
      colors,
      density: 54,
      opacity: 68,
      blendMode: "lighter",
      depth: 58,
      scale: 58,
      trail: 48,
      pulse: 52,
      turbulence: 64,
      blur: 10,
      shape: "dots",
      direction: "up",
      glow: true,
    });
    pushLayer({
      kind: "fog",
      colors: ["rgba(255, 255, 255, 0.58)", "#64748b", "#1f2937"],
      density: 16,
      opacity: 24,
      blendMode: "screen",
      depth: 18,
      scale: 92,
      trail: 28,
      pulse: 22,
      turbulence: 74,
      blur: 42,
      direction: "right",
      glow: false,
    });
  }

  if (baseKind === "snow" || hasAnyKeyword(prompt, ["snow", "snowfall", "blizzard", "frost", "ice"])) {
    pushLayer({
      kind: "fog",
      colors: ["rgba(255, 255, 255, 0.72)", "#bae6fd", "#e0f2fe"],
      opacity: 30,
      blendMode: "screen",
      depth: 16,
      scale: 86,
      trail: 18,
      pulse: 18,
      turbulence: 52,
      blur: 36,
      direction: "right",
      glow: false,
    });
  }

  if (baseKind === "rain" || weatherStorm) {
    if (baseKind !== "lightning" && (weatherStorm || hasAnyKeyword(prompt, ["thunder", "lightning", "electric"]))) {
      pushLayer({
        kind: "lightning",
        colors: ["#f8fafc", "#bae6fd", "#a78bfa"],
        opacity: 58,
        blendMode: "lighter",
        depth: 24,
        scale: 80,
        trail: 24,
        pulse: 92,
        turbulence: 60,
        blur: 14,
        shape: "lines",
        direction: "down",
        glow: true,
      });
    }
    if (weatherStorm || hasAnyKeyword(prompt, ["mist", "fog", "wet", "moody"])) {
      pushLayer({
        kind: "fog",
        colors: ["rgba(224, 242, 254, 0.62)", "#64748b", "#1e293b"],
        opacity: 24,
        blendMode: "screen",
        depth: 12,
        scale: 94,
        trail: 24,
        pulse: 20,
        turbulence: 54,
        blur: 38,
        direction: "right",
        glow: false,
      });
    }
  }

  if (baseKind === "lightning") {
    pushLayer({
      kind: "rain",
      colors: ["#7dd3fc", "#38bdf8", "#e0f2fe"],
      opacity: 42,
      blendMode: "screen",
      depth: 54,
      scale: 68,
      trail: 34,
      pulse: 18,
      turbulence: 34,
      blur: 6,
      shape: "lines",
      direction: "down",
      glow: true,
    });
  }

  if (baseKind === "bubbles" || hasAnyKeyword(prompt, ["underwater", "bubble", "bubbles", "caustic"])) {
    pushLayer({
      kind: "waves",
      colors,
      opacity: 36,
      blendMode: "screen",
      depth: 20,
      scale: 90,
      trail: 32,
      pulse: 40,
      turbulence: 36,
      blur: 10,
      shape: "lines",
      direction: "right",
      glow: true,
    });
  }

  if (wantsWow || hasAnyKeyword(prompt, ["nebula", "fog", "mist", "cloud", "space", "cosmic", "ocean", "aurora"])) {
    pushLayer({
      kind: hasAnyKeyword(prompt, ["aurora", "curtain", "borealis"]) ? "auroraCurtain" : "nebula",
      colors,
      opacity: 46,
      blendMode: "screen",
      depth: 12,
      scale: 100,
      trail: 28,
      pulse: 42,
      turbulence: 70,
      blur: 58,
      glow: true,
    });
  }

  if (baseKind === "orbits" || hasAnyKeyword(prompt, ["wormhole", "portal", "vortex", "tunnel"])) {
    pushLayer({
      kind: "wormhole",
      colors,
      opacity: 72,
      blendMode: "lighter",
      depth: 38,
      scale: 86,
      trail: 74,
      pulse: 72,
      turbulence: 38,
      blur: 12,
      shape: "rings",
      direction: "radial",
      glow: true,
    });
  }

  if (baseKind === "ribbons" || hasAnyKeyword(prompt, ["ribbon", "ribbons", "trail", "trails", "laser", "energy", "flow"])) {
    pushLayer({
      kind: "energyRibbons",
      colors,
      opacity: 76,
      blendMode: "lighter",
      depth: 62,
      scale: 82,
      trail: 80,
      pulse: 58,
      turbulence: 48,
      blur: 8,
      shape: "lines",
      direction: "right",
      glow: true,
    });
  }

  if (wantsDataStorm) {
    pushLayer({
      kind: "dataStorm",
      colors,
      opacity: 62,
      blendMode: "screen",
      depth: 72,
      scale: 56,
      trail: 66,
      pulse: 24,
      turbulence: 16,
      blur: 0,
      shape: "glyphs",
      direction: "down",
      glow: true,
    });
  }

  if (hasAnyKeyword(prompt, ["radar", "scan", "sweep", "sonar", "command deck"])) {
    pushLayer({
      kind: "radar",
      colors,
      opacity: 64,
      blendMode: "lighter",
      depth: 50,
      scale: 72,
      trail: 56,
      pulse: 76,
      turbulence: 0,
      blur: 10,
      shape: "rings",
      direction: "radial",
      glow: true,
    });
  }

  if (wantsWow || baseKind === "mesh" || hasAnyKeyword(prompt, ["constellation", "neural", "mesh", "network", "stars"])) {
    pushLayer({
      kind: "constellation",
      colors,
      opacity: 54,
      blendMode: "screen",
      depth: 82,
      scale: 58,
      trail: 24,
      pulse: 38,
      turbulence: 24,
      shape: "dots",
      direction: "up",
      glow: true,
    });
  }

  if (wantsWow || hasAnyKeyword(prompt, ["scanline", "scanlines", "terminal", "grid", "hud"])) {
    pushLayer({
      kind: "scanlines",
      colors,
      opacity: 28,
      blendMode: "overlay",
      depth: 90,
      scale: 48,
      speed: 32,
      trail: 18,
      pulse: 28,
      shape: "lines",
      direction: "down",
      glow: false,
    });
  }

  return layers.slice(0, 6);
};

const inferGeneratedAnimationTheme = (
  prompt: string,
): DashboardPageAppearance | null => {
  const wantsCustomMotion =
    hasAnyKeyword(prompt, [
      "animated background",
      "custom animation",
      "generate animation",
      "moving background",
      "dynamic background",
      "drifting lights",
      "floating lights",
      "glowing dots",
      "fire",
      "flame",
      "flames",
      "snow",
      "snowfall",
      "blizzard",
      "rain",
      "rainstorm",
      "downpour",
      "storm",
      "lightning",
      "thunder",
      "fog",
      "mist",
      "smoke",
      "underwater",
      "bubbles",
      "bubble",
      "embers",
      "ash",
      "firefly",
      "fireflies",
      "ribbons",
      "orbit",
      "orbits",
    ]) ||
    (
      hasAnyWord(prompt, ["animation", "animated", "moving", "drifting", "floating", "swirling"]) &&
      !hasAnyKeyword(prompt, ["matrix", "starfield", "aurora", "plasma", "perspective grid"])
    );

  if (!wantsCustomMotion) return null;

  const firefly = hasAnyKeyword(prompt, ["firefly", "fireflies", "glowing dots", "drifting lights", "floating lights"]);
  const fire =
    hasAnyWord(prompt, ["fire", "flame", "flames", "inferno", "bonfire", "embers", "ember", "ash"]) ||
    hasAnyKeyword(prompt, ["wildfire", "campfire", "fireplace"]);
  const snow = hasAnyKeyword(prompt, ["snow", "snowfall", "blizzard", "frost", "ice"]);
  const storm = hasAnyKeyword(prompt, ["storm", "rainstorm", "thunder", "lightning", "monsoon", "downpour"]);
  const lightning = hasAnyKeyword(prompt, ["lightning", "thunder", "electric"]);
  const fog = hasAnyKeyword(prompt, ["fog", "mist", "smoke", "haze"]);
  const bubbles = hasAnyKeyword(prompt, ["underwater", "bubble", "bubbles", "caustic", "aquarium"]);
  const ribbons = hasAnyKeyword(prompt, ["ribbon", "ribbons", "silk", "streamer", "light trail"]);
  const orbits = hasAnyKeyword(prompt, ["orbit", "orbits", "orbital", "rings"]);
  const rain = hasAnyKeyword(prompt, ["rain", "rainstorm", "downpour", "drizzle", "showers", "falling", "cascade"]);
  const waves = hasAnyKeyword(prompt, ["wave", "waves", "flow", "flowing"]);
  const grid = hasAnyKeyword(prompt, ["grid", "wireframe", "scanline"]);
  const wormhole = hasAnyKeyword(prompt, ["wormhole", "portal", "vortex", "tunnel"]);
  const dataStorm = hasAnyKeyword(prompt, ["data storm", "code storm", "digital storm"]);
  const cozyFire = fire && hasAnyKeyword(prompt, ["cozy", "fireplace", "hearth", "warm amber", "soft amber", "no harsh red"]);
  const neonWeather = (rain || storm || lightning) && hasAnyKeyword(prompt, ["cyberpunk", "neon", "purple", "violet", "magenta", "electric"]);
  const winterAurora = snow && hasAnyKeyword(prompt, ["aurora", "borealis", "pale green", "green"]);
  const kind: DashboardGeneratedAnimationKind = fire
    ? "fire"
    : snow
      ? "snow"
      : rain
        ? "rain"
        : wormhole
          ? "wormhole"
          : dataStorm
            ? "dataStorm"
            : lightning || storm
              ? "lightning"
              : fog
                ? "fog"
                : bubbles
                  ? "bubbles"
                  : ribbons
                    ? "ribbons"
                    : orbits
                      ? "orbits"
                      : waves
                        ? "waves"
                        : grid
                          ? "grid"
                          : "particles";
  const shape =
    orbits || kind === "bubbles"
      ? "rings"
      : ribbons || waves || rain || fire || lightning || grid
        ? "lines"
        : dataStorm
          ? "glyphs"
          : "dots";
  const direction =
    fire || bubbles
      ? "up"
      : rain || snow || lightning
      ? "down"
      : fog || ribbons || waves || grid
        ? "right"
        : orbits
          ? "radial"
          : "up";
  const colors = firefly
    ? ["#93c5fd", "#a7f3d0", "#fef08a"]
    : fire
      ? cozyFire
        ? ["#fde68a", "#fbbf24", "#fb923c", "#7c2d12"]
        : ["#fde68a", "#facc15", "#fb923c", "#ef4444", "#7f1d1d"]
      : snow
        ? winterAurora
          ? ["#ffffff", "#d1fae5", "#86efac", "#93c5fd", "#5eead4"]
          : ["#ffffff", "#e0f2fe", "#bae6fd", "#93c5fd"]
        : rain || storm
          ? neonWeather
            ? ["#22d3ee", "#a78bfa", "#f0abfc", "#38bdf8"]
            : ["#7dd3fc", "#38bdf8", "#e0f2fe", "#60a5fa"]
          : lightning
            ? neonWeather
              ? ["#f8fafc", "#a78bfa", "#f0abfc", "#22d3ee"]
              : ["#f8fafc", "#bae6fd", "#a78bfa"]
            : fog
              ? ["rgba(255, 255, 255, 0.72)", "#cbd5e1", "#94a3b8"]
              : bubbles
                ? ["#67e8f9", "#7dd3fc", "#e0f2fe", "#22d3ee"]
                : hasAnyKeyword(prompt, ["rose", "pink", "magenta", "purple", "violet"])
                  ? ["#f0abfc", "#c084fc", "#7dd3fc"]
                  : hasAnyKeyword(prompt, ["gold", "amber", "sun", "warm", "orange"])
                    ? ["#fbbf24", "#fb7185", "#fdba74"]
                    : hasAnyKeyword(prompt, ["green", "forest", "moss", "garden"])
                      ? ["#86efac", "#a7f3d0", "#22d3ee"]
                      : ["#7dd3fc", "#a78bfa", "#f0abfc"];
  const darkBackground = fire
    ? cozyFire
      ? "radial-gradient(circle at 24% 88%, rgba(251,191,36,0.24), transparent 34%), radial-gradient(circle at 76% 82%, rgba(251,146,60,0.18), transparent 30%), linear-gradient(145deg, #120b07 0%, #24170e 56%, #050303 100%)"
      : "radial-gradient(circle at 22% 86%, rgba(251,146,60,0.28), transparent 34%), radial-gradient(circle at 70% 76%, rgba(239,68,68,0.20), transparent 32%), linear-gradient(145deg, #170503 0%, #2a0a08 54%, #050202 100%)"
    : snow
      ? "radial-gradient(circle at 22% 12%, rgba(224,242,254,0.26), transparent 34%), linear-gradient(145deg, #081322 0%, #10233a 54%, #0b1020 100%)"
      : rain || storm || lightning
        ? neonWeather
          ? "radial-gradient(circle at 18% 14%, rgba(34,211,238,0.24), transparent 32%), radial-gradient(circle at 82% 8%, rgba(216,180,254,0.24), transparent 30%), linear-gradient(145deg, #06111f 0%, #101226 50%, #030712 100%)"
          : "radial-gradient(circle at 22% 14%, rgba(125,211,252,0.22), transparent 32%), radial-gradient(circle at 82% 8%, rgba(167,139,250,0.16), transparent 30%), linear-gradient(145deg, #07111f 0%, #111827 50%, #020617 100%)"
        : fog
          ? "radial-gradient(circle at 50% 20%, rgba(226,232,240,0.16), transparent 38%), linear-gradient(145deg, #111827 0%, #1f2937 52%, #030712 100%)"
          : bubbles
            ? "radial-gradient(circle at 26% 18%, rgba(103,232,249,0.24), transparent 32%), radial-gradient(circle at 74% 80%, rgba(20,184,166,0.22), transparent 30%), linear-gradient(145deg, #03111f 0%, #06445c 52%, #02131f 100%)"
            : "radial-gradient(circle at 18% 16%, rgba(125,211,252,0.26), transparent 32%), radial-gradient(circle at 82% 18%, rgba(240,171,252,0.20), transparent 30%), linear-gradient(145deg, #07111f 0%, #101827 56%, #0b1020 100%)";
  const lightBackground = fire
    ? cozyFire
      ? "radial-gradient(circle at 24% 86%, rgba(251,191,36,0.22), transparent 34%), radial-gradient(circle at 76% 82%, rgba(251,146,60,0.16), transparent 30%), linear-gradient(145deg, #fff7ed 0%, #ffefd8 54%, #fffaf7 100%)"
      : "radial-gradient(circle at 22% 82%, rgba(251,146,60,0.24), transparent 34%), radial-gradient(circle at 70% 70%, rgba(239,68,68,0.13), transparent 32%), linear-gradient(145deg, #fff7ed 0%, #ffe8df 54%, #fffaf7 100%)"
    : snow
      ? winterAurora
        ? "radial-gradient(circle at 18% 8%, rgba(134,239,172,0.26), transparent 32%), radial-gradient(circle at 82% 12%, rgba(147,197,253,0.24), transparent 30%), linear-gradient(145deg, #f8fffb 0%, #eaf7ff 54%, #ffffff 100%)"
        : "radial-gradient(circle at 22% 12%, rgba(186,230,253,0.34), transparent 34%), linear-gradient(145deg, #f8fbff 0%, #eaf7ff 54%, #ffffff 100%)"
      : rain || storm || lightning
        ? neonWeather
          ? "radial-gradient(circle at 18% 14%, rgba(34,211,238,0.25), transparent 32%), radial-gradient(circle at 82% 8%, rgba(216,180,254,0.20), transparent 30%), linear-gradient(145deg, #eefbff 0%, #f6f2ff 52%, #ffffff 100%)"
          : "radial-gradient(circle at 22% 14%, rgba(125,211,252,0.25), transparent 32%), radial-gradient(circle at 82% 8%, rgba(167,139,250,0.14), transparent 30%), linear-gradient(145deg, #eef8ff 0%, #f3f6fb 52%, #ffffff 100%)"
        : fog
          ? "radial-gradient(circle at 50% 20%, rgba(226,232,240,0.32), transparent 38%), linear-gradient(145deg, #f8fafc 0%, #eef2f7 52%, #ffffff 100%)"
          : bubbles
            ? "radial-gradient(circle at 26% 18%, rgba(103,232,249,0.28), transparent 32%), linear-gradient(145deg, #ecfeff 0%, #e0f7ff 52%, #ffffff 100%)"
            : "radial-gradient(circle at 18% 16%, rgba(125,211,252,0.22), transparent 32%), radial-gradient(circle at 82% 18%, rgba(240,171,252,0.16), transparent 30%), linear-gradient(145deg, #f4fbff 0%, #f8f5ff 56%, #fff 100%)";
  const accentPreset: DashboardAccentPreset = fire
    ? "ember"
    : winterAurora
      ? "aurora"
      : neonWeather
        ? "orchid"
        : snow || rain || storm || lightning || bubbles
      ? "arctic"
      : fog
        ? "graphite"
        : firefly
          ? "moss"
          : "aurora";

  return withPromptMode(prompt, {
    themeMode: hasAnyKeyword(prompt, ["light", "day", "white"]) ? "light" : "dark",
    accentPreset,
    accentColor: colors[0],
    backgroundStyle: "animated",
    backgroundColor: darkBackground,
    glassEffectEnabled: true,
    animationPreset: "generated",
    generatedAnimation: {
      ...DEFAULT_DASHBOARD_GENERATED_ANIMATION,
      kind,
      colors,
      density: firefly ? 42 : cozyFire ? 46 : fire ? 56 : rain || snow ? 66 : 54,
      speed: hasAnyKeyword(prompt, ["slow", "calm", "gentle", "cozy"]) ? 22 : 38,
      complexity: cozyFire ? 58 : fire ? 72 : storm || lightning ? 82 : ribbons || waves ? 70 : 52,
      shape,
      direction,
      glow: true,
      layers: buildCinematicGeneratedLayers(prompt, colors, kind),
    },
  }, lightBackground);
};

export const generateDashboardThemeFromPrompt = (
  prompt: unknown,
): DashboardPageAppearance => {
  const normalized = normalizeKeywordPrompt(typeof prompt === "string" ? prompt : "");

  if (hasAnyKeyword(normalized, ["matrix", "hacker", "terminal", "code rain", "digital rain", "green code"])) {
    return withPromptMode(normalized, {
      themeMode: "dark",
      accentPreset: "neon",
      accentColor: "#22f7a5",
      backgroundStyle: "animated",
      backgroundColor: "radial-gradient(circle at 50% 0%, #053f2f 0%, #020604 42%, #000 100%)",
      glassEffectEnabled: true,
      animationPreset: "matrix",
    }, "radial-gradient(circle at 50% 0%, rgba(34,247,165,0.28) 0%, #e9fff4 42%, #f7fff9 100%)");
  }

  const generatedAnimationTheme = inferGeneratedAnimationTheme(normalized);
  if (generatedAnimationTheme) {
    return generatedAnimationTheme;
  }

  if (hasAnyKeyword(normalized, ["space", "star", "galaxy", "cosmic", "nebula"])) {
    return withPromptMode(normalized, {
      themeMode: "dark",
      accentPreset: "arctic",
      accentColor: "#8bd3ff",
      backgroundStyle: "animated",
      backgroundColor: "radial-gradient(circle at 50% 20%, #18243f 0%, #060914 52%, #02030a 100%)",
      glassEffectEnabled: true,
      animationPreset: "starfield",
    }, "radial-gradient(circle at 50% 20%, rgba(96,165,250,0.28) 0%, #edf7ff 54%, #fff 100%)");
  }

  if (hasAnyKeyword(normalized, ["ocean", "wave", "waves", "aqua", "water", "marine"])) {
    return withPromptMode(normalized, {
      themeMode: "dark",
      accentPreset: "arctic",
      accentColor: "#4dd8ff",
      backgroundStyle: "animated",
      backgroundColor: "linear-gradient(145deg, #03111f 0%, #08334a 48%, #0f5d75 100%)",
      glassEffectEnabled: true,
      animationPreset: "waves",
    }, "linear-gradient(145deg, #e8fbff 0%, #c8eef7 52%, #f6fdff 100%)");
  }

  if (hasAnyKeyword(normalized, ["aurora", "northern lights", "borealis"])) {
    return withPromptMode(normalized, {
      themeMode: "dark",
      accentPreset: "aurora",
      accentColor: "#7fffd4",
      backgroundStyle: "animated",
      backgroundColor: "radial-gradient(circle at 20% 10%, rgba(45,212,191,0.26), transparent 28%), radial-gradient(circle at 82% 18%, rgba(232,121,249,0.22), transparent 30%), linear-gradient(145deg, #06111c 0%, #111827 52%, #0c1224 100%)",
      glassEffectEnabled: true,
      animationPreset: "aurora",
    }, "radial-gradient(circle at 20% 10%, rgba(45,212,191,0.22), transparent 30%), radial-gradient(circle at 82% 18%, rgba(232,121,249,0.18), transparent 32%), linear-gradient(145deg, #f4fffb 0%, #eef7ff 54%, #fff7fe 100%)");
  }

  if (hasAnyKeyword(normalized, ["grid", "synthwave", "retrowave", "outrun", "perspective"])) {
    return withPromptMode(normalized, {
      themeMode: "dark",
      accentPreset: "orchid",
      accentColor: "#ff2bd6",
      backgroundStyle: "animated",
      backgroundColor: "radial-gradient(circle at 50% 18%, rgba(255,43,214,0.30), transparent 32%), linear-gradient(180deg, #10041d 0%, #160726 48%, #05030a 100%)",
      glassEffectEnabled: true,
      animationPreset: "grid",
    }, "radial-gradient(circle at 50% 18%, rgba(255,43,214,0.22), transparent 34%), linear-gradient(180deg, #fff0fb 0%, #eef4ff 52%, #fff 100%)");
  }

  if (hasAnyKeyword(normalized, ["plasma", "lava", "liquid", "blob", "oil slick"])) {
    return withPromptMode(normalized, {
      themeMode: "dark",
      accentPreset: "ember",
      accentColor: "#ff7a18",
      backgroundStyle: "animated",
      backgroundColor: "radial-gradient(circle at 20% 20%, rgba(249,115,22,0.32), transparent 34%), radial-gradient(circle at 80% 16%, rgba(244,63,94,0.26), transparent 30%), linear-gradient(145deg, #160704 0%, #250b13 52%, #080306 100%)",
      glassEffectEnabled: true,
      animationPreset: "plasma",
    }, "radial-gradient(circle at 20% 20%, rgba(249,115,22,0.25), transparent 34%), radial-gradient(circle at 80% 16%, rgba(244,63,94,0.18), transparent 30%), linear-gradient(145deg, #fff7ed 0%, #ffe8df 52%, #fffaf7 100%)");
  }

  if (hasAnyKeyword(normalized, ["cyberpunk", "neon", "synth", "retro", "80s", "arcade"])) {
    return withPromptMode(normalized, {
      themeMode: "dark",
      accentPreset: "orchid",
      accentColor: "#ff2bd6",
      backgroundStyle: "animated",
      backgroundColor: "radial-gradient(circle at 18% 20%, rgba(232,121,249,0.42), transparent 34%), radial-gradient(circle at 84% 18%, rgba(52,211,153,0.34), transparent 28%), linear-gradient(145deg, #0b0714 0%, #1d1232 58%, #06252c 100%)",
      glassEffectEnabled: true,
      animationPreset: "particles",
    }, "radial-gradient(circle at 18% 20%, rgba(232,121,249,0.28), transparent 34%), radial-gradient(circle at 84% 18%, rgba(52,211,153,0.22), transparent 28%), linear-gradient(145deg, #fff0fb 0%, #edf7ff 58%, #effdf6 100%)");
  }

  if (hasAnyKeyword(normalized, ["ai", "mesh", "neural", "network", "particle", "particles", "tech"])) {
    return withPromptMode(normalized, {
      themeMode: "dark",
      accentPreset: "cobalt",
      accentColor: "#7dd3fc",
      backgroundStyle: "animated",
      backgroundColor: "radial-gradient(circle at 16% 18%, rgba(125,211,252,0.28), transparent 32%), linear-gradient(145deg, #06111f 0%, #101827 54%, #17213a 100%)",
      glassEffectEnabled: true,
      animationPreset: "particles",
    }, "radial-gradient(circle at 16% 18%, rgba(125,211,252,0.24), transparent 32%), linear-gradient(145deg, #effaff 0%, #f5f7ff 54%, #fff 100%)");
  }

  if (hasAnyKeyword(normalized, ["forest", "garden", "moss", "botanical", "verdant"])) {
    return withPromptMode(normalized, {
      themeMode: "dark",
      accentPreset: "moss",
      accentColor: "#a3e635",
      backgroundStyle: "gradient",
      backgroundColor: "radial-gradient(circle at 78% 20%, rgba(163,230,53,0.22), transparent 30%), linear-gradient(145deg, #07140e 0%, #173326 55%, #21351f 100%)",
      glassEffectEnabled: true,
    }, "radial-gradient(circle at 78% 20%, rgba(163,230,53,0.22), transparent 30%), linear-gradient(145deg, #f6ffe8 0%, #eaf8e0 55%, #f8fff3 100%)");
  }

  if (hasAnyKeyword(normalized, ["sunrise", "sunset", "warm", "gold", "amber"])) {
    return withPromptMode(normalized, {
      themeMode: "light",
      accentPreset: "sunrise",
      accentColor: "#f59e0b",
      backgroundStyle: "gradient",
      backgroundColor: "radial-gradient(circle at 18% 18%, rgba(251,191,36,0.38), transparent 32%), linear-gradient(145deg, #fff7ed 0%, #fde2c2 50%, #c7ddf2 100%)",
      glassEffectEnabled: true,
    });
  }

  return withPromptMode(normalized, {
    themeMode: "dark",
    accentPreset: "aurora",
    accentColor: "#a78bfa",
    backgroundStyle: "animated",
    backgroundColor: "radial-gradient(circle at 18% 20%, rgba(167,139,250,0.30), transparent 32%), radial-gradient(circle at 80% 18%, rgba(236,72,153,0.24), transparent 30%), linear-gradient(145deg, #0b1020 0%, #17172c 56%, #101827 100%)",
    glassEffectEnabled: true,
    animationPreset: "aurora",
  }, "radial-gradient(circle at 18% 20%, rgba(167,139,250,0.24), transparent 32%), radial-gradient(circle at 80% 18%, rgba(236,72,153,0.18), transparent 30%), linear-gradient(145deg, #f8f5ff 0%, #fff3fb 56%, #f7fbff 100%)");
};

const normalizeThemeMode = (value: unknown): DashboardPageThemeMode | undefined =>
  value === "light" || value === "dark" ? value : undefined;

const normalizeAccentPreset = (value: unknown): DashboardAccentPreset | undefined =>
  typeof value === "string" && accentPresetValues.has(value as DashboardAccentPreset)
    ? (value as DashboardAccentPreset)
    : undefined;

const normalizeBackgroundStyle = (
  value: unknown,
): DashboardPageBackgroundStyle | undefined =>
  typeof value === "string" && backgroundStyleValues.has(value as DashboardPageBackgroundStyle)
    ? (value as DashboardPageBackgroundStyle)
    : undefined;

const normalizeAnimationPreset = (
  value: unknown,
): DashboardAnimationPreset | undefined =>
  typeof value === "string" && animationPresetValues.has(value as DashboardAnimationPreset)
    ? (value as DashboardAnimationPreset)
    : undefined;

const normalizeAccentColor = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export const buildDashboardThemeAppearance = (
  input: DashboardThemeGenerationInput,
): DashboardPageAppearance => {
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  const appearance: DashboardPageAppearance = prompt
    ? { ...generateDashboardThemeFromPrompt(prompt) }
    : {};

  const themeMode = normalizeThemeMode(input.themeMode);
  if (themeMode) appearance.themeMode = themeMode;

  const accentPreset = normalizeAccentPreset(input.accentPreset);
  if (accentPreset) appearance.accentPreset = accentPreset;

  const accentColor = normalizeAccentColor(input.accentColor);
  if (accentColor) appearance.accentColor = accentColor;

  const backgroundStyle = normalizeBackgroundStyle(input.backgroundStyle);
  if (backgroundStyle) appearance.backgroundStyle = backgroundStyle;

  if (typeof input.backgroundColor === "string" && input.backgroundColor.trim()) {
    appearance.backgroundColor = input.backgroundColor.trim();
  }

  if (typeof input.glassEffectEnabled === "boolean") {
    appearance.glassEffectEnabled = input.glassEffectEnabled;
  }

  const explicitGeneratedAnimation = normalizeDashboardGeneratedAnimationSpec(
    input.generatedAnimation,
  );
  if (explicitGeneratedAnimation) {
    appearance.generatedAnimation = explicitGeneratedAnimation;
    appearance.animationPreset = "generated";
    appearance.backgroundStyle = "animated";
  }

  const animationPreset = normalizeAnimationPreset(input.animationPreset);
  if (animationPreset) {
    appearance.animationPreset = animationPreset;
    appearance.backgroundStyle = appearance.backgroundStyle || "animated";
    if (animationPreset !== "generated") {
      delete appearance.generatedAnimation;
    } else {
      appearance.generatedAnimation = ensureDashboardGeneratedAnimationSpec(
        input.generatedAnimation || appearance.generatedAnimation,
      );
    }
  }

  if (appearance.backgroundStyle === "animated") {
    appearance.animationPreset = appearance.animationPreset || "particles";
    if (appearance.animationPreset === "generated") {
      appearance.generatedAnimation = ensureDashboardGeneratedAnimationSpec(
        appearance.generatedAnimation,
      );
    } else {
      delete appearance.generatedAnimation;
    }
  } else {
    delete appearance.animationPreset;
    delete appearance.generatedAnimation;
  }

  return appearance;
};

export const applyDashboardThemeAppearanceToActivePage = (
  appearance: DashboardPageAppearance,
  profileId = getSpeakerSessionState().activeProfileId ?? null,
): DashboardThemeApplyResult => {
  const pages = getProfileDashboardPages(profileId);
  if (pages.length === 0) {
    return {
      success: false,
      profileId,
      pageId: null,
      appearance,
      error: "No dashboard pages are available.",
    };
  }

  const activePageId = getProfileActiveDashboardPageId(profileId);
  const activePage = pages.find((page) => page.id === activePageId) || pages[0];
  const now = Date.now();
  const nextPages = pages.map((page) =>
    page.id === activePage.id
      ? {
          ...page,
          appearance: {
            ...(page.appearance || {}),
            ...appearance,
          },
          updatedAt: now,
        }
      : page,
  );

  setProfileDashboardPages(nextPages, profileId);

  return {
    success: true,
    profileId,
    pageId: activePage.id,
    appearance: nextPages.find((page) => page.id === activePage.id)?.appearance || appearance,
  };
};

export const resetDashboardThemeOnActivePage = (
  profileId = getSpeakerSessionState().activeProfileId ?? null,
): DashboardThemeApplyResult => {
  const pages = getProfileDashboardPages(profileId);
  if (pages.length === 0) {
    return {
      success: false,
      profileId,
      pageId: null,
      appearance: {},
      error: "No dashboard pages are available.",
    };
  }

  const activePageId = getProfileActiveDashboardPageId(profileId);
  const activePage = pages.find((page) => page.id === activePageId) || pages[0];
  const now = Date.now();
  const nextPages = pages.map((page) =>
    page.id === activePage.id
      ? {
          ...page,
          appearance: {},
          updatedAt: now,
        }
      : page,
  );

  setProfileDashboardPages(nextPages, profileId);

  return {
    success: true,
    profileId,
    pageId: activePage.id,
    appearance: {},
  };
};

export const generateAndApplyDashboardTheme = (
  input: DashboardThemeGenerationInput,
): DashboardThemeApplyResult => {
  const appearance = buildDashboardThemeAppearance(input);
  const result = applyDashboardThemeAppearanceToActivePage(appearance);
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  return prompt ? { ...result, prompt } : result;
};
