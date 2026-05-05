import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Battery,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Flame,
  Home,
  ListChecks,
  Minus,
  Music,
  Pause,
  Play,
  Plus,
  Power,
  Printer,
  Radio,
  RefreshCcw,
  SkipBack,
  SkipForward,
  Snowflake,
  Square,
  Thermometer,
  Zap,
} from "lucide-react";
import { useDashboardRefresh } from "../../../hooks/useDashboardRefresh";
import { useDoubleClickEdit } from "../../../hooks/useDoubleClickEdit";
import { useOptimisticAction } from "../../../hooks/useOptimisticAction";
import { useWidgetAriaAnnouncer } from "../../../hooks/useWidgetAriaAnnouncer";
import { useWidgetSize } from "../../../hooks/useWidgetSize";
import {
  appendWidgetSparklineSample,
} from "../../../services/dashboardSparklineStore";
import type { DashboardWidget } from "../../../services/dashboardTypes";
import { getHaDeviceDisplaySettings } from "../../../services/haDeviceDisplay";
import { useHaMcpEnabled, useHaMcpUrl } from "../../../utils/settingsStorage";
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from "../../../utils/settings/dashboardSettings";
import WidgetShell, { type WidgetAccent } from "./WidgetShell";
import { HaDeviceIcon } from "./haDeviceIcons";
import { WidgetBody, WidgetEmptyState, WidgetFooter, WidgetSkeleton, WidgetInlineError, WidgetText } from "./widgetPrimitives";
import {
  callHaService,
  formatHaValue,
  getDomain,
  getFriendlyName,
  getNumericState,
  type HaCalendarEvent,
  type HaState,
  loadHaCameraSnapshotObjectUrl,
  loadHaCalendarEvents,
  loadHaStatesCached,
  resolveHaImageUrl,
  stateMatches,
} from "./haWidgetApi";

const normalizeEntityIds = (widget: DashboardWidget) =>
  (Array.isArray(widget.config.entityIds) ? widget.config.entityIds : [])
    .filter(Boolean)
    .map((id) => id.toLowerCase());

const useHaStates = (widget: DashboardWidget, forceRefreshKey = 0) => {
  const haEnabled = useHaMcpEnabled();
  const haUrl = useHaMcpUrl();
  const [states, setStates] = useState<HaState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const statesLengthRef = useRef(0);
  const refreshTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    statesLengthRef.current = states.length;
  }, [states.length]);

  const refresh = useCallback(
    async (force = false) => {
      if (!haEnabled || !haUrl || document.visibilityState === "hidden") return;
      if (!mountedRef.current) return;
      setLoading((current) => (force || statesLengthRef.current === 0 ? true : current));
      try {
        const nextStates = await loadHaStatesCached(haUrl, { force });
        if (mountedRef.current) {
          setStates(nextStates);
          setError(null);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : "Home Assistant unavailable");
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [haEnabled, haUrl],
  );

  useDashboardRefresh({
    widget,
    enabled: haEnabled && Boolean(haUrl),
    onRefresh: (_background, reason) =>
      refresh(reason === "manual" || forceRefreshKey > 0),
  });

  const scheduleRefresh = useCallback(
    (force = true, delayMs = 650) => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = window.setTimeout(() => {
        refreshTimeoutRef.current = null;
        void refresh(force);
      }, delayMs);
    },
    [refresh],
  );

  return { haEnabled, haUrl, states, loading, error, refresh, scheduleRefresh };
};

const pickEntity = (
  states: HaState[],
  widget: DashboardWidget,
  domains: string[],
  keywords: string[] = [],
) => {
  const selected = normalizeEntityIds(widget);
  if (selected.length > 0) {
    const exact = states.find((state) => selected.includes(state.entity_id.toLowerCase()));
    if (exact) return exact;
  }

  return states.find((state) => {
    const domain = getDomain(state.entity_id);
    return domains.includes(domain) && (keywords.length === 0 || stateMatches(state, keywords));
  });
};

const pickEntities = (
  states: HaState[],
  widget: DashboardWidget,
  domains: string[],
  keywords: string[] = [],
) => {
  const selected = normalizeEntityIds(widget);
  if (selected.length > 0) {
    return states.filter((state) => selected.includes(state.entity_id.toLowerCase()));
  }

  return states.filter((state) => {
    const domain = getDomain(state.entity_id);
    return domains.includes(domain) && (keywords.length === 0 || stateMatches(state, keywords));
  });
};

const EmptyHaState: React.FC<{
  widget: DashboardWidget;
  title: string;
  icon: React.ReactNode;
  message: string;
  accent?: WidgetAccent;
}> = ({ widget, title, icon, message, accent = "indigo" }) => (
  <WidgetShell widget={widget} title={title} icon={icon} accent={accent}>
    <WidgetBody align="center">
      <WidgetEmptyState icon={icon} title={message} />
    </WidgetBody>
  </WidgetShell>
);

const IconButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}> = ({ label, icon, onClick, active = false, disabled = false, className = "" }) => (
  <button
    type="button"
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
    disabled={disabled}
    aria-label={label}
    title={label}
    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition active:scale-95 disabled:opacity-40 cursor-pointer ${active
        ? "border-transparent bg-white/20 text-white shadow-lg backdrop-blur-md"
        : "border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] text-[var(--ether-on-surface)] hover:bg-[var(--ether-surface-container-high)]"
      } ${className}`}
  >
    {icon}
  </button>
);

const asText = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const getMediaArtworkUrl = (
  haUrl: string | null,
  attrs: Record<string, any>,
) => {
  if (!haUrl) return "";
  const candidate =
    asText(attrs.entity_picture) ||
    asText(attrs.media_image_url) ||
    asText(attrs.thumbnail) ||
    asText(attrs.image_url) ||
    asText(attrs.image);
  return candidate ? resolveHaImageUrl(haUrl, candidate) : "";
};

const useHaCameraSnapshot = (
  haUrl: string | null,
  camera?: HaState,
  enabled = true,
) => {
  const [snapshotUrl, setSnapshotUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    if (!haUrl || !camera || !enabled) {
      setSnapshotUrl("");
      return () => undefined;
    }

    setSnapshotUrl("");
    loadHaCameraSnapshotObjectUrl(haUrl, camera.entity_id)
      .then((url) => {
        if (cancelled) {
          if (url.startsWith("blob:")) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setSnapshotUrl(url);
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("[HomeAssistantWidget] camera snapshot failed", err);
          setSnapshotUrl("");
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl.startsWith("blob:")) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [camera?.entity_id, enabled, haUrl]);

  return snapshotUrl;
};

export const HaClimateWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const size = useWidgetSize(widget);
  const { haEnabled, haUrl, states, loading, error, scheduleRefresh } = useHaStates(widget);
  const climate = pickEntity(states, widget, ["climate"]);
  const [busy, setBusy] = useState(false);
  const [draftTarget, setDraftTarget] = useState<number | null>(null);
  const showControls = widget.config.haShowControls !== false;

  const attrs = climate?.attributes || {};
  const current = Number(attrs.current_temperature ?? attrs.temperature ?? draftTarget ?? 20);
  const target = Number(draftTarget ?? attrs.temperature ?? attrs.target_temp_high ?? current);
  const minTemp = Number(attrs.min_temp ?? 50);
  const maxTemp = Number(attrs.max_temp ?? 90);
  const modes = Array.isArray(attrs.hvac_modes)
    ? attrs.hvac_modes.slice(0, size.pixelWidth < 340 ? 3 : 5)
    : ["heat", "cool", "auto", "off"];
  const mode = String(climate?.state || "off");
  const active = !["off", "unknown", "unavailable"].includes(mode);
  const compact = size.pixelHeight < 290 || size.pixelWidth < 320;
  const tempPct = Math.max(0, Math.min(100, ((target - minTemp) / Math.max(1, maxTemp - minTemp)) * 100));

  const boardInteractivity = useDashboardInteractivitySettings();
  const doubleClickEditEnabled = effectiveToggle(
    "doubleClickEditEnabled",
    boardInteractivity,
    widget.config,
  );
  const [isEditingSetpoint, setIsEditingSetpoint] = useState(false);
  const [setpointDraft, setSetpointDraft] = useState<string>("");
  const setpointInputRef = useRef<HTMLInputElement | null>(null);
  const [announcementText, setAnnouncementText] = useState("");
  useWidgetAriaAnnouncer(widget.id, announcementText);
  useEffect(() => {
    if (isEditingSetpoint) {
      setpointInputRef.current?.focus();
      setpointInputRef.current?.select();
    }
  }, [isEditingSetpoint]);

  useEffect(() => {
    setDraftTarget(null);
  }, [climate?.entity_id, attrs.temperature]);

  const setTemperature = useCallback(
    async (next: number) => {
      if (!haUrl || !climate) return;
      const rounded = Math.round(next);
      setDraftTarget(rounded);
      setBusy(true);
      try {
        await callHaService(haUrl, "climate", "set_temperature", {
          entity_id: climate.entity_id,
          temperature: rounded,
        });
        scheduleRefresh(true, 650);
      } catch (err) {
        console.warn("[HaClimateWidget] set_temperature failed", err);
      } finally {
        setBusy(false);
      }
    },
    [climate, haUrl, scheduleRefresh],
  );

  const pendingSetpointRef = useRef<number>(target);
  const optimisticSetpoint = useOptimisticAction<number | null>(
    draftTarget,
    setDraftTarget,
    {
      apply: () => Math.round(pendingSetpointRef.current ?? target),
      commit: async () => {
        if (!haUrl || !climate) throw new Error("Home Assistant unavailable");
        const next = Math.round(pendingSetpointRef.current ?? target);
        await callHaService(haUrl, "climate", "set_temperature", {
          entity_id: climate.entity_id,
          temperature: next,
        });
        scheduleRefresh(true, 650);
      },
      retryLabel: "Set temperature failed. Tap to retry.",
      errorToastId: `ha-climate-setpoint-${widget.id}`,
    },
  );
  const commitSetpointEdit = () => {
    const parsed = Number(setpointDraft);
    if (!Number.isFinite(parsed)) {
      setIsEditingSetpoint(false);
      setAnnouncementText("Invalid temperature. Value unchanged.");
      return;
    }
    const clamped = Math.round(
      Math.max(minTemp, Math.min(maxTemp, parsed)),
    );
    pendingSetpointRef.current = clamped;
    setAnnouncementText(`Temperature set to ${clamped}`);
    setIsEditingSetpoint(false);
    void optimisticSetpoint.run();
  };

  const setpointDoubleClickHandlers = useDoubleClickEdit({
    enabled: doubleClickEditEnabled && Boolean(climate && haUrl),
    onActivate: () => {
      setSetpointDraft(String(Math.round(target)));
      setIsEditingSetpoint(true);
    },
  });

  const setMode = useCallback(
    async (nextMode: string) => {
      if (!haUrl || !climate) return;
      setBusy(true);
      try {
        await callHaService(haUrl, "climate", "set_hvac_mode", {
          entity_id: climate.entity_id,
          hvac_mode: nextMode,
        });
        scheduleRefresh(true, 650);
      } catch (err) {
        console.warn("[HaClimateWidget] set_hvac_mode failed", err);
      } finally {
        setBusy(false);
      }
    },
    [climate, haUrl, scheduleRefresh],
  );

  if (!haEnabled || !haUrl) {
    return <EmptyHaState widget={widget} title="Climate" icon={<Thermometer size={14} />} message="Connect Home Assistant to control climate." accent="rose" />;
  }
  if (loading && !climate) {
    return (
      <WidgetShell widget={widget} title="Climate" icon={<Thermometer size={14} />} accent="rose">
        <WidgetSkeleton variant="stat" />
      </WidgetShell>
    );
  }
  if (!climate && error) {
    return (
      <WidgetShell widget={widget} title="Climate" icon={<Thermometer size={14} />} accent="rose">
        <WidgetInlineError message={error} widgetId={widget.id} />
      </WidgetShell>
    );
  }
  if (!climate) {
    return <EmptyHaState widget={widget} title="Climate" icon={<Thermometer size={14} />} message="Pick a climate entity in widget settings." accent="rose" />;
  }

  const dialColor = mode === "cool"
    ? "#38bdf8"
    : mode === "heat"
      ? "#fb923c"
      : active
        ? "#34d399"
        : "rgba(148,163,184,0.72)";
  const dialSizeClass = compact
    ? "h-36 w-36"
    : size.pixelWidth >= 380 && size.pixelHeight >= 360
      ? "h-48 w-48"
      : "h-40 w-40";
  const roundedTarget = Math.round(target);
  const roundedCurrent = Math.round(current);
  const modeLabel = mode.replace(/_/g, " ");

  return (
    <WidgetShell widget={widget} title={getFriendlyName(climate)} icon={mode === "cool" ? <Snowflake size={14} /> : <Flame size={14} />} accent={mode === "cool" ? "sky" : "rose"}>
      <WidgetBody gap="lg" className="items-center pb-2">
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          <div
            data-testid="ha-climate-dial"
            className={`relative ${dialSizeClass} rounded-full border border-white/10 p-3 shadow-[0_22px_50px_rgba(0,0,0,0.22)]`}
            style={{
              background: `conic-gradient(${dialColor} ${Math.round(tempPct * 3.6)}deg, rgba(148,163,184,0.16) ${Math.round(tempPct * 3.6)}deg 360deg)`,
              boxShadow: active
                ? `0 0 38px ${dialColor}44, inset 0 0 22px rgba(255,255,255,0.08)`
                : "inset 0 0 22px rgba(255,255,255,0.06)",
            }}
          >
            <div className="absolute inset-[9px] rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] shadow-[inset_0_0_34px_rgba(0,0,0,0.28)] backdrop-blur-xl" />
            <div className="relative z-10 flex h-full flex-col items-center justify-center rounded-full text-center">
              <div className="mb-1 flex items-center gap-1.5 rounded-full bg-[var(--ether-control-bg)] px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-[var(--ether-on-surface-variant)]">
                {mode === "cool" ? <Snowflake size={11} /> : mode === "heat" ? <Flame size={11} /> : <Power size={11} />}
                {modeLabel}
              </div>
              <div
                className="text-5xl font-black leading-none tracking-normal tabular-nums"
                style={{ color: dialColor }}
              >
                {isEditingSetpoint ? (
                  <input
                    ref={setpointInputRef}
                    type="number"
                    min={minTemp}
                    max={maxTemp}
                    value={setpointDraft}
                    aria-label="Edit climate setpoint"
                    onChange={(event) => setSetpointDraft(event.target.value)}
                    onBlur={commitSetpointEdit}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitSetpointEdit();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        setIsEditingSetpoint(false);
                      }
                    }}
                    className="w-20 bg-transparent text-center text-5xl font-black tabular-nums outline-none"
                    style={{ color: dialColor }}
                  />
                ) : (
                  <span
                    data-testid="ha-climate-setpoint"
                    onDoubleClick={setpointDoubleClickHandlers.onDoubleClick}
                    onPointerUp={setpointDoubleClickHandlers.onPointerUp}
                    className={doubleClickEditEnabled ? "cursor-pointer" : undefined}
                    aria-label={
                      doubleClickEditEnabled
                        ? `${roundedTarget} degrees. Double-click to edit.`
                        : undefined
                    }
                  >
                    {roundedTarget}
                    <span className="text-2xl align-top">&deg;</span>
                  </span>
                )}
              </div>
              <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
                {roundedCurrent}&deg; now
              </div>
            </div>
          </div>

          {showControls && (
            <>
              <button
                type="button"
                onClick={() => void setTemperature(target - 1)}
                disabled={busy}
                aria-label="Lower temperature"
                className="absolute left-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] text-[var(--ether-on-surface)] shadow-lg backdrop-blur-xl transition hover:bg-[var(--ether-control-hover)] active:scale-95 disabled:opacity-40"
              >
                <Minus size={18} />
              </button>
              <button
                type="button"
                onClick={() => void setTemperature(target + 1)}
                disabled={busy}
                aria-label="Raise temperature"
                className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] text-[var(--ether-on-surface)] shadow-lg backdrop-blur-xl transition hover:bg-[var(--ether-control-hover)] active:scale-95 disabled:opacity-40"
              >
                <Plus size={18} />
              </button>
            </>
          )}
        </div>

        {!compact && showControls && (
          <WidgetFooter gap="none" className="w-full">
            <div className="grid w-full grid-cols-4 gap-2">
              {modes.slice(0, 4).map((item: string) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => void setMode(item)}
                  disabled={busy}
                  className={`rounded-2xl border px-2 py-2.5 flex flex-col items-center gap-1 transition ${mode === item
                      ? "border-transparent bg-[var(--ether-primary)] text-slate-950 shadow-lg"
                      : "border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-surface-container-high)]"
                    }`}
                >
                  {item === "cool" ? <Snowflake size={14} /> : item === "heat" ? <Flame size={14} /> : item === "off" ? <Power size={14} /> : <RefreshCcw size={14} />}
                  <span className="text-[9px] font-bold uppercase tracking-widest">{item}</span>
                </button>
              ))}
            </div>
          </WidgetFooter>
        )}
      </WidgetBody>
    </WidgetShell>
  );

};

export const HaCoverWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const { haEnabled, haUrl, states, loading, error, scheduleRefresh } = useHaStates(widget);
  const cover = pickEntity(states, widget, ["cover"]);
  const [busy, setBusy] = useState(false);
  const showControls = widget.config.haShowControls !== false;
  const position = Number(cover?.attributes?.current_position ?? (cover?.state === "open" ? 100 : 0));
  const active = ["open", "opening"].includes(String(cover?.state));

  const runService = useCallback(
    async (service: string, body: Record<string, unknown> = {}) => {
      if (!haUrl || !cover) return;
      setBusy(true);
      try {
        await callHaService(haUrl, "cover", service, {
          entity_id: cover.entity_id,
          ...body,
        });
        scheduleRefresh(true, 650);
      } catch (err) {
        console.warn("[HaCoverWidget] service failed", err);
      } finally {
        setBusy(false);
      }
    },
    [cover, haUrl, scheduleRefresh],
  );

  if (!haEnabled || !haUrl) {
    return <EmptyHaState widget={widget} title="Cover" icon={<ChevronUp size={14} />} message="Connect Home Assistant to control covers." accent="teal" />;
  }
  if (!cover) {
    return <EmptyHaState widget={widget} title="Cover" icon={<ChevronUp size={14} />} message={loading ? "Loading cover entities..." : error || "Pick a cover entity in widget settings."} accent="teal" />;
  }

  return (
    <WidgetShell widget={widget} title={getFriendlyName(cover)} icon={<ChevronUp size={14} />} accent="teal">
      <WidgetBody gap="lg" className="pb-2">
        <div className="flex-1 rounded-2xl bg-[var(--ether-surface-container)] overflow-hidden relative flex flex-col justify-end">
          <div className={`absolute bottom-0 w-full bg-teal-500/20 transition-all duration-500`} style={{ height: `${position}%` }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <span className="text-3xl font-bold tabular-nums text-[var(--ether-on-surface)] drop-shadow-md">{Math.round(position)}%</span>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 drop-shadow-md">{cover.state}</span>
          </div>
        </div>
        {showControls && (
          <WidgetFooter gap="none">
            <div className="grid grid-cols-3 gap-2 shrink-0">
              <button className="flex flex-col items-center justify-center py-2 bg-[var(--ether-surface-container)] rounded-xl hover:bg-[var(--ether-surface-container-high)] transition-colors" onClick={() => void runService("open_cover")} disabled={busy}><ChevronUp size={16} className={active ? 'text-teal-400' : ''} /></button>
              <button className="flex flex-col items-center justify-center py-2 bg-[var(--ether-surface-container)] rounded-xl hover:bg-[var(--ether-surface-container-high)] transition-colors" onClick={() => void runService("stop_cover")} disabled={busy}><Square size={14} /></button>
              <button className="flex flex-col items-center justify-center py-2 bg-[var(--ether-surface-container)] rounded-xl hover:bg-[var(--ether-surface-container-high)] transition-colors" onClick={() => void runService("close_cover")} disabled={busy}><ChevronDown size={16} /></button>
            </div>
          </WidgetFooter>
        )}
      </WidgetBody>
    </WidgetShell>
  );
};

export const HaMediaPlayerWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const size = useWidgetSize(widget);
  const { haEnabled, haUrl, states, loading, error, scheduleRefresh } = useHaStates(widget);
  const player = pickEntity(states, widget, ["media_player"]);
  const showControls = widget.config.haShowControls !== false;
  const attrs = player?.attributes || {};
  const playing = player?.state === "playing";
  
  const extremelyCompact = size.pixelHeight < 220;
  const compact = size.pixelHeight < 290 || size.pixelWidth < 330;
  
  const title = asText(attrs.media_title, asText(attrs.media_content_id, getFriendlyName(player)));
  const artist = asText(attrs.media_artist, asText(attrs.media_album_artist, asText(attrs.app_name, asText(attrs.source, player?.state || ""))));
  const album = asText(attrs.media_album_name, "");
  const artworkUrl = widget.config.haMediaShowArtwork === false ? "" : getMediaArtworkUrl(haUrl, attrs);
  
  const duration = Number(attrs.media_duration) || 0;
  const basePosition = Number(attrs.media_position) || 0;
  const updatedAt = attrs.media_position_updated_at ? new Date(attrs.media_position_updated_at).getTime() : 0;
  
  const [livePosition, setLivePosition] = useState(basePosition);

  useEffect(() => {
    if (!playing || duration <= 0 || !updatedAt) {
      setLivePosition(basePosition);
      return;
    }

    const update = () => {
      const now = Date.now();
      const diffSec = (now - updatedAt) / 1000;
      setLivePosition(Math.min(duration, Math.max(0, basePosition + diffSec)));
    };
    
    update();
    const intervalId = window.setInterval(update, 1000);
    return () => window.clearInterval(intervalId);
  }, [playing, basePosition, updatedAt, duration]);

  const progressPct = duration > 0 ? Math.max(0, Math.min(100, (livePosition / duration) * 100)) : 0;

  const service = useCallback(
    async (name: string, body: Record<string, unknown> = {}) => {
      if (!haUrl || !player) return;
      try {
        await callHaService(haUrl, "media_player", name, {
          entity_id: player.entity_id,
          ...body,
        });
        scheduleRefresh(true, 650);
      } catch (err) {
        console.warn("[HaMediaPlayerWidget] service failed", err);
      }
    },
    [haUrl, player, scheduleRefresh],
  );

  if (!haEnabled || !haUrl) {
    return <EmptyHaState widget={widget} title="Media Player" icon={<Music size={14} />} message="Connect Home Assistant to control media players." accent="teal" />;
  }
  if (!player) {
    return <EmptyHaState widget={widget} title="Media Player" icon={<Music size={14} />} message={loading ? "Loading media players..." : error || "Pick a media player entity in widget settings."} accent="teal" />;
  }

  const formatTime = (sec: number) => {
    if (!Number.isFinite(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const FAUX_WAVEFORM = [0.4, 0.6, 0.5, 0.8, 1.0, 0.7, 0.5, 0.9, 0.6, 0.4, 0.5, 0.7, 0.9, 0.8, 0.6, 0.5, 0.4, 0.3, 0.5, 0.7, 0.8, 1.0, 0.9, 0.7, 0.5, 0.4, 0.6, 0.8, 0.7, 0.5, 0.4, 0.6, 0.8, 0.9, 0.7, 0.5, 0.4, 0.3, 0.5, 0.4, 0.6, 0.8, 0.5, 0.7];

  return (
    <WidgetShell widget={widget} bare padded={false} accent="pink">
      <WidgetBody gap={compact ? "sm" : "lg"} className={`w-full ${compact ? 'p-4' : 'p-5 sm:p-6'}`}>
        {/* Header */}
        {!compact && (
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pink-500/10 text-pink-500 shadow-sm ring-1 ring-pink-500/20">
              <Music size={20} />
            </div>
            <div>
              <WidgetText as="div" variant="title" className="text-sm text-[var(--ether-on-surface)]">Music</WidgetText>
              <WidgetText as="div" variant="label" tone="muted" className="tracking-widest text-[var(--ether-on-surface-variant)]">Now Playing</WidgetText>
            </div>
          </div>
        )}

        {/* Track Info */}
        <div className={`flex items-center gap-4 ${compact ? 'mb-2' : 'mb-4 mt-2'}`}>
          {artworkUrl ? (
            <img src={artworkUrl} alt={`${title} artwork`} className={`${compact ? 'h-16 w-16' : 'h-20 w-20'} shrink-0 rounded-2xl object-cover shadow-md`} />
          ) : (
            <div className={`flex ${compact ? 'h-16 w-16' : 'h-20 w-20'} shrink-0 items-center justify-center rounded-2xl bg-[var(--ether-surface-container-high)] text-[var(--ether-on-surface-variant)] shadow-md`}>
              <Music size={compact ? 24 : 32} />
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <div className={`truncate font-bold text-[var(--ether-on-surface)] ${compact ? 'text-base' : 'text-lg'}`}>{title}</div>
            <div className={`truncate font-medium text-[var(--ether-on-surface-variant)] ${compact ? 'text-xs' : 'text-sm'}`}>{artist}</div>
            {!compact && (album || attrs.media_content_type) && (
              <div className="mt-1.5 truncate text-[10px] font-bold uppercase tracking-widest text-[var(--ether-on-surface-variant)] opacity-70">
                {album || attrs.media_content_type}
              </div>
            )}
          </div>
        </div>

        {/* Waveform */}
        {!extremelyCompact && (
          <div className="flex flex-col gap-1.5 mb-2">
            <div className="flex h-6 w-full items-center justify-between gap-0.5 px-1">
              {FAUX_WAVEFORM.map((h, i) => {
                const isPlayed = (i / FAUX_WAVEFORM.length) * 100 <= progressPct;
                return (
                  <div
                    key={i}
                    className={`w-1 rounded-full transition-colors ${isPlayed ? 'bg-pink-500 dark:bg-pink-400' : 'bg-[var(--ether-on-surface-variant)] opacity-20'}`}
                    style={{ height: `${h * 100}%` }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between px-1 text-[10px] font-bold tracking-widest text-[var(--ether-on-surface-variant)]">
              <span>{formatTime(livePosition)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        )}

        {/* Controls */}
        {showControls && (
          <WidgetFooter align="center" className="px-2">
            <div className="flex items-center justify-center gap-4">
              <button type="button" aria-label="Previous track" onClick={() => void service("media_previous_track")} className={`text-[var(--ether-on-surface)] transition-transform hover:scale-110 active:scale-95 ${compact ? 'scale-90' : ''}`}>
                <SkipBack size={24} fill="currentColor" />
              </button>

              <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => void service("media_play_pause")} className={`flex ${compact ? 'h-12 w-12' : 'h-14 w-14'} items-center justify-center rounded-full bg-teal-500 text-white shadow-lg shadow-teal-500/30 transition-transform hover:scale-105 active:scale-95`}>
                {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
              </button>

              <button type="button" aria-label="Next track" onClick={() => void service("media_next_track")} className={`text-[var(--ether-on-surface)] transition-transform hover:scale-110 active:scale-95 ${compact ? 'scale-90' : ''}`}>
                <SkipForward size={24} fill="currentColor" />
              </button>
            </div>
          </WidgetFooter>
        )}
      </WidgetBody>
    </WidgetShell>
  );
};

export const HaSelectWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const size = useWidgetSize(widget);
  const { haEnabled, haUrl, states, loading, error, scheduleRefresh } = useHaStates(widget);
  const select = pickEntity(states, widget, ["select", "input_select"]);
  const options = Array.isArray(select?.attributes?.options) ? select.attributes.options : [];
  const visibleOptions = options.slice(0, size.pixelHeight < 320 ? 3 : 6);

  const setOption = useCallback(
    async (option: string) => {
      if (!haUrl || !select) return;
      try {
        const domain = getDomain(select.entity_id);
        await callHaService(haUrl, domain, "select_option", {
          entity_id: select.entity_id,
          option,
        });
        scheduleRefresh(true, 650);
      } catch (err) {
        console.warn("[HaSelectWidget] select_option failed", err);
      }
    },
    [haUrl, scheduleRefresh, select],
  );

  if (!haEnabled || !haUrl) {
    return <EmptyHaState widget={widget} title="Select" icon={<ListChecks size={14} />} message="Connect Home Assistant to use select cards." accent="violet" />;
  }
  if (!select) {
    return <EmptyHaState widget={widget} title="Select" icon={<ListChecks size={14} />} message={loading ? "Loading select entities..." : error || "Pick a select entity in widget settings."} accent="violet" />;
  }

  return (
    <WidgetShell widget={widget} title={getFriendlyName(select)} icon={<ListChecks size={14} />} accent="violet">
      <WidgetBody gap="sm" className="pb-2">
        <WidgetBody scroll="y" gap="sm" className="grid">
          {visibleOptions.length === 0 ? (
            <WidgetEmptyState title="No options exposed" />
          ) : (
            visibleOptions.map((option: string) => {
              const selected = option === select.state;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => void setOption(option)}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 text-left transition-all duration-300 ${selected
                      ? "bg-violet-500/10 border border-violet-500/30 text-[var(--ether-on-surface)]"
                      : "bg-[var(--ether-surface-container)] border border-transparent text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-surface-container-high)]"
                    }`}
                >
                  <span className={`truncate text-sm font-bold ${selected ? 'text-violet-400' : ''}`}>{option}</span>
                  {selected && <Check size={16} className="text-violet-400" />}
                </button>
              );
            })
          )}
        </WidgetBody>
      </WidgetBody>
    </WidgetShell>
  );
};

