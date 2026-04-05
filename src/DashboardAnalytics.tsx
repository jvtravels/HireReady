import { c, font, sp, radius, shadow, gradient, ease } from "./tokens";
import { useDocTitle } from "./useDocTitle";
import { sessionTypes, scoreLabel, scoreLabelColor } from "./dashboardTypes";
import type { DashboardSession, SkillData, TrendPoint } from "./dashboardTypes";
import { ScoreTrendChart, SkillRadar } from "./DashboardCharts";
import { useDashboard } from "./DashboardContext";
import { DataLoadingSkeleton, ProGate } from "./dashboardComponents";

/* ─── Shared Card Styles ─── */
const card = {
  base: {
    borderRadius: radius.xl,
    border: `1px solid ${c.border}`,
    padding: "28px 32px",
    position: "relative" as const,
    overflow: "hidden" as const,
  },
  glass: {
    background: `linear-gradient(170deg, rgba(30,30,32,0.55) 0%, rgba(10,10,12,0.55) 100%)`,
    backdropFilter: "blur(24px)",
    boxShadow: shadow.sm,
  },
  elevated: {
    background: `linear-gradient(170deg, rgba(35,35,38,0.6) 0%, rgba(17,17,19,0.6) 100%)`,
    backdropFilter: "blur(24px)",
    boxShadow: shadow.md,
  },
  featured: {
    background: `linear-gradient(135deg, rgba(212,179,127,0.06) 0%, rgba(17,17,19,0.6) 60%)`,
    backdropFilter: "blur(24px)",
    border: `1px solid rgba(212,179,127,0.12)`,
    boxShadow: `${shadow.md}, ${shadow.glow}`,
  },
};

/* ─── Section Label ─── */
function SectionLabel({ children }: { children: string }) {
  return (
    <span style={{
      fontFamily: font.ui, fontSize: 10, fontWeight: 600,
      letterSpacing: "0.1em", textTransform: "uppercase",
      color: c.gilt, display: "block", marginBottom: 6,
    }}>{children}</span>
  );
}

/* ─── Readiness Ring (large hero version) ─── */
function ReadinessRing({ score }: { score: number }) {
  const size = 180, strokeW = 10, r = (size - strokeW) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = (score / 100) * circumference;
  const color = score >= 75 ? c.sage : score >= 50 ? c.gilt : c.ember;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="url(#ringGrad)" stroke="rgba(255,255,255,0.04)" strokeWidth={strokeW} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeW}
          strokeDasharray={`${progress} ${circumference - progress}`} strokeLinecap="round"
          style={{ transition: `stroke-dasharray 0.8s ${ease.out}`, filter: `drop-shadow(0 0 8px ${color}44)` }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: font.display, fontSize: 52, fontWeight: 400, color, lineHeight: 1, letterSpacing: "-0.02em" }}>{score}</span>
        <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, marginTop: 4, letterSpacing: "0.04em" }}>readiness</span>
      </div>
    </div>
  );
}

/* ─── Mini Stat Pill ─── */
function StatPill({ icon, value, label, accent }: { icon: React.ReactNode; value: string; label: string; accent?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "16px 20px", borderRadius: radius.lg,
      background: "rgba(255,255,255,0.02)", border: `1px solid ${c.borderSubtle}`,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: radius.md,
        background: accent ? `${accent}0a` : "rgba(212,179,127,0.06)",
        border: `1px solid ${accent ? `${accent}1a` : "rgba(212,179,127,0.12)"}`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{icon}</div>
      <div>
        <span style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 700, color: accent || c.gilt, display: "block", lineHeight: 1 }}>{value}</span>
        <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginTop: 2, display: "block" }}>{label}</span>
      </div>
    </div>
  );
}

/* ─── Insight type → icon color ─── */
const insightColor: Record<string, string> = { strength: c.sage, tip: c.gilt, warning: c.ember, focus: c.slate };
const insightIcon: Record<string, string> = { strength: "↑", tip: "◆", warning: "!", focus: "◎" };

