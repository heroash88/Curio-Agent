import { useSyncExternalStore } from 'react';

export type HaMcpRuntimeStatus = 'idle' | 'checking' | 'connected' | 'error';

export interface HaMcpRuntimeSnapshot {
    status: HaMcpRuntimeStatus;
    error: string | null;
}

const HA_MCP_RUNTIME_EVENT = 'curio:ha-mcp-runtime-status-changed';

const DEFAULT_SNAPSHOT: HaMcpRuntimeSnapshot = {
    status: 'idle',
    error: null,
};

let currentSnapshot: HaMcpRuntimeSnapshot = DEFAULT_SNAPSHOT;

export const getHaMcpRuntimeSnapshot = (): HaMcpRuntimeSnapshot => currentSnapshot;

export const subscribeToHaMcpRuntimeStatus = (onStoreChange: () => void) => {
    if (typeof window === 'undefined') {
        return () => {};
    }

    const handleChange = () => onStoreChange();
    window.addEventListener(HA_MCP_RUNTIME_EVENT, handleChange);

    return () => {
        window.removeEventListener(HA_MCP_RUNTIME_EVENT, handleChange);
    };
};

export const useHaMcpRuntimeStatus = () =>
    useSyncExternalStore(
        subscribeToHaMcpRuntimeStatus,
        getHaMcpRuntimeSnapshot,
        () => DEFAULT_SNAPSHOT
    );

export const setHaMcpRuntimeStatus = (
    status: HaMcpRuntimeStatus,
    error: string | null = null,
) => {
    currentSnapshot = { status, error };

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(HA_MCP_RUNTIME_EVENT, { detail: currentSnapshot }));
    }
};

export const resetHaMcpRuntimeStatus = () => {
    setHaMcpRuntimeStatus('idle', null);
};