const haIsActiveState = (state: string) =>
  ['on', 'home', 'open', 'playing', 'heat', 'cool', 'auto', 'dry', 'fan_only', 'unlocked', 'cleaning'].includes(state.toLowerCase());

export const HaButtonStackWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const size = useWidgetSize(widget);
  const { haEnabled, haUrl, states, loading, error, scheduleRefresh } = useHaStates(widget);
  const showEntityIds = widget.config.haShowEntityIds === true;
  const entityIds = normalizeEntityIds(widget);
  const allItems = useMemo(() => {
    const selected = entityIds.length > 0
      ? states.filter((state) => entityIds.includes(state.entity_id.toLowerCase()))
      : states.filter((state) => ["scene", "script", "button", "switch", "input_boolean", "light"].includes(getDomain(state.entity_id)));
    return selected.slice(0, Number(widget.config.maxItems || (size.pixelHeight < 320 ? 4 : 8)));
  }, [entityIds, size.pixelHeight, states, widget.config.maxItems]);
  const activeCount = allItems.filter((item) => haIsActiveState(item.state)).length;
  const displayEntityId = entityIds[0] || allItems[0]?.entity_id;
  const display = getHaDeviceDisplaySettings(
    widget.config,
    {
      fallbackName: "Action Stack",
      fallbackIcon: getDomain(displayEntityId) === "light" ? "lightbulb" : "switch",
    },
    {
      widgetType: widget.type,
      entityId: displayEntityId,
    },
  );

  const trigger = useCallback(
    async (state: HaState) => {
      if (!haUrl) return;
      const domain = getDomain(state.entity_id);
      const service =
        domain === "button"
          ? "press"
          : domain === "scene" || domain === "script"
            ? "turn_on"
            : state.state === "on"
              ? "turn_off"
              : "turn_on";
      try {
        await callHaService(haUrl, domain, service, { entity_id: state.entity_id });
        scheduleRefresh(true, 650);
      } catch (err) {
        console.warn("[HaButtonStackWidget] service failed", err);
      }
    },
    [haUrl, scheduleRefresh],
  );

  if (!haEnabled || !haUrl) {
    return <EmptyHaState widget={widget} title="Buttons" icon={<Radio size={14} />} message="Connect Home Assistant to use button stacks." accent="indigo" />;
  }
  if (allItems.length === 0) {
    return <EmptyHaState widget={widget} title="Buttons" icon={<Radio size={14} />} message={loading ? "Loading actions..." : error || "Pick scenes, scripts, buttons, switches, or lights."} accent="indigo" />;
  }

  const gridClass = size.pixelWidth > 420 ? "grid-cols-2" : "grid-cols-1";

  return (
    <WidgetShell widget={widget} title={display.displayName} icon={<HaDeviceIcon icon={display.icon} />} accent="indigo" rightSlot={<span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{activeCount} Active</span>}>
      <WidgetBody gap="none" className="pb-2">
        <WidgetBody scroll="y" gap="sm" className={`grid ${gridClass}`}>
          {allItems.map((item) => {
            const active = haIsActiveState(item.state);
            return (
              <button
                key={item.entity_id}
                type="button"
                onClick={() => void trigger(item)}
                className={`min-w-0 rounded-2xl border p-3 text-left transition-all duration-300 active:scale-95 ${active
                    ? "border-indigo-500/30 bg-indigo-500/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                    : "border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] hover:bg-[var(--ether-surface-container-high)]"
                  }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 shrink-0 rounded-full shadow-inner ${active ? "bg-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]" : "bg-[var(--ether-on-surface-variant)] opacity-40"}`} />
                  <span className={`truncate text-sm font-bold ${active ? 'text-white' : 'text-[var(--ether-on-surface)]'}`}>{getFriendlyName(item)}</span>
                </div>
                <div className="mt-2 flex min-w-0 items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest ${active ? 'bg-indigo-500/20 text-indigo-300' : 'bg-[var(--ether-surface-container-high)] text-[var(--ether-on-surface-variant)]'}`}>{item.state}</span>
                  {showEntityIds && <span className="truncate text-[9px] font-bold tracking-widest text-[var(--ether-on-surface-variant)] opacity-50">{item.entity_id}</span>}
                </div>
              </button>
            );
          })}
        </WidgetBody>
      </WidgetBody>
    </WidgetShell>
  );
};