export default function AnalyticsPage() {
  useDocTitle("Analytics");
  const {
    recentSessions: sessions, skills: sk, scoreTrend: trend,
    handleStartSession, dataLoading, isFree, setShowUpgradeModal,
    readinessScore, currentStreak, daysLeft, aiInsights,
    dailyChallenge, upcomingGoals, badges, overallStats,
  } = useDashboard();

  if (dataLoading) return <DataLoadingSkeleton />;
  if (isFree) return <ProGate feature="Performance Analytics" onUpgrade={() => setShowUpgradeModal(true)} />;

  if (sessions.length === 0) {
    return (
      <div style={{ maxWidth: 520, margin: "80px auto", textAlign: "center", padding: "0 20px" }}>
        <div style={{
          width: 80, height: 80, borderRadius: radius["2xl"], margin: "0 auto 28px",
          background: gradient.giltSubtle, border: `1px solid rgba(212,179,127,0.1)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
        </div>
        <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, marginBottom: 10, letterSpacing: "-0.01em" }}>Analytics</h2>
        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.7, marginBottom: 32, maxWidth: 380, margin: "0 auto 32px" }}>
          Complete your first session to unlock score trends, skill breakdowns, and personalized insights.
        </p>
        {handleStartSession && (
          <button onClick={handleStartSession} className="premium-btn"
            style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, padding: "14px 36px", borderRadius: radius.lg, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10 }}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21" /></svg>
            Start First Session
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

  const weeklyData: { week: string; sessions: number; avgScore: number }[] = [];
  for (let w = 11; w >= 0; w--) {
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
    <div style={{ margin: "0 auto", maxWidth: 1120 }}>

      {/* ─── Page Header ─── */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontFamily: font.display, fontSize: 34, fontWeight: 400, color: c.ivory, marginBottom: 6, letterSpacing: "-0.01em" }}>Analytics</h2>
        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone }}>Performance insights & interview readiness</p>
      </div>

      {/* ═══════════════════════════════════════════════
          HERO: Readiness + Stats + Daily Challenge
          ═══════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 300px", gap: 16, marginBottom: 28 }}>

        {/* Readiness — Featured card */}
        <div style={{ ...card.base, ...card.featured, padding: "32px 28px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "100%", background: `radial-gradient(circle at 50% 30%, ${readinessScore >= 75 ? "rgba(122,158,126,0.08)" : readinessScore >= 50 ? "rgba(212,179,127,0.08)" : "rgba(196,112,90,0.08)"} 0%, transparent 70%)`, pointerEvents: "none" }} />
          <ReadinessRing score={readinessScore} />
          <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, marginTop: 16, position: "relative" }}>Interview Readiness</span>
          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginTop: 4, position: "relative" }}>
            {readinessScore >= 75 ? "You're well prepared" : readinessScore >= 50 ? "Getting there" : "More practice needed"}
          </span>
        </div>

        {/* Quick Stats — Stacked pills */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <StatPill
            icon={<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M12 2c1 6-4 6-4 12a6 6 0 0012 0c0-6-5-6-4-12"/><path d="M12 22a3 3 0 01-3-3c0-3 3-3 3-6"/></svg>}
            value={currentStreak.toString()} label="day streak" accent={currentStreak > 0 ? c.gilt : c.stone}
          />
          <StatPill
            icon={<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={daysLeft > 0 && daysLeft <= 7 ? c.ember : c.slate} strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
            value={daysLeft > 0 ? daysLeft.toString() : "—"} label={daysLeft > 0 ? "days until interview" : "No date set"}
            accent={daysLeft > 0 && daysLeft <= 7 ? c.ember : c.slate}
          />
          <StatPill
            icon={<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}
            value={`+${avgImprovement}`} label="avg skill improvement" accent={c.sage}
          />
        </div>

        {/* Daily Challenge — Accent card */}
        <div style={{
          ...card.base, ...card.elevated, padding: "24px 28px",
          display: "flex", flexDirection: "column",
          borderTop: `2px solid ${dailyChallenge.completed ? c.sage : c.gilt}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.ivory, letterSpacing: "0.02em" }}>Today's Challenge</span>
            <span style={{
              fontFamily: font.mono, fontSize: 9, fontWeight: 600, marginLeft: "auto",
              color: dailyChallenge.completed ? c.sage : c.gilt,
              background: dailyChallenge.completed ? "rgba(122,158,126,0.1)" : "rgba(212,179,127,0.1)",
              borderRadius: radius.sm, padding: "3px 8px",
              border: `1px solid ${dailyChallenge.completed ? "rgba(122,158,126,0.2)" : "rgba(212,179,127,0.2)"}`,
            }}>
              {dailyChallenge.completed ? "DONE" : dailyChallenge.difficulty.toUpperCase()}
            </span>
          </div>
          <span style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.chalk, marginBottom: 6, lineHeight: 1.3 }}>{dailyChallenge.label}</span>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, lineHeight: 1.6, flex: 1 }}>{dailyChallenge.description}</span>
          {!dailyChallenge.completed && handleStartSession && (
            <button onClick={handleStartSession}
              style={{
                fontFamily: font.ui, fontSize: 12, fontWeight: 600, padding: "10px 20px",
                borderRadius: radius.md, border: `1px solid rgba(212,179,127,0.3)`,
                background: "rgba(212,179,127,0.08)", color: c.gilt,
                cursor: "pointer", marginTop: 14, alignSelf: "flex-start",
                transition: `all 0.2s ${ease.out}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.15)"; e.currentTarget.style.borderColor = "rgba(212,179,127,0.5)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.08)"; e.currentTarget.style.borderColor = "rgba(212,179,127,0.3)"; }}
            >
              Start Challenge →
            </button>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          AI INSIGHTS — Horizontal scroll cards
          ═══════════════════════════════════════════════ */}
      {aiInsights.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <SectionLabel>AI Insights</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(aiInsights.length, 4)}, 1fr)`, gap: 12 }}>
            {aiInsights.map((insight, i) => {
              const clr = insightColor[insight.type] || c.gilt;
              return (
                <div key={i} style={{
                  ...card.base, padding: "18px 22px", ...card.glass,
                  borderLeft: `3px solid ${clr}`,
                  borderRadius: `4px ${radius.lg}px ${radius.lg}px 4px`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 700, color: clr }}>{insightIcon[insight.type] || "◆"}</span>
                    <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: clr, textTransform: "uppercase", letterSpacing: "0.08em" }}>{insight.type}</span>
                  </div>
                  <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.6 }}>{insight.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          KPI ROW — Large numbers
          ═══════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 28 }}>
        {[
          { label: "Avg Score", value: avgScore.toString(), color: c.gilt, sub: scoreLabel(avgScore) },
          { label: "Best Score", value: bestSession?.score.toString() || "—", color: c.sage, sub: bestSession?.type || "" },
          { label: "Sessions", value: sessions.length.toString(), color: c.ivory, sub: `${typeBreakdown.length} types` },
          { label: "Improvement", value: `+${avgImprovement}`, color: c.sage, sub: "pts/skill" },
          { label: "Hours", value: overallStats.hoursLogged.toFixed(1), color: c.slateLight, sub: "practiced" },
        ].map((kpi, i) => (
          <div key={i} style={{
            ...card.base, padding: "22px 24px", ...card.glass,
            textAlign: "center",
          }}>
            <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 500, color: c.stone, display: "block", marginBottom: 10, letterSpacing: "0.04em" }}>{kpi.label}</span>
            <span style={{ fontFamily: font.display, fontSize: 36, fontWeight: 400, color: kpi.color, display: "block", lineHeight: 1, letterSpacing: "-0.02em" }}>{kpi.value}</span>
            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, marginTop: 6, display: "block" }}>{kpi.sub}</span>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════
          CHARTS ROW: Score Progression + Skill Radar
          ═══════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 28 }}>
        {/* Score Trend */}
        <div style={{ ...card.base, ...card.elevated }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <SectionLabel>Performance</SectionLabel>
              <h3 style={{ fontFamily: font.display, fontSize: 22, fontWeight: 400, color: c.ivory }}>Score Progression</h3>
            </div>
            {trend.length >= 2 && (
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontFamily: font.mono, fontSize: 20, fontWeight: 600, color: c.sage, display: "block", lineHeight: 1 }}>+{(trend[trend.length - 1]?.score || 0) - (trend[0]?.score || 0)}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>total gain</span>
                </div>
              </div>
            )}
          </div>
          {trend.length >= 2 ? (
            <>
              <ScoreTrendChart data={trend} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, padding: "0 24px" }}>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>{trend[0]?.date}</span>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>{trend[trend.length - 1]?.date}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 28, marginTop: 18, padding: "14px 0 0", borderTop: `1px solid ${c.borderSubtle}` }}>
                {[
                  { v: trend[0]?.score, l: "First", clr: c.stone },
                  { v: trend[trend.length - 1]?.score, l: "Latest", clr: c.ivory },
                  { v: Math.max(...trend.map(t => t.score)), l: "Peak", clr: c.gilt },
                ].map((s, i) => (
                  <div key={i} style={{ textAlign: "center" }}>
                    <span style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 600, color: s.clr, display: "block" }}>{s.v}</span>
                    <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{s.l}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 20px", textAlign: "center" }}>
              <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 12 }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>Complete 2+ sessions to see your trajectory</p>
            </div>
          )}
        </div>

        {/* Skill Radar */}
        <div style={{ ...card.base, ...card.glass }}>
          <SectionLabel>Skills</SectionLabel>
          <h3 style={{ fontFamily: font.display, fontSize: 22, fontWeight: 400, color: c.ivory, marginBottom: 16 }}>Skill Radar</h3>
          {sk.length > 0 ? (
            <>
              <SkillRadar skills={sk} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                {[...sk].sort((a, b) => (b.score - b.prev) - (a.score - a.prev)).map(s => (
                  <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, flex: 1 }}>{s.name}</span>
                    <div style={{ width: 72, height: 4, background: "rgba(255,255,255,0.04)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${s.score}%`, background: `linear-gradient(90deg, ${s.color}, ${s.color}88)`, borderRadius: 2, transition: `width 0.5s ${ease.out}` }} />
                    </div>
                    <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 600, color: c.ivory, width: 24, textAlign: "right" }}>{s.score}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: c.sage, width: 30, textAlign: "right" }}>+{s.score - s.prev}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${c.borderSubtle}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 16, height: 2, background: c.gilt, borderRadius: 1 }} />
                  <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Current</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 16, height: 2, background: c.stone, borderRadius: 1, backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(0,0,0,0.5) 3px, rgba(0,0,0,0.5) 6px)" }} />
                  <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>First session</span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 20px", textAlign: "center" }}>
              <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginTop: 12 }}>Complete sessions to unlock your skill radar</p>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          GOALS + BADGES ROW
          ═══════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
        {/* Goals */}
        {upcomingGoals.length > 0 && (
          <div style={{ ...card.base, ...card.glass }}>
            <SectionLabel>Progress</SectionLabel>
            <h3 style={{ fontFamily: font.display, fontSize: 20, fontWeight: 400, color: c.ivory, marginBottom: 20 }}>Goals</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {upcomingGoals.map((g, i) => {
                const pct = Math.min(100, (g.progress / g.total) * 100);
                const done = g.progress >= g.total;
                return (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                      <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.chalk }}>{g.label}</span>
                      <span style={{ fontFamily: font.mono, fontSize: 11, color: done ? c.sage : c.stone }}>{g.progress}/{g.total}</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", width: `${pct}%`, borderRadius: 3,
                        background: done ? `linear-gradient(90deg, ${c.sage}, ${c.sageLight})` : `linear-gradient(90deg, ${c.gilt}, ${c.giltLight})`,
                        transition: `width 0.5s ${ease.out}`,
                        boxShadow: done ? `0 0 8px ${c.sage}44` : "none",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Badges */}
        <div style={{ ...card.base, ...card.glass }}>
          <SectionLabel>Achievements</SectionLabel>
          <h3 style={{ fontFamily: font.display, fontSize: 20, fontWeight: 400, color: c.ivory, marginBottom: 20 }}>Badges</h3>
          {earnedBadges.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: nextBadge ? 18 : 0 }}>
              {earnedBadges.map(b => (
                <div key={b.id} title={b.description} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 14px", borderRadius: radius.md,
                  background: "rgba(212,179,127,0.04)", border: `1px solid rgba(212,179,127,0.1)`,
                }}>
                  <span style={{ fontSize: 18 }}>{b.icon}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk }}>{b.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: nextBadge ? 18 : 0 }}>Complete challenges to earn badges</p>
          )}
          {nextBadge && (
            <div style={{
              padding: "14px 18px", borderRadius: radius.md,
              background: "rgba(255,255,255,0.02)", border: `1px solid ${c.borderSubtle}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>
                  Next: <span style={{ color: c.giltLight, fontWeight: 500 }}>{nextBadge.icon} {nextBadge.label}</span>
                </span>
                <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.gilt }}>{Math.round(nextBadge.progress * 100)}%</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.04)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${nextBadge.progress * 100}%`, background: gradient.giltShine, borderRadius: 2, transition: `width 0.4s ${ease.out}` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          PERFORMANCE BY TYPE — Visual cards
          ═══════════════════════════════════════════════ */}
      <div style={{ ...card.base, ...card.elevated, marginBottom: 28 }}>
        <SectionLabel>Breakdown</SectionLabel>
        <h3 style={{ fontFamily: font.display, fontSize: 22, fontWeight: 400, color: c.ivory, marginBottom: 24 }}>Performance by Type</h3>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(typeBreakdown.length, 4)}, 1fr)`, gap: 14 }}>
          {typeBreakdown.map(tb => {
            const clr = scoreLabelColor(tb.avgScore);
            return (
              <div key={tb.type} style={{
                padding: "24px 20px", borderRadius: radius.lg, textAlign: "center",
                background: `linear-gradient(180deg, ${clr}08 0%, transparent 60%)`,
                border: `1px solid ${clr}15`,
              }}>
                <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: clr, display: "block", marginBottom: 14 }}>{tb.type}</span>
                <span style={{ fontFamily: font.display, fontSize: 44, fontWeight: 400, color: clr, display: "block", lineHeight: 1, letterSpacing: "-0.02em" }}>{tb.avgScore}</span>
                <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, display: "block", marginTop: 8 }}>{tb.count} session{tb.count !== 1 ? "s" : ""}</span>
                <div style={{ height: 3, background: "rgba(255,255,255,0.04)", borderRadius: 2, marginTop: 16, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${tb.avgScore}%`, background: `linear-gradient(90deg, ${clr}88, ${clr})`, borderRadius: 2, transition: `width 0.5s ${ease.out}` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          PRACTICE CONSISTENCY HEATMAP
          ═══════════════════════════════════════════════ */}
      <div style={{ ...card.base, ...card.glass, marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <SectionLabel>Consistency</SectionLabel>
            <h3 style={{ fontFamily: font.display, fontSize: 22, fontWeight: 400, color: c.ivory }}>Practice Activity</h3>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {[
              { color: "rgba(212,179,127,0.2)", label: "1" },
              { color: c.gilt, label: "2" },
              { color: c.sage, label: "3+" },
            ].map(l => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
                <span style={{ fontFamily: font.mono, fontSize: 9, color: c.stone }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 110 }}>
          {weeklyData.map((w, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: font.mono, fontSize: 9, fontWeight: 600, color: w.sessions > 0 ? c.ivory : "transparent" }}>{w.sessions}</span>
              <div style={{
                width: "100%", borderRadius: 5,
                height: Math.max(6, (w.sessions / maxWeeklySessions) * 80),
                background: w.sessions > 0
                  ? w.sessions >= 3 ? `linear-gradient(180deg, ${c.sageLight}, ${c.sage})` : w.sessions >= 2 ? `linear-gradient(180deg, ${c.giltLight}, ${c.gilt})` : "rgba(212,179,127,0.2)"
                  : "rgba(255,255,255,0.03)",
                transition: `height 0.4s ${ease.out}`,
                boxShadow: w.sessions >= 3 ? `0 2px 8px ${c.sage}33` : "none",
              }} />
              <span style={{ fontFamily: font.mono, fontSize: 8, color: c.stone, whiteSpace: "nowrap" }}>{w.week}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          STRENGTHS + AREAS TO IMPROVE
          ═══════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Strengths */}
        <div style={{ ...card.base, ...card.glass, borderTop: `2px solid ${c.sage}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ width: 32, height: 32, borderRadius: radius.sm, background: "rgba(122,158,126,0.08)", border: "1px solid rgba(122,158,126,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
            </div>
            <h3 style={{ fontFamily: font.display, fontSize: 20, fontWeight: 400, color: c.ivory }}>Top Strengths</h3>
          </div>
          {sessions.slice(0, 5).map((s, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 0",
              borderBottom: i < 4 ? `1px solid ${c.borderSubtle}` : "none",
            }}>
              <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.sage, width: 18, textAlign: "center" }}>{i + 1}</span>
              <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, flex: 1 }}>{s.topStrength}</span>
              <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, padding: "2px 8px", background: "rgba(255,255,255,0.03)", borderRadius: radius.sm }}>{s.type}</span>
            </div>
          ))}
        </div>

        {/* Areas to improve */}
        <div style={{ ...card.base, ...card.glass, borderTop: `2px solid ${c.ember}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ width: 32, height: 32, borderRadius: radius.sm, background: "rgba(196,112,90,0.08)", border: "1px solid rgba(196,112,90,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <h3 style={{ fontFamily: font.display, fontSize: 20, fontWeight: 400, color: c.ivory }}>Areas to Improve</h3>
          </div>
          {sessions.slice(0, 5).map((s, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 0",
              borderBottom: i < 4 ? `1px solid ${c.borderSubtle}` : "none",
            }}>
              <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.ember, width: 18, textAlign: "center" }}>{i + 1}</span>
              <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, flex: 1 }}>{s.topWeakness}</span>
              <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, padding: "2px 8px", background: "rgba(255,255,255,0.03)", borderRadius: radius.sm }}>{s.type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
