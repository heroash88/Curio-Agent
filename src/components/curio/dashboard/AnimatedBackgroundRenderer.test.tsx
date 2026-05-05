import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AnimatedBackgroundRenderer from "./AnimatedBackgroundRenderer";

describe("AnimatedBackgroundRenderer", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      setTransform: vi.fn(),
      createLinearGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      createRadialGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      quadraticCurveTo: vi.fn(),
      measureText: vi.fn(() => ({ width: 10 })),
    } as unknown as CanvasRenderingContext2D);
  });

  it("renders the requested animated preset when motion is allowed", async () => {
    render(
      <AnimatedBackgroundRenderer
        appearance={{
          backgroundStyle: "animated",
          animationPreset: "matrix",
        }}
        reduceMotion={false}
      />,
    );

    expect(await screen.findByTestId("dashboard-animated-background"))
      .toHaveAttribute("data-dashboard-animation-preset", "matrix");
    await waitFor(() => {
      expect(document.querySelector("canvas")).toBeInTheDocument();
    });
  });

  it("does not mount a canvas when reduce motion is enabled", () => {
    render(
      <AnimatedBackgroundRenderer
        appearance={{
          backgroundStyle: "animated",
          animationPreset: "particles",
        }}
        reduceMotion
      />,
    );

    expect(screen.queryByTestId("dashboard-animated-background")).toBeNull();
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("renders expanded animated presets", async () => {
    render(
      <AnimatedBackgroundRenderer
        appearance={{
          backgroundStyle: "animated",
          animationPreset: "aurora",
        }}
        reduceMotion={false}
      />,
    );

    expect(await screen.findByTestId("dashboard-animated-background"))
      .toHaveAttribute("data-dashboard-animation-preset", "aurora");
    await waitFor(() => {
      expect(document.querySelector("canvas")).toBeInTheDocument();
    });
  });

  it("renders an AI generated animated background spec", async () => {
    render(
      <AnimatedBackgroundRenderer
        appearance={{
          backgroundStyle: "animated",
          animationPreset: "generated",
          generatedAnimation: {
            kind: "ribbons",
            colors: ["#22f7a5", "#7dd3fc"],
            density: 50,
            speed: 36,
            complexity: 64,
            shape: "lines",
            direction: "right",
            glow: true,
          },
        }}
        reduceMotion={false}
      />,
    );

    expect(await screen.findByTestId("dashboard-animated-background"))
      .toHaveAttribute("data-dashboard-animation-preset", "generated");
    await waitFor(() => {
      expect(document.querySelector("canvas")).toBeInTheDocument();
    });
  });

  it("exposes the generated effect family for weather-style AI backgrounds", async () => {
    render(
      <AnimatedBackgroundRenderer
        appearance={{
          backgroundStyle: "animated",
          animationPreset: "generated",
          generatedAnimation: {
            kind: "fire",
            colors: ["#fb923c", "#ef4444"],
            density: 72,
            speed: 64,
            complexity: 88,
            direction: "up",
            glow: true,
          },
        }}
        reduceMotion={false}
      />,
    );

    expect(await screen.findByTestId("dashboard-animated-background"))
      .toHaveAttribute("data-dashboard-generated-kind", "fire");
    await waitFor(() => {
      expect(document.querySelector("canvas")).toBeInTheDocument();
    });
  });

  it("renders layered generated animation specs", async () => {
    render(
      <AnimatedBackgroundRenderer
        appearance={{
          backgroundStyle: "animated",
          animationPreset: "generated",
          generatedAnimation: {
            kind: "wormhole",
            colors: ["#22f7a5", "#7dd3fc"],
            density: 76,
            speed: 62,
            complexity: 92,
            layers: [
              {
                kind: "nebula",
                colors: ["#22f7a5", "#a78bfa"],
                opacity: 78,
                blendMode: "screen",
                depth: 12,
                scale: 92,
                trail: 38,
                pulse: 64,
                turbulence: 72,
                blur: 24,
                glow: true,
              },
              {
                kind: "energyRibbons",
                colors: ["#7dd3fc"],
                opacity: 70,
                blendMode: "lighter",
                direction: "right",
                shape: "lines",
                glow: true,
              },
            ],
          },
        }}
        reduceMotion={false}
      />,
    );

    expect(await screen.findByTestId("dashboard-animated-background"))
      .toHaveAttribute("data-dashboard-animation-preset", "generated");
    expect(screen.getByTestId("dashboard-animated-background"))
      .toHaveAttribute("data-dashboard-generated-layer-count", "2");
    await waitFor(() => {
      expect(document.querySelector("canvas")).toBeInTheDocument();
    });
  });
});
