import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  computeFallbackScores,
  processLLMEvaluation,
  loadPreviousScores,
  extractNegotiationFacts,
  type TranscriptEntry,
} from "../interviewEvaluation";

function makeTranscript(userTexts: string[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  for (const text of userTexts) {
    entries.push({ speaker: "ai", text: "Question?", time: "00:00" });
    entries.push({ speaker: "user", text, time: "00:01" });
  }
  return entries;
}

describe("computeFallbackScores", () => {
  it("returns a score in [60, 98] for answered interviews", () => {
    const transcript = makeTranscript([
      "I led a project that reduced latency by 30% across our infrastructure.",
    ]);
    const result = computeFallbackScores({
      transcript,
      currentStep: 3,
      scriptLength: 5,
      difficulty: "standard",
      elapsed: 200,
    });
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.score).toBeLessThanOrEqual(98);
    expect(result.hasAnyAnswers).toBe(true);
  });

  it("caps score at 30 when there are no real answers", () => {
    const transcript: TranscriptEntry[] = [
      { speaker: "ai", text: "Tell me about yourself", time: "00:00" },
      { speaker: "user", text: "[skipped]", time: "00:01" },
    ];
    const result = computeFallbackScores({
      transcript,
      currentStep: 1,
      scriptLength: 5,
      difficulty: "standard",
      elapsed: 60,
    });
    expect(result.hasAnyAnswers).toBe(false);
    expect(result.score).toBeLessThanOrEqual(30);
  });

  it("gives difficulty bonus for intense", () => {
    const transcript = makeTranscript(["I built a system handling 1M users daily."]);
    const base = computeFallbackScores({
      transcript, currentStep: 3, scriptLength: 5, difficulty: "standard", elapsed: 200,
    });
    const intense = computeFallbackScores({
      transcript, currentStep: 3, scriptLength: 5, difficulty: "intense", elapsed: 200,
    });
    expect(intense.score).toBeGreaterThanOrEqual(base.score);
  });

  it("gives time bonus for longer interviews", () => {
    const transcript = makeTranscript(["I designed the architecture for our microservices."]);
    const short = computeFallbackScores({
      transcript, currentStep: 3, scriptLength: 5, difficulty: "standard", elapsed: 60,
    });
    const long = computeFallbackScores({
      transcript, currentStep: 3, scriptLength: 5, difficulty: "standard", elapsed: 400,
    });
    expect(long.score).toBeGreaterThanOrEqual(short.score);
  });

  it("returns seven skill categories", () => {
    const transcript = makeTranscript(["I improved our CI pipeline."]);
    const result = computeFallbackScores({
      transcript, currentStep: 2, scriptLength: 5, difficulty: "standard", elapsed: 150,
    });
    expect(Object.keys(result.skillScores)).toEqual(
      expect.arrayContaining([
        "communication", "structure", "technicalDepth", "leadership",
        "problemSolving", "confidence", "specificity",
      ]),
    );
    for (const v of Object.values(result.skillScores)) {
      expect(v).toBeGreaterThanOrEqual(40);
      expect(v).toBeLessThanOrEqual(95);
    }
  });

  it("boosts specificity when metrics are present", () => {
    const withMetrics = makeTranscript(["I reduced load time by 40% for 10000 users."]);
    const without = makeTranscript(["I reduced load time significantly for many users in our app."]);
    const r1 = computeFallbackScores({
      transcript: withMetrics, currentStep: 3, scriptLength: 5, difficulty: "standard", elapsed: 200,
    });
    const r2 = computeFallbackScores({
      transcript: without, currentStep: 3, scriptLength: 5, difficulty: "standard", elapsed: 200,
    });
    expect(r1.skillScores.specificity).toBeGreaterThan(r2.skillScores.specificity);
  });

  it("handles empty transcript", () => {
    const result = computeFallbackScores({
      transcript: [], currentStep: 0, scriptLength: 5, difficulty: "standard", elapsed: 0,
    });
    expect(result.hasAnyAnswers).toBe(false);
    expect(result.score).toBeLessThanOrEqual(30);
  });
});

describe("processLLMEvaluation", () => {
  it("extracts score and clamps to [0, 100]", () => {
    const r = processLLMEvaluation({ overallScore: 150, feedback: "Great" }, 70);
    expect(r.score).toBe(100);

    const r2 = processLLMEvaluation({ overallScore: -10, feedback: "Poor" }, 70);
    expect(r2.score).toBe(0);
  });

  it("falls back to fallbackScore when overallScore missing", () => {
    const r = processLLMEvaluation({ feedback: "Decent" }, 72);
    expect(r.score).toBe(72);
  });

  it("extracts feedback string", () => {
    const r = processLLMEvaluation({ overallScore: 80, feedback: "Well done" }, 70);
    expect(r.feedback).toBe("Well done");
  });

  it("defaults feedback to empty string", () => {
    const r = processLLMEvaluation({ overallScore: 80 }, 70);
    expect(r.feedback).toBe("");
  });

  it("extracts skillScores from raw numbers", () => {
    const r = processLLMEvaluation({
      overallScore: 80,
      skillScores: { communication: 85, structure: 70 },
    }, 70);
    expect(r.skillScores).toEqual({ communication: 85, structure: 70 });
  });

  it("extracts skillScores from {score: N} objects", () => {
    const r = processLLMEvaluation({
      overallScore: 80,
      skillScores: { communication: { score: 85, detail: "good" }, structure: 70 },
    }, 70);
    expect(r.skillScores).toEqual({ communication: 85, structure: 70 });
  });

  it("returns empty skillScores when missing", () => {
    const r = processLLMEvaluation({ overallScore: 80 }, 70);
    expect(r.skillScores).toEqual({});
  });

  it("extracts idealAnswers array", () => {
    const ideal = [{ question: "Q1", ideal: "A1", candidateSummary: "C1" }];
    const r = processLLMEvaluation({ overallScore: 80, idealAnswers: ideal }, 70);
    expect(r.idealAnswers).toEqual(ideal);
  });

  it("returns empty idealAnswers when not an array", () => {
    const r = processLLMEvaluation({ overallScore: 80, idealAnswers: "nope" }, 70);
    expect(r.idealAnswers).toEqual([]);
  });

  it("passes through optional fields when present", () => {
    const r = processLLMEvaluation({
      overallScore: 85,
      starAnalysis: { overall: 4, breakdown: { situation: 4 }, tip: "Be specific" },
      strengths: ["Clear communication"],
      improvements: ["Add metrics"],
      nextSteps: ["Practice STAR"],
    }, 70);
    expect(r.starAnalysis).toBeDefined();
    expect(r.strengths).toEqual(["Clear communication"]);
    expect(r.improvements).toEqual(["Add metrics"]);
    expect(r.nextSteps).toEqual(["Practice STAR"]);
  });

  it("omits optional fields when absent", () => {
    const r = processLLMEvaluation({ overallScore: 80 }, 70);
    expect(r.starAnalysis).toBeUndefined();
    expect(r.strengths).toBeUndefined();
    expect(r.improvements).toBeUndefined();
    expect(r.nextSteps).toBeUndefined();
  });
});

