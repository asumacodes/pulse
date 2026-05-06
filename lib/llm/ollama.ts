import OpenAI from "openai";

// Ollama exposes an OpenAI-compatible API, so we use the OpenAI SDK as a typed
// client. No API key is needed — the "ollama" string is a placeholder the SDK
// requires. See https://github.com/ollama/ollama/blob/main/docs/openai.md

let cached: OpenAI | null = null;

export function llm(): OpenAI {
  if (cached) return cached;

  const baseURL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";

  cached = new OpenAI({
    baseURL,
    apiKey: "ollama", // required by SDK, ignored by Ollama
  });

  return cached;
}

export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gpt-oss:20b";
