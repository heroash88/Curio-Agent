import type { DashboardNewsCustomFeed, DashboardNewsProvider } from './dashboardTypes';

export type NewsFeedProvider = 'nytimes' | 'combined_world' | 'custom_rss';

export interface NewsFeedCategory {
  id: string;
  label: string;
  feedName: string;
}

export interface NewsFeedArticle {
  id: string;
  title: string;
  source: string;
  time: string;
  url: string;
  publishedAt?: number;
  summary?: string;
  category?: string;
  imageUrl?: string;
}

export interface NewsFeedSource {
  id: string;
  label: string;
  url: string;
  categoryIds: string[];
  custom?: boolean;
}

export interface NewsFeedUrlInput {
  provider: NewsFeedProvider;
  categoryId?: string;
  customUrl?: string;
  customFeeds?: DashboardNewsCustomFeed[];
}

export interface FetchNewsFeedInput extends NewsFeedUrlInput {
  maxItems: number;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  now?: number;
}

const NYT_BASE_URL = 'https://rss.nytimes.com/services/xml/rss/nyt';
const RSS_PROXY_BASE = '/rss-proxy';

export const DEFAULT_NEWS_PROVIDER: DashboardNewsProvider = 'combined_world';
export const DEFAULT_NEWS_CATEGORY = 'world';

const COMBINED_NEWS_TYPES: NewsFeedCategory[] = [
  { id: 'world', label: 'World', feedName: 'world' },
  { id: 'business', label: 'Business', feedName: 'business' },
  { id: 'technology', label: 'Technology', feedName: 'technology' },
  { id: 'science', label: 'Science', feedName: 'science' },
  { id: 'health', label: 'Health', feedName: 'health' },
  { id: 'sports', label: 'Sports', feedName: 'sports' },
];

