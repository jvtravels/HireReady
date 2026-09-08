"use client";
import { useEffect, useRef, useState } from "react";
import { e, ef } from "./interviewTokens";
import {
  StatusToasts, PanelAvatarStage,
  CompletionCard, MicroFeedbackPanel, CampusReadinessChips,
  TranscriptPanel, EndModal, EvaluatingOverlay,
  DealSummaryCard, AnnotatedReplayPanel,
  SaveToast, ReconnectingOverlay,
} from "./InterviewPanels";
import {
  CanvasVoiceVisualizer, CanvasPersonaLabel, CanvasPlainHeading,
  CanvasEditorialHeading,
  CanvasMetaRow, CanvasEndButton, CanvasSelfViewTile,
  type CanvasVizState, type CanvasPersonaState, type CanvasConnectionStatus,
} from "./InterviewCanvasAtoms";
import { LiveCaptions } from "./InterviewComponents";
import { pickAccent } from "./_accent-parser";
import { useInterviewEngine } from "./useInterviewEngine";
import { isAutoplayBlocked, retryUnlockAudio, clearAutoplayBlock } from "./tts";
import { stripProsodyMarkup } from "./_prosody";
import { useAuth } from "./AuthContext";
import { Composer } from "./components/interview/Composer";
import { InterviewHeader } from "./components/interview/InterviewHeader";

/* Derive 1-2 letter initials from a logged-in user's display name, falling
   back to the email's local part. Returns "" when nothing usable exists —
   the avatar then shows a neutral icon instead of guessing. */
function userInitials(name?: string | null, email?: string | null): string {
  const source = (name && name.trim()) || (email && email.split("@")[0]) || "";
  if (!source) return "";
  const parts = source
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
import { useVideoRecorder } from "./useVideoRecorder";
import { InterviewProvider } from "./InterviewContext";
import ErrorBoundary from "./ErrorBoundary";
import { captureClientEvent } from "./posthogClient";

/* ═══════════════════════════════════════════════
   INTERVIEW SCREEN
   Wraps with InterviewProvider so any child component
   can call useInterview() instead of receiving props.
   ═══════════════════════════════════════════════ */
/**
 * Preconnect to the TTS + STT providers the moment the user lands on /interview.
 * Previously these hints lived in app/layout.tsx and fired on every page load,
 * wasting a TCP+TLS handshake per tab for routes that never touch audio.
 * Now they fire exactly once per interview session, right before the APIs are
 * hit — which saves ~50-150ms on the first TTS playback.
 */
function addInterviewPreconnects() {
  if (typeof document === "undefined") return;
  const hosts = [
    "https://api.cartesia.ai",   // Cartesia TTS — direct WSS from browser
    "https://api.deepgram.com",  // Deepgram STT — direct WSS from browser
    // Sarvam STT opens wss://api.sarvam.ai/speech-to-text/ws directly from
    // the browser (sarvamSTT.ts). Sarvam/Azure TTS go through the same-origin
    // /api/* proxy, so only the STT host is a direct cross-origin connection.
    "https://api.sarvam.ai",
  ];
  // Supabase (auth refresh + storage + realtime) is hit directly from the
  // browser on the project origin; preconnect it too. Env-derived, so guard
  // against the value being absent (e.g. preview without the var set).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      hosts.push(new URL(supabaseUrl).origin);
    } catch { /* malformed/empty env — skip the hint */ }
  }
  for (const href of hosts) {
    if (document.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = href;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }
}

/**
 * Top-level wrapper: any unhandled throw from the interview engine, TTS, STT,
 * evaluator, or a render-time null-deref propagates into this boundary instead
 * of unmounting the page with a blank screen. The boundary's fallback UI gives
 * the user a "Start over / Go to dashboard" path, and logs the error to
 * /api/log-error so we see these in production.
 */
export default function Interview() {
  return (
    <ErrorBoundary>
      <InterviewInner />
    </ErrorBoundary>
  );
}

/**
 * Mobile resilience: resume any suspended AudioContexts when the tab comes
 * back to foreground or the device rotates. iOS Safari routinely suspends
 * AudioContext on backgrounding / orientation change, which silently breaks
 * TTS playback mid-interview without any visible error. Walking the global
 * set is ugly but there's no clean way to enumerate them; we tag the ones
 * we create and resume those.
 */
