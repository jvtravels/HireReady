import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { c, font, sp, radius } from "./tokens";
import { useAuth } from "./AuthContext";
import { useDashboard } from "./DashboardContext";
import { DataLoadingSkeleton, EmptyState, SessionDetailView } from "./dashboardComponents";
import { scoreLabel, scoreLabelColor, sessionTypes } from "./dashboardTypes";
import { daysUntilEvent, formatEventDate, formatEventTime } from "./dashboardHelpers";
import { getPersonalizedGreeting } from "./dashboardData";
import { ScoreTrendChart, SkillRadar } from "./DashboardCharts";
import { useDocTitle } from "./useDocTitle";

/* ─── Shared premium card style ─── */
const card = {
  background: c.graphite,
  borderRadius: 12,
  border: "1px solid rgba(240,237,232,0.06)",
  position: "relative" as const,
} as const;

/* ─── Utility button style (hoisted for perf) ─── */
const utilBtn = {
  fontFamily: font.ui, fontSize: 13, fontWeight: 500 as const, color: c.stone,
  background: "transparent", border: `1px solid ${c.border}`, borderRadius: radius.sm,
  padding: "8px 14px", cursor: "pointer" as const, display: "flex" as const, alignItems: "center" as const,
  gap: 6, transition: "all 0.25s cubic-bezier(0.16,1,0.3,1)", outline: "none" as const,
};
const utilBtnEnter = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.borderColor = "rgba(201,169,110,0.3)"; e.currentTarget.style.color = c.ivory; };
const utilBtnLeave = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; };

/* ─── Section heading (serif) ─── */
const sectionTitle = (text: string, size = 18, tag: "h2" | "h3" = "h3") => {
  const Tag = tag;
  return <Tag style={{ fontFamily: font.display, fontSize: size, fontWeight: 400, color: c.ivory, letterSpacing: "0.01em", margin: 0 }}>{text}</Tag>;
};

/* ─── Badge icon SVGs (premium, no emojis) ─── */
const badgeIcons: Record<string, (color: string) => JSX.Element> = {
  target: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  layers: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  award: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>,
  star: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  flame: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>,
  compass: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>,
  gem: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 18 3 22 9 12 22 2 9 6 3"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="12" y1="22" x2="8" y2="9"/><line x1="12" y1="22" x2="16" y2="9"/><line x1="6" y1="3" x2="8" y2="9"/><line x1="18" y1="3" x2="16" y2="9"/></svg>,
  crown: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-9-4 9-6-7z"/><path d="M3 20h18"/></svg>,
};

/* ─── Haptic feedback for mobile ─── */
function haptic(ms = 10) { try { navigator.vibrate?.(ms); } catch {} }

/* ─── Onboarding Tour ─── */
const tourSteps = [
  { title: "Your Performance at a Glance", desc: "These stats show your readiness score, session count, average score, improvement trend, and total practice time.", target: "stat-grid" },
  { title: "Score Trend & Skills", desc: "Track how your scores improve over time and see which skills need the most practice.", target: "trend-skills" },
  { title: "Quick Actions", desc: "Press N to start a new session, ⌘K to open the command palette, or / to search your sessions.", target: "header-actions" },
];

function OnboardingTour({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const current = tourSteps[step];
  const isLast = step === tourSteps.length - 1;
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, backdropFilter: "blur(2px)" }} onClick={onComplete} />
      <div role="dialog" aria-modal="true" aria-label="Dashboard tour" style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: "100%", maxWidth: 400, background: c.graphite, border: `1px solid ${c.borderHover}`,
        borderRadius: 16, padding: "32px 28px 24px", zIndex: 301,
        boxShadow: "0 16px 64px rgba(0,0,0,0.5)", textAlign: "center",
      }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 20 }}>
          {tourSteps.map((_, i) => (
            <div key={i} style={{ width: i === step ? 20 : 6, height: 6, borderRadius: 3, background: i === step ? c.gilt : "rgba(240,237,232,0.1)", transition: "all 0.3s ease" }} />
          ))}
        </div>
        <div style={{ width: 48, height: 48, borderRadius: 12, margin: "0 auto 16px", background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.15)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {step === 0 && <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}
          {step === 1 && <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
          {step === 2 && <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>}
        </div>
        <h3 style={{ fontFamily: font.ui, fontSize: 17, fontWeight: 600, color: c.ivory, marginBottom: 8 }}>{current.title}</h3>
        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6, marginBottom: 24, maxWidth: 320, margin: "0 auto 24px" }}>{current.desc}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.stone, background: "none", border: `1px solid ${c.border}`, borderRadius: 8, padding: "9px 20px", cursor: "pointer", transition: "color 0.2s" }}
              onMouseEnter={(e) => e.currentTarget.style.color = c.ivory}
              onMouseLeave={(e) => e.currentTarget.style.color = c.stone}>
              Back
            </button>
          )}
          <button onClick={() => isLast ? onComplete() : setStep(s => s + 1)}
            style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.obsidian, background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, border: "none", borderRadius: 8, padding: "9px 24px", cursor: "pointer", transition: "opacity 0.2s" }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
            onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}>
            {isLast ? "Get Started" : "Next"}
          </button>
        </div>
        <button onClick={onComplete}
          style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, background: "none", border: "none", cursor: "pointer", marginTop: 14, padding: "4px 0", transition: "color 0.2s" }}
          onMouseEnter={(e) => e.currentTarget.style.color = c.ivory}
          onMouseLeave={(e) => e.currentTarget.style.color = c.stone}>
          Skip tour
        </button>
      </div>
    </>
  );
}

