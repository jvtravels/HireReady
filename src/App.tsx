import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { track } from "@vercel/analytics";
import { capture } from "./analytics";
import { font } from "./tokens";
import { useTheme } from "./ThemeContext";
import { useAuth, hasStoredSession, getLastRoute } from "./AuthContext";
import { useSEO, webAppJsonLd, faqJsonLd } from "./useSEO";
import { getSupabase, supabaseConfigured } from "./supabase";

/* ─── Hooks ─── */
function useReveal<T extends HTMLElement>(): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("visible"); observer.unobserve(el); } },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function useParallax(speed = 0.15) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) { requestAnimationFrame(() => { setOffset(window.scrollY * speed); ticking = false; }); ticking = true; }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [speed]);
  return offset;
}

function useMouse() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    let ticking = false;
    const handler = (e: MouseEvent) => {
      if (!ticking) {
        requestAnimationFrame(() => { setPos({ x: e.clientX, y: e.clientY }); ticking = false; });
        ticking = true;
      }
    };
    window.addEventListener("mousemove", handler, { passive: true });
    return () => window.removeEventListener("mousemove", handler);
  }, []);
  return pos;
}

/* ═══════════════════════════════════════════════
   PARTICLE CANVAS
   ═══════════════════════════════════════════════ */
function ParticleCanvas({ isDark }: { isDark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
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
    const cols = isDark
      ? ["rgba(212,179,127,", "rgba(245,242,237,", "rgba(197,192,186,"]
      : ["rgba(184,146,62,", "rgba(26,26,26,", "rgba(142,137,131,"];

    for (let i = 0; i < COUNT; i++) {
      ps.push({ x: Math.random() * w(), y: Math.random() * h(), vx: (Math.random() - 0.5) * 0.25, vy: -Math.random() * 0.35 - 0.08, r: Math.random() * 2.2 + 0.4, o: Math.random() * 0.45 + 0.08, od: (Math.random() - 0.5) * 0.004, c: cols[Math.floor(Math.random() * cols.length)] });
    }

    const draw = () => {
      ctx.clearRect(0, 0, w(), h());
      const g = ctx.createRadialGradient(w() / 2, h() * 0.3, 0, w() / 2, h() * 0.3, w() * 0.45);
      g.addColorStop(0, isDark ? "rgba(212,179,127,0.035)" : "rgba(184,146,62,0.025)");
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
              ctx.strokeStyle = isDark ? `rgba(212,179,127,${0.025 * (1 - d / 100)})` : `rgba(184,146,62,${0.02 * (1 - d / 100)})`; ctx.lineWidth = 0.5; ctx.stroke();
            }
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!mq.matches) draw(); else { draw(); cancelAnimationFrame(animId!); }
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}

/* ═══════════════════════════════════════════════
   NAV
   ═══════════════════════════════════════════════ */
function Nav() {
  const { c, isDark, toggleTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const { isLoggedIn, logout } = useAuth();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen && mobileMenuRef.current) {
      mobileMenuRef.current.focus();
    }
  }, [mobileOpen]);

  return (
    <header>
    <a href="#main-content" className="skip-to-content">Skip to main content</a>
    <nav aria-label="Main navigation" style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "0 48px", height: 72,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: scrolled ? (isDark ? "rgba(6,6,7,0.72)" : "rgba(250,250,248,0.85)") : "transparent",
      backdropFilter: scrolled ? "blur(32px) saturate(180%)" : "none",
      WebkitBackdropFilter: scrolled ? "blur(32px) saturate(180%)" : "none",
      borderBottom: scrolled ? `1px solid ${c.border}` : "1px solid transparent",
      transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
      animation: "navSlideDown 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
    }}>
      <style>{`@keyframes navSlideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{ fontFamily: font.display, fontSize: 22, fontWeight: 400, letterSpacing: "0.02em", color: c.ivory, cursor: "pointer" }}>
        HireStepX
      </div>

      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={mobileOpen}
        style={{
          display: "none", background: "none", border: "none", cursor: "pointer", padding: 8,
          color: c.ivory, position: "relative", zIndex: 102,
        }}
        className="mobile-nav-toggle"
      >
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {mobileOpen ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></> : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>}
        </svg>
      </button>

      {/* Desktop nav */}
      <div className="desktop-nav" style={{ display: "flex", alignItems: "center", gap: 32 }}>
        {["How It Works", "Features", "Pricing"].map((item) => (
          <a key={item} href={`#${item.toLowerCase().replace(/ /g, "-")}`}
            className="hover-underline"
            onClick={(e) => { e.preventDefault(); document.getElementById(item.toLowerCase().replace(/ /g, "-"))?.scrollIntoView({ behavior: "smooth" }); }}
            style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 400, color: c.stone, textDecoration: "none", transition: "color 0.2s ease" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = c.ivory)}
            onMouseLeave={(e) => (e.currentTarget.style.color = c.stone)}>
            {item}
          </a>
        ))}
        <button onClick={toggleTheme} aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          style={{ background: "none", border: `1px solid ${c.border}`, borderRadius: 8, padding: 7, cursor: "pointer", color: c.stone, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s, border-color 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.color = c.ivory; e.currentTarget.style.borderColor = c.borderHover; }}
          onMouseLeave={e => { e.currentTarget.style.color = c.stone; e.currentTarget.style.borderColor = c.border; }}
        >
          {isDark ? (
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          ) : (
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          )}
        </button>
        {isLoggedIn ? (
          <>
            <Link to="/dashboard" className="premium-btn" style={{
              fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.obsidian,
              borderRadius: 10, padding: "9px 22px",
              cursor: "pointer", letterSpacing: "0.02em", textDecoration: "none",
            }}>
              Dashboard
            </Link>
            <button onClick={logout} style={{
              fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.stone,
              background: "transparent", border: "none", padding: "8px 16px",
              cursor: "pointer", transition: "color 0.2s ease",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.color = c.ivory; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; }}>
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" style={{
              fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.chalk,
              background: "transparent", border: "none", padding: "8px 16px",
              cursor: "pointer", letterSpacing: "0.01em", transition: "color 0.2s ease",
              textDecoration: "none",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.color = c.ivory; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = c.chalk; }}>
              Log in
            </Link>
            <Link to="/signup" className="shimmer-btn premium-btn" style={{
              fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.obsidian,
              borderRadius: 10, padding: "9px 22px",
              cursor: "pointer", letterSpacing: "0.02em", textDecoration: "none",
            }}>
              Sign up
            </Link>
          </>
        )}
      </div>

      {/* Mobile overlay nav */}
      {mobileOpen && (
        <div
          ref={mobileMenuRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setMobileOpen(false); return; }
            if (e.key === "Tab") {
              const focusable = e.currentTarget.querySelectorAll<HTMLElement>("a, button, [tabindex]:not([tabindex='-1'])");
              if (focusable.length === 0) return;
              const first = focusable[0], last = focusable[focusable.length - 1];
              if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
              else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
            }
          }}
          style={{
          position: "fixed", inset: 0, background: isDark ? "rgba(6,6,7,0.95)" : "rgba(250,250,248,0.97)", backdropFilter: "blur(20px)",
          zIndex: 101, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28,
          outline: "none",
        }} onClick={() => setMobileOpen(false)}>
          {["How It Works", "Features", "Pricing"].map((item) => (
            <a key={item} href={`#${item.toLowerCase().replace(/ /g, "-")}`}
              onClick={(e) => { e.preventDefault(); setMobileOpen(false); document.getElementById(item.toLowerCase().replace(/ /g, "-"))?.scrollIntoView({ behavior: "smooth" }); }}
              style={{ fontFamily: font.ui, fontSize: 18, color: c.ivory, textDecoration: "none" }}>
              {item}
            </a>
          ))}
          <button onClick={(e) => { e.stopPropagation(); toggleTheme(); }} aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            style={{ background: "none", border: `1px solid ${c.border}`, borderRadius: 10, padding: "8px 20px", cursor: "pointer", color: c.stone, fontFamily: font.ui, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
            {isDark ? (
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
            {isDark ? "Light mode" : "Dark mode"}
          </button>
          <div style={{ width: 40, height: 1, background: c.border, margin: "4px 0" }} />
          {isLoggedIn ? (
            <>
              <Link to="/dashboard" style={{ fontFamily: font.ui, fontSize: 18, fontWeight: 600, color: c.gilt, textDecoration: "none" }}>Dashboard</Link>
              <button onClick={() => { logout(); setMobileOpen(false); }} style={{ fontFamily: font.ui, fontSize: 16, color: c.stone, background: "none", border: "none", cursor: "pointer" }}>Log out</button>
            </>
          ) : (
            <>
              <Link to="/login" style={{ fontFamily: font.ui, fontSize: 18, color: c.ivory, textDecoration: "none" }}>Log in</Link>
              <Link to="/signup" style={{ fontFamily: font.ui, fontSize: 18, fontWeight: 600, color: c.gilt, textDecoration: "none" }}>Sign up</Link>
            </>
          )}
        </div>
      )}
    </nav>
    </header>
  );
}

