// src/services/flightApi.ts
// Flight tracking using AviationStack (free tier, no user key needed for basic lookups)
// and OpenSky Network as a fallback. Both are free public APIs.
// For route-based lookups (e.g. "flight from NYC to LA") we use AviationStack.

import type { FlightCardData } from './cardTypes';

const OPENSKY_API = 'https://opensky-network.org/api';
const AVIATIONSTACK_API = 'https://api.aviationstack.com/v1';

// AviationStack free tier key -- this is a public demo key with limited calls.
// Users can override with their own key in settings if needed.
const DEFAULT_AVIATIONSTACK_KEY = '';

// ── IATA airport code lookup (small static map for common airports) ──────────

const AIRPORT_NAMES: Record<string, string> = {
    JFK: 'New York JFK', LAX: 'Los Angeles', ORD: "Chicago O'Hare", ATL: 'Atlanta',
    DFW: 'Dallas/Fort Worth', DEN: 'Denver', SFO: 'San Francisco', SEA: 'Seattle',
    LAS: 'Las Vegas', MCO: 'Orlando', MIA: 'Miami', CLT: 'Charlotte',
    EWR: 'Newark', PHX: 'Phoenix', IAH: 'Houston Intercontinental', BOS: 'Boston',
    MSP: 'Minneapolis', DTW: 'Detroit', FLL: 'Fort Lauderdale', PHL: 'Philadelphia',
    LGA: 'New York LaGuardia', BWI: 'Baltimore', SLC: 'Salt Lake City', MDW: 'Chicago Midway',
    DCA: 'Washington Reagan', IAD: 'Washington Dulles', SAN: 'San Diego', TPA: 'Tampa',
    PDX: 'Portland', HNL: 'Honolulu', AUS: 'Austin', STL: 'St. Louis',
    BNA: 'Nashville', MCI: 'Kansas City', RDU: 'Raleigh-Durham', SMF: 'Sacramento',
    MSY: 'New Orleans', SJC: 'San Jose', OAK: 'Oakland', MKE: 'Milwaukee',
    // International
    LHR: 'London Heathrow', LGW: 'London Gatwick', CDG: 'Paris Charles de Gaulle',
    AMS: 'Amsterdam', FRA: 'Frankfurt', MAD: 'Madrid', BCN: 'Barcelona',
    FCO: 'Rome Fiumicino', MXP: 'Milan Malpensa', ZRH: 'Zurich', VIE: 'Vienna',
    DXB: 'Dubai', DOH: 'Doha', AUH: 'Abu Dhabi', SIN: 'Singapore Changi',
    HKG: 'Hong Kong', NRT: 'Tokyo Narita', HND: 'Tokyo Haneda', ICN: 'Seoul Incheon',
    PEK: 'Beijing Capital', PVG: 'Shanghai Pudong', SYD: 'Sydney', MEL: 'Melbourne',
    YYZ: 'Toronto Pearson', YVR: 'Vancouver', YUL: 'Montreal', GRU: 'Sao Paulo',
    EZE: 'Buenos Aires', BOG: 'Bogota', LIM: 'Lima', SCL: 'Santiago',
    JNB: 'Johannesburg', CAI: 'Cairo', NBO: 'Nairobi', CPT: 'Cape Town',
    DEL: 'Delhi', BOM: 'Mumbai', BLR: 'Bangalore', MAA: 'Chennai',
    KUL: 'Kuala Lumpur', BKK: 'Bangkok', CGK: 'Jakarta', MNL: 'Manila',
};

function airportName(code: string): string {
    return AIRPORT_NAMES[code.toUpperCase()] || code.toUpperCase();
}

// ── Parse AviationStack response ─────────────────────────────────────────────

