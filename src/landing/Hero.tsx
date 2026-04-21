import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { c, font } from "../tokens";
import { useAuth } from "../AuthContext";
import { useParallax, useMouse } from "../hooks";

/* ═══════════════════════════════════════════════
   PARTICLE CANVAS
   ═══════════════════════════════════════════════ */
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);

  // Defer canvas init until after first paint to avoid blocking FCP
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const dpr = window.devicePixelRatio || 1;
    let cachedW = window.innerWidth;
    let cachedH = window.innerHeight;
    const resize = () => {
      cachedW = window.innerWidth;
      cachedH = window.innerHeight;
      canvas.width = cachedW * dpr;
      canvas.height = cachedH * dpr;
      canvas.style.width = cachedW + "px";
      canvas.style.height = cachedH + "px";
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const isMobileDevice = cachedW < 768;
    const COUNT = isMobileDevice ? 30 : 60;
    interface P { x: number; y: number; vx: number; vy: number; r: number; o: number; od: number; c: string; }
    const ps: P[] = [];
    const w = () => cachedW;
    const h = () => cachedH;
    const cols = ["rgba(212,179,127,", "rgba(245,242,237,", "rgba(197,192,186,"];

    for (let i = 0; i < COUNT; i++) {
      ps.push({ x: Math.random() * w(), y: Math.random() * h(), vx: (Math.random() - 0.5) * 0.25, vy: -Math.random() * 0.35 - 0.08, r: Math.random() * 2.2 + 0.4, o: Math.random() * 0.45 + 0.08, od: (Math.random() - 0.5) * 0.004, c: cols[Math.floor(Math.random() * cols.length)] });
    }

    const draw = () => {
      ctx.clearRect(0, 0, w(), h());
      const g = ctx.createRadialGradient(w() / 2, h() * 0.3, 0, w() / 2, h() * 0.3, w() * 0.45);
      g.addColorStop(0, "rgba(212,179,127,0.035)");
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w(), h());

      for (const p of ps) {
        p.x += p.vx; p.y += p.vy; p.o += p.od;
        if (p.o > 0.55 || p.o < 0.04) p.od *= -1;
        if (p.y < -10) { p.y = h() + 10; p.x = Math.random() * w(); }
        if (p.x < -10) p.x = w() + 10;
        if (p.x > w() + 10) p.x = -10;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `${p.c}${p.o})`; ctx.fill();
      }

      // Connection lines — skip on mobile for performance
      if (!isMobileDevice) {
        for (let i = 0; i < ps.length; i++) {
          for (let j = i + 1; j < ps.length; j++) {
            const dx = ps[i].x - ps[j].x, dy = ps[i].y - ps[j].y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 100) {
              ctx.beginPath(); ctx.moveTo(ps[i].x, ps[i].y); ctx.lineTo(ps[j].x, ps[j].y);
              ctx.strokeStyle = `rgba(212,179,127,${0.025 * (1 - d / 100)})`; ctx.lineWidth = 0.5; ctx.stroke();
            }
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!mq.matches) {
      draw();
    } else {
      // Draw a single static frame without starting the animation loop
      ctx.clearRect(0, 0, w(), h());
      for (const p of ps) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `${p.c}${p.o})`; ctx.fill();
      }
    }
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, [ready]);

  return <canvas ref={canvasRef} aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}

/* ═══════════════════════════════════════════════
   STICKY CTA BAR
   ═══════════════════════════════════════════════ */
export function StickyCTA() {
  const { isLoggedIn } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.85);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (isLoggedIn) return null;

  return (
    <div className="sticky-cta-bar" style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 90,
      transform: visible ? "translateY(0)" : "translateY(100%)",
      opacity: visible ? 1 : 0,
      transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      pointerEvents: visible ? "auto" : "none",
    }}>
      <div style={{
        maxWidth: 800, margin: "0 auto", padding: "12px 24px",
        background: "rgba(6,6,7,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderTop: `1px solid ${c.border}`, borderRadius: "16px 16px 0 0",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, color: c.ivory }}>
            3 free AI mock interviews
          </span>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>
            No credit card required
          </span>
        </div>
        <Link href="/signup" className="shimmer-btn premium-btn" style={{
          fontFamily: font.ui, fontSize: 13, fontWeight: 600, padding: "10px 24px",
          borderRadius: 8, cursor: "pointer", letterSpacing: "0.02em", textDecoration: "none",
          flexShrink: 0,
        }}
          onClick={() => { track("cta_click", { cta: "sticky_bar_signup" }); }}>
          Start Free
        </Link>
      </div>
    </div>
  );
}

