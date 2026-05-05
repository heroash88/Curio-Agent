/**
 * Custom Wake Word Store
 *
 * Stores user-uploaded ONNX wake word models in IndexedDB.
 * Provides blob URLs for the model loader and persists metadata
 * (label, phrase, threshold) alongside the binary data.
 */

const DB_NAME = 'curio-custom-wakewords';
const DB_VERSION = 1;
const STORE_NAME = 'models';

export interface CustomWakeWordEntry {
    /** Unique ID (e.g. "custom-my-wake-word") */
    id: string;
    /** Display label */
    label: string;
    /** Spoken phrase */
    phrase: string;
    /** Detection threshold (0-1) */
    threshold: number;
    /** Original filename */
    filename: string;
    /** ONNX model binary */
    data: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Save a custom wake word model to IndexedDB.
 */
export async function saveCustomWakeWord(entry: CustomWakeWordEntry): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Delete a custom wake word model from IndexedDB.
 */
export async function deleteCustomWakeWord(id: string): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * List all custom wake word entries (metadata only, no binary data).
 */
export async function listCustomWakeWords(): Promise<Omit<CustomWakeWordEntry, 'data'>[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => {
            const entries = (req.result as CustomWakeWordEntry[]).map(
                ({ id, label, phrase, threshold, filename }) => ({ id, label, phrase, threshold, filename })
            );
            resolve(entries);
        };
        req.onerror = () => reject(req.error);
    });
}

export async function listCustomWakeWordEntries(): Promise<CustomWakeWordEntry[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve((req.result as CustomWakeWordEntry[]) || []);
        req.onerror = () => reject(req.error);
    });
}

export async function replaceCustomWakeWords(entries: CustomWakeWordEntry[]): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        for (const entry of entries) {
            store.put(entry);
            revokeCustomWakeWordBlobUrl(entry.id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Get a custom wake word entry including binary data.
 */
export async function getCustomWakeWord(id: string): Promise<CustomWakeWordEntry | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

// Cache blob URLs so we don't create duplicates
const blobUrlCache = new Map<string, string>();

/**
 * Get a blob URL for a custom wake word model.
 * The URL can be passed to openwakeword-js as a model path.
 */
export async function getCustomWakeWordBlobUrl(id: string): Promise<string | null> {
    const cached = blobUrlCache.get(id);
    if (cached) return cached;

    const entry = await getCustomWakeWord(id);
    if (!entry) return null;

    const blob = new Blob([entry.data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    blobUrlCache.set(id, url);
    return url;
}

/**
 * Revoke a cached blob URL for a custom wake word model.
 * Call this when a custom wake word is deleted to free the blob URL.
 */
export function revokeCustomWakeWordBlobUrl(id: string): void {
    const url = blobUrlCache.get(id);
    if (url) {
        URL.revokeObjectURL(url);
        blobUrlCache.delete(id);
    }
}

/**
 * Revoke all cached blob URLs for custom wake word models.
 * Call this during app teardown to prevent blob URL leaks.
 */
export function revokeAllCustomWakeWordBlobUrls(): void {
    for (const [, url] of blobUrlCache) {
        try { URL.revokeObjectURL(url); } catch {}
    }
    blobUrlCache.clear();
}
