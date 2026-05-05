import {
  clampWidgetDimensions,
  type DashboardWidget,
} from '../../../services/dashboardTypes';

export interface DashboardGridMetrics {
  columns: number;
  columnWidth: number;
  rowHeight: number;
  gap: number;
}

export interface PackedDashboardItem {
  widget: DashboardWidget;
  x: number;
  y: number;
  w: number;
  h: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const snapValue = (value: number, step: number) => {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
};

const SINGLE_COLUMN_MIN_ROWS: Partial<Record<DashboardWidget['type'], number>> = {
  daily_summary: 2,
};

const fitsAt = (
  occupied: boolean[][],
  x: number,
  y: number,
  w: number,
  h: number,
  columns: number,
) => {
  if (x < 0 || x + w > columns) return false;

  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) {
      if (occupied[row]?.[col]) {
        return false;
      }
    }
  }

  return true;
};

const markCells = (
  occupied: boolean[][],
  x: number,
  y: number,
  w: number,
  h: number,
) => {
  for (let row = y; row < y + h; row += 1) {
    if (!occupied[row]) {
      occupied[row] = [];
    }
    for (let col = x; col < x + w; col += 1) {
      occupied[row][col] = true;
    }
  }
};

export const getWidgetGridDimensions = (widget: DashboardWidget, columns: number) => {
  const requestedW = Number(widget.config?.w ?? 2);
  const requestedH = Number(widget.config?.h ?? 2);
  const clamped = clampWidgetDimensions(widget.type, requestedW, requestedH, columns);
  if (columns === 1) {
    return {
      ...clamped,
      h: Math.max(clamped.h, SINGLE_COLUMN_MIN_ROWS[widget.type] ?? clamped.h),
    };
  }
  return clamped;
};

export const packDashboardGrid = (
  widgets: DashboardWidget[],
  metrics: DashboardGridMetrics,
): PackedDashboardItem[] => {
  const occupied: boolean[][] = [];
  const items: PackedDashboardItem[] = [];

  widgets.forEach((widget) => {
    const { w, h } = getWidgetGridDimensions(widget, metrics.columns);

    let placedX = 0;
    let placedY = 0;
    let placed = false;

    for (let row = 0; row < 200 && !placed; row += 1) {
      for (let col = 0; col <= metrics.columns - w; col += 1) {
        if (!fitsAt(occupied, col, row, w, h, metrics.columns)) {
          continue;
        }
        placedX = col;
        placedY = row;
        markCells(occupied, col, row, w, h);
        placed = true;
        break;
      }
    }

    const left = placedX * (metrics.columnWidth + metrics.gap);
    const top = placedY * (metrics.rowHeight + metrics.gap);
    const width = metrics.columnWidth * w + metrics.gap * (w - 1);
    const height = metrics.rowHeight * h + metrics.gap * (h - 1);

    items.push({
      widget,
      x: placedX,
      y: placedY,
      w,
      h,
      left,
      top,
      width,
      height,
    });
  });

  return items;
};

export const getPackedBoardHeight = (items: PackedDashboardItem[], metrics: DashboardGridMetrics) => {
  const maxBottom = items.reduce((highest, item) => Math.max(highest, item.y + item.h), 0);
  if (maxBottom === 0) {
    return metrics.rowHeight;
  }
  return maxBottom * metrics.rowHeight + Math.max(0, maxBottom - 1) * metrics.gap;
};

export const buildFreeformRectFromPackedItem = (item: PackedDashboardItem) => ({
  x: item.left,
  y: item.top,
  w: item.width,
  h: item.height,
  z: 1,
});

export const buildDefaultFreeformRect = (
  widget: DashboardWidget,
  index: number,
  metrics: DashboardGridMetrics,
) => {
  const { w, h } = getWidgetGridDimensions(widget, metrics.columns);
  const width = metrics.columnWidth * w + metrics.gap * (w - 1);
  const height = metrics.rowHeight * h + metrics.gap * (h - 1);
  const lane = index % Math.max(1, Math.min(3, metrics.columns));
  const row = Math.floor(index / Math.max(1, Math.min(3, metrics.columns)));

  return {
    x: lane * (metrics.columnWidth * 2 + metrics.gap * 2),
    y: row * (metrics.rowHeight * 2 + metrics.gap * 2),
    w: width,
    h: height,
    z: 1,
  };
};

export const reorderWidgets = (
  widgets: DashboardWidget[],
  activeId: string,
  targetIndex: number,
) => {
  const currentIndex = widgets.findIndex((widget) => widget.id === activeId);
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= widgets.length) {
    return widgets;
  }

  const next = widgets.slice();
  const [moved] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, moved);

  return next.map((widget, index) => ({ ...widget, position: index }));
};

export const estimateGridSpan = (pixels: number, trackSize: number, gap: number) => {
  const step = Math.max(1, trackSize + gap);
  return Math.max(1, Math.round((pixels + gap) / step));
};

export const shouldFloatWidgetInGrid = (widget: DashboardWidget) =>
  widget.type === "rich_note" && widget.config.richNotePinnedToGrid !== true;
