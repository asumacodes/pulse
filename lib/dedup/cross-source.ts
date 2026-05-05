import { db } from "@/lib/db/supabase";

// Two items collide if either:
// 1. They share a normalized URL (set in Day 1 already), OR
// 2. Their titles are >= 0.85 similar (using pg_trgm).
//
// Strategy: when inserting, check for collisions FIRST. If a collision exists,
// mark the new item status='suppressed' instead of inserting normally.

export async function findDuplicate(input: {
  urlNormalized: string;
  title: string;
}): Promise<{ id: string; reason: "url" | "title" } | null> {
  const supabase = db();

  // 1. URL match (cheap, exact) — checked against last 14 days
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: urlMatch } = await supabase
    .from("items")
    .select("id")
    .eq("url_normalized", input.urlNormalized)
    .gte("published_at", since)
    .limit(1)
    .maybeSingle();

  if (urlMatch) return { id: urlMatch.id, reason: "url" };

  // 2. Title fuzzy match (uses pg_trgm via the GIN index from schema.sql).
  // 0.85 similarity is a good starting point — tune by checking false positives.
  const { data: titleMatch } = await supabase.rpc("find_similar_title", {
    query_title: input.title,
    since_date: since,
    threshold: 0.97,
  });

  if (titleMatch && titleMatch.length > 0) {
    return { id: titleMatch[0].id, reason: "title" };
  }

  return null;
}
