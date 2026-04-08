import React, { useState, useEffect, useRef, CSSProperties } from "react";

/* ─── Design Tokens (light-only, inspired by delphi/humble/ankar/exactly) ─── */
const t = {
  white: "#FFFFFF",
  bg: "#FAFAF9",
  warmCream: "#F7F5F0",
  text: "#111111",
  textSecondary: "#555555",
  textMuted: "#999999",
  border: "rgba(0,0,0,0.08)",
  borderHover: "rgba(0,0,0,0.16)",
  accent: "#B8923E",
  accentDark: "#96752E",
  accentLight: "#EDE4D3",
  accentSubtle: "rgba(184,146,62,0.06)",
  green: "#2D7A3A",
  greenLight: "#E8F5E9",
  red: "#C4705A",
  font: {
    display: "'Instrument Serif', Georgia, serif",
    body: "'Inter', -apple-system, sans-serif",
    mono: "'JetBrains Mono', monospace",
  },
  shadow: {
    sm: "0 1px 2px rgba(0,0,0,0.04)",
    md: "0 4px 16px rgba(0,0,0,0.06)",
    lg: "0 12px 40px rgba(0,0,0,0.08)",
    xl: "0 24px 64px rgba(0,0,0,0.10)",
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 24, pill: 100 },
};

