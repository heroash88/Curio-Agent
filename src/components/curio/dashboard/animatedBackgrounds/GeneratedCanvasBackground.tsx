import React from "react";

import {
  DEFAULT_DASHBOARD_GENERATED_ANIMATION,
  ensureDashboardGeneratedAnimationSpec,
} from "../../../../services/dashboardGeneratedAnimation";
import type {
  DashboardGeneratedAnimationBlendMode,
  DashboardGeneratedAnimationLayer,
  DashboardGeneratedAnimationSpec,
} from "../../../../services/dashboardTypes";
import { useAnimatedCanvas, type CanvasFrame } from "./useAnimatedCanvas";

interface GeneratedParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  colorIndex: number;
}

type GeneratedRuntimeLayer = DashboardGeneratedAnimationSpec & {
  opacity: number;
  blendMode: DashboardGeneratedAnimationBlendMode;
  depth: number;
  scale: number;
  trail: number;
  pulse: number;
  turbulence: number;
  blur: number;
};

interface GeneratedAnimationState {
  particles: GeneratedParticle[];
  bands: number[];
  runtimeLayers?: GeneratedRuntimeLayer[];
  layerStates?: GeneratedAnimationState[];
  /** Offscreen buffers for caching expensive fog/nebula layers. Keyed by layer index. */
  offscreenBuffers?: Map<number, OffscreenBuffer>;
}

type GeneratedShape = DashboardGeneratedAnimationSpec["shape"];
type GeneratedDirection = DashboardGeneratedAnimationSpec["direction"];

const TWO_PI = Math.PI * 2;
const GLYPH_CHARS = "0101*+";
const GLYPH_FONT_FAMILY = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** Quantized font cache for glyph shapes to avoid per-particle ctx.font sets. */
const glyphFontCache = new Map<number, string>();
const getGlyphFont = (size: number): string => {
  const px = Math.max(10, Math.round(size * 4));
  let font = glyphFontCache.get(px);
  if (!font) {
    font = `${px}px ${GLYPH_FONT_FAMILY}`;
    glyphFontCache.set(px, font);
  }
  return font;
};

/** Parse a hex color to [r, g, b]. Caches results for hot-path reuse. */
const hexRgbCache = new Map<string, [number, number, number]>();
const parseHexRgb = (hex: string): [number, number, number] | null => {
  const cached = hexRgbCache.get(hex);
  if (cached) return cached;
  const match = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/.exec(hex);
  if (!match) return null;
  const rgb: [number, number, number] = [
    parseInt(match[1], 16),
    parseInt(match[2], 16),
    parseInt(match[3], 16),
  ];
  hexRgbCache.set(hex, rgb);
  return rgb;
};

/**
 * Smoothly interpolate between adjacent palette colors using a continuous t
 * value (typically derived from particle.phase). Returns an rgba() string.
 * Falls back to discrete getColor() for non-hex or single-color palettes.
 */
const getBlendedColor = (
  spec: DashboardGeneratedAnimationSpec,
  accentColor: string,
  t: number,
  alpha = 1,
): string => {
  const colors = spec.colors.length > 0 ? spec.colors : [accentColor];
  if (colors.length === 1) {
    const rgb = parseHexRgb(colors[0]);
    return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : colors[0];
  }
  // Map t (0..TWO_PI or arbitrary) into a continuous palette position
  const pos = ((t % TWO_PI) / TWO_PI) * colors.length;
  const idx0 = Math.floor(pos) % colors.length;
  const idx1 = (idx0 + 1) % colors.length;
  const frac = pos - Math.floor(pos);
  const rgb0 = parseHexRgb(colors[idx0]);
  const rgb1 = parseHexRgb(colors[idx1]);
  if (!rgb0 || !rgb1) return colors[idx0] || accentColor;
  const r = Math.round(rgb0[0] + (rgb1[0] - rgb0[0]) * frac);
  const g = Math.round(rgb0[1] + (rgb1[1] - rgb0[1]) * frac);
  const b = Math.round(rgb0[2] + (rgb1[2] - rgb0[2]) * frac);
  return `rgba(${r},${g},${b},${alpha})`;
};

const getDepthFactor = (depth: number): number =>
  0.4 + (Math.max(0, Math.min(100, depth)) / 100) * 1.4;

/** State for an offscreen buffer used by fog/nebula caching. */
interface OffscreenBuffer {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  frameCounter: number;
  lastWidth: number;
  lastHeight: number;
}

const generatedCountCaps: Record<DashboardGeneratedAnimationSpec["kind"], number> = {
  particles: 120,
  mesh: 60,
  waves: 48,
  rain: 92,
  snow: 96,
  fire: 82,
  embers: 78,
  lightning: 18,
  fog: 20,
  bubbles: 64,
  orbits: 56,
  ribbons: 48,
  grid: 32,
  nebula: 24,
  constellation: 60,
  scanlines: 18,
  radar: 18,
  auroraCurtain: 24,
  energyRibbons: 48,
  dataStorm: 78,
  wormhole: 48,
};

const layerOnlyKinds = new Set<DashboardGeneratedAnimationSpec["kind"]>([
  "nebula",
  "constellation",
  "scanlines",
  "radar",
  "auroraCurtain",
  "energyRibbons",
  "dataStorm",
  "wormhole",
  "fog",
]);

const getGeneratedCount = (
  width: number,
  height: number,
  spec: DashboardGeneratedAnimationSpec,
) => {
  const areaFactor = Math.max(0.65, Math.min(2.1, (width * height) / 520000));
  const densityFactor = 0.35 + spec.density / 70;
  const base =
    spec.kind === "rain" || spec.kind === "dataStorm"
      ? 104
      : spec.kind === "snow"
        ? 90
        : spec.kind === "fire" || spec.kind === "embers"
          ? 84
          : spec.kind === "lightning" || spec.kind === "fog"
            ? 24
            : spec.kind === "bubbles"
              ? 66
              : spec.kind === "mesh" || spec.kind === "constellation"
                ? 52
                : spec.kind === "nebula" || spec.kind === "scanlines" || spec.kind === "radar"
                  ? 28
                  : spec.kind === "wormhole"
                    ? 72
                    : 64;
  return Math.max(
    14,
    Math.min(generatedCountCaps[spec.kind], Math.round(base * areaFactor * densityFactor)),
  );
};