/* ─── Auth-aware CTA ─── */
function HeroCTA() {
  const { c, isDark } = useTheme();
  const { isLoggedIn } = useAuth();
  return (
    <div className="hero-cta" style={{ display: "flex", gap: 16, animation: "fadeInUp 0.8s ease 2.2s both", marginBottom: 40 }}>
      <Link to={isLoggedIn ? "/dashboard" : "/signup"} className="shimmer-btn premium-btn" style={{
        fontFamily: font.ui, fontSize: 15, fontWeight: 600, padding: "16px 36px",
        borderRadius: 12, cursor: "pointer", letterSpacing: "0.02em", textDecoration: "none",
        display: "inline-flex", alignItems: "center", gap: 8,
      }}
        onClick={() => { track("cta_click", { cta: isLoggedIn ? "hero_go_to_dashboard" : "hero_get_started" }); capture("cta_click", { cta: isLoggedIn ? "hero_go_to_dashboard" : "hero_get_started" }); }}>
        {isLoggedIn ? "Go to Dashboard" : "Get Started Free"}
      </Link>
      <button onClick={() => { document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" }); }}
        style={{
        fontFamily: font.ui, fontSize: 15, fontWeight: 500, padding: "16px 36px",
        borderRadius: 12, border: `1px solid ${c.border}`, background: "transparent",
        color: c.chalk, cursor: "pointer", transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        backdropFilter: "blur(12px)",
      }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.borderHover; e.currentTarget.style.color = c.ivory; e.currentTarget.style.background = c.glow; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.chalk; e.currentTarget.style.background = "transparent"; }}>
        See How It Works
      </button>
    </div>
  );
}

function BottomCTA() {
  const { isLoggedIn } = useAuth();
  return (
    <Link to={isLoggedIn ? "/dashboard" : "/signup"} className="shimmer-btn premium-btn" style={{
      fontFamily: font.ui, fontSize: 16, fontWeight: 600, padding: "18px 44px",
      borderRadius: 14, cursor: "pointer", letterSpacing: "0.02em", textDecoration: "none",
      display: "inline-flex", alignItems: "center",
    }}
      onClick={() => { track("cta_click", { cta: isLoggedIn ? "final_go_to_dashboard" : "final_get_started" }); capture("cta_click", { cta: isLoggedIn ? "final_go_to_dashboard" : "final_get_started" }); }}>
      {isLoggedIn ? "Go to Dashboard" : "Get Started Free"}
    </Link>
  );
}

/* ═══════════════════════════════════════════════
   HERO — split layout: text left, mockup right
   ═══════════════════════════════════════════════ */

function Hero() {
  const { c, isDark } = useTheme();
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
    <section className={isDark ? "dot-grid-bg" : ""} style={{
      position: "relative", minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", overflow: "hidden",
    }}>
      {isDark && <ParticleCanvas isDark={isDark} />}
      <div className="landing-hero" style={{ display: "flex", alignItems: "center", maxWidth: 1200, width: "100%", padding: "160px 48px 100px", position: "relative" }}>

      {/* Mesh gradient */}
      {isDark && <div style={{
        position: "absolute", top: "40%", left: "50%",
        transform: `translate(calc(-50% + ${mx}px), calc(-50% + ${my}px))`,
        width: 900, height: 900, borderRadius: "50%",
        background: `conic-gradient(from 180deg, rgba(212,179,127,0.06), rgba(122,158,126,0.03), rgba(196,112,90,0.02), rgba(212,179,127,0.06))`,
        filter: "blur(80px)", pointerEvents: "none",
        animation: "meshRotate 30s linear infinite",
      }} />}

      {/* Geometric circles (parallax) */}
      {isDark && [600, 400, 220].map((size, i) => (
        <div key={size} style={{
          position: "absolute", top: "50%", left: "60%",
          transform: `translate(-50%, -50%) translateY(${parallaxOffset * (0.5 - i * 0.15)}px)`,
          width: size, height: size, border: `1px solid ${c.border}`,
          borderRadius: "50%", pointerEvents: "none",
        }} />
      ))}

      {/* Split: Left text */}
      <div style={{ flex: 1, position: "relative", zIndex: 1, paddingRight: 40 }}>
        {/* Social proof badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 16px",
          background: isDark ? "rgba(212,179,127,0.06)" : "rgba(184,146,62,0.06)", border: `1px solid ${isDark ? "rgba(212,179,127,0.15)" : "rgba(184,146,62,0.12)"}`,
          borderRadius: 100, marginBottom: 28, animation: "fadeIn 0.8s ease 0.2s both",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.sage, display: "inline-block", animation: "giltPulse 2s ease-in-out infinite" }} />
          <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, letterSpacing: "0.02em" }}>
            Now live — start practicing for free
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
          fontFamily: font.ui, fontSize: "clamp(15px, 1.8vw, 17px)", fontWeight: 400,
          lineHeight: 1.65, color: c.chalk, maxWidth: 460, margin: "0 0 36px",
          animation: "fadeInUp 0.8s ease 1.8s both",
        }}>
          AI mock interviews that adapt to your resume and target role — whether you're
          landing your first job or leveling up to your dream company. Free to start.
        </p>

        {/* CTAs */}
        <HeroCTA />

        {/* Value props row */}
        <div style={{ display: "flex", gap: 28, animation: "fadeIn 1s ease 2.6s both", alignItems: "center" }}>
          {[
            { value: "Free", label: "To Start" },
            { value: "AI", label: "Powered" },
            { value: "Real-time", label: "Feedback" },
          ].map((s) => (
            <div key={s.label}>
              <span style={{ fontFamily: font.mono, fontSize: 20, fontWeight: 600, color: c.ivory, display: "block" }}>{s.value}</span>
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, letterSpacing: "0.04em" }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Split: Right mockup — floating score card */}
      <div style={{
        flex: 1, position: "relative", zIndex: 1,
        animation: "fadeInUp 1s ease 1s both",
      }}>
        <div style={{ position: "relative" }}>
          {/* Glow behind card */}
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            width: "80%", height: "80%", borderRadius: "50%",
            background: isDark ? "radial-gradient(ellipse at center, rgba(212,179,127,0.08) 0%, transparent 70%)" : "radial-gradient(ellipse at center, rgba(184,146,62,0.06) 0%, transparent 70%)",
            pointerEvents: "none", filter: "blur(40px)",
          }} />
          <HeroMockup />
        </div>
      </div>

      </div>

      {/* Scroll indicator */}
      <div style={{
        position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        animation: "fadeIn 1s ease 3s both", zIndex: 1,
      }}>
        <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: c.stone }}>Scroll</span>
        <div style={{ width: 1, height: 32, background: `linear-gradient(180deg, ${c.stone} 0%, transparent 100%)`, animation: "floatSlow 3s ease-in-out infinite" }} />
      </div>
    </section>
  );
}

