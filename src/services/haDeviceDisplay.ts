import type { DashboardWidgetConfig, DashboardWidgetType } from './dashboardTypes';

export type DashboardHaDeviceIcon =
  | 'auto'
  | 'lightbulb'
  | 'lamp'
  | 'thermometer'
  | 'droplets'
  | 'power'
  | 'motion'
  | 'sun'
  | 'door'
  | 'gauge'
  | 'home'
  | 'fan'
  | 'flame'
  | 'switch'
  | 'outlet'
  | 'button';

export type DashboardHaDisplaySize = 'compact' | 'standard' | 'large';

export interface HaDeviceDisplayOption<T extends string> {
  value: T;
  label: string;
}

export interface HaDeviceDisplaySettings {
  displayName: string;
  icon: DashboardHaDeviceIcon;
  displaySize: DashboardHaDisplaySize;
}

export const HA_DEVICE_ICON_OPTIONS: Array<HaDeviceDisplayOption<DashboardHaDeviceIcon>> = [
  { value: 'auto', label: 'Auto' },
  { value: 'lightbulb', label: 'Bulb' },
  { value: 'lamp', label: 'Lamp' },
  { value: 'thermometer', label: 'Temp' },
  { value: 'droplets', label: 'Water' },
  { value: 'power', label: 'Power' },
  { value: 'motion', label: 'Motion' },
  { value: 'sun', label: 'Light' },
  { value: 'door', label: 'Door' },
  { value: 'gauge', label: 'Gauge' },
  { value: 'home', label: 'Home' },
  { value: 'fan', label: 'Fan' },
  { value: 'flame', label: 'Heat' },
  { value: 'switch', label: 'Switch' },
  { value: 'outlet', label: 'Outlet' },
  { value: 'button', label: 'Button' },
];

export const HA_DEVICE_SIZE_OPTIONS: Array<HaDeviceDisplayOption<DashboardHaDisplaySize>> = [
  { value: 'compact', label: 'Compact' },
  { value: 'standard', label: 'Standard' },
  { value: 'large', label: 'Large' },
];

const ICON_VALUES = new Set<DashboardHaDeviceIcon>(
  HA_DEVICE_ICON_OPTIONS.map((option) => option.value),
);
const SIZE_VALUES = new Set<DashboardHaDisplaySize>(
  HA_DEVICE_SIZE_OPTIONS.map((option) => option.value),
);

export interface HaDeviceDisplayContext {
  widgetType?: DashboardWidgetType;
  entityId?: string;
}

const LIGHT_ICON_VALUES: DashboardHaDeviceIcon[] = ['auto', 'lightbulb', 'lamp', 'sun'];
const SENSOR_ICON_VALUES: DashboardHaDeviceIcon[] = [
  'auto',
  'thermometer',
  'droplets',
  'power',
  'motion',
  'sun',
  'door',
  'gauge',
  'fan',
  'flame',
];
const SWITCH_ICON_VALUES: DashboardHaDeviceIcon[] = ['auto', 'switch', 'power', 'outlet', 'button'];
const ACTION_ICON_VALUES: DashboardHaDeviceIcon[] = ['auto', 'button', 'switch', 'power', 'outlet'];

const getEntityDomain = (entityId?: string) => entityId?.split('.')[0]?.toLowerCase() || '';

const getIconValuesForContext = (context?: HaDeviceDisplayContext): DashboardHaDeviceIcon[] => {
  const domain = getEntityDomain(context?.entityId);
  if (context?.widgetType === 'ha_light' || domain === 'light') {
    return LIGHT_ICON_VALUES;
  }
  if (context?.widgetType === 'ha_sensor' || domain === 'sensor' || domain === 'binary_sensor') {
    return SENSOR_ICON_VALUES;
  }
  if (
    domain === 'switch' ||
    domain === 'input_boolean' ||
    context?.widgetType === 'ha_button_stack'
  ) {
    if (domain === 'button' || domain === 'scene' || domain === 'script') {
      return ACTION_ICON_VALUES;
    }
    return SWITCH_ICON_VALUES;
  }
  return HA_DEVICE_ICON_OPTIONS.map((option) => option.value);
};

const normalizeIcon = (
  requested: DashboardWidgetConfig['haDeviceIcon'],
  fallback: DashboardHaDeviceIcon,
  context?: HaDeviceDisplayContext,
): DashboardHaDeviceIcon => {
  const allowedIcons = new Set(getIconValuesForContext(context));
  if (requested && ICON_VALUES.has(requested) && allowedIcons.has(requested)) {
    return requested === 'auto' ? fallback : requested;
  }
  return fallback;
};

const normalizeSize = (
  requested: DashboardWidgetConfig['haDisplaySize'],
): DashboardHaDisplaySize => {
  if (requested && SIZE_VALUES.has(requested)) {
    return requested;
  }
  return 'standard';
};

export const getHaDeviceDisplaySettings = (
  config: Pick<DashboardWidgetConfig, 'displayName' | 'haDeviceIcon' | 'haDisplaySize'> | undefined,
  fallback: { fallbackName: string; fallbackIcon: DashboardHaDeviceIcon },
  context?: HaDeviceDisplayContext,
): HaDeviceDisplaySettings => {
  const displayName = config?.displayName?.trim() || fallback.fallbackName;
  return {
    displayName,
    icon: normalizeIcon(config?.haDeviceIcon, fallback.fallbackIcon, context),
    displaySize: normalizeSize(config?.haDisplaySize),
  };
};

export const shouldShowHaLiveBadge = (
  config: Pick<DashboardWidgetConfig, 'haShowLiveBadge'> | undefined,
): boolean => config?.haShowLiveBadge === true;

export const getHaDeviceDisplayOptions = (context?: HaDeviceDisplayContext) => ({
  icons: getIconValuesForContext(context)
    .map((value) => HA_DEVICE_ICON_OPTIONS.find((option) => option.value === value))
    .filter((option): option is HaDeviceDisplayOption<DashboardHaDeviceIcon> => Boolean(option)),
  sizes: HA_DEVICE_SIZE_OPTIONS,
});
