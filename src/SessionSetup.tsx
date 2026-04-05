import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { track } from "@vercel/analytics";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";

/* ─── Adaptive difficulty helper ─── */
function getSuggestedDifficulty(): { id: string; reason: string } {
  try {
    const raw = localStorage.getItem("hireready_sessions");
    if (!raw) return { id: "standard", reason: "Default for first session" };
    const sessions = JSON.parse(raw);
    if (!sessions.length) return { id: "standard", reason: "Default for first session" };
    const recent = sessions.slice(0, 5);
    const avg = Math.round(recent.reduce((s: number, sess: any) => s + sess.score, 0) / recent.length);
    if (avg >= 85) return { id: "intense", reason: `Your avg score is ${avg} — time to push harder` };
    if (avg < 75) return { id: "warmup", reason: `Your avg score is ${avg} — build confidence first` };
    return { id: "standard", reason: `Your avg score is ${avg} — right on track` };
  } catch { return { id: "standard", reason: "Default" }; }
}

/* ─── Interview Types ─── */
const interviewTypes = [
  {
    id: "behavioral",
    label: "Behavioral",
    description: "STAR-format questions about leadership, conflict resolution, and decision-making",
    icon: (
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    duration: "15–20 min",
    questions: "4–6 questions",
    color: c.gilt,
    sampleQuestions: [
      "Tell me about a time you had to make a difficult technical decision that impacted your team's roadmap.",
      "Describe a situation where you had to scale your engineering organization.",
    ],
  },
  {
    id: "strategic",
    label: "Strategic",
    description: "Roadmap planning, stakeholder alignment, and organizational strategy",
    icon: (
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
    duration: "20–25 min",
    questions: "3–5 questions",
    color: c.sage,
    sampleQuestions: [
      "How would you approach building a 3-year technical strategy for an aging stack?",
      "Tell me about a time you had to pivot a major initiative based on changing business conditions.",
    ],
  },
  {
    id: "technical",
    label: "Technical Leadership",
    description: "System design decisions, architecture trade-offs, and technical team management",
    icon: (
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    duration: "20–30 min",
    questions: "3–4 questions",
    color: c.ember,
    sampleQuestions: [
      "Describe a system you designed that had to handle 10x growth in traffic.",
      "Tell me about a major production incident you led the response for.",
    ],
  },
  {
    id: "case-study",
    label: "Case Study",
    description: "Real-world engineering scenarios: diagnose, strategize, and present solutions",
    icon: (
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    duration: "25–35 min",
    questions: "1–2 deep dives",
    color: c.slate,
    sampleQuestions: [
      "Your core API has 99.95% uptime but customers are churning citing 'reliability issues.' How would you investigate?",
      "A competitor launched a feature in 2 months; your team estimates 6. The CEO wants it in 3. How do you handle this?",
    ],
  },
];

/* ─── Focus Areas ─── */
const focusAreas = [
  { id: "star", label: "STAR Structure", description: "Practice structured storytelling" },
  { id: "impact", label: "Business Impact", description: "Quantify outcomes with metrics" },
  { id: "leadership", label: "Leadership Presence", description: "Executive-level communication" },
  { id: "stakeholder", label: "Stakeholder Mgmt", description: "Navigate org dynamics" },
  { id: "delegation", label: "Delegation", description: "Empower your team" },
  { id: "general", label: "General Practice", description: "Well-rounded session" },
];

/* ─── Difficulty Levels ─── */
const difficulties = [
  { id: "warmup", label: "Warm-up", description: "Friendly pace, generous prompts", color: c.sage },
  { id: "standard", label: "Standard", description: "Typical interview pressure", color: c.gilt },
  { id: "intense", label: "Intense", description: "Tough follow-ups, time pressure", color: c.ember },
];

/* ─── Waveform for mic test ─── */
function MicTestWaveform({ stream }: { stream: MediaStream | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!stream || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 64;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      analyser.getByteFrequencyData(data);
      const w = canvasRef.current!.width;
      const h = canvasRef.current!.height;
      ctx.clearRect(0, 0, w, h);

      const barW = w / data.length - 2;
      data.forEach((val, i) => {
        const barH = (val / 255) * h * 0.9;
        const x = i * (barW + 2);
        const y = (h - barH) / 2;

        ctx.fillStyle = c.gilt;
        ctx.globalAlpha = 0.6 + (val / 255) * 0.4;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      source.disconnect();
      audioCtx.close();
    };
  }, [stream]);

  return (
    <canvas ref={canvasRef} width={240} height={48}
      style={{ display: "block", borderRadius: 8, background: "rgba(201,169,110,0.03)", border: `1px solid ${c.border}` }}
    />
  );
}

/* ═══════════════════════════════════════════════
   SESSION SETUP
   ═══════════════════════════════════════════════ */
// Check for a saved interview draft (less than 2 hours old)
function loadDraft(userId?: string): { type: string; difficulty: string; focus: string; elapsed: number; savedAt: number } | null {
  try {
    const key = `hireready_interview_draft_${userId || "anon"}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft.savedAt || Date.now() - draft.savedAt > 2 * 60 * 60 * 1000) {
      localStorage.removeItem(key);
      return null;
    }
    // Skip drafts with negligible progress (< 10 seconds elapsed)
    if (!draft.elapsed || draft.elapsed < 10) {
      localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch { return null; }
}

export default function SessionSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const preselectedType = searchParams.get("type");
  const suggested = getSuggestedDifficulty();
  const [draft] = useState(() => loadDraft(user?.id));
  const [showDraftBanner, setShowDraftBanner] = useState(!!draft);

  // Steps: 1 = type + focus, 2 = difficulty, 3 = mic/camera check
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState(preselectedType || "");
  const [selectedFocus, setSelectedFocus] = useState("general");
  const [targetCompany, setTargetCompany] = useState(user?.targetCompany || "");
  const [difficulty, setDifficulty] = useState(suggested.id);

  // Mic/Camera check
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [micStatus, setMicStatus] = useState<"idle" | "testing" | "ready" | "error">("idle");
  const [camStatus, setCamStatus] = useState<"idle" | "testing" | "ready" | "error">("idle");
  const videoRef = useRef<HTMLVideoElement>(null);

  // Countdown before interview starts
  const [countdown, setCountdown] = useState<number | null>(null);

  const canProceedStep1 = !!selectedType;
  const canProceedStep2 = true; // difficulty always has a default
  const canProceedStep3 = micStatus === "ready" || micStatus === "error"; // can proceed even if mic fails

  const selectedTypeData = interviewTypes.find(t => t.id === selectedType);

  const [micError, setMicError] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);

  // Test microphone
  const testMic = async () => {
    setMicStatus("testing");
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(stream);
      setMicStatus("ready");
    } catch (err: any) {
      setMicStatus("error");
      if (err.name === "NotAllowedError") setMicError("Microphone access denied. Please allow mic access in your browser settings.");
      else if (err.name === "NotFoundError") setMicError("No microphone found. Please connect a mic and try again.");
      else setMicError("Microphone unavailable. You can still proceed without audio.");
    }
  };

  // Test camera
  const testCamera = async () => {
    setCamStatus("testing");
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setVideoStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCamStatus("ready");
    } catch (err: any) {
      setCamStatus("error");
      if (err.name === "NotAllowedError") setCamError("Camera access denied. Please allow camera access in your browser settings.");
      else if (err.name === "NotFoundError") setCamError("No camera found on this device.");
      else setCamError("Camera unavailable. You can proceed without video.");
    }
  };

  // Cleanup streams on unmount
  useEffect(() => {
    return () => {
      micStream?.getTracks().forEach(t => t.stop());
      videoStream?.getTracks().forEach(t => t.stop());
    };
  }, [micStream, videoStream]);

  // Launch interview with countdown
  const handleLaunch = () => {
    track("session_start", { type: selectedType, difficulty, focus: selectedFocus });
    // Stop test streams before navigating
    micStream?.getTracks().forEach(t => t.stop());
    videoStream?.getTracks().forEach(t => t.stop());

    setCountdown(3);
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      navigate(`/interview?type=${selectedType}&focus=${selectedFocus}&difficulty=${difficulty}${targetCompany ? `&company=${encodeURIComponent(targetCompany)}` : ""}`);
      return;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, navigate, selectedType, selectedFocus, difficulty]);

  return (
    <div style={{
      minHeight: "100vh", background: c.obsidian,
      display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes countPulse { 0% { transform: scale(0.8); opacity: 0; } 50% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
      `}</style>

      {/* Draft recovery banner */}
      {showDraftBanner && draft && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
          padding: "14px 24px", background: "rgba(201,169,110,0.1)",
          borderBottom: `1px solid rgba(201,169,110,0.2)`,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
          backdropFilter: "blur(8px)",
        }}>
          <span style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory }}>
            You have an unfinished <strong>{draft.type}</strong> session ({Math.floor(draft.elapsed / 60)}m {draft.elapsed % 60}s in).
          </span>
          <button onClick={() => {
            navigate(`/interview?type=${draft.type}&difficulty=${draft.difficulty}&focus=${draft.focus || "general"}&resume=true`);
          }} style={{
            padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer",
            background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian,
            fontFamily: font.ui, fontSize: 12, fontWeight: 600,
          }}>Resume</button>
          <button onClick={() => {
            localStorage.removeItem(`hireready_interview_draft_${user?.id || "anon"}`);
            setShowDraftBanner(false);
          }} style={{
            padding: "6px 16px", borderRadius: 6, cursor: "pointer",
            background: "transparent", border: `1px solid ${c.border}`, color: c.stone,
            fontFamily: font.ui, fontSize: 12, fontWeight: 500,
          }}>Discard</button>
        </div>
      )}

      {/* Countdown overlay */}
      {countdown !== null && (
        <div onClick={(e) => e.stopPropagation()} style={{
          position: "fixed", inset: 0, zIndex: 100,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "rgba(5,5,6,0.95)", backdropFilter: "blur(8px)",
        }}>
          <div key={countdown} style={{ animation: "countPulse 0.5s ease" }}>
            <span style={{
              fontFamily: font.display, fontSize: 120, fontWeight: 400, color: c.gilt,
              lineHeight: 1, display: "block", textAlign: "center",
              textShadow: "0 0 60px rgba(201,169,110,0.3)",
            }}>
              {countdown === 0 ? "" : countdown}
            </span>
          </div>
          <p style={{ fontFamily: font.ui, fontSize: 16, color: c.stone, marginTop: 24 }}>
            {countdown === 0 ? "Starting interview..." : "Get ready..."}
          </p>
        </div>
      )}

      {/* Top bar */}
      <header style={{
        width: "100%", padding: "16px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: `1px solid ${c.border}`,
      }}>
        <button onClick={() => navigate("/dashboard")}
          style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: font.ui, fontSize: 13, color: c.stone, background: "none", border: "none", cursor: "pointer", outline: "none" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = c.ivory; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; }}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back to Dashboard
        </button>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: step >= s ? (step === s ? c.gilt : c.sage) : "transparent",
                border: `1.5px solid ${step >= s ? (step === s ? c.gilt : c.sage) : c.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.3s ease",
              }}>
                {step > s ? (
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.obsidian} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                ) : (
                  <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: step === s ? c.obsidian : c.stone }}>{s}</span>
                )}
              </div>
              {s < 3 && <div style={{ width: 32, height: 1.5, background: step > s ? c.sage : c.border, borderRadius: 1, transition: "background 0.3s ease" }} />}
            </div>
          ))}
        </div>

        <div style={{ width: 120 }} /> {/* spacer */}
      </header>

      {/* Content */}
      <div style={{ flex: 1, width: "100%", maxWidth: 720, padding: "40px 24px 80px", animation: "fadeUp 0.3s ease" }}>

        {/* ─── Step 1: Interview Type + Focus ─── */}
        {step === 1 && (
          <div>
            <h1 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, marginBottom: 8, letterSpacing: "-0.02em" }}>
              Choose your interview type
            </h1>
            <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, marginBottom: 32, lineHeight: 1.6 }}>
              Select the type of interview you want to practice. Each type focuses on different skills and question formats.
            </p>

            {/* Type cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 40 }}>
              {interviewTypes.map(type => (
                <button key={type.id}
                  aria-label={`${type.label} interview: ${type.description}`}
                  aria-pressed={selectedType === type.id}
                  onClick={() => setSelectedType(type.id)}
                  style={{
                    padding: "20px", borderRadius: 14, textAlign: "left", cursor: "pointer",
                    background: selectedType === type.id ? `rgba(${type.color === c.gilt ? "201,169,110" : type.color === c.sage ? "122,158,126" : type.color === c.ember ? "196,112,90" : "91,103,112"},0.06)` : c.graphite,
                    border: `1.5px solid ${selectedType === type.id ? type.color : c.border}`,
                    transition: "all 0.2s ease", outline: "none",
                    boxShadow: selectedType === type.id ? `0 0 0 3px ${type.color}15` : "none",
                  }}
                  onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px ${c.gilt}40`}
                  onBlur={(e) => e.currentTarget.style.boxShadow = selectedType === type.id ? `0 0 0 3px ${type.color}15` : "none"}
                  onMouseEnter={(e) => { if (selectedType !== type.id) e.currentTarget.style.borderColor = c.borderHover; }}
                  onMouseLeave={(e) => { if (selectedType !== type.id) e.currentTarget.style.borderColor = c.border; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ color: type.color }}>{type.icon}</div>
                    {selectedType === type.id && (
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: type.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.obsidian} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      </div>
                    )}
                  </div>
                  <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>{type.label}</h3>
                  <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, lineHeight: 1.5, marginBottom: 10 }}>{type.description}</p>
                  <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: c.chalk }}>{type.duration}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>{type.questions}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Sample questions preview */}
            {selectedTypeData && (
              <div style={{
                marginBottom: 32, padding: "14px 18px", borderRadius: 10,
                background: `rgba(${selectedTypeData.color === c.gilt ? "201,169,110" : selectedTypeData.color === c.sage ? "122,158,126" : selectedTypeData.color === c.ember ? "196,112,90" : "91,103,112"},0.04)`,
                border: `1px solid ${c.border}`,
              }}>
                <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                  Sample questions
                </p>
                {selectedTypeData.sampleQuestions.map((q, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: i < selectedTypeData.sampleQuestions.length - 1 ? 8 : 0 }}>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: selectedTypeData.color, marginTop: 3, flexShrink: 0 }}>{i + 1}.</span>
                    <p style={{ fontFamily: font.ui, fontSize: 12.5, color: c.chalk, lineHeight: 1.5, fontStyle: "italic", margin: 0 }}>"{q}"</p>
                  </div>
                ))}
              </div>
            )}

            {/* Focus area */}
            <h2 style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Focus area <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 400, color: c.stone }}>(optional)</span></h2>
            <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 16 }}>The AI will emphasize this skill in its evaluation and feedback.</p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {focusAreas.map(area => (
                <button key={area.id}
                  onClick={() => setSelectedFocus(area.id)}
                  style={{
                    padding: "8px 16px", borderRadius: 100, cursor: "pointer",
                    background: selectedFocus === area.id ? "rgba(201,169,110,0.1)" : "transparent",
                    border: `1px solid ${selectedFocus === area.id ? c.gilt : c.border}`,
                    color: selectedFocus === area.id ? c.gilt : c.stone,
                    fontFamily: font.ui, fontSize: 12, fontWeight: 500,
                    transition: "all 0.2s ease", outline: "none",
                  }}
                  onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px ${c.gilt}40`}
                  onBlur={(e) => e.currentTarget.style.boxShadow = "none"}
                  title={area.description}
                >
                  {area.label}
                </button>
              ))}
            </div>

            {/* Target company */}
            <div style={{ marginTop: 28 }}>
              <h2 style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Target company <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 400, color: c.stone }}>(optional)</span></h2>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 12 }}>The AI will tailor questions to this company's interview style and culture.</p>
              <input
                type="text"
                placeholder="e.g. Google, Amazon, Stripe..."
                value={targetCompany}
                onChange={(e) => setTargetCompany(e.target.value)}
                style={{
                  width: "100%", maxWidth: 360, padding: "10px 16px", borderRadius: 8,
                  background: c.graphite, border: `1px solid ${c.border}`, color: c.ivory,
                  fontFamily: font.ui, fontSize: 13, outline: "none", boxSizing: "border-box",
                  transition: "border-color 0.2s ease",
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
                onBlur={(e) => e.currentTarget.style.borderColor = c.border}
              />
            </div>
          </div>
        )}

        {/* ─── Step 2: Difficulty ─── */}
        {step === 2 && (
          <div>
            <h1 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, marginBottom: 8, letterSpacing: "-0.02em" }}>
              Set your difficulty
            </h1>
            <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, marginBottom: 16, lineHeight: 1.6 }}>
              Choose how challenging you want the interview to be. Higher difficulty means tougher follow-ups and stricter time expectations.
            </p>

            {/* Adaptive suggestion */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 10, background: "rgba(201,169,110,0.04)", border: `1px solid rgba(201,169,110,0.12)`, marginBottom: 24 }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/></svg>
              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>
                <span style={{ fontWeight: 600, color: c.gilt }}>Recommended: {difficulties.find(d => d.id === suggested.id)?.label}</span>
                {" — "}{suggested.reason}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 40 }}>
              {difficulties.map(d => (
                <button key={d.id}
                  aria-label={`${d.label} difficulty: ${d.description}`}
                  aria-pressed={difficulty === d.id}
                  onClick={() => setDifficulty(d.id)}
                  style={{
                    padding: "20px 24px", borderRadius: 14, textAlign: "left", cursor: "pointer",
                    background: difficulty === d.id ? `rgba(${d.color === c.sage ? "122,158,126" : d.color === c.gilt ? "201,169,110" : "196,112,90"},0.04)` : c.graphite,
                    border: `1.5px solid ${difficulty === d.id ? d.color : c.border}`,
                    display: "flex", alignItems: "center", gap: 20,
                    transition: "all 0.2s ease", outline: "none",
                  }}
                  onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px ${c.gilt}40`}
                  onBlur={(e) => e.currentTarget.style.boxShadow = "none"}
                  onMouseEnter={(e) => { if (difficulty !== d.id) e.currentTarget.style.borderColor = c.borderHover; }}
                  onMouseLeave={(e) => { if (difficulty !== d.id) e.currentTarget.style.borderColor = c.border; }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: `rgba(${d.color === c.sage ? "122,158,126" : d.color === c.gilt ? "201,169,110" : "196,112,90"},0.08)`,
                    border: `1px solid ${d.color}30`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {d.id === "warmup" && <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={d.color} strokeWidth="1.5" strokeLinecap="round"><path d="M12 3v1m0 16v1m-8-9h1m16 0h1M5.6 5.6l.7.7m11.4 11.4l.7.7M5.6 18.4l.7-.7m11.4-11.4l.7-.7"/><circle cx="12" cy="12" r="4"/></svg>}
                    {d.id === "standard" && <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={d.color} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
                    {d.id === "intense" && <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={d.color} strokeWidth="1.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, marginBottom: 2 }}>{d.label}</h3>
                    <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>{d.description}</p>
                  </div>
                  {difficulty === d.id && (
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: d.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.obsidian} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Session summary */}
            <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 24px" }}>
              <h3 style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.stone, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>Session Preview</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <div>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, display: "block", marginBottom: 4 }}>Type</span>
                  <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>{selectedTypeData?.label}</span>
                </div>
                <div>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, display: "block", marginBottom: 4 }}>Duration</span>
                  <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>{selectedTypeData?.duration}</span>
                </div>
                <div>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, display: "block", marginBottom: 4 }}>Focus</span>
                  <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>{focusAreas.find(f => f.id === selectedFocus)?.label}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Step 3: Mic & Camera Check ─── */}
        {step === 3 && (
          <div>
            <h1 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, marginBottom: 8, letterSpacing: "-0.02em" }}>
              Check your setup
            </h1>
            <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, marginBottom: 32, lineHeight: 1.6 }}>
              Test your microphone and camera before starting. This ensures the AI can hear and see you clearly.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 32 }}>
              {/* Mic check */}
              <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "28px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: micStatus === "ready" ? "rgba(122,158,126,0.08)" : micStatus === "error" ? "rgba(196,112,90,0.08)" : "rgba(201,169,110,0.06)",
                    border: `1px solid ${micStatus === "ready" ? "rgba(122,158,126,0.2)" : micStatus === "error" ? "rgba(196,112,90,0.2)" : "rgba(201,169,110,0.12)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={micStatus === "ready" ? c.sage : micStatus === "error" ? c.ember : c.gilt} strokeWidth="1.5" strokeLinecap="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                    </svg>
                  </div>
                  <div>
                    <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Microphone</h3>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: micStatus === "ready" ? c.sage : micStatus === "error" ? c.ember : c.stone }}>
                      {micStatus === "idle" ? "Not tested" : micStatus === "testing" ? "Testing..." : micStatus === "ready" ? "Working" : "Not available"}
                    </span>
                  </div>
                </div>

                {micStatus === "ready" && <MicTestWaveform stream={micStream} />}

                {micStatus !== "ready" && (
                  <button onClick={testMic}
                    style={{
                      width: "100%", padding: "10px", borderRadius: 8, cursor: "pointer",
                      fontFamily: font.ui, fontSize: 13, fontWeight: 500,
                      background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.15)`,
                      color: c.gilt, transition: "all 0.2s ease", outline: "none",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.12)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.06)"; }}
                  >
                    {micStatus === "error" ? "Retry Microphone" : "Test Microphone"}
                  </button>
                )}

                {micStatus === "error" && (
                  <>
                  <p style={{ fontFamily: font.ui, fontSize: 11, color: c.ember, marginTop: 10, lineHeight: 1.5, padding: "8px 12px", borderRadius: 6, background: "rgba(196,112,90,0.06)", border: "1px solid rgba(196,112,90,0.12)" }}>
                    {micError || "Microphone access was denied. You can still practice by typing your answers."}
                  </p>
                  <button
                    onClick={handleLaunch}
                    style={{
                      width: "100%", padding: "10px", borderRadius: 8, cursor: "pointer", marginTop: 8,
                      fontFamily: font.ui, fontSize: 12, fontWeight: 600,
                      background: "rgba(122,158,126,0.08)", border: `1px solid rgba(122,158,126,0.2)`,
                      color: c.sage, transition: "all 0.2s ease", outline: "none",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(122,158,126,0.15)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(122,158,126,0.08)"; }}
                  >
                    Continue without mic (you can type answers)
                  </button>
                  </>
                )}
              </div>

              {/* Camera check */}
              <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "28px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: camStatus === "ready" ? "rgba(122,158,126,0.08)" : camStatus === "error" ? "rgba(196,112,90,0.08)" : "rgba(201,169,110,0.06)",
                    border: `1px solid ${camStatus === "ready" ? "rgba(122,158,126,0.2)" : camStatus === "error" ? "rgba(196,112,90,0.2)" : "rgba(201,169,110,0.12)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={camStatus === "ready" ? c.sage : camStatus === "error" ? c.ember : c.gilt} strokeWidth="1.5" strokeLinecap="round">
                      <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" />
                    </svg>
                  </div>
                  <div>
                    <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Camera</h3>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: camStatus === "ready" ? c.sage : camStatus === "error" ? c.ember : c.stone }}>
                      {camStatus === "idle" ? "Not tested" : camStatus === "testing" ? "Testing..." : camStatus === "ready" ? "Working" : "Not available"}
                    </span>
                  </div>
                </div>

                {camStatus === "ready" ? (
                  <div style={{ borderRadius: 10, overflow: "hidden", height: 120, background: c.obsidian }}>
                    <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
                  </div>
                ) : (
                  <button onClick={testCamera}
                    style={{
                      width: "100%", padding: "10px", borderRadius: 8, cursor: "pointer",
                      fontFamily: font.ui, fontSize: 13, fontWeight: 500,
                      background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.15)`,
                      color: c.gilt, transition: "all 0.2s ease", outline: "none",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.12)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.06)"; }}
                  >
                    {camStatus === "error" ? "Retry Camera" : "Test Camera"}
                  </button>
                )}

                {camStatus === "error" && (
                  <p style={{ fontFamily: font.ui, fontSize: 11, color: c.ember, marginTop: 10, lineHeight: 1.5, padding: "8px 12px", borderRadius: 6, background: "rgba(196,112,90,0.06)", border: "1px solid rgba(196,112,90,0.12)" }}>
                    {camError || "Camera access was denied. The interview will work without video."}
                  </p>
                )}
              </div>
            </div>

            {/* Tips */}
            <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 24px" }}>
              <h3 style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, marginBottom: 12 }}>Quick Tips</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  "Find a quiet space — background noise affects AI evaluation",
                  "Look at the camera, not the screen — it simulates eye contact",
                  "Speak at a natural pace — rushing is the #1 mistake in mock interviews",
                  "Press Enter when you're done answering to move to the next question",
                ].map((tip, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" style={{ marginTop: 2, flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
                    <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.5 }}>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <footer style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        padding: "16px 32px",
        background: "rgba(10,10,11,0.9)", backdropFilter: "blur(12px)",
        borderTop: `1px solid ${c.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        zIndex: 10,
      }}>
        <button
          onClick={() => step > 1 ? setStep(step - 1) : navigate("/dashboard")}
          style={{
            fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.stone,
            background: "none", border: `1px solid ${c.border}`,
            borderRadius: 8, padding: "10px 24px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8,
            transition: "all 0.2s ease", outline: "none",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = c.ivory; e.currentTarget.style.borderColor = c.borderHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; e.currentTarget.style.borderColor = c.border; }}
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          {step === 1 ? "Cancel" : "Back"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Step {step} of 3</span>
        </div>

        {step < 3 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
            style={{
              fontFamily: font.ui, fontSize: 13, fontWeight: 500,
              padding: "10px 28px", borderRadius: 8, cursor: canProceedStep1 || step > 1 ? "pointer" : "not-allowed",
              background: (step === 1 ? canProceedStep1 : canProceedStep2) ? c.gilt : "rgba(201,169,110,0.15)",
              color: (step === 1 ? canProceedStep1 : canProceedStep2) ? c.obsidian : c.stone,
              border: "none",
              display: "flex", alignItems: "center", gap: 8,
              transition: "all 0.2s ease", outline: "none",
              opacity: (step === 1 ? canProceedStep1 : canProceedStep2) ? 1 : 0.5,
            }}
            onMouseEnter={(e) => { if (canProceedStep1 || step > 1) e.currentTarget.style.filter = "brightness(1.1)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
          >
            Continue
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        ) : (
          <button
            onClick={handleLaunch}
            className="shimmer-btn"
            style={{
              fontFamily: font.ui, fontSize: 14, fontWeight: 600,
              padding: "12px 32px", borderRadius: 8,
              background: c.gilt, color: c.obsidian, border: "none",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 8px 32px rgba(201,169,110,0.15)",
              transition: "all 0.2s ease", outline: "none",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21" /></svg>
            Start Interview
          </button>
        )}
      </footer>
    </div>
  );
}
