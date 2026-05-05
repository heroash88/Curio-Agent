import type { CardEvent } from '../../cardTypes';

const TRACK_FLIGHT = /\b(?:track|where is|status of|find)\s+(?:flight\s+)?([A-Z]{2}\d{1,4})\b/i;
const FLIGHT_ROUTE = /\b(?:flights?|fly|flying)\s+(?:from\s+)(.+?)\s+(?:to)\s+(.+?)(?:\s|$)/i;

export function detectFlight(_normalized: string, trimmed: string): CardEvent | null {
    const numberMatch = trimmed.match(TRACK_FLIGHT);
    if (numberMatch) {
        return {
            type: 'flight' as any,
            data: {
                flightNumber: numberMatch[1].toUpperCase(),
                origin: 'Unknown', originCode: '???',
                destination: 'Unknown', destinationCode: '???',
                status: 'unknown',
            },
        };
    }
    const routeMatch = trimmed.match(FLIGHT_ROUTE);
    if (routeMatch) {
        return {
            type: 'flight' as any,
            data: {
                flightNumber: 'Route Search',
                origin: routeMatch[1].trim(), originCode: '???',
                destination: routeMatch[2].trim(), destinationCode: '???',
                status: 'unknown',
            },
        };
    }
    return null;
}
