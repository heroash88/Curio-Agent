import { useEffect, useRef } from "react";

export interface CanvasFrame<TState> {
  ctx: CanvasRenderingContext2D;
  state: TState;
  width: number;
  height: number;
  delta: number;
  elapsed: number;
  accentColor: string;
}

type CreateCanvasState<TState> = (width: number, height: number) => TState;
type DrawCanvasFrame<TState> = (frame: CanvasFrame<TState>) => void;

interface AnimatedCanvasOptions {
  accentRefreshMs?: number;
  maxDevicePixelRatio?: number;
  maxFps?: number;
  pauseWhenDocumentHidden?: boolean;
}

const getCanvasSize = (canvas: HTMLCanvasElement) => {
  const rect =
    canvas.parentElement?.getBoundingClientRect() ||
    canvas.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width || canvas.clientWidth || 1)),
    height: Math.max(1, Math.round(rect.height || canvas.clientHeight || 1)),
  };
};

const readAccentColor = (canvas: HTMLCanvasElement) => {
  const value = getComputedStyle(canvas).getPropertyValue("--dashboard-accent").trim();
  return value || "#7dd3fc";
};

export const useAnimatedCanvas = <TState,>(
  createState: CreateCanvasState<TState>,
  drawFrame: DrawCanvasFrame<TState>,
  options: AnimatedCanvasOptions = {},
) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const maxDevicePixelRatio = Math.max(0.75, options.maxDevicePixelRatio ?? 2);
  const minFrameMs =
    options.maxFps && options.maxFps > 0 ? 1000 / options.maxFps : 0;
  const accentRefreshMs = Math.max(100, options.accentRefreshMs ?? 400);
  const pauseWhenDocumentHidden = options.pauseWhenDocumentHidden !== false;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 1;
    let height = 1;
    let state = createState(width, height);
    let frameId: number | null = null;
    let lastFrameAt = 0;
    let accentColor = readAccentColor(canvas);
    let lastAccentReadAt = 0;
    const startedAt = performance.now();

    const resize = () => {
      const nextSize = getCanvasSize(canvas);
      width = nextSize.width;
      height = nextSize.height;
      const dpr = Math.min(window.devicePixelRatio || 1, maxDevicePixelRatio);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state = createState(width, height);
    };

    const requestFrame =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : ((callback: FrameRequestCallback) =>
            window.setTimeout(() => callback(performance.now()), 16));
    const cancelFrame =
      typeof window.cancelAnimationFrame === "function"
        ? window.cancelAnimationFrame.bind(window)
        : window.clearTimeout.bind(window);

    const draw = (timestamp: number) => {
      if (pauseWhenDocumentHidden && document.hidden) {
        lastFrameAt = 0;
        frameId = requestFrame(draw);
        return;
      }
      if (minFrameMs > 0 && lastFrameAt > 0 && timestamp - lastFrameAt < minFrameMs) {
        frameId = requestFrame(draw);
        return;
      }
      const delta = lastFrameAt ? timestamp - lastFrameAt : 16;
      lastFrameAt = timestamp;
      if (timestamp - lastAccentReadAt >= accentRefreshMs) {
        accentColor = readAccentColor(canvas);
        lastAccentReadAt = timestamp;
      }
      drawFrame({
        ctx,
        state,
        width,
        height,
        delta,
        elapsed: timestamp - startedAt,
        accentColor,
      });
      frameId = requestFrame(draw);
    };

    resize();
    frameId = requestFrame(draw);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && canvas.parentElement) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas.parentElement);
    } else {
      window.addEventListener("resize", resize);
    }

    return () => {
      if (frameId !== null) {
        cancelFrame(frameId);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", resize);
      }
    };
  }, [
    accentRefreshMs,
    createState,
    drawFrame,
    maxDevicePixelRatio,
    minFrameMs,
    pauseWhenDocumentHidden,
  ]);

  return canvasRef;
};
