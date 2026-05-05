// src/services/offlineImageStore.ts
// IndexedDB-backed store for offline screensaver images (user uploads + cached Google Photos)

const DB_NAME = 'curio-images';
const DB_VERSION = 1;
const STORE_OFFLINE = 'offline-images';
const STORE_CACHE = 'photo-cache';

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_OFFLINE)) {
                db.createObjectStore(STORE_OFFLINE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_CACHE)) {
                db.createObjectStore(STORE_CACHE, { keyPath: 'url' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// ---------------------------------------------------------------------------
// Offline (user-uploaded) images
// ---------------------------------------------------------------------------

export interface OfflineImage {
    id: string;
    name: string;
    blob: Blob;
    addedAt: number;
}

export async function addOfflineImages(files: File[]): Promise<number> {
    const db = await openDB();
    const tx = db.transaction(STORE_OFFLINE, 'readwrite');
    const store = tx.objectStore(STORE_OFFLINE);
    let count = 0;

    for (const file of files) {
        // Only accept images
        if (!file.type.startsWith('image/')) continue;

        // Resize large images to save storage (max 1920px wide)
        const blob = await resizeImage(file, 1920);
        const id = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        store.put({ id, name: file.name, blob, addedAt: Date.now() } satisfies OfflineImage);
        count++;
    }

    await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();

    // Notify settings listeners
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
    return count;
}

export async function getOfflineImages(): Promise<OfflineImage[]> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_OFFLINE, 'readonly');
        const store = tx.objectStore(STORE_OFFLINE);
        const items: OfflineImage[] = await new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        db.close();
        return items;
    } catch {
        return [];
    }
}

export async function getOfflineImageCount(): Promise<number> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_OFFLINE, 'readonly');
        const store = tx.objectStore(STORE_OFFLINE);
        const count: number = await new Promise((resolve, reject) => {
            const req = store.count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        db.close();
        return count;
    } catch {
        return 0;
    }
}

export async function removeOfflineImage(id: string): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(STORE_OFFLINE, 'readwrite');
    tx.objectStore(STORE_OFFLINE).delete(id);
    await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
}

export async function clearOfflineImages(): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(STORE_OFFLINE, 'readwrite');
    tx.objectStore(STORE_OFFLINE).clear();
    await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
}

export async function replaceOfflineImages(images: OfflineImage[]): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(STORE_OFFLINE, 'readwrite');
    const store = tx.objectStore(STORE_OFFLINE);
    store.clear();
    for (const image of images) {
        store.put(image);
    }
    await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
}

/** Create blob URLs from offline images. Caller must revoke them. */
export async function getOfflineImageBlobUrls(maxItems = Number.POSITIVE_INFINITY): Promise<string[]> {
    const images = await getOfflineImages();
    return sampleEvenly(images, maxItems).map((img) => URL.createObjectURL(img.blob));
}

// ---------------------------------------------------------------------------
// Google Photos cache (persists fetched blobs so iOS/PWA doesn't re-fetch)
// ---------------------------------------------------------------------------

interface CachedPhoto {
    url: string; // baseUrl key
    blob: Blob;
    cachedAt: number;
}

const CACHE_MAX_AGE_MS = 55 * 60 * 1000; // 55 min

export async function getCachedPhoto(baseUrl: string): Promise<Blob | null> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_CACHE, 'readonly');
        const store = tx.objectStore(STORE_CACHE);
        const item: CachedPhoto | undefined = await new Promise((resolve, reject) => {
            const req = store.get(baseUrl);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        db.close();
        if (item && Date.now() - item.cachedAt < CACHE_MAX_AGE_MS) {
            return item.blob;
        }
        return null;
    } catch {
        return null;
    }
}

export async function setCachedPhoto(baseUrl: string, blob: Blob): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_CACHE, 'readwrite');
        tx.objectStore(STORE_CACHE).put({ url: baseUrl, blob, cachedAt: Date.now() } satisfies CachedPhoto);
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch (e) {
        console.warn('[PhotoCache] Failed to cache photo:', e);
    }
}

export async function clearPhotoCache(): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_CACHE, 'readwrite');
        tx.objectStore(STORE_CACHE).clear();
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sampleEvenly<T>(items: T[], maxItems: number): T[] {
    if (!Number.isFinite(maxItems) || maxItems <= 0 || items.length <= maxItems) {
        return items;
    }

    const step = items.length / maxItems;
    const sampled: T[] = [];

    for (let index = 0; index < maxItems; index += 1) {
        sampled.push(items[Math.floor(index * step)]);
    }

    return sampled;
}

function resizeImage(file: File, maxWidth: number): Promise<Blob> {
    return new Promise((resolve) => {
        // If file is small enough, skip resize
        if (file.size < 500_000) {
            resolve(file);
            return;
        }

        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            if (img.width <= maxWidth) {
                resolve(file);
                return;
            }
            const scale = maxWidth / img.width;
            const canvas = document.createElement('canvas');
            canvas.width = maxWidth;
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(file); return; }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(
                (blob) => resolve(blob ?? file),
                'image/jpeg',
                0.85
            );
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(file);
        };
        img.src = url;
    });
}
