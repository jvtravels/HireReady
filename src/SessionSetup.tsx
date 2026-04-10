import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { track } from "@vercel/analytics";

import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { unlockAudio, prefetchTTS } from "./tts";
import { UpgradeModal } from "./dashboardComponents";

/* ─── Suggestions ─── */
const ROLE_SUGGESTIONS = [
  "Software Engineer", "Senior Software Engineer", "Staff Engineer", "Principal Engineer", "Lead Software Engineer",
  "Software Developer", "Senior Software Developer", "Application Developer", "Systems Engineer",
  "Frontend Developer", "Senior Frontend Developer", "React Developer", "Angular Developer", "Vue.js Developer",
  "Backend Developer", "Senior Backend Developer", "Java Developer", "Python Developer", "Node.js Developer", "Go Developer", ".NET Developer",
  "Full Stack Developer", "Senior Full Stack Developer", "MERN Stack Developer", "MEAN Stack Developer",
  "Mobile Developer", "iOS Developer", "Android Developer", "React Native Developer", "Flutter Developer",
  "Embedded Software Engineer", "Firmware Engineer", "C++ Developer", "Rust Developer",
  "DevOps Engineer", "Senior DevOps Engineer", "Site Reliability Engineer", "Cloud Engineer", "Cloud Architect",
  "Platform Engineer", "Infrastructure Engineer", "Network Engineer", "Systems Administrator",
  "Data Engineer", "Senior Data Engineer", "Data Architect",
  "Data Scientist", "Senior Data Scientist", "Research Scientist",
  "Data Analyst", "Senior Data Analyst", "Business Intelligence Analyst", "BI Developer",
  "Machine Learning Engineer", "Senior ML Engineer", "AI Engineer", "AI/ML Lead", "NLP Engineer",
  "QA Engineer", "Senior QA Engineer", "QA Lead", "Test Engineer", "SDET", "Automation Engineer",
  "Security Engineer", "Cybersecurity Analyst", "Penetration Tester", "Security Architect",
  "Tech Lead", "Engineering Manager", "Senior Engineering Manager", "Director of Engineering",
  "VP of Engineering", "Head of Engineering", "CTO",
  "Associate Product Manager", "Product Manager", "Senior Product Manager", "Lead Product Manager",
  "Group Product Manager", "Director of Product", "VP of Product", "Chief Product Officer",
  "Technical Product Manager", "Product Owner",
  "Product Designer", "Senior Product Designer", "UX Designer", "UI Designer", "UX/UI Designer",
  "UX Researcher", "Visual Designer", "Head of Design", "Design Manager",
  "Business Analyst", "Senior Business Analyst", "Management Consultant", "Strategy Consultant",
  "Project Manager", "Senior Project Manager", "Program Manager", "Technical Program Manager", "Scrum Master",
  "Operations Manager", "Supply Chain Manager", "Logistics Manager",
  "Marketing Manager", "Digital Marketing Manager", "Content Strategist", "Growth Manager",
  "Sales Executive", "Account Executive", "Business Development Manager",
  "HR Executive", "HR Manager", "Recruiter", "Technical Recruiter",
  "Financial Analyst", "CA", "Chartered Accountant", "Investment Banking Analyst",
  "Bank PO", "Relationship Manager", "Wealth Manager",
  "Legal Counsel", "Corporate Lawyer", "Company Secretary",
  "Teacher", "Lecturer", "Assistant Professor", "Professor",
  "Civil Engineer", "Mechanical Engineer", "Electrical Engineer",
  "CEO", "Co-founder", "Managing Director", "General Manager",
  "Software Engineer Intern", "Associate Software Engineer", "Junior Developer",
  "Graduate Engineer Trainee (GET)", "Management Trainee", "Fresher",
];

