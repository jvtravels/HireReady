import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { getSessionById, saveFeedback, getSessionFeedback, type SessionRecord } from "./supabase";
import { useToast } from "./Toast";

const RESULTS_KEY = "hirloop_sessions";

function scoreLabelColor(score: number) {
  if (score >= 85) return c.sage;
  if (score >= 70) return c.gilt;
  return c.ember;
}

function scoreLabel(score: number) {
  if (score >= 85) return "Strong";
  if (score >= 70) return "Good";
  return "Developing";
}

function scoreTip(score: number) {
  if (score >= 85) return "Strong: Interview-ready performance";
  if (score >= 70) return "Good: Solid foundation, minor areas to refine";
  return "Developing: Key areas need practice before interviews";
}

function normalizeType(type: string): string {
  const map: Record<string, string> = {
    behavioral: "Behavioral", strategic: "Strategic",
    "technical-leadership": "Technical Leadership", "case-study": "Case Study",
    technical: "Technical", case: "Case Study",
  };
  return map[type] || type;
}

interface LocalSession {
  id: string;
  date: string;
  type: string;
  difficulty: string;
  focus: string;
  duration: number;
  score: number;
  questions: number;
  transcript?: { speaker: string; text: string; time?: string }[];
  ai_feedback?: string;
  skill_scores?: Record<string, number> | null;
  ideal_answers?: { question: string; ideal: string; candidateSummary: string }[];
}

function loadLocalSession(id: string): LocalSession | null {
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    if (!raw) return null;
    const sessions: LocalSession[] = JSON.parse(raw);
    return sessions.find(s => s.id === id) || null;
  } catch {
    return null;
  }
}

