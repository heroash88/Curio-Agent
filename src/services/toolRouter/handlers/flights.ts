/**
 * Flight tracking handler. Builds a minimal placeholder card when neither
 * a flight number nor a full origin/destination pair resolves, so the AI
 * can fill in the details via search grounding.
 */

import { register } from '../router';

register('track_flight', async (args, ctx) => {
    try {
        const { getFlightByNumber, getFlightsByRoute, resolveAirportCode } = await import('../../flightApi');
        let flightData = null;

        if (args?.flightNumber) {
            flightData = await getFlightByNumber(args.flightNumber);
        } else if (args?.originCity && args?.destinationCity) {
            const originCode = resolveAirportCode(args.originCity);
            const destCode = resolveAirportCode(args.destinationCity);
            const flights = await getFlightsByRoute(originCode, destCode);
            flightData = flights[0] || null;
        }

        if (!flightData) {
            // Build a minimal card from what we know so the AI can fill in details via search
            flightData = {
                flightNumber: args?.flightNumber || 'Unknown',
                origin: args?.originCity || 'Unknown',
                originCode: args?.originCity ? resolveAirportCode(args.originCity) : '???',
                destination: args?.destinationCity || 'Unknown',
                destinationCode: args?.destinationCity ? resolveAirportCode(args.destinationCity) : '???',
                status: 'unknown' as const,
            };
        }

        if (ctx.onCardEvent) {
            try {
                ctx.onCardEvent({ type: 'flight', data: flightData as unknown as Record<string, unknown>, autoDismissMs: 30000 });
            } catch {}
        }
        return { result: { success: true, flight: flightData }, emittedCard: true };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});
