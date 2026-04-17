import { useEffect, useState } from "react";
import { c, font } from "./tokens";
import {
  StatusToasts, InterviewHeader, AvatarStage, PanelAvatarStage, QuestionCard,
  UserAnswerArea, CompletionCard, MicroFeedbackPanel,
  ControlsBar, TranscriptPanel, EndModal, EvaluatingOverlay,
  DealSummaryCard, NegotiationCoachingCard,
} from "./InterviewPanels";
import { useInterviewEngine } from "./useInterviewEngine";
import { useVideoRecorder } from "./useVideoRecorder";
import { InterviewProvider } from "./InterviewContext";

/* ═══════════════════════════════════════════════
   INTERVIEW SCREEN
   Wraps with InterviewProvider so any child component
   can call useInterview() instead of receiving props.
   ═══════════════════════════════════════════════ */
export default function Interview() {
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

    setCurrentTranscript, setSpeechUnavailable, setIsMuted,
    setShowTranscript, setShowEndModal, setAiVoiceEnabled,
    setMicError, setEvalTimedOut, setUsedFallbackScore, setEvaluating,

    handleNextQuestion, skipSpeaking, handleEnd, navigate, retryQuestions,

    transcriptRef, endModalTriggerRef, textareaRef, nextBtnRef,
    micStreamRef, noSpeechCountRef, ttsCancelRef, interviewEndedRef,
  } = engine;

  // Coaching card state (salary negotiation only)
  const [showCoachingCard, setShowCoachingCard] = useState(isSalaryNegotiation && currentStep === 0);

  // Auto-dismiss coaching card when user advances past intro
  useEffect(() => {
    if (currentStep > 0) setShowCoachingCard(false);
  }, [currentStep]);

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
          <div style={{
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

          {showCoachingCard && isSalaryNegotiation && (
            <NegotiationCoachingCard
              onDismiss={() => setShowCoachingCard(false)}
              negotiationStyle={negotiationStyle}
            />
          )}

          {isPanelInterview && panelMembers ? (
            <PanelAvatarStage phase={phase} panelMembers={panelMembers} activePersona={activePersona} isMuted={isMuted} speechUnavailable={speechUnavailable} skipSpeaking={skipSpeaking} />
          ) : (
            <AvatarStage phase={phase} interviewerName={interviewerName} isMuted={isMuted} speechUnavailable={speechUnavailable} skipSpeaking={skipSpeaking} />
          )}

          <QuestionCard step={step} phase={phase} showCaptions={showCaptions} timeRemaining={timeRemaining} timePercent={timePercent}
            panelPersona={isPanelInterview && panelMembers ? panelMembers.find(m => m.title === activePersona) || null : null}
            actualDuration={ttsDurationMs} speechEnded={speechEnded}
          />

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
                    navigate(`/interview?${params.toString()}`);
                    window.location.reload();
                  }}
                />
              )}
              <CompletionCard
                currentQuestionNum={currentQuestionNum} elapsed={elapsed}
                usedFallbackScore={usedFallbackScore} evalTimedOut={evalTimedOut}
                evaluating={evaluating} handleEnd={handleEnd}
                videoURL={video.videoURL}
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
