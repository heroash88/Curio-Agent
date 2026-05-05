/**
 * Core tool router: handler registry, types, and dispatch.
 *
 * Handlers live in files under ./handlers/ and register themselves as a
 * side effect when that module is imported. The top-level
 * `src/services/toolCallRouter.ts` barrel is responsible for importing the
 * handler tree so registrations happen before any caller dispatches a
 * tool call.
 */

import type { CardEvent } from '../cardTypes';

export interface ToolCallContext {
    onCardEvent?: (event: CardEvent) => void;
    entityCache?: any[];
    handler?: {
        toggleCamera?: (enabled: boolean) => Promise<any> | any;
        flipCamera?: () => Promise<any> | any;
        navigateToSubject?: (subject: string) => void;
        get_weather?: (city?: string) => Promise<any> | any;
    };
    onMcpToolCall?: (name: string, args: any) => Promise<any>;
    disconnect: () => void;
    startHaCameraStream: (entityId: string, baseUrl: string, token: string) => Promise<void>;
    stopHaCameraStream: (restoreDeviceCamera?: boolean) => void;
    isHaCameraStreaming: boolean;
    requestAmbientSpeech?: (text: string) => void;
}

export interface ToolCallResult {
    result: any;
    emittedCard: boolean;
}

export type ToolHandler = (args: any, ctx: ToolCallContext) => Promise<ToolCallResult>;

const handlers = new Map<string, ToolHandler>();

export function register(name: string, handler: ToolHandler): void {
    handlers.set(name, handler);
}

export function getToolHandler(name: string): ToolHandler | undefined {
    return handlers.get(name);
}

export async function routeToolCall(
    name: string,
    args: any,
    ctx: ToolCallContext,
): Promise<ToolCallResult> {
    const handler = handlers.get(name);
    if (!handler) {
        return {
            result: { success: false, error: `No handler registered for ${name}` },
            emittedCard: false,
        };
    }

    return handler(args, ctx);
}
