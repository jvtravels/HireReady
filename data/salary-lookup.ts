/**
 * Salary lookup: resolves (role, company, experience, currentCity, jobCity) → compact salary context string.
 * Replaces ~2,700 tokens of hardcoded salary tables with ~100-150 tokens of targeted data.
 *
 * Distinguishes between current city (where candidate lives) and job city (where the role is based).
 * When relocating, adds relocation context (notice buyout premium, HRA adjustment, relocation allowance).
 */

import { SALARY_DATA, ROLE_ALIASES, matchRoleKey, type RoleKey, type ExperienceLevel, type SalaryEntry } from "./salaries";
import { getCompanyTier, getSalaryTierFallback, TIER_LABELS, type CompanyTier } from "./company-tiers";
import { getCityTier, CITY_MULTIPLIERS, adjustForCity, type CityTier } from "./city-tiers";

export interface SalaryLookupParams {
  role: string;
  company?: string;
  experienceLevel?: string;
  /** Where the candidate currently lives/works */
  currentCity?: string;
  /** Where the job is located (offer salary based on this) */
  jobCity?: string;
}

/** Normalize experience level string to our enum */
function normalizeExp(exp: string | undefined): ExperienceLevel {
  if (!exp) return "mid";
  const lower = exp.toLowerCase().trim();
  if (lower === "fresher" || lower === "entry" || lower === "junior" || lower === "intern") return "entry";
  if (lower === "mid" || lower === "middle" || lower === "intermediate") return "mid";
  if (lower === "senior" || lower === "sr") return "senior";
  if (lower === "lead" || lower === "staff" || lower === "principal") return "lead";
  if (lower === "executive" || lower === "vp" || lower === "director" || lower === "c-suite" || lower === "cxo") return "executive";
  return "mid";
}

const EXP_FALLBACK_ORDER: Record<ExperienceLevel, ExperienceLevel[]> = {
  entry: ["entry", "mid"],
  mid: ["mid", "entry", "senior"],
  senior: ["senior", "lead", "mid"],
  lead: ["lead", "senior", "executive"],
  executive: ["executive", "lead", "senior"],
};

const EXP_LABELS: Record<ExperienceLevel, string> = {
  entry: "Entry-level (0-2 yrs)",
  mid: "Mid-level (3-5 yrs)",
  senior: "Senior (6-10 yrs)",
  lead: "Lead/Staff (10-15 yrs)",
  executive: "Executive/VP (15+ yrs)",
};

/**
 * Look up salary entry from the structured data.
 * Tries: exact role → alias → tier fallback → adjacent experience levels
 */
function findSalaryEntry(roleKey: RoleKey, tier: CompanyTier, exp: ExperienceLevel): SalaryEntry | null {
  const roleData = SALARY_DATA[roleKey];
  if (roleData) {
    const tierData = roleData[tier];
    if (tierData) {
      for (const fallbackExp of EXP_FALLBACK_ORDER[exp]) {
        if (tierData[fallbackExp]) return tierData[fallbackExp]!;
      }
    }
    const fallbackTier = getSalaryTierFallback(tier);
    if (fallbackTier !== tier) {
      const fbTierData = roleData[fallbackTier];
      if (fbTierData) {
        for (const fallbackExp of EXP_FALLBACK_ORDER[exp]) {
          if (fbTierData[fallbackExp]) return fbTierData[fallbackExp]!;
        }
      }
    }
    if (tier !== "faang" && roleData["faang"]) {
      for (const fallbackExp of EXP_FALLBACK_ORDER[exp]) {
        if (roleData["faang"]![fallbackExp]) return roleData["faang"]![fallbackExp]!;
      }
    }
  }
  const alias = ROLE_ALIASES[roleKey];
  if (alias && alias !== roleKey) {
    return findSalaryEntry(alias, tier, exp);
  }
  if (roleKey !== "software-engineer") {
    return findSalaryEntry("software-engineer", tier, exp);
  }
  return null;
}

/** Format LPA value: "₹12" or "₹1.5 Cr" */
function fmtLPA(lpa: number): string {
  if (lpa >= 100) return `₹${(lpa / 100).toFixed(1).replace(/\.0$/, "")} Cr`;
  if (lpa >= 10) return `₹${Math.round(lpa)} LPA`;
  return `₹${lpa % 1 === 0 ? lpa : lpa.toFixed(1)} LPA`;
}

/** Format a range */
function fmtRange(min: number, max: number): string {
  if (min === 0 && max === 0) return "N/A";
  if (min === max) return fmtLPA(min);
  return `${fmtLPA(min)}-${fmtLPA(max).replace("₹", "")}`;
}

