import React, { useState } from "react";

/* ─── Light Mode Design Tokens ─── */
const c = {
  bg: "#FAFAF8",
  surface: "#FFFFFF",
  surfaceRaised: "#F5F3EF",
  surfaceHover: "#EFECE6",
  text: "#1A1A1A",
  textSecondary: "#4A4744",
  textMuted: "#8E8983",
  gold: "#B8923E",
  goldDark: "#96752E",
  goldLight: "#D4B37F",
  goldSubtle: "rgba(184,146,62,0.08)",
  success: "#2D7A3A",
  successLight: "#E8F5E9",
  error: "#C4705A",
  errorLight: "#FFF3F0",
  info: "#5A6B78",
  border: "rgba(0,0,0,0.08)",
  borderHover: "rgba(0,0,0,0.14)",
  sage: "#2D7A3A",
  ember: "#C4705A",
  slate: "#5A6B78",
};

const font = {
  display: "'Instrument Serif', Georgia, serif",
  ui: "'Inter', -apple-system, sans-serif",
  mono: "'JetBrains Mono', monospace",
};

const shadow = {
  sm: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  md: "0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
  lg: "0 12px 40px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)",
  xl: "0 20px 60px rgba(0,0,0,0.12), 0 8px 20px rgba(0,0,0,0.06)",
};

/* ─── Shared Styles ─── */
const sectionPad: React.CSSProperties = { padding: "80px 48px", maxWidth: 1200, margin: "0 auto" };
const heading: React.CSSProperties = { fontFamily: font.display, color: c.text, margin: 0, lineHeight: 1.15 };
const body: React.CSSProperties = { fontFamily: font.ui, color: c.textSecondary, lineHeight: 1.6, margin: 0 };
const goldBtn: React.CSSProperties = {
  fontFamily: font.ui, fontWeight: 600, fontSize: 15, color: "#FFFFFF",
  background: `linear-gradient(135deg, ${c.gold} 0%, ${c.goldDark} 100%)`,
  border: "none", borderRadius: 10, padding: "14px 32px", cursor: "pointer",
  boxShadow: `0 4px 16px rgba(184,146,62,0.25)`, letterSpacing: "-0.01em",
};
const outlineBtn: React.CSSProperties = {
  fontFamily: font.ui, fontWeight: 600, fontSize: 15, color: c.gold,
  background: "transparent", border: `1.5px solid ${c.gold}`,
  borderRadius: 10, padding: "13px 32px", cursor: "pointer",
};
const badge: React.CSSProperties = {
  fontFamily: font.ui, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em",
  padding: "5px 12px", borderRadius: 100, textTransform: "uppercase" as const,
};

/* ═══════════════════════════════════════════
   1. NAV BAR
   ═══════════════════════════════════════════ */
