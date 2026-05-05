/**
 * Parses Google API error responses into user-friendly messages.
 * Detects "API not enabled" errors and provides actionable guidance.
 */

const API_FRIENDLY_NAMES: Record<string, string> = {
    'photospicker.googleapis.com': 'Photos Picker API',
    'photoslibrary.googleapis.com': 'Photos Library API',
    'calendar-json.googleapis.com': 'Google Calendar API',
    'www.googleapis.com/calendar': 'Google Calendar API',
    'tasks.googleapis.com': 'Google Tasks API',
    'www.googleapis.com/tasks': 'Google Tasks API',
    'youtube.googleapis.com': 'YouTube Data API v3',
    'places.googleapis.com': 'Places API (New)',
    'routes.googleapis.com': 'Routes API',
};

/**
 * Attempts to extract a user-friendly error from a Google API error message.
 * Returns null if the error isn't a recognized Google API error pattern.
 */
export function parseGoogleApiError(errorMessage: string): string | null {
    // Pattern: "X API has not been used in project Y before or it is disabled"
    const notEnabledMatch = errorMessage.match(
        /(.+?) has not been used in project (\d+) before or it is disabled/
    );
    if (notEnabledMatch) {
        const apiName = notEnabledMatch[1].trim();
        return `${apiName} is not enabled in your Google Cloud project. `
            + `Go to Google Cloud Console > APIs & Services > Library, `
            + `search for "${apiName}", and click Enable. `
            + `Wait a minute, then try again.`;
    }

    // Pattern: 403 with "Access denied" or "Forbidden"
    if (errorMessage.includes('403') && (errorMessage.includes('denied') || errorMessage.includes('Forbidden'))) {
        // Try to identify which API from the error
        for (const [domain, name] of Object.entries(API_FRIENDLY_NAMES)) {
            if (errorMessage.toLowerCase().includes(domain.toLowerCase())) {
                return `Access denied for ${name}. Make sure the API is enabled in your Google Cloud project `
                    + `and that you granted the required permissions during sign-in.`;
            }
        }
        return 'Access denied. Make sure the required Google API is enabled in your Cloud project '
            + 'and that you granted the required permissions during sign-in.';
    }

    // Pattern: "PERMISSION_DENIED"
    if (errorMessage.includes('PERMISSION_DENIED')) {
        return 'Permission denied. Make sure the required Google API is enabled '
            + 'and you granted the necessary scopes during sign-in.';
    }

    return null;
}

/**
 * Wraps an error with a user-friendly message if it's a recognized Google API error.
 * Otherwise returns the original error message.
 */
export function friendlyGoogleError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    return parseGoogleApiError(msg) || msg;
}
