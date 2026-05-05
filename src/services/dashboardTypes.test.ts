import { describe, expect, it } from 'vitest';
import {
  clampWidgetDimensions,
  DEFAULT_DASHBOARD_WIDGETS,
  getWidgetSizeBounds,
  getWidgetDefaultGridSize,
  WIDGET_CATALOG,
  createDashboardWidget,
  type DashboardWidgetType,
} from './dashboardTypes';

const denseDefaultSizes: Partial<Record<DashboardWidgetType, { w: number; h: number }>> = {
  daily_summary: { w: 4, h: 3 },
  ha_entities: { w: 3, h: 3 },
  music: { w: 3, h: 3 },
  profile: { w: 2, h: 3 },
  quick_actions: { w: 3, h: 3 },
  stopwatch: { w: 2, h: 3 },
  tasks: { w: 2, h: 3 },
  weather: { w: 3, h: 3 },
  world_clock: { w: 3, h: 3 },
};

const noTinyResizeWidgets: DashboardWidgetType[] = [
  'ha_light',
  'ha_sensor',
  'stock',
];

const threeRowMinimumWidgets: DashboardWidgetType[] = [
  'forecast',
];

describe('dashboard widget sizing defaults', () => {
  it('starts dense widgets large enough for their primary content', () => {
    Object.entries(denseDefaultSizes).forEach(([type, expected]) => {
      expect(getWidgetDefaultGridSize(type as DashboardWidgetType)).toEqual(expected);
    });
  });

  it('keeps every catalog default within the widget bounds', () => {
    WIDGET_CATALOG.forEach((item) => {
      const size = getWidgetDefaultGridSize(item.type, item.defaultSize);
      expect(size.w).toBeGreaterThanOrEqual(item.minW ?? 1);
      expect(size.h).toBeGreaterThanOrEqual(item.minH ?? 1);
      if (item.maxW) expect(size.w).toBeLessThanOrEqual(item.maxW);
      if (item.maxH) expect(size.h).toBeLessThanOrEqual(item.maxH);
    });
  });

  it('uses the content-safe defaults for starter dashboard widgets', () => {
    denseDefaultSizes.profile && expect(
      DEFAULT_DASHBOARD_WIDGETS.find((widget) => widget.type === 'profile')?.config,
    ).toMatchObject(denseDefaultSizes.profile);
    denseDefaultSizes.daily_summary && expect(
      DEFAULT_DASHBOARD_WIDGETS.find((widget) => widget.type === 'daily_summary')?.config,
    ).toMatchObject(denseDefaultSizes.daily_summary);
    denseDefaultSizes.music && expect(
      DEFAULT_DASHBOARD_WIDGETS.find((widget) => widget.type === 'music')?.config,
    ).toMatchObject(denseDefaultSizes.music);
    denseDefaultSizes.tasks && expect(
      DEFAULT_DASHBOARD_WIDGETS.find((widget) => widget.type === 'tasks')?.config,
    ).toMatchObject(denseDefaultSizes.tasks);
    denseDefaultSizes.weather && expect(
      DEFAULT_DASHBOARD_WIDGETS.find((widget) => widget.type === 'weather')?.config,
    ).toMatchObject(denseDefaultSizes.weather);
  });

  it('prevents content-heavy compact widgets from being resized below readable bounds', () => {
    noTinyResizeWidgets.forEach((type) => {
      expect(getWidgetSizeBounds(type).minW).toBeGreaterThanOrEqual(2);
      expect(getWidgetSizeBounds(type).minH).toBeGreaterThanOrEqual(2);
      expect(clampWidgetDimensions(type, 1, 1, 8)).toEqual({ w: 2, h: 2 });
    });
  });

  it('keeps multi-section widgets from collapsing below a three-row layout', () => {
    threeRowMinimumWidgets.forEach((type) => {
      expect(getWidgetSizeBounds(type).minW).toBeGreaterThanOrEqual(2);
      expect(getWidgetSizeBounds(type).minH).toBeGreaterThanOrEqual(3);
      expect(clampWidgetDimensions(type, 1, 1, 8).h).toBe(3);
    });
  });

  it('uses the weather outlook catalog identity for forecasts', () => {
    expect(WIDGET_CATALOG.find((item) => item.type === 'forecast')).toMatchObject({
      label: 'Weather Outlook',
      icon: '🌦',
      description: 'Five-day outlook across multiple tracked cities.',
    });
  });

  it('registers the AI chat widget as a resizable communication surface', () => {
    expect(WIDGET_CATALOG.find((item) => item.type === 'ai_chat')).toMatchObject({
      label: 'AI Chat',
      category: 'Communication',
      defaultSize: 'xlarge',
      minW: 3,
      minH: 3,
      maxW: 8,
      maxH: 7,
    });
    expect(getWidgetDefaultGridSize('ai_chat')).toEqual({ w: 4, h: 4 });
    expect(clampWidgetDimensions('ai_chat', 1, 1, 8)).toEqual({ w: 3, h: 3 });
  });

  it('allows the current weather widget to grow into a wide forecast panel', () => {
    expect(getWidgetSizeBounds('weather')).toMatchObject({
      minW: 2,
      minH: 2,
      maxW: 6,
      maxH: 6,
    });
    expect(clampWidgetDimensions('weather', 6, 6, 8)).toEqual({ w: 6, h: 6 });
  });

  it('allows welcome and operator widgets to resize down to compact cards', () => {
    expect(getWidgetSizeBounds('daily_summary')).toMatchObject({ minW: 2, minH: 2 });
    expect(clampWidgetDimensions('daily_summary', 1, 1, 8)).toEqual({ w: 2, h: 2 });

    expect(getWidgetSizeBounds('profile')).toMatchObject({ minW: 1, minH: 1 });
    expect(clampWidgetDimensions('profile', 1, 1, 8)).toEqual({ w: 1, h: 1 });
  });

  it('allows the portfolio widget to resize down to a 1x1 total tile', () => {
    expect(WIDGET_CATALOG.find((item) => item.type === 'portfolio')).toMatchObject({
      minW: 1,
      minH: 1,
    });
    expect(getWidgetSizeBounds('portfolio')).toMatchObject({ minW: 1, minH: 1 });
    expect(clampWidgetDimensions('portfolio', 1, 1, 8)).toEqual({ w: 1, h: 1 });
  });

  it('allows the stopwatch widget to resize down to a 1x1 elapsed-time tile', () => {
    expect(WIDGET_CATALOG.find((item) => item.type === 'stopwatch')).toMatchObject({
      minW: 1,
      minH: 1,
    });
    expect(getWidgetSizeBounds('stopwatch')).toMatchObject({ minW: 1, minH: 1 });
    expect(clampWidgetDimensions('stopwatch', 1, 1, 8)).toEqual({ w: 1, h: 1 });
  });

  it('starts newly created robot widgets in floating mode', () => {
    expect(createDashboardWidget('robot_face', 0).config).toMatchObject({
      robotFloatingEnabled: true,
    });
  });
});
