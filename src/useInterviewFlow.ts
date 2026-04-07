/* ─── useInterviewFlow: Interview state machine hook ─── */
/* Extracts the thinking → speaking → listening flow from Interview.tsx
   for cleaner separation of concerns and testability. */

import { useState, useEffect, useRef, useCallback } from "react";
import { speak, prefetchTTS } from "./tts";

export interface InterviewStep {
  type: "intro" | "question" | "follow-up" | "closing";
  aiText: string;
  thinkingDuration: number;
  speakingDuration: number;
  waitForUser: boolean;
  scoreNote?: string;
}

export type Phase = "thinking" | "speaking" | "listening" | "done";

interface FollowUpResult {
  needsFollowUp: boolean;
  followUpText: string;
}

interface UseInterviewFlowOptions {
  script: InterviewStep[];
  setScript: React.Dispatch<React.SetStateAction<InterviewStep[]>>;
  aiVoiceEnabled: boolean;
  onTranscriptAdd: (entry: { speaker: "ai" | "user"; text: string; time: string }) => void;
  formatTime: (s: number) => string;
  elapsed: number;
  fetchFollowUp: (params: {
    question: string; answer: string; type: string; role: string;
  }) => Promise<FollowUpResult | null>;
  interviewType: string;
  userRole: string;
  currentTranscript: string;
  answerTimer: number;
  clearTranscript: () => void;
}

