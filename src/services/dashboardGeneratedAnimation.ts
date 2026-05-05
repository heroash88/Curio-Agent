import {
  DASHBOARD_GENERATED_ANIMATION_BLEND_MODES,
  DASHBOARD_GENERATED_ANIMATION_DIRECTIONS,
  DASHBOARD_GENERATED_ANIMATION_KINDS,
  DASHBOARD_GENERATED_ANIMATION_SHAPES,
  type DashboardGeneratedAnimationBlendMode,
  type DashboardGeneratedAnimationDirection,
  type DashboardGeneratedAnimationKind,
  type DashboardGeneratedAnimationLayer,
  type DashboardGeneratedAnimationShape,
  type DashboardGeneratedAnimationSpec,
} from "./dashboardTypes";

export const DEFAULT_DASHBOARD_GENERATED_ANIMATION: DashboardGeneratedAnimationSpec = {
  kind: "particles",
  colors: ["#7dd3fc", "#a78bfa", "#f0abfc"],
  density: 48,
  speed: 36,
  complexity: 52,
  shape: "dots",
  direction: "up",
  glow: true,
};

const kindValues = new Set<DashboardGeneratedAnimationKind>(
  DASHBOARD_GENERATED_ANIMATION_KINDS,
);
const shapeValues = new Set<DashboardGeneratedAnimationShape>(
  DASHBOARD_GENERATED_ANIMATION_SHAPES,
);
const directionValues = new Set<DashboardGeneratedAnimationDirection>(
  DASHBOARD_GENERATED_ANIMATION_DIRECTIONS,
);
const blendModeValues = new Set<DashboardGeneratedAnimationBlendMode>(
  DASHBOARD_GENERATED_ANIMATION_BLEND_MODES,
);

const MAX_GENERATED_ANIMATION_LAYERS = 6;

const layeredBaseBudget = {
  density: 72,
  complexity: 88,
};

const layerRenderBudgets: Record<
  DashboardGeneratedAnimationKind,
  Partial<Record<"density" | "trail" | "blur", number>>
> = {
  particles: { density: 88, trail: 42, blur: 18 },
  mesh: { density: 46, trail: 24, blur: 18 },
  waves: { density: 58, trail: 44, blur: 18 },
  rain: { density: 72, trail: 34, blur: 10 },
  snow: { density: 82, trail: 24, blur: 12 },
  fire: { density: 72, trail: 52, blur: 22 },
  embers: { density: 72, trail: 46, blur: 18 },
  lightning: { density: 18, trail: 24, blur: 14 },
  fog: { density: 20, trail: 28, blur: 42 },
  bubbles: { density: 56, trail: 20, blur: 14 },
  orbits: { density: 64, trail: 36, blur: 18 },
  ribbons: { density: 58, trail: 50, blur: 18 },
  grid: { density: 48, trail: 16, blur: 8 },
  nebula: { density: 24, trail: 36, blur: 56 },
  constellation: { density: 46, trail: 24, blur: 18 },
  scanlines: { density: 18, trail: 12, blur: 4 },
  radar: { density: 20, trail: 36, blur: 18 },
  auroraCurtain: { density: 24, trail: 36, blur: 56 },
  energyRibbons: { density: 54, trail: 58, blur: 20 },
  dataStorm: { density: 72, trail: 34, blur: 10 },
  wormhole: { density: 54, trail: 60, blur: 28 },
};

const clampPercent = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const clampToBudget = (
  value: number,
  budget: number | undefined,
) => (budget === undefined ? value : Math.min(value, budget));

const cssColorPattern =
  /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*,\s*(?:0|1|0?\.\d+|[\d.]+%))?\s*\)|hsla?\(\s*[\d.]+(?:deg|rad|turn)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%(?:\s*,\s*(?:0|1|0?\.\d+|[\d.]+%))?\s*\))$/;

const normalizeCssColor = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return cssColorPattern.test(trimmed) ? trimmed : null;
};

const normalizeColors = (
  value: unknown,
  fallback: string[],
): string[] => {
  if (!Array.isArray(value)) return fallback;
  const colors = value
    .map(normalizeCssColor)
    .filter((color): color is string => Boolean(color))
    .slice(0, 6);
  return colors.length > 0 ? colors : fallback;
};