/** Determine if two cities represent a relocation scenario */
function isRelocation(currentCity: string | undefined, jobCity: string | undefined): boolean {
  if (!currentCity || !jobCity) return false;
  const a = currentCity.toLowerCase().trim();
  const b = jobCity.toLowerCase().trim();
  if (a === b) return false;
  // Same metro area
  if ((a.includes("bangalore") || a.includes("bengaluru")) && (b.includes("bangalore") || b.includes("bengaluru"))) return false;
  if ((a.includes("delhi") || a.includes("gurgaon") || a.includes("gurugram") || a.includes("noida")) &&
      (b.includes("delhi") || b.includes("gurgaon") || b.includes("gurugram") || b.includes("noida"))) return false;
  if ((a.includes("mumbai") || a.includes("bombay")) && (b.includes("mumbai") || b.includes("bombay"))) return false;
  return true;
}

/**
 * Main lookup: returns a compact salary context string (~100-180 tokens)
 * for injection into the LLM prompt.
 *
 * Salary is based on JOB CITY (where the role is), not current city.
 * When relocating, adds relocation context.
 */
export function lookupSalaryContext(params: SalaryLookupParams): string {
  const roleKey = matchRoleKey(params.role);
  const companyTier = getCompanyTier(params.company) ?? "indian-unicorn";
  const exp = normalizeExp(params.experienceLevel);

  // Salary based on JOB location (where the offer is), fallback to current city, fallback to Tier 1
  const jobCityTier = getCityTier(params.jobCity || params.currentCity);
  const currentCityTier = getCityTier(params.currentCity);
  const relocating = isRelocation(params.currentCity, params.jobCity);

  const entry = findSalaryEntry(roleKey, companyTier, exp);
  if (!entry) {
    return `No specific salary data for this role/company combination. Use general India market rates for ${EXP_LABELS[exp]}.`;
  }

  const tierLabel = TIER_LABELS[companyTier];
  const cityNote = jobCityTier !== "tier1"
    ? ` (${jobCityTier === "tier2" ? "Tier 2 city" : "Tier 3 city"}, ~${Math.round(CITY_MULTIPLIERS[jobCityTier].min * 100)}-${Math.round(CITY_MULTIPLIERS[jobCityTier].max * 100)}% of Tier 1 rates)`
    : "";

  // Apply job city multiplier (salary = where the job is)
  const adj = (v: number) => jobCityTier === "tier1" ? v : adjustForCity(v, jobCityTier);

  const parts: string[] = [];

  // Line 1: Role + Company + Level + Job City
  const locationLabel = params.jobCity
    ? params.jobCity
    : params.currentCity
    ? params.currentCity
    : tierLabel;
  parts.push(`SALARY DATA for ${params.role || roleKey} at ${params.company || tierLabel} (${tierLabel}), ${EXP_LABELS[exp]}, ${locationLabel}${cityNote}:`);

  // Line 2: Compensation breakdown
  const base = `Base: ${fmtRange(adj(entry.base_min), adj(entry.base_max))}`;
  const variable = entry.variable_min > 0 ? `Variable/Bonus: ${fmtRange(adj(entry.variable_min), adj(entry.variable_max))}` : "";
  const equity = entry.equity_type !== "none"
    ? `${entry.equity_type === "rsu" ? "RSUs" : "ESOPs"}: ${fmtRange(adj(entry.equity_annual_min), adj(entry.equity_annual_max))}/yr (${entry.equity_vesting})`
    : "";
  const total = `Total CTC: ${fmtRange(adj(entry.total_min), adj(entry.total_max))}`;

  parts.push([base, variable, equity, total].filter(Boolean).join(". ") + ".");

  // Line 3: Practical details
  const details: string[] = [];
  details.push(`In-hand: ~${Math.round(entry.in_hand_ratio * 100)}% of CTC`);
  if (entry.joining_bonus_max > 0) {
    details.push(`Joining bonus: ${fmtRange(entry.joining_bonus_min, entry.joining_bonus_max)}`);
  }
  details.push(`Notice period: ${entry.notice_period_days} days`);
  details.push(`Negotiation room: ${entry.negotiation_leverage}`);
  parts.push(details.join(". ") + ".");

  // Line 4: Hot skills premium (if any)
  if (entry.hot_skills.length > 0) {
    parts.push(`Premium skills: ${entry.hot_skills.join(", ")}.`);
  }

  // Line 5: Notes (if any)
  if (entry.notes) {
    parts.push(`Note: ${entry.notes}`);
  }

  // Line 6: Relocation context (when current city ≠ job city)
  if (relocating && params.currentCity && params.jobCity) {
    const relocParts: string[] = [];
    relocParts.push(`RELOCATION: Candidate is moving from ${params.currentCity} to ${params.jobCity}.`);

    // Relocation allowance
    relocParts.push(`Relocation allowance: ₹50K-3 LPA one-time (cross-state: up to 2 months basic salary).`);

    // Cost of living adjustment
    if (currentCityTier !== jobCityTier) {
      if (jobCityTier === "tier1" && currentCityTier !== "tier1") {
        relocParts.push(`CoL adjustment: ${params.jobCity} is a Tier 1 city — expect 15-40% higher rent/expenses vs ${params.currentCity}. Candidate should negotiate accordingly.`);
      } else if (currentCityTier === "tier1" && jobCityTier !== "tier1") {
        relocParts.push(`CoL benefit: ${params.jobCity} has lower living costs than ${params.currentCity}. Base salary may be lower but purchasing power is higher.`);
      }
    }

    // Temporary accommodation
    relocParts.push(`Companies typically offer: economy airfare for family, 15 days hotel accommodation, moving expenses.`);

    // Notice period buyout for relocation hires
    relocParts.push(`Notice buyout: Employer often pays 2x notice salary as joining bonus to accelerate the move.`);

    parts.push(relocParts.join(" "));
  }

  return parts.join("\n");
}

