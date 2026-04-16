import React, { memo, useRef, useState, useEffect } from "react";
import { c, font } from "./tokens";
import {
  WaveformVisualizer, NetworkIndicator, DotGridVisualizer,
  LiveCaptions, ControlButton, formatTime,
} from "./InterviewComponents";
import type { PanelMember } from "./InterviewComponents";

/* ═══════════════════════════════════════════════
   Extracted presentational components from Interview.tsx
   ═══════════════════════════════════════════════ */

/* ─── Status Toasts (tab conflict, offline, mic error) ─── */

export const StatusToasts = memo(function StatusToasts({ tabConflict, isOffline, micError }: {
  tabConflict: boolean; isOffline: boolean; micError: string;
}) {
  if (!tabConflict && !isOffline && !micError) return null;
  return (
    <div style={{ position: "fixed", top: "max(12px, env(safe-area-inset-top, 0px))", left: "50%", transform: "translateX(-50%)", zIndex: 100, display: "flex", flexDirection: "column", gap: 8, maxWidth: 500, width: "min(90%, calc(100vw - 32px))" }}>
      {tabConflict && (
        <div role="alert" style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(212,179,127,0.12)", border: "1px solid rgba(212,179,127,0.25)", display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.gilt }}>Interview is open in another tab</span>
        </div>
      )}
      {isOffline && (
        <div role="alert" style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(196,112,90,0.15)", border: "1px solid rgba(196,112,90,0.3)", display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ember }}>Offline — session saved locally</span>
        </div>
      )}
      {micError && (
        <div role="alert" style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(196,112,90,0.1)", border: "1px solid rgba(196,112,90,0.2)", display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/></svg>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ember }}>{micError}</span>
        </div>
      )}
    </div>
  );
});

/* ─── Interview Header (top info bar) ─── */

export const InterviewHeader = memo(function InterviewHeader({ displayCompany, displayRole, displayFocus, llmLoading, currentStep, phase, elapsed, currentQuestionNum, totalQuestions, baseQuestionCount, isCurrentFollowUp, saveWarning, onRetry }: {
  displayCompany: string; displayRole: string; displayFocus: string;
  llmLoading: boolean; currentStep: number;
  phase: string; elapsed: number;
  currentQuestionNum: number; totalQuestions: number;
  baseQuestionCount?: number; isCurrentFollowUp?: boolean;
  saveWarning?: string; onRetry?: () => void;
}) {
  return (
    <header className="iv-info-bar" style={{
      display: "flex", flexDirection: "column",
      borderBottom: "1px solid rgba(245,242,237,0.04)",
      background: "rgba(6,6,7,0.6)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
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
              <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Personalizing questions...</span>
            </div>
          )}
          {!llmLoading && saveWarning && saveWarning.includes("retry") && currentStep <= 1 && onRetry && (
            <button
              onClick={onRetry}
              style={{
                fontFamily: font.ui, fontSize: 10, fontWeight: 600,
                color: c.gilt, background: "rgba(212,179,127,0.1)",
                border: "1px solid rgba(212,179,127,0.25)", borderRadius: 6,
                padding: "4px 10px", cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(212,179,127,0.2)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(212,179,127,0.1)")}
            >
              Retry personalized
            </button>
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
            <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: isCurrentFollowUp ? c.gilt : c.ivory }}>
              {isCurrentFollowUp
                ? `Follow-up · Question ${Math.min(currentQuestionNum, baseQuestionCount || totalQuestions)} of ${baseQuestionCount || totalQuestions}`
                : `Question ${currentQuestionNum} of ${baseQuestionCount || totalQuestions}`}
            </span>
            <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>
              {Math.round((Math.min(currentQuestionNum, baseQuestionCount || totalQuestions) / (baseQuestionCount || totalQuestions)) * 100)}%
            </span>
          </div>
          <div style={{ display: "flex", gap: 3, height: 3 }}>
            {Array.from({ length: baseQuestionCount || totalQuestions }).map((_, i) => (
              <div key={i} style={{
                flex: 1, borderRadius: 2, height: 3,
                background: i < Math.min(currentQuestionNum, baseQuestionCount || totalQuestions)
                  ? c.gilt
                  : i === Math.min(currentQuestionNum, baseQuestionCount || totalQuestions)
                    ? "rgba(212,179,127,0.4)"
                    : "rgba(245,242,237,0.08)",
                transition: "all 0.4s ease",
              }} />
            ))}
          </div>
        </div>
      )}
    </header>
  );
});