/* Hero floating score card */
function HeroMockup() {
  const { c, isDark } = useTheme();
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 1200),
      setTimeout(() => setStep(2), 2400),
      setTimeout(() => setStep(3), 3800),
      setTimeout(() => setStep(4), 5200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div style={{ position: "relative" }}>
      {/* Main card */}
      <div className="mockup-window" style={{
        background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`,
        overflow: "hidden", boxShadow: isDark ? "0 32px 80px rgba(0,0,0,0.5), 0 0 60px rgba(212,179,127,0.04)" : "0 32px 80px rgba(0,0,0,0.08), 0 0 60px rgba(184,146,62,0.03)",
        animation: "floatSlow 6s ease-in-out infinite",
      }}>
        {/* Window chrome */}
        <div style={{ height: 38, background: c.obsidian, borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "center", padding: "0 14px", gap: 6 }}>
          {[0.4, 0.3, 0.3].map((o, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: isDark ? `rgba(245,242,237,${o * 0.4})` : `rgba(0,0,0,${o * 0.3})` }} />)}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.sage, animation: "giltPulse 1.5s ease-in-out infinite" }} />
            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Live Session — Software Engineer</span>
          </div>
          <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>12:34</span>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Interviewer message */}
          <div style={{
            opacity: step >= 1 ? 1 : 0, transform: step >= 1 ? "translateY(0)" : "translateY(12px)",
            transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: `linear-gradient(135deg, ${c.gilt}40, ${c.gilt}15)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
              </div>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.gilt, letterSpacing: "0.06em", textTransform: "uppercase" }}>Interviewer</span>
            </div>
            <div style={{ background: isDark ? `rgba(212,179,127,0.05)` : `rgba(184,146,62,0.04)`, border: `1px solid ${isDark ? "rgba(212,179,127,0.1)" : "rgba(184,146,62,0.08)"}`, borderRadius: "2px 12px 12px 12px", padding: "12px 16px", marginLeft: 32 }}>
              <p style={{ fontFamily: font.ui, fontSize: 13, lineHeight: 1.6, color: c.ivory }}>
                Tell me about a challenging project you worked on. What was your role and how did you approach the problem?
              </p>
            </div>
          </div>

          {/* User response */}
          <div style={{
            opacity: step >= 2 ? 1 : 0, transform: step >= 2 ? "translateY(0)" : "translateY(12px)",
            transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, justifyContent: "flex-end" }}>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.sage, letterSpacing: "0.06em", textTransform: "uppercase" }}>You</span>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: `linear-gradient(135deg, ${c.sage}40, ${c.sage}15)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
            </div>
            <div style={{ background: c.obsidian, border: `1px solid ${c.border}`, borderRadius: "14px 2px 12px 12px", padding: "12px 16px", marginRight: 32 }}>
              <p style={{ fontFamily: font.ui, fontSize: 13, lineHeight: 1.6, color: c.chalk }}>
                We had a tight deadline to migrate our payment system. I broke it into phases — first the API layer, then the frontend...
              </p>
            </div>
          </div>

          {/* Live waveform */}
          <div style={{
            opacity: step >= 2 ? 1 : 0, transition: "opacity 0.4s ease 0.3s",
            display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", marginRight: 32,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.ember, animation: step >= 2 ? "giltPulse 1s ease-in-out infinite" : "none" }} />
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 2, height: 20 }}>
              {Array.from({ length: 28 }).map((_, i) => (
                <div key={i} style={{
                  flex: 1, borderRadius: 1, alignSelf: "flex-end",
                  height: `${20 + Math.sin(i * 0.7) * 40 + Math.random() * 40}%`,
                  background: `linear-gradient(180deg, ${c.gilt}80, ${c.ember}60)`,
                  opacity: 0.5,
                }} />
              ))}
            </div>
            <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>speaking...</span>
          </div>

          {/* AI follow-up typing */}
          {step >= 3 && (
            <div style={{
              opacity: step >= 3 ? 1 : 0, transform: step >= 3 ? "translateY(0)" : "translateY(8px)",
              transition: "all 0.5s ease",
              display: "flex", alignItems: "center", gap: 8, marginLeft: 32,
              padding: "10px 16px", background: isDark ? `rgba(212,179,127,0.03)` : `rgba(184,146,62,0.02)`,
              border: `1px solid ${isDark ? "rgba(212,179,127,0.08)" : "rgba(184,146,62,0.06)"}`, borderRadius: "2px 12px 12px 12px",
            }}>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.gilt, letterSpacing: "0.04em", textTransform: "uppercase", marginRight: 4 }}>Follow-up</span>
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1, 2].map((d) => (
                  <div key={d} style={{
                    width: 5, height: 5, borderRadius: "50%", background: c.gilt,
                    animation: `dotPulse 1.2s ease-in-out ${d * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating insight card — overlaps bottom-right */}
      <div style={{
        position: "absolute", bottom: -20, right: -16,
        background: c.graphite, borderRadius: 12, border: `1px solid ${isDark ? "rgba(212,179,127,0.15)" : "rgba(184,146,62,0.12)"}`,
        padding: "14px 18px", maxWidth: 220,
        boxShadow: isDark ? "0 16px 48px rgba(0,0,0,0.5), 0 0 24px rgba(212,179,127,0.06)" : "0 16px 48px rgba(0,0,0,0.08), 0 0 24px rgba(184,146,62,0.04)",
        opacity: step >= 4 ? 1 : 0, transform: step >= 4 ? "translateY(0) scale(1)" : "translateY(8px) scale(0.95)",
        transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
        zIndex: 2,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.gilt, letterSpacing: "0.06em", textTransform: "uppercase" }}>AI Insight</span>
        </div>
        <p style={{ fontFamily: font.ui, fontSize: 11, lineHeight: 1.5, color: c.chalk }}>
          Add a specific metric — mention the timeline saved or error rate reduced.
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   COMPANY LOGO SVGs (monochrome ivory for dark bg)
   ═══════════════════════════════════════════════ */
