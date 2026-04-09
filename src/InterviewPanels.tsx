import React from "react";
import { c, font } from "./tokens";
import {
  WaveformVisualizer, NetworkIndicator, DotGridVisualizer,
  LiveCaptions, ControlButton, formatTime,
} from "./InterviewComponents";

/* ═══════════════════════════════════════════════
   Extracted presentational components from Interview.tsx
   ═══════════════════════════════════════════════ */

/* ─── Status Toasts (tab conflict, offline, mic error) ─── */

export function StatusToasts({ tabConflict, isOffline, micError }: {
  tabConflict: boolean; isOffline: boolean; micError: string;
}) {
  if (!tabConflict && !isOffline && !micError) return null;
  return (
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
  );
}

/* ─── Interview Header (top info bar) ─── */

export function InterviewHeader({ displayCompany, displayRole, displayFocus, llmLoading, currentStep, phase, elapsed, currentQuestionNum, totalQuestions }: {
  displayCompany: string; displayRole: string; displayFocus: string;
  llmLoading: boolean; currentStep: number;
  phase: string; elapsed: number;
  currentQuestionNum: number; totalQuestions: number;
}) {
  return (
    <header className="iv-info-bar" style={{
      display: "flex", flexDirection: "column",
      borderBottom: "1px solid rgba(245,242,237,0.04)",
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
  );
}

/* ─── AI Avatar + Question Card ─── */

export function AvatarStage({ phase, interviewerName, isMuted, speechUnavailable, skipSpeaking }: {
  phase: string; interviewerName: string; isMuted: boolean; speechUnavailable: boolean;
  skipSpeaking: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "20px 0" }}>
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
      {phase === "listening" && !isMuted && !speechUnavailable && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "4px 12px",
          borderRadius: 100, background: "rgba(122,158,126,0.08)", border: "1px solid rgba(122,158,126,0.15)",
          animation: "fadeUp 0.3s ease",
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: c.sage, animation: "recordPulse 1s ease-in-out infinite" }} />
          <span role="status" aria-live="polite" style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.sage, letterSpacing: "0.05em", textTransform: "uppercase" }}>Recording</span>
        </div>
      )}
      {phase === "speaking" && (
        <button onClick={skipSpeaking} style={{
          fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk,
          background: "rgba(245,242,237,0.06)", border: `1px solid ${c.border}`,
          borderRadius: 8, padding: "6px 16px", cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 6,
          transition: "all 0.2s", marginTop: 4,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(245,242,237,0.1)"; e.currentTarget.style.borderColor = "rgba(245,242,237,0.15)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "rgba(245,242,237,0.06)"; e.currentTarget.style.borderColor = c.border; }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
          Skip · Enter
        </button>
      )}
    </div>
  );
}

/* ─── Question Card with timer ─── */

