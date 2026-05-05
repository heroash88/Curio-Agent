import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./youtubeApi', () => ({
  resolveYouTubeApiKey: vi.fn(async () => ({ key: '', source: 'none' })),
}));

vi.mock('./spotifyApi', () => ({
  searchSpotifyCatalog: vi.fn(async () => [
    {
      source: 'spotify',
      itemType: 'track',
      id: 'spotify_track_1',
      uri: 'spotify:track:spotify_track_1',
      title: 'Digital Love',
      artistOrChannel: 'Daft Punk',
      thumbnailUrl: 'https://i.scdn.co/image/track',
      query: 'digital love',
      score: 80,
      albumName: 'Discovery',
      durationSeconds: 301,
    },
  ]),
}));

describe('musicSearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('can search Spotify catalog items when Spotify is selected as the music source', async () => {
    const spotifyApi = await import('./spotifyApi');
    const { searchMusic, searchMusicCandidates } = await import('./musicSearchService');

    const candidates = await searchMusicCandidates('play digital love', 'spotify');
    const best = await searchMusic('play digital love', 'spotify');

    expect(spotifyApi.searchSpotifyCatalog).toHaveBeenCalledWith('digital love');
    expect(candidates).toEqual([
      expect.objectContaining({
        source: 'spotify',
        itemType: 'track',
        id: 'spotify_track_1',
        title: 'Digital Love',
      }),
    ]);
    expect(best).toEqual({
      success: true,
      track: expect.objectContaining({
        source: 'spotify',
        uri: 'spotify:track:spotify_track_1',
      }),
    });
  });
});
