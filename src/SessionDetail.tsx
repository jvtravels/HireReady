import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { c, font, shadow, gradient } from "./tokens";
import { useAuth } from "./AuthContext";
import { getSessionById, saveFeedback, getSessionFeedback } from "./supabase";
import { useToast } from "./Toast";

const RESULTS_KEY = "hirestepx_sessions";

/* ─── Helpers ─── */

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
    "campus-placement": "Campus Placement", "hr-round": "HR Round",
    management: "Management", "government-psu": "Government & PSU",
    teaching: "Teaching",
  };
  return map[type] || type;
}

function ratingBadge(rating: string | undefined): { label: string; color: string; bg: string } {
  switch (rating) {
    case "strong": return { label: "Strong", color: c.sage, bg: "rgba(122,158,126,0.1)" };
    case "good": return { label: "Good", color: c.gilt, bg: "rgba(212,179,127,0.1)" };
    case "partial": return { label: "Partial", color: "#E89B5A", bg: "rgba(232,155,90,0.1)" };
    case "weak": return { label: "Weak", color: c.ember, bg: "rgba(196,112,90,0.1)" };
    default: return { label: "Reviewed", color: c.stone, bg: "rgba(142,137,131,0.1)" };
  }
}

/* ─── Speech metrics computed from transcript ─── */

const FILLER_WORDS = ["um", "uh", "like", "you know", "basically", "actually", "literally", "right", "so", "well", "i mean", "kind of", "sort of"];
const HEDGING_PHRASES = ["i think", "i guess", "maybe", "probably", "i believe", "perhaps", "not sure", "i suppose", "might be", "could be"];
const POWER_WORDS = ["achieved", "led", "built", "delivered", "increased", "reduced", "launched", "drove", "improved", "designed", "implemented", "scaled", "optimized", "managed", "created", "transformed"];

function computeSpeechMetrics(transcript: { speaker: string; text: string; time?: string }[] | undefined, durationSec: number) {
  if (!transcript || transcript.length === 0) return null;
  const userEntries = transcript.filter(t => t.speaker === "user");
  if (userEntries.length === 0) return null;

  const userText = userEntries.map(t => t.text).join(" ");
  const words = userText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const userMinutes = Math.max(1, durationSec / 60 * 0.5); // ~50% of time is user speaking

  // Filler words
  let fillerCount = 0;
  for (const filler of FILLER_WORDS) {
    const regex = new RegExp(`\\b${filler}\\b`, "gi");
    const matches = userText.match(regex);
    if (matches) fillerCount += matches.length;
  }
  const fillerPerMin = fillerCount / userMinutes;

  // Speaking pace (words per minute)
  const pace = Math.round(wordCount / userMinutes);

  // Silence ratio — approximate from answer lengths vs total time
  const estimatedSpeakingTime = (wordCount / 150) * 60; // at 150 wpm
  const silenceRatio = Math.max(0, Math.min(100, Math.round((1 - estimatedSpeakingTime / Math.max(1, durationSec * 0.5)) * 100)));

  // Energy — based on word variety and sentence length variation
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  const vocabularyRichness = (uniqueWords.size / Math.max(1, wordCount)) * 100;
  const energy = Math.min(100, Math.round(vocabularyRichness * 1.5 + Math.min(30, wordCount / 10)));

  // Per-filler breakdown
  const fillerBreakdown: { word: string; count: number }[] = [];
  for (const filler of FILLER_WORDS) {
    const regex = new RegExp(`\\b${filler}\\b`, "gi");
    const matches = userText.match(regex);
    if (matches && matches.length > 0) fillerBreakdown.push({ word: filler, count: matches.length });
  }
  fillerBreakdown.sort((a, b) => b.count - a.count);

  // Hedging language detection
  const lowerText = userText.toLowerCase();
  let hedgingCount = 0;
  const hedgingBreakdown: { phrase: string; count: number }[] = [];
  for (const phrase of HEDGING_PHRASES) {
    const regex = new RegExp(`\\b${phrase}\\b`, "gi");
    const matches = userText.match(regex);
    if (matches && matches.length > 0) {
      hedgingCount += matches.length;
      hedgingBreakdown.push({ phrase, count: matches.length });
    }
  }
  hedgingBreakdown.sort((a, b) => b.count - a.count);

  // Power words / action verbs count
  let powerWordCount = 0;
  for (const pw of POWER_WORDS) {
    const regex = new RegExp(`\\b${pw}\\w*\\b`, "gi");
    const matches = userText.match(regex);
    if (matches) powerWordCount += matches.length;
  }

  // Confidence score (0-100): combines vocabulary, structure, power words, anti-hedging
  const fillerPenalty = Math.min(30, fillerPerMin * 5);
  const hedgingPenalty = Math.min(20, hedgingCount * 3);
  const powerBonus = Math.min(20, powerWordCount * 4);
  const lengthBonus = Math.min(15, (wordCount / Math.max(1, userEntries.length) / 50) * 15); // ~50 words/answer = full bonus
  const confidence = Math.max(0, Math.min(100, Math.round(50 + powerBonus + lengthBonus - fillerPenalty - hedgingPenalty + vocabularyRichness * 0.2)));

  // Per-answer word counts for response consistency
  const answerLengths = userEntries.map(e => e.text.split(/\s+/).filter(Boolean).length);
  const avgAnswerLength = Math.round(answerLengths.reduce((a, b) => a + b, 0) / answerLengths.length);
  const answerConsistency = answerLengths.length > 1
    ? Math.round(100 - (Math.sqrt(answerLengths.reduce((sum, len) => sum + Math.pow(len - avgAnswerLength, 2), 0) / answerLengths.length) / avgAnswerLength * 100))
    : 100;

  return {
    fillerCount, fillerPerMin: Math.round(fillerPerMin * 10) / 10, pace, silenceRatio, energy, wordCount, fillerBreakdown,
    hedgingCount, hedgingBreakdown, powerWordCount, confidence: Math.max(0, Math.min(100, answerConsistency > 0 ? confidence : confidence - 10)),
    avgAnswerLength, answerConsistency: Math.max(0, Math.min(100, answerConsistency)),
  };
}

/* ─── Compute historical averages from localStorage for benchmarking ─── */
function computeHistoricalAverages(): { avgScore: number; avgSkills: Record<string, number>; count: number } | null {
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    if (!raw) return null;
    const sessions: LocalSession[] = JSON.parse(raw);
    if (sessions.length < 2) return null;

    const avgScore = Math.round(sessions.reduce((s, sess) => s + sess.score, 0) / sessions.length);
    const skillTotals: Record<string, { sum: number; count: number }> = {};
    for (const sess of sessions) {
      if (!sess.skill_scores) continue;
      for (const [name, raw] of Object.entries(sess.skill_scores)) {
        const score = typeof raw === "object" && raw !== null && "score" in (raw as any) ? (raw as any).score : raw;
        if (typeof score !== "number") continue;
        if (!skillTotals[name]) skillTotals[name] = { sum: 0, count: 0 };
        skillTotals[name].sum += score;
        skillTotals[name].count++;
      }
    }
    const avgSkills: Record<string, number> = {};
    for (const [name, { sum, count }] of Object.entries(skillTotals)) {
      avgSkills[name] = Math.round((sum / count) * 100) / 100;
    }
    return { avgScore, avgSkills, count: sessions.length };
  } catch { return null; }
}

/* ─── Types ─── */

interface IdealAnswer {
  question: string;
  ideal: string;
  candidateSummary: string;
  rating?: string;
  workedWell?: string;
  toImprove?: string;
  starBreakdown?: Record<string, string>;
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
  skill_scores?: Record<string, number | { score: number; reason?: string }> | null;
  ideal_answers?: IdealAnswer[];
  starAnalysis?: { overall: number; breakdown: Record<string, number>; tip: string };
  strengths?: string[];
  improvements?: string[];
  nextSteps?: string[];
}

function loadLocalSession(id: string): LocalSession | null {
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    if (!raw) return null;
    const sessions: LocalSession[] = JSON.parse(raw);
    return sessions.find(s => s.id === id) || null;
  } catch { return null; }
}

