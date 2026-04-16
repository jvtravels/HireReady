import { describe, it, expect } from "vitest";
import {
  getMiniScript,
  getScript,
  scriptsByType,
} from "../../src/interviewScripts";

const ALL_MINI_TYPES = [
  "behavioral",
  "hr-round",
  "campus-placement",
  "strategic",
  "technical",
  "case-study",
  "management",
  "panel",
  "salary-negotiation",
  "government-psu",
] as const;

const ALL_SCRIPT_TYPES = Object.keys(scriptsByType);

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    name: "Jane Doe",
    targetRole: "Software Engineer",
    targetCompany: "Acme Corp",
    industry: "fintech",
    resumeFileName: undefined as string | undefined,
    resumeData: undefined as
      | { experience?: { title: string; company?: string }[] }
      | undefined,
    learningStyle: undefined as string | undefined,
    ...overrides,
  };
}

/* ────────────────────────── getMiniScript ────────────────────────── */

describe("getMiniScript", () => {
  it.each(ALL_MINI_TYPES)(
    "returns correct steps (intro, questions, closing) for type=%s",
    (type) => {
      const steps = getMiniScript(null, undefined, type);
      // Salary-negotiation gets 5 questions (longer arc), others get 3
      const expectedQuestions = type === "salary-negotiation" ? 5 : 3;
      expect(steps).toHaveLength(expectedQuestions + 2); // +2 for intro + closing
      expect(steps[0].type).toBe("intro");
      for (let i = 1; i <= expectedQuestions; i++) {
        expect(steps[i].type).toBe("question");
      }
      expect(steps[steps.length - 1].type).toBe("closing");
    },
  );

  it("returns different questions for different types", () => {
    const behavioralQs = getMiniScript(null, undefined, "behavioral").map(
      (s) => s.aiText,
    );
    const technicalQs = getMiniScript(null, undefined, "technical").map(
      (s) => s.aiText,
    );
    // At least the question steps should differ
    expect(behavioralQs[1]).not.toBe(technicalQs[1]);
  });

  it("fills in {title} and {role} placeholders when user has resume data", () => {
    const user = makeUser({
      resumeFileName: "resume.pdf",
      resumeData: {
        experience: [{ title: "Senior Engineer", company: "BigCo" }],
      },
    });
    const steps = getMiniScript(user, undefined, "behavioral");
    const allText = steps.map((s) => s.aiText).join(" ");
    expect(allText).toContain("Senior Engineer");
    expect(allText).toContain("Software Engineer"); // targetRole
    expect(allText).not.toContain("{title}");
    expect(allText).not.toContain("{role}");
  });

  it("falls back to behavioral for unknown interview type", () => {
    const unknownSteps = getMiniScript(null, undefined, "nonexistent-type");
    // Should still have 5 steps (intro + 3q + closing)
    expect(unknownSteps).toHaveLength(5);
    expect(unknownSteps[0].type).toBe("intro");
    expect(unknownSteps[4].type).toBe("closing");
    // Questions should come from behavioral pool (randomized, so just check they exist)
    expect(unknownSteps[1].type).toBe("question");
    expect(unknownSteps[1].aiText.length).toBeGreaterThan(10);
  });

  it("includes user name and company in intro", () => {
    const user = makeUser();
    const steps = getMiniScript(user, "Google", "behavioral");
    expect(steps[0].aiText).toContain("Jane");
    expect(steps[0].aiText).toContain("Google");
  });

  it("all question steps have scoreNote", () => {
    for (const type of ALL_MINI_TYPES) {
      const steps = getMiniScript(null, undefined, type);
      const questions = steps.filter((s) => s.type === "question");
      for (const q of questions) {
        expect(q.scoreNote).toBeDefined();
        expect(q.scoreNote!.length).toBeGreaterThan(0);
      }
    }
  });
});

/* ────────────────────────── scriptsByType ────────────────────────── */

