import type { DashboardWidgetType } from './dashboardTypes';
import type { SpeakerIdentityModality } from './speakerIdentity';
import type { AqiData, WeatherData } from './weatherService';

interface DashboardRuntimeInput {
  weather?: WeatherData | null;
  aqi?: AqiData | null;
  activeProfileName?: string | null;
  activeProfileId?: string | null;
  recognizedBy?: SpeakerIdentityModality | null;
  updatedAt?: number;
}

const WEATHER_AWARE_WIDGETS = new Set<DashboardWidgetType>([
  'weather',
  'forecast',
  'air_quality',
  'astronomy',
  'daily_summary',
  'map',
  'commute',
]);

const PROFILE_NAME_AWARE_WIDGETS = new Set<DashboardWidgetType>([
  'profile',
  'greeting',
  'daily_summary',
]);

const PROFILE_STATUS_AWARE_WIDGETS = new Set<DashboardWidgetType>([
  'profile',
]);

export const getDashboardRuntimePropsForWidget = (
  type: DashboardWidgetType,
  runtime: DashboardRuntimeInput,
) => {
  const needsWeather = WEATHER_AWARE_WIDGETS.has(type);
  const needsProfileName = PROFILE_NAME_AWARE_WIDGETS.has(type);
  const needsProfileStatus = PROFILE_STATUS_AWARE_WIDGETS.has(type);

  return {
    weather: needsWeather ? (runtime.weather ?? null) : null,
    aqi: needsWeather ? (runtime.aqi ?? null) : null,
    activeProfileName: needsProfileName ? (runtime.activeProfileName ?? null) : null,
    activeProfileId: needsProfileName || needsProfileStatus ? (runtime.activeProfileId ?? null) : null,
    recognizedBy: needsProfileStatus ? (runtime.recognizedBy ?? null) : null,
    updatedAt: needsProfileStatus ? runtime.updatedAt : undefined,
  };
};