/**
 * Build the complete salary negotiation guidance for the LLM prompt.
 * Combines the lookup result with structural rules (equity constraints, examples).
 */
export function buildSalaryNegotiationGuidance(params: SalaryLookupParams): string {
  const salaryContext = lookupSalaryContext(params);
  const exp = normalizeExp(params.experienceLevel);

  const equityRule = exp === "entry"
    ? "EQUITY RULE: Do NOT mention equity, stock options, or ESOPs. Freshers don't get equity. Negotiate only base salary + joining bonus + benefits."
    : exp === "mid"
    ? "EQUITY RULE: Do NOT offer equity percentages. May mention ESOPs at startups by annual value only (e.g., 'ESOPs worth ₹3-5 LPA/yr vesting over 4 years'). NEVER as percentage of company."
    : exp === "senior" || exp === "lead"
    ? "EQUITY RULE: May discuss RSUs/ESOPs. Quote by annual value (₹10-60 LPA/yr). At startups: 0.05-0.5% max. NEVER more than 1%."
    : "EQUITY RULE: Equity at startups: 0.5-2% max. Public companies: RSUs by annual value. NEVER offer 5%+ — that's co-founder territory.";

  return `CRITICAL: This is a SALARY NEGOTIATION simulation, NOT a behavioral interview. Play the role of a hiring manager making/discussing an offer.
- The intro must set up: "We'd like to extend you an offer..."
- Questions must simulate real negotiation: presenting offers, salary expectations, counteroffers, competing offers, benefits/perks
- Do NOT ask behavioral STAR questions or about past projects/technical skills.
- Use Indian Rupees (₹) and LPA (Lakhs Per Annum). CTC = Cost to Company. In-hand = 65-75% of CTC.

${salaryContext}

${equityRule}
- Amazon RSUs: back-loaded 5/15/40/40 over 4 years. Google: quarterly. Indian startups: 4-year vest, 1-year cliff.
- Present CTC breakdown: Base + Bonus + RSUs/ESOPs (if applicable) + Benefits.
- The offer MUST match the candidate's level and company type.
- Typical switching hike: 20-35% lateral, 40-100% services-to-product. Annual increment avg: 9.5%.
- Joining bonus often 2x notice buyout. Companies pay 10-15% extra for candidates joining within 30 vs 90 days.

Example good: "We'd like to offer you ₹18 LPA — ₹14.5 LPA base with 10% performance bonus and standard benefits. How does that align with your expectations?"
Example bad: "We can offer $120,000." (wrong currency), "Tell me about a time you led a project." (behavioral, not negotiation), "We're offering 15% equity." (unrealistically high)`;
}

/**
 * Build compact salary context for experienceCalibration blocks.
 * Only injected for salary-negotiation and hr-round interview types.
 */
export function buildExperienceSalaryContext(params: SalaryLookupParams): string {
  if (!params.role && !params.company) return "";
  const ctx = lookupSalaryContext(params);
  return `\nSALARY CONTEXT (for reference in salary/compensation discussions):\n${ctx}`;
}
