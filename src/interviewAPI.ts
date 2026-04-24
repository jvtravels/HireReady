/* ─── Interview API Client: LLM calls, session persistence, offline retry ─── */

import type { InterviewStep } from "./interviewScripts";
import { decrementSessionCredit } from "./supabase";
import { apiFetch } from "./apiClient";
import { openIDB, loadFromIDB, deleteFromIDB } from "./interviewIDB";
import { checkRateLimit } from "./rateLimit";

const RESULTS_KEY = "hirestepx_sessions";
const IDB_STORE = "drafts";

/** Retry a function with exponential backoff. Returns null after all retries fail. */
async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 2, baseDelayMs = 1000, shouldRetry = (_err: unknown) => true }: {
    retries?: number; baseDelayMs?: number; shouldRetry?: (err: unknown) => boolean;
  } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === retries || !shouldRetry(err)) throw err;
      // Exponential backoff: 1s, 2s, 4s...
      const delay = baseDelayMs * Math.pow(2, i) + Math.random() * 500;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export interface SessionResult {
  id: string;
  date: string;
  type: string;
  difficulty: string;
  focus: string;
  duration: number;
  score: number;
  questions: number;
  transcript?: { speaker: string; text: string; time: string }[];
  ai_feedback?: string;
  skill_scores?: Record<string, number> | null;
  ideal_answers?: { question: string; ideal: string; candidateSummary: string; rating?: string; starBreakdown?: Record<string, string>; workedWell?: string; toImprove?: string }[];
  starAnalysis?: { overall: number; breakdown: Record<string, number>; tip: string };
  strengths?: string[];
  improvements?: string[];
  nextSteps?: string[];
  resumeUsed?: boolean;
  jobDescription?: string;
  jdAnalysis?: {
    matchScore: number;
    matchLabel: string;
    matchedSkills: string[];
    missingSkills: string[];
    interviewTips: string[];
    suggestedFocus: string;
  } | null;
}

export interface EvaluationResult {
  overallScore: number;
  skillScores: Record<string, number>;
  strengths: string[];
  improvements: string[];
  feedback: string;
  idealAnswers?: { question: string; ideal: string; candidateSummary: string; rating?: string; starBreakdown?: Record<string, string>; workedWell?: string; toImprove?: string }[];
  starAnalysis?: { overall: number; breakdown: Record<string, number>; tip: string };
  nextSteps?: string[];
}

/** Save session to localStorage + Supabase with fallback */
export async function saveSessionResult(result: SessionResult, userId?: string): Promise<{ localOk: boolean; cloudOk: boolean }> {
  let localOk = false;
  let cloudOk = false;
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    let sessions: SessionResult[];
    try {
      sessions = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(sessions)) sessions = [];
    } catch {
      console.warn("[save] localStorage data corrupted, starting fresh");
      sessions = [];
    }
    sessions.unshift(result);
    // Prune to most recent 50 sessions to prevent localStorage overflow
    if (sessions.length > 50) sessions.length = 50;
    try {
      localStorage.setItem(RESULTS_KEY, JSON.stringify(sessions));
    } catch (quotaErr) {
      // Quota exceeded — aggressively prune to 10 and retry
      console.warn("[save] localStorage quota hit, pruning to 10 sessions");
      sessions.length = Math.min(sessions.length, 10);
      try {
        localStorage.setItem(RESULTS_KEY, JSON.stringify(sessions));
      } catch {
        // Still failing — clear old sessions and save only current
        console.warn("[save] localStorage still full, saving only current session");
        try { localStorage.setItem(RESULTS_KEY, JSON.stringify([sessions[0]])); } catch { /* give up on localStorage */ }
      }
    }
    localOk = true;
  } catch (e) {
    console.error("[save] localStorage save failed:", e);
  }
  if (userId) {
    try {
      // Route through our own edge endpoint via XHR (apiFetch) rather than
      // supabase-js directly. supabase-js uses window.fetch, which extension-
      // based fetch wrappers (Loom, Jam.dev, Hotjar) hang on POST bodies
      // above ~64 KB — transcripts + jd_analysis routinely exceed that, so
      // users reported "session completed but dashboard shows nothing."
      // The /api/sessions/save handler also atomically appends to
      // practice_timestamps, so the dashboard's session counter updates in
      // the same round-trip.
      const res = await apiFetch<{ ok: boolean; practiceAppended?: boolean; strippedColumns?: string[] }>("/api/sessions/save", {
        id: result.id,
        date: result.date,
        type: result.type,
        difficulty: result.difficulty,
        focus: result.focus,
        duration: result.duration,
        score: result.score,
        questions: result.questions,
        transcript: result.transcript || [],
        ai_feedback: result.ai_feedback || "",
        skill_scores: result.skill_scores || null,
        job_description: result.jobDescription || null,
        jd_analysis: result.jdAnalysis || null,
      });
      if (res.ok && res.data?.ok) {
        cloudOk = true;
        if (res.data.strippedColumns && res.data.strippedColumns.length > 0) {
          console.warn("[save] server stripped columns:", res.data.strippedColumns);
        }
      } else {
        console.warn(`[save] /api/sessions/save failed (${res.status}): ${res.error || "unknown"}`);
      }
      // Decrement session credit for free-tier users who purchased credits
      try { await decrementSessionCredit(userId); } catch { /* best-effort */ }
    } catch (err) {
      console.warn("Failed to save session to Supabase:", err);
    }
  } else {
    cloudOk = true;
  }
  return { localOk, cloudOk };
}

