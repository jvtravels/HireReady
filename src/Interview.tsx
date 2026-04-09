import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { track } from "@vercel/analytics";

import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import type { User } from "./AuthContext";
import { speak, prefetchTTS, cleanupTTS } from "./tts";
import { saveSession, getAuthToken } from "./supabase";
import { useToast } from "./Toast";
import { saveToIDB, loadFromIDB, deleteFromIDB } from "./interviewIDB";
import type { InterviewStep } from "./interviewScripts";
import { scriptsByType, defaultScript, getMiniScript, getScript } from "./interviewScripts";
import { saveSessionResult, fetchLLMQuestions, fetchLLMEvaluation, fetchFollowUp, retryQueuedEvals } from "./interviewAPI";
import type { SessionResult } from "./interviewAPI";
import { createDeepgramSTT, type DeepgramSTTHandle } from "./deepgramSTT";

/* Script definitions and generators imported from ./interviewScripts */

/* API client and session persistence imported from ./interviewAPI */

/* Offline eval retry imported from ./interviewAPI */

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

/* ─── Real Mic-Level Waveform Visualizer ─── */
const WaveformVisualizer = React.memo(function WaveformVisualizer({ active, color, barCount = 16, stream }: { active: boolean; color: string; barCount?: number; stream?: MediaStream | null }) {
  const [bars, setBars] = useState<number[]>(Array(barCount).fill(0.1));
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!active || !stream) { setBars(Array(barCount).fill(0.1)); return; }
    let cancelled = false;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    ctxRef.current = ctx;
    analyserRef.current = analyser;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const update = () => {
      if (cancelled) return;
      analyser.getByteFrequencyData(dataArray);
      const newBars: number[] = [];
      const step = Math.floor(dataArray.length / barCount);
      for (let i = 0; i < barCount; i++) {
        const idx = Math.min(i * step, dataArray.length - 1);
        newBars.push(0.08 + (dataArray[idx] / 255) * 0.92);
      }
      setBars(newBars);
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);

    return () => {
      cancelled = true;
      source.disconnect();
      ctx.close().catch(() => {});
      analyserRef.current = null;
      ctxRef.current = null;
    };
  }, [active, stream, barCount]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, height: 40 }}>
      {bars.map((h, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 2, height: `${h * 100}%`, background: color,
          opacity: active ? 0.8 : 0.15,
          transition: active ? "height 0.06s ease" : "height 0.5s ease, opacity 0.5s ease",
        }} />
      ))}
    </div>
  );
});

/* ─── Interviewer Names (deterministic per session) ─── */
const INTERVIEWER_NAMES = [
  "Arjun Mehta", "Priya Sharma", "David Chen", "Sarah Williams", "Rohan Kapoor",
  "Ananya Patel", "James Mitchell", "Kavya Nair", "Michael Torres", "Neha Gupta",
  "Benjamin Kofman", "Aisha Rahman", "Chris Anderson", "Deepika Iyer", "Alex Morgan",
];
function getInterviewerName(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return INTERVIEWER_NAMES[Math.abs(hash) % INTERVIEWER_NAMES.length];
}

/* ─── Network Indicator ─── */
const NetworkIndicator = React.memo(function NetworkIndicator() {
  const [quality, setQuality] = useState<"excellent" | "good" | "poor">("excellent");
  useEffect(() => {
    const check = () => {
      const conn = (navigator as any).connection;
      if (conn) {
        const dl = conn.downlink ?? 10;
        const rtt = conn.rtt ?? 0;
        if (dl >= 5 && rtt < 100) setQuality("excellent");
        else if (dl >= 1 && rtt < 300) setQuality("good");
        else setQuality("poor");
      } else {
        setQuality(navigator.onLine ? "excellent" : "poor");
      }
    };
    check();
    const conn = (navigator as any).connection;
    conn?.addEventListener?.("change", check);
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    const id = setInterval(check, 10_000);
    return () => {
      conn?.removeEventListener?.("change", check);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
      clearInterval(id);
    };
  }, []);
  const colors = { excellent: c.sage, good: c.gilt, poor: c.ember };
  const labels = { excellent: "Excellent", good: "Good", poor: "Poor" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 100, background: "rgba(245,242,237,0.04)", border: `1px solid ${colors[quality]}30` }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: colors[quality], boxShadow: `0 0 6px ${colors[quality]}60` }} />
      <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 500, color: colors[quality] }}>{labels[quality]}</span>
    </div>
  );
});

/* ─── Dot Grid Visualizer (AI speaking) ─── */
const DOT_GRID_SIZE = 7;
const DOT_COUNT = DOT_GRID_SIZE * DOT_GRID_SIZE;
const DotGridVisualizer = React.memo(function DotGridVisualizer({ active, thinking }: { active: boolean; thinking?: boolean }) {
  const [dots, setDots] = useState<number[]>(Array(DOT_COUNT).fill(0.15));

  useEffect(() => {
    if (!active && !thinking) { setDots(Array(DOT_COUNT).fill(0.15)); return; }
    const interval = active ? 80 : 200; // slower pulse for thinking
    const id = setInterval(() => {
      setDots(prev => prev.map((_, i) => {
        const row = Math.floor(i / DOT_GRID_SIZE);
        const col = i % DOT_GRID_SIZE;
        const distFromCenter = Math.sqrt((row - 3) ** 2 + (col - 3) ** 2);
        if (thinking && !active) {
          // Gentle breathing — slow wave from center
          const breath = Math.sin(Date.now() / 800 + distFromCenter * 0.4) * 0.3 + 0.5;
          return 0.1 + breath * 0.3 * (1 - distFromCenter / 6);
        }
        const wave = Math.sin(Date.now() / 300 + distFromCenter * 0.8) * 0.5 + 0.5;
        return 0.15 + wave * 0.85 * (1 - distFromCenter / 5) + Math.random() * 0.15;
      }));
    }, interval);
    return () => clearInterval(id);
  }, [active, thinking]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${DOT_GRID_SIZE}, 1fr)`, gap: 5, width: 100, height: 100 }}>
      {dots.map((scale, i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: "50%",
          background: c.gilt,
          opacity: active ? Math.min(0.9, scale) : thinking ? Math.min(0.4, scale + 0.05) : 0.1,
          transform: `scale(${active ? 0.5 + scale * 0.5 : thinking ? 0.5 + scale * 0.3 : 0.6})`,
          transition: active ? "all 0.1s ease" : "all 0.3s ease",
        }} />
      ))}
    </div>
  );
});

/* ─── Question Progress Bar ─── */
const QuestionProgressBar = React.memo(function QuestionProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ width: "100%", maxWidth: 480 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory }}>
          Question {current} of {total}
        </span>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: c.stone }}>
          {Math.round((current / total) * 100)}%
        </span>
      </div>
      <div style={{ display: "flex", gap: 3, height: 4 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            flex: 1, borderRadius: 2, height: 4,
            background: i < current ? c.gilt : i === current ? "rgba(212,179,127,0.4)" : "rgba(245,242,237,0.08)",
            transition: "all 0.4s ease",
          }} />
        ))}
      </div>
    </div>
  );
});

/* ─── Live Captions (synced to ~150 wpm speaking rate) ─── */
const LiveCaptions = React.memo(function LiveCaptions({ text, isTyping, speakingDuration }: { text: string; isTyping: boolean; speakingDuration?: number }) {
  const [displayText, setDisplayText] = useState("");
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    setDisplayText("");
    setCharIndex(0);
  }, [text]);

  useEffect(() => {
    if (!isTyping || charIndex >= text.length) return;
    // Sync caption reveal to TTS duration (~175 wpm for Cartesia Sonic-3)
    const wordCount = text.split(/\s+/).length;
    const estimatedDuration = speakingDuration || Math.max(2500, (wordCount / 175) * 60 * 1000);
    const msPerChar = estimatedDuration / text.length;
    const delay = Math.max(12, Math.min(70, msPerChar + (Math.random() * 4 - 2)));
    const timer = setTimeout(() => {
      setDisplayText(text.slice(0, charIndex + 1));
      setCharIndex(charIndex + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [charIndex, text, isTyping, speakingDuration]);

  if (!isTyping && !displayText) return null;

  return (
    <div style={{ width: "100%" }} aria-live="polite" aria-label="AI interviewer speaking">
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
});

/* ─── Timer ─── */
function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/* ─── Control Button ─── */
const ControlButton = React.memo(function ControlButton({ icon, label, active, danger, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; danger?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        width: 48, height: 48, borderRadius: "50%",
        background: danger ? c.ember : active ? "rgba(245,242,237,0.08)" : "rgba(245,242,237,0.04)",
        border: `1px solid ${danger ? "rgba(196,112,90,0.3)" : active ? "rgba(245,242,237,0.15)" : c.border}`,
        color: danger ? c.ivory : active ? c.ivory : c.stone,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.2s ease", outline: "none",
      }}
      onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px ${danger ? c.ember : c.gilt}40`}
      onBlur={(e) => e.currentTarget.style.boxShadow = "none"}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? "#d4614a" : "rgba(245,242,237,0.1)";
        e.currentTarget.style.transform = "scale(1.05)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = danger ? c.ember : active ? "rgba(245,242,237,0.08)" : "rgba(245,242,237,0.04)";
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {icon}
    </button>
  );
});

