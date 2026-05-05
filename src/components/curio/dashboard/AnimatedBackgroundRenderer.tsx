import React from "react";

import type {
  DashboardAnimationPreset,
  DashboardPageAppearance,
} from "../../../services/dashboardTypes";

type BuiltInDashboardAnimationPreset = Exclude<DashboardAnimationPreset, "generated">;

const MatrixRain = React.lazy(() => import("./animatedBackgrounds/MatrixRain"));
const ParticleMesh = React.lazy(() => import("./animatedBackgrounds/ParticleMesh"));
const WaveField = React.lazy(() => import("./animatedBackgrounds/WaveField"));
const Starfield = React.lazy(() => import("./animatedBackgrounds/Starfield"));
const AuroraField = React.lazy(() => import("./animatedBackgrounds/AuroraField"));
const PlasmaCloud = React.lazy(() => import("./animatedBackgrounds/PlasmaCloud"));
const NeonGrid = React.lazy(() => import("./animatedBackgrounds/NeonGrid"));
const GeneratedCanvasBackground = React.lazy(
  () => import("./animatedBackgrounds/GeneratedCanvasBackground"),
);

const PRESET_COMPONENTS: Record<
  BuiltInDashboardAnimationPreset,
  React.LazyExoticComponent<React.FC>
> = {
  matrix: MatrixRain,
  particles: ParticleMesh,
  waves: WaveField,
  starfield: Starfield,
  aurora: AuroraField,
  plasma: PlasmaCloud,
  grid: NeonGrid,
};

interface AnimatedBackgroundRendererProps {
  appearance: DashboardPageAppearance;
  reduceMotion: boolean;
}

const AnimatedBackgroundRenderer: React.FC<AnimatedBackgroundRendererProps> = ({
  appearance,
  reduceMotion,
}) => {
  if (reduceMotion || appearance.backgroundStyle !== "animated") {
    return null;
  }

  const preset = appearance.animationPreset || "particles";
  let backgroundContent: React.ReactNode;
  if (preset === "generated") {
    backgroundContent = (
      <GeneratedCanvasBackground spec={appearance.generatedAnimation} />
    );
  } else {
    const BackgroundComponent = PRESET_COMPONENTS[preset] || ParticleMesh;
    backgroundContent = <BackgroundComponent />;
  }

  return (
    <div
      aria-hidden="true"
      data-testid="dashboard-animated-background"
      data-dashboard-animation-preset={preset}
      data-dashboard-generated-layer-count={
        preset === "generated"
          ? appearance.generatedAnimation?.layers?.length || 0
          : undefined
      }
      data-dashboard-generated-kind={
        preset === "generated"
          ? appearance.generatedAnimation?.kind
          : undefined
      }
      className="pointer-events-none absolute inset-0 z-[1] overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_38%)]" />
      <React.Suspense fallback={null}>
        {backgroundContent}
      </React.Suspense>
    </div>
  );
};

export default React.memo(AnimatedBackgroundRenderer);
