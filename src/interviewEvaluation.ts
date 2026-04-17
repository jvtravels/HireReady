/* ─── Interview Evaluation Helpers ─── */
/* Pure functions for computing fallback scores and processing LLM evaluation results.
   Extracted from useInterviewEngine handleEnd(). */

export interface TranscriptEntry {
  speaker: "ai" | "user";
  text: string;
  time: string;
}

export interface FallbackResult {
  score: number;
  skillScores: Record<string, number>;
  hasAnyAnswers: boolean;
}

export interface EvalParams {
  transcript: TranscriptEntry[];
  currentStep: number;
  scriptLength: number;
  difficulty: string;
  elapsed: number;
}

/** Compute heuristic fallback scores when LLM evaluation is unavailable */
export function computeFallbackScores(params: EvalParams): FallbackResult {
  const { transcript, currentStep, scriptLength, difficulty, elapsed } = params;
  const completionRatio = currentStep / Math.max(1, scriptLength);
  const baseScore = 65 + Math.round(completionRatio * 20);
  const difficultyBonus = difficulty === "intense" ? 5 : difficulty === "warmup" ? -3 : 0;
  const timeBonus = elapsed > 300 ? 5 : elapsed > 120 ? 3 : 0;
  const questionBonus = Math.min(5, Math.floor(transcript.filter(t => t.speaker === "user").length * 1.5));
  const fallbackScore = Math.min(98, Math.max(60, baseScore + difficultyBonus + timeBonus + questionBonus));

  const hasAnyAnswers = transcript.some(
    t => t.speaker === "user" && t.text.length > 10 && !/^\[.*\]$/.test(t.text.trim()),
  );
  const score = hasAnyAnswers ? fallbackScore : Math.min(30, fallbackScore);

  const userAnswers = transcript.filter(t => t.speaker === "user");
  const avgAnswerLen = userAnswers.length > 0
    ? userAnswers.reduce((s, t) => s + t.text.length, 0) / userAnswers.length : 0;
  const hasMetrics = userAnswers.some(t =>
    /\d+%|\d+x|\$[\d,]+|\d+ (users|customers|months|days|hours|team|people)/.test(t.text));
  const usesI = userAnswers.some(t => /\bI\b/.test(t.text));
  const fillerCount = userAnswers.reduce((s, t) =>
    s + (t.text.match(/\b(um|uh|like|basically|actually|you know)\b/gi) || []).length, 0);

  const structureScore = Math.min(100, fallbackScore + (avgAnswerLen > 200 ? 5 : -5) + (hasMetrics ? 8 : -3));
  const commScore = Math.min(100, fallbackScore + (fillerCount < 3 ? 5 : -5) + (avgAnswerLen > 100 ? 3 : -5));

  const clamp = (v: number) => Math.max(40, Math.min(95, v));
  const skillScores: Record<string, number> = {
    communication: clamp(commScore),
    structure: clamp(structureScore),
    technicalDepth: clamp(fallbackScore + (avgAnswerLen > 300 ? 5 : -5)),
    leadership: clamp(fallbackScore + (usesI ? 3 : -5)),
    problemSolving: clamp(fallbackScore),
    confidence: clamp(fallbackScore + (fillerCount < 2 ? 5 : -8)),
    specificity: clamp(fallbackScore + (hasMetrics ? 10 : -10)),
  };

  return { score, skillScores, hasAnyAnswers };
}

/** Load previous session scores from localStorage for delta-aware feedback */
export function loadPreviousScores(): { overall: number; skills: Record<string, number> } | null {
  try {
    const raw = localStorage.getItem("hirestepx_sessions");
    if (!raw) return null;
    const sessions = JSON.parse(raw);
    if (!Array.isArray(sessions) || sessions.length === 0) return null;
    const prev = sessions[0];
    if (!prev.score || !prev.skill_scores) return null;
    const skills: Record<string, number> = {};
    for (const [k, v] of Object.entries(prev.skill_scores)) {
      skills[k] = typeof v === "number" ? v
        : typeof v === "object" && v !== null && "score" in (v as Record<string, unknown>)
          ? (v as { score: number }).score : 0;
    }
    return { overall: prev.score, skills };
  } catch {
    return null;
  }
}

export interface IdealAnswer {
  question: string;
  ideal: string;
  candidateSummary: string;
  rating?: string;
  starBreakdown?: Record<string, string>;
  workedWell?: string;
  toImprove?: string;
}

export interface ProcessedEvaluation {
  score: number;
  feedback: string;
  skillScores: Record<string, number>;
  idealAnswers: IdealAnswer[];
  starAnalysis?: { overall: number; breakdown: Record<string, number>; tip: string };
  strengths?: string[];
  improvements?: string[];
  nextSteps?: string[];
}

/** Extract numeric score from LLM skill score field (handles both {score: N} objects and raw numbers) */
function extractScore(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "score" in (v as Record<string, unknown>)) {
    return (v as { score: number }).score;
  }
  return 0;
}