const normalizeLayer = (
  value: unknown,
  fallback: DashboardGeneratedAnimationSpec,
): DashboardGeneratedAnimationLayer | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const kind =
    typeof raw.kind === "string" && kindValues.has(raw.kind as DashboardGeneratedAnimationKind)
      ? (raw.kind as DashboardGeneratedAnimationKind)
      : "particles";
  const colors = normalizeColors(raw.colors, fallback.colors);
  const layer: DashboardGeneratedAnimationLayer = {
    kind,
    colors,
  };

  if (raw.density !== undefined) layer.density = clampPercent(raw.density, fallback.density);
  if (raw.speed !== undefined) layer.speed = clampPercent(raw.speed, fallback.speed);
  if (raw.complexity !== undefined) layer.complexity = clampPercent(raw.complexity, fallback.complexity);
  if (raw.opacity !== undefined) layer.opacity = clampPercent(raw.opacity, 70);
  if (raw.depth !== undefined) layer.depth = clampPercent(raw.depth, 50);
  if (raw.scale !== undefined) layer.scale = clampPercent(raw.scale, 64);
  if (raw.trail !== undefined) layer.trail = clampPercent(raw.trail, 0);
  if (raw.pulse !== undefined) layer.pulse = clampPercent(raw.pulse, 0);
  if (raw.turbulence !== undefined) layer.turbulence = clampPercent(raw.turbulence, 0);
  if (raw.blur !== undefined) layer.blur = clampPercent(raw.blur, 0);
  if (typeof raw.blendMode === "string" && blendModeValues.has(raw.blendMode as DashboardGeneratedAnimationBlendMode)) {
    layer.blendMode = raw.blendMode as DashboardGeneratedAnimationBlendMode;
  } else if (raw.blendMode !== undefined) {
    layer.blendMode = "screen";
  }
  if (typeof raw.shape === "string" && shapeValues.has(raw.shape as DashboardGeneratedAnimationShape)) {
    layer.shape = raw.shape as DashboardGeneratedAnimationShape;
  }
  if (typeof raw.direction === "string" && directionValues.has(raw.direction as DashboardGeneratedAnimationDirection)) {
    layer.direction = raw.direction as DashboardGeneratedAnimationDirection;
  }
  if (typeof raw.glow === "boolean") {
    layer.glow = raw.glow;
  }

  const budget = layerRenderBudgets[kind];
  if (layer.density !== undefined) {
    layer.density = clampToBudget(layer.density, budget.density);
  }
  if (layer.trail !== undefined) {
    layer.trail = clampToBudget(layer.trail, budget.trail);
  }
  if (layer.blur !== undefined) {
    layer.blur = clampToBudget(layer.blur, budget.blur);
  }

  return layer;
};

const normalizeLayers = (
  value: unknown,
  fallback: DashboardGeneratedAnimationSpec,
): DashboardGeneratedAnimationLayer[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const layers = value
    .map((layer) => normalizeLayer(layer, fallback))
    .filter((layer): layer is DashboardGeneratedAnimationLayer => Boolean(layer))
    .slice(0, MAX_GENERATED_ANIMATION_LAYERS);
  return layers.length > 0 ? layers : undefined;
};

export const normalizeDashboardGeneratedAnimationSpec = (
  value: unknown,
  fallback: DashboardGeneratedAnimationSpec = DEFAULT_DASHBOARD_GENERATED_ANIMATION,
): DashboardGeneratedAnimationSpec | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const kind =
    typeof raw.kind === "string" && kindValues.has(raw.kind as DashboardGeneratedAnimationKind)
      ? (raw.kind as DashboardGeneratedAnimationKind)
      : fallback.kind;
  const shape =
    typeof raw.shape === "string" && shapeValues.has(raw.shape as DashboardGeneratedAnimationShape)
      ? (raw.shape as DashboardGeneratedAnimationShape)
      : fallback.shape;
  const direction =
    typeof raw.direction === "string" &&
    directionValues.has(raw.direction as DashboardGeneratedAnimationDirection)
      ? (raw.direction as DashboardGeneratedAnimationDirection)
      : fallback.direction;

  const normalized: DashboardGeneratedAnimationSpec = {
    kind,
    colors: normalizeColors(raw.colors, fallback.colors),
    density: clampPercent(raw.density, fallback.density),
    speed: clampPercent(raw.speed, fallback.speed),
    complexity: clampPercent(raw.complexity, fallback.complexity),
    shape,
    direction,
    glow: typeof raw.glow === "boolean" ? raw.glow : fallback.glow,
  };
  const layers = normalizeLayers(raw.layers, normalized);
  if (layers) {
    normalized.density = Math.min(normalized.density, layeredBaseBudget.density);
    normalized.complexity = Math.min(normalized.complexity, layeredBaseBudget.complexity);
    normalized.layers = layers;
  }
  return normalized;
};

export const ensureDashboardGeneratedAnimationSpec = (
  value: unknown,
  fallback: DashboardGeneratedAnimationSpec = DEFAULT_DASHBOARD_GENERATED_ANIMATION,
): DashboardGeneratedAnimationSpec =>
  normalizeDashboardGeneratedAnimationSpec(value, fallback) || fallback;
