/**
 * Structured salary data for Indian job market (2025-26).
 * Indexed by: roleKey → companyTier → experienceLevel
 *
 * All figures in LPA (Lakhs Per Annum). City adjustments applied at lookup time.
 * Sources: Levels.fyi, AmbitionBox, Glassdoor India, CaseBasix, HelloPM
 * Full source list: docs/india-salary-research-2025-26.md
 */

import type { CompanyTier } from "./company-tiers";

export type ExperienceLevel = "entry" | "mid" | "senior" | "lead" | "executive";

export interface SalaryEntry {
  base_min: number;
  base_max: number;
  variable_min: number;
  variable_max: number;
  equity_type: "none" | "esop" | "rsu" | "phantom";
  equity_annual_min: number;  // LPA equivalent
  equity_annual_max: number;
  equity_vesting: string;
  total_min: number;
  total_max: number;
  in_hand_ratio: number;      // 0.60 – 0.76
  joining_bonus_min: number;
  joining_bonus_max: number;
  notice_period_days: number;
  negotiation_leverage: "low" | "medium" | "high";
  hot_skills: string[];
  notes?: string;
}

export type RoleKey =
  | "software-engineer" | "product-manager" | "engineering-manager"
  | "data-scientist" | "data-analyst" | "data-engineer"
  | "ml-engineer" | "ai-engineer"
  | "ux-designer" | "marketing" | "sales"
  | "consultant" | "devops-sre" | "cloud-engineer"
  | "business-analyst" | "program-manager" | "project-manager"
  | "qa-engineer" | "hr" | "finance"
  | "content-writer" | "cybersecurity" | "blockchain"
  | "legal" | "operations" | "customer-success"
  | "teacher" | "mobile-developer" | "frontend-developer" | "backend-developer";

/** Helper to create a salary entry with defaults */
function s(
  base: [number, number], variable: [number, number],
  equity: { type: SalaryEntry["equity_type"]; min: number; max: number; vest: string },
  total: [number, number],
  opts: Partial<Pick<SalaryEntry, "in_hand_ratio" | "joining_bonus_min" | "joining_bonus_max" | "notice_period_days" | "negotiation_leverage" | "hot_skills" | "notes">> = {}
): SalaryEntry {
  return {
    base_min: base[0], base_max: base[1],
    variable_min: variable[0], variable_max: variable[1],
    equity_type: equity.type, equity_annual_min: equity.min, equity_annual_max: equity.max, equity_vesting: equity.vest,
    total_min: total[0], total_max: total[1],
    in_hand_ratio: opts.in_hand_ratio ?? 0.68,
    joining_bonus_min: opts.joining_bonus_min ?? 0, joining_bonus_max: opts.joining_bonus_max ?? 0,
    notice_period_days: opts.notice_period_days ?? 30,
    negotiation_leverage: opts.negotiation_leverage ?? "medium",
    hot_skills: opts.hot_skills ?? [],
    notes: opts.notes,
  };
}

const NO_EQ = { type: "none" as const, min: 0, max: 0, vest: "N/A" };
const ESOP = (min: number, max: number, vest = "4-year vest, 1-year cliff") => ({ type: "esop" as const, min, max, vest });
const RSU = (min: number, max: number, vest = "4-year vest, quarterly") => ({ type: "rsu" as const, min, max, vest });

// ═══════════════════════════════════════════════════════════════
// Salary tables by role → company tier → experience
// ═══════════════════════════════════════════════════════════════

type SalaryTable = Partial<Record<CompanyTier, Partial<Record<ExperienceLevel, SalaryEntry>>>>;

