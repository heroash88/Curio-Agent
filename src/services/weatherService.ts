/**
 * Weather Service — Open-Meteo (no API key required)
 * Provides current weather, AQI, humidity, and multi-day forecasts.
 */

export interface DailyForecast {
    date: string;        // e.g. "Mon", "Tue"
    highF: number;
    lowF: number;
    highC: number;
    lowC: number;
    icon: string;        // WMO weather code mapped to icon key
    condition: string;   // human-readable condition
    humidity?: number;
}

export interface WeatherData {
    tempF: number;
    tempC: number;
    icon: string;
    desc: string;
    city: string;
    latitude?: number;
    longitude?: number;
    humidity?: number;
    windSpeedMph?: number;
    feelsLikeF?: number;
    feelsLikeC?: number;
    daily?: DailyForecast[];
}

export interface AqiData {
    value: number;
    category: string;
    color: string;
}

export interface WeatherCachePayload {
    lookupKey: string;
    savedAt: number;
    weather: WeatherData;
    aqi: AqiData | null;
}

const WEATHER_CACHE_KEY = 'curio-weather-cache-v3';
const WEATHER_DEBUG = import.meta.env.DEV;

export const LOW_POWER_CACHE_MAX_AGE_MS = 30 * 60 * 1_000;
export const FULL_POWER_CACHE_MAX_AGE_MS = 10 * 60 * 1_000;

const inFlightRequests = new Map<string, Promise<{ weather: WeatherData | null; aqi: AqiData | null }>>();

export const getLookupKey = (city: string) => city.trim().toLowerCase() || '__auto__';

// ── WMO Weather Code Mapping ───────────────────────────────────────

const WMO_MAP: Record<number, { icon: string; desc: string }> = {
    0:  { icon: 'sun',              desc: 'Clear' },
    1:  { icon: 'sun',              desc: 'Mostly Clear' },
    2:  { icon: 'partlyCloudyDay',  desc: 'Partly Cloudy' },
    3:  { icon: 'cloud',            desc: 'Overcast' },
    45: { icon: 'mist',             desc: 'Fog' },
    48: { icon: 'mist',             desc: 'Rime Fog' },
    51: { icon: 'rain',             desc: 'Light Drizzle' },
    53: { icon: 'rain',             desc: 'Drizzle' },
    55: { icon: 'rain',             desc: 'Heavy Drizzle' },
    56: { icon: 'rain',             desc: 'Freezing Drizzle' },
    57: { icon: 'rain',             desc: 'Heavy Freezing Drizzle' },
    61: { icon: 'rain',             desc: 'Light Rain' },
    63: { icon: 'rain',             desc: 'Rain' },
    65: { icon: 'rain',             desc: 'Heavy Rain' },
    66: { icon: 'rain',             desc: 'Freezing Rain' },
    67: { icon: 'rain',             desc: 'Heavy Freezing Rain' },
    71: { icon: 'snow',             desc: 'Light Snow' },
    73: { icon: 'snow',             desc: 'Snow' },
    75: { icon: 'snow',             desc: 'Heavy Snow' },
    77: { icon: 'snow',             desc: 'Snow Grains' },
    80: { icon: 'rain',             desc: 'Light Showers' },
    81: { icon: 'rain',             desc: 'Showers' },
    82: { icon: 'rain',             desc: 'Heavy Showers' },
    85: { icon: 'snow',             desc: 'Snow Showers' },
    86: { icon: 'snow',             desc: 'Heavy Snow Showers' },
    95: { icon: 'thunder',          desc: 'Thunderstorm' },
    96: { icon: 'thunder',          desc: 'Thunderstorm w/ Hail' },
    99: { icon: 'thunder',          desc: 'Severe Thunderstorm' },
};

export const mapWmoCode = (code: number): { icon: string; desc: string } =>
    WMO_MAP[code] ?? { icon: 'cloud', desc: 'Cloudy' };

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Cache ──────────────────────────────────────────────────────────