const createLayerState = (
  width: number,
  height: number,
  spec: DashboardGeneratedAnimationSpec,
): GeneratedAnimationState => {
  const count = getGeneratedCount(width, height, spec);
  return {
    particles: Array.from({ length: count }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * (0.18 + spec.speed / 220),
      vy: (Math.random() - 0.5) * (0.18 + spec.speed / 220),
      size: 1.2 + Math.random() * (1.8 + spec.complexity / 45),
      phase: Math.random() * TWO_PI,
      colorIndex: index % Math.max(1, spec.colors.length),
    })),
    bands: Array.from({ length: Math.max(3, Math.round(3 + spec.complexity / 18)) }, (_, index) => index * 0.78),
  };
};

const toRuntimeLayer = (
  base: DashboardGeneratedAnimationSpec,
  layer: DashboardGeneratedAnimationLayer,
): GeneratedRuntimeLayer => ({
  kind: layer.kind,
  colors: layer.colors.length > 0 ? layer.colors : base.colors,
  density: layer.density ?? base.density,
  speed: layer.speed ?? base.speed,
  complexity: layer.complexity ?? base.complexity,
  shape: layer.shape ?? base.shape,
  direction: layer.direction ?? base.direction,
  glow: layer.glow ?? base.glow,
  opacity: layer.opacity ?? 70,
  blendMode: layer.blendMode ?? "screen",
  depth: layer.depth ?? 50,
  scale: layer.scale ?? 64,
  trail: layer.trail ?? 0,
  pulse: layer.pulse ?? 0,
  turbulence: layer.turbulence ?? 0,
  blur: layer.blur ?? 0,
});

const toBaseRuntimeLayer = (
  spec: DashboardGeneratedAnimationSpec,
): GeneratedRuntimeLayer => ({
  ...spec,
  opacity: 74,
  blendMode: "source-over",
  depth: 50,
  scale: 64,
  trail: 0,
  pulse: 0,
  turbulence: 0,
  blur: 0,
});

const createGeneratedState = (
  width: number,
  height: number,
  spec: DashboardGeneratedAnimationSpec,
): GeneratedAnimationState => {
  const state = createLayerState(width, height, spec);
  if (spec.layers?.length) {
    const runtimeLayers = spec.layers
      .map((layer) => toRuntimeLayer(spec, layer))
      .sort((a, b) => a.depth - b.depth);
    state.runtimeLayers = runtimeLayers;
    state.layerStates = runtimeLayers.map((layer) =>
      createLayerState(width, height, layer),
    );
  }
  return state;
};

const getColor = (
  spec: DashboardGeneratedAnimationSpec,
  accentColor: string,
  index: number,
) => spec.colors[index % spec.colors.length] || accentColor;

const moveParticle = (
  particle: GeneratedParticle,
  spec: DashboardGeneratedAnimationSpec,
  width: number,
  height: number,
  speed: number,
  directionOverride?: GeneratedDirection,
) => {
  const direction = directionOverride || spec.direction;
  if (direction === "down") {
    particle.y += (0.18 + spec.speed / 75) * speed;
    particle.x += Math.sin(particle.phase + particle.y / 80) * 0.18 * speed;
  } else if (direction === "left") {
    particle.x -= (0.16 + spec.speed / 95) * speed;
    particle.y += Math.sin(particle.phase + particle.x / 90) * 0.15 * speed;
  } else if (direction === "right") {
    particle.x += (0.16 + spec.speed / 95) * speed;
    particle.y += Math.sin(particle.phase + particle.x / 90) * 0.15 * speed;
  } else if (direction === "radial") {
    const cx = width / 2;
    const cy = height / 2;
    const angle = Math.atan2(particle.y - cy, particle.x - cx);
    particle.x += Math.cos(angle) * (0.08 + spec.speed / 180) * speed;
    particle.y += Math.sin(angle) * (0.08 + spec.speed / 180) * speed;
  } else {
    particle.y -= (0.16 + spec.speed / 95) * speed;
    particle.x += Math.sin(particle.phase + particle.y / 80) * 0.18 * speed;
  }

  if (particle.x < -30) particle.x = width + 30;
  if (particle.x > width + 30) particle.x = -30;
  if (particle.y < -30) particle.y = height + 30;
  if (particle.y > height + 30) particle.y = -30;
};

const drawParticleShape = (
  ctx: CanvasRenderingContext2D,
  particle: GeneratedParticle,
  spec: DashboardGeneratedAnimationSpec,
  color: string,
  shapeOverride?: GeneratedShape,
  x = particle.x,
  y = particle.y,
  size = particle.size,
) => {
  const shape = shapeOverride || spec.shape;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.15;

  if (shape === "rings") {
    ctx.beginPath();
    ctx.arc(x, y, size * 1.75, 0, TWO_PI);
    ctx.stroke();
    return;
  }

  if (shape === "lines") {
    ctx.beginPath();
    ctx.moveTo(x - size * 2, y);
    ctx.lineTo(x + size * 2, y);
    ctx.stroke();
    return;
  }

  if (shape === "glyphs") {
    ctx.font = getGlyphFont(size);
    ctx.fillText(GLYPH_CHARS[Math.floor((particle.phase * 10) % GLYPH_CHARS.length)] || "0", x, y);
    return;
  }

  ctx.beginPath();
  ctx.arc(x, y, size, 0, TWO_PI);
  ctx.fill();
};

