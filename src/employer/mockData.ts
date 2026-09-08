/* HireStepX — Employer console shared types.
   Backed by real Supabase tables (employers, employer_requirements,
   requirement_matches) — see server-handlers/employer-*.ts and the
   "Employer talent-roster feature" block in supabase-schema.sql.

   Candidate fields are limited to what the real schema backs: target
   role, resume-derived city/skills, session count, last-active recency,
   and a normalized resume detail block (see
   server-handlers/_resume-detail-helpers.ts). There is no "exclusive"
   flag on real candidate data, so that fixture-only field from the
   original mocked pass is not part of this shape. `resume.noticePeriod`
   / `resume.currentCtc` are exactly what the candidate's resume text
   said, not a verified figure — always render them as self-reported. */

export interface CandidateResumeDetail {
  summary: string;
  headline: string | null;
  seniorityLevel: string | null;
  yearsExperience: number | null;
  keyAchievements: string[];
  industries: string[];
  experience: Array<{ title: string; company: string; period: string }>;
  education: Array<{ degree: string; school: string; year: string }>;
  certifications: string[];
  linkedin: string | null;
  phone: string | null;
  noticePeriod: string | null;
  currentCtc: string | null;
}

export interface MatchBreakdown {
  roleMatch: number;
  skillMatch: number;
  locationMatch: number;
}

export interface Candidate {
  id: string; // requirement_matches row id
  name: string;
  targetRole: string;
  city: string;
  matchScore: number; // fit against THIS requirement only
  matchBreakdown?: MatchBreakdown; // why matchScore is what it is
  rosterScore: number; // lifetime performance across all practice sessions
  sessionsCompleted: number;
  lastActiveDaysAgo: number;
  skills: string[];
  unlocked: boolean;
  contact?: { email: string; phone?: string };
  resume?: CandidateResumeDetail;
}

export type RequirementStatus = "generating" | "ready" | "partial" | "zero" | "failed" | "closed";

export type WorkMode = "remote" | "onsite" | "hybrid";

export interface RequirementSummary {
  id: string;
  title: string;
  location: string;
  noticePeriodPref: string;
  status: RequirementStatus;
  experienceMin: number | null;
  experienceMax: number | null;
  dueDate: string | null;
  budgetMin: number | null; // INR lakhs per annum
  budgetMax: number | null;
  locations: string[];
  openPositions: number | null;
  workMode: WorkMode | null;
  skills: string[];
  createdAt: string;
  candidateCount: number;
}

export interface Requirement {
  id: string;
  title: string;
  location: string;
  noticePeriodPref: string;
  description: string;
  status: RequirementStatus;
  experienceMin: number | null;
  experienceMax: number | null;
  dueDate: string | null;
  budgetMin: number | null; // INR lakhs per annum
  budgetMax: number | null;
  locations: string[];
  openPositions: number | null;
  workMode: WorkMode | null;
  skills: string[];
  responsibilities: string;
  niceToHave: string;
  preferredIndustry: string;
  preferredColleges: string[];
  targetCompanies: string[];
  perksAndBenefits: string[];
  createdAt: string;
  candidates: Candidate[];
}
