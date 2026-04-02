import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { loadTTSSettings, saveTTSSettings, GOOGLE_VOICES, type TTSSettings } from "./tts";
import { getUserSessions, getCalendarEvents, saveCalendarEvent, deleteCalendarEvent, type SessionRecord, type CalendarEvent as DBCalendarEvent } from "./supabase";
import { extractResumeText, parseResumeData, type ParsedResume } from "./resumeParser";

/* ─── localStorage helpers ─── */
const STORAGE_KEY = "levelup_dashboard";

interface PersistedState {
  hasCompletedFirstSession: boolean;
  dismissedNotifs: number[];
  userName: string;
  targetRole: string;
  resumeFileName: string | null;
  interviewDate: string;
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  // Pull user data from auth context localStorage
  try {
    const authRaw = localStorage.getItem("levelup_auth");
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

function saveState(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

/* ─── Load real sessions from localStorage (fallback) ─── */
const RESULTS_KEY = "levelup_sessions";

interface RealSession {
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

function loadRealSessionsLocal(): RealSession[] {
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

/* Map interview type labels */
function normalizeType(type: string): string {
  const map: Record<string, string> = {
    behavioral: "Behavioral", strategic: "Strategic",
    "technical-leadership": "Technical Leadership", "case-study": "Case Study",
  };
  return map[type] || type;
}

/* Generate feedback text based on type and score */
function generateFeedback(type: string, score: number): string {
  if (score >= 85) return `Strong session! Your ${type.toLowerCase()} performance shows excellent preparation. Keep refining your answers by adding more specific metrics and quantifiable outcomes.`;
  if (score >= 75) return `Good session with room to grow. Focus on structuring answers more tightly and leading with the impact. Practice the STAR-L format to consistently deliver concise, high-scoring answers.`;
  return `This session highlighted key areas for improvement. Review the fundamentals of ${type.toLowerCase()} interviews and practice framing your experiences with concrete numbers and business outcomes.`;
}

/* Compute strengths/weaknesses by type */
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

/* Convert real sessions to dashboard format */
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

/* ─── User Defaults ─── */
const userDefaults = {
  company: "",
};

/* ─── Dashboard data types ─── */
type UserContext = { targetRole?: string; targetCompany?: string; industry?: string; interviewDate?: string } | null;
interface DashboardSession {
  id: string;
  date: string;
  dateLabel: string;
  type: string;
  role: string;
  score: number;
  change: number;
  duration: string;
  topStrength: string;
  topWeakness: string;
  feedback: string;
  transcript: { speaker: string; text: string; scoreNote?: string }[];
  questionScores: { question: string; score: number; notes: string }[];
}

interface SkillData {
  name: string;
  score: number;
  prev: number;
  color: string;
}

interface TrendPoint {
  score: number;
  date: string;
  type: string;
}

/* ─── Compute dynamic data from real sessions only ─── */
function getSessionData(targetRole: string, supabaseSessions: RealSession[] = []) {
  const local = loadRealSessionsLocal();
  // Merge local + Supabase, deduplicating by id
  const seen = new Set<string>();
  const merged: RealSession[] = [];
  for (const s of [...local, ...supabaseSessions]) {
    if (!seen.has(s.id)) { seen.add(s.id); merged.push(s); }
  }
  // Sort by date descending
  merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const real = merged;
  const realConverted = realSessionsToDashboard(real, targetRole);
  const recentSessions = realConverted;

  // Build score trend from real sessions only
  const scoreTrend = real.slice().reverse().map(rs => ({
    score: rs.score,
    date: new Date(rs.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    type: normalizeType(rs.type),
  }));

  // Compute skills from real session skill_scores
  const skills: SkillData[] = [];
  if (real.length > 0) {
    const skillMap: Record<string, number[]> = {};
    real.forEach(rs => {
      if (rs.skill_scores) {
        Object.entries(rs.skill_scores).forEach(([name, score]) => {
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

  // Compute overall stats
  const allScores = recentSessions.map(s => s.score);
  const overallStats = {
    sessionsCompleted: recentSessions.length,
    avgScore: allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0,
    improvement: real.length >= 2 ? Math.max(0, real[0].score - real[real.length - 1].score) : 0,
    hoursLogged: Math.round((recentSessions.reduce((sum, s) => sum + parseInt(s.duration), 0) / 60) * 10) / 10,
  };

  return { recentSessions, scoreTrend, skills, overallStats, hasData: real.length > 0 };
}

/* ─── Personalized AI Insights Generator ─── */
function generatePersonalizedInsights(user: UserContext, sk?: SkillData[]) {
  const insights: { type: string; text: string }[] = [];
  const role = user?.targetRole || "your target role";
  const company = user?.targetCompany;
  const industry = user?.industry;
  const theSkills = sk || [];

  if (theSkills.length === 0) {
    // New user — show onboarding tips
    insights.push({ type: "tip", text: `Complete your first practice session to get personalized insights about your ${role} interview readiness.` });
    insights.push({ type: "tip", text: "Each session evaluates you on communication, strategic thinking, leadership presence, and more." });
    if (company) {
      insights.push({ type: "tip", text: `We'll tailor questions to ${company}'s interview style and ${industry || "your"} industry.` });
    }
    return insights;
  }

  // Find strongest and weakest skills
  const weakest = [...theSkills].sort((a, b) => a.score - b.score)[0];
  const mostImproved = [...theSkills].sort((a, b) => (b.score - b.prev) - (a.score - a.prev))[0];

  insights.push({
    type: "strength",
    text: `Your ${mostImproved.name.toLowerCase()} has improved ${mostImproved.score - mostImproved.prev} points — keep leading with this in your answers.`,
  });
  insights.push({
    type: "weakness",
    text: `${weakest.name} is at ${weakest.score}/100. ${company ? `For ${company}, this` : "This"} skill is critical for ${role} — try a focused session.`,
  });
  if (company && industry) {
    insights.push({
      type: "tip",
      text: `${company} interviews in ${industry} often emphasize cross-functional leadership. Prepare 2-3 stories about driving alignment across engineering, product, and business.`,
    });
  } else {
    insights.push({
      type: "tip",
      text: `For ${role} interviews, prepare stories about scaling teams, managing up, and quantifying business impact with specific metrics.`,
    });
  }
  return insights;
}

/* ─── Personalized Notifications Generator ─── */
function generateNotifications(user: UserContext, streak: number, weekActivity: boolean[], sessions: DashboardSession[]) {
  const notifs: { id: number; type: string; text: string; dismissible: boolean; action?: string }[] = [];
  const sessionsCount = sessions.length;
  const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

  // Streak warning
  const missedDays = weekActivity.slice(0, todayIdx).filter(d => !d).length;
  if (missedDays > 0 && streak < 3) {
    notifs.push({ id: 1, type: "streak", text: `You've missed ${missedDays} day${missedDays > 1 ? "s" : ""} this week — practice today to build momentum!`, dismissible: true });
  }

  // Milestone celebrations
  if (sessionsCount === 1) notifs.push({ id: 10, type: "milestone", text: "You completed your first session! The hardest part is starting.", dismissible: true });
  if (sessionsCount === 5) notifs.push({ id: 11, type: "milestone", text: "5 sessions complete! You're building real interview muscle memory.", dismissible: true, action: "View Report" });
  if (sessionsCount >= 10) notifs.push({ id: 12, type: "milestone", text: `${sessionsCount} sessions completed! You're in the top 10% of users.`, dismissible: true, action: "View Report" });

  // Score milestone
  const latestScore = sessions[0]?.score;
  if (latestScore >= 90) notifs.push({ id: 20, type: "milestone", text: `You hit ${latestScore}! Your highest score yet. You're interview-ready.`, dismissible: true });

  // Interview date countdown (from onboarding)
  if (user?.interviewDate) {
    const days = Math.ceil((new Date(user.interviewDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days > 0 && days <= 3) notifs.push({ id: 30, type: "streak", text: `Your interview is in ${days} day${days > 1 ? "s" : ""}! Time for one final prep session.`, dismissible: false });
    else if (days > 0 && days <= 7) notifs.push({ id: 31, type: "streak", text: `${days} days until your interview — aim for daily practice this week.`, dismissible: true });
  }

  // Calendar event reminders
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

/* ─── Personalized Goals Generator ─── */
function generateGoals(user: UserContext, weekActivity: boolean[], sk?: SkillData[]) {
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

/* ─── Streak-Aware Greeting ─── */
function getPersonalizedGreeting(name: string, streak: number, sessionsCount: number) {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (sessionsCount === 0) return `${timeGreeting}, ${name}. Ready for your first session?`;
  if (streak >= 7) return `${timeGreeting}, ${name}. ${streak}-day streak — you're on fire!`;
  if (streak >= 3) return `${timeGreeting}, ${name}. ${streak} days strong — keep the momentum.`;
  if (streak === 0) return `${timeGreeting}, ${name}. Time to get back on track.`;
  return `${timeGreeting}, ${name}`;
}

/* ─── Smart Scheduling ─── */
function getSmartScheduleSuggestion(user: UserContext): string | null {
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

/* ─── Return User Context ─── */
function getReturnContext(sessions: DashboardSession[]): string | null {
  if (sessions.length === 0) return null;
  const last = sessions[0];
  return `Last session: ${last.type} (${last.score}/100) — ${last.topWeakness.toLowerCase()} needs work.`;
}

/* ─── Prep Plan Timeline ─── */
function getPrepPlan(user: UserContext, sessions: DashboardSession[], sk?: SkillData[]): { label: string; done: boolean }[] | null {
  if (!user?.interviewDate) return null;
  const days = Math.ceil((new Date(user.interviewDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return null;
  const sessionsCount = sessions.length;
  const theSkills = sk || [];
  const weakest = theSkills.length > 0 ? [...theSkills].sort((a, b) => a.score - b.score)[0] : null;

  const plan: { label: string; done: boolean }[] = [
    { label: "Complete onboarding and first session", done: sessionsCount >= 1 },
    { label: "Try all interview types at least once", done: new Set(sessions.map(s => s.type)).size >= 3 },
    { label: weakest ? `Focus on ${weakest.name} (currently ${weakest.score}/100)` : "Identify your weakest skill area", done: weakest ? weakest.score >= 80 : false },
    { label: "Score 85+ on 3 consecutive sessions", done: sessions.slice(0, 3).every(s => s.score >= 85) },
    { label: "Complete a full mock at Intense difficulty", done: false },
    { label: "Final review session day before interview", done: days <= 1 && sessionsCount >= 5 },
  ];
  return plan;
}

const sessionTypes = ["All", "Behavioral", "Strategic", "Technical Leadership", "Case Study"];

/* ─── Helpers ─── */
function scoreLabel(score: number) {
  if (score >= 85) return "Strong";
  if (score >= 75) return "Good";
  return "Needs work";
}
function scoreLabelColor(score: number) {
  if (score >= 85) return c.sage;
  if (score >= 75) return c.gilt;
  return c.ember;
}
function daysUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
function computeReadiness(trend: { score: number }[], sk: SkillData[]) {
  if (trend.length === 0 || sk.length === 0) return 0;
  const latestScore = trend[trend.length - 1].score;
  const avgSkill = sk.reduce((sum, s) => sum + s.score, 0) / sk.length;
  const consistencyBonus = 6 / 7 * 10;
  return Math.round(latestScore * 0.4 + avgSkill * 0.4 + consistencyBonus * 2);
}

/* Dynamic streak calculation from session dates */
function computeWeekActivity(sessions: DashboardSession[]): boolean[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const days: boolean[] = [false, false, false, false, false, false, false];
  const today = now.getDay(); // 0=Sun, 1=Mon...
  const todayIdx = today === 0 ? 6 : today - 1; // convert to Mon=0

  sessions.forEach(s => {
    const sessionDate = new Date(s.date);
    const diff = Math.floor((sessionDate.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24));
    if (diff >= 0 && diff < 7) {
      days[diff] = true;
    }
  });

  return days.map((practiced, i) => {
    if (i > todayIdx) return false; // future days
    return practiced;
  });
}

function computeStreak(sessions: DashboardSession[]): number {
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

/* Generate progress report text */
function generateReport(userName: string, stats: { sessionsCompleted: number; avgScore: number; hoursLogged: number }, sk: SkillData[], sessions: DashboardSession[]) {
  const avgScore = stats.avgScore;
  const topSkill = [...sk].sort((a, b) => b.score - a.score)[0];
  const weakSkill = [...sk].sort((a, b) => a.score - b.score)[0];
  const totalImprovement = sk.reduce((sum, s) => sum + (s.score - s.prev), 0);

  return `LEVEL UP INTERVIEWS — PROGRESS REPORT
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
Generated by Level Up Interviews AI
Share this report with your coach or mentor.`;
}

/* ─── Interview Events (Calendar Integration) ─── */
interface InterviewEvent {
  id: string;
  title: string;
  company: string;
  type: string; // "Phone Screen" | "Technical" | "Behavioral" | "System Design" | "Culture Fit" | "Final Round" | "Other"
  date: string; // ISO date string
  time: string; // HH:mm
  duration: number; // minutes
  location: string; // "Zoom", "Google Meet", "On-site", URL, etc.
  notes: string;
  status: "upcoming" | "completed" | "cancelled";
  reminders: boolean;
}

const EVENTS_KEY = "levelup_events";

function loadEvents(): InterviewEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveEvents(events: InterviewEvent[]) {
  try { localStorage.setItem(EVENTS_KEY, JSON.stringify(events)); } catch {}
}

function generateEventId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function daysUntilEvent(date: string, time: string): number {
  const eventDate = new Date(`${date}T${time}`);
  return Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatEventDate(date: string): string {
  return new Date(date + "T00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatEventTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/* Generate .ics file content */
function generateICS(event: InterviewEvent): string {
  const start = new Date(`${event.date}T${event.time}`);
  const end = new Date(start.getTime() + event.duration * 60000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Level Up Interviews//EN",
    "BEGIN:VEVENT",
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${event.title} — ${event.company}`,
    `DESCRIPTION:Interview Type: ${event.type}\\n${event.notes ? "Notes: " + event.notes.replace(/\n/g, "\\n") : ""}`,
    `LOCATION:${event.location}`,
    `STATUS:${event.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:Interview in 30 minutes: ${event.title}`,
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:Interview tomorrow: ${event.title} at ${event.company}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/* Generate Google Calendar URL */
function generateGoogleCalendarURL(event: InterviewEvent): string {
  const start = new Date(`${event.date}T${event.time}`);
  const end = new Date(start.getTime() + event.duration * 60000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${event.title} — ${event.company}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: `Interview Type: ${event.type}\n${event.notes || ""}`,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const interviewTypeOptions = ["Phone Screen", "Technical", "Behavioral", "System Design", "Culture Fit", "Final Round", "Other"];

/* ─── Sidebar Nav ─── */
const navItems = [
  { id: "dashboard", label: "Dashboard", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
  { id: "sessions", label: "Sessions", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg> },
  { id: "calendar", label: "Calendar", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { id: "analytics", label: "Analytics", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> },
  { id: "resume", label: "Resume", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> },
  { id: "settings", label: "Settings", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
];

/* ─── Score Trend Chart with tooltips ─── */
function ScoreTrendChart({ data }: { data: typeof scoreTrend }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const w = 400, h = 140, px = 24, py = 20;
  const scores = data.map(d => d.score);
  const min = Math.min(...scores) - 5;
  const max = Math.max(...scores) + 5;
  const points = scores.map((v, i) => ({
    x: px + (i / (scores.length - 1)) * (w - px * 2),
    y: py + (1 - (v - min) / (max - min)) * (h - py * 2),
  }));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${points[points.length - 1].x},${h} L${points[0].x},${h} Z`;

  return (
    <div style={{ position: "relative" }}>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}
        role="img" aria-label={`Score trend from ${scores[0]} to ${scores[scores.length - 1]}`}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.gilt} stopOpacity="0.2" />
            <stop offset="100%" stopColor={c.gilt} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => {
          const y = py + (i / 3) * (h - py * 2);
          const val = Math.round(max - (i / 3) * (max - min));
          return (
            <g key={i}>
              <line x1={px} y1={y} x2={w - px} y2={y} stroke={c.border} strokeWidth="1" />
              <text x={px - 4} y={y + 3} textAnchor="end" fontFamily={font.mono} fontSize="8" fill={c.stone}>{val}</text>
            </g>
          );
        })}
        <path d={area} fill="url(#trendGrad)" />
        <path d={line} fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="12" fill="transparent" onMouseEnter={() => setHovered(i)} style={{ cursor: "pointer" }} />
            <circle cx={p.x} cy={p.y} r={hovered === i ? 5 : i === points.length - 1 ? 4 : 2.5}
              fill={hovered === i || i === points.length - 1 ? c.gilt : c.graphite}
              stroke={c.gilt} strokeWidth={hovered === i || i === points.length - 1 ? 2 : 1.5} />
          </g>
        ))}
        {hovered !== null && (() => {
          const px2 = points[hovered].x;
          const tooltipW = 84;
          const clampedX = Math.max(tooltipW / 2, Math.min(w - tooltipW / 2, px2));
          return (
            <g>
              <rect x={clampedX - 42} y={points[hovered].y - 44} width={tooltipW} height="34" rx="6" fill={c.graphite} stroke={c.border} strokeWidth="1" />
              <text x={clampedX} y={points[hovered].y - 30} textAnchor="middle" fontFamily={font.mono} fontSize="12" fontWeight="600" fill={c.ivory}>{data[hovered].score}</text>
              <text x={clampedX} y={points[hovered].y - 17} textAnchor="middle" fontFamily={font.ui} fontSize="8" fill={c.stone}>{data[hovered].date} · {data[hovered].type}</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

/* ─── Skill Radar ─── */
function SkillRadar({ skills: s }: { skills: typeof skills }) {
  const size = 200, cx = size / 2, cy = size / 2, r = 70;
  const n = s.length;
  const getPoint = (i: number, val: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const dist = (val / 100) * r;
    return { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist };
  };
  const polygon = s.map((sk, i) => getPoint(i, sk.score)).map(p => `${p.x},${p.y}`).join(" ");
  const prevPolygon = s.map((sk, i) => getPoint(i, sk.prev)).map(p => `${p.x},${p.y}`).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }} role="img" aria-label="Skill radar chart">
      {[25, 50, 75, 100].map((v) => (
        <polygon key={v} points={Array.from({ length: n }).map((_, i) => getPoint(i, v)).map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke={c.border} strokeWidth="1" />
      ))}
      {s.map((_, i) => { const p = getPoint(i, 100); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={c.border} strokeWidth="1" />; })}
      <polygon points={prevPolygon} fill="rgba(201,169,110,0.05)" stroke={c.stone} strokeWidth="1" strokeDasharray="3 3" />
      <polygon points={polygon} fill="rgba(201,169,110,0.1)" stroke={c.gilt} strokeWidth="1.5" />
      {s.map((sk, i) => {
        const p = getPoint(i, sk.score);
        const lp = getPoint(i, 115);
        return (
          <g key={sk.name}>
            <circle cx={p.x} cy={p.y} r="3" fill={c.gilt} />
            <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fontFamily={font.ui} fontSize="8" fontWeight="500" fill={c.stone}>{sk.name.split(" ")[0]}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ─── Welcome Dashboard (no sessions yet) ─── */
function EmptyState({ onStart, userName, targetRole, isMobile }: { onStart: () => void; userName: string; targetRole: string; isMobile?: boolean }) {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = userName ? userName.split(" ")[0] : "there";

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Welcome header */}
      <h1 style={{ fontFamily: font.ui, fontSize: isMobile ? 20 : 26, fontWeight: 600, color: c.ivory, marginBottom: 6 }}>
        {timeGreeting}, {firstName}
      </h1>
      <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, marginBottom: 32 }}>
        {targetRole ? `Let's get you ready for your ${targetRole} interview.` : "Let's get you interview-ready."}
      </p>

      {/* Hero CTA card */}
      <div style={{
        background: `linear-gradient(135deg, rgba(201,169,110,0.1) 0%, ${c.graphite} 100%)`,
        borderRadius: 16, border: `1px solid rgba(201,169,110,0.15)`,
        padding: isMobile ? "32px 24px" : "48px 40px",
        textAlign: "center", marginBottom: 28,
      }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, margin: "0 auto 24px", background: "rgba(201,169,110,0.08)", border: `1px solid rgba(201,169,110,0.2)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 60px rgba(201,169,110,0.08)" }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
        </div>
        <h2 style={{ fontFamily: font.display, fontSize: isMobile ? 22 : 28, fontWeight: 400, color: c.ivory, marginBottom: 10, letterSpacing: "-0.02em" }}>
          Start your first mock interview
        </h2>
        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6, marginBottom: 28, maxWidth: 420, margin: "0 auto 28px" }}>
          Our AI interviewer will ask you real questions, listen to your answers, and give you detailed feedback — just like a real interview, but without the pressure.
        </p>
        <button className="shimmer-btn" onClick={onStart}
          style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 500, padding: "14px 36px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10, boxShadow: "0 8px 32px rgba(201,169,110,0.15)" }}
          onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21" /></svg>
          Begin Practice Session
        </button>
      </div>

      {/* How it works */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { step: "1", title: "Choose your focus", desc: "Pick an interview type — behavioral, strategic, technical leadership, or case study.", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
          { step: "2", title: "Practice with AI", desc: "Answer questions out loud. Our AI listens, adapts, and follows up — like a real interviewer.", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg> },
          { step: "3", title: "Get scored & coached", desc: "Receive detailed scores, skill breakdowns, and AI coaching tips after every session.", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> },
        ].map((item) => (
          <div key={item.step} style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              {item.icon}
              <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.stone, letterSpacing: "0.08em" }}>STEP {item.step}</span>
            </div>
            <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 6 }}>{item.title}</h3>
            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, lineHeight: 1.5 }}>{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Quick stats bar */}
      <div style={{ display: "flex", justifyContent: "center", gap: isMobile ? 24 : 48, padding: "20px 0", borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}` }}>
        {[
          { value: "~15 min", label: "Per session" },
          { value: "5", label: "Skill dimensions" },
          { value: "AI", label: "Personalized questions" },
          { value: "Free", label: "To get started" },
        ].map((item) => (
          <div key={item.label} style={{ textAlign: "center" }}>
            <span style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 600, color: c.gilt, display: "block", marginBottom: 2 }}>{item.value}</span>
            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Session Detail View */
function SessionDetailView({ session, onBack }: { session: DashboardSession; onBack: () => void }) {
  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: font.ui, fontSize: 13, color: c.stone, background: "none", border: "none", cursor: "pointer", padding: "0 0 20px", outline: "none" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = c.ivory; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Dashboard
      </button>

      {/* Session summary card */}
      <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "28px 32px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.gilt, background: "rgba(201,169,110,0.08)", padding: "4px 10px", borderRadius: 4 }}>{session.type}</span>
              <span style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>{session.dateLabel} · {session.duration}</span>
            </div>
            <h2 style={{ fontFamily: font.ui, fontSize: 22, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>{session.role}</h2>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", border: `3px solid ${scoreLabelColor(session.score)}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: font.mono, fontSize: 26, fontWeight: 700, color: c.ivory, lineHeight: 1 }}>{session.score}</span>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: scoreLabelColor(session.score), marginTop: 2 }}>{scoreLabel(session.score)}</span>
            </div>
            <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 600, color: session.change > 0 ? c.sage : c.ember, display: "block", marginTop: 4 }}>
              {session.change > 0 ? "+" : ""}{session.change} vs previous
            </span>
          </div>
        </div>

        {/* Strengths / Weaknesses */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(122,158,126,0.04)", border: `1px solid rgba(122,158,126,0.12)` }}>
            <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.sage, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Top Strength</span>
            <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, color: c.ivory }}>{session.topStrength}</span>
          </div>
          <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(196,112,90,0.04)", border: `1px solid rgba(196,112,90,0.12)` }}>
            <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.ember, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>To Improve</span>
            <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, color: c.ivory }}>{session.topWeakness}</span>
          </div>
        </div>
      </div>

      {/* Question-by-question scoring */}
      <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "28px 32px", marginBottom: 20 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, marginBottom: 20 }}>Question Scores</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {session.questionScores.map((q, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", borderRadius: 10, background: c.obsidian, border: `1px solid ${c.border}` }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", border: `2px solid ${scoreLabelColor(q.score)}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 600, color: c.ivory }}>{q.score}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, display: "block", marginBottom: 2 }}>{q.question}</span>
                <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>{q.notes}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transcript */}
      <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "28px 32px", marginBottom: 20 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, marginBottom: 20 }}>Full Transcript</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {session.transcript.map((msg, i) => (
            <div key={i} style={{ display: "flex", gap: 12, flexDirection: msg.speaker === "user" ? "row-reverse" : "row" }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                background: msg.speaker === "ai" ? "rgba(201,169,110,0.1)" : "rgba(122,158,126,0.1)",
                border: `1px solid ${msg.speaker === "ai" ? "rgba(201,169,110,0.2)" : "rgba(122,158,126,0.2)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {msg.speaker === "ai" ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2m-9-11h2m18 0h2M5.6 5.6l1.4 1.4m9.9 9.9l1.4 1.4M5.6 18.4l1.4-1.4m9.9-9.9l1.4-1.4"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                )}
              </div>
              <div style={{ maxWidth: "75%", minWidth: 0 }}>
                <div style={{
                  padding: "12px 16px", borderRadius: 12, fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.6,
                  background: msg.speaker === "ai" ? c.obsidian : "rgba(122,158,126,0.04)",
                  border: `1px solid ${msg.speaker === "ai" ? c.border : "rgba(122,158,126,0.1)"}`,
                  borderTopLeftRadius: msg.speaker === "ai" ? 4 : 12,
                  borderTopRightRadius: msg.speaker === "user" ? 4 : 12,
                }}>
                  {msg.text}
                </div>
                {msg.scoreNote && (
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone, display: "block", marginTop: 4, textAlign: msg.speaker === "ai" ? "left" : "right", paddingLeft: msg.speaker === "ai" ? 16 : 0, paddingRight: msg.speaker === "user" ? 16 : 0 }}>
                    {msg.scoreNote}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Feedback */}
      <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "28px 32px" }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, marginBottom: 12 }}>AI Coach Summary</h3>
        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, lineHeight: 1.7, margin: 0 }}>{session.feedback}</p>
      </div>
    </div>
  );
}

/* ─── AI Resume Profile ─── */
interface ResumeProfile {
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

async function analyzeResumeWithAI(resumeText: string, targetRole?: string): Promise<ResumeProfile | null> {
  try {
    const res = await fetch("/api/analyze-resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText, targetRole }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.profile || null;
  } catch {
    return null;
  }
}

/* ─── Resume Page ─── */
function ResumePage({ resumeFileName, onUpdateResume }: { resumeFileName: string | null; onUpdateResume: (fileName: string | null, resumeText: string) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState(resumeFileName);
  const [resumeText, setResumeText] = useState("");
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [phase, setPhase] = useState<"idle" | "extracting" | "analyzing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const { user, updateUser } = useAuth();

  // Restore profile from user context on mount
  useEffect(() => {
    if (user?.resumeText) setResumeText(user.resumeText);
    // Only restore if it's a valid ResumeProfile (has headline field, not old ParsedResume)
    const stored = user?.resumeData as unknown as ResumeProfile | undefined;
    if (stored && stored.headline) {
      setProfile(stored);
      setPhase("done");
    }
  }, []);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setErrorMsg("");
    setProfile(null);

    // Phase 1: Extract text
    setPhase("extracting");
    let text: string;
    try {
      text = await extractResumeText(file);
      setResumeText(text);
      onUpdateResume(file.name, text);
      updateUser({ resumeFileName: file.name, resumeText: text });
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to parse resume");
      setPhase("error");
      return;
    }

    // Phase 2: AI analysis
    setPhase("analyzing");
    const aiProfile = await analyzeResumeWithAI(text, user?.targetRole);
    if (aiProfile) {
      setProfile(aiProfile);
      updateUser({ resumeData: aiProfile as unknown as ParsedResume });
      setPhase("done");
    } else {
      // Fallback: build a basic profile from regex parsing
      const parsed = parseResumeData(text);
      const fallback: ResumeProfile = {
        headline: parsed.name || "Resume uploaded",
        summary: parsed.summary || "Your resume has been uploaded and will be used to personalize your interview questions.",
        yearsExperience: null,
        seniorityLevel: "",
        topSkills: parsed.skills.slice(0, 8),
        keyAchievements: parsed.experience.flatMap(e => e.bullets).slice(0, 5),
        industries: [],
        interviewStrengths: [],
        interviewGaps: [],
        careerTrajectory: "",
      };
      setProfile(fallback);
      updateUser({ resumeData: fallback as unknown as ParsedResume });
      setPhase("done");
    }
  };

  const handleRemove = () => {
    setFileName(null);
    setResumeText("");
    setProfile(null);
    setPhase("idle");
    setErrorMsg("");
    onUpdateResume(null, "");
    updateUser({ resumeFileName: null, resumeText: undefined, resumeData: undefined });
  };

  const handleReanalyze = async () => {
    if (!resumeText) return;
    setPhase("analyzing");
    const aiProfile = await analyzeResumeWithAI(resumeText, user?.targetRole);
    if (aiProfile) {
      setProfile(aiProfile);
      updateUser({ resumeData: aiProfile as unknown as ParsedResume });
    }
    setPhase("done");
  };

  const triggerUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.docx,.txt";
    input.onchange = (e) => { handleFile((e.target as HTMLInputElement).files?.[0]); };
    input.click();
  };

  // ─── Analyzing state ───
  if (phase === "extracting" || phase === "analyzing") {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 0" }}>
        <div style={{ background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`, padding: "60px 40px", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, margin: "0 auto 24px", background: "rgba(201,169,110,0.06)", border: "1px solid rgba(201,169,110,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 24, height: 24, border: "2.5px solid rgba(201,169,110,0.2)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
          <h2 style={{ fontFamily: font.display, fontSize: 24, color: c.ivory, marginBottom: 8, letterSpacing: "-0.02em" }}>
            {phase === "extracting" ? "Reading your resume" : "Building your profile"}
          </h2>
          <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6, maxWidth: 380, margin: "0 auto" }}>
            {phase === "extracting"
              ? "Extracting text from your document..."
              : "AI is analyzing your experience, skills, and achievements to create a personalized candidate profile..."}
          </p>
          {fileName && (
            <div style={{ marginTop: 20, display: "inline-flex", alignItems: "center", gap: 8, background: c.obsidian, borderRadius: 8, padding: "8px 16px", border: `1px solid ${c.border}` }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>{fileName}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Empty state (no resume or no profile) ───
  if (phase === "idle") {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 0" }}>
        <h2 style={{ fontFamily: font.display, fontSize: 28, fontWeight: 400, color: c.ivory, marginBottom: 6, letterSpacing: "-0.02em" }}>Resume Intelligence</h2>
        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, marginBottom: 28, lineHeight: 1.6 }}>
          Upload your resume and our AI will build a candidate profile — identifying your strengths, key achievements, and areas to prepare for interviews.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={triggerUpload}
          style={{
            border: `2px dashed ${isDragging ? c.gilt : "rgba(201,169,110,0.2)"}`,
            borderRadius: 16, padding: "64px 32px", textAlign: "center",
            background: isDragging ? "rgba(201,169,110,0.04)" : "transparent",
            transition: "all 0.2s ease", cursor: "pointer",
          }}
        >
          <div style={{ width: 64, height: 64, borderRadius: 16, margin: "0 auto 20px", background: "rgba(201,169,110,0.06)", border: "1px solid rgba(201,169,110,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <p style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 500, color: c.ivory, marginBottom: 6 }}>Drop your resume here</p>
          <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 20 }}>or click to browse</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
            {["PDF", "DOCX", "TXT"].map((type) => (
              <span key={type} style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.stone, background: c.graphite, padding: "4px 12px", borderRadius: 4, border: `1px solid ${c.border}` }}>{type}</span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 20, padding: "12px 16px", borderRadius: 8, background: "rgba(201,169,110,0.03)", border: `1px solid ${c.border}` }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Your resume is analyzed securely and never shared. Delete anytime.</span>
        </div>
      </div>
    );
  }

  // ─── Error state ───
  if (phase === "error") {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 0" }}>
        <h2 style={{ fontFamily: font.display, fontSize: 28, fontWeight: 400, color: c.ivory, marginBottom: 6, letterSpacing: "-0.02em" }}>Resume Intelligence</h2>
        <div style={{ background: c.graphite, borderRadius: 14, border: "1px solid rgba(196,112,90,0.15)", padding: "32px", textAlign: "center", marginTop: 20 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, margin: "0 auto 16px", background: "rgba(196,112,90,0.08)", border: "1px solid rgba(196,112,90,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <p style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, color: c.ivory, marginBottom: 4 }}>Couldn't process this file</p>
          <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 20 }}>{errorMsg}</p>
          <button onClick={triggerUpload} style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.obsidian, background: c.gilt, border: "none", borderRadius: 8, padding: "10px 24px", cursor: "pointer" }}>Try another file</button>
        </div>
      </div>
    );
  }

  // ─── Profile view (done state) ───
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 0" }}>
      {/* Profile header */}
      <div style={{ background: `linear-gradient(135deg, ${c.graphite} 0%, rgba(201,169,110,0.04) 100%)`, borderRadius: 16, border: `1px solid ${c.border}`, padding: "28px 28px 24px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            {profile?.headline && (
              <h2 style={{ fontFamily: font.display, fontSize: 24, color: c.ivory, marginBottom: 6, letterSpacing: "-0.02em", lineHeight: 1.3 }}>{profile.headline}</h2>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {profile?.seniorityLevel && (
                <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt, background: "rgba(201,169,110,0.08)", border: "1px solid rgba(201,169,110,0.15)", borderRadius: 5, padding: "3px 10px", letterSpacing: "0.02em" }}>{profile.seniorityLevel}</span>
              )}
              {profile?.yearsExperience && (
                <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{profile.yearsExperience}+ years experience</span>
              )}
              {profile?.industries && profile.industries.length > 0 && (
                <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{profile.industries.join(", ")}</span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 16 }}>
            <button onClick={handleReanalyze} title="Re-analyze" style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(240,237,232,0.04)", border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(240,237,232,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(240,237,232,0.04)"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>
            <button onClick={handleRemove} title="Remove resume" style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(196,112,90,0.04)", border: "1px solid rgba(196,112,90,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(196,112,90,0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(196,112,90,0.04)"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>

        {/* Summary narrative */}
        {profile?.summary && (
          <p style={{ fontFamily: font.ui, fontSize: 13.5, color: c.chalk, lineHeight: 1.7, margin: 0 }}>{profile.summary}</p>
        )}

        {/* Career trajectory */}
        {profile?.careerTrajectory && (
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, background: "rgba(122,158,126,0.04)", border: "1px solid rgba(122,158,126,0.1)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.sage }}>{profile.careerTrajectory}</span>
          </div>
        )}

        {/* File info */}
        {fileName && (
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{fileName}</span>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, opacity: 0.5 }}>·</span>
            <button onClick={triggerUpload} style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", textUnderlineOffset: 2 }}>Replace</button>
          </div>
        )}
      </div>

      {/* Top Skills */}
      {profile?.topSkills && profile.topSkills.length > 0 && (
        <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 24px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Top Skills</h3>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {profile.topSkills.map((skill, i) => (
              <span key={i} style={{
                fontFamily: font.ui, fontSize: 12.5, color: i < 3 ? c.ivory : c.chalk,
                background: i < 3 ? "rgba(201,169,110,0.1)" : "rgba(240,237,232,0.04)",
                border: `1px solid ${i < 3 ? "rgba(201,169,110,0.18)" : c.border}`,
                borderRadius: 8, padding: "6px 14px", fontWeight: i < 3 ? 500 : 400,
              }}>{skill}</span>
            ))}
          </div>
        </div>
      )}

      {/* Key Achievements */}
      {profile?.keyAchievements && profile.keyAchievements.length > 0 && (
        <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 24px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>
            <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Key Achievements</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {profile.keyAchievements.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "12px 16px", borderRadius: 10, background: c.obsidian, border: `1px solid ${c.border}` }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(201,169,110,0.08)", border: "1px solid rgba(201,169,110,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.5, margin: 0 }}>{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interview Readiness — two columns */}
      {((profile?.interviewStrengths && profile.interviewStrengths.length > 0) || (profile?.interviewGaps && profile.interviewGaps.length > 0)) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          {/* Strengths */}
          {profile?.interviewStrengths && profile.interviewStrengths.length > 0 && (
            <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <h3 style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Interview Strengths</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {profile.interviewStrengths.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.sage, flexShrink: 0, marginTop: 6 }} />
                    <span style={{ fontFamily: font.ui, fontSize: 12.5, color: c.chalk, lineHeight: 1.5 }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gaps */}
          {profile?.interviewGaps && profile.interviewGaps.length > 0 && (
            <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <h3 style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Areas to Prepare</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {profile.interviewGaps.map((g, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.gilt, flexShrink: 0, marginTop: 6 }} />
                    <span style={{ fontFamily: font.ui, fontSize: 12.5, color: c.chalk, lineHeight: 1.5 }}>{g}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 8, background: "rgba(201,169,110,0.03)", border: `1px solid ${c.border}` }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Your resume is analyzed securely and never shared. Delete anytime.</span>
      </div>
    </div>
  );
}

/* ─── Sessions Page ─── */
function SessionsPage({ sessions, onNewSession }: {
  sessions: DashboardSession[];
  onNewSession: () => void;
}) {
  const sessionNav = useNavigate();
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = sessions
    .filter(s => filter === "All" || s.type === filter)
    .filter(s => {
      if (!search) return true;
      const q = search.toLowerCase();
      return s.type.toLowerCase().includes(q) || s.topStrength.toLowerCase().includes(q) || s.topWeakness.toLowerCase().includes(q);
    });

  if (sessions.length === 0) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center", padding: "60px 20px" }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, margin: "0 auto 24px", background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.15)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
        </div>
        <h2 style={{ fontFamily: font.ui, fontSize: 22, fontWeight: 600, color: c.ivory, marginBottom: 8 }}>No sessions yet</h2>
        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6, marginBottom: 28 }}>
          Complete your first practice interview and it will show up here with detailed scores, feedback, and a full transcript.
        </p>
        <button onClick={onNewSession} className="shimmer-btn"
          style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, padding: "12px 32px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}
          onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21" /></svg>
          Start Your First Session
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h2 style={{ fontFamily: font.ui, fontSize: 22, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Sessions</h2>
          <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>{sessions.length} session{sessions.length !== 1 ? "s" : ""} completed</p>
        </div>
        <button onClick={onNewSession} className="shimmer-btn"
          style={{
            fontFamily: font.ui, fontSize: 13, fontWeight: 500, padding: "10px 24px",
            borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          New Session
        </button>
      </div>

      {/* Search + filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search by type, strength, weakness..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "9px 12px 9px 34px", fontFamily: font.ui, fontSize: 13, color: c.ivory, background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box" }}
            onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
            onBlur={(e) => e.currentTarget.style.borderColor = c.border}
          />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {sessionTypes.map(type => (
            <button key={type} onClick={() => setFilter(type)}
              style={{
                fontFamily: font.ui, fontSize: 11, fontWeight: 500, padding: "7px 14px",
                borderRadius: 100, cursor: "pointer",
                background: filter === type ? "rgba(201,169,110,0.1)" : "transparent",
                border: `1px solid ${filter === type ? c.gilt : c.border}`,
                color: filter === type ? c.gilt : c.stone,
                transition: "all 0.2s ease", outline: "none",
              }}>{type}</button>
          ))}
        </div>
      </div>

      {/* Session list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, marginBottom: 16 }}>
              {search ? `No sessions matching "${search}"` : "No sessions in this category yet."}
            </p>
            <button onClick={onNewSession}
              style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.gilt, background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.15)`, borderRadius: 8, padding: "10px 24px", cursor: "pointer" }}>
              Start a {filter !== "All" ? filter : ""} Session
            </button>
          </div>
        ) : (
          filtered.map(session => (
            <button key={session.id}
              onClick={() => sessionNav(`/session/${session.id}`)}
              style={{
                width: "100%", padding: "18px 20px", borderRadius: 14, textAlign: "left",
                background: c.graphite, border: `1px solid ${c.border}`,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 18,
                transition: "all 0.2s ease", outline: "none",
              }}
              onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px ${c.gilt}40`}
              onBlur={(e) => e.currentTarget.style.boxShadow = "none"}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.borderHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; }}
            >
              {/* Score circle */}
              <div style={{
                width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
                border: `2.5px solid ${scoreLabelColor(session.score)}`,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 700, color: c.ivory, lineHeight: 1 }}>{session.score}</span>
                <span style={{ fontFamily: font.ui, fontSize: 8, color: scoreLabelColor(session.score), fontWeight: 600, marginTop: 1 }}>{scoreLabel(session.score)}</span>
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>{session.type}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.gilt, background: "rgba(201,169,110,0.08)", padding: "2px 8px", borderRadius: 4 }}>{session.role}</span>
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>
                    <span style={{ color: c.sage, fontWeight: 500 }}>{session.topStrength}</span>
                  </span>
                  <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>
                    Improve: <span style={{ color: c.ember, fontWeight: 500 }}>{session.topWeakness}</span>
                  </span>
                </div>
              </div>

              {/* Meta */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 2 }}>{session.dateLabel}</span>
                <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{session.duration}</span>
              </div>

              {/* Change badge */}
              <div style={{
                padding: "4px 10px", borderRadius: 6, flexShrink: 0,
                background: session.change > 0 ? "rgba(122,158,126,0.08)" : "rgba(196,112,90,0.08)",
                border: `1px solid ${session.change > 0 ? "rgba(122,158,126,0.15)" : "rgba(196,112,90,0.15)"}`,
              }}>
                <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 600, color: session.change > 0 ? c.sage : c.ember }}>
                  {session.change > 0 ? "+" : ""}{session.change}
                </span>
              </div>

              {/* Arrow */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ANALYTICS PAGE
   ═══════════════════════════════════════════════ */
function AnalyticsPage({ sessions, skills: sk, scoreTrend: trend, onNewSession }: {
  sessions: DashboardSession[];
  skills: typeof skills;
  scoreTrend: typeof scoreTrend;
  onNewSession?: () => void;
}) {
  if (sessions.length === 0) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center", padding: "60px 20px" }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, margin: "0 auto 24px", background: "rgba(122,158,126,0.06)", border: `1px solid rgba(122,158,126,0.15)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
        </div>
        <h2 style={{ fontFamily: font.ui, fontSize: 22, fontWeight: 600, color: c.ivory, marginBottom: 8 }}>Analytics</h2>
        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6, marginBottom: 28 }}>
          Complete practice sessions to unlock detailed analytics — score trends, skill breakdowns, performance by interview type, and more.
        </p>
        {onNewSession && (
          <button onClick={onNewSession} className="shimmer-btn"
            style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, padding: "12px 32px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21" /></svg>
            Start Your First Session
          </button>
        )}
      </div>
    );
  }

  const avgScore = Math.round(sessions.reduce((s, sess) => s + sess.score, 0) / sessions.length);
  const bestSession = sessions.length > 0 ? [...sessions].sort((a, b) => b.score - a.score)[0] : null;
  const worstSession = sessions.length > 0 ? [...sessions].sort((a, b) => a.score - b.score)[0] : null;
  const totalImprovement = sk.length > 0 ? sk.reduce((sum, s) => sum + (s.score - s.prev), 0) : 0;
  const avgImprovement = sk.length > 0 ? Math.round(totalImprovement / sk.length) : 0;

  // Type breakdown
  const typeBreakdown = sessionTypes.filter(t => t !== "All").map(type => {
    const typeSessions = sessions.filter(s => s.type === type);
    return {
      type,
      count: typeSessions.length,
      avgScore: typeSessions.length ? Math.round(typeSessions.reduce((s, sess) => s + sess.score, 0) / typeSessions.length) : 0,
    };
  }).filter(t => t.count > 0);

  // Weekly practice heatmap (last 12 weeks)
  const weeklyData: { week: string; sessions: number; avgScore: number }[] = [];
  for (let w = 11; w >= 0; w--) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - w * 7 - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekSessions = sessions.filter(s => {
      const d = new Date(s.date);
      return d >= weekStart && d < weekEnd;
    });
    const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
    weeklyData.push({
      week: label,
      sessions: weekSessions.length,
      avgScore: weekSessions.length ? Math.round(weekSessions.reduce((s, sess) => s + sess.score, 0) / weekSessions.length) : 0,
    });
  }
  const maxWeeklySessions = Math.max(...weeklyData.map(w => w.sessions), 1);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ fontFamily: font.ui, fontSize: 22, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Analytics</h2>
      <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 28 }}>Deep performance insights across all your sessions</p>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Average Score", value: avgScore.toString(), color: c.gilt, sub: scoreLabel(avgScore) },
          { label: "Best Score", value: bestSession?.score.toString() || "—", color: c.sage, sub: bestSession?.type || "" },
          { label: "Total Sessions", value: sessions.length.toString(), color: c.ivory, sub: `${typeBreakdown.length} types practiced` },
          { label: "Avg Improvement", value: `+${avgImprovement}`, color: c.sage, sub: "pts per skill" },
        ].map((card, i) => (
          <div key={i} style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: 18 }}>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, display: "block", marginBottom: 8 }}>{card.label}</span>
            <span style={{ fontFamily: font.mono, fontSize: 28, fontWeight: 600, color: card.color, display: "block", marginBottom: 2, letterSpacing: "-0.02em" }}>{card.value}</span>
            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{card.sub}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Score trend (larger) */}
        <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px" }}>
          <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Score Progression</h3>
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginBottom: 16 }}>{trend.length > 0 ? `Your improvement trajectory over ${trend.length} sessions` : "Complete sessions to see your progress"}</p>
          {trend.length >= 2 ? (
            <>
              <ScoreTrendChart data={trend} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, padding: "0 24px" }}>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>{trend[0]?.date}</span>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>{trend[trend.length - 1]?.date}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 16, padding: "12px 0", borderTop: `1px solid ${c.border}` }}>
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 600, color: c.ivory, display: "block" }}>{trend[0]?.score}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>First session</span>
                </div>
                <div style={{ width: 1, background: c.border }} />
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 600, color: c.sage, display: "block" }}>+{(trend[trend.length - 1]?.score || 0) - (trend[0]?.score || 0)}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Total gain</span>
                </div>
                <div style={{ width: 1, background: c.border }} />
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 600, color: c.ivory, display: "block" }}>{trend[trend.length - 1]?.score}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Latest</span>
            </div>
          </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={c.border} strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 10 }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Complete at least 2 sessions to see your score progression</p>
            </div>
          )}
        </div>

        {/* Skill radar (larger) */}
        <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px" }}>
          <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Skill Radar</h3>
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginBottom: 12 }}>{sk.length > 0 ? "Current vs first session — dashed line shows where you started" : "Complete sessions to see your skill radar"}</p>
          {sk.length > 0 ? (
            <>
              <SkillRadar skills={sk} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                {[...sk].sort((a, b) => (b.score - b.prev) - (a.score - a.prev)).map(s => (
                  <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, flex: 1 }}>{s.name}</span>
                    <div style={{ width: 80, height: 4, background: c.border, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${s.score}%`, background: s.color, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.ivory, width: 22, textAlign: "right" }}>{s.score}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: c.sage, width: 28, textAlign: "right" }}>+{s.score - s.prev}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", textAlign: "center" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={c.border} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginTop: 10 }}>Complete sessions to unlock your skill radar</p>
            </div>
          )}
        </div>
      </div>

      {/* Session type breakdown */}
      <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px", marginBottom: 24 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 16 }}>Performance by Interview Type</h3>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(typeBreakdown.length, 1)}, 1fr)`, gap: 12 }}>
          {typeBreakdown.map(tb => (
            <div key={tb.type} style={{ background: c.obsidian, borderRadius: 10, border: `1px solid ${c.border}`, padding: "18px 20px", textAlign: "center" }}>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.gilt, display: "block", marginBottom: 12 }}>{tb.type}</span>
              <span style={{ fontFamily: font.mono, fontSize: 32, fontWeight: 600, color: scoreLabelColor(tb.avgScore), display: "block", marginBottom: 4 }}>{tb.avgScore}</span>
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{tb.count} session{tb.count !== 1 ? "s" : ""}</span>
              <div style={{ height: 4, background: c.border, borderRadius: 2, marginTop: 12, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${tb.avgScore}%`, background: scoreLabelColor(tb.avgScore), borderRadius: 2, transition: "width 0.5s ease" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Practice heatmap */}
      <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px", marginBottom: 24 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Practice Consistency</h3>
        <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginBottom: 16 }}>Sessions per week — last 12 weeks</p>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 100 }}>
          {weeklyData.map((w, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: font.mono, fontSize: 9, color: w.sessions > 0 ? c.ivory : "transparent" }}>{w.sessions}</span>
              <div style={{
                width: "100%", borderRadius: 4,
                height: Math.max(4, (w.sessions / maxWeeklySessions) * 72),
                background: w.sessions > 0
                  ? w.sessions >= 3 ? c.sage : w.sessions >= 2 ? c.gilt : "rgba(201,169,110,0.3)"
                  : c.border,
                transition: "height 0.3s ease",
              }} />
              <span style={{ fontFamily: font.mono, fontSize: 8, color: c.stone, whiteSpace: "nowrap" }}>{w.week}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 14, justifyContent: "center" }}>
          {[
            { color: "rgba(201,169,110,0.3)", label: "1 session" },
            { color: c.gilt, label: "2 sessions" },
            { color: c.sage, label: "3+ sessions" },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
              <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Strength / Weakness deep dive */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
            <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Top Strengths</h3>
          </div>
          {sessions.slice(0, 5).map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < 4 ? `1px solid ${c.border}` : "none" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
              <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, flex: 1 }}>{s.topStrength}</span>
              <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{s.type}</span>
            </div>
          ))}
        </div>

        <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Areas to Improve</h3>
          </div>
          {sessions.slice(0, 5).map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < 4 ? `1px solid ${c.border}` : "none" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, flex: 1 }}>{s.topWeakness}</span>
              <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{s.type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SETTINGS PAGE
   ═══════════════════════════════════════════════ */
function SettingsPage({ persisted, onUpdate, onLogout, onSyncToSupabase }: {
  persisted: PersistedState;
  onUpdate: (updates: Partial<PersistedState>) => void;
  onLogout: () => void;
  onSyncToSupabase: (updates: { name?: string; targetRole?: string; interviewDate?: string }) => void;
}) {
  const { user: authUser } = useAuth();
  const [editName, setEditName] = useState(persisted.userName);
  const [editRole, setEditRole] = useState(persisted.targetRole);
  const [editDate, setEditDate] = useState(persisted.interviewDate);
  const [saved, setSaved] = useState(false);
  const [difficulty, setDifficulty] = useState("standard");
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [streakReminder, setStreakReminder] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // TTS Settings
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>(loadTTSSettings);

  const handleSave = () => {
    onUpdate({ userName: editName, targetRole: editRole, interviewDate: editDate });
    onSyncToSupabase({ name: editName, targetRole: editRole, interviewDate: editDate });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const Toggle = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
    <button onClick={onToggle} style={{
      width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
      background: on ? c.gilt : c.border, padding: 2,
      transition: "background 0.2s ease", position: "relative",
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: "50%", background: on ? c.obsidian : c.stone,
        transition: "transform 0.2s ease", transform: on ? "translateX(18px)" : "translateX(0)",
      }} />
    </button>
  );

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h2 style={{ fontFamily: font.ui, fontSize: 22, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Settings</h2>
      <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 28 }}>Manage your profile, preferences, and account</p>

      {/* Profile */}
      <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px", marginBottom: 16 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 20 }}>Profile</h3>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
          {authUser?.avatarUrl ? (
            <img src={authUser.avatarUrl} alt="Profile" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: `2px solid ${c.border}` }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(201,169,110,0.1)", border: `2px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: font.display, fontSize: 22, color: c.gilt }}>{(persisted.userName || "?")[0].toUpperCase()}</span>
            </div>
          )}
          <div>
            <p style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory }}>{persisted.userName}</p>
            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>{persisted.targetRole}</p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 6 }}>Full Name</label>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}`, color: c.ivory, fontFamily: font.ui, fontSize: 13, outline: "none", boxSizing: "border-box" }}
              onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
              onBlur={(e) => e.currentTarget.style.borderColor = c.border}
            />
          </div>
          <div>
            <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 6 }}>Target Role</label>
            <input type="text" value={editRole} onChange={(e) => setEditRole(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}`, color: c.ivory, fontFamily: font.ui, fontSize: 13, outline: "none", boxSizing: "border-box" }}
              onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
              onBlur={(e) => e.currentTarget.style.borderColor = c.border}
            />
          </div>
          <div>
            <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 6 }}>Interview Date</label>
            <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}`, color: c.ivory, fontFamily: font.ui, fontSize: 13, outline: "none", boxSizing: "border-box", colorScheme: "dark" }}
              onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
              onBlur={(e) => e.currentTarget.style.borderColor = c.border}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button onClick={handleSave} className="shimmer-btn"
            style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, padding: "10px 24px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, cursor: "pointer" }}>
            {saved ? "Saved!" : "Save Changes"}
          </button>
          {saved && <span style={{ fontFamily: font.ui, fontSize: 12, color: c.sage, display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            Changes saved
          </span>}
        </div>
      </div>

      {/* Interview Preferences */}
      <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px", marginBottom: 16 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 20 }}>Interview Preferences</h3>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 10 }}>Default Difficulty</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { id: "warmup", label: "Warm-up", desc: "Conversational, confidence-building" },
              { id: "standard", label: "Standard", desc: "Realistic interview pacing" },
              { id: "intense", label: "Intense", desc: "Rapid-fire, high pressure" },
            ].map(d => (
              <button key={d.id} onClick={() => setDifficulty(d.id)}
                style={{
                  flex: 1, padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                  background: difficulty === d.id ? "rgba(201,169,110,0.08)" : c.obsidian,
                  border: `1.5px solid ${difficulty === d.id ? c.gilt : c.border}`,
                  textAlign: "left", transition: "all 0.2s ease",
                }}>
                <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: difficulty === d.id ? c.ivory : c.chalk, display: "block", marginBottom: 2 }}>{d.label}</span>
                <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{d.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI Voice Settings */}
      <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px", marginBottom: 16 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 6 }}>AI Interviewer Voice</h3>
        <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginBottom: 20 }}>
          Premium Neural2 AI voices are included for all users. You can also switch to your browser's built-in voice.
        </p>

        {/* Provider toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {([
            { id: "google" as const, label: "Neural Voice", desc: "Premium, natural (included)" },
            { id: "browser" as const, label: "Browser Voice", desc: "Built-in fallback" },
          ]).map(p => (
            <button key={p.id} onClick={() => {
              const updated = { ...ttsSettings, provider: p.id };
              setTtsSettings(updated);
              saveTTSSettings(updated);
            }}
              style={{
                flex: 1, padding: "14px 16px", borderRadius: 8, cursor: "pointer",
                background: ttsSettings.provider === p.id ? "rgba(201,169,110,0.08)" : c.obsidian,
                border: `1.5px solid ${ttsSettings.provider === p.id ? c.gilt : c.border}`,
                textAlign: "left", transition: "all 0.2s ease",
              }}>
              <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: ttsSettings.provider === p.id ? c.ivory : c.chalk, display: "block", marginBottom: 2 }}>{p.label}</span>
              <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{p.desc}</span>
            </button>
          ))}
        </div>

        {/* Voice selection (Google Neural) */}
        {ttsSettings.provider === "google" && (
          <div style={{ padding: "16px 20px", borderRadius: 10, background: c.obsidian, border: `1px solid ${c.border}`, marginBottom: 16 }}>
            <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 10 }}>Choose Your Interviewer Voice</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {GOOGLE_VOICES.map(v => (
                <button key={v.id} onClick={() => {
                  const updated = { ...ttsSettings, voiceId: v.id, voiceName: v.name };
                  setTtsSettings(updated);
                  saveTTSSettings(updated);
                }}
                  style={{
                    padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                    background: ttsSettings.voiceId === v.id ? "rgba(201,169,110,0.08)" : "transparent",
                    border: `1px solid ${ttsSettings.voiceId === v.id ? c.gilt : c.border}`,
                    textAlign: "left", transition: "all 0.2s ease",
                  }}>
                  <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: ttsSettings.voiceId === v.id ? c.ivory : c.chalk, display: "block", marginBottom: 2 }}>{v.name}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{v.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {ttsSettings.provider === "browser" && (
          <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, padding: "12px 16px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}` }}>
            Using your browser's built-in text-to-speech. Quality varies by browser and OS. Switch to Neural Voice above for premium, natural-sounding voices — included free with your account.
          </p>
        )}
      </div>

      {/* Notifications */}
      <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px", marginBottom: 16 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 20 }}>Notifications</h3>

        {[
          { label: "Email notifications", desc: "Session reminders and progress updates", on: emailNotifs, toggle: () => setEmailNotifs(!emailNotifs) },
          { label: "Streak reminders", desc: "Get nudged when you're about to lose your streak", on: streakReminder, toggle: () => setStreakReminder(!streakReminder) },
          { label: "Weekly digest", desc: "Summary of your weekly progress every Monday", on: weeklyDigest, toggle: () => setWeeklyDigest(!weeklyDigest) },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: i < 2 ? `1px solid ${c.border}` : "none" }}>
            <div>
              <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory, display: "block", marginBottom: 2 }}>{item.label}</span>
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{item.desc}</span>
            </div>
            <Toggle on={item.on} onToggle={item.toggle} />
          </div>
        ))}
      </div>

      {/* Data & Privacy */}
      <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px", marginBottom: 16 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 20 }}>Data & Privacy</h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <div>
                <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.ivory, display: "block" }}>Resume data</span>
                <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Encrypted (AES-256), stored securely</span>
              </div>
            </div>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.sage, fontWeight: 500 }}>Protected</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <div>
                <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.ivory, display: "block" }}>Export all data</span>
                <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Download your sessions, scores, and transcripts</span>
              </div>
            </div>
            <button style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.gilt, background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.15)`, borderRadius: 6, padding: "6px 14px", cursor: "pointer" }}>
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid rgba(196,112,90,0.15)`, padding: "24px 28px" }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ember, marginBottom: 16 }}>Danger Zone</h3>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory, display: "block", marginBottom: 2 }}>Log out</span>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Sign out of your account on this device</span>
          </div>
          <button onClick={onLogout} style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.ember, background: "rgba(196,112,90,0.06)", border: `1px solid rgba(196,112,90,0.15)`, borderRadius: 6, padding: "8px 20px", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(196,112,90,0.12)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(196,112,90,0.06)"; }}>
            Log out
          </button>
        </div>

        <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory, display: "block", marginBottom: 2 }}>Delete account</span>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Permanently delete your account and all data</span>
          </div>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.ember, background: "transparent", border: `1px solid rgba(196,112,90,0.2)`, borderRadius: 6, padding: "8px 20px", cursor: "pointer" }}>
              Delete Account
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmDelete(false)} style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 6, padding: "8px 14px", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => { localStorage.clear(); onLogout(); }} style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: "#fff", background: c.ember, border: "none", borderRadius: 6, padding: "8px 20px", cursor: "pointer" }}>
                Confirm Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   CALENDAR PAGE
   ═══════════════════════════════════════════════ */
