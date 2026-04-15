import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { c, font } from "./tokens";
import { scoreLabel, scoreLabelColor, sessionTypes } from "./dashboardTypes";
import { useDashboard } from "./DashboardContext";
import { DataLoadingSkeleton } from "./dashboardComponents";
import { useDocTitle } from "./useDocTitle";

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

export default function DashboardSessions() {
  useDocTitle("Sessions");
  const sessionNav = useNavigate();
  const { recentSessions, handleStartSession, dataLoading } = useDashboard();
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "score">("date");
  const [showCount, setShowCount] = useState(20);

  if (dataLoading) return <DataLoadingSkeleton />;

  const sessions = recentSessions;
  const filtered = sessions
    .filter(s => filter === "All" || s.type === filter)
    .filter(s => {
      if (!search) return true;
      const q = search.toLowerCase();
      return s.type.toLowerCase().includes(q) || (s.topStrength || "").toLowerCase().includes(q) || (s.topWeakness || "").toLowerCase().includes(q);
    })
    .sort((a, b) => sortBy === "score" ? b.score - a.score : new Date(b.date).getTime() - new Date(a.date).getTime());
  const visible = filtered.slice(0, showCount);
  const hasMore = filtered.length > showCount;

  const exportCSV = () => {
    const header = "Date,Type,Role,Score,Change,Duration,Top Strength,Top Weakness\n";
    const rows = filtered.map(s =>
      [s.dateLabel, s.type, s.role, s.score, s.change, s.duration, s.topStrength, s.topWeakness]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hirestepx-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (sessions.length === 0) {
    return (
      <div style={{ margin: "0 auto", textAlign: "center", padding: "60px 20px" }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, margin: "0 auto 24px", background: "rgba(212,179,127,0.06)", border: `1px solid rgba(212,179,127,0.15)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
        </div>
        <h2 style={{ fontFamily: font.ui, fontSize: 22, fontWeight: 600, color: c.ivory, marginBottom: 8 }}>No sessions yet</h2>
        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6, marginBottom: 28 }}>
          Complete your first practice interview and it will show up here with detailed scores, feedback, and a full transcript.
        </p>
        <button onClick={handleStartSession} className="shimmer-btn"
          style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, padding: "12px 32px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}
          onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21" /></svg>
          Start Your First Session
        </button>
      </div>
    );
  }

  return (
    <div style={{ margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h2 style={{ fontFamily: font.ui, fontSize: 22, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Sessions</h2>
          <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>{sessions.length} session{sessions.length !== 1 ? "s" : ""} completed</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportCSV} title="Export sessions as CSV"
            style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, padding: "10px 16px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.stone, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.borderHover; e.currentTarget.style.color = c.chalk; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; }}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>
          <button onClick={handleStartSession} className="shimmer-btn"
            style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, padding: "10px 24px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New Session
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" placeholder="Search by type, strength, weakness..."
            value={search} onChange={(e) => { setSearch(e.target.value); setShowCount(20); }}
            style={{ width: "100%", padding: "9px 12px 9px 34px", fontFamily: font.ui, fontSize: 13, color: c.ivory, background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box" }}
            onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
            onBlur={(e) => e.currentTarget.style.borderColor = c.border}
          />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {sessionTypes.map(type => (
            <button key={type} onClick={() => { setFilter(type); setShowCount(20); }} aria-pressed={filter === type}
              style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, padding: "7px 14px", borderRadius: 100, cursor: "pointer", background: filter === type ? "rgba(212,179,127,0.1)" : "transparent", border: `1px solid ${filter === type ? c.gilt : c.border}`, color: filter === type ? c.gilt : c.stone, transition: "all 0.2s ease", outline: "none" }}>{type}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setSortBy("date")} aria-pressed={sortBy === "date"}
            style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, padding: "7px 12px", borderRadius: 100, cursor: "pointer", background: sortBy === "date" ? "rgba(212,179,127,0.1)" : "transparent", border: `1px solid ${sortBy === "date" ? c.gilt : c.border}`, color: sortBy === "date" ? c.gilt : c.stone, transition: "all 0.2s ease", outline: "none" }}>Recent</button>
          <button onClick={() => setSortBy("score")} aria-pressed={sortBy === "score"}
            style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, padding: "7px 12px", borderRadius: 100, cursor: "pointer", background: sortBy === "score" ? "rgba(212,179,127,0.1)" : "transparent", border: `1px solid ${sortBy === "score" ? c.gilt : c.border}`, color: sortBy === "score" ? c.gilt : c.stone, transition: "all 0.2s ease", outline: "none" }}>Top Score</button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, margin: "0 auto 16px", background: "rgba(212,179,127,0.06)", border: `1px solid rgba(212,179,127,0.15)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            </div>
            <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, marginBottom: 16 }}>
              {search ? `No sessions matching "${search}"` : "No sessions in this category yet."}
            </p>
            {(search || filter !== "All") && (
              <button onClick={() => { setSearch(""); setFilter("All"); }}
                style={{ fontFamily: font.ui, fontSize: 12, color: c.gilt, background: "none", border: "none", cursor: "pointer", marginBottom: 12, textDecoration: "underline" }}>
                Clear filters
              </button>
            )}
            <button onClick={handleStartSession}
              style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.gilt, background: "rgba(212,179,127,0.06)", border: `1px solid rgba(212,179,127,0.15)`, borderRadius: 8, padding: "10px 24px", cursor: "pointer" }}>
              Start a {filter !== "All" ? filter : ""} Session
            </button>
          </div>
        ) : (
          visible.map(session => (
            <button key={session.id}
              onClick={() => sessionNav(`/session/${session.id}`)}
              style={{ width: "100%", padding: "18px 20px", borderRadius: 14, textAlign: "left", background: c.graphite, border: `1px solid ${c.border}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 18, transition: "all 0.2s ease", outline: "none" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.borderHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; }}
            >
              <div style={{ width: 52, height: 52, flexShrink: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="52" height="52" viewBox="0 0 52 52" style={{ position: "absolute", transform: "rotate(-90deg)" }}>
                  <circle cx="26" cy="26" r="23" fill="none" stroke="rgba(245,242,237,0.06)" strokeWidth="2.5" />
                  <circle cx="26" cy="26" r="23" fill="none" stroke={scoreLabelColor(session.score)} strokeWidth="2.5"
                    strokeDasharray={`${(session.score / 100) * 2 * Math.PI * 23} ${2 * Math.PI * 23}`}
                    strokeLinecap="round" className="score-ring" />
                </svg>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 700, color: c.ivory, lineHeight: 1 }}>{session.score}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 8, color: scoreLabelColor(session.score), fontWeight: 600, marginTop: 1 }}>{scoreLabel(session.score)}</span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>{session.type}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.gilt, background: "rgba(212,179,127,0.08)", padding: "2px 8px", borderRadius: 4 }}>{session.role}</span>
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}><span style={{ color: c.sage, fontWeight: 500 }}>{session.topStrength}</span></span>
                  <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Improve: <span style={{ color: c.ember, fontWeight: 500 }}>{session.topWeakness}</span></span>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }} title={session.dateLabel}>
                <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 2 }}>{relativeTime(session.date)}</span>
                <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{session.duration}</span>
              </div>
              <div style={{ padding: "4px 10px", borderRadius: 10, flexShrink: 0, background: session.change > 0 ? "rgba(122,158,126,0.08)" : "rgba(196,112,90,0.08)", border: `1px solid ${session.change > 0 ? "rgba(122,158,126,0.15)" : "rgba(196,112,90,0.15)"}` }}>
                <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 600, color: session.change > 0 ? c.sage : c.ember }}>{session.change > 0 ? "+" : ""}{session.change}</span>
              </div>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          ))
        )}
        {hasMore && (
          <button onClick={() => setShowCount(s => s + 20)}
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: `1px solid ${c.border}`, background: "transparent", color: c.stone, fontFamily: font.ui, fontSize: 13, cursor: "pointer", transition: "background 0.15s", marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(245,242,237,0.04)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
            Show more ({filtered.length - showCount} remaining)
          </button>
        )}
      </div>
    </div>
  );
}
