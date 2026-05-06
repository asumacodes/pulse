import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/supabase";
import { summarize } from "@/lib/llm/summarize";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KEYWORD_THRESHOLD = 8;
const BATCH_SIZE = 20;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = db();

  const { data: pending, error } = await supabase
    .from("items")
    .select("id, title, url, author, raw_content, source_id, sources(name)")
    .gte("keyword_score", KEYWORD_THRESHOLD)
    .is("llm_processed_at", null)
    .order("published_at", { ascending: false })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      message: "nothing to do",
    });
  }

  let processed = 0;
  const failures: Array<{ id: string; title: string; error: string }> = [];

  for (const row of pending) {
    const sourceName =
      row.sources && typeof row.sources === "object" && "name" in row.sources
        ? (row.sources as { name: string }).name
        : undefined;

    try {
      const result = await summarize({
        sourceId: row.source_id,
        sourceName,
        externalId: "",
        url: row.url,
        urlNormalized: "",
        title: row.title,
        author: row.author ?? undefined,
        rawContent: row.raw_content ?? undefined,
        publishedAt: new Date(),
      });

      await supabase
        .from("items")
        .update({
          summary: result.summary,
          why_it_matters: result.why_it_matters,
          action: result.action,
          tags: result.tags,
          llm_score: result.relevance,
          llm_processed_at: new Date().toISOString(),
          status: "processed",
        })
        .eq("id", row.id);

      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ id: row.id, title: row.title.slice(0, 80), error: msg });

      // Mark the item as processed-with-error so we don't retry forever.
      // status='ignored' takes it out of the briefing pool, llm_processed_at
      // takes it out of the /api/process queue. Re-run by setting both back to null.
      await supabase
        .from("items")
        .update({
          llm_processed_at: new Date().toISOString(),
          status: "ignored",
        })
        .eq("id", row.id);
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    processed,
    failures: failures.length,
    failureDetails: failures,
    remaining:
      pending.length === BATCH_SIZE ? "more items pending — call again" : 0,
  });
}
