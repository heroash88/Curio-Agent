/**
 * After a tool call is handled, check if it should emit a device card via
 * the interceptor. This handles HA device state changes that produce
 * DeviceCard events.
 */

import type { CardEvent } from '../cardTypes';
import { interceptToolCall } from '../cardInterceptor';

export function interceptForDeviceCard(
    name: string,
    args: any,
    result: any,
    entityCache: any[] | undefined,
    onCardEvent: ((event: CardEvent) => void) | undefined,
): boolean {
    if (!onCardEvent || !entityCache) return false;
    const cardEvent = interceptToolCall(name, args, result, entityCache);
    if (cardEvent) {
        try { onCardEvent(cardEvent); } catch {}
        return true;
    }
    return false;
}
