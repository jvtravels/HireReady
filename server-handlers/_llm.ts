/* Unified LLM caller — tries Groq first, falls back to Gemini on failure */

declare const process: { env: Record<string, string | undefined> };

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const USAGE_LOGGING_ENABLED = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY);

if (!USAGE_LOGGING_ENABLED) {
  // Fires once per cold start; surfaces misconfiguration without spamming per-call.
  console.warn(`[logUsage] disabled — missing env vars (SUPABASE_URL=${!!SUPABASE_URL}, SERVICE_KEY=${!!SUPABASE_SERVICE_KEY})`);
}

/**
 * Writes a usage row to `llm_usage`. Returns a Promise so callers can await
 * completion before returning a response.
 *
 * IMPORTANT — this must be awaited, not fire-and-forget. The analyze-resume
 * handler runs on Vercel's edge runtime, which terminates the isolate as soon
 * as `return Response` resolves. Unawaited fetches are killed mid-flight, so
 * fire-and-forget writes never reach Supabase. (This was why llm_usage stayed
 * empty despite LLM calls succeeding.)
 */
async function logUsage(entry: {
  userId?: string; endpoint?: string; model: string; isFallback: boolean;
  promptTokens: number; completionTokens: number; totalTokens: number;
  latencyMs: number; status: "success" | "error" | "timeout"; errorMessage?: string;
}): Promise<void> {
  if (!USAGE_LOGGING_ENABLED) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/llm_usage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: entry.userId || null,
        endpoint: entry.endpoint || "unknown",
        model: entry.model,
        is_fallback: entry.isFallback,
        prompt_tokens: entry.promptTokens,
        completion_tokens: entry.completionTokens,
        total_tokens: entry.totalTokens,
        latency_ms: entry.latencyMs,
        status: entry.status,
        error_message: entry.errorMessage?.slice(0, 500) || null,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[logUsage] HTTP ${res.status} writing llm_usage: ${body.slice(0, 200)}`);
    }
  } catch (err) {
    console.error(`[logUsage] fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

interface LLMOptions {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  fast?: boolean;
}

interface LLMResult {
  text: string;
  model: string;
  fallback: boolean;
  tokensUsed?: { prompt: number; completion: number; total: number };
  latencyMs?: number;
}

async function callGroq(opts: LLMOptions, signal?: AbortSignal): Promise<LLMResult> {
  const model = opts.fast ? "llama-3.1-8b-instant" : "llama-3.3-70b-versatile";
  const start = Date.now();
  console.log(`[LLM] Groq ${model} — starting request`);
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
    signal,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: opts.prompt }],
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 2000,
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const latencyMs = Date.now() - start;
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[LLM] Groq ${model} — HTTP ${res.status} after ${latencyMs}ms: ${errText.slice(0, 100)}`);
    throw new Error(`Groq error ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const usage = data.usage;
  const tokensUsed = usage ? { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens } : undefined;
  console.log(`[LLM] Groq ${model} — ${tokensUsed?.total ?? "?"} tokens, ${latencyMs}ms`);
  return { text: data.choices?.[0]?.message?.content || "", model, fallback: false, tokensUsed, latencyMs };
}

