import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTempUnit, useGoogleAccessToken, getPickerPhotoUrls, getPickerSessionId, getPickerUrlsTimestamp, setPickerPhotoUrls } from '../../utils/settingsStorage';
import type { AqiData, WeatherData } from '../../services/weatherService';
import type { RuntimePerformanceProfile } from '../../services/runtimePerformanceProfile';
import { AnimatedWeatherIcon } from '../common/WeatherIcon';
import { isIOSStandalonePwa } from '../../utils/pwa';

const SCREENAVER_DEBUG = import.meta.env.DEV;
const IOS_PWA_MAX_SCREENSAVER_IMAGES = 24;
const DEFAULT_MAX_SCREENSAVER_IMAGES = 60;

// Picker API baseUrls require Bearer auth headers - can't use in <img src> directly.
// We fetch each one with the auth token and create a temporary blob URL.
const PICKER_URL_EXPIRY_MS = 50 * 60 * 1000; // 50 min (they expire at 60 min)

// Screensaver image source mode
type ImageSourceMode = 'google' | 'offline' | 'unsplash';

const UNSPLASH_IMAGES = [
    'https://images.unsplash.com/photo-1506744626753-1407336b1d46?q=80&w=2560&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=2560&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=2560&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1433086966358-54859d0ed716?q=80&w=2560&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=2560&auto=format&fit=crop'
];

const scheduleMinuteBoundary = (onTick: () => void): (() => void) => {
    let timeoutId: number | null = null;

    const scheduleNext = () => {
        const now = Date.now();
        const nextMinuteDelay = 60_000 - (now % 60_000) + 25;
        timeoutId = window.setTimeout(() => {
            onTick();
            scheduleNext();
        }, nextMinuteDelay);
    };

    scheduleNext();

    return () => {
        if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
        }
    };
};

async function fetchAuthenticatedImage(baseUrl: string, accessToken: string): Promise<string | null> {
    // 1. Check IndexedDB cache first (avoids CORS issues on iOS/PWA entirely)
    try {
        const { getCachedPhoto } = await import('../../services/offlineImageStore');
        const cached = await getCachedPhoto(baseUrl);
        if (cached) {
            if (SCREENAVER_DEBUG) console.debug('[Screensaver] Using cached photo for', baseUrl.slice(0, 60));
            return URL.createObjectURL(cached);
        }
    } catch { /* cache miss, proceed with fetch */ }

    const requestedSize = isIOSStandalonePwa() ? 'w1280-h720' : 'w1920-h1080';
    const fullUrl = `${baseUrl}=${requestedSize}`;
    const controller = new AbortController();
    // Longer timeout for mobile/slow networks (20s instead of 10s)
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
        const res = await fetch(fullUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
            // Explicit CORS mode + omit credentials to avoid iOS cookie/credential issues
            mode: 'cors',
            credentials: 'omit',
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
            console.warn(`[Screensaver] Authenticated fetch failed (status: ${res.status}).`);
            return null;
        }

        const blob = await res.blob();

        // Cache to IndexedDB so subsequent loads (and iOS PWA restarts) don't re-fetch
        try {
            const { setCachedPhoto } = await import('../../services/offlineImageStore');
            void setCachedPhoto(baseUrl, blob);
        } catch { /* caching is best-effort */ }

        return URL.createObjectURL(blob);
    } catch (e: any) {
        clearTimeout(timeout);
        if (e.name === 'AbortError') {
            console.warn('[Screensaver] Photo fetch timed out.');
        } else {
            console.warn('[Screensaver] Photo fetch error:', e);
        }
        return null;
    }
}

function sampleEvenly<T>(items: T[], maxItems: number): T[] {
    if (items.length <= maxItems) {
        return items;
    }

    const step = items.length / maxItems;
    const sampled: T[] = [];

    for (let index = 0; index < maxItems; index += 1) {
        sampled.push(items[Math.floor(index * step)]);
    }

    return sampled;
}

interface ScreensaverProps {
    onDismiss?: () => void;
    weather: WeatherData | null;
    aqi: AqiData | null;
    lowPowerMode?: boolean;
    runtimeProfile?: RuntimePerformanceProfile;
}

