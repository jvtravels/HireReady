/**
 * Curriculum Engine — 3-session guided onboarding
 *
 * Pure stateless module. No API calls, no side effects.
 * Takes session history + user profile, returns what to do next.
 */
import type { DashboardSession } from "./dashboardTypes";

/* ─── Types ─── */

export interface CurriculumSessionConfig {
  sessionNumber: number;
  type: string;
  difficulty: string;
  mini: boolean;
  focus?: string;
  company?: string;
  useResume: boolean;
}

export interface CurriculumState {
  /** 1-3 = next to complete, 4 = all done */
  currentSession: number;
  completed: boolean;
  nextSessionConfig: CurriculumSessionConfig | null;
  progressPercent: number;
  narrative: string;
  sessionHistory: {
    sessionNumber: number;
    score: number;
    date: string;
    topStrength: string;
    topWeakness: string;
  }[];
  baselineScore: number | null;
  latestScore: number | null;
  weakestSkill: string | null;
}

/* ─── Session Configs ─── */

/**
 * Session 1: Warmup — friendly behavioral, mini (3 questions), no pressure
 * Session 2: Focus — targets weakest skill from S1, standard difficulty
 * Session 3: Challenge — role-appropriate type, company-specific, full difficulty
 */
function getSessionConfig(
  sessionNumber: number,
  weakestSkill: string | null,
  role?: string,
  company?: string,
): CurriculumSessionConfig {
  switch (sessionNumber) {
    case 1:
      return {
        sessionNumber: 1,
        type: "behavioral",
        difficulty: "warmup",
        mini: true,
        useResume: true,
      };
    case 2:
      return {
        sessionNumber: 2,
        type: "behavioral",
        difficulty: "standard",
        mini: true,
        focus: weakestSkill || undefined,
        useResume: true,
      };
    case 3:
      return {
        sessionNumber: 3,
        type: getRoleAppropriateType(role),
        difficulty: "standard",
        mini: false,
        company: company || undefined,
        useResume: true,
      };
    default:
      return {
        sessionNumber,
        type: "behavioral",
        difficulty: "standard",
        mini: false,
        useResume: true,
      };
  }
}

function getRoleAppropriateType(role?: string): string {
  if (!role) return "behavioral";
  const r = role.toLowerCase();
  if (/engineer|developer|sde|swe|programmer|coder/i.test(r)) return "technical";
  if (/product\s*manager|pm\b/i.test(r)) return "strategic";
  if (/analyst|data/i.test(r)) return "technical";
  if (/intern|fresher|graduate|campus|entry/i.test(r)) return "campus-placement";
  if (/consult/i.test(r)) return "case-study";
  return "behavioral";
}

/* ─── Core Function ─── */

export function getCurriculumState(
  sessions: DashboardSession[],
  user?: { targetRole?: string; targetCompany?: string } | null,
): CurriculumState {
  const count = Math.min(sessions.length, 3);
  const currentSession = count + 1;
  const completed = count >= 3;

  // Sort sessions oldest-first for consistent ordering
  const sorted = [...sessions]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3);

  // Build history
  const sessionHistory = sorted.map((s, i) => ({
    sessionNumber: i + 1,
    score: s.score,
    date: s.date,
    topStrength: s.topStrength || "—",
    topWeakness: s.topWeakness || "—",
  }));

  const baselineScore = sorted.length > 0 ? sorted[0].score : null;
  const latestScore = sorted.length > 0 ? sorted[sorted.length - 1].score : null;

  // Find weakest skill from first session
  let weakestSkill: string | null = null;
  if (sorted.length > 0) {
    const s1 = sorted[0];
    weakestSkill = s1.topWeakness || null;
  }

  // Progress: 0%, 33%, 67%, 100%
  const progressPercent = Math.round((count / 3) * 100);

  // Narrative for next session
  const narrative = getNextNarrative(currentSession, weakestSkill, latestScore, baselineScore);

  // Next config (null if completed)
  const nextSessionConfig = completed
    ? null
    : getSessionConfig(currentSession, weakestSkill, user?.targetRole, user?.targetCompany);

  return {
    currentSession: Math.min(currentSession, 4),
    completed,
    nextSessionConfig,
    progressPercent,
    narrative,
    sessionHistory,
    baselineScore,
    latestScore,
    weakestSkill,
  };
}

function getNextNarrative(
  session: number,
  weakestSkill: string | null,
  latestScore: number | null,
  baselineScore: number | null,
): string {
  switch (session) {
    case 1:
      return "Let's start with a quick warmup — 3 friendly questions to set your baseline.";
    case 2:
      if (weakestSkill) {
        return `Great start! Now let's focus on ${weakestSkill} — your biggest growth area.`;
      }
      return "Nice work! Session 2 will push you a bit further with targeted questions.";
    case 3:
      if (latestScore && baselineScore && latestScore > baselineScore) {
        return `You've improved ${latestScore - baselineScore} points! Final session: a real interview simulation.`;
      }
      return "Almost there! Your final session is a full interview simulation.";
    default:
      if (latestScore && baselineScore) {
        const delta = latestScore - baselineScore;
        return delta > 0
          ? `Curriculum complete! You improved ${delta} points across 3 sessions.`
          : "Curriculum complete! You've built a strong foundation. Keep practicing to improve.";
      }
      return "Curriculum complete! You're ready for the real thing.";
  }
}

/* ─── URL Builder ─── */

export function buildInterviewUrl(config: CurriculumSessionConfig): string {
  const params = new URLSearchParams();
  params.set("type", config.type);
  params.set("difficulty", config.difficulty);
  if (config.mini) params.set("mini", "true");
  if (config.focus) params.set("focus", config.focus);
  if (config.company) params.set("company", config.company);
  params.set("curriculum", String(config.sessionNumber));
  return `/interview?${params.toString()}`;
}
