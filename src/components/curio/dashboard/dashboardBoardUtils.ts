import type React from "react";
import {
  getDashboardCatalogItem,
  type DashboardPage,
  type DashboardWidget,
  type DashboardWidgetType,
} from "../../../services/dashboardTypes";
import { clamp } from "./dashboardLayout";

export const DASHBOARD_PAGE_SHORTCUT_EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"]';

export const DASHBOARD_PAGE_STORAGE_PERSIST_DEBOUNCE_MS = 350;

export const WIDGET_ACTION_MENU_WIDTH = 240;
export const WIDGET_ACTION_MENU_GAP = 8;
export const WIDGET_ACTION_MENU_MARGIN = 12;
export const DASHBOARD_TOUCH_KEYBOARD_DISMISS_DELAY_MS = 320;
export const DASHBOARD_GRID_COLUMN_WIDTH = 156;
export const DASHBOARD_GRID_MAX_COLUMNS = 14;

export const isDashboardPageShortcutEditableTarget = (
  target: EventTarget | Element | null,
): boolean => {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  if (
    typeof HTMLElement !== "undefined" &&
    target instanceof HTMLElement &&
    target.isContentEditable
  ) {
    return true;
  }
  return Boolean(target.closest(DASHBOARD_PAGE_SHORTCUT_EDITABLE_SELECTOR));
};

export type ActiveGesture =
  | {
    kind: "drag-grid";
    widgetId: string;
    startClientX: number;
    startClientY: number;
    currentClientX: number;
    currentClientY: number;
    originRect: { left: number; top: number; width: number; height: number };
    targetIndex: number;
  }
  | {
    kind: "resize-grid";
    widgetId: string;
    axis: "x" | "y" | "both";
    startClientX: number;
    startClientY: number;
    currentClientX: number;
    currentClientY: number;
    originSize: { w: number; h: number };
    previewSize: { w: number; h: number };
  }
  | {
    kind: "drag-freeform";
    widgetId: string;
    startClientX: number;
    startClientY: number;
    currentClientX: number;
    currentClientY: number;
    originRect: { x: number; y: number; w: number; h: number; z?: number };
    previewRect: { x: number; y: number; w: number; h: number; z?: number };
  }
  | {
    kind: "resize-freeform";
    widgetId: string;
    axis: "x" | "y" | "both";
    startClientX: number;
    startClientY: number;
    currentClientX: number;
    currentClientY: number;
    originRect: { x: number; y: number; w: number; h: number; z?: number };
    previewRect: { x: number; y: number; w: number; h: number; z?: number };
  };

export const getActiveGestureOriginRect = (gesture: ActiveGesture | null) => {
  if (!gesture || gesture.kind === "resize-grid") return undefined;
  return gesture.originRect;
};

export const getActiveGesturePreviewSize = (gesture: ActiveGesture | null) =>
  gesture?.kind === "resize-grid" ? gesture.previewSize : undefined;

export const getActiveGesturePreviewRect = (gesture: ActiveGesture | null) =>
  gesture?.kind === "drag-freeform" || gesture?.kind === "resize-freeform"
    ? gesture.previewRect
    : undefined;

export const normalizeWidgets = (widgets: DashboardWidget[]) =>
  widgets
    .slice()
    .sort((left, right) => left.position - right.position)
    .map((widget, index) => ({ ...widget, position: index }));

export const cloneDashboardWidget = (widget: DashboardWidget): DashboardWidget => ({
  ...widget,
  config: { ...widget.config },
  layout: widget.layout
    ? {
      ...widget.layout,
      freeform: widget.layout.freeform
        ? { ...widget.layout.freeform }
        : undefined,
    }
    : undefined,
});

export const cloneDashboardPage = (page: DashboardPage): DashboardPage => ({
  ...page,
  appearance: page.appearance ? { ...page.appearance } : undefined,
  widgets: page.widgets.map(cloneDashboardWidget),
});

export const dashboardStateEqual = (left: unknown, right: unknown) => {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
};

export const getVisibleWidgets = (widgets: DashboardWidget[]) =>
  normalizeWidgets(widgets).filter((widget) => widget.enabled);

