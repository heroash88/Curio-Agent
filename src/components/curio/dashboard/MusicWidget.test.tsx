import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MusicWidget from './MusicWidget';
import { DashboardWidgetActionSlotContext } from './WidgetShell';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import { searchMusicCandidates } from '../../../services/musicSearchService';

const cardThemeMock = vi.hoisted(() => ({
  dark: true,
}));

const widgetSizeMock = vi.hoisted(() => ({
  current: {
    w: 3,
    h: 2,
    area: 6,
    sizeClass: 'medium',
    isWide: true,
    isTall: false,
    isCompact: true,
    pixelWidth: 520,
    pixelHeight: 200,
  },
}));

const playbackStateMock = vi.hoisted(() => ({
  current: {
    playerId: 'curio-spotify-music-player',
    videoId: null as string | null,
    id: null as string | null,
    uri: '',
    query: '',
    title: '',
    artistOrChannel: '',
    thumbnailUrl: '',
    playbackState: 'idle',
    currentTimeSeconds: 0,
    durationSeconds: 0,
    volume: 70,
    source: 'spotify',
  },
}));

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: cardThemeMock.dark,
    headline: 'font-headline',
    onSurface: cardThemeMock.dark ? 'text-white' : 'text-slate-950',
    onSurfaceVariant: cardThemeMock.dark ? 'text-white/60' : 'text-slate-600',
    muted: cardThemeMock.dark ? 'text-white/40' : 'text-slate-500',
    text2: cardThemeMock.dark ? 'text-white/60' : 'text-slate-600',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => widgetSizeMock.current,
}));

vi.mock('../../../utils/settingsStorage', () => ({
  useAnimationsEnabled: () => false,
  useLowPowerMode: () => true,
}));

vi.mock('../../../services/musicPlaybackService', () => ({
  musicPlaybackService: {
    getState: () => playbackStateMock.current,
    subscribe: () => () => undefined,
    warmup: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    seekTo: vi.fn(),
    setVolume: vi.fn(),
    play: vi.fn(),
  },
}));

vi.mock('../../../services/musicSearchService', () => ({
  searchMusicCandidates: vi.fn(),
}));

vi.mock('../../../services/spotifyApi', () => ({
  getSpotifyAuthStatus: () => ({
    connected: false,
    hasClientId: true,
    redirectUri: 'http://127.0.0.1:8081/oauth-callback.html',
  }),
  signInWithSpotify: vi.fn(),
  signOutSpotify: vi.fn(),
}));

const widget: DashboardWidget = {
  id: 'music_test',
  type: 'music',
  position: 0,
  size: 'medium',
  enabled: true,
  config: {
    w: 3,
    h: 2,
    musicDesign: 'spotify',
    musicSource: 'spotify',
  },
};

