import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { c, font } from "./tokens";
import { useDocTitle } from "./useDocTitle";
import { useAuth } from "./AuthContext";
import { sessionTypes, scoreLabel, scoreLabelColor } from "./dashboardTypes";
import { ScoreTrendChart, SkillRadar } from "./DashboardCharts";
import { useDashboard } from "./DashboardContext";
import { DataLoadingSkeleton, ProGate } from "./dashboardComponents";
import type { ResumeProfile } from "./dashboardData";

/* ─── Humanize camelCase skill names ─── */
function humanize(s: string) {
  return s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
}

/* ─── Readiness Gauge (circular arc) ─── */
function ReadinessGauge({ score }: { score: number }) {
  const size = 120, strokeW = 8, r = (size - strokeW) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = (score / 100) * circumference;
  const color = score >= 75 ? c.sage : score >= 50 ? c.gilt : c.ember;
  return (
    <div style={{ position: "relative", width: size, height: size }} role="img" aria-label={`Interview readiness score: ${score} out of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c.border} strokeWidth={strokeW} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeW}
          strokeDasharray={`${progress} ${circumference - progress}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: font.mono, fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{score}</span>
        <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, marginTop: 2 }}>readiness</span>
      </div>
    </div>
  );
}

/* ─── Insight type → icon color ─── */
const insightColor: Record<string, string> = { strength: c.sage, tip: c.gilt, warning: c.ember, focus: c.slate };

const DATE_RANGES = [
  { label: "4 weeks", days: 28 },
  { label: "12 weeks", days: 84 },
  { label: "6 months", days: 182 },
  { label: "All time", days: 0 },
] as const;

