"use client";
import { useEffect } from "react";
import { c, font } from "./tokens";
import {
  StatusToasts, InterviewHeader, AvatarStage, PanelAvatarStage, QuestionCard,
  UserAnswerArea, CompletionCard, MicroFeedbackPanel,
  ControlsBar, TranscriptPanel, EndModal, EvaluatingOverlay,
  DealSummaryCard, AnnotatedReplayPanel, NegotiationLiveDashboard,
} from "./InterviewPanels";
import { useInterviewEngine } from "./useInterviewEngine";
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
  const hosts = ["https://api.cartesia.ai", "https://api.deepgram.com"];
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
      const globalCtx = (window as unknown as { __hirestepxAudioCtx?: AudioContext }).__hirestepxAudioCtx;
      if (globalCtx && globalCtx.state === "suspended") {
        globalCtx.resume().catch(() => { /* expected: resume may fail if user gesture required */ });
      }
    };

    const onVisibility = () => { if (document.visibilityState === "visible") resumeSuspended(); };
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

function InterviewInner() {
  useEffect(() => { addInterviewPreconnects(); }, []);
  useMobileAudioResilience();
  const engine = useInterviewEngine();
  const video = useVideoRecorder();

  const {
    phase, step, currentStep, llmLoading, elapsed,
    speechUnavailable, isMuted, showTranscript, transcript,
    showEndModal, tabConflict, isOffline, micError,
    usedFallbackScore, evalTimedOut, lastSessionId,
    evaluating, evalElapsed, aiVoiceEnabled,
    showCaptions, currentTranscript, microFeedback,
    totalQuestions, baseQuestionCount, currentQuestionNum, isCurrentFollowUp,
    timeRemaining, timePercent,
    displayRole, displayCompany, displayFocus, interviewerName,
    isPanelInterview, panelMembers, activePersona,
    ttsDurationMs, speechEnded,
    interviewScript, saveWarning, liveMetrics,
    isSalaryNegotiation, negotiationBand, negotiationStyle,
    targetSalary, highestOffer, liveNegotiationState, voiceConfidence,

    setCurrentTranscript, setSpeechUnavailable, setIsMuted,
    setShowTranscript, setShowEndModal, setAiVoiceEnabled,
    setMicError, setEvalTimedOut, setUsedFallbackScore, setEvaluating,

    handleNextQuestion, skipSpeaking, handleEnd, navigate, retryQuestions,

    transcriptRef, endModalTriggerRef, textareaRef, nextBtnRef,
    micStreamRef, noSpeechCountRef, ttsCancelRef, interviewEndedRef,
  } = engine;


  // Track interview abandonment — fires when user leaves before handleEnd runs
  useEffect(() => {
    const onUnload = () => {
      if (!interviewEndedRef.current && phase !== "done" && currentStep > 0) {
        captureClientEvent("interview_abandoned", {
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
  }, [phase, currentStep, totalQuestions, elapsed, interviewEndedRef]);

  // Stop video recording when interview ends
  useEffect(() => {
    if (engine.phase === "done" && video.isRecording) {
      video.stopRecording();
    }
  }, [engine.phase, video.isRecording, video.stopRecording]);

  return (
    <InterviewProvider value={engine}>
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
          .iv-controls button { min-width: 48px !important; min-height: 48px !important; }
          .iv-controls .iv-hide-mobile { display: none !important; }
          .iv-transcript-panel { width: 100% !important; max-width: none !important; position: fixed !important; bottom: 0 !important; top: auto !important; right: 0 !important; left: 0 !important; height: 60vh !important; border-radius: 20px 20px 0 0 !important; animation: slideUpSheet 0.35s cubic-bezier(0.16, 1, 0.3, 1) both !important; }
          /* Video preview default is 160×120 — 43% of a 375px viewport.
             Shrinks to ~90px to stay out of the way of the main stage. */
          .iv-video-preview { width: 90px !important; height: 68px !important; top: 64px !important; right: 8px !important; }
        }
        @keyframes slideUpSheet { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @media (hover: none) and (pointer: coarse) {
          .iv-controls button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        }
      `}</style>

      <StatusToasts tabConflict={tabConflict} isOffline={isOffline} micError={micError} />

      <InterviewHeader
        displayCompany={displayCompany} displayRole={displayRole} displayFocus={displayFocus}
        llmLoading={llmLoading} currentStep={currentStep} phase={phase} elapsed={elapsed}
        currentQuestionNum={currentQuestionNum} totalQuestions={totalQuestions}
        baseQuestionCount={baseQuestionCount} isCurrentFollowUp={isCurrentFollowUp}
        saveWarning={saveWarning} onRetry={retryQuestions}
        isSalaryNegotiation={isSalaryNegotiation}
      />

      {/* ─── Center Stage ─── */}
      <div className="iv-center" style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        overflow: "auto", padding: "24px 24px 0",
        position: "relative",
      }}>
        {/* Video preview - small self-view */}
        {video.videoEnabled && (
          <div className="iv-video-preview" style={{
            position: "fixed", top: 80, right: 16, zIndex: 20,
            width: 160, height: 120, borderRadius: 12,
            overflow: "hidden", border: "2px solid rgba(245,242,237,0.1)",
            background: c.obsidian, boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}>
            <video
              ref={video.videoPreviewRef}
              autoPlay
              muted
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
            >
              <track kind="captions" />
            </video>
            <div style={{
              position: "absolute", bottom: 4, left: 4,
              display: "flex", alignItems: "center", gap: 4,
              padding: "2px 6px", borderRadius: 4,
              background: "rgba(0,0,0,0.6)",
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: c.ember, animation: "recordPulse 1.5s ease-in-out infinite" }} />
              <span style={{ fontFamily: font.ui, fontSize: 10, color: c.ivory }}>REC</span>
            </div>
          </div>
        )}

        <div style={{ width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>

{isPanelInterview && panelMembers ? (
            <PanelAvatarStage phase={phase} panelMembers={panelMembers} activePersona={activePersona} isMuted={isMuted} speechUnavailable={speechUnavailable} skipSpeaking={skipSpeaking} />
          ) : (
            <AvatarStage phase={phase} interviewerName={interviewerName} isMuted={isMuted} speechUnavailable={speechUnavailable} skipSpeaking={skipSpeaking} />
          )}

          <QuestionCard step={step} phase={phase} showCaptions={showCaptions} timeRemaining={timeRemaining} timePercent={timePercent}
            panelPersona={isPanelInterview && panelMembers ? panelMembers.find(m => m.title === activePersona) || null : null}
            actualDuration={ttsDurationMs} speechEnded={speechEnded}
            isSalaryNegotiation={isSalaryNegotiation}
          />

{isSalaryNegotiation && liveNegotiationState && phase !== "done" && (
            <NegotiationLiveDashboard
              liveState={liveNegotiationState}
              negotiationBand={negotiationBand}
              highestOffer={highestOffer}
              targetSalary={targetSalary}
              voiceConfidence={voiceConfidence}
              negotiationStyle={negotiationStyle}
            />
          )}

          {phase === "listening" && (
            <UserAnswerArea
              currentTranscript={currentTranscript} setCurrentTranscript={setCurrentTranscript}
              speechUnavailable={speechUnavailable} setSpeechUnavailable={setSpeechUnavailable}
              isMuted={isMuted} micStreamRef={micStreamRef} noSpeechCountRef={noSpeechCountRef}
              setMicError={setMicError} handleNextQuestion={handleNextQuestion}
              textareaRef={textareaRef} nextBtnRef={nextBtnRef}
              currentStep={currentStep} interviewScriptLength={interviewScript.length}
              liveMetrics={liveMetrics}
            />
          )}

          {phase === "done" && (
            <>
              {isSalaryNegotiation && (
                <DealSummaryCard
                  transcript={transcript}
                  negotiationBand={negotiationBand}
                  negotiationStyle={negotiationStyle}
                  onReplay={(style) => {
                    // Replay the negotiation with a different hiring manager style
                    const params = new URLSearchParams(window.location.search);
                    params.set("negotiationStyle", style);
                    navigate.push(`/interview?${params.toString()}`);
                    window.location.reload();
                  }}
                />
              )}
              {isSalaryNegotiation && transcript.length > 2 && (
                <AnnotatedReplayPanel
                  transcript={transcript}
                  negotiationBand={negotiationBand}
                />
              )}
              <CompletionCard
                currentQuestionNum={currentQuestionNum} elapsed={elapsed}
                usedFallbackScore={usedFallbackScore} evalTimedOut={evalTimedOut}
                evaluating={evaluating} handleEnd={handleEnd}
                videoURL={video.videoURL}
                isSalaryNegotiation={isSalaryNegotiation}
              />
            </>
          )}

          {(phase === "thinking" || phase === "speaking") && (
            <MicroFeedbackPanel transcript={transcript} microFeedback={microFeedback} />
          )}

        </div>
      </div>

      <ControlsBar
        isMuted={isMuted} setIsMuted={setIsMuted}
        aiVoiceEnabled={aiVoiceEnabled} setAiVoiceEnabled={setAiVoiceEnabled}
        showTranscript={showTranscript} setShowTranscript={setShowTranscript}
        phase={phase} ttsCancelRef={ttsCancelRef}
        setShowEndModal={setShowEndModal} endModalTriggerRef={endModalTriggerRef}
        videoEnabled={video.videoEnabled} onToggleVideo={video.toggleVideo}
      />

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
          isOffline={isOffline} handleEnd={handleEnd}
          setShowEndModal={setShowEndModal} endModalTriggerRef={endModalTriggerRef}
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
    </div>
    </InterviewProvider>
  );
}
