/**
 * Legacy hook -- previously handled Firebase Auth redirect results.
 * Now a no-op since Google OAuth uses the popup/implicit grant flow
 * via src/services/googleOAuth.ts instead of Firebase Auth.
 *
 * Kept as a stub so existing imports don't break.
 */

export const GOOGLE_REDIRECT_PURPOSE_KEY = 'curio_google_redirect_purpose';

export const useGoogleRedirectCallback = (): void => {
    // No-op: OAuth is now handled via popup in googleOAuth.ts
};