const companyLogos: { name: string; svg: React.ReactNode }[] = [
  {
    name: "Google",
    svg: (
      <svg aria-hidden="true" width="74" height="24" viewBox="0 0 256 86" fill="currentColor">
        <path d="M34.8 43.7c0 12-9.4 20.8-20.9 20.8S-7 55.7-7 43.7c0-12.1 9.4-20.9 20.9-20.9s20.9 8.8 20.9 20.9zm-9.2 0c0-7.5-5.4-12.6-11.7-12.6S2.2 36.2 2.2 43.7c0 7.4 5.4 12.6 11.7 12.6s11.7-5.2 11.7-12.6z" transform="translate(7 0)"/>
        <path d="M73.4 43.7c0 12-9.4 20.8-20.9 20.8s-20.9-8.8-20.9-20.8c0-12.1 9.4-20.9 20.9-20.9S73.4 31.6 73.4 43.7zm-9.2 0c0-7.5-5.4-12.6-11.7-12.6S40.8 36.2 40.8 43.7c0 7.4 5.4 12.6 11.7 12.6s11.7-5.2 11.7-12.6z" transform="translate(7 0)"/>
        <path d="M110.6 24.1v37.8c0 15.6-9.2 21.9-20 21.9-10.2 0-16.4-6.8-18.7-12.4l8-3.3c1.4 3.4 4.9 7.5 10.7 7.5 7 0 11.3-4.3 11.3-12.5V60h-.3c-2.1 2.6-6.1 4.8-11.2 4.8-10.6 0-20.3-9.2-20.3-21.1 0-11.9 9.7-21.2 20.3-21.2 5 0 9.1 2.2 11.2 4.8h.3v-3.3h8.7zm-8 19.8c0-7.3-4.9-12.7-11.1-12.7-6.3 0-11.6 5.3-11.6 12.7 0 7.2 5.3 12.4 11.6 12.4 6.2.1 11.1-5.2 11.1-12.4z" transform="translate(7 0)"/>
        <path d="M121.8 3.8v59.6h-8.9V3.8h8.9z" transform="translate(7 0)"/>
        <path d="M155.2 51.3l6.9 4.6c-2.2 3.3-7.6 9-16.9 9-11.5 0-20.1-8.9-20.1-20.8 0-12.4 8.7-20.9 19.1-20.9 10.5 0 15.6 8.3 17.3 12.8l.9 2.3-27 11.2c2.1 4.1 5.3 6.1 9.8 6.1s7.7-2.2 10-5.3zm-21.2-7.5l18.1-7.5c-1-2.5-4-4.3-7.5-4.3-4.5 0-10.8 4-10.6 11.8z" transform="translate(7 0)"/>
        <path d="M170.4 63.4V3.8h14.2c10.6 0 19.5 7.4 19.5 18.2 0 10.8-8.9 18.2-19.5 18.2h-5.3v23.2h-8.9zm8.9-31.4h5.5c6.5 0 10.4-4.8 10.4-10.1 0-5.2-3.9-10-10.4-10h-5.5V32z" transform="translate(7 0)"/>
      </svg>
    ),
  },
  {
    name: "Apple",
    svg: (
      <svg aria-hidden="true" width="20" height="24" viewBox="0 0 256 315" fill="currentColor">
        <path d="M213.8 167c.4 47.6 41.8 63.4 42.2 63.6-.3 1.1-6.6 22.6-21.8 44.7-13.1 19.2-26.7 38.3-48.1 38.7-21.1.4-27.8-12.5-51.9-12.5s-31.4 12.1-51.4 12.9c-20.7.8-36.5-20.7-49.7-39.8-27-39.4-47.6-111.4-19.9-159.9 13.8-24.1 38.3-39.3 65-39.7 20.3-.4 39.5 13.7 51.9 13.7 12.4 0 35.7-16.9 60.2-14.4 10.3.4 39.1 4.1 57.5 31.1-1.5.9-34.4 20.1-34 60.1M174.2 50.2c11-13.3 18.4-31.8 16.4-50.2-15.8.6-35 10.5-46.3 23.8-10.2 11.8-19 30.3-16.6 48.2 17.6 1.4 35.6-8.9 46.5-21.8"/>
      </svg>
    ),
  },
  {
    name: "Microsoft",
    svg: (
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 256 256" fill="currentColor">
        <rect x="0" y="0" width="121.7" height="121.7" opacity="0.8"/>
        <rect x="134.3" y="0" width="121.7" height="121.7" opacity="0.6"/>
        <rect x="0" y="134.3" width="121.7" height="121.7" opacity="0.6"/>
        <rect x="134.3" y="134.3" width="121.7" height="121.7" opacity="0.4"/>
      </svg>
    ),
  },
  {
    name: "Meta",
    svg: (
      <svg aria-hidden="true" width="28" height="20" viewBox="0 0 256 171" fill="currentColor">
        <path d="M27.7 112.1c0 9.8 2.1 17.3 4.9 21.8 3.7 5.9 9.2 8.5 14.8 8.5 7.2 0 13.8-1.8 26.5-19.4 10.2-14.1 22.2-33.9 30.3-46.3L118 55.8c9.5-14.6 20.5-30.8 33.1-41.8C161.2 5 172.3 0 183.5 0c18.8 0 36.6 10.9 50.3 31.3 15 22.3 22.2 50.4 22.2 79.4 0 17.3-3.4 29.9-9.2 39.9-5.6 9.7-16.5 19.4-34.8 19.4v-27.6c15.7 0 19.6-14.4 19.6-30.9 0-23.5-5.5-49.6-17.6-68.3-8.6-13.2-19.7-21.3-31.9-21.3-13.2 0-23.9 10-35.8 27.8-6.4 9.4-12.9 21-20.2 34l-8.1 14.3C101.8 126.6 97.7 133.2 89.6 144c-14.2 18.9-26.3 26.1-42.3 26.1-18.9 0-30.9-8.2-38.3-20.6C2.97 139.4 0 126.2 0 111.1l27.7 1z"/>
      </svg>
    ),
  },
  {
    name: "Amazon",
    svg: (
      <svg aria-hidden="true" width="74" height="22" viewBox="0 0 603 182" fill="currentColor">
        <path d="M374.1 142.3c-34.8 25.7-85.3 39.4-128.8 39.4-61 0-115.8-22.5-157.3-60-.3-.3-.3-7.5 3.3-3.3 44.8 36.4 100.1 58.3 157.3 58.3 38.6 0 81-8 120-24.5 5.9-2.5 10.8 3.8 5.5 10.1z"/>
        <path d="M389.6 125.5c-4.5-5.8-30-2.8-41.5-1.4-3.5.4-4-2.6-.9-4.8 20.3-14.3 53.6-10.2 57.5-5.4 3.9 4.9-1 38.8-20.1 55-2.9 2.5-5.7 1.2-4.4-2.1 4.3-10.7 13.9-35.5 9.4-41.3z"/>
        <path d="M349.3 23.5V7.2c0-2.5 1.9-4.1 4.1-4.1h72.8c2.3 0 4.2 1.7 4.2 4.1v14c0 2.3-2 5.3-5.4 10l-37.7 53.8c14-0.3 28.8 1.7 41.5 8.8 2.9 1.6 3.6 3.9 3.8 6.2v17.4c0 2.3-2.6 5.1-5.3 3.7-22.1-11.6-51.5-12.9-76 .1-2.5 1.3-5.1-1.4-5.1-3.7V100c0-2.6.1-7 2.6-10.9L389.7 36h-36.3c-2.3 0-4.1-1.7-4.1-4V23.5z"/>
        <path d="M124.1 107.6h-22.1c-2.1-.2-3.8-1.7-3.9-3.8V7.5c0-2.3 1.9-4.1 4.3-4.1h20.6c2.1.1 3.9 1.8 4 3.9V24h.4c5.4-14.7 15.5-21.5 29.1-21.5 13.8 0 22.5 6.8 28.7 21.5 5.4-14.7 17.6-21.5 30.6-21.5 9.3 0 19.4 3.8 25.6 12.4 7 9.6 5.6 23.5 5.6 35.7v53.2c0 2.3-1.9 4.2-4.3 4.2h-22c-2.2-.2-3.9-1.9-3.9-4.2V59.5c0-4.8.4-16.7-.6-21.2-1.7-7.6-6.8-9.7-13.4-9.7-5.5 0-11.3 3.7-13.6 9.6-2.3 5.9-2.1 15.8-2.1 21.3v44.3c0 2.3-1.9 4.2-4.3 4.2h-22c-2.2-.2-3.9-1.9-3.9-4.2l-.1-44.4c0-12.7 2.1-31.3-14-31.3-16.3 0-15.7 18.2-15.7 31.3v44.4c0 2.3-1.9 4.2-4.3 4.2z"/>
        <path d="M467.4 2.5c32.7 0 50.4 28.1 50.4 63.8 0 34.5-19.5 61.9-50.4 61.9-32.1 0-49.6-28.1-49.6-63 0-35 17.7-62.7 49.6-62.7zm.2 23.1c-16.2 0-17.2 22.1-17.2 35.9 0 13.8-.2 43.3 17 43.3 17 0 17.8-23.8 17.8-38.3 0-9.6-.4-21-3.3-30.1-2.5-7.9-7.5-10.8-14.3-10.8z"/>
        <path d="M554.6 107.6h-22c-2.2-.2-3.9-1.9-3.9-4.2l-.1-96.1c.2-2.1 2-3.8 4.3-3.8h20.5c1.9.1 3.5 1.5 3.9 3.3v14.7h.4c6.1-13.6 14.6-20 29.5-20 9.9 0 19.5 3.6 25.7 13.3 5.8 9.1 5.8 24.3 5.8 35.2v53.6c-.3 2-2.1 3.6-4.3 3.6h-22.2c-2-.2-3.7-1.7-3.9-3.6V57.6c0-12.4 1.4-30.5-14.2-30.5-5.5 0-10.6 3.7-13.1 9.3-3.2 7.1-3.6 14.2-3.6 21.2v46.2c-.1 2.3-2 4.2-4.4 4.2z"/>
        <path d="M296 61.3c0 8.7.2 16-4.2 23.7-3.5 6.3-9.1 10.2-15.3 10.2-8.5 0-13.5-6.5-13.5-16 0-18.9 16.9-22.3 33-22.3V61.3zM318.2 107.4c-1.4 1.3-3.5 1.4-5.1.5-7.2-6-8.5-8.7-12.4-14.4-11.9 12.1-20.3 15.7-35.7 15.7-18.2 0-32.4-11.3-32.4-33.8 0-17.6 9.5-29.6 23.1-35.5 11.8-5.2 28.2-6.1 40.8-7.6v-2.8c0-5.2.4-11.3-2.6-15.8-2.6-4-7.7-5.7-12.2-5.7-8.3 0-15.7 4.3-17.5 13.1-.4 2-1.8 3.9-3.8 4l-21.3-2.3c-1.8-.4-3.8-1.8-3.3-4.6C240.9 6.7 263.4 0 283.7 0c10.4 0 24 2.8 32.2 10.7 10.4 9.6 9.4 22.4 9.4 36.4v33c0 9.9 4.1 14.2 8 19.6 1.4 1.9 1.7 4.2-.1 5.6-4.4 3.7-12.3 10.6-16.6 14.4l-.4-.3z"/>
      </svg>
    ),
  },
  {
    name: "McKinsey",
    svg: (
      <svg aria-hidden="true" width="90" height="16" viewBox="0 0 180 24" fill="currentColor">
        <text x="0" y="18" fontFamily="'Inter', sans-serif" fontSize="17" fontWeight="600" letterSpacing="0.06em">McKinsey</text>
      </svg>
    ),
  },
  {
    name: "Deloitte",
    svg: (
      <svg aria-hidden="true" width="72" height="16" viewBox="0 0 150 24" fill="currentColor">
        <text x="0" y="18" fontFamily="'Inter', sans-serif" fontSize="17" fontWeight="600" letterSpacing="0.04em">Deloitte</text>
        <circle cx="142" cy="16" r="4" fill="#86BC25" opacity="0.7"/>
      </svg>
    ),
  },
  {
    name: "Goldman Sachs",
    svg: (
      <svg aria-hidden="true" width="115" height="16" viewBox="0 0 220 24" fill="currentColor">
        <text x="0" y="18" fontFamily="'Inter', sans-serif" fontSize="17" fontWeight="600" letterSpacing="0.03em">Goldman Sachs</text>
      </svg>
    ),
  },
];

/* ═══════════════════════════════════════════════
   LOGO MARQUEE
   ═══════════════════════════════════════════════ */
function LogoMarquee() {
  const { c } = useTheme();
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
   ANIMATED STATS SECTION
   ═══════════════════════════════════════════════ */
function useCountUp(target: number, duration = 2000) {
  const [value, setValue] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStarted(true); observer.unobserve(el); } },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [started, target, duration]);

  return { value, ref, started };
}