/**
 * Analyze recent sessions to identify weak skills and past question topics.
 * Used for spaced repetition / adaptive question selection.
 */
export function getAdaptiveHints(sessions: { skill_scores?: Record<string, unknown> | null; questions?: number; type?: string; date?: string }[], jdMissingSkills?: string[]): {
  weakSkills: string[];
  pastTopics: string[];
  suggestedFocus?: string;
} {
  if (!sessions || sessions.length === 0) return { weakSkills: [], pastTopics: [] };

  // Extract all skill scores from recent sessions (most recent first)
  const skillAgg: Record<string, { scores: number[]; lastSeen: number }> = {};
  const topicSet = new Set<string>();

  sessions.slice(0, 20).forEach((s, idx) => {
    if (s.type) topicSet.add(s.type);
    if (!s.skill_scores || typeof s.skill_scores !== "object") return;
    for (const [name, raw] of Object.entries(s.skill_scores)) {
      const score = typeof raw === "number" ? raw : typeof raw === "object" && raw !== null && "score" in raw ? (raw as { score: number }).score : 0;
      if (!skillAgg[name]) skillAgg[name] = { scores: [], lastSeen: idx };
      skillAgg[name].scores.push(score);
      if (idx < skillAgg[name].lastSeen) skillAgg[name].lastSeen = idx;
    }
  });

  // Find weak skills: low average score OR haven't been tested recently
  const weakSkills: { name: string; priority: number }[] = [];
  for (const [name, { scores, lastSeen }] of Object.entries(skillAgg)) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    // Priority = low score + recency penalty (skills not tested recently get boosted)
    const recencyBoost = Math.min(lastSeen * 5, 30); // up to 30 points for stale skills
    const priority = (100 - avg) + recencyBoost;
    if (avg < 70 || lastSeen > 5) {
      weakSkills.push({ name, priority });
    }
  }

  weakSkills.sort((a, b) => b.priority - a.priority);

  // Merge JD missing skills into weak skills so adaptive questions target JD-specific gaps
  const weakSkillNames = weakSkills.slice(0, 5).map(s => s.name);
  if (jdMissingSkills && jdMissingSkills.length > 0) {
    for (const skill of jdMissingSkills) {
      if (!weakSkillNames.includes(skill)) {
        weakSkillNames.push(skill);
      }
    }
  }

  const suggestedFocus = weakSkills.length > 0 ? weakSkills[0].name : (jdMissingSkills?.[0] ?? undefined);

  return {
    weakSkills: weakSkillNames,
    pastTopics: Array.from(topicSet).slice(0, 10),
    suggestedFocus,
  };
}

/** Negotiation band returned by generate-questions API */
export interface NegotiationBandData {
  initialOffer: number;
  minOffer: number;
  maxStretch: number;
  walkAway: number;
  joiningBonusRange: [number, number];
  hasEquity: boolean;
  equityRange: [number, number];
  bandContext: string;
}

/** Result from fetchLLMQuestions — includes questions + optional negotiation band */
export interface LLMQuestionsResult {
  questions: InterviewStep[];
  negotiationBand?: NegotiationBandData;
}

