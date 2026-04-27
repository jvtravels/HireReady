/**
 * Resume fitness scoring — pure, deterministic, fast.
 *
 * Given a parsed ResumeProfile and a target interview type, return a
 * 0-100 fit score plus a short human-readable rationale. The scoring
 * lives client-side because it's evidence-rule-based (no LLM call) and
 * we want it instant on the dashboard catalogue grid.
 *
 * Rules-of-thumb instead of ML:
 *   - count signal terms in topSkills + keyAchievements + summary
 *   - reward quantified achievements (numbers / percentages / "led X")
 *   - reward seniority terms when interview type expects them
 *   - cap at 100, floor at 0
 *
 * The output is deliberately stable for a given input so tests can
 * pin exact values. If the rubric evolves, bump SCORING_VERSION so
 * we can audit drift.
 */

import type { ResumeProfile } from "./dashboardData";

export const SCORING_VERSION = 1;

export type InterviewType = "behavioral" | "technical" | "system_design" | "case";

export type FitnessBand = "low" | "fair" | "good" | "excellent";

export interface FitnessScore {
  score: number;
  band: FitnessBand;
  rationale: string;
}

/** Token sets that signal fit per interview type. Lower-cased; we match
 *  whole-word, case-insensitive against profile text. */
const SIGNAL_TERMS: Record<InterviewType, string[]> = {
  behavioral: [
    "led", "managed", "mentored", "coached", "stakeholder", "cross-functional",
    "collaborated", "partnered", "influenced", "owned", "delivered", "drove",
    "team", "leadership", "communication", "negotiated",
  ],
  technical: [
    "javascript", "typescript", "python", "java", "go", "rust", "c++", "react",
    "node", "kubernetes", "docker", "aws", "gcp", "azure", "sql", "nosql",
    "redis", "graphql", "rest", "microservices", "ci/cd", "testing", "tdd",
    "algorithms", "data structures", "postgres", "postgresql", "mysql", "mongodb",
  ],
  system_design: [
    "architecture", "scalability", "distributed", "microservices", "latency",
    "throughput", "availability", "reliability", "load balancing", "caching",
    "database", "queue", "kafka", "designed", "system design", "infrastructure",
    "platform",
  ],
  case: [
    "analysis", "strategy", "growth", "revenue", "metrics", "kpi", "framework",
    "market", "competitive", "p&l", "roi", "stakeholder", "business",
    "consultant", "consulting", "product strategy", "go-to-market",
  ],
};

const BAND_THRESHOLDS: Array<{ min: number; band: FitnessBand }> = [
  { min: 80, band: "excellent" },
  { min: 60, band: "good" },
  { min: 40, band: "fair" },
  { min: 0, band: "low" },
];

function bandFor(score: number): FitnessBand {
  for (const t of BAND_THRESHOLDS) if (score >= t.min) return t.band;
  return "low";
}

/** Extract a single normalized text blob covering every signal-bearing
 *  field on the profile. We lowercase upfront so word matches are
 *  case-insensitive without regex flag overhead. */
function profileTextBlob(p: ResumeProfile): string {
  const parts = [
    p.headline,
    p.summary,
    p.careerTrajectory,
    p.seniorityLevel,
    ...(p.topSkills || []),
    ...(p.keyAchievements || []),
    ...(p.industries || []),
    ...(p.interviewStrengths || []),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/** Count distinct signal terms from `terms` that appear as whole words
 *  in `blob`. Whole-word match prevents "react" matching "reactive" or
 *  "go" matching "google". */
function countSignals(blob: string, terms: string[]): number {
  let hits = 0;
  for (const term of terms) {
    // Escape regex special chars in the term
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${safe}\\b`, "i");
    if (re.test(blob)) hits++;
  }
  return hits;
}

/** Number of quantified achievements — strings containing a digit
 *  followed by %, k, m, b, x, or "users / customers / team". A rough
 *  proxy for "this resume has metrics" which interviewers love. */
function countQuantified(achievements: string[] | undefined): number {
  if (!achievements) return 0;
  const re = /\b\d+([.,]\d+)?\s*(%|k|m|b|x|users|customers|members|engineers|projects|clients|people|hrs?|hours)\b/i;
  return achievements.filter(a => re.test(a)).length;
}

/** Seniority bonus — staff/principal/lead/director profiles get a
 *  bump on behavioral and system_design (where leadership weighs
 *  more) and a small bump on technical/case. */
function seniorityBonus(seniority: string | undefined, type: InterviewType): number {
  if (!seniority) return 0;
  const s = seniority.toLowerCase();
  const isSenior = /\b(staff|principal|lead|director|vp|c-suite|head)\b/.test(s);
  if (!isSenior) return 0;
  if (type === "behavioral" || type === "system_design") return 8;
  return 4;
}

/**
 * Compute a 0–100 fitness score for a profile against an interview type.
 *
 * Composition (max 100):
 *   - Signal hits: up to 56 pts (8 distinct terms × 7 each, capped)
 *   - Quantified achievements: up to 20 pts (5 × 4 each, capped)
 *   - Seniority match: up to 8 pts
 *   - Years of experience baseline: up to 16 pts
 *
 * Rationale string is a one-liner the UI can render verbatim.
 */
export function computeResumeFitness(profile: ResumeProfile, interviewType: InterviewType): FitnessScore {
  const blob = profileTextBlob(profile);
  const signalHits = countSignals(blob, SIGNAL_TERMS[interviewType]);
  const quantified = countQuantified(profile.keyAchievements);
  const sBonus = seniorityBonus(profile.seniorityLevel, interviewType);

  const years = typeof profile.yearsExperience === "number" ? profile.yearsExperience : 0;
  const yearsScore = Math.min(16, Math.round((years / 10) * 16));

  const signalScore = Math.min(56, signalHits * 7);
  const quantScore = Math.min(20, quantified * 4);

  const raw = signalScore + quantScore + sBonus + yearsScore;
  const score = Math.max(0, Math.min(100, raw));
  const band = bandFor(score);

  let rationale = "";
  if (band === "excellent") {
    rationale = `Strong ${interviewType.replace("_", " ")} fit — ${signalHits} relevant signals, ${quantified} quantified wins.`;
  } else if (band === "good") {
    rationale = `Solid ${interviewType.replace("_", " ")} fit — ${signalHits} signals${quantified ? `, ${quantified} quantified wins` : ""}.`;
  } else if (band === "fair") {
    rationale = `Partial ${interviewType.replace("_", " ")} fit — add more ${interviewType === "behavioral" ? "leadership/impact verbs" : interviewType === "technical" ? "concrete tech keywords" : interviewType === "system_design" ? "scale/architecture details" : "metrics and outcomes"}.`;
  } else {
    rationale = `Weak ${interviewType.replace("_", " ")} fit — resume has few signals for this interview type.`;
  }

  return { score, band, rationale };
}

/** Compute fitness across every interview type at once. */
export function computeAllFitness(profile: ResumeProfile): Record<InterviewType, FitnessScore> {
  return {
    behavioral: computeResumeFitness(profile, "behavioral"),
    technical: computeResumeFitness(profile, "technical"),
    system_design: computeResumeFitness(profile, "system_design"),
    case: computeResumeFitness(profile, "case"),
  };
}
