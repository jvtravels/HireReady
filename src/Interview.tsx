import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import type { User } from "./AuthContext";
import { speak } from "./tts";
import { saveSession, getAuthToken } from "./supabase";

/* ─── Interview Script ─── */
interface InterviewStep {
  type: "intro" | "question" | "follow-up" | "closing";
  aiText: string;
  thinkingDuration: number; // ms AI "thinks" before speaking
  speakingDuration: number; // ms AI "speaks"
  waitForUser: boolean;
  scoreNote?: string;
}

const scriptsByType: Record<string, InterviewStep[]> = {
  behavioral: [
    { type: "intro", aiText: "Hi! Welcome to your behavioral mock interview. I'm your AI interviewer today. We'll focus on leadership, decision-making, and conflict resolution. This will take about 15 minutes. Feel free to take your time. Ready?", thinkingDuration: 1000, speakingDuration: 6000, waitForUser: true },
    { type: "question", aiText: "Great. Tell me about a time you had to make a difficult technical decision that significantly impacted your team's roadmap. What was the situation, and how did you approach it?", thinkingDuration: 1500, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: STAR structure, strategic framing, business impact" },
    { type: "follow-up", aiText: "Interesting approach. You mentioned the team was divided on the solution. How did you navigate that disagreement, and what was your decision-making framework?", thinkingDuration: 2000, speakingDuration: 4000, waitForUser: true, scoreNote: "Looking for: conflict resolution, leadership presence" },
    { type: "question", aiText: "Now, let's talk about scaling. Describe a situation where you had to scale your engineering organization. What challenges did you face, and how did you maintain engineering velocity during that growth?", thinkingDuration: 2000, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: scaling strategy, people management, metrics" },
    { type: "follow-up", aiText: "You mentioned hiring. How did you ensure quality while scaling quickly? Were there any trade-offs you had to make?", thinkingDuration: 1500, speakingDuration: 3500, waitForUser: true, scoreNote: "Looking for: quality vs speed trade-offs, practical examples" },
    { type: "question", aiText: "Let's shift to stakeholder management. Tell me about a time when you had to push back on a request from a senior executive. How did you handle it, and what was the outcome?", thinkingDuration: 2000, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: stakeholder alignment, communication, courage" },
    { type: "closing", aiText: "That's excellent. We've covered some great ground today. You showed strong strategic thinking and good STAR structure. Your main area for improvement is quantifying business impact — try anchoring your answers with specific metrics. Great session!", thinkingDuration: 2000, speakingDuration: 7000, waitForUser: false },
  ],
  strategic: [
    { type: "intro", aiText: "Welcome to your strategic interview session. Today we'll explore your vision-setting ability, roadmap thinking, and business alignment. Let's dive in — are you ready?", thinkingDuration: 1000, speakingDuration: 5000, waitForUser: true },
    { type: "question", aiText: "Imagine you've just joined a company as VP of Engineering. The product has strong market fit but the tech stack is aging. How would you approach building a 3-year technical strategy?", thinkingDuration: 2000, speakingDuration: 5500, waitForUser: true, scoreNote: "Focus on: strategic vision, prioritization, stakeholder buy-in" },
    { type: "follow-up", aiText: "How would you balance investment in platform modernization against shipping new features? What framework would you use?", thinkingDuration: 1500, speakingDuration: 4000, waitForUser: true, scoreNote: "Looking for: trade-off analysis, business acumen" },
    { type: "question", aiText: "Tell me about a time you had to pivot a major initiative based on changing business conditions. How did you recognize the need and communicate the change?", thinkingDuration: 2000, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: adaptability, communication, decisiveness" },
    { type: "follow-up", aiText: "What metrics did you use to validate the pivot was working? How did you manage team morale during the change?", thinkingDuration: 1500, speakingDuration: 3500, waitForUser: true, scoreNote: "Looking for: data-driven decisions, emotional intelligence" },
    { type: "question", aiText: "How do you ensure engineering strategy stays aligned with business goals? Walk me through your approach to cross-functional planning.", thinkingDuration: 2000, speakingDuration: 4500, waitForUser: true, scoreNote: "Focus on: cross-functional alignment, planning rigor" },
    { type: "closing", aiText: "Excellent session. Your strategic thinking is sharp, especially around prioritization frameworks. I'd recommend strengthening your answers with more specific revenue or growth metrics. Well done!", thinkingDuration: 2000, speakingDuration: 6000, waitForUser: false },
  ],
  technical: [
    { type: "intro", aiText: "Welcome to your technical leadership interview. We'll focus on architecture decisions, system design at scale, and tech strategy. Ready to begin?", thinkingDuration: 1000, speakingDuration: 4500, waitForUser: true },
    { type: "question", aiText: "Describe a system you designed that had to handle 10x growth in traffic. What were the key architectural decisions and trade-offs?", thinkingDuration: 2000, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: scalability thinking, trade-off analysis" },
    { type: "follow-up", aiText: "How did you decide between building vs buying for the key components? What was your evaluation criteria?", thinkingDuration: 1500, speakingDuration: 3500, waitForUser: true, scoreNote: "Looking for: pragmatism, cost-benefit analysis" },
    { type: "question", aiText: "Tell me about a major production incident you led the response for. How did you structure the incident response, and what systemic changes did you make afterward?", thinkingDuration: 2000, speakingDuration: 5500, waitForUser: true, scoreNote: "Focus on: incident management, blameless culture, systemic thinking" },
    { type: "follow-up", aiText: "How do you balance reliability investment against feature velocity? What SLO framework do you use?", thinkingDuration: 1500, speakingDuration: 4000, waitForUser: true, scoreNote: "Looking for: SRE principles, practical frameworks" },
    { type: "question", aiText: "How do you evaluate and introduce new technologies into your stack? Walk me through a recent technology decision you drove.", thinkingDuration: 2000, speakingDuration: 4500, waitForUser: true, scoreNote: "Focus on: tech evaluation rigor, risk management" },
    { type: "closing", aiText: "Strong session. Your technical depth is evident, and you communicate architecture decisions clearly. For improvement, try connecting technical decisions more explicitly to business outcomes. Great work!", thinkingDuration: 2000, speakingDuration: 6500, waitForUser: false },
  ],
  case: [
    { type: "intro", aiText: "Welcome to your case study interview. I'll present you with business scenarios that test your analytical thinking and problem-solving frameworks. Let's start.", thinkingDuration: 1000, speakingDuration: 5000, waitForUser: true },
    { type: "question", aiText: "Your company's core API has 99.95% uptime but customers are churning citing 'reliability issues.' Latency p99 is 2 seconds. How would you investigate and address this?", thinkingDuration: 2000, speakingDuration: 5500, waitForUser: true, scoreNote: "Focus on: problem decomposition, data-driven approach" },
    { type: "follow-up", aiText: "You discover the latency spikes correlate with a third-party dependency. What's your short-term and long-term mitigation strategy?", thinkingDuration: 1500, speakingDuration: 4000, waitForUser: true, scoreNote: "Looking for: tactical vs strategic thinking, vendor management" },
    { type: "question", aiText: "A competitor just launched a feature that took them 2 months. Your team estimates it would take 6 months due to tech debt. The CEO wants it in 3. How do you handle this?", thinkingDuration: 2000, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: negotiation, creative solutions, scope management" },
    { type: "follow-up", aiText: "If you had to ship something in 6 weeks, what would you cut and what would you keep? How do you communicate that to the CEO?", thinkingDuration: 1500, speakingDuration: 3500, waitForUser: true, scoreNote: "Looking for: prioritization, executive communication" },
    { type: "question", aiText: "Your engineering team of 40 has low morale. Attrition is at 25%. Exit interviews cite 'lack of growth' and 'unclear direction.' You have 90 days to turn it around. What do you do?", thinkingDuration: 2000, speakingDuration: 5500, waitForUser: true, scoreNote: "Focus on: people leadership, organizational design, quick wins" },
    { type: "closing", aiText: "Impressive problem-solving. You structured your answers well and considered multiple stakeholders. To improve, try to quantify the expected impact of your proposed solutions. Great case analysis!", thinkingDuration: 2000, speakingDuration: 6500, waitForUser: false },
  ],
};

const defaultScript = scriptsByType.behavioral;

function getScript(type: string | null, difficulty: string | null, user: User | null): InterviewStep[] {
  const base = (type && scriptsByType[type]) ? scriptsByType[type] : defaultScript;

  // Difficulty adjustments
  const speedMultiplier = difficulty === "warmup" ? 1.4 : difficulty === "intense" ? 0.6 : 1;
  const thinkMultiplier = difficulty === "warmup" ? 1.5 : difficulty === "intense" ? 0.5 : 1;

  // Personalize intro and closing based on user data
  const role = user?.targetRole || "the role";
  const company = user?.targetCompany;
  const industry = user?.industry;
  const name = user?.name?.split(" ")[0] || "";
  const feedbackStyle = user?.learningStyle || "direct";
  const hasResume = !!user?.resumeFileName;

  const companyContext = company ? ` at ${company}` : "";
  const industryContext = industry ? ` in the ${industry} space` : "";
  const resumeContext = hasResume ? " I've reviewed your resume, so these questions will draw from your actual experience." : "";

  const personalizedIntro: InterviewStep = {
    type: "intro",
    aiText: `Hi${name ? ` ${name}` : ""}! Welcome to your mock interview. I'm your AI interviewer today. We'll be focusing on ${type || "behavioral"} questions for the ${role} position${companyContext}${industryContext}.${resumeContext} ${difficulty === "warmup" ? "This will be conversational — no pressure, just practice." : difficulty === "intense" ? "I'll be pushing you hard today — expect rapid follow-ups and high expectations." : "This will take about 15 minutes. Feel free to take your time."} Ready to begin?`,
    thinkingDuration: 1000,
    speakingDuration: 6000,
    waitForUser: true,
  };

  const closingPrefix = feedbackStyle === "encouraging"
    ? "Really great work today! You showed some strong skills. "
    : "Let me give you direct feedback. ";

  const personalizedClosing: InterviewStep = {
    type: "closing",
    aiText: `${closingPrefix}${base[base.length - 1].aiText.replace(/^.*?\./, "")}${company ? ` For ${company} specifically, I'd recommend emphasizing your ${industry || "industry"} domain expertise more.` : ""}`,
    thinkingDuration: 2000,
    speakingDuration: 7000,
    waitForUser: false,
  };

  const steps = [
    personalizedIntro,
    ...base.slice(1, -1),
    personalizedClosing,
  ];

  return steps.map(step => ({
    ...step,
    thinkingDuration: Math.round(step.thinkingDuration * thinkMultiplier),
    speakingDuration: Math.round(step.speakingDuration * speedMultiplier),
  }));
}

/* ─── Result persistence (Supabase + localStorage fallback) ─── */
const RESULTS_KEY = "levelup_sessions";

interface SessionResult {
  id: string;
  date: string;
  type: string;
  difficulty: string;
  focus: string;
  duration: number;
  score: number;
  questions: number;
  transcript?: { speaker: string; text: string; time: string }[];
  ai_feedback?: string;
  skill_scores?: Record<string, number> | null;
}

async function saveSessionResult(result: SessionResult, userId?: string): Promise<{ localOk: boolean; cloudOk: boolean }> {
  let localOk = false;
  let cloudOk = false;
  // Save to localStorage as fallback
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    const sessions: SessionResult[] = raw ? JSON.parse(raw) : [];
    sessions.unshift(result);
    localStorage.setItem(RESULTS_KEY, JSON.stringify(sessions));
    localOk = true;
  } catch {}
  // Save to Supabase if user is logged in
  if (userId) {
    try {
      await saveSession({
        id: result.id,
        user_id: userId,
        date: result.date,
        type: result.type,
        difficulty: result.difficulty,
        focus: result.focus,
        duration: result.duration,
        score: result.score,
        questions: result.questions,
        transcript: result.transcript || [],
        ai_feedback: result.ai_feedback || "",
        skill_scores: result.skill_scores || null,
      });
      cloudOk = true;
    } catch (err) {
      console.warn("Failed to save session to Supabase:", err);
    }
  } else {
    cloudOk = true; // No user, local-only is fine
  }
  return { localOk, cloudOk };
}

/* ─── LLM Question Generation ─── */
async function fetchLLMQuestions(params: {
  type: string; difficulty: string; role: string;
  company?: string; industry?: string; resumeText?: string;
}): Promise<InterviewStep[] | null> {
  try {
    const headers = await import("./supabase").then(m => m.authHeaders());
    const res = await fetch("/api/generate-questions", {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.questions || !Array.isArray(data.questions)) return null;
    // Map LLM response to InterviewStep format
    return data.questions.map((q: { type?: string; aiText?: string; text?: string; scoreNote?: string }) => ({
      type: (q.type || "question") as InterviewStep["type"],
      aiText: q.aiText || q.text || "",
      thinkingDuration: q.type === "intro" ? 1000 : 1500,
      speakingDuration: 5000,
      waitForUser: q.type !== "closing",
      scoreNote: q.scoreNote || "",
    }));
  } catch {
    return null;
  }
}

/* ─── LLM Answer Evaluation ─── */
async function fetchLLMEvaluation(params: {
  transcript: { speaker: string; text: string }[];
  type: string; difficulty: string; role: string; company?: string;
}): Promise<{
  overallScore: number;
  skillScores: Record<string, number>;
  strengths: string[];
  improvements: string[];
  feedback: string;
} | null> {
  try {
    const headers = await import("./supabase").then(m => m.authHeaders());
    const res = await fetch("/api/evaluate", {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ─── Speech Recognition (Web Speech API) ─── */
interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: { isFinal: boolean; 0: { transcript: string } };
}

function createSpeechRecognition(): SpeechRecognitionInstance | null {
  const SR = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  if (!SR) return null;
  const recognition = new (SR as new () => SpeechRecognitionInstance)();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  return recognition;
}

/* ─── Waveform Visualizer ─── */
function WaveformVisualizer({ active, color, barCount = 24 }: { active: boolean; color: string; barCount?: number }) {
  const [bars, setBars] = useState<number[]>(Array(barCount).fill(0.1));
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      setBars(Array(barCount).fill(0.1));
      return;
    }
    let running = true;
    const animate = () => {
      if (!running) return;
      setBars(prev => prev.map(() => 0.15 + Math.random() * 0.85));
      frameRef.current = requestAnimationFrame(() => {
        setTimeout(() => { if (running) animate(); }, 80);
      });
    };
    animate();
    return () => { running = false; cancelAnimationFrame(frameRef.current); };
  }, [active, barCount]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 32 }}>
      {bars.map((h, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 2,
          height: `${h * 100}%`,
          background: color,
          opacity: active ? 0.8 : 0.15,
          transition: active ? "height 0.08s ease" : "height 0.5s ease, opacity 0.5s ease",
        }} />
      ))}
    </div>
  );
}

/* ─── AI Avatar with Speaking Animation ─── */
function AIAvatar({ isSpeaking, isThinking }: { isSpeaking: boolean; isThinking: boolean }) {
  return (
    <div style={{ position: "relative", width: 120, height: 120 }}>
      {/* Outer pulse ring when speaking */}
      {isSpeaking && (
        <>
          <div style={{
            position: "absolute", inset: -12, borderRadius: "50%",
            border: `2px solid ${c.gilt}`,
            opacity: 0.3,
            animation: "avatarPulse 1.5s ease-in-out infinite",
          }} />
          <div style={{
            position: "absolute", inset: -6, borderRadius: "50%",
            border: `1.5px solid ${c.gilt}`,
            opacity: 0.5,
            animation: "avatarPulse 1.5s ease-in-out infinite 0.3s",
          }} />
        </>
      )}

      {/* Thinking dots */}
      {isThinking && (
        <div style={{
          position: "absolute", inset: -8, borderRadius: "50%",
          border: `2px dashed ${c.gilt}`,
          opacity: 0.4,
          animation: "spin 4s linear infinite",
        }} />
      )}

      {/* Avatar circle */}
      <div style={{
        width: 120, height: 120, borderRadius: "50%",
        background: `linear-gradient(135deg, rgba(201,169,110,0.15) 0%, rgba(201,169,110,0.05) 100%)`,
        border: `2px solid ${isSpeaking ? c.gilt : isThinking ? "rgba(201,169,110,0.4)" : c.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "border-color 0.3s ease",
        boxShadow: isSpeaking ? `0 0 40px rgba(201,169,110,0.15)` : "none",
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.2" strokeLinecap="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2m0 18v2m-9-11h2m18 0h2" />
          <path d="M5.6 5.6l1.4 1.4m9.9 9.9l1.4 1.4M5.6 18.4l1.4-1.4m9.9-9.9l1.4-1.4" />
          {isSpeaking && (
            <>
              <circle cx="12" cy="12" r="6" strokeDasharray="4 4">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="3s" repeatCount="indefinite" />
              </circle>
            </>
          )}
        </svg>
      </div>
    </div>
  );
}

/* ─── Live Captions ─── */
function LiveCaptions({ text, isTyping }: { text: string; isTyping: boolean }) {
  const [displayText, setDisplayText] = useState("");
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    setDisplayText("");
    setCharIndex(0);
  }, [text]);

  useEffect(() => {
    if (!isTyping || charIndex >= text.length) return;
    const timer = setTimeout(() => {
      setDisplayText(text.slice(0, charIndex + 1));
      setCharIndex(charIndex + 1);
    }, 25 + Math.random() * 15);
    return () => clearTimeout(timer);
  }, [charIndex, text, isTyping]);

  if (!isTyping && !displayText) return null;

  return (
    <div style={{
      padding: "14px 20px", borderRadius: 12,
      background: "rgba(10, 10, 11, 0.85)",
      backdropFilter: "blur(12px)",
      border: `1px solid ${c.border}`,
      maxWidth: 640, width: "100%",
    }}>
      <p style={{
        fontFamily: font.ui, fontSize: 14, color: c.ivory,
        lineHeight: 1.6, margin: 0, minHeight: 22,
      }}>
        {displayText}
        {isTyping && charIndex < text.length && (
          <span style={{ display: "inline-block", width: 2, height: 16, background: c.gilt, marginLeft: 2, verticalAlign: "text-bottom", animation: "blink 0.8s ease-in-out infinite" }} />
        )}
      </p>
    </div>
  );
}

/* ─── User Webcam Feed (simulated) ─── */
function UserWebcam({ isMuted, isCameraOff }: { isMuted: boolean; isCameraOff: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (isCameraOff) {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
      setHasCamera(false);
      setCameraError(null);
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setHasCamera(true);
          setCameraError(null);
        }
      })
      .catch((err) => {
        setHasCamera(false);
        if (err.name === "NotAllowedError") setCameraError("Camera access denied. Check browser permissions.");
        else if (err.name === "NotFoundError") setCameraError("No camera found on this device.");
        else setCameraError("Camera unavailable.");
      });

    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [isCameraOff]);

  return (
    <div style={{
      width: "100%", height: "100%", borderRadius: 16, overflow: "hidden",
      background: c.graphite, position: "relative",
    }}>
      {!isCameraOff && (
        <video ref={videoRef} autoPlay muted playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", display: hasCamera ? "block" : "none" }}
        />
      )}

      {(isCameraOff || !hasCamera) && (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "rgba(201,169,110,0.08)",
            border: `1px solid rgba(201,169,110,0.2)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>
            {isCameraOff ? "Camera off" : cameraError || "Camera not available"}
          </span>
        </div>
      )}

      {/* Muted indicator */}
      {isMuted && (
        <div style={{
          position: "absolute", top: 12, right: 12,
          width: 28, height: 28, borderRadius: "50%",
          background: "rgba(196,112,90,0.2)",
          border: `1px solid rgba(196,112,90,0.3)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17" />
            <line x1="12" y1="19" x2="12" y2="23" />
          </svg>
        </div>
      )}

      {/* Name tag */}
      <div style={{
        position: "absolute", bottom: 12, left: 12,
        padding: "4px 10px", borderRadius: 6,
        background: "rgba(10,10,11,0.7)",
        backdropFilter: "blur(8px)",
      }}>
        <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.ivory }}>You</span>
      </div>
    </div>
  );
}

/* ─── Timer ─── */
function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/* ─── Control Button ─── */
function ControlButton({ icon, label, active, danger, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; danger?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        width: 48, height: 48, borderRadius: "50%",
        background: danger ? c.ember : active ? "rgba(240,237,232,0.08)" : "rgba(240,237,232,0.04)",
        border: `1px solid ${danger ? "rgba(196,112,90,0.3)" : active ? "rgba(240,237,232,0.15)" : c.border}`,
        color: danger ? c.ivory : active ? c.ivory : c.stone,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.2s ease", outline: "none",
      }}
      onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px ${danger ? c.ember : c.gilt}40`}
      onBlur={(e) => e.currentTarget.style.boxShadow = "none"}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? "#d4614a" : "rgba(240,237,232,0.1)";
        e.currentTarget.style.transform = "scale(1.05)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = danger ? c.ember : active ? "rgba(240,237,232,0.08)" : "rgba(240,237,232,0.04)";
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {icon}
    </button>
  );
}

/* ═══════════════════════════════════════════════
   INTERVIEW SCREEN
   ═══════════════════════════════════════════════ */
export default function Interview() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [searchParams] = useSearchParams();
  const interviewType = searchParams.get("type") || "behavioral";
  const interviewFocus = searchParams.get("focus") || "general";
  const interviewDifficulty = searchParams.get("difficulty") || "standard";
  const fallbackScript = getScript(interviewType, interviewDifficulty, user);
  const [interviewScript, setInterviewScript] = useState<InterviewStep[]>(fallbackScript);
  const [llmLoading, setLlmLoading] = useState(true);

  // Interview state (declared early so refs can use it)
  const [currentStep, setCurrentStep] = useState(0);

  // Fetch LLM-generated questions on mount
  const currentStepRef = useRef(0);
  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    let cancelled = false;
    fetchLLMQuestions({
      type: interviewType,
      difficulty: interviewDifficulty,
      role: user?.targetRole || "senior leader",
      company: user?.targetCompany,
      industry: user?.industry,
      resumeText: user?.resumeText,
    }).then(questions => {
      // Only swap in LLM questions if still on intro step to avoid mid-interview disruption
      if (!cancelled && questions && questions.length > 0 && currentStepRef.current <= 1) {
        setInterviewScript(questions);
      }
      setLlmLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Speech recognition
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [phase, setPhase] = useState<"thinking" | "speaking" | "listening" | "done">("thinking");
  const [elapsed, setElapsed] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  // Controls
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  // Transcript history
  const [transcript, setTranscript] = useState<{ speaker: "ai" | "user"; text: string; time: string }[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // End interview modal
  const [showEndModal, setShowEndModal] = useState(false);

  // Offline + save status
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [saveWarning, setSaveWarning] = useState("");

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => { window.removeEventListener("offline", goOffline); window.removeEventListener("online", goOnline); };
  }, []);

  // AI Voice (Text-to-Speech)
  const [aiVoiceEnabled, setAiVoiceEnabled] = useState(true);
  const ttsCancelRef = useRef<(() => void) | null>(null);

  // Cancel speech + recognition on unmount
  useEffect(() => {
    return () => {
      ttsCancelRef.current?.();
      recognitionRef.current?.stop();
    };
  }, []);

  // Start/stop speech recognition based on phase
  useEffect(() => {
    if (phase === "listening" && !isMuted) {
      let stopped = false;
      const recognition = createSpeechRecognition();
      if (recognition) {
        let finalText = "";
        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              finalText += result[0].transcript + " ";
            } else {
              interim = result[0].transcript;
            }
          }
          setCurrentTranscript(finalText + interim);
        };
        recognition.onerror = () => {};
        recognition.onend = () => {
          // Auto-restart only if not stopped by cleanup
          if (!stopped) {
            try { recognition.start(); } catch {}
          }
        };
        try { recognition.start(); } catch {}
        recognitionRef.current = recognition;
      }
      return () => {
        stopped = true;
        recognition?.stop();
        recognitionRef.current = null;
      };
    } else {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    }
  }, [phase, isMuted]);

  // User answer simulation
  const [answerTimer, setAnswerTimer] = useState(0);

  const step = interviewScript[currentStep];
  const totalQuestions = interviewScript.filter(s => s.type === "question").length;
  const currentQuestionNum = interviewScript.slice(0, currentStep + 1).filter(s => s.type === "question").length;

  // Timer
  useEffect(() => {
    if (phase === "done") return;
    const timer = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Answer timer (when user is "speaking")
  useEffect(() => {
    if (phase !== "listening") {
      setAnswerTimer(0);
      return;
    }
    const timer = setInterval(() => setAnswerTimer(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Interview flow: thinking → speaking (with TTS) → listening
  useEffect(() => {
    if (phase === "done") return;

    const step = interviewScript[currentStep];

    // Phase 1: Thinking
    setPhase("thinking");
    const thinkTimer = setTimeout(() => {
      // Phase 2: Speaking
      setPhase("speaking");
      setIsRecording(true);

      // Add to transcript
      setTranscript(prev => [...prev, {
        speaker: "ai",
        text: step.aiText,
        time: formatTime(elapsed),
      }]);

      // Cancel any prior speech
      ttsCancelRef.current?.();

      const onSpeechEnd = () => {
        setIsRecording(false);
        if (step.waitForUser) {
          setPhase("listening");
        } else {
          setTimeout(() => setPhase("done"), 2000);
        }
      };

      if (aiVoiceEnabled) {
        // Use unified TTS service (ElevenLabs or browser based on settings)
        speak(step.aiText, onSpeechEnd, onSpeechEnd).then(handle => {
          ttsCancelRef.current = handle.cancel;
        });
      } else {
        // No voice — use timer fallback
        const speakTimer = setTimeout(onSpeechEnd, step.speakingDuration);
        ttsCancelRef.current = () => clearTimeout(speakTimer);
      }
    }, step.thinkingDuration);

    return () => {
      clearTimeout(thinkTimer);
      ttsCancelRef.current?.();
    };
  }, [currentStep, aiVoiceEnabled]);

  // Handle user "finishing" their answer
  const handleNextQuestion = useCallback(() => {
    if (phase !== "listening") return;

    // Cancel any ongoing speech and stop recognition
    ttsCancelRef.current?.();
    recognitionRef.current?.stop();

    // Add real transcribed answer to transcript
    const answerText = currentTranscript.trim() || `[Answer recorded — ${answerTimer}s]`;
    setTranscript(prev => [...prev, {
      speaker: "user",
      text: answerText,
      time: formatTime(elapsed),
    }]);
    setCurrentTranscript("");

    if (currentStep < interviewScript.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setPhase("done");
    }
  }, [phase, currentStep, answerTimer, elapsed]);

  // Keyboard: Enter to advance when listening
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && phase === "listening") {
        handleNextQuestion();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, handleNextQuestion]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  // Handle end interview — evaluate with LLM, persist results, navigate
  const [evaluating, setEvaluating] = useState(false);

  const handleEnd = useCallback(async () => {
    // Immediately stop everything
    setPhase("done");
    ttsCancelRef.current?.();
    ttsCancelRef.current = null;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setAiVoiceEnabled(false); // prevent interview flow effect from restarting
    setEvaluating(true);

    // Deterministic fallback score
    const completionRatio = currentStep / Math.max(1, interviewScript.length);
    const baseScore = 65 + Math.round(completionRatio * 20);
    const difficultyBonus = interviewDifficulty === "intense" ? 5 : interviewDifficulty === "warmup" ? -3 : 0;
    const timeBonus = elapsed > 300 ? 5 : elapsed > 120 ? 3 : 0;
    const questionBonus = Math.min(5, Math.floor(transcript.filter(t => t.speaker === "user").length * 1.5));
    const fallbackScore = Math.min(98, Math.max(60, baseScore + difficultyBonus + timeBonus + questionBonus));

    // Try LLM evaluation if user gave real answers
    const hasRealAnswers = transcript.some(t => t.speaker === "user" && !t.text.startsWith("["));
    let score = fallbackScore;
    let aiFeedback = "";
    let skillScores: Record<string, number> | null = null;

    if (hasRealAnswers) {
      const evaluation = await fetchLLMEvaluation({
        transcript,
        type: interviewType,
        difficulty: interviewDifficulty,
        role: user?.targetRole || "senior leader",
        company: user?.targetCompany,
      });
      if (evaluation) {
        score = evaluation.overallScore;
        aiFeedback = evaluation.feedback;
        skillScores = evaluation.skillScores;
      }
    }

    const sessionId = Date.now().toString(36);
    const { localOk, cloudOk } = await saveSessionResult({
      id: sessionId,
      date: new Date().toISOString(),
      type: interviewType,
      difficulty: interviewDifficulty,
      focus: interviewFocus,
      duration: elapsed,
      score,
      questions: totalQuestions,
      transcript,
      ai_feedback: aiFeedback,
      skill_scores: skillScores,
    }, user?.id);

    if (!cloudOk && localOk) {
      setSaveWarning("Session saved locally but could not sync to cloud.");
    } else if (!localOk && !cloudOk) {
      setSaveWarning("Warning: Session could not be saved. Please check your connection.");
    }

    // Track practice timestamp
    const timestamps = user?.practiceTimestamps || [];
    updateUser({ practiceTimestamps: [...timestamps, new Date().toISOString()] });
    setEvaluating(false);

    // Brief delay to show save warning before navigating
    if (!localOk || !cloudOk) {
      await new Promise(r => setTimeout(r, 2500));
    }
    navigate(`/session/${sessionId}`);
  }, [navigate, elapsed, interviewType, interviewDifficulty, interviewFocus, totalQuestions, user, updateUser, currentStep, interviewScript.length, transcript]);

  return (
    <div style={{
      width: "100vw", height: "100vh", background: "#050506",
      display: "flex", flexDirection: "column", overflow: "hidden",
      fontFamily: font.ui,
    }}>
      {/* Keyframes */}
      <style>{`
        @keyframes avatarPulse { 0%, 100% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.15); opacity: 0.1; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes recordPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Offline banner */}
      {isOffline && (
        <div role="alert" style={{
          padding: "8px 16px", background: "rgba(196,112,90,0.15)", borderBottom: "1px solid rgba(196,112,90,0.3)",
          display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ember }}>
            You're offline. Your session will be saved locally and synced when you reconnect.
          </span>
        </div>
      )}

      {/* ─── Top Bar ─── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 24px", borderBottom: `1px solid ${c.border}`,
        background: "rgba(10,10,11,0.9)", backdropFilter: "blur(12px)",
        zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, letterSpacing: "0.04em" }}>
            Level Up
          </span>
          <div style={{ width: 1, height: 20, background: c.border }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Recording indicator */}
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: phase === "done" ? c.stone : c.ember,
              animation: phase !== "done" ? "recordPulse 1.5s ease-in-out infinite" : "none",
            }} />
            <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 500, color: c.ivory }}>
              {formatTime(elapsed)}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Progress pills */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Q{currentQuestionNum}/{totalQuestions}</span>
            <div style={{ display: "flex", gap: 3 }}>
              {interviewScript.filter(s => s.type === "question" || s.type === "closing").map((_, i) => (
                <div key={i} style={{
                  width: i < currentQuestionNum ? 20 : 12, height: 3, borderRadius: 2,
                  background: i < currentQuestionNum ? c.gilt : i === currentQuestionNum ? "rgba(201,169,110,0.4)" : c.border,
                  transition: "all 0.3s ease",
                }} />
              ))}
            </div>
          </div>

          {/* Interview type badge */}
          <div style={{
            padding: "4px 12px", borderRadius: 100,
            background: "rgba(201,169,110,0.06)",
            border: `1px solid rgba(201,169,110,0.12)`,
          }}>
            <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.gilt }}>{interviewType.charAt(0).toUpperCase() + interviewType.slice(1)} · {user?.targetRole || "Interview"}</span>
          </div>
        </div>
      </header>

      {/* ─── Main Interview Area ─── */}
      <div style={{ flex: 1, display: "flex", position: "relative", overflow: "hidden" }}>

        {/* AI Interviewer Panel (main) */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          position: "relative", padding: "40px 32px",
          background: `radial-gradient(ellipse at center, rgba(201,169,110,0.03) 0%, transparent 70%)`,
        }}>
          {/* AI Avatar */}
          <AIAvatar isSpeaking={phase === "speaking"} isThinking={phase === "thinking"} />

          {/* AI Name */}
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <p style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>AI Interviewer</p>
            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>
              {phase === "thinking" ? "Preparing next question..." :
               phase === "speaking" ? "Speaking" :
               phase === "listening" ? "Listening to your answer..." :
               "Interview complete"}
            </p>
          </div>

          {/* Waveform */}
          <div style={{ marginTop: 24, height: 36, width: 200 }}>
            <WaveformVisualizer active={phase === "speaking"} color={c.gilt} barCount={32} />
          </div>

          {/* LLM loading indicator */}
          {llmLoading && currentStep <= 1 && (
            <div style={{
              position: "absolute", top: 24, right: 24,
              padding: "8px 14px", borderRadius: 8,
              background: "rgba(10,10,11,0.7)",
              backdropFilter: "blur(8px)",
              border: `1px solid rgba(201,169,110,0.15)`,
              display: "flex", alignItems: "center", gap: 8,
              animation: "fadeUp 0.4s ease",
            }}>
              <div style={{ width: 12, height: 12, border: "2px solid rgba(201,169,110,0.3)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Generating personalized questions...</span>
            </div>
          )}

          {/* Score note hint */}
          {step?.scoreNote && phase !== "done" && (
            <div style={{
              position: "absolute", top: 24, left: 24,
              padding: "8px 14px", borderRadius: 8,
              background: "rgba(10,10,11,0.7)",
              backdropFilter: "blur(8px)",
              border: `1px solid ${c.border}`,
              animation: "fadeUp 0.4s ease",
            }}>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.gilt, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 2 }}>Evaluating</span>
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{step.scoreNote}</span>
            </div>
          )}

          {/* Live AI captions — centered near bottom */}
          <div style={{
            position: "absolute", bottom: 100, left: "50%", transform: "translateX(-50%)",
            width: "90%", maxWidth: 640,
            display: "flex", justifyContent: "center",
          }}>
            <LiveCaptions text={step?.aiText || ""} isTyping={phase === "speaking"} />
          </div>

          {/* Listening indicator + Next button */}
          {phase === "listening" && (
            <div style={{
              position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
              animation: "fadeUp 0.3s ease",
            }}>
              {/* Live transcript of user's speech */}
              {currentTranscript && (
                <div style={{
                  maxWidth: 500, padding: "10px 16px", borderRadius: 8,
                  background: "rgba(122,158,126,0.06)", border: "1px solid rgba(122,158,126,0.15)",
                  marginBottom: 4,
                }}>
                  <p style={{ fontFamily: font.ui, fontSize: 12, color: c.ivory, lineHeight: 1.5, margin: 0, opacity: 0.9 }}>
                    {currentTranscript}
                  </p>
                </div>
              )}

              {/* User speaking waveform */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <WaveformVisualizer active={!isMuted} color={c.sage} barCount={16} />
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: c.sage, animation: "recordPulse 1s ease-in-out infinite" }} />
                  <span style={{ fontFamily: font.mono, fontSize: 12, color: c.sage }}>{formatTime(answerTimer)}</span>
                </div>
              </div>

              <button
                onClick={handleNextQuestion}
                style={{
                  fontFamily: font.ui, fontSize: 13, fontWeight: 500,
                  padding: "10px 28px", borderRadius: 8,
                  background: "rgba(201,169,110,0.1)",
                  border: `1px solid rgba(201,169,110,0.2)`,
                  color: c.gilt, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                  transition: "all 0.2s ease", outline: "none",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.1)"; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                {currentStep < interviewScript.length - 1 ? "I'm done — next question" : "Finish answer"}
              </button>
            </div>
          )}

          {/* Done state */}
          {phase === "done" && (
            <div style={{
              position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
              animation: "slideUp 0.5s ease",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 16px", borderRadius: 100,
                background: "rgba(122,158,126,0.1)",
                border: `1px solid rgba(122,158,126,0.2)`,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2" strokeLinecap="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.sage }}>
                  Session complete · {formatTime(elapsed)}
                </span>
              </div>
              <button
                onClick={handleEnd}
                className="shimmer-btn"
                style={{
                  fontFamily: font.ui, fontSize: 14, fontWeight: 500,
                  padding: "12px 32px", borderRadius: 8,
                  background: c.gilt, color: c.obsidian,
                  border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                  boxShadow: "0 8px 32px rgba(201,169,110,0.15)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
              >
                View Feedback
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* User Webcam PiP */}
        <div className="interview-pip" style={{
          position: "absolute",
          top: 20, right: 20,
          width: 240, height: 180,
          borderRadius: 16,
          border: `2px solid ${phase === "listening" ? c.sage : c.border}`,
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          transition: "border-color 0.3s ease",
          zIndex: 5,
        }}>
          <UserWebcam isMuted={isMuted} isCameraOff={isCameraOff || evaluating} />
        </div>

        {/* Transcript Sidebar */}
        {showTranscript && (
          <div style={{
            width: 340, borderLeft: `1px solid ${c.border}`,
            background: "rgba(10,10,11,0.95)",
            backdropFilter: "blur(12px)",
            display: "flex", flexDirection: "column",
            animation: "fadeUp 0.2s ease",
          }}>
            <div style={{
              padding: "16px 20px",
              borderBottom: `1px solid ${c.border}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Transcript</span>
              <button onClick={() => setShowTranscript(false)} style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 4 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div ref={transcriptRef} style={{ flex: 1, overflow: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
              {transcript.length === 0 && (
                <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, textAlign: "center", padding: "40px 0" }}>Transcript will appear here...</p>
              )}
              {transcript.map((msg, i) => (
                <div key={i} style={{ display: "flex", gap: 10 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                    background: msg.speaker === "ai" ? "rgba(201,169,110,0.1)" : "rgba(122,158,126,0.1)",
                    border: `1px solid ${msg.speaker === "ai" ? "rgba(201,169,110,0.2)" : "rgba(122,158,126,0.2)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {msg.speaker === "ai" ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><circle cx="12" cy="12" r="3" /></svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: msg.speaker === "ai" ? c.gilt : c.sage }}>
                        {msg.speaker === "ai" ? "AI Interviewer" : "You"}
                      </span>
                      <span style={{ fontFamily: font.mono, fontSize: 9, color: c.stone }}>{msg.time}</span>
                    </div>
                    <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.6, margin: 0 }}>{msg.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Bottom Controls ─── */}
      <footer className="interview-controls" style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px 24px",
        borderTop: `1px solid ${c.border}`,
        background: "rgba(10,10,11,0.9)",
        backdropFilter: "blur(12px)",
        gap: 16,
        zIndex: 10,
      }}>
        {/* Left: interview info */}
        <div style={{ position: "absolute", left: 24, display: "flex", alignItems: "center", gap: 8 }}>
          {phase === "listening" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 100, background: "rgba(122,158,126,0.06)", border: `1px solid rgba(122,158,126,0.12)` }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: c.sage, animation: "recordPulse 1s ease-in-out infinite" }} />
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.sage }}>Your turn</span>
            </div>
          )}
          {phase === "speaking" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 100, background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.12)` }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: c.gilt, animation: "recordPulse 1s ease-in-out infinite" }} />
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt }}>AI speaking</span>
            </div>
          )}
        </div>

        {/* Center controls */}
        <ControlButton
          active={!isMuted}
          onClick={() => setIsMuted(!isMuted)}
          label={isMuted ? "Unmute" : "Mute"}
          icon={isMuted ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17" />
              <line x1="12" y1="19" x2="12" y2="23" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
            </svg>
          )}
        />

        <ControlButton
          active={!isCameraOff}
          onClick={() => setIsCameraOff(!isCameraOff)}
          label={isCameraOff ? "Turn camera on" : "Turn camera off"}
          icon={isCameraOff ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3.06 0H21a2 2 0 0 1 2 2v11" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" />
            </svg>
          )}
        />

        <div style={{ width: 1, height: 28, background: c.border, margin: "0 4px" }} />

        <ControlButton
          active={showTranscript}
          onClick={() => setShowTranscript(!showTranscript)}
          label="Toggle transcript"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          }
        />

        <ControlButton
          active={aiVoiceEnabled}
          onClick={() => {
            if (aiVoiceEnabled) ttsCancelRef.current?.();
            setAiVoiceEnabled(!aiVoiceEnabled);
          }}
          label={aiVoiceEnabled ? "Mute AI voice" : "Enable AI voice"}
          icon={aiVoiceEnabled ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          )}
        />

        <div style={{ width: 1, height: 28, background: c.border, margin: "0 4px" }} />

        <ControlButton
          onClick={() => phase === "done" ? handleEnd() : setShowEndModal(true)}
          label="End interview"
          danger
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
              <line x1="23" y1="1" x2="17" y2="7" />
              <line x1="17" y1="1" x2="23" y2="7" />
            </svg>
          }
        />

        {/* Right: keyboard shortcut hint */}
        <div style={{ position: "absolute", right: 24 }}>
          {phase === "listening" && (
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>
              Press <kbd style={{ fontFamily: font.mono, fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "rgba(240,237,232,0.06)", border: `1px solid ${c.border}`, color: c.chalk }}>Enter</kbd> when done
            </span>
          )}
        </div>
      </footer>

      {/* End Interview Modal */}
      {showEndModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
          animation: "fadeUp 0.15s ease",
        }}>
          <div style={{
            background: c.graphite, borderRadius: 16,
            border: `1px solid ${c.border}`,
            padding: "32px", maxWidth: 400, width: "90%",
            textAlign: "center",
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%", margin: "0 auto 20px",
              background: "rgba(196,112,90,0.08)",
              border: `1px solid rgba(196,112,90,0.2)`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5" strokeLinecap="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3 style={{ fontFamily: font.ui, fontSize: 18, fontWeight: 600, color: c.ivory, marginBottom: 8 }}>End interview early?</h3>
            <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, lineHeight: 1.6, marginBottom: 24 }}>
              You've completed {currentQuestionNum} of {totalQuestions} questions. Ending now will still generate feedback based on your answers so far.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={() => setShowEndModal(false)}
                style={{
                  fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory,
                  background: "rgba(240,237,232,0.04)", border: `1px solid ${c.border}`,
                  borderRadius: 8, padding: "10px 24px", cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(240,237,232,0.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(240,237,232,0.04)"; }}
              >
                Continue
              </button>
              <button onClick={handleEnd}
                style={{
                  fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory,
                  background: c.ember, border: "none",
                  borderRadius: 8, padding: "10px 24px", cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
              >
                End Interview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evaluating overlay */}
      {evaluating && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
        }}>
          <div style={{ width: 48, height: 48, border: `3px solid ${c.border}`, borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 24 }} />
          <h3 style={{ fontFamily: font.ui, fontSize: 18, fontWeight: 600, color: c.ivory, marginBottom: 8 }}>Analyzing your performance...</h3>
          <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>AI is evaluating your answers and generating personalized feedback</p>
          {saveWarning && (
            <div role="alert" style={{ marginTop: 20, padding: "12px 20px", borderRadius: 10, background: "rgba(196,112,90,0.1)", border: "1px solid rgba(196,112,90,0.2)", maxWidth: 400 }}>
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.ember, margin: 0 }}>{saveWarning}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
