import type { CSSProperties } from "react";
import type { DashboardWidgetConfig } from "../../../services/dashboardTypes";

type WidgetAppearanceStyle = CSSProperties & Record<string, string>;

export interface ResolvedWidgetAccent {
  solid: string;
  soft: string;
  glow: string;
  rgb?: string;
}

const WIDGET_ACCENT_VARIABLES = [
  "--ether-primary",
  "--ether-primary-container",
  "--ether-sky",
  "--ether-secondary",
  "--ether-violet",
  "--ether-tertiary",
  "--ether-pink",
  "--ether-rose",
  "--ether-indigo",
  "--ether-slate",
  "--ether-emerald",
  "--ether-amber",
  "--ether-teal",
];

const clampRgbChannel = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(255, Math.round(parsed)));
};

const parseRgbColor = (value: string): { rgb: string; solid: string; soft: string; glow: string } | null => {
  const match = value
    .trim()
    .match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d?(?:\.\d+)?))?\s*\)$/i);
  if (!match) return null;

  const red = clampRgbChannel(match[1]);
  const green = clampRgbChannel(match[2]);
  const blue = clampRgbChannel(match[3]);
  const rgb = `${red}, ${green}, ${blue}`;
  const solid = `rgb(${rgb})`;
  return {
    rgb,
    solid,
    soft: `rgba(${rgb}, 0.07)`,
    glow: `rgba(${rgb}, 0.14)`,
  };
};

const expandHexChannel = (value: string) =>
  value.length === 1 ? `${value}${value}` : value;

const parseHexColor = (value: string): { rgb: string; solid: string; soft: string; glow: string } | null => {
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;

  const hex = match[1];
  const redHex = expandHexChannel(hex.length === 3 ? hex[0] : hex.slice(0, 2));
  const greenHex = expandHexChannel(hex.length === 3 ? hex[1] : hex.slice(2, 4));
  const blueHex = expandHexChannel(hex.length === 3 ? hex[2] : hex.slice(4, 6));
  const red = Number.parseInt(redHex, 16);
  const green = Number.parseInt(greenHex, 16);
  const blue = Number.parseInt(blueHex, 16);
  const rgb = `${red}, ${green}, ${blue}`;
  const solid = `rgb(${rgb})`;
  return {
    rgb,
    solid,
    soft: `rgba(${rgb}, 0.07)`,
    glow: `rgba(${rgb}, 0.14)`,
  };
};

export const resolveDashboardWidgetAccent = (
  accentOverride?: string,
): ResolvedWidgetAccent | null => {
  const trimmed = accentOverride?.trim();
  if (!trimmed) return null;

  const parsed = parseRgbColor(trimmed) || parseHexColor(trimmed);
  if (parsed) return parsed;

  return {
    solid: trimmed,
    soft: `color-mix(in srgb, ${trimmed} 7%, transparent)`,
    glow: `color-mix(in srgb, ${trimmed} 14%, transparent)`,
  };
};

export const getDashboardWidgetAccentVariables = (
  config?: Pick<DashboardWidgetConfig, "accentOverride">,
): WidgetAppearanceStyle => {
  const resolved = resolveDashboardWidgetAccent(config?.accentOverride);
  if (!resolved) return {};

  const variables: WidgetAppearanceStyle = {
    "--dashboard-widget-accent": resolved.solid,
    "--dashboard-widget-accent-soft": resolved.soft,
    "--dashboard-widget-accent-glow": resolved.glow,
  };

  for (const variable of WIDGET_ACCENT_VARIABLES) {
    variables[variable] = resolved.solid;
  }

  return variables;
};

export const getDashboardWidgetGlowLayerStyle = (
  config?: Pick<DashboardWidgetConfig, "accentOverride">,
  dark = false,
): WidgetAppearanceStyle => {
  const resolved = resolveDashboardWidgetAccent(config?.accentOverride);
  const glow = resolved?.glow || `color-mix(in srgb, var(--dashboard-accent) ${dark ? 14 : 9}%, transparent)`;
  const soft = resolved?.soft || `color-mix(in srgb, var(--dashboard-accent) ${dark ? 8 : 5}%, transparent)`;
  const edge = resolved?.soft || `color-mix(in srgb, var(--dashboard-accent) ${dark ? 12 : 8}%, transparent)`;

  return {
    opacity: "0.62",
    background: `
      radial-gradient(100% 80% at -14% -12%, ${glow} 0%, transparent 42%),
      radial-gradient(96% 78% at 114% 110%, ${soft} 0%, transparent 48%),
      linear-gradient(135deg, ${edge} 0%, transparent 34%, ${soft} 100%)
    `,
    boxShadow: `0 0 0 1px ${edge}, 0 10px 24px ${glow}, inset 0 0 14px ${soft}`,
  };
};

export const getDashboardWidgetAccentRgb = (
  config: Pick<DashboardWidgetConfig, "accentOverride"> | undefined,
  fallbackRgb: string,
) => resolveDashboardWidgetAccent(config?.accentOverride)?.rgb || fallbackRgb;
