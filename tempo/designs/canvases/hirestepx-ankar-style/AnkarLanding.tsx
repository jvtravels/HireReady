import React, { useState, useEffect, useRef, CSSProperties } from "react";

/* ══════════════════════════════════════════════════════════════════
   ANKAR-STYLE DESIGN SYSTEM
   ──────────────────────────────────────────────────────────────────
   Ankar aesthetic: Stark black-on-white. Swiss precision. Huge type.
   Geometric, clinical, authoritative. Near-zero decoration.
   Generous whitespace. Single accent. Pill-shaped CTAs.
   No gradients. No glows. No shadows on cards. Border-only cards.
   Section dividers via thin 1px lines.
   ══════════════════════════════════════════════════════════════════ */

const ds = {
  /* Colors — stark, minimal */
  bg: "#FAFAFA",
  white: "#FFFFFF",
  black: "#0A0A0A",
  text: "#0A0A0A",
  textSec: "#555555",
  textMuted: "#8A8A8A",
  textFaint: "#ABABAB",
  border: "#E5E5E5",
  borderLight: "#F0F0F0",
  accent: "#0A0A0A",        /* Primary CTA — black */
  accentSoft: "#F5F5F5",    /* Soft bg for tags/badges */
  green: "#00B67A",         /* Trust / success */
  greenBg: "#E6F9F1",
  gold: "#B8923E",          /* Brand accent — used sparingly */

  /* Typography — Inter + Instrument Serif */
  fontSans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSerif: "'Instrument Serif', Georgia, 'Times New Roman', serif",
  fontMono: "'JetBrains Mono', 'SF Mono', 'Consolas', monospace",

  /* Spacing */
  navH: 64,
  maxW: 1200,
  sectionPad: "180px 64px",
  radius: { sm: 8, md: 12, lg: 16, xl: 24, pill: 100 },
};

/* ─── Keyframes ─── */
const KF = `
@keyframes aFadeUp{from{opacity:0;transform:translateY(36px)}to{opacity:1;transform:translateY(0)}}
@keyframes aFadeIn{from{opacity:0}to{opacity:1}}
@keyframes aSlideR{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:translateX(0)}}
@keyframes aSlideL{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:translateX(0)}}
@keyframes aScaleIn{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
@keyframes aWidth{from{width:0}to{width:100%}}
@keyframes aMarquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
@keyframes aPulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes aFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes aDotPulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.5);opacity:1}}
@keyframes aBarGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes aCountUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes aBorderPulse{0%,100%{border-color:#E5E5E5}50%{border-color:#0A0A0A}}
@keyframes aTextReveal{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes aLineGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes aTickerScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
`;

/* ─── Reveal wrapper — fade-up on mount ─── */
function Rev({ children, d = 0, style }: { children: React.ReactNode; d?: number; style?: CSSProperties }) {
  const [v, setV] = useState(false);
  useEffect(() => { const t = setTimeout(() => setV(true), 200 + d); return () => clearTimeout(t); }, [d]);
  return (
    <div style={{
      opacity: v ? 1 : 0, transform: v ? "translateY(0)" : "translateY(36px)",
      transition: `all .85s cubic-bezier(.16,1,.3,1) ${d}ms`, ...style,
    }}>{children}</div>
  );
}

/* ─── Ankar-style pill button ─── */
function Pill({ children, dark, small, style }: { children: React.ReactNode; dark?: boolean; small?: boolean; style?: CSSProperties }) {
  const [h, setH] = useState(false);
  return (
    <button
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        fontFamily: ds.fontSans, fontSize: small ? 13 : 15, fontWeight: 500,
        padding: small ? "8px 20px" : "14px 36px",
        borderRadius: ds.radius.pill,
        border: dark ? "none" : `1.5px solid ${ds.border}`,
        background: dark ? ds.black : "transparent",
        color: dark ? ds.white : ds.text,
        cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
        transition: "all .3s cubic-bezier(.16,1,.3,1)",
        transform: h ? "scale(1.03)" : "scale(1)",
        boxShadow: h && dark ? "0 8px 32px rgba(0,0,0,.18)" : "none",
        letterSpacing: ".01em",
        ...style,
      }}
    >
      {children}
      {dark && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          style={{ transition: "transform .3s ease", transform: h ? "translateX(3px)" : "translateX(0)" }}>
          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
        </svg>
      )}
    </button>
  );
}

/* ─── Ankar card: thin border, no shadow, hover border-darken ─── */
function Card({ children, style, noPad }: { children: React.ReactNode; style?: CSSProperties; noPad?: boolean }) {
  const [h, setH] = useState(false);
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: ds.white, borderRadius: ds.radius.lg,
        border: `1px solid ${h ? "#CCCCCC" : ds.border}`,
        padding: noPad ? 0 : "36px 32px",
        transition: "all .35s cubic-bezier(.16,1,.3,1)",
        transform: h ? "translateY(-2px)" : "translateY(0)",
        ...style,
      }}
    >{children}</div>
  );
}

