import { beforeEach, describe, expect, it, vi } from 'vitest';

let googleApiKey = '';

vi.mock('../utils/settingsStorage', () => ({
  getGoogleApiKeyAsync: vi.fn(async () => googleApiKey),
}));

const fetchMock = vi.fn();
const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';

const createResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERROR',
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  }) as unknown as Response;

describe('searchPlaces', () => {
  beforeEach(() => {
    googleApiKey = '';
    fetchMock.mockReset();
    vi.resetModules();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('uses Photon when no Google API key is present', async () => {
    fetchMock.mockResolvedValue(
      createResponse(200, {
        features: [
          {
            geometry: { coordinates: [-122.3321, 47.6062] },
            properties: { name: 'Coffee Shop', city: 'Seattle', country: 'United States' },
          },
        ],
      }),
    );

    const { searchPlaces } = await import('./placesApi');
    const result = await searchPlaces('coffee shops');

    expect(result.success).toBe(true);
    expect(result.places?.[0]).toMatchObject({
      displayName: 'Coffee Shop',
      mapsUrl: 'https://www.openstreetmap.org/?mlat=47.6062&mlon=-122.3321#map=17/47.6062/-122.3321',
    });
    expect(result.places?.[0]?.staticMapUrl).toBeUndefined();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes(PLACES_URL))).toBe(false);
  });

  it('returns Google Places results without generating static map URLs', async () => {
    googleApiKey = 'valid-key';
    fetchMock.mockResolvedValue(
      createResponse(200, {
        places: [
          {
            name: 'places/123',
            displayName: { text: 'Coffee Shop' },
            formattedAddress: '123 Main St, Seattle, WA',
            location: { latitude: 47.6062, longitude: -122.3321 },
            googleMapsUri: 'https://maps.google.com/?cid=123',
          },
        ],
      }),
    );

    const { searchPlaces } = await import('./placesApi');
    const result = await searchPlaces('coffee shops');

    expect(result.success).toBe(true);
    expect(result.places?.[0]).toMatchObject({
      displayName: 'Coffee Shop',
      mapsUrl: 'https://maps.google.com/?cid=123',
    });
    expect(result.places?.[0]?.staticMapUrl).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to Photon when Google Places returns 403', async () => {
    googleApiKey = 'blocked-key';
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(PLACES_URL)) {
        return Promise.resolve(createResponse(403, { error: { message: 'Forbidden' } }));
      }

      if (url.includes('photon.komoot.io')) {
        return Promise.resolve(
          createResponse(200, {
            features: [
              {
                geometry: { coordinates: [-122.3321, 47.6062] },
                properties: { name: 'Coffee Shop', city: 'Seattle', country: 'United States' },
              },
            ],
          }),
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { searchPlaces } = await import('./placesApi');
    const result = await searchPlaces('coffee shops');

    expect(result.success).toBe(true);
    expect(result.places?.[0]?.mapsUrl).toContain('openstreetmap.org');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes(PLACES_URL))).toBe(true);
  });

  it('suppresses repeated Google Places retries after a 403 and resets when the key changes', async () => {
    const { searchPlaces } = await import('./placesApi');

    googleApiKey = 'blocked-key';
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(PLACES_URL)) {
        return Promise.resolve(createResponse(403, { error: { message: 'Forbidden' } }));
      }

      if (url.includes('photon.komoot.io')) {
        return Promise.resolve(
          createResponse(200, {
            features: [
              {
                geometry: { coordinates: [-122.3321, 47.6062] },
                properties: { name: 'Coffee Shop', city: 'Seattle', country: 'United States' },
              },
            ],
          }),
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await searchPlaces('coffee shops');

    fetchMock.mockClear();
    await searchPlaces('coffee shops');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes(PLACES_URL))).toBe(false);

    googleApiKey = 'fresh-key';
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      createResponse(200, {
        places: [
          {
            name: 'places/123',
            displayName: { text: 'Coffee Shop' },
            formattedAddress: '123 Main St, Seattle, WA',
            location: { latitude: 47.6062, longitude: -122.3321 },
            googleMapsUri: 'https://maps.google.com/?cid=123',
          },
        ],
      }),
    );

    const result = await searchPlaces('coffee shops');
    expect(result.success).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes(PLACES_URL))).toBe(true);
  });
});