export function QuestionCard({ step, phase, showCaptions, timeRemaining, timePercent }: {
  step: { aiText: string; scoreNote?: string; speakingDuration: number } | undefined;
  phase: string; showCaptions: boolean;
  timeRemaining: number; timePercent: number;
}) {
  return (
    <div aria-live="polite" aria-atomic="true" style={{
      width: "100%", background: c.graphite, borderRadius: 16,
      border: `1px solid ${phase === "speaking" ? "rgba(212,179,127,0.15)" : c.border}`,
      padding: "20px 24px", transition: "all 0.4s ease",
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
      {phase !== "done" && (
        <div role="timer" aria-label={`${formatTime(timeRemaining)} remaining for this question`} style={{ marginTop: 16 }}>
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
  );
}

/* ─── User Answer Area (speech or text input) ─── */

export function UserAnswerArea({ currentTranscript, setCurrentTranscript, speechUnavailable, setSpeechUnavailable, isMuted, micStreamRef, noSpeechCountRef, setMicError, handleNextQuestion, textareaRef, nextBtnRef, currentStep, interviewScriptLength }: {
  currentTranscript: string; setCurrentTranscript: (v: string) => void;
  speechUnavailable: boolean; setSpeechUnavailable: (v: boolean) => void;
  isMuted: boolean; micStreamRef: React.MutableRefObject<MediaStream | null>;
  noSpeechCountRef: React.MutableRefObject<number>;
  setMicError: (v: string) => void;
  handleNextQuestion: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  nextBtnRef: React.RefObject<HTMLButtonElement | null>;
  currentStep: number; interviewScriptLength: number;
}) {
  return (
    <div style={{
      width: "100%", borderRadius: 16,
      background: "rgba(122,158,126,0.03)",
      border: "1px solid rgba(122,158,126,0.12)",
      padding: "18px 24px", animation: "fadeUp 0.3s ease",
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
      <div role="log" aria-live="polite" aria-label="Speech transcript" style={{ minHeight: 60, marginBottom: 10 }}>
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
                background: "rgba(122,158,126,0.06)", border: "1px solid rgba(122,158,126,0.15)",
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
        {currentStep < interviewScriptLength - 1 ? "Next Question" : "Finish"}
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  );
}

/* ─── Completion Card (done state) ─── */

export function CompletionCard({ currentQuestionNum, elapsed, usedFallbackScore, evalTimedOut, evaluating, handleEnd }: {
  currentQuestionNum: number; elapsed: number;
  usedFallbackScore: boolean; evalTimedOut: boolean;
  evaluating: boolean; handleEnd: () => void;
}) {
  return (
    <div style={{
      width: "100%", borderRadius: 16,
      background: "rgba(122,158,126,0.04)",
      border: "1px solid rgba(122,158,126,0.15)",
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
  );
}

/* ─── Micro-feedback on last answer ─── */

export function MicroFeedbackPanel({ transcript, microFeedback }: {
  transcript: { speaker: string; text: string }[];
  microFeedback: string | null;
}) {
  const lastUserMsg = [...transcript].reverse().find(t => t.speaker === "user");
  if (!lastUserMsg) return null;
  return (
    <div style={{ width: "100%", borderRadius: 12, padding: "12px 16px", background: "rgba(122,158,126,0.03)", border: "1px solid rgba(122,158,126,0.06)" }}>
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
}

/* ─── Bottom Controls Bar ─── */

export function ControlsBar({ isMuted, setIsMuted, aiVoiceEnabled, setAiVoiceEnabled, showTranscript, setShowTranscript, phase, ttsCancelRef, setShowEndModal, endModalTriggerRef }: {
  isMuted: boolean; setIsMuted: (fn: (m: boolean) => boolean) => void;
  aiVoiceEnabled: boolean; setAiVoiceEnabled: (fn: (v: boolean) => boolean) => void;
  showTranscript: boolean; setShowTranscript: (fn: (t: boolean) => boolean) => void;
  phase: string;
  ttsCancelRef: React.MutableRefObject<(() => void) | null>;
  setShowEndModal: (v: boolean) => void;
  endModalTriggerRef: React.RefObject<HTMLSpanElement | null>;
}) {
  return (
    <footer className="iv-controls" style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "10px 24px", gap: 12,
      borderTop: "1px solid rgba(245,242,237,0.04)",
      background: "rgba(6,6,7,0.6)", backdropFilter: "blur(12px)",
      flexShrink: 0, zIndex: 10,
    }}>
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
  );
}

/* ─── Transcript Slide-Over Panel ─── */

export function TranscriptPanel({ transcript, interviewerName, setShowTranscript, transcriptRef }: {
  transcript: { speaker: "ai" | "user"; text: string; time: string }[];
  interviewerName: string;
  setShowTranscript: (v: boolean) => void;
  transcriptRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <div
        onClick={() => setShowTranscript(false)}
        style={{
          position: "fixed", inset: 0, zIndex: 49,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)",
          animation: "fadeUp 0.15s ease",
        }}
      />
      <div className="iv-transcript-panel" style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 380, maxWidth: "100vw",
        background: c.graphite,
        borderLeft: `1px solid ${c.border}`,
        display: "flex", flexDirection: "column",
        zIndex: 50, animation: "slideInRight 0.25s ease",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.3)",
      }}>
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${c.border}`,
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
                    {msg.speaker === "ai" ? interviewerName : "You"}
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
  );
}

/* ─── End Interview Modal ─── */

export function EndModal({ currentQuestionNum, totalQuestions, isOffline, handleEnd, setShowEndModal, endModalTriggerRef }: {
  currentQuestionNum: number; totalQuestions: number; isOffline: boolean;
  handleEnd: () => void; setShowEndModal: (v: boolean) => void;
  endModalTriggerRef: React.RefObject<HTMLSpanElement | null>;
}) {
  const closeFocus = () => { setShowEndModal(false); endModalTriggerRef.current?.querySelector("button")?.focus(); };
  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby="end-modal-title" tabIndex={-1}
      onClick={(e) => { if (e.target === e.currentTarget) { e.stopPropagation(); closeFocus(); } }}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeFocus(); return; }
        if (e.key === "Tab") {
          const modal = e.currentTarget.querySelector("[data-modal-content]") as HTMLElement;
          if (!modal) return;
          const focusable = modal.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
          if (focusable.length === 0) return;
          const first = focusable[0]; const last = focusable[focusable.length - 1];
          if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
          else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
        }
      }}
      ref={(el) => { if (el) { const btn = el.querySelector("button"); if (btn) btn.focus(); } }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        animation: "fadeUp 0.15s ease",
      }}>
      <div data-modal-content style={{
        background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`,
        padding: "32px", maxWidth: 400, width: "90%", textAlign: "center",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%", margin: "0 auto 20px",
          background: "rgba(196,112,90,0.08)", border: "1px solid rgba(196,112,90,0.2)",
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
          <button onClick={closeFocus}
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
  );
}

/* ─── Evaluating Overlay ─── */

export function EvaluatingOverlay({ usedFallbackScore, evalTimedOut, evalElapsed, saveWarning, setEvalTimedOut, setUsedFallbackScore, setEvaluating, interviewEndedRef, handleEnd, lastSessionId, navigate }: {
  usedFallbackScore: boolean; evalTimedOut: boolean; evalElapsed: number; saveWarning: string;
  setEvalTimedOut: (v: boolean) => void; setUsedFallbackScore: (v: boolean) => void;
  setEvaluating: (v: boolean) => void;
  interviewEndedRef: React.MutableRefObject<boolean>;
  handleEnd: () => void;
  lastSessionId: string | null;
  navigate: (path: string) => void;
}) {
  return (
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
                background: "rgba(212,179,127,0.1)", border: "1px solid rgba(212,179,127,0.2)",
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
  );
}
