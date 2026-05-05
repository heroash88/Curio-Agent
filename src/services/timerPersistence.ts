import type { PersistedTimer } from './cardTypes';

const STORAGE_KEY = 'curio_active_timers';
export const TIMERS_EVENT = 'curio:timers-changed';
const EXPIRED_TIMER_RESTORE_GRACE_MS = 24 * 60 * 60 * 1000;

const emitTimersChanged = () => {
    if (typeof window === 'undefined') {
        return;
    }

    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent(TIMERS_EVENT));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export function persistTimers(timers: PersistedTimer[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
        emitTimersChanged();
    } catch (e) {
        console.warn('[TimerPersistence] Failed to persist timers (quota exceeded?):', e);
    }
}

export function restoreTimers(options: { includeExpired?: boolean } = {}): PersistedTimer[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            clearPersistedTimers();
            return [];
        }
        const now = Date.now();
        return parsed.filter((t: PersistedTimer) => {
            if (!Number.isFinite(t.targetTime) || !Number.isFinite(t.duration)) {
                return false;
            }
            if (t.targetTime > now) return true;
            if (options.includeExpired) {
                return t.targetTime > now - EXPIRED_TIMER_RESTORE_GRACE_MS;
            }
            return t.isAlarm && t.targetTime > now - 60_000;
        });
    } catch (e) {
        console.warn('[TimerPersistence] Failed to restore timers (corrupt JSON?):', e);
        clearPersistedTimers();
        return [];
    }
}

export function clearPersistedTimers(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
        emitTimersChanged();
    } catch (e) {
        // Ignore
    }
}