/* ─── AI Avatar + Question Card ─── */

export const AvatarStage = memo(function AvatarStage({ phase, interviewerName, isMuted, speechUnavailable, skipSpeaking }: {
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
});

/* ─── Panel Interview: 3 Avatars ─── */

export const PanelAvatarStage = memo(function PanelAvatarStage({ phase, panelMembers, activePersona, isMuted, speechUnavailable, skipSpeaking }: {
  phase: string;
  panelMembers: PanelMember[];
  activePersona: string; // title of the currently speaking panelist
  isMuted: boolean;
  speechUnavailable: boolean;
  skipSpeaking: () => void;
}) {
  const activeIdx = panelMembers.findIndex(m => m.title === activePersona);
  const activeMember = activeIdx >= 0 ? panelMembers[activeIdx] : panelMembers[0];

  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 600px)").matches);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 600px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "20px 0" }}>
      {/* Three avatars in a row */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: isMobile ? 8 : 12 }}>
        {panelMembers.map((member) => {
          const isActive = member.title === activeMember.title;
          const isActiveSpeaking = isActive && phase === "speaking";
          const size = isActive ? (isMobile ? 72 : 100) : (isMobile ? 44 : 64);

          return (
            <div key={member.title} role="img" aria-label={`${member.name}, ${member.title}${isActive ? (phase === "speaking" ? ", currently speaking" : phase === "thinking" ? ", preparing question" : "") : ""}`} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              transition: "all 0.4s ease",
              opacity: isActive ? 1 : 0.5,
              transform: isActive ? "translateY(-4px)" : "translateY(0)",
            }}>
              <div style={{
                width: size, height: size, borderRadius: "50%",
                background: isActiveSpeaking ? `${member.color}10` : "rgba(245,242,237,0.02)",
                border: `2px solid ${isActive ? `${member.color}50` : c.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.4s ease",
                boxShadow: isActiveSpeaking ? `0 0 30px ${member.color}15` : "none",
                position: "relative",
              }}>
                {isActive ? (
                  <DotGridVisualizer active={phase === "speaking"} thinking={phase === "thinking"} />
                ) : (
                  /* Initials for inactive panelists */
                  <span style={{
                    fontFamily: font.display, fontSize: size * 0.28, fontWeight: 600,
                    color: `${member.color}80`,
                    letterSpacing: "0.02em",
                  }}>
                    {member.name.split(" ").map(n => n[0]).join("")}
                  </span>
                )}
                {/* "Speaking" badge on active avatar */}
                {isActiveSpeaking && (
                  <div style={{
                    position: "absolute", bottom: -2, left: "50%", transform: "translateX(-50%)",
                    padding: "1px 8px", borderRadius: 10,
                    background: member.color, fontSize: 8, fontFamily: font.ui,
                    fontWeight: 700, color: c.obsidian, letterSpacing: "0.04em",
                    textTransform: "uppercase", whiteSpace: "nowrap",
                  }}>
                    Speaking
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <span style={{
                  fontFamily: font.ui, fontSize: isActive ? (isMobile ? 11 : 13) : (isMobile ? 9 : 10), fontWeight: isActive ? 600 : 500,
                  color: isActive ? c.ivory : c.stone,
                  transition: "all 0.3s ease",
                  whiteSpace: "nowrap",
                }}>
                  {member.name}
                </span>
                <span style={{
                  fontFamily: font.ui, fontSize: isActive ? (isMobile ? 9 : 10) : (isMobile ? 8 : 9), fontWeight: 500,
                  color: member.color, opacity: isActive ? 0.8 : 0.5,
                  whiteSpace: "nowrap",
                }}>
                  {member.title}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Status line for active panelist */}
      <span aria-live="polite" aria-atomic="true" role="status" style={{
        fontFamily: font.ui, fontSize: 11, fontWeight: 500,
        color: phase === "speaking" ? activeMember.color : phase === "listening" ? c.sage : c.stone,
        marginTop: 4,
      }}>
        {phase === "thinking" ? `${activeMember.name} is preparing...`
          : phase === "speaking" ? `${activeMember.name} is speaking...`
          : phase === "listening" ? "Listening"
          : "Complete"}
      </span>

      {/* Recording indicator */}
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

      {/* Skip button */}
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
});

/* ─── Question Card with timer ─── */

export const QuestionCard = memo(function QuestionCard({ step, phase, showCaptions, timeRemaining, timePercent, panelPersona, actualDuration, speechEnded }: {
  step: { aiText: string; scoreNote?: string; speakingDuration: number } | undefined;
  phase: string; showCaptions: boolean;
  timeRemaining: number; timePercent: number;
  panelPersona?: { name: string; title: string; color: string } | null;
  /** Real TTS audio duration in ms — from TTS provider */
  actualDuration?: number;
  /** True when TTS voice playback has finished */
  speechEnded?: boolean;
}) {
  return (
    <div aria-live="polite" aria-atomic="true" style={{
      width: "100%", background: c.graphite, borderRadius: 16,
      border: `1px solid ${phase === "speaking" && panelPersona ? `${panelPersona.color}25` : phase === "speaking" ? "rgba(212,179,127,0.15)" : c.border}`,
      padding: "20px 24px", transition: "all 0.4s ease",
    }}>
      {panelPersona && (phase === "speaking" || phase === "listening") && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "3px 10px", borderRadius: 100, marginBottom: 10,
          background: `${panelPersona.color}10`, border: `1px solid ${panelPersona.color}20`,
        }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: panelPersona.color }} />
          <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: panelPersona.color }}>
            {panelPersona.name} · {panelPersona.title}
          </span>
        </div>
      )}
      {step?.scoreNote && phase !== "done" && phase !== "thinking" && (
        <p style={{
          fontFamily: font.ui, fontSize: 11, color: "rgba(212,179,127,0.5)",
          margin: "0 0 10px", display: "flex", alignItems: "center", gap: 5,
        }}>
          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(212,179,127,0.4)" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
          {step.scoreNote}
        </p>
      )}
      {phase === "speaking" ? (
        <LiveCaptions text={step?.aiText || ""} isTyping={true} speakingDuration={step?.speakingDuration} actualDuration={actualDuration} speechEnded={speechEnded} />
      ) : phase === "thinking" ? (
        <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>Preparing next question...</p>
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
});

/* ─── User Answer Area (speech or text input) ─── */

export const UserAnswerArea = memo(function UserAnswerArea({ currentTranscript, setCurrentTranscript, speechUnavailable, setSpeechUnavailable, isMuted, micStreamRef, noSpeechCountRef, setMicError, handleNextQuestion, textareaRef, nextBtnRef, currentStep, interviewScriptLength, liveMetrics }: {
  currentTranscript: string; setCurrentTranscript: (v: string) => void;
  speechUnavailable: boolean; setSpeechUnavailable: (v: boolean) => void;
  isMuted: boolean; micStreamRef: React.MutableRefObject<MediaStream | null>;
  noSpeechCountRef: React.MutableRefObject<number>;
  setMicError: (v: string) => void;
  handleNextQuestion: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  nextBtnRef: React.RefObject<HTMLButtonElement | null>;
  currentStep: number; interviewScriptLength: number;
  liveMetrics: { wordCount: number; wpm: number; fillerCount: number; lengthGuidance: string | null } | null;
}) {
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const hintDismissed = useRef(false);
  const [showHint, setShowHint] = useState(false);

  // Show hint once when transcript exceeds 20 chars in speech mode
  useEffect(() => {
    if (!hintDismissed.current && !speechUnavailable && currentTranscript.length > 20) {
      setShowHint(true);
    }
  }, [currentTranscript, speechUnavailable]);

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
      {showHint && !hintDismissed.current && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "5px 10px", marginBottom: 8, borderRadius: 8,
          background: "rgba(122,158,126,0.04)", border: "1px solid rgba(122,158,126,0.08)",
        }}>
          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, fontStyle: "italic" }}>
            Tip: If speech recognition misses a word, tap &lsquo;Edit&rsquo; to correct it before moving on.
          </span>
          <button
            onClick={() => { hintDismissed.current = true; setShowHint(false); }}
            aria-label="Dismiss tip"
            style={{
              fontFamily: font.ui, fontSize: 12, color: c.stone, background: "transparent",
              border: "none", cursor: "pointer", padding: "0 4px", lineHeight: 1,
            }}
          >&times;</button>
        </div>
      )}
      <div role="log" aria-live="polite" aria-label="Speech transcript" style={{ minHeight: 60, marginBottom: 10 }}>
        {speechUnavailable ? (
          <>
            <textarea
              ref={textareaRef}
              value={currentTranscript}
              onChange={(e) => setCurrentTranscript(e.target.value)}
              placeholder="Type your answer here..."
              maxLength={3000}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- user-initiated: text input mode activated by user
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
              isEditingTranscript ? (
                <>
                  <textarea
                    value={currentTranscript}
                    onChange={(e) => setCurrentTranscript(e.target.value)}
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- user-initiated: edit mode activated by user
                    autoFocus
                    style={{
                      width: "100%", minHeight: 70, fontFamily: font.ui, fontSize: 13, color: c.ivory,
                      lineHeight: 1.7, background: "transparent", border: "none", outline: "none",
                      resize: "none", padding: 0, margin: 0,
                    }}
                  />
                  <button
                    onClick={() => setIsEditingTranscript(false)}
                    style={{
                      fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.sage,
                      background: "rgba(122,158,126,0.06)", border: "1px solid rgba(122,158,126,0.15)",
                      borderRadius: 10, padding: "4px 12px", cursor: "pointer", marginTop: 4,
                      display: "inline-flex", alignItems: "center", gap: 5, transition: "all 0.2s",
                    }}>
                    Done editing
                  </button>
                </>
              ) : (
                <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, lineHeight: 1.7, margin: 0, opacity: 0.9 }}>
                  {currentTranscript}
                  <span style={{ display: "inline-block", width: 2, height: 14, background: c.sage, marginLeft: 2, verticalAlign: "text-bottom", animation: "blink 0.8s ease-in-out infinite" }} />
                </p>
              )
            ) : (
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, lineHeight: 1.7, margin: 0, fontStyle: "italic" }}>
                Start speaking — your answer will appear here...
              </p>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
              <button onClick={() => { setSpeechUnavailable(true); setMicError(""); }}
                aria-label="Type instead"
                style={{
                  fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone,
                  background: "transparent", border: "none", padding: "4px 0", cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 5, transition: "color 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = c.chalk; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; }}>
                <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="M6 12h.01"/><path d="M18 12h.01"/><path d="M8 16h8"/></svg>
                Prefer typing? Switch to text
              </button>
              {currentTranscript && !isEditingTranscript && (
                <button
                  onClick={() => setIsEditingTranscript(true)}
                  aria-label="Edit transcript"
                  style={{
                    fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone,
                    background: "transparent", border: "none", padding: "4px 0", cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 5, transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = c.chalk; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; }}>
                  <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Edit
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {liveMetrics && (
        <div style={{
          display: "flex", alignItems: "center", gap: 16, padding: "8px 12px",
          borderRadius: 8, background: "rgba(245,242,237,0.03)",
          border: "1px solid rgba(245,242,237,0.06)", marginTop: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: liveMetrics.wpm > 180 ? c.ember : liveMetrics.wpm < 100 ? c.gilt : c.sage }}>
              {liveMetrics.wpm}
            </span>
            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>WPM</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: liveMetrics.fillerCount > 5 ? c.ember : liveMetrics.fillerCount > 2 ? c.gilt : c.sage }}>
              {liveMetrics.fillerCount}
            </span>
            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>fillers</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.ivory }}>
              {liveMetrics.wordCount}
            </span>
            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>words</span>
          </div>
          {liveMetrics.lengthGuidance && (
            <>
              <div style={{ width: 1, height: 12, background: "rgba(245,242,237,0.08)" }} />
              <span style={{ fontFamily: font.ui, fontSize: 10, color: c.gilt, fontStyle: "italic" }}>
                {liveMetrics.lengthGuidance}
              </span>
            </>
          )}
        </div>
      )}
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
});

/* ─── Salary Negotiation Coaching Card (shown before session starts) ─── */

export const NegotiationCoachingCard = memo(function NegotiationCoachingCard({ onDismiss, negotiationStyle }: {
  onDismiss: () => void;
  negotiationStyle?: string;
}) {
  const styleLabel = negotiationStyle === "aggressive" ? "Aggressive" : negotiationStyle === "defensive" ? "Defensive" : "Cooperative";
  const styleDesc = negotiationStyle === "aggressive"
    ? "The hiring manager will be budget-conscious and push back hard. Practice holding your ground."
    : negotiationStyle === "defensive"
    ? "The hiring manager will deflect and avoid committing. Practice being persistent."
    : "The hiring manager will be collaborative. Practice maximizing value through creative trade-offs.";

  return (
    <div style={{
      width: "100%", maxWidth: 480, borderRadius: 16,
      background: "rgba(212,179,127,0.04)",
      border: "1px solid rgba(212,179,127,0.15)",
      padding: "24px", display: "flex", flexDirection: "column", gap: 16,
      animation: "slideUp 0.5s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <span style={{ fontFamily: font.display, fontSize: 15, fontWeight: 600, color: c.ivory }}>Negotiation Tips</span>
        {negotiationStyle && (
          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt, padding: "2px 8px", borderRadius: 6, background: "rgba(212,179,127,0.1)", marginLeft: "auto" }}>
            {styleLabel} Manager
          </span>
        )}
      </div>

      {negotiationStyle && (
        <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, margin: 0, lineHeight: 1.5 }}>
          {styleDesc}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { icon: "1", title: "Don't accept immediately", desc: "Thank them, express interest, then ask for details before responding." },
          { icon: "2", title: "Anchor high with reasoning", desc: "State your target range backed by market data, not your current salary." },
          { icon: "3", title: "Think total comp", desc: "Negotiate equity, joining bonus, flexibility, and learning budget — not just base." },
          { icon: "4", title: "Trade, don't just ask", desc: "\"I can accept ₹X base if you add a ₹Y joining bonus\" — give something to get something." },
          { icon: "5", title: "Close with next steps", desc: "Ask about timeline, offer letter, and start date. Don't leave it open-ended." },
        ].map(tip => (
          <div key={tip.icon} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, minWidth: 20, height: 20, borderRadius: "50%", background: "rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{tip.icon}</span>
            <div>
              <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory }}>{tip.title}</span>
              <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, margin: "2px 0 0", lineHeight: 1.4 }}>{tip.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onDismiss}
        style={{
          fontFamily: font.ui, fontSize: 13, fontWeight: 600,
          padding: "10px 20px", borderRadius: 10, marginTop: 4,
          background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
          border: "none", color: c.obsidian, cursor: "pointer",
          transition: "all 0.2s ease",
        }}
      >
        Got it — start negotiation
      </button>
    </div>
  );
});

/* ─── Post-Interview Deal Summary (shown after salary negotiation) ─── */

export const DealSummaryCard = memo(function DealSummaryCard({ transcript, negotiationBand, onReplay }: {
  transcript: { speaker: string; text: string; time: string }[];
  negotiationBand?: { initialOffer: number; maxStretch: number; walkAway: number } | null;
  onReplay?: (style: string) => void;
}) {
  // Extract key numbers from the conversation
  const aiTexts = transcript.filter(t => t.speaker === "ai").map(t => t.text);
  const userTexts = transcript.filter(t => t.speaker === "user").map(t => t.text);
  const allText = [...aiTexts, ...userTexts].join(" ");

  // Extract salary numbers from conversation
  const salaryRe = /₹?\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakh|lakhs|l\b)/gi;
  const aiNumbers = aiTexts.join(" ").match(salaryRe) || [];
  const userNumbers = userTexts.join(" ").match(salaryRe) || [];

  const parseNum = (s: string) => {
    const m = s.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : 0;
  };

  const initialOffer = negotiationBand?.initialOffer || (aiNumbers.length > 0 ? parseNum(aiNumbers[0] ?? "") : 0);

  // Final offer: use the MAX number from the last AI message (total CTC > component breakdowns)
  // e.g. "₹32 LPA total CTC with ₹25 LPA base, ₹4 LPA variable, ₹3 LPA ESOPs" → 32
  const lastAiText = aiTexts.length > 0 ? aiTexts[aiTexts.length - 1] : "";
  const lastAiNumbers = lastAiText.match(salaryRe) || [];
  const finalOffer = lastAiNumbers.length > 0
    ? Math.max(...lastAiNumbers.map(parseNum))
    : (aiNumbers.length > 0 ? Math.max(...aiNumbers.map(parseNum)) : initialOffer);

  const candidateAsk = userNumbers.length > 0 ? Math.max(...userNumbers.map(parseNum)) : 0;

  const improvement = initialOffer > 0 ? Math.round(((finalOffer - initialOffer) / initialOffer) * 100) : 0;

  // Detect benefits negotiated
  const benefits: string[] = [];
  if (/joining bonus|sign.?on/i.test(allText)) benefits.push("Joining Bonus");
  if (/esop|equity|stock|rsu/i.test(allText)) benefits.push("Equity/ESOPs");
  if (/flexible|remote|wfh|hybrid/i.test(allText)) benefits.push("Flexible Work");
  if (/learning|training|budget|upskill/i.test(allText)) benefits.push("Learning Budget");
  if (/health|medical|insurance/i.test(allText)) benefits.push("Health Insurance");
  if (/relocation|relocat/i.test(allText)) benefits.push("Relocation Support");
  if (/notice.*buyout|early.*joining/i.test(allText)) benefits.push("Notice Buyout");

  // Grade
  const grade = improvement >= 15 ? "A" : improvement >= 10 ? "B+" : improvement >= 5 ? "B" : improvement > 0 ? "C+" : "C";
  const gradeColor = grade.startsWith("A") ? c.sage : grade.startsWith("B") ? c.gilt : c.ember;

  if (initialOffer === 0) return null;

  return (
    <div style={{
      width: "100%", borderRadius: 16,
      background: "rgba(212,179,127,0.03)",
      border: "1px solid rgba(212,179,127,0.12)",
      padding: "20px", display: "flex", flexDirection: "column", gap: 14,
      animation: "slideUp 0.5s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: font.display, fontSize: 14, fontWeight: 600, color: c.ivory }}>Deal Summary</span>
        <span style={{ fontFamily: font.ui, fontSize: 20, fontWeight: 700, color: gradeColor }}>{grade}</span>
      </div>

      {/* Numbers row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[
          { label: "Initial Offer", value: `₹${initialOffer} LPA`, color: c.stone },
          ...(candidateAsk > 0 ? [{ label: "Your Ask", value: `₹${candidateAsk} LPA`, color: c.chalk }] : []),
          { label: "Final Package", value: `₹${finalOffer} LPA`, color: c.gilt },
        ].map(item => (
          <div key={item.label} style={{ flex: 1, minWidth: 80, padding: "10px 12px", borderRadius: 10, background: "rgba(245,242,237,0.03)", border: "1px solid rgba(245,242,237,0.06)" }}>
            <p style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.label}</p>
            <p style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: item.color, margin: "4px 0 0" }}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Improvement */}
      {improvement !== 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, background: improvement > 0 ? "rgba(122,158,126,0.06)" : "rgba(196,112,90,0.06)", border: `1px solid ${improvement > 0 ? "rgba(122,158,126,0.15)" : "rgba(196,112,90,0.15)"}` }}>
          <span style={{ fontFamily: font.ui, fontSize: 18, fontWeight: 700, color: improvement > 0 ? c.sage : c.ember }}>
            {improvement > 0 ? "+" : ""}{improvement}%
          </span>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>
            {improvement > 0 ? "improvement from initial offer" : "below initial offer"}
          </span>
        </div>
      )}

      {/* Benefits negotiated */}
      {benefits.length > 0 && (
        <div>
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Benefits Discussed</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {benefits.map(b => (
              <span key={b} style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt, padding: "3px 8px", borderRadius: 6, background: "rgba(212,179,127,0.08)", border: "1px solid rgba(212,179,127,0.12)" }}>{b}</span>
            ))}
          </div>
        </div>
      )}

      {/* Negotiation Replay — try again with a different hiring manager style */}
      {onReplay && (
        <div>
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Replay with different style</p>
          <div style={{ display: "flex", gap: 8 }}>
            {([
              { style: "cooperative", label: "Friendly", emoji: "" },
              { style: "aggressive", label: "Tough", emoji: "" },
              { style: "defensive", label: "Evasive", emoji: "" },
            ] as const).map(s => (
              <button
                key={s.style}
                onClick={() => onReplay(s.style)}
                style={{
                  flex: 1, fontFamily: font.ui, fontSize: 11, fontWeight: 500,
                  padding: "8px 10px", borderRadius: 8,
                  background: "rgba(245,242,237,0.04)",
                  border: "1px solid rgba(245,242,237,0.08)",
                  color: c.chalk, cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

/* ─── Completion Card (done state) ─── */

export const CompletionCard = memo(function CompletionCard({ currentQuestionNum, elapsed, usedFallbackScore, evalTimedOut, evaluating, handleEnd, videoURL }: {
  currentQuestionNum: number; elapsed: number;
  usedFallbackScore: boolean; evalTimedOut: boolean;
  evaluating: boolean; handleEnd: () => void;
  videoURL?: string | null;
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
      {videoURL && (
        <div style={{ width: "100%", marginTop: 12 }}>
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginBottom: 6 }}>Your recording:</p>
          <video
            src={videoURL}
            controls
            playsInline
            style={{ width: "100%", borderRadius: 10, border: `1px solid ${c.border}` }}
          >
            <track kind="captions" />
          </video>
        </div>
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
});

/* ─── Micro-feedback on last answer ─── */

export const MicroFeedbackPanel = memo(function MicroFeedbackPanel({ transcript, microFeedback }: {
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
});

/* ─── Bottom Controls Bar ─── */

export const ControlsBar = memo(function ControlsBar({ isMuted, setIsMuted, aiVoiceEnabled, setAiVoiceEnabled, showTranscript, setShowTranscript, phase, ttsCancelRef, setShowEndModal, endModalTriggerRef, videoEnabled, onToggleVideo }: {
  isMuted: boolean; setIsMuted: (fn: (m: boolean) => boolean) => void;
  aiVoiceEnabled: boolean; setAiVoiceEnabled: (fn: (v: boolean) => boolean) => void;
  showTranscript: boolean; setShowTranscript: (fn: (t: boolean) => boolean) => void;
  phase: string;
  ttsCancelRef: React.MutableRefObject<(() => void) | null>;
  setShowEndModal: (v: boolean) => void;
  endModalTriggerRef: React.RefObject<HTMLSpanElement | null>;
  videoEnabled: boolean; onToggleVideo: () => void;
}) {
  return (
    <footer className="iv-controls" style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "10px 24px", gap: 12,
      borderTop: "1px solid rgba(245,242,237,0.04)",
      background: "rgba(6,6,7,0.6)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
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
      <ControlButton
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {videoEnabled ? (
              <>
                <polygon points="23 7 16 12 23 17 23 7"/>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </>
            ) : (
              <>
                <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </>
            )}
          </svg>
        }
        label={videoEnabled ? "Stop camera" : "Start camera"}
        active={videoEnabled}
        onClick={onToggleVideo}
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
});

/* ─── Transcript Filter Buttons (panel mode) ─── */
const TranscriptFilters = memo(function TranscriptFilters({ panelMembers, activeFilter, setActiveFilter }: {
  panelMembers: PanelMember[]; activeFilter: string; setActiveFilter: (v: string) => void;
}) {
  const filters = [{ label: "All", value: "all", color: c.ivory }, ...panelMembers.map(m => ({ label: m.name.split(" ")[0], value: m.title, color: m.color }))];
  return (
    <div style={{ display: "flex", gap: 4, padding: "8px 20px", borderBottom: `1px solid ${c.border}`, overflow: "auto" }}>
      {filters.map(f => (
        <button key={f.value} onClick={() => setActiveFilter(f.value)} style={{
          fontFamily: font.ui, fontSize: 10, fontWeight: 600, padding: "3px 10px",
          borderRadius: 100, border: `1px solid ${activeFilter === f.value ? `${f.color}40` : "transparent"}`,
          background: activeFilter === f.value ? `${f.color}12` : "transparent",
          color: activeFilter === f.value ? f.color : c.stone,
          cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.2s",
        }}>
          {f.label}
        </button>
      ))}
    </div>
  );
});

/* ─── Transcript Slide-Over Panel ─── */

export const TranscriptPanel = memo(function TranscriptPanel({ transcript, interviewerName, setShowTranscript, transcriptRef, panelMembers }: {
  transcript: { speaker: "ai" | "user"; text: string; time: string }[];
  interviewerName: string;
  setShowTranscript: (v: boolean) => void;
  transcriptRef: React.RefObject<HTMLDivElement | null>;
  panelMembers?: PanelMember[];
}) {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 600px)").matches);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 600px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Panel transcript filter
  const [transcriptFilter, setTranscriptFilter] = useState("all");
  const filteredTranscript = transcriptFilter === "all" ? transcript : transcript.filter(msg => {
    if (msg.speaker === "user") return true; // always show user answers
    const match = msg.text.match(/^\[(.+?)\]/);
    return match ? match[1].toLowerCase() === transcriptFilter.toLowerCase() : true;
  });

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- modal backdrop dismissal */}
      <div
        onClick={() => setShowTranscript(false)}
        style={{
          position: "fixed", inset: 0, zIndex: 49,
          background: isMobile ? "transparent" : "rgba(0,0,0,0.5)",
          backdropFilter: isMobile ? "none" : "blur(2px)",
          WebkitBackdropFilter: isMobile ? "none" : "blur(2px)",
          animation: "fadeUp 0.15s ease",
        }}
      />
      <div className="iv-transcript-panel" style={isMobile ? {
        position: "fixed", bottom: 0, left: 0, right: 0,
        maxHeight: "40vh",
        background: c.graphite,
        borderTop: `1px solid ${c.border}`,
        borderRadius: "16px 16px 0 0",
        display: "flex", flexDirection: "column",
        zIndex: 50, animation: "slideUpSheet 0.25s ease",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.3)",
      } : {
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 380, maxWidth: "100vw",
        background: c.graphite,
        borderLeft: `1px solid ${c.border}`,
        display: "flex", flexDirection: "column",
        zIndex: 50, animation: "slideInRight 0.25s ease",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.3)",
      }}>
        {/* Drag handle (mobile only, decorative) */}
        {isMobile && (
          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 0" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
          </div>
        )}
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${c.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Transcript</span>
          <button onClick={() => setShowTranscript(false)} aria-label="Close transcript" style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 4 }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {/* Panel filter buttons */}
        {panelMembers && panelMembers.length > 0 && (
          <TranscriptFilters panelMembers={panelMembers} activeFilter={transcriptFilter} setActiveFilter={setTranscriptFilter} />
        )}
        <div ref={transcriptRef} aria-live="polite" aria-label="Interview transcript" style={{ flex: 1, overflow: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {transcript.length === 0 && (
            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, textAlign: "center", padding: "40px 0" }}>Transcript will appear here...</p>
          )}
          {filteredTranscript.map((msg, i) => (
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
                  <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: msg.speaker === "ai" ? ((() => { if (panelMembers) { const match = msg.text.match(/^\[(.+?)\]/); if (match) { const member = panelMembers.find(m => m.title.toLowerCase() === match[1].toLowerCase()); if (member) return member.color; } } return c.gilt; })()) : c.sage }}>
                    {msg.speaker === "ai" ? ((() => { if (panelMembers) { const match = msg.text.match(/^\[(.+?)\]/); if (match) { const member = panelMembers.find(m => m.title.toLowerCase() === match[1].toLowerCase()); if (member) return member.name; } } return interviewerName; })()) : "You"}
                  </span>
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>{msg.time}</span>
                </div>
                <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.55, margin: 0, wordBreak: "break-word", overflowWrap: "break-word" }}>{panelMembers && msg.speaker === "ai" ? msg.text.replace(/^\[.+?\]\s*/, "") : msg.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
});

/* ─── End Interview Modal ─── */

export const EndModal = memo(function EndModal({ currentQuestionNum, totalQuestions, isOffline, handleEnd, setShowEndModal, endModalTriggerRef }: {
  currentQuestionNum: number; totalQuestions: number; isOffline: boolean;
  handleEnd: () => void; setShowEndModal: (v: boolean) => void;
  endModalTriggerRef: React.RefObject<HTMLSpanElement | null>;
}) {
  const closeFocus = () => { setShowEndModal(false); endModalTriggerRef.current?.querySelector("button")?.focus(); };
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- dialog needs click/keyboard handlers for dismissal and focus trap
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
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
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
});

/* ─── Evaluating Overlay ─── */

export const EvaluatingOverlay = memo(function EvaluatingOverlay({ usedFallbackScore, evalTimedOut, evalElapsed, saveWarning, setEvalTimedOut, setUsedFallbackScore, setEvaluating, interviewEndedRef, handleEnd, lastSessionId, navigate }: {
  usedFallbackScore: boolean; evalTimedOut: boolean; evalElapsed: number; saveWarning: string;
  setEvalTimedOut: (v: boolean) => void; setUsedFallbackScore: (v: boolean) => void;
  setEvaluating: (v: boolean) => void;
  interviewEndedRef: React.MutableRefObject<boolean>;
  handleEnd: () => void;
  lastSessionId: string | null;
  navigate: (path: string) => void;
}) {
  const retryCountRef = useRef(0);
  const maxRetries = 2;
  const canRetry = retryCountRef.current < maxRetries;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
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
            {canRetry
              ? "Your session has been saved with an estimated score. You can retry the AI evaluation or continue to your results."
              : "AI evaluation failed after multiple attempts. Your session is saved with an estimated score based on session metrics."}
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            {canRetry && (
            <button
              onClick={() => { retryCountRef.current++; setEvalTimedOut(false); setUsedFallbackScore(false); setEvaluating(false); interviewEndedRef.current = false; handleEnd(); }}
              style={{
                fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory,
                background: "rgba(212,179,127,0.1)", border: "1px solid rgba(212,179,127,0.2)",
                borderRadius: 10, padding: "10px 20px", cursor: "pointer", transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.1)"; }}
            >
              Retry Evaluation{retryCountRef.current > 0 ? ` (${maxRetries - retryCountRef.current} left)` : ""}
            </button>
            )}
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
});
