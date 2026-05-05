import React from "react";
import { createPortal } from "react-dom";
import {
  Download,
  Maximize2,
  Palette,
  PinOff,
  RefreshCcw,
  Save,
  Scaling,
  Settings2,
  Trash2,
  Upload,
  Bot,
} from "lucide-react";
import {
  FACE_STYLES,
  getFaceStyleId,
} from "../../../utils/settingsStorage";
import {
  getDashboardCatalogItem,
  type DashboardRobotFaceStyle,
  type DashboardRobotWanderMode,
  type DashboardWidget,
  type DashboardWidgetConfig,
} from "../../../services/dashboardTypes";
import {
  getDashboardRefreshEventName,
  getDashboardRefreshPolicy,
  isLiveDashboardWidget,
} from "../../../services/dashboardRefresh";
import {
  WIDGET_ACTION_MENU_MARGIN,
  supportsDashboardWidgetGlassEffects,
  type WidgetActionMenuPosition,
} from "./dashboardBoardUtils";
import { ROBOT_COLOR_PRESETS } from "./dashboardRobotPresets";

interface DashboardWidgetActionMenuProps {
  widget: DashboardWidget;
  menuRef: React.RefObject<HTMLDivElement | null>;
  position: WidgetActionMenuPosition | null;
  tempUnit: "F" | "C";
  editMode: boolean;
  widgetGlowEnabled: boolean;
  glassEffectEnabled: boolean;
  themeMode?: "light" | "dark";
  appearanceStyle?: React.CSSProperties;
  onFocusWidget: (widgetId: string) => void;
  onOpenWidgetSettings: (widgetId: string) => void;
  onEnableEditMode: () => void;
  onUpdateWidgetConfig: (
    widgetId: string,
    patch: Partial<DashboardWidgetConfig>,
  ) => void;
  onSetTempUnit: (unit: "F" | "C") => void;
  onRequestDelete: (widgetId: string) => void;
  onSaveAsPreset?: () => void;
  onExportPreset?: () => void;
  onImportPreset?: () => void;
}

export const DashboardWidgetActionMenu: React.FC<
  DashboardWidgetActionMenuProps