export default function AnalyticsPage() {
  useDocTitle("Analytics");
  const nav = useNavigate();
  const { user } = useAuth();
  const resumeProfile = user?.resumeData as unknown as ResumeProfile | undefined;
  const {
    recentSessions: allSessions, skills: sk, scoreTrend: trend,
    handleStartSession, dataLoading, isFree, setShowUpgradeModal,
    readinessScore, currentStreak, aiInsights,
    dailyChallenge, upcomingGoals, badges, overallStats, atSessionLimit,
  } = useDashboard();

  const [rangeIdx, setRangeIdx] = useState(1); // default: 12 weeks
  const range = DATE_RANGES[rangeIdx];

  const sessions = useMemo(() => {
    if (range.days === 0) return allSessions;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - range.days);
    return allSessions.filter(s => new Date(s.date) >= cutoff);
  }, [allSessions, range.days]);

  // Period comparison for KPIs — compare current range to previous range
  // Hooks must be called before any early returns (Rules of Hooks)
  const prevSessions = useMemo(() => {
    if (range.days === 0 || allSessions.length === 0) return [];
    const cutoffCurrent = new Date();
    cutoffCurrent.setDate(cutoffCurrent.getDate() - range.days);
    const cutoffPrev = new Date();
    cutoffPrev.setDate(cutoffPrev.getDate() - range.days * 2);
    return allSessions.filter(s => { const d = new Date(s.date); return d >= cutoffPrev && d < cutoffCurrent; });
  }, [allSessions, range.days]);

  // Readiness breakdown — recent practice days
  const recentDays = useMemo(() => {
    const now = Date.now();
    const weekMs = 7 * 86400000;
    return new Set(trend.filter(t => now - new Date(t.date).getTime() < weekMs).map(t => new Date(t.date).toDateString())).size;
  }, [trend]);

  if (dataLoading) return <DataLoadingSkeleton />;
  if (isFree) return <ProGate feature="Performance Analytics" onUpgrade={() => setShowUpgradeModal(true)} />;

  if (sessions.length === 0) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center", padding: "60px 20px" }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, margin: "0 auto 24px", background: "rgba(122,158,126,0.06)", border: `1px solid rgba(122,158,126,0.15)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
        </div>
        <h2 style={{ fontFamily: font.ui, fontSize: 22, fontWeight: 600, color: c.ivory, marginBottom: 8 }}>Analytics</h2>
        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6, marginBottom: 28 }}>
          Complete sessions to see analytics. Score trends, skill breakdowns, performance by interview type, and more will appear here.
        </p>
        {handleStartSession && (
          <button onClick={handleStartSession} className="shimmer-btn"
            style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, padding: "12px 32px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21" /></svg>
            Start Your First Session
          </button>
        )}
      </div>
    );
  }

  const avgScore = Math.round(sessions.reduce((s, sess) => s + sess.score, 0) / sessions.length);
  const bestSession = [...sessions].sort((a, b) => b.score - a.score)[0];
  const totalImprovement = sk.length > 0 ? sk.reduce((sum, s) => sum + (s.score - s.prev), 0) : 0;
  const avgImprovement = sk.length > 0 ? Math.round(totalImprovement / sk.length) : 0;

  const typeBreakdown = sessionTypes.filter(t => t !== "All").map(type => {
    const typeSessions = sessions.filter(s => s.type === type);
    return { type, count: typeSessions.length, avgScore: typeSessions.length ? Math.round(typeSessions.reduce((s, sess) => s + sess.score, 0) / typeSessions.length) : 0 };
  }).filter(t => t.count > 0);

  const prevAvgScore = prevSessions.length > 0 ? Math.round(prevSessions.reduce((s, sess) => s + sess.score, 0) / prevSessions.length) : null;

  // Weakest interview type for recommendation
  const weakestType = typeBreakdown.length > 0 ? [...typeBreakdown].sort((a, b) => a.avgScore - b.avgScore)[0] : null;
  const typeToUrlParam: Record<string, string> = { Behavioral: "behavioral", Strategic: "strategic", "Technical Leadership": "technical", "Case Study": "case-study", "Campus Placement": "campus-placement", "HR Round": "hr-round", Management: "management" };

  // Readiness breakdown
  const latestScore = trend.length > 0 ? trend[trend.length - 1].score : 0;
  const avgSkill = sk.length > 0 ? Math.round(sk.reduce((sum, s) => sum + s.score, 0) / sk.length) : 0;

  // Targeted session start
  const startTargeted = (type?: string) => {
    if (atSessionLimit) { setShowUpgradeModal(true); return; }
    nav(type ? `/session/new?type=${type}` : "/session/new");
  };

  // Weekly practice heatmap — respects selected date range
  const heatmapWeeks = range.days === 0 ? 24 : Math.max(4, Math.ceil(range.days / 7));
  const weeklyData: { week: string; sessions: number; avgScore: number }[] = [];
  for (let w = heatmapWeeks - 1; w >= 0; w--) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - w * 7 - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekSessions = sessions.filter(s => { const d = new Date(s.date); return d >= weekStart && d < weekEnd; });
    weeklyData.push({
      week: `${weekStart.getMonth() + 1}/${weekStart.getDate()}`,
      sessions: weekSessions.length,
      avgScore: weekSessions.length ? Math.round(weekSessions.reduce((s, sess) => s + sess.score, 0) / weekSessions.length) : 0,
    });
  }
  const maxWeeklySessions = Math.max(...weeklyData.map(w => w.sessions), 1);

  const earnedBadges = badges.filter(b => b.earned);
  const nextBadge = badges.find(b => !b.earned && b.progress > 0);

  return (
    <div style={{ margin: "0 auto" }}>
      <style>{`
        @media (max-width: 768px) {
          .analytics-hero-grid { grid-template-columns: 1fr !important; }
          .analytics-charts-grid { grid-template-columns: 1fr !important; }
          .analytics-two-col { grid-template-columns: 1fr !important; }
          .analytics-kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .analytics-type-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .analytics-kpi-grid { grid-template-columns: 1fr !important; }
          .analytics-type-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, marginBottom: 6, letterSpacing: "0.01em" }}>Analytics</h2>
          <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.5 }}>Your performance insights and interview readiness</p>
        </div>
        <div role="radiogroup" aria-label="Date range" style={{ display: "flex", gap: 4, background: c.graphite, borderRadius: 8, padding: 3, border: `1px solid ${c.border}` }}>
          {DATE_RANGES.map((r, i) => (
            <button key={r.label} role="radio" aria-checked={rangeIdx === i} onClick={() => setRangeIdx(i)}
              style={{
                fontFamily: font.ui, fontSize: 11, fontWeight: rangeIdx === i ? 600 : 400,
                padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                background: rangeIdx === i ? c.gilt : "transparent",
                color: rangeIdx === i ? c.obsidian : c.stone,
                transition: "all 0.2s ease",
              }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Recommended Next Session ─── */}
      {weakestType && weakestType.avgScore < 80 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
          padding: "16px 22px", borderRadius: 12, marginBottom: 20,
          background: "linear-gradient(135deg, rgba(212,179,127,0.04), rgba(122,158,126,0.04))",
          border: `1px solid rgba(212,179,127,0.12)`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <div>
              <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Practice your weakest area</span>
              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, display: "block" }}>
                {weakestType.type} — averaging {weakestType.avgScore} across {weakestType.count} session{weakestType.count !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <button onClick={() => startTargeted(typeToUrlParam[weakestType.type])}
            style={{
              fontFamily: font.ui, fontSize: 12, fontWeight: 600, padding: "9px 20px", borderRadius: 8,
              border: "none", cursor: "pointer", background: c.gilt, color: c.obsidian,
              display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21"/></svg>
            Start {weakestType.type}
          </button>
        </div>
      )}

      {/* ─── Hero: Readiness + Streak + Best + Daily Challenge ─── */}
      <div className="analytics-hero-grid" style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Readiness gauge + breakdown */}
        <div style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", backdropFilter: "blur(16px)", borderRadius: 14, border: `1px solid ${c.border}`, padding: "24px 28px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 200 }}>
          <ReadinessGauge score={readinessScore} />
          <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, marginTop: 12, marginBottom: 12 }}>Interview Readiness</span>
          {/* Readiness breakdown */}
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { label: "Latest score", value: latestScore, weight: "40%" },
              { label: "Avg skill", value: avgSkill, weight: "40%" },
              { label: "Consistency", value: `${recentDays}/7d`, weight: "20%" },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{r.label}</span>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.chalk, fontWeight: 600 }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick stats column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Streak */}
          <div style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", backdropFilter: "blur(16px)", borderRadius: 14, border: `1px solid ${c.border}`, padding: "18px 20px", flex: 1, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(212,179,127,0.08)", border: `1px solid rgba(212,179,127,0.15)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M12 2c1 6-4 6-4 12a6 6 0 0012 0c0-6-5-6-4-12"/><path d="M12 22a3 3 0 01-3-3c0-3 3-3 3-6"/></svg>
            </div>
            <div>
              <span style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, color: currentStreak > 0 ? c.gilt : c.stone, display: "block", lineHeight: 1 }}>{currentStreak}</span>
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>day streak</span>
            </div>
          </div>
          {/* Best score */}
          <div style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", backdropFilter: "blur(16px)", borderRadius: 14, border: `1px solid ${c.border}`, padding: "18px 20px", flex: 1, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(122,158,126,0.08)", border: `1px solid rgba(122,158,126,0.15)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            </div>
            <div>
              <span style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, color: c.sage, display: "block", lineHeight: 1 }}>{bestSession?.score || "—"}</span>
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>best score{bestSession ? ` · ${bestSession.type}` : ""}</span>
            </div>
          </div>
        </div>

        {/* Daily Challenge — targeted */}
        <div style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", backdropFilter: "blur(16px)", borderRadius: 14, border: `1px solid ${c.border}`, padding: "22px 24px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory }}>Today's Challenge</span>
            <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 500, color: c.obsidian, background: dailyChallenge.completed ? c.sage : c.gilt, borderRadius: 4, padding: "2px 6px", marginLeft: "auto" }}>
              {dailyChallenge.completed ? "Done" : dailyChallenge.difficulty}
            </span>
          </div>
          <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, color: c.chalk, marginBottom: 4 }}>{dailyChallenge.label}</span>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, lineHeight: 1.5, flex: 1 }}>{dailyChallenge.description}</span>
          {!dailyChallenge.completed && (
            <button onClick={() => startTargeted(dailyChallenge.type)}
              style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, padding: "8px 16px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, cursor: "pointer", marginTop: 12, alignSelf: "flex-start" }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
            >
              Start Challenge
            </button>
          )}
        </div>
      </div>

      {/* ─── AI Insights ─── */}
      {aiInsights.length > 0 && (
        <div style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", backdropFilter: "blur(16px)", borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 24px", marginBottom: 24 }}>
          <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 14 }}>AI Insights</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
            {aiInsights.map((insight, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", background: c.obsidian, borderRadius: 8, border: `1px solid ${c.border}` }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: insightColor[insight.type] || c.gilt, marginTop: 6, flexShrink: 0 }} />
                <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.5 }}>{insight.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Summary KPIs ─── */}
      {(() => {
        const scoreDelta = prevAvgScore !== null ? avgScore - prevAvgScore : null;
        const prevCount = prevSessions.length;
        const countDelta = prevCount > 0 ? sessions.length - prevCount : null;
        return (
          <div className="analytics-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Average Score", value: avgScore.toString(), color: c.gilt, sub: scoreLabel(avgScore), delta: scoreDelta },
              { label: "Total Sessions", value: sessions.length.toString(), color: c.ivory, sub: `${typeBreakdown.length} type${typeBreakdown.length !== 1 ? "s" : ""} practiced`, delta: countDelta },
              { label: "Skill Growth", value: `${avgImprovement >= 0 ? "+" : ""}${avgImprovement}`, color: avgImprovement >= 0 ? c.sage : c.ember, sub: "avg pts per skill", delta: null },
              { label: "Hours Logged", value: overallStats.hoursLogged.toFixed(1), color: c.slate, sub: "practice time", delta: null },
            ].map((card, i) => (
              <div key={i} style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", backdropFilter: "blur(16px)", borderRadius: 14, border: `1px solid ${c.border}`, padding: 18 }}>
                <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, display: "block", marginBottom: 8 }}>{card.label}</span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontFamily: font.mono, fontSize: 26, fontWeight: 600, color: card.color, letterSpacing: "-0.02em" }}>{card.value}</span>
                  {card.delta !== null && card.delta !== 0 && (
                    <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: card.delta > 0 ? c.sage : c.ember }}>
                      {card.delta > 0 ? "+" : ""}{card.delta}
                    </span>
                  )}
                </div>
                <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{card.sub}{card.delta !== null ? ` · vs prev ${range.label}` : ""}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ─── Charts: Score Trend + Skill Radar ─── */}
      <div className="analytics-charts-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        <div style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", backdropFilter: "blur(16px)", borderRadius: 14, border: `1px solid ${c.border}`, padding: "24px 28px" }}>
          <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Score Progression</h3>
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginBottom: 16 }}>{trend.length >= 2 ? `Your trajectory over ${trend.length} sessions` : "Complete sessions to see progress"}</p>
          {trend.length >= 2 ? (
            <>
              <ScoreTrendChart data={trend} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, padding: "0 24px" }}>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>{trend[0]?.date}</span>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>{trend[trend.length - 1]?.date}</span>
              </div>
              {(() => {
                const gain = (trend[trend.length - 1]?.score || 0) - (trend[0]?.score || 0);
                return (
                  <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 16, padding: "12px 0", borderTop: `1px solid ${c.border}` }}>
                    <div style={{ textAlign: "center" }}>
                      <span style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 600, color: c.ivory, display: "block" }}>{trend[0]?.score}</span>
                      <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>First</span>
                    </div>
                    <div style={{ width: 1, background: c.border }} />
                    <div style={{ textAlign: "center" }}>
                      <span style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 600, color: gain >= 0 ? c.sage : c.ember, display: "block" }}>{gain >= 0 ? "+" : ""}{gain}</span>
                      <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{gain >= 0 ? "Total gain" : "Change"}</span>
                    </div>
                    <div style={{ width: 1, background: c.border }} />
                    <div style={{ textAlign: "center" }}>
                      <span style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 600, color: c.ivory, display: "block" }}>{trend[trend.length - 1]?.score}</span>
                      <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Latest</span>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center" }}>
              <svg aria-hidden="true" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={c.border} strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 10 }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Complete at least 2 sessions to see your score progression</p>
            </div>
          )}
        </div>

        <div style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", backdropFilter: "blur(16px)", borderRadius: 14, border: `1px solid ${c.border}`, padding: "24px 28px" }}>
          <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Skill Radar</h3>
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginBottom: 12 }}>{sk.length > 0 ? "Current vs first session — dashed line shows where you started" : "Complete sessions to see your skill radar"}</p>
          {sk.length > 0 ? (
            <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
              <div style={{ flex: "1 1 55%", minWidth: 0 }}>
                <SkillRadar skills={sk} />
              </div>
              <div style={{ flex: "1 1 45%", display: "flex", flexDirection: "column", gap: 14 }}>
                {[...sk].sort((a, b) => (b.score - b.prev) - (a.score - a.prev)).map(s => {
                  const delta = s.score - s.prev;
                  return (
                    <div key={s.name}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>{humanize(s.name)}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                          <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 600, color: c.ivory }}>{s.score}</span>
                          <span style={{ fontFamily: font.mono, fontSize: 11, color: delta >= 0 ? c.sage : c.ember }}>{delta >= 0 ? "+" : ""}{delta}</span>
                        </div>
                      </div>
                      <div style={{ width: "100%", height: 4, background: c.border, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${s.score}%`, background: s.color, borderRadius: 2, transition: "width 0.4s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", textAlign: "center" }}>
              <svg aria-hidden="true" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={c.border} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginTop: 10 }}>Complete sessions to unlock your skill radar</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Resume Skills Bridge ─── */}
      {resumeProfile?.topSkills && resumeProfile.topSkills.length > 0 && (
        <div style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", backdropFilter: "blur(16px)", borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 24px", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Resume Skills vs Interview Performance</h3>
            </div>
            {resumeProfile.resumeScore != null && (
              <span style={{ fontFamily: font.mono, fontSize: 11, color: resumeProfile.resumeScore >= 65 ? c.sage : c.gilt }}>Resume score: {resumeProfile.resumeScore}/100</span>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: resumeProfile.interviewGaps && resumeProfile.interviewGaps.length > 0 ? 14 : 0 }}>
            {resumeProfile.topSkills.slice(0, 8).map((skill, i) => {
              const isStrength = resumeProfile.interviewStrengths?.some(s => s.toLowerCase().includes(skill.toLowerCase()));
              const isGap = resumeProfile.interviewGaps?.some(g => g.toLowerCase().includes(skill.toLowerCase()));
              return (
                <span key={i} style={{
                  fontFamily: font.ui, fontSize: 11, padding: "5px 12px", borderRadius: 100,
                  background: isStrength ? "rgba(122,158,126,0.08)" : isGap ? "rgba(196,112,90,0.06)" : "rgba(245,242,237,0.04)",
                  border: `1px solid ${isStrength ? "rgba(122,158,126,0.2)" : isGap ? "rgba(196,112,90,0.12)" : c.border}`,
                  color: isStrength ? c.sage : isGap ? c.ember : c.chalk,
                }}>{skill}</span>
              );
            })}
          </div>
          {resumeProfile.interviewGaps && resumeProfile.interviewGaps.length > 0 && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", borderRadius: 8, background: "rgba(212,179,127,0.03)", border: `1px solid rgba(212,179,127,0.08)` }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" style={{ marginTop: 1, flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.5 }}>
                <strong style={{ color: c.ivory }}>Focus areas from your resume:</strong> {resumeProfile.interviewGaps.slice(0, 3).join(" · ")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ─── Goals + Badges row ─── */}
      <div className="analytics-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Goals */}
        <div style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", backdropFilter: "blur(16px)", borderRadius: 14, border: `1px solid ${c.border}`, padding: "24px 28px" }}>
          <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 16 }}>Goals</h3>
          {upcomingGoals.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {upcomingGoals.map((g, i) => (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>{g.label}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 11, color: c.stone }}>{g.progress}/{g.total}</span>
                  </div>
                  <div style={{ height: 6, background: c.border, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (g.progress / g.total) * 100)}%`, background: g.progress >= g.total ? c.sage : c.gilt, borderRadius: 3, transition: "width 0.4s ease" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Complete more sessions to unlock goals</p>
          )}
        </div>

        {/* Badges */}
        <div style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", backdropFilter: "blur(16px)", borderRadius: 14, border: `1px solid ${c.border}`, padding: "24px 28px" }}>
          <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 16 }}>Badges</h3>
          {earnedBadges.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: nextBadge ? 16 : 0 }}>
              {earnedBadges.map(b => (
                <div key={b.id} title={b.description} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: c.obsidian, borderRadius: 8, border: `1px solid ${c.border}` }}>
                  <span style={{ fontSize: 16 }}>{b.icon}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk }}>{b.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginBottom: nextBadge ? 16 : 0 }}>Complete challenges to earn badges</p>
          )}
          {nextBadge && (
            <div style={{ padding: "12px 16px", background: c.obsidian, borderRadius: 8, border: `1px solid ${c.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Next: <span style={{ color: c.chalk }}>{nextBadge.icon} {nextBadge.label}</span></span>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>{Math.round(nextBadge.progress * 100)}%</span>
              </div>
              <div style={{ height: 4, background: c.border, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${nextBadge.progress * 100}%`, background: c.gilt, borderRadius: 2 }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Performance by Type ─── */}
      <div style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", backdropFilter: "blur(16px)", borderRadius: 14, border: `1px solid ${c.border}`, padding: "24px 28px", marginBottom: 24 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 16 }}>Performance by Interview Type</h3>
        <div className="analytics-type-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(typeBreakdown.length, 4)}, 1fr)`, gap: 12 }}>
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

      {/* ─── Practice Consistency ─── */}
      <div style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", backdropFilter: "blur(16px)", borderRadius: 14, border: `1px solid ${c.border}`, padding: "24px 28px", marginBottom: 24 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Practice Consistency</h3>
        <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginBottom: 16 }}>Sessions per week — {range.days === 0 ? "all time" : `last ${range.label}`}</p>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 100 }}>
          {weeklyData.map((w, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: font.mono, fontSize: 10, color: w.sessions > 0 ? c.ivory : "transparent" }}>{w.sessions}</span>
              <div style={{
                width: "100%", borderRadius: 4,
                height: Math.max(4, (w.sessions / maxWeeklySessions) * 72),
                background: w.sessions > 0 ? w.sessions >= 3 ? c.sage : w.sessions >= 2 ? c.gilt : "rgba(212,179,127,0.3)" : c.border,
                transition: "height 0.3s ease",
              }} />
              <span style={{ fontFamily: font.mono, fontSize: 8, color: c.stone, whiteSpace: "nowrap" }}>{w.week}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 14, justifyContent: "center" }}>
          {[
            { color: "rgba(212,179,127,0.3)", label: "1 session" },
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

      {/* ─── Strengths / Areas to Improve (aggregated) ─── */}
      <div className="analytics-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {(() => {
          // Aggregate strengths/weaknesses by counting occurrences
          const strengthCounts: Record<string, number> = {};
          const weaknessCounts: Record<string, number> = {};
          sessions.forEach(s => {
            if (s.topStrength) strengthCounts[s.topStrength] = (strengthCounts[s.topStrength] || 0) + 1;
            if (s.topWeakness) weaknessCounts[s.topWeakness] = (weaknessCounts[s.topWeakness] || 0) + 1;
          });
          const topStrengths = Object.entries(strengthCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
          const topWeaknesses = Object.entries(weaknessCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
          return (
            <>
              <div style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", backdropFilter: "blur(16px)", borderRadius: 14, border: `1px solid ${c.border}`, padding: "24px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
                  <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Top Strengths</h3>
                </div>
                {topStrengths.length > 0 ? topStrengths.map(([name, count], i) => (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < topStrengths.length - 1 ? `1px solid ${c.border}` : "none" }}>
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                    <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, flex: 1 }}>{name}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>{count}×</span>
                  </div>
                )) : (
                  <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Complete sessions to see strengths</p>
                )}
              </div>
              <div style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", backdropFilter: "blur(16px)", borderRadius: 14, border: `1px solid ${c.border}`, padding: "24px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Areas to Improve</h3>
                </div>
                {topWeaknesses.length > 0 ? topWeaknesses.map(([name, count], i) => (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < topWeaknesses.length - 1 ? `1px solid ${c.border}` : "none" }}>
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, flex: 1 }}>{name}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>{count}×</span>
                  </div>
                )) : (
                  <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Complete sessions to see areas for improvement</p>
                )}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