function loadPreviousSession(currentId: string): LocalSession | null {
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    if (!raw) return null;
    const sessions: LocalSession[] = JSON.parse(raw);
    const sorted = [...sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const idx = sorted.findIndex(s => s.id === currentId);
    return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
  } catch { return null; }
}

/* ─── Reusable Section Card ─── */
function Section({ children, className, animIndex = 0 }: { children: React.ReactNode; className?: string; animIndex?: number }) {
  return (
    <div className={`sd-anim ${className || ""}`} style={{
      background: c.graphite,
      borderRadius: 16,
      border: `1px solid ${c.border}`,
      padding: "28px 32px",
      marginBottom: 16,
      animationDelay: `${0.1 + animIndex * 0.06}s`,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ children, icon, action }: { children: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: c.ivory, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
        {icon}
        {children}
      </h3>
      {action}
    </div>
  );
}

/* ═══════════════════════════════════════
   SESSION DETAIL PAGE
   ═══════════════════════════════════════ */

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [session, setSession] = useState<LocalSession | null>(null);
  const [prevSession, setPrevSession] = useState<LocalSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<"helpful" | "too_harsh" | "too_generous" | "inaccurate" | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showFillerBreakdown, setShowFillerBreakdown] = useState(false);

  // Load existing feedback
  useEffect(() => {
    if (!id || !user?.id) return;
    let cancelled = false;
    getSessionFeedback(id, user.id).then(fb => {
      if (cancelled) return;
      if (fb) { setFeedbackRating(fb.rating); setFeedbackComment(fb.comment || ""); setFeedbackSaved(true); }
    }).catch(() => {});
    try {
      const localFb = localStorage.getItem(`hirestepx_feedback_${id}`);
      if (localFb) { const parsed = JSON.parse(localFb); setFeedbackRating(parsed.rating); setFeedbackComment(parsed.comment || ""); setFeedbackSaved(true); }
    } catch {}
    return () => { cancelled = true; };
  }, [id, user?.id]);

  const submitFeedback = useCallback(async (rating: "helpful" | "too_harsh" | "too_generous" | "inaccurate") => {
    if (!id || !session) return;
    setFeedbackRating(rating);
    const feedbackData = { id: `fb_${id}`, user_id: user?.id || "anonymous", session_id: id, rating, comment: feedbackComment, session_score: session.score, session_type: session.type };
    try { localStorage.setItem(`hirestepx_feedback_${id}`, JSON.stringify(feedbackData)); } catch {}
    if (user?.id) { try { await saveFeedback(feedbackData); } catch (err) { console.error("[feedback] Save failed:", err); } }
    setFeedbackSaved(true);
    toast("Feedback saved — thank you!", "success");
  }, [id, session, user?.id, feedbackComment, toast]);

  const submitComment = useCallback(async () => {
    if (!id || !session || !feedbackRating) return;
    const feedbackData = { id: `fb_${id}`, user_id: user?.id || "anonymous", session_id: id, rating: feedbackRating, comment: feedbackComment, session_score: session.score, session_type: session.type };
    try { localStorage.setItem(`hirestepx_feedback_${id}`, JSON.stringify(feedbackData)); } catch {}
    if (user?.id) { try { await saveFeedback(feedbackData); } catch (err) { console.error("[feedback] Save failed:", err); } }
    setShowFeedbackForm(false);
  }, [id, session, user?.id, feedbackRating, feedbackComment]);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    const local = loadLocalSession(id);
    if (local) { setSession(local); setPrevSession(loadPreviousSession(id)); setLoading(false); return; }
    if (user?.id) {
      getSessionById(id, user.id).then(record => {
        if (record) setSession({ id: record.id, date: record.date, type: record.type, difficulty: record.difficulty, focus: record.focus, duration: record.duration, score: record.score, questions: record.questions, transcript: record.transcript, ai_feedback: record.ai_feedback, skill_scores: record.skill_scores });
        setLoading(false);
      }).catch(() => setLoading(false));
    } else { setLoading(false); }
  }, [id, user?.id]);

  const dateObj = session ? new Date(session.date) : null;
  const dateLabel = dateObj ? dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  const durationMin = session ? Math.ceil(session.duration / 60) : 0;
  const type = session ? normalizeType(session.type) : "";

  const speechMetrics = useMemo(() => session ? computeSpeechMetrics(session.transcript, session.duration) : null, [session]);
  const historicalAvg = useMemo(() => computeHistoricalAverages(), [session]);

  const generateExportText = useCallback(() => {
    if (!session) return "";
    const lines = [
      "HIRESTEPX — ANALYSIS REPORT & ANSWER KEY",
      "━".repeat(50),
      `Type: ${type}  |  Date: ${dateLabel}  |  Duration: ${durationMin} min  |  Difficulty: ${session.difficulty}`,
      `Overall Score: ${session.score}/100 (${scoreLabel(session.score)})`,
      "",
    ];
    if (speechMetrics) {
      lines.push("SPEECH METRICS");
      lines.push(`  Filler Words: ${speechMetrics.fillerPerMin}/min (${speechMetrics.fillerCount} total)`);
      lines.push(`  Speaking Pace: ${speechMetrics.pace} wpm`);
      lines.push(`  Silence Ratio: ${speechMetrics.silenceRatio}%`);
      lines.push(`  Energy: ${speechMetrics.energy}/100`);
      lines.push(`  Confidence: ${speechMetrics.confidence}/100`);
      lines.push(`  Hedging Phrases: ${speechMetrics.hedgingCount}`);
      lines.push(`  Power Words: ${speechMetrics.powerWordCount}`);
      lines.push(`  Avg Answer Length: ${speechMetrics.avgAnswerLength} words`);
      lines.push("");
    }
    if (session.skill_scores) {
      lines.push("SKILL SCORES");
      Object.entries(session.skill_scores).forEach(([name, raw]) => {
        const score = typeof raw === "object" && raw !== null && "score" in (raw as any) ? (raw as any).score : raw;
        const reason = typeof raw === "object" && raw !== null && "reason" in (raw as any) ? (raw as any).reason : "";
        lines.push(`  ${name}: ${score}/100${reason ? ` — ${reason}` : ""}`);
      });
      lines.push("");
    }
    if (session.ideal_answers && session.ideal_answers.length > 0) {
      lines.push("RESPONSE ANALYSIS");
      session.ideal_answers.forEach((item, i) => {
        lines.push(`\nQ${i + 1}: ${item.question}`);
        lines.push(`  Rating: ${item.rating || "reviewed"}`);
        lines.push(`  Your Answer: ${item.candidateSummary}`);
        lines.push(`  STAR-Restructured: ${item.ideal}`);
        if (item.workedWell) lines.push(`  ✓ ${item.workedWell}`);
        if (item.toImprove) lines.push(`  → ${item.toImprove}`);
      });
      lines.push("");
    }
    if (session.ai_feedback) { lines.push("AI COACH SUMMARY"); lines.push(session.ai_feedback); lines.push(""); }
    lines.push("━".repeat(50));
    lines.push("Generated by HireStepX");
    return lines.join("\n");
  }, [session, type, dateLabel, durationMin, speechMetrics]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(generateExportText()).then(() => { setCopied(true); toast("Report copied to clipboard", "success"); setTimeout(() => setCopied(false), 2000); });
  }, [generateExportText]);

  const handleDownload = useCallback(() => {
    if (!session) return;
    const blob = new Blob([generateExportText()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `HireStepX_Report_${session.date.split("T")[0]}.txt`; a.click();
    URL.revokeObjectURL(url);
  }, [generateExportText, session]);

  /* ─── Certificate Image Generator ─── */
  const generateCertificateImage = useCallback(async (): Promise<Blob | null> => {
    if (!session) return null;
    const W = 1200, H = 630; // LinkedIn recommended image size
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#060607");
    bg.addColorStop(0.5, "#111113");
    bg.addColorStop(1, "#0a0a0c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Decorative gold border
    ctx.strokeStyle = "#D4B37F";
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, W - 48, H - 48);
    ctx.strokeStyle = "rgba(212,179,127,0.2)";
    ctx.lineWidth = 1;
    ctx.strokeRect(32, 32, W - 64, H - 64);

    // Corner accents
    const cornerSize = 40;
    ctx.strokeStyle = "#D4B37F";
    ctx.lineWidth = 3;
    [[24, 24, 1, 1], [W - 24, 24, -1, 1], [24, H - 24, 1, -1], [W - 24, H - 24, -1, -1]].forEach(([x, y, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(x as number, (y as number) + (dy as number) * cornerSize);
      ctx.lineTo(x as number, y as number);
      ctx.lineTo((x as number) + (dx as number) * cornerSize, y as number);
      ctx.stroke();
    });

    // "CERTIFICATE OF COMPLETION" header
    ctx.fillStyle = "rgba(212,179,127,0.5)";
    ctx.font = "600 11px 'Inter', sans-serif";
    ctx.letterSpacing = "6px";
    ctx.textAlign = "center";
    ctx.fillText("CERTIFICATE OF COMPLETION", W / 2, 80);

    // Brand name
    ctx.fillStyle = "#D4B37F";
    ctx.font = "italic 36px Georgia, serif";
    ctx.fillText("HireStepX", W / 2, 130);

    // Candidate name
    ctx.fillStyle = "#F5F2ED";
    ctx.font = "400 32px Georgia, serif";
    ctx.fillText(user?.name || "Candidate", W / 2, 200);

    // Subtitle
    ctx.fillStyle = "#8E8983";
    ctx.font = "400 14px 'Inter', sans-serif";
    ctx.fillText("has successfully completed a mock interview session", W / 2, 235);

    // Interview type badge
    const typeText = normalizeType(session.type);
    ctx.fillStyle = "rgba(212,179,127,0.08)";
    const badgeW = ctx.measureText(typeText).width + 48;
    ctx.beginPath();
    ctx.roundRect(W / 2 - badgeW / 2, 260, badgeW, 32, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(212,179,127,0.2)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#D4B37F";
    ctx.font = "600 13px 'Inter', sans-serif";
    ctx.fillText(typeText, W / 2, 281);

    // Score circle
    const scoreColor = session.score >= 85 ? "#7A9E7E" : session.score >= 70 ? "#D4B37F" : "#C4705A";
    ctx.beginPath();
    ctx.arc(W / 2, 370, 50, 0, Math.PI * 2);
    ctx.strokeStyle = scoreColor;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#F5F2ED";
    ctx.font = "700 32px 'JetBrains Mono', monospace";
    ctx.fillText(String(session.score), W / 2, 378);
    ctx.fillStyle = scoreColor;
    ctx.font = "600 11px 'Inter', sans-serif";
    ctx.fillText("/100", W / 2, 400);

    // Skill scores row
    const skills = session.skill_scores ? Object.entries(session.skill_scores).slice(0, 5) : [];
    if (skills.length > 0) {
      const startX = W / 2 - (skills.length * 120) / 2;
      skills.forEach(([name, raw], i) => {
        const score = typeof raw === "object" && raw !== null && "score" in (raw as any) ? (raw as any).score : raw;
        const x = startX + i * 120 + 60;
        ctx.fillStyle = "#8E8983";
        ctx.font = "500 10px 'Inter', sans-serif";
        ctx.fillText(name.replace(/([A-Z])/g, " $1").trim(), x, 465);
        ctx.fillStyle = "#CCC7C0";
        ctx.font = "600 16px 'JetBrains Mono', monospace";
        ctx.fillText(String(typeof score === "number" ? score : "—"), x, 488);
      });
    }

    // Date and duration
    ctx.fillStyle = "#8E8983";
    ctx.font = "400 12px 'Inter', sans-serif";
    const dateStr = new Date(session.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    ctx.fillText(`${dateStr}  •  ${Math.round(session.duration / 60)} min session`, W / 2, 540);

    // Footer
    ctx.fillStyle = "rgba(212,179,127,0.3)";
    ctx.font = "400 10px 'Inter', sans-serif";
    ctx.fillText("app.hirestepx.com", W / 2, H - 40);

    return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  }, [session, user]);

  const handleDownloadCertificate = useCallback(async () => {
    const blob = await generateCertificateImage();
    if (!blob || !session) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `HireStepX_Certificate_${session.date.split("T")[0]}.png`; a.click();
    URL.revokeObjectURL(url);
    toast("Certificate downloaded", "success");
  }, [generateCertificateImage, session]);

  const handleShareLinkedIn = useCallback(async () => {
    if (!session) return;
    // Download certificate first so user can attach it
    await handleDownloadCertificate();
    const scoreText = session.score >= 85 ? "Strong" : session.score >= 70 ? "Good" : "Developing";
    const text = encodeURIComponent(
      `Just completed a ${normalizeType(session.type)} mock interview on HireStepX and scored ${session.score}/100 (${scoreText})!\n\n` +
      `AI-powered interview practice is a game-changer for preparation.\n\n#InterviewPrep #HireStepX #MockInterview #CareerGrowth`
    );
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://app.hirestepx.com")}&text=${text}`, "_blank", "noopener,noreferrer");
  }, [session, handleDownloadCertificate]);

  const handleShareWhatsApp = useCallback(() => {
    if (!session) return;
    const scoreText = session.score >= 85 ? "Strong" : session.score >= 70 ? "Good" : "Developing";
    const text = encodeURIComponent(
      `I just completed a ${normalizeType(session.type)} mock interview on HireStepX!\n\n` +
      `Score: ${session.score}/100 (${scoreText})\n` +
      `Duration: ${Math.round(session.duration / 60)} min\n\n` +
      `Practice your interviews with AI: https://app.hirestepx.com`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }, [session]);

  /* ─── Loading Skeleton ─── */
  if (loading) {
    const Bone = ({ w, h, r, mb }: { w: string; h: number; r?: number; mb?: number }) => (
      <div style={{ width: w, height: h, borderRadius: r ?? 8, background: `linear-gradient(90deg, ${c.graphite} 25%, rgba(255,255,255,0.04) 50%, ${c.graphite} 75%)`, backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite", marginBottom: mb ?? 0 }} />
    );
    return (
      <div style={{ minHeight: "100vh", background: c.obsidian, fontFamily: font.ui }}>
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 300, background: gradient.meshBg, pointerEvents: "none", zIndex: 0 }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 860, margin: "0 auto", padding: "32px 24px 80px" }}>
          {/* Header skeleton */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
            <div>
              <Bone w="60px" h={14} mb={16} />
              <Bone w="320px" h={28} mb={10} />
              <Bone w="200px" h={14} />
            </div>
            <div style={{ textAlign: "center" }}>
              <Bone w="72px" h={72} r={36} />
            </div>
          </div>
          {/* Action bar skeleton */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            <Bone w="80px" h={32} />
            <Bone w="100px" h={32} />
          </div>
          {/* Metrics skeleton */}
          <div style={{ background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`, padding: "28px 32px", marginBottom: 16 }}>
            <Bone w="200px" h={18} mb={20} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[0,1,2,3].map(i => <Bone key={i} w="100%" h={120} r={12} />)}
            </div>
          </div>
          {/* Performance skeleton */}
          <div style={{ background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`, padding: "28px 32px", marginBottom: 16 }}>
            <Bone w="180px" h={18} mb={20} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Bone w="100%" h={260} r={14} />
              <Bone w="100%" h={260} r={14} />
            </div>
          </div>
          {/* Response analysis skeleton */}
          <div style={{ background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`, padding: "28px 32px" }}>
            <Bone w="160px" h={18} mb={20} />
            <Bone w="100%" h={140} r={14} mb={16} />
            <Bone w="100%" h={140} r={14} />
          </div>
        </div>
        <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
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

  const skillEntries = session.skill_scores
    ? Object.entries(session.skill_scores).map(([name, raw]) => {
        const score = typeof raw === "object" && raw !== null && "score" in (raw as any) ? (raw as any).score : raw;
        const reason = typeof raw === "object" && raw !== null && "reason" in (raw as any) ? (raw as any).reason : undefined;
        return { name, score: typeof score === "number" ? score : 0, reason };
      }).filter(e => !isNaN(e.score))
    : [];

  const prevSkillMap = prevSession?.skill_scores
    ? Object.fromEntries(Object.entries(prevSession.skill_scores).map(([k, v]) => [k, typeof v === "object" && v !== null && "score" in (v as any) ? (v as any).score : v]))
    : {};

  return (
    <div className="session-detail-outer" style={{ minHeight: "100vh", background: c.obsidian, fontFamily: font.ui }}>
      {/* Subtle top gradient */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 300, background: gradient.meshBg, pointerEvents: "none", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 860, margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* ═══ HEADER ═══ */}
        <div className="sd-anim" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, animationDelay: "0s" }}>
          <div>
            <button onClick={() => { if (window.history.length > 1) navigate(-1); else navigate("/dashboard"); }} style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: c.stone,
              background: "none", border: "none", cursor: "pointer", outline: "none", marginBottom: 16, padding: 0,
            }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
            <h1 style={{ fontFamily: font.display, fontSize: 28, fontWeight: 400, color: c.ivory, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
              Analysis Report & Answer Key
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: c.chalk }}>{type}</span>
              <span style={{ fontSize: 13, color: c.stone }}>·</span>
              {user?.targetCompany && <><span style={{ fontSize: 13, color: c.chalk }}>{user.targetCompany}</span><span style={{ fontSize: 13, color: c.stone }}>·</span></>}
              {user?.name && <><span style={{ fontSize: 13, color: c.chalk }}>{user.name.split(" ")[0]}</span><span style={{ fontSize: 13, color: c.stone }}>·</span></>}
              <span style={{ fontSize: 13, color: c.stone }}>{dateLabel}</span>
            </div>
          </div>

          {/* Overall Score Circle */}
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.stone, display: "block", marginBottom: 8 }}>Overall Score</span>
            <div role="img" aria-label={`Score ${session.score} out of 100 — ${scoreLabel(session.score)}`} style={{
              width: 72, height: 72, borderRadius: "50%",
              border: `3px solid ${scoreLabelColor(session.score)}`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 24px ${scoreLabelColor(session.score)}20`,
            }}>
              <span aria-hidden="true" style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, color: c.ivory, lineHeight: 1 }}>{session.score}</span>
              <span aria-hidden="true" style={{ fontSize: 9, color: scoreLabelColor(session.score), fontWeight: 600 }}>/100</span>
            </div>
            <span title={scoreTip(session.score)} style={{ fontSize: 11, fontWeight: 600, color: scoreLabelColor(session.score), marginTop: 6, display: "block", cursor: "help" }}>
              {scoreLabel(session.score)}
            </span>
          </div>
        </div>

        {/* Action bar */}
        <div className="sd-anim" style={{ display: "flex", gap: 8, marginBottom: 24, animationDelay: "0.05s" }}>
          <button onClick={handleCopy} aria-label="Copy report" style={{
            padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: copied ? "rgba(122,158,126,0.08)" : "transparent",
            border: `1px solid ${copied ? "rgba(122,158,126,0.3)" : c.border}`,
            color: copied ? c.sage : c.stone, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}>
            {copied ? <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
            {copied ? "Copied!" : "Copy"}
          </button>
          <button onClick={handleDownload} aria-label="Download report" style={{
            padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: "transparent", border: `1px solid ${c.border}`, color: c.stone,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download
          </button>
          <div style={{ width: 1, height: 20, background: c.border, margin: "0 4px" }} />
          <button onClick={handleDownloadCertificate} aria-label="Download certificate" style={{
            padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: "rgba(212,179,127,0.06)", border: `1px solid rgba(212,179,127,0.15)`, color: c.gilt,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            Certificate
          </button>
          <button onClick={handleShareLinkedIn} aria-label="Share on LinkedIn" style={{
            padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: "rgba(10,102,194,0.08)", border: "1px solid rgba(10,102,194,0.2)", color: "#6CB4EE",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            LinkedIn
          </button>
          <button onClick={handleShareWhatsApp} aria-label="Share on WhatsApp" style={{
            padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: "rgba(37,211,102,0.08)", border: "1px solid rgba(37,211,102,0.2)", color: "#25D366",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp
          </button>
        </div>

        {/* ═══ CORE OBJECTIVE METRICS ═══ */}
        {speechMetrics && (
          <Section animIndex={0}>
            <SectionTitle icon={
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M12 20v-6M6 20V10M18 20V4"/></svg>
            }>Core Objective Metrics</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              {/* Filler Words */}
              <div style={{ padding: "16px 18px", borderRadius: 12, background: c.obsidian, border: `1px solid ${c.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: c.chalk, display: "block" }}>Filler Words</span>
                    <span style={{ fontSize: 10, color: c.stone }}>Per Minute</span>
                  </div>
                  <span style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, color: speechMetrics.fillerPerMin <= 3 ? c.sage : speechMetrics.fillerPerMin <= 6 ? c.gilt : c.ember }}>
                    {speechMetrics.fillerPerMin}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: c.stone }}>Total detected:</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: speechMetrics.fillerCount > 0 ? c.ember : c.sage, background: speechMetrics.fillerCount > 0 ? "rgba(196,112,90,0.1)" : "rgba(122,158,126,0.1)", padding: "1px 6px", borderRadius: 4 }}>{speechMetrics.fillerCount}</span>
                </div>
                {/* View breakdown dropdown */}
                {speechMetrics.fillerBreakdown.length > 0 && (
                  <div>
                    <button onClick={() => setShowFillerBreakdown(v => !v)} style={{
                      fontSize: 10, color: c.stone, background: "rgba(255,255,255,0.03)", border: `1px solid ${c.border}`,
                      borderRadius: 6, padding: "4px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, width: "100%", justifyContent: "space-between",
                    }}>
                      <span>View breakdown</span>
                      <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                        style={{ transform: showFillerBreakdown ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                    {showFillerBreakdown && (
                      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                        {speechMetrics.fillerBreakdown.map(({ word, count }) => (
                          <div key={word} style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                            <span style={{ color: c.stone, fontStyle: "italic" }}>"{word}"</span>
                            <span style={{ fontFamily: font.mono, color: c.chalk, fontWeight: 600 }}>{count}×</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ marginTop: 6, fontSize: 10, color: c.stone }}>Target: 0–3/min</div>
              </div>

              {/* Silence Ratio */}
              <div style={{ padding: "16px 18px", borderRadius: 12, background: c.obsidian, border: `1px solid ${c.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: c.chalk, display: "block" }}>Silence Ratio</span>
                    <span style={{ fontSize: 10, color: c.stone }}>Speaking Continuity</span>
                  </div>
                  <span style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, color: speechMetrics.silenceRatio <= 30 ? c.sage : speechMetrics.silenceRatio <= 50 ? c.gilt : c.ember }}>
                    {speechMetrics.silenceRatio}<span style={{ fontSize: 14 }}>%</span>
                  </span>
                </div>
                {/* Lowest / Highest range */}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div><span style={{ fontSize: 9, color: c.stone, display: "block" }}>Lowest</span><span style={{ fontFamily: font.mono, fontSize: 11, color: c.chalk }}>{Math.max(0, speechMetrics.silenceRatio - 12)}</span></div>
                  <div style={{ textAlign: "right" }}><span style={{ fontSize: 9, color: c.stone, display: "block" }}>Highest</span><span style={{ fontFamily: font.mono, fontSize: 11, color: c.chalk }}>{Math.min(100, speechMetrics.silenceRatio + 18)}</span></div>
                </div>
                <div style={{ fontSize: 10, color: c.stone }}>Target: 0–20%</div>
              </div>

              {/* Energy */}
              <div style={{ padding: "16px 18px", borderRadius: 12, background: c.obsidian, border: `1px solid ${c.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: c.chalk, display: "block" }}>Energy</span>
                    <span style={{ fontSize: 10, color: c.stone }}>Voice Dynamics</span>
                  </div>
                  <span style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, color: speechMetrics.energy >= 70 ? c.sage : speechMetrics.energy >= 50 ? c.gilt : c.ember }}>
                    {speechMetrics.energy}<span style={{ fontSize: 14, color: c.stone }}>/100</span>
                  </span>
                </div>
                {/* Lowest / Highest range */}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div><span style={{ fontSize: 9, color: c.stone, display: "block" }}>Lowest</span><span style={{ fontFamily: font.mono, fontSize: 11, color: c.chalk }}>{Math.max(0, speechMetrics.energy - 20)}</span></div>
                  <div style={{ textAlign: "right" }}><span style={{ fontSize: 9, color: c.stone, display: "block" }}>Highest</span><span style={{ fontFamily: font.mono, fontSize: 11, color: c.chalk }}>{Math.min(100, speechMetrics.energy + 10)}</span></div>
                </div>
                <div style={{ fontSize: 10, color: c.stone }}>Target: 60–100</div>
              </div>

              {/* Pace */}
              <div style={{ padding: "16px 18px", borderRadius: 12, background: c.obsidian, border: `1px solid ${c.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: c.chalk, display: "block" }}>Pace</span>
                    <span style={{ fontSize: 10, color: c.stone }}>Speaking Speed</span>
                  </div>
                  <span style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, color: speechMetrics.pace >= 130 && speechMetrics.pace <= 180 ? c.sage : c.gilt }}>
                    {speechMetrics.pace}<span style={{ fontSize: 12, color: c.stone }}> wpm</span>
                  </span>
                </div>
                <div style={{ padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)", border: `1px solid ${c.border}`, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: c.chalk }}>
                    {speechMetrics.pace < 130 ? "Slightly slow. Try to speak faster." : speechMetrics.pace > 180 ? "Fast. Try to slow down." : "Good pace. Natural and clear."}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: c.stone }}>Target: 130–180 wpm</div>
              </div>

              {/* Confidence Score */}
              <div style={{ padding: "16px 18px", borderRadius: 12, background: c.obsidian, border: `1px solid ${c.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: c.chalk, display: "block" }}>Confidence</span>
                    <span style={{ fontSize: 10, color: c.stone }}>Assertiveness Score</span>
                  </div>
                  <span style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, color: speechMetrics.confidence >= 70 ? c.sage : speechMetrics.confidence >= 50 ? c.gilt : c.ember }}>
                    {speechMetrics.confidence}<span style={{ fontSize: 14, color: c.stone }}>/100</span>
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1, padding: "4px 8px", borderRadius: 6, background: "rgba(122,158,126,0.08)", border: "1px solid rgba(122,158,126,0.15)", textAlign: "center" }}>
                    <span style={{ fontSize: 9, color: c.stone, display: "block" }}>Power Words</span>
                    <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 600, color: c.sage }}>{speechMetrics.powerWordCount}</span>
                  </div>
                  <div style={{ flex: 1, padding: "4px 8px", borderRadius: 6, background: "rgba(196,112,90,0.08)", border: "1px solid rgba(196,112,90,0.15)", textAlign: "center" }}>
                    <span style={{ fontSize: 9, color: c.stone, display: "block" }}>Hedging</span>
                    <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 600, color: speechMetrics.hedgingCount > 3 ? c.ember : c.chalk }}>{speechMetrics.hedgingCount}</span>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: c.stone }}>
                  {speechMetrics.confidence >= 70 ? "Strong and assertive delivery." : speechMetrics.confidence >= 50 ? "Moderate. Reduce hedging, add action verbs." : "Low. Replace \"I think\" with definitive statements."}
                </div>
              </div>

              {/* Hedging Breakdown */}
              {speechMetrics.hedgingBreakdown.length > 0 && (
                <div style={{ padding: "16px 18px", borderRadius: 12, background: c.obsidian, border: `1px solid ${c.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: c.chalk, display: "block" }}>Hedging Language</span>
                      <span style={{ fontSize: 10, color: c.stone }}>Uncertainty Phrases</span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: speechMetrics.hedgingCount <= 2 ? c.sage : c.ember, background: speechMetrics.hedgingCount <= 2 ? "rgba(122,158,126,0.1)" : "rgba(196,112,90,0.1)", padding: "1px 6px", borderRadius: 4 }}>
                      {speechMetrics.hedgingCount} total
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {speechMetrics.hedgingBreakdown.slice(0, 5).map(({ phrase, count }) => (
                      <div key={phrase} style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                        <span style={{ color: c.chalk }}>"{phrase}"</span>
                        <span style={{ fontFamily: font.mono, color: c.ember }}>{count}x</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: c.stone, marginTop: 6 }}>Tip: Replace with "I did", "We achieved", "The result was"</div>
                </div>
              )}

              {/* Answer Consistency */}
              <div style={{ padding: "16px 18px", borderRadius: 12, background: c.obsidian, border: `1px solid ${c.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: c.chalk, display: "block" }}>Answer Depth</span>
                    <span style={{ fontSize: 10, color: c.stone }}>Avg. Words per Answer</span>
                  </div>
                  <span style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, color: speechMetrics.avgAnswerLength >= 40 ? c.sage : speechMetrics.avgAnswerLength >= 20 ? c.gilt : c.ember }}>
                    {speechMetrics.avgAnswerLength}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1, padding: "4px 8px", borderRadius: 6, background: "rgba(255,255,255,0.02)", border: `1px solid ${c.border}`, textAlign: "center" }}>
                    <span style={{ fontSize: 9, color: c.stone, display: "block" }}>Consistency</span>
                    <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 600, color: speechMetrics.answerConsistency >= 70 ? c.sage : c.gilt }}>{speechMetrics.answerConsistency}%</span>
                  </div>
                  <div style={{ flex: 1, padding: "4px 8px", borderRadius: 6, background: "rgba(255,255,255,0.02)", border: `1px solid ${c.border}`, textAlign: "center" }}>
                    <span style={{ fontSize: 9, color: c.stone, display: "block" }}>Total Words</span>
                    <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 600, color: c.chalk }}>{speechMetrics.wordCount}</span>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: c.stone }}>Target: 40–80 words per answer</div>
              </div>
            </div>
          </Section>
        )}

        {/* ═══ STAR METHOD ANALYSIS ═══ */}
        {session.starAnalysis && (
          <Section animIndex={1}>
            <SectionTitle icon={
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            }>STAR Method Analysis</SectionTitle>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              {(["situation", "task", "action", "result"] as const).map(component => {
                const score = session.starAnalysis!.breakdown[component];
                const label = component.charAt(0).toUpperCase() + component.slice(1);
                return (
                  <div key={component} style={{ padding: "16px 14px", borderRadius: 12, background: c.obsidian, border: `1px solid ${c.border}`, textAlign: "center" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center", background: `conic-gradient(${score >= 70 ? c.sage : score >= 50 ? c.gilt : c.ember} ${score * 3.6}deg, rgba(255,255,255,0.05) 0deg)` }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: c.obsidian, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 700, color: score >= 70 ? c.sage : score >= 50 ? c.gilt : c.ember }}>{score}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: c.ivory, display: "block" }}>{label}</span>
                    <span style={{ fontSize: 9, color: c.stone }}>
                      {component === "situation" ? "Context Setting" : component === "task" ? "Your Role" : component === "action" ? "Steps Taken" : "Impact & Metrics"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, background: "rgba(212,179,127,0.04)", border: "1px solid rgba(212,179,127,0.1)" }}>
              <span style={{ fontFamily: font.mono, fontSize: 28, fontWeight: 700, color: session.starAnalysis.overall >= 70 ? c.sage : session.starAnalysis.overall >= 50 ? c.gilt : c.ember }}>
                {session.starAnalysis.overall}<span style={{ fontSize: 14, color: c.stone }}>/100</span>
              </span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: c.ivory, display: "block" }}>Overall STAR Score</span>
                <span style={{ fontSize: 11, color: c.stone }}>{session.starAnalysis.tip}</span>
              </div>
            </div>
          </Section>
        )}

        {/* ═══ PERFORMANCE ANALYSIS ═══ */}
        {skillEntries.length > 0 && (
          <Section animIndex={1}>
            <SectionTitle icon={
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            }>Performance Analysis</SectionTitle>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* ── Left: Performance Positioning Quadrant ── */}
              <div style={{ padding: "20px", borderRadius: 14, background: c.obsidian, border: `1px solid ${c.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: c.ivory }}>Performance Positioning</span>
                  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.gilt, background: "rgba(212,179,127,0.1)", padding: "3px 8px", borderRadius: 4 }}>Quadrant View</span>
                </div>

                {/* Quadrant chart */}
                {(() => {
                  // Use communication+structure as "Delivery Confidence" (Y-axis)
                  // Use technicalDepth+problemSolving as "Technical Credibility" (X-axis)
                  const deliverySkills = skillEntries.filter(s => ["communication", "structure", "leadership"].includes(s.name.toLowerCase()));
                  const technicalSkills = skillEntries.filter(s => ["technicaldepth", "problemsolving", "problemSolving"].includes(s.name.toLowerCase()) || s.name.toLowerCase().includes("technical") || s.name.toLowerCase().includes("problem"));
                  const deliveryScore = deliverySkills.length > 0 ? Math.round(deliverySkills.reduce((s, e) => s + e.score, 0) / deliverySkills.length) : session.score;
                  const technicalScore = technicalSkills.length > 0 ? Math.round(technicalSkills.reduce((s, e) => s + e.score, 0) / technicalSkills.length) : session.score;
                  // Cohort average
                  const cohortDelivery = historicalAvg ? Math.round(Object.entries(historicalAvg.avgSkills).filter(([k]) => ["communication", "structure", "leadership"].includes(k.toLowerCase())).reduce((s, [, v]) => s + v, 0) / Math.max(1, Object.entries(historicalAvg.avgSkills).filter(([k]) => ["communication", "structure", "leadership"].includes(k.toLowerCase())).length)) || 50 : 50;
                  const cohortTechnical = historicalAvg ? Math.round(Object.entries(historicalAvg.avgSkills).filter(([k]) => k.toLowerCase().includes("technical") || k.toLowerCase().includes("problem")).reduce((s, [, v]) => s + v, 0) / Math.max(1, Object.entries(historicalAvg.avgSkills).filter(([k]) => k.toLowerCase().includes("technical") || k.toLowerCase().includes("problem")).length)) || 50 : 50;

                  const dotX = technicalScore; // 0-100 maps to left-right
                  const dotY = 100 - deliveryScore; // 0-100 maps to top-bottom (inverted)

                  return (
                    <div style={{ position: "relative" }}>
                      {/* Axis labels */}
                      <div style={{ textAlign: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: c.sage }}>Technical Credibility</span>
                      </div>
                      <div style={{ display: "flex" }}>
                        {/* Y-axis label */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, flexShrink: 0 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: "#B388FF", transform: "rotate(-90deg)", whiteSpace: "nowrap" }}>Delivery Confidence</span>
                        </div>
                        {/* Grid */}
                        <div style={{ flex: 1, position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", width: "100%", height: "100%", position: "absolute", inset: 0 }}>
                            <div style={{ background: "rgba(212,179,127,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", padding: 8, borderRight: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}` }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: c.chalk }}>Great Answers</span>
                              <span style={{ fontSize: 9, color: c.stone }}>Work on Delivery</span>
                            </div>
                            <div style={{ background: "rgba(122,158,126,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", padding: 8, borderBottom: `1px solid ${c.border}` }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: c.sage }}>Interview Ready</span>
                              <span style={{ fontSize: 9, color: c.stone }}>Strong All Around</span>
                            </div>
                            <div style={{ background: "rgba(196,112,90,0.04)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", padding: 8, borderRight: `1px solid ${c.border}` }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: c.stone }}>Keep Practicing</span>
                              <span style={{ fontSize: 9, color: c.stone }}>Room to Grow</span>
                            </div>
                            <div style={{ background: "rgba(212,179,127,0.03)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", padding: 8 }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: c.chalk }}>Strong Delivery</span>
                              <span style={{ fontSize: 9, color: c.stone }}>Improve Content</span>
                            </div>
                          </div>
                          {/* Your score dot */}
                          <div title={`You: Technical ${technicalScore}, Delivery ${deliveryScore}`} style={{
                            position: "absolute", left: `${dotX}%`, top: `${dotY}%`,
                            width: 14, height: 14, borderRadius: "50%",
                            background: c.gilt, border: `2px solid ${c.giltLight}`,
                            transform: "translate(-50%, -50%)", zIndex: 2,
                            boxShadow: `0 0 12px ${c.gilt}40`, cursor: "help",
                          }} />
                          {/* Cohort dot */}
                          {historicalAvg && (
                            <div title={`Your Avg: Technical ${cohortTechnical}, Delivery ${cohortDelivery}`} style={{
                              position: "absolute", left: `${cohortTechnical}%`, top: `${100 - cohortDelivery}%`,
                              width: 10, height: 10, borderRadius: "50%",
                              background: c.stone, border: `2px solid rgba(142,137,131,0.4)`,
                              transform: "translate(-50%, -50%)", zIndex: 1, cursor: "help",
                            }} />
                          )}
                        </div>
                      </div>
                      {/* Legend */}
                      <div style={{ display: "flex", gap: 16, marginTop: 10, justifyContent: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.gilt }} />
                          <span style={{ fontSize: 10, color: c.stone }}>Your Score</span>
                        </div>
                        {historicalAvg && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.stone }} />
                            <span style={{ fontSize: 10, color: c.stone }}>Your Average ({historicalAvg.count} sessions)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* ── Right: Score Breakdown (Benchmarked) ── */}
              <div style={{ padding: "20px", borderRadius: 14, background: c.obsidian, border: `1px solid ${c.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: c.ivory }}>Score Breakdown</span>
                  {historicalAvg && <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.sage, background: "rgba(122,158,126,0.1)", padding: "3px 8px", borderRadius: 4 }}>Benchmarked</span>}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {skillEntries.map(({ name, score, reason }) => {
                    const avgScore = historicalAvg?.avgSkills[name];
                    return (
                      <div key={name}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: c.ivory }}>{name}</span>
                          <span style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 700, color: c.ivory }}>
                            {score}<span style={{ fontSize: 12, color: c.stone }}>/100</span>
                          </span>
                        </div>
                        {/* Your Score bar */}
                        <div style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: c.chalk }}>Your Score</span>
                            <span style={{ fontFamily: font.mono, fontSize: 10, color: c.chalk }}>{score}/100</span>
                          </div>
                          <div role="meter" aria-label={`${name}: ${score} out of 100 (${scoreLabel(score)})`} aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
                            <div style={{ width: `${score}%`, height: "100%", borderRadius: 3, background: `linear-gradient(90deg, ${scoreLabelColor(score)}, ${scoreLabelColor(score)}CC)`, transition: "width 0.6s ease" }} />
                          </div>
                        </div>
                        {/* Your Average bar */}
                        {avgScore !== undefined ? (
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                              <span style={{ fontSize: 10, color: c.stone }}>Your Average</span>
                              <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>{avgScore}/100</span>
                            </div>
                            <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
                              <div style={{ width: `${avgScore}%`, height: "100%", borderRadius: 2, background: c.stone, opacity: 0.5 }} />
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                            <span style={{ fontSize: 10, color: c.stone, fontStyle: "italic" }}>First session — keep practicing to see trends</span>
                          </div>
                        )}
                        {reason && <p style={{ fontSize: 10, color: c.stone, marginTop: 4, lineHeight: 1.4, fontStyle: "italic" }}>"{reason}"</p>}
                      </div>
                    );
                  })}

                  {/* Overall Score with average */}
                  <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: c.ivory }}>Overall Score</span>
                      <span style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 700, color: c.ivory }}>
                        {session.score}<span style={{ fontSize: 12, color: c.stone }}>/100</span>
                      </span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.04)", overflow: "hidden", marginBottom: 6 }}>
                      <div style={{ width: `${session.score}%`, height: "100%", borderRadius: 4, background: `linear-gradient(90deg, ${c.gilt}, ${c.giltLight})` }} />
                    </div>
                    {historicalAvg && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 10, color: c.stone }}>Your Average: {historicalAvg.avgScore}/100</span>
                        {(() => {
                          const diff = session.score - historicalAvg.avgScore;
                          if (diff === 0) return null;
                          return <span style={{ fontSize: 10, fontWeight: 600, color: diff > 0 ? c.sage : c.ember }}>↑ {Math.abs(diff)} {diff > 0 ? "above" : "below"} avg</span>;
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* ═══ RESPONSE ANALYSIS — Per-question breakdown ═══ */}
        {session.ideal_answers && session.ideal_answers.length > 0 && (
          <Section animIndex={2}>
            <SectionTitle icon={
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
            }>Response Analysis</SectionTitle>

            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {session.ideal_answers.map((item, i) => {
                const badge = ratingBadge(item.rating);
                return (
                  <div key={i} style={{ borderRadius: 14, border: `1px solid ${c.border}`, overflow: "hidden" }}>
                    {/* Question header */}
                    <div style={{ padding: "16px 20px", background: "rgba(212,179,127,0.03)", borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 2,
                        background: "rgba(212,179,127,0.08)", border: `1px solid rgba(212,179,127,0.15)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: c.gilt }}>Q{i + 1}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, display: "block", marginBottom: 4 }}>Interview Question</span>
                        <p style={{ fontSize: 14, fontWeight: 500, color: c.ivory, lineHeight: 1.5, margin: 0 }}>{item.question}</p>
                      </div>
                    </div>

                    {/* Two-column: Your Answer vs Restructured */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 0 }}>
                      {/* Your Answer */}
                      <div style={{ padding: "16px 20px", borderRight: `1px solid ${c.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c.ember }}>Your Answer</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: badge.color, background: badge.bg, padding: "2px 8px", borderRadius: 4 }}>{badge.label}</span>
                        </div>
                        <div style={{ borderLeft: `2px solid ${c.ember}40`, paddingLeft: 14 }}>
                          <p style={{ fontSize: 13, color: c.chalk, lineHeight: 1.7, margin: 0 }}>{item.candidateSummary}</p>
                        </div>
                        {/* What's missing / what worked */}
                        {(item.toImprove || item.workedWell) && (
                          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                            {item.toImprove && (
                              <div style={{ fontSize: 11, color: c.ember, lineHeight: 1.5 }}>
                                <strong>Incomplete:</strong> {item.toImprove}
                              </div>
                            )}
                            {item.workedWell && (
                              <div style={{ fontSize: 11, color: c.sage, lineHeight: 1.5 }}>
                                <strong>Worked well:</strong> {item.workedWell}
                              </div>
                            )}
                          </div>
                        )}
                        {/* STAR component badges per answer */}
                        {item.starBreakdown && (
                          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                            {(["situation", "task", "action", "result"] as const).map(comp => {
                              const status = item.starBreakdown![comp];
                              const colors = { present: { bg: "rgba(122,158,126,0.12)", text: c.sage, icon: "\u2713" }, partial: { bg: "rgba(212,179,127,0.12)", text: c.gilt, icon: "\u25CB" }, missing: { bg: "rgba(196,112,90,0.12)", text: c.ember, icon: "\u2717" } };
                              const style = colors[status as keyof typeof colors] || colors.missing;
                              return (
                                <span key={comp} style={{ fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: style.bg, color: style.text }}>
                                  {style.icon} {comp.charAt(0).toUpperCase() + comp.slice(1)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Restructured STAR Answer */}
                      <div style={{ padding: "16px 20px", background: "rgba(122,158,126,0.02)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c.sage }}>Restructured Answer</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: c.sage, background: "rgba(122,158,126,0.1)", padding: "2px 8px", borderRadius: 4 }}>STAR Format</span>
                        </div>
                        <div style={{ borderLeft: `2px solid ${c.sage}40`, paddingLeft: 14 }}>
                          <p style={{ fontSize: 13, color: c.chalk, lineHeight: 1.7, margin: 0 }}>{item.ideal}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ═══ AI COACH SUMMARY ═══ */}
        {session.ai_feedback && (
          <Section className="session-detail-card" animIndex={3}>
            <SectionTitle icon={
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2m-9-11h2m18 0h2M5.6 5.6l1.4 1.4m9.9 9.9l1.4 1.4M5.6 18.4l1.4-1.4m9.9-9.9l1.4-1.4"/></svg>
            }>AI Coach Summary</SectionTitle>
            {(() => {
              const feedback = session.ai_feedback;
              const strengths: string[] = session.strengths || [];
              const improvements: string[] = session.improvements || [];
              const tips: string[] = [];

              // Parse structured feedback if not already structured
              if (strengths.length === 0 && improvements.length === 0) {
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
              }

              if (strengths.length === 0 && improvements.length === 0) {
                return <p style={{ fontSize: 14, color: c.chalk, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{feedback}</p>;
              }

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {strengths.length > 0 && (
                    <div style={{ padding: "16px 18px", borderRadius: 12, background: "rgba(122,158,126,0.04)", border: `1px solid rgba(122,158,126,0.1)`, borderLeft: `3px solid ${c.sage}` }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c.sage, display: "block", marginBottom: 8 }}>Strengths</span>
                      {strengths.map((s, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginTop: i > 0 ? 6 : 0 }}>
                          <span style={{ color: c.sage, fontSize: 12, marginTop: 1 }}>✓</span>
                          <p style={{ fontSize: 13, color: c.chalk, lineHeight: 1.6, margin: 0 }}>{s}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {improvements.length > 0 && (
                    <div style={{ padding: "16px 18px", borderRadius: 12, background: "rgba(196,112,90,0.04)", border: `1px solid rgba(196,112,90,0.1)`, borderLeft: `3px solid ${c.ember}` }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c.ember, display: "block", marginBottom: 8 }}>Areas to Improve</span>
                      {improvements.map((s, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginTop: i > 0 ? 6 : 0 }}>
                          <span style={{ color: c.ember, fontSize: 12, marginTop: 1 }}>→</span>
                          <p style={{ fontSize: 13, color: c.chalk, lineHeight: 1.6, margin: 0 }}>{s}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {session.nextSteps && session.nextSteps.length > 0 && (
                    <div style={{ padding: "16px 18px", borderRadius: 12, background: "rgba(212,179,127,0.04)", border: `1px solid rgba(212,179,127,0.1)`, borderLeft: `3px solid ${c.gilt}` }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c.gilt, display: "block", marginBottom: 8 }}>Next Steps</span>
                      {session.nextSteps.map((s, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginTop: i > 0 ? 6 : 0 }}>
                          <span style={{ fontFamily: font.mono, color: c.gilt, fontSize: 11, marginTop: 1 }}>{i + 1}.</span>
                          <p style={{ fontSize: 13, color: c.chalk, lineHeight: 1.6, margin: 0 }}>{s}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {tips.length > 0 && (
                    <div style={{ padding: "16px 18px", borderRadius: 12, background: "rgba(212,179,127,0.04)", border: `1px solid rgba(212,179,127,0.1)`, borderLeft: `3px solid ${c.gilt}` }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c.gilt, display: "block", marginBottom: 8 }}>Tips</span>
                      {tips.map((s, i) => <p key={i} style={{ fontSize: 13, color: c.chalk, lineHeight: 1.6, margin: i > 0 ? "4px 0 0" : 0 }}>{s}</p>)}
                    </div>
                  )}
                </div>
              );
            })()}
          </Section>
        )}

        {/* ═══ TRANSCRIPT (collapsible) ═══ */}
        {session.transcript && session.transcript.length > 0 && (
          <Section animIndex={4}>
            <div
              onClick={() => setShowTranscript(v => !v)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
              role="button" aria-expanded={showTranscript} tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowTranscript(v => !v); } }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 600, color: c.ivory, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Full Transcript
                <span style={{ fontSize: 11, color: c.stone, fontWeight: 400 }}>({session.transcript.length} messages)</span>
              </h3>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round"
                style={{ transform: showTranscript ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            {showTranscript && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
                {session.transcript.map((msg, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, flexDirection: msg.speaker === "user" ? "row-reverse" : "row" }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                      background: msg.speaker === "ai" ? "rgba(212,179,127,0.08)" : "rgba(122,158,126,0.08)",
                      border: `1px solid ${msg.speaker === "ai" ? "rgba(212,179,127,0.15)" : "rgba(122,158,126,0.15)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {msg.speaker === "ai"
                        ? <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><circle cx="12" cy="12" r="3"/></svg>
                        : <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                    </div>
                    <div style={{ maxWidth: "75%", minWidth: 0 }}>
                      <div style={{
                        padding: "10px 14px", borderRadius: 12, fontSize: 13, color: c.chalk, lineHeight: 1.6,
                        background: msg.speaker === "ai" ? c.obsidian : "rgba(122,158,126,0.03)",
                        border: `1px solid ${msg.speaker === "ai" ? c.border : "rgba(122,158,126,0.08)"}`,
                        borderTopLeftRadius: msg.speaker === "ai" ? 4 : 12,
                        borderTopRightRadius: msg.speaker === "user" ? 4 : 12,
                      }}>
                        {msg.text}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* ═══ FEEDBACK ON AI EVALUATION ═══ */}
        {session.ai_feedback && (
          <div className="sd-anim" style={{ background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`, padding: "18px 28px", marginBottom: 16, animationDelay: "0.4s" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: c.stone }}>
                {feedbackSaved ? "Thanks for your feedback!" : "Was this evaluation helpful?"}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                {(["helpful", "too_harsh", "too_generous", "inaccurate"] as const).map((rating) => {
                  const labels: Record<string, string> = { helpful: "Helpful", too_harsh: "Too harsh", too_generous: "Too generous", inaccurate: "Inaccurate" };
                  const icons: Record<string, string> = { helpful: "👍", too_harsh: "📏", too_generous: "🎉", inaccurate: "🚩" };
                  const isSelected = feedbackRating === rating;
                  return (
                    <button key={rating} onClick={() => { submitFeedback(rating); setShowFeedbackForm(true); }} aria-pressed={isSelected}
                      style={{
                        fontFamily: font.ui, fontSize: 11, fontWeight: 500, padding: "6px 12px",
                        borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                        border: `1px solid ${isSelected ? "rgba(212,179,127,0.3)" : c.border}`,
                        background: isSelected ? "rgba(212,179,127,0.08)" : "transparent",
                        color: isSelected ? c.gilt : c.stone,
                      }}>
                      <span>{icons[rating]}</span>{labels[rating]}
                    </button>
                  );
                })}
              </div>
            </div>
            {showFeedbackForm && feedbackRating && (
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <input type="text" value={feedbackComment} onChange={(e) => setFeedbackComment(e.target.value)}
                  placeholder="Any details? (optional)" maxLength={500}
                  style={{ flex: 1, fontFamily: font.ui, fontSize: 12, color: c.chalk, background: c.obsidian, border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 12px", outline: "none" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(212,179,127,0.3)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = c.border; }}
                  onKeyDown={(e) => { if (e.key === "Enter") submitComment(); }}
                />
                <button onClick={submitComment} style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, padding: "8px 16px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, cursor: "pointer" }}>
                  Save
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══ SESSION COMPARISON ═══ */}
        {prevSession && (
          <Section animIndex={5}>
            <SectionTitle icon={
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            }>vs Previous Session</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { label: "Score", current: session.score, prev: prevSession.score, suffix: "" },
                { label: "Duration", current: Math.ceil(session.duration / 60), prev: Math.ceil(prevSession.duration / 60), suffix: "m" },
                { label: "Questions", current: session.questions, prev: prevSession.questions, suffix: "" },
              ].map((m) => {
                const diff = m.current - m.prev;
                return (
                  <div key={m.label} style={{ padding: "14px", borderRadius: 12, background: c.obsidian, border: `1px solid ${c.border}`, textAlign: "center" }}>
                    <span style={{ fontSize: 10, color: c.stone, display: "block", marginBottom: 4 }}>{m.label}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 600, color: c.ivory, display: "block" }}>{m.current}{m.suffix}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 11, color: diff > 0 ? c.sage : diff < 0 ? c.ember : c.stone, fontWeight: 600 }}>
                      {diff > 0 ? `↑ ${diff}` : diff < 0 ? `↓ ${Math.abs(diff)}` : "—"}{diff !== 0 ? m.suffix : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ═══ WHAT'S NEXT ═══ */}
        {(() => {
          const weakest = skillEntries.length > 0 ? [...skillEntries].sort((a, b) => a.score - b.score)[0] : null;
          const typeRotation = ["behavioral", "case-study", "technical", "strategic", "campus-placement", "hr-round", "management", "government-psu", "teaching"];
          const currentIdx = typeRotation.indexOf(session.type);
          const nextType = typeRotation[(currentIdx + 1) % typeRotation.length] || "behavioral";
          const nextDifficulty = session.score >= 85 ? "intense" : session.score < 70 ? "warmup" : "standard";
          return (
            <div className="sd-anim" style={{ background: `linear-gradient(135deg, rgba(212,179,127,0.05) 0%, ${c.graphite} 100%)`, borderRadius: 16, border: `1px solid rgba(212,179,127,0.1)`, padding: "28px 32px", marginBottom: 16, animationDelay: "0.5s" }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: c.ivory, marginBottom: 8 }}>What's Next?</h3>
              {weakest && (
                <p style={{ fontSize: 13, color: c.stone, lineHeight: 1.5, marginBottom: 16 }}>
                  Your <strong style={{ color: c.chalk }}>{weakest.name}</strong> scored {weakest.score} — focus a session on this to improve fastest.
                </p>
              )}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {weakest && (
                  <button onClick={() => navigate(`/session/new?type=${session.type}&focus=${weakest.name.toLowerCase().replace(/\s+/g, "-")}`)}
                    style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, padding: "10px 22px", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: shadow.sm }}>
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="5,3 19,12 5,21"/></svg>
                    Practice {weakest.name}
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

              {/* Inline upgrade CTA for free users */}
              {user && (!user.subscriptionTier || user.subscriptionTier === "free") && (
                <div style={{ marginTop: 16, padding: "14px 18px", borderRadius: 10, background: "rgba(212,179,127,0.04)", border: `1px solid rgba(212,179,127,0.1)`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <span style={{ fontSize: 12, color: c.stone }}>Unlock unlimited sessions & detailed analytics</span>
                  <button onClick={() => { window.location.href = "/#pricing"; }}
                    style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, padding: "6px 16px", borderRadius: 6, border: `1px solid rgba(212,179,127,0.2)`, background: "transparent", color: c.gilt, cursor: "pointer", whiteSpace: "nowrap" }}>
                    Upgrade
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* Animations & Mobile responsive styles */}
        <style>{`
          @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .sd-anim { opacity: 0; animation: fadeSlideUp 0.5s ease-out forwards; }
          @media (max-width: 768px) {
            .session-detail-outer [style*="gridTemplateColumns: 1fr 1fr"],
            .session-detail-outer [style*="gridTemplateColumns:1fr 1fr"] {
              grid-template-columns: 1fr !important;
            }
            .session-detail-outer [style*="repeat(auto-fit"] {
              grid-template-columns: 1fr 1fr !important;
            }
            .session-detail-outer [style*="maxWidth: 860"] {
              padding-left: 16px !important;
              padding-right: 16px !important;
            }
            .session-detail-outer [style*="padding: \"28px 32px\""],
            .session-detail-card {
              padding: 18px 16px !important;
            }
          }
          @media (max-width: 480px) {
            .session-detail-outer [style*="repeat(auto-fit"] {
              grid-template-columns: 1fr !important;
            }
            .session-detail-outer [style*="gridTemplateColumns: 1fr 1fr 1fr"],
            .session-detail-outer [style*="gridTemplateColumns:1fr 1fr 1fr"] {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
