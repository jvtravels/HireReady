import React, { useState, useRef, useEffect, useCallback } from "react";
import { c, font } from "../tokens";
import { useReveal, useCountUp } from "../hooks";
import { companyLogos, testimonials } from "../landingData";

/* ═══════════════════════════════════════════════
   LOGO MARQUEE
   ═══════════════════════════════════════════════ */
export function LogoMarquee() {
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} className="reveal landing-section" style={{ padding: "60px 40px", borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}` }}>
      <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: c.stone, textAlign: "center", marginBottom: 36 }}>
        Our users have landed roles at
      </p>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 44, flexWrap: "wrap", maxWidth: 1000, margin: "0 auto" }}>
        {companyLogos.map((logo) => (
          <div
            key={logo.name}
            style={{
              color: c.stone,
              opacity: 0.4,
              transition: "all 0.4s ease",
              cursor: "default",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = c.ivory; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.4"; e.currentTarget.style.color = c.stone; }}
          >
            {logo.svg}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   STATS
   ═══════════════════════════════════════════════ */
export function StatsSection() {
  const sectionRef = useReveal<HTMLElement>();
  const stat1 = useCountUp(6, 1200);
  const stat2 = useCountUp(50, 1500);
  const stat3 = useCountUp(3, 800);
  const stat4 = useCountUp(0, 1200);

  const stats = [
    { ref: stat1.ref, value: `${stat1.value}`, label: "Interview Types", icon: (
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    )},
    { ref: stat2.ref, value: `${stat2.value}+`, label: "Target Companies", icon: (
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
    )},
    { ref: stat3.ref, value: `${stat3.value}`, label: "Free Sessions to Start", icon: (
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
    )},
    { ref: stat4.ref, value: `₹${stat4.value}`, label: "To Get Started", icon: (
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    )},
  ];

  return (
    <section ref={sectionRef} className="reveal landing-section" style={{ padding: "80px 40px", maxWidth: 1100, margin: "0 auto" }}>
      <div className="landing-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
        {stats.map((s, i) => (
          <div
            key={i}
            ref={s.ref}
            className="gradient-border-card"
            style={{ padding: "32px 24px", textAlign: "center", cursor: "default", zIndex: 0 }}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>{s.icon}</div>
            <span style={{
              fontFamily: font.mono, fontSize: 36, fontWeight: 600, color: c.ivory,
              letterSpacing: "-0.02em", display: "block", marginBottom: 8,
            }}>{s.value}</span>
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, letterSpacing: "0.04em" }}>{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   PROBLEM SECTION
   ═══════════════════════════════════════════════ */
export function ProblemSection() {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} className="reveal landing-section" style={{ padding: "140px 40px", maxWidth: 1100, margin: "0 auto" }}>
      <div className="landing-problem-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
        {/* Image side */}
        <div style={{ position: "relative" }}>
          <div style={{
            borderRadius: 16, overflow: "hidden", position: "relative",
            aspectRatio: "4 / 5",
          }}>
            <img
              src="https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=600&h=750&fit=crop&crop=face&q=75"
              alt="Professional preparing for interview"
              loading="lazy" width={600} height={750}
              style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.85)" }}
            />
            {/* Dark overlay gradient */}
            <div style={{
              position: "absolute", inset: 0,
              background: `linear-gradient(180deg, transparent 40%, ${c.obsidian}CC 100%)`,
            }} />
          </div>
          {/* Floating quote card on the image */}
          <div style={{
            position: "absolute", bottom: 24, left: 24, right: 24,
            background: "rgba(17,17,19,0.85)", backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderRadius: 12, padding: "16px 20px",
            border: `1px solid ${c.border}`,
          }}>
            <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.6, fontStyle: "italic" }}>
              "I knew the technical stuff but kept freezing in behavioral rounds. After 10 practice sessions, I finally felt ready."
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
              <img
                src="https://images.unsplash.com/photo-1560250097-0b93528c311a?w=64&h=64&fit=crop&crop=face&q=75"
                alt=""
                loading="lazy" width={28} height={28}
                style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }}
              />
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Software Engineer, Career Changer</span>
            </div>
          </div>
        </div>

        {/* Text side */}
        <div>
          <p style={{ fontFamily: font.display, fontSize: "clamp(28px, 4vw, 46px)", fontWeight: 400, lineHeight: 1.25, letterSpacing: "-0.02em", color: c.ivory, marginBottom: 24 }}>
            You know your stuff. But interviews are{" "}
            <span style={{ color: c.gilt }}>a different skill.</span>
          </p>
          <p style={{ fontFamily: font.ui, fontSize: 17, fontWeight: 400, lineHeight: 1.7, color: c.stone, marginBottom: 32 }}>
            Reading interview tips online doesn't prepare you for the real thing.
            Generic question banks don't match your experience. And practicing alone
            means you never know what you're getting wrong — until it's too late.
          </p>
          <div style={{ width: 80, height: 1, background: `linear-gradient(90deg, transparent, ${c.gilt}, transparent)`, opacity: 0.5 }} />
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   DEMO VIDEO
   ═══════════════════════════════════════════════ */
export function DemoVideoSection() {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} className="reveal landing-section" style={{ padding: "140px 40px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 16 }}>See It In Action</p>
        <h2 className="text-glow" style={{ fontFamily: font.display, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 400, letterSpacing: "-0.02em", color: c.ivory, lineHeight: 1.15, marginBottom: 12 }}>
          Watch a session in 90 seconds
        </h2>
        <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.6 }}>From resume upload to scored feedback — see how it works.</p>
      </div>

      <div className="video-player" style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 16, overflow: "hidden", cursor: "pointer", border: `1px solid ${c.border}`, background: c.graphite, transition: "border-color 0.3s ease, box-shadow 0.3s ease" }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.borderHover; e.currentTarget.style.boxShadow = "0 32px 80px rgba(0,0,0,0.5), 0 0 80px rgba(212,179,127,0.04)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.boxShadow = "none"; }}>
        {/* Video preview */}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${c.obsidian} 0%, ${c.graphite} 50%, ${c.obsidian} 100%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", top: "20%", left: "10%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,179,127,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: "15%", right: "15%", width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(122,158,126,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 40, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.25 }}>
            <div style={{ width: "70%", maxWidth: 500, background: c.graphite, borderRadius: 10, border: `1px solid ${c.border}`, padding: 24, textAlign: "left" }}>
              <div style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, marginBottom: 12 }}>Live Session</div>
              <div style={{ background: "rgba(212,179,127,0.06)", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
                <p style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt, marginBottom: 4 }}>Interviewer</p>
                <p style={{ fontFamily: font.ui, fontSize: 12, color: c.ivory, lineHeight: 1.5 }}>Walk me through a project you're proud of...</p>
              </div>
              <div style={{ display: "flex", gap: 2, height: 20 }}>
                {Array.from({ length: 30 }).map((_, i) => (
                  <div key={i} style={{ flex: 1, height: `${Math.random() * 80 + 20}%`, background: c.gilt, borderRadius: 1, opacity: 0.4, alignSelf: "flex-end" }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Play button */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(6,6,7,0.2)", zIndex: 2 }}>
          <div className="video-play-btn" style={{
            width: 80, height: 80, borderRadius: "50%", background: "rgba(245,242,237,0.08)",
            backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(245,242,237,0.15)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill={c.ivory} style={{ marginLeft: 3 }}><polygon points="5,3 19,12 5,21" /></svg>
          </div>
        </div>

        <div style={{ position: "absolute", bottom: 16, right: 16, fontFamily: font.mono, fontSize: 11, color: c.ivory, background: "rgba(6,6,7,0.7)", backdropFilter: "blur(8px)", padding: "4px 10px", borderRadius: 4, zIndex: 3 }}>1:32</div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   SCORE PREVIEW
   ═══════════════════════════════════════════════ */
export function ScorePreview() {
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const revealRef = useReveal<HTMLElement>();
  const setRefs = useCallback((node: HTMLElement | null) => {
    (revealRef as React.MutableRefObject<HTMLElement | null>).current = node;
    sectionRef.current = node;
  }, [revealRef]);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scores = [
    { label: "Communication", value: 87, color: c.gilt },
    { label: "Problem Solving", value: 92, color: c.sage },
    { label: "Structure & Clarity", value: 78, color: c.ember },
  ];

  return (
    <section ref={setRefs} className="reveal landing-section" style={{ padding: "140px 40px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 64 }}>
        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 16 }}>Precision Feedback</p>
        <h2 className="text-glow" style={{ fontFamily: font.display, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 400, letterSpacing: "-0.02em", color: c.ivory, lineHeight: 1.15, marginBottom: 16 }}>Scores that mean something</h2>
        <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.6, maxWidth: 500, margin: "0 auto" }}>
          Every session produces specific, actionable feedback across the dimensions that matter for your target role.
        </p>
      </div>

      <div className="gradient-border-card" style={{ padding: "40px 48px", display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <span style={{ fontFamily: font.mono, fontSize: 64, fontWeight: 600, color: c.ivory, letterSpacing: "-0.02em", lineHeight: 1, display: "inline-block", animation: visible ? "countUp 0.8s ease-out both" : "none" }}>{visible ? "86" : ""}</span>
          <p style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.stone, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 8 }}>Overall Session Score</p>
        </div>
        <div style={{ height: 1, background: c.border }} />
        {scores.map((s, i) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.chalk, width: 160, flexShrink: 0 }}>{s.label}</span>
            <div className="score-bar" style={{ flex: 1, height: 4, background: c.border, borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: visible ? `${s.value}%` : "0%", background: s.color, borderRadius: 2, transition: `width 1.2s cubic-bezier(0.16, 1, 0.3, 1) ${0.3 + i * 0.15}s` }} />
            </div>
            <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 600, color: c.ivory, width: 32, textAlign: "right", opacity: visible ? 1 : 0, transition: `opacity 0.5s ease ${0.6 + i * 0.15}s` }}>{s.value}</span>
          </div>
        ))}
        <div style={{ marginTop: 8, padding: "16px 20px", background: c.obsidian, borderRadius: 8, border: `1px solid ${c.border}` }}>
          <p style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.chalk, lineHeight: 1.6, fontStyle: "italic" }}>
            "Your answer about the migration project was well-structured but lacked a clear outcome. Lead with the result — '40% faster deploys' — then tell the story."
          </p>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   TESTIMONIALS
   ═══════════════════════════════════════════════ */
export function TestimonialsSection() {
  const ref = useReveal<HTMLElement>();
  const [active, setActive] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setActive((prev) => (prev + 1) % testimonials.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [isPaused]);

  return (
    <section ref={ref} className="reveal landing-section" style={{ padding: "140px 40px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 64 }}>
        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 16 }}>Real Results</p>
        <h2 className="text-glow" style={{ fontFamily: font.display, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 400, letterSpacing: "-0.02em", color: c.ivory, lineHeight: 1.15 }}>People who practiced here got hired</h2>
      </div>

      <div
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {/* Split layout: photo left, quote right */}
        <div className="gradient-border-card" style={{
          display: "grid", gridTemplateColumns: "280px 1fr", overflow: "hidden",
          position: "relative", zIndex: 0, minHeight: 360,
        }}>
          {/* Photo column */}
          <div style={{ position: "relative", overflow: "hidden" }}>
            {testimonials.map((t, i) => (
              <img key={t.name} src={t.image} alt={t.name} loading="lazy" width={400} height={500} style={{
                position: i === 0 ? "relative" : "absolute",
                inset: 0, width: "100%", height: "100%", objectFit: "cover",
                opacity: active === i ? 1 : 0,
                transform: active === i ? "scale(1)" : "scale(1.08)",
                transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
                filter: "brightness(0.8)",
              }} />
            ))}
            {/* Gradient overlay on photo */}
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, transparent 60%, ${c.graphite} 100%)`, pointerEvents: "none" }} />
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent 50%, ${c.graphite}CC 100%)`, pointerEvents: "none" }} />
          </div>

          {/* Quote column */}
          <div style={{ position: "relative", padding: "48px 48px 48px 40px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {testimonials.map((t, i) => (
              <div key={t.name} style={{
                position: i === 0 ? "relative" : "absolute",
                top: i === 0 ? undefined : 0, left: i === 0 ? undefined : 0, right: i === 0 ? undefined : 0, bottom: i === 0 ? undefined : 0,
                padding: i === 0 ? 0 : "48px 48px 48px 40px",
                opacity: active === i ? 1 : 0,
                transform: active === i ? "translateY(0)" : "translateY(16px)",
                transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                pointerEvents: active === i ? "auto" : "none",
                display: "flex", flexDirection: "column", justifyContent: "center",
              }}>
                <figure style={{ margin: 0 }}>
                  <span style={{ fontFamily: font.display, fontSize: 72, color: c.gilt, opacity: 0.15, lineHeight: 1, display: "block", marginBottom: 4 }}>&ldquo;</span>
                  <blockquote style={{ margin: 0 }}>
                    <p style={{ fontFamily: font.display, fontSize: "clamp(20px, 2.5vw, 26px)", lineHeight: 1.55, color: c.ivory, fontStyle: "italic", marginBottom: 28, fontWeight: 400 }}>{t.quote}</p>
                  </blockquote>
                  <figcaption>
                    <div style={{ marginBottom: 20 }}>
                      <p style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, marginBottom: 2 }}>{t.name}</p>
                      <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>{t.role}</p>
                    </div>
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "6px 12px", background: `${c.sage}10`, border: `1px solid ${c.sage}20`,
                      borderRadius: 100, alignSelf: "flex-start",
                    }}>
                      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                      <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.sage }}>{t.result}</span>
                    </div>
                  </figcaption>
                </figure>
              </div>
            ))}
          </div>
        </div>

        {/* Photo thumbnails as navigation */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 32 }}>
          {testimonials.map((t, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              style={{
                width: active === i ? 56 : 44, height: active === i ? 56 : 44,
                borderRadius: "50%", overflow: "hidden", cursor: "pointer",
                border: active === i ? `2px solid ${c.gilt}` : `2px solid transparent`,
                opacity: active === i ? 1 : 0.4,
                transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                padding: 0, background: "none",
                boxShadow: active === i ? `0 0 20px ${c.gilt}20` : "none",
              }}
            >
              <img src={t.image} alt={t.name} loading="lazy" width={64} height={64} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
