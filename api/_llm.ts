/* Unified LLM caller with automatic fallback: Groq → Gemini */

declare const process: { env: Record<string, string | undefined> };

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

interface LLMOptions {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

interface LLMResult {
  text: string;
  model: string;
  fallback: boolean;
}

async function callGroq(opts: LLMOptions, signal?: AbortSignal): Promise<LLMResult> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
    signal,
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
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
  return { text: data.choices?.[0]?.message?.content || "", model: "llama-3.3-70b-versatile", fallback: false };
}

async function callGemini(opts: LLMOptions, signal?: AbortSignal): Promise<LLMResult> {
  if (!GEMINI_API_KEY) throw new Error("Gemini not configured");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || "", model: "gemini-2.0-flash", fallback: true };
}

export async function callLLM(opts: LLMOptions, timeoutMs = 15000): Promise<LLMResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    if (GROQ_API_KEY) {
      try {
        const result = await callGroq(opts, ac.signal);
        clearTimeout(timer);
        return result;
      } catch (err) {
        // If Groq fails with rate limit (429) or server error (5xx), try Gemini
        const msg = err instanceof Error ? err.message : "";
        const isRetryable = msg.includes("429") || msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("AbortError");
        if (isRetryable && GEMINI_API_KEY) {
          console.warn("[LLM] Groq failed, falling back to Gemini:", msg.slice(0, 100));
          clearTimeout(timer);
          const ac2 = new AbortController();
          const timer2 = setTimeout(() => ac2.abort(), timeoutMs);
          try {
            const result = await callGemini(opts, ac2.signal);
            clearTimeout(timer2);
            return result;
          } catch (geminiErr) {
            clearTimeout(timer2);
            throw geminiErr;
          }
        }
        throw err;
      }
    } else if (GEMINI_API_KEY) {
      const result = await callGemini(opts, ac.signal);
      clearTimeout(timer);
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

export function extractJSON(text: string): any {
  // Try direct parse first
  try { return JSON.parse(text); } catch {}
  // Strip markdown code fences
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  // Try extracting JSON array first (less ambiguous than objects)
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch {}
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
          try { return JSON.parse(cleaned.slice(objStart, i + 1)); } catch {}
          break;
        }
      }
    }
  }
  return null;
}