const COMPANY_SUGGESTIONS = [
  "Google", "Microsoft", "Amazon", "Meta", "Apple", "Netflix",
  "Adobe", "Oracle", "SAP", "Salesforce", "ServiceNow", "Intuit", "Atlassian",
  "IBM", "Cisco", "Intel", "NVIDIA", "Qualcomm",
  "LinkedIn", "Uber", "Spotify", "Airbnb", "Shopify",
  "Stripe", "PayPal", "Visa", "Mastercard",
  "GitHub", "GitLab", "Figma", "Notion", "Twilio",
  "OpenAI", "Anthropic", "Google DeepMind", "Scale AI",
  "Goldman Sachs", "JP Morgan", "Morgan Stanley", "Deutsche Bank", "Barclays",
  "TCS", "Infosys", "Wipro", "HCL Technologies", "Tech Mahindra",
  "Cognizant", "Capgemini", "Accenture", "Deloitte", "PwC", "EY", "KPMG",
  "Flipkart", "Meesho", "Nykaa", "Swiggy", "Zomato",
  "Razorpay", "PhonePe", "Paytm", "CRED", "Zerodha", "Groww",
  "Ola", "Delhivery", "Ather Energy",
  "Byju's", "Unacademy", "upGrad", "Physics Wallah", "Scaler",
  "Freshworks", "Zoho", "Postman", "BrowserStack",
  "MakeMyTrip", "OYO Rooms",
  "McKinsey", "BCG", "Bain",
  "Tata Group", "Reliance Industries", "Adani Group", "Mahindra Group",
  "HDFC Bank", "ICICI Bank", "SBI", "Kotak Mahindra Bank", "Axis Bank",
  "Bajaj Finance", "HDFC Life",
  "Hindustan Unilever (HUL)", "ITC", "Nestle India",
  "Jio (Reliance)", "Airtel (Bharti)",
  "Tata Motors", "Maruti Suzuki", "Mahindra & Mahindra",
  "L&T (Larsen & Toubro)", "BHEL", "ONGC", "NTPC",
  "Pre-seed / Seed Startup", "Series A Startup", "Series B Startup", "Enterprise / MNC", "Government / PSU",
];

function sampleDiverse(arr: string[], count: number): string[] {
  if (arr.length <= count) return arr;
  const step = Math.floor(arr.length / count);
  const result: string[] = [];
  for (let i = 0; i < count; i++) result.push(arr[i * step]);
  return result;
}