export const readWeatherCache = (lookupKey: string): WeatherCachePayload | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(WEATHER_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as WeatherCachePayload;
        if (parsed.lookupKey !== lookupKey) return null;
        return parsed;
    } catch { return null; }
};

export const writeWeatherCache = (payload: WeatherCachePayload) => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
};

// ── Location helpers ───────────────────────────────────────────────

export const getCurrentPosition = (): Promise<GeolocationPosition | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos),
            () => resolve(null),
            { timeout: 3_000, maximumAge: 60_000 },
        );
    });
};

export const fetchGeoIP = async (): Promise<{ lat: number; lon: number; city?: string } | null> => {
    try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        if (data.latitude && data.longitude) return { lat: data.latitude, lon: data.longitude, city: data.city };
    } catch (e) { console.warn('[WeatherService] GeoIP fallback failed:', e); }
    return null;
};

/** Open-Meteo Geocoding — resolve city name to lat/lon. No API key needed. */
export const geocodeCity = async (city: string): Promise<{ lat: number; lon: number; name: string } | null> => {
    const tryGeocode = async (query: string) => {
        try {
            const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`);
            const data = await res.json();
            const r = data.results?.[0];
            if (r) return { lat: r.latitude as number, lon: r.longitude as number, name: r.name as string };
        } catch (e) { console.warn('[WeatherService] Geocode failed:', e); }
        return null;
    };

    // Try the full string first (e.g. "Sample City, WA, US")
    let result = await tryGeocode(city);
    if (result) return result;

    // Fall back to just the first part before comma (e.g. "Sample City")
    const parts = city.split(',');
    if (parts.length > 1) {
        result = await tryGeocode(parts[0].trim());
        if (result) return result;
    }

    return null;
};

// ── Open-Meteo Fetch ───────────────────────────────────────────────

const cToF = (c: number) => Math.round(c * 9 / 5 + 32);

export const fetchWeatherRaw = async (lat: number, lon: number): Promise<WeatherData> => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
        + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m`
        + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`
        + `&temperature_unit=celsius&wind_speed_unit=mph&forecast_days=7&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo fetch failed: ${res.status}`);
    const data = await res.json();

    const cur = data.current;
    const tempC = Math.round(cur.temperature_2m);
    const feelsC = Math.round(cur.apparent_temperature);
    const { icon, desc } = mapWmoCode(cur.weather_code);

    // Build daily forecast
    const daily: DailyForecast[] = (data.daily?.time ?? []).map((dateStr: string, i: number) => {
        const d = new Date(dateStr + 'T12:00:00');
        const wmo = mapWmoCode(data.daily.weather_code[i]);
        const highC = Math.round(data.daily.temperature_2m_max[i]);
        const lowC = Math.round(data.daily.temperature_2m_min[i]);
        const precipProb = data.daily.precipitation_probability_max?.[i];
        return {
            date: DAY_NAMES[d.getDay()],
            highF: cToF(highC), lowF: cToF(lowC),
            highC, lowC,
            icon: wmo.icon,
            condition: wmo.desc,
            humidity: precipProb != null ? Math.round(precipProb) : undefined,
        };
    });

    // Reverse-geocode city name from Open-Meteo (it doesn't return city, so we'll set it later)
    return {
        tempF: cToF(tempC), tempC,
        feelsLikeF: cToF(feelsC), feelsLikeC: feelsC,
        icon, desc,
        city: '', // filled by caller
        latitude: lat, longitude: lon,
        humidity: Math.round(cur.relative_humidity_2m),
        windSpeedMph: Math.round(cur.wind_speed_10m),
        daily,
    };
};

// ── Open-Meteo AQI ─────────────────────────────────────────────────

export const fetchAqiRaw = async (lat: number, lon: number): Promise<AqiData | null> => {
    try {
        const res = await fetch(
            `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`
        );
        if (!res.ok) return null;
        const data = await res.json();
        const value = Math.round(data.current?.us_aqi ?? 0);
        if (!value) return null;

        let category = '';
        let color = '#4ADE80';
        if (value <= 50)       { category = 'Good';            color = '#4ADE80'; }
        else if (value <= 100) { category = 'Moderate';        color = '#FACC15'; }
        else if (value <= 150) { category = 'Sensitive';       color = '#FB923C'; }
        else if (value <= 200) { category = 'Unhealthy';       color = '#F87171'; }
        else if (value <= 300) { category = 'Very Unhealthy';  color = '#C084FC'; }
        else                   { category = 'Hazardous';       color = '#9F1239'; }

        return { value, category, color };
    } catch (e) {
        console.warn('[WeatherService] AQI fetch failed:', e);
        return null;
    }
};

// ── Reverse geocode (city name from coords) ────────────────────────

const reverseGeocode = async (lat: number, lon: number): Promise<string> => {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`);
        const data = await res.json();
        return data.address?.city || data.address?.town || data.address?.village || data.name || '';
    } catch { return ''; }
};

