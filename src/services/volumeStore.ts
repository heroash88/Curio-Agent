/**
 * Lightweight shared volume store.
 *
 * Replaces the previous pattern of writing --volume to
 * document.documentElement.style (which forces style recalculation on every
 * getComputedStyle read). Consumers can read `getVolume()` from any
 * requestAnimationFrame or setInterval callback with zero layout cost.
 */

let _volume = 0;

export function setVolume(v: number): void {
    _volume = v;
    // Keep the CSS variable in sync for any CSS-only consumers (e.g. transitions)
    // but batch it — callers already run inside RAF so this is safe.
    document.documentElement.style.setProperty('--volume', v.toFixed(3));
}

export function getVolume(): number {
    return _volume;
}