/* ═══════════════════════════════════════════════
   INTERVIEW SCREEN
   ═══════════════════════════════════════════════ */
export default function Interview() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const rawType = searchParams.get("type");
  const interviewType = (rawType && rawType !== "undefined" && rawType !== "null") ? rawType : "behavioral";
  const interviewFocus = searchParams.get("focus") || "general";
  const interviewDifficulty = searchParams.get("difficulty") || "standard";
  const targetCompany = searchParams.get("company") || "";
  const isMiniMode = searchParams.get("mini") === "true";
  // Restore draft if resuming
  const draftKey = `hirestepx_interview_draft_${user?.id || "anon"}`;
  const isResuming = searchParams.get("resume") === "true";
  const draftRef = useRef<{ transcript: any[]; currentStep: number; elapsed: number; script?: InterviewStep[] } | null>(null);
  if (isResuming && !draftRef.current) {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.transcript) && typeof parsed.currentStep === "number") {
          draftRef.current = parsed;
        }
      }
    } catch (e) {
      console.warn("[interview] Draft restore failed:", e);
    }
  }

  const fallbackScript = isMiniMode ? getMiniScript(user, targetCompany) : getScript(interviewType, interviewDifficulty, user);
  const [interviewScript, setInterviewScript] = useState<InterviewStep[]>(
    draftRef.current?.script && draftRef.current.script.length > 0 ? draftRef.current.script : fallbackScript
  );
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
        if (d.script && Array.isArray(d.script) && d.script.length > 0) {
          setInterviewScript(d.script);
        }
      }
    });
  }, []);

  // Fetch LLM-generated questions on mount
  const currentStepRef = useRef(0);
  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  // Note: Subscription limits are enforced server-side via checkSessionLimit() in
  // generate-questions, evaluate, and analyze-resume API endpoints. No client-side
  // re-validation needed here — it would add latency without improving security.
  useEffect(() => {
    if (isMiniMode) return; // Mini mode uses built-in script, no LLM fetch
    // Skip LLM fetch if offline — use fallback script immediately
    if (!navigator.onLine) {
      toast("Offline — using practice questions.", "info");
      setLlmLoading(false);
      return;
    }
    let cancelled = false;
    fetchLLMQuestions({
      type: interviewType,
      focus: interviewFocus,
      difficulty: interviewDifficulty,
      role: user?.targetRole || "the role",
      company: targetCompany || user?.targetCompany,
      industry: user?.industry,
      resumeText: user?.resumeText,
    }).then(questions => {
      if (cancelled) return;
      if (questions && questions.length > 0 && currentStepRef.current === 0) {
        setInterviewScript(questions);
      } else if (!questions) {
        setSaveWarning(`Custom ${interviewType} questions unavailable. Using practice questions instead.`);
        toast(`Using practice questions — custom ${interviewType} generation unavailable.`, "info");
      }
      setLlmLoading(false);
    }).catch(err => {
      if (!cancelled) {
        const msg = err.message || "Could not generate questions.";
        setSaveWarning(`${msg} Using practice questions.`);
        toast(`Using practice questions — ${msg.toLowerCase()}`, "info");
        setLlmLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Speech recognition
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const deepgramRef = useRef<DeepgramSTTHandle | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [phase, setPhase] = useState<"thinking" | "speaking" | "listening" | "done">("thinking");
  const [elapsed, setElapsed] = useState(draftRef.current?.elapsed || 0);
  const [isRecording, setIsRecording] = useState(false);
  const [speechUnavailable, setSpeechUnavailable] = useState(false);

  // Controls
  const [isMuted, setIsMuted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  // Transcript history
  const [transcript, setTranscript] = useState<{ speaker: "ai" | "user"; text: string; time: string }[]>(draftRef.current?.transcript || []);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // End interview modal
  const [showEndModal, setShowEndModal] = useState(false);
  const endModalTriggerRef = useRef<HTMLSpanElement>(null);

  // Multi-tab guard: prevent two interview tabs from running concurrently
  const [tabConflict, setTabConflict] = useState(false);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("hirestepx_interview");
    ch.postMessage({ type: "claim" });
    ch.onmessage = (e) => {
      if (e.data?.type === "claim") {
        // Another tab claimed the interview — warn this one
        setTabConflict(true);
      }
    };
    return () => ch.close();
  }, []);

  // Offline + save status + mic error
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [saveWarning, setSaveWarning] = useState("");
  const [micError, setMicError] = useState("");
  const [usedFallbackScore, setUsedFallbackScore] = useState(false);
  const [evalTimedOut, setEvalTimedOut] = useState(false);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const noSpeechCountRef = useRef(0);
  const recognitionRestartCountRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalElapsed, setEvalElapsed] = useState(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const interviewerName = React.useMemo(() => getInterviewerName(`${interviewType}-${interviewFocus}-${targetCompany}-${user?.id || ""}`), [interviewType, interviewFocus, targetCompany, user?.id]);
  const [microFeedback, setMicroFeedback] = useState<string | null>(null);

  // Eval elapsed timer
  useEffect(() => {
    if (!evaluating) { setEvalElapsed(0); return; }
    const t = setInterval(() => setEvalElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [evaluating]);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      // Retry queued evaluations when back online
      retryQueuedEvals().catch(() => {});
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => { window.removeEventListener("offline", goOffline); window.removeEventListener("online", goOnline); };
  }, []);

  // AI Voice (Text-to-Speech)
  const [aiVoiceEnabled, setAiVoiceEnabled] = useState(true);
  const [showCaptions, setShowCaptions] = useState(false);
  const ttsCancelRef = useRef<(() => void) | null>(null);
  const ttsInstanceIdRef = useRef(0);
  const interviewEndedRef = useRef(false);

  // Cleanup TTS/WebSocket on tab close
  useEffect(() => {
    const handleUnload = () => {
      cleanupTTS();
      ttsCancelRef.current?.();
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // Warn user before closing tab during active interview + auto-save draft
  useEffect(() => {
    if (phase === "done" || evaluating) return;
    const saveDraft = () => {
      const draftData = {
        transcript, currentStep, elapsed, interviewType, interviewDifficulty, interviewFocus,
        script: interviewScript,
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
    // Auto-save every 15 seconds during active interview
    const autoSaveInterval = setInterval(saveDraft, 15_000);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearInterval(autoSaveInterval);
    };
  }, [phase, evaluating, transcript, currentStep, elapsed, interviewType, interviewDifficulty, interviewFocus]);

  // Cancel speech + recognition on unmount or when voice toggled
  useEffect(() => {
    return () => {
      ttsCancelRef.current?.();
      recognitionRef.current?.stop();
      deepgramRef.current?.abort();
    };
  }, [aiVoiceEnabled]);

  // Start/stop speech recognition based on phase
  // Tries Deepgram (WebSocket streaming) first, falls back to Web Speech API
  useEffect(() => {
    if (phase === "listening" && !isMuted) {
      recognitionRestartCountRef.current = 0;
      let stopped = false;

      // ── Deepgram STT (primary) ──
      let deepgramCleanup: (() => void) | null = null;
      const tryDeepgram = async () => {
        if (stopped) return;
        const handle = await createDeepgramSTT({
          onTranscript: (finalText, interim) => {
            if (!stopped) setCurrentTranscript(finalText + interim);
          },
          onError: (error) => {
            if (stopped) return;
            if (error === "not-allowed") {
              setMicError("Microphone access denied. Check browser permissions.");
              setSpeechUnavailable(true);
              setShowCaptions(true);
              setTimeout(() => textareaRef.current?.focus(), 100);
            } else {
              // Deepgram network error — fall back to Web Speech API
              console.warn("[Deepgram] error, falling back to Web Speech API:", error);
              deepgramRef.current = null;
              startWebSpeechAPI();
            }
          },
          onEnd: () => {
            if (stopped || interviewEndedRef.current) return;
            // Deepgram disconnected — try one reconnect, then fall back
            console.warn("[Deepgram] connection ended, falling back to Web Speech API");
            deepgramRef.current = null;
            startWebSpeechAPI();
          },
        });
        if (stopped) { handle?.abort(); return; }
        if (handle) {
          deepgramRef.current = handle;
          deepgramCleanup = () => {
            handle.stop();
            deepgramRef.current = null;
          };
        } else {
          // Deepgram unavailable (no API key or setup failure) — use Web Speech API
          console.log("[STT] Deepgram unavailable, using Web Speech API");
          startWebSpeechAPI();
        }
      };

      // ── Web Speech API (fallback) ──
      function startWebSpeechAPI() {
        if (stopped) return;
        const recognition = createSpeechRecognition();
        if (!recognition) {
          setSpeechUnavailable(true);
          return;
        }
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
            setSpeechUnavailable(true);
            setShowCaptions(true);
            setTimeout(() => textareaRef.current?.focus(), 100);
          } else if (error === "no-speech") {
            noSpeechCountRef.current += 1;
            if (noSpeechCountRef.current >= 3) {
              setMicError("No speech detected after multiple attempts. Type your answer below.");
              setSpeechUnavailable(true);
              setTimeout(() => textareaRef.current?.focus(), 100);
            }
          } else if (error === "network") {
            setMicError("Speech recognition network error. Type your answer below.");
            setSpeechUnavailable(true);
            setTimeout(() => textareaRef.current?.focus(), 100);
          } else if (error !== "aborted") {
            setMicError("Microphone issue detected. Try unmuting or refreshing.");
            setSpeechUnavailable(true);
            setTimeout(() => textareaRef.current?.focus(), 100);
          }
        };
        recognition.onresult = ((origOnResult) => {
          return (event: SpeechRecognitionEvent) => {
            noSpeechCountRef.current = 0;
            recognitionRestartCountRef.current = 0;
            origOnResult(event);
          };
        })(recognition.onresult);
        recognition.onend = () => {
          if (interviewEndedRef.current) return;
          if (!stopped) {
            recognitionRestartCountRef.current++;
            if (recognitionRestartCountRef.current > 5) {
              console.warn("[speech] too many restarts, falling back to text input");
              setSpeechUnavailable(true);
              setMicError("Speech recognition keeps stopping. Type your answer below.");
              toast("Mic issues detected — switching to text input.", "info");
              setTimeout(() => textareaRef.current?.focus(), 100);
              return;
            }
            try { recognition.start(); } catch (e) {
              console.warn("[speech] restart failed, enabling text fallback:", e);
              setSpeechUnavailable(true);
              setMicError("Speech recognition stopped unexpectedly. Type your answer below.");
              setTimeout(() => textareaRef.current?.focus(), 100);
            }
          }
        };
        try { recognition.start(); } catch (e) {
          console.warn("Speech recognition failed to start:", e);
          setMicError("Could not start speech recognition. Try refreshing.");
        }
        recognitionRef.current = recognition;
      }

      // Start with Deepgram
      tryDeepgram();

      // Safety timeout: if no speech detected for 30s, offer text fallback
      const safetyTimer = setTimeout(() => {
        if (!stopped && phase === "listening") {
          console.warn("[interview] Listening safety timeout — enabling text fallback");
          setSpeechUnavailable(true);
          setMicError("Having trouble hearing you? Type your answer instead.");
          setTimeout(() => textareaRef.current?.focus(), 100);
        }
      }, 30_000);

      return () => {
        clearTimeout(safetyTimer);
        stopped = true;
        deepgramCleanup?.();
        recognitionRef.current?.stop();
        recognitionRef.current = null;
      };
    } else {
      deepgramRef.current?.abort();
      deepgramRef.current = null;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    }
  }, [phase, isMuted]);

  // Capture mic stream for real waveform visualizer
  useEffect(() => {
    if (phase !== "listening" || isMuted) { micStreamRef.current = null; return; }
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
      micStreamRef.current = stream;
    }).catch(() => {});
    return () => {
      cancelled = true;
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    };
  }, [phase, isMuted]);

  // User answer simulation
  const [answerTimer, setAnswerTimer] = useState(0);

  const step = interviewScript[currentStep] ?? interviewScript[interviewScript.length - 1];
  const totalQuestions = interviewScript.filter(s => s.type === "question" || s.type === "follow-up").length;
  const currentQuestionNum = interviewScript.slice(0, currentStep + 1).filter(s => s.type === "question" || s.type === "follow-up").length;

  // Timer
  useEffect(() => {
    if (phase === "done") return;
    const timer = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Answer timer (when user is "speaking") with max 120s (2 min)
  // Pauses when tab is backgrounded to prevent surprise auto-advance
  const handleNextRef = useRef<() => void>(() => {});
  const tabVisibleRef = useRef(true);
  useEffect(() => {
    const onVisibility = () => { tabVisibleRef.current = !document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    if (phase !== "listening") {
      if (phase !== "speaking") setAnswerTimer(0);
      return;
    }
    const timer = setInterval(() => setAnswerTimer(t => {
      if (!tabVisibleRef.current) return t; // pause when tab hidden
      const next = t + 1;
      if (next >= 120) {
        toast("Time's up — moving to the next question.", "info");
        handleNextRef.current();
        return t;
      }
      return next;
    }), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Interview flow: thinking → speaking (with TTS) → listening
  const flowGenerationRef = useRef(0);
  useEffect(() => {
    if (phase === "done") return;

    const step = interviewScript[currentStep];
    if (!step) return;

    const gen = ++flowGenerationRef.current;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const isStale = () => cancelled || gen !== flowGenerationRef.current;

    // Phase 1: Thinking — also resolve any pending follow-up
    setPhase("thinking");

    // Pre-fetch TTS for current step during thinking phase so audio is ready instantly
    if (aiVoiceEnabled && step.aiText) {
      prefetchTTS(step.aiText);
    }

    const startSpeaking = () => {
      if (isStale()) return;
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
        if (speechEnded || isStale()) return;
        speechEnded = true;
        if (safetyTimer) clearTimeout(safetyTimer);
        setIsRecording(false);
        if (step.waitForUser) {
          setPhase("listening");
          // Pre-fetch TTS for the next step while user is answering
          const nextStep = interviewScript[currentStep + 1];
          if (nextStep && aiVoiceEnabled) {
            prefetchTTS(nextStep.aiText);
          }
        } else {
          setTimeout(() => setPhase("done"), 1000);
        }
      };

      // Safety timeout
      safetyTimer = setTimeout(() => {
        if (!speechEnded) {
          console.warn("[interview] TTS safety timeout — forcing phase transition");
          onSpeechEnd();
        }
      }, Math.max(step.speakingDuration + 5000, 30000));

      if (aiVoiceEnabled) {
        const instanceId = ++ttsInstanceIdRef.current;
        console.log("[interview] TTS speak() called for step", currentStep, "instance", instanceId);
        speak(step.aiText, onSpeechEnd, onSpeechEnd).then(handle => {
          // Only assign cancel if this is still the active TTS instance
          if (ttsInstanceIdRef.current === instanceId) {
            console.log("[interview] TTS speak() resolved for step", currentStep);
            ttsCancelRef.current = handle.cancel;
          } else {
            // Stale instance — cancel it immediately
            handle.cancel();
          }
        }).catch((e) => { console.warn("[interview] TTS speak() rejected:", e); onSpeechEnd(); });
      } else {
        const speakTimer = setTimeout(onSpeechEnd, step.speakingDuration);
        ttsCancelRef.current = () => clearTimeout(speakTimer);
      }
    };

    // Check if there's a pending follow-up to resolve during thinking phase
    const pendingFollowUp = pendingFollowUpRef.current;
    if (pendingFollowUp) {
      pendingFollowUpRef.current = null;
      // Race: resolve follow-up vs 4s timeout — whichever comes first
      const timeout = new Promise<null>(r => setTimeout(() => r(null), 4000));
      Promise.race([pendingFollowUp, timeout]).then(result => {
        if (isStale()) return;
        // Guard: only inject if user hasn't advanced past this step
        if (result?.needsFollowUp && result.followUpText && currentStepRef.current === currentStep) {
          const followUpStep: InterviewStep = {
            type: "follow-up",
            aiText: result.followUpText,
            thinkingDuration: 300,
            speakingDuration: 4000,
            waitForUser: true,
            scoreNote: "Dynamic follow-up based on candidate's answer",
          };
          setInterviewScript(prev => [
            ...prev.slice(0, currentStep),
            followUpStep,
            ...prev.slice(currentStep),
          ]);
        } else {
          // No follow-up needed — proceed with current step after short think
          setTimeout(startSpeaking, step.thinkingDuration);
        }
      }).catch(() => {
        if (!isStale()) setTimeout(startSpeaking, step.thinkingDuration);
      });
    } else {
      // No pending follow-up — normal thinking delay then speak
      const thinkTimer = setTimeout(startSpeaking, step.thinkingDuration);
      return () => {
        cancelled = true;
        clearTimeout(thinkTimer);
        if (safetyTimer) clearTimeout(safetyTimer);
        ttsCancelRef.current?.();
      };
    }

    return () => {
      cancelled = true;
      if (safetyTimer) clearTimeout(safetyTimer);
      ttsCancelRef.current?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, aiVoiceEnabled]);

  // Handle user "finishing" their answer
  const advancingRef = useRef(false);
  const pendingFollowUpRef = useRef<Promise<{ needsFollowUp: boolean; followUpText: string } | null> | null>(null);
  const handleNextQuestion = useCallback(() => {
    if (phase !== "listening" || advancingRef.current) return;
    advancingRef.current = true;
    setTimeout(() => { advancingRef.current = false; }, 500);

    // Cancel any ongoing speech and stop recognition
    ttsCancelRef.current?.();
    recognitionRef.current?.stop();

    // Capture answer text before clearing
    const answerText = currentTranscript.trim() || `[Answer recorded — ${answerTimer}s]`;
    setTranscript(prev => [...prev, {
      speaker: "user",
      text: answerText,
      time: formatTime(elapsed),
    }]);
    setCurrentTranscript("");

    const currentStepObj = interviewScript[currentStep];
    const isLastStep = currentStep >= interviewScript.length - 1;

    // Generate micro-feedback on the answer (non-blocking)
    setMicroFeedback(null);
    if (answerText.length > 10 && !answerText.startsWith("[Answer recorded")) {
      const wordCount = answerText.trim().split(/\s+/).length;
      const hasMetrics = /\d+%|\$\d|[0-9]+x|[0-9]+ (users|customers|engineers|people)/i.test(answerText);
      const hasStructure = /first|second|then|finally|result|outcome|impact/i.test(answerText);
      if (wordCount < 30) {
        setMicroFeedback("Try to elaborate more — aim for 60+ seconds per answer.");
      } else if (!hasMetrics && !hasStructure) {
        setMicroFeedback("Good start! Try adding specific metrics and structuring with STAR.");
      } else if (!hasMetrics) {
        setMicroFeedback("Nice structure! Strengthen with specific numbers or metrics.");
      } else if (!hasStructure) {
        setMicroFeedback("Great data! Try structuring as Situation → Action → Result.");
      } else {
        setMicroFeedback("Strong answer — specific and well-structured.");
      }
    }

    // Fire follow-up check in background (non-blocking) after question steps
    if (currentStepObj?.type === "question" && !isLastStep && answerText.length > 10 && !answerText.startsWith("[Answer recorded")) {
      pendingFollowUpRef.current = fetchFollowUp({
        question: currentStepObj.aiText,
        answer: answerText,
        type: interviewType,
        role: user?.targetRole || "senior role",
      });
    } else {
      pendingFollowUpRef.current = null;
    }

    // Always advance immediately — no blocking
    if (!isLastStep) {
      setCurrentStep(currentStep + 1);
    } else {
      setPhase("done");
    }
  }, [phase, currentStep, answerTimer, elapsed, interviewScript, interviewType, user]);

  // Keep ref in sync for answer timer auto-advance
  useEffect(() => { handleNextRef.current = handleNextQuestion; }, [handleNextQuestion]);

  // Skip AI speaking: user can interrupt by pressing Enter or Space during speaking phase
  const skipSpeaking = useCallback(() => {
    if (phase !== "speaking") return;
    ttsCancelRef.current?.();
    ttsCancelRef.current = null;
    setIsRecording(false);
    const currentStepObj = interviewScript[currentStep];
    if (currentStepObj?.waitForUser) {
      setPhase("listening");
      // Pre-fetch TTS for next step
      const nextStep = interviewScript[currentStep + 1];
      if (nextStep && aiVoiceEnabled) {
        prefetchTTS(nextStep.aiText);
      }
    } else {
      setTimeout(() => setPhase("done"), 1000);
    }
  }, [phase, currentStep, interviewScript, aiVoiceEnabled]);

  // Keyboard: Enter to advance/skip, Alt+key shortcuts for controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in textarea
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA") {
        if (e.key === "Enter" && !e.shiftKey && phase === "listening") {
          e.preventDefault();
          handleNextQuestion();
        }
        return;
      }
      if (e.key === "Enter" && phase === "listening") {
        handleNextQuestion();
      } else if ((e.key === "Enter" || e.key === " ") && phase === "speaking") {
        e.preventDefault();
        skipSpeaking();
      } else if (e.key === "Enter" && phase === "done") {
        handleEnd();
      }
      // Alt+key shortcuts
      if (e.altKey) {
        if (e.key === "m") { e.preventDefault(); setIsMuted(m => !m); }
        else if (e.key === "t") { e.preventDefault(); setShowTranscript(t => !t); }
        else if (e.key === "k") { e.preventDefault(); setShowCaptions(c => !c); }
        else if (e.key === "v") { e.preventDefault(); if (aiVoiceEnabled) ttsCancelRef.current?.(); setAiVoiceEnabled(v => !v); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, handleNextQuestion, skipSpeaking, aiVoiceEnabled]);

  // Update document.title with current phase for accessibility
  useEffect(() => {
    const phaseLabel = phase === "thinking" ? "Preparing" : phase === "speaking" ? "AI Speaking" : phase === "listening" ? "Your Turn" : "Complete";
    document.title = `${phaseLabel} — HireStepX Interview`;
    return () => { document.title = "HireStepX"; };
  }, [phase]);

  // Auto-scroll transcript (only if user is near bottom, not reading earlier messages)
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      if (isNearBottom) {
        const lastChild = el.lastElementChild;
        if (lastChild) lastChild.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    }
  }, [transcript]);

  // Handle end interview — evaluate with LLM, persist results, navigate
  const handleEnd = useCallback(async () => {
    // Prevent duplicate calls (e.g., rapid clicks during evaluation)
    if (evaluating || interviewEndedRef.current) return;
    // Immediately stop everything
    interviewEndedRef.current = true;
    setPhase("done");
    ttsCancelRef.current?.();
    ttsCancelRef.current = null;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setAiVoiceEnabled(false); // prevent interview flow effect from restarting
    setIsMuted(true); // stop mic
    setEvaluating(true);

    // Safety timeout: if handleEnd hangs for any reason, force-dismiss overlay and navigate
    let sessionId = crypto.randomUUID();
    let score = 0;
    let aiFeedback = "";
    let skillScores: Record<string, number> | null = null;
    const safetyTimer = setTimeout(() => {
      console.warn("[interview] handleEnd safety timeout — forcing navigation");
      setEvaluating(false);
      toast("Evaluation took too long. Session saved with estimated score.", "info");
      try {
        navigate(`/session/${sessionId}`);
      } catch { /* already navigating or unmounted */ }
    }, 45_000);

    try {
    // Deterministic fallback score
    const completionRatio = currentStep / Math.max(1, interviewScript.length);
    const baseScore = 65 + Math.round(completionRatio * 20);
    const difficultyBonus = interviewDifficulty === "intense" ? 5 : interviewDifficulty === "warmup" ? -3 : 0;
    const timeBonus = elapsed > 300 ? 5 : elapsed > 120 ? 3 : 0;
    const questionBonus = Math.min(5, Math.floor(transcript.filter(t => t.speaker === "user").length * 1.5));
    const fallbackScore = Math.min(98, Math.max(60, baseScore + difficultyBonus + timeBonus + questionBonus));

    // Try LLM evaluation — even if speech recognition failed, the user still answered
    // "[Answer recorded — 41s]" means they spoke for 41s but text wasn't captured
    const hasRealAnswers = transcript.some(t => t.speaker === "user" && !t.text.startsWith("["));
    const hasAnyAnswers = transcript.some(t => t.speaker === "user");
    score = fallbackScore;
    let idealAnswers: { question: string; ideal: string; candidateSummary: string }[] = [];

    if (hasAnyAnswers) {
      try {
        const originalQuestions = interviewScript
          .filter(s => s.type === "question" || s.type === "follow-up")
          .map(s => s.aiText);
        const evaluation = await fetchLLMEvaluation({
          transcript,
          type: interviewType,
          difficulty: interviewDifficulty,
          role: user?.targetRole || "the role",
          company: user?.targetCompany,
          questions: originalQuestions,
        });
        if (evaluation) {
          score = Math.min(100, Math.max(0, evaluation.overallScore || fallbackScore));
          aiFeedback = evaluation.feedback || "";
          skillScores = evaluation.skillScores && typeof evaluation.skillScores === "object"
            ? Object.fromEntries(Object.entries(evaluation.skillScores).map(([k, v]) => [k, typeof v === "object" && v !== null && "score" in (v as any) ? (v as any).score : v]))
            : {};
          idealAnswers = Array.isArray(evaluation.idealAnswers) ? evaluation.idealAnswers : [];
        } else {
          setUsedFallbackScore(true);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Could not get AI feedback. Using estimated score.";
        if (errMsg.toLowerCase().includes("timed out") || errMsg.toLowerCase().includes("timeout")) {
          setEvalTimedOut(true);
        } else {
          setUsedFallbackScore(true);
        }
        setSaveWarning(errMsg);
        // Queue for offline retry if network-related failure
        if (!navigator.onLine || errMsg.toLowerCase().includes("network") || errMsg.toLowerCase().includes("fetch")) {
          const retryKey = `hirestepx_eval_retry_${Date.now().toString(36)}`;
          await saveToIDB(retryKey, {
            transcript,
            type: interviewType,
            difficulty: interviewDifficulty,
            role: user?.targetRole || "the role",
            company: user?.targetCompany,
            questions: interviewScript.filter(s => s.type === "question" || s.type === "follow-up").map(s => s.aiText),
            sessionId: Date.now().toString(36),
            queuedAt: Date.now(),
          });
          console.log("[eval] queued for offline retry:", retryKey);
        }
      }
    } else {
      // No real answers — skip LLM evaluation, use fallback
      setUsedFallbackScore(true);
    }

    sessionId = crypto.randomUUID();
    setLastSessionId(sessionId);
    let localOk = false;
    let cloudOk = false;
    try {
      const saveResult = await saveSessionResult({
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
        ideal_answers: idealAnswers.length > 0 ? idealAnswers : undefined,
      }, user?.id);
      localOk = saveResult.localOk;
      cloudOk = saveResult.cloudOk;
    } catch (saveErr) {
      console.error("[interview] saveSessionResult threw:", saveErr);
    }

    if (!cloudOk && localOk) {
      setSaveWarning("Session saved locally but could not sync to cloud.");
      toast("Session saved locally — will sync when online.", "info");
    } else if (!localOk && !cloudOk) {
      // Emergency save: queue in IndexedDB so data isn't lost
      try {
        await saveToIDB(`hirestepx_unsaved_${sessionId}`, {
          id: sessionId, date: new Date().toISOString(), type: interviewType,
          difficulty: interviewDifficulty, focus: interviewFocus, duration: elapsed,
          score, questions: totalQuestions, transcript, ai_feedback: aiFeedback,
          skill_scores: skillScores,
        });
        setSaveWarning("Session saved to backup storage. Will sync when connection restores.");
        toast("Saved to backup — will sync when online.", "info");
      } catch {
        setSaveWarning("Warning: Session could not be saved. Please check your connection.");
        toast("Could not save session. Check your connection.", "error");
      }
    } else {
      toast("Session saved successfully!", "success");
    }

    track("session_complete", { type: interviewType, score, difficulty: interviewDifficulty });

    // Clear draft, mark onboarding complete, and track practice timestamp
    try { localStorage.removeItem(draftKey); } catch {}
    try { await deleteFromIDB(draftKey); } catch {}
    try {
      const timestamps = user?.practiceTimestamps || [];
      const updates: Partial<Parameters<typeof updateUser>[0]> = {
        practiceTimestamps: [...timestamps, new Date().toISOString()],
      };
      if (!user?.hasCompletedOnboarding) updates.hasCompletedOnboarding = true;
      await Promise.race([
        updateUser(updates),
        new Promise(r => setTimeout(r, 5000)),
      ]);
    } catch {}

    // Brief delay to show save warning before navigating
    if (!localOk || !cloudOk) {
      await new Promise(r => setTimeout(r, 2500));
    }

    try {
      navigate(`/session/${sessionId}`);
    } catch (navErr) {
      console.warn("[interview] Navigation failed:", navErr);
      toast("Session saved! Navigate to dashboard to view results.", "info");
    }

    } catch (fatalErr) {
      console.error("[interview] handleEnd fatal error:", fatalErr);
      toast("Something went wrong saving your session. Please check your dashboard.", "error");
      try { navigate("/dashboard"); } catch {}
    } finally {
      clearTimeout(safetyTimer);
      setEvaluating(false);
    }
  }, [navigate, elapsed, interviewType, interviewDifficulty, interviewFocus, totalQuestions, user, updateUser, currentStep, interviewScript.length, transcript]);

  const QUESTION_TIME_LIMIT = 120;
  const timeRemaining = QUESTION_TIME_LIMIT - answerTimer;
  const timePercent = (answerTimer / QUESTION_TIME_LIMIT) * 100;
  const displayRole = user?.targetRole || interviewType.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const displayCompany = targetCompany || user?.targetCompany || "";
  const displayFocus = interviewFocus !== "general" ? interviewFocus.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : interviewType.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  return (
    <div style={{
      width: "100vw", height: "100vh", background: c.obsidian,
      display: "flex", flexDirection: "column", overflow: "hidden",
      fontFamily: font.ui,
    }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes recordPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @media (max-width: 600px) {
          .iv-info-bar { flex-wrap: wrap; gap: 8px !important; padding: 10px 16px !important; }
          .iv-center { padding: 16px !important; }
          .iv-controls { padding: 8px 12px !important; gap: 6px !important; }
          .iv-controls button[style*="width: 48px"] { width: 44px !important; height: 44px !important; }
          .iv-controls .iv-hide-mobile { display: none !important; }
          .iv-transcript-panel { width: 100% !important; max-width: none !important; }
        }
      `}</style>

      {/* ─── Status Toasts (fixed top) ─── */}
      {(tabConflict || isOffline || micError) && (
        <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 100, display: "flex", flexDirection: "column", gap: 8, maxWidth: 500, width: "90%" }}>
          {tabConflict && (
            <div role="alert" style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(212,179,127,0.12)", border: "1px solid rgba(212,179,127,0.25)", display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(8px)" }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.gilt }}>Interview is open in another tab</span>
            </div>
          )}
          {isOffline && (
            <div role="alert" style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(196,112,90,0.15)", border: "1px solid rgba(196,112,90,0.3)", display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(8px)" }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ember }}>Offline — session saved locally</span>
            </div>
          )}
          {micError && (
            <div role="alert" style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(196,112,90,0.1)", border: "1px solid rgba(196,112,90,0.2)", display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(8px)" }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/></svg>
              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ember }}>{micError}</span>
            </div>
          )}
        </div>
      )}

      {/* ─── Top Info Bar ─── */}
      <header className="iv-info-bar" style={{
        display: "flex", flexDirection: "column",
        borderBottom: `1px solid rgba(245,242,237,0.04)`,
        background: "rgba(6,6,7,0.6)", backdropFilter: "blur(12px)",
        zIndex: 10, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: font.display, fontSize: 15, fontWeight: 400, color: c.ivory, letterSpacing: "0.02em" }}>
              HireStepX
            </span>
            <div style={{ width: 1, height: 16, background: "rgba(245,242,237,0.08)" }} />
            {displayCompany && (
              <>
                <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.ivory }}>{displayCompany}</span>
                <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>·</span>
              </>
            )}
            <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk }}>{displayRole}</span>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>·</span>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt }}>{displayFocus}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <NetworkIndicator />
            {llmLoading && currentStep <= 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, border: "1.5px solid rgba(212,179,127,0.3)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Generating...</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: phase === "done" ? c.stone : c.sage, animation: phase !== "done" ? "recordPulse 1.5s ease-in-out infinite" : "none" }} />
              <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 500, color: c.ivory }}>{formatTime(elapsed)}</span>
            </div>
          </div>
        </div>
        {/* Question progress in header */}
        {phase !== "done" && (
          <div style={{ padding: "0 24px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.ivory }}>
                Question {currentQuestionNum} of {totalQuestions}
              </span>
              <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>
                {Math.round((currentQuestionNum / totalQuestions) * 100)}%
              </span>
            </div>
            <div style={{ display: "flex", gap: 3, height: 3 }}>
              {Array.from({ length: totalQuestions }).map((_, i) => (
                <div key={i} style={{
                  flex: 1, borderRadius: 2, height: 3,
                  background: i < currentQuestionNum ? c.gilt : i === currentQuestionNum ? "rgba(212,179,127,0.4)" : "rgba(245,242,237,0.08)",
                  transition: "all 0.4s ease",
                }} />
              ))}
            </div>
          </div>
        )}
      </header>

      {/* ─── Center Stage ─── */}
      <div className="iv-center" style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        overflow: "auto", padding: "24px 24px 0",
        position: "relative",
      }}>
        <div style={{ width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>

          {/* AI Avatar — Dot Grid */}
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
            padding: "20px 0",
          }}>
            <div style={{
              width: 120, height: 120, borderRadius: "50%",
              background: phase === "speaking" ? "rgba(212,179,127,0.06)" : "rgba(245,242,237,0.02)",
              border: `2px solid ${phase === "speaking" ? "rgba(212,179,127,0.2)" : phase === "listening" ? "rgba(122,158,126,0.15)" : c.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.4s ease",
              boxShadow: phase === "speaking" ? "0 0 40px rgba(212,179,127,0.08)" : "none",
            }}>
              <DotGridVisualizer active={phase === "speaking"} thinking={phase === "thinking"} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory }}>{interviewerName}</span>
              <span aria-live="polite" aria-atomic="true" role="status" style={{
                fontFamily: font.ui, fontSize: 11, fontWeight: 500,
                color: phase === "speaking" ? c.gilt : phase === "listening" ? c.sage : c.stone,
              }}>
                {phase === "thinking" ? "Preparing..." : phase === "speaking" ? "Speaking..." : phase === "listening" ? "Listening" : "Complete"}
              </span>
            </div>
            {phase === "speaking" && (
              <button onClick={skipSpeaking} style={{
                fontFamily: font.mono, fontSize: 10, color: c.stone, background: "none",
                border: "none", cursor: "pointer", padding: "2px 0", opacity: 0.5,
                transition: "opacity 0.2s",
              }} onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}>
                Press Enter to skip ›
              </button>
            )}
          </div>

          {/* Question Card with synced captions */}
          <div aria-live="polite" aria-atomic="true" style={{
            width: "100%", background: c.graphite, borderRadius: 16,
            border: `1px solid ${phase === "speaking" ? "rgba(212,179,127,0.15)" : c.border}`,
            padding: "20px 24px",
            transition: "all 0.4s ease",
          }}>
            {step?.scoreNote && phase !== "done" && (
              <p style={{
                fontFamily: font.ui, fontSize: 11, color: "rgba(212,179,127,0.5)",
                margin: "0 0 10px", display: "flex", alignItems: "center", gap: 5,
              }}>
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(212,179,127,0.4)" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
                {step.scoreNote}
              </p>
            )}
            {phase === "speaking" ? (
              <LiveCaptions text={step?.aiText || ""} isTyping={true} speakingDuration={step?.speakingDuration} />
            ) : step?.aiText ? (
              <p style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, lineHeight: 1.75, margin: 0, opacity: phase === "listening" && !showCaptions ? 0.55 : 1 }}>{step.aiText}</p>
            ) : null}

            {/* Per-question time bar (visible during listening) */}
            {phase === "listening" && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontFamily: font.ui, fontSize: 10, color: timeRemaining <= 15 ? c.ember : timeRemaining <= 30 ? c.gilt : c.stone }}>
                    {timeRemaining <= 15 ? "Wrapping up..." : timeRemaining <= 30 ? "30s remaining" : "Time remaining"}
                  </span>
                  <span style={{
                    fontFamily: font.mono, fontSize: 11, fontWeight: 600,
                    color: timeRemaining <= 15 ? c.ember : timeRemaining <= 30 ? c.gilt : c.ivory,
                  }}>{formatTime(timeRemaining)}</span>
                </div>
                <div style={{ width: "100%", height: 3, borderRadius: 2, background: "rgba(245,242,237,0.06)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 2,
                    background: timePercent >= 87.5 ? c.ember : timePercent >= 75 ? c.gilt : c.sage,
                    width: `${100 - timePercent}%`,
                    transition: "width 1s linear, background 0.5s ease",
                  }} />
                </div>
              </div>
            )}
          </div>

          {/* User Speaking Area */}
          {phase === "listening" && (
            <div style={{
              width: "100%", borderRadius: 16,
              background: "rgba(122,158,126,0.03)",
              border: `1px solid rgba(122,158,126,0.12)`,
              padding: "18px 24px",
              animation: "fadeUp 0.3s ease",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: isMuted ? c.ember : c.sage, animation: isMuted ? "none" : "recordPulse 1s ease-in-out infinite" }} />
                  <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.sage }}>
                    {speechUnavailable ? "Type your answer" : isMuted ? "Muted" : "Your answer"}
                  </span>
                </div>
                <WaveformVisualizer active={!isMuted && !speechUnavailable} color={c.sage} barCount={14} stream={micStreamRef.current} />
              </div>

              <div style={{ minHeight: 60, marginBottom: 10 }}>
                {speechUnavailable ? (
                  <>
                    <textarea
                      ref={textareaRef}
                      value={currentTranscript}
                      onChange={(e) => setCurrentTranscript(e.target.value)}
                      placeholder="Type your answer here..."
                      maxLength={3000}
                      autoFocus
                      style={{
                        width: "100%", minHeight: 70, fontFamily: font.ui, fontSize: 13, color: c.ivory,
                        lineHeight: 1.7, background: "transparent", border: "none", outline: "none",
                        resize: "none", padding: 0, margin: 0,
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleNextQuestion(); } }}
                    />
                    <button onClick={() => { setSpeechUnavailable(false); setMicError(""); noSpeechCountRef.current = 0; }}
                      aria-label="Switch to speaking"
                      style={{
                        fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.sage,
                        background: "rgba(122,158,126,0.06)", border: `1px solid rgba(122,158,126,0.15)`,
                        borderRadius: 10, padding: "4px 12px", cursor: "pointer", marginTop: 4,
                        display: "inline-flex", alignItems: "center", gap: 5, transition: "all 0.2s",
                      }}>
                      <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
                      Switch to speaking
                    </button>
                  </>
                ) : (
                  <>
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
                    <button onClick={() => { setSpeechUnavailable(true); setMicError(""); }}
                      aria-label="Type instead"
                      style={{
                        fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone,
                        background: "transparent", border: "none", padding: "4px 0", cursor: "pointer",
                        marginTop: 6, display: "inline-flex", alignItems: "center", gap: 5, transition: "color 0.2s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = c.chalk; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; }}>
                      <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="M6 12h.01"/><path d="M18 12h.01"/><path d="M8 16h8"/></svg>
                      Prefer typing? Switch to text
                    </button>
                  </>
                )}
              </div>
              {/* Next Question button inline */}
              <button
                ref={nextBtnRef}
                onClick={handleNextQuestion}
                style={{
                  fontFamily: font.ui, fontSize: 13, fontWeight: 600, width: "100%",
                  padding: "12px 24px", borderRadius: 10, marginTop: 8,
                  background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
                  border: "none", color: c.obsidian, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  transition: "all 0.2s ease",
                  boxShadow: "0 4px 16px rgba(212,179,127,0.2)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(212,179,127,0.3)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(212,179,127,0.2)"; }}
              >
                {currentStep < interviewScript.length - 1 ? "Next Question" : "Finish"}
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          )}

          {/* Done state */}
          {phase === "done" && (
            <div style={{
              width: "100%", borderRadius: 16,
              background: "rgba(122,158,126,0.04)",
              border: `1px solid rgba(122,158,126,0.15)`,
              padding: "32px", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 14,
              animation: "slideUp 0.5s ease",
            }}>
              <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2" strokeLinecap="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <p style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory, margin: 0 }}>Session complete</p>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, margin: 0 }}>{currentQuestionNum} questions answered · {formatTime(elapsed)}</p>
              {(usedFallbackScore || evalTimedOut) && (
                <p style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt, margin: 0, padding: "6px 12px", borderRadius: 10, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.1)" }}>
                  {evalTimedOut ? "AI evaluation timed out" : "AI evaluation unavailable"} — score is estimated from session metrics
                </p>
              )}
              {/* View Feedback button inline */}
              <button
                onClick={handleEnd}
                disabled={evaluating}
                style={{
                  fontFamily: font.ui, fontSize: 13, fontWeight: 600, width: "100%",
                  padding: "12px 24px", borderRadius: 10, marginTop: 8,
                  background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
                  border: "none", color: c.obsidian, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  transition: "all 0.2s ease",
                }}
              >
                View Feedback
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          )}

          {/* Micro-feedback on last answer */}
          {(phase === "thinking" || phase === "speaking") && (() => {
            const lastUserMsg = [...transcript].reverse().find(t => t.speaker === "user");
            if (!lastUserMsg) return null;
            return (
              <div style={{ width: "100%", borderRadius: 12, padding: "12px 16px", background: "rgba(122,158,126,0.03)", border: `1px solid rgba(122,158,126,0.06)` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(122,158,126,0.35)" }} />
                  <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Your last answer</span>
                </div>
                <p style={{
                  fontFamily: font.ui, fontSize: 12, color: "rgba(197,192,186,0.5)", lineHeight: 1.5, margin: 0,
                  overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                }}>{lastUserMsg.text}</p>
                {microFeedback && (
                  <div style={{
                    marginTop: 6, padding: "5px 10px", borderRadius: 6,
                    background: microFeedback.includes("Strong") ? "rgba(122,158,126,0.08)" : "rgba(212,179,127,0.06)",
                    border: `1px solid ${microFeedback.includes("Strong") ? "rgba(122,158,126,0.15)" : "rgba(212,179,127,0.12)"}`,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={microFeedback.includes("Strong") ? c.sage : c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: microFeedback.includes("Strong") ? c.sage : c.gilt }}>{microFeedback}</span>
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      </div>

      {/* ─── Bottom Controls Bar ─── */}
      <footer className="iv-controls" style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "10px 24px", gap: 12,
        borderTop: `1px solid rgba(245,242,237,0.04)`,
        background: "rgba(6,6,7,0.6)", backdropFilter: "blur(12px)",
        flexShrink: 0, zIndex: 10,
      }}>
        {/* Mute / Unmute */}
        <ControlButton
          icon={isMuted ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.35 2.18"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          )}
          label={isMuted ? "Unmute (Alt+M)" : "Mute (Alt+M)"}
          active={!isMuted}
          danger={isMuted}
          onClick={() => setIsMuted(m => !m)}
        />

        {/* AI Voice toggle */}
        <ControlButton
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              {aiVoiceEnabled && <><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></>}
              {!aiVoiceEnabled && <line x1="23" y1="9" x2="17" y2="15"/>}
              {!aiVoiceEnabled && <line x1="17" y1="9" x2="23" y2="15"/>}
            </svg>
          }
          label={aiVoiceEnabled ? "Mute AI voice (Alt+V)" : "Enable AI voice (Alt+V)"}
          active={aiVoiceEnabled}
          onClick={() => { if (aiVoiceEnabled) ttsCancelRef.current?.(); setAiVoiceEnabled(v => !v); }}
        />

        {/* Transcript toggle */}
        <ControlButton
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          }
          label={showTranscript ? "Hide transcript (Alt+T)" : "Show transcript (Alt+T)"}
          active={showTranscript}
          onClick={() => setShowTranscript(t => !t)}
        />

        {/* End Interview (when not done) */}
        {phase !== "done" && (
          <>
            <div className="iv-hide-mobile" style={{ width: 1, height: 24, background: "rgba(245,242,237,0.08)", margin: "0 4px" }} />
            <span ref={endModalTriggerRef} style={{ display: "inline-flex" }}>
              <ControlButton
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
                label="End interview"
                danger
                onClick={() => { ttsCancelRef.current?.(); ttsCancelRef.current = null; setShowEndModal(true); }}
              />
            </span>
          </>
        )}
      </footer>

      {/* ─── Transcript Slide-Over Panel ─── */}
      {showTranscript && (
        <>
        {/* Backdrop (visible on mobile) */}
        <div
          onClick={() => setShowTranscript(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 49,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(2px)",
            animation: "fadeUp 0.15s ease",
          }}
        />
        <div className="iv-transcript-panel" style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: 380, maxWidth: "100vw",
          background: c.graphite,
          borderLeft: `1px solid ${c.border}`,
          display: "flex", flexDirection: "column",
          zIndex: 50,
          animation: "slideInRight 0.25s ease",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.3)",
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
          <div ref={transcriptRef} aria-live="polite" aria-label="Interview transcript" style={{ flex: 1, overflow: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            {transcript.length === 0 && (
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, textAlign: "center", padding: "40px 0" }}>Transcript will appear here...</p>
            )}
            {transcript.map((msg, i) => (
              <div key={`${msg.speaker}-${msg.time}-${i}`} style={{ display: "flex", gap: 10 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                  background: msg.speaker === "ai" ? "rgba(212,179,127,0.08)" : "rgba(122,158,126,0.08)",
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
                  <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.55, margin: 0, wordBreak: "break-word", overflowWrap: "break-word" }}>{msg.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        </>
      )}

      {/* End Interview Modal */}
      {showEndModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-modal-title"
          tabIndex={-1}
          onClick={(e) => { if (e.target === e.currentTarget) { e.stopPropagation(); setShowEndModal(false); endModalTriggerRef.current?.querySelector("button")?.focus(); } }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setShowEndModal(false); endModalTriggerRef.current?.querySelector("button")?.focus(); return; }
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
            {isOffline && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, background: "rgba(196,112,90,0.08)", border: "1px solid rgba(196,112,90,0.15)", marginBottom: 16 }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/></svg>
                <span style={{ fontFamily: font.ui, fontSize: 11, color: c.ember }}>You're offline — AI evaluation may fail. Your answers will be saved locally.</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={() => { setShowEndModal(false); endModalTriggerRef.current?.querySelector("button")?.focus(); }}
                style={{
                  fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory,
                  background: "rgba(245,242,237,0.04)", border: `1px solid ${c.border}`,
                  borderRadius: 8, padding: "10px 24px", cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(245,242,237,0.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(245,242,237,0.04)"; }}
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
          {!(usedFallbackScore || evalTimedOut) ? (
            <>
              <div style={{ width: 48, height: 48, border: `3px solid ${c.border}`, borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 24 }} />
              <h3 style={{ fontFamily: font.ui, fontSize: 18, fontWeight: 600, color: c.ivory, marginBottom: 8 }}>Analyzing your performance...</h3>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>AI is evaluating your answers and generating personalized feedback</p>
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, opacity: 0.7, marginTop: 4 }}>
                {evalElapsed < 10 ? "This usually takes 10\u201330 seconds." : evalElapsed < 25 ? `Almost there... (${evalElapsed}s)` : `Taking longer than usual... (${evalElapsed}s)`}
              </p>
              <div style={{ width: 200, height: 3, borderRadius: 2, background: c.border, marginTop: 16, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 2, background: c.gilt, transition: "width 1s ease", width: `${Math.min(95, (evalElapsed / 30) * 100)}%` }} />
              </div>
            </>
          ) : (
            <>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <h3 style={{ fontFamily: font.ui, fontSize: 18, fontWeight: 600, color: c.ivory, marginBottom: 8 }}>
                {evalTimedOut ? "Evaluation timed out" : "AI evaluation unavailable"}
              </h3>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 20, textAlign: "center", maxWidth: 360 }}>
                Your session has been saved with an estimated score. You can retry the AI evaluation or continue to your results.
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  onClick={() => { setEvalTimedOut(false); setUsedFallbackScore(false); setEvaluating(false); interviewEndedRef.current = false; handleEnd(); }}
                  style={{
                    fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory,
                    background: "rgba(212,179,127,0.1)", border: `1px solid rgba(212,179,127,0.2)`,
                    borderRadius: 10, padding: "10px 20px", cursor: "pointer", transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.2)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.1)"; }}
                >
                  Retry Evaluation
                </button>
                <button
                  onClick={() => { setEvaluating(false); if (lastSessionId) navigate(`/session/${lastSessionId}`); else navigate("/dashboard"); }}
                  style={{
                    fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.obsidian,
                    background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
                    border: "none", borderRadius: 10, padding: "10px 24px", cursor: "pointer",
                    boxShadow: "0 4px 16px rgba(212,179,127,0.2)", transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  View Results
                </button>
              </div>
            </>
          )}
          {saveWarning && !(usedFallbackScore || evalTimedOut) && (
            <div role="alert" style={{ marginTop: 12, padding: "12px 20px", borderRadius: 10, background: "rgba(196,112,90,0.1)", border: "1px solid rgba(196,112,90,0.2)", maxWidth: 400 }}>
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.ember, margin: 0 }}>{saveWarning}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
