import { useEffect } from "react";
import type React from "react";
import type { CardEvent } from "../../../services/cardTypes";
import {
  createDashboardWidget,
  getDashboardCatalogItem,
  type DashboardWidget,
  type DashboardWidgetConfig,
  type DashboardWidgetType,
} from "../../../services/dashboardTypes";
import {
  DASHBOARD_CARD_WIDGET_MAP,
  normalizeWidgets,
} from "./dashboardBoardUtils";

export interface UseDashboardWidgetIntentsOptions {
  widgetsRef: React.MutableRefObject<DashboardWidget[]>;
  persistWidgets: (widgets: DashboardWidget[]) => void;
}

const valuesDiffer = (left: unknown, right: unknown) =>
  JSON.stringify(left) !== JSON.stringify(right);

const toWidgetType = (value: unknown): DashboardWidgetType | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return getDashboardCatalogItem(normalized as DashboardWidgetType)
    ? (normalized as DashboardWidgetType)
    : null;
};

export const useDashboardWidgetIntents = ({
  widgetsRef,
  persistWidgets,
}: UseDashboardWidgetIntentsOptions) => {
  useEffect(() => {
    const ensureWidgetVisible = (
      type: DashboardWidgetType,
      configPatch: Partial<DashboardWidgetConfig> = {},
    ) => {
      const current = normalizeWidgets(widgetsRef.current);
      const existingIndex = current.findIndex((widget) => widget.type === type);
      let nextWidgets = current;
      let changed = false;

      if (existingIndex >= 0) {
        const existing = current[existingIndex];
        const patchChanged = Object.keys(configPatch).some((key) => {
          const typedKey = key as keyof DashboardWidgetConfig;
          return valuesDiffer(
            existing.config?.[typedKey],
            configPatch[typedKey],
          );
        });
        if (!existing.enabled || patchChanged) {
          changed = true;
          const nextWidget: DashboardWidget = {
            ...existing,
            enabled: true,
            config: { ...existing.config, ...configPatch },
          };
          nextWidgets = current.map((widget, index) =>
            index === existingIndex ? nextWidget : widget,
          );
        }
      } else {
        changed = true;
        const lastPosition = current.reduce(
          (highest, widget) => Math.max(highest, widget.position),
          -1,
        );
        const created = createDashboardWidget(type, lastPosition + 1, {
          config: configPatch,
        });
        nextWidgets = [...current, created];
      }

      if (!changed) return;
      persistWidgets(normalizeWidgets(nextWidgets));
    };

    const handleCardIntent = (event: Event) => {
      const detail = (event as CustomEvent<CardEvent>).detail;
      if (!detail || typeof detail !== "object") return;
      const mappedWidget = DASHBOARD_CARD_WIDGET_MAP[String(detail.type || "")];
      if (!mappedWidget) return;

      if (detail.type === "youtube") {
        const payload = detail.data as {
          searchQuery?: unknown;
          videoId?: unknown;
          title?: unknown;
        };
        const query =
          typeof payload.searchQuery === "string"
            ? payload.searchQuery.trim()
            : "";
        const title =
          typeof payload.title === "string" ? payload.title.trim() : "";
        const videoId =
          typeof payload.videoId === "string" ? payload.videoId.trim() : "";

        ensureWidgetVisible("youtube_video", {
          youtubeQuery: query || title || undefined,
          youtubeVideoId: videoId || undefined,
          youtubeTitle: title || query || undefined,
          youtubeAutoplay: true,
          youtubeRequestNonce: Date.now(),
        });
        return;
      }

      if (detail.type === "list") {
        const payload = detail.data as { title?: unknown };
        const title =
          typeof payload.title === "string" ? payload.title.toLowerCase() : "";
        ensureWidgetVisible(
          title.includes("reminder")
            ? "reminders"
            : title.includes("task")
              ? "tasks"
              : "notes",
        );
        return;
      }

      if (detail.type === "device" || detail.type === "thermostat") {
        const payload = detail.data as { entityId?: unknown; domain?: unknown };
        const entityId =
          typeof payload.entityId === "string" ? payload.entityId.trim() : "";
        const domain =
          typeof payload.domain === "string" ? payload.domain.trim() : "";
        ensureWidgetVisible(domain === "light" ? "ha_light" : "ha_entities", {
          entityIds: entityId ? [entityId] : undefined,
          domain: domain || undefined,
        });
        return;
      }

      if (detail.type === "camera" || detail.type === "sensorReading") {
        const payload = detail.data as { entityId?: unknown };
        const entityId =
          typeof payload.entityId === "string" ? payload.entityId.trim() : "";
        ensureWidgetVisible(mappedWidget, {
          entityIds: entityId ? [entityId] : undefined,
        });
        return;
      }

      if (detail.type === "stopwatch") {
        const payload = detail.data as {
          running?: unknown;
          startTime?: unknown;
          pausedElapsed?: unknown;
        };
        ensureWidgetVisible("stopwatch", {
          stopwatchRunning: payload.running !== false,
          stopwatchStartedAt:
            typeof payload.startTime === "number" ? payload.startTime : Date.now(),
          stopwatchElapsedMs:
            typeof payload.pausedElapsed === "number" ? payload.pausedElapsed : 0,
          stopwatchRequestNonce: Date.now(),
        });
        return;
      }

      ensureWidgetVisible(mappedWidget);
    };

    const handleWidgetIntent = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          widgetType?: unknown;
          configPatch?: unknown;
        }>
      ).detail;
      if (!detail || typeof detail !== "object") return;
      const widgetType = toWidgetType(detail.widgetType);
      if (!widgetType) return;
      const configPatch =
        detail.configPatch && typeof detail.configPatch === "object"
          ? (detail.configPatch as Partial<DashboardWidgetConfig>)
          : {};
      ensureWidgetVisible(widgetType, configPatch);
    };

    window.addEventListener(
      "curio:dashboard-card-intent",
      handleCardIntent as EventListener,
    );
    window.addEventListener(
      "curio:dashboard-widget-intent",
      handleWidgetIntent as EventListener,
    );
    return () => {
      window.removeEventListener(
        "curio:dashboard-card-intent",
        handleCardIntent as EventListener,
      );
      window.removeEventListener(
        "curio:dashboard-widget-intent",
        handleWidgetIntent as EventListener,
      );
    };
  }, [persistWidgets, widgetsRef]);
};
