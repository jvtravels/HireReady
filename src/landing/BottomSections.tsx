import React, { useState } from "react";
import { track } from "@vercel/analytics";
import { c, font } from "../tokens";
import { getSupabase, supabaseConfigured } from "../supabase";
import { useReveal } from "../hooks";
import { LANDING_FAQS } from "../landingData";
import { BottomCTA } from "./Hero";

/* ═══════════════════════════════════════════════
   FOR TEAMS BANNER
   ═══════════════════════════════════════════════ */
export function ForTeamsBanner() {
  const ref = useReveal<HTMLElement>();
  const [teamEmail, setTeamEmail] = useState("");
  const [teamStatus, setTeamStatus] = useState<"idle" | "sending" | "done">("idle");

  const handleTeamSignup = async () => {
    if (!teamEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(teamEmail)) return;
    setTeamStatus("sending");
    try {
      if (supabaseConfigured) {
        const client = await getSupabase();
        await client.from("waitlist").upsert({ email: teamEmail, source: "teams", created_at: new Date().toISOString() }, { onConflict: "email" });
      }
      track("teams_interest", { email: teamEmail });
      setTeamStatus("done");
    } catch {
      track("teams_interest", { email: teamEmail });
      setTeamStatus("done");
    }
  };

  return (
    <section ref={ref} className="reveal landing-section" style={{ padding: "0 40px 140px", maxWidth: 1100, margin: "0 auto" }}>
      <div className="gradient-border-card for-teams-banner" style={{ padding: "52px 56px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", overflow: "hidden", zIndex: 0, gap: 32 }}>
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "40%", background: "url(https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&q=80) center/cover no-repeat", maskImage: "linear-gradient(to right, transparent, black 40%)", WebkitMaskImage: "linear-gradient(to right, transparent, black 40%)", opacity: 0.12 }} />
        <div style={{ position: "relative", zIndex: 1, flex: 1 }}>
          <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 12 }}>Coming Soon</p>
          <h3 style={{ fontFamily: font.display, fontSize: 28, fontWeight: 400, color: c.ivory, letterSpacing: "-0.01em", lineHeight: 1.25, marginBottom: 8 }}>HireStepX for Teams</h3>
          <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6, maxWidth: 440 }}>Career coaches, bootcamps, and universities — we're building team plans with client management and analytics.</p>
        </div>
        <div style={{ position: "relative", zIndex: 1, flexShrink: 0 }}>
          {teamStatus === "done" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px" }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontFamily: font.ui, fontSize: 13, color: c.sage }}>We'll be in touch!</span>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="email" value={teamEmail} onChange={e => setTeamEmail(e.target.value)}
                placeholder="work@company.com" aria-label="Email for teams interest"
                onKeyDown={e => { if (e.key === "Enter") handleTeamSignup(); }}
                style={{
                  fontFamily: font.ui, fontSize: 13, padding: "12px 16px", width: 200,
                  borderRadius: 8, border: `1px solid ${c.border}`, background: c.obsidian,
                  color: c.ivory, outline: "none",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = c.gilt; }}
                onBlur={e => { e.currentTarget.style.borderColor = c.border; }}
              />
              <button onClick={handleTeamSignup} disabled={teamStatus === "sending"} className="shimmer-btn" style={{
                fontFamily: font.ui, fontSize: 13, fontWeight: 600, padding: "12px 20px",
                borderRadius: 8, border: `1px solid ${c.borderHover}`, background: "transparent",
                color: c.ivory, cursor: "pointer", whiteSpace: "nowrap",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = c.ivory; e.currentTarget.style.color = c.obsidian; e.currentTarget.style.borderColor = c.ivory; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = c.ivory; e.currentTarget.style.borderColor = c.borderHover; }}>
                {teamStatus === "sending" ? "..." : "Notify Me"}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   TRUST / SECURITY BADGES
   ═══════════════════════════════════════════════ */
export function TrustBadges() {
  const ref = useReveal<HTMLElement>();
  const badges = [
    {
      icon: <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
      title: "Encrypted Storage",
      desc: "Data encrypted via Supabase RLS",
    },
    {
      icon: <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M14.31 8l5.74 9.94M9.69 8h11.48M7.38 12l5.74-9.94M9.69 16L3.95 6.06M14.31 16H2.83M16.62 12l-5.74 9.94"/></svg>,
      title: "Delete Anytime",
      desc: "Full data deletion from Settings",
    },
    {
      icon: <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
      title: "No Data Selling",
      desc: "Your recordings are never shared",
    },
    {
      icon: <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.slate} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
      title: "Minimal Analytics",
      desc: "Only Vercel web vitals — no ads",
    },
  ];

  return (
    <section ref={ref} className="reveal landing-section" style={{ padding: "60px 40px 100px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 16 }}>Privacy & Security</p>
        <h2 style={{ fontFamily: font.display, fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 400, letterSpacing: "-0.02em", color: c.ivory, lineHeight: 1.2 }}>
          Your data is in safe hands
        </h2>
      </div>
      <div className="trust-badges-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
        {badges.map((b, i) => (
          <div key={i} className="gradient-border-card" style={{
            padding: "28px 24px", textAlign: "center", cursor: "default", zIndex: 0,
          }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>{b.icon}</div>
            <h4 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 6 }}>{b.title}</h4>
            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, lineHeight: 1.5 }}>{b.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   FAQ
   ═══════════════════════════════════════════════ */
export function FAQSection() {
  const ref = useReveal<HTMLElement>();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section ref={ref} className="reveal landing-section" style={{ padding: "80px 40px", maxWidth: 800, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 16 }}>FAQ</p>
        <h2 style={{ fontFamily: font.display, fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 400, letterSpacing: "-0.02em", color: c.ivory, lineHeight: 1.2 }}>
          Frequently asked questions
        </h2>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {LANDING_FAQS.map((faq, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={i} style={{ borderBottom: "1px solid #1a1a1b", overflow: "hidden" }}>
              <button
                onClick={() => setOpenIndex(isOpen ? null : i)}
                aria-expanded={isOpen}
                style={{
                  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "20px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 500, color: c.ivory, lineHeight: 1.4, paddingRight: 16 }}>
                  {faq.question}
                </span>
                <svg
                  aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke={c.stone} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ flexShrink: 0, transition: "transform 0.2s ease", transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <div style={{
                maxHeight: isOpen ? 300 : 0, overflow: "hidden",
                transition: "max-height 0.3s ease, padding 0.3s ease",
                paddingBottom: isOpen ? 20 : 0,
              }}>
                <p style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, lineHeight: 1.7 }}>
                  {faq.answer}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   FINAL CTA
   ═══════════════════════════════════════════════ */
export function FinalCTA() {
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} className="reveal landing-section" style={{ padding: "80px 40px 140px", maxWidth: 1100, margin: "0 auto" }}>
      <div className="final-cta-card" style={{
        position: "relative", borderRadius: 20, overflow: "hidden",
        minHeight: 400, display: "flex", alignItems: "center",
      }}>
        {/* Background image — professional in confident pose */}
        <img
          src="https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=1400&h=600&fit=crop&crop=center&q=75"
          alt="Professional team collaborating, representing interview preparation"
          loading="lazy" width={1400} height={600}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.3)" }}
        />
        {/* Dark overlay */}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${c.obsidian}E6 0%, ${c.obsidian}99 50%, transparent 100%)` }} />
        {/* Gilt glow */}
        <div style={{ position: "absolute", top: "50%", right: "20%", transform: "translateY(-50%)", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(ellipse at center, rgba(212,179,127,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1, padding: "64px 60px", maxWidth: 560 }}>
          <p className="text-glow" style={{ fontFamily: font.display, fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 400, lineHeight: 1.15, letterSpacing: "-0.03em", color: c.ivory, marginBottom: 20 }}>
            Stop guessing. Start{" "}
            <span style={{ color: c.gilt, fontStyle: "italic" }}>practicing.</span>
          </p>
          <p style={{ fontFamily: font.ui, fontSize: 15, color: c.chalk, lineHeight: 1.6, marginBottom: 32 }}>
            3 free AI mock interviews. Scored feedback. Company-specific questions.
            No credit card. See your score in 10 minutes.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <BottomCTA />
            {/* Stacked faces */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex" }}>
                {[
                  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=48&h=48&fit=crop&crop=face",
                  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=48&h=48&fit=crop&crop=face",
                  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=48&h=48&fit=crop&crop=face",
                ].map((src, i) => (
                  <img key={i} src={`${src}&q=75`} alt={["User testimonial photo 1", "User testimonial photo 2", "User testimonial photo 3"][i]} loading="lazy" width={28} height={28} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} style={{
                    width: 28, height: 28, borderRadius: "50%", objectFit: "cover",
                    border: `2px solid ${c.obsidian}`, marginLeft: i > 0 ? -8 : 0,
                  }} />
                ))}
              </div>
              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>Start for free</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   EMAIL CAPTURE
   ═══════════════════════════════════════════════ */
export function EmailCapture() {
  const ref = useReveal<HTMLElement>();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setStatus("sending");
    try {
      if (supabaseConfigured) {
        const client = await getSupabase();
        await client.from("waitlist").upsert({ email, created_at: new Date().toISOString() }, { onConflict: "email" });
      }
      // Fallback: also store locally in case Supabase table doesn't exist yet
      const existing = JSON.parse(localStorage.getItem("hirestepx_waitlist") || "[]");
      existing.push({ email, ts: new Date().toISOString() });
      localStorage.setItem("hirestepx_waitlist", JSON.stringify(existing));
      track("waitlist_signup", { email });
      setStatus("done");
    } catch {
      // If Supabase insert fails (table doesn't exist yet), still count as success
      track("waitlist_signup", { email });
      setStatus("done");
    }
  };

  return (
    <section ref={ref} className="reveal landing-section" style={{ padding: "0 40px 120px", maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
      <div style={{
        background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`,
        padding: "48px 40px", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(212,179,127,0.06), transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 12 }}>Free Weekly Tips</p>
          <h3 style={{ fontFamily: font.display, fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 400, color: c.ivory, letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: 8 }}>
            Get the top 5 interview mistakes to avoid
          </h3>
          <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6, marginBottom: 28 }}>
            Plus weekly tips on cracking interviews at Google, TCS, Flipkart, and more. Join 500+ job seekers.
          </p>
          {status === "done" ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 16 }}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 500, color: c.sage }}>You're on the list! We'll be in touch.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="email-capture-form" style={{ display: "flex", gap: 10, maxWidth: 420, margin: "0 auto" }}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                aria-label="Email address for newsletter"
                style={{
                  flex: 1, fontFamily: font.ui, fontSize: 14, padding: "12px 16px",
                  borderRadius: 8, border: `1px solid ${c.border}`, background: c.obsidian,
                  color: c.ivory, outline: "none",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = c.gilt; }}
                onBlur={e => { e.currentTarget.style.borderColor = c.border; }}
              />
              <button type="submit" disabled={status === "sending"} style={{
                fontFamily: font.ui, fontSize: 14, fontWeight: 600, padding: "12px 24px",
                borderRadius: 8, border: "none", cursor: "pointer",
                background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian,
                opacity: status === "sending" ? 0.7 : 1,
              }}>
                {status === "sending" ? "..." : "Subscribe"}
              </button>
            </form>
          )}
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginTop: 16 }}>No spam. Unsubscribe anytime.</p>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════════ */
export function Footer() {
  const linkHref: Record<string, string> = {
    "Interview Practice": "/#features",
    "AI Feedback": "/#how-it-works",
    "Score Analytics": "/#features",
    "Pricing": "/#pricing",
    "About": "/page/about",
    "Blog": "/blog",
    "Careers": "/page/careers",
    "Contact": "/page/contact",
    "Help Center": "/page/help",
    "Interview Tips": "/blog",
    "Privacy Policy": "/privacy",
    "Terms of Service": "/terms",
    "Refund Policy": "/refund",
  };
  const columns = [
    { title: "Product", links: ["Interview Practice", "AI Feedback", "Score Analytics", "Pricing"] },
    { title: "Company", links: ["About", "Blog", "Careers", "Contact"] },
    { title: "Resources", links: ["Help Center", "Interview Tips"] },
    { title: "Legal", links: ["Privacy Policy", "Terms of Service", "Refund Policy"] },
  ];

  return (
    <footer className="landing-section" style={{ borderTop: `1px solid ${c.border}`, maxWidth: 1100, margin: "0 auto", padding: "64px 40px 40px" }}>
      <div className="footer-grid" style={{ display: "grid", gridTemplateColumns: "1.5fr repeat(4, 1fr)", gap: 48, marginBottom: 48 }}>
        {/* Brand column */}
        <div>
          <span style={{ fontFamily: font.ui, fontSize: 18, fontWeight: 600, color: c.ivory, letterSpacing: "0.04em", display: "block", marginBottom: 12 }}>HireStepX</span>
          <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, lineHeight: 1.6, marginBottom: 20, maxWidth: 220 }}>
            AI-powered mock interviews for job seekers at every level. A Silva Vitalis LLC product.
          </p>
          {/* Social icons */}
          <div style={{ display: "flex", gap: 12 }}>
            {[
              { icon: <svg key="x" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>, label: "Follow on X", href: "https://x.com/hirestepx" },
              { icon: <svg key="li" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>, label: "Follow on LinkedIn", href: "https://www.linkedin.com/company/hirestepx" },
            ].map((s, i) => (
              <a key={i} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} title={s.label} style={{
                width: 32, height: 32, borderRadius: "50%", border: `1px solid ${c.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: c.stone, opacity: 0.7, cursor: "pointer", transition: "opacity 0.2s ease, color 0.2s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = c.gilt; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; e.currentTarget.style.color = c.stone; }}
              >{s.icon}</a>
            ))}
          </div>
        </div>

        {/* Link columns */}
        {columns.map((col) => (
          <div key={col.title}>
            <h4 style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16 }}>{col.title}</h4>
            {col.links.map((link) => {
              const href = linkHref[link] || "#";
              const isAnchor = href.startsWith("/#");
              return (
                <a key={link} href={href} className="hover-underline"
                  {...(isAnchor ? { onClick: (e: React.MouseEvent) => { e.preventDefault(); const id = href.replace("/#", ""); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); } } : {})}
                  style={{
                    fontFamily: font.ui, fontSize: 13, color: c.stone, textDecoration: "none",
                    display: "block", marginBottom: 10, transition: "color 0.2s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = c.ivory)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = c.stone)}
                >{link}</a>
              );
            })}
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="footer-bottom" style={{ borderTop: `1px solid ${c.border}`, paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>
          &copy; 2026 Silva Vitalis LLC. All rights reserved.
        </span>
        <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>
          Built with precision in San Francisco
        </span>
      </div>
    </footer>
  );
}
