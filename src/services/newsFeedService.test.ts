import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_NEWS_PROVIDER,
  NEWS_FEED_PROVIDER_OPTIONS,
  fetchNewsFeedArticles,
  getNewsFeedCategory,
  getNewsFeedSources,
  getNewsFeedUrl,
  parseNewsCustomFeedsDraft,
  parseNewsFeedXml,
} from './newsFeedService';

const sampleFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>NYT &gt; Technology</title>
    <item>
      <title><![CDATA[Curio robot learns to sort the morning brief]]></title>
      <link>https://www.nytimes.com/2026/04/25/technology/curio-robot-news.html</link>
      <description><![CDATA[<p>A home assistant groups headlines into a calmer reading list.</p>]]></description>
      <media:content medium="image" url="https://static.nyt.com/images/2026/04/25/curio.jpg" />
      <pubDate>Sat, 25 Apr 2026 15:00:00 GMT</pubDate>
      <category>Technology</category>
    </item>
    <item>
      <title>Second story</title>
      <link>https://www.nytimes.com/2026/04/25/science/second-story.html</link>
      <description>Short summary</description>
      <pubDate>Sat, 25 Apr 2026 14:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const htmlImageFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>World News</title>
    <item>
      <title>World briefing</title>
      <link>https://example.com/world-briefing</link>
      <description><![CDATA[<img src="https://example.com/world.jpg" /><p>Global update.</p>]]></description>
      <pubDate>Sat, 25 Apr 2026 13:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

describe('newsFeedService', () => {
  it('defaults new news widgets to a curated multi-source world feed', () => {
    expect(DEFAULT_NEWS_PROVIDER).toBe('combined_world');

    const sources = getNewsFeedSources({
      provider: 'combined_world',
      categoryId: 'world',
    });

    expect(sources.length).toBeGreaterThanOrEqual(4);
    expect(sources.map((source) => source.label)).toEqual(
      expect.arrayContaining([
        'New York Times',
        'BBC News',
        'The Guardian',
        'NPR',
      ]),
    );
    expect(sources.map((source) => source.url)).not.toContain(
      'https://rss.app/feeds/lALPRMw9CPOYeNuW.xml',
    );
  });

  it('resolves New York Times category feeds without an API key', () => {
    expect(getNewsFeedCategory('nytimes', 'technology')).toMatchObject({
      id: 'technology',
      label: 'Technology',
    });

    expect(getNewsFeedUrl({
      provider: 'nytimes',
      categoryId: 'technology',
    })).toBe('https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml');
  });

  it('resolves the combined world RSS backend source', () => {
    expect(NEWS_FEED_PROVIDER_OPTIONS).toContainEqual(
      expect.objectContaining({
        id: 'combined_world',
        label: 'World News',
      }),
    );

    expect(getNewsFeedCategory('combined_world')).toMatchObject({
      id: 'world',
      label: 'World',
    });

    expect(getNewsFeedUrl({
      provider: 'combined_world',
    })).toBe('https://rss.nytimes.com/services/xml/rss/nyt/World.xml');
  });

  it('parses custom RSS feed settings with selected news types', () => {
    expect(parseNewsCustomFeedsDraft(
      'Example Wire | https://example.com/world.xml | world, business\n' +
        'https://example.com/tech.xml | technology',
    )).toEqual([
      {
        id: 'example-wire',
        label: 'Example Wire',
        url: 'https://example.com/world.xml',
        categoryIds: ['world', 'business'],
        enabled: true,
      },
      {
        id: 'example-com',
        label: 'example.com',
        url: 'https://example.com/tech.xml',
        categoryIds: ['technology'],
        enabled: true,
      },
    ]);
  });

  it('combines curated and custom RSS feeds into one deduped reverse-chronological view', async () => {
    const now = Date.parse('2026-04-29T12:00:00Z');
    const feedFor = (title: string, articleTitle: string, url: string, pubDate: string) => `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>${title}</title>
          <item>
            <title>${articleTitle}</title>
            <link>${url}</link>
            <description>${articleTitle} summary.</description>
            <pubDate>${pubDate}</pubDate>
          </item>
        </channel>
      </rss>`;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const requestUrl = new URL(String(input), 'https://curio.local');
      const feedUrl = requestUrl.searchParams.get('url') || String(input);
      const decodedUrl = decodeURIComponent(feedUrl);
      const sourceName = decodedUrl.includes('bbc')
        ? 'BBC News'
        : decodedUrl.includes('guardian')
          ? 'The Guardian'
          : decodedUrl.includes('npr')
            ? 'NPR'
            : decodedUrl.includes('example')
              ? 'Example Wire'
              : 'New York Times';

      return {
        ok: true,
        text: async () => feedFor(
          sourceName,
          `${sourceName} world brief`,
          sourceName === 'BBC News'
            ? 'https://shared.example.com/world'
            : `https://${sourceName.toLowerCase().replace(/\s+/g, '-')}.example.com/world`,
          sourceName === 'Example Wire'
            ? 'Wed, 29 Apr 2026 11:45:00 GMT'
            : sourceName === 'BBC News'
              ? 'Wed, 29 Apr 2026 11:00:00 GMT'
              : 'Wed, 29 Apr 2026 10:00:00 GMT',
        ),
      } as Response;
    });

    const articles = await fetchNewsFeedArticles({
      provider: 'combined_world',
      categoryId: 'world',
      customFeeds: [
        {
          id: 'example-wire',
          label: 'Example Wire',
          url: 'https://example.com/world.xml',
          categoryIds: ['world'],
          enabled: true,
        },
      ],
      maxItems: 6,
      fetcher,
      now,
    });

    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(String(fetcher.mock.calls[0][0])).toMatch(/^\/rss-proxy\?url=/);
    expect(articles.map((article) => article.source)).toEqual(
      expect.arrayContaining(['Example Wire', 'BBC News', 'The Guardian']),
    );
    expect(articles[0]).toMatchObject({
      title: 'Example Wire world brief',
      source: 'Example Wire',
    });
    expect(new Set(articles.map((article) => article.url)).size).toBe(articles.length);
  });

  it('parses RSS entries into openable article summaries', () => {
    const articles = parseNewsFeedXml(sampleFeed, {
      sourceLabel: 'New York Times',
      maxItems: 1,
      now: Date.parse('2026-04-25T17:30:00Z'),
    });

    expect(articles).toEqual([
      {
        id: 'https://www.nytimes.com/2026/04/25/technology/curio-robot-news.html',
        title: 'Curio robot learns to sort the morning brief',
        source: 'New York Times',
        time: '2h ago',
        publishedAt: Date.parse('2026-04-25T15:00:00Z'),
        url: 'https://www.nytimes.com/2026/04/25/technology/curio-robot-news.html',
        summary: 'A home assistant groups headlines into a calmer reading list.',
        category: 'Technology',
        imageUrl: 'https://static.nyt.com/images/2026/04/25/curio.jpg',
      },
    ]);
  });

  it('falls back to rich images embedded in RSS description markup', () => {
    const articles = parseNewsFeedXml(htmlImageFeed, {
      sourceLabel: 'World News',
      maxItems: 1,
      now: Date.parse('2026-04-25T17:30:00Z'),
    });

    expect(articles[0]).toMatchObject({
      title: 'World briefing',
      imageUrl: 'https://example.com/world.jpg',
      summary: 'Global update.',
    });
  });
});
