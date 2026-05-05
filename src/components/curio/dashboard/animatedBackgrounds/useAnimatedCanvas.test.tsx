import React from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAnimatedCanvas, type CanvasFrame } from "./useAnimatedCanvas";

type TestState = { created: boolean };

const canvasContext = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  fillText: vi.fn(),
  setTransform: vi.fn(),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  quadraticCurveTo: vi.fn(),
  measureText: vi.fn(() => ({ width: 10 })),
} as unknown as CanvasRenderingContext2D;

const TestCanvas: React.FC<{
  drawFrame: (frame: CanvasFrame<TestState>) => void;
}> = ({ drawFrame }) => {
  const canvasRef = useAnimatedCanvas(
    () => ({ created: true }),
    drawFrame,
    { maxFps: 30 },
  );

  return (
    <div>
      <canvas ref={canvasRef} />
    </div>
  );
};

describe("useAnimatedCanvas", () => {
  let requestCallbacks: FrameRequestCallback[];
  let hiddenDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    requestCallbacks = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      requestCallbacks.push(callback);
      return requestCallbacks.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    hiddenDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "hidden");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (hiddenDescriptor) {
      Object.defineProperty(Document.prototype, "hidden", hiddenDescriptor);
    }
  });

  it("does not draw animation frames while the document is hidden", () => {
    Object.defineProperty(Document.prototype, "hidden", {
      configurable: true,
      get: () => true,
    });
    const drawFrame = vi.fn();

    render(<TestCanvas drawFrame={drawFrame} />);
    expect(requestCallbacks).toHaveLength(1);

    requestCallbacks.shift()?.(16);

    expect(drawFrame).not.toHaveBeenCalled();
    expect(requestCallbacks).toHaveLength(1);
  });
});
