import { beforeEach, describe, expect, it, vi } from 'vitest';

let googleApiKey = '';

vi.mock('../utils/settingsStorage', () => ({
  getGoogleApiKeyAsync: vi.fn(async () => googleApiKey),
}));

const fetchMock = vi.fn();

const createResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERROR',
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  }) as unknown as Response;

const OSRM_POLYLINE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

describe('computeRoute', () => {
  beforeEach(() => {
    googleApiKey = '';
    fetchMock.mockReset();
    vi.resetModules();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('uses the OSRM fallback when no Google API key is present', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('photon.komoot.io')) {
        return Promise.resolve(
          createResponse(200, {
            features: [
              {
                geometry: { coordinates: [-122.3321, 47.6062] },
                properties: { name: 'Downtown Seattle' },
              },
            ],
          }),
        );
      }

      if (url.includes('router.project-osrm.org')) {
        return Promise.resolve(
          createResponse(200, {
            routes: [
              {
                distance: 10500,
                duration: 1260,
                geometry: OSRM_POLYLINE,
                legs: [
                  {
                    summary: 'I-5 N',
                    steps: [
                      {
                        maneuver: { type: 'turn', modifier: 'right' },
                        name: 'Pine Street',
                        distance: 1609.344,
                        duration: 120,
                      },
                    ],
                  },
                ],
              },
            ],
          }),
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { computeRoute } = await import('./routesApi');
    const result = await computeRoute(
      'Current Location',
      'Downtown Seattle',
      'driving',
      { latitude: 47.6038, longitude: -122.3301 },
    );

    expect(result.success).toBe(true);
    expect(result.route?.encodedPolyline).toBe(OSRM_POLYLINE);
    expect(result.route?.staticMapUrl).toBeUndefined();
    expect(result.route?.mapUrl).toContain('openstreetmap.org/directions');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes(ROUTES_URL))).toBe(false);
  });

  it('returns Google Routes results without generating a static map URL', async () => {
    googleApiKey = 'valid-key';
    fetchMock.mockResolvedValue(
      createResponse(200, {
        routes: [
          {
            distanceMeters: 1609,
            duration: '900s',
            staticDuration: '840s',
            description: 'I-5 N',
            polyline: { encodedPolyline: OSRM_POLYLINE },
            legs: [
              {
                localizedValues: { distance: { text: '1.0 mi' } },
                steps: [
                  {
                    navigationInstruction: { instructions: 'Head north on 5th Ave' },
                    localizedValues: {
                      distance: { text: '0.5 mi' },
                      duration: { text: '2 min' },
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    const { computeRoute } = await import('./routesApi');
    const result = await computeRoute('Seattle', 'Bellevue', 'walking');

    expect(result.success).toBe(true);
    expect(result.route?.encodedPolyline).toBe(OSRM_POLYLINE);
    expect(result.route?.staticMapUrl).toBeUndefined();
    expect(result.route?.mapUrl).toContain('google.com/maps/dir');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to OSRM when Google Routes returns 403', async () => {
    googleApiKey = 'blocked-key';
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(ROUTES_URL)) {
        return Promise.resolve(createResponse(403, { error: { message: 'Forbidden' } }));
      }

      if (url.includes('photon.komoot.io')) {
        return Promise.resolve(
          createResponse(200, {
            features: [
              {
                geometry: { coordinates: [-122.3321, 47.6062] },
                properties: { name: 'Downtown Seattle' },
              },
            ],
          }),
        );
      }

      if (url.includes('router.project-osrm.org')) {
        return Promise.resolve(
          createResponse(200, {
            routes: [
              {
                distance: 10500,
                duration: 1260,
                geometry: OSRM_POLYLINE,
                legs: [{ summary: 'I-5 N', steps: [] }],
              },
            ],
          }),
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { computeRoute } = await import('./routesApi');
    const result = await computeRoute(
      'Current Location',
      'Downtown Seattle',
      'driving',
      { latitude: 47.6038, longitude: -122.3301 },
    );

    expect(result.success).toBe(true);
    expect(result.route?.mapUrl).toContain('openstreetmap.org/directions');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes(ROUTES_URL))).toBe(true);
  });

  it('suppresses repeated Google Routes retries after a 403 and resets when the key changes', async () => {
    const { computeRoute } = await import('./routesApi');

    googleApiKey = 'blocked-key';
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(ROUTES_URL)) {
        return Promise.resolve(createResponse(403, { error: { message: 'Forbidden' } }));
      }
      if (url.includes('photon.komoot.io')) {
        return Promise.resolve(
          createResponse(200, {
            features: [{ geometry: { coordinates: [-122.3321, 47.6062] }, properties: { name: 'Seattle' } }],
          }),
        );
      }
      if (url.includes('router.project-osrm.org')) {
        return Promise.resolve(
          createResponse(200, {
            routes: [{ distance: 1000, duration: 600, geometry: OSRM_POLYLINE, legs: [{ steps: [] }] }],
          }),
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await computeRoute('Current Location', 'Seattle', 'driving', {
      latitude: 47.6038,
      longitude: -122.3301,
    });

    fetchMock.mockClear();
    await computeRoute('Current Location', 'Seattle', 'driving', {
      latitude: 47.6038,
      longitude: -122.3301,
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes(ROUTES_URL))).toBe(false);

    googleApiKey = 'fresh-key';
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      createResponse(200, {
        routes: [
          {
            distanceMeters: 1609,
            duration: '900s',
            staticDuration: '840s',
            description: 'I-5 N',
            polyline: { encodedPolyline: OSRM_POLYLINE },
            legs: [{ localizedValues: { distance: { text: '1.0 mi' } }, steps: [] }],
          },
        ],
      }),
    );

    const result = await computeRoute('Seattle', 'Bellevue', 'driving');
    expect(result.success).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes(ROUTES_URL))).toBe(true);
  });

  it('does not session-disable Google Routes after a 400 response', async () => {
    googleApiKey = 'retryable-key';
    const { computeRoute } = await import('./routesApi');

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(ROUTES_URL)) {
        return Promise.resolve(createResponse(400, { error: { message: 'Bad request' } }));
      }
      if (url.includes('photon.komoot.io')) {
        return Promise.resolve(
          createResponse(200, {
            features: [{ geometry: { coordinates: [-122.3321, 47.6062] }, properties: { name: 'Seattle' } }],
          }),
        );
      }
      if (url.includes('router.project-osrm.org')) {
        return Promise.resolve(
          createResponse(200, {
            routes: [{ distance: 1000, duration: 600, geometry: OSRM_POLYLINE, legs: [{ steps: [] }] }],
          }),
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await computeRoute('Current Location', 'Seattle', 'driving', {
      latitude: 47.6038,
      longitude: -122.3301,
    });

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      createResponse(200, {
        routes: [
          {
            distanceMeters: 1609,
            duration: '900s',
            staticDuration: '840s',
            description: 'I-5 N',
            polyline: { encodedPolyline: OSRM_POLYLINE },
            legs: [{ localizedValues: { distance: { text: '1.0 mi' } }, steps: [] }],
          },
        ],
      }),
    );

    await computeRoute('Seattle', 'Bellevue', 'driving');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes(ROUTES_URL))).toBe(true);
  });
});
