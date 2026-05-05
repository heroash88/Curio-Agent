import type { DashboardAccentPreset } from './dashboardTypes';

export type DashboardAccentVisual = {
  label: string;
  accent: string;
  accentSoft: string;
  activeText: string;
  glow: string;
  glowA: string;
  glowB: string;
};

export const DASHBOARD_ACCENT_PRESETS: Record<DashboardAccentPreset, DashboardAccentVisual> = {
  cobalt: {
    label: 'Cobalt',
    accent: '#7dd3fc',
    accentSoft: 'rgba(125,211,252,0.28)',
    activeText: '#082f49',
    glow: 'rgba(125,211,252,0.22)',
    glowA: 'rgba(125,211,252,0.42)',
    glowB: 'rgba(129,140,248,0.34)',
  },
  champagne: {
    label: 'Champagne',
    accent: '#f5d0a9',
    accentSoft: 'rgba(245,208,169,0.30)',
    activeText: '#422006',
    glow: 'rgba(251,191,36,0.18)',
    glowA: 'rgba(251,191,36,0.36)',
    glowB: 'rgba(244,114,182,0.28)',
  },
  verdant: {
    label: 'Verdant',
    accent: '#86efac',
    accentSoft: 'rgba(134,239,172,0.30)',
    activeText: '#052e16',
    glow: 'rgba(45,212,191,0.18)',
    glowA: 'rgba(45,212,191,0.36)',
    glowB: 'rgba(134,239,172,0.30)',
  },
  graphite: {
    label: 'Graphite',
    accent: '#d4d4d8',
    accentSoft: 'rgba(212,212,216,0.28)',
    activeText: '#18181b',
    glow: 'rgba(148,163,184,0.18)',
    glowA: 'rgba(212,212,216,0.34)',
    glowB: 'rgba(113,113,122,0.34)',
  },
  aurora: {
    label: 'Aurora',
    accent: '#a78bfa',
    accentSoft: 'rgba(167,139,250,0.30)',
    activeText: '#1e1b4b',
    glow: 'rgba(139,92,246,0.22)',
    glowA: 'rgba(139,92,246,0.42)',
    glowB: 'rgba(236,72,153,0.34)',
  },
  neon: {
    label: 'Neon',
    accent: '#34d399',
    accentSoft: 'rgba(52,211,153,0.30)',
    activeText: '#022c22',
    glow: 'rgba(6,182,212,0.22)',
    glowA: 'rgba(6,182,212,0.42)',
    glowB: 'rgba(52,211,153,0.36)',
  },
  coral: {
    label: 'Coral',
    accent: '#fb7185',
    accentSoft: 'rgba(251,113,133,0.28)',
    activeText: '#4c0519',
    glow: 'rgba(251,113,133,0.20)',
    glowA: 'rgba(251,113,133,0.38)',
    glowB: 'rgba(251,146,60,0.30)',
  },
  moss: {
    label: 'Moss',
    accent: '#a3e635',
    accentSoft: 'rgba(163,230,53,0.26)',
    activeText: '#1a2e05',
    glow: 'rgba(132,204,22,0.20)',
    glowA: 'rgba(132,204,22,0.34)',
    glowB: 'rgba(20,184,166,0.28)',
  },
  orchid: {
    label: 'Orchid',
    accent: '#e879f9',
    accentSoft: 'rgba(232,121,249,0.26)',
    activeText: '#4a044e',
    glow: 'rgba(217,70,239,0.20)',
    glowA: 'rgba(217,70,239,0.36)',
    glowB: 'rgba(129,140,248,0.28)',
  },
  sunrise: {
    label: 'Sunrise',
    accent: '#fbbf24',
    accentSoft: 'rgba(251,191,36,0.28)',
    activeText: '#451a03',
    glow: 'rgba(251,191,36,0.22)',
    glowA: 'rgba(251,191,36,0.40)',
    glowB: 'rgba(248,113,113,0.30)',
  },
  arctic: {
    label: 'Arctic',
    accent: '#67e8f9',
    accentSoft: 'rgba(103,232,249,0.26)',
    activeText: '#083344',
    glow: 'rgba(34,211,238,0.20)',
    glowA: 'rgba(34,211,238,0.38)',
    glowB: 'rgba(147,197,253,0.30)',
  },
  ember: {
    label: 'Ember',
    accent: '#f97316',
    accentSoft: 'rgba(249,115,22,0.26)',
    activeText: '#431407',
    glow: 'rgba(249,115,22,0.20)',
    glowA: 'rgba(249,115,22,0.38)',
    glowB: 'rgba(244,63,94,0.28)',
  },
};

export const DASHBOARD_ACCENT_ORDER: DashboardAccentPreset[] = [
  'cobalt',
  'champagne',
  'verdant',
  'graphite',
  'aurora',
  'neon',
  'coral',
  'moss',
  'orchid',
  'sunrise',
  'arctic',
  'ember',
];

const WIDGET_ACCENT_VARIABLES = [
  '--ether-primary',
  '--ether-primary-container',
  '--ether-sky',
  '--ether-secondary',
  '--ether-violet',
  '--ether-tertiary',
  '--ether-pink',
  '--ether-rose',
  '--ether-indigo',
  '--ether-slate',
  '--ether-emerald',
  '--ether-amber',
  '--ether-teal',
];

const expandHexChannel = (value: string) =>
  value.length === 1 ? `${value}${value}` : value;

const parseHexRgb = (value: string): [number, number, number] | null => {
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const hex = match[1];
  const redHex = expandHexChannel(hex.length === 3 ? hex[0] : hex.slice(0, 2));
  const greenHex = expandHexChannel(hex.length === 3 ? hex[1] : hex.slice(2, 4));
  const blueHex = expandHexChannel(hex.length === 3 ? hex[2] : hex.slice(4, 6));
  return [
    Number.parseInt(redHex, 16),
    Number.parseInt(greenHex, 16),
    Number.parseInt(blueHex, 16),
  ];
};

const getReadableTextColor = (accent: string) => {
  const rgb = parseHexRgb(accent);
  if (!rgb) return '#06111f';
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.46 ? '#06111f' : '#fffaf0';
};

export const getDashboardAccentVariables = (
  preset: DashboardAccentPreset,
): Record<string, string> => {
  const current = DASHBOARD_ACCENT_PRESETS[preset] ?? DASHBOARD_ACCENT_PRESETS.cobalt;
  const variables: Record<string, string> = {
    '--dashboard-accent': current.accent,
    '--dashboard-accent-soft': current.accentSoft,
    '--dashboard-glow-a': current.glowA,
    '--dashboard-glow-b': current.glowB,
    '--ether-control-active-bg': current.accent,
    '--ether-control-active-text': current.activeText,
  };

  for (const variable of WIDGET_ACCENT_VARIABLES) {
    variables[variable] = current.accent;
  }

  return variables;
};

export const getDashboardCustomAccentVariables = (
  accentColor?: string,
): Record<string, string> => {
  const accent = accentColor?.trim();
  if (!accent) return {};

  const variables: Record<string, string> = {
    '--dashboard-accent': accent,
    '--dashboard-accent-soft': `color-mix(in srgb, ${accent} 30%, transparent)`,
    '--dashboard-glow-a': `color-mix(in srgb, ${accent} 46%, transparent)`,
    '--dashboard-glow-b': `color-mix(in srgb, ${accent} 34%, transparent)`,
    '--ether-control-active-bg': accent,
    '--ether-control-active-text': getReadableTextColor(accent),
  };

  for (const variable of WIDGET_ACCENT_VARIABLES) {
    variables[variable] = accent;
  }

  return variables;
};
