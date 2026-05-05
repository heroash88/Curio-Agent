import React from "react";

import { useAnimatedCanvas, type CanvasFrame } from "./useAnimatedCanvas";

interface WaveFieldState {
  offsets: number[];
}

const createWaveState = (): WaveFieldState => ({
  offsets: [0, 0.7, 1.45, 2.2],
});

const drawWaveFrame = ({
  ctx,
  state,
  width,
  height,
  elapsed,
  accentColor,
}: CanvasFrame<WaveFieldState>) => {
  ctx.clearRect(0, 0, width, height);
  const centerY = height * 0.58;
  const amplitude = Math.max(18, height * 0.08);
  const phase = elapsed / 2600;

  state.offsets.forEach((offset, index) => {
    ctx.globalAlpha = 0.16 + index * 0.07;
    ctx.strokeStyle = index % 2 === 0 ? accentColor : "rgba(255,255,255,0.74)";
    ctx.lineWidth = index === 0 ? 2 : 1.2;
    ctx.beginPath();
    for (let x = -20; x <= width + 20; x += 16) {
      const y =
        centerY +
        Math.sin(x / 86 + phase + offset) * amplitude +
        Math.sin(x / 173 - phase * 0.6 + offset) * amplitude * 0.55 +
        (index - 1.5) * 28;
      if (x <= -20) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  });

  ctx.globalAlpha = 1;
};

const WaveField: React.FC = () => {
  const canvasRef = useAnimatedCanvas(createWaveState, drawWaveFrame, {
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

export default WaveField;