export const CURATED_NEWS_FEED_SOURCES: NewsFeedSource[] = [
  { id: 'nyt-world', label: 'New York Times', url: `${NYT_BASE_URL}/World.xml`, categoryIds: ['world'] },
  { id: 'bbc-world', label: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', categoryIds: ['world'] },
  { id: 'guardian-world', label: 'The Guardian', url: 'https://www.theguardian.com/world/rss', categoryIds: ['world'] },
  { id: 'npr-world', label: 'NPR', url: 'https://feeds.npr.org/1004/rss.xml', categoryIds: ['world'] },
  { id: 'aljazeera-world', label: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', categoryIds: ['world'] },
  { id: 'nyt-business', label: 'New York Times', url: `${NYT_BASE_URL}/Business.xml`, categoryIds: ['business'] },
  { id: 'bbc-business', label: 'BBC News', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', categoryIds: ['business'] },
  { id: 'guardian-business', label: 'The Guardian', url: 'https://www.theguardian.com/business/rss', categoryIds: ['business'] },
  { id: 'nyt-technology', label: 'New York Times', url: `${NYT_BASE_URL}/Technology.xml`, categoryIds: ['technology'] },
  { id: 'bbc-technology', label: 'BBC News', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', categoryIds: ['technology'] },
  { id: 'guardian-technology', label: 'The Guardian', url: 'https://www.theguardian.com/technology/rss', categoryIds: ['technology'] },
  { id: 'nyt-science', label: 'New York Times', url: `${NYT_BASE_URL}/Science.xml`, categoryIds: ['science'] },
  { id: 'bbc-science', label: 'BBC News', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', categoryIds: ['science'] },
  { id: 'guardian-science', label: 'The Guardian', url: 'https://www.theguardian.com/science/rss', categoryIds: ['science'] },
  { id: 'nyt-health', label: 'New York Times', url: `${NYT_BASE_URL}/Health.xml`, categoryIds: ['health'] },
  { id: 'bbc-health', label: 'BBC News', url: 'https://feeds.bbci.co.uk/news/health/rss.xml', categoryIds: ['health'] },
  { id: 'guardian-health', label: 'The Guardian', url: 'https://www.theguardian.com/society/health/rss', categoryIds: ['health'] },
  { id: 'nyt-sports', label: 'New York Times', url: `${NYT_BASE_URL}/Sports.xml`, categoryIds: ['sports'] },
  { id: 'bbc-sports', label: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml', categoryIds: ['sports'] },
  { id: 'guardian-sports', label: 'The Guardian', url: 'https://www.theguardian.com/sport/rss', categoryIds: ['sports'] },
];

export const NEWS_FEED_PROVIDER_OPTIONS: Array<{
  id: NewsFeedProvider;
  label: string;
  description: string;
}> = [
  {
    id: 'nytimes',
    label: 'New York Times RSS',
    description: 'No API key. Browse section feeds and open publisher articles.',
  },
  {
    id: 'combined_world',
    label: 'World News',
    description: 'Combined headlines from curated public RSS feeds and your custom sources.',
  },
  {
    id: 'custom_rss',
    label: 'Custom RSS',
    description: 'Use another public RSS or Atom feed when it allows browser access.',
  },
];

export const NEWS_FEED_CATEGORIES: Record<NewsFeedProvider, NewsFeedCategory[]> = {
  nytimes: [
    { id: 'top', label: 'Top Stories', feedName: 'HomePage' },
    { id: 'world', label: 'World', feedName: 'World' },
    { id: 'us', label: 'U.S.', feedName: 'US' },
    { id: 'business', label: 'Business', feedName: 'Business' },
    { id: 'technology', label: 'Technology', feedName: 'Technology' },
    { id: 'science', label: 'Science', feedName: 'Science' },
    { id: 'health', label: 'Health', feedName: 'Health' },
    { id: 'sports', label: 'Sports', feedName: 'Sports' },
    { id: 'arts', label: 'Arts', feedName: 'Arts' },
    { id: 'opinion', label: 'Opinion', feedName: 'Opinion' },
  ],
  combined_world: COMBINED_NEWS_TYPES,
  custom_rss: [
    { id: 'custom', label: 'Custom Feed', feedName: 'custom' },
  ],
};

export const getNewsFeedCategory = (
  provider: NewsFeedProvider,
  categoryId?: string,
): NewsFeedCategory => {
  const categories = NEWS_FEED_CATEGORIES[provider];
  return (
    categories.find((category) => category.id === categoryId) ||
    categories[0]
  );
};

const normalizeFeedUrl = (value: string): string => {
  const parsedUrl = new URL(value.trim());
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error('RSS feeds must use http or https.');
  }
  return parsedUrl.toString();
};

const getIngressPrefix = () => {
  if (typeof window === 'undefined') return '';
  const match = window.location.pathname.match(/^(\/api\/hassio_ingress\/[^/]+)/);
  return match?.[1] || '';
};

export const buildRssProxyPath = (feedUrl: string) =>
  `${getIngressPrefix()}${RSS_PROXY_BASE}?url=${encodeURIComponent(feedUrl)}`;

const slugFrom = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'rss-feed';

const labelFromUrl = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'RSS feed';
  }
};

const normalizeCategoryIds = (value: unknown, fallback = DEFAULT_NEWS_CATEGORY) => {
  const validIds = new Set(COMBINED_NEWS_TYPES.map((category) => category.id));
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const normalized = values
    .map((item) => String(item).trim().toLowerCase())
    .filter((item) => validIds.has(item));

  return normalized.length > 0 ? Array.from(new Set(normalized)) : [fallback];
};

export const parseNewsCustomFeedsDraft = (value: string): DashboardNewsCustomFeed[] => {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): DashboardNewsCustomFeed | null => {
      const parts = line.split('|').map((part) => part.trim()).filter(Boolean);
      const [first = '', second = '', third = ''] = parts;
      const firstIsUrl = /^https?:\/\//i.test(first);
      const rawUrl = firstIsUrl ? first : second;
      if (!rawUrl) return null;

      try {
        const url = normalizeFeedUrl(rawUrl);
        const label = firstIsUrl ? labelFromUrl(url) : first || labelFromUrl(url);
        return {
          id: slugFrom(label || url),
          label,
          url,
          categoryIds: normalizeCategoryIds(firstIsUrl ? second : third),
          enabled: true,
        } satisfies DashboardNewsCustomFeed;
      } catch {
        return null;
      }
    })
    .filter((feed): feed is DashboardNewsCustomFeed => feed !== null);
};

export const serializeNewsCustomFeedsDraft = (
  feeds: DashboardNewsCustomFeed[] | undefined,
): string => {
  if (!Array.isArray(feeds)) return '';
  return feeds
    .filter((feed) => feed.enabled !== false && feed.url)
    .map((feed) => {
      const categories = normalizeCategoryIds(feed.categoryIds).join(', ');
      return `${feed.label || labelFromUrl(feed.url)} | ${feed.url} | ${categories}`;
    })
    .join('\n');
};

export const getNewsFeedSources = ({
  provider,
  categoryId,
  customUrl,
  customFeeds,
}: NewsFeedUrlInput): NewsFeedSource[] => {
  if (provider === 'custom_rss') {
    const trimmedUrl = (customUrl || '').trim();
    if (!trimmedUrl) {
      throw new Error('Add a custom RSS feed URL in widget settings.');
    }
    const url = normalizeFeedUrl(trimmedUrl);
    return [{
      id: 'custom-rss',
      label: 'Custom RSS',
      url,
      categoryIds: ['custom'],
      custom: true,
    }];
  }

  if (provider === 'combined_world') {
    const category = getNewsFeedCategory('combined_world', categoryId);
    const curatedSources = CURATED_NEWS_FEED_SOURCES.filter((source) =>
      source.categoryIds.includes(category.id),
    );
    const userSources = Array.isArray(customFeeds)
      ? customFeeds
          .filter((feed) => feed.enabled !== false && feed.url)
          .filter((feed) => normalizeCategoryIds(feed.categoryIds).includes(category.id))
          .map((feed) => ({
            id: feed.id || slugFrom(feed.label || feed.url),
            label: feed.label || labelFromUrl(feed.url),
            url: normalizeFeedUrl(feed.url),
            categoryIds: normalizeCategoryIds(feed.categoryIds),
            custom: true,
          }))
      : [];

    return [...curatedSources, ...userSources];
  }

  const category = getNewsFeedCategory(provider, categoryId);
  return [{
    id: `nyt-${category.id}`,
    label: 'New York Times RSS',
    url: `${NYT_BASE_URL}/${category.feedName}.xml`,
    categoryIds: [category.id],
  }];
};

export const getNewsFeedUrl = ({
  provider,
  categoryId,
  customUrl,
  customFeeds,
}: NewsFeedUrlInput): string => {
  const [source] = getNewsFeedSources({ provider, categoryId, customUrl, customFeeds });
  if (!source) {
    throw new Error('No RSS feeds are configured for this news type.');
  }
  return source.url;
};

const textFrom = (parent: Element | Document, tagName: string): string => {
  const node = parent.getElementsByTagName(tagName)[0];
  return node?.textContent?.trim() || '';
};

const textFromAny = (
  parent: Element | Document,
  tagNames: string[],
): string => {
  for (const tagName of tagNames) {
    const value = textFrom(parent, tagName);
    if (value) return value;
  }
  return '';
};

const elementsByName = (
  parent: Element | Document,
  tagNames: string[],
): Element[] => {
  const wanted = new Set(tagNames.map((tagName) => tagName.toLowerCase()));

  return Array.from(parent.getElementsByTagName('*')).filter((element) => {
    const tagName = element.tagName.toLowerCase();
    const nodeName = element.nodeName.toLowerCase();
    const localName = element.localName.toLowerCase();
    const prefixedLocalName = element.prefix
      ? `${element.prefix.toLowerCase()}:${localName}`
      : localName;

    return (
      wanted.has(tagName) ||
      wanted.has(nodeName) ||
      wanted.has(prefixedLocalName)
    );
  });
};

const linkFrom = (item: Element): string => {
  const rssLink = textFrom(item, 'link');
  if (rssLink) return rssLink;

  const atomLink = Array.from(item.getElementsByTagName('link')).find((link) => {
    const rel = link.getAttribute('rel');
    return !rel || rel === 'alternate';
  });

  return atomLink?.getAttribute('href')?.trim() || '';
};

const decodeHtml = (value: string): string => {
  if (!value) return '';
  if (typeof DOMParser === 'undefined') {
    return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const doc = new DOMParser().parseFromString(value, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
};

const normalizeImageUrl = (value: string | null | undefined): string | undefined => {
  const decoded = decodeHtml(value || '');
  if (!decoded) return undefined;

  try {
    const url = new URL(decoded);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
};

const imageFromDescription = (html: string): string | undefined => {
  if (!html) return undefined;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  return normalizeImageUrl(doc.querySelector('img[src]')?.getAttribute('src'));
};

const imageFromFeedItem = (
  item: Element,
  rawDescription: string,
): string | undefined => {
  for (const element of elementsByName(item, ['media:content'])) {
    const medium = (element.getAttribute('medium') || '').toLowerCase();
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (medium && medium !== 'image' && !type.startsWith('image/')) continue;
    if (type && !type.startsWith('image/') && medium !== 'image') continue;

    const imageUrl = normalizeImageUrl(element.getAttribute('url'));
    if (imageUrl) return imageUrl;
  }

  for (const element of elementsByName(item, ['media:thumbnail'])) {
    const imageUrl = normalizeImageUrl(element.getAttribute('url'));
    if (imageUrl) return imageUrl;
  }

  for (const element of elementsByName(item, ['enclosure'])) {
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (type && !type.startsWith('image/')) continue;

    const imageUrl = normalizeImageUrl(element.getAttribute('url'));
    if (imageUrl) return imageUrl;
  }

  for (const element of elementsByName(item, ['image'])) {
    const imageUrl = normalizeImageUrl(
      textFrom(element, 'url') || element.getAttribute('url') || element.textContent,
    );
    if (imageUrl) return imageUrl;
  }

  return imageFromDescription(rawDescription);
};

const formatNewsTime = (rawDate: string, now: number): string => {
  const timestamp = Date.parse(rawDate);
  if (!Number.isFinite(timestamp)) return 'Recent';

  const diffMs = Math.max(0, now - timestamp);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
};

export const parseNewsFeedXml = (
  xml: string,
  {
    sourceLabel,
    maxItems,
    now = Date.now(),
  }: {
    sourceLabel: string;
    maxItems: number;
    now?: number;
  },
): NewsFeedArticle[] => {
  if (typeof DOMParser === 'undefined') {
    throw new Error('RSS parsing requires DOMParser support.');
  }

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('The RSS feed could not be parsed.');
  }

  const channelTitle = decodeHtml(textFrom(doc, 'title'));
  const fallbackSource = sourceLabel || channelTitle || 'RSS';
  const items = [
    ...Array.from(doc.getElementsByTagName('item')),
    ...Array.from(doc.getElementsByTagName('entry')),
  ];
  const seenUrls = new Set<string>();
  const articles: NewsFeedArticle[] = [];

  for (const item of items) {
    const title = decodeHtml(textFrom(item, 'title'));
    const url = linkFrom(item);
    if (!title || !url || seenUrls.has(url)) continue;

    const rawSummary = textFromAny(item, [
      'description',
      'summary',
      'content:encoded',
      'content',
    ]);
    const summary = decodeHtml(rawSummary);
    const category = decodeHtml(textFrom(item, 'category'));
    const imageUrl = imageFromFeedItem(item, rawSummary);
    const rawDate =
      textFrom(item, 'pubDate') ||
      textFrom(item, 'published') ||
      textFrom(item, 'updated');
    const publishedAt = Date.parse(rawDate);

    seenUrls.add(url);
    articles.push({
      id: url,
      title,
      source: fallbackSource,
      time: formatNewsTime(rawDate, now),
      url,
      ...(Number.isFinite(publishedAt) ? { publishedAt } : {}),
      ...(summary ? { summary } : {}),
      ...(category ? { category } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    });

    if (articles.length >= maxItems) break;
  }

  return articles;
};

export const fetchNewsFeedArticles = async ({
  provider,
  categoryId,
  customUrl,
  customFeeds,
  maxItems,
  signal,
  fetcher = fetch,
  now = Date.now(),
}: FetchNewsFeedInput): Promise<NewsFeedArticle[]> => {
  const sources = getNewsFeedSources({ provider, categoryId, customUrl, customFeeds });
  if (sources.length === 0) {
    throw new Error('No RSS feeds are configured for this news type.');
  }

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const response = await fetcher(buildRssProxyPath(source.url), {
        headers: {
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        },
        signal,
      });

      if (!response.ok) {
        throw new Error(`${source.label} returned ${response.status}.`);
      }

      return parseNewsFeedXml(await response.text(), {
        sourceLabel: source.label,
        maxItems,
        now,
      });
    }),
  );

  const seenUrls = new Set<string>();
  const articles = results
    .flatMap((result) => result.status === 'fulfilled' ? result.value : [])
    .filter((article) => {
      const key = article.url || article.title;
      if (seenUrls.has(key)) return false;
      seenUrls.add(key);
      return true;
    })
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
    .slice(0, maxItems);

  if (articles.length === 0) {
    const firstError = results.find((result) => result.status === 'rejected');
    if (firstError?.status === 'rejected') {
      throw new Error(firstError.reason instanceof Error
        ? firstError.reason.message
        : 'Could not load RSS headlines.');
    }
  }

  return articles;
};
