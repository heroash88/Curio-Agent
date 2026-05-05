import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import NewsWidget from './NewsWidget';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    onSurface: 'text-slate-900',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => ({
    w: 3,
    h: 3,
    area: 9,
    sizeClass: 'large',
    isWide: true,
    isTall: true,
    isCompact: false,
    pixelWidth: 480,
    pixelHeight: 420,
  }),
}));

const buildFeedItem = (index: number) => {
  const title =
    index === 1
      ? 'Curio robot learns to sort the morning brief'
      : `Morning brief story ${index}`;
  const url =
    index === 1
      ? 'https://www.nytimes.com/2026/04/25/technology/curio-robot-news.html'
      : `https://www.nytimes.com/2026/04/25/technology/story-${index}.html`;

  return `<item>
      <title>${title}</title>
      <link>${url}</link>
      <description>A home assistant groups headlines into a calmer reading list.</description>
      ${
        index === 1
          ? '<media:content medium="image" url="https://static.nyt.com/images/2026/04/25/curio.jpg" />'
          : ''
      }
      <pubDate>Sat, 25 Apr 2026 15:00:00 GMT</pubDate>
      <category>Technology</category>
    </item>`;
};

const sampleFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>NYT &gt; Technology</title>
    ${Array.from({ length: 12 }, (_, index) => buildFeedItem(index + 1)).join('')}
  </channel>
</rss>`;

const buildWidget = (
  config: Partial<DashboardWidget['config']> = {},
): DashboardWidget => ({
  id: 'news-test',
  type: 'news',
  position: 0,
  size: 'large',
  enabled: true,
  config: {
    w: 3,
    h: 3,
    ...config,
  } as DashboardWidget['config'],
});

describe('NewsWidget', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () => sampleFeed,
      })),
    );
  });

  it('starts new news widgets on the combined World News feed', async () => {
    render(<NewsWidget widget={buildWidget()} />);

    expect(screen.getByText('World News')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/rss-proxy\?url=/),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: expect.stringContaining('application/rss+xml'),
        }),
      }),
    );
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('loads category articles from the selected no-key RSS source and opens publisher links', async () => {
    render(<NewsWidget widget={buildWidget({
      newsProvider: 'nytimes',
      newsCategory: 'technology',
    })} />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `/rss-proxy?url=${encodeURIComponent('https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml')}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: expect.stringContaining('application/rss+xml'),
          }),
        }),
      );
    });

    const link = await screen.findByRole('link', {
      name: /curio robot learns to sort the morning brief/i,
    });

    expect(link).toHaveAttribute(
      'href',
      'https://www.nytimes.com/2026/04/25/technology/curio-robot-news.html',
    );
    expect(screen.getAllByText('New York Times RSS').length).toBeGreaterThan(0);
  });

  it('opens widget settings for source, type, and RSS feed configuration', () => {
    const onOpenWidgetSettings = vi.fn();
    render(
      <NewsWidget
        widget={buildWidget({
          newsProvider: 'combined_world',
          newsCategory: 'world',
        })}
        onOpenWidgetSettings={onOpenWidgetSettings}
      />,
    );

    expect(screen.queryByRole('combobox', { name: 'News source' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'News settings' }));
    expect(onOpenWidgetSettings).toHaveBeenCalledWith('news-test');
  });

  it('keeps the article list in its own vertical scroll region', async () => {
    render(<NewsWidget widget={buildWidget()} />);

    await screen.findByRole('link', {
      name: /curio robot learns to sort the morning brief/i,
    });

    expect(screen.getByTestId('news-article-list')).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-y-auto',
      'overscroll-contain',
    );
  });

  it('renders RSS images and loads ten articles by default', async () => {
    render(<NewsWidget widget={buildWidget({
      newsProvider: 'nytimes',
      newsCategory: 'technology',
    })} />);

    expect(await screen.findAllByRole('link')).toHaveLength(10);
    expect(screen.getByRole('img', {
      name: /curio robot learns to sort the morning brief/i,
    })).toHaveAttribute(
      'src',
      'https://static.nyt.com/images/2026/04/25/curio.jpg',
    );
  });

  it('adds configured custom RSS feeds to the combined world request', async () => {
    render(<NewsWidget widget={buildWidget({
      newsProvider: 'combined_world',
      newsCategory: 'world',
      newsCustomFeeds: [
        {
          id: 'example-wire',
          label: 'Example Wire',
          url: 'https://example.com/world.xml',
          categoryIds: ['world'],
          enabled: true,
        },
      ],
    })} />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `/rss-proxy?url=${encodeURIComponent('https://example.com/world.xml')}`,
        expect.any(Object),
      );
    });
  });
});
