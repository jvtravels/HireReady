import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "./AuthContext";
import { useDashboardCore, useDashboardSessions, useDashboardSubscription, useDashboardUI } from "./DashboardContext";
const UpgradeModal = dynamic(() => import("./dashboardComponents").then(m => ({ default: m.UpgradeModal })), { ssr: false });
import { FREE_SESSION_LIMIT, STARTER_WEEKLY_LIMIT, PRO_MONTHLY_LIMIT } from "./dashboardData";
import { starterPackFootnote, planCtaLabel, planCtaTitle } from "./planCardCopy";
import { daysUntilEvent } from "./dashboardHelpers";
import { CopyEmailLink } from "./_CopyEmailLink";
import dynamic from "next/dynamic";
import { tokens as T, fonts as F, shadows as shadow } from "./auth/_tokens";


/* ─── Cream-mode design tokens (derived) ───────────────────────────────
 * Source of truth lives in src/auth/_tokens.ts. We expose the cream
 * editorial palette under the legacy `c`/`font` aliases so the rest of
 * the file's JSX needs no per-property edits — only the binding changes.
 * If a token like `inkFaint` ever shifts for WCAG, every alias on this
 * page picks it up automatically (no more drift between local copies). */
const c = {
  obsidian: T.cream,         // page bg → cream
  graphite: T.white,         // raised cards
  border: T.line,            // hairlines
  gilt: T.copper,
  giltDark: T.copperDark,
  ivory: T.coal,             // primary ink
  chalk: T.coal,
  stone: T.inkSoft,          // secondary ink
  sage: T.success,
  ember: T.error,
  slate: T.inkSoft,
  indigo: T.indigo,
  indigo100: T.indigo100,
  cream: T.cream,
  creamSoft: T.creamSoft,
} as const;
const font = {
  display: F.serif,
  ui: F.sans,
  mono: F.mono,
} as const;

/* ─── Prefetch route chunks on nav hover ─── */
const prefetchMap: Record<string, () => void> = {
  dashboard: () => { import("./DashboardHome"); },
  sessions: () => { import("./DashboardSessions"); },
  calendar: () => { import("./DashboardCalendar"); },
  analytics: () => { import("./DashboardAnalytics"); },
  resume: () => { import("./DashboardResume"); },
  jobs: () => { import("./DashboardJobs"); },
  settings: () => { import("./DashboardSettings"); },
};

