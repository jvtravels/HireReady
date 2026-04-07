import { useState, useEffect, useRef } from "react";
import { c, font } from "./tokens";
import { scoreLabel, scoreLabelColor } from "./dashboardTypes";
import type { DashboardSession } from "./dashboardTypes";
import { useAuth } from "./AuthContext";
import { FREE_SESSION_LIMIT, STARTER_WEEKLY_LIMIT } from "./dashboardData";

/* ─── Skeleton Loading ─── */
export function DashboardSkeleton() {
  return (
    <div style={{ padding: "32px 0" }}>
      <div className="skeleton skeleton-heading" style={{ width: "40%" }} />
      <div className="skeleton skeleton-text" style={{ width: "65%", marginBottom: 24 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton-card">
            <div className="skeleton skeleton-text-sm" style={{ width: "50%" }} />
            <div className="skeleton" style={{ height: 28, width: "40%", marginBottom: 8 }} />
            <div className="skeleton skeleton-text-sm" style={{ width: "60%" }} />
          </div>
        ))}
      </div>
      <div className="skeleton-card" style={{ marginBottom: 16 }}>
        <div className="skeleton skeleton-text" style={{ width: "30%" }} />
        <div className="skeleton" style={{ height: 120, width: "100%" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[1, 2].map(i => (
          <div key={i} className="skeleton-card">
            <div className="skeleton skeleton-text" style={{ width: "45%" }} />
            <div className="skeleton skeleton-text" style={{ width: "80%" }} />
            <div className="skeleton skeleton-text" style={{ width: "60%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DataLoadingSkeleton() {
  const [showSlowMsg, setShowSlowMsg] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowSlowMsg(true), 3000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{ padding: "32px 0" }}>
      {showSlowMsg && (
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Still loading... check your connection if this persists.</p>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <div className="skeleton skeleton-heading" style={{ width: 280 }} />
          <div className="skeleton skeleton-text-sm" style={{ width: 200 }} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="skeleton" style={{ width: 80, height: 36 }} />
          <div className="skeleton" style={{ width: 80, height: 36 }} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="skeleton-card">
            <div className="skeleton skeleton-text-sm" style={{ width: "50%" }} />
            <div className="skeleton" style={{ height: 28, width: "35%", marginBottom: 8 }} />
            <div className="skeleton skeleton-text-sm" style={{ width: "55%" }} />
          </div>
        ))}
      </div>
      <div className="skeleton-card" style={{ marginBottom: 24, padding: "24px 32px" }}>
        <div className="skeleton skeleton-text" style={{ width: "50%" }} />
        <div className="skeleton skeleton-text" style={{ width: "70%", marginBottom: 16 }} />
        <div className="skeleton" style={{ width: 140, height: 40 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
        <div className="skeleton-card" style={{ minHeight: 200 }}>
          <div className="skeleton skeleton-text" style={{ width: "30%" }} />
          <div className="skeleton" style={{ height: 140, width: "100%", marginTop: 12 }} />
        </div>
        <div className="skeleton-card" style={{ minHeight: 200 }}>
          <div className="skeleton skeleton-text" style={{ width: "40%" }} />
          <div className="skeleton skeleton-text" style={{ width: "90%", marginTop: 12 }} />
          <div className="skeleton skeleton-text" style={{ width: "75%" }} />
          <div className="skeleton skeleton-text" style={{ width: "85%" }} />
        </div>
      </div>
    </div>
  );
}

/* ─── Upgrade Modal ─── */
const ALL_PLANS = [
  { id: "free", tier: "free", name: "Free", price: "\u20B90", period: "", desc: `${FREE_SESSION_LIMIT} sessions total`, features: [`${FREE_SESSION_LIMIT} mock interviews`, "Behavioral questions", "Basic score & feedback"], featured: false },
  { id: "weekly", tier: "starter", name: "Starter", price: "\u20B949", period: "/week", desc: `${STARTER_WEEKLY_LIMIT} sessions per week`, features: [`${STARTER_WEEKLY_LIMIT} sessions/week`, "All question types", "Detailed feedback & skill scores", "Resume analysis", "PDF export"], featured: false },
  { id: "monthly", tier: "pro", name: "Pro", price: "\u20B9149", period: "/mo", desc: "Best value \u2014 unlimited prep", features: ["Unlimited sessions", "Full AI coaching feedback", "Performance analytics & trends", "Interview calendar", "Export PDF, CSV, JSON"], featured: true },
];

export function UpgradeModal({ onClose, sessionsUsed, user, currentTier, onPaymentSuccess }: { onClose: () => void; sessionsUsed: number; user?: { id?: string; email?: string; name?: string } | null; currentTier: string; onPaymentSuccess: (tier: string, start: string, end: string) => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Store Razorpay response + plan in state so useEffect handles verification
  // (fetch inside Razorpay's handler callback doesn't work reliably)
  const [pendingVerification, setPendingVerification] = useState<{
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    plan: string;
  } | null>(null);
  const authHeadersRef = useRef<Record<string, string>>({});

  const [verifyRetries, setVerifyRetries] = useState(0);

  // Verify payment in React lifecycle, not in Razorpay callback
  useEffect(() => {
    if (!pendingVerification) return;
    let cancelled = false;
    setLoading("verifying");
    setError("");

    const attemptVerify = (attempt: number) => {
      fetch("/api/verify-payment", {
        method: "POST",
        headers: authHeadersRef.current,
        body: JSON.stringify(pendingVerification),
      })
        .then(r => r.json())
        .then(verifyData => {
          if (cancelled) return;
          if (verifyData.success) {
            onPaymentSuccess(verifyData.subscriptionTier, verifyData.subscriptionStart, verifyData.subscriptionEnd);
          } else {
            setError(verifyData.error || "Payment verification failed. Please try again or contact support@hirloop.com");
            setLoading(null);
          }
        })
        .catch(() => {
          if (cancelled) return;
          // Auto-retry once after 2 seconds with user feedback
          if (attempt < 1) {
            setError("Verification taking longer than expected — retrying...");
            setTimeout(() => { if (!cancelled) attemptVerify(attempt + 1); }, 2000);
          } else {
            setError("Payment verification failed. Your payment was received — try refreshing, or contact support@hirloop.com for help.");
            setVerifyRetries(attempt + 1);
            setLoading(null);
          }
        });
    };

    attemptVerify(0);

    return () => { cancelled = true; };
  }, [pendingVerification, onPaymentSuccess]);

  const retryVerification = () => {
    if (pendingVerification) {
      setPendingVerification({ ...pendingVerification });
    }
  };

  const handleCheckout = async (planId: string) => {
    setLoading(planId);
    setError("");
    try {
      const hdrs = await import("./supabase").then(m => m.authHeaders());
      authHeadersRef.current = hdrs;
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({ plan: planId, userId: user?.id, email: user?.email }),
      });
      const data = await res.json();
      if (!data.orderId) {
        setError(data.error || "Could not start checkout. Please try again.");
        setLoading(null);
        return;
      }
      if (!(window as any).Razorpay) {
        // Dynamically load Razorpay checkout script with timeout
        try {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://checkout.razorpay.com/v1/checkout.js";
            const timer = setTimeout(() => { reject(new Error("timeout")); }, 10_000);
            s.onload = () => { clearTimeout(timer); resolve(); };
            s.onerror = () => { clearTimeout(timer); reject(); };
            document.head.appendChild(s);
          });
        } catch {
          setError("Payment system failed to load. Check your connection and try again, or contact support@hirloop.com");
          setLoading(null);
          return;
        }
      }

      if (!(window as any).Razorpay) {
        setError("Payment system not available. Please refresh and try again.");
        setLoading(null);
        return;
      }
      const rzp = new (window as any).Razorpay({
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: "Hirloop",
        description: data.description,
        order_id: data.orderId,
        prefill: { email: user?.email || "", name: user?.name || "" },
        theme: { color: "#D4B37F" },
        handler: function (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) {
          setPendingVerification({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            plan: planId,
          });
        },
        modal: { ondismiss: function () { setLoading(null); } },
      });
      rzp.on("payment.failed", function () { setError("Payment failed. Please try again."); setLoading(null); });
      rzp.open();
      // Safety timeout: if Razorpay doesn't open within 8s, reset state
      setTimeout(() => { setLoading(prev => prev === planId ? null : prev); }, 8000);
    } catch (err) {
      console.error("Checkout error:", err);
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("timeout") || msg.includes("Timeout")) {
        setError("Payment system timed out. Please check your connection and try again.");
      } else if (msg.includes("CSP") || msg.includes("Content Security Policy") || msg.includes("unsafe-eval")) {
        setError("Payment blocked by browser security settings. Try disabling browser extensions or use a different browser.");
      } else {
        setError("Something went wrong. Please try again or contact support@hirloop.com");
      }
      setLoading(null);
    }
  };

  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap + Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !modalRef.current) return;
      const focusable = modalRef.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      if (focusable.length === 0) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    document.addEventListener("keydown", handleKeyDown);
    // Focus first button on mount
    const first = modalRef.current?.querySelector<HTMLElement>("button");
    first?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(5,5,6,0.88)", backdropFilter: "blur(8px)" }} onClick={onClose} role="dialog" aria-modal="true" aria-label="Choose your plan">
      <div ref={modalRef} onClick={(e) => e.stopPropagation()} className="upgrade-modal-inner" style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.85) 0%, rgba(17,17,19,0.9) 100%)", backdropFilter: "blur(32px)", WebkitBackdropFilter: "blur(32px)", border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 20, padding: "36px 32px 32px", maxWidth: 680, width: "94%", position: "relative", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <button onClick={onClose} aria-label="Close dialog" style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 4 }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h2 style={{ fontFamily: font.display, fontSize: 24, fontWeight: 400, color: c.ivory, marginBottom: 6 }}>Choose Your Plan</h2>
          <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, lineHeight: 1.5 }}>
            {currentTier === "free" ? `You've used ${sessionsUsed} of ${FREE_SESSION_LIMIT} free sessions. Upgrade to keep going.` : "Manage your plan"}
          </p>
        </div>

        {error && (
          <div style={{ background: "rgba(196,112,90,0.1)", border: `1px solid rgba(196,112,90,0.2)`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, textAlign: "center" }}>
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ember, display: "block", marginBottom: 8 }}>{error}</span>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {verifyRetries > 0 && (
                <button onClick={retryVerification} style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.ivory, background: c.ember, border: "none", borderRadius: 10, padding: "5px 14px", cursor: "pointer" }}>Retry Verification</button>
              )}
              <button onClick={() => { setError(null); setVerifyRetries(0); }} style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt, background: "none", border: `1px solid rgba(212,179,127,0.3)`, borderRadius: 10, padding: "4px 12px", cursor: "pointer" }}>Dismiss</button>
            </div>
          </div>
        )}

        <div className="upgrade-plans-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {ALL_PLANS.map((plan) => {
            const isCurrent = plan.tier === currentTier;
            return (
            <div key={plan.id} style={{
              padding: "24px 20px", borderRadius: 14, position: "relative",
              background: isCurrent ? "rgba(122,158,126,0.06)" : plan.featured ? "rgba(212,179,127,0.04)" : c.obsidian,
              border: `1.5px solid ${isCurrent ? "rgba(122,158,126,0.35)" : plan.featured ? "rgba(212,179,127,0.25)" : c.border}`,
              display: "flex", flexDirection: "column",
            }}>
              {isCurrent && <div style={{ position: "absolute", top: -1, left: 0, right: 0, height: 2, borderRadius: "14px 14px 0 0", background: `linear-gradient(90deg, transparent, ${c.sage}, transparent)` }} />}
              {!isCurrent && plan.featured && <div style={{ position: "absolute", top: -1, left: 0, right: 0, height: 2, borderRadius: "14px 14px 0 0", background: `linear-gradient(90deg, transparent, ${c.gilt}, transparent)` }} />}
              {isCurrent && <span style={{ fontFamily: font.ui, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sage, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                Current Plan
              </span>}
              {!isCurrent && plan.featured && <span style={{ fontFamily: font.ui, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 10 }}>Most Popular</span>}
              <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>{plan.name}</h3>
              <div style={{ marginBottom: 4 }}>
                <span style={{ fontFamily: font.mono, fontSize: 28, fontWeight: 700, color: c.ivory }}>{plan.price}</span>
                {plan.period && <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginLeft: 3 }}>{plan.period}</span>}
              </div>
              <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginBottom: 14 }}>{plan.desc}</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 18px", flex: 1 }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, lineHeight: 1.4, padding: "3px 0", display: "flex", alignItems: "flex-start", gap: 7 }}>
                    <span style={{ color: isCurrent ? c.sage : plan.featured ? c.gilt : c.sage, flexShrink: 0, fontSize: 12, marginTop: 1 }}>&#10003;</span>{f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <div style={{ width: "100%", padding: "10px 16px", borderRadius: 8, border: `1px solid rgba(122,158,126,0.3)`, background: "rgba(122,158,126,0.08)", fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.sage, textAlign: "center" }}>Active</div>
              ) : plan.id === "free" ? (
                <div style={{ width: "100%", padding: "10px 16px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.stone, textAlign: "center" }}>
                  {currentTier === "free" ? "Current" : "Free Tier"}
                </div>
              ) : (
                <button onClick={() => handleCheckout(plan.id)} disabled={!!loading}
                  style={{ width: "100%", padding: "10px 16px", borderRadius: 8, border: plan.featured ? "none" : `1px solid ${c.borderHover}`, background: plan.featured ? `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})` : "transparent", color: plan.featured ? c.obsidian : c.chalk, fontFamily: font.ui, fontSize: 13, fontWeight: 600, cursor: loading ? "wait" : "pointer", opacity: loading && loading !== plan.id ? 0.5 : 1, transition: "all 0.2s" }}
                  onMouseEnter={(e) => { if (!loading) { if (plan.featured) e.currentTarget.style.filter = "brightness(1.15)"; else { e.currentTarget.style.borderColor = c.chalk; e.currentTarget.style.background = "rgba(245,242,237,0.03)"; } } }}
                  onMouseLeave={(e) => { if (plan.featured) e.currentTarget.style.filter = "brightness(1)"; else { e.currentTarget.style.borderColor = c.borderHover; e.currentTarget.style.background = "transparent"; } }}
                >
                  {loading === "verifying" ? "Verifying..." : loading === plan.id ? "Opening Razorpay..." : plan.featured ? "Go Pro" : "Get Started"}
                </button>
              )}
            </div>
            );
          })}
        </div>

        <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, textAlign: "center", marginTop: 16, opacity: 0.7 }}>
          Secure checkout powered by Razorpay · UPI, Cards, Netbanking · Cancel anytime
        </p>
      </div>
    </div>
  );
}

