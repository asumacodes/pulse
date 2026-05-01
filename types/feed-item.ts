// The unified shape every source fetcher must return.
// Normalization happens IN the fetcher, not after — each source knows its own
// quirks best (RSS pubDate format, GitHub release timestamps, HN unix epochs, etc).

export type FeedItem = {
  // Source identity (set by fetcher)
  sourceId: string; // uuid from `sources` table
  externalId: string; // guid / release id / hn story id — must be stable across fetches
  url: string; // canonical link
  urlNormalized: string; // see lib/dedup/normalize-url.ts

  // Content
  title: string;
  author?: string;
  rawContent?: string; // truncated to 10k chars before insert
  publishedAt: Date;
};

// Result of a fetcher run, used for /api/fetch response + fetch_runs telemetry.
export type FetchResult = {
  sourceId: string;
  sourceName: string;
  items: FeedItem[];
  error?: string;
};
