import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { track } from "@vercel/analytics";

import { useAuth } from "./AuthContext";
import { speak, prefetchTTS, cleanupTTS, setTTSLanguage } from "./tts";
import { useToast } from "./Toast";
import { saveToIDB, loadFromIDB, deleteFromIDB } from "./interviewIDB";
import type { InterviewStep } from "./interviewScripts";
import { getMiniScript, getScript } from "./interviewScripts";
import { saveSessionResult, fetchLLMQuestions, fetchLLMEvaluation, fetchFollowUp, retryQueuedEvals, getAdaptiveHints } from "./interviewAPI";
import { createDeepgramSTT, type DeepgramSTTHandle } from "./deepgramSTT";
import { getInterviewerName, formatTime } from "./InterviewComponents";
import { createSpeechRecognition } from "./speechRecognition";
import type { SpeechRecognitionInstance, SpeechRecognitionEvent } from "./speechRecognition";
import { safeUUID } from "./utils";

/* ─── Helpers ─── */

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
  const isMiniMode = searchParams.get("mini") === "true";
  const shouldUseResume = searchParams.get("useResume") !== "false";
  const interviewLanguage = searchParams.get("language") || "en";
  const jobDescription = searchParams.get("jd") || "";

  // Restore draft if resuming
  const draftKey = `hirestepx_interview_draft_${user?.id || "anon"}`;
  const isResuming = searchParams.get("resume") === "true";
  const draftRef = useRef<InterviewDraft | null>(null);
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

  // Interview state
  const [currentStep, setCurrentStep] = useState(draftRef.current?.currentStep || 0);
  const currentStepRef = useRef(0);
  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  // Async IndexedDB fallback
  useEffect(() => {
    if (!isResuming || draftRef.current) return;
    loadFromIDB(draftKey).then(data => {
      if (data && typeof data === "object" && "transcript" in data) {
        const d = data as InterviewDraft;
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

  // Set TTS language for non-English interviews
  useEffect(() => {
    if (interviewLanguage !== "en") setTTSLanguage(interviewLanguage);
    return () => { if (interviewLanguage !== "en") setTTSLanguage("en"); };
  }, [interviewLanguage]);

  // Fetch LLM-generated questions on mount
  useEffect(() => {
    if (isMiniMode) return;
    if (!navigator.onLine) {
      toast("Offline — using practice questions.", "info");
      setLlmLoading(false);
      return;
    }
    let cancelled = false;

    let adaptiveHints: { weakSkills: string[]; pastTopics: string[] } = { weakSkills: [], pastTopics: [] };
    try {
      const cached = localStorage.getItem(`hirestepx_cache_sessions_${user?.id}`);
      if (cached) {
        const pastSessions = JSON.parse(cached);
        adaptiveHints = getAdaptiveHints(pastSessions);
      }
    } catch { /* silent */ }

    const llmPromise = fetchLLMQuestions({
      type: interviewType,
      focus: interviewFocus,
      difficulty: interviewDifficulty,
      role: user?.targetRole || "the role",
      company: targetCompany || user?.targetCompany,
      industry: user?.industry,
      resumeText: shouldUseResume ? user?.resumeText : undefined,
      language: interviewLanguage !== "en" ? interviewLanguage : undefined,
      pastTopics: adaptiveHints.pastTopics.length > 0 ? adaptiveHints.pastTopics : undefined,
      weakSkills: adaptiveHints.weakSkills.length > 0 ? adaptiveHints.weakSkills : undefined,
      jobDescription: jobDescription || undefined,
    });
    const timeoutPromise = new Promise<null>((_, reject) => {
      const tid = setTimeout(() => reject(new Error("Question generation timed out")), 30_000);
      (timeoutPromise as unknown as { _tid: ReturnType<typeof setTimeout> })._tid = tid;
    });
    Promise.race([llmPromise, timeoutPromise]).then(questions => {
      if (cancelled) return;
      if (questions && questions.length > 0 && currentStepRef.current === 0) {
        setInterviewScript(questions);
      } else if (!questions) {
        setSaveWarning(`Custom ${interviewType} questions unavailable. Using practice questions instead.`);
        toast(`Using practice questions — custom ${interviewType} generation unavailable.`, "info");
      }
      setLlmLoading(false);
    }).catch(err => {
      if (cancelled) return;
      const msg = err.message || "Could not generate questions.";
      setSaveWarning(`${msg} Using practice questions.`);
      toast(`Using practice questions — ${msg.toLowerCase()}`, "info");
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalElapsed, setEvalElapsed] = useState(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const interviewerName = useMemo(() => getInterviewerName(`${interviewType}-${interviewFocus}-${targetCompany}-${user?.id || ""}`), [interviewType, interviewFocus, targetCompany, user?.id]);
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

  // Start/stop speech recognition based on phase
  useEffect(() => {
    if (phase === "listening" && !isMuted) {
      recognitionRestartCountRef.current = 0;
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
              deepgramRef.current = null;
              startWebSpeechAPI();
            }
          },
          onEnd: () => {
            if (stopped || interviewEndedRef.current) return;
            console.warn("[Deepgram] connection ended, falling back to Web Speech API");
            deepgramRef.current = null;
            startWebSpeechAPI();
          },
        }, { language: interviewLanguage });
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
      return;
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

  // User answer timer
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
  const pendingFollowUpRef = useRef<Promise<{ needsFollowUp: boolean; followUpText: string } | null> | null>(null);

  useEffect(() => {
    if (phase === "done") return;

    const step = interviewScript[currentStep];
    if (!step) return;

    const gen = ++flowGenerationRef.current;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const isStale = () => cancelled || gen !== flowGenerationRef.current;

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
        text: step.aiText,
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
        speak(step.aiText, onSpeechEnd, onSpeechEnd).then(handle => {
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
    setTranscript(prev => [...prev, {
      speaker: "user",
      text: answerText,
      time: formatTime(elapsed),
    }]);
    setCurrentTranscript("");

    const currentStepObj = interviewScript[currentStep];
    const isLastStep = currentStep >= interviewScript.length - 1;

    // Generate micro-feedback
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

    // Fire follow-up check in background
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

    if (!isLastStep) {
      setCurrentStep(currentStep + 1);
    } else {
      setPhase("done");
    }
  }, [phase, currentStep, answerTimer, elapsed, interviewScript, interviewType, user]);

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

    let sessionId = safeUUID();
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
    const completionRatio = currentStep / Math.max(1, interviewScript.length);
    const baseScore = 65 + Math.round(completionRatio * 20);
    const difficultyBonus = interviewDifficulty === "intense" ? 5 : interviewDifficulty === "warmup" ? -3 : 0;
    const timeBonus = elapsed > 300 ? 5 : elapsed > 120 ? 3 : 0;
    const questionBonus = Math.min(5, Math.floor(transcript.filter(t => t.speaker === "user").length * 1.5));
    const fallbackScore = Math.min(98, Math.max(60, baseScore + difficultyBonus + timeBonus + questionBonus));

    const hasAnyAnswers = transcript.some(t => t.speaker === "user");
    score = fallbackScore;
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
        const evaluation = await fetchLLMEvaluation({
          transcript,
          type: interviewType,
          difficulty: interviewDifficulty,
          role: user?.targetRole || "the role",
          company: user?.targetCompany,
          questions: originalQuestions,
          resumeText: shouldUseResume ? user?.resumeText : undefined,
          language: interviewLanguage !== "en" ? interviewLanguage : undefined,
        });
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
        }
      }
    } else {
      setUsedFallbackScore(true);
    }

    sessionId = safeUUID();
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
        starAnalysis,
        strengths,
        improvements,
        nextSteps,
        resumeUsed: !!user?.resumeText,
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
  }, [navigate, elapsed, interviewType, interviewDifficulty, interviewFocus, totalQuestions, user, updateUser, currentStep, interviewScript.length, transcript]);

  const QUESTION_TIME_LIMIT = 120;
  const timeRemaining = QUESTION_TIME_LIMIT - answerTimer;
  const timePercent = (answerTimer / QUESTION_TIME_LIMIT) * 100;
  const displayRole = user?.targetRole || interviewType.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
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
    interviewerName,

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