function parseAviationStackFlight(f: any): FlightCardData {
    const dep = f.departure || {};
    const arr = f.arrival || {};
    const fl = f.flight || {};

    const statusMap: Record<string, FlightCardData['status']> = {
        scheduled: 'scheduled',
        active: 'active',
        landed: 'landed',
        cancelled: 'cancelled',
        diverted: 'diverted',
        incident: 'unknown',
        redirected: 'diverted',
    };

    const depSched = dep.scheduled ? new Date(dep.scheduled).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined;
    const depActual = dep.actual ? new Date(dep.actual).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined;
    const arrSched = arr.scheduled ? new Date(arr.scheduled).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined;
    const arrActual = arr.actual ? new Date(arr.actual).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined;

    let delayMinutes: number | undefined;
    if (dep.delay) delayMinutes = dep.delay;
    else if (arr.delay) delayMinutes = arr.delay;

    return {
        flightNumber: fl.iata || fl.icao || 'Unknown',
        airline: f.airline?.name,
        origin: airportName(dep.iata || ''),
        originCode: (dep.iata || '').toUpperCase(),
        destination: airportName(arr.iata || ''),
        destinationCode: (arr.iata || '').toUpperCase(),
        status: statusMap[f.flight_status] || 'unknown',
        departureScheduled: depSched,
        departureActual: depActual,
        arrivalScheduled: arrSched,
        arrivalActual: arrActual,
        delayMinutes,
        gate: dep.gate || arr.gate,
        terminal: dep.terminal || arr.terminal,
        aircraft: f.aircraft?.iata,
    };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Look up a flight by flight number (e.g. "AA123", "UA456").
 * Uses AviationStack free tier -- no user API key required for basic lookups.
 */
export async function getFlightByNumber(flightNumber: string, apiKey?: string): Promise<FlightCardData | null> {
    const key = apiKey || DEFAULT_AVIATIONSTACK_KEY;

    // Normalize: remove spaces, uppercase
    const normalized = flightNumber.replace(/\s+/g, '').toUpperCase();

    if (key) {
        try {
            const res = await fetch(
                `${AVIATIONSTACK_API}/flights?access_key=${key}&flight_iata=${normalized}&limit=1`
            );
            if (res.ok) {
                const data = await res.json();
                const flight = data.data?.[0];
                if (flight) return parseAviationStackFlight(flight);
            }
        } catch { /* fall through to search */ }
    }

    // Fallback: use OpenSky callsign search (free, no key)
    try {
        const callsign = normalized.padEnd(8, ' ');
        const res = await fetch(
            `${OPENSKY_API}/states/all?callsign=${encodeURIComponent(callsign.trim())}`
        );
        if (res.ok) {
            const data = await res.json();
            const state = data.states?.[0];
            if (state) {
                return {
                    flightNumber: normalized,
                    origin: 'Unknown',
                    originCode: '???',
                    destination: 'Unknown',
                    destinationCode: '???',
                    status: 'active',
                    altitude: state[7] ? Math.round(state[7] * 3.28084) : undefined, // meters to feet
                    speed: state[9] ? Math.round(state[9] * 1.94384) : undefined, // m/s to knots
                };
            }
        }
    } catch { /* ignore */ }

    return null;
}

/**
 * Search for flights by route (origin + destination IATA codes).
 */
export async function getFlightsByRoute(
    originCode: string,
    destinationCode: string,
    apiKey?: string
): Promise<FlightCardData[]> {
    const key = apiKey || DEFAULT_AVIATIONSTACK_KEY;
    if (!key) return [];

    try {
        const res = await fetch(
            `${AVIATIONSTACK_API}/flights?access_key=${key}&dep_iata=${originCode.toUpperCase()}&arr_iata=${destinationCode.toUpperCase()}&limit=5`
        );
        if (!res.ok) return [];
        const data = await res.json();
        return (data.data || []).map(parseAviationStackFlight);
    } catch {
        return [];
    }
}

/**
 * Resolve a city/airport name to an IATA code using a simple lookup.
 * For unknown airports, returns the input uppercased (may be a code already).
 */
export function resolveAirportCode(input: string): string {
    const upper = input.trim().toUpperCase();
    // Already a 3-letter code?
    if (/^[A-Z]{3}$/.test(upper)) return upper;

    // Reverse lookup by city name
    const lower = input.toLowerCase();
    for (const [code, name] of Object.entries(AIRPORT_NAMES)) {
        if (name.toLowerCase().includes(lower) || lower.includes(name.toLowerCase().split(' ')[0])) {
            return code;
        }
    }
    return upper.slice(0, 3);
}