async function callGemini(opts: LLMOptions, signal?: AbortSignal): Promise<LLMResult> {
  if (!GEMINI_API_KEY) throw new Error("Gemini not configured");
  const model = "gemini-2.5-flash-lite";
  const start = Date.now();
  console.log(`[LLM] Gemini ${model} — starting request`);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    signal,
    body: JSON.stringify({
      contents: [{ parts: [{ text: opts.prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.3,
        maxOutputTokens: opts.maxTokens ?? 2000,
        ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}),
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  const latencyMs = Date.now() - start;
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[LLM] Gemini ${model} — HTTP ${res.status} after ${latencyMs}ms: ${errText.slice(0, 100)}`);
    throw new Error(`Gemini error ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const usage = data.usageMetadata;
  const tokensUsed = usage ? { prompt: usage.promptTokenCount, completion: usage.candidatesTokenCount, total: usage.totalTokenCount } : undefined;
  console.log(`[LLM] Gemini ${model} — ${tokensUsed?.total ?? "?"} tokens, ${latencyMs}ms`);
  return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || "", model, fallback: false, tokensUsed, latencyMs };
}

async function callCerebras(opts: LLMOptions, signal?: AbortSignal): Promise<LLMResult> {
  // Cerebras' free tier serves llama-3.3-70b at ~2200 tok/s — drop-in OpenAI-compatible.
  // Used as a third fallback so a Groq+Gemini outage doesn't kill the interview.
  const model = opts.fast ? "llama3.1-8b" : "llama-3.3-70b";
  const start = Date.now();
  console.log(`[LLM] Cerebras ${model} — starting request`);
  const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CEREBRAS_API_KEY}` },
    signal,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: opts.prompt }],
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 2000,
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const latencyMs = Date.now() - start;
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[LLM] Cerebras ${model} — HTTP ${res.status} after ${latencyMs}ms: ${errText.slice(0, 100)}`);
    throw new Error(`Cerebras error ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const usage = data.usage;
  const tokensUsed = usage ? { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens } : undefined;
  console.log(`[LLM] Cerebras ${model} — ${tokensUsed?.total ?? "?"} tokens, ${latencyMs}ms`);
  return { text: data.choices?.[0]?.message?.content || "", model: `cerebras-${model}`, fallback: false, tokensUsed, latencyMs };
}

export async function callLLM(opts: LLMOptions, timeoutMs = 15000, meta?: { userId?: string; endpoint?: string }): Promise<LLMResult> {
  const providers: { name: string; call: (s: AbortSignal) => Promise<LLMResult> }[] = [];
  if (GROQ_API_KEY) providers.push({ name: "groq", call: (s) => callGroq(opts, s) });
  if (GEMINI_API_KEY) providers.push({ name: "gemini", call: (s) => callGemini(opts, s) });
  if (CEREBRAS_API_KEY) providers.push({ name: "cerebras", call: (s) => callCerebras(opts, s) });

  if (providers.length === 0) throw new Error("No LLM configured — set GROQ_API_KEY, GEMINI_API_KEY, or CEREBRAS_API_KEY");

  // Per-provider timeout: tighter on Groq (p99 ~3s) so we fail over fast during
  // incidents; full budget for Gemini/Cerebras since they're the fallback path.
  const providerTimeout = (name: string) => {
    if (name === "groq") return Math.min(timeoutMs, 6000);
    return timeoutMs;
  };

  const tryProvider = async (provider: { name: string; call: (s: AbortSignal) => Promise<LLMResult> }, isFallback: boolean): Promise<LLMResult> => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), providerTimeout(provider.name));
    try {
      const result = await provider.call(ac.signal);
      clearTimeout(timer);
      // Await so the row is written before the edge isolate terminates.
      await logUsage({ userId: meta?.userId, endpoint: meta?.endpoint, model: result.model, isFallback, promptTokens: result.tokensUsed?.prompt ?? 0, completionTokens: result.tokensUsed?.completion ?? 0, totalTokens: result.tokensUsed?.total ?? 0, latencyMs: result.latencyMs ?? 0, status: "success" });
      return result;
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : "";
      const errName = err instanceof Error ? err.name : "";
      const isTimeout = errName === "AbortError" || msg.includes("aborted") || msg.includes("abort");
      console.error(`[LLM] ${provider.name} failed (${isTimeout ? "timeout" : "error"}): ${msg.slice(0, 150)}`);
      await logUsage({ userId: meta?.userId, endpoint: meta?.endpoint, model: provider.name, isFallback, promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: 0, status: isTimeout ? "timeout" : "error", errorMessage: msg.slice(0, 200) });
      throw err;
    }
  };

  // Walk providers in order: groq → gemini → cerebras. First success wins.
  console.warn(`[LLM] Provider chain: ${providers.map(p => p.name).join(" → ")} (timeout: ${timeoutMs}ms)`);
  let lastErr: unknown;
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      return await tryProvider(provider, i > 0);
    } catch (err) {
      lastErr = err;
      const next = providers[i + 1];
      if (next) console.warn(`[LLM] ${provider.name} failed, falling back to ${next.name}`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All LLM providers failed");
}

export function extractJSON<T = unknown>(text: string): T | null {
  try { return JSON.parse(text); } catch { /* fallback */ }
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fallback */ }
  // Bracket-balanced scan for the first complete JSON value (array or object).
  const scan = (open: string, close: string): T | null => {
    const start = cleaned.indexOf(open);
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; }
        }
      }
    }
    return null;
  };
  const objStart = cleaned.indexOf("{");
  const arrStart = cleaned.indexOf("[");
  // Prefer whichever appears first — matches the model's intended top-level shape.
  if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
    const obj = scan("{", "}");
    if (obj !== null) return obj;
    return scan("[", "]");
  }
  if (arrStart !== -1) {
    const arr = scan("[", "]");
    if (arr !== null) return arr;
    return scan("{", "}");
  }
  return null;
}
