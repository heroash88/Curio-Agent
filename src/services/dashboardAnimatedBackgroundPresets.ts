import type {
  DashboardAccentPreset,
  DashboardAnimationPreset,
  DashboardPageAppearance,
  DashboardPageThemeMode,
} from "./dashboardTypes";

export interface DashboardAnimatedBackgroundOption {
  id: string;
  label: string;
  description: string;
  animationPreset: Exclude<DashboardAnimationPreset, "generated">;
  backgroundColor: string;
  accentPreset: DashboardAccentPreset;
  accentColor: string;
  themeMode: DashboardPageThemeMode;
}

export const DASHBOARD_ANIMATED_BACKGROUND_OPTIONS: DashboardAnimatedBackgroundOption[] = [
  {
    id: "matrix-rain",
    label: "Matrix Rain",
    description: "Falling green terminal code.",
    animationPreset: "matrix",
    backgroundColor: "radial-gradient(circle at 50% 0%, #053f2f 0%, #020604 42%, #000 100%)",
    accentPreset: "neon",
    accentColor: "#22f7a5",
    themeMode: "dark",
  },
  {
    id: "particle-mesh",
    label: "Particle Mesh",
    description: "Connected AI-style network nodes.",
    animationPreset: "particles",
    backgroundColor: "radial-gradient(circle at 16% 18%, rgba(125,211,252,0.28), transparent 32%), linear-gradient(145deg, #06111f 0%, #101827 54%, #17213a 100%)",
    accentPreset: "cobalt",
    accentColor: "#7dd3fc",
    themeMode: "dark",
  },
  {
    id: "wave-field",
    label: "Wave Field",
    description: "Layered oceanic signal waves.",
    animationPreset: "waves",
    backgroundColor: "linear-gradient(145deg, #03111f 0%, #08334a 48%, #0f5d75 100%)",
    accentPreset: "arctic",
    accentColor: "#4dd8ff",
    themeMode: "dark",
  },
  {
    id: "starfield",
    label: "Starfield",
    description: "Depthy moving space field.",
    animationPreset: "starfield",
    backgroundColor: "radial-gradient(circle at 50% 20%, #18243f 0%, #060914 52%, #02030a 100%)",
    accentPreset: "arctic",
    accentColor: "#8bd3ff",
    themeMode: "dark",
  },
  {
    id: "aurora",
    label: "Aurora",
    description: "Soft northern-light bands.",
    animationPreset: "aurora",
    backgroundColor: "radial-gradient(circle at 20% 10%, rgba(45,212,191,0.26), transparent 28%), radial-gradient(circle at 82% 18%, rgba(232,121,249,0.22), transparent 30%), linear-gradient(145deg, #06111c 0%, #111827 52%, #0c1224 100%)",
    accentPreset: "aurora",
    accentColor: "#7fffd4",
    themeMode: "dark",
  },
  {
    id: "plasma",
    label: "Plasma",
    description: "Liquid lava-lamp color clouds.",
    animationPreset: "plasma",
    backgroundColor: "radial-gradient(circle at 20% 20%, rgba(249,115,22,0.32), transparent 34%), radial-gradient(circle at 80% 16%, rgba(244,63,94,0.26), transparent 30%), linear-gradient(145deg, #160704 0%, #250b13 52%, #080306 100%)",
    accentPreset: "ember",
    accentColor: "#ff7a18",
    themeMode: "dark",
  },
  {
    id: "neon-grid",
    label: "Neon Grid",
    description: "Retro perspective synth grid.",
    animationPreset: "grid",
    backgroundColor: "radial-gradient(circle at 50% 18%, rgba(255,43,214,0.30), transparent 32%), linear-gradient(180deg, #10041d 0%, #160726 48%, #05030a 100%)",
    accentPreset: "orchid",
    accentColor: "#ff2bd6",
    themeMode: "dark",
  },
];

export const buildDashboardAnimatedBackgroundAppearance = (
  option: DashboardAnimatedBackgroundOption,
): DashboardPageAppearance => ({
  themeMode: option.themeMode,
  accentPreset: option.accentPreset,
  accentColor: option.accentColor,
  backgroundStyle: "animated",
  backgroundColor: option.backgroundColor,
  glassEffectEnabled: true,
  animationPreset: option.animationPreset,
  generatedAnimation: undefined,
});