const drawMesh = (
  frame: CanvasFrame<GeneratedAnimationState>,
  spec: DashboardGeneratedAnimationSpec,
) => {
  const { ctx, state, width, height, delta, accentColor } = frame;
  const speed = Math.max(0.35, Math.min(2.4, delta / 16));
  const maxDistance = 90 + spec.complexity * 0.9;
  const maxDistanceSq = maxDistance * maxDistance;

  for (const particle of state.particles) {
    moveParticle(particle, spec, width, height, speed, spec.direction || "up");
  }

  // Batch mesh lines: group by color index, use squared distance to avoid sqrt
  const meshCount = Math.min(state.particles.length, 56);
  ctx.lineWidth = 1;
  let prevColorKey = -1;
  let pathOpen = false;
  for (let index = 0; index < meshCount; index += 1) {
    const particle = state.particles[index];
    const colorKey = index % Math.max(1, spec.colors.length);
    for (let i = index + 1; i < meshCount; i += 1) {
      const other = state.particles[i];
      const dx = particle.x - other.x;
      const dy = particle.y - other.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > maxDistanceSq) continue;
      const distance = Math.sqrt(distanceSq);
      const alpha = Math.max(0, 0.28 - distance / maxDistance / 3);
      if (alpha <= 0) continue;

      // Flush previous path on color or alpha change (alpha varies so we flush per-line;
      // the main win is avoiding redundant strokeStyle/lineWidth sets)
      if (colorKey !== prevColorKey) {
        if (pathOpen) ctx.stroke();
        ctx.strokeStyle = getColor(spec, accentColor, index);
        prevColorKey = colorKey;
        pathOpen = false;
      }
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(other.x, other.y);
      ctx.stroke();
    }
  }

  // Batch particle dots into a single fill call
  ctx.globalAlpha = 0.7;
  const dotColor = getColor(spec, accentColor, 0);
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  for (const particle of state.particles) {
    const color = getColor(spec, accentColor, particle.colorIndex);
    if (color !== dotColor) {
      // Different color — flush and draw individually
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(particle.x + particle.size, particle.y);
      ctx.arc(particle.x, particle.y, particle.size, 0, TWO_PI);
      ctx.fill();
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      continue;
    }
    ctx.moveTo(particle.x + particle.size, particle.y);
    ctx.arc(particle.x, particle.y, particle.size, 0, TWO_PI);
  }
  ctx.fill();
};

const drawParticleTrail = (
  ctx: CanvasRenderingContext2D,
  particle: GeneratedParticle,
  spec: DashboardGeneratedAnimationSpec,
  color: string,
  trail = 0,
) => {
  const steps = Math.min(2, Math.round(1 + trail / 22));
  for (let step = steps; step >= 1; step -= 1) {
    const offset = step * (1.5 + trail / 28);
    ctx.globalAlpha *= 0.78;
    drawParticleShape(
      ctx,
      particle,
      spec,
      color,
      undefined,
      particle.x - particle.vx * offset * 8,
      particle.y - particle.vy * offset * 8,
      Math.max(0.6, particle.size * (1 - step / (steps + 2))),
    );
  }
};

const drawRain = (
  frame: CanvasFrame<GeneratedAnimationState>,
  spec: DashboardGeneratedAnimationSpec,
) => {
  const { ctx, state, width, height, delta, accentColor } = frame;
  const speed = Math.max(0.35, Math.min(2.4, delta / 16));
  const slant = 0.18 + spec.complexity / 420;
  const length = 12 + spec.speed * 0.16 + spec.complexity * 0.22;

  ctx.lineWidth = 1.05;

  // Group rain by color for batched strokes
  const colorBuckets = new Map<string, { x1: number; y1: number; x2: number; y2: number; alpha: number }[]>();
  const splashes: { x: number; y: number; size: number }[] = [];

  for (const particle of state.particles) {
    particle.y += (0.72 + spec.speed / 28) * speed;
    particle.x += (0.18 + spec.complexity / 260) * speed;
    particle.phase += 0.006 * speed;
    if (particle.y > height + length) {
      particle.y = -length;
      particle.x = Math.random() * width;
    }
    if (particle.x > width + 36) {
      particle.x = -36;
    }

    const color = getBlendedColor(spec, accentColor, particle.phase, 0.28 + Math.min(0.3, particle.size / 10));
    const x2 = particle.x + length * slant;
    const y2 = particle.y + length;
    let bucket = colorBuckets.get(color);
    if (!bucket) {
      bucket = [];
      colorBuckets.set(color, bucket);
    }
    bucket.push({ x1: particle.x, y1: particle.y, x2, y2, alpha: 0.28 + Math.min(0.3, particle.size / 10) });

    if (spec.complexity > 62 && y2 > height * 0.84 && particle.colorIndex % 7 === 0) {
      splashes.push({ x: x2, y: Math.min(height - 3, y2), size: Math.max(3, particle.size * 1.8) });
    }
  }

  // Batch stroke per color group
  for (const [color, lines] of colorBuckets) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = lines[0]?.alpha ?? 0.28;
    ctx.beginPath();
    for (const line of lines) {
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
    }
    ctx.stroke();
  }

  // Splashes are rare, draw individually
  if (splashes.length > 0) {
    ctx.globalAlpha = 0.08;
    for (const splash of splashes) {
      ctx.beginPath();
      ctx.arc(splash.x, splash.y, splash.size, 0, Math.PI);
      ctx.stroke();
    }
  }
};