function StatsSection() {
  const { c } = useTheme();
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
function ProblemSection() {
  const { c } = useTheme();
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} className="reveal landing-section" style={{ padding: "160px 40px", maxWidth: 1100, margin: "0 auto" }}>
      <div className="landing-problem-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
        {/* Image side */}
        <div style={{ position: "relative" }}>
          <div style={{
            borderRadius: 16, overflow: "hidden", position: "relative",
            aspectRatio: "4 / 5",
          }}>
            <img
              src="https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=600&h=750&fit=crop&crop=face"
              alt="Professional preparing for interview"
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
                src="https://images.unsplash.com/photo-1560250097-0b93528c311a?w=64&h=64&fit=crop&crop=face"
                alt=""
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
   HOW IT WORKS — with product mockups
   ═══════════════════════════════════════════════ */
const steps = [
  { number: "01", title: "Upload your resume", description: "Add your experience and target role. Our AI creates a personalized interview matched to your background and goals.", mockup: "upload" as const },
  { number: "02", title: "Practice in real time", description: "A conversational AI interviewer asks questions, listens, and follows up — just like a real interview at a top company.", mockup: "interview" as const },
  { number: "03", title: "Review scored feedback", description: "Get specific scores and actionable tips after every session. Know exactly what to improve before your real interview.", mockup: "feedback" as const },
];

function HowItWorks() {
  const { c, isDark } = useTheme();
  const ref = useReveal<HTMLElement>();
  const [activeStep, setActiveStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Auto-advance every 4s
  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [isPaused]);

  return (
    <section id="how-it-works" ref={ref} className={`reveal ${isDark ? "dot-grid-bg" : ""} landing-section`} style={{ padding: "160px 40px 100px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 64 }}>
        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 16 }}>How It Works</p>
        <h2 className="text-glow" style={{ fontFamily: font.display, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 400, letterSpacing: "-0.02em", color: c.ivory, lineHeight: 1.15 }}>
          Three steps to sharper interviews
        </h2>
      </div>

      {/* Step tabs — horizontal row */}
      <div
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div className="landing-steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 48 }}>
          {steps.map((step, i) => {
            const isActive = activeStep === i;
            return (
              <button
                key={step.number}
                onClick={() => setActiveStep(i)}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  padding: "24px 20px", textAlign: "left", position: "relative",
                  borderRadius: 12, transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                {/* Progress bar at top */}
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: 2,
                  background: c.border, borderRadius: 1, overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", borderRadius: 1,
                    background: `linear-gradient(90deg, ${c.gilt}, ${c.gilt}80)`,
                    width: isActive && !isPaused ? "100%" : isActive ? "100%" : "0%",
                    transition: isActive && !isPaused ? "width 4s linear" : "width 0.3s ease",
                  }} />
                </div>

                {/* Step number */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <span style={{
                    fontFamily: font.mono, fontSize: 12, fontWeight: 600,
                    color: isActive ? c.gilt : c.stone,
                    width: 32, height: 32, borderRadius: "50%",
                    border: `1.5px solid ${isActive ? c.gilt : c.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.4s ease",
                    background: isActive ? (isDark ? `rgba(212,179,127,0.08)` : `rgba(184,146,62,0.06)`) : "transparent",
                    boxShadow: isActive ? (isDark ? `0 0 20px rgba(212,179,127,0.12)` : `0 0 20px rgba(184,146,62,0.08)`) : "none",
                  }}>
                    {step.number}
                  </span>
                  <h3 style={{
                    fontFamily: font.ui, fontSize: 16, fontWeight: 600,
                    color: isActive ? c.ivory : c.stone,
                    transition: "color 0.4s ease", margin: 0,
                  }}>
                    {step.title}
                  </h3>
                </div>

                {/* Description — expands when active */}
                <div style={{
                  overflow: "hidden",
                  maxHeight: isActive ? 80 : 0,
                  opacity: isActive ? 1 : 0,
                  transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
                  paddingLeft: 44,
                }}>
                  <p style={{
                    fontFamily: font.ui, fontSize: 13, fontWeight: 400,
                    lineHeight: 1.65, color: c.chalk,
                  }}>
                    {step.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Mockup area — crossfade */}
        <div className="gradient-border-card" style={{
          position: "relative", overflow: "hidden", zIndex: 0,
          minHeight: 340, borderRadius: 16,
        }}>
          {steps.map((step, i) => (
            <div
              key={step.number}
              style={{
                position: i === 0 ? "relative" : "absolute",
                inset: i === 0 ? undefined : 0,
                opacity: activeStep === i ? 1 : 0,
                transform: activeStep === i ? "scale(1)" : "scale(0.96)",
                transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
                pointerEvents: activeStep === i ? "auto" : "none",
                padding: 24,
              }}
            >
              <ProductMockup type={step.mockup} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductMockup({ type, showChrome = false }: { type: "upload" | "interview" | "feedback"; showChrome?: boolean }) {
  const { c, isDark } = useTheme();
  const content = (
    <>
      {type === "upload" && <MockupUpload />}
      {type === "interview" && <MockupInterview />}
      {type === "feedback" && <MockupFeedback />}
    </>
  );

  if (!showChrome) return <div>{content}</div>;

  return (
    <div className="mockup-window" style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.4)" }}>
      <div style={{ height: 38, background: c.obsidian, borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "center", padding: "0 14px", gap: 6 }}>
        {[0.4, 0.3, 0.3].map((o, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: isDark ? `rgba(245,242,237,${o * 0.4})` : `rgba(0,0,0,${o * 0.3})` }} />)}
        <div style={{ flex: 1, textAlign: "center" }}>
          <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, letterSpacing: "0.02em" }}>hirestepx.com</span>
        </div>
      </div>
      <div style={{ padding: 24 }}>{content}</div>
    </div>
  );
}

function MockupUpload() {
  const { c, isDark } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>New Session</div>
      <div style={{ border: `1.5px dashed ${isDark ? "rgba(212,179,127,0.25)" : "rgba(184,146,62,0.2)"}`, borderRadius: 10, padding: "32px 20px", textAlign: "center", background: isDark ? "rgba(212,179,127,0.02)" : "rgba(184,146,62,0.015)", transition: "all 0.3s ease" }}>
        <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" style={{ margin: "0 auto 12px", display: "block" }}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, marginBottom: 4 }}>Drop your resume here</p>
        <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>PDF, DOCX, or plain text</p>
      </div>
      <div>
        <label style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, letterSpacing: "0.04em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Target Role</label>
        <div style={{ background: c.obsidian, border: `1px solid ${c.border}`, borderRadius: 10, padding: "10px 14px", fontFamily: font.ui, fontSize: 13, color: c.chalk }}>Software Engineer, Google</div>
      </div>
      <div style={{ background: c.gilt, borderRadius: 8, padding: "10px 0", textAlign: "center", fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.obsidian }}>Generate Interview</div>
    </div>
  );
}

function MockupInterview() {
  const { c, isDark } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Live Session</span>
        <span style={{ fontFamily: font.mono, fontSize: 12, color: c.sage, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.sage, display: "inline-block", animation: "giltPulse 1.5s ease-in-out infinite" }} />
          Recording
        </span>
      </div>
      <div style={{ background: isDark ? "rgba(212,179,127,0.05)" : "rgba(184,146,62,0.04)", border: `1px solid ${isDark ? "rgba(212,179,127,0.1)" : "rgba(184,146,62,0.08)"}`, borderRadius: "14px 12px 12px 2px", padding: "14px 16px" }}>
        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>Interviewer</p>
        <p style={{ fontFamily: font.ui, fontSize: 13, lineHeight: 1.6, color: c.ivory }}>Tell me about a time you had to learn a new technology quickly to complete a project. How did you approach it?</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.ember, animation: "giltPulse 1.5s ease-in-out infinite" }} />
        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 2, height: 32 }}>
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: `${Math.random() * 80 + 20}%`, background: `linear-gradient(180deg, ${c.gilt} 0%, ${c.ember} 100%)`, borderRadius: 1, opacity: 0.5 }} />
          ))}
        </div>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: c.stone }}>2:34</span>
      </div>
      <div style={{ background: c.obsidian, border: `1px solid ${c.border}`, borderRadius: "14px 12px 2px 12px", padding: "14px 16px" }}>
        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.sage, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>You</p>
        <p style={{ fontFamily: font.ui, fontSize: 13, lineHeight: 1.6, color: c.chalk }}>I had a week to pick up GraphQL for a client migration. I started with the docs, built a small prototype, then...</p>
      </div>
    </div>
  );
}

function MockupFeedback() {
  const { c } = useTheme();
  const scores = [
    { label: "Communication", value: 87, color: c.gilt },
    { label: "Problem Solving", value: 92, color: c.sage },
    { label: "Structure & Clarity", value: 78, color: c.ember },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Session Feedback</div>
      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <span style={{ fontFamily: font.mono, fontSize: 48, fontWeight: 600, color: c.ivory, letterSpacing: "-0.02em" }}>86</span>
        <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginTop: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>Overall Score</p>
      </div>
      {scores.map((s) => (
        <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, width: 110, flexShrink: 0 }}>{s.label}</span>
          <div style={{ flex: 1, height: 3, background: c.border, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${s.value}%`, background: s.color, borderRadius: 2 }} />
          </div>
          <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 600, color: c.ivory, width: 24, textAlign: "right" }}>{s.value}</span>
        </div>
      ))}
      <div style={{ background: c.obsidian, borderRadius: 8, padding: "12px 14px", border: `1px solid ${c.border}` }}>
        <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.5, fontStyle: "italic" }}>"Your STAR structure was strong but you forgot to mention the outcome. Add the metric — '40% faster deploys' makes it memorable."</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   DEMO VIDEO
   ═══════════════════════════════════════════════ */