/* ─── Animation Keyframes ─── */
const keyframes = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(32px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-40px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(40px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.92); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes widthGrow {
    from { width: 0; }
    to { width: 100%; }
  }
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  @keyframes marquee {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  @keyframes cursorBlink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
  @keyframes gradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  @keyframes dotPulse {
    0%, 100% { transform: scale(1); opacity: 0.6; }
    50% { transform: scale(1.4); opacity: 1; }
  }
  @keyframes barGrow {
    from { transform: scaleX(0); }
    to { transform: scaleX(1); }
  }
  @keyframes typewriter {
    from { width: 0; }
    to { width: 100%; }
  }
  @keyframes magnetHover {
    0% { transform: translate(0, 0); }
    25% { transform: translate(2px, -2px); }
    50% { transform: translate(-1px, 1px); }
    75% { transform: translate(1px, -1px); }
    100% { transform: translate(0, 0); }
  }
`;

/* ─── Micro-interaction: Hover-lift card ─── */
function HoverCard({ children, style, className }: { children: React.ReactNode; style?: CSSProperties; className?: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: t.white,
        border: `1px solid ${t.border}`,
        borderRadius: t.radius.lg,
        transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
        boxShadow: hovered ? t.shadow.lg : t.shadow.sm,
        borderColor: hovered ? t.borderHover : t.border,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ─── Micro-interaction: Magnetic button ─── */
function MagneticButton({ children, primary, style }: { children: React.ReactNode; primary?: boolean; style?: CSSProperties }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) * 0.15;
    const y = (e.clientY - rect.top - rect.height / 2) * 0.15;
    setOffset({ x, y });
  };

  return (
    <button
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setOffset({ x: 0, y: 0 }); setHovered(false); }}
      style={{
        fontFamily: t.font.body,
        fontSize: 15,
        fontWeight: 600,
        padding: "16px 40px",
        borderRadius: t.radius.pill,
        border: primary ? "none" : `1.5px solid ${t.text}`,
        background: primary ? t.text : "transparent",
        color: primary ? t.white : t.text,
        cursor: "pointer",
        transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        transform: `translate(${offset.x}px, ${offset.y}px) scale(${hovered ? 1.02 : 1})`,
        boxShadow: hovered && primary ? "0 8px 32px rgba(0,0,0,0.2)" : "none",
        letterSpacing: "0.01em",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ─── Micro-interaction: Reveal on scroll ─── */
function Reveal({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: CSSProperties }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-reveal in canvas preview
    const timer = setTimeout(() => setVisible(true), 300 + delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(40px)",
        transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ─── Stagger children animation ─── */
function Stagger({ children, staggerMs = 100 }: { children: React.ReactNode; staggerMs?: number }) {
  return (
    <>
      {React.Children.map(children, (child, i) => (
        <Reveal delay={i * staggerMs}>{child}</Reveal>
      ))}
    </>
  );
}

/* ═══════════════════════════════════════════════════
   NAVBAR — Ultra-minimal like ankar.ai
   ═══════════════════════════════════════════════════ */
export function NavBar() {
  return (
    <nav style={{
      position: "relative", top: 0, left: 0, right: 0, width: "100%",
      padding: "0 56px", height: 72, display: "flex", alignItems: "center", justifyContent: "space-between",
      background: "rgba(250,250,249,0.85)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
      borderBottom: `1px solid ${t.border}`,
    }}>
      <style>{keyframes}</style>
      {/* Logo — text mark only */}
      <div style={{ fontFamily: t.font.display, fontSize: 24, fontWeight: 400, color: t.text, letterSpacing: "0.01em" }}>
        HireStepX
      </div>

      {/* Center links */}
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        {["Product", "How It Works", "Pricing"].map((item) => (
          <span
            key={item}
            style={{
              fontFamily: t.font.body, fontSize: 14, fontWeight: 400, color: t.textSecondary,
              cursor: "pointer", transition: "color 0.2s ease", position: "relative",
            }}
          >
            {item}
          </span>
        ))}
      </div>

      {/* Right CTA */}
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <span style={{ fontFamily: t.font.body, fontSize: 14, fontWeight: 500, color: t.text, cursor: "pointer" }}>
          Log in
        </span>
        <button style={{
          fontFamily: t.font.body, fontSize: 14, fontWeight: 600, padding: "10px 24px",
          borderRadius: t.radius.pill, border: "none", background: t.text, color: t.white,
          cursor: "pointer", transition: "all 0.25s ease",
        }}>
          Get Started
        </button>
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════════════
   HERO — Massive type, inspired by delphi.ai + exactly.ai
   ═══════════════════════════════════════════════════ */
export function HeroSection() {
  const [lineVisible, setLineVisible] = useState(false);
  const [mockupVisible, setMockupVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setLineVisible(true), 600);
    setTimeout(() => setMockupVisible(true), 1000);
  }, []);

  return (
    <section style={{
      padding: "140px 56px 100px", maxWidth: 1400, margin: "0 auto",
      display: "flex", alignItems: "center", gap: 80,
    }}>
      <style>{keyframes}</style>

      {/* Left: Typography-driven hero */}
      <div style={{ flex: "1 1 55%", position: "relative" }}>
        {/* Pill badge */}
        <Reveal>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px",
            borderRadius: t.radius.pill, border: `1px solid ${t.border}`, marginBottom: 32,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.green, animation: "pulse 2s ease-in-out infinite" }} />
            <span style={{ fontFamily: t.font.body, fontSize: 12, fontWeight: 500, color: t.textSecondary, letterSpacing: "0.02em" }}>
              Now live — start practicing free
            </span>
          </div>
        </Reveal>

        {/* Main headline */}
        <Reveal delay={200}>
          <h1 style={{
            fontFamily: t.font.display, fontSize: 80, fontWeight: 400,
            lineHeight: 1.04, letterSpacing: "-0.035em", color: t.text,
            margin: "0 0 28px", maxWidth: 600,
          }}>
            Nail your next{" "}
            <span style={{
              fontStyle: "italic",
              background: `linear-gradient(135deg, ${t.accent}, ${t.accentDark})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              interview.
            </span>
          </h1>
        </Reveal>

        {/* Subhead */}
        <Reveal delay={400}>
          <p style={{
            fontFamily: t.font.body, fontSize: 18, fontWeight: 400,
            lineHeight: 1.7, color: t.textSecondary, maxWidth: 480,
            margin: "0 0 44px",
          }}>
            AI mock interviews tailored to your resume and target role.
            Realistic practice with instant, specific feedback.
          </p>
        </Reveal>

        {/* CTA row */}
        <Reveal delay={600}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <MagneticButton primary>Start Practicing</MagneticButton>
            <MagneticButton>See How It Works</MagneticButton>
          </div>
        </Reveal>

        {/* Subtle proof line */}
        <Reveal delay={800}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 48 }}>
            <div style={{ display: "flex" }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: `hsl(${40 + i * 30}, 30%, ${75 - i * 8}%)`,
                  border: `2px solid ${t.white}`, marginLeft: i === 1 ? 0 : -8,
                }} />
              ))}
            </div>
            <span style={{ fontFamily: t.font.body, fontSize: 13, color: t.textMuted }}>
              Trusted by candidates at Google, McKinsey & more
            </span>
          </div>
        </Reveal>
      </div>

      {/* Right: Product mockup with micro-interactions */}
      <div style={{
        flex: "1 1 45%", position: "relative",
        opacity: mockupVisible ? 1 : 0,
        transform: mockupVisible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.96)",
        transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        <HeroMockup />
      </div>
    </section>
  );
}

