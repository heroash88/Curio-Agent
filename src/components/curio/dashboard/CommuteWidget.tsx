import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Minus, Plus, MapPin, CornerUpRight } from "lucide-react";
import { useCardTheme } from "../../../hooks/useCardTheme";
import { useDashboardRefresh } from "../../../hooks/useDashboardRefresh";
import {
  useDashboardDropTarget,
  useDropIntentTarget,
} from "../../../hooks/useDashboardIntents";
import { useWidgetSize } from "../../../hooks/useWidgetSize";
import { dashboardToastBus } from "../../../services/dashboardToastBus";
import type {
  DashboardWidget,
  DashboardWidgetConfig,
} from "../../../services/dashboardTypes";
import type { RouteResult } from "../../../services/routesApi";
import type { WeatherData, AqiData } from "../../../services/weatherService";
import {
  useHomeLocation,
  useWorkLocation,
} from "../../../utils/settingsStorage";
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from "../../../utils/settings/dashboardSettings";
import { DirectionsPreview } from "../../cards/MapPreview";
import WidgetShell from "./WidgetShell";
import { WidgetText } from "./widgetPrimitives";

interface CommuteWidgetProps {
  widget: DashboardWidget;
  weather: WeatherData | null;
  aqi: AqiData | null;
  onUpdateWidgetConfig?: (
    widgetId: string,
    patch: Partial<DashboardWidgetConfig>,
  ) => void;
}

