import { c } from "./tokens";

export const RESULTS_KEY = "hirestepx_sessions";

/* ─── Skill score helpers ─── */
export type SkillScoreValue = number | { score: number; reason?: string };
export function extractScore(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "object" && raw !== null && "score" in raw) return (raw as SkillScoreValue & { score: number }).score;
  return 0;
}
export function extractReason(raw: unknown): string {
  if (typeof raw === "object" && raw !== null && "reason" in raw) return (raw as { reason?: string }).reason || "";
  return "";
}

/* ─── Helpers ─── */

export function scoreLabelColor(score: number) {
  if (score >= 85) return c.sage;
  if (score >= 75) return c.gilt;
  return c.ember;
}

export function scoreLabel(score: number) {
  if (score >= 85) return "Strong";
  if (score >= 75) return "Good";
  return "Needs work";
}

export function scoreTip(score: number) {
  if (score >= 85) return "Strong: Interview-ready performance";
  if (score >= 75) return "Good: Solid foundation, minor areas to refine";
  return "Needs work: Key areas need practice before interviews";
}

export function normalizeType(type: string): string {
  const map: Record<string, string> = {
    behavioral: "Behavioral", strategic: "Strategic",
    "technical-leadership": "Technical Leadership", "case-study": "Case Study",
    technical: "Technical", case: "Case Study",
    "campus-placement": "Campus Placement", "hr-round": "HR Round",
    management: "Management", "government-psu": "Government & PSU",
    teaching: "Teaching", "salary-negotiation": "Salary Negotiation",
    panel: "Panel Interview",
  };
  return map[type] || type;
}

export function ratingBadge(rating: string | undefined): { label: string; color: string; bg: string } {
  switch (rating) {
    case "strong": return { label: "Strong", color: c.sage, bg: "rgba(122,158,126,0.1)" };
    case "good": return { label: "Good", color: c.gilt, bg: "rgba(212,179,127,0.1)" };
    case "partial": return { label: "Partial", color: "#E89B5A", bg: "rgba(232,155,90,0.1)" };
    case "weak": return { label: "Weak", color: c.ember, bg: "rgba(196,112,90,0.1)" };
    default: return { label: "Reviewed", color: c.stone, bg: "rgba(142,137,131,0.1)" };
  }
}

/* ─── Speech metrics computed from transcript ─── */

export const FILLER_WORDS = ["um", "uh", "like", "you know", "basically", "actually", "literally", "right", "so", "well", "i mean", "kind of", "sort of"];
export const HEDGING_PHRASES = ["i think", "i guess", "maybe", "probably", "i believe", "perhaps", "not sure", "i suppose", "might be", "could be"];
export const POWER_WORDS = ["achieved", "led", "built", "delivered", "increased", "reduced", "launched", "drove", "improved", "designed", "implemented", "scaled", "optimized", "managed", "created", "transformed"];

// Pre-compiled regexes to avoid recompilation on every render
export const FILLER_REGEXES = FILLER_WORDS.map(w => ({ word: w, regex: new RegExp(`\\b${w}\\b`, "gi") }));
export const HEDGING_REGEXES = HEDGING_PHRASES.map(p => ({ phrase: p, regex: new RegExp(`\\b${p}\\b`, "gi") }));
export const POWER_REGEXES = POWER_WORDS.map(w => ({ word: w, regex: new RegExp(`\\b${w}\\w*\\b`, "gi") }));

export function computeSpeechMetrics(transcript: { speaker: string; text: string; time?: string }[] | undefined, durationSec: number) {
  if (!transcript || transcript.length === 0) return null;
  const userEntries = transcript.filter(t => t.speaker === "user");
  if (userEntries.length === 0) return null;

  const userText = userEntries.map(t => t.text).join(" ");
  const words = userText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const userMinutes = Math.max(1, durationSec / 60 * 0.5); // ~50% of time is user speaking

  // Filler words
  let fillerCount = 0;
  for (const { regex } of FILLER_REGEXES) {
    regex.lastIndex = 0;
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
  for (const { word, regex } of FILLER_REGEXES) {
    regex.lastIndex = 0;
    const matches = userText.match(regex);
    if (matches && matches.length > 0) fillerBreakdown.push({ word, count: matches.length });
  }
  fillerBreakdown.sort((a, b) => b.count - a.count);

  // Hedging language detection
  let hedgingCount = 0;
  const hedgingBreakdown: { phrase: string; count: number }[] = [];
  for (const { phrase, regex } of HEDGING_REGEXES) {
    regex.lastIndex = 0;
    const matches = userText.match(regex);
    if (matches && matches.length > 0) {
      hedgingCount += matches.length;
      hedgingBreakdown.push({ phrase, count: matches.length });
    }
  }
  hedgingBreakdown.sort((a, b) => b.count - a.count);

  // Power words / action verbs count
  let powerWordCount = 0;
  for (const { regex } of POWER_REGEXES) {
    regex.lastIndex = 0;
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

/* ─── Types ─── */

export interface IdealAnswer {
  question: string;
  ideal: string;
  candidateSummary: string;
  rating?: string;
  workedWell?: string;
  toImprove?: string;
  starBreakdown?: Record<string, string>;
}

export interface LocalSession {
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
  jobDescription?: string;
  jdAnalysis?: {
    matchScore: number;
    matchLabel: string;
    matchedSkills: string[];
    missingSkills: string[];
    interviewTips: string[];
    suggestedFocus: string;
  } | null;
}

/* ─── Compute historical averages from localStorage for benchmarking ─── */
export function computeHistoricalAverages(): { avgScore: number; avgSkills: Record<string, number>; count: number } | null {
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
        const score = extractScore(raw);
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

export function loadLocalSession(id: string): LocalSession | null {
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    if (!raw) return null;
    const sessions: LocalSession[] = JSON.parse(raw);
    return sessions.find(s => s.id === id) || null;
  } catch { return null; }
}

export function loadPreviousSession(currentId: string): LocalSession | null {
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    if (!raw) return null;
    const sessions: LocalSession[] = JSON.parse(raw);
    const sorted = [...sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const idx = sorted.findIndex(s => s.id === currentId);
    return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
  } catch { return null; }
}
