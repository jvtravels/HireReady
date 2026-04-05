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

/* ─── Shared premium card style ─── */
const card = {
  background: c.graphite,
  borderRadius: radius.lg,
  border: "none",
  boxShadow: "0 1px 3px rgba(0,0,0,0.24), 0 0 0 1px rgba(240,237,232,0.04)",
  transition: "box-shadow 0.3s cubic-bezier(0.16,1,0.3,1), transform 0.3s cubic-bezier(0.16,1,0.3,1)",
} as const;

/* ─── Utility button style (hoisted for perf) ─── */
const utilBtn = {
  fontFamily: font.ui, fontSize: 11, fontWeight: 500 as const, color: c.stone,
  background: "transparent", border: `1px solid ${c.border}`, borderRadius: radius.sm,
  padding: "8px 14px", cursor: "pointer" as const, display: "flex" as const, alignItems: "center" as const,
  gap: 6, transition: "all 0.25s cubic-bezier(0.16,1,0.3,1)", outline: "none" as const,
};
const utilBtnEnter = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.borderColor = "rgba(201,169,110,0.3)"; e.currentTarget.style.color = c.ivory; };
const utilBtnLeave = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; };

/* ─── Section heading (serif) ─── */
const sectionTitle = (text: string, size = 16, tag: "h2" | "h3" = "h3") => {
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

/* ─── Card hover lift helper ─── */
const cardLift = {
  onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = "translateY(-2px)";
    e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.32), 0 0 0 1px rgba(201,169,110,0.06)";
  },
  onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = "translateY(0)";
    e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.24), 0 0 0 1px rgba(240,237,232,0.04)";
  },
};

