/* ─── Interview API Client: LLM calls, session persistence, offline retry ─── */

import type { InterviewStep } from "./interviewScripts";
import { saveSession } from "./supabase";
import { openIDB, loadFromIDB, deleteFromIDB } from "./interviewIDB";
import { checkRateLimit } from "./rateLimit";

const RESULTS_KEY = "hirestepx_sessions";
const IDB_STORE = "drafts";

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
    const sessions: SessionResult[] = raw ? JSON.parse(raw) : [];
    sessions.unshift(result);
    localStorage.setItem(RESULTS_KEY, JSON.stringify(sessions));
    localOk = true;
  } catch (e) {
    console.error("[save] localStorage save failed:", e);
  }
  if (userId) {
    try {
      await saveSession({
        id: result.id,
        user_id: userId,
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
      cloudOk = true;
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

/** Fetch LLM-generated interview questions */
export async function fetchLLMQuestions(params: {
  type: string; focus?: string; difficulty: string; role: string;
  company?: string; industry?: string; resumeText?: string; language?: string;
  pastTopics?: string[]; weakSkills?: string[]; jobDescription?: string;
  experienceLevel?: string;
}): Promise<InterviewStep[] | null> {
  // Client-side rate limit: max 3 question generations per 60s
  if (!checkRateLimit("generate-questions", 3, 60_000)) {
    throw new Error("Too many requests. Please wait a moment and try again.");
  }
  const attempt = async (): Promise<InterviewStep[] | null> => {
    const headers = await import("./supabase").then(m => m.authHeaders());
    const res = await fetch("/api/generate-questions", {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.retryAfter ? `Too many requests. Please wait ${data.retryAfter} seconds and try again.` : "Too many requests. Please wait a moment and try again.");
    }
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.questions || !Array.isArray(data.questions)) return null;
    return data.questions
      .map((q: { type?: string; aiText?: string; text?: string; scoreNote?: string }) => ({
        type: (q.type || "question") as InterviewStep["type"],
        aiText: q.aiText || q.text || "",
        thinkingDuration: q.type === "intro" ? 500 : 600,
        speakingDuration: 5000,
        waitForUser: q.type !== "closing",
        scoreNote: q.scoreNote || "",
      }))
      .filter((q: InterviewStep) => q.aiText.length >= 10)
      .map((q: InterviewStep) => q.type === "closing" ? { ...q, waitForUser: true } : q);
  };
  for (let i = 0; i < 2; i++) {
    try {
      return await attempt();
    } catch (err) {
      if (err instanceof Error && err.message.includes("Too many requests")) throw err;
      if (i === 1 || !(err instanceof TypeError)) return null;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return null;
}

/** Evaluate interview answers with LLM */
export async function fetchLLMEvaluation(params: {
  transcript: { speaker: string; text: string }[];
  type: string; difficulty: string; role: string; company?: string;
  questions?: string[];
  resumeText?: string; language?: string;
  jobDescription?: string;
}, timeoutMs = 35000): Promise<EvaluationResult | null> {
  // Client-side rate limit: max 5 evaluations per 60s
  if (!checkRateLimit("evaluate", 5, 60_000)) {
    throw new Error("Too many requests. Please wait a moment and try again.");
  }
  try {
    const headers = await import("./supabase").then(m => m.authHeaders());
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
    if (!res.ok) return null;
    const body = await res.json();
    if (!body || typeof body.overallScore !== "number" || typeof body.feedback !== "string") return null;
    return body;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Evaluation timed out. Using estimated score.");
    }
    return null;
  }
}

/** Fetch a dynamic follow-up question based on the candidate's answer */
export async function fetchFollowUp(params: {
  question: string; answer: string; type: string; role: string;
  jobDescription?: string; company?: string;
  followUpDepth?: number;
  previousFollowUps?: string[];
}): Promise<{ needsFollowUp: boolean; followUpText: string; followUpType?: string } | null> {
  // Client-side rate limit: max 10 follow-ups per 60s
  if (!checkRateLimit("follow-up", 10, 60_000)) return null;
  try {
    const headers = await import("./supabase").then(m => m.authHeaders());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch("/api/follow-up", {
      method: "POST",
      headers,
      body: JSON.stringify(params),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
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
