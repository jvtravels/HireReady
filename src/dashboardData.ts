import { c } from "./tokens";
import { type InterviewEvent, loadEvents, daysUntilEvent, formatEventTime } from "./dashboardHelpers";
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

/* ─── Constants ─── */
export const FREE_SESSION_LIMIT = 3;
export const STARTER_WEEKLY_LIMIT = 10;
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
  } catch {}
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
  } catch {}
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
  } catch {}
}

export function loadRealSessionsLocal(): RealSession[] {
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
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
      topStrength: pickByScore(strengthsByType[type] || strengthsByType["Behavioral"], rs.score),
      topWeakness: pickByScore(weaknessesByType[type] || weaknessesByType["Behavioral"], rs.score + 3),
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
          const score = typeof raw === "object" && raw !== null && "score" in (raw as any) ? (raw as any).score : raw;
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

  return { recentSessions, scoreTrend, skills, overallStats, hasData: real.length > 0 };
}

/* ─── Personalized AI Insights ─── */
export function generatePersonalizedInsights(user: UserContext, sk?: SkillData[]) {
  const insights: { type: string; text: string }[] = [];
  const role = user?.targetRole || "your target role";
  const company = user?.targetCompany;
  const industry = user?.industry;
  const theSkills = sk || [];

  if (theSkills.length === 0) {
    insights.push({ type: "tip", text: `Complete your first practice session to get personalized insights about your ${role} interview readiness.` });
    insights.push({ type: "tip", text: "Each session evaluates you on communication, strategic thinking, leadership presence, and more." });
    if (company) {
      insights.push({ type: "tip", text: `We'll tailor questions to ${company}'s interview style and ${industry || "your"} industry.` });
    }
    return insights;
  }

  const weakest = [...theSkills].sort((a, b) => a.score - b.score)[0];
  const mostImproved = [...theSkills].sort((a, b) => (b.score - b.prev) - (a.score - a.prev))[0];

  insights.push({ type: "strength", text: `Your ${mostImproved.name.toLowerCase()} has improved ${mostImproved.score - mostImproved.prev} points — keep leading with this in your answers.` });
  insights.push({ type: "weakness", text: `${weakest.name} is at ${weakest.score}/100. ${company ? `For ${company}, this` : "This"} skill is critical for ${role} — try a focused session.` });
  if (company && industry) {
    insights.push({ type: "tip", text: `${company} interviews in ${industry} often emphasize cross-functional leadership. Prepare 2-3 stories about driving alignment across engineering, product, and business.` });
  } else {
    insights.push({ type: "tip", text: `For ${role} interviews, prepare stories about scaling teams, managing up, and quantifying business impact with specific metrics.` });
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
export function generateGoals(user: UserContext, weekActivity: boolean[], sk?: SkillData[]) {
  const weekSessions = weekActivity.filter(Boolean).length;
  const theSkills = sk || [];
  const goals = [
    { label: weekSessions === 0 ? "Complete your first session" : "Complete 3 sessions this week", progress: weekSessions, total: weekSessions === 0 ? 1 : 3 },
  ];
  if (theSkills.length > 0) {
    const weakest = [...theSkills].sort((a, b) => a.score - b.score)[0];
    goals.push({ label: `Score 85+ on ${weakest.name}`, progress: weakest.score >= 85 ? 1 : 0, total: 1 });
  }
  if (user?.targetCompany) {
    goals.push({ label: `Practice ${user.targetCompany}-style questions`, progress: 0, total: 2 });
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
  const hasIntense = sessions.some(s => (s as any).difficulty === "intense" || (s as any).difficulty === "hard");
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
  let checkDate = new Date();
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
${generatePersonalizedInsights(null, sk).map(i => `• [${i.type.toUpperCase()}] ${i.text}`).join("\n")}

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
}

export async function analyzeResumeWithAI(resumeText: string, targetRole?: string): Promise<{ profile: ResumeProfile; truncated?: boolean } | null> {
  return withRetry(async () => {
    const headers = await authHeaders();
    const res = await fetch("/api/analyze-resume", {
      method: "POST",
      headers,
      body: JSON.stringify({ resumeText, targetRole }),
    });
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.retryAfter ? `Too many requests. Please wait ${data.retryAfter} seconds.` : "Too many requests. Please wait a moment.");
    }
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.profile) return null;
    return { profile: data.profile, truncated: data.truncated };
  });
}