describe('MusicWidget', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(searchMusicCandidates).mockReset();
    cardThemeMock.dark = true;
    playbackStateMock.current = {
      playerId: 'curio-spotify-music-player',
      videoId: null,
      id: null,
      uri: '',
      query: '',
      title: '',
      artistOrChannel: '',
      thumbnailUrl: '',
      playbackState: 'idle',
      currentTimeSeconds: 0,
      durationSeconds: 0,
      volume: 70,
      source: 'spotify',
    };
    widgetSizeMock.current = {
      w: 3,
      h: 2,
      area: 6,
      sizeClass: 'medium',
      isWide: true,
      isTall: false,
      isCompact: true,
      pixelWidth: 520,
      pixelHeight: 200,
    };
  });

  it('keeps the dashboard action dots inside the Spotify header controls', () => {
    render(
      <DashboardWidgetActionSlotContext.Provider value={<button type="button">Widget controls</button>}>
        <MusicWidget widget={widget} />
      </DashboardWidgetActionSlotContext.Provider>,
    );

    expect(screen.getByRole('button', { name: 'Search music' })).toHaveClass(
      'dashboard-widget-control-button',
    );
    expect(screen.getByTestId('spotify-music-header-actions')).toContainElement(
      screen.getByText('Widget controls'),
    );
  });

  it('keeps music design switching in widget settings instead of on the widget surface', () => {
    const { rerender } = render(<MusicWidget widget={widget} />);

    expect(screen.queryByRole('button', { name: 'Switch to Curio design' })).not.toBeInTheDocument();

    rerender(
      <MusicWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            musicDesign: 'curio',
            musicSource: 'youtube',
          },
        }}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Switch to Spotify design' })).not.toBeInTheDocument();
  });

  it('falls back to YouTube search when Spotify is selected but unavailable', async () => {
    vi.mocked(searchMusicCandidates).mockResolvedValueOnce([
      {
        source: 'youtube',
        videoId: 'yt-fallback',
        query: 'lofi',
        title: 'Lofi fallback',
        artistOrChannel: 'Curio Radio',
        thumbnailUrl: '',
        durationSeconds: 180,
        score: 1,
      },
    ]);

    render(<MusicWidget widget={widget} />);

    fireEvent.click(screen.getByRole('button', { name: 'Browse Music' }));
    const input = screen.getByPlaceholderText('Search Spotify songs, albums...');
    fireEvent.change(input, { target: { value: 'lofi' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(searchMusicCandidates).toHaveBeenCalledWith('lofi', 'youtube');
    });
    expect(screen.getByText('Lofi fallback')).toBeInTheDocument();
  });

  it('keeps Spotify search close and widget controls in one compact action row', () => {
    render(
      <DashboardWidgetActionSlotContext.Provider value={<button type="button">Widget controls</button>}>
        <MusicWidget widget={widget} />
      </DashboardWidgetActionSlotContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Browse Music' }));

    expect(screen.getByTestId('spotify-music-search-overlay')).toHaveClass('p-2');
    const actions = screen.getByTestId('spotify-music-search-actions');
    const closeButton = screen.getByRole('button', { name: 'Close music search' });
    expect(closeButton).toHaveClass('dashboard-widget-control-button');
    expect(actions).toContainElement(closeButton);
    expect(actions).toContainElement(screen.getByText('Widget controls'));
    expect(screen.getByRole('button', { name: 'Submit music search' })).toHaveClass(
      'dashboard-widget-control-button',
      'dashboard-widget-control-button-primary',
    );
    expect(screen.getByText(/Connect Spotify to search albums/i)).toHaveClass('text-[9px]');
  });

  it('uses shared circular controls for Curio YouTube Music search actions', () => {
    render(
      <MusicWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            musicDesign: 'curio',
            musicSource: 'youtube',
          },
        }}
      />,
    );

    const searchButton = screen.getByRole('button', { name: 'Search music' });
    expect(searchButton).toHaveClass('dashboard-widget-control-button');

    fireEvent.click(searchButton);

    expect(screen.getByRole('button', { name: 'Close music search' })).toHaveClass(
      'dashboard-widget-control-button',
      'dashboard-widget-control-button-active',
    );
    expect(screen.getByRole('button', { name: 'Submit music search' })).toHaveClass(
      'dashboard-widget-control-button',
      'dashboard-widget-control-button-primary',
    );
  });

  it('lets Curio music search history scroll with mouse and touch instead of clipping rendered rows', () => {
    window.localStorage.setItem(
      'curio_music_history',
      JSON.stringify([
        { source: 'youtube', videoId: 'track-1', query: 'Track 1', title: 'Track 1', artistOrChannel: 'Artist', thumbnailUrl: '' },
        { source: 'youtube', videoId: 'track-2', query: 'Track 2', title: 'Track 2', artistOrChannel: 'Artist', thumbnailUrl: '' },
        { source: 'youtube', videoId: 'track-3', query: 'Track 3', title: 'Track 3', artistOrChannel: 'Artist', thumbnailUrl: '' },
        { source: 'youtube', videoId: 'track-4', query: 'Track 4', title: 'Track 4', artistOrChannel: 'Artist', thumbnailUrl: '' },
      ]),
    );

    render(
      <MusicWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            musicDesign: 'curio',
            musicSource: 'youtube',
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Browse Music' }));

    expect(screen.queryByRole('button', { name: 'Browse Music' })).not.toBeInTheDocument();
    expect(screen.getByTestId('curio-music-search-frame')).toHaveClass('overflow-hidden');
    expect(screen.getByTestId('curio-music-search-form')).toHaveClass('shrink-0');

    const resultsPane = screen.getByTestId('curio-music-search-results');
    expect(resultsPane).toHaveClass(
      'overflow-y-auto',
      'overscroll-contain',
      '[touch-action:pan-y]',
    );
    Object.defineProperty(resultsPane, 'scrollHeight', {
      configurable: true,
      value: 420,
    });
    Object.defineProperty(resultsPane, 'clientHeight', {
      configurable: true,
      value: 120,
    });

    fireEvent.wheel(resultsPane, { deltaY: 80 });
    expect(resultsPane.scrollTop).toBe(80);

    fireEvent.pointerDown(resultsPane, {
      button: 0,
      clientY: 110,
      pointerId: 1,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(resultsPane, {
      clientY: 60,
      pointerId: 1,
      pointerType: 'touch',
    });
    fireEvent.pointerUp(resultsPane, {
      clientY: 60,
      pointerId: 1,
      pointerType: 'touch',
    });
    expect(resultsPane.scrollTop).toBe(130);

    expect(within(resultsPane).getByText('Track 1')).toBeInTheDocument();
    expect(within(resultsPane).getByText('Track 4')).toBeInTheDocument();
  });

  it('hides the Curio widget action dots while search is open and restores them after close', () => {
    render(
      <DashboardWidgetActionSlotContext.Provider value={<button type="button">Widget controls</button>}>
        <MusicWidget
          widget={{
            ...widget,
            config: {
              ...widget.config,
              musicDesign: 'curio',
              musicSource: 'youtube',
            },
          }}
        />
      </DashboardWidgetActionSlotContext.Provider>,
    );

    expect(screen.getByText('Widget controls')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Browse Music' }));

    expect(screen.getByRole('button', { name: 'Close music search' })).toBeInTheDocument();
    expect(screen.queryByText('Widget controls')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close music search' }));

    expect(screen.getByText('Widget controls')).toBeInTheDocument();
  });

  it('uses the light Spotify skin when the dashboard theme is light', () => {
    cardThemeMock.dark = false;

    render(
      <DashboardWidgetActionSlotContext.Provider value={<button type="button">Widget controls</button>}>
        <MusicWidget widget={widget} />
      </DashboardWidgetActionSlotContext.Provider>,
    );

    expect(screen.getByTestId('spotify-music-surface')).toHaveClass('bg-[#f7faf1]', 'text-slate-950');

    fireEvent.click(screen.getByRole('button', { name: 'Browse Music' }));

    expect(screen.getByTestId('spotify-music-search-overlay')).toHaveClass(
      'bg-[#f7faf1]/95',
      'text-slate-950',
    );
    expect(screen.getByPlaceholderText('Search Spotify songs, albums...')).toHaveClass(
      'bg-white/85',
      'text-slate-950',
      'placeholder:text-slate-400',
    );
  });

  it('centers the Curio idle visualizer in the widget body', () => {
    widgetSizeMock.current = {
      w: 3,
      h: 3,
      area: 9,
      sizeClass: 'large',
      isWide: true,
      isTall: true,
      isCompact: false,
      pixelWidth: 420,
      pixelHeight: 420,
    };

    render(
      <MusicWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            musicDesign: 'curio',
            musicSource: 'youtube',
          },
        }}
      />,
    );

    expect(screen.getByTestId('curio-music-idle-waveform')).toHaveClass('justify-center');
  });

  it('keeps the Curio visualizer centered above playback controls with a separate seek bar', () => {
    playbackStateMock.current = {
      ...playbackStateMock.current,
      videoId: 'adele-easy-on-me',
      title: 'Adele - Easy On Me (Official Lyric Video)',
      artistOrChannel: 'Adele',
      thumbnailUrl: 'https://example.test/adele.jpg',
      playbackState: 'playing',
      currentTimeSeconds: 45,
      durationSeconds: 225,
      source: 'youtube',
    };

    render(
      <MusicWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            musicDesign: 'curio',
            musicSource: 'youtube',
          },
        }}
      />,
    );

    const artwork = screen.getByAltText('Adele - Easy On Me (Official Lyric Video)');
    expect(artwork).toHaveClass('h-14', 'w-14', 'object-cover');

    const waveform = screen.getByTestId('curio-music-active-waveform');
    const controls = screen.getByTestId('curio-music-playback-controls');
    expect(waveform).toHaveClass('justify-center');
    expect(waveform.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const firstBar = within(waveform).getAllByTestId('curio-music-waveform-bar')[0];
    expect(firstBar).toHaveClass('bg-[var(--ether-on-surface)]/45');

    expect(screen.getByTestId('curio-music-seek-bar')).toHaveAttribute('aria-label', 'Seek in track');
    expect(screen.getByTestId('curio-music-seek-bar')).toHaveClass('bg-black/35', 'ring-white/10');
    expect(screen.getByTestId('curio-music-seek-progress')).toHaveClass('bg-[#f472b6]');
    expect(screen.getByTestId('curio-music-seek-progress')).toHaveStyle({ width: '20%' });
  });

  it('uses a distinct Curio seek color in light mode instead of a washed-out surface line', () => {
    cardThemeMock.dark = false;
    playbackStateMock.current = {
      ...playbackStateMock.current,
      videoId: 'adele-easy-on-me',
      title: 'Adele - Easy On Me (Official Lyric Video)',
      artistOrChannel: 'Adele',
      thumbnailUrl: 'https://example.test/adele.jpg',
      playbackState: 'playing',
      currentTimeSeconds: 45,
      durationSeconds: 225,
      source: 'youtube',
    };

    render(
      <MusicWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            musicDesign: 'curio',
            musicSource: 'youtube',
          },
        }}
      />,
    );

    expect(screen.getByTestId('curio-music-seek-bar')).toHaveClass('bg-slate-950/18', 'ring-slate-950/10');
    expect(screen.getByTestId('curio-music-seek-progress')).toHaveClass('bg-[#be185d]');
  });

  it('keeps compact Curio playback controls inside the visible widget bounds', () => {
    playbackStateMock.current = {
      ...playbackStateMock.current,
      videoId: 'adele-easy-on-me',
      title: 'Adele - Easy On Me (Official Lyric Video)',
      artistOrChannel: 'Adele',
      thumbnailUrl: 'https://example.test/adele.jpg',
      playbackState: 'paused',
      currentTimeSeconds: 0,
      durationSeconds: 225,
      source: 'youtube',
    };

    render(
      <MusicWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            musicDesign: 'curio',
            musicSource: 'youtube',
          },
        }}
      />,
    );

    expect(screen.getByTestId('curio-music-compact-player')).toHaveClass('justify-between', 'gap-2');
    expect(screen.getByTestId('curio-music-compact-media')).toHaveClass('flex-1', 'items-center');
    expect(screen.getByTestId('curio-music-active-waveform')).toHaveClass('h-8');
    expect(screen.getByTestId('curio-music-playback-controls')).toHaveClass('shrink-0');
    expect(screen.getByRole('button', { name: 'Play music' })).toHaveClass('h-9', 'w-9');
  });
});
