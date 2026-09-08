"use client";
/* ─── DashboardHome (canvas port, post-audit revision)
   Cream/copper editorial surface. Wires real streak + sessions from
   useDashboardCore; mock sections (peer cohort, AI insight, KPIs,
   milestones, daily goal) are flagged with visible "Demo data" pills
   and a single top-of-page banner so users are not deceived.

   Set NEXT_PUBLIC_DASHBOARD_DEMO=1 in env to keep demo sections
   visible without the banner (for screenshots / canvas previews).
   In production, the banner makes it unmistakable. */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import { useDashboardSessions, useDashboardSubscription, useDashboardUI } from "./DashboardContext";
import { pickNextMove } from "./nextMove";
import { useDocTitle } from "./useDocTitle";
import { captureClientEvent } from "./posthogClient";
import type { DashboardSession } from "./dashboardTypes";
import { tokens as T, fonts as F, shadows as S } from "./auth/_tokens";
import { UpcomingInterviews } from "./DashboardHomePanels";
import HiringActivityCard from "./HiringActivityCard";
import { authHeaders } from "./supabase";
import { apiFetch } from "./apiClient";
import {
  computeResumeFreshness,
  parseDismissal,
  freshnessBucket,
  RESUME_FRESHNESS_DISMISS_KEY,
} from "./resumeFreshness";

/* Funnel telemetry — these event names are the contract PostHog
   dashboards query, so they're stable. The `surface` prop on
   dashboard_start_clicked is the only attribute that needs to grow
   when new Start CTAs are added; keep the values kebab-case so
   PostHog auto-grouping behaves. */
type StartSurface =
  | "next-move-primary"     // hero card primary CTA
  | "next-move-outline"     // hero card secondary "Pick a different focus"
  | "ai-insight-demo"       // demo-mode AI insight bottom CTA
  | "ai-insight-real"       // real-mode AI insight bottom CTA
  | "recent-empty"          // first-time "Start your first session"
  | "rail-resume";          // sidebar resume rail (future)

/* ─── Tokens (derived from auth/_tokens — single source of truth).
 * Every value here is a passthrough to a canonical token. Audit rule:
 * no hex/rgba literals in this file. inkMid maps to the WCAG-fixed
 * inkFaint (#7A7263); decorative inkFaint maps to inkFaintWeak. */
const t = {
  cream:        T.cream,
  white:        T.white,
  creamSoft:    T.creamSoft,
  coal:         T.coal,
  inkSoft:      T.inkSoft,
  inkMid:       T.inkFaint,      // WCAG-fixed AA-passing shade
  inkFaint:     T.inkFaintWeak,  // decorative only (icon strokes)
  indigo:       T.indigo,
  indigo100:    T.indigo100,
  copper:       T.copper,
  copperSoft:   T.copperSoft,
  copperBorder: T.copperBorder,
  success:      T.success,
  success100:   T.success100,
  error:        T.error,
  error100:     T.error100,
  warning100:   T.warning100,
  warningInk:   T.warningInk,
  warningLine:  T.warningLine,
  line:         T.line,
  lineStrong:   T.lineStrong,
} as const;

const f = {
  serif: F.serif,
  sans:  F.sans,
  mono:  F.mono,
} as const;

const shadows = {
  card: S.card,
  cta:  S.cta,
} as const;

/* ─── icons ─── */
const ico = (path: React.ReactNode, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {path}
  </svg>
);
const Icons = {
  flame:    ico(<path d="M12 2c0 4-3 6-3 9a3 3 0 0 0 6 0c0-1 0-2 1-3 2 2 3 4 3 7a7 7 0 1 1-14 0c0-5 4-7 7-13z" />),
  arrow:    ico(<><path d="M5 12h14M13 5l7 7-7 7" /></>, 16),
  clock:    ico(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  trend:    ico(<><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></>),
  sparkle:  ico(<><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3" /></>, 16),
  target:   ico(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></>),
  trophy:   ico(<><path d="M8 4h8v6a4 4 0 0 1-8 0V4z" /><path d="M16 4h2v3a3 3 0 0 1-3 3M8 4H6v3a3 3 0 0 0 3 3M10 14h4v3h-4zM8 21h8" /></>),
  practice: ico(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>),
  meet:     ico(<><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3z" /></>),
  info:     ico(<><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></>, 16),
  check:    ico(<><path d="M20 6 9 17l-5-5" /></>, 14),
  lock:     ico(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>, 14),
};

/* ─── atoms ─── */
function Eyebrow({ children, tone = "ink", as: As = "span" }: {
  children: React.ReactNode; tone?: "copper" | "indigo" | "ink"; as?: "span" | "h2" | "h3";
}) {
  const color = tone === "copper" ? t.copper : tone === "indigo" ? t.indigo : t.inkSoft;
  return (
    <As style={{
      display: "inline-block", margin: 0,
      fontFamily: f.mono, fontSize: 11, fontWeight: 500,
      color, letterSpacing: 0.8, textTransform: "uppercase",
    }}>{children}</As>
  );
}

function SampleDataPill() {
  return (
    <span aria-label="Sample data, not your account" title="Sample data, not your account" style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 9px", borderRadius: 999,
      fontFamily: f.mono, fontSize: 10, fontWeight: 600, letterSpacing: 0.6,
      color: t.warningInk, background: t.warning100, border: `1px solid ${t.warningLine}`,
      textTransform: "uppercase",
    }}>Demo</span>
  );
}

function ScoreChip({ value }: { value: number }) {
  const bg = value >= 85 ? t.success100 : value >= 70 ? t.copperSoft : t.creamSoft;
  const fg = value >= 85 ? t.success    : value >= 70 ? t.copper     : t.inkSoft;
  return (
    <span aria-label={`Score ${value} out of 100`} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 44, height: 32, padding: "0 10px", borderRadius: 8,
      background: bg, color: fg,
      fontFamily: f.sans, fontSize: 14, fontWeight: 600,
    }}>{value}</span>
  );
}

function Card({
  children, pad = 24, radius = 16, background = t.white,
  border = `1px solid ${t.line}`, style, labelledBy,
}: {
  children: React.ReactNode;
  pad?: number;
  radius?: number;
  background?: string;
  border?: string;
  style?: React.CSSProperties;
  /* Pass an id of the heading inside the card to opt into a labelled
   * <section> landmark. Without this, the card renders as a plain
   * <div> so we don't pollute the SR landmark list with unnamed
   * sections. */
  labelledBy?: string;
}) {
  const baseStyle = { background, border, borderRadius: radius, padding: pad, boxShadow: shadows.card, ...style };
  if (labelledBy) {
    return <section aria-labelledby={labelledBy} style={baseStyle}>{children}</section>;
  }
  return <div style={baseStyle}>{children}</div>;
}

