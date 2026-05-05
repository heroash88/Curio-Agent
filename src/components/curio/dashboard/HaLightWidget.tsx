import React, { useCallback, useEffect, useRef, useState } from "react";
import { useCardTheme } from "../../../hooks/useCardTheme";
import { useDashboardRefresh } from "../../../hooks/useDashboardRefresh";
import { useOptimisticAction } from "../../../hooks/useOptimisticAction";
import { useWidgetSize } from "../../../hooks/useWidgetSize";
import {
  useHaMcpUrl,
  useHaMcpEnabled,
} from "../../../utils/settingsStorage";
import type {
  DashboardWidget,
  DashboardWidgetConfig,
} from "../../../services/dashboardTypes";
import { getHaDeviceDisplaySettings } from "../../../services/haDeviceDisplay";
import WidgetShell from "./WidgetShell";
import { WidgetText } from "./widgetPrimitives";
import { HaDeviceIcon } from "./haDeviceIcons";
import { callHaService, loadHaStatesCached } from "./haWidgetApi";

interface HaLightWidgetProps {
  widget: DashboardWidget;
  config?: DashboardWidgetConfig;
}

const COLOR_PRESETS: {
  label: string;
  color: string;
  rgb: [number, number, number];
}[] = [
  { label: "Cool", color: "#B3E5FC", rgb: [179, 229, 252] },
  { label: "White", color: "#FFFFFF", rgb: [255, 255, 255] },
  { label: "Warm", color: "#FFECB3", rgb: [255, 236, 179] },
  { label: "Cozy", color: "#FFE0B2", rgb: [255, 224, 178] },
  { label: "Sunset", color: "#FFCCBC", rgb: [255, 204, 188] },
  { label: "Rose", color: "#F8BBD0", rgb: [248, 187, 208] },
  { label: "Mint", color: "#B2DFDB", rgb: [178, 223, 219] },
  { label: "Violet", color: "#D1C4E9", rgb: [209, 196, 233] },
];

/* ── Glassy Track Slider ─────────────────────────────────────── */