const drawSnow = (
  frame: CanvasFrame<GeneratedAnimationState>,
  spec: DashboardGeneratedAnimationSpec,
) => {
  const { ctx, state, width, height, delta, elapsed, accentColor } = frame;
  const speed = Math.max(0.35, Math.min(2.4, delta / 16));
  const showCrystals = spec.complexity > 55;

  ctx.lineWidth = 0.85;

  // Move all particles first, then batch draw
  for (const particle of state.particles) {
    const drift = Math.sin(elapsed / 900 + particle.phase) * (0.28 + spec.complexity / 240);
    particle.y += (0.12 + spec.speed / 135 + particle.size / 58) * speed;
    particle.x += drift * speed;
    if (particle.y > height + 18) {
      particle.y = -18;
      particle.x = Math.random() * width;
    }
    if (particle.x < -24) particle.x = width + 24;
    if (particle.x > width + 24) particle.x = -24;
  }

  // Batch snowflake fills — all same blended fill
  ctx.globalAlpha = 0.48;
  ctx.beginPath();
  for (const particle of state.particles) {
    const color = getBlendedColor(spec, accentColor, particle.phase, 1);
    const size = Math.max(1.1, particle.size * (0.7 + spec.complexity / 180));
    // Flush on color change
    ctx.fillStyle = color;
    ctx.moveTo(particle.x + size, particle.y);
    ctx.arc(particle.x, particle.y, size, 0, TWO_PI);
  }
  ctx.fill();

  // Crystal crosses for high-complexity — batch all strokes
  if (showCrystals) {
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    for (const particle of state.particles) {
      if (particle.colorIndex % 4 !== 0) continue;
      const size = Math.max(1.1, particle.size * (0.7 + spec.complexity / 180));
      ctx.moveTo(particle.x - size * 1.5, particle.y);
      ctx.lineTo(particle.x + size * 1.5, particle.y);
      ctx.moveTo(particle.x, particle.y - size * 1.5);
      ctx.lineTo(particle.x, particle.y + size * 1.5);
    }
    ctx.strokeStyle = getColor(spec, accentColor, 0);
    ctx.stroke();
  }
};

const drawEmbers = (
  frame: CanvasFrame<GeneratedAnimationState>,
  spec: DashboardGeneratedAnimationSpec,
  maxParticles = frame.state.particles.length,
) => {
  const { ctx, state, width, height, delta, elapsed, accentColor } = frame;
  const speed = Math.max(0.35, Math.min(2.4, delta / 16));

  const emberCount = Math.min(maxParticles, state.particles.length);
  const colorBuckets = new Map<string, { x: number; y: number; size: number }[]>();

  // Move particles and bucket by blended color
  for (let index = 0; index < emberCount; index += 1) {
    const particle = state.particles[index];
    particle.y -= (0.28 + spec.speed / 72 + particle.size / 70) * speed;
    particle.x += Math.sin(elapsed / 520 + particle.phase) * (0.32 + spec.complexity / 240) * speed;
    if (particle.y < -26) {
      particle.y = height + 26;
      particle.x = Math.random() * width;
    }

    const color = getBlendedColor(spec, accentColor, particle.phase, 1);
    let bucket = colorBuckets.get(color);
    if (!bucket) {
      bucket = [];
      colorBuckets.set(color, bucket);
    }
    bucket.push({ x: particle.x, y: particle.y, size: Math.max(1, particle.size * 0.9) });
  }

  // Batch draw by color
  for (const [color, embers] of colorBuckets) {
    // 1. Draw all trails
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    for (const ember of embers) {
      ctx.moveTo(ember.x, ember.y + ember.size * (4 + spec.speed / 24));
      ctx.lineTo(ember.x, ember.y);
    }
    ctx.stroke();

    // 2. Draw all bright cores
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (const ember of embers) {
      ctx.moveTo(ember.x + ember.size, ember.y);
      ctx.arc(ember.x, ember.y, ember.size, 0, TWO_PI);
    }
    ctx.fill();
  }
};

const drawFire = (
  frame: CanvasFrame<GeneratedAnimationState>,
  spec: DashboardGeneratedAnimationSpec,
) => {
  const { ctx, width, height, elapsed, accentColor } = frame;
  const flameCount = Math.max(12, Math.min(20, Math.round(12 + spec.complexity / 10)));
  const baseY = height + 14;
  const fireAlpha = 0.13 + spec.complexity / 650;

  const baseGlow = ctx.createRadialGradient(
    width * 0.5,
    height * 1.05,
    0,
    width * 0.5,
    height * 1.05,
    Math.max(width, height) * 0.62,
  );
  baseGlow.addColorStop(0, "rgba(251, 191, 36, 0.34)");
  baseGlow.addColorStop(0.34, "rgba(251, 146, 60, 0.2)");
  baseGlow.addColorStop(1, "transparent");
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = baseGlow;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = fireAlpha;

  // Pre-resolve colors once per frame instead of per-flame
  const flameColors: string[] = [];
  for (let index = 0; index < flameCount + 3; index += 1) {
    flameColors.push(getColor(spec, accentColor, index));
  }

  for (let index = 0; index < flameCount; index += 1) {
    const center = (width * (index + 0.5)) / flameCount;
    const phase = elapsed / (620 + Math.max(1, 100 - spec.speed) * 8) + index * 1.73;
    const lickWidth = width / flameCount * (0.58 + Math.sin(phase * 0.8) * 0.16);
    const lickHeight = height * (0.13 + spec.complexity / 860) * (0.62 + Math.sin(phase) * 0.22);
    const tipX = center + Math.sin(phase * 1.4) * lickWidth * 0.46;
    const tipY = baseY - lickHeight;
    // Quantize tipY to reduce gradient object allocations
    const quantizedTipY = Math.round(tipY / 20) * 20;
    const gradient = ctx.createLinearGradient(0, baseY, 0, quantizedTipY);
    gradient.addColorStop(0, "transparent");
    gradient.addColorStop(0.18, flameColors[index + 2] || flameColors[0]);
    gradient.addColorStop(0.62, flameColors[index + 1] || flameColors[0]);
    gradient.addColorStop(1, flameColors[index] || flameColors[0]);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(center - lickWidth * 0.46, baseY);
    ctx.bezierCurveTo(
      center - lickWidth * 0.58,
      baseY - lickHeight * 0.22,
      center - lickWidth * 0.22,
      baseY - lickHeight * 0.68,
      tipX,
      tipY,
    );
    ctx.bezierCurveTo(
      center + lickWidth * 0.28,
      baseY - lickHeight * 0.62,
      center + lickWidth * 0.5,
      baseY - lickHeight * 0.22,
      center + lickWidth * 0.4,
      baseY,
    );
    ctx.closePath();
    ctx.fill();
  }

  drawEmbers(frame, spec, 36);
};

