/* Vercel Edge Function — Interview Session Evaluation (MVP Report) */

export const config = { runtime: "edge" };

import { withAuthAndRateLimit, sanitizeForLLM, corsHeaders, withRequestId } from "./_shared";
import { callLLM, extractJSON } from "./_llm";

declare const process: { env: Record<string, string | undefined> };
const GROQ_KEY = process.env.GROQ_API_KEY || "";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Bump on any schema change to perQuestion/redFlags/etc. Old cached reports
// with a different version are auto-invalidated on next view.
const REPORT_VERSION = "mvp-6";

/**
 * Try to read a cached report for this session. Returns null on any failure
 * (cache miss, network error, version mismatch) so the caller re-evaluates.
 * We verify user_id matches the caller so one user can't retrieve another's
 * report via a guessed sessionId.
 */
async function loadCachedReport(sessionId: string, userId: string): Promise<SessionReport | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const q = `sessions?id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${encodeURIComponent(userId)}&select=report_json,report_version`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Accept": "application/json",
      },
    });
    if (!res.ok) return null;
    const rows = await res.json() as Array<{ report_json?: SessionReport; report_version?: string }>;
    const row = rows?.[0];
    if (!row?.report_json) return null;
    if (row.report_version !== REPORT_VERSION) return null; // schema upgrade invalidates cache
    return row.report_json;
  } catch (err) {
    console.warn(`[evaluate-session] cache read failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Persist the report on the session row. Fire-and-forget relative to the
 * response: we await it so the write completes before the edge isolate
 * terminates (same lesson as llm_usage), but failures don't block the
 * response — worst case, the user re-evaluates on next view.
 */
async function saveCachedReport(sessionId: string, userId: string, report: SessionReport): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const q = `sessions?id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${encodeURIComponent(userId)}`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        report_json: report,
        report_version: REPORT_VERSION,
        report_generated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[evaluate-session] cache write HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
  } catch (err) {
    console.error(`[evaluate-session] cache write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Load the user's 3 most-recent prior reports (excluding the current session)
 * so the LLM can reference longitudinal patterns — "you've improved on
 * quantification" or "pace is a persistent issue". We only ship the compact
 * coaching signal, NOT transcripts, for token economy + privacy.
 */
interface PriorReportSummary {
  sessionId: string;
  daysAgo: number;
  overallScore: number;
  band: string;
  topFixes: string[];          // just the fix text, for recurrence matching
  topWins: string[];
  coreMetrics: { fillerPerMin: number; silenceRatio: number; paceWpm: number; energy: number };
  weakestSkills: Array<{ name: string; score: number }>;
}

async function loadPriorReports(currentSessionId: string, userId: string): Promise<PriorReportSummary[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return [];
  try {
    const q = `sessions?user_id=eq.${encodeURIComponent(userId)}&id=neq.${encodeURIComponent(currentSessionId)}&report_json=not.is.null&order=created_at.desc&limit=3&select=id,created_at,report_json`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ id: string; created_at: string; report_json: SessionReport }>;
    const now = Date.now();
    return rows
      .filter((r) => r.report_json && typeof r.report_json === "object")
      .map((r) => {
        const rp = r.report_json;
        const sortedSkills = [...(rp.skills || [])].sort((a, b) => a.score - b.score).slice(0, 2);
        return {
          sessionId: r.id,
          daysAgo: Math.max(0, Math.floor((now - new Date(r.created_at).getTime()) / 86_400_000)),
          overallScore: rp.overallScore || 0,
          band: rp.band || "",
          topFixes: (rp.fixes || []).slice(0, 3).map((f) => f.text),
          topWins: (rp.wins || []).slice(0, 3).map((w) => w.text),
          coreMetrics: rp.coreMetrics || { fillerPerMin: 0, silenceRatio: 0, paceWpm: 0, energy: 0 },
          weakestSkills: sortedSkills.map((s) => ({ name: s.name, score: s.score })),
        };
      });
  } catch (err) {
    console.warn(`[evaluate-session] prior-reports fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

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

interface FollowUpQuestion {
  question: string;   // the next question an interviewer would likely ask
  why: string;        // why they'd ask it, given the candidate's answer
}

interface LengthVerdict {
  verdict: "too-brief" | "right" | "too-long";
  wordCount: number;
  targetRange: string;  // e.g. "120-240 words"
  note: string;         // one line, second-person
}

interface PerQuestionReport {
  idx: number;
  question: string;
  answerText: string;
  verdict: "strong" | "complete" | "partial" | "weak" | "skipped";
  score: number;
  starPresence: { S: boolean; T: boolean; A: boolean; R: boolean };
  /** Interviewer's likely follow-up — adaptive-thinking training. */
  likelyFollowUp: FollowUpQuestion | null;
  /** Answer-length analysis against an interviewer's attention window. */
  lengthVerdict: LengthVerdict | null;
  /**
   * Difficulty of the question *for the target role/level*. Warmup = opener,
   * standard = core loop question, hard = bar-raiser / senior-level probe.
   * Calibrates score interpretation: a 55 on a "hard" Q is different signal
   * from a 55 on "warmup".
   */
  difficulty: "warmup" | "standard" | "hard";
  /**
   * Estimated % of loops at the target company/role that ask this question
   * or a close variant. 0-100, or null when the LLM can't estimate.
   */
  frequencyPct: number | null;
  /** Short context line — e.g. "common opener", "bar-raiser variant", "role-specific". ≤60 chars. */
  frequencyNote: string;
  restructured: { text: string; citations: Array<{ markerIdx: number; sourceStart: number; sourceEnd: number }> } | null;
  /**
   * How a 90/100 candidate would answer this question. Unlike `restructured`
   * (grounded in the candidate's own words), this is a synthesized exemplar —
   * the LLM may invent realistic companies/numbers appropriate to the role
   * and level. The UI must label this clearly as a generated example so the
   * candidate doesn't think it's theirs.
   */
  topPerformerAnswer: {
    text: string;
    whatMakesItStrong: string[]; // 2-4 bullets: specific reasons this answer is 90/100
  } | null;
  explanation: string;
}

interface WinOrFix {
  text: string;         // imperative for fixes, declarative for wins
  questionIdx: number;  // which perQuestion.idx this relates to, -1 if cross-cutting
  quote: string;        // verbatim substring of the candidate's words (validated)
}

type RedFlagType = "blame" | "missing_result" | "we_without_i" | "scope_drift" | "contradiction" | "vague";

interface RedFlag {
  type: RedFlagType;
  severity: "high" | "medium" | "low";
  title: string;              // e.g. "Missing result"
  explanation: string;        // 1 sentence in second person
  questionIdx: number;        // -1 for cross-cutting
  quote: string;              // verbatim substring (validated); "" for cross-cutting
}

interface AdvancedDelivery {
  hedgingPerMin: number;          // density of hedges per minute of speech
  lexicalDiversity: number;       // MTLD-lite: unique-word ratio, 0-1
  firstPersonRatio: number;       // I / (I + we) across candidate corpus
  medianLatencyMs: number;        // median gap between question end → candidate start
  selfCorrectionRate: number;     // "let me rephrase", "actually", restarts per minute
}

interface ThoughtBubbleSegment {
  startMs: number;
  endMs: number;
  state: "tracking" | "losingThread" | "probingForScope" | "readyToMoveOn" | "impressed" | "concerned";
  note: string; // ≤80 chars, second-person, honest
}

interface CrossSessionInsight {
  kind: "improvement" | "regression" | "persistent";
  text: string;                 // one sentence, second-person
  metric?: string;              // optional: "pace", "quantification", "Technical Depth"
  delta?: number;               // signed pt change from last session, if numeric
}

interface StoryReuseFinding {
  storyLabel: string;           // short label — e.g. "Catalyst IQ launch"
  questionIndices: number[];    // perQuestion.idx list where the story was reused
  concern: string;              // one sentence of coaching
}

interface BlindSpot {
  competency: string;           // e.g. "Conflict resolution"
  frequencyPct: number | null;  // how often this competency is tested at target role/company
  note: string;                 // one-line coaching on how to prep for it
}

interface ReadinessForecast {
  targetBand: "strongHire" | "hire" | "leanHire";
  estimatedHours: number;       // focused practice hours to reach target band
  estimatedSessions: number;    // estimated # of mock sessions
  confidence: "low" | "medium" | "high";
  rationale: string;            // one sentence explaining the estimate
}

interface SessionReport {
  version: "mvp-6";
  overallScore: number;
  /** LLM-self-reported 0-1 confidence in the overall score. Rendered as ±band. */
  scoreConfidence: number;
  band: "strongHire" | "hire" | "leanHire" | "noHire" | "strongNoHire";
  verdict: string;
  wins: WinOrFix[];
  fixes: WinOrFix[];
  redFlags: RedFlag[];
  coreMetrics: { fillerPerMin: number; silenceRatio: number; paceWpm: number; energy: number };
  advancedDelivery: AdvancedDelivery;
  skills: Array<{ name: string; score: number; weight?: number }>;
  perQuestion: PerQuestionReport[];
  thoughtBubble: ThoughtBubbleSegment[];
  calibration: {
    companyLabel: string;
    note: string;
    bands: { strongHire: number; hire: number; leanHire: number; noHire: number };
  };
  crossSessionInsights: CrossSessionInsight[];
  priorSessionCount: number;
  storyReuseFindings: StoryReuseFinding[];
  blindSpots: BlindSpot[];
  readiness: ReadinessForecast | null;
  model: string;
}

const ROLE_SKILLS: Record<string, string[]> = {
  swe: ["Problem Framing", "Technical Depth", "Trade-off Reasoning", "Communication", "Ownership"],
  pm: ["Product Sense", "Analytical", "Execution", "Influencing", "Customer Focus"],
  em: ["Strategic Thinking", "People Management", "Execution", "Communication", "Conflict Handling"],
  data: ["Analytical", "Technical Depth", "Business Impact", "Communication", "Ownership"],
  behavioral: ["Structure", "Ownership", "Impact", "Communication", "Composure"],
};

/** Default score→band thresholds; company calibration can override. */
const DEFAULT_BANDS = { strongHire: 85, hire: 70, leanHire: 55, noHire: 40 };

function applyBands(score: number, bands: { strongHire: number; hire: number; leanHire: number; noHire: number }): SessionReport["band"] {
  if (score >= bands.strongHire) return "strongHire";
  if (score >= bands.hire) return "hire";
  if (score >= bands.leanHire) return "leanHire";
  if (score >= bands.noHire) return "noHire";
  return "strongNoHire";
}

/**
 * Company profile registry — duplicated here (edge runtime) from
 * src/companyCalibration.ts so we don't pull the whole client module
 * into the handler bundle. Keep keys in sync.
 */
const COMPANY_BANDS: Record<string, { label: string; bands: typeof DEFAULT_BANDS; skillWeights: Record<string, number>; note: string }> = {
  amazon:       { label: "Amazon",              bands: { strongHire: 90, hire: 75, leanHire: 60, noHire: 42 }, skillWeights: { "Ownership": 1.3, "Impact": 1.2, "Technical Depth": 1.15, "Problem Framing": 1.1, "Influencing": 1.1 }, note: "Amazon Bar Raiser — Ownership + Deliver Results weighted heavily." },
  google:       { label: "Google",              bands: { strongHire: 88, hire: 73, leanHire: 58, noHire: 42 }, skillWeights: { "Problem Framing": 1.2, "Technical Depth": 1.2, "Communication": 1.15, "Trade-off Reasoning": 1.1 }, note: "Google G&L + technical bar." },
  meta:         { label: "Meta",                bands: { strongHire: 88, hire: 72, leanHire: 58, noHire: 42 }, skillWeights: { "Impact": 1.25, "Execution": 1.15, "Technical Depth": 1.1, "Problem Framing": 1.05 }, note: "Meta's signal-based E-level rubric — Impact above all." },
  stripe:       { label: "Stripe",              bands: { strongHire: 87, hire: 72, leanHire: 57, noHire: 42 }, skillWeights: { "Communication": 1.3, "Problem Framing": 1.15, "Ownership": 1.1, "Technical Depth": 1.1, "Customer Focus": 1.05 }, note: "Stripe's high writing and clarity bar." },
  netflix:      { label: "Netflix",             bands: { strongHire: 90, hire: 76, leanHire: 62, noHire: 45 }, skillWeights: { "Impact": 1.3, "Ownership": 1.2, "Influencing": 1.15, "Execution": 1.1 }, note: "Netflix keeper-test — senior by default." },
  microsoft:    { label: "Microsoft",           bands: { strongHire: 86, hire: 71, leanHire: 56, noHire: 40 }, skillWeights: { "Technical Depth": 1.15, "Problem Framing": 1.1, "Communication": 1.1, "Impact": 1.1 }, note: "Microsoft Growth Mindset + technical rubric." },
  apple:        { label: "Apple",               bands: { strongHire: 88, hire: 73, leanHire: 58, noHire: 42 }, skillWeights: { "Technical Depth": 1.2, "Problem Framing": 1.15, "Customer Focus": 1.15, "Ownership": 1.1 }, note: "Apple craft + secrecy culture — depth over breadth." },
  "series-b":   { label: "Series-B Startup",    bands: { strongHire: 80, hire: 65, leanHire: 50, noHire: 35 }, skillWeights: { "Ownership": 1.2, "Execution": 1.15, "Impact": 1.1 }, note: "Series-B growth stage — bias toward ownership + execution." },
  "early-stage":{ label: "Early-Stage Startup", bands: { strongHire: 78, hire: 62, leanHire: 48, noHire: 32 }, skillWeights: { "Ownership": 1.25, "Execution": 1.2 }, note: "Seed / Series-A — friendlier bar, scrappy ownership." },
};

const COMPANY_ALIASES: Record<string, string> = {
  aws: "amazon", amzn: "amazon", alphabet: "google", facebook: "meta", fb: "meta",
  msft: "microsoft", ms: "microsoft", nflx: "netflix", startup: "early-stage",
};

function resolveCompanyProfile(targetCompany: string | null | undefined) {
  if (!targetCompany) return null;
  const key = String(targetCompany).toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!key) return null;
  if (COMPANY_BANDS[key]) return COMPANY_BANDS[key];
  if (COMPANY_ALIASES[key] && COMPANY_BANDS[COMPANY_ALIASES[key]]) return COMPANY_BANDS[COMPANY_ALIASES[key]];
  for (const k of Object.keys(COMPANY_BANDS)) {
    if (key.includes(k)) return COMPANY_BANDS[k];
  }
  return null;
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

/**
 * Advanced delivery signals — deterministic regex + arithmetic over the
 * transcript, no LLM. Beats Yoodli on the delivery side because we unify
 * these with content scoring on the same screen.
 */
function computeAdvancedDelivery(transcript: EvaluateRequest["transcript"], durationSec: number): AdvancedDelivery {
  const candidateTurns = transcript.filter((t) => t.role === "candidate");
  const allText = candidateTurns.map((t) => t.text).join(" ");
  const words = allText.split(/\s+/).filter(Boolean);
  const speakingMinutes = Math.max(durationSec / 60, 0.1);

  // Hedging density: "I think", "maybe", "kind of", etc.
  const hedgeRegex = /\b(?:i\s+(?:think|guess|feel|believe|assume|suppose)|maybe|kind\s+of|sort\s+of|kinda|sorta|probably|perhaps|might|could\s+be|i'?m\s+not\s+sure)\b/gi;
  const hedgeCount = (allText.match(hedgeRegex) || []).length;

  // Lexical diversity — MTLD-lite: unique words over total, floor-clamped at
  // very short answers to avoid noise. This correlates with perceived
  // competence (McCarthy & Jarvis 2010 simplified).
  const uniqueWords = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z']/g, ""))).size;
  const lexicalDiversity = words.length >= 20 ? uniqueWords / words.length : 0;

  // First-person ownership ratio across candidate text.
  const iCount = (allText.match(/\bI\b/g) || []).length;
  const weCount = (allText.match(/\bwe\b/gi) || []).length;
  const firstPersonRatio = iCount + weCount > 0 ? iCount / (iCount + weCount) : 0.5;

  // Response latency — gap between interviewer turn end → candidate turn start.
  // Only meaningful if timestamps are present.
  const latencies: number[] = [];
  for (let i = 1; i < transcript.length; i++) {
    const prev = transcript[i - 1];
    const cur = transcript[i];
    if (prev.role === "interviewer" && cur.role === "candidate" && prev.endMs != null && cur.startMs != null) {
      const gap = cur.startMs - prev.endMs;
      if (gap >= 0 && gap < 30_000) latencies.push(gap); // sanity-clamp 0–30s
    }
  }
  latencies.sort((a, b) => a - b);
  const medianLatencyMs = latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : 0;

  // Self-correction rate — restarts per minute.
  const scRegex = /\b(?:let\s+me\s+rephrase|actually(?:,|\s+let\s+me)|what\s+i\s+(?:meant|mean)\s+(?:to\s+say\s+)?(?:is|was)|sorry,?\s+i\s+misspoke|scratch\s+that|let\s+me\s+start\s+over)\b/gi;
  const scCount = (allText.match(scRegex) || []).length;

  return {
    hedgingPerMin: Math.round((hedgeCount / speakingMinutes) * 10) / 10,
    lexicalDiversity: Math.round(lexicalDiversity * 100) / 100,
    firstPersonRatio: Math.round(firstPersonRatio * 100) / 100,
    medianLatencyMs: Math.round(medianLatencyMs),
    selfCorrectionRate: Math.round((scCount / speakingMinutes) * 10) / 10,
  };
}

/**
 * Strip LLM-returned wins/fixes whose quotes can't be verified against the
 * candidate's own transcript. Cross-cutting fixes (questionIdx=-1) are allowed
 * without a quote since they apply to delivery, not a specific answer.
 */
function filterGroundedItems(items: WinOrFix[] | undefined, candidateCorpus: string): WinOrFix[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((w) => w && typeof w.text === "string" && w.text.trim().length > 0)
    .filter((w) => {
      if (w.questionIdx === -1 || !w.quote) return true; // cross-cutting
      return typeof w.quote === "string" && candidateCorpus.includes(w.quote.trim());
    })
    .slice(0, 3);
}

/** Same grounding guard for red flags. Drops unknown types/severities. */
function filterGroundedRedFlags(items: RedFlag[] | undefined, candidateCorpus: string): RedFlag[] {
  if (!Array.isArray(items)) return [];
  const validTypes: RedFlagType[] = ["blame", "missing_result", "we_without_i", "scope_drift", "contradiction", "vague"];
  const validSeverities = ["high", "medium", "low"] as const;
  return items
    .filter((f) => f && validTypes.includes(f.type) && (validSeverities as readonly string[]).includes(f.severity))
    .filter((f) => typeof f.title === "string" && f.title.trim().length > 0)
    .filter((f) => {
      if (f.questionIdx === -1 || !f.quote) return true;
      return typeof f.quote === "string" && candidateCorpus.includes(f.quote.trim());
    })
    .slice(0, 4);
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

    // Try cache first — report is deterministic for (sessionId, REPORT_VERSION).
    // Saves ~8-12s of LLM latency and ~2500 tokens per re-open of the same report.
    if (auth.userId) {
      const tCache0 = Date.now();
      const cached = await loadCachedReport(sessionId, auth.userId);
      const tCache = Date.now() - tCache0;
      if (cached) {
        const totalMs = Date.now() - t0;
        console.warn(`[evaluate-session] CACHE HIT session=${sessionId.slice(0, 8)} lookup=${tCache}ms total=${totalMs}ms`);
        headers["X-Timing"] = `cacheLookup=${tCache},total=${totalMs},cached=1`;
        return new Response(JSON.stringify({ report: cached, cached: true }), { status: 200, headers });
      }
    }

    const roleFamily = (meta?.roleFamily as keyof typeof ROLE_SKILLS) || "behavioral";
    const skillAxes = ROLE_SKILLS[roleFamily] || ROLE_SKILLS.behavioral;
    const durationSec = meta?.duration || 600;
    const coreMetrics = computeCoreMetrics(transcript, durationSec);
    const advancedDelivery = computeAdvancedDelivery(transcript, durationSec);

    // Resolve company calibration profile (falls back to default bands/weights).
    const companyProfile = resolveCompanyProfile(meta?.targetCompany);
    const bands = companyProfile?.bands ?? DEFAULT_BANDS;
    const companyLabel = companyProfile?.label ?? "Generic";
    const companyNote = companyProfile?.note ?? "Generic calibration — set a target company for role-specific scoring.";

    // Cross-session memory: fetch the user's last 3 reports (structured
    // coaching signal only — no transcripts) so the LLM can call out
    // improvements, regressions, and persistent issues.
    const priorReports = auth.userId ? await loadPriorReports(sessionId, auth.userId) : [];

    // Build transcript block — truncate individual turns but keep structure intact.
    const transcriptBlock = transcript
      .map((t, i) => `[${i}] ${t.role === "interviewer" ? "INTERVIEWER" : "CANDIDATE"}: ${sanitizeForLLM(t.text, 1500)}`)
      .join("\n");

    // Compact prior-sessions block for the prompt. Omitted entirely if no history.
    const priorContextBlock = priorReports.length > 0
      ? `\nPRIOR SESSIONS (most recent first, for longitudinal coaching context):\n` +
        priorReports
          .map((p, i) =>
            `[${i + 1}] ${p.daysAgo}d ago · score ${p.overallScore}/100 (${p.band})\n` +
            `    pace: ${p.coreMetrics.paceWpm} wpm · fillers: ${p.coreMetrics.fillerPerMin}/min\n` +
            `    weakest skills: ${p.weakestSkills.map((s) => `${s.name} ${s.score}`).join(", ") || "—"}\n` +
            `    top fixes they were told: ${p.topFixes.map((f) => `"${f.slice(0, 90)}"`).join(" | ") || "—"}`,
          )
          .join("\n")
      : "";

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
${priorContextBlock}

RUBRIC — score each skill 0-100:
${skillAxes.map((s) => `- ${s}`).join("\n")}

Return a JSON object with EXACTLY this shape:
{
  "overallScore": <0-100 integer, role-weighted composite of skills>,
  "verdict": "<one sentence, ≤140 chars, second-person, specific, honest>",
  "wins": [
    // 1-3 items. Concrete things the candidate did well. Each "quote" MUST be a verbatim
    // substring of one of their own answers. "text" is a short declarative sentence.
    { "text": "...", "questionIdx": <perQuestion idx>, "quote": "..." }
  ],
  "fixes": [
    // 1-3 items. Imperative phrasing ("Quantify the result with a % or $"). Each "quote"
    // MUST be a verbatim substring of one of the candidate's answers. If the fix applies
    // cross-question (e.g. pace), set questionIdx=-1 and quote="".
    { "text": "...", "questionIdx": <perQuestion idx or -1>, "quote": "..." }
  ],
  "redFlags": [
    // 0-4 items. Rejection-grade signals that typically sink a real-loop interview.
    // Only include items that are honestly present; empty array is fine.
    // type MUST be one of: blame, missing_result, we_without_i, scope_drift, contradiction, vague
    // - "blame": blaming teammates/managers/leadership for failures ("they didn't ...", "management wouldn't ...")
    // - "missing_result": behavioral answer with no measurable/quantified outcome
    // - "we_without_i": accomplishment stated in collective "we" without the candidate's specific contribution
    // - "scope_drift": answer wanders away from what was asked
    // - "contradiction": contradicts a prior answer in the same interview
    // - "vague": hand-wavy technical/strategic answer with no concrete specifics
    // severity MUST be one of: high (likely rejection), medium (strong concern), low (nitpick)
    // "quote" MUST be a verbatim substring of the candidate's words; cross-cutting flags
    // may use questionIdx=-1 with quote="".
    { "type": "<enum>", "severity": "<enum>", "title": "<≤40 chars>", "explanation": "<one sentence>", "questionIdx": <idx or -1>, "quote": "..." }
  ],
  "skills": [${skillAxes.map((s) => `{"name":"${s}","score":<0-100>}`).join(",")}],
  "thoughtBubble": [
    // 3-8 segments covering the whole interview in order. Each segment
    // describes what the interviewer is likely thinking during that stretch.
    // state MUST be one of: tracking, losingThread, probingForScope, readyToMoveOn, impressed, concerned
    // startMs/endMs are in milliseconds; if timestamps aren't known, use 0 and estimate based on turn indices.
    // note is a single short sentence in second person (≤80 chars), honest.
    { "startMs": <int>, "endMs": <int>, "state": "<enum>", "note": "<sentence>" }
  ],
  "perQuestion": [
    {
      "idx": <question turn index from transcript>,
      "question": "<full interviewer question text>",
      "answerText": "<candidate's verbatim answer>",
      "verdict": "<strong|complete|partial|weak|skipped>",
      "score": <0-100>,
      "starPresence": {"S": <bool>, "T": <bool>, "A": <bool>, "R": <bool>},
      "difficulty": "<warmup|standard|hard>",
      "frequencyPct": <0-100 integer estimate OR null if you can't estimate>,
      "frequencyNote": "<≤60 chars, e.g. 'common opener at FAANG', 'bar-raiser variant', 'role-specific probe'>",
      "restructured": {
        "text": "<rewrite the candidate's answer in STAR form, using ONLY facts from their own words; 80-160 words>",
        "citations": [{"markerIdx": <1-based marker>, "sourceStart": <char offset in answerText>, "sourceEnd": <char offset>}]
      },
      "topPerformerAnswer": {
        "text": "<a synthesized 90/100 answer to THIS question, calibrated to the target role and company. You MAY invent realistic company names, metrics, and outcomes here — the purpose is to show what excellence looks like. 100-180 words. Use STAR structure with concrete quantification.>",
        "whatMakesItStrong": ["<reason 1, e.g. 'Leads with scope: 4M users affected'>", "<reason 2>", "<reason 3>"]
      },
      "likelyFollowUp": {
        "question": "<the next question a real interviewer would likely ask based on THIS candidate's answer to THIS question — specific, probing, one sentence>",
        "why": "<one sentence on what the interviewer is trying to learn by asking that follow-up>"
      },
      "lengthVerdict": {
        "verdict": "<too-brief|right|too-long>",
        "wordCount": <integer word count of the candidate's answer>,
        "targetRange": "<expected range for this type of question, e.g. '120-240 words' for behavioral or '180-360' for system design>",
        "note": "<one line coaching, second-person>"
      },
      "explanation": "<1-2 sentences on what worked/missed>"
    }
  ],
  "scoreConfidence": <0.0-1.0 — YOUR self-reported confidence in the overall score. Lower if transcript is short/noisy or if the candidate's intent was ambiguous. 0.8 is typical; 0.95 means very confident; 0.55 means treat score as indicative only.>,
  "storyReuseFindings": [
    // 0-3 items. Flag cases where the candidate used ONE story/project across
    // MULTIPLE questions that test DIFFERENT competencies. Real interviews
    // penalize this — it reads as a thin portfolio. Identify the story by a
    // short label and list the perQuestion indices where it reappeared.
    // Leave empty if no reuse detected.
    { "storyLabel": "<short label, e.g. 'Catalyst IQ launch'>", "questionIndices": [<int>, <int>], "concern": "<one sentence>" }
  ],
  "blindSpots": [
    // 2-5 competencies that are COMMONLY tested for the target role/company
    // but were NOT assessed in this session. Prevents overfitting to seen Qs.
    // frequencyPct is % of loops that test this at the target company (null if uncertain).
    { "competency": "<short, e.g. 'Conflict resolution'>", "frequencyPct": <0-100 or null>, "note": "<one line on how to prep for it>" }
  ],
  "readiness": {
    // Estimate practice volume to reach a target band. Use prior session
    // trajectory if available; otherwise give a first-timer estimate.
    // targetBand should be the next-higher band above the candidate's current one
    // (leanHire → hire; hire → strongHire; strongHire → strongHire as a stretch goal).
    // Be honest: 20-80 hours is typical; don't underestimate to flatter.
    "targetBand": "<strongHire|hire|leanHire>",
    "estimatedHours": <integer>,
    "estimatedSessions": <integer>,
    "confidence": "<low|medium|high>",
    "rationale": "<one sentence>"
  },
  "crossSessionInsights": [
    // 0-4 items. ONLY populate if PRIOR SESSIONS context is present above —
    // otherwise return []. These are the coaching signals that turn the report
    // from a scorecard into a coach. Each item is ONE of:
    // - "improvement": something measurably better than last session
    // - "regression": something measurably worse than last session
    // - "persistent": a weakness that appears in BOTH this session AND prior sessions
    //   (i.e. the candidate was told to fix it and hasn't)
    // Write in second person, specific, honest. Example:
    //   { "kind": "persistent", "text": "You were told to quantify results two sessions ago — still missing in 4/5 answers this time.", "metric": "quantification" }
    //   { "kind": "improvement", "text": "Fillers dropped from 6.2/min to 2.8/min — your hardest-won gain.", "metric": "fillers", "delta": -3.4 }
    //   { "kind": "regression", "text": "Pace climbed back to 201 wpm — the rushed delivery cost you on Q3.", "metric": "pace", "delta": 18 }
    { "kind": "<enum>", "text": "<sentence>", "metric": "<optional short>", "delta": <optional number> }
  ]
}

CRITICAL RULES:
- Pair each interviewer question with the candidate answer that follows it. Skip pairs where the candidate didn't answer (use verdict="skipped", restructured=null, topPerformerAnswer=null).
- Every skill score must be justified by transcript evidence.
- Restructured answer MUST NOT invent numbers, company names, or outcomes not present in the candidate's words. If quantification is missing, frame it as a gap ("you could add the exact % here") rather than making one up.
- TopPerformerAnswer IS allowed to invent realistic details — that's its purpose. It should showcase STAR structure, quantified impact, first-person ownership, and role-appropriate scope. Aim for what a strong L5/Senior would say at the target company.
- Difficulty classification (for the target role/level, not absolute):
    * warmup  = common opener with expected structure (e.g. "Tell me about yourself", "Why this company?")
    * standard = core loop question probing a single competency (most behavioral + mid-complexity system design)
    * hard    = bar-raiser / scope-stretch / senior-level probe (multi-part system design, unusual ethical dilemmas, scope >$10M impact expected)
- frequencyPct is your best estimate of how common this question (or a near variant) is across the target company's loops for this role. "Tell me about yourself" ≈ 95. "Design a distributed rate limiter" ≈ 40 for SWE. Set null if uncertain.
- frequencyNote is one short phrase contextualizing the question — help the candidate understand whether to deeply prep this pattern or treat it as a one-off.
- Citations must reference real character offsets inside answerText.
- Keep verdict scores honest. Average mock interview scores 45-65.
- For crossSessionInsights: if no PRIOR SESSIONS block is provided, return an empty array — do NOT fabricate history. If prior data IS provided, prefer persistent/regression callouts over improvements (users need correction more than praise).
- likelyFollowUp must be specific to the candidate's actual answer, not generic. If they made a vague claim ("we improved performance"), the follow-up should probe scope ("by how much? on what metric?").
- lengthVerdict.wordCount must be the actual word count of answerText. Target range depends on question type: behavioral 120-240, system design 180-360, opener 60-120, deep-dive probe 150-300.
- storyReuseFindings only fires when the SAME underlying project/situation is used for DIFFERENT competencies (e.g. once for leadership, again for trade-offs). Two behavioral answers from different projects is fine; same project across two is a flag.
- scoreConfidence should reflect transcript quality and answer clarity. Short interviews (<3 turns), garbled transcripts, or highly ambiguous answers warrant <0.7.
- Return ONLY valid JSON — no markdown wrapping, no prose.`;

    const tLLM0 = Date.now();
    const result = await callLLM(
      { prompt, temperature: 0.25, maxTokens: 7500, jsonMode: true },
      35000,
      { userId: auth.userId, endpoint: "evaluate-session" },
    );
    const tLLM = Date.now() - tLLM0;

    const parsed = extractJSON<Partial<SessionReport>>(result.text);
    if (!parsed) {
      console.error(`[evaluate-session] JSON parse failed. Model: ${result.model}, len: ${result.text.length}, head: ${result.text.slice(0, 200)}`);
      return new Response(JSON.stringify({ error: "Failed to parse evaluation", retryable: true }), { status: 500, headers });
    }

    // Build final report — merge deterministic metrics with LLM output.
    // Apply company calibration: re-weight skills + use company-specific bands.
    const rawSkills = Array.isArray(parsed.skills) ? parsed.skills.slice(0, 8) : [];
    const skillWeights = companyProfile?.skillWeights ?? {};
    const weightedSkills = rawSkills.map((s) => ({
      name: s.name,
      score: s.score,
      weight: Math.round((skillWeights[s.name] ?? 1.0) * 100) / 100,
    }));
    const totalWeight = weightedSkills.reduce((sum, w) => sum + w.weight, 0) || 1;
    const llmOverall = typeof parsed.overallScore === "number" ? parsed.overallScore : 50;
    // Blend: 60% role-weighted composite, 40% LLM's holistic score. The
    // composite keeps company calibration honest; the LLM component
    // captures cross-cutting signals the weights don't model.
    const composite = weightedSkills.length > 0
      ? weightedSkills.reduce((sum, w) => sum + w.score * w.weight, 0) / totalWeight
      : llmOverall;
    const overallScore = Math.max(0, Math.min(100, Math.round(composite * 0.6 + llmOverall * 0.4)));
    const candidateCorpus = transcript.filter((t) => t.role === "candidate").map((t) => t.text).join("\n");

    // Thought bubble: validate each segment has a known state + clamp timestamps.
    const validStates = ["tracking", "losingThread", "probingForScope", "readyToMoveOn", "impressed", "concerned"];
    const rawThoughtBubble = (parsed as Record<string, unknown>).thoughtBubble;
    const thoughtBubble: ThoughtBubbleSegment[] = Array.isArray(rawThoughtBubble)
      ? (rawThoughtBubble as ThoughtBubbleSegment[])
          .filter((s) => s && validStates.includes(s.state) && typeof s.note === "string")
          .map((s) => ({
            startMs: Math.max(0, Math.floor(Number(s.startMs) || 0)),
            endMs: Math.max(0, Math.floor(Number(s.endMs) || 0)),
            state: s.state,
            note: s.note.slice(0, 100),
          }))
          .filter((s) => s.endMs >= s.startMs)
          .slice(0, 8)
      : [];

    const rawConf = (parsed as Record<string, unknown>).scoreConfidence;
    const scoreConfidence =
      typeof rawConf === "number" && isFinite(rawConf)
        ? Math.max(0, Math.min(1, Math.round(rawConf * 100) / 100))
        : 0.8;

    const rawStoryReuse = (parsed as Record<string, unknown>).storyReuseFindings;
    const storyReuseFindings: StoryReuseFinding[] = Array.isArray(rawStoryReuse)
      ? (rawStoryReuse as StoryReuseFinding[])
          .filter((f) => f && typeof f.storyLabel === "string" && Array.isArray(f.questionIndices) && f.questionIndices.length >= 2 && typeof f.concern === "string")
          .map((f) => ({
            storyLabel: f.storyLabel.slice(0, 60),
            questionIndices: f.questionIndices.filter((i) => typeof i === "number" && i >= 0).slice(0, 6),
            concern: f.concern.slice(0, 200),
          }))
          .filter((f) => f.questionIndices.length >= 2)
          .slice(0, 3)
      : [];

    const report: SessionReport = {
      version: "mvp-6",
      overallScore,
      scoreConfidence,
      band: applyBands(overallScore, bands),
      verdict: typeof parsed.verdict === "string" ? parsed.verdict.slice(0, 200) : "",
      wins: filterGroundedItems(parsed.wins as WinOrFix[] | undefined, candidateCorpus),
      fixes: filterGroundedItems(parsed.fixes as WinOrFix[] | undefined, candidateCorpus),
      redFlags: filterGroundedRedFlags((parsed as Record<string, unknown>).redFlags as RedFlag[] | undefined, candidateCorpus),
      coreMetrics,
      advancedDelivery,
      skills: weightedSkills,
      perQuestion: Array.isArray(parsed.perQuestion)
        ? (parsed.perQuestion as PerQuestionReport[])
            .slice(0, 30)
            .map((pq) => {
              const validDifficulty = ["warmup", "standard", "hard"];
              const validLength = ["too-brief", "right", "too-long"];
              const diff: PerQuestionReport["difficulty"] = validDifficulty.includes(pq.difficulty) ? pq.difficulty : "standard";
              const freqRaw = pq.frequencyPct;
              const freq: number | null =
                typeof freqRaw === "number" && isFinite(freqRaw) && freqRaw >= 0 && freqRaw <= 100
                  ? Math.round(freqRaw)
                  : null;
              // likelyFollowUp — accept only if both fields are non-empty strings
              const fu = pq.likelyFollowUp;
              const likelyFollowUp: FollowUpQuestion | null =
                fu && typeof fu.question === "string" && fu.question.trim() && typeof fu.why === "string" && fu.why.trim()
                  ? { question: fu.question.slice(0, 300), why: fu.why.slice(0, 200) }
                  : null;
              // lengthVerdict — sanity-check word count against actual answer
              const lv = pq.lengthVerdict;
              const actualWc = (pq.answerText || "").trim().split(/\s+/).filter(Boolean).length;
              const lengthVerdict: LengthVerdict | null =
                lv && validLength.includes(lv.verdict)
                  ? {
                      verdict: lv.verdict,
                      wordCount: actualWc, // prefer our count; LLM's may drift
                      targetRange: typeof lv.targetRange === "string" ? lv.targetRange.slice(0, 40) : "",
                      note: typeof lv.note === "string" ? lv.note.slice(0, 140) : "",
                    }
                  : null;
              return {
                ...pq,
                difficulty: diff,
                frequencyPct: freq,
                frequencyNote: typeof pq.frequencyNote === "string" ? pq.frequencyNote.slice(0, 80) : "",
                likelyFollowUp,
                lengthVerdict,
              };
            })
        : [],
      thoughtBubble,
      calibration: { companyLabel, note: companyNote, bands },
      crossSessionInsights: (() => {
        const raw = (parsed as Record<string, unknown>).crossSessionInsights;
        if (!Array.isArray(raw)) return [];
        if (priorReports.length === 0) return []; // Defense-in-depth against hallucinated history.
        const validKinds = ["improvement", "regression", "persistent"];
        return (raw as CrossSessionInsight[])
          .filter((i) => i && validKinds.includes(i.kind) && typeof i.text === "string" && i.text.trim().length > 0)
          .map((i) => ({
            kind: i.kind,
            text: i.text.slice(0, 220),
            metric: typeof i.metric === "string" ? i.metric.slice(0, 40) : undefined,
            delta: typeof i.delta === "number" && isFinite(i.delta) ? Math.round(i.delta * 10) / 10 : undefined,
          }))
          .slice(0, 4);
      })(),
      priorSessionCount: priorReports.length,
      storyReuseFindings,
      blindSpots: (() => {
        const raw = (parsed as Record<string, unknown>).blindSpots;
        if (!Array.isArray(raw)) return [];
        return (raw as BlindSpot[])
          .filter((b) => b && typeof b.competency === "string" && b.competency.trim().length > 0)
          .map((b) => ({
            competency: b.competency.slice(0, 60),
            frequencyPct:
              typeof b.frequencyPct === "number" && isFinite(b.frequencyPct) && b.frequencyPct >= 0 && b.frequencyPct <= 100
                ? Math.round(b.frequencyPct)
                : null,
            note: typeof b.note === "string" ? b.note.slice(0, 160) : "",
          }))
          .slice(0, 5);
      })(),
      readiness: (() => {
        const raw = (parsed as Record<string, unknown>).readiness as ReadinessForecast | undefined;
        if (!raw || typeof raw !== "object") return null;
        const validBands = ["strongHire", "hire", "leanHire"];
        const validConf = ["low", "medium", "high"];
        if (!validBands.includes(raw.targetBand)) return null;
        return {
          targetBand: raw.targetBand,
          estimatedHours: Math.max(0, Math.min(500, Math.round(Number(raw.estimatedHours) || 0))),
          estimatedSessions: Math.max(0, Math.min(100, Math.round(Number(raw.estimatedSessions) || 0))),
          confidence: validConf.includes(raw.confidence) ? raw.confidence : "medium",
          rationale: typeof raw.rationale === "string" ? raw.rationale.slice(0, 220) : "",
        };
      })(),
      model: result.model,
    };

    if (!validateReport(report, transcript)) {
      console.warn(`[evaluate-session] validation failed for session=${sessionId.slice(0, 8)}; returning anyway with warning`);
    }

    // Persist to cache so re-opens are instant. Awaited so the edge isolate
    // doesn't terminate mid-write (same lesson as llm_usage in _llm.ts).
    // Cache failures are non-fatal — the user still gets their report.
    if (auth.userId) await saveCachedReport(sessionId, auth.userId, report);

    const totalMs = Date.now() - t0;
    console.warn(`[evaluate-session] OK session=${sessionId.slice(0, 8)} score=${overallScore} band=${report.band} llm=${tLLM}ms total=${totalMs}ms model=${result.model}`);
    headers["X-Timing"] = `llm=${tLLM},total=${totalMs},model=${result.model}`;

    return new Response(JSON.stringify({ report, cached: false }), { status: 200, headers });
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
