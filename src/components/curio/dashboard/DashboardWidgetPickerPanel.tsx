import React, { startTransition } from "react";
import { Search, X } from "lucide-react";
import type {
  DashboardWidgetCatalogItem,
  DashboardWidgetType,
} from "../../../services/dashboardTypes";
import { DASHBOARD_WIDGET_GROUPS } from "./dashboardRegistry";
import { IconImageGallery, IconYouTube } from "./widgetIcons";

interface DashboardWidgetPickerPanelProps {
  availableCatalog: DashboardWidgetCatalogItem[];
  pickerQuery: string;
  pickerSearchInputRef: React.RefObject<HTMLInputElement | null>;
  onPickerQueryChange: (value: string) => void;
  onClose: () => void;
  onCatalogPointerDown: (
    event: React.PointerEvent<HTMLButtonElement>,
    type: DashboardWidgetType,
  ) => void;
  onCatalogClick: (type: DashboardWidgetType) => void;
}

const DashboardWidgetPickerPanel: React.FC<DashboardWidgetPickerPanelProps> = ({
  availableCatalog,
  pickerQuery,
  pickerSearchInputRef,
  onPickerQueryChange,
  onClose,
  onCatalogPointerDown,
  onCatalogClick,
}) => (
  <>
    <div
      className="dashboard-picker-scrim absolute inset-0 z-40 bg-black/35 backdrop-blur-sm"
      onClick={onClose}
    />
    <div className="dashboard-side-panel dashboard-widget-picker-panel absolute inset-y-0 right-0 z-50 flex w-full max-w-[28rem] flex-col border-l border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] p-4 shadow-[var(--ether-glass-shadow)] backdrop-blur-[var(--ether-glass-blur)]">
      <div className="flex items-center justify-between gap-3 pb-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ether-on-surface-variant)]">
            Widget Picker
          </div>
          <div className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[var(--ether-on-surface)]">
            Add a surface
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)]"
          aria-label="Close picker"
        >
          <X size={16} />
        </button>
      </div>

      <label className="flex items-center gap-3 rounded-[1.4rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-4 py-3">
        <Search
          size={16}
          className="text-[var(--ether-on-surface-variant)]"
        />
        <input
          ref={pickerSearchInputRef}
          value={pickerQuery}
          onChange={(event) => {
            const value = event.target.value;
            startTransition(() => onPickerQueryChange(value));
          }}
          placeholder="Find a widget to add"
          className="flex-1 bg-transparent text-sm text-[var(--ether-on-surface)] outline-none placeholder:text-[var(--ether-on-surface-variant)]"
        />
      </label>

      <div className="mt-4 flex-1 overflow-y-auto pr-1">
        {DASHBOARD_WIDGET_GROUPS.map((group) => {
          const groupItems = availableCatalog.filter((item) =>
            group.types.includes(item.type),
          );
          if (groupItems.length === 0) {
            return null;
          }
          return (
            <div key={group.key} className="mb-5">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ether-on-surface-variant)]">
                {group.label}
              </div>
              <div className="grid gap-2">
                {groupItems.map((item) => (
                  <button
                    key={item.type}
                    onPointerDown={(event) =>
                      onCatalogPointerDown(event, item.type)
                    }
                    onClick={() => onCatalogClick(item.type)}
                    className="rounded-[1.6rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-4 text-left transition hover:bg-[var(--ether-control-hover)]"
                    style={{ contentVisibility: "auto" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-[1.1rem] bg-[var(--ether-surface-container-high)]">
                            {item.type === "youtube_video" ? (
                              <IconYouTube className="!w-6 !h-6" />
                            ) : item.type === "image_gallery" ? (
                              <IconImageGallery className="!w-6 !h-6" />
                            ) : (
                              <span className="text-xl">{item.icon}</span>
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-[var(--ether-on-surface)]">
                              {item.label}
                            </div>
                            <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
                              {item.defaultSize}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 text-sm leading-5 text-[var(--ether-on-surface-variant)]">
                          {item.description}
                        </div>
                      </div>
                      <div className="rounded-full bg-[var(--ether-on-surface)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-surface)]">
                        Add
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {availableCatalog.length === 0 && (
          <div className="flex h-full items-center justify-center py-12">
            <div className="max-w-xs text-center">
              <div className="text-lg font-semibold text-[var(--ether-on-surface)]">
                No widgets to add match
              </div>
              <div className="mt-2 text-sm text-[var(--ether-on-surface-variant)]">
                Try another search or remove a widget from the board first.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  </>
);

export default DashboardWidgetPickerPanel;