const pseudoRandom = (seed: number) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

const getSpecTurbulence = (spec: DashboardGeneratedAnimationSpec) =>
  typeof (spec as Partial<GeneratedRuntimeLayer>).turbulence === "number"
    ? (spec as Partial<GeneratedRuntimeLayer>).turbulence || 0
    : spec.complexity;

const drawLightning = (
  frame: CanvasFrame<GeneratedAnimationState>,
  spec: DashboardGeneratedAnimationSpec,
) => {
  const { ctx, width, height, elapsed, accentColor } = frame;
  const cycleMs = 1100 + Math.max(0, 100 - spec.speed) * 18;
  const cycle = elapsed / cycleMs;
  const flash = Math.pow(Math.max(0, Math.sin(cycle * TWO_PI)), 10);
  if (flash < 0.035) return;
  const turbulence = getSpecTurbulence(spec);

  ctx.globalAlpha = flash * (0.05 + spec.complexity / 900);
  ctx.fillStyle = getColor(spec, accentColor, 1);
  ctx.fillRect(0, 0, width, height);

  const boltCount = Math.max(1, Math.min(3, Math.round(1 + spec.density / 42)));
  for (let bolt = 0; bolt < boltCount; bolt += 1) {
    const seed = Math.floor(cycle) * 31 + bolt * 97;
    let x = width * (0.16 + pseudoRandom(seed) * 0.68);
    let y = -12;
    const segments = Math.max(5, Math.round(5 + spec.complexity / 14));
    ctx.strokeStyle = getColor(spec, accentColor, bolt);
    ctx.lineWidth = 1.2 + flash * 2.1;
    ctx.globalAlpha = 0.22 + flash * 0.62;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let segment = 1; segment <= segments; segment += 1) {
      const progress = segment / segments;
      x += (pseudoRandom(seed + segment * 11) - 0.5) * (width * 0.09 + turbulence * 0.6);
      y = height * (progress * (0.55 + pseudoRandom(seed + 5) * 0.32));
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (spec.complexity > 58) {
      ctx.globalAlpha *= 0.48;
      ctx.beginPath();
      ctx.moveTo(x, y * 0.72);
      ctx.lineTo(x + (pseudoRandom(seed + 71) - 0.5) * width * 0.18, y * 0.86);
      ctx.stroke();
    }
  }
};

const drawCachedFogOrNebula = (
  frame: CanvasFrame<GeneratedAnimationState>,
  spec: DashboardGeneratedAnimationSpec | GeneratedRuntimeLayer,
  layerIndex: number,
) => {
  const { ctx, state, width, height, elapsed, accentColor } = frame;
  const isNebula = spec.kind === "nebula" || spec.kind === "auroraCurtain";

  if (!state.offscreenBuffers) {
    state.offscreenBuffers = new Map();
  }

  let buffer = state.offscreenBuffers.get(layerIndex);
  // Re-render cache every 6 frames or on resize
  const needsRender =
    !buffer ||
    buffer.lastWidth !== width ||
    buffer.lastHeight !== height ||
    buffer.frameCounter >= 6;

  if (needsRender) {
    if (!buffer) {
      // Create at half resolution for massive speedup of gradient fills
      const hasOffscreenCanvas = typeof OffscreenCanvas !== "undefined";
      const bufCanvas = hasOffscreenCanvas
        ? new OffscreenCanvas(Math.max(1, width / 2), Math.max(1, height / 2))
        : document.createElement("canvas");
      if (!hasOffscreenCanvas) {
        bufCanvas.width = Math.max(1, width / 2);
        bufCanvas.height = Math.max(1, height / 2);
      }
      buffer = {
        canvas: bufCanvas,
        ctx: bufCanvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        frameCounter: 0,
        lastWidth: width,
        lastHeight: height,
      };
      state.offscreenBuffers.set(layerIndex, buffer);
    }
    buffer.frameCounter = 0;
    buffer.lastWidth = width;
    buffer.lastHeight = height;

    const bCtx = buffer.ctx;
    const bWidth = buffer.canvas.width;
    const bHeight = buffer.canvas.height;
    bCtx.clearRect(0, 0, bWidth, bHeight);

    const pulse = isNebula ? 0.8 + Math.sin(elapsed / (900 + Math.max(1, 100 - spec.speed) * 12)) * 0.12 : 1;
    const drift = elapsed / (isNebula ? (9000 + Math.max(0, 100 - spec.speed) * 90) : (11000 + Math.max(0, 100 - spec.speed) * 85));
    const blobs = isNebula
      ? Math.max(4, Math.min(5, Math.round(4 + spec.complexity / 26)))
      : Math.max(4, Math.min(7, Math.round(4 + spec.complexity / 28)));

    for (let index = 0; index < blobs; index += 1) {
      let x, y, radius;
      if (isNebula) {
        const turbulence = (spec as Partial<GeneratedRuntimeLayer>).turbulence ?? spec.complexity;
        const scale = (spec as Partial<GeneratedRuntimeLayer>).scale ?? 64;
        const opacity = (spec as Partial<GeneratedRuntimeLayer>).opacity ?? 70;
        const angle = drift + index * 2.11;
        x = bWidth * (0.5 + Math.cos(angle) * (0.24 + turbulence / 520));
        y = bHeight * (0.5 + Math.sin(angle * 0.72) * (0.22 + turbulence / 560));
        radius = Math.max(bWidth, bHeight) * (0.18 + scale / 360) * pulse;
        bCtx.globalAlpha = 0.08 + opacity / 520;
      } else {
        x = bWidth * ((index / blobs + drift * (0.05 + index * 0.006)) % 1.15) - bWidth * 0.08;
        y = bHeight * (0.18 + pseudoRandom(index + 12) * 0.68);
        radius = Math.max(bWidth, bHeight) * (0.16 + spec.complexity / 420);
        bCtx.globalAlpha = 0.045 + spec.density / 1200;
      }
      const gradient = bCtx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, getColor(spec, accentColor, index));
      gradient.addColorStop(0.62, getColor(spec, accentColor, index + 1));
      gradient.addColorStop(1, "transparent");
      bCtx.fillStyle = gradient;
      bCtx.fillRect(0, 0, bWidth, bHeight);
    }
  } else if (buffer) {
    buffer.frameCounter += 1;
  }

  // Draw cached buffer
  ctx.globalAlpha = 1; // Alpha already baked in, or handled by drawLayerFrame wrapper
  if (buffer) {
    ctx.drawImage(buffer.canvas, 0, 0, width, height);
  }
};

