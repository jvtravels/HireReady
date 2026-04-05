import { c, font, sp, radius } from "../../../src/tokens";

/* ─── Static dashboard mockup showing all design fixes ─── */

const card = {
  background: c.graphite,
  borderRadius: radius.lg,
  border: "none",
  boxShadow: "0 1px 3px rgba(0,0,0,0.24), 0 0 0 1px rgba(240,237,232,0.04)",
  transition: "box-shadow 0.3s cubic-bezier(0.16,1,0.3,1), transform 0.3s cubic-bezier(0.16,1,0.3,1)",
} as const;

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

const sectionTitle = (text: string, size = 16) => (
  <h3 style={{ fontFamily: font.display, fontSize: size, fontWeight: 400, color: c.ivory, letterSpacing: "0.01em", margin: 0 }}>{text}</h3>
);

const stats = [
  { label: "Readiness", value: "73", icon: "shield", sub: "Building up", subColor: c.ember },
  { label: "Sessions", value: "8", icon: "check", sub: "4 this week", subColor: c.stone },
  { label: "Avg Score", value: "75", icon: "star", sub: "+0 pts", subColor: c.sage },
  { label: "Improvement", value: "+0%", icon: "trend", sub: "All skills", subColor: c.stone },
  { label: "Time Logged", value: "1.7h", icon: "clock", sub: "Total", subColor: c.stone },
];

