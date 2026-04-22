"use client";
import { useState, useEffect, useCallback, useRef, memo } from "react";
import { c, font, radius } from "./tokens";

/* ─── Token-based auth ─── */
const TOKEN_KEY = "hirestepx_admin_token";

/* ─── Types ─── */

interface OverviewData {
  users: { total: number; today: number; thisWeek: number; activeLastWeek: number; tierBreakdown: Record<string, number> };
  sessions: { total: number; today: number; thisWeek: number; avgScore: number; perDay: Record<string, number> };
  revenue: { totalPaise: number; thisMonthPaise: number; paymentCount: number };
  llm: { tokensToday: number; fallbackRate: number; errorRate: number; totalCalls: number };
}

interface UserRow {
  id: string; name: string; email: string; tier: string; sessionsCount: number;
  lastActive: string | null; onboarded: boolean; joined: string; subscriptionEnd: string | null;
}

interface FinancialsData {
  totalRevenuePaise: number; revenueThisMonthPaise: number; totalPayments: number;
  byPlan: Record<string, number>; perDay: Record<string, number>;
  recent: Array<{ id: string; amount: number; currency: string; status: string; plan: string; date: string }>;
}

interface ServiceUsage {
  callsTotal: number; callsToday: number;
  errorsTotal: number; errorsToday: number;
  avgLatencyMs: number | null;
  tokensToday?: number; tokensTotal?: number;
  charsToday?: number; charsTotal?: number;
}

interface ServiceInfo {
  name: string; type: string; role: string; model: string; status: string;
  usage: ServiceUsage;
  limits: Record<string, number>;
  notes: string;
}

interface LLMData {
  totalCalls: number; totalTokens: number; todayTokens: number; fallbackRate: number; errorRate: number;
  byEndpoint: Record<string, { calls: number; tokens: number; avgLatency: number; errors: number }>;
  byModel: Record<string, { calls: number; tokens: number }>;
  tokensPerDay: Record<string, number>;
  recentErrors: Array<{ endpoint: string; model: string; error: string | null; date: string }>;
  services?: ServiceInfo[];
}

interface SessionsData {
  total: number; avgScore: number; avgDuration: number;
  scoreDistribution: Record<string, number>; byType: Record<string, number>;
  byDifficulty: Record<string, number>; avgSkillScores: Record<string, number>;
  recent: Array<{ id: string; userId: string; type: string; difficulty: string; score: number; duration: number; date: string }>;
}

interface FeedbackData {
  total: number; byRating: Record<string, number>;
  recent: Array<{ id: string; user_id: string; rating: string; comment: string; session_score: number; session_type: string; created_at: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface UserDetailData { profile: Record<string, any>; sessions: any[]; payments: any[]; llmUsage: any[]; feedback: any[] }

type Tab = "overview" | "users" | "financials" | "llm" | "sessions" | "feedback";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "📊" },
  { key: "users", label: "Users", icon: "👤" },
  { key: "financials", label: "Financials", icon: "💰" },
  { key: "llm", label: "AI / Services", icon: "🤖" },
  { key: "sessions", label: "Sessions", icon: "🎯" },
  { key: "feedback", label: "Feedback", icon: "💬" },
];

/* ─── Cache (per tab, 5 min TTL) ─── */
const CACHE_TTL = 5 * 60 * 1000;

interface CacheEntry { data: unknown; ts: number }

/* ─── Helpers ─── */

function paise(amount: number): string {
  return "₹" + (amount / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function timeAgo(d: string | null): string {
  if (!d) return "Never";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(d);
}

/* ─── Styles ─── */

const card = {
  background: c.graphite,
  border: `1px solid ${c.border}`,
  borderRadius: radius.lg,
  padding: "20px 24px",
} as const;

const statCard = {
  ...card,
  flex: "1 1 200px",
  minWidth: 180,
} as const;

const labelStyle = {
  fontSize: 11,
  fontWeight: 600 as const,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  color: c.stone,
  margin: "0 0 6px",
} as const;

const bigNum = {
  fontSize: 28,
  fontWeight: 700 as const,
  color: c.ivory,
  fontFamily: font.mono,
  margin: 0,
  lineHeight: 1.2,
} as const;

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontSize: 13,
} as const;

const thStyle = {
  textAlign: "left" as const,
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 600 as const,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: c.stone,
  borderBottom: `1px solid ${c.border}`,
} as const;

const tdStyle = {
  padding: "10px 12px",
  color: c.chalk,
  borderBottom: `1px solid ${c.borderSubtle}`,
} as const;

/* ─── Mini Bar Chart (memoized) ─── */

const MiniBarChart = memo(function MiniBarChart({ data, color = c.gilt, height = 80 }: { data: Record<string, number>; color?: string; height?: number }) {
  const entries = Object.entries(data);
  const values = entries.map(([, v]) => v);
  const max = Math.max(...values, 1);
  const barW = Math.max(4, Math.floor(100 / values.length) - 1);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height, width: "100%" }}>
      {entries.map(([key, v], i) => (
        <div
          key={i}
          title={`${key}: ${v.toLocaleString()}`}
          style={{
            flex: 1,
            maxWidth: barW + "%",
            height: `${Math.max(2, (v / max) * 100)}%`,
            background: color,
            borderRadius: "3px 3px 0 0",
            opacity: 0.8,
            transition: "height 0.3s ease",
          }}
        />
      ))}
    </div>
  );
});

/* ─── Tier Badge ─── */

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = { free: c.stone, starter: c.slate, pro: c.gilt, team: c.sage };
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 100,
      fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
      background: `${colors[tier] || c.stone}22`, color: colors[tier] || c.stone,
      border: `1px solid ${colors[tier] || c.stone}33`,
    }}>
      {tier}
    </span>
  );
}

/* ─── Status Dot ─── */

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: ok ? c.sage : c.ember, marginRight: 6,
    }} />
  );
}

/* ─── Service Status Badge ─── */

function ServiceStatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    healthy: { bg: `${c.sage}22`, text: c.sage },
    degraded: { bg: `${c.gilt}22`, text: c.gilt },
    down: { bg: `${c.ember}22`, text: c.ember },
  };
  const col = colors[status] || colors.healthy;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 100,
      fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
      background: col.bg, color: col.text, border: `1px solid ${col.text}33`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: col.text }} />
      {status}
    </span>
  );
}

/* ─── Empty State ─── */

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ ...card, textAlign: "center", padding: 60 }}>
      <p style={{ fontSize: 16, color: c.stone, margin: 0 }}>{message}</p>
    </div>
  );
}

/* ─── Refresh Button ─── */

function RefreshButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title="Refresh data"
      style={{
        background: "none", border: `1px solid ${c.border}`, borderRadius: radius.md,
        color: c.stone, fontSize: 12, padding: "5px 12px", cursor: loading ? "not-allowed" : "pointer",
        fontFamily: font.ui, display: "inline-flex", alignItems: "center", gap: 6,
        opacity: loading ? 0.5 : 1,
      }}
    >
      <span style={{ display: "inline-block", animation: loading ? "spin 0.8s linear infinite" : "none" }}>↻</span>
      Refresh
    </button>
  );
}

/* ─── Main Component ─── */