export const Screensaver: React.FC<ScreensaverProps> = ({
    onDismiss,
    weather,
    aqi,
    lowPowerMode = true,
    runtimeProfile,
}) => {
    const tempUnit = useTempUnit();
    const googleAccessToken = useGoogleAccessToken();
    const allowHeavyEffects = runtimeProfile?.allowScreensaverHeavyEffects ?? !lowPowerMode;
    const rotationIntervalMs = runtimeProfile?.screensaverSlideIntervalMs ?? (lowPowerMode ? 60_000 : 30_000);
    const pickerRefreshIntervalMs = runtimeProfile?.screensaverUrlRefreshIntervalMs ?? (lowPowerMode ? 55 * 60_000 : 45 * 60_000);
    const maxScreensaverImages = useMemo(
        () => (isIOSStandalonePwa() ? IOS_PWA_MAX_SCREENSAVER_IMAGES : DEFAULT_MAX_SCREENSAVER_IMAGES),
        []
    );

    const [pickerBaseUrls, setPickerBaseUrls] = useState<string[]>(() => getPickerPhotoUrls());
    const [blobUrls, setBlobUrls] = useState<string[]>([]);
    const blobUrlsRef = useRef<string[]>([]);
    const [offlineBlobUrls, setOfflineBlobUrls] = useState<string[]>([]);
    const offlineBlobUrlsRef = useRef<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [time, setTime] = useState(() => new Date());
    const [isLoading, setIsLoading] = useState(true);
    const refreshingRef = useRef(false);

    // Determine image source mode
    const imageSourceMode: ImageSourceMode = useMemo(() => {
        const offlineEnabled = typeof window !== 'undefined' && localStorage.getItem('curio_screensaver_source') === 'offline';
        if (offlineEnabled) return 'offline';
        if (pickerBaseUrls.length > 0 && googleAccessToken) return 'google';
        return 'unsplash';
    }, [pickerBaseUrls.length, googleAccessToken]);
    const sampledPickerBaseUrls = useMemo(
        () => sampleEvenly(pickerBaseUrls, maxScreensaverImages),
        [maxScreensaverImages, pickerBaseUrls]
    );

    useEffect(() => {
        return () => {
            blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
            offlineBlobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        };
    }, []);

    const refreshPickerUrls = useCallback(async (forceSessionRefresh = false) => {
        if (refreshingRef.current) return;
        const sessionId = getPickerSessionId();
        if (!sessionId || !googleAccessToken) return;

        refreshingRef.current = true;
        try {
            if (forceSessionRefresh) {
                const { listPickerMediaItems } = await import('../../services/googlePhotosPickerAPI');
                const items = await listPickerMediaItems(googleAccessToken, sessionId);
                if (items.length > 0) {
                    const urls = items.map((item) => item.mediaFile.baseUrl);
                    setPickerPhotoUrls(urls, sessionId);
                    setPickerBaseUrls(urls);
                }
            } else {
                setPickerBaseUrls(getPickerPhotoUrls());
            }
        } catch (e) {
            console.warn('[Screensaver] Failed to refresh from session, using fallback:', e);
            setPickerBaseUrls([]);
        } finally {
            refreshingRef.current = false;
        }
    }, [googleAccessToken]);

    useEffect(() => {
        const timestamp = getPickerUrlsTimestamp();
        const age = Date.now() - timestamp;
        const urls = getPickerPhotoUrls();

        if (urls.length > 0 && age > PICKER_URL_EXPIRY_MS) {
            if (SCREENAVER_DEBUG) {
                console.debug(`[Screensaver] Picker URLs ${Math.round(age / 60_000)} min old - refreshing from session...`);
            }
            void refreshPickerUrls(true);
        }

        const handleChange = () => setPickerBaseUrls(getPickerPhotoUrls());
        window.addEventListener('curio:settings-changed', handleChange);
        return () => window.removeEventListener('curio:settings-changed', handleChange);
    }, [refreshPickerUrls]);

    useEffect(() => {
        if (pickerBaseUrls.length === 0 || !googleAccessToken) return undefined;
        const timer = window.setInterval(() => {
            void refreshPickerUrls(true);
        }, pickerRefreshIntervalMs);
        return () => window.clearInterval(timer);
    }, [googleAccessToken, pickerBaseUrls.length, pickerRefreshIntervalMs, refreshPickerUrls]);

    useEffect(() => {
        if (sampledPickerBaseUrls.length === 0 || !googleAccessToken || imageSourceMode === 'offline') {
            blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
            blobUrlsRef.current = [];
            setBlobUrls([]);
            setIsLoading(false);
            return undefined;
        }

        setIsLoading(true);
        let cancelled = false;
        const revokedUrls = new Set<string>();
        // Track every blob URL created in this cycle so cleanup can revoke all of them,
        // even ones not yet pushed to blobUrlsRef (mid-flight race window).
        const allCreatedUrls = new Set<string>();

        const safeRevoke = (url: string) => {
            if (!revokedUrls.has(url)) {
                revokedUrls.add(url);
                URL.revokeObjectURL(url);
            }
        };

        // Revoke previous blob URLs immediately -- don't wait for the async loop
        const previousBlobUrls = [...blobUrlsRef.current];
        previousBlobUrls.forEach(safeRevoke);
        blobUrlsRef.current = [];

        (async () => {
            const loaded: string[] = [];
            let authFailure = false;

            for (const baseUrl of sampledPickerBaseUrls) {
                if (cancelled) break;
                try {
                    const blobUrl = await fetchAuthenticatedImage(baseUrl, googleAccessToken);
                    if (blobUrl) allCreatedUrls.add(blobUrl);
                    // Check cancelled AFTER the await to prevent leaked blob URLs
                    if (cancelled) {
                        if (blobUrl) safeRevoke(blobUrl);
                        break;
                    }
                    // Skip null results (failed fetches) instead of using raw URLs
                    if (!blobUrl) {
                        continue;
                    }
                    loaded.push(blobUrl);
                    blobUrlsRef.current = [...loaded];
                    if (!cancelled) {
                        setBlobUrls([...loaded]);
                        if (loaded.length === 1) {
                            setIsLoading(false);
                        }
                    }
                } catch (e) {
                    console.warn('[Screensaver] Failed to load picker image, skipping:', e);
                    const message = String(e);
                    if (message.includes('401') || message.includes('403')) {
                        authFailure = true;
                        break;
                    }
                }
            }

            if (!cancelled) {
                if (authFailure) {
                    void refreshPickerUrls(true);
                }
                if (loaded.length === 0) {
                    setIsLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
            // Revoke ALL blob URLs created in this cycle -- including any that
            // were mid-flight and not yet pushed to blobUrlsRef.
            for (const url of allCreatedUrls) {
                safeRevoke(url);
            }
            blobUrlsRef.current = [];
        };
    }, [googleAccessToken, sampledPickerBaseUrls, refreshPickerUrls, imageSourceMode]);

    // --- Load offline images from IndexedDB ---
    useEffect(() => {
        if (imageSourceMode !== 'offline') {
            offlineBlobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
            offlineBlobUrlsRef.current = [];
            setOfflineBlobUrls([]);
            return;
        }

        let cancelled = false;
        setIsLoading(true);

        (async () => {
            try {
                const { getOfflineImageBlobUrls } = await import('../../services/offlineImageStore');
                const urls = await getOfflineImageBlobUrls(maxScreensaverImages);
                if (!cancelled) {
                    // Revoke old ones
                    offlineBlobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
                    offlineBlobUrlsRef.current = urls;
                    setOfflineBlobUrls(urls);
                    setIsLoading(false);
                }
            } catch (e) {
                console.warn('[Screensaver] Failed to load offline images:', e);
                if (!cancelled) {
                    setOfflineBlobUrls([]);
                    setIsLoading(false);
                }
            }
        })();

        // Re-load when settings change (user adds/removes images)
        const handleChange = () => {
            if (cancelled) return;
            void (async () => {
                try {
                    const { getOfflineImageBlobUrls } = await import('../../services/offlineImageStore');
                    const urls = await getOfflineImageBlobUrls(maxScreensaverImages);
                    if (!cancelled) {
                        offlineBlobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
                        offlineBlobUrlsRef.current = urls;
                        setOfflineBlobUrls(urls);
                    }
                } catch { /* ignore */ }
            })();
        };
        window.addEventListener('curio:settings-changed', handleChange);

        return () => {
            cancelled = true;
            window.removeEventListener('curio:settings-changed', handleChange);
        };
    }, [imageSourceMode, maxScreensaverImages]);

    const activeImages = useMemo(() => {
        // Offline images take priority when that mode is selected
        if (imageSourceMode === 'offline' && offlineBlobUrls.length > 0) {
            return offlineBlobUrls;
        }

        if (blobUrls.length > 0) {
            return blobUrls;
        }

        if (isLoading && (pickerBaseUrls.length > 0 || imageSourceMode === 'offline')) {
            return [];
        }

        return UNSPLASH_IMAGES;
    }, [blobUrls, offlineBlobUrls, isLoading, pickerBaseUrls.length, imageSourceMode]);

    useEffect(() => {
        setCurrentIndex((index) => {
            if (activeImages.length === 0) return 0;
            return index % activeImages.length;
        });
    }, [activeImages.length]);

    useEffect(() => {
        setTime(new Date());
        return scheduleMinuteBoundary(() => setTime(new Date()));
    }, []);

    useEffect(() => {
        if (activeImages.length <= 1) return undefined;

        const timer = window.setInterval(() => {
            setCurrentIndex((index) => (index + 1) % activeImages.length);
        }, rotationIntervalMs);

        return () => window.clearInterval(timer);
    }, [activeImages.length, rotationIntervalMs]);

    const handleWake = () => {
        window.dispatchEvent(new Event('curio:wake'));
        onDismiss?.();
    };

    const displayUrl = activeImages.length > 0 ? activeImages[currentIndex % activeImages.length] : null;
    const formattedTime = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(/ (AM|PM)/i, '');
    const formattedDate = time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

    // Preload the next image so it's in the browser cache when the slide changes
    useEffect(() => {
        if (activeImages.length <= 1) return;
        const nextIndex = (currentIndex + 1) % activeImages.length;
        const nextUrl = activeImages[nextIndex];
        if (nextUrl) {
            const img = new Image();
            img.src = nextUrl;
            // Clean up to release the decoded image memory
            return () => { img.src = ''; };
        }
    }, [currentIndex, activeImages]);

    return (
        <div
            className="fixed inset-0 z-[100] bg-black cursor-none"
            onClick={handleWake}
            onTouchStart={handleWake}
        >
            {displayUrl && (
                <img
                    key={displayUrl}
                    src={displayUrl}
                    alt="Screensaver"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{
                        animation: allowHeavyEffects
                            ? 'screensaver-image-fade 1.6s ease-out'
                            : 'screensaver-image-fade 0.8s ease-out',
                        transform: allowHeavyEffects ? 'scale(1.01)' : 'none',
                    }}
                />
            )}

            <div className="absolute inset-0 bg-black/40 pointer-events-none" />

            <div className="fixed bottom-12 left-12 text-white font-light opacity-90 drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)] z-50 flex flex-col items-start">
                <div style={{ fontSize: '14vw', lineHeight: '0.9', letterSpacing: '-0.02em', fontWeight: 300 }}>
                    {formattedTime}
                </div>
                <div className="text-white/70 text-2xl font-light mt-3 ml-2 tracking-wide">
                    {formattedDate}
                </div>
                <div className="flex items-center gap-6 mt-4 ml-2">
                    {weather && (
                        <div className="flex items-center gap-3 text-white/90 font-medium text-4xl drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
                            <AnimatedWeatherIcon icon={weather.icon} size={48} />
                            <span>{tempUnit === 'F' ? weather.tempF : weather.tempC}&deg;{tempUnit}</span>
                        </div>
                    )}
                    {!lowPowerMode && aqi && (
                        <div className="flex items-center gap-2 px-4 py-1 rounded-lg bg-black/20 backdrop-blur-sm border border-white/10 shadow-lg">
                            <div className="flex flex-col items-end leading-tight">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">AQI</span>
                                <span className="text-sm font-bold text-white/80">{aqi.category}</span>
                            </div>
                            <div
                                className="w-8 h-8 rounded-md flex items-center justify-center font-black text-lg text-white shadow-md"
                                style={{ backgroundColor: aqi.color }}
                            >
                                {aqi.value}
                            </div>
                        </div>
                    )}
                </div>
                {weather && (
                    <div className="text-white/60 text-lg font-light mt-2 ml-4 lowercase tracking-widest drop-shadow-md">
                        {weather.city} &bull; {weather.desc}
                    </div>
                )}
            </div>
        </div>
    );
};