export const HaCalendarWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const size = useWidgetSize(widget);
  const { haEnabled, haUrl, states, loading, error } = useHaStates(widget);
  const calendar = pickEntity(states, widget, ["calendar"]);
  const [events, setEvents] = useState<HaCalendarEvent[]>([]);
  const [eventError, setEventError] = useState<string | null>(null);
  const maxEvents = size.pixelHeight < 330 ? 2 : size.pixelHeight < 520 ? 4 : 6;

  const loadCalendarEvents = useCallback(async () => {
    if (!haEnabled || !haUrl || !calendar) {
      setEvents([]);
      return;
    }
    try {
      const next = await loadHaCalendarEvents(haUrl, calendar.entity_id);
      setEvents(next);
      setEventError(null);
    } catch (err) {
      setEventError(err instanceof Error ? err.message : "Calendar unavailable");
    }
  }, [calendar, haEnabled, haUrl]);

  useDashboardRefresh({
    widget,
    enabled: Boolean(haEnabled && haUrl && calendar),
    onRefresh: () => loadCalendarEvents(),
  });

  const shownEvents = events.slice(0, maxEvents);

  if (!haEnabled || !haUrl) {
    return <EmptyHaState widget={widget} title="HA Calendar" icon={<CalendarDays size={14} />} message="Connect Home Assistant to use calendar cards." accent="sky" />;
  }
  if (!calendar) {
    return <EmptyHaState widget={widget} title="HA Calendar" icon={<CalendarDays size={14} />} message={loading ? "Loading calendars..." : error || "Pick a calendar entity in widget settings."} accent="sky" />;
  }

  return (
    <WidgetShell widget={widget} title={getFriendlyName(calendar)} icon={<CalendarDays size={14} />} accent="sky" rightSlot={<span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{shownEvents.length} Events</span>}>
      <WidgetBody gap="none" className="pb-2">
        <WidgetBody scroll="y" gap="sm" className="grid">
          {eventError ? (
            <WidgetEmptyState title={eventError} variant="error" />
          ) : shownEvents.length === 0 ? (
            <WidgetEmptyState title="No upcoming Home Assistant events" />
          ) : (
            shownEvents.map((event, index) => {
              const startText = event.start?.dateTime || event.start?.date || "";
              const date = startText ? new Date(startText) : null;
              return (
                <div key={`${event.summary}-${index}`} className="min-w-0 flex items-center gap-3 rounded-2xl bg-[var(--ether-surface-container)] px-4 py-3">
                  <div className="w-1 h-8 rounded-full bg-sky-400/50" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-bold text-[var(--ether-on-surface)]">{event.summary || "Calendar event"}</div>
                    <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--ether-on-surface-variant)]">
                      {date && !Number.isNaN(date.getTime())
                        ? date.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })
                        : "Scheduled"}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </WidgetBody>
      </WidgetBody>
    </WidgetShell>
  );
};

