import { c, font } from "./tokens";
import {
  StatusToasts, InterviewHeader, AvatarStage, QuestionCard,
  UserAnswerArea, CompletionCard, MicroFeedbackPanel,
  ControlsBar, TranscriptPanel, EndModal, EvaluatingOverlay,
} from "./InterviewPanels";
import { useInterviewEngine } from "./useInterviewEngine";

/* ═══════════════════════════════════════════════
   INTERVIEW SCREEN
   ═══════════════════════════════════════════════ */
export default function Interview() {
  const engine = useInterviewEngine();

  const {
    phase, step, currentStep, llmLoading, elapsed,
    speechUnavailable, isMuted, showTranscript, transcript,
    showEndModal, tabConflict, isOffline, micError,
    usedFallbackScore, evalTimedOut, lastSessionId,
    evaluating, evalElapsed, aiVoiceEnabled,
    showCaptions, currentTranscript, microFeedback,
    totalQuestions, currentQuestionNum,
    timeRemaining, timePercent,
    displayRole, displayCompany, displayFocus, interviewerName,
    interviewScript, saveWarning,

    setCurrentTranscript, setSpeechUnavailable, setIsMuted,
    setShowTranscript, setShowEndModal, setAiVoiceEnabled,
    setMicError, setEvalTimedOut, setUsedFallbackScore, setEvaluating,

    handleNextQuestion, skipSpeaking, handleEnd, navigate,

    transcriptRef, endModalTriggerRef, textareaRef, nextBtnRef,
    micStreamRef, noSpeechCountRef, ttsCancelRef, interviewEndedRef,
  } = engine;

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
      />

      {/* ─── Center Stage ─── */}
      <div className="iv-center" style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        overflow: "auto", padding: "24px 24px 0",
        position: "relative",
      }}>
        <div style={{ width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>

          <AvatarStage phase={phase} interviewerName={interviewerName} isMuted={isMuted} speechUnavailable={speechUnavailable} skipSpeaking={skipSpeaking} />

          <QuestionCard step={step} phase={phase} showCaptions={showCaptions} timeRemaining={timeRemaining} timePercent={timePercent} />

          {phase === "listening" && (
            <UserAnswerArea
              currentTranscript={currentTranscript} setCurrentTranscript={setCurrentTranscript}
              speechUnavailable={speechUnavailable} setSpeechUnavailable={setSpeechUnavailable}
              isMuted={isMuted} micStreamRef={micStreamRef} noSpeechCountRef={noSpeechCountRef}
              setMicError={setMicError} handleNextQuestion={handleNextQuestion}
              textareaRef={textareaRef} nextBtnRef={nextBtnRef}
              currentStep={currentStep} interviewScriptLength={interviewScript.length}
            />
          )}

          {phase === "done" && (
            <CompletionCard
              currentQuestionNum={currentQuestionNum} elapsed={elapsed}
              usedFallbackScore={usedFallbackScore} evalTimedOut={evalTimedOut}
              evaluating={evaluating} handleEnd={handleEnd}
            />
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
      />

      {showTranscript && (
        <TranscriptPanel
          transcript={transcript} interviewerName={interviewerName}
          setShowTranscript={setShowTranscript} transcriptRef={transcriptRef}
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
  );
}
