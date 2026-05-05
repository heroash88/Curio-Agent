import { getGoogleApiKeyAsync } from '../utils/settingsStorage';

const PLACES_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
let placesApiUnavailableKey: string | null = null;

export interface PlaceResult {
  name: string;
  displayName: string;
  formattedAddress: string;
  rating?: number;
  userRatingCount?: number;
  types: string[];
  location?: { latitude: number; longitude: number };
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  priceLevel?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  mapsUrl?: string;
  staticMapUrl?: string;
}

export interface PlacesSearchResult {
  success: boolean;
  places?: PlaceResult[];
  error?: string;
}

/**
 * Search for places using Google Places API (New) Text Search.
 * Requires a Google API key with Places API (New) enabled.
 */
export const searchPlaces = async (
  query: string,
  locationBias?: { latitude: number; longitude: number; radiusMeters?: number },
): Promise<PlacesSearchResult> => {
  const apiKey = (await getGoogleApiKeyAsync()).trim();
  const trimmed = query.trim();
  if (!trimmed) {
    return { success: false, error: 'A search query is required.' };
  }

  const fallbackToPhoton = async (bias?: { lat: number; lon: number }): Promise<PlacesSearchResult> => {
    try {
      let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=5`;
      if (bias) {
        url += `&lat=${bias.lat}&lon=${bias.lon}&location_bias_scale=0.1`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const places: PlaceResult[] = (data.features || []).map((feature: any) => {
        const properties = feature.properties || {};
        const displayName = properties.name || properties.street || properties.city || 'Unknown Place';
        const addressParts = [
          properties.name,
          properties.street,
          properties.city,
          properties.state,
          properties.country,
        ].filter(Boolean);
        const addressStr = Array.from(new Set(addressParts)).join(', ');

        const longitude = feature.geometry?.coordinates?.[0];
        const latitude = feature.geometry?.coordinates?.[1];
        const location = latitude !== undefined && longitude !== undefined
          ? { latitude, longitude }
          : undefined;

        return {
          name: displayName,
          displayName,
          formattedAddress: addressStr || '',
          types: properties.type ? [properties.type] : [],
          location,
          mapsUrl: location
            ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`
            : undefined,
        };
      });

      return { success: true, places };
    } catch (e) {
      return { success: false, error: 'Free places search fallback failed: ' + (e as Error).message };
    }
  };

  if (!apiKey) {
    return fallbackToPhoton(
      locationBias ? { lat: locationBias.latitude, lon: locationBias.longitude } : undefined,
    );
  }

  if (placesApiUnavailableKey === apiKey) {
    console.warn('[PlacesAPI] Key is blacklisted due to previous 403. Falling back to Photon.');
    return fallbackToPhoton(
      locationBias ? { lat: locationBias.latitude, lon: locationBias.longitude } : undefined,
    );
  }

  console.log('[PlacesAPI] Attempting Google Places search...', { query });

  const body: Record<string, unknown> = {
    textQuery: trimmed,
    maxResultCount: 5,
    languageCode: 'en',
  };

  if (locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: locationBias.latitude, longitude: locationBias.longitude },
        radius: locationBias.radiusMeters ?? 10000,
      },
    };
  }

  const fieldMask = [
    'places.displayName',
    'places.formattedAddress',
    'places.rating',
    'places.userRatingCount',
    'places.types',
    'places.location',
    'places.regularOpeningHours',
    'places.priceLevel',
    'places.websiteUri',
    'places.nationalPhoneNumber',
    'places.googleMapsUri',
  ].join(',');

  try {
    const response = await fetch(PLACES_TEXT_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      const msg = errData?.error?.message || `Google Places API error (${response.status})`;
      console.error('[PlacesAPI] Request failed:', msg, errData);

      if (response.status === 403) {
        placesApiUnavailableKey = apiKey;
        console.warn('[PlacesAPI] 403 Forbidden. Blacklisting key for this session.');
        return fallbackToPhoton(
          locationBias ? { lat: locationBias.latitude, lon: locationBias.longitude } : undefined,
        );
      }

      if (response.status === 400) {
        return fallbackToPhoton(
          locationBias ? { lat: locationBias.latitude, lon: locationBias.longitude } : undefined,
        );
      }

      return { success: false, error: msg };
    }

    const json = await response.json();
    console.log('[PlacesAPI] Successfully retrieved Google places.');
    const places: PlaceResult[] = (json.places || []).map((place: any) => ({
      name: place.name || '',
      displayName: place.displayName?.text || '',
      formattedAddress: place.formattedAddress || '',
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      types: place.types || [],
      location: place.location,
      regularOpeningHours: place.regularOpeningHours,
      priceLevel: place.priceLevel,
      websiteUri: place.websiteUri,
      nationalPhoneNumber: place.nationalPhoneNumber,
      mapsUrl: place.googleMapsUri,
    }));

    return { success: true, places };
  } catch {
    return fallbackToPhoton(
      locationBias ? { lat: locationBias.latitude, lon: locationBias.longitude } : undefined,
    );
  }
};