const drawBubbles = (
  frame: CanvasFrame<GeneratedAnimationState>,
  spec: DashboardGeneratedAnimationSpec,
) => {
  const { ctx, state, width, height, delta, elapsed, accentColor } = frame;
  const speed = Math.max(0.35, Math.min(2.4, delta / 16));

  ctx.lineWidth = 1;
  for (const particle of state.particles) {
    particle.y -= (0.12 + spec.speed / 105 + particle.size / 80) * speed;
    particle.x += Math.sin(elapsed / 820 + particle.phase) * (0.24 + spec.complexity / 320) * speed;
    if (particle.y < -22) {
      particle.y = height + 22;
      particle.x = Math.random() * width;
    }
    if (particle.x < -24) particle.x = width + 24;
    if (particle.x > width + 24) particle.x = -24;

    const color = getColor(spec, accentColor, particle.colorIndex);
    const radius = Math.max(2.4, particle.size * (1.3 + spec.complexity / 120));
    ctx.globalAlpha = 0.22 + Math.min(0.26, particle.size / 18);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, radius, 0, TWO_PI);
    ctx.stroke();
    ctx.globalAlpha *= 0.45;
    ctx.beginPath();
    ctx.arc(particle.x - radius * 0.24, particle.y - radius * 0.24, radius * 0.22, 0, TWO_PI);
    ctx.stroke();
  }
};

const drawWaves = (
  frame: CanvasFrame<GeneratedAnimationState>,
  spec: DashboardGeneratedAnimationSpec,
) => {
  const { ctx, state, width, height, elapsed, accentColor } = frame;
  const phase = elapsed / (1800 + Math.max(0, 100 - spec.speed) * 22);
  const amplitude = Math.max(18, height * (0.04 + spec.complexity / 900));

  state.bands.forEach((offset, index) => {
    const yBase = height * (0.24 + index / Math.max(4, state.bands.length + 1));
    ctx.globalAlpha = 0.12 + (index % 4) * 0.04;
    ctx.strokeStyle = getColor(spec, accentColor, index);
    ctx.lineWidth = spec.kind === "ribbons" || spec.kind === "energyRibbons" ? 2.4 : 1.4;
    ctx.beginPath();
    ctx.moveTo(-30, yBase);
    for (let x = -30; x <= width + 30; x += 42) {
      const y =
        yBase +
        Math.sin(x / 110 + phase + offset) * amplitude +
        Math.sin(x / 235 - phase * 0.65 + offset) * amplitude * 0.55;
      const cpX = x + 21;
      const cpY = y + Math.cos(x / 90 + phase) * amplitude * 0.4;
      ctx.quadraticCurveTo(cpX, cpY, x + 42, y);
    }
    ctx.stroke();
  });
};

const drawGrid = (
  frame: CanvasFrame<GeneratedAnimationState>,
  spec: DashboardGeneratedAnimationSpec,
) => {
  const { ctx, width, height, elapsed, accentColor } = frame;
  const spacing = Math.max(24, 76 - spec.density * 0.38);
  const offset = ((elapsed / (28 + Math.max(1, 100 - spec.speed))) % spacing);
  ctx.globalAlpha = 0.16 + spec.complexity / 500;
  ctx.strokeStyle = getColor(spec, accentColor, 0);
  ctx.lineWidth = 1;

  ctx.beginPath();
  for (let x = -spacing; x <= width + spacing; x += spacing) {
    ctx.moveTo(x + offset, 0);
    ctx.lineTo(x + offset, height);
  }
  for (let y = -spacing; y <= height + spacing; y += spacing) {
    ctx.moveTo(0, y + offset);
    ctx.lineTo(width, y + offset);
  }
  ctx.stroke();
};

const drawOrbits = (
  frame: CanvasFrame<GeneratedAnimationState>,
  spec: DashboardGeneratedAnimationSpec,
) => {
  const { ctx, state, width, height, elapsed, accentColor } = frame;
  const cx = width / 2;
  const cy = height / 2;
  const radiusBase = Math.min(width, height) * 0.18;
  const time = elapsed / (1400 + Math.max(0, 100 - spec.speed) * 24);

  const orbitCount = Math.min(state.particles.length, 56);
  for (let index = 0; index < orbitCount; index += 1) {
    const particle = state.particles[index];
    const ring = 1 + (index % 5);
    const radius = radiusBase + ring * (12 + spec.complexity * 0.55);
    const angle = time * (0.38 + ring * 0.08) + particle.phase;
    const x = cx + Math.cos(angle) * radius * (1.1 + (ring % 2) * 0.18);
    const y = cy + Math.sin(angle) * radius * 0.58;
    ctx.globalAlpha = 0.48;
    drawParticleShape(ctx, particle, spec, getColor(spec, accentColor, particle.colorIndex), spec.shape || "rings", x, y);
  }
};

// Nebula logic moved into drawCachedFogOrNebula