function loadPreviousSession(currentId: string): LocalSession | null {
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    if (!raw) return null;
    const sessions: LocalSession[] = JSON.parse(raw);
    const sorted = [...sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const idx = sorted.findIndex(s => s.id === currentId);
    return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
  } catch {
    return null;
  }
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [session, setSession] = useState<LocalSession | null>(null);
  const [prevSession, setPrevSession] = useState<LocalSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<"helpful" | "too_harsh" | "too_generous" | "inaccurate" | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);

  // Load existing feedback (guard against race conditions when switching sessions)
  useEffect(() => {
    if (!id || !user?.id) return;
    let cancelled = false;
    getSessionFeedback(id, user.id).then(fb => {
      if (cancelled) return;
      if (fb) {
        setFeedbackRating(fb.rating);
        setFeedbackComment(fb.comment || "");
        setFeedbackSaved(true);
      }
    }).catch(() => {});
    // Also check localStorage fallback
    try {
      const localFb = localStorage.getItem(`hirloop_feedback_${id}`);
      if (localFb) {
        const parsed = JSON.parse(localFb);
        setFeedbackRating(parsed.rating);
        setFeedbackComment(parsed.comment || "");
        setFeedbackSaved(true);
      }
    } catch {}
    return () => { cancelled = true; };
  }, [id, user?.id]);

  const submitFeedback = useCallback(async (rating: "helpful" | "too_harsh" | "too_generous" | "inaccurate") => {
    if (!id || !session) return;
    setFeedbackRating(rating);
    const feedbackData = {
      id: `fb_${id}`,
      user_id: user?.id || "anonymous",
      session_id: id,
      rating,
      comment: feedbackComment,
      session_score: session.score,
      session_type: session.type,
    };
    // Save to localStorage always (works offline)
    try { localStorage.setItem(`hirloop_feedback_${id}`, JSON.stringify(feedbackData)); } catch {}
    // Save to Supabase if available
    if (user?.id) {
      try { await saveFeedback(feedbackData); } catch { /* localStorage fallback already saved above */ }
    }
    setFeedbackSaved(true);
    toast("Feedback saved — thank you!", "success");
  }, [id, session, user?.id, feedbackComment, toast]);

  const submitComment = useCallback(async () => {
    if (!id || !session || !feedbackRating) return;
    const feedbackData = {
      id: `fb_${id}`,
      user_id: user?.id || "anonymous",
      session_id: id,
      rating: feedbackRating,
      comment: feedbackComment,
      session_score: session.score,
      session_type: session.type,
    };
    try { localStorage.setItem(`hirloop_feedback_${id}`, JSON.stringify(feedbackData)); } catch {}
    if (user?.id) {
      try { await saveFeedback(feedbackData); } catch { /* localStorage fallback already saved above */ }
    }
    setShowFeedbackForm(false);
  }, [id, session, user?.id, feedbackRating, feedbackComment]);

  useEffect(() => {
    if (!id) { setLoading(false); return; }

    // Try localStorage first
    const local = loadLocalSession(id);
    if (local) {
      setSession(local);
      setPrevSession(loadPreviousSession(id));
      setLoading(false);
      return;
    }

    // Try Supabase
    if (user?.id) {
      getSessionById(id, user.id).then(record => {
        if (record) {
          setSession({
            id: record.id,
            date: record.date,
            type: record.type,
            difficulty: record.difficulty,
            focus: record.focus,
            duration: record.duration,
            score: record.score,
            questions: record.questions,
            transcript: record.transcript,
            ai_feedback: record.ai_feedback,
            skill_scores: record.skill_scores,
          });
        }
        setLoading(false);
      }).catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [id, user?.id]);

  const dateObj = session ? new Date(session.date) : null;
  const dateLabel = dateObj ? dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  const durationMin = session ? Math.ceil(session.duration / 60) : 0;
  const type = session ? normalizeType(session.type) : "";

  const generateExportText = useCallback(() => {
    if (!session) return "";
    const lines = [
      "HIRLOOP — SESSION REPORT",
      "━".repeat(40),
      `Type: ${type}`,
      `Date: ${dateLabel}`,
      `Duration: ${durationMin} min`,
      `Difficulty: ${session.difficulty}`,
      `Score: ${session.score}/100 (${scoreLabel(session.score)})`,
      "",
    ];
    if (session.skill_scores) {
      lines.push("SKILL SCORES");
      Object.entries(session.skill_scores).forEach(([name, score]) => {
        lines.push(`  ${name}: ${score}/100`);
      });
      lines.push("");
    }
    if (session.transcript && session.transcript.length > 0) {
      lines.push("TRANSCRIPT");
      session.transcript.forEach(msg => {
        lines.push(`${msg.speaker === "ai" ? "INTERVIEWER" : "CANDIDATE"}: ${msg.text}`);
        lines.push("");
      });
    }
    if (session.ai_feedback) {
      lines.push("AI FEEDBACK");
      lines.push(session.ai_feedback);
      lines.push("");
    }
    if (session.ideal_answers && session.ideal_answers.length > 0) {
      lines.push("IDEAL ANSWERS");
      session.ideal_answers.forEach((item, i) => {
        lines.push(`Q${i + 1}: ${item.question}`);
        lines.push(`  Your answer: ${item.candidateSummary}`);
        lines.push(`  Ideal approach: ${item.ideal}`);
        lines.push("");
      });
    }
    lines.push("━".repeat(40));
    lines.push("Generated by Hirloop");
    return lines.join("\n");
  }, [session, type, dateLabel, durationMin]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(generateExportText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [generateExportText]);

  const handleDownload = useCallback(() => {
    if (!session) return;
    const blob = new Blob([generateExportText()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Hirloop_Session_${session.date.split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [generateExportText, session]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: c.obsidian, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 40, height: 40, border: `2px solid ${c.border}`, borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ minHeight: "100vh", background: c.obsidian, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: font.ui }}>
        <p style={{ fontSize: 18, color: c.ivory, marginBottom: 8 }}>Session not found</p>
        <p style={{ fontSize: 13, color: c.stone, marginBottom: 24 }}>This session may have been deleted or the link is invalid.</p>
        <button onClick={() => navigate("/dashboard")} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, fontFamily: font.ui, padding: "40px 24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <button onClick={() => { if (window.history.length > 1) navigate(-1); else navigate("/dashboard"); }} style={{
            display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: c.stone,
            background: "none", border: "none", cursor: "pointer", outline: "none",
          }}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleCopy} aria-label="Copy report to clipboard" style={{
              padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: copied ? "rgba(122,158,126,0.1)" : "transparent",
              border: `1px solid ${copied ? "rgba(122,158,126,0.3)" : c.border}`,
              color: copied ? c.sage : c.stone,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.2s ease",
            }}>
              {copied ? (
                <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              )}
              {copied ? "Copied!" : "Copy"}
            </button>
            <button onClick={handleDownload} aria-label="Download session report" style={{
              padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: "transparent", border: `1px solid ${c.border}`, color: c.stone,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.2s ease",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(245,242,237,0.06)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download
            </button>
          </div>
        </div>

        {/* Score celebration + upgrade trigger */}
        {session.score >= 85 && (
          <div style={{ background: "linear-gradient(135deg, rgba(122,158,126,0.08) 0%, rgba(212,179,127,0.06) 100%)", borderRadius: 14, border: `1px solid rgba(122,158,126,0.2)`, padding: "20px 28px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ fontSize: 28 }}>🎉</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.sage, marginBottom: 2 }}>Outstanding Performance!</p>
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, margin: 0 }}>
                You scored {session.score} — that's interview-ready! {user && (!user.subscriptionTier || user.subscriptionTier === "free") ? "Unlock unlimited sessions to maintain this level." : "Keep up the momentum."}
              </p>
            </div>
            {user && (!user.subscriptionTier || user.subscriptionTier === "free") && (
              <button onClick={() => { window.location.href = "/#pricing"; }}
                style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, padding: "9px 20px", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian, cursor: "pointer", whiteSpace: "nowrap" }}>
                Upgrade & Keep Going
              </button>
            )}
          </div>
        )}

        {/* Session summary card */}
        <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "28px 32px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.gilt, background: "rgba(212,179,127,0.08)", padding: "4px 10px", borderRadius: 4 }}>{type}</span>
                <span style={{ fontSize: 13, color: c.stone }}>{dateLabel} · {durationMin} min</span>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>{session.focus || type} Interview</h2>
              {session.difficulty && <span style={{ fontSize: 12, color: c.stone, textTransform: "capitalize" }}>{session.difficulty} difficulty</span>}
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", border: `3px solid ${scoreLabelColor(session.score)}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 700, color: c.ivory, lineHeight: 1 }}>{session.score}</span>
                <span title={scoreTip(session.score)} style={{ fontSize: 10, fontWeight: 600, color: scoreLabelColor(session.score), marginTop: 2, cursor: "help" }}>{scoreLabel(session.score)}</span>
              </div>
            </div>
          </div>

          {/* Skill scores */}
          {session.skill_scores && Object.keys(session.skill_scores).length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 16 }}>
              {Object.entries(session.skill_scores).map(([name, raw]) => {
                const score = typeof raw === "object" && raw !== null && "score" in (raw as any) ? (raw as any).score : raw;
                if (typeof score !== "number" || isNaN(score)) return null;
                return (
                <div key={name} style={{ padding: "12px 14px", borderRadius: 10, background: c.obsidian, border: `1px solid ${c.border}` }}>
                  <span style={{ fontSize: 11, color: c.stone, display: "block", marginBottom: 6 }}>{name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: c.border }}>
                      <div style={{ width: `${score}%`, height: "100%", borderRadius: 2, background: scoreLabelColor(score) }} />
                    </div>
                    <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 600, color: c.ivory }}>{score}</span>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Answer vs Ideal Comparison */}
        {session.ideal_answers && session.ideal_answers.length > 0 && (
          <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "28px 32px", marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: c.ivory, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
              Answer vs Ideal
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {session.ideal_answers.map((item, i) => (
                <div key={i} style={{ borderRadius: 10, border: `1px solid ${c.border}`, overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", background: "rgba(212,179,127,0.04)", borderBottom: `1px solid ${c.border}` }}>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>{item.question}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 0 }}>
                    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${c.border}` }}>
                      <span style={{ fontFamily: font.ui, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: c.stone, display: "block", marginBottom: 6 }}>Your Answer</span>
                      <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.6, margin: 0 }}>{item.candidateSummary}</p>
                    </div>
                    <div style={{ padding: "12px 16px", background: "rgba(122,158,126,0.03)" }}>
                      <span style={{ fontFamily: font.ui, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: c.sage, display: "block", marginBottom: 6 }}>Ideal Approach</span>
                      <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.6, margin: 0 }}>{item.ideal}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transcript */}
        {session.transcript && session.transcript.length > 0 && (
          <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "28px 32px", marginBottom: 20, maxWidth: "100ch" }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: c.ivory, marginBottom: 20 }}>Full Transcript</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {session.transcript.map((msg, i) => (
                <div key={i} style={{ display: "flex", gap: 12, flexDirection: msg.speaker === "user" ? "row-reverse" : "row" }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    background: msg.speaker === "ai" ? "rgba(212,179,127,0.1)" : "rgba(122,158,126,0.1)",
                    border: `1px solid ${msg.speaker === "ai" ? "rgba(212,179,127,0.2)" : "rgba(122,158,126,0.2)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {msg.speaker === "ai" ? (
                      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2m-9-11h2m18 0h2M5.6 5.6l1.4 1.4m9.9 9.9l1.4 1.4M5.6 18.4l1.4-1.4m9.9-9.9l1.4-1.4"/></svg>
                    ) : (
                      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    )}
                  </div>
                  <div style={{ maxWidth: "75%", minWidth: 0 }}>
                    <div style={{
                      padding: "12px 16px", borderRadius: 12, fontSize: 13, color: c.chalk, lineHeight: 1.6,
                      background: msg.speaker === "ai" ? c.obsidian : "rgba(122,158,126,0.04)",
                      border: `1px solid ${msg.speaker === "ai" ? c.border : "rgba(122,158,126,0.1)"}`,
                      borderTopLeftRadius: msg.speaker === "ai" ? 4 : 12,
                      borderTopRightRadius: msg.speaker === "user" ? 4 : 12,
                    }}>
                      {msg.text}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Feedback — structured */}
        {session.ai_feedback && (
          <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "28px 32px", marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: c.ivory, marginBottom: 16 }}>AI Coach Summary</h3>
            {(() => {
              const feedback = session.ai_feedback;
              const strengths: string[] = [];
              const improvements: string[] = [];
              const tips: string[] = [];

              // Try to parse structured feedback from sentences
              const sentences = feedback.split(/(?<=[.!])\s+/).filter(Boolean);
              for (const s of sentences) {
                const lower = s.toLowerCase();
                if (lower.includes("strong") || lower.includes("excellent") || lower.includes("well") || lower.includes("good") || lower.includes("clear") || lower.includes("solid")) {
                  strengths.push(s.trim());
                } else if (lower.includes("improve") || lower.includes("work on") || lower.includes("could") || lower.includes("try") || lower.includes("consider") || lower.includes("recommend")) {
                  improvements.push(s.trim());
                } else {
                  tips.push(s.trim());
                }
              }

              // If parsing didn't work well, just show the raw feedback
              if (strengths.length === 0 && improvements.length === 0) {
                return <p style={{ fontSize: 14, color: c.chalk, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{feedback}</p>;
              }

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {strengths.length > 0 && (
                    <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(122,158,126,0.04)", border: `1px solid rgba(122,158,126,0.12)`, borderLeft: `3px solid ${c.sage}` }}>
                      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.sage, display: "block", marginBottom: 6 }}>Strengths</span>
                      {strengths.map((s, i) => <p key={i} style={{ fontSize: 13, color: c.chalk, lineHeight: 1.6, margin: i > 0 ? "4px 0 0" : 0 }}>{s}</p>)}
                    </div>
                  )}
                  {improvements.length > 0 && (
                    <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(196,112,90,0.04)", border: `1px solid rgba(196,112,90,0.12)`, borderLeft: `3px solid ${c.ember}` }}>
                      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.ember, display: "block", marginBottom: 6 }}>Areas to Improve</span>
                      {improvements.map((s, i) => <p key={i} style={{ fontSize: 13, color: c.chalk, lineHeight: 1.6, margin: i > 0 ? "4px 0 0" : 0 }}>{s}</p>)}
                    </div>
                  )}
                  {tips.length > 0 && (
                    <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(212,179,127,0.04)", border: `1px solid rgba(212,179,127,0.12)`, borderLeft: `3px solid ${c.gilt}` }}>
                      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.gilt, display: "block", marginBottom: 6 }}>Tips</span>
                      {tips.map((s, i) => <p key={i} style={{ fontSize: 13, color: c.chalk, lineHeight: 1.6, margin: i > 0 ? "4px 0 0" : 0 }}>{s}</p>)}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Feedback on AI Evaluation */}
        {session.ai_feedback && (
          <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 32px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.stone }}>
                {feedbackSaved ? "Thanks for your feedback!" : "Was this evaluation helpful?"}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                {(["helpful", "too_harsh", "too_generous", "inaccurate"] as const).map((rating) => {
                  const labels: Record<string, { icon: string; text: string }> = {
                    helpful: { icon: "\u{1F44D}", text: "Helpful" },
                    too_harsh: { icon: "\u{1F4CF}", text: "Too harsh" },
                    too_generous: { icon: "\u{1F389}", text: "Too generous" },
                    inaccurate: { icon: "\u{1F6A9}", text: "Inaccurate" },
                  };
                  const { icon, text } = labels[rating];
                  const isSelected = feedbackRating === rating;
                  return (
                    <button
                      key={rating}
                      onClick={() => { submitFeedback(rating); setShowFeedbackForm(true); }}
                      aria-pressed={isSelected}
                      style={{
                        fontFamily: font.ui, fontSize: 11, fontWeight: 500, padding: "6px 12px",
                        borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                        border: `1px solid ${isSelected ? "rgba(212,179,127,0.3)" : c.border}`,
                        background: isSelected ? "rgba(212,179,127,0.08)" : "transparent",
                        color: isSelected ? c.gilt : c.stone,
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span>{icon}</span>{text}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Optional comment */}
            {showFeedbackForm && feedbackRating && (
              <div style={{ marginTop: 12, display: "flex", gap: 8, animation: "fadeUp 0.2s ease" }}>
                <input
                  type="text"
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  placeholder="Any details? (optional)"
                  maxLength={500}
                  style={{
                    flex: 1, fontFamily: font.ui, fontSize: 12, color: c.chalk,
                    background: c.obsidian, border: `1px solid ${c.border}`, borderRadius: 10,
                    padding: "8px 12px", outline: "none",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(212,179,127,0.3)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = c.border; }}
                  onKeyDown={(e) => { if (e.key === "Enter") submitComment(); }}
                />
                <button
                  onClick={submitComment}
                  style={{
                    fontFamily: font.ui, fontSize: 11, fontWeight: 600, padding: "8px 16px",
                    borderRadius: 10, border: "none", background: c.gilt, color: c.obsidian,
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  Save
                </button>
              </div>
            )}
          </div>
        )}

        {/* Session Comparison */}
        {prevSession && (
          <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "24px 32px", marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              vs Previous Session
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { label: "Score", current: session.score, prev: prevSession.score, suffix: "" },
                { label: "Duration", current: Math.ceil(session.duration / 60), prev: Math.ceil(prevSession.duration / 60), suffix: "m" },
                { label: "Questions", current: session.questions, prev: prevSession.questions, suffix: "" },
              ].map((m) => {
                const diff = m.current - m.prev;
                return (
                  <div key={m.label} style={{ padding: "12px", borderRadius: 10, background: c.obsidian, border: `1px solid ${c.border}`, textAlign: "center" }}>
                    <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, display: "block", marginBottom: 4 }}>{m.label}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 20, fontWeight: 600, color: c.ivory, display: "block" }}>{m.current}{m.suffix}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 11, color: diff > 0 ? c.sage : diff < 0 ? c.ember : c.stone, fontWeight: 600 }}>
                      {diff > 0 ? `+${diff}` : diff === 0 ? "—" : diff}{m.suffix}
                    </span>
                  </div>
                );
              })}
            </div>
            {session.skill_scores && prevSession.skill_scores && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(session.skill_scores).map(([skill, raw]) => {
                  const score = typeof raw === "object" && raw !== null && "score" in (raw as any) ? (raw as any).score : raw;
                  const prevRaw = (prevSession.skill_scores as Record<string, any>)?.[skill];
                  const prevScore = typeof prevRaw === "object" && prevRaw !== null && "score" in prevRaw ? prevRaw.score : prevRaw;
                  if (prevScore === undefined || typeof score !== "number") return null;
                  const diff = score - (typeof prevScore === "number" ? prevScore : 0);
                  return (
                    <div key={skill} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, flex: 1 }}>{skill}</span>
                      <span style={{ fontFamily: font.mono, fontSize: 11, color: c.ivory, width: 24, textAlign: "right" }}>{score}</span>
                      <span style={{ fontFamily: font.mono, fontSize: 10, color: diff > 0 ? c.sage : diff < 0 ? c.ember : c.stone, width: 30, textAlign: "right", fontWeight: 600 }}>
                        {diff > 0 ? `+${diff}` : diff === 0 ? "—" : diff}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Recommended Next Session */}
        {(() => {
          const weakest = session.skill_scores
            ? Object.entries(session.skill_scores).map(([k, v]) => [k, typeof v === "object" && v !== null && "score" in (v as any) ? (v as any).score : v] as [string, number]).sort(([,a], [,b]) => a - b)[0]
            : null;
          const nextType = session.type === "behavioral" ? "case-study" : session.type === "case-study" ? "technical" : "behavioral";
          const nextDifficulty = session.score >= 85 ? "intense" : session.score < 70 ? "warmup" : "standard";
          return (
            <div style={{ background: `linear-gradient(135deg, rgba(212,179,127,0.06) 0%, ${c.graphite} 100%)`, borderRadius: 14, border: `1px solid rgba(212,179,127,0.12)`, padding: "24px 32px", marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 8 }}>What's Next?</h3>
              {weakest && (
                <p style={{ fontSize: 13, color: c.stone, lineHeight: 1.5, marginBottom: 16 }}>
                  Your <strong style={{ color: c.chalk }}>{weakest[0]}</strong> scored {weakest[1] as number} — focus a session on this to improve fastest.
                </p>
              )}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {weakest && (
                  <button onClick={() => navigate(`/session/new?type=${session.type}&focus=${weakest[0].toLowerCase().replace(/\s+/g, "-")}`)}
                    style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, padding: "10px 22px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="5,3 19,12 5,21"/></svg>
                    Practice {weakest[0]}
                  </button>
                )}
                <button onClick={() => navigate(`/session/new?type=${nextType}&difficulty=${nextDifficulty}`)}
                  style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, padding: "10px 22px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.chalk, cursor: "pointer" }}>
                  Try {normalizeType(nextType)}
                </button>
                <button onClick={() => navigate("/dashboard")}
                  style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, padding: "10px 22px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.stone, cursor: "pointer" }}>
                  Back to Dashboard
                </button>
              </div>
            </div>
          );
        })()}

        {/* Upgrade CTA for free users */}
        {user && (!user.subscriptionTier || user.subscriptionTier === "free") && (
          <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid rgba(212,179,127,0.15)`, padding: "20px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <p style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Unlock Unlimited Practice</p>
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, margin: 0 }}>Get unlimited sessions, detailed analytics, and priority AI feedback.</p>
            </div>
            <button onClick={() => { window.location.href = "/#pricing"; }}
              style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, padding: "10px 24px", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian, cursor: "pointer", whiteSpace: "nowrap" }}>
              Upgrade Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
