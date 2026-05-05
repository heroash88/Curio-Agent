/**
 * Secret Storage — AES-GCM encryption for sensitive localStorage values.
 *
 * Uses the Web Crypto API to encrypt API keys and tokens before they hit
 * localStorage. The encryption key lives in IndexedDB (not localStorage)
 * so it's never visible as a plaintext string.
 *
 * Encrypted values are stored as "enc::<base64(iv + ciphertext)>".
 * On read, if a value doesn't have the prefix it's treated as a legacy
 * plaintext value, transparently re-encrypted, and returned.
 */

const DB_NAME = 'curio-secrets';
const DB_STORE = 'keys';
const DB_KEY_ID = 'master';
const ENC_PREFIX = 'enc::';
const IV_BYTES = 12; // AES-GCM standard

// ── IndexedDB helpers ──────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(DB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function idbGet(db: IDBDatabase, key: string): Promise<CryptoKey | undefined> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get(key);
        req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
        req.onerror = () => reject(req.error);
    });
}

function idbPut(db: IDBDatabase, key: string, value: CryptoKey): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        const req = tx.objectStore(DB_STORE).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// ── Key management ─────────────────────────────────────────────────

let _cachedKey: CryptoKey | null = null;

/**
 * Returns true when the Web Crypto API is available (secure context).
 * On plain HTTP over LAN, crypto.subtle is undefined.
 */
function hasCryptoSubtle(): boolean {
    return typeof crypto !== 'undefined' && !!crypto.subtle && typeof indexedDB !== 'undefined';
}

async function getMasterKey(): Promise<CryptoKey> {
    if (_cachedKey) return _cachedKey;

    const db = await openDB();
    const existing = await idbGet(db, DB_KEY_ID);
    if (existing) {
        _cachedKey = existing;
        return existing;
    }

    // Generate a new AES-GCM 256-bit key, non-extractable
    const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false, // non-extractable — can't be read out
        ['encrypt', 'decrypt'],
    );

    await idbPut(db, DB_KEY_ID, key);
    _cachedKey = key;
    return key;
}

// ── Encrypt / Decrypt ──────────────────────────────────────────────

async function encrypt(plaintext: string): Promise<string> {
    const key = await getMasterKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const encoded = new TextEncoder().encode(plaintext);
    const cipherBuf = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded,
    );

    // Combine iv + ciphertext into one buffer, then base64
    const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBuf), iv.length);

    return ENC_PREFIX + btoa(String.fromCharCode(...combined));
}

async function decrypt(stored: string): Promise<string> {
    if (!stored.startsWith(ENC_PREFIX)) {
        // Legacy plaintext — return as-is (caller should re-encrypt)
        return stored;
    }

    const key = await getMasterKey();
    const raw = atob(stored.slice(ENC_PREFIX.length));
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const iv = bytes.slice(0, IV_BYTES);
    const ciphertext = bytes.slice(IV_BYTES);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext,
    );

    return new TextDecoder().decode(decrypted);
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Read a secret from localStorage, decrypting it.
 * If the value is legacy plaintext, it's transparently re-encrypted in place.
 * Returns empty string if key is missing or decryption fails.
 */
export async function getSecret(storageKey: string): Promise<string> {
    if (typeof window === 'undefined') return '';
    const raw = localStorage.getItem(storageKey);
    if (!raw) return '';

    // In non-secure contexts (HTTP over LAN), crypto.subtle is unavailable.
    // Fall back to plaintext storage -- the value can't be encrypted anyway.
    if (!hasCryptoSubtle()) {
        if (raw.startsWith(ENC_PREFIX)) {
            // Encrypted value but no crypto API -- can't decrypt.
            // This happens when switching from HTTPS/localhost to plain HTTP.
            console.warn(`[SecretStorage] Cannot decrypt "${storageKey}" without crypto.subtle (non-secure context).`);
            return '';
        }
        return raw;
    }

    try {
        const value = await decrypt(raw);

        // Auto-migrate legacy plaintext → encrypted
        if (!raw.startsWith(ENC_PREFIX) && value) {
            const encrypted = await encrypt(value);
            localStorage.setItem(storageKey, encrypted);
        }

        return value;
    } catch {
        // Decryption failed (key rotated, corrupt data, etc.)
        // Wipe the bad value so the user can re-enter
        console.warn(`[SecretStorage] Failed to decrypt "${storageKey}", clearing.`);
        localStorage.removeItem(storageKey);
        return '';
    }
}

/**
 * Write a secret to localStorage, encrypting it first.
 * Pass empty string to remove the key.
 */
export async function setSecret(storageKey: string, value: string): Promise<void> {
    if (typeof window === 'undefined') return;
    const trimmed = (value || '').trim();
    if (!trimmed) {
        localStorage.removeItem(storageKey);
    } else if (!hasCryptoSubtle()) {
        // Non-secure context -- store plaintext (best we can do on HTTP over LAN)
        localStorage.setItem(storageKey, trimmed);
    } else {
        const encrypted = await encrypt(trimmed);
        localStorage.setItem(storageKey, encrypted);
    }
}

/**
 * Synchronous read — returns the raw (possibly encrypted) value.
 * Use only for snapshot readers in useSyncExternalStore where async isn't possible.
 * The value will be the *encrypted* blob, so this is only useful for
 * "is there a value?" checks. For the actual plaintext, use getSecret().
 */
export function hasSecret(storageKey: string): boolean {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem(storageKey);
}

/**
 * Synchronous read that returns plaintext ONLY if the value is legacy
 * (not yet encrypted). Returns empty string for encrypted values.
 * This is a migration helper — once all values are encrypted this always
 * returns ''.
 */
export function getSecretSync(storageKey: string): string {
    if (typeof window === 'undefined') return '';
    const raw = localStorage.getItem(storageKey);
    if (!raw) return '';
    if (raw.startsWith(ENC_PREFIX)) return ''; // encrypted — need async
    return raw; // legacy plaintext
}

// ── Sensitive key registry ─────────────────────────────────────────

/** All localStorage keys that hold sensitive secrets. */
export const SENSITIVE_KEYS = [
    'gemini_live_api_key',
    'gemini_text_api_key',
    'curio_youtube_api_key',
    'curio_google_api_key',
    'curio_ha_mcp_token',
    'curio_ha_mcp_refresh_token',
    'curio_nova_api_key',
    'curio_openai_api_key',
    'curio_llm_api_key',
    'curio_tts_remote_api_key',
    'curio_spotify_token',
    'curio_github_access_token',
] as const;

/**
 * Migrate all existing plaintext secrets to encrypted form.
 * Call once at app startup.
 */
export async function migrateSecretsToEncrypted(): Promise<void> {
    if (!hasCryptoSubtle()) return; // Skip migration in non-secure contexts
    const dynamicSecretKeys = typeof window === 'undefined'
        ? []
        : Object.keys(localStorage).filter(
            (key) =>
                key.startsWith('curio_openai_api_key:') ||
                key.startsWith('curio_tts_remote_api_key:') ||
                key.startsWith('curio_tts_remote_secondary_key:') ||
                key.startsWith('curio_generic_mcp_auth_token:') ||
                key.startsWith('curio_generic_mcp_oauth_token:') ||
                key.startsWith('curio_generic_mcp_oauth_client:') ||
                key.startsWith('curio_generic_mcp_env:'),
        );
    for (const key of [...SENSITIVE_KEYS, ...dynamicSecretKeys]) {
        await getSecret(key); // triggers auto-migration
    }
}
