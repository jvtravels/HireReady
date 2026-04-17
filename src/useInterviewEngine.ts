import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { track } from "@vercel/analytics";

import { useAuth } from "./AuthContext";
import { speak, speakAs, prefetchTTS, cleanupTTS, fetchCartesiaVoices, retryUnlockAudio, isAutoplayBlocked, unlockAudio } from "./tts";
import { useToast } from "./Toast";
import { saveToIDB, loadFromIDB, deleteFromIDB } from "./interviewIDB";
import type { InterviewStep } from "./interviewScripts";
import { getMiniScript, getScript } from "./interviewScripts";
import { saveSessionResult, fetchLLMQuestions, fetchLLMEvaluation, fetchFollowUp, retryQueuedEvals, getAdaptiveHints } from "./interviewAPI";
import type { NegotiationBandData } from "./interviewAPI";
import type { DeepgramSTTHandle } from "./deepgramSTT";
import type { SarvamSTTHandle } from "./sarvamSTT";
import { getInterviewerName, getInterviewerGender, getPanelMembers, formatTime } from "./InterviewComponents";
import type { SpeechRecognitionInstance } from "./speechRecognition";
import { safeUUID } from "./utils";
import { computeMicroFeedback } from "./interviewMicroFeedback";
import { useInterviewTimers } from "./useInterviewTimers";
import { useInterviewSTT } from "./useInterviewSTT";
import { computeFallbackScores, loadPreviousScores, processLLMEvaluation, extractNegotiationFacts } from "./interviewEvaluation";

/* ─── Helpers ─── */

/* ─── Persona normalization (shared across panel interview logic) ─── */
const PERSONA_NORM: Record<string, string> = { "hiring manager": "Hiring Manager", "technical lead": "Technical Lead", "hr partner": "HR Partner" };
function normalizePersona(persona: string): string {
  return PERSONA_NORM[persona.toLowerCase()] || persona;
}

/* ─── Answer-quality-aware reaction phrases ─── */
/* Instead of random acknowledgments, react based on what the user actually said */
const REACTIONS = {
  strong: [
    "That's a really strong example.",
    "Great — I like how specific you were.",
    "Excellent. That's the kind of detail I'm looking for.",
    "Very well articulated.",
    "Good answer — you clearly thought that through.",
    "I appreciate the specificity there.",
  ],
  decent: [
    "Okay, got it.",
    "Alright.",
    "I see where you're going with that.",
    "Hmm, okay.",
    "Right, understood.",
    "Fair enough.",
  ],
  weak: [
    "Okay… let me ask you something else.",
    "Alright, let's move on.",
    "Hmm, I see.",
    "Noted.",
    "Okay.",
  ],
  short: [
    "I'd love to hear more, but let's keep going.",
    "Okay — we'll come back to depth later.",
    "Alright, moving on.",
    "Hmm, that was brief — let's continue.",
  ],
  followUpBridge: [
    "Actually, before we move on —",
    "Hold on, I want to dig deeper on that.",
    "Wait — one more thing about what you just said.",
    "Let me push on that a bit more.",
    "I'm curious about something you mentioned —",
    "Before the next topic, I want to understand —",
  ],
  topicTransition: [
    "Alright, let me shift gears.",
    "Good. Let's talk about something different.",
    "Okay, moving to the next area.",
    "Let's switch topics.",
    "Right — now I want to explore another angle.",
  ],
  dontKnowRedirect: [
    "That's okay — let me rephrase that differently.",
    "No worries. Let me ask this from another angle.",
    "That's honest. Let me try a different approach.",
    "Fair enough — let me give you something closer to your experience.",
    "Okay, let's pivot. Think about it this way instead —",
  ],
  ramblingInterject: [
    "Sorry to interrupt — can you get to the outcome?",
    "I want to make sure we cover everything. What was the result?",
    "Let me jump in — what was the bottom line?",
    "I'm getting the context. Now tell me — what happened?",
    "Let me pause you there. What was the impact?",
  ],
  timePressure: [
    "We're running short on time, so let me pick up the pace.",
    "Just a couple more questions — let's keep it tight.",
    "We have a few minutes left. Let's make them count.",
  ],
  lastQuestion: [
    "Alright, last question for you.",
    "One final question before we wrap up.",
    "Last one — make it count.",
  ],
};

/** Detect "I don't know" or surrender responses */
function isIDontKnowAnswer(text: string): boolean {
  if (!text || text.length < 5) return false;
  const lower = text.toLowerCase().trim();
  const patterns = [
    /^i don'?t know/,
    /^i'?m not sure/,
    /^i have no idea/,
    /^i haven'?t (done|experienced|faced)/,
    /^no experience with/,
    /^i can'?t (think of|recall|remember)/,
    /^nothing comes to mind/,
    /^i don'?t have (an? )?(example|answer|experience)/,
    /^pass$/,
    /^skip$/,
    /^i'?ll skip/,
  ];
  return patterns.some(p => p.test(lower)) || (lower.length < 30 && /don'?t know|not sure|no idea|can'?t think/i.test(lower));
}

/* ─── Session interviewer personality ─── */
type InterviewerPersonality = "balanced" | "tough" | "friendly" | "time-pressed";
function pickPersonality(): InterviewerPersonality {
  const roll = Math.random();
  if (roll < 0.3) return "tough";
  if (roll < 0.55) return "friendly";
  if (roll < 0.7) return "time-pressed";
  return "balanced";
}

