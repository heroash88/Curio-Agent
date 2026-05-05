import React from "react";

import { useAnimatedCanvas, type CanvasFrame } from "./useAnimatedCanvas";

const TWO_PI = Math.PI * 2;

interface Star {
  x: number;
  y: number;
  z: number;
}

interface StarfieldState {
  stars: Star[];
}

const createStarfieldState = (width: number, height: number): StarfieldState => {
  const count = Math.max(70, Math.min(180, Math.round((width * height) / 7600)));
  return {
    stars: Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * width,
      y: (Math.random() - 0.5) * height,
      z: Math.random() * width,
    })),
  };
};

const resetStar = (star: Star, width: number, height: number) => {
  star.x = (Math.random() - 0.5) * width;
  star.y = (Math.random() - 0.5) * height;
  star.z = width;
};

const drawStarfieldFrame = ({
  ctx,
  state,
  width,
  height,
  delta,
  accentColor,
}: CanvasFrame<StarfieldState>) => {
  ctx.clearRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height / 2;
  const speed = Math.max(0.4, delta / 18);

  for (const star of state.stars) {
    star.z -= speed * 5.5;
    if (star.z <= 1) {
      resetStar(star, width, height);
    }

    const scale = width / Math.max(1, star.z);
    const x = cx + star.x * scale;
    const y = cy + star.y * scale;
    if (x < -20 || x > width + 20 || y < -20 || y > height + 20) {
      resetStar(star, width, height);
      continue;
    }

    const radius = Math.max(0.5, Math.min(2.6, (1 - star.z / width) * 2.8));
    ctx.globalAlpha = Math.max(0.2, Math.min(0.9, radius / 2.6));
    ctx.fillStyle = Math.random() > 0.82 ? accentColor : "rgba(255,255,255,0.86)";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TWO_PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
};

const Starfield: React.FC = () => {
  const canvasRef = useAnimatedCanvas(createStarfieldState, drawStarfieldFrame, {
    accentRefreshMs: 700,
    maxDevicePixelRatio: 1.25,
    maxFps: 36,
  });
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="block h-full w-full opacity-80 mix-blend-screen"
    />
  );
};

export default Starfield;
