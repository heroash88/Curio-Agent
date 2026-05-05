import React from "react";

import { useAnimatedCanvas, type CanvasFrame } from "./useAnimatedCanvas";

interface MeshPoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface ParticleMeshState {
  points: MeshPoint[];
}

const createParticleState = (width: number, height: number): ParticleMeshState => {
  const count = Math.max(18, Math.min(68, Math.round((width * height) / 24000)));
  return {
    points: Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.28,
    })),
  };
};

const TWO_PI = Math.PI * 2;

const drawParticleFrame = ({
  ctx,
  state,
  width,
  height,
  delta,
  accentColor,
}: CanvasFrame<ParticleMeshState>) => {
  ctx.clearRect(0, 0, width, height);
  const speed = Math.min(2.2, Math.max(0.45, delta / 16));
  const maxDistance = width < 640 ? 116 : 150;
  const maxDistanceSq = maxDistance * maxDistance;

  for (const point of state.points) {
    point.x += point.vx * speed;
    point.y += point.vy * speed;
    if (point.x < 0 || point.x > width) point.vx *= -1;
    if (point.y < 0 || point.y > height) point.vy *= -1;
    point.x = Math.max(0, Math.min(width, point.x));
    point.y = Math.max(0, Math.min(height, point.y));
  }

  // Use squared distance to avoid Math.hypot (sqrt) for each of the O(n²) pairs
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1;
  state.points.forEach((point, index) => {
    for (let i = index + 1; i < state.points.length; i += 1) {
      const other = state.points[i];
      const dx = point.x - other.x;
      const dy = point.y - other.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > maxDistanceSq) continue;
      const distance = Math.sqrt(distanceSq);
      ctx.globalAlpha = Math.max(0, 0.34 - distance / maxDistance / 3);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(other.x, other.y);
      ctx.stroke();
    }
  });

  // Batch all particle dots into a single beginPath/fill call
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  for (const point of state.points) {
    ctx.moveTo(point.x + 1.8, point.y);
    ctx.arc(point.x, point.y, 1.8, 0, TWO_PI);
  }
  ctx.fill();
  ctx.globalAlpha = 1;
};

const ParticleMesh: React.FC = () => {
  const canvasRef = useAnimatedCanvas(createParticleState, drawParticleFrame, {
    accentRefreshMs: 600,
    maxDevicePixelRatio: 1.2,
    maxFps: 30,
  });
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="block h-full w-full opacity-70 mix-blend-screen"
    />
  );
};

export default ParticleMesh;
