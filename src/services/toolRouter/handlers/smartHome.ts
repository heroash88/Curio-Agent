/**
 * Smart home summary cards (energy, security). The handlers forward args
 * verbatim because the cards accept an open-ended shape.
 */

import { register } from '../router';

register('show_energy', async (args, ctx) => {
    if (ctx.onCardEvent) {
        try {
            ctx.onCardEvent({ type: 'energy', data: { ...args }, autoDismissMs: 20000 });
        } catch {}
    }
    return { result: { success: true, message: 'Energy dashboard displayed.' }, emittedCard: true };
});

register('show_security', async (args, ctx) => {
    if (ctx.onCardEvent) {
        try {
            ctx.onCardEvent({ type: 'security', data: { ...args }, autoDismissMs: 20000 });
        } catch {}
    }
    return { result: { success: true, message: 'Security card displayed.' }, emittedCard: true };
});