describe("loadPreviousScores", () => {
  const store: Record<string, string> = {};
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => { store[key] = val; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    });
  });

  it("returns null when no data in localStorage", () => {
    expect(loadPreviousScores()).toBeNull();
  });

  it("returns null for empty array", () => {
    localStorage.setItem("hirestepx_sessions", "[]");
    expect(loadPreviousScores()).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    localStorage.setItem("hirestepx_sessions", "not json");
    expect(loadPreviousScores()).toBeNull();
  });

  it("returns null when first session has no score", () => {
    localStorage.setItem("hirestepx_sessions", JSON.stringify([{ skill_scores: {} }]));
    expect(loadPreviousScores()).toBeNull();
  });

  it("returns null when first session has no skill_scores", () => {
    localStorage.setItem("hirestepx_sessions", JSON.stringify([{ score: 80 }]));
    expect(loadPreviousScores()).toBeNull();
  });

  it("extracts scores from raw numbers", () => {
    localStorage.setItem("hirestepx_sessions", JSON.stringify([
      { score: 82, skill_scores: { communication: 85, structure: 70 } },
    ]));
    const result = loadPreviousScores();
    expect(result).toEqual({ overall: 82, skills: { communication: 85, structure: 70 } });
  });

  it("extracts scores from {score: N} objects", () => {
    localStorage.setItem("hirestepx_sessions", JSON.stringify([
      { score: 75, skill_scores: { communication: { score: 80 }, leadership: 60 } },
    ]));
    const result = loadPreviousScores();
    expect(result).toEqual({ overall: 75, skills: { communication: 80, leadership: 60 } });
  });

  it("defaults non-numeric and non-object values to 0", () => {
    localStorage.setItem("hirestepx_sessions", JSON.stringify([
      { score: 70, skill_scores: { communication: "high", structure: null } },
    ]));
    const result = loadPreviousScores();
    expect(result).toEqual({ overall: 70, skills: { communication: 0, structure: 0 } });
  });
});

describe("extractNegotiationFacts", () => {
  it("detects immediate acceptance", () => {
    const transcript = makeTranscript(["I accept the offer."]);
    const facts = extractNegotiationFacts(transcript);
    expect(facts.acceptedImmediately).toBe(true);
    expect(facts.rejectedOutright).toBe(false);
  });

  it("detects outright rejection", () => {
    const transcript = makeTranscript(["That's way too low, absolutely not."]);
    const facts = extractNegotiationFacts(transcript);
    expect(facts.rejectedOutright).toBe(true);
  });

  it("extracts candidate counter number", () => {
    const transcript = makeTranscript(["I was hoping for around 35 LPA."]);
    const facts = extractNegotiationFacts(transcript);
    expect(facts.candidateCounter).toBe("₹35 LPA");
  });

  it("extracts current CTC", () => {
    const transcript = makeTranscript(["I'm currently earning ₹28 LPA at my current job."]);
    const facts = extractNegotiationFacts(transcript);
    expect(facts.candidateCurrentCTC).toBe("₹28 LPA");
  });

  it("detects competing offers", () => {
    const transcript = makeTranscript(["I have another company offering a better package."]);
    const facts = extractNegotiationFacts(transcript);
    expect(facts.hasCompetingOffers).toBe(true);
  });

  it("extracts topics raised by candidate", () => {
    const transcript = makeTranscript([
      "Can you tell me about the health insurance and remote work policy?",
      "I'm also interested in the ESOP vesting schedule.",
    ]);
    const facts = extractNegotiationFacts(transcript);
    expect(facts.topicsRaised).toContain("health insurance");
    expect(facts.topicsRaised).toContain("remote/flexibility");
    expect(facts.topicsRaised).toContain("equity/ESOPs");
  });

  it("detects number deflection", () => {
    const transcript = makeTranscript(["I don't want to share my current CTC. Please tell me your offer."]);
    const facts = extractNegotiationFacts(transcript);
    expect(facts.deflectedNumbers).toBe(true);
    expect(facts.candidateCounter).toBeNull();
  });

  it("handles empty transcript", () => {
    const facts = extractNegotiationFacts([]);
    expect(facts.acceptedImmediately).toBe(false);
    expect(facts.candidateCounter).toBeNull();
    expect(facts.topicsRaised).toEqual([]);
  });
});
