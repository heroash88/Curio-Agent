import React, { useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";

import type {
  DashboardWidget,
  DashboardWidgetConfig,
  DashboardWidgetType,
} from "../../../services/dashboardTypes";
import { installHaSmartHomeReviewFetchMock } from "../../../services/haSmartHomeMock";
import { DashboardWidgetFrameContext } from "../../../hooks/useWidgetSize";
import { DashboardWidgetActionSlotContext } from "./WidgetShell";
import HaCameraWidget from "./HaCameraWidget";
import { HaLightWidget } from "./HaLightWidget";
import { HaSensorWidget } from "./HaSensorWidget";
import HaEntitiesWidget from "./HaEntitiesWidget";
import {
  HaButtonStackWidget,
  HaCalendarWidget,
  HaClimateWidget,
  HaCoverWidget,
  HaEnergyWidget,
  HaMediaPlayerWidget,
  HaPrinterWidget,
  HaSelectWidget,
  HaVacuumWidget,
} from "./HaAdvancedWidgets";

type ReviewWidgetSpec = {
  id: string;
  label: string;
  type: DashboardWidgetType;
  component: React.ComponentType<any>;
  config: DashboardWidgetConfig;
};

const cellWidth = 150;
const cellHeight = 118;
const gap = 12;

const getPixelSize = (config: DashboardWidgetConfig) => {
  const w = Math.max(1, Number(config.w || 2));
  const h = Math.max(1, Number(config.h || 2));
  return {
    w,
    h,
    width: w * cellWidth + (w - 1) * gap,
    height: h * cellHeight + (h - 1) * gap,
  };
};

const widgetSpecs: ReviewWidgetSpec[] = [
  {
    id: "review-ha-camera",
    label: "Camera",
    type: "ha_camera",
    component: HaCameraWidget,
    config: { w: 4, h: 3, entityIds: ["camera.front_door", "camera.garage"], refreshMode: "timed" },
  },
  {
    id: "review-ha-light",
    label: "Light",
    type: "ha_light",
    component: HaLightWidget,
    config: { w: 2, h: 2, entityIds: ["light.kitchen_pendants"] },
  },
  {
    id: "review-ha-sensor",
    label: "Sensor",
    type: "ha_sensor",
    component: HaSensorWidget,
    config: { w: 2, h: 2, entityIds: ["sensor.living_room_temperature"] },
  },
  {
    id: "review-ha-climate",
    label: "Climate",
    type: "ha_climate",
    component: HaClimateWidget,
    config: { w: 2, h: 3, entityIds: ["climate.downstairs"] },
  },
  {
    id: "review-ha-cover",
    label: "Cover",
    type: "ha_cover",
    component: HaCoverWidget,
    config: { w: 2, h: 3, entityIds: ["cover.living_room_shades"] },
  },
  {
    id: "review-ha-media",
    label: "Media Player",
    type: "ha_media_player",
    component: HaMediaPlayerWidget,
    config: { w: 3, h: 3, entityIds: ["media_player.family_room"] },
  },
  {
    id: "review-ha-select",
    label: "Select",
    type: "ha_select",
    component: HaSelectWidget,
    config: { w: 2, h: 3, entityIds: ["select.house_mode"] },
  },
  {
    id: "review-ha-buttons",
    label: "Button Stack",
    type: "ha_button_stack",
    component: HaButtonStackWidget,
    config: {
      w: 3,
      h: 3,
      entityIds: ["scene.movie_night", "script.goodnight", "button.find_phone", "switch.porch_outlet"],
      maxItems: 4,
    },
  },
  {
    id: "review-ha-calendar",
    label: "Calendar",
    type: "ha_calendar",
    component: HaCalendarWidget,
    config: { w: 3, h: 3, entityIds: ["calendar.family"] },
  },
  {
    id: "review-ha-vacuum",
    label: "Vacuum",
    type: "ha_vacuum",
    component: HaVacuumWidget,
    config: { w: 3, h: 3, entityIds: ["vacuum.robovac"] },
  },
  {
    id: "review-ha-printer",
    label: "3D Printer",
    type: "ha_printer",
    component: HaPrinterWidget,
    config: {
      w: 4,
      h: 3,
      entityIds: [
        "sensor.printer_status",
        "sensor.printer_progress",
        "sensor.printer_nozzle",
        "sensor.printer_bed",
        "sensor.printer_time_left",
        "sensor.printer_filename",
        "button.printer_pause",
        "camera.printer",
      ],
    },
  },
  {
    id: "review-ha-energy",
    label: "Energy",
    type: "ha_energy",
    component: HaEnergyWidget,
    config: {
      w: 3,
      h: 3,
      entityIds: ["sensor.home_power", "sensor.solar_generation", "sensor.energy_today"],
    },
  },
  {
    id: "review-ha-entities",
    label: "Entities",
    type: "ha_entities",
    component: HaEntitiesWidget,
    config: {
      w: 3,
      h: 3,
      maxItems: 6,
      entityIds: [
        "light.kitchen_pendants",
        "climate.downstairs",
        "lock.front_door",
        "switch.porch_outlet",
        "binary_sensor.front_door_motion",
        "sensor.main_floor_humidity",
      ],
    },
  },
];

const buildWidget = (spec: ReviewWidgetSpec, config: DashboardWidgetConfig): DashboardWidget => ({
  id: spec.id,
  type: spec.type,
  position: 0,
  size: "large",
  enabled: true,
  config,
});

const ReviewWidgetCard: React.FC<{ spec: ReviewWidgetSpec }> = ({ spec }) => {
  const [config, setConfig] = useState(spec.config);
  const pixelSize = useMemo(() => getPixelSize(config), [config]);
  const widget = useMemo(() => buildWidget(spec, config), [config, spec]);
  const Component = spec.component;

  const handleUpdateWidgetConfig = (
    widgetId: string,
    patch: Partial<DashboardWidgetConfig>,
  ) => {
    if (widgetId !== spec.id) return;
    setConfig((current) => ({ ...current, ...patch }));
  };

  const actionSlot = (
    <button
      type="button"
      className="flex h-8 min-w-8 items-center justify-center rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-2 text-[var(--ether-on-surface-variant)]"
      aria-label={`${spec.label} widget actions`}
    >
      <MoreHorizontal size={18} strokeWidth={2.4} />
    </button>
  );

  return (
    <section className="grid gap-2">
      <div className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {spec.label}
      </div>
      <div
        className="rounded-[1.75rem]"
        style={{
          width: pixelSize.width,
          height: pixelSize.height,
        }}
      >
        <DashboardWidgetFrameContext.Provider
          value={{
            pixelWidth: pixelSize.width,
            pixelHeight: pixelSize.height,
            gridWidth: pixelSize.w,
            gridHeight: pixelSize.h,
          }}
        >
          <DashboardWidgetActionSlotContext.Provider value={actionSlot}>
            <Component
              widget={widget}
              onUpdateWidgetConfig={handleUpdateWidgetConfig}
            />
          </DashboardWidgetActionSlotContext.Provider>
        </DashboardWidgetFrameContext.Provider>
      </div>
    </section>
  );
};

const HaSmartHomeReview: React.FC = () => {
  installHaSmartHomeReviewFetchMock();

  return (
    <div
      className="h-full overflow-auto bg-slate-950 px-6 py-5 text-[var(--ether-on-surface)]"
      style={{
        "--ether-surface": "#0f0e0c",
        "--ether-surface-dim": "#0a0908",
        "--ether-surface-container-lowest": "rgba(255, 244, 225, 0.035)",
        "--ether-surface-container-low": "rgba(255, 244, 225, 0.055)",
        "--ether-surface-container": "rgba(255, 244, 225, 0.075)",
        "--ether-surface-container-high": "rgba(255, 244, 225, 0.105)",
        "--ether-surface-container-highest": "rgba(255, 244, 225, 0.14)",
        "--ether-surface-bright": "rgba(255, 244, 225, 0.18)",
        "--ether-on-surface": "#f5f0e6",
        "--ether-on-surface-variant": "#aaa399",
        "--ether-outline": "#736b60",
        "--ether-outline-variant": "rgba(255, 244, 225, 0.1)",
        "--ether-glass-bg": "rgba(25, 23, 19, 0.92)",
        "--ether-glass-border": "rgba(255, 244, 225, 0.1)",
        "--ether-glass-blur": "16px",
        "--ether-glass-shadow": "0 16px 44px rgba(0, 0, 0, 0.28)",
        "--ether-overlay-panel": "#171512",
        "--ether-control-bg": "rgba(255, 244, 225, 0.055)",
        "--ether-control-hover": "rgba(255, 244, 225, 0.1)",
        "--ether-control-border": "rgba(255, 244, 225, 0.1)",
      } as React.CSSProperties}
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300">
            Smart Home Review
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-white">
            Home Assistant Widgets
          </h1>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300">
          Mock Home Assistant
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-5 pb-8">
        {widgetSpecs.map((spec) => (
          <ReviewWidgetCard key={spec.id} spec={spec} />
        ))}
      </div>
    </div>
  );
};

export default HaSmartHomeReview;
