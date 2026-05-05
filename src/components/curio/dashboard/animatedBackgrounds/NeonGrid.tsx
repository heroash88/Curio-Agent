import React from "react";

import { useAnimatedCanvas, type CanvasFrame } from "./useAnimatedCanvas";

interface NeonGridState {
  horizon: number;
}

const createNeonGridState = (_width: number, height: number): NeonGridState => ({
  horizon: height * 0.55,
});

const drawNeonGridFrame = ({
  ctx,
  state,
  width,
  height,
  elapsed,
  accentColor,
}: CanvasFrame<NeonGridState>) => {
  ctx.clearRect(0, 0, width, height);
  const horizon = state.horizon || height * 0.55;
  const time = elapsed / 1000;
  const vanishingX = width / 2;

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "rgba(0,0,0,0)");
  sky.addColorStop(0.52, "rgba(0,0,0,0)");
  sky.addColorStop(1, "rgba(0,0,0,0.34)");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.lineWidth = 1;
  ctx.strokeStyle = accentColor;
  ctx.globalAlpha = 0.42;

  for (let i = -10; i <= 10; i += 1) {
    const bottomX = vanishingX + i * (width / 10);
    ctx.beginPath();
    ctx.moveTo(vanishingX, horizon);
    ctx.lineTo(bottomX, height + 20);
    ctx.stroke();
  }

  for (let row = 0; row < 24; row += 1) {
    const progress = ((row + (time * 0.72) % 1) / 24) ** 1.7;
    const y = horizon + progress * (height - horizon + 70);
    const inset = (1 - progress) * width * 0.48;
    ctx.globalAlpha = 0.12 + progress * 0.44;
    ctx.beginPath();
    ctx.moveTo(inset, y);
    ctx.lineTo(width - inset, y);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(width, horizon);
  ctx.stroke();
  ctx.globalAlpha = 1;
};

const NeonGrid: React.FC = () => {
  const canvasRef = useAnimatedCanvas(createNeonGridState, drawNeonGridFrame, {
    accentRefreshMs: 700,
    maxDevicePixelRatio: 1.2,
    maxFps: 30,
  });
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="block h-full w-full opacity-80 mix-blend-screen"
    />
  );
};

export default NeonGrid;
