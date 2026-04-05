import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { getUserSessions, getCalendarEvents } from "./supabase";
import { type InterviewEvent, loadEvents } from "./dashboardHelpers";
import {
  type PersistedState, type DashboardSession, type SkillData, type TrendPoint,
  type RealSession,
  FREE_SESSION_LIMIT, STARTER_WEEKLY_LIMIT,
  loadState, saveState, getSessionData,
  generatePersonalizedInsights, generateNotifications, generateGoals,
  getReturnContext, getSmartScheduleSuggestion, getPrepPlan,
  computeWeekActivity, computeStreak, computeReadiness, daysUntil,
  generateReport, scoreLabel,
  computeBadges, getDailyChallenge, getPracticeReminder,
} from "./dashboardData";

interface DashboardContextValue {
  /* State */
  persisted: PersistedState;
  updatePersisted: (updates: Partial<PersistedState>) => void;
  recentSessions: DashboardSession[];
  scoreTrend: TrendPoint[];
  skills: SkillData[];
  overallStats: { sessionsCompleted: number; avgScore: number; improvement: number; hoursLogged: number };
  hasData: boolean;
  weekActivity: boolean[];
  currentStreak: number;
  readinessScore: number;
  calendarEvents: InterviewEvent[];
  /* Subscription */
  isFree: boolean;
  isStarter: boolean;
  isPro: boolean;
  atSessionLimit: boolean;
  sessionsUsed: number;
  sessionsRemaining: number;
  starterRemaining: number;
  sessionsThisWeek: number;
  /* UI state */
  showUpgradeModal: boolean;
  setShowUpgradeModal: (v: boolean) => void;
  dataLoading: boolean;
  isMobile: boolean;
  paymentBanner: "success" | "cancelled" | null;
  setPaymentBanner: (v: "success" | "cancelled" | null) => void;
  syncError: string;
  setSyncError: (v: string) => void;
  toast: string | null;
  showToast: (msg: string) => void;
  /* Derived */
  displayName: string;
  isNewUser: boolean;
  daysLeft: number;
  aiInsights: { type: string; text: string }[];
  notifications: { id: number; type: string; text: string; dismissible: boolean; action?: string }[];
  upcomingGoals: { label: string; progress: number; total: number }[];
  returnContext: string | null;
  smartSchedule: string | null;
  prepPlan: { label: string; done: boolean }[] | null;
  badges: { id: string; label: string; description: string; icon: string; earned: boolean; progress: number }[];
  dailyChallenge: { id: string; label: string; description: string; type: string; focus?: string; difficulty: string; completed: boolean };
  practiceReminder: string | null;
  /* Actions */
  handleStartSession: () => void;
  handleExport: () => void;
  handleDownload: () => void;
  handleExportCSV: () => void;
  handleExportPDF: () => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const { logout: authLogout, user, updateUser: authUpdateUser } = useAuth();
  const [persisted, setPersisted] = useState<PersistedState>(() => {
    const local = loadState();
    // Merge with auth user profile (Supabase data takes precedence over empty localStorage)
    if (user) {
      return {
        ...local,
        userName: user.name != null && user.name !== "" ? user.name : local.userName,
        targetRole: user.targetRole != null && user.targetRole !== "" ? user.targetRole : local.targetRole,
        interviewDate: user.interviewDate != null && user.interviewDate !== "" ? user.interviewDate : local.interviewDate,
        resumeFileName: user.resumeFileName != null && user.resumeFileName !== "" ? user.resumeFileName : local.resumeFileName,
        hasCompletedFirstSession: user.hasCompletedOnboarding || local.hasCompletedFirstSession,
      };
    }
    return local;
  });
  const [calendarEvents, setCalendarEvents] = useState<InterviewEvent[]>(loadEvents);
  const [supabaseSessions, setSupabaseSessions] = useState<RealSession[]>([]);
  const [syncError, setSyncError] = useState("");
  const [dataLoading, setDataLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [paymentBanner, setPaymentBanner] = useState<"success" | "cancelled" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Sync persisted state when user profile loads/changes (e.g., after profile fetch completes)
  useEffect(() => {
    if (!user) return;
    setPersisted(prev => {
      const updated = {
        ...prev,
        userName: user.name != null && user.name !== "" ? user.name : prev.userName,
        targetRole: user.targetRole != null && user.targetRole !== "" ? user.targetRole : prev.targetRole,
        interviewDate: user.interviewDate != null && user.interviewDate !== "" ? user.interviewDate : prev.interviewDate,
        resumeFileName: user.resumeFileName != null && user.resumeFileName !== "" ? user.resumeFileName : prev.resumeFileName,
        hasCompletedFirstSession: user.hasCompletedOnboarding || prev.hasCompletedFirstSession,
      };
      saveState(updated);
      return updated;
    });
  }, [user?.name, user?.targetRole, user?.interviewDate, user?.resumeFileName, user?.hasCompletedOnboarding]);

  // Load data from Supabase on mount, with localStorage cache fallback
  useEffect(() => {
    if (!user?.id) { setDataLoading(false); return; }

    const sessionsCacheKey = `hirloop_cache_sessions_${user.id}`;
    const eventsCacheKey = `hirloop_cache_events_${user.id}`;

    let cancelled = false;

    Promise.allSettled([
      getUserSessions(user.id).then(sessions => {
        if (cancelled) return;
        const mapped = sessions.map(s => ({
          id: s.id, date: s.date, type: s.type, difficulty: s.difficulty,
          focus: s.focus, duration: s.duration, score: s.score, questions: s.questions,
          ai_feedback: s.ai_feedback, skill_scores: s.skill_scores,
        }));
        // Always update from Supabase (including when sessions are deleted)
        setSupabaseSessions(mapped);
        try { localStorage.setItem(sessionsCacheKey, JSON.stringify(mapped)); } catch {}
      }).catch(() => {
        if (cancelled) return;
        // Fallback to cached sessions
        try {
          const cached = localStorage.getItem(sessionsCacheKey);
          if (cached) {
            setSupabaseSessions(JSON.parse(cached));
            setSyncError("Offline — showing cached data.");
          } else {
            setSyncError("Could not load session data.");
          }
        } catch { setSyncError("Could not load session data."); }
      }),
      getCalendarEvents(user.id).then(events => {
        if (cancelled) return;
        const mapped = events.map(e => ({
          id: e.id, title: e.title, company: e.company,
          date: e.date, time: e.time, type: e.type, notes: e.notes,
          duration: 60, location: "", status: "upcoming" as const, reminders: true,
        }));
        setCalendarEvents(mapped);
        try { localStorage.setItem(eventsCacheKey, JSON.stringify(mapped)); } catch {}
      }).catch(() => {
        if (cancelled) return;
        try {
          const cached = localStorage.getItem(eventsCacheKey);
          if (cached) {
            setCalendarEvents(JSON.parse(cached));
            if (!syncError) setSyncError("Offline — showing cached data.");
          }
        } catch {}
      }),
    ]).then(() => {
      if (!cancelled) setDataLoading(false);
    });

    // Safety timeout — never stay stuck on loading skeleton
    const timeout = setTimeout(() => { if (!cancelled) setDataLoading(false); }, 10000);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [user?.id]);

  // Auto-refresh data when user returns to tab (e.g. after completing an interview)
  useEffect(() => {
    if (!user?.id) return;
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      getUserSessions(user.id).then(sessions => {
        const mapped = sessions.map(s => ({
          id: s.id, date: s.date, type: s.type, difficulty: s.difficulty,
          focus: s.focus, duration: s.duration, score: s.score, questions: s.questions,
          ai_feedback: s.ai_feedback, skill_scores: s.skill_scores,
        }));
        setSupabaseSessions(mapped);
        try { localStorage.setItem(`hirloop_cache_sessions_${user.id}`, JSON.stringify(mapped)); } catch {}
      }).catch(() => {});
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [user?.id]);

  // Session data
  const { recentSessions, scoreTrend, skills, overallStats, hasData } = useMemo(
    () => getSessionData(user?.targetRole || persisted.targetRole, supabaseSessions),
    [user?.targetRole, persisted.targetRole, supabaseSessions],
  );

  const weekActivity = computeWeekActivity(recentSessions);
  const currentStreak = computeStreak(recentSessions);

  // Personalized data
  const aiInsights = generatePersonalizedInsights(user, skills);
  const notifications = generateNotifications(user, currentStreak, weekActivity, recentSessions);
  const upcomingGoals = generateGoals(user, weekActivity, skills);
  const returnContext = getReturnContext(recentSessions);
  const smartSchedule = getSmartScheduleSuggestion(user);
  const prepPlan = getPrepPlan(user, recentSessions, skills);
  const badges = computeBadges(recentSessions, skills, currentStreak);
  const dailyChallenge = getDailyChallenge(recentSessions, skills);
  const practiceReminder = getPracticeReminder(recentSessions, currentStreak);

  // Persist state
  const updatePersisted = useCallback((updates: Partial<PersistedState>) => {
    setPersisted(prev => {
      const next = { ...prev, ...updates };
      saveState(next);
      return next;
    });
  }, []);

  // Sync persisted state from auth context
  useEffect(() => {
    if (!user) return;
    const updates: Partial<PersistedState> = {};
    if (user.name && user.name !== persisted.userName) updates.userName = user.name;
    if (user.targetRole && user.targetRole !== persisted.targetRole) updates.targetRole = user.targetRole;
    if (user.resumeFileName && user.resumeFileName !== persisted.resumeFileName) updates.resumeFileName = user.resumeFileName;
    if (user.interviewDate && user.interviewDate !== persisted.interviewDate) updates.interviewDate = user.interviewDate;
    if (Object.keys(updates).length > 0) updatePersisted(updates);
  }, [user?.name, user?.targetRole, user?.resumeFileName, user?.interviewDate]);

  const displayName = user?.name || persisted.userName || "User";
  const isNewUser = !hasData;

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Handle payment redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if (payment === "success" || payment === "cancelled") {
      setPaymentBanner(payment);
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => setPaymentBanner(null), payment === "success" ? 8000 : 6000);
    }
    const pendingPlan = params.get("plan");
    if (pendingPlan === "weekly" || pendingPlan === "monthly") {
      setShowUpgradeModal(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Subscription info
  const isFree = !user?.subscriptionTier || user.subscriptionTier === "free";
  const isStarter = user?.subscriptionTier === "starter";
  const isPro = user?.subscriptionTier === "pro";
  const sessionsUsed = recentSessions.length;
  const sessionsRemaining = Math.max(0, FREE_SESSION_LIMIT - sessionsUsed);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0);
  const sessionsThisWeek = recentSessions.filter(s => new Date(s.date) >= weekStart).length;
  const starterRemaining = Math.max(0, STARTER_WEEKLY_LIMIT - sessionsThisWeek);
  const atSessionLimit = (isFree && sessionsUsed >= FREE_SESSION_LIMIT) || (isStarter && sessionsThisWeek >= STARTER_WEEKLY_LIMIT);

  const daysLeft = persisted.interviewDate ? daysUntil(persisted.interviewDate) : 0;
  const readinessScore = scoreTrend.length > 0 && skills.length > 0 ? computeReadiness(scoreTrend, skills) : 0;

  const handleStartSession = useCallback(() => {
    if (atSessionLimit) { setShowUpgradeModal(true); return; }
    nav("/session/new");
  }, [atSessionLimit, nav]);

  const handleExport = useCallback(() => {
    const report = generateReport(persisted.userName, overallStats, skills, recentSessions);
    navigator.clipboard.writeText(report);
    showToast("Report copied to clipboard");
  }, [persisted.userName, overallStats, skills, recentSessions, showToast]);

  const handleDownload = useCallback(() => {
    const report = generateReport(persisted.userName, overallStats, skills, recentSessions);
    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Hirloop_Progress_${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Report downloaded");
  }, [persisted.userName, overallStats, skills, recentSessions, showToast]);

  const handleExportCSV = useCallback(() => {
    if (recentSessions.length === 0) return;
    const headers = ["Date", "Type", "Role", "Score", "Change", "Duration", "Top Strength", "Area to Improve", "AI Feedback"];
    const rows = recentSessions.map(s => [
      s.date, s.type, s.role, s.score, s.change, s.duration,
      s.topStrength, s.topWeakness, `"${(s.feedback || "").replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Hirloop_Sessions_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV exported");
  }, [recentSessions, showToast]);

  const handleExportPDF = useCallback(() => {
    const report = generateReport(persisted.userName, overallStats, skills, recentSessions);
    const rows = recentSessions.slice(0, 20).map(s =>
      `<tr><td>${s.date}</td><td>${s.type}</td><td>${s.score}</td><td>${s.topStrength || "-"}</td><td>${s.topWeakness || "-"}</td></tr>`
    ).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hirloop Progress Report</title>
<style>body{font-family:Inter,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:720px;margin:0 auto;padding:40px 24px;line-height:1.6}
h1{font-size:22px;margin-bottom:4px}h2{font-size:16px;margin-top:32px;border-bottom:1px solid #ddd;padding-bottom:6px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #eee}
th{background:#f5f5f5;font-weight:600}.meta{color:#666;font-size:13px}pre{white-space:pre-wrap;font-size:12px;background:#f9f9f9;padding:16px;border-radius:8px}
@media print{body{padding:20px}}</style></head><body>
<h1>Hirloop Progress Report</h1>
<p class="meta">${persisted.userName || "User"} · Generated ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
<h2>Overview</h2>
<p>Sessions: ${overallStats.sessionsCompleted} · Average Score: ${overallStats.avgScore} · Improvement: ${overallStats.improvement > 0 ? "+" : ""}${overallStats.improvement}%</p>
${skills.length > 0 ? `<h2>Skills</h2><table><tr><th>Skill</th><th>Score</th><th>Change</th></tr>${skills.map(s => `<tr><td>${s.name}</td><td>${s.score}/100</td><td>${s.score - s.prev >= 0 ? "+" : ""}${s.score - s.prev}</td></tr>`).join("")}</table>` : ""}
<h2>Recent Sessions</h2>
<table><tr><th>Date</th><th>Type</th><th>Score</th><th>Strength</th><th>To Improve</th></tr>${rows}</table>
<h2>Full Report</h2><pre>${report.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.print(); }
    showToast("PDF export opened — use Save as PDF in print dialog");
  }, [persisted.userName, overallStats, skills, recentSessions, showToast]);

  const value: DashboardContextValue = useMemo(() => ({
    persisted, updatePersisted,
    recentSessions, scoreTrend, skills, overallStats, hasData,
    weekActivity, currentStreak, readinessScore,
    calendarEvents,
    isFree, isStarter, isPro, atSessionLimit,
    sessionsUsed, sessionsRemaining, starterRemaining, sessionsThisWeek,
    showUpgradeModal, setShowUpgradeModal,
    dataLoading, isMobile,
    paymentBanner, setPaymentBanner,
    syncError, setSyncError,
    toast, showToast,
    displayName, isNewUser, daysLeft,
    aiInsights, notifications, upcomingGoals,
    returnContext, smartSchedule, prepPlan,
    badges, dailyChallenge, practiceReminder,
    handleStartSession, handleExport, handleDownload, handleExportCSV, handleExportPDF,
  }), [
    persisted, updatePersisted,
    recentSessions, scoreTrend, skills, overallStats, hasData,
    weekActivity, currentStreak, readinessScore,
    calendarEvents,
    isFree, isStarter, isPro, atSessionLimit,
    sessionsUsed, sessionsRemaining, starterRemaining, sessionsThisWeek,
    showUpgradeModal, dataLoading, isMobile,
    paymentBanner, syncError, toast, showToast,
    displayName, isNewUser, daysLeft,
    aiInsights, notifications, upcomingGoals,
    returnContext, smartSchedule, prepPlan,
    badges, dailyChallenge, practiceReminder,
    handleStartSession, handleExport, handleDownload, handleExportCSV, handleExportPDF,
  ]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
