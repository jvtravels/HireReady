import { useState, useEffect } from "react";
import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { useDashboard } from "./DashboardContext";
import { UpgradeModal } from "./dashboardComponents";
import { FREE_SESSION_LIMIT, STARTER_WEEKLY_LIMIT } from "./dashboardData";

/* ─── Sidebar Nav Items ─── */
const navItems = [
  { id: "dashboard", path: "/dashboard", label: "Dashboard", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
  { id: "sessions", path: "/dashboard/sessions", label: "Sessions", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg> },
  { id: "calendar", path: "/dashboard/calendar", label: "Calendar", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { id: "analytics", path: "/dashboard/analytics", label: "Analytics", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> },
  { id: "resume", path: "/dashboard/resume", label: "Resume", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> },
  { id: "settings", path: "/dashboard/settings", label: "Settings", icon: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
];

export default function DashboardLayout() {
  const nav = useNavigate();
  const location = useLocation();
  const { logout: authLogout, user, updateUser: authUpdateUser } = useAuth();
  const {
    isMobile, displayName, persisted,
    isFree, isStarter, isPro,
    sessionsUsed, sessionsRemaining, starterRemaining, sessionsThisWeek,
    showUpgradeModal, setShowUpgradeModal,
    paymentBanner, setPaymentBanner,
    syncError, setSyncError,
  } = useDashboard();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobile && sidebarOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isMobile, sidebarOpen]);

  // Determine active nav from current route
  const activeNav = (() => {
    const path = location.pathname;
    if (path === "/dashboard" || path === "/dashboard/") return "dashboard";
    const match = navItems.find(item => item.path !== "/dashboard" && path.startsWith(item.path));
    return match?.id || "dashboard";
  })();

  return (
    <div style={{ display: "flex", height: "100vh", background: c.obsidian, overflow: "hidden" }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {isMobile && sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 19 }} />}

      {/* Sidebar */}
      <aside role="complementary" aria-label="Navigation sidebar" style={{
        width: 240, borderRight: `1px solid ${c.border}`, padding: "24px 16px 0",
        display: "flex", flexDirection: "column", position: "fixed", top: 0, bottom: 0,
        background: c.obsidian, zIndex: 20, overflow: "hidden",
        transform: isMobile ? (sidebarOpen ? "translateX(0)" : "translateX(-100%)") : "translateX(0)",
        transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 36, padding: "0 12px" }}>
          <Link to="/" style={{ textDecoration: "none" }}><span style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory, letterSpacing: "0.06em" }}>HireReady</span></Link>
          {isMobile && <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 4 }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
        </div>
        <nav aria-label="Main navigation" style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 auto", overflow: "hidden" }}>
          {navItems.map((item) => (
            <button key={item.id}
              aria-current={activeNav === item.id ? "page" : undefined}
              aria-label={item.label}
              onClick={() => { nav(item.path); if (isMobile) setSidebarOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                borderRadius: 8, border: "none", cursor: "pointer",
                background: activeNav === item.id ? "rgba(201,169,110,0.08)" : "transparent",
                color: activeNav === item.id ? c.ivory : c.stone,
                fontFamily: font.ui, fontSize: 13, fontWeight: 500,
                transition: "all 0.2s ease", textAlign: "left", outline: "none",
              }}
              onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px ${c.gilt}40`}
              onBlur={(e) => e.currentTarget.style.boxShadow = "none"}
              onMouseEnter={(e) => { if (activeNav !== item.id) e.currentTarget.style.background = "rgba(240,237,232,0.03)"; }}
              onMouseLeave={(e) => { if (activeNav !== item.id) e.currentTarget.style.background = "transparent"; }}
            >
              {item.icon}{item.label}
              {activeNav === item.id && <div style={{ width: 3, height: 16, borderRadius: 2, background: c.gilt, marginLeft: "auto" }} />}
            </button>
          ))}
        </nav>

        {/* Plan Status */}
        <div style={{ margin: "0 8px 12px", padding: "14px 14px", borderRadius: 10, background: isPro ? "rgba(122,158,126,0.04)" : "rgba(201,169,110,0.04)", border: `1px solid ${isPro ? "rgba(122,158,126,0.12)" : "rgba(201,169,110,0.12)"}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            {isPro ? (
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
            ) : isStarter ? (
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            ) : (
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            )}
            <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: isPro ? c.sage : c.gilt }}>
              {isPro ? "Pro Plan" : isStarter ? "Starter Plan" : "Free Plan"}
            </span>
          </div>
          <p style={{ fontFamily: font.ui, fontSize: 11, color: (isFree && sessionsRemaining <= 1 && sessionsRemaining > 0) || (isStarter && starterRemaining <= 2 && starterRemaining > 0) ? c.ember : c.stone, lineHeight: 1.5, marginBottom: user?.subscriptionEnd && !isFree ? 4 : 10, fontWeight: (isFree && sessionsRemaining <= 1) || (isStarter && starterRemaining <= 2) ? 600 : 400 }}>
            {isPro ? "Unlimited sessions" : isStarter ? `${starterRemaining} of ${STARTER_WEEKLY_LIMIT} sessions left this week${starterRemaining <= 2 && starterRemaining > 0 ? " — running low!" : ""}` : sessionsRemaining > 0 ? `${sessionsRemaining} of ${FREE_SESSION_LIMIT} session${sessionsRemaining !== 1 ? "s" : ""} remaining${sessionsRemaining === 1 ? " — last one!" : ""}` : "No sessions remaining"}
          </p>
          {user?.subscriptionEnd && !isFree && (
            <p style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, opacity: 0.7, marginBottom: 10 }}>
              Renews {new Date(user.subscriptionEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </p>
          )}
          {(isFree || isStarter) && (
            <div style={{ height: 3, borderRadius: 2, background: c.border, marginBottom: 12 }}>
              {isFree ? (
                <div style={{ height: "100%", borderRadius: 2, background: sessionsRemaining === 0 ? c.ember : c.gilt, width: `${Math.min(100, (sessionsUsed / FREE_SESSION_LIMIT) * 100)}%`, transition: "width 0.3s" }} />
              ) : (
                <div style={{ height: "100%", borderRadius: 2, background: starterRemaining === 0 ? c.ember : c.gilt, width: `${Math.min(100, (sessionsThisWeek / STARTER_WEEKLY_LIMIT) * 100)}%`, transition: "width 0.3s" }} />
              )}
            </div>
          )}
          {isPro ? (
            <button onClick={() => setShowUpgradeModal(true)} style={{ width: "100%", padding: "8px 0", borderRadius: 8, cursor: "pointer", border: `1px solid rgba(122,158,126,0.2)`, background: "rgba(122,158,126,0.06)", color: c.sage, fontFamily: font.ui, fontSize: 12, fontWeight: 600, transition: "opacity 0.2s" }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
              onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
            >Manage Plan</button>
          ) : (
            <button onClick={() => setShowUpgradeModal(true)} style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${c.gilt}, #B8923E)`, color: c.obsidian, fontFamily: font.ui, fontSize: 12, fontWeight: 600, transition: "opacity 0.2s" }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
              onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
            >Upgrade to Pro</button>
          )}
        </div>

        {/* User info */}
        <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 8, padding: "14px 12px 16px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={displayName} style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(201,169,110,0.12)", border: `1px solid rgba(201,169,110,0.2)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.gilt }}>{(displayName || "?")[0].toUpperCase()}</span>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</p>
              <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{user?.targetRole || persisted.targetRole || "Set your target role"}</p>
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
      <main style={{ flex: 1, marginLeft: isMobile ? 0 : 240, padding: isMobile ? "20px 16px 60px" : "32px 40px 60px", overflowY: "auto", height: "100vh" }}>
        {isMobile && (
          <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu" aria-expanded={sidebarOpen}
            style={{ background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", marginBottom: 20, color: c.ivory, display: "flex", alignItems: "center", gap: 8 }}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500 }}>Menu</span>
          </button>
        )}

        {/* Payment success/cancel banner */}
        {paymentBanner && (
          <div role="alert" style={{ padding: "12px 16px", marginBottom: 16, borderRadius: 10, background: paymentBanner === "success" ? "rgba(122,158,126,0.08)" : "rgba(196,112,90,0.08)", border: `1px solid ${paymentBanner === "success" ? "rgba(122,158,126,0.2)" : "rgba(196,112,90,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {paymentBanner === "success" ? (
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              ) : (
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              )}
              <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: paymentBanner === "success" ? c.sage : c.ember }}>
                {paymentBanner === "success" ? "Payment successful! Your account has been upgraded." : "Payment was cancelled. You can upgrade anytime."}
              </span>
            </div>
            <button onClick={() => setPaymentBanner(null)} style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 2 }}>
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {/* Sync error banner */}
        {syncError && (
          <div role="alert" style={{ padding: "10px 16px", marginBottom: 16, borderRadius: 8, background: "rgba(196,112,90,0.08)", border: "1px solid rgba(196,112,90,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ember }}>{syncError}</span>
            </div>
            <button onClick={() => setSyncError("")} style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 2 }}>
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        <Outlet />
      </main>

      {/* Upgrade modal */}
      {showUpgradeModal && (
        <UpgradeModal
          onClose={() => setShowUpgradeModal(false)}
          sessionsUsed={sessionsUsed}
          user={user}
          currentTier={user?.subscriptionTier || "free"}
          onPaymentSuccess={(tier, start, end) => {
            setShowUpgradeModal(false);
            setPaymentBanner("success");
            setTimeout(() => setPaymentBanner(null), 8000);
            authUpdateUser({ subscriptionTier: tier as "starter" | "pro", subscriptionStart: start, subscriptionEnd: end });
          }}
        />
      )}
    </div>
  );
}
