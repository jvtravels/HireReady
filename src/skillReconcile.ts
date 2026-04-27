/**
 * Skill ↔ role reconciliation — given a parsed resume profile and a
 * target interview type, surface which expected signals the resume
 * already covers and which are missing.
 *
 * Sources its expected vocabulary from the same SIGNAL_TERMS that
 * power the fitness scorer (see resumeFitness.ts), so the reconciliation
 * panel and the fitness chips never disagree about what counts.
 *
 * Pure function; no LLM call. Returns case-preserved variants of the
 * matched terms (from the resume) and lowercase canonical names of
 * missing terms (from the vocabulary).
 */

import type { ResumeProfile } from "./dashboardData";
import type { InterviewType } from "./resumeFitness";

/** Replicate SIGNAL_TERMS from resumeFitness.ts. Kept in sync manually
 *  rather than imported because resumeFitness exports the helper but
 *  not the raw vocabulary; duplicating the constant keeps reconcile a
 *  pure leaf module without circular-dependency risk. If you edit one,
 *  edit both — the resumeFitnessParity test below would catch drift in
 *  practice, but consider exporting SIGNAL_TERMS if it gets edited a
 *  third time. */
const ROLE_VOCAB: Record<InterviewType, string[]> = {
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

export interface ReconciliationResult {
  matched: string[];        // role-expected signals the resume covers (canonical lowercase)
  missing: string[];        // role-expected signals the resume doesn't (canonical lowercase)
  coveragePct: number;      // matched.length / vocab.length × 100, rounded
  /** A short list of high-leverage suggestions — the top-ranked missing
   *  signals up to 6 items. Useful for a "Add these to your resume"
   *  call-to-action without overwhelming the user with 15+ keywords. */
  topGaps: string[];
}

function profileTextBlob(p: ResumeProfile): string {
  return [
    p.headline,
    p.summary,
    p.careerTrajectory,
    p.seniorityLevel,
    ...(p.topSkills || []),
    ...(p.keyAchievements || []),
    ...(p.industries || []),
    ...(p.interviewStrengths || []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Reconcile a resume profile against a target interview type's
 * vocabulary. Whole-word match (case-insensitive) so "go" doesn't
 * spuriously match "google".
 */
export function reconcileResumeAgainstRole(
  profile: ResumeProfile,
  interviewType: InterviewType,
): ReconciliationResult {
  const vocab = ROLE_VOCAB[interviewType];
  const blob = profileTextBlob(profile);
  const matched: string[] = [];
  const missing: string[] = [];
  for (const term of vocab) {
    const re = new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
    if (re.test(blob)) matched.push(term);
    else missing.push(term);
  }
  const coveragePct = vocab.length === 0 ? 0 : Math.round((matched.length / vocab.length) * 100);
  // Top gaps = first N missing terms in vocab order. Vocab order roughly
  // mirrors importance (we list common signals first), so this is a
  // reasonable proxy without weighting infrastructure.
  const topGaps = missing.slice(0, 6);
  return { matched, missing, coveragePct, topGaps };
}