function Ring({ value, size = 64, stroke = 6, color = t.indigo, track = t.line, label }: {
  value: number; size?: number; stroke?: number; color?: string; track?: string; label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
         role={label ? "img" : undefined} aria-label={label} aria-hidden={!label}>
      <circle cx={size/2} cy={size/2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
    </svg>
  );
}

function PrimaryCta({ children, onClick, icon, fullWidth, size = "md" }: {
  children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode; fullWidth?: boolean; size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "10px 18px" : "14px 22px";
  const fs  = size === "sm" ? 13 : 14;
  return (
    <button type="button" onClick={onClick} className="hsx-dh-btn hsx-dh-cta-primary" style={{
      display: "inline-flex", alignItems: "center", gap: 10,
      padding: pad, borderRadius: 12, border: "none", cursor: "pointer",
      background: t.indigo, color: t.white,
      fontFamily: f.sans, fontSize: fs, fontWeight: 600, letterSpacing: 0.1,
      boxShadow: shadows.cta, minHeight: 44,
      width: fullWidth ? "100%" : undefined,
      justifyContent: fullWidth ? "center" : undefined,
    }}>
      <span>{children}</span>
      {icon ?? Icons.arrow}
    </button>
  );
}

function OutlineCta({ children, onClick, size = "md" }: {
  children: React.ReactNode; onClick?: () => void; size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "9px 16px" : "13px 20px";
  return (
    <button type="button" onClick={onClick} className="hsx-dh-btn hsx-dh-cta-outline" style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: pad, borderRadius: 12, cursor: "pointer", minHeight: 44,
      background: "transparent", color: t.coal,
      border: `1px solid ${t.lineStrong}`,
      fontFamily: f.sans, fontSize: 14, fontWeight: 500,
    }}>{children}</button>
  );
}

/* ResumeFreshnessStrip — nudges returning users whose resume is stale.
   Shows at 30 days, dismissable, reappears at 60. Real timestamp only:
   sourced from StoredResume.parsedAt (no fake "N days ago"). All age /
   dismissal math is in src/resumeFreshness.ts; this renders the result. */
function ResumeFreshnessStrip({ parsedAt, onRefresh }: {
  parsedAt: string | null | undefined; onRefresh: () => void;
}) {
  // nowMs is captured once per mount; freshness changes on the order of
  // days, so a live ticker would be wasted re-renders.
  const [nowMs] = useState(() => Date.now());
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setDismissedAt(window.localStorage.getItem(RESUME_FRESHNESS_DISMISS_KEY));
    } catch { /* private mode / storage disabled → behave as not dismissed */ }
  }, []);

  const fresh = computeResumeFreshness(parsedAt, nowMs, parseDismissal(dismissedAt));
  if (!fresh.show || fresh.days == null) return null;

  const dismiss = () => {
    const blob = JSON.stringify({ parsedAt, bucket: freshnessBucket(fresh.days as number) });
    try { window.localStorage.setItem(RESUME_FRESHNESS_DISMISS_KEY, blob); } catch { /* ignore */ }
    setDismissedAt(blob);
  };

  return (
    <div role="status" style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 14px", marginBottom: 12,
      background: t.copperSoft, border: `1px solid ${t.copperBorder}`, borderRadius: 10,
    }}>
      <span style={{ color: t.copper, flexShrink: 0, display: "inline-flex" }} aria-hidden>{Icons.clock}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: f.sans, fontSize: 13, fontWeight: 600, color: t.coal, margin: 0, lineHeight: 1.3 }}>
          Your resume is {fresh.days} days old.
        </p>
        <p style={{ fontFamily: f.sans, fontSize: 12, color: t.inkSoft, margin: "2px 0 0", lineHeight: 1.45 }}>
          Targets and panels drift. Refresh to keep practice aligned with your latest work.
        </p>
      </div>
      <OutlineCta size="sm" onClick={onRefresh}>Refresh</OutlineCta>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss resume freshness reminder"
        style={{
          flexShrink: 0, minWidth: 44, minHeight: 44, borderRadius: 8, cursor: "pointer",
          background: "transparent", border: "none", color: t.inkMid,
          fontFamily: f.sans, fontSize: 16, lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >×</button>
    </div>
  );
}

/* ─── OutcomePrompt ─────────────────────────────────────────────────────────
   Appears once in the sidebar when the user has sessions older than 30 days
   and hasn't yet reported a job-search outcome. Dismissable; after submit or
   dismiss it stays hidden. Backend: GET/POST /api/user-outcome. */

const OUTCOME_DISMISS_KEY = "hirestepx_outcome_dismissed";

