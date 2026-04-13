import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { getUserSessions, getCalendarEvents, syncGoogleEvents, getGoogleProviderToken } from "./supabase";
import { scheduleEventNotifications } from "./interviewNotifications";
import { type InterviewEvent, loadEvents } from "./dashboardHelpers";
import {
  type PersistedState, type DashboardSession, type SkillData, type TrendPoint,
  type RealSession, type SkillVelocity, type CompanyReadiness, type ImprovementPlan,
  FREE_SESSION_LIMIT, STARTER_WEEKLY_LIMIT,
  loadState, saveState, getSessionData,
  generateFallbackInsights, generateNotifications, generateGoals,
  getReturnContext, getSmartScheduleSuggestion, getImprovementPlan,
  computeWeekActivity, computeStreak, computeReadiness, computeCompanyReadiness, daysUntil,
  generateReport,
  computeBadges, getDailyChallenge, getPracticeReminder,
} from "./dashboardData";

/* ─── Sub-context types ─── */

interface SessionsContextValue {
  recentSessions: DashboardSession[];
  scoreTrend: TrendPoint[];
  skills: SkillData[];
  skillVelocity: SkillVelocity[];
  overallStats: { sessionsCompleted: number; avgScore: number; improvement: number; hoursLogged: number };
  hasData: boolean;
  weekActivity: boolean[];
  currentStreak: number;
  readinessScore: number;
  calendarEvents: InterviewEvent[];
  refreshSessions: () => void;
}

interface SubscriptionContextValue {
  isFree: boolean;
  isStarter: boolean;
  isPro: boolean;
  atSessionLimit: boolean;
  sessionsUsed: number;
  sessionsRemaining: number;
  starterRemaining: number;
  sessionsThisWeek: number;
}

interface UIContextValue {
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
}

interface CoreContextValue {
  persisted: PersistedState;
  updatePersisted: (updates: Partial<PersistedState>) => void;
  displayName: string;
  isNewUser: boolean;
  daysLeft: number;
  aiInsights: { type: string; text: string; action?: string }[];
  notifications: { id: number; type: string; text: string; dismissible: boolean; action?: string }[];
  upcomingGoals: { label: string; progress: number; total: number; action?: string }[];
  returnContext: string | null;
  smartSchedule: string | null;
  prepPlan: ImprovementPlan | null;
  companyReadiness: CompanyReadiness | null;
  badges: { id: string; label: string; description: string; icon: string; earned: boolean; progress: number }[];
  dailyChallenge: { id: string; label: string; description: string; type: string; focus?: string; difficulty: string; completed: boolean };
  practiceReminder: string | null;
  googleSyncStatus: "idle" | "syncing" | "done" | "error";
  googleSyncError: string | null;
  hasGoogleToken: boolean;
  syncGoogleCalendar: () => Promise<void>;
  handleStartSession: () => void;
  handleExport: () => void;
  handleDownload: () => void;
  handleExportCSV: () => void;
  handleExportPDF: () => void;
}

/* ─── Contexts ─── */

const SessionsContext = createContext<SessionsContextValue | null>(null);
const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);
const UIContext = createContext<UIContextValue | null>(null);
const CoreContext = createContext<CoreContextValue | null>(null);

/* ─── Focused hooks ─── */

export function useDashboardSessions() {
  const ctx = useContext(SessionsContext);
  if (!ctx) throw new Error("useDashboardSessions must be used within DashboardProvider");
  return ctx;
}

export function useDashboardSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useDashboardSubscription must be used within DashboardProvider");
  return ctx;
}

export function useDashboardUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useDashboardUI must be used within DashboardProvider");
  return ctx;
}

export function useDashboardCore() {
  const ctx = useContext(CoreContext);
  if (!ctx) throw new Error("useDashboardCore must be used within DashboardProvider");
  return ctx;
}

/** Backward-compatible aggregate hook — returns all properties from all sub-contexts */
export function useDashboard() {
  const sessions = useDashboardSessions();
  const subscription = useDashboardSubscription();
  const ui = useDashboardUI();
  const core = useDashboardCore();
  return { ...sessions, ...subscription, ...ui, ...core };
}