> = ({
  widget,
  menuRef,
  position,
  tempUnit,
  editMode,
  widgetGlowEnabled,
  glassEffectEnabled,
  themeMode,
  appearanceStyle,
  onFocusWidget,
  onOpenWidgetSettings,
  onEnableEditMode,
  onUpdateWidgetConfig,
  onSetTempUnit,
  onRequestDelete,
  onSaveAsPreset,
  onExportPreset,
  onImportPreset,
}) => {
  const label = getDashboardCatalogItem(widget.type)?.label || "Widget";
  const liveWidget = isLiveDashboardWidget(widget.type);
  const supportsGlassEffects = supportsDashboardWidgetGlassEffects(widget.type);
  const refreshPolicy = getDashboardRefreshPolicy(widget.type, widget.config);
  const supportsTemperatureUnit = [
    "weather",
    "forecast",
    "air_quality",
    "astronomy",
    "daily_summary",
  ].includes(widget.type);
  const supportsSummarization = [
    "mail",
    "gmail",
    "outlook_mail",
    "news",
    "notes",
    "rich_note",
    "obsidian_notes",
    "calendar",
    "google_calendar",
    "outlook_calendar",
    "ical_calendar",
    "ha_calendar",
    "stock",
    "portfolio",
    "messages",
    "slack",
    "tasks",
    "google_tasks",
    "chores",
    "reminders",
    "daily_summary",
    "weather",
    "forecast",
    "quote",
    "fun_fact",
    "alerts",
    "health",
    "habits",
    "system_status",
    "ha_entities"
  ].includes(widget.type);
  const menuItemClass =
    "flex w-full items-center justify-between gap-3 rounded-[1rem] px-3 py-2 text-left text-sm font-semibold text-[var(--ether-on-surface)] transition hover:bg-[var(--ether-control-hover)]";
  const menuHintClass =
    "text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ether-on-surface-variant)]";
  const unitButtonClass = (unit: "F" | "C") =>
    `rounded-xl px-3 py-2 text-xs font-bold transition ${
      tempUnit === unit
        ? "bg-[var(--ether-control-active-bg)] text-[var(--ether-control-active-text)]"
        : "bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
    }`;
  const robotWanderOptions: Array<{ value: DashboardRobotWanderMode; label: string }> = [
    { value: "off", label: "Still" },
    { value: "idle", label: "Idle" },
    { value: "full", label: "Full" },
  ];

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${label} actions`}
      data-theme={themeMode}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={{
        ...appearanceStyle,
        position: "fixed",
        left: position?.left ?? WIDGET_ACTION_MENU_MARGIN,
        top: position?.top ?? WIDGET_ACTION_MENU_MARGIN,
        width: "min(15rem, calc(100vw - 1.5rem))",
        maxHeight: "calc(100vh - 1.5rem)",
        visibility: position ? "visible" : "hidden",
      }}
      className="z-[1000] overflow-y-auto overscroll-contain rounded-[1.4rem] border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] p-2 text-[var(--ether-on-surface)] shadow-[0_22px_60px_rgba(0,0,0,0.24)] backdrop-blur-[26px]"
    >
      <div className="px-3 pb-2 pt-1">
        <div className="truncate text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ether-on-surface-variant)]">
          {label}
        </div>
      </div>

      <button
        role="menuitem"
        className={menuItemClass}
        onClick={() => onFocusWidget(widget.id)}
      >
        <span className="flex items-center gap-2">
          <Maximize2 size={14} /> Expand
        </span>
        <span className={menuHintClass}>View</span>
      </button>
      {supportsSummarization && (
        <button
          role="menuitem"
          className={menuItemClass}
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("curio:toggle-summary", {
                detail: { widgetId: widget.id, widgetType: widget.type },
              }),
            );
          }}
        >
          <span className="flex items-center gap-2 text-[var(--ether-primary)] font-bold">
            <Bot size={14} strokeWidth={2.5} /> Summarize
          </span>
          <span className={menuHintClass}>AI</span>
        </button>
      )}
      {liveWidget && (
        <button
          role="menuitem"
          className={menuItemClass}
          onClick={() => {
            window.dispatchEvent(
              new Event(getDashboardRefreshEventName(widget.id)),
            );
          }}
        >
          <span className="flex items-center gap-2">
            <RefreshCcw size={14} /> Refresh now
          </span>
          <span className={menuHintClass}>
            {refreshPolicy.mode === "timed"
              ? `${refreshPolicy.intervalMinutes}m`
              : refreshPolicy.label}
          </span>
        </button>
      )}
      <button
        role="menuitem"
        className={menuItemClass}
        onClick={() => onOpenWidgetSettings(widget.id)}
      >
        <span className="flex items-center gap-2">
          <Settings2 size={14} /> Settings
        </span>
        <span className={menuHintClass}>Edit</span>
      </button>
      <button
        role="menuitem"
        className={menuItemClass}
        onClick={onEnableEditMode}
      >
        <span className="flex items-center gap-2">
          <Scaling size={14} /> Move & resize
        </span>
        <span className={menuHintClass}>{editMode ? "Ready" : "Edit"}</span>
      </button>
      <button
        role="menuitem"
        className={menuItemClass}
        onClick={() => {
          onUpdateWidgetConfig(widget.id, {
            glowEnabled: widget.config.glowEnabled === false,
          });
        }}
      >
        <span className="flex items-center gap-2">
          <Palette size={14} /> Glow
        </span>
        <span className={menuHintClass}>
          {widget.config.glowEnabled === false
            ? "Off"
            : widgetGlowEnabled
              ? "On"
              : "Ready"}
        </span>
      </button>
      {supportsGlassEffects && (
        <button
          role="menuitem"
          className={menuItemClass}
          onClick={() => {
            onUpdateWidgetConfig(widget.id, {
              glassEnabled: widget.config.glassEnabled === false,
            });
          }}
        >
          <span className="flex items-center gap-2">
            <Palette size={14} /> Glass
          </span>
          <span className={menuHintClass}>
            {widget.config.glassEnabled === false
              ? "Off"
              : glassEffectEnabled
                ? "On"
                : "Ready"}
          </span>
        </button>
      )}
      {widget.type === "robot_face" && (
        <button
          role="menuitem"
          className={menuItemClass}
          onClick={() => {
            onUpdateWidgetConfig(widget.id, {
              robotFloatingEnabled: widget.config.robotFloatingEnabled !== true,
            });
          }}
        >
          <span className="flex items-center gap-2">
            <PinOff size={14} /> Float
          </span>
          <span className={menuHintClass}>
            {widget.config.robotFloatingEnabled === true ? "On" : "Screen"}
          </span>
        </button>
      )}

      {widget.type === "robot_face" && (
        <div className="my-1 rounded-[1.1rem] bg-[var(--ether-control-bg)] p-2">
          <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
            Robot
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {FACE_STYLES.map((faceStyle) => {
              const selected =
                (widget.config.robotFaceStyle || getFaceStyleId()) ===
                faceStyle.id;
              return (
                <button
                  key={faceStyle.id}
                  type="button"
                  onClick={() => {
                    onUpdateWidgetConfig(widget.id, {
                      robotFaceStyle:
                        faceStyle.id as DashboardRobotFaceStyle,
                    });
                  }}
                  className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                    selected
                      ? "bg-[var(--ether-control-active-bg)] text-[var(--ether-control-active-text)]"
                      : "bg-[var(--ether-surface-container-low)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
                  }`}
                >
                  {faceStyle.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3">
            <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
              Color
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {ROBOT_COLOR_PRESETS.map((color) => {
                const selected =
                  (widget.config.robotAccentColor || "#38bdf8").toLowerCase() ===
                  color.toLowerCase();
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      onUpdateWidgetConfig(widget.id, {
                        robotAccentColor: color,
                      });
                    }}
                    className={`h-7 rounded-full border-2 transition hover:scale-105 active:scale-95 ${
                      selected
                        ? "border-[var(--ether-on-surface)] shadow-[0_0_0_3px_var(--ether-control-hover)]"
                        : "border-[var(--ether-glass-border)]"
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Robot color ${color}`}
                    title={color}
                  />
                );
              })}
            </div>
          </div>
          {widget.config.robotFloatingEnabled === true && (
            <div className="mt-3">
              <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
                Motion
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {robotWanderOptions.map((option) => {
                  const selected = (widget.config.robotWanderMode || "idle") === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onUpdateWidgetConfig(widget.id, {
                          robotWanderMode: option.value,
                        });
                      }}
                      className={`rounded-xl px-2 py-2 text-xs font-bold transition ${
                        selected
                          ? "bg-[var(--ether-control-active-bg)] text-[var(--ether-control-active-text)]"
                          : "bg-[var(--ether-surface-container-low)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {supportsTemperatureUnit && (
        <div className="my-1 rounded-[1.1rem] bg-[var(--ether-control-bg)] p-2">
          <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
            Temperature
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onSetTempUnit("F")}
              className={unitButtonClass("F")}
            >
              {"\u00b0F"}
            </button>
            <button
              type="button"
              onClick={() => onSetTempUnit("C")}
              className={unitButtonClass("C")}
            >
              {"\u00b0C"}
            </button>
          </div>
        </div>
      )}

      {onSaveAsPreset && (
        <button
          role="menuitem"
          className={menuItemClass}
          onClick={onSaveAsPreset}
        >
          <span className="flex items-center gap-2">
            <Save size={14} /> Save as preset
          </span>
          <span className={menuHintClass}>Page</span>
        </button>
      )}
      {onExportPreset && (
        <button
          role="menuitem"
          className={menuItemClass}
          onClick={onExportPreset}
        >
          <span className="flex items-center gap-2">
            <Download size={14} /> Export preset
          </span>
          <span className={menuHintClass}>JSON</span>
        </button>
      )}
      {onImportPreset && (
        <button
          role="menuitem"
          className={menuItemClass}
          onClick={onImportPreset}
        >
          <span className="flex items-center gap-2">
            <Upload size={14} /> Import preset
          </span>
          <span className={menuHintClass}>JSON</span>
        </button>
      )}

      <button
        role="menuitem"
        className="mt-1 flex w-full items-center justify-between rounded-[1rem] px-3 py-2 text-left text-sm font-semibold text-rose-500 transition hover:bg-rose-500/10"
        onClick={() => onRequestDelete(widget.id)}
      >
        <span className="flex items-center gap-2">
          <Trash2 size={14} /> Remove
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-500/70">
          Hide
        </span>
      </button>
    </div>,
    document.body,
  );
};