function OutcomePrompt({ firstSessionDate, isCampus }: { firstSessionDate: string | null | undefined; isCampus?: boolean }) {
  const [status, setStatus] = useState<"idle" | "open" | "done" | "error" | "dismissed">("idle");
  const [applied, setApplied] = useState(false);
  const [interviewed, setInterviewed] = useState(false);
  const [offer, setOffer] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [company, setCompany] = useState("");
  const [roleLanded, setRoleLanded] = useState("");
  const [testimonial, setTestimonial] = useState("");
  const [mayShare, setMayShare] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!firstSessionDate) return;
    const daysSinceFirst = (Date.now() - new Date(firstSessionDate).getTime()) / 86400000;
    if (daysSinceFirst < 30) return;
    try {
      if (localStorage.getItem(OUTCOME_DISMISS_KEY)) return;
    } catch { /* private mode */ }

    // Check if already reported
    (async () => {
      try {
        const res = await fetch("/api/user-outcome", { headers: await authHeaders() });
        if (!res.ok) return;
        const data = (await res.json()) as { outcome: Record<string, unknown> | null } | null;
        if (!data?.outcome) setStatus("open");
      } catch { /* best-effort */ }
    })();
  }, [firstSessionDate]);

  const dismiss = () => {
    try { localStorage.setItem(OUTCOME_DISMISS_KEY, "1"); } catch { /* noop */ }
    setStatus("dismissed");
  };

  const submit = async () => {
    setBusy(true);
    const res = await apiFetch("/api/user-outcome", { applied, interviewed, offer, accepted,
      company: company.trim() || undefined, roleLanded: roleLanded.trim() || undefined,
      testimonial: testimonial.trim() || undefined, mayShare });
    setBusy(false);
    setStatus(res.ok ? "done" : "error");
  };

  if (status === "idle" || status === "dismissed") return null;

  if (status === "error") {
    return (
      <div style={{
        padding: "12px 14px", background: t.error100,
        border: `1px solid ${t.error}`, borderRadius: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      }}>
        <p style={{ fontFamily: f.sans, fontSize: 13, color: t.coal, margin: 0, lineHeight: 1.4 }}>
          Couldn&apos;t save your result. Please try again.
        </p>
        <button
          type="button" onClick={() => setStatus("open")}
          style={{ fontFamily: f.sans, fontSize: 12, fontWeight: 600, color: t.indigo,
            background: "transparent", border: "none", cursor: "pointer", flexShrink: 0 }}
        >Retry</button>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div style={{
        padding: "12px 14px", background: t.success100,
        border: `1px solid ${t.success}`, borderRadius: 10,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ color: t.success, display: "inline-flex" }} aria-hidden>{Icons.check}</span>
        <p style={{ fontFamily: f.sans, fontSize: 13, color: t.coal, margin: 0, lineHeight: 1.4 }}>
          Thank you for sharing. Your result helps improve HireStepX for everyone.
        </p>
      </div>
    );
  }

  if (status === "open") {
    return (
      <div style={{
        padding: "14px 16px",
        background: t.indigo100, border: `1px solid ${t.indigo}`, borderRadius: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <p style={{ fontFamily: f.sans, fontSize: 13, fontWeight: 600, color: t.coal, margin: 0 }}>
            {isCampus ? "How did your campus placement go?" : "How did your job search go?"}
          </p>
          <button
            type="button" onClick={dismiss} aria-label="Dismiss outcome prompt"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: t.inkMid, fontSize: 16, lineHeight: 1, padding: 0, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
          >×</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(
            isCampus
              ? [
                  { label: "Applied to placement drives",    value: applied,     set: setApplied },
                  { label: "Cleared aptitude / tech round",  value: interviewed, set: setInterviewed },
                  { label: "Got an offer letter",            value: offer,       set: setOffer },
                  { label: "Joined the company",             value: accepted,    set: setAccepted },
                ]
              : [
                  { label: "Applied for a role", value: applied,     set: setApplied },
                  { label: "Got an interview",   value: interviewed, set: setInterviewed },
                  { label: "Received an offer",  value: offer,       set: setOffer },
                  { label: "Accepted the offer", value: accepted,    set: setAccepted },
                ]
          ).map(({ label, value, set }) => (
            <label key={label} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
              fontFamily: f.sans, fontSize: 12, color: t.coal, lineHeight: 1.4 }}>
              <input type="checkbox" checked={value} onChange={e => set(e.target.checked)}
                style={{ accentColor: t.indigo, width: 14, height: 14, flexShrink: 0 }} />
              {label}
            </label>
          ))}
        </div>
        {(offer || accepted) && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            <input
              type="text" placeholder="Company (optional)" value={company} maxLength={120}
              onChange={e => setCompany(e.target.value)}
              aria-label="Company name"
              style={{ fontFamily: f.sans, fontSize: 12, padding: "6px 10px",
                border: `1px solid ${t.lineStrong}`, borderRadius: 6, background: t.white,
                color: t.coal, width: "100%", boxSizing: "border-box" }}
            />
            <input
              type="text" placeholder="Role landed (optional)" value={roleLanded} maxLength={120}
              onChange={e => setRoleLanded(e.target.value)}
              aria-label="Role landed"
              style={{ fontFamily: f.sans, fontSize: 12, padding: "6px 10px",
                border: `1px solid ${t.lineStrong}`, borderRadius: 6, background: t.white,
                color: t.coal, width: "100%", boxSizing: "border-box" }}
            />
            <textarea
              placeholder="Short testimonial (optional)"
              value={testimonial} maxLength={500}
              onChange={e => setTestimonial(e.target.value)}
              aria-label="Testimonial"
              rows={2}
              style={{ fontFamily: f.sans, fontSize: 12, padding: "6px 10px",
                border: `1px solid ${t.lineStrong}`, borderRadius: 6, background: t.white,
                color: t.coal, width: "100%", resize: "vertical", boxSizing: "border-box" }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
              fontFamily: f.sans, fontSize: 12, color: t.inkSoft }}>
              <input type="checkbox" checked={mayShare} onChange={e => setMayShare(e.target.checked)}
                style={{ accentColor: t.indigo, width: 14, height: 14, flexShrink: 0 }} />
              OK to share anonymously on the site
            </label>
          </div>
        )}
        <button
          type="button" onClick={submit} disabled={busy}
          style={{
            marginTop: 12, width: "100%", padding: "8px 0",
            fontFamily: f.sans, fontSize: 13, fontWeight: 600,
            background: t.indigo, color: t.white, border: "none", borderRadius: 8,
            cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "Saving…" : "Share result"}
        </button>
      </div>
    );
  }

  return null;
}

/* ─── mock data (demo-only sections) ─── */
const MOCK_FALLBACK_SESSIONS: DemoSession[] = [
  { title: "Salary negotiation, Razorpay PM", date: "Yesterday, 38 min", score: 88, icon: Icons.meet },
  { title: "System design, Stripe Staff PM",  date: "2 days ago, 52 min", score: 82, icon: Icons.practice },
  { title: "Behavioral, Atlassian Senior PM", date: "4 days ago, 41 min", score: 76, icon: Icons.target },
  { title: "Resume deep-dive coaching",       date: "Last week, 28 min", score: 91, icon: Icons.sparkle },
];

type DemoSession = { title: string; date: string; score: number; icon: React.ReactNode };

const MOCK_KPI = {
  practiceHours:    { value: 12.4, unit: "h",     sub: "this week",        percentile: 78 },
  averageScore:     { value: 84,   unit: "/100",  sub: "last 10 sessions", percentile: 72 },
  sessionsComplete: { value: 27,   unit: "",      sub: "since signup",     percentile: 84 },
};

const MOCK_GOAL = { sessionsDone: 1, sessionsGoal: 2, minutesDone: 28, minutesGoal: 45, weakDone: 2, weakGoal: 3 };

const MOCK_MILESTONES = {
  earned: [
    { label: "First session",  earnedAt: "Day 1" },
    { label: "7 day streak",   earnedAt: "Week 1" },
    { label: "Score 85+",      earnedAt: "Top 25%" },
    { label: "10 sessions",    earnedAt: "Volume" },
  ],
  next: { label: "14 day streak", progress: 9, target: 14 },
};