/* ─── Provider ─── */

export function DashboardProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const { user, updateUser: _authUpdateUser } = useAuth();
  const [persisted, setPersisted] = useState<PersistedState>(() => {
    const local = loadState();
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

  // ─── Google Calendar sync state ───
  const [googleSyncStatus, setGoogleSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [googleSyncError, setGoogleSyncError] = useState<string | null>(null);
  const [hasGoogleToken, setHasGoogleToken] = useState(() => !!getGoogleProviderToken());

  const syncGoogleCalendar = useCallback(async () => {
    if (!user?.id) return;
    setGoogleSyncStatus("syncing");
    setGoogleSyncError(null);
    try {
      const result = await syncGoogleEvents(user.id);
      if (result.error) {
        setGoogleSyncStatus("error");
        setGoogleSyncError(result.error);
        showToast(result.error);
      } else {
        setGoogleSyncStatus("done");
        showToast(result.synced > 0 ? `Synced ${result.synced} interview(s) from Google Calendar` : "No new interviews found");
        if (result.synced > 0) {
          const events = await getCalendarEvents(user.id);
          const mapped = events.map(e => ({
            id: e.id, title: e.title, company: e.company,
            date: e.date, time: e.time, type: e.type,
            duration: 60, location: "", notes: e.notes,
            status: "upcoming" as const, reminders: true,
            google_event_id: e.google_event_id,
          }));
          setCalendarEvents(mapped);
          scheduleEventNotifications(mapped);
        }
      }
    } catch (err: unknown) {
      setGoogleSyncStatus("error");
      setGoogleSyncError(err instanceof Error ? err.message : "Sync failed");
      setHasGoogleToken(!!getGoogleProviderToken());
      showToast("Google Calendar sync failed");
    }
  }, [user?.id, showToast]);

  // Sync persisted state when user profile loads/changes
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

    const sessionsCacheKey = `hirestepx_cache_sessions_${user.id}`;
    const eventsCacheKey = `hirestepx_cache_events_${user.id}`;

    let cancelled = false;

    Promise.allSettled([
      getUserSessions(user.id).then(sessions => {
        if (cancelled) return;
        const mapped = sessions.map(s => ({
          id: s.id, date: s.date, type: s.type, difficulty: s.difficulty,
          focus: s.focus, duration: s.duration, score: s.score, questions: s.questions,
          ai_feedback: s.ai_feedback, skill_scores: s.skill_scores,
        }));
        setSupabaseSessions(mapped);
        try { localStorage.setItem(sessionsCacheKey, JSON.stringify(mapped)); } catch { /* expected: localStorage may be unavailable */ }
      }).catch(() => {
        if (cancelled) return;
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
        scheduleEventNotifications(mapped);
        try { localStorage.setItem(eventsCacheKey, JSON.stringify(mapped)); } catch { /* expected: localStorage may be unavailable */ }
      }).catch(() => {
        if (cancelled) return;
        try {
          const cached = localStorage.getItem(eventsCacheKey);
          if (cached) {
            setCalendarEvents(JSON.parse(cached));
            if (!syncError) setSyncError("Offline — showing cached data.");
          }
        } catch { /* expected: cache read may fail */ }
      }),
    ]).then(() => {
      if (!cancelled) setDataLoading(false);
    });

    const timeout = setTimeout(() => { if (!cancelled) setDataLoading(false); }, 10000);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [user?.id]);

  // Refetch sessions from Supabase
  const refreshSessions = useCallback(() => {
    if (!user?.id) return;
    getUserSessions(user.id).then(sessions => {
      const mapped = sessions.map(s => ({
        id: s.id, date: s.date, type: s.type, difficulty: s.difficulty,
        focus: s.focus, duration: s.duration, score: s.score, questions: s.questions,
        ai_feedback: s.ai_feedback, skill_scores: s.skill_scores,
      }));
      setSupabaseSessions(mapped);
      try { localStorage.setItem(`hirestepx_cache_sessions_${user.id}`, JSON.stringify(mapped)); } catch { /* expected: localStorage may be unavailable */ }
    }).catch(() => {});
  }, [user?.id]);

  // Auto-refresh data when user returns to tab
  useEffect(() => {
    if (!user?.id) return;
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      refreshSessions();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [user?.id, refreshSessions]);

  // Session data
  const { recentSessions, scoreTrend, skills, overallStats, hasData, skillVelocity } = useMemo(
    () => getSessionData(user?.targetRole || persisted.targetRole, supabaseSessions),
    [user?.targetRole, persisted.targetRole, supabaseSessions],
  );

  const weekActivity = useMemo(() => computeWeekActivity(recentSessions), [recentSessions]);
  const currentStreak = useMemo(() => computeStreak(recentSessions), [recentSessions]);

  // Personalized AI insights
  const fallbackInsights = useMemo(() => generateFallbackInsights(user, skills, skillVelocity), [user, skills, skillVelocity]);
  const [llmInsights, setLlmInsights] = useState<{ type: string; text: string }[] | null>(null);
  const insightsFetchedRef = useRef<string>("");

  useEffect(() => {
    if (!user?.id || skills.length === 0 || recentSessions.length === 0) return;
    const tier = user.subscriptionTier || "free";
    if (tier === "free") { setLlmInsights(null); return; }

    const cacheKey = `hirestepx_insights_${user.id}_${recentSessions.length}`;
    if (insightsFetchedRef.current === cacheKey) return;
    insightsFetchedRef.current = cacheKey;

    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { insights, ts } = JSON.parse(cached);
        if (Date.now() - ts < 86400000) { setLlmInsights(insights); return; }
      }
    } catch { /* expected: cache read may fail */ }

    (async () => {
      try {
        const { authHeaders } = await import("./supabase");
        const hdrs = await authHeaders();
        const res = await fetch("/api/generate-insights", {
          method: "POST",
          headers: hdrs,
          body: JSON.stringify({
            role: user.targetRole,
            company: user.targetCompany,
            industry: user.industry,
            sessionCount: recentSessions.length,
            skills: skills.map(s => ({ name: s.name, score: s.score, prev: s.prev })),
            recentSessions: recentSessions.slice(0, 5).map(s => ({
              type: s.type, score: s.score, date: s.date,
              topStrength: s.topStrength, topWeakness: s.topWeakness,
            })),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.insights && data.insights.length > 0) {
            setLlmInsights(data.insights);
            try { localStorage.setItem(cacheKey, JSON.stringify({ insights: data.insights, ts: Date.now() })); } catch { /* expected: localStorage may be unavailable */ }
          }
        }
      } catch {
        // Silently fall back to template insights
      }
    })();
  }, [user, skills, recentSessions]);

  const aiInsights = llmInsights || fallbackInsights;
  const notifications = useMemo(() => generateNotifications(user, currentStreak, weekActivity, recentSessions), [user, currentStreak, weekActivity, recentSessions]);
  const upcomingGoals = useMemo(() => generateGoals(user, weekActivity, skills, skillVelocity), [user, weekActivity, skills, skillVelocity]);
  const returnContext = useMemo(() => getReturnContext(recentSessions), [recentSessions]);
  const smartSchedule = useMemo(() => getSmartScheduleSuggestion(user), [user]);
  const prepPlan = useMemo(() => getImprovementPlan(user, recentSessions, skills, skillVelocity), [user, recentSessions, skills, skillVelocity]);
  const badges = useMemo(() => computeBadges(recentSessions, skills, currentStreak), [recentSessions, skills, currentStreak]);
  const dailyChallenge = useMemo(() => getDailyChallenge(recentSessions, skills), [recentSessions, skills]);
  const practiceReminder = useMemo(() => getPracticeReminder(recentSessions, currentStreak), [recentSessions, currentStreak]);

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
  const companyReadiness = useMemo(() => {
    if (!user?.targetCompany || skills.length === 0) return null;
    return computeCompanyReadiness(user.targetCompany, skills, skillVelocity, daysLeft);
  }, [user?.targetCompany, skills, skillVelocity, daysLeft]);

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
    a.download = `HireStepX_Progress_${new Date().toISOString().split("T")[0]}.txt`;
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
    a.download = `HireStepX_Sessions_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV exported");
  }, [recentSessions, showToast]);

  const handleExportPDF = useCallback(() => {
    const report = generateReport(persisted.userName, overallStats, skills, recentSessions);
    const rows = recentSessions.slice(0, 20).map(s =>
      `<tr><td>${s.date}</td><td>${s.type}</td><td>${s.score}</td><td>${s.topStrength || "-"}</td><td>${s.topWeakness || "-"}</td></tr>`
    ).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>HireStepX Progress Report</title>
<style>body{font-family:Inter,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:720px;margin:0 auto;padding:40px 24px;line-height:1.6}
h1{font-size:22px;margin-bottom:4px}h2{font-size:16px;margin-top:32px;border-bottom:1px solid #ddd;padding-bottom:6px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #eee}
th{background:#f5f5f5;font-weight:600}.meta{color:#666;font-size:13px}pre{white-space:pre-wrap;font-size:12px;background:#f9f9f9;padding:16px;border-radius:8px}
@media print{body{padding:20px}}</style></head><body>
<h1>HireStepX Progress Report</h1>
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

  /* ─── Memoized sub-context values ─── */

  const sessionsValue: SessionsContextValue = useMemo(() => ({
    recentSessions, scoreTrend, skills, skillVelocity, overallStats, hasData,
    weekActivity, currentStreak, readinessScore,
    calendarEvents, refreshSessions,
  }), [recentSessions, scoreTrend, skills, skillVelocity, overallStats, hasData, weekActivity, currentStreak, readinessScore, calendarEvents, refreshSessions]);

  const subscriptionValue: SubscriptionContextValue = useMemo(() => ({
    isFree, isStarter, isPro, atSessionLimit,
    sessionsUsed, sessionsRemaining, starterRemaining, sessionsThisWeek,
  }), [isFree, isStarter, isPro, atSessionLimit, sessionsUsed, sessionsRemaining, starterRemaining, sessionsThisWeek]);

  const uiValue: UIContextValue = useMemo(() => ({
    showUpgradeModal, setShowUpgradeModal,
    dataLoading, isMobile,
    paymentBanner, setPaymentBanner,
    syncError, setSyncError,
    toast, showToast,
  }), [showUpgradeModal, dataLoading, isMobile, paymentBanner, syncError, toast, showToast]);

  const coreValue: CoreContextValue = useMemo(() => ({
    persisted, updatePersisted,
    displayName, isNewUser, daysLeft,
    aiInsights, notifications, upcomingGoals,
    returnContext, smartSchedule, prepPlan, companyReadiness,
    badges, dailyChallenge, practiceReminder,
    googleSyncStatus, googleSyncError, hasGoogleToken, syncGoogleCalendar,
    handleStartSession, handleExport, handleDownload, handleExportCSV, handleExportPDF,
  }), [
    persisted, updatePersisted,
    displayName, isNewUser, daysLeft,
    aiInsights, notifications, upcomingGoals,
    returnContext, smartSchedule, prepPlan, companyReadiness,
    badges, dailyChallenge, practiceReminder,
    googleSyncStatus, googleSyncError, hasGoogleToken, syncGoogleCalendar,
    handleStartSession, handleExport, handleDownload, handleExportCSV, handleExportPDF,
  ]);

  return (
    <SessionsContext.Provider value={sessionsValue}>
      <SubscriptionContext.Provider value={subscriptionValue}>
        <UIContext.Provider value={uiValue}>
          <CoreContext.Provider value={coreValue}>
            {children}
          </CoreContext.Provider>
        </UIContext.Provider>
      </SubscriptionContext.Provider>
    </SessionsContext.Provider>
  );
}
