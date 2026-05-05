import React from "react";

import { useAnimatedCanvas, type CanvasFrame } from "./useAnimatedCanvas";

const TWO_PI = Math.PI * 2;

interface PlasmaOrb {
  x: number;
  y: number;
  radius: number;
  phase: number;
  speed: number;
}

interface PlasmaCloudState {
  orbs: PlasmaOrb[];
}

const createPlasmaState = (width: number, height: number): PlasmaCloudState => ({
  orbs: Array.from({ length: 9 }, (_, index) => ({
    x: (index % 3) * width * 0.32 + width * 0.18,
    y: Math.floor(index / 3) * height * 0.28 + height * 0.22,
    radius: Math.max(90, Math.min(width, height) * (0.22 + (index % 3) * 0.035)),
    phase: index * 0.74,
    speed: 0.8 + (index % 4) * 0.18,
  })),
});

const drawPlasmaFrame = ({
  ctx,
  state,
  width,
  height,
  elapsed,
  accentColor,
}: CanvasFrame<PlasmaCloudState>) => {
  ctx.clearRect(0, 0, width, height);
  const time = elapsed / 2600;

  for (const [index, orb] of state.orbs.entries()) {
    const x = orb.x + Math.sin(time * orb.speed + orb.phase) * width * 0.09;
    const y = orb.y + Math.cos(time * (orb.speed * 0.72) + orb.phase) * height * 0.08;
    const pulse = 0.82 + Math.sin(time * 1.6 + orb.phase) * 0.18;
    const gradient = ctx.createLinearGradient(
      x - orb.radius,
      y - orb.radius,
      x + orb.radius,
      y + orb.radius,
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    gradient.addColorStop(0.42, index % 2 === 0 ? accentColor : "rgba(251, 113, 133, 0.78)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.globalAlpha = 0.1 + (index % 3) * 0.035;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, orb.radius * pulse, 0, TWO_PI);
    ctx.fill();
  }

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  for (let x = -20; x < width + 20; x += 34) {
    const y = height * 0.5 + Math.sin(x / 80 + time) * height * 0.16;
    ctx.beginPath();
    ctx.arc(x, y, 1.2, 0, TWO_PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
};

const PlasmaCloud: React.FC = () => {
  const canvasRef = useAnimatedCanvas(createPlasmaState, drawPlasmaFrame, {
    accentRefreshMs: 700,
    maxDevicePixelRatio: 1.15,
    maxFps: 26,
  });
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="block h-full w-full opacity-85 mix-blend-screen"
    />
  );
};

export default PlasmaCloud;
