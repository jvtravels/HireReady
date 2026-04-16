/* ─── Interview Timers ─── */
/* Extracted from useInterviewEngine: elapsed clock, answer timer with auto-advance,
   tab visibility tracking, and time remaining/percent. */

import { useState, useEffect, useRef } from "react";

const QUESTION_TIME_LIMIT = 120;

export function useInterviewTimers(
  phase: string,
  currentStep: number,
  initialElapsed: number,
  toast: (msg: string, type: string) => void,
) {
  const [elapsed, setElapsed] = useState(initialElapsed);
  const [answerTimer, setAnswerTimer] = useState(0);
  const handleNextRef = useRef<() => void>(() => {});
  const tabVisibleRef = useRef(true);
  const autoAdvancedRef = useRef(false);

  // Track tab visibility (pauses timers when backgrounded / laptop sleeps)
  useEffect(() => {
    const onVisibility = () => { tabVisibleRef.current = !document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Elapsed timer — pauses when tab is hidden
  useEffect(() => {
    if (phase === "done") return;
    const timer = setInterval(() => {
      if (!tabVisibleRef.current) return;
      setElapsed(e => e + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Reset answer timer on step change
  useEffect(() => { setAnswerTimer(0); }, [currentStep]);
  useEffect(() => { autoAdvancedRef.current = false; }, [currentStep]);

  // Answer timer with 120s limit and auto-advance
  useEffect(() => {
    if (phase === "done") return;
    const timer = setInterval(() => setAnswerTimer(t => {
      if (!tabVisibleRef.current) return t;
      const next = t + 1;
      if (next === 100 && phase === "listening" && !autoAdvancedRef.current) {
        toast("20 seconds remaining for this answer.", "info");
      }
      if (next >= 120 && phase === "listening" && !autoAdvancedRef.current) {
        autoAdvancedRef.current = true;
        toast("Time's up — moving to the next question.", "info");
        handleNextRef.current();
        return next;
      }
      return next;
    }), 1000);
    return () => clearInterval(timer);
  }, [phase, toast]);

  const timeRemaining = QUESTION_TIME_LIMIT - answerTimer;
  const timePercent = (answerTimer / QUESTION_TIME_LIMIT) * 100;

  return {
    elapsed,
    /** Override elapsed (used by async draft restore from IDB) */
    setElapsed,
    answerTimer,
    timeRemaining,
    timePercent,
    /** Parent must keep this in sync with the latest handleNextQuestion callback */
    handleNextRef,
    /** Used by parent flow to pause timers when tab is backgrounded */
    tabVisibleRef,
  };
}