/** Process a successful LLM evaluation response into structured result */
export function processLLMEvaluation(
  evaluation: Record<string, unknown>,
  fallbackScore: number,
): ProcessedEvaluation {
  const score = Math.min(100, Math.max(0, (evaluation.overallScore as number) || fallbackScore));
  const feedback = (evaluation.feedback as string) || "";
  const skillScores = evaluation.skillScores && typeof evaluation.skillScores === "object"
    ? Object.fromEntries(Object.entries(evaluation.skillScores as Record<string, unknown>).map(([k, v]) => [k, extractScore(v)]))
    : {};
  const idealAnswers = Array.isArray(evaluation.idealAnswers) ? evaluation.idealAnswers as IdealAnswer[] : [];

  const result: ProcessedEvaluation = { score, feedback, skillScores, idealAnswers };

  if (evaluation.starAnalysis && typeof evaluation.starAnalysis === "object") {
    result.starAnalysis = evaluation.starAnalysis as ProcessedEvaluation["starAnalysis"];
  }
  if (Array.isArray(evaluation.strengths)) result.strengths = evaluation.strengths as string[];
  if (Array.isArray(evaluation.improvements)) result.improvements = evaluation.improvements as string[];
  if (Array.isArray(evaluation.nextSteps)) result.nextSteps = evaluation.nextSteps as string[];

  return result;
}

/* ─── Salary Negotiation Fact Extraction ─── */
/* Scans transcript to extract structured key facts for salary negotiation context.
   These facts anchor the LLM so it references real numbers instead of hallucinating. */

export interface NegotiationFacts {
  /** Whether the candidate accepted the offer outright */
  acceptedImmediately: boolean;
  /** Whether the candidate rejected the offer outright */
  rejectedOutright: boolean;
  /** CTC/salary number the candidate mentioned (e.g., "25 LPA") */
  candidateCounter: string | null;
  /** Current CTC the candidate disclosed */
  candidateCurrentCTC: string | null;
  /** Whether the candidate mentioned competing offers */
  hasCompetingOffers: boolean;
  /** Specific benefits/topics the candidate asked about */
  topicsRaised: string[];
  /** Whether the candidate deflected/refused to share numbers */
  deflectedNumbers: boolean;
}

export function extractNegotiationFacts(transcript: TranscriptEntry[]): NegotiationFacts {
  const userAnswers = transcript.filter(t => t.speaker === "user").map(t => t.text);
  const allText = userAnswers.join(" ");

  const acceptedImmediately = userAnswers.some(a =>
    /(?:i accept|sounds good|that works|deal|i.?m happy|fine with me|yes.*accept)/i.test(a) &&
    a.trim().split(/\s+/).length < 25,
  );

  const rejectedOutright = userAnswers.some(a =>
    /(?:way too low|not interested|can'?t accept|absolutely not|that'?s insulting|no way)/i.test(a),
  );

  // Extract salary numbers: distinguish "current CTC" from "expected/counter" numbers
  // Strategy: first extract current CTC with context patterns, then treat remaining numbers as counter
  const ctcPatterns = /(?:current(?:ly)?|earning|getting|drawing|my ctc|i.?m at|making|take home)\s*(?:is\s*)?₹?\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakh|lakhs|l\b)/gi;
  const ctcNumbers = new Set<string>();
  let ctcExec: RegExpExecArray | null;
  while ((ctcExec = ctcPatterns.exec(allText)) !== null) {
    ctcNumbers.add(ctcExec[1]);
  }
  const candidateCurrentCTC = ctcNumbers.size > 0 ? `₹${[...ctcNumbers][ctcNumbers.size - 1]} LPA` : null;

  // Extract ALL salary numbers, then pick the highest non-CTC number as the counter
  // (candidate's expectation/ask is typically the highest number they mention, excluding current CTC)
  const salaryRe = /₹?\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakh|lakhs|l\b)/gi;
  const allSalaryMatches: string[] = [];
  let salaryMatch: RegExpExecArray | null;
  while ((salaryMatch = salaryRe.exec(allText)) !== null) {
    allSalaryMatches.push(salaryMatch[1]);
  }
  // Filter out numbers that matched as current CTC, then take the MAX as counter
  const counterNumbers = allSalaryMatches.filter(n => !ctcNumbers.has(n));
  const candidateCounter = counterNumbers.length > 0
    ? `₹${counterNumbers.reduce((max, n) => parseFloat(n) > parseFloat(max) ? n : max)} LPA`
    : (allSalaryMatches.length > 0 ? `₹${allSalaryMatches[allSalaryMatches.length - 1]} LPA` : null);

  const hasCompetingOffers = /(?:other offer|competing|another company|counter.?offer|multiple offers)/i.test(allText);

  // Detect specific topics the candidate raised
  const topicsRaised: string[] = [];
  if (/(?:health|medical|insurance)/i.test(allText)) topicsRaised.push("health insurance");
  if (/(?:esop|equity|stock|rsu|vest)/i.test(allText)) topicsRaised.push("equity/ESOPs");
  if (/(?:remote|wfh|work from home|hybrid|flexible|flexibility)/i.test(allText)) topicsRaised.push("remote/flexibility");
  if (/(?:learning|training|budget|upskill|course)/i.test(allText)) topicsRaised.push("learning budget");
  if (/(?:notice|joining|start date|notice period)/i.test(allText)) topicsRaised.push("notice period/joining");
  if (/(?:relocation|relocat|moving|shift)/i.test(allText)) topicsRaised.push("relocation");
  if (/(?:bonus|joining bonus|sign.?on)/i.test(allText)) topicsRaised.push("joining bonus");
  if (/(?:growth|promotion|career|path)/i.test(allText)) topicsRaised.push("career growth");

  const deflectedNumbers = userAnswers.some(a =>
    /(?:don'?t want to|prefer not|rather not|you first|your offer|what.*you.*offer|tell me.*offer)/i.test(a) &&
    allSalaryMatches.length === 0,
  );

  return {
    acceptedImmediately,
    rejectedOutright,
    candidateCounter,
    candidateCurrentCTC,
    hasCompetingOffers,
    topicsRaised,
    deflectedNumbers,
  };
}