/* ─── Pro Feature Gate ─── */
export function ProGate({ feature, onUpgrade }: { feature: string; onUpgrade: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, textAlign: "center", padding: 40 }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(212,179,127,0.06)", border: `1.5px solid rgba(212,179,127,0.15)`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
        <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <h3 style={{ fontFamily: font.display, fontSize: 22, fontWeight: 400, color: c.ivory, marginBottom: 8 }}>{feature}</h3>
      <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6, maxWidth: 360, marginBottom: 24 }}>
        Upgrade to access {feature.toLowerCase()}. Unlock full analytics, calendar tools, and unlimited sessions with the Pro plan.
      </p>
      <button onClick={onUpgrade} style={{ padding: "12px 28px", borderRadius: 10, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian, fontFamily: font.ui, fontSize: 14, fontWeight: 600, transition: "opacity 0.2s" }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
        onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
      >
        Upgrade to Pro
      </button>
    </div>
  );
}

/* ─── Welcome Dashboard (no sessions) ─── */
export function EmptyState({ onStart, userName, targetRole, isMobile }: { onStart: () => void; userName: string; targetRole: string; isMobile?: boolean }) {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = userName ? userName.split(" ")[0] : "there";

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontFamily: font.ui, fontSize: isMobile ? 20 : 26, fontWeight: 600, color: c.ivory, marginBottom: 6 }}>
        {timeGreeting}, {firstName}
      </h1>
      <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, marginBottom: 32 }}>
        {targetRole ? `Let's get you ready for your ${targetRole} interview.` : "Let's get you interview-ready."}
      </p>

      <div style={{ background: `linear-gradient(135deg, rgba(212,179,127,0.1) 0%, ${c.graphite} 100%)`, borderRadius: 16, border: `1px solid rgba(212,179,127,0.15)`, padding: isMobile ? "32px 24px" : "48px 40px", textAlign: "center", marginBottom: 28 }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, margin: "0 auto 24px", background: "rgba(212,179,127,0.08)", border: `1px solid rgba(212,179,127,0.2)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 60px rgba(212,179,127,0.08)" }}>
          <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
        </div>
        <h2 style={{ fontFamily: font.display, fontSize: isMobile ? 22 : 28, fontWeight: 400, color: c.ivory, marginBottom: 10, letterSpacing: "-0.02em" }}>Start your first mock interview</h2>
        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6, marginBottom: 28, maxWidth: 420, margin: "0 auto 28px" }}>
          Our AI interviewer will ask you real questions, listen to your answers, and give you detailed feedback — just like a real interview, but without the pressure.
        </p>
        <button className="shimmer-btn" onClick={onStart}
          style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 500, padding: "14px 36px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10, boxShadow: "0 8px 32px rgba(212,179,127,0.15)" }}
          onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21" /></svg>
          Begin Practice Session
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { step: "1", title: "Choose your focus", desc: "Pick an interview type — behavioral, strategic, technical leadership, or case study.", icon: <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
          { step: "2", title: "Practice with AI", desc: "Answer questions out loud. Our AI listens, adapts, and follows up — like a real interviewer.", icon: <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg> },
          { step: "3", title: "Get scored & coached", desc: "Receive detailed scores, skill breakdowns, and AI coaching tips after every session.", icon: <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> },
        ].map((item) => (
          <div key={item.step} style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              {item.icon}
              <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.stone, letterSpacing: "0.08em" }}>STEP {item.step}</span>
            </div>
            <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 6 }}>{item.title}</h3>
            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, lineHeight: 1.5 }}>{item.desc}</p>
          </div>
        ))}
      </div>

      {/* What you'll unlock preview */}
      <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "20px 24px", marginBottom: 28 }}>
        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 14 }}>What you'll unlock after your first session</p>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: 12 }}>
          {[
            { label: "Readiness Score", preview: "85", sub: "Overall readiness" },
            { label: "Skill Breakdown", preview: "5 skills", sub: "Radar chart" },
            { label: "Score Trend", preview: "📈", sub: "Track progress" },
            { label: "AI Coaching", preview: "Tips", sub: "Personalized feedback" },
          ].map(item => (
            <div key={item.label} style={{ padding: "14px 12px", borderRadius: 8, background: c.obsidian, textAlign: "center", opacity: 0.6 }}>
              <span style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 600, color: c.ivory, display: "block", marginBottom: 2 }}>{item.preview}</span>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 500, color: c.chalk, display: "block" }}>{item.label}</span>
              <span style={{ fontFamily: font.ui, fontSize: 9, color: c.stone }}>{item.sub}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="quick-stats-bar" style={{ display: "flex", justifyContent: "center", gap: isMobile ? 24 : 48, padding: "20px 0", borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}` }}>
        {[
          { value: "~15 min", label: "Per session" },
          { value: "5", label: "Skill dimensions" },
          { value: "AI", label: "Personalized questions" },
          { value: "Free", label: "To get started" },
        ].map((item) => (
          <div key={item.label} style={{ textAlign: "center" }}>
            <span style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 600, color: c.gilt, display: "block", marginBottom: 2 }}>{item.value}</span>
            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Session Detail View ─── */
export function SessionDetailView({ session, onBack }: { session: DashboardSession; onBack: () => void }) {
  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: font.ui, fontSize: 13, color: c.stone, background: "none", border: "none", cursor: "pointer", padding: "0 0 20px", outline: "none" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = c.ivory; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; }}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Dashboard
      </button>

      <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "28px 32px", marginBottom: 20 }}>
        <div className="session-detail-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.gilt, background: "rgba(212,179,127,0.08)", padding: "4px 10px", borderRadius: 4 }}>{session.type}</span>
              <span style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>{session.dateLabel} · {session.duration}</span>
            </div>
            <h2 style={{ fontFamily: font.ui, fontSize: 22, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>{session.role}</h2>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 72, height: 72, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="72" height="72" viewBox="0 0 72 72" style={{ position: "absolute", transform: "rotate(-90deg)" }}>
                <circle cx="36" cy="36" r="33" fill="none" stroke="rgba(245,242,237,0.06)" strokeWidth="3" />
                <circle cx="36" cy="36" r="33" fill="none" stroke={scoreLabelColor(session.score)} strokeWidth="3"
                  strokeDasharray={`${(session.score / 100) * 2 * Math.PI * 33} ${2 * Math.PI * 33}`}
                  strokeLinecap="round" className="score-ring" />
              </svg>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ fontFamily: font.mono, fontSize: 26, fontWeight: 700, color: c.ivory, lineHeight: 1 }}>{session.score}</span>
                <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: scoreLabelColor(session.score), marginTop: 2 }}>{scoreLabel(session.score)}</span>
              </div>
            </div>
            <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 600, color: session.change > 0 ? c.sage : c.ember, display: "block", marginTop: 4 }}>
              {session.change > 0 ? "+" : ""}{session.change} vs previous
            </span>
          </div>
        </div>

        <div className="session-detail-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(122,158,126,0.04)", border: `1px solid rgba(122,158,126,0.12)` }}>
            <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.sage, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Top Strength</span>
            <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, color: c.ivory }}>{session.topStrength}</span>
          </div>
          <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(196,112,90,0.04)", border: `1px solid rgba(196,112,90,0.12)` }}>
            <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.ember, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>To Improve</span>
            <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, color: c.ivory }}>{session.topWeakness}</span>
          </div>
        </div>
      </div>

      <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "28px 32px", marginBottom: 20 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, marginBottom: 20 }}>Question Scores</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {session.questionScores.map((q, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", borderRadius: 10, background: c.obsidian, border: `1px solid ${c.border}` }}>
              <div style={{ width: 40, height: 40, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="40" height="40" viewBox="0 0 40 40" style={{ position: "absolute", transform: "rotate(-90deg)" }}>
                  <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(245,242,237,0.06)" strokeWidth="2" />
                  <circle cx="20" cy="20" r="17" fill="none" stroke={scoreLabelColor(q.score)} strokeWidth="2"
                    strokeDasharray={`${(q.score / 100) * 2 * Math.PI * 17} ${2 * Math.PI * 17}`}
                    strokeLinecap="round" className="score-ring" />
                </svg>
                <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 600, color: c.ivory }}>{q.score}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, display: "block", marginBottom: 2 }}>{q.question}</span>
                <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>{q.notes}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "28px 32px", marginBottom: 20 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, marginBottom: 20 }}>Full Transcript</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {session.transcript.map((msg, i) => (
            <div key={i} style={{ display: "flex", gap: 12, flexDirection: msg.speaker === "user" ? "row-reverse" : "row" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: msg.speaker === "ai" ? "rgba(212,179,127,0.1)" : "rgba(122,158,126,0.1)", border: `1px solid ${msg.speaker === "ai" ? "rgba(212,179,127,0.2)" : "rgba(122,158,126,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {msg.speaker === "ai" ? (
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2m-9-11h2m18 0h2M5.6 5.6l1.4 1.4m9.9 9.9l1.4 1.4M5.6 18.4l1.4-1.4m9.9-9.9l1.4-1.4"/></svg>
                ) : (
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                )}
              </div>
              <div style={{ maxWidth: "75%", minWidth: 0 }}>
                <div style={{ padding: "12px 16px", borderRadius: 12, fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.6, background: msg.speaker === "ai" ? c.obsidian : "rgba(122,158,126,0.04)", border: `1px solid ${msg.speaker === "ai" ? c.border : "rgba(122,158,126,0.1)"}`, borderTopLeftRadius: msg.speaker === "ai" ? 4 : 12, borderTopRightRadius: msg.speaker === "user" ? 4 : 12 }}>
                  {msg.text}
                </div>
                {msg.scoreNote && (
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone, display: "block", marginTop: 4, textAlign: msg.speaker === "ai" ? "left" : "right", paddingLeft: msg.speaker === "ai" ? 16 : 0, paddingRight: msg.speaker === "user" ? 16 : 0 }}>
                    {msg.scoreNote}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "28px 32px" }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, marginBottom: 12 }}>AI Coach Summary</h3>
        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, lineHeight: 1.7, margin: 0 }}>{session.feedback}</p>
      </div>
    </div>
  );
}