function useMobileAudioResilience() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const resumeSuspended = () => {
      // tts.ts stashes its AudioContext on window.__hirestepxAudioCtx when
      // available. If that pattern isn't in place yet, this is a no-op —
      // cheap and safe. The real fix is in tts.ts itself but this covers
      // the rotation-kills-voice case without refactoring the audio path.
      const globalCtx = window.__hirestepxAudioCtx;
      if (globalCtx && globalCtx.state === "suspended") {
        globalCtx.resume().catch(() => { /* expected: resume may fail if user gesture required */ });
      }
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      resumeSuspended();
      // The browser may have rejected an in-flight audio.play() while the
      // tab was hidden, latching _autoplayBlocked. Clear it so the next TTS
      // attempt tries fresh — if it still fails, the flag re-arms and the
      // recovery overlay shows. This avoids the "stuck overlay" case where
      // playback would now succeed but we never even try.
      clearAutoplayBlock();
    };
    const onOrientation = () => { setTimeout(resumeSuspended, 200); };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("orientationchange", onOrientation);
    // Modern API replacement for orientationchange; not all browsers support it
    const screenOrientation = (screen as Screen & { orientation?: { addEventListener: typeof addEventListener; removeEventListener: typeof removeEventListener } }).orientation;
    screenOrientation?.addEventListener?.("change", onOrientation);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("orientationchange", onOrientation);
      screenOrientation?.removeEventListener?.("change", onOrientation);
    };
  }, []);
}

/* Map engine phase → canvas visualizer state.
   Listening only flips to user-speaking once the user actually starts
   talking (currentTranscript has content). Empty listening = idle =
   gray dots, matching the canvas "your-turn" baseline. */
function vizState(phase: string, hasTranscript: boolean): CanvasVizState {
  if (phase === "speaking") return "ai-speaking";
  if (phase === "thinking") return "ai-thinking";
  if (phase === "listening") return hasTranscript ? "user-speaking" : "idle";
  return "idle";
}

/* Map engine phase → canvas persona-label state. Same gating as
   vizState — "your-turn" before the user speaks, "you-speaking" after. */
function personaState(phase: string, hasTranscript: boolean): CanvasPersonaState {
  if (phase === "speaking") return "speaking";
  if (phase === "thinking") return "thinking";
  if (phase === "listening") return hasTranscript ? "you-speaking" : "your-turn";
  return "your-turn";
}

/* Map engine offline → canvas connection-status pill */
function mapConnectionStatus(isOffline: boolean): CanvasConnectionStatus {
  return isOffline ? "offline" : "good";
}

/* Accent extraction lives in ./_accent-parser.ts (see import at top).
   pickAccent is the heuristic fallback used at render time when the
   LLM-marked step.accentSplit isn't present. */

/* Count actual back-and-forth exchanges (AI question + user answer pairs)
   from the engine's transcript array — not the question number. */
function countExchanges(transcript: Array<{ speaker: string }>): number {
  if (!transcript || transcript.length === 0) return 0;
  // An "exchange" = one user reply. Count user messages.
  return transcript.filter(m => m.speaker === "user").length;
}

/* Canvas-style typewriter wrapper that types the AI's question in sync
   with TTS audio duration. Inherits the parent <h1>'s serif typography
   via variant="inherit". The flicker that previously affected this was
   fixed at the engine level — handleNextQuestion now sets phase=thinking
   in the SAME batched update as setCurrentStep, so the new step never
   renders against the old phase. The intermediate "thinking" state masks
   the LiveCaptions empty-mount frame. */
function LiveCaptionsAsHeading({ text, ttsDurationMs, speakingDuration, speechEnded }: {
  text: string;
  ttsDurationMs?: number;
  speakingDuration?: number;
  speechEnded?: boolean;
}) {
  return (
    <span style={{ display: "inline" }}>
      <LiveCaptions
        text={text}
        isTyping
        variant="inherit"
        speakingDuration={speakingDuration}
        actualDuration={ttsDurationMs}
        speechEnded={speechEnded}
      />
    </span>
  );
}


