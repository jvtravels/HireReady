import { useState, useEffect, useRef } from "react";
import { track } from "@vercel/analytics";
import { c, font } from "./tokens";
import { getSupabase, supabaseConfigured } from "./supabase";

/* ─── Animated particle background (lightweight) ─── */
function ParticleBg() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const dpr = window.devicePixelRatio || 1;
    let w = window.innerWidth;
    let h = window.innerHeight;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const COUNT = w < 768 ? 25 : 50;
    interface P { x: number; y: number; vx: number; vy: number; r: number; o: number; od: number; }
    const ps: P[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.2, vy: -Math.random() * 0.3 - 0.05,
      r: Math.random() * 2 + 0.5, o: Math.random() * 0.4 + 0.05,
      od: (Math.random() - 0.5) * 0.003,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      // Radial glow
      const g = ctx.createRadialGradient(w / 2, h * 0.35, 0, w / 2, h * 0.35, w * 0.5);
      g.addColorStop(0, "rgba(212,179,127,0.04)");
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      for (const p of ps) {
        p.x += p.vx; p.y += p.vy; p.o += p.od;
        if (p.o > 0.5 || p.o < 0.03) p.od *= -1;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(212,179,127,${p.o})`; ctx.fill();
      }
      animId = requestAnimationFrame(draw);
    };

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!mq.matches) draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }} />;
}

/* ─── Countdown timer ─── */
function useCountdown(targetDate: Date) {
  const calc = () => {
    const diff = Math.max(0, targetDate.getTime() - Date.now());
    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
    };
  };
  const [time, setTime] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setTime(calc), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

/* ─── Feature preview cards ─── */
const FEATURES = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v1a7 7 0 0 1-14 0v-1" /><line x1="12" y1="18" x2="12" y2="22" />
      </svg>
    ),
    title: "AI Interviewer",
    desc: "Voice-powered mock interviews with real-time conversation, just like talking to a real interviewer.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    title: "Instant Feedback",
    desc: "Get scored on structure, clarity, and depth with actionable tips to improve after every answer.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    title: "Smart Resume Analysis",
    desc: "Upload your resume and get tailored interview questions matched to your experience and target role.",
  },
];

/* ═══════════════════════════════════════════════
   COMING SOON PAGE
   ═══════════════════════════════════════════════ */
export default function ComingSoon() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [count, setCount] = useState<number | null>(null);

  // Launch date — adjust as needed
  const launchDate = new Date("2026-05-15T00:00:00+05:30");
  const countdown = useCountdown(launchDate);

  // Fetch waitlist count
  useEffect(() => {
    (async () => {
      if (!supabaseConfigured) return;
      try {
        const client = await getSupabase();
        const { count: c } = await client.from("waitlist").select("*", { count: "exact", head: true });
        if (c !== null) setCount(c);
      } catch { /* ignore */ }
    })();
  }, [status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setStatus("sending");
    try {
      if (supabaseConfigured) {
        const client = await getSupabase();
        await client.from("waitlist").upsert(
          { email, created_at: new Date().toISOString() },
          { onConflict: "email" },
        );
      }
      track("waitlist_signup", { email, source: "coming_soon" });
      setStatus("done");
    } catch {
      track("waitlist_signup", { email, source: "coming_soon" });
      setStatus("done");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, color: c.ivory, position: "relative", overflow: "hidden" }}>
      <ParticleBg />

      {/* Global keyframes */}
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
        .cs-card:hover { border-color: rgba(212,179,127,0.2) !important; transform: translateY(-4px) !important; }
        .cs-input:focus { border-color: ${c.gilt} !important; box-shadow: 0 0 0 3px rgba(212,179,127,0.1) !important; }
        @media (max-width: 768px) {
          .cs-hero-title { font-size: clamp(32px, 8vw, 48px) !important; }
          .cs-features { flex-direction: column !important; }
          .cs-countdown { gap: 24px !important; }
          .cs-countdown-item { min-width: 70px !important; }
          .cs-form { flex-direction: column !important; }
          .cs-form button { width: 100% !important; }
        }
      `}</style>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto", padding: "0 24px" }}>

        {/* ─── Logo ─── */}
        <div style={{
          textAlign: "center", paddingTop: 48,
          animation: "fadeIn 0.8s ease both",
        }}>
          <span style={{
            fontFamily: font.display, fontSize: 28, fontWeight: 400,
            letterSpacing: "0.02em", color: c.ivory,
          }}>
            HireStepX
          </span>
        </div>

        {/* ─── Hero ─── */}
        <div style={{
          textAlign: "center", paddingTop: 80, paddingBottom: 48,
          animation: "fadeInUp 0.8s ease 0.2s both",
        }}>
          <div style={{
            display: "inline-block", padding: "6px 16px", borderRadius: 100,
            background: "rgba(212,179,127,0.08)", border: `1px solid rgba(212,179,127,0.15)`,
            marginBottom: 28,
          }}>
            <span style={{
              fontFamily: font.ui, fontSize: 12, fontWeight: 600,
              letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt,
              animation: "pulse 2s ease-in-out infinite",
            }}>
              Launching Soon
            </span>
          </div>

          <h1 className="cs-hero-title" style={{
            fontFamily: font.display, fontSize: "clamp(40px, 5vw, 64px)",
            fontWeight: 400, lineHeight: 1.1, letterSpacing: "-0.03em",
            color: c.ivory, margin: "0 auto 20px", maxWidth: 700,
          }}>
            Your AI interview coach is{" "}
            <span style={{
              background: `linear-gradient(135deg, ${c.gilt}, ${c.giltLight})`,
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              almost here
            </span>
          </h1>

          <p style={{
            fontFamily: font.ui, fontSize: "clamp(16px, 2vw, 19px)",
            color: c.stone, lineHeight: 1.7, maxWidth: 560, margin: "0 auto 32px",
          }}>
            Practice mock interviews with AI. Get real-time voice feedback, detailed scoring, and personalized coaching to land your dream job.
          </p>
        </div>

        {/* ─── Countdown ─── */}
        <div className="cs-countdown" style={{
          display: "flex", justifyContent: "center", gap: 36,
          marginBottom: 56,
          animation: "fadeInUp 0.8s ease 0.4s both",
        }}>
          {[
            { label: "Days", value: countdown.days },
            { label: "Hours", value: countdown.hours },
            { label: "Minutes", value: countdown.minutes },
            { label: "Seconds", value: countdown.seconds },
          ].map((item) => (
            <div key={item.label} className="cs-countdown-item" style={{
              textAlign: "center", minWidth: 80,
            }}>
              <div style={{
                fontFamily: font.mono, fontSize: "clamp(28px, 4vw, 44px)",
                fontWeight: 600, color: c.ivory, lineHeight: 1,
                background: c.graphite, borderRadius: 12,
                border: `1px solid ${c.border}`, padding: "16px 8px",
              }}>
                {String(item.value).padStart(2, "0")}
              </div>
              <span style={{
                fontFamily: font.ui, fontSize: 11, fontWeight: 500,
                color: c.stone, letterSpacing: "0.08em", textTransform: "uppercase",
                marginTop: 8, display: "block",
              }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>

        {/* ─── Email Signup ─── */}
        <div style={{
          maxWidth: 520, margin: "0 auto 32px", textAlign: "center",
          animation: "fadeInUp 0.8s ease 0.6s both",
        }}>
          {status === "done" ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              padding: "20px 24px", borderRadius: 12,
              background: "rgba(122,158,126,0.08)", border: `1px solid rgba(122,158,126,0.2)`,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
              <span style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 500, color: c.sage }}>
                You're on the list! We'll notify you at launch.
              </span>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="cs-form" style={{
                display: "flex", gap: 10,
              }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  className="cs-input"
                  style={{
                    flex: 1, fontFamily: font.ui, fontSize: 15, padding: "14px 18px",
                    borderRadius: 10, border: `1px solid ${c.border}`, background: c.graphite,
                    color: c.ivory, outline: "none", transition: "all 0.2s ease",
                  }}
                />
                <button type="submit" disabled={status === "sending"} style={{
                  fontFamily: font.ui, fontSize: 15, fontWeight: 600, padding: "14px 28px",
                  borderRadius: 10, border: "none", cursor: "pointer", whiteSpace: "nowrap",
                  background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian,
                  opacity: status === "sending" ? 0.7 : 1, transition: "opacity 0.2s",
                }}>
                  {status === "sending" ? "Joining..." : "Join Waitlist"}
                </button>
              </form>
              <p style={{
                fontFamily: font.ui, fontSize: 12, color: c.stone, marginTop: 12,
              }}>
                Be the first to know. No spam, ever.
              </p>
            </>
          )}

          {count !== null && count > 0 && (
            <p style={{
              fontFamily: font.ui, fontSize: 13, color: c.gilt, marginTop: 16,
              animation: "fadeIn 0.5s ease both",
            }}>
              {count.toLocaleString()}+ people already on the waitlist
            </p>
          )}
        </div>

        {/* ─── Feature Preview Cards ─── */}
        <div className="cs-features" style={{
          display: "flex", gap: 20, marginTop: 32, marginBottom: 80,
          animation: "fadeInUp 0.8s ease 0.8s both",
        }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="cs-card" style={{
              flex: 1, padding: "28px 24px", borderRadius: 14,
              background: c.graphite, border: `1px solid ${c.border}`,
              transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
              cursor: "default",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: "rgba(212,179,127,0.06)", border: `1px solid rgba(212,179,127,0.1)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 16, animation: `float 3s ease-in-out ${i * 0.3}s infinite`,
              }}>
                {f.icon}
              </div>
              <h3 style={{
                fontFamily: font.display, fontSize: 20, fontWeight: 400,
                color: c.ivory, marginBottom: 8, letterSpacing: "-0.01em",
              }}>
                {f.title}
              </h3>
              <p style={{
                fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6,
              }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>

        {/* ─── Social proof teaser ─── */}
        <div style={{
          textAlign: "center", paddingBottom: 80,
          animation: "fadeInUp 0.8s ease 1s both",
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 12,
            padding: "12px 24px", borderRadius: 100,
            background: "rgba(212,179,127,0.04)", border: `1px solid ${c.border}`,
          }}>
            <div style={{ display: "flex" }}>
              {[
                "https://images.unsplash.com/photo-1618568949733-46cbb00e1a38?w=80&h=80&fit=crop&crop=face",
                "https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?w=80&h=80&fit=crop&crop=face",
                "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=80&h=80&fit=crop&crop=face",
                "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=80&h=80&fit=crop&crop=face",
                "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=80&h=80&fit=crop&crop=face",
              ].map((src, i) => (
                <img key={i} src={src} alt="" aria-hidden="true" width={32} height={32} style={{
                  width: 32, height: 32, borderRadius: "50%",
                  border: `2px solid ${c.obsidian}`,
                  marginLeft: i > 0 ? -10 : 0,
                  objectFit: "cover",
                }} />
              ))}
            </div>
            <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk }}>
              Join early adopters preparing for their dream jobs
            </span>
          </div>
        </div>

        {/* ─── Footer ─── */}
        <footer style={{
          textAlign: "center", paddingBottom: 40,
          borderTop: `1px solid ${c.border}`, paddingTop: 24,
        }}>
          <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>
            &copy; {new Date().getFullYear()} HireStepX. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}