const drawScanlines = (
  frame: CanvasFrame<GeneratedAnimationState>,
  spec: GeneratedRuntimeLayer,
) => {
  const { ctx, width, height, elapsed, accentColor } = frame;
  const spacing = Math.max(5, 18 - spec.scale / 10);
  const offset = (elapsed / (38 + Math.max(1, 100 - spec.speed))) % spacing;
  ctx.strokeStyle = getColor(spec, accentColor, 0);
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.05 + spec.opacity / 900;
  ctx.beginPath();
  for (let y = -spacing; y < height + spacing; y += spacing) {
    ctx.moveTo(0, y + offset);
    ctx.lineTo(width, y + offset);
  }
  ctx.stroke();
};

const drawRadar = (
  frame: CanvasFrame<GeneratedAnimationState>,
  spec: GeneratedRuntimeLayer,
) => {
  const { ctx, width, height, elapsed, accentColor } = frame;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const maxRadius = Math.min(width, height) * (0.24 + spec.scale / 260);
  const sweep = elapsed / (1200 + Math.max(0, 100 - spec.speed) * 24);
  ctx.strokeStyle = getColor(spec, accentColor, 0);
  ctx.lineWidth = 1;
  for (let index = 1; index <= 5; index += 1) {
    ctx.globalAlpha = (0.08 + spec.opacity / 720) * (1 - index / 8);
    ctx.beginPath();
    ctx.arc(cx, cy, maxRadius * (index / 5), 0, TWO_PI);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.22 + spec.opacity / 520;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweep) * maxRadius, cy + Math.sin(sweep) * maxRadius);
  ctx.stroke();
};

const drawWormhole = (
  frame: CanvasFrame<GeneratedAnimationState>,
  spec: GeneratedRuntimeLayer,
) => {
  const { ctx, width, height, elapsed, accentColor } = frame;
  const cx = width / 2;
  const cy = height / 2;
  const time = elapsed / (1800 + Math.max(0, 100 - spec.speed) * 18);
  const rings = Math.max(12, Math.round(12 + spec.complexity / 4));
  for (let index = 0; index < rings; index += 1) {
    const progress = index / rings;
    const twist = time + progress * Math.PI * 5;
    const radius = (Math.min(width, height) * (0.04 + progress * 0.44) * (0.7 + spec.scale / 160));
    const x = cx + Math.cos(twist) * progress * spec.turbulence * 0.45;
    const y = cy + Math.sin(twist * 0.8) * progress * spec.turbulence * 0.3;
    ctx.globalAlpha = (0.08 + spec.opacity / 520) * (1 - progress * 0.36);
    ctx.strokeStyle = getColor(spec, accentColor, index);
    ctx.lineWidth = 0.8 + progress * 2.4;
    ctx.beginPath();
    ctx.arc(x, y, radius, twist, twist + Math.PI * (1.25 + spec.trail / 70));
    ctx.stroke();
  }
};

const drawParticleField = (
  frame: CanvasFrame<GeneratedAnimationState>,
  spec: DashboardGeneratedAnimationSpec,
  trail = 0,
) => {
  const { ctx, state, width, height, delta, accentColor } = frame;
  const speed = Math.max(0.35, Math.min(2.4, delta / 16));
  for (const particle of state.particles) {
    moveParticle(particle, spec, width, height, speed);
    const color = getBlendedColor(spec, accentColor, particle.phase, 1);
    ctx.globalAlpha = 0.44 + (particle.size % 3) * 0.1;
    if (trail > 0) drawParticleTrail(ctx, particle, spec, color, trail);
    ctx.globalAlpha = 0.44 + (particle.size % 3) * 0.1;
    drawParticleShape(ctx, particle, spec, color);
  }
};

/** Fake-glow: draw shape at 2× size with low alpha instead of expensive shadowBlur. */
const applyFakeGlow = (
  ctx: CanvasRenderingContext2D,
  spec: GeneratedRuntimeLayer,
  drawContent: () => void,
) => {
  if (!spec.glow && spec.blur <= 0) {
    drawContent();
    return;
  }
  // First pass: soft glow at reduced alpha
  const savedAlpha = ctx.globalAlpha;
  ctx.globalAlpha = savedAlpha * 0.35;
  ctx.lineWidth = (ctx.lineWidth || 1) + Math.min(4, 1.5 + spec.blur * 0.08);
  drawContent();
  // Second pass: crisp main draw
  ctx.globalAlpha = savedAlpha;
  ctx.lineWidth = Math.max(0.8, ctx.lineWidth - Math.min(4, 1.5 + spec.blur * 0.08));
  drawContent();
};