export default function AdminDashboard() {
  /* ── Auth state (token-based) ── */
  const [authed, setAuthed] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  // Client-side cache
  const cache = useRef<Map<string, CacheEntry>>(new Map());

  function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  // Check stored token on mount
  useEffect(() => {
    const token = getToken();
    if (token) {
      fetch("/api/admin-data", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ section: "overview" }),
      }).then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          // Store refreshed token
          if (data._token) setToken(data._token);
          setAuthed(true);
          // Cache the overview data we just got
          const { _token, ...rest } = data;
          cache.current.set("overview", { data: rest, ts: Date.now() });
        } else {
          clearToken();
        }
        setAuthLoading(false);
      }).catch(() => {
        clearToken();
        setAuthLoading(false);
      });
    } else {
      setAuthLoading(false);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginBusy(true);
    try {
      const res = await fetch("/api/admin-data", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": loginPassword },
        body: JSON.stringify({ section: "overview" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data._token) setToken(data._token);
        setAuthed(true);
        // Cache overview
        const { _token, ...rest } = data;
        cache.current.set("overview", { data: rest, ts: Date.now() });
        setLoginPassword(""); // Clear password from memory
      } else if (res.status === 429) {
        setLoginError("Too many attempts. Try again in 15 minutes.");
      } else {
        setLoginError("Wrong password");
      }
    } catch {
      setLoginError("Connection failed. Check your network.");
    }
    setLoginBusy(false);
  };

  const handleLogout = useCallback(() => {
    setAuthed(false);
    clearToken();
    cache.current.clear();
  }, []);

  /* ── Dashboard state ── */
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userDetail, setUserDetail] = useState<UserDetailData | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [financials, setFinancials] = useState<FinancialsData | null>(null);
  const [llm, setLlm] = useState<LLMData | null>(null);
  const [sessions, setSessions] = useState<SessionsData | null>(null);
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);

  const fetchSection = useCallback(async (section: string, extra?: Record<string, unknown>, skipCache = false): Promise<unknown> => {
    if (!authed) return null;

    // Check cache (skip for user-specific or search queries)
    const cacheKey = section + (extra ? JSON.stringify(extra) : "");
    if (!skipCache) {
      const cached = cache.current.get(cacheKey);
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return cached.data;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["x-admin-token"] = token;

      const res = await fetch("/api/admin-data", {
        method: "POST",
        headers,
        body: JSON.stringify({ section, ...extra }),
      });

      if (res.status === 401) {
        handleLogout();
        setError("Session expired. Please sign in again.");
        setLoading(false);
        return null;
      }
      if (res.status === 429) {
        setError("Rate limited. Please wait a few minutes.");
        setLoading(false);
        return null;
      }
      if (!res.ok) {
        throw new Error(`Server error (${res.status})`);
      }

      const data = await res.json();

      // Store refreshed token
      if (data._token) setToken(data._token);

      // Strip _token from data and cache
      const { _token, ...rest } = data;
      cache.current.set(cacheKey, { data: rest, ts: Date.now() });

      setLoading(false);
      return rest;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load data";
      setError(msg);
      setLoading(false);
      return null;
    }
  }, [authed, handleLogout]);

  // Load data when tab changes
  useEffect(() => {
    if (!authed) return;
    (async () => {
      switch (tab) {
        case "overview": {
          const d = await fetchSection("overview") as OverviewData | null;
          if (d) setOverview(d);
          break;
        }
        case "users": {
          const d = await fetchSection("users", { search: userSearch }) as { users: UserRow[] } | null;
          if (d) setUsers(d.users || []);
          break;
        }
        case "financials": {
          const d = await fetchSection("financials") as FinancialsData | null;
          if (d) setFinancials(d);
          break;
        }
        case "llm": {
          const d = await fetchSection("llm") as LLMData | null;
          if (d) setLlm(d);
          break;
        }
        case "sessions": {
          const d = await fetchSection("sessions") as SessionsData | null;
          if (d) setSessions(d);
          break;
        }
        case "feedback": {
          const d = await fetchSection("feedback") as FeedbackData | null;
          if (d) setFeedback(d);
          break;
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authed]);

  // Search users (debounced)
  useEffect(() => {
    if (tab !== "users" || !authed) return;
    const t = setTimeout(async () => {
      const d = await fetchSection("users", { search: userSearch }, true) as { users: UserRow[] } | null;
      if (d) setUsers(d.users || []);
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSearch]);

  // Load user detail
  useEffect(() => {
    if (!selectedUserId || !authed) return;
    (async () => {
      const d = await fetchSection("user-detail", { userId: selectedUserId }, true) as UserDetailData | null;
      if (d) setUserDetail(d);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  // Refresh handler for current tab
  const refreshTab = useCallback(async () => {
    switch (tab) {
      case "overview": {
        const d = await fetchSection("overview", undefined, true) as OverviewData | null;
        if (d) setOverview(d);
        break;
      }
      case "users": {
        const d = await fetchSection("users", { search: userSearch }, true) as { users: UserRow[] } | null;
        if (d) setUsers(d.users || []);
        break;
      }
      case "financials": {
        const d = await fetchSection("financials", undefined, true) as FinancialsData | null;
        if (d) setFinancials(d);
        break;
      }
      case "llm": {
        const d = await fetchSection("llm", undefined, true) as LLMData | null;
        if (d) setLlm(d);
        break;
      }
      case "sessions": {
        const d = await fetchSection("sessions", undefined, true) as SessionsData | null;
        if (d) setSessions(d);
        break;
      }
      case "feedback": {
        const d = await fetchSection("feedback", undefined, true) as FeedbackData | null;
        if (d) setFeedback(d);
        break;
      }
    }
  }, [tab, fetchSection, userSearch]);

  /* ─── Render Helpers ─── */

  const renderOverview = () => {
    if (!overview) return <EmptyState message="No overview data available" />;
    const { users: u, sessions: s, revenue: r, llm: l } = overview;

    return (
      <div>
        {/* Stat Cards */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <div style={statCard}>
            <p style={labelStyle}>Total Users</p>
            <p style={bigNum}>{formatNum(u.total)}</p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: c.sage }}>+{u.thisWeek} this week</p>
          </div>
          <div style={statCard}>
            <p style={labelStyle}>Active (7d)</p>
            <p style={bigNum}>{formatNum(u.activeLastWeek)}</p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: c.stone }}>{u.total > 0 ? Math.round((u.activeLastWeek / u.total) * 100) : 0}% of total</p>
          </div>
          <div style={statCard}>
            <p style={labelStyle}>Total Sessions</p>
            <p style={bigNum}>{formatNum(s.total)}</p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: c.sage }}>+{s.thisWeek} this week</p>
          </div>
          <div style={statCard}>
            <p style={labelStyle}>Avg Score</p>
            <p style={bigNum}>{s.avgScore}<span style={{ fontSize: 14, color: c.stone }}>/100</span></p>
          </div>
          <div style={statCard}>
            <p style={labelStyle}>Revenue (Total)</p>
            <p style={bigNum}>{paise(r.totalPaise)}</p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: c.sage }}>{paise(r.thisMonthPaise)} this month</p>
          </div>
          <div style={statCard}>
            <p style={labelStyle}>LLM Calls</p>
            <p style={bigNum}>{formatNum(l.totalCalls)}</p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: l.errorRate > 5 ? c.ember : c.stone }}>
              {l.fallbackRate}% fallback · {l.errorRate}% errors
            </p>
          </div>
        </div>

        {/* Tier Breakdown */}
        <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
          <div style={{ ...card, flex: 1, minWidth: 280 }}>
            <p style={{ ...labelStyle, marginBottom: 16 }}>Subscription Tiers</p>
            {Object.entries(u.tierBreakdown).length === 0
              ? <p style={{ color: c.stone, fontSize: 13 }}>No tier data</p>
              : Object.entries(u.tierBreakdown).map(([tier, count]) => (
                <div key={tier} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${c.borderSubtle}` }}>
                  <TierBadge tier={tier} />
                  <span style={{ fontFamily: font.mono, color: c.ivory, fontSize: 14, fontWeight: 600 }}>{count}</span>
                </div>
              ))
            }
          </div>
          <div style={{ ...card, flex: 2, minWidth: 380 }}>
            <p style={{ ...labelStyle, marginBottom: 12 }}>Sessions / Day (30d)</p>
            {Object.keys(s.perDay).length > 0
              ? <>
                  <MiniBarChart data={s.perDay} height={100} />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: c.stone }}>
                    <span>{Object.keys(s.perDay)[0]}</span>
                    <span>Today</span>
                  </div>
                </>
              : <p style={{ color: c.stone, fontSize: 13 }}>No session data yet</p>
            }
          </div>
        </div>
      </div>
    );
  };

  const renderUsers = () => {
    if (selectedUserId && userDetail) return renderUserDetail();
    return (
      <div>
        {/* Search */}
        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            style={{
              width: "100%", maxWidth: 400, padding: "10px 16px",
              background: c.onyx, border: `1px solid ${c.border}`, borderRadius: radius.md,
              color: c.ivory, fontSize: 14, fontFamily: font.ui, outline: "none",
            }}
          />
        </div>

        {/* Table */}
        <div style={{ ...card, padding: 0, overflow: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>User</th>
                <th style={thStyle}>Tier</th>
                <th style={thStyle}>Sessions</th>
                <th style={thStyle}>Last Active</th>
                <th style={thStyle}>Onboarded</th>
                <th style={thStyle}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr
                  key={u.id}
                  onClick={() => { setSelectedUserId(u.id); setUserDetail(null); }}
                  style={{ cursor: "pointer", transition: "background 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = c.onyx; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500, color: c.ivory }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: c.stone }}>{u.email}</div>
                  </td>
                  <td style={tdStyle}><TierBadge tier={u.tier} /></td>
                  <td style={{ ...tdStyle, fontFamily: font.mono }}>{u.sessionsCount}</td>
                  <td style={{ ...tdStyle, fontSize: 12 }}>{timeAgo(u.lastActive)}</td>
                  <td style={tdStyle}><StatusDot ok={u.onboarded} />{u.onboarded ? "Yes" : "No"}</td>
                  <td style={{ ...tdStyle, fontSize: 12 }}>{formatDate(u.joined)}</td>
                </tr>
              ))}
              {users.length === 0 && !loading && (
                <tr><td colSpan={6} style={{ ...tdStyle, textAlign: "center", padding: 40, color: c.stone }}>
                  {userSearch ? "No users match your search" : "No users found"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderUserDetail = () => {
    if (!userDetail?.profile) return <EmptyState message="User not found" />;
    const p = userDetail.profile;

    return (
      <div>
        <button
          onClick={() => { setSelectedUserId(null); setUserDetail(null); }}
          style={{
            background: "none", border: "none", color: c.gilt, cursor: "pointer",
            fontSize: 13, fontFamily: font.ui, marginBottom: 16, padding: 0,
          }}
        >
          &larr; Back to users
        </button>

        {/* Profile Header */}
        <div style={{ ...card, marginBottom: 20, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 700, color: c.obsidian,
          }}>
            {(p.name || "?")[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, color: c.ivory, fontSize: 18 }}>{p.name || "—"}</h3>
            <p style={{ margin: "2px 0", color: c.stone, fontSize: 13 }}>{p.email}</p>
            <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              <TierBadge tier={p.subscription_tier || "free"} />
              {p.target_role && <span style={{ fontSize: 12, color: c.chalk }}>Target: {p.target_role}</span>}
              {p.experience_level && <span style={{ fontSize: 12, color: c.stone }}>{p.experience_level}</span>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, fontSize: 11, color: c.stone }}>Joined {formatDate(p.created_at)}</p>
            {p.subscription_end && <p style={{ margin: "2px 0 0", fontSize: 11, color: c.stone }}>Sub ends {formatDate(p.subscription_end)}</p>}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={statCard}>
            <p style={labelStyle}>Sessions</p>
            <p style={bigNum}>{userDetail.sessions.length}</p>
          </div>
          <div style={statCard}>
            <p style={labelStyle}>Payments</p>
            <p style={bigNum}>{userDetail.payments.length}</p>
          </div>
          <div style={statCard}>
            <p style={labelStyle}>LLM Calls</p>
            <p style={bigNum}>{userDetail.llmUsage.length}</p>
          </div>
          <div style={statCard}>
            <p style={labelStyle}>Feedback</p>
            <p style={bigNum}>{userDetail.feedback.length}</p>
          </div>
        </div>

        {/* Sessions Table */}
        {userDetail.sessions.length > 0 && (
          <div style={{ ...card, padding: 0, marginBottom: 20, overflow: "auto" }}>
            <div style={{ padding: "16px 24px 8px" }}>
              <p style={labelStyle}>Session History</p>
            </div>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Difficulty</th>
                  <th style={thStyle}>Score</th>
                  <th style={thStyle}>Duration</th>
                  <th style={thStyle}>Date</th>
                </tr>
              </thead>
              <tbody>
                {userDetail.sessions.slice(0, 20).map((s: Record<string, unknown>, i: number) => (
                  <tr key={i}>
                    <td style={tdStyle}>{String(s.type || "—")}</td>
                    <td style={tdStyle}>{String(s.difficulty || "—")}</td>
                    <td style={{ ...tdStyle, fontFamily: font.mono, fontWeight: 600, color: (s.score as number) >= 65 ? c.sage : (s.score as number) >= 40 ? c.gilt : c.ember }}>
                      {String(s.score ?? "—")}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: font.mono }}>{s.duration ? `${Math.round(s.duration as number / 60)}m` : "—"}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{formatDateTime(s.created_at as string)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Payments Table */}
        {userDetail.payments.length > 0 && (
          <div style={{ ...card, padding: 0, overflow: "auto" }}>
            <div style={{ padding: "16px 24px 8px" }}>
              <p style={labelStyle}>Payment History</p>
            </div>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Plan</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Date</th>
                </tr>
              </thead>
              <tbody>
                {userDetail.payments.map((p: Record<string, unknown>, i: number) => (
                  <tr key={i}>
                    <td style={{ ...tdStyle, fontFamily: font.mono, fontWeight: 600 }}>{paise(p.amount as number)}</td>
                    <td style={tdStyle}>{String(p.plan || p.tier || "—")}</td>
                    <td style={tdStyle}>
                      <StatusDot ok={p.status === "captured" || p.status === "paid"} />
                      {String(p.status)}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{formatDateTime(p.created_at as string)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty states for user detail sections */}
        {userDetail.sessions.length === 0 && userDetail.payments.length === 0 && (
          <div style={{ ...card, textAlign: "center", padding: 40 }}>
            <p style={{ color: c.stone, fontSize: 13, margin: 0 }}>No sessions or payments for this user yet.</p>
          </div>
        )}
      </div>
    );
  };

  const renderFinancials = () => {
    if (!financials) return <EmptyState message="No financial data available" />;

    return (
      <div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <div style={statCard}>
            <p style={labelStyle}>Total Revenue</p>
            <p style={bigNum}>{paise(financials.totalRevenuePaise)}</p>
          </div>
          <div style={statCard}>
            <p style={labelStyle}>This Month</p>
            <p style={bigNum}>{paise(financials.revenueThisMonthPaise)}</p>
          </div>
          <div style={statCard}>
            <p style={labelStyle}>Payments</p>
            <p style={bigNum}>{financials.totalPayments}</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
          <div style={{ ...card, flex: 1, minWidth: 250 }}>
            <p style={{ ...labelStyle, marginBottom: 16 }}>Revenue by Plan</p>
            {Object.keys(financials.byPlan).length === 0
              ? <p style={{ color: c.stone, fontSize: 13 }}>No plan data yet</p>
              : Object.entries(financials.byPlan).sort(([, a], [, b]) => b - a).map(([plan, amount]) => (
                <div key={plan} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${c.borderSubtle}` }}>
                  <span style={{ color: c.chalk, fontSize: 13 }}>{plan}</span>
                  <span style={{ fontFamily: font.mono, color: c.gilt, fontWeight: 600 }}>{paise(amount)}</span>
                </div>
              ))
            }
          </div>

          <div style={{ ...card, flex: 2, minWidth: 380 }}>
            <p style={{ ...labelStyle, marginBottom: 12 }}>Revenue / Day (30d)</p>
            <MiniBarChart data={financials.perDay} color={c.sage} height={100} />
          </div>
        </div>

        {financials.recent.length > 0 ? (
          <div style={{ ...card, padding: 0, overflow: "auto" }}>
            <div style={{ padding: "16px 24px 8px" }}>
              <p style={labelStyle}>Recent Payments</p>
            </div>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Plan</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Date</th>
                </tr>
              </thead>
              <tbody>
                {financials.recent.map((p, i) => (
                  <tr key={i}>
                    <td style={{ ...tdStyle, fontFamily: font.mono, fontWeight: 600 }}>{paise(p.amount)}</td>
                    <td style={tdStyle}>{p.plan}</td>
                    <td style={tdStyle}><StatusDot ok={p.status === "captured" || p.status === "paid"} />{p.status}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{formatDateTime(p.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="No payments recorded yet" />
        )}
      </div>
    );
  };

  /** Compute "used today" / "daily limit" for a service and return progress bar data */
  function getUsageBar(svc: ServiceInfo): { usedToday: number; limit: number; label: string; unit: string } | null {
    const lim = svc.limits;
    // LLMs: requests per day
    if (lim.requestsPerDay) {
      return { usedToday: svc.usage.callsToday, limit: lim.requestsPerDay, label: "Requests", unit: "req" };
    }
    // Resend: emails per day
    if (lim.freeEmailsPerDay) {
      return { usedToday: svc.usage.callsToday, limit: lim.freeEmailsPerDay, label: "Emails", unit: "emails" };
    }
    // Sarvam: requests per day
    if (lim.freeRequestsPerDay) {
      return { usedToday: svc.usage.callsToday, limit: lim.freeRequestsPerDay, label: "Requests", unit: "req" };
    }
    // Upstash: commands per day
    if (lim.freeCommandsPerDay) {
      return { usedToday: svc.usage.callsToday, limit: lim.freeCommandsPerDay, label: "Commands", unit: "cmds" };
    }
    // Azure TTS: chars per month (show daily estimate)
    if (lim.freeCharsPerMonth) {
      const dailyBudget = Math.round(lim.freeCharsPerMonth / 30);
      return { usedToday: svc.usage.charsToday || 0, limit: dailyBudget, label: "Chars", unit: "chars" };
    }
    return null;
  }

  const renderServices = () => {
    if (!llm?.services || llm.services.length === 0) return null;

    const typeOrder = ["LLM", "TTS", "STT", "Email", "Cache / Rate Limiting"];
    const grouped: Record<string, ServiceInfo[]> = {};
    for (const s of llm.services) {
      if (!grouped[s.type]) grouped[s.type] = [];
      grouped[s.type].push(s);
    }

    return (
      <div style={{ marginBottom: 24 }}>
        <p style={{ ...labelStyle, fontSize: 13, marginBottom: 20, color: c.ivory }}>Service Health &amp; Usage</p>

        {typeOrder.filter(t => grouped[t]).map(type => (
          <div key={type} style={{ marginBottom: 20 }}>
            <p style={{ ...labelStyle, marginBottom: 12, color: c.gilt }}>{type}</p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {grouped[type].map(svc => {
                const bar = getUsageBar(svc);
                const pct = bar ? Math.min(100, (bar.usedToday / bar.limit) * 100) : 0;
                const barColor = pct > 90 ? c.ember : pct > 70 ? c.gilt : c.sage;

                return (
                <div key={svc.name} style={{ ...card, flex: "1 1 320px", minWidth: 300, maxWidth: 520 }}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: c.ivory }}>{svc.name}</span>
                        <span style={{
                          fontSize: 9, padding: "2px 7px", borderRadius: 100,
                          background: svc.role === "Primary" ? `${c.sage}22` : `${c.stone}18`,
                          color: svc.role === "Primary" ? c.sage : c.stone,
                          fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
                        }}>{svc.role}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 11, color: c.stone, fontFamily: font.mono }}>{svc.model}</p>
                    </div>
                    <ServiceStatusBadge status={svc.status} />
                  </div>

                  {/* Usage Today / Available Today bar */}
                  {bar && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: c.chalk }}>
                          <span style={{ fontFamily: font.mono, fontWeight: 600, color: c.ivory }}>{formatNum(bar.usedToday)}</span>
                          <span style={{ color: c.stone }}> / {formatNum(bar.limit)} {bar.unit} today</span>
                        </span>
                        <span style={{ fontSize: 11, fontFamily: font.mono, color: barColor, fontWeight: 600 }}>
                          {formatNum(Math.max(0, bar.limit - bar.usedToday))} left
                        </span>
                      </div>
                      <div style={{ height: 8, background: c.onyx, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", width: `${pct}%`, background: barColor, borderRadius: 4,
                          transition: "width 0.3s ease", minWidth: bar.usedToday > 0 ? 4 : 0,
                        }} />
                      </div>
                    </div>
                  )}

                  {/* Usage metrics grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                    <div>
                      <p style={{ ...labelStyle, fontSize: 9 }}>Total Calls</p>
                      <p style={{ margin: 0, fontFamily: font.mono, color: c.ivory, fontSize: 14, fontWeight: 600 }}>{formatNum(svc.usage.callsTotal)}</p>
                    </div>
                    <div>
                      <p style={{ ...labelStyle, fontSize: 9 }}>Today</p>
                      <p style={{ margin: 0, fontFamily: font.mono, color: c.ivory, fontSize: 14, fontWeight: 600 }}>{formatNum(svc.usage.callsToday)}</p>
                    </div>
                    <div>
                      <p style={{ ...labelStyle, fontSize: 9 }}>Errors</p>
                      <p style={{ margin: 0, fontFamily: font.mono, color: svc.usage.errorsToday > 0 ? c.ember : c.stone, fontSize: 14, fontWeight: 600 }}>
                        {svc.usage.errorsToday}
                        {svc.usage.errorsTotal > 0 && <span style={{ fontSize: 10, color: c.stone }}> ({svc.usage.errorsTotal})</span>}
                      </p>
                    </div>
                    {svc.usage.tokensToday != null && svc.usage.tokensToday > 0 && (
                      <div>
                        <p style={{ ...labelStyle, fontSize: 9 }}>Tokens Today</p>
                        <p style={{ margin: 0, fontFamily: font.mono, color: c.ivory, fontSize: 14, fontWeight: 600 }}>{formatNum(svc.usage.tokensToday)}</p>
                      </div>
                    )}
                    {svc.usage.charsToday != null && svc.usage.charsToday > 0 && (
                      <div>
                        <p style={{ ...labelStyle, fontSize: 9 }}>Chars Today</p>
                        <p style={{ margin: 0, fontFamily: font.mono, color: c.ivory, fontSize: 14, fontWeight: 600 }}>{formatNum(svc.usage.charsToday)}</p>
                      </div>
                    )}
                    {svc.usage.avgLatencyMs != null && svc.usage.avgLatencyMs > 0 && (
                      <div>
                        <p style={{ ...labelStyle, fontSize: 9 }}>Avg Latency</p>
                        <p style={{ margin: 0, fontFamily: font.mono, color: c.ivory, fontSize: 14, fontWeight: 600 }}>{svc.usage.avgLatencyMs}ms</p>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <p style={{ margin: 0, fontSize: 11, color: c.stone, lineHeight: 1.5 }}>{svc.notes}</p>
                </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderLLM = () => {
    if (!llm) return <EmptyState message="No AI/LLM data available" />;

    return (
      <div>
        {/* Services section at top */}
        {renderServices()}

        {/* Divider */}
        {llm.services && llm.services.length > 0 && (
          <div style={{ borderBottom: `1px solid ${c.border}`, marginBottom: 24 }} />
        )}

        <p style={{ ...labelStyle, fontSize: 13, marginBottom: 16, color: c.ivory }}>LLM Usage Analytics</p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <div style={statCard}>
            <p style={labelStyle}>Total API Calls</p>
            <p style={bigNum}>{formatNum(llm.totalCalls)}</p>
          </div>
          <div style={statCard}>
            <p style={labelStyle}>Total Tokens</p>
            <p style={bigNum}>{formatNum(llm.totalTokens)}</p>
          </div>
          <div style={statCard}>
            <p style={labelStyle}>Today Tokens</p>
            <p style={bigNum}>{formatNum(llm.todayTokens)}</p>
          </div>
          <div style={statCard}>
            <p style={labelStyle}>Fallback Rate</p>
            <p style={{ ...bigNum, color: llm.fallbackRate > 10 ? c.ember : c.sage }}>{llm.fallbackRate}%</p>
          </div>
          <div style={statCard}>
            <p style={labelStyle}>Error Rate</p>
            <p style={{ ...bigNum, color: llm.errorRate > 5 ? c.ember : c.sage }}>{llm.errorRate}%</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
          {/* By Endpoint */}
          <div style={{ ...card, flex: 1, minWidth: 300 }}>
            <p style={{ ...labelStyle, marginBottom: 16 }}>By Endpoint</p>
            {Object.keys(llm.byEndpoint).length === 0
              ? <p style={{ color: c.stone, fontSize: 13 }}>No endpoint data</p>
              : <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Endpoint</th>
                      <th style={thStyle}>Calls</th>
                      <th style={thStyle}>Tokens</th>
                      <th style={thStyle}>Avg Latency</th>
                      <th style={thStyle}>Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(llm.byEndpoint).sort(([, a], [, b]) => b.calls - a.calls).map(([ep, d]) => (
                      <tr key={ep}>
                        <td style={{ ...tdStyle, fontFamily: font.mono, fontSize: 12 }}>{ep}</td>
                        <td style={{ ...tdStyle, fontFamily: font.mono }}>{d.calls}</td>
                        <td style={{ ...tdStyle, fontFamily: font.mono }}>{formatNum(d.tokens)}</td>
                        <td style={{ ...tdStyle, fontFamily: font.mono }}>{d.avgLatency}ms</td>
                        <td style={{ ...tdStyle, fontFamily: font.mono, color: d.errors > 0 ? c.ember : c.stone }}>{d.errors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            }
          </div>

          {/* By Model */}
          <div style={{ ...card, flex: 0.6, minWidth: 220 }}>
            <p style={{ ...labelStyle, marginBottom: 16 }}>By Model</p>
            {Object.keys(llm.byModel).length === 0
              ? <p style={{ color: c.stone, fontSize: 13 }}>No model data</p>
              : Object.entries(llm.byModel).sort(([, a], [, b]) => b.calls - a.calls).map(([model, d]) => (
                <div key={model} style={{ padding: "8px 0", borderBottom: `1px solid ${c.borderSubtle}` }}>
                  <div style={{ fontFamily: font.mono, fontSize: 12, color: c.ivory, marginBottom: 2 }}>{model}</div>
                  <div style={{ fontSize: 11, color: c.stone }}>{d.calls} calls · {formatNum(d.tokens)} tokens</div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Tokens chart */}
        <div style={{ ...card, marginBottom: 24 }}>
          <p style={{ ...labelStyle, marginBottom: 12 }}>Tokens / Day (30d)</p>
          <MiniBarChart data={llm.tokensPerDay} color={c.slate} height={100} />
        </div>

        {/* Recent errors */}
        {llm.recentErrors.length > 0 && (
          <div style={{ ...card, padding: 0, overflow: "auto" }}>
            <div style={{ padding: "16px 24px 8px" }}>
              <p style={{ ...labelStyle, color: c.ember }}>Recent Errors</p>
            </div>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Endpoint</th>
                  <th style={thStyle}>Model</th>
                  <th style={thStyle}>Error</th>
                  <th style={thStyle}>Time</th>
                </tr>
              </thead>
              <tbody>
                {llm.recentErrors.map((e, i) => (
                  <tr key={i}>
                    <td style={{ ...tdStyle, fontFamily: font.mono, fontSize: 12 }}>{e.endpoint}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{e.model}</td>
                    <td style={{ ...tdStyle, fontSize: 11, color: c.ember, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{e.error || "—"}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{formatDateTime(e.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderSessions = () => {
    if (!sessions) return <EmptyState message="No session data available" />;

    return (
      <div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <div style={statCard}>
            <p style={labelStyle}>Total Sessions</p>
            <p style={bigNum}>{formatNum(sessions.total)}</p>
          </div>
          <div style={statCard}>
            <p style={labelStyle}>Avg Score</p>
            <p style={bigNum}>{sessions.avgScore}<span style={{ fontSize: 14, color: c.stone }}>/100</span></p>
          </div>
          <div style={statCard}>
            <p style={labelStyle}>Avg Duration</p>
            <p style={bigNum}>{Math.round(sessions.avgDuration / 60)}<span style={{ fontSize: 14, color: c.stone }}>min</span></p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
          {/* Score Distribution */}
          <div style={{ ...card, flex: 1, minWidth: 280 }}>
            <p style={{ ...labelStyle, marginBottom: 16 }}>Score Distribution</p>
            {Object.entries(sessions.scoreDistribution).map(([range, count]) => (
              <div key={range} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ width: 50, fontSize: 11, color: c.stone, fontFamily: font.mono }}>{range}</span>
                <div style={{ flex: 1, height: 12, background: c.onyx, borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${sessions.total > 0 ? (count / sessions.total) * 100 : 0}%`, background: c.gilt, borderRadius: 6, minWidth: count > 0 ? 4 : 0 }} />
                </div>
                <span style={{ width: 30, fontSize: 11, color: c.stone, fontFamily: font.mono, textAlign: "right" }}>{count}</span>
              </div>
            ))}
          </div>

          {/* By Type + Difficulty */}
          <div style={{ ...card, flex: 0.6, minWidth: 220 }}>
            <p style={{ ...labelStyle, marginBottom: 16 }}>By Type</p>
            {Object.keys(sessions.byType).length === 0
              ? <p style={{ color: c.stone, fontSize: 13 }}>No type data</p>
              : Object.entries(sessions.byType).sort(([, a], [, b]) => b - a).map(([type, count]) => (
                <div key={type} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${c.borderSubtle}` }}>
                  <span style={{ color: c.chalk, fontSize: 13 }}>{type}</span>
                  <span style={{ fontFamily: font.mono, color: c.ivory, fontSize: 13 }}>{count}</span>
                </div>
              ))
            }
            <p style={{ ...labelStyle, marginTop: 20, marginBottom: 12 }}>By Difficulty</p>
            {Object.keys(sessions.byDifficulty).length === 0
              ? <p style={{ color: c.stone, fontSize: 13 }}>No difficulty data</p>
              : Object.entries(sessions.byDifficulty).sort(([, a], [, b]) => b - a).map(([diff, count]) => (
                <div key={diff} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${c.borderSubtle}` }}>
                  <span style={{ color: c.chalk, fontSize: 13 }}>{diff}</span>
                  <span style={{ fontFamily: font.mono, color: c.ivory, fontSize: 13 }}>{count}</span>
                </div>
              ))
            }
          </div>

          {/* Avg Skill Scores */}
          {Object.keys(sessions.avgSkillScores).length > 0 && (
            <div style={{ ...card, flex: 0.8, minWidth: 250 }}>
              <p style={{ ...labelStyle, marginBottom: 16 }}>Avg Skill Scores (All Users)</p>
              {Object.entries(sessions.avgSkillScores).sort(([, a], [, b]) => b - a).map(([skill, score]) => (
                <div key={skill} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ flex: 1, fontSize: 12, color: c.chalk }}>{skill}</span>
                  <div style={{ width: 80, height: 8, background: c.onyx, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${score}%`, background: score >= 65 ? c.sage : score >= 40 ? c.gilt : c.ember, borderRadius: 4 }} />
                  </div>
                  <span style={{ width: 28, fontSize: 11, fontFamily: font.mono, color: c.stone, textAlign: "right" }}>{score}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent sessions */}
        {sessions.recent.length > 0 ? (
          <div style={{ ...card, padding: 0, overflow: "auto" }}>
            <div style={{ padding: "16px 24px 8px" }}>
              <p style={labelStyle}>Recent Sessions</p>
            </div>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Difficulty</th>
                  <th style={thStyle}>Score</th>
                  <th style={thStyle}>Duration</th>
                  <th style={thStyle}>Date</th>
                </tr>
              </thead>
              <tbody>
                {sessions.recent.map((s, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{s.type}</td>
                    <td style={tdStyle}>{s.difficulty}</td>
                    <td style={{ ...tdStyle, fontFamily: font.mono, fontWeight: 600, color: s.score >= 65 ? c.sage : s.score >= 40 ? c.gilt : c.ember }}>{s.score}</td>
                    <td style={{ ...tdStyle, fontFamily: font.mono }}>{s.duration ? `${Math.round(s.duration / 60)}m` : "—"}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{formatDateTime(s.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="No sessions recorded yet" />
        )}
      </div>
    );
  };

  const renderFeedback = () => {
    if (!feedback) return <EmptyState message="No feedback data available" />;

    const ratingColors: Record<string, string> = {
      helpful: c.sage, too_harsh: c.ember, too_generous: c.gilt, inaccurate: c.ember,
    };

    return (
      <div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <div style={statCard}>
            <p style={labelStyle}>Total Feedback</p>
            <p style={bigNum}>{feedback.total}</p>
          </div>
          {Object.entries(feedback.byRating).map(([rating, count]) => (
            <div key={rating} style={statCard}>
              <p style={labelStyle}>{rating.replace(/_/g, " ")}</p>
              <p style={{ ...bigNum, color: ratingColors[rating] || c.ivory }}>{count}</p>
            </div>
          ))}
        </div>

        {feedback.recent.length > 0 ? (
          <div style={{ ...card, padding: 0, overflow: "auto" }}>
            <div style={{ padding: "16px 24px 8px" }}>
              <p style={labelStyle}>Recent Feedback</p>
            </div>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Rating</th>
                  <th style={thStyle}>Comment</th>
                  <th style={thStyle}>Session Type</th>
                  <th style={thStyle}>Score</th>
                  <th style={thStyle}>Date</th>
                </tr>
              </thead>
              <tbody>
                {feedback.recent.map((f, i) => (
                  <tr key={i}>
                    <td style={{ ...tdStyle, color: ratingColors[f.rating] || c.chalk }}>{f.rating?.replace(/_/g, " ")}</td>
                    <td style={{ ...tdStyle, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{f.comment || "—"}</td>
                    <td style={tdStyle}>{f.session_type || "—"}</td>
                    <td style={{ ...tdStyle, fontFamily: font.mono }}>{f.session_score ?? "—"}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{formatDateTime(f.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="No feedback received yet" />
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (error) {
      return (
        <div style={{ ...card, textAlign: "center", padding: 60 }}>
          <p style={{ fontSize: 18, color: c.ember, margin: "0 0 8px" }}>
            {error.includes("expired") ? "Session Expired" : error.includes("Rate") ? "Rate Limited" : "Error"}
          </p>
          <p style={{ color: c.stone, fontSize: 14, margin: 0 }}>{error}</p>
          {error.includes("expired") && (
            <button
              onClick={() => { setError(null); handleLogout(); }}
              style={{
                marginTop: 16, padding: "8px 20px",
                background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
                border: "none", borderRadius: radius.md, color: c.obsidian,
                fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font.ui,
              }}
            >
              Sign In Again
            </button>
          )}
        </div>
      );
    }
    if (loading) {
      return (
        <div style={{ ...card, textAlign: "center", padding: 60 }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${c.border}`, borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: c.stone, fontSize: 14, margin: 0 }}>Loading {tab}...</p>
        </div>
      );
    }
    switch (tab) {
      case "overview": return renderOverview();
      case "users": return renderUsers();
      case "financials": return renderFinancials();
      case "llm": return renderLLM();
      case "sessions": return renderSessions();
      case "feedback": return renderFeedback();
    }
  };

  /* ─── Layout ─── */

  // Loading auth
  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: c.obsidian, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.ui }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${c.border}`, borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: c.stone, fontSize: 14 }}>Loading...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Login screen
  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: c.obsidian, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.ui }}>
        <div style={{
          width: 360, padding: "40px 36px", background: c.graphite,
          border: `1px solid ${c.border}`, borderRadius: radius.xl,
        }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <span style={{ fontSize: 22, fontWeight: 600, color: c.gilt, letterSpacing: "0.04em" }}>HireStepX</span>
            <span style={{ display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: c.stone, marginTop: 6 }}>Admin Console</span>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 12, color: c.stone, marginBottom: 6, fontWeight: 500 }}>Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                required
                autoFocus
                autoComplete="off"
                style={{
                  width: "100%", padding: "11px 14px", background: c.onyx,
                  border: `1px solid ${c.border}`, borderRadius: radius.md,
                  color: c.ivory, fontSize: 14, fontFamily: font.ui, outline: "none",
                  boxSizing: "border-box",
                }}
                placeholder="Enter admin password"
              />
            </div>

            {loginError && (
              <div style={{
                marginBottom: 16, padding: "10px 14px",
                background: loginError.includes("Too many") ? `${c.gilt}15` : `${c.ember}15`,
                border: `1px solid ${loginError.includes("Too many") ? c.gilt : c.ember}33`,
                borderRadius: radius.md, fontSize: 13,
                color: loginError.includes("Too many") ? c.gilt : c.ember,
              }}>
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginBusy}
              style={{
                width: "100%", padding: "12px 0",
                background: loginBusy ? c.onyx : `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
                border: "none", borderRadius: radius.md,
                color: loginBusy ? c.stone : c.obsidian,
                fontSize: 14, fontWeight: 600, fontFamily: font.ui,
                cursor: loginBusy ? "not-allowed" : "pointer",
              }}
            >
              {loginBusy ? "Verifying..." : "Sign In"}
            </button>
          </form>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Dashboard
  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, color: c.ivory, fontFamily: font.ui }}>
      {/* Top Bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 32px", borderBottom: `1px solid ${c.border}`,
        background: c.graphite,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: c.gilt, letterSpacing: "0.04em" }}>HireStepX</span>
          <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: c.stone, background: `${c.ember}22`, padding: "3px 10px", borderRadius: 100 }}>Admin</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <button
            onClick={handleLogout}
            style={{
              background: "none", border: `1px solid ${c.border}`, borderRadius: radius.md,
              color: c.stone, fontSize: 12, padding: "6px 14px", cursor: "pointer",
              fontFamily: font.ui,
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 57px)" }}>
        {/* Sidebar */}
        <div style={{
          width: 220, flexShrink: 0, padding: "24px 16px",
          borderRight: `1px solid ${c.border}`, background: c.graphite,
        }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSelectedUserId(null); setUserDetail(null); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "10px 14px", marginBottom: 4, border: "none", borderRadius: radius.md,
                background: tab === t.key ? c.onyx : "transparent",
                color: tab === t.key ? c.ivory : c.stone,
                fontSize: 13, fontFamily: font.ui, fontWeight: tab === t.key ? 600 : 400,
                cursor: "pointer", transition: "all 0.15s",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, padding: "28px 32px", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: c.ivory }}>
              {TABS.find(t => t.key === tab)?.icon} {TABS.find(t => t.key === tab)?.label}
            </h2>
            <RefreshButton onClick={refreshTab} loading={loading} />
          </div>
          {renderContent()}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
