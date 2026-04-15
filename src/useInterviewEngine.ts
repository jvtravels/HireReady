import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { track } from "@vercel/analytics";

import { useAuth } from "./AuthContext";
import { speak, speakAs, prefetchTTS, cleanupTTS, fetchCartesiaVoices } from "./tts";
import { useToast } from "./Toast";
import { saveToIDB, loadFromIDB, deleteFromIDB } from "./interviewIDB";
import type { InterviewStep } from "./interviewScripts";
import { getMiniScript, getScript } from "./interviewScripts";
import { saveSessionResult, fetchLLMQuestions, fetchLLMEvaluation, fetchFollowUp, retryQueuedEvals, getAdaptiveHints } from "./interviewAPI";
import { createDeepgramSTT, type DeepgramSTTHandle } from "./deepgramSTT";
import { getInterviewerName, getPanelMembers, formatTime } from "./InterviewComponents";
import { createSpeechRecognition } from "./speechRecognition";
import type { SpeechRecognitionInstance, SpeechRecognitionEvent } from "./speechRecognition";
import { safeUUID } from "./utils";

/* ─── Helpers ─── */

/* ─── Persona normalization (shared across panel interview logic) ─── */
const PERSONA_NORM: Record<string, string> = { "hiring manager": "Hiring Manager", "technical lead": "Technical Lead", "hr partner": "HR Partner" };
function normalizePersona(persona: string): string {
  return PERSONA_NORM[persona.toLowerCase()] || persona;
}

function extractScore(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "object" && raw !== null && "score" in raw) return (raw as { score: number }).score;
  return 0;
}

/* ─── Draft data shape (for IDB restore) ─── */
interface InterviewDraft {
  transcript: { speaker: "ai" | "user"; text: string; time: string }[];
  currentStep: number;
  elapsed: number;
  script?: InterviewStep[];
}

/* ═══════════════════════════════════════════════
   useInterviewEngine — core state & logic
   ═══════════════════════════════════════════════ */
