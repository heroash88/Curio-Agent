/**
 * Places search and directions handlers.
 *
 * Both handlers accept explicit coordinates; when none are provided they
 * attempt to read the current browser position so the AI does not need to
 * know where the user is.
 */

import { register } from '../router';

register('search_places', async (args, ctx) => {
    try {
        const { searchPlaces } = await import('../../placesApi');
        let locationBias = (args?.latitude != null && args?.longitude != null)
            ? { latitude: args.latitude, longitude: args.longitude, radiusMeters: args.radiusMeters }
            : undefined;
        if (!locationBias) {
            const { getCurrentPosition } = await import('../../weatherService');
            const pos = await getCurrentPosition();
            if (pos) locationBias = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, radiusMeters: args?.radiusMeters || 10000 };
        }
        const placesResult = await searchPlaces(args?.query || '', locationBias);
        if (placesResult.success && placesResult.places) {
            const result = {
                success: true,
                places: placesResult.places.map(p => ({ name: p.displayName, address: p.formattedAddress, rating: p.rating, totalRatings: p.userRatingCount, openNow: p.regularOpeningHours?.openNow, hours: p.regularOpeningHours?.weekdayDescriptions, priceLevel: p.priceLevel, phone: p.nationalPhoneNumber, website: p.websiteUri, mapsUrl: p.mapsUrl })),
            };
            if (ctx.onCardEvent) {
                const centerMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(args?.query || '')}`;
                try {
                    ctx.onCardEvent({
                        type: 'places',
                        data: {
                            query: args?.query || '',
                            places: placesResult.places.map(p => ({ name: p.displayName, address: p.formattedAddress, rating: p.rating, userRatingCount: p.userRatingCount, priceLevel: p.priceLevel, openNow: p.regularOpeningHours?.openNow, location: p.location, staticMapUrl: p.staticMapUrl, mapsUrl: p.mapsUrl })),
                            centerMapUrl,
                        },
                    });
                } catch {}
            }
            return { result, emittedCard: true };
        }
        return { result: { success: false, error: placesResult.error || 'No places found.' }, emittedCard: false };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message || 'Places search failed.' }, emittedCard: false };
    }
});

register('get_directions', async (args, ctx) => {
    try {
        const { computeRoute } = await import('../../routesApi');
        let originLatLng = (args?.originLatitude != null && args?.originLongitude != null)
            ? { latitude: args.originLatitude, longitude: args.originLongitude }
            : undefined;
        const isCurrentLocal = !args?.origin || args.origin.toLowerCase() === 'current location' || args.origin.toLowerCase() === 'my location';
        if (!originLatLng && isCurrentLocal) {
            const { getCurrentPosition } = await import('../../weatherService');
            const pos = await getCurrentPosition();
            if (pos) originLatLng = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        }
        const routeResult = await computeRoute(args?.origin || '', args?.destination || '', args?.travelMode || 'driving', originLatLng);
        if (routeResult.success && routeResult.route) {
            const r = routeResult.route;
            if (ctx.onCardEvent) {
                try {
                    ctx.onCardEvent({ type: 'map', data: { destination: r.destination, origin: r.origin, travelMode: r.travelMode, distance: r.distance, duration: r.durationInTraffic, steps: r.steps, mapUrl: r.mapUrl, encodedPolyline: r.encodedPolyline, staticMapUrl: r.staticMapUrl } });
                } catch {}
            }
            return {
                result: { success: true, origin: r.origin, destination: r.destination, distance: r.distance, duration: r.duration, durationInTraffic: r.durationInTraffic, trafficCondition: r.trafficCondition, route: r.route, steps: r.steps.slice(0, 8), mapsUrl: r.mapUrl },
                emittedCard: true,
            };
        }
        return { result: { success: false, error: routeResult.error || 'No route found.' }, emittedCard: false };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message || 'Directions lookup failed.' }, emittedCard: false };
    }
});
