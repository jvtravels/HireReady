import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
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
  /* Actions */
  handleStartSession: () => void;
  handleExport: () => void;
  handleDownload: () => void;
  handleExportCSV: () => void;
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
  const [persisted, setPersisted] = useState<PersistedState>(loadState);
  const [calendarEvents, setCalendarEvents] = useState<InterviewEvent[]>(loadEvents);
  const [supabaseSessions, setSupabaseSessions] = useState<RealSession[]>([]);
  const [syncError, setSyncError] = useState("");
  const [dataLoading, setDataLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [paymentBanner, setPaymentBanner] = useState<"success" | "cancelled" | null>(null);

  // Load data from Supabase on mount
  useEffect(() => {
    if (!user?.id) { setDataLoading(false); return; }
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 2) setDataLoading(false); };
    getUserSessions(user.id).then(sessions => {
      if (sessions.length > 0) {
        setSupabaseSessions(sessions.map(s => ({
          id: s.id, date: s.date, type: s.type, difficulty: s.difficulty,
          focus: s.focus, duration: s.duration, score: s.score, questions: s.questions,
          ai_feedback: s.ai_feedback, skill_scores: s.skill_scores,
        })));
      }
    }).catch(() => { setSyncError("Could not load session data. Using local data."); }).finally(checkDone);
    getCalendarEvents(user.id).then(events => {
      if (events.length > 0) {
        setCalendarEvents(events.map(e => ({
          id: e.id, title: e.title, company: e.company,
          date: e.date, time: e.time, type: e.type, notes: e.notes,
          duration: 60, location: "", status: "upcoming" as const, reminders: true,
        })));
      }
    }).catch(() => { setSyncError("Could not load calendar data. Using local data."); }).finally(checkDone);
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
  }, [persisted.userName, overallStats, skills, recentSessions]);

  const handleDownload = useCallback(() => {
    const report = generateReport(persisted.userName, overallStats, skills, recentSessions);
    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `HireReady_Progress_${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [persisted.userName, overallStats, skills, recentSessions]);

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
    a.download = `HireReady_Sessions_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [recentSessions]);

  const value: DashboardContextValue = {
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
    displayName, isNewUser, daysLeft,
    aiInsights, notifications, upcomingGoals,
    returnContext, smartSchedule, prepPlan,
    handleStartSession, handleExport, handleDownload, handleExportCSV,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