/* ─── view ─── */
export default function DashboardHome() {
  const { user } = useAuth();
  const router = useRouter();
  useDocTitle("Dashboard");
  const core = useDashboardSessions();
  const { isFree, sessionsRemaining, creditBalance } = useDashboardSubscription();
  const { setShowUpgradeModal } = useDashboardUI();

  const displayName = useMemo(() => {
    const name = user?.name?.trim();
    if (name) return name.split(" ")[0];
    const emailLocal = user?.email?.split("@")[0];
    return emailLocal || "there";
  }, [user]);

  /* Mix real and demo data. Real where backed, demo where not. */
  const realStreak = core.currentStreak;
  const realSessions = core.recentSessions.slice(0, 4);
  const readiness = core.readinessScore || 68;
  /* Threshold below which any "based on your last N runs" copy is a
   * lie. Above it, real patterns exist and the editorial framing reads
   * true. Set conservatively. */
  const hasPatternData = core.recentSessions.length >= 4;

  /* The "Your next move" card is driven by the real personalization engine:
   * it reads the user's weakest skill, last-session gap flags, and streak to
   * produce a targeted headline + CTA (with a `drill` deep-link). Was
   * previously hardcoded to the same STAR copy for everyone. */
  const totalSessionCount = user?.practiceTimestamps?.length ?? 0;
  const hasResume = !!user?.resumeData;
  const nextMove = useMemo(() => pickNextMove({
    skills: core.skills.map((s) => ({ name: s.name, score: s.score })),
    currentStreak: core.currentStreak,
    topGaps: core.topGaps,
    sessionCount: totalSessionCount,
  }), [core.skills, core.currentStreak, core.topGaps, totalSessionCount]);

  /* When a brand-new user hasn't uploaded a resume yet, the coaching engine
   * has nothing to personalise against — show a resume-first nudge instead
   * of a "start a session" CTA that leads to generic questions. This aligns
   * the hero card with the Recent Sessions empty state below (which also
   * gates on resume). Both surfaces then agree on the correct first action. */
  const isFirstTimerWithoutResume = totalSessionCount === 0 && !hasResume;

  /* Supporting line under the hero headline, derived from what drove the CTA.
   * The session-type label uses coachingSessionFocus so campus-placement and
   * salary-negotiation sessions say the right thing instead of "HR round". */
  const coachingSessionLabel = (() => {
    switch (nextMove.coachingSessionFocus) {
      case "campus-placement": return "Campus Placement session";
      case "salary-negotiation": return "Salary Negotiation session";
      default: return "HR round";
    }
  })();
  const nextMoveSubtitle = isFirstTimerWithoutResume
    ? "Upload your resume so every mock interview question matches your real background, experience, and target role."
    : nextMove.coachingFocus
      ? `From your last ${coachingSessionLabel} we flagged: ${nextMove.coachingFocus.label}.`
      : nextMove.weakestSkillLabel
        ? `A focused 25-minute drill on ${nextMove.weakestSkillLabel} moves your readiness fastest.`
        : "Pick a role and start. After four sessions, your coach surfaces the specific patterns it's seeing across your STAR breakdowns.";

  /* Locale-formatted date is rendered client-only to avoid SSR/CSR
   * hydration mismatches (server TZ vs. user TZ produces different
   * weekday strings on the en-IN locale). */
  const [todayLabel, setTodayLabel] = useState<string | null>(null);
  useEffect(() => {
    setTodayLabel(
      new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
    );
  }, []);

  /* Demo gating. Only when NEXT_PUBLIC_DASHBOARD_DEMO=1 do unbacked
     sections render with sample numbers. Otherwise they render as
     honest "Coming soon" stubs so real users never see fake metrics.
     The banner appears only in demo mode so the operator knows the
     mode is active. */
  // Demo mode is unconditionally OFF in production builds — the env flag
  // is only honoured in preview/dev so a stray Vercel env var can't ship
  // sample numbers to paying users. VERCEL_ENV is "production" only on
  // the production deployment; preview + development read the flag.
  const demoMode =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_DASHBOARD_DEMO === "1" &&
    process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";

  /* /session/new renders SessionSetup, which configures a session and
   * hands off to /interview. The previous "/interview/setup" path did
   * not exist — every Start CTA was a 404. */
  /* Tagged factory — each call site passes its `surface` so PostHog
     can attribute Start clicks per CTA. The funnel
     dashboard_loaded → dashboard_start_clicked → interview_session_started
     → interview_session_completed answers "which surface converts?". */
  const goToInterview = (surface: StartSurface, href: string = "/session/new") => () => {
    captureClientEvent("dashboard_start_clicked", {
      surface,
      hasData: core.hasData,
      sessions_count: core.recentSessions.length,
      streak: core.currentStreak,
      readiness: readiness,
      next_move_focus: nextMove.coachingFocus?.gapCode ?? nextMove.weakestSkillName ?? null,
    });
    router.push(href);
  };
  const goToSessions  = () => router.push("/sessions");
  const goToResume    = () => router.push("/resume");

  /* North-Star coaching input: a click on the "Your next move" primary CTA.
     Fires alongside dashboard_start_clicked but carries the coaching context
     (gap code, weakest skill, drill key) so the coaching loop is measurable
     independently of the generic Start funnel. drill_key is read from the
     CTA href so it always matches what /session/new actually receives. */
  const goToNextMove = () => {
    let drillKey: string | null = null;
    let effectiveHref = nextMove.ctaHref;
    try {
      const parsed = new URL(nextMove.ctaHref, "https://hirestepx.local");
      drillKey = parsed.searchParams.get("drill");
      // For campus-placement CTAs, carry the last campus session's role +
      // company so SessionSetup doesn't fall back to the Settings profile role.
      if (nextMove.coachingSessionFocus === "campus-placement") {
        const lastCampus = core.recentSessions.find(
          (s) => s.focus === "campus-placement"
        );
        if (lastCampus?.role) parsed.searchParams.set("role", lastCampus.role);
        if (lastCampus?.company) parsed.searchParams.set("company", lastCampus.company);
        effectiveHref = parsed.pathname + "?" + parsed.searchParams.toString();
      }
    } catch {
      drillKey = null;
    }
    captureClientEvent("coaching:next_move_cta_clicked", {
      gap_code: nextMove.coachingFocus?.gapCode ?? null,
      weakest_skill_name: nextMove.weakestSkillName ?? null,
      drill_key: drillKey,
    });
    goToInterview("next-move-primary", effectiveHref)();
  };

  /* Fire dashboard_loaded exactly once per mount, after the first
     paint that has real data attached. Using a ref instead of effect
     deps so we don't re-fire when streak/sessions update mid-session
     (those are not "loads"). Strict-mode double-effect is guarded. */
  const loadedFiredRef = useRef(false);
  useEffect(() => {
    if (loadedFiredRef.current) return;
    if (core.sessionsLoading) return; // wait until at least sessions data resolved
    loadedFiredRef.current = true;
    captureClientEvent("dashboard_loaded", {
      hasData: core.hasData,
      sessions_count: core.recentSessions.length,
      streak: core.currentStreak,
      readiness: readiness,
      pattern_data: hasPatternData,
      tier: user?.subscriptionTier ?? "unknown",
      demo_mode: demoMode,
    });
  }, [
    core.sessionsLoading, core.hasData, core.recentSessions.length,
    core.currentStreak, readiness, hasPatternData,
    user?.subscriptionTier, demoMode,
  ]);

  return (
    <div className="hsx-dh-root" style={{
      minHeight: "100%",
      background: t.cream,
      fontFamily: f.sans, color: t.coal,
      /* Padding lives in CSS classes — the media queries below own all
         three width tiers (≥1181, ≤1180, ≤720). An inline value here would
         beat the tiered overrides at any width the queries don't touch. */
    }}>
      <div className="hsx-dh-grid" style={{
        display: "grid",
        /* Rail clamps between 280-360px so 1200-1400px viewports breathe
           instead of giving the rail a fixed 360 while the main column
           bears all the shrink. Collapses to 1fr at ≤1180px via the
           media query below. */
        gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)",
        gap: 32, maxWidth: 1280, margin: "0 auto",
      }}>
        {/* ─── Main stage ─── */}
        <main style={{ display: "flex", flexDirection: "column", gap: 28, minWidth: 0 }}>

          {/* Demo banner only when demo mode is on. Real users never see fake numbers. */}
          {demoMode && (
            <div role="status" aria-live="polite" style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "12px 16px",
              background: t.warning100, color: t.warningInk,
              border: `1px solid ${t.warningLine}`, borderRadius: 10,
              fontFamily: f.sans, fontSize: 13, lineHeight: 1.5,
            }}>
              <span style={{ marginTop: 2, flexShrink: 0 }}>{Icons.info}</span>
              <span>
                Demo mode. Sections marked <strong>Demo</strong> render sample
                numbers so reviewers can see the full surface. Disable by
                unsetting <code>NEXT_PUBLIC_DASHBOARD_DEMO</code>.
              </span>
            </div>
          )}

          {/* Hero greeting + inline streak */}
          <section aria-labelledby="dh-hero">
            <Eyebrow as="span" tone="ink">
              <span suppressHydrationWarning>{todayLabel ?? " "}</span>
            </Eyebrow>
            <h1 id="dh-hero" className="hsx-dh-hero" style={{
              fontFamily: f.serif, fontSize: "clamp(28px, 6vw, 44px)", fontWeight: 400, lineHeight: 1.1,
              letterSpacing: "-0.02em", color: t.coal, margin: "8px 0 6px",
            }}>
              Welcome{" "}
              <em style={{ fontStyle: "italic", fontWeight: 400, color: t.copper }}>back</em>
              , {displayName}.
            </h1>
            <p style={{ fontFamily: f.sans, fontSize: 15, color: t.inkSoft, margin: 0, maxWidth: 560 }}>
              {hasPatternData
                ? "Three weak spots from your last session are queued. A focused 25 minute block clears two."
                : "One 25 minute practice session is enough to start tracking patterns. Begin when you're ready."}
            </p>

            {/* Inline streak strip, not a card. Mixes real streak with a one-line goal status. */}
            <div style={{
              display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
              marginTop: 18, padding: "12px 0 0",
              borderTop: `1px solid ${t.line}`,
            }}>
              <div style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ color: t.copper, display: "inline-flex", alignSelf: "center" }}>{Icons.flame}</span>
                <span style={{ fontFamily: f.serif, fontSize: 28, fontWeight: 400, color: t.coal, letterSpacing: -0.4, lineHeight: 1 }}>
                  {realStreak}
                </span>
                <span style={{ fontFamily: f.sans, fontSize: 13, color: t.inkSoft }}>
                  day streak
                </span>
              </div>
              {demoMode ? <DailyGoalRibbonInline /> : <DailyGoalStub />}
            </div>
          </section>

          {/* Next move, single emphasized card. No KPI grid above it; one focal point. */}
          <Card pad={28} labelledBy="dh-next">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Eyebrow tone="copper" as="h2"><span id="dh-next">Your next move</span></Eyebrow>
                <p className="hsx-dh-next-heading" style={{
                  fontFamily: f.serif, fontSize: 28, fontWeight: 400, lineHeight: 1.2,
                  letterSpacing: "-0.01em", color: t.coal, margin: "8px 0 10px",
                }}>
                  {isFirstTimerWithoutResume
                    ? "Start with your resume — every question adapts to your experience."
                    : nextMove.headline}
                </p>
                <p style={{ fontFamily: f.sans, fontSize: 14, color: t.inkSoft, margin: 0, maxWidth: 520, lineHeight: 1.55 }}>
                  {nextMoveSubtitle}
                </p>
                {isFree && sessionsRemaining === 1 && (
                  <p style={{
                    margin: "8px 0 0",
                    fontFamily: f.sans,
                    fontSize: 12,
                    color: t.copper,
                    fontWeight: 600,
                    letterSpacing: "0.01em",
                  }}>
                    1 free session remaining after this
                  </p>
                )}
                <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                  {isFirstTimerWithoutResume ? (
                    <PrimaryCta onClick={goToResume}>Upload resume</PrimaryCta>
                  ) : isFree && sessionsRemaining === 0 && creditBalance === 0 ? (
                    <PrimaryCta onClick={() => setShowUpgradeModal(true)}>Get more sessions</PrimaryCta>
                  ) : (
                    <PrimaryCta onClick={goToNextMove}>{nextMove.ctaLabel}</PrimaryCta>
                  )}
                  {!isFirstTimerWithoutResume && (
                    <OutlineCta onClick={goToInterview("next-move-outline")}>Pick a different focus</OutlineCta>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ position: "relative", width: 92, height: 92, flexShrink: 0 }}>
                  <Ring value={readiness} size={92} stroke={8} color={t.copper}
                        label={`Weekly readiness ${readiness} percent`} />
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <span style={{ fontFamily: f.mono, fontSize: 20, fontWeight: 700, color: t.copper, lineHeight: 1 }}>{readiness}</span>
                    <span style={{ fontFamily: f.sans, fontSize: 9, color: t.inkSoft, marginTop: 2 }}>/ 100</span>
                  </div>
                </div>
                <div style={{ fontFamily: f.mono, fontSize: 10, color: t.inkSoft, letterSpacing: 0.5 }}>
                  WEEKLY READINESS
                </div>
              </div>
            </div>
          </Card>

          {/* Distilled stat strip. Demo mode shows sample numbers; otherwise empty stub. */}
          <section aria-labelledby="dh-stats">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <Eyebrow as="h2" tone="ink"><span id="dh-stats">Progress</span></Eyebrow>
              {demoMode && <SampleDataPill />}
            </div>
            {demoMode ? (
              <dl className="hsx-dh-stats" style={{
                display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, margin: 0,
                borderTop: `1px solid ${t.line}`, borderBottom: `1px solid ${t.line}`,
              }}>
                <StatCell label="Practice this week" value={`${MOCK_KPI.practiceHours.value}`} unit="h" />
                <StatCell label="Average score"      value={`${MOCK_KPI.averageScore.value}`}   unit="/100" />
                <StatCell label="Total sessions"     value={`${MOCK_KPI.sessionsComplete.value}`} unit="" />
              </dl>
            ) : (
              /* Real stats — computed from actual user data, no pipeline needed */
              <dl className="hsx-dh-stats" style={{
                display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, margin: 0,
                borderTop: `1px solid ${t.line}`, borderBottom: `1px solid ${t.line}`,
              }}>
                {/* "Total sessions" = completed, saved sessions the user can
                    open in their Sessions list. Must match that list's count.
                    Earlier this read practice_timestamps.length — but those
                    count session STARTS (incl. abandoned ones), the quota
                    signal — which inflated the stat far above the real number
                    of finished sessions (e.g. 202 vs 9). Quota math still uses
                    practice_timestamps in DashboardContext; only this display
                    stat changed. */}
                <StatCell label="Total sessions"  value={String(core.recentSessions.length)} unit="" />
                <StatCell label="Last score"      value={core.recentSessions[0]?.score != null ? String(core.recentSessions[0].score) : "—"} unit={core.recentSessions[0]?.score != null ? "/100" : ""} />
                <StatCell label="Day streak"      value={String(core.currentStreak ?? 0)} unit="🔥" />
              </dl>
            )}
          </section>

          {/* Upcoming interviews from the calendar — only renders when the user
              has scheduled events ahead. Empty list returns null. */}
          <UpcomingInterviews
            events={core.calendarEvents}
            isMobile={typeof window !== "undefined" && window.innerWidth < 720}
            onNavigate={(path) => router.push(path)}
          />

          {/* Recent sessions, real data when present, mock fallback with pill when empty */}
          <section aria-labelledby="dh-recent">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <h2 id="dh-recent" style={{ fontFamily: f.serif, fontSize: 22, fontWeight: 400, color: t.coal, letterSpacing: "-0.01em", margin: 0 }}>
                  Recent sessions
                </h2>
                <p style={{ fontFamily: f.sans, fontSize: 12, color: t.inkSoft, margin: "4px 0 0" }}>
                  Your last four runs, newest first.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {realSessions.length === 0 && demoMode && <SampleDataPill />}
                <button onClick={goToSessions} className="hsx-dh-btn hsx-dh-textlink" style={{
                  fontFamily: f.sans, fontSize: 13, fontWeight: 500, color: t.indigo,
                  background: "transparent", border: "none", cursor: "pointer",
                  padding: "10px 14px", minHeight: 44, borderRadius: 8,
                }}>View all <span aria-hidden>→</span></button>
              </div>
            </div>
            <RecentSessionsList
              real={realSessions}
              fallback={MOCK_FALLBACK_SESSIONS}
              demoMode={demoMode}
              hasResume={!!user?.resumeData}
              hasTargetRole={!!user?.targetRole}
              onGoToResume={goToResume}
              onGoToSettings={() => router.push("/settings")}
              onStart={goToInterview("recent-empty")}
              onOpenSession={(id) => {
                const s = realSessions.find((r) => r.id === id);
                captureClientEvent("dashboard_session_clicked", {
                  session_id: id,
                  score: s?.score,
                  type: s?.type,
                  surface: "recent-sessions",
                });
                router.push(`/session/${id}`);
              }}
            />
          </section>

          {/* Milestones. Demo mode shows the timeline; real mode shows a stub until backend lands. */}
          {demoMode && (
            <section aria-labelledby="dh-miles">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <div>
                  <h2 id="dh-miles" style={{ fontFamily: f.serif, fontSize: 22, fontWeight: 400, color: t.coal, letterSpacing: "-0.01em", margin: 0 }}>
                    Milestones
                  </h2>
                  <p style={{ fontFamily: f.sans, fontSize: 12, color: t.inkSoft, margin: "4px 0 0" }}>
                    {MOCK_MILESTONES.earned.length} earned. Next up below.
                  </p>
                </div>
                <SampleDataPill />
              </div>
              <MilestoneTimeline />
            </section>
          )}
        </main>

        {/* ─── Rail (one card only, supporting strips below) ─── */}
        <aside className="hsx-dh-rail" style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>

          {/* Peer cohort — demo-only until backend ships */}
          {demoMode && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <Eyebrow as="h2" tone="indigo">Ahead of</Eyebrow>
                <SampleDataPill />
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: f.serif, fontSize: 36, fontWeight: 400, color: t.coal, letterSpacing: -0.5, lineHeight: 1 }}>72</span>
                <span style={{ fontFamily: f.mono, fontSize: 11, color: t.inkSoft, letterSpacing: 0.5 }}>percent of cohort</span>
              </div>
              <p style={{ fontFamily: f.sans, fontSize: 13, color: t.inkSoft, margin: "8px 0 0", lineHeight: 1.5 }}>
                Top 28 percent of senior PM candidates. Two strong sessions clears top 20.
              </p>
            </div>
          )}

          {/* Stale-resume nudge (real timestamp; 30-day threshold). Renders
              nothing when the resume is fresh, missing a parsedAt, or the
              user has dismissed it for this bucket. */}
          <ResumeFreshnessStrip parsedAt={user?.resumeData?.parsedAt} onRefresh={goToResume} />

          {/* Job-search outcome prompt — fires 30 days after first session. */}
          <OutcomePrompt firstSessionDate={user?.practiceTimestamps?.[0]} isCampus={core.recentSessions.some(s => s.focus === "campus-placement")} />

          {/* Talent-roster visibility — see settingsSections.tsx AccountSection
              for the opt-in toggle this reflects. */}
          <HiringActivityCard />
        </aside>
      </div>

      {/* Global styles: focus-visible, reduced motion, responsive */}
      <style>{`
        /* Hover + active feedback for dashboard CTAs. Each variant
           gets the treatment that matches its visual weight:
           primary lifts with indigo shadow, outline darkens border
           and tints, text-link nudges + underlines, raillink tints
           bg + advances arrow. All share 160ms cubic-bezier (.2,.7,.2,1)
           snap timing — see src/_motion.ts. */
        .hsx-dh-root .hsx-dh-btn {
          transition: transform 160ms cubic-bezier(0.2, 0.7, 0.2, 1),
                      box-shadow 160ms cubic-bezier(0.2, 0.7, 0.2, 1),
                      background-color 160ms ease,
                      border-color 160ms ease,
                      color 160ms ease,
                      filter 160ms ease;
        }
        /* Primary (indigo fill) — lift + deeper indigo shadow. */
        .hsx-dh-root .hsx-dh-cta-primary:hover {
          transform: translateY(-1px);
          filter: brightness(1.06);
          box-shadow: 0 2px 4px rgba(20,17,10,.10),
                      0 10px 22px -6px rgba(49,46,129,.32);
        }
        .hsx-dh-root .hsx-dh-cta-primary:active {
          transform: translateY(0) scale(0.985);
          filter: brightness(0.96);
          box-shadow: 0 1px 2px rgba(20,17,10,.10);
          transition-duration: 80ms;
        }
        /* Outline — tint bg copper-wash, darken border, gentle lift. */
        .hsx-dh-root .hsx-dh-cta-outline:hover {
          background: rgba(180, 83, 9, 0.06);
          border-color: ${t.copper};
          color: ${t.copper};
          transform: translateY(-1px);
        }
        .hsx-dh-root .hsx-dh-cta-outline:active {
          transform: translateY(0) scale(0.99);
          background: rgba(180, 83, 9, 0.10);
          transition-duration: 80ms;
        }
        /* Text-link "View all" — bg-tint + arrow shift. */
        .hsx-dh-root .hsx-dh-textlink:hover {
          background: ${t.indigo100};
        }
        .hsx-dh-root .hsx-dh-textlink:hover span[aria-hidden] {
          transform: translateX(2px);
        }
        .hsx-dh-root .hsx-dh-textlink span[aria-hidden] {
          display: inline-block;
          transition: transform 160ms cubic-bezier(0.2, 0.7, 0.2, 1);
        }
        .hsx-dh-root .hsx-dh-btn:focus-visible {
          outline: 2px solid ${t.copper};
          outline-offset: 3px;
          border-radius: 12px;
        }
        @media (prefers-reduced-motion: reduce) {
          .hsx-dh-root .hsx-dh-btn,
          .hsx-dh-root .hsx-dh-btn:hover,
          .hsx-dh-root .hsx-dh-btn:active,
          .hsx-dh-root .hsx-dh-textlink span[aria-hidden] {
            transform: none !important;
            filter: none !important;
            transition: none !important;
          }
        }
        .hsx-dh-stats .hsx-dh-stat-cell:last-child { border-right: none; }
        /* Gate hover-only treatments behind capable pointers so iOS
           doesn't get stuck-hover after first tap on Recent Sessions
           rows and CTA cards. Coarse/no-hover devices skip the hover
           rules entirely and fall through to :active feedback. */
        @media (hover: none), (pointer: coarse) {
          .hsx-dh-root .hsx-dh-cta-primary:hover,
          .hsx-dh-root .hsx-dh-cta-outline:hover,
          .hsx-dh-root .hsx-dh-textlink:hover {
            transform: none !important;
            filter: none !important;
            background: inherit;
            border-color: inherit;
            color: inherit;
            box-shadow: inherit;
          }
          .hsx-dh-root .hsx-dh-textlink:hover span[aria-hidden] {
            transform: none !important;
          }
        }
        /* Padding tiers — class-based so no inline style wins.
           safe-area-inset rolls the iOS home indicator + Android nav bar
           into the bottom padding instead of letting them clip last-row
           CTAs. */
        .hsx-dh-root {
          padding-top: 16px;
          padding-right: 0;
          padding-bottom: max(64px, env(safe-area-inset-bottom));
          padding-left: 0;
        }
        /* 1181–1500px: keep two-column grid but shrink the rail so the main
           column has room to breathe on 13–14" laptops and common 1280–1440px
           monitors. The gap drops to 20px to recover additional horizontal space. */
        @media (max-width: 1500px) and (min-width: 1181px) {
          .hsx-dh-grid { grid-template-columns: minmax(0, 1fr) minmax(220px, 280px) !important; gap: 20px !important; }
        }
        /* Next-move headline: drop from 28px → 22px so it fits in 2 lines
           at the narrowed main column on small-desktop viewports. */
        @media (max-width: 1440px) and (min-width: 1181px) {
          .hsx-dh-next-heading { font-size: 22px !important; }
        }
        /* Grid collapse threshold raised to 1180px: between 768px (where
           DashboardLayout shows the 260px sidebar) and 1080px (old breakpoint)
           the 260 sidebar + 360 rail + padding stole ~700px of chrome from
           viewports that could not afford it. Tablets and small laptops now
           render single-column with the rail below the main stage. */
        @media (max-width: 1180px) {
          .hsx-dh-grid { grid-template-columns: 1fr !important; }
          .hsx-dh-rail { order: 2; }
          .hsx-dh-root {
            padding-top: 14px;
            padding-right: 0;
            padding-bottom: max(56px, env(safe-area-inset-bottom));
            padding-left: 0;
          }
        }
        /* Stats grid: 3-up survives the rail collapse but labels truncate
           below 900px. Drop to 2-up so each cell keeps a readable width;
           the third cell wraps onto its own row, full width. */
        @media (max-width: 900px) {
          .hsx-dh-stats { grid-template-columns: repeat(2, 1fr) !important; }
          .hsx-dh-stats .hsx-dh-stat-cell:nth-child(2) { border-right: none !important; }
          .hsx-dh-stats .hsx-dh-stat-cell:nth-child(3) {
            grid-column: 1 / -1;
            border-top: 1px solid ${t.line};
          }
        }
        @media (max-width: 720px) {
          .hsx-dh-stats { grid-template-columns: 1fr !important; }
          .hsx-dh-stats .hsx-dh-stat-cell { border-right: none !important; border-bottom: 1px solid ${t.line}; }
          .hsx-dh-stats .hsx-dh-stat-cell:last-child { border-bottom: none; }
          .hsx-dh-stats .hsx-dh-stat-cell:nth-child(3) {
            grid-column: auto;
            border-top: none;
          }
          .hsx-dh-root {
            padding-top: 10px;
            padding-right: 0;
            padding-bottom: max(48px, env(safe-area-inset-bottom));
            padding-left: 0;
          }
        }
        /* Narrow viewport: drop the leading session icon so the title
           gets back ~50px before ellipsis kicks in. */
        @media (max-width: 480px) {
          .hsx-dh-session-row > span:first-child { display: none; }
        }
        /* Landscape phones (iPhone 14 Pro, Galaxy S in landscape):
           short height + wide screen. Shrink the hero, ring, and the
           "Next move" card so the primary CTA stays above the fold. */
        @media (max-height: 500px) and (orientation: landscape) {
          .hsx-dh-hero { font-size: 26px !important; }
          .hsx-dh-root {
            padding-top: 16px;
            padding-bottom: max(32px, env(safe-area-inset-bottom));
          }
        }
        /* Belt-and-suspenders overflow guard for cards whose children
           pack fixed-width chips/SVGs (calendar date pills, AI insight
           chart). Lets them scroll horizontally on 320-360px viewports
           instead of pushing the whole card off-screen. */
        .hsx-dh-rail > section, .hsx-dh-root main > section { min-width: 0; }
        .hsx-dh-rail > section > *, .hsx-dh-root main > section > * { max-width: 100%; }
        @media (prefers-reduced-motion: reduce) {
          .hsx-dh-progress-fill { transition: none !important; }
        }
      `}</style>
    </div>
  );
}

