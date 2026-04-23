import { c } from "./tokens";
import { loadEvents, daysUntilEvent, formatEventTime } from "./dashboardHelpers";
import { authHeaders, supabaseConfigured } from "./supabase";
import type { UserContext, DashboardSession, SkillData, TrendPoint, PersistedState } from "./dashboardTypes";
import { scoreLabel } from "./dashboardTypes";

/** Retry a fetch-based async function on network errors (not on 4xx/5xx) */
async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isNetworkError = err instanceof TypeError && err.message.includes("fetch");
      if (!isNetworkError || attempt === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw new Error("Retry exhausted");
}

export { scoreLabel };
export type { UserContext, DashboardSession, SkillData, TrendPoint, PersistedState };

/* ─── Skill score helper ─── */
function extractScore(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "object" && raw !== null && "score" in raw) return (raw as { score: number }).score;
  return 0;
}

/* ─── Constants ─── */
export const FREE_SESSION_LIMIT = 3;
export const STARTER_WEEKLY_LIMIT = 7;
export const PRO_MONTHLY_LIMIT = 30;
export const SINGLE_SESSION_PRICE = 10; // ₹10 per session
export const STORAGE_KEY = "hirestepx_dashboard";
export const RESULTS_KEY = "hirestepx_sessions";

/* ─── RealSession (from localStorage / Supabase) ─── */
export interface RealSession {
  id: string;
  date: string;
  type: string;
  difficulty: string;
  focus: string;
  duration: number;
  score: number;
  questions: number;
  ai_feedback?: string;
  skill_scores?: Record<string, number> | null;
}

/* ─── Persisted State helpers ─── */
export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* expected: localStorage/JSON.parse may fail */ }
  try {
    const authRaw = localStorage.getItem("hirestepx_auth");
    if (authRaw) {
      const authUser = JSON.parse(authRaw);
      return {
        hasCompletedFirstSession: authUser.hasCompletedOnboarding || false,
        dismissedNotifs: [],
        userName: authUser.name || "",
        targetRole: authUser.targetRole || "",
        resumeFileName: authUser.resumeFileName || null,
        interviewDate: authUser.interviewDate || "",
      };
    }
  } catch { /* expected: localStorage/JSON.parse may fail */ }
  return {
    hasCompletedFirstSession: false,
    dismissedNotifs: [],
    userName: "",
    targetRole: "",
    resumeFileName: null,
    interviewDate: "",
  };
}

export function saveState(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* expected: localStorage may be unavailable */ }
}

export function loadRealSessionsLocal(): RealSession[] {
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* expected: localStorage/JSON.parse may fail */ }
  return [];
}

/* ─── Session data transforms ─── */
function normalizeType(type: string): string {
  const map: Record<string, string> = {
    behavioral: "Behavioral", strategic: "Strategic",
    "technical-leadership": "Technical Leadership", "case-study": "Case Study",
  };
  return map[type] || type;
}

function generateFeedback(type: string, score: number): string {
  if (score >= 85) return `Strong session! Your ${type.toLowerCase()} performance shows excellent preparation. Keep refining your answers by adding more specific metrics and quantifiable outcomes.`;
  if (score >= 75) return `Good session with room to grow. Focus on structuring answers more tightly and leading with the impact. Practice the STAR-L format to consistently deliver concise, high-scoring answers.`;
  return `This session highlighted key areas for improvement. Review the fundamentals of ${type.toLowerCase()} interviews and practice framing your experiences with concrete numbers and business outcomes.`;
}

const strengthsByType: Record<string, string[]> = {
  "Behavioral": ["STAR structure", "Strategic framing", "Storytelling clarity", "Self-awareness"],
  "Strategic": ["Roadmap clarity", "Prioritization framework", "Vision articulation", "Trade-off analysis"],
  "Technical Leadership": ["Architecture depth", "System design", "Technical mentorship", "Scale thinking"],
  "Case Study": ["Analytical framing", "Structured approach", "Problem decomposition", "Data-driven reasoning"],
};
const weaknessesByType: Record<string, string[]> = {
  "Behavioral": ["Quantifying impact", "Revenue metrics", "Conciseness", "Vulnerability"],
  "Strategic": ["Stakeholder alignment", "Executive presence", "Time management", "Political navigation"],
  "Technical Leadership": ["Delegation examples", "Team empowerment", "Business framing", "Hiring strategy"],
  "Case Study": ["Time management", "Solution depth", "Assumption clarity", "Communication pace"],
};

function pickByScore(arr: string[], score: number): string {
  return arr[Math.abs(score * 7 + arr.length) % arr.length];
}

function realSessionsToDashboard(realSessions: RealSession[], targetRole: string) {
  return realSessions.map((rs, i, all) => {
    const type = normalizeType(rs.type);
    const prevScore = i < all.length - 1 ? all[i + 1].score : rs.score;
    const dateObj = new Date(rs.date);
    const dateLabel = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const durationMin = Math.ceil(rs.duration / 60);
    return {
      id: rs.id,
      date: rs.date.split("T")[0],
      dateLabel,
      type,
      role: targetRole || "Target Role",
      score: rs.score,
      change: rs.score - prevScore,
      duration: `${durationMin} min`,
      topStrength: rs.skill_scores
        ? Object.entries(rs.skill_scores).sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0]
          || pickByScore(strengthsByType[type] || strengthsByType["Behavioral"], rs.score)
        : pickByScore(strengthsByType[type] || strengthsByType["Behavioral"], rs.score),
      topWeakness: rs.skill_scores
        ? Object.entries(rs.skill_scores).sort(([, a], [, b]) => (a as number) - (b as number))[0]?.[0]
          || pickByScore(weaknessesByType[type] || weaknessesByType["Behavioral"], rs.score + 3)
        : pickByScore(weaknessesByType[type] || weaknessesByType["Behavioral"], rs.score + 3),
      feedback: generateFeedback(type, rs.score),
      transcript: [] as { speaker: string; text: string; scoreNote?: string }[],
      questionScores: Array.from({ length: rs.questions || 3 }, (_, qi) => ({
        question: `Question ${qi + 1}`,
        score: Math.max(60, Math.min(100, rs.score + Math.floor((Math.random() - 0.5) * 16))),
        notes: qi === 0 ? "Strong opening" : qi === rs.questions - 1 ? "Good closing" : "Solid answer",
      })),
    };
  });
}