/* ─── Focus-visible + reduced-motion styles ─── */
const dashboardStyles = `
  .dash-focus:focus-visible {
    outline: 2px solid rgba(201,169,110,0.5) !important;
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .dash-card, .dash-card * { transition: none !important; animation: none !important; }
  }
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

  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [feedbackSession, setFeedbackSession] = useState<string | null>(null);
  const [viewingSession, setViewingSession] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("All");
  const [sortBy, setSortBy] = useState<"date" | "score">("date");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<"all" | "week" | "month">("all");
  const [prepPlanOpen, setPrepPlanOpen] = useState(true);
  const [rightTab, setRightTab] = useState<"insights" | "goals">("insights");
  const [shareTooltip, setShareTooltip] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (val: string) => {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 250);
  };

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

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

  return (
    <div style={{ margin: "0 auto" }} className="dash-card">
      <style>{dashboardStyles}</style>
      {/* ─── Header ─── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: sp["3xl"], flexWrap: "wrap", gap: sp.lg }}>
        <div>
          <h1 style={{ fontFamily: font.display, fontSize: isMobile ? 26 : 32, fontWeight: 400, color: c.ivory, marginBottom: 6, letterSpacing: "-0.01em" }}>
            {getPersonalizedGreeting(displayName.split(" ")[0], currentStreak, recentSessions.length)}
          </h1>
          {returnContext && <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 2 }}>{returnContext}</p>}
          {smartSchedule && <p style={{ fontFamily: font.ui, fontSize: 12, color: c.gilt, fontStyle: "italic", opacity: 0.8 }}>{smartSchedule}</p>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <button onClick={() => { handleExport(); setShareTooltip(true); setTimeout(() => setShareTooltip(false), 2000); }} title="Copy progress report" style={utilBtn} onMouseEnter={utilBtnEnter} onMouseLeave={utilBtnLeave}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              Share
            </button>
            {shareTooltip && <div style={{ position: "absolute", top: -32, left: "50%", transform: "translateX(-50%)", background: c.sage, color: c.obsidian, fontFamily: font.ui, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 4, whiteSpace: "nowrap", animation: "fadeIn 0.2s ease" }}>Copied to clipboard!</div>}
          </div>
          <button onClick={handleDownload} title="Download progress report" style={utilBtn} onMouseEnter={utilBtnEnter} onMouseLeave={utilBtnLeave}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download
          </button>
          <button onClick={() => nav("/session/new?type=behavioral")} title="Quick Behavioral session" style={utilBtn} onMouseEnter={utilBtnEnter} onMouseLeave={utilBtnLeave}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Quick Behavioral
          </button>
          <button onClick={() => nav("/session/new?type=case-study")} title="Quick Case Study session" style={utilBtn} onMouseEnter={utilBtnEnter} onMouseLeave={utilBtnLeave}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            Quick Case Study
          </button>
        </div>
      </div>

      {/* ─── Notifications ─── */}
      {activeNotifs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: sp.xl }}>
          {activeNotifs.map((notif) => (
            <div key={notif.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderRadius: radius.md, background: notif.type === "streak" ? "rgba(196,112,90,0.04)" : "rgba(122,158,126,0.04)", borderLeft: `3px solid ${notif.type === "streak" ? c.ember : c.sage}`, boxShadow: "0 1px 3px rgba(0,0,0,0.12)", transition: "background 0.2s ease" }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={notif.type === "streak" ? c.ember : c.sage} strokeWidth="2" strokeLinecap="round">
                {notif.type === "streak" ? <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></> : <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}
              </svg>
              <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, flex: 1 }}>{notif.text}</span>
              {notif.action && (
                <button onClick={() => {
                  if (notif.action === "View Report") nav("/dashboard/analytics");
                  else if (notif.action === "Quick Practice" || notif.action === "Practice Now") handleStartSession();
                  else if (notif.action === "Renew") nav("/#pricing");
                }} style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.sage, background: "rgba(122,158,126,0.08)", border: `1px solid rgba(122,158,126,0.2)`, borderRadius: 6, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}
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
          <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, flex: 1 }}>{practiceReminder}</span>
          <button onClick={handleStartSession} style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt, background: "rgba(201,169,110,0.08)", border: `1px solid rgba(201,169,110,0.2)`, borderRadius: 6, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.15)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.08)"; }}
          >Practice Now</button>
        </div>
      )}

      {/* ─── Daily Challenge (full-width gradient banner) ─── */}
      {dailyChallenge && !dailyChallenge.completed && !persisted.dismissedNotifs.includes(`challenge-${dailyChallenge.id}`) && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
          padding: "12px 48px",
          margin: `0 -48px ${sp.xl}px`,
          background: "linear-gradient(90deg, rgba(184,146,62,0.18) 0%, rgba(201,169,110,0.10) 50%, rgba(184,146,62,0.18) 100%)",
          borderTop: "1px solid rgba(201,169,110,0.12)", borderBottom: "1px solid rgba(201,169,110,0.12)",
          position: "relative" as const,
        }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
          <span style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory }}>
            <strong>Daily Challenge:</strong> {dailyChallenge.label} — {dailyChallenge.description}
          </span>
          <button onClick={() => nav(`/session/new?type=${dailyChallenge.type}${dailyChallenge.focus ? `&focus=${dailyChallenge.focus}` : ""}`)}
            style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.ivory, background: "transparent", border: `1px solid rgba(240,237,232,0.25)`, borderRadius: radius.pill, padding: "5px 16px", cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5, transition: "all 0.2s ease", flexShrink: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(240,237,232,0.08)"; e.currentTarget.style.borderColor = "rgba(240,237,232,0.4)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(240,237,232,0.25)"; }}>
            Start Challenge
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button onClick={() => updatePersisted({ dismissedNotifs: [...persisted.dismissedNotifs, `challenge-${dailyChallenge.id}`] })} aria-label="Dismiss challenge"
            style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 4, display: "flex", alignItems: "center", transition: "color 0.2s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = c.ivory; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      {/* ─── Prep Plan Timeline ─── */}
      {prepPlan && (
        <div style={{ ...card, padding: "24px 28px", marginBottom: sp["2xl"] }} {...cardLift}>
          <button onClick={() => setPrepPlanOpen(!prepPlanOpen)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, outline: "none" }} aria-expanded={prepPlanOpen} aria-label="Toggle Interview Prep Plan">
            {sectionTitle("Interview Prep Plan", 15)}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.gilt }}>{prepPlan.filter(s => s.done).length}/{prepPlan.length} complete</span>
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
                  <span style={{ fontFamily: font.ui, fontSize: 12, color: step.done ? c.stone : c.chalk, paddingTop: 2, textDecoration: step.done ? "line-through" : "none", opacity: step.done ? 0.6 : 1 }}>{step.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Hero CTA ─── */}
      <div style={{
        ...card, background: c.graphite, padding: isMobile ? "24px" : "32px 36px", marginBottom: sp["2xl"],
        position: "relative" as const, overflow: "hidden" as const,
        border: "1px solid rgba(201,169,110,0.12)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.24), 0 0 0 1px rgba(201,169,110,0.06), 0 0 40px rgba(201,169,110,0.04)",
      }}>
        {/* Golden radial glow */}
        <div style={{ position: "absolute", top: "-40%", right: "-5%", width: "50%", height: "180%", background: "radial-gradient(ellipse at center, rgba(201,169,110,0.08) 0%, rgba(201,169,110,0.03) 40%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "1px", background: "linear-gradient(90deg, transparent, rgba(201,169,110,0.15) 30%, rgba(201,169,110,0.15) 70%, transparent)", pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: isMobile ? 16 : 24, position: "relative" as const }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            {daysLeft > 0 && persisted.interviewDate && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: radius.pill, background: daysLeft <= 7 ? "rgba(196,112,90,0.08)" : "rgba(122,158,126,0.06)", border: `1px solid ${daysLeft <= 7 ? "rgba(196,112,90,0.2)" : "rgba(122,158,126,0.18)"}`, marginBottom: 12 }}>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={daysLeft <= 7 ? c.ember : c.sage} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: daysLeft <= 7 ? c.ember : c.sage }}>{daysLeft} days until interview</span>
              </div>
            )}
            <h2 style={{ fontFamily: font.display, fontSize: isMobile ? 20 : 24, fontWeight: 400, color: c.ivory, marginBottom: 8, letterSpacing: "-0.01em" }}>
              {hasData ? `Ready for session #${overallStats.sessionsCompleted + 1}?` : "Start practicing to ace your next interview"}
            </h2>
            <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, lineHeight: 1.6, maxWidth: 480 }}>
              {weakestSkill ? (
                <>Your <strong style={{ color: c.chalk }}>{weakestSkill.name}</strong> score is {weakestSkill.score}{user?.targetCompany ? ` — ${user.targetCompany} interviews test this heavily` : ""}. Try a focused session to boost it.</>
              ) : (
                <>Each session is tailored to your target role{user?.targetCompany ? ` at ${user.targetCompany}` : ""}. Complete your first session to get personalized insights.</>
              )}
            </p>
            {hasData && overallStats.sessionsCompleted >= 2 && overallStats.improvement > 0 && (
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.sage, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                {readinessScore >= 85
                  ? "You're interview-ready! Keep practicing to stay sharp."
                  : (() => {
                      const ptsPerSession = overallStats.improvement / overallStats.sessionsCompleted;
                      const sessionsNeeded = Math.max(1, Math.ceil((85 - readinessScore) / Math.max(1, ptsPerSession)));
                      const roundedPts = Math.round(ptsPerSession);
                      return `At your current pace (+${isFinite(roundedPts) ? roundedPts : "?"}pts/session), you'll reach 85 in ~${isFinite(sessionsNeeded) ? sessionsNeeded : "?"} more sessions.`;
                    })()
                }
              </p>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
            <button className="shimmer-btn dash-focus" onClick={handleStartSession} style={{
              fontFamily: font.ui, fontSize: 14, fontWeight: 600, padding: "14px 32px", borderRadius: radius.md,
              border: "none", background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
              boxShadow: "0 4px 20px rgba(201,169,110,0.2)",
              transition: "all 0.3s cubic-bezier(0.16,1,0.3,1)",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 32px rgba(201,169,110,0.3)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(201,169,110,0.2)"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="5,3 19,12 5,21" /></svg>
              {atSessionLimit ? "Upgrade to Continue" : "Start Session"}
            </button>
            {/* ─── Streak widget (inline with CTA, matches reference) ─── */}
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: `${radius.pill}px 0 0 ${radius.pill}px`, background: "rgba(201,169,110,0.06)", border: "1px solid rgba(201,169,110,0.12)", borderRight: "none" }}>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.gilt }}>{currentStreak > 0 ? `${currentStreak}-day streak` : "Start a streak"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 0, border: "1px solid rgba(240,237,232,0.08)", borderRadius: `0 ${radius.pill}px ${radius.pill}px 0`, overflow: "hidden" }}>
                {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => {
                  const today = new Date();
                  const todayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1;
                  const isToday = i === todayIdx;
                  const isFutureDay = i > todayIdx;
                  const practiced = weekActivity[i];
                  return (
                    <div key={`day-${i}`} title={`${day}: ${isFutureDay ? "Upcoming" : practiced ? "Practiced" : "Missed"}`} style={{
                      width: 26, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                      background: practiced ? "rgba(201,169,110,0.1)" : "transparent",
                      borderRight: i < 6 ? "1px solid rgba(240,237,232,0.06)" : "none",
                      fontSize: 9, fontFamily: font.mono, fontWeight: 600,
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
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)", gap: sp.lg, marginBottom: sp["3xl"] }}>
        {[
          { label: "Readiness", value: hasData ? (readinessScore > 0 ? readinessScore.toString() : "\u2014") : "\u2014", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, sub: !hasData ? "Complete a session" : readinessScore > 0 ? scoreLabel(readinessScore) : "Need more sessions", subColor: !hasData ? c.stone : readinessScore > 0 ? scoreLabelColor(readinessScore) : c.stone },
          { label: "Sessions", value: overallStats.sessionsCompleted.toString(), icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>, sub: hasData ? `${weekActivity.filter(Boolean).length} this week` : "Get started", subColor: c.stone },
          { label: "Avg Score", value: hasData ? overallStats.avgScore.toString() : "\u2014", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, sub: hasData ? `+${overallStats.improvement} pts` : "No data yet", subColor: hasData ? c.sage : c.stone },
          { label: "Improvement", value: hasData ? `+${overallStats.improvement}%` : "\u2014", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>, sub: hasData ? "All skills" : "Practice to improve", subColor: c.stone },
          { label: "Time Logged", value: hasData ? `${overallStats.hoursLogged}h` : "0h", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, sub: "Total", subColor: c.stone },
        ].map((stat, i) => (
          <div key={i} style={{ ...card, padding: "24px", cursor: "default" }} {...cardLift}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, letterSpacing: "0.04em", textTransform: "uppercase" as const }}>{stat.label}</span>
              <div style={{ opacity: 0.7 }}>{stat.icon}</div>
            </div>
            <span style={{ fontFamily: font.mono, fontSize: 28, fontWeight: 600, color: c.ivory, display: "block", marginBottom: 4, letterSpacing: "-0.03em" }}>{stat.value}</span>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: stat.subColor, fontWeight: stat.subColor !== c.stone ? 600 : 400 }}>{stat.sub}</span>
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
          <div style={{ ...card, padding: "24px 28px", marginBottom: sp["3xl"] }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              {sectionTitle("Upcoming Interviews", 16)}
              <button onClick={() => nav("/dashboard/calendar")} style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.gilt, background: "none", border: "none", cursor: "pointer", opacity: 0.8 }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
                onMouseLeave={(e) => e.currentTarget.style.opacity = "0.8"}
              >View all</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${Math.min(upcomingEvents.length, 3)}, 1fr)`, gap: 12 }}>
              {upcomingEvents.map(ev => {
                const days = daysUntilEvent(ev.date, ev.time);
                const urgent = days <= 3;
                const isToday = days === 0;
                return (
                  <div key={ev.id} style={{ padding: "16px 20px", borderRadius: radius.md, background: c.obsidian, borderLeft: `3px solid ${isToday ? c.ember : urgent ? c.gilt : c.sage}`, cursor: "pointer", transition: "background 0.2s ease" }} onClick={() => nav("/dashboard/calendar")}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(240,237,232,0.02)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = c.obsidian}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>{ev.company}</span>
                      <span style={{ fontFamily: font.mono, fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: radius.pill, background: isToday ? "rgba(196,112,90,0.1)" : urgent ? "rgba(201,169,110,0.08)" : "rgba(122,158,126,0.06)", color: isToday ? c.ember : urgent ? c.gilt : c.sage }}>
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

      {/* ─── Row 1: Score Trend | Skill Breakdown ─── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: sp["2xl"], marginBottom: sp["2xl"] }}>
        {/* Score Trend */}
        <div style={{ ...card, padding: "28px 32px" }} {...cardLift}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              {sectionTitle("Score Trend")}
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginTop: 4 }}>{scoreTrend.length > 0 ? "Hover for details" : "Complete sessions to see your progress"}</p>
            </div>
          </div>
          {scoreTrend.length >= 2 ? (
            <>
              <ScoreTrendChart data={scoreTrend} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, padding: "0 24px" }}>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>{scoreTrend[0].date}</span>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>{scoreTrend[scoreTrend.length - 1].date}</span>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 20px", textAlign: "center" }}>
              <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(240,237,232,0.08)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 14 }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 12 }}>Your score trend will appear here after your first session</p>
              <button onClick={handleStartSession} style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.gilt, background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.12)`, borderRadius: radius.sm, padding: "8px 18px", cursor: "pointer", transition: "all 0.2s ease" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(201,169,110,0.12)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "rgba(201,169,110,0.06)"}
              >Start a Session</button>
            </div>
          )}
        </div>

        {/* Skill Radar */}
        <div style={{ ...card, padding: "28px" }} {...cardLift}>
          {sectionTitle("Skill Breakdown")}
          {skills.length > 0 ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 2, background: c.gilt, borderRadius: 1 }} /><span style={{ fontFamily: font.ui, fontSize: 9, color: c.stone }}>Current</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 2, background: c.stone, borderRadius: 1, opacity: 0.5 }} /><span style={{ fontFamily: font.ui, fontSize: 9, color: c.stone }}>First session</span></div>
              </div>
              <SkillRadar skills={skills} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                {skills.map((sk) => (
                  <div key={sk.name} onClick={() => nav(`/session/new?type=behavioral&focus=${sk.name.toLowerCase().replace(/\s+/g, "-")}`)}
                    style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 8px", margin: "-6px -8px", borderRadius: radius.sm, transition: "background 0.15s ease" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(240,237,232,0.03)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    title={`Practice ${sk.name}`}>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, flex: 1 }}>{sk.name}</span>
                    <div style={{ width: 60, height: 3, background: "rgba(240,237,232,0.06)", borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", width: `${sk.score}%`, background: sk.color, borderRadius: 2, transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)" }} /></div>
                    <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.ivory, width: 22, textAlign: "right" }}>{sk.score}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: c.sage, width: 28, textAlign: "right" }}>+{sk.score - sk.prev}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 16px", textAlign: "center" }}>
              <svg aria-hidden="true" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(240,237,232,0.08)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 12 }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, lineHeight: 1.5 }}>Complete your first session to see your skill breakdown across communication, leadership, and more.</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Row 2: Recent Sessions | AI Insights (side by side) ─── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "3fr 2fr", gap: sp["2xl"], marginBottom: sp["2xl"] }}>
      <div style={{ ...card, padding: "28px 32px" }} {...cardLift}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          {sectionTitle("Recent Sessions")}
          <button onClick={() => setSortBy(sortBy === "date" ? "score" : "date")}
            style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, background: "rgba(240,237,232,0.03)", border: "none", borderRadius: radius.sm, padding: "5px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, outline: "none", transition: "color 0.2s" }}
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
            <input type="text" placeholder="Search sessions..." aria-label="Search sessions" value={searchQuery} onChange={(e) => handleSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 10px 8px 32px", fontFamily: font.ui, fontSize: 12, color: c.ivory, background: c.obsidian, border: `1px solid rgba(240,237,232,0.06)`, borderRadius: radius.sm, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
              onFocus={(e) => e.currentTarget.style.borderColor = "rgba(201,169,110,0.3)"}
              onBlur={(e) => e.currentTarget.style.borderColor = "rgba(240,237,232,0.06)"}
            />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["all", "month", "week"] as const).map((range) => (
              <button key={range} onClick={() => setDateRange(range)}
                style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 500, padding: "6px 12px", borderRadius: radius.sm, cursor: "pointer", background: dateRange === range ? "rgba(201,169,110,0.08)" : "transparent", border: "none", color: dateRange === range ? c.gilt : c.stone, transition: "all 0.2s ease", outline: "none" }}
                onMouseEnter={(e) => { if (dateRange !== range) e.currentTarget.style.color = c.ivory; }}
                onMouseLeave={(e) => { if (dateRange !== range) e.currentTarget.style.color = c.stone; }}>
                {range === "all" ? "All time" : range === "month" ? "30 days" : "7 days"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
          {sessionTypes.map((type) => (
            <button key={type} onClick={() => setFilterType(type)}
              style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, padding: "5px 14px", borderRadius: radius.pill, cursor: "pointer", background: filterType === type ? "rgba(201,169,110,0.08)" : "transparent", border: "none", color: filterType === type ? c.gilt : c.stone, transition: "all 0.2s ease", outline: "none" }}
              onMouseEnter={(e) => { if (filterType !== type) e.currentTarget.style.color = c.chalk; }}
              onMouseLeave={(e) => { if (filterType !== type) e.currentTarget.style.color = c.stone; }}>
              {type}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredSessions.length === 0 ? (
            <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, textAlign: "center", padding: "32px 0" }}>
              {searchQuery ? `No sessions matching "${searchQuery}"` : "No sessions match this filter."}
            </p>
          ) : (
            filteredSessions.map((session) => (
              <div key={session.id}>
                <button className="dash-focus" onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)} aria-expanded={expandedSession === session.id}
                  style={{ width: "100%", padding: "16px 18px", borderRadius: radius.md, background: expandedSession === session.id ? "rgba(201,169,110,0.03)" : c.obsidian, border: "none", boxShadow: expandedSession === session.id ? "0 0 0 1px rgba(201,169,110,0.1)" : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 16, transition: "all 0.25s cubic-bezier(0.16,1,0.3,1)", textAlign: "left" }}
                  onMouseEnter={(e) => { if (expandedSession !== session.id) e.currentTarget.style.background = "rgba(240,237,232,0.02)"; }}
                  onMouseLeave={(e) => { if (expandedSession !== session.id) e.currentTarget.style.background = c.obsidian; }}>
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
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round" style={{ transform: expandedSession === session.id ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
                </button>

                {expandedSession === session.id && (
                  <div style={{ padding: "18px 22px", margin: "6px 0", background: c.obsidian, borderRadius: radius.md, animation: "slideDown 0.2s ease" }}>
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
                      <div style={{ padding: "16px 18px", borderRadius: radius.sm, background: "rgba(201,169,110,0.02)", borderLeft: `3px solid rgba(201,169,110,0.15)`, marginBottom: 14 }}>
                        <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.gilt, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>AI Feedback</span>
                        <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.7, margin: 0 }}>{session.feedback}</p>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => setFeedbackSession(feedbackSession === session.id ? null : session.id)}
                        style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.gilt, background: "rgba(201,169,110,0.06)", border: "none", borderRadius: radius.sm, padding: "8px 16px", cursor: "pointer", transition: "background 0.2s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.12)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.06)"; }}>
                        {feedbackSession === session.id ? "Hide Feedback" : "View Feedback"}
                      </button>
                      <button onClick={() => setViewingSession(session.id)}
                        style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.ivory, background: "rgba(240,237,232,0.04)", border: "none", borderRadius: radius.sm, padding: "8px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "background 0.2s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(240,237,232,0.08)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(240,237,232,0.04)"; }}>
                        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                        Full Transcript
                      </button>
                      <button onClick={() => nav(`/session/new?type=${session.type.toLowerCase().replace(" ", "-")}`)}
                        style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.stone, background: "transparent", border: "none", borderRadius: radius.sm, padding: "8px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "color 0.2s" }}
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
        </div>
      </div>

        {/* Tabbed Insights & Goals (in same grid row as Recent Sessions) */}
        <div style={{ ...card, overflow: "hidden" }} {...cardLift}>
          <div style={{ display: "flex", borderBottom: "1px solid rgba(240,237,232,0.04)" }}>
            {([["insights", "AI Insights"], ["goals", "Weekly Goals"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setRightTab(key)}
                style={{ flex: 1, padding: "16px 16px", fontFamily: font.ui, fontSize: 13, fontWeight: rightTab === key ? 600 : 400, color: rightTab === key ? c.ivory : c.stone, background: "transparent", border: "none", cursor: "pointer", borderBottom: rightTab === key ? `2px solid ${c.gilt}` : "2px solid transparent", transition: "all 0.2s ease", outline: "none" }}>
                {label}
                {key === "goals" && <span style={{ marginLeft: 6, fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.gilt, background: "rgba(201,169,110,0.08)", padding: "1px 6px", borderRadius: 4 }}>{upcomingGoals.filter(g => g.progress < g.total).length}</span>}
              </button>
            ))}
          </div>
          <div style={{ padding: "22px 28px" }}>
            {rightTab === "insights" ? (
              aiInsights.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Complete more sessions to unlock AI insights.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {aiInsights.map((insight, i) => (
                    <div key={i} style={{ padding: "14px 16px", borderRadius: radius.sm, background: c.obsidian, borderLeft: `3px solid ${insight.type === "strength" ? c.sage : insight.type === "weakness" ? c.ember : c.gilt}` }}>
                      <span style={{ fontFamily: font.ui, fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: insight.type === "strength" ? c.sage : insight.type === "weakness" ? c.ember : c.gilt, display: "block", marginBottom: 4 }}>
                        {insight.type === "strength" ? "Strength" : insight.type === "weakness" ? "Improve" : "Tip"}
                      </span>
                      <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.6 }}>{insight.text}</p>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {upcomingGoals.map((goal, i) => (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>{goal.label}</span>
                      <span style={{ fontFamily: font.mono, fontSize: 11, color: goal.progress >= goal.total ? c.sage : c.stone }}>{goal.progress}/{goal.total}</span>
                    </div>
                    <div style={{ height: 4, background: "rgba(240,237,232,0.06)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(goal.progress / goal.total) * 100}%`, background: goal.progress >= goal.total ? c.sage : c.gilt, borderRadius: 2, transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Achievements (full-width) ─── */}
      {badges.length > 0 && (
        <div style={{ ...card, padding: "24px 28px" }} {...cardLift}>
          {sectionTitle("Achievements")}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : `repeat(${Math.min(badges.length, 4)}, 1fr)`, gap: 12, marginTop: 16 }}>
            {badges.map((badge) => (
              <div key={badge.id} style={{ padding: "16px", borderRadius: radius.md, background: badge.earned ? "rgba(201,169,110,0.03)" : c.obsidian, textAlign: "center", opacity: badge.earned ? 1 : 0.45, transition: "opacity 0.3s ease" }}
                onMouseEnter={(e) => { if (!badge.earned) e.currentTarget.style.opacity = "0.7"; }}
                onMouseLeave={(e) => { if (!badge.earned) e.currentTarget.style.opacity = "0.45"; }}>
                <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}>{(badgeIcons[badge.icon] || badgeIcons.star)(badge.earned ? c.gilt : c.stone)}</div>
                <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: badge.earned ? c.ivory : c.stone, marginBottom: 2 }}>{badge.label}</p>
                <p style={{ fontFamily: font.ui, fontSize: 9, color: c.stone, lineHeight: 1.4, marginBottom: badge.earned ? 0 : 8 }}>{badge.description}</p>
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
