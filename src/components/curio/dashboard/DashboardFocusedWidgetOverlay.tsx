import React from "react";
import { X } from "lucide-react";
import type {
  DashboardRobotFaceStyle,
  DashboardWidget,
  DashboardWidgetConfig,
} from "../../../services/dashboardTypes";
import type { AqiData, WeatherData } from "../../../services/weatherService";
import type { SpeakerIdentityModality } from "../../../services/speakerIdentity";
import { DashboardWidgetFrameContext } from "../../../hooks/useWidgetSize";
import { getDashboardRuntimePropsForWidget } from "../../../services/dashboardRuntimeProps";
import { WIDGET_COMPONENTS } from "./dashboardRegistry";

interface DashboardFocusedWidgetOverlayProps {
  focusedWidget: DashboardWidget;
  boardWidth: number;
  weather: WeatherData | null;
  aqi: AqiData | null;
  faceSlot?:
    | React.ReactNode
    | ((faceStyle?: DashboardRobotFaceStyle) => React.ReactNode);
  activeProfileName: string | null;
  activeProfileId: string | null;
  recognizedBy: SpeakerIdentityModality | null;
  speakerUpdatedAt: number;
  onClose: () => void;
  onUpdateWidgetConfig: (
    widgetId: string,
    patch: Partial<DashboardWidgetConfig>,
  ) => void;
  onOpenWidgetSettings: (widgetId: string) => void;
}

const DashboardFocusedWidgetOverlay: React.FC<
  DashboardFocusedWidgetOverlayProps
> = ({
  focusedWidget,
  boardWidth,
  weather,
  aqi,
  faceSlot,
  activeProfileName,
  activeProfileId,
  recognizedBy,
  speakerUpdatedAt,
  onClose,
  onUpdateWidgetConfig,
  onOpenWidgetSettings,
}) => {
  const focusedWidgetIsSketch = focusedWidget.type === "sketch";
  const focusedWidgetIsWeather =
    focusedWidget.type === "weather" || focusedWidget.type === "forecast";
  const focusedWidgetIsCamera = focusedWidget.type === ("ha_camera" as any);

  return (
    <>
      <button
        className="dashboard-focused-widget-backdrop absolute inset-0 z-50 cursor-default bg-black/20 backdrop-blur-[6px]"
        onClick={onClose}
        aria-label="Close expanded widget"
      />
      <div className={`pointer-events-none absolute inset-0 z-[60] flex items-center justify-center ${focusedWidgetIsSketch || focusedWidgetIsCamera ? "p-1 sm:p-2" : "p-3 sm:p-6"}`}>
        <section className={`dashboard-focused-widget-shell pointer-events-auto relative w-full overflow-hidden border border-[var(--ether-glass-border)] shadow-[var(--ether-glass-shadow)] backdrop-blur-[var(--ether-glass-blur)] ${
          focusedWidgetIsCamera ? "bg-black" : "bg-[var(--ether-overlay-panel)]"
        } ${
          focusedWidgetIsSketch
            ? "h-[calc(100dvh-1rem-var(--pwa-safe-top)-var(--pwa-safe-bottom))] max-w-[calc(100vw-1rem-var(--pwa-safe-left)-var(--pwa-safe-right))] rounded-[1.6rem] p-2 sm:p-3"
            : focusedWidgetIsCamera
              ? "h-[calc(100dvh-1rem-var(--pwa-safe-top)-var(--pwa-safe-bottom))] max-w-[calc(100vw-1rem-var(--pwa-safe-left)-var(--pwa-safe-right))] rounded-[1.6rem] p-0"
              : focusedWidgetIsWeather
                ? "h-[min(22rem,calc(100dvh-2rem-var(--pwa-safe-top)-var(--pwa-safe-bottom)))] max-w-[42rem] rounded-[1.9rem] p-3 sm:p-4"
                : "h-[min(50rem,calc(100dvh-1.5rem-var(--pwa-safe-top)-var(--pwa-safe-bottom)))] max-w-7xl rounded-[2.35rem] p-3 sm:p-4"
        }`}>
          <button
            onClick={onClose}
            className={`absolute right-4 top-4 sm:right-6 sm:top-6 z-20 flex h-9 w-9 items-center justify-center rounded-full transition ${
              focusedWidgetIsCamera 
                ? "bg-black/40 text-white/80 backdrop-blur-xl border border-white/10 hover:bg-white/20 hover:text-white" 
                : "bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
            }`}
            aria-label="Close expanded widget"
          >
            <X size={16} />
          </button>
          <div className={`dashboard-focus-widget-main h-full min-w-0 overflow-hidden ${
            focusedWidgetIsCamera ? "rounded-[1.6rem]" : "rounded-[var(--ether-card-radius)]"
          } ${
            focusedWidgetIsWeather || focusedWidgetIsCamera ? "min-h-0" : "min-h-[22rem] lg:min-h-0"
          }`}>
            <React.Suspense fallback={null}>
              <DashboardWidgetFrameContext.Provider
                value={{
                  pixelWidth:
                    focusedWidgetIsWeather
                      ? Math.min(640, Math.max(320, boardWidth - 48))
                      : boardWidth > 900 ? 860 : Math.max(320, boardWidth - 48),
                  pixelHeight: focusedWidgetIsWeather
                    ? 300
                    : boardWidth > 720 ? 640 : 520,
                  gridWidth: Math.max(
                    6,
                    Number(focusedWidget.config.w ?? 4),
                  ),
                  gridHeight: Math.max(
                    5,
                    Number(focusedWidget.config.h ?? 4),
                  ),
                }}
              >
                {React.createElement(
                  WIDGET_COMPONENTS[focusedWidget.type],
                  {
                    widget: focusedWidget,
                    ...getDashboardRuntimePropsForWidget(focusedWidget.type, {
                      weather,
                      aqi,
                      activeProfileName,
                      activeProfileId,
                      recognizedBy,
                      updatedAt: speakerUpdatedAt,
                    }),
                    faceSlot:
                      focusedWidget.type === "robot_face"
                        ? typeof faceSlot === "function"
                          ? faceSlot(focusedWidget.config.robotFaceStyle)
                          : faceSlot
                        : undefined,
                    config: focusedWidget.config,
                    focused: true,
                    onUpdateWidgetConfig,
                    onOpenWidgetSettings,
                  },
                )}
              </DashboardWidgetFrameContext.Provider>
            </React.Suspense>
          </div>
        </section>
      </div>
    </>
  );
};

export default DashboardFocusedWidgetOverlay;
