import { db } from "@/lib/db/supabase";

// Day 3: filter to keyword_score >= 5, sort by score then recency.
// Score badge is a debugging tool — comes off in Day 6 polish.
// Server component, no client JS needed.

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ItemRow = {
  id: string;
  title: string;
  url: string;
  author: string | null;
  published_at: string;
  raw_content: string | null;
  keyword_score: number | null;
  source_id: string;
  sources: { name: string; category: string | null } | null;
};

const SCORE_THRESHOLD = 5;

export default async function Page() {
  const supabase = db();

  const { data, error } = await supabase
    .from("items")
    .select(
      "id, title, url, author, published_at, raw_content, keyword_score, source_id, sources(name, category)",
    )
    .gte("keyword_score", SCORE_THRESHOLD)
    .order("keyword_score", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(50)
    .returns<ItemRow[]>();

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-xl font-semibold">Pulse</h1>
        <pre className="mt-4 rounded bg-red-50 p-3 text-sm text-red-900">
          {error.message}
        </pre>
      </main>
    );
  }

  const items = data ?? [];

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8 border-b pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Pulse</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}{" "}
          · {items.length} items scoring ≥ {SCORE_THRESHOLD}
        </p>
      </header>

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No items above the score threshold. Either the scorer needs tuning, or
          the firehose was quiet today. Lower <code>SCORE_THRESHOLD</code> to
          investigate.
        </p>
      ) : (
        <ul className="space-y-6">
          {items.map((item) => (
            <li key={item.id} className="border-b pb-6 last:border-0">
              <div className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
                <span>{item.sources?.name ?? "Unknown"}</span>
                {item.sources?.category && (
                  <>
                    <span>·</span>
                    <span>{item.sources.category}</span>
                  </>
                )}
                <span>·</span>
                <time dateTime={item.published_at}>
                  {new Date(item.published_at).toLocaleString()}
                </time>
                <span>·</span>
                <span className="text-zinc-400">
                  score: {item.keyword_score ?? "—"}
                </span>
              </div>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="block text-base font-medium leading-snug text-zinc-900 hover:underline"
              >
                {item.title}
              </a>

              {item.raw_content && (
                <p className="mt-2 line-clamp-3 text-sm text-zinc-600">
                  {item.raw_content}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-12 text-xs text-zinc-400">
        Day 3 view · keyword-scored, no LLM yet · summaries arrive in Day 4
      </footer>
    </main>
  );
}
