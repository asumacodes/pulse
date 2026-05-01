// URL normalization for dedup. Same logical article published in multiple
// places (RSS feed + HN submission, e.g.) should collapse to one row.
//
// Day 1 keeps this minimal — we'll get fancier in Day 3 if needed.

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "ref_src",
  "ref_url",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
  "hsCtaTracking",
]);

export function normalizeUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    // Bad URL — return lowercased input as last-resort dedup key.
    return input.toLowerCase().trim();
  }

  // Lowercase host
  url.hostname = url.hostname.toLowerCase();

  // Drop tracking params
  for (const param of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(param.toLowerCase())) {
      url.searchParams.delete(param);
    }
  }

  // Sort remaining params for deterministic output
  url.searchParams.sort();

  // Drop trailing slash from pathname (but keep root "/")
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  // Drop fragment (#section anchors aren't different content)
  url.hash = "";

  // Drop default ports
  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  ) {
    url.port = "";
  }

  return url.toString();
}