function CalendarPage({ onStartSession }: { onStartSession: () => void }) {
  const { user } = useAuth();
  const [events, setEvents] = useState<InterviewEvent[]>(loadEvents);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [exportTooltip, setExportTooltip] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formType, setFormType] = useState("Behavioral");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("10:00");
  const [formDuration, setFormDuration] = useState(60);
  const [formLocation, setFormLocation] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formReminders, setFormReminders] = useState(true);

  const updateEvents = (next: InterviewEvent[]) => {
    setEvents(next);
    saveEvents(next);
  };

  // Load from Supabase on mount
  useEffect(() => {
    if (!user?.id) return;
    getCalendarEvents(user.id).then(dbEvents => {
      if (dbEvents.length > 0) {
        const mapped = dbEvents.map(e => ({
          id: e.id, title: e.title, company: e.company,
          date: e.date, time: e.time, type: e.type,
          duration: 60, location: "", notes: e.notes,
          status: "upcoming" as const, reminders: true,
        }));
        setEvents(mapped);
      }
    }).catch(() => {});
  }, [user?.id]);

  const resetForm = () => {
    setFormTitle("");
    setFormCompany(user?.targetCompany || "");
    setFormType("Behavioral");
    setFormDate("");
    setFormTime("10:00");
    setFormDuration(60);
    setFormLocation("");
    setFormNotes("");
    setFormReminders(true);
    setEditingId(null);
  };

  const openNewForm = () => {
    resetForm();
    setFormCompany(user?.targetCompany || "");
    setShowForm(true);
  };

  const openEditForm = (ev: InterviewEvent) => {
    setFormTitle(ev.title);
    setFormCompany(ev.company);
    setFormType(ev.type);
    setFormDate(ev.date);
    setFormTime(ev.time);
    setFormDuration(ev.duration);
    setFormLocation(ev.location);
    setFormNotes(ev.notes);
    setFormReminders(ev.reminders);
    setEditingId(ev.id);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!formTitle || !formDate || !formTime) return;
    const ev: InterviewEvent = {
      id: editingId || generateEventId(),
      title: formTitle,
      company: formCompany,
      type: formType,
      date: formDate,
      time: formTime,
      duration: formDuration,
      location: formLocation,
      notes: formNotes,
      status: "upcoming",
      reminders: formReminders,
    };
    if (editingId) {
      updateEvents(events.map(e => e.id === editingId ? ev : e));
    } else {
      updateEvents([...events, ev]);
    }
    // Persist to Supabase
    if (user?.id) {
      saveCalendarEvent({
        id: ev.id, user_id: user.id, title: ev.title, company: ev.company,
        date: ev.date, time: ev.time, type: ev.type, notes: ev.notes,
      }).catch(() => {});
    }
    setShowForm(false);
    resetForm();
  };

  const handleDelete = (id: string) => {
    updateEvents(events.filter(e => e.id !== id));
    if (user?.id) deleteCalendarEvent(id, user.id).catch(() => {});
  };

  const handleCancel = (id: string) => {
    updateEvents(events.map(e => e.id === id ? { ...e, status: "cancelled" as const } : e));
  };

  const handleExportICS = (ev: InterviewEvent) => {
    const ics = generateICS(ev);
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ev.company.replace(/\s/g, "_")}_${ev.type.replace(/\s/g, "_")}_${ev.date}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    setExportTooltip(ev.id);
    setTimeout(() => setExportTooltip(null), 2000);
  };

  const upcoming = events
    .filter(e => e.status === "upcoming" && daysUntilEvent(e.date, e.time) >= 0)
    .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());

  const past = events
    .filter(e => e.status === "completed" || (e.status === "upcoming" && daysUntilEvent(e.date, e.time) < 0))
    .sort((a, b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime());

  const cancelled = events.filter(e => e.status === "cancelled");

  const inputStyle = {
    width: "100%", padding: "10px 14px", fontFamily: font.ui, fontSize: 13,
    color: c.ivory, background: c.obsidian, border: `1px solid ${c.border}`,
    borderRadius: 8, outline: "none", boxSizing: "border-box" as const,
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: font.ui, fontSize: 22, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Interview Calendar</h2>
          <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>
            Track upcoming interviews and export to your calendar
          </p>
        </div>
        <button onClick={openNewForm} style={{
          fontFamily: font.ui, fontSize: 13, fontWeight: 500, padding: "10px 22px",
          borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian,
          cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
        }}
          onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Interview
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "28px 32px", marginBottom: 24, animation: "slideDown 0.2s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <h3 style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory }}>{editingId ? "Edit Interview" : "Add New Interview"}</h3>
            <button onClick={() => { setShowForm(false); resetForm(); }} style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 4 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, display: "block", marginBottom: 6 }}>Interview Title *</label>
              <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. Final Round Interview" style={inputStyle}
                onFocus={(e) => e.currentTarget.style.borderColor = c.gilt} onBlur={(e) => e.currentTarget.style.borderColor = c.border} />
            </div>
            <div>
              <label style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, display: "block", marginBottom: 6 }}>Company *</label>
              <input value={formCompany} onChange={(e) => setFormCompany(e.target.value)} placeholder="e.g. Google" style={inputStyle}
                onFocus={(e) => e.currentTarget.style.borderColor = c.gilt} onBlur={(e) => e.currentTarget.style.borderColor = c.border} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, display: "block", marginBottom: 6 }}>Date *</label>
              <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
            </div>
            <div>
              <label style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, display: "block", marginBottom: 6 }}>Time *</label>
              <input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
            </div>
            <div>
              <label style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, display: "block", marginBottom: 6 }}>Duration</label>
              <select value={formDuration} onChange={(e) => setFormDuration(Number(e.target.value))} style={{ ...inputStyle, colorScheme: "dark" }}>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, display: "block", marginBottom: 6 }}>Interview Type</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {interviewTypeOptions.map(t => (
                  <button key={t} onClick={() => setFormType(t)} style={{
                    fontFamily: font.ui, fontSize: 11, fontWeight: 500, padding: "5px 12px",
                    borderRadius: 100, cursor: "pointer",
                    background: formType === t ? "rgba(201,169,110,0.1)" : "transparent",
                    border: `1px solid ${formType === t ? c.gilt : c.border}`,
                    color: formType === t ? c.gilt : c.stone,
                    transition: "all 0.2s ease",
                  }}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, display: "block", marginBottom: 6 }}>Location / Link</label>
              <input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="Zoom link, Google Meet, or address" style={inputStyle}
                onFocus={(e) => e.currentTarget.style.borderColor = c.gilt} onBlur={(e) => e.currentTarget.style.borderColor = c.border} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, display: "block", marginBottom: 6 }}>Notes</label>
            <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Interviewer name, prep topics, things to remember..." rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
              onFocus={(e) => e.currentTarget.style.borderColor = c.gilt} onBlur={(e) => e.currentTarget.style.borderColor = c.border} />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <div onClick={() => setFormReminders(!formReminders)} style={{
                width: 36, height: 20, borderRadius: 10, padding: 2,
                background: formReminders ? c.sage : c.border,
                transition: "background 0.2s", cursor: "pointer",
              }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: c.ivory, transform: formReminders ? "translateX(16px)" : "translateX(0)", transition: "transform 0.2s" }} />
              </div>
              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>Enable reminders (30 min & 1 day before)</span>
            </label>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowForm(false); resetForm(); }} style={{
                fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.stone,
                background: "transparent", border: `1px solid ${c.border}`, borderRadius: 8,
                padding: "10px 20px", cursor: "pointer",
              }}>Cancel</button>
              <button onClick={handleSave} disabled={!formTitle || !formDate || !formTime} style={{
                fontFamily: font.ui, fontSize: 13, fontWeight: 500,
                background: formTitle && formDate && formTime ? c.gilt : c.border,
                color: formTitle && formDate && formTime ? c.obsidian : c.stone,
                border: "none", borderRadius: 8, padding: "10px 24px", cursor: formTitle && formDate && formTime ? "pointer" : "not-allowed",
              }}>{editingId ? "Save Changes" : "Add Interview"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming Interviews */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Upcoming ({upcoming.length})
        </h3>

        {upcoming.length === 0 ? (
          <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "40px 28px", textAlign: "center" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 12, opacity: 0.4 }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, marginBottom: 8 }}>No upcoming interviews</p>
            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, opacity: 0.7, marginBottom: 16 }}>Add your interview schedule to get countdown reminders and prep suggestions.</p>
            <button onClick={openNewForm} style={{
              fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.gilt,
              background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.15)`,
              borderRadius: 6, padding: "8px 20px", cursor: "pointer",
            }}>Add Your First Interview</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {upcoming.map(ev => {
              const days = daysUntilEvent(ev.date, ev.time);
              const urgent = days <= 3;
              const isToday = days === 0;
              return (
                <div key={ev.id} style={{
                  background: c.graphite, borderRadius: 12,
                  border: `1px solid ${urgent ? "rgba(196,112,90,0.2)" : c.border}`,
                  borderLeft: `4px solid ${isToday ? c.ember : urgent ? c.gilt : c.sage}`,
                  padding: "20px 24px", transition: "border-color 0.2s",
                }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = urgent ? "rgba(196,112,90,0.35)" : c.borderHover}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = urgent ? "rgba(196,112,90,0.2)" : c.border}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <h4 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory }}>{ev.title}</h4>
                        <span style={{
                          fontFamily: font.ui, fontSize: 10, fontWeight: 600, padding: "3px 10px",
                          borderRadius: 100,
                          background: isToday ? "rgba(196,112,90,0.12)" : urgent ? "rgba(201,169,110,0.1)" : "rgba(122,158,126,0.08)",
                          color: isToday ? c.ember : urgent ? c.gilt : c.sage,
                          border: `1px solid ${isToday ? "rgba(196,112,90,0.2)" : urgent ? "rgba(201,169,110,0.15)" : "rgba(122,158,126,0.15)"}`,
                        }}>
                          {isToday ? "TODAY" : days === 1 ? "TOMORROW" : `${days} days`}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, display: "flex", alignItems: "center", gap: 5 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 2v4M8 2v4M2 10h20"/></svg>
                          {formatEventDate(ev.date)}
                        </span>
                        <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, display: "flex", alignItems: "center", gap: 5 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          {formatEventTime(ev.time)} · {ev.duration} min
                        </span>
                        <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, display: "flex", alignItems: "center", gap: 5 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          {ev.company}
                        </span>
                        <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "rgba(201,169,110,0.06)", color: c.gilt, border: `1px solid rgba(201,169,110,0.1)` }}>
                          {ev.type}
                        </span>
                      </div>
                      {ev.location && (
                        <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                          {ev.location}
                        </p>
                      )}
                      {ev.notes && (
                        <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginTop: 4, fontStyle: "italic" }}>{ev.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${c.border}`, paddingTop: 12 }}>
                    <button onClick={() => onStartSession()} style={{
                      fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.obsidian,
                      background: c.gilt, border: "none", borderRadius: 6, padding: "7px 16px",
                      cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                    }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21"/></svg>
                      Practice {ev.type}
                    </button>
                    <div style={{ position: "relative" }}>
                      <button onClick={() => handleExportICS(ev)} style={{
                        fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.chalk,
                        background: "rgba(240,237,232,0.04)", border: `1px solid ${c.border}`, borderRadius: 6,
                        padding: "7px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                      }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Export .ics
                      </button>
                      {exportTooltip === ev.id && (
                        <div style={{ position: "absolute", top: -28, left: "50%", transform: "translateX(-50%)", background: c.sage, color: c.obsidian, fontFamily: font.ui, fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>Downloaded!</div>
                      )}
                    </div>
                    <a href={generateGoogleCalendarURL(ev)} target="_blank" rel="noopener noreferrer" style={{
                      fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.chalk,
                      background: "rgba(240,237,232,0.04)", border: `1px solid ${c.border}`, borderRadius: 6,
                      padding: "7px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                      textDecoration: "none",
                    }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      Google Calendar
                    </a>
                    <button onClick={() => openEditForm(ev)} style={{
                      fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone,
                      background: "transparent", border: `1px solid ${c.border}`, borderRadius: 6,
                      padding: "7px 14px", cursor: "pointer",
                    }}>Edit</button>
                    <button onClick={() => handleCancel(ev.id)} style={{
                      fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.ember,
                      background: "transparent", border: `1px solid rgba(196,112,90,0.15)`, borderRadius: 6,
                      padding: "7px 14px", cursor: "pointer",
                    }}>Cancel</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Past Interviews */}
      {past.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.stone, marginBottom: 12 }}>Past ({past.length})</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {past.map(ev => (
              <div key={ev.id} style={{ background: c.graphite, borderRadius: 10, border: `1px solid ${c.border}`, padding: "14px 20px", opacity: 0.7, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.chalk }}>{ev.title}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginLeft: 12 }}>{ev.company} · {formatEventDate(ev.date)} · {ev.type}</span>
                </div>
                <button onClick={() => handleDelete(ev.id)} style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, background: "none", border: `1px solid ${c.border}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancelled */}
      {cancelled.length > 0 && (
        <div>
          <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.stone, marginBottom: 12, opacity: 0.6 }}>Cancelled ({cancelled.length})</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cancelled.map(ev => (
              <div key={ev.id} style={{ background: c.graphite, borderRadius: 10, border: `1px solid ${c.border}`, padding: "14px 20px", opacity: 0.4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.chalk, textDecoration: "line-through" }}>{ev.title}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginLeft: 12 }}>{ev.company} · {formatEventDate(ev.date)}</span>
                </div>
                <button onClick={() => handleDelete(ev.id)} style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, background: "none", border: `1px solid ${c.border}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════ */
export default function Dashboard() {
  const nav = useNavigate();
  const { logout: authLogout, user, updateUser: authUpdateUser } = useAuth();
  const [persisted, setPersisted] = useState<PersistedState>(loadState);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [expandedSession, setExpandedSession] = useState<number | null>(null);
  const [feedbackSession, setFeedbackSession] = useState<number | null>(null);
  const [viewingSession, setViewingSession] = useState<number | null>(null);  const [filterType, setFilterType] = useState("All");
  const [sortBy, setSortBy] = useState<"date" | "score">("date");
  const [searchQuery, setSearchQuery] = useState("");  const [dateRange, setDateRange] = useState<"all" | "week" | "month">("all");  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [rightTab, setRightTab] = useState<"insights" | "goals">("insights");
  const [shareTooltip, setShareTooltip] = useState(false);  const [calendarEvents, setCalendarEvents] = useState<InterviewEvent[]>(loadEvents);
  const [supabaseSessions, setSupabaseSessions] = useState<RealSession[]>([]);

  // Load data from Supabase on mount
  useEffect(() => {
    if (!user?.id) return;
    getUserSessions(user.id).then(sessions => {
      if (sessions.length > 0) {
        setSupabaseSessions(sessions.map(s => ({
          id: s.id,
          date: s.date,
          type: s.type,
          difficulty: s.difficulty,
          focus: s.focus,
          duration: s.duration,
          score: s.score,
          questions: s.questions,
          ai_feedback: s.ai_feedback,
          skill_scores: s.skill_scores,
        })));
      }
    }).catch(() => {});
    getCalendarEvents(user.id).then(events => {
      if (events.length > 0) {
        setCalendarEvents(events.map(e => ({
          id: e.id, title: e.title, company: e.company,
          date: e.date, time: e.time, type: e.type as any, notes: e.notes,
        })));
      }
    }).catch(() => {});
  }, [user?.id]);

  // Load dynamic session data (merge Supabase + local)
  const { recentSessions, scoreTrend, skills, overallStats, hasData } = useMemo(
    () => getSessionData(user?.targetRole || persisted.targetRole, supabaseSessions),
    [user?.targetRole, persisted.targetRole, supabaseSessions],
  );

  // Dynamic streak
  const weekActivity = computeWeekActivity(recentSessions);
  const currentStreak = computeStreak(recentSessions);

  // Personalized data
  const aiInsights = generatePersonalizedInsights(user, skills);
  const notifications = generateNotifications(user, currentStreak, weekActivity, recentSessions);
  const upcomingGoals = generateGoals(user, weekActivity, skills);
  const returnContext = getReturnContext(recentSessions);
  const smartSchedule = getSmartScheduleSuggestion(user);
  const prepPlan = getPrepPlan(user, recentSessions, skills);

  // persist state changes
  const updatePersisted = useCallback((updates: Partial<PersistedState>) => {
    setPersisted(prev => {
      const next = { ...prev, ...updates };
      saveState(next);
      return next;
    });
  }, []);

  const displayName = user?.name || persisted.userName || "User";
  const isNewUser = !hasData;

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const daysLeft = persisted.interviewDate ? daysUntil(persisted.interviewDate) : 0;
  const readinessScore = scoreTrend.length > 0 && skills.length > 0 ? computeReadiness(scoreTrend, skills) : 0;

  // Filter, search, and date range
  const filteredSessions = recentSessions
    .filter(s => filterType === "All" || s.type === filterType)
    .filter(s => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return s.type.toLowerCase().includes(q) || s.topStrength.toLowerCase().includes(q) || s.topWeakness.toLowerCase().includes(q) || s.feedback.toLowerCase().includes(q);
    })
    .filter(s => {
      if (dateRange === "all") return true;
      const sessionDate = new Date(s.date);
      const now = new Date();
      if (dateRange === "week") {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return sessionDate >= weekAgo;
      }
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return sessionDate >= monthAgo;
    })
    .sort((a, b) => sortBy === "score" ? b.score - a.score : new Date(b.date).getTime() - new Date(a.date).getTime());

  const weakestSkill = skills.length > 0 ? [...skills].sort((a, b) => a.score - b.score)[0] : null;
  const activeNotifs = notifications.filter(n => !persisted.dismissedNotifs.includes(n.id));

  const showDashboard = activeNav === "dashboard";
  const showResume = activeNav === "resume";
  const showSessions = activeNav === "sessions";

  // If viewing a session detail
  const detailSession = viewingSession ? recentSessions.find(s => s.id === viewingSession) : null;

  // Copy report to clipboard
  const handleExport = useCallback(() => {
    const report = generateReport(persisted.userName, overallStats, skills, recentSessions);
    navigator.clipboard.writeText(report).then(() => {
      setShareTooltip(true);
      setTimeout(() => setShareTooltip(false), 2000);
    });
  }, [persisted.userName]);

  // Download report as text file
  const handleDownload = useCallback(() => {
    const report = generateReport(persisted.userName, overallStats, skills, recentSessions);
    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `LevelUp_Progress_${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [persisted.userName]);

  const showCalendar = activeNav === "calendar";
  const showAnalytics = activeNav === "analytics";
  const showSettings = activeNav === "settings";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: c.obsidian }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {isMobile && sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 19 }} />}

      {/* Sidebar */}
      <aside role="complementary" aria-label="Navigation sidebar" style={{
        width: 240, borderRight: `1px solid ${c.border}`, padding: "24px 16px",
        display: "flex", flexDirection: "column", position: "fixed", top: 0, bottom: 0,
        background: c.obsidian, zIndex: 20,
        transform: isMobile ? (sidebarOpen ? "translateX(0)" : "translateX(-100%)") : "translateX(0)",
        transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 36, padding: "0 12px" }}>
          <Link to="/" style={{ textDecoration: "none" }}><span style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory, letterSpacing: "0.06em" }}>Level Up</span></Link>
          {isMobile && <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 4 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
        </div>
        <nav aria-label="Main navigation" style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {navItems.map((item) => (
            <button key={item.id}
              aria-current={activeNav === item.id ? "page" : undefined}
              aria-label={item.label}
              onClick={() => { setActiveNav(item.id); setViewingSession(null); if (isMobile) setSidebarOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                borderRadius: 8, border: "none", cursor: "pointer",
                background: activeNav === item.id ? "rgba(201,169,110,0.08)" : "transparent",
                color: activeNav === item.id ? c.ivory : c.stone,
                fontFamily: font.ui, fontSize: 13, fontWeight: 500,
                transition: "all 0.2s ease", textAlign: "left", outline: "none",
              }}
              onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px ${c.gilt}40`}
              onBlur={(e) => e.currentTarget.style.boxShadow = "none"}
              onMouseEnter={(e) => { if (activeNav !== item.id) e.currentTarget.style.background = "rgba(240,237,232,0.03)"; }}
              onMouseLeave={(e) => { if (activeNav !== item.id) e.currentTarget.style.background = "transparent"; }}
            >
              {item.icon}{item.label}
              {activeNav === item.id && <div style={{ width: 3, height: 16, borderRadius: 2, background: c.gilt, marginLeft: "auto" }} />}
            </button>
          ))}
        </nav>
        <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 8, padding: "14px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={displayName} style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(201,169,110,0.12)", border: `1px solid rgba(201,169,110,0.2)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.gilt }}>{(displayName || "?")[0].toUpperCase()}</span>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</p>
              <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{user?.targetRole || persisted.targetRole || "Set your target role"}</p>
            </div>
          </div>
          <button onClick={() => { authLogout(); nav("/"); }} style={{
            fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.stone,
            background: "none", border: "none", cursor: "pointer", padding: "6px 0",
            transition: "color 0.2s", display: "flex", alignItems: "center", gap: 6,
          }}
            onMouseEnter={(e) => e.currentTarget.style.color = c.ember}
            onMouseLeave={(e) => e.currentTarget.style.color = c.stone}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Log out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, marginLeft: isMobile ? 0 : 240, padding: isMobile ? "20px 16px 60px" : "32px 40px 60px" }}>
        {isMobile && (
          <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu"
            style={{ background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", marginBottom: 20, color: c.ivory, display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500 }}>Menu</span>
          </button>
        )}

        {/* Sessions page */}
        {showSessions && !detailSession && (
          <SessionsPage
            sessions={recentSessions}
            onNewSession={() => nav("/session/new")}
          />
        )}
        {showSessions && detailSession && (
          <SessionDetailView session={detailSession} onBack={() => { setViewingSession(null); }} />
        )}

        {/* Resume page */}
        {showResume && <ResumePage resumeFileName={persisted.resumeFileName} onUpdateResume={(fn, text) => {
          updatePersisted({ resumeFileName: fn });
        }} />}

        {/* Calendar page */}
        {showCalendar && (
          <CalendarPage onStartSession={() => nav("/session/new")} />
        )}

        {/* Analytics page */}
        {showAnalytics && (
          <AnalyticsPage sessions={recentSessions} skills={skills} scoreTrend={scoreTrend} onNewSession={() => nav("/session/new")} />
        )}

        {/* Settings page */}
        {showSettings && (
          <SettingsPage
            persisted={persisted}
            onUpdate={updatePersisted}
            onLogout={() => { authLogout(); nav("/"); }}
            onSyncToSupabase={(updates) => authUpdateUser(updates)}
          />
        )}

        {/* Session detail view */}
        {showDashboard && detailSession && (
          <SessionDetailView session={detailSession} onBack={() => setViewingSession(null)} />
        )}

        {/* Empty state */}
        {isNewUser && showDashboard && !detailSession && (
          <EmptyState
            onStart={() => { updatePersisted({ hasCompletedFirstSession: true }); nav("/session/new"); }}
            userName={displayName}
            targetRole={user?.targetRole || persisted.targetRole}
            isMobile={isMobile}
          />
        )}

        {/* Dashboard main */}
        {!isNewUser && showDashboard && !detailSession && (
          <>
            {/* Top bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
              <div>
                <h1 style={{ fontFamily: font.ui, fontSize: isMobile ? 20 : 24, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>
                  {getPersonalizedGreeting(displayName.split(" ")[0], currentStreak, recentSessions.length)}
                </h1>
                {returnContext && (
                  <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 2 }}>
                    {returnContext}
                  </p>
                )}
                {smartSchedule && (
                  <p style={{ fontFamily: font.ui, fontSize: 12, color: c.gilt, fontStyle: "italic" }}>
                    {smartSchedule}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {/* Export / Share */}
                <div style={{ position: "relative" }}>
                  <button onClick={handleExport} title="Copy progress report"
                    style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s ease", outline: "none" }}
                    onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px ${c.gilt}40`}
                    onBlur={(e) => e.currentTarget.style.boxShadow = "none"}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.gilt; e.currentTarget.style.color = c.ivory; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    Share
                  </button>
                  {shareTooltip && (
                    <div style={{ position: "absolute", top: -32, left: "50%", transform: "translateX(-50%)", background: c.sage, color: c.obsidian, fontFamily: font.ui, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 4, whiteSpace: "nowrap", animation: "fadeIn 0.2s ease" }}>
                      Copied to clipboard!
                    </div>
                  )}
                </div>
                <button onClick={handleDownload} title="Download progress report"
                  style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s ease", outline: "none" }}
                  onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px ${c.gilt}40`}
                  onBlur={(e) => e.currentTarget.style.boxShadow = "none"}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.gilt; e.currentTarget.style.color = c.ivory; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download
                </button>
                {/* Quick actions */}
                {!isMobile && [
                  { label: "Quick Behavioral", type: "behavioral", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
                  { label: "Quick Case Study", type: "case-study", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
                ].map((action) => (
                  <button key={action.label} title={action.label}
                    onClick={() => nav(`/session/new?type=${action.type}`)}
                    style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s ease", outline: "none" }}
                    onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px ${c.gilt}40`}
                    onBlur={(e) => e.currentTarget.style.boxShadow = "none"}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.gilt; e.currentTarget.style.color = c.ivory; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; }}
                  >{action.icon}{action.label}</button>
                ))}
              </div>
            </div>

            {/* Notifications */}
            {activeNotifs.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {activeNotifs.map((notif) => (
                  <div key={notif.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderRadius: 10, background: c.graphite, border: `1px solid ${c.border}`, borderLeft: `3px solid ${notif.type === "streak" ? c.ember : c.sage}` }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={notif.type === "streak" ? c.ember : c.sage} strokeWidth="2" strokeLinecap="round">
                      {notif.type === "streak" ? <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></> : <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}
                    </svg>
                    <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, flex: 1 }}>{notif.text}</span>
                    {notif.action && (
                      <button onClick={() => {
                        if (notif.action === "View Report") setActiveNav("analytics");
                        else if (notif.action === "Quick Practice" || notif.action === "Practice Now") nav("/session/new");
                      }} style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.sage, background: "rgba(122,158,126,0.08)", border: `1px solid rgba(122,158,126,0.2)`, borderRadius: 6, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(122,158,126,0.15)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(122,158,126,0.08)"; }}
                      >{notif.action}</button>
                    )}
                    {notif.dismissible && (
                      <button onClick={() => updatePersisted({ dismissedNotifs: [...persisted.dismissedNotifs, notif.id] })} aria-label="Dismiss" style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 4, flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Prep Plan Timeline */}
            {prepPlan && (
              <div style={{ marginBottom: 16, background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Interview Prep Plan</h3>
                  <span style={{ fontFamily: font.mono, fontSize: 11, color: c.gilt }}>{prepPlan.filter(s => s.done).length}/{prepPlan.length} complete</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {prepPlan.map((step, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, position: "relative" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", background: step.done ? c.sage : c.obsidian, border: `2px solid ${step.done ? c.sage : c.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {step.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.obsidian} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                        {i < prepPlan.length - 1 && <div style={{ width: 2, height: 24, background: step.done ? c.sage : c.border, opacity: 0.4 }} />}
                      </div>
                      <span style={{ fontFamily: font.ui, fontSize: 12, color: step.done ? c.stone : c.chalk, paddingTop: 2, textDecoration: step.done ? "line-through" : "none", opacity: step.done ? 0.6 : 1 }}>{step.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA Banner */}
            <div style={{ background: `linear-gradient(135deg, rgba(201,169,110,0.08) 0%, ${c.graphite} 100%)`, borderRadius: 14, border: `1px solid rgba(201,169,110,0.12)`, padding: isMobile ? "20px" : "24px 32px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                {daysLeft > 0 && persisted.interviewDate && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 100, background: daysLeft <= 7 ? "rgba(196,112,90,0.1)" : "rgba(122,158,126,0.1)", border: `1px solid ${daysLeft <= 7 ? "rgba(196,112,90,0.2)" : "rgba(122,158,126,0.2)"}` }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={daysLeft <= 7 ? c.ember : c.sage} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: daysLeft <= 7 ? c.ember : c.sage }}>{daysLeft} days until interview</span>
                    </div>
                  </div>
                )}
                <h3 style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory, marginBottom: 6 }}>
                  {hasData ? `Ready for session #${overallStats.sessionsCompleted + 1}?` : "Start practicing to level up your interview skills"}
                </h3>
                <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, lineHeight: 1.5 }}>
                  {weakestSkill ? (
                    <>Your <strong style={{ color: c.chalk }}>{weakestSkill.name}</strong> score is {weakestSkill.score}{user?.targetCompany ? ` — ${user.targetCompany} interviews test this heavily` : ""}. Try a focused session to boost it.</>
                  ) : (
                    <>Each session is tailored to your target role{user?.targetCompany ? ` at ${user.targetCompany}` : ""}. Complete your first session to get personalized insights.</>
                  )}
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
                <button className="shimmer-btn" onClick={() => nav("/session/new")} style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, padding: "12px 28px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}
                  onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(201,169,110,0.2)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="5,3 19,12 5,21" /></svg>
                  Start Session
                </button>
                {/* Dynamic streak */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "rgba(201,169,110,0.04)", border: `1px solid ${c.border}` }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                  <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.gilt }}>{currentStreak > 0 ? `${currentStreak}-day streak` : "Start a streak"}</span>
                  <div style={{ width: 1, height: 14, background: c.border, margin: "0 2px" }} />
                  {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => {
                    const today = new Date();
                    const todayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1;
                    const isToday = i === todayIdx;
                    const isFuture = i > todayIdx;
                    const practiced = weekActivity[i];
                    return (
                      <div key={i} title={`${day}: ${isFuture ? "Upcoming" : practiced ? "Practiced" : "Missed"}`} style={{
                        width: 20, height: 20, borderRadius: 4,
                        background: practiced ? "rgba(201,169,110,0.15)" : !isFuture && !practiced ? "rgba(196,112,90,0.06)" : c.obsidian,
                        border: `1px solid ${practiced ? c.gilt : isToday ? c.gilt : !isFuture && !practiced ? "rgba(196,112,90,0.2)" : c.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontFamily: font.mono, fontWeight: 600,
                        color: practiced ? c.gilt : isToday ? c.ivory : c.stone,
                        boxShadow: isToday ? `0 0 0 1px ${c.gilt}40` : "none",
                      }}>{day}</div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Readiness", value: hasData ? readinessScore.toString() : "—", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, sub: hasData ? scoreLabel(readinessScore) : "Complete a session", subColor: hasData ? scoreLabelColor(readinessScore) : c.stone },
                { label: "Sessions", value: overallStats.sessionsCompleted.toString(), icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>, sub: hasData ? `${weekActivity.filter(Boolean).length} this week` : "Get started", subColor: c.stone },
                { label: "Avg Score", value: hasData ? overallStats.avgScore.toString() : "—", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, sub: hasData ? `+${overallStats.improvement} pts` : "No data yet", subColor: hasData ? c.sage : c.stone },
                { label: "Improvement", value: hasData ? `+${overallStats.improvement}%` : "—", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>, sub: hasData ? "All skills" : "Practice to improve", subColor: c.stone },
                { label: "Time Logged", value: hasData ? `${overallStats.hoursLogged}h` : "0h", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, sub: "Total", subColor: c.stone },
              ].map((stat, i) => (
                <div key={i} style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "18px", transition: "border-color 0.25s ease", ...(isMobile && i === 4 ? { gridColumn: "1 / -1" } : {}) }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = c.borderHover}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = c.border}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{stat.label}</span>{stat.icon}
                  </div>
                  <span style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 600, color: c.ivory, display: "block", marginBottom: 2, letterSpacing: "-0.02em" }}>{stat.value}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 10, color: stat.subColor, fontWeight: stat.subColor !== c.stone ? 600 : 400 }}>{stat.sub}</span>
                </div>
              ))}
            </div>

            {/* Upcoming Interviews Quick View */}
            {(() => {
              const upcomingEvents = calendarEvents
                .filter(e => e.status === "upcoming" && daysUntilEvent(e.date, e.time) >= 0)
                .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime())
                .slice(0, 3);
              if (upcomingEvents.length === 0) return null;
              return (
                <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "18px 24px", marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, display: "flex", alignItems: "center", gap: 8 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      Upcoming Interviews
                    </h3>
                    <button onClick={() => { setActiveNav("calendar"); }} style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.gilt, background: "none", border: "none", cursor: "pointer" }}>View all</button>
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {upcomingEvents.map(ev => {
                      const days = daysUntilEvent(ev.date, ev.time);
                      const urgent = days <= 3;
                      const isToday = days === 0;
                      return (
                        <div key={ev.id} style={{
                          flex: "1 1 200px", padding: "12px 16px", borderRadius: 10,
                          background: c.obsidian, border: `1px solid ${urgent ? "rgba(196,112,90,0.15)" : c.border}`,
                          borderLeft: `3px solid ${isToday ? c.ember : urgent ? c.gilt : c.sage}`,
                          cursor: "pointer",
                        }} onClick={() => setActiveNav("calendar")}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory }}>{ev.company}</span>
                            <span style={{
                              fontFamily: font.mono, fontSize: 9, fontWeight: 600, padding: "2px 7px",
                              borderRadius: 100,
                              background: isToday ? "rgba(196,112,90,0.12)" : urgent ? "rgba(201,169,110,0.1)" : "rgba(122,158,126,0.08)",
                              color: isToday ? c.ember : urgent ? c.gilt : c.sage,
                            }}>
                              {isToday ? "TODAY" : days === 1 ? "TOMORROW" : `${days}d`}
                            </span>
                          </div>
                          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{ev.type} · {formatEventDate(ev.date)} · {formatEventTime(ev.time)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Main Grid */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: 20 }}>
              {/* Left */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Score Trend */}
                <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <div>
                      <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Score Trend</h3>
                      <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>{scoreTrend.length > 0 ? "Hover for details" : "Complete sessions to see your progress"}</p>
                    </div>
                  </div>
                  {scoreTrend.length >= 2 ? (
                    <>
                      <ScoreTrendChart data={scoreTrend} />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, padding: "0 24px" }}>
                        <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>{scoreTrend[0].date}</span>
                        <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>{scoreTrend[scoreTrend.length - 1].date}</span>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center" }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={c.border} strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 12 }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                      <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>Your score trend will appear here after your first session</p>
                      <button onClick={() => nav("/session/new")} style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.gilt, background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.15)`, borderRadius: 6, padding: "8px 16px", cursor: "pointer", marginTop: 12 }}>Start a Session</button>
                    </div>
                  )}
                </div>

                {/* Sessions — search + date range */}
                <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory }}>Recent Sessions</h3>
                    <button onClick={() => setSortBy(sortBy === "date" ? "score" : "date")}
                      style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, background: c.obsidian, border: `1px solid ${c.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, outline: "none" }}
                      onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px ${c.gilt}40`}
                      onBlur={(e) => e.currentTarget.style.boxShadow = "none"}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {sortBy === "date" ? <><polyline points="3 6 9 6"/><polyline points="3 12 15 12"/><polyline points="3 18 21 18"/></> : <><polyline points="3 6 21 6"/><polyline points="3 12 15 12"/><polyline points="3 18 9 18"/></>}
                      </svg>
                      {sortBy === "date" ? "By date" : "By score"}
                    </button>
                  </div>

                  {/* Search bar */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 160, position: "relative" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      <input
                        type="text" placeholder="Search sessions..."
                        value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                          width: "100%", padding: "7px 10px 7px 32px", fontFamily: font.ui, fontSize: 12,
                          color: c.ivory, background: c.obsidian, border: `1px solid ${c.border}`,
                          borderRadius: 6, outline: "none", boxSizing: "border-box",
                        }}
                        onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
                        onBlur={(e) => e.currentTarget.style.borderColor = c.border}
                      />
                    </div>
                    {/* Date range filter */}
                    <div style={{ display: "flex", gap: 4 }}>
                      {(["all", "month", "week"] as const).map((range) => (
                        <button key={range} onClick={() => setDateRange(range)}
                          style={{
                            fontFamily: font.ui, fontSize: 10, fontWeight: 500, padding: "5px 10px",
                            borderRadius: 6, cursor: "pointer",
                            background: dateRange === range ? "rgba(201,169,110,0.1)" : "transparent",
                            border: `1px solid ${dateRange === range ? c.gilt : c.border}`,
                            color: dateRange === range ? c.gilt : c.stone,
                            transition: "all 0.2s ease", outline: "none",
                          }}>
                          {range === "all" ? "All time" : range === "month" ? "30 days" : "7 days"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Type filter pills */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                    {sessionTypes.map((type) => (
                      <button key={type} onClick={() => setFilterType(type)}
                        style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, padding: "5px 12px", borderRadius: 100, cursor: "pointer", background: filterType === type ? "rgba(201,169,110,0.1)" : "transparent", border: `1px solid ${filterType === type ? c.gilt : c.border}`, color: filterType === type ? c.gilt : c.stone, transition: "all 0.2s ease", outline: "none" }}
                        onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px ${c.gilt}40`}
                        onBlur={(e) => e.currentTarget.style.boxShadow = "none"}>
                        {type}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {filteredSessions.length === 0 ? (
                      <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, textAlign: "center", padding: "24px 0" }}>
                        {searchQuery ? `No sessions matching "${searchQuery}"` : "No sessions match this filter."}
                      </p>
                    ) : (
                      filteredSessions.map((session) => (
                        <div key={session.id}>
                          <button onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)} aria-expanded={expandedSession === session.id}
                            style={{ width: "100%", padding: "14px 16px", borderRadius: 10, background: expandedSession === session.id ? `rgba(201,169,110,0.04)` : c.obsidian, border: `1px solid ${expandedSession === session.id ? `rgba(201,169,110,0.12)` : c.border}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 16, transition: "all 0.2s ease", textAlign: "left", outline: "none" }}
                            onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px ${c.gilt}40`}
                            onBlur={(e) => e.currentTarget.style.boxShadow = "none"}
                            onMouseEnter={(e) => { if (expandedSession !== session.id) e.currentTarget.style.borderColor = c.borderHover; }}
                            onMouseLeave={(e) => { if (expandedSession !== session.id) e.currentTarget.style.borderColor = c.border; }}>
                            <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, border: `2px solid ${scoreLabelColor(session.score)}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 600, color: c.ivory, lineHeight: 1 }}>{session.score}</span>
                              <span style={{ fontFamily: font.ui, fontSize: 7, color: scoreLabelColor(session.score), fontWeight: 600, lineHeight: 1, marginTop: 1 }}>{scoreLabel(session.score)}</span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                                <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>{session.type}</span>
                                <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: session.change > 0 ? c.sage : c.ember }}>{session.change > 0 ? "+" : ""}{session.change}</span>
                              </div>
                              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{session.role}</span>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, display: "block" }}>{session.dateLabel}</span>
                              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{session.duration}</span>
                            </div>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round" style={{ transform: expandedSession === session.id ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
                          </button>

                          {expandedSession === session.id && (
                            <div style={{ padding: "16px 20px", margin: "4px 0", background: c.obsidian, borderRadius: 10, border: `1px solid ${c.border}`, animation: "slideDown 0.2s ease" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: feedbackSession === session.id ? 16 : 0 }}>
                                <div>
                                  <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.sage, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Top Strength</span>
                                  <span style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory }}>{session.topStrength}</span>
                                </div>
                                <div>
                                  <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.ember, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>To Improve</span>
                                  <span style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory }}>{session.topWeakness}</span>
                                </div>
                              </div>
                              {feedbackSession === session.id && (
                                <div style={{ padding: "14px 16px", borderRadius: 8, background: "rgba(201,169,110,0.03)", border: `1px solid rgba(201,169,110,0.08)`, marginBottom: 12 }}>
                                  <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.gilt, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>AI Feedback</span>
                                  <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.7, margin: 0 }}>{session.feedback}</p>
                                </div>
                              )}
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button onClick={() => setFeedbackSession(feedbackSession === session.id ? null : session.id)}
                                  style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.gilt, background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.15)`, borderRadius: 6, padding: "8px 16px", cursor: "pointer", transition: "all 0.2s ease", outline: "none" }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.12)"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.06)"; }}>
                                  {feedbackSession === session.id ? "Hide Feedback" : "View Feedback"}
                                </button>
                                {/* View full session detail */}
                                <button onClick={() => setViewingSession(session.id)}
                                  style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.ivory, background: "rgba(240,237,232,0.04)", border: `1px solid ${c.border}`, borderRadius: 6, padding: "8px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s ease", outline: "none" }}
                                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.borderHover; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                                  Full Transcript
                                </button>
                                <button onClick={() => nav(`/session/new?type=${session.type.toLowerCase().replace(" ", "-")}`)}
                                  style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.stone, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 6, padding: "8px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s ease", outline: "none" }}
                                  onMouseEnter={(e) => { e.currentTarget.style.color = c.ivory; e.currentTarget.style.borderColor = c.borderHover; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; e.currentTarget.style.borderColor = c.border; }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                                  Redo {session.type}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Skill Radar */}
                <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Skill Breakdown</h3>
                  </div>
                  {skills.length > 0 ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 2, background: c.gilt, borderRadius: 1 }} /><span style={{ fontFamily: font.ui, fontSize: 9, color: c.stone }}>Current</span></div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 2, background: c.stone, borderRadius: 1, opacity: 0.5 }} /><span style={{ fontFamily: font.ui, fontSize: 9, color: c.stone }}>First session</span></div>
                      </div>
                      <SkillRadar skills={skills} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                        {skills.map((sk) => (
                          <div key={sk.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, flex: 1 }}>{sk.name}</span>
                            <div style={{ width: 60, height: 3, background: c.border, borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", width: `${sk.score}%`, background: sk.color, borderRadius: 2 }} /></div>
                            <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.ivory, width: 22, textAlign: "right" }}>{sk.score}</span>
                            <span style={{ fontFamily: font.mono, fontSize: 10, color: c.sage, width: 28, textAlign: "right" }}>+{sk.score - sk.prev}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 16px", textAlign: "center" }}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={c.border} strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 10 }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                      <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, lineHeight: 1.5 }}>Complete your first session to see your skill breakdown across communication, leadership, and more.</p>
                    </div>
                  )}
                </div>

                {/* Tabbed Insights & Goals */}
                <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}` }}>
                  <div style={{ display: "flex", borderBottom: `1px solid ${c.border}` }}>
                    {([["insights", "AI Insights"], ["goals", "Weekly Goals"]] as const).map(([key, label]) => (
                      <button key={key} onClick={() => setRightTab(key)}
                        style={{ flex: 1, padding: "14px 16px", fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: rightTab === key ? c.ivory : c.stone, background: "transparent", border: "none", cursor: "pointer", borderBottom: rightTab === key ? `2px solid ${c.gilt}` : "2px solid transparent", transition: "all 0.2s ease", outline: "none" }}
                        onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px inset ${c.gilt}40`}
                        onBlur={(e) => e.currentTarget.style.boxShadow = "none"}>
                        {label}
                        {key === "goals" && <span style={{ marginLeft: 6, fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.gilt, background: "rgba(201,169,110,0.1)", padding: "1px 6px", borderRadius: 4 }}>{upcomingGoals.filter(g => g.progress < g.total).length}</span>}
                      </button>
                    ))}
                  </div>
                  <div style={{ padding: "20px 24px" }}>
                    {rightTab === "insights" ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {aiInsights.map((insight, i) => (
                          <div key={i} style={{ padding: "12px 14px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}`, borderLeft: `3px solid ${insight.type === "strength" ? c.sage : insight.type === "weakness" ? c.ember : c.gilt}` }}>
                            <span style={{ fontFamily: font.ui, fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: insight.type === "strength" ? c.sage : insight.type === "weakness" ? c.ember : c.gilt, display: "block", marginBottom: 4 }}>
                              {insight.type === "strength" ? "Strength" : insight.type === "weakness" ? "Improve" : "Tip"}
                            </span>
                            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.5 }}>{insight.text}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {upcomingGoals.map((goal, i) => (
                          <div key={i}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>{goal.label}</span>
                              <span style={{ fontFamily: font.mono, fontSize: 11, color: goal.progress >= goal.total ? c.sage : c.stone }}>{goal.progress}/{goal.total}</span>
                            </div>
                            <div style={{ height: 4, background: c.border, borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${(goal.progress / goal.total) * 100}%`, background: goal.progress >= goal.total ? c.sage : c.gilt, borderRadius: 2, transition: "width 0.3s ease" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
