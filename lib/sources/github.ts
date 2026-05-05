import type { FeedItem } from "@/types/feed-item";

type GithubRelease = {
  id: number;
  tag_name: string;
  name: string | null;
  html_url: string;
  body: string | null;
  published_at: string;
  author: { login: string };
  prerelease: boolean;
  draft: boolean;
};

// Skip releases that are noise: pre-releases, canary/rc/beta/alpha/nightly tags,
// llama.cpp's sequential nightly build numbers (b9012, b9033, etc.), and drafts.
//
// Without this filter, llama.cpp + Vercel AI SDK alone produce 25+ items/day
// of zero-content CI artifacts. See Decisions log, 2026-05-06 entry.
function shouldSkipRelease(rel: {
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
}): boolean {
  if (rel.draft) return true;
  if (rel.prerelease) return true;

  const tag = rel.tag_name.toLowerCase();

  // llama.cpp nightly builds: b9012, b9033, etc.
  if (/^b\d{4,}$/.test(tag)) return true;

  // Generic pre-release markers anywhere in the tag
  if (/(canary|nightly)/.test(tag)) return true;

  // Pre-release suffixes: -rc1, -beta.2, -alpha, -dev, -canary.40
  if (/-(rc|beta|alpha|dev|canary)(\.|-|\d|$)/.test(tag)) return true;

  return false;
}

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

  return data
    .filter((rel) => !shouldSkipRelease(rel))
    .map((rel) => ({
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