/* ─── Section label (small caps) ─── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: ds.fontSans, fontSize: 11, fontWeight: 600, letterSpacing: ".14em",
      textTransform: "uppercase", color: ds.textMuted, marginBottom: 20, margin: "0 0 20px",
    }}>{children}</p>
  );
}

/* ─── Section heading ─── */
function SectionH2({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return (
    <h2 style={{
      fontFamily: ds.fontSerif, fontSize: 52, fontWeight: 400, lineHeight: 1.15,
      letterSpacing: "-.03em", color: ds.text, margin: "0 0 20px", ...style,
    }}>{children}</h2>
  );
}

/* ─── Divider line ─── */
function Divider() {
  return <div style={{ height: 1, background: ds.border, width: "100%" }} />;
}

/* ══════════════════════════════════════════════════════════════════
   N A V B A R  (over dark hero — white text, transparent bg)
   ══════════════════════════════════════════════════════════════════ */
export function NavBar() {
  return (
    <nav style={{
      position: "absolute", top: 0, left: 0, right: 0, width: "100%", zIndex: 100,
      height: ds.navH, padding: "0 48px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: "transparent",
    }}>
      <style>{KF}</style>

      {/* Logo */}
      <div style={{ fontFamily: ds.fontSerif, fontSize: 22, color: "#FFFFFF", letterSpacing: "-.01em" }}>
        HireStepX
      </div>

      {/* Center nav */}
      <div style={{ display: "flex", gap: 36 }}>
        {["Product", "How It Works", "Pricing", "Blog"].map(item => (
          <span key={item} style={{
            fontFamily: ds.fontSans, fontSize: 14, fontWeight: 400, color: "rgba(255,255,255,0.6)",
            cursor: "pointer",
          }}>
            {item}
          </span>
        ))}
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <span style={{ fontFamily: ds.fontSans, fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>
          Log in
        </span>
        <button style={{
          fontFamily: ds.fontSans, fontSize: 13, fontWeight: 600, padding: "9px 24px",
          borderRadius: ds.radius.pill, border: "none",
          background: "#FFFFFF", color: "#0A0A0A", cursor: "pointer",
          boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
        }}>
          Get Started
        </button>
      </div>
    </nav>
  );
}

/* ══════════════════════════════════════════════════════════════════
   H E R O
   Ankar style: Dark full-screen, centered, atmospheric aurora
   gradient, massive serif type, product mockup below text
   ══════════════════════════════════════════════════════════════════ */
export function HeroSection() {
  const [headlineVis, setHeadlineVis] = useState(false);
  const [subVis, setSubVis] = useState(false);
  const [ctaVis, setCtaVis] = useState(false);
  const [mockupVis, setMockupVis] = useState(false);

  useEffect(() => {
    setTimeout(() => setHeadlineVis(true), 300);
    setTimeout(() => setSubVis(true), 700);
    setTimeout(() => setCtaVis(true), 1100);
    setTimeout(() => setMockupVis(true), 1600);
  }, []);

  return (
    <section style={{
      position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", overflow: "hidden",
      background: "#0A0A0B",
    }}>
      <style>{KF}</style>

      {/* Atmospheric aurora gradient — ankar style */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "55%",
        background: "linear-gradient(180deg, transparent 0%, rgba(184,146,62,0.03) 30%, rgba(196,112,90,0.06) 60%, rgba(122,158,126,0.04) 80%, rgba(90,107,120,0.05) 100%)",
        pointerEvents: "none",
      }} />
      {/* Central light burst */}
      <div style={{
        position: "absolute", bottom: "-10%", left: "50%", transform: "translateX(-50%)",
        width: "120%", height: "60%",
        background: "radial-gradient(ellipse 60% 80% at 50% 100%, rgba(212,179,127,0.12) 0%, rgba(196,112,90,0.06) 30%, transparent 70%)",
        pointerEvents: "none", filter: "blur(40px)",
      }} />
      {/* Subtle side glows */}
      <div style={{
        position: "absolute", bottom: "5%", left: "15%", width: 400, height: 400, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(90,130,180,0.06) 0%, transparent 70%)",
        pointerEvents: "none", filter: "blur(60px)",
      }} />
      <div style={{
        position: "absolute", bottom: "10%", right: "10%", width: 350, height: 350, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(196,112,90,0.05) 0%, transparent 70%)",
        pointerEvents: "none", filter: "blur(60px)",
      }} />

      {/* Content — centered */}
      <div style={{
        position: "relative", zIndex: 1, textAlign: "center",
        padding: "180px 48px 60px", maxWidth: 900, width: "100%",
      }}>
        {/* Announcement pill */}
        <div style={{
          opacity: headlineVis ? 1 : 0, transform: headlineVis ? "translateY(0)" : "translateY(16px)",
          transition: "all .8s cubic-bezier(.16,1,.3,1)", marginBottom: 36,
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            padding: "7px 8px 7px 18px", borderRadius: 100,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          }}>
            <span style={{ fontFamily: ds.fontSans, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
              AI-Powered Mock Interviews
            </span>
            <span style={{
              fontFamily: ds.fontSans, fontSize: 11, fontWeight: 600, color: "#FFFFFF",
              background: "rgba(255,255,255,0.12)", padding: "3px 12px", borderRadius: 100,
            }}>
              Live
            </span>
          </div>
        </div>

        {/* Massive headline */}
        <h1 style={{
          fontFamily: ds.fontSerif, fontSize: 82, fontWeight: 400,
          lineHeight: 1.06, letterSpacing: "-.035em", color: "#FFFFFF",
          margin: "0 0 28px",
          opacity: headlineVis ? 1 : 0,
          transform: headlineVis ? "translateY(0)" : "translateY(32px)",
          transition: "all 1s cubic-bezier(.16,1,.3,1)",
        }}>
          Ace Every Interview,<br/>
          <span style={{ fontStyle: "italic", color: "rgba(255,255,255,0.4)" }}>Every Time</span>
        </h1>

        {/* Subtitle */}
        <p style={{
          fontFamily: ds.fontSans, fontSize: 17, lineHeight: 1.65, color: "rgba(255,255,255,0.5)",
          maxWidth: 520, margin: "0 auto 44px",
          opacity: subVis ? 1 : 0,
          transform: subVis ? "translateY(0)" : "translateY(24px)",
          transition: "all .9s cubic-bezier(.16,1,.3,1)",
        }}>
          Practice with an AI interviewer tailored to your resume and target role.
          Get specific, scored feedback to improve before the real thing.
        </p>

        {/* CTA */}
        <div style={{
          opacity: ctaVis ? 1 : 0,
          transform: ctaVis ? "translateY(0)" : "translateY(20px)",
          transition: "all .8s cubic-bezier(.16,1,.3,1)",
        }}>
          <button style={{
            fontFamily: ds.fontSans, fontSize: 15, fontWeight: 500, padding: "16px 44px",
            borderRadius: 100, border: "none", background: "#FFFFFF", color: "#0A0A0A",
            cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10,
            boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
          }}>
            Get Started Free
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Product mockup — below centered text */}
      <div style={{
        position: "relative", zIndex: 1, width: "100%", maxWidth: 960,
        padding: "0 48px", marginTop: 20,
        opacity: mockupVis ? 1 : 0,
        transform: mockupVis ? "translateY(0) scale(1)" : "translateY(40px) scale(0.97)",
        transition: "all 1.2s cubic-bezier(.16,1,.3,1)",
      }}>
        <HeroDarkMockup />
      </div>

      {/* Bottom gradient fade to page bg */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 120,
        background: `linear-gradient(180deg, transparent, ${ds.bg})`,
        pointerEvents: "none", zIndex: 2,
      }} />
    </section>
  );
}