export const HaVacuumWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const { haEnabled, haUrl, states, loading, error, scheduleRefresh } = useHaStates(widget);
  const vacuum = pickEntity(states, widget, ["vacuum"]);
  const attrs = vacuum?.attributes || {};
  const battery = Number(attrs.battery_level ?? attrs.battery ?? 0);

  const service = useCallback(
    async (name: string) => {
      if (!haUrl || !vacuum) return;
      try {
        await callHaService(haUrl, "vacuum", name, { entity_id: vacuum.entity_id });
        scheduleRefresh(true, 650);
      } catch (err) {
        console.warn("[HaVacuumWidget] service failed", err);
      }
    },
    [haUrl, scheduleRefresh, vacuum],
  );

  if (!haEnabled || !haUrl) {
    return <EmptyHaState widget={widget} title="Vacuum" icon={<Home size={14} />} message="Connect Home Assistant to control vacuums." accent="emerald" />;
  }
  if (!vacuum) {
    return <EmptyHaState widget={widget} title="Vacuum" icon={<Home size={14} />} message={loading ? "Loading vacuums..." : error || "Pick a vacuum entity in widget settings."} accent="emerald" />;
  }

  return (
    <WidgetShell widget={widget} title={getFriendlyName(vacuum)} icon={<Home size={14} />} accent="emerald">
      <WidgetBody gap="lg" className="pb-2">
        <div className="min-h-0 flex-1 rounded-2xl bg-[var(--ether-surface-container)] p-5 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500 pointer-events-none">
            <RefreshCcw size={100} className={vacuum.state === 'cleaning' ? 'animate-spin-slow' : ''} />
          </div>
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-1.5 rounded-lg bg-[var(--ether-surface-container-high)] px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase text-[var(--ether-on-surface)]">
              <Battery size={13} className="text-emerald-400" />
              {battery || "--"}%
            </div>
          </div>
          <div className="relative z-10 mt-6">
            <div className="text-3xl font-bold tracking-tight capitalize text-[var(--ether-on-surface)]">{vacuum.state}</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[var(--ether-on-surface-variant)]">{attrs.fan_speed || attrs.fan_speed_list?.[0] || "Auto"} Fan</div>
          </div>
        </div>
        <WidgetFooter align="center">
          <div className="flex justify-center gap-2 shrink-0">
            <IconButton className="w-14 bg-[var(--ether-surface-container)] border-transparent text-[var(--ether-on-surface)]" label={vacuum.state === "cleaning" ? "Pause" : "Start"} icon={vacuum.state === "cleaning" ? <Pause size={18} /> : <Play size={18} />} onClick={() => void service(vacuum.state === "cleaning" ? "pause" : "start")} active={vacuum.state === "cleaning"} />
            <IconButton className="w-14 bg-[var(--ether-surface-container)] border-transparent text-[var(--ether-on-surface)]" label="Return home" icon={<Home size={18} />} onClick={() => void service("return_to_base")} />
            <IconButton className="w-14 bg-[var(--ether-surface-container)] border-transparent text-[var(--ether-on-surface)]" label="Locate" icon={<RefreshCcw size={18} />} onClick={() => void service("locate")} />
          </div>
        </WidgetFooter>
      </WidgetBody>
    </WidgetShell>
  );
};