export const SALARY_DATA: Partial<Record<RoleKey, SalaryTable>> = {

  // ─── SOFTWARE ENGINEER ────────────────────────────────────────
  "software-engineer": {
    faang: {
      entry: s([20, 28], [1, 3], RSU(3, 8, "quarterly after 1-year cliff"), [25, 40], { joining_bonus_min: 0, joining_bonus_max: 5, notice_period_days: 30, negotiation_leverage: "low", hot_skills: ["System Design", "DSA", "GenAI/LLM"], notes: "L3/E3 level. RSUs are modest at entry — bulk of comp is base." }),
      mid: s([40, 50], [3, 5], RSU(15, 30), [60, 80], { joining_bonus_min: 5, joining_bonus_max: 15, negotiation_leverage: "medium", hot_skills: ["System Design", "Distributed Systems", "GenAI"] }),
      senior: s([55, 70], [5, 10], RSU(35, 70), [90, 150], { joining_bonus_min: 5, joining_bonus_max: 15, notice_period_days: 60, negotiation_leverage: "high", hot_skills: ["ML Systems", "Platform Engineering", "Staff-level scope"] }),
      lead: s([70, 90], [10, 25], RSU(70, 150), [150, 250], { joining_bonus_min: 10, joining_bonus_max: 25, notice_period_days: 60, negotiation_leverage: "high" }),
      executive: s([80, 100], [15, 30], RSU(150, 300), [280, 400], { in_hand_ratio: 0.55, joining_bonus_min: 15, joining_bonus_max: 30, notice_period_days: 90, negotiation_leverage: "high" }),
    },
    "indian-unicorn": {
      entry: s([12, 20], [1, 2], ESOP(2, 5), [16, 26], { notice_period_days: 30, negotiation_leverage: "medium", hot_skills: ["React", "Node.js", "Go", "System Design"] }),
      mid: s([22, 35], [2, 4], ESOP(3, 8), [28, 45], { joining_bonus_min: 1, joining_bonus_max: 5, negotiation_leverage: "medium" }),
      senior: s([35, 50], [4, 8], ESOP(8, 15), [45, 70], { joining_bonus_min: 2, joining_bonus_max: 8, notice_period_days: 60, negotiation_leverage: "high" }),
      lead: s([50, 65], [6, 12], ESOP(10, 25), [65, 95], { notice_period_days: 60, negotiation_leverage: "high" }),
    },
    "it-services": {
      entry: s([3.5, 7], [0.2, 0.5], NO_EQ, [3.5, 9], { in_hand_ratio: 0.74, notice_period_days: 90, negotiation_leverage: "low", notes: "TCS Digital/Infosys SP: ₹7-11 LPA" }),
      mid: s([6, 14], [0.5, 1.5], NO_EQ, [6, 15], { notice_period_days: 90, negotiation_leverage: "low" }),
      senior: s([12, 22], [1, 3], NO_EQ, [12, 25], { notice_period_days: 90, negotiation_leverage: "medium" }),
      lead: s([18, 30], [2, 4], NO_EQ, [20, 35], { notice_period_days: 90, negotiation_leverage: "medium" }),
    },
    "startup-growth": {
      entry: s([5, 10], [0.5, 1], ESOP(1, 3), [6, 14], { notice_period_days: 15, negotiation_leverage: "medium", hot_skills: ["Full-stack", "DevOps", "GenAI"] }),
      mid: s([12, 22], [1, 3], ESOP(2, 5), [15, 28], { notice_period_days: 30, negotiation_leverage: "medium" }),
      senior: s([22, 40], [3, 6], ESOP(5, 12), [28, 55], { notice_period_days: 30, negotiation_leverage: "high" }),
      lead: s([35, 55], [5, 10], ESOP(8, 20), [45, 80], { notice_period_days: 30, negotiation_leverage: "high" }),
    },
    "startup-early": {
      entry: s([4, 8], [0, 0.5], ESOP(0.5, 2), [5, 10], { notice_period_days: 15, negotiation_leverage: "medium" }),
      mid: s([8, 16], [0.5, 2], ESOP(2, 5), [10, 22], { notice_period_days: 15, negotiation_leverage: "high" }),
      senior: s([16, 30], [2, 4], ESOP(5, 15), [22, 45], { notice_period_days: 30, negotiation_leverage: "high" }),
    },
    "bfsi-global": {
      entry: s([18, 25], [2, 5], RSU(3, 8), [22, 35], { notice_period_days: 60, negotiation_leverage: "medium" }),
      mid: s([28, 40], [5, 10], RSU(8, 15), [38, 60], { negotiation_leverage: "medium" }),
      senior: s([45, 65], [10, 20], RSU(15, 30), [65, 100], { notice_period_days: 90, negotiation_leverage: "medium" }),
    },
    "consulting-big4": {
      entry: s([8, 14], [1, 2], NO_EQ, [9, 16], { notice_period_days: 30, negotiation_leverage: "low" }),
      mid: s([14, 22], [2, 4], NO_EQ, [16, 26], { negotiation_leverage: "medium" }),
      senior: s([22, 35], [3, 6], NO_EQ, [25, 40], { negotiation_leverage: "medium" }),
    },
    "saas-product": {
      entry: s([8, 18], [1, 2], ESOP(1, 3), [10, 22], { notice_period_days: 30, negotiation_leverage: "medium", hot_skills: ["React", "Full-stack", "Cloud"] }),
      mid: s([18, 35], [2, 4], ESOP(3, 8), [22, 45], { negotiation_leverage: "medium" }),
      senior: s([35, 55], [4, 8], ESOP(5, 12), [40, 65], { notice_period_days: 60, negotiation_leverage: "high" }),
    },
    "government-psu": {
      entry: s([4, 8], [0, 0.5], NO_EQ, [4, 8], { in_hand_ratio: 0.75, notice_period_days: 90, negotiation_leverage: "low", notes: "DA + HRA + pension benefits" }),
      mid: s([8, 14], [0.5, 1], NO_EQ, [8, 15], { negotiation_leverage: "low" }),
      senior: s([14, 25], [1, 2], NO_EQ, [15, 28], { negotiation_leverage: "low" }),
    },
  },

  // ─── PRODUCT MANAGER ──────────────────────────────────────────
  "product-manager": {
    faang: {
      entry: s([25, 35], [3, 5], RSU(3, 8, "quarterly after 1-year cliff"), [32, 45], { joining_bonus_min: 2, joining_bonus_max: 8, notice_period_days: 30, negotiation_leverage: "low", hot_skills: ["AI/ML PM", "Growth", "Platform"], notes: "APM/L3 level. RSUs modest at entry." }),
      mid: s([40, 55], [5, 8], RSU(15, 25), [60, 80], { joining_bonus_min: 5, joining_bonus_max: 15, negotiation_leverage: "high" }),
      senior: s([55, 75], [8, 15], RSU(25, 50), [90, 130], { notice_period_days: 60, negotiation_leverage: "high" }),
      lead: s([70, 100], [12, 20], RSU(40, 80), [120, 180], { negotiation_leverage: "high" }),
      executive: s([90, 120], [15, 30], RSU(60, 150), [180, 300], { in_hand_ratio: 0.55, negotiation_leverage: "high" }),
    },
    "indian-unicorn": {
      entry: s([10, 16], [1, 2], ESOP(1, 3), [12, 20], { negotiation_leverage: "medium", hot_skills: ["Data-driven PM", "Growth PM", "AI PM"] }),
      mid: s([20, 32], [2, 5], ESOP(3, 8), [25, 45], { negotiation_leverage: "medium" }),
      senior: s([35, 55], [5, 10], ESOP(8, 18), [48, 80], { notice_period_days: 60, negotiation_leverage: "high" }),
      lead: s([55, 80], [8, 15], ESOP(12, 25), [75, 120], { negotiation_leverage: "high" }),
    },
    "it-services": {
      entry: s([5, 8], [0.5, 1], NO_EQ, [5, 9], { notice_period_days: 90, negotiation_leverage: "low" }),
      mid: s([10, 16], [1, 2], NO_EQ, [10, 18], { negotiation_leverage: "low" }),
      senior: s([16, 25], [2, 4], NO_EQ, [18, 30], { negotiation_leverage: "medium" }),
      lead: s([22, 38], [3, 6], NO_EQ, [25, 45], { negotiation_leverage: "medium" }),
    },
    "startup-growth": {
      entry: s([8, 14], [0.5, 1.5], ESOP(1, 3), [10, 18], { notice_period_days: 15, negotiation_leverage: "medium" }),
      mid: s([15, 25], [1.5, 3], ESOP(3, 6), [20, 32], { negotiation_leverage: "medium" }),
      senior: s([28, 45], [3, 6], ESOP(5, 12), [35, 60], { negotiation_leverage: "high" }),
    },
    "consulting-mbb": {
      entry: s([14, 18], [2, 4], NO_EQ, [16, 22], { notice_period_days: 30, negotiation_leverage: "low" }),
      mid: s([20, 30], [5, 8], NO_EQ, [25, 38], { negotiation_leverage: "medium" }),
      senior: s([35, 55], [8, 15], NO_EQ, [45, 70], { negotiation_leverage: "medium" }),
    },
    "government-psu": {
      entry: s([5, 8], [0, 0.5], NO_EQ, [5, 9], { in_hand_ratio: 0.78, notice_period_days: 90, negotiation_leverage: "low", notes: "7th CPC pay bands. Negotiate grade/level, not base salary. Perks: housing, DA, HRA, pension." }),
      mid: s([8, 14], [0.5, 1], NO_EQ, [9, 15], { negotiation_leverage: "low", notes: "PSU manager grade. Fixed pay bands with DA increments." }),
      senior: s([14, 25], [1, 2], NO_EQ, [15, 28], { negotiation_leverage: "low", notes: "Senior manager/DGM level. Negotiate posting location and deputation allowance." }),
    },
  },

  // ─── ENGINEERING MANAGER ──────────────────────────────────────
  "engineering-manager": {
    faang: {
      mid: s([50, 70], [8, 15], RSU(30, 60), [90, 140], { joining_bonus_min: 10, joining_bonus_max: 20, notice_period_days: 60, negotiation_leverage: "high", hot_skills: ["AI/ML teams", "Platform", "Scale"] }),
      senior: s([70, 90], [12, 25], RSU(60, 120), [150, 235], { negotiation_leverage: "high" }),
      lead: s([80, 100], [20, 35], RSU(100, 200), [220, 350], { negotiation_leverage: "high" }),
      executive: s([90, 120], [25, 50], RSU(150, 300), [300, 450], { in_hand_ratio: 0.50, negotiation_leverage: "high" }),
    },
    "indian-unicorn": {
      mid: s([30, 45], [4, 8], ESOP(5, 12), [38, 65], { notice_period_days: 60, negotiation_leverage: "medium" }),
      senior: s([45, 65], [6, 12], ESOP(10, 20), [60, 95], { negotiation_leverage: "high" }),
      lead: s([55, 80], [8, 15], ESOP(15, 30), [80, 120], { negotiation_leverage: "high" }),
    },
    "it-services": {
      mid: s([15, 25], [1, 3], NO_EQ, [16, 28], { notice_period_days: 90, negotiation_leverage: "low" }),
      senior: s([22, 35], [2, 5], NO_EQ, [25, 40], { negotiation_leverage: "medium" }),
      lead: s([30, 50], [3, 8], NO_EQ, [35, 60], { negotiation_leverage: "medium" }),
    },
  },

  // ─── DATA SCIENTIST ───────────────────────────────────────────
  "data-scientist": {
    faang: {
      entry: s([22, 35], [2, 4], RSU(6, 12), [28, 48], { hot_skills: ["GenAI", "LLMs", "Computer Vision", "NLP"] }),
      mid: s([35, 50], [4, 8], RSU(12, 25), [50, 80], { negotiation_leverage: "high" }),
      senior: s([50, 70], [8, 15], RSU(25, 50), [80, 130], { notice_period_days: 60, negotiation_leverage: "high" }),
      lead: s([65, 85], [12, 20], RSU(40, 80), [110, 180], { negotiation_leverage: "high" }),
    },
    "indian-unicorn": {
      entry: s([8, 12], [0.5, 1.5], ESOP(1, 3), [10, 16], { hot_skills: ["MLOps", "NLP", "Recommendation Systems"] }),
      mid: s([15, 22], [1.5, 3], ESOP(2, 5), [18, 28], { negotiation_leverage: "medium" }),
      senior: s([22, 38], [3, 6], ESOP(5, 10), [28, 50], { negotiation_leverage: "high" }),
    },
    "it-services": {
      entry: s([4, 7], [0.2, 0.5], NO_EQ, [4, 8], { negotiation_leverage: "low" }),
      mid: s([8, 14], [0.5, 1.5], NO_EQ, [8, 15], { negotiation_leverage: "low" }),
      senior: s([14, 22], [1, 3], NO_EQ, [15, 25], { negotiation_leverage: "medium" }),
    },
    "startup-growth": {
      entry: s([6, 10], [0.5, 1], ESOP(1, 2), [7, 13], { negotiation_leverage: "medium" }),
      mid: s([12, 20], [1, 3], ESOP(2, 5), [14, 26], { negotiation_leverage: "medium" }),
      senior: s([20, 35], [3, 5], ESOP(5, 10), [26, 45], { negotiation_leverage: "high" }),
    },
    "saas-product": {
      entry: s([8, 12], [0.5, 1], ESOP(1, 2), [10, 15], { hot_skills: ["Product Analytics", "A/B Testing", "ML Ops"] }),
      mid: s([14, 22], [1, 3], ESOP(2, 5), [16, 28], {}),
      senior: s([22, 35], [3, 6], ESOP(4, 8), [28, 45], { negotiation_leverage: "high" }),
    },
  },

  // ─── DATA ANALYST ─────────────────────────────────────────────
  "data-analyst": {
    faang: {
      entry: s([12, 18], [1, 2], RSU(3, 6), [15, 25], { hot_skills: ["SQL", "Python", "Tableau", "A/B Testing"] }),
      mid: s([20, 30], [2, 4], RSU(5, 10), [25, 42], {}),
      senior: s([30, 45], [4, 8], RSU(8, 18), [40, 65], { negotiation_leverage: "high" }),
    },
    "indian-unicorn": {
      entry: s([6, 10], [0.5, 1], ESOP(0.5, 2), [7, 13], {}),
      mid: s([12, 18], [1, 2], ESOP(1, 3), [14, 22], {}),
      senior: s([18, 30], [2, 4], ESOP(3, 6), [22, 38], {}),
    },
    "it-services": {
      entry: s([3, 5], [0.1, 0.3], NO_EQ, [3, 5], { negotiation_leverage: "low" }),
      mid: s([5, 9], [0.3, 0.8], NO_EQ, [5, 10], { negotiation_leverage: "low" }),
      senior: s([9, 16], [0.8, 1.5], NO_EQ, [10, 18], { negotiation_leverage: "medium" }),
    },
  },

  // ─── ML ENGINEER / AI ENGINEER ────────────────────────────────
  "ml-engineer": {
    faang: {
      entry: s([25, 38], [2, 5], RSU(8, 15), [32, 55], { hot_skills: ["LLM fine-tuning", "RAG", "MLOps", "PyTorch"] }),
      mid: s([40, 55], [5, 10], RSU(15, 30), [55, 90], { negotiation_leverage: "high" }),
      senior: s([55, 75], [8, 18], RSU(30, 60), [85, 150], { negotiation_leverage: "high" }),
    },
    "indian-unicorn": {
      entry: s([10, 16], [1, 2], ESOP(1, 3), [12, 20], { hot_skills: ["TensorFlow", "PyTorch", "Recommendation Systems"] }),
      mid: s([18, 28], [2, 4], ESOP(3, 6), [22, 36], {}),
      senior: s([28, 42], [4, 8], ESOP(5, 12), [35, 58], { negotiation_leverage: "high" }),
    },
    "it-services": {
      entry: s([4, 8], [0.3, 0.5], NO_EQ, [4, 9], { negotiation_leverage: "low" }),
      mid: s([8, 15], [0.5, 1.5], NO_EQ, [9, 16], {}),
      senior: s([15, 25], [1, 3], NO_EQ, [16, 28], {}),
    },
    "startup-growth": {
      entry: s([8, 14], [0.5, 1.5], ESOP(1, 3), [10, 18], { hot_skills: ["GenAI", "LangChain", "Vector DBs"] }),
      mid: s([16, 25], [1.5, 3], ESOP(3, 6), [20, 32], { negotiation_leverage: "medium" }),
      senior: s([25, 40], [3, 6], ESOP(5, 12), [32, 55], { negotiation_leverage: "high" }),
    },
  },
  "ai-engineer": { /* alias — lookup falls back to ml-engineer */ },

  // ─── DATA ENGINEER ────────────────────────────────────────────
  "data-engineer": {
    faang: {
      entry: s([22, 32], [2, 4], RSU(6, 12), [28, 45], { hot_skills: ["Spark", "Kafka", "Airflow", "dbt"] }),
      mid: s([38, 52], [4, 8], RSU(12, 25), [50, 80], {}),
      senior: s([52, 70], [8, 15], RSU(25, 45), [80, 125], { negotiation_leverage: "high" }),
    },
    "indian-unicorn": {
      entry: s([8, 14], [0.5, 1.5], ESOP(1, 3), [10, 18], {}),
      mid: s([15, 25], [1.5, 3], ESOP(3, 6), [18, 32], {}),
      senior: s([25, 40], [3, 6], ESOP(5, 10), [32, 52], {}),
    },
    "it-services": {
      entry: s([4, 7], [0.2, 0.5], NO_EQ, [4, 8], { negotiation_leverage: "low" }),
      mid: s([7, 14], [0.5, 1.5], NO_EQ, [8, 15], {}),
      senior: s([14, 24], [1, 3], NO_EQ, [15, 28], {}),
    },
  },

  // ─── DEVOPS / SRE ─────────────────────────────────────────────
  "devops-sre": {
    faang: {
      entry: s([22, 35], [2, 4], RSU(6, 12), [28, 48], { hot_skills: ["Kubernetes", "Terraform", "AWS/GCP", "DevSecOps"] }),
      mid: s([35, 50], [4, 8], RSU(12, 25), [48, 78], {}),
      senior: s([50, 70], [8, 15], RSU(20, 40), [75, 120], { negotiation_leverage: "high" }),
      lead: s([65, 85], [10, 20], RSU(30, 60), [100, 160], {}),
    },
    "indian-unicorn": {
      entry: s([8, 12], [0.5, 1], ESOP(1, 2), [10, 15], {}),
      mid: s([15, 22], [1, 3], ESOP(2, 5), [18, 28], {}),
      senior: s([22, 35], [3, 5], ESOP(5, 10), [28, 48], {}),
    },
    "it-services": {
      entry: s([3.5, 6], [0.2, 0.4], NO_EQ, [3.5, 7], { notice_period_days: 90, negotiation_leverage: "low", notes: "CKA/AWS certs: +20-30%" }),
      mid: s([7, 14], [0.5, 1], NO_EQ, [8, 15], {}),
      senior: s([14, 25], [1, 2], NO_EQ, [15, 28], {}),
    },
    "government-psu": {
      entry: s([5, 8], [0, 0.5], NO_EQ, [5, 9], { in_hand_ratio: 0.78, notice_period_days: 90, negotiation_leverage: "low", notes: "ISRO/DRDO/Railways infra. 7th CPC Level 7-8" }),
      mid: s([8, 14], [0.5, 1], NO_EQ, [9, 15], { negotiation_leverage: "low" }),
      senior: s([14, 22], [1, 2], NO_EQ, [15, 24], {}),
    },
  },
  "cloud-engineer": { /* alias — falls back to devops-sre */ },

  // ─── UX / PRODUCT DESIGNER ────────────────────────────────────
  "ux-designer": {
    faang: {
      entry: s([15, 22], [1, 3], RSU(4, 8), [20, 32], { hot_skills: ["Figma", "User Research", "Design Systems"] }),
      mid: s([25, 35], [3, 5], RSU(8, 15), [35, 52], {}),
      senior: s([35, 50], [5, 8], RSU(12, 25), [48, 78], { negotiation_leverage: "high" }),
      lead: s([45, 65], [6, 12], RSU(18, 35), [65, 105], {}),
    },
    "indian-unicorn": {
      entry: s([5, 9], [0.3, 1], ESOP(0.5, 2), [6, 12], {}),
      mid: s([12, 20], [1, 2], ESOP(2, 4), [14, 25], {}),
      senior: s([20, 32], [2, 4], ESOP(3, 8), [24, 40], {}),
    },
    "it-services": {
      entry: s([3, 5], [0.1, 0.3], NO_EQ, [3, 5], { negotiation_leverage: "low" }),
      mid: s([5, 10], [0.3, 0.8], NO_EQ, [5, 11], {}),
      senior: s([10, 18], [0.8, 1.5], NO_EQ, [11, 20], {}),
    },
  },

  // ─── QA ENGINEER / SDET ───────────────────────────────────────
  "qa-engineer": {
    faang: {
      entry: s([18, 25], [1, 3], RSU(4, 8), [22, 35], { hot_skills: ["Automation", "Selenium/Playwright", "Performance Testing"] }),
      mid: s([28, 40], [3, 5], RSU(8, 15), [38, 58], {}),
      senior: s([40, 55], [5, 10], RSU(12, 25), [55, 85], {}),
    },
    "indian-unicorn": {
      entry: s([5, 7], [0.3, 0.5], ESOP(0.5, 1.5), [6, 9], {}),
      mid: s([8, 14], [0.5, 1.5], ESOP(1, 3), [10, 18], {}),
      senior: s([14, 22], [1.5, 3], ESOP(3, 6), [18, 30], {}),
    },
    "it-services": {
      entry: s([3, 5], [0.1, 0.3], NO_EQ, [3, 5], { notes: "SDET/automation: 50-100% more than manual QA", negotiation_leverage: "low" }),
      mid: s([5, 8], [0.3, 0.5], NO_EQ, [5, 9], {}),
      senior: s([8, 14], [0.5, 1.5], NO_EQ, [9, 16], {}),
    },
  },

  // ─── HR ───────────────────────────────────────────────────────
  "hr": {
    faang: {
      entry: s([10, 16], [1, 2], RSU(2, 5), [12, 22], { hot_skills: ["Talent Acquisition", "HRBP", "People Analytics"] }),
      mid: s([18, 28], [2, 4], RSU(4, 10), [22, 40], {}),
      senior: s([28, 40], [4, 8], RSU(8, 18), [38, 62], {}),
      executive: s([50, 80], [10, 20], RSU(15, 40), [75, 130], { in_hand_ratio: 0.55 }),
    },
    "indian-unicorn": {
      entry: s([4, 7], [0.3, 0.5], NO_EQ, [4, 8], {}),
      mid: s([8, 14], [0.5, 1.5], ESOP(0.5, 2), [9, 17], {}),
      senior: s([14, 25], [1.5, 3], ESOP(2, 5), [17, 32], {}),
    },
    "it-services": {
      entry: s([2.5, 4], [0.1, 0.2], NO_EQ, [2.5, 4.5], { negotiation_leverage: "low" }),
      mid: s([5, 9], [0.3, 0.8], NO_EQ, [5, 10], {}),
      senior: s([10, 18], [0.8, 2], NO_EQ, [11, 20], {}),
      executive: s([25, 45], [3, 8], NO_EQ, [28, 55], { notes: "CHRO: ₹50-120 LPA at top companies" }),
    },
  },

  // ─── MARKETING ────────────────────────────────────────────────
  "marketing": {
    faang: {
      entry: s([10, 15], [1, 2], RSU(2, 5), [12, 22], { hot_skills: ["Growth/PLG", "Data-driven", "Developer Marketing"] }),
      mid: s([18, 28], [2, 5], RSU(5, 10), [24, 42], {}),
      senior: s([28, 42], [4, 8], RSU(8, 18), [38, 65], {}),
    },
    "indian-unicorn": {
      entry: s([5, 8], [0.3, 0.8], ESOP(0.5, 1), [6, 10], { hot_skills: ["Performance Marketing", "Growth", "SEO/SEM"] }),
      mid: s([10, 16], [1, 2], ESOP(1, 3), [12, 20], {}),
      senior: s([16, 28], [2, 4], ESOP(3, 6), [20, 36], {}),
    },
    "it-services": {
      entry: s([3, 5], [0.1, 0.3], NO_EQ, [3, 5], { negotiation_leverage: "low" }),
      mid: s([6, 10], [0.3, 0.8], NO_EQ, [6, 11], {}),
      senior: s([10, 20], [1, 2], NO_EQ, [11, 22], {}),
    },
    "fmcg-mnc": {
      entry: s([4, 7], [0.3, 0.5], NO_EQ, [4, 8], { notes: "Brand Manager track" }),
      mid: s([8, 14], [1, 2], NO_EQ, [9, 16], {}),
      senior: s([15, 25], [2, 4], NO_EQ, [17, 30], {}),
      executive: s([30, 55], [5, 10], NO_EQ, [35, 65], {}),
    },
    "saas-product": {
      entry: s([5, 8], [0.3, 0.8], ESOP(0.5, 1.5), [6, 10], { hot_skills: ["PLG/Growth", "Content Marketing", "SEO/SEM", "Developer Evangelism"] }),
      mid: s([10, 18], [1, 3], ESOP(1, 3), [12, 22], {}),
      senior: s([18, 30], [2, 5], ESOP(3, 6), [22, 38], { negotiation_leverage: "high" }),
    },
  },

  // ─── SALES ────────────────────────────────────────────────────
  "sales": {
    faang: {
      entry: s([8, 12], [3, 6], RSU(2, 5), [12, 22], { notes: "Variable pay 30-50% of CTC" }),
      mid: s([15, 25], [8, 15], RSU(5, 10), [28, 48], {}),
      senior: s([25, 40], [15, 25], RSU(8, 18), [45, 78], { negotiation_leverage: "high" }),
    },
    "indian-unicorn": {
      entry: s([3, 5], [1.5, 3], ESOP(0.5, 1), [5, 9], { notes: "SaaS sales: higher variable" }),
      mid: s([6, 12], [4, 8], ESOP(1, 3), [11, 22], {}),
      senior: s([12, 22], [8, 15], ESOP(3, 6), [22, 40], {}),
    },
    "it-services": {
      entry: s([2.5, 4], [1, 2], NO_EQ, [3.5, 6], { negotiation_leverage: "low" }),
      mid: s([4, 8], [2, 4], NO_EQ, [6, 12], {}),
      senior: s([8, 15], [4, 8], NO_EQ, [12, 22], {}),
    },
  },

  // ─── CONSULTANT ───────────────────────────────────────────────
  "consultant": {
    "consulting-mbb": {
      entry: s([14, 16], [2, 4], NO_EQ, [16, 20], { notice_period_days: 30, negotiation_leverage: "low", notes: "Associate (pre-MBA)" }),
      mid: s([20, 30], [5, 10], NO_EQ, [25, 40], { notes: "Consultant → Sr Consultant" }),
      senior: s([45, 65], [10, 20], NO_EQ, [55, 85], { notes: "Engagement Manager → Principal" }),
      executive: s([80, 150], [30, 60], NO_EQ, [120, 210], { in_hand_ratio: 0.50, notes: "Partner level" }),
    },
    "consulting-big4": {
      entry: s([11, 14], [1, 2], NO_EQ, [12, 16], { negotiation_leverage: "low" }),
      mid: s([14, 22], [2, 4], NO_EQ, [16, 26], {}),
      senior: s([22, 35], [4, 8], NO_EQ, [26, 45], { notes: "Manager level" }),
      lead: s([35, 55], [6, 12], NO_EQ, [42, 65], { notes: "Principal/Director" }),
      executive: s([55, 80], [12, 20], NO_EQ, [70, 100], { notes: "Partner" }),
    },
  },

  // ─── FINANCE / CA / IB ────────────────────────────────────────
  "finance": {
    "bfsi-global": {
      entry: s([15, 25], [3, 8], RSU(2, 5), [18, 35], { hot_skills: ["Quant Finance", "Risk Analytics", "Python"] }),
      mid: s([25, 40], [8, 15], RSU(5, 12), [35, 62], {}),
      senior: s([40, 65], [15, 25], RSU(10, 25), [60, 105], { notice_period_days: 90, negotiation_leverage: "medium" }),
      executive: s([65, 110], [30, 60], RSU(20, 50), [110, 200], { in_hand_ratio: 0.50, notes: "MD level at bulge bracket" }),
    },
    "bfsi-domestic": {
      entry: s([4, 8], [0.3, 1], NO_EQ, [4, 10], { negotiation_leverage: "low" }),
      mid: s([8, 18], [1, 3], NO_EQ, [10, 22], {}),
      senior: s([18, 35], [3, 6], NO_EQ, [22, 42], {}),
      executive: s([35, 55], [5, 12], NO_EQ, [40, 68], {}),
    },
    "consulting-big4": {
      entry: s([9, 14], [1, 2], NO_EQ, [10, 16], { notes: "CA at Big 4" }),
      mid: s([16, 28], [2, 5], NO_EQ, [18, 33], {}),
      senior: s([28, 45], [5, 10], NO_EQ, [33, 55], {}),
    },
    "indian-unicorn": {
      entry: s([6, 10], [0.5, 1], ESOP(0.5, 2), [7, 13], {}),
      mid: s([12, 22], [1, 3], ESOP(2, 5), [14, 28], {}),
      senior: s([22, 38], [3, 6], ESOP(4, 10), [28, 50], {}),
    },
  },

  // ─── BUSINESS ANALYST ─────────────────────────────────────────
  "business-analyst": {
    faang: {
      entry: s([12, 18], [1, 2], RSU(3, 6), [15, 25], {}),
      mid: s([20, 30], [2, 4], RSU(5, 10), [26, 42], {}),
      senior: s([30, 42], [4, 8], RSU(8, 15), [40, 60], {}),
    },
    "indian-unicorn": {
      entry: s([6, 10], [0.3, 1], ESOP(0.5, 2), [7, 13], {}),
      mid: s([12, 20], [1, 2], ESOP(2, 4), [14, 25], {}),
      senior: s([18, 30], [2, 4], ESOP(3, 6), [22, 38], {}),
    },
    "it-services": {
      entry: s([4, 6], [0.2, 0.4], NO_EQ, [4, 7], { negotiation_leverage: "low" }),
      mid: s([8, 14], [0.5, 1], NO_EQ, [8, 15], {}),
      senior: s([14, 22], [1, 2], NO_EQ, [15, 25], {}),
    },
    "consulting-mbb": {
      entry: s([8, 12], [1, 2], NO_EQ, [9, 14], {}),
      mid: s([15, 22], [2, 4], NO_EQ, [17, 26], {}),
      senior: s([22, 35], [4, 6], NO_EQ, [26, 40], {}),
    },
  },

  // ─── PROGRAM / PROJECT MANAGER ────────────────────────────────
  "program-manager": {
    faang: {
      entry: s([15, 22], [1, 3], RSU(4, 8), [20, 32], { hot_skills: ["Technical PM", "Cross-functional", "Data-driven"] }),
      mid: s([25, 38], [3, 6], RSU(8, 15), [35, 55], {}),
      senior: s([40, 60], [6, 12], RSU(15, 30), [58, 95], {}),
    },
    "indian-unicorn": {
      entry: s([8, 14], [0.5, 1.5], ESOP(1, 2), [10, 17], {}),
      mid: s([15, 22], [1.5, 3], ESOP(2, 5), [18, 28], {}),
      senior: s([22, 35], [3, 5], ESOP(4, 8), [28, 45], {}),
    },
    "it-services": {
      entry: s([5, 8], [0.3, 0.5], NO_EQ, [5, 9], { notice_period_days: 90 }),
      mid: s([10, 16], [0.5, 1.5], NO_EQ, [10, 18], {}),
      senior: s([16, 28], [1, 3], NO_EQ, [18, 32], {}),
    },
  },
  "project-manager": { /* alias — falls back to program-manager */ },

  // ─── CONTENT WRITER / TECHNICAL WRITER ────────────────────────
  "content-writer": {
    "indian-unicorn": {
      entry: s([3.5, 5], [0.2, 0.4], NO_EQ, [3.5, 5.5], { hot_skills: ["SEO", "UX Writing", "Technical Writing"] }),
      mid: s([5, 8], [0.3, 0.8], ESOP(0.5, 1), [5.5, 9], {}),
      senior: s([8, 14], [0.8, 1.5], ESOP(1, 2), [9, 16], {}),
    },
    faang: {
      entry: s([8, 12], [0.5, 1], RSU(2, 4), [10, 16], { notes: "UX Writer: higher pay (₹14-20 LPA mid)" }),
      mid: s([14, 20], [1, 2], RSU(3, 6), [17, 26], {}),
      senior: s([20, 28], [2, 4], RSU(5, 10), [25, 38], {}),
    },
    "it-services": {
      entry: s([2, 3.5], [0.1, 0.2], NO_EQ, [2, 4], { negotiation_leverage: "low" }),
      mid: s([4, 6], [0.2, 0.5], NO_EQ, [4, 7], {}),
      senior: s([6, 10], [0.5, 1], NO_EQ, [7, 12], {}),
    },
  },

  // ─── CYBERSECURITY ────────────────────────────────────────────
  "cybersecurity": {
    faang: {
      entry: s([18, 25], [1, 3], RSU(4, 8), [22, 35], { hot_skills: ["Penetration Testing", "Cloud Security", "SIEM"] }),
      mid: s([28, 40], [3, 6], RSU(8, 15), [38, 58], {}),
      senior: s([40, 58], [6, 12], RSU(12, 25), [55, 90], {}),
      executive: s([55, 80], [10, 20], RSU(18, 35), [80, 130], { notes: "CISO level" }),
    },
    "indian-unicorn": {
      entry: s([6, 10], [0.3, 0.8], ESOP(0.5, 1.5), [7, 12], {}),
      mid: s([10, 16], [0.8, 2], ESOP(1, 3), [12, 20], {}),
      senior: s([16, 28], [2, 4], ESOP(3, 6), [20, 36], { notes: "BFSI: +15-25% premium" }),
    },
    "it-services": {
      entry: s([4, 7], [0.2, 0.4], NO_EQ, [4, 8], {}),
      mid: s([7, 13], [0.4, 1], NO_EQ, [8, 14], {}),
      senior: s([12, 22], [1, 2], NO_EQ, [13, 25], {}),
    },
    "bfsi-global": {
      entry: s([12, 18], [1, 3], RSU(2, 5), [14, 25], { notes: "BFSI pays 15-25% premium for security" }),
      mid: s([20, 32], [3, 6], RSU(5, 10), [26, 45], {}),
      senior: s([32, 50], [6, 12], RSU(8, 20), [42, 75], {}),
    },
    "government-psu": {
      entry: s([5, 8], [0, 0.5], NO_EQ, [5, 9], { in_hand_ratio: 0.78, notice_period_days: 90, negotiation_leverage: "low", notes: "CERT-In / NIC / DRDO cyber. 7th CPC Level 7-8 (₹44,900-1,42,400 basic)" }),
      mid: s([8, 14], [0.5, 1], NO_EQ, [9, 15], { negotiation_leverage: "low" }),
      senior: s([14, 22], [1, 2], NO_EQ, [15, 24], { notes: "Group A gazetted officer level" }),
    },
  },

  // ─── BLOCKCHAIN / WEB3 ────────────────────────────────────────
  "blockchain": {
    "indian-unicorn": {
      entry: s([5, 8], [0.3, 0.5], ESOP(1, 3), [6, 12], { hot_skills: ["Solidity", "Smart Contracts", "DApp", "Rust"] }),
      mid: s([10, 18], [1, 2], ESOP(2, 5), [12, 24], {}),
      senior: s([18, 35], [2, 5], ESOP(5, 12), [24, 48], {}),
    },
    "startup-growth": {
      entry: s([4, 8], [0.3, 1], ESOP(1, 4), [5, 12], { notes: "Blockchain fresher: 30-40% above regular SDE" }),
      mid: s([8, 16], [1, 2], ESOP(3, 8), [12, 25], {}),
      senior: s([16, 30], [2, 5], ESOP(5, 15), [22, 45], { negotiation_leverage: "high" }),
    },
  },

  // ─── LEGAL / COMPLIANCE ───────────────────────────────────────
  "legal": {
    faang: {
      entry: s([10, 16], [1, 2], RSU(2, 5), [12, 22], { hot_skills: ["Data Privacy", "IP Law", "Compliance"] }),
      mid: s([18, 28], [2, 5], RSU(5, 10), [24, 40], {}),
      senior: s([28, 45], [5, 10], RSU(8, 18), [38, 68], {}),
      executive: s([50, 80], [10, 25], RSU(15, 40), [70, 140], { notes: "General Counsel: ₹50-200 LPA at MNCs" }),
    },
    "indian-unicorn": {
      entry: s([5, 8], [0.3, 0.5], ESOP(0.5, 1), [6, 10], {}),
      mid: s([10, 18], [0.8, 2], ESOP(1, 3), [12, 22], {}),
      senior: s([18, 32], [2, 4], ESOP(3, 6), [22, 40], {}),
    },
    "bfsi-global": {
      entry: s([10, 18], [1, 3], NO_EQ, [12, 22], { notes: "Compliance/regulatory roles: premium" }),
      mid: s([18, 30], [3, 6], NO_EQ, [22, 38], {}),
      senior: s([30, 50], [6, 12], NO_EQ, [38, 65], {}),
    },
    "bfsi-domestic": {
      entry: s([5, 8], [0.3, 0.5], NO_EQ, [5, 9], { notes: "Compliance officer / legal analyst at Indian banks" }),
      mid: s([10, 18], [0.8, 2], NO_EQ, [11, 20], {}),
      senior: s([18, 30], [2, 4], NO_EQ, [20, 35], { notes: "RBI/SEBI regulatory expertise: +20% premium" }),
    },
  },

  // ─── OPERATIONS / SUPPLY CHAIN ────────────────────────────────
  "operations": {
    "indian-unicorn": {
      entry: s([6, 10], [0.3, 1], ESOP(0.5, 1.5), [7, 12], { hot_skills: ["Logistics", "Last-mile", "Warehouse Ops"] }),
      mid: s([14, 22], [1, 3], ESOP(1.5, 4), [16, 28], {}),
      senior: s([22, 32], [3, 5], ESOP(3, 6), [26, 40], {}),
    },
    faang: {
      entry: s([10, 15], [1, 2], RSU(2, 4), [12, 20], {}),
      mid: s([18, 28], [2, 4], RSU(4, 8), [22, 38], {}),
      senior: s([28, 40], [4, 8], RSU(6, 14), [36, 58], {}),
    },
    "it-services": {
      entry: s([4, 7], [0.2, 0.4], NO_EQ, [4, 8], { negotiation_leverage: "low" }),
      mid: s([8, 15], [0.5, 1.5], NO_EQ, [9, 17], {}),
      senior: s([15, 25], [1, 3], NO_EQ, [16, 28], {}),
    },
    "fmcg-mnc": {
      entry: s([4, 8], [0.3, 0.5], NO_EQ, [4, 9], { notes: "Supply chain / FMCG ops" }),
      mid: s([10, 18], [1, 2], NO_EQ, [11, 20], {}),
      senior: s([18, 28], [2, 4], NO_EQ, [20, 32], {}),
    },
  },

  // ─── CUSTOMER SUCCESS ─────────────────────────────────────────
  "customer-success": {
    "indian-unicorn": {
      entry: s([5, 7], [0.3, 0.5], ESOP(0.5, 1), [6, 9], {}),
      mid: s([10, 14], [0.8, 1.5], ESOP(1, 2), [11, 17], {}),
      senior: s([14, 25], [1.5, 3], ESOP(2, 5), [17, 32], {}),
      lead: s([22, 38], [3, 5], ESOP(3, 8), [28, 48], { notes: "Head of CS" }),
    },
    faang: {
      entry: s([10, 15], [1, 2], RSU(2, 4), [12, 20], {}),
      mid: s([18, 25], [2, 4], RSU(4, 8), [22, 35], {}),
      senior: s([25, 38], [4, 8], RSU(6, 14), [33, 55], {}),
    },
    "saas-product": {
      entry: s([5, 8], [0.3, 0.8], ESOP(0.5, 1.5), [6, 10], {}),
      mid: s([10, 15], [1, 2], ESOP(1, 3), [12, 20], {}),
      senior: s([15, 25], [2, 3], ESOP(3, 5), [20, 32], {}),
    },
  },

  // ─── TEACHER / PROFESSOR ──────────────────────────────────────
  "teacher": {
    "government-psu": {
      entry: s([3, 6], [0, 0.3], NO_EQ, [3, 6], { in_hand_ratio: 0.80, notice_period_days: 90, negotiation_leverage: "low", notes: "7th CPC pay scales + DA/HRA" }),
      mid: s([6, 12], [0.3, 0.5], NO_EQ, [6, 13], { negotiation_leverage: "low" }),
      senior: s([12, 22], [0.5, 1], NO_EQ, [13, 23], { notes: "Associate/Full Professor" }),
      executive: s([18, 35], [1, 2], NO_EQ, [20, 38], { notes: "HOD / Dean level" }),
    },
    edtech: {
      entry: s([3.5, 6], [0.2, 0.5], NO_EQ, [3.5, 7], {}),
      mid: s([8, 15], [0.5, 1.5], ESOP(0.5, 2), [9, 18], {}),
      senior: s([15, 28], [1, 3], ESOP(1, 4), [16, 32], {}),
    },
  },

  // ─── FRONTEND DEVELOPER ───────────────────────────────────────
  "frontend-developer": { /* alias — falls back to software-engineer */ },

  // ─── BACKEND DEVELOPER ────────────────────────────────────────
  "backend-developer": { /* alias — falls back to software-engineer */ },

  // ─── MOBILE DEVELOPER ─────────────────────────────────────────
  "mobile-developer": { /* alias — falls back to software-engineer with mobile premium note */ },
};