/* ─── Auth-aware CTA ─── */
export function HeroCTA() {
  const { isLoggedIn } = useAuth();
  return (
    <div className="hero-cta" style={{ display: "flex", gap: 16, animation: "fadeInUp 0.8s ease 2.2s both", marginBottom: 40 }}>
      <Link href={isLoggedIn ? "/dashboard" : "/signup"} className="shimmer-btn premium-btn" style={{
        fontFamily: font.ui, fontSize: 15, fontWeight: 600, padding: "16px 36px",
        borderRadius: 12, cursor: "pointer", letterSpacing: "0.02em", textDecoration: "none",
        display: "inline-flex", alignItems: "center", gap: 8,
      }}
        onClick={() => { track("cta_click", { cta: isLoggedIn ? "hero_go_to_dashboard" : "hero_get_started" }); }}>
        {isLoggedIn ? "Go to Dashboard" : "Get Started Free"}
      </Link>
      <button onClick={() => { document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" }); }}
        style={{
        fontFamily: font.ui, fontSize: 15, fontWeight: 500, padding: "16px 36px",
        borderRadius: 12, border: `1px solid rgba(255,255,255,0.10)`, background: "rgba(255,255,255,0.03)",
        color: c.chalk, cursor: "pointer", transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        backdropFilter: "blur(12px)",
      }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; e.currentTarget.style.color = c.ivory; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; e.currentTarget.style.color = c.chalk; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}>
        See How It Works
      </button>
    </div>
  );
}

export function BottomCTA() {
  const { isLoggedIn } = useAuth();
  return (
    <Link href={isLoggedIn ? "/dashboard" : "/signup"} className="shimmer-btn premium-btn" style={{
      fontFamily: font.ui, fontSize: 16, fontWeight: 600, padding: "18px 44px",
      borderRadius: 14, cursor: "pointer", letterSpacing: "0.02em", textDecoration: "none",
      display: "inline-flex", alignItems: "center",
    }}
      onClick={() => { track("cta_click", { cta: isLoggedIn ? "final_go_to_dashboard" : "final_get_started" }); }}>
      {isLoggedIn ? "Go to Dashboard" : "Get Started Free"}
    </Link>
  );
}

/* ═══════════════════════════════════════════════
   HERO MOCKUP
   ═══════════════════════════════════════════════ */
function HeroMockup() {
  return (
    <div className="hero-mockup" style={{ flex: 1, position: "relative", zIndex: 1 }}>
      <div className="gradient-border-card" style={{
        position: "relative", overflow: "hidden", padding: "32px 28px", zIndex: 0,
        animation: "fadeInUp 1s ease 1.5s both",
        maxWidth: 460,
      }}>
        <div style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, marginBottom: 20 }}>Live Session</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: c.sage, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.sage, display: "inline-block", animation: "giltPulse 1.5s ease-in-out infinite" }} />
            Recording
          </span>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: c.stone }}>Q2 of 5</span>
        </div>
        <div style={{ background: "rgba(212,179,127,0.05)", border: `1px solid rgba(212,179,127,0.1)`, borderRadius: "12px 12px 12px 2px", padding: "14px 16px", marginBottom: 12 }}>
          <p style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.gilt, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>Interviewer</p>
          <p style={{ fontFamily: font.ui, fontSize: 13, lineHeight: 1.6, color: c.ivory }}>
            Tell me about a time you had to learn a new technology quickly to complete a project.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.ember, animation: "giltPulse 1.5s ease-in-out infinite" }} />
          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 2, height: 28 }}>
            {Array.from({ length: 32 }).map((_, i) => (
              <div key={i} style={{ flex: 1, height: `${Math.random() * 80 + 20}%`, background: `linear-gradient(180deg, ${c.gilt} 0%, ${c.ember} 100%)`, borderRadius: 1, opacity: 0.5 }} />
            ))}
          </div>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: c.stone }}>1:42</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "Structure", value: 87, color: c.gilt },
            { label: "Clarity", value: 74, color: c.sage },
            { label: "Depth", value: 91, color: c.ember },
          ].map((m) => (
            <div key={m.label} style={{ flex: 1, padding: "10px 12px", background: c.obsidian, borderRadius: 8, border: `1px solid ${c.border}` }}>
              <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>{m.label}</span>
              <span style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 600, color: m.color }}>{m.value}</span>
            </div>
          ))}
        </div>
        {/* Coaching tip */}
        <div style={{
          marginTop: 14, padding: "10px 14px", background: "rgba(212,179,127,0.04)",
          borderRadius: 8, border: `1px solid rgba(212,179,127,0.08)`,
          display: "flex", alignItems: "flex-start", gap: 8,
        }}>
          <span style={{ fontSize: 14, marginTop: 1 }}>&#128161;</span>
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, lineHeight: 1.5, fontStyle: "italic" }}>
            Add a specific metric — mention the timeline saved or error rate reduced.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   HERO
   ═══════════════════════════════════════════════ */
