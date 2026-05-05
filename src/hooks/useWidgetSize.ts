import { createContext, useContext, useMemo } from 'react';
import type { DashboardWidget } from '../services/dashboardTypes';

export type WidgetSizeClass = 'tiny' | 'small' | 'medium' | 'large' | 'xlarge';

export interface DashboardWidgetFrameInfo {
  pixelWidth: number;
  pixelHeight: number;
  gridWidth?: number;
  gridHeight?: number;
}

export interface WidgetSizeInfo {
  w: number;
  h: number;
  area: number;
  sizeClass: WidgetSizeClass;
  isWide: boolean;   // w >= 3
  isTall: boolean;   // h >= 3
  isCompact: boolean; // w <= 2 && h <= 2
  pixelWidth: number;
  pixelHeight: number;
}

export const DashboardWidgetFrameContext = createContext<DashboardWidgetFrameInfo | null>(null);

const SIZE_CLASS_ORDER: WidgetSizeClass[] = ['tiny', 'small', 'medium', 'large', 'xlarge'];

const getAreaSizeClass = (area: number): WidgetSizeClass => {
  if (area <= 2) return 'tiny';
  if (area <= 4) return 'small';
  if (area <= 8) return 'medium';
  if (area <= 16) return 'large';
  return 'xlarge';
};

const getWidthSizeClass = (width: number): WidgetSizeClass => {
  if (width <= 220) return 'tiny';
  if (width <= 320) return 'small';
  if (width <= 520) return 'medium';
  if (width <= 760) return 'large';
  return 'xlarge';
};

const getHeightSizeClass = (height: number): WidgetSizeClass => {
  if (height <= 140) return 'tiny';
  if (height <= 220) return 'small';
  if (height <= 360) return 'medium';
  if (height <= 520) return 'large';
  return 'xlarge';
};

const getMostConstrainedSizeClass = (...classes: WidgetSizeClass[]): WidgetSizeClass => {
  const constrainedIndex = Math.min(...classes.map((value) => SIZE_CLASS_ORDER.indexOf(value)));
  return SIZE_CLASS_ORDER[Math.max(0, constrainedIndex)] ?? 'medium';
};

// Returns a stable, memoized size descriptor so widgets can adapt content to available space.
// One concern per hook: classify, don't render.
export const useWidgetSize = (widget: DashboardWidget): WidgetSizeInfo => {
  const frame = useContext(DashboardWidgetFrameContext);

  return useMemo(() => {
    const freeform = widget.layout?.freeform;
    const fallbackWidth = freeform ? Math.max(1, Math.round(freeform.w / 180)) : 2;
    const fallbackHeight = freeform ? Math.max(1, Math.round(freeform.h / 120)) : 2;
    const w = Math.max(1, Math.min(16, Number(frame?.gridWidth ?? widget.config?.w ?? fallbackWidth)));
    const h = Math.max(1, Math.min(16, Number(frame?.gridHeight ?? widget.config?.h ?? fallbackHeight)));
    const area = w * h;
    const pixelWidth = Math.max(0, Number(frame?.pixelWidth ?? freeform?.w ?? w * 180));
    const pixelHeight = Math.max(0, Number(frame?.pixelHeight ?? freeform?.h ?? h * 120));

    const pixelDrivenSizeClass = getMostConstrainedSizeClass(
      getWidthSizeClass(pixelWidth),
      getHeightSizeClass(pixelHeight),
    );
    const sizeClass = frame
      ? pixelDrivenSizeClass
      : getMostConstrainedSizeClass(
          getAreaSizeClass(area),
          pixelDrivenSizeClass,
        );
    const isCompact = sizeClass === 'tiny' || sizeClass === 'small' || (w <= 2 && h <= 2);

    return {
      w,
      h,
      area,
      sizeClass,
      isWide: w >= 3 || pixelWidth >= 420,
      isTall: h >= 3 || pixelHeight >= 320,
      isCompact,
      pixelWidth,
      pixelHeight,
    };
  }, [
    frame?.gridHeight,
    frame?.gridWidth,
    frame?.pixelHeight,
    frame?.pixelWidth,
    widget.config?.h,
    widget.config?.w,
    widget.layout?.freeform?.h,
    widget.layout?.freeform?.w,
  ]);
};
