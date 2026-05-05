import React from "react";

import { useAnimatedCanvas, type CanvasFrame } from "./useAnimatedCanvas";

interface MatrixColumn {
  head: number;
  speed: number;
  length: number;
  glyphOffset: number;
  brightness: number;
  resetHold: number;
}

export interface MatrixRainState {
  columns: MatrixColumn[];
  fontSize: number;
  columnWidth: number;
  symbols: string[];
}

const MATRIX_SYMBOLS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&*+-<>[]{}";

const createColumn = (height: number, fontSize: number): MatrixColumn => {
  const visibleRows = Math.max(8, Math.ceil(height / fontSize));
  return {
    head: Math.random() * (visibleRows + 24) - 18,
    speed: 0.34 + Math.random() * 0.76,
    length: 11 + Math.floor(Math.random() * 18),
    glyphOffset: Math.floor(Math.random() * MATRIX_SYMBOLS.length),
    brightness: 0.78 + Math.random() * 0.34,
    resetHold: Math.random() * 26,
  };
};

export const createMatrixState = (width: number, height: number): MatrixRainState => {
  const fontSize = width < 520 ? 13 : 17;
  const columnWidth = Math.max(9, fontSize * 0.72);
  const columnCount = Math.min(156, Math.max(1, Math.ceil(width / columnWidth)));
  const symbols = MATRIX_SYMBOLS.split("");
  return {
    columns: Array.from({ length: columnCount }, () => createColumn(height, fontSize)),
    fontSize,
    columnWidth,
    symbols,
  };
};

const matrixSymbolAt = (
  symbols: string[],
  columnIndex: number,
  row: number,
  elapsed: number,
  offset: number,
) => {
  const timeBucket = Math.floor(elapsed / 130);
  const index =
    Math.abs(columnIndex * 17 + row * 31 + timeBucket + offset) % symbols.length;
  return symbols[index] || "0";
};

export const drawMatrixFrame = ({
  ctx,
  state,
  width,
  height,
  delta,
  elapsed,
}: CanvasFrame<MatrixRainState>) => {
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(0, 4, 2, 0.18)";
  ctx.fillRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(
    width * 0.48,
    height * 0.38,
    0,
    width * 0.5,
    height * 0.45,
    Math.max(width, height) * 0.72,
  );
  vignette.addColorStop(0, "rgba(18, 96, 46, 0.08)");
  vignette.addColorStop(0.6, "rgba(2, 24, 10, 0.06)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.24)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  ctx.font = `600 ${state.fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.shadowBlur = state.fontSize * 0.55;
  ctx.globalCompositeOperation = "lighter";

  const rows = Math.max(1, Math.ceil(height / state.fontSize) + 3);
  const step = Math.max(0.35, Math.min(2.2, delta / 16));
  state.columns.forEach((column, index) => {
    column.head += column.speed * step;
    const wobble = Math.sin(elapsed / 1800 + index * 0.71) * 1.2;
    const x = index * state.columnWidth + state.columnWidth / 2 + wobble;
    const headRow = Math.floor(column.head);
    const tailStep = column.length > 22 ? 2 : 1;
    const tailStart = Math.max(0, (headRow - column.length) * state.fontSize);
    const tailEnd = Math.min(height, headRow * state.fontSize);

    if (tailEnd > tailStart) {
      const trail = ctx.createLinearGradient(x, tailStart, x, tailEnd);
      trail.addColorStop(0, "rgba(0, 255, 112, 0)");
      trail.addColorStop(0.72, "rgba(22, 255, 130, 0.08)");
      trail.addColorStop(1, "rgba(210, 255, 220, 0.28)");
      ctx.fillStyle = trail;
      ctx.fillRect(x - 0.8, tailStart, 1.6, tailEnd - tailStart);
    }

    for (let segment = 0; segment < column.length; segment += tailStep) {
      const row = headRow - segment;
      if (row < -1 || row > rows) continue;

      const fade = Math.max(0, 1 - segment / column.length);
      const y = row * state.fontSize;
      const symbol = matrixSymbolAt(
        state.symbols,
        index,
        row,
        elapsed,
        column.glyphOffset,
      );

      if (segment === 0) {
        ctx.shadowColor = "rgba(220, 255, 226, 0.96)";
        ctx.fillStyle = "rgba(242, 255, 244, 1)";
      } else if (segment < 4) {
        const alpha = Math.min(0.98, fade * column.brightness);
        ctx.shadowColor = `rgba(134, 255, 168, ${alpha * 0.82})`;
        ctx.fillStyle = `rgba(154, 255, 184, ${alpha})`;
      } else {
        const alpha = Math.min(0.78, fade * column.brightness * 0.9);
        ctx.shadowColor = `rgba(34, 255, 112, ${alpha * 0.65})`;
        ctx.fillStyle = `rgba(34, 255, 112, ${alpha})`;
      }

      ctx.fillText(symbol, x, y);
    }

    if (column.head - column.length > rows + column.resetHold) {
      state.columns[index] = createColumn(height, state.fontSize);
      state.columns[index].head = -Math.random() * rows * 0.7;
    }
  });

  ctx.globalCompositeOperation = "source-over";
  ctx.shadowBlur = 0;
  const scanlineY = (elapsed / 26) % Math.max(1, height);
  ctx.fillStyle = "rgba(216, 255, 226, 0.08)";
  ctx.fillRect(0, scanlineY, width, 1);
  ctx.fillStyle = "rgba(16, 185, 129, 0.045)";
  for (let y = 0; y < height; y += 4) {
    ctx.fillRect(0, y, width, 1);
  }
};

const MatrixRain: React.FC = () => {
  const canvasRef = useAnimatedCanvas(createMatrixState, drawMatrixFrame, {
    accentRefreshMs: 700,
    maxDevicePixelRatio: 1.15,
    maxFps: 30,
  });
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="block h-full w-full opacity-100 mix-blend-screen"
    />
  );
};

export default MatrixRain;