const CommuteWidget: React.FC<CommuteWidgetProps> = ({
  widget,
  weather,
  onUpdateWidgetConfig,
}) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const homeLocation = useHomeLocation();
  const workLocation = useWorkLocation();
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [mapZoomOffset, setMapZoomOffset] = useState(0);

  const boardInteractivity = useDashboardInteractivitySettings();
  const dropIntentsEnabled = effectiveToggle(
    'dropIntentsEnabled',
    boardInteractivity,
    widget.config,
  );
  const handleCommuteDrop = useCallback(
    (payload: { payload: Record<string, unknown> }) => {
      const rawLabel = payload.payload.label;
      const rawLat = payload.payload.lat;
      const rawLng = payload.payload.lng;
      const label =
        typeof rawLabel === 'string' && rawLabel.trim()
          ? rawLabel.trim()
          : Number.isFinite(Number(rawLat)) && Number.isFinite(Number(rawLng))
            ? `${Number(rawLat).toFixed(4)},${Number(rawLng).toFixed(4)}`
            : '';
      if (!label) return;
      onUpdateWidgetConfig?.(widget.id, {
        commuteTarget: 'custom',
        customDestination: label,
      });
      dashboardToastBus.show({
        id: `commute-destination-${widget.id}`,
        label: 'Commute destination updated',
      });
    },
    [onUpdateWidgetConfig, widget.id],
  );
  useDropIntentTarget(widget.id, handleCommuteDrop, {
    enabled: dropIntentsEnabled,
  });
  const dropBindings = useDashboardDropTarget({
    widgetId: widget.id,
    widgetType: widget.type,
    enabled: dropIntentsEnabled,
  });

  const targetName =
    widget.config.commuteTarget === "home"
      ? "Home"
      : widget.config.commuteTarget === "custom"
        ? "Custom"
        : "Work";

  const target = useMemo(() => {
    if (widget.config.commuteTarget === "home") return homeLocation;
    if (widget.config.commuteTarget === "custom") {
      return String(widget.config.customDestination || "").trim();
    }
    return workLocation;
  }, [
    homeLocation,
    widget.config.commuteTarget,
    widget.config.customDestination,
    workLocation,
  ]);

  const travelMode = String(widget.config.travelMode || "driving");
  const showMapPreview = widget.config.showMapPreview === true;

  useEffect(() => {
    setMapZoomOffset(0);
  }, [route?.encodedPolyline, showMapPreview, target, travelMode]);

  const loadRoute = useCallback(async (background = false) => {
    if (!target) {
      setRoute(null);
      return;
    }
    if (document.visibilityState === "hidden") return;
    if (!background) setLoading(true);
    try {
      const [{ computeRoute }, { getCurrentPosition }] = await Promise.all([
        import("../../../services/routesApi"),
        import("../../../services/weatherService"),
      ]);
      const currentPosition =
        weather?.latitude && weather?.longitude
          ? { latitude: weather.latitude, longitude: weather.longitude }
          : await getCurrentPosition().then((pos) =>
            pos
              ? {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              }
              : undefined,
          );
      const result = await computeRoute(
        "Current Location",
        target,
        travelMode,
        currentPosition,
      );
      setRoute(result.route || null);
    } catch (err) {
      console.warn("[CommuteWidget] Failed to load commute:", err);
    } finally {
      setLoading(false);
    }
  }, [target, travelMode, weather?.latitude, weather?.longitude]);

  useDashboardRefresh({
    widget,
    enabled: Boolean(target),
    onRefresh: (background) => loadRoute(background),
  });

  const durationStr = route?.durationInTraffic || route?.duration || "--";
  let durationValue = durationStr;
  let durationUnit = "";
  
  if (durationStr !== "--") {
    const parts = durationStr.split(" ");
    if (parts.length >= 2) {
      durationUnit = parts.pop() || "";
      durationValue = parts.join(" ");
    }
  }

  const isWide = size.pixelWidth > 400; 
  const compact = size.pixelHeight < 290 || size.pixelWidth < 330;

  const trafficColorClass = (() => {
    if (!route?.trafficCondition) return "text-teal-400";
    const condition = route.trafficCondition.toLowerCase();
    if (condition.includes("heavy")) return "text-red-400";
    if (condition.includes("moderate")) return "text-amber-400";
    return "text-emerald-400";
  })();

  const modeVerb = travelMode === "driving" ? "Drive" : travelMode === "transit" ? "Transit" : travelMode === "walking" ? "Walk" : travelMode === "bicycling" ? "Bike" : "Go";
  const titleText = `${modeVerb} to ${targetName}`;

  const leaveBy = useMemo(() => {
    const d = new Date(Date.now() + 5 * 60000); // 5 mins from now
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }, [route]);

  if (size.sizeClass === "tiny") {
    return (
      <WidgetShell bare widget={widget}>
        <div className="flex flex-1 flex-col items-center justify-center p-4">
          <span className={`text-4xl font-bold tabular-nums text-[var(--ether-on-surface)]`}>
            {durationValue}
          </span>
          <WidgetText variant="label" tone="muted" align="start">
            {durationUnit} • {targetName}
          </WidgetText>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell widget={widget} bare padded={false} accent="teal">
      <div
        className={`flex h-full w-full ${isWide ? 'flex-row' : 'flex-col'} justify-between p-4 sm:p-5 gap-4`}
        onDragOver={dropBindings.onDragOver}
        onDrop={dropBindings.onDrop}
      >
        {/* Left Side: Info */}
        <div className={`flex flex-col ${isWide ? 'w-1/2 max-w-[240px]' : 'w-full flex-1'}`}>
          {/* Header */}
          {!compact && (
            <div className="flex items-center gap-3 mb-4 shrink-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-900/40 dark:bg-blue-900/40 text-blue-600 dark:text-blue-500 shadow-sm ring-1 ring-blue-500/20">
                <MapPin size={20} />
              </div>
              <div className="flex items-baseline gap-2">
                <div className="text-sm font-bold text-[var(--ether-on-surface)]">Map</div>
                <div className="text-[11px] font-medium text-[var(--ether-on-surface-variant)]">Commute</div>
              </div>
            </div>
          )}

          {!target ? (
             <p className={`flex flex-1 items-center text-sm ${theme.muted}`}>Pick a destination in Settings.</p>
          ) : loading && !route ? (
             <p className={`flex flex-1 items-center text-sm ${theme.muted}`}>Calculating route...</p>
          ) : !route ? (
             <p className="flex flex-1 items-center text-sm text-red-500/80">No route available right now.</p>
          ) : (
            <div className="flex flex-col min-h-0 flex-1 justify-start pt-1 overflow-y-auto dashboard-widget-touch-scroll pr-2">
              <div className={`font-bold text-[var(--ether-on-surface)] ${compact ? 'text-lg' : 'text-xl'}`}>
                {titleText}
              </div>
              {route.route && (
                <div className="text-sm text-[var(--ether-on-surface-variant)] mt-1 truncate">
                  via {route.route}
                </div>
              )}
              
              <div className="flex items-baseline gap-1.5 mt-4">
                <span className={`font-bold tracking-tighter tabular-nums text-[var(--ether-on-surface)] ${compact ? 'text-3xl' : 'text-4xl'}`}>
                  {durationValue}
                </span>
                <span className="text-sm font-medium text-[var(--ether-on-surface-variant)]">
                  {durationUnit}
                </span>
              </div>
              <div className={`text-sm font-medium mt-1 ${trafficColorClass}`}>
                {route.trafficCondition || "Unknown"} traffic
              </div>
              
              {leaveBy && !compact && (
                <div className="text-[13px] text-[var(--ether-on-surface-variant)] mt-5">
                  Leave by {leaveBy}
                </div>
              )}
              
              {!compact && (
                <button type="button" onClick={() => window.open(route.mapUrl, "_blank")} className="mt-4 flex items-center justify-center gap-2 rounded-full border border-[var(--ether-glass-border)] bg-transparent px-5 py-2 text-teal-600 dark:text-teal-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors w-fit">
                  <span className="text-[15px] font-semibold tracking-wide">Start</span>
                  <CornerUpRight size={16} strokeWidth={2.5} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Map */}
        {showMapPreview && route && (
          <div className={`relative ${isWide ? 'w-1/2 flex-1' : 'w-full flex-1 min-h-[100px] mt-2'} shrink-0 rounded-[1.5rem] overflow-hidden ring-1 ring-[var(--ether-glass-border)] shadow-md`}>
            <DirectionsPreview
              className="absolute inset-0 w-full h-full object-cover"
              destination={route.destination}
              encodedPolyline={route.encodedPolyline}
              staticMapUrl={route.staticMapUrl}
              travelMode={route.travelMode}
              zoomOffset={mapZoomOffset}
            />
            
            <div className="absolute right-3 bottom-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMapZoomOffset((value) => Math.max(value - 1, -3))}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/40 text-white backdrop-blur hover:bg-black/60 transition disabled:opacity-35"
                disabled={mapZoomOffset <= -3}
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                onClick={() => setMapZoomOffset((value) => Math.min(value + 1, 4))}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/40 text-white backdrop-blur hover:bg-black/60 transition disabled:opacity-35"
                disabled={mapZoomOffset >= 4}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </WidgetShell>
  );
};

export default CommuteWidget;
