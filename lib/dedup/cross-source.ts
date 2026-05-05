import { db } from "@/lib/db/supabase";

// Cross-source dedup: same article reaching us through multiple sources.
// URL-normalized matching only.
//
// Title fuzzy matching was tested against the corpus on 2026-05-04 and
// rejected — see Decisions page for the full reasoning. tl;dr: tech
// content has too many low-entropy titles (version numbers, recurring
// generic titles, series content) and trigram similarity produced ~85%
// false positives. URL-only is sufficient for v1.

export async function findDuplicate(input: {
  urlNormalized: string;
}): Promise<{ id: string } | null> {
  const supabase = db();

  // Check against last 14 days. Older matches are coincidental, not the
  // "same article via two sources within hours" case we're catching.
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: urlMatch } = await supabase
    .from("items")
    .select("id")
    .eq("url_normalized", input.urlNormalized)
    .gte("published_at", since)
    .limit(1)
    .maybeSingle();

  return urlMatch ? { id: urlMatch.id } : null;
}
