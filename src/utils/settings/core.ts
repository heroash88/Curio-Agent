import { useMemo, useSyncExternalStore, type DependencyList } from 'react';

type StorageSnapshotReader<T> = () => T;

const STORAGE_EVENTS = ['storage', 'curio:settings-changed'] as const;

export const subscribeToSettingsStorage = (onStoreChange: () => void) => {
    if (typeof window === 'undefined') {
        return () => { };
    }

    let active = true;
    let pending = false;
    const flushChange = () => {
        pending = false;
        if (active) {
            onStoreChange();
        }
    };
    const handleChange = () => {
        if (pending) return;
        pending = true;
        if (typeof queueMicrotask === 'function') {
            queueMicrotask(flushChange);
            return;
        }
        Promise.resolve().then(flushChange);
    };
    STORAGE_EVENTS.forEach((eventName) => window.addEventListener(eventName, handleChange));

    return () => {
        active = false;
        STORAGE_EVENTS.forEach((eventName) => window.removeEventListener(eventName, handleChange));
    };
};

/**
 * Cached snapshot reader that avoids re-renders when the underlying value
 * hasn't actually changed. Each reader maintains its own cached value and
 * only returns a new reference when the raw value differs, preventing
 * useSyncExternalStore from triggering unnecessary re-renders.
 */
const createCachedSnapshotReader = <T,>(readSnapshot: StorageSnapshotReader<T>, fallbackValue: T) => {
    let cachedRaw: string | undefined;
    let cachedValue: T = fallbackValue;

    return (): T => {
        if (typeof window === 'undefined') return fallbackValue;
        const raw = readSnapshot();
        const rawStr = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
        if (rawStr !== cachedRaw) {
            cachedRaw = rawStr;
            cachedValue = raw;
        }
        return cachedValue;
    };
};

export const useSettingsStorageValue = <T,>(
    readSnapshot: StorageSnapshotReader<T>,
    fallbackValue: T,
    dependencies: DependencyList = [],
) => {
    const cachedReader = useMemo(
        () => createCachedSnapshotReader(readSnapshot, fallbackValue),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        dependencies,
    );
    return useSyncExternalStore(
        subscribeToSettingsStorage,
        cachedReader,
        () => fallbackValue
    );
};

