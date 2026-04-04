import { useState } from "react";
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
    handleStartSession, handleExport, handleDownload,
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

  // Debounce search
  const handleSearch = (val: string) => {
    setSearchQuery(val);
    setTimeout(() => setDebouncedSearch(val), 250);
  };

  if (dataLoading) return <DataLoadingSkeleton />;

  const detailSession = viewingSession ? recentSessions.find(s => s.id === viewingSession) : null;

  if (detailSession) {
    return <SessionDetailView session={detailSession} onBack={() => setViewingSession(null)} />;
  }

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

  const filteredSessions = recentSessions
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
    .sort((a, b) => sortBy === "score" ? b.score - a.score : new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: font.ui, fontSize: isMobile ? 20 : 24, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>
            {getPersonalizedGreeting(displayName.split(" ")[0], currentStreak, recentSessions.length)}
          </h1>
          {returnContext && <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 2 }}>{returnContext}</p>}
          {smartSchedule && <p style={{ fontFamily: font.ui, fontSize: 12, color: c.gilt, fontStyle: "italic" }}>{smartSchedule}</p>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <button onClick={() => { handleExport(); setShareTooltip(true); setTimeout(() => setShareTooltip(false), 2000); }} title="Copy progress report"
              style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s ease", outline: "none" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.gilt; e.currentTarget.style.color = c.ivory; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; }}
            >
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              Share
            </button>
            {shareTooltip && <div style={{ position: "absolute", top: -32, left: "50%", transform: "translateX(-50%)", background: c.sage, color: c.obsidian, fontFamily: font.ui, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 4, whiteSpace: "nowrap", animation: "fadeIn 0.2s ease" }}>Copied to clipboard!</div>}
          </div>
          <button onClick={handleDownload} title="Download progress report"
            style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s ease", outline: "none" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.gilt; e.currentTarget.style.color = c.ivory; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; }}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download
          </button>
          {!isMobile && [
            { label: "Quick Behavioral", type: "behavioral", icon: <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
            { label: "Quick Case Study", type: "case-study", icon: <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
          ].map((action) => (
            <button key={action.label} title={action.label} onClick={() => nav(`/session/new?type=${action.type}`)}
              style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s ease", outline: "none" }}
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
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={notif.type === "streak" ? c.ember : c.sage} strokeWidth="2" strokeLinecap="round">
                {notif.type === "streak" ? <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></> : <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}
              </svg>
              <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, flex: 1 }}>{notif.text}</span>
              {notif.action && (
                <button onClick={() => {
                  if (notif.action === "View Report") nav("/dashboard/analytics");
                  else if (notif.action === "Quick Practice" || notif.action === "Practice Now") handleStartSession();
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

      {/* Prep Plan Timeline */}
      {prepPlan && (
        <div style={{ marginBottom: 16, background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "20px 24px" }}>
          <button onClick={() => setPrepPlanOpen(!prepPlanOpen)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, outline: "none" }} aria-expanded={prepPlanOpen} aria-label="Toggle Interview Prep Plan">
            <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, margin: 0 }}>Interview Prep Plan</h3>
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
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: step.done ? c.sage : c.obsidian, border: `2px solid ${step.done ? c.sage : c.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {step.done && <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.obsidian} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    {i < prepPlan.length - 1 && <div style={{ width: 2, height: 24, background: step.done ? c.sage : c.border, opacity: 0.4 }} />}
                  </div>
                  <span style={{ fontFamily: font.ui, fontSize: 12, color: step.done ? c.stone : c.chalk, paddingTop: 2, textDecoration: step.done ? "line-through" : "none", opacity: step.done ? 0.6 : 1 }}>{step.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CTA Banner */}
      <div style={{ background: `linear-gradient(135deg, rgba(201,169,110,0.08) 0%, ${c.graphite} 100%)`, borderRadius: 14, border: `1px solid rgba(201,169,110,0.12)`, padding: isMobile ? "20px" : "24px 32px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          {daysLeft > 0 && persisted.interviewDate && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 100, background: daysLeft <= 7 ? "rgba(196,112,90,0.1)" : "rgba(122,158,126,0.1)", border: `1px solid ${daysLeft <= 7 ? "rgba(196,112,90,0.2)" : "rgba(122,158,126,0.2)"}` }}>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={daysLeft <= 7 ? c.ember : c.sage} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: daysLeft <= 7 ? c.ember : c.sage }}>{daysLeft} days until interview</span>
              </div>
            </div>
          )}
          <h3 style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory, marginBottom: 6 }}>
            {hasData ? `Ready for session #${overallStats.sessionsCompleted + 1}?` : "Start practicing to ace your next interview"}
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
          <button className="shimmer-btn" onClick={handleStartSession} style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, padding: "12px 28px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(201,169,110,0.2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; e.currentTarget.style.boxShadow = "none"; }}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="5,3 19,12 5,21" /></svg>
            {atSessionLimit ? "Upgrade to Continue" : "Start Session"}
          </button>
          {isFree && sessionsRemaining > 0 && (
            <span style={{ fontFamily: font.mono, fontSize: 10, color: sessionsRemaining === 1 ? c.ember : c.stone }}>{sessionsRemaining} free session{sessionsRemaining !== 1 ? "s" : ""} left</span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "rgba(201,169,110,0.04)", border: `1px solid ${c.border}` }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.gilt }}>{currentStreak > 0 ? `${currentStreak}-day streak` : "Start a streak"}</span>
            <div style={{ width: 1, height: 14, background: c.border, margin: "0 2px" }} />
            {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => {
              const today = new Date();
              const todayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1;
              const isToday = i === todayIdx;
              const isFutureDay = i > todayIdx;
              const practiced = weekActivity[i];
              return (
                <div key={i} title={`${day}: ${isFutureDay ? "Upcoming" : practiced ? "Practiced" : "Missed"}`} style={{
                  width: 20, height: 20, borderRadius: 4,
                  background: practiced ? "rgba(201,169,110,0.15)" : !isFutureDay && !practiced ? "rgba(196,112,90,0.06)" : c.obsidian,
                  border: `1px solid ${practiced ? c.gilt : isToday ? c.gilt : !isFutureDay && !practiced ? "rgba(196,112,90,0.2)" : c.border}`,
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
          { label: "Readiness", value: hasData ? (readinessScore > 0 ? readinessScore.toString() : "\u2014") : "\u2014", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, sub: !hasData ? "Complete a session" : readinessScore > 0 ? scoreLabel(readinessScore) : "Need more sessions to calculate", subColor: !hasData ? c.stone : readinessScore > 0 ? scoreLabelColor(readinessScore) : c.stone },
          { label: "Sessions", value: overallStats.sessionsCompleted.toString(), icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>, sub: hasData ? `${weekActivity.filter(Boolean).length} this week` : "Get started", subColor: c.stone },
          { label: "Avg Score", value: hasData ? overallStats.avgScore.toString() : "\u2014", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, sub: hasData ? `+${overallStats.improvement} pts` : "No data yet", subColor: hasData ? c.sage : c.stone },
          { label: "Improvement", value: hasData ? `+${overallStats.improvement}%` : "\u2014", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>, sub: hasData ? "All skills" : "Practice to improve", subColor: c.stone },
          { label: "Time Logged", value: hasData ? `${overallStats.hoursLogged}h` : "0h", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, sub: "Total", subColor: c.stone },
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
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Upcoming Interviews
              </h3>
              <button onClick={() => nav("/dashboard/calendar")} style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.gilt, background: "none", border: "none", cursor: "pointer" }}>View all</button>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {upcomingEvents.map(ev => {
                const days = daysUntilEvent(ev.date, ev.time);
                const urgent = days <= 3;
                const isToday = days === 0;
                return (
                  <div key={ev.id} style={{ flex: "1 1 200px", padding: "12px 16px", borderRadius: 10, background: c.obsidian, border: `1px solid ${urgent ? "rgba(196,112,90,0.15)" : c.border}`, borderLeft: `3px solid ${isToday ? c.ember : urgent ? c.gilt : c.sage}`, cursor: "pointer" }} onClick={() => nav("/dashboard/calendar")}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory }}>{ev.company}</span>
                      <span style={{ fontFamily: font.mono, fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 100, background: isToday ? "rgba(196,112,90,0.12)" : urgent ? "rgba(201,169,110,0.1)" : "rgba(122,158,126,0.08)", color: isToday ? c.ember : urgent ? c.gilt : c.sage }}>
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
                <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={c.border} strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 12 }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>Your score trend will appear here after your first session</p>
                <button onClick={handleStartSession} style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.gilt, background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.15)`, borderRadius: 6, padding: "8px 16px", cursor: "pointer", marginTop: 12 }}>Start a Session</button>
              </div>
            )}
          </div>

          {/* Sessions */}
          <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory }}>Recent Sessions</h3>
              <button onClick={() => setSortBy(sortBy === "date" ? "score" : "date")}
                style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, background: c.obsidian, border: `1px solid ${c.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, outline: "none" }}>
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {sortBy === "date" ? <><polyline points="3 6 9 6"/><polyline points="3 12 15 12"/><polyline points="3 18 21 18"/></> : <><polyline points="3 6 21 6"/><polyline points="3 12 15 12"/><polyline points="3 18 9 18"/></>}
                </svg>
                {sortBy === "date" ? "By date" : "By score"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160, position: "relative" }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" placeholder="Search sessions..." aria-label="Search sessions" value={searchQuery} onChange={(e) => handleSearch(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px 7px 32px", fontFamily: font.ui, fontSize: 12, color: c.ivory, background: c.obsidian, border: `1px solid ${c.border}`, borderRadius: 6, outline: "none", boxSizing: "border-box" }}
                  onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
                  onBlur={(e) => e.currentTarget.style.borderColor = c.border}
                />
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {(["all", "month", "week"] as const).map((range) => (
                  <button key={range} onClick={() => setDateRange(range)}
                    style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 500, padding: "5px 10px", borderRadius: 6, cursor: "pointer", background: dateRange === range ? "rgba(201,169,110,0.1)" : "transparent", border: `1px solid ${dateRange === range ? c.gilt : c.border}`, color: dateRange === range ? c.gilt : c.stone, transition: "all 0.2s ease", outline: "none" }}>
                    {range === "all" ? "All time" : range === "month" ? "30 days" : "7 days"}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {sessionTypes.map((type) => (
                <button key={type} onClick={() => setFilterType(type)}
                  style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, padding: "5px 12px", borderRadius: 100, cursor: "pointer", background: filterType === type ? "rgba(201,169,110,0.1)" : "transparent", border: `1px solid ${filterType === type ? c.gilt : c.border}`, color: filterType === type ? c.gilt : c.stone, transition: "all 0.2s ease", outline: "none" }}>
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
                      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round" style={{ transform: expandedSession === session.id ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
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
                            style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.gilt, background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.15)`, borderRadius: 6, padding: "8px 16px", cursor: "pointer" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.12)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.06)"; }}>
                            {feedbackSession === session.id ? "Hide Feedback" : "View Feedback"}
                          </button>
                          <button onClick={() => setViewingSession(session.id)}
                            style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.ivory, background: "rgba(240,237,232,0.04)", border: `1px solid ${c.border}`, borderRadius: 6, padding: "8px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.borderHover; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; }}>
                            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                            Full Transcript
                          </button>
                          <button onClick={() => nav(`/session/new?type=${session.type.toLowerCase().replace(" ", "-")}`)}
                            style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.stone, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 6, padding: "8px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = c.ivory; e.currentTarget.style.borderColor = c.borderHover; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; e.currentTarget.style.borderColor = c.border; }}>
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
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Skill Radar */}
          <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px" }}>
            <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Skill Breakdown</h3>
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
                <svg aria-hidden="true" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={c.border} strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 10 }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, lineHeight: 1.5 }}>Complete your first session to see your skill breakdown across communication, leadership, and more.</p>
              </div>
            )}
          </div>

          {/* Tabbed Insights & Goals */}
          <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}` }}>
            <div style={{ display: "flex", borderBottom: `1px solid ${c.border}` }}>
              {([["insights", "AI Insights"], ["goals", "Weekly Goals"]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setRightTab(key)}
                  style={{ flex: 1, padding: "14px 16px", fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: rightTab === key ? c.ivory : c.stone, background: "transparent", border: "none", cursor: "pointer", borderBottom: rightTab === key ? `2px solid ${c.gilt}` : "2px solid transparent", transition: "all 0.2s ease", outline: "none" }}>
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
  );
}