const PRINTER_KEYWORDS = ["printer", "print", "bambu", "creality", "moonraker", "klipper", "nozzle", "extruder", "bed", "filament"];

const findByKeywords = (states: HaState[], keywords: string[]) =>
  states.find((state) => stateMatches(state, keywords));

export const HaPrinterWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const size = useWidgetSize(widget);
  const { haEnabled, haUrl, states, loading, error } = useHaStates(widget);
  const selected = pickEntities(states, widget, ["sensor", "binary_sensor", "button", "switch", "camera", "image"], PRINTER_KEYWORDS);
  const sensorEntities = selected.filter((state) => ["sensor", "binary_sensor"].includes(getDomain(state.entity_id)));
  const actionEntities = selected.filter((state) => ["button", "switch"].includes(getDomain(state.entity_id)));
  const status = findByKeywords(sensorEntities, ["state", "status", "print_status", "current_print_state"]) || sensorEntities.find((state) => !Number.isFinite(Number.parseFloat(state.state)));
  const progress = findByKeywords(sensorEntities, ["progress", "percentage", "percent"]);
  const nozzle = findByKeywords(sensorEntities, ["nozzle", "extruder"]);
  const bed = findByKeywords(sensorEntities, ["bed"]);
  const chamber = findByKeywords(sensorEntities, ["chamber", "enclosure"]);
  const time = findByKeywords(sensorEntities, ["time_left", "time remaining", "eta"]);
  const file = findByKeywords(sensorEntities, ["filename", "file", "job"]);
  const progressValue = Math.max(0, Math.min(100, getNumericState(progress, 0)));
  const compact = size.pixelHeight < 330;
  const camera = selected.find((state) => ["camera", "image"].includes(getDomain(state.entity_id)));
  const showCamera = widget.config.haPrinterShowCamera !== false;
  const showControls = widget.config.haShowControls !== false;
  const cameraSnapshotUrl = useHaCameraSnapshot(haUrl, camera, showCamera && !compact);

  const runPrinterAction = useCallback(
    async (state: HaState) => {
      if (!haUrl) return;
      const domain = getDomain(state.entity_id);
      const service = domain === "button"
        ? "press"
        : state.state === "on"
          ? "turn_off"
          : "turn_on";
      try {
        await callHaService(haUrl, domain, service, { entity_id: state.entity_id });
      } catch (err) {
        console.warn("[HaPrinterWidget] action failed", err);
      }
    },
    [haUrl],
  );

  if (!haEnabled || !haUrl) {
    return <EmptyHaState widget={widget} title="3D Printer" icon={<Printer size={14} />} message="Connect Home Assistant to watch printers." accent="amber" />;
  }
  if (selected.length === 0) {
    return <EmptyHaState widget={widget} title="3D Printer" icon={<Printer size={14} />} message={loading ? "Loading printer entities..." : error || "Pick printer sensors, camera, or printer-related entities."} accent="amber" />;
  }

  const chips = [nozzle, bed, chamber, time].filter(Boolean).slice(0, compact ? 2 : 4) as HaState[];

  return (
    <WidgetShell widget={widget} title="3D Printer" icon={<Printer size={14} />} accent="amber">
      <WidgetBody gap="lg" className="pb-2">
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-[var(--ether-surface-container)] flex flex-col">
          {camera && showCamera && !compact ? (
            <div className="relative flex-1 overflow-hidden bg-black/50">
              {cameraSnapshotUrl ? (
                <img
                  src={cameraSnapshotUrl}
                  alt={getFriendlyName(camera)}
                  className="absolute inset-0 h-full w-full object-cover opacity-80"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[var(--ether-on-surface-variant)]">
                  <RefreshCcw size={20} className="animate-spin" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3 text-white">
                <div className="min-w-0">
                  <div className="truncate text-lg font-bold">{file?.state || getFriendlyName(status || selected[0])}</div>
                  <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-300 drop-shadow-sm">{status?.state || "Printer"}</div>
                </div>
                <div className="shrink-0 text-2xl font-bold tabular-nums drop-shadow-md">
                  {Math.round(progressValue)}%
                </div>
              </div>
              <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
                <div className="h-full bg-amber-400 transition-all duration-500 shadow-[0_0_8px_rgba(251,191,36,0.8)]" style={{ width: `${progressValue}%` }} />
              </div>
            </div>
          ) : (
            <div className="p-4 flex flex-col justify-between flex-1">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-xl font-bold text-[var(--ether-on-surface)]">{file?.state || getFriendlyName(status || selected[0])}</div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-amber-500">{status?.state || "Printer"}</div>
                </div>
                <div className="text-3xl font-bold tabular-nums text-[var(--ether-on-surface)]">{Math.round(progressValue)}%</div>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--ether-surface-container-high)]">
                <div className="h-full rounded-full bg-amber-500 transition-all duration-500" style={{ width: `${progressValue}%` }} />
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 shrink-0">
          {chips.map((chip) => (
            <div key={chip.entity_id} className="min-w-0 rounded-xl bg-[var(--ether-surface-container)] px-3 py-2 flex justify-between items-center">
              <div className="truncate text-[9px] font-bold uppercase tracking-widest text-[var(--ether-on-surface-variant)]">{getFriendlyName(chip)}</div>
              <div className="truncate text-xs font-bold text-[var(--ether-on-surface)]">{formatHaValue(chip)}</div>
            </div>
          ))}
        </div>
        {showControls && actionEntities.length > 0 && (
          <WidgetFooter gap="none">
            <div className={`grid gap-2 shrink-0 ${actionEntities.length > 1 && size.pixelWidth > 380 ? "grid-cols-2" : "grid-cols-1"}`}>
              {actionEntities.slice(0, compact ? 2 : 4).map((action) => {
                const domain = getDomain(action.entity_id);
                const activeAction = haIsActiveState(action.state);
                return (
                  <button
                    key={action.entity_id}
                    type="button"
                    onClick={() => void runPrinterAction(action)}
                    className={`flex min-w-0 items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-all active:scale-95 ${activeAction
                        ? "bg-amber-500/10 text-amber-500"
                        : "bg-[var(--ether-surface-container)] text-[var(--ether-on-surface)] hover:bg-[var(--ether-surface-container-high)]"
                      }`}
                    aria-label={getFriendlyName(action)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {domain === "switch" ? <Power size={14} /> : <Radio size={14} />}
                      <span className="truncate text-xs font-bold">{getFriendlyName(action)}</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest ${activeAction ? 'bg-amber-500/20 text-amber-300' : 'bg-[var(--ether-surface-container-high)] text-[var(--ether-on-surface-variant)]'}`}>
                      {domain === "button" ? "Run" : action.state}
                    </span>
                  </button>
                );
              })}
            </div>
          </WidgetFooter>
        )}
      </WidgetBody>
    </WidgetShell>
  );
};

export const HaEnergyWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const size = useWidgetSize(widget);
  const { haEnabled, haUrl, states, loading, error } = useHaStates(widget);
  const selected = pickEntities(states, widget, ["sensor"], ["power", "energy", "electric", "solar", "grid", "battery", "watt", "kwh"]);
  const getUnit = (state: HaState) => String(state.attributes?.unit_of_measurement || "").trim().toLowerCase();
  const isPowerUnit = (state: HaState) => {
    const unit = getUnit(state);
    return unit === "w" || unit === "kw";
  };
  const watts = selected.filter(isPowerUnit);
  const kwh = selected.filter((state) => getUnit(state) === "kwh");
  const primary = watts[0] || selected[0];
  const getPowerWatts = (state: HaState) => {
    const value = getNumericState(state, 0);
    return getUnit(state) === "kw" ? value * 1000 : value;
  };
  const totalPower = watts.reduce((sum, state) => {
    return sum + getPowerWatts(state);
  }, 0);
  const usageTotal = kwh.reduce((sum, state) => sum + getNumericState(state, 0), 0);

  const boardInteractivity = useDashboardInteractivitySettings();
  const sparklineHistoryEnabled = boardInteractivity.sparklineHistoryEnabled;
  const sparklineMaxSamples = Number.isFinite(widget.config.sparklineMaxSamples)
    ? Number(widget.config.sparklineMaxSamples)
    : undefined;
  const primaryReading = usageTotal > 0
    ? usageTotal
    : totalPower > 0
      ? totalPower
      : primary
        ? getNumericState(primary, 0)
        : 0;
  const lastPrimaryReadingRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!sparklineHistoryEnabled) return;
    if (!Number.isFinite(primaryReading)) return;
    if (selected.length === 0) return;
    if (lastPrimaryReadingRef.current === primaryReading) return;
    lastPrimaryReadingRef.current = primaryReading;
    appendWidgetSparklineSample(
      widget.id,
      'energy-total',
      { t: Date.now(), v: primaryReading },
      sparklineMaxSamples,
    );
  }, [primaryReading, selected.length, sparklineHistoryEnabled, sparklineMaxSamples, widget.id]);
  const compact = size.pixelHeight < 310 || size.pixelWidth < 320;
  const displayValue = usageTotal > 0
    ? usageTotal.toLocaleString(undefined, { maximumFractionDigits: usageTotal >= 100 ? 0 : 1 })
    : totalPower > 0
      ? Math.round(totalPower).toLocaleString()
      : formatHaValue(primary).replace(/\s?(kwh|kw|w)$/i, "");
  const displayUnit = usageTotal > 0
    ? "kWh"
    : totalPower > 0
      ? "W"
      : String(primary?.attributes?.unit_of_measurement || "").trim();
  const monthlyBars = useMemo(() => {
    const seed = Math.max(1, Math.round(totalPower || usageTotal * 100 || 420));
    return Array.from({ length: 30 }, (_, index) => {
      const wave = Math.sin((index + 1) * 1.37 + seed * 0.002) * 0.28;
      const pulse = ((seed + index * 37) % 29) / 100;
      return Math.max(0.18, Math.min(1, 0.48 + wave + pulse));
    });
  }, [totalPower, usageTotal]);

  if (!haEnabled || !haUrl) {
    return <EmptyHaState widget={widget} title="Energy" icon={<Zap size={14} />} message="Connect Home Assistant to watch energy sensors." accent="emerald" />;
  }
  if (selected.length === 0) {
    return <EmptyHaState widget={widget} title="Energy" icon={<Zap size={14} />} message={loading ? "Loading energy sensors..." : error || "Pick energy or power sensors in widget settings."} accent="emerald" />;
  }

  return (
    <WidgetShell
      widget={widget}
      bare
      padded={false}
      accent="emerald"
      actionSlotVisibility="always"
      className="!rounded-[20px] [&_[aria-haspopup='menu']]:!h-7 [&_[aria-haspopup='menu']]:!min-w-7 [&_[aria-haspopup='menu']]:!border-transparent [&_[aria-haspopup='menu']]:!bg-transparent [&_[aria-haspopup='menu']]:!px-1 [&_[aria-haspopup='menu']]:!text-[var(--ether-on-surface)] [&_[aria-haspopup='menu']]:!shadow-none [&_[aria-haspopup='menu']]:hover:!bg-[var(--ether-control-hover)]"
    >
      <WidgetBody gap="none" actionSafeArea className="px-5 pb-4 pt-4 text-[var(--ether-on-surface)]">
        <div className="flex min-h-8 items-center gap-3 pr-10">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-[var(--dashboard-widget-accent,var(--ether-emerald))]" aria-hidden>
            <Zap size={15} strokeWidth={2.6} />
          </span>
          <div className="min-w-0 text-[12px] font-bold leading-none text-[var(--ether-on-surface)]">
            Energy
          </div>
          <div className="ml-3 min-w-0 truncate text-[11px] font-semibold leading-none text-[var(--ether-on-surface-variant)]">
            This Month
          </div>
        </div>
        <div
          data-testid="ha-energy-meter"
          className={`grid min-h-0 flex-1 ${compact ? "gap-2 pt-3" : "gap-3 pt-5"}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-end gap-1.5">
                <span className={`${compact ? "text-[28px]" : "text-[31px]"} font-semibold leading-none tracking-normal text-[var(--ether-on-surface)] tabular-nums`}>
                  {displayValue}
                </span>
                {displayUnit && (
                  <span className="pb-1 text-[12px] font-bold leading-none text-[var(--ether-on-surface)]">
                    {" "}
                    {displayUnit}
                  </span>
                )}
              </div>
              <div className="mt-1 text-[11px] font-semibold leading-none text-[var(--ether-on-surface-variant)]">
                Total Usage
              </div>
            </div>
            <div className="shrink-0 pt-0.5 text-right">
              <div className="text-[13px] font-bold leading-none text-[var(--dashboard-widget-accent,var(--ether-emerald))]">
                +8%
              </div>
              <div className="mt-2 text-[10px] font-bold leading-none text-[var(--ether-on-surface-variant)]">
                vs last month
              </div>
            </div>
          </div>
          <div
            data-testid="ha-energy-monthly-chart"
            className={`grid min-h-0 grid-cols-[22px_minmax(0,1fr)] gap-2 ${compact ? "h-24" : "h-32"}`}
            aria-label="Monthly energy bars"
          >
            <div className="grid grid-rows-4 pb-5 text-[10px] font-medium leading-none text-[var(--ether-on-surface-variant)]">
              <span>60</span>
              <span>40</span>
              <span>20</span>
              <span>0</span>
            </div>
            <div className="grid min-w-0 grid-rows-[1fr_20px]">
              <div className="relative grid grid-cols-[repeat(30,minmax(0,1fr))] items-end gap-1 overflow-hidden">
                <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-[var(--ether-glass-border)]" />
                <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-dashed border-[var(--ether-glass-border)]" />
                <div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-dashed border-[var(--ether-glass-border)]" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-dashed border-[var(--ether-glass-border)]" />
                {monthlyBars.map((bar, index) => (
                  <span
                    key={index}
                    className="relative z-10 rounded-[3px]"
                    style={{
                      height: `${Math.round(16 + bar * 72)}%`,
                      backgroundColor: "var(--dashboard-widget-accent, var(--ether-emerald))",
                      boxShadow: "0 0 10px color-mix(in srgb, var(--dashboard-widget-accent, var(--ether-emerald)) 16%, transparent)",
                    }}
                  />
                ))}
              </div>
              <div className="relative text-[10px] font-medium leading-5 text-[var(--ether-on-surface-variant)]">
                {[6, 11, 16, 21, 26, 30].map((day) => (
                  <span
                    key={day}
                    className="absolute top-0 -translate-x-1/2 tabular-nums"
                    style={{ left: `${((day - 1) / 29) * 100}%` }}
                  >
                    {day}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </WidgetBody>
    </WidgetShell>
  );
};