function DemoVideoSection() {
  const { c, isDark } = useTheme();
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} className="reveal landing-section" style={{ padding: "160px 40px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 16 }}>See It In Action</p>
        <h2 className="text-glow" style={{ fontFamily: font.display, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 400, letterSpacing: "-0.02em", color: c.ivory, lineHeight: 1.15, marginBottom: 12 }}>
          Watch a session in 90 seconds
        </h2>
        <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.6 }}>From resume upload to scored feedback — see how it works.</p>
      </div>

      <div className="video-player" style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 16, overflow: "hidden", cursor: "pointer", border: `1px solid ${c.border}`, background: c.graphite, transition: "border-color 0.3s ease, box-shadow 0.3s ease" }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.borderHover; e.currentTarget.style.boxShadow = isDark ? "0 32px 80px rgba(0,0,0,0.5), 0 0 80px rgba(212,179,127,0.04)" : "0 32px 80px rgba(0,0,0,0.08), 0 0 80px rgba(184,146,62,0.03)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.boxShadow = "none"; }}>
        {/* Video preview */}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${c.obsidian} 0%, ${c.graphite} 50%, ${c.obsidian} 100%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", top: "20%", left: "10%", width: 300, height: 300, borderRadius: "50%", background: isDark ? "radial-gradient(circle, rgba(212,179,127,0.04) 0%, transparent 70%)" : "radial-gradient(circle, rgba(184,146,62,0.03) 0%, transparent 70%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: "15%", right: "15%", width: 200, height: 200, borderRadius: "50%", background: isDark ? "radial-gradient(circle, rgba(122,158,126,0.04) 0%, transparent 70%)" : "radial-gradient(circle, rgba(45,122,58,0.03) 0%, transparent 70%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 40, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.25 }}>
            <div style={{ width: "70%", maxWidth: 500, background: c.graphite, borderRadius: 10, border: `1px solid ${c.border}`, padding: 24, textAlign: "left" }}>
              <div style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, marginBottom: 12 }}>Live Session</div>
              <div style={{ background: isDark ? "rgba(212,179,127,0.06)" : "rgba(184,146,62,0.04)", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
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
            width: 80, height: 80, borderRadius: "50%", background: isDark ? "rgba(245,242,237,0.08)" : "rgba(0,0,0,0.06)",
            backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
            border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center",
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
   FEATURES — gradient border cards with icons
   ═══════════════════════════════════════════════ */
function FeaturesSection() {
  const { c } = useTheme();
  const ref = useReveal<HTMLElement>();

  const features = [
    { label: "Adaptive", title: "Questions from your resume", description: "No recycled question banks. Every session is generated from your actual experience, targeting the exact role you're applying for.", accent: c.gilt, accentClass: "", icon: <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
    { label: "Real-Time", title: "Conversational AI that listens", description: "The interviewer responds to what you actually say — asking follow-ups and probing deeper, just like a real hiring manager would.", accent: c.sage, accentClass: "accent-sage", icon: <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> },
    { label: "Precise", title: "Feedback that's specific", description: '"You forgot to mention the outcome — add the 40% improvement metric." Not "try to be more specific."', accent: c.ember, accentClass: "accent-ember", icon: <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> },
    { label: "Private", title: "Your data stays yours", description: "Delete your data anytime from Settings. No social features, no tracking beyond basic web vitals.", accent: c.slate, accentClass: "accent-slate", icon: <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
  ];
  return (
    <section id="features" ref={ref} className="reveal landing-section" style={{ padding: "160px 40px 80px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 80 }}>
        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 16 }}>Why HireStepX</p>
        <h2 className="text-glow" style={{ fontFamily: font.display, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 400, letterSpacing: "-0.02em", color: c.ivory, lineHeight: 1.15 }}>
          Everything you need to ace the interview
        </h2>
      </div>
      {features.map((f, i) => <FeatureRow key={f.label} feature={f} index={i} />)}
    </section>
  );
}

function FeatureRow({ feature, index }: { feature: { label: string; title: string; description: string; accent: string; accentClass: string; icon: React.ReactNode }; index: number }) {
  const { c } = useTheme();
  const ref = useReveal<HTMLDivElement>();
  const isEven = index % 2 === 0;

  return (
    <div ref={ref} className={`reveal reveal-delay-1 feature-row-grid`} style={{
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center",
      marginBottom: 80, direction: isEven ? "ltr" : "rtl",
    }}>
      {/* Text side */}
      <div style={{ direction: "ltr" }}>
        <div className="icon-container" style={{
          width: 52, height: 52, borderRadius: 12, background: `${feature.accent}10`, border: `1px solid ${feature.accent}20`,
          display: "flex", alignItems: "center", justifyContent: "center", color: feature.accent, marginBottom: 24,
          ["--icon-glow" as string]: `${feature.accent}20`,
        }}>{feature.icon}</div>

        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: feature.accent, marginBottom: 14 }}>{feature.label}</p>
        <h3 style={{ fontFamily: font.ui, fontSize: 26, fontWeight: 600, color: c.ivory, marginBottom: 14, lineHeight: 1.3, letterSpacing: "-0.01em" }}>{feature.title}</h3>
        <p style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 400, lineHeight: 1.7, color: c.chalk, maxWidth: 400 }}>{feature.description}</p>
      </div>

      {/* Visual side */}
      <div style={{ direction: "ltr" }}>
        <FeatureVisual type={feature.label} accent={feature.accent} />
      </div>
    </div>
  );
}