export const captureDashboardPointer = (
  event: React.PointerEvent<HTMLElement>,
) => {
  if (typeof event.currentTarget.setPointerCapture !== "function") return;
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture can fail if the browser has already canceled the pointer.
  }
};

export const preventDashboardPointerDefault = (event: PointerEvent) => {
  if (event.cancelable) {
    event.preventDefault();
  }
};

export const insertVisibleWidget = (
  widgets: DashboardWidget[],
  widgetId: string,
  targetIndex: number,
) => {
  const visible = getVisibleWidgets(widgets);
  const active = visible.find((widget) => widget.id === widgetId);
  if (!active) {
    return visible;
  }

  const remainder = visible.filter((widget) => widget.id !== widgetId);
  const clampedIndex = clamp(targetIndex, 0, remainder.length);
  remainder.splice(clampedIndex, 0, active);
  return remainder;
};

export const mergeVisibleOrder = (
  allWidgets: DashboardWidget[],
  orderedVisible: DashboardWidget[],
) => {
  const visibleIds = new Set(orderedVisible.map((widget) => widget.id));
  const hidden = normalizeWidgets(allWidgets).filter(
    (widget) => !visibleIds.has(widget.id),
  );
  return [...orderedVisible, ...hidden].map((widget, index) => ({
    ...widget,
    position: index,
  }));
};

export const resolveColumns = (boardWidth: number) => {
  if (boardWidth < 560) return 1;
  const desktopGap = 18;
  const columnsThatFit = Math.floor(
    (boardWidth + desktopGap) / (DASHBOARD_GRID_COLUMN_WIDTH + desktopGap),
  );
  return clamp(
    columnsThatFit,
    2,
    DASHBOARD_GRID_MAX_COLUMNS,
  );
};

export const resolveGridCanvasWidth = (
  rawCanvasWidth: number,
  columns: number,
  gap: number,
) => {
  if (columns <= 1) return rawCanvasWidth;
  const stableCanvasWidth =
    columns * DASHBOARD_GRID_COLUMN_WIDTH +
    Math.max(0, columns - 1) * gap;
  return Math.min(rawCanvasWidth, stableCanvasWidth);
};

export interface FloatingWidgetPosition {
  x: number;
  y: number;
}

export interface FloatingWidgetSize {
  width: number;
  height: number;
}

export const clampFloatingWidgetPosition = (
  position: FloatingWidgetPosition,
  viewport: FloatingWidgetSize,
  size: FloatingWidgetSize,
  margin = 16,
): FloatingWidgetPosition => {
  const maxX = Math.max(margin, viewport.width - size.width - margin);
  const maxY = Math.max(margin, viewport.height - size.height - margin);

  return {
    x: clamp(position.x, margin, maxX),
    y: clamp(position.y, margin, maxY),
  };
};

export const LIGHT_DASHBOARD_GLASS_VARIABLES = {
  "--ether-glass-bg": "rgba(255, 255, 255, 0.64)",
  "--ether-glass-border": "rgba(255, 255, 255, 0.7)",
  "--ether-glass-blur": "22px",
  "--ether-glass-shadow":
    "0 14px 48px rgba(44, 58, 80, 0.088), 0 3px 16px rgba(44, 58, 80, 0.045), inset 0 1px 0 rgba(255, 255, 255, 0.68)",
  "--ether-overlay-panel": "rgba(255, 255, 255, 0.84)",
  "--ether-control-bg": "rgba(255, 255, 255, 0.66)",
  "--ether-control-hover": "rgba(255, 255, 255, 0.78)",
  "--ether-control-border": "#e7edf5",
};

export const DARK_DASHBOARD_GLASS_VARIABLES = {
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
};

const clampGlassIntensity = (intensity = 50) =>
  Math.max(0, Math.min(100, Number.isFinite(intensity) ? intensity : 50));

const interpolate = (min: number, max: number, intensity: number) =>
  min + (max - min) * (clampGlassIntensity(intensity) / 100);

const interpolateAroundMidpoint = (
  low: number,
  midpoint: number,
  high: number,
  intensity: number,
) => {
  const clamped = clampGlassIntensity(intensity);
  if (clamped <= 50) {
    return low + (midpoint - low) * (clamped / 50);
  }
  return midpoint + (high - midpoint) * ((clamped - 50) / 50);
};

