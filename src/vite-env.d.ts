/// <reference types="vite/client" />
import { Point, Coordinates, Region, RegionAnalysis } from './types';
import type { CurioDesktopBridge } from './desktop/desktopTypes';

declare global {
    /** Injected by Vite `define` — reads from package.json at build time. */
    const __APP_VERSION__: string;
    interface Window {
        lastPointedLocation?: any[];
        lastPointedCoordinates?: any;
        coloringBookRegions?: any[];
        regionAnalysis?: any[];
        curioDesktop?: CurioDesktopBridge;
        __CURIO_DESKTOP_ROLE__?: string;
    }

    // Standard elements (div, button, etc.) are available by default from React.
    // We only need to add custom elements like 'model-viewer'.
    namespace JSX {
        interface IntrinsicElements {
            'model-viewer': any;
        }
    }

    // Web Bluetooth stubs
    interface BluetoothDevice {
        name?: string;
        gatt?: any;
        addEventListener: any;
        removeEventListener: any;
    }

    interface BluetoothRemoteGATTServer {
        connected: boolean;
        connect(): Promise<any>;
        disconnect(): void;
        getPrimaryService(service: any): Promise<any>;
    }

    interface BluetoothRemoteGATTCharacteristic {
        value?: DataView;
        writeValue(value: BufferSource): Promise<void>;
        writeValueWithResponse?(value: BufferSource): Promise<void>;
        startNotifications(): Promise<any>;
        stopNotifications(): Promise<any>;
        addEventListener(type: string, listener: any): void;
        removeEventListener(type: string, listener: any): void;
    }
}
