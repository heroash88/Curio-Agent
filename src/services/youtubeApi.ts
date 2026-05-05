import { getYouTubeApiKeyAsync, getGoogleApiKeyAsync } from '../utils/settingsStorage';

export type YouTubeApiKeySource = 'custom' | 'google' | 'none';

export interface ResolvedYouTubeApiKey {
  key: string;
  source: YouTubeApiKeySource;
}

/**
 * Resolves the YouTube API key (async — decrypts from secret storage).
 * Priority: dedicated YouTube key → shared Google API key → none.
 */
export const resolveYouTubeApiKey = async (): Promise<ResolvedYouTubeApiKey> => {
  const customKey = (await getYouTubeApiKeyAsync()).trim();
  if (customKey) {
    return { key: customKey, source: 'custom' };
  }

  const googleKey = (await getGoogleApiKeyAsync()).trim();
  if (googleKey) {
    return { key: googleKey, source: 'google' };
  }

  return { key: '', source: 'none' };
};
