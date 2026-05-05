/**
 * randomId -- returns a UUIDv4-ish string that works in both secure and
 * insecure contexts.
 *
 * `crypto.randomUUID()` is only defined in secure contexts (HTTPS or
 * localhost). When Curio runs under Home Assistant ingress over plain HTTP,
 * that function is missing and direct calls throw
 * "crypto.randomUUID is not a function".
 *
 * This helper prefers the native implementation when available, falls back
 * to `crypto.getRandomValues` for RFC 4122 compliant UUIDs, and finally
 * falls back to Math.random for very old environments.
 */
export function randomId(): string {
    const c: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined;

    if (c && typeof c.randomUUID === 'function') {
        try { return c.randomUUID(); } catch { /* fall through */ }
    }

    if (c && typeof c.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        c.getRandomValues(bytes);
        // RFC 4122 v4
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const h: string[] = [];
        for (let i = 0; i < 256; i++) h.push((i + 0x100).toString(16).slice(1));
        return (
            h[bytes[0]] + h[bytes[1]] + h[bytes[2]] + h[bytes[3]] + '-' +
            h[bytes[4]] + h[bytes[5]] + '-' +
            h[bytes[6]] + h[bytes[7]] + '-' +
            h[bytes[8]] + h[bytes[9]] + '-' +
            h[bytes[10]] + h[bytes[11]] + h[bytes[12]] + h[bytes[13]] + h[bytes[14]] + h[bytes[15]]
        );
    }

    // Last-resort fallback (not cryptographically strong, only used if both
    // crypto.randomUUID and crypto.getRandomValues are unavailable).
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