/* ─── small pieces ─── */

function StatCell({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div style={{ padding: "16px 4px", borderRight: `1px solid ${t.line}` }}
         className="hsx-dh-stat-cell">
      <dt style={{ fontFamily: f.mono, fontSize: 10, color: t.inkSoft, letterSpacing: 0.6, textTransform: "uppercase", margin: 0 }}>
        {label}
      </dt>
      <dd style={{ margin: "6px 0 0", display: "flex", alignItems: "baseline", gap: 3 }}>
        <span style={{ fontFamily: f.serif, fontSize: 30, fontWeight: 400, color: t.coal, letterSpacing: -0.5, lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontFamily: f.sans, fontSize: 13, color: t.inkSoft }}>{unit}</span>}
      </dd>
    </div>
  );
}

function DailyGoalRibbonInline() {
  const p = MOCK_GOAL;
  const sessionPct = (p.sessionsDone / p.sessionsGoal) * 100;
  const minutesPct = (p.minutesDone / p.minutesGoal) * 100;
  const weakPct    = (p.weakDone / p.weakGoal) * 100;
  const overall = Math.min(100, (sessionPct + minutesPct + weakPct) / 3);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 240,
      flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 200 }}>
        <span style={{ color: t.copper, display: "inline-flex" }}>{Icons.target}</span>
        <span style={{ fontFamily: f.sans, fontSize: 13, color: t.inkSoft }}>
          Today: <span style={{ color: t.coal, fontWeight: 600 }}>{p.sessionsDone}/{p.sessionsGoal}</span> sessions,{" "}
          <span style={{ color: t.coal, fontWeight: 600 }}>{p.minutesDone}/{p.minutesGoal}</span> min
        </span>
        {/* transform-scaleX animation, not width. Layout-safe. */}
        <div style={{ flex: 1, minWidth: 80, height: 4, borderRadius: 999, background: t.line, overflow: "hidden", position: "relative" }}
             role="progressbar"
             aria-valuenow={Math.round(overall)}
             aria-valuemin={0}
             aria-valuemax={100}
             aria-label="Today's overall goal progress">
          <div className="hsx-dh-progress-fill" style={{
            position: "absolute", inset: 0,
            background: t.copper,
            transform: `scaleX(${overall / 100})`, transformOrigin: "left center",
            transition: "transform 600ms cubic-bezier(.16,1,.3,1)",
          }} />
        </div>
        <span style={{ fontFamily: f.mono, fontSize: 11, color: t.inkSoft, letterSpacing: 0.4 }}>
          {Math.round(overall)}%
        </span>
      </div>
      <SampleDataPill />
    </div>
  );
}