/** Role key aliases — when a role key has no data, fall back to this key */
export const ROLE_ALIASES: Partial<Record<RoleKey, RoleKey>> = {
  "ai-engineer": "ml-engineer",
  "cloud-engineer": "devops-sre",
  "project-manager": "program-manager",
  "frontend-developer": "software-engineer",
  "backend-developer": "software-engineer",
  "mobile-developer": "software-engineer",
};

/**
 * Map a free-text role string to a RoleKey.
 * Uses substring matching (same approach as getRoleCompetencies).
 */
export function matchRoleKey(role: string): RoleKey {
  if (!role) return "software-engineer";
  const lower = role.toLowerCase();

  // Ordered from most specific to least specific to avoid false matches
  const patterns: [string[], RoleKey][] = [
    [["machine learning", "ml engineer", "ml lead"], "ml-engineer"],
    [["ai engineer", "ai/ml", "artificial intelligence"], "ai-engineer"],
    [["data scientist", "research scientist"], "data-scientist"],
    [["data analyst", "business intelligence", "bi analyst", "bi developer"], "data-analyst"],
    [["data engineer", "data architect"], "data-engineer"],
    [["engineering manager", "director of engineering", "head of engineering", "vp of engineering"], "engineering-manager"],
    [["product manager", "apm", "associate product manager", "group product manager", "product owner", "chief product officer", "technical product manager", "director of product", "vp of product"], "product-manager"],
    [["product designer", "ux designer", "ui designer", "ux/ui", "visual designer", "ux researcher", "head of design", "design manager"], "ux-designer"],
    [["devops", "sre", "site reliability", "platform engineer", "infrastructure"], "devops-sre"],
    [["cloud engineer", "cloud architect"], "cloud-engineer"],
    [["frontend", "react developer", "angular developer", "vue"], "frontend-developer"],
    [["backend", "java developer", "python developer", "node.js developer", "go developer", ".net developer"], "backend-developer"],
    [["mobile developer", "ios developer", "android developer", "react native", "flutter"], "mobile-developer"],
    [["qa", "test engineer", "sdet", "automation engineer", "quality assurance"], "qa-engineer"],
    [["cybersecurity", "security engineer", "infosec", "penetration", "security architect", "security analyst"], "cybersecurity"],
    [["blockchain", "web3", "solidity", "smart contract"], "blockchain"],
    [["program manager", "technical program manager"], "program-manager"],
    [["project manager", "scrum master"], "project-manager"],
    [["business analyst"], "business-analyst"],
    [["content writer", "technical writer", "ux writer", "copywriter"], "content-writer"],
    [["customer success", "account manager", "csm"], "customer-success"],
    [["operations manager", "supply chain", "logistics"], "operations"],
    [["legal", "corporate lawyer", "company secretary", "compliance"], "legal"],
    [["hr", "recruiter", "talent acquisition", "hrbp", "human resource"], "hr"],
    [["marketing", "growth manager", "digital marketing", "content strategist"], "marketing"],
    [["sales", "business development", "account executive", "bde"], "sales"],
    [["consultant", "management consultant", "strategy consultant"], "consultant"],
    [["finance", "financial analyst", "ca", "chartered accountant", "investment banking", "bank po", "wealth manager"], "finance"],
    [["teacher", "lecturer", "professor", "assistant professor"], "teacher"],
    [["cto"], "engineering-manager"],
    [["ceo", "co-founder", "managing director", "general manager"], "engineering-manager"],
    // Catch-all for generic engineering roles
    [["software", "developer", "engineer", "full stack", "mern", "mean", "embedded", "firmware", "rust", "c++"], "software-engineer"],
  ];

  for (const [keywords, key] of patterns) {
    if (keywords.some(kw => lower.includes(kw))) return key;
  }

  return "software-engineer"; // default fallback
}