const StatIcon = ({ type, color }: { type: string; color: string }) => {
  const props = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.5 };
  switch (type) {
    case "shield": return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    case "check": return <svg {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
    case "star": return <svg {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
    case "trend": return <svg {...props}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
    case "clock": return <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    default: return null;
  }
};

const skills = [
  { name: "Communication", score: 81, prev: 79, color: c.gilt },
  { name: "Strategic Thinking", score: 86, prev: 84, color: c.sage },
  { name: "Leadership Presence", score: 72, prev: 68, color: c.ember },
  { name: "Impact Quantification", score: 65, prev: 58, color: c.ember },
  { name: "STAR Structure", score: 84, prev: 82, color: c.gilt },
  { name: "Stakeholder Mgmt", score: 77, prev: 76, color: c.gilt },
];

const badgeIcons: Record<string, (color: string) => JSX.Element> = {
  target: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  layers: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  award: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>,
  gem: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 18 3 22 9 12 22 2 9 6 3"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="12" y1="22" x2="8" y2="9"/><line x1="12" y1="22" x2="16" y2="9"/></svg>,
};

const badges = [
  { id: "first", label: "First Steps", desc: "Complete your first session", icon: "target", earned: true },
  { id: "five", label: "Committed", desc: "Complete 5 sessions", icon: "layers", earned: true },
  { id: "ten", label: "Dedicated", desc: "Complete 10 sessions", icon: "award", earned: false, progress: 80 },
  { id: "consistent", label: "Consistent", desc: "Score 85+ three times in a row", icon: "gem", earned: false, progress: 33 },
];

export default function DashboardMockup() {
  return (
    <div style={{ background: c.obsidian, minHeight: "100vh", display: "flex" }}>
      {/* Sidebar */}
      <div style={{ width: 200, flexShrink: 0, background: c.graphite, boxShadow: "1px 0 3px rgba(0,0,0,0.2), 1px 0 0 rgba(240,237,232,0.04)", padding: "28px 0", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "0 24px", marginBottom: 36 }}>
          <span style={{ fontFamily: font.display, fontSize: 18, color: c.ivory, letterSpacing: "-0.01em" }}>HireReady</span>
        </div>
        {["Dashboard", "Sessions", "Calendar", "Analytics", "Resume", "Settings"].map((item, i) => (
          <div key={item} style={{
            padding: "10px 24px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
            background: i === 0 ? "rgba(201,169,110,0.04)" : "transparent",
            borderRight: i === 0 ? `2px solid ${c.gilt}` : "2px solid transparent",
          }}>
            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: i === 0 ? 600 : 400, color: i === 0 ? c.ivory : c.stone }}>{item}</span>
          </div>
        ))}
        <div style={{ marginTop: "auto", padding: "0 16px" }}>
          <div style={{ padding: "14px 16px", borderRadius: radius.md, background: "rgba(240,237,232,0.02)", border: `1px solid ${c.border}` }}>
            <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt, marginBottom: 2 }}>Free Plan</p>
            <p style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, marginBottom: 8 }}>2 of 3 sessions remaining</p>
            <div style={{ height: 3, background: "rgba(240,237,232,0.06)", borderRadius: 2, overflow: "hidden", marginBottom: 10 }}>
              <div style={{ height: "100%", width: "33%", background: c.gilt, borderRadius: 2 }} />
            </div>
            <button style={{ width: "100%", padding: "8px", fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.obsidian, background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, border: "none", borderRadius: radius.sm, cursor: "pointer" }}>Upgrade to Pro</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 8px 0" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(201,169,110,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt }}>J</span>
            </div>
            <div>
              <p style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, margin: 0 }}>Jay</p>
              <p style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, margin: 0 }}>Senior UX Designer</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: "40px 48px 80px", overflowY: "auto", maxHeight: "100vh" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: sp["3xl"] }}>
            <div>
              <h1 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, marginBottom: 6, letterSpacing: "-0.01em" }}>
                Good afternoon, Jay
              </h1>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>Last session: Behavioral (75/100) — communication improved.</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {["Share", "Download", "Quick Behavioral"].map(label => (
                <button key={label} style={{
                  fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone,
                  background: "transparent", border: `1px solid ${c.border}`, borderRadius: radius.sm,
                  padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Notification with enhanced styling */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderRadius: radius.md,
            background: "rgba(196,112,90,0.04)", borderLeft: `3px solid ${c.ember}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.12)", marginBottom: sp.xl,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, flex: 1 }}>You've missed 2 days this week — practice today to build momentum!</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round" style={{ cursor: "pointer", flexShrink: 0 }}>
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </div>

          {/* Hero CTA */}
          <div style={{ ...card, padding: "32px 36px", marginBottom: sp["2xl"], position: "relative", overflow: "hidden" }} {...cardLift}>
            <div style={{ position: "absolute", top: 0, right: 0, width: "40%", height: "100%", background: "linear-gradient(135deg, transparent 0%, rgba(201,169,110,0.04) 100%)", pointerEvents: "none" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: radius.pill, background: "rgba(196,112,90,0.08)", marginBottom: 12 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.ember }}>12 days until interview</span>
                </div>
                <h2 style={{ fontFamily: font.display, fontSize: 24, fontWeight: 400, color: c.ivory, marginBottom: 8 }}>Ready for session #9?</h2>
                <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, lineHeight: 1.6, maxWidth: 480 }}>
                  Your <strong style={{ color: c.chalk }}>Impact Quantification</strong> score is 65 — Google interviews test this heavily. Try a focused session to boost it.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
                <button style={{
                  fontFamily: font.ui, fontSize: 14, fontWeight: 600, padding: "14px 32px", borderRadius: radius.md,
                  border: "none", background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                  boxShadow: "0 4px 20px rgba(201,169,110,0.2)",
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21" /></svg>
                  Start Session
                </button>
                <button style={{
                  fontFamily: font.ui, fontSize: 12, fontWeight: 500, padding: "9px 20px", borderRadius: radius.md,
                  border: `1px solid rgba(196,112,90,0.15)`, background: "rgba(196,112,90,0.04)", color: c.ember, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Focus: Impact Quantification (65)
                </button>
              </div>
            </div>
          </div>

          {/* Streak Widget */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "10px 0", marginBottom: sp["2xl"] }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.gilt }}>1-day streak</span>
            <div style={{ width: 1, height: 14, background: "rgba(240,237,232,0.08)", margin: "0 4px" }} />
            {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
              <div key={i} style={{
                width: 24, height: 24, borderRadius: 4,
                background: i <= 3 ? "rgba(201,169,110,0.12)" : "transparent",
                border: `1px solid ${i <= 3 ? "rgba(201,169,110,0.25)" : i === 4 ? "rgba(201,169,110,0.2)" : "rgba(240,237,232,0.06)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontFamily: font.mono, fontWeight: 600,
                color: i <= 3 ? c.gilt : i === 4 ? c.ivory : c.stone,
              }}>{day}</div>
            ))}
          </div>

          {/* Stats Grid — 5 in one row (user prefers this) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: sp.lg, marginBottom: sp["3xl"] }}>
            {stats.map((stat, i) => (
              <div key={i} style={{ ...card, padding: "24px", cursor: "default" }} {...cardLift}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, letterSpacing: "0.04em", textTransform: "uppercase" }}>{stat.label}</span>
                  <div style={{ opacity: 0.7 }}><StatIcon type={stat.icon} color={i < 2 || i === 4 ? c.gilt : c.sage} /></div>
                </div>
                <span style={{ fontFamily: font.mono, fontSize: 28, fontWeight: 600, color: c.ivory, display: "block", marginBottom: 4, letterSpacing: "-0.03em" }}>{stat.value}</span>
                <span style={{ fontFamily: font.ui, fontSize: 11, color: stat.subColor, fontWeight: stat.subColor !== c.stone ? 600 : 400 }}>{stat.sub}</span>
              </div>
            ))}
          </div>

          {/* Row 1: Score Trend | Skill Breakdown (equal 1fr 1fr) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp["2xl"], marginBottom: sp["2xl"] }}>
            {/* Score Trend */}
            <div style={{ ...card, padding: "28px 32px" }} {...cardLift}>
              {sectionTitle("Score Trend")}
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginTop: 4, marginBottom: 24 }}>Last 12 sessions — hover for details</p>
              {/* Chart mockup */}
              <svg width="100%" viewBox="0 0 400 140" style={{ display: "block" }}>
                <defs>
                  <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.gilt} stopOpacity="0.15" />
                    <stop offset="100%" stopColor={c.gilt} stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[57, 69, 81, 93].map((v, i) => (
                  <g key={v}>
                    <line x1="40" y1={20 + i * 30} x2="390" y2={20 + i * 30} stroke="rgba(240,237,232,0.04)" strokeWidth="1" />
                    <text x="32" y={24 + i * 30} fill={c.stone} fontSize="9" fontFamily={font.mono} textAnchor="end">{93 - i * 12}</text>
                  </g>
                ))}
                <path d="M50,105 L80,95 L110,88 L140,78 L170,72 L200,65 L230,55 L260,48 L290,45 L320,42 L350,48 L380,60"
                  fill="none" stroke={c.gilt} strokeWidth="2" />
                <path d="M50,105 L80,95 L110,88 L140,78 L170,72 L200,65 L230,55 L260,48 L290,45 L320,42 L350,48 L380,60 L380,130 L50,130 Z"
                  fill="url(#tg)" />
                {[50,80,110,140,170,200,230,260,290,320,350,380].map((x, i) => {
                  const ys = [105,95,88,78,72,65,55,48,45,42,48,60];
                  return <circle key={i} cx={x} cy={ys[i]} r="3" fill={c.obsidian} stroke={c.gilt} strokeWidth="1.5" />;
                })}
              </svg>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 8px 0" }}>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>Feb 1</span>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>Apr 2</span>
              </div>
            </div>

            {/* Skill Breakdown */}
            <div style={{ ...card, padding: "28px" }} {...cardLift}>
              {sectionTitle("Skill Breakdown")}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 2, background: c.gilt, borderRadius: 1 }} /><span style={{ fontFamily: font.ui, fontSize: 9, color: c.stone }}>Current</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 2, background: c.stone, borderRadius: 1, opacity: 0.5 }} /><span style={{ fontFamily: font.ui, fontSize: 9, color: c.stone }}>First session</span></div>
              </div>
              {/* Radar placeholder */}
              <svg width="100%" viewBox="0 0 200 180" style={{ display: "block", marginBottom: 12 }}>
                {(() => {
                  const cx = 100, cy = 85, r = 65;
                  const labels = ["Communication", "Strategic", "Leadership", "Impact", "STAR", "Stakeholder"];
                  const scores = [81, 86, 72, 65, 84, 77];
                  const pts = scores.map((s, i) => {
                    const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                    return { x: cx + (s / 100) * r * Math.cos(angle), y: cy + (s / 100) * r * Math.sin(angle) };
                  });
                  const poly = pts.map(p => `${p.x},${p.y}`).join(" ");
                  return (
                    <>
                      {[0.25, 0.5, 0.75, 1].map(s => (
                        <polygon key={s} points={Array.from({ length: 6 }, (_, i) => {
                          const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                          return `${cx + s * r * Math.cos(a)},${cy + s * r * Math.sin(a)}`;
                        }).join(" ")} fill="none" stroke="rgba(240,237,232,0.06)" strokeWidth="1" />
                      ))}
                      {labels.map((l, i) => {
                        const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                        const lx = cx + (r + 18) * Math.cos(a);
                        const ly = cy + (r + 18) * Math.sin(a);
                        return <text key={l} x={lx} y={ly} fill={c.stone} fontSize="7" fontFamily={font.ui} textAnchor="middle" dominantBaseline="middle">{l}</text>;
                      })}
                      <polygon points={poly} fill="rgba(201,169,110,0.08)" stroke={c.gilt} strokeWidth="1.5" />
                    </>
                  );
                })()}
              </svg>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {skills.map(sk => (
                  <div key={sk.name} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 6px", borderRadius: radius.sm }}>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, flex: 1 }}>{sk.name}</span>
                    <div style={{ width: 60, height: 3, background: "rgba(240,237,232,0.06)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${sk.score}%`, background: sk.color, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.ivory, width: 22, textAlign: "right" }}>{sk.score}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: c.sage, width: 24, textAlign: "right" }}>+{sk.score - sk.prev}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Recent Sessions | AI Insights (equal 2-col) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp["2xl"], marginBottom: sp["2xl"] }}>
            {/* Recent Sessions */}
            <div style={{ ...card, padding: "28px 32px" }} {...cardLift}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                {sectionTitle("Recent Sessions")}
                <button style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, background: "rgba(240,237,232,0.03)", border: "none", borderRadius: radius.sm, padding: "5px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  By date
                </button>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input readOnly placeholder="Search sessions..." style={{ width: "100%", padding: "8px 10px 8px 32px", fontFamily: font.ui, fontSize: 12, color: c.ivory, background: c.obsidian, border: `1px solid rgba(240,237,232,0.06)`, borderRadius: radius.sm, outline: "none", boxSizing: "border-box" }} />
                </div>
                {["All time", "30 days", "7 days"].map((r, i) => (
                  <button key={r} style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 500, padding: "6px 10px", borderRadius: radius.sm, cursor: "pointer", background: i === 0 ? "rgba(201,169,110,0.08)" : "transparent", border: "none", color: i === 0 ? c.gilt : c.stone }}>{r}</button>
                ))}
              </div>
              {[
                { type: "Behavioral", score: 75, change: +3, date: "Today", dur: "18 min" },
                { type: "Strategic", score: 82, change: +5, date: "Yesterday", dur: "22 min" },
                { type: "Case Study", score: 68, change: -2, date: "Apr 1", dur: "25 min" },
              ].map((s, i) => (
                <div key={i} style={{ padding: "14px 16px", borderRadius: radius.md, background: c.obsidian, marginBottom: 6, display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", border: `2px solid ${s.score >= 80 ? c.sage : s.score >= 70 ? c.gilt : c.ember}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 600, color: c.ivory, lineHeight: 1 }}>{s.score}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>{s.type}</span>
                      <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: s.change > 0 ? c.sage : c.ember }}>{s.change > 0 ? "+" : ""}{s.change}</span>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Senior UX Designer</span>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, display: "block" }}>{s.date}</span>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{s.dur}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* AI Insights / Weekly Goals */}
            <div style={{ ...card, overflow: "hidden" }} {...cardLift}>
              <div style={{ display: "flex", borderBottom: "1px solid rgba(240,237,232,0.04)" }}>
                {[["AI Insights", true], ["Weekly Goals", false]].map(([label, active]) => (
                  <button key={label as string} style={{
                    flex: 1, padding: "16px", fontFamily: font.ui, fontSize: 13,
                    fontWeight: active ? 600 : 400, color: active ? c.ivory : c.stone,
                    background: "transparent", border: "none", cursor: "pointer",
                    borderBottom: active ? `2px solid ${c.gilt}` : "2px solid transparent",
                  }}>
                    {label as string}
                    {!active && <span style={{ marginLeft: 6, fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.gilt, background: "rgba(201,169,110,0.08)", padding: "1px 6px", borderRadius: 4 }}>3</span>}
                  </button>
                ))}
              </div>
              <div style={{ padding: "22px 28px" }}>
                {[
                  { type: "strength", text: "Your communication scores have improved consistently over the last 5 sessions. Keep using the STAR framework." },
                  { type: "weakness", text: "Impact quantification remains your weakest area. Try adding specific metrics and percentages to your answers." },
                  { type: "tip", text: "Google interviews emphasize leadership presence — try a strategic session focused on cross-functional scenarios." },
                ].map((ins, i) => (
                  <div key={i} style={{ padding: "14px 16px", borderRadius: radius.sm, background: c.obsidian, borderLeft: `3px solid ${ins.type === "strength" ? c.sage : ins.type === "weakness" ? c.ember : c.gilt}`, marginBottom: i < 2 ? 12 : 0 }}>
                    <span style={{ fontFamily: font.ui, fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: ins.type === "strength" ? c.sage : ins.type === "weakness" ? c.ember : c.gilt, display: "block", marginBottom: 4 }}>
                      {ins.type === "strength" ? "Strength" : ins.type === "weakness" ? "Improve" : "Tip"}
                    </span>
                    <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.6, margin: 0 }}>{ins.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 3: Daily Challenge | Achievements */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp["2xl"] }}>
            {/* Daily Challenge */}
            <div style={{ ...card, padding: "24px 28px", boxShadow: "0 1px 3px rgba(0,0,0,0.24), 0 0 0 1px rgba(201,169,110,0.08)" }} {...cardLift}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                  {sectionTitle("Daily Challenge", 15)}
                </div>
                <span style={{ fontFamily: font.mono, fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: radius.pill, background: "rgba(201,169,110,0.08)", color: c.gilt, textTransform: "uppercase" }}>standard</span>
              </div>
              <p style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.chalk, marginBottom: 4 }}>Strategic Vision</p>
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, lineHeight: 1.6, marginBottom: 14 }}>Work on strategic thinking and roadmap questions</p>
              <button style={{
                fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.obsidian,
                background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, border: "none", borderRadius: radius.sm,
                padding: "10px 18px", cursor: "pointer", width: "100%",
                boxShadow: "0 2px 12px rgba(201,169,110,0.15)",
              }}>Start Challenge</button>
            </div>

            {/* Achievements */}
            <div style={{ ...card, padding: "24px 28px" }} {...cardLift}>
              {sectionTitle("Achievements")}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}>
                {badges.map(b => (
                  <div key={b.id} style={{ padding: "16px", borderRadius: radius.md, background: b.earned ? "rgba(201,169,110,0.03)" : c.obsidian, textAlign: "center", opacity: b.earned ? 1 : 0.45 }}>
                    <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}>{badgeIcons[b.icon](b.earned ? c.gilt : c.stone)}</div>
                    <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: b.earned ? c.ivory : c.stone, marginBottom: 2 }}>{b.label}</p>
                    <p style={{ fontFamily: font.ui, fontSize: 9, color: c.stone, lineHeight: 1.4, marginBottom: !b.earned ? 8 : 0 }}>{b.desc}</p>
                    {!b.earned && (
                      <div style={{ height: 3, background: "rgba(240,237,232,0.06)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${b.progress}%`, background: c.gilt, borderRadius: 2 }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