export function useInterviewFlow(opts: UseInterviewFlowOptions) {
  const {
    script, setScript, aiVoiceEnabled, onTranscriptAdd,
    formatTime, elapsed, fetchFollowUp, interviewType, userRole,
    currentTranscript, answerTimer, clearTranscript,
  } = opts;

  const [phase, setPhase] = useState<Phase>("thinking");
  const [currentStep, setCurrentStep] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  const currentStepRef = useRef(0);
  useEffect(() => { currentStepRef.current = currentStep; }, [currentStep]);

  const ttsCancelRef = useRef<(() => void) | null>(null);
  const ttsInstanceIdRef = useRef(0);
  const interviewEndedRef = useRef(false);
  const advancingRef = useRef(false);
  const pendingFollowUpRef = useRef<Promise<FollowUpResult | null> | null>(null);
  const generationRef = useRef(0); // invalidates stale async ops

  const step = script[currentStep] ?? script[script.length - 1];
  const totalQuestions = script.filter(s => s.type === "question" || s.type === "follow-up").length;
  const currentQuestionNum = script.slice(0, currentStep + 1).filter(s => s.type === "question" || s.type === "follow-up").length;

  // ─── Interview flow: thinking → speaking → listening ───
  useEffect(() => {
    if (phase === "done") return;
    const stepObj = script[currentStep];
    if (!stepObj) return;

    const gen = ++generationRef.current;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const isStale = () => cancelled || gen !== generationRef.current;

    setPhase("thinking");

    // Pre-fetch TTS during thinking phase
    if (aiVoiceEnabled && stepObj.aiText) {
      prefetchTTS(stepObj.aiText);
    }

    const startSpeaking = () => {
      if (isStale()) return;
      setPhase("speaking");
      setIsRecording(true);

      onTranscriptAdd({
        speaker: "ai",
        text: stepObj.aiText,
        time: formatTime(elapsed),
      });

      ttsCancelRef.current?.();

      let speechEnded = false;
      const onSpeechEnd = () => {
        if (speechEnded || isStale()) return;
        speechEnded = true;
        if (safetyTimer) clearTimeout(safetyTimer);
        setIsRecording(false);
        if (stepObj.waitForUser) {
          setPhase("listening");
          const nextStep = script[currentStep + 1];
          if (nextStep && aiVoiceEnabled) prefetchTTS(nextStep.aiText);
        } else {
          setTimeout(() => { if (!isStale()) setPhase("done"); }, 1000);
        }
      };

      safetyTimer = setTimeout(() => {
        if (!speechEnded) {
          console.warn("[flow] TTS safety timeout — forcing phase transition");
          onSpeechEnd();
        }
      }, Math.max(stepObj.speakingDuration + 5000, 30000));

      if (aiVoiceEnabled) {
        const instanceId = ++ttsInstanceIdRef.current;
        speak(stepObj.aiText, onSpeechEnd, onSpeechEnd).then(handle => {
          if (ttsInstanceIdRef.current === instanceId) {
            ttsCancelRef.current = handle.cancel;
          } else {
            handle.cancel();
          }
        }).catch(() => onSpeechEnd());
      } else {
        const speakTimer = setTimeout(onSpeechEnd, stepObj.speakingDuration);
        ttsCancelRef.current = () => clearTimeout(speakTimer);
      }
    };

    // Resolve pending follow-up during thinking phase
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
          setScript(prev => [
            ...prev.slice(0, currentStep),
            followUpStep,
            ...prev.slice(currentStep),
          ]);
        } else {
          setTimeout(startSpeaking, stepObj.thinkingDuration);
        }
      }).catch(() => {
        if (!isStale()) setTimeout(startSpeaking, stepObj.thinkingDuration);
      });
    } else {
      const thinkTimer = setTimeout(startSpeaking, stepObj.thinkingDuration);
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

  // ─── Handle user advancing to next question ───
  const handleNextQuestion = useCallback(() => {
    if (phase !== "listening" || advancingRef.current) return;
    advancingRef.current = true;
    setTimeout(() => { advancingRef.current = false; }, 500);

    ttsCancelRef.current?.();

    const answerText = currentTranscript.trim() || `[Answer recorded — ${answerTimer}s]`;
    onTranscriptAdd({
      speaker: "user",
      text: answerText,
      time: formatTime(elapsed),
    });
    clearTranscript();

    const currentStepObj = script[currentStep];
    const isLastStep = currentStep >= script.length - 1;

    if (currentStepObj?.type === "question" && !isLastStep && answerText.length > 10 && !answerText.startsWith("[Answer recorded")) {
      pendingFollowUpRef.current = fetchFollowUp({
        question: currentStepObj.aiText,
        answer: answerText,
        type: interviewType,
        role: userRole,
      });
    } else {
      pendingFollowUpRef.current = null;
    }

    if (!isLastStep) {
      setCurrentStep(currentStep + 1);
    } else {
      setPhase("done");
    }
  }, [phase, currentStep, answerTimer, elapsed, script, interviewType, userRole, currentTranscript, clearTranscript, onTranscriptAdd, formatTime, fetchFollowUp]);

  // ─── Skip speaking (interrupt) ───
  const skipSpeaking = useCallback(() => {
    if (phase !== "speaking") return;
    ttsCancelRef.current?.();
    ttsCancelRef.current = null;
    setIsRecording(false);
    const currentStepObj = script[currentStep];
    if (currentStepObj?.waitForUser) {
      setPhase("listening");
      const nextStep = script[currentStep + 1];
      if (nextStep && aiVoiceEnabled) prefetchTTS(nextStep.aiText);
    } else {
      setTimeout(() => setPhase("done"), 1000);
    }
  }, [phase, currentStep, script, aiVoiceEnabled]);

  // ─── End interview ───
  const endInterview = useCallback(() => {
    interviewEndedRef.current = true;
    setPhase("done");
    ttsCancelRef.current?.();
    ttsCancelRef.current = null;
  }, []);

  // Restore state from draft
  const restoreStep = useCallback((stepNum: number) => {
    setCurrentStep(stepNum);
  }, []);

  return {
    phase, setPhase,
    currentStep, setCurrentStep: restoreStep,
    step, totalQuestions, currentQuestionNum,
    isRecording,
    handleNextQuestion,
    skipSpeaking,
    endInterview,
    interviewEndedRef,
    ttsCancelRef,
    ttsInstanceIdRef,
    pendingFollowUpRef,
    currentStepRef,
  };
}