export function Hero() {
  const parallaxOffset = useParallax(0.1);
  const mouse = useMouse();
  const [wordsVisible, setWordsVisible] = useState<number[]>([]);
  const heroWords = ["Nail", "your", "next", "interview.", "Every", "single", "time."];

  useEffect(() => {
    heroWords.forEach((_, i) => {
      setTimeout(() => setWordsVisible((prev) => [...prev, i]), 400 + i * 180);
    });
  }, []);

  const mx = (mouse.x / window.innerWidth - 0.5) * 30;
  const my = (mouse.y / window.innerHeight - 0.5) * 30;

  return (
    <section className="dot-grid-bg" style={{
      position: "relative", minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", overflow: "hidden",
    }}>
      <ParticleCanvas />
      <div className="landing-hero" style={{ display: "flex", alignItems: "center", maxWidth: 1200, width: "100%", padding: "140px 48px 100px", position: "relative" }}>

      {/* Mesh gradient */}
      <div className="hero-mesh-gradient" style={{
        position: "absolute", top: "40%", left: "50%",
        transform: `translate(calc(-50% + ${mx}px), calc(-50% + ${my}px))`,
        width: 900, height: 900, borderRadius: "50%",
        background: `conic-gradient(from 180deg, rgba(212,179,127,0.06), rgba(122,158,126,0.03), rgba(196,112,90,0.02), rgba(212,179,127,0.06))`,
        filter: "blur(80px)", pointerEvents: "none",
        animation: "meshRotate 30s linear infinite",
      }} />

      {/* Geometric circles (parallax) */}
      {[600, 400, 220].map((size, i) => (
        <div key={size} style={{
          position: "absolute", top: "50%", left: "60%",
          transform: `translate(-50%, -50%) translateY(${parallaxOffset * (0.5 - i * 0.15)}px)`,
          width: size, height: size, border: `1px solid rgba(245,242,237,${0.04 - i * 0.01})`,
          borderRadius: "50%", pointerEvents: "none",
        }} />
      ))}

      {/* Split: Left text */}
      <div style={{ flex: 1, position: "relative", zIndex: 1, paddingRight: 40 }}>
        {/* Social proof badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 16px",
          background: "rgba(212,179,127,0.06)", border: `1px solid rgba(212,179,127,0.15)`,
          borderRadius: 100, marginBottom: 28, animation: "fadeIn 0.8s ease 0.2s both",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.sage, display: "inline-block", animation: "giltPulse 2s ease-in-out infinite" }} />
          <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, letterSpacing: "0.02em" }}>
            3 free sessions, no credit card required
          </span>
        </div>

        <h1 className="text-glow" style={{
          fontFamily: font.display, fontSize: "clamp(40px, 5.5vw, 68px)", fontWeight: 400,
          lineHeight: 1.08, letterSpacing: "-0.03em", color: c.ivory,
          maxWidth: 560, margin: "0 0 24px",
        }}>
          {heroWords.map((word, i) => (
            <span key={i} style={{
              display: "inline-block", marginRight: "0.25em",
              opacity: wordsVisible.includes(i) ? 1 : 0,
              transform: wordsVisible.includes(i) ? "translateY(0)" : "translateY(24px)",
              filter: wordsVisible.includes(i) ? "blur(0)" : "blur(6px)",
              transition: "all 0.7s cubic-bezier(0.16, 1, 0.3, 1)",
              color: word === "interview." ? c.gilt : "inherit",
            }}>
              {word}
            </span>
          ))}
        </h1>

        <p style={{
          fontFamily: font.ui, fontSize: "clamp(16px, 1.8vw, 19px)", fontWeight: 400,
          lineHeight: 1.7, color: c.chalk, maxWidth: 460,
          animation: "fadeInUp 0.8s ease 1.8s both",
        }}>
          Upload your resume. Pick your target company — Google, TCS, Flipkart, or 50+ others.
          Get a voice-based mock interview with AI that scores your answers and tells you exactly
          what to fix. Starting at ₹0.
        </p>

        <HeroCTA />

        {/* Social proof micro-stat */}
        <div className="hero-stats" style={{ display: "flex", gap: 32, animation: "fadeIn 0.8s ease 2.6s both" }}>
          {[
            { value: "10", label: "Interview types" },
            { value: "50+", label: "Target companies" },
            { value: "₹10", label: "Per session" },
          ].map((stat) => (
            <div key={stat.label}>
              <span style={{ fontFamily: font.mono, fontSize: 20, fontWeight: 600, color: c.gilt, display: "block" }}>{stat.value}</span>
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, letterSpacing: "0.02em" }}>{stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Hero mockup card */}
      <HeroMockup />
      </div>
    </section>
  );
}
