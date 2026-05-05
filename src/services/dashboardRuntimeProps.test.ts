import { describe, expect, it } from 'vitest';

import { getDashboardRuntimePropsForWidget } from './dashboardRuntimeProps';
import type { AqiData, WeatherData } from './weatherService';

const weather = { city: 'Sample City', tempF: 55 } as WeatherData;
const aqi = { aqi: 24 } as AqiData;

describe('dashboardRuntimeProps', () => {
  it('passes weather data only to widgets that consume weather context', () => {
    expect(getDashboardRuntimePropsForWidget('weather', { weather, aqi }).weather).toBe(weather);
    expect(getDashboardRuntimePropsForWidget('map', { weather, aqi }).weather).toBe(weather);
    expect(getDashboardRuntimePropsForWidget('tasks', { weather, aqi }).weather).toBeNull();
    expect(getDashboardRuntimePropsForWidget('sketch', { weather, aqi }).aqi).toBeNull();
  });

  it('passes profile session data only to profile-aware widgets', () => {
    const runtime = {
      activeProfileName: 'Demo User',
      activeProfileId: 'profile_1',
      recognizedBy: 'voice',
      updatedAt: 1234,
    } as const;

    expect(getDashboardRuntimePropsForWidget('profile', runtime)).toMatchObject(runtime);
    expect(getDashboardRuntimePropsForWidget('daily_summary', runtime).activeProfileName).toBe('Demo User');
    expect(getDashboardRuntimePropsForWidget('greeting', runtime).activeProfileName).toBe('Demo User');
    expect(getDashboardRuntimePropsForWidget('tasks', runtime)).toMatchObject({
      activeProfileName: null,
      activeProfileId: null,
      recognizedBy: null,
      updatedAt: undefined,
    });
  });
});
