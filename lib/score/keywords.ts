// Keyword scoring config. The vocabulary tracks the Interest Profile —
// keep them in sync as taste sharpens.
//
// Scoring model: each keyword has a weight. We sum weighted matches in
// title + raw_content, then bucket into 0-10. Title matches count double.

type WeightedKeyword = {
  pattern: RegExp; // case-insensitive, word-boundary aware
  weight: number; // contribution to raw score
  reason: string; // for debugging — why this keyword exists
};

// ---------- POSITIVE SIGNAL ----------
// Higher weights = stronger signal. Tune based on what you're seeing in /today.

const STRONG = 5; // unmistakable signal — title hit alone should push to 5+
const MEDIUM = 3; // good signal, multiple needed for high score
const WEAK = 1; // background relevance, only matters in combination

export const POSITIVE: WeightedKeyword[] = [
  // ---- AI models & labs (STRONG) ----
  {
    pattern: /\b(claude|anthropic)\b/i,
    weight: STRONG,
    reason: "primary LLM provider",
  },
  {
    pattern: /\b(gpt-?[45]|openai)\b/i,
    weight: STRONG,
    reason: "major LLM provider",
  },
  {
    pattern: /\b(gemini|google deepmind)\b/i,
    weight: STRONG,
    reason: "major LLM provider",
  },
  {
    pattern: /\b(llama|mistral|mixtral|qwen|deepseek)\b/i,
    weight: STRONG,
    reason: "open models I run locally",
  },
  { pattern: /\bollama\b/i, weight: STRONG, reason: "local inference stack" },

  // ---- AI dev tools (STRONG) ----
  {
    pattern: /\b(cursor|claude code|claude-code)\b/i,
    weight: STRONG,
    reason: "coding agents I use",
  },
  {
    pattern: /\b(v0|lovable|bolt\.new)\b/i,
    weight: MEDIUM,
    reason: "code-gen tools",
  },
  {
    pattern: /\b(mcp|model context protocol)\b/i,
    weight: STRONG,
    reason: "MCP ecosystem",
  },
  { pattern: /\bvercel ai sdk\b/i, weight: STRONG, reason: "core dependency" },

  // ---- Agent / inference patterns (MEDIUM) ----
  {
    pattern: /\b(agent|agentic|tool use|tool-use|tool calling)\b/i,
    weight: MEDIUM,
    reason: "SprintZero relevance",
  },
  {
    pattern: /\b(structured output|json mode|function calling)\b/i,
    weight: MEDIUM,
    reason: "FinMatter relevance",
  },
  {
    pattern: /\b(rag|retrieval augmented|embeddings?)\b/i,
    weight: MEDIUM,
    reason: "common AI app pattern",
  },
  {
    pattern: /\b(eval|evaluation|benchmark)\b/i,
    weight: MEDIUM,
    reason: "quality measurement",
  },
  {
    pattern: /\b(prompt cach\w*|prompt engineering)\b/i,
    weight: MEDIUM,
    reason: "cost / quality lever",
  },
  {
    pattern: /\b(quantiz\w*|gguf|q4|q5|q8)\b/i,
    weight: MEDIUM,
    reason: "local inference relevance",
  },
  {
    pattern: /\b(vllm|llama\.cpp|llama-cpp)\b/i,
    weight: MEDIUM,
    reason: "inference engines",
  },

  // ---- Frontend stack (STRONG for direct stack, MEDIUM for adjacent) ----
  { pattern: /\bnext\.?js\b/i, weight: STRONG, reason: "primary framework" },
  { pattern: /\bvercel\b/i, weight: MEDIUM, reason: "hosting + ecosystem" },
  {
    pattern: /\b(shadcn|shadcn\/ui)\b/i,
    weight: STRONG,
    reason: "primary UI lib",
  },
  { pattern: /\bradix\b/i, weight: MEDIUM, reason: "underlies shadcn" },
  { pattern: /\btailwind\b/i, weight: MEDIUM, reason: "primary styling" },
  {
    pattern: /\b(react server component|rsc|server action)\b/i,
    weight: MEDIUM,
    reason: "App Router patterns",
  },
  {
    pattern: /\b(framer motion|vaul)\b/i,
    weight: WEAK,
    reason: "interaction libs",
  },

  // ---- Backend stack (MEDIUM) ----
  {
    pattern: /\b(supabase|postgres|postgresql)\b/i,
    weight: MEDIUM,
    reason: "primary db",
  },
  {
    pattern: /\b(neon|planetscale|drizzle|prisma)\b/i,
    weight: WEAK,
    reason: "adjacent db tooling",
  },

  // ---- Design (MEDIUM) ----
  { pattern: /\b(figma|figjam)\b/i, weight: MEDIUM, reason: "design tool" },
  {
    pattern: /\b(linear\.app|linear app)\b/i,
    weight: MEDIUM,
    reason: "product worth studying",
  },
  {
    pattern: /\b(design system|design-system)\b/i,
    weight: MEDIUM,
    reason: "core interest",
  },
  {
    pattern: /\b(typography|kerning|leading)\b/i,
    weight: WEAK,
    reason: "craft signal",
  },

  // ---- Self-hosting / homelab (MEDIUM, new since Ollama switch) ----
  {
    pattern: /\b(cloudflare tunnel|tailscale|self-host\w*|homelab)\b/i,
    weight: MEDIUM,
    reason: "Pulse deployment relevance",
  },
  {
    pattern: /\b(rtx 40\d{2}|rtx 50\d{2}|consumer gpu)\b/i,
    weight: WEAK,
    reason: "local inference hardware",
  },

  // ---- Indie / launch signal (WEAK alone, MEDIUM with other hits) ----
  { pattern: /\bshow hn\b/i, weight: WEAK, reason: "launch signal" },
  {
    pattern: /\b(indie hack\w*|solo founder|bootstrap\w*)\b/i,
    weight: WEAK,
    reason: "indie context",
  },
  {
    pattern: /\b(launch\w*|shipped|released)\b/i,
    weight: WEAK,
    reason: "what-shipped signal",
  },
];