function FeatureVisual({ type, accent }: { type: string; accent: string }) {
  const { c } = useTheme();
  if (type === "Adaptive") {
    return (
      <div className="gradient-border-card" style={{ padding: "28px 24px", zIndex: 0 }}>
        <div style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, marginBottom: 16 }}>Generated Questions</div>
        {["Walk me through a project where you solved a difficult technical problem.", "How do you prioritize tasks when you have competing deadlines?", "Tell me about a time you disagreed with a teammate. What happened?"].map((q, i) => (
          <div key={i} style={{
            padding: "12px 16px", marginBottom: 8, borderRadius: 8,
            background: i === 0 ? `${accent}08` : c.obsidian,
            border: `1px solid ${i === 0 ? `${accent}20` : c.border}`,
            fontFamily: font.ui, fontSize: 12, color: i === 0 ? c.ivory : c.chalk, lineHeight: 1.5,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontFamily: font.mono, fontSize: 10, color: accent, flexShrink: 0, opacity: 0.6 }}>Q{i + 1}</span>
            {q}
          </div>
        ))}
      </div>
    );
  }
  if (type === "Real-Time") {
    return (
      <div className="gradient-border-card" style={{ padding: "24px", zIndex: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory }}>Live Session</span>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: c.sage, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.sage, animation: "giltPulse 1.5s ease-in-out infinite" }} />
            Active
          </span>
        </div>
        <div style={{ background: `${accent}08`, border: `1px solid ${accent}15`, borderRadius: "10px 10px 10px 2px", padding: "12px 14px", marginBottom: 10 }}>
          <p style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: accent, marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>Follow-up</p>
          <p style={{ fontFamily: font.ui, fontSize: 12, lineHeight: 1.5, color: c.ivory }}>You mentioned improving test coverage. Can you walk me through the specific approach and what results you saw?</p>
        </div>
        <div style={{ display: "flex", gap: 2, height: 24, padding: "0 4px" }}>
          {Array.from({ length: 32 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: `${Math.random() * 80 + 20}%`, background: `linear-gradient(180deg, ${accent}, ${c.ember})`, borderRadius: 1, opacity: 0.4, alignSelf: "flex-end" }} />
          ))}
        </div>
      </div>
    );
  }
  if (type === "Precise") {
    return (
      <div className="gradient-border-card" style={{ padding: "24px", zIndex: 0 }}>
        <div style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, marginBottom: 16 }}>Feedback Analysis</div>
        {[
          { label: "Impact & Metrics", score: 42, note: "Missing specific numbers", color: c.ember },
          { label: "STAR Structure", score: 88, note: "Strong framework", color: c.sage },
          { label: "Confidence & Clarity", score: 71, note: "Reduce filler words", color: c.gilt },
        ].map((item) => (
          <div key={item.label} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk }}>{item.label}</span>
              <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: item.color }}>{item.score}</span>
            </div>
            <div style={{ height: 3, background: c.border, borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
              <div style={{ height: "100%", width: `${item.score}%`, background: item.color, borderRadius: 2 }} />
            </div>
            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, fontStyle: "italic" }}>{item.note}</span>
          </div>
        ))}
      </div>
    );
  }
  // Privacy
  return (
    <div className="gradient-border-card" style={{ padding: "28px 24px", zIndex: 0 }}>
      <div style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, marginBottom: 20 }}>Security & Privacy</div>
      {[
        { icon: "🔒", label: "Encrypted via Supabase RLS", status: "Active" },
        { icon: "🗑️", label: "Delete your data anytime", status: "Settings" },
        { icon: "🙈", label: "Recordings never shared", status: "Policy" },
        { icon: "📊", label: "Minimal analytics only", status: "Vercel" },
      ].map((item) => (
        <div key={item.label} style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
          background: c.obsidian, borderRadius: 8, border: `1px solid ${c.border}`, marginBottom: 8,
        }}>
          <span style={{ fontSize: 16 }}>{item.icon}</span>
          <span style={{ flex: 1, fontFamily: font.ui, fontSize: 12, color: c.chalk }}>{item.label}</span>
          <span style={{ fontFamily: font.mono, fontSize: 10, color: c.sage, background: `${c.sage}10`, padding: "3px 8px", borderRadius: 4 }}>{item.status}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SCORE PREVIEW
   ═══════════════════════════════════════════════ */
function ScorePreview() {
  const { c } = useTheme();
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
    <section ref={setRefs} className="reveal landing-section" style={{ padding: "160px 40px", maxWidth: 900, margin: "0 auto" }}>
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
   TESTIMONIALS — gradient-border cards + images
   ═══════════════════════════════════════════════ */
const testimonials = [
  { quote: "I was mass-applying and getting nowhere. After a week of practice on HireStepX, I started getting callbacks — and landed an offer at my top choice.", name: "Marcus T.", role: "Software Engineer", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=500&fit=crop&crop=face", result: "Landed dream job at Google" },
  { quote: "Switching careers from teaching to product management felt impossible. The AI caught gaps I didn't know I had. Three weeks later, I had two offers.", name: "Dana R.", role: "Career Changer → PM", image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=500&fit=crop&crop=face", result: "Career switch success" },
  { quote: "The feedback was brutally specific — told me I was using filler words 15 times per answer. Fixed that, and my next interview felt completely different.", name: "Priya K.", role: "Data Analyst, Recent Grad", image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=500&fit=crop&crop=face", result: "First job out of college" },
];

function TestimonialsSection() {
  const { c } = useTheme();
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
    <section ref={ref} className="reveal landing-section" style={{ padding: "160px 40px", maxWidth: 1100, margin: "0 auto" }}>
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
              <img key={t.name} src={t.image} alt={t.name} style={{
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
              <img src={t.image} alt={t.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   PRICING — with gradient border featured card
   ═══════════════════════════════════════════════ */
const plans = [
  { name: "Free", price: "Free", period: "", planId: "", description: "Try it out — no credit card required.", features: ["3 AI mock interviews", "Behavioral questions only", "Basic score & feedback", "Resume-tailored questions"], cta: "Start Free", featured: false },
  { name: "Starter", price: "₹49", period: "/ week", planId: "weekly", description: "10 sessions per week. Cancel anytime.", features: ["10 sessions per week", "All question types & roles", "Detailed feedback & skill scores", "Basic resume analysis", "PDF export"], cta: "Get Started", featured: false },
  { name: "Pro", price: "₹149", period: "/ month", planId: "monthly", description: "Unlimited prep. Best value for serious candidates.", features: ["Unlimited sessions", "Full AI coaching feedback", "Performance analytics & trends", "Interview calendar & reminders", "Full resume analysis", "Export PDF, CSV, JSON"], cta: "Go Pro", featured: true },
];

function PricingSection() {
  const { c, isDark } = useTheme();
  const ref = useReveal<HTMLElement>();
  return (
    <section id="pricing" ref={ref} className={`reveal ${isDark ? "dot-grid-bg" : ""} landing-section`} style={{ padding: "160px 40px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 80 }}>
        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 16 }}>Pricing</p>
        <h2 className="text-glow" style={{ fontFamily: font.display, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 400, letterSpacing: "-0.02em", color: c.ivory, lineHeight: 1.15, marginBottom: 16 }}>Transparent. No surprises.</h2>
        <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.6, maxWidth: 460, margin: "0 auto" }}>Start free. Upgrade when you're ready. No auto-renewal traps.</p>
      </div>
      <div className="pricing-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, alignItems: "start" }}>
        {plans.map((p, i) => <PricingCard key={p.name} plan={p} delay={i} />)}
      </div>
    </section>
  );
}

function PricingCard({ plan, delay }: { plan: (typeof plans)[0]; delay: number }) {
  const { c, isDark } = useTheme();
  const ref = useReveal<HTMLDivElement>();
  const navigate = useNavigate();
  const { user, isLoggedIn, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleClick = async () => {
    track("cta_click", { cta: `pricing_${plan.name.toLowerCase()}`, plan: plan.name });
    capture("cta_click", { cta: `pricing_${plan.name.toLowerCase()}`, plan: plan.name });
    if (plan.price === "Free") {
      navigate(isLoggedIn ? "/session/new" : "/signup");
      return;
    }
    if (!isLoggedIn) { navigate(`/signup?plan=${plan.planId}`); return; }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.planId, userId: user?.id, email: user?.email }),
      });
      const data = await res.json();
      if (!data.orderId) {
        setError(data.error || "Checkout unavailable. Please try again.");
        setLoading(false);
        return;
      }
      // Dynamically load Razorpay if not already loaded
      if (!(window as any).Razorpay) {
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
      {
        const options = {
          key: data.keyId,
          amount: data.amount,
          currency: data.currency,
          name: "HireStepX",
          description: data.description,
          order_id: data.orderId,
          prefill: { email: user?.email || "", name: user?.name || "" },
          theme: { color: "#D4B37F" },
          handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
            try {
              const authHeaders = await import("./supabase").then(m => m.authHeaders());
              const verifyRes = await fetch("/api/verify-payment", {
                method: "POST",
                headers: authHeaders,
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
          },
          modal: { ondismiss: () => setLoading(false) },
        };
        const rzp = new (window as any).Razorpay(options);
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
      borderColor: plan.featured ? (isDark ? `rgba(212,179,127,0.2)` : `rgba(184,146,62,0.15)`) : undefined,
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
        borderRadius: 12, border: plan.featured ? "none" : `1px solid ${c.border}`,
        background: plan.featured ? undefined : "transparent", color: plan.featured ? c.obsidian : c.chalk,
        cursor: loading ? "wait" : "pointer", transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)", position: "relative",
        opacity: loading ? 0.7 : 1,
      }}
        onMouseEnter={(e) => {
          if (plan.featured) { e.currentTarget.style.filter = "brightness(1.15)"; }
          else { e.currentTarget.style.borderColor = c.chalk; e.currentTarget.style.color = c.ivory; e.currentTarget.style.background = c.glow; }
        }}
        onMouseLeave={(e) => {
          if (plan.featured) { e.currentTarget.style.filter = "brightness(1)"; }
          else { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.chalk; e.currentTarget.style.background = "transparent"; }
        }}>
        {loading ? "Redirecting to checkout..." : plan.cta}
      </button>
      {error && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 }}>
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.ember, margin: 0 }}>{error}</p>
          <button onClick={() => setError("")} style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.gilt, background: "none", border: `1px solid ${isDark ? "rgba(212,179,127,0.3)" : "rgba(184,146,62,0.25)"}`, borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   FOR TEAMS BANNER
   ═══════════════════════════════════════════════ */
function ForTeamsBanner() {
  const { c } = useTheme();
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} className="reveal landing-section" style={{ padding: "0 40px 140px", maxWidth: 1100, margin: "0 auto" }}>
      <div className="gradient-border-card" style={{ padding: "52px 56px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", overflow: "hidden", zIndex: 0 }}>
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "40%", background: "url(https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&q=80) center/cover no-repeat", maskImage: "linear-gradient(to right, transparent, black 40%)", WebkitMaskImage: "linear-gradient(to right, transparent, black 40%)", opacity: 0.12 }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 12 }}>Coming Soon</p>
          <h3 style={{ fontFamily: font.display, fontSize: 28, fontWeight: 400, color: c.ivory, letterSpacing: "-0.01em", lineHeight: 1.25, marginBottom: 8 }}>HireStepX for Teams</h3>
          <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6, maxWidth: 440 }}>Career coaches, bootcamps, and universities — we're building team plans with client management and analytics. Interested? Let us know.</p>
        </div>
        <button className="shimmer-btn" style={{
          fontFamily: font.ui, fontSize: 14, fontWeight: 500, padding: "14px 32px",
          borderRadius: 8, border: `1px solid ${c.borderHover}`, background: "transparent",
          color: c.ivory, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, position: "relative", zIndex: 1,
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = c.ivory; e.currentTarget.style.color = c.obsidian; e.currentTarget.style.borderColor = c.ivory; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = c.ivory; e.currentTarget.style.borderColor = c.borderHover; }}>
          Get Early Access
        </button>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   TRUST / SECURITY BADGES
   ═══════════════════════════════════════════════ */
