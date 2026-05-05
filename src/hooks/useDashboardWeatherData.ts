import { useEffect, useMemo, useState } from 'react';
import { useLowPowerMode } from '../utils/settingsStorage';
import type { AqiData, WeatherData } from '../services/weatherService';
import { getUnifiedWeather } from '../services/weatherService';
import {
  getDashboardRefreshEventName,
  getDashboardRefreshPolicy,
} from '../services/dashboardRefresh';
import type { DashboardWidgetConfig, DashboardWidgetType } from '../services/dashboardTypes';

interface UseDashboardWeatherDataInput {
  widgetId?: string;
  widgetType?: DashboardWidgetType;
  city?: string;
  fallbackWeather: WeatherData | null;
  fallbackAqi: AqiData | null;
  refreshMode?: DashboardWidgetConfig['refreshMode'];
  refreshIntervalMinutes?: number;
}

interface UseDashboardWeatherDataResult {
  weather: WeatherData | null;
  aqi: AqiData | null;
  loading: boolean;
}

export const useDashboardWeatherData = ({
  widgetId,
  widgetType = 'weather',
  city,
  fallbackWeather,
  fallbackAqi,
  refreshMode,
  refreshIntervalMinutes,
}: UseDashboardWeatherDataInput): UseDashboardWeatherDataResult => {
  const lowPowerMode = useLowPowerMode();
  const normalizedCity = city?.trim() || '';
  const usesFallback = !normalizedCity
    || normalizedCity.toLowerCase() === (fallbackWeather?.city || '').toLowerCase();

  const [weather, setWeather] = useState<WeatherData | null>(usesFallback ? fallbackWeather : null);
  const [aqi, setAqi] = useState<AqiData | null>(usesFallback ? fallbackAqi : null);
  const [loading, setLoading] = useState(!usesFallback && Boolean(normalizedCity));
  const refreshPolicy = useMemo(
    () =>
      getDashboardRefreshPolicy(widgetType, {
        refreshMode,
        refreshIntervalMinutes,
      }),
    [refreshIntervalMinutes, refreshMode, widgetType],
  );

  useEffect(() => {
    if (usesFallback) {
      setWeather(fallbackWeather);
      setAqi(fallbackAqi);
      setLoading(false);
      return;
    }

    if (!normalizedCity) {
      setWeather(null);
      setAqi(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let activeController: AbortController | null = null;

    const load = async (forceRefresh: boolean) => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      if (!forceRefresh) {
        setLoading(true);
      }
      try {
        const result = await getUnifiedWeather(normalizedCity, lowPowerMode, forceRefresh);
        if (!cancelled && !controller.signal.aborted) {
          setWeather(result.weather);
          setAqi(result.aqi);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn('[useDashboardWeatherData] Failed to load weather override:', error);
        }
      } finally {
        if (activeController === controller) {
          activeController = null;
        }
        if (!cancelled && !controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void load(false);
    const intervalId =
      refreshPolicy.shouldPoll && refreshPolicy.intervalMs
        ? window.setInterval(() => {
            void load(true);
          }, refreshPolicy.intervalMs)
        : null;
    const eventName = widgetId ? getDashboardRefreshEventName(widgetId) : null;
    const handleManualRefresh = () => {
      void load(true);
    };
    if (eventName) {
      window.addEventListener(eventName, handleManualRefresh);
    }

    return () => {
      cancelled = true;
      activeController?.abort();
      if (intervalId) window.clearInterval(intervalId);
      if (eventName) {
        window.removeEventListener(eventName, handleManualRefresh);
      }
    };
  }, [
    fallbackAqi,
    fallbackWeather,
    lowPowerMode,
    normalizedCity,
    refreshPolicy.intervalMs,
    refreshPolicy.shouldPoll,
    usesFallback,
    widgetId,
  ]);

  return useMemo(() => ({
    weather,
    aqi,
    loading,
  }), [aqi, loading, weather]);
};
