import React from "react";

import { useAnimatedCanvas, type CanvasFrame } from "./useAnimatedCanvas";

interface AuroraFieldState {
  bands: number[];
}

const createAuroraState = (): AuroraFieldState => ({
  bands: [0, 1.15, 2.3, 3.35],
});

const drawAuroraFrame = ({
  ctx,
  state,
  width,
  height,
  elapsed,
  accentColor,
}: CanvasFrame<AuroraFieldState>) => {
  ctx.clearRect(0, 0, width, height);
  const phase = elapsed / 3600;
  const bandHeight = Math.max(80, height * 0.18);

  state.bands.forEach((offset, index) => {
    const gradient = ctx.createLinearGradient(0, height * 0.18, width, height * 0.78);
    gradient.addColorStop(0, "rgba(45, 212, 191, 0)");
    gradient.addColorStop(0.34, index % 2 === 0 ? accentColor : "rgba(232, 121, 249, 0.86)");
    gradient.addColorStop(0.72, "rgba(125, 211, 252, 0.72)");
    gradient.addColorStop(1, "rgba(45, 212, 191, 0)");

    ctx.globalAlpha = 0.14 + index * 0.045;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-40, height * (0.2 + index * 0.1));
    for (let x = -40; x <= width + 40; x += 18) {
      const y =
        height * (0.22 + index * 0.11) +
        Math.sin(x / 112 + phase + offset) * bandHeight * 0.5 +
        Math.sin(x / 221 - phase * 0.8 + offset) * bandHeight * 0.34;
      ctx.lineTo(x, y);
    }
    for (let x = width + 40; x >= -40; x -= 18) {
      const y =
        height * (0.44 + index * 0.11) +
        Math.sin(x / 126 + phase + offset) * bandHeight * 0.48 +
        Math.sin(x / 240 - phase * 0.7 + offset) * bandHeight * 0.26;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  });

  ctx.globalAlpha = 1;
};

const AuroraField: React.FC = () => {
  const canvasRef = useAnimatedCanvas(createAuroraState, drawAuroraFrame, {
    accentRefreshMs: 700,
    maxDevicePixelRatio: 1.15,
    maxFps: 26,
  });
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="block h-full w-full opacity-90 mix-blend-screen"
    />
  );
};

export default AuroraField;
