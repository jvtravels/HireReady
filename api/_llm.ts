/* Unified LLM caller with automatic fallback: Groq → Gemini */

declare const process: { env: Record<string, string | undefined> };

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** Fire-and-forget: log LLM usage to Supabase. Never blocks or throws. */
function logUsage(entry: {
  userId?: string; endpoint?: string; model: string; isFallback: boolean;
  promptTokens: number; completionTokens: number; totalTokens: number;
  latencyMs: number; status: "success" | "error" | "timeout"; errorMessage?: string;
}): void {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  fetch(`${SUPABASE_URL}/rest/v1/llm_usage`, {
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
  }).catch(() => {}); // swallow — never block the response
}

interface LLMOptions {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  fast?: boolean; // Use smaller, faster model (8B instead of 70B)
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
  if (!res.ok) {
    const status = res.status;
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq error ${status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const latencyMs = Date.now() - start;
  const usage = data.usage;
  const tokensUsed = usage ? { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens } : undefined;
  if (tokensUsed) {
    console.warn(`[LLM] Groq ${model} — ${tokensUsed.total} tokens, ${latencyMs}ms`);
  }
  return { text: data.choices?.[0]?.message?.content || "", model, fallback: false, tokensUsed, latencyMs };
}

async function callGemini(opts: LLMOptions, signal?: AbortSignal): Promise<LLMResult> {
  if (!GEMINI_API_KEY) throw new Error("Gemini not configured");
  const start = Date.now();
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    signal,
    body: JSON.stringify({
      contents: [{ parts: [{ text: opts.prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.3,
        maxOutputTokens: opts.maxTokens ?? 2000,
        ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini error ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const latencyMs = Date.now() - start;
  const usage = data.usageMetadata;
  const tokensUsed = usage ? { prompt: usage.promptTokenCount, completion: usage.candidatesTokenCount, total: usage.totalTokenCount } : undefined;
  if (tokensUsed) {
    console.warn(`[LLM] Gemini — ${tokensUsed.total} tokens, ${latencyMs}ms`);
  }
  return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || "", model: "gemini-2.0-flash", fallback: true, tokensUsed, latencyMs };
}

/** Call the LLM with automatic Groq -> Gemini fallback. Respects timeout and aborts on expiry. */
export async function callLLM(opts: LLMOptions, timeoutMs = 15000, meta?: { userId?: string; endpoint?: string }): Promise<LLMResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    if (GROQ_API_KEY) {
      try {
        const result = await callGroq(opts, ac.signal);
        clearTimeout(timer);
        logUsage({ userId: meta?.userId, endpoint: meta?.endpoint, model: result.model, isFallback: false, promptTokens: result.tokensUsed?.prompt ?? 0, completionTokens: result.tokensUsed?.completion ?? 0, totalTokens: result.tokensUsed?.total ?? 0, latencyMs: result.latencyMs ?? 0, status: "success" });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        // Auth errors (invalid key) should fail fast — don't waste Gemini credits
        const isAuthError = msg.includes("401") || msg.includes("403");
        if (isAuthError) {
          console.error("[LLM] Groq auth error — check GROQ_API_KEY:", msg.slice(0, 100));
          logUsage({ userId: meta?.userId, endpoint: meta?.endpoint, model: "groq", isFallback: false, promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: 0, status: "error", errorMessage: msg.slice(0, 200) });
          throw err;
        }
        // Rate limit (429) or server error (5xx) — try Gemini fallback
        const isRetryable = msg.includes("429") || msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("AbortError");
        if (isRetryable && GEMINI_API_KEY) {
          console.warn("[LLM] Groq failed, falling back to Gemini:", msg.slice(0, 100));
          logUsage({ userId: meta?.userId, endpoint: meta?.endpoint, model: "groq", isFallback: false, promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: 0, status: msg.includes("AbortError") ? "timeout" : "error", errorMessage: msg.slice(0, 200) });
          clearTimeout(timer);
          const ac2 = new AbortController();
          // Give Gemini fallback less time to avoid compounding waits
          const fallbackTimeout = Math.min(timeoutMs, 12000);
          const timer2 = setTimeout(() => ac2.abort(), fallbackTimeout);
          try {
            const result = await callGemini(opts, ac2.signal);
            clearTimeout(timer2);
            logUsage({ userId: meta?.userId, endpoint: meta?.endpoint, model: result.model, isFallback: true, promptTokens: result.tokensUsed?.prompt ?? 0, completionTokens: result.tokensUsed?.completion ?? 0, totalTokens: result.tokensUsed?.total ?? 0, latencyMs: result.latencyMs ?? 0, status: "success" });
            return result;
          } catch (geminiErr) {
            clearTimeout(timer2);
            const gemMsg = geminiErr instanceof Error ? geminiErr.message : "";
            logUsage({ userId: meta?.userId, endpoint: meta?.endpoint, model: "gemini-2.0-flash", isFallback: true, promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: 0, status: gemMsg.includes("AbortError") ? "timeout" : "error", errorMessage: gemMsg.slice(0, 200) });
            throw geminiErr;
          }
        }
        logUsage({ userId: meta?.userId, endpoint: meta?.endpoint, model: "groq", isFallback: false, promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: 0, status: msg.includes("AbortError") ? "timeout" : "error", errorMessage: msg.slice(0, 200) });
        throw err;
      }
    } else if (GEMINI_API_KEY) {
      const result = await callGemini(opts, ac.signal);
      clearTimeout(timer);
      logUsage({ userId: meta?.userId, endpoint: meta?.endpoint, model: result.model, isFallback: false, promptTokens: result.tokensUsed?.prompt ?? 0, completionTokens: result.tokensUsed?.completion ?? 0, totalTokens: result.tokensUsed?.total ?? 0, latencyMs: result.latencyMs ?? 0, status: "success" });
      return result;
    } else {
      clearTimeout(timer);
      throw new Error("No LLM configured");
    }
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/** Extract JSON from LLM response text. Handles markdown fences, prose wrapping, and malformed output. */
export function extractJSON<T = unknown>(text: string): T | null {
  // Try direct parse first
  try { return JSON.parse(text); } catch { /* fallback: try cleaned formats below */ }
  // Strip markdown code fences
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fallback: try regex extraction below */ }
  // Try extracting JSON array first (less ambiguous than objects)
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch { /* fallback: try object extraction below */ }
  }
  // Extract JSON object — find matching braces instead of greedy regex
  const objStart = cleaned.indexOf("{");
  if (objStart !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = objStart; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(cleaned.slice(objStart, i + 1)); } catch { /* malformed JSON object, return null */ }
          break;
        }
      }
    }
  }
  return null;
}
