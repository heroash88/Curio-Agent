/**
 * HaCameraManager — manages Home Assistant camera streaming to the Gemini model.
 * Extracted from LiveClient to isolate HA camera concerns.
 */

import { blobToBase64Data } from '../utils/blobEncoding';

export interface HaCameraDeps {
    sendVideoFrame: (base64: string) => void;
    toggleCamera?: (enabled: boolean) => Promise<any> | any;
    hasMediaStream: () => boolean;
}

export class HaCameraManager {
    private _interval: number | null = null;
    private _entityId: string | null = null;
    private _baseUrl: string | null = null;
    private _token: string | null = null;
    private _closedHandler: (() => void) | null = null;
    private _switchHandler: ((e: Event) => void) | null = null;
    private _stopHandler: ((e: Event) => void) | null = null;
    private _onClosed: (() => void) | null = null;
    private _sourceId: string | null = null;
    private _temporary = false;
    private _deviceCameraWasOn = false;
    private deps: HaCameraDeps;

    constructor(deps: HaCameraDeps) {
        this.deps = deps;
        if (typeof window !== 'undefined') {
            this._switchHandler = (e: Event) => {
                const {
                    entityId: newEid,
                    baseUrl: newUrl,
                    token: newToken,
                    startIfIdle = true,
                    sourceId = null,
                    temporary = false,
                } = (e as CustomEvent).detail || {};
                if (!newEid || !newUrl || !newToken) return;
                if (!this.isStreaming && startIfIdle === false) return;
                console.log('[HaCameraManager] User switched camera via picker:', newEid);
                void this.start(newEid, newUrl, newToken, this._onClosed || undefined, {
                    sourceId,
                    temporary: Boolean(temporary),
                });
            };
            window.addEventListener('ha-camera-switch', this._switchHandler);
            this._stopHandler = (e: Event) => {
                const { entityId, sourceId } = (e as CustomEvent).detail || {};
                if (!this._temporary) return;
                if (entityId && entityId !== this._entityId) return;
                if (sourceId && sourceId !== this._sourceId) return;
                this.stop(true);
            };
            window.addEventListener('ha-camera-stop', this._stopHandler);
        }
    }

    /** Whether an HA camera stream is currently active. */
    get isStreaming(): boolean {
        return this._interval !== null || this._entityId !== null;
    }

    get entityId(): string | null {
        return this._entityId;
    }

    /** Start streaming HA camera frames to the model at ~0.5fps. */
    async start(
        entityId: string,
        baseUrl: string,
        token: string,
        onClosed?: () => void,
        options?: {
            sourceId?: string | null;
            temporary?: boolean;
        },
    ) {
        const nextOnClosed = onClosed || this._onClosed || undefined;
        this.stop(false); // clear existing without restoring device camera
        this._entityId = entityId;
        this._baseUrl = baseUrl;
        this._token = token;
        this._onClosed = nextOnClosed || null;
        this._sourceId = options?.sourceId || null;
        this._temporary = Boolean(options?.temporary);
        console.log('[HaCameraManager] Starting HA camera stream:', entityId);

        // Listen for card close
        this._closedHandler = () => {
            console.log('[HaCameraManager] Camera card dismissed — stopping stream');
            const currentOnClosed = this._onClosed;
            this.stop(true);
            currentOnClosed?.();
        };
        window.addEventListener('ha-camera-closed', this._closedHandler);

        // If device camera is currently on, remember it
        if (this.deps.toggleCamera && this.deps.hasMediaStream()) {
            this._deviceCameraWasOn = true;
            console.log('[HaCameraManager] Pausing device camera — HA camera taking over');
        }

        const fetchAndSend = async () => {
            if (!this._entityId || !this._baseUrl || !this._token) return;
            try {
                const url = `${this._baseUrl}/api/camera_proxy/${this._entityId}`;
                const res = await fetch(url, { headers: { Authorization: `Bearer ${this._token}` } });
                if (!res.ok) return;
                const blob = await res.blob();

                // Share frame with CameraCard UI
                window.dispatchEvent(
                    new CustomEvent('ha-camera-frame', {
                        detail: { entityId: this._entityId, blob },
                    }),
                );

                // Send to model
                const base64 = await blobToBase64Data(blob);
                if (base64) this.deps.sendVideoFrame(base64);
            } catch {}
        };

        fetchAndSend();
        this._interval = window.setInterval(fetchAndSend, 2000);
    }

    /** Stop streaming HA camera frames. */
    stop(restoreDeviceCamera = true) {
        if (this._interval) {
            window.clearInterval(this._interval);
            this._interval = null;
            console.log('[HaCameraManager] Stopped HA camera stream');
        }
        if (this._closedHandler) {
            window.removeEventListener('ha-camera-closed', this._closedHandler);
            this._closedHandler = null;
        }
        if (restoreDeviceCamera && this._deviceCameraWasOn && this.deps.toggleCamera) {
            console.log('[HaCameraManager] Restoring device camera');
            this._deviceCameraWasOn = false;
            void this.deps.toggleCamera(true);
        }
        this._entityId = null;
        this._baseUrl = null;
        this._token = null;
        this._onClosed = null;
        this._sourceId = null;
        this._temporary = false;
    }

    dispose(restoreDeviceCamera = true) {
        this.stop(restoreDeviceCamera);
        if (this._switchHandler && typeof window !== 'undefined') {
            window.removeEventListener('ha-camera-switch', this._switchHandler);
            this._switchHandler = null;
        }
        if (this._stopHandler && typeof window !== 'undefined') {
            window.removeEventListener('ha-camera-stop', this._stopHandler);
            this._stopHandler = null;
        }
    }
}