export function NavBar() {
  return (
    <div style={{ background: c.surface, borderBottom: `1px solid ${c.border}`, padding: "0 48px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${c.gold}, ${c.goldDark})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14, fontFamily: font.ui }}>H</span>
          </div>
          <span style={{ fontFamily: font.display, fontSize: 22, color: c.text, fontStyle: "italic" }}>Hirloop</span>
        </div>
        {/* Links */}
        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          {["How It Works", "Features", "Pricing"].map(link => (
            <span key={link} style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, color: c.textSecondary, cursor: "pointer" }}>{link}</span>
          ))}
          <button style={{ ...outlineBtn, padding: "8px 20px", fontSize: 13 }}>Log in</button>
          <button style={{ ...goldBtn, padding: "8px 20px", fontSize: 13 }}>Get Started Free</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   2. HERO
   ═══════════════════════════════════════════ */
export function HeroSection() {
  return (
    <div style={{ background: c.bg, position: "relative", overflow: "hidden" }}>
      {/* Subtle radial glow */}
      <div style={{ position: "absolute", top: -120, left: "50%", transform: "translateX(-50%)", width: 800, height: 500, borderRadius: "50%", background: `radial-gradient(ellipse, rgba(184,146,62,0.06) 0%, transparent 70%)`, pointerEvents: "none" }} />

      <div style={{ ...sectionPad, paddingTop: 96, paddingBottom: 96, textAlign: "center", position: "relative" }}>
        {/* Social proof */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, ...badge, background: c.goldSubtle, color: c.gold, marginBottom: 28 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.success, display: "inline-block" }} />
          Now live — start practicing for free
        </div>

        <h1 style={{ ...heading, fontSize: 56, fontStyle: "italic", maxWidth: 720, margin: "0 auto 20px" }}>
          Nail your next interview.{" "}
          <span style={{ color: c.gold }}>Every single time.</span>
        </h1>

        <p style={{ ...body, fontSize: 18, maxWidth: 560, margin: "0 auto 40px" }}>
          AI mock interviews that adapt to your resume and target role — whether you're landing your first job or leveling up to your dream company.
        </p>

        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 48 }}>
          <button style={goldBtn}>Get Started Free</button>
          <button style={outlineBtn}>See How It Works</button>
        </div>

        {/* Value props */}
        <div style={{ display: "flex", gap: 40, justifyContent: "center" }}>
          {[
            { icon: "✦", label: "Free to Start" },
            { icon: "◎", label: "AI-Powered" },
            { icon: "↗", label: "Real-time Feedback" },
          ].map(v => (
            <div key={v.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: c.gold, fontSize: 16 }}>{v.icon}</span>
              <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.textMuted }}>{v.label}</span>
            </div>
          ))}
        </div>

        {/* Mock interview card */}
        <div style={{
          marginTop: 64, maxWidth: 720, margin: "64px auto 0", background: c.surface,
          borderRadius: 16, border: `1px solid ${c.border}`, boxShadow: shadow.lg,
          padding: 32, position: "relative",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: `linear-gradient(135deg, ${c.gold}, ${c.goldDark})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: 18 }}>🎤</span>
            </div>
            <div>
              <div style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.text }}>AI Interviewer</div>
              <div style={{ fontFamily: font.ui, fontSize: 12, color: c.textMuted }}>Behavioral · Product Manager · Google</div>
            </div>
            <div style={{ marginLeft: "auto", ...badge, background: c.successLight, color: c.success }}>● Live</div>
          </div>
          <div style={{ background: c.surfaceRaised, borderRadius: 10, padding: "16px 20px", fontFamily: font.ui, fontSize: 14, color: c.textSecondary, lineHeight: 1.7, fontStyle: "italic" }}>
            "Tell me about a time you had to make a decision with incomplete data. What was the outcome?"
          </div>
          {/* Score preview */}
          <div style={{ display: "flex", gap: 16, marginTop: 20 }}>
            {[
              { label: "Communication", score: 88 },
              { label: "Structure", score: 92 },
              { label: "Technical Depth", score: 78 },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, background: c.surfaceRaised, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 700, color: c.gold }}>{s.score}</div>
                <div style={{ fontFamily: font.ui, fontSize: 11, color: c.textMuted, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   3. STATS
   ═══════════════════════════════════════════ */
export function StatsSection() {
  const stats = [
    { number: "9", label: "Interview Types", icon: "◉" },
    { number: "50+", label: "Target Companies", icon: "⬡" },
    { number: "3", label: "Free Sessions", icon: "▲" },
    { number: "₹0", label: "To Get Started", icon: "✦" },
  ];

  return (
    <div style={{ background: c.surface, borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}` }}>
      <div style={{ ...sectionPad, paddingTop: 48, paddingBottom: 48 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
          {stats.map(s => (
            <div key={s.label} style={{ textAlign: "center", padding: "24px 16px" }}>
              <div style={{ color: c.gold, fontSize: 14, marginBottom: 10 }}>{s.icon}</div>
              <div style={{ fontFamily: font.display, fontSize: 40, fontStyle: "italic", color: c.text, marginBottom: 4 }}>{s.number}</div>
              <div style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   4. HOW IT WORKS
   ═══════════════════════════════════════════ */
export function HowItWorks() {
  const [active, setActive] = useState(0);
  const steps = [
    { step: "01", title: "Upload your resume", desc: "Add your experience and target role. Our AI creates a personalized interview matched to your background and goals.", icon: "📄" },
    { step: "02", title: "Practice in real time", desc: "A conversational AI interviewer asks questions, listens, and follows up — just like a real interview at a top company.", icon: "🎙" },
    { step: "03", title: "Review scored feedback", desc: "Get specific scores and actionable tips after every session. Know exactly what to improve before your real interview.", icon: "📊" },
  ];

  return (
    <div style={{ background: c.bg }}>
      <div style={sectionPad}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ ...badge, background: c.goldSubtle, color: c.gold, display: "inline-block", marginBottom: 16 }}>How It Works</div>
          <h2 style={{ ...heading, fontSize: 40, fontStyle: "italic" }}>Three steps to interview confidence</h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          {/* Steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {steps.map((s, i) => (
              <div
                key={s.step}
                onClick={() => setActive(i)}
                style={{
                  padding: "20px 24px", borderRadius: 12, cursor: "pointer",
                  background: active === i ? c.surface : "transparent",
                  border: `1px solid ${active === i ? c.border : "transparent"}`,
                  boxShadow: active === i ? shadow.sm : "none",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 700, color: active === i ? c.gold : c.textMuted }}>{s.step}</span>
                  <div>
                    <div style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: active === i ? c.text : c.textSecondary, marginBottom: 4 }}>{s.title}</div>
                    {active === i && <div style={{ fontFamily: font.ui, fontSize: 14, color: c.textMuted, lineHeight: 1.6 }}>{s.desc}</div>}
                  </div>
                </div>
                {active === i && (
                  <div style={{ marginTop: 12, marginLeft: 44, height: 3, borderRadius: 3, background: `linear-gradient(90deg, ${c.gold}, ${c.goldLight})`, width: "60%" }} />
                )}
              </div>
            ))}
          </div>

          {/* Preview card */}
          <div style={{
            background: c.surface, borderRadius: 16, border: `1px solid ${c.border}`,
            boxShadow: shadow.md, padding: 32, minHeight: 320, display: "flex",
            flexDirection: "column", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>{steps[active].icon}</div>
            <div style={{ fontFamily: font.ui, fontSize: 18, fontWeight: 600, color: c.text, marginBottom: 8 }}>{steps[active].title}</div>
            <div style={{ fontFamily: font.ui, fontSize: 14, color: c.textMuted, textAlign: "center", maxWidth: 300, lineHeight: 1.6 }}>{steps[active].desc}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   5. FEATURES
   ═══════════════════════════════════════════ */
export function FeaturesSection() {
  const features = [
    { tag: "Adaptive", title: "Questions from your resume", desc: "No recycled question banks. Every session is generated from your actual experience, targeting the exact role you're applying for.", accent: c.gold, accentBg: c.goldSubtle },
    { tag: "Real-Time", title: "Conversational AI that listens", desc: "The interviewer responds to what you actually say — asking follow-ups and probing deeper, just like a real hiring manager.", accent: c.sage, accentBg: "rgba(45,122,58,0.06)" },
    { tag: "Precise", title: "Feedback that's specific", desc: '"You forgot to mention the outcome — add the 40% improvement metric." Not "try to be more specific."', accent: c.ember, accentBg: "rgba(196,112,90,0.06)" },
    { tag: "Private", title: "Your data stays yours", desc: "Delete your data anytime. No social features, no tracking beyond basic web vitals.", accent: c.slate, accentBg: "rgba(90,107,120,0.06)" },
  ];

  return (
    <div style={{ background: c.surface, borderTop: `1px solid ${c.border}` }}>
      <div style={sectionPad}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ ...badge, background: c.goldSubtle, color: c.gold, display: "inline-block", marginBottom: 16 }}>Features</div>
          <h2 style={{ ...heading, fontSize: 40, fontStyle: "italic" }}>Built for serious preparation</h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {features.map(f => (
            <div key={f.tag} style={{
              background: c.bg, borderRadius: 14, border: `1px solid ${c.border}`,
              padding: "32px 28px", transition: "box-shadow 0.2s ease",
            }}>
              <span style={{ ...badge, background: f.accentBg, color: f.accent, marginBottom: 16, display: "inline-block" }}>{f.tag}</span>
              <h3 style={{ fontFamily: font.display, fontSize: 24, fontStyle: "italic", color: c.text, margin: "0 0 10px" }}>{f.title}</h3>
              <p style={{ ...body, fontSize: 14 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   6. TESTIMONIALS
   ═══════════════════════════════════════════ */
export function TestimonialsSection() {
  const [active, setActive] = useState(0);
  const testimonials = [
    { name: "Marcus T.", role: "Software Engineer", result: "Landed dream job at Google", quote: "I was mass-applying and getting nowhere. After a week of practice on Hirloop, I started getting callbacks — and landed an offer at my top choice." },
    { name: "Dana R.", role: "Career Changer → PM", result: "Career switch success", quote: "Switching careers from teaching to product management felt impossible. The AI caught gaps I didn't know I had. Three weeks later, I had two offers." },
    { name: "Priya K.", role: "Data Analyst, Recent Grad", result: "First job out of college", quote: "The feedback was brutally specific — told me I was using filler words 15 times per answer. Fixed that, and my next interview felt completely different." },
  ];

  return (
    <div style={{ background: c.bg, borderTop: `1px solid ${c.border}` }}>
      <div style={sectionPad}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ ...badge, background: c.goldSubtle, color: c.gold, display: "inline-block", marginBottom: 16 }}>Testimonials</div>
          <h2 style={{ ...heading, fontSize: 40, fontStyle: "italic" }}>Real results from real users</h2>
        </div>

        <div style={{
          background: c.surface, borderRadius: 16, border: `1px solid ${c.border}`,
          boxShadow: shadow.md, padding: 48, maxWidth: 720, margin: "0 auto",
        }}>
          <div style={{ fontSize: 32, color: c.goldLight, fontFamily: font.display, marginBottom: 16 }}>"</div>
          <p style={{ fontFamily: font.display, fontSize: 22, fontStyle: "italic", color: c.text, lineHeight: 1.6, margin: "0 0 28px" }}>
            {testimonials[active].quote}
          </p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.text }}>{testimonials[active].name}</div>
              <div style={{ fontFamily: font.ui, fontSize: 13, color: c.textMuted }}>{testimonials[active].role}</div>
            </div>
            <span style={{ ...badge, background: c.successLight, color: c.success }}>{testimonials[active].result}</span>
          </div>
          {/* Dots */}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 28 }}>
            {testimonials.map((_, i) => (
              <div
                key={i}
                onClick={() => setActive(i)}
                style={{
                  width: active === i ? 24 : 8, height: 8, borderRadius: 4, cursor: "pointer",
                  background: active === i ? c.gold : c.surfaceHover,
                  transition: "all 0.3s ease",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   7. PRICING
   ═══════════════════════════════════════════ */
export function PricingSection() {
  const tiers = [
    {
      name: "Free", price: "₹0", period: "", desc: "Try it out — no credit card required.",
      features: ["3 AI mock interviews", "Behavioral questions only", "Basic score & feedback", "Resume-tailored questions"],
      featured: false,
    },
    {
      name: "Starter", price: "₹49", period: "/ week", desc: "10 sessions per week. Cancel anytime.",
      features: ["10 sessions per week", "All question types & roles", "Detailed feedback & skill scores", "Basic resume analysis", "PDF export"],
      featured: false,
    },
    {
      name: "Pro", price: "₹149", period: "/ month", desc: "Unlimited prep. Best value for serious candidates.",
      features: ["Unlimited sessions", "Full AI coaching feedback", "Performance analytics & trends", "Interview calendar & reminders", "Full resume analysis", "Export PDF, CSV, JSON"],
      featured: true,
    },
  ];

  return (
    <div style={{ background: c.surface, borderTop: `1px solid ${c.border}` }}>
      <div style={sectionPad}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ ...badge, background: c.goldSubtle, color: c.gold, display: "inline-block", marginBottom: 16 }}>Pricing</div>
          <h2 style={{ ...heading, fontSize: 40, fontStyle: "italic" }}>Transparent. No surprises.</h2>
          <p style={{ ...body, fontSize: 16, marginTop: 12 }}>Start free. Upgrade when you're ready.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {tiers.map(t => (
            <div key={t.name} style={{
              background: t.featured ? c.text : c.bg,
              borderRadius: 16, padding: "36px 28px",
              border: `1px solid ${t.featured ? "transparent" : c.border}`,
              boxShadow: t.featured ? shadow.xl : shadow.sm,
              position: "relative",
              display: "flex", flexDirection: "column",
            }}>
              {t.featured && (
                <div style={{
                  position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                  ...badge, background: `linear-gradient(135deg, ${c.gold}, ${c.goldDark})`, color: "#fff",
                }}>
                  Most Popular
                </div>
              )}
              <div style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: t.featured ? c.goldLight : c.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 12 }}>{t.name}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
                <span style={{ fontFamily: font.display, fontSize: 40, fontStyle: "italic", color: t.featured ? "#FFFFFF" : c.text }}>{t.price}</span>
                {t.period && <span style={{ fontFamily: font.ui, fontSize: 14, color: t.featured ? "rgba(255,255,255,0.5)" : c.textMuted }}>{t.period}</span>}
              </div>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: t.featured ? "rgba(255,255,255,0.6)" : c.textMuted, lineHeight: 1.5, margin: "0 0 24px" }}>{t.desc}</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28, flex: 1 }}>
                {t.features.map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: t.featured ? c.goldLight : c.success, fontSize: 14 }}>✓</span>
                    <span style={{ fontFamily: font.ui, fontSize: 13, color: t.featured ? "rgba(255,255,255,0.85)" : c.textSecondary }}>{f}</span>
                  </div>
                ))}
              </div>

              <button style={t.featured
                ? { ...goldBtn, width: "100%", padding: "14px 0" }
                : { ...outlineBtn, width: "100%", padding: "13px 0", color: t.featured ? "#fff" : c.gold, borderColor: t.featured ? "rgba(255,255,255,0.2)" : c.gold }
              }>
                {t.name === "Free" ? "Get Started" : `Choose ${t.name}`}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   8. FAQ
   ═══════════════════════════════════════════ */
export function FAQSection() {
  const [open, setOpen] = useState<number | null>(null);
  const faqs = [
    { q: "Is Hirloop free to use?", a: "Yes! You get 3 free AI mock interviews with no credit card required. Upgrade anytime for more sessions and features." },
    { q: "How does the AI mock interview work?", a: "Upload your resume and select a target role. Our AI generates personalized questions, listens to your answers in real time, asks follow-ups, and provides detailed scored feedback." },
    { q: "What types of interviews can I practice?", a: "We support 9 types: Behavioral, Strategic, Technical Leadership, Case Study, Campus Placement, HR Round, Management, Government & PSU, and Teaching." },
    { q: "Can I practice for specific companies?", a: "Yes — select from 50+ target companies including TCS, Infosys, Google, Amazon, and more. Questions are tailored to each company's interview style." },
    { q: "Is my interview data private and secure?", a: "Absolutely. Delete your data anytime from Settings. No social features, no tracking beyond basic web vitals." },
    { q: "Does Hirloop work on mobile?", a: "Yes, Hirloop is fully responsive and works on any device with a microphone and browser." },
  ];

  return (
    <div style={{ background: c.bg, borderTop: `1px solid ${c.border}` }}>
      <div style={{ ...sectionPad, maxWidth: 760 }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ ...badge, background: c.goldSubtle, color: c.gold, display: "inline-block", marginBottom: 16 }}>FAQ</div>
          <h2 style={{ ...heading, fontSize: 36, fontStyle: "italic" }}>Common questions</h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {faqs.map((f, i) => (
            <div key={i} style={{ borderBottom: `1px solid ${c.border}` }}>
              <div
                onClick={() => setOpen(open === i ? null : i)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "18px 0", cursor: "pointer",
                }}
              >
                <span style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 500, color: c.text }}>{f.q}</span>
                <span style={{ fontFamily: font.mono, fontSize: 18, color: c.textMuted, transform: open === i ? "rotate(45deg)" : "none", transition: "transform 0.2s ease" }}>+</span>
              </div>
              {open === i && (
                <div style={{ padding: "0 0 18px", fontFamily: font.ui, fontSize: 14, color: c.textSecondary, lineHeight: 1.7 }}>
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   9. FINAL CTA
   ═══════════════════════════════════════════ */
export function FinalCTA() {
  return (
    <div style={{ background: c.text, padding: "80px 48px", textAlign: "center" }}>
      <h2 style={{ fontFamily: font.display, fontSize: 44, fontStyle: "italic", color: "#FFFFFF", margin: "0 0 16px" }}>
        Ready to <span style={{ color: c.goldLight }}>ace</span> your next interview?
      </h2>
      <p style={{ fontFamily: font.ui, fontSize: 16, color: "rgba(255,255,255,0.6)", margin: "0 0 36px", maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
        Join thousands of candidates who landed their dream jobs with Hirloop.
      </p>
      <button style={{ ...goldBtn, fontSize: 16, padding: "16px 40px" }}>Get Started Free</button>
    </div>
  );
}

/* ═══════════════════════════════════════════
   10. FOOTER
   ═══════════════════════════════════════════ */
export function FooterSection() {
  const linkStyle: React.CSSProperties = { fontFamily: font.ui, fontSize: 13, color: c.textMuted, textDecoration: "none", cursor: "pointer", lineHeight: 2.2 };
  const colTitle: React.CSSProperties = { fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.textSecondary, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 12 };

  return (
    <div style={{ background: c.surface, borderTop: `1px solid ${c.border}`, padding: "56px 48px 32px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 48, marginBottom: 48 }}>
          {/* Brand */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: `linear-gradient(135deg, ${c.gold}, ${c.goldDark})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 12, fontFamily: font.ui }}>H</span>
              </div>
              <span style={{ fontFamily: font.display, fontSize: 18, color: c.text, fontStyle: "italic" }}>Hirloop</span>
            </div>
            <p style={{ fontFamily: font.ui, fontSize: 13, color: c.textMuted, lineHeight: 1.7, maxWidth: 280 }}>
              AI-powered mock interviews that adapt to your resume. Practice with confidence.
            </p>
          </div>

          <div>
            <div style={colTitle}>Product</div>
            {["Features", "Pricing", "FAQ", "Changelog"].map(l => <div key={l} style={linkStyle}>{l}</div>)}
          </div>
          <div>
            <div style={colTitle}>Company</div>
            {["About", "Blog", "Careers", "Contact"].map(l => <div key={l} style={linkStyle}>{l}</div>)}
          </div>
          <div>
            <div style={colTitle}>Legal</div>
            {["Privacy", "Terms", "Cookies"].map(l => <div key={l} style={linkStyle}>{l}</div>)}
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.textMuted }}>© 2026 Silva Vitalis LLC. Built with precision in San Francisco.</span>
          <div style={{ display: "flex", gap: 16 }}>
            {["X", "LinkedIn", "GitHub"].map(s => (
              <span key={s} style={{ fontFamily: font.ui, fontSize: 12, color: c.textMuted, cursor: "pointer" }}>{s}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   FULL PAGE COMPOSITE
   ═══════════════════════════════════════════ */
export function FullLandingPage() {
  return (
    <div style={{ background: c.bg, minHeight: "100%" }}>
      <NavBar />
      <HeroSection />
      <StatsSection />
      <HowItWorks />
      <FeaturesSection />
      <TestimonialsSection />
      <PricingSection />
      <FAQSection />
      <FinalCTA />
      <FooterSection />
    </div>
  );
}