export function useInterviewEngine() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const rawType = searchParams.get("type");
  const interviewType = (rawType && rawType !== "undefined" && rawType !== "null") ? rawType : "behavioral";
  const interviewFocus = searchParams.get("focus") || "general";
  const interviewDifficulty = searchParams.get("difficulty") || "standard";
  const targetCompany = searchParams.get("company") || "";
  const targetRole = searchParams.get("role") || "";
  const isMiniMode = searchParams.get("mini") === "true";
  const shouldUseResume = searchParams.get("useResume") !== "false";
  const jobDescription = searchParams.get("jd") || "";

  const [jdAnalysisData] = useState(() => {
    try {
      const raw = sessionStorage.getItem("hirestepx_jd_analysis");
      if (raw) { sessionStorage.removeItem("hirestepx_jd_analysis"); return JSON.parse(raw); }
    } catch { /* ignore */ }
    return null;
  });

  // Restore draft if resuming
  const draftKey = `hirestepx_interview_draft_${user?.id || "anon"}`;
  const isResuming = searchParams.get("resume") === "true";
  const draftRef = useRef<InterviewDraft | null>(null);
  if (isResuming && !draftRef.current) {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const DRAFT_TTL = 24 * 60 * 60 * 1000; // 24 hours
        const isExpired = parsed?.savedAt && Date.now() - parsed.savedAt > DRAFT_TTL;
        if (isExpired) {
          localStorage.removeItem(draftKey);
          deleteFromIDB(draftKey);
        } else if (parsed && Array.isArray(parsed.transcript) && typeof parsed.currentStep === "number") {
          draftRef.current = parsed;
        }
      }
    } catch (e) {
      console.warn("[interview] Draft restore failed:", e);
    }
  }

  // Override user's profile role/company with URL params (SessionSetup passes these)
  const effectiveUser = (targetRole || targetCompany) ? { ...user, ...(targetRole ? { targetRole } : {}), ...(targetCompany ? { targetCompany } : {}) } as typeof user : user;
  const fallbackScript = isMiniMode ? getMiniScript(effectiveUser, targetCompany, interviewType) : getScript(interviewType, interviewDifficulty, effectiveUser);
  const [interviewScript, setInterviewScript] = useState<InterviewStep[]>(
    draftRef.current?.script && draftRef.current.script.length > 0 ? draftRef.current.script : fallbackScript
  );
  const interviewScriptRef = useRef(interviewScript);
  useEffect(() => { interviewScriptRef.current = interviewScript; }, [interviewScript]);
  const [llmLoading, setLlmLoading] = useState(!draftRef.current && !isMiniMode);

  // Interview state
  const [currentStep, setCurrentStep] = useState(draftRef.current?.currentStep || 0);
  const currentStepRef = useRef(0);
  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  // Async IndexedDB fallback
  useEffect(() => {
    if (!isResuming || draftRef.current) return;
    let cancelled = false;
    loadFromIDB(draftKey).then(data => {
      if (cancelled) return; // Interview already started, skip stale IDB data
      if (data && typeof data === "object" && "transcript" in data) {
        const d = data as InterviewDraft & { savedAt?: number };
        const DRAFT_TTL = 24 * 60 * 60 * 1000;
        if (d.savedAt && Date.now() - d.savedAt > DRAFT_TTL) {
          deleteFromIDB(draftKey);
          return;
        }
        draftRef.current = d;
        setCurrentStep(d.currentStep || 0);
        setTranscript(d.transcript || []);
        setElapsed(d.elapsed || 0);
        if (d.script && Array.isArray(d.script) && d.script.length > 0) {
          setInterviewScript(d.script);
        }
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Fetch LLM-generated questions on mount
  useEffect(() => {
    if (!navigator.onLine) {
      toast("Offline — using practice questions.", "info");
      setLlmLoading(false);
      return;
    }
    let cancelled = false;

    let adaptiveHints: { weakSkills: string[]; pastTopics: string[] } = { weakSkills: [], pastTopics: [] };
    try {
      const cached = localStorage.getItem(`hirestepx_cache_sessions_${user?.id}`);
      if (cached && cached.length < 500_000) { // Skip parsing if > 500KB
        const pastSessions = JSON.parse(cached);
        adaptiveHints = getAdaptiveHints(pastSessions, jdAnalysisData?.missingSkills);
      }
    } catch { /* silent */ }

    const llmPromise = fetchLLMQuestions({
      type: interviewType,
      focus: interviewFocus,
      difficulty: interviewDifficulty,
      role: targetRole || user?.targetRole || "the role",
      company: targetCompany || user?.targetCompany,
      industry: user?.industry,
      resumeText: shouldUseResume ? user?.resumeText : undefined,
      pastTopics: adaptiveHints.pastTopics.length > 0 ? adaptiveHints.pastTopics : undefined,
      weakSkills: adaptiveHints.weakSkills.length > 0 ? adaptiveHints.weakSkills : undefined,
      jobDescription: jobDescription || undefined,
      experienceLevel: user?.experienceLevel || undefined,
      mini: isMiniMode || undefined,
    });
    // Shorter timeout for mini mode (onboarding) to keep first experience snappy
    const timeoutMs = isMiniMode ? 12_000 : 30_000;
    const timeoutPromise = new Promise<null>((_, reject) => {
      const tid = setTimeout(() => reject(new Error("Question generation timed out")), timeoutMs);
      (timeoutPromise as unknown as { _tid: ReturnType<typeof setTimeout> })._tid = tid;
    });
    Promise.race([llmPromise, timeoutPromise]).then(questions => {
      if (cancelled) return;
      if (questions && questions.length > 0 && currentStepRef.current === 0) {
        setInterviewScript(questions);
      } else if (!questions) {
        setSaveWarning(`Custom ${interviewType} questions unavailable. Using practice questions instead.`);
        if (!isMiniMode) toast(`Using practice questions — custom ${interviewType} generation unavailable.`, "info");
      }
      setLlmLoading(false);
    }).catch(err => {
      if (cancelled) return;
      const msg = err.message || "Could not generate questions.";
      setSaveWarning(`${msg} Using practice questions.`);
      if (!isMiniMode) toast(`Using practice questions — ${msg.toLowerCase()}`, "info");
      setLlmLoading(false);
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
  const [speechUnavailable, setSpeechUnavailable] = useState(searchParams.get("nomic") === "1");

  // Controls
  const [isMuted, setIsMuted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  // Transcript history
  const [transcript, setTranscript] = useState<{ speaker: "ai" | "user"; text: string; time: string }[]>(draftRef.current?.transcript || []);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // End interview modal
  const [showEndModal, setShowEndModal] = useState(false);
  const endModalTriggerRef = useRef<HTMLSpanElement>(null);

  // Multi-tab guard
  const [tabConflict, setTabConflict] = useState(false);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("hirestepx_interview");
    ch.postMessage({ type: "claim" });
    ch.onmessage = (e) => {
      if (e.data?.type === "claim") {
        setTabConflict(true);
      }
    };
    return () => ch.close();
  }, []);

  // Prevent accidental navigation/close during active interview
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!interviewEndedRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
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
  const deepgramRetryRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalElapsed, setEvalElapsed] = useState(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const interviewerName = useMemo(() => getInterviewerName(`${interviewType}-${interviewFocus}-${targetCompany}-${user?.id || ""}`), [interviewType, interviewFocus, targetCompany, user?.id]);

  // Panel interview: 3 members with gender-matched voices
  const isPanelInterview = interviewType === "panel";
  const panelMembers = useMemo(() =>
    isPanelInterview ? getPanelMembers(`${interviewType}-${interviewFocus}-${targetCompany}-${user?.id || ""}`) : null,
    [isPanelInterview, interviewType, interviewFocus, targetCompany, user?.id]
  );

  // Resolve Cartesia voices for panel members (male/female)
  const panelVoicesRef = useRef<Record<string, string>>({});
  const panelVoicesReadyRef = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (!isPanelInterview || !panelMembers) return;
    let cancelled = false;
    panelVoicesRef.current = {};
    const voicePromise = fetchCartesiaVoices("en_IN").then(voices => {
      if (cancelled) return;
      const maleVoices = voices.filter(v => v.gender === "male");
      const femaleVoices = voices.filter(v => v.gender === "female");
      if (maleVoices.length === 0 && femaleVoices.length === 0) {
        toast("Using default voice for all panelists — voice library unavailable.", "info");
        return;
      }
      const voiceMap: Record<string, string> = {};
      let maleIdx = 0, femaleIdx = 0;
      for (const member of panelMembers) {
        const pool = member.gender === "male" ? maleVoices : femaleVoices;
        const fallbackPool = pool.length > 0 ? pool : (maleVoices.length > 0 ? maleVoices : femaleVoices);
        const idxRef = member.gender === "male" ? maleIdx : femaleIdx;
        if (fallbackPool.length > 0) {
          voiceMap[member.title] = fallbackPool[idxRef % fallbackPool.length].id;
          if (member.gender === "male") maleIdx++; else femaleIdx++;
        }
      }
      panelVoicesRef.current = voiceMap;
    }).catch(() => {
      if (!cancelled) toast("Using default voice for all panelists.", "info");
    });
    panelVoicesReadyRef.current = voicePromise;
    return () => { cancelled = true; panelVoicesRef.current = {}; };
  }, [isPanelInterview, panelMembers]);

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

  // Auto-save draft
  useEffect(() => {
    if (phase === "done" || evaluating) return;
    const saveDraft = () => {
      const draftData = {
        transcript, currentStep, elapsed, interviewType, interviewDifficulty, interviewFocus,
        script: interviewScript,
        savedAt: Date.now(),
      };
      try { localStorage.setItem(draftKey, JSON.stringify(draftData)); } catch { /* expected: localStorage may be unavailable */ }
      saveToIDB(draftKey, draftData);
    };
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      saveDraft();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
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

  // Start/stop speech recognition based on phase (re-runs when speechUnavailable toggles for retry)
  useEffect(() => {
    if (phase === "listening" && !isMuted && !speechUnavailable) {
      recognitionRestartCountRef.current = 0;
      deepgramRetryRef.current = 0;
      let stopped = false;

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
              console.warn("[Deepgram] error, falling back to Web Speech API:", error);
              toast("Speech recognition switched to browser fallback.", "info");
              deepgramRef.current = null;
              startWebSpeechAPI();
            }
          },
          onEnd: () => {
            if (stopped || interviewEndedRef.current) return;
            deepgramRef.current = null;
            // Retry Deepgram once before falling back to Web Speech API
            if (navigator.onLine && deepgramRetryRef.current < 2) {
              deepgramRetryRef.current++;
              const backoffMs = 1000 * Math.pow(2, deepgramRetryRef.current - 1); // 1s, 2s
              console.warn(`[Deepgram] connection ended, retrying in ${backoffMs}ms (attempt ${deepgramRetryRef.current}/2)`);
              toast("Reconnecting speech recognition...", "info");
              setTimeout(() => { if (!stopped) tryDeepgram(); }, backoffMs);
            } else {
              console.warn("[Deepgram] connection ended, falling back to Web Speech API");
              toast("Speech recognition switched to browser fallback.", "info");
              startWebSpeechAPI();
            }
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
          startWebSpeechAPI();
        }
      };

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
        recognition.onerror = (event: { error: string }) => {
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

      tryDeepgram();

      const safetyTimer = setTimeout(() => {
        if (!stopped && !interviewEndedRef.current && phase === "listening") {
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
      return;
    }
  }, [phase, isMuted, speechUnavailable]);

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

  // User answer timer
  const [answerTimer, setAnswerTimer] = useState(0);

  const step = interviewScript[currentStep] ?? interviewScript[interviewScript.length - 1];
  const rawPersona = step?.persona || (panelMembers ? panelMembers[0].title : "");
  const activePersona = normalizePersona(rawPersona);
  const activeInterviewerName = isPanelInterview && panelMembers
    ? (panelMembers.find(m => m.title === activePersona)?.name || interviewerName)
    : (step?.persona || interviewerName);
  const totalQuestions = useMemo(() => interviewScript.filter(s => s.type === "question" || s.type === "follow-up").length, [interviewScript]);
  const currentQuestionNum = useMemo(() => interviewScript.slice(0, currentStep + 1).filter(s => s.type === "question" || s.type === "follow-up").length, [interviewScript, currentStep]);

  // Timer — pauses when tab is hidden (laptop sleep / tab switch)
  useEffect(() => {
    if (phase === "done") return;
    const timer = setInterval(() => {
      if (!tabVisibleRef.current) return;
      setElapsed(e => e + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Answer timer with max 120s, pauses when tab is backgrounded
  const handleNextRef = useRef<() => void>(() => {});
  const tabVisibleRef = useRef(true);
  useEffect(() => {
    const onVisibility = () => { tabVisibleRef.current = !document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    setAnswerTimer(0);
  }, [currentStep]);
  useEffect(() => {
    if (phase === "done") return;
    const timer = setInterval(() => setAnswerTimer(t => {
      if (!tabVisibleRef.current) return t;
      const next = t + 1;
      if (next === 100 && phase === "listening") {
        toast("20 seconds remaining for this answer.", "info");
      }
      if (next >= 120 && phase === "listening") {
        toast("Time's up — moving to the next question.", "info");
        handleNextRef.current();
        return t;
      }
      return next;
    }), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Interview flow: thinking -> speaking (with TTS) -> listening
  const flowGenerationRef = useRef(0);
  const pendingFollowUpRef = useRef<Promise<{ needsFollowUp: boolean; followUpText: string; followUpType?: string } | null> | null>(null);
  const followUpDepthRef = useRef(0);
  // Dynamic difficulty: track answer quality mid-interview for escalation/de-escalation
  const answerQualityRef = useRef<number[]>([]);

  useEffect(() => {
    if (phase === "done") return;

    const step = interviewScript[currentStep];
    if (!step) return;

    if (currentStep === 0) {
      track("interview_started", { type: interviewType, mode: isMiniMode ? "mini" : "full", isPanel: isPanelInterview });
    }

    const gen = ++flowGenerationRef.current;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const isStale = () => cancelled || gen !== flowGenerationRef.current || interviewEndedRef.current;

    setPhase("thinking");

    if (aiVoiceEnabled && step.aiText) {
      prefetchTTS(step.aiText);
    }

    const startSpeaking = () => {
      if (isStale()) return;
      setPhase("speaking");
      setIsRecording(true);

      setTranscript(prev => [...prev, {
        speaker: "ai",
        text: step.persona ? `[${step.persona}] ${step.aiText}` : step.aiText,
        time: formatTime(elapsed),
      }]);

      ttsCancelRef.current?.();

      let speechEnded = false;
      const onSpeechEnd = () => {
        if (speechEnded || isStale()) return;
        speechEnded = true;
        if (safetyTimer) clearTimeout(safetyTimer);
        setIsRecording(false);
        if (step.waitForUser) {
          setPhase("listening");
          const nextStep = interviewScript[currentStep + 1];
          if (nextStep && aiVoiceEnabled) {
            prefetchTTS(nextStep.aiText);
          }
        } else {
          setTimeout(() => setPhase("done"), 1000);
        }
      };

      safetyTimer = setTimeout(() => {
        if (!speechEnded) {
          console.warn("[interview] TTS safety timeout — forcing phase transition");
          onSpeechEnd();
        }
      }, Math.max(step.speakingDuration + 5000, 30000));

      if (aiVoiceEnabled) {
        const instanceId = ++ttsInstanceIdRef.current;
        // For panel interviews, wait for voices to load before speaking (prevents race condition)
        const speakPanel = async () => {
          if (isPanelInterview && panelVoicesReadyRef.current) {
            await panelVoicesReadyRef.current.catch(() => {});
          }
          const normalizedPersona = step.persona ? normalizePersona(step.persona) : null;
          const panelVoiceId = isPanelInterview && normalizedPersona ? panelVoicesRef.current[normalizedPersona] : null;
          const panelGender = isPanelInterview && normalizedPersona && panelMembers
            ? panelMembers.find(m => m.title === normalizedPersona)?.gender
            : undefined;
          return panelVoiceId
            ? speakAs(step.aiText, panelVoiceId, onSpeechEnd, onSpeechEnd, panelGender)
            : speak(step.aiText, onSpeechEnd, onSpeechEnd);
        };
        speakPanel().then(handle => {
          if (ttsInstanceIdRef.current === instanceId) {
            ttsCancelRef.current = handle.cancel;
          } else {
            handle.cancel();
          }
        }).catch((e) => { console.warn("[interview] TTS speak() rejected:", e); onSpeechEnd(); });
      } else {
        const speakTimer = setTimeout(onSpeechEnd, step.speakingDuration);
        ttsCancelRef.current = () => clearTimeout(speakTimer);
      }
    };

    const pendingFollowUp = pendingFollowUpRef.current;
    if (pendingFollowUp) {
      pendingFollowUpRef.current = null;
      const timeout = new Promise<null>(r => setTimeout(() => r(null), 4000));
      Promise.race([pendingFollowUp, timeout]).then(result => {
        if (isStale()) return;
        if (result?.needsFollowUp && result.followUpText && currentStepRef.current === currentStep) {
          // Preserve persona from the original question (or from API response) for panel interviews
          const followUpPersona = isPanelInterview ? ((result as { persona?: string }).persona || step.persona) : undefined;
          const followUpStep: InterviewStep = {
            type: "follow-up",
            aiText: result.followUpText,
            thinkingDuration: 300,
            speakingDuration: 4000,
            waitForUser: true,
            scoreNote: "Dynamic follow-up based on candidate's answer",
            persona: followUpPersona,
          };
          setInterviewScript(prev => [
            ...prev.slice(0, currentStep),
            followUpStep,
            ...prev.slice(currentStep),
          ]);
        } else {
          setTimeout(startSpeaking, step.thinkingDuration);
        }
      }).catch(() => {
        if (!isStale()) setTimeout(startSpeaking, step.thinkingDuration);
      });
    } else {
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
  }, [currentStep, aiVoiceEnabled]);

  // Handle user "finishing" their answer
  const advancingRef = useRef(false);
  const handleNextQuestion = useCallback(() => {
    if (phase !== "listening" || advancingRef.current) return;
    advancingRef.current = true;
    setTimeout(() => { advancingRef.current = false; }, 500);

    ttsCancelRef.current?.();
    recognitionRef.current?.stop();

    const answerText = currentTranscript.trim() || `[Answer recorded — ${answerTimer}s]`;

    // Validate text input — require at least 10 chars for a real answer
    if (!answerText.startsWith("[Answer recorded") && answerText.length < 10) {
      toast("Please provide a longer answer (at least a few words).", "info");
      advancingRef.current = false;
      return;
    }

    setTranscript(prev => [...prev, {
      speaker: "user",
      text: answerText,
      time: formatTime(elapsed),
    }]);
    setCurrentTranscript("");

    const currentStepObj = interviewScript[currentStep];
    const isLastStep = currentStep >= interviewScript.length - 1;

    // Generate micro-feedback with dynamic difficulty awareness
    setMicroFeedback(null);
    if (answerText.length > 10 && !answerText.startsWith("[Answer recorded")) {
      const wordCount = answerText.trim().split(/\s+/).length;
      const hasMetrics = /\d+%|\$\d|[0-9]+x|[0-9]+ (users|customers|engineers|people)/i.test(answerText);
      const hasStructure = /first|second|then|finally|result|outcome|impact/i.test(answerText);
      const hasFirstPerson = /\bI\b/i.test(answerText);
      const hasCounterfactual = /without|otherwise|if.*not|had.*not|wouldn't/i.test(answerText);

      // Score this answer (0-100) for dynamic difficulty tracking
      let answerScore = 50;
      if (wordCount >= 50) answerScore += 10;
      if (wordCount >= 100) answerScore += 5;
      if (hasMetrics) answerScore += 15;
      if (hasStructure) answerScore += 10;
      if (hasFirstPerson) answerScore += 5;
      if (hasCounterfactual) answerScore += 5;
      if (wordCount < 30) answerScore -= 15;
      answerQualityRef.current.push(Math.min(100, Math.max(0, answerScore)));

      // Compute running average for dynamic difficulty
      const scores = answerQualityRef.current;
      const runningAvg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 50;
      const isExcelling = runningAvg >= 80 && scores.length >= 2;
      const isStruggling = runningAvg < 50 && scores.length >= 2;

      if (wordCount < 30) {
        setMicroFeedback(isStruggling
          ? "Try to say more — even 2-3 sentences about the situation helps."
          : "Try to elaborate more — aim for 60+ seconds per answer.");
      } else if (!hasMetrics && !hasStructure) {
        setMicroFeedback(isExcelling
          ? "Good content — push further with specific metrics and counterfactual reasoning."
          : "Good start! Try adding specific metrics and structuring with STAR.");
      } else if (!hasMetrics) {
        setMicroFeedback(isExcelling
          ? "Nice structure! Add quantified impact — '$X revenue', '30% faster', etc."
          : "Nice structure! Strengthen with specific numbers or metrics.");
      } else if (!hasStructure) {
        setMicroFeedback("Great data! Try structuring as Situation → Action → Result.");
      } else if (isExcelling && !hasCounterfactual) {
        setMicroFeedback("Strong answer! Next level: add counterfactual reasoning — 'Without this, X would have happened.'");
      } else {
        setMicroFeedback(isExcelling ? "Excellent — specific, structured, and impactful." : "Strong answer — specific and well-structured.");
      }
    }

    // Fire follow-up check in background
    const canFollowUp = (currentStepObj?.type === "question" || currentStepObj?.type === "follow-up")
      && !isLastStep && answerText.length > 10 && !answerText.startsWith("[Answer recorded");

    if (canFollowUp) {
      // Collect recent follow-up Q&A pairs for context
      const recentFollowUps: string[] = [];
      for (let i = Math.max(0, currentStep - 4); i <= currentStep; i++) {
        const s = interviewScript[i];
        if (s?.type === "follow-up") {
          recentFollowUps.push(`Q: ${s.aiText}`);
        }
      }
      if (answerText) recentFollowUps.push(`A: ${answerText}`);

      const depth = currentStepObj?.type === "follow-up" ? followUpDepthRef.current + 1 : 0;
      // Guard: if pending follow-up fetch is still in flight, skip to avoid desync
      if (pendingFollowUpRef.current) {
        pendingFollowUpRef.current = null;
      }

      if (depth <= 2) {
        followUpDepthRef.current = depth;
        pendingFollowUpRef.current = fetchFollowUp({
          question: currentStepObj!.aiText,
          answer: answerText,
          type: interviewType,
          role: user?.targetRole || "senior role",
          jobDescription: jobDescription || undefined,
          company: user?.targetCompany,
          followUpDepth: depth,
          previousFollowUps: recentFollowUps.length > 0 ? recentFollowUps : undefined,
          persona: isPanelInterview ? currentStepObj?.persona : undefined,
        });
      } else {
        pendingFollowUpRef.current = null;
      }
    } else {
      pendingFollowUpRef.current = null;
    }

    if (!isLastStep) {
      // Reset follow-up depth when advancing to a new original question
      const nextStep = interviewScript[currentStep + 1];
      if (nextStep?.type === "question" || nextStep?.type === "intro" || nextStep?.type === "closing") {
        followUpDepthRef.current = 0;
      }
      setCurrentStep(currentStep + 1);
    } else {
      setPhase("done");
    }
  }, [phase, currentStep, answerTimer, elapsed, interviewScript, interviewType, user, currentTranscript]);

  // Keep ref in sync for answer timer auto-advance
  useEffect(() => { handleNextRef.current = handleNextQuestion; }, [handleNextQuestion]);

  // Skip AI speaking
  const skipSpeaking = useCallback(() => {
    if (phase !== "speaking") return;
    ttsCancelRef.current?.();
    ttsCancelRef.current = null;
    setIsRecording(false);
    const currentStepObj = interviewScript[currentStep];
    if (currentStepObj?.waitForUser) {
      setPhase("listening");
      const nextStep = interviewScript[currentStep + 1];
      if (nextStep && aiVoiceEnabled) {
        prefetchTTS(nextStep.aiText);
      }
    } else {
      setTimeout(() => setPhase("done"), 1000);
    }
  }, [phase, currentStep, interviewScript, aiVoiceEnabled]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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

  // Update document.title with current phase
  useEffect(() => {
    const phaseLabel = phase === "thinking" ? "Preparing" : phase === "speaking" ? "AI Speaking" : phase === "listening" ? "Your Turn" : "Complete";
    document.title = `${phaseLabel} — HireStepX Interview`;
    return () => { document.title = "HireStepX"; };
  }, [phase]);

  // Auto-scroll transcript
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

  // Handle end interview
  const handleEnd = useCallback(async () => {
    if (evaluating || interviewEndedRef.current) return;
    interviewEndedRef.current = true;
    setPhase("done");
    ttsCancelRef.current?.();
    ttsCancelRef.current = null;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setAiVoiceEnabled(false);
    setIsMuted(true);
    setEvaluating(true);

    const sessionId = safeUUID();
    setLastSessionId(sessionId);
    let score = 0;
    let aiFeedback = "";
    let skillScores: Record<string, number> | null = null;

    // Flush any in-progress answer before evaluation
    const pendingAnswer = currentTranscript.trim();
    let evalTranscript = [...transcript];
    if (pendingAnswer && pendingAnswer.length > 0) {
      const flushedEntry = { speaker: "user" as const, text: pendingAnswer, time: formatTime(elapsed) };
      setTranscript(prev => [...prev, flushedEntry]);
      evalTranscript = [...evalTranscript, flushedEntry];
      setCurrentTranscript("");
    }

    // Evaluation timeout controller — used to abort the fetch if it exceeds 40s
    const evalAbort = new AbortController();
    const safetyTimer = setTimeout(() => {
      console.warn("[interview] handleEnd evaluation timeout (40s) — aborting fetch");
      evalAbort.abort();
    }, 40_000);

    try {
    const completionRatio = currentStep / Math.max(1, interviewScript.length);
    const baseScore = 65 + Math.round(completionRatio * 20);
    const difficultyBonus = interviewDifficulty === "intense" ? 5 : interviewDifficulty === "warmup" ? -3 : 0;
    const timeBonus = elapsed > 300 ? 5 : elapsed > 120 ? 3 : 0;
    const questionBonus = Math.min(5, Math.floor(evalTranscript.filter(t => t.speaker === "user").length * 1.5));
    const fallbackScore = Math.min(98, Math.max(60, baseScore + difficultyBonus + timeBonus + questionBonus));

    const hasAnyAnswers = evalTranscript.some(t => t.speaker === "user" && t.text.length > 10 && !/^\[.*\]$/.test(t.text.trim()));
    score = hasAnyAnswers ? fallbackScore : Math.min(30, fallbackScore);

    // Build heuristic skill scores for fallback (used when LLM eval fails/times out)
    const userAnswers = evalTranscript.filter(t => t.speaker === "user");
    const avgAnswerLen = userAnswers.length > 0 ? userAnswers.reduce((s, t) => s + t.text.length, 0) / userAnswers.length : 0;
    const hasMetrics = userAnswers.some(t => /\d+%|\d+x|\$[\d,]+|\d+ (users|customers|months|days|hours|team|people)/.test(t.text));
    const usesI = userAnswers.some(t => /\bI\b/.test(t.text));
    const fillerCount = userAnswers.reduce((s, t) => s + (t.text.match(/\b(um|uh|like|basically|actually|you know)\b/gi) || []).length, 0);
    const structureScore = Math.min(100, fallbackScore + (avgAnswerLen > 200 ? 5 : -5) + (hasMetrics ? 8 : -3));
    const commScore = Math.min(100, fallbackScore + (fillerCount < 3 ? 5 : -5) + (avgAnswerLen > 100 ? 3 : -5));
    const fallbackSkillScores: Record<string, number> = {
      communication: Math.max(40, Math.min(95, commScore)),
      structure: Math.max(40, Math.min(95, structureScore)),
      technicalDepth: Math.max(40, Math.min(95, fallbackScore + (avgAnswerLen > 300 ? 5 : -5))),
      leadership: Math.max(40, Math.min(95, fallbackScore + (usesI ? 3 : -5))),
      problemSolving: Math.max(40, Math.min(95, fallbackScore)),
      confidence: Math.max(40, Math.min(95, fallbackScore + (fillerCount < 2 ? 5 : -8))),
      specificity: Math.max(40, Math.min(95, fallbackScore + (hasMetrics ? 10 : -10))),
    };

    let idealAnswers: { question: string; ideal: string; candidateSummary: string; rating?: string; starBreakdown?: Record<string, string>; workedWell?: string; toImprove?: string }[] = [];
    let starAnalysis: { overall: number; breakdown: Record<string, number>; tip: string } | undefined;
    let strengths: string[] | undefined;
    let improvements: string[] | undefined;
    let nextSteps: string[] | undefined;

    if (hasAnyAnswers) {
      try {
        const originalQuestions = interviewScript
          .filter(s => s.type === "question" || s.type === "follow-up")
          .map(s => s.aiText);

        // Load previous session scores for delta-aware LLM feedback
        let previousScores: { overall: number; skills: Record<string, number> } | null = null;
        try {
          const raw = localStorage.getItem("hirestepx_sessions");
          if (raw) {
            const sessions = JSON.parse(raw);
            if (Array.isArray(sessions) && sessions.length > 0) {
              const prev = sessions[0]; // most recent completed session
              if (prev.score && prev.skill_scores) {
                const skills: Record<string, number> = {};
                for (const [k, v] of Object.entries(prev.skill_scores)) {
                  skills[k] = typeof v === "number" ? v : typeof v === "object" && v !== null && "score" in (v as Record<string, unknown>) ? (v as { score: number }).score : 0;
                }
                previousScores = { overall: prev.score, skills };
              }
            }
          }
        } catch { /* expected: localStorage may be unavailable */ }

        // Race the LLM evaluation against the 40s abort signal
        const evaluation = await Promise.race([
          fetchLLMEvaluation({
            transcript: evalTranscript,
            type: interviewType,
            difficulty: interviewDifficulty,
            role: targetRole || user?.targetRole || "the role",
            company: user?.targetCompany,
            questions: originalQuestions,
            resumeText: shouldUseResume ? user?.resumeText : undefined,
            jobDescription: jobDescription || undefined,
            previousScores,
          }),
          new Promise<null>((_, reject) => {
            evalAbort.signal.addEventListener("abort", () =>
              reject(new Error("Evaluation timed out after 40 seconds."))
            );
            // If already aborted (race condition), reject immediately
            if (evalAbort.signal.aborted) reject(new Error("Evaluation timed out after 40 seconds."));
          }),
        ]);
        if (evaluation) {
          score = Math.min(100, Math.max(0, evaluation.overallScore || fallbackScore));
          aiFeedback = evaluation.feedback || "";
          skillScores = evaluation.skillScores && typeof evaluation.skillScores === "object"
            ? Object.fromEntries(Object.entries(evaluation.skillScores).map(([k, v]) => [k, extractScore(v)]))
            : {};
          idealAnswers = Array.isArray(evaluation.idealAnswers) ? evaluation.idealAnswers : [];
          if (evaluation.starAnalysis && typeof evaluation.starAnalysis === "object") starAnalysis = evaluation.starAnalysis;
          if (Array.isArray(evaluation.strengths)) strengths = evaluation.strengths;
          if (Array.isArray(evaluation.improvements)) improvements = evaluation.improvements;
          if (Array.isArray(evaluation.nextSteps)) nextSteps = evaluation.nextSteps;
        } else {
          // fetchLLMEvaluation returned null (API error / bad response)
          setUsedFallbackScore(true);
          skillScores = fallbackSkillScores;
          aiFeedback = "Evaluation unavailable — score estimated from session metrics. Your estimated score is based on answer count, length, structure, and specificity. Practice again for a full AI evaluation.";
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Could not get AI feedback. Using estimated score.";
        if (errMsg.toLowerCase().includes("timed out") || errMsg.toLowerCase().includes("timeout")) {
          setEvalTimedOut(true);
          toast("Evaluation took too long — using estimated scores.", "info");
        } else {
          setUsedFallbackScore(true);
        }
        // Always provide skill scores even on error
        skillScores = fallbackSkillScores;
        aiFeedback = aiFeedback || "Evaluation unavailable — score estimated from session metrics. Your score reflects answer count, length, and structure. Try again for full AI analysis.";
        setSaveWarning(errMsg);
        if (!navigator.onLine || errMsg.toLowerCase().includes("network") || errMsg.toLowerCase().includes("fetch")) {
          try {
            const retryKey = `hirestepx_eval_retry_${sessionId}`;
            await saveToIDB(retryKey, {
              transcript: evalTranscript,
              type: interviewType,
              difficulty: interviewDifficulty,
              role: targetRole || user?.targetRole || "the role",
              company: user?.targetCompany,
              questions: interviewScriptRef.current.filter(s => s.type === "question" || s.type === "follow-up").map(s => s.aiText),
              sessionId,
              queuedAt: Date.now(),
            });
          } catch { /* IDB save is best-effort */ }
        }
      }
    } else {
      setUsedFallbackScore(true);
      skillScores = fallbackSkillScores;
      if (!hasAnyAnswers) {
        aiFeedback = "No answers were recorded in this session. Try speaking clearly into your microphone, or use the text input option.";
      } else {
        aiFeedback = "Evaluation unavailable — score estimated from session metrics. Your score reflects answer count, length, and structure.";
      }
    }

    // Refresh auth token before saving results
    try {
      const { getSupabase } = await import("./supabase");
      const client = await getSupabase();
      const { error } = await client.auth.refreshSession();
      if (error) console.warn("[interview] Auth refresh failed:", error.message);
    } catch { /* best effort */ }

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
        transcript: evalTranscript,
        ai_feedback: aiFeedback,
        skill_scores: skillScores,
        ideal_answers: idealAnswers.length > 0 ? idealAnswers : undefined,
        starAnalysis,
        strengths,
        improvements,
        nextSteps,
        resumeUsed: !!user?.resumeText,
        jobDescription: jobDescription || undefined,
        jdAnalysis: jdAnalysisData || null,
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
      try {
        await saveToIDB(`hirestepx_unsaved_${sessionId}`, {
          id: sessionId, date: new Date().toISOString(), type: interviewType,
          difficulty: interviewDifficulty, focus: interviewFocus, duration: elapsed,
          score, questions: totalQuestions, transcript: evalTranscript, ai_feedback: aiFeedback,
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

    track("session_complete", {
      type: interviewType,
      score,
      difficulty: interviewDifficulty,
      duration: elapsed,
      questions: totalQuestions,
      usedFallback: !!(usedFallbackScore || evalTimedOut),
      hasSkillScores: !!skillScores,
      hasFeedback: !!aiFeedback,
    });
    track("interview_completed", { type: interviewType, questionsAnswered: currentStep, duration: elapsed });

    try { localStorage.removeItem(draftKey); } catch { /* expected: localStorage cleanup is non-critical */ }
    try { await deleteFromIDB(draftKey); } catch { /* expected: IDB cleanup is non-critical */ }
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
    } catch (err) { console.error("[interview] Profile update failed:", err); }

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
      try { navigate("/dashboard"); } catch { /* expected: navigation may fail if component unmounted */ }
    } finally {
      clearTimeout(safetyTimer);
      setEvaluating(false);
    }
  }, [navigate, elapsed, interviewType, interviewDifficulty, interviewFocus, totalQuestions, user, updateUser, currentStep, interviewScript.length, transcript, currentTranscript]);

  // Live speech metrics (computed from current transcript)
  const liveMetrics = useMemo(() => {
    if (!currentTranscript || currentTranscript.length < 10) return null;
    const words = currentTranscript.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const minutes = Math.max(0.1, answerTimer / 60);
    const wpm = Math.round(wordCount / minutes);

    // Count filler words
    let fillerCount = 0;
    const text = currentTranscript.toLowerCase();
    const fillerWords = ["um", "uh", "like", "you know", "basically", "actually", "literally", "i mean", "kind of", "sort of"];
    for (const filler of fillerWords) {
      const regex = new RegExp(`\\b${filler}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) fillerCount += matches.length;
    }

    // Answer length guidance based on timer
    let lengthGuidance: string | null = null;
    if (answerTimer < 30 && wordCount < 20) {
      lengthGuidance = "Keep going — aim for 60-90 seconds";
    } else if (answerTimer >= 30 && answerTimer < 60 && wordCount < 40) {
      lengthGuidance = "Good start — add more detail";
    } else if (answerTimer >= 60 && answerTimer <= 90) {
      lengthGuidance = "Great length — wrap up with your result";
    } else if (answerTimer > 100) {
      lengthGuidance = "Consider wrapping up";
    }

    return { wordCount, wpm, fillerCount, lengthGuidance };
  }, [currentTranscript, answerTimer]);

  const QUESTION_TIME_LIMIT = 120;
  const timeRemaining = QUESTION_TIME_LIMIT - answerTimer;
  const timePercent = (answerTimer / QUESTION_TIME_LIMIT) * 100;
  const displayRole = targetRole || user?.targetRole || interviewType.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const displayCompany = targetCompany || user?.targetCompany || "";
  const displayFocus = interviewFocus !== "general" ? interviewFocus.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : interviewType.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  return {
    // State values
    phase,
    currentStep,
    step,
    interviewScript,
    llmLoading,
    elapsed,
    isRecording,
    speechUnavailable,
    isMuted,
    showTranscript,
    transcript,
    showEndModal,
    tabConflict,
    isOffline,
    saveWarning,
    micError,
    usedFallbackScore,
    evalTimedOut,
    lastSessionId,
    evaluating,
    evalElapsed,
    aiVoiceEnabled,
    showCaptions,
    currentTranscript,
    microFeedback,
    totalQuestions,
    currentQuestionNum,
    timeRemaining,
    timePercent,
    displayRole,
    displayCompany,
    displayFocus,
    interviewerName: activeInterviewerName,
    isPanelInterview,
    panelMembers,
    activePersona: activePersona || "",
    liveMetrics,

    // Setters the UI needs
    setCurrentTranscript,
    setSpeechUnavailable,
    setIsMuted,
    setShowTranscript,
    setShowEndModal,
    setAiVoiceEnabled,
    setMicError,
    setEvalTimedOut,
    setUsedFallbackScore,
    setEvaluating,

    // Action functions
    handleNextQuestion,
    skipSpeaking,
    handleEnd,
    navigate,

    // Refs the UI needs
    transcriptRef,
    endModalTriggerRef,
    textareaRef,
    nextBtnRef,
    micStreamRef,
    noSpeechCountRef,
    ttsCancelRef,
    interviewEndedRef,
  };
}