function RecentSessionsList({ real, fallback, demoMode, hasResume, hasTargetRole, onGoToResume, onGoToSettings, onStart, onOpenSession }: {
  real: DashboardSession[];
  fallback: DemoSession[];
  demoMode: boolean;
  /* Onboarding state — drives the empty state copy so new users see the
     right next action rather than a generic "start a session" CTA before
     the AI has anything to personalise against. */
  hasResume: boolean;
  hasTargetRole: boolean;
  onGoToResume: () => void;
  onGoToSettings: () => void;
  onStart: () => void;
  /* Navigates to /session/[id] for the report view. Demo fallback rows
     skip this — they have no real id and clicking sample data would
     deceive the user. */
  onOpenSession: (id: string) => void;
}) {
  if (real.length === 0) {
    if (demoMode) {
      return (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {fallback.map((row, i) => (
            <SessionRow key={i} title={row.title} date={row.date} score={row.score} icon={row.icon} first={i === 0} />
          ))}
        </ul>
      );
    }
    /* Onboarding-aware empty state: guide the user through the two
       prerequisites (resume → target role) before showing the practice CTA.
       Without a resume the AI has nothing to personalise against; without a
       target role the question bank defaults to generic questions that don't
       match any specific hiring bar. */
    if (!hasResume) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12,
          padding: "18px 4px",
        }}>
          <p style={{ fontFamily: f.sans, fontSize: 14, color: t.coal, margin: 0, lineHeight: 1.5 }}>
            Upload your resume first — AI personalises every question to your background.
          </p>
          <PrimaryCta size="sm" onClick={onGoToResume}>Upload resume</PrimaryCta>
        </div>
      );
    }
    if (!hasTargetRole) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12,
          padding: "18px 4px",
        }}>
          <p style={{ fontFamily: f.sans, fontSize: 14, color: t.coal, margin: 0, lineHeight: 1.5 }}>
            Set your target role for industry-specific questions.
          </p>
          <PrimaryCta size="sm" onClick={onGoToSettings}>Set target role</PrimaryCta>
        </div>
      );
    }
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12,
        padding: "18px 4px",
      }}>
        <p style={{ fontFamily: f.sans, fontSize: 14, color: t.coal, margin: 0, lineHeight: 1.5 }}>
          Your first session takes 15 minutes. You&apos;ll get a score, STAR breakdown,
          and the exact phrases to improve — emailed to you right after.
        </p>
        <PrimaryCta size="sm" onClick={onStart}>Start your first free session</PrimaryCta>
      </div>
    );
  }
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {real.map((s, i) => (
        <SessionRow
          key={s.id}
          title={`${s.focus === "campus-placement" ? "Campus Placement" : s.type}${s.role ? `, ${s.role}` : ""}`}
          date={`${s.dateLabel}, ${s.duration}`}
          score={s.score}
          icon={Icons.practice}
          first={i === 0}
          onClick={() => onOpenSession(s.id)}
        />
      ))}
    </ul>
  );
}

