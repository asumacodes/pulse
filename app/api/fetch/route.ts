import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/supabase";
import { fetchRss } from "@/lib/sources/rss";
import { fetchGithubReleases } from "@/lib/sources/github";
import { fetchHn } from "@/lib/sources/hn";
import type { FeedItem } from "@/types/feed-item";
import { findDuplicate } from "@/lib/dedup/cross-source";
import { scoreItem } from "@/lib/score/keywords";

// POST /api/fetch
// - Reads enabled sources from DB
// - Dispatches by type (Day 1: only RSS)
// - Inserts new items, dedupes via UNIQUE (source_id, external_id)
// - Returns a per-source summary

export const dynamic = "force-dynamic"; // never cache
export const maxDuration = 60; // allow time for slow feeds

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (process.env.CRON_SECRET && auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = db();

  // Start a fetch_runs row for telemetry
  const { data: run, error: runErr } = await supabase
    .from("fetch_runs")
    .insert({ status: "running" })
    .select("id")
    .single();

  if (runErr || !run) {
    return NextResponse.json(
      { error: "failed to create fetch_run", detail: runErr },
      { status: 500 },
    );
  }

  // Pull enabled sources
  const { data: sources, error: srcErr } = await supabase
    .from("sources")
    .select("id, name, type, url")
    .eq("enabled", true);

  if (srcErr) {
    await supabase
      .from("fetch_runs")
      .update({
        status: "failed",
        error: srcErr.message,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return NextResponse.json(
      { error: "failed to load sources", detail: srcErr },
      { status: 500 },
    );
  }

  if (!sources || sources.length === 0) {
    await supabase
      .from("fetch_runs")
      .update({
        status: "success",
        source_count: 0,
        items_fetched: 0,
        items_inserted: 0,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return NextResponse.json({
      ok: true,
      message: "no enabled sources",
      fetched: 0,
      inserted: 0,
    });
  }

  // Fetch from each source. Continue on individual failures — one bad feed
  // shouldn't sink the run.
  const results: Array<{
    source: string;
    fetched: number;
    inserted: number;
    error?: string;
  }> = [];
  let totalFetched = 0;
  let totalInserted = 0;

  for (const source of sources) {
    try {
      let items: FeedItem[] = [];

      if (source.type === "rss") {
        if (!source.url) throw new Error("rss source missing url");
        items = await fetchRss({
          sourceId: source.id,
          sourceName: source.name,
          url: source.url,
        });
      } else if (source.type === "github_release") {
        if (!source.url)
          throw new Error("github_release source missing repository");
        // repo stored in `url` field
        items = await fetchGithubReleases({
          sourceId: source.id,
          sourceName: source.name,
          repo: source.url!, // e.g. "vercel/next.js"
        });
      } else if (source.type === "hn" || source.type === "show_hn") {
        items = await fetchHn({
          sourceId: source.id,
          sourceName: source.name,
          showHn: source.type === "show_hn",
        });
      } else {
        throw new Error(`type ${source.type} not implemented yet`);
      }

      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      items = items.filter((item) => item.publishedAt >= cutoff);

      totalFetched += items.length;

      const rows = [];
      for (const it of items) {
        const dup = await findDuplicate({
          urlNormalized: it.urlNormalized,
          title: it.title,
        });

        if (dup) {
          // Skip — would create a duplicate
          continue;
        }
        const { score } = scoreItem({
          title: it.title,
          rawContent: it.rawContent ?? "",
        });

        rows.push({
          source_id: it.sourceId,
          external_id: it.externalId,
          url: it.url,
          url_normalized: it.urlNormalized,
          title: it.title,
          author: it.author ?? null,
          raw_content: it.rawContent ?? null,
          published_at: it.publishedAt.toISOString(),
          keyword_score: score,
          status: "new",
        });
      }

      // Supabase upsert with ignoreDuplicates handles the conflict cleanly
      const { data: inserted, error: insertErr } = await supabase
        .from("items")
        .upsert(rows, {
          onConflict: "source_id,external_id",
          ignoreDuplicates: true,
        })
        .select("id");

      if (insertErr) throw insertErr;

      const insertedCount = inserted?.length ?? 0;
      totalInserted += insertedCount;
      results.push({
        source: source.name,
        fetched: items.length,
        inserted: insertedCount,
      });

      // Update source health
      if (items.length === 0) {
        results.push({
          source: source.name,
          fetched: 0,
          inserted: 0,
        });

        await supabase
          .from("sources")
          .update({ last_fetch: new Date().toISOString(), fetch_error: null })
          .eq("id", source.id);

        continue;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        source: source.name,
        fetched: 0,
        inserted: 0,
        error: msg,
      });
      await supabase
        .from("sources")
        .update({ fetch_error: msg })
        .eq("id", source.id);
    }
  }

  // Close out the run
  const anyError = results.some((r) => r.error);
  await supabase
    .from("fetch_runs")
    .update({
      status: anyError ? "partial" : "success",
      source_count: sources.length,
      items_fetched: totalFetched,
      items_inserted: totalInserted,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  return NextResponse.json({
    ok: true,
    fetched: totalFetched,
    inserted: totalInserted,
    sources: results,
  });
}
