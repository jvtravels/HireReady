/* Pure scoring logic for the employer talent-roster matching pass.
   Deterministic heuristic (role/skill token overlap + roster performance),
   not LLM-based — kept cheap and auditable for this pass. LLM-based
   re-ranking (see analyze-jd-match.ts's callLLM precedent) is a possible
   follow-up, not implemented here. */

export interface CandidatePoolRow {
  id: string;
  name: string;
  target_role: string | null;
  industry: string | null;
  resume_data: unknown;
  avg_score: number | null;
  sessions_completed: number;
  last_active_days_ago: number;
}

export interface RequirementInput {
  title: string;
  location: string;
  description: string;
}

export interface ScoredCandidate {
  candidateId: string;
  matchScore: number;
  rosterScore: number;
}

/** 0-100 read-outs for the three inputs that drive matchScore, for
    surfacing "why this score" to employers. Not persisted — recomputed
    from the same live inputs (resume, requirement) each time it's read,
    so it can drift slightly from the stored matchScore if a candidate's
    resume changed since the match was scored. That's fine for an
    explanatory breakdown; it isn't the number of record. */
export interface MatchBreakdown {
  roleMatch: number;
  skillMatch: number;
  locationMatch: number;
}

function tokenize(text: string): string[] {
  return (text || "").toLowerCase().match(/[a-z0-9+.#]+/g) || [];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function intersectionRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const t of a) if (b.has(t)) hits++;
  return hits / a.size;
}

/* resumeData is a StoredResume (see src/resumeParser.ts): fallback-type
   resumes carry a flat `skills` array, ai-type ones carry `topSkills`
   instead — read whichever the stored variant actually has. */
function extractSkills(resumeData: unknown): string[] {
  if (!resumeData || typeof resumeData !== "object") return [];
  const record = resumeData as Record<string, unknown>;
  const skills = Array.isArray(record.skills) ? record.skills : record.topSkills;
  return Array.isArray(skills) ? skills.filter((s): s is string => typeof s === "string") : [];
}

export function extractResumeLocation(resumeData: unknown): string {
  if (!resumeData || typeof resumeData !== "object") return "";
  const loc = (resumeData as Record<string, unknown>).location;
  return typeof loc === "string" ? loc : "";
}

function fitInputs(candidate: Pick<CandidatePoolRow, "target_role" | "resume_data">, req: RequirementInput) {
  const reqTokens = new Set([...tokenize(req.title), ...tokenize(req.description)]);
  const roleTokens = new Set(tokenize(candidate.target_role || ""));
  const skillTokens = new Set(extractSkills(candidate.resume_data).flatMap(tokenize));

  const roleOverlap = intersectionRatio(reqTokens, roleTokens);
  const skillOverlap = intersectionRatio(reqTokens, skillTokens);

  const reqLocation = req.location.toLowerCase();
  const candidateLocation = extractResumeLocation(candidate.resume_data).toLowerCase();
  const isRemote = reqLocation.includes("remote");
  let locationFit = 0.6; // neutral when we can't tell
  if (isRemote) {
    locationFit = 1;
  } else if (reqLocation && candidateLocation) {
    const reqLocTokens = tokenize(reqLocation);
    locationFit = reqLocTokens.some((t) => candidateLocation.includes(t)) ? 1 : 0.35;
  }

  return { roleOverlap, skillOverlap, locationFit };
}

/** Deterministic 0-100 fit score for one candidate against one requirement,
    plus the candidate's lifetime roster score (session-performance based,
    independent of this specific requirement). */
export function scoreCandidateMatch(candidate: CandidatePoolRow, req: RequirementInput): ScoredCandidate {
  const { roleOverlap, skillOverlap, locationFit } = fitInputs(candidate, req);

  const rosterScore = Math.round(clamp(candidate.avg_score ?? 50, 0, 100));
  const activityBoost = clamp(candidate.sessions_completed, 0, 10) / 10;
  const recencyPenalty = candidate.last_active_days_ago > 30 ? 0.85 : 1;

  const fitComponent = roleOverlap * 0.55 + skillOverlap * 0.3 + locationFit * 0.15;
  const matchScore = Math.round(
    clamp(fitComponent * 70 + rosterScore * 0.2 + activityBoost * 10, 0, 100) * recencyPenalty,
  );

  return { candidateId: candidate.id, matchScore: clamp(matchScore, 0, 100), rosterScore };
}

/** Human-readable 0-100 read-outs of the same three inputs scoreCandidateMatch
    weighs internally, for a "why this score" breakdown in the UI. */
export function explainMatch(candidate: Pick<CandidatePoolRow, "target_role" | "resume_data">, req: RequirementInput): MatchBreakdown {
  const { roleOverlap, skillOverlap, locationFit } = fitInputs(candidate, req);
  return {
    roleMatch: Math.round(clamp(roleOverlap, 0, 1) * 100),
    skillMatch: Math.round(clamp(skillOverlap, 0, 1) * 100),
    locationMatch: Math.round(clamp(locationFit, 0, 1) * 100),
  };
}

export type RequirementMatchStatus = "ready" | "partial" | "zero";

/** Classifies the overall requirement outcome from its scored candidates. */
export function classifyRequirementStatus(matches: Array<{ matchScore: number }>): RequirementMatchStatus {
  const strong = matches.filter((m) => m.matchScore >= 60).length;
  if (strong >= 3) return "ready";
  if (strong >= 1) return "partial";
  return "zero";
}

/** Keeps only candidates worth surfacing, ranked best first, capped so a
    requirement never returns an unbounded shortlist. */
export function rankAndCap(scored: ScoredCandidate[], cap = 20): ScoredCandidate[] {
  return scored
    .filter((s) => s.matchScore >= 40)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, cap);
}