/* ─── Hero Product Mockup (dark chrome card on dark hero) ─── */
function HeroDarkMockup() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const ts = [setTimeout(() => setStep(1), 2200), setTimeout(() => setStep(2), 3600), setTimeout(() => setStep(3), 5000)];
    return () => ts.forEach(clearTimeout);
  }, []);

  return (
    <div style={{
      background: "#111113", borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)",
      overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
    }}>
      {/* Chrome bar */}
      <div style={{
        height: 40, background: "#0D0D0E", borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", padding: "0 16px", gap: 6,
      }}>
        {["#FF5F57", "#FEBC2E", "#28C840"].map((col, i) => (
          <div key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: col, opacity: .75 }} />
        ))}
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div style={{
            background: "rgba(255,255,255,0.06)", borderRadius: 6,
            padding: "3px 20px", fontFamily: ds.fontSans, fontSize: 11, color: "rgba(255,255,255,0.35)",
          }}>
            hirestepx.com/interview
          </div>
        </div>
      </div>

      <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: ds.fontSans, fontSize: 14, fontWeight: 600, color: "#F5F2ED" }}>Live Interview</span>
          <span style={{ fontFamily: ds.fontMono, fontSize: 11, color: "#7A9E7E", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7A9E7E", animation: "aPulse 1.5s ease-in-out infinite" }} />
            Recording
          </span>
        </div>

        {/* Interviewer */}
        <div style={{
          opacity: step >= 1 ? 1 : 0, transform: step >= 1 ? "translateX(0)" : "translateX(-20px)",
          transition: "all .65s cubic-bezier(.16,1,.3,1)",
        }}>
          <div style={{
            background: "rgba(212,179,127,0.05)", borderRadius: "4px 14px 14px 14px",
            padding: "14px 18px", border: "1px solid rgba(212,179,127,0.1)",
          }}>
            <p style={{ fontFamily: ds.fontSans, fontSize: 10, fontWeight: 600, color: "#D4B37F", margin: "0 0 6px", letterSpacing: ".06em", textTransform: "uppercase" }}>Interviewer</p>
            <p style={{ fontFamily: ds.fontSans, fontSize: 13, lineHeight: 1.6, color: "#F5F2ED", margin: 0 }}>
              Tell me about a time you had to make a critical decision with incomplete information.
            </p>
          </div>
        </div>

        {/* User */}
        <div style={{
          opacity: step >= 2 ? 1 : 0, transform: step >= 2 ? "translateX(0)" : "translateX(20px)",
          transition: "all .65s cubic-bezier(.16,1,.3,1)",
        }}>
          <div style={{
            background: "#0D0D0E", borderRadius: "14px 4px 14px 14px",
            padding: "14px 18px", border: "1px solid rgba(255,255,255,0.06)", marginLeft: 40,
          }}>
            <p style={{ fontFamily: ds.fontSans, fontSize: 10, fontWeight: 600, color: "#7A9E7E", margin: "0 0 6px", letterSpacing: ".06em", textTransform: "uppercase" }}>You</p>
            <p style={{ fontFamily: ds.fontSans, fontSize: 13, lineHeight: 1.6, color: "#CCC7C0", margin: 0 }}>
              During our API migration, we had 48 hours to decide between a full rewrite or incremental approach...
            </p>
          </div>
        </div>

        {/* Waveform */}
        <div style={{
          opacity: step >= 2 ? 1 : 0, transition: "opacity .4s ease .2s",
          display: "flex", alignItems: "center", gap: 8, padding: "2px 0",
        }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#C4705A", animation: "aPulse 1s ease-in-out infinite" }} />
          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 1.5, height: 22 }}>
            {Array.from({ length: 44 }).map((_, i) => (
              <div key={i} style={{
                flex: 1, borderRadius: 1, alignSelf: "flex-end",
                height: `${15 + Math.sin(i * .7) * 35 + Math.random() * 50}%`,
                background: "#F5F2ED", opacity: .08,
              }} />
            ))}
          </div>
          <span style={{ fontFamily: ds.fontMono, fontSize: 10, color: "#8E8983" }}>1:42</span>
        </div>

        {/* Follow-up */}
        {step >= 3 && (
          <div style={{
            animation: "aFadeUp .5s cubic-bezier(.16,1,.3,1) both",
            display: "flex", alignItems: "center", gap: 10,
            background: "rgba(212,179,127,0.04)", border: "1px solid rgba(212,179,127,0.08)",
            borderRadius: "4px 12px 12px 12px", padding: "10px 16px",
          }}>
            <span style={{ fontFamily: ds.fontSans, fontSize: 10, fontWeight: 600, color: "#D4B37F", letterSpacing: ".04em", textTransform: "uppercase" }}>Follow-up</span>
            <div style={{ display: "flex", gap: 4 }}>
              {[0, 1, 2].map(d => (
                <div key={d} style={{
                  width: 4, height: 4, borderRadius: "50%", background: "#D4B37F", opacity: .5,
                  animation: `aDotPulse 1.2s ease-in-out ${d * .2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   L O G O   T I C K E R
   ══════════════════════════════════════════════════════════════════ */
export function LogoTicker() {
  const companies = ["Google", "Apple", "Amazon", "McKinsey", "Goldman Sachs", "Meta", "Deloitte", "Microsoft", "BCG", "JPMorgan"];
  const doubled = [...companies, ...companies];
  return (
    <section style={{ padding: "40px 0", borderTop: `1px solid ${ds.border}`, borderBottom: `1px solid ${ds.border}`, overflow: "hidden", position: "relative" }}>
      <style>{KF}</style>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 100, background: `linear-gradient(90deg, ${ds.bg}, transparent)`, zIndex: 2 }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 100, background: `linear-gradient(270deg, ${ds.bg}, transparent)`, zIndex: 2 }} />
      <p style={{ fontFamily: ds.fontSans, fontSize: 11, fontWeight: 500, letterSpacing: ".1em", textTransform: "uppercase", color: ds.textFaint, textAlign: "center", marginBottom: 24, margin: "0 0 24px" }}>
        Our users landed roles at
      </p>
      <div style={{ display: "flex", gap: 56, animation: "aTickerScroll 40s linear infinite", width: "max-content" }}>
        {doubled.map((name, i) => (
          <span key={i} style={{
            fontFamily: ds.fontSans, fontSize: 15, fontWeight: 600, color: ds.text,
            opacity: .18, letterSpacing: ".03em", whiteSpace: "nowrap",
          }}>{name}</span>
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════
   M E T R I C S   B A R
   ══════════════════════════════════════════════════════════════════ */
export function MetricsBar() {
  const metrics = [
    { val: "6", unit: "", label: "Interview Types" },
    { val: "50", unit: "+", label: "Target Companies" },
    { val: "3", unit: "", label: "Free Sessions" },
    { val: "2 min", unit: "", label: "Average Setup" },
  ];
  return (
    <section style={{ padding: "64px 64px", maxWidth: ds.maxW, margin: "0 auto" }}>
      <style>{KF}</style>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0,
        borderRadius: ds.radius.lg, border: `1px solid ${ds.border}`, overflow: "hidden",
      }}>
        {metrics.map((m, i) => (
          <Rev key={m.label} d={i * 100}>
            <div style={{
              padding: "40px 32px", textAlign: "center",
              borderRight: i < 3 ? `1px solid ${ds.border}` : "none",
              background: ds.white,
            }}>
              <span style={{
                fontFamily: ds.fontSerif, fontSize: 44, fontWeight: 400, color: ds.text,
                letterSpacing: "-.02em",
              }}>
                {m.val}<span style={{ fontSize: 28, color: ds.textMuted }}>{m.unit}</span>
              </span>
              <p style={{ fontFamily: ds.fontSans, fontSize: 13, color: ds.textMuted, marginTop: 8, margin: "8px 0 0", letterSpacing: ".02em" }}>{m.label}</p>
            </div>
          </Rev>
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════
   P R O B L E M   S T A T E M E N T
   Large centered editorial copy, like ankar
   ══════════════════════════════════════════════════════════════════ */
export function ProblemSection() {
  return (
    <section style={{ padding: ds.sectionPad, maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
      <style>{KF}</style>
      <Rev><SectionLabel>The Problem</SectionLabel></Rev>
      <Rev d={150}>
        <SectionH2 style={{ fontSize: 56 }}>
          You know the answers.<br/>
          <span style={{ fontStyle: "italic", color: ds.textMuted }}>But interviews test something else.</span>
        </SectionH2>
      </Rev>
      <Rev d={300}>
        <p style={{
          fontFamily: ds.fontSans, fontSize: 17, lineHeight: 1.8, color: ds.textSec,
          maxWidth: 540, margin: "20px auto 0",
        }}>
          Generic question banks don't match your experience. Practicing alone
          means you never know what you're getting wrong — until it's too late.
          You need practice that feels real.
        </p>
      </Rev>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════
   H O W   I T   W O R K S
   Left/right alternating layout like ankar sections
   ══════════════════════════════════════════════════════════════════ */
export function HowItWorksSection() {
  const steps = [
    {
      num: "01", title: "Upload & configure",
      desc: "Add your resume and select your target role and company. The AI builds a custom interview in seconds.",
      visual: <StepVisualUpload />,
    },
    {
      num: "02", title: "Practice in real time",
      desc: "A conversational AI listens to your answers, asks follow-ups, and probes deeper — just like a real hiring manager.",
      visual: <StepVisualInterview />,
    },
    {
      num: "03", title: "Get scored feedback",
      desc: "Specific scores across communication, structure, and content. Actionable tips you can apply immediately.",
      visual: <StepVisualFeedback />,
    },
  ];

  return (
    <section style={{ padding: ds.sectionPad, maxWidth: ds.maxW, margin: "0 auto" }}>
      <style>{KF}</style>
      <Rev>
        <div style={{ textAlign: "center", marginBottom: 100 }}>
          <SectionLabel>How It Works</SectionLabel>
          <SectionH2>Three steps to interview confidence</SectionH2>
        </div>
      </Rev>

      {steps.map((step, i) => {
        const flip = i % 2 !== 0;
        return (
          <div key={step.num} style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80,
            alignItems: "center", marginBottom: i < 2 ? 120 : 0,
            direction: flip ? "rtl" : "ltr",
          }}>
            <Rev d={i * 100} style={{ direction: "ltr" }}>
              <div>
                <span style={{
                  fontFamily: ds.fontMono, fontSize: 12, fontWeight: 600,
                  color: ds.textFaint, letterSpacing: ".08em", display: "block", marginBottom: 16,
                }}>{step.num}</span>
                <h3 style={{
                  fontFamily: ds.fontSerif, fontSize: 36, fontWeight: 400,
                  letterSpacing: "-.02em", color: ds.text, margin: "0 0 16px",
                }}>{step.title}</h3>
                <p style={{
                  fontFamily: ds.fontSans, fontSize: 16, lineHeight: 1.75, color: ds.textSec,
                  margin: "0 0 28px", maxWidth: 380,
                }}>{step.desc}</p>
                <Pill small>Learn more</Pill>
              </div>
            </Rev>
            <Rev d={i * 100 + 150} style={{ direction: "ltr" }}>
              <Card>{step.visual}</Card>
            </Rev>
          </div>
        );
      })}
    </section>
  );
}

function StepVisualUpload() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <span style={{ fontFamily: ds.fontSans, fontSize: 13, fontWeight: 600, color: ds.text }}>New Session</span>
      <div style={{
        border: `1.5px dashed ${ds.border}`, borderRadius: ds.radius.md,
        padding: "32px 20px", textAlign: "center", background: ds.bg,
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={ds.textMuted} strokeWidth="1.5" style={{ margin: "0 auto 10px", display: "block" }}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p style={{ fontFamily: ds.fontSans, fontSize: 13, color: ds.text, margin: "0 0 4px" }}>Drop your resume</p>
        <p style={{ fontFamily: ds.fontSans, fontSize: 11, color: ds.textMuted, margin: 0 }}>PDF or DOCX</p>
      </div>
      <div>
        <label style={{ fontFamily: ds.fontSans, fontSize: 11, fontWeight: 500, color: ds.textMuted, letterSpacing: ".04em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Target Role</label>
        <div style={{ background: ds.bg, border: `1px solid ${ds.border}`, borderRadius: ds.radius.sm, padding: "10px 14px", fontFamily: ds.fontSans, fontSize: 13, color: ds.text }}>Software Engineer, Google</div>
      </div>
      <div style={{
        background: ds.black, color: ds.white, borderRadius: ds.radius.sm,
        padding: "11px 0", textAlign: "center", fontFamily: ds.fontSans, fontSize: 13, fontWeight: 600,
      }}>Generate Interview</div>
    </div>
  );
}

function StepVisualInterview() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontFamily: ds.fontSans, fontSize: 13, fontWeight: 600, color: ds.text }}>Live Session</span>
        <span style={{ fontFamily: ds.fontMono, fontSize: 11, color: ds.green, display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: ds.green, animation: "aPulse 1.5s ease-in-out infinite" }}/>Active
        </span>
      </div>
      <div style={{ background: ds.bg, border: `1px solid ${ds.borderLight}`, borderRadius: "4px 12px 12px 12px", padding: "12px 16px" }}>
        <p style={{ fontFamily: ds.fontSans, fontSize: 10, fontWeight: 600, color: ds.textMuted, marginBottom: 4, letterSpacing: ".04em", textTransform: "uppercase", margin: "0 0 4px" }}>Interviewer</p>
        <p style={{ fontFamily: ds.fontSans, fontSize: 12, lineHeight: 1.6, color: ds.text, margin: 0 }}>How do you prioritize competing deadlines?</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#E53E3E", animation: "aPulse 1s ease-in-out infinite" }}/>
        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 1.5, height: 20 }}>
          {Array.from({ length: 32 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: `${Math.random() * 80 + 20}%`, background: ds.black, borderRadius: 1, opacity: .08, alignSelf: "flex-end" }}/>
          ))}
        </div>
        <span style={{ fontFamily: ds.fontMono, fontSize: 10, color: ds.textMuted }}>0:58</span>
      </div>
    </div>
  );
}

function StepVisualFeedback() {
  const bars = [
    { label: "Communication", val: 87 },
    { label: "Structure", val: 92 },
    { label: "Impact & Metrics", val: 64 },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <span style={{ fontFamily: ds.fontSans, fontSize: 13, fontWeight: 600, color: ds.text }}>Session Score</span>
      <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
        <span style={{ fontFamily: ds.fontSerif, fontSize: 52, fontWeight: 400, color: ds.text, letterSpacing: "-.02em" }}>86</span>
        <p style={{ fontFamily: ds.fontSans, fontSize: 11, color: ds.textMuted, letterSpacing: ".06em", textTransform: "uppercase", margin: "4px 0 0" }}>Overall</p>
      </div>
      {bars.map(b => (
        <div key={b.label}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontFamily: ds.fontSans, fontSize: 12, color: ds.textSec }}>{b.label}</span>
            <span style={{ fontFamily: ds.fontMono, fontSize: 12, fontWeight: 600, color: ds.text }}>{b.val}</span>
          </div>
          <div style={{ height: 3, background: ds.borderLight, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${b.val}%`, background: b.val >= 80 ? ds.green : b.val >= 70 ? ds.gold : "#E53E3E", borderRadius: 2, transformOrigin: "left", animation: "aBarGrow 1.2s cubic-bezier(.16,1,.3,1) both" }}/>
          </div>
        </div>
      ))}
      <div style={{ background: ds.bg, borderRadius: ds.radius.sm, padding: "10px 14px", border: `1px solid ${ds.borderLight}` }}>
        <p style={{ fontFamily: ds.fontSans, fontSize: 12, color: ds.textSec, lineHeight: 1.5, fontStyle: "italic", margin: 0 }}>
          "Add a specific metric to your migration answer — '40% faster' makes it memorable."
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   F E A T U R E S   G R I D
   Ankar uses 2×3 or 3×2 grids, thin-border, icon + title + desc
   ══════════════════════════════════════════════════════════════════ */
export function FeaturesGrid() {
  const features = [
    { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>, title: "Resume-matched", desc: "Questions generated from your actual experience and target role." },
    { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>, title: "Real-time voice AI", desc: "The interviewer listens, responds, and follows up naturally." },
    { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>, title: "Specific feedback", desc: "Not 'be more clear.' Instead: 'Add the 40% metric to your answer.'" },
    { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>, title: "Private & secure", desc: "Your data is encrypted. Delete anytime from Settings." },
    { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>, title: "Progress tracking", desc: "Watch your scores improve session over session with analytics." },
    { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, title: "Ready in 2 minutes", desc: "Upload resume → pick role → start practicing. That fast." },
  ];

  return (
    <section style={{ padding: ds.sectionPad, maxWidth: ds.maxW, margin: "0 auto" }}>
      <style>{KF}</style>
      <Rev>
        <div style={{ textAlign: "center", marginBottom: 80 }}>
          <SectionLabel>Features</SectionLabel>
          <SectionH2>Built for serious preparation</SectionH2>
        </div>
      </Rev>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {features.map((f, i) => (
          <Rev key={f.title} d={i * 80}>
            <Card style={{ height: "100%" }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: ds.bg,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: ds.text, marginBottom: 20,
              }}>{f.icon}</div>
              <h3 style={{ fontFamily: ds.fontSans, fontSize: 17, fontWeight: 600, color: ds.text, margin: "0 0 8px" }}>{f.title}</h3>
              <p style={{ fontFamily: ds.fontSans, fontSize: 14, lineHeight: 1.65, color: ds.textSec, margin: 0 }}>{f.desc}</p>
            </Card>
          </Rev>
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════
   T E S T I M O N I A L S
   ══════════════════════════════════════════════════════════════════ */
export function TestimonialsSection() {
  const items = [
    { quote: "After a week of practice, I started getting callbacks — and landed my top-choice offer.", name: "Marcus T.", role: "Software Engineer", co: "Google" },
    { quote: "The AI found gaps I didn't know existed. Three weeks later, I had two offers.", name: "Dana R.", role: "Career Changer", co: "McKinsey" },
    { quote: "It told me I used filler words 15 times per answer. I fixed that, and my next interview felt completely different.", name: "Priya K.", role: "Recent Grad", co: "Amazon" },
  ];

  return (
    <section style={{ padding: ds.sectionPad, maxWidth: ds.maxW, margin: "0 auto" }}>
      <style>{KF}</style>
      <Rev>
        <div style={{ textAlign: "center", marginBottom: 80 }}>
          <SectionLabel>Results</SectionLabel>
          <SectionH2>Real outcomes from real practice</SectionH2>
        </div>
      </Rev>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {items.map((t_item, i) => (
          <Rev key={t_item.name} d={i * 100}>
            <Card style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
              <div>
                <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
                  {[1,2,3,4,5].map(s => (
                    <svg key={s} width="14" height="14" viewBox="0 0 24 24" fill={ds.gold} stroke="none">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  ))}
                </div>
                <p style={{ fontFamily: ds.fontSans, fontSize: 15, lineHeight: 1.7, color: ds.text, margin: "0 0 28px" }}>
                  &ldquo;{t_item.quote}&rdquo;
                </p>
              </div>
              <div>
                <Divider />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 20 }}>
                  <div>
                    <p style={{ fontFamily: ds.fontSans, fontSize: 14, fontWeight: 600, color: ds.text, margin: "0 0 2px" }}>{t_item.name}</p>
                    <p style={{ fontFamily: ds.fontSans, fontSize: 12, color: ds.textMuted, margin: 0 }}>{t_item.role}</p>
                  </div>
                  <span style={{
                    fontFamily: ds.fontMono, fontSize: 11, fontWeight: 600, color: ds.green,
                    background: ds.greenBg, padding: "4px 12px", borderRadius: ds.radius.pill,
                  }}>
                    {t_item.co}
                  </span>
                </div>
              </div>
            </Card>
          </Rev>
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════
   P R I C I N G
   Ankar style — side by side, white/black contrast
   ══════════════════════════════════════════════════════════════════ */
export function PricingSection() {
  const check = (col: string) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
  );

  return (
    <section style={{ padding: ds.sectionPad, maxWidth: 920, margin: "0 auto" }}>
      <style>{KF}</style>
      <Rev>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <SectionLabel>Pricing</SectionLabel>
          <SectionH2>Simple, transparent pricing</SectionH2>
          <p style={{ fontFamily: ds.fontSans, fontSize: 16, color: ds.textSec, margin: "12px 0 0" }}>
            Start free. No credit card required.
          </p>
        </div>
      </Rev>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Free */}
        <Rev d={100}>
          <Card>
            <span style={{ fontFamily: ds.fontSans, fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: ds.textMuted }}>Free</span>
            <div style={{ margin: "20px 0 28px" }}>
              <span style={{ fontFamily: ds.fontSerif, fontSize: 52, fontWeight: 400, color: ds.text, letterSpacing: "-.02em" }}>$0</span>
              <span style={{ fontFamily: ds.fontSans, fontSize: 14, color: ds.textMuted, marginLeft: 4 }}>forever</span>
            </div>
            <Divider />
            <div style={{ padding: "24px 0" }}>
              {["3 mock interviews", "AI-powered feedback", "Score tracking", "Resume upload"].map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  {check(ds.green)}
                  <span style={{ fontFamily: ds.fontSans, fontSize: 14, color: ds.textSec }}>{f}</span>
                </div>
              ))}
            </div>
            <Pill style={{ width: "100%", justifyContent: "center" }}>Get Started</Pill>
          </Card>
        </Rev>

        {/* Pro */}
        <Rev d={200}>
          <div style={{
            background: ds.black, borderRadius: ds.radius.lg, padding: "36px 32px",
            color: ds.white, position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: 20, right: 20 }}>
              <span style={{
                fontFamily: ds.fontSans, fontSize: 10, fontWeight: 700, letterSpacing: ".06em",
                textTransform: "uppercase", color: ds.black, background: ds.gold,
                padding: "4px 12px", borderRadius: ds.radius.pill,
              }}>Popular</span>
            </div>

            <span style={{ fontFamily: ds.fontSans, fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.45)" }}>Pro</span>
            <div style={{ margin: "20px 0 28px" }}>
              <span style={{ fontFamily: ds.fontSerif, fontSize: 52, fontWeight: 400, color: ds.white, letterSpacing: "-.02em" }}>$9</span>
              <span style={{ fontFamily: ds.fontSans, fontSize: 14, color: "rgba(255,255,255,.45)", marginLeft: 4 }}>/month</span>
            </div>
            <div style={{ height: 1, background: "rgba(255,255,255,.1)" }} />
            <div style={{ padding: "24px 0" }}>
              {["Unlimited interviews", "Advanced analytics", "Resume tips", "All interview types", "Priority AI", "Export reports"].map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  {check(ds.gold)}
                  <span style={{ fontFamily: ds.fontSans, fontSize: 14, color: "rgba(255,255,255,.75)" }}>{f}</span>
                </div>
              ))}
            </div>
            <button style={{
              width: "100%", padding: "14px 0", borderRadius: ds.radius.pill,
              border: "none", background: ds.white, color: ds.black,
              fontFamily: ds.fontSans, fontSize: 15, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all .25s ease",
            }}>
              Start Free Trial
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>
        </Rev>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════
   F A Q
   ══════════════════════════════════════════════════════════════════ */
export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);
  const faqs = [
    { q: "Is it really free to start?", a: "Yes — 3 full mock interview sessions with AI feedback, no credit card required." },
    { q: "How realistic is the AI interviewer?", a: "It adapts to your answers, asks follow-ups, and probes deeper — designed to match how real hiring managers interview." },
    { q: "What types of interviews are supported?", a: "Behavioral, technical, system design, case study, culture fit, and final round." },
    { q: "Can I target a specific company?", a: "Yes. Specify your target company and role, and the AI tailors questions accordingly." },
    { q: "What happens to my data?", a: "Encrypted and deletable anytime. We never share your information." },
  ];

  return (
    <section style={{ padding: ds.sectionPad, maxWidth: 720, margin: "0 auto" }}>
      <style>{KF}</style>
      <Rev>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <SectionH2>Frequently asked questions</SectionH2>
        </div>
      </Rev>
      <div>
        {faqs.map((faq, i) => {
          const isOpen = open === i;
          return (
            <Rev key={i} d={i * 50}>
              <div style={{ borderTop: `1px solid ${ds.border}` }}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  style={{
                    width: "100%", background: "transparent", border: "none",
                    padding: "22px 0", cursor: "pointer", textAlign: "left",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}
                >
                  <span style={{ fontFamily: ds.fontSans, fontSize: 16, fontWeight: 500, color: ds.text }}>
                    {faq.q}
                  </span>
                  <span style={{
                    width: 28, height: 28, borderRadius: "50%", border: `1px solid ${ds.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all .3s ease", transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
                    flexShrink: 0, marginLeft: 16, background: isOpen ? ds.black : "transparent",
                    color: isOpen ? ds.white : ds.textMuted, fontSize: 18, fontWeight: 300,
                    borderColor: isOpen ? ds.black : ds.border,
                  }}>
                    +
                  </span>
                </button>
                <div style={{
                  overflow: "hidden", maxHeight: isOpen ? 100 : 0, opacity: isOpen ? 1 : 0,
                  transition: "all .45s cubic-bezier(.16,1,.3,1)", paddingBottom: isOpen ? 20 : 0,
                }}>
                  <p style={{ fontFamily: ds.fontSans, fontSize: 15, lineHeight: 1.7, color: ds.textSec, margin: 0, paddingRight: 48 }}>
                    {faq.a}
                  </p>
                </div>
              </div>
            </Rev>
          );
        })}
        <div style={{ borderTop: `1px solid ${ds.border}` }} />
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════
   F I N A L   C T A
   ══════════════════════════════════════════════════════════════════ */
export function FinalCTA() {
  return (
    <section style={{
      padding: "120px 64px", margin: "0 64px 64px", borderRadius: ds.radius.xl,
      background: ds.black, textAlign: "center", position: "relative", overflow: "hidden",
    }}>
      <style>{KF}</style>
      {/* Subtle gradient orb */}
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: 600, height: 600, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(184,146,62,.08) 0%, transparent 70%)",
        filter: "blur(80px)", pointerEvents: "none",
      }} />

      <Rev>
        <h2 style={{
          fontFamily: ds.fontSerif, fontSize: 60, fontWeight: 400, lineHeight: 1.08,
          letterSpacing: "-.035em", color: ds.white, margin: "0 0 24px", position: "relative",
        }}>
          Your next interview<br/>
          <span style={{ fontStyle: "italic", color: ds.gold }}>starts here.</span>
        </h2>
      </Rev>
      <Rev d={200}>
        <p style={{ fontFamily: ds.fontSans, fontSize: 17, lineHeight: 1.7, color: "rgba(255,255,255,.55)", margin: "0 0 40px", position: "relative" }}>
          Free to start. No credit card. Practice today.
        </p>
      </Rev>
      <Rev d={400}>
        <div style={{ position: "relative" }}>
          <Pill dark style={{ background: ds.white, color: ds.black }}>Get Started Free</Pill>
        </div>
      </Rev>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════
   F O O T E R
   ══════════════════════════════════════════════════════════════════ */
export function FooterSection() {
  return (
    <footer style={{ padding: "32px 64px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: ds.black, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: ds.fontSerif, fontSize: 12, color: ds.white }}>H</span>
        </div>
        <span style={{ fontFamily: ds.fontSerif, fontSize: 18, color: ds.text }}>HireStepX</span>
      </div>
      <div style={{ display: "flex", gap: 28 }}>
        {["Privacy", "Terms", "Blog", "Support"].map(l => (
          <span key={l} style={{ fontFamily: ds.fontSans, fontSize: 13, color: ds.textMuted, cursor: "pointer", transition: "color .2s" }}>{l}</span>
        ))}
      </div>
      <span style={{ fontFamily: ds.fontSans, fontSize: 12, color: ds.textFaint }}>&copy; 2025 HireStepX</span>
    </footer>
  );
}

/* ══════════════════════════════════════════════════════════════════
   F U L L   P A G E
   ══════════════════════════════════════════════════════════════════ */
export function FullPage() {
  return (
    <div style={{ background: ds.bg, color: ds.text, minHeight: "100vh", overflow: "hidden" }}>
      <style>{KF}</style>
      <NavBar />
      <HeroSection />
      <LogoTicker />
      <MetricsBar />
      <ProblemSection />
      <Divider />
      <HowItWorksSection />
      <Divider />
      <FeaturesGrid />
      <TestimonialsSection />
      <PricingSection />
      <FAQSection />
      <FinalCTA />
      <FooterSection />
    </div>
  );
}
