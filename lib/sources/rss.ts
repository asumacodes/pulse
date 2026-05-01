import { XMLParser } from "fast-xml-parser";
import { normalizeUrl } from "@/lib/dedup/normalize-url";
import type { FeedItem } from "@/types/feed-item";

// Handles both RSS 2.0 (<rss><channel><item>) and Atom (<feed><entry>).
// Most modern blogs are Atom; older WordPress is RSS. We sniff and branch.

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Ensure these are always arrays even with one element, so we don't have to
  // null-check every iteration.
  isArray: (name) => ["item", "entry"].includes(name),
});

const MAX_CONTENT_CHARS = 10_000;

export async function fetchRss(opts: {
  sourceId: string;
  sourceName: string;
  url: string;
}): Promise<FeedItem[]> {
  const res = await fetch(opts.url, {
    headers: {
      // Some feeds (Vercel) block default fetch UA
      "User-Agent": "Pulse/0.1 (+https://github.com/yourname/pulse)",
      Accept:
        "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
    // Don't cache — we want fresh items each fetch run
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `Fetch ${opts.sourceName} failed: ${res.status} ${res.statusText}`,
    );
  }

  const xml = await res.text();
  const parsed = parser.parse(xml);

  // Branch on feed shape
  if (parsed.rss?.channel?.item) {
    return parsed.rss.channel.item.map((item: RssItem) =>
      rssToFeedItem(item, opts.sourceId),
    );
  }

  if (parsed.feed?.entry) {
    return parsed.feed.entry.map((entry: AtomEntry) =>
      atomToFeedItem(entry, opts.sourceId),
    );
  }

  throw new Error(`Unrecognized feed shape for ${opts.sourceName}`);
}

// -----------------------------------------------------------------------------
// RSS 2.0
// -----------------------------------------------------------------------------

type RssItem = {
  guid?: string | { "#text"?: string };
  link?: string;
  title?: string;
  author?: string;
  "dc:creator"?: string;
  description?: string;
  "content:encoded"?: string;
  pubDate?: string;
};

function rssToFeedItem(item: RssItem, sourceId: string): FeedItem {
  const url = item.link ?? "";
  const guid =
    typeof item.guid === "string" ? item.guid : (item.guid?.["#text"] ?? url); // fallback to url if no guid

  const rawContent = stripHtml(
    item["content:encoded"] ?? item.description ?? "",
  );

  return {
    sourceId,
    externalId: guid,
    url,
    urlNormalized: normalizeUrl(url),
    title: decodeEntities(item.title ?? "(untitled)").trim(),
    author: item.author ?? item["dc:creator"],
    rawContent: rawContent.slice(0, MAX_CONTENT_CHARS),
    publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
  };
}

// -----------------------------------------------------------------------------
// Atom
// -----------------------------------------------------------------------------

type AtomEntry = {
  id?: string;
  link?:
    | string
    | { "@_href"?: string }
    | Array<{ "@_href"?: string; "@_rel"?: string }>;
  title?: string | { "#text"?: string };
  author?: { name?: string };
  summary?: string | { "#text"?: string };
  content?: string | { "#text"?: string };
  published?: string;
  updated?: string;
};

function atomToFeedItem(entry: AtomEntry, sourceId: string): FeedItem {
  const url = extractAtomLink(entry.link);
  const id = entry.id ?? url;
  const title =
    typeof entry.title === "string"
      ? entry.title
      : (entry.title?.["#text"] ?? "(untitled)");
  const content =
    typeof entry.content === "string"
      ? entry.content
      : (entry.content?.["#text"] ??
        (typeof entry.summary === "string"
          ? entry.summary
          : entry.summary?.["#text"]) ??
        "");
  const published = entry.published ?? entry.updated;

  return {
    sourceId,
    externalId: id,
    url,
    urlNormalized: normalizeUrl(url),
    title: decodeEntities(title).trim(),
    author: entry.author?.name,
    rawContent: stripHtml(content).slice(0, MAX_CONTENT_CHARS),
    publishedAt: published ? new Date(published) : new Date(),
  };
}

function extractAtomLink(link: AtomEntry["link"]): string {
  if (!link) return "";
  if (typeof link === "string") return link;
  if (Array.isArray(link)) {
    // Prefer rel="alternate", fall back to first
    const alt = link.find((l) => l["@_rel"] === "alternate" || !l["@_rel"]);
    return alt?.["@_href"] ?? link[0]?.["@_href"] ?? "";
  }
  return link["@_href"] ?? "";
}

// -----------------------------------------------------------------------------
// HTML & entity helpers — minimal, no external deps
// -----------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    );
}