const drawLayerFrame = (
  frame: CanvasFrame<GeneratedAnimationState>,
  spec: GeneratedRuntimeLayer,
  layerIndex: number,
) => {
  const { ctx } = frame;
  ctx.globalCompositeOperation = spec.blendMode as GlobalCompositeOperation;
  ctx.globalAlpha = spec.opacity / 100;
  // Replaced shadowBlur with fake-glow technique for better performance.
  // shadowBlur forces a per-shape GPU blur pass which is extremely expensive
  // with 60+ particles per frame.

  const needsGlow = spec.glow || spec.blur > 0;
  const drawContent = () => {
    if (spec.kind === "nebula" || spec.kind === "auroraCurtain" || spec.kind === "fog") {
      drawCachedFogOrNebula(frame, spec, layerIndex);
    } else if (spec.kind === "scanlines") {
      drawScanlines(frame, spec);
    } else if (spec.kind === "radar") {
      drawRadar(frame, spec);
    } else if (spec.kind === "wormhole") {
      drawWormhole(frame, spec);
    } else if (spec.kind === "constellation") {
      drawMesh(frame, spec);
    } else if (spec.kind === "energyRibbons") {
      drawWaves(frame, spec);
    } else if (spec.kind === "dataStorm") {
      const speed = Math.max(0.35, Math.min(2.4, frame.delta / 16));
      const stormCount = Math.min(frame.state.particles.length, 78);
      // Pre-set glyph font once for the entire storm batch
      const glyphShape = spec.shape || "glyphs";
      if (glyphShape === "glyphs" && stormCount > 0) {
        const representativeSize = frame.state.particles[0].size;
        ctx.font = getGlyphFont(representativeSize);
      }
      for (let index = 0; index < stormCount; index += 1) {
        const particle = frame.state.particles[index];
        moveParticle(particle, spec, frame.width, frame.height, speed, "down");
        const color = getColor(spec, frame.accentColor, particle.colorIndex);
        ctx.globalAlpha = spec.opacity / 120;
        if (spec.trail > 0) drawParticleTrail(ctx, particle, spec, color, spec.trail);
        ctx.globalAlpha = spec.opacity / 100;
        drawParticleShape(ctx, particle, spec, color, glyphShape);
      }
    } else if (spec.kind === "rain") {
      drawRain(frame, spec);
    } else if (spec.kind === "snow") {
      drawSnow(frame, spec);
    } else if (spec.kind === "fire") {
      drawFire(frame, spec);
    } else if (spec.kind === "embers") {
      drawEmbers(frame, spec);
    } else if (spec.kind === "lightning") {
      drawLightning(frame, spec);
    } else if (spec.kind === "bubbles") {
      drawBubbles(frame, spec);
    } else if (spec.kind === "mesh") {
      drawMesh(frame, spec);
    } else if (spec.kind === "waves" || spec.kind === "ribbons") {
      drawWaves(frame, spec);
    } else if (spec.kind === "grid") {
      drawGrid(frame, spec);
    } else if (spec.kind === "orbits") {
      drawOrbits(frame, spec);
    } else {
      drawParticleField(frame, spec, spec.trail);
    }
  };

  if (needsGlow) {
    applyFakeGlow(ctx, spec, drawContent);
  } else {
    drawContent();
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
};

const drawGeneratedFrame = (
  frame: CanvasFrame<GeneratedAnimationState>,
  spec: DashboardGeneratedAnimationSpec,
) => {
  const { ctx, state, width, height } = frame;
  const layerStates = state.layerStates || [];
  const runtimeLayers = state.runtimeLayers || [];
  const hasLayerStack = runtimeLayers.length > 0 && layerStates.length > 0;
  ctx.clearRect(0, 0, width, height);
  ctx.globalAlpha = 1;
  // Removed shadowBlur from main draw path — glow is handled per-layer via applyFakeGlow

  if (layerOnlyKinds.has(spec.kind)) {
    if (!hasLayerStack) {
      drawLayerFrame(frame, toBaseRuntimeLayer(spec), 0);
    }
  } else if (spec.kind === "mesh") {
    drawMesh(frame, spec);
  } else if (spec.kind === "waves" || spec.kind === "ribbons") {
    drawWaves(frame, spec);
  } else if (spec.kind === "grid") {
    drawGrid(frame, spec);
  } else if (spec.kind === "orbits") {
    drawOrbits(frame, spec);
  } else if (spec.kind === "rain") {
    drawRain(frame, spec);
  } else if (spec.kind === "snow") {
    drawSnow(frame, spec);
  } else if (spec.kind === "fire") {
    drawFire(frame, spec);
  } else if (spec.kind === "embers") {
    drawEmbers(frame, spec);
  } else if (spec.kind === "lightning") {
    drawLightning(frame, spec);
  } else if (spec.kind === "bubbles") {
    drawBubbles(frame, spec);
  } else {
    drawParticleField(frame, spec);
  }

  if (hasLayerStack) {
    for (let index = 0; index < runtimeLayers.length; index += 1) {
      const layerState = layerStates[index];
      const layerSpec = runtimeLayers[index];
      if (!layerState) continue;
      // Apply depth parallax scaling
      const speedScale = getDepthFactor(layerSpec.depth);
      const layerFrame: CanvasFrame<GeneratedAnimationState> = {
        ...frame,
        delta: frame.delta * speedScale,
        elapsed: frame.elapsed * speedScale,
        state: layerState,
      };
      drawLayerFrame(layerFrame, layerSpec, index);
    }
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
};

interface GeneratedCanvasBackgroundProps {
  spec?: DashboardGeneratedAnimationSpec;
}

const GeneratedCanvasBackground: React.FC<GeneratedCanvasBackgroundProps> = ({
  spec,
}) => {
  const normalizedSpec = React.useMemo(
    () => ensureDashboardGeneratedAnimationSpec(spec, DEFAULT_DASHBOARD_GENERATED_ANIMATION),
    [spec],
  );
  const createState = React.useCallback(
    (width: number, height: number) =>
      createGeneratedState(width, height, normalizedSpec),
    [normalizedSpec],
  );
  const drawFrame = React.useCallback(
    (frame: CanvasFrame<GeneratedAnimationState>) =>
      drawGeneratedFrame(frame, normalizedSpec),
    [normalizedSpec],
  );

  // Track canvas size for adaptive performance
  const [pixelCount, setPixelCount] = React.useState(1024 * 768);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const layerCount = normalizedSpec.layers?.length || 0;

  // Adaptive DPR/FPS based on screen size + layer complexity
  // Small widget < 300k px -> crisp. Full screen > 1M px -> scale down.
  const isLargeScreen = pixelCount > 1_000_000;
  const isSmallWidget = pixelCount < 300_000;

  const adaptiveDpr = layerCount > 4 ? 1 : isSmallWidget ? 1.5 : isLargeScreen ? 1 : 1.25;
  const adaptiveFps = layerCount > 4 ? 20 : isSmallWidget ? 45 : isLargeScreen ? 24 : 30;

  const canvasRef = useAnimatedCanvas(createState, drawFrame, {
    accentRefreshMs: 500,
    maxDevicePixelRatio: adaptiveDpr,
    maxFps: adaptiveFps,
  });

  // Track resizing to update pixel count for adaptive budgets
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setPixelCount(entries[0].contentRect.width * entries[0].contentRect.height);
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        opacity: mounted ? 0.85 : 0,
        transition: "opacity 600ms ease-in-out",
      }}
      className="block h-full w-full mix-blend-screen"
    />
  );
};

export default GeneratedCanvasBackground;