const formatCssNumber = (value: number) => {
  const fixed = value.toFixed(3);
  return fixed.replace(/\.?0+$/, "");
};

const rgba = (rgb: string, alpha: number) =>
  `rgba(${rgb}, ${formatCssNumber(alpha)})`;

const buildLightGlassVariables = (intensity = 50) => ({
  "--ether-glass-bg": rgba("255, 255, 255", interpolate(0.88, 0.4, intensity)),
  "--ether-glass-border": rgba("255, 255, 255", interpolate(0.56, 0.84, intensity)),
  "--ether-glass-blur": `${formatCssNumber(interpolate(8, 36, intensity))}px`,
  "--ether-glass-shadow": `0 14px 48px ${rgba("44, 58, 80", interpolate(0.04, 0.135, intensity))}, 0 3px 16px ${rgba("44, 58, 80", interpolate(0.02, 0.07, intensity))}, inset 0 1px 0 ${rgba("255, 255, 255", interpolate(0.5, 0.86, intensity))}`,
  "--ether-overlay-panel": rgba("255, 255, 255", interpolate(0.94, 0.74, intensity)),
  "--ether-control-bg": rgba("255, 255, 255", interpolate(0.5, 0.82, intensity)),
  "--ether-control-hover": rgba("255, 255, 255", interpolate(0.64, 0.92, intensity)),
  "--ether-control-border": LIGHT_DASHBOARD_GLASS_VARIABLES["--ether-control-border"],
});

const buildDarkGlassVariables = (intensity = 50) => ({
  "--ether-surface": DARK_DASHBOARD_GLASS_VARIABLES["--ether-surface"],
  "--ether-surface-dim": DARK_DASHBOARD_GLASS_VARIABLES["--ether-surface-dim"],
  "--ether-surface-container-lowest": DARK_DASHBOARD_GLASS_VARIABLES["--ether-surface-container-lowest"],
  "--ether-surface-container-low": DARK_DASHBOARD_GLASS_VARIABLES["--ether-surface-container-low"],
  "--ether-surface-container": DARK_DASHBOARD_GLASS_VARIABLES["--ether-surface-container"],
  "--ether-surface-container-high": DARK_DASHBOARD_GLASS_VARIABLES["--ether-surface-container-high"],
  "--ether-surface-container-highest": DARK_DASHBOARD_GLASS_VARIABLES["--ether-surface-container-highest"],
  "--ether-surface-bright": DARK_DASHBOARD_GLASS_VARIABLES["--ether-surface-bright"],
  "--ether-on-surface": DARK_DASHBOARD_GLASS_VARIABLES["--ether-on-surface"],
  "--ether-on-surface-variant": DARK_DASHBOARD_GLASS_VARIABLES["--ether-on-surface-variant"],
  "--ether-outline": DARK_DASHBOARD_GLASS_VARIABLES["--ether-outline"],
  "--ether-outline-variant": DARK_DASHBOARD_GLASS_VARIABLES["--ether-outline-variant"],
  "--ether-glass-bg": rgba("25, 23, 19", interpolateAroundMidpoint(1, 0.92, 0.36, intensity)),
  "--ether-glass-border": rgba("255, 244, 225", interpolateAroundMidpoint(0.06, 0.1, 0.26, intensity)),
  "--ether-glass-blur": `${formatCssNumber(interpolateAroundMidpoint(0, 16, 42, intensity))}px`,
  "--ether-glass-shadow": `0 16px 44px ${rgba("0, 0, 0", interpolateAroundMidpoint(0.16, 0.28, 0.46, intensity))}`,
  "--ether-overlay-panel": DARK_DASHBOARD_GLASS_VARIABLES["--ether-overlay-panel"],
  "--ether-control-bg": DARK_DASHBOARD_GLASS_VARIABLES["--ether-control-bg"],
  "--ether-control-hover": DARK_DASHBOARD_GLASS_VARIABLES["--ether-control-hover"],
  "--ether-control-border": DARK_DASHBOARD_GLASS_VARIABLES["--ether-control-border"],
});

