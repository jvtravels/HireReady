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

/** Look up the expected cohort average for a given (roleFamily, skill). Returns null if unknown. */
export function getCohortAverage(roleFamily: RoleFamily | string, skillName: string): number | null {
  const fam = (ROLE_SKILL_AVERAGES as Record<string, Record<string, number>>)[roleFamily];
  if (!fam) return null;
  const avg = fam[skillName];
  return typeof avg === "number" ? avg : null;
}
