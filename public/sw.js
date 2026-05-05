// Comprehensive Service Worker for Curio PWA
//
// Cache strategies:
// - Network-First for index.html and '/' so the app entry is always fresh
//   (stale index.html references old hashed asset names and breaks the app).
// - Stale-While-Revalidate for hashed JS/CSS (safe: filenames change per build).
// - Cache-First for images, fonts, audio, and models (heavy, rarely change).
const CACHE_NAME = 'curio-v4';
const MODEL_CACHE_NAME = 'curio-models-v2';
const PRECACHE_ASSETS = [
    '/manifest.json',
    '/curio_icon.png',
];

// Install event - precache a minimal set (avoid precaching '/' so we always
// fetch a fresh index.html on first load after an update).
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME, MODEL_CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Allow the page to trigger an immediate activation after an update.
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Fetch event - strategy per resource type
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip external image generators so they load reliably
    if (url.hostname.includes('pollinations.ai') || url.hostname.includes('loremflickr.com')) {
        return;
    }

    const isModel = url.pathname.match(/\.(onnx|wasm|tflite|mjs)$/);
    const isStaticAsset = url.pathname.match(/\.(png|jpg|jpeg|gif|svg|mp3|wav|ogg|json|ico|ttf|woff2?)$/);
    const isCode = url.pathname.match(/\.(js|css)$/);
    const isAppEntry = url.pathname === '/' || url.pathname.endsWith('/index.html');
    const isRuntimeWorker =
        url.pathname.endsWith('/pocketTtsWorker.bundle.js') ||
        url.pathname.endsWith('/faceTrackingWorker.bundle.js');

    if (isAppEntry) {
        // Network-First for app entry. A stale index.html points at old
        // hashed asset names that no longer exist after a redeploy.
        event.respondWith(
            fetch(event.request).then((networkResponse) => {
                const copy = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                return networkResponse;
            }).catch(() => caches.match(event.request))
        );
    } else if (isRuntimeWorker) {
        // Network-First for fixed-name worker bundles. They are not hashed by
        // Vite, so cache-first/stale-first can leave old inference code paired
        // with newer app code after a deploy.
        event.respondWith(
            fetch(event.request).then((networkResponse) => {
                const copy = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                return networkResponse;
            }).catch(() => caches.match(event.request))
        );
    } else if (isModel) {
        // Cache First for ONNX models, WASM, and TFLite (5-20MB each, rarely change).
        event.respondWith(
            caches.open(MODEL_CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) return cachedResponse;
                    return fetch(event.request).then((networkResponse) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
        );
    } else if (isStaticAsset) {
        // Cache First for media and icons.
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                return fetch(event.request).then((networkResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
        );
    } else if (isCode) {
        // Stale-While-Revalidate for hashed JS/CSS.
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
                return cachedResponse || fetchPromise;
            })
        );
    } else {
        // Generic dynamic caching
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                return cachedResponse || fetch(event.request).then((networkResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
        );
    }
});
