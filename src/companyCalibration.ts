/**
 * Company-specific interview calibration — shifts the scoring band thresholds
 * and skill-family weights based on the known style of top companies' loops.
 *
 * Calibration seeds are drawn from:
 *   - Published interview guides (Google hiring, Amazon Leadership Principles,
 *     Stripe writing bar, Meta E-levels, Netflix keeper test)
 *   - Aggregated Glassdoor / Blind interview reviews
 *   - Proprietary HireStepX session data (starts empty; grows monthly)
 *
 * Override precedence: if `target_company` matches a key below (case-insensitive,
 * normalized), that profile is applied; otherwise the default profile is used.
 */

import type { RoleFamily } from "./roleBenchmarks";

export interface CompanyProfile {
  /** Display name, e.g. "Amazon" */
  label: string;
  /**
   * Band thresholds for overall score → band mapping. The default profile uses
   * 85/70/55/40; a "hard" company pushes these higher so a 70 at Amazon is
   * only a Lean Hire, while at a Series-B startup it's a Hire.
   */
  bands: { strongHire: number; hire: number; leanHire: number; noHire: number };
  /** Skill weight multipliers by skill name. Missing skills default to 1.0. */
  skillWeights: Partial<Record<string, number>>;
  /** Role-family boosts — e.g. EM weight on People Management at Netflix. */
  roleFamilyBias: Partial<Record<RoleFamily, number>>;
  /** Short note shown inline to the candidate ("calibrated for X"). */
  note: string;
}

export const DEFAULT_PROFILE: CompanyProfile = {
  label: "Generic",
  bands: { strongHire: 85, hire: 70, leanHire: 55, noHire: 40 },
  skillWeights: {},
  roleFamilyBias: {},
  note: "Generic calibration — set a target company for role-specific scoring.",
};

export const COMPANY_PROFILES: Record<string, CompanyProfile> = {
  amazon: {
    label: "Amazon",
    // Amazon's bar raiser is notoriously hard; move thresholds up ~5pts.
    bands: { strongHire: 90, hire: 75, leanHire: 60, noHire: 42 },
    skillWeights: {
      "Ownership": 1.3,           // LP #1 Customer Obsession + Ownership
      "Impact": 1.2,              // "Deliver Results"
      "Technical Depth": 1.15,
      "Problem Framing": 1.1,
      "Influencing": 1.1,          // "Have Backbone; Disagree and Commit"
    },
    roleFamilyBias: { swe: 1.05, em: 1.1 },
    note: "Calibrated to Amazon's Bar Raiser rubric — Ownership and Deliver Results weighted heavily.",
  },
  google: {
    label: "Google",
    bands: { strongHire: 88, hire: 73, leanHire: 58, noHire: 42 },
    skillWeights: {
      "Problem Framing": 1.2,
      "Technical Depth": 1.2,
      "Communication": 1.15,       // "Googleyness + Leadership"
      "Trade-off Reasoning": 1.1,
    },
    roleFamilyBias: { swe: 1.1, data: 1.1 },
    note: "Calibrated to Google's G&L (Googleyness & Leadership) and technical bar.",
  },
  meta: {
    label: "Meta",
    bands: { strongHire: 88, hire: 72, leanHire: 58, noHire: 42 },
    skillWeights: {
      "Impact": 1.25,              // Meta's #1 signal
      "Execution": 1.15,
      "Technical Depth": 1.1,
      "Problem Framing": 1.05,
    },
    roleFamilyBias: { swe: 1.1, pm: 1.1 },
    note: "Calibrated to Meta's signal-based E-level rubric — Impact above all.",
  },
  stripe: {
    label: "Stripe",
    bands: { strongHire: 87, hire: 72, leanHire: 57, noHire: 42 },
    skillWeights: {
      "Communication": 1.3,        // writing culture
      "Problem Framing": 1.15,
      "Ownership": 1.1,
      "Technical Depth": 1.1,
      "Customer Focus": 1.05,
    },
    roleFamilyBias: { swe: 1.05, pm: 1.1 },
    note: "Calibrated to Stripe's high writing and clarity bar.",
  },
  netflix: {
    label: "Netflix",
    bands: { strongHire: 90, hire: 76, leanHire: 62, noHire: 45 },
    skillWeights: {
      "Impact": 1.3,
      "Ownership": 1.2,
      "Influencing": 1.15,         // "Keeper test" — candor
      "Execution": 1.1,
    },
    roleFamilyBias: { em: 1.15, swe: 1.05 },
    note: "Calibrated to Netflix's keeper-test standard — senior by default.",
  },
  microsoft: {
    label: "Microsoft",
    bands: { strongHire: 86, hire: 71, leanHire: 56, noHire: 40 },
    skillWeights: {
      "Technical Depth": 1.15,
      "Problem Framing": 1.1,
      "Communication": 1.1,
      "Impact": 1.1,
    },
    roleFamilyBias: {},
    note: "Calibrated to Microsoft's Growth Mindset + technical rubric.",
  },
  apple: {
    label: "Apple",
    bands: { strongHire: 88, hire: 73, leanHire: 58, noHire: 42 },
    skillWeights: {
      "Technical Depth": 1.2,
      "Problem Framing": 1.15,
      "Customer Focus": 1.15,
      "Ownership": 1.1,
    },
    roleFamilyBias: { swe: 1.1, data: 1.05 },
    note: "Calibrated to Apple's craft + secrecy culture — depth over breadth.",
  },
  // Friendly-bar catch-alls for smaller / earlier-stage companies
  "series-b": {
    label: "Series-B Startup",
    bands: { strongHire: 80, hire: 65, leanHire: 50, noHire: 35 },
    skillWeights: {
      "Ownership": 1.2,
      "Execution": 1.15,
      "Impact": 1.1,
    },
    roleFamilyBias: {},
    note: "Calibrated to a Series-B growth-stage startup — bias toward ownership and execution.",
  },
  "early-stage": {
    label: "Early-Stage Startup",
    bands: { strongHire: 78, hire: 62, leanHire: 48, noHire: 32 },
    skillWeights: {
      "Ownership": 1.25,
      "Execution": 1.2,
    },
    roleFamilyBias: {},
    note: "Calibrated to seed / Series-A — friendlier bar, scrappy ownership prized.",
  },
};