/* ─── Sidebar Nav Items ─── */
const navItems = [
  { id: "dashboard", path: "/dashboard", label: "Dashboard", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
  { id: "sessions", path: "/sessions", label: "Sessions", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg> },
  { id: "calendar", path: "/calendar", label: "Calendar", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { id: "analytics", path: "/analytics", label: "Analytics", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> },
  { id: "resume", path: "/resume", label: "Resume", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> },
  { id: "jobs", path: "/jobs", label: "Jobs", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> },
  { id: "settings", path: "/settings", label: "Settings", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
];

export default function DashboardLayout({ children }: { children?: React.ReactNode }) {
  const nav = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { logout: authLogout, user, updateUser: authUpdateUser, loading: authLoading } = useAuth();
  // Use focused hooks instead of aggregate useDashboard() — prevents this
  // layout from re-rendering when unrelated state (e.g. recentSessions poll)
  // changes. Each sub-context only notifies when ITS slice changes.
  const { displayName, persisted } = useDashboardCore();
  const { calendarEvents, refreshSessions } = useDashboardSessions();
  const { isFree, isStarter, isPro, sessionsUsed, sessionsRemaining, starterRemaining, sessionsThisWeek, sessionsThisMonth, proRemaining, creditBalance, creditsLoaded } = useDashboardSubscription();
  // True once auth has fully resolved AND the tier is set. Gating on
  // !authLoading prevents the card from briefly showing the wrong colour
  // (green → orange flicker) when practiceTimestamps are still stale from
  // the localStorage cache and the DB profile hasn't arrived yet.
  // The localStorage tier cache (AuthContext cacheTier) seeds subscriptionTier
  // into the fallback user object on every load after the first, so the
  // skeleton only shows for the brief window until authLoading goes false.
  const tierKnown = !!user && user.subscriptionTier !== undefined && !authLoading;
  const {
    isMobile,
    showUpgradeModal, setShowUpgradeModal,
    paymentBanner, setPaymentBanner,
    syncError, setSyncError,
    toast, setCreditBalanceDirect, refreshCreditBalance,
  } = useDashboardUI();

  // Auto-open upgrade modal when arriving from ?upgrade=1 (e.g. the
  // post-session report upgrade nudge navigates here). Strip the param
  // from the URL immediately so a page refresh doesn't re-open it.
  useEffect(() => {
    if (searchParams?.get("upgrade") === "1") {
      setShowUpgradeModal(true);
      nav.replace(pathname ?? "/dashboard");
    }
  }, [searchParams, pathname, setShowUpgradeModal, nav]);

  // Refetch sessions AND credit balance on every mount (returning from /interview,
  // navigating back from session report, etc.).  Always fetch — don't gate on
  // creditsLoaded: when the layout remounts after an interview the Context resets
  // creditsLoaded→false and the old guard caused the refresh to silently skip,
  // leaving a stale/consumed balance on screen until a full page reload.
  useEffect(() => {
    refreshSessions();
    refreshCreditBalance();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSessions, refreshCreditBalance]);

  // Drain any interview-turn writes that failed during a previous session
  // (network blip mid-interview, browser tab closed before save, etc.).
  // Runs once per dashboard mount; flushPendingTurns is a no-op when the
  // queue is empty and only retries each turn once before re-queueing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { flushPendingTurns } = await import("./supabase");
        const result = await flushPendingTurns();
        if (!cancelled && result.flushed > 0) {
          console.warn(`[dashboard] flushed ${result.flushed} pending turn(s) from previous session`);
        }
      } catch { /* best effort */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const hasUrgentInterview = useMemo(() =>
    calendarEvents.some(e => e.status === "upcoming" && daysUntilEvent(e.date, e.time) >= 0 && daysUntilEvent(e.date, e.time) <= 3),
    [calendarEvents]
  );

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpFeedback, setHelpFeedback] = useState("");
  const [helpType, setHelpType] = useState<"bug" | "feature" | "billing" | "other">("other");
  const [helpSending, setHelpSending] = useState(false);
  const [helpSent, setHelpSent] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => { window.removeEventListener("offline", goOffline); window.removeEventListener("online", goOnline); };
  }, []);


  // Haptic feedback on mobile button taps
  useEffect(() => {
    if (!isMobile) return;
    const handler = (e: TouchEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("button, a, [role='button'], [role='menuitem']")) {
        try { navigator.vibrate?.(8); } catch { /* expected: vibrate API may not be available */ }
      }
    };
    document.addEventListener("touchstart", handler, { passive: true });
    return () => document.removeEventListener("touchstart", handler);
  }, [isMobile]);

  // Auto-dismiss payment cancel banner after 8s
  useEffect(() => {
    if (paymentBanner === "cancelled") {
      const t = setTimeout(() => setPaymentBanner(null), 8000);
      return () => clearTimeout(t);
    }
    return;
  }, [paymentBanner, setPaymentBanner]);

  // Auto-dismiss sync error after 8s
  useEffect(() => {
    if (syncError) {
      const t = setTimeout(() => setSyncError(""), 8000);
      return () => clearTimeout(t);
    }
    return;
  }, [syncError, setSyncError]);

  // Keyboard shortcut: ⌘B / Ctrl+B opens the plan/billing modal from anywhere
  useEffect(() => {
    if (!tierKnown) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setShowUpgradeModal(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tierKnown, setShowUpgradeModal]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobile && sidebarOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
    return;
  }, [isMobile, sidebarOpen]);

  // Determine active nav from current route
  const activeNav = (() => {
    const path = pathname;
    if (path === "/dashboard" || path === "/dashboard/") return "dashboard";
    const match = navItems.find(item => item.path !== "/dashboard" && path === item.path);
    return match?.id || "dashboard";
  })();

  /* Exhausted-quota states — used to switch the plan card from a
     punitive "limit reached" framing to a calm "all done" achievement. */
  const proExhausted = tierKnown && isPro && proRemaining === 0;
  const starterExhausted = tierKnown && isStarter && starterRemaining === 0;
  const freeExhausted = tierKnown && isFree && sessionsRemaining === 0;
  // Primary plan-card CTA (rendered by the else branch below) — label + matching
  // tooltip/aria derived from plan state. See planCardCopy.ts for the rules.
  const primaryCtaLabel = planCtaLabel({ starterExhausted, freeExhausted, creditBalance });
  const primaryCtaTitle = planCtaTitle(primaryCtaLabel);

  return (
    // 100dvh accounts for the mobile Safari URL bar — 100vh leaves a
    // 60-80px gap at the bottom when the bar collapses. The vh value
    // is the fallback for pre-iOS 15.4 / Android <108.
    <div style={{ display: "flex", height: "100dvh", minHeight: "100vh", background: c.obsidian, overflow: "hidden" }}>
      {/* Preload Razorpay checkout script so it's cached before the user clicks Upgrade */}
      <link rel="preload" href="https://checkout.razorpay.com/v1/checkout.js" as="script" crossOrigin="anonymous" />
      {/* Mobile sticky header — logo left, hamburger right. Sits below the
          sidebar overlay (z:19) and sidebar itself (z:20) so the drawer
          slides over it. Replaces the old inline "≡ Menu" content button. */}
      {isMobile && (
        <header style={{
          position: "fixed", top: 0, left: 0, right: 0, height: 56,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 20px",
          background: c.cream,
          borderBottom: `1px solid ${c.border}`,
          zIndex: 18,
        }}>
          <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
            <Image src="/wordmark.png" alt="HireStepX" width={387} height={108} style={{ height: 24, width: "auto" }} />
          </Link>
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
            style={{
              background: "none", border: "none", color: c.ivory,
              cursor: "pointer", padding: 8, margin: -8,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        </header>
      )}
      <a href="#dashboard-main" style={{
        position: "absolute", left: -9999, top: "auto", width: 1, height: 1, overflow: "hidden",
        zIndex: 100, padding: "12px 24px", background: c.gilt, color: c.obsidian,
        fontFamily: font.ui, fontSize: 14, fontWeight: 600, borderRadius: 8, textDecoration: "none",
      }} onFocus={(e) => { e.currentTarget.style.left = "16px"; e.currentTarget.style.top = "16px"; e.currentTarget.style.width = "auto"; e.currentTarget.style.height = "auto"; }}
        onBlur={(e) => { e.currentTarget.style.left = "-9999px"; e.currentTarget.style.width = "1px"; e.currentTarget.style.height = "1px"; }}>
        Skip to main content
      </a>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        /* ── Responsive padding ─────────────────────────────────────────────
           Mobile (≤599px) gets 20px inline padding (set inline above).
           600–767px steps up to 28px; 768–1023px to 36px.
           Small desktop (1024–1439px) drops from the 52px default to 32px
           so the content area gains 40px on cramped 13–14" screens. */
        @media (min-width: 600px) and (max-width: 1023px) {
          .dash-main { padding-left: 28px !important; padding-right: 28px !important; }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .dash-main { padding-left: 36px !important; padding-right: 36px !important; }
        }
        @media (min-width: 1024px) and (max-width: 1439px) {
          .dash-main { padding-left: 32px !important; padding-right: 32px !important; }
        }
      `}</style>

      {isMobile && sidebarOpen && <div role="button" aria-label="Close navigation menu" tabIndex={0} onClick={() => setSidebarOpen(false)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSidebarOpen(false); }} style={{ position: "fixed", inset: 0, background: "rgba(14,12,8,0.45)", zIndex: 19 }} />}

      {/* Sidebar */}
      <aside aria-label="Navigation sidebar" inert={isMobile && !sidebarOpen ? true : undefined} aria-hidden={isMobile && !sidebarOpen} style={{
        width: 260, borderRight: `1px solid ${c.border}`, padding: isMobile ? "0 14px 0" : "20px 18px 0",
        display: "flex", flexDirection: "column", position: "fixed", top: 0, bottom: 0,
        background: c.cream,
        zIndex: 20, overflow: "hidden",
        transform: isMobile ? (sidebarOpen ? "translateX(0)" : "translateX(-100%)") : "translateX(0)",
        transition: "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        {/* Sidebar wordmark — mobile gets a full-bleed header row; desktop gets a compact top block */}
        {isMobile ? (
          <div style={{
            height: 56,
            display: "flex", alignItems: "center",
            borderBottom: `1px solid ${c.border}`,
            marginBottom: 8,
            marginLeft: -14, marginRight: -14,
            paddingLeft: 20, paddingRight: 20,
            flexShrink: 0,
          }}>
            <Link
              href="/"
              onClick={() => setSidebarOpen(false)}
              style={{ textDecoration: "none", display: "flex", alignItems: "center" }}
            >
              <Image src="/wordmark.png" alt="HireStepX" width={387} height={108} style={{ height: 24, width: "auto" }} />
            </Link>
          </div>
        ) : (
          <div style={{ paddingBottom: 20, flexShrink: 0 }}>
            <Link href="/" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", paddingLeft: 14 }}>
              <Image src="/wordmark.png" alt="HireStepX" width={387} height={108} style={{ height: 26, width: "auto" }} />
            </Link>
          </div>
        )}
        <nav aria-label="Main navigation" style={{ display: "flex", flexDirection: "column", gap: 2, flex: "0 0 auto" }}>
          {navItems.map((item) => (
            <button key={item.id}
              aria-current={activeNav === item.id ? "page" : undefined}
              aria-label={item.label}
              onClick={() => { nav.push(item.path); if (isMobile) setSidebarOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: isMobile ? "10px 12px" : "11px 14px",
                borderRadius: 10, border: "none", cursor: "pointer",
                background: activeNav === item.id ? c.creamSoft : "transparent",
                color: activeNav === item.id ? c.ivory : c.stone,
                fontFamily: font.ui, fontSize: 13, fontWeight: activeNav === item.id ? 600 : 500,
                transition: "background 0.25s cubic-bezier(0.16, 1, 0.3, 1), color 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1)", textAlign: "left",
              }}
              onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px ${c.gilt}40`}
              onBlur={(e) => e.currentTarget.style.boxShadow = "none"}
              onMouseEnter={(e) => { if (activeNav !== item.id) e.currentTarget.style.background = c.creamSoft; prefetchMap[item.id]?.(); }}
              onMouseLeave={(e) => { if (activeNav !== item.id) e.currentTarget.style.background = "transparent"; }}
            >
              {item.icon}
              <span style={{ position: "relative" }}>
                {item.label}
                {item.id === "calendar" && hasUrgentInterview && (
                  <span style={{ position: "absolute", top: -2, right: -10, width: 7, height: 7, borderRadius: "50%", background: c.ember, border: `2px solid ${c.obsidian}` }} />
                )}
              </span>
              {activeNav === item.id && <div style={{ width: 3, height: 16, borderRadius: 2, background: c.gilt, marginLeft: "auto" }} />}
            </button>
          ))}
        </nav>

        {/* Spacer — pushes plan card + user info to bottom */}
        <div style={{ flex: 1 }} />

        {/* Plan Status — white card, copper accents throughout. No tinted backgrounds;
            state (exhausted / low / healthy) is communicated through the usage row
            and dash bar, not the card surface color. */}
        <div style={{ margin: "0 8px 12px", padding: "14px", borderRadius: 12,
          background: c.graphite,
          border: `1px solid ${c.border}`,
          flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
            {isPro ? (
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
            ) : isStarter ? (
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            ) : (
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/></svg>
            )}
            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 700, letterSpacing: "0.01em", color: c.gilt }}>
              {!tierKnown ? "Loading plan…" : isPro ? "Pro Plan" : isStarter ? "Starter Plan" : "Free Plan"}
            </span>
            {/* Renewal / end date — ember if cancelling, muted stone otherwise */}
            {tierKnown && (isPro || isStarter) && user?.subscriptionEnd && (
              <span
                aria-label={user.cancelAtPeriodEnd
                  ? `Plan ends ${new Date(user.subscriptionEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — access until then`
                  : isStarter
                    ? `Sprint Pack valid till ${new Date(user.subscriptionEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
                    : `Subscription renews ${new Date(user.subscriptionEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                style={{ marginLeft: "auto", fontFamily: font.ui, fontSize: 10, whiteSpace: "nowrap",
                  color: user.cancelAtPeriodEnd ? c.ember : c.stone,
                  opacity: user.cancelAtPeriodEnd ? 0.9 : 0.65 }}
              >
                {/* Starter is a one-off Sprint Pack — it expires, it doesn't renew. */}
                {user.cancelAtPeriodEnd ? "Ends" : isStarter ? "Valid till" : "Renews"}{" "}
                {new Date(user.subscriptionEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            )}
          </div>
          {/* ── Session usage block ── */}
          {!tierKnown ? (
            <div aria-hidden="true" style={{ height: 56, marginBottom: 12 }} />
          ) : (() => {
            const planUsedRaw   = isPro ? sessionsThisMonth : isStarter ? sessionsThisWeek : sessionsUsed;
            const planTotal     = isPro ? PRO_MONTHLY_LIMIT : isStarter ? STARTER_WEEKLY_LIMIT : FREE_SESSION_LIMIT;
            /* Cap display at planTotal — a user may have more sessions than the plan
               limit (grandfathered usage, manual grants) but showing "117/40" is confusing. */
            const planUsed      = Math.min(planUsedRaw, planTotal);
            const planLeft      = isPro ? proRemaining : isStarter ? starterRemaining : sessionsRemaining;
            const planExhausted = isPro ? proExhausted : isStarter ? starterExhausted : freeExhausted;
            const periodLabel   = isPro ? "this month" : isStarter ? "in this pack" : "total";
            // planName kept for potential future use (e.g. aria labels, tooltips).
            const pct  = Math.min(100, (planUsed / planTotal) * 100);
            const isLow = !planExhausted && (
              (isPro && planLeft <= 5) || (isStarter && planLeft <= 2) || (isFree && planLeft <= 1)
            );
            // barFill: matches the "N of N" text — ember when exhausted or low, copper when healthy.
            const barFill = (planExhausted || isLow) ? c.ember : c.gilt;


            return (
              <>
                {/* ── Row 1: "Sessions with Pro" label + remaining count ── */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                  <p
                    aria-live="polite"
                    style={{ fontFamily: font.ui, fontSize: 11, lineHeight: 1.4, margin: 0,
                      color: isLow ? c.ember : c.stone,
                      fontWeight: isLow ? 600 : 400,
                      opacity: planExhausted ? 0.65 : 1 }}
                  >
                    Sessions used
                  </p>
                  <span style={{ fontFamily: font.mono, fontSize: 11,
                    color: planExhausted ? c.ember : isLow ? c.ember : c.stone,
                    opacity: planExhausted ? 0.75 : 1, fontWeight: planExhausted ? 600 : 400 }}>
                    {planUsed} of {planTotal}
                  </span>
                </div>

                {/* ── Smooth progress bar — always visible ── */}
                <div
                  role="progressbar"
                  aria-label={planExhausted
                    ? `All ${planTotal} sessions used ${periodLabel}`
                    : `${planUsed} of ${planTotal} sessions used ${periodLabel}`}
                  aria-valuenow={Math.round(pct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  style={{ height: 4, borderRadius: 2, background: c.border, marginBottom: 10, marginTop: 6, overflow: "hidden" }}
                >
                  <div style={{
                    height: "100%",
                    width: `${pct}%`,
                    borderRadius: 2,
                    background: barFill,
                    transition: "width 0.4s ease",
                  }} />
                </div>

                {/* ── Extra sessions available — always visible ──
                    Green + bold when credits exist. Muted with 0 when none —
                    so users always see the row and know purchased credits are a thing. */}
                {(() => {
                  const hasCredits = creditBalance > 0;
                  return (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      marginBottom: 10, marginTop: planExhausted ? 6 : 2,
                      padding: "8px 11px",
                      background: hasCredits ? T.success100 : "rgba(180,83,9,0.06)",
                      border: hasCredits ? "1px solid rgba(21,128,61,0.22)" : "1px solid rgba(180,83,9,0.18)",
                      borderRadius: 8 }}>
                      <span style={{ fontFamily: font.ui, fontSize: 11, display: "flex", alignItems: "center", gap: 5,
                        color: hasCredits ? T.successInk : c.gilt }}>
                        {hasCredits ? (
                          <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        ) : (
                          <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        )}
                        Extra sessions available
                      </span>
                      <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 800, letterSpacing: "-0.01em",
                        color: hasCredits ? c.sage : c.gilt, opacity: hasCredits ? 1 : 0.55 }}>
                        {creditBalance}
                      </span>
                    </div>
                  );
                })()}

                {/* Sprint Pack footnote — a one-off pack that does NOT renew and
                    does NOT reset weekly. The plan name + validity date already
                    live in the card header and the "N of 5" count in the usage
                    row, so this line carries only the pack's one-off nature —
                    never the pack SIZE, which used to read as availability
                    directly above a buy CTA. Empty once the pack is spent
                    (exhaustion is already stated by the red usage row + buy
                    CTA), so only render when the footnote is non-empty. */}
                {isStarter && starterPackFootnote(starterRemaining) && (
                  <p style={{ fontFamily: font.ui, fontSize: 10, color: c.stone,
                    marginBottom: 10, marginTop: -6 }}>
                    {starterPackFootnote(starterRemaining)}
                  </p>
                )}
              </>
            );
          })()}
          {/* Hold skeleton until BOTH tier and credit balance are known — avoids
              a flash of "Buy sessions" for users who have credits but whose balance
              hasn't loaded yet (creditBalance defaults to 0 before the fetch resolves). */}
          {(!tierKnown || !creditsLoaded) ? (
            <div aria-hidden="true" style={{ width: "100%", height: 32, borderRadius: 8, background: c.border, opacity: 0.4 }} />
          ) : proExhausted ? (
            creditBalance > 0 ? (
              /* Exhausted Pro with credits — show both actions; buy is primary */
              <>
                <button
                  onClick={() => setShowUpgradeModal(true)}
                  title="Buy more session credits"
                  aria-label="Buy more sessions"
                  style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
                    background: c.gilt, color: c.obsidian,
                    fontFamily: font.ui, fontSize: 12, fontWeight: 700, letterSpacing: "0.01em",
                    transition: "filter 0.2s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.88)")}
                  onMouseLeave={(e) => (e.currentTarget.style.filter = "")}
                >Buy more sessions →</button>
              </>
            ) : (
              /* Exhausted Pro, no credits — buy is the right primary action */
              <button
                onClick={() => setShowUpgradeModal(true)}
                title="Buy more session credits"
                aria-label="Buy session credits"
                style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
                  background: c.gilt, color: c.obsidian,
                  fontFamily: font.ui, fontSize: 12, fontWeight: 700, letterSpacing: "0.01em",
                  transition: "filter 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.88)")}
                onMouseLeave={(e) => (e.currentTarget.style.filter = "")}
              >Buy sessions →</button>
            )
          ) : isPro ? (
            /* Active Pro: neutral management actions */
            <>
              <button onClick={() => setShowUpgradeModal(true)} title="Billing, invoices, and plan changes (⌘B)" style={{ width: "100%", padding: "8px 0", borderRadius: 8, cursor: "pointer", border: "none", background: c.gilt, color: "#fff", fontFamily: font.ui, fontSize: 12, fontWeight: 600, letterSpacing: "0.01em", transition: "filter 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.87)")}
                onMouseLeave={(e) => (e.currentTarget.style.filter = "")}
              >Manage Subscription</button>
            </>
          ) : isStarter && !starterExhausted ? (
            /* Active Starter with sessions remaining — no upsell, Pro isn't purchasable */
            null
          ) : (
            /* Free upsell or exhausted Starter: label + tooltip follow plan state.
               An exhausted Sprint Pack gets a pack-consistent "Buy more sessions"
               (opens the pack/credit modal), not a mismatched "Upgrade to Pro". */
            <button onClick={() => setShowUpgradeModal(true)} title={primaryCtaTitle} aria-label={primaryCtaLabel} style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian, fontFamily: font.ui, fontSize: 12, fontWeight: 600, transition: "filter 0.2s" }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.93)")}
              onMouseLeave={(e) => (e.currentTarget.style.filter = "")}
            >{primaryCtaLabel}</button>
          )}
        </div>

        {/* User info */}
        <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 8, padding: "14px 12px 16px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: T.copper100, border: `1px solid rgba(180,83,9,0.2)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.gilt }}>{(displayName || "?")[0].toUpperCase()}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</p>
              <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{user?.targetRole || persisted.targetRole || "Set your target role"}</p>
            </div>
          </div>
          <button onClick={() => { authLogout(); }} style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.stone, background: "none", border: "none", cursor: "pointer", padding: "6px 0", transition: "color 0.2s", display: "flex", alignItems: "center", gap: 6 }}
            onMouseEnter={(e) => e.currentTarget.style.color = c.ember}
            onMouseLeave={(e) => e.currentTarget.style.color = c.stone}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Log out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main id="dashboard-main" tabIndex={-1} className="dash-main" style={{ flex: 1, marginLeft: isMobile ? 0 : 260, padding: isMobile ? "76px 20px max(60px, env(safe-area-inset-bottom))" : "20px 52px 80px", overflowY: "auto", height: "100dvh", minHeight: "100vh", paddingLeft: isMobile ? "max(20px, env(safe-area-inset-left))" : undefined, paddingRight: isMobile ? "max(20px, env(safe-area-inset-right))" : undefined }}>

        {/* Payment success/cancel banner */}
        {paymentBanner && (
          <div role="alert" style={{ padding: "12px 16px", marginBottom: 16, borderRadius: 10, background: paymentBanner === "success" ? T.success100 : T.error100, border: `1px solid ${paymentBanner === "success" ? "rgba(21,128,61,0.22)" : "rgba(185,28,28,0.22)"}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {paymentBanner === "success" ? (
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              ) : (
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              )}
              <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: paymentBanner === "success" ? c.sage : c.ember }}>
                {paymentBanner === "success" ? "Payment successful! Your account has been upgraded." : "Payment was not completed. No charges were made — you can try again anytime."}
              </span>
            </div>
            <button onClick={() => setPaymentBanner(null)} aria-label="Dismiss banner"
              onMouseEnter={(e) => { e.currentTarget.style.color = paymentBanner === "success" ? c.sage : c.ember; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; }}
              style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 2, transition: "color 160ms ease" }}>
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {/* Sync error banner */}
        {syncError && (
          <div role="alert" style={{ padding: "10px 16px", marginBottom: 16, borderRadius: 8, background: T.error100, border: "1px solid rgba(185,28,28,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ember }}>{syncError}</span>
            </div>
            <button onClick={() => setSyncError("")} aria-label="Dismiss sync error"
              onMouseEnter={(e) => { e.currentTarget.style.color = c.ember; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; }}
              style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 2, transition: "color 160ms ease" }}>
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {isOffline && (
          <div role="alert" style={{ padding: "10px 16px", marginBottom: 16, borderRadius: 8, background: c.creamSoft, border: "1px solid rgba(126,141,152,0.2)", display: "flex", alignItems: "center", gap: 8 }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.slate} strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.slate }}>You're offline — some features may be unavailable</span>
          </div>
        )}
        <div key={pathname} className="dash-page-enter">
          {children}
        </div>
      </main>

      {/* Upgrade modal */}
      {showUpgradeModal && (
        <UpgradeModal
          onClose={() => setShowUpgradeModal(false)}
          sessionsUsed={sessionsUsed}
          user={user}
          currentTier={user?.subscriptionTier || "free"}
          starterExhausted={starterExhausted}
          onPaymentSuccess={(tier, start, end) => {
            setShowUpgradeModal(false);
            setPaymentBanner("success");
            setTimeout(() => setPaymentBanner(null), 8000);
            authUpdateUser({ subscriptionTier: tier as "starter" | "pro", subscriptionStart: start, subscriptionEnd: end });
          }}
          onCreditPurchase={(newBalance) => {
              // Directly apply the balance the server just reported — no DB
              // round-trip, no race condition between modal close and re-fetch.
              setCreditBalanceDirect(newBalance);
              // Belt-and-suspenders: also re-read from DB shortly after so
              // that a page refresh doesn't revert to 0 if the RLS SELECT
              // policy wasn't warmed yet. The direct set above wins the race
              // for the current session; the re-read corrects any mismatch.
              setTimeout(() => refreshCreditBalance(), 1500);
            }}
        />
      )}


      {/* Toast notification */}
      {toast && (
        <div role="status" aria-live="polite" style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 10,
          padding: "10px 20px", zIndex: 100, animation: "slideDown 0.2s ease",
          boxShadow: shadow.cta,
        }}>
          <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory }}>{toast}</span>
        </div>
      )}

      {/* Floating help widget */}
      <div style={{ position: "fixed", bottom: "max(24px, env(safe-area-inset-bottom))", right: "max(24px, env(safe-area-inset-right))", zIndex: 80 }}>
        {helpOpen && (
          <div role="dialog" aria-modal="true" aria-label="Help and support" style={{
            width: 340, marginBottom: 12,
            background: T.white, border: `1px solid ${c.border}`, borderRadius: 16,
            overflow: "hidden", boxShadow: shadow.modal,
            animation: "slideDown 0.2s ease",
          }}>
            {/* Header strip — copper tint gives panel immediate identity */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 18px",
              background: T.copper100, borderBottom: `1px solid ${T.copperBorder}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: T.copper, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.white} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 700, color: T.copperDark, margin: 0, letterSpacing: "-0.01em" }}>Help & Support</h3>
              </div>
              <button onClick={() => setHelpOpen(false)} aria-label="Close help panel"
                style={{ background: "none", border: "none", color: T.copper, cursor: "pointer", padding: 4, borderRadius: 6, lineHeight: 0, transition: "opacity 0.15s" }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = "0.6"}
                onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "18px 18px 16px" }}>
              {/* Type label */}
              <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, margin: "0 0 10px", textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>
                What&apos;s on your mind?
              </p>

              {/* Type selector — 2×2 icon+label grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
                {([
                  {
                    key: "bug" as const, label: "Bug report",
                    icon: <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2l1.5 1.5"/><path d="M14.5 3.5L16 2"/><path d="M9 7.5h6"/><path d="M12 7.5v13"/><path d="M7.5 10.5H4a2 2 0 0 0-2 2v1a6 6 0 0 0 6 6h8a6 6 0 0 0 6-6v-1a2 2 0 0 0-2-2h-3.5"/><path d="M4.5 7.5A3.5 3.5 0 0 1 8 4h8a3.5 3.5 0 0 1 3.5 3.5"/></svg>,
                    inactiveBg: "rgba(185,28,28,0.06)", inactiveColor: T.error,
                    activeBg: T.error100, activeColor: T.error, activeBdr: `1px solid rgba(185,28,28,0.3)`,
                  },
                  {
                    key: "feature" as const, label: "Feature idea",
                    icon: <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
                    inactiveBg: T.indigo100, inactiveColor: T.indigo,
                    activeBg: T.indigo100, activeColor: T.indigo, activeBdr: `1px solid ${T.indigoRing}`,
                  },
                  {
                    key: "billing" as const, label: "Billing",
                    icon: <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
                    inactiveBg: T.copper100, inactiveColor: T.copper,
                    activeBg: T.copper100, activeColor: T.copper, activeBdr: `1px solid ${T.copperBorder}`,
                  },
                  {
                    key: "other" as const, label: "Other",
                    icon: <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
                    inactiveBg: T.creamSoft, inactiveColor: c.stone,
                    activeBg: T.copper100, activeColor: T.copper, activeBdr: `1px solid ${T.copperBorder}`,
                  },
                ]).map(({ key, label, icon, inactiveBg, inactiveColor, activeBg, activeColor, activeBdr }) => {
                  const active = helpType === key;
                  return (
                    <button key={key} onClick={() => setHelpType(key)} style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "9px 11px", borderRadius: 8, cursor: "pointer",
                      fontFamily: font.ui, fontSize: 12, fontWeight: active ? 700 : 500,
                      transition: "all 0.15s", textAlign: "left" as const,
                      background: active ? activeBg : inactiveBg,
                      color: active ? activeColor : inactiveColor,
                      border: active ? activeBdr : `1px solid transparent`,
                      opacity: active ? 1 : 0.7,
                    }}>
                      {icon}
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Textarea */}
              <textarea
                rows={3}
                placeholder={helpType === "bug" ? "What happened? What did you expect?" : helpType === "feature" ? "Describe the feature you'd like..." : helpType === "billing" ? "Describe your billing question..." : "How can we help?"}
                value={helpFeedback}
                onChange={(e) => { setHelpFeedback(e.target.value); if (helpSent) setHelpSent(false); }}
                maxLength={500}
                style={{
                  width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8,
                  background: T.white, border: `1px solid ${c.border}`,
                  color: c.ivory, fontFamily: font.ui, fontSize: 13, resize: "none",
                  outline: "none", transition: "border-color 0.15s", lineHeight: 1.55,
                  marginBottom: 10,
                  boxShadow: "inset 0 1px 3px rgba(14,12,8,0.04)",
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = T.copperBorder}
                onBlur={(e) => e.currentTarget.style.borderColor = c.border}
              />

              {/* Send / success */}
              {helpSent ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 12px", borderRadius: 8,
                  background: T.success100, border: `1px solid rgba(21,128,61,0.2)`,
                }}>
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.success} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <p style={{ fontFamily: font.ui, fontSize: 12, color: T.success, margin: 0, fontWeight: 500 }}>Sent! We&apos;ll get back to you soon.</p>
                </div>
              ) : (
                <button
                  disabled={helpSending || !helpFeedback.trim()}
                  onClick={async () => {
                    const msg = helpFeedback.trim();
                    if (!msg) return;
                    setHelpSending(true);
                    try {
                      const { apiFetch } = await import("./apiClient");
                      const res = await apiFetch("/api/support-feedback", {
                        message: msg,
                        email: user?.email || null,
                        page: typeof window !== "undefined" ? window.location.pathname : null,
                        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
                        type: helpType,
                      });
                      if (!res.ok) throw new Error(res.error || "send failed");
                      setHelpFeedback("");
                      setHelpType("other");
                      setHelpSent(true);
                    } catch {
                      // Persisted path failed — fall back to the user's email client
                      // so the feedback isn't lost.
                      navigator.clipboard?.writeText("hello@hirestepx.com").catch(() => {});
                    } finally {
                      setHelpSending(false);
                    }
                  }}
                  style={{
                    width: "100%", padding: "10px 0", borderRadius: 8,
                    cursor: helpSending || !helpFeedback.trim() ? "default" : "pointer",
                    background: !helpFeedback.trim() ? T.creamSoft : `linear-gradient(135deg, ${T.copper}, ${T.copperDark})`,
                    border: !helpFeedback.trim() ? `1px solid ${c.border}` : "none",
                    color: !helpFeedback.trim() ? c.stone : T.white,
                    fontFamily: font.ui, fontSize: 13, fontWeight: 600,
                    transition: "opacity 0.15s", opacity: helpSending ? 0.65 : 1,
                    letterSpacing: "0.01em",
                  }}
                  onMouseEnter={(e) => { if (!helpSending && helpFeedback.trim()) e.currentTarget.style.opacity = "0.88"; }}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}>
                  {helpSending ? "Sending..." : "Send Feedback"}
                </button>
              )}

              {/* Secondary email fallback */}
              <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, textAlign: "center" as const, margin: "10px 0 0" }}>
                Or email{" "}
                <CopyEmailLink email="hello@hirestepx.com" style={{ color: T.copper, textDecoration: "none", fontWeight: 500 }} />
              </p>
            </div>
          </div>
        )}

        {/* FAB button */}
        <button
          onClick={() => setHelpOpen(v => !v)}
          aria-label={helpOpen ? "Close help" : "Open help"}
          style={{
            width: 48, height: 48, borderRadius: "50%", border: `1px solid ${c.border}`,
            background: c.graphite, color: c.ivory, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: shadow.cta, transition: "border-color 0.2s, transform 0.2s",
            marginLeft: "auto",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.gilt; e.currentTarget.style.transform = "scale(1.05)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.transform = "scale(1)"; }}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </button>
      </div>

    </div>
  );
}
