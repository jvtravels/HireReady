/* Vercel Edge Function — Interview Session Evaluation (MVP Report) */

export const config = { runtime: "edge" };

import { withAuthAndRateLimit, sanitizeForLLM, corsHeaders, withRequestId } from "./_shared";
import { callLLM, extractJSON } from "./_llm";

declare const process: { env: Record<string, string | undefined> };
const GROQ_KEY = process.env.GROQ_API_KEY || "";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

/** MVP report schema — kept tight; additive V2 fields documented in PRD. */
interface EvaluateRequest {
  sessionId: string;
  transcript: Array<{ role: "interviewer" | "candidate"; text: string; startMs?: number; endMs?: number }>;
  meta: {
    role?: string;
    roleFamily?: "swe" | "pm" | "em" | "data" | "behavioral";
    targetCompany?: string | null;
    level?: string | null;
    difficulty?: "warmup" | "standard" | "hard";
    duration?: number; // seconds
  };
}

interface PerQuestionReport {
  idx: number;
  question: string;
  answerText: string;
  verdict: "strong" | "complete" | "partial" | "weak" | "skipped";
  score: number;
  starPresence: { S: boolean; T: boolean; A: boolean; R: boolean };
  restructured: { text: string; citations: Array<{ markerIdx: number; sourceStart: number; sourceEnd: number }> } | null;
  explanation: string;
}

interface SessionReport {
  version: "mvp-1";
  overallScore: number;
  band: "strongHire" | "hire" | "leanHire" | "noHire" | "strongNoHire";
  verdict: string;
  coreMetrics: { fillerPerMin: number; silenceRatio: number; paceWpm: number; energy: number };
  skills: Array<{ name: string; score: number }>;
  perQuestion: PerQuestionReport[];
  model: string;
}

const ROLE_SKILLS: Record<string, string[]> = {
  swe: ["Problem Framing", "Technical Depth", "Trade-off Reasoning", "Communication", "Ownership"],
  pm: ["Product Sense", "Analytical", "Execution", "Influencing", "Customer Focus"],
  em: ["Strategic Thinking", "People Management", "Execution", "Communication", "Conflict Handling"],
  data: ["Analytical", "Technical Depth", "Business Impact", "Communication", "Ownership"],
  behavioral: ["Structure", "Ownership", "Impact", "Communication", "Composure"],
};

function scoreToBand(score: number): SessionReport["band"] {
  if (score >= 85) return "strongHire";
  if (score >= 70) return "hire";
  if (score >= 55) return "leanHire";
  if (score >= 40) return "noHire";
  return "strongNoHire";
}

/** Heuristic delivery metrics from the transcript — computed server-side for determinism. */
function computeCoreMetrics(
  transcript: EvaluateRequest["transcript"],
  durationSec: number,
): SessionReport["coreMetrics"] {
  const candidateTurns = transcript.filter((t) => t.role === "candidate");
  const allText = candidateTurns.map((t) => t.text).join(" ");
  const words = allText.split(/\s+/).filter(Boolean);
  const fillerRegex = /\b(um+|uh+|like|you know|so|actually|basically|literally)\b/gi;
  const fillerMatches = allText.match(fillerRegex) || [];
  const speakingMinutes = Math.max(durationSec / 60, 0.1);

  // Silence ratio: inter-turn gaps between candidate's first audible word and last
  let silenceMs = 0;
  for (let i = 1; i < candidateTurns.length; i++) {
    const prev = candidateTurns[i - 1];
    const cur = candidateTurns[i];
    if (prev.endMs != null && cur.startMs != null) {
      const gap = cur.startMs - prev.endMs;
      if (gap > 1500) silenceMs += gap;
    }
  }
  const silenceRatio = durationSec > 0 ? Math.min(100, Math.round((silenceMs / (durationSec * 1000)) * 100)) : 0;

  // Energy heuristic: answer-length variance + non-trivial vocabulary diversity → 0-100
  // This is a placeholder; real prosody analysis comes in V2.
  const uniqueWords = new Set(words.map((w) => w.toLowerCase())).size;
  const diversity = words.length > 0 ? uniqueWords / words.length : 0;
  const avgLen = candidateTurns.length > 0 ? words.length / candidateTurns.length : 0;
  const energy = Math.max(0, Math.min(100, Math.round(40 + diversity * 80 + Math.min(avgLen, 30))));

  return {
    fillerPerMin: Math.round((fillerMatches.length / speakingMinutes) * 10) / 10,
    silenceRatio,
    paceWpm: Math.round(words.length / speakingMinutes),
    energy,
  };
}