const COMPANY_ALIASES: Record<string, string> = {
  // Canonicalize common variants to the profile keys above.
  "aws":         "amazon",
  "amzn":        "amazon",
  "google inc":  "google",
  "alphabet":    "google",
  "facebook":    "meta",
  "fb":          "meta",
  "msft":        "microsoft",
  "ms":          "microsoft",
  "nflx":        "netflix",
  "seriesb":     "series-b",
  "earlystage":  "early-stage",
  "startup":     "early-stage",
};

/** Normalize a target-company string → a profile key, or null for default. */
export function matchCompanyProfile(targetCompany: string | null | undefined): CompanyProfile {
  if (!targetCompany) return DEFAULT_PROFILE;
  const normalized = String(targetCompany).toLowerCase().replace(/[^a-z0-9-]/g, "").trim();
  if (!normalized) return DEFAULT_PROFILE;
  const direct = COMPANY_PROFILES[normalized];
  if (direct) return direct;
  const aliased = COMPANY_ALIASES[normalized];
  if (aliased && COMPANY_PROFILES[aliased]) return COMPANY_PROFILES[aliased];
  // Substring match for partials like "amazon-aws-onsite"
  for (const key of Object.keys(COMPANY_PROFILES)) {
    if (normalized.includes(key)) return COMPANY_PROFILES[key];
  }
  return DEFAULT_PROFILE;
}

/** Score → band, using company-specific thresholds. */
export function bandForScore(
  score: number,
  profile: CompanyProfile,
): "strongHire" | "hire" | "leanHire" | "noHire" | "strongNoHire" {
  const b = profile.bands;
  if (score >= b.strongHire) return "strongHire";
  if (score >= b.hire) return "hire";
  if (score >= b.leanHire) return "leanHire";
  if (score >= b.noHire) return "noHire";
  return "strongNoHire";
}

/** Apply company weights to a skills array and return the weighted composite. */
export function applyCompanyWeights(
  skills: Array<{ name: string; score: number }>,
  profile: CompanyProfile,
  roleFamily: RoleFamily,
): { weightedSkills: Array<{ name: string; score: number; weight: number }>; composite: number } {
  const famBias = profile.roleFamilyBias[roleFamily] ?? 1.0;
  const weighted = skills.map((s) => ({
    name: s.name,
    score: s.score,
    weight: (profile.skillWeights[s.name] ?? 1.0) * famBias,
  }));
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0) || 1;
  const composite = weighted.reduce((sum, w) => sum + w.score * w.weight, 0) / totalWeight;
  return { weightedSkills: weighted, composite: Math.round(composite) };
}