const GlassSlider: React.FC<{
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  /** Gradient CSS applied to the fill portion */
  fillGradient: string;
  /** Optional thumb glow colour */
  thumbGlow?: string;
  disabled?: boolean;
  compact?: boolean;
}> = ({
  value,
  min,
  max,
  onChange,
  fillGradient,
  thumbGlow = "rgba(251,191,36,0.5)",
  disabled = false,
  compact = false,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = Math.max(0, Math.min(100, ((value - min) / Math.max(1, max - min)) * 100));

  const resolve = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onChange(min + ratio * (max - min));
  };

  return (
    <div
      ref={trackRef}
      className={`relative w-full select-none overflow-visible rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] shadow-inner transition-all ${
        compact ? "h-8" : "h-10 md:h-12"
      } ${disabled ? "pointer-events-none opacity-40" : "cursor-pointer touch-none"}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        trackRef.current?.setPointerCapture(e.pointerId);
        resolve(e);
      }}
      onPointerMove={(e) => {
        if (trackRef.current?.hasPointerCapture(e.pointerId)) resolve(e);
      }}
      onPointerUp={(e) => {
        trackRef.current?.releasePointerCapture(e.pointerId);
      }}
    >
      {/* Fill */}
      <div
        className="absolute inset-y-0 left-0 rounded-2xl transition-[width] duration-75"
        style={{
          width: `${pct}%`,
          background: fillGradient,
        }}
      />

      {/* Thumb */}
      <div
        className="pointer-events-none absolute top-1/2 -translate-y-1/2 transition-[left] duration-75"
        style={{ left: `calc(${pct}% - 10px)` }}
      >
        <div
          className="h-5 w-5 rounded-full border-2 border-white/90 bg-white shadow-lg"
          style={{
            boxShadow: `0 0 12px ${thumbGlow}, 0 2px 6px rgba(0,0,0,0.25)`,
          }}
        />
      </div>
    </div>
  );
};

/* ── Main Component ──────────────────────────────────────────── */

const HaLightWidget: React.FC<HaLightWidgetProps> = ({ widget, config }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const haEnabled = useHaMcpEnabled();
  const haUrl = useHaMcpUrl();
  const cfg = config ?? widget.config;
  const entityId = cfg?.entityIds?.[0]?.toLowerCase();

  const showBrightnessSetting = cfg.lightShowBrightness !== false;
  const showColorSetting = cfg.lightShowColor !== false;
  const showTempSetting = cfg.lightShowTemp !== false;
  const showControls = cfg?.haShowControls !== false;

  const [isOn, setIsOn] = useState(false);
  const [brightness, setBrightness] = useState(0);
  const [colorTemp, setColorTemp] = useState(0);
  const [rgbColor, setRgbColor] = useState<[number, number, number] | null>(null);
  const [minTemp, setMinTemp] = useState(2000);
  const [maxTemp, setMaxTemp] = useState(6500);
  const [name, setName] = useState("Light");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [inFlight, setInFlight] = useState(false);

  const refreshTimerRef = useRef<number | null>(null);
  const lightParamTimerRef = useRef<number | null>(null);
  const pendingLightParamsRef = useRef<Record<string, unknown>>({});

  /* ── Data fetching ── */

  const fetchState = useCallback(async (force = false) => {
    if (!entityId || !haEnabled || !haUrl || document.visibilityState === "hidden") return;
    try {
      const states = await loadHaStatesCached(haUrl, { force });
      const d = states.find((state) => state.entity_id.toLowerCase() === entityId);
      if (!d) {
        setError(true);
        return;
      }
      setIsOn(d.state === "on");
      setBrightness(d.attributes?.brightness ?? (d.state === "on" ? 255 : 0));
      setColorTemp(d.attributes?.color_temp_kelvin || 0);
      const nextRgb = Array.isArray(d.attributes?.rgb_color)
        ? d.attributes.rgb_color.slice(0, 3).map(Number)
        : null;
      setRgbColor(
        nextRgb && nextRgb.length === 3 && nextRgb.every((value: number) => Number.isFinite(value))
          ? [nextRgb[0], nextRgb[1], nextRgb[2]]
          : null,
      );
      setMinTemp(d.attributes?.min_color_temp_kelvin || 2000);
      setMaxTemp(d.attributes?.max_color_temp_kelvin || 6500);
      setName(d.attributes?.friendly_name || entityId.split(".")[1] || "Light");
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [entityId, haEnabled, haUrl]);

  const scheduleRefresh = useCallback((delayMs = 800) => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void fetchState(true);
    }, delayMs);
  }, [fetchState]);

  useEffect(() => {
    setLoading(true);
    if (!entityId) {
      setLoading(false);
    }
  }, [entityId]);

  useDashboardRefresh({
    widget,
    enabled: Boolean(entityId && haEnabled && haUrl),
    onRefresh: (_background, reason) => fetchState(reason === "manual"),
  });

  useEffect(() => () => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (lightParamTimerRef.current) {
      window.clearTimeout(lightParamTimerRef.current);
      lightParamTimerRef.current = null;
    }
  }, []);

  /* ── Actions ── */

  const optimisticToggle = useOptimisticAction<boolean>(
    isOn,
    setIsOn,
    {
      apply: (prev) => !prev,
      commit: async () => {
        if (!entityId || !haEnabled || !haUrl) throw new Error("Home Assistant unavailable");
        const next = !isOn;
        await callHaService(haUrl, "light", next ? "turn_on" : "turn_off", {
          entity_id: entityId,
        });
        scheduleRefresh();
      },
      retryLabel: "Toggle failed. Tap to retry.",
      errorToastId: `ha-light-toggle-${widget.id}`,
    },
  );

  const doToggle = useCallback(async () => {
    if (!entityId || !haEnabled || !haUrl || inFlight) return;
    setInFlight(true);
    await optimisticToggle.run();
    setInFlight(false);
  }, [entityId, haEnabled, haUrl, inFlight, optimisticToggle]);

  const sendLightParam = useCallback(
    async (params: Record<string, unknown>) => {
      if (!entityId || !haEnabled || !haUrl) return;
      try {
        await callHaService(haUrl, "light", "turn_on", {
          entity_id: entityId,
          ...params,
        });
        scheduleRefresh();
      } catch (e) {
        console.warn("[HaLightWidget] sendLightParam error", e);
      }
    },
    [entityId, haEnabled, haUrl, scheduleRefresh],
  );

  const queueLightParam = useCallback(
    (params: Record<string, unknown>) => {
      pendingLightParamsRef.current = {
        ...pendingLightParamsRef.current,
        ...params,
      };
      if (lightParamTimerRef.current) {
        window.clearTimeout(lightParamTimerRef.current);
      }
      lightParamTimerRef.current = window.setTimeout(() => {
        lightParamTimerRef.current = null;
        const nextParams = pendingLightParamsRef.current;
        pendingLightParamsRef.current = {};
        void sendLightParam(nextParams);
      }, 220);
    },
    [sendLightParam],
  );

  const handleBrightnessDrag = useCallback(
    (pct: number) => {
      const bVal = Math.round(pct * 2.55);
      setBrightness(bVal);
      queueLightParam({ brightness: bVal });
    },
    [queueLightParam],
  );

  const handleTempDrag = useCallback(
    (kelvin: number) => {
      setColorTemp(kelvin);
      queueLightParam({ color_temp_kelvin: kelvin });
    },
    [queueLightParam],
  );

  const handleColorPreset = useCallback(
    (rgb: [number, number, number]) => {
      setRgbColor(rgb);
      sendLightParam({ rgb_color: rgb });
    },
    [sendLightParam],
  );

  /* ── Derived ── */

  const brightnessPercent = Math.round((brightness / 255) * 100);
  const display = getHaDeviceDisplaySettings(cfg, {
    fallbackName: name,
    fallbackIcon: "lightbulb",
  }, {
    widgetType: widget.type,
    entityId,
  });
  const deviceIcon = <HaDeviceIcon icon={display.icon} />;
  const displayName = loading && !cfg?.displayName?.trim() ? "Light" : display.displayName;

  const compact = size.sizeClass === "small" || size.pixelHeight < 280;
  const showColorPalette = showColorSetting && size.pixelHeight >= 238 && size.pixelWidth >= 250;
  const showTemperatureControl = showTempSetting && size.pixelHeight >= 330 && size.pixelWidth >= 280;
  const visibleColorPresets = COLOR_PRESETS.slice(0, compact || size.pixelHeight < 315 ? 6 : COLOR_PRESETS.length);
  const currentColorStyle = rgbColor
    ? `rgb(${rgbColor[0]}, ${rgbColor[1]}, ${rgbColor[2]})`
    : COLOR_PRESETS.find((preset) => preset.rgb.join(",") === [255, 255, 255].join(","))?.color || "#fff";

  /* ── Empty / unconfigured states ── */

  if (!entityId || !haEnabled || !haUrl) {
    return (
      <WidgetShell
        widget={widget}
        title="Light"
        icon={<HaDeviceIcon icon="lightbulb" />}
        accent="amber"
      >
        <div className="flex flex-1 items-center justify-center">
          <p className={`text-center text-sm ${theme.muted}`}>
            {!entityId ? "Tap settings to pick a light." : "Connect HA to control."}
          </p>
        </div>
      </WidgetShell>
    );
  }

  /* ── Tiny: just a toggle orb ── */

  if (size.sizeClass === "tiny") {
    return (
      <WidgetShell bare widget={widget}>
        <div className="flex flex-1 flex-col items-center justify-center gap-1">
          <button
            onClick={doToggle}
            disabled={inFlight || loading}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 active:scale-90 disabled:opacity-40 ${
              isOn
                ? "bg-amber-400 text-amber-900 shadow-lg shadow-amber-400/40"
                : theme.surfaceContainerLow + " " + theme.muted
            }`}
            aria-label={isOn ? "Turn off" : "Turn on"}
          >
            <HaDeviceIcon icon={display.icon} size={20} />
          </button>
          <WidgetText variant="label" tone="muted" align="center">
            {isOn ? "On" : "Off"}
          </WidgetText>
        </div>
      </WidgetShell>
    );
  }

  /* ── Primary render ── */

  // The warm amber glow applied to the entire widget when the light is on
  const glowOpacity = isOn ? Math.max(0.06, brightnessPercent / 100 * 0.25) : 0;

  return (
    <WidgetShell
      widget={widget}
      bare
      padded={false}
      accent="amber"
    >
      <div className="relative flex h-full w-full min-h-0 flex-col overflow-hidden">
        {/* Ambient glow layer — radiates from the bulb icon area */}
        <div
          className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-700"
          style={{
            opacity: glowOpacity,
            background: `radial-gradient(ellipse 120% 80% at 50% 0%, rgba(251,191,36,0.6) 0%, rgba(245,158,11,0.2) 40%, transparent 70%)`,
          }}
        />

        {/* ── Header ── */}
        <div className="relative z-10 flex items-center gap-3 px-4 pr-16 pt-4 sm:px-5 sm:pr-[4.5rem] sm:pt-5">
          {/* Bulb icon — glows when on */}
          <div className="relative shrink-0">
            <button
              onClick={doToggle}
              disabled={inFlight || loading}
              className={`relative flex h-10 w-10 items-center justify-center rounded-2xl border transition-all duration-500 active:scale-90 disabled:opacity-40 ${
                isOn
                  ? "border-amber-400/30 bg-amber-400/20 text-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.35)]"
                  : "border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] text-[var(--ether-on-surface-variant)]"
              }`}
              aria-label={isOn ? "Turn off" : "Turn on"}
            >
              {deviceIcon}
            </button>
            {/* Tiny state dot */}
            <div
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 transition-colors duration-300 ${
                isOn
                  ? "border-amber-400/60 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]"
                  : "border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-high)]"
              }`}
            />
          </div>

          <div className="min-w-0 flex-1">
            <span className={`block truncate text-[10px] font-bold uppercase tracking-[0.16em] ${
              error ? "text-red-400" : theme.onSurface
            }`}>
              {error ? "Unavailable" : displayName}
            </span>
            <WidgetText variant="label" tone="muted">
              {isOn ? `${brightnessPercent}% brightness` : "Off"}
            </WidgetText>
          </div>

          {isOn && showColorSetting && (
            <div
              className="h-6 w-6 shrink-0 rounded-full border border-white/40 shadow-[0_0_14px_rgba(251,191,36,0.28)]"
              style={{ backgroundColor: currentColorStyle }}
              aria-label="Current light color"
            />
          )}

          {/* Toggle switch */}
          <button
            onClick={doToggle}
            disabled={inFlight || loading}
            data-pending={optimisticToggle.isPending ? 'true' : undefined}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-all duration-300 active:scale-95 disabled:opacity-40 ${
              isOn
                ? "bg-gradient-to-r from-amber-400 to-amber-500 shadow-[0_0_16px_rgba(251,191,36,0.4)]"
                : "bg-[var(--ether-surface-container)] border border-[var(--ether-glass-border)]"
            }`}
            aria-label={isOn ? "Turn off" : "Turn on"}
          >
            <div
              className={`absolute top-1 h-5 w-5 rounded-full shadow-md transition-all duration-300 ${
                isOn
                  ? "left-6 bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                  : "left-1 bg-[var(--ether-on-surface-variant)]"
              }`}
            />
          </button>
        </div>

        {/* ── Controls Area ── */}
        {isOn && showControls && (
          <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">

            {/* ── Brightness ── */}
            {showBrightnessSetting && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <WidgetText variant="label" tone="muted">
                    Brightness
                  </WidgetText>
                  <span className={`text-[11px] font-bold tabular-nums ${theme.onSurface}`}>
                    {brightnessPercent}%
                  </span>
                </div>
                <GlassSlider
                  value={brightnessPercent}
                  min={0}
                  max={100}
                  onChange={handleBrightnessDrag}
                  fillGradient="linear-gradient(90deg, rgba(245,158,11,0.5) 0%, rgba(251,191,36,0.85) 50%, rgba(253,224,71,0.95) 100%)"
                  thumbGlow="rgba(251,191,36,0.6)"
                  compact={compact}
                />
              </div>
            )}

            {/* ── Color Temperature ── */}
            {showTemperatureControl && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <WidgetText variant="label" tone="muted">
                    Temperature
                  </WidgetText>
                  <span className={`text-[11px] font-bold tabular-nums ${theme.onSurface}`}>
                    {colorTemp ? `${colorTemp}K` : "Auto"}
                  </span>
                </div>
                <GlassSlider
                  value={colorTemp || minTemp}
                  min={minTemp}
                  max={maxTemp}
                  onChange={handleTempDrag}
                  fillGradient="linear-gradient(90deg, #FF8C00, #FFDAB9 35%, #FFFFFF 55%, #E0FFFF 75%, #87CEEB 100%)"
                  thumbGlow="rgba(255,255,255,0.5)"
                  compact={compact}
                />
              </div>
            )}

            {/* ── Color Presets ── */}
            {showColorPalette && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <WidgetText variant="label" tone="muted">
                    Color
                  </WidgetText>
                  {colorTemp > 0 && !showTemperatureControl && (
                    <span className={`text-[10px] font-bold tabular-nums ${theme.onSurface}`}>
                      {colorTemp}K
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {visibleColorPresets.map((p) => {
                    const selected = rgbColor?.join(",") === p.rgb.join(",");
                    return (
                    <button
                      key={p.label}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleColorPreset(p.rgb);
                      }}
                      title={p.label}
                      className={`group relative flex ${compact ? "h-7 w-7 rounded-lg" : "h-8 w-8 rounded-xl"} items-center justify-center border bg-[var(--ether-surface-container)] transition-all hover:scale-110 hover:shadow-lg active:scale-95 ${
                        selected
                          ? "border-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.22)]"
                          : "border-[var(--ether-glass-border)]"
                      }`}
                    >
                      <div
                        className={`${compact ? "h-4 w-4" : "h-5 w-5"} rounded-full shadow-inner ring-1 ring-white/20`}
                        style={{
                          backgroundColor: p.color,
                          boxShadow: `inset 0 1px 3px rgba(0,0,0,0.15), 0 0 10px ${p.color}30`,
                        }}
                      />
                      {/* Tooltip */}
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 scale-0 whitespace-nowrap rounded-md bg-black/80 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-white opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100">
                        {p.label}
                      </div>
                    </button>
                  );})}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Off state — empty body with a subtle prompt */}
        {!isOn && (
          <div className="relative z-10 flex flex-1 items-center justify-center px-4 pb-4">
            <button
              onClick={doToggle}
              disabled={inFlight || loading}
              className={`flex items-center gap-2 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-[var(--ether-surface-container-high)] active:scale-95 disabled:opacity-40 ${theme.muted}`}
            >
              <HaDeviceIcon icon={display.icon} size={14} />
              Turn On
            </button>
          </div>
        )}
      </div>
    </WidgetShell>
  );
};

export default HaLightWidget;
export { HaLightWidget };