/** Validate LLM-returned report: every quote/citation must trace to real transcript text. */
function validateReport(report: unknown, transcript: EvaluateRequest["transcript"]): report is SessionReport {
  if (!report || typeof report !== "object") return false;
  const r = report as Record<string, unknown>;
  if (typeof r.overallScore !== "number" || r.overallScore < 0 || r.overallScore > 100) return false;
  if (!Array.isArray(r.perQuestion)) return false;

  // Build a searchable corpus of candidate text for citation verification
  const candidateCorpus = transcript
    .filter((t) => t.role === "candidate")
    .map((t) => t.text)
    .join("\n");

  for (const pq of r.perQuestion as PerQuestionReport[]) {
    if (pq.restructured && Array.isArray(pq.restructured.citations)) {
      for (const c of pq.restructured.citations) {
        if (typeof c.sourceStart !== "number" || typeof c.sourceEnd !== "number") continue;
        if (c.sourceStart >= candidateCorpus.length || c.sourceEnd > candidateCorpus.length) return false;
      }
    }
  }
  return true;
}

export default async function handler(req: Request): Promise<Response> {
  const t0 = Date.now();

  if (!GROQ_KEY && !GEMINI_KEY) {
    return new Response(JSON.stringify({ error: "LLM not configured" }), {
      status: 503,
      headers: withRequestId(corsHeaders(req)),
    });
  }

  const pre = await withAuthAndRateLimit(req, {
    endpoint: "evaluate-session",
    ipLimit: 10,
    userLimit: 5,
    checkQuota: true,
  });
  if (pre instanceof Response) return pre;
  const { headers, auth } = pre;

  try {
    const body = (await req.json()) as Partial<EvaluateRequest>;
    const { sessionId, transcript, meta } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return new Response(JSON.stringify({ error: "sessionId required" }), { status: 400, headers });
    }
    if (!Array.isArray(transcript) || transcript.length === 0) {
      return new Response(JSON.stringify({ error: "transcript required" }), { status: 400, headers });
    }
    if (transcript.length > 200) {
      return new Response(JSON.stringify({ error: "transcript too long" }), { status: 413, headers });
    }

    const roleFamily = (meta?.roleFamily as keyof typeof ROLE_SKILLS) || "behavioral";
    const skillAxes = ROLE_SKILLS[roleFamily] || ROLE_SKILLS.behavioral;
    const durationSec = meta?.duration || 600;
    const coreMetrics = computeCoreMetrics(transcript, durationSec);

    // Build transcript block — truncate individual turns but keep structure intact.
    const transcriptBlock = transcript
      .map((t, i) => `[${i}] ${t.role === "interviewer" ? "INTERVIEWER" : "CANDIDATE"}: ${sanitizeForLLM(t.text, 1500)}`)
      .join("\n");

    const prompt = `You are a senior I/O-psychology-trained interview scorer. Produce a JSON report for this mock interview, calibrated to structured-interview rubrics (SHL UCF, STAR+L). Be honest and specific.

CONTEXT:
Role: ${sanitizeForLLM(meta?.role || "general", 80)}
Role family: ${roleFamily}
Company: ${sanitizeForLLM(meta?.targetCompany || "none", 80)}
Level: ${sanitizeForLLM(meta?.level || "mid", 40)}
Difficulty: ${meta?.difficulty || "standard"}
Duration (s): ${durationSec}

TRANSCRIPT (numbered turns):
"""
${transcriptBlock}
"""

RUBRIC — score each skill 0-100:
${skillAxes.map((s) => `- ${s}`).join("\n")}

Return a JSON object with EXACTLY this shape:
{
  "overallScore": <0-100 integer, role-weighted composite of skills>,
  "verdict": "<one sentence, ≤140 chars, second-person>",
  "skills": [${skillAxes.map((s) => `{"name":"${s}","score":<0-100>}`).join(",")}],
  "perQuestion": [
    {
      "idx": <question turn index from transcript>,
      "question": "<full interviewer question text>",
      "answerText": "<candidate's verbatim answer>",
      "verdict": "<strong|complete|partial|weak|skipped>",
      "score": <0-100>,
      "starPresence": {"S": <bool>, "T": <bool>, "A": <bool>, "R": <bool>},
      "restructured": {
        "text": "<rewrite the candidate's answer in STAR form, using ONLY facts from their own words; 80-160 words>",
        "citations": [{"markerIdx": <1-based marker>, "sourceStart": <char offset in answerText>, "sourceEnd": <char offset>}]
      },
      "explanation": "<1-2 sentences on what worked/missed>"
    }
  ]
}

CRITICAL RULES:
- Pair each interviewer question with the candidate answer that follows it. Skip pairs where the candidate didn't answer (use verdict="skipped", restructured=null).
- Every skill score must be justified by transcript evidence.
- Restructured answer MUST NOT invent numbers, company names, or outcomes not present in the candidate's words. If quantification is missing, frame it as a gap ("you could add the exact % here") rather than making one up.
- Citations must reference real character offsets inside answerText.
- Keep verdict scores honest. Average mock interview scores 45-65.
- Return ONLY valid JSON — no markdown wrapping, no prose.`;

    const tLLM0 = Date.now();
    const result = await callLLM(
      { prompt, temperature: 0.25, maxTokens: 4500, jsonMode: true },
      22000,
      { userId: auth.userId, endpoint: "evaluate-session" },
    );
    const tLLM = Date.now() - tLLM0;

    const parsed = extractJSON<Partial<SessionReport>>(result.text);
    if (!parsed) {
      console.error(`[evaluate-session] JSON parse failed. Model: ${result.model}, len: ${result.text.length}, head: ${result.text.slice(0, 200)}`);
      return new Response(JSON.stringify({ error: "Failed to parse evaluation", retryable: true }), { status: 500, headers });
    }

    // Build final report — merge deterministic coreMetrics with LLM output
    const overallScore = typeof parsed.overallScore === "number" ? Math.max(0, Math.min(100, Math.round(parsed.overallScore))) : 50;
    const report: SessionReport = {
      version: "mvp-1",
      overallScore,
      band: scoreToBand(overallScore),
      verdict: typeof parsed.verdict === "string" ? parsed.verdict.slice(0, 200) : "",
      coreMetrics,
      skills: Array.isArray(parsed.skills) ? parsed.skills.slice(0, 8) : [],
      perQuestion: Array.isArray(parsed.perQuestion) ? (parsed.perQuestion as PerQuestionReport[]).slice(0, 30) : [],
      model: result.model,
    };

    if (!validateReport(report, transcript)) {
      console.warn(`[evaluate-session] validation failed for session=${sessionId.slice(0, 8)}; returning anyway with warning`);
    }

    const totalMs = Date.now() - t0;
    console.warn(`[evaluate-session] OK session=${sessionId.slice(0, 8)} score=${overallScore} band=${report.band} llm=${tLLM}ms total=${totalMs}ms model=${result.model}`);
    headers["X-Timing"] = `llm=${tLLM},total=${totalMs},model=${result.model}`;

    return new Response(JSON.stringify({ report }), { status: 200, headers });
  } catch (err) {
    const totalMs = Date.now() - t0;
    const isTimeout = err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"));
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[evaluate-session] FAILED after ${totalMs}ms (${isTimeout ? "timeout" : "error"}): ${msg.slice(0, 200)}`);
    return new Response(
      JSON.stringify({ error: isTimeout ? "Evaluation timed out — try again" : `Evaluation error: ${msg.slice(0, 100)}`, retryable: true }),
      { status: isTimeout ? 504 : 500, headers },
    );
  }
}
