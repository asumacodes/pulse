-- =============================================================================
-- Pulse — Database Schema (v1)
-- =============================================================================
-- Run this in the Supabase SQL editor for a fresh project.
-- Postgres 15+. No RLS (single user, server-only access via service role key).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";  -- for future fuzzy title dedup


-- -----------------------------------------------------------------------------
-- sources
-- -----------------------------------------------------------------------------
-- The curated list of inputs Pulse reads from. Mirrors sources.md.
-- Keep this table small (~50 rows). Edit by hand or via seed script.

create table sources (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,                              -- "Anthropic News"
  type        text not null check (type in ('rss', 'github_release', 'hn', 'show_hn', 'github_trending')),
  url         text,                                       -- feed URL or repo identifier (e.g. "vercel/next.js")
  category    text,                                       -- "ai-labs", "frontend", "design", "ai-tooling", etc.
  tier        text check (tier in ('A', 'B', 'C')),       -- A = daily zero-noise, B = variable, C = experimental
  enabled     boolean not null default true,
  last_fetch  timestamptz,                                -- when fetcher last ran successfully
  fetch_error text,                                       -- last error string, null if healthy
  created_at  timestamptz not null default now()
);

create unique index sources_name_idx on sources (name);
create index sources_enabled_idx on sources (enabled) where enabled = true;


-- -----------------------------------------------------------------------------
-- items
-- -----------------------------------------------------------------------------
-- Every fetched item from every source. The firehose. ~30-50/day expected.
-- Most won't make it into a briefing — that's fine, we keep them for archive
-- and feedback loops.

create table items (
  id              uuid primary key default uuid_generate_v4(),
  source_id       uuid not null references sources(id) on delete cascade,

  -- Source-side identity
  external_id     text not null,                          -- guid from RSS, release id from GH, story id from HN
  url             text not null,
  url_normalized  text not null,                          -- for dedup: lowercased, no query params, no trailing slash

  -- Content
  title           text not null,
  author          text,
  raw_content     text,                                   -- body / description / release notes (truncated to ~10k chars on insert)
  published_at    timestamptz not null,                   -- when the source published it

  -- Scoring (filled in stages by the pipeline)
  keyword_score   smallint,                               -- 0-10, set by lib/score/keyword.ts on insert
  llm_score       smallint,                               -- 0-10, set by lib/summarize.ts only if keyword_score >= threshold
  final_score     smallint generated always as (greatest(coalesce(keyword_score, 0), coalesce(llm_score, 0))) stored,

  -- LLM output
  summary         text,                                   -- 2 sentences, "what shipped"
  why_it_matters  text,                                   -- 1 sentence, for-me-specifically
  action          text,                                   -- optional 1 sentence, "try X" / "skim Y" / null
  tags            jsonb,                                  -- ["ai", "agents"] — array of strings from the fixed tag list
  llm_processed_at timestamptz,                           -- when summarization ran; null = not yet

  -- Lifecycle
  status          text not null default 'new'
                  check (status in ('new', 'processed', 'briefed', 'saved', 'ignored', 'suppressed')),
                  -- new = fetched, not scored
                  -- processed = scored (keyword + maybe LLM)
                  -- briefed = included in a briefing
                  -- saved = I marked it as worth keeping (future feedback UI)
                  -- ignored = I marked it as noise (future feedback UI)
                  -- suppressed = auto-dropped (e.g., excluded keywords, duplicate)

  created_at      timestamptz not null default now(),

  -- Dedup: don't insert the same source+external_id twice
  unique (source_id, external_id)
);

-- Indexes for the hot paths
create index items_published_idx on items (published_at desc);
create index items_score_idx on items (final_score desc, published_at desc);
create index items_status_idx on items (status);
create index items_url_norm_idx on items (url_normalized);            -- cross-source URL dedup
create index items_title_trgm_idx on items using gin (title gin_trgm_ops);  -- fuzzy title dedup later
create index items_briefed_today_idx on items (published_at desc)
  where status = 'briefed';


-- -----------------------------------------------------------------------------
-- briefings
-- -----------------------------------------------------------------------------
-- One row per day. The "morning briefing" the dashboard renders.
-- top_items snapshots the chosen item IDs + their summaries at briefing time,
-- so even if items get re-scored later, the briefing remains stable.

create table briefings (
  id            uuid primary key default uuid_generate_v4(),
  briefing_date date not null unique,                     -- one briefing per day, period
  title         text,                                     -- optional "Good morning" lede line
  intro         text,                                     -- optional 2-3 sentence opener
  top_items     jsonb not null,                           -- array of {item_id, title, url, summary, why_it_matters, action, tags, source_name, score}
  item_count    smallint not null,                        -- denormalized for quick display
  generated_at  timestamptz not null default now()
);

create index briefings_date_idx on briefings (briefing_date desc);


-- -----------------------------------------------------------------------------
-- fetch_runs (operational telemetry, lightweight)
-- -----------------------------------------------------------------------------
-- One row per fetch invocation. Useful when something breaks and I want to
-- ask "what happened on Tuesday morning?" without spelunking Vercel logs.