describe("scriptsByType", () => {
  const EXPECTED_TYPES = [
    "behavioral",
    "strategic",
    "technical",
    "case-study",
    "campus-placement",
    "hr-round",
    "management",
    "government-psu",
    "teaching",
    "panel",
    "salary-negotiation",
  ];

  it("has entries for all expected types", () => {
    for (const type of EXPECTED_TYPES) {
      expect(scriptsByType).toHaveProperty(type);
      expect(scriptsByType[type].length).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(ALL_SCRIPT_TYPES)(
    "script %s starts with intro and ends with closing",
    (type) => {
      const script = scriptsByType[type];
      expect(script[0].type).toBe("intro");
      expect(script[script.length - 1].type).toBe("closing");
    },
  );

  it.each(ALL_SCRIPT_TYPES)(
    "all questions in script %s have scoreNote",
    (type) => {
      const questions = scriptsByType[type].filter(
        (s) => s.type === "question",
      );
      expect(questions.length).toBeGreaterThan(0);
      for (const q of questions) {
        expect(q.scoreNote).toBeDefined();
        expect(q.scoreNote!.length).toBeGreaterThan(0);
      }
    },
  );
});

/* ────────────────────────── getScript ────────────────────────── */

describe("getScript", () => {
  it("returns correct script for each type", () => {
    for (const type of ALL_SCRIPT_TYPES) {
      const script = getScript(type, null, null);
      // intro + up to 5 randomized questions + closing (at least 5 steps)
      expect(script.length).toBeGreaterThanOrEqual(5);
      // First step should be intro, last should be closing
      expect(script[0].type).toBe("intro");
      expect(script[script.length - 1].type).toBe("closing");
    }
  });

  it("falls back to behavioral for null/unknown type", () => {
    const nullScript = getScript(null, null, null);
    const unknownScript = getScript("nonexistent", null, null);
    // Both should have same structure (intro + questions + closing)
    expect(nullScript.length).toBe(unknownScript.length);
    expect(nullScript[0].type).toBe("intro");
    expect(unknownScript[0].type).toBe("intro");
  });

  it("applies warmup difficulty (slower durations)", () => {
    const normal = getScript("behavioral", null, null);
    const warmup = getScript("behavioral", "warmup", null);
    // warmup speaking = normal * 1.4, thinking = normal * 1.5
    for (let i = 0; i < normal.length; i++) {
      expect(warmup[i].speakingDuration).toBeGreaterThan(
        normal[i].speakingDuration,
      );
      expect(warmup[i].thinkingDuration).toBeGreaterThan(
        normal[i].thinkingDuration,
      );
    }
  });

  it("applies intense difficulty (faster durations)", () => {
    const normal = getScript("behavioral", null, null);
    const intense = getScript("behavioral", "intense", null);
    // intense speaking = normal * 0.6, thinking = normal * 0.5
    for (let i = 0; i < normal.length; i++) {
      expect(intense[i].speakingDuration).toBeLessThan(
        normal[i].speakingDuration,
      );
      expect(intense[i].thinkingDuration).toBeLessThan(
        normal[i].thinkingDuration,
      );
    }
  });

  it("personalizes intro with user name and company", () => {
    const user = makeUser();
    const script = getScript("behavioral", null, user);
    expect(script[0].aiText).toContain("Jane");
    expect(script[0].aiText).toContain("Acme Corp");
    expect(script[0].aiText).toContain("fintech");
  });

  it("includes resume context when user has resume", () => {
    const user = makeUser({ resumeFileName: "resume.pdf" });
    const script = getScript("behavioral", null, user);
    expect(script[0].aiText).toContain("resume");
  });

  it("uses encouraging closing for encouraging learning style", () => {
    const user = makeUser({ learningStyle: "encouraging" });
    const script = getScript("behavioral", null, user);
    const closing = script[script.length - 1];
    expect(closing.aiText).toContain("Really great work");
  });

  it("uses direct closing by default", () => {
    const user = makeUser({ learningStyle: "direct" });
    const script = getScript("behavioral", null, user);
    const closing = script[script.length - 1];
    expect(closing.aiText).toContain("direct feedback");
  });

  it("mentions company in closing when provided", () => {
    const user = makeUser();
    const script = getScript("behavioral", null, user);
    const closing = script[script.length - 1];
    expect(closing.aiText).toContain("Acme Corp");
  });
});
