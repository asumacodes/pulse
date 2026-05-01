import type { FeedItem } from "@/types/feed-item";
import { normalizeUrl } from "../dedup/normalize-url";

type HNItem = {
  objectID: string;
  title: string;
  url: string | null;
  author: string;
  points: number;
  created_at: string;
};

export async function fetchHn({
  sourceId,
  sourceName,
  minPoints = 100,
  showHn = false,
}: {
  sourceId: string;
  sourceName: string;
  minPoints?: number;
  showHn?: boolean;
}): Promise<FeedItem[]> {
  const url = `https://hn.algolia.com/api/v1/search_by_date?tags=${showHn ? "show_hn" : "story"}&hitsPerPage=50`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`HN fetch failed: ${res.status}`);
  }

  const data = await res.json();

  return data.hits
    .filter((item: HNItem) => item.points >= minPoints && item.url)
    .map((item: HNItem) => ({
      sourceId,
      sourceName,
      externalId: item.objectID,
      url: item.url!,
      urlNormalized: normalizeUrl(item.url!),
      title: item.title,
      author: item.author,
      rawContent: "",
      publishedAt: new Date(item.created_at),
    }));
}
