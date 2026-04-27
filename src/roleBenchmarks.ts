/**
 * Static cohort averages per role-family skill.
 * These are seed priors, calibrated to structured-interview literature
 * (average mock-interview scores 45-65). They will be replaced with
 * rolling-window real-user aggregates in V2 via a scheduled job.
 *
 * Keyed by the same skill names produced by the LLM evaluator
 * in server-handlers/evaluate-session.ts (ROLE_SKILLS constant).
 */

export type RoleFamily = "swe" | "pm" | "em" | "data" | "behavioral";

export const ROLE_SKILL_AVERAGES: Record<RoleFamily, Record<string, number>> = {
  swe: {
    "Problem Framing": 54,
    "Technical Depth": 58,
    "Trade-off Reasoning": 49,
    "Communication": 56,
    "Ownership": 52,
  },
  pm: {
    "Product Sense": 55,
    "Analytical": 53,
    "Execution": 57,
    "Influencing": 48,
    "Customer Focus": 59,
  },
  em: {
    "Strategic Thinking": 52,
    "People Management": 58,
    "Execution": 57,
    "Communication": 60,
    "Conflict Handling": 49,
  },
  data: {
    "Analytical": 61,
    "Technical Depth": 57,
    "Business Impact": 48,
    "Communication": 54,
    "Ownership": 52,
  },
  behavioral: {
    "Structure": 50,
    "Ownership": 55,
    "Impact": 48,
    "Communication": 58,
    "Composure": 61,
  },
};

/** Look up the SEED (fallback) cohort average for a given (roleFamily, skill). Returns null if unknown. */
export function getCohortAverage(roleFamily: RoleFamily | string, skillName: string): number | null {
  const fam = (ROLE_SKILL_AVERAGES as Record<string, Record<string, number>>)[roleFamily];
  if (!fam) return null;
  const avg = fam[skillName];
  return typeof avg === "number" ? avg : null;
}

/* ─── Live cohort averages — replaces seed data once we have ≥5 sessions per skill ──
 *
 * fetchLiveCohort() hits /api/cohort-averages, which aggregates the last 60
 * days of real session.skill_scores. Cached client-side for the page lifetime
 * (cohorts don't move minute-to-minute). Falls back to seed averages when
 * the live sample is too small or the request fails.
 */

export interface LiveCohort {
  byName: Record<string, { avg: number; n: number }>;
  totalSessions: number;
  lastUpdated: string;
}

let LIVE_COHORT_PROMISE: Promise<LiveCohort | null> | null = null;

export function fetchLiveCohort(): Promise<LiveCohort | null> {
  // Single in-flight request shared across components — avoids a thundering
  // herd when SkillBar instances all ask for cohort data on first render.
  if (LIVE_COHORT_PROMISE) return LIVE_COHORT_PROMISE;
  LIVE_COHORT_PROMISE = (async () => {
    try {
      const res = await fetch("/api/cohort-averages", { method: "GET" });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || typeof data !== "object" || !data.byName) return null;
      return data as LiveCohort;
    } catch {
      return null;
    }
  })();
  return LIVE_COHORT_PROMISE;
}

/**
 * Resolve a (roleFamily, skill) cohort average. Prefers live aggregates with
 * a sample size threshold; falls back to seed priors otherwise. The returned
 * object includes `live` and `n` so the UI can show "+12 vs avg (n=247)" or
 * suppress it when the sample is unreliable.
 */
export function resolveCohort(
  liveCohort: LiveCohort | null,
  roleFamily: RoleFamily | string,
  skillName: string,
  minSample = 25,
): { avg: number; n: number; live: boolean } | null {
  const live = liveCohort?.byName?.[skillName];
  if (live && live.n >= minSample) {
    return { avg: live.avg, n: live.n, live: true };
  }
  const seed = getCohortAverage(roleFamily, skillName);
  if (seed === null) return null;
  return { avg: seed, n: 0, live: false };
}