export function getSessionData(targetRole: string, supabaseSessions: RealSession[] = []) {
  // When Supabase is configured, use ONLY Supabase sessions (localStorage is not user-scoped
  // and would leak sessions between accounts on the same browser).
  // Only use localStorage when Supabase is not configured (demo/offline mode).
  let real: RealSession[];
  if (supabaseConfigured) {
    real = [...supabaseSessions];
  } else {
    real = loadRealSessionsLocal();
  }
  real.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const realConverted = realSessionsToDashboard(real, targetRole);
  const recentSessions = realConverted;

  const scoreTrend = real.slice().reverse().map(rs => ({
    score: rs.score,
    date: new Date(rs.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    type: normalizeType(rs.type),
  }));

  const skills: SkillData[] = [];
  if (real.length > 0) {
    const skillMap: Record<string, number[]> = {};
    real.forEach(rs => {
      if (rs.skill_scores) {
        Object.entries(rs.skill_scores).forEach(([name, raw]) => {
          const score = extractScore(raw);
          if (typeof score !== "number" || isNaN(score)) return;
          if (!skillMap[name]) skillMap[name] = [];
          skillMap[name].push(score);
        });
      }
    });
    const colors = [c.gilt, c.sage, c.ember, c.slate, c.gilt, c.sage];
    Object.entries(skillMap).forEach(([name, scores], i) => {
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const first = scores[0];
      skills.push({ name, score: avg, prev: first, color: colors[i % colors.length] });
    });
  }

  const allScores = recentSessions.map(s => s.score);
  const overallStats = {
    sessionsCompleted: recentSessions.length,
    avgScore: allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0,
    improvement: real.length >= 2 ? Math.max(0, real[0].score - real[real.length - 1].score) : 0,
    hoursLogged: Math.round((recentSessions.reduce((sum, s) => sum + parseInt(s.duration), 0) / 60) * 10) / 10,
  };

  const skillVelocity = computeSkillVelocity(real);

  return { recentSessions, scoreTrend, skills, overallStats, hasData: real.length > 0, skillVelocity };
}

/* ─── Personalized AI Insights ─── */
/** Fallback template insights (used when LLM is unavailable or user is on free tier) */
export function generateFallbackInsights(user: UserContext, sk?: SkillData[], velocity?: SkillVelocity[]) {
  const insights: { type: string; text: string; action?: string }[] = [];
  const role = user?.targetRole || "your target role";
  const company = user?.targetCompany;
  const industry = user?.industry;
  const theSkills = sk || [];

  if (theSkills.length === 0) {
    insights.push({ type: "tip", text: `Complete your first practice session to get personalized insights about your ${role} interview readiness.`, action: "/session/new?type=behavioral&difficulty=warmup" });
    insights.push({ type: "tip", text: "Each session evaluates you on communication, strategic thinking, leadership presence, and more." });
    if (company) {
      insights.push({ type: "tip", text: `We'll tailor questions to ${company}'s interview style and ${industry || "your"} industry.` });
    }
    return insights;
  }

  const weakest = [...theSkills].sort((a, b) => a.score - b.score)[0];
  const strongest = [...theSkills].sort((a, b) => b.score - a.score)[0];
  const mostImproved = [...theSkills].sort((a, b) => (b.score - b.prev) - (a.score - a.prev))[0];
  const weakVelocity = velocity?.find(v => v.name === weakest.name);
  const strongVelocity = velocity?.find(v => v.name === strongest.name);

  // Actionable strength insight
  if (mostImproved.score - mostImproved.prev > 0) {
    insights.push({ type: "strength", text: `Your ${mostImproved.name.toLowerCase()} has improved ${mostImproved.score - mostImproved.prev} points — keep leading with this in your answers.` });
  } else if (strongest) {
    insights.push({ type: "strength", text: `${strongest.name} is your strongest skill at ${strongest.score}/100.${strongVelocity?.trend === "improving" ? ` Still improving at ${strongVelocity.velocity} pts/week.` : " Maintain it with periodic practice."}` });
  }

  // Actionable weakness insight with specific drill
  const weakDrill = weakest.name === "communication" ? "Practice recording yourself answering 'Tell me about a time...' and replay it. Focus on clarity and pace."
    : weakest.name === "structure" ? "Before answering, mentally outline: Situation (2 sentences) → Task → Action (3-4 steps) → Result (with metrics)."
    : weakest.name === "technicalDepth" ? "Prepare 2-3 stories where you made a key technical decision. Include the trade-offs you considered."
    : weakest.name === "leadership" ? "Prepare stories about influencing without authority, mentoring, and making hard calls. Use 'I decided' not 'we decided'."
    : weakest.name === "problemSolving" ? "Practice the 'define → structure → solve → validate' framework. Always state your assumptions first."
    : "Try a focused session targeting this area.";

  insights.push({
    type: "weakness",
    text: `${weakest.name} is at ${weakest.score}/100${weakVelocity?.velocity ? ` (${weakVelocity.velocity > 0 ? "+" : ""}${weakVelocity.velocity}/wk)` : ""}. ${weakDrill}`,
    action: `/session/new?type=behavioral&focus=${weakest.name}`,
  });

  // Specific recommendation based on pattern
  if (company && industry) {
    insights.push({ type: "tip", text: `${company} interviews in ${industry} often emphasize cross-functional leadership. Prepare 2-3 stories about driving alignment across engineering, product, and business.` });
  } else {
    insights.push({ type: "tip", text: `For ${role} interviews, prepare stories about scaling teams, managing up, and quantifying business impact with specific metrics.` });
  }

  // Session recommendation based on data
  const avgScore = theSkills.length > 0 ? Math.round(theSkills.reduce((s, sk2) => s + sk2.score, 0) / theSkills.length) : 0;
  if (avgScore < 70) {
    insights.push({ type: "action", text: "Do 2 warmup sessions this week focusing on STAR structure. Build confidence before increasing difficulty.", action: "/session/new?type=behavioral&difficulty=warmup" });
  } else if (avgScore < 85) {
    insights.push({ type: "action", text: `Do a focused session on ${weakest.name} at standard difficulty. Target score: ${weakest.score + 10}+.`, action: `/session/new?type=behavioral&difficulty=standard&focus=${weakest.name}` });
  } else {
    insights.push({ type: "action", text: "You're scoring well. Try an intense session to stress-test under pressure.", action: "/session/new?type=behavioral&difficulty=intense" });
  }

  return insights;
}

/* ─── Notifications ─── */
export function generateNotifications(user: UserContext, streak: number, weekActivity: boolean[], sessions: DashboardSession[]) {
  const notifs: { id: number; type: string; text: string; dismissible: boolean; action?: string }[] = [];
  const sessionsCount = sessions.length;
  const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

  const missedDays = weekActivity.slice(0, todayIdx).filter(d => !d).length;
  if (missedDays > 0 && streak < 3) {
    notifs.push({ id: 1, type: "streak", text: `You've missed ${missedDays} day${missedDays > 1 ? "s" : ""} this week — practice today to build momentum!`, dismissible: true });
  }

  if (sessionsCount === 1) notifs.push({ id: 10, type: "milestone", text: "You completed your first session! The hardest part is starting.", dismissible: true });
  if (sessionsCount === 5) notifs.push({ id: 11, type: "milestone", text: "5 sessions complete! You're building real interview muscle memory.", dismissible: true, action: "View Report" });
  if (sessionsCount >= 10) notifs.push({ id: 12, type: "milestone", text: `${sessionsCount} sessions completed! You're in the top 10% of users.`, dismissible: true, action: "View Report" });

  const latestScore = sessions[0]?.score;
  if (latestScore >= 90) notifs.push({ id: 20, type: "milestone", text: `You hit ${latestScore}! Your highest score yet. You're interview-ready.`, dismissible: true });

  if (user?.interviewDate) {
    const days = Math.ceil((new Date(user.interviewDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days > 0 && days <= 3) notifs.push({ id: 30, type: "streak", text: `Your interview is in ${days} day${days > 1 ? "s" : ""}! Time for one final prep session.`, dismissible: false });
    else if (days > 0 && days <= 7) notifs.push({ id: 31, type: "streak", text: `${days} days until your interview — aim for daily practice this week.`, dismissible: true });
  }

  // Subscription expiry warning
  if (user?.subscriptionEnd) {
    const daysLeft = Math.ceil((new Date(user.subscriptionEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft > 0 && daysLeft <= 3) {
      notifs.push({ id: 40, type: "streak", text: `Your subscription expires in ${daysLeft} day${daysLeft > 1 ? "s" : ""}. Renew to keep unlimited access.`, dismissible: false, action: "Renew" });
    } else if (daysLeft > 0 && daysLeft <= 7) {
      notifs.push({ id: 41, type: "streak", text: `Subscription renews in ${daysLeft} days. You're on the ${user.subscriptionTier || "free"} plan.`, dismissible: true });
    } else if (daysLeft <= 0) {
      notifs.push({ id: 42, type: "streak", text: "Your subscription has expired. You're now on the free plan.", dismissible: false, action: "Renew" });
    }
  }

  const calEvents = loadEvents().filter(e => e.status === "upcoming");
  calEvents.forEach((ev, i) => {
    const days = daysUntilEvent(ev.date, ev.time);
    if (days === 0) {
      notifs.push({ id: 100 + i, type: "streak", text: `Interview today: ${ev.title} at ${ev.company} (${formatEventTime(ev.time)}). Time for a quick warm-up session!`, dismissible: false, action: "Quick Practice" });
    } else if (days === 1) {
      notifs.push({ id: 110 + i, type: "streak", text: `Interview tomorrow at ${ev.company}! Practice ${ev.type.toLowerCase()} questions to sharpen your edge.`, dismissible: true, action: "Practice Now" });
    } else if (days > 0 && days <= 3) {
      notifs.push({ id: 120 + i, type: "streak", text: `${ev.company} ${ev.type} in ${days} days — focus your practice on ${ev.type.toLowerCase()} prep.`, dismissible: true });
    }
  });

  return notifs;
}

/* ─── Goals ─── */
export function generateGoals(user: UserContext, weekActivity: boolean[], sk?: SkillData[], velocity?: SkillVelocity[]) {
  const weekSessions = weekActivity.filter(Boolean).length;
  const theSkills = sk || [];
  const goals: { label: string; progress: number; total: number; action?: string }[] = [
    { label: weekSessions === 0 ? "Complete your first session" : "Complete 3 sessions this week", progress: weekSessions, total: weekSessions === 0 ? 1 : 3, action: "/session/new" },
  ];
  if (theSkills.length > 0) {
    const weakest = [...theSkills].sort((a, b) => a.score - b.score)[0];
    const weakVel = velocity?.find(v => v.name === weakest.name);
    const target = weakest.score < 70 ? 70 : 85;
    goals.push({
      label: `${weakest.name} to ${target}+ (now ${weakest.score}${weakVel?.velocity ? `, ${weakVel.velocity > 0 ? "+" : ""}${weakVel.velocity}/wk` : ""})`,
      progress: weakest.score >= target ? 1 : 0,
      total: 1,
      action: `/session/new?type=behavioral&focus=${weakest.name}`,
    });
  }
  if (user?.targetCompany) {
    goals.push({ label: `Practice ${user.targetCompany}-style questions`, progress: Math.min(2, weekSessions), total: 2, action: "/session/new?type=behavioral" });
  }
  if (user?.interviewDate) {
    const days = Math.ceil((new Date(user.interviewDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days > 0 && days <= 14) {
      goals.push({ label: `${days} days left — try Intense difficulty`, progress: 0, total: 1, action: "/session/new?difficulty=intense" });
    }
  }
  return goals;
}

/* ─── Greeting ─── */
export function getPersonalizedGreeting(name: string, streak: number, sessionsCount: number) {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  if (sessionsCount === 0) return `${timeGreeting}, ${name}. Ready for your first session?`;
  if (streak >= 7) return `${timeGreeting}, ${name}. ${streak}-day streak — you're on fire!`;
  if (streak >= 3) return `${timeGreeting}, ${name}. ${streak} days strong — keep the momentum.`;
  if (streak === 0) return `${timeGreeting}, ${name}. Time to get back on track.`;
  return `${timeGreeting}, ${name}`;
}

/* ─── Smart Scheduling ─── */
export function getSmartScheduleSuggestion(user: UserContext): string | null {
  const timestamps = user?.practiceTimestamps;
  if (!timestamps || timestamps.length < 3) return null;
  const hours = timestamps.map((t: string) => new Date(t).getHours());
  const mornings = hours.filter((h: number) => h < 12).length;
  const afternoons = hours.filter((h: number) => h >= 12 && h < 17).length;
  const evenings = hours.filter((h: number) => h >= 17).length;
  const best = Math.max(mornings, afternoons, evenings);
  if (best === mornings) return "You practice best in the morning — try scheduling sessions before noon.";
  if (best === afternoons) return "Your most productive practice time is afternoons — keep that routine going.";
  return "You tend to practice in the evening — protect that time for prep.";
}

/* ─── Return Context ─── */
export function getReturnContext(sessions: DashboardSession[]): string | null {
  if (sessions.length === 0) return null;
  const last = sessions[0];
  return `Last session: ${last.type} (${last.score}/100) — ${last.topWeakness.toLowerCase()} needs work.`;
}

/* ─── Prep Plan ─── */
export function getPrepPlan(user: UserContext, sessions: DashboardSession[], sk?: SkillData[]): { label: string; done: boolean }[] | null {
  if (!user?.interviewDate) return null;
  const days = Math.ceil((new Date(user.interviewDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return null;
  const sessionsCount = sessions.length;
  const theSkills = sk || [];
  const weakest = theSkills.length > 0 ? [...theSkills].sort((a, b) => a.score - b.score)[0] : null;

  const types = new Set(sessions.map(s => s.type));
  const hasIntense = sessions.some(s => s.difficulty === "intense" || s.difficulty === "hard");
  const consecutiveHigh = (() => {
    let max = 0, cur = 0;
    for (const s of sessions) { if (s.score >= 85) { cur++; max = Math.max(max, cur); } else cur = 0; }
    return max;
  })();

  const plan: { label: string; done: boolean }[] = [
    { label: "Complete onboarding and first session", done: sessionsCount >= 1 },
    { label: `Try all interview types (${types.size}/3 done)`, done: types.size >= 3 },
    { label: weakest ? `Improve ${weakest.name} to 80+ (currently ${weakest.score})` : "Identify your weakest skill area", done: weakest ? weakest.score >= 80 : false },
    { label: `Score 85+ on 3 consecutive sessions (best streak: ${consecutiveHigh})`, done: consecutiveHigh >= 3 },
    { label: "Complete a session at Intense difficulty", done: hasIntense },
  ];

  if (days <= 3) {
    plan.push({ label: "Final review session before interview", done: days <= 1 && sessionsCount >= 5 });
  } else {
    plan.push({ label: `${days} days until interview — keep practicing!`, done: false });
  }

  return plan;
}

/* ─── Skill Mastery Badges ─── */
export interface Badge {
  id: string;
  label: string;
  description: string;
  icon: string;
  earned: boolean;
  progress: number; // 0-100
}

export function computeBadges(sessions: DashboardSession[], sk: SkillData[], streak: number): Badge[] {
  const sessionCount = sessions.length;
  const highScores = sessions.filter(s => s.score >= 85).length;
  const types = new Set(sessions.map(s => s.type));
  const consecutiveHigh = (() => {
    let max = 0, cur = 0;
    for (const s of sessions) { if (s.score >= 85) { cur++; max = Math.max(max, cur); } else { cur = 0; } }
    return max;
  })();

  return [
    { id: "first-session", label: "First Steps", description: "Complete your first session", icon: "target", earned: sessionCount >= 1, progress: Math.min(100, sessionCount * 100) },
    { id: "five-sessions", label: "Committed", description: "Complete 5 sessions", icon: "layers", earned: sessionCount >= 5, progress: Math.min(100, (sessionCount / 5) * 100) },
    { id: "ten-sessions", label: "Dedicated", description: "Complete 10 sessions", icon: "award", earned: sessionCount >= 10, progress: Math.min(100, (sessionCount / 10) * 100) },
    { id: "high-scorer", label: "High Performer", description: "Score 85+ three times", icon: "star", earned: highScores >= 3, progress: Math.min(100, (highScores / 3) * 100) },
    { id: "streak-7", label: "Week Warrior", description: "7-day practice streak", icon: "flame", earned: streak >= 7, progress: Math.min(100, (streak / 7) * 100) },
    { id: "versatile", label: "Versatile", description: "Try 3+ interview types", icon: "compass", earned: types.size >= 3, progress: Math.min(100, (types.size / 3) * 100) },
    { id: "consistent", label: "Consistent", description: "Score 85+ three times in a row", icon: "gem", earned: consecutiveHigh >= 3, progress: Math.min(100, (consecutiveHigh / 3) * 100) },
    { id: "mastery", label: "Interview Ready", description: "All skills above 80", icon: "crown", earned: sk.length > 0 && sk.every(s => s.score >= 80), progress: sk.length > 0 ? Math.min(100, (sk.filter(s => s.score >= 80).length / sk.length) * 100) : 0 },
  ];
}

/* ─── Daily Challenge ─── */
export interface DailyChallenge {
  id: string;
  label: string;
  description: string;
  type: string;
  focus?: string;
  difficulty: string;
  completed: boolean;
}

export function getDailyChallenge(sessions: DashboardSession[], sk: SkillData[]): DailyChallenge {
  const today = new Date().toISOString().split("T")[0];
  const dayOfWeek = new Date().getDay();
  const weakest = sk.length > 0 ? [...sk].sort((a, b) => a.score - b.score)[0] : null;

  const challenges: Omit<DailyChallenge, "id" | "completed">[] = [
    { label: "Speed Round", description: "Complete a warm-up behavioral session in under 10 minutes", type: "behavioral", difficulty: "warmup" },
    { label: "Deep Dive", description: "Tackle a case study at standard difficulty", type: "case-study", difficulty: "standard" },
    { label: "Under Pressure", description: "Complete an intense session — no second chances", type: "behavioral", difficulty: "intense" },
    { label: "Technical Edge", description: "Practice technical leadership questions", type: "technical", difficulty: "standard" },
    { label: "Strategic Vision", description: "Work on strategic thinking and roadmap questions", type: "strategic", difficulty: "standard" },
    { label: "Weak Spot", description: weakest ? `Focus on your weakest area: ${weakest.name}` : "Practice your weakest skill area", type: "behavioral", focus: weakest?.name.toLowerCase().replace(/\s+/g, "-"), difficulty: "standard" },
    { label: "Full Mock", description: "Simulate a real interview at intense difficulty", type: "behavioral", difficulty: "intense" },
    { label: "Campus Ready", description: "Practice a campus placement interview — nail your intro and project walkthrough", type: "campus-placement", difficulty: "standard" },
    { label: "HR Essentials", description: "Sharpen your strengths, weaknesses, and 'why hire you' pitch", type: "hr-round", difficulty: "standard" },
    { label: "Lead the Team", description: "Practice management scenarios — delegation, conflict, and change", type: "management", difficulty: "standard" },
  ];

  const challenge = challenges[dayOfWeek % challenges.length];
  // Check if a matching session was completed today (type match, or any session for "Full Mock")
  const completedToday = sessions.some(s => s.date === today && (
    s.type.toLowerCase().includes(challenge.type.toLowerCase()) || challenge.label === "Full Mock"
  ));
  // Also check localStorage for explicit challenge completion
  const explicitlyCompleted = (() => { try { return localStorage.getItem(`hirestepx_challenge_${today}`) === challenge.label; } catch { return false; } })();
  return { ...challenge, id: `challenge-${today}`, completed: completedToday || explicitlyCompleted };
}

/* ─── Practice Reminder ─── */
export function getPracticeReminder(sessions: DashboardSession[], streak: number): string | null {
  if (sessions.length === 0) return "Start your first session today — the hardest part is beginning.";
  const today = new Date().toISOString().split("T")[0];
  const practicedToday = sessions.some(s => s.date === today);
  if (practicedToday) return null;
  if (streak >= 3) return `Don't break your ${streak}-day streak! Practice today to keep the momentum.`;
  const lastSession = sessions[0];
  const daysSinceLastSession = Math.floor((Date.now() - new Date(lastSession.date).getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceLastSession >= 7) return `It's been ${daysSinceLastSession} days since your last session. Skills fade fast — jump back in.`;
  if (daysSinceLastSession >= 3) return `${daysSinceLastSession} days since your last practice. A quick session keeps you sharp.`;
  return null;
}

/* ─── Utility helpers ─── */
export function daysUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function computeReadiness(trend: { score: number; date: string }[], sk: SkillData[]) {
  if (trend.length === 0 || sk.length === 0) return 0;
  const latestScore = trend[trend.length - 1].score;
  const avgSkill = sk.reduce((sum, s) => sum + s.score, 0) / sk.length;
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const recentDays = new Set(
    trend.filter(t => now - new Date(t.date).getTime() < weekMs)
      .map(t => new Date(t.date).toDateString())
  );
  const consistencyBonus = (recentDays.size / 7) * 10;
  return Math.min(100, Math.round(latestScore * 0.4 + avgSkill * 0.4 + consistencyBonus * 2));
}

/* ─── Skill Velocity Tracking ─── */
export interface SkillVelocity {
  name: string;
  currentScore: number;
  firstScore: number;
  velocity: number; // points per week (positive = improving)
  trend: "improving" | "stable" | "declining";
  dataPoints: number;
}

export function computeSkillVelocity(sessions: RealSession[]): SkillVelocity[] {
  if (sessions.length < 2) return [];
  const sorted = [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const skillHistory: Record<string, { score: number; date: number }[]> = {};
  for (const session of sorted) {
    if (!session.skill_scores) continue;
    const ts = new Date(session.date).getTime();
    for (const [name, raw] of Object.entries(session.skill_scores)) {
      const score = extractScore(raw);
      if (!skillHistory[name]) skillHistory[name] = [];
      skillHistory[name].push({ score, date: ts });
    }
  }
  const velocities: SkillVelocity[] = [];
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  for (const [name, points] of Object.entries(skillHistory)) {
    if (points.length < 2) continue;
    const first = points[0];
    const last = points[points.length - 1];
    const weeksElapsed = Math.max((last.date - first.date) / weekMs, 0.14);
    const scoreDiff = last.score - first.score;
    const velocity = Math.round((scoreDiff / weeksElapsed) * 10) / 10;
    velocities.push({
      name,
      currentScore: last.score,
      firstScore: first.score,
      velocity,
      trend: velocity > 1 ? "improving" : velocity < -1 ? "declining" : "stable",
      dataPoints: points.length,
    });
  }
  return velocities.sort((a, b) => a.velocity - b.velocity);
}

/* ─── Company Readiness Prediction ─── */
const COMPANY_SKILL_WEIGHTS: Record<string, Record<string, number>> = {
  google: { communication: 0.15, structure: 0.15, technicalDepth: 0.25, leadership: 0.2, problemSolving: 0.25 },
  amazon: { communication: 0.15, structure: 0.1, technicalDepth: 0.15, leadership: 0.35, problemSolving: 0.25 },
  meta: { communication: 0.2, structure: 0.15, technicalDepth: 0.25, leadership: 0.15, problemSolving: 0.25 },
  microsoft: { communication: 0.2, structure: 0.2, technicalDepth: 0.2, leadership: 0.2, problemSolving: 0.2 },
  tcs: { communication: 0.25, structure: 0.2, technicalDepth: 0.25, leadership: 0.1, problemSolving: 0.2 },
  infosys: { communication: 0.25, structure: 0.2, technicalDepth: 0.25, leadership: 0.1, problemSolving: 0.2 },
  flipkart: { communication: 0.15, structure: 0.15, technicalDepth: 0.25, leadership: 0.2, problemSolving: 0.25 },
};
const DEFAULT_SKILL_WEIGHTS: Record<string, number> = {
  communication: 0.2, structure: 0.2, technicalDepth: 0.2, leadership: 0.2, problemSolving: 0.2,
};

export interface CompanyReadiness {
  readinessPercent: number;
  readySkills: { name: string; score: number; weight: number }[];
  atRiskSkills: { name: string; score: number; weight: number; gap: number }[];
  projectedDaysToReady: number | null;
  companyName: string;
  targetScore: number;
}

export function computeCompanyReadiness(
  company: string,
  skills: SkillData[],
  skillVelocity: SkillVelocity[],
  _daysUntilInterview: number,
): CompanyReadiness | null {
  if (skills.length === 0) return null;
  const companyKey = company?.toLowerCase().replace(/\s+/g, "").replace(/[^a-z]/g, "") || "";
  let weights = DEFAULT_SKILL_WEIGHTS;
  for (const [k, w] of Object.entries(COMPANY_SKILL_WEIGHTS)) {
    if (companyKey.includes(k) || k.includes(companyKey)) { weights = w; break; }
  }
  const targetScore = 80;
  let weightedScore = 0;
  let totalWeight = 0;
  const readySkills: CompanyReadiness["readySkills"] = [];
  const atRiskSkills: CompanyReadiness["atRiskSkills"] = [];
  for (const skill of skills) {
    const weight = weights[skill.name] || 0.2;
    weightedScore += skill.score * weight;
    totalWeight += weight;
    if (skill.score >= targetScore) {
      readySkills.push({ name: skill.name, score: skill.score, weight });
    } else {
      atRiskSkills.push({ name: skill.name, score: skill.score, weight, gap: targetScore - skill.score });
    }
  }
  const readinessPercent = totalWeight > 0 ? Math.min(100, Math.round((weightedScore / totalWeight / targetScore) * 100)) : 0;
  let projectedDaysToReady: number | null = null;
  if (atRiskSkills.length > 0 && skillVelocity.length > 0) {
    let maxDays = 0;
    for (const risk of atRiskSkills) {
      const vel = skillVelocity.find(v => v.name === risk.name);
      if (vel && vel.velocity > 0) {
        maxDays = Math.max(maxDays, Math.ceil((risk.gap / vel.velocity) * 7));
      } else { maxDays = -1; break; }
    }
    projectedDaysToReady = maxDays >= 0 ? maxDays : null;
  }
  readySkills.sort((a, b) => b.weight - a.weight);
  atRiskSkills.sort((a, b) => b.weight - a.weight);
  return { readinessPercent, readySkills, atRiskSkills, projectedDaysToReady, companyName: company || "your target company", targetScore };
}

/* ─── Structured Improvement Plan ─── */
export interface ImprovementTask {
  label: string;
  done: boolean;
  type?: string;
  focus?: string;
  difficulty?: string;
  reason?: string;
}

export interface ImprovementPlan {
  tasks: ImprovementTask[];
  weekLabel: string;
  totalWeeks: number;
  currentWeek: number;
  focusSkill: string | null;
  summary: string;
}

export function getImprovementPlan(
  user: UserContext,
  sessions: DashboardSession[],
  sk?: SkillData[],
  velocity?: SkillVelocity[],
): ImprovementPlan | null {
  if (!user?.interviewDate && sessions.length === 0) return null;
  const theSkills = sk || [];
  const days = user?.interviewDate
    ? Math.ceil((new Date(user.interviewDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const totalWeeks = days != null && days > 0 ? Math.min(Math.ceil(days / 7), 8) : 4;
  const sessionsCount = sessions.length;
  const currentWeek = Math.min(Math.ceil(sessionsCount / 3) + 1, totalWeeks);
  const weakest = theSkills.length > 0 ? [...theSkills].sort((a, b) => a.score - b.score)[0] : null;
  const secondWeakest = theSkills.length > 1 ? [...theSkills].sort((a, b) => a.score - b.score)[1] : null;
  const strongest = theSkills.length > 0 ? [...theSkills].sort((a, b) => b.score - a.score)[0] : null;
  const types = new Set(sessions.map(s => s.type));
  const hasIntense = sessions.some(s => s.difficulty === "intense" || s.difficulty === "hard");
  const avgScore = sessions.length > 0 ? Math.round(sessions.reduce((s, sess) => s + sess.score, 0) / sessions.length) : 0;
  const weakVelocity = velocity?.find(v => v.name === weakest?.name);
  const tasks: ImprovementTask[] = [];

  if (currentWeek <= 2) {
    // Phase 1: Foundation
    tasks.push({ label: sessionsCount === 0 ? "Complete your first practice session" : "Complete a behavioral interview session", done: sessionsCount >= 1, type: "behavioral", difficulty: "warmup", reason: "Build confidence with a warmup session" });
    tasks.push({ label: "Try a technical interview session", done: types.has("technical"), type: "technical", difficulty: "warmup", reason: "Get familiar with technical question format" });
    tasks.push({ label: "Try a strategic interview session", done: types.has("strategic"), type: "strategic", difficulty: "standard", reason: "Test leadership and strategic thinking" });
    if (weakest) tasks.push({ label: `Focused session on ${weakest.name} (currently ${weakest.score}/100)`, done: weakest.score >= 70, type: "behavioral", focus: weakest.name, difficulty: "standard", reason: "Your weakest skill — targeted practice has highest impact" });
  } else if (currentWeek <= 4) {
    // Phase 2: Skill building
    if (weakest) tasks.push({ label: `Improve ${weakest.name} to 75+ (currently ${weakest.score})`, done: weakest.score >= 75, focus: weakest.name, type: "behavioral", difficulty: "standard", reason: weakVelocity?.velocity && weakVelocity.velocity > 0 ? `Improving at ${weakVelocity.velocity} pts/week — keep it up` : "Focus on specific examples with metrics" });
    if (secondWeakest) tasks.push({ label: `Practice ${secondWeakest.name} (currently ${secondWeakest.score})`, done: secondWeakest.score >= 75, focus: secondWeakest.name, type: "behavioral", difficulty: "standard", reason: "Your second-weakest area — balanced improvement matters" });
    tasks.push({ label: "Score 75+ at Standard difficulty", done: sessions.some(s => (s.difficulty === "standard" || !s.difficulty) && s.score >= 75), difficulty: "standard", reason: "Validate your progress under normal conditions" });
    if (user?.targetCompany) tasks.push({ label: `Practice ${user.targetCompany}-style questions`, done: sessions.length >= 3, type: "behavioral", difficulty: "standard", reason: `Calibrate to ${user.targetCompany}'s interview style` });
  } else if (currentWeek <= 6) {
    // Phase 3: Intensity
    tasks.push({ label: "Complete a session at Intense difficulty", done: hasIntense, difficulty: "intense", reason: "Test yourself under pressure — real interviews are intense" });
    if (weakest) tasks.push({ label: `Push ${weakest.name} to 80+ (currently ${weakest.score})`, done: weakest.score >= 80, focus: weakest.name, difficulty: "intense", reason: "Close your biggest gap before interview day" });
    tasks.push({ label: "Score 85+ on two consecutive sessions", done: (() => { let streak = 0; for (const s of sessions) { if (s.score >= 85) { streak++; if (streak >= 2) return true; } else streak = 0; } return false; })(), difficulty: "standard", reason: "Consistency matters — prove you can perform reliably" });
    tasks.push({ label: `Average score above 80 (currently ${avgScore})`, done: avgScore >= 80, reason: "Holistic readiness indicator" });
  } else {
    // Phase 4: Polish
    tasks.push({ label: "Score 85+ at Intense difficulty", done: sessions.some(s => (s.difficulty === "intense" || s.difficulty === "hard") && s.score >= 85), difficulty: "intense", reason: "Peak performance under maximum pressure" });
    if (strongest) tasks.push({ label: `Maintain ${strongest.name} at 85+ (currently ${strongest.score})`, done: strongest.score >= 85, focus: strongest.name, reason: "Don't let your strengths slip during final prep" });
    tasks.push({ label: "Full mock interview (all question types)", done: types.size >= 3 && hasIntense, difficulty: "intense", reason: "Simulate the real experience end-to-end" });
    if (days != null && days <= 3) tasks.push({ label: "Final warmup session for confidence", done: false, type: "behavioral", difficulty: "warmup", reason: "Light warmup before the real thing — confidence is key" });
  }

  const focusSkill = weakest?.name || null;
  const weekLabel = days != null && days > 0
    ? `Week ${currentWeek} of ${totalWeeks} · ${days} days until interview`
    : `Week ${currentWeek} · Keep building momentum`;
  const summary = weakest && weakVelocity?.velocity && weakVelocity.velocity > 0
    ? `Focus on ${weakest.name} (improving ${weakVelocity.velocity} pts/week). ${days != null && days > 0 ? `${days} days to go.` : ""}`
    : weakest ? `Priority: improve ${weakest.name} (${weakest.score}/100)` : "Complete more sessions to unlock personalized recommendations";
  return { tasks, weekLabel, totalWeeks, currentWeek, focusSkill, summary };
}

export function computeWeekActivity(sessions: DashboardSession[]): boolean[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const days: boolean[] = [false, false, false, false, false, false, false];
  const today = now.getDay();
  const todayIdx = today === 0 ? 6 : today - 1;

  sessions.forEach(s => {
    const sessionDate = new Date(s.date);
    const diff = Math.floor((sessionDate.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24));
    if (diff >= 0 && diff < 7) {
      days[diff] = true;
    }
  });

  return days.map((practiced, i) => {
    if (i > todayIdx) return false;
    return practiced;
  });
}

export function computeStreak(sessions: DashboardSession[]): number {
  const sorted = [...sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  let streak = 0;
  const checkDate = new Date();
  checkDate.setHours(0, 0, 0, 0);

  for (let i = 0; i < 30; i++) {
    const dateStr = checkDate.toISOString().split("T")[0];
    const hasSession = sorted.some(s => s.date === dateStr);
    if (hasSession) {
      streak++;
    } else if (streak > 0) {
      break;
    }
    checkDate.setDate(checkDate.getDate() - 1);
  }
  return streak;
}

export function generateReport(userName: string, stats: { sessionsCompleted: number; avgScore: number; hoursLogged: number }, sk: SkillData[], sessions: DashboardSession[]) {
  const avgScore = stats.avgScore;
  const topSkill = [...sk].sort((a, b) => b.score - a.score)[0];
  const weakSkill = [...sk].sort((a, b) => a.score - b.score)[0];
  const totalImprovement = sk.reduce((sum, s) => sum + (s.score - s.prev), 0);

  return `HIRESTEPX — PROGRESS REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Candidate: ${userName}
Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

OVERVIEW
• Sessions Completed: ${stats.sessionsCompleted}
• Average Score: ${avgScore}/100 (${scoreLabel(avgScore)})
• Total Improvement: +${totalImprovement} points across all skills
• Practice Time: ${stats.hoursLogged} hours

SKILL BREAKDOWN
${sk.map(s => `• ${s.name}: ${s.score}/100 (+${s.score - s.prev} from first session)`).join("\n")}

STRONGEST AREA
${topSkill.name} at ${topSkill.score}/100 — improved ${topSkill.score - topSkill.prev} points since first session.

AREA FOR IMPROVEMENT
${weakSkill.name} at ${weakSkill.score}/100 — focus sessions here before your interview.

RECENT SESSION HIGHLIGHTS
${sessions.slice(0, 3).map(s => `• ${s.dateLabel} — ${s.type}: ${s.score}/100 (${s.change > 0 ? "+" : ""}${s.change})`).join("\n")}

AI COACHING NOTES
${generateFallbackInsights(null, sk).map(i => `• [${i.type.toUpperCase()}] ${i.text}`).join("\n")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generated by HireStepX AI
Share this report with your coach or mentor.`;
}

/* ─── AI Resume Profile ─── */
export interface ResumeProfile {
  headline: string;
  summary: string;
  yearsExperience: number | null;
  seniorityLevel: string;
  topSkills: string[];
  keyAchievements: string[];
  industries: string[];
  interviewStrengths: string[];
  interviewGaps: string[];
  careerTrajectory: string;
  resumeScore?: number;
  improvements?: string[];
}

/**
 * POST JSON via XMLHttpRequest instead of fetch.
 *
 * Browser extensions (Loom, Jam.dev, Hotjar, etc.) install global
 * fetch interceptors that wrap window.fetch to capture every request
 * for telemetry. Some of these interceptors hang on POST bodies above
 * a size threshold, causing the request to never resolve and the user
 * to see a generic "timeout" with no Network row to diagnose. XHR is
 * older API surface that these interceptors typically don't wrap, so
 * routing latency-sensitive POSTs through it sidesteps the bug
 * entirely without us having to detect-and-fallback.
 */
function postJsonXHR(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ status: number; headers: Record<string, string>; data: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.responseType = "text"; // parse JSON ourselves so we always get the body, even on errors
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.onload = () => {
      // Parse all response headers into a flat map (lowercased)
      const headerMap: Record<string, string> = {};
      const raw = xhr.getAllResponseHeaders() || "";
      raw.trim().split(/[\r\n]+/).forEach(line => {
        const idx = line.indexOf(":");
        if (idx > 0) headerMap[line.slice(0, idx).toLowerCase().trim()] = line.slice(idx + 1).trim();
      });
      let parsed: unknown = null;
      try { parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { parsed = { error: xhr.responseText }; }
      resolve({ status: xhr.status, headers: headerMap, data: parsed });
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onabort = () => reject(new Error("aborted"));
    if (signal) {
      if (signal.aborted) { xhr.abort(); return; }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(typeof body === "string" ? body : JSON.stringify(body));
  });
}

export async function analyzeResumeWithAI(resumeText: string, targetRole?: string, signal?: AbortSignal): Promise<{ profile: ResumeProfile; truncated?: boolean } | null> {
  return withRetry(async () => {
    const tFetchStart = Date.now();
    const headers = await authHeaders();
    if (!headers["Authorization"]) {
      // Session expired or never established. Fail loudly instead of sending
      // an unauthenticated request that would silently 401.
      console.error("[analyzeResume] no auth token — session expired or missing");
      throw new Error("Session expired — please refresh and sign in again.");
    }
    console.log(`[analyzeResume] POST /api/analyze-resume — body=${resumeText.length}b, role=${targetRole || "(none)"}`);
    const { status, headers: resHeaders, data } = await postJsonXHR(
      "/api/analyze-resume",
      { resumeText, targetRole },
      headers,
      signal,
    );
    console.log(`[analyzeResume] response status=${status} reqId=${resHeaders["x-request-id"] || "?"} timing=${resHeaders["x-timing"] || "?"} elapsed=${Date.now() - tFetchStart}ms`);
    const errBody = (data && typeof data === "object" ? data as Record<string, unknown> : {}) as { error?: string; retryAfter?: number; profile?: ResumeProfile; truncated?: boolean };
    if (status === 401) {
      throw new Error("Session expired — please refresh and sign in again.");
    }
    if (status === 429) {
      throw new Error(errBody.retryAfter ? `Too many requests. Please wait ${errBody.retryAfter} seconds.` : "Too many requests. Please wait a moment.");
    }
    if (status < 200 || status >= 300) {
      const msg = errBody.error || `HTTP ${status}`;
      console.error(`[analyzeResume] API error ${status}:`, msg);
      throw new Error(msg);
    }
    if (!errBody.profile) {
      console.warn("[analyzeResume] No profile in response");
      throw new Error("Server returned no profile data");
    }
    return { profile: errBody.profile, truncated: errBody.truncated };
  });
}
