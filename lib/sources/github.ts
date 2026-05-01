import type { FeedItem } from "@/types/feed-item";

type GithubRelease = {
  id: number;
  tag_name: string;
  name: string | null;
  html_url: string;
  body: string | null;
  published_at: string;
  author: { login: string };
};

export async function fetchGithubReleases({
  sourceId,
  sourceName,
  repo,
}: {
  sourceId: string;
  sourceName: string;
  repo: string; // e.g. "vercel/next.js"
}): Promise<FeedItem[]> {
  const url = `https://api.github.com/repos/${repo}/releases`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "pulse-app",
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub fetch failed: ${res.status} ${res.statusText}`);
  }

  const data: GithubRelease[] = await res.json();

  return data.map((rel) => ({
    sourceId,
    sourceName,
    externalId: String(rel.id),
    url: rel.html_url,
    urlNormalized: rel.html_url,
    title: rel.name || rel.tag_name,
    author: rel.author?.login ?? null,
    rawContent: rel.body ?? "",
    publishedAt: new Date(rel.published_at),
  }));
}
