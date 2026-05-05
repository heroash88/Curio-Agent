import { describe, expect, it, vi } from "vitest";

import { createMatrixState, drawMatrixFrame } from "./MatrixRain";

const createMockContext = () =>
  ({
    fillRect: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
  }) as unknown as CanvasRenderingContext2D;

describe("MatrixRain", () => {
  it("creates dense Matrix code stream columns", () => {
    const state = createMatrixState(960, 540);

    expect(state.columns.length).toBeGreaterThan(50);
    expect(state.symbols).toContain("#");
    expect(state.symbols).toContain("Z");
    expect(state.columns.every((column) => column.length >= 11)).toBe(true);
  });

  it("draws cascading heads and tails instead of one glyph per column", () => {
    const ctx = createMockContext();
    const state = createMatrixState(480, 320);
    state.columns.forEach((column) => {
      column.head = 18;
      column.length = 14;
      column.speed = 0.5;
    });

    drawMatrixFrame({
      ctx,
      state,
      width: 480,
      height: 320,
      delta: 16,
      elapsed: 500,
      accentColor: "#22f7a5",
    });

    expect(ctx.fillText).toHaveBeenCalledTimes(state.columns.length * 14);
  });
});