/* ─── Hero Mockup: Floating interview card ─── */
function HeroMockup() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 1400),
      setTimeout(() => setStep(2), 2800),
      setTimeout(() => setStep(3), 4200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div style={{ position: "relative" }}>
      {/* Subtle ambient glow */}
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: "90%", height: "90%", borderRadius: "50%",
        background: "radial-gradient(ellipse, rgba(184,146,62,0.08) 0%, transparent 70%)",
        filter: "blur(60px)", pointerEvents: "none",
      }} />

      {/* Main card */}
      <div style={{
        background: t.white, borderRadius: 20, border: `1px solid ${t.border}`,
        overflow: "hidden", boxShadow: t.shadow.xl,
        animation: "float 6s ease-in-out infinite",
      }}>
        {/* Chrome bar */}
        <div style={{
          height: 44, background: t.bg, borderBottom: `1px solid ${t.border}`,
          display: "flex", alignItems: "center", padding: "0 16px", gap: 6,
        }}>
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c, i) => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.8 }} />
          ))}
          <div style={{ flex: 1, textAlign: "center" }}>
            <span style={{
              fontFamily: t.font.body, fontSize: 11, color: t.textMuted,
              background: t.warmCream, padding: "3px 16px", borderRadius: 6,
            }}>
              hirestepx.com/interview
            </span>
          </div>
        </div>

        <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Live indicator */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: t.font.body, fontSize: 14, fontWeight: 600, color: t.text }}>Live Session</span>
            <span style={{
              fontFamily: t.font.mono, fontSize: 11, color: t.green,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.green, animation: "pulse 1.5s ease-in-out infinite" }} />
              Recording
            </span>
          </div>

          {/* Interviewer bubble */}
          <div style={{
            opacity: step >= 1 ? 1 : 0, transform: step >= 1 ? "translateX(0)" : "translateX(-16px)",
            transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
          }}>
            <div style={{
              background: t.warmCream, borderRadius: "4px 16px 16px 16px", padding: "14px 18px",
              border: `1px solid ${t.border}`,
            }}>
              <p style={{ fontFamily: t.font.body, fontSize: 10, fontWeight: 600, color: t.accent, marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>Interviewer</p>
              <p style={{ fontFamily: t.font.body, fontSize: 13, lineHeight: 1.6, color: t.text, margin: 0 }}>
                Tell me about a project where you had to make a critical technical decision under pressure.
              </p>
            </div>
          </div>

          {/* User response */}
          <div style={{
            opacity: step >= 2 ? 1 : 0, transform: step >= 2 ? "translateX(0)" : "translateX(16px)",
            transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
          }}>
            <div style={{
              background: t.white, borderRadius: "16px 4px 16px 16px", padding: "14px 18px",
              border: `1px solid ${t.border}`, marginLeft: 40,
            }}>
              <p style={{ fontFamily: t.font.body, fontSize: 10, fontWeight: 600, color: t.green, marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>You</p>
              <p style={{ fontFamily: t.font.body, fontSize: 13, lineHeight: 1.6, color: t.textSecondary, margin: 0 }}>
                We had a tight deadline to migrate our payment system. I broke it into phases...
              </p>
            </div>
          </div>

          {/* Waveform */}
          <div style={{
            opacity: step >= 2 ? 1 : 0, transition: "opacity 0.5s ease",
            display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.red, animation: "pulse 1s ease-in-out infinite" }} />
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 1.5, height: 24 }}>
              {Array.from({ length: 36 }).map((_, i) => (
                <div key={i} style={{
                  flex: 1, borderRadius: 1, alignSelf: "flex-end",
                  height: `${20 + Math.sin(i * 0.8) * 40 + Math.random() * 40}%`,
                  background: t.text, opacity: 0.12,
                }} />
              ))}
            </div>
            <span style={{ fontFamily: t.font.mono, fontSize: 10, color: t.textMuted }}>2:34</span>
          </div>
        </div>
      </div>

      {/* Floating insight chip — micro-interaction */}
      <div style={{
        position: "absolute", bottom: -16, right: -20,
        background: t.white, borderRadius: 14, border: `1px solid ${t.border}`,
        padding: "14px 20px", maxWidth: 240, boxShadow: t.shadow.lg,
        opacity: step >= 3 ? 1 : 0, transform: step >= 3 ? "translateY(0) scale(1)" : "translateY(8px) scale(0.95)",
        transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: 6, background: t.accentSubtle, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={t.accent} strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg>
          </div>
          <span style={{ fontFamily: t.font.body, fontSize: 10, fontWeight: 600, color: t.accent, letterSpacing: "0.04em", textTransform: "uppercase" }}>AI Insight</span>
        </div>
        <p style={{ fontFamily: t.font.body, fontSize: 12, lineHeight: 1.5, color: t.textSecondary, margin: 0 }}>
          Add a specific metric to strengthen your answer.
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   LOGO MARQUEE — Continuous scroll, like humblefactory.ai
   ═══════════════════════════════════════════════════ */
export function LogoMarquee() {
  const logos = ["Google", "Apple", "McKinsey", "Amazon", "Meta", "Goldman Sachs", "Deloitte", "Microsoft"];
  const doubled = [...logos, ...logos]; // For seamless loop

  return (
    <section style={{
      padding: "40px 0", borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}`,
      overflow: "hidden", position: "relative",
    }}>
      <style>{keyframes}</style>
      {/* Fade edges */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 120, background: `linear-gradient(90deg, ${t.bg}, transparent)`, zIndex: 2 }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 120, background: `linear-gradient(270deg, ${t.bg}, transparent)`, zIndex: 2 }} />

      <div style={{
        display: "flex", gap: 64, animation: "marquee 30s linear infinite",
        width: "max-content",
      }}>
        {doubled.map((name, i) => (
          <span key={i} style={{
            fontFamily: t.font.body, fontSize: 14, fontWeight: 600, color: t.text,
            opacity: 0.2, letterSpacing: "0.04em", whiteSpace: "nowrap",
            transition: "opacity 0.3s ease",
          }}>
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════
   STATS — Clean number grid with count-up
   ═══════════════════════════════════════════════════ */
export function StatsSection() {
  const stats = [
    { value: "6", label: "Interview Types" },
    { value: "50+", label: "Target Companies" },
    { value: "3", label: "Free Sessions" },
    { value: "Free", label: "To Get Started" },
  ];

  return (
    <section style={{ padding: "80px 56px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: t.border, borderRadius: t.radius.lg, overflow: "hidden" }}>
        <Stagger staggerMs={120}>
          {stats.map((s) => (
            <div key={s.label} style={{ background: t.white, padding: "40px 32px", textAlign: "center" }}>
              <span style={{ fontFamily: t.font.display, fontSize: 48, fontWeight: 400, color: t.text, display: "block", marginBottom: 8, letterSpacing: "-0.02em" }}>
                {s.value}
              </span>
              <span style={{ fontFamily: t.font.body, fontSize: 13, color: t.textMuted, letterSpacing: "0.02em" }}>
                {s.label}
              </span>
            </div>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════
   PROBLEM STATEMENT — Editorial layout like humblefactory
   ═══════════════════════════════════════════════════ */
export function ProblemSection() {
  return (
    <section style={{ padding: "160px 56px", maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
      <style>{keyframes}</style>
      <Reveal>
        <p style={{
          fontFamily: t.font.body, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em",
          textTransform: "uppercase", color: t.textMuted, marginBottom: 32,
        }}>
          The Problem
        </p>
      </Reveal>
      <Reveal delay={200}>
        <h2 style={{
          fontFamily: t.font.display, fontSize: 52, fontWeight: 400, lineHeight: 1.2,
          letterSpacing: "-0.025em", color: t.text, margin: "0 0 32px",
        }}>
          You know your stuff.{" "}
          <span style={{ fontStyle: "italic", color: t.accent }}>Interviews are a different skill.</span>
        </h2>
      </Reveal>
      <Reveal delay={400}>
        <p style={{
          fontFamily: t.font.body, fontSize: 18, lineHeight: 1.8, color: t.textSecondary,
          maxWidth: 600, margin: "0 auto",
        }}>
          Generic question banks don't match your experience.
          Practicing alone means you never know what you're getting wrong
          — until it's too late.
        </p>
      </Reveal>
    </section>
  );
}

/* ═══════════════════════════════════════════════════
   HOW IT WORKS — Stepped reveal, inspired by exactly.ai
   ═══════════════════════════════════════════════════ */
export function HowItWorksSection() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setActive((p) => (p + 1) % 3), 4000);
    return () => clearInterval(timer);
  }, []);

  const steps = [
    {
      number: "01",
      title: "Upload your resume",
      desc: "Add your experience and target role. Our AI creates a personalized interview.",
    },
    {
      number: "02",
      title: "Practice in real time",
      desc: "A conversational AI listens, asks follow-ups, and probes — just like a real interviewer.",
    },
    {
      number: "03",
      title: "Get scored feedback",
      desc: "Specific scores and actionable tips. Know exactly what to improve.",
    },
  ];

  return (
    <section style={{ padding: "160px 56px", maxWidth: 1200, margin: "0 auto" }}>
      <style>{keyframes}</style>
      <Reveal>
        <p style={{ fontFamily: t.font.body, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: t.textMuted, marginBottom: 16, textAlign: "center" }}>
          How It Works
        </p>
        <h2 style={{ fontFamily: t.font.display, fontSize: 48, fontWeight: 400, letterSpacing: "-0.025em", color: t.text, textAlign: "center", margin: "0 0 80px" }}>
          Three steps to sharper interviews
        </h2>
      </Reveal>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 80, alignItems: "center" }}>
        {/* Left: Steps list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {steps.map((step, i) => {
            const isActive = active === i;
            return (
              <button
                key={step.number}
                onClick={() => setActive(i)}
                style={{
                  background: "transparent", border: "none", borderLeft: `2px solid ${isActive ? t.text : t.border}`,
                  padding: "28px 32px", textAlign: "left", cursor: "pointer",
                  transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: isActive ? 12 : 0 }}>
                  <span style={{
                    fontFamily: t.font.mono, fontSize: 12, fontWeight: 600,
                    color: isActive ? t.accent : t.textMuted, transition: "color 0.3s ease",
                  }}>
                    {step.number}
                  </span>
                  <span style={{
                    fontFamily: t.font.body, fontSize: 18, fontWeight: 600,
                    color: isActive ? t.text : t.textMuted, transition: "color 0.3s ease",
                  }}>
                    {step.title}
                  </span>
                </div>
                <div style={{
                  overflow: "hidden", maxHeight: isActive ? 60 : 0, opacity: isActive ? 1 : 0,
                  transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)", paddingLeft: 40,
                }}>
                  <p style={{ fontFamily: t.font.body, fontSize: 14, lineHeight: 1.6, color: t.textSecondary, margin: 0 }}>
                    {step.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: Mockup card */}
        <div style={{ position: "relative" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              position: i === 0 ? "relative" : "absolute", inset: i === 0 ? undefined : 0,
              opacity: active === i ? 1 : 0, transform: active === i ? "scale(1)" : "scale(0.96)",
              transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)", pointerEvents: active === i ? "auto" : "none",
            }}>
              <HoverCard style={{ padding: 28 }}>
                {i === 0 && <StepMockupUpload />}
                {i === 1 && <StepMockupInterview />}
                {i === 2 && <StepMockupFeedback />}
              </HoverCard>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StepMockupUpload() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <span style={{ fontFamily: t.font.body, fontSize: 14, fontWeight: 600, color: t.text }}>New Session</span>
      <div style={{
        border: `1.5px dashed ${t.borderHover}`, borderRadius: t.radius.md, padding: "36px 20px",
        textAlign: "center", background: t.warmCream, transition: "all 0.3s ease",
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth="1.5" style={{ margin: "0 auto 12px", display: "block" }}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p style={{ fontFamily: t.font.body, fontSize: 14, color: t.text, margin: "0 0 4px" }}>Drop your resume here</p>
        <p style={{ fontFamily: t.font.body, fontSize: 12, color: t.textMuted, margin: 0 }}>PDF, DOCX, or plain text</p>
      </div>
      <div>
        <label style={{ fontFamily: t.font.body, fontSize: 11, fontWeight: 500, color: t.textMuted, letterSpacing: "0.04em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Target Role</label>
        <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: t.radius.sm, padding: "10px 14px", fontFamily: t.font.body, fontSize: 13, color: t.text }}>
          Software Engineer, Google
        </div>
      </div>
      <button style={{ background: t.text, color: t.white, borderRadius: t.radius.sm, padding: "12px 0", textAlign: "center", fontFamily: t.font.body, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer" }}>
        Generate Interview
      </button>
    </div>
  );
}

function StepMockupInterview() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: t.font.body, fontSize: 14, fontWeight: 600, color: t.text }}>Live Session</span>
        <span style={{ fontFamily: t.font.mono, fontSize: 11, color: t.green, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.green, animation: "pulse 1.5s ease-in-out infinite" }} /> Active
        </span>
      </div>
      <div style={{ background: t.warmCream, border: `1px solid ${t.border}`, borderRadius: "4px 14px 14px 14px", padding: "14px 18px" }}>
        <p style={{ fontFamily: t.font.body, fontSize: 10, fontWeight: 600, color: t.accent, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>Interviewer</p>
        <p style={{ fontFamily: t.font.body, fontSize: 13, lineHeight: 1.6, color: t.text, margin: 0 }}>
          Walk me through a challenging project you led recently.
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.red, animation: "pulse 1s ease-in-out infinite" }} />
        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 1.5, height: 28 }}>
          {Array.from({ length: 36 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: `${Math.random() * 80 + 20}%`, background: t.text, borderRadius: 1, opacity: 0.1, alignSelf: "flex-end" }} />
          ))}
        </div>
        <span style={{ fontFamily: t.font.mono, fontSize: 10, color: t.textMuted }}>1:47</span>
      </div>
    </div>
  );
}

function StepMockupFeedback() {
  const scores = [
    { label: "Communication", value: 87, color: t.accent },
    { label: "Problem Solving", value: 92, color: t.green },
    { label: "Structure", value: 78, color: t.red },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <span style={{ fontFamily: t.font.body, fontSize: 14, fontWeight: 600, color: t.text }}>Session Feedback</span>
      <div style={{ textAlign: "center", padding: "12px 0" }}>
        <span style={{ fontFamily: t.font.display, fontSize: 56, fontWeight: 400, color: t.text, letterSpacing: "-0.02em" }}>86</span>
        <p style={{ fontFamily: t.font.body, fontSize: 11, color: t.textMuted, marginTop: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>Overall Score</p>
      </div>
      {scores.map((s) => (
        <div key={s.label}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontFamily: t.font.body, fontSize: 13, color: t.textSecondary }}>{s.label}</span>
            <span style={{ fontFamily: t.font.mono, fontSize: 13, fontWeight: 600, color: t.text }}>{s.value}</span>
          </div>
          <div style={{ height: 4, background: t.border, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${s.value}%`, background: s.color, borderRadius: 2, transformOrigin: "left", animation: "barGrow 1.2s cubic-bezier(0.16, 1, 0.3, 1) both" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   FEATURES — Bento grid, inspired by delphi.ai
   ═══════════════════════════════════════════════════ */
export function FeaturesSection() {
  const features = [
    { icon: "📄", title: "Resume-matched questions", desc: "Every session is generated from your actual experience, targeting the exact role you're applying for.", span: "wide" },
    { icon: "🎙️", title: "Real-time conversation", desc: "The AI listens and follows up — just like a real hiring manager.", span: "normal" },
    { icon: "📊", title: "Specific feedback", desc: "Not 'be more specific.' Instead: 'Add the 40% metric to your answer.'", span: "normal" },
    { icon: "🔒", title: "Private by design", desc: "Your data stays yours. Delete anytime from Settings.", span: "normal" },
    { icon: "⚡", title: "6 interview types", desc: "Behavioral, technical, system design, case study, and more.", span: "normal" },
    { icon: "📈", title: "Progress tracking", desc: "See your scores improve over time with session-by-session analytics.", span: "wide" },
  ];

  return (
    <section style={{ padding: "160px 56px", maxWidth: 1200, margin: "0 auto" }}>
      <style>{keyframes}</style>
      <Reveal>
        <p style={{ fontFamily: t.font.body, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: t.textMuted, marginBottom: 16, textAlign: "center" }}>
          Features
        </p>
        <h2 style={{ fontFamily: t.font.display, fontSize: 48, fontWeight: 400, letterSpacing: "-0.025em", color: t.text, textAlign: "center", margin: "0 0 80px" }}>
          Everything you need to <span style={{ fontStyle: "italic" }}>ace it</span>
        </h2>
      </Reveal>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        <Stagger staggerMs={80}>
          {features.map((f, i) => (
            <HoverCard
              key={f.title}
              style={{
                padding: "36px 32px",
                gridColumn: f.span === "wide" ? "span 2" : "span 1",
              }}
            >
              <span style={{ fontSize: 28, display: "block", marginBottom: 20 }}>{f.icon}</span>
              <h3 style={{ fontFamily: t.font.body, fontSize: 18, fontWeight: 600, color: t.text, margin: "0 0 10px" }}>{f.title}</h3>
              <p style={{ fontFamily: t.font.body, fontSize: 14, lineHeight: 1.7, color: t.textSecondary, margin: 0 }}>{f.desc}</p>
            </HoverCard>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════
   TESTIMONIALS — Clean cards, inspired by exactly.ai
   ═══════════════════════════════════════════════════ */
export function TestimonialsSection() {
  const testimonials = [
    { quote: "After a week of practice, I started getting callbacks — and landed an offer at my top choice.", name: "Marcus T.", role: "Software Engineer", result: "Google" },
    { quote: "The AI caught gaps I didn't know I had. Three weeks later, I had two offers.", name: "Dana R.", role: "Career Changer", result: "McKinsey" },
    { quote: "Told me I was using filler words 15 times per answer. Fixed that, and my next interview felt completely different.", name: "Priya K.", role: "Recent Grad", result: "Amazon" },
  ];

  return (
    <section style={{ padding: "160px 56px", maxWidth: 1200, margin: "0 auto" }}>
      <style>{keyframes}</style>
      <Reveal>
        <p style={{ fontFamily: t.font.body, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: t.textMuted, marginBottom: 16, textAlign: "center" }}>
          Results
        </p>
        <h2 style={{ fontFamily: t.font.display, fontSize: 48, fontWeight: 400, letterSpacing: "-0.025em", color: t.text, textAlign: "center", margin: "0 0 80px" }}>
          Real outcomes from real practice
        </h2>
      </Reveal>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        <Stagger staggerMs={120}>
          {testimonials.map((t_item) => (
            <HoverCard key={t_item.name} style={{ padding: "36px 32px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                {/* Star rating */}
                <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <svg key={s} width="16" height="16" viewBox="0 0 24 24" fill={t.accent} stroke="none">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  ))}
                </div>
                <p style={{ fontFamily: t.font.body, fontSize: 15, lineHeight: 1.7, color: t.text, margin: "0 0 28px" }}>
                  "{t_item.quote}"
                </p>
              </div>
              <div>
                <div style={{ height: 1, background: t.border, marginBottom: 20 }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ fontFamily: t.font.body, fontSize: 14, fontWeight: 600, color: t.text, margin: "0 0 2px" }}>{t_item.name}</p>
                    <p style={{ fontFamily: t.font.body, fontSize: 12, color: t.textMuted, margin: 0 }}>{t_item.role}</p>
                  </div>
                  <span style={{
                    fontFamily: t.font.mono, fontSize: 11, fontWeight: 600, color: t.green,
                    background: t.greenLight, padding: "4px 10px", borderRadius: 6,
                  }}>
                    Hired at {t_item.result}
                  </span>
                </div>
              </div>
            </HoverCard>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════
   PRICING — Clean 2-column, inspired by ankar.ai
   ═══════════════════════════════════════════════════ */
export function PricingSection() {
  return (
    <section style={{ padding: "160px 56px", maxWidth: 1000, margin: "0 auto" }}>
      <style>{keyframes}</style>
      <Reveal>
        <p style={{ fontFamily: t.font.body, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: t.textMuted, marginBottom: 16, textAlign: "center" }}>
          Pricing
        </p>
        <h2 style={{ fontFamily: t.font.display, fontSize: 48, fontWeight: 400, letterSpacing: "-0.025em", color: t.text, textAlign: "center", margin: "0 0 16px" }}>
          Start free, upgrade when ready
        </h2>
        <p style={{ fontFamily: t.font.body, fontSize: 16, color: t.textSecondary, textAlign: "center", margin: "0 0 64px" }}>
          No credit card required. Practice 3 sessions free.
        </p>
      </Reveal>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Free */}
        <Reveal delay={100}>
          <HoverCard style={{ padding: "40px 36px" }}>
            <span style={{ fontFamily: t.font.body, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: t.textMuted, display: "block", marginBottom: 16 }}>Free</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 28 }}>
              <span style={{ fontFamily: t.font.display, fontSize: 48, fontWeight: 400, color: t.text }}>$0</span>
              <span style={{ fontFamily: t.font.body, fontSize: 14, color: t.textMuted }}>forever</span>
            </div>
            <div style={{ height: 1, background: t.border, marginBottom: 28 }} />
            {["3 mock interviews", "AI-powered feedback", "Score tracking", "Resume upload"].map((f) => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.green} strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                <span style={{ fontFamily: t.font.body, fontSize: 14, color: t.textSecondary }}>{f}</span>
              </div>
            ))}
            <button style={{
              width: "100%", marginTop: 24, padding: "14px 0", borderRadius: t.radius.sm,
              border: `1.5px solid ${t.text}`, background: "transparent", color: t.text,
              fontFamily: t.font.body, fontSize: 14, fontWeight: 600, cursor: "pointer",
              transition: "all 0.25s ease",
            }}>
              Get Started
            </button>
          </HoverCard>
        </Reveal>

        {/* Pro */}
        <Reveal delay={200}>
          <div style={{
            background: t.text, borderRadius: t.radius.lg, padding: "40px 36px",
            color: t.white, position: "relative", overflow: "hidden",
            boxShadow: t.shadow.xl, transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          }}>
            {/* Popular badge */}
            <span style={{
              position: "absolute", top: 20, right: 20,
              fontFamily: t.font.body, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
              textTransform: "uppercase", color: t.text, background: t.accent,
              padding: "4px 12px", borderRadius: t.radius.pill,
            }}>
              Popular
            </span>

            <span style={{ fontFamily: t.font.body, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 16 }}>Pro</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 28 }}>
              <span style={{ fontFamily: t.font.display, fontSize: 48, fontWeight: 400, color: t.white }}>$9</span>
              <span style={{ fontFamily: t.font.body, fontSize: 14, color: "rgba(255,255,255,0.5)" }}>/month</span>
            </div>
            <div style={{ height: 1, background: "rgba(255,255,255,0.1)", marginBottom: 28 }} />
            {["Unlimited interviews", "Advanced analytics", "Resume optimization tips", "All interview types", "Priority AI processing", "Export session reports"].map((f) => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.accent} strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                <span style={{ fontFamily: t.font.body, fontSize: 14, color: "rgba(255,255,255,0.8)" }}>{f}</span>
              </div>
            ))}
            <button style={{
              width: "100%", marginTop: 24, padding: "14px 0", borderRadius: t.radius.sm,
              border: "none", background: t.white, color: t.text,
              fontFamily: t.font.body, fontSize: 14, fontWeight: 600, cursor: "pointer",
              transition: "all 0.25s ease",
            }}>
              Start Free Trial
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════
   FAQ — Simple accordion
   ═══════════════════════════════════════════════════ */
export function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const faqs = [
    { q: "Is it really free to start?", a: "Yes. You get 3 full mock interview sessions with AI feedback — no credit card required." },
    { q: "How realistic is the AI interviewer?", a: "The AI adapts to your answers, asks follow-ups, and probes deeper — mimicking how a real hiring manager interviews." },
    { q: "What types of interviews are supported?", a: "Behavioral, technical, system design, case study, culture fit, and final round interviews." },
    { q: "Can I use it for any company?", a: "Yes. Specify your target company and role, and the AI tailors questions to match that company's interview style." },
    { q: "What happens to my data?", a: "Your data is encrypted and you can delete it anytime from Settings. We never share your information." },
  ];

  return (
    <section style={{ padding: "160px 56px", maxWidth: 800, margin: "0 auto" }}>
      <style>{keyframes}</style>
      <Reveal>
        <h2 style={{ fontFamily: t.font.display, fontSize: 48, fontWeight: 400, letterSpacing: "-0.025em", color: t.text, textAlign: "center", margin: "0 0 64px" }}>
          Frequently asked questions
        </h2>
      </Reveal>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {faqs.map((faq, i) => {
          const isOpen = openIdx === i;
          return (
            <Reveal key={i} delay={i * 60}>
              <button
                onClick={() => setOpenIdx(isOpen ? null : i)}
                style={{
                  width: "100%", background: "transparent", border: "none",
                  borderTop: `1px solid ${t.border}`, padding: "24px 0", cursor: "pointer", textAlign: "left",
                  transition: "all 0.3s ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: t.font.body, fontSize: 16, fontWeight: 500, color: t.text }}>{faq.q}</span>
                  <span style={{
                    fontSize: 20, color: t.textMuted, transition: "transform 0.3s ease",
                    transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
                    flexShrink: 0, marginLeft: 16,
                  }}>
                    +
                  </span>
                </div>
                <div style={{
                  overflow: "hidden", maxHeight: isOpen ? 120 : 0, opacity: isOpen ? 1 : 0,
                  transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                }}>
                  <p style={{ fontFamily: t.font.body, fontSize: 14, lineHeight: 1.7, color: t.textSecondary, margin: "12px 0 0", paddingRight: 40 }}>
                    {faq.a}
                  </p>
                </div>
              </button>
            </Reveal>
          );
        })}
        <div style={{ borderTop: `1px solid ${t.border}` }} />
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════
   FINAL CTA — Big statement, inspired by delphi.ai
   ═══════════════════════════════════════════════════ */
export function FinalCTASection() {
  return (
    <section style={{
      padding: "160px 56px", maxWidth: 900, margin: "0 auto", textAlign: "center",
    }}>
      <style>{keyframes}</style>
      <Reveal>
        <h2 style={{
          fontFamily: t.font.display, fontSize: 64, fontWeight: 400, lineHeight: 1.08,
          letterSpacing: "-0.035em", color: t.text, margin: "0 0 28px",
        }}>
          Your next interview{" "}
          <span style={{ fontStyle: "italic", color: t.accent }}>starts here.</span>
        </h2>
      </Reveal>
      <Reveal delay={200}>
        <p style={{ fontFamily: t.font.body, fontSize: 18, lineHeight: 1.7, color: t.textSecondary, marginBottom: 48, maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
          Free to start. No credit card required.
          Practice with AI and walk into your interview prepared.
        </p>
      </Reveal>
      <Reveal delay={400}>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <MagneticButton primary>Get Started Free</MagneticButton>
        </div>
      </Reveal>
    </section>
  );
}

/* ═══════════════════════════════════════════════════
   FOOTER — Minimal like ankar.ai
   ═══════════════════════════════════════════════════ */
export function FooterSection() {
  return (
    <footer style={{
      padding: "48px 56px", borderTop: `1px solid ${t.border}`,
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <div style={{ fontFamily: t.font.display, fontSize: 20, color: t.text }}>HireStepX</div>
      <div style={{ display: "flex", gap: 32 }}>
        {["Privacy", "Terms", "Blog"].map((item) => (
          <span key={item} style={{
            fontFamily: t.font.body, fontSize: 13, color: t.textMuted,
            cursor: "pointer", transition: "color 0.2s ease",
          }}>
            {item}
          </span>
        ))}
      </div>
      <span style={{ fontFamily: t.font.body, fontSize: 12, color: t.textMuted }}>
        &copy; 2025 HireStepX
      </span>
    </footer>
  );
}

/* ═══════════════════════════════════════════════════
   FULL PAGE — All sections composed
   ═══════════════════════════════════════════════════ */
export function FullLandingPage() {
  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100vh", overflow: "hidden" }}>
      <style>{keyframes}</style>
      <NavBar />
      <HeroSection />
      <LogoMarquee />
      <StatsSection />
      <ProblemSection />
      <HowItWorksSection />
      <FeaturesSection />
      <TestimonialsSection />
      <PricingSection />
      <FAQSection />
      <FinalCTASection />
      <FooterSection />
    </div>
  );
}