const buildAnimatedLightGlassVariables = (intensity = 50) => ({
  ...buildLightGlassVariables(intensity),
  "--ether-glass-bg": rgba("255, 255, 255", interpolate(0.82, 0.5, intensity)),
  "--ether-glass-blur": `${formatCssNumber(interpolate(4, 10, intensity))}px`,
  "--ether-overlay-panel": rgba("255, 255, 255", interpolate(0.9, 0.66, intensity)),
  "--ether-control-bg": rgba("255, 255, 255", interpolate(0.52, 0.74, intensity)),
  "--ether-control-hover": rgba("255, 255, 255", interpolate(0.66, 0.86, intensity)),
});

const buildAnimatedDarkGlassVariables = (intensity = 50) => ({
  ...buildDarkGlassVariables(intensity),
  "--ether-glass-bg": rgba("25, 23, 19", interpolateAroundMidpoint(1, 0.76, 0.42, intensity)),
  "--ether-glass-border": rgba("255, 244, 225", interpolateAroundMidpoint(0.06, 0.12, 0.24, intensity)),
  "--ether-glass-blur": `${formatCssNumber(interpolateAroundMidpoint(0, 8, 10, intensity))}px`,
  "--ether-glass-shadow": `0 16px 44px ${rgba("0, 0, 0", interpolateAroundMidpoint(0.16, 0.28, 0.42, intensity))}`,
});

export const SOLID_DASHBOARD_GLASS_VARIABLES = {
  light: {
    "--ether-glass-bg": "#ffffff",
    "--ether-glass-border": "#e7edf5",
    "--ether-glass-blur": "0px",
    "--ether-glass-shadow":
      "0 4px 20px rgba(44, 58, 80, 0.03), 0 18px 42px rgba(44, 58, 80, 0.04)",
    "--ether-overlay-panel": "#ffffff",
    "--ether-control-bg": "#fbfcff",
    "--ether-control-hover": "#ffffff",
    "--ether-control-border": "#e7edf5",
  },
  dark: {
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
    "--ether-glass-bg": "#191713",
    "--ether-glass-border": "rgba(255, 244, 225, 0.12)",
    "--ether-glass-blur": "0px",
    "--ether-glass-shadow": "0 16px 44px rgba(0, 0, 0, 0.22)",
    "--ether-overlay-panel": "#171512",
    "--ether-control-bg": "rgba(255, 244, 225, 0.055)",
    "--ether-control-hover": "rgba(255, 244, 225, 0.1)",
    "--ether-control-border": "rgba(255, 244, 225, 0.1)",
  },
};

export const getDashboardGlassVariables = (
  themeMode: "light" | "dark",
  enabled: boolean,
  intensity = 50,
) => {
  if (!enabled) return SOLID_DASHBOARD_GLASS_VARIABLES[themeMode];
  return themeMode === "light"
    ? buildLightGlassVariables(intensity)
    : buildDarkGlassVariables(intensity);
};

export const getDashboardAnimatedGlassVariables = (
  themeMode: "light" | "dark",
  enabled: boolean,
  intensity = 50,
) => {
  if (!enabled) return SOLID_DASHBOARD_GLASS_VARIABLES[themeMode];
  return themeMode === "light"
    ? buildAnimatedLightGlassVariables(intensity)
    : buildAnimatedDarkGlassVariables(intensity);
};

const DASHBOARD_WIDGET_GLASS_EFFECT_EXCLUDED_TYPES = new Set<DashboardWidgetType>([
  "ha_camera",
  "map",
  "sketch",
  "youtube_video",
]);

export const supportsDashboardWidgetGlassEffects = (
  type: DashboardWidgetType,
) => !DASHBOARD_WIDGET_GLASS_EFFECT_EXCLUDED_TYPES.has(type);

export const supportsDashboardWidgetChromeEffects = supportsDashboardWidgetGlassEffects;

export type WidgetActionMenuPosition = {
  left: number;
  top: number;
};

export type DashboardCreateWidgetOptions = {
  afterWidgetId?: string;
};