create table fetch_runs (
  id            uuid primary key default uuid_generate_v4(),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  source_count  smallint,                                 -- sources attempted
  items_fetched smallint,                                 -- raw items pulled
  items_inserted smallint,                                -- after dedup
  items_scored  smallint,                                 -- passed keyword threshold + got LLM-scored
  llm_cost_usd  numeric(8,4),                             -- estimated, for the cost guardrail
  status        text not null default 'running'
                check (status in ('running', 'success', 'partial', 'failed')),
  error         text
);

create index fetch_runs_started_idx on fetch_runs (started_at desc);


-- =============================================================================
-- Seed data — sources from sources.md, Tier A only for Day 1
-- =============================================================================
-- Day 1 only inserts Anthropic. Day 2 expands. Keep this file as the canonical
-- source-of-truth and re-run the inserts when adding new sources.

insert into sources (name, type, url, category, tier, enabled) values
  -- AI labs (Tier A)
  ('Anthropic News',    'rss', 'https://raw.githubusercontent.com/Olshansk/rss-feeds/refs/heads/main/feeds/feed_anthropic_news.xml',     'ai-labs', 'A', true),
  ('OpenAI Blog',       'rss', 'https://openai.com/blog/rss.xml',            'ai-labs', 'A', true),  -- enable Day 2
  ('Google DeepMind',   'rss', 'https://deepmind.google/blog/rss.xml',       'ai-labs', 'A', true),
  ('Hugging Face Blog', 'rss', 'https://huggingface.co/blog/feed.xml',       'ai-labs', 'A', true),

  -- Dev / framework (Tier A)
  ('Vercel Blog',       'rss', 'https://vercel.com/atom',                    'frontend', 'A', true),
  ('Vercel Changelog',  'rss', 'https://vercel.com/changelog/feed.xml',      'frontend', 'A', false),
  ('Next.js Blog',      'rss', 'https://nextjs.org/feed.xml',                'frontend', 'A', true),
  ('Supabase Blog',     'rss', 'https://supabase.com/feed.xml',              'backend',  'A', false),
  ('Tailwind Blog',     'rss', 'https://tailwindcss.com/feeds/feed.xml',     'frontend', 'A', true),

  -- Design / craft (Tier B)
  ('Figma Blog',        'rss', 'https://figma.com/blog/feed/atom.xml',       'design',   'B', true),
  ('Linear Changelog',  'rss', 'https://linear.app/changelog/rss.xml',       'design',   'B', false),

  -- Builder voices (Tier B)
  ('Simon Willison',    'rss', 'https://simonwillison.net/atom/everything/', 'builders', 'B', true),
  ('Latent Space',      'rss', 'https://www.latent.space/feed',              'builders', 'B', true),
  ('Interconnects',     'rss', 'https://www.interconnects.ai/feed',          'builders', 'B', true),

  -- GitHub Releases (Tier A) — url is the "owner/repo" identifier
  ('vercel/next.js',                'github_release', 'vercel/next.js',                'frontend',    'A', false),
  ('vercel/ai',                     'github_release', 'vercel/ai',                     'ai-tooling',  'A', false),
  ('shadcn-ui/ui',                  'github_release', 'shadcn-ui/ui',                  'frontend',    'A', false),
  ('tailwindlabs/tailwindcss',      'github_release', 'tailwindlabs/tailwindcss',      'frontend',    'A', false),
  ('supabase/supabase',             'github_release', 'supabase/supabase',             'backend',     'A', false),
  ('radix-ui/primitives',           'github_release', 'radix-ui/primitives',           'frontend',    'A', false),
  ('emilkowalski/vaul',             'github_release', 'emilkowalski/vaul',             'frontend',    'A', false),
  ('anthropics/anthropic-sdk-typescript', 'github_release', 'anthropics/anthropic-sdk-typescript', 'ai-tooling', 'A', false),
  ('anthropics/anthropic-cookbook', 'github_release', 'anthropics/anthropic-cookbook', 'ai-tooling',  'A', false),
  ('modelcontextprotocol/servers',  'github_release', 'modelcontextprotocol/servers',  'ai-tooling',  'A', false),
  ('ollama/ollama',                 'github_release', 'ollama/ollama',                 'local-llm',   'A', false),
  ('ggerganov/llama.cpp',           'github_release', 'ggerganov/llama.cpp',           'local-llm',   'A', false),

  -- Hacker News (Tier A) — url is unused, type-routed in fetcher
  ('Hacker News',       'hn',      null, 'community', 'A', false),
  ('Show HN',           'show_hn', null, 'community', 'B', false);


-- =============================================================================
-- Notes
-- =============================================================================
-- 1. Day 1 enables ONLY "Anthropic News". Day 2+ flips `enabled = true` for
--    the rest. This keeps the firehose tiny while we shake out bugs.
--
-- 2. `final_score` is a generated column — single source of truth for ordering.
--    No application code should ever write to it directly.
--
-- 3. `url_normalized` is set in app code, not via trigger. Logic lives in
--    `lib/dedup/normalize-url.ts` so it's testable.
--
-- 4. No RLS. Service role key only. If this ever leaves my laptop, RLS becomes
--    Day-One-of-multi-user, not retrofitted.
--
-- 5. `items.raw_content` is truncated to 10k chars on insert (in app code).
--    LLM doesn't need more, and Postgres TOAST overhead on huge text is wasteful.
--
-- 6. `tags` is jsonb (not text[]) so we can grow the schema later — e.g.
--    {tags: [...], confidence: 0.8, ...} — without a migration.