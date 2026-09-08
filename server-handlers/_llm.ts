/* Unified LLM caller — Gemini primary for big-model calls, Groq for fast (8b) calls */

import { captureServerEvent } from "./_posthog";

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
/** Map a model id OR a bare provider name to the provider label. Success rows
 *  carry the real model id ("llama-3.3-70b-specdec", "gemini-2.5-flash",
 *  "cerebras-llama-3.3-70b"); error rows carry the provider name directly. */
function providerFromModel(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("cerebras")) return "cerebras";
  if (m.includes("gemini")) return "gemini";
  if (m.includes("groq") || m.includes("llama")) return "groq";
  return m;
}

/**
 * Emit PostHog's native `$ai_generation` event so the LLM analytics dashboard
 * (per-model cost, latency, error rate, fallback share) is populated. Mirrors
 * the same data written to `llm_usage` but on PostHog's standard schema. Fires
 * regardless of whether Supabase usage-logging is configured. Awaited by
 * logUsage (which callers await) so the edge isolate stays alive until the
 * event ships — same fire-and-forget hazard documented on logUsage.
 */
async function emitAiGeneration(entry: {
  userId?: string; endpoint?: string; model: string; isFallback: boolean;
  promptTokens: number; completionTokens: number; totalTokens: number;
  latencyMs: number; status: "success" | "error" | "timeout"; errorMessage?: string;
  sessionId?: string;
}): Promise<void> {
  const distinctId = entry.userId || "anonymous";
  await captureServerEvent("$ai_generation", distinctId, {
    $ai_trace_id: entry.sessionId || distinctId,
    $ai_model: entry.model,
    $ai_provider: providerFromModel(entry.model),
    $ai_input_tokens: entry.promptTokens,
    $ai_output_tokens: entry.completionTokens,
    $ai_total_tokens: entry.totalTokens,
    $ai_latency: entry.latencyMs / 1000,
    $ai_is_error: entry.status !== "success",
    $ai_span_name: entry.endpoint || "unknown",
    is_fallback: entry.isFallback,
    status: entry.status,
    error_message: entry.errorMessage?.slice(0, 200) || null,
  });
}

async function logUsage(entry: {
  userId?: string; endpoint?: string; model: string; isFallback: boolean;
  promptTokens: number; completionTokens: number; totalTokens: number;
  latencyMs: number; status: "success" | "error" | "timeout"; errorMessage?: string;
  sessionId?: string;
}): Promise<void> {
  await emitAiGeneration(entry);
  if (!USAGE_LOGGING_ENABLED) return;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/llm_usage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: "return=minimal",
      },
      signal: ac.signal,
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
        session_id: entry.sessionId || null,
      }),
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[logUsage] HTTP ${res.status} writing llm_usage: ${body.slice(0, 200)}`);
    }
  } catch (err) {
    console.error(`[logUsage] fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/* LLM error classification (pure, exported for unit testing).
 *
 * A 429 normally means a per-second rate limit that recovers within ~1s, so a
 * single short-backoff retry before failover is worth it. But a 429 carrying
 * "exceeded your current quota" / "plan and billing" / "RESOURCE_EXHAUSTED" is
 * a hard daily-cap or billing block that will NOT recover in 800ms — retrying
 * it only adds latency before the inevitable failover. Observed live: Gemini
 * quota-exhausted 429s sat in the retry path on every static-fallback request.
 * Treat quota exhaustion as permanent so the chain fails over immediately. */
export function isQuotaExhausted(msg: string): boolean {
  return /current quota|plan and billing|billing details|resource_exhausted|quota.?exceeded|exceeded.*quota/i.test(msg);
}

/** Transient = worth one short-backoff retry on the SAME provider before
 *  failover. Quota exhaustion is explicitly excluded (it's permanent). */
export function isTransientLLMError(msg: string): boolean {
  if (isQuotaExhausted(msg)) return false;
  return /\b(429|500|502|503|504)\b/.test(msg) || /overload|rate.?limit|temporar/i.test(msg);
}

interface LLMOptions {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  // Output budget for the FALLBACK providers (Gemini/Cerebras) only. Groq is
  // primary and bounded by a tight free-tier TPM ceiling that counts
  // (prompt + max_tokens), so its budget must stay small. The fallbacks have
  // ~10× higher TPM, and at least one (gemini-2.5-flash) is materially more
  // verbose on the same JSON schema — at the Groq-sized cap it truncates large
  // reports (e.g. the HR-round report) mid-object, yielding an empty/degenerate
  // result. Give the fallbacks more room so a Groq outage still produces a
  // complete report. Defaults to maxTokens when unset.
  fallbackMaxTokens?: number;
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
  const model = opts.fast ? "llama-3.1-8b-instant" : "llama-3.3-70b-specdec";
  const start = Date.now();
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
  return { text: data.choices?.[0]?.message?.content || "", model, fallback: false, tokensUsed, latencyMs };
}

