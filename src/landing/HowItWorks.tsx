import { useState, useEffect } from "react";
import { c, font } from "../tokens";
import { useReveal } from "../hooks";
import { steps } from "../landingData";

function ProductMockup({ type, showChrome = false }: { type: "upload" | "interview" | "feedback"; showChrome?: boolean }) {
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
        {[0.15, 0.1, 0.1].map((o, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: `rgba(245,242,237,${o})` }} />)}
        <div style={{ flex: 1, textAlign: "center" }}>
          <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, letterSpacing: "0.02em" }}>hirestepx.com</span>
        </div>
      </div>
      <div style={{ padding: 24 }}>{content}</div>
    </div>
  );
}

function MockupUpload() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>New Session</div>
      <div style={{ border: `1.5px dashed rgba(212,179,127,0.25)`, borderRadius: 10, padding: "32px 20px", textAlign: "center", background: "rgba(212,179,127,0.02)", transition: "all 0.3s ease" }}>
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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Live Session</span>
        <span style={{ fontFamily: font.mono, fontSize: 12, color: c.sage, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.sage, display: "inline-block", animation: "giltPulse 1.5s ease-in-out infinite" }} />
          Recording
        </span>
      </div>
      <div style={{ background: "rgba(212,179,127,0.05)", border: `1px solid rgba(212,179,127,0.1)`, borderRadius: "14px 12px 12px 2px", padding: "14px 16px" }}>
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

export function HowItWorks() {
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
    <section id="how-it-works" ref={ref} className="reveal dot-grid-bg landing-section" style={{ padding: "140px 40px 100px", maxWidth: 1100, margin: "0 auto" }}>
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
                    background: isActive ? `rgba(212,179,127,0.08)` : "transparent",
                    boxShadow: isActive ? `0 0 20px rgba(212,179,127,0.12)` : "none",
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
