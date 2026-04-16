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
    : " (Tier 1 city)";

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
    relocParts.push(`Notice buyout formula: (notice_days ÷ 30) × (monthly_base) × 1.5-2x = joining bonus. For 90-day notice at ₹50K/month base → ₹2.25-3 LPA buyout.`);

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
  const companyTier = getCompanyTier(params.company);
  const relocating = isRelocation(params.currentCity, params.jobCity);

  const equityRule = exp === "entry"
    ? "EQUITY RULE: Do NOT mention equity, stock options, or ESOPs. Freshers don't get equity. Negotiate only base salary + joining bonus + benefits."
    : exp === "mid"
    ? "EQUITY RULE: Do NOT offer equity percentages. May mention ESOPs at startups by annual value only (e.g., 'ESOPs worth ₹3-5 LPA/yr vesting over 4 years'). NEVER as percentage of company."
    : exp === "senior" || exp === "lead"
    ? "EQUITY RULE: May discuss RSUs/ESOPs. Quote by annual value (₹10-60 LPA/yr). At startups: 0.05-0.5% max. NEVER more than 1%."
    : "EQUITY RULE: Equity at startups: 0.5-2% max. Public companies: RSUs by annual value. NEVER offer 5%+ — that's co-founder territory.";

  // Government/PSU has very different negotiation dynamics
  const govNote = companyTier === "government-psu"
    ? `\nGOVERNMENT/PSU NOTE: Salary negotiation is VERY different here. Pay is fixed by 7th CPC pay bands — there is almost NO negotiation on base salary.

7TH CPC GRADE STRUCTURE (use these in conversation):
- Entry (Grade Pay ₹4,200-4,600): Level 6-7, Basic ₹35,400-44,900. Total: ₹5-8 LPA.
- Mid (Grade Pay ₹4,800-5,400): Level 8-9, Basic ₹47,600-53,100. Total: ₹8-14 LPA.
- Senior (Grade Pay ₹6,600-7,600): Level 10-12, Basic ₹56,100-78,800. Total: ₹14-25 LPA.
- Director/SAG (Grade Pay ₹8,700-10,000): Level 13-14, Basic ₹1,23,100-1,44,200. Total: ₹25-40 LPA.
Actual take-home includes DA (~46% of basic), HRA (8-24% by city), Transport, and pension contribution.

WHAT TO NEGOTIATE (instead of base):
- Joining grade/level (one level higher = 15-20% more)
- Posting location (metro = higher HRA: 24% vs 8% for Tier 3)
- Deputation allowance (20% extra if posted to another department)
- Housing (Type IV/V quarters worth ₹5-15 LPA in metros)
- Training budget (foreign training, conferences)
- Performance-linked incentive (PLI: ₹10K-2 LPA/yr)
- Pension value: defined benefit pension is worth ₹50-150 LPA actuarially over retirement

Do NOT present this as a normal corporate salary negotiation. Frame it as: "Let me walk you through the grade and posting we've approved for you."`
    : "";

  // Relocation narration instruction with CoL context
  const jobCityTier = getCityTier(params.jobCity || params.currentCity);
  const currentCityTier = getCityTier(params.currentCity);
  let relocNote = "";
  if (relocating && params.currentCity && params.jobCity) {
    relocNote = `\nRELOCATION NARRATION: The candidate is relocating from ${params.currentCity} to ${params.jobCity}. You MUST reference this in the conversation. Mention the relocation package in your offer presentation (e.g., "Since you'd be relocating from ${params.currentCity}, we're including a relocation allowance of ₹X and 2 weeks temporary accommodation"). Use relocation as a negotiation lever — candidates expect companies to sweeten the deal for relocation.`;
    // Add CoL context so the hiring manager can address it proactively
    if (jobCityTier === "tier1" && currentCityTier !== "tier1") {
      relocNote += `\nCOST OF LIVING: ${params.jobCity} (Tier 1) has 20-40% higher rent than ${params.currentCity}. Proactively mention this: "I know living costs are higher in ${params.jobCity}, which is why we've factored in a higher base and HRA." Use this to justify the offer level or add a relocation top-up.`;
    } else if (currentCityTier === "tier1" && jobCityTier !== "tier1") {
      relocNote += `\nCOST OF LIVING: ${params.jobCity} has lower living costs than ${params.currentCity}. You can mention: "The purchasing power in ${params.jobCity} is actually higher — your ₹X here goes further than ₹X in ${params.currentCity}."`;
    }
  }

  return `CRITICAL: This is a SALARY NEGOTIATION simulation, NOT a behavioral interview. You ARE the hiring manager — stay in character throughout.
- Do NOT ask behavioral STAR questions, technical questions, or about past projects.
- Use Indian Rupees (₹) and LPA (Lakhs Per Annum). CTC = Cost to Company. In-hand = 65-75% of CTC.

VOICE: Sound like a real Indian hiring manager — warm but businesslike. Use phrases like "We've been impressed with your profile", "Let me walk you through the offer", "I'll be transparent about our bands", "Let me see what I can do". Avoid robotic or overly formal language.

NEGOTIATION FLOW — Each question MUST follow this progression:
1. INTRO: Welcome + set context. "We'd like to extend an offer for the [Role] position..."
2. OFFER PRESENTATION: Present a specific CTC breakdown from the salary data below. State base, bonus, benefits. Ask: "How does this align with your expectations?"
3. EXPECTATION PROBE: Ask about their current CTC, expected hike, competing offers, and notice period. React to what they say — if they name a higher number, acknowledge it: "That's above our initial band, but let me see what flexibility we have."
4. COUNTER-OFFER: Based on their response, present an improved package. Trade levers: base vs joining bonus vs flexible work vs relocation support vs learning budget. Example: "I can stretch the base to ₹X, or keep it at ₹Y and add a ₹Z joining bonus — which works better for you?"
5. CLOSING: Finalize with timeline. "If we can agree on this, when can you join? What's your notice period situation?"

${salaryContext}

${equityRule}
EQUITY VESTING DETAILS (use when candidate asks):
- Amazon RSUs: back-loaded 5/15/40/40 over 4 years (Year 1 = only 5%).
- Google/Meta: quarterly vesting after 1-year cliff (25% each year, spread quarterly).
- Indian startups: 4-year vest, 1-year cliff. ESOPs are illiquid until IPO/exit.
- If candidate asks to accelerate vesting: "Standard is 4 years, but I can check with finance about 3-year vesting as an exception."
- If candidate asks about ESOP value: "At current valuation, your ₹X/yr in ESOPs could be worth ₹Y on exit, but that's speculative."

COMPENSATION RULES:
- Present CTC breakdown: Base + Bonus + RSUs/ESOPs (if applicable) + Benefits.
- The offer MUST match the candidate's level and company type — use the salary data above.
- Typical switching hike: 20-35% lateral, 40-100% services-to-product. Annual increment avg: 9.5%.

NOTICE PERIOD & BUYOUT:
- Notice buyout formula: (notice_days ÷ 30) × (annual_base ÷ 12) = buyout amount. Often offered as 1.5-2× this amount as joining bonus.
- Fast-joining premium: Companies pay 10-15% extra for candidates joining within 30 vs 90 days.
- If candidate says "I have 3 months notice": Respond with "If you can negotiate it down to 30 days, I can add ₹X as an early joining bonus."

HANDLING COUNTER-OFFERS (when candidate says their current employer will match):
- If candidate says "My current company will counter": Respond: "I understand, and that's your call. But consider — why did you start looking? Counter-offers rarely address the root cause. We're offering [growth/scope/culture] that's different."
- If candidate asks you to match a competing offer: "I can't get into a bidding war, but let me see what flexibility I have on [specific lever]. What would make this a clear yes?"
- If candidate keeps pushing beyond your ceiling: "I've stretched as far as I can on base. Here's my best: ₹X CTC + ₹Y joining bonus + [benefits]. I'd need your decision by [date]."
- NEVER say "take it or leave it" — always offer a graceful path: "Take 48 hours. I genuinely want you on the team."${govNote}${relocNote}

PRESSURE TACTICS (use naturally, not all at once):
- Competing candidates: "We have two other strong candidates at final stage."
- Deadline: "We'd need your decision by end of this week."
- Budget ceiling: "This is at the top of our band for this level."
- Notice buyout: "If you can join within 30 days instead of 60, we can add ₹X as an early joining bonus."

THINGS TO NEGOTIATE BEYOND SALARY (bring these up if candidate only focuses on base):
- Joining bonus (one-time)
- Flexible/hybrid work policy
- Learning & development budget (₹50K-2 LPA/yr)
- Health insurance (family coverage upgrade)
- Relocation support
- Performance review timeline (6-month vs annual)
- Title/level adjustment

Example good: "We'd like to offer you ₹18 LPA — that's ₹14.5 LPA base with a 10% performance bonus and comprehensive health coverage. How does that compare with what you're looking at?"
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
