import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { track } from "@vercel/analytics";
import { c, font } from "../tokens";
import { useAuth } from "../AuthContext";
import { useReveal } from "../hooks";
import { plans } from "../landingData";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: () => void) => void };
  }
}

export function PricingSection() {
  const ref = useReveal<HTMLElement>();
  return (
    <section id="pricing" ref={ref} className="reveal dot-grid-bg landing-section" style={{ padding: "140px 40px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 80 }}>
        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 16 }}>Pricing</p>
        <h2 className="text-glow" style={{ fontFamily: font.display, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 400, letterSpacing: "-0.02em", color: c.ivory, lineHeight: 1.15, marginBottom: 16 }}>Transparent. No surprises.</h2>
        <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.6, maxWidth: 460, margin: "0 auto" }}>Start free. Upgrade when you're ready. Cancel anytime.</p>
      </div>
      <div className="pricing-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, alignItems: "start" }}>
        {plans.map((p, i) => <PricingCard key={p.name} plan={p} delay={i} />)}
      </div>
    </section>
  );
}

function PricingCard({ plan, delay }: { plan: (typeof plans)[0]; delay: number }) {
  const ref = useReveal<HTMLDivElement>();
  const navigate = useNavigate();
  const { user, isLoggedIn, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleClick = async () => {
    track("cta_click", { cta: `pricing_${plan.name.toLowerCase()}`, plan: plan.name });
    if (plan.price === "Free") {
      navigate(isLoggedIn ? "/session/new" : "/signup");
      return;
    }
    if (!isLoggedIn) { navigate(`/signup?plan=${plan.planId}`); return; }

    setLoading(true);
    setError("");
    try {
      // Try subscription (auto-renewal) first, fall back to one-time order
      let useSubscription = false;
      let data: { orderId?: string; subscriptionId?: string; keyId?: string; amount?: number; currency?: string; description?: string; error?: string } | null;

      const authHdrs = await import("../supabase").then(m => m.authHeaders());
      try {
        const subRes = await fetch("/api/create-subscription", {
          method: "POST",
          headers: authHdrs,
          body: JSON.stringify({ plan: plan.planId, userId: user?.id, email: user?.email }),
        });
        const subData = await subRes.json();
        if (subData.subscriptionId) {
          useSubscription = true;
          data = subData;
        } else {
          // Subscription failed (503 = not configured, or other error) — fall back to one-time order
          data = null;
        }
      } catch {
        data = null;
      }

      if (!data) {
        // Fall back to one-time order
        const orderRes = await fetch("/api/create-order", {
          method: "POST",
          headers: authHdrs,
          body: JSON.stringify({ plan: plan.planId, userId: user?.id, email: user?.email }),
        });
        const orderData = await orderRes.json() as { orderId?: string; subscriptionId?: string; keyId?: string; amount?: number; currency?: string; description?: string; error?: string };
        data = orderData;
        if (!orderData?.orderId) {
          setError(orderData?.error || "Checkout unavailable. Please try again.");
          setLoading(false);
          return;
        }
      }

      // Dynamically load Razorpay if not already loaded
      if (!window.Razorpay) {
        try {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://checkout.razorpay.com/v1/checkout.js";
            s.onload = () => resolve();
            s.onerror = () => reject();
            document.head.appendChild(s);
          });
        } catch {
          setError("Payment system failed to load. Please refresh.");
          setLoading(false);
          return;
        }
      }
      if (!data) { setError("Checkout unavailable. Please try again."); setLoading(false); return; }
      if (!window.Razorpay) { setError("Payment system not available. Please refresh."); setLoading(false); return; }
      {
        const RazorpayClass = window.Razorpay;
        const options: Record<string, unknown> = {
          key: data.keyId,
          name: "HireStepX",
          description: data.description,
          prefill: { email: user?.email || "", name: user?.name || "" },
          theme: { color: "#D4B37F" },
          modal: { ondismiss: () => setLoading(false) },
        };

        if (useSubscription) {
          options.subscription_id = data.subscriptionId;
          options.handler = async (response: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => {
            try {
              const authHdrs = await import("../supabase").then(m => m.authHeaders());
              const verifyRes = await fetch("/api/verify-payment", {
                method: "POST",
                headers: authHdrs,
                body: JSON.stringify({
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_subscription_id: response.razorpay_subscription_id,
                  razorpay_signature: response.razorpay_signature,
                  plan: plan.planId,
                }),
              });
              const verifyData = await verifyRes.json();
              if (verifyData.success) {
                updateUser({ subscriptionTier: verifyData.subscriptionTier, subscriptionStart: verifyData.subscriptionStart, subscriptionEnd: verifyData.subscriptionEnd });
                navigate("/dashboard?payment=success");
              } else {
                setError(verifyData.error || "Payment verification failed.");
                setLoading(false);
              }
            } catch {
              setError("Payment verification failed. Contact support.");
              setLoading(false);
            }
          };
        } else {
          options.amount = data.amount;
          options.currency = data.currency;
          options.order_id = data.orderId;
          options.handler = async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
            try {
              const authHdrs = await import("../supabase").then(m => m.authHeaders());
              const verifyRes = await fetch("/api/verify-payment", {
                method: "POST",
                headers: authHdrs,
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  plan: plan.planId,
                }),
              });
              const verifyData = await verifyRes.json();
              if (verifyData.success) {
                updateUser({ subscriptionTier: verifyData.subscriptionTier, subscriptionStart: verifyData.subscriptionStart, subscriptionEnd: verifyData.subscriptionEnd });
                navigate("/dashboard?payment=success");
              } else {
                setError(verifyData.error || "Payment verification failed.");
                setLoading(false);
              }
            } catch {
              setError("Payment verification failed. Contact support.");
              setLoading(false);
            }
          };
        }

        const rzp = new RazorpayClass(options);
        rzp.on("payment.failed", () => { setError("Payment failed. Please try again."); setLoading(false); });
        rzp.open();
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div ref={ref} className={`reveal reveal-delay-${delay + 1} gradient-border-card ${plan.featured ? "pricing-featured" : ""}`} style={{
      padding: "36px 32px", position: "relative", overflow: "hidden", zIndex: 0,
      borderColor: plan.featured ? `rgba(212,179,127,0.2)` : undefined,
    }}>
      {plan.featured && <div style={{ position: "absolute", top: -1, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${c.gilt}, transparent)` }} />}
      {plan.featured && <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, display: "block", marginBottom: 16 }}>Most Popular</span>}

      <h3 style={{ fontFamily: font.ui, fontSize: 18, fontWeight: 600, color: c.ivory, marginBottom: 8, position: "relative" }}>{plan.name}</h3>
      <div style={{ marginBottom: 16, position: "relative" }}>
        <span style={{ fontFamily: font.mono, fontSize: 36, fontWeight: 600, color: c.ivory, letterSpacing: "-0.02em" }}>{plan.price}</span>
        {plan.period && <span style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, marginLeft: 4 }}>{plan.period}</span>}
      </div>
      <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, lineHeight: 1.5, marginBottom: 24, position: "relative" }}>{plan.description}</p>
      <ul style={{ listStyle: "none", padding: 0, marginBottom: 28, position: "relative" }}>
        {plan.features.map((f) => (
          <li key={f} style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.5, padding: "6px 0", display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ color: plan.featured ? c.gilt : c.sage, flexShrink: 0, marginTop: 1, fontSize: 14 }}>&#10003;</span>{f}
          </li>
        ))}
      </ul>
      <button onClick={handleClick} disabled={loading} className={plan.featured ? "shimmer-btn premium-btn" : ""} style={{
        width: "100%", fontFamily: font.ui, fontSize: 14, fontWeight: 600, padding: "14px 24px",
        borderRadius: 12, border: plan.featured ? "none" : `1px solid rgba(255,255,255,0.08)`,
        background: plan.featured ? undefined : "rgba(255,255,255,0.03)", color: plan.featured ? c.obsidian : c.chalk,
        cursor: loading ? "wait" : "pointer", transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)", position: "relative",
        opacity: loading ? 0.7 : 1,
      }}
        onMouseEnter={(e) => {
          if (plan.featured) { e.currentTarget.style.filter = "brightness(1.15)"; }
          else { e.currentTarget.style.borderColor = c.chalk; e.currentTarget.style.color = c.ivory; e.currentTarget.style.background = "rgba(245,242,237,0.03)"; }
        }}
        onMouseLeave={(e) => {
          if (plan.featured) { e.currentTarget.style.filter = "brightness(1)"; }
          else { e.currentTarget.style.borderColor = c.borderHover; e.currentTarget.style.color = c.chalk; e.currentTarget.style.background = "transparent"; }
        }}>
        {loading ? "Redirecting to checkout..." : plan.cta}
      </button>
      {error && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 }}>
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.ember, margin: 0 }}>{error}</p>
          <button onClick={() => setError("")} style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.gilt, background: "none", border: `1px solid rgba(212,179,127,0.3)`, borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
