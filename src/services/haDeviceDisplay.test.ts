import { describe, expect, it } from 'vitest';

import {
  getHaDeviceDisplayOptions,
  getHaDeviceDisplaySettings,
  shouldShowHaLiveBadge,
} from './haDeviceDisplay';

describe('haDeviceDisplay', () => {
  it('uses custom names and sane defaults for HA device cards', () => {
    const settings = getHaDeviceDisplaySettings(
      { displayName: 'Kitchen Counter', haDeviceIcon: 'lamp', haDisplaySize: 'large' },
      { fallbackName: 'Light.Kitchen', fallbackIcon: 'lightbulb' },
    );

    expect(settings.displayName).toBe('Kitchen Counter');
    expect(settings.icon).toBe('lamp');
    expect(settings.displaySize).toBe('large');
  });

  it('falls back when custom display values are empty or unsupported', () => {
    const settings = getHaDeviceDisplaySettings(
      { displayName: '   ', haDeviceIcon: 'spaceship' as never, haDisplaySize: 'giant' as never },
      { fallbackName: 'Office Temperature', fallbackIcon: 'thermometer' },
    );

    expect(settings.displayName).toBe('Office Temperature');
    expect(settings.icon).toBe('thermometer');
    expect(settings.displaySize).toBe('standard');
  });

  it('does not show the sensor live badge unless the user enables it', () => {
    expect(shouldShowHaLiveBadge({})).toBe(false);
    expect(shouldShowHaLiveBadge({ haShowLiveBadge: true })).toBe(true);
  });

  it('exposes supported prebuilt icon and size options', () => {
    const options = getHaDeviceDisplayOptions();

    expect(options.icons.map((icon) => icon.value)).toContain('auto');
    expect(options.icons.map((icon) => icon.value)).toContain('thermometer');
    expect(options.sizes.map((size) => size.value)).toEqual(['compact', 'standard', 'large']);
  });

  it('filters light widgets to light-related icon choices', () => {
    const iconValues = getHaDeviceDisplayOptions({ widgetType: 'ha_light' }).icons.map((icon) => icon.value);

    expect(iconValues).toEqual(['auto', 'lightbulb', 'lamp', 'sun']);
    expect(iconValues).not.toContain('thermometer');
    expect(iconValues).not.toContain('door');
  });

  it('falls back when a saved icon is unrelated to the HA widget type', () => {
    const settings = getHaDeviceDisplaySettings(
      { displayName: 'Desk', haDeviceIcon: 'thermometer' },
      { fallbackName: 'Desk Lamp', fallbackIcon: 'lightbulb' },
      { widgetType: 'ha_light' },
    );

    expect(settings.icon).toBe('lightbulb');
  });

  it('filters sensor widgets to sensor-related icon choices', () => {
    const iconValues = getHaDeviceDisplayOptions({ widgetType: 'ha_sensor' }).icons.map((icon) => icon.value);

    expect(iconValues).toEqual([
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
    ]);
    expect(iconValues).not.toContain('lamp');
  });

  it('filters switch-like HA widgets using selected entity domain when available', () => {
    const switchIcons = getHaDeviceDisplayOptions({
      widgetType: 'ha_button_stack',
      entityId: 'switch.espresso_machine',
    }).icons.map((icon) => icon.value);
    const lightIcons = getHaDeviceDisplayOptions({
      widgetType: 'ha_button_stack',
      entityId: 'light.desk_lamp',
    }).icons.map((icon) => icon.value);

    expect(switchIcons).toEqual(['auto', 'switch', 'power', 'outlet', 'button']);
    expect(switchIcons).not.toContain('thermometer');
    expect(lightIcons).toEqual(['auto', 'lightbulb', 'lamp', 'sun']);
  });
});