function TrustBadges() {
  const { c } = useTheme();
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
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
const LANDING_FAQS = [
  { question: "Is HireStepX free to use?", answer: "Yes! Our free plan includes 3 full AI mock interview sessions with real-time feedback, score tracking, and detailed performance reports. No credit card required." },
  { question: "How does the AI mock interview work?", answer: "You pick a role, company, and interview type (technical, behavioral, or case study). Our AI interviewer asks role-specific questions, listens to your answers via microphone, and gives instant feedback on content, delivery, and structure." },
  { question: "What types of interviews can I practice?", answer: "HireStepX covers technical interviews (DSA, system design), behavioral interviews (STAR method), HR rounds, case study interviews, and company-specific formats for Google, Amazon, TCS, Infosys, Flipkart, Razorpay, and more." },
  { question: "Can I practice for specific companies like TCS, Infosys, or Google?", answer: "Absolutely. Select your target company during session setup and our AI tailors questions to match that company's known interview patterns, difficulty level, and evaluation criteria." },
  { question: "How is HireStepX different from practicing with friends?", answer: "HireStepX provides consistent, unbiased scoring across communication, technical depth, and problem-solving. You get objective metrics to track improvement over time — something human practice partners can't reliably offer." },
  { question: "Is my interview data private and secure?", answer: "Yes. Your data is stored securely via Supabase with row-level security. Recordings and transcripts are never shared with employers or third parties. You can delete your data at any time from Settings." },
  { question: "Does HireStepX work on mobile?", answer: "HireStepX is a web app that works on any modern browser — desktop, tablet, or mobile. For the best experience during mock interviews, we recommend using a laptop or desktop with a microphone." },
  { question: "How do I track my progress?", answer: "Your dashboard shows score trends, session history, and detailed analytics across categories like communication, technical accuracy, and confidence. You can see exactly where you're improving." },
];

function FAQSection() {
  const { c } = useTheme();
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
            <div key={i} style={{ borderBottom: `1px solid ${c.border}`, overflow: "hidden" }}>
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
function FinalCTA() {
  const { c, isDark } = useTheme();
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} className="reveal landing-section" style={{ padding: "80px 40px 140px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{
        position: "relative", borderRadius: 20, overflow: "hidden",
        minHeight: 400, display: "flex", alignItems: "center",
      }}>
        {/* Background image — professional in confident pose */}
        <img
          src="https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=1400&h=600&fit=crop&crop=center"
          alt=""
          loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.3)" }}
        />
        {/* Dark overlay */}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${c.obsidian}E6 0%, ${c.obsidian}99 50%, transparent 100%)` }} />
        {/* Gilt glow */}
        <div style={{ position: "absolute", top: "50%", right: "20%", transform: "translateY(-50%)", width: 400, height: 400, borderRadius: "50%", background: isDark ? "radial-gradient(ellipse at center, rgba(212,179,127,0.08) 0%, transparent 70%)" : "radial-gradient(ellipse at center, rgba(184,146,62,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1, padding: "64px 60px", maxWidth: 560 }}>
          <p className="text-glow" style={{ fontFamily: font.display, fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 400, lineHeight: 1.15, letterSpacing: "-0.03em", color: c.ivory, marginBottom: 20 }}>
            Your next interview deserves{" "}
            <span style={{ color: c.gilt, fontStyle: "italic" }}>better</span> practice.
          </p>
          <p style={{ fontFamily: font.ui, fontSize: 15, color: c.chalk, lineHeight: 1.6, marginBottom: 32 }}>
            One free session. No credit card. See the difference that precision makes.
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
                  <img key={i} src={src} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} style={{
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
function EmailCapture() {
  const { c, isDark } = useTheme();
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
      const existing = JSON.parse(localStorage.getItem("hirloop_waitlist") || "[]");
      existing.push({ email, ts: new Date().toISOString() });
      localStorage.setItem("hirloop_waitlist", JSON.stringify(existing));
      track("waitlist_signup", { email });
      capture("waitlist_signup", { email });
      setStatus("done");
    } catch {
      // If Supabase insert fails (table doesn't exist yet), still count as success
      track("waitlist_signup", { email });
      capture("waitlist_signup", { email });
      setStatus("done");
    }
  };

  return (
    <section ref={ref} className="reveal landing-section" style={{ padding: "0 40px 120px", maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
      <div style={{
        background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`,
        padding: "48px 40px", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 400, height: 400, borderRadius: "50%", background: isDark ? "radial-gradient(ellipse, rgba(212,179,127,0.06), transparent 70%)" : "radial-gradient(ellipse, rgba(184,146,62,0.04), transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 12 }}>Stay Updated</p>
          <h3 style={{ fontFamily: font.display, fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 400, color: c.ivory, letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: 8 }}>
            Get interview tips & product updates
          </h3>
          <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6, marginBottom: 28 }}>
            Weekly tips on acing interviews at top Indian companies. Plus new feature announcements.
          </p>
          {status === "done" ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 16 }}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 500, color: c.sage }}>You're on the list! We'll be in touch.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", gap: 10, maxWidth: 420, margin: "0 auto" }}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
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
function Footer() {
  const { c } = useTheme();
  const linkHref: Record<string, string> = {
    "Interview Practice": "/#features",
    "AI Feedback": "/#how-it-works",
    "Score Analytics": "/#features",
    "For Teams": "/#pricing",
    "About": "/page/about",
    "Blog": "/blog",
    "Careers": "/page/careers",
    "Contact": "/page/contact",
    "Help Center": "/page/help",
    "API Docs": "/page/help",
    "Interview Tips": "/blog",
    "Success Stories": "/blog",
    "Privacy Policy": "/privacy",
    "Terms of Service": "/terms",
    "Cookie Policy": "/privacy",
    "GDPR": "/privacy",
  };
  const columns = [
    { title: "Product", links: ["Interview Practice", "AI Feedback", "Score Analytics", "For Teams"] },
    { title: "Company", links: ["About", "Blog", "Careers", "Contact"] },
    { title: "Resources", links: ["Help Center", "API Docs", "Interview Tips", "Success Stories"] },
    { title: "Legal", links: ["Privacy Policy", "Terms of Service"] },
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
              { icon: <svg key="x" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>, label: "Follow on X", title: "Coming soon" },
              { icon: <svg key="li" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>, label: "Follow on LinkedIn", title: "Coming soon" },
            ].map((s, i) => (
              <span key={i} aria-label={s.label} title={s.title} role="img" style={{
                width: 32, height: 32, borderRadius: "50%", border: `1px solid ${c.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: c.stone, opacity: 0.5, cursor: "default",
              }}>{s.icon}</span>
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

/* ═══════════════════════════════════════════════
   APP
   ═══════════════════════════════════════════════ */
export default function App() {
  const { c } = useTheme();
  const { isLoggedIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const [hadStoredSession] = useState(() => hasStoredSession());

  // Redirect logged-in users to their last route, or dashboard/onboarding
  useEffect(() => {
    if (loading || !isLoggedIn) return;
    let lastRoute = getLastRoute();
    // Never restore transient routes — send to dashboard instead
    if (lastRoute?.startsWith("/interview")) lastRoute = null;
    if (user && !user.hasCompletedOnboarding) {
      navigate(lastRoute?.startsWith("/onboarding") ? lastRoute : "/onboarding", { replace: true });
    } else {
      navigate(lastRoute && lastRoute !== "/" ? lastRoute : "/dashboard", { replace: true });
    }
  }, [isLoggedIn, loading, user, navigate]);

  useSEO({
    title: "HireStepX — AI Mock Interviews & Career Coaching for India",
    description: "Practice mock interviews with AI, get real-time feedback, track your scores, and land your dream job. Free for students and freshers in India.",
    ogType: "website",
    jsonLd: { "@context": "https://schema.org", "@graph": [webAppJsonLd(), faqJsonLd(LANDING_FAQS)] },
  });

  // While auth restores for returning users, show a blank screen matching the
  // app background instead of flashing the landing page.
  if (loading && hadStoredSession) {
    return <div style={{ minHeight: "100vh", background: c.obsidian }} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, color: c.ivory, position: "relative", overflow: "hidden" }}>
      <Nav />
      <main id="main-content">
        <Hero />
        <LogoMarquee />
        <StatsSection />
        <ProblemSection />
        <HowItWorks />
        <DemoVideoSection />
        <FeaturesSection />
        <TestimonialsSection />
        <PricingSection />
        <FAQSection />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
