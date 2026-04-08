import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { track } from "@vercel/analytics";

import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { unlockAudio, prefetchTTS } from "./tts";
import { UpgradeModal } from "./dashboardComponents";

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
  },
  {
    id: "campus-placement",
    label: "Campus Placement",
    description: "HR questions, project discussions, and aptitude for on-campus drives and fresher interviews",
    icon: (
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5" />
      </svg>
    ),
    duration: "15–20 min",
    questions: "4–5 questions",
    color: "#6B8AFF",
  },
  {
    id: "hr-round",
    label: "HR Round",
    description: "Personality, cultural fit, strengths & weaknesses — the classic HR interview",
    icon: (
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    duration: "15–20 min",
    questions: "4–5 questions",
    color: "#E89B5A",
  },
  {
    id: "management",
    label: "Management",
    description: "Leadership style, team management, and cross-functional coordination for manager roles",
    icon: (
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    duration: "20–25 min",
    questions: "4–5 questions",
    color: "#B388FF",
  },
  {
    id: "government-psu",
    label: "Government & PSU",
    description: "Public administration, ethics, current affairs, and policy — for SSC, Banking, PSU, and civil services",
    icon: (
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M3 21h18" />
        <path d="M5 21V7l7-4 7 4v14" />
        <path d="M9 21v-6h6v6" />
        <line x1="9" y1="10" x2="9" y2="10.01" />
        <line x1="15" y1="10" x2="15" y2="10.01" />
      </svg>
    ),
    duration: "20–25 min",
    questions: "4–5 questions",
    color: "#4DB6AC",
  },
  {
    id: "teaching",
    label: "Teaching",
    description: "Pedagogy, classroom management, and subject knowledge for PGT, TGT, KVS, and college positions",
    icon: (
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
    duration: "15–20 min",
    questions: "4–5 questions",
    color: "#FF8A80",
  },
];

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
  "Kubernetes Engineer", "AWS Solutions Architect", "Azure Engineer",
  "Data Engineer", "Senior Data Engineer", "Data Architect",
  "Data Scientist", "Senior Data Scientist", "Research Scientist",
  "Data Analyst", "Senior Data Analyst", "Business Intelligence Analyst", "BI Developer", "MIS Executive",
  "Machine Learning Engineer", "Senior ML Engineer", "AI Engineer", "AI/ML Lead", "NLP Engineer", "Computer Vision Engineer",
  "MLOps Engineer", "AI Product Manager",
  "QA Engineer", "Senior QA Engineer", "QA Lead", "Test Engineer", "SDET", "Automation Engineer", "Performance Engineer",
  "Security Engineer", "Cybersecurity Analyst", "SOC Analyst", "Penetration Tester", "Security Architect",
  "Tech Lead", "Engineering Manager", "Senior Engineering Manager", "Director of Engineering",
  "VP of Engineering", "Head of Engineering", "CTO",
  "Associate Product Manager", "Product Manager", "Senior Product Manager", "Lead Product Manager",
  "Group Product Manager", "Director of Product", "VP of Product", "Head of Product", "Chief Product Officer",
  "Technical Product Manager", "Product Owner",
  "Product Designer", "Senior Product Designer", "UX Designer", "Senior UX Designer", "UI Designer", "UX/UI Designer",
  "UX Researcher", "Visual Designer", "Head of Design", "Design Manager",
  "Business Analyst", "Senior Business Analyst", "Management Consultant", "Strategy Consultant",
  "Project Manager", "Senior Project Manager", "Program Manager", "Technical Program Manager", "Scrum Master",
  "Operations Manager", "Supply Chain Manager", "Logistics Manager",
  "Marketing Manager", "Digital Marketing Manager", "Content Strategist", "Growth Manager",
  "Sales Executive", "Account Executive", "Business Development Manager",
  "HR Executive", "HR Manager", "Recruiter", "Technical Recruiter", "Talent Acquisition Manager",
  "Financial Analyst", "CA", "Chartered Accountant", "Investment Banking Analyst",
  "Bank PO", "Relationship Manager", "Wealth Manager",
  "Legal Counsel", "Corporate Lawyer", "Company Secretary",
  "IAS Officer", "UPSC Aspirant", "SSC CGL", "Bank PO (IBPS/SBI)", "PSU Engineer",
  "Teacher", "Lecturer", "Assistant Professor", "Professor",
  "Doctor", "MBBS", "Pharmacist",
  "Civil Engineer", "Mechanical Engineer", "Electrical Engineer", "Electronics Engineer",
  "CEO", "Co-founder", "Managing Director", "General Manager", "COO",
  "Software Engineer Intern", "Data Science Intern", "Associate Software Engineer", "Junior Developer",
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
  "campus-placement": "Hi! Welcome to your campus placement mock interview. We'll cover a mix of HR questions, problem-solving, and questions about your academic projects. Ready to begin?",
  "hr-round": "Welcome to your HR round practice session. This round focuses on your personality, cultural fit, and soft skills. Let's get started — are you ready?",
  management: "Welcome to your management interview session. We'll explore your leadership style, team management approach, and how you drive results through others. Ready?",
  "government-psu": "Welcome to your government and public sector interview practice. These interviews test your awareness of public administration, ethics, current affairs, and your motivation for public service. Let's begin — are you ready?",
  teaching: "Welcome to your teaching position interview practice. We'll cover pedagogy, classroom management, and subject knowledge. Let's start — ready?",
};

/* ═══════════════════════════════════════════════
   SESSION SETUP — 2-Step Flow
   Step 1: Interview type + Role & Company + Session Length
   Step 2: Mic permission + Session Summary
   ═══════════════════════════════════════════════ */
const TOTAL_STEPS = 2;

export default function SessionSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const preselectedType = searchParams.get("type");
  const [draft] = useState(() => loadDraft(user?.id));
  const [showDraftBanner, setShowDraftBanner] = useState(!!draft);

  // Steps: 1 = type + role + length, 2 = mic + summary
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState(preselectedType || "");
  const [targetRole, setTargetRole] = useState(user?.targetRole || "");
  const [roleTouched, setRoleTouched] = useState(false);
  const [targetCompany, setTargetCompany] = useState(user?.targetCompany || "");
  const [sessionLength, setSessionLength] = useState("10m");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const isFreeUser = !user?.subscriptionTier || user.subscriptionTier === "free";

  // Mic check (compact bar style like onboarding)
  const [micStatus, setMicStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [micLevel, setMicLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);

  // Countdown before interview starts
  const [countdown, setCountdown] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  const selectedTypeData = interviewTypes.find(t => t.id === selectedType);
  const canProceedStep1 = !!selectedType && !!targetRole.trim();

  const requestMic = useCallback(async () => {
    setMicStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicStatus("granted");
      const ctx = new AudioContext();
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

  // Cleanup streams on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Launch interview with countdown
  const handleLaunch = () => {
    setStarting(true);
    unlockAudio();
    track("session_start", { type: selectedType, role: targetRole, sessionLength });
    streamRef.current?.getTracks().forEach(t => t.stop());
    const introText = introByType[selectedType] || introByType.behavioral;
    prefetchTTS(introText);
    setCountdown(3);
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      navigate(`/interview?type=${selectedType}&focus=${selectedType}&difficulty=standard${targetCompany ? `&company=${encodeURIComponent(targetCompany)}` : ""}&role=${encodeURIComponent(targetRole)}&length=${sessionLength}`);
      return;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, navigate, selectedType, targetCompany, targetRole, sessionLength]);

  const sessionLengthLabel = sessionLength === "10m" ? "10 minutes" : sessionLength === "25m" ? "25 minutes" : "15 minutes";

  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes countPulse { 0% { transform: scale(0.8); opacity: 0; } 50% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .setup-type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .setup-role-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .setup-length-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        @media (max-width: 600px) {
          .setup-type-grid { grid-template-columns: 1fr !important; }
          .setup-role-grid { grid-template-columns: 1fr !important; }
          .setup-length-grid { grid-template-columns: 1fr !important; }
        }
        .ob-mic-pulse { animation: pulse 2s ease-in-out infinite; }
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

      {/* Offline warning */}
      {!navigator.onLine && countdown === null && (
        <div role="alert" style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
          padding: "10px 24px", background: "rgba(196,112,90,0.12)",
          borderBottom: "1px solid rgba(196,112,90,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/></svg>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ember }}>
            You're offline — interview will use practice questions and AI feedback will be limited.
          </span>
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
              textShadow: "0 0 60px rgba(212,179,127,0.3)",
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
        <button onClick={() => step > 1 ? setStep(1) : navigate("/dashboard")}
          style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: font.ui, fontSize: 13, color: c.stone, background: "none", border: "none", cursor: "pointer", outline: "none" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = c.ivory; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; }}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          {step === 1 ? "Back to Dashboard" : "Back"}
        </button>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {[1, 2].map(s => (
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
              {s < TOTAL_STEPS && <div style={{ width: 32, height: 1.5, background: step > s ? c.sage : c.border, borderRadius: 1, transition: "background 0.3s ease" }} />}
            </div>
          ))}
        </div>

        <div style={{ width: 120 }} />
      </header>

      {/* Content */}
      <div style={{ flex: 1, width: "100%", maxWidth: 720, padding: "40px 24px 120px", animation: "fadeUp 0.3s ease" }}>

        {/* ─── Step 1: Interview Type + Role & Company + Session Length ─── */}
        {step === 1 && (
          <div>
            <div style={{ marginBottom: 32 }}>
              <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 1 — Session Setup</p>
              <h1 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, marginBottom: 10, letterSpacing: "-0.025em", lineHeight: 1.2 }}>
                Configure your interview
              </h1>
              <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7 }}>
                Choose your interview type, target role, and session length. AI will tailor questions to your profile.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* ── Interview Type ── */}
              <div style={{ background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`, padding: "24px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </div>
                  <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Interview Type <span style={{ color: c.ember, fontWeight: 400 }}>*</span></span>
                </div>
                <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginBottom: 16, paddingLeft: 36 }}>Select the type of interview you want to practice.</p>

                <div className="setup-type-grid">
                  {interviewTypes.map(type => {
                    const sel = selectedType === type.id;
                    return (
                      <button key={type.id}
                        aria-label={`${type.label} interview: ${type.description}`}
                        aria-pressed={sel}
                        onClick={() => setSelectedType(type.id)}
                        style={{
                          padding: "16px 18px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                          background: sel ? "rgba(212,179,127,0.08)" : "transparent",
                          border: `1.5px solid ${sel ? c.gilt : c.border}`,
                          boxShadow: sel ? "0 0 16px rgba(212,179,127,0.06)" : "none",
                          transition: "all 0.2s ease", outline: "none",
                          display: "flex", alignItems: "center", gap: 12,
                        }}
                        onMouseEnter={(e) => { if (!sel) e.currentTarget.style.borderColor = c.borderHover; }}
                        onMouseLeave={(e) => { if (!sel) e.currentTarget.style.borderColor = c.border; }}
                      >
                        <div style={{ width: 36, height: 36, borderRadius: 9, background: sel ? "rgba(212,179,127,0.1)" : "rgba(245,242,237,0.03)", border: `1px solid ${sel ? "rgba(212,179,127,0.2)" : "rgba(245,242,237,0.06)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: type.color }}>
                          {type.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, display: "block" }}>{type.label}</span>
                          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, lineHeight: 1.4 }}>{type.description}</span>
                        </div>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${sel ? c.gilt : "rgba(245,242,237,0.12)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {sel && <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.gilt }} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Role & Company ── */}
              <div style={{ background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`, padding: "24px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                  </div>
                  <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Target Role</span>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, fontWeight: 400, marginLeft: 4 }}>— AI tailors questions to this role</span>
                </div>
                <div className="setup-role-grid">
                  <div>
                    <AutocompleteInput id="setup-role" value={targetRole} onChange={(v) => { setTargetRole(v); setRoleTouched(true); }} suggestions={ROLE_SUGGESTIONS} placeholder="e.g. Senior Engineering Manager..." label="Role" required error={roleTouched && !targetRole.trim() ? "Required to personalize your questions" : undefined} />
                  </div>
                  <div>
                    <AutocompleteInput id="setup-company" value={targetCompany} onChange={setTargetCompany} suggestions={COMPANY_SUGGESTIONS} placeholder="e.g. Google, Stripe..." label="Company (optional)" />
                  </div>
                </div>
              </div>

              {/* ── Session Length ── */}
              <div style={{ background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`, padding: "24px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </div>
                  <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Session Length</span>
                </div>
                <div className="setup-length-grid">
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
            </div>
          </div>
        )}

        {/* ─── Step 2: Mic Permission + Summary ─── */}
        {step === 2 && (
          <div>
            <div style={{ marginBottom: 32 }}>
              <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 2 — Almost There</p>
              <h1 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, marginBottom: 10, letterSpacing: "-0.025em", lineHeight: 1.2 }}>
                Allow permissions & review
              </h1>
              <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7 }}>
                We need microphone access for the interview. Review your session settings below, then you're ready to go.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* ── Mic Permission — compact inline bar ── */}
              <div className={micStatus !== "granted" ? "ob-mic-pulse" : ""} style={{
                background: c.graphite, borderRadius: 12, padding: "14px 20px",
                display: "flex", alignItems: "center", gap: 14,
                border: `1px solid ${micStatus === "granted" ? "rgba(122,158,126,0.15)" : "rgba(212,179,127,0.15)"}`,
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
                    {micStatus === "denied" ? "Retry" : "Allow"}
                  </button>
                )}
              </div>

              {/* ── Session Summary Card ── */}
              <div style={{ background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`, padding: "24px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  </div>
                  <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Session Summary</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {[
                    { label: "Interview Type", value: selectedTypeData?.label || "Not selected", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
                    { label: "Target Role", value: targetRole || "Not set", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> },
                    { label: "Target Company", value: targetCompany || "Exploring", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="15" y2="14"/></svg> },
                    { label: "Session Length", value: sessionLengthLabel, icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
                  ].map((item, i, arr) => (
                    <div key={item.label}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                          <span style={{ flexShrink: 0, display: "flex" }}>{item.icon}</span>
                          <span style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, flexShrink: 0 }}>{item.label}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: item.value === "Not set" || item.value === "Not selected" ? "rgba(154,149,144,0.5)" : c.ivory, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>
                            {item.value}
                          </span>
                          <button
                            onClick={() => setStep(1)}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", opacity: 0.3, transition: "opacity 0.2s" }}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.3"; }}
                            aria-label={`Edit ${item.label}`}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        </div>
                      </div>
                      {i < arr.length - 1 && <div style={{ height: 1, background: "rgba(245,242,237,0.04)" }} />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Tips */}
              <div style={{ background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`, padding: "20px 24px" }}>
                <h3 style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, marginBottom: 12 }}>Quick Tips</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    "Find a quiet space — background noise affects AI evaluation",
                    "Speak at a natural pace — rushing is the #1 mistake in mock interviews",
                    "Press Enter when you're done answering to move to the next question",
                    "You can type your answers if you prefer not to use the microphone",
                  ].map((tip, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" style={{ marginTop: 2, flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
                      <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.5 }}>{tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <footer style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        padding: "16px 32px",
        background: "rgba(6,6,7,0.9)", backdropFilter: "blur(12px)",
        borderTop: `1px solid ${c.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        zIndex: 10,
      }}>
        <button
          onClick={() => step > 1 ? setStep(1) : navigate("/dashboard")}
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
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Step {step} of {TOTAL_STEPS}</span>
        </div>

        {step < TOTAL_STEPS ? (
          <button
            onClick={() => setStep(2)}
            disabled={!canProceedStep1}
            style={{
              fontFamily: font.ui, fontSize: 13, fontWeight: 500,
              padding: "10px 28px", borderRadius: 8, cursor: canProceedStep1 ? "pointer" : "not-allowed",
              background: canProceedStep1 ? c.gilt : "rgba(212,179,127,0.15)",
              color: canProceedStep1 ? c.obsidian : c.stone,
              border: "none",
              display: "flex", alignItems: "center", gap: 8,
              transition: "all 0.2s ease", outline: "none",
              opacity: canProceedStep1 ? 1 : 0.5,
            }}
            onMouseEnter={(e) => { if (canProceedStep1) e.currentTarget.style.filter = "brightness(1.1)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
          >
            Continue
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        ) : (
          <button
            onClick={handleLaunch}
            disabled={starting}
            style={{
              fontFamily: font.ui, fontSize: 14, fontWeight: 600,
              padding: "12px 32px", borderRadius: 8,
              background: starting ? "rgba(212,179,127,0.15)" : `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
              color: starting ? "rgba(212,179,127,0.4)" : c.obsidian,
              border: "none",
              cursor: starting ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: starting ? "none" : "0 8px 32px rgba(212,179,127,0.15)",
              transition: "all 0.2s ease", outline: "none",
            }}
            onMouseEnter={(e) => { if (!starting) e.currentTarget.style.filter = "brightness(1.15)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
          >
            {starting ? (
              <div style={{ width: 16, height: 16, border: "2.5px solid rgba(212,179,127,0.3)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            ) : (
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21" /></svg>
            )}
            {starting ? "Starting..." : micStatus === "granted" ? "Start Practice Interview" : "Start with Text Input"}
          </button>
        )}
      </footer>

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