/* ─── Relative time formatter ─── */
function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ─── Animated counter for stats ─── */
function CountUp({ value, suffix = "" }: { value: string; suffix?: string }) {
  const num = parseInt(value, 10);
  const [display, setDisplay] = useState(0);
  const isNum = !isNaN(num) && num > 0;
  useEffect(() => {
    if (!isNum) return;
    let start = 0;
    const duration = 600;
    const step = Math.ceil(num / (duration / 16));
    const id = setInterval(() => {
      start = Math.min(start + step, num);
      setDisplay(start);
      if (start >= num) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [num, isNum]);
  if (!isNum) return <>{value}</>;
  return <>{display}{suffix}</>;
}

/* ─── Focus-visible + reduced-motion styles ─── */
const dashboardStyles = `
  .dash-focus:focus-visible {
    outline: 2px solid rgba(201,169,110,0.5) !important;
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .dash-card, .dash-card * { transition: none !important; animation: none !important; }
  }
  @keyframes slideDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
`;

export default function DashboardHome() {
  const nav = useNavigate();
  const { user } = useAuth();
  const {
    dataLoading, isMobile, isNewUser, displayName,
    persisted, updatePersisted,
    recentSessions, scoreTrend, skills, overallStats, hasData,
    weekActivity, currentStreak, readinessScore, daysLeft, calendarEvents,
    isFree, atSessionLimit, sessionsRemaining,
    notifications, aiInsights, upcomingGoals, returnContext, smartSchedule, prepPlan,
    badges, dailyChallenge, practiceReminder,
    handleStartSession, handleExport, handleDownload, handleExportPDF,
    setShowUpgradeModal,
  } = useDashboard();

  useDocTitle("Dashboard");
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [feedbackSession, setFeedbackSession] = useState<string | null>(null);
  const [viewingSession, setViewingSession] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("All");
  const [sortBy, setSortBy] = useState<"date" | "score">("date");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<"all" | "week" | "month">("all");
  const [prepPlanOpen, setPrepPlanOpen] = useState(() => prepPlan ? prepPlan.some(s => !s.done) : true);
  const [rightTab, setRightTab] = useState<"insights" | "goals">("insights");
  const [shareTooltip, setShareTooltip] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sessionsToShow, setSessionsToShow] = useState(5);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (val: string) => {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 250);
  };

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // Close header menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) setHeaderMenuOpen(false);
    };
    if (headerMenuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [headerMenuOpen]);

  // Keyboard shortcuts: N = new session, / = focus search
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "n" || e.key === "N") { e.preventDefault(); handleStartSession(); }
      if (e.key === "/") { e.preventDefault(); searchInputRef.current?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleStartSession]);

  // useMemo must be called before any early returns to satisfy Rules of Hooks
  const filteredSessions = useMemo(() => recentSessions
    .filter(s => filterType === "All" || s.type === filterType)
    .filter(s => {
      if (!debouncedSearch) return true;
      const q = debouncedSearch.toLowerCase();
      return (s.type || "").toLowerCase().includes(q) || (s.topStrength || "").toLowerCase().includes(q) || (s.topWeakness || "").toLowerCase().includes(q) || (s.feedback || "").toLowerCase().includes(q);
    })
    .filter(s => {
      if (dateRange === "all") return true;
      const sessionDate = new Date(s.date);
      const now = new Date();
      if (dateRange === "week") return sessionDate >= new Date(now.getTime() - 7 * 86400000);
      return sessionDate >= new Date(now.getTime() - 30 * 86400000);
    })
    .sort((a, b) => sortBy === "score" ? b.score - a.score : new Date(b.date).getTime() - new Date(a.date).getTime()), [recentSessions, filterType, debouncedSearch, dateRange, sortBy]);

  if (dataLoading) return <DataLoadingSkeleton />;

  const detailSession = viewingSession ? recentSessions.find(s => s.id === viewingSession) : null;
  if (detailSession) return <SessionDetailView session={detailSession} onBack={() => setViewingSession(null)} />;

  if (isNewUser) {
    return (
      <EmptyState
        onStart={() => { updatePersisted({ hasCompletedFirstSession: true }); handleStartSession(); }}
        userName={displayName}
        targetRole={user?.targetRole || persisted.targetRole}
        isMobile={isMobile}
      />
    );
  }

  const weakestSkill = skills.length > 0 ? [...skills].sort((a, b) => a.score - b.score)[0] : null;
  const activeNotifs = notifications.filter(n => !persisted.dismissedNotifs.includes(n.id));
  const latestBadge = badges.filter(b => b.earned).slice(-1)[0] || null;

  return (
    <div style={{ margin: "0 auto", lineHeight: 1.5 }} className="dash-card">
      <style>{dashboardStyles}</style>
      {/* ─── Onboarding Tour ─── */}
      {hasData && !persisted.tourCompleted && (
        <OnboardingTour onComplete={() => updatePersisted({ tourCompleted: true })} />
      )}
      {/* ─── Header ─── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: sp["3xl"], flexWrap: "wrap", gap: sp.lg }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ fontFamily: font.display, fontSize: isMobile ? 26 : 32, fontWeight: 400, color: c.ivory, marginBottom: 0, letterSpacing: "-0.01em" }}>
              {getPersonalizedGreeting(displayName.split(" ")[0], currentStreak, recentSessions.length)}
            </h1>
            {latestBadge && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: radius.pill, background: "rgba(201,169,110,0.06)", border: "1px solid rgba(201,169,110,0.15)" }} title={latestBadge.description}>
                <span style={{ display: "flex", transform: "scale(0.65)", transformOrigin: "center" }}>{(badgeIcons[latestBadge.icon] || badgeIcons.star)(c.gilt)}</span>
                <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.gilt }}>{latestBadge.label}</span>
              </div>
            )}
          </div>
          {returnContext && <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.5, marginBottom: 2, marginTop: 6 }}>{returnContext}</p>}
          {smartSchedule && <p style={{ fontFamily: font.ui, fontSize: 13, color: c.gilt, fontStyle: "italic" }}>{smartSchedule}</p>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="shimmer-btn dash-focus" onClick={handleStartSession} title="New Session (N)" style={{
            fontFamily: font.ui, fontSize: 13, fontWeight: 600, padding: "9px 20px", borderRadius: radius.md,
            border: "none", background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
            color: c.obsidian, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
          }}>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Session
          </button>
          <div ref={headerMenuRef} style={{ position: "relative" }}>
            <button onClick={() => setHeaderMenuOpen(!headerMenuOpen)} title="More actions (press ? for shortcuts)" style={utilBtn} onMouseEnter={utilBtnEnter} onMouseLeave={utilBtnLeave} aria-expanded={headerMenuOpen} aria-label="More actions">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
            </button>
            {headerMenuOpen && (
              <div role="menu" aria-label="Dashboard actions" onKeyDown={(e) => {
                if (e.key === "Escape") { setHeaderMenuOpen(false); return; }
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const items = e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]');
                  const idx = Array.from(items).indexOf(document.activeElement as HTMLElement);
                  const next = e.key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
                  items[next]?.focus();
                }
              }} style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 200, background: c.graphite, border: `1px solid ${c.borderHover}`, borderRadius: radius.md, padding: "6px 0", zIndex: 50, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
                {[
                  { label: "Share Progress", icon: <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>, action: () => { handleExport(); setShareTooltip(true); setTimeout(() => setShareTooltip(false), 2000); } },
                  { label: "Export as JSON", icon: <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>, action: handleDownload },
                  { label: "Export as PDF", icon: <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>, action: handleExportPDF },
                  { label: "Set Interview Date", icon: <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, action: () => nav("/settings") },
                  { label: "View Full Report", icon: <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>, action: () => nav("/analytics") },
                ].map((item) => (
                  <button key={item.label} role="menuitem" onClick={() => { item.action(); setHeaderMenuOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", fontFamily: font.ui, fontSize: 13, color: c.chalk, background: "transparent", border: "none", cursor: "pointer", transition: "background 0.15s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(240,237,232,0.04)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <span style={{ opacity: 0.6 }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
                <div style={{ height: 1, background: c.border, margin: "4px 0" }} />
                <div style={{ padding: "8px 16px" }}>
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>N new session · / search · ? shortcuts</span>
                </div>
              </div>
            )}
            {shareTooltip && <div role="status" aria-live="polite" style={{ position: "absolute", top: -32, left: "50%", transform: "translateX(-50%)", background: c.sage, color: c.obsidian, fontFamily: font.ui, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 4, whiteSpace: "nowrap", animation: "fadeIn 0.2s ease" }}>Copied to clipboard!</div>}
          </div>
        </div>
      </div>

      {/* ─── Notifications ─── */}
      {activeNotifs.length > 0 && (
        <div role="region" aria-label="Notifications" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: sp.xl }}>
          {activeNotifs.map((notif) => (
            <div key={notif.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderRadius: radius.md, background: notif.type === "streak" ? "rgba(196,112,90,0.04)" : "rgba(122,158,126,0.04)", borderLeft: `3px solid ${notif.type === "streak" ? c.ember : c.sage}`, boxShadow: "0 1px 3px rgba(0,0,0,0.12)", transition: "background 0.2s ease" }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={notif.type === "streak" ? c.ember : c.sage} strokeWidth="2" strokeLinecap="round">
                {notif.type === "streak" ? <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></> : <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}
              </svg>
              <span style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, flex: 1, lineHeight: 1.5 }}>{notif.text}</span>
              {notif.action && (
                <button onClick={() => {
                  if (notif.action === "View Report") nav("/analytics");
                  else if (notif.action === "Quick Practice" || notif.action === "Practice Now") handleStartSession();
                  else if (notif.action === "Renew") nav("/#pricing");
                }} style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.sage, background: "rgba(122,158,126,0.08)", border: `1px solid rgba(122,158,126,0.2)`, borderRadius: 6, padding: "6px 14px", cursor: "pointer", whiteSpace: "nowrap" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(122,158,126,0.15)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(122,158,126,0.08)"; }}
                >{notif.action}</button>
              )}
              {notif.dismissible && (
                <button onClick={() => updatePersisted({ dismissedNotifs: [...persisted.dismissedNotifs, notif.id] })} aria-label="Dismiss" style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 4, flexShrink: 0 }}>
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── Practice Reminder ─── */}
      {practiceReminder && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderRadius: radius.md, background: "rgba(201,169,110,0.03)", borderLeft: `3px solid ${c.gilt}`, marginBottom: sp.xl }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, flex: 1, lineHeight: 1.5 }}>{practiceReminder}</span>
          <button onClick={handleStartSession} style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.gilt, background: "rgba(201,169,110,0.08)", border: `1px solid rgba(201,169,110,0.2)`, borderRadius: 6, padding: "6px 14px", cursor: "pointer", whiteSpace: "nowrap" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.15)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.08)"; }}
          >Practice Now</button>
        </div>
      )}

      {/* ─── Daily Challenge (compact banner) ─── */}
      {dailyChallenge && !dailyChallenge.completed && (
        <div role="button" tabIndex={0} aria-label={`Daily Challenge: ${dailyChallenge.label}`}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); nav(`/session/new?type=${dailyChallenge.type}${dailyChallenge.focus ? `&focus=${dailyChallenge.focus}` : ""}`); } }}
          style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderRadius: radius.md, background: "rgba(201,169,110,0.03)", border: "1px solid rgba(201,169,110,0.08)", marginBottom: sp.xl, cursor: "pointer", transition: "all 0.2s ease" }}
          onClick={() => nav(`/session/new?type=${dailyChallenge.type}${dailyChallenge.focus ? `&focus=${dailyChallenge.focus}` : ""}`)}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.06)"; e.currentTarget.style.borderColor = "rgba(201,169,110,0.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.03)"; e.currentTarget.style.borderColor = "rgba(201,169,110,0.08)"; }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
          <div style={{ flex: 1 }}>
            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Daily Challenge: {dailyChallenge.label}</span>
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginLeft: 8 }}>{dailyChallenge.description}</span>
          </div>
          <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: radius.pill, background: dailyChallenge.difficulty === "hard" ? "rgba(196,112,90,0.08)" : "rgba(201,169,110,0.08)", color: dailyChallenge.difficulty === "hard" ? c.ember : c.gilt, textTransform: "uppercase" as const, flexShrink: 0 }}>{dailyChallenge.difficulty}</span>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      )}

      {/* ─── Prep Plan Timeline ─── */}
      {prepPlan && (
        <div style={{ ...card, padding: "24px 28px", marginBottom: sp["2xl"] }} className="gradient-border-card">
          <button className="dash-focus" onClick={() => setPrepPlanOpen(!prepPlanOpen)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }} aria-expanded={prepPlanOpen} aria-label="Toggle Interview Prep Plan">
            {sectionTitle("Interview Prep Plan", 17)}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: font.mono, fontSize: 12, color: c.gilt }}>{prepPlan.filter(s => s.done).length}/{prepPlan.length} complete</span>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round" style={{ transition: "transform 0.2s ease", transform: prepPlanOpen ? "rotate(180deg)" : "rotate(0deg)" }}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </button>
          {prepPlanOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 16 }}>
              {prepPlan.map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, position: "relative" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: step.done ? c.sage : c.obsidian, border: `2px solid ${step.done ? c.sage : "rgba(240,237,232,0.1)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {step.done && <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.obsidian} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    {i < prepPlan.length - 1 && <div style={{ width: 2, height: 24, background: step.done ? c.sage : "rgba(240,237,232,0.06)", opacity: 0.4 }} />}
                  </div>
                  <span style={{ fontFamily: font.ui, fontSize: 13, color: step.done ? c.stone : c.chalk, paddingTop: 2, textDecoration: step.done ? "line-through" : "none", opacity: step.done ? 0.6 : 1 }}>{step.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Hero CTA ─── */}
      <div style={{
        ...card, padding: isMobile ? "24px" : "28px 32px", marginBottom: sp["2xl"], overflow: "hidden",
      }} className="gradient-border-card">
        <div style={{ position: "absolute", top: "-30%", right: "-5%", width: "45%", height: "160%", background: "radial-gradient(ellipse at center, rgba(201,169,110,0.06) 0%, rgba(201,169,110,0.02) 45%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: isMobile ? 16 : 24, position: "relative" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: radius.pill, background: "rgba(122,158,126,0.06)", border: "1px solid rgba(122,158,126,0.18)", marginBottom: 14 }}>
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 600, color: c.sage }}>
                {daysLeft > 0 && persisted.interviewDate ? `${daysLeft} days until interview` : "Set your interview date"}
              </span>
            </div>
            <h2 style={{ fontFamily: font.ui, fontSize: isMobile ? 18 : 20, fontWeight: 700, color: c.ivory, marginBottom: 8, letterSpacing: "-0.01em" }}>
              {hasData ? `Ready for session #${overallStats.sessionsCompleted + 1}?` : "Start practicing to ace your next interview"}
            </h2>
            <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6, maxWidth: 560 }}>
              {weakestSkill ? (
                <>Your <strong style={{ color: c.ivory, fontWeight: 700 }}>{weakestSkill.name}</strong> score is {weakestSkill.score}{user?.targetCompany ? ` — ${user.targetCompany} interviews test this heavily` : ""}. Try a focused session to boost it.</>
              ) : (
                <>Each session is tailored to your target role{user?.targetCompany ? ` at ${user.targetCompany}` : ""}. Complete your first session to get personalized insights.</>
              )}
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14 }}>
            <button className="shimmer-btn dash-focus" onClick={handleStartSession} title="Start Session (N)" style={{
              fontFamily: font.ui, fontSize: 15, fontWeight: 600, padding: "12px 30px", borderRadius: radius.md,
              border: "none", background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
              color: c.obsidian, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
              boxShadow: "0 2px 12px rgba(201,169,110,0.2)",
              transition: "all 0.3s cubic-bezier(0.16,1,0.3,1)",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(201,169,110,0.3)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 12px rgba(201,169,110,0.2)"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="5,3 19,12 5,21" /></svg>
              {atSessionLimit ? "Upgrade to Continue" : "Start Session"}
            </button>
            {/* ─── Streak widget ─── */}
            <div className="streak-widget" style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
              <div className="streak-label" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: `${radius.pill}px 0 0 ${radius.pill}px`, background: "rgba(201,169,110,0.06)", border: "1px solid rgba(201,169,110,0.12)", borderRight: "none", whiteSpace: "nowrap" }}>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.gilt }}>{currentStreak > 0 ? `${currentStreak}-day streak` : "Start a streak"}</span>
              </div>
              <div className="streak-dots" style={{ display: "flex", alignItems: "center", gap: 2, padding: "0 4px", border: "1px solid rgba(240,237,232,0.08)", borderRadius: `0 ${radius.pill}px ${radius.pill}px 0`, height: 28 }}>
                {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => {
                  const today = new Date();
                  const todayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1;
                  const isToday = i === todayIdx;
                  const isFutureDay = i > todayIdx;
                  const practiced = weekActivity[i];
                  return (
                    <div key={`day-${i}`} title={`${day}: ${isFutureDay ? "Upcoming" : practiced ? "Practiced" : "Missed"}`} style={{
                      width: 24, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                      borderRadius: 4,
                      background: practiced ? "rgba(201,169,110,0.18)" : "transparent",
                      border: practiced ? "1px solid rgba(201,169,110,0.25)" : "1px solid transparent",
                      fontSize: 10, fontFamily: font.mono, fontWeight: 600,
                      color: practiced ? c.gilt : isToday ? c.ivory : c.stone,
                    }}>{day}</div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Stats Grid (all 5 in one row) ─── */}
      <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)", gap: sp.lg, marginBottom: sp["3xl"] }}>
        {[
          { label: "Readiness", value: hasData ? (readinessScore > 0 ? readinessScore.toString() : "\u2014") : "\u2014", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, sub: !hasData ? "Complete a session" : readinessScore > 0 ? scoreLabel(readinessScore) : "Need more sessions", subColor: !hasData ? c.stone : readinessScore > 0 ? scoreLabelColor(readinessScore) : c.stone, tip: "Composite score based on your last 5 sessions, weighted by recency" },
          { label: "Sessions", value: overallStats.sessionsCompleted.toString(), icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>, sub: hasData ? `${weekActivity.filter(Boolean).length} this week` : "Get started", subColor: c.stone, tip: "Total practice sessions completed across all interview types" },
          { label: "Avg Score", value: hasData ? overallStats.avgScore.toString() : "\u2014", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, sub: hasData ? `+${overallStats.improvement} pts` : "No data yet", subColor: hasData ? c.sage : c.stone, tip: "Average score across all sessions — higher means more consistent performance" },
          { label: "Improvement", value: hasData ? `+${overallStats.improvement}%` : "\u2014", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>, sub: hasData ? "All skills" : "Practice to improve", subColor: c.stone, tip: "Score improvement from your first session to your most recent" },
          { label: "Time Logged", value: hasData ? `${overallStats.hoursLogged}h` : "0h", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, sub: "Total", subColor: c.stone, tip: "Total hours spent in practice sessions" },
        ].map((stat, i) => (
          <div key={i} title={stat.tip} style={{ ...card, padding: "24px", cursor: "default" }} className="gradient-border-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.stone, letterSpacing: "0.04em", textTransform: "uppercase" as const }}>{stat.label}</span>
              <div style={{ opacity: 0.7 }}>{stat.icon}</div>
            </div>
            <span style={{ fontFamily: font.mono, fontSize: 30, fontWeight: 600, color: c.ivory, display: "block", marginBottom: 4, letterSpacing: "-0.03em" }}>
              <CountUp value={stat.value.replace(/[^0-9]/g, "")} suffix={stat.value.replace(/[0-9]/g, "")} />
            </span>
            <span style={{ fontFamily: font.ui, fontSize: 12, color: stat.subColor, fontWeight: stat.subColor !== c.stone ? 600 : 400 }}>{stat.sub}</span>
          </div>
        ))}
      </div>

      {/* ─── Upcoming Interviews ─── */}
      {(() => {
        const upcomingEvents = calendarEvents
          .filter(e => e.status === "upcoming" && daysUntilEvent(e.date, e.time) >= 0)
          .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime())
          .slice(0, 3);
        if (upcomingEvents.length === 0) return null;
        return (
          <div style={{ ...card, padding: "24px 28px", marginBottom: sp["3xl"] }} className="gradient-border-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              {sectionTitle("Upcoming Interviews", 18)}
              <button onClick={() => nav("/calendar")} style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.gilt, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>View all</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${Math.min(upcomingEvents.length, 3)}, 1fr)`, gap: 12 }}>
              {upcomingEvents.map(ev => {
                const days = daysUntilEvent(ev.date, ev.time);
                const urgent = days <= 3;
                const isToday = days === 0;
                return (
                  <div key={ev.id} role="button" tabIndex={0} aria-label={`${ev.company} interview — ${isToday ? "Today" : `${days} days away`}`}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); nav("/calendar"); } }}
                    style={{ padding: "16px 20px", borderRadius: radius.md, background: c.obsidian, borderLeft: `3px solid ${isToday ? c.ember : urgent ? c.gilt : c.sage}`, cursor: "pointer", transition: "background 0.2s ease" }} onClick={() => nav("/calendar")}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(240,237,232,0.02)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = c.obsidian}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>{ev.company}</span>
                      <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: radius.pill, background: isToday ? "rgba(196,112,90,0.1)" : urgent ? "rgba(201,169,110,0.08)" : "rgba(122,158,126,0.06)", color: isToday ? c.ember : urgent ? c.gilt : c.sage }}>
                        {isToday ? "TODAY" : days === 1 ? "TOMORROW" : `${days}d`}
                      </span>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>{ev.type} · {formatEventDate(ev.date)} · {formatEventTime(ev.time)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ─── Row 1: Score Trend | Skill Breakdown ─── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: sp["2xl"], marginBottom: sp["2xl"] }}>
        {/* Score Trend */}
        <div style={{ ...card, padding: "28px 32px" }} className="gradient-border-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              {sectionTitle("Score Trend")}
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginTop: 4 }}>{scoreTrend.length > 0 ? "Hover for details" : "Complete sessions to see your progress"}</p>
            </div>
          </div>
          {scoreTrend.length >= 2 ? (
            <>
              <ScoreTrendChart data={scoreTrend} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, padding: "0 24px" }}>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: c.stone }}>{scoreTrend[0].date}</span>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: c.stone }}>{scoreTrend[scoreTrend.length - 1].date}</span>
              </div>
            </>
          ) : (
            <div style={{ position: "relative", padding: "12px 0" }}>
              {/* Sample chart preview */}
              <svg width="100%" height="120" viewBox="0 0 400 120" preserveAspectRatio="none" style={{ opacity: 0.15 }}>
                <polyline points="0,100 60,85 120,90 180,70 240,55 300,40 360,35 400,20" fill="none" stroke={c.gilt} strokeWidth="2"/>
                <polygon points="0,120 0,100 60,85 120,90 180,70 240,55 300,40 360,35 400,20 400,120" fill="url(#sampleGrad)" opacity="0.3"/>
                <defs><linearGradient id="sampleGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.gilt}/><stop offset="100%" stopColor="transparent"/></linearGradient></defs>
              </svg>
              {/* Frosted overlay */}
              <div style={{ position: "absolute", inset: 0, background: "rgba(22,22,24,0.75)", backdropFilter: "blur(4px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: radius.md }}>
                <p style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, marginBottom: 12 }}>Complete your first session to see your trend</p>
                <button onClick={handleStartSession} style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.obsidian, background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, border: "none", borderRadius: radius.sm, padding: "8px 20px", cursor: "pointer", transition: "all 0.2s ease" }}>Start a Session</button>
              </div>
            </div>
          )}
        </div>

        {/* Skill Radar */}
        <div style={{ ...card, padding: "28px" }} className="gradient-border-card">
          {sectionTitle("Skill Breakdown")}
          {skills.length > 0 ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 2, background: c.gilt, borderRadius: 1 }} /><span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Current</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 2, background: c.stone, borderRadius: 1, opacity: 0.5 }} /><span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>First session</span></div>
              </div>
              <SkillRadar skills={skills} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                {skills.map((sk) => (
                  <div key={sk.name} role="button" tabIndex={0} aria-label={`Practice ${sk.name} — score ${sk.score}`}
                    onClick={() => nav(`/session/new?type=behavioral&focus=${sk.name.toLowerCase().replace(/\s+/g, "-")}`)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); nav(`/session/new?type=behavioral&focus=${sk.name.toLowerCase().replace(/\s+/g, "-")}`); } }}
                    style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 8px", margin: "-6px -8px", borderRadius: radius.sm, transition: "background 0.15s ease" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(240,237,232,0.03)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, flex: 1 }}>{sk.name}</span>
                    <div style={{ width: 60, height: 3, background: "rgba(240,237,232,0.06)", borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", width: `${sk.score}%`, background: sk.color, borderRadius: 2, transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)" }} /></div>
                    <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 600, color: c.ivory, width: 24, textAlign: "right" }}>{sk.score}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 11, color: c.sage, width: 30, textAlign: "right" }}>+{sk.score - sk.prev}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ position: "relative", padding: "16px 0" }}>
              {/* Sample skill bars preview */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: 0.15, padding: "0 4px" }}>
                {["Communication", "Leadership", "Problem Solving", "Teamwork", "Adaptability"].map((skill, i) => (
                  <div key={skill} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, width: 100 }}>{skill}</span>
                    <div style={{ flex: 1, height: 3, background: "rgba(240,237,232,0.06)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${75 - i * 8}%`, background: c.gilt, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontFamily: font.mono, fontSize: 11, color: c.ivory, width: 22, textAlign: "right" }}>{75 - i * 8}</span>
                  </div>
                ))}
              </div>
              <div style={{ position: "absolute", inset: 0, background: "rgba(22,22,24,0.75)", backdropFilter: "blur(4px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: radius.md }}>
                <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.5, textAlign: "center", maxWidth: 220, marginBottom: 10 }}>Complete a session to unlock your skill breakdown</p>
                <button onClick={handleStartSession} style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.obsidian, background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, border: "none", borderRadius: radius.sm, padding: "7px 16px", cursor: "pointer" }}>Get Started</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Row 2: Recent Sessions | AI Insights (side by side) ─── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "3fr 2fr", gap: sp["2xl"], marginBottom: sp["2xl"] }}>
      <div style={{ ...card, padding: "28px 32px" }} className="gradient-border-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          {sectionTitle("Recent Sessions")}
          <button aria-label={`Sort sessions by ${sortBy === "date" ? "score" : "date"}`} onClick={() => setSortBy(sortBy === "date" ? "score" : "date")}
            style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, background: "rgba(240,237,232,0.03)", border: "none", borderRadius: radius.sm, padding: "6px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, transition: "color 0.2s" }}
            onMouseEnter={(e) => e.currentTarget.style.color = c.ivory}
            onMouseLeave={(e) => e.currentTarget.style.color = c.stone}>
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {sortBy === "date" ? <><polyline points="3 6 9 6"/><polyline points="3 12 15 12"/><polyline points="3 18 21 18"/></> : <><polyline points="3 6 21 6"/><polyline points="3 12 15 12"/><polyline points="3 18 9 18"/></>}
            </svg>
            {sortBy === "date" ? "By date" : "By score"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160, position: "relative" }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input ref={searchInputRef} type="text" placeholder="Search sessions... (press /)" aria-label="Search sessions" value={searchQuery} onChange={(e) => handleSearch(e.target.value)}
              style={{ width: "100%", padding: "9px 10px 9px 32px", fontFamily: font.ui, fontSize: 13, color: c.ivory, background: c.obsidian, border: `1px solid rgba(240,237,232,0.06)`, borderRadius: radius.sm, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
              onFocus={(e) => e.currentTarget.style.borderColor = "rgba(201,169,110,0.3)"}
              onBlur={(e) => e.currentTarget.style.borderColor = "rgba(240,237,232,0.06)"}
            />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["all", "month", "week"] as const).map((range) => (
              <button key={range} aria-pressed={dateRange === range} onClick={() => setDateRange(range)}
                style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, padding: "6px 12px", borderRadius: radius.sm, cursor: "pointer", background: dateRange === range ? "rgba(201,169,110,0.08)" : "transparent", border: "none", color: dateRange === range ? c.gilt : c.stone, transition: "all 0.2s ease" }}
                onMouseEnter={(e) => { if (dateRange !== range) e.currentTarget.style.color = c.ivory; }}
                onMouseLeave={(e) => { if (dateRange !== range) e.currentTarget.style.color = c.stone; }}>
                {range === "all" ? "All time" : range === "month" ? "30 days" : "7 days"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
          {sessionTypes.map((type) => (
            <button key={type} aria-pressed={filterType === type} onClick={() => setFilterType(type)}
              style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, padding: "6px 14px", borderRadius: radius.pill, cursor: "pointer", background: filterType === type ? "rgba(201,169,110,0.08)" : "transparent", border: "none", color: filterType === type ? c.gilt : c.stone, transition: "all 0.2s ease" }}
              onMouseEnter={(e) => { if (filterType !== type) e.currentTarget.style.color = c.chalk; }}
              onMouseLeave={(e) => { if (filterType !== type) e.currentTarget.style.color = c.stone; }}>
              {type}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredSessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <svg aria-hidden="true" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1" strokeLinecap="round" style={{ opacity: 0.4, marginBottom: 16 }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
              <p style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 500, color: c.chalk, marginBottom: 6 }}>
                {searchQuery ? `No results for "${searchQuery}"` : "No sessions match this filter"}
              </p>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>
                {searchQuery ? "Try a different search term or clear filters" : "Adjust your filters or date range"}
              </p>
              {(searchQuery || filterType !== "All" || dateRange !== "all") && (
                <button onClick={() => { setSearchQuery(""); setDebouncedSearch(""); setFilterType("All"); setDateRange("all"); }}
                  style={{ marginTop: 14, fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.gilt, background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.15)`, borderRadius: radius.sm, padding: "8px 18px", cursor: "pointer", transition: "background 0.2s" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(201,169,110,0.12)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(201,169,110,0.06)"}>
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            filteredSessions.slice(0, sessionsToShow).map((session) => (
              <div key={session.id}>
                <button className="dash-focus" onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)} aria-expanded={expandedSession === session.id}
                  style={{ width: "100%", padding: "16px 18px", borderRadius: radius.md, background: expandedSession === session.id ? "rgba(201,169,110,0.03)" : c.obsidian, border: "none", boxShadow: expandedSession === session.id ? "0 0 0 1px rgba(201,169,110,0.1)" : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 16, transition: "all 0.25s cubic-bezier(0.16,1,0.3,1)", textAlign: "left" }}
                  onMouseEnter={(e) => { if (expandedSession !== session.id) e.currentTarget.style.background = "rgba(240,237,232,0.02)"; }}
                  onMouseLeave={(e) => { if (expandedSession !== session.id) e.currentTarget.style.background = c.obsidian; }}>
                  <div style={{ width: 48, height: 48, flexShrink: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="48" height="48" viewBox="0 0 48 48" style={{ position: "absolute", transform: "rotate(-90deg)" }}>
                      <circle cx="24" cy="24" r="21" fill="none" stroke="rgba(240,237,232,0.06)" strokeWidth="2.5" />
                      <circle cx="24" cy="24" r="21" fill="none" stroke={scoreLabelColor(session.score)} strokeWidth="2.5"
                        strokeDasharray={`${(session.score / 100) * 2 * Math.PI * 21} ${2 * Math.PI * 21}`}
                        strokeLinecap="round" className="score-ring" />
                    </svg>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span style={{ fontFamily: font.mono, fontSize: 15, fontWeight: 600, color: c.ivory, lineHeight: 1 }}>{session.score}</span>
                      <span style={{ fontFamily: font.ui, fontSize: 8, color: scoreLabelColor(session.score), fontWeight: 600, lineHeight: 1, marginTop: 1 }}>{scoreLabel(session.score)}</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>{session.type}</span>
                      <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 600, color: session.change > 0 ? c.sage : c.ember }}>{session.change > 0 ? "+" : ""}{session.change}</span>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{session.role}</span>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }} title={session.dateLabel}>
                    <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, display: "block" }}>{relativeTime(session.date)}</span>
                    <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>{session.duration}</span>
                  </div>
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round" style={{ transform: expandedSession === session.id ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
                </button>

                {expandedSession === session.id && (
                  <div style={{ padding: "18px 22px", margin: "6px 0", background: c.obsidian, borderRadius: radius.md, animation: "slideDown 0.2s ease" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: feedbackSession === session.id ? 16 : 0 }}>
                      <div>
                        <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.sage, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Top Strength</span>
                        <span style={{ fontFamily: font.ui, fontSize: 14, color: c.ivory }}>{session.topStrength}</span>
                      </div>
                      <div>
                        <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.ember, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>To Improve</span>
                        <span style={{ fontFamily: font.ui, fontSize: 14, color: c.ivory }}>{session.topWeakness}</span>
                      </div>
                    </div>
                    {feedbackSession === session.id && (
                      <div style={{ padding: "16px 18px", borderRadius: radius.sm, background: "rgba(201,169,110,0.02)", borderLeft: `3px solid rgba(201,169,110,0.15)`, marginBottom: 14 }}>
                        <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>AI Feedback</span>
                        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, lineHeight: 1.7, margin: 0 }}>{session.feedback}</p>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => setFeedbackSession(feedbackSession === session.id ? null : session.id)}
                        style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.gilt, background: "rgba(201,169,110,0.06)", border: "none", borderRadius: radius.sm, padding: "8px 16px", cursor: "pointer", transition: "background 0.2s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.12)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.06)"; }}>
                        {feedbackSession === session.id ? "Hide Feedback" : "View Feedback"}
                      </button>
                      <button onClick={() => setViewingSession(session.id)}
                        style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory, background: "rgba(240,237,232,0.04)", border: "none", borderRadius: radius.sm, padding: "8px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "background 0.2s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(240,237,232,0.08)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(240,237,232,0.04)"; }}>
                        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                        Full Transcript
                      </button>
                      <button onClick={() => nav(`/session/new?type=${session.type.toLowerCase().replace(" ", "-")}`)}
                        style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.stone, background: "transparent", border: "none", borderRadius: radius.sm, padding: "8px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "color 0.2s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = c.ivory; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; }}>
                        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                        Redo {session.type}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          {filteredSessions.length > sessionsToShow && (
            <button onClick={() => setSessionsToShow(s => s + 5)}
              style={{ width: "100%", padding: "10px 0", marginTop: 8, fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.gilt, background: "rgba(201,169,110,0.04)", border: `1px solid rgba(201,169,110,0.1)`, borderRadius: radius.sm, cursor: "pointer", transition: "all 0.2s ease" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(201,169,110,0.08)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "rgba(201,169,110,0.04)"}>
              Show more ({filteredSessions.length - sessionsToShow} remaining)
            </button>
          )}
        </div>
      </div>

        {/* Tabbed Insights & Goals (in same grid row as Recent Sessions) */}
        <div style={{ ...card, overflow: "hidden" }} className="gradient-border-card">
          <div style={{ display: "flex", borderBottom: "1px solid rgba(240,237,232,0.04)" }}>
            {([["insights", "AI Insights"], ["goals", "Weekly Goals"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setRightTab(key)}
                style={{ flex: 1, padding: "16px 16px", fontFamily: font.ui, fontSize: 14, fontWeight: rightTab === key ? 600 : 400, color: rightTab === key ? c.ivory : c.stone, background: "transparent", border: "none", cursor: "pointer", borderBottom: rightTab === key ? `2px solid ${c.gilt}` : "2px solid transparent", transition: "all 0.2s ease", outline: "none" }}>
                {label}
                {key === "goals" && <span style={{ marginLeft: 6, fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.gilt, background: "rgba(201,169,110,0.08)", padding: "2px 7px", borderRadius: 4 }}>{upcomingGoals.filter(g => g.progress < g.total).length}</span>}
              </button>
            ))}
          </div>
          <div style={{ padding: "22px 28px" }}>
            {rightTab === "insights" ? (
              aiInsights.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>Complete more sessions to unlock AI insights.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {aiInsights.map((insight, i) => (
                    <div key={i} style={{ padding: "14px 16px", borderRadius: radius.sm, background: c.obsidian, borderLeft: `3px solid ${insight.type === "strength" ? c.sage : insight.type === "weakness" ? c.ember : c.gilt}` }}>
                      <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: insight.type === "strength" ? c.sage : insight.type === "weakness" ? c.ember : c.gilt, display: "block", marginBottom: 4 }}>
                        {insight.type === "strength" ? "Strength" : insight.type === "weakness" ? "Improve" : "Tip"}
                      </span>
                      <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.6 }}>{insight.text}</p>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {(() => {
                  const now = new Date();
                  const dayOfWeek = now.getDay();
                  const daysRemaining = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <span style={{ fontFamily: font.mono, fontSize: 11, color: daysRemaining <= 2 ? c.ember : c.stone }}>{daysRemaining === 0 ? "Resets today" : `${daysRemaining}d left this week`}</span>
                    </div>
                  );
                })()}
                {upcomingGoals.map((goal, i) => {
                  const done = goal.progress >= goal.total;
                  return (
                    <div key={i}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, display: "flex", alignItems: "center", gap: 6 }}>
                          {done && <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                          {goal.label}
                        </span>
                        <span style={{ fontFamily: font.mono, fontSize: 12, color: done ? c.sage : c.stone }}>{goal.progress}/{goal.total}</span>
                      </div>
                      <div style={{ height: 4, background: "rgba(240,237,232,0.06)", borderRadius: 2, overflow: "hidden", marginBottom: done ? 0 : 8 }}>
                        <div style={{ height: "100%", width: `${(goal.progress / goal.total) * 100}%`, background: done ? c.sage : c.gilt, borderRadius: 2, transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)" }} />
                      </div>
                      {!done && (
                        <button onClick={handleStartSession}
                          style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.gilt, background: "none", border: "none", cursor: "pointer", padding: 0, transition: "color 0.2s" }}
                          onMouseEnter={(e) => e.currentTarget.style.color = c.ivory}
                          onMouseLeave={(e) => e.currentTarget.style.color = c.gilt}>
                          Start a session →
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Achievements (full-width) ─── */}
      {badges.length > 0 && (
        <div style={{ ...card, padding: "24px 28px" }} className="gradient-border-card">
          {sectionTitle("Achievements")}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : `repeat(${Math.min(badges.length, 4)}, 1fr)`, gap: 12, marginTop: 16 }}>
            {badges.map((badge) => (
              <div key={badge.id} className={badge.earned ? "badge-earned" : ""} style={{ padding: "16px", borderRadius: radius.md, background: badge.earned ? "rgba(201,169,110,0.03)" : c.obsidian, textAlign: "center", opacity: badge.earned ? 1 : 0.45, transition: "all 0.3s ease", position: "relative", overflow: "hidden" }}
                onMouseEnter={(e) => { if (!badge.earned) e.currentTarget.style.opacity = "0.7"; if (badge.earned) e.currentTarget.style.boxShadow = "0 0 20px rgba(201,169,110,0.12)"; }}
                onMouseLeave={(e) => { if (!badge.earned) e.currentTarget.style.opacity = "0.45"; e.currentTarget.style.boxShadow = "none"; }}>
                {badge.earned && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 30%, rgba(201,169,110,0.08) 0%, transparent 60%)", pointerEvents: "none" }} />}
                <div style={{ marginBottom: 8, display: "flex", justifyContent: "center", position: "relative" }}>{(badgeIcons[badge.icon] || badgeIcons.star)(badge.earned ? c.gilt : c.stone)}</div>
                <p style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: badge.earned ? c.ivory : c.stone, marginBottom: 2 }}>{badge.label}</p>
                <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, lineHeight: 1.4, marginBottom: badge.earned ? 0 : 8 }}>{badge.description}</p>
                {!badge.earned && (
                  <div style={{ height: 3, background: "rgba(240,237,232,0.06)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, badge.progress)}%`, background: c.gilt, borderRadius: 2, transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)" }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
