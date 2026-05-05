import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/supabase";
import { scoreItem } from "@/lib/score/keywords";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/score
// Score any item where keyword_score is null. One-time backfill, also useful
// after editing the keyword vocabulary — bump a `keyword_version` later if
// re-scoring becomes a regular need.

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = db();

  const { data: items, error } = await supabase
    .from("items")
    .select("id, title, raw_content")
    .is("keyword_score", null)
    .limit(500);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!items || items.length === 0) {
    return NextResponse.json({
      ok: true,
      scored: 0,
      message: "nothing to score",
    });
  }

  // Score in memory, then bulk-update.
  const updates = items.map((row) => ({
    id: row.id,
    keyword_score: scoreItem({
      title: row.title,
      rawContent: row.raw_content ?? "",
    }).score,
  }));

  // Supabase doesn't support bulk update by primary key, so loop.
  // For 500 items this is < 2 seconds.
  let updated = 0;
  for (const u of updates) {
    const { error: updErr } = await supabase
      .from("items")
      .update({ keyword_score: u.keyword_score })
      .eq("id", u.id);
    if (!updErr) updated++;
  }

  // Histogram for visibility
  const histogram = updates.reduce<Record<number, number>>((acc, u) => {
    acc[u.keyword_score] = (acc[u.keyword_score] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    ok: true,
    scored: updated,
    histogram,
    remaining: items.length === 500 ? "more pending — call again" : 0,
  });
}
