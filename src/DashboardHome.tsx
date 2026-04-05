import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { useDashboard } from "./DashboardContext";
import { DataLoadingSkeleton, EmptyState, SessionDetailView } from "./dashboardComponents";
import { scoreLabel, scoreLabelColor, sessionTypes } from "./dashboardTypes";
import { daysUntilEvent, formatEventDate, formatEventTime } from "./dashboardHelpers";
import { getPersonalizedGreeting } from "./dashboardData";
import { ScoreTrendChart, SkillRadar } from "./DashboardCharts";

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
  const [rightTab, setRightTab] = useState<"skills" | "insights">("skills");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const handleSearch = (val: string) => {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 250);
  };

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // Close export menu on outside click
  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showExportMenu]);

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

  // Upcoming interviews
  const upcomingEvents = calendarEvents
    .filter(e => e.status === "upcoming" && daysUntilEvent(e.date, e.time) >= 0)
    .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime())
    .slice(0, 2);

  return (
    <>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", marginBottom: 28, gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontFamily: font.display, fontSize: isMobile ? 24 : 28, fontWeight: 400, color: c.ivory, marginBottom: 2, letterSpacing: "-0.02em" }}>
            {getPersonalizedGreeting(displayName.split(" ")[0], currentStreak, recentSessions.length)}
          </h1>
          <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, lineHeight: 1.5 }}>
            {smartSchedule || returnContext || (weakestSkill ? `Focus on ${weakestSkill.name} to boost your readiness` : "Your interview command center")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Export menu */}
          <div ref={exportRef} style={{ position: "relative" }}>
            <button onClick={() => setShowExportMenu(!showExportMenu)} aria-label="Export options"
              style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.stone, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.borderHover; e.currentTarget.style.color = c.chalk; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; }}
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
            </button>
            {showExportMenu && (
              <div style={{ position: "absolute", right: 0, top: 42, background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 10, padding: 4, zIndex: 50, minWidth: 160, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", animation: "fadeIn 0.15s ease" }}>
                {[
                  { label: "Copy Report", icon: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13", action: () => { handleExport(); setShowExportMenu(false); } },
                  { label: "Download CSV", icon: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3", action: () => { handleDownload(); setShowExportMenu(false); } },
                  { label: "Export PDF", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6", action: () => { handleExportPDF(); setShowExportMenu(false); } },
                ].map((item) => (
                  <button key={item.label} onClick={item.action}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", borderRadius: 6, border: "none", background: "transparent", color: c.chalk, fontFamily: font.ui, fontSize: 12, cursor: "pointer", textAlign: "left", transition: "background 0.15s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(240,237,232,0.04)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><path d={item.icon}/></svg>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="shimmer-btn" onClick={handleStartSession}
            style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, padding: "10px 22px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${c.gilt}, #B8923E)`, color: c.obsidian, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(201,169,110,0.15)", transition: "all 0.2s" }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 6px 28px rgba(201,169,110,0.25)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(201,169,110,0.15)"; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {atSessionLimit ? "Upgrade" : "New Session"}
          </button>
        </div>
      </div>

      {/* ── Notification strip ── */}
      {activeNotifs.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 10, background: c.graphite, border: `1px solid ${c.border}`, marginBottom: 20 }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, flex: 1 }}>{activeNotifs[0].text}</span>
          {activeNotifs[0].action && (
            <button onClick={() => {
              if (activeNotifs[0].action === "View Report") nav("/dashboard/analytics");
              else if (activeNotifs[0].action === "Quick Practice" || activeNotifs[0].action === "Practice Now") handleStartSession();
            }} style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt, background: "rgba(201,169,110,0.08)", border: `1px solid rgba(201,169,110,0.15)`, borderRadius: 6, padding: "4px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>{activeNotifs[0].action}</button>
          )}
          {activeNotifs.length > 1 && <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>+{activeNotifs.length - 1}</span>}
          <button onClick={() => updatePersisted({ dismissedNotifs: [...persisted.dismissedNotifs, ...activeNotifs.filter(n => n.dismissible).map(n => n.id)] })} aria-label="Dismiss" style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 2 }}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      {/* ── Metrics strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)", gap: 1, marginBottom: 24, background: c.border, borderRadius: 14, overflow: "hidden", border: `1px solid ${c.border}` }}>
        {[
          { label: "Readiness", value: hasData && readinessScore > 0 ? readinessScore.toString() : "\u2014", accent: scoreLabelColor(readinessScore), sub: hasData && readinessScore > 0 ? scoreLabel(readinessScore) : "Start practicing" },
          { label: "Sessions", value: overallStats.sessionsCompleted.toString(), accent: c.gilt, sub: `${weekActivity.filter(Boolean).length} this week` },
          { label: "Avg Score", value: hasData ? overallStats.avgScore.toString() : "\u2014", accent: c.sage, sub: hasData ? `${overallStats.improvement >= 0 ? "+" : ""}${overallStats.improvement} pts` : "No data" },
          { label: "Time", value: hasData ? `${overallStats.hoursLogged}h` : "0h", accent: c.slate, sub: "Total logged" },
          { label: "Streak", value: currentStreak > 0 ? currentStreak.toString() : "0", accent: currentStreak >= 3 ? c.ember : c.stone, sub: currentStreak > 0 ? `${currentStreak}-day streak` : "Start today" },
        ].map((stat, i) => (
          <div key={i} style={{ background: c.graphite, padding: isMobile ? "14px 16px" : "18px 20px", ...(isMobile && i === 4 ? { gridColumn: "1 / -1" } : {}) }}>
            <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 500, color: c.stone, letterSpacing: "0.04em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{stat.label}</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontFamily: font.mono, fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.ivory, letterSpacing: "-0.02em", lineHeight: 1 }}>{stat.value}</span>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 500, color: stat.accent }}>{stat.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Week activity bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24, padding: "12px 16px", borderRadius: 10, background: c.graphite, border: `1px solid ${c.border}` }}>
        <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, marginRight: 4 }}>This week</span>
        {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => {
          const today = new Date();
          const todayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1;
          const isToday = i === todayIdx;
          const isFutureDay = i > todayIdx;
          const practiced = weekActivity[i];
          return (
            <div key={i} title={`${day}: ${isFutureDay ? "Upcoming" : practiced ? "Practiced" : "Missed"}`} style={{
              flex: 1, height: 28, borderRadius: 6, maxWidth: 56,
              background: practiced ? "rgba(201,169,110,0.12)" : "transparent",
              border: `1px solid ${practiced ? "rgba(201,169,110,0.2)" : isToday ? c.gilt : c.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontFamily: font.mono, fontWeight: 600,
              color: practiced ? c.gilt : isToday ? c.ivory : c.stone,
              transition: "all 0.2s",
            }}>{day}</div>
          );
        })}
        {daysLeft > 0 && persisted.interviewDate && (
          <>
            <div style={{ width: 1, height: 20, background: c.border, margin: "0 6px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, background: daysLeft <= 7 ? "rgba(196,112,90,0.08)" : "rgba(122,158,126,0.06)", border: `1px solid ${daysLeft <= 7 ? "rgba(196,112,90,0.15)" : "rgba(122,158,126,0.12)"}` }}>
              <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={daysLeft <= 7 ? c.ember : c.sage} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: daysLeft <= 7 ? c.ember : c.sage }}>{daysLeft}d</span>
            </div>
          </>
        )}
        {isFree && sessionsRemaining > 0 && (
          <>
            <div style={{ width: 1, height: 20, background: c.border, margin: "0 6px" }} />
            <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: sessionsRemaining === 1 ? c.ember : c.stone }}>{sessionsRemaining} free left</span>
          </>
        )}
      </div>

      {/* ── Upcoming interviews ── */}
      {upcomingEvents.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          {upcomingEvents.map(ev => {
            const days = daysUntilEvent(ev.date, ev.time);
            const isToday = days === 0;
            const urgent = days <= 3;
            return (
              <div key={ev.id} onClick={() => nav("/dashboard/calendar")} style={{
                flex: 1, padding: "14px 18px", borderRadius: 12, cursor: "pointer",
                background: c.graphite, border: `1px solid ${urgent ? "rgba(196,112,90,0.12)" : c.border}`,
                transition: "border-color 0.2s",
              }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = c.borderHover}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = urgent ? "rgba(196,112,90,0.12)" : c.border}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>{ev.company}</span>
                  <span style={{ fontFamily: font.mono, fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 100, background: isToday ? "rgba(196,112,90,0.12)" : urgent ? "rgba(201,169,110,0.1)" : "rgba(122,158,126,0.08)", color: isToday ? c.ember : urgent ? c.gilt : c.sage }}>
                    {isToday ? "TODAY" : days === 1 ? "TOMORROW" : `${days}d`}
                  </span>
                </div>
                <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{ev.type} · {formatEventDate(ev.date)} · {formatEventTime(ev.time)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Main grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 340px", gap: 20 }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          {/* Score Trend */}
          <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: isMobile ? "20px" : "24px 28px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Performance</h3>
              {hasData && overallStats.sessionsCompleted >= 2 && overallStats.improvement > 0 && (
                <span style={{ fontFamily: font.ui, fontSize: 11, color: c.sage, display: "flex", alignItems: "center", gap: 4 }}>
                  <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
                  {readinessScore >= 85 ? "Interview-ready" : `+${Math.round(overallStats.improvement / overallStats.sessionsCompleted)}pts/session`}
                </span>
              )}
            </div>
            {scoreTrend.length >= 2 ? (
              <>
                <ScoreTrendChart data={scoreTrend} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, padding: "0 24px" }}>
                  <span style={{ fontFamily: font.mono, fontSize: 9, color: c.stone }}>{scoreTrend[0].date}</span>
                  <span style={{ fontFamily: font.mono, fontSize: 9, color: c.stone }}>{scoreTrend[scoreTrend.length - 1].date}</span>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "36px 20px", textAlign: "center" }}>
                <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={c.border} strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 10 }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginBottom: 10 }}>Complete 2+ sessions to see your trend</p>
                <button onClick={handleStartSession} style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt, background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.15)`, borderRadius: 6, padding: "6px 14px", cursor: "pointer" }}>Start a Session</button>
              </div>
            )}
          </div>

          {/* Recent Sessions */}
          <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: isMobile ? "20px" : "24px 28px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Sessions</h3>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={() => setSortBy(sortBy === "date" ? "score" : "date")} title={`Sort by ${sortBy === "date" ? "score" : "date"}`}
                  style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 3, outline: "none" }}>
                  <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 9 6"/><polyline points="3 12 15 12"/><polyline points="3 18 21 18"/></svg>
                  {sortBy === "date" ? "Date" : "Score"}
                </button>
                <button onClick={() => nav("/dashboard/sessions")} style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 500, color: c.gilt, background: "none", border: "none", cursor: "pointer" }}>View all</button>
              </div>
            </div>

            {/* Filters row */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 120, position: "relative" }}>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" placeholder="Search..." aria-label="Search sessions" value={searchQuery} onChange={(e) => handleSearch(e.target.value)}
                  style={{ width: "100%", padding: "6px 8px 6px 26px", fontFamily: font.ui, fontSize: 11, color: c.ivory, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 6, outline: "none", boxSizing: "border-box" }}
                  onFocus={(e) => e.currentTarget.style.borderColor = "rgba(201,169,110,0.3)"}
                  onBlur={(e) => e.currentTarget.style.borderColor = c.border}
                />
              </div>
              {(["all", "month", "week"] as const).map((range) => (
                <button key={range} onClick={() => setDateRange(range)}
                  style={{ fontFamily: font.ui, fontSize: 9, fontWeight: 500, padding: "5px 8px", borderRadius: 5, cursor: "pointer", background: dateRange === range ? "rgba(201,169,110,0.1)" : "transparent", border: `1px solid ${dateRange === range ? "rgba(201,169,110,0.2)" : c.border}`, color: dateRange === range ? c.gilt : c.stone, outline: "none" }}>
                  {range === "all" ? "All" : range === "month" ? "30d" : "7d"}
                </button>
              ))}
            </div>

            {/* Type filters */}
            <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
              {sessionTypes.map((type) => (
                <button key={type} onClick={() => setFilterType(type)}
                  style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 500, padding: "4px 10px", borderRadius: 100, cursor: "pointer", background: filterType === type ? "rgba(201,169,110,0.1)" : "transparent", border: `1px solid ${filterType === type ? "rgba(201,169,110,0.2)" : c.border}`, color: filterType === type ? c.gilt : c.stone, outline: "none", transition: "all 0.15s" }}>
                  {type}
                </button>
              ))}
            </div>

            {/* Session list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filteredSessions.length === 0 ? (
                <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, textAlign: "center", padding: "20px 0" }}>
                  {searchQuery ? `No results for "${searchQuery}"` : "No sessions match this filter."}
                </p>
              ) : (
                filteredSessions.slice(0, 8).map((session) => (
                  <div key={session.id}>
                    <button onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)} aria-expanded={expandedSession === session.id}
                      style={{ width: "100%", padding: "12px 14px", borderRadius: 10, background: expandedSession === session.id ? "rgba(201,169,110,0.03)" : "transparent", border: `1px solid ${expandedSession === session.id ? "rgba(201,169,110,0.1)" : c.border}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "all 0.15s", textAlign: "left", outline: "none" }}
                      onMouseEnter={(e) => { if (expandedSession !== session.id) e.currentTarget.style.background = "rgba(240,237,232,0.02)"; }}
                      onMouseLeave={(e) => { if (expandedSession !== session.id) e.currentTarget.style.background = "transparent"; }}>
                      {/* Score ring */}
                      <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, border: `2px solid ${scoreLabelColor(session.score)}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 600, color: c.ivory, lineHeight: 1 }}>{session.score}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 1 }}>
                          <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory }}>{session.type}</span>
                          <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: session.change > 0 ? c.sage : session.change < 0 ? c.ember : c.stone }}>{session.change > 0 ? "+" : ""}{session.change}</span>
                        </div>
                        <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{session.dateLabel} · {session.duration}</span>
                      </div>
                      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round" style={{ transform: expandedSession === session.id ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
                    </button>

                    {expandedSession === session.id && (
                      <div style={{ padding: "14px 16px", margin: "4px 0 2px", borderRadius: 10, border: `1px solid ${c.border}`, animation: "slideDown 0.2s ease" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                          <div>
                            <span style={{ fontFamily: font.ui, fontSize: 9, fontWeight: 600, color: c.sage, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 3 }}>Strength</span>
                            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ivory }}>{session.topStrength}</span>
                          </div>
                          <div>
                            <span style={{ fontFamily: font.ui, fontSize: 9, fontWeight: 600, color: c.ember, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 3 }}>Improve</span>
                            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ivory }}>{session.topWeakness}</span>
                          </div>
                        </div>
                        {feedbackSession === session.id && (
                          <div style={{ padding: "12px 14px", borderRadius: 8, background: "rgba(201,169,110,0.03)", border: `1px solid rgba(201,169,110,0.08)`, marginBottom: 10 }}>
                            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.7, margin: 0 }}>{session.feedback}</p>
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button onClick={() => setFeedbackSession(feedbackSession === session.id ? null : session.id)}
                            style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.gilt, background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.12)`, borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
                            {feedbackSession === session.id ? "Hide" : "Feedback"}
                          </button>
                          <button onClick={() => setViewingSession(session.id)}
                            style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.chalk, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
                            Transcript
                          </button>
                          <button onClick={() => nav(`/session/new?type=${session.type.toLowerCase().replace(" ", "-")}`)}
                            style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
                            Redo
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
              {filteredSessions.length > 8 && (
                <button onClick={() => nav("/dashboard/sessions")} style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.gilt, background: "transparent", border: "none", cursor: "pointer", padding: "8px 0", textAlign: "center" }}>
                  View all {filteredSessions.length} sessions
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Tabbed panel: Skills / Insights */}
          <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, overflow: "hidden" }}>
            <div style={{ display: "flex", borderBottom: `1px solid ${c.border}` }}>
              {([["skills", "Skills"], ["insights", "Insights"]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setRightTab(key)}
                  style={{ flex: 1, padding: "13px 16px", fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: rightTab === key ? c.ivory : c.stone, background: "transparent", border: "none", cursor: "pointer", borderBottom: rightTab === key ? `2px solid ${c.gilt}` : "2px solid transparent", transition: "all 0.2s", outline: "none" }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ padding: "20px" }}>
              {rightTab === "skills" ? (
                skills.length > 0 ? (
                  <>
                    <SkillRadar skills={skills} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
                      {skills.map((sk) => (
                        <div key={sk.name} onClick={() => nav(`/session/new?type=behavioral&focus=${sk.name.toLowerCase().replace(/\s+/g, "-")}`)}
                          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "5px 6px", margin: "-5px -6px", borderRadius: 6, transition: "background 0.15s" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(201,169,110,0.04)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          title={`Practice ${sk.name}`}>
                          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, flex: 1 }}>{sk.name}</span>
                          <div style={{ width: 48, height: 3, background: c.border, borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", width: `${sk.score}%`, background: sk.color, borderRadius: 2 }} /></div>
                          <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.ivory, width: 20, textAlign: "right" }}>{sk.score}</span>
                          <span style={{ fontFamily: font.mono, fontSize: 9, color: c.sage, width: 24, textAlign: "right" }}>+{sk.score - sk.prev}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: "28px 12px" }}>
                    <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.border} strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 8 }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, lineHeight: 1.5 }}>Complete a session to see skill breakdown</p>
                  </div>
                )
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {aiInsights.map((insight, i) => (
                    <div key={i} style={{ padding: "10px 12px", borderRadius: 8, borderLeft: `3px solid ${insight.type === "strength" ? c.sage : insight.type === "weakness" ? c.ember : c.gilt}` }}>
                      <span style={{ fontFamily: font.ui, fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: insight.type === "strength" ? c.sage : insight.type === "weakness" ? c.ember : c.gilt, display: "block", marginBottom: 3 }}>
                        {insight.type === "strength" ? "Strength" : insight.type === "weakness" ? "Improve" : "Tip"}
                      </span>
                      <p style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, lineHeight: 1.5, margin: 0 }}>{insight.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Weekly Goals */}
          {upcomingGoals.length > 0 && (
            <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px" }}>
              <h3 style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, marginBottom: 14 }}>Weekly Goals</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {upcomingGoals.map((goal, i) => (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk }}>{goal.label}</span>
                      <span style={{ fontFamily: font.mono, fontSize: 10, color: goal.progress >= goal.total ? c.sage : c.stone }}>{goal.progress}/{goal.total}</span>
                    </div>
                    <div style={{ height: 3, background: c.border, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, (goal.progress / goal.total) * 100)}%`, background: goal.progress >= goal.total ? c.sage : c.gilt, borderRadius: 2, transition: "width 0.3s" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daily Challenge */}
          {dailyChallenge && !dailyChallenge.completed && (
            <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid rgba(201,169,110,0.1)`, padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h3 style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, display: "flex", alignItems: "center", gap: 6 }}>
                  <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                  Daily Challenge
                </h3>
                <span style={{ fontFamily: font.mono, fontSize: 8, fontWeight: 600, padding: "2px 7px", borderRadius: 100, background: dailyChallenge.difficulty === "hard" ? "rgba(196,112,90,0.1)" : "rgba(201,169,110,0.1)", color: dailyChallenge.difficulty === "hard" ? c.ember : c.gilt, textTransform: "uppercase" }}>{dailyChallenge.difficulty}</span>
              </div>
              <p style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.chalk, marginBottom: 3 }}>{dailyChallenge.label}</p>
              <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, lineHeight: 1.5, marginBottom: 12 }}>{dailyChallenge.description}</p>
              <button onClick={() => nav(`/session/new?type=${dailyChallenge.type}${dailyChallenge.focus ? `&focus=${dailyChallenge.focus}` : ""}`)}
                style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.obsidian, background: `linear-gradient(135deg, ${c.gilt}, #B8923E)`, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", width: "100%", transition: "opacity 0.2s" }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
                onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
              >Start Challenge</button>
            </div>
          )}

          {/* Achievements - compact */}
          {badges.length > 0 && (
            <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px" }}>
              <h3 style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, marginBottom: 12 }}>Achievements</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                {badges.map((badge) => (
                  <div key={badge.id} style={{ padding: "10px", borderRadius: 8, background: badge.earned ? "rgba(201,169,110,0.04)" : "transparent", border: `1px solid ${badge.earned ? "rgba(201,169,110,0.12)" : c.border}`, textAlign: "center", opacity: badge.earned ? 1 : 0.45 }}>
                    <div style={{ fontSize: 18, marginBottom: 2 }}>{badge.icon}</div>
                    <p style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: badge.earned ? c.ivory : c.stone, marginBottom: 0 }}>{badge.label}</p>
                    {!badge.earned && (
                      <div style={{ height: 2, background: c.border, borderRadius: 1, overflow: "hidden", marginTop: 4 }}>
                        <div style={{ height: "100%", width: `${Math.min(100, badge.progress)}%`, background: c.gilt, borderRadius: 1 }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prep Plan - compact */}
          {prepPlan && (
            <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Prep Plan</h3>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.gilt }}>{prepPlan.filter(s => s.done).length}/{prepPlan.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {prepPlan.map((step, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, background: step.done ? c.sage : "transparent", border: `2px solid ${step.done ? c.sage : c.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {step.done && <svg aria-hidden="true" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={c.obsidian} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: step.done ? c.stone : c.chalk, textDecoration: step.done ? "line-through" : "none", opacity: step.done ? 0.6 : 1 }}>{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