function InterviewInner() {
  useEffect(() => { addInterviewPreconnects(); }, []);
  useMobileAudioResilience();
  const [llmSlow, setLlmSlow] = useState(false);
  const { user } = useAuth();
  const myInitials = userInitials(user?.name, user?.email) || "You";
  const engine = useInterviewEngine();
  const video = useVideoRecorder();
  const {
    phase, step, currentStep, llmLoading, elapsed,
    speechUnavailable, isMuted, showTranscript, transcript,
    showEndModal, tabConflict, isOffline, micError, ttsError, ttsFailed,
    usedFallbackScore, evalTimedOut, lastSessionId,
    evaluating, evalElapsed, aiVoiceEnabled,
    currentTranscript, microFeedback,
    totalQuestions, currentQuestionNum, baseQuestionCount, isCurrentFollowUp,
    timeRemaining, timePercent,
    displayRole, displayCompany, displayFocus, interviewerName, interviewType: focusType,
    isPanelInterview, panelMembers, activePersona,
    ttsDurationMs, speechEnded,
    saveWarning, liveMetrics,
    isSalaryNegotiation, negotiationBand, negotiationStyle, negotiationCandidateAskLpa, negotiationJoiningBonusLpa, negotiationKernelOutcome,
    liveNegotiationState,

    setCurrentTranscript, setSpeechUnavailable, setIsMuted,
    setShowTranscript, setShowEndModal,
    setEvalTimedOut, setUsedFallbackScore, setEvaluating,

    handleNextQuestion, handleSkipQuestion, skipSpeaking, retakeLastAnswer, handleEnd, navigate, replayQuestion,
    restartListening, awaitingSpeechStart, isLastStep, isClosingStep,
    skipsUsed, skipBudget, canSkip,
    micQuiet, reconnecting, reconnectAttempt,

    transcriptRef, endModalTriggerRef, textareaRef, nextBtnRef,
    ttsCancelRef, interviewEndedRef,
  } = engine;

  // Tap-to-begin overlay — bulletproof recovery for the "autoplay blocked,
  // voice disabled for session" cascade. The mount-time unlock + click
  // recovery handle 95% of cases; this surface catches the remaining ones
  // Detect autoplay block state. isAutoplayBlocked() flips true only after a
  // failed TTS attempt (set by the TTS layer). We check on phase transitions
  // rather than polling every 600ms — eliminates constant battery drain on mobile.
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  useEffect(() => {
    if (phase === "done") return;
    if (isAutoplayBlocked() && !autoplayBlocked) setAutoplayBlocked(true);
  }, [phase, autoplayBlocked]);

  // Track interview abandonment — fires when user leaves before handleEnd runs
  useEffect(() => {
    const onUnload = () => {
      if (!interviewEndedRef.current && phase !== "done" && currentStep > 0) {
        captureClientEvent("interview_abandoned", {
          focus: focusType || null,
          questions_answered: currentStep,
          total_questions: totalQuestions,
          elapsed_seconds: elapsed,
          phase,
        });
      }
    };
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      onUnload();
    };
  }, [phase, currentStep, totalQuestions, elapsed, interviewEndedRef, focusType]);

  // Stop video recording when interview ends
  const { isRecording: videoIsRecording, stopRecording: videoStopRecording } = video;
  useEffect(() => {
    if (engine.phase === "done" && videoIsRecording) {
      videoStopRecording();
    }
  }, [engine.phase, videoIsRecording, videoStopRecording]);

  /* ── Auto-save toast ─────────────────────────────────────────────
     Fires a 2.5s "Answer saved" pulse each time a new answer is
     captured (detected via currentStep advancement after listening).
     Pure visual feedback — the engine already persists via IDB.

     Capped at SAVE_TOAST_MAX_SHOWS to avoid notification fatigue:
     after the user has seen the same toast 3 times they understand
     the pattern; further toasts are noise. */
  const SAVE_TOAST_MAX_SHOWS = 3;
  const [showSaveToast, setShowSaveToast] = useState(false);
  const lastSavedStepRef = useRef<number>(-1);
  const saveToastShownCountRef = useRef<number>(0);
  const prevPhaseRef = useRef<string>(phase);
  useEffect(() => {
    // Trigger when phase moves out of "listening" with a new step count
    const justSaved = prevPhaseRef.current === "listening" && phase !== "listening" && currentStep !== lastSavedStepRef.current && currentStep > 0;
    prevPhaseRef.current = phase;
    if (!justSaved) return;
    lastSavedStepRef.current = currentStep;
    if (saveToastShownCountRef.current >= SAVE_TOAST_MAX_SHOWS) return;
    saveToastShownCountRef.current += 1;
    setShowSaveToast(true);
    const timeout = setTimeout(() => setShowSaveToast(false), 2500);
    return () => clearTimeout(timeout);
  }, [phase, currentStep]);

  useEffect(() => {
    if (!llmLoading || currentStep > 1) { setLlmSlow(false); return; }
    const t = setTimeout(() => setLlmSlow(true), 5000);
    return () => clearTimeout(t);
  }, [llmLoading, currentStep]);

  return (
    <InterviewProvider value={engine}>
    <div style={{
      width: "100%", height: "100dvh", minHeight: "100vh", background: e.cream,
      display: "flex", flexDirection: "column", overflow: "hidden",
      fontFamily: ef.sans, color: e.coal,
    }}>
      <style>{`
        /* Canonical motion keyframes (spin / blink / fadeUp /
           recordPulse / slideUp / slideInRight / slideUpSheet) live
           in src/index.css. Don't re-declare them here. */
        /* Compact desktop / 13-14" laptops (≤1280px). The default
           stage padding (40px 64px) and gap (28) are tuned for ≥1440px;
           on 1280-wide screens — and especially when the viewport is
           also vertically constrained — that whitespace pushes the
           controls below the fold. Tightens paddings, gap, and
           typographic rhythm without touching the mobile rules below. */
        @media (max-width: 1280px) {
          .iv-canvas-topbar { padding: 12px 24px !important; }
          /* Tight vertical rhythm for 13-14" laptops — every element
             gets a notch smaller so question + visualizer + controls
             fit above the fold without scroll, AND the visualizer
             doesn't shift downward when the question grows from one
             to four lines. Stage padding shrinks; question heading
             max-width lifts to ~880 (was 620 inside the H1) so 4-5
             line wraps become 2-3 line wraps; visualizer disc shrinks
             from 220→160. Persona caption gets a tighter margin so
             the action zone is closer to the visualizer. */
          .iv-canvas-stage  { padding: 16px 40px !important; gap: 14px !important; max-width: 1180px !important; }
          .iv-question-wrap { max-width: 1080px !important; }
          .iv-question-h1   { max-width: 880px !important; font-size: clamp(1.25rem, 1.9vw, 1.625rem) !important; line-height: 1.22 !important; }
          /* Disc ≥ visualizer (150px from CanvasVoiceVisualizer prop) so
             the dot-grid doesn't clip; we can't change the prop from
             CSS. Halo + rings are sized off the disc width. */
          .iv-viz-disc      { width: 170px !important; height: 170px !important; }
          .iv-info-bar      { padding: 8px 18px !important; }
          .iv-info-bar-row  { padding: 8px 18px !important; }
        }
        /* Short viewports (≤900px tall, e.g. 1280×800 / 1366×768
           laptops, or 1280×1080 with browser chrome eating ~80px).
           Pull padding + visualizer down further so the action zone
           sits comfortably above the fold and the user doesn't have
           to scroll while the AI speaks. */
        @media (max-height: 900px) {
          .iv-canvas-stage { padding-top: 12px !important; padding-bottom: 12px !important; gap: 12px !important; }
          .iv-viz-disc     { width: 160px !important; height: 160px !important; }
          .iv-question-h1  { font-size: clamp(1.15rem, 1.75vw, 1.5rem) !important; }
        }
        @media (max-width: 600px) {
          .iv-info-bar { flex-wrap: wrap; gap: 8px !important; padding: 10px 16px !important; }
          .iv-info-bar-row { padding: 10px 16px !important; gap: 8px !important; flex-wrap: wrap !important; }
          .iv-canvas-topbar { padding: 12px 16px !important; gap: 10px !important; padding-top: max(12px, env(safe-area-inset-top, 12px)) !important; }
          .iv-canvas-topbar-left { gap: 10px !important; min-width: 0 !important; flex: 1 1 auto !important; overflow: hidden !important; }
          .iv-canvas-topbar-right { gap: 6px !important; flex-shrink: 0 !important; }
          .iv-canvas-mobile-hide { display: none !important; }
          /* Chip on mobile shows company + focus only (role hidden via iv-canvas-mobile-hide).
             Reduce letter-spacing so "FLIPKART · SALARY NEGOTIATION" fits single-line. */
          .iv-canvas-contextchip { letter-spacing: 0.7px !important; font-size: 9.5px !important; max-width: 100%; }
          /* Shrink Mic/Camera labels on mobile so the right side doesn't crowd the chip */
          .iv-canvas-topbar-right span { font-size: 11px !important; }
          .iv-canvas-stage { padding: 16px 14px !important; gap: 14px !important; }
          .iv-center { padding: 16px !important; }
          .iv-controls { padding: 8px 12px !important; gap: 6px !important; }
          .iv-controls button { min-width: 48px !important; min-height: 48px !important; }
          .iv-controls .iv-hide-mobile { display: none !important; }
          .iv-transcript-panel { width: 100% !important; max-width: none !important; position: fixed !important; bottom: 0 !important; top: auto !important; right: 0 !important; left: 0 !important; height: min(60vh, calc(100dvh - 96px)) !important; max-height: calc(100dvh - 96px) !important; border-radius: 20px 20px 0 0 !important; animation: slideUpSheet 0.35s cubic-bezier(0.16, 1, 0.3, 1) both !important; }
          /* Video preview default is 160×120 — 43% of a 375px viewport.
             Shrinks to ~90px to stay out of the way of the main stage.
             top respects notch/safe-area-inset on iOS. */
          .iv-video-preview { width: 90px !important; height: 68px !important; top: calc(64px + env(safe-area-inset-top, 0px)) !important; right: 8px !important; }
        }
        @media (max-width: 420px) {
          .iv-canvas-topbar { padding: 10px 12px !important; }
          .iv-canvas-stage { padding: 12px 10px !important; }
          .iv-info-bar-row { padding: 8px 12px !important; }
        }
        @media (hover: none) and (pointer: coarse) {
          .iv-controls button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        }
      `}</style>

      <StatusToasts tabConflict={tabConflict} isOffline={isOffline} micError={micError} ttsError={ttsError} ttsFailed={ttsFailed} />

      {/* ═════════════════════════════════════════════════════════════
          TOPBAR — canvas composition
          Wordmark · ContextChip   ProgressDots   StatusPill ·
                                                  Mute · Camera · Avatar
          ═════════════════════════════════════════════════════════════ */}
      <InterviewHeader
        displayRole={displayRole}
        displayCompany={displayCompany}
        displayFocus={displayFocus}
        isSalaryNegotiation={isSalaryNegotiation}
        isPanelInterview={isPanelInterview}
        connectionStatus={mapConnectionStatus(isOffline)}
        isMuted={isMuted}
        onToggleMute={() => setIsMuted(m => !m)}
        videoEnabled={video.videoEnabled}
        onToggleVideo={video.toggleVideo}
        myInitials={myInitials}
      />

      {/* ═════════════════════════════════════════════════════════════
          STAGE — canvas composition
          ═════════════════════════════════════════════════════════════ */}
      <main className="iv-canvas-stage" style={{
        flex: 1,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "flex-start",
        gap: 28, padding: "40px 64px",
        position: "relative", overflow: "auto",
        // Constrain reading width — on widescreens the question + controls
        // sprawl across the whole viewport, but the previous 760 ceiling
        // was actively cramping the question heading (920) and the
        // listening action zone, forcing wraps that the editorial
        // type-scale wasn't meant to take. Bumped to 1100 so the
        // question, transcript card, and metrics row all breathe.
        // Mobile / narrow viewports still flow naturally via media rules.
        maxWidth: 1240, margin: "0 auto", width: "100%",
      }}>
        {/* Panel avatar stage — three avatars in a row above the question.
            In panel mode this REPLACES the single visualizer + persona
            label below; rendering it inline (vs absolute-positioned)
            prevents the avatar row from overlapping the question text
            on the constrained-width stage. */}
        {isPanelInterview && panelMembers && phase !== "done" && (
          <PanelAvatarStage
            phase={phase}
            panelMembers={panelMembers}
            activePersona={activePersona}
            isMuted={isMuted}
            speechUnavailable={speechUnavailable}
            skipSpeaking={skipSpeaking}
          />
        )}
        {/* Question heading — heuristic-driven italic-copper accent.
            During phase=speaking we render plain serif because the
            LiveCaptions typewriter would fight with the inline accent
            mid-stream. Once speech ends and we're listening, the accent
            renders. */}
        {/* PDF#50 follow-up c (2026-05-28) — the "QUESTION FAILED TO LOAD"
            overlay that used to live here was the symptom user-reported as
            "the product is broken." It turned a silent placeholder race
            into a hard-stop wall. The empty-aiText path is now silently
            recovered upstream in useInterviewEngine.revealTranscript
            (writes safe recruiter prose into the step), so by the time
            phase === "listening" the bubble already has content. No
            overlay needed; no overlay shown. */}
        {step?.aiText && phase !== "done" && (() => {
          // aiTextDisplay is the fully sanitized version (no [pause:long],
          // no *foo*, no _word_). Falls back to aiText for legacy/scripted
          // steps where the two are equal. Never render step.aiText raw —
          // that path is reserved for TTS, which needs the markup intact.
          //
          // Belt-and-suspenders: strip prosody markup unconditionally at
          // the render layer. The user-reported "[pause] is still there"
          // bug came from script-generated questions where the engine
          // didn't set aiTextDisplay (only follow-ups had it set), so the
          // fallback to step.aiText leaked [pause] tokens into the heading.
          const displayText = stripProsodyMarkup(step.aiTextDisplay ?? step.aiText);
          return (
          <div className="iv-question-wrap" style={{ maxWidth: 1040, width: "100%" }}>
            {/* Speaking: typewriter typed in sync with TTS audio.
                Listening: static accent-split or plain heading.
                The flicker that used to appear at phase transitions
                (question briefly visible → vanishes → re-types) was
                fixed at the engine level — handleNextQuestion now
                batches setPhase("thinking") with setCurrentStep so the
                new step never renders briefly against the old phase. */}
            {phase === "speaking" ? (
              <CanvasPlainHeading>
                <LiveCaptionsAsHeading
                  text={displayText}
                  ttsDurationMs={ttsDurationMs}
                  speakingDuration={step.speakingDuration}
                  speechEnded={speechEnded}
                />
              </CanvasPlainHeading>
            ) : phase === "thinking" ? (
              // Bug: full question text was flashing on screen for a
              // few seconds during the "thinking" phase before the
              // typewriter started during "speaking" — the user saw
              // the answer instantly, then it vanished, then it
              // re-typed. Root cause: the editorial-heading branch
              // below rendered the full displayText for any non-
              // speaking phase, including thinking. Fix: render
              // nothing during thinking — the typewriter takes over
              // cleanly when phase flips to speaking.
              <CanvasPlainHeading>
                <span style={{ visibility: "hidden" }}>{displayText}</span>
              </CanvasPlainHeading>
            ) : (() => {
              // Prefer the LLM-marked accentSplit when available — it's
              // hand-picked at question-generation time. Falls back to
              // the local heuristic when LLM didn't comply or for
              // cached/legacy questions without the field.
              //
              // Salary-negotiation exception: pickAccent's ACCENT_PRIORITY
              // set is tuned for behavioral question stems (situation,
              // align, what, why) — those words ARE the load-bearing
              // emphasis in "tell me about a *situation*" / "*why* did
              // you choose…". In salary-neg prose those same words show
              // up incidentally ("how does that *align*", "*what* would
              // it take", "your notice period *situation*") and the
              // italic-copper highlighting makes the AI look erratic.
              // Real session: italics on align/what/situation across 3
              // turns — interpreted by the user as "markdown leak".
              // Suppress the heuristic accent for negotiation; LLM-
              // marked accentSplit (rare in negotiation anyway) still
              // honored if present.
              const rawAccent = step.accentSplit ?? (isSalaryNegotiation ? null : pickAccent(displayText));
              // accentSplit may carry prosody markup if it was assembled
              // before stripping (LLM-marked accents on raw aiText). Strip
              // each segment defensively so [pause] never escapes.
              const accent = rawAccent
                ? {
                    before: stripProsodyMarkup(rawAccent.before),
                    accent: stripProsodyMarkup(rawAccent.accent),
                    after: stripProsodyMarkup(rawAccent.after),
                  }
                : null;
              return accent ? (
                <CanvasEditorialHeading
                  before={accent.before}
                  accent={accent.accent}
                  after={accent.after}
                />
              ) : (
                <CanvasPlainHeading>{displayText}</CanvasPlainHeading>
              );
            })()}
            {/* scoreNote is internal evaluator metadata — kept on the step
                for downstream eval/report but never rendered in the live
                interview. (Was leaking lines like "Salary negotiation
                response — evaluate negotiation strategy" and "Closing —
                synthesized fallback (LLM omitted…)" to candidates.) */}
          </div>
          );
        })()}

        {/* Visualizer in its soft disc + halo + voice rings while listening.
            Hidden in panel mode — the PanelAvatarStage above already shows
            the active persona's dot-grid visualizer in the active avatar. */}
        {phase !== "done" && !isPanelInterview && (
          <div className="iv-viz-disc" style={{
            position: "relative",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 220, height: 220, borderRadius: 999,
            background: "radial-gradient(closest-side, rgba(255,255,255,0.7), rgba(244,239,227,0.4) 70%, transparent 100%)",
          }}>
            <span className={`hsx-viz-halo hsx-viz-halo--${vizState(phase, currentTranscript.trim().length > 0)}`} />
            {phase === "listening" && (
              <>
                <span className="hsx-iv-ring" />
                <span className="hsx-iv-ring hsx-iv-ring--delay" />
              </>
            )}
            <CanvasVoiceVisualizer state={vizState(phase, currentTranscript.trim().length > 0)} size={150} />
          </div>
        )}

        {/* Persona name + state. In panel mode this is redundant — the
            PanelAvatarStage above already shows each panelist's name +
            title + speaking-state badge. Hide here to avoid the visual
            duplicate (the bug screenshot showed "Hiring Manager — speaking"
            stacked under the panel row). */}
        {phase !== "done" && !isPanelInterview && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minHeight: 52 }}>
            <CanvasPersonaLabel
              name={interviewerName}
              state={personaState(phase, currentTranscript.trim().length > 0)}
            />
          </div>
        )}

        {/* NegotiationLiveDashboard removed per user feedback — the
            phase / leverage / topics-discussed strip turned the
            interview into a coaching surface and broke immersion. The
            same signals are surfaced post-session in the report. */}

        {/* Action zone — listening: canvas composition.
            Renders the live STT transcript card, type-mode textarea
            fallback, KeycapButton CTA (Press Space when done), and
            "or type" / Skip links. Engine wiring preserved via
            currentTranscript / setCurrentTranscript / textareaRef /
            handleNextQuestion / setSpeechUnavailable. */}
        {phase === "listening" && (
          <Composer
            currentTranscript={currentTranscript}
            setCurrentTranscript={setCurrentTranscript}
            speechUnavailable={speechUnavailable}
            setSpeechUnavailable={setSpeechUnavailable}
            handleNextQuestion={handleNextQuestion}
            handleSkipQuestion={handleSkipQuestion}
            restartListening={restartListening}
            textareaRef={textareaRef}
            nextBtnRef={nextBtnRef}
            isMuted={isMuted}
            micQuiet={micQuiet}
            isCurrentFollowUp={isCurrentFollowUp}
            replayQuestion={replayQuestion}
            aiVoiceEnabled={aiVoiceEnabled}
            hasQuestion={!!step?.aiText}
            liveMetrics={liveMetrics}
            interviewType={typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("type") : null}
            currentQuestionText={step ? stripProsodyMarkup(step.aiTextDisplay ?? step.aiText) || "" : ""}
            timeRemaining={timeRemaining}
            timePercent={timePercent}
            skipsUsed={skipsUsed}
            skipBudget={skipBudget}
            canSkip={canSkip}
            awaitingSpeechStart={awaitingSpeechStart}
            isLastStep={isLastStep}
            isClosingStep={isClosingStep}
            onViewResult={handleEnd}
            candidateCurrentCtcKnown={
              isSalaryNegotiation
                ? liveNegotiationState?.facts.candidateCurrentCTC != null
                : undefined
            }
          />
        )}

        {phase === "speaking" && (
          <button
            type="button"
            onClick={skipSpeaking}
            style={{
              fontFamily: ef.sans, fontSize: 12, fontWeight: 500, color: e.inkSoft,
              background: e.white, border: `1px solid ${e.line}`,
              borderRadius: 999, padding: "8px 16px", minHeight: 36,
              cursor: "pointer", transition: "all 160ms ease",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
            onMouseEnter={(ev) => { ev.currentTarget.style.background = e.creamSoft; }}
            onMouseLeave={(ev) => { ev.currentTarget.style.background = e.white; }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" y1="5" x2="19" y2="19" />
            </svg>
            Continue — Enter
          </button>
        )}

        {(phase === "thinking" || phase === "speaking") && (
          <MicroFeedbackPanel transcript={transcript} microFeedback={microFeedback} />
        )}

        {/* Fresher-specific readiness chips: live mirror of the v2 campus
            analyzer. Renders any time we have transcript material in
            campus-placement sessions — not gated on phase, so it stays
            visible while the candidate is mid-answer too. */}
        {(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("type") === "campus-placement") && transcript.length > 0 && (
          <CampusReadinessChips transcript={transcript} />
        )}

        {/* Retake the just-sent answer — only useful during the brief
            "thinking" window before the AI's follow-up locks in.
            Real interviews allow "actually let me redo that"; this is
            our equivalent. Wired to engine.retakeLastAnswer which
            cancels the pending follow-up, drops the last user message,
            and reverts phase=listening. */}
        {phase === "thinking" && transcript.some(t => t.speaker === "user") && (
          <button
            type="button"
            onClick={() => {
              captureClientEvent("interview_retake_answer", {});
              retakeLastAnswer();
            }}
            aria-label="Retake the answer you just sent"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontFamily: ef.sans, fontSize: 12, fontWeight: 500, color: e.copper,
              background: "transparent", border: `1px solid rgba(180,83,9,0.35)`,
              borderRadius: 999, padding: "7px 14px", cursor: "pointer",
              transition: "background 160ms ease",
            }}
            onMouseEnter={(ev) => { ev.currentTarget.style.background = "rgba(180,83,9,0.08)"; }}
            onMouseLeave={(ev) => { ev.currentTarget.style.background = "transparent"; }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            Actually, let me redo that
          </button>
        )}

        {phase === "done" && (
          <div className="iv-stage-wrap" style={{ width: "100%", maxWidth: 880, display: "flex", flexDirection: "column", gap: 18 }}>
            {isSalaryNegotiation && (
              <DealSummaryCard
                transcript={transcript}
                negotiationBand={negotiationBand}
                negotiationStyle={negotiationStyle}
                candidateAskLpa={negotiationCandidateAskLpa}
                joiningBonusLpa={negotiationJoiningBonusLpa}
                kernelOutcome={negotiationKernelOutcome}
                onReplay={(style) => {
                  const params = new URLSearchParams(window.location.search);
                  params.set("negotiationStyle", style);
                  navigate.push(`/interview?${params.toString()}`);
                  window.location.reload();
                }}
              />
            )}
            {isSalaryNegotiation && transcript.length > 2 && (
              <AnnotatedReplayPanel transcript={transcript} negotiationBand={negotiationBand} />
            )}
            {/* CompletionCard suppressed by default per user feedback —
                it surfaced an intermediate "View Feedback" button screen
                between interview-end and the EvaluatingOverlay that
                confused users (the engine was already moving on but they
                saw an actionable button). Shown only when the eval has
                hard-failed (usedFallbackScore || evalTimedOut), where
                the user genuinely needs to click through to view the
                fallback-scored report. */}
            {(usedFallbackScore || evalTimedOut) && (
              <CompletionCard
                currentQuestionNum={currentQuestionNum} elapsed={elapsed}
                usedFallbackScore={usedFallbackScore} evalTimedOut={evalTimedOut}
                evaluating={evaluating} handleEnd={handleEnd}
                videoURL={video.videoURL}
                isSalaryNegotiation={isSalaryNegotiation}
              />
            )}
          </div>
        )}

        {/* (PanelAvatarStage moved inline above the question — was here
            absolute-positioned, which overlapped the question heading
            on the narrowed-width canvas stage. The inline render at the
            top of <main> replaces this block.) */}

        {llmLoading && currentStep <= 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, border: `1.5px solid ${e.line}`, borderTopColor: e.copper, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontFamily: ef.sans, fontSize: 11, color: e.inkSoft }}>
              {llmSlow ? "Taking a bit longer — almost there…" : "Personalizing questions…"}
            </span>
          </div>
        )}
      </main>

      {/* ═════════════════════════════════════════════════════════════
          FOOTER — canvas composition
          MetaRow            trustLine            EndButton
          ═════════════════════════════════════════════════════════════ */}
      <footer className="iv-canvas-footer" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 32px max(14px, env(safe-area-inset-bottom, 14px))",
        gap: 16, borderTop: `1px solid ${e.line}`, background: e.cream,
        flexShrink: 0, zIndex: 10,
      }}>
        <CanvasMetaRow
          elapsedSec={elapsed}
          exchanges={countExchanges(transcript)}
        />
        <span className="iv-canvas-mobile-hide" style={{
          fontFamily: ef.sans, fontSize: 11, color: e.inkFaint, letterSpacing: 0.1,
        }}>
          Audio is never recorded · transcript only
        </span>
        {phase !== "done" && (
          <span ref={endModalTriggerRef as React.Ref<HTMLSpanElement>} style={{ display: "inline-flex" }}>
            <CanvasEndButton onClick={() => { ttsCancelRef.current?.(); ttsCancelRef.current = null; setShowEndModal(true); }} />
          </span>
        )}
      </footer>

      {/* Self-view tile (camera-on overlay, bottom-right) */}
      {video.videoEnabled && phase !== "done" && (
        <CanvasSelfViewTile videoRef={video.videoPreviewRef} initials={myInitials} stream={video.mediaStream} />
      )}

      {showTranscript && (
        <TranscriptPanel
          transcript={transcript} interviewerName={interviewerName}
          setShowTranscript={setShowTranscript} transcriptRef={transcriptRef}
          panelMembers={panelMembers ?? undefined}
        />
      )}

      {showEndModal && (
        <EndModal
          currentQuestionNum={currentQuestionNum} totalQuestions={totalQuestions}
          baseQuestionCount={baseQuestionCount}
          isOffline={isOffline} handleEnd={handleEnd}
          setShowEndModal={setShowEndModal} endModalTriggerRef={endModalTriggerRef}
        />
      )}

      {showSaveToast && phase !== "done" && !evaluating && !reconnecting && <SaveToast />}

      {reconnecting && (
        <ReconnectingOverlay
          attempt={reconnectAttempt}
          currentQuestion={currentQuestionNum}
          totalQuestions={totalQuestions}
          baseQuestionCount={baseQuestionCount}
        />
      )}

      {evaluating && (
        <EvaluatingOverlay
          usedFallbackScore={usedFallbackScore} evalTimedOut={evalTimedOut}
          evalElapsed={evalElapsed} saveWarning={saveWarning}
          setEvalTimedOut={setEvalTimedOut} setUsedFallbackScore={setUsedFallbackScore}
          setEvaluating={setEvaluating} interviewEndedRef={interviewEndedRef}
          handleEnd={handleEnd} lastSessionId={lastSessionId} navigate={navigate}
        />
      )}

      {/* Tap-to-begin recovery — appears only when the browser blocked
          AudioContext autoplay (logs as "[TTS-Azure] autoplay blocked …
          disabling voice for session"). Single tap re-arms audio AND
          replays the current question, so the candidate can hear the
          question they just missed instead of starting mid-flight. */}
      {autoplayBlocked && phase !== "done" && !evaluating && (
        <button
          type="button"
          onClick={() => {
            retryUnlockAudio();
            setAutoplayBlocked(false);
            // Re-speak whatever question was on screen but went silent.
            // replayQuestion is gated on aiVoiceEnabled inside the engine,
            // so this is a no-op for users who explicitly muted voice.
            if (aiVoiceEnabled) replayQuestion();
          }}
          aria-label="Tap anywhere to enable voice and replay the current question"
          style={{
            position: "fixed", inset: 0, zIndex: 250,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 14, padding: 32,
            background: "rgba(20,17,10,0.55)", backdropFilter: "blur(6px)",
            border: 0, cursor: "pointer", color: e.cream,
            fontFamily: ef.sans, textAlign: "center",
            animation: "fadeIn 220ms cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <span aria-hidden style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 64, height: 64, borderRadius: 999,
            background: "rgba(250,247,240,0.10)",
            border: `1px solid rgba(250,247,240,0.22)`,
            marginBottom: 6,
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          </span>
          <span style={{
            fontFamily: ef.serif, fontSize: 24, fontWeight: 500,
            letterSpacing: -0.2, color: e.cream,
          }}>
            Tap to enable voice
          </span>
          <span style={{
            fontFamily: ef.sans, fontSize: 13, opacity: 0.8,
            color: e.cream, maxWidth: 360, lineHeight: 1.5,
          }}>
            Your browser paused audio playback. One tap unlocks the AI&apos;s voice
            and replays the current question.
          </span>
        </button>
      )}
    </div>
    </InterviewProvider>
  );
}
