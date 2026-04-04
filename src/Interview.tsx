import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import type { User } from "./AuthContext";
import { speak } from "./tts";
import { saveSession, getAuthToken } from "./supabase";

/* ─── IndexedDB transcript backup ─── */
const IDB_NAME = "hireready";
const IDB_STORE = "drafts";
function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveToIDB(key: string, data: unknown) {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(data, key);
    db.close();
  } catch {}
}
async function loadFromIDB(key: string): Promise<unknown | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
      db.close();
    });
  } catch { return null; }
}
async function deleteFromIDB(key: string) {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    db.close();
  } catch {}
}

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

/* ─── Mini Interview Script (3 questions for onboarding) ─── */
function getMiniScript(user: User | null): InterviewStep[] {
  const name = user?.name?.split(" ")[0] || "";
  const role = user?.targetRole || "the role";
  const hasResume = !!user?.resumeFileName;
  const latestRole = user?.resumeData?.experience?.[0];

  const resumeContext = hasResume && latestRole
    ? ` I've reviewed your resume — I can see you were ${latestRole.title}${latestRole.company ? ` at ${latestRole.company}` : ""}. I'll reference your background in my questions.`
    : "";

  // When we have resume context, tailor questions to their experience
  const q1 = hasResume && latestRole
    ? `Based on your experience as ${latestRole.title}, tell me about a time you had to make a tough decision with incomplete information. What was the situation, and how did you approach it?`
    : "Tell me about a time you had to make a tough decision with incomplete information. What was the situation, and how did you approach it?";

  const q2 = hasResume && latestRole
    ? `In your role as ${latestRole.title}, what's the biggest challenge you faced working with cross-functional teams, and how did you handle it?`
    : "What's the biggest challenge you've faced working with cross-functional teams, and how did you handle it?";

  const q3 = hasResume
    ? `Imagine you're stepping into a new ${role} position and you find that team velocity has dropped 40% over the last quarter. Given your background, what would be your first three steps?`
    : `If you joined a new team tomorrow as a ${role} and found that velocity had dropped 40% over the last quarter, what would be your first three steps?`;

  return [
    { type: "intro", aiText: `Hi${name ? ` ${name}` : ""}! Welcome to HireReady. This is a quick 3-question practice round for the ${role} position.${resumeContext} I'll ask you real interview questions and give you a score at the end. Ready? Let's go.`, thinkingDuration: 800, speakingDuration: 5000, waitForUser: true },
    { type: "question", aiText: q1, thinkingDuration: 1200, speakingDuration: 4000, waitForUser: true, scoreNote: "STAR structure, decision-making clarity, outcome" },
    { type: "question", aiText: q2, thinkingDuration: 1200, speakingDuration: 3500, waitForUser: true, scoreNote: "Collaboration, communication, conflict resolution" },
    { type: "question", aiText: q3, thinkingDuration: 1200, speakingDuration: 4000, waitForUser: true, scoreNote: "Analytical thinking, prioritization, leadership approach" },
    { type: "closing", aiText: "Great answers! That wraps up your quick practice round. Let me calculate your score — you'll see detailed feedback in just a moment.", thinkingDuration: 1000, speakingDuration: 4000, waitForUser: false },
  ];
}

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
const RESULTS_KEY = "hireready_sessions";

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
  const attempt = async (): Promise<InterviewStep[] | null> => {
    const headers = await import("./supabase").then(m => m.authHeaders());
    const res = await fetch("/api/generate-questions", {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.retryAfter ? `Too many requests. Please wait ${data.retryAfter} seconds and try again.` : "Too many requests. Please wait a moment and try again.");
    }
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.questions || !Array.isArray(data.questions)) return null;
    return data.questions.map((q: { type?: string; aiText?: string; text?: string; scoreNote?: string }) => ({
      type: (q.type || "question") as InterviewStep["type"],
      aiText: q.aiText || q.text || "",
      thinkingDuration: q.type === "intro" ? 1000 : 1500,
      speakingDuration: 5000,
      waitForUser: q.type !== "closing",
      scoreNote: q.scoreNote || "",
    }));
  };
  // Retry once on network errors
  for (let i = 0; i < 2; i++) {
    try {
      return await attempt();
    } catch (err) {
      if (err instanceof Error && err.message.includes("Too many requests")) throw err;
      if (i === 1 || !(err instanceof TypeError)) return null;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return null;
}

/* ─── LLM Answer Evaluation ─── */
async function fetchLLMEvaluation(params: {
  transcript: { speaker: string; text: string }[];
  type: string; difficulty: string; role: string; company?: string;
}, timeoutMs = 35000): Promise<{
  overallScore: number;
  skillScores: Record<string, number>;
  strengths: string[];
  improvements: string[];
  feedback: string;
} | null> {
  try {
    const headers = await import("./supabase").then(m => m.authHeaders());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch("/api/evaluate", {
      method: "POST",
      headers,
      body: JSON.stringify(params),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.retryAfter ? `Too many requests. Please wait ${data.retryAfter} seconds and try again.` : "Too many requests. Please wait a moment and try again.");
    }
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Evaluation timed out. Using estimated score.");
    }
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
    <div style={{ position: "relative", width: 56, height: 56 }}>
      {/* Subtle pulse ring when speaking */}
      {isSpeaking && (
        <div style={{
          position: "absolute", inset: -4, borderRadius: "50%",
          border: `1.5px solid ${c.gilt}`,
          opacity: 0.25,
          animation: "avatarPulse 2s ease-in-out infinite",
        }} />
      )}

      {/* Thinking indicator */}
      {isThinking && (
        <div style={{
          position: "absolute", inset: -4, borderRadius: "50%",
          border: `1.5px dashed rgba(201,169,110,0.3)`,
          animation: "spin 6s linear infinite",
        }} />
      )}

      {/* Avatar circle */}
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: `linear-gradient(145deg, rgba(201,169,110,0.12) 0%, rgba(201,169,110,0.04) 100%)`,
        border: `1.5px solid ${isSpeaking ? "rgba(201,169,110,0.5)" : isThinking ? "rgba(201,169,110,0.25)" : c.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.4s ease",
        boxShadow: isSpeaking ? "0 0 24px rgba(201,169,110,0.1)" : "none",
      }}>
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2m0 18v2m-9-11h2m18 0h2" />
          <path d="M5.6 5.6l1.4 1.4m9.9 9.9l1.4 1.4M5.6 18.4l1.4-1.4m9.9-9.9l1.4-1.4" />
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
    <div style={{ width: "100%" }}>
      <p style={{
        fontFamily: font.ui, fontSize: 14, color: c.chalk,
        lineHeight: 1.75, margin: 0, minHeight: 22,
      }}>
        {displayText}
        {isTyping && charIndex < text.length && (
          <span style={{ display: "inline-block", width: 2, height: 15, background: c.gilt, marginLeft: 2, verticalAlign: "text-bottom", animation: "blink 0.8s ease-in-out infinite" }} />
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
            <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round">
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
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round">
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
  const rawType = searchParams.get("type");
  const interviewType = (rawType && rawType !== "undefined" && rawType !== "null") ? rawType : "behavioral";
  const interviewFocus = searchParams.get("focus") || "general";
  const interviewDifficulty = searchParams.get("difficulty") || "standard";
  const isMiniMode = searchParams.get("mini") === "true";
  // Restore draft if resuming
  const draftKey = `hireready_interview_draft_${user?.id || "anon"}`;
  const isResuming = searchParams.get("resume") === "true";
  const draftRef = useRef<{ transcript: any[]; currentStep: number; elapsed: number } | null>(null);
  if (isResuming && !draftRef.current) {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) draftRef.current = JSON.parse(raw);
    } catch {}
  }

  const fallbackScript = isMiniMode ? getMiniScript(user) : getScript(interviewType, interviewDifficulty, user);
  const [interviewScript, setInterviewScript] = useState<InterviewStep[]>(fallbackScript);
  const [llmLoading, setLlmLoading] = useState(!draftRef.current && !isMiniMode);

  // Interview state (declared early so refs can use it)
  const [currentStep, setCurrentStep] = useState(draftRef.current?.currentStep || 0);

  // Async IndexedDB fallback — if localStorage had no draft, try IDB
  useEffect(() => {
    if (!isResuming || draftRef.current) return;
    loadFromIDB(draftKey).then(data => {
      if (data && typeof data === "object" && "transcript" in (data as any)) {
        const d = data as any;
        draftRef.current = d;
        setCurrentStep(d.currentStep || 0);
        setTranscript(d.transcript || []);
        setElapsed(d.elapsed || 0);
      }
    });
  }, []);

  // Fetch LLM-generated questions on mount
  const currentStepRef = useRef(0);
  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    if (isMiniMode) return; // Mini mode uses built-in script, no LLM fetch
    let cancelled = false;
    fetchLLMQuestions({
      type: interviewType,
      difficulty: interviewDifficulty,
      role: user?.targetRole || "senior leader",
      company: user?.targetCompany,
      industry: user?.industry,
      resumeText: user?.resumeText,
    }).then(questions => {
      if (cancelled) return;
      if (questions && questions.length > 0 && currentStepRef.current <= 1) {
        setInterviewScript(questions);
      } else if (!questions) {
        setSaveWarning("AI questions unavailable. Using practice questions instead.");
      }
      setLlmLoading(false);
    }).catch(err => {
      if (!cancelled) {
        setSaveWarning(err.message || "Could not generate questions. Using practice questions.");
        setLlmLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Speech recognition
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [phase, setPhase] = useState<"thinking" | "speaking" | "listening" | "done">("thinking");
  const [elapsed, setElapsed] = useState(draftRef.current?.elapsed || 0);
  const [isRecording, setIsRecording] = useState(false);

  // Controls
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  // Transcript history
  const [transcript, setTranscript] = useState<{ speaker: "ai" | "user"; text: string; time: string }[]>(draftRef.current?.transcript || []);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // End interview modal
  const [showEndModal, setShowEndModal] = useState(false);

  // Offline + save status + mic error
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [saveWarning, setSaveWarning] = useState("");
  const [micError, setMicError] = useState("");
  const [usedFallbackScore, setUsedFallbackScore] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evalElapsed, setEvalElapsed] = useState(0);

  // Eval elapsed timer
  useEffect(() => {
    if (!evaluating) { setEvalElapsed(0); return; }
    const t = setInterval(() => setEvalElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [evaluating]);

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
  const interviewEndedRef = useRef(false);

  // Warn user before closing tab during active interview + auto-save draft
  useEffect(() => {
    if (phase === "done" || evaluating) return;
    const saveDraft = () => {
      const draftData = {
        transcript, currentStep, elapsed, interviewType, interviewDifficulty, interviewFocus,
        savedAt: Date.now(),
      };
      try { localStorage.setItem(draftKey, JSON.stringify(draftData)); } catch {}
      saveToIDB(draftKey, draftData);
    };
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      saveDraft();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    // Auto-save every 30 seconds during active interview
    const autoSaveInterval = setInterval(saveDraft, 30_000);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearInterval(autoSaveInterval);
    };
  }, [phase, evaluating, transcript, currentStep, elapsed, interviewType, interviewDifficulty, interviewFocus]);

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
        recognition.onerror = (event: any) => {
          const error = event?.error || "unknown";
          if (error === "not-allowed") {
            setMicError("Microphone access denied. Check browser permissions.");
          } else if (error === "no-speech") {
            // Silence — auto-restarts, no need to alert
          } else if (error === "network") {
            setMicError("Speech recognition network error. Your answers are still being recorded via text.");
          } else if (error !== "aborted") {
            setMicError("Microphone issue detected. Try unmuting or refreshing.");
          }
        };
        recognition.onend = () => {
          // Auto-restart only if not stopped by cleanup and interview hasn't ended
          if (!stopped && !interviewEndedRef.current) {
            try { recognition.start(); } catch {}
          }
        };
        try { recognition.start(); } catch (e) {
          console.warn("Speech recognition failed to start:", e);
          setMicError("Could not start speech recognition. Try refreshing.");
        }
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

  const step = interviewScript[currentStep] ?? interviewScript[interviewScript.length - 1];
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
    if (!step) return;

    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

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

      let speechEnded = false;
      const onSpeechEnd = () => {
        if (speechEnded) return; // prevent double-fire
        speechEnded = true;
        if (safetyTimer) clearTimeout(safetyTimer);
        setIsRecording(false);
        if (step.waitForUser) {
          setPhase("listening");
        } else {
          setTimeout(() => setPhase("done"), 2000);
        }
      };

      // Safety timeout: force transition if TTS hangs or never fires callback
      safetyTimer = setTimeout(() => {
        if (!speechEnded) {
          console.warn("[interview] TTS safety timeout — forcing phase transition");
          onSpeechEnd();
        }
      }, Math.max(step.speakingDuration + 5000, 30000));

      if (aiVoiceEnabled) {
        // Use unified TTS service (Google Cloud or browser fallback)
        speak(step.aiText, onSpeechEnd, onSpeechEnd).then(handle => {
          ttsCancelRef.current = handle.cancel;
        }).catch(() => { onSpeechEnd(); });
      } else {
        // No voice — use timer fallback
        const speakTimer = setTimeout(onSpeechEnd, step.speakingDuration);
        ttsCancelRef.current = () => clearTimeout(speakTimer);
      }
    }, step.thinkingDuration);

    return () => {
      clearTimeout(thinkTimer);
      if (safetyTimer) clearTimeout(safetyTimer);
      ttsCancelRef.current?.();
    };
  }, [currentStep, aiVoiceEnabled]);

  // Handle user "finishing" their answer
  const advancingRef = useRef(false);
  const handleNextQuestion = useCallback(() => {
    if (phase !== "listening" || advancingRef.current) return;
    advancingRef.current = true;
    setTimeout(() => { advancingRef.current = false; }, 500);

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
  const handleEnd = useCallback(async () => {
    // Immediately stop everything
    interviewEndedRef.current = true;
    setPhase("done");
    ttsCancelRef.current?.();
    ttsCancelRef.current = null;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setAiVoiceEnabled(false); // prevent interview flow effect from restarting
    setIsCameraOff(true); // stop camera immediately
    setIsMuted(true); // stop mic
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
      try {
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
        } else {
          setUsedFallbackScore(true);
        }
      } catch (err) {
        setUsedFallbackScore(true);
        setSaveWarning(err instanceof Error ? err.message : "Could not get AI feedback. Using estimated score.");
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

    // Clear draft and track practice timestamp
    try { localStorage.removeItem(draftKey); } catch {}
    deleteFromIDB(draftKey);
    const timestamps = user?.practiceTimestamps || [];
    updateUser({ practiceTimestamps: [...timestamps, new Date().toISOString()] });
    setEvaluating(false);

    // Brief delay to show save warning before navigating
    if (!localOk || !cloudOk) {
      await new Promise(r => setTimeout(r, 2500));
    }

    if (isMiniMode) {
      navigate("/onboarding/complete", {
        state: {
          score,
          aiFeedback,
          skillScores,
          sessionId,
          type: interviewType,
          duration: elapsed,
        },
      });
    } else {
      navigate(`/session/${sessionId}`);
    }
  }, [navigate, elapsed, interviewType, interviewDifficulty, interviewFocus, totalQuestions, user, updateUser, currentStep, interviewScript.length, transcript]);

  return (
    <div style={{
      width: "100vw", height: "100vh", background: c.obsidian,
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
        @keyframes gentlePulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(122,158,126,0.3); } 50% { box-shadow: 0 0 0 8px rgba(122,158,126,0); } }
        /* Responsive: stack panels on narrow screens */
        @media (max-width: 800px) {
          .interview-split { flex-direction: column !important; }
          .interview-left { flex: 1 1 auto !important; min-height: 0 !important; }
          .interview-right { width: 100% !important; max-width: none !important; min-width: 0 !important; height: 200px !important; flex: 0 0 200px !important; border-left: none !important; border-top: 1px solid rgba(240,237,232,0.06) !important; }
          .interview-right > div:first-child { margin: 8px !important; }
          .interview-right .interview-stats { display: none !important; }
          .interview-transcript-panel { width: 100% !important; max-width: none !important; min-width: 0 !important; height: 50% !important; flex: 0 0 50% !important; border-left: none !important; border-top: 1px solid rgba(240,237,232,0.06) !important; }
          .interview-avatar-row { padding: 16px 16px 0 !important; gap: 12px !important; }
          .interview-avatar-row .ai-avatar-wrap { display: none; }
          .interview-qcard { padding: 12px 16px !important; }
          .interview-header-right .header-controls { display: none !important; }
          .interview-pip-float { width: 100px !important; height: 75px !important; bottom: 8px !important; right: 8px !important; }
        }
        @media (max-width: 480px) {
          .interview-header-left .interview-type-badge { display: none !important; }
        }
      `}</style>

      {/* Offline banner */}
      {isOffline && (
        <div role="alert" style={{
          padding: "8px 16px", background: "rgba(196,112,90,0.15)", borderBottom: "1px solid rgba(196,112,90,0.3)",
          display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
        }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ember }}>
            You're offline. Your session will be saved locally and synced when you reconnect.
          </span>
        </div>
      )}

      {/* Mic error banner */}
      {micError && (
        <div role="alert" style={{
          padding: "8px 16px", background: "rgba(196,112,90,0.1)", borderBottom: "1px solid rgba(196,112,90,0.2)",
          display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ember }}>{micError}</span>
          </div>
          <button onClick={() => setMicError("")} style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 2 }}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      {/* ─── Top Bar ─── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", borderBottom: `1px solid ${c.border}`,
        background: c.graphite,
        zIndex: 10, flexShrink: 0,
      }}>
        <div className="interview-header-left" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, letterSpacing: "0.04em" }}>
            HireReady
          </span>
          <div style={{ width: 1, height: 18, background: c.border }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%",
              background: phase === "done" ? c.stone : c.ember,
              animation: phase !== "done" ? "recordPulse 1.5s ease-in-out infinite" : "none",
            }} />
            <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 500, color: c.ivory }}>
              {formatTime(elapsed)}
            </span>
          </div>
          <div className="interview-type-badge" style={{
            padding: "3px 10px", borderRadius: 100,
            background: "rgba(201,169,110,0.06)",
            border: `1px solid rgba(201,169,110,0.12)`,
          }}>
            <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 500, color: c.gilt, letterSpacing: "0.02em" }}>
              {interviewFocus.charAt(0).toUpperCase() + interviewFocus.slice(1)}{user?.targetRole ? ` · ${user.targetRole}` : ""}
            </span>
          </div>
        </div>

        <div className="interview-header-right" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Progress */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: c.stone }}>Q{currentQuestionNum}/{totalQuestions}</span>
            <div style={{ display: "flex", gap: 3 }}>
              {interviewScript.filter(s => s.type === "question" || s.type === "closing").map((_, i) => (
                <div key={i} style={{
                  width: i < currentQuestionNum ? 18 : 10, height: 3, borderRadius: 2,
                  background: i < currentQuestionNum ? c.gilt : i === currentQuestionNum ? "rgba(201,169,110,0.4)" : "rgba(240,237,232,0.08)",
                  transition: "all 0.3s ease",
                }} />
              ))}
            </div>
          </div>

          {/* LLM loading indicator */}
          {llmLoading && currentStep <= 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, border: "1.5px solid rgba(201,169,110,0.3)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Generating questions...</span>
            </div>
          )}

          {/* Quick controls */}
          <div className="header-controls" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={() => setIsMuted(!isMuted)}
              title={isMuted ? "Unmute" : "Mute"}
              aria-label={isMuted ? "Unmute" : "Mute"}
              style={{ width: 32, height: 32, borderRadius: 8, background: isMuted ? "rgba(196,112,90,0.1)" : "transparent", border: `1px solid ${isMuted ? "rgba(196,112,90,0.2)" : "transparent"}`, color: isMuted ? c.ember : c.stone, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}
            >
              {isMuted ? (
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
              ) : (
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
              )}
            </button>
            <button
              onClick={() => setIsCameraOff(!isCameraOff)}
              title={isCameraOff ? "Turn camera on" : "Turn camera off"}
              aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"}
              style={{ width: 32, height: 32, borderRadius: 8, background: isCameraOff ? "rgba(196,112,90,0.1)" : "transparent", border: `1px solid ${isCameraOff ? "rgba(196,112,90,0.2)" : "transparent"}`, color: isCameraOff ? c.ember : c.stone, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}
            >
              {isCameraOff ? (
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3.06 0H21a2 2 0 0 1 2 2v11"/><circle cx="12" cy="13" r="3"/></svg>
              ) : (
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
              )}
            </button>
            <button
              onClick={() => { if (aiVoiceEnabled) ttsCancelRef.current?.(); setAiVoiceEnabled(!aiVoiceEnabled); }}
              title={aiVoiceEnabled ? "Mute AI voice" : "Enable AI voice"}
              aria-label={aiVoiceEnabled ? "Mute AI voice" : "Enable AI voice"}
              style={{ width: 32, height: 32, borderRadius: 8, background: !aiVoiceEnabled ? "rgba(196,112,90,0.1)" : "transparent", border: `1px solid ${!aiVoiceEnabled ? "rgba(196,112,90,0.2)" : "transparent"}`, color: !aiVoiceEnabled ? c.ember : c.stone, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}
            >
              {aiVoiceEnabled ? (
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              ) : (
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
              )}
            </button>
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              title="Toggle transcript"
              aria-label="Toggle transcript"
              style={{ width: 32, height: 32, borderRadius: 8, background: showTranscript ? "rgba(201,169,110,0.1)" : "transparent", border: `1px solid ${showTranscript ? "rgba(201,169,110,0.2)" : "transparent"}`, color: showTranscript ? c.gilt : c.stone, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}
            >
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
          </div>

        </div>
      </header>

      {/* ─── Main Split Layout ─── */}
      <div className="interview-split" style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ═══ LEFT PANEL: AI Interviewer ═══ */}
        <div className="interview-left" style={{
          flex: showTranscript ? "0 0 55%" : "1 1 60%",
          display: "flex", flexDirection: "column",
          position: "relative", overflow: "hidden",
          transition: "flex 0.3s ease",
        }}>
          {/* AI section — avatar + status */}
          <div className="interview-avatar-row" style={{
            display: "flex", alignItems: "center", gap: 16,
            padding: "20px 28px 0",
          }}>
            <div className="ai-avatar-wrap" style={{ position: "relative", flexShrink: 0 }}>
              <AIAvatar isSpeaking={phase === "speaking"} isThinking={phase === "thinking"} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
                <p style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, margin: 0 }}>AI Interviewer</p>
                <span aria-live="polite" style={{
                  fontFamily: font.ui, fontSize: 10, fontWeight: 500,
                  color: phase === "speaking" ? c.gilt : phase === "listening" ? c.sage : c.stone,
                  padding: "2px 8px", borderRadius: 100,
                  background: phase === "speaking" ? "rgba(201,169,110,0.08)" : phase === "listening" ? "rgba(122,158,126,0.08)" : "transparent",
                }}>
                  {phase === "thinking" ? "Preparing..." :
                   phase === "speaking" ? "Speaking" :
                   phase === "listening" ? "Listening" :
                   "Complete"}
                </span>
              </div>
              {/* Waveform — compact */}
              <div style={{ height: 20, width: 120, marginTop: 4 }}>
                <WaveformVisualizer active={phase === "speaking"} color={c.gilt} barCount={18} />
              </div>
            </div>
          </div>

          {/* Question Card */}
          <div className="interview-qcard" style={{ flex: 1, padding: "20px 28px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Current question / AI speech */}
            <div style={{
              background: c.graphite, borderRadius: 12,
              border: `1px solid ${phase === "speaking" ? "rgba(201,169,110,0.12)" : c.border}`,
              padding: "20px 24px", flex: "0 0 auto",
              transition: "all 0.4s ease",
            }}>
              {/* Score note — subtle, sentence-case */}
              {step?.scoreNote && phase !== "done" && (
                <p style={{
                  fontFamily: font.ui, fontSize: 11, color: "rgba(201,169,110,0.6)",
                  letterSpacing: "0.02em", margin: "0 0 10px",
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(201,169,110,0.5)" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
                  {step.scoreNote}
                </p>
              )}

              {/* Show LiveCaptions only while speaking, static text otherwise */}
              {phase === "speaking" ? (
                <LiveCaptions text={step?.aiText || ""} isTyping={true} />
              ) : step?.aiText ? (
                <p style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, lineHeight: 1.75, margin: 0 }}>
                  {step.aiText}
                </p>
              ) : null}
            </div>

            {/* User's response area — grows to fill remaining space */}
            <div style={{ flex: 1, minHeight: 0, marginTop: 16, display: "flex", flexDirection: "column" }}>
              {/* Listening state: user speaking area */}
              {phase === "listening" && (
                <div style={{
                  flex: 1, borderRadius: 14,
                  background: "rgba(122,158,126,0.03)",
                  border: `1px solid rgba(122,158,126,0.12)`,
                  padding: "20px 24px",
                  display: "flex", flexDirection: "column",
                  animation: "fadeUp 0.3s ease",
                }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: c.sage, animation: "recordPulse 1s ease-in-out infinite" }} />
                      <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.sage }}>Your answer</span>
                      <span style={{ fontFamily: font.mono, fontSize: 11, color: answerTimer >= 180 ? c.ember : answerTimer >= 120 ? c.gilt : c.stone }}>{formatTime(answerTimer)}</span>
                    </div>
                    <WaveformVisualizer active={!isMuted} color={c.sage} barCount={12} />
                  </div>

                  {/* Live transcript */}
                  <div style={{ flex: 1, overflowY: "auto" }}>
                    {currentTranscript ? (
                      <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, lineHeight: 1.7, margin: 0, opacity: 0.9 }}>
                        {currentTranscript}
                        <span style={{ display: "inline-block", width: 2, height: 14, background: c.sage, marginLeft: 2, verticalAlign: "text-bottom", animation: "blink 0.8s ease-in-out infinite" }} />
                      </p>
                    ) : (
                      <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, lineHeight: 1.7, margin: 0, fontStyle: "italic" }}>
                        Start speaking — your answer will appear here...
                      </p>
                    )}
                  </div>

                  {/* Answer time nudge */}
                  {answerTimer >= 120 && (
                    <div
                      role="status"
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 12px", borderRadius: 8, marginTop: 12,
                        background: answerTimer >= 180 ? "rgba(196,112,90,0.08)" : "rgba(201,169,110,0.06)",
                        border: `1px solid ${answerTimer >= 180 ? "rgba(196,112,90,0.15)" : "rgba(201,169,110,0.12)"}`,
                        animation: "fadeUp 0.3s ease",
                      }}
                    >
                      <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={answerTimer >= 180 ? c.ember : c.gilt} strokeWidth="1.5" strokeLinecap="round">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                      <span style={{ fontFamily: font.ui, fontSize: 11, color: answerTimer >= 180 ? c.ember : c.gilt }}>
                        {answerTimer >= 180
                          ? "3+ minutes — try wrapping up with your key takeaway"
                          : "2 minutes — consider landing your main point soon"}
                      </span>
                    </div>
                  )}

                  {/* Next question button */}
                  <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                    <button
                      onClick={handleNextQuestion}
                      style={{
                        fontFamily: font.ui, fontSize: 13, fontWeight: 600,
                        padding: "10px 24px", borderRadius: 10,
                        background: `linear-gradient(135deg, ${c.gilt}, #B8923E)`,
                        border: "none", color: c.obsidian, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 8,
                        transition: "all 0.2s ease",
                        boxShadow: "0 4px 16px rgba(201,169,110,0.2)",
                        animation: "gentlePulse 2s ease-in-out infinite",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(201,169,110,0.3)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(201,169,110,0.2)"; }}
                    >
                      {currentStep < interviewScript.length - 1 ? "Next Question" : "Finish"}
                      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Done state */}
              {phase === "done" && (
                <div style={{
                  flex: 1, borderRadius: 14,
                  background: "rgba(122,158,126,0.04)",
                  border: `1px solid rgba(122,158,126,0.15)`,
                  padding: "32px", display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 16,
                  animation: "slideUp 0.5s ease",
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: "50%",
                    background: "rgba(122,158,126,0.1)",
                    border: `1px solid rgba(122,158,126,0.2)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2" strokeLinecap="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  </div>
                  <p style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory }}>Session complete</p>
                  <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>{currentQuestionNum} questions answered · {formatTime(elapsed)}</p>
                  <p style={{ fontFamily: font.ui, fontSize: 12, color: c.gilt, marginTop: 4 }}>Click "View Feedback" below to see your results</p>
                </div>
              )}

              {/* Last user answer recap during thinking/speaking */}
              {(phase === "thinking" || phase === "speaking") && (() => {
                const lastUserMsg = [...transcript].reverse().find(t => t.speaker === "user");
                if (!lastUserMsg) return null;
                return (
                  <div style={{
                    borderRadius: 10, padding: "14px 18px", marginTop: 4,
                    background: "rgba(122,158,126,0.03)",
                    border: `1px solid rgba(122,158,126,0.08)`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(122,158,126,0.4)" }} />
                      <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, letterSpacing: "0.03em" }}>Your last answer</span>
                    </div>
                    <p style={{
                      fontFamily: font.ui, fontSize: 12, color: "rgba(197,192,186,0.6)", lineHeight: 1.5, margin: 0,
                      overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                    }}>{lastUserMsg.text}</p>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* ═══ RIGHT PANEL: User Camera + Status ═══ */}
        {!showTranscript && (
          <div className="interview-right" style={{
            width: "35%", maxWidth: 480, minWidth: 280,
            borderLeft: `1px solid ${c.border}`,
            display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
            {/* Webcam feed */}
            <div style={{
              flex: 1, margin: "16px 16px 8px",
              borderRadius: 16,
              border: `2px solid ${phase === "listening" ? "rgba(122,158,126,0.4)" : c.border}`,
              overflow: "hidden",
              transition: "border-color 0.3s ease",
              boxShadow: phase === "listening" ? "0 0 24px rgba(122,158,126,0.08)" : "none",
            }}>
              <UserWebcam isMuted={isMuted} isCameraOff={isCameraOff || evaluating} />
            </div>

            {/* User status card below camera */}
            <div className="interview-stats" style={{ padding: "0 16px 16px" }}>
              <div style={{
                background: c.graphite, borderRadius: 12,
                border: `1px solid ${c.border}`,
                padding: "14px 16px",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory }}>
                    {user?.name?.split(" ")[0] || "You"}
                  </span>
                  <div style={{
                    padding: "2px 10px", borderRadius: 100,
                    background: phase === "listening" ? "rgba(122,158,126,0.1)" : phase === "speaking" ? "rgba(201,169,110,0.06)" : "rgba(240,237,232,0.04)",
                    border: `1px solid ${phase === "listening" ? "rgba(122,158,126,0.2)" : phase === "speaking" ? "rgba(201,169,110,0.12)" : c.border}`,
                  }}>
                    <span style={{
                      fontFamily: font.ui, fontSize: 10, fontWeight: 500,
                      color: phase === "listening" ? c.sage : phase === "speaking" ? c.gilt : c.stone,
                    }}>
                      {phase === "listening" ? "Your turn" : phase === "speaking" ? "Listening" : phase === "thinking" ? "Waiting" : "Done"}
                    </span>
                  </div>
                </div>
                {/* Mini stats row */}
                <div style={{ display: "flex", gap: 16 }}>
                  <div>
                    <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, display: "block" }}>Questions</span>
                    <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ivory }}>{currentQuestionNum}/{totalQuestions}</span>
                  </div>
                  <div>
                    <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, display: "block" }}>Duration</span>
                    <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ivory }}>{formatTime(elapsed)}</span>
                  </div>
                  <div>
                    <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, display: "block" }}>Answers</span>
                    <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ivory }}>{transcript.filter(t => t.speaker === "user").length}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ TRANSCRIPT SIDEBAR (replaces right panel when open) ═══ */}
        {showTranscript && (
          <div className="interview-transcript-panel" style={{
            width: "35%", maxWidth: 420, minWidth: 300,
            borderLeft: `1px solid ${c.border}`,
            background: c.graphite,
            display: "flex", flexDirection: "column",
            animation: "fadeUp 0.2s ease",
            position: "relative",
          }}>
            <div style={{
              padding: "14px 20px",
              borderBottom: `1px solid ${c.border}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Transcript</span>
              <button onClick={() => setShowTranscript(false)} aria-label="Close transcript" style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 4 }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {/* PiP webcam — above transcript list */}
            {!isCameraOff && (
              <div className="interview-pip-float" style={{
                margin: "12px 16px 0",
                height: 110, borderRadius: 10,
                border: `1.5px solid ${phase === "listening" ? "rgba(122,158,126,0.2)" : c.border}`,
                overflow: "hidden", flexShrink: 0,
              }}>
                <UserWebcam isMuted={isMuted} isCameraOff={false} />
              </div>
            )}
            <div ref={transcriptRef} aria-live="polite" aria-label="Interview transcript" style={{ flex: 1, overflow: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              {transcript.length === 0 && (
                <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, textAlign: "center", padding: "40px 0" }}>Transcript will appear here...</p>
              )}
              {transcript.map((msg, i) => (
                <div key={i} style={{ display: "flex", gap: 10 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                    background: msg.speaker === "ai" ? "rgba(201,169,110,0.08)" : "rgba(122,158,126,0.08)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {msg.speaker === "ai" ? (
                      <svg aria-hidden="true" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><circle cx="12" cy="12" r="3"/></svg>
                    ) : (
                      <svg aria-hidden="true" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: msg.speaker === "ai" ? c.gilt : c.sage }}>
                        {msg.speaker === "ai" ? "Interviewer" : "You"}
                      </span>
                      <span style={{ fontFamily: font.mono, fontSize: 9, color: c.stone }}>{msg.time}</span>
                    </div>
                    <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.55, margin: 0 }}>{msg.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Bottom Footer ─── */}
      <footer style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 24px",
        borderTop: `1px solid ${c.border}`,
        background: c.obsidian,
        flexShrink: 0, zIndex: 10,
      }}>
        {/* Left: phase pill */}
        <div style={{ width: 140 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 12px", borderRadius: 100,
            background: phase === "listening" ? "rgba(122,158,126,0.06)" : phase === "speaking" ? "rgba(201,169,110,0.05)" : "transparent",
            border: `1px solid ${phase === "listening" ? "rgba(122,158,126,0.12)" : phase === "speaking" ? "rgba(201,169,110,0.1)" : c.border}`,
          }}>
            {phase === "thinking" ? (
              <div style={{ width: 8, height: 8, border: "1.5px solid rgba(201,169,110,0.3)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            ) : phase === "done" ? (
              <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            ) : (
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: phase === "listening" ? c.sage : c.gilt, animation: "recordPulse 1.2s ease-in-out infinite" }} />
            )}
            <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 500, color: phase === "listening" ? c.sage : phase === "speaking" ? c.gilt : c.stone }}>
              {phase === "thinking" ? "Preparing" : phase === "speaking" ? "AI speaking" : phase === "listening" ? "Your turn" : "Complete"}
            </span>
          </div>
        </div>

        {/* Center: keyboard hint */}
        <div style={{ flex: 1, textAlign: "center" }}>
          {phase === "listening" && (
            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, letterSpacing: "0.02em" }}>
              <kbd style={{ fontFamily: font.mono, fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(240,237,232,0.04)", border: `1px solid ${c.border}`, color: c.chalk }}>Enter</kbd> to advance
            </span>
          )}
        </div>

        {/* Right: End / View Feedback */}
        <div style={{ width: 140, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => phase === "done" ? handleEnd() : setShowEndModal(true)}
            style={{
              fontFamily: font.ui, fontSize: 11, fontWeight: 500,
              padding: "6px 16px", borderRadius: 8,
              background: phase === "done" ? `linear-gradient(135deg, ${c.gilt}, #B8923E)` : "transparent",
              border: phase === "done" ? "none" : `1px solid rgba(240,237,232,0.08)`,
              color: phase === "done" ? c.obsidian : c.stone,
              cursor: "pointer", transition: "all 0.25s",
              display: "flex", alignItems: "center", gap: 5,
            }}
            onMouseEnter={(e) => {
              if (phase === "done") { e.currentTarget.style.filter = "brightness(1.1)"; }
              else { e.currentTarget.style.color = c.ember; e.currentTarget.style.borderColor = "rgba(196,112,90,0.2)"; }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "brightness(1)";
              if (phase !== "done") { e.currentTarget.style.color = c.stone; e.currentTarget.style.borderColor = "rgba(240,237,232,0.08)"; }
            }}
          >
            {phase === "done" ? (
              <>
                View Feedback
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </>
            ) : "End"}
          </button>
        </div>
      </footer>

      {/* End Interview Modal */}
      {showEndModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) setShowEndModal(false); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowEndModal(false);
            if (e.key === "Tab") {
              const modal = e.currentTarget.querySelector("[data-modal-content]") as HTMLElement;
              if (!modal) return;
              const focusable = modal.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
              if (focusable.length === 0) return;
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (e.shiftKey) {
                if (document.activeElement === first) { e.preventDefault(); last.focus(); }
              } else {
                if (document.activeElement === last) { e.preventDefault(); first.focus(); }
              }
            }
          }}
          ref={(el) => { if (el) { const btn = el.querySelector("button"); if (btn) btn.focus(); } }}
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)",
            animation: "fadeUp 0.15s ease",
          }}>
          <div data-modal-content style={{
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
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5" strokeLinecap="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h3 id="end-modal-title" style={{ fontFamily: font.ui, fontSize: 18, fontWeight: 600, color: c.ivory, marginBottom: 8 }}>End interview early?</h3>
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
          <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, opacity: 0.7, marginTop: 4 }}>
            {evalElapsed < 10 ? "This usually takes 10\u201330 seconds." : evalElapsed < 25 ? `Almost there... (${evalElapsed}s)` : `Taking longer than usual... (${evalElapsed}s)`}
          </p>
          <div style={{ width: 200, height: 3, borderRadius: 2, background: c.border, marginTop: 16, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 2, background: c.gilt, transition: "width 1s ease", width: `${Math.min(95, (evalElapsed / 30) * 100)}%` }} />
          </div>
          {usedFallbackScore && (
            <div style={{ marginTop: 16, padding: "10px 16px", borderRadius: 8, background: "rgba(201,169,110,0.06)", border: "1px solid rgba(201,169,110,0.12)", maxWidth: 400 }}>
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.gilt, margin: 0 }}>AI evaluation unavailable — using estimated score based on your session metrics.</p>
            </div>
          )}
          {saveWarning && (
            <div role="alert" style={{ marginTop: 12, padding: "12px 20px", borderRadius: 10, background: "rgba(196,112,90,0.1)", border: "1px solid rgba(196,112,90,0.2)", maxWidth: 400 }}>
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.ember, margin: 0 }}>{saveWarning}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