async function callGemini(opts: LLMOptions, signal?: AbortSignal): Promise<LLMResult> {
  if (!GEMINI_API_KEY) throw new Error("Gemini not configured");
  // Switched from gemini-2.5-flash-lite (free tier 20 RPM) to gemini-2.5-flash
  // because the -lite model was returning 429 RESOURCE_EXHAUSTED during
  // fallover bursts. 2.5-flash has lower RPM (10) but ~10× higher TPM, which
  // matters more for our prompts — eval prompts are large but the call rate
  // on the fallback path is naturally low.
  const model = "gemini-2.5-flash";
  const start = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    signal,
    body: JSON.stringify({
      contents: [{ parts: [{ text: opts.prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.3,
        maxOutputTokens: opts.fallbackMaxTokens ?? opts.maxTokens ?? 2000,
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
  return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || "", model, fallback: false, tokensUsed, latencyMs };
}

async function callCerebras(opts: LLMOptions, signal?: AbortSignal): Promise<LLMResult> {
  // Cerebras' free tier serves llama-3.3-70b at ~2200 tok/s — drop-in OpenAI-compatible.
  // Used as a third fallback so a Groq+Gemini outage doesn't kill the interview.
  const model = opts.fast ? "llama3.1-8b" : "llama-3.3-70b";
  const start = Date.now();
  const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CEREBRAS_API_KEY}` },
    signal,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: opts.prompt }],
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.fallbackMaxTokens ?? opts.maxTokens ?? 2000,
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
  return { text: data.choices?.[0]?.message?.content || "", model: `cerebras-${model}`, fallback: false, tokensUsed, latencyMs };
}

export async function callLLM(opts: LLMOptions, timeoutMs = 15000, meta?: { userId?: string; endpoint?: string; groqTimeoutMs?: number; sessionId?: string }): Promise<LLMResult> {
  const providers: { name: string; call: (s: AbortSignal) => Promise<LLMResult> }[] = [];
  // Fast calls (opts.fast=true) use Groq llama-3.1-8b-instant — fast, free, not deprecated.
  // Slow/big-model calls use Gemini 2.5 Flash first: free tier (250 req/day = ~125 sessions),
  // negligible cost if exceeded (~₹29/month at 270 sessions). Groq 70b stays as fallback
  // until it is decommissioned on 2026-08-16, then Cerebras picks up.
  if (opts.fast) {
    if (GROQ_API_KEY) providers.push({ name: "groq", call: (s) => callGroq(opts, s) });
    if (GEMINI_API_KEY) providers.push({ name: "gemini", call: (s) => callGemini(opts, s) });
  } else {
    if (GEMINI_API_KEY) providers.push({ name: "gemini", call: (s) => callGemini(opts, s) });
    if (GROQ_API_KEY) providers.push({ name: "groq", call: (s) => callGroq(opts, s) });
  }
  if (CEREBRAS_API_KEY) providers.push({ name: "cerebras", call: (s) => callCerebras(opts, s) });

  if (providers.length === 0) throw new Error("No LLM configured — set GROQ_API_KEY, GEMINI_API_KEY, or CEREBRAS_API_KEY");

  // Per-provider timeout: cap Groq at 10s so a real incident fails over
  // fast, but don't kneecap normal large-output calls (a 1400-token JSON
  // response on llama-3.3-70b regularly takes 6-9s — the previous 6s cap
  // was sized for short responses and killed legitimate calls, sending
  // them to Gemini where Google-side "high demand" 503s would surface to
  // the user). Fast 8B-instant calls finish well under 10s.
  // Per-call Groq cap override — evaluate-session's full-transcript
  // prompts regularly take 6-9s; the global 10s cap kicks Groq out under
  // p95 spike and the user pays the Gemini fallback latency. Callers can
  // raise via meta.groqTimeoutMs (still bounded by timeoutMs).
  const groqCap = Math.min(timeoutMs, meta?.groqTimeoutMs ?? 10000);
  const providerTimeout = (name: string) => {
    if (name === "groq") return groqCap;
    return timeoutMs;
  };

  // Retry classification lives in module-scope isTransientLLMError (above):
  // transient → one short-backoff retry on the same provider; quota exhaustion
  // and other hard errors → fail over to the next provider immediately.
  const isTransient = isTransientLLMError;

  const callOnce = async (provider: { name: string; call: (s: AbortSignal) => Promise<LLMResult> }): Promise<LLMResult> => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), providerTimeout(provider.name));
    try {
      const result = await provider.call(ac.signal);
      clearTimeout(timer);
      return result;
    } finally {
      clearTimeout(timer);
    }
  };

  const tryProvider = async (provider: { name: string; call: (s: AbortSignal) => Promise<LLMResult> }, isFallback: boolean): Promise<LLMResult> => {
    let attempt = 0;
    // up to 2 attempts per provider (1 initial + 1 retry on transient)
    while (true) {
      attempt++;
      try {
        const result = await callOnce(provider);
        await logUsage({ userId: meta?.userId, endpoint: meta?.endpoint, model: result.model, isFallback, promptTokens: result.tokensUsed?.prompt ?? 0, completionTokens: result.tokensUsed?.completion ?? 0, totalTokens: result.tokensUsed?.total ?? 0, latencyMs: result.latencyMs ?? 0, status: "success", sessionId: meta?.sessionId });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        const errName = err instanceof Error ? err.name : "";
        const isTimeout = errName === "AbortError" || msg.includes("aborted") || msg.includes("abort");
        const transient = isTransient(msg);
        if (attempt < 2 && transient && !isTimeout) {
          console.warn(`[LLM] ${provider.name} transient error (${msg.slice(0, 80)}) — retrying after 800ms`);
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        console.error(`[LLM] ${provider.name} failed (${isTimeout ? "timeout" : "error"}): ${msg.slice(0, 150)}`);
        await logUsage({ userId: meta?.userId, endpoint: meta?.endpoint, model: provider.name, isFallback, promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: 0, status: isTimeout ? "timeout" : "error", errorMessage: msg.slice(0, 200), sessionId: meta?.sessionId });
        throw err;
      }
    }
  };

  // Walk providers in order (fast: groq→gemini, slow: gemini→groq→cerebras). First success wins.
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
