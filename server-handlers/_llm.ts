/* Unified LLM caller — races Gemini + Groq in parallel, fastest wins */

declare const process: { env: Record<string, string | undefined> };

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

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
  }).catch(() => {});
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

export async function callLLM(opts: LLMOptions, timeoutMs = 15000, meta?: { userId?: string; endpoint?: string }): Promise<LLMResult> {
  const providers: Array<{ name: string; call: (signal: AbortSignal) => Promise<LLMResult> }> = [];

  if (GEMINI_API_KEY) providers.push({ name: "gemini", call: (s) => callGemini(opts, s) });
  if (GROQ_API_KEY) providers.push({ name: "groq", call: (s) => callGroq(opts, s) });

  if (providers.length === 0) throw new Error("No LLM configured — set GEMINI_API_KEY or GROQ_API_KEY");

  console.log(`[LLM] Starting with ${providers.map(p => p.name).join(" + ")} (timeout: ${timeoutMs}ms)`);

  // Single provider
  if (providers.length === 1) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const result = await providers[0].call(ac.signal);
      clearTimeout(timer);
      logUsage({ userId: meta?.userId, endpoint: meta?.endpoint, model: result.model, isFallback: false, promptTokens: result.tokensUsed?.prompt ?? 0, completionTokens: result.tokensUsed?.completion ?? 0, totalTokens: result.tokensUsed?.total ?? 0, latencyMs: result.latencyMs ?? 0, status: "success" });
      return result;
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : "";
      const isTimeout = msg.includes("AbortError") || msg.includes("abort");
      console.error(`[LLM] ${providers[0].name} failed (${isTimeout ? "timeout" : "error"}): ${msg.slice(0, 150)}`);
      logUsage({ userId: meta?.userId, endpoint: meta?.endpoint, model: providers[0].name, isFallback: false, promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: 0, status: isTimeout ? "timeout" : "error", errorMessage: msg.slice(0, 200) });
      throw err;
    }
  }

  // Two providers — race in parallel
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const controllers = providers.map(() => new AbortController());
  ac.signal.addEventListener("abort", () => controllers.forEach(c => c.abort()));

  const raceResult = await new Promise<LLMResult>((resolve, reject) => {
    let settled = false;
    let errorCount = 0;
    let lastError: Error | undefined;

    providers.forEach((provider, i) => {
      provider.call(controllers[i].signal)
        .then(result => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          controllers.forEach((c, j) => { if (j !== i) c.abort(); });
          console.log(`[LLM] Winner: ${provider.name} (${result.latencyMs}ms)`);
          logUsage({ userId: meta?.userId, endpoint: meta?.endpoint, model: result.model, isFallback: i > 0, promptTokens: result.tokensUsed?.prompt ?? 0, completionTokens: result.tokensUsed?.completion ?? 0, totalTokens: result.tokensUsed?.total ?? 0, latencyMs: result.latencyMs ?? 0, status: "success" });
          resolve(result);
        })
        .catch(err => {
          const msg = err instanceof Error ? err.message : "";
          const isAbortedLoser = settled && (msg.includes("AbortError") || msg.includes("abort"));
          if (!isAbortedLoser) {
            const isTimeout = msg.includes("AbortError") || msg.includes("abort");
            console.error(`[LLM] ${provider.name} failed (${isTimeout ? "timeout" : "error"}): ${msg.slice(0, 150)}`);
            logUsage({ userId: meta?.userId, endpoint: meta?.endpoint, model: provider.name, isFallback: i > 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: 0, status: isTimeout ? "timeout" : "error", errorMessage: msg.slice(0, 200) });
          }
          errorCount++;
          lastError = err instanceof Error ? err : new Error(msg);
          if (errorCount === providers.length && !settled) {
            settled = true;
            clearTimeout(timer);
            reject(lastError);
          }
        });
    });
  });

  return raceResult;
}

export function extractJSON<T = unknown>(text: string): T | null {
  try { return JSON.parse(text); } catch { /* fallback */ }
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fallback */ }
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch { /* fallback */ }
  }
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
          try { return JSON.parse(cleaned.slice(objStart, i + 1)); } catch { /* malformed */ }
          break;
        }
      }
    }
  }
  return null;
}
