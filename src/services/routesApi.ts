import { getGoogleApiKeyAsync } from '../utils/settingsStorage';

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
let routesApiUnavailableKey: string | null = null;

export interface RouteStep {
  instruction: string;
  distance: string;
  duration: string;
}

export interface RouteResult {
  origin: string;
  destination: string;
  distance: string;
  duration: string;
  durationInTraffic: string;
  staticDuration?: string;
  trafficCondition: 'light' | 'moderate' | 'heavy' | 'unknown';
  route: string;
  encodedPolyline?: string;
  steps: RouteStep[];
  mapUrl: string;
  staticMapUrl?: string;
  travelMode: string;
}

export interface RoutesSearchResult {
  success: boolean;
  route?: RouteResult;
  error?: string;
}

const TRAVEL_MODE_MAP: Record<string, string> = {
  driving: 'DRIVE',
  walking: 'WALK',
  bicycling: 'BICYCLE',
  transit: 'TRANSIT',
};

const formatDuration = (secs: number): string => {
  if (secs < 60) return `${Math.round(secs)} sec`;
  const hrs = Math.floor(secs / 3600);
  const mins = Math.round((secs % 3600) / 60);
  if (hrs > 0) return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`;
  return `${mins} min`;
};

/**
 * Compute a route using the Google Routes API.
 * Requires a Google API key with Routes API enabled.
 */
export const computeRoute = async (
  origin: string,
  destination: string,
  travelMode: string = 'driving',
  originLatLng?: { latitude: number; longitude: number },
): Promise<RoutesSearchResult> => {
  const apiKey = (await getGoogleApiKeyAsync()).trim();
  if (!destination.trim()) {
    return { success: false, error: 'A destination is required.' };
  }

  const fallbackToOSRM = async (): Promise<RoutesSearchResult> => {
    try {
      const geocodeWithPhoton = async (query: string, bias?: { lat: number; lon: number }) => {
        try {
          let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`;
          if (bias) {
            url += `&lat=${bias.lat}&lon=${bias.lon}&location_bias_scale=0.1`;
          }

          const res = await fetch(url);
          const data = await res.json();
          const feature = data.features?.[0];
          if (feature?.geometry?.coordinates) {
            return {
              lat: feature.geometry.coordinates[1],
              lon: feature.geometry.coordinates[0],
            };
          }
        } catch {
          return null;
        }

        return null;
      };

      let originCoords = originLatLng;
      if (!originCoords && origin) {
        const resolvedOrigin = await geocodeWithPhoton(origin);
        if (resolvedOrigin) {
          originCoords = { latitude: resolvedOrigin.lat, longitude: resolvedOrigin.lon };
        }
      }

      const resolvedDestination = await geocodeWithPhoton(
        destination,
        originCoords ? { lat: originCoords.latitude, lon: originCoords.longitude } : undefined,
      );
      if (!resolvedDestination) {
        return { success: false, error: 'Could not resolve destination location.' };
      }

      if (!originCoords) {
        return { success: false, error: 'Could not resolve origin location.' };
      }

      let profile = 'driving';
      if (travelMode.toLowerCase() === 'walking') profile = 'foot';
      if (travelMode.toLowerCase() === 'bicycling') profile = 'bike';

      const url = `https://router.project-osrm.org/route/v1/${profile}/${originCoords.longitude},${originCoords.latitude};${resolvedDestination.lon},${resolvedDestination.lat}?steps=true&overview=full`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const route = data.routes?.[0];
      if (!route) {
        return { success: false, error: 'No route found between those locations on OpenStreetMap.' };
      }

      const leg = route.legs?.[0];
      const distanceMeters = route.distance || 0;
      const distanceMiles = (distanceMeters / 1609.344).toFixed(1);
      const durationSecs = route.duration || 0;

      const steps: RouteStep[] = (leg?.steps || [])
        .slice(0, 15)
        .map((step: any) => {
          const type = step.maneuver?.type || 'proceed';
          const modifier = step.maneuver?.modifier ? ` ${step.maneuver.modifier}` : '';
          const name = step.name ? ` onto ${step.name}` : '';
          const instruction = `${type}${modifier}${name}`;

          return {
            instruction: instruction.charAt(0).toUpperCase() + instruction.slice(1),
            distance: `${(step.distance / 1609.344).toFixed(1)} mi`,
            duration: formatDuration(step.duration),
          };
        })
        .filter((step: RouteStep) => step.distance !== '0.0 mi');

      const mapsUrl = `https://www.openstreetmap.org/directions?engine=osrm_car&route=${originCoords.latitude}%2C${originCoords.longitude}%3B${resolvedDestination.lat}%2C${resolvedDestination.lon}`;

      return {
        success: true,
        route: {
          origin: origin || 'Current Location',
          destination,
          distance: `${distanceMiles} mi`,
          duration: formatDuration(durationSecs),
          durationInTraffic: formatDuration(durationSecs),
          trafficCondition: 'unknown',
          route: route.legs?.[0]?.summary || 'OSRM Route',
          encodedPolyline: route.geometry,
          steps,
          mapUrl: mapsUrl,
          travelMode: travelMode.toLowerCase(),
        },
      };
    } catch (e) {
      return { success: false, error: 'Free routing fallback failed: ' + (e as Error).message };
    }
  };

  if (!apiKey) {
    return fallbackToOSRM();
  }

  if (routesApiUnavailableKey === apiKey) {
    console.warn('[RoutesAPI] Key is blacklisted due to previous 403. Falling back to OSRM.');
    return fallbackToOSRM();
  }

  console.log('[RoutesAPI] Attempting Google Routes calculation...', { travelMode, destination });

  const mode = TRAVEL_MODE_MAP[travelMode.toLowerCase()] || 'DRIVE';
  const originWaypoint = originLatLng
    ? { location: { latLng: { latitude: originLatLng.latitude, longitude: originLatLng.longitude } } }
    : { address: origin || 'Current Location' };

  const body = {
    origin: originWaypoint,
    destination: { address: destination },
    travelMode: mode,
    routingPreference: mode === 'DRIVE' ? 'TRAFFIC_AWARE' : undefined,
    computeAlternativeRoutes: false,
    languageCode: 'en',
    units: 'IMPERIAL',
  };

  const fieldMask = [
    'routes.distanceMeters',
    'routes.duration',
    'routes.staticDuration',
    'routes.description',
    'routes.polyline.encodedPolyline',
    'routes.legs.steps.navigationInstruction',
    'routes.legs.steps.localizedValues',
    'routes.legs.localizedValues',
  ].join(',');

  try {
    const response = await fetch(ROUTES_URL, {
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
      const msg = errData?.error?.message || `Google Routes API error (${response.status})`;
      console.error('[RoutesAPI] Request failed:', msg, errData);

      if (response.status === 403) {
        routesApiUnavailableKey = apiKey;
        console.warn('[RoutesAPI] 403 Forbidden. Blacklisting key for this session.');
        return fallbackToOSRM();
      }

      if (response.status === 400) {
        return fallbackToOSRM();
      }

      return { success: false, error: msg };
    }

    const json = await response.json();
    console.log('[RoutesAPI] Successfully calculated Google route.');
    const route = json.routes?.[0];
    if (!route) {
      return { success: false, error: 'No route found between those locations.' };
    }

    const leg = route.legs?.[0];
    const durationSecs = parseInt(route.duration?.replace('s', '') || '0', 10);
    const staticDurationSecs = parseInt(route.staticDuration?.replace('s', '') || '0', 10);
    const distanceMeters = route.distanceMeters || 0;
    const distanceMiles = (distanceMeters / 1609.344).toFixed(1);

    let trafficCondition: RouteResult['trafficCondition'] = 'unknown';
    if (staticDurationSecs > 0 && durationSecs > 0) {
      const ratio = durationSecs / staticDurationSecs;
      if (ratio < 1.15) trafficCondition = 'light';
      else if (ratio < 1.4) trafficCondition = 'moderate';
      else trafficCondition = 'heavy';
    }

    const steps: RouteStep[] = (leg?.steps || [])
      .filter((step: any) => step.navigationInstruction?.instructions)
      .slice(0, 15)
      .map((step: any) => ({
        instruction: step.navigationInstruction.instructions,
        distance: step.localizedValues?.distance?.text || '',
        duration: step.localizedValues?.duration?.text || '',
      }));

    const mapsUrl = originLatLng 
      ? `https://www.google.com/maps/dir/?api=1&origin=${originLatLng.latitude},${originLatLng.longitude}&destination=${encodeURIComponent(destination)}&travelmode=${travelMode.toLowerCase()}`
      : `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin || 'Current Location')}&destination=${encodeURIComponent(destination)}&travelmode=${travelMode.toLowerCase()}`;
    
    const polyline = route.polyline?.encodedPolyline;

    return {
      success: true,
      route: {
        origin: origin || 'Current Location',
        destination,
        distance: leg?.localizedValues?.distance?.text || `${distanceMiles} mi`,
        duration: formatDuration(durationSecs), // Prioritize traffic duration
        durationInTraffic: formatDuration(durationSecs),
        staticDuration: formatDuration(staticDurationSecs),
        trafficCondition,
        route: route.description || '',
        encodedPolyline: polyline,
        steps,
        mapUrl: mapsUrl,
        travelMode: travelMode.toLowerCase(),
      },
    };
  } catch {
    return fallbackToOSRM();
  }
};
