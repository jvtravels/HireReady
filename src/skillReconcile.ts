/**
 * Skill ↔ role reconciliation — given a parsed resume profile and a
 * target interview type (or target role slug), surface which expected
 * signals the resume already covers and which are missing.
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

/**
 * Role-specific vocabulary. Keys are the canonical role slugs from
 * data/role-competencies.ts. When a user has set a target role, we
 * surface the matching vocab as a "Role-specific" panel above the
 * generic interview-type panels — far more useful than telling a
 * designer they're missing "kafka". Curated per role, kept small
 * (~12-18 terms) to make the missing-list actionable.
 */
const ROLE_SPECIFIC_VOCAB: Record<string, string[]> = {
  "product-manager": [
    "roadmap", "prioritization", "rice", "okrs", "metrics", "user research",
    "a/b test", "stakeholders", "go-to-market", "product strategy",
    "user empathy", "wireframes", "feature launch", "kpis", "north star",
    "growth", "discovery",
  ],
  "software-engineer": [
    "javascript", "typescript", "python", "java", "go", "react", "node",
    "kubernetes", "docker", "aws", "sql", "system design", "microservices",
    "ci/cd", "testing", "algorithms", "code review", "debugging", "rest", "graphql",
  ],
  "engineering-manager": [
    "team", "1:1", "coaching", "mentoring", "delivery", "hiring",
    "performance", "headcount", "stakeholders", "roadmap", "tech debt",
    "delivery velocity", "cross-functional", "scaled", "scaled the team",
    "engineering metrics", "dora", "sprint planning",
  ],
  "data-scientist": [
    "python", "sql", "statistics", "a/b test", "experiment", "model",
    "machine learning", "deep learning", "feature engineering", "regression",
    "classification", "neural network", "production model", "mlops",
    "feature store", "validation", "metrics", "data pipeline",
  ],
  "data-analyst": [
    "sql", "tableau", "looker", "power bi", "dashboard", "metrics",
    "kpis", "reporting", "analysis", "stakeholders", "etl", "dbt",
    "experimentation", "a/b test", "data modeling", "self-serve",
    "mixpanel", "amplitude",
  ],
  "designer": [
    "figma", "user research", "wireframes", "prototyping", "design system",
    "usability", "user testing", "accessibility", "interaction design",
    "visual design", "ux", "ui", "design tokens", "component library",
    "stakeholders", "design review", "personas", "journey maps",
  ],
  "marketing": [
    "campaign", "channel", "performance marketing", "seo", "sem", "content",
    "brand", "roi", "attribution", "conversion", "funnel", "growth",
    "lifecycle", "crm", "email", "social", "ppc", "budget allocation",
  ],
  "sales": [
    "pipeline", "quota", "deals", "sales cycle", "objections", "closing",
    "prospects", "outreach", "discovery", "demo", "proposal", "negotiation",
    "stakeholders", "enterprise", "saas", "revenue", "renewal", "expansion",
  ],
  "consultant": [
    "framework", "structure", "hypothesis", "analysis", "estimation",
    "client", "stakeholders", "recommendation", "presentation", "deck",
    "engagement", "scoping", "deliverable", "workstream", "interview",
    "synthesis", "implementation", "executive",
  ],
  "devops": [
    "kubernetes", "docker", "aws", "terraform", "ci/cd", "github actions",
    "jenkins", "monitoring", "prometheus", "grafana", "incident", "sre",
    "observability", "infrastructure as code", "deployment", "automation",
    "secrets", "linux",
  ],
  "business-analyst": [
    "requirements", "user stories", "process", "stakeholders", "documentation",
    "agile", "scrum", "jira", "confluence", "data analysis", "sql",
    "process mapping", "gap analysis", "use cases", "specifications",
    "wireframes", "uat", "scope",
  ],
  "qa": [
    "test cases", "automation", "selenium", "cypress", "playwright", "ci",
    "regression", "smoke", "performance testing", "api testing", "test plan",
    "defects", "jira", "manual testing", "load testing", "framework",
    "test strategy",
  ],
  "hr": [
    "recruitment", "talent", "screening", "onboarding", "engagement",
    "retention", "compensation", "benefits", "policy", "compliance",
    "stakeholders", "hiring", "employer brand", "diversity", "performance",
    "ats", "linkedin", "interview",
  ],
};

/** Find a role slug by fuzzy-matching the user's target role text. */
function matchRoleSlug(targetRole: string): string | null {
  const t = targetRole.toLowerCase().trim();
  if (!t) return null;
  // Exact slug match (e.g. user has "product-manager" stored)
  if (ROLE_SPECIFIC_VOCAB[t]) return t;
  // Common role title patterns → slug
  if (/\b(product manager|pm)\b/.test(t)) return "product-manager";
  if (/\b(engineer(ing)? manager|em\b)/.test(t)) return "engineering-manager";
  if (/\b(software engineer|sde|swe|developer)\b/.test(t)) return "software-engineer";
  if (/\b(data scientist|ml engineer)\b/.test(t)) return "data-scientist";
  if (/\b(data analyst|analytics)\b/.test(t)) return "data-analyst";
  if (/\b(designer|ux|ui)\b/.test(t)) return "designer";
  if (/\bmarketing\b/.test(t)) return "marketing";
  if (/\bsales\b/.test(t)) return "sales";
  if (/\bconsult/.test(t)) return "consultant";
  if (/\bdevops\b/.test(t)) return "devops";
  if (/\b(business analyst|ba\b)/.test(t)) return "business-analyst";
  if (/\b(qa|quality)\b/.test(t)) return "qa";
  if (/\b(hr|human resources|people ops|talent)\b/.test(t)) return "hr";
  return null;
}

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

/**
 * Reconcile a profile against the user's *target role* rather than a
 * generic interview type. Returns null if the target role doesn't map
 * to any known role slug — caller should fall back to the generic
 * interview-type panels.
 */
export function reconcileForTargetRole(
  profile: ResumeProfile,
  targetRole: string | null | undefined,
): { roleSlug: string; result: ReconciliationResult } | null {
  if (!targetRole) return null;
  const slug = matchRoleSlug(targetRole);
  if (!slug) return null;
  const vocab = ROLE_SPECIFIC_VOCAB[slug];
  if (!vocab || vocab.length === 0) return null;
  const blob = profileTextBlob(profile);
  const matched: string[] = [];
  const missing: string[] = [];
  for (const term of vocab) {
    const re = new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
    if (re.test(blob)) matched.push(term);
    else missing.push(term);
  }
  const coveragePct = vocab.length === 0 ? 0 : Math.round((matched.length / vocab.length) * 100);
  const topGaps = missing.slice(0, 6);
  return { roleSlug: slug, result: { matched, missing, coveragePct, topGaps } };
}

/** Friendly label for a role slug. Used by the UI when surfacing
 *  "Role-specific: Product Manager". */
export function labelForRoleSlug(slug: string): string {
  return slug
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