/* ─── Autocomplete Input ─── */
function AutocompleteInput({
  id, value, onChange, placeholder, suggestions, label, required, error,
}: {
  id: string; value: string; onChange: (v: string) => void; placeholder: string;
  suggestions: string[]; label?: string; required?: boolean; error?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [diverseSample] = useState(() => sampleDiverse(suggestions, 8));

  useEffect(() => { return () => { setFocused(false); }; }, []);

  const filtered = focused
    ? value.length > 0
      ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()).slice(0, 8)
      : diverseSample
    : [];

  useEffect(() => {
    if (filtered.length > 0 && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const pad = 8;
      let left = rect.left;
      let width = rect.width;
      if (width > vw - pad * 2) width = vw - pad * 2;
      if (left < pad) left = pad;
      if (left + width > vw - pad) left = vw - pad - width;
      const spaceBelow = window.innerHeight - rect.bottom - 4;
      const top = spaceBelow < 120 ? Math.max(pad, rect.top - 224) : rect.bottom + 4;
      setDropdownPos({ top, left, width });
    }
  }, [filtered.length, focused, value]);

  return (
    <div>
      {label && (
        <label htmlFor={id} style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 8 }}>
          {label} {required && <span style={{ color: c.ember }}>*</span>}
        </label>
      )}
      <input
        ref={inputRef} id={id} type="text" value={value}
        onChange={(e) => { onChange(e.target.value); setSelectedIdx(-1); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); setFocused(false); inputRef.current?.blur(); return; }
          if (filtered.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && selectedIdx >= 0) { e.preventDefault(); onChange(filtered[selectedIdx]); setFocused(false); }
        }}
        placeholder={placeholder} autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        style={{
          width: "100%", padding: "12px 16px", borderRadius: 10,
          background: c.graphite, border: `1.5px solid ${error ? c.ember : focused ? c.gilt : c.border}`,
          color: c.ivory, fontFamily: font.ui, fontSize: 14,
          outline: "none", transition: "border-color 0.2s", boxSizing: "border-box",
        }}
      />
      {error && <p id={`${id}-error`} role="alert" style={{ fontFamily: font.ui, fontSize: 11, color: c.ember, marginTop: 4 }}>{error}</p>}
      {filtered.length > 0 && dropdownPos && createPortal(
        <div role="listbox" style={{
          position: "fixed", top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999,
          background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)", maxHeight: 220, overflowY: "auto",
        }}>
          {filtered.map((s, i) => (
            <button key={s} role="option" aria-selected={i === selectedIdx} onMouseDown={() => { onChange(s); setFocused(false); }}
              style={{
                display: "block", width: "100%", padding: "10px 16px", border: "none", textAlign: "left",
                fontFamily: font.ui, fontSize: 13, cursor: "pointer",
                background: i === selectedIdx ? "rgba(212,179,127,0.08)" : "transparent",
                color: i === selectedIdx ? c.ivory : c.chalk,
              }}>
              {s}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ─── Draft recovery ─── */
function loadDraft(userId?: string): { type: string; difficulty: string; focus: string; elapsed: number; savedAt: number } | null {
  try {
    const key = `hirestepx_interview_draft_${userId || "anon"}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft.savedAt || Date.now() - draft.savedAt > 2 * 60 * 60 * 1000) { localStorage.removeItem(key); return null; }
    if (!draft.elapsed || draft.elapsed < 10) { localStorage.removeItem(key); return null; }
    return draft;
  } catch { return null; }
}

/* ─── Intro text for TTS pre-fetch ─── */
const introByType: Record<string, string> = {
  behavioral: "Hi! Welcome to your behavioral mock interview. I'm your AI interviewer today. We'll focus on leadership, decision-making, and conflict resolution. This will take about 15 minutes. Feel free to take your time. Ready?",
  strategic: "Welcome to your strategic interview session. Today we'll explore your vision-setting ability, roadmap thinking, and business alignment. Let's dive in — are you ready?",
  technical: "Welcome to your technical leadership interview. We'll focus on architecture decisions, system design at scale, and tech strategy. Ready to begin?",
  "case-study": "Welcome to your case study interview. I'll present you with business scenarios that test your analytical thinking and problem-solving frameworks. Let's start.",
};

/* Focus type → interview type mapping */
const focusToType: Record<string, string> = {
  "Behavioral": "behavioral",
  "Strategic": "strategic",
  "Technical Leadership": "technical",
  "Case Study": "case-study",
};

/* ═══════════════════════════════════════════════
   SESSION SETUP — 2-Step Flow (matches Onboarding)
   Step 1: Target Role + Company, Interview Focus, Session Length
   Step 2: Mic permission + Your Profile summary
   ═══════════════════════════════════════════════ */
const TOTAL_STEPS = 2;

export default function SessionSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const preselectedFocus = searchParams.get("type");
  const [draft] = useState(() => loadDraft(user?.id));
  const [showDraftBanner, setShowDraftBanner] = useState(!!draft);

  // Steps
  const [step, setStep] = useState(1);
  const [targetRole, setTargetRole] = useState(user?.targetRole || "");
  const [roleTouched, setRoleTouched] = useState(false);
  const [targetCompany, setTargetCompany] = useState(user?.targetCompany || "");
  const [interviewFocus, setInterviewFocus] = useState<string[]>(() => {
    if (preselectedFocus) {
      const match = Object.entries(focusToType).find(([, v]) => v === preselectedFocus);
      if (match) return [match[0]];
    }
    return ["Behavioral"];
  });
  const [sessionLength, setSessionLength] = useState("10m");
  const [interviewLanguage, setInterviewLanguage] = useState("en");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const isFreeUser = !user?.subscriptionTier || user.subscriptionTier === "free";

  // Mic check
  const [micStatus, setMicStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [micLevel, setMicLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);

  // Launch
  const [starting, setStarting] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [saveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [useResume, setUseResume] = useState(true);
  const [jobDescription, setJobDescription] = useState("");

  const canProceedStep1 = !!targetRole.trim() && interviewFocus.length > 0;

  const audioCtxRef = useRef<AudioContext | null>(null);
  const requestMic = useCallback(async () => {
    setMicStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicStatus("granted");
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const poll = () => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(poll);
      };
      poll();
    } catch { setMicStatus("denied"); }
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // Launch interview
  const handleStart = () => {
    setStarting(true);
    unlockAudio();
    const focusType = focusToType[interviewFocus[0]] || "behavioral";
    track("session_start", { type: focusType, role: targetRole, sessionLength });
    streamRef.current?.getTracks().forEach(t => t.stop());
    const introText = introByType[focusType] || introByType.behavioral;
    prefetchTTS(introText);
    setLaunching(true);
    setCountdown(3);
    setTimeout(() => setCountdown(2), 1000);
    setTimeout(() => setCountdown(1), 2000);
    setTimeout(() => {
      setCountdown(0);
      navigate(`/interview?type=${focusType}&focus=${focusType}&difficulty=standard${targetCompany ? `&company=${encodeURIComponent(targetCompany)}` : ""}&role=${encodeURIComponent(targetRole)}&length=${sessionLength}${useResume ? "" : "&useResume=false"}${interviewLanguage !== "en" ? `&language=${interviewLanguage}` : ""}${jobDescription.trim() ? `&jd=${encodeURIComponent(jobDescription.trim().slice(0, 2000))}` : ""}${micStatus === "denied" ? "&nomic=1" : ""}`);
    }, 3000);
  };

  const goBack = () => { if (step > 1) setStep(step - 1); else navigate("/dashboard"); };
  const goNext = () => { if (step < TOTAL_STEPS) setStep(step + 1); };

  const sessionLengthLabel = sessionLength === "10m" ? "10 minutes" : sessionLength === "25m" ? "25 minutes" : "15 minutes";

  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, display: "flex", flexDirection: "column" }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes launchIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes launchPulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.08); opacity: 0.85; } }
        @keyframes countdownPop { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes countdownFade { 0% { opacity: 1; transform: scale(1); } 80% { opacity: 1; } 100% { opacity: 0.6; transform: scale(0.95); } }
        .ob-card { background: ${c.graphite}; border: 1px solid ${c.border}; }
        .ob-mic-pulse { animation: pulse 2s ease-in-out infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .ob-s2-role-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .ob-s2-focus-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .ob-s2-session-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        @media (max-width: 600px) {
          .ob-s2-role-grid { grid-template-columns: 1fr !important; }
          .ob-s2-focus-grid { grid-template-columns: 1fr 1fr !important; }
          .ob-s2-session-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Draft recovery banner */}
      {showDraftBanner && draft && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
          padding: "14px 24px", background: "rgba(212,179,127,0.1)",
          borderBottom: `1px solid rgba(212,179,127,0.2)`,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
          backdropFilter: "blur(8px)",
        }}>
          <span style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory }}>
            You have an unfinished <strong>{draft.type}</strong> session ({Math.floor(draft.elapsed / 60)}m {draft.elapsed % 60}s in).
          </span>
          <button onClick={() => {
            unlockAudio();
            navigate(`/interview?type=${draft.type}&difficulty=${draft.difficulty}&focus=${draft.focus || "general"}&resume=true`);
          }} style={{
            padding: "6px 16px", borderRadius: 10, border: "none", cursor: "pointer",
            background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian,
            fontFamily: font.ui, fontSize: 12, fontWeight: 600,
          }}>Resume</button>
          <button onClick={() => {
            localStorage.removeItem(`hirestepx_interview_draft_${user?.id || "anon"}`);
            setShowDraftBanner(false);
          }} style={{
            padding: "6px 16px", borderRadius: 10, cursor: "pointer",
            background: "transparent", border: `1px solid ${c.border}`, color: c.stone,
            fontFamily: font.ui, fontSize: 12, fontWeight: 500,
          }}>Discard</button>
        </div>
      )}

      {/* ─── Top Bar (matches Onboarding) ─── */}
      <div style={{ padding: "18px 40px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", borderBottom: `1px solid rgba(245,242,237,0.04)`, background: "rgba(6,6,7,0.6)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", zIndex: 10 }}>
        {/* Logo */}
        <div onClick={() => navigate("/dashboard")} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} title="Back to dashboard">
          <div style={{ width: 6, height: 6, borderRadius: 2, background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, boxShadow: "0 0 8px rgba(212,179,127,0.3)" }} />
          <span style={{ fontFamily: font.display, fontSize: 17, fontWeight: 400, color: c.ivory, letterSpacing: "0.02em" }}>HireStepX</span>
        </div>
        {/* Stepper */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {["Session", "Ready"].map((label, i) => {
            const stepNum = i + 1;
            const isCompleted = step > stepNum;
            const isCurrent = step === stepNum;
            const canClick = isCompleted;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  onClick={canClick ? () => setStep(stepNum) : undefined}
                  style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: isCompleted ? `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})` : isCurrent ? "rgba(212,179,127,0.1)" : "transparent",
                    border: `1.5px solid ${step >= stepNum ? c.gilt : "rgba(245,242,237,0.08)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                    boxShadow: isCurrent ? "0 0 12px rgba(212,179,127,0.15)" : "none",
                    cursor: canClick ? "pointer" : "default",
                  }}>
                  {isCompleted ? (
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.obsidian} strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: isCurrent ? c.gilt : c.stone }}>{stepNum}</span>
                  )}
                </div>
                <span
                  onClick={canClick ? () => setStep(stepNum) : undefined}
                  style={{ fontFamily: font.ui, fontSize: 11, color: isCurrent ? c.ivory : c.stone, fontWeight: isCurrent ? 500 : 400, cursor: canClick ? "pointer" : "default" }}>{label}</span>
                {i < 1 && <div style={{ width: 24, height: 1, background: isCompleted ? `linear-gradient(90deg, ${c.gilt}, rgba(212,179,127,0.2))` : "rgba(245,242,237,0.06)", transition: "background 0.4s", borderRadius: 1 }} />}
              </div>
            );
          })}
        </div>
        <div />
      </div>

      {/* ─── Content ─── */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 32px", overflow: "auto" }}>
        <div key={step} style={{ width: "100%", maxWidth: step === 2 ? "min(680px, calc(100vw - 32px))" : "min(960px, calc(100vw - 32px))", transition: "max-width 0.4s ease", animation: "fadeUp 0.3s ease" }}>

          {/* ════════════════ STEP 1: Set up your session ════════════════ */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom: 32 }} className="fade-up-1">
                <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 1 — Your Session</p>
                <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 10 }}>
                  Set up your practice session
                </h2>
                <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7 }}>
                  Choose your target role, interview focus, and session length. AI will tailor questions to your profile.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {/* ── Section 1: Role & Company ── */}
                <div className="ob-card fade-up-1" style={{ borderRadius: 16, padding: "24px 28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Target Role</span>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, fontWeight: 400, marginLeft: 4 }}>— AI tailors questions to this role</span>
                  </div>
                  <div className="ob-s2-role-grid">
                    <div>
                      <AutocompleteInput id="setup-role" value={targetRole} onChange={(v) => { setTargetRole(v); setRoleTouched(true); }} suggestions={ROLE_SUGGESTIONS} placeholder="e.g. Senior Engineering Manager..." label="Role" required error={roleTouched && !targetRole.trim() ? "Required to personalize your questions" : undefined} />
                    </div>
                    <div>
                      <AutocompleteInput id="setup-company" value={targetCompany} onChange={setTargetCompany} suggestions={COMPANY_SUGGESTIONS} placeholder="e.g. Google, Stripe..." label="Company (optional)" />
                    </div>
                  </div>
                </div>

                {/* ── Section 2: Interview Focus ── */}
                <div className="ob-card fade-up-2" style={{ borderRadius: 16, padding: "24px 28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Interview Focus <span style={{ color: c.ember, fontWeight: 400 }}>*</span></span>
                  </div>
                  <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginBottom: 16, paddingLeft: 36 }}>Choose what you want to practice. AI will prepare questions based on your selection.</p>
                  <div className="ob-s2-focus-grid">
                    {[
                      { value: "Behavioral", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, desc: "Leadership, decision-making, conflict resolution" },
                      { value: "Strategic", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>, desc: "Vision, roadmap, business alignment" },
                      { value: "Technical Leadership", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>, desc: "Architecture, system design, tech strategy" },
                      { value: "Case Study", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, desc: "Problem-solving, analytical frameworks" },
                    ].map(opt => {
                      const sel = interviewFocus[0] === opt.value;
                      return (
                        <button key={opt.value} className="ob-focus-card" onClick={() => setInterviewFocus([opt.value])}
                          style={{
                            padding: "14px 18px", borderRadius: 12, cursor: "pointer", transition: "all 0.2s ease", textAlign: "left",
                            background: sel ? "rgba(212,179,127,0.08)" : "transparent",
                            border: `1.5px solid ${sel ? c.gilt : c.border}`,
                            boxShadow: sel ? "0 0 16px rgba(212,179,127,0.06)" : "none",
                            display: "flex", alignItems: "center", gap: 12, color: sel ? c.gilt : c.stone,
                          }}>
                          <div style={{ width: 36, height: 36, borderRadius: 9, background: sel ? "rgba(212,179,127,0.1)" : "rgba(245,242,237,0.03)", border: `1px solid ${sel ? "rgba(212,179,127,0.2)" : "rgba(245,242,237,0.06)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {opt.icon}
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, display: "block" }}>{opt.value}</span>
                            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, lineHeight: 1.4 }}>{opt.desc}</span>
                          </div>
                          <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${sel ? c.gilt : "rgba(245,242,237,0.12)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {sel && <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.gilt }} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Section 3: Session Length ── */}
                <div className="ob-card fade-up-3" style={{ borderRadius: 16, padding: "24px 28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Session Length</span>
                  </div>
                  <div className="ob-s2-session-grid">
                    {[
                      { value: "10m", label: "10 min", desc: "Quick practice", sub: "2–3 questions", paidOnly: false },
                      { value: "15m", label: "15 min", desc: "Standard session", sub: "4–5 questions", recommended: true, paidOnly: true },
                      { value: "25m", label: "25 min", desc: "Deep dive", sub: "6–8 questions", paidOnly: true },
                    ].map(opt => {
                      const locked = opt.paidOnly && isFreeUser;
                      const sel = sessionLength === opt.value;
                      return (
                        <button key={opt.value} onClick={() => { if (locked) setShowUpgradeModal(true); else setSessionLength(opt.value); }}
                          style={{
                            padding: "16px 14px", borderRadius: 12, cursor: "pointer", textAlign: "center", position: "relative",
                            background: sel ? "rgba(212,179,127,0.08)" : "transparent",
                            border: `1.5px solid ${sel ? c.gilt : c.border}`,
                            boxShadow: sel ? "0 0 16px rgba(212,179,127,0.06)" : "none",
                            transition: "all 0.2s", opacity: locked ? 0.5 : 1,
                          }}>
                          {"recommended" in opt && opt.recommended && !locked && (
                            <span style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", fontFamily: font.ui, fontSize: 9, fontWeight: 700, color: c.obsidian, background: c.gilt, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>Recommended</span>
                          )}
                          {locked && (
                            <span style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", fontFamily: font.ui, fontSize: 9, fontWeight: 700, color: c.gilt, background: "rgba(212,179,127,0.1)", border: "1px solid rgba(212,179,127,0.2)", padding: "2px 8px", borderRadius: 4, letterSpacing: "0.04em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 3 }}>
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                              Upgrade
                            </span>
                          )}
                          <span style={{ fontFamily: font.ui, fontSize: 20, fontWeight: 600, color: sel ? c.gilt : c.ivory, display: "block", marginBottom: 2 }}>{opt.label}</span>
                          <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: sel ? c.ivory : c.chalk, display: "block", marginBottom: 2 }}>{opt.desc}</span>
                          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{opt.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Section 4: Interview Language ── */}
                <div className="ob-card fade-up-4" style={{ borderRadius: 16, padding: "24px 28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Interview Language</span>
                  </div>
                  <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginBottom: 16, paddingLeft: 36 }}>Choose the language for your interview. AI will ask and evaluate in your selected language.</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, paddingLeft: 36 }}>
                    {[
                      { value: "en", label: "English", desc: "Default" },
                      { value: "hi", label: "Hindi", desc: "हिन्दी" },
                      { value: "hinglish", label: "Hinglish", desc: "Hindi + English" },
                    ].map(opt => {
                      const sel = interviewLanguage === opt.value;
                      return (
                        <button key={opt.value} onClick={() => setInterviewLanguage(opt.value)}
                          style={{
                            padding: "14px 12px", borderRadius: 12, cursor: "pointer", textAlign: "center", position: "relative",
                            background: sel ? "rgba(212,179,127,0.08)" : "transparent",
                            border: `1.5px solid ${sel ? c.gilt : c.border}`,
                            boxShadow: sel ? "0 0 16px rgba(212,179,127,0.06)" : "none",
                            transition: "all 0.2s",
                          }}>
                          <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: sel ? c.gilt : c.ivory, display: "block", marginBottom: 2 }}>{opt.label}</span>
                          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{opt.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════ STEP 2: Permissions & Review ════════════════ */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: 32 }} className="fade-up-1">
                <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 2 — Almost There</p>
                <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 10 }}>
                  Allow permissions & review
                </h2>
                <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7 }}>
                  We need microphone access for the interview. Review your profile below, then you're ready to go.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* ── Mic Permission — compact inline bar ── */}
                <div className={`ob-card fade-up-1 ${micStatus !== "granted" ? "ob-mic-pulse" : ""}`} style={{
                  borderRadius: 12, padding: "14px 20px",
                  display: "flex", alignItems: "center", gap: 14,
                  border: `1px solid ${micStatus === "granted" ? "rgba(122,158,126,0.15)" : "rgba(212,179,127,0.15)"}`,
                  background: micStatus === "granted" ? "rgba(122,158,126,0.03)" : undefined,
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: micStatus === "granted" ? "rgba(122,158,126,0.08)" : "rgba(245,242,237,0.03)", border: `1px solid ${micStatus === "granted" ? "rgba(122,158,126,0.2)" : "rgba(245,242,237,0.06)"}` }}>
                    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={micStatus === "granted" ? c.sage : c.stone} strokeWidth="1.5" strokeLinecap="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: micStatus === "granted" ? c.sage : c.ivory }}>
                      {micStatus === "granted" ? "Microphone connected" : micStatus === "denied" ? "Mic denied — you can type instead" : "Microphone"}
                    </span>
                    {micStatus === "granted" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <div style={{ width: 60, height: 3, borderRadius: 2, background: "rgba(245,242,237,0.06)", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 2, background: c.sage, width: `${Math.max(5, micLevel)}%`, transition: "width 0.1s" }} />
                        </div>
                        <span style={{ fontFamily: font.ui, fontSize: 9, color: c.sage }}>Live</span>
                      </div>
                    )}
                  </div>
                  {micStatus !== "granted" && (
                    <button onClick={requestMic}
                      style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.gilt, background: "rgba(212,179,127,0.08)", border: `1px solid rgba(212,179,127,0.2)`, borderRadius: 8, padding: "7px 16px", cursor: "pointer", transition: "all 0.2s", flexShrink: 0 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.15)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.08)"; }}>
                      {micStatus === "requesting" ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 12, height: 12, border: "2px solid rgba(212,179,127,0.3)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                          Requesting...
                        </span>
                      ) : micStatus === "denied" ? "Retry" : "Allow"}
                    </button>
                  )}
                </div>

                {/* ── Your Profile Card ── */}
                <div className="ob-card fade-up-2" style={{ borderRadius: 16, padding: "24px 28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Your Profile</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {[
                      { label: "Name", value: user?.name?.trim() || "Not set", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>, editStep: 0 },
                      { label: "Resume", value: user?.resumeFileName || "Not uploaded", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>, editStep: 0 },
                      { label: "Target Role", value: targetRole || "Not set", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>, editStep: 1 },
                      { label: "Target Company", value: targetCompany || "Exploring", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="15" y2="14"/></svg>, editStep: 1 },
                      { label: "Interview Focus", value: interviewFocus.length > 0 ? interviewFocus.join(", ") : "None selected", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, editStep: 1 },
                      { label: "Session Length", value: sessionLengthLabel, icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, editStep: 1 },
                    ].map((item, i, arr) => (
                      <div key={item.label}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                            <span style={{ flexShrink: 0, display: "flex" }}>{item.icon}</span>
                            <span style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, flexShrink: 0 }}>{item.label}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: item.value === "Not set" || item.value === "Not uploaded" || item.value === "None selected" ? "rgba(154,149,144,0.5)" : c.ivory, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>
                              {item.value}
                            </span>
                            {item.editStep > 0 && (
                              <button
                                onClick={() => setStep(item.editStep)}
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", opacity: 0.3, transition: "opacity 0.2s" }}
                                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.3"; }}
                                aria-label={`Edit ${item.label}`}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                            )}
                          </div>
                        </div>
                        {i < arr.length - 1 && <div style={{ height: 1, background: "rgba(245,242,237,0.04)" }} />}
                      </div>
                    ))}
                  </div>
                  {user?.resumeText && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 10, background: "rgba(245,242,237,0.02)", border: `1px solid ${c.border}`, marginTop: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>Use resume for personalized questions</span>
                      </div>
                      <div onClick={() => setUseResume(!useResume)} style={{
                        width: 36, height: 20, borderRadius: 10, padding: 2,
                        background: useResume ? c.sage : c.border,
                        transition: "background 0.2s", cursor: "pointer",
                      }}>
                        <div style={{ width: 16, height: 16, borderRadius: "50%", background: c.ivory, transform: useResume ? "translateX(16px)" : "translateX(0)", transition: "transform 0.2s" }} />
                      </div>
                    </div>
                  )}

                  {/* Job Description Paste */}
                  <div style={{ marginTop: 16 }}>
                    <div onClick={() => setJobDescription(prev => prev || " ")} style={{
                      display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "10px 0",
                    }}>
                      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                      </svg>
                      <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>
                        {jobDescription.trim() ? "Job description added" : "Paste a job description (optional)"}
                      </span>
                      {jobDescription.trim() && <span style={{ fontFamily: font.ui, fontSize: 10, color: c.sage }}>&#10003;</span>}
                    </div>
                    {jobDescription !== "" && (
                      <textarea
                        value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value)}
                        placeholder="Paste the job posting here — questions will be tailored to this specific role..."
                        rows={4}
                        maxLength={2000}
                        style={{
                          width: "100%", fontFamily: font.ui, fontSize: 12, color: c.chalk,
                          background: "rgba(6,6,7,0.5)", border: `1px solid ${c.border}`,
                          borderRadius: 10, padding: "12px 14px", outline: "none", resize: "vertical",
                          lineHeight: 1.6, boxSizing: "border-box",
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = c.gilt; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = c.border; if (!e.currentTarget.value.trim()) setJobDescription(""); }}
                        autoFocus
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Navigation (centered inline, matches Onboarding) ─── */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 40 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={goBack}
                style={{
                  fontFamily: font.ui, fontSize: 14, fontWeight: 500, padding: "14px 20px", borderRadius: 10,
                  border: `1px solid ${c.border}`, background: "transparent", color: c.chalk,
                  cursor: "pointer", transition: "all 0.2s ease", display: "inline-flex", alignItems: "center", gap: 6,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.chalk; e.currentTarget.style.color = c.ivory; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.chalk; }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                Back
              </button>

              {step < TOTAL_STEPS ? (
                <button onClick={goNext} disabled={!canProceedStep1}
                  style={{
                    fontFamily: font.ui, fontSize: 15, fontWeight: 600, padding: "14px 40px", borderRadius: 10, border: "none",
                    background: !canProceedStep1 ? "rgba(212,179,127,0.15)" : `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
                    color: !canProceedStep1 ? "rgba(212,179,127,0.4)" : c.obsidian,
                    cursor: !canProceedStep1 ? "not-allowed" : "pointer",
                    transition: "all 0.25s ease", display: "inline-flex", alignItems: "center", gap: 8,
                    boxShadow: !canProceedStep1 ? "none" : "0 8px 24px rgba(212,179,127,0.2)",
                  }}
                  onMouseEnter={(e) => { if (canProceedStep1) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(212,179,127,0.3)"; } }}
                  onMouseLeave={(e) => { if (canProceedStep1) { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(212,179,127,0.2)"; } }}>
                  Continue
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ) : (
                <>
                  <button onClick={handleStart} disabled={starting}
                    style={{
                      fontFamily: font.ui, fontSize: 15, fontWeight: 600, padding: "14px 40px", borderRadius: 10, border: "none",
                      background: starting ? "rgba(212,179,127,0.15)" : `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
                      color: starting ? "rgba(212,179,127,0.4)" : c.obsidian,
                      cursor: starting ? "not-allowed" : "pointer",
                      transition: "all 0.25s ease", display: "inline-flex", alignItems: "center", gap: 8,
                      boxShadow: starting ? "none" : "0 8px 24px rgba(212,179,127,0.2)",
                    }}
                    onMouseEnter={(e) => { if (!starting) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(212,179,127,0.3)"; } }}
                    onMouseLeave={(e) => { if (!starting) { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(212,179,127,0.2)"; } }}>
                    {starting ? (
                      <div style={{ width: 16, height: 16, border: "2.5px solid rgba(212,179,127,0.3)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                    ) : (
                      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="5,3 19,12 5,21"/></svg>
                    )}
                    {starting ? "Starting..." : micStatus === "granted" ? "Start Practice Interview" : "Start with Text Input"}
                  </button>
                  <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, textAlign: "center", marginTop: 8 }}>
                    {micStatus !== "granted"
                      ? "You can type your answers instead of speaking"
                      : "Your practice interview will start immediately"}
                  </p>
                  <button onClick={() => {
                    const roleText = targetRole ? ` for ${targetRole}` : "";
                    const companyText = targetCompany ? ` at ${targetCompany}` : "";
                    const msg = `Hey! I'm prepping${roleText}${companyText} on HireStepX. Want to practice together? Try it out — it's free!\n\nhttps://app.hirestepx.com/session-setup`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
                  }} style={{
                    fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: "#25D366",
                    background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.15)",
                    borderRadius: 8, padding: "8px 16px", cursor: "pointer", marginTop: 8,
                    display: "inline-flex", alignItems: "center", gap: 6,
                  }}>
                    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Invite a friend to practice
                  </button>
                </>
              )}
            </div>

            {/* Save status indicator */}
            {saveStatus !== "idle" && (
              <div aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, animation: "fadeUp 0.25s ease-out" }}>
                {saveStatus === "saving" && <div style={{ width: 10, height: 10, border: "1.5px solid rgba(212,179,127,0.3)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 1s linear infinite" }} />}
                {saveStatus === "saved" && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                {saveStatus === "error" && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/></svg>}
                <span style={{ fontFamily: font.ui, fontSize: 11, color: saveStatus === "error" ? c.ember : saveStatus === "saved" ? c.sage : c.stone }}>
                  {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Progress saved" : "Save failed — your data is safe locally"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Countdown overlay */}
      {launching && countdown !== null && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: c.obsidian, animation: "launchIn 0.4s ease",
        }}>
          {countdown > 0 ? (
            <>
              <div key={countdown} style={{
                width: 120, height: 120, borderRadius: "50%",
                background: `linear-gradient(135deg, rgba(212,179,127,0.12), rgba(212,179,127,0.04))`,
                border: "2px solid rgba(212,179,127,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 32,
                animation: "countdownPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}>
                <span style={{
                  fontFamily: font.display, fontSize: 56, fontWeight: 600,
                  color: c.gilt, lineHeight: 1,
                  animation: "countdownFade 1s ease",
                }}>
                  {countdown}
                </span>
              </div>
              <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, letterSpacing: "0.02em" }}>
                Get ready...
              </p>
            </>
          ) : (
            <>
              <div style={{
                width: 64, height: 64, borderRadius: 16, marginBottom: 24,
                background: `linear-gradient(135deg, rgba(212,179,127,0.15), rgba(212,179,127,0.05))`,
                border: "1px solid rgba(212,179,127,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
                animation: "launchPulse 1.2s ease-in-out infinite",
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><polygon points="5,3 19,12 5,21"/></svg>
              </div>
              <h2 style={{ fontFamily: font.display, fontSize: 28, fontWeight: 400, color: c.ivory, marginBottom: 8, letterSpacing: "-0.02em" }}>
                Let's go!
              </h2>
            </>
          )}
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <UpgradeModal
          onClose={() => setShowUpgradeModal(false)}
          sessionsUsed={0}
          user={user}
          currentTier={user?.subscriptionTier || "free"}
          onPaymentSuccess={(_tier: string, _start: string, _end: string) => {
            setShowUpgradeModal(false);
            if (sessionLength === "10m") setSessionLength("15m");
          }}
        />
      )}
    </div>
  );
}