export const getClampedWidgetActionMenuPosition = ({
  anchorRect,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
}: {
  anchorRect: Pick<DOMRectReadOnly, "top" | "right" | "bottom">;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}): WidgetActionMenuPosition => {
  const availableWidth = Math.max(
    1,
    viewportWidth - WIDGET_ACTION_MENU_MARGIN * 2,
  );
  const boundedMenuWidth = Math.min(menuWidth, availableWidth);
  const maxLeft = Math.max(
    WIDGET_ACTION_MENU_MARGIN,
    viewportWidth - boundedMenuWidth - WIDGET_ACTION_MENU_MARGIN,
  );
  const preferredLeft = anchorRect.right - boundedMenuWidth;
  const belowTop = anchorRect.bottom + WIDGET_ACTION_MENU_GAP;
  const aboveTop = anchorRect.top - menuHeight - WIDGET_ACTION_MENU_GAP;
  const shouldOpenAbove =
    belowTop + menuHeight > viewportHeight - WIDGET_ACTION_MENU_MARGIN &&
    aboveTop >= WIDGET_ACTION_MENU_MARGIN;
  const maxTop = Math.max(
    WIDGET_ACTION_MENU_MARGIN,
    viewportHeight - menuHeight - WIDGET_ACTION_MENU_MARGIN,
  );

  return {
    left: clamp(preferredLeft, WIDGET_ACTION_MENU_MARGIN, maxLeft),
    top: clamp(
      shouldOpenAbove ? aboveTop : belowTop,
      WIDGET_ACTION_MENU_MARGIN,
      maxTop,
    ),
  };
};

export const matchesWidgetSearch = (type: DashboardWidgetType, query: string) => {
  if (!query.trim()) return true;
  const catalogItem = getDashboardCatalogItem(type);
  if (!catalogItem) return false;
  const haystack = [
    catalogItem.label,
    catalogItem.description,
    catalogItem.category,
    ...(catalogItem.keywords || []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
};

export const usesCoarsePointerInput = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return (
    window.matchMedia("(hover: none) and (pointer: coarse)").matches ||
    window.matchMedia("(pointer: coarse)").matches
  );
};

export const blurActiveDashboardInput = () => {
  if (typeof document === "undefined") return;
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement) {
    activeElement.blur();
  }
};

export const isDashboardEditableElement = (
  element: Element | null,
): element is HTMLElement => {
  if (!(element instanceof HTMLElement)) return false;
  const tagName = element.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || element.isContentEditable;
};

export const DASHBOARD_CARD_WIDGET_MAP: Record<string, DashboardWidgetType> = {
  image: "image_gallery",
  youtube: "youtube_video",
  music: "music",
  media: "music",
  weather: "weather",
  reminder: "reminders",
  list: "notes",
  note: "rich_note",
  richNote: "rich_note",
  stickyNote: "rich_note",
  table: "table",
  spreadsheet: "table",
  chore: "chores",
  gmail: "gmail",
  outlookMail: "outlook_mail",
  slack: "slack",
  calendar: "calendar",
  ical: "ical_calendar",
  icalCalendar: "ical_calendar",
  map: "map",
  places: "map",
  commute: "commute",
  news: "news",
  finance: "stock",
  quote: "quote",
  funFact: "fun_fact",
  astronomy: "astronomy",
  airQuality: "air_quality",
  timer: "timers",
  stopwatch: "stopwatch",
  alarm: "alarms",
  obsidianNote: "obsidian_notes",
  device: "ha_entities",
  thermostat: "ha_climate",
  climate: "ha_climate",
  cover: "ha_cover",
  shutter: "ha_cover",
  mediaPlayer: "ha_media_player",
  select: "ha_select",
  actionButton: "ha_button_stack",
  homeCalendar: "ha_calendar",
  vacuum: "ha_vacuum",
  printer: "ha_printer",
  energy: "ha_energy",
  camera: "ha_camera",
  sensorReading: "ha_sensor",
  homeStatus: "ha_entities",
  security: "ha_entities",
  flight: "commute",
};

export const getDisplayInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CU";
  return `${parts[0]?.[0] || "C"}${parts[1]?.[0] || ""}`.toUpperCase();
};

export const avatarFileToDataUrl = async (file: File): Promise<string> => {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Unable to process image."));
    img.src = rawDataUrl;
  });

  const square = Math.min(image.width, image.height);
  const sx = Math.max(0, (image.width - square) / 2);
  const sy = Math.max(0, (image.height - square) / 2);
  const size = 192;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    return rawDataUrl;
  }
  context.drawImage(image, sx, sy, square, square, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.86);
};