function SessionRow({ title, date, score, icon, first, onClick }: {
  title: string; date: string; score: number; icon: React.ReactNode; first: boolean;
  /* Optional — demo fallback rows pass nothing and render inert. Real
     rows pass a handler so the row becomes a button to /session/[id]. */
  onClick?: () => void;
}) {
  const baseStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 14, width: "100%",
    padding: "14px 8px", borderTop: first ? "none" : `1px solid ${t.line}`,
    background: "transparent", border: "none", borderRadius: 8,
    textAlign: "left" as const, font: "inherit", color: "inherit",
    minHeight: 44, /* WCAG 2.5.5 touch target */
  };
  const inner = (
    <>
      <span style={{
        width: 36, height: 36, borderRadius: 10, background: t.creamSoft, color: t.indigo,
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: f.sans, fontSize: 14, fontWeight: 500, color: t.coal,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{title}</div>
        <div style={{ fontFamily: f.sans, fontSize: 12, color: t.inkSoft, marginTop: 2 }}>{date}</div>
      </div>
      <ScoreChip value={score} />
    </>
  );
  if (!onClick) {
    return <li style={{ ...baseStyle, padding: "14px 4px", minHeight: undefined }}>{inner}</li>;
  }
  return (
    <li style={{ borderTop: first ? "none" : `1px solid ${t.line}` }}>
      <button
        type="button"
        onClick={onClick}
        className="hsx-dh-btn hsx-dh-session-row"
        aria-label={`Open ${title} report`}
        style={{
          ...baseStyle,
          borderTop: "none",
          cursor: "pointer",
        }}
      >
        {inner}
        <span aria-hidden style={{ color: t.inkFaint, marginLeft: 2 }}>{Icons.arrow}</span>
      </button>
    </li>
  );
}

function MilestoneTimeline() {
  const { earned, next } = MOCK_MILESTONES;
  const nextPct = Math.min(100, (next.progress / next.target) * 100);
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 0,
      background: t.creamSoft, border: `1px solid ${t.line}`, borderRadius: 12,
      overflow: "hidden",
    }}>
      {/* Earned, horizontal scroll on narrow */}
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.line}` }}>
        <Eyebrow as="h3" tone="copper">Earned</Eyebrow>
        <ol style={{
          listStyle: "none", margin: "10px 0 0", padding: 0,
          display: "flex", flexWrap: "wrap", gap: 8,
        }}>
          {earned.map(m => (
            <li key={m.label} style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "8px 12px", background: t.white,
              border: `1px solid ${t.copperSoft}`, borderRadius: 999,
              fontFamily: f.sans, fontSize: 12, color: t.coal,
            }}>
              <span style={{ color: t.copper, display: "inline-flex" }}>{Icons.check}</span>
              <span style={{ fontWeight: 500 }}>{m.label}</span>
              <span style={{ fontFamily: f.mono, fontSize: 10, color: t.inkSoft, letterSpacing: 0.4 }}>
                {m.earnedAt}
              </span>
            </li>
          ))}
        </ol>
      </div>
      {/* Next up, single emphasized row with its own progress bar */}
      <div style={{ padding: "16px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <span style={{
          width: 36, height: 36, borderRadius: 999,
          background: t.line, color: t.inkSoft,
          display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>{Icons.lock}</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Eyebrow as="h3" tone="ink">Next up</Eyebrow>
          <div style={{ fontFamily: f.serif, fontSize: 22, fontWeight: 400, color: t.coal, letterSpacing: "-0.01em", margin: "4px 0 8px" }}>
            {next.label}
          </div>
          <div style={{ position: "relative", height: 4, borderRadius: 999, background: t.line, overflow: "hidden" }}
               role="progressbar"
               aria-valuenow={next.progress}
               aria-valuemin={0}
               aria-valuemax={next.target}
               aria-label={`${next.label}, ${next.progress} of ${next.target}`}>
            <div className="hsx-dh-progress-fill" style={{
              position: "absolute", inset: 0,
              background: t.copper,
              transform: `scaleX(${nextPct / 100})`, transformOrigin: "left center",
              transition: "transform 600ms cubic-bezier(.16,1,.3,1)",
            }} />
          </div>
          <div style={{ fontFamily: f.mono, fontSize: 10, color: t.inkSoft, letterSpacing: 0.4, marginTop: 6 }}>
            {next.progress} OF {next.target} DAYS
          </div>
        </div>
      </div>
    </div>
  );
}


function DailyGoalStub() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      padding: "14px 16px",
      background: t.creamSoft, border: `1px solid ${t.line}`, borderRadius: 10,
    }}>
      <div style={{ minWidth: 0 }}>
        <Eyebrow as="h2" tone="ink">Today</Eyebrow>
        <p style={{ fontFamily: f.sans, fontSize: 13, color: t.coal, margin: "4px 0 0", lineHeight: 1.4 }}>
          One 25 minute session is enough to keep your streak.
        </p>
      </div>
    </div>
  );
}

