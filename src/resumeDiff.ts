/**
 * Resume version diff — compute structured deltas between two parsed
 * resume profiles. Used by the version timeline to show "what changed
 * from v3 to v4" without forcing the user to read both side-by-side.
 *
 * Pure function over two ResumeProfile values. Stable output ordering
 * so the rendered diff doesn't shimmer between renders.
 */

import type { ResumeProfile } from "./dashboardData";

export interface ResumeDiff {
  scoreDelta: number | null;            // +/- vs prior
  addedSkills: string[];
  removedSkills: string[];
  addedAchievements: string[];
  removedAchievements: string[];
  headlineChanged: boolean;
  summaryChanged: boolean;
  /** True iff every shape we compare came back identical. Useful to
   *  collapse the diff section when nothing meaningful changed. */
  isUnchanged: boolean;
}

/** Case- and whitespace-insensitive equality for short strings (skills,
 *  bullets). We don't try to be clever about word order — "TypeScript /
 *  React" and "React / TypeScript" are different strings, intentionally.
 */
function normalizeForCompare(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Set difference using normalized comparison. Returns items from `a`
 *  that don't appear in `b`, preserving original casing from `a`. */
function diffArrays(a: string[] | undefined, b: string[] | undefined): string[] {
  const aArr = Array.isArray(a) ? a : [];
  const bArr = Array.isArray(b) ? b : [];
  const bSet = new Set(bArr.map(normalizeForCompare));
  return aArr.filter(item => !bSet.has(normalizeForCompare(item)));
}

/**
 * Compute the diff from `prior` → `current`. "Added" means present in
 * `current` but not `prior`; "removed" means the opposite.
 */
export function computeResumeDiff(prior: ResumeProfile | null | undefined, current: ResumeProfile | null | undefined): ResumeDiff {
  const p = prior || ({} as Partial<ResumeProfile>);
  const c = current || ({} as Partial<ResumeProfile>);

  const priorScore = typeof p.resumeScore === "number" ? p.resumeScore : null;
  const currentScore = typeof c.resumeScore === "number" ? c.resumeScore : null;
  const scoreDelta = priorScore != null && currentScore != null ? currentScore - priorScore : null;

  const addedSkills = diffArrays(c.topSkills, p.topSkills);
  const removedSkills = diffArrays(p.topSkills, c.topSkills);
  const addedAchievements = diffArrays(c.keyAchievements, p.keyAchievements);
  const removedAchievements = diffArrays(p.keyAchievements, c.keyAchievements);

  const headlineChanged = (p.headline || "").trim() !== (c.headline || "").trim();
  const summaryChanged = (p.summary || "").trim() !== (c.summary || "").trim();

  const isUnchanged =
    (scoreDelta == null || scoreDelta === 0) &&
    addedSkills.length === 0 &&
    removedSkills.length === 0 &&
    addedAchievements.length === 0 &&
    removedAchievements.length === 0 &&
    !headlineChanged &&
    !summaryChanged;

  return {
    scoreDelta,
    addedSkills,
    removedSkills,
    addedAchievements,
    removedAchievements,
    headlineChanged,
    summaryChanged,
    isUnchanged,
  };
}