// ── Unified entry point ────────────────────────────────────────────

export async function getUnifiedWeather(
    city: string,
    lowPowerMode: boolean,
    forceRefresh: boolean = false,
): Promise<{ weather: WeatherData | null; aqi: AqiData | null }> {
    const lookupKey = getLookupKey(city);
    const requestKey = `${lookupKey}:${lowPowerMode ? 'low' : 'full'}:${forceRefresh ? 'force' : 'cache'}`;
    const cached = readWeatherCache(lookupKey);
    const cacheMaxAge = lowPowerMode ? LOW_POWER_CACHE_MAX_AGE_MS : FULL_POWER_CACHE_MAX_AGE_MS;

    if (!forceRefresh && cached && (Date.now() - cached.savedAt) < cacheMaxAge) {
        if (WEATHER_DEBUG) console.debug(`[WeatherService] Returning cached weather for ${lookupKey}`);
        return { weather: cached.weather, aqi: cached.aqi };
    }

    const existing = inFlightRequests.get(requestKey);
    if (existing) return existing;

    if (WEATHER_DEBUG) console.debug(`[WeatherService] Fetching fresh weather for ${lookupKey}`);

    let promise: Promise<{ weather: WeatherData | null; aqi: AqiData | null }> | null = null;
    promise = (async () => {
        try {
            let lat: number | undefined;
            let lon: number | undefined;
            let cityName = '';

            if (city.trim()) {
                const geo = await geocodeCity(city.trim());
                if (geo) { lat = geo.lat; lon = geo.lon; cityName = geo.name; }
                else throw new Error(`Could not geocode "${city}"`);
            } else {
                const pos = await getCurrentPosition();
                if (pos) { lat = pos.coords.latitude; lon = pos.coords.longitude; }
                else {
                    const geoIP = await fetchGeoIP();
                    if (geoIP) { lat = geoIP.lat; lon = geoIP.lon; cityName = geoIP.city || ''; }
                    else { lat = 37.7749; lon = -122.4194; cityName = 'San Francisco'; }
                }
            }

            const weather = await fetchWeatherRaw(lat!, lon!);
            if (!cityName) cityName = await reverseGeocode(lat!, lon!);
            weather.city = cityName;

            const aqi = await fetchAqiRaw(lat!, lon!);

            writeWeatherCache({ lookupKey, savedAt: Date.now(), weather, aqi });
            return { weather, aqi };
        } catch (err) {
            console.error('[WeatherService] Unified load failed:', err);
            return { weather: cached?.weather || null, aqi: cached?.aqi || null };
        } finally {
            if (promise && inFlightRequests.get(requestKey) === promise) inFlightRequests.delete(requestKey);
        }
    })();

    inFlightRequests.set(requestKey, promise);
    return promise;
}

export const resetWeatherServiceForTests = () => { inFlightRequests.clear(); };
