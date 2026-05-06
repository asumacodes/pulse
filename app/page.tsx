import { db } from "@/lib/db/supabase";

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
  llm_score: number | null;
  final_score: number | null;
  summary: string | null;
  why_it_matters: string | null;
  action: string | null;
  source_id: string;
  sources: { name: string; category: string | null } | null;
};

const SCORE_THRESHOLD = 6;
const WINDOW_HOURS = 48;

export default async function Page() {
  const supabase = db();

  const now = new Date();
  const since = new Date(
    now.getTime() - WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("items")
    .select(
      "id, title, url, author, published_at, raw_content, keyword_score, llm_score, final_score, summary, why_it_matters, action, source_id, sources(name, category)",
    )
    .gte("final_score", SCORE_THRESHOLD)
    .order("final_score", { ascending: false })
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
                  score: {item.final_score}
                  {item.llm_score !== null &&
                    item.keyword_score !== null &&
                    item.llm_score !== item.keyword_score && (
                      <span className="text-zinc-300">
                        {" "}
                        (kw {item.keyword_score} / llm {item.llm_score})
                      </span>
                    )}
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

              {item.summary ? (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-zinc-700">{item.summary}</p>
                  {item.why_it_matters && (
                    <p className="text-sm italic text-zinc-500">
                      Why it matters: {item.why_it_matters}
                    </p>
                  )}
                  {item.action && (
                    <p className="text-sm font-medium text-zinc-800">
                      → {item.action}
                    </p>
                  )}
                </div>
              ) : (
                item.raw_content && (
                  <p className="mt-2 line-clamp-3 text-sm text-zinc-600">
                    {item.raw_content}
                  </p>
                )
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
