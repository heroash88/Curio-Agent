import { useCallback, useEffect, useRef, useState } from 'react';
import { getUnifiedWeather, FULL_POWER_CACHE_MAX_AGE_MS } from '../services/weatherService';
import type { WeatherData, AqiData } from '../services/weatherService';

interface UseWeatherLoaderInput {
    weatherCity: string;
    tempUnit: string;
    lowPowerMode: boolean;
    isConnected: boolean;
    allowHighFrequencyRefresh: boolean;
}

interface WeatherSnapshot {
    city: string;
    tempUnit: string;
    weather: WeatherData | null;
    aqi: AqiData | null;
}

interface UseWeatherLoaderResult {
    currentWeather: WeatherData | null;
    currentAqi: AqiData | null;
    activeCity: string;
    /** Trigger a manual refresh (e.g. from settings). */
    refreshWeather: () => void;
    /**
     * Returns a stable snapshot of the latest weather data for use in
     * callbacks/closures that shouldn't depend on React render state.
     */
    getWeatherSnapshot: () => WeatherSnapshot;
}

/**
 * Extracted weather loading logic from CurioAgentMode.
 *
 * Manages:
 * - Initial weather fetch
 * - Manual refresh via `refreshWeather()`
 * - High-frequency polling when allowed by runtime profile
 * - Re-fetch on Live API connect (with 60s debounce)
 * - Stable snapshot getter for AI tool handler closures
 */
export const useWeatherLoader = ({
    weatherCity,
    tempUnit,
    lowPowerMode,
    isConnected,
    allowHighFrequencyRefresh,
}: UseWeatherLoaderInput): UseWeatherLoaderResult => {
    const [weatherRefreshToken, setWeatherRefreshToken] = useState(0);
    const [resolvedCity, setResolvedCity] = useState('');
    const [currentWeather, setCurrentWeather] = useState<WeatherData | null>(null);
    const [currentAqi, setCurrentAqi] = useState<AqiData | null>(null);

    const activeCity = weatherCity || resolvedCity;

    // Refs for stable access in closures (AI tool handler, etc.)
    const activeCityRef = useRef(activeCity);
    const currentWeatherRef = useRef(currentWeather);
    const currentAqiRef = useRef(currentAqi);
    const tempUnitRef = useRef(tempUnit);

    useEffect(() => {
        activeCityRef.current = activeCity;
        currentWeatherRef.current = currentWeather;
        currentAqiRef.current = currentAqi;
        tempUnitRef.current = tempUnit;
    }, [activeCity, currentAqi, currentWeather, tempUnit]);

    const weatherRequestSequenceRef = useRef(0);
    const weatherRefreshTokenRef = useRef(weatherRefreshToken);
    const wasConnectedRef = useRef(isConnected);
    const lastWeatherFetchAtRef = useRef(0);

    const loadWeather = useCallback(async (forceRefresh: boolean) => {
        // Skip if we fetched recently (within 60s) unless forced
        const now = Date.now();
        if (!forceRefresh && now - lastWeatherFetchAtRef.current < 60_000) {
            return;
        }

        const sequence = ++weatherRequestSequenceRef.current;

        try {
            const { weather, aqi } = await getUnifiedWeather(weatherCity, lowPowerMode, forceRefresh);

            if (sequence !== weatherRequestSequenceRef.current) {
                return;
            }

            lastWeatherFetchAtRef.current = Date.now();
            setCurrentWeather(weather);
            setCurrentAqi(aqi);

            if (!weatherCity && weather?.city) {
                setResolvedCity(weather.city);
            }
        } catch (err) {
            console.error('[useWeatherLoader] Failed to load weather:', err);
        }
    }, [lowPowerMode, weatherCity]);

    // Fetch on mount and when refresh token changes
    useEffect(() => {
        const forceRefresh = weatherRefreshToken !== weatherRefreshTokenRef.current;
        weatherRefreshTokenRef.current = weatherRefreshToken;
        void loadWeather(forceRefresh);
    }, [loadWeather, weatherRefreshToken]);

    // High-frequency polling when allowed
    useEffect(() => {
        if (!allowHighFrequencyRefresh) {
            return undefined;
        }

        const interval = window.setInterval(() => {
            void loadWeather(true);
        }, FULL_POWER_CACHE_MAX_AGE_MS);

        return () => window.clearInterval(interval);
    }, [loadWeather, allowHighFrequencyRefresh]);

    // Re-fetch on Live API connect (debounced by loadWeather's 60s check)
    useEffect(() => {
        if (isConnected && !wasConnectedRef.current) {
            void loadWeather(false);
        }
        wasConnectedRef.current = isConnected;
    }, [isConnected, loadWeather]);

    const refreshWeather = useCallback(() => {
        setWeatherRefreshToken((v) => v + 1);
    }, []);

    const getWeatherSnapshot = useCallback((): WeatherSnapshot => ({
        city: activeCityRef.current,
        tempUnit: tempUnitRef.current,
        weather: currentWeatherRef.current,
        aqi: currentAqiRef.current,
    }), []);

    return {
        currentWeather,
        currentAqi,
        activeCity,
        refreshWeather,
        getWeatherSnapshot,
    };
};