// ---------- NEGATIVE SIGNAL ----------
// Auto-drop or strongly downweight. Don't be shy here.

const KILL = -10; // drop to floor
const PENALTY = -3; // strong downweight

export const NEGATIVE: WeightedKeyword[] = [
  // Funding / business news
  {
    pattern: /\b(series [a-e]|seed round|raised \$|funding round|valuation)\b/i,
    weight: PENALTY,
    reason: "funding noise",
  },
  {
    pattern: /\b(acquisition|acquir\w+ by|merger|ipo)\b/i,
    weight: PENALTY,
    reason: "M&A noise",
  },

  // Org-chart / hires
  {
    pattern:
      /\b(named ceo|new cfo|hires? .* officer|hires? .* president|departures?)\b/i,
    weight: PENALTY,
    reason: "exec shuffle",
  },
  {
    pattern: /\b(layoffs?|fires? \d+)\b/i,
    weight: PENALTY,
    reason: "layoff news",
  },

  // Policy / regulation / doom
  {
    pattern: /\b(eu ai act|ai regulation|antitrust|lawsuit|copyright suit)\b/i,
    weight: PENALTY,
    reason: "policy noise",
  },
  {
    pattern: /\b(agi timeline|x-risk|existential|doomer|p\(doom\))\b/i,
    weight: KILL,
    reason: "doom discourse",
  },
  {
    pattern: /\b(ai safety institute|alignment forum)\b/i,
    weight: PENALTY,
    reason: "safety debate, not building",
  },

  // Crypto / web3
  {
    pattern: /\b(crypto|nft|web3|blockchain|token launch|ico)\b/i,
    weight: KILL,
    reason: "off-topic",
  },

  // Listicles / hype
  {
    pattern: /\b(\d+ best|\d+ top|top \d+|\d+ amazing|you won't believe)\b/i,
    weight: PENALTY,
    reason: "listicle",
  },
  {
    pattern: /\b(game.?changer|revolutionary|disrupt\w+)\b/i,
    weight: PENALTY,
    reason: "hype words",
  },

  // Influencer / how-I-made-money
  {
    pattern:
      /\b(how i made \$|made \$\d+|\$\d+k? in \d+ (days?|weeks?|months?))\b/i,
    weight: KILL,
    reason: "influencer junk",
  },
];

// ---------- SCORING FUNCTION ----------

export function scoreItem(input: { title: string; rawContent: string }): {
  score: number;
  hits: Array<{
    keyword: string;
    weight: number;
    in: "title" | "content";
    reason: string;
  }>;
} {
  const hits: ReturnType<typeof scoreItem>["hits"] = [];
  let raw = 0;

  // Title matches count double
  for (const kw of POSITIVE) {
    if (kw.pattern.test(input.title)) {
      raw += kw.weight * 2;
      hits.push({
        keyword: kw.pattern.source,
        weight: kw.weight * 2,
        in: "title",
        reason: kw.reason,
      });
    } else if (kw.pattern.test(input.rawContent)) {
      raw += kw.weight;
      hits.push({
        keyword: kw.pattern.source,
        weight: kw.weight,
        in: "content",
        reason: kw.reason,
      });
    }
  }

  for (const kw of NEGATIVE) {
    if (kw.pattern.test(input.title) || kw.pattern.test(input.rawContent)) {
      raw += kw.weight;
      hits.push({
        keyword: kw.pattern.source,
        weight: kw.weight,
        in: "title",
        reason: kw.reason,
      });
    }
  }

  // Bucket into 0-10. The buckets aren't linear — most items should land in 0-3
  // and a few should make it to 7+. Tune by looking at actual /today output.
  let score: number;
  if (raw <= 0) score = 0;
  else if (raw < 3) score = 2;
  else if (raw < 6) score = 4;
  else if (raw < 10) score = 5;
  else if (raw < 15) score = 6;
  else if (raw < 22) score = 7;
  else if (raw < 30) score = 8;
  else if (raw < 40) score = 9;
  else score = 10;

  return { score, hits };
}
