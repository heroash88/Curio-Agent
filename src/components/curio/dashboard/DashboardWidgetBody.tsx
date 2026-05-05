import React, { Suspense, useMemo } from "react";
import { MoreHorizontal } from "lucide-react";
import type {
  DashboardWidgetConfig,
  DashboardWidgetType,
} from "../../../services/dashboardTypes";
import type { DashboardWidgetFrameInfo } from "../../../hooks/useWidgetSize";
import { DashboardWidgetFrameContext } from "../../../hooks/useWidgetSize";
import {
  DashboardWidgetActionSlotContext,
  DashboardWidgetEditModeContext,
} from "./WidgetShell";
import { getDashboardCatalogItem } from "../../../services/dashboardTypes";
import type { DashboardWidgetComponentProps } from "./dashboardRegistry";

export interface DashboardCreateWidgetOptions {
  afterWidgetId?: string;
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

const DashboardWidgetFallback: React.FC = () => (
  <div
    className="flex h-full w-full flex-col justify-between rounded-[var(--ether-card-radius)] border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] p-5 shadow-[var(--ether-glass-shadow)]"
    aria-hidden
  >
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-xl bg-[var(--ether-control-bg)]" />
      <div className="h-3 w-28 rounded-full bg-[var(--ether-control-bg)]" />
    </div>
    <div className="space-y-3">
      <div className="h-10 w-3/4 rounded-2xl bg-[var(--ether-control-bg)]" />
      <div className="h-3 w-full rounded-full bg-[var(--ether-control-bg)]" />
      <div className="h-3 w-2/3 rounded-full bg-[var(--ether-control-bg)]" />
    </div>
  </div>
);

const WidgetMenuButton: React.FC<{
  label: string;
  open: boolean;
  buttonRef?: (node: HTMLButtonElement | null) => void;
  onToggle: () => void;
}> = React.memo(({ label, open, buttonRef, onToggle }) => (
  <button
    ref={buttonRef}
    type="button"
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => {
      event.stopPropagation();
      onToggle();
    }}
    className={`dashboard-widget-control-button dashboard-widget-menu-button ${
      open ? "dashboard-widget-control-button-active" : ""
    }`}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={`${label} widget actions`}
  >
    <MoreHorizontal size={18} strokeWidth={2.4} />
  </button>
));

// ---------------------------------------------------------------------------
// DashboardWidgetBody
// ---------------------------------------------------------------------------

type DashboardWidgetBodyProps = DashboardWidgetComponentProps & {
  Component: React.ComponentType<any>;
  frameInfo: DashboardWidgetFrameInfo;
  menuOpen: boolean;
  onWidgetMenuButtonRef: (
    widgetId: string,
    node: HTMLButtonElement | null,
  ) => void;
  onToggleWidgetMenu: (widgetId: string) => void;
  editMode: boolean;
  onCreateWidget?: (
    type: DashboardWidgetType,
    configPatch?: Partial<DashboardWidgetConfig>,
    options?: DashboardCreateWidgetOptions,
  ) => void;
};

const DashboardWidgetBodyImpl: React.FC<DashboardWidgetBodyProps> = ({
  widget,
  Component,
  frameInfo,
  weather,
  aqi,
  faceSlot,
  config,
  activeProfileName,
  activeProfileId,
  recognizedBy,
  updatedAt,
  focused,
  robotBubble,
  onUpdateWidgetConfig,
  onOpenWidgetSettings,
  menuOpen,
  onWidgetMenuButtonRef,
  onToggleWidgetMenu,
  editMode,
  onCreateWidget,
}) => {
  const actionSlot = useMemo(
    () => (
      <WidgetMenuButton
        label={getDashboardCatalogItem(widget.type)?.label || widget.type}
        open={menuOpen}
        buttonRef={(node) => onWidgetMenuButtonRef(widget.id, node)}
        onToggle={() => onToggleWidgetMenu(widget.id)}
      />
    ),
    [
      menuOpen,
      onToggleWidgetMenu,
      onWidgetMenuButtonRef,
      widget.id,
      widget.type,
    ],
  );

  return (
    <Suspense fallback={<DashboardWidgetFallback />}>
      <DashboardWidgetFrameContext.Provider value={frameInfo}>
        <DashboardWidgetEditModeContext.Provider value={editMode}>
          <DashboardWidgetActionSlotContext.Provider value={actionSlot}>
            <Component
              widget={widget}
              weather={weather}
              aqi={aqi}
              faceSlot={faceSlot}
              config={config}
              activeProfileName={activeProfileName}
              activeProfileId={activeProfileId}
              recognizedBy={recognizedBy}
              updatedAt={updatedAt}
              focused={focused}
              robotBubble={robotBubble}
              onUpdateWidgetConfig={onUpdateWidgetConfig}
              onOpenWidgetSettings={onOpenWidgetSettings}
              onCreateWidget={onCreateWidget}
            />
          </DashboardWidgetActionSlotContext.Provider>
        </DashboardWidgetEditModeContext.Provider>
      </DashboardWidgetFrameContext.Provider>
    </Suspense>
  );
};

export const DashboardWidgetBody: React.FC<DashboardWidgetBodyProps> = React.memo(
  DashboardWidgetBodyImpl,
  (prev, next) =>
    prev.widget === next.widget &&
    prev.Component === next.Component &&
    prev.weather === next.weather &&
    prev.aqi === next.aqi &&
    prev.faceSlot === next.faceSlot &&
    prev.config === next.config &&
    prev.activeProfileName === next.activeProfileName &&
    prev.activeProfileId === next.activeProfileId &&
    prev.recognizedBy === next.recognizedBy &&
    prev.updatedAt === next.updatedAt &&
    prev.focused === next.focused &&
    prev.robotBubble === next.robotBubble &&
    prev.onOpenWidgetSettings === next.onOpenWidgetSettings &&
    prev.menuOpen === next.menuOpen &&
    prev.editMode === next.editMode &&
    prev.onWidgetMenuButtonRef === next.onWidgetMenuButtonRef &&
    prev.onCreateWidget === next.onCreateWidget &&
    prev.frameInfo.pixelWidth === next.frameInfo.pixelWidth &&
    prev.frameInfo.pixelHeight === next.frameInfo.pixelHeight &&
    prev.frameInfo.gridWidth === next.frameInfo.gridWidth &&
    prev.frameInfo.gridHeight === next.frameInfo.gridHeight,
);