/** Fetch LLM-generated interview questions */
export async function fetchLLMQuestions(params: {
  type: string; focus?: string; difficulty: string; role: string;
  company?: string; currentCity?: string; jobCity?: string; industry?: string; resumeText?: string;
  pastTopics?: string[]; weakSkills?: string[]; jobDescription?: string;
  experienceLevel?: string; mini?: boolean;
  resumeStrengths?: string[]; resumeGaps?: string[]; resumeTopSkills?: string[];
  candidateName?: string;
  negotiationStyle?: string;
}): Promise<LLMQuestionsResult | null> {
  // Client-side rate limit: max 3 question generations per 60s
  if (!checkRateLimit("generate-questions", 3, 60_000)) {
    throw new Error("Too many requests. Please wait a moment and try again.");
  }
  const attempt = async (): Promise<LLMQuestionsResult | null> => {
    const { authHeaders: getAuthHeaders } = await import("./supabase");
    const headers = await getAuthHeaders();
    const res = await fetch("/api/generate-questions", {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.retryAfter ? `Too many requests. Please wait ${data.retryAfter} seconds and try again.` : "Too many requests. Please wait a moment and try again.");
    }
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      const reason = res.status === 401 ? "auth" : res.status === 403 ? "limit" : res.status === 503 ? "not-configured" : `error-${res.status}`;
      console.warn(`[questions] generate-questions failed: ${res.status} (${reason})`, errBody.slice(0, 300));
      // Throw with reason so caller can show specific message instead of generic fallback
      throw new Error(`Question generation failed: ${reason === "auth" ? "not logged in" : reason === "limit" ? "session limit reached" : reason === "not-configured" ? "AI not configured on server" : `server error ${res.status}`}`);
    }
    const data = await res.json();
    if (!data.questions || !Array.isArray(data.questions)) {
      console.warn("[questions] generate-questions returned invalid data:", JSON.stringify(data).slice(0, 300));
      return null;
    }
    const questions = data.questions
      .map((q: { type?: string; aiText?: string; text?: string; scoreNote?: string; persona?: string }) => {
        const text = q.aiText || q.text || "";
        // Compute speakingDuration from word count (~150 WPM for TTS, 1.5s padding)
        const wordCount = text.split(/\s+/).length;
        const estimatedMs = Math.max(3000, Math.round((wordCount / 150) * 60 * 1000) + 1500);
        return {
          type: (q.type || "question") as InterviewStep["type"],
          aiText: text,
          thinkingDuration: q.type === "intro" ? 500 : 600,
          speakingDuration: estimatedMs,
          waitForUser: q.type !== "closing",
          scoreNote: q.scoreNote || "",
          ...(q.persona ? { persona: q.persona } : {}),
        };
      })
      .filter((q: InterviewStep) => q.aiText.length >= 10)
      .map((q: InterviewStep) => q.type === "closing" ? { ...q, waitForUser: true } : q);
    return { questions, negotiationBand: data.negotiationBand || undefined };
  };
  for (let i = 0; i < 3; i++) {
    try {
      return await attempt();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[questions] attempt ${i + 1}/3 failed:`, msg);
      // Propagate actionable errors (auth, limit, rate limit) so user sees specific message
      if (err instanceof Error && (msg.includes("Too many requests") || msg.includes("Question generation failed"))) throw err;
      // Only retry network errors (TypeError) and server errors, not client errors
      const isRetryable = err instanceof TypeError || (err instanceof Error && msg.includes("500"));
      if (i === 2 || !isRetryable) throw new Error(msg || "Could not generate questions");
      // Exponential backoff: 1.5s, 3s
      await new Promise(r => setTimeout(r, 1500 * Math.pow(2, i)));
    }
  }
  return null;
}

/** Evaluate interview answers with LLM */
export async function fetchLLMEvaluation(params: {
  transcript: { speaker: string; text: string }[];
  type: string; difficulty: string; role: string; company?: string;
  questions?: string[];
  resumeText?: string;
  jobDescription?: string;
  previousScores?: { overall: number; skills: Record<string, number> } | null;
  negotiationContext?: {
    initialOffer?: number;
    maxStretch?: number;
    candidateTarget?: number;
    highestOfferMade?: number;
    negotiationStyle?: string;
  };
}, timeoutMs = 14000): Promise<EvaluationResult | null> {
  // Client-side rate limit: max 5 evaluations per 60s
  if (!checkRateLimit("evaluate", 5, 60_000)) {
    throw new Error("Too many requests. Please wait a moment and try again.");
  }
  try {
    return await withRetry(async () => {
      const { authHeaders: getAuthHeaders } = await import("./supabase");
      const headers = await getAuthHeaders();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers,
        body: JSON.stringify(params),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.retryAfter ? `Too many requests. Please wait ${data.retryAfter} seconds and try again.` : "Too many requests. Please wait a moment and try again.");
      }
      if (res.status >= 500) throw new Error(`Evaluation server error: ${res.status}`);
      if (!res.ok) return null;
      const body = await res.json();
      if (!body || typeof body.overallScore !== "number" || typeof body.feedback !== "string") return null;
      return body;
    }, {
      // Zero retries here: the rich per-question evaluation runs via
      // /api/evaluate-session when the user opens the report, so this
      // quick eval is best-effort. Retrying would chain timeouts and
      // trap the user on "Analyzing…" for 30-40s. Fallback scores are
      // honest — let them land on the report fast.
      retries: 0,
      baseDelayMs: 0,
      shouldRetry: () => false,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Evaluation timed out. Using estimated score.");
    }
    throw err;
  }
}

/** Fetch a dynamic follow-up question based on the candidate's answer */
export async function fetchFollowUp(params: {
  question: string; answer: string; type: string; role: string;
  jobDescription?: string; company?: string;
  currentCity?: string; jobCity?: string;
  followUpDepth?: number;
  negotiationPhase?: string; questionIndex?: number; totalQuestions?: number;
  previousFollowUps?: string[];
  persona?: string;
  conversationHistory?: string;
  resumeTopSkills?: string[];
  initialOfferText?: string;
  negotiationFacts?: {
    acceptedImmediately: boolean;
    rejectedOutright: boolean;
    candidateCounter: string | null;
    candidateCurrentCTC: string | null;
    hasCompetingOffers: boolean;
    topicsRaised: string[];
    deflectedNumbers: boolean;
    askedForTime: boolean;
    usedTacticalSilence: boolean;
    mentionedBATNA: boolean;
    expressedSurprise: boolean;
  };
  negotiationStyle?: string;
  negotiationBand?: NegotiationBandData;
  industry?: string;
  highestOfferMade?: number;
  candidateTarget?: number;
  negotiationScenario?: string;
}): Promise<{ needsFollowUp: boolean; followUpText: string; followUpType?: string } | null> {
  // Client-side rate limit: max 10 follow-ups per 60s
  if (!checkRateLimit("follow-up", 10, 60_000)) return null;
  try {
    return await withRetry(async () => {
      const { authHeaders: getAuthHeaders } = await import("./supabase");
      const headers = await getAuthHeaders();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 14_000);
      const res = await fetch("/api/follow-up", {
        method: "POST",
        headers,
        body: JSON.stringify(params),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
        return null as unknown as { needsFollowUp: boolean; followUpText: string; followUpType?: string };
      }
      return await res.json();
    }, {
      retries: 2,
      baseDelayMs: 1000,
      shouldRetry: (err) => err instanceof TypeError || (err instanceof Error && err.message.startsWith("Server error")),
    });
  } catch {
    return null;
  }
}

/** Retry queued offline evaluations */
export async function retryQueuedEvals(): Promise<void> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const req = store.getAllKeys();
    req.onsuccess = async () => {
      const keys = (req.result as string[]).filter(k => typeof k === "string" && k.startsWith("hirestepx_eval_retry_"));
      db.close();
      for (const key of keys) {
        try {
          const data = await loadFromIDB(key) as Record<string, unknown> | null;
          if (!data || Date.now() - (data.queuedAt as number) > 24 * 60 * 60 * 1000) {
            await deleteFromIDB(key);
            continue;
          }
          const result = await fetchLLMEvaluation({
            transcript: data.transcript as { speaker: string; text: string }[],
            type: data.type as string,
            difficulty: data.difficulty as string,
            role: data.role as string,
            company: data.company as string | undefined,
            questions: data.questions as string[] | undefined,
            resumeText: data.resumeText as string | undefined,
          });
          if (result) {
            try {
              const raw = localStorage.getItem(RESULTS_KEY);
              const sessions: SessionResult[] = raw ? JSON.parse(raw) : [];
              const idx = sessions.findIndex(s => s.id === data.sessionId);
              if (idx >= 0) {
                sessions[idx].score = Math.min(100, Math.max(0, result.overallScore));
                sessions[idx].ai_feedback = result.feedback;
                sessions[idx].skill_scores = result.skillScores && typeof result.skillScores === "object"
                  ? Object.fromEntries(Object.entries(result.skillScores).map(([k, v]) => [k, typeof v === "object" && v !== null && "score" in (v as Record<string, unknown>) ? (v as Record<string, unknown>).score as number : v]))
                  : result.skillScores;
                localStorage.setItem(RESULTS_KEY, JSON.stringify(sessions));
              }
            } catch { /* expected: localStorage update may fail */ }
            await deleteFromIDB(key);
          }
        } catch { /* expected: IDB cursor iteration may fail */ }
      }
    };
    req.onerror = () => db.close();
  } catch { /* expected: IndexedDB may be unavailable */ }
}