/** Assess answer quality for reaction selection */
function assessAnswerQuality(answer: string): "strong" | "decent" | "weak" | "short" {
  if (!answer || answer.startsWith("[Answer recorded") || answer.length < 15) return "short";
  const words = answer.trim().split(/\s+/).length;
  if (words < 25) return "short";
  const hasMetrics = /\d+%|\d+x|₹[\d,]+|\$[\d,]+|\d+ (users|customers|months|days|people|team|engineers|percent)/i.test(answer);
  const hasStructure = /first|second|then|finally|result|outcome|impact|as a result|because of this|the key/i.test(answer);
  const hasFirstPerson = /\bI\b/.test(answer);
  const hasSpecific = /specifically|for example|for instance|in particular|one time|at my|at our|we decided/i.test(answer);
  const qualitySignals = [hasMetrics, hasStructure, hasFirstPerson, hasSpecific].filter(Boolean).length;
  if (qualitySignals >= 3 && words >= 50) return "strong";
  if (qualitySignals >= 1 && words >= 35) return "decent";
  return "weak";
}

/* ─── Silence nudge phrases — spoken when user pauses too long during answer ─── */
const SILENCE_NUDGES = [
  "Take your time…",
  "Whenever you're ready.",
  "No rush — take a moment to think.",
  "Feel free to continue.",
  "I'm listening.",
  "Still with me? Take your time.",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Random delay in [min, max] ms */
function randomDelay(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min));
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
  const currentCity = searchParams.get("currentCity") || user?.city || "";
  const jobCity = searchParams.get("jobCity") || "";
  const sessionLength = searchParams.get("length") || "";
  const isMiniMode = searchParams.get("mini") === "true" || sessionLength === "10m";
  const shouldUseResume = searchParams.get("useResume") !== "false";
  const jobDescription = searchParams.get("jd") || "";

  // Session-level interviewer personality (persists for entire interview)
  const [personality] = useState<InterviewerPersonality>(() => pickPersonality());
  // Rambling interjection ref
  const ramblingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ramblingFiredRef = useRef(false);
  // "I don't know" count for evaluation context
  const dontKnowCountRef = useRef(0);
  // Negotiation band (populated by LLM question generation for salary-neg)
  const negotiationBandRef = useRef<NegotiationBandData | null>(null);
  // Negotiation style: randomly assigned per session for variety
  const [negotiationStyle] = useState(() => {
    if (interviewType !== "salary-negotiation") return undefined;
    const styles = ["cooperative", "aggressive", "defensive"] as const;
    return styles[Math.floor(Math.random() * styles.length)];
  });
  // Time pressure spoken flag
  const timePressureSpokenRef = useRef(false);
  const lastQuestionSpokenRef = useRef(false);

  const [jdAnalysisData] = useState(() => {
    try {
      const raw = sessionStorage.getItem("hirestepx_jd_analysis");
      if (raw) { sessionStorage.removeItem("hirestepx_jd_analysis"); return JSON.parse(raw); }
    } catch { /* ignore */ }
    return null;
  });

  // Draft restore: clear on new session (new=1 from SessionSetup), restore on refresh/resume
  const draftKey = `hirestepx_interview_draft_${user?.id || "anon"}`;
  const isNewSession = searchParams.get("new") === "1";
  const isResuming = searchParams.get("resume") === "true";
  const draftRef = useRef<InterviewDraft | null>(null);
  if (!draftRef.current) {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        if (isNewSession && !isResuming) {
          // Explicit new session from SessionSetup — clear old draft
          localStorage.removeItem(draftKey);
          deleteFromIDB(draftKey);
        } else {
          // Page refresh or explicit resume — try to restore
          const parsed = JSON.parse(raw);
          const DRAFT_TTL = 24 * 60 * 60 * 1000; // 24 hours
          const isExpired = parsed?.savedAt && Date.now() - parsed.savedAt > DRAFT_TTL;
          if (isExpired) {
            localStorage.removeItem(draftKey);
            deleteFromIDB(draftKey);
          } else if (parsed && Array.isArray(parsed.transcript) && typeof parsed.currentStep === "number" && parsed.currentStep > 0) {
            draftRef.current = parsed;
          }
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

  // Async IndexedDB fallback — try IDB on refresh or explicit resume (skip on new session)
  useEffect(() => {
    if (draftRef.current || (isNewSession && !isResuming)) return;
    let cancelled = false;
    loadFromIDB(draftKey).then(data => {
      if (cancelled) return;
      if (data && typeof data === "object" && "transcript" in data) {
        const d = data as InterviewDraft & { savedAt?: number; currentStep?: number };
        const DRAFT_TTL = 24 * 60 * 60 * 1000;
        if (d.savedAt && Date.now() - d.savedAt > DRAFT_TTL) {
          deleteFromIDB(draftKey);
          return;
        }
        if (!d.currentStep || d.currentStep === 0) return;
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

  // LLM question generation — extracted so it can be retried
  const llmFetchCancelRef = useRef(false);
  const fetchPersonalizedQuestions = useCallback(() => {
    if (!navigator.onLine) {
      toast("Offline — using practice questions.", "info");
      setLlmLoading(false);
      return;
    }
    llmFetchCancelRef.current = false;
    setLlmLoading(true);
    setSaveWarning("");

    let adaptiveHints: { weakSkills: string[]; pastTopics: string[] } = { weakSkills: [], pastTopics: [] };
    try {
      const cached = localStorage.getItem(`hirestepx_cache_sessions_${user?.id}`);
      if (cached && cached.length < 500_000) {
        const pastSessions = JSON.parse(cached);
        adaptiveHints = getAdaptiveHints(pastSessions, jdAnalysisData?.missingSkills);
      }
    } catch { /* silent */ }

    const aiProfile = (user?.resumeData as Record<string, unknown> | undefined)?.aiProfile as { interviewStrengths?: string[]; interviewGaps?: string[]; topSkills?: string[] } | undefined;
    const llmPromise = fetchLLMQuestions({
      type: interviewType,
      focus: interviewFocus,
      difficulty: interviewDifficulty,
      role: targetRole || user?.targetRole || "the role",
      company: targetCompany || user?.targetCompany,
      currentCity: currentCity,
      jobCity: jobCity,
      industry: user?.industry,
      resumeText: shouldUseResume ? user?.resumeText : undefined,
      pastTopics: adaptiveHints.pastTopics.length > 0 ? adaptiveHints.pastTopics : undefined,
      weakSkills: adaptiveHints.weakSkills.length > 0 ? adaptiveHints.weakSkills : undefined,
      jobDescription: jobDescription || undefined,
      experienceLevel: user?.experienceLevel || undefined,
      mini: isMiniMode || undefined,
      resumeStrengths: shouldUseResume ? aiProfile?.interviewStrengths : undefined,
      resumeGaps: shouldUseResume ? aiProfile?.interviewGaps : undefined,
      resumeTopSkills: shouldUseResume ? aiProfile?.topSkills : undefined,
      candidateName: user?.name || undefined,
      negotiationStyle: negotiationStyle || undefined,
    });
    const timeoutMs = isMiniMode ? 12_000 : 30_000;
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error("Question generation timed out")), timeoutMs);
    });
    Promise.race([llmPromise, timeoutPromise]).then(result => {
      if (llmFetchCancelRef.current) return;
      const questions = result?.questions ?? null;
      // Store negotiation band for follow-up API calls
      if (result?.negotiationBand) {
        negotiationBandRef.current = result.negotiationBand;
      }
      const step = currentStepRef.current;
      if (questions && questions.length > 0 && step === 0) {
        // Step 0 (intro) is already speaking — keep current intro, replace only steps 1+
        // This prevents the jarring mid-sentence cut when LLM questions arrive
        console.warn(`[interview] LLM generated ${questions.length} custom questions (merging from step 1, preserving intro)`);
        setInterviewScript(prev => [prev[0], ...questions.slice(1)]);
        setSaveWarning("");
      } else if (questions && questions.length > 0 && step === 1) {
        // User already moved past intro — safe to replace entire script
        console.warn(`[interview] LLM generated ${questions.length} custom questions (replacing at step ${step})`);
        setInterviewScript(prev => [prev[0], ...questions.slice(1)]);
        setSaveWarning("");
      } else if (questions && questions.length > 0 && step >= 2) {
        // Late arrival: merge remaining LLM questions into the script from the current position onward
        // This replaces the upcoming fallback questions while preserving already-answered ones
        console.warn(`[interview] LLM questions arrived late (step ${step}) — merging remaining questions`);
        setInterviewScript(prev => {
          // Keep everything up to and including the current step from the old script
          const keepPrefix = prev.slice(0, step + 1);
          // Take future questions from the LLM script (skip intro + already-passed questions)
          const llmFutureSteps = questions.filter(
            (q: { type: string }, i: number) => i > step && (q.type === "question" || q.type === "closing"),
          );
          if (llmFutureSteps.length === 0) return prev; // Nothing useful to merge
          return [...keepPrefix, ...llmFutureSteps];
        });
        setSaveWarning("");
      } else if (!questions) {
        console.warn("[interview] LLM returned null — using fallback questions");
        setSaveWarning("Using practice questions. Tap retry for personalized ones.");
        if (!isMiniMode) toast("Using practice questions — tap retry for personalized ones.", "info");
      }
      setLlmLoading(false);
    }).catch(err => {
      if (llmFetchCancelRef.current) return;
      const msg = err.message || "Could not generate questions.";
      console.warn("[interview] LLM question generation error:", msg);
      setSaveWarning(`${msg} Tap retry for personalized questions.`);
      if (!isMiniMode) toast(`Using practice questions — ${msg.toLowerCase()}`, "info");
      setLlmLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewType, interviewFocus, interviewDifficulty, isMiniMode]);

  // Retry LLM question generation (exposed to UI)
  const retryQuestions = useCallback(() => {
    if (currentStepRef.current > 0) {
      toast("Can't change questions after you've started answering.", "info");
      return;
    }
    fetchPersonalizedQuestions();
  }, [fetchPersonalizedQuestions]);

  // Fetch on mount
  useEffect(() => {
    fetchPersonalizedQuestions();
    return () => { llmFetchCancelRef.current = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Speech recognition
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const deepgramRef = useRef<DeepgramSTTHandle | null>(null);
  const sarvamRef = useRef<SarvamSTTHandle | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [phase, setPhase] = useState<"thinking" | "speaking" | "listening" | "done">("thinking");
  const [isRecording, setIsRecording] = useState(false);

  // Timers: elapsed clock, answer timer with auto-advance, tab visibility
  const {
    elapsed, setElapsed, answerTimer, timeRemaining, timePercent,
    handleNextRef,
  } = useInterviewTimers(phase, currentStep, draftRef.current?.elapsed || 0, toast);

  // TTS-caption sync: actual audio duration (from TTS provider) and speech-ended flag
  const [ttsDurationMs, setTtsDurationMs] = useState<number | undefined>(undefined);
  const [speechEnded, setSpeechEnded] = useState(false);
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

  // Ensure audio is unlocked on interview mount (belt-and-suspenders for Q1 voice)
  useEffect(() => { unlockAudio(); }, []);

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

  // Retry audio unlock on any user click inside the interview page
  // This recovers from autoplay blocks when the user interacts with the page
  useEffect(() => {
    const handler = () => {
      if (isAutoplayBlocked()) {
        retryUnlockAudio();
        toast("Audio re-enabled. Voice will play on next question.", "info");
      }
    };
    document.addEventListener("click", handler, { once: false });
    document.addEventListener("touchstart", handler, { once: false });
    return () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("touchstart", handler);
    };
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
  const silenceNudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceNudgeFiredRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalElapsed, setEvalElapsed] = useState(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const interviewerName = useMemo(() => getInterviewerName(`${interviewType}-${interviewFocus}-${targetCompany}-${user?.id || ""}`), [interviewType, interviewFocus, targetCompany, user?.id]);
  const interviewerGender = useMemo(() => getInterviewerGender(interviewerName), [interviewerName]);

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

  // Auto-save draft (clear draft when interview completes to prevent stale restore)
  useEffect(() => {
    if (phase === "done" || evaluating) {
      // Interview completed — clear draft so next session starts fresh
      try { localStorage.removeItem(draftKey); } catch { /* non-critical */ }
      deleteFromIDB(draftKey);
      return;
    }
    const saveDraft = () => {
      const draftData = {
        transcript, currentStep, elapsed, interviewType, interviewDifficulty, interviewFocus,
        targetRole, targetCompany,
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
      sarvamRef.current?.abort();
    };
  }, [aiVoiceEnabled]);

  // STT fallback chain: Deepgram → Sarvam → Web Speech API + mic stream capture
  useInterviewSTT(phase, isMuted, speechUnavailable, {
    setCurrentTranscript, setMicError, setSpeechUnavailable, setShowCaptions,
    toast, textareaRef, interviewEndedRef,
  }, {
    recognitionRef, deepgramRef, sarvamRef, noSpeechCountRef, micStreamRef,
  });

  // Feature 3: Silence nudge — if user is silent for 15s during listening, speak a gentle prompt
  useEffect(() => {
    if (phase !== "listening" || !aiVoiceEnabled) {
      if (silenceNudgeTimerRef.current) { clearTimeout(silenceNudgeTimerRef.current); silenceNudgeTimerRef.current = null; }
      return;
    }
    silenceNudgeFiredRef.current = false;
    const startNudgeTimer = () => {
      if (silenceNudgeTimerRef.current) clearTimeout(silenceNudgeTimerRef.current);
      silenceNudgeTimerRef.current = setTimeout(() => {
        if (silenceNudgeFiredRef.current || interviewEndedRef.current) return;
        silenceNudgeFiredRef.current = true;
        const nudge = pickRandom(SILENCE_NUDGES);
        // Add nudge to transcript so user sees it
        setTranscript(prev => [...prev, { speaker: "ai", text: `[${nudge}]`, time: formatTime(elapsed) }]);
        // Speak the nudge — don't block; user can start talking anytime
        speak(nudge, () => {}, () => {}, interviewerGender).catch(() => {});
      }, 15_000);
    };
    startNudgeTimer();
    return () => {
      if (silenceNudgeTimerRef.current) { clearTimeout(silenceNudgeTimerRef.current); silenceNudgeTimerRef.current = null; }
    };
  }, [phase, aiVoiceEnabled, currentStep]);

  // Reset silence nudge timer when user starts speaking (transcript changes)
  useEffect(() => {
    if (phase !== "listening" || !aiVoiceEnabled || !currentTranscript) return;
    // User is speaking — cancel any pending nudge
    if (silenceNudgeTimerRef.current) { clearTimeout(silenceNudgeTimerRef.current); silenceNudgeTimerRef.current = null; }
    silenceNudgeFiredRef.current = true; // Don't nudge once they've started
  }, [currentTranscript, phase, aiVoiceEnabled]);

  // Rambling interjection — if user has been speaking for 90s+, interject to wrap up
  useEffect(() => {
    if (phase !== "listening" || !aiVoiceEnabled) {
      if (ramblingTimerRef.current) { clearTimeout(ramblingTimerRef.current); ramblingTimerRef.current = null; }
      ramblingFiredRef.current = false;
      return;
    }
    ramblingFiredRef.current = false;
    ramblingTimerRef.current = setTimeout(() => {
      if (ramblingFiredRef.current || interviewEndedRef.current) return;
      // Only interject if user is actually speaking (has transcript)
      if (!currentTranscript || currentTranscript.trim().split(/\s+/).length < 40) return;
      ramblingFiredRef.current = true;
      const interjection = pickRandom(REACTIONS.ramblingInterject);
      setTranscript(prev => [...prev, { speaker: "ai", text: `[${interjection}]`, time: formatTime(elapsed) }]);
      speak(interjection, () => {}, () => {}, interviewerGender).catch(() => {});
      toast("Tip: Keep answers under 90 seconds for best impact.", "info");
    }, 90_000);
    return () => {
      if (ramblingTimerRef.current) { clearTimeout(ramblingTimerRef.current); ramblingTimerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, aiVoiceEnabled, currentStep]);

  const step = interviewScript[currentStep] ?? interviewScript[interviewScript.length - 1];
  const rawPersona = step?.persona || (panelMembers ? panelMembers[0].title : "");
  const activePersona = normalizePersona(rawPersona);
  const activeInterviewerName = isPanelInterview && panelMembers
    ? (panelMembers.find(m => m.title === activePersona)?.name || interviewerName)
    : (step?.persona || interviewerName);
  const totalQuestions = useMemo(() => interviewScript.filter(s => s.type === "question" || s.type === "follow-up").length, [interviewScript]);
  const baseQuestionCount = useMemo(() => interviewScript.filter(s => s.type === "question").length, [interviewScript]);
  const currentQuestionNum = useMemo(() => interviewScript.slice(0, currentStep + 1).filter(s => s.type === "question" || s.type === "follow-up").length, [interviewScript, currentStep]);
  const isCurrentFollowUp = step?.type === "follow-up";

  // Interview flow: thinking -> speaking (with TTS) -> listening
  const flowGenerationRef = useRef(0);
  const pendingFollowUpRef = useRef<Promise<{ needsFollowUp: boolean; followUpText: string; followUpType?: string } | null> | null>(null);
  const followUpDepthRef = useRef(0);
  // (Follow-up cap for salary-negotiation is counted from the script itself inside setInterviewScript)
  // Dynamic difficulty: track answer quality mid-interview for escalation/de-escalation
  const answerQualityRef = useRef<number[]>([]);
  // Last answer quality for contextual reactions
  const lastAnswerQualityRef = useRef<"strong" | "decent" | "weak" | "short">("decent");
  const lastAnswerTextRef = useRef("");

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

    // Cancel any in-flight TTS from previous generation to prevent overlap
    ttsCancelRef.current?.();
    ttsCancelRef.current = null;

    setPhase("thinking");

    if (aiVoiceEnabled && step.aiText) {
      prefetchTTS(step.aiText, interviewerGender);
    }

    // Whether this step should get a reaction phrase (question/follow-up, not first step)
    const shouldUseThinkingPhrase = currentStep > 0 && (step.type === "question" || step.type === "follow-up" || (step.type === "closing" && interviewType === "salary-negotiation"));

    // Build context-aware reaction phrase
    let thinkingPhrase: string | null = null;
    if (shouldUseThinkingPhrase) {
      const quality = lastAnswerQualityRef.current;
      const lastAnswer = lastAnswerTextRef.current;
      const isIDontKnow = isIDontKnowAnswer(lastAnswer);

      if (interviewType === "salary-negotiation") {
        // Salary-negotiation: hiring manager reactions (no topic transitions or time pressure)
        if (isIDontKnow) {
          thinkingPhrase = pickRandom([
            "I need you to share your expectations so we can work this out.",
            "Help me understand what you're looking for — I can't make this work without your input.",
            "Let me rephrase that.",
          ]);
        } else if (quality === "strong") {
          thinkingPhrase = pickRandom([
            "That's fair.", "I hear you.", "Okay, let me think about that.",
            "That's a reasonable ask.", "I appreciate the clarity.",
          ]);
        } else if (quality === "weak") {
          thinkingPhrase = pickRandom([
            "Hmm, okay.", "I see.", "Let me address that.",
            "Alright.", "Noted.",
          ]);
        } else {
          thinkingPhrase = pickRandom([
            "Okay.", "Got it.", "I understand.", "Right.", "Sure.",
          ]);
        }
      } else if (isIDontKnow && step.type !== "follow-up") {
        // "I don't know" response — redirect gracefully
        thinkingPhrase = pickRandom(REACTIONS.dontKnowRedirect);
        dontKnowCountRef.current++;
      } else if (step.type === "follow-up") {
        // Follow-ups get bridge phrases that signal "I'm probing deeper"
        thinkingPhrase = pickRandom(REACTIONS.followUpBridge);
      } else {
        // Personality-modulated reactions
        let reaction: string;
        if (personality === "tough") {
          reaction = quality === "strong" ? pickRandom(["Okay.", "Alright, noted.", "Fair."]) :
                     quality === "weak" ? pickRandom(["Hmm.", "Okay… I was hoping for more specifics.", "Let's move on."]) :
                     pickRandom(REACTIONS[quality]);
        } else if (personality === "friendly") {
          reaction = quality === "strong" ? pickRandom(["That's great! Really well put.", "Excellent example — I love the detail.", "Very impressive."]) :
                     quality === "weak" ? pickRandom(["Okay, no problem. Let's try another.", "That's fine — let's keep going."]) :
                     pickRandom(REACTIONS[quality]);
        } else if (personality === "time-pressed") {
          reaction = pickRandom(["Got it.", "Okay.", "Right.", "Noted."]);
        } else {
          reaction = pickRandom(REACTIONS[quality]);
        }

        // Time pressure announcements
        const questionsRemaining = interviewScript.filter((s, i) => i > currentStep && s.type === "question").length;
        let transition: string;
        if (questionsRemaining === 1 && !lastQuestionSpokenRef.current) {
          lastQuestionSpokenRef.current = true;
          transition = pickRandom(REACTIONS.lastQuestion);
        } else if (questionsRemaining <= 2 && !timePressureSpokenRef.current && currentStep > 2) {
          timePressureSpokenRef.current = true;
          transition = pickRandom(REACTIONS.timePressure);
        } else {
          transition = pickRandom(REACTIONS.topicTransition);
        }
        thinkingPhrase = `${reaction} ${transition}`;
      }
    }

    const startSpeaking = () => {
      if (isStale()) return;
      clearTimeout(thinkingSafetyTimer); // Clear thinking safety — we're proceeding
      setPhase("speaking");
      setIsRecording(true);
      // Reset TTS-caption sync state for this question
      setTtsDurationMs(undefined);
      setSpeechEnded(false);

      setTranscript(prev => [...prev, {
        speaker: "ai",
        text: step.persona ? `[${step.persona}] ${step.aiText}` : step.aiText,
        time: formatTime(elapsed),
      }]);

      ttsCancelRef.current?.();

      let localSpeechEnded = false;
      const onSpeechEnd = () => {
        if (localSpeechEnded || isStale()) return;
        localSpeechEnded = true;
        setSpeechEnded(true);
        if (safetyTimer) clearTimeout(safetyTimer);
        setIsRecording(false);
        if (step.waitForUser) {
          setPhase("listening");
          // Reset silence nudge for the new listening phase
          silenceNudgeFiredRef.current = false;
          const nextStep = interviewScript[currentStep + 1];
          if (nextStep && aiVoiceEnabled) {
            prefetchTTS(nextStep.aiText, interviewerGender);
          }
        } else {
          setTimeout(() => setPhase("done"), 1000);
        }
      };

      // Safety timer: allow speakingDuration + buffer for TTS latency/network jitter
      // If autoplay is blocked, use a short 3s timeout since no audio will play
      const safetyMs = isAutoplayBlocked()
        ? 3000
        : Math.max(step.speakingDuration + 8000, 12000);
      safetyTimer = setTimeout(() => {
        if (!localSpeechEnded) {
          console.warn("[interview] TTS safety timeout — forcing phase transition");
          onSpeechEnd();
        }
      }, safetyMs);

      if (aiVoiceEnabled) {
        const instanceId = ++ttsInstanceIdRef.current;
        // Callback: TTS provider reports actual audio duration → sync caption typing speed
        const onDurationKnown = (ms: number) => {
          if (ttsInstanceIdRef.current === instanceId) setTtsDurationMs(ms);
        };
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
            ? speakAs(step.aiText, panelVoiceId, onSpeechEnd, onSpeechEnd, panelGender, onDurationKnown)
            : speak(step.aiText, onSpeechEnd, onSpeechEnd, interviewerGender, onDurationKnown);
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

    // Speak a thinking phrase (e.g. "Hmm… okay.") before the actual question for realism
    const startWithThinkingPhrase = () => {
      if (isStale() || !thinkingPhrase) { startSpeaking(); return; }
      if (aiVoiceEnabled) {
        const phraseInstanceId = ++ttsInstanceIdRef.current;
        const onPhraseDone = () => {
          if (isStale()) return;
          // Brief micro-pause between phrase and question (300-600ms)
          setTimeout(startSpeaking, randomDelay(300, 600));
        };
        speak(thinkingPhrase, onPhraseDone, onPhraseDone, interviewerGender).then(handle => {
          if (ttsInstanceIdRef.current === phraseInstanceId) {
            ttsCancelRef.current = handle.cancel;
          } else {
            handle.cancel();
          }
        }).catch(() => { if (!isStale()) startSpeaking(); });
      } else {
        // Without voice, just add a slightly longer delay to simulate thinking
        setTimeout(startSpeaking, randomDelay(400, 800));
      }
    };

    // Thinking-phase safety: if stuck in "thinking" for >12s, force-start speaking
    const thinkingSafetyTimer = setTimeout(() => {
      if (!isStale()) {
        console.warn("[interview] thinking-phase safety timeout — forcing startSpeaking");
        startSpeaking();
      }
    }, 12000);

    const pendingFollowUp = pendingFollowUpRef.current;
    const isSalaryNegConversation = interviewType === "salary-negotiation";
    if (pendingFollowUp) {
      pendingFollowUpRef.current = null;
      const timeout = new Promise<null>(r => setTimeout(() => r(null), isSalaryNegConversation ? 9000 : 4000));
      Promise.race([pendingFollowUp, timeout]).then(result => {
        if (isStale() || interviewEndedRef.current) return;
        if (result?.needsFollowUp && result.followUpText && currentStepRef.current === currentStep) {
          // Preserve persona from the original question (or from API response) for panel interviews
          const followUpPersona = isPanelInterview ? ((result as { persona?: string }).persona || step.persona) : undefined;
          // Compute speakingDuration from word count (~150 WPM for TTS, with a 2s floor)
          const followUpWords = result.followUpText.split(/\s+/).length;
          const followUpSpeakMs = Math.max(3000, Math.round((followUpWords / 150) * 60 * 1000) + 1500);
          const followUpStep: InterviewStep = {
            type: isSalaryNegConversation ? "question" : "follow-up",
            aiText: result.followUpText,
            thinkingDuration: 300,
            speakingDuration: followUpSpeakMs,
            waitForUser: true,
            scoreNote: isSalaryNegConversation ? "Salary negotiation response — evaluate negotiation strategy" : "Dynamic follow-up based on candidate's answer",
            persona: followUpPersona,
          };
          if (isSalaryNegConversation) {
            // Salary negotiation: make the conversation contextual
            // Strategy: REPLACE the next pre-generated question with a contextual one,
            // OR INSERT a follow-up probe if the answer was vague (with a hard cap).
            setInterviewScript(prev => {
              const nextQuestionIdx = prev.findIndex((s, i) => i > currentStep && s.type === "question");
              if (nextQuestionIdx > currentStep && nextQuestionIdx < prev.length - 1) {
                // Replace the next pre-generated question with the dynamic contextual response
                return [...prev.slice(0, nextQuestionIdx), followUpStep, ...prev.slice(nextQuestionIdx + 1)];
              }
              // No more questions to replace — check if we can insert a follow-up probe
              // (e.g., last question before closing, or vague answer needs probing)
              // Cap check inside setInterviewScript to prevent race condition
              const maxInserts = isMiniMode ? 2 : 3;
              const alreadyInserted = prev.filter(s => s.type === "follow-up").length;
              if (alreadyInserted < maxInserts) {
                const closingIdx = prev.findIndex((s, i) => i > currentStep && s.type === "closing");
                if (closingIdx > currentStep) {
                  const insertStep = { ...followUpStep, type: "follow-up" as const };
                  return [...prev.slice(0, closingIdx), insertStep, ...prev.slice(closingIdx)];
                }
              }
              // Hard cap reached or no closing found — proceed naturally
              return prev;
            });
            // Start speaking the current step — script replacement doesn't change length,
            // so the effect won't re-run; we must explicitly kick off the thinking phase.
            const microDelay = shouldUseThinkingPhrase ? randomDelay(800, 1500) : step.thinkingDuration;
            setTimeout(() => { if (!isStale() && !interviewEndedRef.current) startWithThinkingPhrase(); }, microDelay);
          } else {
            setInterviewScript(prev => [
              ...prev.slice(0, currentStep),
              followUpStep,
              ...prev.slice(currentStep),
            ]);
          }
        } else if (!interviewEndedRef.current) {
          // Quality-aware pause: longer pause after strong answers (interviewer absorbing), shorter after weak
          const quality = lastAnswerQualityRef.current;
          const pauseRange = quality === "strong" ? [1200, 2000] : quality === "decent" ? [800, 1400] : [500, 900];
          const microDelay = shouldUseThinkingPhrase ? randomDelay(pauseRange[0], pauseRange[1]) : step.thinkingDuration;
          setTimeout(() => { if (!isStale() && !interviewEndedRef.current) startWithThinkingPhrase(); }, microDelay);
        }
      }).catch(() => {
        if (!isStale() && !interviewEndedRef.current) {
          const microDelay = shouldUseThinkingPhrase ? randomDelay(800, 1500) : step.thinkingDuration;
          setTimeout(() => { if (!isStale() && !interviewEndedRef.current) startWithThinkingPhrase(); }, microDelay);
        }
      });
    } else {
      // Quality-aware pause before next question
      const quality = lastAnswerQualityRef.current;
      const pauseRange = shouldUseThinkingPhrase
        ? (quality === "strong" ? [1200, 2000] : quality === "decent" ? [800, 1400] : [500, 900])
        : [step.thinkingDuration, step.thinkingDuration];
      const microDelay = randomDelay(pauseRange[0], pauseRange[1]);
      const thinkTimer = setTimeout(startWithThinkingPhrase, microDelay);
      return () => {
        cancelled = true;
        clearTimeout(thinkTimer);
        clearTimeout(thinkingSafetyTimer);
        if (safetyTimer) clearTimeout(safetyTimer);
        ttsCancelRef.current?.();
      };
    }

    return () => {
      cancelled = true;
      clearTimeout(thinkingSafetyTimer);
      if (safetyTimer) clearTimeout(safetyTimer);
      ttsCancelRef.current?.();
    };
  // interviewScript.length: re-run when follow-up steps are inserted at currentStep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, aiVoiceEnabled, interviewScript.length]);

  // Handle user "finishing" their answer
  const advancingRef = useRef(false);
  const handleNextQuestion = useCallback(() => {
    if (phase !== "listening" || advancingRef.current) return;
    advancingRef.current = true;
    setTimeout(() => { advancingRef.current = false; }, 500);

    ttsCancelRef.current?.();
    recognitionRef.current?.stop();

    const rawTranscript = currentTranscript.trim();
    const answerText = rawTranscript || (answerTimer > 2 ? `[Answer recorded — ${answerTimer}s]` : "");

    // Block completely empty answers (silence with no speech detected)
    if (!answerText) {
      toast("Please speak or type your response before continuing.", "info");
      advancingRef.current = false;
      return;
    }

    // Warn user when STT captured nothing — encourage typing
    if (!rawTranscript && answerTimer > 2) {
      toast("Speech wasn't detected clearly. Try typing your response next time.", "info");
    }

    // Validate text input — require minimum length (shorter threshold for salary-negotiation since "₹25 LPA" is valid)
    const minLength = interviewType === "salary-negotiation" ? 3 : 10;
    if (!answerText.startsWith("[Answer recorded") && answerText.length < minLength) {
      toast(interviewType === "salary-negotiation" ? "Please type your response." : "Please provide a longer answer (at least a few words).", "info");
      advancingRef.current = false;
      return;
    }

    // Store answer quality for contextual reaction in next thinking phase
    lastAnswerQualityRef.current = assessAnswerQuality(answerText);
    lastAnswerTextRef.current = answerText;

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
      const { feedback, score: answerScore } = computeMicroFeedback(answerText, interviewType, answerQualityRef.current);
      answerQualityRef.current.push(answerScore);
      if (feedback) setMicroFeedback(feedback);
    }

    // Fire follow-up check in background
    const isSalaryNegType = interviewType === "salary-negotiation";
    // For salary-negotiation: always fire follow-up to make conversation contextual.
    // The resolution handler decides whether to REPLACE the next question or INSERT a probe.
    // Hard cap on total inserted follow-ups prevents infinite growth (max 2-3 extra turns).
    const hasRealAnswer = answerText.length > 10 && !answerText.startsWith("[Answer recorded");
    const canFollowUp = isSalaryNegType
      ? ((currentStepObj?.type === "question" || currentStepObj?.type === "follow-up") && !isLastStep && hasRealAnswer)
      : ((currentStepObj?.type === "question" || currentStepObj?.type === "follow-up")
        && !isLastStep && hasRealAnswer);

    if (canFollowUp) {
      // Cross-question memory: build conversation history for context
      const earlierTopics: string[] = [];
      for (const t of transcript) {
        if (t.speaker === "ai" && !t.text.startsWith("[")) {
          earlierTopics.push(`Q: ${t.text.slice(0, 150)}`);
        } else if (t.speaker === "user" && !t.text.startsWith("[")) {
          earlierTopics.push(`A: ${t.text.slice(0, 120)}`);
        }
      }
      // Add current exchange
      earlierTopics.push(`Q: ${currentStepObj!.aiText.slice(0, 150)}`);
      earlierTopics.push(`A: ${answerText.slice(0, 120)}`);
      const conversationHistory = earlierTopics.slice(-20).join("\n");

      // Collect recent follow-up Q&A pairs
      const recentFollowUps: string[] = [];
      for (let i = Math.max(0, currentStep - 4); i <= currentStep; i++) {
        const s = interviewScript[i];
        if (s?.type === "follow-up") {
          recentFollowUps.push(`Q: ${s.aiText}`);
        }
      }
      if (answerText) recentFollowUps.push(`A: ${answerText}`);

      // For salary negotiation: always depth 0 (each response is a new conversational turn, not a stacked follow-up)
      // For other types: increment depth for follow-up chains
      const depth = isSalaryNegType ? 0 : (currentStepObj?.type === "follow-up" ? followUpDepthRef.current + 1 : 0);

      // Guard: if pending follow-up fetch is still in flight, skip to avoid desync
      if (pendingFollowUpRef.current) {
        pendingFollowUpRef.current = null;
      }

      // Determine negotiation phase from question index for salary-negotiation
      const questionSteps = interviewScript.filter(s => s.type === "question" || s.type === "follow-up");
      const currentQuestionIdx = interviewScript.slice(0, currentStep + 1).filter(s => s.type === "question" || s.type === "follow-up").length;
      const totalQs = questionSteps.length;
      const negotiationPhases = ["offer-reaction", "probe-expectations", "counter-offer", "benefits-discussion", "closing-pressure", "closing"];
      const salaryPhase = isSalaryNegType ? (negotiationPhases[Math.min(currentQuestionIdx - 1, negotiationPhases.length - 1)] || "offer-reaction") : undefined;

      if (depth <= 2) {
        followUpDepthRef.current = depth;
        const followUpAiProfile = (user?.resumeData as Record<string, unknown> | undefined)?.aiProfile as { topSkills?: string[] } | undefined;
        // For salary negotiation: find the initial offer question text so the LLM can reference exact numbers
        const initialOfferText = isSalaryNegType
          ? interviewScript.find(s => s.type === "question" && /₹|lpa|ctc|offer|base/i.test(s.aiText))?.aiText
          : undefined;

        // Extract structured negotiation facts from the full transcript (including current answer)
        const negotiationFacts = isSalaryNegType
          ? extractNegotiationFacts([...transcript, { speaker: "user", text: answerText, time: "" }])
          : undefined;

        pendingFollowUpRef.current = fetchFollowUp({
          question: currentStepObj!.aiText,
          answer: answerText,
          type: interviewType,
          role: user?.targetRole || "senior role",
          jobDescription: jobDescription || undefined,
          company: user?.targetCompany,
          currentCity: currentCity || undefined,
          jobCity: jobCity || undefined,
          followUpDepth: depth,
          previousFollowUps: recentFollowUps.length > 0 ? recentFollowUps : undefined,
          persona: isPanelInterview ? currentStepObj?.persona : undefined,
          conversationHistory: conversationHistory || undefined,
          negotiationPhase: salaryPhase,
          questionIndex: isSalaryNegType ? currentQuestionIdx : undefined,
          totalQuestions: isSalaryNegType ? totalQs : undefined,
          resumeTopSkills: followUpAiProfile?.topSkills,
          initialOfferText,
          negotiationFacts,
          negotiationStyle: negotiationStyle || undefined,
          negotiationBand: negotiationBandRef.current || undefined,
          industry: user?.industry || undefined,
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
        prefetchTTS(nextStep.aiText, interviewerGender);
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
    const fallback = computeFallbackScores({
      transcript: evalTranscript, currentStep, scriptLength: interviewScript.length,
      difficulty: interviewDifficulty, elapsed,
    });
    score = fallback.score;
    const fallbackSkillScores = fallback.skillScores;

    let idealAnswers: { question: string; ideal: string; candidateSummary: string; rating?: string; starBreakdown?: Record<string, string>; workedWell?: string; toImprove?: string }[] = [];
    let starAnalysis: { overall: number; breakdown: Record<string, number>; tip: string } | undefined;
    let strengths: string[] | undefined;
    let improvements: string[] | undefined;
    let nextSteps: string[] | undefined;

    if (fallback.hasAnyAnswers) {
      try {
        const originalQuestions = interviewScript
          .filter(s => s.type === "question" || s.type === "follow-up")
          .map(s => s.aiText);

        const previousScores = loadPreviousScores();

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
            if (evalAbort.signal.aborted) {
              reject(new Error("Evaluation timed out after 40 seconds."));
              return;
            }
            const onAbort = () => reject(new Error("Evaluation timed out after 40 seconds."));
            evalAbort.signal.addEventListener("abort", onAbort, { once: true });
          }),
        ]);
        if (evaluation) {
          const processed = processLLMEvaluation(evaluation as unknown as Record<string, unknown>, fallback.score);
          score = processed.score;
          aiFeedback = processed.feedback;
          skillScores = processed.skillScores;
          idealAnswers = processed.idealAnswers;
          if (processed.starAnalysis) starAnalysis = processed.starAnalysis;
          if (processed.strengths) strengths = processed.strengths;
          if (processed.improvements) improvements = processed.improvements;
          if (processed.nextSteps) nextSteps = processed.nextSteps;
        } else {
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
      aiFeedback = "No answers were recorded in this session. Try speaking clearly into your microphone, or use the text input option.";
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
    baseQuestionCount,
    currentQuestionNum,
    isCurrentFollowUp,
    timeRemaining,
    timePercent,
    displayRole,
    displayCompany,
    displayFocus,
    interviewerName: activeInterviewerName,
    isPanelInterview,
    panelMembers,
    activePersona: activePersona || "",
    ttsDurationMs,
    speechEnded,
    liveMetrics,
    isSalaryNegotiation: interviewType === "salary-negotiation",
    negotiationStyle: negotiationStyle || undefined,
    negotiationBand: negotiationBandRef.current,

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
    retryQuestions,

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
